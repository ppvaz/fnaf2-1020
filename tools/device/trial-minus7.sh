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
# Story-night path, via the save-safe Continue item only.
#
# Widened 2026-08-26 from one cycle to a full night. The one-cycle bound existed
# because nothing verified WHICH night Continue would resume, so a longer run
# could have masqueraded as a campaign attempt on a night nobody had
# established.
#
# Nothing machine-verifies the cursor yet -- the save cursor IS printed under
# Continue on the title screen (a 2026-08-26 frame reads "Night 1" plainly at
# full resolution), but no classifier reads that digit, and calibrating one
# needs save states for the other nights that this device does not have. So the
# guard is kept honestly rather than automated away: STORY_CURSOR_OBSERVED must
# be set to the night the operator actually read under Continue, and it must
# match the requested night. That is an assertion by a human who looked, it is
# recorded as such in the manifest, and it is not dressed up as a measurement.
#
# What is still NOT claimed, and the manifest says so: a clear. Plan 13 package
# 3's 6 AM and intro-card classifiers do not exist, so this can reach the end of
# a night and cannot grade the result as a win. `lifecycle=unknown` is the
# honest outcome until they land. New Game remains unreachable from here.
CALIBRATION_STORY_NIGHT="${CALIBRATION_STORY_NIGHT:-0}"
# The night the operator read under Continue on the title screen. Required for
# any story-night run longer than one cycle; see the note above.
STORY_CURSOR_OBSERVED="${STORY_CURSOR_OBSERVED:-}"
DEBUG_OVERLAYS="${DEBUG_OVERLAYS:-0}"
GRADE_RUN="${GRADE_RUN:-1}"
PRESS_MODE="${PRESS_MODE:-hid-multi}"
HID_TRACE_RUN="${HID_TRACE_RUN:-0}"
# The sweep geometry the plan specifies; `recipe.mjs --device-plan` prints it
# and tools/device/test-runner-plan.mjs checks these against it.
PLAN_SPACING_MS="${PLAN_SPACING_MS:-120}"
PLAN_CONTACT_MS="${PLAN_CONTACT_MS:-100}"
# The centre of the measured 83-267 ms scheduler-phase window.
PILOT_OFFSET_MS="${PILOT_OFFSET_MS:-175}"
HID_LEFT_DEBUG_RAW="${HID_LEFT_DEBUG_RAW:--}"
DEVICE_EPOCH_LATCH="${DEVICE_EPOCH_LATCH:-1}"
# The safety capture itself costs 0.7-1.2 s, so polling every 0.25 s meant the
# watchdog was capturing essentially continuously, competing with the
# classifier's own screencap for the same SurfaceFlinger path. Night 6-23 read
# `unknown` on 7 of 8 cycles under that contention and went blind to BB; the
# same schedule with the watchdog quieted read `empty score=0 margin=19` on
# 4 of 4. A death is not a subtle signal and does not need 4 Hz: at this
# interval three consecutive misses still stop the run inside ~5 s.
WATCHDOG_INTERVAL="${WATCHDOG_INTERVAL:-0.8}"
# How long the screen may classify as `other` before the run stops. `other` is
# not death -- screenstate.py's classes are night/gameover/other, and the CAMERA
# VIEW is `other`. The graded n1-full-1620 capture shows 3.50 s camera dwells
# per 5 s cycle and a 5.3 s opening wind, so anything at or below ~6 s aborts a
# healthy run; 12 s clears the longest legitimate dwell with margin and still
# catches the static, the minigame, and the restart card quickly. `gameover`
# does not use this fuse and aborts on sight.
WATCHDOG_OTHER_ABORT_MS="${WATCHDOG_OTHER_ABORT_MS:-12000}"
# The safety capture costs 0.72-0.85 s idle on this phone (12 samples), and
# the code below records that concurrent captures "more than doubled" it. A
# 0.8 s budget was therefore under its own idle maximum: night 6-23 printed
# "watchdog: unavailable (ignored)" on every single poll for 73 s, never saw
# the death, and left the pilot pressing into the title menu.
WATCHDOG_CAPTURE_TIMEOUT="${WATCHDOG_CAPTURE_TIMEOUT:-2.5}"
# How long the night watchdog may see nothing at all before it stops the run.
# Being unable to look is not the same as looking and finding the night, and
# a run that cannot be watched is exactly the one that must not keep tapping.
# One poll can now span its interval plus a 2.5 s budget, so this has to clear
# two or three consecutive failures to mean "sustained" rather than "slow".
WATCHDOG_BLIND_ABORT_MS="${WATCHDOG_BLIND_ABORT_MS:-8000}"
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
# Defaulted here with the others, not beside the audio logic: the validation
# block below reads it under `set -u`, so a late default crashes every run
# that does not set it in the environment.
CUE_AUDIO="${CUE_AUDIO:-0}"
BB_LEFT_MODEL="${BB_LEFT_MODEL:-}"
GF_OFFICE_MODEL="${GF_OFFICE_MODEL:-}"
GF_SKIP_MASK_ON_EXACT_EMPTY="${GF_SKIP_MASK_ON_EXACT_EMPTY:-0}"
HERE="$(cd "$(dirname "$0")" && pwd)"
CAPTURE_DIR="$HERE/../../captures"
LOCAL_VIDEO="$CAPTURE_DIR/$OUT.mp4"
LOCAL_ABORT_VIDEO="$CAPTURE_DIR/$OUT-aborted.mp4"
LOCAL_EPOCH="$CAPTURE_DIR/$OUT-epoch.txt"
LOCAL_RUN_LOG="$CAPTURE_DIR/$OUT-run.log"
SAMPLE_VIEW=""
SAMPLE_BUCKET="unlabeled"
LOCAL_SAMPLE_DIR=""
REMOTE_VIDEO="/sdcard/$OUT.mp4"
REMOTE_PIDFILE="/data/local/tmp/fnaf2-minus7-$$-$(date +%s).pid"
REMOTE_PLAN="$REMOTE_PIDFILE.plan"
REMOTE_READYFILE="$REMOTE_PIDFILE.ready"
REMOTE_STARTFILE="$REMOTE_PIDFILE.start"
REMOTE_EPOCHFILE="$REMOTE_PIDFILE.epoch"
REMOTE_CAPTURE_LOCK="$REMOTE_PIDFILE.capture"
# `adb shell` joins its arguments into one command string and the device shell
# re-parses it, so an empty argument disappears and every parameter after it
# shifts by one. Use the same "-" placeholder the checker and model paths use.
REMOTE_HID_TRACE="-"
[ "$HID_TRACE_RUN" -eq 0 ] || REMOTE_HID_TRACE="$REMOTE_PIDFILE.hid"
LOCAL_HID_TRACE="$CAPTURE_DIR/$OUT-hid.jsonl"
REMOTE_SAMPLE_DIR="/data/local/tmp/fnaf2-screen-calibration-$$-$(date +%s)"
# Non-empty classifier frames, kept for labelling. See the read.
REMOTE_KEEP_DIR="/data/local/tmp/fnaf2-keep-$$-$(date +%s)"
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
DRIVER_LOG_PID=""
DRIVER_OUTPUT_FIFO=""
WATCHDOG_PID=""
FOCUS_WATCHDOG_PID=""
GAME_LAUNCHED=0
RECORDING_STARTED=0
CAPTURE_PULLED=0
SAMPLES_PULLED=0
CHECKER_INSTALLED=0

# Pick a screenrecord limit without silently shortening the evidence. Android's
# old recorder rejects values above 180 seconds; current builds advertise 0 as
# an explicit unlimited mode. A full night cannot be proved by a 180-second
# video, and restarting the encoder would leave unobserved gaps, so a device
# without the unlimited capability is refused rather than degraded.
screenrecord_time_limit() {                    # REQUESTED_SECONDS < help text
  local requested=$1 help_text
  if [ "$requested" -le 180 ]; then
    printf '%s\n' "$requested"
    return 0
  fi
  help_text=$(cat)
  case "$help_text" in
    *'Set to 0'*'to remove the time limit'*)
      printf '%s\n' 0
      return 0
      ;;
  esac
  echo "screenrecord cannot cover the requested ${requested}s interval: this device does not advertise unlimited --time-limit 0" >&2
  return 2
}

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
case "$CALIBRATION_STORY_NIGHT" in
  0|1|2|3|4|5) ;;
  *) echo "CALIBRATION_STORY_NIGHT must be 0 or a story night from 1 to 5"; exit 2 ;;
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
case "$CUE_AUDIO" in
  0|1) ;;
  *) echo "CUE_AUDIO must be 0 or 1"; exit 2 ;;
esac
case "$GRADE_RUN" in
  0|1) ;;
  *) echo "GRADE_RUN must be 0 or 1"; exit 2 ;;
esac
case "$GF_SKIP_MASK_ON_EXACT_EMPTY" in
  0|1) ;;
  *) echo "GF_SKIP_MASK_ON_EXACT_EMPTY must be 0 or 1"; exit 2 ;;
esac
case "$HID_TRACE_RUN" in
  0|1) ;;
  *) echo "HID_TRACE_RUN must be 0 or 1"; exit 2 ;;
esac
case "$PILOT_OFFSET_MS" in
  ''|*[!0-9]*) echo "PILOT_OFFSET_MS must be a non-negative integer"; exit 2 ;;
esac
case "$DEVICE_EPOCH_LATCH" in
  0|1) ;;
  *) echo "DEVICE_EPOCH_LATCH must be 0 or 1"; exit 2 ;;
esac
case "$PRESS_MODE" in
  hid-multi) ;;
  *) echo "trial-minus7.sh now executes only the gated HID plan; PRESS_MODE must be hid-multi"; exit 2 ;;
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
  [ "$CALIBRATION_INPUT_DEBUG" -eq 0 ] || {
    echo "BB_LEFT_MODEL requires clean capture without input-debug overlays" >&2
    exit 2
  }
  [ -f "$BB_LEFT_MODEL" ] || {
    echo "BB_LEFT_MODEL does not exist: $BB_LEFT_MODEL" >&2
    exit 2
  }
fi

# This runner has one policy: the emitted, model-gated Night 6 HID plan. The
# old swipe table and sparse pre-read probe were inline schedules the model
# gate could not price, so they are no longer selectable device routes.
[ -n "$BB_LEFT_MODEL" ] || {
  echo "trial-minus7.sh requires BB_LEFT_MODEL; the Night 6 route is 0/3000 blind" >&2
  exit 2
}
[ "$DEVICE_EPOCH_LATCH" -eq 1 ] || {
  echo "the gated HID plan requires DEVICE_EPOCH_LATCH=1" >&2
  exit 2
}
[ "$DEBUG_OVERLAYS" -eq 0 ] || {
  echo "the gated HID plan requires DEBUG_OVERLAYS=0 for a clean classifier frame" >&2
  exit 2
}
[ "$BB_LEFT_CAPTURE_EVERY" -eq 0 ] || {
  echo "the gated HID plan classifies its stream; disable BB_LEFT_CAPTURE_EVERY" >&2
  exit 2
}
STORY_NIGHT=6
MENU_TARGET=sixthNight
if [ "$CALIBRATION_STORY_NIGHT" -ne 0 ]; then
  [ "$NIGHT" = continue ] || {
    echo "CALIBRATION_STORY_NIGHT requires NIGHT=continue" >&2
    exit 2
  }
  # A night is 420 s and the cycle is 5000 ms, so a full night is about 84
  # cycles. Anything beyond 120 is not a night, it is a stuck loop.
  { [ "$CYCLES" -ge 1 ] && [ "$CYCLES" -le 120 ]; } || {
    echo "story-night CYCLES must be 1..120 (a 420 s night is about 84)" >&2
    exit 2
  }
  # More than one cycle is a real attempt at the night, so it must name the
  # cursor that was seen. One cycle stays open as the timing-calibration path
  # it always was.
  if [ "$CYCLES" -gt 1 ]; then
    [ "$STORY_CURSOR_OBSERVED" = "$CALIBRATION_STORY_NIGHT" ] || {
      echo "a story-night run longer than one cycle must name the save cursor" >&2
      echo "read the label printed under Continue on the title screen, then set" >&2
      echo "  STORY_CURSOR_OBSERVED=<that night>" >&2
      echo "requested night $CALIBRATION_STORY_NIGHT, observed cursor '${STORY_CURSOR_OBSERVED:-unset}'" >&2
      exit 2
    }
  fi
  STORY_NIGHT=$CALIBRATION_STORY_NIGHT
  MENU_TARGET=continue
  echo "story Night $STORY_NIGHT via Continue; save cursor reported as Night ${STORY_CURSOR_OBSERVED:-unread} by the operator (not machine-verified)" >&2
else
  [ "$NIGHT" = "6th" ] || {
    echo "trial-minus7.sh executes Continue only through bounded CALIBRATION_STORY_NIGHT=1..5" >&2
    exit 2
  }
fi
{ [ "$PILOT_OFFSET_MS" -ge 83 ] && [ "$PILOT_OFFSET_MS" -le 267 ]; } || {
  echo "PILOT_OFFSET_MS must be inside the measured 83-267 ms phase window" >&2
  exit 2
}
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
for setting in WATCHDOG_INTERVAL WATCHDOG_CAPTURE_TIMEOUT FOCUS_WATCHDOG_INTERVAL WATCHDOG_BLIND_ABORT_MS WATCHDOG_OTHER_ABORT_MS; do
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

# Include launch/loading headroom and any calibrated raw-frame pauses. Keep the
# requested duration separate from the recorder argument: on capable devices a
# long run uses --time-limit 0 and cleanup stops it when the driver terminates.
LEFT_SAMPLE_COUNT=0
if [ "$BB_LEFT_CAPTURE_EVERY" -gt 0 ]; then
  LEFT_SAMPLE_COUNT=$(((CYCLES - 1 - BB_LEFT_CAPTURE_START) / BB_LEFT_CAPTURE_EVERY + 1))
fi
MAXDUR_MS=$((25000 + CYCLES * 5000 + LEFT_SAMPLE_COUNT * 1500))
MAXDUR=$(((MAXDUR_MS + 999) / 1000))

mkdir -p "$CAPTURE_DIR"
[ ! -e "$LOCAL_VIDEO" ] || { echo "refusing to overwrite $LOCAL_VIDEO"; exit 2; }
[ ! -e "$LOCAL_ABORT_VIDEO" ] || { echo "refusing to overwrite $LOCAL_ABORT_VIDEO"; exit 2; }
[ ! -e "$LOCAL_RUN_LOG" ] || { echo "refusing to overwrite $LOCAL_RUN_LOG"; exit 2; }
if [ "$DEVICE_EPOCH_LATCH" -eq 1 ]; then
  [ ! -e "$LOCAL_EPOCH" ] || { echo "refusing to overwrite $LOCAL_EPOCH"; exit 2; }
fi
RUN_TMP="$(mktemp -d "${TMPDIR:-/tmp}/fnaf2-minus7.XXXXXX")"

# The model gate is a precondition for touching the device at all (2026-08-25,
# no override): the plan must clear the engine under measured human slack
# BEFORE the first adb command, so a run that would be refused never wakes the
# phone, launches the game, or records anything. There is no inline fallback:
# the only device route is the artifact that passes this check. The live
# HUMAN_FLOOR_MS check remains the backstop for recovery presses outside it.
node "$HERE/recipe.mjs" --device-plan "--night=$STORY_NIGHT" > "$RUN_TMP/device-plan.txt"
node "$HERE/human-gate.mjs" "$RUN_TMP/device-plan.txt" || exit 44

