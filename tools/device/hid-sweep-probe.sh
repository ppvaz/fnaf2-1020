#!/bin/bash
# DEVICE ACTION. Measure the phone's real three-camera sweep spacing floor.
#
# The Night 6 left-opening route needs the CAM 10/04/07 sweep to span about
# 300 ms; the only spacing this repository has proven is 240 ms, which spans
# 580 ms and leaves a one-frame scheduler-phase window (see
# docs/device/HID-MULTITOUCH.md). The rejected evidence on record is for
# *batched* `hid delay` macros -- wall-timed spacing below 240 ms has never
# been tried, so the floor is unmeasured rather than known.
#
# This starts 6th Night, raises the monitor, runs one sweep per requested
# spacing with the camera light pulsed inside each selection, and grades the
# recording twice: camtrace.py for which camera was selected, sweepcheck.py for
# whether the light actually flashed on it.
#
# CONTACT_MS and LIGHT_LEAD_MS set the burst geometry. The runner ships a zero
# lead so the select and the light share one 100 ms contact; a positive lead
# spends the light's own contact and is kept only to reproduce older
# recordings.
#
# It defends nothing: the night is expected to end to W. Foxy shortly after the
# sweeps, which is why the sweeps run first.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=select-adb.sh
. "$HERE/select-adb.sh"

PKG=com.scottgames.fnaf2
OUT="${OUT:-hid-sweep-probe}"
SPACINGS=("$@")
[ "${#SPACINGS[@]}" -gt 0 ] || SPACINGS=(240 160 120 100)
# REPEAT=N runs the whole spacing list N times back to back -- a stability
# probe: does EVERY sweep light all three cameras, or only most of them?
if [ "${REPEAT:-1}" -gt 1 ]; then
  base=("${SPACINGS[@]}"); SPACINGS=()
  for _ in $(seq 1 "$REPEAT"); do SPACINGS+=("${base[@]}"); done
fi
# The recording must outlast the run. A REPEAT stability probe is longer than
# the 60 s a single run needs; the night still dies to Foxy eventually.
REC_SECONDS="${REC_SECONDS:-60}"
case "$REC_SECONDS" in ""|*[!0-9]*) echo "REC_SECONDS must be a whole number of seconds" >&2; exit 2 ;; esac

CAPTURE_DIR="$HERE/../../captures"
LOCAL_VIDEO="$CAPTURE_DIR/$OUT.mp4"
REMOTE_VIDEO="/sdcard/$OUT.mp4"
REMOTE_STREAM="/data/local/tmp/$OUT-$$.hid"
REC_PID=""

