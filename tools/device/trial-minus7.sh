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
HID_LEFT_SURVIVAL="${HID_LEFT_SURVIVAL:-0}"
NIGHT6_LEFT="${NIGHT6_LEFT:-0}"
# The centre of the measured 83-267 ms scheduler-phase window.
PILOT_OFFSET_MS="${PILOT_OFFSET_MS:-175}"
HID_LEFT_DEBUG_RAW="${HID_LEFT_DEBUG_RAW:--}"
DEVICE_EPOCH_LATCH="${DEVICE_EPOCH_LATCH:-0}"
WATCHDOG_INTERVAL="${WATCHDOG_INTERVAL:-0.25}"
WATCHDOG_CAPTURE_TIMEOUT="${WATCHDOG_CAPTURE_TIMEOUT:-0.8}"
FOCUS_WATCHDOG_INTERVAL="${FOCUS_WATCHDOG_INTERVAL:-0.10}"
BB_CAM05_CAPTURE_EVERY="${BB_CAM05_CAPTURE_EVERY:-0}"
BB_CAM05_CAPTURE_START="${BB_CAM05_CAPTURE_START:-0}"
BB_CAM05_UNLIT="${BB_CAM05_UNLIT:-0}"
BB_CAM05_MODEL="${BB_CAM05_MODEL:-}"
BB_CAM05_STOP_ON_BB="${BB_CAM05_STOP_ON_BB:-0}"
BB_LEFT_CAPTURE_EVERY="${BB_LEFT_CAPTURE_EVERY:-0}"
BB_LEFT_CAPTURE_START="${BB_LEFT_CAPTURE_START:-0}"
CALIBRATION_INPUT_DEBUG="${CALIBRATION_INPUT_DEBUG:-0}"
POST_CAPTURE_TOUCHES="${POST_CAPTURE_TOUCHES:-1}"
BB_LEFT_MODEL="${BB_LEFT_MODEL:-}"
GF_OFFICE_MODEL="${GF_OFFICE_MODEL:-}"
GF_SKIP_MASK_ON_EXACT_EMPTY="${GF_SKIP_MASK_ON_EXACT_EMPTY:-0}"
HERE="$(cd "$(dirname "$0")" && pwd)"
CAPTURE_DIR="$HERE/../../captures"
LOCAL_VIDEO="$CAPTURE_DIR/$OUT.mp4"
LOCAL_ABORT_VIDEO="$CAPTURE_DIR/$OUT-aborted.mp4"
LOCAL_EPOCH="$CAPTURE_DIR/$OUT-epoch.txt"
SAMPLE_VIEW=""
SAMPLE_BUCKET="unlabeled"
LOCAL_SAMPLE_DIR=""
REMOTE_VIDEO="/sdcard/$OUT.mp4"
REMOTE_PIDFILE="/data/local/tmp/fnaf2-minus7-$$-$(date +%s).pid"
REMOTE_READYFILE="$REMOTE_PIDFILE.ready"
REMOTE_STARTFILE="$REMOTE_PIDFILE.start"
REMOTE_EPOCHFILE="$REMOTE_PIDFILE.epoch"
REMOTE_CAPTURE_LOCK="$REMOTE_PIDFILE.capture"
REMOTE_SAMPLE_DIR="/data/local/tmp/fnaf2-screen-calibration-$$-$(date +%s)"
REMOTE_CHECKER="/data/local/tmp/fnaf2-screencheck-$$-$(date +%s)"
REMOTE_BB_MODEL="/data/local/tmp/fnaf2-bb-left-model-$$-$(date +%s).scm"
REMOTE_CAM05_MODEL="/data/local/tmp/fnaf2-bb-cam05-model-$$-$(date +%s).scm"
REMOTE_GF_MODEL="/data/local/tmp/fnaf2-gf-office-model-$$-$(date +%s).scm"
REMOTE_CHECKER_ARG="-"
REMOTE_BB_MODEL_ARG="-"
REMOTE_CAM05_MODEL_ARG="-"
REMOTE_GF_MODEL_ARG="-"
POST_CAPTURE_TOUCHES_EFFECTIVE=0
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
case "$POST_CAPTURE_TOUCHES" in
  0|1) ;;
  *) echo "POST_CAPTURE_TOUCHES must be 0 or 1"; exit 2 ;;
esac
case "$GRADE_RUN" in
  0|1) ;;
  *) echo "GRADE_RUN must be 0 or 1"; exit 2 ;;
esac
case "$GF_SKIP_MASK_ON_EXACT_EMPTY" in
  0|1) ;;
  *) echo "GF_SKIP_MASK_ON_EXACT_EMPTY must be 0 or 1"; exit 2 ;;
esac
case "$HID_LEFT_SURVIVAL" in
  0|1) ;;
  *) echo "HID_LEFT_SURVIVAL must be 0 or 1"; exit 2 ;;
esac
case "$NIGHT6_LEFT" in
  0|1) ;;
  *) echo "NIGHT6_LEFT must be 0 or 1"; exit 2 ;;
esac
case "$PILOT_OFFSET_MS" in
  ''|*[!0-9]*) echo "PILOT_OFFSET_MS must be a non-negative integer"; exit 2 ;;
esac
case "$DEVICE_EPOCH_LATCH" in
  0|1) ;;
  *) echo "DEVICE_EPOCH_LATCH must be 0 or 1"; exit 2 ;;
esac
case "$PRESS_MODE" in
  swipe|tap|async-swipe|fast-swipe|hid|hid-multi) ;;
  *) echo "PRESS_MODE must be swipe, tap, async-swipe, fast-swipe, hid, or hid-multi"; exit 2 ;;
esac
for setting in BB_CAM05_CAPTURE_EVERY BB_CAM05_CAPTURE_START BB_LEFT_CAPTURE_EVERY BB_LEFT_CAPTURE_START; do
  setting_value="${!setting}"
  case "$setting_value" in
    ''|*[!0-9]*) echo "$setting must be a non-negative integer"; exit 2 ;;
  esac
done
for setting in BB_CAM05_UNLIT BB_CAM05_STOP_ON_BB; do
  case "${!setting}" in
    0|1) ;;
    *) echo "$setting must be 0 or 1"; exit 2 ;;
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
  case "$PRESS_MODE" in
    fast-swipe|hid|hid-multi) ;;
    *) echo "$SAMPLE_VIEW capture is calibrated only for PRESS_MODE=fast-swipe or hid"; exit 2 ;;
  esac
  [ ! -e "$LOCAL_SAMPLE_DIR" ] || {
    echo "refusing to overwrite $LOCAL_SAMPLE_DIR"
    exit 2
  }
fi
if [ "$BB_CAM05_UNLIT" -eq 1 ]; then
  [ "$BB_CAM05_CAPTURE_EVERY" -gt 0 ] || {
    echo "BB_CAM05_UNLIT=1 requires BB_CAM05_CAPTURE_EVERY > 0" >&2
    exit 2
  }
fi
if [ -n "$BB_CAM05_MODEL" ]; then
  [ "$BB_CAM05_CAPTURE_EVERY" -gt 0 ] || {
    echo "BB_CAM05_MODEL requires BB_CAM05_CAPTURE_EVERY > 0" >&2
    exit 2
  }
  [ -f "$BB_CAM05_MODEL" ] || {
    echo "BB_CAM05_MODEL does not exist: $BB_CAM05_MODEL" >&2
    exit 2
  }
fi
if [ "$BB_CAM05_STOP_ON_BB" -eq 1 ] && [ -z "$BB_CAM05_MODEL" ]; then
  echo "BB_CAM05_STOP_ON_BB=1 requires BB_CAM05_MODEL" >&2
  exit 2
