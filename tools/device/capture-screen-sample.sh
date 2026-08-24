#!/bin/bash
# Capture one labeled raw Android screencap for local classifier calibration.
# This is a calibration tool: transferring the frame is intentional and never
# belongs in the live timed policy.
set -euo pipefail

VIEW="${1:-}"
LABEL="${2:-}"
NAME="${3:-}"
HOLD_X="${4:-}"
HOLD_Y="${5:-}"
HOLD_MS="${6:-900}"
# The raw screencap itself is fast enough at 180 ms, but the Android game does
# not finish drawing a newly lit office vent by then. At 350 ms the light is
# visibly stable on the calibrated Moto while a 900 ms hold still has margin.
CAPTURE_DELAY="${CAPTURE_DELAY:-0.35}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUTPUT="$HERE/../../captures/screencheck/$VIEW/$LABEL/$NAME.raw"
REMOTE="/data/local/tmp/fnaf-screen-sample-$$.raw"

plain_name() {
  case "$1" in
    ''|.*|*..*|*[!A-Za-z0-9_-]*) return 1 ;;
    *) return 0 ;;
  esac
}

plain_name "$VIEW" && plain_name "$LABEL" && plain_name "$NAME" || {
  echo "view, label, and name must use letters, numbers, dash, or underscore" >&2
  exit 2
}
if [ -n "$HOLD_X$HOLD_Y" ]; then
  case "$HOLD_X:$HOLD_Y:$HOLD_MS" in
    *[!0-9:]*) echo "hold X/Y/duration must be non-negative integers" >&2; exit 2 ;;
  esac
  [ -n "$HOLD_X" ] && [ -n "$HOLD_Y" ] || {
    echo "provide both hold X and hold Y, or neither" >&2
    exit 2
  }
  [ "$HOLD_MS" -gt 0 ] || { echo "hold duration must be positive" >&2; exit 2; }
fi
case "$CAPTURE_DELAY" in
  ''|*[!0-9.]*) echo "CAPTURE_DELAY must be a positive number" >&2; exit 2 ;;
esac

mkdir -p "$(dirname "$OUTPUT")"
[ ! -e "$OUTPUT" ] || { echo "refusing to overwrite $OUTPUT" >&2; exit 2; }
adb get-state >/dev/null
FOCUS=$(adb shell dumpsys window 2>/dev/null | grep -m1 mCurrentFocus || true)
case "$FOCUS" in
  *com.scottgames.fnaf2*) ;;
  *) echo "abort: game is not focused ($FOCUS)" >&2; exit 1 ;;
esac

cleanup() {
  adb shell rm -f "$REMOTE" >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM

if [ -n "$HOLD_X" ]; then
  # One device-side shell starts the held actuator, waits for its first stable
  # frames, and captures while it remains down. No host round trip sits between
  # the light and screenshot. Keep a hall hold under Golden Freddy's 1.67 s fuse.
  adb shell sh -s -- "$REMOTE" "$HOLD_X" "$HOLD_Y" "$HOLD_MS" "$CAPTURE_DELAY" <<'REMOTE'
set -eu
frame=$1; x=$2; y=$3; duration=$4; delay=$5
input swipe "$x" "$y" "$x" "$y" "$duration" >/dev/null 2>&1 &
press=$!
sleep "$delay"
screencap > "$frame"
wait "$press"
REMOTE
else
  adb shell "screencap > $REMOTE"
fi

adb pull "$REMOTE" "$OUTPUT" >/dev/null
echo "saved ${OUTPUT#"$HERE/../../"}"
