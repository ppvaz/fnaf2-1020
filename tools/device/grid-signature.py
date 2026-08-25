#!/usr/bin/env python3
"""Turn labelled frames into a signature the cue helper can evaluate live.

The gap this fills: we can capture frames (`captures/screencheck-keep/<run>/`),
and the helper can now show its whole 20x9 sensor (`query-cue-helper.sh grid`),
but nothing turned the first into something the second can be checked against.
So "teach it to identify Withered Freddy" had no path from the frames we own to
a decision the device can make in 42 ms.

A signature here is deliberately the same shape as the SCM1 models this
repository already trusts: per-class mean, nearest-class assignment, and a
refusal to answer when nothing is close enough or two classes are too close.
Those thresholds are what make `unknown` mean "I will not guess" rather than
"something went wrong", which is the distinction the BB model earns its keep on.

    build   LABEL=PATH ...  --output sig.json
    test    sig.json LABEL=PATH ...
    match   sig.json   (reads one GRID response line on stdin)

PATH is either a directory of 2400x1080 raw screencaps, or a file of captured
`OK grid=...` response lines.

ONE CAVEAT, STATED LOUDLY. A signature built from screencaps is PROVISIONAL.
The helper's cells come from Android's own VirtualDisplay scaler; this
box-averages the full frame instead, and ON-DEVICE-VALIDATION.md already records
that those are not the same measurement -- it is why the projection path's
classifier threshold is called uncalibrated. Build from captured GRID lines when
you can. `build` marks which source it used and `test` refuses to call a
screencap-built signature validated.
"""
import argparse
import json
import re
import struct
import sys
from pathlib import Path

# The helper's sensor. Not a constant of the world: VISUAL_WIDTH/HEIGHT in
# CaptureService.java set it, so --grid exists to answer what a different
# sensor would buy before anyone rebuilds the APK for it.
W, H = 20, 9
CELLS = W * H


def set_grid(w, h):
    global W, H, CELLS
    W, H, CELLS = w, h, w * h