fi
# A run with no Balloon Boy read is a known-dead configuration, not a variant.
# HID-MULTITOUCH.md records 0/3000 for it in the exact simulator, through the
# BB-to-Foxy chain, and a 2026-08-24 device run reproduced that chain exactly:
# BB walked in, took the lights, Foxy finished it. Say so out loud, because the
# defaults do not, and the failure looks like bad luck if you have not read the
# note.
if [ -z "$BB_LEFT_MODEL" ] && [ -z "$BB_CAM05_MODEL" ]; then
  echo "warning: no BB read configured (BB_LEFT_MODEL / BB_CAM05_MODEL unset)." >&2
  echo "         HID-MULTITOUCH.md records 0/3000 Night 6 for this, via BB->Foxy." >&2
  echo "         The validated check is the lit left opening; CAM 05 is not the" >&2
  echo "         Night 6 checkpoint, and the left vent light costs no flashlight." >&2
fi
if [ -n "$BB_LEFT_MODEL" ]; then
  [ "$BB_LEFT_CAPTURE_EVERY" -gt 0 ] || [ "$HID_LEFT_SURVIVAL" -eq 1 ] ||
    [ "$NIGHT6_LEFT" -eq 1 ] || {
    echo "BB_LEFT_MODEL needs BB_LEFT_CAPTURE_EVERY > 0, HID_LEFT_SURVIVAL=1, or NIGHT6_LEFT=1" >&2
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
if [ "$NIGHT6_LEFT" -eq 1 ]; then
  # The contract this run reproduces is `hidpilot n6 target` in
  # `tools/test.mjs --engine`. Every gate below is one of its explicit
  # dependencies; without them the phone runs a policy nobody measured.
  [ "$HID_LEFT_SURVIVAL" -eq 0 ] || {
    echo "NIGHT6_LEFT and HID_LEFT_SURVIVAL are exclusive" >&2
    exit 2
  }
  [ "$PRESS_MODE" = "hid-multi" ] || {
    echo "NIGHT6_LEFT=1 requires PRESS_MODE=hid-multi" >&2
    exit 2
  }
  [ -n "$BB_LEFT_MODEL" ] || {
    echo "NIGHT6_LEFT=1 requires BB_LEFT_MODEL; the route is 0/3000 blind" >&2
    exit 2
  }
  [ "$DEVICE_EPOCH_LATCH" -eq 1 ] || {
    echo "NIGHT6_LEFT=1 requires DEVICE_EPOCH_LATCH=1 for the scheduler phase" >&2
    exit 2
  }
  [ "$DEBUG_OVERLAYS" -eq 0 ] || {
    echo "NIGHT6_LEFT=1 requires DEBUG_OVERLAYS=0 for a clean classifier frame" >&2
    exit 2
  }
  [ "$BB_LEFT_CAPTURE_EVERY" -eq 0 ] || {
    echo "NIGHT6_LEFT=1 classifies a stream; disable BB_LEFT_CAPTURE_EVERY" >&2
    exit 2
  }
  [ "$NIGHT" = "6th" ] || {
    echo "NIGHT6_LEFT=1 is a 6th Night policy" >&2
    exit 2
  }
  { [ "$PILOT_OFFSET_MS" -ge 83 ] && [ "$PILOT_OFFSET_MS" -le 267 ]; } || {
    echo "PILOT_OFFSET_MS must be inside the measured 83-267 ms phase window" >&2
    exit 2
  }
fi
if [ "$HID_LEFT_SURVIVAL" -eq 1 ]; then
  [ "$PRESS_MODE" = "hid-multi" ] || {
    echo "HID_LEFT_SURVIVAL=1 requires PRESS_MODE=hid-multi" >&2
    exit 2
  }
  [ -n "$BB_LEFT_MODEL" ] || {
    echo "HID_LEFT_SURVIVAL=1 requires BB_LEFT_MODEL" >&2
    exit 2
  }
  [ "$DEBUG_OVERLAYS" -eq 0 ] || {
    echo "HID_LEFT_SURVIVAL=1 requires DEBUG_OVERLAYS=0" >&2
    exit 2
  }
  [ "$BB_LEFT_CAPTURE_EVERY" -eq 0 ] || {
    echo "HID_LEFT_SURVIVAL=1 classifies a stream; disable BB_LEFT_CAPTURE_EVERY" >&2
    exit 2
  }
  [ "$DEVICE_EPOCH_LATCH" -eq 1 ] || {
    echo "HID_LEFT_SURVIVAL=1 requires DEVICE_EPOCH_LATCH=1" >&2
    exit 2
  }
  [ "$CYCLES" -le 4 ] || {
    echo "HID_LEFT_SURVIVAL is limited to four pre-read sweep-probe cycles" >&2
    echo "the device-accepted 790 ms sweep makes the sparse Night 7 policy lose 100% of exact simulations" >&2
    exit 2
  }
  echo "warning: HID_LEFT_SURVIVAL is a bounded epoch/sweep probe; it will not make a BB decision" >&2
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
if [ "$POST_CAPTURE_TOUCHES" -eq 1 ] &&
   [ "$BB_LEFT_CAPTURE_EVERY" -gt 0 ] &&
   [ "$CALIBRATION_INPUT_DEBUG" -eq 0 ]; then
  # The remote driver enables the touch dot only after saving each clean raw
  # frame, then disables it before the next sampled frame.
  POST_CAPTURE_TOUCHES_EFFECTIVE=1
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
if [ "$DEVICE_EPOCH_LATCH" -eq 1 ]; then
  [ ! -e "$LOCAL_EPOCH" ] || { echo "refusing to overwrite $LOCAL_EPOCH"; exit 2; }
fi
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
    # The survival classifier and safety watchdog both call SurfaceFlinger's
    # screencap path. Concurrent captures more than doubled the measured frame
    # latency and produced false `unavailable` aborts. The strategy owns the
    # short capture window; focus monitoring continues independently.
    if adb shell "[ -e '$REMOTE_CAPTURE_LOCK' ]" >/dev/null 2>&1; then
      continue
    fi
    screen_state=$(state_once)
    case "$screen_state" in
      night)
        misses=0
        ;;
      unavailable)
        # Transport/capture contention is not evidence that gameplay ended.
        printf 'watchdog: unavailable (ignored)\n'
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
      grep -m1 'mCurrentFocus=.*com\.scottgames\.fnaf2' || true)
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
  # A clean classifier run may temporarily enable touch dots only after each
  # raw frame. Restore the requested global debug setting on every exit.
  adb shell settings put system show_touches "$DEBUG_OVERLAYS" >/dev/null 2>&1 || true
  pull_samples || true
  if [ "$status" -ne 0 ] && [ "$RECORDING_STARTED" -eq 1 ] && [ "$CAPTURE_PULLED" -eq 0 ]; then
    sleep 1
    if adb pull "$REMOTE_VIDEO" "$LOCAL_ABORT_VIDEO" >/dev/null 2>&1; then
      echo "saved partial capture captures/$OUT-aborted.mp4"
    fi
  fi
  adb shell rm -f "$REMOTE_VIDEO" "$REMOTE_PIDFILE" "$REMOTE_READYFILE" "$REMOTE_STARTFILE" "$REMOTE_EPOCHFILE" "$REMOTE_CAPTURE_LOCK" >/dev/null 2>&1 || true
  if [ "$CHECKER_INSTALLED" -eq 1 ]; then
    adb shell rm -f "$REMOTE_CHECKER" "$REMOTE_CAM05_MODEL" "$REMOTE_BB_MODEL" "$REMOTE_GF_MODEL" >/dev/null 2>&1 || true
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
if [ "$DEVICE_EPOCH_LATCH" -eq 1 ] || [ -n "$BB_CAM05_MODEL$BB_LEFT_MODEL$GF_OFFICE_MODEL" ]; then
  CHECKER_INSTALLED=1
  "$HERE/build-screencheck.sh" "$RUN_TMP/fnaf-screencheck" >/dev/null
  adb push "$RUN_TMP/fnaf-screencheck" "$REMOTE_CHECKER" >/dev/null
  adb shell chmod 755 "$REMOTE_CHECKER"
  REMOTE_CHECKER_ARG=$REMOTE_CHECKER