. "$HERE/select-adb.sh"

# Capability discovery is read-only and happens before the session starts or
# the game is launched. Do not turn a 420-second night into a plausible-looking
# 180-second artifact merely because an older handset cannot record it.
SCREENRECORD_HELP=$(adb shell screenrecord --help 2>&1 || true)
if ! SCREENRECORD_LIMIT=$(printf '%s\n' "$SCREENRECORD_HELP" |
  screenrecord_time_limit "$MAXDUR"); then
  exit 2
fi
if [ "$SCREENRECORD_LIMIT" -eq 0 ]; then
  echo "screenrecord: unlimited mode advertised; covering requested ${MAXDUR}s interval"
else
  echo "screenrecord: bounded ${SCREENRECORD_LIMIT}s diagnostic interval"
fi
# The session recorder. Sourced before the EXIT trap is installed, so cleanup
# can always finalize -- a manifest written only on the success path is worse
# than none, because an aborted run then looks like it was never attempted.
source "$HERE/session.sh"
WATCHDOG_RESULT="$RUN_TMP/watchdog-result"

# The death signature, measured rather than guessed.
#
# A device-side poller sampled the cue helper at ~14 Hz across night 6-34's death.
# Alive, the snapshot alternates luma 2-80, cam5 23-44, with audio rms 2800-4100
# and peak 5000-16500. At the death it goes flat and stays there:
#
#     t=158.3   luma  71  cam5  44   rms 2919   peak 5691
#     t=158.5   luma 214  cam5 250   rms 2286   peak 5761
#     t=158.6   luma 214  cam5 250   rms    0   peak    0     <- and never moves again
#
# Audio falling to exactly zero is the sharpest edge; the two visual channels
# pinning high agree with it. This costs one loopback exchange (~70 ms measured)
# against the screencap path's 0.7-2.5 s, so the watchdog stops being both slow
# and a competitor for SurfaceFlinger -- it was the screencap contention that
# blinded the classifier for seven of eight cycles on night 6-23.
CUE_DEAD_LUMA=200
CUE_DEAD_CAM5=200

state_once() {
  local result snap luma cam5 rms
  if [ "$CUE_PORT" != "-" ]; then
    snap=$(printf 'GET %s\n' "$CUE_TOKEN" |
      adb shell "toybox nc -w 1 127.0.0.1 $CUE_PORT" 2>/dev/null | tr -d '\r')
    case "$snap" in
      OK\ *)
        luma=$(printf '%s\n' "$snap" | sed -n 's/.* luma=\([0-9]*\).*/\1/p')
        cam5=$(printf '%s\n' "$snap" | sed -n 's/.* cam5=\([0-9]*\).*/\1/p')
        rms=$(printf '%s\n' "$snap" | sed -n 's/.* rms=\([0-9]*\).*/\1/p')
        if [ -n "$luma" ] && [ -n "$cam5" ] && [ -n "$rms" ] &&
           [ "$rms" -eq 0 ] && [ "$luma" -ge "$CUE_DEAD_LUMA" ] &&
           [ "$cam5" -ge "$CUE_DEAD_CAM5" ]; then
          printf '%s\n' "gameover"
          return 0
        fi
        # NOT "night". This signature was measured on one death and it matches
        # the static screen only. Night 6-37 died, played the "Take cake to the
        # children" minigame, and restarted to "12:00 AM 6th Night" -- none of
        # which are bright-and-silent, so this returned "night" for 60+ seconds
        # of a dead game and the pilot kept pressing into it. The elapsed time
        # was then reported as run length, which is how a 163 s "record" got
        # published without checking the run was alive.
        #
        # A detector that can only recognise ONE way of being dead must not be
        # the thing that decides you are alive. Fall through to screenstate,
        # which classifies night/gameover/other from the frame itself; the
        # helper's job here is to catch the static case fast, never to vouch
        # for gameplay.
        ;;
    esac
    # Anything else -- helper refused, or a reading that is not the static
    # signature -- goes to the authority below.
  fi
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

# Duplicate the remote driver's combined output to the operator and to a durable
# artifact. This pipe is entirely host-side: the device program and every
# controller-path instruction are unchanged. Keeping the tee PID lets cleanup
# wait for EOF before session_close hashes the log, including when a watchdog or
# signal aborts the driver.
start_driver_log() {
  DRIVER_OUTPUT_FIFO="$RUN_TMP/driver-output"
  mkfifo "$DRIVER_OUTPUT_FIFO"
  tee -a "$LOCAL_RUN_LOG" < "$DRIVER_OUTPUT_FIFO" &
  DRIVER_LOG_PID=$!
}

finish_driver_log() {
  local local_pid="$DRIVER_LOG_PID"
  [ -n "$local_pid" ] || return 0
  # A signal can land in the few instructions after tee starts but before adb's
  # PID is assigned. In that case no writer will ever open the FIFO, so reap the
  # blocked reader explicitly instead of hanging the EXIT trap.
  if [ -z "$DRIVER_PID" ] && kill -0 "$local_pid" 2>/dev/null; then
    kill -TERM "$local_pid" 2>/dev/null || true
  fi
  wait "$local_pid" 2>/dev/null || true
  DRIVER_LOG_PID=""
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
  local misses=0 screen_state blind_since=0 blind_now other_since=0 other_now
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
        blind_since=0
        ;;
      unavailable)
        # Transport/capture contention is not evidence that gameplay ended --
        # but it is not evidence that it continues, either, and a watchdog that
        # ignores every unreadable poll forever is not a watchdog at all. That
        # is precisely how night 6-23 ran blind for its whole length. Ignore a
        # blip; stop the run on sustained blindness, because an unwatched
        # pilot is the documented way taps reach another app.
        blind_now=$(date +%s)
        [ "$blind_since" -ne 0 ] || blind_since="$blind_now"
        printf 'watchdog: unavailable (ignored)\n'
        if [ $(( (blind_now - blind_since) * 1000 )) -ge "$WATCHDOG_BLIND_ABORT_MS" ]; then
          printf 'abort: watchdog saw nothing for %s ms; stopping rather than pressing unseen\n' \
            "$WATCHDOG_BLIND_ABORT_MS" > "$WATCHDOG_RESULT"
          adb shell am force-stop com.scottgames.fnaf2 >/dev/null 2>&1 || true
          stop_remote_driver
          return 0
        fi
        ;;
      gameover)
        # A real death. No fuse: this is the one state that is unambiguous, and
        # pressing into it is what produced the 163 s "record" that graded at
        # 26 s alive.
        blind_since=0
        misses=2
        printf 'watchdog: gameover\n'
        ;;
      *)
        # `other` is NOT evidence of death, and treating it as such aborted a
        # healthy Night 1 at 32 s on 2026-08-26 (`n1-full-1620`, graded alive
        # >=25 s with the HUD still up when the recording ended).
        #
        # screenstate.py classifies night / gameover / other, and **the camera
        # view is `other`**. This controller lives on the monitor: the graded
        # capture shows 3.50 s camera dwells every 5 s cycle and a 5.3 s opening
        # wind. Two polls at 0.8 s is 1.6 s, so the old `misses >= 2` rule fired
        # inside every legitimate dwell -- it was only survivable on routes that
        # spend less time in the cams.
        #
        # So `other` gets a fuse longer than any legitimate monitor dwell, while
        # `gameover` above keeps the instant abort. This does NOT make a
        # detector that knows one way to be dead into the thing that says you
        # are alive: death still aborts on sight, and sustained `other` -- the
        # static, the minigame, the restart card -- still aborts, just after
        # long enough to tell it from playing the game.
        blind_since=0
        other_now=$(date +%s)
        [ "$other_since" -ne 0 ] || other_since="$other_now"
        printf 'watchdog: %s (%s ms of %s)\n' "$screen_state" \
          "$(( (other_now - other_since) * 1000 ))" "$WATCHDOG_OTHER_ABORT_MS"
        if [ $(( (other_now - other_since) * 1000 )) -ge "$WATCHDOG_OTHER_ABORT_MS" ]; then
          misses=2
        fi
        ;;
    esac
    case "$screen_state" in night) other_since=0 ;; esac
    if [ "$misses" -ge 2 ]; then
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

pull_hid_trace() {
  [ "$REMOTE_HID_TRACE" != "-" ] || return 0
  adb pull "$REMOTE_HID_TRACE" "$LOCAL_HID_TRACE" >/dev/null 2>&1 &&
    echo "hid trace: $LOCAL_HID_TRACE" || true
  adb shell "rm -f $REMOTE_HID_TRACE" >/dev/null 2>&1 || true
}

