#!/usr/bin/env python3
"""Did the sweep actually *flash* each camera, not merely select it?

camtrace.py reads the lime highlight on the camera map ("which camera is
selected"). A Minus 7 sweep exists to apply the camera-light stun, which needs
the light on *while* that camera is the selected feed. A trace of selections
alone cannot tell a working sweep from three selections in the dark.

WHAT CHANGED (2026-08-27). The old version measured mean feed brightness and
could not resolve the c33 LIGHT_AFTER geometry, where each camera lights for
2-4 frames on a tearing transition: on the NO_LIGHT control it read cam07 as
lit on every sweep, and on the ALT_LIGHT control (even sweeps lit, odd dark)
it was coin-flip. It also read the *cleared* n1-grey-2202 as 5/73.

The controls are the fix. A NO_LIGHT run and an ALT_LIGHT run give ground
truth for the lit / dark / tearing signatures under identical feed content, so
`--recalibrate ALT.mp4` learns, PER CAMERA, which feature separates lit from
dark and at what threshold:

  * CAM 10 / CAM 04 (Game Area, Party Room 4 -- rooms with ambient structure):
    the flashlight adds mid-grey room content -> `brightfrac`, the fraction of
    the feed centre in [45, 200].
  * CAM 07 (Main Hall -- genuinely black without the light): the flashlight
    reveals room EDGES that black does not have -> `vedge`, mean horizontal
    gradient over the feed centre.

The feed CENTRE only (300,150)-(980,340): the camera-switch tear bands are
horizontal and cluster at the top and bottom of the ROI, and averaging them
is what inverted the old measure.

Usage:
  sweepcheck.py VIDEO [--fps 60] [--expect 10,4,7] [--signature FILE]
  sweepcheck.py --recalibrate ALT.mp4 [--out FILE]   (ALT.mp4 from ALT_LIGHT=1)
"""
import argparse
import json
import os
import subprocess
import sys

WIDTH, HEIGHT = 1280, 576
MAP = {10: (1091, 384), 4: (923, 379), 7: (947, 328), 11: (1213, 365)}
# Feed centre only -- tear bands are horizontal and live at the ROI edges.
CROP = (300, 150, 980, 340)
DEFAULT_SIG = os.path.join(os.path.dirname(__file__), "sweepcheck-signature.json")


def stream(path, fps, pix, depth):
    """Yield decoded frames one at a time (never buffer the whole decode)."""
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
        if proc.wait():
            sys.stderr.buffer.write(err)
            raise SystemExit(proc.returncode)


def selected(frame):
    """Which camera's map button is lime-highlighted, or None."""
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


def features(gray):
    """(vedge, brightfrac) over the feed centre of one grayscale frame."""
    x0, y0, x1, y1 = CROP
    vedge = n = bright = tot = 0
    for y in range(y0, y1, 3):
        r = y * WIDTH
        for x in range(x0, x1 - 4, 4):
            a = gray[r + x]
            vedge += abs(a - gray[r + x + 4])
            n += 1
            tot += 1
            if 45 <= a <= 200:
                bright += 1
    return vedge / n, bright / tot


def sweep_windows(video, fps):
    """Yield (sweep_index, {cam: (max_vedge, max_brightfrac) or None}).

    A window is [first clean selection of camN] - 7 .. + 4 frames -- the flash
    lands just before the highlight settles, so the window reaches back.
    """
    rgb = list(stream(video, fps, "rgb24", 3))
    gray = list(stream(video, fps, "gray", 1))
    sel = [selected(f) for f in rgb]
    n = len(sel)
    i = s = 0
    while i < n:
        if sel[i] != 11:
            i += 1
            continue
        while i < n and sel[i] in (11, None):
            i += 1
        start = i
        while i < n and not (i + 3 < n and all(sel[j] == 11 for j in range(i, i + 3))):
            i += 1
        out = {}
        for cam in (10, 4, 7):
            firsts = [k for k in range(start, i) if sel[k] == cam]
            if not firsts:
                out[cam] = None
                continue
            lo, hi = max(0, firsts[0] - 7), min(n, firsts[0] + 4)
            fs = [features(gray[k]) for k in range(lo, hi)]
            out[cam] = (max(f[0] for f in fs), max(f[1] for f in fs))
        if any(out.values()):
            yield s, out
            s += 1


def load_signature(path):
    with open(path) as fh:
        return json.load(fh)


