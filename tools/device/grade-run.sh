#!/bin/bash
# Run every instrument this repository owns against one run, and print one
# verdict.
#
# The problem this fixes is not a missing instrument. It is that we have a
# drawer full of them -- camtrace, sweepcheck, windpct, grade-minus7,
# screenstate, the HID trace auditor, the screen-model replay -- and nothing
# that runs them. So each has to be remembered, and what is not remembered is
# not checked.
#
# It cost a false record. Night 6-36 was reported at 163 s and night 6-37 at 153 s,
# both "past 2 AM". The retained frames later showed a restart card, the death
# static and the "Take cake to the children" minigame inside those intervals:
# the game had died around 70 s and the pilot kept pressing. screenstate.py
# would have said so on any of those frames. Nobody ran it.
#
# The runner did have GRADE_RUN=1. It graded "$OUT.mp4" -- and every run that
# ends in an abort saves "$OUT-aborted.mp4" instead, so for the whole of that
# session the grading step ran against a file that did not exist and said
# nothing. A pipeline that silently grades nothing is worse than no pipeline,
# because it looks like coverage.
#
# Usage: grade-run.sh RUN_NAME [--require-seconds N]
#   RUN_NAME is the OUT name a trial was launched with, e.g. n6-night-39.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CAPTURES="$HERE/../../captures"
RUN="${1:?usage: grade-run.sh RUN_NAME [--require-seconds N]}"
shift || true
REQUIRE=""
case "${1:-}" in
  --require-seconds) REQUIRE="${2:?--require-seconds needs a number}" ;;
esac

# A grader must never be allowed to take the desktop down with it.  The video
# decoders are deliberately sequential, but a malformed/long recording or a
# future non-streaming instrument can still request unbounded address space.
# Each instrument therefore gets a fresh process with a conservative virtual
# memory ceiling and wall-clock fuse.  Override only for a deliberate
# workstation-grade analysis; the default favours a failed diagnostic over an
# OOM-killed host.
GRADE_MAX_VMEM_KB="${GRADE_MAX_VMEM_KB:-2097152}"
GRADE_STEP_TIMEOUT_SECONDS="${GRADE_STEP_TIMEOUT_SECONDS:-1200}"
# Linux ffmpeg can split decode and filtering across cores even with
# `-threads 1`.  Pin the whole instrument process tree when taskset exists;
# macOS has no taskset, where the streamed decoders remain fully functional.
GRADE_CPUSET="${GRADE_CPUSET:-0}"
case "$GRADE_MAX_VMEM_KB" in ''|*[!0-9]*) echo 'GRADE_MAX_VMEM_KB must be a positive integer'; exit 2 ;; esac
case "$GRADE_STEP_TIMEOUT_SECONDS" in ''|*[!0-9]*) echo 'GRADE_STEP_TIMEOUT_SECONDS must be a positive integer'; exit 2 ;; esac
[ "$GRADE_MAX_VMEM_KB" -gt 0 ] && [ "$GRADE_STEP_TIMEOUT_SECONDS" -gt 0 ] || {
  echo 'grading resource limits must be positive'; exit 2;
}

VIDEO=""
for candidate in "$CAPTURES/$RUN.mp4" "$CAPTURES/$RUN-aborted.mp4"; do
  [ -f "$candidate" ] && VIDEO="$candidate"
done
TRACE="$CAPTURES/$RUN-hid.jsonl"
# Optional Perfetto trace produced by atrace-input.sh around the same run.
# Unlike the HID trace, this is a device-side record of dispatch and is only
# parsed when the capture exists; old runs remain gradeable but visibly lack it.
INPUT_TRACE="$CAPTURES/$RUN-input.pftrace"
SF_LATENCY="$CAPTURES/$RUN-surfaceflinger-latency.txt"
# The external authority's fact sidecar, if the trial subscribed to one. Raw
# PCM remains owned by the receiver and is not copied through the APK.
AUDIO_FACTS="$CAPTURES/$RUN-audio-facts.jsonl"
AUDIO=""
for candidate in "$CAPTURES/cue-helper/calibration/$RUN"-cue-*.wav; do
  [ -f "$candidate" ] && AUDIO="$candidate"
