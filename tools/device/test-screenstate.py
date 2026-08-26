#!/usr/bin/env python3
"""Regression for the alive/dead authority and the lifecycle refinement.

`screenstate.py` decides whether a night is running, and everything downstream
trusts it. On 2026-08-26 it was found to answer `night` to the "HELP WANTED"
newspaper -- the cutscene a New Game plays -- because that screen is bright
everywhere and the flashlight-meter test therefore passes. No route had ever
pressed New Game, so the gap had never been reachable; plans/13's fresh-save
ladder makes it reachable.

These fixtures are synthetic and prove the DECISION, not the thresholds. The
thresholds are measured on the phone and recorded in screenstate.py's docstring.
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


def frame(bg, flash=False, maskbar=False):
    im = Image.new("RGB", GEOMETRY, bg)
    d = ImageDraw.Draw(im)
    if flash:                                  # the lit flashlight meter
        d.rectangle((95, 40, 260, 95), fill=(230, 230, 230))
    if maskbar:                                # the pink mask bar
        d.rectangle((70, 1000, 1180, 1045), fill=(200, 90, 120))
    return im


def verdict(im, tmp):
    path = f"{tmp}/f.png"
    im.save(path)
    with open(path, "rb") as fh:
        out = subprocess.run([sys.executable, str(HERE / "screenstate.py")],
                             stdin=fh, capture_output=True, text=True, check=False)
    return out.stdout.strip()


def main():
    failed = 0
    dark, bright = (14, 14, 16), (200, 200, 198)
    with tempfile.TemporaryDirectory() as tmp:
        cases = [
            ("a dark office with a lit meter", frame(dark, flash=True), "night"),
            ("a dark office with the mask bar", frame(dark, maskbar=True), "night"),
            ("a dark screen with neither", frame(dark), "other"),
            # The regression. Bright everywhere, so the meter test passes on
            # brightness that is not a meter. It must not read as a night.
            ("a uniformly bright cutscene", frame(bright, flash=True), "other"),
            ("a uniformly bright screen", frame(bright), "other"),
        ]
        for name, im, want in cases:
            got = verdict(im, tmp)
            if got != want:
                print(f"FAIL {name}: expected {want!r}, got {got!r}")
                failed += 1
    if failed:
        print(f"{failed} screenstate check(s) failed")
        return 1
    print("screenstate: a lit meter and a mask bar are nights; "
          "a frame that is bright all over is not")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
