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
import importlib.util
import json
import math
import pathlib
import sys
from collections import defaultdict

SPEC_VERSION = "pixel-watch-v1"
# One frame reader, not three: the .raw/.png loaders, the native-geometry
# refusal and the error type live in monitor-calibrate.py and are imported
# here, the way mask-calibrate.py and screen-calibrate.py already do. The
# module name is hyphenated, so it is loaded by path.
_SPEC = importlib.util.spec_from_file_location(
    "_monitor_calibrate", pathlib.Path(__file__).with_name("monitor-calibrate.py"))
_MC = importlib.util.module_from_spec(_SPEC)
sys.modules["_monitor_calibrate"] = _MC
_SPEC.loader.exec_module(_MC)

CalibrationError = _MC.CalibrationError
WIDTH, HEIGHT = _MC.WIDTH, _MC.HEIGHT
load_raw, load_frame = _MC.load_raw, _MC.load_frame
paths_for = _MC.paths_for

SENSOR_ID = "cue-helper-native-2400x1080"
PROFILE_ID = "moto-g56-v207-landscape"

# Keep this list mechanically aligned with PixelWatch.defaultSpec(). The hash
# is checked in the output and is the value accepted by CaptureService.WATCH.
# The camNN_button pixels are the measured monitor-map camera buttons
# (selected button renders yellow, yellowness near 194; coordinates measured
# on 2026-09-01 g56 captures) for the cameraSelected fact.
# The battery_bar_N ROIs are the four bright interior compartments of the
# top-left flashlight meter, measured on the exact 2400x1080 HUD.
ENTRIES = (
    ("bb_left_luma", "PIXEL", 451, 730, 1, 1, "LUMA", 1, 0),
    ("bb_left_yellowness", "PIXEL", 451, 730, 1, 1, "YELLOWNESS", 1, 0),
    ("cam05_mean_luma", "ROI", 600, 180, 520, 320, "MEAN_LUMA", 4, 0),
    ("screen_grey_cells", "ROI", 0, 0, 2400, 1080, "GREY_CELLS", 120, 25),
    ("battery_bar_1", "ROI", 132, 70, 28, 32, "MEAN_LUMA", 4, 0),
    ("battery_bar_2", "ROI", 172, 70, 28, 32, "MEAN_LUMA", 4, 0),
    ("battery_bar_3", "ROI", 212, 70, 28, 32, "MEAN_LUMA", 4, 0),
    ("battery_bar_4", "ROI", 252, 70, 28, 32, "MEAN_LUMA", 4, 0),
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
    # Provisional Foxy core envelope. These channels are collection
    # features only until labelled Foxy/empty holdouts separate them.
    ("foxy_hall_mean_luma", "ROI", 1650, 300, 450, 400, "MEAN_LUMA", 8, 0),
    ("foxy_hall_mean_redness", "ROI", 1650, 300, 450, 400, "MEAN_REDNESS", 8, 0),
    ("foxy_hall_red_cells", "ROI", 1650, 300, 450, 400, "RED_CELLS", 8, 15),
    # Paired bottom-control ROIs. These are collection features for the
    # mask/monitor state rule; their combination, not either raw value alone,
    # distinguishes mask-on from the ordinary office. Keep the sensor in the
    # inner chevrons so the overlay does not span the whole lower bars.
    ("mask_button_mean_luma", "ROI", 260, 1004, 720, 36, "MEAN_LUMA", 16, 0),
    ("monitor_button_mean_luma", "ROI", 1420, 1004, 720, 36, "MEAN_LUMA", 16, 0),
)
CANONICAL_SPEC = SPEC_VERSION + "\n" + "".join(
    "%s|%s|%d|%d|%d|%d|%s|%d|%d\n" % entry for entry in ENTRIES
)
SPEC_HASH = hashlib.sha256(CANONICAL_SPEC.encode("ascii")).hexdigest()

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
        elif reducer == "RED_CELLS":
            total = 0
            for yy in range(y, y + height, step):
                for xx in range(x, x + width, step):
                    pixel = image.getpixel((xx, yy))
                    if pixel[0] - max(pixel[1], pixel[2]) >= grey_spread:
                        total += 1
            values[name] = total
            continue
        else:
            total = 0
            count = 0
            for yy in range(y, y + height, step):
                for xx in range(x, x + width, step):
                    pixel = image.getpixel((xx, yy))
                    if reducer == "MEAN_REDNESS":
                        total += pixel[0] - max(pixel[1], pixel[2])
                    else:
                        total += luma(pixel)
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
    _MC.add_common_arguments(parser, SENSOR_ID, PROFILE_ID, note=False)
    parser.add_argument("--fact", required=True)
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
