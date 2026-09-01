#!/usr/bin/env python3
"""Test the HUD-signature hypothesis: are down / mask / up separable from the
on-screen HUD elements alone?

The hypothesis under test, from conversation, is that the game's own chrome
partitions the three states:

    state  clock/night  battery  left button   right button   luma
    down       yes         yes      yes (mask)    yes (up)     office
    up         yes         yes      no            yes (down)   monitor UI
    mask       no          no       yes (unmask)  no            low

If that partition holds with wide margins on measured frames, the monitorUp
fact and a derivable maskOn fact get a second, UI-chrome signal independent
of the camera feed and the map drawing, and blackout (all elements absent)
cannot masquerade as mask (left button present).

This probe refuses to be a calibration. Three reasons, all retained in the
report: the recording is 1280x576 transcoded video, so the 20x9 grid sampled
here is an upscaled, compressed stand-in for the helper's native sensor
(resizing calibrates a different sensor); the frame labels come from
grade-minus7, whose mask rule itself keys on the lower-left tab, so cells in
that region are not independent evidence for the mask class; and the corpus
is one night of one story run on one device profile. Margins that survive all
three caveats justify spending device time on a native-frame corpus; nothing
here promotes a rule.

Frame labelling reuses grade-minus7 (the instrument desync-scan already calls
ground truth) and the grid reuses monitor-calibrate's exact cell sampling, so
probe numbers stay comparable with the fitted artifact.

Usage:
    hud-signature-probe.py captures/RUN.mp4 [--out report.json]
    hud-signature-probe.py --self-test
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(HERE, "..", "..", "tools", "device")
SCHEMA = "hud-signature-probe-v1"
NATIVE = (2400, 1080)
FEATURES = ("luma", "yellowness")
LABEL_MAP = {"office": "down", "mask": "mask", "camera": "up"}
# Pooled vs excluded classes per signature. A: elements present in down+mask,
# absent when up (the left button). B: elements present in down+up, absent
# when mask (clock/night, battery, the right button).
SIGNATURES = {"A": ({"down", "mask"}, {"up"}), "B": ({"down", "up"}, {"mask"})}


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    # dataclass resolution looks the module up in sys.modules; an unregistered
    # module crashes @dataclass on Python 3.14
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


# --- the recording ---------------------------------------------------------

def labels(video, g7):
    """Per-frame state labels from the recording, at g7's own rate."""
    return g7.smooth(g7.resolve_hall(g7.classify(f) for f in g7.decode(video)))


def candidate_frames(g7, states, fps, trim, duration, min_run, settle):
    """Frame indices eligible as class samples, plus everything ambiguous.

    Frames inside a stable run but within `settle` of its edges are animation
    suspects and go to the anim pool with every frame the labeller could not
    place, so the fitted rule is also read against frames it was not fitted
    on.
    """
    stable = {name: [] for name in LABEL_MAP.values()}
    ambiguous = []
    for index, state in enumerate(states):
        t = index / fps
        if trim <= t <= duration - trim and state not in LABEL_MAP:
            ambiguous.append(index)
    for state, start, end in g7.runs(states):
        name = LABEL_MAP.get(state)
        if name is None or end - start < min_run:
            continue
        for index in range(start + settle, end - settle):
            if trim <= index / fps <= duration - trim:
                stable[name].append(index)
    return stable, ambiguous


def spread(indices, count):
    """Evenly spaced selection; deterministic, no seed."""
    if len(indices) <= count:
        return list(indices)
    return [indices[round(k * (len(indices) - 1) / (count - 1))] for k in range(count)]


def native_grids(video, fps, wanted, monitor):
    """Grid cells for the wanted frame indices, decoded at native geometry.

    The 1280x576 recording is upscaled to 2400x1080 to reuse monitor-calibrate's
    cell sampling unchanged; this is a location-preserving convenience, not the
    native sensor, and the report says so.
    """
    size = NATIVE[0] * NATIVE[1] * 3
    proc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", video, "-vf", f"fps={fps},scale={NATIVE[0]}:{NATIVE[1]}",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    grids, index, seen = {}, 0, 0
    try:
        while True:
            frame = proc.stdout.read(size)
            if len(frame) < size:
                break
            seen += 1
            if index in wanted:
                image = monitor.Image.frombytes("RGB", NATIVE, frame)
                grids[index] = monitor.grid_cells(image)
            index += 1
    finally:
        proc.stdout.close()
        stderr = proc.stderr.read()
        if proc.wait():
            sys.stderr.buffer.write(stderr)
            raise SystemExit(proc.returncode)
    missing = wanted - set(grids)
    if missing:
        raise SystemExit(f"decode produced {seen} frames; missing wanted {sorted(missing)[:5]}")
    return grids, seen


