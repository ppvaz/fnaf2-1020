#!/bin/bash
# Run the canonical timed Minus 7 interaction loop on a selectable night.
#
# This is intentionally open-loop once the office appears: Minus 7 is clocked,
# not visual-reactive. All actions run inside one adb shell against Android's
# monotonic wall clock so host/USB round trips cannot accumulate cycle drift.
# Host-side guards are strategy-independent: they stop the remote input program
# on lost focus or after three consecutive screenshots outside the night.
# The default is six main cycles (about 37 seconds including the opening).
set -euo pipefail

OUT="${1:-minus7-6th}"
CYCLES="${2:-6}"
NIGHT="${NIGHT:-6th}"
DEBUG_OVERLAYS="${DEBUG_OVERLAYS:-1}"
GRADE_RUN="${GRADE_RUN:-1}"
PRESS_MODE="${PRESS_MODE:-fast-swipe}"
WATCHDOG_INTERVAL="${WATCHDOG_INTERVAL:-0.25}"
WATCHDOG_CAPTURE_TIMEOUT="${WATCHDOG_CAPTURE_TIMEOUT:-0.8}"
FOCUS_WATCHDOG_INTERVAL="${FOCUS_WATCHDOG_INTERVAL:-0.10}"
HERE="$(cd "$(dirname "$0")" && pwd)"
CAPTURE_DIR="$HERE/../../captures"
LOCAL_VIDEO="$CAPTURE_DIR/$OUT.mp4"
LOCAL_ABORT_VIDEO="$CAPTURE_DIR/$OUT-aborted.mp4"
REMOTE_VIDEO="/sdcard/$OUT.mp4"
REMOTE_PIDFILE="/data/local/tmp/fnaf2-minus7-$$-$(date +%s).pid"
RUN_TMP=""
WATCHDOG_RESULT=""
REC=""
DRIVER_PID=""
WATCHDOG_PID=""
FOCUS_WATCHDOG_PID=""
GAME_LAUNCHED=0
RECORDING_STARTED=0
CAPTURE_PULLED=0

case "$OUT" in
  ''|.*|*..*|*[!A-Za-z0-9._-]*)
    echo "name must be a plain basename using letters, numbers, dot, dash, or underscore"
    exit 2
    ;;
esac
[ "${#OUT}" -le 80 ] || { echo "name must be at most 80 characters"; exit 2; }
case "$CYCLES" in
  ''|*[!0-9]*) echo "cycles must be a positive integer"; exit 2 ;;
esac
[ "$CYCLES" -gt 0 ] || { echo "cycles must be a positive integer"; exit 2; }
case "$NIGHT" in
  continue|6th) ;;
  *) echo "NIGHT must be continue or 6th"; exit 2 ;;
esac
case "$DEBUG_OVERLAYS" in
  0|1) ;;
  *) echo "DEBUG_OVERLAYS must be 0 or 1"; exit 2 ;;
esac
case "$GRADE_RUN" in
  0|1) ;;
  *) echo "GRADE_RUN must be 0 or 1"; exit 2 ;;
esac
case "$PRESS_MODE" in
  swipe|tap|async-swipe|fast-swipe) ;;
  *) echo "PRESS_MODE must be swipe, tap, async-swipe, or fast-swipe"; exit 2 ;;
esac
for setting in WATCHDOG_INTERVAL WATCHDOG_CAPTURE_TIMEOUT FOCUS_WATCHDOG_INTERVAL; do
  setting_value="${!setting}"
  case "$setting_value" in
    ''|*[!0-9.]*) echo "$setting must be a positive number"; exit 2 ;;
  esac
  awk -v n="$setting_value" 'BEGIN {
    exit !(n ~ /^([0-9]+([.][0-9]+)?|[.][0-9]+)$/ && n + 0 > 0)
  }' || {
    echo "$setting must be a positive number"
    exit 2
  }
done
mkdir -p "$CAPTURE_DIR"
[ ! -e "$LOCAL_VIDEO" ] || { echo "refusing to overwrite $LOCAL_VIDEO"; exit 2; }
[ ! -e "$LOCAL_ABORT_VIDEO" ] || { echo "refusing to overwrite $LOCAL_ABORT_VIDEO"; exit 2; }
RUN_TMP="$(mktemp -d "${TMPDIR:-/tmp}/fnaf2-minus7.XXXXXX")"
WATCHDOG_RESULT="$RUN_TMP/watchdog-result"

state_once() {
  local result
  if result=$(python3 "$HERE/screenstate.py" \
    --adb-fast "$WATCHDOG_CAPTURE_TIMEOUT" 2>/dev/null); then
    printf '%s\n' "$result"
  else
    printf '%s\n' "unavailable"
  fi
}

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

