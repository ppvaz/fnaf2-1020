#!/bin/bash
# Talk to the cue helper's authenticated snapshot socket.
#
#   query-cue-helper.sh [loopback|forward]        one snapshot (default loopback)
#   query-cue-helper.sh record PRE POST [label]   pull one calibration window
#   query-cue-helper.sh latency [count]           time device-local snapshot reads
#   query-cue-helper.sh log start                 begin a night-length capture
#   query-cue-helper.sh log stop [label]          end it and pull the WAV
#   query-cue-helper.sh watch SECONDS [out]       log the visual snapshot over time
#   query-cue-helper.sh grid [out.png]            render the whole 20x9 sensor
#
# Transports:
#   loopback  device-side nc to 127.0.0.1:PORT. The exchange happens entirely
#             inside one adb shell, so it models what the on-device controller
#             will do without an adb round trip. Default.
#   forward   host-side client over `adb forward` to the helper's abstract
#             socket. Cable-bound: nothing on the device has to open a port.
#             Select with CUE_HELPER_TRANSPORT=forward.
#
# `record` is a device action: it turns calibration capture on, waits for the
# ring to hold PRE seconds of pre-roll, captures PRE+POST seconds around now,
# turns calibration back off, and pulls the WAV into an ignored local
# directory. Raw game audio never enters the repository.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PACKAGE="com.fnafminus7.cuehelper"
OUT_DIR="${CUE_HELPER_CALIBRATION:-captures/cue-helper/calibration}"

VERB=snapshot
TRANSPORT="${CUE_HELPER_TRANSPORT:-loopback}"
case "${1:-}" in
  loopback|forward) TRANSPORT="$1" ;;
  record) VERB=record; shift ;;
  latency) VERB=latency; shift ;;
  log) VERB=log; shift ;;
  watch) VERB=watch; shift ;;
  grid) VERB=grid; shift ;;
  '') ;;
  *) echo "usage: query-cue-helper.sh [loopback|forward|record PRE POST]" >&2; exit 2 ;;
esac
case "$TRANSPORT" in
  loopback|forward) ;;
  *) echo "unknown transport: $TRANSPORT (use loopback or forward)" >&2; exit 2 ;;
esac

if [ "$VERB" = grid ]; then
  GRID_OUT="${1:-cue-grid.png}"
fi

if [ "$VERB" = latency ]; then
  COUNT="${1:-50}"
  case "$COUNT" in *[!0-9]*) echo "count must be a whole number" >&2; exit 2 ;; esac
  if [ "$TRANSPORT" != loopback ]; then
    echo "latency measures the device-local path; use the loopback transport" >&2
    exit 2
  fi
fi

if [ "$VERB" = watch ]; then
  WATCH_SECONDS="${1:?watch needs a duration in seconds}"
  case "$WATCH_SECONDS" in *[!0-9]*) echo "seconds must be whole" >&2; exit 2 ;; esac
  WATCH_OUT="${2:-}"
  if [ "$TRANSPORT" != loopback ]; then
    echo "watch polls the device-local path; use the loopback transport" >&2
    exit 2
  fi
fi

if [ "$VERB" = log ]; then
  LOG_ACTION="${1:?log needs start or stop}"
  case "$LOG_ACTION" in
    start|stop) ;;
    *) echo "log takes start or stop" >&2; exit 2 ;;
  esac
  LABEL="${2:-night}"
fi

if [ "$VERB" = record ]; then
  PRE="${1:?record needs PRE seconds}"
  POST="${2:?record needs POST seconds}"
  LABEL="${3:-window}"
  case "$PRE$POST" in *[!0-9]*) echo "PRE and POST must be whole seconds" >&2; exit 2 ;; esac
fi

. "$HERE/select-adb.sh"
adb get-state >/dev/null

pid="$(adb shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' | awk '{print $1}')"
case "$pid" in
  ''|*[!0-9]*) echo "cue helper is not running" >&2; exit 1 ;;
esac

# The focus guard exists so that a reading is *about the game*. Retrieving or
# starting a recording is not a reading, and requiring focus there strands a
# capture whenever a run ends with the game no longer in front.
case "$VERB" in
  snapshot|record|watch|grid)
    if ! adb shell dumpsys window 2>/dev/null | \
        awk '/mCurrentFocus=.*com\.scottgames\.fnaf2/ { found=1 } END { exit !found }'; then
      echo "FNaF is not the focused physical-display window" >&2
      exit 1
    fi
    ;;