# --- the statistics --------------------------------------------------------

def frame_features(cells, monitor):
    feats = {cell: {f: monitor.CELL_FEATURES[f](rgb) for f in FEATURES}
             for cell, rgb in enumerate(cells)}
    return feats, monitor.grid_luma(cells)


def class_ranges(by_class, cell, feature):
    """Per-class [min, max] of one cell feature; None when any frame is
    missing the cell -- an unmeasurable cell is not a candidate."""
    out = {}
    for label, frames in by_class.items():
        if any(cell not in feats for _, feats, _ in frames):
            return None
        values = [feats[cell][feature] for _, feats, _ in frames]
        out[label] = (min(values), max(values))
    return out


def partition(ranges, pooled, excluded):
    """Worst-case gap between the pooled classes and the excluded class.

    Returns (margin, threshold, side) with side saying where the excluded
    range sits; margin 0 means the ranges overlap and the cell is useless for
    this signature.
    """
    pool_lo = min(ranges[c][0] for c in pooled)
    pool_hi = max(ranges[c][1] for c in pooled)
    excl_lo = min(ranges[c][0] for c in excluded)
    excl_hi = max(ranges[c][1] for c in excluded)
    if pool_hi < excl_lo:
        return excl_lo - pool_hi, (pool_hi + excl_lo) / 2.0, "excluded-above"
    if excl_hi < pool_lo:
        return pool_lo - excl_hi, (pool_lo + excl_hi) / 2.0, "excluded-below"
    return 0.0, None, None


def fit_anchors(by_class, cells, pooled, excluded, floor, top):
    """Top-margin cells for one signature, one anchor per cell, inclusive
    edges, refuse band = half the gap -- the same shape monitor-calibrate
    fits, so its refusal semantics carry over unchanged."""
    found = []
    for cell in cells:
        best = None
        for feature in FEATURES:
            ranges = class_ranges(by_class, cell, feature)
            if ranges is None:
                continue
            margin, threshold, side = partition(ranges, pooled, excluded)
            if margin > (best[0] if best else 0.0):
                best = (margin, feature, threshold, side)
        if best and best[0] >= floor:
            found.append({"cell": cell, "feature": best[1], "margin": best[0],
                          "threshold": best[2], "side": best[3],
                          "band": best[0] / 2.0,
                          "ranges": {label: list(class_ranges(by_class, cell, best[1])[label])
                                     for label in sorted(by_class)}})
    found.sort(key=lambda a: (-a["margin"], a["cell"], a["feature"]))
    chosen, seen = [], set()
    for anchor in found:
        if anchor["cell"] in seen:
            continue
        seen.add(anchor["cell"])
        chosen.append(anchor)
        if len(chosen) >= top:
            break
    return chosen


def anchor_read(anchor, feats):
    value = feats[anchor["cell"]][anchor["feature"]]
    threshold, band = anchor["threshold"], anchor["band"]
    if anchor["side"] == "excluded-above":
        excluded, pooled = value >= threshold + band, value <= threshold - band
    else:
        excluded, pooled = value <= threshold - band, value >= threshold + band
    return "excluded" if excluded else "pooled" if pooled else "in-band"


def verdict(feats, rule):
    """up / mask / down only when both signatures are unanimous; anything
    mixed, in-band, or half-read refuses."""
    reads = {}
    for name, anchors in rule.items():
        states = [anchor_read(a, feats) for a in anchors]
        if any(s == "in-band" for s in states) or len(set(states)) != 1:
            reads[name] = None
        else:
            reads[name] = states[0]
    a, b = reads["A"], reads["B"]
    if a == "excluded" and b == "pooled":
        return "up"
    if a == "pooled" and b == "excluded":
        return "mask"
    if a == "pooled" and b == "pooled":
        return "down"
    return "unknown"


def evaluate(frames, rule):
    """Reads of the rule against frames carrying a true label."""
    out = {label: {} for label in frames}
    for label, members in frames.items():
        for _, feats, _ in members:
            v = verdict(feats, rule)
            out[label][v] = out[label].get(v, 0) + 1
    return out


# --- reporting -------------------------------------------------------------

def xy(cell, monitor):
    x, y = monitor.cell_native_xy(cell)
    return f"cell {cell} @ ({x},{y})"


