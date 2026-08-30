#!/bin/bash
# Fixtures for the cam11lit arm verifier, and the controls the verdict needs.
#
# The crops are cut from the two 2026-08-29 `--minimal` recordings the
# instrument's bands were measured on (see cam11lit.py's header): lit.png from
# the armed r2 frame at 125 s, unlit.png from the not-armed r3 frame at 125 s,
# office.png and menu.png from r3 where the monitor map cannot be on screen at
# all. The last two are the never-lit control direction: a classifier whose
# answer is "lit" on a screen without a map is worse than useless, because the
# verify would re-arm into the office.
#
# The fixtures are 72x26 crops, so each case is composited into a black
# 1280x576 frame at the instrument's crop position before classification --
# this pins the normalized-fraction arithmetic, not just the thresholds. The
# portrait case does the same on a 576x1280 canvas at the inverse-mapped
# position, pinning the rotation convention decode() uses.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
FIXTURES="$HERE/fixtures/cam11lit"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cam11lit-test.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT HUP INT TERM

ffmpeg -v error -f lavfi -i color=black:s=1280x576 -frames:v 1 "$TMP_DIR/canvas.png"

classify() { # fixture out_x out_y -> prints the verdict word
  ffmpeg -v error -i "$TMP_DIR/canvas.png" -i "$FIXTURES/$1" \
    -filter_complex "overlay=$2:$3" -frames:v 1 -c:v png -f image2pipe - \
    | python3 "$HERE/cam11lit.py"
}

expect() { # want verdict label
  local want=$1 got=$2 label=$3
  if [ "$got" != "$want" ]; then
    echo "FAIL $label: expected verdict=$want, got: $got" >&2
    exit 1
  fi
  echo "ok $label: $got"
}

for case in lit:lit unlit:unlit office:unlit menu:unlit; do
  fixture=${case%%:*}; want=${case##*:}
  verdict=$(classify "$fixture.png" 1152 336 | sed -n 's/.*verdict=\([a-z]*\).*/\1/p')
  expect "$want" "$verdict" "$fixture"
done

# Portrait: decode() rotates 90 degrees CW, so landscape (1152..1224,
# 336..362) comes from portrait cols 336..362, rows 55..127 -- transpose the
# fixture the same way and overlay it there.
ffmpeg -v error -f lavfi -i color=black:s=576x1280 -frames:v 1 "$TMP_DIR/portrait.png"
ffmpeg -v error -i "$FIXTURES/lit.png" -vf transpose=1 "$TMP_DIR/lit-cw.png"
verdict=$(ffmpeg -v error -i "$TMP_DIR/portrait.png" -i "$TMP_DIR/lit-cw.png" \
  -filter_complex "overlay=336:55" -frames:v 1 -c:v png -f image2pipe - \
  | python3 "$HERE/cam11lit.py" | sed -n 's/.*verdict=\([a-z]*\).*/\1/p')
expect lit "$verdict" "portrait-rotated-lit"

echo "cam11lit fixtures: lit/unlit/office/menu and portrait-rotated all classify as measured"
