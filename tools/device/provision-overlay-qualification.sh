#!/bin/bash
# Atomically install a reviewed Plan 23 qualification sidecar.
set -euo pipefail

ORIGINAL_ARGS=("$@")
RECORD="${1:?usage: provision-overlay-qualification.sh RECORD.json [--profile PROFILE] [--replace]}"
shift
PROFILE=""
REPLACE=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --replace)
      [ -z "$REPLACE" ] || { echo 'duplicate --replace' >&2; exit 2; }
      REPLACE=--replace
      shift
      ;;
    --profile)
      [ "$#" -ge 2 ] || { echo '--profile requires a value' >&2; exit 2; }
      [ -z "$PROFILE" ] || { echo 'duplicate --profile' >&2; exit 2; }
      PROFILE="$2"
      shift 2
      ;;
    *)
      echo "unexpected argument: $1" >&2
      exit 2
      ;;
  esac
done

HERE="$(cd "$(dirname "$0")" && pwd)"
PACKAGE="com.fnaf2.cuehelper"
TARGET="files/overlay-qualification.properties"
STAGED="files/overlay-qualification.properties.new"

# Sidecar installation changes the production gate and must be serialized with
# setup, queue execution, and retained observation on the same phone.
if [ "${CUE_HELPER_DEVICE_LOCK_HELD:-0}" != 1 ]; then
  . "$HERE/select-adb.sh"
  export CUE_HELPER_DEVICE_LOCK_HELD=1
  exec python3 "$HERE/device-lock-exec.py" "$ANDROID_SERIAL" -- "$0" "${ORIGINAL_ARGS[@]}"
fi

[ -f "$RECORD" ] || { echo "record does not exist: $RECORD" >&2; exit 2; }

if [ -z "$PROFILE" ]; then
  PROFILE="$(python3 - "$RECORD" <<'PY'
import json
import sys

try:
    value = json.loads(open(sys.argv[1], encoding="utf-8")).get("profileId")
except (OSError, ValueError):
    value = None
if not isinstance(value, str) or not value:
    raise SystemExit("record has no profileId")
print(value)
PY
)"
fi

python3 "$HERE/validate-overlay-qualification.py" "$RECORD" \
  --profile "$PROFILE"

SIDECAR="$(mktemp "${TMPDIR:-/tmp}/overlay-qualification.XXXXXX")"
cleanup() {
  rm -f "$SIDECAR"
  adb shell run-as "$PACKAGE" rm -f "$STAGED" >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM

python3 - "$RECORD" "$SIDECAR" <<'PY'
import json
import sys

record = json.loads(open(sys.argv[1], encoding="utf-8").read())
lines = [
    "schema=" + record["schema"],
    "profileId=" + record["profileId"],
    "proof=" + record["selfCapture"]["proof"],
    "targetPackage=" + record["targetPackage"],
    "targetBuild=" + record["targetBuild"],
    "touchPassthrough=PASS",
    "targetSuppression=PASS",
    "screenIdentity=PASS",
]
open(sys.argv[2], "w", encoding="ascii").write("\n".join(lines) + "\n")
PY

. "$HERE/select-adb.sh"
adb get-state >/dev/null
adb shell run-as "$PACKAGE" id >/dev/null 2>&1 || {
  echo "cue helper is not installed as a debuggable build" >&2
  exit 1
}
adb shell run-as "$PACKAGE" mkdir -p files
if adb shell run-as "$PACKAGE" test -e "$TARGET" >/dev/null 2>&1 \
    && [ "$REPLACE" != --replace ]; then
  echo "a qualification sidecar already exists; pass --replace to replace it atomically" >&2
  exit 2
fi

adb exec-in run-as "$PACKAGE" sh -c "umask 077; cat > '$STAGED'" < "$SIDECAR"
host_hash="$(shasum -a 256 "$SIDECAR" | awk '{print $1}')"
device_hash="$(adb exec-out run-as "$PACKAGE" cat "$STAGED" | shasum -a 256 | awk '{print $1}')"
if [ "$host_hash" != "$device_hash" ]; then
  echo "staged qualification sidecar hash mismatch" >&2
  exit 1
fi
adb shell run-as "$PACKAGE" mv -f "$STAGED" "$TARGET"
trap - EXIT HUP INT TERM

echo "installed $TARGET sha256=$host_hash"
echo "restart the helper service/capture session to load the reviewed gate"
