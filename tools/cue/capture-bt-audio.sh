#!/usr/bin/env bash
# Capture the phone's fully-rendered audio mix off its A2DP stream.
#
#   tools/cue/capture-bt-audio.sh <seconds> [outdir] [bt-mac]
#   tools/cue/capture-bt-audio.sh --check [bt-mac]
#   tools/cue/capture-bt-audio.sh --start OUT_BASENAME [bt-mac]   # open-ended, host-clock stamped
#   tools/cue/capture-bt-audio.sh --stop  OUT_BASENAME            # -> OUT_BASENAME.bt.wav + .bt.json
#
# --start/--stop exist for night-run.sh (--bt-audio): the capture brackets a
# whole run and its sidecar carries the host wall clock and CLOCK_MONOTONIC
# instant `bluealsa-cli open` was spawned -- an UPPER bound on the first
# sample's time, since the transport was already streaming. The run's HID
# release event is on the same host clock, so audio time = release +
# (t_audio - startMonotonicMs), to be CHECKED against a known event (the
# winding ticks at the emitted wind holds) before any phase is read off it.
# The PCM format is read from `bluealsa-cli info`, not assumed: the link is
# aptX HD (S24 in 32-bit, 48 kHz) or SBC (S16, 44.1 kHz) depending on the
# phone's codec pick. bluealsa-aplay runs as root here; a user pkill cannot
# stop it, so --start refuses while it holds the PCM.
#
# This is the non-root path to the discrete `Play sample` cues (winding tick,
# BB's laughs). On the g56 those are on the `AUDIO_OUTPUT_FLAG_FAST` mixer,
# which `AudioPlaybackCapture` never taps -- but the Bluetooth encoder sits
# downstream of the full HAL mix, so an A2DP sink gets them. Validated
# 2026-08-29: `s0033` ('WinD') matched-filters at NC 0.56 in this path vs 0.045
# on-device. See docs/device/ANDROID-AUDIO-CAPTURE.md
# "The A2DP mix DOES carry the fast-mixer SFX".
#
# Path: phone -> aptX HD -> BlueALSA (bluez-alsa) -> `bluealsa-cli open`.
# PipeWire's own BT receive path is broken on this host; WirePlumber must have
# Bluetooth disabled (~/.config/wireplumber/wireplumber.conf.d/60-fnaf-phone-sbc.conf)
# so it does not fight BlueALSA for the BlueZ endpoints.
#
# Recorded audio is game content: this script refuses to write inside the repo.
# Commit the derived fingerprint (tools/cue/reference-report.py) instead.
set -euo pipefail

DEFAULT_MAC=10:2B:1C:DA:18:2C
MODE=record
if [ "${1:-}" = "--check" ]; then
  MODE=check
  MAC=${2:-$DEFAULT_MAC}
elif [ "${1:-}" = "--start" ]; then
  MODE=start
  BASE=${2:?usage: capture-bt-audio.sh --start OUT_BASENAME [bt-mac]}
  MAC=${3:-$DEFAULT_MAC}
elif [ "${1:-}" = "--stop" ]; then
  MODE=stop
  BASE=${2:?usage: capture-bt-audio.sh --stop OUT_BASENAME}
  MAC=$DEFAULT_MAC
else
  SECS=${1:?usage: capture-bt-audio.sh <seconds> [outdir] [bt-mac]}
  OUT=${2:-$HOME/fnaf-apks/bt-audio-captures}
  MAC=${3:-$DEFAULT_MAC}
  case "$SECS" in *[!0-9]*) echo "seconds must be a whole number" >&2; exit 2 ;; esac
fi

if ! [[ "$MAC" =~ ^([[:xdigit:]]{2}:){5}[[:xdigit:]]{2}$ ]]; then
  echo "Bluetooth MAC must have the form 00:11:22:33:44:55" >&2
  exit 2
fi

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
DEV="dev_$(echo "$MAC" | tr ':' '_')"
PCM="/org/bluealsa/hci0/$DEV/a2dpsnk/source"
check_route() {
  if ! command -v bluealsa-cli >/dev/null 2>&1; then
    echo "audio-route=UNKNOWN reason=bluealsa-cli-missing pcm=$PCM mac=$MAC"
    return 3
  fi
  local info
  if info="$(bluealsa-cli info "$PCM" 2>/dev/null)" && \
      printf '%s\n' "$info" | grep -Eiq '^[[:space:]]*Running:[[:space:]]*true[[:space:]]*$'; then
    echo "audio-route=READY transport=bluealsa pcm=$PCM mac=$MAC"
    return 0
  fi
  if [ -n "${info:-}" ]; then
    echo "audio-route=UNKNOWN reason=a2dp-stream-not-running pcm=$PCM mac=$MAC"
    return 3
  fi
  echo "audio-route=UNKNOWN reason=a2dp-source-not-connected pcm=$PCM mac=$MAC"
  return 3
}

