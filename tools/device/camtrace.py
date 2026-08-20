#!/usr/bin/env python3
"""Report stable 10 -> 04 -> 07 -> 11 camera sweeps in a trial video.

The lime selected-camera buttons provide a stronger post-run signal than ADB's
printed command log. Brief white flashlight frames and map transitions are
ignored. This tool never participates in the live timed loop.

Usage: camtrace.py captures/run.mp4
"""

import argparse
import subprocess
import sys


WIDTH = 430
HEIGHT = 110
FPS = 30
FRAME_SIZE = WIDTH * HEIGHT * 3
CROP_X = 850
CROP_Y = 300
CAMERAS = {
    10: (1091 - CROP_X, 384 - CROP_Y),
    4: (923 - CROP_X, 379 - CROP_Y),
    7: (947 - CROP_X, 328 - CROP_Y),
    11: (1213 - CROP_X, 365 - CROP_Y),
}


def decode(path):
    command = [
        "ffmpeg", "-v", "error", "-i", path,
        "-vf", f"fps={FPS},scale=1280:576,crop={WIDTH}:{HEIGHT}:{CROP_X}:{CROP_Y}",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ]
    result = subprocess.run(command, capture_output=True)
    if result.returncode:
        sys.stderr.buffer.write(result.stderr)
        raise SystemExit(result.returncode)
    if not result.stdout:
        raise SystemExit(f"no video frames decoded from {path}")
    return [
        result.stdout[i:i + FRAME_SIZE]
        for i in range(0, len(result.stdout) - FRAME_SIZE + 1, FRAME_SIZE)
    ]


def lime_score(frame, center):
    center_x, center_y = center
    score = 0
    for y in range(max(0, center_y - 24), min(HEIGHT, center_y + 25), 2):
        for x in range(max(0, center_x - 48), min(WIDTH, center_x + 49), 2):
            start = (y * WIDTH + x) * 3
            red, green, blue = frame[start:start + 3]
            if red > 100 and green > 100 and blue < 100 and green > blue * 1.5:
                score += 1
    return score


def classify(frame):
    scores = {camera: lime_score(frame, center) for camera, center in CAMERAS.items()}
    camera = max(scores, key=scores.get)
    return camera if scores[camera] >= 30 else None


def stable_runs(states):
    start = 0
    for i in range(1, len(states) + 1):
        if i == len(states) or states[i] != states[start]:
            if states[start] is not None and i - start >= round(FPS * 0.10):
                yield states[start], start, i
            start = i


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument(
        "--expected", type=int,
        help="expected number of complete sweeps; exit nonzero if fewer appear",
    )
    args = parser.parse_args()

    frames = decode(args.video)
    detected = list(stable_runs([classify(frame) for frame in frames]))
    print(f"{args.video}: selected-camera trace at {FPS} fps")
    if not detected:
        print("  no stable target-camera highlights detected")
        return

    for camera, start, end in detected:
        print(
            f"  cam {camera:02d}  {start / FPS:6.2f}s -> {end / FPS:6.2f}s  "
            f"({(end - start) / FPS:4.2f}s)"
        )

    sequence = []
    for camera, _, _ in detected:
        if not sequence or sequence[-1] != camera:
            sequence.append(camera)
    sweeps = 0
    misses = 0
    for i, camera in enumerate(sequence):
        if camera != 10:
            continue
        tail = sequence[i:i + 4]
        if tail == [10, 4, 7, 11]:
            sweeps += 1
        else:
            misses += 1
    expected = f"/{args.expected}" if args.expected is not None else ""
    print(
        f"summary: {sweeps}{expected} complete 10-04-07-11 sweeps, "
        f"{misses} incomplete sweep starts"
    )
    if args.expected is not None and sweeps < args.expected:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