cleanup() {
  [ -n "$REC_PID" ] && kill "$REC_PID" 2>/dev/null || true
  adb shell "am force-stop $PKG" >/dev/null 2>&1 || true
  adb shell "rm -f $REMOTE_STREAM /data/local/tmp/fnaf-monraise-check /data/local/tmp/fnaf-monraise-frame.raw" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! adb shell "pm list packages" | grep -Fx "package:$PKG" >/dev/null; then
  echo "$PKG is not installed on this device" >&2
  exit 1
fi
window_state="$(adb shell dumpsys window 2>/dev/null | tr -d '\r' || true)"
if grep -Fq 'isKeyguardShowing=true' <<<"$window_state"; then
  echo "the device is locked; unlock it and leave the screen on, then rerun" >&2
  exit 1
fi

mkdir -p "$CAPTURE_DIR"
# PROBE_GEN picks the stream generator. Default is the camera sweep; `raise`
# runs hid-raise-probe.mjs (monitor / mask / hall Click floor -- args are the
# post-raise gap in ms, and CONTACT_MS / MASK_TOGGLES apply).
PROBE_GEN="${PROBE_GEN:-sweep}"
case "$PROBE_GEN" in
  sweep)
    echo "geometry: select ${SELECT_MS:-33} ms, contact ${CONTACT_MS:-33} ms, light-after ${LIGHT_AFTER:-0}, held ${HELD_LIGHT:-0}, ${#SPACINGS[@]} sweep(s) at ${SPACINGS[*]} ms, rec ${REC_SECONDS}s, camtrace floor ${MIN_MS:-50} ms"
    node "$HERE/hid-sweep-probe.mjs" "${SPACINGS[@]}" > "$CAPTURE_DIR/$OUT.hid" ;;
  raise)
    echo "raise probe: contact ${CONTACT_MS:-33} ms, mask-toggles ${MASK_TOGGLES:-0}, gaps ${SPACINGS[*]} ms, rec ${REC_SECONDS}s"
    node "$HERE/hid-raise-probe.mjs" "${SPACINGS[@]}" > "$CAPTURE_DIR/$OUT.hid" ;;
  maskraise)
    echo "maskraise probe: contact ${CONTACT_MS:-33} ms, hall ${HALL_MS:-133} ms, ${ROUNDS:-3} rounds over gaps ${SPACINGS[*]} ms, rec ${REC_SECONDS}s"
    READY_MS="${READY_MS:-16000}" ROUNDS="${ROUNDS:-3}" HALL_MS="${HALL_MS:-133}" \
      SPLIT_OUT="$CAPTURE_DIR/$OUT" \
      node "$HERE/hid-maskraise-probe.mjs" "${SPACINGS[@]}" > "$CAPTURE_DIR/$OUT.hid" ;;
  monitorraise)
    echo "monitorraise probe: contact ${CONTACT_MS:-33} ms, watcher-restored, gaps ${SPACINGS[*]} ms, rec ${REC_SECONDS}s"
    SCHEDULE_OUT="$CAPTURE_DIR/$OUT.schedule.json" READY_MS="${READY_MS:-16000}" \
      SPLIT_OUT="$CAPTURE_DIR/$OUT" \
      node "$HERE/hid-monitorraise-probe.mjs" "${SPACINGS[@]}" > "$CAPTURE_DIR/$OUT.hid"
    # The watcher classifies frames with the project's monitor-ROI checker,
    # device-local, so it needs the binary on the phone.
    LOCAL_CHECKER="$(mktemp)"
    "$HERE/build-screencheck.sh" "$LOCAL_CHECKER" >/dev/null
    adb push "$LOCAL_CHECKER" /data/local/tmp/fnaf-monraise-check >/dev/null
    rm -f "$LOCAL_CHECKER"
    adb shell "chmod +x /data/local/tmp/fnaf-monraise-check" >/dev/null ;;
  *) echo "unknown PROBE_GEN: $PROBE_GEN" >&2; exit 2 ;;
esac
adb push "$CAPTURE_DIR/$OUT.hid" "$REMOTE_STREAM" >/dev/null

adb shell "am force-stop $PKG" >/dev/null
# `monkey -p` left this package stopped on the Moto g56 even though the same
# game launches normally through its explicit activity.  Use the activity
# contract already used by the collection harness, then retain the focus gate
# below so a failed launch still sends no HID input.
adb shell "am start -n $PKG/.Main" >/dev/null

# dumpsys prints several mCurrentFocus lines and the first is often null
# mid-transition, so match the package across all of them rather than -m1.
for _ in $(seq 1 40); do
  focus="$(adb shell dumpsys window 2>/dev/null | tr -d '\r' | grep 'mCurrentFocus' || true)"
  if grep -Fq "$PKG" <<<"$focus"; then break; fi
  sleep 0.5
done
focus="$(adb shell dumpsys window 2>/dev/null | tr -d '\r' | grep 'mCurrentFocus' || true)"
grep -Fq "$PKG" <<<"$focus" || {
  echo "the game never took focus; aborting before any input" >&2; exit 1; }
sleep 4

