#!/usr/bin/env python3
"""Grade a hid-maskraise-probe recording against its .hid stream.

Answers two questions per trial, from the video, with the stream's own
delays as the only clock:

  1. did the hall beam light after the mask-off + gap seam? (the pressed
     control landed vs was swallowed by the mask-off animation)
  2. how long after the mask-on / mask-off press did the overlay transition
     actually finish? (the visual animation length, cross-checking the
     sourced 12/15-frame MASK_ANIM values against the phone)

Signal model, established on the 2026-09-04 recording at 60 fps: the
center band (38-62% of width -- the office hallway the beam lights) sits at
a stable office level; the mask view through its eye holes sits near-black
for exactly maskOnMs; a landed beam is a 1-8 frame blip a few luma ABOVE
the office level. The two levels are well separated, so the mask state is
a threshold on the center band and a beam is a short excursion above the
office level with a margin the plateau noise never reaches.

Sync: each trial's mid-crossing into the mask (the frame the center band
crosses the office/mask midpoint during the mask-ON animation) is matched
to the stream's mask-ON press for that trial; the per-trial offsets are
pooled (median) so one bad crossing cannot drag the grade. The mid-crossing
lags the press by animOn/2, which cancels between anchor and measurement to
first order.

Usage: maskraise-grade.py VIDEO.mp4 STREAM.hid
"""
import argparse
import json
import statistics
import subprocess
import sys

W, H, FPS = 160, 72, 60
X0, X1 = int(W * 0.38), int(W * 0.62)  # the hallway the beam lights
SUSTAIN = 5  # frames a level must hold to count as reached
BEAM_MARGIN = 3.0  # luma above the office level; plateau noise is < 0.5


def parse_stream(path):
    """Reconstruct the trial table from the .hid stream's own delays."""
    events = [json.loads(line) for line in open(path, encoding="utf-8") if line.strip()]
    t = 0
    downs = []
    for e in events:
        if e["command"] == "delay":
            t += e["duration"]
            continue
        if e["command"] != "report":
            continue
        flags = e["report"][2]
        if not flags & 1:
            continue
        lo_x, hi_x, lo_y, hi_y = e["report"][3:7]
        x, y = lo_x | (hi_x << 8), lo_y | (hi_y << 8)
        sx, sy = (y * 20) // 9, 1080 - (x * 9) // 20
        def near(px, py):
            return abs(sx - px) <= 4 and abs(sy - py) <= 4
        name = "mask" if near(600, 1015) else "hall" if near(1200, 540) else "?"
        downs.append((t, name))
    halls = [t for t, n in downs if n == "hall"]
    masks = [t for t, n in downs if n == "mask"]
    if len(halls) < 4 or len(masks) < 2 * (len(halls) - 3):
        raise SystemExit(f"stream does not match the probe shape: {len(masks)} mask, {len(halls)} hall presses")
    trials = []
    for i, hall_t in enumerate(halls[3:]):
        on_t, off_t = masks[2 * i], masks[2 * i + 1]
        if not (on_t < off_t < hall_t):
            raise SystemExit(f"trial {i}: press order broke ({on_t}, {off_t}, {hall_t})")
        trials.append({"gap": hall_t - off_t, "mask_on_ms": on_t, "mask_off_ms": off_t, "hall_ms": hall_t})
    return trials


