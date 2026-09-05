#!/usr/bin/env python3
"""Grade a maskraise-probe recording against its .hid stream -- hall mode
(hid-maskraise-probe.mjs) or monitor mode (hid-monitorraise-probe.mjs).

Answers, per trial, from the video, with the stream's own delays as the
only clock:

  1. did the pressed control answer after the mask-off + gap seam? -- the
     hall beam lighting (hall mode) or the camera map appearing (monitor
     mode) --
  2. how long after the mask-on / mask-off press did the overlay
     transition actually finish (both modes), cross-checking the sourced
     12/15-frame MASK_ANIM values against the phone.

Signal model, established on the 2026-09-04 hall recordings at 60 fps: the
center band (38-62% of width) sits at a stable office level; the mask view
through its eye holes sits near-black for exactly maskOnMs; a landed hall
beam is a 1-8 frame blip a few luma ABOVE office; the camera map (monitor
mode) is a sustained shift to a third level the TEACH segment demonstrates
first, so the grader learns it from a raise that cannot have failed.

Sync anchors: hall mode pools the mask intervals' starts against their
presses; monitor mode anchors on the teach raise (the first level shift in
the stream's live region that REVERTS, which distinguishes it from the
office-load fade) and cross-checks that the mask intervals agree.

Usage: maskraise-grade.py VIDEO.mp4 STREAM.hid
"""
import argparse
import json
import statistics
import subprocess
import sys

W, H, FPS = 160, 72, 60
X0, X1 = int(W * 0.38), int(W * 0.62)  # the hallway the beam lights
LV0, LV1 = 0, int(W * 0.16)           # left vent: visitor overlays live here
RV0, RV1 = int(W * 0.84), W           # right vent
SUSTAIN = 5   # frames a level must hold to count as reached
BEAM_MARGIN = 3.0  # luma above office; plateau noise never reaches 0.5
MAP_TOL = 3.0      # luma band around the learned map level


def parse_stream(path):
    """Reconstruct mode, sync anchor and the trial table from the stream."""
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
        name = ("mask" if near(600, 1015) else
                "hall" if near(1200, 540) else
                "monitor" if near(1780, 1015) else "?")
        downs.append((t, name))
    masks = [t for t, n in downs if n == "mask"]
    halls = [t for t, n in downs if n == "hall"]
    monitors = [t for t, n in downs if n == "monitor"]
    if monitors:
        # monitor mode: teach pair, 3-flask preamble, then per trial
        # (mask, mask, monitor).
        if len(monitors) < 3 or len(masks) != 2 * (len(monitors) - 2):
            raise SystemExit(f"monitor stream shape unexpected: {len(masks)} mask, {len(monitors)} monitor presses")
        trials = []
        for i, probe in enumerate(monitors[2:]):
            on_t, off_t = masks[2 * i], masks[2 * i + 1]
            if not (on_t < off_t < probe):
                raise SystemExit(f"trial {i}: press order broke ({on_t}, {off_t}, {probe})")
            trials.append({"gap": probe - off_t, "mask_on_ms": on_t,
                           "mask_off_ms": off_t, "probe_ms": probe})
        return {"mode": "monitor", "anchor_ms": monitors[0], "trials": trials}
    if len(halls) < 4 or len(masks) < 2 * (len(halls) - 3):
        raise SystemExit(f"stream does not match a probe shape: {len(masks)} mask, {len(halls)} hall, {len(monitors)} monitor presses")
    trials = []
    for i, probe in enumerate(halls[3:]):
        on_t, off_t = masks[2 * i], masks[2 * i + 1]
        if not (on_t < off_t < probe):
            raise SystemExit(f"trial {i}: press order broke ({on_t}, {off_t}, {probe})")
        trials.append({"gap": probe - off_t, "mask_on_ms": on_t,
                       "mask_off_ms": off_t, "probe_ms": probe})
    return {"mode": "hall", "anchor_ms": halls[2], "trials": trials}


