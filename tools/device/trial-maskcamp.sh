#!/bin/bash
# On-device trial: mask-clear semantics (validation target #1).
#
# Closed-loop protocol: cold-start the game to the title, press the night,
# WAIT until the office HUD is detected (load time varies run to run), then
# optionally wind the box on CAM 11, drop, mask on immediately (inside the
# defense fuse), and sit masked until screenstate.py reports the night is over.
# The `nowind` protocol makes one quick monitor flip and masks around 4 s into
# the recording, lengthening the useful window and overlapping early vent
# arrivals. `nowind-flash` additionally flashes the hall once before masking
# to reset W. Foxy, without interrupting the subsequent continuous-mask window.
# A positive `gameover` read ends the trial immediately; otherwise
# 3 consecutive non-night reads ~2 s apart cover jumpscare/static transitions.
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
PROTOCOL="${4:-wind}"
DEBUG_OVERLAYS="${DEBUG_OVERLAYS:-1}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REC=""

case "$PROTOCOL" in
  wind|nowind|nowind-flash) ;;
  *) echo "usage: $0 [name] [seconds] [continue|6th] [wind|nowind|nowind-flash]"; exit 2 ;;
esac
case "$DEBUG_OVERLAYS" in
  0|1) ;;
  *) echo "DEBUG_OVERLAYS must be 0 or 1"; exit 2 ;;
esac
case "$NIGHT" in
  continue|6th) ;;
  *) echo "night must be continue or 6th"; exit 2 ;;
esac

state() {
  local attempt result
  for attempt in 1 2 3; do
    if result=$(adb exec-out screencap -p 2>/dev/null |
      python3 "$HERE/screenstate.py" 2>/dev/null); then
      printf '%s\n' "$result"
      return 0
    fi
    sleep 1
  done
  printf '%s\n' "unavailable"
}

stop_recording() {
  [ -n "$REC" ] || return 0
  adb shell pkill -INT screenrecord 2>/dev/null || true
  wait "$REC" 2>/dev/null || true
  REC=""
}

trap stop_recording EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Cold-start so every trial begins at the title screen; the menu save persists.
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard >/dev/null 2>&1 || true
sleep 1
adb shell cmd statusbar collapse >/dev/null 2>&1 || true
adb shell settings put system show_touches "$DEBUG_OVERLAYS"
adb shell settings put system pointer_location "$DEBUG_OVERLAYS"
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
if [ "$PROTOCOL" = "wind" ]; then
  sleep 1.5
  adb shell input swipe $TAP_CAM11 $TAP_CAM11 120
  sleep 0.8
  adb shell input swipe $WIND $WIND 5000                 # wind the box
else
  sleep 0.7                                               # let cams finish opening
fi
sleep 0.4
adb shell input swipe $TAP_MONITOR $TAP_MONITOR 120      # cams down
sleep 0.3
if [ "$PROTOCOL" = "nowind-flash" ]; then
  adb shell input swipe $TAP_HALL $TAP_HALL 2000         # one pre-mask Foxy reset
  sleep 0.2
fi
adb shell input swipe $TAP_MASK $TAP_MASK 150            # mask ON, beat the fuse
echo "$PROTOCOL: masked at $(( $(date +%s) - T0 ))s"

# Death watch: 3 consecutive non-night reads (~6 s) ends the trial.
MISS=0
while [ $(( $(date +%s) - T0 )) -lt "$MAXDUR" ]; do
  sleep 2
  SCREEN_STATE=$(state)
  if [ "$SCREEN_STATE" = "unavailable" ]; then
    echo "warning: screencap unavailable; death counter unchanged"
  elif [ "$SCREEN_STATE" = "gameover" ]; then
    echo "game over at ~$(( $(date +%s) - T0 ))s"
    MISS=3
  elif [ "$SCREEN_STATE" = "night" ]; then
    MISS=0
  else
    MISS=$((MISS + 1))
  fi
  if [ "$MISS" -ge 3 ]; then
    [ "$SCREEN_STATE" = "gameover" ] || echo "death at ~$(( $(date +%s) - T0 - 6 ))s"
    break
  fi
done
[ "$MISS" -lt 3 ] && echo "survived the full ${MAXDUR}s window"

stop_recording
sleep 2
adb pull "/sdcard/$OUT.mp4" "$HERE/../../captures/$OUT.mp4" >/dev/null
adb shell rm "/sdcard/$OUT.mp4"
echo "saved captures/$OUT.mp4"