def cmd_recalibrate(a):
    """Learn per-camera (feature, threshold) from an ALT_LIGHT run.

    ALT_LIGHT lights EVEN sweeps and leaves ODD sweeps select-only, under one
    night's feed content -- a clean A/B. For each camera and each candidate
    feature, pick the threshold midway between the lit floor and the dark
    ceiling; keep the feature whose gap is largest.
    """
    lit = {10: {"v": [], "b": []}, 4: {"v": [], "b": []}, 7: {"v": [], "b": []}}
    dark = {10: {"v": [], "b": []}, 4: {"v": [], "b": []}, 7: {"v": [], "b": []}}
    for s, w in sweep_windows(a.alt, a.fps):
        bucket = lit if s % 2 == 0 else dark
        for cam, vals in w.items():
            if vals:
                bucket[cam]["v"].append(vals[0])
                bucket[cam]["b"].append(vals[1])
    sig = {"_source": os.path.basename(a.alt), "_crop": CROP, "cams": {}}
    for cam in (10, 4, 7):
        best = None
        for feat, key in (("vedge", "v"), ("brightfrac", "b")):
            lv, dv = sorted(lit[cam][key]), sorted(dark[cam][key])
            if not lv or not dv:
                continue
            # 10th pct of lit vs 90th pct of dark -- ignore one outlier each end
            lo = lv[max(0, len(lv) // 10)]
            hi = dv[min(len(dv) - 1, len(dv) - 1 - len(dv) // 10)]
            gap = lo - hi
            if best is None or gap > best[3]:
                best = (feat, key, round((lo + hi) / 2, 2), gap)
        feat, key, thr, gap = best
        lv = sorted(lit[cam][key]); dv = sorted(dark[cam][key])
        tp = sum(1 for x in lv if x >= thr)
        tn = sum(1 for x in dv if x < thr)
        sig["cams"][str(cam)] = {"feature": feat, "threshold": thr,
                                 "lit_n": len(lv), "dark_n": len(dv),
                                 "recall": round(tp / len(lv), 2),
                                 "specificity": round(tn / len(dv), 2),
                                 "gap": round(gap, 2)}
        print(f"CAM {cam:02d}: {feat} >= {thr}   "
              f"lit {tp}/{len(lv)}  dark-rejected {tn}/{len(dv)}  gap {gap:+.2f}")
    out = a.out or DEFAULT_SIG
    with open(out, "w") as fh:
        json.dump(sig, fh, indent=1)
    print(f"wrote {out}")


def cmd_grade(a):
    if not os.path.exists(a.signature):
        print(f"no signature at {a.signature} -- run `sweepcheck.py --recalibrate "
              f"ALT.mp4` on an ALT_LIGHT=1 recording first", file=sys.stderr)
        raise SystemExit(2)
    sig = load_signature(a.signature)["cams"]
    want = [int(v) for v in a.expect.split(",")]
    lit_sweeps = total = 0
    print(f"{a.video}: signature {os.path.basename(a.signature)}")
    for s, w in sweep_windows(a.video, a.fps):
        total += 1
        verdict, missing = {}, []
        for cam in want:
            vals = w.get(cam)
            c = sig.get(str(cam))
            if not vals or not c:
                verdict[cam] = "?"
                continue
            val = vals[0] if c["feature"] == "vedge" else vals[1]
            lit = val >= c["threshold"]
            verdict[cam] = f"{'LIT' if lit else 'dark'}({val:.1f})"
            if not lit:
                missing.append(cam)
        ok = not missing
        lit_sweeps += ok
        print(f"  sweep {s + 1:2d}: " + "  ".join(f"cam{c:02d}={verdict[c]}" for c in want)
              + ("" if ok else "   DARK: " + ",".join(f"cam{c:02d}" for c in missing)))
    print(f"summary: {lit_sweeps}/{total} sweeps lit every camera")
    if lit_sweeps < total:
        sys.exit(1)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video", nargs="?")
    p.add_argument("--fps", type=int, default=60)
    p.add_argument("--expect", default="10,4,7")
    p.add_argument("--signature", default=DEFAULT_SIG)
    p.add_argument("--recalibrate", dest="alt", metavar="ALT.mp4",
                   help="learn the per-camera signature from an ALT_LIGHT=1 run")
    p.add_argument("--out", help="where --recalibrate writes (default: the bundled signature)")
    a = p.parse_args()
    if a.alt:
        cmd_recalibrate(a)
    elif a.video:
        cmd_grade(a)
    else:
        p.error("give a VIDEO to grade, or --recalibrate ALT.mp4")


if __name__ == "__main__":
    main()
