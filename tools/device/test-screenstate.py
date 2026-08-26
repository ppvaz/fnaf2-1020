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


def noise_frame(seed=12345):
    """Deterministic per-pixel noise: the death static's signature is roughness,
    not brightness. The real one is DARK (frame mean 34.1), the same as the
    office, so a brightness test cannot separate them."""
    im = Image.new("L", (2400, 1080))
    px = im.load()
    state = seed
    for y in range(1080):
        for x in range(0, 2400, 1):
            state = (state * 1103515245 + 12345) & 0x7FFFFFFF
            px[x, y] = (state >> 16) % 90
    return im.convert("RGB")


def lifecycle(im, tmp):
    path = f"{tmp}/l.png"
    im.save(path)
    with open(path, "rb") as fh:
        out = subprocess.run([sys.executable, str(HERE / "lifecycle-observe.py")],
                             stdin=fh, capture_output=True, text=True, check=False)
    return out.stdout.strip()


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
        # --- the lifecycle refinement, which adds classes and never overrides
        # the authority. The death path this reproduces was captured on a real
        # Night 1: night -> static -> gameover -> title, every frame named.
        # Text, not solid blocks. The real logo box overlaps screenstate's
        # flashlight box, and the real logo is thin strokes -- that box means
        # 40.8 on a title screen, well under the 90 that would call it a night.
        # A solid fill there makes the fixture a night, which is what the first
        # version of this test did.
        # Bars wide enough to survive the classifier's 32-column downsample --
        # a 2 px bar averages to grey and vanishes -- but sparse enough that the
        # box mean stays under screenstate's 90. 16 px every 80 px is 20%
        # coverage: mean about 51, bright fraction about 0.16 against a 0.05
        # threshold. The real logo measures 40.8 and 0.112.
        def strokes(draw, box, step=80, bar=16):
            x0, y0, x1, y1 = box
            for x in range(x0, x1 - bar, step):
                draw.rectangle((x, y0, x + bar, y1), fill=(255, 255, 255))

        d = ImageDraw.Draw
        title = frame(dark)
        t = d(title); strokes(t, (150, 40, 560, 140)); strokes(t, (1780, 830, 2310, 900))
        dialog = frame(dark)
        strokes(d(dialog), (150, 40, 560, 140))
        options = frame(dark)
        strokes(d(options), (1530, 100, 2030, 220))
        lifecycle_cases = [
            ("static is roughness, not brightness", noise_frame(), "state=static"),
            ("the New Game newspaper", frame(bright, flash=True), "state=newspaper"),
            ("the title menu", title, "state=title"),
            ("the New Game confirmation", dialog, "state=titleDialog"),
            ("the Options screen", options, "state=options"),
            ("a night is left to the authority", frame(dark, flash=True), "state=night"),
        ]
        with tempfile.TemporaryDirectory() as tmp2:
            for name, im, want in lifecycle_cases:
                got = lifecycle(im, tmp2)
                if got != want:
                    print(f"FAIL lifecycle {name}: expected {want!r}, got {got!r}")
                    failed += 1
    if failed:
        print(f"{failed} screenstate check(s) failed")
        return 1
    print("screenstate: a lit meter and a mask bar are nights, a frame bright all "
          "over is not; lifecycle names static, newspaper, title, dialog, options")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
