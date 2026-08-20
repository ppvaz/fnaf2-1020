#!/bin/bash
# Run the canonical timed Minus 7 main loop on Night 5.
#
# This is intentionally open-loop once the office appears: Minus 7 is clocked,
# not visual-reactive. All actions run inside one adb shell against Android's
# monotonic wall clock so host/USB round trips cannot accumulate cycle drift.
# The default is six main cycles (about 37 seconds including the opening).
set -euo pipefail

OUT="${1:-minus7-n5}"
CYCLES="${2:-6}"
DEBUG_OVERLAYS="${DEBUG_OVERLAYS:-1}"
GRADE_RUN="${GRADE_RUN:-1}"
PRESS_MODE="${PRESS_MODE:-async-swipe}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REC=""

case "$CYCLES" in
  ''|*[!0-9]*) echo "cycles must be a positive integer"; exit 2 ;;
esac
[ "$CYCLES" -gt 0 ] || { echo "cycles must be a positive integer"; exit 2; }
case "$DEBUG_OVERLAYS" in
  0|1) ;;
  *) echo "DEBUG_OVERLAYS must be 0 or 1"; exit 2 ;;
esac
case "$GRADE_RUN" in
  0|1) ;;
  *) echo "GRADE_RUN must be 0 or 1"; exit 2 ;;
esac
case "$PRESS_MODE" in
  swipe|tap|async-swipe) ;;
  *) echo "PRESS_MODE must be swipe, tap, or async-swipe"; exit 2 ;;
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
adb shell input swipe $TAP_CONTINUE $TAP_CONTINUE 120

# Loading is variable. The timed program begins only after the office HUD is
# visible; no screenshot/classification occurs after this gate.
for i in $(seq 1 40); do
  [ "$(state)" = "night" ] && break
  sleep 1
  [ "$i" = 40 ] && { echo "abort: Night 5 never started"; exit 1; }
done
echo "Night 5 detected; starting timed Minus 7 opening + $CYCLES cycles ($PRESS_MODE presses)"

MAXDUR=$((25 + CYCLES * 5))
adb shell "screenrecord --size 1280x576 --bit-rate 3000000 --time-limit $MAXDUR /sdcard/$OUT.mp4" &
REC=$!

# Positional coordinates keep this remote program literal and auditable.
adb shell sh -s -- "$CYCLES" "$PRESS_MODE" \
  $TAP_MUTE $TAP_MONITOR $TAP_MASK $TAP_LIGHT $WIND \
  $TAP_CAM10 $TAP_CAM04 $TAP_CAM07 $TAP_CAM11 <<'REMOTE'
set -eu
CYCLES=$1; shift
PRESS_MODE=$1; shift
MUTE_X=$1; MUTE_Y=$2; shift 2
MONITOR_X=$1; MONITOR_Y=$2; shift 2
MASK_X=$1; MASK_Y=$2; shift 2
LIGHT_X=$1; LIGHT_Y=$2; shift 2
WIND_X=$1; WIND_Y=$2; shift 2
CAM10_X=$1; CAM10_Y=$2; shift 2
CAM04_X=$1; CAM04_Y=$2; shift 2
CAM07_X=$1; CAM07_Y=$2; shift 2
CAM11_X=$1; CAM11_Y=$2

T0=$(date +%s%3N)

wait_until() {
  target=$((T0 + $1))
  while :; do
    now=$(date +%s%3N)
    left=$((target - now))
    [ "$left" -le 0 ] && return
    if [ "$left" -gt 40 ]; then
      delay=$((left - 20))
      whole=$((delay / 1000))
      frac=$((delay % 1000))
      sleep "$whole.$(printf '%03d' "$frac")"
    fi
  done
}