def decode(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={FPS},scale={W}:{H}",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture_output=True).stdout
    sz = W * H * 3
    n = len(raw) // sz
    if n < FPS:
        raise SystemExit(f"only {n} frames decoded from {path}")
    center, diff = [], [0.0]
    prev = None
    for i in range(n):
        f = raw[i * sz:(i + 1) * sz]
        luma = [0.3 * f[j] + 0.59 * f[j + 1] + 0.11 * f[j + 2] for j in range(0, len(f), 3)]
        roi = [luma[r * W + x] for r in range(H) for x in range(X0, X1)]
        center.append(sum(roi) / len(roi))
        if prev is not None:
            diff.append(sum(abs(a - b) for a, b in zip(luma, prev)) / (W * H))
        prev = luma
    return center, diff, n


def sustained_at(values, start, stop, level, tol, direction):
    """First frame in [start,stop) holding `level +- tol` for SUSTAIN frames.
    direction +1 searches forward (reaching a level), -1 backward."""
    rng = range(start, stop) if direction > 0 else range(stop - 1, start - 1, -1)
    for i in rng:
        window = values[i:i + SUSTAIN] if direction > 0 else values[i - SUSTAIN + 1:i + 1]
        if len(window) < SUSTAIN:
            return None
        if all(abs(v - level) <= tol for v in window):
            return i if direction > 0 else i - SUSTAIN + 1
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("stream")
    ap.add_argument("--land-window-ms", type=int, default=400)
    args = ap.parse_args()

    trials = parse_stream(args.stream)
    center, diff, n = decode(args.video)
    t_of = lambda frame: frame / FPS * 1000.0

    # The two levels come from the trial structure itself, not from the
    # whole video: the office plateau is the sharpest and longest-lived
    # center value, the mask view the sharpest one well below it. Death
    # static and the title menu are bright and heterogeneous -- spread over
    # many luma bins -- so they cannot out-vote a level that holds steady
    # for a second at a time.
    def frames_near(level, tol=1.0):
        return sum(1 for v in center[:n] if abs(v - level) <= tol)
    office_level = max(
        (lvl for lvl in {round(v) for v in center} if frames_near(lvl) >= n * 0.02),
        key=frames_near, default=None)
    if office_level is None:
        raise SystemExit("no stable center level found; cannot identify the office plateau")
    mask_level = max(
        (lvl for lvl in {round(v) for v in center}
         if lvl <= office_level - 4 and frames_near(lvl) >= n * 0.02),
        key=frames_near, default=None)
    if mask_level is None:
        raise SystemExit("no dark center level found; the recording shows no mask cycles")
    mid = (mask_level + office_level) / 2

    # The live region ends where the frame goes bright AND STAYS bright --
    # jumpscare into static, then the menu. A beam or an animation never
    # holds office+8 for a second and a half.
    live_end, run = n, 0
    for i, v in enumerate(center):
        run = run + 1 if v > office_level + 8 else 0
        if run >= int(1.5 * FPS):
            live_end = i - run + 1
            break

    # Sync: mask intervals are unmissable in the video -- sustained dark runs
    # of exactly maskOnMs, repeating with the trial period. The office also
    # LOADS dark once, so a candidate only starts the sequence if another
    # follows one trial-period later; that first cluster is the trials.
    mask_on_ms = trials[0]["mask_off_ms"] - trials[0]["mask_on_ms"]
    lo, hi = int((mask_on_ms - 300) * FPS / 1000), int((mask_on_ms + 300) * FPS / 1000)
    candidates, run = [], None
    for i in range(live_end):
        if center[i] < mid and run is None:
            run = i
        elif center[i] >= mid and run is not None:
            if lo <= (i - run) <= hi:
                candidates.append(run)
            run = None
    period_ms = None
    for a, b in zip(trials, trials[1:]):
        if b["mask_on_ms"] > a["mask_on_ms"]:
            period_ms = b["mask_on_ms"] - a["mask_on_ms"]
            break
    starts, k = [], 0
    while k < len(candidates):
        nxt = [c for c in candidates[k + 1:]
               if period_ms and 0.75 * period_ms <= (c - candidates[k]) * 1000 / FPS <= 1.35 * period_ms]
        if starts or nxt:
            starts.append(candidates[k])
            if not nxt:
                break
            k = candidates.index(nxt[0])
        else:
            k += 1
    offsets = [t_of(s) - tr["mask_on_ms"] for s, tr in zip(starts, trials)]
    if not offsets:
        raise SystemExit("no mask intervals found; cannot sync")
    offset = statistics.median(offsets)
    drift = max(offsets) - min(offsets)

    print(f"{n} frames @ {FPS} fps  mask-level {mask_level:.1f}  office-level {office_level:.1f}  "
          f"sync offset {offset:+.0f} ms (spread {drift:.0f} ms over {len(offsets)} anchors)"
          + (f"  TERMINAL at {t_of(live_end) / 1000:.1f}s" if live_end < n else ""))

    beams = []
    run = None
    for i in range(live_end):
        if center[i] > office_level + BEAM_MARGIN and run is None:
            run = i
        elif center[i] <= office_level + BEAM_MARGIN and run is not None:
            beams.append((run, i))
            run = None
    if run is not None:
        beams.append((run, live_end))

    by_gap, anim_on, anim_off = {}, [], []
    print(f"{'gap':>5} {'landed':>7} {'anim-on':>8} {'anim-off':>8}  note")
    for tr in trials:
        v_on = offset + tr["mask_on_ms"]
        v_off = offset + tr["mask_off_ms"]
        v_hall = offset + tr["hall_ms"]
        if int(v_on / 1000 * FPS) >= live_end:
            landed, a_on, a_off, note = None, None, None, "post-terminal"
        else:
            hit = [b for b in beams
                   if v_hall - 100 <= t_of(b[0]) <= v_hall + args.land_window_ms
                   and (b[1] - b[0]) <= 12]  # a beam is at most ~200 ms of bloom
            landed, note = bool(hit), ""
            # Animation completion, not mid-crossing: the first frame that
            # HOLDS the target level. ON has no press near it; OFF is clean
            # only when no beam (or a swallowed one) left bloom behind.
            i0 = int(v_on / 1000 * FPS)
            f = sustained_at(center, i0, min(live_end, i0 + int(0.9 * FPS)), mask_level, 1.5, +1)
            a_on = t_of(f) - v_on if f is not None else None
            f = sustained_at(center, int(v_off / 1000 * FPS),
                             min(live_end, int((v_off + 900) / 1000 * FPS)), office_level, 1.5, +1)
            a_off = t_of(f) - v_off if f is not None and not landed else None
        if a_on is not None and 0 < a_on < 900:
            anim_on.append(a_on)
        if a_off is not None and 0 < a_off < 900:
            anim_off.append(a_off)
        g = by_gap.setdefault(tr["gap"], [0, 0])
        if landed is True:
            g[0] += 1
        if landed is not None:
            g[1] += 1
        fmt = lambda v: f"{v:4.0f} ms" if v is not None else "     --"
        print(f"{tr['gap']:>5} {str(landed):>7} {fmt(a_on)} {fmt(a_off)}  {note}")
    print("\nper-gap landing rate")
    for gap in sorted(by_gap):
        l, r = by_gap[gap]
        print(f"  {gap:>4} ms  {l}/{r}  {'#' * l}{'.' * (r - l)}")
    for name, xs in (("mask-ON animation (press -> mask fully on)", anim_on),
                     ("mask-OFF animation (press -> office fully back, no-beam trials)", anim_off)):
        if xs:
            xs = sorted(xs)
            print(f"{name}: n={len(xs)} min={xs[0]:.0f} p50={xs[len(xs) // 2]:.0f} "
                  f"p95={xs[min(len(xs) - 1, int(len(xs) * 0.95))]:.0f} max={xs[-1]:.0f} ms")


if __name__ == "__main__":
    sys.exit(main())
