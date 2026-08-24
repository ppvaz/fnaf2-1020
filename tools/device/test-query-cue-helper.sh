#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cue-helper-query-test.XXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT HUP INT TERM

mkdir -p "$TEMP_DIR/bin"
ln -s "$HERE/testdata/mock-adb-cue-helper.sh" "$TEMP_DIR/bin/adb"

# The forward transport speaks a real socket, so the mock serves one rather
# than shimming the client.
python3 "$HERE/testdata/mock-control-server.py" "$TEMP_DIR/port" &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true; rm -rf "$TEMP_DIR"' EXIT HUP INT TERM
for _ in 1 2 3 4 5 6 7 8 9 10; do
  [ -s "$TEMP_DIR/port" ] && break
  sleep 0.2
done
MOCK_FORWARD_PORT="$(cat "$TEMP_DIR/port")"
export MOCK_FORWARD_PORT

for transport in loopback forward; do
  response="$(PATH="$TEMP_DIR/bin:$PATH" "$HERE/query-cue-helper.sh" "$transport")"
  case "$response" in
    'OK '*"visual=OBSERVED seq=121"*"audio=OBSERVED frames=33000"*) ;;
    *) echo "unexpected $transport response: $response" >&2; exit 1 ;;
  esac
done

if PATH="$TEMP_DIR/bin:$PATH" "$HERE/query-cue-helper.sh" carrier-pigeon 2>/dev/null; then
  echo "an unknown transport must not be queried" >&2
  exit 1
fi

echo "cue-helper query tests passed"

