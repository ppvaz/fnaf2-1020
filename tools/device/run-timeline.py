#!/usr/bin/env python3
"""Segment a recorded run into named phases, and name how it ended.

`grade-night.py` answers "how long was it alive". `grade-minus7.py` answers
"office, mask or camera". Neither answers the question a person actually asks
of a finished run -- *what happened, in order* -- and until the first cleared
Night 1 (`n1-full-1640`, 2026-08-26) neither could have, because nothing in the
repository could recognise a 6 AM. A won night and a death looked identical to
every instrument here.

    run-timeline.py VIDEO [--fps 2] [--min-dwell 1.0] [--json]

Phases, in the priority they are decided:

    sixam    the win screen: near-black, the clock in its band, win confetti
    intro    the story-night card: the same, with NO confetti (exactly zero)
    mask     near-black with the pink mask bar drawn: a mask response
    dark     near-black with neither text nor mask bar: a fade
    camera   a camera is selected: its map button is highlighted yellow
    office   the HUD is drawn and no camera is selected
    other    lit, but none of the above -- typically the title or menu

`static` is not among them, on purpose: this game's camera feed is grained, so
roughness fires on it constantly and cannot separate it from the death static,
which on this build is DARK (frame mean 34.1) and not bright. A death is
distinguished by being TERMINAL instead -- sustained static the HUD never
returns from -- which terminal_outcome() decides and no frame label claims.

The terminal outcome is reported with its evidence and never inferred from
duration. A recording that stops before anything terminal is `unknown`, which
is the honest answer for a run whose end was not captured.

**Resolution matters and is enforced.** The dark-screen signals were measured at
1280x576 and survive downsampling to 640x288 (17/17 and 5/5 on the retained
fixtures) but degrade at 320x144 (16/17) and collapse at 160x72 (11/17, 0/5).
grade-minus7.py's 160x72 working size is therefore NOT usable for this, and the
decode below is pinned at 640x288.
"""
import argparse
import importlib.util
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nightpredicate  # noqa: E402

W, H = 640, 288
DEFAULT_MODEL = os.path.join(HERE, "models", "lifecycle-moto-g56-v207.json")


