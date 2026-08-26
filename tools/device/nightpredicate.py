#!/usr/bin/env python3
"""Is the office HUD on screen? One definition, three callers.

This predicate decides whether a night is running, and everything downstream
trusts it: the live watchdog, the graded run length, and the desync scan. It
existed in two copies until 2026-08-26, when only one of them got a correction
-- and the copy that missed it, `grade-night.py`, carried the docstring
"screenstate.py's live predicate, frame for frame" while no longer being that.
It is also the tool that produces the only number that is a run length, on
exactly the fresh-save route the correction was about.

So the boxes are expressed in FRACTIONS of the frame and the caller supplies a
sampler. A caller at 2400x1080 screencap geometry and one at 1280x576 video
geometry then evaluate the same rule rather than two rules that agree by
inspection.

    sample(x0, y0, x1, y1) -> (r, g, b) mean over that fractional box

The rule itself, and why each half is there:

  - a lit flashlight meter means the office;
  - or the pink mask bar, which stays visible in the masked view;
  - but NOT when the whole frame is bright. That guard was added 2026-08-26
    because the "HELP WANTED" newspaper -- the cutscene a New Game plays -- is
    bright everywhere, so the meter box clears its threshold on brightness that
    is not a meter (measured 154.6, against the office's 165.6). Office frames
    measure 14.5-35.1 on the global rows, the newspaper 112.5. The guard can
    only ever take `night` away, never grant it.
"""

# Fractions of the frame, from the 2400x1080 boxes both callers were using.
FLASH = (95 / 2400, 40 / 1080, 260 / 2400, 95 / 1080)
MASKBAR = (70 / 2400, 1000 / 1080, 1180 / 2400, 1045 / 1080)
# Two mid-frame rows, wide. Cheap for a video caller and only two extra
# scanlines for the adb fast path, which otherwise cannot see global brightness.
GLOBAL_ROWS = ((0.0, 500 / 1080, 1.0, 501 / 1080), (0.0, 700 / 1080, 1.0, 701 / 1080))
GLOBAL_BRIGHT_MAX = 80.0


def is_night(sample):
    """True when the office HUD is on screen. `sample` returns an (r,g,b) mean."""
    overall = [sample(*box) for box in GLOBAL_ROWS]
    if sum(sum(o) for o in overall) / (3 * len(overall)) >= GLOBAL_BRIGHT_MAX:
        return False
    flash = sample(*FLASH)
    if flash[0] > 90:
        return True
    maskbar = sample(*MASKBAR)
    return maskbar[0] > 50 and maskbar[0] > maskbar[2] * 1.3
