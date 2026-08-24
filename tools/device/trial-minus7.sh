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
BB_CAM05_CAPTURE_EVERY="${BB_CAM05_CAPTURE_EVERY:-0}"
BB_CAM05_CAPTURE_START="${BB_CAM05_CAPTURE_START:-0}"
BB_LEFT_CAPTURE_EVERY="${BB_LEFT_CAPTURE_EVERY:-0}"
BB_LEFT_CAPTURE_START="${BB_LEFT_CAPTURE_START:-0}"
CALIBRATION_INPUT_DEBUG="${CALIBRATION_INPUT_DEBUG:-0}"
BB_LEFT_MODEL="${BB_LEFT_MODEL:-}"
GF_OFFICE_MODEL="${GF_OFFICE_MODEL:-}"
GF_SKIP_MASK_ON_EXACT_EMPTY="${GF_SKIP_MASK_ON_EXACT_EMPTY:-0}"
HERE="$(cd "$(dirname "$0")" && pwd)"
CAPTURE_DIR="$HERE/../../captures"
LOCAL_VIDEO="$CAPTURE_DIR/$OUT.mp4"
LOCAL_ABORT_VIDEO="$CAPTURE_DIR/$OUT-aborted.mp4"
SAMPLE_VIEW=""
SAMPLE_BUCKET="unlabeled"
LOCAL_SAMPLE_DIR=""
REMOTE_VIDEO="/sdcard/$OUT.mp4"
REMOTE_PIDFILE="/data/local/tmp/fnaf2-minus7-$$-$(date +%s).pid"
REMOTE_SAMPLE_DIR="/data/local/tmp/fnaf2-screen-calibration-$$-$(date +%s)"
REMOTE_CHECKER="/data/local/tmp/fnaf2-screencheck-$$-$(date +%s)"
REMOTE_BB_MODEL="/data/local/tmp/fnaf2-bb-left-model-$$-$(date +%s).scm"
REMOTE_GF_MODEL="/data/local/tmp/fnaf2-gf-office-model-$$-$(date +%s).scm"
REMOTE_CHECKER_ARG="-"
REMOTE_BB_MODEL_ARG="-"
REMOTE_GF_MODEL_ARG="-"
RUN_TMP=""
WATCHDOG_RESULT=""
REC=""
DRIVER_PID=""
WATCHDOG_PID=""
FOCUS_WATCHDOG_PID=""
GAME_LAUNCHED=0
RECORDING_STARTED=0
CAPTURE_PULLED=0
SAMPLES_PULLED=0
CHECKER_INSTALLED=0

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
case "$CALIBRATION_INPUT_DEBUG" in
  0|1) ;;
  *) echo "CALIBRATION_INPUT_DEBUG must be 0 or 1"; exit 2 ;;
esac
case "$GRADE_RUN" in
  0|1) ;;
  *) echo "GRADE_RUN must be 0 or 1"; exit 2 ;;
esac
case "$GF_SKIP_MASK_ON_EXACT_EMPTY" in
  0|1) ;;
  *) echo "GF_SKIP_MASK_ON_EXACT_EMPTY must be 0 or 1"; exit 2 ;;
esac
case "$PRESS_MODE" in
  swipe|tap|async-swipe|fast-swipe) ;;
  *) echo "PRESS_MODE must be swipe, tap, async-swipe, or fast-swipe"; exit 2 ;;
esac
for setting in BB_CAM05_CAPTURE_EVERY BB_CAM05_CAPTURE_START BB_LEFT_CAPTURE_EVERY BB_LEFT_CAPTURE_START; do
  setting_value="${!setting}"
  case "$setting_value" in
    ''|*[!0-9]*) echo "$setting must be a non-negative integer"; exit 2 ;;
  esac
done
if [ "$BB_CAM05_CAPTURE_EVERY" -gt 0 ] && [ "$BB_LEFT_CAPTURE_EVERY" -gt 0 ]; then
  echo "enable only one calibration view at a time" >&2
  exit 2
fi
if [ "$BB_CAM05_CAPTURE_EVERY" -gt 0 ]; then
  SAMPLE_VIEW="bb-cam05"
  [ "$BB_CAM05_CAPTURE_START" -lt "$CYCLES" ] || {
    echo "BB_CAM05_CAPTURE_START must be smaller than cycles" >&2
    exit 2
  }