# Record what this run actually produced, then close the session -- on whatever
# path got here.
#
# Every artifact below is recorded by hashing the file that exists, never by
# naming one that should. A capture the run failed to pull becomes a fault
# event instead of an artifact entry, because "the manifest lists it" and "the
# bytes are on disk" have to mean the same thing for a replay to be possible.
#
# The outcome is deliberately `unknown` on the success path. Completing six
# cycles is not surviving to 6 AM and the runner has graded nothing; only
# grade-run.sh's instruments can say what the interval was. A runner that wrote
# `win` here would be the 163 s record all over again, in machine-readable form.
session_close() {                               # STATUS WATCHDOG_TEXT
  local status=$1 watchdog=$2 lifecycle reason candidate
  fnaf_session_active || return 0

  if [ -f "$LOCAL_VIDEO" ] || [ -f "$LOCAL_ABORT_VIDEO" ]; then
    fnaf_session_record clock domain=video_media_pts_s kind=media-pts units=s \
      "origin_note=screenrecord MP4 presentation timestamps. The origin is the first encoded frame and no mapping to the runner clock has been measured, so no alignment edge is claimed for it" \
      valid_from=0 "valid_until=${MAXDUR:-0}"
  fi
  if [ -f "$LOCAL_VIDEO" ]; then
    fnaf_session_artifact "$LOCAL_VIDEO" artifact_id=video role=night-recording \
      authority=primary-observation format=video/mp4 complete=true truncated=false \
      retention=local-only clock_domain=video_media_pts_s \
      redaction.contains_game_media=true redaction.contains_audio=false \
      redaction.commit_safe=false
  elif [ -f "$LOCAL_ABORT_VIDEO" ]; then
    fnaf_session_artifact "$LOCAL_ABORT_VIDEO" artifact_id=video \
      role=aborted-run-recording authority=primary-observation format=video/mp4 \
      complete=false truncated=true retention=local-only \
      clock_domain=video_media_pts_s redaction.contains_game_media=true \
      redaction.contains_audio=false redaction.commit_safe=false
  fi
  if [ -f "$LOCAL_EPOCH" ]; then
    # The runner waits and timestamps on /proc/uptime, not on `date`, so the
    # axis every log line and hid-trace mark is measured on is monotonic while
    # T0 itself stays an epoch reading. That is a clock-domain crossing and it
    # is recorded as one: the two are latched one builtin apart at the same
    # instant, the offset is T0, and the residual is /proc/uptime's own 10 ms
    # tick. Reinterpreting one as the other silently is what the v1 contract
    # exists to prevent.
    if [ -n "${EPOCH_T0_MS:-}" ] && [ -n "${FNAF2_SESSION_DEVICE_OFFSET:-}" ]; then
      fnaf_session_record clock domain=runner_monotonic_ms kind=monotonic units=ms \
        "origin_note=/proc/uptime centiseconds latched at T0 inside the device shell, x10 to ms. Every press offset, log line and hid-trace mark is on this axis; T0 itself is a date +%s%3N epoch reading, which is what joins to host artifacts" \
        valid_from=0 "valid_until=${MAXDUR_MS:-0}"
      fnaf_session_record align from_domain=runner_monotonic_ms \
        to_domain=device_shell_wall_ms "offset=$EPOCH_T0_MS" offset_units=ms \
        "method=both latched at the epoch confirmation, /proc/uptime read immediately after date +%s%3N" \
        residual=10
    fi
    fnaf_session_artifact "$LOCAL_EPOCH" artifact_id=epoch role=epoch-latch-report \
      authority=operational-metadata format=text/plain complete=true truncated=false \
      retention=local-only clock_domain=device_shell_wall_ms \
      redaction.contains_game_media=false redaction.contains_audio=false \
      redaction.commit_safe=true
  fi
  if [ "$HID_TRACE_RUN" -eq 1 ]; then
    fnaf_session_artifact "$LOCAL_HID_TRACE" artifact_id=hid-trace \
      role=emitted-input-trace authority=emitted-action-record \
      format=application/x-ndjson complete=true truncated=false retention=local-only \
      clock_domain=hid_scheduled_ms redaction.contains_game_media=false \
      redaction.contains_audio=false redaction.commit_safe=true
    if [ -f "$LOCAL_HID_TRACE" ]; then
      fnaf_session_record clock domain=hid_scheduled_ms kind=scheduled units=ms \
        "origin_note=the hid process's own report timeline: mark rebases host waits while delay advances hid-internal time, so a contested boundary has two candidates and this domain is not the shell's" \
        valid_from=0 "valid_until=${MAXDUR_MS:-0}"
    fi
  fi
  if [ -f "$LOCAL_RUN_LOG" ]; then
    # This is a combined stream. Most decision lines name runner-relative time,
    # but startup and transport errors do not, so assigning one clock domain to
    # the whole file would claim more alignment than the bytes support.
    fnaf_session_artifact "$LOCAL_RUN_LOG" artifact_id=driver-log \
      role=remote-driver-output authority=operational-metadata format=text/plain \
      complete=true truncated=false retention=local-only clock_domain=null \
      redaction.contains_game_media=false redaction.contains_audio=false \
      redaction.commit_safe=true
  fi
  if [ -f "$CAPTURE_DIR/$OUT-cue.txt" ]; then
    fnaf_session_artifact "$CAPTURE_DIR/$OUT-cue.txt" artifact_id=cue-trace \
      role=cue-helper-scalar-trace authority=primary-observation format=text/plain \
      complete=true truncated=false retention=local-only \
      clock_domain=device_shell_wall_ms redaction.contains_game_media=false \
      redaction.contains_audio=false redaction.commit_safe=true
  fi
  if [ -d "$CAPTURE_DIR/screencheck-keep/$OUT" ]; then
    fnaf_session_artifact "$CAPTURE_DIR/screencheck-keep/$OUT" artifact_id=kept-frames \
      role=classifier-frames authority=primary-observation \
      format=application/x-android-screencap-raw-set complete=true truncated=false \
      retention=local-only clock_domain=null redaction.contains_game_media=true \
      redaction.contains_audio=false redaction.commit_safe=false
  fi
  if [ "$SAMPLES_PULLED" -eq 1 ] && [ -d "$LOCAL_SAMPLE_DIR" ]; then
    fnaf_session_artifact "$LOCAL_SAMPLE_DIR" artifact_id=calibration-frames \
      "role=$SAMPLE_VIEW-$SAMPLE_BUCKET-frames" authority=primary-observation \
      format=application/x-android-screencap-raw-set complete=true truncated=false \
      retention=local-only clock_domain=null redaction.contains_game_media=true \
      redaction.contains_audio=false redaction.commit_safe=false
  fi
  local audio=""
  for candidate in "$CAPTURE_DIR/cue-helper/calibration/$OUT"-cue-*.wav; do
    [ -f "$candidate" ] && audio="$candidate"
  done
  if [ -n "$audio" ]; then
    # clock_domain is null, not `helper_nanotime_ns`. The helper's nanoTime
    # origin for this PCM is printed by `log stop` and never saved beside the
    # WAV -- the sidecar the inventory names as missing. Declaring the domain
    # here would assert an origin nothing on disk can supply.
    fnaf_session_artifact "$audio" artifact_id=night-audio role=night-pcm \
      authority=primary-observation format=audio/wav complete=true truncated=false \
      retention=local-only clock_domain=null \
      redaction.contains_game_media=true redaction.contains_audio=true \
      redaction.commit_safe=false
    fnaf_session_record note \
      "text=night PCM has no startNs sidecar, so it carries no clock domain and cannot be aligned to the recording or the runner"
  fi

  local focus_faults=0
  case "$watchdog" in *"lost focus"*) focus_faults=1 ;; esac
  fnaf_session_record helper "restarts=0" "revocations=0" \
    "focus_faults=$focus_faults" \
    "token_present=$([ "${CUE_TOKEN:--}" != "-" ] && echo true || echo false)" \
    "process_identity=$([ "${CUE_PORT:--}" != "-" ] && echo "cue-helper-loopback-$CUE_PORT" || echo null)"

  case "$status" in
    0)   lifecycle=unknown
         reason="planned $CYCLES cycles completed. The runner grades nothing: whether the game was alive for that interval is grade-run.sh's answer, not this one" ;;
    42)  lifecycle=aborted; reason="classifier read a threat and stopped before the hall press" ;;
    47)  lifecycle=aborted; reason="could not select ${MENU_TARGET:-the night} on the title screen" ;;
    129) lifecycle=aborted; reason="hangup (SIGHUP)" ;;
    130) lifecycle=aborted; reason="interrupted (SIGINT)" ;;
    143) lifecycle=aborted; reason="terminated (SIGTERM)" ;;
    *)   lifecycle=aborted; reason="runner exited with status $status" ;;
  esac
  if [ -n "$watchdog" ]; then
    reason=$watchdog
    lifecycle=aborted
    [ "$focus_faults" -eq 0 ] || lifecycle=focus-loss
  fi
  fnaf_session_finalize "$lifecycle" "$reason"
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  set +e
  local watchdog_text=""
  [ -z "${WATCHDOG_RESULT:-}" ] || [ ! -s "$WATCHDOG_RESULT" ] ||
    watchdog_text=$(tr -d '\r\n' < "$WATCHDOG_RESULT")
  pull_hid_trace
  stop_watchdogs
  stop_remote_driver
  finish_driver_log
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
  if adb shell "[ -d '$REMOTE_KEEP_DIR' ]" >/dev/null 2>&1; then
    mkdir -p "$CAPTURE_DIR/screencheck-keep/$OUT"
    if adb pull "$REMOTE_KEEP_DIR/." "$CAPTURE_DIR/screencheck-keep/$OUT/" >/dev/null 2>&1; then
      echo "kept $(find "$CAPTURE_DIR/screencheck-keep/$OUT" -name '*.raw' | wc -l | tr -d ' ')" \
           "non-empty classifier frames under captures/screencheck-keep/$OUT"
    fi
    adb shell "rm -rf $REMOTE_KEEP_DIR" >/dev/null 2>&1 || true
  fi
  if [ "${CUE_AUDIO_STARTED:-0}" -eq 1 ]; then
    CUE_AUDIO_STARTED=0
    "$HERE/query-cue-helper.sh" log stop "$OUT" 2>&1 | sed 's/^/  audio: /' || true
  fi
  if [ "${CUE_TRACE_REMOTE:-}" != "" ]; then
    # Stop the writer first: the loop only reads the sentinel, so this rm
    # cannot be resurrected, and the pull then copies a quiescent file.
    adb shell "rm -f ${CUE_TRACE_SENTINEL:-}" >/dev/null 2>&1 || true
    adb pull "$CUE_TRACE_REMOTE" "$CAPTURE_DIR/$OUT-cue.txt" >/dev/null 2>&1 &&
      echo "cue trace: $CAPTURE_DIR/$OUT-cue.txt" || true
    adb shell "rm -f $CUE_TRACE_REMOTE" >/dev/null 2>&1 || true
  fi
  adb shell rm -f "$REMOTE_PLAN" "$REMOTE_VIDEO" "$REMOTE_PIDFILE" "$REMOTE_READYFILE" "$REMOTE_STARTFILE" "$REMOTE_EPOCHFILE" "$REMOTE_CAPTURE_LOCK" >/dev/null 2>&1 || true
  if [ "$CHECKER_INSTALLED" -eq 1 ]; then
    adb shell rm -f "$REMOTE_CHECKER" "$REMOTE_CAM05_MODEL" "$REMOTE_BB_MODEL" "$REMOTE_GF_MODEL" >/dev/null 2>&1 || true
  fi
  if [ "$SAMPLES_PULLED" -eq 1 ]; then
    adb shell "rm -rf '$REMOTE_SAMPLE_DIR'" >/dev/null 2>&1 || true
  elif [ -n "$SAMPLE_VIEW" ]; then
    echo "$SAMPLE_VIEW samples, if any, remain at $REMOTE_SAMPLE_DIR on-device" >&2
  fi
  # Last, so every artifact above is on disk and hashable by the time the
  # manifest names it -- and unconditional, so an abort produces a described
  # session rather than an unexplained pile of files.
  session_close "$status" "$watchdog_text"
  if [ "$GRADE_RUN" = 1 ]; then
    # One pipeline, and it finds the capture itself.
    #
    # This used to name "$LOCAL_VIDEO" directly. Every run that ends in an abort
    # saves "$LOCAL_ABORT_VIDEO" instead, so for a whole session of aborted runs
    # this step graded a file that did not exist and printed nothing -- while
    # looking, in the log, exactly like grading. A false 163 s record survived
    # because of it. grade-run.sh takes the run name, finds whichever capture
    # exists, and runs every instrument including the survival grader that would
    # have caught it.
    #
    # Preserve the runner's terminal status, but never make failure suppress
    # its own evidence. grade-run's result is diagnostic here; `exit "$status"`
    # below still returns the abort, signal, or driver failure to the caller.
    "$HERE/grade-run.sh" "$OUT" || true
  fi
  rm -f "$WATCHDOG_RESULT"
  rmdir "$RUN_TMP" 2>/dev/null || true
  exit "$status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

adb get-state >/dev/null

# One session id and one monotonic origin, latched here and threaded through
# everything this run touches -- including helpers started inside it, which
# read FNAF2_SESSION_RUN from the environment rather than inventing a second
# identity. This happens before the game is launched, so a run that dies during
# launch is still a described session and not three files sharing a basename.
fnaf_session_begin "$OUT" "tools/device/trial-minus7.sh"
# Create the artifact as soon as a session exists. A setup failure before the
# remote process launches therefore leaves an honest empty driver log instead
# of making the session's primary diagnostic artifact disappear altogether.
: > "$LOCAL_RUN_LOG"
SESSION_NIGHT=$STORY_NIGHT
if [ "$CALIBRATION_STORY_NIGHT" -ne 0 ]; then
  fnaf_session_record note \
    "text=story Night $STORY_NIGHT requested via Continue. The save cursor was reported as Night ${STORY_CURSOR_OBSERVED:-unread} by the operator reading the label under Continue; NO classifier verified it, so night identity is an asserted observation and not a measurement. No 6 AM or intro-card classifier exists, so this session cannot grade a clear regardless of outcome."
fi
fnaf_session_probe_target "$SESSION_NIGHT" "$NIGHT-$PRESS_MODE-c$CYCLES" \
  "screencap-raw+screenrecord"
fnaf_session_record env \
  "NIGHT=$NIGHT" "CYCLES=$CYCLES" "PRESS_MODE=$PRESS_MODE" \
  "CALIBRATION_STORY_NIGHT=$CALIBRATION_STORY_NIGHT" \
  "STORY_CURSOR_OBSERVED=${STORY_CURSOR_OBSERVED:-unread}" \
  "GRADE_RUN=$GRADE_RUN" "HID_TRACE_RUN=$HID_TRACE_RUN" \
  "SCREENRECORD_TIME_LIMIT=$SCREENRECORD_LIMIT" \
  "DEVICE_EPOCH_LATCH=$DEVICE_EPOCH_LATCH" "DEBUG_OVERLAYS=$DEBUG_OVERLAYS" \
  "CUE_HELPER=${CUE_HELPER:-0}" "CUE_AUDIO=$CUE_AUDIO" \
  "PLAN_SPACING_MS=$PLAN_SPACING_MS" "PLAN_CONTACT_MS=$PLAN_CONTACT_MS" \
  "PILOT_OFFSET_MS=$PILOT_OFFSET_MS" \
  "BB_LEFT_CAPTURE_EVERY=$BB_LEFT_CAPTURE_EVERY" \
  "BB_CAM05_CAPTURE_EVERY=$BB_CAM05_CAPTURE_EVERY" \
  "GF_SKIP_MASK_ON_EXACT_EMPTY=$GF_SKIP_MASK_ON_EXACT_EMPTY"
# The plan is identified by its bytes, not its name: it is emitted per run into
# a temporary directory that is gone before anyone reads the manifest.
fnaf_session_record controller \
  "policy_version=trial-minus7/$NIGHT/$PRESS_MODE" \
  "plan_id=recipe.mjs --device-plan" \
  "plan_file=$RUN_TMP/device-plan.txt" \
  "actuator=$PRESS_MODE" \
  "emitted_action_trace=$([ "$HID_TRACE_RUN" -eq 1 ] && echo hid-trace || echo null)"
# Model hashes, not model filenames. authorized_for is `fail-safe` for all
# three because that is what they are wired to do: any read that is not
# confidently empty masks and stops the run. None of them can cause an action,
# only prevent one, and none has a retained holdout report -- which is
# precisely what keeps them out of `live-decision` until plan 09 package 4
# gives them one. authorized_for_game_build is the build coords.sh and the
# screen models were calibrated on; a phone carrying a different build makes
# every one of them stale, loudly, in the manifest.
session_record_model() {                        # MODEL_ID KIND PATH
  [ -n "$3" ] || return 0
  fnaf_session_record model "model_id=$1" "kind=$2" "file=$3" \
    "built_from_commit=unknown" authorized_for=fail-safe \
    "authorized_for_game_build=$FNAF2_CALIBRATED_BUILD" \
    calibration_report=null holdout_report=null
}
session_record_model bb-left scm1-left-opening "$BB_LEFT_MODEL"
session_record_model bb-cam05 scm1-cam05 "$BB_CAM05_MODEL"
session_record_model gf-office scm1-golden-freddy-office "$GF_OFFICE_MODEL"
if [ -n "$BB_CAM05_MODEL$BB_LEFT_MODEL$GF_OFFICE_MODEL" ]; then
  fnaf_session_record note \
    "text=model built_from_commit is 'unknown': SCM1 binaries are gitignored and carry no provenance of their own, so the hash above is the only thing that identifies them"
fi

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
# The cycle table has one copy: recipe.mjs emits it from the exact simulator
# and the remote program interprets it. It used to live here as millisecond
# literals too, and the two drifted -- a wind lead corrected in the model still
# reached the phone as the old value.
# Emitted and model-gated at the top of this script, before any adb command.
adb push "$RUN_TMP/device-plan.txt" "$REMOTE_PLAN" >/dev/null
echo "device plan: $(grep -c . "$RUN_TMP/device-plan.txt") lines"

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
fnaf_session_event kind=lifecycle outcome=title terminal=false \
  sensor=window-manager "note=game launched and holding focus"

source "$HERE/coords.sh"
# The title item is selected, not assumed. `NIGHT` used to be four facts at
# once -- a night identity, a menu action, a claim about the save cursor, and
# the policy that would run -- resolved here by a two-line coordinate lookup
# that never looked at the screen. plans/13 splits them; menu.sh owns the
# press and refuses anything it cannot see.
source "$HERE/menu.sh"

