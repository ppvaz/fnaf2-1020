#!/bin/bash
# Atomically install one generated cue-model-v1 file into the helper's private data.
set -euo pipefail

MODEL="${1:?usage: provision-cue-model.sh MODEL [--replace]}"
REPLACE="${2:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PACKAGE="com.fnafminus7.cuehelper"
TARGET="files/cue-model-v1.txt"
STAGED="files/cue-model-v1.txt.new"

[ -f "$MODEL" ] || { echo "model does not exist: $MODEL" >&2; exit 2; }
case "$REPLACE" in ''|--replace) ;; *) echo "second argument may only be --replace" >&2; exit 2 ;; esac
header="$(sed -n '1p' "$MODEL")"
case "$header" in
  cue-model-v1\ calibration=*\ evidence=shadow\ rate=4000\ margin=*|\
  cue-model-v1\ calibration=*\ evidence=heldout\ rate=4000\ margin=*) ;;
  *) echo "not a supported cue-model-v1 file" >&2; exit 2 ;;
esac
bytes="$(wc -c < "$MODEL" | tr -d ' ')"
[ "$bytes" -le 262144 ] || { echo "model exceeds the 256 KiB bound" >&2; exit 2; }

. "$HERE/select-adb.sh"
adb get-state >/dev/null
adb shell run-as "$PACKAGE" id >/dev/null 2>&1 || {
  echo "cue helper is not installed as a debuggable build" >&2; exit 1; }
adb shell run-as "$PACKAGE" mkdir -p files
if adb shell run-as "$PACKAGE" test -e "$TARGET" >/dev/null 2>&1 && [ "$REPLACE" != --replace ]; then
  echo "a cue model already exists; pass --replace to replace it atomically" >&2
  exit 2
fi

cleanup() {
  adb shell run-as "$PACKAGE" rm -f "$STAGED" >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM

# The model goes straight to app-private storage; no game-derived template is
# left world-readable in /data/local/tmp. Hash the staged bytes back over adb
# before the atomic rename so a short transport write cannot become a model.
adb exec-in run-as "$PACKAGE" sh -c "umask 077; cat > '$STAGED'" < "$MODEL"
host_hash="$(shasum -a 256 "$MODEL" | awk '{print $1}')"
device_hash="$(adb exec-out run-as "$PACKAGE" cat "$STAGED" | shasum -a 256 | awk '{print $1}')"
if [ "$host_hash" != "$device_hash" ]; then
  echo "staged model hash mismatch" >&2
  exit 1
fi
adb shell run-as "$PACKAGE" mv -f "$STAGED" "$TARGET"
trap - EXIT HUP INT TERM

echo "installed $TARGET sha256=$host_hash"
if adb shell pidof "$PACKAGE" >/dev/null 2>&1; then
  "$HERE/query-cue-helper.sh" model reload
else
  echo "the helper is not running; it will load the model on its next capture session"
fi
