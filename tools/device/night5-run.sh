#!/usr/bin/env bash
# One command per Night 5 device attempt: record, run, reconstruct, reset.
#
# Every previous attempt was assembled by hand across two terminals (PROGRESS,
# 2026-09-11): start `screenrecord`, run the campaign, stop the recording, pull
# it, hash it, run `phase-reconstruct.mjs`, run `run-timeline.py`, then drive
# the phone back to the title. Six manual steps is six ways to lose an attempt,
# and mistake-register entry 6 says every aborted attempt leaves the game
# mid-night. This script is that sequence with the failure handling attached:
#
#   - fail-fast: every input path, the serial, and every downstream tool are
#     checked for EXISTENCE before the phone is touched (mistake 5: a wrong
#     tool path failed silently behind `&& echo` twice).
#   - fail-safe: an EXIT trap always stops the recording, always pulls what was
#     captured, and always drives the game back to an OBSERVED title, whether
#     the campaign passed, failed, or the operator killed it.
#
# Usage:
#   tools/device/night5-run.sh --label baseline [--bundle DIR] [--night N]
#                              [--serial ID] [--no-video] [--dry-run]
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
cd "$ROOT"

LABEL=""
BUNDLE="artifacts/night5-moved"
QUALIFICATION="docs/evidence/qualification-hid-mediaprojection-night5-20260911-seam-corrected.json"
PROFILE="hid-mediaprojection"
SERIAL="${FNAF_SERIAL:-ZF525F5BH5}"
NIGHT=5
SAVE_CURSOR=""
ARM_MODE="observe-once"
VIDEO=1
TRACE=1
TRACE_SECONDS="${FNAF_TRACE_SECONDS:-900}"
FRAME_TRACE=0
FORCE_TRACE=0
DRY=0
EXTRA=()

while [ $# -gt 0 ]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --bundle) BUNDLE="$2"; shift 2 ;;
    --qualification) QUALIFICATION="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --serial) SERIAL="$2"; shift 2 ;;
    --night) NIGHT="$2"; shift 2 ;;
    --save-cursor) SAVE_CURSOR="$2"; shift 2 ;;
    --arm-blocking) ARM_MODE="blocking"; shift ;;
    --arm-observe-once) ARM_MODE="observe-once"; shift ;;
    --no-trace) TRACE=0; shift ;;
    --force-trace) FORCE_TRACE=1; shift ;;
    --frame-trace) FRAME_TRACE=1; shift ;;
    --trace-seconds) TRACE_SECONDS="$2"; shift 2 ;;
    --no-video) VIDEO=0; shift ;;
    --dry-run) DRY=1; shift ;;
    --) shift; EXTRA+=("$@"); break ;;
    *) EXTRA+=("$1"); shift ;;
  esac
done

die() { printf 'night5-run: %s\n' "$1" >&2; exit 2; }
say() { printf '\n=== %s\n' "$1"; }

[ -n "$LABEL" ] || die "--label is required (it names the artifacts)"
[ "${SAVE_CURSOR:-}" != "" ] || SAVE_CURSOR="$NIGHT"

# ---- fail-fast: inputs and tools exist before the phone is touched ----------
TITLE_MODEL_PATH="tools/device/models/title-moto-g56-v207.json"
CAUSE_MODEL_PATH="tools/device/models/death-cause-withered-chica-moto-g56-v207.json"
TRACE_TOOL="tools/device/atrace-input.sh"
for path in "$BUNDLE/manifest.json" "$QUALIFICATION" "$TITLE_MODEL_PATH" \
            tools/device/phase-reconstruct.mjs tools/device/run-timeline.py \
            tools/device/title-observe.py tools/device/inputtrace.py \
            "$TRACE_TOOL" apps/device/src/cli.js; do
  [ -e "$path" ] || die "missing required input: $path"
done
command -v adb >/dev/null || die "adb is not on PATH"
adb -s "$SERIAL" get-state >/dev/null 2>&1 || die "device $SERIAL is not reachable"

