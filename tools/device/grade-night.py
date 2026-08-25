#!/usr/bin/env python3
"""How long was the run actually ALIVE, and what ended it?

This exists because a run length was reported that the run did not achieve.
Night 6-37 was published at 153 s and night 6-36 at 163 s -- a new record -- and the
retained classifier frames showed what those seconds contained: a monitor flip,
then a "12:00 AM 6th Night" restart screen, then static, then the "Take cake to
the children" death minigame. The game had died around 70 s and the pilot kept
pressing into it, because the watchdog's fast path recognised exactly one way of
being dead (the static screen) and answered "night" to everything else.

Wall time between "night started" and "the driver stopped" is not survival. It
is only survival if something checked the game was still running throughout, and
nothing did. So this reads the recording and reports the interval the HUD was
actually present, using the same predicate screenstate.py uses live:

    the flashlight meter, or the mask bar at the bottom of the office.

Neither is drawn on the death static, the death minigames, the night-start card
or the title menu, which is precisely why those screens are what a dead run
looks like to it.

Usage: grade-night.py VIDEO [--fps 4] [--require-seconds 420]

Exit status is non-zero when the run did not reach --require-seconds, so this
can gate a claim rather than merely describe one.
"""
import argparse
import subprocess
import sys

# The recording is 1280x576; screenstate.py's rows are in 2400x1080 device
# coordinates. Same regions, scaled once here rather than in three places.
WIDTH, HEIGHT = 1280, 576
SCALE_X, SCALE_Y = WIDTH / 2400, HEIGHT / 1080
FLASH = (int(95 * SCALE_X), int(45 * SCALE_Y), int(260 * SCALE_X), int(85 * SCALE_Y))
MASKBAR = (int(70 * SCALE_X), int(1004 * SCALE_Y), int(1180 * SCALE_X), int(1044 * SCALE_Y))


def decode(path, fps):
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={fps},scale={WIDTH}:{HEIGHT}",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True)
    if out.returncode:
        sys.stderr.buffer.write(out.stderr)
        raise SystemExit(out.returncode)
    size = WIDTH * HEIGHT * 3
    return [out.stdout[i:i + size] for i in range(0, len(out.stdout) - size + 1, size)]


def channel_mean(frame, box, step=2):
    x0, y0, x1, y1 = box
    total = [0, 0, 0]
    count = 0
    for y in range(y0, y1, step):
        row = y * WIDTH
        for x in range(x0, x1, step):
            i = (row + x) * 3
            total[0] += frame[i]
            total[1] += frame[i + 1]
            total[2] += frame[i + 2]
            count += 1
    return [v / max(count, 1) for v in total]


def is_night(frame):
    """screenstate.py's live predicate, frame for frame."""
    flash = channel_mean(frame, FLASH)
    maskbar = channel_mean(frame, MASKBAR)
    return flash[0] > 90 or (maskbar[0] > 50 and maskbar[0] > maskbar[2] * 1.3)


def describe_end(frame):
    """What the first dead frame looks like, for the report only."""
    mean = sum(channel_mean(frame, (0, 0, WIDTH, HEIGHT), step=8)) / 3
    # Static is bright and violently high-frequency; the minigames and the
    # night-start card are mostly black.
    edges = 0
    samples = 0
    for y in range(0, HEIGHT, 12):
        row = y * WIDTH
        for x in range(0, WIDTH - 4, 12):
            a = frame[(row + x) * 3]
            b = frame[(row + x + 4) * 3]
            edges += abs(a - b)
            samples += 1
    edge = edges / max(samples, 1)
    if mean > 90 and edge > 40:
        return f"death static (mean {mean:.0f}, edge {edge:.0f})"
    if mean < 25:
        return f"dark screen -- minigame, night-start card or menu (mean {mean:.0f})"
    return f"not a night HUD (mean {mean:.0f}, edge {edge:.0f})"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video")
    p.add_argument("--fps", type=float, default=4.0)
    p.add_argument("--require-seconds", type=float, default=None,
                   help="exit non-zero unless the night ran at least this long")
    p.add_argument("--settle", type=int, default=3,
                   help="consecutive frames needed to call a state change")
    a = p.parse_args()

    frames = decode(a.video, a.fps)
    if not frames:
        print(f"{a.video}: no frames", file=sys.stderr)
        raise SystemExit(2)
    flags = [is_night(f) for f in frames]

    def run_start(want, frm):
        streak = 0
        for i in range(frm, len(flags)):
            streak = streak + 1 if flags[i] == want else 0
            if streak >= a.settle:
                return i - a.settle + 1
        return None

    start = run_start(True, 0)
    if start is None:
        print(f"{a.video}: the HUD is never present -- no night ran at all")
        raise SystemExit(1)
    end = run_start(False, start + a.settle)

    t = lambda i: i / a.fps
    alive = (t(end) if end is not None else t(len(flags))) - t(start)
    print(f"{a.video}: {len(frames)} frames at {a.fps} fps")
    print(f"  night HUD appears at {t(start):.1f}s")
    if end is None:
        print(f"  HUD still present at the end of the recording ({t(len(flags)):.1f}s)")
        print(f"  ALIVE for at least {alive:.1f}s -- the recording ends first, "
              "so this is a lower bound")
    else:
        print(f"  HUD gone from {t(end):.1f}s: {describe_end(frames[end])}")
        print(f"  ALIVE for {alive:.1f}s")
        tail = sum(1 for f in flags[end:] if f)
        if tail:
            print(f"  note: the HUD returns for {tail} later frames -- the game "
                  "restarted or the menu was re-entered while the pilot kept pressing")

    if a.require_seconds is not None:
        if alive + 1e-6 < a.require_seconds:
            print(f"\nFAIL: {alive:.1f}s alive, {a.require_seconds:.0f}s required. "
                  "Wall-clock length is not survival; only this interval is.")
            raise SystemExit(1)
        print(f"\nPASS: {alive:.1f}s alive, {a.require_seconds:.0f}s required.")


if __name__ == "__main__":
    main()
