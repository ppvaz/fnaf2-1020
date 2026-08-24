#!/bin/bash
# Query the freshest in-memory MediaProjection snapshot from the cue helper.
# This is read-only and never moves focus.
#
# Transports:
#   loopback  device-side nc to 127.0.0.1:PORT. The exchange happens entirely
#             inside one adb shell, so it models what the on-device controller
#             will do without an adb round trip. Default.
#   forward   host-side nc over `adb forward` to the helper's abstract socket.
#             Cable-bound: nothing on the device has to open a port.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PACKAGE="com.fnafminus7.cuehelper"
TRANSPORT="${1:-${CUE_HELPER_TRANSPORT:-loopback}}"

case "$TRANSPORT" in
  loopback|forward) ;;
  *) echo "unknown transport: $TRANSPORT (use loopback or forward)" >&2; exit 2 ;;
esac

. "$HERE/select-adb.sh"
adb get-state >/dev/null

pid="$(adb shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' | awk '{print $1}')"
case "$pid" in
  ''|*[!0-9]*) echo "cue helper is not running" >&2; exit 1 ;;
esac

if ! adb shell dumpsys window 2>/dev/null | \
    awk '/mCurrentFocus=.*com\.scottgames\.fnaf2/ { found=1 } END { exit !found }'; then
  echo "FNaF is not the focused physical-display window" >&2
  exit 1
fi

control="$(adb logcat -d --pid="$pid" -v brief -s FnafCueHelper:I '*:S' 2>/dev/null | \
  tr -d '\r' | awk '/control=(READY|DEGRADED)/ { line=$0 } END { print line }')"
port="$(printf '%s\n' "$control" | sed -n 's/.*control=[A-Z][A-Z]* port=\([^ ]*\).*/\1/p')"
socket="$(printf '%s\n' "$control" | sed -n 's/.* socket=\([^ ]*\).*/\1/p')"
token="$(printf '%s\n' "$control" | sed -n 's/.*token=\([0-9a-f][0-9a-f]*\).*/\1/p')"
if [ "${#token}" -ne 32 ]; then
  echo "no valid per-run cue-helper token found" >&2
  exit 1
fi

if [ "$TRANSPORT" = loopback ]; then
  case "$port" in
    ''|*[!0-9]*) echo "cue helper has no live loopback port" >&2; exit 1 ;;
  esac
  response="$(adb shell sh -s -- "$token" "$port" <<'REMOTE' | tr -d '\r'
set -eu
token=$1
port=$2
printf 'GET %s\n' "$token" | toybox nc -w 2 127.0.0.1 "$port"
REMOTE
)"
else
  case "$socket" in
    ''|none) echo "cue helper has no live abstract control socket" >&2; exit 1 ;;
  esac
  host_port="$(adb forward tcp:0 "localabstract:$socket" | tr -d '\r' | tail -n1)"
  case "$host_port" in
    ''|*[!0-9]*) echo "adb forward did not return a host port" >&2; exit 1 ;;
  esac
  trap 'adb forward --remove "tcp:$host_port" >/dev/null 2>&1 || true' EXIT HUP INT TERM
  # Not netcat: macOS BSD nc returns an empty body for this exchange even
  # though the forward itself is healthy.
  response="$(python3 - "$host_port" "$token" <<'CLIENT' | tr -d '\r'
import socket, sys
port, token = int(sys.argv[1]), sys.argv[2]
with socket.create_connection(("127.0.0.1", port), timeout=4) as client:
    client.sendall(("GET " + token + "\n").encode("ascii"))
    chunks = []
    while b"\n" not in b"".join(chunks):
        block = client.recv(4096)
        if not block:
            break
        chunks.append(block)
sys.stdout.write(b"".join(chunks).decode("ascii", "replace").strip())
CLIENT
)"
fi

printf '%s\n' "$response"
case "$response" in
  'OK '*"visual=OBSERVED"*) ;;
  'OK '*) echo "cue helper returned a fail-closed observation" >&2; exit 1 ;;
  *) echo "cue helper control query failed" >&2; exit 1 ;;
esac