fi
if [ -n "$BB_CAM05_MODEL" ]; then
  adb push "$BB_CAM05_MODEL" "$REMOTE_CAM05_MODEL" >/dev/null
  REMOTE_CAM05_MODEL_ARG=$REMOTE_CAM05_MODEL
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
FOCUS=$(adb shell dumpsys window 2>/dev/null |
  grep -m1 'mCurrentFocus=.*com\.scottgames\.fnaf2' || true)
case "$FOCUS" in
  *com.scottgames.fnaf2*) ;;
  *) echo "abort: game is not focused ($FOCUS)"; exit 1 ;;
esac

source "$HERE/coords.sh"
NIGHT_TAP=$TAP_CONTINUE
[ "$NIGHT" = "6th" ] && NIGHT_TAP=$TAP_6TH

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

# Positional coordinates keep this remote program literal and auditable.
adb shell sh -s -- "$REMOTE_PIDFILE" "$REMOTE_READYFILE" "$REMOTE_STARTFILE" "$REMOTE_EPOCHFILE" "$REMOTE_CAPTURE_LOCK" \
  "$DEVICE_EPOCH_LATCH" \
  "$CYCLES" "$PRESS_MODE" "$HID_LEFT_SURVIVAL" "$HID_LEFT_DEBUG_RAW" \
  "$NIGHT6_LEFT" "$PILOT_OFFSET_MS" \
  "$BB_CAM05_CAPTURE_EVERY" "$BB_CAM05_CAPTURE_START" \
  "$BB_CAM05_UNLIT" "$BB_CAM05_STOP_ON_BB" \
  "$BB_LEFT_CAPTURE_EVERY" "$BB_LEFT_CAPTURE_START" "$REMOTE_SAMPLE_DIR" \
  "$REMOTE_CHECKER_ARG" "$REMOTE_CAM05_MODEL_ARG" "$REMOTE_BB_MODEL_ARG" "$REMOTE_GF_MODEL_ARG" \
  "$GF_SKIP_MASK_ON_EXACT_EMPTY" "$POST_CAPTURE_TOUCHES_EFFECTIVE" \
  $TAP_MUTE $TAP_MONITOR $TAP_MASK $TAP_CAM_LIGHT $TAP_HALL $WIND \
  $TAP_CAM10 $TAP_CAM04 $TAP_CAM07 $TAP_CAM11 $TAP_CAM05 <<'REMOTE' &
set -eu
PIDFILE=$1; shift
READYFILE=$1; shift
STARTFILE=$1; shift
EPOCHFILE=$1; shift
CAPTURE_LOCK=$1; shift
DEVICE_EPOCH_LATCH=$1; shift
CYCLES=$1; shift
PRESS_MODE=$1; shift
HID_LEFT_SURVIVAL=$1; shift
HID_LEFT_DEBUG_RAW=$1; shift
NIGHT6_LEFT=$1; shift
PILOT_OFFSET_MS=$1; shift
HID_MODE=0
case "$PRESS_MODE" in
  hid|hid-multi) HID_MODE=1 ;;
esac
BB_CAM05_CAPTURE_EVERY=$1; shift
BB_CAM05_CAPTURE_START=$1; shift
BB_CAM05_UNLIT=$1; shift
BB_CAM05_STOP_ON_BB=$1; shift
BB_LEFT_CAPTURE_EVERY=$1; shift
BB_LEFT_CAPTURE_START=$1; shift
SAMPLE_DIR=$1; shift
CHECKER=${1:--}; shift
CAM05_MODEL=${1:--}; shift
BB_MODEL=${1:--}; shift
GF_MODEL=${1:--}; shift
GF_SKIP_MASK_ON_EXACT_EMPTY=$1; shift
POST_CAPTURE_TOUCHES=$1; shift
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

HID_PID=""
HID_FD_OPEN=0

hid_release() {
  [ "$HID_FD_OPEN" -eq 1 ] || return 0
  # Report both inactive contact IDs. A count of zero makes hid-multitouch
  # stop after the first collection and can leave contact 1 stuck down.
  print -p -- '{"id":92,"command":"report","report":[1,2,0,0,0,0,0,4,0,0,0,0]}'
}

hid_down() {
  x=$1; y=$2
  # InputReader rotates the virtual device's 2400x1080 natural axes into the
  # phone's landscape viewport. This is the inverse mapping measured with the
  # system touch overlay: rawX=(1080-screenY)*20/9, rawY=screenX*9/20.
  rx=$(((1080 - y) * 20 / 9))
  ry=$((x * 9 / 20))
  print -p -- "{\"id\":92,\"command\":\"report\",\"report\":[1,1,3,$((rx % 256)),$((rx / 256)),$((ry % 256)),$((ry / 256)),0,0,0,0,0]}"
}

hid_two_down() {
  x1=$1; y1=$2; x2=$3; y2=$4
  rx1=$(((1080 - y1) * 20 / 9)); ry1=$((x1 * 9 / 20))
  rx2=$(((1080 - y2) * 20 / 9)); ry2=$((x2 * 9 / 20))
  print -p -- "{\"id\":92,\"command\":\"report\",\"report\":[1,2,3,$((rx1 % 256)),$((rx1 / 256)),$((ry1 % 256)),$((ry1 / 256)),7,$((rx2 % 256)),$((rx2 / 256)),$((ry2 % 256)),$((ry2 / 256))]}"
}

hid_second_up() {
  x1=$1; y1=$2; x2=$3; y2=$4
  rx1=$(((1080 - y1) * 20 / 9)); ry1=$((x1 * 9 / 20))
  rx2=$(((1080 - y2) * 20 / 9)); ry2=$((x2 * 9 / 20))
  # Contact Count is the number of records in this hybrid packet, not the
  # number still touching. Count 2 makes the kernel consume ID 1's explicit
  # inactive record and emit ACTION_POINTER_UP while preserving ID 0.
  print -p -- "{\"id\":92,\"command\":\"report\",\"report\":[1,2,3,$((rx1 % 256)),$((rx1 / 256)),$((ry1 % 256)),$((ry1 / 256)),4,$((rx2 % 256)),$((rx2 / 256)),$((ry2 % 256)),$((ry2 / 256))]}"
}

# The pulsed-light sweep needs the inverse of hid_two_down: contact 1 selects
# the camera and contact 0 is pulsed afterwards. Both records are always
# present so Linux consumes contact 1's release -- a report promising one
# record leaves it latched down (trap 2 in docs/device/HID-MULTITOUCH.md).
hid_cam_report() {
  f0=$1; f1=$2; x=$3; y=$4
  rx0=$(((1080 - CAM_LIGHT_Y) * 20 / 9)); ry0=$((CAM_LIGHT_X * 9 / 20))
  rx1=$(((1080 - y) * 20 / 9)); ry1=$((x * 9 / 20))
  print -p -- "{\"id\":92,\"command\":\"report\",\"report\":[1,2,$f0,$((rx0 % 256)),$((rx0 / 256)),$((ry0 % 256)),$((ry0 / 256)),$f1,$((rx1 % 256)),$((rx1 / 256)),$((ry1 % 256)),$((ry1 / 256))]}"
}

hid_cam_down()       { hid_cam_report 0 7 "$1" "$2"; }
hid_cam_light_down() { hid_cam_report 3 7 "$1" "$2"; }
hid_cam_light_up()   { hid_cam_report 0 4 "$1" "$2"; }

hid_delay() {
  print -p -- "{\"id\":92,\"command\":\"delay\",\"duration\":$1}"
}

sleep_ms() {
  ms=$1
  sleep "$((ms / 1000)).$(printf '%03d' "$((ms % 1000))")"
}

printf '%s\n' "$$" > "$PIDFILE"
cleanup_remote() {
  if [ "$HID_FD_OPEN" -eq 1 ]; then
    hid_release 2>/dev/null || true
    HID_FD_OPEN=0
    if [ -n "$HID_PID" ]; then
      kill "$HID_PID" 2>/dev/null || true
      wait "$HID_PID" 2>/dev/null || true
    fi
  fi
  children=$(cat "/proc/$$/task/$$/children" 2>/dev/null || true)
  [ -z "$children" ] || kill -TERM $children 2>/dev/null || true
  rm -f "$PIDFILE" "$READYFILE" "$STARTFILE" "$EPOCHFILE" \
    "$CAPTURE_LOCK" "$PIDFILE.left.raw" "$PIDFILE.epoch.raw"
}
trap cleanup_remote EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

