#!/usr/bin/env python3
"""Where did the pilot's idea of the monitor stop matching the game's?

The Minus 7 runner toggles the monitor blind. Its whole model of the monitor is
"I have pressed it an even or an odd number of times", so one press the game
never acts on inverts every later cycle: the vent read photographs the camera
feed, the hall press pans the map instead of flashing Foxy, and the box stops
being wound. Nothing in the run notices, which is why runs that desynced at
13 s were still reported as 47 s of schedule.

This is the instrument that says so from the artifacts. The pilot's intent is
its own HID trace; ground truth is the recording, classified with
grade-minus7's model at 30 fps.

Two rules keep it from inventing failures, both learned from getting them
wrong first:

  * It judges *intervals between presses*, not presses. A 550 ms office window
    with a 367 ms flip animation in it cannot be confirmed at any frame rate
    this recording has, so it is reported unreadable rather than guessed at.
  * A bright wide-beam frame is either an office hall flash (cams down) or the
    sweep's own camera light (cams up). grade-minus7 separates them by whether
    a camera interval ran half a second earlier, which stops working here
    because the office windows are shorter than that. Such a frame is evidence
    of nothing and is counted as nothing.

Usage: desync-scan.py RUN_NAME [--strips] [--all-intervals]
Exit status is 1 when the pilot's model diverged from the game, so this can
gate a claim rather than merely describe one.
"""
import argparse
import importlib.util
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CAPTURES = os.path.join(HERE, "..", "..", "captures")
FPS = 30.0
UP, DOWN = "up", "down"
# MONITOR_ANIM_DOWN is 22 frames (367 ms) and the port needs a moment more to
# draw the office. Nothing sooner than this after a press is evidence.
SETTLE = 0.45
# src/config.js PILOT_OFFSET_MS: the runner's epoch is the first office-HUD
# frame plus this, so the HUD onset is the recording's copy of T0.
PILOT_OFFSET = 0.175
# coords.sh, in screen pixels, and hid_down()'s rotation into the virtual
# device's natural axes: rawX = (1080 - y) * 20 / 9, rawY = x * 9 / 20.
SCREEN = {
    "mute": (545, 78), "monitor": (1780, 1015), "mask": (600, 1015),
    "ventl": (350, 615), "hall": (1200, 540), "wind": (430, 845),
    "cam1": (1415, 805), "cam2": (1730, 805), "cam3": (1415, 710),
    "cam4": (1730, 710), "cam5": (1425, 935), "cam6": (1685, 935),
    "cam7": (1775, 615), "cam8": (1415, 605), "cam9": (2150, 555),
    "cam10": (2045, 720), "cam11": (2275, 685), "cam12": (2225, 810),
}
CONTROLS = {((1080 - y) * 20 // 9, x * 9 // 20): n for n, (x, y) in SCREEN.items()}


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


G7 = load(os.path.join(HERE, "grade-minus7.py"), "grade_minus7")
GN = load(os.path.join(HERE, "grade-night.py"), "grade_night")


# --- the trace ------------------------------------------------------------

def contacts(path):
    """[(down_ms, up_ms|None, label)] from a HID_TRACE_RUN=1 trace.

    `mark` carries the runner's real clock at an action boundary and `delay`
    carries the hid-side waits, so the two together reconstruct the timeline
    the phone actually saw.
    """
    now, active, out = 0, {}, []
    for line in open(path):
        line = line.strip()
        if not line:
            continue
        event = json.loads(line)
        command = event.get("command")
        if command == "mark":
            now = max(now, event["ms"])
            continue
        if command == "delay":
            now += event["duration"]
            continue
        if command != "report":
            continue
        report = event["report"]
        if len(report) != 12 or report[0] != 1:
            continue
        count = report[1]
        named = set()
        for record in [report[2:7], report[7:12]][:count]:
            cid = record[0] >> 2
            x = record[1] | (record[2] << 8)
            y = record[3] | (record[4] << 8)
            named.add(cid)
            if record[0] & 1:
                active.setdefault(cid, (now, x, y))
            elif cid in active:
                at, ax, ay = active.pop(cid)
                out.append((at, now, CONTROLS.get((ax, ay), f"({ax},{ay})")))
        # Trap 2: a contact the packet does not name stays latched.
        for cid in list(active):
            if cid not in named and count <= cid:
                at, ax, ay = active.pop(cid)
                out.append((at, None, CONTROLS.get((ax, ay), f"({ax},{ay})")))
    for cid, (at, ax, ay) in active.items():
        out.append((at, None, CONTROLS.get((ax, ay), f"({ax},{ay})")))
    out.sort()
    return out


def presses(cs):
    """Every press that the pilot believes changes the monitor or the mask,
    with the released time before it -- what Fusion needs to see a new
    touch-down at all -- and which control it followed."""
    events = []
    for i, (down, up, name) in enumerate(cs):
        events.append((down, 0, i, name))
        if up is not None:
            events.append((up, 1, i, name))
    events.sort()
    active, last_up, last_name, out = set(), None, None, []
    for t, kind, _, name in events:
        if kind == 0:
            if name in ("monitor", "mask"):
                out.append({
                    "t": t / 1000.0,
                    "what": name,
                    "gap": None if active else (t - last_up if last_up is not None else None),
                    "after": ",".join(sorted(active)) if active else (last_name or "start"),
                })
            active.add(name)
        else:
            active.discard(name)
            last_up, last_name = t, name
    return out


# --- the recording --------------------------------------------------------

def state_frames(video):
    """cams-up / cams-down / None, one entry per frame at FPS."""
    size = G7.WIDTH * G7.HEIGHT
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", video, "-vf",
         f"fps={FPS},scale={G7.WIDTH}:{G7.HEIGHT}", "-f", "rawvideo",
         "-pix_fmt", "gray", "-"], capture_output=True).stdout
    if not raw:
        raise SystemExit(f"no video frames decoded from {video}")
    classes = [G7.classify(raw[i:i + size]) for i in range(0, len(raw) - size + 1, size)]
    return classes, [cams(c) for c in classes]


