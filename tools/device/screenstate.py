#!/usr/bin/env python3
"""Classify an adb screencap (stdin): prints "night" or "other".

night = the office HUD is on screen: flashlight meter lit top-left, or the
pink mask bar bottom-left (still visible in the masked view). Title, game
over, jumpscare and static all read "other". 2400x1080 landscape.
"""
import sys, warnings
from PIL import Image

warnings.simplefilter("ignore")
im = Image.open(sys.stdin.buffer).convert("RGB")
if im.size != (2400, 1080):
    im = im.resize((2400, 1080))

def mean(box):
    px = im.crop(box).resize((16, 16))
    data = list(px.getdata())
    n = len(data)
    return tuple(sum(c[i] for c in data) / n for i in range(3))

flash = mean((95, 40, 260, 95))
maskbar = mean((70, 1000, 1180, 1045))
night = flash[0] > 90 or (maskbar[0] > 50 and maskbar[0] > maskbar[2] * 1.3)
print("night" if night else "other")