if [ "$HID_MODE" -eq 1 ]; then
  /system/bin/hid - |&
  HID_PID=$!
  HID_FD_OPEN=1
  print -p -- '{"id":92,"command":"register","name":"FNAF Timed Touch","vid":6353,"pid":61959,"bus":"usb","descriptor":[5,13,9,4,161,1,133,1,9,34,161,0,9,85,21,0,37,2,117,8,149,1,177,2,9,84,129,2,5,13,9,34,161,2,9,66,21,0,37,1,117,1,129,2,9,50,129,2,9,81,37,63,117,6,129,2,5,1,9,48,38,95,9,117,16,129,2,9,49,38,55,4,129,2,192,5,13,9,34,161,2,9,66,21,0,37,1,117,1,129,2,9,50,129,2,9,81,37,63,117,6,129,2,5,1,9,48,38,95,9,117,16,129,2,9,49,38,55,4,129,2,192,192,192]}'
  # UHID_OPEN only means the kernel is ready. On this phone InputReader adds
  # the resulting touchscreen about five seconds later; every report sent in
  # that gap is silently lost. Gate the strategy clock on the framework-level
  # device entry AOSP requires instead of guessing a fixed startup delay.
  hid_ready_deadline=$(( $(date +%s) + 12 ))
  until dumpsys input 2>/dev/null | grep -q 'FNAF Timed Touch'; do
    kill -0 "$HID_PID" 2>/dev/null || {
      echo 'HID transport exited before InputReader attached it' >&2
      exit 1
    }
    [ "$(date +%s)" -lt "$hid_ready_deadline" ] || {
      echo 'timed out waiting for InputReader to attach HID touchscreen' >&2
      exit 1
    }
    sleep 0.1
  done
fi

# Preload the slow virtual-device registration while the title screen is
# harmless. In the legacy mode the host creates STARTFILE after its screenshot
# gate. The phase experiment instead timestamps the first immutable device-side
# frame whose top-right clock is present and never crosses USB to choose T0.
: > "$READYFILE"
if [ "$DEVICE_EPOCH_LATCH" -eq 1 ]; then
  [ "$CHECKER" != "-" ] || {
    echo 'device epoch latch requires screencheck' >&2
    exit 44
  }
  epoch_raw="$PIDFILE.epoch.raw"
  epoch_deadline=$(( $(date +%s) + 45 ))
  epoch_previous_clear=""
  epoch_first_match=""
  epoch_confirmations=0
  epoch_attempts=0
  while :; do
    rm -f "$epoch_raw"
    : > "$CAPTURE_LOCK"
    screencap > "$epoch_raw" &
    epoch_capture_pid=$!
    while [ ! -s "$epoch_raw" ]; do
      kill -0 "$epoch_capture_pid" 2>/dev/null || break
      sleep 0.002
    done
    epoch_latch=$(date +%s%3N)
    wait "$epoch_capture_pid" || {
      rm -f "$CAPTURE_LOCK" "$epoch_raw"
      echo 'device epoch screencap failed' >&2
      exit 44
    }
    rm -f "$CAPTURE_LOCK"
    epoch_attempts=$((epoch_attempts + 1))
    # Both checks read the same frame, so run them concurrently: the bracket
    # is the sampling period, and the sampling period is what decides whether
    # the pilot's scheduler phase lands inside its window at all.
    "$CHECKER" match 1960 20 2380 180 4 180 255 180 255 180 255 400 \
      < "$epoch_raw" > "$epoch_raw.clock" 2>/dev/null &
    epoch_clock_pid=$!
    "$CHECKER" stats 95 40 260 95 4 \
      < "$epoch_raw" > "$epoch_raw.flash" 2>/dev/null &
    epoch_flash_pid=$!
    wait "$epoch_clock_pid" || true
    wait "$epoch_flash_pid" || true
    epoch_clock=$(cat "$epoch_raw.clock" 2>/dev/null) || epoch_clock=error
    epoch_flash_stats=$(cat "$epoch_raw.flash" 2>/dev/null) || epoch_flash_stats=error
    [ -n "$epoch_clock" ] || epoch_clock=error
    [ -n "$epoch_flash_stats" ] || epoch_flash_stats=error
    epoch_flash_mean=${epoch_flash_stats#*mean_rgb=}
    epoch_flash_mean=${epoch_flash_mean%%,*}
    case "$epoch_flash_mean" in
      ''|*[!0-9]*) epoch_detection=error ;;
      *)
        if [ "$epoch_clock" = match ] && [ "$epoch_flash_mean" -gt 90 ]; then
          epoch_detection=match
        else
          epoch_detection=clear
        fi
        ;;
    esac
    case "$epoch_detection" in
      match)
        if [ "$epoch_confirmations" -eq 0 ]; then
          epoch_first_match=$epoch_latch
          epoch_confirmations=1
          continue
        fi
        epoch_confirmations=$((epoch_confirmations + 1))
        if [ -n "$epoch_previous_clear" ]; then
          epoch_bracket=$((epoch_first_match - epoch_previous_clear))
        else
          epoch_bracket=-1
        fi
        T0=$epoch_first_match
        # The published route's phase window is one-sided -- it tolerates a
        # late T0 and almost no early one -- so the conservative first-positive
        # edge is right for it. Minus 7 Left-Read's window is 83-267 ms, which
        # is centred, so the edge is the wrong estimator: the true HUD frame is
        # uniform inside the bracket, and taking the edge throws away half of
        # it. Centring roughly doubles how often a run lands in phase.
        if [ "$NIGHT6_LEFT" -eq 1 ] && [ "$epoch_bracket" -gt 0 ]; then
          T0=$((epoch_first_match - epoch_bracket / 2))
          printf 'epoch centred: first match %s, bracket %s, T0 %s\n' \
            "$epoch_first_match" "$epoch_bracket" "$T0"
        fi
        epoch_confirmation_delay=$((epoch_latch - T0))
        printf 'epoch_ms=%s previous_clear_ms=%s bracket_ms=%s confirmation_ms=%s confirmation_delay_ms=%s attempts=%s detector=clock+flash-2f\n' \
          "$T0" "${epoch_previous_clear:--1}" "$epoch_bracket" "$epoch_latch" \
          "$epoch_confirmation_delay" "$epoch_attempts" > "$EPOCHFILE"
        break
        ;;
      clear)
        epoch_previous_clear=$epoch_latch
        epoch_first_match=""
        epoch_confirmations=0
        ;;
      *)
        echo "device epoch detector failed: $epoch_detection" >&2
        exit 44
        ;;
    esac
    [ "$(date +%s)" -lt "$epoch_deadline" ] || {
      echo 'device epoch detector timed out waiting for the office clock' >&2
      exit 44
    }
  done
  rm -f "$epoch_raw" "$epoch_raw.clock" "$epoch_raw.flash" "$READYFILE"
else
  while [ ! -e "$STARTFILE" ]; do
    sleep 0.02
  done
  rm -f "$READYFILE" "$STARTFILE"
  T0=$(date +%s%3N)
fi

if [ "$NIGHT6_LEFT" -eq 1 ]; then
  # T0 is the first office-HUD frame. The exact simulator's phase window for
  # this route is 83-267 ms after the night's start, so the pilot's epoch is
  # deliberately offset from the latch rather than equal to it.
  T0=$((T0 + PILOT_OFFSET_MS))
  printf 'pilot epoch = latch + %s ms\n' "$PILOT_OFFSET_MS"