done
CUE="$CAPTURES/$RUN-cue.txt"
# The modern campaign bundle for this run, when one exists. A device run driven
# by night5-run.sh writes the pointer; GRADE_CAMPAIGN_DIR overrides it. The
# legacy trial.sh lane has no bundle and every modern step below says so.
CAMPAIGN_DIR="${GRADE_CAMPAIGN_DIR:-}"
if [ -z "$CAMPAIGN_DIR" ] && [ -f "$CAPTURES/$RUN-campaign-dir.txt" ]; then
  CAMPAIGN_DIR="$(cat "$CAPTURES/$RUN-campaign-dir.txt")"
fi
# Cue Helper native frame trace, pulled by `query-cue-helper.sh trace stop`
# into captures/frame-traces/. Only present when a run asked for one.
FRAME_TRACE=""
# The helper names the file LABEL-<startNs>.tsv, so the run id is a HYPHEN
# prefix, not a dot stem: on 2026-09-12 (night5-strokes3) an 11 MB trace was
# captured, pulled and then ignored because only "$RUN".* was globbed, and the
# pipeline reported "frame trace: none" for a trace sitting next to it.
for candidate in "$CAPTURES/frame-traces/$RUN".* "$CAPTURES/frame-traces/$RUN"-* \
                 "$CAPTURES/frame-traces/$RUN"; do
  [ -f "$candidate" ] && FRAME_TRACE="$candidate"
done
KEEP="$CAPTURES/screencheck-keep/$RUN"
MANIFEST="$CAPTURES/$RUN-session.json"

echo "=============================================================="
echo "run: $RUN"
echo "=============================================================="
missing=0
for artefact in "$VIDEO" "$TRACE"; do
  [ -n "$artefact" ] && [ -f "$artefact" ] || missing=1
done
[ -n "$VIDEO" ] || { echo "no capture found for $RUN (looked for $RUN.mp4 and $RUN-aborted.mp4)"; exit 2; }
echo "capture: ${VIDEO##*/}"
[ -f "$TRACE" ] && echo "hid trace: ${TRACE##*/}" || echo "hid trace: MISSING (run with HID_TRACE_RUN=1)"
[ -f "$INPUT_TRACE" ] && echo "input trace: ${INPUT_TRACE##*/}" || echo "input trace: none (run atrace-input.sh around the command)"
[ -f "$SF_LATENCY" ] && echo "SurfaceFlinger latency: ${SF_LATENCY##*/}" || echo "SurfaceFlinger latency: none (set SF_LAYER for capture)"
[ -f "$CUE" ] && echo "cue trace: ${CUE##*/}" || echo "cue trace: none (run with CUE_HELPER=1)"
[ -n "$AUDIO" ] && echo "legacy night audio: ${AUDIO##*/}" || echo "legacy night PCM: none (receiver owns live audio)"
[ -f "$AUDIO_FACTS" ] && echo "audio facts: ${AUDIO_FACTS##*/}" || echo "audio facts: none (run with external authority socket)"
[ -d "$KEEP" ] && echo "kept frames: $(find "$KEEP" -name '*.raw' | wc -l | tr -d ' ')"
[ -f "$MANIFEST" ] && echo "session manifest: ${MANIFEST##*/}" || echo "session manifest: none (unmanifested run)"
[ -n "$CAMPAIGN_DIR" ] && echo "campaign bundle: $CAMPAIGN_DIR" || echo "campaign bundle: none (legacy trial lane, or pointer not written)"
[ -n "$FRAME_TRACE" ] && echo "frame trace: ${FRAME_TRACE##*/}" || echo "frame trace: none (run query-cue-helper.sh trace start/stop around the run)"

fail=0

# The frame rate this pipeline ASSERTS, checked against the one the recording
# actually has. Nothing in this repository read a recording's real rate until
# 2026-08-26 -- there was no ffprobe anywhere in it -- while the graders
# disagreed about the number among themselves: this script passes --fps 60 to
# three of them, camtrace.py defaults to 30 and desync-scan.py decodes at
# 30/20/4. That is not academic. A 30 fps decode of a 60 fps capture is what
# produced the withdrawn 240 ms inter-selection figure: every dwell reported as
# the 0.10 s floor and read as a dropped selection, and the "device limit" it
# implied survived two days and one CLAUDE.md bullet.
#
# So the assumption is now a measurement with a control.  Use the measured
# whole-frame rate consistently: a 59 fps recording must not be analysed as
# 60 fps merely because that is the panel's nominal rate.
GRADE_FPS=60
if command -v ffprobe >/dev/null 2>&1; then
  probed="$(ffprobe -v error -select_streams v:0 -show_entries stream=avg_frame_rate \
            -of default=nw=1:nk=1 "$VIDEO" 2>/dev/null)"
  case "$probed" in
    */*)
      num="${probed%%/*}"; den="${probed##*/}"
      if [ "${den:-0}" -gt 0 ] 2>/dev/null; then
        real=$(( (num + den / 2) / den ))
        echo "capture rate: ${real} fps (ffprobe ${probed})"
        if [ "$real" -ne "$GRADE_FPS" ]; then
          echo "  using measured ${real} fps for timing-sensitive graders (nominal ${GRADE_FPS})"
          GRADE_FPS=$real
        fi
      else
        echo "capture rate: UNKNOWN(ffprobe returned '$probed')"
      fi
      ;;
    *) echo "capture rate: UNKNOWN(ffprobe returned '${probed:-nothing}')" ;;
  esac