esac

control="$(adb logcat -d --pid="$pid" -v brief -s FnafCueHelper:I '*:S' 2>/dev/null | \
  tr -d '\r' | awk '/control=(READY|DEGRADED)/ { line=$0 } END { print line }')"
port="$(printf '%s\n' "$control" | sed -n 's/.*control=[A-Z][A-Z]* [a-z]*=[^ ]* port=\([^ ]*\).*/\1/p')"
[ -n "$port" ] || port="$(printf '%s\n' "$control" | sed -n 's/.* port=\([^ ]*\).*/\1/p')"
socket="$(printf '%s\n' "$control" | sed -n 's/.* socket=\([^ ]*\).*/\1/p')"
token="$(printf '%s\n' "$control" | sed -n 's/.*token=\([0-9a-f][0-9a-f]*\).*/\1/p')"
if [ "${#token}" -ne 32 ]; then
  echo "no valid per-run cue-helper token found" >&2
  exit 1
fi

host_port=""
cleanup() { [ -n "$host_port" ] && adb forward --remove "tcp:$host_port" >/dev/null 2>&1 || true; }
trap cleanup EXIT HUP INT TERM

if [ "$TRANSPORT" = loopback ]; then
  case "$port" in
    ''|*[!0-9]*) echo "cue helper has no live loopback port" >&2; exit 1 ;;
  esac
else
  case "$socket" in
    ''|none) echo "cue helper has no live abstract control socket" >&2; exit 1 ;;
  esac
  host_port="$(adb forward tcp:0 "localabstract:$socket" | tr -d '\r' | tail -n1)"
  case "$host_port" in
    ''|*[!0-9]*) echo "adb forward did not return a host port" >&2; exit 1 ;;
  esac
fi

# One request, one bounded line back. REC holds the socket for its post-roll,
# so the client timeout has to clear the longest window this script asks for.
exchange() {
  if [ "$TRANSPORT" = loopback ]; then
    # $1 is deliberately unquoted: adb shell concatenates its arguments and
    # re-splits them on the device, so a quoted request with spaces arrives as
    # separate words anyway. Passing the port first and reassembling the rest
    # with "$*" is the only form that survives that round trip.
    # shellcheck disable=SC2086
    adb shell sh -s -- "$port" $1 <<'REMOTE' | tr -d '\r'
set -eu
port=$1
shift
printf '%s\n' "$*" | toybox nc -w 20 127.0.0.1 "$port"
REMOTE
  else
    # Not netcat: macOS BSD nc returns an empty body for this exchange even
    # though the forward itself is healthy.
    python3 - "$host_port" "$1" <<'CLIENT' | tr -d '\r'
import socket, sys
port, request = int(sys.argv[1]), sys.argv[2]
with socket.create_connection(("127.0.0.1", port), timeout=25) as client:
    client.sendall((request + "\n").encode("ascii"))
    chunks = []
    while b"\n" not in b"".join(chunks):
        block = client.recv(4096)
        if not block:
            break
        chunks.append(block)
sys.stdout.write(b"".join(chunks).decode("ascii", "replace").strip())
CLIENT
  fi
}

if [ "$VERB" = snapshot ]; then
  response="$(exchange "GET $token")"
  printf '%s\n' "$response"
  case "$response" in
    'OK '*"visual=OBSERVED"*) ;;
    'OK '*) echo "cue helper returned a fail-closed observation" >&2; exit 1 ;;
    *) echo "cue helper control query failed" >&2; exit 1 ;;
  esac
  exit 0
fi

if [ "$VERB" = grid ]; then
  # What the helper actually sees, as a picture.
  #
  # It renders a 20x9 virtual display every frame and was reporting one pixel of
  # it (3,6) plus one block mean. Nothing downstream could therefore tell a
  # Withered Freddy jumpscare from a dark office -- during one the snapshot read
  # luma 0-37 and a neutral grey triple, because that single pixel sits
  # somewhere dark. GRID returns all 180 cells; this draws them.
  line="$(exchange "GRID $token")"
  case "$line" in
    OK\ grid=*) ;;
    *) echo "$line" >&2; exit 1 ;;
  esac
  printf '%s\n' "$line" | python3 -c '
