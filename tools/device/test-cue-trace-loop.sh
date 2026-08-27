#!/bin/bash
# Every remote background loop's kill switch must be a file the loop never writes.
#
# The first form used one file as both sentinel and output, so cleanup's rm
# was resurrected by the loop's own appends unless it landed in the sliver
# between the last append and the next -e test. Nine orphaned loops
# accumulated on the phone, spamming the helper with stale tokens at ~14 Hz
# each and putting 1-3% of legitimate cue reads into ~1 s SYN-retransmit
# stalls. This runs the shipped loop bodies locally -- no phone, no adb -- and
# asserts that removing the sentinel actually ends them.
#
# The runner now ships two such loops (cue trace, cue shadow) and the second
# is the same pattern as the one that caused the outage, so both are covered
# and the count is pinned: a third loop fails this test until it is added.
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

COVERED=2
found="$(grep -c 'nohup sh -c' "$RUNNER")"
[ "$found" -eq "$COVERED" ] || fail \
  "the runner has $found remote loops but this test covers $COVERED"

# Lift a remote loop out of the runner's adb-shell string, so the test runs
# the shipped source rather than a copy. Blocks are selected by the sentinel
# they gate on, because "the first nohup" silently picked the wrong loop once
# a second one was added above it. The \" and \$ escapes exist for the
# host-side double quoting and are undone here.
extract() {
  awk -v want="$1" '
    /nohup sh -c/ { inside = 1; n = 0; hit = 0; next }
    !inside { next }
    {
      line = $0
      if (match(line, /'\''[ ]*>\/dev\/null/)) {
        prefix = substr(line, 1, RSTART - 1)
        if (prefix ~ /[^ \t]/) buf[n++] = prefix
        inside = 0
        if (hit) { for (i = 0; i < n; i++) print buf[i]; exit }
        next
      }
      if (index(line, want)) hit = 1
      buf[n++] = line
    }
  ' "$RUNNER" | sed 's/\\\\/\\/g; s/\\"/"/g; s/\\\$/$/g'
}

# A stand-in for the phone's `toybox nc`: it speaks just enough of the cue
# helper's line protocol for the loop to advance one whole window.
mkdir -p "$TMP/bin"
cat > "$TMP/bin/toybox" <<'STUB'
#!/bin/sh
read -r line || exit 1
case "$line" in
  ARM\ *)    echo "OK armed=w0 cues=all mode=shadow openNs=100 closeNs=5000000100" ;;
  RESULT\ *) echo "HIT window=w0 count=0 events= closeNs=5000000100 mode=shadow" ;;
  GET\ *)    echo "OK count=0" ;;
  *)         echo "ERR" ;;
esac
STUB
chmod +x "$TMP/bin/toybox"
PATH="$TMP/bin:$PATH"
export PATH
export CUE_TOKEN=0123456789abcdef0123456789abcdef
export CUE_PORT=1

# $1 name, $2 sentinel var, $3 sentinel path, $4 output path, $5 seconds to die
check_loop() {
  local name="$1" sentinel="$3" output="$4" deadline="$5"
  local body
  body="$(extract "$2")"
  case "$body" in
    *"while [ -e \$$2 ]"*) ;;
    *) fail "could not extract a sentinel-gated $name loop from the runner" ;;
  esac

  : > "$sentinel"
  sh -c "$body" &
  loop=$!

  local i
  for i in $(seq 1 50); do [ -s "$output" ] && break; sleep 0.1; done
  [ -s "$output" ] || fail "the $name loop produced no trace output"
  [ -e "$sentinel" ] || fail "the $name sentinel disappeared on its own"
  [ -s "$sentinel" ] && fail "the $name loop writes into its own kill switch"

  rm "$sentinel"
  for i in $(seq 1 "$deadline"); do kill -0 "$loop" 2>/dev/null || break; sleep 0.1; done
  if kill -0 "$loop" 2>/dev/null; then
    fail "the $name loop survived sentinel removal"
  fi
  loop=""
  [ -e "$sentinel" ] && fail "the $name loop resurrected its sentinel"
  return 0
}

export CUE_TRACE_SENTINEL="$TMP/cue.run"
export CUE_TRACE_REMOTE="$TMP/cue.txt"
check_loop "cue-trace" CUE_TRACE_SENTINEL "$CUE_TRACE_SENTINEL" "$CUE_TRACE_REMOTE" 50

# The shadow loop only tests its sentinel once per 5 s window, so it needs a
# longer deadline than the cue-trace loop's tight poll.
export REMOTE_CUE_SHADOW_SENTINEL="$TMP/shadow.run"
export REMOTE_CUE_SHADOW="$TMP/shadow.txt"
export REMOTE_CUE_SHADOW_PIDFILE="$TMP/shadow.pid"
check_loop "cue-shadow" REMOTE_CUE_SHADOW_SENTINEL "$REMOTE_CUE_SHADOW_SENTINEL" \
  "$REMOTE_CUE_SHADOW" 120
[ -e "$REMOTE_CUE_SHADOW_PIDFILE" ] && fail "the cue-shadow loop left its pidfile behind"

# Control: the death check above passes just as well if the loop broke out on
# its first protocol error. Prove it actually completed a whole window, so
# what killed it was the sentinel and not the stub.
grep -q '^ARM OK armed=' "$REMOTE_CUE_SHADOW" ||
  fail "the cue-shadow loop never recorded an armed window"
grep -q '^RESULT HIT ' "$REMOTE_CUE_SHADOW" ||
  fail "the cue-shadow loop never recorded a terminal result"

echo "cue trace loop tests passed"