fi

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
  elif [ "$HID_MODE" -eq 1 ]; then
    hid_down "$x" "$y"
    # A 60 ms HID contact occasionally fits between two Fusion touch polls.
    # The persistent transport removes helper overhead, so 100 ms remains
    # comfortably inside the calibrated 190 ms action slots.
    hid_delay 100
    hid_release
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
  if [ "$HID_MODE" -eq 1 ]; then
    hid_down "$x" "$y"
    hid_delay "$duration"
    hid_release
  else
    input swipe "$x" "$y" "$x" "$y" "$duration"
  fi
}

light_down_at() {
  offset=$1; label=$2
  wait_until "$offset"
  actual=$(( $(date +%s%3N) - T0 ))
  printf '%6d ms  %s (contact 0 down)\n' "$actual" "$label"
  hid_down "$CAM_LIGHT_X" "$CAM_LIGHT_Y"
}

light_cam_at() {
  offset=$1; x=$2; y=$3; label=$4
  wait_until "$offset"
  actual=$(( $(date +%s%3N) - T0 ))
  printf '%6d ms  %s (contact 1 tap)\n' "$actual" "$label"
  hid_two_down "$CAM_LIGHT_X" "$CAM_LIGHT_Y" "$x" "$y"
  hid_delay 100
  hid_second_up "$CAM_LIGHT_X" "$CAM_LIGHT_Y" "$x" "$y"
}

light_up_at() {
  offset=$1; label=$2
  wait_until "$offset"
  actual=$(( $(date +%s%3N) - T0 ))
  printf '%6d ms  %s (contacts up)\n' "$actual" "$label"
  hid_release
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
  if [ "$HID_MODE" -eq 1 ]; then
    hid_down "$CAM_LIGHT_X" "$CAM_LIGHT_Y"
    sleep 0.35
    screencap > "$SAMPLE_DIR/$name.raw"
    hid_release
  else
    input swipe "$CAM_LIGHT_X" "$CAM_LIGHT_Y" "$CAM_LIGHT_X" "$CAM_LIGHT_Y" 600 >/dev/null 2>&1 &
    light_pid=$!
    sleep 0.35
    screencap > "$SAMPLE_DIR/$name.raw"
    wait "$light_pid"
  fi
}

capture_unlit_at() {
  offset=$1; name=$2; label=$3
  wait_until "$offset"
  actual=$(( $(date +%s%3N) - T0 ))
  printf '%6d ms  capture-%s-unlit %s\n' "$actual" "$label" "$name"
  screencap > "$SAMPLE_DIR/$name.raw"
}

hid_sweep_at() {
  start=$1; label=$2
  light_down_at "$start" "$label-light-down"
  light_cam_at  $((start + 30))  "$CAM10_X" "$CAM10_Y" "$label-cam-10"
  light_cam_at  $((start + 130)) "$CAM04_X" "$CAM04_Y" "$label-cam-04"
  light_cam_at  $((start + 230)) "$CAM07_X" "$CAM07_Y" "$label-cam-07"
  light_up_at   $((start + 340)) "$label-light-up"
}

device_sweep_at() {
  sweep_start=$1; sweep_label=$2
  # This is the shortest primitive with repeated complete phone traces. Keep
  # each call wall-timed: sending all `delay` commands in one burst lets hid's
  # Handler coalesce/reorder the intermediate reports. The 70 ms light settle,
  # 100 ms contacts, 240 ms feed starts, and 790 ms total match the validated
  # default HID path rather than the rejected 267/357/477/597 ms batches.
  light_down_at "$sweep_start" "$sweep_label-light-down"
  light_cam_at  $((sweep_start +  70)) "$CAM10_X" "$CAM10_Y" "$sweep_label-cam-10"
  light_cam_at  $((sweep_start + 310)) "$CAM04_X" "$CAM04_Y" "$sweep_label-cam-04"
  light_cam_at  $((sweep_start + 550)) "$CAM07_X" "$CAM07_Y" "$sweep_label-cam-07"
  light_up_at   $((sweep_start + 790)) "$sweep_label-light-up"
}

classify_left_and_queue_mask_at() {
  offset=$1; label=$2
  wait_until "$offset"
  actual=$(( $(date +%s%3N) - T0 ))
  printf '%6d ms  %s start snapshot\n' "$actual" "$label" >&2

  # `screencap` does not latch the SurfaceFlinger frame when the process starts:
  # fixed 80 ms overlap produced both a literal mask frame and an unlit office
  # frame on this phone. It writes nothing until the compositor has returned an
  # immutable buffer. Keep the vent lit until the first output byte appears,
  # then mask immediately while the remaining 10 MB write/classification tail
  # proceeds. This is an observed readiness boundary, not another sleep guess.
  if [ "$HID_LEFT_DEBUG_RAW" != "-" ]; then
    capture_raw="$HID_LEFT_DEBUG_RAW.$offset.raw"
  else
    capture_raw="$PIDFILE.left.raw"
    rm -f "$capture_raw"
  fi
  : > "$CAPTURE_LOCK"
  screencap > "$capture_raw" &
  capture_pid=$!
  while [ ! -s "$capture_raw" ]; do
    kill -0 "$capture_pid" 2>/dev/null || break
    sleep 0.002
  done
  actual=$(( $(date +%s%3N) - T0 ))
  printf '%6d ms  %s snapshot latched; mask now\n' "$actual" "$label" >&2
  hid_release
  # Fusion polls touch once per frame, so releasing the vent light and pressing
  # the mask in the same instant can be seen as one finger *moving* between
  # them -- and a button that fires on press then never fires. A dropped mask
  # press leaves the mask stuck on, which makes every later left read dark;
  # the classifier reports that as a confident `inside`, the schedule blind
  # toggles, and the night is lost from that cycle. Give the game one poll of
  # released time to observe.
  hid_delay 40
  hid_down "$MASK_X" "$MASK_Y"
  hid_delay 100
  hid_release
  wait "$capture_pid" || true
  classification=$("$CHECKER" classify "$BB_MODEL" < "$capture_raw" 2>/dev/null) || \
    classification='unknown capture-or-classifier-error'
  [ "$HID_LEFT_DEBUG_RAW" != "-" ] || rm -f "$capture_raw"
  rm -f "$CAPTURE_LOCK"
  actual=$(( $(date +%s%3N) - T0 ))
  printf '%6d ms  classify-bb-left %s\n' "$actual" "$classification" >&2
}

# One camera of the sweep, written into the macro the hid process is already
# executing. No wait_until: see pulsed_sweep_at.
pulsed_cam_burst() {
  x=$1; y=$2
  # `stunCam` refreshes on every frame the light is on while that camera is
  # selected, so contact 0 does not have to be held across the sweep: select
  # first, then pulse. That is 90 ms of flashlight per camera instead of a
  # 790 ms hold, which is the difference between fitting night 6's 3000-frame
  # budget and outspending it. This 10/90 split at 100 ms contacts is the
  # geometry hid-sweep-probe.sh proved at 120 ms spacing.
  hid_cam_down "$x" "$y"
  hid_delay 10
  hid_cam_light_down "$x" "$y"
  hid_delay 90
  hid_cam_light_up "$x" "$y"
}

pulsed_sweep_at() {
  sweep_start=$1; sweep_label=$2
  wait_until "$sweep_start"
  actual=$(( $(date +%s%3N) - T0 ))
  printf '%6d ms  %s (three selects, 120 ms apart, light pulsed after each)\n' \
    "$actual" "$sweep_label"
  # The whole sweep is one uninterrupted macro, exactly as hid-sweep-probe.sh
  # replays it -- and that probe landed 4/4 complete traces at this spacing.
  # The shell only positions the start. Two other arrangements were measured
  # and both put the spacing under the 120 ms the phone accepts, after which
  # the game renders CAM 07 alone: wall-timing every report inside the sweep
  # jittered it to 90-160 ms because wait_until forks `date` per poll, and
  # mixing a wall-timed start with hid-side contact delays gave 105-112 ms
  # because the hid delays elapse concurrently with the shell's wait instead
  # of adding to it. Each camera costs 10 + 100 + 10 = 120 ms of hid time.
  # 10 + 90 + 20: a 100 ms select, a 90 ms light pulse inside it, and 20 ms of
  # released time before the next select -- the exact geometry
  # hid-sweep-probe.sh landed 4/4 at this spacing.
  pulsed_cam_burst "$CAM10_X" "$CAM10_Y"
  hid_delay 20
  pulsed_cam_burst "$CAM04_X" "$CAM04_Y"
  hid_delay 20
  pulsed_cam_burst "$CAM07_X" "$CAM07_Y"
}

