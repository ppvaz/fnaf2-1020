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

`models/title-moto-g56-v207.json` is the measured model for the canonical build
on the calibrated handset (2026-08-26, 26 frames). Its numbers, with their
control:

    band                     newGame        continue       sixthNight
    title, fresh save (23)   0.0674-0.1318  0.0264-0.0547  0.0000 exactly
    title, 6th unlocked (3)  0.0690-0.0720  0.0310-0.0330  0.0670-0.0690
    office HUD (control)     0.0000         0.0000         0.0000

Absent is not "small", it is exactly zero across every frame measured, and the
narrowest present value is 0.0264 -- so the thresholds sit at 0.008/0.020 with
the interval between them meaning "undecided", never "probably absent".

The gate exists because of the Options screen. Its "Perspective Effect" label
lands inside the New Game band at 0.0186, against a 0.020 present threshold: a
margin of 0.0014, which is not a classifier. So the item bands are consulted
only after the game logo says this is the title screen at all -- the word "Five"
reads 0.106-0.123 on every title frame measured and 0.007-0.012 on Options.

With no `TITLE_MODEL` this prints `unknown=no-title-model` and the selector
refuses. To calibrate a different handset or build, run `--measure` over frames
of each save state and set thresholds that separate them, with the undecided
interval kept wide enough to be useful.
`tools/device/testdata/make-title-fixture.py` builds the synthetic equivalent
that `test-menu.sh` uses to exercise every branch here without a phone --
synthetic frames prove the plumbing, never the threshold.

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
    gates = {}
    for key in ("title_gate", "menu_gate"):
        gate = model.get(key)
        if gate is None:
            gates[key] = None
            continue
        try:
            box = [int(v) for v in gate["box"]]
            gate = {"box": tuple(box), "min": float(gate["min"]),
                    "max_absent": float(gate["max_absent"])}
        except (KeyError, TypeError, ValueError):
            fail(f"title-model-bad-gate:{key}")
        if len(box) != 4 or not gate["max_absent"] < gate["min"]:
            fail(f"title-model-bad-gate:{key}")
        gates[key] = gate
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
            "title_gate": gates["title_gate"], "menu_gate": gates["menu_gate"],
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


def box_fraction(image, box, bright_min):
    data = list(image.crop(box).resize((32, 32)).getdata())
    return sum(1 for r, g, b in data if min(r, g, b) > bright_min) / len(data)


def bright_fraction(image, point, band, bright_min):
    x, y = point
    half_w, half_h = band[0] // 2, band[1] // 2
    box = (max(0, x - half_w), max(0, y - half_h),
           min(GEOMETRY[0], x + half_w), min(GEOMETRY[1], y + half_h))
    return box_fraction(image, box, bright_min)


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

    # Is this the title screen at all? Asking the item bands that question is
    # the wrong way round, and the Options screen proves it: its "Perspective
    # Effect" label lands inside the New Game band at 0.0186, a hair under the
    # 0.020 present threshold. A margin of 0.0014 is not a classifier.
    #
    # The game logo is: the word "Five" reads 0.106-0.123 on every title screen
    # measured, on both sensors (native screencap and upscaled screenrecord),
    # and 0.007-0.012 on Options. Gate on that, and the item bands are only ever
    # consulted once the screen is known to be the title.
    gate = model["title_gate"]
    if gate is not None:
        value = box_fraction(image, gate["box"], model["bright_min"])
        if value <= gate["max_absent"]:
            fail(f"not-the-title-screen:{value:.4f}")
        if value < gate["min"]:
            fail(f"ambiguous:title-gate:{value:.4f}")

    # The logo being up does not mean the MENU is up. Pressing New Game raises a
    # "Start a new game?" confirmation that keeps the logo and reuses the same
    # three rows: the prompt sits in the New Game band, "No" on the Continue
    # row, and "Yes" on the 6th Night row. Measured on that dialog the item
    # bands read 0.0332 / 0.0166 / 0.0254 -- newGame and sixthNight both ABOVE
    # the 0.020 present threshold. So without this gate the observer reports a
    # menu, and `menu_select sixthNight` presses (400,880), which is "Yes", and
    # the save is gone. Only an accidental ambiguity in the Continue band
    # stopped that on 2026-08-26.
    #
    # The Options row is the discriminator: 0.0869-0.1201 with the menu up,
    # 0.0000 on the confirmation and 0.0000 on the Options screen.
    menu = model["menu_gate"]
    if menu is not None:
        value = box_fraction(image, menu["box"], model["bright_min"])
        if value <= menu["max_absent"]:
            fail(f"title-dialog:{value:.4f}")
        if value < menu["min"]:
            fail(f"ambiguous:menu-gate:{value:.4f}")

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
