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
DEVICE_POLICY="${DEVICE_POLICY:-minus7}"
REACTIVE="${REACTIVE:-off}"
# A Minus Toys run has two materially different schedules.  The standard
# 10-second route is the 10/20-shaped policy; the Night 1 minimal route is a
# 5-second, no-mask/no-hall calibration policy.  `audio-gated` is an explicit
# observation-only Night 2 experiment that omits the regular left-vent light;
# it is not a survival policy and requires EXPERIMENT_UNGATED=1. Selecting neither is unsafe:
# a caller can otherwise believe it is testing Night 1 minimal while emitting
# the standard route.
MINUS_TOYS_VARIANT="${MINUS_TOYS_VARIANT:-}"
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
# Video grading fans out into several full-capture decoders.  Keep evidence
# collection safe by default; a human explicitly starts grade-run.sh later on a
# host with enough headroom.
GRADE_RUN="${GRADE_RUN:-0}"
PRESS_MODE="${PRESS_MODE:-hid-multi}"
HID_TRACE_RUN="${HID_TRACE_RUN:-0}"
# The sweep geometry the plan specifies; `recipe.mjs --device-plan` prints it
# and tools/device/test-runner-plan.mjs checks these against it.
PLAN_SPACING_MS="${PLAN_SPACING_MS:-133}"
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
# A live external authority is a host-side fact stream, not an Android app
# permission. CUE_AUDIO=1 below subscribes to a socket whose authority is
# started separately with tools/cue/audio-authority.py.
AUDIO_AUTHORITY_SOCKET="${AUDIO_AUTHORITY_SOCKET:-}"
CUE_HELPER="${CUE_HELPER:-0}"
# Record bounded detector windows beside the night's anchored PCM. This is an
# observation-only path: the remote input driver never receives the detector
# result. Promotion and control remain separate gates.
CUE_SHADOW="${CUE_SHADOW:-0}"
CUE_SHADOW_MODEL="${CUE_SHADOW_MODEL:-}"
BB_LEFT_MODEL="${BB_LEFT_MODEL:-}"
GF_OFFICE_MODEL="${GF_OFFICE_MODEL:-}"
GF_SKIP_MASK_ON_EXACT_EMPTY="${GF_SKIP_MASK_ON_EXACT_EMPTY:-0}"
HERE="$(cd "$(dirname "$0")" && pwd)"
CAPTURE_DIR="$HERE/../../captures"
LOCAL_VIDEO="$CAPTURE_DIR/$OUT.mp4"
LOCAL_ABORT_VIDEO="$CAPTURE_DIR/$OUT-aborted.mp4"
LOCAL_EPOCH="$CAPTURE_DIR/$OUT-epoch.txt"
LOCAL_RUN_LOG="$CAPTURE_DIR/$OUT-run.log"
LOCAL_DEVICE_PLAN="$CAPTURE_DIR/$OUT-device-plan.txt"
LOCAL_POLICY_ARTIFACT="$CAPTURE_DIR/$OUT-policy-artifact.json"
LOCAL_CUE_SHADOW="$CAPTURE_DIR/$OUT-cue-shadow.txt"
LOCAL_AUDIO_FACTS="$CAPTURE_DIR/$OUT-audio-facts.jsonl"
SAMPLE_VIEW=""
SAMPLE_BUCKET="unlabeled"
LOCAL_SAMPLE_DIR=""
REMOTE_VIDEO="/sdcard/$OUT.mp4"
REMOTE_PIDFILE="/data/local/tmp/fnaf2-minus7-$$-$(date +%s).pid"
REMOTE_PLAN="$REMOTE_PIDFILE.plan"
REMOTE_READYFILE="$REMOTE_PIDFILE.ready"
REMOTE_STARTFILE="$REMOTE_PIDFILE.start"
REMOTE_EPOCHFILE="$REMOTE_PIDFILE.epoch"
# Host->driver signals, checked by the driver at points it can act on them.
# The halt file is the save-wipe guard: the driver stops at its next macro
# boundary (<= one 5 s cycle) once it exists, because the r3 abort kept
# pressing the death menu for ~7 s until the slow kill path landed -- the
# watchdog's force-stop/pidfile teardown is seconds; a file touch is one adb
# round trip. The three arm-verify files carry the --minimal split-arm check
# (see watch_arm_verify): the driver opens the window, the host classifies the
# raised monitor's CAM 11 button and touches rearm on a miss or armfail when
# the retries are spent.
REMOTE_HALTFILE="$REMOTE_PIDFILE.halt"
REMOTE_ARMWINDOW="$REMOTE_PIDFILE.armwin"
REMOTE_REARM="$REMOTE_PIDFILE.rearm"
REMOTE_ARMFAIL="$REMOTE_PIDFILE.armfail"
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
REMOTE_CUE_SHADOW="$REMOTE_PIDFILE.cue-shadow"
REMOTE_CUE_SHADOW_SENTINEL="$REMOTE_PIDFILE.cue-shadow.run"
REMOTE_CUE_SHADOW_PIDFILE="$REMOTE_PIDFILE.cue-shadow.pid"
REMOTE_CHECKER_ARG="-"
REMOTE_BB_MODEL_ARG="-"
REMOTE_CAM05_MODEL_ARG="-"
REMOTE_GF_MODEL_ARG="-"
POST_CAPTURE_TOUCHES_EFFECTIVE=0
RUN_TMP=""
WATCHDOG_RESULT=""
REC=""
AUDIO_FACTS_PID=""
DRIVER_PID=""
DRIVER_LOG_PID=""
DRIVER_OUTPUT_FIFO=""
WATCHDOG_PID=""
FOCUS_WATCHDOG_PID=""
ARM_VERIFY_PID=""
GAME_LAUNCHED=0
RECORDING_STARTED=0
CAPTURE_PULLED=0
SAMPLES_PULLED=0
CHECKER_INSTALLED=0
CUE_SHADOW_STARTED=0
CUE_MODEL_SHA256=""
CUE_MODEL_EVIDENCE=""
POLICY_SCHEMA=""
POLICY_ID=""
POLICY_GATE_STATUS="not-applicable"
POLICY_SHA256=""
POLICY_PLAN_SHA256=""
POLICY_EXECUTION_MODE="legacy-device-plan"

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
case "$DEVICE_POLICY" in
  minus7|minus-toys) ;;
  *) echo "DEVICE_POLICY must be minus7 or minus-toys"; exit 2 ;;
esac
case "$REACTIVE" in
  off|observe) ;;
  act)
    echo "REACTIVE=act is not implemented: observe-only evidence must pass before action" >&2
    exit 2
    ;;
  *) echo "REACTIVE must be off or observe" >&2; exit 2 ;;