# Enter the night through the one selector that looks at the screen first.
#
# The stream used to tap a title coordinate blind as its first report. That was a sixth
# copy of the night selection -- and the only one in JavaScript, so test-menu.sh
# could not see it: its structural half grepped *.sh. menu_select refuses when
# the item is absent, when the game is not focused, and when the observation is
# stale, and it gates New Game behind a capability. A probe that presses a title
# it has not looked at is how the target device lost a save once already.
#
# PROBE_NIGHT is `sixthNight` by default because that is what this probe was
# written for; set it to `continue` on a save where 6th Night is not unlocked.
PROBE_NIGHT="${PROBE_NIGHT:-sixthNight}"
# shellcheck source=coords.sh
. "$HERE/coords.sh"
# shellcheck source=menu.sh
. "$HERE/menu.sh"
if [ "$PROBE_GEN" = maskraise ] || [ "$PROBE_GEN" = monitorraise ]; then
  # Register the HID device at the title screen and feed the trial body
  # over stdin only once the office is observed -- the canonical runner's
  # own architecture (trial/04-session.sh runs `/system/bin/hid -` as a
  # co-process for exactly this reason). Registration at the title burns
  # the ~5.1 s InputReader attach during the menu and intro; gating the
  # body on the office means the first press lands ~0.5 s after the night
  # is live instead of after a fixed prelude sized for the slowest load.
  # STREAM_MODE=file falls back to one pre-registered stream with a long
  # READY_MS (a trial pressed during the intro produces no mask interval
  # and the grader invalidates it, so the fallback is safe, just wasteful).
  STREAM_MODE="${STREAM_MODE:-stdin}"
  adb shell "screenrecord --size 1280x576 --bit-rate 3000000 --time-limit $REC_SECONDS $REMOTE_VIDEO" &
  REC_PID=$!
  FIFO="$(mktemp -u)"
  mkfifo "$FIFO"
  adb shell "hid -" < "$FIFO" > "$CAPTURE_DIR/$OUT.hid.log" 2>&1 &
  HID_PID=$!
  exec 3> "$FIFO"
  cat "$CAPTURE_DIR/$OUT.register.jsonl" >&3
  echo "hid registered over stdin at the title (pid $HID_PID, mode $STREAM_MODE)"
  if [ "$STREAM_MODE" = file ]; then
    cat "$CAPTURE_DIR/$OUT.body.jsonl" >&3
    exec 3>&-
  fi
  WATCH_PID=""
  if [ "$PROBE_GEN" = monitorraise ]; then
    # The monitorraise probe is the one blind stream that cannot restore
    # its own state: the watcher gives it eyes during the idle windows only.
    nohup python3 "$HERE/monitorraise-watch.py" "$CAPTURE_DIR/$OUT.schedule.json" \
      > "$CAPTURE_DIR/$OUT.watch.log" 2>&1 &
    WATCH_PID=$!
  fi
  menu_select "$PROBE_NIGHT" || {
    echo "abort: could not select $PROBE_NIGHT on the title screen" >&2; exit 1; }
  for _ in $(seq 1 40); do
    state="$(adb exec-out screencap -p 2>/dev/null | python3 "$HERE/screenstate.py" 2>/dev/null | tail -1)"
    [ "$state" = night ] && break
    sleep 0.25
  done
  [ "$state" = night ] || {
    echo "abort: $PROBE_NIGHT was selected but no night started (saw '$state')" >&2; exit 1; }
  if [ "$STREAM_MODE" = stdin ]; then
    echo "office observed; releasing the trial body (${SPACINGS[*]} ms gaps)"
    cat "$CAPTURE_DIR/$OUT.body.jsonl" >&3
    exec 3>&-
  fi
  # Ride out the stream; it ends on its own. Bound the wait so a hung hid
  # process cannot outlive the recording.
  for _ in $(seq 1 $((REC_SECONDS + 30))); do
    kill -0 "$HID_PID" 2>/dev/null || break
    sleep 1
  done
  kill "$HID_PID" 2>/dev/null || true
  rm -f "$FIFO"
  if [ -n "$WATCH_PID" ]; then
    # The watcher stops after the last idle window; humour it for 5 s, then
    # stop it so the wrapper never hangs on a missed anchor.
    for _ in 1 2 3 4 5; do kill -0 "$WATCH_PID" 2>/dev/null || break; sleep 1; done
    kill "$WATCH_PID" 2>/dev/null || true
    cat "$CAPTURE_DIR/$OUT.watch.log" 2>/dev/null || true
  fi
