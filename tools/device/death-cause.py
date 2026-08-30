#!/usr/bin/env python3
"""Shadow-only visual death-cause model for the stock-device recorder.

The lifecycle authority answers whether a night is still running.  This module
does not replace it: a Foxy-looking frame is only a candidate cause, and the
timeline accepts it as terminal evidence only after the last observed office
segment and a captured post-jumpscare tail.

The model is intentionally a small, inspectable nearest-centroid envelope.  It
is built from explicitly labelled image files, records the measured positive
and negative distances, and is always marked ``shadow``.  It cannot be used to
authorize HID actions.  A one-run operator label is useful for corpus work but
is not enough to promote a model; calibration and holdout sessions must remain
separate before this can become a live fact.

Wire format:

    {"schema":"visual-death-fact-v1", "state":"OBSERVED",
     "value":"foxy", "distance":..., "threshold":...}

or an explicit UNKNOWN reason.  The classifier accepts both the 1280x576
screenrecord and the 640x288 timeline working size, preserving the 20:9 aspect
ratio while refusing an uncalibrated sensor geometry.
"""
import argparse
import json
import math
import sys
from pathlib import Path

from PIL import Image

MODEL_SCHEMA = "visual-death-model-v1"
FACT_SCHEMA = "visual-death-fact-v1"
FEATURE_GRID = (16, 9)
# Exclude the HUD, flashlight meter, and lower mask bar. The centre is where
# the jumpscare actor is rendered; keeping the crop narrow also prevents the
# unchanged office background from dominating a distance calculation.
FEATURE_CROP = (0.18, 0.05, 0.82, 0.88)
ASPECT = 20 / 9
ASPECT_TOLERANCE = 0.025
MIN_SAMPLES = 2


def _fail(message):
    raise ValueError(f"death cause: {message}")


def _check_image(im):
    if im.width < 16 or im.height < 9:
        _fail("image is too small")
    if abs(im.width / im.height - ASPECT) > ASPECT_TOLERANCE:
        _fail(f"aspect {im.width}x{im.height} is not the calibrated 20:9 sensor")


def _feature(im):
    im = im.convert("RGB")
    _check_image(im)
    x0 = round(FEATURE_CROP[0] * im.width)
    y0 = round(FEATURE_CROP[1] * im.height)
    x1 = max(x0 + 1, round(FEATURE_CROP[2] * im.width))
    y1 = max(y0 + 1, round(FEATURE_CROP[3] * im.height))
    crop = im.crop((x0, y0, x1, y1)).resize(FEATURE_GRID, Image.Resampling.BOX)
    return [channel / 255 for pixel in crop.getdata() for channel in pixel]


def feature_from_bytes(data, width, height):
    if len(data) != width * height * 3:
        _fail(f"expected {width}x{height} rgb24 bytes, got {len(data)}")
    return _feature(Image.frombytes("RGB", (width, height), data))


def _distance(left, right):
    if len(left) != len(right):
        _fail("feature vectors have different lengths")
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(left, right)) / len(left))


def _centroid(rows):
    return [sum(row[i] for row in rows) / len(rows) for i in range(len(rows[0]))]


def _images(root):
    paths = sorted(p for p in Path(root).rglob("*")
                   if p.is_file() and p.suffix.lower() in (".png", ".jpg", ".jpeg"))
    if len(paths) < MIN_SAMPLES:
        _fail(f"{root} needs at least {MIN_SAMPLES} labelled images")
    rows = []
    for path in paths:
        try:
            with Image.open(path) as im:
                rows.append(_feature(im))
        except (OSError, ValueError) as exc:
            _fail(f"cannot read {path}: {exc}")
    return paths, rows