else
  echo "capture rate: UNKNOWN(no ffprobe) -- graders below assume ${GRADE_FPS} fps"
fi
limited() {
  ( ulimit -v "$GRADE_MAX_VMEM_KB"
    if command -v taskset >/dev/null 2>&1; then
      exec nice -n 10 taskset -c "$GRADE_CPUSET" \
        timeout --foreground "$GRADE_STEP_TIMEOUT_SECONDS" "$@"
    fi
    exec nice -n 10 timeout --foreground "$GRADE_STEP_TIMEOUT_SECONDS" "$@"
  )
}

# The shared-decode step applies the same fuse per instrument itself
# (RLIMIT_AS, affinity, nice, timeout), and its ONE ffmpeg carries several
# filter branches, which need more address space than one branch did while
# staying a few frames resident per branch. So it runs without the outer
# `ulimit -v`: a hard limit here cannot be raised by a child, and the first
# end-to-end run under it died with "Cannot allocate memory" in the filter
# graph and let four instruments finish on truncated streams. Residency is
# the cgroup slice's job (night5-run.sh's systemd-run wrapper); the step's
# timeout and cpuset stay.
limited_shared() {
  if command -v taskset >/dev/null 2>&1; then
    nice -n 10 taskset -c "$GRADE_CPUSET" timeout --foreground "$GRADE_STEP_TIMEOUT_SECONDS" "$@"
    return
  fi
  nice -n 10 timeout --foreground "$GRADE_STEP_TIMEOUT_SECONDS" "$@"
}

# How many `step` calls this script can make. Conditional steps mean the real
# count is at most this, so the progress line says so rather than pretending to
# a precision it does not have.
STEP_TOTAL="$(grep -cE '^ *step(_shared)? "' "$0" 2>/dev/null || echo 0)"
STEP_INDEX=0
GRADE_STARTED_AT="$(date +%s)"
# How often a running step reports that it is still alive. A video instrument
# on a full-length capture can hold the CPU for minutes with nothing on stdout,
# and a pipeline that looks stopped gets read as stopped -- that happened on
# 2026-09-11, when a still-decoding windpct.py was reported as a pipeline that
# had quit. Silence is not a status.
GRADE_HEARTBEAT_SECONDS="${GRADE_HEARTBEAT_SECONDS:-20}"

step() {
  STEP_INDEX=$((STEP_INDEX + 1))
  local pct=0
  [ "${STEP_TOTAL:-0}" -gt 0 ] && pct=$((STEP_INDEX * 100 / STEP_TOTAL))
  local label="$1"
  local started elapsed total_elapsed
  started="$(date +%s)"
  echo
  printf '[%2d/%2d %3d%%] --- %s ---\n' "$STEP_INDEX" "$STEP_TOTAL" "$pct" "$label"
  shift
  # Heartbeat for the duration of this step, so a long decode is visibly alive.
  (
    while true; do
      sleep "$GRADE_HEARTBEAT_SECONDS"
      printf '           ... %s still running (%ds)\n' "$label" "$(( $(date +%s) - started ))"
    done
  ) &
  local beat=$!
  # `ulimit` is scoped to limited()'s subshell and inherited by
  # ffmpeg/Python/Node; timeout's --foreground keeps Ctrl-C directed at the
  # diagnostic rather than leaving a decoder behind. nice makes an explicitly
  # requested grade less likely to make the interactive desktop unusable.
  # Exit 3 means the instrument ran and is reporting something about the RUN
  # (a dark sweep, a night that died before 1 AM). Calling that a failure
  # teaches the reader to ignore the loudest lines in the log.
  limited "$@" || {
    local status=$?
    if [ "$status" -eq 3 ]; then
      echo "  ^ a result about the run, not an instrument failure"
    else
      echo "  ^ FAILED (resource-limited or diagnostic error)"; fail=1
    fi
  }
  kill "$beat" 2>/dev/null || true
  wait "$beat" 2>/dev/null || true
  elapsed=$(( $(date +%s) - started ))
  total_elapsed=$(( $(date +%s) - GRADE_STARTED_AT ))
  printf '[%2d/%2d %3d%%] %s took %ds (pipeline %ds)\n' \
    "$STEP_INDEX" "$STEP_TOTAL" "$pct" "$label" "$elapsed" "$total_elapsed"
}