def cams(cls):
    return UP if cls == "camera" else DOWN if cls in ("office", "mask") else None


def hud_onset(video, before, fps=20.0, settle=3):
    """The first frame carrying the night HUD, from the recording's start.

    It has to start from zero: a window around a coarse estimate can open
    inside the night and then report its own first frame.
    """
    size = GN.WIDTH * GN.HEIGHT * 3
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-t", f"{before + 1.5}", "-i", video, "-vf",
         f"fps={fps},scale={GN.WIDTH}:{GN.HEIGHT}", "-f", "rawvideo",
         "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    flags = [GN.is_night(raw[i:i + size]) for i in range(0, len(raw) - size + 1, size)]
    if flags[:settle] == [True] * settle:
        return None
    streak = 0
    for i, flag in enumerate(flags):
        streak = streak + 1 if flag else 0
        if streak >= settle:
            return (i - settle + 1) / fps
    return None


def alive(video, fps=4.0, settle=3):
    """screenstate.py's predicate, as grade-night.py applies it."""
    flags = [GN.is_night(f) for f in GN.decode(video, fps)]

    def run_start(want, frm):
        streak = 0
        for i in range(frm, len(flags)):
            streak = streak + 1 if flags[i] == want else 0
            if streak >= settle:
                return i - settle + 1
        return None

    start = run_start(True, 0)
    if start is None:
        return None, None
    end = run_start(False, start + settle)
    return start / fps, (end / fps if end is not None else len(flags) / fps)


# --- lining the two up ----------------------------------------------------

def edges(seq):
    """Every confident change of state, whichever way it went."""
    out, current, last = [], None, None
    for i, state in enumerate(seq):
        if state is None:
            continue
        if current is not None and state != current:
            out.append((last + i) / 2 / FPS)
        current, last = state, i
    return out


class AlignmentUnknown(ValueError):
    """The recording and input trace do not support a measured offset."""


def align(seq, monitor_times, anchor, reach=0.4):
    """Offset from pilot time to recording time.

    Seeded on the HUD onset, which is the runner's own epoch, and refined on
    the state changes the presses produced. Refining on *edges* rather than on
    agreement is deliberate: an offset chosen for agreeing with the pilot would
    hide the very divergence this looks for.
    """
    found = edges(seq)
    if not monitor_times:
        raise AlignmentUnknown("the HID trace has no monitor presses")
    if not found:
        raise AlignmentUnknown("the recording has no confident monitor-state edges")
    best = None
    limit = int(reach * FPS)
    for step in range(-limit, limit + 1):
        off = anchor + step / FPS
        hits, err = 0, 0.0
        for t in monitor_times:
            near = [e - off - t for e in found if 0.15 <= e - off - t <= 0.65]
            if near:
                hits += 1
                err += min(near)
        if best is None or (hits, -err) > (best[0], -best[1]):
            best = (hits, err, off, step)
    if best[0] == 0:
        raise AlignmentUnknown("no monitor press matches a recording edge")
    # A best fit on either limit is not a measured optimum: it says only that
    # the answer lies at or beyond the range searched. Returning the boundary
    # used to turn a failed alignment into an apparently precise T0.
    if abs(best[3]) == limit:
        raise AlignmentUnknown("the best offset saturates the alignment search bound")
    return best[2]