def report(args, g7, monitor, by_class, anim_frames, rule, reads, luma, seen_frames):
    grids_sampled = sum(len(v) for v in by_class.values()) + len(anim_frames)
    top = {
        name: [{"cell": a["cell"], "x": monitor.cell_native_xy(a["cell"])[0],
                "y": monitor.cell_native_xy(a["cell"])[1], "feature": a["feature"],
                "margin": round(a["margin"], 1), "threshold": a["threshold"],
                "side": a["side"], "ranges": a["ranges"]} for a in anchors]
        for name, anchors in rule.items()
    }
    return {
        "schema": SCHEMA,
        "status": "probed",
        "provenance": {
            "video": os.path.abspath(args.video),
            "video_sha256": hashlib.sha256(open(args.video, "rb").read()).hexdigest(),
            "decoded_frames": seen_frames,
            "grids_sampled": grids_sampled,
            "decode_fps": args.fps,
            "native_upscale": "1280x576 recording upscaled to 2400x1080 for cell "
                              "sampling; not the helper's native sensor",
            "labeler": "tools/device/grade-minus7.py classify/smooth/resolve_hall "
                       "at 160x72 gray; desync-scan treats this model as the "
                       "recording's ground truth",
            "label_map": LABEL_MAP,
            "circularity": "grade-minus7's mask rule keys on the lower-left tab, so "
                           "signature-A cells in that region are not independent "
                           "evidence for the mask class",
            "params": {"per_class": args.per_class, "anim": args.anim, "top": args.top,
                       "floor": args.floor, "trim_s": args.trim, "min_run": args.min_run,
                       "settle_frames": args.settle},
        },
        "samples": {label: {"count": len(members),
                            "span_s": [round(members[0][0] / args.fps, 2),
                                       round(members[-1][0] / args.fps, 2)]}
                    for label, members in sorted(by_class.items())},
        "anim_count": len(anim_frames),
        "rule": top,
        "reads": reads,
        "grid_luma": luma,
        "limitations": [
            "one night, one story run, one device profile (moto g56, build 2.0.7)",
            "upscaled transcoded sensor: thresholds here are not native thresholds",
            "labels derived from a brightness classifier, not from press timing",
            "no blackout frames in the corpus; the luma band is unproven against them",
        ],
    }


# --- self-test -------------------------------------------------------------

def self_test():
    """The partition math and the verdict logic, without a phone."""
    def frame(luma10, luma20, luma30):
        return (0, {10: {"luma": luma10, "yellowness": 0},
                    20: {"luma": luma20, "yellowness": 0},
                    30: {"luma": luma30, "yellowness": 0}}, 0)

    down = [frame(182, 118, 60), frame(178, 122, 60)]
    mask = [frame(181, 5, 8), frame(179, 3, 8)]
    up = [frame(6, 121, 70), frame(4, 119, 70)]
    by_class = {"down": down, "mask": mask, "up": up}
    cells = list(range(180))

    a_rule = fit_anchors(by_class, cells, {"down", "mask"}, {"up"}, 5.0, 3)
    b_rule = fit_anchors(by_class, cells, {"down", "up"}, {"mask"}, 5.0, 3)
    assert a_rule[0]["cell"] == 10, a_rule
    assert b_rule[0]["cell"] == 20, b_rule
    rule = {"A": a_rule, "B": b_rule}
    assert verdict(down[0][1], rule) == "down"
    assert verdict(mask[0][1], rule) == "mask"
    assert verdict(up[0][1], rule) == "up"
    mid = frame(93, 118, 60)          # cell 10 lands in the refuse band
    assert verdict(mid[1], rule) == "unknown"
    mixed = frame(4, 5, 8)            # A excluded, B excluded: no state fits
    assert verdict(mixed[1], rule) == "unknown"
    reads = evaluate({"mask": mask}, rule)
    assert reads["mask"] == {"mask": 2}, reads
    # partition refuses overlapping ranges instead of inventing a threshold
    assert partition({"down": (10, 20), "mask": (15, 25), "up": (40, 50)},
                     {"down", "mask"}, {"up"})[0] == 15.0
    assert partition({"down": (10, 30), "mask": (20, 40), "up": (20, 50)},
                     {"down", "mask"}, {"up"})[0] == 0.0
    assert spread(list(range(10)), 4) == [0, 3, 6, 9]
    assert spread([1, 2], 5) == [1, 2]
    print("hud-signature-probe self-test: ok")
    return 0