# Mistake-register 8: ask the phone what it offers BEFORE paying for an
# instrument. This handset advertises `android.inputmethod` and no
# `android.input.inputevent`, so the Perfetto input trace can only ever produce
# NO APP DISPATCH SLICES -- and it was still wired on by default, so every
# attempt carried a 900 s trace and every pipeline printed a FAILED step for a
# question this phone cannot answer. `plans/PROGRESS.md` recorded that negative
# on 2026-08-30 and a full night was spent rediscovering it on 2026-09-11.
#
# capabilities.mjs is the one place that knows, so this asks it rather than
# re-deriving the answer here. `--force-trace` keeps the trace anyway (a
# different handset, or a deliberate SurfaceFlinger-only capture).
if [ "$TRACE" = 1 ] && [ "$FORCE_TRACE" = 0 ]; then
  if FNAF_SERIAL="$SERIAL" node -e '
      import("./tools/device/capabilities.mjs").then(m => {
        const d = m.probe(process.env.FNAF_SERIAL);
        if (d.perfettoDataSources === null) process.exit(2);
        process.exit(d.perfettoDataSources.includes("android.input.inputevent") ? 0 : 1);
      }).catch(() => process.exit(2));' 2>/dev/null; then
    :
  else
    case $? in
      1) TRACE=0
         printf 'trace    SKIPPED -- no android.input.inputevent on %s; the Perfetto\n' "$SERIAL"
         printf '         input trace cannot produce app dispatch rows here (see\n'
         printf '         npm run device:capabilities). --force-trace overrides.\n' ;;
      *) printf 'trace    capability UNREADABLE; keeping the trace on\n' >&2 ;;
    esac
  fi
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUNID="night${NIGHT}-${LABEL}-${STAMP}"
OUTDIR="artifacts/runs/$RUNID"
mkdir -p "$OUTDIR" captures
DEVICE_VIDEO="/sdcard/${RUNID}.mp4"
HOST_VIDEO="captures/${RUNID}.mp4"

printf 'run      %s\nbundle   %s\nserial   %s\nnight    %s (save cursor %s)\narm      %s\nout      %s\n' \
  "$RUNID" "$BUNDLE" "$SERIAL" "$NIGHT" "$SAVE_CURSOR" "$ARM_MODE" "$OUTDIR"

REC_PID=""
FRAME_TRACE_PID=""
FRAME_TRACE_STARTED=0
RESET_DONE=0
ANALYZED=0
CAMPAIGN_CODE=""
CAMPAIGN_DIR=""

# The Cue Helper's native frame trace, which is the instrument that measured
# the mask button's appearance in the first place (absent to 322 ms after
# monitor-down, faint at ~337 ms, fully visible at ~382.5 ms) and the one
# `actuation-frame-metric.py` and `input-frame-align.py` both read.
#
# Perfetto cannot answer the same question on this handset: it advertises
# `android.inputmethod` and no `android.input.inputevent`, so there is no app
# dispatch source to capture and `inputtrace.py` correctly reports
# NO APP DISPATCH SLICES.
#
# OPT-IN, deliberately. The trace drains the same ImageReader the executor's
# own gate reads, so a traced run is a MEASUREMENT run and not a win attempt.
# It also cannot start before the campaign: preflight force-stops the helper to
# restart capture, which would kill an in-flight trace. So it waits for the
# night to be live and starts there, covering the steady loop rather than the
# opening.
start_frame_trace() {
  [ "$FRAME_TRACE" = 1 ] || return 0
  printf 'PENDING\n' > "$OUTDIR/frame-trace.state"
  ( waited=0
    while [ "$waited" -lt 240 ]; do
      if grep -q '"type":"hid.night-go"' "$OUTDIR/campaign.log" 2>/dev/null; then
        if tools/device/query-cue-helper.sh trace start "$RUNID" >/dev/null 2>&1; then
          printf '\nframe trace started (label %s)\n' "$RUNID"
        else
          printf '\nframe trace: START FAILED -- nothing will be captured\n' >&2
          printf 'START-FAILED\n' > "$OUTDIR/frame-trace.state"
          return 0
        fi
        break
      fi
      sleep 2; waited=$((waited + 2))
    done
    if ! grep -q '"type":"hid.night-go"' "$OUTDIR/campaign.log" 2>/dev/null; then
      printf '\nframe trace: the night never went live; nothing was traced\n' >&2
      printf 'NO-NIGHT\n' > "$OUTDIR/frame-trace.state"
      return 0
    fi

    # The trace lives in the Cue Helper's projection. `restartAfterAbort` in
    # modern-campaign-ports.js calls `restartCueHelperCapture`, whose contract
    # is "stop any current helper projection" -- which drops the in-flight
    # buffer. On 2026-09-12 (night5-strokes1) that path ran after a 120 s
    # terminal-wait abort and the whole trace was lost: start reported OK, stop
    # reported "did not stop", status read OFF, and no file was ever written.
    # So the trace must be pulled the moment the NIGHT ends, never when the
    # campaign PROCESS ends. gameover/sixam lead the restart by minutes; the
    # abort event itself still leads the capture restart by a game relaunch and
    # a title wait, so it is a usable last resort.
    waited=0
    while [ "$waited" -lt 1200 ]; do
      if grep -qE '"label":"state=(gameover|sixam)"|"type":"campaign\.abort\.restart"|"type":"campaign\.attempt\.(complete|failed)"' \
           "$OUTDIR/campaign.log" 2>/dev/null; then
        pull_frame_trace "the night ended"
        return 0
      fi
      sleep 1; waited=$((waited + 1))
    done
    pull_frame_trace "the trace hit its own 1200 s cap" ) &
  FRAME_TRACE_PID=$!
  FRAME_TRACE_STARTED=1
}