esac
if [ "$REACTIVE" = observe ] && [ "$CUE_HELPER" -ne 1 ]; then
  echo "REACTIVE=observe requires CUE_HELPER=1" >&2
  exit 2
fi
case "$MINUS_TOYS_VARIANT" in
  ''|standard|minimal|audio-gated) ;;
  *) echo "MINUS_TOYS_VARIANT must be standard, minimal, or audio-gated"; exit 2 ;;
esac
if [ "$DEVICE_POLICY" = minus-toys ] && [ -z "$MINUS_TOYS_VARIANT" ]; then
  echo "DEVICE_POLICY=minus-toys requires MINUS_TOYS_VARIANT=standard or minimal" >&2
  exit 2
fi
if [ "$DEVICE_POLICY" != minus-toys ] && [ -n "$MINUS_TOYS_VARIANT" ]; then
  echo "MINUS_TOYS_VARIANT applies only to DEVICE_POLICY=minus-toys" >&2
  exit 2
fi
if [ "$MINUS_TOYS_VARIANT" = audio-gated ]; then
  [ "${EXPERIMENT_UNGATED:-0}" = 1 ] || {
    echo 'MINUS_TOYS_VARIANT=audio-gated requires EXPERIMENT_UNGATED=1; it is a shadow observation route, not a survival policy' >&2
    exit 2
  }
  [ "$CUE_AUDIO" -eq 1 ] || {
    echo 'MINUS_TOYS_VARIANT=audio-gated requires CUE_AUDIO=1 so the second-bang observation is recorded' >&2
    exit 2
  }
fi
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
if [ "$CUE_AUDIO" -eq 1 ] && [ "$CUE_HELPER" -ne 1 ]; then
  echo "CUE_AUDIO=1 requires CUE_HELPER=1 so the run has a visual session to pair with the facts" >&2
  exit 2
fi
case "$CUE_HELPER" in
  0|1) ;;
  *) echo "CUE_HELPER must be 0 or 1"; exit 2 ;;
esac
case "$CUE_SHADOW" in
  0|1) ;;
  *) echo "CUE_SHADOW must be 0 or 1"; exit 2 ;;
esac
if [ "$CUE_SHADOW" -eq 1 ]; then
  echo 'CUE_SHADOW is no longer an APK operation; consume fact-message-v1 from the external authority instead' >&2
  exit 2
fi
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
  *) echo "trial.sh now executes only the gated HID plan; PRESS_MODE must be hid-multi"; exit 2 ;;
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

# This runner has one policy: the emitted, model-gated HID plan. The old swipe
# table and sparse pre-read probe were inline schedules the model gate could
# not price, so they are no longer selectable device routes.
#
# The BB_LEFT_MODEL refusal used to live here, quoting a Night 6 statistic on
# every night. It has moved below STORY_NIGHT, because it could not name the
# night it was refusing for until the night was resolved.
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
    echo "trial.sh executes Continue only through bounded CALIBRATION_STORY_NIGHT=1..5" >&2
    exit 2
  }
fi
if [ "$MINUS_TOYS_VARIANT" = minimal ] && [ "$STORY_NIGHT" -ne 1 ]; then
  echo "MINUS_TOYS_VARIANT=minimal is a Night 1-only policy" >&2
  exit 2
fi
# A run with no left-opening read is a known-dead configuration, not a variant,
# and the reason differs by night -- so the refusal reads the sourced AI table
# rather than quoting one night's statistic at all six.
#
# `canAct` is the authority on whether a threat branch is REACHABLE, never a
# sampled seed: Night 1 gives Balloon Boy AI 0 so no group can arm him, while
# Night 3 merely makes him rare. Conflating those is a defect this repository
# has already fixed once, in the engine, and never propagated to the shell.
#
# What did NOT survive checking is the conclusion that the model is therefore
# optional on Night 1. One capture per cycle feeds three consumers in
# 12-night-loop.sh: the bb/empty branch decision, the blind_streak and
# nolight_streak health guards, and `monitor_seen` -- the desync checkpoint,
# which CLAUDE.md calls the cheapest tell there is. Only the first is Balloon
# Boy's. With BB_LEFT_MODEL unset the driver is handed BB_MODEL=- and CHECKER=-,
# every classify fails, every read returns `unknown`, and the run exits 45 on
# its fifth cycle. So the requirement holds on every night; the *reason* is what
# the AI table decides.
bb_can_act="$(node --input-type=module -e \
  "import { canAct } from '$HERE/../../src/config.js';
   process.stdout.write(canAct($STORY_NIGHT, 'bb') ? 'yes' : 'no');")" || {
  echo "could not ask the engine whether Balloon Boy can act on night $STORY_NIGHT" >&2
  exit 2
}
if [ "$DEVICE_POLICY" = minus7 ] && [ -z "$BB_LEFT_MODEL" ]; then
  echo "trial.sh requires BB_LEFT_MODEL; refusing to run night $STORY_NIGHT blind" >&2
  if [ "$bb_can_act" = yes ]; then
    echo "  Balloon Boy can act on night $STORY_NIGHT (sourced AI table), and" >&2
    echo "  HID-MULTITOUCH.md records 0/3000 Night 6 for a blind run, via BB->Foxy." >&2
    echo "  A 2026-08-24 device run reproduced that chain exactly: BB walked in," >&2
    echo "  took the lights, Foxy finished it." >&2
  else
    echo "  Balloon Boy cannot act on night $STORY_NIGHT at all (AI 0), so the" >&2
    echo "  0/3000 BB->Foxy figure is not the reason -- but the read is still" >&2
    echo "  required. It also feeds the monitor desync checkpoint and the" >&2
    echo "  blind/nolight health guards, and with no model every read returns" >&2
    echo "  'unknown': the run exits 45 on its fifth cycle." >&2
  fi
  echo "  Use captures/screencheck/bb-left/models/runtime-gh.scm; CAM 05 is not" >&2
  echo "  the checkpoint, and the left vent light costs no flashlight battery." >&2
  exit 2
fi