def decode(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={FPS},scale={W}:{H}",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture_output=True).stdout
    sz = W * H * 3
    n = len(raw) // sz
    if n < FPS:
        raise SystemExit(f"only {n} frames decoded from {path}")
    center, lvent, rvent, diff = [], [], [], [0.0]
    prev = None
    for i in range(n):
        f = raw[i * sz:(i + 1) * sz]
        luma = [0.3 * f[j] + 0.59 * f[j + 1] + 0.11 * f[j + 2] for j in range(0, len(f), 3)]
        def band(x0, x1):
            roi = [luma[r * W + x] for r in range(H) for x in range(x0, x1)]
            return sum(roi) / len(roi)
        center.append(band(X0, X1))
        lvent.append(band(LV0, LV1))
        rvent.append(band(RV0, RV1))
        if prev is not None:
            diff.append(sum(abs(a - b) for a, b in zip(luma, prev)) / (W * H))
        prev = luma
    return center, lvent, rvent, diff, n


def sustained_at(values, start, stop, level, tol):
    """First frame in [start,stop) holding level+-tol for SUSTAIN frames."""
    for i in range(start, stop):
        window = values[i:i + SUSTAIN]
        if len(window) < SUSTAIN:
            return None
        if all(abs(v - level) <= tol for v in window):
            return i
    return None


def runs_where(values, pred):
    out, run = [], None
    for i, v in enumerate(values):
        if pred(v) and run is None:
            run = i
        elif not pred(v) and run is not None:
            out.append((run, i))
            run = None
    if run is not None:
        out.append((run, len(values)))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("stream")
    ap.add_argument("--land-window-ms", type=int, default=400)
    args = ap.parse_args()

    parsed = parse_stream(args.stream)
    trials, mode, anchor_ms = parsed["trials"], parsed["mode"], parsed["anchor_ms"]
    center, lvent, rvent, diff, n = decode(args.video)
    t_of = lambda frame: frame / FPS * 1000.0

    # Levels from the recording's own steady states: the office plateau is
    # the sharpest, longest-lived center value; the mask view the sharpest
    # one well below it. Death static and the title menu are heterogeneous
    # and cannot out-vote a level that holds for seconds.
    def frames_near(level, tol=1.0):
        return sum(1 for v in center[:n] if abs(v - level) <= tol)
    office_level = max((lvl for lvl in {round(v) for v in center}
                        if frames_near(lvl) >= n * 0.02), key=frames_near, default=None)
    if office_level is None:
        raise SystemExit("no stable center level found; cannot identify the office plateau")
    mask_level = max((lvl for lvl in {round(v) for v in center}
                      if lvl <= office_level - 4 and frames_near(lvl) >= n * 0.02),
                     key=frames_near, default=None)
    if mask_level is None:
        raise SystemExit("no dark center level found; the recording shows no mask cycles")
    mid = (mask_level + office_level) / 2

    # The live region ends at the END OF THE LAST office-level run: death
    # (jumpscare into static, then the title menu) never returns to the
    # office, while a bright intruder event -- Foxy's hall charge reads
    # office+20 for over two seconds -- does. A recording cut while the
    # night is still alive simply ends on its last office run.
    office_runs = [b for a, b in runs_where(center, lambda v: abs(v - office_level) <= 2.0)
                   if (b - a) >= 15]
    if not office_runs:
        raise SystemExit("the office plateau never appears; nothing to grade")
    office_first = next(a for a, b in runs_where(center, lambda v: abs(v - office_level) <= 2.0)
                        if (b - a) >= 15)
    live_end = office_runs[-1]

    # ---- mode-specific sync and landing evidence ----------------------
    if mode == "hall":
        # Mask intervals: sustained dark runs of exactly maskOnMs in a
        # periodic cluster (the office also LOADS dark once, so an isolated
        # run cannot start the sequence).
        mask_on_ms = trials[0]["mask_off_ms"] - trials[0]["mask_on_ms"]
        lo, hi = int((mask_on_ms - 300) * FPS / 1000), int((mask_on_ms + 300) * FPS / 1000)
        candidates = [a for a, b in runs_where(center, lambda v: v < mid)
                      if lo <= (b - a) <= hi]
        period_ms = next((b["mask_on_ms"] - a["mask_on_ms"] for a, b in zip(trials, trials[1:])
                          if b["mask_on_ms"] > a["mask_on_ms"]), None)
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
        beams = [(a, b) for a, b in runs_where(center, lambda v: v > office_level + BEAM_MARGIN)
                 if (b - a) <= 12]
        def evidence(tr):
            v = offset + tr["probe_ms"]
            return any(v - 100 <= t_of(a) <= v + args.land_window_ms for a, b in beams)
    else:
        # Monitor mode: the TEACH raise is the first sustained BRIGHT shift
        # off the office plateau that reverts to the office level. Bright,
        # not just different: the office-load fade is dark and pre-registered
        # runs open with menu noise that never holds. The monitor flip's
        # white transition frames are 1-2 frames of wild variance and fail
        # the hold test on their own.
        teach = None
        for i in range(office_first, min(int(40 * FPS), live_end, n - 8)):
            if center[i] - office_level > 10:
                held = all(abs(center[j] - center[i]) <= 4 for j in range(i, i + 8))
                back = next((j for j in range(i + int(0.6 * FPS), i + int(2.5 * FPS))
                             if abs(center[j] - office_level) <= 4), None)
                if held and back is not None:
                    teach = i
                    break
        if teach is None:
            raise SystemExit("the teach raise was not found; cannot sync monitor mode")
        map_level = statistics.median(center[teach + 5:teach + int(0.45 * FPS)])
        offset = t_of(teach) - anchor_ms
        # cross-check: mask intervals should agree with this offset
        checks = []
        for tr in trials[:3]:
            a = int((offset + tr["mask_on_ms"]) / 1000 * FPS)
            f = sustained_at(center, max(0, a - int(0.3 * FPS)), min(live_end, a + int(0.9 * FPS)),
                             mask_level, 2.5)
            if f is not None:
                checks.append(t_of(f) - tr["mask_on_ms"] - offset)
        drift = (max(checks) - min(checks)) if len(checks) > 1 else 0.0
        map_runs = [(a, b) for a, b in runs_where(center, lambda v: abs(v - map_level) <= MAP_TOL)
                    if (b - a) >= 5]
        def evidence(tr):
            v = offset + tr["probe_ms"]
            return any(v - 100 <= t_of(a) <= v + args.land_window_ms + 100 for a, b in map_runs)

    by_gap, anim_on, anim_off = {}, [], []
    l_base = statistics.median(lvent[:live_end])
    r_base = statistics.median(rvent[:live_end])
    print(f"{n} frames @ {FPS} fps  mode={mode}  mask-level {mask_level:.1f}  office-level {office_level:.1f}  "
          f"vent-bases L{l_base:.1f}/R{r_base:.1f}  "
          + (f"map-level {map_level:.1f}  " if mode == "monitor" else "")
          + f"sync offset {offset:+.0f} ms (drift {drift:.0f} ms)"
          + (f"  TERMINAL at {t_of(live_end) / 1000:.1f}s" if live_end < n else ""))
    print(f"{'gap':>5} {'landed':>7} {'anim-on':>8} {'anim-off':>8}  {'Lvent':>6} {'Rvent':>6}  note")
    for tr in trials:
        v_on = offset + tr["mask_on_ms"]
        v_off = offset + tr["mask_off_ms"]
        if int(v_on / 1000 * FPS) > live_end + int(0.3 * FPS):
            landed, a_on, a_off, note = None, None, None, "post-terminal"
        else:
            landed, note = bool(evidence(tr)), ""
            i0 = int(v_on / 1000 * FPS)
            f = sustained_at(center, i0, min(live_end, i0 + int(0.9 * FPS)), mask_level, 1.5)
            a_on = t_of(f) - v_on if f is not None else None
            f = sustained_at(center, int(v_off / 1000 * FPS),
                             min(live_end, int((v_off + 900) / 1000 * FPS)), office_level, 1.5)
            a_off = t_of(f) - v_off if f is not None and not landed else None
            if a_on is None:
                # No mask interval where the stream pressed one: desync or
                # quiet death. Such a window cannot grade the seam.
                landed, note = None, "no-mask-cycle (invalid)"
        if a_on is not None and 0 < a_on < 900:
            anim_on.append(a_on)
        if a_off is not None and 0 < a_off < 900:
            anim_off.append(a_off)
        g = by_gap.setdefault(tr["gap"], [0, 0])
        if landed is True:
            g[0] += 1
        if landed is not None:
            g[1] += 1
        wa = max(0, int((v_on - 300) / 1000 * FPS))
        wb = min(live_end, int((offset + tr["probe_ms"] + 400) / 1000 * FPS))
        lv = statistics.fmean(lvent[wa:wb]) if wb > wa else float("nan")
        rv = statistics.fmean(rvent[wa:wb]) if wb > wa else float("nan")
        fmt = lambda v: f"{v:4.0f} ms" if v is not None else "     --"
        print(f"{tr['gap']:>5} {str(landed):>7} {fmt(a_on)} {fmt(a_off)}  "
              f"{lv:6.1f} {rv:6.1f}  {note}")
    print("\nper-gap landing rate")
    for gap in sorted(by_gap):
        l, r = by_gap[gap]
        print(f"  {gap:>4} ms  {l}/{r}  {'#' * l}{'.' * (r - l)}")
    for name, xs in (("mask-ON animation (press -> mask fully on)", anim_on),
                     ("mask-OFF animation (press -> office fully back, no-landing trials)", anim_off)):
        if xs:
            xs = sorted(xs)
            print(f"{name}: n={len(xs)} min={xs[0]:.0f} p50={xs[len(xs) // 2]:.0f} "
                  f"p95={xs[min(len(xs) - 1, int(len(xs) * 0.95))]:.0f} max={xs[-1]:.0f} ms")


if __name__ == "__main__":
    sys.exit(main())
