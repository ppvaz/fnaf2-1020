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
. "$HERE/select-adb.sh"
adb get-state >/dev/null
FOCUS=$(adb shell dumpsys window 2>/dev/null |
  grep -m1 'mCurrentFocus=.*com\.scottgames\.fnaf2' || true)
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

# If this ran inside a session, the frame belongs to that session. Joining is
# the whole point of the id: a calibration frame captured during a run and the
# run's own recording are otherwise related by nothing but a basename, which is
# how Plan 09 package 1 found frames it could not attribute to a build.
# FNAF2_SESSION_RUN is exported by the runner; nothing is re-derived here.
if [ -n "${FNAF2_SESSION_RUN:-}" ]; then
  # shellcheck source=/dev/null
  source "$HERE/session.sh"
  fnaf_session_artifact "$OUTPUT" \
    "artifact_id=sample-$VIEW-$LABEL-$NAME" \
    "role=$VIEW-$LABEL-frame" authority=primary-observation \
    format=application/x-android-screencap-raw complete=true truncated=false \
    retention=local-only clock_domain=null \
    redaction.contains_game_media=true redaction.contains_audio=false \
    redaction.commit_safe=false
fi