if [ "$DEVICE_POLICY" = minus7 ]; then
{ [ "$PILOT_OFFSET_MS" -ge 83 ] && [ "$PILOT_OFFSET_MS" -le 267 ]; } || {
  echo "PILOT_OFFSET_MS must be inside the measured 83-267 ms phase window" >&2
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

mkdir -p "$CAPTURE_DIR"
[ ! -e "$LOCAL_VIDEO" ] || { echo "refusing to overwrite $LOCAL_VIDEO"; exit 2; }
[ ! -e "$LOCAL_ABORT_VIDEO" ] || { echo "refusing to overwrite $LOCAL_ABORT_VIDEO"; exit 2; }
[ ! -e "$LOCAL_RUN_LOG" ] || { echo "refusing to overwrite $LOCAL_RUN_LOG"; exit 2; }
[ ! -e "$LOCAL_DEVICE_PLAN" ] || { echo "refusing to overwrite $LOCAL_DEVICE_PLAN"; exit 2; }
if [ "$DEVICE_POLICY" = minus-toys ] && [ "$MINUS_TOYS_VARIANT" = minimal ]; then
  [ ! -e "$LOCAL_POLICY_ARTIFACT" ] ||
    { echo "refusing to overwrite $LOCAL_POLICY_ARTIFACT"; exit 2; }
fi
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
#
# EXPERIMENT_UNGATED=1 (minus7-perfect-experiment branch only): skip the human
# gate and emit the LIGHT_AFTER sweep geometry. This run MEASURES THE MACHINE
# -- it is not a human route and its result must never be quoted as a policy
# survival figure. The gate verdict is still computed and recorded for
# reference. SWEEP_SPACING_MS / SWEEP_CONTACT_MS override the emitted sweep.
SWEEP_SPACING_MS="${SWEEP_SPACING_MS:-}"
SWEEP_CONTACT_MS="${SWEEP_CONTACT_MS:-}"
SWEEP_SLOT_MS="${SWEEP_SLOT_MS:-}"
recipe_args="--night=$STORY_NIGHT"
[ -z "$SWEEP_SLOT_MS" ] || recipe_args="$recipe_args --slot-ms=$SWEEP_SLOT_MS"
[ -z "$SWEEP_SPACING_MS" ] || recipe_args="$recipe_args --device-spacing-ms=$SWEEP_SPACING_MS"
[ -z "$SWEEP_CONTACT_MS" ] || recipe_args="$recipe_args --sweep-contact-ms=$SWEEP_CONTACT_MS"
# shellcheck disable=SC2086
if [ "$DEVICE_POLICY" = minus-toys ]; then
  minus_toys_args=(--night="$STORY_NIGHT")
  [ "$MINUS_TOYS_VARIANT" != minimal ] || minus_toys_args+=(--minimal)
  [ "$MINUS_TOYS_VARIANT" != audio-gated ] ||
    minus_toys_args+=(--knobs=preventiveVentLight=false)
  if [ "$MINUS_TOYS_VARIANT" = minimal ]; then
    # The live Minimal target is emitted from policy-v1, not from a second
    # schedule writer. The artifact compiler performs the exact gate,
    # equivalence check, and records the canonical policy alongside its plan.
    node "$HERE/policy-artifact.mjs" --minimal --gate || exit 44
    node "$HERE/policy-artifact.mjs" --minimal \
      --plan "$RUN_TMP/device-plan.txt" \
      --artifact "$RUN_TMP/policy-artifact.json" \
      --metadata "$RUN_TMP/policy-meta.env" || exit 44
    POLICY_EXECUTION_MODE="compiled-ir"
    POLICY_GATE_STATUS="passed"
    POLICY_SCHEMA="$(sed -n 's/^policy_schema=//p' "$RUN_TMP/policy-meta.env")"
    POLICY_ID="$(sed -n 's/^policy_id=//p' "$RUN_TMP/policy-meta.env")"
    POLICY_SHA256="$(sed -n 's/^policy_sha256=//p' "$RUN_TMP/policy-meta.env")"
    POLICY_PLAN_SHA256="$(sed -n 's/^plan_sha256=//p' "$RUN_TMP/policy-meta.env")"
    [ "$POLICY_SCHEMA" = policy-v1 ] && [ -n "$POLICY_ID" ] &&
      [ "$(printf '%s' "$POLICY_SHA256" | wc -c | tr -d ' ')" -eq 64 ] &&
      [ "$(printf '%s' "$POLICY_PLAN_SHA256" | wc -c | tr -d ' ')" -eq 64 ] || {
        echo "policy artifact metadata is incomplete" >&2
        exit 44
      }
    actual_policy_plan_sha256="$(shasum -a 256 "$RUN_TMP/device-plan.txt" | awk '{print $1}')"
    [ "$actual_policy_plan_sha256" = "$POLICY_PLAN_SHA256" ] || {
      echo "policy artifact plan hash does not match the emitted plan" >&2
      exit 44
    }
  else
    if [ "$MINUS_TOYS_VARIANT" = audio-gated ]; then
      # This route is intentionally outside the survival gate: removing the
      # preventive light exposes the vent-bang/visual-confirmation interval.
      # Still run the exact gate and require it to be negative, so a future
      # schedule change cannot silently turn this into an unlabelled policy.
      audio_gated_gate_log="$RUN_TMP/audio-gated-gate.log"
      if node "$HERE/minus-toys-plan.mjs" "${minus_toys_args[@]}" --gate >"$audio_gated_gate_log" 2>&1; then
        cat "$audio_gated_gate_log" >&2
        echo 'audio-gated variant unexpectedly passed the survival gate; refusing an unlabelled route' >&2
        exit 44
      fi
      cat "$audio_gated_gate_log" >&2
      POLICY_EXECUTION_MODE="audio-gated-observation"
      POLICY_GATE_STATUS="expected-negative"
    else
      node "$HERE/minus-toys-plan.mjs" "${minus_toys_args[@]}" --gate || exit 44
      POLICY_GATE_STATUS="passed"
    fi
    node "$HERE/minus-toys-plan.mjs" "${minus_toys_args[@]}" > "$RUN_TMP/device-plan.txt"
  fi
else
  # shellcheck disable=SC2086
  node "$HERE/recipe.mjs" --device-plan $recipe_args > "$RUN_TMP/device-plan.txt"
fi
cp "$RUN_TMP/device-plan.txt" "$LOCAL_DEVICE_PLAN"
PLAN_SHA256="$(shasum -a 256 "$RUN_TMP/device-plan.txt" | awk '{print $1}')"
if [ "$DEVICE_POLICY" = minus-toys ]; then
  echo "Minus Toys $MINUS_TOYS_VARIANT device-plan status=$POLICY_GATE_STATUS for Night $STORY_NIGHT" >&2
elif [ "${EXPERIMENT_UNGATED:-0}" = 1 ]; then
  gate_note="$(node "$HERE/human-gate.mjs" "$RUN_TMP/device-plan.txt" 2>&1 || true)"
  echo "EXPERIMENT_UNGATED=1: human gate NOT enforced. This measures the machine." >&2
  echo "  gate verdict (for reference): $(printf '%s' "$gate_note" | head -1)" >&2
else
  node "$HERE/human-gate.mjs" "$RUN_TMP/device-plan.txt" || exit 44
fi

# Include launch/loading headroom and any calibrated raw-frame pauses.  For
# Minus Toys the emitted plan is authoritative: the minimal variant deliberately
# idles until 2 AM, so CYCLES*period alone is not its wall duration.  Deriving
# this from #loop-start/#stop-at keeps the recorder's scope aligned with the
# same plan the phone will execute.
LEFT_SAMPLE_COUNT=0
if [ "$BB_LEFT_CAPTURE_EVERY" -gt 0 ]; then
  LEFT_SAMPLE_COUNT=$(((CYCLES - 1 - BB_LEFT_CAPTURE_START) / BB_LEFT_CAPTURE_EVERY + 1))
fi
POLICY_RUNTIME_MS=$((CYCLES * 5000))
if [ "$DEVICE_POLICY" = minus-toys ]; then
  PLAN_PERIOD_MS=$(sed -n 's/^#period \([0-9][0-9]*\).*/\1/p' "$RUN_TMP/device-plan.txt" | head -1)
  PLAN_LOOP_START_MS=$(sed -n 's/^#loop-start \([0-9][0-9]*\).*/\1/p' "$RUN_TMP/device-plan.txt" | head -1)
  PLAN_STOP_AT_MS=$(sed -n 's/^#stop-at \([0-9][0-9]*\).*/\1/p' "$RUN_TMP/device-plan.txt" | head -1)
  PLAN_OBSERVE_UNTIL_MS=$(sed -n 's/^#observe-until \([0-9][0-9]*\).*/\1/p' "$RUN_TMP/device-plan.txt" | head -1)
  case "$PLAN_PERIOD_MS" in ''|*[!0-9]*) echo 'Minus Toys plan has no numeric #period'; exit 44 ;; esac
  [ -n "$PLAN_LOOP_START_MS" ] || PLAN_LOOP_START_MS=0
  PLAN_SCHEDULED_END_MS=$((PLAN_LOOP_START_MS + CYCLES * PLAN_PERIOD_MS))
  POLICY_RUNTIME_MS=$PLAN_SCHEDULED_END_MS
  if [ -n "$PLAN_STOP_AT_MS" ] && [ "$POLICY_RUNTIME_MS" -gt "$PLAN_STOP_AT_MS" ]; then
    POLICY_RUNTIME_MS=$PLAN_STOP_AT_MS
  fi
  # An observation tail is part of a completed policy, not a hidden extension
  # of a deliberately short calibration.  The on-phone driver makes the same
  # decision from its actual loop base before it calls wait_until.
  if [ -n "$PLAN_OBSERVE_UNTIL_MS" ] && [ -n "$PLAN_STOP_AT_MS" ] && \
     [ "$PLAN_SCHEDULED_END_MS" -ge "$PLAN_STOP_AT_MS" ] && \
     [ "$POLICY_RUNTIME_MS" -lt "$PLAN_OBSERVE_UNTIL_MS" ]; then
    POLICY_RUNTIME_MS=$PLAN_OBSERVE_UNTIL_MS
  fi