def grid_from_raw(path):
    """Box-average a 2400x1080 screencap down to the helper's 20x9 sensor."""
    data = path.read_bytes()
    if len(data) < 16:
        return None
    width, height, fmt, _ = struct.unpack_from("<IIII", data)
    if not width or not height or len(data) < 16 + width * height * 4:
        return None
    px = data[16:]
    out = []
    for gy in range(H):
        y0, y1 = gy * height // H, (gy + 1) * height // H
        for gx in range(W):
            x0, x1 = gx * width // W, (gx + 1) * width // W
            r = g = b = n = 0
            for y in range(y0, y1, max(1, (y1 - y0) // 6)):
                row = y * width * 4
                for x in range(x0, x1, max(1, (x1 - x0) // 6)):
                    i = row + x * 4
                    r += px[i]; g += px[i + 1]; b += px[i + 2]; n += 1
            n = max(n, 1)
            out.append((r // n, g // n, b // n))
    return out


def grid_from_line(line):
    m = re.match(r"OK grid=(\d+)x(\d+) seq=\d+ ([0-9a-f]+)", line.strip())
    if not m or (int(m.group(1)), int(m.group(2))) != (W, H):
        return None
    body = m.group(3)
    if len(body) < CELLS * 6:
        return None
    return [(int(body[i:i + 2], 16), int(body[i + 2:i + 4], 16), int(body[i + 4:i + 6], 16))
            for i in range(0, CELLS * 6, 6)]


def load(path):
    """Returns (grids, source) where source is 'grid' or 'screencap'."""
    p = Path(path)
    if p.is_dir():
        grids = [g for g in (grid_from_raw(f) for f in sorted(p.glob("*.raw"))) if g]
        return grids, "screencap"
    lines = p.read_text().splitlines()
    grids = [g for g in (grid_from_line(l) for l in lines) if g]
    return grids, "grid"


def mean_grid(grids):
    return [tuple(sum(g[i][c] for g in grids) // len(grids) for c in range(3))
            for i in range(CELLS)]


def distance(a, b):
    """Mean absolute per-channel difference. Bounded 0..255, so thresholds read."""
    total = 0
    for x, y in zip(a, b):
        total += abs(x[0] - y[0]) + abs(x[1] - y[1]) + abs(x[2] - y[2])
    return total / (CELLS * 3)


def classify(sig, grid):
    scored = sorted(((distance(grid, [tuple(c) for c in cls["mean"]]), cls["label"])
                     for cls in sig["classes"]), key=lambda s: s[0])
    best, second = scored[0], scored[1] if len(scored) > 1 else (255.0, None)
    if best[0] > sig["max_distance"]:
        return "unknown", best[0], second[0] - best[0]
    if second[0] - best[0] < sig["min_margin"]:
        return "unknown", best[0], second[0] - best[0]
    return best[1], best[0], second[0] - best[0]


def cmd_build(a):
    classes, sources = [], set()
    for spec in a.labelled:
        label, _, path = spec.partition("=")
        grids, source = load(path)
        if not grids:
            print(f"{path}: no usable frames", file=sys.stderr)
            raise SystemExit(2)
        sources.add(source)
        classes.append({"label": label, "count": len(grids),
                        "mean": [list(c) for c in mean_grid(grids)],
                        "_grids": grids})

    print(f"{len(classes)} classes from {'+'.join(sorted(sources))} frames")
    worst_intra = 0.0
    for cls in classes:
        m = [tuple(c) for c in cls["mean"]]
        spread = max((distance(g, m) for g in cls["_grids"]), default=0.0)
        worst_intra = max(worst_intra, spread)
        print(f"  {cls['label']:12s} {cls['count']:3d} frames, spread {spread:6.2f}")
    closest = 255.0
    for i, x in enumerate(classes):
        for y in classes[i + 1:]:
            d = distance([tuple(c) for c in x["mean"]], [tuple(c) for c in y["mean"]])
            closest = min(closest, d)
            print(f"  {x['label']} <-> {y['label']}: {d:.2f} apart")
    if len(classes) > 1 and closest <= worst_intra:
        print(f"\nREFUSED: the closest two classes are {closest:.2f} apart but a class "
              f"spreads {worst_intra:.2f}. They overlap; a signature built from this "
              "would answer confidently and be wrong.", file=sys.stderr)
        raise SystemExit(1)

    sig = {"grid": [W, H],
           "source": "+".join(sorted(sources)),
           "provisional": "screencap" in sources,
           "max_distance": round(a.max_distance if a.max_distance is not None
                                 else worst_intra * 2 + 1, 2),
           "min_margin": round(a.min_margin if a.min_margin is not None
                               else max(1.0, closest / 3), 2),
           "classes": [{k: v for k, v in c.items() if not k.startswith("_")}
                       for c in classes]}
    Path(a.output).write_text(json.dumps(sig, indent=1))
    print(f"\nmax_distance {sig['max_distance']}, min_margin {sig['min_margin']}")
    print(f"wrote {a.output}")
    if sig["provisional"]:
        print("PROVISIONAL: built from screencaps, not from the helper's own cells. "
              "Android's VirtualDisplay scaler is not this box filter; validate "
              "against captured GRID lines before trusting it live.")


def cmd_test(a):
    sig = json.loads(Path(a.signature).read_text())
    total = right = 0
    for spec in a.labelled:
        label, _, path = spec.partition("=")
        grids, _ = load(path)
        got = {}
        for g in grids:
            verdict, _, _ = classify(sig, g)
            got[verdict] = got.get(verdict, 0) + 1
            total += 1
            right += verdict == label
        print(f"  {label:12s} -> " + ", ".join(f"{k} {v}" for k, v in sorted(got.items())))
    print(f"{right}/{total} correct")
    if sig.get("provisional"):
        print("NOT VALIDATED: this signature is screencap-built; a holdout of the same "
              "kind cannot tell you how it behaves on the helper's own cells.")
    if right != total:
        raise SystemExit(1)


def cmd_match(a):
    sig = json.loads(Path(a.signature).read_text())
    grid = grid_from_line(sys.stdin.read())
    if grid is None:
        print("unknown unparseable-grid")
        raise SystemExit(2)
    verdict, score, margin = classify(sig, grid)
    print(f"{verdict} score={score:.2f} margin={margin:.2f}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--grid", default="20x9",
                   help="sensor size to model; the shipped helper is 20x9")
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("labelled", nargs="+", metavar="LABEL=PATH")
    b.add_argument("--output", required=True)
    b.add_argument("--max-distance", type=float, default=None)
    b.add_argument("--min-margin", type=float, default=None)
    b.set_defaults(fn=cmd_build)
    t = sub.add_parser("test")
    t.add_argument("signature")
    t.add_argument("labelled", nargs="+", metavar="LABEL=PATH")
    t.set_defaults(fn=cmd_test)
    m = sub.add_parser("match")
    m.add_argument("signature")
    m.set_defaults(fn=cmd_match)
    a = p.parse_args()
    gw, _, gh = a.grid.partition("x")
    set_grid(int(gw), int(gh))
    a.fn(a)


if __name__ == "__main__":
    main()