# The cue helper's device-local snapshot, logged beside the classifier.
#
# The runner's own read is a `screencap` plus `fnaf-screencheck`: about 225 ms,
# which is why it can afford exactly one per five-second cycle and why Balloon
# Boy is only ever seen once he is already inside. The helper answers the same
# question from a held MediaProjection in 42 ms p50 / 57 ms p95 (measured on
# this phone, 20 samples), which would make several reads a cycle affordable.
#
# ON-DEVICE-VALIDATION.md is explicit that the classifier threshold on that path
# is NOT calibrated -- the luma separation came from screencap frames and an
# offline bilinear simulation, not Android's own VirtualDisplay scaler. So this
# does not switch the sensor. It records the helper's reading next to the
# screencheck class that is already trusted, which is exactly the labelled data
# the threshold needs. Switch only once that data says where the line is.
CUE_HELPER="${CUE_HELPER:-0}"
# Keep the night's PCM, not just the scalar snapshots.
#
# The cue trace records rms and peak per sample, which cannot carry a transient:
# measured over night 6-40 the peak is pinned at full-scale int16 on 55% of the
# live stretch. The bang detector needs the waveform, and nothing was ever
# recording it -- `screenrecord` is video-only and no night run has ever kept
# audio, so "no bang was heard" has never once been a measurement. The helper
# buffers the night in memory and writes on stop, so this costs the run nothing.
CUE_AUDIO_STARTED=0
CUE_PORT="-"
CUE_TOKEN="-"
if [ "$CUE_HELPER" -eq 1 ]; then
  cue_pid="$(adb shell pidof com.fnafminus7.cuehelper 2>/dev/null | tr -d '\r' | awk '{print $1}')"
  [ -n "$cue_pid" ] || { echo 'CUE_HELPER=1 but the helper is not running' >&2; exit 2; }
  cue_control="$(adb logcat -d --pid="$cue_pid" -v brief -s FnafCueHelper:I '*:S' 2>/dev/null |
    tr -d '\r' | awk '/control=(READY|DEGRADED)/ { line=$0 } END { print line }')"
  CUE_PORT="$(printf '%s\n' "$cue_control" | sed -n 's/.* port=\([^ ]*\).*/\1/p')"
  CUE_TOKEN="$(printf '%s\n' "$cue_control" | sed -n 's/.*token=\([0-9a-f][0-9a-f]*\).*/\1/p')"
  case "$CUE_PORT" in ''|*[!0-9]*) echo 'the cue helper has no live loopback port' >&2; exit 2 ;; esac
  [ "${#CUE_TOKEN}" -eq 32 ] || { echo 'no valid per-run cue-helper token' >&2; exit 2; }
  echo "cue helper: port $CUE_PORT, logging snapshots beside each left read"
  if [ "$CUE_AUDIO" -eq 1 ]; then
    # Refuse the night rather than record silence through it.
    #
    # AudioPlaybackCapture taps the phone's mix. A2DP offload does not go
    # through that mix, so with Bluetooth audio connected the helper returns
    # zero-filled buffers -- and keeps reporting `audio=OBSERVED` with an
    # advancing frame counter, which is indistinguishable from working. Night
    # 6-42 recorded 71 s of exact zeros across a night that had Balloon Boy on
    # camera, and only the sample values said so. Checking costs one dumpsys.
    # A herestring, because `grep -q` must not be on the right of a pipe here.
    #
    # It exits the instant it matches, the writer takes SIGPIPE, and under
    # `set -o pipefail` the pipeline reports 141 -- so the `if` reads false no
    # matter how well the pattern matched. That skipped this guard twice and let
    # nights 6-43 and 6-guardtest record 66 s and 63 s of silence anyway. Piping
    # into `grep -c` and comparing hides it, because -c reads to the end.
    audio_route="$(adb shell dumpsys audio 2>/dev/null | tr -d '\r')"
    if grep -q 'Devices: *bt_a2dp' <<<"$audio_route"; then
      echo 'CUE_AUDIO=1 but this phone is playing to Bluetooth, and A2DP offload' >&2
      echo 'bypasses the mix the helper captures: the recording would be silent and' >&2
      echo 'the bang scan would report a meaningless zero. Disconnect Bluetooth audio' >&2
      echo '(or set CUE_AUDIO=0 to run the night without it).' >&2
      exit 2
    fi
    if "$HERE/query-cue-helper.sh" log start >/dev/null 2>&1; then
      CUE_AUDIO_STARTED=1
      echo "cue helper: recording the night's audio for the bang detector"
    else
      echo 'CUE_AUDIO=1 but the helper would not start a capture' >&2
      exit 2
    fi
  fi
  # And a continuous device-side trace of the same socket, for the events we
  # cannot schedule. Golden Freddy is one run in ten before 2 AM; the box-low
  # warning only appears when the box is nearly empty; a death happens once.
  # None of them can be captured by asking at a chosen moment, so sample the
  # whole run and keep it. One adb shell for the run, a loopback exchange per
  # sample, about 14 Hz measured -- it never touches SurfaceFlinger, so unlike
  # the old screencap watchdog it cannot compete with the classifier.
  #
  # The sentinel must be a file the loop never writes. The first form used one
  # file as both kill switch and output, so cleanup's rm was resurrected by the
  # loop's own appends unless it landed in the sliver between the last append
  # and the next -e test: nine orphaned loops accumulated, each spamming the
  # helper with a stale token at ~14 Hz forever. Seven at once put 1-3% of all
  # legitimate cue reads into a ~1 s TCP SYN-retransmit stall (accept backlog
  # overflow, confirmed against /proc/net/netstat counters); on a clean socket
  # the same read never exceeded 84 ms in 240 samples. The sweep below reaps
  # anything a killed host process left behind; no two runs share the phone.
  adb shell 'rm -f /data/local/tmp/fnaf2-cue-*.run /data/local/tmp/fnaf2-cue-*.txt' >/dev/null 2>&1 || true
  CUE_TRACE_SENTINEL="/data/local/tmp/fnaf2-cue-$$.run"
  CUE_TRACE_REMOTE="/data/local/tmp/fnaf2-cue-$$.txt"
  adb shell "nohup sh -c '
    : > $CUE_TRACE_SENTINEL
    : > $CUE_TRACE_REMOTE
    while [ -e $CUE_TRACE_SENTINEL ]; do
      printf \"%s \" \"\$(date +%s%3N)\" >> $CUE_TRACE_REMOTE
      printf \"GET $CUE_TOKEN\n\" | toybox nc -w 1 127.0.0.1 $CUE_PORT >> $CUE_TRACE_REMOTE 2>/dev/null
      printf \"\n\" >> $CUE_TRACE_REMOTE
    done' >/dev/null 2>&1 &" >/dev/null 2>&1
fi

# Positional coordinates keep this remote program literal and auditable.
start_driver_log
adb shell sh -s -- "$REMOTE_PIDFILE" "$REMOTE_READYFILE" "$REMOTE_STARTFILE" "$REMOTE_EPOCHFILE" "$REMOTE_CAPTURE_LOCK" \
  "$DEVICE_EPOCH_LATCH" \
  "$CYCLES" "$PRESS_MODE" "0" "$HID_LEFT_DEBUG_RAW" \
  "1" "$PILOT_OFFSET_MS" "$REMOTE_HID_TRACE" \
  "$PLAN_SPACING_MS" "$PLAN_CONTACT_MS" \
  "$BB_CAM05_CAPTURE_EVERY" "$BB_CAM05_CAPTURE_START" \
  "$BB_CAM05_UNLIT" "$BB_CAM05_STOP_ON_BB" \
  "$BB_LEFT_CAPTURE_EVERY" "$BB_LEFT_CAPTURE_START" "$REMOTE_SAMPLE_DIR" \
  "$REMOTE_CHECKER_ARG" "$REMOTE_CAM05_MODEL_ARG" "$REMOTE_BB_MODEL_ARG" "$REMOTE_GF_MODEL_ARG" \
  "$GF_SKIP_MASK_ON_EXACT_EMPTY" "$POST_CAPTURE_TOUCHES_EFFECTIVE" \
  $TAP_MUTE $TAP_MONITOR $TAP_MASK $TAP_CAM_LIGHT $TAP_HALL $WIND \
  $TAP_CAM10 $TAP_CAM04 $TAP_CAM07 $TAP_CAM11 $TAP_CAM05 \
  "$CUE_PORT" "$CUE_TOKEN" "$REMOTE_KEEP_DIR" \
  > "$DRIVER_OUTPUT_FIFO" 2>&1 <<'REMOTE' &
set -eu
PIDFILE=$1; shift
# The plan travels beside the pidfile rather than as another positional: the
# host pushes it to the same name with a .plan suffix.
PLAN_FILE="$PIDFILE.plan"
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
HID_TRACE=$1; shift
[ "$HID_TRACE" != "-" ] || HID_TRACE=""
PLAN_SPACING_MS=$1; shift
PLAN_CONTACT_MS=$1; shift
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
CAM05_X=$1; CAM05_Y=$2; shift 2
CUE_PORT=$1; CUE_TOKEN=$2; shift 2
KEEP_DIR=${1:-}

if [ "$BB_CAM05_CAPTURE_EVERY" -gt 0 ] || [ "$BB_LEFT_CAPTURE_EVERY" -gt 0 ]; then
  mkdir -p "$SAMPLE_DIR"
fi

HID_PID=""
HID_FD_OPEN=0

# Every report the runner sends, appended verbatim. The routine level has an
# oracle -- the device plan replays through the engine -- but the microroutine
# level had none but a phone, and every input bug this project has hit lives
# there: contact lengths, select spacing, and released time between two
# buttons. The stream carries its own `delay` commands, so the intended timing
# is fully recoverable from it without timestamping each line, which would put
# a clock read in the hot path.
hid_emit() {
  print -p -- "$1"
  [ -z "$HID_TRACE" ] || printf '%s\n' "$1" >> "$HID_TRACE"
}

# Snap the trace's clock to the real one. Only the hid-side `delay` commands
# are recoverable from the report stream itself, so a sequence spaced by
# wait_until looks instantaneous to a reader -- which made the first version of
# the auditor report every wall-timed action as a zero-gap button change. The
# helpers already read the monotonic clock once for their own log line, so
# reusing that value costs nothing.
# One device-local cue-helper snapshot. Loopback nc inside this same shell, so
# it costs no adb round trip -- the whole point of the helper. Returns the
# response line, or an empty string if the helper is absent or slow; a missing
# snapshot must never be able to stall the schedule, so the timeout is short and
# the caller ignores failures.
cue_snapshot() {
  [ "$CUE_PORT" != "-" ] || return 0
  printf 'GET %s\n' "$CUE_TOKEN" | toybox nc -w 1 127.0.0.1 "$CUE_PORT" 2>/dev/null | tr -d '\r'
}

hid_mark() {
  [ -z "$HID_TRACE" ] || printf '{"command":"mark","ms":%s}\n' "$1" >> "$HID_TRACE"
}

hid_release() {
  [ "$HID_FD_OPEN" -eq 1 ] || return 0
  # Report both inactive contact IDs. A count of zero makes hid-multitouch
  # stop after the first collection and can leave contact 1 stuck down.
  hid_emit '{"id":92,"command":"report","report":[1,2,0,0,0,0,0,4,0,0,0,0]}'
}

hid_down() {
  x=$1; y=$2
  # InputReader rotates the virtual device's 2400x1080 natural axes into the
  # phone's landscape viewport. This is the inverse mapping measured with the
  # system touch overlay: rawX=(1080-screenY)*20/9, rawY=screenX*9/20.
  rx=$(((1080 - y) * 20 / 9))
  ry=$((x * 9 / 20))
  hid_emit "{\"id\":92,\"command\":\"report\",\"report\":[1,1,3,$((rx % 256)),$((rx / 256)),$((ry % 256)),$((ry / 256)),0,0,0,0,0]}"
}

hid_two_down() {
  x1=$1; y1=$2; x2=$3; y2=$4
  rx1=$(((1080 - y1) * 20 / 9)); ry1=$((x1 * 9 / 20))
  rx2=$(((1080 - y2) * 20 / 9)); ry2=$((x2 * 9 / 20))
  hid_emit "{\"id\":92,\"command\":\"report\",\"report\":[1,2,3,$((rx1 % 256)),$((rx1 / 256)),$((ry1 % 256)),$((ry1 / 256)),7,$((rx2 % 256)),$((rx2 / 256)),$((ry2 % 256)),$((ry2 / 256))]}"
}

hid_second_up() {
  x1=$1; y1=$2; x2=$3; y2=$4
  rx1=$(((1080 - y1) * 20 / 9)); ry1=$((x1 * 9 / 20))
  rx2=$(((1080 - y2) * 20 / 9)); ry2=$((x2 * 9 / 20))
  # Contact Count is the number of records in this hybrid packet, not the
  # number still touching. Count 2 makes the kernel consume ID 1's explicit
  # inactive record and emit ACTION_POINTER_UP while preserving ID 0.
  hid_emit "{\"id\":92,\"command\":\"report\",\"report\":[1,2,3,$((rx1 % 256)),$((rx1 / 256)),$((ry1 % 256)),$((ry1 / 256)),4,$((rx2 % 256)),$((rx2 / 256)),$((ry2 % 256)),$((ry2 / 256))]}"
}

# The pulsed-light sweep needs the inverse of hid_two_down: contact 1 selects
# the camera and contact 0 is pulsed afterwards. Both records are always
# present so Linux consumes contact 1's release -- a report promising one
# record leaves it latched down (trap 2 in docs/device/HID-MULTITOUCH.md).
hid_cam_report() {
  f0=$1; f1=$2; x=$3; y=$4
  rx0=$(((1080 - CAM_LIGHT_Y) * 20 / 9)); ry0=$((CAM_LIGHT_X * 9 / 20))
  rx1=$(((1080 - y) * 20 / 9)); ry1=$((x * 9 / 20))
  hid_emit "{\"id\":92,\"command\":\"report\",\"report\":[1,2,$f0,$((rx0 % 256)),$((rx0 / 256)),$((ry0 % 256)),$((ry0 / 256)),$f1,$((rx1 % 256)),$((rx1 / 256)),$((ry1 % 256)),$((ry1 / 256))]}"
}

hid_cam_down()       { hid_cam_report 0 7 "$1" "$2"; }
hid_cam_light_down() { hid_cam_report 3 7 "$1" "$2"; }
hid_cam_light_up()   { hid_cam_report 0 4 "$1" "$2"; }

hid_delay() {
  # `hid` does not treat a zero duration as "no delay": Event$Builder.build
  # throws IllegalStateException("Delay has missing or invalid duration"), the
  # process exits, mksh loses the co-process, and the next `print -p` ends the
  # night. Reproduced in isolation on this phone with no game running.
  #
  # Guarded here rather than at the call site because a zero duration means
  # nothing everywhere, and the failure is fatal and silent at every emitter.
  # SWEEP_LIGHT_LEAD_MS is 0 in the shipped geometry and reaches this from more
  # than one place; pulsed_cam_burst happened to guard it and plan_emit's
  # hallraise did not, which cost night 6-22 at 18 s.
  [ "$1" -gt 0 ] || return 0
  hid_emit "{\"id\":92,\"command\":\"delay\",\"duration\":$1}"
}

sleep_ms() {
  ms=$1
  # 1000 + remainder, then strip the leading 1: a zero-padded fraction with no
  # $(printf ...) around it. Command substitution is a subshell, a subshell is
  # a fork, and a fork on this handset is ~21 ms -- the cost this file exists
  # to stop paying.
  ms_frac=$((1000 + ms % 1000))
  sleep "$((ms / 1000)).${ms_frac#1}"
}