fi
MAXDUR_MS=$((25000 + POLICY_RUNTIME_MS + LEFT_SAMPLE_COUNT * 1500))
MAXDUR=$(((MAXDUR_MS + 999) / 1000))

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

state_once() {
  # The helper is visual-only now. Keep lifecycle authority in screenstate;
  # a missing external audio fact is UNKNOWN and cannot be used as a death
  # signal or as evidence that the game is alive.
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
  # The halt file lands first and cheapest: one adb round trip that the driver
  # checks at every macro boundary, versus seconds for the kill path below.
  # The r3 abort (2026-08-29) spent those seconds firing the blind wind macro
  # into the death menu and walked it to "Start a new game? Yes" -- the save
  # survived by one contact.
  if [ -n "${REMOTE_HALTFILE:-}" ]; then
    adb shell ": > '$REMOTE_HALTFILE'" >/dev/null 2>&1 || true
  fi
  # The remote parent records its exact PID. Kill its direct input-swipe
  # children first, then the parent; never use a device-wide `pkill input`.
  adb shell "pidfile=$REMOTE_PIDFILE; if [ -f \"\$pidfile\" ]; then pid=\$(cat \"\$pidfile\" 2>/dev/null); case \"\$pid\" in ''|*[!0-9]*) ;; *) children=\$(cat /proc/\$pid/task/\$pid/children 2>/dev/null || true); [ -z \"\$children\" ] || kill -TERM \$children 2>/dev/null || true; kill -TERM \$pid 2>/dev/null || true ;; esac; rm -f \"\$pidfile\"; fi" >/dev/null 2>&1 || true
  local_pid="$DRIVER_PID"
  if [ -n "$local_pid" ] && kill -0 "$local_pid" 2>/dev/null; then
    kill -TERM "$local_pid" 2>/dev/null || true
    wait "$local_pid" 2>/dev/null || true
  fi
  # The driver is gone; leave no signal files for the next run to inherit.
  adb shell "rm -f '$REMOTE_HALTFILE' '$REMOTE_ARMWINDOW' '$REMOTE_REARM' '$REMOTE_ARMFAIL'" \
    >/dev/null 2>&1 || true
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

stop_audio_facts() {
  local local_pid="${AUDIO_FACTS_PID:-}"
  [ -n "$local_pid" ] || return 0
  if kill -0 "$local_pid" 2>/dev/null; then
    kill -TERM "$local_pid" 2>/dev/null || true
  fi
  wait "$local_pid" 2>/dev/null || true
  AUDIO_FACTS_PID=""
}

start_audio_facts() {
  [ "$CUE_AUDIO" -eq 1 ] || return 0
  [ -n "$AUDIO_AUTHORITY_SOCKET" ] || {
    echo 'CUE_AUDIO=1 requires AUDIO_AUTHORITY_SOCKET for the external authority' >&2
    echo 'start tools/cue/audio-authority.py --socket PATH, then retry' >&2
    exit 2
  }
  [ -S "$AUDIO_AUTHORITY_SOCKET" ] || {
    echo "external audio authority socket is not live: $AUDIO_AUTHORITY_SOCKET" >&2
    exit 2
  }
  [ ! -e "$LOCAL_AUDIO_FACTS" ] || {
    echo "refusing to overwrite $LOCAL_AUDIO_FACTS" >&2
    exit 2
  }
  python3 "$HERE/../cue/collect-facts.py" \
    --socket "$AUDIO_AUTHORITY_SOCKET" --output "$LOCAL_AUDIO_FACTS" &
  AUDIO_FACTS_PID=$!
  sleep 0.1
  if ! kill -0 "$AUDIO_FACTS_PID" 2>/dev/null; then
    wait "$AUDIO_FACTS_PID" 2>/dev/null || true
    AUDIO_FACTS_PID=""
    echo 'external audio authority accepted no fact-stream subscriber' >&2
    exit 2
  fi
  echo "external audio authority facts: $LOCAL_AUDIO_FACTS"
}

start_cue_shadow() {
  [ "$CUE_SHADOW" -eq 1 ] || return 0
  adb shell "printf 'cue-shadow-trace-v1 session=%s modelSha256=%s evidence=%s\\n' \
    '$FNAF2_SESSION_ID' '$CUE_MODEL_SHA256' '$CUE_MODEL_EVIDENCE' > '$REMOTE_CUE_SHADOW'; \
    : > '$REMOTE_CUE_SHADOW_SENTINEL'; \
    nohup sh -c '
      echo \$\$ > $REMOTE_CUE_SHADOW_PIDFILE
      i=0
      while [ -e $REMOTE_CUE_SHADOW_SENTINEL ]; do
        window=w\$i
        arm=\$(printf \"ARM %s %s all now 5000 shadow\\n\" $CUE_TOKEN \"\$window\" | \
          toybox nc -w 2 127.0.0.1 $CUE_PORT 2>/dev/null | tr -d \"\\r\")
        printf \"ARM %s\\n\" \"\$arm\" >> $REMOTE_CUE_SHADOW
        case \"\$arm\" in OK\\ armed=*) ;; *) break ;; esac
        sleep 5.1
        tries=0
        while :; do
          result=\$(printf \"RESULT %s %s\\n\" $CUE_TOKEN \"\$window\" | \
            toybox nc -w 2 127.0.0.1 $CUE_PORT 2>/dev/null | tr -d \"\\r\")
          case \"\$result\" in
            HIT\\ *|MISS\\ *|UNKNOWN\\ *) break ;;
            PENDING\\ *) tries=\$((tries + 1)); [ \"\$tries\" -lt 10 ] || break; sleep 0.1 ;;
            *) break ;;
          esac
        done
        printf \"RESULT %s\\n\" \"\$result\" >> $REMOTE_CUE_SHADOW
        case \"\$result\" in HIT\\ *|MISS\\ *|UNKNOWN\\ *) ;; *) break ;; esac
        i=\$((i + 1))
      done
      rm -f $REMOTE_CUE_SHADOW_PIDFILE
    ' >/dev/null 2>&1 &" >/dev/null 2>&1
  CUE_SHADOW_STARTED=1
  echo "cue helper: recording non-controlling 5 s shadow windows"
}

stop_cue_shadow() {
  [ "${CUE_SHADOW_STARTED:-0}" -eq 1 ] || return 0
  CUE_SHADOW_STARTED=0
  adb shell "rm -f '$REMOTE_CUE_SHADOW_SENTINEL'" >/dev/null 2>&1 || true
  # A stop can land during the one bounded sleep. Wait for that terminal result
  # rather than pulling a trace whose final ARM has no RESULT.
  for _ in $(seq 1 70); do
    adb shell "[ ! -e '$REMOTE_CUE_SHADOW_PIDFILE' ]" >/dev/null 2>&1 && break
    sleep 0.1
  done
  if adb shell "[ -e '$REMOTE_CUE_SHADOW_PIDFILE' ]" >/dev/null 2>&1; then
    echo "cue shadow loop did not terminate; refusing its partial trace" >&2
    return 1
  fi
  if adb pull "$REMOTE_CUE_SHADOW" "$LOCAL_CUE_SHADOW" >/dev/null 2>&1; then
    echo "cue shadow trace: $LOCAL_CUE_SHADOW"
  else
    echo "could not pull cue shadow trace" >&2
    return 1
  fi
  adb shell "rm -f '$REMOTE_CUE_SHADOW' '$REMOTE_CUE_SHADOW_PIDFILE'" >/dev/null 2>&1 || true
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

# The --minimal split-arm verifier (Night 1 only).
#
# Why this exists: the split arm is a coin flip on the phone. The model shows
# why (minus-toys-plan.mjs --phasegate, 2026-08-29): the arm's CAM 09 touch ->
# monitor drop window is 3 frames wide, and g263's 200 ms sampler lands inside
# it at 3 of 12 schedule/game phase alignments -- a missed arm leaves
# `viewing` on CAM 09, where the wind button does not exist, so the box is
# unwoundable and the Puppet kills at ~4 AM (measured: r3 of
# n1-minustoys-minimal-20260829). The deterministic gate replays at a fixed
# phase and cannot see this branch; the runner closes it instead.
#
# Contract with the driver: after the opening raise the driver touches
# REMOTE_ARMWINDOW and polls REMOTE_REARM until #loop-start minus a margin.
# Here the raised monitor is photographed and classified by cam11lit.py (the
# CAM 11 button is lit iff the raise restored CAM 11 -- the arm landed). unlit
# or unknown touches REMOTE_REARM, which makes the driver re-run the opening's
# camera rows as one macro; lit closes the check. Three attempts, then
# REMOTE_ARMFAIL: the driver exits 50 and the run ends named, not as a Puppet
# death two hours later. Every verdict is logged and recorded so the manifest
# carries what was seen, not just what was decided.
watch_arm_verify() {
  [ "$MINUS_TOYS_VARIANT" = minimal ] || return 0
  local i attempt=0 verdict
  fnaf_session_event kind=sensor sensor=cam11lit "note=watcher-started" \
    "target=$REMOTE_ARMWINDOW"
  # The window opens ~117 s into the night (the opening raise) but loading and
  # menu selection happen before T0, so budget a generous 240 s of wall time.
  for i in $(seq 1 480); do
    adb shell "[ -e '$REMOTE_ARMWINDOW' ]" >/dev/null 2>&1 && break
    kill -0 "$DRIVER_PID" 2>/dev/null || return 0
    sleep 0.5
    if [ "$i" = 480 ]; then
      # A verify that silently does nothing reads as coverage (the r3 lesson):
      # the 2026-08-30 pass run armed first-try but left no verify telemetry at
      # all, which is indistinguishable from this check not existing. Record
      # the gap instead of printing it into a pipe nobody keeps.
      echo "arm verify: driver never opened the arm window; continuing unverified" >&2
      fnaf_session_event kind=fault sensor=cam11lit \
        "fault.fault_kind=arm-window-never-opened" \
        "fault.detail=driver did not touch $REMOTE_ARMWINDOW within 240s; the arm went unverified" \
        "fault.degraded_to=unverified"
      return 0
    fi
  done
  # The raise animation finishes inside MONITOR_ANIM_UP (~0.3 s); leave the
  # map a beat to settle before the first photograph.
  sleep 1.5
  while [ "$attempt" -lt 3 ]; do
    attempt=$((attempt + 1))
    if ! verdict=$(adb exec-out screencap -p 2>/dev/null | python3 "$HERE/cam11lit.py"); then
      verdict="cam11lit verdict=unknown note=classifier-failed"
    fi
    printf 'arm verify (attempt %d): %s\n' "$attempt" "$verdict"
    fnaf_session_event kind=sensor sensor=cam11lit "attempt=$attempt" "note=$verdict"
    case "$verdict" in
      *verdict=lit*)
        return 0 ;;
      *)
        if [ "$attempt" -ge 3 ]; then
          printf 'arm verify: split not armed after %d attempts; stopping the run\n' "$attempt" >&2
          adb shell ": > '$REMOTE_ARMFAIL'" >/dev/null 2>&1 || true
          return 1
        fi
        adb shell ": > '$REMOTE_REARM'" >/dev/null 2>&1 || true
        # The re-arm macro takes ~1.7 s (opening rows 2..5) plus settle time.
        sleep 3.5 ;;
    esac
  done
}