# Pulls once and records what actually landed. Never pipes the stop into a
# pager: mistake-register "gates are verified by exit status" applies to any
# command whose exit code is the answer, and `| tail` returns tail's 0.
pull_frame_trace() {
  local why="$1" out="${FRAME_TRACE_OUT:-captures/frame-traces}" state before after
  state="$(cat "$OUTDIR/frame-trace.state" 2>/dev/null || echo PENDING)"
  case "$state" in PULLED|START-FAILED|NO-NIGHT|LOST) return 0 ;; esac
  printf 'PULLING\n' > "$OUTDIR/frame-trace.state"
  mkdir -p "$out"
  before="$(ls -1 "$out" 2>/dev/null | wc -l)"
  say "pulling the native frame trace ($why)"
  if FRAME_TRACE_OUT="$out" tools/device/query-cue-helper.sh trace stop; then
    after="$(ls -1 "$out" 2>/dev/null | wc -l)"
    if [ "$after" -gt "$before" ]; then
      printf 'PULLED\n' > "$OUTDIR/frame-trace.state"
      ls -1t "$out" | head -1 | tee "$OUTDIR/frame-trace.file"
      return 0
    fi
  fi
  printf 'LOST\n' > "$OUTDIR/frame-trace.state"
  printf 'night5-run: FRAME TRACE LOST -- stop did not yield a file (%s)\n' "$why" >&2
  tools/device/query-cue-helper.sh trace status 2>&1 | tail -1 >&2 || true
}

stop_frame_trace() {
  [ "$FRAME_TRACE_STARTED" = 1 ] || return 0
  FRAME_TRACE_STARTED=0
  [ -n "$FRAME_TRACE_PID" ] && kill "$FRAME_TRACE_PID" 2>/dev/null
  pull_frame_trace "the campaign process exited"
  printf 'frame trace  %s%s\n' "$(cat "$OUTDIR/frame-trace.state" 2>/dev/null || echo UNKNOWN)" \
    "$([ -s "$OUTDIR/frame-trace.file" ] && printf ' (%s)' "$(cat "$OUTDIR/frame-trace.file")")"
}

stop_recording() {
  [ "$VIDEO" = 1 ] || return 0
  [ -n "$REC_PID" ] || return 0
  say "stopping recording"
  adb -s "$SERIAL" shell 'pkill -INT screenrecord' >/dev/null 2>&1 || true
  wait "$REC_PID" 2>/dev/null || true
  REC_PID=""
  # screenrecord needs a moment to finalize the container after SIGINT.
  local waited=0
  while [ "$waited" -lt 10 ]; do
    sleep 1; waited=$((waited + 1))
    adb -s "$SERIAL" shell "pgrep screenrecord" >/dev/null 2>&1 || break
  done
  sleep 2
  if adb -s "$SERIAL" shell "test -s '$DEVICE_VIDEO'" 2>/dev/null; then
    adb -s "$SERIAL" pull "$DEVICE_VIDEO" "$HOST_VIDEO" >/dev/null 2>&1 \
      && adb -s "$SERIAL" shell "rm -f '$DEVICE_VIDEO'" >/dev/null 2>&1 || true
  fi
  if [ -s "$HOST_VIDEO" ]; then
    printf 'video    %s (%s bytes)\n' "$HOST_VIDEO" "$(stat -c %s "$HOST_VIDEO")"
    sha256sum "$HOST_VIDEO" | tee "$OUTDIR/video.sha256"
  else
    printf 'video    NONE RETAINED\n' >&2
  fi
}