stop_remote_driver() {
  local local_pid
  # The remote parent records its exact PID. Kill its direct input-swipe
  # children first, then the parent; never use a device-wide `pkill input`.
  adb shell "pidfile=$REMOTE_PIDFILE; if [ -f \"\$pidfile\" ]; then pid=\$(cat \"\$pidfile\" 2>/dev/null); case \"\$pid\" in ''|*[!0-9]*) ;; *) children=\$(cat /proc/\$pid/task/\$pid/children 2>/dev/null || true); [ -z \"\$children\" ] || kill -TERM \$children 2>/dev/null || true; kill -TERM \$pid 2>/dev/null || true ;; esac; rm -f \"\$pidfile\"; fi" >/dev/null 2>&1 || true
  local_pid="$DRIVER_PID"
  if [ -n "$local_pid" ] && kill -0 "$local_pid" 2>/dev/null; then
    kill -TERM "$local_pid" 2>/dev/null || true
    wait "$local_pid" 2>/dev/null || true
  fi
}

stop_watchdogs() {
  local local_pid
  for local_pid in "$WATCHDOG_PID" "$FOCUS_WATCHDOG_PID"; do
    if [ -n "$local_pid" ] && kill -0 "$local_pid" 2>/dev/null; then
      kill -TERM "$local_pid" 2>/dev/null || true
      wait "$local_pid" 2>/dev/null || true
    fi
  done
  WATCHDOG_PID=""
  FOCUS_WATCHDOG_PID=""
}

stop_recording() {
  [ -n "$REC" ] || return 0
  adb shell pkill -INT screenrecord 2>/dev/null || true
  wait "$REC" 2>/dev/null || true
  REC=""
}

watch_night() {
  local misses=0 screen_state
  while kill -0 "$DRIVER_PID" 2>/dev/null; do
    sleep "$WATCHDOG_INTERVAL"
    screen_state=$(state_once)
    case "$screen_state" in
      night)
        misses=0
        ;;
      *)
        misses=$((misses + 1))
        printf 'watchdog: %s (%d/3)\n' "$screen_state" "$misses"
        ;;
    esac
    if [ "$misses" -ge 3 ]; then
      printf 'abort: game left night state (%s)\n' "$screen_state" > "$WATCHDOG_RESULT"
      stop_remote_driver
      return 0
    fi
  done
}

watch_focus() {
  local focus
  while kill -0 "$DRIVER_PID" 2>/dev/null; do
    sleep "$FOCUS_WATCHDOG_INTERVAL"
    focus=$(adb shell dumpsys window 2>/dev/null |
      grep -m1 mCurrentFocus || true)
    case "$focus" in
      *com.scottgames.fnaf2*) ;;
      *)
        printf 'focus watchdog: game not focused\n'
        if [ ! -s "$WATCHDOG_RESULT" ]; then
          printf 'abort: game lost focus (%s)\n' "$focus" > "$WATCHDOG_RESULT"
        fi
        stop_remote_driver
        return 0
        ;;
    esac
  done
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  set +e
  stop_watchdogs
  stop_remote_driver
  stop_recording
  if [ "$status" -ne 0 ] && [ "$RECORDING_STARTED" -eq 1 ] && [ "$CAPTURE_PULLED" -eq 0 ]; then
    sleep 1
    if adb pull "$REMOTE_VIDEO" "$LOCAL_ABORT_VIDEO" >/dev/null 2>&1; then
      echo "saved partial capture captures/$OUT-aborted.mp4"
    fi
  fi
  adb shell rm -f "$REMOTE_VIDEO" "$REMOTE_PIDFILE" >/dev/null 2>&1 || true
  if [ "$GAME_LAUNCHED" -eq 1 ]; then
    adb shell am force-stop com.scottgames.fnaf2 >/dev/null 2>&1 || true
  fi
  rm -f "$WATCHDOG_RESULT"
  rmdir "$RUN_TMP" 2>/dev/null || true
  exit "$status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

adb get-state >/dev/null
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard >/dev/null 2>&1 || true
sleep 1
adb shell cmd statusbar collapse >/dev/null 2>&1 || true
adb shell settings put system show_touches "$DEBUG_OVERLAYS"
adb shell settings put system pointer_location "$DEBUG_OVERLAYS"
adb shell am force-stop com.scottgames.fnaf2
sleep 1
adb shell am start -n com.scottgames.fnaf2/.Main >/dev/null
GAME_LAUNCHED=1
sleep 7
FOCUS=$(adb shell dumpsys window 2>/dev/null | grep -m1 mCurrentFocus || true)
case "$FOCUS" in
  *com.scottgames.fnaf2*) ;;
  *) echo "abort: game is not focused ($FOCUS)"; exit 1 ;;