fi
if [ "$BB_LEFT_CAPTURE_EVERY" -gt 0 ]; then
  SAMPLE_VIEW="bb-left"
  [ "$BB_LEFT_CAPTURE_START" -lt "$CYCLES" ] || {
    echo "BB_LEFT_CAPTURE_START must be smaller than cycles" >&2
    exit 2
  }
fi
if [ -n "$SAMPLE_VIEW" ]; then
  if [ "$CALIBRATION_INPUT_DEBUG" -eq 1 ]; then
    [ "$DEBUG_OVERLAYS" = "1" ] || {
      echo "CALIBRATION_INPUT_DEBUG=1 requires DEBUG_OVERLAYS=1" >&2
      exit 2
    }
    SAMPLE_BUCKET="debug-overlay"
  else
    [ "$DEBUG_OVERLAYS" = "0" ] || {
      echo "$SAMPLE_VIEW clean capture requires DEBUG_OVERLAYS=0" >&2
      exit 2
    }
  fi
  LOCAL_SAMPLE_DIR="$CAPTURE_DIR/screencheck/$SAMPLE_VIEW/$SAMPLE_BUCKET/$OUT"
  [ "$PRESS_MODE" = "fast-swipe" ] || {
    echo "$SAMPLE_VIEW capture is calibrated only for PRESS_MODE=fast-swipe"
    exit 2
  }
  [ ! -e "$LOCAL_SAMPLE_DIR" ] || {
    echo "refusing to overwrite $LOCAL_SAMPLE_DIR"
    exit 2
  }
fi
if [ -n "$BB_LEFT_MODEL" ]; then
  [ "$BB_LEFT_CAPTURE_EVERY" -gt 0 ] || {
    echo "BB_LEFT_MODEL requires BB_LEFT_CAPTURE_EVERY > 0" >&2
    exit 2
  }
  [ "$CALIBRATION_INPUT_DEBUG" -eq 0 ] || {
    echo "BB_LEFT_MODEL requires clean capture without input-debug overlays" >&2
    exit 2
  }
  [ -f "$BB_LEFT_MODEL" ] || {
    echo "BB_LEFT_MODEL does not exist: $BB_LEFT_MODEL" >&2
    exit 2
  }
fi
if [ -n "$GF_OFFICE_MODEL" ]; then
  [ "$BB_LEFT_CAPTURE_EVERY" -gt 0 ] || {
    echo "GF_OFFICE_MODEL requires BB_LEFT_CAPTURE_EVERY > 0" >&2
    exit 2
  }
  [ "$CALIBRATION_INPUT_DEBUG" -eq 0 ] || {
    echo "GF_OFFICE_MODEL requires clean capture without input-debug overlays" >&2
    exit 2
  }
  [ -f "$GF_OFFICE_MODEL" ] || {
    echo "GF_OFFICE_MODEL does not exist: $GF_OFFICE_MODEL" >&2
    exit 2
  }
fi
if [ "$GF_SKIP_MASK_ON_EXACT_EMPTY" -eq 1 ] && [ -z "$GF_OFFICE_MODEL" ]; then
  echo "GF_SKIP_MASK_ON_EXACT_EMPTY=1 requires GF_OFFICE_MODEL" >&2
  exit 2
fi
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
. "$HERE/select-adb.sh"
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

