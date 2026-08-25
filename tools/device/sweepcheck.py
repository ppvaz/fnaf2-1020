#!/usr/bin/env python3
"""Did the sweep actually *flash* each camera, not merely select it?

camtrace.py reads the lime highlight on the camera map, which answers "which
camera is selected". A Minus 7 sweep exists to apply the camera-light stun, and
that needs the light on *while* that camera is the selected feed. A trace of
selections alone cannot tell a working sweep from three selections in the dark
-- the same distinction HID-MULTITOUCH.md draws when it says two Android
pointer dots are not sufficient evidence.

This pairs both signals per frame: the map highlight for the camera, and the
feed's own brightness for the light. A lit frame is several times the unlit
baseline, so the threshold is taken from the recording rather than hardcoded.

Usage: sweepcheck.py VIDEO [--fps 60] [--expect 10,4,7]
"""
import argparse
import subprocess
import sys

WIDTH, HEIGHT = 1280, 576
MAP = {10: (1091, 384), 4: (923, 379), 7: (947, 328), 11: (1213, 365)}
FEED = (60, 60, 620, 430)


def decode(path, fps, pix, depth):
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={fps},scale={WIDTH}:{HEIGHT}",
         "-f", "rawvideo", "-pix_fmt", pix, "-"], capture_output=True)
    if out.returncode:
        sys.stderr.buffer.write(out.stderr)
        raise SystemExit(out.returncode)
    size = WIDTH * HEIGHT * depth
    return [out.stdout[i:i + size] for i in range(0, len(out.stdout) - size + 1, size)]


def selected(frame):
    best, score = None, 0
    for cam, (cx, cy) in MAP.items():
        s = 0
        for y in range(max(0, cy - 24), min(HEIGHT, cy + 25), 2):
            for x in range(max(0, cx - 48), min(WIDTH, cx + 49), 2):
                i = (y * WIDTH + x) * 3
                r, g, b = frame[i:i + 3]
                if r > 100 and g > 100 and b < 100 and g > b * 1.5:
                    s += 1
        if s > score:
            best, score = cam, s
    return best if score >= 30 else None


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video")
    p.add_argument("--fps", type=int, default=60)
    p.add_argument("--expect", default="10,4,7")
    p.add_argument("--lit-ratio", type=float, default=2.0,
                   help="times the unlit baseline that counts as a lit feed")
    a = p.parse_args()

    grey = decode(a.video, a.fps, "gray", 1)
    rgb = decode(a.video, a.fps, "rgb24", 3)
    x0, y0, x1, y1 = FEED

    def luma(f):
        t = c = 0
        for y in range(y0, y1, 4):
            r = y * WIDTH
            for x in range(x0, x1, 4):
                t += f[r + x]; c += 1
        return t / c

    feed = [luma(f) for f in grey]
    sel = [selected(f) for f in rgb]
    # Baseline from the monitor-up frames that are not flashing: the lower
    # quartile of frames where some camera is selected.
    up = sorted(feed[i] for i, s in enumerate(sel) if s is not None)
    if not up:
        print("no camera ever selected"); raise SystemExit(1)
    base = up[len(up) // 4]
    thresh = base * a.lit_ratio

    want = [int(v) for v in a.expect.split(",")]
    sweeps, cur, last11 = [], {}, True
    for i, cam in enumerate(sel):
        if cam == 11:
            if cur and not last11:
                sweeps.append(cur); cur = {}
            last11 = True
            continue
        if cam is None:
            continue
        last11 = False
        if feed[i] >= thresh:
            cur[cam] = cur.get(cam, 0) + 1
    if cur:
        sweeps.append(cur)

    print(f"{a.video}: unlit baseline {base:.0f}, lit threshold {thresh:.0f}")
    ok = 0
    for n, s in enumerate(sweeps, 1):
        flashed = [c for c in want if s.get(c)]
        missing = [c for c in want if not s.get(c)]
        if not missing:
            ok += 1
        detail = " ".join(f"cam{c:02d}={s.get(c,0)}f" for c in want)
        print(f"  sweep {n}: {detail}" +
              ("" if not missing else "   NOT FLASHED: " + ",".join(f"cam{c:02d}" for c in missing)))
    print(f"summary: {ok}/{len(sweeps)} sweeps flashed all of {a.expect}")
    if ok < len(sweeps):
        sys.exit(1)


if __name__ == "__main__":
    main()