import sys, re
line = sys.stdin.read().strip()
m = re.match(r"OK grid=(\d+)x(\d+) seq=(\d+) ([0-9a-f]+)", line)
if not m:
    print("unparseable grid response", file=sys.stderr); raise SystemExit(1)
w, h, seq, body = int(m.group(1)), int(m.group(2)), m.group(3), m.group(4)
cells = [int(body[i:i+6], 16) for i in range(0, w*h*6, 6)]
print(f"grid {w}x{h} seq={seq}")
for y in range(h):
    row = ""
    for x in range(w):
        v = cells[y*w + x]
        lum = ((v>>16 & 255)*77 + (v>>8 & 255)*150 + (v & 255)*29) >> 8
        row += " .:-=+*#%@"[min(9, lum*10//256)]
    print("   " + row)
try:
    from PIL import Image
except ImportError:
    print("(install Pillow for the PNG)", file=sys.stderr); raise SystemExit(0)
im = Image.new("RGB", (w, h))
im.putdata([((v>>16)&255, (v>>8)&255, v&255) for v in cells])
im.resize((w*40, h*40), Image.NEAREST).save(sys.argv[1])
print(f"wrote {sys.argv[1]}")
' "$GRID_OUT"
  exit 0
fi

if [ "$VERB" = latency ]; then
  # Plan 08 package 3, the "result receipt" leg. Everything is timed inside one
  # device shell against the device's own clock, so no adb round trip is
  # measured. The baseline pass times the same loop with the socket call
  # removed, because a forked `date` costs real milliseconds here and that cost
  # is part of what a shell-based controller would actually pay.
  samples="$(adb shell sh -s -- "$port" "$COUNT" "$token" <<'REMOTE' | tr -d '\r'
set -eu
port=$1
count=$2
token=$3
i=0
while [ "$i" -lt "$count" ]; do
  start=$(date +%s%N)
  printf 'GET %s\n' "$token" | toybox nc -w 2 127.0.0.1 "$port" >/dev/null 2>&1
  end=$(date +%s%N)
  echo "read $(( (end - start) / 1000 ))"
  i=$((i + 1))
done
i=0
while [ "$i" -lt "$count" ]; do
  start=$(date +%s%N)
  end=$(date +%s%N)
  echo "base $(( (end - start) / 1000 ))"
  i=$((i + 1))
done
REMOTE
)"
  printf '%s\n' "$samples" | python3 -c '
import sys

groups = {"read": [], "base": []}
for line in sys.stdin:
    parts = line.split()
    if len(parts) == 2 and parts[0] in groups:
        try:
            groups[parts[0]].append(int(parts[1]))
        except ValueError:
            pass

def pct(values, q):
    if not values:
        return float("nan")
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(round(q * (len(ordered) - 1))))
    return ordered[index]

for name, label in (("read", "snapshot read"), ("base", "shell baseline")):
    values = groups[name]
    if not values:
        print("%-14s no samples" % label)
        continue
    print("%-14s n=%-4d p50 %6.2f ms  p95 %6.2f ms  p99 %6.2f ms  max %6.2f ms"
          % (label, len(values), pct(values, 0.50) / 1000.0,
             pct(values, 0.95) / 1000.0, pct(values, 0.99) / 1000.0,
             max(values) / 1000.0))
if groups["read"] and groups["base"]:
    net = pct(groups["read"], 0.50) - pct(groups["base"], 0.50)
    print("socket cost at p50: %.2f ms" % (net / 1000.0))
'
  exit 0
fi

