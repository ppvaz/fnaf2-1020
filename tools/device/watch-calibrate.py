#!/usr/bin/env python3
"""Calibrate the native-resolution PixelWatch against labelled frames.

The watch is a sensor, not a classifier.  This tool measures the fixed
features exposed by that sensor and emits a versioned fact adapter containing
the threshold, direction, observed spread, and separation margin.  If no
feature clears the requested margin the output is still written, but its
status is ``refuse``; callers must not turn a weak calibration into a live
decision.

    watch-calibrate.py --output watchlist.json --fact bb-left-opening \
        empty=captures/empty threat=captures/threat

Inputs are labelled PNGs or Android RGBA8888/RGBX8888 ``.raw`` screencaps.
The native watch deliberately requires 2400x1080 input.  Resizing a frame here
would calibrate a different sensor and would recreate the mismatch that this
tool is meant to prevent.
"""

import argparse
import hashlib
import json
import math
import pathlib
import re
import struct
import sys
from collections import defaultdict

try:
    from PIL import Image
except ImportError as error:  # pragma: no cover - exercised by the CLI
    Image = None
    PIL_ERROR = error

WIDTH = 2400
HEIGHT = 1080
SPEC_VERSION = "pixel-watch-v1"
SENSOR_ID = "cue-helper-native-2400x1080"
PROFILE_ID = "moto-g56-v207-landscape"

# Keep this list mechanically aligned with PixelWatch.defaultSpec(). The hash
# is checked in the output and is the value accepted by CaptureService.WATCH.
# The camNN_button pixels are the measured monitor-map camera buttons
# (selected button renders yellow, yellowness near 194; coordinates measured
# on 2026-09-01 g56 captures) for the cameraSelected fact.
ENTRIES = (
    ("bb_left_luma", "PIXEL", 451, 730, 1, 1, "LUMA", 1, 0),
    ("bb_left_yellowness", "PIXEL", 451, 730, 1, 1, "YELLOWNESS", 1, 0),
    ("cam05_mean_luma", "ROI", 600, 180, 520, 320, "MEAN_LUMA", 4, 0),
    ("screen_grey_cells", "ROI", 0, 0, 2400, 1080, "GREY_CELLS", 120, 25),
    ("cam01_button", "PIXEL", 1412, 784, 1, 1, "YELLOWNESS", 1, 0),
    ("cam02_button", "PIXEL", 1720, 784, 1, 1, "YELLOWNESS", 1, 0),
    ("cam03_button", "PIXEL", 1411, 690, 1, 1, "YELLOWNESS", 1, 0),
    ("cam04_button", "PIXEL", 1728, 690, 1, 1, "YELLOWNESS", 1, 0),
    ("cam05_button", "PIXEL", 1424, 916, 1, 1, "YELLOWNESS", 1, 0),
    ("cam06_button", "PIXEL", 1696, 916, 1, 1, "YELLOWNESS", 1, 0),
    ("cam07_button", "PIXEL", 1776, 606, 1, 1, "YELLOWNESS", 1, 0),
    ("cam08_button", "PIXEL", 1412, 590, 1, 1, "YELLOWNESS", 1, 0),
    ("cam09_button", "PIXEL", 2144, 548, 1, 1, "YELLOWNESS", 1, 0),
    ("cam10_button", "PIXEL", 1984, 716, 1, 1, "YELLOWNESS", 1, 0),
    ("cam11_button", "PIXEL", 2228, 652, 1, 1, "YELLOWNESS", 1, 0),
    ("cam12_button", "PIXEL", 2188, 784, 1, 1, "YELLOWNESS", 1, 0),
)
CANONICAL_SPEC = SPEC_VERSION + "\n" + "".join(
    "%s|%s|%d|%d|%d|%d|%s|%d|%d\n" % entry for entry in ENTRIES
)
SPEC_HASH = hashlib.sha256(CANONICAL_SPEC.encode("ascii")).hexdigest()
LABEL_RE = re.compile(r"^[A-Za-z0-9_.-]+$")