else
  menu_select "$PROBE_NIGHT" || {
    echo "abort: could not select $PROBE_NIGHT on the title screen" >&2; exit 1; }
  # And confirm the night actually started before a single report goes out. The
  # stream's timings are relative to an office that is already up.
  for _ in $(seq 1 40); do
    state="$(adb exec-out screencap -p 2>/dev/null | python3 "$HERE/screenstate.py" 2>/dev/null | tail -1)"
    [ "$state" = night ] && break
    sleep 0.5
  done
  [ "$state" = night ] || {
    echo "abort: $PROBE_NIGHT was selected but no night started (saw '$state')" >&2; exit 1; }
  adb shell "screenrecord --size 1280x576 --bit-rate 3000000 --time-limit $REC_SECONDS $REMOTE_VIDEO" &
  REC_PID=$!
  sleep 1
  echo "running sweeps at ${SPACINGS[*]} ms spacing"
  adb shell "hid $REMOTE_STREAM" || echo "hid exited nonzero" >&2
fi
sleep 2
kill "$REC_PID" 2>/dev/null || true
wait "$REC_PID" 2>/dev/null || true
sleep 2

adb pull "$REMOTE_VIDEO" "$LOCAL_VIDEO" >/dev/null
adb shell "rm -f $REMOTE_VIDEO" >/dev/null || true
echo
# screenrecord captures at the panel's 60 fps; camtrace's 30 fps / 100 ms
# defaults cannot resolve a sweep this short and report its selections as
# dropped. See docs/device/HID-MULTITOUCH.md. MIN_MS is the shortest stable
# selection counted -- lower it (never below one frame, ~17 ms) when probing
# a sweep whose per-camera dwell is under 50 ms.
# A spacing probe only passes if every requested 10->04->07->11 sequence is
# visible.  Without --expected, camtrace reports incomplete starts but exits
# successfully, turning a partial sweep into a false pass.
if [ "$PROBE_GEN" = sweep ]; then
  "$HERE/camtrace.py" --fps 60 --min-ms "${MIN_MS:-50}" \
    --expected "${#SPACINGS[@]}" "$LOCAL_VIDEO" || CAMTRACE_FAILED=1
fi
echo
# camtrace answers "which camera was selected". A Minus 7 sweep exists to apply
# the camera-light stun, which needs the light on *while* that camera is the
# selected feed, so a trace of selections alone cannot tell a working sweep
# from three selections in the dark -- the same distinction HID-MULTITOUCH.md
# draws when it says two Android pointer dots are not sufficient evidence.
# Grade both signals; they fail differently and that is the point.
if [ "$PROBE_GEN" = sweep ]; then
  "$HERE/sweepcheck.py" --fps 60 "$LOCAL_VIDEO" || SWEEPCHECK_FAILED=1
  echo
  echo "one complete 10-04-07-11 sweep is expected per spacing, in the order"
  echo "requested: ${SPACINGS[*]} ms"
  echo "light lead ${LIGHT_LEAD_MS:-0} ms, contact ${CONTACT_MS:-100} ms"
elif [ "$PROBE_GEN" = maskraise ] || [ "$PROBE_GEN" = monitorraise ]; then
  # The grader reads the emitted .hid stream for its clock, so it must be
  # handed exactly the file the phone consumed.
  python3 "$HERE/maskraise-grade.py" "$LOCAL_VIDEO" "$CAPTURE_DIR/$OUT.hid" || GRADE_FAILED=1
  echo
  echo "per-gap landing is the no-control window after the mask-off press;"
  echo "compare the transition band against MASK_RAISE_GAP_MS (267) and the"
  echo "census' never-failed 180 ms compound."
else
  echo "raise probe: each trial should show CAM 10 selected after the raise"
  echo "(CAM 11 straight through = the flip or the ${CONTACT_MS:-100} ms tap was swallowed)."
  echo "with MASK_TOGGLES=1, watch the mask overlay appear+clear and the hall light up."
fi
[ -z "${CAMTRACE_FAILED:-}" ] || echo "camtrace reported a missing selection"
[ -z "${SWEEPCHECK_FAILED:-}" ] || echo "sweepcheck reported a sweep that did not flash"
[ -z "${GRADE_FAILED:-}" ] || echo "maskraise-grade reported a grading failure"
[ -z "${CAMTRACE_FAILED:-}${SWEEPCHECK_FAILED:-}${GRADE_FAILED:-}" ] || exit 1