esac

source "$HERE/coords.sh"
NIGHT_TAP=$TAP_CONTINUE
[ "$NIGHT" = "6th" ] && NIGHT_TAP=$TAP_6TH
adb shell input swipe $NIGHT_TAP $NIGHT_TAP 120

# Loading is variable. The timed strategy begins only after the office HUD is
# visible. Later screenshots belong only to the stop-on-exit safety watchdog;
# they never choose or retime a strategy action.
for i in $(seq 1 40); do
  [ "$(state)" = "night" ] && break
  sleep 1
  [ "$i" = 40 ] && { echo "abort: $NIGHT night never started"; exit 1; }
done
echo "$NIGHT night detected; starting timed Minus 7 interaction loop + $CYCLES cycles ($PRESS_MODE presses)"

MAXDUR=$((25 + CYCLES * 5))
adb shell "screenrecord --size 1280x576 --bit-rate 3000000 --time-limit $MAXDUR $REMOTE_VIDEO" &
REC=$!
RECORDING_STARTED=1

# Positional coordinates keep this remote program literal and auditable.
adb shell sh -s -- "$REMOTE_PIDFILE" "$CYCLES" "$PRESS_MODE" \
  $TAP_MUTE $TAP_MONITOR $TAP_MASK $TAP_CAM_LIGHT $TAP_HALL $WIND \
  $TAP_CAM10 $TAP_CAM04 $TAP_CAM07 $TAP_CAM11 <<'REMOTE' &
set -eu
PIDFILE=$1; shift
CYCLES=$1; shift
PRESS_MODE=$1; shift
MUTE_X=$1; MUTE_Y=$2; shift 2
MONITOR_X=$1; MONITOR_Y=$2; shift 2
MASK_X=$1; MASK_Y=$2; shift 2
CAM_LIGHT_X=$1; CAM_LIGHT_Y=$2; shift 2
HALL_X=$1; HALL_Y=$2; shift 2
WIND_X=$1; WIND_Y=$2; shift 2
CAM10_X=$1; CAM10_Y=$2; shift 2
CAM04_X=$1; CAM04_Y=$2; shift 2
CAM07_X=$1; CAM07_Y=$2; shift 2
CAM11_X=$1; CAM11_Y=$2

printf '%s\n' "$$" > "$PIDFILE"
cleanup_remote() {
  children=$(cat "/proc/$$/task/$$/children" 2>/dev/null || true)
  [ -z "$children" ] || kill -TERM $children 2>/dev/null || true
  rm -f "$PIDFILE"
}
trap cleanup_remote EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

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
  elif [ "$PRESS_MODE" = "fast-swipe" ]; then
    # Sixty milliseconds crosses at least one 30 Hz Fusion update with margin.
    # Keep this synchronous: the helper finishes in about 170 ms on this
    # device, leaving roughly 20 ms before the next 190 ms slot and making a
    # late action delay the next one instead of overlapping it.
    input swipe "$x" "$y" "$x" "$y" 60
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

# Calibration opening: the box begins full, so wait for real drain
# instead of holding the wind button immediately. The first camera sweep ends
# just before a short top-up and the first seven-second cycle anchor.
press_at     0 "$MUTE_X"    "$MUTE_Y"    mute
press_at   180 "$MONITOR_X" "$MONITOR_Y" monitor-up
press_at   460 "$CAM11_X"   "$CAM11_Y"   cam-11
if [ "$PRESS_MODE" = "fast-swipe" ]; then
  press_at 4000 "$CAM10_X" "$CAM10_Y" cam-10
  press_at 4190 "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-10
  press_at 4380 "$CAM04_X" "$CAM04_Y" cam-04
  press_at 4570 "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-04
  press_at 4760 "$CAM07_X" "$CAM07_Y" cam-07
  press_at 4950 "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-07
  press_at 5140 "$CAM11_X" "$CAM11_Y" cam-11
  hold_at  5330 "$WIND_X"  "$WIND_Y"  1250 wind-to-anchor
else
  press_at 4000 "$CAM10_X" "$CAM10_Y" cam-10
  press_at 4230 "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-10
  press_at 4460 "$CAM04_X" "$CAM04_Y" cam-04
  press_at 4690 "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-04
  press_at 4920 "$CAM07_X" "$CAM07_Y" cam-07
  press_at 5150 "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-07
  press_at 5380 "$CAM11_X" "$CAM11_Y" cam-11
  hold_at  5620 "$WIND_X"  "$WIND_Y"  1250 wind-to-anchor
fi

