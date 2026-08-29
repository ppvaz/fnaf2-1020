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
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nightpredicate  # noqa: E402
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
    """Yield decoded frames without retaining the recording in host memory."""
    proc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-threads", "1", "-filter_threads", "1", "-i", path, "-vf", f"fps={fps},scale={WIDTH}:{HEIGHT}",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    size = WIDTH * HEIGHT * 3
    try:
        while True:
            frame = proc.stdout.read(size)
            if len(frame) < size:
                break
            yield frame
    finally:
        proc.stdout.close()
        stderr = proc.stderr.read()
        if proc.wait():
            sys.stderr.buffer.write(stderr)
            raise SystemExit(proc.returncode)


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
    """The shared predicate, evaluated at this file's video geometry.

    Until 2026-08-26 this was a hand copy whose docstring said "screenstate.py's
    live predicate, frame for frame" -- and it stopped being that the moment
    screenstate gained its global-brightness guard and this did not. It is now
    the same rule, sampled here rather than restated."""
    def sample(fx0, fy0, fx1, fy1):
        return channel_mean(frame, (max(0, int(fx0 * WIDTH)), max(0, int(fy0 * HEIGHT)),
                                    min(WIDTH, max(int(fx1 * WIDTH), int(fx0 * WIDTH) + 1)),
                                    min(HEIGHT, max(int(fy1 * HEIGHT), int(fy0 * HEIGHT) + 1))))
    return nightpredicate.is_night(sample)


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


def hud_gaps(flags, frm=0):
    """Every [i, j) stretch where the HUD is absent, from index `frm`."""
    i, out = frm, []
    while i < len(flags):
        if flags[i]:
            i += 1
            continue
        j = i
        while j < len(flags) and not flags[j]:
            j += 1
        out.append((i, j))
        i = j
    return out


def find_end(flags, start, settle, static_at):
    """Index where the HUD goes away for good, or None if the run never ended.

    A HUD-absent gap is NOT death. The office HUD is not drawn while the monitor
    is up, and this controller lives on the monitor: the cleared Night 1
    (`n1-full-1640`) spends 3.5 s of every 5 s cycle in the cams and 5.3 s at
    the opening. Ending the run at the first such gap graded that 418-second
    WINNING run at 6.5 s -- wrong by a factor of 64, by the tool CLAUDE.md calls
    "the only number that is a run length".

    So a gap ends the run only when it contains the death static. `static_at(i)`
    is injected rather than computed here so this is testable on flag sequences
    alone. The original failure is still caught: the 163 s claim contained the
    static, and a terminal gap is still described by its contents whatever they
    are, because the HUD never comes back after a real death.
    """
    for i, j in hud_gaps(flags, start + settle):
        if j - i < settle:
            continue
        step = max(1, (j - i) // 8 or 1)
        for k in range(i, j, step):
            if static_at(k):
                return i
    return None


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video")
    p.add_argument("--fps", type=float, default=4.0)
    p.add_argument("--require-seconds", type=float, default=None,
                   help="exit non-zero unless the night ran at least this long")
    p.add_argument("--settle", type=int, default=3,
                   help="consecutive frames needed to call a state change")
    a = p.parse_args()

    # Keep only the two facts this grader needs from each frame.  A 420-second
    # 1280x576 RGB recording is ~4.3 GB at 4 fps; retaining it here can freeze
    # the host before any verdict is printed.
    flags, descriptions = [], []
    for frame in decode(a.video, a.fps):
        flags.append(is_night(frame))
        descriptions.append(describe_end(frame))
    if not flags:
        print(f"{a.video}: no frames", file=sys.stderr)
        raise SystemExit(2)
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

    # A HUD-absent gap is NOT death. The office HUD is not drawn while the
    # monitor is up, and this controller lives on the monitor: the cleared
    # Night 1 (`n1-full-1640`) spends 3.5 s of every 5 s cycle in the cams and
    # 5.3 s at the opening. Reporting the first such gap as the end graded that
    # 418-second WINNING run at 6.5 s -- wrong by a factor of 64, by the tool
    # CLAUDE.md calls "the only number that is a run length".
    #
    # So a gap ends the run only when it CONTAINS evidence of death. The
    # original failure this file exists for is unaffected: after a real death
    # the HUD never returns, so the final gap runs to the end of the recording
    # and is graded on its contents exactly as before.
    def fatal(gap):
        """Does this HUD-absent stretch contain something only a DEAD run shows?

        Only the death static counts, and the distinction matters: `dark screen`
        is ambiguous. A dark camera feed, a raised mask and a death minigame all
        read as `mean < 25`, so treating dark as death regraded the cleared
        Night 1 at 313 s instead of ~418 s -- better than the 6.5 s it reported
        before, and still wrong, for exactly the reason this file exists.

        The original failure is still caught: the 163 s claim contained the
        death static, and a terminal gap (one with no HUD after it) is still
        described by its contents whatever they are.
        """
        i, j = gap
        for k in range(i, j, max(1, (j - i) // 8 or 1)):
            d = descriptions[k]
            if d.startswith("death static"):
                return d
        return None

    def unexplained(gap):
        """A dark gap the run came back from. Reported, never silently benign."""
        i, j = gap
        for k in range(i, j, max(1, (j - i) // 8 or 1)):
            if descriptions[k].startswith("dark screen"):
                return True
        return False

    t = lambda i: i / a.fps
    end, end_reason = None, None
    end = find_end(flags, start, a.settle,
                   lambda i: descriptions[i].startswith('death static'))
    if end is not None:
        end_reason = descriptions[end + 1] if end + 1 < len(flags) else descriptions[end]

    last_hud = max(i for i, f in enumerate(flags) if f)
    alive = (t(end) if end is not None else t(last_hud + 1)) - t(start)
    monitor_gaps = [g for g in hud_gaps(flags, start + a.settle)
                    if g[1] - g[0] >= a.settle and not fatal(g)
                    and (end is None or g[0] < end)]
    print(f"{a.video}: {len(flags)} frames at {a.fps} fps")
    print(f"  night HUD appears at {t(start):.1f}s")
    if monitor_gaps:
        longest = max(monitor_gaps, key=lambda g: g[1] - g[0])
        print(f"  {len(monitor_gaps)} HUD-absent stretches contain no death static "
              f"-- the monitor is up; longest {t(longest[1]) - t(longest[0]):.1f}s "
              f"at {t(longest[0]):.1f}s")
        dark = [g for g in monitor_gaps if unexplained(g)]
        if dark:
            worst = max(dark, key=lambda g: g[1] - g[0])
            print(f"  {len(dark)} of them go fully dark and the HUD returns after "
                  f"-- longest {t(worst[1]) - t(worst[0]):.1f}s at {t(worst[0]):.1f}s. "
                  "A dark camera, a raised mask and a death minigame are not "
                  "separated here: UNKNOWN(dark is ambiguous)")
    if end is None:
        print(f"  HUD last seen at {t(last_hud):.1f}s of "
              f"{t(len(flags)):.1f}s recorded")
        print(f"  ALIVE for at least {alive:.1f}s -- nothing in this recording "
              "shows the run ending, so this is a lower bound")
    else:
        print(f"  HUD gone for good from {t(end):.1f}s: {end_reason}")
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
