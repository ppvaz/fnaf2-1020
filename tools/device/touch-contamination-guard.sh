#!/bin/bash
# Mark a device run dirty when a physical touchscreen contact occurs.
#
# The scripted probes use a virtual HID device. The calibrated handset's
# physical touchscreen is a separate direct input device, so watching that
# device does not confuse planned HID reports with an operator touch. This is
# deliberately a post-run gate: the raw event log is retained and a dirty run
# exits non-zero, but the wrapped command is allowed to unwind its own cleanup
# first. A future caller may add a live abort without changing the evidence
# contract here.
#
# Usage:
#   touch-contamination-guard.sh RUN -- COMMAND [ARGS...]
#
# Outputs:
#   captures/RUN-touch.log
#   RUN DIRTY ... (exit 42) when an unplanned physical contact was observed
#   RUN CLEAN ... when no physical contact was observed
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CAPTURES="$HERE/../../captures"
RUN="${1:-}"
[ -n "$RUN" ] && [ "${2:-}" = "--" ] || {
  echo "usage: touch-contamination-guard.sh RUN -- COMMAND [ARGS...]" >&2
  exit 2
}
shift 2
[ "$#" -gt 0 ] || {
  echo "missing command after --" >&2
  exit 2
}
case "$RUN" in
  ''|.*|*..*|*[!A-Za-z0-9_-]*)
    echo "RUN must use letters, numbers, dash, or underscore" >&2
    exit 2
    ;;
esac

# shellcheck source=select-adb.sh
. "$HERE/select-adb.sh"

mkdir -p "$CAPTURES"
TOUCH_LOG="$CAPTURES/${RUN}-touch.log"
[ ! -e "$TOUCH_LOG" ] || {
  echo "refusing to overwrite $TOUCH_LOG" >&2
  exit 2
}

# Resolve the direct touchscreen by its input capability rather than assuming
# event8 forever. The Moto g56 currently calls it chipone-tddi; the capability
# check keeps this usable if the kernel renumbers the event node.
TOUCH_DEVICE="$(
  adb shell getevent -pl 2>/dev/null | tr -d '\r' | awk '
    /add device/ { device=$4 }
    /name:/ && tolower($0) ~ /touch|tddi/ { print device }
  ' | head -n 1
)"
case "$TOUCH_DEVICE" in
  /dev/input/event[0-9]*) ;;
  *)
    echo "could not resolve the physical touchscreen input device" >&2
    exit 1
    ;;
esac

WATCH_PID=""
COMMAND_PID=""
status=0

finish() {
  local trap_status=$?
  set +e
  if [ -n "$COMMAND_PID" ]; then
    kill "$COMMAND_PID" 2>/dev/null || true
    wait "$COMMAND_PID" 2>/dev/null || true
  fi
  if [ -n "$WATCH_PID" ]; then
    kill "$WATCH_PID" 2>/dev/null || true
    wait "$WATCH_PID" 2>/dev/null || true
  fi

  # Position/tracking/key rows are the contact evidence. Device discovery or
  # an empty stream is not contamination and must remain visible in the log.
  touch_events=$(grep -Ec 'ABS_MT_(POSITION_X|POSITION_Y|TRACKING_ID)|BTN_TOUCH' \
    "$TOUCH_LOG" 2>/dev/null || true)
  if [ "${touch_events:-0}" -gt 0 ]; then
    printf 'RUN DIRTY reason=unplanned-physical-touch device=%s events=%s log=%s\n' \
      "$TOUCH_DEVICE" "$touch_events" "$TOUCH_LOG"
    [ "$trap_status" -eq 0 ] && trap_status=42
  else
    printf 'RUN CLEAN reason=no-physical-touch device=%s log=%s\n' \
      "$TOUCH_DEVICE" "$TOUCH_LOG"
  fi
  exit "$trap_status"
}
trap finish EXIT HUP INT TERM

adb shell getevent -lt "$TOUCH_DEVICE" >"$TOUCH_LOG" 2>&1 &
WATCH_PID=$!
# Give adb's reader a scheduling turn before the first menu/game action.
sleep 0.1

set +e
"$@" &
COMMAND_PID=$!
wait "$COMMAND_PID"
status=$?
COMMAND_PID=""
set -e
exit "$status"
