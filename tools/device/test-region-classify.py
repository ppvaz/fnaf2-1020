#!/usr/bin/env python3
"""Mock regression for the interaction classifier. Synthetic frames, no phone.

The classifier answers what one held touch did. It must distinguish the three
outcomes plans/10 package 0 names -- it happened, it was dropped, it panned
instead -- and it must not confuse a light with a pan, because that confusion
is what cost two nights: a finger that missed a light hitbox landed in the pan
band, and nothing in the run noticed.

The synthetic frames prove the decision, never the thresholds. Those are
measured on the phone and recorded in plans/10.
"""
import subprocess
import sys
import tempfile
import warnings
from pathlib import Path

warnings.simplefilter("ignore")
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
GEOMETRY = (2400, 1080)
HALL = (900, 300, 1700, 800)
VENTL = (60, 250, 620, 900)
STRIP = (0, 120, 2400, 300)


def frame(lit=None, strip_shift=0):
    """A dark office with a textured strip, optionally lit, optionally panned."""
    im = Image.new("RGB", GEOMETRY, (10, 10, 12))
    d = ImageDraw.Draw(im)
    # Non-periodic on purpose. The first version drew bars every 100 px and
    # shifted by 400, which is the same picture -- the fixture could not have
    # failed whatever the classifier did. A texture with no period cannot be
    # shifted onto itself.
    x = strip_shift % 2400
    for width, gap in ((37, 61), (23, 97), (71, 43), (17, 131), (53, 79),
                       (29, 113), (89, 31), (41, 67)) * 3:
        d.rectangle((x, 120, x + width, 300), fill=(120, 120, 120))
        x = (x + width + gap) % 2400
    if lit:
        d.rectangle(lit, fill=(200, 200, 200))
    return im


def verdict(pre, during, post, tmp):
    for name, im in (("pre", pre), ("during", during), ("post", post)):
        im.save(f"{tmp}/{name}.png")
    out = subprocess.run(
        [sys.executable, str(HERE / "region-classify.py"),
         f"{tmp}/pre.png", f"{tmp}/during.png", f"{tmp}/post.png"],
        capture_output=True, text=True, check=False)
    return out.stdout.strip()


def main():
    failed = 0
    with tempfile.TemporaryDirectory() as tmp:
        cases = [
            # name, pre, during, post, expected
            ("a held hall light", frame(), frame(HALL), frame(), "hall"),
            ("a held left vent light", frame(), frame(VENTL), frame(), "ventL"),
            # A pan is the only outcome that persists after release. Nothing
            # lights up, and the view is somewhere else afterwards.
            ("a pan", frame(), frame(strip_shift=400), frame(strip_shift=400), "PAN"),
            # The case the vocabulary exists for: the contact was delivered and
            # the game did nothing with it.
            ("a dropped contact", frame(), frame(), frame(), "-"),
            # A light must not be read as a pan just because the frame changed:
            # the view is back where it started once the contact is released.
            ("a light is not a pan", frame(), frame(HALL), frame(), "hall"),
        ]
        for name, pre, during, post, want in cases:
            got = verdict(pre, during, post, tmp)
            if got != want:
                print(f"FAIL {name}: expected {want!r}, got {got!r}")
                failed += 1
    if failed:
        print(f"{failed} interaction-classifier check(s) failed")
        return 1
    print("interaction classifier: hall, vent, pan, dropped contact, "
          "and a light that is not a pan")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