class CalibrationError(ValueError):
    pass


def load_raw(path):
    data = path.read_bytes()
    if len(data) < 16:
        raise CalibrationError(f"{path}: truncated raw screencap header")
    width, height, pixel_format, _ = struct.unpack_from("<IIII", data)
    if (width, height) != (WIDTH, HEIGHT):
        raise CalibrationError(
            f"{path}: sensor-geometry {width}x{height}; expected {WIDTH}x{HEIGHT}")
    if pixel_format not in (1, 2):
        raise CalibrationError(f"{path}: unsupported raw pixel format {pixel_format}")
    size = WIDTH * HEIGHT * 4
    if len(data) < 16 + size:
        raise CalibrationError(f"{path}: truncated raw pixels")
    return Image.frombytes("RGBA", (WIDTH, HEIGHT), data[16:16 + size]).convert("RGB")


def load_frame(path):
    if Image is None:
        raise CalibrationError(f"Pillow is required to read frames: {PIL_ERROR}")
    if path.suffix.lower() == ".raw":
        return load_raw(path)
    if path.suffix.lower() != ".png":
        raise CalibrationError(f"{path}: expected .png or .raw")
    try:
        image = Image.open(path).convert("RGB")
    except OSError as error:
        raise CalibrationError(f"{path}: unreadable frame: {error}") from error
    if image.size != (WIDTH, HEIGHT):
        raise CalibrationError(
            f"{path}: sensor-geometry {image.width}x{image.height}; "
            f"expected {WIDTH}x{HEIGHT}")
    return image


def paths_for(spec):
    label, separator, raw_path = spec.partition("=")
    if not separator or not LABEL_RE.fullmatch(label):
        raise CalibrationError(f"labelled source must be LABEL=PATH: {spec!r}")
    root = pathlib.Path(raw_path)
    if root.is_dir():
        paths = sorted(
            p for p in root.rglob("*")
            if p.is_file() and p.suffix.lower() in {".png", ".raw"})
    elif root.is_file():
        paths = [root]
    else:
        raise CalibrationError(f"{root}: no such frame or directory")
    if not paths:
        raise CalibrationError(f"{root}: no .png or .raw frames")
    return label, paths


def luma(rgb):
    r, g, b = rgb
    return (77 * r + 150 * g + 29 * b) >> 8


def feature_values(image):
    """Compute every ENTRIES feature from one frame; ENTRIES is the only authority."""
    values = {}
    for name, kind, x, y, width, height, reducer, step, grey_spread in ENTRIES:
        if kind == "PIXEL":
            pixel = image.getpixel((x, y))
            values[name] = luma(pixel) if reducer == "LUMA" \
                else min(pixel[0], pixel[1]) - pixel[2]
        elif reducer == "GREY_CELLS":
            grey = 0
            for yy in range(y, y + height, step):
                for xx in range(x, x + width, step):
                    r, g, b = image.getpixel((xx, yy))
                    if max(r, g, b) - min(r, g, b) < grey_spread:
                        grey += 1
            values[name] = grey
        else:
            total = 0
            count = 0
            for yy in range(y, y + height, step):
                for xx in range(x, x + width, step):
                    total += luma(image.getpixel((xx, yy)))
                    count += 1
            values[name] = total // count
    return values


def spread(values, centre):
    return max((abs(value - centre) for value in values), default=0.0)


