#!/usr/bin/env python3
"""Report which title-screen items are visible, or why that is unknown.

The title screen is the one place the runners have always acted blind. Four
scripts tap a coordinate for `Continue` or `6th Night` without ever asking
whether that item is on screen; `TAP_NEWGAME` sits in `coords.sh` beside them,
unused and unguarded, one edit away from erasing the save. plans/13 makes the
menu an observation instead: nothing is tapped that was not seen.

    screencap -p | title-observe.py            # items=continue,newGame
    title-observe.py --adb                     # capture and classify
    title-observe.py --measure < frame.png     # the raw fractions, for calibration

Output is exactly one line on stdout:

    items=<comma-separated MenuTargets>   a confident read   (exit 0)
    unknown=<reason>                      refuse             (exit 3)

**There is no measured model for the target build yet**, and this tool will not
invent one. Every title item's predicate needs a threshold, thresholds come from
labelled frames, and the local capture root holds no title frame at all -- the
save that would have produced one was lost before anything captured it. So with
no `TITLE_MODEL` this prints `unknown=no-title-model` and the selector refuses,
which is the correct behaviour and not a placeholder: a blind tap on an
unobserved menu is exactly the hazard.

To calibrate, capture title frames for each save state and run `--measure` over
them; the bands print with their fractions, and a model is those numbers with a
separating threshold. `tools/device/testdata/make-title-fixture.py` builds the
synthetic equivalent that `test-menu.sh` uses to exercise every branch here
without a phone -- synthetic frames prove the plumbing, never the threshold.

Exit codes: 0 confident, 3 unknown/refuse, 2 usage or I/O failure.
"""
import json
import os
import subprocess
import sys
import warnings

warnings.simplefilter("ignore")

GEOMETRY = (2400, 1080)
MODEL_SCHEMA = "title-model-v1"
# Every MenuTarget this project recognises. A model naming anything else is a
# model for a different game build, not a title screen with a bonus button.
TARGETS = ("newGame", "continue", "sixthNight", "customNight")


def fail(reason):
    print(f"unknown={reason}")
    raise SystemExit(3)


def load_model(path):
    if not path:
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            model = json.load(handle)
    except (OSError, ValueError):
        fail("title-model-unreadable")
    if model.get("schema") != MODEL_SCHEMA:
        fail(f"title-model-schema:{model.get('schema')}")
    items = model.get("items")
    if not isinstance(items, dict) or not items:
        fail("title-model-has-no-items")
    for name, point in items.items():
        if name not in TARGETS:
            fail(f"title-model-unknown-item:{name}")
        if (not isinstance(point, list) or len(point) != 2
                or not all(isinstance(v, int) for v in point)):
            fail(f"title-model-bad-point:{name}")
    # An undecided band is mandatory. A model whose present and absent
    # thresholds meet has no way to say "ambiguous", and this screen's whole
    # job is to be able to refuse.
    try:
        present, absent = float(model["present_min"]), float(model["absent_max"])
        bright = int(model["bright_min"])
        band_w, band_h = (int(v) for v in model["band"])
    except (KeyError, TypeError, ValueError):
        fail("title-model-incomplete")
    if not absent < present:
        fail("title-model-has-no-undecided-band")
    if band_w <= 0 or band_h <= 0:
        fail("title-model-bad-band")
    return {"items": items, "present_min": present, "absent_max": absent,
            "bright_min": bright, "band": (band_w, band_h),
            "build": model.get("build", "unnamed")}


def read_frame(source):
    try:
        from PIL import Image, UnidentifiedImageError
    except ImportError:
        print("title-observe.py requires Pillow", file=sys.stderr)
        raise SystemExit(2)
    try:
        image = Image.open(source).convert("RGB")
    except (OSError, UnidentifiedImageError):
        fail("unreadable-frame")
    if image.size != GEOMETRY:
        image = image.resize(GEOMETRY)
    return image


def bright_fraction(image, point, band, bright_min):
    x, y = point
    half_w, half_h = band[0] // 2, band[1] // 2
    box = (max(0, x - half_w), max(0, y - half_h),
           min(GEOMETRY[0], x + half_w), min(GEOMETRY[1], y + half_h))
    data = list(image.crop(box).resize((32, 32)).getdata())
    lit = sum(1 for r, g, b in data if min(r, g, b) > bright_min)
    return lit / len(data)


def capture_via_adb(timeout):
    try:
        result = subprocess.run(
            ["adb", "exec-out", "screencap", "-p"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        fail("capture-failed")
    if result.returncode != 0 or not result.stdout:
        fail("capture-failed")
    import io
    return io.BytesIO(result.stdout)


def main(argv):
    measure = "--measure" in argv
    use_adb = "--adb" in argv
    model_path = os.environ.get("TITLE_MODEL", "")
    if "--model" in argv:
        index = argv.index("--model")
        if index + 1 >= len(argv):
            print("--model needs a path", file=sys.stderr)
            return 2
        model_path = argv[index + 1]

    # --measure is the calibration path and deliberately does not need a model:
    # it is how the first one gets built.
    if measure:
        model = load_model(model_path) if model_path else None
        band = model["band"] if model else (660, 76)
        bright_min = model["bright_min"] if model else 150
        points = model["items"] if model else {
            "newGame": [400, 640], "continue": [400, 730], "sixthNight": [400, 880]}
        image = read_frame(capture_via_adb(8.0) if use_adb else sys.stdin.buffer)
        for name in sorted(points):
            value = bright_fraction(image, points[name], band, bright_min)
            print(f"{name} {value:.4f}")
        return 0

    if not model_path:
        fail("no-title-model")
    model = load_model(model_path)
    image = read_frame(capture_via_adb(8.0) if use_adb else sys.stdin.buffer)

    present = []
    for name in sorted(model["items"]):
        value = bright_fraction(image, model["items"][name], model["band"],
                                model["bright_min"])
        if value >= model["present_min"]:
            present.append(name)
        elif value > model["absent_max"]:
            # Between the thresholds is not "probably absent". A title screen
            # mid-transition reads exactly like this, and so does a frame from
            # a build whose layout moved.
            fail(f"ambiguous:{name}:{value:.4f}")
    if not present:
        # Every band dark is not "a title screen with no buttons" -- it is far
        # more likely not the title screen at all.
        fail("no-items-visible")
    print("items=" + ",".join(present))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