# Runner-relative milliseconds, without a fork.
#
# `date +%s%3N` is fork+exec and costs about 21 ms on this handset: 100 calls
# took 2126 ms, and consecutive calls in a tight loop sit 22.2 ms apart on
# average (max 35). That is not a device floor -- it is the fork. `read` with a
# redirect from /proc/uptime is a shell builtin, no fork, 0.36 ms per read
# (100 reads in 36 ms), 58x cheaper. It is also monotonic, which an epoch clock
# is not: `date` can step under NTP or a settimeofday and take the schedule
# with it.
#
# Resolution is centiseconds, so this answers in 10 ms ticks. Measured against
# the shipped date-based wait over 20 targets while a night was live, landing
# error went from 34-73 ms late to 0 -- where 0 means "inside one 10 ms tick",
# not sub-millisecond. That 49-106 ms spread over the wider set is the same
# number HID-MULTITOUCH.md records as the macro anchor spread; it was the fork
# all along.
#
# This sets NOW_REL instead of echoing, because capturing an echo needs $( ),
# which is a subshell, which is the fork.
#
# 10#$c is not decoration: /proc/uptime prints two decimals, so a hundredths
# field of `08` or `09` is read as octal and the arithmetic aborts.
now_rel() {
  read nr_u nr_rest < /proc/uptime
  NOW_REL=$(( (${nr_u%.*} * 100 + 10#${nr_u#*.}) * 10 - T0_UP_MS ))
}

# Android's mksh arithmetic is signed 32-bit on this handset. Epoch
# milliseconds are already ~1.8e12, so direct arithmetic wraps. Split seconds
# from the last three digits and keep every arithmetic operand bounded.
epoch_sub_ms() {                              # EPOCH_MS DELTA_MS
  esm_seconds=${1%???}; esm_millis=${1#"$esm_seconds"}; esm_delta=$2
  esm_seconds=$((esm_seconds - esm_delta / 1000))
  esm_millis=$((10#$esm_millis - esm_delta % 1000))
  if [ "$esm_millis" -lt 0 ]; then
    esm_seconds=$((esm_seconds - 1)); esm_millis=$((esm_millis + 1000))
  fi
  esm_padded=$((1000 + esm_millis))
  EPOCH_SUB_RESULT="${esm_seconds}${esm_padded#1}"
}

epoch_diff_ms() {                             # LATER_EPOCH_MS EARLIER_EPOCH_MS
  edm_later_s=${1%???}; edm_later_ms=${1#"$edm_later_s"}
  edm_earlier_s=${2%???}; edm_earlier_ms=${2#"$edm_earlier_s"}
  EPOCH_DIFF_RESULT=$((
    (edm_later_s - edm_earlier_s) * 1000 +
    10#$edm_later_ms - 10#$edm_earlier_ms
  ))
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
  # The trace is evidence; the host pulls it after the driver stops.
  rm -f "$PIDFILE" "$READYFILE" "$STARTFILE" "$EPOCHFILE" \
    "$CAPTURE_LOCK" "$PIDFILE.left.raw" "$PIDFILE.epoch.raw" "$PLAN_FILE"
}
trap cleanup_remote EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

if [ "$HID_MODE" -eq 1 ]; then
  /system/bin/hid - |&
  HID_PID=$!
  HID_FD_OPEN=1
  hid_emit '{"id":92,"command":"register","name":"FNAF Timed Touch","vid":6353,"pid":61959,"bus":"usb","descriptor":[5,13,9,4,161,1,133,1,9,34,161,0,9,85,21,0,37,2,117,8,149,1,177,2,9,84,129,2,5,13,9,34,161,2,9,66,21,0,37,1,117,1,129,2,9,50,129,2,9,81,37,63,117,6,129,2,5,1,9,48,38,95,9,117,16,129,2,9,49,38,55,4,129,2,192,5,13,9,34,161,2,9,66,21,0,37,1,117,1,129,2,9,50,129,2,9,81,37,63,117,6,129,2,5,1,9,48,38,95,9,117,16,129,2,9,49,38,55,4,129,2,192,192,192]}'
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
    # The same instant on the monotonic clock, read immediately after so the
    # two are within one builtin of each other. `date` is what the epoch report
    # publishes and what joins to host artifacts; /proc/uptime is what the
    # schedule is then measured on. Neither is derived from the other.
    read epoch_up_u epoch_up_rest < /proc/uptime
    epoch_latch_up_ms=$(( (${epoch_up_u%.*} * 100 + 10#${epoch_up_u#*.}) * 10 ))
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
          epoch_first_match_up_ms=$epoch_latch_up_ms
          epoch_confirmations=1
          continue
        fi
        epoch_confirmations=$((epoch_confirmations + 1))
        if [ -n "$epoch_previous_clear" ]; then
          epoch_diff_ms "$epoch_first_match" "$epoch_previous_clear"
          epoch_bracket=$EPOCH_DIFF_RESULT
        else
          epoch_bracket=-1
        fi
        T0=$epoch_first_match
        T0_UP_MS=$epoch_first_match_up_ms
        # The published route's phase window is one-sided -- it tolerates a
        # late T0 and almost no early one -- so the conservative first-positive
        # edge is right for it. Minus 7 Left-Read's window is 83-267 ms, which
        # is centred, so the edge is the wrong estimator: the true HUD frame is
        # uniform inside the bracket, and taking the edge throws away half of
        # it. Centring roughly doubles how often a run lands in phase.
        if [ "$NIGHT6_LEFT" -eq 1 ] && [ "$epoch_bracket" -gt 0 ]; then
          epoch_sub_ms "$epoch_first_match" $((epoch_bracket / 2))
          T0=$EPOCH_SUB_RESULT
          # The monotonic origin moves by the same amount, so the two stay one
          # instant described twice rather than two different starts.
          T0_UP_MS=$((epoch_first_match_up_ms - epoch_bracket / 2))
          printf 'epoch centred: first match %s, bracket %s, T0 %s\n' \
            "$epoch_first_match" "$epoch_bracket" "$T0"
        fi
        epoch_diff_ms "$epoch_latch" "$T0"
        epoch_confirmation_delay=$EPOCH_DIFF_RESULT
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
    # Deliberately still `date`: this is a coarse epoch-domain deadline in a
    # loop whose every iteration already spends a screencap (0.7-2.5 s), so the
    # fork is free here, and the monotonic origin does not exist yet -- it is
    # latched by the very transition this loop is looking for.
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
  read start_up_u start_up_rest < /proc/uptime
  T0_UP_MS=$(( (${start_up_u%.*} * 100 + 10#${start_up_u#*.}) * 10 ))
fi

if [ "$NIGHT6_LEFT" -eq 1 ]; then
  # T0 is the first office-HUD frame. The exact simulator's phase window for
  # this route is 83-267 ms after the night's start, so the pilot's epoch is
  # deliberately offset from the latch rather than equal to it.
  T0=$((T0 + PILOT_OFFSET_MS))
  T0_UP_MS=$((T0_UP_MS + PILOT_OFFSET_MS))
  printf 'pilot epoch = latch + %s ms\n' "$PILOT_OFFSET_MS"
fi

wait_until() {
  # Every wall-timed boundary advances the trace's clock. Without this only
  # hid-side delays do, and a helper that spaces its reports with wait_until
  # reads back as a burst of zero-length contacts.
  hid_mark "$1"
  # The target is on the monotonic axis. The polling loop used to fork `date`
  # per iteration, so its granularity was one fork (~21 ms) and it landed
  # 34-73 ms late; reading /proc/uptime is a builtin and lands inside one
  # 10 ms tick. The structure is unchanged -- sleep to 20 ms out, then spin --
  # because the spin is what absorbs `sleep`'s own fork overshoot.
  target=$((T0_UP_MS + $1))
  while :; do
    read wu_u wu_rest < /proc/uptime
    left=$((target - (${wu_u%.*} * 100 + 10#${wu_u#*.}) * 10))
    [ "$left" -le 0 ] && return
    if [ "$left" -gt 40 ]; then
      delay=$((left - 20))
      delay_frac=$((1000 + delay % 1000))
      sleep "$((delay / 1000)).${delay_frac#1}"
    fi
  done
}

# The time of the last press, so a following action can be scheduled from
# when the game actually received it rather than from where the table put it.
LAST_PRESS_MS=0
# The last press that started a monitor flip, tracked apart from LAST_PRESS_MS
# because what it gates is the flip's animation and not the press before the
# read. A large negative start means "no flip is running", so the first cycle
# does not wait for one.
LAST_MONITOR_PRESS_MS=-100000
# When the vent light actually went down, which the plan's offset stops being
# once anything above moves it.
LIGHT_DOWN_MS=0

# The human floor (2026-08-25 decision: absolute, no override -- deliberately
# not env-overridable). The pilot may not deliver inputs a human could not:
# 350 ms press-to-press, [INFERRED] from the trainer's duel pass gate until
# the trainer trace census (tools/tracereport.mjs) supersedes it. The same
# model gate in tools/device/human-gate.mjs supersedes this for emitted plans;
# this remains only as a backstop for dormant/unpriced branches.
HUMAN_FLOOR_MS=350
# Tracked apart from LAST_PRESS_MS, whose zero start and receipt-time uses
# belong to scheduling; a gate must not change what schedules.
HF_LAST_PRESS_MS=-100000

human_floor_abort() {
  echo "HUMAN FLOOR: $2 lands $1 ms after the previous press (< $HUMAN_FLOOR_MS ms)" >&2
  echo "refusing: the pilot may not deliver inhumanly timed inputs (2026-08-25, no override)" >&2
  exit 44
}

human_floor_check() {
  # The sole selectable controller path has passed the model gate, and its
  # intentional compound rows contain 120/180 ms actuator boundaries. The old
  # scalar gap check made that accepted plan abort at its first monitor press
  # and would reject every camera sweep. Retain it only for dormant unpriced
  # branches; the plan path is covered by replay, input-gap, interpreter and
  # actuator checks.
  [ "$NIGHT6_LEFT" -eq 1 ] && return 0
  hf_gap=$(($1 - HF_LAST_PRESS_MS))
  [ "$hf_gap" -ge "$HUMAN_FLOOR_MS" ] || human_floor_abort "$hf_gap" "$2"
  HF_LAST_PRESS_MS=$1
}

press_at() {
  offset=$1; x=$2; y=$3; label=$4
  wait_until "$offset"
  now_rel
  actual=$NOW_REL
  human_floor_check "$actual" "$label"
  LAST_PRESS_MS=$actual
  case "$label" in monitor*) LAST_MONITOR_PRESS_MS=$actual ;; esac
  printf '%6d ms  %s\n' "$actual" "$label"
  hid_mark "$actual"
  if [ "$PRESS_MODE" = "tap" ]; then
    input tap "$x" "$y"
  elif [ "$HID_MODE" -eq 1 ]; then
    # The contact is timed inside the hid process. That is not a convenience:
    # `sleep` and `date` are fork+exec on this phone, and timing the release
    # from the shell instead cost one fork per press and drifted the cycle
    # anchor 434 ms -- the schedule fell apart within the opening. hid_delay
    # also measures from when the press is *delivered*, so a backlogged stream
    # still produces a full-length contact.
    hid_down "$x" "$y"
    hid_delay "$TAP_CONTACT_MS"
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
  now_rel
  actual=$NOW_REL
  human_floor_check "$actual" "$label"
  printf '%6d ms  %s (%d ms)\n' "$actual" "$label" "$duration"
  hid_mark "$actual"
  if [ "$HID_MODE" -eq 1 ]; then
    hid_down "$x" "$y"
    hid_delay "$duration"
    hid_release
  else
    input swipe "$x" "$y" "$x" "$y" "$duration"
  fi
}

# The cams-up luma, measured on this phone.
#
# Across night 6-34's poller trace the snapshot sits at 225-229 for the whole
# cams-up stretch of every cycle and drops to 0-107 for the office window. The
# two populations do not overlap anywhere in 1818 samples, so the line goes
# between them rather than near either.
CUE_CAMS_UP_LUMA=180

# ld_ prefixes because this calls press_at, and the runner's functions share one
# global scope: plain `offset` and `label` came back clobbered, so the vent
# light's own log line was printed as "monitor-verify (contact 0 down)".
light_down_at() {
  ld_offset=$1; ld_label=$2
  # Verify the anchor's monitor press actually landed, before spending the vent
  # light on a frame that would be the camera feed.
  #
  # A lost monitor press desyncs the toggle for the rest of the night, and the
  # only thing that ever noticed was the classifier one full cycle later -- so
  # every desync cost a cycle even once recovery existed. The helper answers the
  # same question in 42 ms, which is affordable here, and a correction now costs
  # the flip instead of the cycle.
  if [ "$CUE_PORT" != "-" ]; then
    # Never sample the monitor inside its own flip.
    #
    # The plan reads at exactly MONITOR_ANIM_DOWN from the cycle base while the
    # anchor's press lands 110-180 ms into the cycle, so without this the
    # sample always falls inside the animation it is checking. Night 6-38 sampled
    # 214 ms in, believed the camera feed still on screen, and "corrected" a
    # monitor that was already coming down -- and that press was dropped by the
    # same flip, so the run spent its remaining 58 s inverted. The corrector
    # caused the desync it was looking for.
    #
    # The gate is measured, not assumed. Across nights 6-36 to 6-38 the cue helper
    # still reported luma >= CUE_CAMS_UP_LUMA up to 202 ms after a lowering
    # press and never later, so one MONITOR_ANIM_DOWN leaves about 165 ms of
    # margin. It costs the read the press's own lateness, which the plan's
    # 416 ms of slack before the next instruction absorbs.
    wait_until $((LAST_MONITOR_PRESS_MS + MONITOR_ANIM_DOWN_MS))
    cue_luma=$(cue_snapshot | sed -n 's/.* luma=\([0-9]*\).*/\1/p')
    # Confirm before correcting: one sample cannot tell a flash from the cams.
    #
    # The gate above fixed *when* this samples. It did not fix that a single
    # reading decides. Steady cams-up is a tight band -- 225-250, median 227
    # across nights 6-40, 6-41 and 6-42 -- while saturated `luma 255` is a
    # separate and short-lived population: runs of one or two samples, and a
    # third of them are already below the threshold by the very next sample.
    # Both clear CUE_CAMS_UP_LUMA, so the correction cannot distinguish them.
    #
    # Every correction on file triggered on 255, and 255 never appears beside a
    # classifier read. That is the shape of a flash -- a camera light pulse or a
    # hall flash washing the sensor pixel -- not a monitor that is up. Night
    # 6-38's correction invented the desync it was looking for this way, and
    # night 6-42 corrected at 17.876 s on a 255 and was inverted by 30.38 s.
    #
    # A second read costs 59 ms against the ~416 ms of slack the plan leaves
    # before the next instruction, and a transient does not survive it.
    if [ -n "$cue_luma" ] && [ "$cue_luma" -ge "$CUE_CAMS_UP_LUMA" ]; then
      cue_luma_confirm=$(cue_snapshot | sed -n 's/.* luma=\([0-9]*\).*/\1/p')
      if [ -z "$cue_luma_confirm" ] || [ "$cue_luma_confirm" -lt "$CUE_CAMS_UP_LUMA" ]; then
        now_rel
        actual=$NOW_REL
        printf '%6d ms  cue read %s then %s; a transient, not the cams -- not correcting\n' \
          "$actual" "$cue_luma" "${cue_luma_confirm:-unreadable}"
        cue_luma=0
      fi
    fi
    if [ -n "$cue_luma" ] && [ "$cue_luma" -ge "$CUE_CAMS_UP_LUMA" ]; then
      now_rel
      actual=$NOW_REL
      printf '%6d ms  cams still up at the read (luma %s); correcting in-cycle\n' \
        "$actual" "$cue_luma"
      hid_mark "$actual"
      press_at $((actual + FUSION_POLL_MS)) "$MONITOR_X" "$MONITOR_Y" monitor-verify
      ld_offset=$((LAST_PRESS_MS + TAP_CONTACT_MS + MONITOR_ANIM_DOWN_MS))
    fi
  fi
  wait_until "$ld_offset"
  now_rel
  actual=$NOW_REL
  # The capture is placed from here, not from the plan's offset: see plan_step.
  LIGHT_DOWN_MS=$actual
  printf '%6d ms  %s (contact 0 down)\n' "$actual" "$ld_label"
  hid_mark "$actual"
  hid_down "$CAM_LIGHT_X" "$CAM_LIGHT_Y"
}

light_cam_at() {
  offset=$1; x=$2; y=$3; label=$4
  wait_until "$offset"
  now_rel
  actual=$NOW_REL
  printf '%6d ms  %s (contact 1 tap)\n' "$actual" "$label"
  hid_mark "$actual"
  hid_two_down "$CAM_LIGHT_X" "$CAM_LIGHT_Y" "$x" "$y"
  hid_delay 100
  hid_second_up "$CAM_LIGHT_X" "$CAM_LIGHT_Y" "$x" "$y"
}

light_up_at() {
  offset=$1; label=$2
  wait_until "$offset"
  now_rel
  actual=$NOW_REL
  printf '%6d ms  %s (contacts up)\n' "$actual" "$label"
  hid_mark "$actual"
  hid_release
}

capture_lit_at() {
  offset=$1; name=$2; label=$3
  wait_until "$offset"
  now_rel
  actual=$NOW_REL
  printf '%6d ms  capture-%s %s\n' "$actual" "$label" "$name"
  hid_mark "$actual"
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
  now_rel
  actual=$NOW_REL
  printf '%6d ms  capture-%s-unlit %s\n' "$actual" "$label" "$name"
  hid_mark "$actual"
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
  offset=$1; mask_gap=$2; label=$3
  wait_until "$offset"
  now_rel
  actual=$NOW_REL
  printf '%6d ms  %s start snapshot\n' "$actual" "$label" >&2
  hid_mark "$actual"

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
  now_rel
  actual=$NOW_REL
  printf '%6d ms  %s snapshot latched; mask now\n' "$actual" "$label" >&2
  hid_mark "$actual"
  hid_release
  # Restore the prophylactic Golden Freddy flick. The earlier diagnosis blamed
  # a dropped mask toggle for the stuck-mask nights, but the HID/video census
  # identified the press the game lost: the MONITOR raise after mask-off, 9/15
  # below 180 ms and 0/17 at or above it. The branch macro now owns that safe
  # mask-off -> raise seam. Here the plan's one-poll release still separates
  # the vent light from mask-on so Fusion cannot read one finger moving between
  # buttons.
  hid_delay "$mask_gap"
  hid_down "$MASK_X" "$MASK_Y"
  hid_delay "$TAP_CONTACT_MS"
  hid_release
  wait "$capture_pid" || true
  classification=$("$CHECKER" classify "$BB_MODEL" < "$capture_raw" 2>/dev/null) || \
    classification='unknown capture-or-classifier-error'
  # Was the monitor actually down when this frame was taken?
  #
  # Every `unknown` this run has produced scored 20-35, and the frames rendered
  # out of nights 6-22 to 6-27 show why: they are the CAMERA FEED, not the office. The
  # anchor's monitor press did not take effect, so the vent light press was the
  # camera light and the classifier was handed CAM 11 or the map. Nothing
  # observed that, so the pilot never recovered.
  #
  # This costs no extra capture: it is the same raw frame, asked a different
  # question. The camera map's lime selection highlight lives on the right of
  # the screen; the office's own green LIGHT button is at x~350 and outside this
  # ROI. Measured on the frames from nights 6-25 to 6-26: office 0-1 bps, camera feed
  # 70-140 bps. The threshold sits two orders of magnitude from both.
  #
  # Reported, not yet acted on -- the intermittency is what needs measuring
  # first, and a schedule that reacts to a signal nobody has watched is how this
  # runner acquired most of its scars.
  # Only asked when it can change the decision. A confident `empty` or `bb` is
  # an office frame by construction -- the model's classes are office frames --
  # and the clear branch's mask-off press has a hard deadline at base+1300 ms
  # that a second checker invocation blew by about 100 ms on night 6-29.
  monitor_seen='cams=office-by-classification'
  case "$classification" in
    empty\ *|bb\ *) ;;
    *)
      monitor_seen=$("$CHECKER" match 1300 350 2300 950 4 100 255 100 255 0 99 30 \
        < "$capture_raw" 2>/dev/null) || monitor_seen=unreadable
      case "$monitor_seen" in
        match) monitor_seen='cams=UP-DESYNCED' ;;
        clear) monitor_seen='cams=down' ;;
        *)     monitor_seen='cams=unreadable' ;;
      esac
      ;;
  esac
  # Keep the frames that are worth labelling, and only those.
  #
  # Golden Freddy is one run in ten before 2 AM and his office appearance is a
  # translucent figure, which is why the provisional model separates him by a
  # margin of 3 where Balloon Boy's is 18-21 -- it was built from a single
  # appearance. More positives cannot be requested; they have to be caught. A
  # confident `empty` is the one class we already have plenty of, so retaining
  # every non-empty read costs a few frames a night and turns each rare event
  # into training data instead of a line in a log.
  #
  # The screenrecord capture cannot do this job: it is downscaled to 1280x576
  # and h264-compressed, while every model here is built on 2400x1080 raw
  # screencaps. A frame extracted from the video is not the same measurement.
  case "$classification" in
    empty\ *) [ "$HID_LEFT_DEBUG_RAW" != "-" ] || rm -f "$capture_raw" ;;
    *)
      if [ -n "$KEEP_DIR" ]; then
        mkdir -p "$KEEP_DIR"
        cp "$capture_raw" "$KEEP_DIR/$(printf '%06d' "$actual")-${classification%% *}.raw" \
          2>/dev/null || true
      fi
      [ "$HID_LEFT_DEBUG_RAW" != "-" ] || rm -f "$capture_raw"
      ;;
  esac
  rm -f "$CAPTURE_LOCK"
  now_rel
  actual=$NOW_REL
  # Logged, never acted on: this is the labelled data the helper's own threshold
  # needs before anything can be read from it. `luma` is its left-opening
  # value and `ageUs` says how stale the projected frame was.
  cue_line=""
  [ "$CUE_PORT" = "-" ] || cue_line=" cue[$(cue_snapshot | sed -n 's/.*luma=\([0-9]*\).*cam5=\([0-9]*\).*ageUs=\([0-9]*\).*/luma=\1 cam5=\2 age=\3us/p')]"
  printf '%6d ms  classify-bb-left %s %s%s\n' "$actual" "$classification" "$monitor_seen" "$cue_line" >&2
  hid_mark "$actual"
}

# Device constants. The plan carries the schedule; these are properties of the
# phone that no simulator can emit, so they stay here and are named.
#
# The select leads its light pulse by this much inside a sweep burst.
#
# Zero, and not by preference: at the 120 ms spacing hid-sweep-probe.sh landed,
# 20 ms has to stay released between selects, which fixes the select at 100 ms
# -- exactly the floor HID-MULTITOUCH.md's verified sequence requires. Any
# positive lead spends that budget twice and puts the light pulse under the
# same floor, which is how it came to be 90 ms. With no lead the select and its
# light land in one report and both contacts get the full 100 ms.
#
# This is not the geometry hid-sweep-probe.sh proved 4/4 -- that one had the
# 10 ms lead and the 90 ms pulse. Re-probe before trusting a device run.
SWEEP_LIGHT_LEAD_MS=0
# A tap's contact. Named because the driver has to reason about when a tap
# *finishes*, not just when it starts.
TAP_CONTACT_MS=100
# Fusion polls touch once per frame, so two different controls with no released
# time between them can read as one finger moving from one to the other and the
# second never fires. Mirrors MIN_RELEASED_MS in test-hid-trace.mjs.
#
# This is the floor below which the auditor calls a trace defective. It is not
# the number to *design* to: the plan is built to a full 30 Hz Fusion poll and
# test-recipe.mjs asserts 33 ms between every pair of controls inside a cycle.
# Where the runner chooses a gap rather than checks one, it uses FUSION_POLL_MS,
# so the seam between two cycles gets the same guarantee as everything within
# one. Designing to the floor is how a 20 and a 33 end up meaning the same
# thing in two files and then quietly stop agreeing.
MIN_RELEASED_MS=20
FUSION_POLL_MS=33
# src/config.js MONITOR_ANIM_DOWN = 22 frames. The office is not interactive
# until the flip finishes, so a corrective lower has to be waited out.
MONITOR_ANIM_DOWN_MS=367
# The vent read starts its capture this long after the light goes down.
# screencap latches 163-348 ms after it starts and the vent needs ~270 ms to
# draw, so this puts the frame 363-548 ms past the light: past the point an
# unlit opening could be read as a confident `inside`, and early enough that
# the classifier still answers before the cycle's cut-off.
READ_CAPTURE_DELAY_MS=200
# Balloon Boy needs five five-second rolls to reach the office, so nothing
# before this is him. It is the only thing that separates a dropped vent-light
# press from marker 123 on a dark frame, because the two look identical: g96
# forces `lit?` to zero and g301/g303 stop the vent lights answering once he is
# inside, so "the lamp is dark" is a *consequence* of him being there as well as
# of the press being lost.
BB_EARLIEST_INSIDE_MS=25000
# How many consecutive unlit reads mean the light is never coming back.
#
# Three ways the lamp goes dark, and only one of them ends the night: a dropped
# light press (recovers on the next read); `in danger` latched by an office
# encounter (g443-447 -- g75/g76/g77 block every light until the mask resolves
# it, seconds); and Balloon Boy at 123 (permanent, g96/g301/g303). Night 6-43
# hit the second: Mangle's overlay slid through the office, the fail-closed
# mask cleared her exactly as the strategy says, and three dark reads --
# spanning one encounter -- were read as "BB inside" and aborted a night whose
# final frames show a live camera feed. An encounter's darkness spans two to
# three 10 s attack cycles at most, so the streak that means marker 123 has to
# be longer than any encounter can account for.
NOLIGHT_STREAK_MAX=5

# Which physical control the plan means. A name the runner cannot press is a
# plan it must not half-execute.
plan_control_xy() {
  case "$1" in
    monitor) PX=$MONITOR_X; PY=$MONITOR_Y ;;
    mask)    PX=$MASK_X;    PY=$MASK_Y ;;
    wind)    PX=$WIND_X;    PY=$WIND_Y ;;
    cam4)    PX=$CAM04_X;   PY=$CAM04_Y ;;
    cam5)    PX=$CAM05_X;   PY=$CAM05_Y ;;
    cam7)    PX=$CAM07_X;   PY=$CAM07_Y ;;
    cam10)   PX=$CAM10_X;   PY=$CAM10_Y ;;
    cam11)   PX=$CAM11_X;   PY=$CAM11_Y ;;
    *) echo "the plan names a control this runner cannot press: $1" >&2; exit 47 ;;
  esac
}