# The shared-decode step: identical framing and exit semantics, but the
# instruments and their one ffmpeg run under limited_shared (see above).
step_shared() {
  STEP_INDEX=$((STEP_INDEX + 1))
  local pct=0
  [ "${STEP_TOTAL:-0}" -gt 0 ] && pct=$((STEP_INDEX * 100 / STEP_TOTAL))
  local label="$1"
  local started elapsed total_elapsed
  started="$(date +%s)"
  echo
  printf '[%2d/%2d %3d%%] --- %s ---\n' "$STEP_INDEX" "$STEP_TOTAL" "$pct" "$label"
  shift
  # Heartbeat for the duration of this step, so a long decode is visibly alive.
  (
    while true; do
      sleep "$GRADE_HEARTBEAT_SECONDS"
      printf '           ... %s still running (%ds)\n' "$label" "$(( $(date +%s) - started ))"
    done
  ) &
  local beat=$!
  # `ulimit` is scoped to limited()'s subshell and inherited by
  # ffmpeg/Python/Node; timeout's --foreground keeps Ctrl-C directed at the
  # diagnostic rather than leaving a decoder behind. nice makes an explicitly
  # requested grade less likely to make the interactive desktop unusable.
  # Exit 3 means the instrument ran and is reporting something about the RUN
  # (a dark sweep, a night that died before 1 AM). Calling that a failure
  # teaches the reader to ignore the loudest lines in the log.
  limited_shared "$@" || {
    local status=$?
    if [ "$status" -eq 3 ]; then
      echo "  ^ a result about the run, not an instrument failure"
    else
      echo "  ^ FAILED (resource-limited or diagnostic error)"; fail=1
    fi
  }
  kill "$beat" 2>/dev/null || true
  wait "$beat" 2>/dev/null || true
  elapsed=$(( $(date +%s) - started ))
  total_elapsed=$(( $(date +%s) - GRADE_STARTED_AT ))
  printf '[%2d/%2d %3d%%] %s took %ds (pipeline %ds)\n' \
    "$STEP_INDEX" "$STEP_TOTAL" "$pct" "$label" "$elapsed" "$total_elapsed"
}

# 0. Does the run describe itself? A manifest is what turns a pile of
#    same-basename files into one session: which game build, which model
#    hashes, which clocks, which terminal outcome and on what evidence. The
#    v1 contract lives in tools/device/schema/ and is enforced here.
#
#    trial.sh writes one on every exit path, so an absent manifest now
#    means either a run from before 2026-08-26 or a producer that has not been
#    wired up. Either way the absent case says so in as many words rather than
#    passing quietly -- a step that grades a file that is not there is the
#    exact failure grade-run.sh was written for.
#
#    A leftover *-session.spool.jsonl is not clutter: finalize deletes the
#    spool only once the manifest validates, so its presence is the record of
#    a session that could not describe itself.
if [ -f "$MANIFEST" ]; then
  step "session manifest (v1 provenance contract)" \
    python3 "$HERE/validate-session.py" "$MANIFEST"
else
  echo
  echo "--- session manifest (v1 provenance contract) ---"
  echo "  no ${RUN}-session.json: this run is unmanifested, so nothing below can"
  echo "  name its game build, model hashes, clock alignment or win evidence."
  echo "  Nothing was validated."
  if [ -f "$CAPTURES/$RUN-session.spool.jsonl" ]; then
    echo "  A spool IS present ($RUN-session.spool.jsonl): the session was started"
    echo "  and its manifest was refused or never finalized. Read the spool."
    fail=1
  else
    echo "  Run under tools/device/trial.sh, which emits one."
  fi
fi

