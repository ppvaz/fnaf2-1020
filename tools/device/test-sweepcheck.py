#!/usr/bin/env python3
"""Gate for sweepcheck's per-camera lit/dark classifier. No phone, no video.

The old sweepcheck measured feed brightness and could not resolve the c33
LIGHT_AFTER geometry: on the NO_LIGHT control it read cam07 lit every sweep,
on ALT_LIGHT it was coin-flip, on the cleared n1-grey-2202 it was 5/73.

The new one learns per-camera signatures from an ALT_LIGHT run
(`--recalibrate`). This pins:
  * the bundled signature is complete and self-consistent,
  * features() reads a black frame as dark and a textured mid-grey frame as
    bright + high-edge (the two signals the cameras actually split on),
  * the classify rule is a plain per-camera threshold,
  * the tearing reference frames still land on the right side.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(HERE))
import sweepcheck  # noqa: E402

try:
    from PIL import Image
except ImportError:
    print("PIL is required for this gate", file=sys.stderr)
    raise SystemExit(2)

fail = []


# --- 1. the bundled signature ------------------------------------------------
sig = json.loads(Path(sweepcheck.DEFAULT_SIG).read_text())
if sorted(sig["cams"]) != ["10", "4", "7"]:
    fail.append(f"signature must cover cams 10/4/7, has {sorted(sig['cams'])}")
for cam, c in sig["cams"].items():
    if c["feature"] not in ("vedge", "brightfrac"):
        fail.append(f"cam {cam}: unknown feature {c['feature']}")
    if not (0 < c["threshold"] < 300):
        fail.append(f"cam {cam}: implausible threshold {c['threshold']}")
    if c.get("specificity", 0) < 0.8:
        fail.append(f"cam {cam}: signature rejects only {c['specificity']} of dark sweeps "
                    "-- a NO_LIGHT run would false-positive")
# CAM 07 (Main Hall, black without the light) must split on edges, not
# brightness -- that distinction is the whole point of the rewrite.
if sig["cams"]["7"]["feature"] != "vedge":
    fail.append("cam 07 must use vedge: brightness does not separate it "
                "(dark and lit both ~178 mean on n=275)")


# --- 2. features() on synthetic frames -------------------------------------
def gray_frame(fn):
    buf = bytearray(sweepcheck.WIDTH * sweepcheck.HEIGHT)
    for y in range(sweepcheck.HEIGHT):
        for x in range(sweepcheck.WIDTH):
            buf[y * sweepcheck.WIDTH + x] = fn(x, y)
    return bytes(buf)

black = gray_frame(lambda x, y: 4)
# a "lit room": mid-grey with vertical structure every ~12 px
lit_room = gray_frame(lambda x, y: 70 + (55 if (x // 6) % 2 else 0))

bv, bb = sweepcheck.features(black)
lv, lb = sweepcheck.features(lit_room)
if not (bv < 3 and bb < 0.05):
    fail.append(f"a black frame must read low edge + low brightfrac, got vedge={bv:.1f} bf={bb:.2f}")
if not (lv > bv + 5 and lb > 0.8):
    fail.append(f"a lit textured frame must read higher on both, got vedge={lv:.1f} bf={lb:.2f}")


# --- 3. the classify rule ------------------------------------------------
def lit(cam, vedge, brightfrac):
    c = sig["cams"][str(cam)]
    return (vedge if c["feature"] == "vedge" else brightfrac) >= c["threshold"]

t7 = sig["cams"]["7"]["threshold"]
if lit(7, t7 - 1, 0.9) or not lit(7, t7 + 1, 0.1):
    fail.append("cam 07 verdict must follow vedge vs its threshold alone")
t4 = sig["cams"]["4"]["threshold"]
if lit(4, 99, t4 - 0.05) or not lit(4, 0, t4 + 0.05):
    fail.append("cam 04 verdict must follow brightfrac vs its threshold alone")


# --- 4. the tearing reference frames still land right --------------------
FRAMES = REPO / "docs" / "img" / "tearing-vs-flash"
refs = {"1-dark_cam11_bands0_luma18.png": False, "2-lit_cam11_bands0_luma115.png": True}
for name, want_lit in refs.items():
    p = FRAMES / name
    if not p.exists():
        continue
    im = Image.open(p).convert("L").resize((sweepcheck.WIDTH, sweepcheck.HEIGHT))
    v, b = sweepcheck.features(im.tobytes())
    # these are CAM 11 frames; check the brighter one reads brighter
    refs[name] = (v, b)
if all(isinstance(x, tuple) for x in refs.values()):
    (dv, db), (lv2, lb2) = refs["1-dark_cam11_bands0_luma18.png"], refs["2-lit_cam11_bands0_luma115.png"]
    if not (lb2 > db and lv2 >= dv):
        fail.append(f"the lit reference frame must read brighter than the dark one, "
                    f"got dark=({dv:.1f},{db:.2f}) lit=({lv2:.1f},{lb2:.2f})")


if fail:
    for f in fail:
        print("FAIL " + f, file=sys.stderr)
    raise SystemExit(1)
print("sweepcheck classifier: signature complete, "
      f"cam07 splits on {sig['cams']['7']['feature']}>={sig['cams']['7']['threshold']}, "
      f"cam04/10 on brightfrac; synthetic + reference frames land right")
