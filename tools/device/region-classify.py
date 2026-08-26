#!/usr/bin/env python3
"""Classify what one held touch did, from three office frames.

    region-classify.py pre.png during.png post.png [--verbose]

Prints one token: ventL | hall | PAN | - , and exits 0. With --verbose it also
prints the three region deltas it decided from, which is what a threshold
argument should be had against.

Deliberately a classification, not a measurement. Pan DISPLACEMENT was tried by
strip matching first and could not be trusted -- at full traverse the tracked
content leaves the strip and the matcher returns a confident wrong number. The
scroll is an integer clamped to [512, 1088] in the event sheet and is better
read there; what the phone is needed for is which screen coordinate produces
which outcome.
"""
import sys
import warnings

warnings.simplefilter("ignore")

GEOMETRY = (2400, 1080)
HALL = (900, 300, 1700, 800)
VENTL = (60, 250, 620, 900)
STRIP = (0, 120, 2400, 300)
LIGHT_DELTA = 6.0
PAN_DELTA = 6.0


def mean(image, box):
    data = list(image.crop(box).resize((24, 24)).getdata())
    return sum(sum(p) for p in data) / (len(data) * 3)


def mad(a, b, box):
    """Mean absolute per-pixel difference over a box.

    The pan test used to be `abs(mean(post) - mean(pre))`, which a synthetic
    fixture caught: a pan that moves the view without changing the strip's
    AVERAGE brightness reads as nothing at all. It passed on the phone only
    because panning happens to reveal differently-lit content there. A pan is a
    change in WHERE things are, so it has to be compared per pixel."""
    pa = list(a.crop(box).convert("L").resize((120, 24)).getdata())
    pb = list(b.crop(box).convert("L").resize((120, 24)).getdata())
    return sum(abs(x - y) for x, y in zip(pa, pb)) / len(pa)


def load(path):
    from PIL import Image
    im = Image.open(path).convert("RGB")
    return im if im.size == GEOMETRY else im.resize(GEOMETRY)


def main(argv):
    if len(argv) < 3:
        print("usage: region-classify.py pre.png during.png post.png", file=sys.stderr)
        return 2
    pre, during, post = (load(p) for p in argv[:3])
    hall = mean(during, HALL) - mean(pre, HALL)
    vent = mean(during, VENTL) - mean(pre, VENTL)
    # A pan is the only outcome that persists after the contact is released.
    pan = mad(pre, post, STRIP)
    if vent >= LIGHT_DELTA and vent >= hall:
        verdict = "ventL"
    elif hall >= LIGHT_DELTA:
        verdict = "hall"
    elif pan >= PAN_DELTA:
        verdict = "PAN"
    else:
        verdict = "-"
    if "--verbose" in argv:
        print(f"{verdict}  hall={hall:+.2f} ventL={vent:+.2f} pan={pan:+.2f}")
    else:
        print(verdict)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
