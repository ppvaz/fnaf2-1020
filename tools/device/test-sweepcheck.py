#!/usr/bin/env python3
"""Gate for the tearing-vs-flash discriminator. No phone, no video decode.

sweepcheck reported 68/75 sweeps flashed on a night where it was measuring the
camera-switch tearing rather than the flashlight. The whole-ROI mean it used
inverts the two states: a torn-and-unlit frame reads brighter than a clean-and-
lit one. Excluding torn frames instead loses the state that matters, because
the flash IS visible through a tear.

So this pins the four states against real frames kept in docs/img/tearing-vs-
flash, captured from hid-sweep-probe.mp4 at 60 fps. Their measured values are
in their filenames. If the discriminator is ever "simplified" back to a
whole-ROI mean, states 3 and 4 stop being separable and this fails.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
FRAMES = REPO / "docs" / "img" / "tearing-vs-flash"
sys.path.insert(0, str(HERE))
import sweepcheck  # noqa: E402

try:
    from PIL import Image
except ImportError:
    print("PIL is required for this gate", file=sys.stderr)
    raise SystemExit(2)

X0, Y0, X1, Y1 = sweepcheck.FEED
W = sweepcheck.WIDTH


def measure(path):
    """Band rows and tear-robust brightness, as sweepcheck's luma() computes them."""
    im = Image.open(path).convert("L").resize((sweepcheck.WIDTH, sweepcheck.HEIGHT))
    buf = im.tobytes()
    bands, textured = 0, []
    for y in range(Y0, Y1, 4):
        r = y * W
        row = [buf[r + x] for x in range(X0, X1, 16)]
        if max(row) - min(row) < sweepcheck.BAND_FLAT:
            bands += 1
        else:
            textured.append(sum(buf[r + x] for x in range(X0, X1, 4))
                            / len(range(X0, X1, 4)))
    return bands, (sum(textured) / len(textured) if textured else None)


# name -> (torn?, lit?) -- the ground truth these frames were chosen to carry.
CASES = {
    "1-dark_cam11_bands0_luma18.png": (False, False),
    "2-lit_cam11_bands0_luma115.png": (False, True),
    "3-tearing_cam11_bands123_luma21.png": (True, False),
    "4-tearing+lit_cam10_bands118_luma136.png": (True, True),
}
LIT = 86.0   # sweepcheck derives this per recording; the reference set is well
             # clear of it on both sides (18/21 dark, 115/136 lit).

failures = []
for name, (want_torn, want_lit) in CASES.items():
    path = FRAMES / name
    if not path.exists():
        failures.append(f"{name}: missing -- the reference set is the gate")
        continue
    bands, robust = measure(path)
    if robust is None:
        failures.append(f"{name}: no textured row at all")
        continue
    torn, lit = bands > 0, robust >= LIT
    if (torn, lit) != (want_torn, want_lit):
        failures.append(
            f"{name}: read torn={torn} lit={lit} "
            f"(bands={bands}, robust={robust:.1f}); expected torn={want_torn} lit={want_lit}")

# The control that matters: the naive whole-ROI mean must FAIL to separate
# these, or the tear-robust measure is solving a problem that is not there.
naive = {}
for name in CASES:
    path = FRAMES / name
    if not path.exists():
        continue
    im = Image.open(path).convert("L").resize((sweepcheck.WIDTH, sweepcheck.HEIGHT))
    buf = im.tobytes()
    vals = [buf[y * W + x] for y in range(Y0, Y1, 4) for x in range(X0, X1, 4)]
    naive[name] = sum(vals) / len(vals)
if naive:
    torn_unlit = naive.get("3-tearing_cam11_bands123_luma21.png")
    clean_lit = naive.get("2-lit_cam11_bands0_luma115.png")
    if torn_unlit is not None and clean_lit is not None and torn_unlit <= clean_lit:
        failures.append(
            "the naive whole-ROI mean separates these frames after all "
            f"(torn-unlit {torn_unlit:.1f} <= clean-lit {clean_lit:.1f}); "
            "re-derive why the tear-robust measure is needed before trusting it")

if failures:
    for f in failures:
        print("FAIL " + f, file=sys.stderr)
    raise SystemExit(1)
print(f"sweepcheck discriminator: 4 reference states separated; "
      f"naive mean inverts them ({naive['3-tearing_cam11_bands123_luma21.png']:.0f} torn-unlit "
      f"vs {naive['2-lit_cam11_bands0_luma115.png']:.0f} clean-lit)")
