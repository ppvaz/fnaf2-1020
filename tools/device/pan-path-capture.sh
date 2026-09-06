#!/bin/bash
# Record a native-resolution office-pan video and the helper's anchor samples.
#
# This observer never sends game input. Put the game on the office and sweep it
# by hand while the recorder is running. The resulting directory contains the
# video plus a timestamped pan-anchor TSV suitable for path fitting.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/select-adb.sh"

if [ "${CUE_HELPER_DEVICE_LOCK_HELD:-0}" != 1 ]; then
  export CUE_HELPER_DEVICE_LOCK_HELD=1
  exec python3 "$HERE/device-lock-exec.py" "$ANDROID_SERIAL" -- "$0" "$@"
fi

exec python3 "$HERE/pan-path-capture.py" "$@"
