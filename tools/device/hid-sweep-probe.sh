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
[ "${#SPACINGS[@]}" -gt 0 ] || SPACINGS=(240 200 160 120)

CAPTURE_DIR="$HERE/../../captures"
LOCAL_VIDEO="$CAPTURE_DIR/$OUT.mp4"
REMOTE_VIDEO="/sdcard/$OUT.mp4"
REMOTE_STREAM="/data/local/tmp/$OUT-$$.hid"
REC_PID=""

cleanup() {
  [ -n "$REC_PID" ] && kill "$REC_PID" 2>/dev/null || true
  adb shell "am force-stop $PKG" >/dev/null 2>&1 || true
  adb shell "rm -f $REMOTE_STREAM" >/dev/null 2>&1 || true
}
trap cleanup EXIT

adb shell "pm list packages" | grep -qx "package:$PKG" || {
  echo "$PKG is not installed on this device" >&2; exit 1; }
if adb shell dumpsys window | grep -q 'isKeyguardShowing=true'; then
  echo "the device is locked; unlock it and leave the screen on, then rerun" >&2
  exit 1
fi

mkdir -p "$CAPTURE_DIR"
node "$HERE/hid-sweep-probe.mjs" "${SPACINGS[@]}" > "$CAPTURE_DIR/$OUT.hid"
adb push "$CAPTURE_DIR/$OUT.hid" "$REMOTE_STREAM" >/dev/null

adb shell "am force-stop $PKG" >/dev/null
adb shell "monkey -p $PKG -c android.intent.category.LAUNCHER 1" >/dev/null 2>&1

# dumpsys prints several mCurrentFocus lines and the first is often null
# mid-transition, so match the package across all of them rather than -m1.
for _ in $(seq 1 40); do
  if adb shell dumpsys window | grep 'mCurrentFocus' | grep -q "$PKG"; then break; fi
  sleep 0.5
done
adb shell dumpsys window | grep 'mCurrentFocus' | grep -q "$PKG" || {
  echo "the game never took focus; aborting before any input" >&2; exit 1; }
sleep 4

adb shell "screenrecord --size 1280x576 --bit-rate 3000000 --time-limit 60 $REMOTE_VIDEO" &
REC_PID=$!
sleep 1
echo "running sweeps at ${SPACINGS[*]} ms spacing"
adb shell "hid $REMOTE_STREAM" || echo "hid exited nonzero" >&2
sleep 2
kill "$REC_PID" 2>/dev/null || true
wait "$REC_PID" 2>/dev/null || true
sleep 2

adb pull "$REMOTE_VIDEO" "$LOCAL_VIDEO" >/dev/null
adb shell "rm -f $REMOTE_VIDEO" >/dev/null || true
echo
# screenrecord captures at the panel's 60 fps; camtrace's 30 fps / 100 ms
# defaults cannot resolve a sweep this short and report its selections as
# dropped. See docs/device/HID-MULTITOUCH.md.
"$HERE/camtrace.py" --fps 60 --min-ms 50 "$LOCAL_VIDEO" || CAMTRACE_FAILED=1
echo
# camtrace answers "which camera was selected". A Minus 7 sweep exists to apply
# the camera-light stun, which needs the light on *while* that camera is the
# selected feed, so a trace of selections alone cannot tell a working sweep
# from three selections in the dark -- the same distinction HID-MULTITOUCH.md
# draws when it says two Android pointer dots are not sufficient evidence.
# Grade both signals; they fail differently and that is the point.
"$HERE/sweepcheck.py" --fps 60 "$LOCAL_VIDEO" || SWEEPCHECK_FAILED=1
echo
echo "one complete 10-04-07-11 sweep is expected per spacing, in the order"
echo "requested: ${SPACINGS[*]} ms"
echo "light lead ${LIGHT_LEAD_MS:-0} ms, contact ${CONTACT_MS:-100} ms"
[ -z "${CAMTRACE_FAILED:-}" ] || echo "camtrace reported a missing selection"
[ -z "${SWEEPCHECK_FAILED:-}" ] || echo "sweepcheck reported a sweep that did not flash"
[ -z "${CAMTRACE_FAILED:-}${SWEEPCHECK_FAILED:-}" ] || exit 1