# Mistake-register 6: every aborted attempt leaves the game mid-night. The
# reset is unconditional and its result is OBSERVED, never assumed.
reset_device() {
  [ "$RESET_DONE" = 0 ] || return 0
  RESET_DONE=1
  say "returning the phone to an observed title"
  adb -s "$SERIAL" shell am force-stop com.scottgames.fnaf2 >/dev/null 2>&1 || true
  sleep 2
  adb -s "$SERIAL" shell monkey -p com.scottgames.fnaf2 -c android.intent.category.LAUNCHER 1 \
    >/dev/null 2>&1 || true
  local tries=0 state=""
  while [ "$tries" -lt 20 ]; do
    sleep 2; tries=$((tries + 1))
    state="$(adb -s "$SERIAL" exec-out screencap -p \
      | TITLE_MODEL="$TITLE_MODEL_PATH" python3 tools/device/title-observe.py 2>/dev/null || true)"
    case "$state" in items=*) break ;; esac
  done
  printf 'title    %s\n' "${state:-unknown=no-read}" | tee "$OUTDIR/post-run-title.txt"
  case "$state" in
    items=*) ;;
    *) printf 'night5-run: WARNING the phone did not return to an observed title\n' >&2 ;;
  esac
}

# The full post-run pipeline. It runs from the EXIT trap, so it runs on a pass,
# on a campaign failure, and on an operator Ctrl-C alike -- Pedro's standing
# requirement is that no attempt depends on anyone remembering to invoke it.
# Every stage is independently guarded: a stage with no input says so and the
# rest still run.
analyze() {
  [ "$ANALYZED" = 0 ] || return 0
  ANALYZED=1

  CAMPAIGN_DIR="$(ls -dt artifacts/campaign-* 2>/dev/null | head -1 || true)"
  # grade-run.sh resolves the bundle by this pointer, so its modern steps run
  # without anyone passing a path.
  [ -n "$CAMPAIGN_DIR" ] && printf '%s\n' "$CAMPAIGN_DIR" > "captures/$RUNID-campaign-dir.txt"
  export GRADE_CAMPAIGN_DIR="$CAMPAIGN_DIR" GRADE_NIGHT="$NIGHT"
  {
    printf 'run          %s\n' "$RUNID"
    printf 'bundle       %s\n' "$BUNDLE"
    printf 'campaign dir %s\n' "${CAMPAIGN_DIR:-NONE}"
    printf 'campaign exit %s\n' "${CAMPAIGN_CODE:-KILLED}"
  } | tee "$OUTDIR/verdict.txt"

  if [ -n "$CAMPAIGN_DIR" ]; then
    say "modern campaign bundle"
    node tools/device/run-report.mjs --run "$CAMPAIGN_DIR" 2>&1 \
      | tee -a "$OUTDIR/verdict.txt" || true
    node tools/device/run-report.mjs --run "$CAMPAIGN_DIR" --json \
      > "$OUTDIR/run-report.json" 2>/dev/null || true

    say "delivered phase against the model band"
    node tools/device/phase-reconstruct.mjs --run "$CAMPAIGN_DIR" --night "$NIGHT" \
      --out "$OUTDIR/phase.json" 2>&1 | tee "$OUTDIR/phase.log" || true
  else
    printf 'night5-run: no campaign directory was produced; executor facts UNKNOWN\n' >&2
  fi

  # Every video instrument this repository owns, through its own aggregator.
  # grade-run.sh resolves captures/<RUN>.mp4 by name, which is why the harness
  # names the recording after the run id.
  if [ -s "$HOST_VIDEO" ]; then
    say "video instruments (grade-run.sh)"
    # Streamed, not buffered. Reading a finished log is how a still-decoding
    # pipeline gets mistaken for a stopped one; grade-run.sh now prints a
    # [k/N pct%] line per step and a heartbeat while a step runs, and that is
    # only useful if it arrives while it happens.
    tools/device/grade-run.sh "$RUNID" 2>&1 | tee "$OUTDIR/grade.log" || true
    grep -E "^(outcome|terminal|survival|  clear|  death)" "$OUTDIR/grade.log" \
      >> "$OUTDIR/verdict.txt" 2>/dev/null || true
  else
    printf 'night5-run: no retained video; every video instrument was skipped\n' >&2
    printf 'video        NONE RETAINED\n' >> "$OUTDIR/verdict.txt"
  fi

  say "verdict"
  cat "$OUTDIR/verdict.txt"
}