hall_reset_and_raise_at() {
  offset=$1; label=$2
  wait_until "$offset"
  actual=$(( $(date +%s%3N) - T0 ))
  printf '%6d ms  %s (hall pulse under the raise)\n' "$actual" "$label"
  # The table presses the hall light and the monitor on the same frame. Doing
  # them sequentially would push the raise 90 ms late and the following sweep
  # inside MONITOR_ANIM_UP, so hold the light on contact 0 and tap the monitor
  # on contact 1 -- the verified two-contact primitive.
  # Wall-timed for the same reason as pulsed_cam_at.
  hid_down "$HALL_X" "$HALL_Y"
  wait_until $((offset + 10))
  hid_two_down "$HALL_X" "$HALL_Y" "$MONITOR_X" "$MONITOR_Y"
  wait_until $((offset + 130))
  hid_second_up "$HALL_X" "$HALL_Y" "$MONITOR_X" "$MONITOR_Y"
  hid_release
}

if [ "$NIGHT6_LEFT" -eq 1 ]; then
  # Transcribed from the exact simulator, not re-derived here: the tables below
  # are `hidpilottest --night=6 --device-sweep --pulse-light --sweep-slot-ms=120
  # --mask-margin-ms=900 --read-latency-ms=480 --pilot-offset-ms=167`, which is
  # 3000/3000 ordinary and 3000/3000 pinned-worst with no missed BB state.
  press_at 0 "$MUTE_X" "$MUTE_Y" mute
  # The epoch detector needs one more confirming capture after T0, so the
  # opening's first press can already be due. Let the raise slip rather than
  # firing the cam-11 select inside MONITOR_ANIM_UP; the wind still ends on
  # the table's absolute deadline, which is what the sweep is anchored to.
  now=$(( $(date +%s%3N) - T0 ))
  mon=$((now + 20))
  [ "$mon" -ge 183 ] || mon=183
  [ "$mon" -le 1200 ] || { echo 'epoch latch left no room for the opening' >&2; exit 46; }
  press_at "$mon" "$MONITOR_X" "$MONITOR_Y" monitor-up
  press_at $((mon + 284)) "$CAM11_X" "$CAM11_Y" opening-cam-11
  hold_at  $((mon + 334)) "$WIND_X" "$WIND_Y" $((6150 - mon - 334)) opening-wind
  pulsed_sweep_at 6167 opening-sweep
  press_at 6550 "$CAM11_X" "$CAM11_Y" opening-cam-11-back
  hold_at  6633 "$WIND_X" "$WIND_Y" 117 opening-top-up

  base=7000
  cycle=0
  unknowns=0
  attacks=0
  while [ "$base" -lt 419000 ] && [ "$cycle" -lt "$CYCLES" ]; do
    press_at "$base" "$MONITOR_X" "$MONITOR_Y" monitor-down
    light_down_at $((base + 367)) left-vent-light
    # Start the capture 300 ms after light-down, not 100. screencap latches
    # 163-348 ms after it starts on this phone, and the vent needs about
    # 270 ms to be drawn: at +100 the earliest latch is 263 ms and catches an
    # unlit opening, which the classifier reads as a confident `inside`
    # because BB in the office is exactly what a dark opening looks like. At
    # +300 the latch lands 463-648 ms after the light, inside the 700 ms the
    # exact simulator still survives.
    classify_left_and_queue_mask_at $((base + 667)) left-view

    case "$classification" in
      empty\ *) branch=clear ;;
      bb\ *)    branch=attack ;;
      *)
        # A single unreadable frame fails closed, because an unseen BB costs
        # the night. Failing closed on *every* cycle is the simulator's
        # all-threat negative control and it dies, so a run that cannot see is
        # not running this policy and should stop rather than pretend.
        branch=attack
        unknowns=$((unknowns + 1))
        printf '%6d ms  left-view %s; failing closed\n' \
          "$(( $(date +%s%3N) - T0 ))" "$classification"
        [ "$unknowns" -le 6 ] || {
          echo 'too many unclassified left reads; the BB branch is blind' >&2
          exit 45
        }
        ;;
    esac

    if [ "$branch" = clear ]; then
      # The table takes the mask off 33 ms after the classifier answers, not
      # at a fixed offset: the later capture start moves the answer with it.
      # Everything after this is anchored to `base` again, so the only hard
      # requirement is landing before the monitor raise at +1383 -- which is
      # also where the exact simulator stops surviving (a 700 ms latch).
      now=$(( $(date +%s%3N) - T0 ))
      [ "$now" -lt $((base + 1300)) ] || {
        echo 'left classifier missed the empty deadline' >&2
        exit 43
      }
      press_at $((now + 33)) "$MASK_X"    "$MASK_Y"    mask-off-empty
      press_at $((base + 1383)) "$MONITOR_X" "$MONITOR_Y" monitor-up
      press_at $((base + 1617)) "$CAM11_X"   "$CAM11_Y"   cam-11
      hold_at  $((base + 1733)) "$WIND_X"    "$WIND_Y"    950 wind-a
      press_at $((base + 2717)) "$MONITOR_X" "$MONITOR_Y" monitor-down-2
      # 130 ms, not the table's 83. The simulator counts frames of light; the
      # phone needs a contact Fusion's per-frame poll cannot miss, and a graded
      # run that scheduled ten 83 ms pulses produced zero visible beams.
      hold_at  $((base + 3100)) "$HALL_X"    "$HALL_Y"    130 reset-foxy
      press_at $((base + 3217)) "$MONITOR_X" "$MONITOR_Y" monitor-up-2
      press_at $((base + 3450)) "$CAM11_X"   "$CAM11_Y"   cam-11-2
      hold_at  $((base + 3567)) "$WIND_X"    "$WIND_Y"    1083 wind-b
      pulsed_sweep_at $((base + 4667)) late-sweep
      base=$((base + 5000))
    else
      attacks=$((attacks + 1))
      printf '%6d ms  left-view BB; holding the mask through five ticks\n' \
        "$(( $(date +%s%3N) - T0 ))"
      press_at $((base + 5917)) "$MASK_X"  "$MASK_Y" mask-off-after-bb
      hall_reset_and_raise_at $((base + 6167)) reset-foxy-after-bb
      pulsed_sweep_at $((base + 6383)) response-sweep
      press_at $((base + 6750)) "$CAM11_X" "$CAM11_Y" cam-11-after-bb
      hold_at  $((base + 6833)) "$WIND_X"  "$WIND_Y" 2817 wind-after-bb
      pulsed_sweep_at $((base + 9667)) response-late-sweep
      base=$((base + 10000))
    fi
    cycle=$((cycle + 1))
  done
  hid_release
  printf 'night6-left finished: %d cycles, %d BB responses, %d unclassified\n' \
    "$cycle" "$attacks" "$unknowns"
  exit 0
