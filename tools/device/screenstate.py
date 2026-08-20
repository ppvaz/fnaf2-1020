#!/usr/bin/env python3
"""Classify an adb screencap (stdin): prints night, gameover, or other.

night = the office HUD is on screen: flashlight meter lit top-left, or the
pink mask bar bottom-left (still visible in the masked view). Title, game
over, jumpscare and static otherwise read "other". `gameover` additionally
requires both the red face and bright lower-center text, avoiding false
positives on a jumpscare or title screen. 2400x1080 landscape.
"""
import sys, warnings
from PIL import Image, UnidentifiedImageError

warnings.simplefilter("ignore")
try:
    im = Image.open(sys.stdin.buffer).convert("RGB")
except (OSError, UnidentifiedImageError):
    print("invalid screenshot", file=sys.stderr)
    raise SystemExit(2)
if im.size != (2400, 1080):
    im = im.resize((2400, 1080))

def mean(box):
    px = im.crop(box).resize((16, 16))
    data = list(px.getdata())
    n = len(data)
    return tuple(sum(c[i] for c in data) / n for i in range(3))

def fraction(box, predicate):
    data = list(im.crop(box).resize((32, 32)).getdata())
    return sum(1 for pixel in data if predicate(*pixel)) / len(data)

flash = mean((95, 40, 260, 95))
maskbar = mean((70, 1000, 1180, 1045))
night = flash[0] > 90 or (maskbar[0] > 50 and maskbar[0] > maskbar[2] * 1.3)
red_face = fraction(
    (650, 450, 1750, 920),
    lambda r, g, b: r > 80 and r > g * 1.5 and r > b * 1.3,
)
bright_text = fraction(
    (900, 950, 1450, 1040),
    lambda r, g, b: min(r, g, b) > 150,
)
gameover = red_face > 0.05 and bright_text > 0.08

if night:
    print("night")
elif gameover:
    print("gameover")
else:
    print("other")
