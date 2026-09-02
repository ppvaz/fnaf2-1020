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

# The native-resolution watchlist is authenticated separately from the legacy
# GET/GRID path. Status does not activate it; a 64-hex spec hash does.
for transport in loopback forward; do
  status="$(CUE_HELPER_TRANSPORT="$transport" PATH="$TEMP_DIR/bin:$PATH" \
    "$HERE/query-cue-helper.sh" watchlist status)"
  case "$status" in
    *"watch=OFF"*"entries=23"*) ;;
    *) echo "unexpected $transport watch status: $status" >&2; exit 1 ;;
  esac
  loaded="$(CUE_HELPER_TRANSPORT="$transport" PATH="$TEMP_DIR/bin:$PATH" \
    "$HERE/query-cue-helper.sh" watchlist load \
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)"
  case "$loaded" in
    *"watch=ACTIVE"*"entries=23"*) ;;
    *) echo "unexpected $transport watch load: $loaded" >&2; exit 1 ;;
  esac
  reading="$(CUE_HELPER_TRANSPORT="$transport" PATH="$TEMP_DIR/bin:$PATH" \
    "$HERE/query-cue-helper.sh" read)"
  case "$reading" in
    *"OK read=OBSERVED"*"bb_left_luma=194"*"battery_bar_4=20"*"screen_grey_cells=142"*) ;;
    *) echo "unexpected $transport watch read: $reading" >&2; exit 1 ;;
  esac
done

# The HUD status is a separate authenticated read. It must remain usable
# when the game is not focused so a lifecycle/target-hidden transition can be
# retained instead of being lost behind the visual focus guard.
for transport in loopback forward; do
  overlay_status="$(CUE_HELPER_TRANSPORT="$transport" PATH="$TEMP_DIR/bin:$PATH" \
    "$HERE/query-cue-helper.sh" overlay)"
  case "$overlay_status" in
    *"overlay=UNQUALIFIED(self-capture-unqualified)"*"updates=0"*) ;;
    *) echo "unexpected $transport overlay status: $overlay_status" >&2; exit 1 ;;
  esac
done

# Audio detector operations now belong to the external authority, not the APK.
# They must fail before touching adb so an old device-side command cannot look
# like a successful capture.
for verb in record log model arm result; do
  if PATH="$TEMP_DIR/bin:$PATH" "$HERE/query-cue-helper.sh" "$verb" \
      ${verb:+status} >/dev/null 2>&1; then
    echo "$verb must not be sent to the APK" >&2
    exit 1
  fi
done

# Both transports must answer the device's visual field set, not a subset.
#
# Corrected 2026-08-26. This matched on substrings that passed whether or not
# the snapshot carried `cam05_mean_luma=`, and both mocks were missing fields the device
# sends -- so the mocks answered a shape no runner could parse and this check
# went green anyway. `trial.sh` reads the line
# with `s/.*luma=\(...\).*cam05_mean_luma=\(...\).*ageUs=\(...\)/.../p`; against the
# old loopback mock that sed did not match AT ALL, and an unmatched sed prints
# nothing rather than failing, so the runner's cue trace was silently empty.
#
# So assert the parse the runner actually performs, on both transports, rather
# than a substring that survives a missing field.
for transport in loopback forward; do
  response="$(PATH="$TEMP_DIR/bin:$PATH" "$HERE/query-cue-helper.sh" "$transport")"
  case "$response" in
    'OK '*"visual=OBSERVED seq=121"*"cameraHighlights=cam:5"*"audio=EXTERNAL authority=audio-authority"*) ;;
    *) echo "unexpected $transport response: $response" >&2; exit 1 ;;
  esac
  # The runner's own extraction, verbatim in shape. It must yield three fields.
  parsed="$(printf '%s\n' "$response" |
    sed -n 's/.*luma=\([0-9]*\).*cam05_mean_luma=\([0-9]*\).*ageUs=\([0-9]*\).*/luma=\1 cam05_mean_luma=\2 age=\3us/p')"
  case "$parsed" in
    'luma='*' cam05_mean_luma='*' age='*'us') ;;
    *) echo "$transport snapshot does not parse the way trial.sh reads it;" \
            "the mock has drifted from the device's field set: $response" >&2
       exit 1 ;;
  esac
  # cam05_mean_luma must not be the same number as luma, or a transposed capture group
  # would read as correct.
  case "$parsed" in
    'luma=2 cam05_mean_luma=2 '*) echo "$transport: cam05_mean_luma must differ from luma so a swapped group shows" >&2; exit 1 ;;
  esac
  # grey= is the whole-frame near-grey cell count the device started sending.
  # It sits between cam05_mean_luma= and ageUs=, so the parse asserted above also guards
  # the regression an inserted field would cause.
  case "$response" in
    *" grey="[0-9-]*" "*) ;;
    *) echo "$transport snapshot is missing grey=, which the device appends" >&2; exit 1 ;;
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

# The latency experiment can opt into the native watch source.  This must
# preserve the same first three data columns consumed by latency-experiment.py
# while proving that the luma came from the authenticated BB anchor.
native_watch="$TEMP_DIR/native.tsv"
CUE_HELPER_WATCH_READ=1 PATH="$TEMP_DIR/bin:$PATH" \
  "$HERE/query-cue-helper.sh" watch 1 "$native_watch" >/dev/null
head -n 1 "$native_watch" | grep -Fq $'snapshot_ns\tseq\tluma\tstate\tsource' || {
  echo "native watch lost its source column" >&2; exit 1;
}
tail -n +2 "$native_watch" | grep -Eq $'^[0-9]+\t[0-9]+\t194\tOBSERVED\tbb_left_luma$' || {
  echo "native watch did not record bb_left_luma" >&2; exit 1;
}

# latency: the mock answers the device-side sample loop with fixed values, so
# this covers the reporter -- all three groups must survive to the summary.
summary="$(PATH="$TEMP_DIR/bin:$PATH" "$HERE/query-cue-helper.sh" latency 5)"
for label in "snapshot read" "grid read" "shell baseline"; do
  case "$summary" in
    *"$label"*"n=5"*) ;;
    *) echo "latency summary lost the $label group: $summary" >&2; exit 1 ;;
  esac
done

echo "cue-helper query tests passed"