if [ "$VERB" = watch ]; then
  # Ground truth for a cue has to come from somewhere other than the cue
  # detector. Every snapshot carries snapshotNs from the same monotonic clock
  # the audio log is anchored to, so a bright->black transition on the lit left
  # opening timestamps a real g417 arrival independently of any audio.
  # Polling inside one device shell keeps it near the 49 ms read cost.
  deadline=$(( $(date +%s) + WATCH_SECONDS ))
  {
    printf 'snapshot_ns	seq	luma	state
'
    while [ "$(date +%s)" -lt "$deadline" ]; do
      line="$(exchange "GET $token")"
      ns="$(printf '%s' "$line" | sed -n 's/.*snapshotNs=\([0-9]*\).*/\1/p')"
      seq="$(printf '%s' "$line" | sed -n 's/.*seq=\([0-9]*\).*/\1/p')"
      luma="$(printf '%s' "$line" | sed -n 's/.*luma=\([0-9-]*\).*/\1/p')"
      state="$(printf '%s' "$line" | sed -n 's/.*visual=\([A-Z]*\).*/\1/p')"
      [ -n "$ns" ] && printf '%s\t%s\t%s\t%s\n' "$ns" "${seq:-}" "${luma:-}" "${state:-}"
    done
  } | { if [ -n "$WATCH_OUT" ]; then tee "$WATCH_OUT"; else cat; fi; }
  [ -n "$WATCH_OUT" ] && echo "wrote $WATCH_OUT" >&2
  exit 0
fi

if [ "$VERB" = log ]; then
  if [ "$LOG_ACTION" = start ]; then
    on="$(exchange "CAL $token on")"
    case "$on" in
      'OK cal=on') ;;
      *) echo "could not enable calibration capture: $on" >&2; exit 1 ;;
    esac
    started="$(exchange "LOG $token start")"
    printf '%s\n' "$started"
    case "$started" in
      'OK log=started'*) ;;
      *) exchange "CAL $token off" >/dev/null 2>&1 || true; exit 1 ;;
    esac
    echo "capturing; stop with: tools/device/query-cue-helper.sh log stop [label]"
    exit 0
  fi

  response="$(exchange "LOG $token stop")"
  printf '%s\n' "$response"
  exchange "CAL $token off" >/dev/null 2>&1 || true
  case "$response" in
    'OK rec='*) ;;
    *) echo "continuous capture failed" >&2; exit 1 ;;
  esac
  name="$(printf '%s\n' "$response" | sed -n 's/.*rec=\([^ ]*\).*/\1/p')"
  mkdir -p "$OUT_DIR"
  target="$OUT_DIR/${LABEL}-${name}"
  if [ -e "$target" ]; then
    echo "refusing to overwrite $target" >&2
    exit 1
  fi
  adb exec-out run-as "$PACKAGE" cat "files/calibration/$name" > "$target"
  adb shell run-as "$PACKAGE" rm -f "files/calibration/$name" >/dev/null 2>&1 || true
  bytes="$(wc -c < "$target" | tr -d ' ')"
  if [ "$bytes" -lt 45 ]; then
    echo "pulled capture is empty ($bytes bytes)" >&2
    exit 1
  fi
  echo "wrote $target ($bytes bytes)"
  exit 0
fi

# --- record -----------------------------------------------------------------
calibration_off() { exchange "CAL $token off" >/dev/null 2>&1 || true; }
trap 'calibration_off; cleanup' EXIT HUP INT TERM

on="$(exchange "CAL $token on")"
case "$on" in
  'OK cal=on') ;;
  *) echo "could not enable calibration capture: $on" >&2; exit 1 ;;
esac
# The ring only fills while calibration is on, so the pre-roll has to elapse.
sleep "$((PRE + 1))"

response="$(exchange "REC $token $PRE $POST")"
printf '%s\n' "$response"
case "$response" in
  'OK rec='*) ;;
  *) echo "calibration capture failed" >&2; exit 1 ;;
esac
name="$(printf '%s\n' "$response" | sed -n 's/.*rec=\([^ ]*\).*/\1/p')"

mkdir -p "$OUT_DIR"
target="$OUT_DIR/${LABEL}-${name}"
if [ -e "$target" ]; then
  echo "refusing to overwrite $target" >&2
  exit 1
fi
adb exec-out run-as "$PACKAGE" cat "files/calibration/$name" > "$target"
adb shell run-as "$PACKAGE" rm -f "files/calibration/$name" >/dev/null 2>&1 || true
bytes="$(wc -c < "$target" | tr -d ' ')"
if [ "$bytes" -lt 45 ]; then
  echo "pulled window is empty ($bytes bytes)" >&2
  exit 1
fi
echo "wrote $target ($bytes bytes)"
