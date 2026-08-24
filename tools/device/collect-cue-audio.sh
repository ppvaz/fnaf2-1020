#!/usr/bin/env bash
# Collect labeled Balloon Boy vocal audio by cold-starting short nights.
#
#   tools/device/collect-cue-audio.sh [rounds] [seconds] [label]
#
# **Device action.** It cold-starts FNaF, presses 6th Night, mutes the opening
# call, and waits while Balloon Boy takes his route. It sends no other input:
# surviving is not the point, and a run that dies still contains the vocals.
#
# Plan 08 package 1 needs labeled positive windows. Each round is one fresh
# route from CAM 10, so the vocals arrive in a known early stretch and the rest
# of the round is negative background. Rounds are recorded as session
# boundaries in a sidecar TSV, because package 2's holdout must split by
# session and never by adjacent windows from one recording.
#
# The helper must already be capturing with FNaF focused; audio is pulled from
# it, and raw game audio stays in ignored captures/.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROUNDS="${1:-4}"
SECONDS_PER="${2:-60}"
LABEL="${3:-bb-route}"
OUT_DIR="${CUE_HELPER_CALIBRATION:-captures/cue-helper/calibration}"
PACKAGE="com.fnafminus7.cuehelper"

case "$ROUNDS$SECONDS_PER" in *[!0-9]*) echo "rounds and seconds must be whole numbers" >&2; exit 2 ;; esac
# The helper buffers a night in memory and stops rather than wrapping.
budget=$(( ROUNDS * (SECONDS_PER + 30) ))
if [ "$budget" -gt 450 ]; then
  echo "requested ~${budget}s exceeds the helper's 480 s buffer; reduce rounds" >&2
  exit 2
fi

. "$HERE/select-adb.sh"
adb get-state >/dev/null
source "$HERE/coords.sh"

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

pid="$(adb shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' | awk '{print $1}')"
case "$pid" in
  ''|*[!0-9]*) echo "cue helper is not running; start capture first" >&2; exit 1 ;;
esac

mkdir -p "$OUT_DIR"
SESSIONS="$OUT_DIR/${LABEL}-sessions.tsv"
if [ -e "$SESSIONS" ]; then
  echo "refusing to overwrite $SESSIONS" >&2
  exit 1
fi

adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard >/dev/null 2>&1 || true
adb shell cmd statusbar collapse >/dev/null 2>&1 || true

"$HERE/query-cue-helper.sh" log start >/dev/null
LOG_T0=$(date +%s)
stop_log() {
  "$HERE/query-cue-helper.sh" log stop "$LABEL" || true
}
trap stop_log EXIT HUP INT TERM

printf 'round\tstart_s\tnight_s\tend_s\tstate\n' > "$SESSIONS"
round=1
while [ "$round" -le "$ROUNDS" ]; do
  start=$(( $(date +%s) - LOG_T0 ))
  adb shell am force-stop com.scottgames.fnaf2
  sleep 1
  adb shell am start -n com.scottgames.fnaf2/.Main >/dev/null
  # A cold start shows a splash before the title takes focus; poll rather than
  # guessing a single sleep.
  # dumpsys prints more than one mCurrentFocus line and the first is often
  # `null` mid-transition, so match the package across all of them rather than
  # taking the first line.
  focused=""
  for i in $(seq 1 20); do
    if adb shell dumpsys window 2>/dev/null | grep mCurrentFocus |
        grep -q com.scottgames.fnaf2; then
      focused=yes
      break
    fi
    sleep 1
  done
  [ -n "$focused" ] || { echo "abort: game never took focus" >&2; exit 1; }
  sleep 4
  adb shell input swipe $TAP_6TH $TAP_6TH 120

  night=""
  for i in $(seq 1 40); do
    if [ "$(state)" = "night" ]; then
      night=$(( $(date +%s) - LOG_T0 ))
      break
    fi
    sleep 1
  done
  if [ -z "$night" ]; then
    echo "round $round: night never started" >&2
    printf '%d\t%d\t\t%d\tno-night\n' "$round" "$start" \
      "$(( $(date +%s) - LOG_T0 ))" >> "$SESSIONS"
    round=$(( round + 1 ))
    continue
  fi
  # Mute the opening call: samples 35-40 would sit on top of the whole early
  # stretch, which is exactly where Balloon Boy's vocals land.
  sleep 1
  adb shell input swipe $TAP_MUTE $TAP_MUTE 120
  echo "round $round: night at +${night}s, holding ${SECONDS_PER}s"
  sleep "$SECONDS_PER"
  printf '%d\t%d\t%d\t%d\tok\n' "$round" "$start" "$night" \
    "$(( $(date +%s) - LOG_T0 ))" >> "$SESSIONS"
  round=$(( round + 1 ))
done

echo "wrote $SESSIONS"