# One camera of the sweep, written into the macro the hid process is already
# executing. No wait_until: see pulsed_sweep_at.
# The select leads the light so the camera is already the selected feed when
# the light lands on it. hid-sweep-probe.sh proved this geometry 4/4.
# Zero: the light goes down in the same report as the camera select, so both
# contacts get the full `contact` ms. HID-MULTITOUCH.md's verified sequence
# holds the light for at least 100-120 ms "so the 30 Hz Fusion runtime sees
# it"; leading by 10 ms left the light at 90 and put it under that floor.
SWEEP_LIGHT_LEAD_MS=0

# Resolve a plan control name to this device's calibrated coordinates.
plan_control_xy() {
  case "$1" in
    monitor) PX=$MONITOR_X;   PY=$MONITOR_Y ;;
    mask)    PX=$MASK_X;      PY=$MASK_Y ;;
    wind)    PX=$WIND_X;      PY=$WIND_Y ;;
    hall)    PX=$HALL_X;      PY=$HALL_Y ;;
    ventl)   PX=$CAM_LIGHT_X; PY=$CAM_LIGHT_Y ;;
    cam10)   PX=$CAM10_X;     PY=$CAM10_Y ;;
    cam4)    PX=$CAM04_X;     PY=$CAM04_Y ;;
    cam7)    PX=$CAM07_X;     PY=$CAM07_Y ;;
    cam11)   PX=$CAM11_X;     PY=$CAM11_Y ;;
    cam5)    PX=$CAM05_X;     PY=$CAM05_Y ;;
    *) echo "unknown plan control: $1" >&2; exit 47 ;;
  esac
}

pulsed_cam_burst() {
  x=$1; y=$2; contact=$3
  # `stunCam` refreshes on every frame the light is on while that camera is
  # selected, so contact 0 does not have to be held across the sweep: select
  # first, then pulse. That is one contact of flashlight per camera instead of
  # a 790 ms hold, which is the difference between fitting night 6's
  # 3000-frame budget and outspending it. The select leads the light by
  # SWEEP_LIGHT_LEAD_MS; hid-sweep-probe.sh proved this geometry 4/4.
  if [ "$SWEEP_LIGHT_LEAD_MS" -gt 0 ]; then
    hid_cam_down "$x" "$y"
    hid_delay "$SWEEP_LIGHT_LEAD_MS"
  fi
  hid_cam_light_down "$x" "$y"
  hid_delay $((contact - SWEEP_LIGHT_LEAD_MS))
  hid_cam_light_up "$x" "$y"
}

# `spacing` and `contact` are the plan's; `cams` is its comma-separated list.
pulsed_sweep_at() {
  sweep_start=$1; spacing=$2; contact=$3; cams=$4; sweep_label=$5
  # A sweep is successive presses at $spacing, so the floor applies inside it
  # as well as at its edges. Checked before waiting: an inhuman sweep is known
  # from its arguments, and refusing early beats refusing mid-macro.
  #
  # Same arm as human_floor_check, and it has to be stated again because this
  # call site reaches human_floor_abort DIRECTLY rather than through it. That
  # omission is not hypothetical: it killed the first real Night 1 attempt
  # (2026-08-26, `n1-validate-1607`) at `sweep slots lands 120 ms after the
  # previous press`. The 120 ms is the plan's own DEVICE_SPACING_MS -- the
  # spacing this phone has landed 4/4 and the model gate priced under human
  # slack -- so the scalar floor was refusing the accepted schedule, which is
  # exactly the confusion the gate was introduced to end.
  if [ "$NIGHT6_LEFT" -ne 1 ]; then
    [ "$spacing" -ge "$HUMAN_FLOOR_MS" ] || human_floor_abort "$spacing" "$sweep_label slots"
  fi
  wait_until "$sweep_start"
  now_rel
  actual=$NOW_REL
  human_floor_check "$actual" "$sweep_label"
  hf_slots=$(printf '%s' "$cams" | tr -cd , | wc -c | tr -d ' ')
  HF_LAST_PRESS_MS=$((actual + hf_slots * spacing))
  printf '%6d ms  %s (%s, %d ms apart, light pulsed after each)\n' \
    "$actual" "$sweep_label" "$cams" "$spacing"
  hid_mark "$actual"
  # The whole sweep is one uninterrupted macro, exactly as hid-sweep-probe.sh
  # replays it -- and that probe landed 4/4 complete traces at this spacing.
  # The shell only positions the start. Two other arrangements were measured
  # and both put the spacing under the 120 ms the phone accepts, after which
  # the game renders CAM 07 alone: wall-timing every report inside the sweep
  # jittered it to 90-160 ms because wait_until placed every select on the
  # shell's clock, and mixing a wall-timed start with hid-side contact delays
  # gave 105-112 ms because the hid delays elapse concurrently with the shell's
  # wait instead of adding to it. Each camera costs `spacing` ms of hid time: a `contact` ms
  # select with the light pulsed inside it, then the remainder released before
  # the next select.
  sweep_rest=$cams
  sweep_first=1
  while [ -n "$sweep_rest" ]; do
    sweep_cam=${sweep_rest%%,*}
    case "$sweep_rest" in
      *,*) sweep_rest=${sweep_rest#*,} ;;
      *)   sweep_rest= ;;
    esac
    [ "$sweep_first" -eq 1 ] || hid_delay $((spacing - contact))
    sweep_first=0
    plan_control_xy "cam$sweep_cam"
    pulsed_cam_burst "$PX" "$PY" "$contact"
  done
  # Resynchronise the shell with the hid stream. The macro is scheduled to end
  # on the next cycle's anchor, and the simulator will not let it end earlier:
  # one frame of tail costs 272 of 400 nights, because this stun has to bridge
  # the five-tick mask with nothing to spare. So the anchor's monitor press is
  # written while the macro is still draining, is delivered late, and -- since
  # its contact is measured from when the shell wrote it -- gets released
  # early. A 73 ms contact is dropped, the cams stay up, and the frame the
  # classifier is then handed is the CAM 11 feed. Waiting out the macro costs
  # the press a few milliseconds and buys it a real contact.
  wait_until $((sweep_start + 2 * spacing + contact))
}