# --- driver ----------------------------------------------------------------

def run(args):
    g7 = load(os.path.join(TOOLS, "grade-minus7.py"), "grade_minus7")
    monitor = load(os.path.join(TOOLS, "monitor-calibrate.py"), "monitor_calibrate")

    states = labels(args.video, g7)
    fps = g7.FPS if args.fps is None else args.fps
    args.fps = fps
    duration = len(states) / fps
    stable, ambiguous = candidate_frames(g7, states, fps, args.trim, duration,
                                         args.min_run, args.settle)
    for name, indices in stable.items():
        if len(indices) < 8:
            raise SystemExit(f"{args.video}: only {len(indices)} {name} frames qualify; "
                             "refusing to fit on less")
    chosen = {name: spread(indices, args.per_class) for name, indices in stable.items()}
    anim_choice = spread(ambiguous, args.anim)
    wanted = {i for indices in chosen.values() for i in indices} | set(anim_choice)

    grids, seen = native_grids(args.video, fps, wanted, monitor)
    named = {label: [(i, *frame_features(grids[i], monitor)) for i in chosen[label]]
             for label in chosen}
    anim_frames = [(i, states[i], *frame_features(grids[i], monitor)) for i in anim_choice]

    rule = {name: fit_anchors(named, range(180), pooled, excluded, args.floor, args.top)
            for name, (pooled, excluded) in SIGNATURES.items()}
    for name, anchors in rule.items():
        if not anchors:
            raise SystemExit(f"signature {name}: no cell cleared the {args.floor} margin")

    reads = {"corpus": evaluate(named, rule), "anim": {}}
    for index, state, feats, _ in anim_frames:
        bucket = reads["anim"].setdefault(state, {})
        bucket[verdict(feats, rule)] = bucket.get(verdict(feats, rule), 0) + 1

    luma_ranges = {label: [min(g for _, _, g in members), max(g for _, _, g in members)]
                   for label, members in named.items()}
    mask_band = luma_ranges["mask"]
    band_false = sum(1 for label in ("down", "up") for _, _, g in named[label]
                     if mask_band[0] <= g <= mask_band[1])

    doc = report(args, g7, monitor, named, anim_frames, rule, reads,
                 {"ranges": luma_ranges, "mask_band": mask_band,
                  "band_false_positives": band_false}, seen)
    text = json.dumps(doc, indent=2, sort_keys=True)
    if args.out:
        with open(args.out, "w") as handle:
            handle.write(text + "\n")
    print(f"{args.video}: {seen} frames decoded, "
          + ", ".join(f"{n}: {len(m)} samples" for n, m in sorted(named.items()))
          + f", {len(anim_frames)} anim")
    for name, (pooled, excluded) in SIGNATURES.items():
        print(f"  signature {name} ({{{','.join(sorted(pooled))}}}|{{{'.'.join(sorted(excluded))}}}):")
        for a in rule[name]:
            print(f"    {xy(a['cell'], monitor):24s} {a['feature']:10s} "
                  f"margin {a['margin']:6.1f}  {a['ranges']}")
    print("  corpus reads (true label -> verdicts):")
    for label, counts in reads["corpus"].items():
        print(f"    {label:5s} {counts}")
    print(f"  anim reads by labeller state: {reads['anim']}")
    print(f"  grid mean luma: {luma_ranges}")
    print(f"  mask luma band {mask_band} would misvote on {band_false} down/up frames")
    if args.out:
        print(f"  report: {args.out}")
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video", nargs="?")
    parser.add_argument("--fps", type=float, default=None,
                        help="decode rate for both passes (default: the labeler's own)")
    parser.add_argument("--per-class", type=int, default=30)
    parser.add_argument("--anim", type=int, default=40)
    parser.add_argument("--top", type=int, default=3, help="anchors per signature")
    parser.add_argument("--floor", type=float, default=5.0, help="minimum 8-bit margin")
    parser.add_argument("--trim", type=float, default=3.0,
                        help="seconds at both ends of the video never sampled")
    parser.add_argument("--min-run", type=int, default=4,
                        help="shortest stable run (frames) eligible for sampling")
    parser.add_argument("--settle", type=int, default=2,
                        help="frames at each run edge excluded as animation suspects")
    parser.add_argument("--out", default=None, help="write the JSON report here")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        raise SystemExit(self_test())
    if not args.video:
        parser.error("a recording, or --self-test")
    raise SystemExit(run(args))


if __name__ == "__main__":
    main()
