#!/usr/bin/env python3
"""State restorer for hid-monitorraise-probe: lowers the monitor, only in
the stream's own idle windows, only when a raise actually landed.

The monitor is a toggle, so a blind stream cannot clean up after a
swallowed probe press -- a cleanup tap raises instead of lowering, and one
parity error inverts every later trial (the 2026-09-04 hall sweep's runs 3
and 4 degraded exactly that way). This watcher gives the stream eyes:

  1. it polls the screen until the TEACH raise appears (the only map-up in
     the stream's first ten seconds) and anchors the stream clock on it;
  2. in every scheduled idle window it classifies one device-local frame
     with the project's monitor-ROI checker and, only on a positive
     `match`, taps the monitor bar through `input swipe` to lower it.

Corrections never overlap a seam: idles follow the observe window and end
at least ~1.2 s before the next trial's first press.

Usage: monitorraise-watch.py SCHEDULE.json [--serial SERIAL]
Stops when the schedule's last idle window closes.
"""
import argparse
import json
import subprocess
import sys
import time

MONITOR_X, MONITOR_Y = 1780, 1015          # coords.sh TAP_MONITOR
CHECKER = "/data/local/tmp/fnaf-monraise-check"
FRAME = "/data/local/tmp/fnaf-monraise-frame.raw"
# CUE_MONITOR_ROI from trial/06-cams-up-anchor.sh: the camera map's lime
# selection highlight. Office frames read `clear`; the map reads `match`.
ROI = "1300 350 2300 950 4 100 255 100 255 0 99 30"


def adb(*args, binary=False):
    result = subprocess.run(
        ["adb"] + (["-s", SERIAL] if SERIAL else []) + list(args),
        capture_output=True, timeout=10)
    return result.stdout if binary else result.stdout.decode(errors="replace").strip()


def map_is_up():
    # One round trip, everything device-local: capture to a file, classify
    # it where it lies. ~0.35 s on the reference phone.
    out = adb("shell",
              f"screencap > {FRAME} && {CHECKER} match {ROI} < {FRAME}; rm -f {FRAME}")
    return out.splitlines()[-1].strip() if out else ""


def lower_monitor():
    # A zero-duration `input tap` is dropped by the per-frame touch poll;
    # maskcamp established the 100 ms swipe form for host-side presses.
    adb("shell", "input", "swipe", str(MONITOR_X), str(MONITOR_Y),
        str(MONITOR_X), str(MONITOR_Y), "100")


def main():
    global SERIAL
    ap = argparse.ArgumentParser()
    ap.add_argument("schedule")
    ap.add_argument("--serial")
    ap.add_argument("--anchor-timeout", type=float, default=30.0)
    args = ap.parse_args()
    SERIAL = args.serial

    with open(args.schedule, encoding="utf-8") as f:
        schedule = json.load(f)
    idles = schedule["idles"]
    if not idles:
        return 0
    stream0 = schedule.get("streamStartMonotonicMs")

    # 1. Anchor on the teach raise: poll until the map is up, then set
    #    t0 so that virtual time teachRaiseAt is 'now' (the poll interval
    #    makes this late by up to one poll; the idle windows absorb it).
    deadline = time.monotonic() + args.anchor_timeout
    while time.monotonic() < deadline:
        if map_is_up() == "match":
            t0 = time.monotonic() - schedule["teachRaiseAt"] / 1000.0
            break
        time.sleep(0.25)
    else:
        print("watcher: the teach raise was never seen; no corrections made", file=sys.stderr)
        return 1
    if stream0 is not None:
        print(f"watcher: anchored (host->stream lag {(t0 - stream0 / 1000.0) * 1000:+.0f} ms)")

    # 2. Correct inside idle windows only.
    corrections = 0
    for idle in idles:
        target = t0 + idle["start"] / 1000.0 + 0.25
        if target > time.monotonic():
            time.sleep(target - time.monotonic())
        window_end = t0 + idle["end"] / 1000.0
        if time.monotonic() < window_end and map_is_up() == "match":
            lower_monitor()
            corrections += 1
            print(f"watcher: lowered the monitor in idle at +{idle['start']} ms")
    print(f"watcher: done, {corrections} correction(s) over {len(idles)} idles")
    return 0


if __name__ == "__main__":
    sys.exit(main())