stop_arm_verify() {
  local local_pid="$ARM_VERIFY_PID"
  [ -n "$local_pid" ] || return 0
  if kill -0 "$local_pid" 2>/dev/null; then
    kill -TERM "$local_pid" 2>/dev/null || true
    wait "$local_pid" 2>/dev/null || true
  fi
  ARM_VERIFY_PID=""
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

  if [ -f "$LOCAL_DEVICE_PLAN" ]; then
    fnaf_session_artifact "$LOCAL_DEVICE_PLAN" artifact_id=device-plan \
      role=compiled-device-plan authority=operational-metadata format=text/plain \
      complete=true truncated=false retention=local-only clock_domain=null \
      redaction.contains_game_media=false redaction.contains_audio=false \
      redaction.commit_safe=true
  fi
  if [ -f "$LOCAL_POLICY_ARTIFACT" ]; then
    fnaf_session_artifact "$LOCAL_POLICY_ARTIFACT" artifact_id=policy-artifact \
      role=compiled-policy-ir authority=operational-metadata format=application/json \
      complete=true truncated=false retention=local-only clock_domain=null \
      redaction.contains_game_media=false redaction.contains_audio=false \
      redaction.commit_safe=true
  fi
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
    if [ "${REACTIVE:-off}" = observe ]; then
      fnaf_session_artifact "$CAPTURE_DIR/$OUT-cue.txt" artifact_id=reactive-watch-trace \
        role=native-watchlist-observe-trace authority=primary-observation format=text/plain \
        complete=true truncated=false retention=local-only \
        clock_domain=device_shell_wall_ms redaction.contains_game_media=false \
        redaction.contains_audio=false redaction.commit_safe=true
    else
      fnaf_session_artifact "$CAPTURE_DIR/$OUT-cue.txt" artifact_id=cue-trace \
        role=cue-helper-scalar-trace authority=primary-observation format=text/plain \
        complete=true truncated=false retention=local-only \
        clock_domain=device_shell_wall_ms redaction.contains_game_media=false \
        redaction.contains_audio=false redaction.commit_safe=true
    fi
  fi
  if [ -f "$LOCAL_AUDIO_FACTS" ]; then
    fnaf_session_artifact "$LOCAL_AUDIO_FACTS" artifact_id=audio-facts \
      role=external-audio-authority-facts authority=external-audio-authority \
      format=application/x-ndjson complete=true truncated=false retention=local-only \
      clock_domain=authority_monotonic_ms redaction.contains_game_media=true \
      redaction.contains_audio=false redaction.commit_safe=false
  fi
  if [ -f "$LOCAL_CUE_SHADOW" ]; then
    fnaf_session_artifact "$LOCAL_CUE_SHADOW" artifact_id=cue-shadow-trace \
      role=non-controlling-cue-detector-windows authority=primary-observation \
      format=text/plain complete=true truncated=false retention=local-only \
      clock_domain=helper_monotonic_ns redaction.contains_game_media=false \
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
    local audio_sidecar="$audio.meta.json"
    if [ -f "$audio_sidecar" ]; then
      local audio_clock
      audio_clock="$(python3 - "$audio_sidecar" <<'PY'
import json, pathlib, sys
x = json.loads(pathlib.Path(sys.argv[1]).read_text())
start = int(x["start_ns"]); frames = int(x["frames"]); rate = int(x["rate"])
print("%d %d" % (start, start + frames * 1_000_000_000 // rate))
PY
)"
      fnaf_session_record clock domain=helper_monotonic_ns kind=monotonic units=ns \
        "origin_note=System.nanoTime in the cue-helper process; PCM sample zero and every detector event use this same axis" \
        "valid_from=${audio_clock%% *}" "valid_until=${audio_clock##* }"
      fnaf_session_artifact "$audio_sidecar" artifact_id=night-audio-anchor \
        role=pcm-clock-and-hash-sidecar authority=operational-metadata \
        format=application/json complete=true truncated=false retention=local-only \
        clock_domain=helper_monotonic_ns redaction.contains_game_media=false \
        redaction.contains_audio=false redaction.commit_safe=true
      fnaf_session_artifact "$audio" artifact_id=night-audio role=night-pcm \
        authority=primary-observation format=audio/wav complete=true truncated=false \
        retention=local-only clock_domain=helper_monotonic_ns \
        redaction.contains_game_media=true redaction.contains_audio=true \
        redaction.commit_safe=false
    else
      fnaf_session_artifact "$audio" artifact_id=night-audio role=night-pcm \
        authority=primary-observation format=audio/wav complete=true truncated=false \
        retention=local-only clock_domain=null \
        redaction.contains_game_media=true redaction.contains_audio=true \
        redaction.commit_safe=false
      fnaf_session_record note \
        "text=night PCM has no startNs sidecar, so it carries no clock domain and cannot be aligned to the recording or the runner"
    fi
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
    50)  lifecycle=aborted; reason="arm verify: the Minus Toys split never armed within the retries (cam11lit); stopping before the guaranteed Puppet death" ;;
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
  # The assembled device driver. Removed here rather than by a trap of its own,
  # so it survives for the whole run and dies with it on every exit path.
  [ -z "${REMOTE_PROGRAM:-}" ] || rm -f "$REMOTE_PROGRAM"
  finish_driver_log
  if [ "$GAME_LAUNCHED" -eq 1 ]; then
    # Make the safety stop the first device-side cleanup action. In particular,
    # do not leave a BB-disabled office alive while pulling a large recording.
    adb shell am force-stop com.scottgames.fnaf2 >/dev/null 2>&1 || true
    GAME_LAUNCHED=0
  fi
  stop_recording
  stop_audio_facts
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
  stop_cue_shadow || true
  if [ "${CUE_TRACE_REMOTE:-}" != "" ]; then
    # Stop the writer first: the loop only reads the sentinel, so this rm
    # cannot be resurrected, and the pull then copies a quiescent file.
    adb shell "rm -f ${CUE_TRACE_SENTINEL:-}" >/dev/null 2>&1 || true
    adb pull "$CUE_TRACE_REMOTE" "$CAPTURE_DIR/$OUT-cue.txt" >/dev/null 2>&1 &&
      echo "cue trace: $CAPTURE_DIR/$OUT-cue.txt" || true
    adb shell "rm -f $CUE_TRACE_REMOTE" >/dev/null 2>&1 || true
  fi
  adb shell rm -f "$REMOTE_PLAN" "$REMOTE_VIDEO" "$REMOTE_PIDFILE" "$REMOTE_READYFILE" "$REMOTE_STARTFILE" "$REMOTE_EPOCHFILE" "$REMOTE_CAPTURE_LOCK" "$REMOTE_CUE_SHADOW" "$REMOTE_CUE_SHADOW_SENTINEL" "$REMOTE_CUE_SHADOW_PIDFILE" >/dev/null 2>&1 || true
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
fnaf_session_begin "$OUT" "tools/device/trial.sh"
# Keep the exact IR artifact beside the run before any game-side work begins.
# session_close hashes it later, so the manifest proves both the canonical
# policy and the plan bytes that were sent to the phone.
if [ "$POLICY_EXECUTION_MODE" = compiled-ir ]; then
  cp "$RUN_TMP/policy-artifact.json" "$LOCAL_POLICY_ARTIFACT"
fi
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
  "DEVICE_POLICY=$DEVICE_POLICY" "MINUS_TOYS_VARIANT=${MINUS_TOYS_VARIANT:-none}" \
  "POLICY_GATE_STATUS=$POLICY_GATE_STATUS" "POLICY_EXECUTION_MODE=$POLICY_EXECUTION_MODE" \
  "CALIBRATION_STORY_NIGHT=$CALIBRATION_STORY_NIGHT" \
  "STORY_CURSOR_OBSERVED=${STORY_CURSOR_OBSERVED:-unread}" \
  "GRADE_RUN=$GRADE_RUN" "HID_TRACE_RUN=$HID_TRACE_RUN" \
  "SCREENRECORD_TIME_LIMIT=$SCREENRECORD_LIMIT" \
  "DEVICE_EPOCH_LATCH=$DEVICE_EPOCH_LATCH" "DEBUG_OVERLAYS=$DEBUG_OVERLAYS" \
  "CUE_HELPER=$CUE_HELPER" "CUE_AUDIO=$CUE_AUDIO" \
  "AUDIO_AUTHORITY_SOCKET=${AUDIO_AUTHORITY_SOCKET:-none}" "CUE_SHADOW=$CUE_SHADOW" \
  "REACTIVE=$REACTIVE" "REACTIVE_WATCH_SPEC=${WATCH_SPEC_HASH:-none}" \
  "PLAN_SPACING_MS=$PLAN_SPACING_MS" "PLAN_CONTACT_MS=$PLAN_CONTACT_MS" \
  "PILOT_OFFSET_MS=$PILOT_OFFSET_MS" \
  "BB_LEFT_CAPTURE_EVERY=$BB_LEFT_CAPTURE_EVERY" \
  "BB_CAM05_CAPTURE_EVERY=$BB_CAM05_CAPTURE_EVERY" \
  "GF_SKIP_MASK_ON_EXACT_EMPTY=$GF_SKIP_MASK_ON_EXACT_EMPTY"
# The plan is identified by its bytes, not its name. For the Minimal target,
# the controller also records the canonical policy hash and schema, binding
# the device text to the IR artifact that produced it.
if [ "$POLICY_EXECUTION_MODE" = compiled-ir ]; then
  fnaf_session_record controller \
    "policy_version=$POLICY_SCHEMA" \
    "policy_id=$POLICY_ID" \
    "policy_sha256=$POLICY_SHA256" \
    "execution_mode=$POLICY_EXECUTION_MODE" \
    "plan_id=$POLICY_ID device-plan" \
    "plan_file=$RUN_TMP/device-plan.txt" \
    "actuator=$PRESS_MODE" \
    "emitted_action_trace=$([ "$HID_TRACE_RUN" -eq 1 ] && echo hid-trace || echo null)"
else
  fnaf_session_record controller \
    "policy_version=trial/$NIGHT/$PRESS_MODE" \
    "execution_mode=$POLICY_EXECUTION_MODE" \
    "plan_id=$DEVICE_POLICY device-plan" \
    "plan_file=$RUN_TMP/device-plan.txt" \
    "actuator=$PRESS_MODE" \
    "emitted_action_trace=$([ "$HID_TRACE_RUN" -eq 1 ] && echo hid-trace || echo null)"
fi
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
if [ "$CUE_SHADOW" -eq 1 ]; then
  fnaf_session_record model model_id=bb-audio-cues kind=cue-model-v1 \
    "file=$CUE_SHADOW_MODEL" built_from_commit=unknown authorized_for=shadow-only \
    "authorized_for_game_build=$FNAF2_CALIBRATED_BUILD" \
    calibration_report=null holdout_report=null
fi
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
DEVICE_PLAN_SHA256="$(adb shell "sha256sum '$REMOTE_PLAN'" 2>/dev/null |
  tr -d '\r' | awk 'NF {print $1; exit}')"
