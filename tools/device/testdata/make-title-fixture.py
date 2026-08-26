#!/usr/bin/env python3
"""Synthesize title-screen frames and a matching model for test-menu.sh.

These frames are *synthetic*. They prove the selector's plumbing -- that an
item absent from the screen is not pressed, that an undecided band refuses,
that New Game needs its capability -- and they prove nothing whatever about
where the real title items are or how bright they are on the target build.
The real model needs real frames, and `title-observe.py --measure` is how it
gets built. Nothing here may be promoted into a device model.

The synthetic model deliberately uses a wide undecided band (absent below 0.20,
present at or above 0.80) so a fixture can land in it without depending on how
PIL happens to resample a thin bright stripe. A real model's band will be much
narrower and will come from measured separation, not from convenience.

    python3 make-title-fixture.py OUTDIR
"""
import json
import sys

from PIL import Image, ImageDraw

GEOMETRY = (2400, 1080)
BAND = (660, 76)
BRIGHT_MIN = 150
# The real gate box is the word "Five" of the game logo, which reads 0.106-0.123
# on every measured title frame and 0.007-0.012 on the Options screen. Here it
# is simply lit or not, because a synthetic frame cannot tell you where a logo
# is -- only that the observer consults the gate before the item bands.
GATE_BOX = (150, 40, 560, 140)

# The three real coordinates are `coords.sh`'s, derived 2026-08-20 from labeled
# 100px grid overlays. `customNight` is invented for these fixtures: the item
# has never been on screen on the calibrated device, and `menu.sh` refuses it
# for exactly that reason -- which is one of the things this fixture set tests.
POINTS = {
    "newGame": (400, 640),
    "continue": (400, 730),
    "sixthNight": (400, 880),
    "customNight": (400, 970),
}

# Which items are lit, per save state. `half` covers only the top half of the
# band, landing the measurement inside the undecided interval.
STATES = {
    "fresh-save": {"newGame": "on"},
    "story-progress": {"newGame": "on", "continue": "on"},
    "sixth-unlocked": {"newGame": "on", "continue": "on", "sixthNight": "on"},
    "custom-unlocked": {"newGame": "on", "continue": "on", "sixthNight": "on",
                        "customNight": "on"},
    "ambiguous": {"newGame": "on", "continue": "half", "sixthNight": "on"},
    # The title screen, with every item band dark. Far less likely than the
    # observer simply being on another screen, but it must not be read as "a
    # title screen with no buttons".
    "title-no-items": {},
    # Not the title screen at all: bright content, none of it where an item or
    # the logo is. This is the Options screen's shape, and the case that made
    # the gate necessary.
    "unknown-layout": {},
}
# Which states are the title screen, and therefore light the gate.
TITLE_STATES = set(STATES) - {"unknown-layout"}


def band_box(point, fraction=1.0):
    x, y = point
    half_w, half_h = BAND[0] // 2, BAND[1] // 2
    top = y - half_h
    return (x - half_w, top, x + half_w, top + int(BAND[1] * fraction))


def render(state, lit):
    image = Image.new("RGB", GEOMETRY, (8, 8, 12))
    draw = ImageDraw.Draw(image)
    if state in TITLE_STATES:
        draw.rectangle(GATE_BOX, fill=(255, 255, 255))
    if state == "unknown-layout":
        # Bright, but nowhere near an item band and with the logo gate dark, so
        # the observer must answer "not the title screen" without ever asking
        # which title items it has.
        draw.rectangle((1400, 200, 2300, 900), fill=(255, 255, 255))
        return image
    for name, how in lit.items():
        draw.rectangle(band_box(POINTS[name], 1.0 if how == "on" else 0.5),
                       fill=(255, 255, 255))
    return image


def main(argv):
    if len(argv) != 1:
        print(__doc__.strip().splitlines()[-1], file=sys.stderr)
        return 2
    outdir = argv[0]
    for state, lit in STATES.items():
        render(state, lit).save(f"{outdir}/{state}.png")
    model = {
        "schema": "title-model-v1",
        "build": "synthetic-fixture -- NOT a device model",
        "captured": "synthetic",
        "frames": 0,
        "band": list(BAND),
        "bright_min": BRIGHT_MIN,
        "present_min": 0.80,
        "absent_max": 0.20,
        "title_gate": {"box": list(GATE_BOX), "min": 0.80, "max_absent": 0.20},
        "items": {name: list(point) for name, point in POINTS.items()},
    }
    with open(f"{outdir}/synthetic-title-model.json", "w", encoding="utf-8") as handle:
        json.dump(model, handle, indent=2)
        handle.write("\n")
    print(f"{len(STATES)} synthetic title frames and one synthetic model")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
