#!/bin/bash
# On-device trial: mask-clear semantics (validation target #1).
#
# Protocol: from the FNaF 2 title screen (Continue = Night 5), wind the box,
# drop the monitor, put the Freddy mask on and leave it on until death, while
# screenrecord captures the run. Post-hoc frame analysis measures the interval
# from a vent visitor's office overlay appearing to it disappearing:
#   - Android event-sheet model predicts >= 5 s (five continuous masked
#     scheduler ticks, 10%/s early roll)
#   - PC-style behavior predicts < 1 s
#
# All timings are wall-clock via a single pre-scripted sequence: interactive
# driving does not work (inference/command latency = game over, trial 2026-08-20).
#
# Coordinates: Moto g56 5G, 2400x1080 landscape, calibrated 2026-08-20.
set -euo pipefail

OUT="${1:-trial}"
DUR="${2:-150}"   # seconds of recording

# Never tap blind: bring the game to the foreground and confirm it is the
# focused app before any input (trial 2 recorded 150 s of the Clock app and
# nearly edited a real alarm).
adb shell am start -n com.scottgames.fnaf2/.Main >/dev/null
sleep 4
FOCUS=$(adb shell dumpsys window 2>/dev/null | grep -m1 mCurrentFocus || true)
case "$FOCUS" in
  *com.scottgames.fnaf2*) ;;
  *) echo "abort: game is not focused ($FOCUS)"; exit 1 ;;
esac

source "$(dirname "$0")/coords.sh"

adb shell "screenrecord --size 1200x540 --bit-rate 3000000 --time-limit $DUR /sdcard/$OUT.mp4" &
REC=$!
sleep 1

NIGHT_TAP=$TAP_CONTINUE; [ "${3:-}" = "6th" ] && NIGHT_TAP=$TAP_6TH
adb shell input swipe $NIGHT_TAP $NIGHT_TAP 120     # start the night
sleep 6
adb shell input swipe $TAP_MUTE $TAP_MUTE 120         # mute the phone call
sleep 0.6
adb shell input swipe $TAP_MONITOR $TAP_MONITOR 120      # cams up
sleep 1.2
adb shell input swipe $TAP_CAM11 $TAP_CAM11 120
sleep 0.8
adb shell input swipe $WIND $WIND 5000   # hold wind ~5 s
sleep 0.4
adb shell input swipe $TAP_MONITOR $TAP_MONITOR 120      # cams down
sleep 0.3
# Mask must beat the 50-frame night-5 office-defense fuse (trial 4 died to a
# 3 s-late mask exactly as the model predicts), so press it right away.
adb shell input swipe $TAP_MASK $TAP_MASK 150   # mask ON, stay on until death

wait $REC || true
adb pull "/sdcard/$OUT.mp4" "$(dirname "$0")/../../captures/$OUT.mp4"
adb shell rm "/sdcard/$OUT.mp4"
echo "saved captures/$OUT.mp4"