[ "$DEVICE_PLAN_SHA256" = "$PLAN_SHA256" ] || {
  echo "device plan hash mismatch after adb push" >&2
  echo "  host:   $PLAN_SHA256" >&2
  device_plan_display="$DEVICE_PLAN_SHA256"
  [ -n "$device_plan_display" ] || device_plan_display=unavailable
  echo "  device: $device_plan_display" >&2
  exit 44
}
echo "device plan hash: $DEVICE_PLAN_SHA256"
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
# Audio facts stay on the external authority's transport. The trial can verify
# that a live authority socket exists, but it never falls back to an Android
# recorder or treats an absent fact as a negative cue.
CUE_PORT="-"
CUE_TOKEN="-"
CUE_READ_VERB="GET"
if [ "$CUE_HELPER" -eq 1 ]; then
  cue_pid="$(adb shell pidof com.fnaf2.cuehelper 2>/dev/null | tr -d '\r' | awk '{print $1}')"
  [ -n "$cue_pid" ] || { echo 'CUE_HELPER=1 but the helper is not running' >&2; exit 2; }
  cue_control="$(adb logcat -d --pid="$cue_pid" -v brief -s FnafCueHelper:I '*:S' 2>/dev/null |
    tr -d '\r' | awk '/control=(READY|DEGRADED)/ { line=$0 } END { print line }')"
  CUE_PORT="$(printf '%s\n' "$cue_control" | sed -n 's/.* port=\([^ ]*\).*/\1/p')"
  CUE_TOKEN="$(printf '%s\n' "$cue_control" | sed -n 's/.*token=\([0-9a-f][0-9a-f]*\).*/\1/p')"
  case "$CUE_PORT" in ''|*[!0-9]*) echo 'the cue helper has no live loopback port' >&2; exit 2 ;; esac
  [ "${#CUE_TOKEN}" -eq 32 ] || { echo 'no valid per-run cue-helper token' >&2; exit 2; }
  echo "cue helper: port $CUE_PORT, logging snapshots beside each left read"
  if [ "$REACTIVE" = observe ]; then
    watch_status="$("$HERE/query-cue-helper.sh" watchlist status)" || {
      echo 'REACTIVE=observe but native watchlist status failed' >&2; exit 2;
    }
    WATCH_SPEC_HASH="$(printf '%s\n' "$watch_status" |
      sed -n 's/.* spec=\([0-9a-fA-F]\{64\}\).*/\1/p')"
    [ "${#WATCH_SPEC_HASH}" -eq 64 ] || {
      echo "native watchlist status has no 64-hex spec hash: $watch_status" >&2
      exit 2;
    }
    loaded="$("$HERE/query-cue-helper.sh" watchlist load "$WATCH_SPEC_HASH")" || {
      echo "native watchlist load failed: $loaded" >&2; exit 2;
    }
    case "$loaded" in
      'OK watch=ACTIVE'*) ;;
      *) echo "native watchlist did not activate: $loaded" >&2; exit 2 ;;
    esac
    CUE_READ_VERB="READ"
    echo "reactive: observe-only native watch active spec=$WATCH_SPEC_HASH"
  fi
  if [ "$CUE_AUDIO" -eq 1 ]; then
    start_audio_facts
  fi
  if [ "$CUE_SHADOW" -eq 1 ]; then
    echo 'CUE_SHADOW is no longer an APK operation; consume fact-message-v1 from the external authority instead' >&2
    exit 2
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
      printf \"$CUE_READ_VERB $CUE_TOKEN\n\" | toybox nc -w 1 127.0.0.1 $CUE_PORT >> $CUE_TRACE_REMOTE 2>/dev/null
      printf \"\n\" >> $CUE_TRACE_REMOTE
    done' >/dev/null 2>&1 &" >/dev/null 2>&1