def build_model(positive_root, negative_root):
    positive_paths, positive = _images(positive_root)
    negative_paths, negative = _images(negative_root)
    pos_centroid = _centroid(positive)
    neg_centroid = _centroid(negative)
    pos_distances = [_distance(row, pos_centroid) for row in positive]
    neg_distances = [_distance(row, pos_centroid) for row in negative]
    positive_max = max(pos_distances)
    negative_min = min(neg_distances)
    if not positive_max < negative_min:
        _fail("positive and negative envelopes overlap; keep the model UNKNOWN")
    threshold = (positive_max + negative_min) / 2
    return {
        "schema": MODEL_SCHEMA,
        "label": "foxy",
        "authorized_for": "shadow",
        "sensor": {"aspect": "20:9", "feature_grid": list(FEATURE_GRID),
                   "crop": list(FEATURE_CROP)},
        "training": {
            "positive_images": len(positive_paths),
            "negative_images": len(negative_paths),
            "positive_max_distance": positive_max,
            "negative_min_distance": negative_min,
            "threshold": threshold,
        },
        "positive_centroid": pos_centroid,
        "negative_centroid": neg_centroid,
    }


def _validate_model(model):
    if not isinstance(model, dict) or model.get("schema") != MODEL_SCHEMA:
        _fail(f"model schema must be {MODEL_SCHEMA}")
    if model.get("label") != "foxy":
        _fail("model label must be foxy")
    if model.get("authorized_for") != "shadow":
        _fail("death-cause models are shadow-only")
    sensor = model.get("sensor", {})
    if sensor.get("feature_grid") != list(FEATURE_GRID) or \
            sensor.get("crop") != list(FEATURE_CROP):
        _fail("model feature geometry does not match this observer")
    training = model.get("training", {})
    threshold = training.get("threshold")
    if not isinstance(threshold, (int, float)) or not math.isfinite(threshold) or threshold <= 0:
        _fail("model threshold is invalid")
    positive = model.get("positive_centroid")
    negative = model.get("negative_centroid")
    size = FEATURE_GRID[0] * FEATURE_GRID[1] * 3
    if not isinstance(positive, list) or not isinstance(negative, list) or \
            len(positive) != size or len(negative) != size:
        _fail("model centroid size is invalid")
    return model


def classify_image(im, model):
    model = _validate_model(model)
    try:
        vector = _feature(im)
    except ValueError as exc:
        return {"schema": FACT_SCHEMA, "state": "UNKNOWN",
                "reason": str(exc)}
    positive = _distance(vector, model["positive_centroid"])
    negative = _distance(vector, model["negative_centroid"])
    threshold = model["training"]["threshold"]
    if positive <= threshold and positive < negative:
        return {"schema": FACT_SCHEMA, "state": "OBSERVED", "value": "foxy",
                "distance": positive, "negativeDistance": negative,
                "threshold": threshold, "source": "visual-death-model",
                "authorizedFor": "shadow"}
    reason = "outside-foxy-envelope" if positive > threshold else "negative-nearer"
    return {"schema": FACT_SCHEMA, "state": "UNKNOWN", "reason": reason,
            "distance": positive, "negativeDistance": negative,
            "threshold": threshold, "source": "visual-death-model",
            "authorizedFor": "shadow"}


def classify_bytes(data, width, height, model):
    try:
        image = Image.frombytes("RGB", (width, height), data)
    except ValueError as exc:
        return {"schema": FACT_SCHEMA, "state": "UNKNOWN",
                "reason": f"invalid-rgb-frame:{exc}"}
    return classify_image(image, model)


def main(argv):
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    build = sub.add_parser("build")
    build.add_argument("positive")
    build.add_argument("negative")
    build.add_argument("--output", required=True)
    classify = sub.add_parser("classify")
    classify.add_argument("image")
    classify.add_argument("--model", required=True)
    args = parser.parse_args(argv)

    try:
        if args.command == "build":
            model = build_model(args.positive, args.negative)
            Path(args.output).write_text(json.dumps(model, indent=2) + "\n",
                                         encoding="utf-8")
            print(json.dumps({"schema": MODEL_SCHEMA,
                              "authorized_for": "shadow",
                              "training": model["training"]}))
            return 0
        model = json.loads(Path(args.model).read_text(encoding="utf-8"))
        with Image.open(args.image) as image:
            print(json.dumps(classify_image(image, model), sort_keys=True))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"unknown={exc}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