fi
if [ "$HID_LEFT_SURVIVAL" -eq 1 ]; then
  # Bounded translation of the policy\'s pre-read cycles. The device-accepted
  # 790 ms sweep invalidates the complete sparse policy in the exact model, so
  # validation caps this branch before the first possible BB observation.
  # DEVICE_EPOCH_LATCH still exercises the real scheduler-phase acquisition.
  press_at          0 "$MUTE_X"    "$MUTE_Y"    mute
  press_at        180 "$MONITOR_X" "$MONITOR_Y" monitor-up
  press_at        460 "$CAM11_X"   "$CAM11_Y"   cam-11
  hold_at         520 "$WIND_X"    "$WIND_Y"    5130 opening-wind
  device_sweep_at 5700 opening-late-sweep
  press_at      6540 "$CAM11_X"   "$CAM11_Y"   opening-cam-11
  hold_at       6620 "$WIND_X"    "$WIND_Y"    120 opening-top-up

  cycle=0
  left_safe_at=27000
  while [ "$cycle" -lt "$CYCLES" ]; do
    base=$((7000 + cycle * 5000))
    if [ "$base" -lt "$left_safe_at" ]; then
      press_at          "$base" "$MONITOR_X" "$MONITOR_Y" monitor-down-idle
      press_at   $((base + 400)) "$MASK_X"    "$MASK_Y"    mask-on-idle
      press_at   $((base + 700)) "$MASK_X"    "$MASK_Y"    mask-off-idle
      hold_at   $((base + 1100)) "$HALL_X"    "$HALL_Y"    80 reset-foxy-idle
      press_at  $((base + 1300)) "$MONITOR_X" "$MONITOR_Y" monitor-up-idle
      press_at  $((base + 1620)) "$CAM11_X"   "$CAM11_Y"   cam-11-idle
      hold_at   $((base + 1740)) "$WIND_X"    "$WIND_Y"    2460 wind-idle
      device_sweep_at $((base + 4210)) idle-late-sweep
      cycle=$((cycle + 1))
      continue
    fi

    # Validation above makes this unreachable. Keep the rejected response
    # translation below as executable documentation for future re-optimization,
    # but never let a phone trial cross the known simulator failure boundary.

    # Clear Golden Freddy and reset Foxy before observing the battery-free left
    # vent. Start screencap 100 ms after light-down; the observed first-byte
    # readiness then lands at +1393..1467 ms while the fully drawn vent is held.
    press_at          "$base" "$MONITOR_X" "$MONITOR_Y" monitor-down-check
    press_at   $((base + 383)) "$MASK_X"    "$MASK_Y"    precheck-mask-on
    press_at   $((base + 600)) "$MASK_X"    "$MASK_Y"    precheck-mask-off
    hold_at    $((base + 867)) "$HALL_X"    "$HALL_Y"    80 precheck-reset-foxy
    light_down_at $((base + 983)) left-view-light-down
    classify_left_and_queue_mask_at $((base + 1083)) left-view

    case "$classification" in
      empty\ *)
        # The classifier completed under the prophylactic mask. Release it now,
        # then use the simulator table's fixed wind and late sweep deadlines.
        now=$(( $(date +%s%3N) - T0 ))
        [ "$now" -lt $((base + 1950)) ] || {
          echo 'left classifier missed the sparse empty deadline' >&2
          exit 43
        }
        press_at   $((now + 17)) "$MASK_X"    "$MASK_Y"    mask-off-empty
        press_at  $((base + 1983)) "$MONITOR_X" "$MONITOR_Y" monitor-up-empty
        press_at  $((base + 2250)) "$CAM11_X"   "$CAM11_Y"   cam-11-empty
        hold_at   $((base + 2333)) "$WIND_X"    "$WIND_Y"    1867 wind-empty
        device_sweep_at $((base + 4210)) empty-late-sweep
        cycle=$((cycle + 1))
        ;;
      bb\ *)
        # A true positive keeps the already-on mask across the aligned five
        # scheduler ticks. The prior late sweep and pre-read Foxy pulse cover
        # the hold; two device sweeps would then restore the ten-second anchor.
        printf '%6d ms  left-view BB; aligned five-tick response\n' \
          "$(( $(date +%s%3N) - T0 ))"
        press_at  $((base + 6020)) "$MASK_X"    "$MASK_Y"    mask-off-after-bb
        hold_at   $((base + 6270)) "$HALL_X"    "$HALL_Y"    80 reset-foxy-after-bb
        press_at  $((base + 6270)) "$MONITOR_X" "$MONITOR_Y" monitor-up-after-bb
        device_sweep_at $((base + 6470)) response-sweep
        press_at  $((base + 7310)) "$CAM11_X"   "$CAM11_Y"   cam-11-after-bb
        hold_at   $((base + 7390)) "$WIND_X"    "$WIND_Y"    1810 wind-after-bb
        device_sweep_at $((base + 9210)) response-late-sweep
        left_safe_at=$((base + 25000))
        cycle=$((cycle + 2))
        ;;
      *)
        # A false positive is not conservative here: the unnecessary six-second
        # mask response kills Foxy in the exact Night 7 model. Stay masked and
        # let host cleanup force-stop rather than translating unknown to BB.
        echo "left classifier refused live branch: $classification" >&2
        exit 42
        ;;
    esac
  done
  final_anchor=$((7000 + cycle * 5000))
  press_at $((final_anchor + 100)) "$CAM11_X" "$CAM11_Y" terminal-cam-11-for-trace
  sleep 1
  exit 0
fi

# Calibration opening: the box begins full, so wait for real drain
# instead of holding the wind button immediately. The first camera sweep ends
# just before a short top-up and the first seven-second cycle anchor.
press_at     0 "$MUTE_X"    "$MUTE_Y"    mute
press_at   180 "$MONITOR_X" "$MONITOR_Y" monitor-up
press_at   460 "$CAM11_X"   "$CAM11_Y"   cam-11
if [ "$PRESS_MODE" = "hid-multi" ] && [ "$BB_LEFT_CAPTURE_EVERY" -eq 0 ]; then
  # Contact 0 stays on the camera light while contact 1 switches feeds. The
  # 240 ms feed intervals are four times the sourced 60 ms stun pulse and buy
  # roughly half a second of additional CAM 11 winding over sequential taps.
  light_down_at 4000 light-sweep-down
  light_cam_at  4070 "$CAM10_X" "$CAM10_Y" cam-10-lit
  light_cam_at  4310 "$CAM04_X" "$CAM04_Y" cam-04-lit
  light_cam_at  4550 "$CAM07_X" "$CAM07_Y" cam-07-lit
  light_up_at   4790 light-sweep-up
  press_at      4890 "$CAM11_X" "$CAM11_Y" cam-11
  hold_at       5010 "$WIND_X"  "$WIND_Y"  1880 wind-to-anchor