fi

# The program that runs on the phone is assembled from named parts under
# trial/, not carried here as a 1619-line heredoc. `sh -s` reads it from
# stdin, so a file redirect is the same delivery the heredoc was -- and
# test-trial-assembly.sh holds the assembled text byte-identical to what this
# runner used to inline, so the split cannot have changed what the phone runs.
#
# Assembled to a file rather than piped, because adb's exit status has to stay
# adb's and the driver runs in the background.
REMOTE_PROGRAM="$(mktemp "${TMPDIR:-/tmp}/fnaf2-driver.XXXXXX")"
bash "$HERE/trial/assemble.sh" > "$REMOTE_PROGRAM" || {
  echo "trial: could not assemble the device driver" >&2
  exit 2
}

# Positional coordinates keep this remote program literal and auditable.
start_driver_log
adb shell sh -s -- "$REMOTE_PIDFILE" "$REMOTE_READYFILE" "$REMOTE_STARTFILE" "$REMOTE_EPOCHFILE" "$REMOTE_CAPTURE_LOCK" \
  "$DEVICE_EPOCH_LATCH" \
  "$CYCLES" "$PRESS_MODE" "0" "$HID_LEFT_DEBUG_RAW" \
  "$([ "$DEVICE_POLICY" = minus-toys ] && echo 2 || echo 1)" "$PILOT_OFFSET_MS" "$REMOTE_HID_TRACE" \
  "$PLAN_SPACING_MS" "$PLAN_CONTACT_MS" \
  "$BB_CAM05_CAPTURE_EVERY" "$BB_CAM05_CAPTURE_START" \
  "$BB_CAM05_UNLIT" "$BB_CAM05_STOP_ON_BB" \
  "$BB_LEFT_CAPTURE_EVERY" "$BB_LEFT_CAPTURE_START" "$REMOTE_SAMPLE_DIR" \
  "$REMOTE_CHECKER_ARG" "$REMOTE_CAM05_MODEL_ARG" "$REMOTE_BB_MODEL_ARG" "$REMOTE_GF_MODEL_ARG" \
  "$GF_SKIP_MASK_ON_EXACT_EMPTY" "$POST_CAPTURE_TOUCHES_EFFECTIVE" \
  $TAP_MUTE $TAP_MONITOR $TAP_MASK $TAP_CAM_LIGHT $TAP_HALL $WIND \
  $TAP_CAM10 $TAP_CAM04 $TAP_CAM07 $TAP_CAM09 $TAP_CAM11 $TAP_CAM05 \
  "$CUE_PORT" "$CUE_TOKEN" "$REMOTE_KEEP_DIR" \
  "$REMOTE_HALTFILE" "$REMOTE_ARMWINDOW" "$REMOTE_REARM" "$REMOTE_ARMFAIL" \
  > "$DRIVER_OUTPUT_FIFO" 2>&1 < "$REMOTE_PROGRAM" &
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
start_cue_shadow
echo "$NIGHT night detected; starting timed Minus 7 interaction loop + $CYCLES cycles ($PRESS_MODE presses)"

watch_night &
WATCHDOG_PID=$!
watch_focus &
FOCUS_WATCHDOG_PID=$!
watch_arm_verify &
ARM_VERIFY_PID=$!

set +e
wait "$DRIVER_PID"
DRIVER_STATUS=$?
set -e
finish_driver_log
DRIVER_PID=""
stop_arm_verify
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