pull_samples() {
  [ -n "$SAMPLE_VIEW" ] || return 0
  [ "$SAMPLES_PULLED" -eq 0 ] || return 0
  if ! adb shell "[ -d '$REMOTE_SAMPLE_DIR' ]" >/dev/null 2>&1; then
    echo "no $SAMPLE_VIEW sample directory was created on-device" >&2
    return 1
  fi
  mkdir -p "$LOCAL_SAMPLE_DIR"
  if ! adb pull "$REMOTE_SAMPLE_DIR/." "$LOCAL_SAMPLE_DIR/" >/dev/null; then
    echo "could not pull $SAMPLE_VIEW samples; retained $REMOTE_SAMPLE_DIR on-device" >&2
    return 1
  fi
  local count
  count=$(find "$LOCAL_SAMPLE_DIR" -maxdepth 1 -type f -name '*.raw' | wc -l | tr -d ' ')
  if [ "$count" -eq 0 ]; then
    echo "$SAMPLE_VIEW capture produced no raw frames" >&2
    return 1
  fi
  SAMPLES_PULLED=1
  echo "saved $count $SAMPLE_BUCKET $SAMPLE_VIEW frames under captures/screencheck/$SAMPLE_VIEW/$SAMPLE_BUCKET/$OUT"
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
      # Stop the game before any recording/sample transfer. A queued office
      # attack can finish during those comparatively slow host operations.
      adb shell am force-stop com.scottgames.fnaf2 >/dev/null 2>&1 || true
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
        adb shell am force-stop com.scottgames.fnaf2 >/dev/null 2>&1 || true
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
  if [ "$GAME_LAUNCHED" -eq 1 ]; then
    # Make the safety stop the first device-side cleanup action. In particular,
    # do not leave a BB-disabled office alive while pulling a large recording.
    adb shell am force-stop com.scottgames.fnaf2 >/dev/null 2>&1 || true
    GAME_LAUNCHED=0
  fi
  stop_recording
  pull_samples || true
  if [ "$status" -ne 0 ] && [ "$RECORDING_STARTED" -eq 1 ] && [ "$CAPTURE_PULLED" -eq 0 ]; then
    sleep 1
    if adb pull "$REMOTE_VIDEO" "$LOCAL_ABORT_VIDEO" >/dev/null 2>&1; then
      echo "saved partial capture captures/$OUT-aborted.mp4"
    fi
  fi
  adb shell rm -f "$REMOTE_VIDEO" "$REMOTE_PIDFILE" >/dev/null 2>&1 || true
  if [ "$CHECKER_INSTALLED" -eq 1 ]; then
    adb shell rm -f "$REMOTE_CHECKER" "$REMOTE_BB_MODEL" "$REMOTE_GF_MODEL" >/dev/null 2>&1 || true
  fi
  if [ "$SAMPLES_PULLED" -eq 1 ]; then
    adb shell "rm -rf '$REMOTE_SAMPLE_DIR'" >/dev/null 2>&1 || true
  elif [ -n "$SAMPLE_VIEW" ]; then
    echo "$SAMPLE_VIEW samples, if any, remain at $REMOTE_SAMPLE_DIR on-device" >&2
  fi
  rm -f "$WATCHDOG_RESULT"
  rmdir "$RUN_TMP" 2>/dev/null || true
  exit "$status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

adb get-state >/dev/null
if [ -n "$BB_LEFT_MODEL$GF_OFFICE_MODEL" ]; then
  CHECKER_INSTALLED=1
  "$HERE/build-screencheck.sh" "$RUN_TMP/fnaf-screencheck" >/dev/null
  adb push "$RUN_TMP/fnaf-screencheck" "$REMOTE_CHECKER" >/dev/null
  adb shell chmod 755 "$REMOTE_CHECKER"
  REMOTE_CHECKER_ARG=$REMOTE_CHECKER
fi
if [ -n "$BB_LEFT_MODEL" ]; then
  adb push "$BB_LEFT_MODEL" "$REMOTE_BB_MODEL" >/dev/null
  REMOTE_BB_MODEL_ARG=$REMOTE_BB_MODEL
fi
if [ -n "$GF_OFFICE_MODEL" ]; then
  adb push "$GF_OFFICE_MODEL" "$REMOTE_GF_MODEL" >/dev/null
  REMOTE_GF_MODEL_ARG=$REMOTE_GF_MODEL
fi
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

# A left-opening calibration cycle spends about 1.5 seconds on the lit raw
# capture. Give each sampled cycle that time back so its box wind is not
# silently cut in half. The resulting 6.5 s camera interval remains below the
# sourced 6.67 s stun.
LEFT_SAMPLE_COUNT=0
if [ "$BB_LEFT_CAPTURE_EVERY" -gt 0 ]; then
  LEFT_SAMPLE_COUNT=$(((CYCLES - 1 - BB_LEFT_CAPTURE_START) / BB_LEFT_CAPTURE_EVERY + 1))
fi
MAXDUR_MS=$((25000 + CYCLES * 5000 + LEFT_SAMPLE_COUNT * 1500))
MAXDUR=$(((MAXDUR_MS + 999) / 1000))
# Android's screenrecord rejects limits above 180 s. Raw calibration capture is
# independent of screenrecord, so cap only the diagnostic video.
[ "$MAXDUR" -le 180 ] || MAXDUR=180
adb shell "screenrecord --size 1280x576 --bit-rate 3000000 --time-limit $MAXDUR $REMOTE_VIDEO" &
REC=$!
RECORDING_STARTED=1

# Positional coordinates keep this remote program literal and auditable.
adb shell sh -s -- "$REMOTE_PIDFILE" "$CYCLES" "$PRESS_MODE" \
  "$BB_CAM05_CAPTURE_EVERY" "$BB_CAM05_CAPTURE_START" \
  "$BB_LEFT_CAPTURE_EVERY" "$BB_LEFT_CAPTURE_START" "$REMOTE_SAMPLE_DIR" \
  "$REMOTE_CHECKER_ARG" "$REMOTE_BB_MODEL_ARG" "$REMOTE_GF_MODEL_ARG" \
  "$GF_SKIP_MASK_ON_EXACT_EMPTY" \
  $TAP_MUTE $TAP_MONITOR $TAP_MASK $TAP_CAM_LIGHT $TAP_HALL $WIND \
  $TAP_CAM10 $TAP_CAM04 $TAP_CAM07 $TAP_CAM11 $TAP_CAM05 <<'REMOTE' &
set -eu
PIDFILE=$1; shift
CYCLES=$1; shift
PRESS_MODE=$1; shift
BB_CAM05_CAPTURE_EVERY=$1; shift
BB_CAM05_CAPTURE_START=$1; shift
BB_LEFT_CAPTURE_EVERY=$1; shift
BB_LEFT_CAPTURE_START=$1; shift
SAMPLE_DIR=$1; shift
CHECKER=${1:--}; shift
BB_MODEL=${1:--}; shift
GF_MODEL=${1:--}; shift
GF_SKIP_MASK_ON_EXACT_EMPTY=$1; shift
MUTE_X=$1; MUTE_Y=$2; shift 2
MONITOR_X=$1; MONITOR_Y=$2; shift 2
MASK_X=$1; MASK_Y=$2; shift 2
CAM_LIGHT_X=$1; CAM_LIGHT_Y=$2; shift 2
HALL_X=$1; HALL_Y=$2; shift 2
WIND_X=$1; WIND_Y=$2; shift 2
CAM10_X=$1; CAM10_Y=$2; shift 2
CAM04_X=$1; CAM04_Y=$2; shift 2
CAM07_X=$1; CAM07_Y=$2; shift 2
CAM11_X=$1; CAM11_Y=$2; shift 2
CAM05_X=$1; CAM05_Y=$2

if [ "$BB_CAM05_CAPTURE_EVERY" -gt 0 ] || [ "$BB_LEFT_CAPTURE_EVERY" -gt 0 ]; then
  mkdir -p "$SAMPLE_DIR"
fi

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

capture_lit_at() {
  offset=$1; name=$2; label=$3
  wait_until "$offset"
  actual=$(( $(date +%s%3N) - T0 ))
  printf '%6d ms  capture-%s %s\n' "$actual" "$label" "$name"
  # Keep the view light down across the screencap without putting a host round
  # trip between the actuator and frame. The game needs about 350 ms to draw a
  # visibly lit office vent; the measured raw capture p95 is another 206 ms.
  # A 600 ms hold still covers the 350 ms draw delay plus the measured 206 ms
  # raw-capture p95, without needlessly delaying the classifier and mask.
  input swipe "$CAM_LIGHT_X" "$CAM_LIGHT_Y" "$CAM_LIGHT_X" "$CAM_LIGHT_Y" 600 >/dev/null 2>&1 &
  light_pid=$!
  sleep 0.35
  screencap > "$SAMPLE_DIR/$name.raw"
  wait "$light_pid"
}

# Calibration opening: the box begins full, so wait for real drain
# instead of holding the wind button immediately. The first camera sweep ends
# just before a short top-up and the first seven-second cycle anchor.
press_at     0 "$MUTE_X"    "$MUTE_Y"    mute
press_at   180 "$MONITOR_X" "$MONITOR_Y" monitor-up
press_at   460 "$CAM11_X"   "$CAM11_Y"   cam-11
if [ "$PRESS_MODE" = "fast-swipe" ]; then
  if [ "$BB_LEFT_CAPTURE_EVERY" -gt 0 ]; then
    # The calibration cycle cannot reach its normal wind before the opening
    # box would empty. Bank two winds here while preserving a 10/04/07 sweep
    # late enough that the first sampled interval stays below 6.67 seconds.
    # The 460 ms CAM 11 press is too close to the monitor animation on some
    # starts; waiting until 900 ms makes the prewind a real Prize Corner hold.
    press_at  900 "$CAM11_X" "$CAM11_Y" cam-11-for-prewind
    hold_at  1200 "$WIND_X"  "$WIND_Y"  1700 prewind-for-left-capture
    press_at 3650 "$CAM10_X" "$CAM10_Y" cam-10
    press_at 3840 "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-10
    press_at 4030 "$CAM04_X" "$CAM04_Y" cam-04
    press_at 4220 "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-04
    press_at 4410 "$CAM07_X" "$CAM07_Y" cam-07
    press_at 4600 "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-07
    press_at 4790 "$CAM11_X" "$CAM11_Y" cam-11
    hold_at  4980 "$WIND_X"  "$WIND_Y"  1800 wind-to-anchor
  else
    press_at 4000 "$CAM10_X" "$CAM10_Y" cam-10
    press_at 4190 "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-10
    press_at 4380 "$CAM04_X" "$CAM04_Y" cam-04
    press_at 4570 "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-04
    press_at 4760 "$CAM07_X" "$CAM07_Y" cam-07
    press_at 4950 "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-07
    press_at 5140 "$CAM11_X" "$CAM11_Y" cam-11
    hold_at  5330 "$WIND_X"  "$WIND_Y"  1250 wind-to-anchor
  fi
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
  if [ "$BB_LEFT_CAPTURE_EVERY" -gt 0 ] &&
     [ "$cycle" -gt "$BB_LEFT_CAPTURE_START" ]; then
    prior_left_samples=$(((cycle - 1 - BB_LEFT_CAPTURE_START) / BB_LEFT_CAPTURE_EVERY + 1))
    base=$((base + prior_left_samples * 1500))
  fi
  press_at $((base +    0)) "$MONITOR_X" "$MONITOR_Y" monitor-down
  if [ "$PRESS_MODE" = "fast-swipe" ]; then
    # The monitor-down animation needs more room than a normal press. From
    # CAM 10 onward, 60 ms presses launch every 190 ms: the full sweep takes
    # 1.14 s instead of 1.38 s. A 1.4 s hold nearly balances one five-second
    # cycle at the sourced Night-6/7 drain and wind rates.
    if [ "$BB_LEFT_CAPTURE_EVERY" -gt 0 ] &&
       [ "$cycle" -ge "$BB_LEFT_CAPTURE_START" ] &&
       [ $(((cycle - BB_LEFT_CAPTURE_START) % BB_LEFT_CAPTURE_EVERY)) -eq 0 ]; then
      sample=$(printf 'cycle-%03d' "$cycle")
      # The left vent light is safe while Golden Freddy occupies the office;
      # the hall light is not. Capture and classify both regions from this one
      # frame before deciding whether the normal mask-then-hall sequence is safe.
      capture_lit_at $((base +  600)) "$sample" bb-left
      threat=0
      gf_exact_empty=0
      if [ "$BB_MODEL" != "-" ]; then
        classification=$("$CHECKER" classify "$BB_MODEL" < "$SAMPLE_DIR/$sample.raw")
        printf '%6d ms  classify-bb-left %s\n' \
          "$(( $(date +%s%3N) - T0 ))" "$classification"
        case "$classification" in
          empty\ *) ;;
          *) threat=1 ;;
        esac
      fi
      if [ "$GF_MODEL" != "-" ]; then
        classification=$("$CHECKER" classify "$GF_MODEL" < "$SAMPLE_DIR/$sample.raw")
        printf '%6d ms  classify-gf-office %s\n' \
          "$(( $(date +%s%3N) - T0 ))" "$classification"
        case "$classification" in
          empty\ score=0\ *) gf_exact_empty=1 ;;
          empty\ *) ;;
          *) threat=1 ;;
        esac
      fi
      if [ "$threat" -eq 1 ]; then
        # Only two confidently empty reads may continue. Mask immediately on
        # BB, Golden Freddy, another class, unknown, or malformed output, then
        # stop before the lethal hall press and before slow host transfers.
        press_at $((base + 1450)) "$MASK_X" "$MASK_Y" mask-on-threat
        exit 42
      fi
      if [ "$GF_SKIP_MASK_ON_EXACT_EMPTY" -eq 1 ] &&
         [ "$gf_exact_empty" -eq 1 ]; then
        # Experimental collection path: the strict exact-empty GF result is
        # the only state allowed to omit the blind mask. This recovers enough
        # CAM 11 time to keep the box healthy while retaining fail-closed
        # behavior for every nonzero, unknown, Golden, or malformed result.
        printf '%6d ms  skip-gf-mask exact-empty\n' \
          "$(( $(date +%s%3N) - T0 ))"
        # Hall-movement darkness is visual only: g489 still asserts the
        # logical hall-light latch and g745/g855 still reset and pin Foxy.
        # Retrying merely because no beam was rendered wastes power.
        hold_at  $((base + 1600)) "$HALL_X"    "$HALL_Y"    200 flash-hall
        press_at $((base + 2500)) "$MONITOR_X" "$MONITOR_Y" monitor-up
        press_at $((base + 3000)) "$CAM10_X"   "$CAM10_Y"   cam-10
        press_at $((base + 3190)) "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-10
        press_at $((base + 3380)) "$CAM04_X"   "$CAM04_Y"   cam-04
        press_at $((base + 3570)) "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-04
        press_at $((base + 3760)) "$CAM07_X"   "$CAM07_Y"   cam-07
        press_at $((base + 3950)) "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-07
        press_at $((base + 4140)) "$CAM11_X"   "$CAM11_Y"   cam-11
        hold_at  $((base + 4330)) "$WIND_X"    "$WIND_Y"   2000 wind-after-exact-empty
        cycle=$((cycle + 1))
        continue
      fi
      press_at       $((base + 1450)) "$MASK_X"    "$MASK_Y"    mask-on
      # Classification can make mask-on late. Give the mask a fixed fully-down
      # interval, then two hall attempts after its release animation; run J's
      # earlier attempts were both swallowed on the fatal Foxy cycle.
      press_at       $((base + 2000)) "$MASK_X"    "$MASK_Y"    mask-off
      hold_at        $((base + 2500)) "$HALL_X"    "$HALL_Y"    200 flash-hall-1
      hold_at        $((base + 2850)) "$HALL_X"    "$HALL_Y"    150 flash-hall-2
      press_at       $((base + 3200)) "$MONITOR_X" "$MONITOR_Y" monitor-up
      press_at       $((base + 3700)) "$CAM10_X"   "$CAM10_Y"   cam-10
      press_at       $((base + 3890)) "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-10
      press_at       $((base + 4080)) "$CAM04_X"   "$CAM04_Y"   cam-04
      press_at       $((base + 4270)) "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-04
      press_at       $((base + 4460)) "$CAM07_X"   "$CAM07_Y"   cam-07
      press_at       $((base + 4650)) "$CAM_LIGHT_X" "$CAM_LIGHT_Y" light-07
      press_at       $((base + 4840)) "$CAM11_X"   "$CAM11_Y"   cam-11
      hold_at        $((base + 5030)) "$WIND_X"    "$WIND_Y"   1300 wind-after-capture
      cycle=$((cycle + 1))
      continue
    fi
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
    if [ "$BB_CAM05_CAPTURE_EVERY" -gt 0 ] &&
       [ "$cycle" -ge "$BB_CAM05_CAPTURE_START" ] &&
       [ $(((cycle - BB_CAM05_CAPTURE_START) % BB_CAM05_CAPTURE_EVERY)) -eq 0 ]; then
      sample=$(printf 'cycle-%03d' "$cycle")
      press_at $((base + 3190)) "$CAM05_X" "$CAM05_Y" cam-05-calibration
      capture_lit_at $((base + 3380)) "$sample" cam-05
      press_at $((base + 4060)) "$CAM11_X" "$CAM11_Y" cam-11
      hold_at  $((base + 4250)) "$WIND_X"  "$WIND_Y"  600 wind-after-capture
    else
      press_at $((base + 3190)) "$CAM11_X"   "$CAM11_Y"   cam-11
      hold_at  $((base + 3380)) "$WIND_X"    "$WIND_Y"    1400 wind
    fi
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

# A completed short run can still die while a large capture crosses a slow
# wireless link. Stop gameplay before every diagnostic transfer, not only on
# abort paths.
if [ "$GAME_LAUNCHED" -eq 1 ]; then
  adb shell am force-stop com.scottgames.fnaf2 >/dev/null 2>&1 || true
  GAME_LAUNCHED=0
fi
stop_recording
sleep 2
adb pull "$REMOTE_VIDEO" "$LOCAL_VIDEO" >/dev/null
CAPTURE_PULLED=1
adb shell rm -f "$REMOTE_VIDEO"
echo "saved captures/$OUT.mp4"
if [ -n "$SAMPLE_VIEW" ]; then
  pull_samples
fi
if [ "$GRADE_RUN" = 1 ]; then
  python3 "$HERE/grade-minus7.py" "$LOCAL_VIDEO"
  python3 "$HERE/camtrace.py" --expected "$((CYCLES + 1))" "$LOCAL_VIDEO"
  python3 "$HERE/windpct.py" "$LOCAL_VIDEO"
fi