def window_state(seq, off, lo, hi, minimum=3, majority=0.8):
    """What the recording says the monitor was doing in [lo, hi] pilot seconds."""
    i0, i1 = int((off + lo) * FPS), int((off + hi) * FPS)
    seen = [s for s in seq[max(i0, 0):max(i1, 0)] if s is not None]
    if len(seen) < minimum:
        return None, len(seen)
    up = seen.count(UP)
    if max(up, len(seen) - up) / len(seen) < majority:
        return None, len(seen)
    return (UP if up * 2 > len(seen) else DOWN), len(seen)


def walk(acts, seq, off, until):
    """Pair every press with what the game did after it, and find the break."""
    rows, assumed, first = [], DOWN, None
    for i, act in enumerate(acts):
        if act["t"] > until:
            break
        nxt = acts[i + 1]["t"] if i + 1 < len(acts) else min(until, act["t"] + 3.0)
        if act["what"] == "monitor":
            assumed = UP if assumed == DOWN else DOWN
        seen, frames = window_state(seq, off, act["t"] + SETTLE, nxt + 0.15)
        verdict = "unreadable" if seen is None else ("agrees" if seen == assumed else "DIVERGED")
        rows.append({**act, "assumed": assumed, "seen": seen, "frames": frames,
                     "verdict": verdict, "until": nxt})
        if verdict == "DIVERGED" and first is None:
            first = len(rows) - 1
    return rows, first


def blame(rows, first, seq, off):
    """Which press did the game not act on?

    The divergence surfaces at the first interval long enough to read, which is
    usually not the interval of the press that was lost. Walk back to the last
    interval that agreed; the presses in between are the suspects, and the one
    that did *not* line up with an observed state change is the loss.
    """
    if first is None:
        return None
    start = 0
    for i in range(first - 1, -1, -1):
        if rows[i]["verdict"] == "agrees":
            start = i + 1
            break
    suspects = [r for r in rows[start:first + 1] if r["what"] == "monitor"]
    if len(suspects) <= 1:
        return suspects[0] if suspects else None
    # Each state change belongs to whichever suspect it lags by about one flip
    # animation. Two presses close together can both be inside the window for
    # the same change, and then only the lag says which of them the game acted
    # on -- the other is the loss.
    found = [e - off for e in edges(seq)
             if any(0.15 <= e - off - r["t"] <= 0.65 for r in suspects)]
    landed = set()
    for e in found:
        lags = sorted((abs((e - r["t"]) - 0.40), i) for i, r in enumerate(suspects)
                      if 0.15 <= e - r["t"] <= 0.65)
        if lags:
            landed.add(lags[0][1])
    missing = [r for i, r in enumerate(suspects) if i not in landed]
    # A divergence is still real when every suspect has a matching edge, but
    # these artifacts cannot say which input caused it. Naming the first press
    # anyway turns list order into evidence.
    return missing[0] if missing else None


# --- reporting ------------------------------------------------------------

SYMBOL = {"camera": "C", "office": "o", "mask": "M", "hall-candidate": "*",
          "transition": "."}


def strip(classes, acts, off, lo, hi, until):
    """The expected routine and the frames that came back, side by side."""
    i0, i1 = max(int((off + lo) * FPS), 0), int((off + hi) * FPS)
    observed = "".join(SYMBOL[c] for c in classes[i0:i1])
    # what the pilot's model says the screen should be showing
    expect, marks = [], [" "] * len(observed)
    assumed, mask_on, changed_at = DOWN, False, -9
    timeline = []
    for act in acts:
        if act["what"] == "monitor":
            assumed = UP if assumed == DOWN else DOWN
        else:
            mask_on = not mask_on
        timeline.append((act["t"], assumed, mask_on, act["what"]))
    for j in range(len(observed)):
        t = lo + j / FPS
        state, masked, changed_at = DOWN, False, -9
        for at, up, m, _ in timeline:
            if at <= t:
                state, masked, changed_at = up, m, at
        if t - changed_at < 0.4:
            expect.append("~")                      # inside a flip animation
        else:
            expect.append("M" if masked else ("C" if state == UP else "o"))
    for at, _, _, what in timeline:
        j = int((at - lo) * FPS)
        if 0 <= j < len(marks):
            marks[j] = "O" if what == "monitor" else "m"
    return "".join(expect), observed, "".join(marks)