# 1. Was it alive, and for how long? This one decides what the run *means*, so
#    it goes first: every other number below is only interesting for the
#    interval the game was actually running.
# It runs inside the shared-decode step below (section 3), first in its
# output order, with the same arguments it always had.
SURVIVAL_ARGS=(python3 "$HERE/grade-night.py" "$VIDEO")
[ -n "$REQUIRE" ] && SURVIVAL_ARGS+=(--require-seconds "$REQUIRE")

# 1a. What did Android's InputDispatcher deliver? This is a source-side
#     control for the rendered-video inference. A trace artifact without a
#     host parser is a diagnostic failure, not evidence that the input landed.
if [ -f "$INPUT_TRACE" ]; then
  INPUT_TRACE_ARGS=(python3 "$HERE/inputtrace.py" "$INPUT_TRACE"
    --package com.scottgames.fnaf2)
  [ -f "$SF_LATENCY" ] && INPUT_TRACE_ARGS+=(--sf-latency "$SF_LATENCY")
  step "input dispatch / frame landing (Perfetto)" "${INPUT_TRACE_ARGS[@]}"
else
  echo
  echo "--- input dispatch / frame landing (Perfetto) ---"
  echo "  no input trace kept for $RUN; rendered video cannot establish dispatch."
fi

# 1b. The clock, as an independent control on that interval: the HUD's first
#     frame and the 1 AM digit change, measured from the pixels. A run that
#     legitimately dies before 1 AM reports "1 AM was not found" (exit 3) --
#     that is information about the run, not an instrument failure. At 60 fps
#     for the same reason camtrace runs at 60: the 30 fps-class defaults are
#     what produced the withdrawn spacing figure.
echo
echo "--- clock transitions (HUD first frame, 1 AM) ---"
limited node "$HERE/clocktrace.mjs" "$VIDEO" --fps="$GRADE_FPS" || {
  status=$?
  [ "$status" -eq 3 ] || { echo "  ^ FAILED"; fail=1; }
}

# 2. What did the phone actually receive? The trace auditor is the only oracle
#    that reads a real artefact rather than a model of one.
if [ -f "$TRACE" ]; then
  step "input defects (contact lengths, released time, latched contacts, zero delays)" \
    node "$HERE/test-hid-trace.mjs" "$TRACE"

  # 2a. How far is DELIVERED from PLANNED for every wall-timed press, and does
  #     that gap re-anchor each boundary or compound across the night? The
  #     auditor above says the stream is legal; this says how close it landed
  #     to the plan. Reads the emitted plan when the run saved one, so an
  #     experiment at --device-spacing-ms=113 is graded against 113.
  DRIFT_PLAN=""
  [ -f "$CAPTURES/$RUN-device-plan.txt" ] && DRIFT_PLAN="--plan $CAPTURES/$RUN-device-plan.txt"
  step "plan-vs-phone drift (per-anchor residual, accumulation, sweep spacing)" \
    node "$HERE/drifttrace.mjs" "$TRACE" $DRIFT_PLAN

  # 2b. Did the game act on the presses? The auditor above reads the stream the
  #     phone was sent; this reads the stream against what the screen then did.
  #     A monitor press the game drops inverts every later cycle and nothing in
  #     the run notices, so a desynced run keeps producing plausible-looking
  #     schedule output for as long as the pilot keeps pressing.
  step "monitor desync (does the game agree with the pilot about the cams?)" \
    python3 "$HERE/desync-scan.py" "$RUN" --fps "$GRADE_FPS" --strips
fi

# 3. Did the sweeps select, and did they flash? Two independent signals that
#    fail differently -- camtrace at the recording's real 60 fps, because its
#    30 fps default is what produced the withdrawn 240 ms spacing figure.
#    Both run inside the shared-decode step below, with these exact arguments.
#
# 4. What did this run actually contain? A dozen maximally-different frames,
#    tiled. The one time the frames were looked at, the whole failure was
#    obvious at a glance -- and everything needed to see it had been on disk for
#    hours. Cheap enough to do every time, so nobody has to decide to.
#
# 5. The box, and the office/mask/camera state intervals.
#
# 3-5b run as ONE step over ONE decode of the recording (decode-once.py):
# every instrument keeps its own arguments and chain and reads its frames
# through framesource.py, so its bytes and its output are what they were when
# it spawned its own ffmpeg (characterised byte-identical on a final2 clip);
# what changes is that the recording is decoded once (twice, for the two
# instruments that read it a second time) instead of nine times, and the
# instruments run concurrently on GRADE_CPUSET under the per-step fuse.
# Their outputs are replayed in the order given, each under its own header,
# each with its own exit code -- 3 stays "a fact about the run".

