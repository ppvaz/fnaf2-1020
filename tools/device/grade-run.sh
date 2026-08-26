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

VIDEO=""
for candidate in "$CAPTURES/$RUN.mp4" "$CAPTURES/$RUN-aborted.mp4"; do
  [ -f "$candidate" ] && VIDEO="$candidate"
done
TRACE="$CAPTURES/$RUN-hid.jsonl"
# The night's PCM, if the run kept any. Written by CUE_AUDIO=1 through the
# helper's log capture, and named by the helper rather than by the run.
AUDIO=""
for candidate in "$CAPTURES/cue-helper/calibration/$RUN"-cue-*.wav; do
  [ -f "$candidate" ] && AUDIO="$candidate"
done
CUE="$CAPTURES/$RUN-cue.txt"
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
[ -f "$CUE" ] && echo "cue trace: ${CUE##*/}" || echo "cue trace: none (run with CUE_HELPER=1)"
[ -n "$AUDIO" ] && echo "night audio: ${AUDIO##*/}" || echo "night audio: none (run with CUE_AUDIO=1)"
[ -d "$KEEP" ] && echo "kept frames: $(find "$KEEP" -name '*.raw' | wc -l | tr -d ' ')"
[ -f "$MANIFEST" ] && echo "session manifest: ${MANIFEST##*/}" || echo "session manifest: none (unmanifested run)"

fail=0
step() {
  echo
  echo "--- $1 ---"
  shift
  "$@" || { echo "  ^ FAILED"; fail=1; }
}

# 0. Does the run describe itself? A manifest is what turns a pile of
#    same-basename files into one session: which game build, which model
#    hashes, which clocks, which terminal outcome and on what evidence. The
#    v1 contract lives in tools/device/schema/ and is enforced here.
#
#    trial-minus7.sh writes one on every exit path, so an absent manifest now
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
    echo "  Run under tools/device/trial-minus7.sh, which emits one."
  fi
fi

# 1. Was it alive, and for how long? This one decides what the run *means*, so
#    it goes first: every other number below is only interesting for the
#    interval the game was actually running.
if [ -n "$REQUIRE" ]; then
  step "survival (the only number that is a run length)" \
    python3 "$HERE/grade-night.py" "$VIDEO" --require-seconds "$REQUIRE"
else
  step "survival (the only number that is a run length)" \
    python3 "$HERE/grade-night.py" "$VIDEO"
fi

# 1b. The clock, as an independent control on that interval: the HUD's first
#     frame and the 1 AM digit change, measured from the pixels. A run that
#     legitimately dies before 1 AM reports "1 AM was not found" (exit 3) --
#     that is information about the run, not an instrument failure. At 60 fps
#     for the same reason camtrace runs at 60: the 30 fps-class defaults are
#     what produced the withdrawn spacing figure.
echo
echo "--- clock transitions (HUD first frame, 1 AM) ---"
node "$HERE/clocktrace.mjs" "$VIDEO" --fps=60 || {
  status=$?
  [ "$status" -eq 3 ] || { echo "  ^ FAILED"; fail=1; }
}

# 2. What did the phone actually receive? The trace auditor is the only oracle
#    that reads a real artefact rather than a model of one.
if [ -f "$TRACE" ]; then
  step "input defects (contact lengths, released time, latched contacts, zero delays)" \
    node "$HERE/test-hid-trace.mjs" "$TRACE"

  # 2b. Did the game act on the presses? The auditor above reads the stream the
  #     phone was sent; this reads the stream against what the screen then did.
  #     A monitor press the game drops inverts every later cycle and nothing in
  #     the run notices, so a desynced run keeps producing plausible-looking
  #     schedule output for as long as the pilot keeps pressing.
  step "monitor desync (does the game agree with the pilot about the cams?)" \
    python3 "$HERE/desync-scan.py" "$RUN" --strips
fi

# 3. Did the sweeps select, and did they flash? Two independent signals that
#    fail differently -- camtrace at the recording's real 60 fps, because its
#    30 fps default is what produced the withdrawn 240 ms spacing figure.
step "camera selections" python3 "$HERE/camtrace.py" --fps 60 --min-ms 50 "$VIDEO"
step "camera light actually flashing" python3 "$HERE/sweepcheck.py" --fps 60 "$VIDEO"

# 4. What did this run actually contain? A dozen maximally-different frames,
#    tiled. The one time the frames were looked at, the whole failure was
#    obvious at a glance -- and everything needed to see it had been on disk for
#    hours. Cheap enough to do every time, so nobody has to decide to.
step "keyframes (what the run contained)" \
  python3 "$HERE/keyframes.py" "$VIDEO" --count 12

# 5. The box, and the office/mask/camera state intervals.
step "music box" python3 "$HERE/windpct.py" "$VIDEO"
step "office / mask / camera intervals" python3 "$HERE/grade-minus7.py" "$VIDEO"

# 5b. What happened, in order, and how it ended. This is the only step that can
# say `clear`: nothing else in this pipeline can recognise a 6 AM, which is why
# a won night graded as `unknown` until 2026-08-26.
step "run timeline and terminal outcome" python3 "$HERE/run-timeline.py" "$VIDEO"

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
  echo "  no audio kept for $RUN; nothing was listening. Run with CUE_AUDIO=1."
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