hall_reset_and_raise_at() {
  offset=$1; duration=$2; label=$3
  wait_until "$offset"
  now_rel
  actual=$NOW_REL
  human_floor_check "$actual" "$label"
  printf '%6d ms  %s (hall pulse under the raise)\n' "$actual" "$label"
  hid_mark "$actual"
  # The table presses the hall light and the monitor on the same frame. Doing
  # them sequentially would push the raise 90 ms late and the following sweep
  # inside MONITOR_ANIM_UP, so hold the light on contact 0 and tap the monitor
  # on contact 1 -- the verified two-contact primitive.
  # Wall-timed for the same reason as pulsed_cam_at.
  hid_down "$HALL_X" "$HALL_Y"
  wait_until $((offset + 10))
  # This is a monitor press too, and it starts a flip like any other, so a read
  # after it must wait the animation out. See light_down_at.
  LAST_MONITOR_PRESS_MS=$((offset + 10))
  hid_two_down "$HALL_X" "$HALL_Y" "$MONITOR_X" "$MONITOR_Y"
  # The monitor gets the plan's full contact; the hall light keeps it plus the
  # lead. wait_until can still return up to one 10 ms tick late, and a
  # measured run held this 83 ms.
  wait_until $((offset + SWEEP_LIGHT_LEAD_MS + duration))
  hid_second_up "$HALL_X" "$HALL_Y" "$MONITOR_X" "$MONITOR_Y"
  hid_release
}

# Mask off, then raise after the measured-safe press-to-press gap. Keeping both
# boundaries inside one hid report stream prevents shell launch spread from
# compressing the seam back into the 9/15 loss band. MODE is `up` or `hall`;
# the latter performs the usual two-contact hall pulse under the raise.
mask_and_raise_at() {
  offset=$1; gap=$2; mode=$3; duration=$4; label=$5
  [ "$gap" -ge "$TAP_CONTACT_MS" ] || {
    echo "maskraise gap $gap ms is shorter than its $TAP_CONTACT_MS ms mask contact" >&2
    exit 47
  }
  wait_until "$offset"
  now_rel
  actual=$NOW_REL
  human_floor_check "$actual" "$label"
  printf '%6d ms  %s (mask off, %d ms to raise)\n' "$actual" "$label" "$gap"
  hid_mark "$actual"
  hid_down "$MASK_X" "$MASK_Y"
  hid_delay "$TAP_CONTACT_MS"
  hid_release
  hid_delay $((gap - TAP_CONTACT_MS))
  LAST_MONITOR_PRESS_MS=$((offset + gap))
  if [ "$mode" = hall ]; then
    hid_down "$HALL_X" "$HALL_Y"
    [ "$SWEEP_LIGHT_LEAD_MS" -le 0 ] || hid_delay "$SWEEP_LIGHT_LEAD_MS"
    hid_two_down "$HALL_X" "$HALL_Y" "$MONITOR_X" "$MONITOR_Y"
    hid_delay "$duration"
    hid_second_up "$HALL_X" "$HALL_Y" "$MONITOR_X" "$MONITOR_Y"
    hid_release
  else
    [ "$mode" = up ] || { echo "unknown maskraise mode: $mode" >&2; exit 47; }
    hid_down "$MONITOR_X" "$MONITOR_Y"
    hid_delay "$TAP_CONTACT_MS"
    hid_release
  fi
}

# --- the plan interpreter -----------------------------------------------------
#
# recipe.mjs emits the cycle table from the exact simulator and the host pushes
# it here. Everything above this line is a device primitive; everything the
# schedule says arrives in the file. There is one copy of the table, and it is
# not this one.

# The offset of a cycle's first instruction, so the opening can be slipped
# relative to whatever the plan actually starts with.
plan_first_offset() {
  pf_cycle=$1; pf_in=0
  while read -r c1 c2 _rest <&9; do
    if [ "$c1" = '#cycle' ]; then
      if [ "$c2" = "$pf_cycle" ]; then pf_in=1; else pf_in=0; fi
      continue
    fi
    [ "$pf_in" -eq 1 ] || continue
    printf '%s\n' "$c1"
    return 0
  done 9< "$PLAN_FILE"
  echo "the plan has no cycle named $pf_cycle" >&2
  exit 47
}

# One instruction. SLIP is the epoch latch's cost; it is absorbed by the first
# wind hold, whose start moves but whose end does not -- the sweep after it is
# anchored to that end, not to the wind's start.
plan_step() {
  ps_base=$1; ps_at=$2; ps_kind=$3; ps_a=$4; ps_b=$5; ps_c=$6
  ps_when=$((ps_base + ps_at + SLIP))
  case "$ps_kind" in
    tap)
      plan_control_xy "$ps_a"
      press_at "$ps_when" "$PX" "$PY" "$ps_a"
      ;;
    hold)
      plan_control_xy "$ps_a"
      hold_at "$ps_when" "$PX" "$PY" $((ps_b - SLIP)) "$ps_a"
      SLIP=0
      ;;
    hall)
      hold_at "$ps_when" "$HALL_X" "$HALL_Y" "$ps_a" flash-hall
      ;;
    hallraise)
      hall_reset_and_raise_at "$ps_when" "$ps_a" hall-raise
      ;;
    maskraise)
      mask_and_raise_at "$ps_when" "$ps_a" "$ps_b" "$ps_c" mask-raise
      ;;
    sweep)
      pulsed_sweep_at "$ps_when" "$ps_a" "$ps_b" "$ps_c" sweep
      ;;
    read)
      # The light's end is a device readiness boundary -- screencap's first
      # output byte -- not a schedule value, so the plan's nominal duration is
      # a budget the capture has to fit inside rather than a time to obey.
      [ "$ps_a" -ge $((READ_CAPTURE_DELAY_MS + 348)) ] || {
        echo "the plan budgets ${ps_a} ms of vent light; the capture needs " \
             "$((READ_CAPTURE_DELAY_MS + 348))" >&2
        exit 47
      }
      light_down_at "$ps_when" left-vent-light
      # From when the light actually went down, not from where the plan put it.
      # READ_CAPTURE_DELAY_MS is a position in the vent-light ramp -- the only
      # control over where the classifier's frame lands, and moving it is what
      # produced the `inside` and `unknown` misreads -- so it has to follow the
      # light. Both the flip gate above and the in-cycle correction can move it,
      # and the correction moves it far enough that this used to capture before
      # the light was even down.
      classify_left_and_queue_mask_at \
        $((LIGHT_DOWN_MS + READ_CAPTURE_DELAY_MS)) "$ps_b" left-view
      ;;
    *)
      echo "the plan names an instruction this runner cannot execute: $ps_kind" >&2
      exit 47
      ;;
  esac
}

# The hid time one instruction consumes, so the next one's delay can be
# computed from the plan's offsets rather than re-derived.
plan_span() {
  pn_kind=$1; pn_a=$2; pn_b=$3; pn_c=${4:-0}
  case "$pn_kind" in
    tap|hold)  PLAN_SPAN=$pn_b ;;
    hall)      PLAN_SPAN=$pn_a ;;
    hallraise) PLAN_SPAN=$((SWEEP_LIGHT_LEAD_MS + pn_a)) ;;
    maskraise)
      if [ "$pn_b" = hall ]; then
        PLAN_SPAN=$((pn_a + SWEEP_LIGHT_LEAD_MS + pn_c))
      else
        PLAN_SPAN=$((pn_a + TAP_CONTACT_MS))
      fi
      ;;
    sweep)     PLAN_SPAN=$((2 * pn_a + pn_b)) ;;
    *) echo "the plan names an instruction with no known span: $pn_kind" >&2
       exit 47 ;;
  esac
}

# One instruction as hid reports only. No wait_until anywhere: inside a macro
# the hid process owns every boundary, which is the entire point of one.
plan_emit() {
  pe_kind=$1; pe_a=$2; pe_b=$3; pe_c=$4
  case "$pe_kind" in
    tap|hold)
      plan_control_xy "$pe_a"
      hid_down "$PX" "$PY"
      hid_delay "$pe_b"
      hid_release
      ;;
    hall)
      hid_down "$HALL_X" "$HALL_Y"
      hid_delay "$pe_a"
      hid_release
      ;;
    hallraise)
      hid_down "$HALL_X" "$HALL_Y"
      # Guarded exactly as pulsed_cam_burst guards the same value. The lead is
      # legitimately zero; a zero *gap* would be a defect, and hid_delay cannot
      # tell them apart, so the call site that knows does the guarding.
      [ "$SWEEP_LIGHT_LEAD_MS" -le 0 ] || hid_delay "$SWEEP_LIGHT_LEAD_MS"
      hid_two_down "$HALL_X" "$HALL_Y" "$MONITOR_X" "$MONITOR_Y"
      hid_delay "$pe_a"
      hid_second_up "$HALL_X" "$HALL_Y" "$MONITOR_X" "$MONITOR_Y"
      hid_release
      ;;
    maskraise)
      # Recovery may know from the retained frame that the mask is already off
      # (a mask press cannot land with the cams up). Preserve the compound's
      # timing in that case, but omit the toggle that would put it on.
      [ "$pe_a" -gt "$TAP_CONTACT_MS" ] || {
        echo "maskraise gap $pe_a ms leaves no released time after its mask contact" >&2
        exit 47
      }
      if [ "${MASK_ALREADY_OFF:-0}" -eq 0 ]; then
        hid_down "$MASK_X" "$MASK_Y"
        hid_delay "$TAP_CONTACT_MS"
        hid_release
        hid_delay $((pe_a - TAP_CONTACT_MS))
      else
        hid_delay "$pe_a"
      fi
      if [ "$pe_b" = hall ]; then
        hid_down "$HALL_X" "$HALL_Y"
        [ "$SWEEP_LIGHT_LEAD_MS" -le 0 ] || hid_delay "$SWEEP_LIGHT_LEAD_MS"
        hid_two_down "$HALL_X" "$HALL_Y" "$MONITOR_X" "$MONITOR_Y"
        hid_delay "$pe_c"
        hid_second_up "$HALL_X" "$HALL_Y" "$MONITOR_X" "$MONITOR_Y"
        hid_release
      else
        [ "$pe_b" = up ] || { echo "unknown maskraise mode: $pe_b" >&2; exit 47; }
        hid_down "$MONITOR_X" "$MONITOR_Y"
        hid_delay "$TAP_CONTACT_MS"
        hid_release
      fi
      ;;
    sweep)
      pe_rest=$pe_c
      pe_first=1
      while [ -n "$pe_rest" ]; do
        pe_cam=${pe_rest%%,*}
        case "$pe_rest" in
          *,*) pe_rest=${pe_rest#*,} ;;
          *)   pe_rest= ;;
        esac
        [ "$pe_first" -eq 1 ] || hid_delay $((pe_a - pe_b))
        pe_first=0
        plan_control_xy "cam$pe_cam"
        pulsed_cam_burst "$PX" "$PY" "$pe_b"
      done
      ;;
    *)
      echo "the plan names an instruction that cannot go in a macro: $pe_kind" >&2
      exit 47
      ;;
  esac
}

# A contiguous window of one cycle, delivered as a single hid macro.
#
# The shell wall-times only the window's start and then waits it out; every
# boundary inside is a hid_delay. `getevent` on this phone measured hid_delay
# holding the intended period to a 0.76 ms stdev, 116.4-121.9 ms across 60
# contacts at a 120 ms period, where wait_until overshoots 49-93 ms. The route
# has about 100 ms of total lateness margin, and the exact simulator prices the
# difference at 152/300 nights against 282-300/300: it is the spread that costs
# nights, not the mean, and a wall-timed boundary re-rolls the spread at every
# single action.
#
# The window is capped at one cycle so the shell re-syncs at each anchor. That
# is one wall-timed boundary per cycle instead of one per action, and it bounds
# how long input keeps landing on whatever is in front if the game dies inside
# a macro -- a class no simulator can price, so it is bounded rather than
# reasoned about.
run_macro() {
  rm_cycle=$1; rm_base=$2; rm_skip=$3; rm_limit=$4; rm_floor=${5:-0}
  # A macro cannot absorb the epoch slip: the slip is taken out of a wind hold
  # whose *end* must not move, and inside a macro the offsets are relative.
  [ "$SLIP" -eq 0 ] || {
    echo 'a macro cannot absorb the epoch slip; step that cycle instead' >&2
    exit 47
  }
  rm_idx=0; rm_in=0; rm_started=0; rm_cursor=0; rm_shift=0
  while read -r c1 c2 c3 c4 c5 <&9; do
    if [ "$c1" = '#cycle' ]; then
      if [ "$c2" = "$rm_cycle" ]; then rm_in=1; else rm_in=0; fi
      continue
    fi
    [ "$rm_in" -eq 1 ] || continue
    [ -n "$c1" ] || continue
    rm_idx=$((rm_idx + 1))
    [ "$rm_idx" -gt "$rm_skip" ] || continue
    [ "$rm_idx" -le "$rm_limit" ] || continue
    # The read needs a screencap and the classifier, which live in the shell.
    # A window containing one is a programming error, not a runtime condition.
    [ "$c2" != read ] || {
      echo 'a read cannot go in a macro: it needs the classifier' >&2
      exit 47
    }
    if [ "$rm_started" -eq 0 ]; then
      # The window may not open inside a contact the shell is still holding.
      # Shifting the whole macro keeps every released gap the plan guarantees;
      # shifting only its first instruction would eat the next one.
      rm_start=$((rm_base + c1))
      [ "$rm_start" -ge "$rm_floor" ] || rm_start=$rm_floor
      rm_shift=$((rm_start - rm_base - c1))
      wait_until "$rm_start"
      now_rel
      actual=$NOW_REL
      printf '%6d ms  macro %s[%d..%d]\n' "$actual" "$rm_cycle" "$rm_skip" "$rm_limit"
      rm_started=1
    else
      # A non-positive gap here means the plan overlaps itself, and hid_delay's
      # guard would swallow it silently -- the same silence that cost night 6-22.
      # A zero *lead* is legitimate; a zero *gap between two instructions* is a
      # defect, and only the caller can tell those apart.
      [ $((c1 - rm_cursor)) -gt 0 ] || {
        echo "the plan overlaps itself: instruction at +$c1 ms starts $((rm_cursor - c1)) ms" \
             "before the previous one ends" >&2
        exit 47
      }
      hid_delay $((c1 - rm_cursor))
    fi
    plan_emit "$c2" "$c3" "$c4" "$c5"
    plan_span "$c2" "$c3" "$c4" "$c5"
    rm_cursor=$((c1 + PLAN_SPAN))
  done 9< "$PLAN_FILE"
  # Wait the macro out, and then leave the next anchor its released time.
  #
  # Both steady cycles end on a sweep that finishes *past* the cycle boundary:
  # 4667 + 2*120 + 100 = 5007 against a 5000 ms cycle, and 10007 against 10000.
  # So the anchor's monitor press was being written on top of the sweep's final
  # camera release. Fusion polls touch per frame, so that reads as one finger
  # moving from the camera button to the monitor and the press never fires --
  # and a lost monitor press desyncs the toggle permanently, because nothing
  # here observes the monitor's state. Every later anchor then flips the wrong
  # way: the vent read photographs the camera feed and scores `unknown`, the
  # hall press lands on the camera map and pans it, the box stops being wound.
  # That is the whole of nights 6-22 to 6-24, and the reason cycle 1 always survived
  # it is that the opening ends 200 ms clear of its anchor while these end -7.
  [ "$rm_started" -eq 0 ] || \
    wait_until $((rm_base + rm_cursor + rm_shift + FUSION_POLL_MS))
}