def scan(run, want_strips=False, all_intervals=False):
    video = None
    for candidate in (os.path.join(CAPTURES, f"{run}.mp4"),
                      os.path.join(CAPTURES, f"{run}-aborted.mp4")):
        if os.path.exists(candidate):
            video = candidate
    trace = os.path.join(CAPTURES, f"{run}-hid.jsonl")
    if video is None:
        print(f"{run}: no capture found (looked for {run}.mp4 and {run}-aborted.mp4)")
        return 2
    if not os.path.exists(trace):
        print(f"{run}: no HID trace ({run}-hid.jsonl); re-run with HID_TRACE_RUN=1")
        return 2

    hud0, hud1 = alive(video)
    if hud0 is None:
        print(f"{run}: the HUD never appears -- no night ran, nothing to grade")
        return 1
    acts = presses(contacts(trace))
    if not acts:
        print(f"{run}: no monitor or mask presses in the trace")
        return 2

    classes, seq = state_frames(video)
    onset = hud_onset(video, hud0)
    anchor = (onset if onset is not None else hud0) + PILOT_OFFSET
    try:
        off = align(seq, [a["t"] for a in acts if a["what"] == "monitor"], anchor)
    except AlignmentUnknown as exc:
        print(f"{run}: alignment UNKNOWN ({exc}); refusing to attribute monitor state")
        return 2
    rows, first = walk(acts, seq, off, hud1 - off)
    lost = blame(rows, first, seq, off)

    print(f"{run}: alive {hud1 - hud0:.1f}s, last monitor/mask press at "
          f"{max(a['t'] for a in acts):.1f}s; T0 at video {off:.2f}s")
    for row in rows:
        if not all_intervals and row["verdict"] == "unreadable":
            continue
        gap = "overlapping" if row["gap"] is None else f"{row['gap']} ms"
        print(f"  {row['t']:7.2f}s {row['what']:7s} after {row['after']:12s} "
              f"{gap:>11s} released -- pilot says {row['assumed']}, "
              f"the game is {row['seen'] or '?'} ({row['frames']} frames) {row['verdict']}")
    if first is None:
        print("  the pilot's model of the monitor held for the whole graded interval")
        return 0

    at = rows[first]
    print(f"  DESYNCED from {at['t']:.2f}s: every later cycle is inverted -- the vent "
          "read sees the camera feed, the hall press pans the map, the box stops winding")
    if lost is not None:
        gap = "overlapping" if lost["gap"] is None else f"{lost['gap']} ms"
        print(f"  the press the game did not act on: monitor at {lost['t']:.2f}s, "
              f"{gap} released after {lost['after']}")
    else:
        print("  the divergence is real, but the available edges cannot attribute it to one press")
    if want_strips:
        lo = max(rows[max(first - 3, 0)]["t"] - 0.5, 0)
        hi = min(at["until"] + 2.0, hud1 - off)
        expect, observed, marks = strip(classes, acts, off, lo, hi, hud1 - off)
        print(f"  frames {lo:.2f}s..{hi:.2f}s at {FPS:.0f} fps -- C camera, "
              "o office, M mask, * beam, . unplaceable, ~ expected mid-flip; "
              "O monitor press, m mask press")
        print(f"    routine  {expect}")
        print(f"    actual   {observed}")
        print(f"    presses  {marks}")
    return 1