# 5b. What happened, in order, and how it ended. This is the only step that can
# say `clear`: nothing else in this pipeline can recognise a 6 AM, which is why
# a won night graded as `unknown` until 2026-08-26.
# Shadow-only visual cause models add a named killer candidate to the terminal
# evidence. They never let a frame claim the night is over -- terminal_outcome()
# stays the authority -- so every model present is passed by default rather than
# being remembered per run. GRADE_CAUSE_MODELS overrides the set.
TIMELINE_ARGS=(python3 "$HERE/run-timeline.py" "$VIDEO")
if [ -n "${GRADE_CAUSE_MODELS:-}" ]; then
  for model in $GRADE_CAUSE_MODELS; do
    [ -f "$model" ] && TIMELINE_ARGS+=(--cause-model "$model")
  done
else
  for model in "$HERE"/models/death-cause-*.json; do
    [ -f "$model" ] && TIMELINE_ARGS+=(--cause-model "$model")
  done
fi
step_shared "video instruments over one shared decode (survival, cameras, light, keyframes, box, intervals, timeline)" \
  python3 "$HERE/decode-once.py" --cpuset "$GRADE_CPUSET" --vmem-kb "$GRADE_MAX_VMEM_KB" \
    --timeout "$GRADE_STEP_TIMEOUT_SECONDS" --max-concurrent "${GRADE_DECODE_CONCURRENCY:-7}" \
    --step "survival (the only number that is a run length)" -- "${SURVIVAL_ARGS[@]}" \
    --step "camera selections" -- python3 "$HERE/camtrace.py" --fps "$GRADE_FPS" --min-ms 50 "$VIDEO" \
    --step "camera light actually flashing" -- python3 "$HERE/sweepcheck.py" --fps "$GRADE_FPS" "$VIDEO" \
    --step "keyframes (what the run contained)" -- python3 "$HERE/keyframes.py" "$VIDEO" --count 12 \
    --step "music box" -- python3 "$HERE/windpct.py" "$VIDEO" \
    --step "office / mask / camera intervals" -- python3 "$HERE/grade-minus7.py" "$VIDEO" \
    --step "run timeline and terminal outcome" -- "${TIMELINE_ARGS[@]}"

# 5b-i. What the EXECUTOR knows, which no video instrument can see: when the
# night started, what the arm gate cost, which cycle gates had to correct the
# phone, and why the stream stopped. `phase-reconstruct.mjs` then states the
# phase the run actually delivered against the model's own response to phase.
#
# These were run by hand after every attempt until 2026-09-12 -- they were the
# slow half of each iteration, and `test-grade-run-coverage.mjs` had been
# naming phase-reconstruct.mjs as unwired the whole time, into a lane CI does
# not run.
if [ -n "$CAMPAIGN_DIR" ] && [ -d "$CAMPAIGN_DIR" ]; then
  step "campaign bundle (executor-owned facts)" \
    node "$HERE/run-report.mjs" --run "$CAMPAIGN_DIR"
  RUN_NIGHT_ARG=()
  [ -n "${GRADE_NIGHT:-}" ] && RUN_NIGHT_ARG=(--night "$GRADE_NIGHT")
  step "delivered phase vs the model band" \
    node "$HERE/phase-reconstruct.mjs" --run "$CAMPAIGN_DIR" "${RUN_NIGHT_ARG[@]}"
else
  echo
  echo "--- campaign bundle (executor-owned facts) ---"
  echo "  no campaign directory for $RUN: delivered phase, arm cost and cycle"
  echo "  gate corrections are UNKNOWN for this run. Nothing was reconstructed."
fi