def candidate_stats(records, feature, labels):
    by_label = defaultdict(list)
    for label, values in records:
        by_label[label].append(values[feature])
    means = {label: sum(items) / len(items) for label, items in by_label.items()}
    spreads = {label: spread(items, means[label]) for label, items in by_label.items()}
    ordered = sorted(means, key=means.get)
    if len(ordered) == 2:
        lower, upper = ordered
        threshold = (means[lower] + means[upper]) / 2.0
        margin = min(
            threshold - (means[lower] + spreads[lower]),
            (means[upper] - spreads[upper]) - threshold,
        )
        rule = {
            "kind": "threshold",
            "threshold": round(threshold, 3),
            "lesser_label": lower,
            "greater_label": upper,
        }
    else:
        # A multi-class scalar is still useful evidence, but no arbitrary
        # ordering is invented. Margin is the worst nearest-centroid gap.
        margins = []
        for _, values in records:
            scored = sorted(abs(values[feature] - means[label]) for label in labels)
            if len(scored) > 1:
                margins.append(scored[1] - scored[0])
        margin = min(margins, default=-math.inf)
        rule = {"kind": "nearest-centroid", "centres": {
            label: round(means[label], 3) for label in labels}}
    return {
        "feature": feature,
        "rule": rule,
        "means": {label: round(means[label], 3) for label in labels},
        "spread": {label: round(spreads[label], 3) for label in labels},
        "separation_margin": round(margin, 3),
    }


def entry_json(entry):
    name, kind, x, y, width, height, reducer, step, grey_spread = entry
    return {
        "name": name,
        "kind": kind.lower(),
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "reducer": reducer.lower(),
        "step": step,
        "grey_spread": grey_spread,
    }


def calibrate(args):
    sources = [paths_for(spec) for spec in args.labelled]
    labels = [label for label, _ in sources]
    if len(set(labels)) != len(labels):
        raise CalibrationError("each label may appear only once")
    if len(labels) < 2:
        raise CalibrationError("at least two labelled classes are required")

    records = []
    counts = {}
    for label, paths in sources:
        counts[label] = len(paths)
        for path in paths:
            records.append((label, feature_values(load_frame(path))))

    candidates = [candidate_stats(records, entry[0], labels) for entry in ENTRIES]
    best = max(candidates, key=lambda item: item["separation_margin"])
    accepted = best["separation_margin"] >= args.min_margin
    reason = None if accepted else "separation-margin-below-floor"
    output = {
        "schema": "watchlist-v1",
        "schema_version": 1,
        "status": "calibrated" if accepted else "refuse",
        "reason": reason,
        "fact": {
            "id": args.fact,
            "labels": labels,
            "unknown_reasons": [
                "frame-pending", "frame-stale", "sensor-mismatch",
                "calibration-refused", "ambiguous-threshold",
            ],
        },
        "sensor": {
            "id": args.sensor_id,
            "geometry": [WIDTH, HEIGHT],
            "scaler": "native-resolution",
            "colour": "RGBA8888-source-rgb",
            "profile_id": args.profile_id,
        },
        "watch_spec": {
            "version": SPEC_VERSION,
            "sha256": SPEC_HASH,
            "entries": [entry_json(entry) for entry in ENTRIES],
        },
        "adapter": {
            "feature": best["feature"],
            "rule": best["rule"],
            "separation_margin": best["separation_margin"],
            "minimum_margin": args.min_margin,
            "calibration_frames": sum(counts.values()),
            "class_counts": counts,
            "candidates": candidates,
        },
    }
    destination = pathlib.Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n")
    print(json.dumps({
        "status": output["status"], "fact": args.fact,
        "feature": best["feature"], "margin": best["separation_margin"],
        "minimum": args.min_margin, "spec": SPEC_HASH,
        "output": str(destination),
    }, sort_keys=True))
    if not accepted and args.strict:
        raise SystemExit(1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=pathlib.Path)
    parser.add_argument("--fact", required=True)
    parser.add_argument("--sensor-id", default=SENSOR_ID)
    parser.add_argument("--profile-id", default=PROFILE_ID)
    parser.add_argument("--min-margin", type=float, default=5.0)
    parser.add_argument("--strict", action="store_true",
                        help="exit 1 when calibration emits status=refuse")
    parser.add_argument("labelled", nargs="+", metavar="LABEL=PATH")
    args = parser.parse_args()
    if args.min_margin < 0:
        parser.error("--min-margin must be non-negative")
    try:
        calibrate(args)
    except CalibrationError as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
