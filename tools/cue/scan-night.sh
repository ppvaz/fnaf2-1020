#!/usr/bin/env bash
# Scan one night's captured audio for Balloon Boy's vent bang.
#
#   tools/cue/scan-night.sh WAV [--refs DIR]
#
# Denoise first, then run the cascade. That order is measured, not assumed.
# Injecting 52 copies of sample 17 into 159.5 s of real night background and
# scanning the result:
#
#   raw                     3 of 52 confirmed   (6% recall)
#   afftdn denoised        27 of 52 confirmed  (52% recall, 27/27 true, 0 false)
#
# The capture clips -- night 6-40's live stretch had peak pinned at full-scale
# int16 on 55% of snapshots, and `evaluate.py` refuses three of the six archived
# recordings outright as "unusable: clipped". Clipping is what the band stage
# survives and the correlation stage does not, so removing it is worth more than
# any threshold change.
#
# The detectability floor, same method, denoised:
#
#   injected at   0 dB -> 27/52      -6 dB -> 17/52
#               -12 dB ->  7/52     -18 dB ->  0/52
#
# So a zero here means "no bang above about -12 dB relative to background", NOT
# "no bang". Quote it that way.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WAV="${1:?usage: scan-night.sh WAV [--refs DIR]}"
shift || true
REFS_ARG=()
case "${1:-}" in --refs) REFS_ARG=(--refs "${2:?--refs needs a directory}") ;; esac

# A step that cannot find its input must say so and fail, never print nothing
# and look like coverage. That is what silently grading a missing .mp4 did.
[ -f "$WAV" ] || { echo "scan-night: no audio at $WAV" >&2; exit 2; }

DEN="$WAV"
if command -v ffmpeg >/dev/null 2>&1; then
  DEN="$(dirname "$WAV")/.$(basename "${WAV%.wav}")-denoised.wav"
  if ! ffmpeg -v error -y -i "$WAV" -af "afftdn=nf=-25,dynaudnorm=g=15" "$DEN" 2>/dev/null; then
    echo "scan-night: ffmpeg failed; scanning the raw capture at 6% recall" >&2
    DEN="$WAV"
  fi
else
  echo "scan-night: no ffmpeg; scanning the raw capture at 6% recall instead of 52%" >&2
fi

echo "bang scan (sample 17), denoised: ${DEN##*/}"
python3 "$HERE/detect.py" --scan --subtract --only 17 ${REFS_ARG[@]+"${REFS_ARG[@]}"} -- "$DEN"
status=$?
[ "$DEN" = "$WAV" ] || rm -f "$DEN"
exit "$status"
