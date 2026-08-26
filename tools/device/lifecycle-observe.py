#!/usr/bin/env python3
"""Name the lifecycle screen, or refuse. Adds classes; never overrides the authority.

`screenstate.py` classifies night / gameover / other, and stays the authority on
whether a night is running -- CLAUDE.md is explicit that a detector which knows
one way to be dead must never be what says you are alive. That rule cost this
project two runs reported at 163 s and 153 s which were 26.0 s and 72.2 s alive.

What it does not do is distinguish everything else. `other` covers the title, the
New Game confirmation, the Options screen, the "HELP WANTED" newspaper, a death,
a minigame, static, and a screen nobody has seen. plans/13 package 3 needs those
apart, because "the office HUD disappeared" is not a clear and an aborted
recording must not grade as a campaign advance.

So this runs screenstate first and only refines its `other`.

    screencap -p | lifecycle-observe.py          # state=title
    lifecycle-observe.py --adb --verbose

Output is one line: `state=<name>` (exit 0) or `unknown=<reason>` (exit 3).

Ordering matters and is measured, not assumed: the logo box reads 0.206 on an
OFFICE frame, higher than its 0.050 threshold, so a title test placed before the
HUD test would claim the office is a title screen. The HUD bars (0.151 in the
office, 0.000 on every title screen) are consulted first.

Not yet modelled, and deliberately reported as unknown rather than guessed:
the 6 AM transition and the minigames. Neither has been captured -- 6 AM needs a
survived night. `state=unknown` is the correct answer for them today.
"""
import json
import os
import subprocess
import sys
import warnings

warnings.simplefilter("ignore")

HERE = os.path.dirname(os.path.abspath(__file__))
GEOMETRY = (2400, 1080)
MODEL_SCHEMA = "lifecycle-model-v1"
DEFAULT_MODEL = os.path.join(HERE, "models", "lifecycle-moto-g56-v207.json")


def refuse(reason):
    print(f"unknown={reason}")
    raise SystemExit(3)


def load_frame(data):
    from PIL import Image, UnidentifiedImageError
    import io
    try:
        im = Image.open(io.BytesIO(data)).convert("RGB")
    except (OSError, UnidentifiedImageError):
        refuse("unreadable-frame")
    return im if im.size == GEOMETRY else im.resize(GEOMETRY)


def authority(data):
    """screenstate.py's verdict. It owns night and gameover."""
    out = subprocess.run([sys.executable, os.path.join(HERE, "screenstate.py")],
                         input=data, stdout=subprocess.PIPE,
                         stderr=subprocess.DEVNULL, check=False)
    return out.stdout.decode().strip() or "unknown"


def main(argv):
    verbose = "--verbose" in argv
    model_path = os.environ.get("LIFECYCLE_MODEL", DEFAULT_MODEL)
    try:
        with open(model_path, "r", encoding="utf-8") as fh:
            model = json.load(fh)
    except (OSError, ValueError):
        refuse("lifecycle-model-unreadable")
    if model.get("schema") != MODEL_SCHEMA:
        refuse(f"lifecycle-model-schema:{model.get('schema')}")

    if "--adb" in argv:
        got = subprocess.run(["adb", "exec-out", "screencap", "-p"],
                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                             timeout=8.0, check=False)
        if got.returncode != 0 or not got.stdout:
            refuse("capture-failed")
        data = got.stdout
    else:
        data = sys.stdin.buffer.read()

    verdict = authority(data)
    if verdict in ("night", "gameover"):
        print(f"state={verdict}")
        return 0

    im = load_frame(data)
    sigs, th = model["signatures"], model["thresholds"]
    bright = model["bright_min"]

    def value(name):
        s = sigs[name]
        box = tuple(s["box"])
        data_ = list(im.crop(box).resize((24, 24) if s["kind"] == "mean" else (32, 32)).getdata())
        if s["kind"] == "mean":
            return sum(sum(p) for p in data_) / (len(data_) * 3)
        return sum(1 for r, g, b in data_ if min(r, g, b) > bright) / len(data_)

    v = {name: value(name) for name in sigs}
    if verbose:
        print("  " + "  ".join(f"{k}={x:.3f}" for k, x in v.items()), file=sys.stderr)

    # The newspaper is the whole frame going bright; nothing else comes near it.
    if v["wholeFrameMean"] >= th["newspaperMeanMin"]:
        state = "newspaper"
    # The office HUD before anything else -- see the module docstring.
    elif v["hudBars"] >= th["hudPresentMin"] or v["hudNightClock"] >= th["hudPresentMin"]:
        # screenstate said this is not a night, yet the office HUD is drawn.
        # That disagreement is a finding, not something to resolve here.
        refuse(f"office-hud-without-night (bars {v['hudBars']:.3f})")
    elif v["optionsHeader"] >= th["optionsHeaderMin"]:
        state = "options"
    elif v["logo"] >= th["logoMin"] and v["menuOptionsRow"] >= th["menuRowMin"]:
        state = "title"
    elif v["logo"] >= th["logoMin"] and v["menuOptionsRow"] <= th["menuRowAbsentMax"]:
        state = "titleDialog"
    else:
        refuse("no-signature-matched")
    print(f"state={state}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
