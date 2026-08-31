#!/usr/bin/env python3
"""Replay labeled holdout frames through the real native classifier."""

import argparse
import collections
import pathlib
import re
import struct
import subprocess
import tempfile


HERE = pathlib.Path(__file__).resolve().parent
LABEL_RE = re.compile(r"^[A-Za-z0-9_-]{1,15}$")
IMAGE_SUFFIXES = {".png", ".raw"}


def source_files(specifications):
    found = []
    for specification in specifications:
        if "=" not in specification:
            raise ValueError(f"source must be LABEL=PATH: {specification}")
        label, raw_path = specification.split("=", 1)
        if not LABEL_RE.fullmatch(label):
            raise ValueError(f"invalid label {label!r}")
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


def frame_input(path):
    if path.suffix.lower() == ".raw":
        data = path.read_bytes()
        if len(data) < 16:
            raise ValueError(f"{path}: truncated raw screenshot")
        width, height, pixel_format, _ = struct.unpack_from("<IIII", data)
        if pixel_format not in (1, 2) or len(data) < 16 + width * height * 4:
            raise ValueError(f"{path}: invalid RGBA screencap")
        return [], data
    try:
        from PIL import Image
    except ImportError as error:
        raise ValueError("PNG input requires Pillow") from error
    image = Image.open(path).convert("RGBA")
    return ["--rgba", str(image.width), str(image.height)], image.tobytes()


def compile_checker(directory):
    checker = pathlib.Path(directory) / "screencheck"
    subprocess.run(
        ["cc", "-std=c99", "-O3", str(HERE / "../../packages/screencheck/src/screencheck.c"), "-o", checker],
        check=True,
    )
    return checker


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("model", type=pathlib.Path)
    parser.add_argument("sources", nargs="+", metavar="LABEL=PATH")
    parser.add_argument("--checker", type=pathlib.Path)
    args = parser.parse_args()
    try:
        inputs = source_files(args.sources)
    except ValueError as error:
        parser.error(str(error))
    if not inputs:
        parser.error("no holdout frames")

    confusion = collections.Counter()
    scores = collections.defaultdict(list)
    margins = collections.defaultdict(list)
    failures = []
    with tempfile.TemporaryDirectory(prefix="fnaf-screen-replay-") as temp:
        try:
            checker = args.checker or compile_checker(temp)
        except (OSError, subprocess.CalledProcessError) as error:
            parser.error(str(error))
        for expected, path in inputs:
            try:
                extra_arguments, data = frame_input(path)
            except (OSError, ValueError) as error:
                parser.error(str(error))
            result = subprocess.run(
                [checker, "classify", args.model, *extra_arguments],
                input=data,
                capture_output=True,
                check=False,
            )
            if result.returncode:
                parser.error(
                    f"{path}: classifier exited {result.returncode}: "
                    f"{result.stderr.decode(errors='replace').strip()}"
                )
            fields = result.stdout.decode().strip().split()
            if len(fields) != 3 or not fields[1].startswith("score=") \
                    or not fields[2].startswith("margin="):
                parser.error(f"{path}: malformed classifier output {result.stdout!r}")
            predicted = fields[0]
            score = int(fields[1].split("=", 1)[1])
            margin = int(fields[2].split("=", 1)[1])
            confusion[expected, predicted] += 1
            scores[expected].append(score)
            margins[expected].append(margin)
            if predicted != expected:
                failures.append((path, expected, predicted, score, margin))

    print("holdout replay:")
    for (expected, predicted), count in sorted(confusion.items()):
        print(f"  {expected:15s} -> {predicted:15s} {count:3d}")
    for label in sorted(scores):
        print(
            f"  {label:15s} score {min(scores[label])}..{max(scores[label])}, "
            f"margin {min(margins[label])}..{max(margins[label])}"
        )
    if failures:
        print("misclassified frames:")
        for path, expected, predicted, score, margin in failures:
            print(
                f"  {path}: expected {expected}, got {predicted} "
                f"(score={score}, margin={margin})"
            )
        raise SystemExit(1)
    print(f"all {len(inputs)} holdout frames classified correctly")


if __name__ == "__main__":
    main()
