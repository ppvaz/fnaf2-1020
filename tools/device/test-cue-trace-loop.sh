#!/bin/bash
# The cue-trace loop's kill switch must be a file the loop never writes.
#
# The first form used one file as both sentinel and output, so cleanup's rm
# was resurrected by the loop's own appends unless it landed in the sliver
# between the last append and the next -e test. Nine orphaned loops
# accumulated on the phone, spamming the helper with stale tokens at ~14 Hz
# each and putting 1-3% of legitimate cue reads into ~1 s SYN-retransmit
# stalls. This runs the shipped loop body locally -- no phone, no adb -- and
# asserts that removing the sentinel actually ends it.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
RUNNER="$HERE/trial.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/fnaf2-cue-trace-test.XXXXXX")"
loop=""
cleanup() {
  [ -n "$loop" ] && kill "$loop" 2>/dev/null || true
  rm -rf "$TMP"
}
trap cleanup EXIT HUP INT TERM

fail() { echo "$1" >&2; exit 1; }

# Lift the remote loop out of the runner's adb-shell string, so the test runs
# the shipped source rather than a copy. The \" and \$ escapes exist for the
# host-side double quoting and are undone here.
body="$(awk '
  /nohup sh -c/ { inside = 1; next }
  inside && /^ *done/ { print "done"; exit }
  inside { print }
' "$RUNNER" | sed 's/\\"/"/g; s/\\\$/$/g')"
case "$body" in
  *CUE_TRACE_SENTINEL*while*CUE_TRACE_SENTINEL*) ;;
  *) fail "could not extract a sentinel-gated cue-trace loop from the runner" ;;
esac

export CUE_TRACE_SENTINEL="$TMP/cue.run"
export CUE_TRACE_REMOTE="$TMP/cue.txt"
export CUE_TOKEN=0123456789abcdef0123456789abcdef
export CUE_PORT=1

sh -c "$body" &
loop=$!

for _ in $(seq 1 50); do [ -s "$CUE_TRACE_REMOTE" ] && break; sleep 0.1; done
[ -s "$CUE_TRACE_REMOTE" ] || fail "the loop produced no trace output"
[ -e "$CUE_TRACE_SENTINEL" ] || fail "the sentinel disappeared on its own"
[ -s "$CUE_TRACE_SENTINEL" ] && fail "the loop writes into its own kill switch"

rm "$CUE_TRACE_SENTINEL"
for _ in $(seq 1 50); do kill -0 "$loop" 2>/dev/null || break; sleep 0.1; done
if kill -0 "$loop" 2>/dev/null; then
  fail "the loop survived sentinel removal"
fi
[ -e "$CUE_TRACE_SENTINEL" ] && fail "the loop resurrected its sentinel"

echo "cue trace loop tests passed"
