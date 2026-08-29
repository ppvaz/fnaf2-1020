#!/usr/bin/env bash
# Capture the phone's fully-rendered audio mix off its A2DP stream.
#
#   tools/cue/capture-bt-audio.sh <seconds> [outdir] [bt-mac]
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

SECS=${1:?usage: capture-bt-audio.sh <seconds> [outdir] [bt-mac]}
OUT=${2:-$HOME/fnaf-apks/bt-audio-captures}
MAC=${3:-10:2B:1C:DA:18:2C}
case "$SECS" in *[!0-9]*) echo "seconds must be a whole number" >&2; exit 2 ;; esac

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
ABS_OUT="$(mkdir -p "$OUT" && cd "$OUT" && pwd)"
case "$ABS_OUT/" in
  "$REPO"/*) echo "refusing to write game audio inside the repository: $ABS_OUT" >&2; exit 1 ;;
esac

DEV="dev_$(echo "$MAC" | tr ':' '_')"
PCM="/org/bluealsa/hci0/$DEV/a2dpsnk/source"
bluealsa-cli info "$PCM" >/dev/null 2>&1 || {
  echo "no BlueALSA PCM at $PCM -- is the phone connected as an A2DP source?" >&2
  exit 1
}

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
