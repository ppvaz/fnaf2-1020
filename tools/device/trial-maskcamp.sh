#!/bin/bash
# On-device trial: mask-clear semantics (validation target #1).
#
# Closed-loop protocol: cold-start the game to the title, press the night,
# WAIT until the office HUD is detected (load time varies run to run), then
# wind the box on CAM 11, drop, mask on immediately (inside the defense
# fuse), and sit masked until screenstate.py reports the night is over
# (3 consecutive non-night reads ~2 s apart = jumpscare/game over). The
# recording is finalized at death, so batches never tap into a live night
# and never wait out a dead one.
#
# Post-hoc: find-events.py locates overlay events in the capture; the
# interval a vent visitor's overlay stays on screen is the measurement
# (Android model: >= 5 s continuous mask or 10%/s rolls; PC-style: < 1 s).
#
# All touches are duration presses — the Fusion runtime polls touch by frame
# and drops zero-duration taps.
set -euo pipefail

OUT="${1:-trial}"
MAXDUR="${2:-170}"   # recording cap, seconds (screenrecord limit is 180)
NIGHT="${3:-6th}"
HERE="$(cd "$(dirname "$0")" && pwd)"

state() { adb exec-out screencap -p | python3 "$HERE/screenstate.py"; }

# Cold-start so every trial begins at the title screen; the menu save persists.
adb shell am force-stop com.scottgames.fnaf2
sleep 1
adb shell am start -n com.scottgames.fnaf2/.Main >/dev/null
sleep 7
FOCUS=$(adb shell dumpsys window 2>/dev/null | grep -m1 mCurrentFocus || true)
case "$FOCUS" in
  *com.scottgames.fnaf2*) ;;
  *) echo "abort: game is not focused ($FOCUS)"; exit 1 ;;
esac

source "$HERE/coords.sh"
NIGHT_TAP=$TAP_CONTINUE; [ "$NIGHT" = "6th" ] && NIGHT_TAP=$TAP_6TH
adb shell input swipe $NIGHT_TAP $NIGHT_TAP 120

# Wait for the office HUD (intro + load takes a variable ~10-20 s).
for i in $(seq 1 40); do
  [ "$(state)" = "night" ] && break
  sleep 1
  [ "$i" = 40 ] && { echo "abort: night never started"; exit 1; }
done
echo "night detected"

adb shell "screenrecord --size 1280x576 --bit-rate 3000000 --time-limit $MAXDUR /sdcard/$OUT.mp4" &
REC=$!
T0=$(date +%s)

sleep 1
adb shell input swipe $TAP_MUTE $TAP_MUTE 120
sleep 0.5
adb shell input swipe $TAP_MONITOR $TAP_MONITOR 120      # cams up
sleep 1.5
adb shell input swipe $TAP_CAM11 $TAP_CAM11 120
sleep 0.8
adb shell input swipe $WIND $WIND 5000                   # wind the box
sleep 0.4
adb shell input swipe $TAP_MONITOR $TAP_MONITOR 120      # cams down
sleep 0.3
adb shell input swipe $TAP_MASK $TAP_MASK 150            # mask ON, beat the fuse
echo "masked at $(( $(date +%s) - T0 ))s"

# Death watch: 3 consecutive non-night reads (~6 s) ends the trial.
MISS=0
while [ $(( $(date +%s) - T0 )) -lt "$MAXDUR" ]; do
  sleep 2
  if [ "$(state)" = "night" ]; then MISS=0; else MISS=$((MISS + 1)); fi
  if [ "$MISS" -ge 3 ]; then
    echo "death at ~$(( $(date +%s) - T0 - 6 ))s"
    break
  fi
done
[ "$MISS" -lt 3 ] && echo "survived the full ${MAXDUR}s window"

adb shell pkill -INT screenrecord 2>/dev/null || true
wait $REC 2>/dev/null || true
sleep 2
adb pull "/sdcard/$OUT.mp4" "$HERE/../../captures/$OUT.mp4" >/dev/null
adb shell rm "/sdcard/$OUT.mp4"
echo "saved captures/$OUT.mp4"