cycle=0
while [ "$cycle" -lt "$CYCLES" ]; do
  base=$((7000 + cycle * 5000))
  press_at $((base +    0)) "$MONITOR_X" "$MONITOR_Y" monitor-down
  if [ "$PRESS_MODE" = "fast-swipe" ]; then
    # The monitor-down animation needs more room than a normal press. From
    # CAM 10 onward, 60 ms presses launch every 190 ms: the full sweep takes
    # 1.14 s instead of 1.38 s. A 1.4 s hold nearly balances one five-second
    # cycle at the sourced Night-6/7 drain and wind rates.
    press_at $((base +  450)) "$MASK_X"    "$MASK_Y"    mask-on
    press_at $((base +  800)) "$MASK_X"    "$MASK_Y"    mask-off
    # The hall light is a held actuator: a 60 ms camera-style swipe reaches
    # the control but produces no visible beam. One attempt can also coincide
    # with a transient in-game light lockout, so use two attempts across the
    # office window. Their 350 ms worst-case light cost plus three 60 ms camera
    # pulses is 106 ms/s, under the sourced 119 ms/s budget. CAM 10 waits a full
    # 500 ms after monitor-up; shorter gaps were swallowed by the flip animation.
    hold_at  $((base +  950)) "$HALL_X"    "$HALL_Y"    200 flash-hall-1
    hold_at  $((base + 1300)) "$HALL_X"    "$HALL_Y"    150 flash-hall-2
    press_at $((base + 1550)) "$MONITOR_X" "$MONITOR_Y" monitor-up
    press_at $((base + 2050)) "$CAM10_X"   "$CAM10_Y"   cam-10
    press_at $((base + 2240)) "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-10
    press_at $((base + 2430)) "$CAM04_X"   "$CAM04_Y"   cam-04
    press_at $((base + 2620)) "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-04
    press_at $((base + 2810)) "$CAM07_X"   "$CAM07_Y"   cam-07
    press_at $((base + 3000)) "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-07
    press_at $((base + 3190)) "$CAM11_X"   "$CAM11_Y"   cam-11
    hold_at  $((base + 3380)) "$WIND_X"    "$WIND_Y"    1400 wind
  else
    press_at $((base +  320)) "$MASK_X"    "$MASK_Y"    mask-on
    press_at $((base +  700)) "$MASK_X"    "$MASK_Y"    mask-off
    hold_at  $((base + 1300)) "$HALL_X"    "$HALL_Y"    300 flash-hall
    press_at $((base + 1700)) "$MONITOR_X" "$MONITOR_Y" monitor-up
    # Stock `adb shell input` cannot express a two-thumb hold-light-and-tap
    # gesture. Separate 120 ms presses are reliable; 230 ms launch spacing is
    # the shortest non-overlapping cadence supported by the calibration runs.
    press_at $((base + 1950)) "$CAM10_X"   "$CAM10_Y"   cam-10
    press_at $((base + 2180)) "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-10
    press_at $((base + 2410)) "$CAM04_X"   "$CAM04_Y"   cam-04
    press_at $((base + 2640)) "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-04
    press_at $((base + 2870)) "$CAM07_X"   "$CAM07_Y"   cam-07
    press_at $((base + 3100)) "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-07
    press_at $((base + 3330)) "$CAM11_X"   "$CAM11_Y"   cam-11
    hold_at  $((base + 3570)) "$WIND_X"    "$WIND_Y"    1330 wind
  fi
  cycle=$((cycle + 1))
done
wait
REMOTE
DRIVER_PID=$!
watch_night &
WATCHDOG_PID=$!
watch_focus &
FOCUS_WATCHDOG_PID=$!

set +e
wait "$DRIVER_PID"
DRIVER_STATUS=$?
set -e
DRIVER_PID=""
stop_watchdogs
if [ -s "$WATCHDOG_RESULT" ]; then
  cat "$WATCHDOG_RESULT"
  exit 1
fi
if [ "$DRIVER_STATUS" -ne 0 ]; then
  echo "abort: timed input driver exited with status $DRIVER_STATUS"
  exit "$DRIVER_STATUS"
fi

stop_recording
sleep 2
adb pull "$REMOTE_VIDEO" "$LOCAL_VIDEO" >/dev/null
CAPTURE_PULLED=1
adb shell rm -f "$REMOTE_VIDEO"
echo "saved captures/$OUT.mp4"
if [ "$GRADE_RUN" = 1 ]; then
  python3 "$HERE/grade-minus7.py" "$LOCAL_VIDEO"
  python3 "$HERE/camtrace.py" --expected "$((CYCLES + 1))" "$LOCAL_VIDEO"
  python3 "$HERE/windpct.py" "$LOCAL_VIDEO"
fi
