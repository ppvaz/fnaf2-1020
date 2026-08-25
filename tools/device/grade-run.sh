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
# It cost a false record. Night 36 was reported at 163 s and night 37 at 153 s,
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
CUE="$CAPTURES/$RUN-cue.txt"
KEEP="$CAPTURES/screencheck-keep/$RUN"

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
[ -d "$KEEP" ] && echo "kept frames: $(find "$KEEP" -name '*.raw' | wc -l | tr -d ' ')"

fail=0
step() {
  echo
  echo "--- $1 ---"
  shift
  "$@" || { echo "  ^ FAILED"; fail=1; }
}

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

echo
echo "=============================================================="
if [ "$fail" -eq 0 ]; then
  echo "VERDICT: every instrument passed for $RUN"
else
  echo "VERDICT: at least one instrument FAILED for $RUN -- read above"
fi
echo "=============================================================="
exit "$fail"