# Run instructions (skip, limit] of one cycle, anchored at `base`. The window
# exists because the phone does not know which cycle it is in until the
# classifier answers: both steady cycles share a prefix, and the branch picks
# up after it. recipe.mjs's replay() splits at the same instruction.
run_cycle() {
  rc_cycle=$1; rc_base=$2; rc_skip=$3; rc_limit=$4
  rc_idx=0; rc_in=0
  while read -r c1 c2 c3 c4 c5 <&9; do
    if [ "$c1" = '#cycle' ]; then
      if [ "$c2" = "$rc_cycle" ]; then rc_in=1; else rc_in=0; fi
      continue
    fi
    [ "$rc_in" -eq 1 ] || continue
    [ -n "$c1" ] || continue
    rc_idx=$((rc_idx + 1))
    [ "$rc_idx" -gt "$rc_skip" ] || continue
    [ "$rc_idx" -le "$rc_limit" ] || continue
    plan_step "$rc_base" "$c1" "$c2" "$c3" "$c4" "$c5"
  done 9< "$PLAN_FILE"
}


if [ "$NIGHT6_LEFT" -eq 1 ]; then
  [ -s "$PLAN_FILE" ] || {
    echo 'night6-left needs the device plan, and none was pushed' >&2
    exit 47
  }
  press_at 0 "$MUTE_X" "$MUTE_Y" mute
  # The epoch detector needs one more confirming capture after T0, so the
  # opening's first instruction can already be due. Let it slip rather than
  # firing the cam-11 select inside MONITOR_ANIM_UP; the opening's wind absorbs
  # the slip, so the sweep after it still lands on the absolute deadline the
  # route is anchored to.
  opening_at=$(plan_first_offset opening)
  now_rel
  now=$NOW_REL
  SLIP=$((now + 20 - opening_at))
  [ "$SLIP" -ge 0 ] || SLIP=0
  [ "$SLIP" -le 1017 ] || {
    echo 'epoch latch left no room for the opening' >&2
    exit 46
  }
  run_cycle opening 0 0 999

  base=7000
  cycle=0
  unknowns=0
  nolights=0
  nolight_streak=0
  attacks=0
  desyncs=0
  blind_streak=0
  while [ "$base" -lt 419000 ] && [ "$cycle" -lt "$CYCLES" ]; do
    SLIP=0
    # The shared prefix: lower the monitor, light the vent, read it. Both
    # steady cycles begin with these two instructions and test-recipe.mjs
    # asserts they stay identical, because the branch is not known until the
    # classifier has answered.
    run_cycle clear "$base" 0 2

    # The monitor desynced: this frame is the camera feed, not the office.
    #
    # The anchor's monitor press did not take effect, so the vent light press
    # was the *camera* light and the classifier was handed CAM 11 or the map.
    # Confirmed in-run on night 6-28: cams=down, cams=down, then cams=UP-DESYNCED
    # at cycle 3 and never again down. Nothing observed it, so a single lost
    # press ended every night from 22 to 27.
    #
    # A camera frame carries no information about Balloon Boy, so failing closed
    # on it is not safety, it is noise -- and the 10 s attack cycle it buys does
    # not wind, which is what turned one lost press into a starved box. It does
    # tell us two things exactly: the cams are up, and the mask is off, because
    # the game has no state with both raised (engine.js press(): a mask press
    # with the monitor up is an input the player cannot make).
    #
    # So put the cams back down and run the cycle's remainder from a floor that
    # clears MONITOR_ANIM_DOWN. The mask-off press is skipped: there is no mask
    # on to take off, and pressing it would put one ON and blind every later
    # read.
    if [ "$monitor_seen" = 'cams=UP-DESYNCED' ]; then
      desyncs=$((desyncs + 1))
      now_rel
      actual=$NOW_REL
      printf '%6d ms  monitor desynced; lowering and resuming the cycle (%d)\n' \
        "$actual" "$desyncs"
      hid_mark "$actual"
      [ "$desyncs" -le 12 ] || {
        echo 'the monitor desynced repeatedly; the schedule is not reaching the game' >&2
        exit 48
      }
      press_at $((actual + FUSION_POLL_MS)) "$MONITOR_X" "$MONITOR_Y" monitor-resync
      # Verify the press worked before resuming the schedule on top of it.
      #
      # The cause of the inversion is the engine, not the input: `drop
      # everything` is set every 10 s while an attacker waits at marker 122
      # with the cams up (g718-721), on any attack start (g624) and on the
      # Puppet's arrival (g574), and g262 then lowers the monitor without a
      # press. Night 6-43 shows the cadence directly -- recoveries at 15.8 s,
      # 25.9 s, 36.7 s and 43.1 s -- and its "dropped" monitor press at
      # 26.02 s had 352 ms of clean released time: nothing was dropped, the
      # raise was spent by the forcedown one frame later.
      #
      # A recovery that assumes its own press landed is therefore the same
      # open-loop mistake at one remove, and it is why 6-43 stayed inverted
      # through four recoveries. Read the cams back (59 ms) and press again
      # once if they are still up; past that, let the next cycle's checkpoint
      # catch it rather than fighting the engine over the toggle.
      if [ "$CUE_PORT" != "-" ]; then
        wait_until $((LAST_PRESS_MS + TAP_CONTACT_MS + MONITOR_ANIM_DOWN_MS))
        rs_luma=$(cue_snapshot | sed -n 's/.* luma=\([0-9]*\).*/\1/p')
        if [ -n "$rs_luma" ] && [ "$rs_luma" -ge "$CUE_CAMS_UP_LUMA" ]; then
          now_rel
          actual=$NOW_REL
          printf '%6d ms  cams still up after the resync (luma %s); pressing once more\n' \
            "$actual" "$rs_luma"
          hid_mark "$actual"
          press_at $((actual + FUSION_POLL_MS)) "$MONITOR_X" "$MONITOR_Y" monitor-resync-2
        fi
      fi
      # The retained frame proves the mask is off: a mask press cannot land
      # while the cams are up. Instruction 3 is the maskraise compound, so run
      # its raise at the same internal offset without toggling the mask on.
      # The flag is scoped around this one macro and the interpreter regression
      # asserts both the omitted toggle and the preserved delay.
      MASK_ALREADY_OFF=1
      run_macro clear "$base" 2 999 \
        $((LAST_PRESS_MS + TAP_CONTACT_MS + MONITOR_ANIM_DOWN_MS + FUSION_POLL_MS))
      MASK_ALREADY_OFF=0
      base=$((base + 5000))
      cycle=$((cycle + 1))
      continue
    fi

    case "$classification" in
      empty\ *) branch=clear; blind_streak=0; nolight_streak=0 ;;
      bb\ *)    branch=attack; blind_streak=0; nolight_streak=0 ;;
      nolight\ *)
        # The lamp is dark, so this frame is not an observation of the opening.
        #
        # It was called `inside` and it ended the run (exit 49). It is not
        # Balloon Boy: measured across every labelled frame, the LIGHT lamp
        # inside the model's own ROI reads green-excess 104.0 on all 49
        # `empty`/`bb` frames and 0.2 on both frames the `inside` class was
        # trained from. The class was the vent light being off. Night 6-41 died
        # on it at 13.7 s -- before BB_EARLIEST_INSIDE_MS, so it could not have
        # been him -- and the run video shows the lamp lit exactly once in 20 s.
        #
        # Three things make the lamp dark and one frame cannot separate them:
        # the light press was dropped; `in danger` is latched, so no light
        # answers at all (g75/g76/g77); or he really is at 123 and g301/g303
        # have stopped the vent lights answering. So fail closed like any other
        # unreadable frame -- the mask is the right answer to an opening that
        # might have him in it, and it is also the thing that resolves an
        # `in danger` encounter -- and let the *streak* decide: a dropped press
        # recovers next cycle, an encounter clears under the mask within two to
        # three cycles (night 6-43, Mangle), and only marker 123 never relights.
        branch=attack
        nolights=$((nolights + 1))
        nolight_streak=$((nolight_streak + 1))
        blind_streak=0
        now_rel
        actual=$NOW_REL
        printf '%6d ms  left-view %s: the vent lamp is dark; masking and retrying (%d in a row, %d total)\n' \
          "$actual" "$classification" "$nolight_streak" "$nolights"
        hid_mark "$actual"
        if [ "$nolight_streak" -ge "$NOLIGHT_STREAK_MAX" ]; then
          if [ "$actual" -ge "$BB_EARLIEST_INSIDE_MS" ]; then
            echo "the vent light has not answered for $nolight_streak consecutive reads past ${BB_EARLIEST_INSIDE_MS} ms; Balloon Boy is at 123 and no group moves him back out" >&2
            exit 49
          fi
          echo "the vent light has not answered for $nolight_streak consecutive reads, and it is too early for Balloon Boy to be inside; the light press is not reaching the game" >&2
          exit 44
        fi
        ;;
      *)
        # A single unreadable frame fails closed, because an unseen BB costs
        # the night. Failing closed on *every* cycle is the simulator's
        # all-threat negative control and it dies, so a run that cannot see is
        # not running this policy and should stop rather than pretend.
        branch=attack
        unknowns=$((unknowns + 1))
        blind_streak=$((blind_streak + 1))
        now_rel
        actual=$NOW_REL
        printf '%6d ms  left-view %s; failing closed (%d in a row, %d total)\n' \
          "$actual" "$classification" "$blind_streak" "$unknowns"
        hid_mark "$actual"
        # Consecutive, not cumulative.
        #
        # The cap is meant to stop a run that cannot see -- "a run that cannot
        # see is not running this policy and should stop rather than pretend".
        # A total counter does not measure that. Night 6-36 reached 163 s, past
        # 2 AM and past every previous run, and was then killed by its seventh
        # unknown of the night rather than by the game: the reads were spread
        # across 163 s, each one got the correct response (the five-tick mask is
        # what repels a vent visitor as well as Balloon Boy), and the schedule
        # recovered every time.
        #
        # What actually means blind is several in a row. The retained frames say
        # why a single one happens: an animatronic filling the office view is
        # none of empty/bb/inside, so the model has no class for it and returns
        # `unknown` -- a correct refusal to guess, not a broken sensor.
        [ "$blind_streak" -le 4 ] || {
          echo 'four consecutive unclassified left reads; the BB branch is blind' >&2
          exit 45
        }
        ;;
    esac

    if [ "$branch" = clear ]; then
      # The read put the prophylactic mask on. Instruction 3 is the compound
      # mask-off + monitor raise, with the phone-measured 180 ms seam held
      # inside one HID macro.
      #
      # Floored at now, like the recovery, because the resume offset is usually
      # already stale: the capture pipeline finishes 30-900 ms past the plan's
      # cut-off (worse when the flip gate corrected first). Launched without a
      # floor the macro runs uniformly late with rm_shift=0, so the seam wait
      # undershoots the still-running sweep and the next cycle's anchor is
      # queue-serialized straight onto the sweep's tail -- a real zero-gap the
      # marks cannot see, and night 6-45 lost a monitor press to it every
      # corrected cycle. The floor turns that lateness into rm_shift, which
      # keeps every plan gap *and* holds the next anchor back the same amount.
      now_rel
      actual=$NOW_REL
      run_macro clear "$base" 2 999 $((actual + FUSION_POLL_MS))
      base=$((base + 5000))
    else
      attacks=$((attacks + 1))
      now_rel
      actual=$NOW_REL
      # The read already put the mask on before classification completed, so a
      # true positive keeps that same continuous hold through five ticks. g293
      # zeroes the counter on every new fully-on entry; pressing again here
      # would turn the mask off and destroy the response.
      printf '%6d ms  left-view BB; keeping prophylactic mask through five ticks\n' "$actual"
      hid_mark "$actual"
      # Floored past classification for the same reason the clear branch is: a
      # stale resume offset must become rm_shift, not compression.
      run_macro attack "$base" 2 999 $((actual + FUSION_POLL_MS))
      base=$((base + 10000))
    fi
    cycle=$((cycle + 1))
  done
  hid_release
  printf 'night6-left finished: %d cycles, %d BB responses, %d unclassified\n' \
    "$cycle" "$attacks" "$unknowns"
  exit 0
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
  adb shell "screenrecord --size 1280x576 --bit-rate 3000000 --time-limit $SCREENRECORD_LIMIT $REMOTE_VIDEO" &
  REC=$!
  RECORDING_STARTED=1
  sleep 0.5
fi

menu_select "$MENU_TARGET" || {
  echo "abort: could not select $MENU_TARGET on the title screen" >&2
  exit 47
}

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
  # T0 is a device-shell reading and stays one. The event is stamped on the
  # host's own clock and carries the device value verbatim as source_t; the
  # manifest's measured alignment edge is what relates the two. Rewriting the
  # device number into host time here is exactly the silent reinterpretation
  # the v1 contract forbids.
  EPOCH_T0_MS=$(awk -F'epoch_ms=' '/epoch_ms=/{split($2,a,/ /); print a[1]; exit}' \
    <<<"$EPOCH_REPORT")
  if [ -n "${EPOCH_T0_MS:-}" ] && [ -n "${FNAF2_SESSION_DEVICE_OFFSET:-}" ]; then
    fnaf_session_event kind=lifecycle outcome=night terminal=false \
      sensor=screencheck source_clock=device_shell_wall_ms \
      "source_t=$EPOCH_T0_MS" "note=device epoch latched: $EPOCH_REPORT"
  else
    # No measured offset means the two clocks are not comparable, and an
    # unalignable source_t would only look like provenance.
    fnaf_session_event kind=lifecycle outcome=night terminal=false \
      sensor=screencheck "note=device epoch latched, unaligned: $EPOCH_REPORT"
  fi
else
  for i in $(seq 1 40); do
    [ "$(state)" = "night" ] && break
    sleep 1
    [ "$i" = 40 ] && { echo "abort: $NIGHT night never started"; exit 1; }
  done
  adb shell "screenrecord --size 1280x576 --bit-rate 3000000 --time-limit $SCREENRECORD_LIMIT $REMOTE_VIDEO" &
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
finish_driver_log
DRIVER_PID=""
stop_watchdogs
if [ -s "$WATCHDOG_RESULT" ]; then
  cat "$WATCHDOG_RESULT"
  # Recorded here rather than inside the watchdog subshell: the fault is one
  # event whichever watchdog produced it, and both funnel through this file.
  fnaf_session_event kind=fault sensor=watchdog \
    "fault.fault_kind=watchdog-abort" \
    "fault.detail=$(tr -d '\r\n' < "$WATCHDOG_RESULT")" \
    "fault.degraded_to=aborted"
  exit 1
fi
if [ "$DRIVER_STATUS" -ne 0 ]; then
  echo "abort: timed input driver exited with status $DRIVER_STATUS"
  fnaf_session_event kind=fault sensor=runner \
    "fault.fault_kind=driver-exit" \
    "fault.detail=timed input driver exited with status $DRIVER_STATUS" \
    "fault.degraded_to=aborted"
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
# Grading now happens inside cleanup, after the session is finalized: the first
# thing grade-run.sh checks is the manifest, and the manifest cannot exist
# until the cue trace and the kept classifier frames have been pulled -- which
# cleanup does. Grading here would have reported every successful run as
# unmanifested.