press_at() {
  offset=$1; x=$2; y=$3; label=$4
  wait_until "$offset"
  actual=$(( $(date +%s%3N) - T0 ))
  printf '%6d ms  %s\n' "$actual" "$label"
  if [ "$PRESS_MODE" = "tap" ]; then
    input tap "$x" "$y"
  elif [ "$PRESS_MODE" = "async-swipe" ]; then
    input swipe "$x" "$y" "$x" "$y" 120 >/dev/null 2>&1 &
  else
    input swipe "$x" "$y" "$x" "$y" 120
  fi
}

hold_at() {
  offset=$1; x=$2; y=$3; duration=$4; label=$5
  wait_until "$offset"
  actual=$(( $(date +%s%3N) - T0 ))
  printf '%6d ms  %s (%d ms)\n' "$actual" "$label" "$duration"
  input swipe "$x" "$y" "$x" "$y" "$duration"
}

# Night 5 calibration opening: the box begins full, so wait for real drain
# instead of holding the wind button immediately. The first camera sweep ends
# just before a short top-up and the first seven-second cycle anchor.
press_at     0 "$MUTE_X"    "$MUTE_Y"    mute
press_at   180 "$MONITOR_X" "$MONITOR_Y" monitor-up
press_at   460 "$CAM11_X"   "$CAM11_Y"   cam-11
press_at  4000 "$CAM10_X"   "$CAM10_Y"   cam-10
press_at  4230 "$LIGHT_X"   "$LIGHT_Y"   light-10
press_at  4460 "$CAM04_X"   "$CAM04_Y"   cam-04
press_at  4690 "$LIGHT_X"   "$LIGHT_Y"   light-04
press_at  4920 "$CAM07_X"   "$CAM07_Y"   cam-07
press_at  5150 "$LIGHT_X"   "$LIGHT_Y"   light-07
press_at  5380 "$CAM11_X"   "$CAM11_Y"   cam-11
hold_at   5620 "$WIND_X"    "$WIND_Y"    1250 wind-to-anchor

cycle=0
while [ "$cycle" -lt "$CYCLES" ]; do
  base=$((7000 + cycle * 5000))
  press_at $((base +    0)) "$MONITOR_X" "$MONITOR_Y" monitor-down
  press_at $((base +  320)) "$MASK_X"    "$MASK_Y"    mask-on
  press_at $((base +  700)) "$MASK_X"    "$MASK_Y"    mask-off
  press_at $((base + 1000)) "$LIGHT_X"   "$LIGHT_Y"   flash-hall
  press_at $((base + 1250)) "$MONITOR_X" "$MONITOR_Y" monitor-up
  # Stock `adb shell input` cannot express a two-thumb hold-light-and-tap
  # gesture. Separate 120 ms presses are reliable; 230 ms launch spacing is
  # the shortest non-overlapping cadence supported by the calibration runs.
  press_at $((base + 1500)) "$CAM10_X"   "$CAM10_Y"   cam-10
  press_at $((base + 1730)) "$LIGHT_X"   "$LIGHT_Y"   light-10
  press_at $((base + 1960)) "$CAM04_X"   "$CAM04_Y"   cam-04
  press_at $((base + 2190)) "$LIGHT_X"   "$LIGHT_Y"   light-04
  press_at $((base + 2420)) "$CAM07_X"   "$CAM07_Y"   cam-07
  press_at $((base + 2650)) "$LIGHT_X"   "$LIGHT_Y"   light-07
  press_at $((base + 2880)) "$CAM11_X"   "$CAM11_Y"   cam-11
  hold_at  $((base + 3120)) "$WIND_X"    "$WIND_Y"    1700 wind
  cycle=$((cycle + 1))
done
wait
REMOTE

stop_recording
sleep 2
adb pull "/sdcard/$OUT.mp4" "$HERE/../../captures/$OUT.mp4" >/dev/null
adb shell rm "/sdcard/$OUT.mp4"
adb shell am force-stop com.scottgames.fnaf2
echo "saved captures/$OUT.mp4"
if [ "$GRADE_RUN" = 1 ]; then
  python3 "$HERE/grade-minus7.py" "$HERE/../../captures/$OUT.mp4"
fi