# 5b-ii. Did the frames actually carry the state the actuation asked for, and
# did Android's dispatch line up with the frames that were presented? Both read
# the Cue Helper's native frame trace, which only a run that requested one has.
if [ -n "$FRAME_TRACE" ]; then
  step "native-frame state coverage for the actuation" \
    python3 "$HERE/actuation-frame-metric.py" "$FRAME_TRACE"
  # Every scheduled contact against the frames: was the button there, did the
  # effect follow, did a stall longer than the contact cover it. This is the
  # join that read night5-strokes3's two CORRECTED cycles as lost 33 ms MONITOR
  # taps inside frame stalls, after the trace had sat ungraded; exit 3 names a
  # lost contact as a fact about the run.
  if [ -n "$CAMPAIGN_DIR" ]; then
    step "scheduled contacts against frame stalls" \
      node "$HERE/tap-stall-audit.mjs" --run "$CAMPAIGN_DIR" --frame-trace "$FRAME_TRACE" --transitions
  else
    echo
    echo "--- scheduled contacts against frame stalls ---"
    echo "  a frame trace is present but no campaign directory is: the schedule"
    echo "  cannot be placed on the frames. Nothing was audited."
  fi
  # Foxy is repelled by the hallway light, and grade-run's own video counter is
  # a rendering lower bound that read 4% where the plan records a 1-in-3 drop.
  # This reads the region PixelWatch.java defines and exits 3 on a dark hall.
  if [ -f "$INPUT_TRACE" ]; then
    step "input dispatch aligned to presented frames" \
      python3 "$HERE/input-frame-align.py" "$INPUT_TRACE" "$FRAME_TRACE"
  else
    echo
    echo "--- input dispatch aligned to presented frames ---"
    echo "  a frame trace is present but no Perfetto input trace is: dispatch"
    echo "  cannot be aligned to frames. Run atrace-input.sh around the command."
  fi
else
  echo
  echo "--- native-frame state coverage for the actuation ---"
  echo "  no frame trace for $RUN: frame-level state coverage and input/frame"
  echo "  alignment are UNKNOWN. Nothing was measured."
fi

# 5c. Elegance: how many inputs the run sent against how many that night needed.
# The night comes from the session manifest, never guessed -- a route qualified
# for Night 6 and replayed on Night 1 spends most of its inputs on animatronics
# whose AI is 0, and nothing else here reports that.
RUN_LOG="$CAPTURES/$RUN-run.log"
RUN_NIGHT=""
if [ -f "$MANIFEST" ]; then
  RUN_NIGHT=$(python3 -c "
import json,sys
try:
    d=json.load(open(sys.argv[1]))
    n=d.get('target',{}).get('night')
    print(n if isinstance(n,int) and n>0 else '')
except Exception:
    print('')
" "$MANIFEST" 2>/dev/null)
fi
if [ -n "$RUN_NIGHT" ] && [ -f "$RUN_LOG" ]; then
  step "elegance (inputs sent vs needed)" \
    python3 "$HERE/elegance.py" "$RUN_LOG" --night "$RUN_NIGHT"
else
  printf '\n--- elegance (inputs sent vs needed) ---\n'
  if [ ! -f "$RUN_LOG" ]; then
    echo "  no driver log for $RUN; nothing to count. Runs before 2026-08-26 have none."
  else
    echo "  the manifest names no story night (target.night is 0 or absent), so"
    echo "  'needed' cannot be decided against the AI table. UNKNOWN(night not named)."
  fi
fi

# 6. Did Balloon Boy's vent bang reach the capture at all?
#
#    This is the instrument the drawer was missing. tools/cue/ has had a working
#    detector the whole time and grade-run.sh never called it, which is the
#    "instrument nobody runs is a comment" failure in its purest form: the
#    question "how many bangs were in that night" had never once been answered
#    with a measurement, because no run recorded any audio to answer it from.
#
#    Read the zero carefully. scan-night.sh denoises first because that takes
#    recall from 6% to 52% on injected controls, and its floor is about -12 dB
#    relative to background -- so "0 confirmed" means no bang above that, not no
#    bang. It is a bound, not a verdict.
if [ -n "$AUDIO" ]; then
  step "Balloon Boy's vent bang (sample 17; 52% recall, floor about -12 dB)" \
    bash "$HERE/../cue/scan-night.sh" "$AUDIO"
else
  echo
  echo "--- Balloon Boy's vent bang ---"
  echo "  no raw audio kept for $RUN; scan-night requires a receiver PCM capture."
  [ -f "$AUDIO_FACTS" ] || echo "  external authority facts are also absent; run with CUE_AUDIO=1 AUDIO_AUTHORITY_SOCKET=PATH."
fi

echo
echo "=============================================================="
if [ "$fail" -eq 0 ]; then
  echo "VERDICT: every instrument passed for $RUN"
else
  echo "VERDICT: at least one instrument FAILED for $RUN -- read above"
fi
echo "=============================================================="
exit "$fail"
