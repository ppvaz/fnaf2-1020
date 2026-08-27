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

# The live detector is shadow-only until its model says heldout. Exercise the
# bounded control vocabulary on both transports; the mock returns a clean miss.
for transport in loopback forward; do
  model="$(CUE_HELPER_TRANSPORT="$transport" PATH="$TEMP_DIR/bin:$PATH" \
    "$HERE/query-cue-helper.sh" model status)"
  case "$model" in *"detector=READY"*"evidence=shadow"*) ;; *) echo "bad model status: $model" >&2; exit 1 ;; esac
  armed="$(CUE_HELPER_TRANSPORT="$transport" PATH="$TEMP_DIR/bin:$PATH" \
    "$HERE/query-cue-helper.sh" arm test-window bang 1000 shadow)"
  case "$armed" in "OK armed=test-window"*) ;; *) echo "bad arm response: $armed" >&2; exit 1 ;; esac
  result="$(CUE_HELPER_TRANSPORT="$transport" PATH="$TEMP_DIR/bin:$PATH" \
    "$HERE/query-cue-helper.sh" result test-window)"
  case "$result" in "MISS window=test-window"*) ;; *) echo "bad result: $result" >&2; exit 1 ;; esac
done

# Both transports must answer the DEVICE's field set, not a subset of it.
#
# Corrected 2026-08-26. This matched on substrings that passed whether or not
# the snapshot carried `cam5=` and `detector=`, and both mocks were missing
# fields the device sends -- so the mocks answered a shape no runner could
# parse and this check went green anyway. `trial.sh:1912` reads the line
# with `s/.*luma=\(...\).*cam5=\(...\).*ageUs=\(...\)/.../p`; against the
# old loopback mock that sed did not match AT ALL, and an unmatched sed prints
# nothing rather than failing, so the runner's cue trace was silently empty.
#
# So assert the parse the runner actually performs, on both transports, rather
# than a substring that survives a missing field.
for transport in loopback forward; do
  response="$(PATH="$TEMP_DIR/bin:$PATH" "$HERE/query-cue-helper.sh" "$transport")"
  case "$response" in
    'OK '*"visual=OBSERVED seq=121"*"audio=OBSERVED frames=33000"*) ;;
    *) echo "unexpected $transport response: $response" >&2; exit 1 ;;
  esac
  # The runner's own extraction, verbatim in shape. It must yield three fields.
  parsed="$(printf '%s\n' "$response" |
    sed -n 's/.*luma=\([0-9]*\).*cam5=\([0-9]*\).*ageUs=\([0-9]*\).*/luma=\1 cam5=\2 age=\3us/p')"
  case "$parsed" in
    'luma='*' cam5='*' age='*'us') ;;
    *) echo "$transport snapshot does not parse the way trial.sh reads it;" \
            "the mock has drifted from the device's field set: $response" >&2
       exit 1 ;;
  esac
  # cam5 must not be the same number as luma, or a transposed capture group
  # would read as correct.
  case "$parsed" in
    'luma=2 cam5=2 '*) echo "$transport: cam5 must differ from luma so a swapped group shows" >&2; exit 1 ;;
  esac
  # grey= is the whole-frame near-grey cell count the device started sending
  # 2026-08-26. It sits between cam5= and ageUs=, so the parse asserted above
  # also guards the regression an inserted field would cause.
  case "$response" in
    *" grey="[0-9-]*" "*) ;;
    *) echo "$transport snapshot is missing grey=, which the device appends" >&2; exit 1 ;;
  esac
  case "$response" in
    *detector=*) ;;
    *) echo "$transport snapshot is missing detector=, which the device appends" >&2; exit 1 ;;
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

# latency: the mock answers the device-side sample loop with fixed values, so
# this covers the reporter -- all three groups must survive to the summary.
summary="$(PATH="$TEMP_DIR/bin:$PATH" "$HERE/query-cue-helper.sh" latency 5)"
for label in "snapshot read" "grid read" "shell baseline"; do
  case "$summary" in
    *"$label"*"n=5"*) ;;
    *) echo "latency summary lost the $label group: $summary" >&2; exit 1 ;;
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
