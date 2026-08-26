#!/bin/bash
# Map what a touch DOES, by screen region. A device probe, not a grader.
#
# plans/10 package 0: every interaction needs an actuation, a positive
# verification, and a precondition. This builds the map the preconditions are
# written against -- which screen regions flash the hall, which light the left
# vent, which pan the office view, and which do nothing at all.
#
# Why a map and not a coordinate list. Two nights were lost to a finger that
# missed a light hitbox and landed in the pan band instead. The event sheet
# explains why that is possible: g237 refuses to claim a touch that landed on a
# light hitbox, so buttons already win -- those fingers simply were not on one.
# A coordinate is only safe if the region around it is known, and nothing in
# this repository knew the regions.
#
# Deliberately binary. An earlier attempt measured pan DISPLACEMENT by strip
# matching and could not be trusted: at full traverse the tracked content leaves
# the strip and the matcher reported a confident +16 px three times running.
# Displacement is better read from the dump, where the scroll is an integer
# clamped to [512, 1088]. What the phone is needed for is the mapping from a
# screen coordinate to an outcome, and that is a classification, not a distance.
#
#   tools/device/region-probe.sh                 # default grid
#   PROBE_XS="1200" PROBE_YS="540" region-probe.sh
#
# Requires a live night. Every probe is bracketed by screenstate.py, and the
# night is restarted automatically when it ends -- an unattended map would
# otherwise silently record "none" for every probe after the Puppet arrives.
set -euo pipefail
export PYTHONWARNINGS=ignore

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${REGION_PROBE_OUT:-$(mktemp -d "${TMPDIR:-/tmp}/fnaf2-region-XXXXXX")}"
HOLD_MS="${PROBE_HOLD_MS:-700}"
PROBE_XS="${PROBE_XS:-100 300 500 700 900 1100 1300 1500 1700 1900 2100 2300}"
PROBE_YS="${PROBE_YS:-300 450 615 750 900}"
# The regions and thresholds live in region-classify.py, which is also the
# thing a threshold argument should be had against.

source "$HERE/coords.sh"

shot() { adb exec-out screencap -p > "$OUT/$1.png"; }
state() { adb exec-out screencap -p | python3 "$HERE/screenstate.py" 2>/dev/null || echo unknown; }
to_rest() { adb shell input swipe 60 400 60 400 2000 >/dev/null 2>&1; sleep 0.4; }

start_night() {
  adb shell am force-stop com.scottgames.fnaf2 >/dev/null 2>&1; sleep 2
  adb shell am start -n com.scottgames.fnaf2/.Main >/dev/null 2>&1; sleep 9
  ( source "$HERE/menu.sh"; menu_select continue ) >/dev/null 2>&1 || return 1
  local i
  for i in $(seq 1 20); do
    [ "$(state)" = night ] && return 0
    sleep 2
  done
  return 1
}

ensure_night() {
  [ "$(state)" = night ] && return 0
  echo "  (night ended; restarting)" >&2
  start_night || { echo "abort: could not restart a night" >&2; exit 1; }
  to_rest
}

echo "region probe: ${HOLD_MS} ms holds, frames in $OUT"
ensure_night
to_rest

printf '%6s' ''
for x in $PROBE_XS; do printf '%7s' "$x"; done; echo
for y in $PROBE_YS; do
  printf '%6s' "y=$y"
  for x in $PROBE_XS; do
    ensure_night
    to_rest
    shot pre
    ( adb shell input swipe "$x" "$y" "$x" "$y" "$HOLD_MS" >/dev/null 2>&1 ) &
    sleep 0.35; shot during; wait
    sleep 0.35; shot post

    verdict=$(python3 "$HERE/region-classify.py" "$OUT/pre.png" "$OUT/during.png" "$OUT/post.png")
    printf '%7s' "$verdict"
  done
  echo
done
to_rest
echo "region probe: complete, night state $(state)"
