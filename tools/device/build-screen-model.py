#!/usr/bin/env python3
"""Build a compact nearest-template model for fnaf-screencheck.

Sources are LABEL=FILE or LABEL=DIRECTORY. Directories are scanned recursively
for Android raw screencaps (.raw) and PNGs. Game frames/models remain local and
gitignored; this repository contains no game assets.
"""

import argparse
import collections
import pathlib
import re
import struct
import sys


MODEL_HEADER = struct.Struct("<4s7H6B2HI")
MODEL_HEADER_SIZE = 32
LABEL_SIZE = 16
MAX_TEMPLATES = 64
MAX_GRID_CELLS = 256
LABEL_RE = re.compile(r"^[A-Za-z0-9_-]{1,15}$")
IMAGE_SUFFIXES = {".png", ".raw"}


def comma_tuple(text, count, name):
    try:
        values = tuple(int(value) for value in text.split(","))
    except ValueError as error:
        raise argparse.ArgumentTypeError(f"{name} must contain integers") from error
    if len(values) != count:
        raise argparse.ArgumentTypeError(f"{name} needs {count} comma-separated integers")
    return values


def roi_value(text):
    return comma_tuple(text, 4, "ROI")


def grid_value(text):
    values = comma_tuple(text.lower().replace("x", ","), 2, "grid")
    if min(values) < 1 or values[0] * values[1] > MAX_GRID_CELLS:
        raise argparse.ArgumentTypeError("grid must have 1..256 total cells")
    return values


def raw_screencap(path):
    data = path.read_bytes()
    if len(data) < 16:
        raise ValueError("truncated raw screencap header")
    width, height, pixel_format, _ = struct.unpack_from("<IIII", data)
    if not width or not height or pixel_format not in (1, 2):
        raise ValueError("expected Android RGBA8888/RGBX8888 screencap")
    required = 16 + width * height * 4
    if len(data) < required:
        raise ValueError(f"truncated raw screencap ({len(data)} < {required} bytes)")
    return width, height, memoryview(data)[16:required]


def png_image(path):
    try:
        from PIL import Image
    except ImportError as error:
        raise ValueError("PNG input requires Pillow; raw screencaps do not") from error
    image = Image.open(path).convert("RGBA")
    return image.width, image.height, memoryview(image.tobytes())


def load_image(path):
    if path.suffix.lower() == ".raw":
        return raw_screencap(path)
    if path.suffix.lower() == ".png":
        return png_image(path)
    raise ValueError(f"unsupported image type {path.suffix}")


def centered(value, global_mean):
    return max(-128, min(127, value - global_mean)) + 128