def _lifecycle():
    spec = importlib.util.spec_from_file_location(
        "lifecycle_observe", os.path.join(HERE, "lifecycle-observe.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def decode(path, fps):
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={fps},scale={W}:{H}",
         "-pix_fmt", "rgb24", "-f", "rawvideo", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    size = W * H * 3
    buf = out.stdout
    return [buf[i:i + size] for i in range(0, len(buf) - size + 1, size)]


def sampler(frame):
    """nightpredicate's fractional-box interface over a raw rgb24 buffer."""
    def sample(fx0, fy0, fx1, fy1):
        x0, y0 = int(fx0 * W), int(fy0 * H)
        x1, y1 = max(int(fx1 * W), x0 + 1), max(int(fy1 * H), y0 + 1)
        r = g = b = n = 0
        for y in range(y0, y1):
            base = (y * W) * 3
            for x in range(x0, x1):
                i = base + x * 3
                r += frame[i]; g += frame[i + 1]; b += frame[i + 2]
                n += 1
        n = max(n, 1)
        return (r / n, g / n, b / n)
    return sample


def mask_bar_pixels(frame):
    """The pink mask bar along the bottom. Positive anchor for the mask being up.

    Measured on the cleared Night 1: ~550-565 px during every mask response and
    EXACTLY 0 outside one. It is what separates a mask from a fade -- both are
    near-black frames, and the first version of this timeline called all seven
    of the run's mask responses `dark`.

    `mask` is the dump's own word (`mask`, `flip mask button`, `mmaskOn.Active`).
    Not `blackout`: in this project that means the office lights going out with
    an animatronic inside, and the dump carries it as a separate state object
    (`blackout`, `blackout timer`), distinct again from `signal out`, the camera
    feed loss. Three different things; do not merge their names.
    """
    n = 0
    for y in range(int(0.88 * H), H):
        for x in range(0, W, 2):
            i = (y * W + x) * 3
            r, g, b = frame[i], frame[i + 1], frame[i + 2]
            if r > 120 and r - g > 40 and b > 60 and b - g > 10:
                n += 1
    return n


def yellow_pixels(frame):
    """Highlighted (selected) camera buttons on the map. See phase_of()."""
    n = 0
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            i = (y * W + x) * 3
            if frame[i] > 150 and frame[i + 1] > 150 and frame[i + 2] < 110:
                n += 1
    return n


def roughness(frame):
    tot = n = 0
    for y in range(0, H - 1, 3):
        for x in range(0, W, 3):
            i = (y * W + x) * 3
            j = ((y + 1) * W + x) * 3
            tot += abs(frame[i] - frame[j]); n += 1
    return tot / max(n, 1)


def phase_of(frame, lo, th):
    from PIL import Image
    im = Image.frombytes("RGB", (W, H), bytes(frame))
    dark = lo.dark_screen_state(im, th)
    if dark == "dark":
        # Near-black with no text. The mask bar tells a mask response apart
        # from a fade; both are otherwise identical.
        return "mask" if mask_bar_pixels(frame) >= th.get("maskBarMin", 200) else "dark"
    if dark:
        return dark
    # The monitor, by a POSITIVE anchor rather than by elimination: the
    # selected camera's button on the map is highlighted YELLOW (measured
    # (200,200,0) on this build, against browns and reds everywhere in the
    # office). Asking "is a camera selected" is generic across every camera and
    # every route -- camtrace.py answers the sharper question "WHICH of 10/04/
    # 07/11", which is Minus-7's four and not a general grader's business.
    #
    # This has to precede the HUD test, because the HUD does NOT go away when
    # the tablet comes up: the flashlight meter stays drawn over it. That is
    # why nightpredicate.is_night() reads True on 100% of this run's frames --
    # it is an ALIVE test, not an OFFICE test, and using it as one made the
    # first version of this timeline report 430 s of "office" with 10 s of
    # monitor, against the 3.5 s per 5 s cycle the route actually spends there.
    if yellow_pixels(frame) >= th.get("selectedCamYellowMin", 40):
        return "camera"
    if nightpredicate.is_night(sampler(frame)):
        return "office"
    # Everything else with light in it is unnamed. `other`, not `monitor`:
    # the monitor now has its own positive anchor above, and the leftover
    # bucket is mostly the title and menu screens either side of a night.
    #
    # `static` is deliberately NOT a per-frame phase. The camera feed in this
    # game is heavily grained, so roughness fires on it constantly -- the first
    # version of this timeline reported the cleared Night 1 flipping between
    # `office` and `static` about forty times, which is a route playing the
    # cams, not a game dying forty times. Brightness does not separate them
    # either: the death static on this build is DARK, frame mean 34.1, the same
    # as the office (ON-DEVICE-SCREEN-CHECKS).
    #
    # What does separate them is that a death is TERMINAL -- the HUD never
    # comes back. So roughness is consulted only by terminal_outcome(), over a
    # sustained tail, and never to label a frame mid-run.
    return "other"


def collapse(phases, fps, min_dwell):
    """Contiguous runs, with runs shorter than min_dwell folded into the
    previous phase. A single stray frame is a decode artifact, not an event."""
    runs = []
    for i, p in enumerate(phases):
        if runs and runs[-1][0] == p:
            runs[-1][2] = i + 1
        else:
            runs.append([p, i, i + 1])
    out = []
    for p, a, b in runs:
        if out and (b - a) / fps < min_dwell:
            out[-1][2] = b
        else:
            out.append([p, a, b])
    merged = []
    for p, a, b in out:
        if merged and merged[-1][0] == p:
            merged[-1][2] = b
        else:
            merged.append([p, a, b])
    return merged


def terminal_outcome(runs, phases, frames, fps, th):
    """How the run ended, with its evidence. Never inferred from duration.

    Only two things are positive evidence, and both are things a LIVE run
    cannot show: the 6 AM win screen, and a sustained death static the HUD
    never returns from. Anything else is `unknown`, which is the honest answer
    for a recording that stops before the end of the night -- and is what this
    returns for every run this project made before 2026-08-26.
    """
    for p, a, b in reversed(runs):
        if p == "sixam":
            return {"outcome": "clear", "evidence": "sixam",
                    "at_s": round(a / fps, 2), "positive": True,
                    "note": "the 6 AM win screen is in the recording"}

    # A terminal static: the tail of the recording, no HUD in it, and rough.
    last_office = max((i for i, p in enumerate(phases) if p == "office"),
                      default=None)
    if last_office is not None and last_office < len(phases) - 1:
        tail = range(last_office + 1, len(phases))
        rough = [roughness(frames[i]) for i in tail]
        if rough and len(rough) / fps >= 2.0 and \
                sum(1 for r in rough if r >= th["staticRoughnessMin"]) >= len(rough) * 0.6:
            return {"outcome": "death", "evidence": "terminal-static",
                    "at_s": round((last_office + 1) / fps, 2), "positive": True,
                    "note": "the recording ends in sustained static the HUD "
                            "never returns from"}
    return {"outcome": "unknown", "evidence": None, "at_s": None,
            "positive": False,
            "note": "nothing terminal was captured; the recording may stop "
                    "before the end of the night"}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video")
    p.add_argument("--fps", type=float, default=2.0)
    p.add_argument("--min-dwell", type=float, default=1.5)
    p.add_argument("--json", action="store_true")
    a = p.parse_args()

    lo = _lifecycle()
    with open(os.environ.get("LIFECYCLE_MODEL", DEFAULT_MODEL)) as fh:
        th = json.load(fh)["thresholds"]

    frames = decode(a.video, a.fps)
    if not frames:
        print(f"{a.video}: no frames", file=sys.stderr)
        raise SystemExit(2)
    phases = [phase_of(f, lo, th) for f in frames]
    runs = collapse(phases, a.fps, a.min_dwell)
    res = terminal_outcome(runs, phases, frames, a.fps, th)

    if a.json:
        print(json.dumps({
            "video": a.video, "fps": a.fps, "frames": len(frames),
            "segments": [{"phase": p, "from_s": round(x / a.fps, 2),
                          "to_s": round(y / a.fps, 2),
                          "seconds": round((y - x) / a.fps, 2)}
                         for p, x, y in runs],
            "terminal": res}, indent=2))
        return 0

    print(f"{a.video}: {len(frames)} frames at {a.fps} fps, {W}x{H}")
    for ph, x, y in runs:
        print(f"  {x / a.fps:7.1f}s -> {y / a.fps:7.1f}s  "
              f"({(y - x) / a.fps:6.1f}s)  {ph}")
    print(f"\n  TERMINAL: {res['outcome']}"
          + (f" -- {res['evidence']} at {res['at_s']}s" if res["evidence"] else "")
          + f"\n  {res['note']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