elif [ "$PRESS_MODE" = "fast-swipe" ] || [ "$HID_MODE" -eq 1 ]; then
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
  if [ "$PRESS_MODE" = "fast-swipe" ] || [ "$HID_MODE" -eq 1 ]; then
    # The monitor-down animation needs more room than a normal press. From
    # CAM 10 onward, 60 ms presses launch every 190 ms: the full sweep takes
    # 1.14 s instead of 1.38 s. A 1.4 s hold nearly balances one five-second
    # cycle at the sourced Night-6/7 drain and wind rates.
    if [ "$BB_LEFT_CAPTURE_EVERY" -gt 0 ] &&
       [ "$cycle" -ge "$BB_LEFT_CAPTURE_START" ] &&
       [ $(((cycle - BB_LEFT_CAPTURE_START) % BB_LEFT_CAPTURE_EVERY)) -eq 0 ]; then
      sample=$(printf 'cycle-%03d' "$cycle")
      if [ "$POST_CAPTURE_TOUCHES" -eq 1 ]; then
        # A touch dot at (350,615) overlaps the BB-left model ROI. Hide it
        # before the lit raw frame; the preceding monitor touch has more than
        # 350 ms to fade before screencap reads the display.
        settings put system show_touches 0
      fi
      # The left vent light is safe while Golden Freddy occupies the office;
      # the hall light is not. Capture and classify both regions from this one
      # frame before deciding whether the normal mask-then-hall sequence is safe.
      capture_lit_at $((base +  600)) "$sample" bb-left
      if [ "$POST_CAPTURE_TOUCHES" -eq 1 ]; then
        # The classifier input is now immutable. Expose every subsequent touch
        # in the screenrecord so hall coordinates remain visually auditable.
        settings put system show_touches 1
        printf '%6d ms  touch-overlay on-after-capture\n' \
          "$(( $(date +%s%3N) - T0 ))"
      fi
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
      # interval, then wait out its sourced release animation before one hall
      # hold. A dark hall-movement frame still resets and pins Foxy.
      press_at       $((base + 2000)) "$MASK_X"    "$MASK_Y"    mask-off
      hold_at        $((base + 2500)) "$HALL_X"    "$HALL_Y"    200 flash-hall
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
    if [ "$PRESS_MODE" = "hid-multi" ] &&
       { [ "$BB_CAM05_CAPTURE_EVERY" -eq 0 ] || [ "$BB_CAM05_UNLIT" -eq 1 ]; }; then
      press_at $((base +  450)) "$MASK_X"    "$MASK_Y"    mask-on
      press_at $((base +  800)) "$MASK_X"    "$MASK_Y"    mask-off
      hold_at  $((base + 1200)) "$HALL_X"    "$HALL_Y"    200 flash-hall
      press_at $((base + 1550)) "$MONITOR_X" "$MONITOR_Y" monitor-up
      light_down_at $((base + 2050)) light-sweep-down
      light_cam_at  $((base + 2120)) "$CAM10_X" "$CAM10_Y" cam-10-lit
      light_cam_at  $((base + 2360)) "$CAM04_X" "$CAM04_Y" cam-04-lit
      light_cam_at  $((base + 2600)) "$CAM07_X" "$CAM07_Y" cam-07-lit
      light_up_at   $((base + 2840)) light-sweep-up
      if [ "$BB_CAM05_CAPTURE_EVERY" -gt 0 ] &&
         [ "$cycle" -ge "$BB_CAM05_CAPTURE_START" ] &&
         [ $(((cycle - BB_CAM05_CAPTURE_START) % BB_CAM05_CAPTURE_EVERY)) -eq 0 ]; then
        sample=$(printf 'cycle-%03d' "$cycle")
        press_at $((base + 2940)) "$CAM05_X" "$CAM05_Y" cam-05-calibration
        capture_unlit_at $((base + 3120)) "$sample" cam-05
        if [ "$CAM05_MODEL" != "-" ]; then
          classification=$("$CHECKER" classify "$CAM05_MODEL" < "$SAMPLE_DIR/$sample.raw")
          printf '%6d ms  classify-bb-cam05 %s\n' \
            "$(( $(date +%s%3N) - T0 ))" "$classification"
          if [ "$BB_CAM05_STOP_ON_BB" -eq 1 ]; then
            case "$classification" in
              bb\ *) exit 42 ;;
            esac
          fi
        fi
        press_at $((base + 3400)) "$CAM11_X" "$CAM11_Y" cam-11
        hold_at  $((base + 3480)) "$WIND_X"  "$WIND_Y"  1380 wind-after-unlit-capture
      else
        press_at $((base + 2940)) "$CAM11_X" "$CAM11_Y" cam-11
        hold_at  $((base + 3060)) "$WIND_X"  "$WIND_Y"  1800 wind
      fi
      cycle=$((cycle + 1))
      continue
    fi
    press_at $((base +  450)) "$MASK_X"    "$MASK_Y"    mask-on
    press_at $((base +  800)) "$MASK_X"    "$MASK_Y"    mask-off
    # Wait out the sourced 15-frame mask-off animation, then hold the hall
    # actuator once. Hall-movement darkness affects only rendering: the same
    # logical light still resets Foxy's D and pins B. One 200 ms hall hold plus
    # three 60 ms camera pulses costs 76 ms/s, under the sourced 119 ms/s budget.
    # CAM 10 waits a full 500 ms after monitor-up; shorter gaps were swallowed
    # by the flip animation.
    hold_at  $((base + 1200)) "$HALL_X"    "$HALL_Y"    200 flash-hall
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
      if [ "$BB_CAM05_UNLIT" -eq 1 ]; then
        # Negative-control/calibration path only. A 25-frame, 130-second phone
        # run on 2026-08-24 confirmed that unlit CAM 05 is not visually usable
        # for BB detection. Never enable this in a survival controller.
        capture_unlit_at $((base + 3380)) "$sample" cam-05
        if [ "$CAM05_MODEL" != "-" ]; then
          classification=$("$CHECKER" classify "$CAM05_MODEL" < "$SAMPLE_DIR/$sample.raw")
          printf '%6d ms  classify-bb-cam05 %s\n' \
            "$(( $(date +%s%3N) - T0 ))" "$classification"
          if [ "$BB_CAM05_STOP_ON_BB" -eq 1 ]; then
            case "$classification" in
              bb\ *) exit 42 ;;
            esac
          fi
        fi
        press_at $((base + 3650)) "$CAM11_X" "$CAM11_Y" cam-11
        hold_at  $((base + 3730)) "$WIND_X"  "$WIND_Y"  1200 wind-after-unlit-capture
      else
        capture_lit_at $((base + 3380)) "$sample" cam-05
        press_at $((base + 4060)) "$CAM11_X" "$CAM11_Y" cam-11
        hold_at  $((base + 4250)) "$WIND_X"  "$WIND_Y"  600 wind-after-capture
      fi
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
if [ "$HID_MODE" -eq 1 ]; then
  # `delay` schedules reports on hid's Handler thread without blocking this
  # shell. Let the final queued hold/up drain before EXIT closes the device.
  sleep 3.2
else
  wait
fi
REMOTE
DRIVER_PID=$!

# The remote driver pre-registers HID at the title screen and waits here. This
# avoids spending InputReader's five-second attach latency inside the live
# night. Non-HID modes signal readiness immediately through the same gate.
for i in $(seq 1 200); do
  adb shell "[ -e '$REMOTE_READYFILE' ]" >/dev/null 2>&1 && break
  kill -0 "$DRIVER_PID" 2>/dev/null || {
    wait "$DRIVER_PID" || true
    echo "abort: input driver exited before becoming ready" >&2
    exit 1
  }
  sleep 0.1
  [ "$i" = 200 ] && { echo "abort: input driver readiness timed out" >&2; exit 1; }
done

if [ "$DEVICE_EPOCH_LATCH" -eq 1 ]; then
  # Record the visual transition itself during phase trials. The detector is
  # still entirely device-local; this recorder is evidence, not part of T0.
  adb shell "screenrecord --size 1280x576 --bit-rate 3000000 --time-limit $MAXDUR $REMOTE_VIDEO" &
  REC=$!
  RECORDING_STARTED=1
  sleep 0.5
fi

adb shell input swipe $NIGHT_TAP $NIGHT_TAP 120

# Loading is variable. Start both the strategy clock and its diagnostic video
# only after the office HUD is visible. Later screenshots are safety checks;
# they never choose or retime an action.
if [ "$DEVICE_EPOCH_LATCH" -eq 1 ]; then
  for i in $(seq 1 500); do
    adb shell "[ -s '$REMOTE_EPOCHFILE' ]" >/dev/null 2>&1 && break
    kill -0 "$DRIVER_PID" 2>/dev/null || {
      wait "$DRIVER_PID" || true
      echo "abort: device epoch input driver exited before finding the office clock" >&2
      exit 1
    }
    sleep 0.1
    [ "$i" = 500 ] && { echo "abort: $NIGHT device epoch latch timed out"; exit 1; }
  done
  adb pull "$REMOTE_EPOCHFILE" "$LOCAL_EPOCH" >/dev/null
  EPOCH_REPORT=$(tr -d '\r\n' < "$LOCAL_EPOCH")
  echo "$NIGHT night device epoch: $EPOCH_REPORT"
else
  for i in $(seq 1 40); do
    [ "$(state)" = "night" ] && break
    sleep 1
    [ "$i" = 40 ] && { echo "abort: $NIGHT night never started"; exit 1; }
  done
  adb shell "screenrecord --size 1280x576 --bit-rate 3000000 --time-limit $MAXDUR $REMOTE_VIDEO" &
  REC=$!
  RECORDING_STARTED=1
  adb shell "touch '$REMOTE_STARTFILE'"
fi
echo "$NIGHT night detected; starting timed Minus 7 interaction loop + $CYCLES cycles ($PRESS_MODE presses)"

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
