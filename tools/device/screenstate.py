#!/usr/bin/env python3
"""Classify an adb screencap: prints night, gameover, or other.

night = the office HUD is on screen: flashlight meter lit top-left, or the
pink mask bar bottom-left (still visible in the masked view). Title, game
over, jumpscare and static otherwise read "other". `gameover` additionally
requires both the red face and bright lower-center text, avoiding false
positives on a jumpscare or title screen. 2400x1080 landscape.

Default mode reads a PNG from stdin. `--adb-fast [timeout]` captures a raw
frame on-device and transfers only ten scanlines used by the night predicate.
That avoids moving a multi-megabyte PNG over USB for every safety-watch poll.
"""
import os
import subprocess
import sys
import warnings
from PIL import Image, UnidentifiedImageError

warnings.simplefilter("ignore")


def channel_mean(rows, x0, x1):
    total = [0, 0, 0]
    count = 0
    for row in rows:
        segment = row[x0 * 4:x1 * 4]
        for offset in range(0, len(segment), 4):
            total[0] += segment[offset]
            total[1] += segment[offset + 1]
            total[2] += segment[offset + 2]
            count += 1
    return tuple(value / count for value in total)


def fast_adb_state(timeout):
    width = 2400
    stride = width * 4
    ys = (45, 55, 65, 75, 85, 1004, 1014, 1024, 1034, 1044)
    remote = f"/data/local/tmp/fnaf2-watch-{os.getpid()}.raw"
    reads = "; ".join(
        f"dd if=$raw bs=1 skip={16 + y * stride} count={stride} 2>/dev/null"
        for y in ys
    )
    script = (
        f"raw={remote}; trap 'rm -f $raw' EXIT HUP INT TERM; "
        f"screencap > $raw || exit 2; {reads}"
    )
    try:
        result = subprocess.run(
            ["adb", "exec-out", "sh", "-c", script],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise SystemExit(2)
    expected = len(ys) * stride
    if result.returncode != 0 or len(result.stdout) != expected:
        raise SystemExit(2)
    rows = [
        result.stdout[index:index + stride]
        for index in range(0, expected, stride)
    ]
    flash = channel_mean(rows[:5], 95, 260)
    maskbar = channel_mean(rows[5:], 70, 1180)
    night = flash[0] > 90 or (
        maskbar[0] > 50 and maskbar[0] > maskbar[2] * 1.3
    )
    print("night" if night else "other")


if len(sys.argv) > 1 and sys.argv[1] == "--adb-fast":
    try:
        capture_timeout = float(sys.argv[2]) if len(sys.argv) > 2 else 0.8
    except ValueError:
        raise SystemExit(2)
    if capture_timeout <= 0:
        raise SystemExit(2)
    fast_adb_state(capture_timeout)
    raise SystemExit(0)

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