on_exit() {
  local code=$?
  set +e
  stop_frame_trace
  stop_recording
  analyze
  reset_device
  say "run $RUNID finished with exit code $code"
  printf 'artifacts    %s\n' "$OUTDIR"
  exit "$code"
}
trap on_exit EXIT

# ---- the attempt -----------------------------------------------------------
CAMPAIGN=(node apps/device/src/cli.js campaign
  --profile "$PROFILE" --serial "$SERIAL" --nights "$NIGHT" --max-attempts 1
  --save-cursor "$SAVE_CURSOR" --bundle "$BUNDLE" --qualification "$QUALIFICATION" --json)
# Pedro's standing direction: the arm check does not block the schedule.
#
# It is not a preference, it is the difference between a winnable night and an
# unwinnable one. In `blocking` mode the executor parks the HID stream at the
# end of the opening prefix, waits ARM_SETTLE_MS (600) plus at least one more
# 250 ms poll for a second agreeing read, and then delivers EVERY later press
# that much late -- `phaseLagMs` in adb-device-local-executor.js. The two
# retained 2026-09-11 runs measured 1320 ms and 6695 ms of it.
#
# observe-once starts the schedule first and observes alongside it, so it adds
# no suffix shift at all. That is worth having, but it is NOT by itself a phase
# fix, and nothing here should be read as one: the model's response to
# delivered phase is banded over each 1000 ms game second -- night 5 loses on
# [116.67,166.67), [316.67,366.67), [416.67,800) and [916.67,966.67) -- and the
# night origin is bracketed wider than that whole period (1852 ms on the
# 2026-09-12 run). Until the origin is pinned the delivered phase is
# effectively uniform, which is the model's own 1375/3000 uncontrolled-phase
# result. Read phase-reconstruct.mjs, never a single tolerance number.
[ "$ARM_MODE" = "observe-once" ] && CAMPAIGN+=(--arm-observe-once)
if [ "$DRY" = 1 ]; then
  printf 'DRY RUN, the phone is not actuated:\n  %s\n' "${CAMPAIGN[*]} ${EXTRA[*]:-}"
  VIDEO=0
  ANALYZED=1
  exit 0
fi
CAMPAIGN+=(--live --confirm-live)
[ "${#EXTRA[@]}" -eq 0 ] || CAMPAIGN+=("${EXTRA[@]}")

if [ "$VIDEO" = 1 ]; then
  say "starting retained recording"
  adb -s "$SERIAL" shell "rm -f '$DEVICE_VIDEO'" >/dev/null 2>&1 || true
  adb -s "$SERIAL" shell "screenrecord --size 1280x576 --bit-rate 12000000 --time-limit 0 '$DEVICE_VIDEO'" &
  REC_PID=$!
  sleep 2
  adb -s "$SERIAL" shell "pgrep screenrecord" >/dev/null 2>&1 \
    || die "screenrecord did not start"
fi

# Perfetto input dispatch, bracketing the campaign.
#
# This is the one instrument that can say whether the GAME received a press or
# whether it never arrived -- `inputtrace.py` reports app MotionEvents, contact
# lengths and latched contacts. grade-run.sh has always had the slot and has
# always printed "input trace: none" because nothing captured one.
#
# It answers the standing question about the ~13% of cycles whose mask press is
# lost: the loop presses the camdrop's monitor at +14000, the sourced
# monitor-down animation is 367 ms, and the mask press follows at +14400 -- a
# 33 ms margin. If the app received that MotionEvent and the mask did not
# toggle, the game refused it inside the animation; if the event never arrived,
# the cause is below the game and the seam is innocent.
#
# atrace-input.sh runs the command only once Perfetto reports its data sources
# started, so a trace that cannot start fails the attempt instead of quietly
# producing an untraced run.
say "campaign"
CAMPAIGN_CMD=("${CAMPAIGN[@]}")
if [ "$TRACE" = 1 ]; then
  printf 'trace    %s-input.pftrace (%ss)\n' "$RUNID" "$TRACE_SECONDS"
  CAMPAIGN_CMD=("$TRACE_TOOL" "$RUNID" "$TRACE_SECONDS" -- "${CAMPAIGN[@]}")
fi
start_frame_trace
set +e
"${CAMPAIGN_CMD[@]}" 2>&1 | tee "$OUTDIR/campaign.log"
CAMPAIGN_CODE=${PIPESTATUS[0]}
set -e
printf 'campaign exit %s\n' "$CAMPAIGN_CODE" | tee "$OUTDIR/campaign.exit"

exit "$CAMPAIGN_CODE"