mono_ms() { awk '{printf "%.0f", $1 * 1000}' /proc/uptime; }
pcm_format() {
  # "S24_LE 48000 2" from bluealsa-cli info; the raw is S24 in a 32-bit
  # container, which ffmpeg reads as s32le.
  bluealsa-cli info "$PCM" 2>/dev/null | awk -F': ' '/^Format/ {f=$2} /^Channels/ {c=$2} /^Sampling/ {r=$2} END {sub(/ Hz.*/, "", r); print f, r, c}'
}
if [ "$MODE" = stop ]; then
  [ -f "$BASE.bt.json" ] || { echo "no capture sidecar at $BASE.bt.json" >&2; exit 2; }
  PID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["pid"])' "$BASE.bt.json")"
  kill -INT "$PID" 2>/dev/null || true
  for _ in $(seq 1 30); do kill -0 "$PID" 2>/dev/null || break; sleep 0.1; done
  STOP_WALL="$(date +%s%3N)"; STOP_MONO="$(mono_ms)"
  read -r FMT RATE CH < <(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["format"], d["rate"], d["channels"])' "$BASE.bt.json")
  case "$FMT" in S16_LE) F=s16le; GAIN=1 ;; S24_LE|S24_3LE|S32_LE) F=s32le; GAIN=256 ;; *) F=s16le; GAIN=1 ;; esac
  ffmpeg -hide_banner -loglevel error -y -f "$F" -ar "$RATE" -ac "$CH" -i "$BASE.bt.raw" -af "volume=$GAIN" "$BASE.bt.wav"
  BYTES="$(stat -c %s "$BASE.bt.raw")"
  python3 - "$BASE.bt.json" "$STOP_WALL" "$STOP_MONO" "$BYTES" <<'PY'
import json, sys
p, w, m, b = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
d = json.load(open(p))
d.update({'stopWallMs': w, 'stopMonotonicMs': m, 'rawBytes': b, 'wallDurationMs': w - d['startWallMs']})
json.dump(d, open(p, 'w'), indent=2); open(p, 'a').write('\n')
PY
  echo "$BASE.bt.wav"
  exit 0
fi

if [ "$MODE" = start ]; then
  # --start prints only the pid on stdout; the route verdict goes to stderr.
  if ! check_route >&2; then exit 3; fi
elif check_route; then
  :
else
  ROUTE_STATUS=$?
  exit "$ROUTE_STATUS"
fi
[ "$MODE" = check ] && exit 0

if [ "$MODE" = start ]; then
  case "$(cd "$(dirname "$BASE")" && pwd)/" in
    "$REPO"/*) echo "refusing to write game audio inside the repository: $BASE" >&2; exit 1 ;;
  esac
  if pgrep -x bluealsa-aplay >/dev/null; then
    echo "bluealsa-aplay holds the PCM (root service); stop it first: sudo systemctl stop bluealsa-aplay" >&2; exit 3
  fi
  read -r FMT RATE CH < <(pcm_format)
  [ -n "$FMT" ] && [ -n "$RATE" ] || { echo "could not read the PCM format from bluealsa-cli info" >&2; exit 3; }
  START_WALL="$(date +%s%3N)"; START_MONO="$(mono_ms)"
  nohup bluealsa-cli open "$PCM" > "$BASE.bt.raw" 2> "$BASE.bt.err" &
  PID=$!
  printf '{"schema":"bt-audio-capture-v1","mac":"%s","pcm":"%s","format":"%s","rate":%s,"channels":%s,"startWallMs":%s,"startMonotonicMs":%s,"startIsUpperBound":true,"pid":%s}\n' \
    "$MAC" "$PCM" "$FMT" "$RATE" "$CH" "$START_WALL" "$START_MONO" "$PID" > "$BASE.bt.json"
  sleep 1
  if ! kill -0 "$PID" 2>/dev/null; then cat "$BASE.bt.err" >&2; echo "bluealsa-cli open exited at once" >&2; exit 3; fi
  echo "$PID"
  exit 0
fi

ABS_OUT="$(mkdir -p "$OUT" && cd "$OUT" && pwd)"
case "$ABS_OUT/" in
  "$REPO"/*) echo "refusing to write game audio inside the repository: $ABS_OUT" >&2; exit 1 ;;
esac

STAMP="$(date +%Y%m%dT%H%M%S)"
RAW="$ABS_OUT/bt-$STAMP.raw"
WAV="$ABS_OUT/bt-$STAMP.wav"

# bluealsa-cli open is a single consumer. If bluealsa-aplay is monitoring the
# phone, hand the PCM over for the capture and give it back after -- and keep
# the operator's monitoring alive by teeing the capture to the default sink.
APLAY_WAS_UP=0
if pgrep -x bluealsa-aplay >/dev/null; then
  APLAY_WAS_UP=1
  pkill -x bluealsa-aplay || true
  sleep 0.3
fi
restore_aplay() {
  [ "$APLAY_WAS_UP" -eq 1 ] || return 0
  pgrep -x bluealsa-aplay >/dev/null && return 0
  nohup bluealsa-aplay --profile-a2dp --volume=software "$MAC" >/dev/null 2>&1 &
}
trap restore_aplay EXIT

echo "capturing ${SECS}s from $PCM -> $RAW  (monitoring continues)"
# S24_LE arrives in a 32-bit container; play it back with +48 dB so the low
# 24 bits are audible, and also write the raw for offline analysis.
timeout "$SECS" bluealsa-cli open "$PCM" \
  | tee "$RAW" \
  | ffmpeg -hide_banner -loglevel error \
      -f s32le -ar 48000 -ac 2 -i - -af "volume=48dB" -f alsa default \
  || true

# S24-in-32 -> conventional 16-bit wav (volume=256 == +48 dB on the container).
ffmpeg -hide_banner -loglevel error -y -f s32le -ar 48000 -ac 2 -i "$RAW" \
  -af "volume=256" "$WAV"

DUR="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$WAV" 2>/dev/null || echo '?')"
echo "wrote $WAV  (${DUR}s)"
echo "raw kept at $RAW"