def self_test():
    """The pure logic, without a phone or a recording.

    The fixtures render flips the way the recording does -- a run of frames the
    classifier cannot place -- because a sequence that snaps from one state to
    the next makes every window readable and tests nothing this has to get
    right.
    """
    frame = lambda state, n: [state] * n

    # A clean run: office, cams up at 1.0s, office again at 3.0s.
    acts = [{"t": 1.0, "what": "monitor", "gap": 100, "after": "wind"},
            {"t": 3.0, "what": "monitor", "gap": 100, "after": "hall"}]
    seq = (frame(DOWN, 36) + frame(None, 9) + frame(UP, 51)
           + frame(None, 12) + frame(DOWN, 60))
    rows, first = walk(acts, seq, 0.0, 5.0)
    assert first is None, f"a clean run was called desynced: {rows}"

    # The same trace against a game that never acted on the first press.
    seq = frame(DOWN, 96) + frame(None, 12) + frame(UP, 60)
    rows, first = walk(acts, seq, 0.0, 5.0)
    assert first is not None, "a lost first press was not caught"
    assert rows[first]["t"] == 1.0, rows[first]
    assert blame(rows, first, seq, 0.0)["t"] == 1.0

    # The hall-flash pair: cams down at 1.0s and back up 550 ms later, which is
    # the shape the route actually uses. Both flips fit inside that window, so
    # almost nothing in it is classifiable and the verdict must be "unreadable"
    # rather than a loss.
    acts = [{"t": 0.3, "what": "monitor", "gap": 200, "after": "mute"},
            {"t": 1.0, "what": "monitor", "gap": 34, "after": "wind"},
            {"t": 1.55, "what": "monitor", "gap": 34, "after": "hall"},
            {"t": 3.5, "what": "monitor", "gap": 100, "after": "cam7"}]
    seq = (frame(DOWN, 9) + frame(None, 9) + frame(UP, 24) + frame(None, 5)
           + frame(DOWN, 2) + frame(None, 9) + frame(UP, 47) + frame(None, 13)
           + frame(DOWN, 60))
    rows, first = walk(acts, seq, 0.0, 6.0)
    assert rows[1]["verdict"] == "unreadable", rows[1]
    assert first is None, f"an unreadable window was turned into a failure: {rows}"

    # When a loss does hide inside such a window, it only surfaces at the next
    # readable interval -- one press late. The attribution has to walk back to
    # the press that has no state change of its own to account for it.
    rows = [{"t": 7.0, "what": "monitor", "verdict": "agrees"},
            {"t": 9.72, "what": "monitor", "verdict": "unreadable"},
            {"t": 10.27, "what": "monitor", "verdict": "DIVERGED"}]
    seq = frame(UP, 320) + frame(None, 13) + frame(DOWN, 60)   # flips at ~10.7s
    assert blame(rows, 2, seq, 0.0)["t"] == 9.72, blame(rows, 2, seq, 0.0)
    # a beam frame is evidence of nothing, either way
    assert cams("hall-candidate") is None
    assert cams("camera") == UP and cams("office") == DOWN and cams("mask") == DOWN
    # the trace decoder resolves the runner's rotated coordinates
    assert CONTROLS[(144, 801)] == "monitor" and CONTROLS[(144, 270)] == "mask"

    # Alignment must abstain instead of presenting its own search limit as a
    # measurement. These are the three ways a real run can provide no fit.
    for bad_seq, times, reason in (
            (frame(DOWN, 120), [1.0], "no confident monitor-state edges"),
            (frame(DOWN, 90) + frame(UP, 30), [1.0], "no monitor press matches"),
            # The only match is at +0.4 s, exactly the upper search bound.
            (frame(DOWN, 62) + frame(UP, 30), [1.0], "saturates")):
        try:
            align(bad_seq, times, 0.0)
        except AlignmentUnknown as exc:
            assert reason in str(exc), (reason, str(exc))
        else:
            raise AssertionError(f"alignment invented an offset for {reason}")

    # A genuine interior match remains usable.
    fitted = align(frame(DOWN, 42) + frame(UP, 60), [1.0], 0.0)
    assert -0.4 < fitted < 0.4, fitted

    # If every suspect has a plausible edge, the divergence is unattributable;
    # list order is not evidence that the first press was lost.
    rows = [{"t": 1.0, "what": "monitor", "verdict": "unreadable"},
            {"t": 2.0, "what": "monitor", "verdict": "DIVERGED"}]
    seq = frame(DOWN, 42) + frame(UP, 30) + frame(DOWN, 30)
    assert blame(rows, 1, seq, 0.0) is None
    print("desync-scan self-test: ok")
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("run", nargs="?")
    parser.add_argument("--strips", action="store_true",
                        help="print the expected routine against the frames that came back")
    parser.add_argument("--all-intervals", action="store_true",
                        help="include intervals too short to judge")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        raise SystemExit(self_test())
    if not args.run:
        parser.error("a run name, or --self-test")
    raise SystemExit(scan(args.run, args.strips, args.all_intervals))


if __name__ == "__main__":
    main()
