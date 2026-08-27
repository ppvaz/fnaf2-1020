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


def stream(path, fps, pix, depth):
    """Yield decoded frames one at a time.

    This used to buffer the whole decode with capture_output and then slice it
    into a second full copy. A 440 s night at 60 fps is 26,400 frames of
    1280x576x3, about 58 GB, and the grader was OOM-killed ("Killed: 9")
    partway through a cleared Night 1 -- taking with it the only instrument
    that says whether the sweep's light actually flashed.

    Nothing here ever needed a frame twice: both callers reduce each frame to
    one scalar. So the frames stream and only the two scalar series are kept.
    """
    size = WIDTH * HEIGHT * depth
    proc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={fps},scale={WIDTH}:{HEIGHT}",
         "-f", "rawvideo", "-pix_fmt", pix, "-"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        while True:
            buf = proc.stdout.read(size)
            if len(buf) < size:
                break
            yield buf
    finally:
        proc.stdout.close()
        err = proc.stderr.read()
        # A decoder that dies mid-file must not read as a short video: this
        # tool's whole job is saying what the run contained.
        if proc.wait():
            sys.stderr.buffer.write(err)
            raise SystemExit(proc.returncode)


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

    x0, y0, x1, y1 = FEED

    def luma(f):
        t = c = 0
        for y in range(y0, y1, 4):
            r = y * WIDTH
            for x in range(x0, x1, 4):
                t += f[r + x]; c += 1
        return t / c

    feed = [luma(f) for f in stream(a.video, a.fps, "gray", 1)]
    sel = [selected(f) for f in stream(a.video, a.fps, "rgb24", 3)]
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
