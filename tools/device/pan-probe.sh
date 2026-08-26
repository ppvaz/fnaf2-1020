#!/bin/bash
# Measure the office pan on a connected phone. A device probe, not a grader.
#
# The office view pans, and until 2026-08-26 this repository knew that only as
# an accident: two nights were lost to a finger that missed a light hitbox and
# landed in the edge band instead ("started panning view instead of flashing",
# "fails to press hall light and moves the vision instead"). plans/10 package 0
# turns the vocabulary into something measured, and this is the pan's half.
#
# What the source already settles (frame 3, via tools/dump/readdump.py):
# `camera follow 2` integrates a velocity into a scroll clamped to [512, 1088],
# the night opens at 512 -- the minimum, so at one extreme -- and the drive is a
# hold-at-edge with the velocity re-derived from the touch X every frame. No
# game rule reads the position. So the pan is not a gate; it is a cost, and a
# cost has to be measured on the actuator that pays it.
#
# What only the phone can say, and what this measures:
#   - which screen X actually pans, and in which direction
#   - the full traverse in device pixels
#   - how long the traverse takes, which is the number a schedule must budget
#   - that the resting position really is an extreme
#
#   tools/device/pan-probe.sh            # requires a live night on the phone
#
# Every measurement is bracketed by screenstate.py. A night that ends mid-probe
# invalidates everything after it, and the flat-strip refusal in pan-shift.py is
# the backstop for the frames themselves.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${PAN_PROBE_OUT:-$(mktemp -d "${TMPDIR:-/tmp}/fnaf2-pan-XXXXXX")}"
# Deep inside each edge band, and a y clear of the HUD bars and the gesture strip.
LEFT_X="${PAN_LEFT_X:-60}"
RIGHT_X="${PAN_RIGHT_X:-2200}"
PROBE_Y="${PAN_PROBE_Y:-400}"
# Long enough to reach the clamp from either end at the fastest band.
SETTLE_MS="${PAN_SETTLE_MS:-2000}"

source "$HERE/coords.sh"

shot() { adb exec-out screencap -p > "$OUT/$1.png"; }
state() { adb exec-out screencap -p | python3 "$HERE/screenstate.py" 2>/dev/null || echo unknown; }
shift_px() { python3 "$HERE/pan-shift.py" "$OUT/$1.png" "$OUT/$2.png" || true; }
hold() { adb shell input swipe "$1" "$2" "$1" "$2" "$3" >/dev/null 2>&1; }

require_night() {
  local s
  s=$(state)
  [ "$s" = night ] || {
    echo "abort: the game is not in a night ($s); a pan cannot be measured off the office view" >&2
    exit 1
  }
}

to_rest() { hold "$LEFT_X" "$PROBE_Y" "$SETTLE_MS"; sleep 0.4; }

echo "pan probe: frames in $OUT"
require_night
to_rest
shot rest

# 1. Is the resting position an extreme? The source says the night opens at the
#    clamp minimum; if that is true, holding further in the same direction can
#    move nothing at all.
hold "$LEFT_X" "$PROBE_Y" "$SETTLE_MS"; sleep 0.4; shot rest2
printf 'rest is an extreme (expect shift 0):   '; shift_px rest rest2
require_night

# 2. The full traverse, and the time to reach it. The clamp makes every hold
#    past the traverse time land on the same position, which is itself the
#    check that the number is the clamp and not the end of the hold.
for ms in 100 200 300 400 600 1200; do
  to_rest
  hold "$RIGHT_X" "$PROBE_Y" "$ms"; sleep 0.4; shot "d$ms"
  printf 'hold right %5s ms:                   ' "$ms"; shift_px rest "d$ms"
done
require_night

# 3. Where the band starts. Everything outside it must measure zero, which is
#    what makes a coordinate safe to press without panning.
to_rest
for x in 1400 1500 1600 1700 1800 1900; do
  hold "$x" "$PROBE_Y" "$SETTLE_MS"; sleep 0.4; shot "x$x"
  printf 'hold x=%-5s (band edge sweep):        ' "$x"; shift_px rest "x$x"
  to_rest
done

# 4. And back. A pan that cannot be undone is not a vocabulary entry.
to_rest
shot back
printf 'returns to rest (expect shift 0):      '; shift_px rest back
require_night
echo "pan probe: complete, night still live"