def extract_features(pixels, width, height, roi, grid, step):
    x0, y0, x1, y1 = roi
    columns, rows = grid
    if not (0 <= x0 < x1 <= width and 0 <= y0 < y1 <= height):
        raise ValueError(f"ROI {roi} is outside {width}x{height}")
    totals = [0, 0, 0]
    tile_totals = [[0, 0, 0] for _ in range(columns * rows)]
    tile_counts = [0] * (columns * rows)
    samples = 0
    for y in range(y0, y1, step):
        tile_y = min(rows - 1, (y - y0) * rows // (y1 - y0))
        row_offset = y * width * 4
        for x in range(x0, x1, step):
            tile_x = min(columns - 1, (x - x0) * columns // (x1 - x0))
            tile = tile_y * columns + tile_x
            offset = row_offset + x * 4
            red, green, blue = pixels[offset:offset + 3]
            totals[0] += red
            totals[1] += green
            totals[2] += blue
            tile_totals[tile][0] += red
            tile_totals[tile][1] += green
            tile_totals[tile][2] += blue
            tile_counts[tile] += 1
            samples += 1
    if not samples or any(count == 0 for count in tile_counts):
        raise ValueError("grid is finer than the sampled ROI")
    means = [total // samples for total in totals]
    features = list(means)
    for totals_for_tile, count in zip(tile_totals, tile_counts):
        features.extend(
            centered(total // count, mean)
            for total, mean in zip(totals_for_tile, means)
        )
    return bytes(features)


def distance(left, right, mean_weight, cells):
    total = sum(abs(left[channel] - right[channel]) for channel in range(3)) * mean_weight
    total += sum(abs(a - b) for a, b in zip(left[3:], right[3:]))
    denominator = 3 * mean_weight + cells * 3
    return (total + denominator // 2) // denominator


def source_files(specifications):
    found = []
    for specification in specifications:
        if "=" not in specification:
            raise ValueError(f"source must be LABEL=PATH: {specification}")
        label, raw_path = specification.split("=", 1)
        if not LABEL_RE.fullmatch(label):
            raise ValueError(f"invalid label {label!r}; use 1-15 letters/numbers/dash/underscore")
        path = pathlib.Path(raw_path).expanduser()
        if path.is_dir():
            files = sorted(
                candidate for candidate in path.rglob("*")
                if candidate.is_file() and candidate.suffix.lower() in IMAGE_SUFFIXES
            )
        elif path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES:
            files = [path]
        else:
            raise ValueError(f"no supported frames found at {path}")
        found.extend((label, file) for file in files)
    return found


def validate_templates(records, mean_weight, cells, max_score, min_margin, allow_errors):
    errors = []
    scores_by_label = collections.defaultdict(list)
    margins_by_label = collections.defaultdict(list)
    for index, (label, path, features) in enumerate(records):
        candidates = [
            (distance(features, other_features, mean_weight, cells), other_label, other_path)
            for other_index, (other_label, other_path, other_features) in enumerate(records)
            if other_index != index
        ]
        same = sorted(candidate for candidate in candidates if candidate[1] == label)
        other = sorted(candidate for candidate in candidates if candidate[1] != label)
        if not same or not other:
            errors.append(f"{label}: need at least two frames and at least two classes")
            continue
        same_score = same[0][0]
        other_score = other[0][0]
        margin = max(0, other_score - same_score)
        scores_by_label[label].append(same_score)
        margins_by_label[label].append(margin)
        if same_score >= other_score:
            errors.append(
                f"{path}: nearest other class {other[0][1]} ({other_score}) "
                f"beats/ties {label} ({same_score})"
            )
        if same_score > max_score:
            errors.append(f"{path}: same-class score {same_score} exceeds max-score {max_score}")
        if margin < min_margin:
            errors.append(f"{path}: class margin {margin} is below min-margin {min_margin}")

    print("leave-one-out calibration:")
    for label in sorted(scores_by_label):
        scores = scores_by_label[label]
        margins = margins_by_label[label]
        print(
            f"  {label:15s} same-class score {min(scores)}..{max(scores)}, "
            f"margin {min(margins)}..{max(margins)}"
        )
    if errors:
        print("calibration warnings:", file=sys.stderr)
        for error in dict.fromkeys(errors):
            print(f"  {error}", file=sys.stderr)
        if not allow_errors:
            raise ValueError("calibration is not separated; use more/better frames or --allow-errors")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--roi", required=True, type=roi_value, metavar="X0,Y0,X1,Y1")
    parser.add_argument("--grid", type=grid_value, default=(12, 8), metavar="COLSxROWS")
    parser.add_argument("--step", type=int, default=2)
    parser.add_argument("--mean-weight", type=int, default=8)
    parser.add_argument("--max-score", type=int, default=255)
    parser.add_argument("--min-margin", type=int, default=0)
    parser.add_argument("--allow-errors", action="store_true")
    parser.add_argument("--output", required=True, type=pathlib.Path)
    parser.add_argument("sources", nargs="+", metavar="LABEL=PATH")
    args = parser.parse_args()

    if not 1 <= args.step <= 255:
        parser.error("--step must be 1..255")
    if not 0 <= args.mean_weight <= 32:
        parser.error("--mean-weight must be 0..32")
    if not 0 <= args.max_score <= 255 or not 0 <= args.min_margin <= 255:
        parser.error("score and margin limits must be 0..255")

    try:
        inputs = source_files(args.sources)
    except ValueError as error:
        parser.error(str(error))
    if len(inputs) > MAX_TEMPLATES:
        parser.error(f"at most {MAX_TEMPLATES} frames fit in one model")

    records = []
    dimensions = None
    try:
        for label, path in inputs:
            width, height, pixels = load_image(path)
            if dimensions is None:
                dimensions = (width, height)
            elif dimensions != (width, height):
                raise ValueError(f"{path}: {width}x{height} does not match {dimensions[0]}x{dimensions[1]}")
            features = extract_features(
                pixels, width, height, args.roi, args.grid, args.step
            )
            records.append((label, path, features))
        labels = collections.Counter(label for label, _, _ in records)
        if len(labels) < 2:
            raise ValueError("a model needs at least two classes")
        validate_templates(
            records,
            args.mean_weight,
            args.grid[0] * args.grid[1],
            args.max_score,
            args.min_margin,
            args.allow_errors,
        )
    except (OSError, ValueError) as error:
        parser.error(str(error))

    width, height = dimensions
    x0, y0, x1, y1 = args.roi
    header = MODEL_HEADER.pack(
        b"SCM1",
        MODEL_HEADER_SIZE,
        width,
        height,
        x0,
        y0,
        x1,
        y1,
        args.step,
        args.grid[0],
        args.grid[1],
        args.mean_weight,
        len(records),
        0,
        args.max_score,
        args.min_margin,
        0,
    )
    body = bytearray(header)
    for label, _, features in records:
        body.extend(label.encode("ascii").ljust(LABEL_SIZE, b"\0"))
        body.extend(features)
    try:
        args.output.write_bytes(body)
    except OSError as error:
        parser.error(str(error))
    print(
        f"wrote {args.output}: {len(body)} bytes, {len(records)} templates, "
        f"{width}x{height} ROI {args.roi}, grid {args.grid[0]}x{args.grid[1]}"
    )


if __name__ == "__main__":
    main()
