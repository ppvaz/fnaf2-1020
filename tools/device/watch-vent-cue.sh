#!/usr/bin/env bash
# Catch Balloon Boy arriving at the vent entrance, and keep the audio around it.
#
#   tools/device/watch-vent-cue.sh [seconds] [label]
#
# **Device action.** Cold-starts a 6th Night, mutes the opening call, then sits
# in the office holding the left vent light so the opening stays lit, polling
# the helper's snapshot throughout. It never masks and never raises the monitor:
# surviving is not the point, seeing him arrive is.
#
# The lit opening is bright when empty and black when he is in it, so a
# persistent bright->dark transition is a real g417 arrival, timestamped on the
# same monotonic clock the audio log is anchored to. That is the only ground
# truth available for the bang that does not come from the audio detector
# itself -- and the detector's own candidates turned out to be noise, so an
# independent label is the whole point.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SECONDS_TOTAL="${1:-180}"
LABEL="${2:-vent}"
OUT_DIR="${CUE_HELPER_CALIBRATION:-captures/cue-helper/calibration}"
PACKAGE="com.fnafminus7.cuehelper"

case "$SECONDS_TOTAL" in *[!0-9]*) echo "seconds must be whole" >&2; exit 2 ;; esac
[ "$SECONDS_TOTAL" -le 420 ] || { echo "helper buffers 480 s; keep under 420" >&2; exit 2; }

. "$HERE/select-adb.sh"
adb get-state >/dev/null
source "$HERE/coords.sh"

state() {
  local attempt result
  for attempt in 1 2 3; do
    if result=$(adb exec-out screencap -p 2>/dev/null |
      python3 "$HERE/screenstate.py" 2>/dev/null); then
      printf '%s\n' "$result"; return 0
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
VISUAL="$OUT_DIR/${LABEL}-visual.tsv"
[ -e "$VISUAL" ] && { echo "refusing to overwrite $VISUAL" >&2; exit 1; }

adb shell input keyevent KEYCODE_WAKEUP
adb shell cmd statusbar collapse >/dev/null 2>&1 || true
adb shell am force-stop com.scottgames.fnaf2
sleep 1
adb shell am start -n com.scottgames.fnaf2/.Main >/dev/null
focus=""
for i in $(seq 1 20); do
  focus="$(adb shell dumpsys window 2>/dev/null | tr -d '\r' |
    grep mCurrentFocus || true)"
  grep -Fq com.scottgames.fnaf2 <<<"$focus" && break
  sleep 1
done
[ -n "$focus" ] && grep -Fq com.scottgames.fnaf2 <<<"$focus" || {
  echo "abort: game never took focus" >&2; exit 1;
}
sleep 4
source "$HERE/menu.sh"
menu_select sixthNight || {
  echo "abort: could not select sixthNight on the title screen" >&2
  exit 1
}
for i in $(seq 1 40); do
  [ "$(state)" = night ] && break
  sleep 1
  [ "$i" = 40 ] && { echo "abort: night never started" >&2; exit 1; }
done
sleep 1
adb shell input swipe $TAP_MUTE $TAP_MUTE 120
echo "night up; watching the vent entrance for ${SECONDS_TOTAL}s"

"$HERE/query-cue-helper.sh" log start >/dev/null
stop_all() {
  "$HERE/query-cue-helper.sh" log stop "$LABEL" || true
}
trap stop_all EXIT HUP INT TERM

"$HERE/query-cue-helper.sh" watch "$SECONDS_TOTAL" "$VISUAL" >/dev/null 2>&1 &
WATCHER=$!

# Hold the left vent light in long presses. The office light is gated on
# mask = 0, so this run never masks; it just keeps the opening lit and looks.
deadline=$(( $(date +%s) + SECONDS_TOTAL ))
while [ "$(date +%s)" -lt "$deadline" ]; do
  adb shell input swipe $TAP_CAM_LIGHT $TAP_CAM_LIGHT 3000 >/dev/null 2>&1 || true
done
wait "$WATCHER" 2>/dev/null || true
echo "wrote $VISUAL"
