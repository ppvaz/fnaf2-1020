#!/bin/bash
# Measure the native classifier at the real Android screencap boundary.
set -euo pipefail

SAMPLES="${1:-20}"
LOCAL_MODEL="${2:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
LOCAL_BINARY="${TMPDIR:-/tmp}/fnaf-screencheck-android-arm64-$$"
REMOTE_BINARY="/data/local/tmp/fnaf-screencheck"
REMOTE_FRAME="/data/local/tmp/fnaf-screencheck-benchmark-$$.raw"
REMOTE_MODEL="-"

cleanup() {
  rm -f "$LOCAL_BINARY"
}
trap cleanup EXIT HUP INT TERM

case "$SAMPLES" in
  ''|*[!0-9]*) echo "samples must be a positive integer" >&2; exit 2 ;;
esac
[ "$SAMPLES" -gt 0 ] || { echo "samples must be a positive integer" >&2; exit 2; }
[ -z "$LOCAL_MODEL" ] || [ -f "$LOCAL_MODEL" ] || {
  echo "model does not exist: $LOCAL_MODEL" >&2
  exit 2
}

. "$HERE/select-adb.sh"
adb get-state >/dev/null
"$HERE/build-screencheck.sh" "$LOCAL_BINARY" >/dev/null
adb push "$LOCAL_BINARY" "$REMOTE_BINARY" >/dev/null
adb shell chmod 755 "$REMOTE_BINARY"
if [ -n "$LOCAL_MODEL" ]; then
  REMOTE_MODEL="/data/local/tmp/fnaf-screencheck-benchmark-$$.scm"
  adb push "$LOCAL_MODEL" "$REMOTE_MODEL" >/dev/null
fi

# Interleave the three measurements to limit thermal/order bias:
# - capture: SurfaceFlinger capture plus writing the full RGBA frame;
# - classify: helper startup plus a full-frame, stride-4 feature pass;
# - combined: the intended local pipeline, with no screenshot over USB.
adb shell sh -s -- "$SAMPLES" "$REMOTE_BINARY" "$REMOTE_FRAME" "$REMOTE_MODEL" <<'REMOTE' |
set -eu
samples=$1
checker=$2
frame=$3
model=$4
trap 'rm -f "$frame"; [ "$model" = - ] || rm -f "$model"' EXIT HUP INT TERM
screencap > "$frame"
set -- $(dd if="$frame" bs=1 count=8 2>/dev/null | od -An -tu4)
width=$1
height=$2

classify() {
  if [ "$model" != - ]; then
    "$checker" classify "$model"
  else
    "$checker" stats 0 0 "$width" "$height" 4
  fi
}

i=0
while [ "$i" -lt "$samples" ]; do
  start=$(date +%s%3N)
  screencap > /dev/null
  end=$(date +%s%3N)
  printf 'capture %d\n' "$((end - start))"

  start=$(date +%s%3N)
  classify < "$frame" > /dev/null
  end=$(date +%s%3N)
  printf 'classify %d\n' "$((end - start))"

  start=$(date +%s%3N)
  screencap | classify > /dev/null
  end=$(date +%s%3N)
  printf 'combined %d\n' "$((end - start))"
  i=$((i + 1))
done
REMOTE
awk -v expected="$SAMPLES" '
  {
    label = $1
    count[label]++
    value[label, count[label]] = $2
    sum[label] += $2
    if (!(label in minimum) || $2 < minimum[label]) minimum[label] = $2
    if (!(label in maximum) || $2 > maximum[label]) maximum[label] = $2
  }
  END {
    labels[1] = "capture"
    labels[2] = "classify"
    labels[3] = "combined"
    print "path       n    min    p50    p95    max    mean (milliseconds)"
    for (which = 1; which <= 3; which++) {
      label = labels[which]
      n = count[label]
      if (n == 0) {
        printf "%-9s %3d %6s %6s %6s %6s %7s\n", \
          label, 0, "-", "-", "-", "-", "-"
        incomplete = 1
        continue
      }
      if (n != expected) incomplete = 1
      for (i = 1; i <= n; i++) sorted[i] = value[label, i]
      for (i = 2; i <= n; i++) {
        held = sorted[i]
        j = i - 1
        while (j >= 1 && sorted[j] > held) {
          sorted[j + 1] = sorted[j]
          j--
        }
        sorted[j + 1] = held
      }
      p50 = sorted[int((n - 1) * 0.50) + 1]
      p95 = sorted[int((n - 1) * 0.95) + 1]
      printf "%-9s %3d %6d %6d %6d %6d %7.1f\n", \
        label, n, minimum[label], p50, p95, maximum[label], sum[label] / n
      for (i = 1; i <= n; i++) delete sorted[i]
    }
    if (incomplete) {
      print "benchmark incomplete: every path must produce " expected " samples" > "/dev/stderr"
      exit 1
    }
  }
'

echo "installed reusable helper at $REMOTE_BINARY"
