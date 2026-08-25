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

# grid: both transports. The verb once called exchange before it existed and
# died on the unbound token under set -u, so this guards that it parses and
# renders at all. Cell (3,6) is the mock's one bright cell; every other cell is
# dark, so its glyph must differ from its row's.
for transport in loopback forward; do
  rendered="$(CUE_HELPER_TRANSPORT="$transport" PATH="$TEMP_DIR/bin:$PATH" \
    "$HERE/query-cue-helper.sh" grid "$TEMP_DIR/grid-$transport.png" 2>/dev/null)"
  case "$rendered" in
    *"grid 20x9 seq=121"*) ;;
    *) echo "unexpected $transport grid render: $rendered" >&2; exit 1 ;;
  esac
  bright_row="$(printf '%s\n' "$rendered" | sed -n '8p')"
  case "$bright_row" in
    *@*) ;;
    *) echo "$transport grid render lost the bright sampled cell: $bright_row" >&2; exit 1 ;;
  esac
done

# record: both transports, into a scratch directory. PRE=0 keeps the pre-roll
# wait to one second.
for transport in loopback forward; do
  out="$TEMP_DIR/cal-$transport"
  result="$(CUE_HELPER_TRANSPORT="$transport" CUE_HELPER_CALIBRATION="$out" \
    PATH="$TEMP_DIR/bin:$PATH" "$HERE/query-cue-helper.sh" record 0 1 "$transport")"
  case "$result" in
    *"OK rec=cue-"*"wrote $out/$transport-cue-"*) ;;
    *) echo "unexpected $transport record result: $result" >&2; exit 1 ;;
  esac
  [ -s "$out/$transport-cue-1700000000000-p0-q1.wav" ] || {
    echo "$transport record pulled no window" >&2; exit 1; }
done

# log: start then stop, pulling a night-length capture.
out="$TEMP_DIR/cal-log"
start="$(CUE_HELPER_CALIBRATION="$out" PATH="$TEMP_DIR/bin:$PATH" \
  "$HERE/query-cue-helper.sh" log start)"
case "$start" in
  *"OK log=started"*) ;;
  *) echo "unexpected log start: $start" >&2; exit 1 ;;
esac
stop="$(CUE_HELPER_CALIBRATION="$out" PATH="$TEMP_DIR/bin:$PATH" \
  "$HERE/query-cue-helper.sh" log stop night6)"
case "$stop" in
  *"wrote $out/night6-cue-"*) ;;
  *) echo "unexpected log stop: $stop" >&2; exit 1 ;;
esac

# A second record with the same label must not clobber the first window.
out="$TEMP_DIR/cal-loopback"
if CUE_HELPER_CALIBRATION="$out" PATH="$TEMP_DIR/bin:$PATH" \
    "$HERE/query-cue-helper.sh" record 0 1 loopback 2>/dev/null; then
  echo "record must refuse to overwrite an existing window" >&2
  exit 1
fi

echo "cue-helper query tests passed"

