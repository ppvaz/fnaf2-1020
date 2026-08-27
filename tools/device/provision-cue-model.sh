#!/bin/bash
# Atomically install one generated cue-model-v1 file into the helper's private data.
set -euo pipefail

MODEL="${1:?usage: provision-cue-model.sh MODEL [HOLDOUT_REPORT] [--replace]}"
shift
REPORT=""
REPLACE=""
for argument in "$@"; do
  case "$argument" in
    --replace) [ -z "$REPLACE" ] || { echo 'duplicate --replace' >&2; exit 2; }; REPLACE=--replace ;;
    *) [ -z "$REPORT" ] || { echo 'only one holdout report may be supplied' >&2; exit 2; }; REPORT=$argument ;;
  esac
done
HERE="$(cd "$(dirname "$0")" && pwd)"
PACKAGE="com.fnafminus7.cuehelper"
TARGET="files/cue-model-v1.txt"
STAGED="files/cue-model-v1.txt.new"

[ -f "$MODEL" ] || { echo "model does not exist: $MODEL" >&2; exit 2; }
header="$(sed -n '1p' "$MODEL")"
case "$header" in
  cue-model-v1\ calibration=*\ evidence=shadow\ rate=4000\ margin=*|\
  cue-model-v1\ calibration=*\ evidence=heldout\ rate=4000\ margin=*) ;;
  *) echo "not a supported cue-model-v1 file" >&2; exit 2 ;;
esac
case "$header" in
  *' evidence=heldout '*)
    [ -n "$REPORT" ] && [ -f "$REPORT" ] || {
      echo 'a heldout model requires its cue-holdout-v1 report' >&2; exit 2; }
    expected_report_hash="$(printf '%s\n' "$header" | sed -n 's/.* reportSha256=\([0-9a-f][0-9a-f]*\).*/\1/p')"
    [ "${#expected_report_hash}" -eq 64 ] || {
      echo 'heldout model has no valid reportSha256' >&2; exit 2; }
    actual_report_hash="$(shasum -a 256 "$REPORT" | awk '{print $1}')"
    [ "$expected_report_hash" = "$actual_report_hash" ] || {
      echo 'holdout report hash does not match the model' >&2; exit 2; }
    # The reportSha256 check above proves this operator supplied the report the
    # model's header CLAIMS -- it says nothing about whether that report ever
    # evaluated THESE templates. export-model.py checks that once, at
    # promotion time (report.model_sha256 against the pre-promotion shadow
    # file's bytes); nothing re-checked it here, so a report from one
    # promotion could be hand-copied onto an unrelated model whose header
    # happens to carry the same reportSha256= literal. Reverse
    # export-model.py's own rewrite (evidence=heldout -> evidence=shadow,
    # strip the appended reportSha256= field) and hash that reconstruction,
    # which is byte-identical to the shadow file the report actually scored.
    python3 - "$REPORT" "$MODEL" <<'PY'
import hashlib, json, sys
try:
    report = json.load(open(sys.argv[1], encoding="utf-8"))
except (OSError, ValueError) as error:
    raise SystemExit("invalid holdout report: %s" % error)
if report.get("schema") != "cue-holdout-v1" or report.get("verdict") != "pass":
    raise SystemExit("holdout report is not a passing cue-holdout-v1 report")
model_text = open(sys.argv[2], encoding="ascii").read()
lines = model_text.split("\n")
if lines and lines[-1] == "":
    lines.pop()
if not lines or " evidence=heldout " not in lines[0]:
    raise SystemExit("model-header")
header, _, suffix = lines[0].partition(" reportSha256=")
if not suffix:
    raise SystemExit("model-header")
lines[0] = header.replace(" evidence=heldout ", " evidence=shadow ", 1)
shadow_form = ("\n".join(lines) + "\n").encode("ascii")
if report.get("model_sha256") != hashlib.sha256(shadow_form).hexdigest():
    raise SystemExit("holdout report does not evaluate this model's templates")
split = report.get("split", {})
if (split.get("unit") != "whole-session" or split.get("overlap") != [] or
        not split.get("calibration_sessions") or not split.get("holdout_sessions")):
    raise SystemExit("holdout report does not prove a disjoint whole-session split")
if not report.get("cues") or any(not row.get("pass") for row in report["cues"].values()):
    raise SystemExit("one or more cue classes did not pass the report's bounds")
PY
    ;;
  *)
    [ -z "$REPORT" ] || { echo 'a shadow model does not take a holdout report' >&2; exit 2; }
    ;;
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
