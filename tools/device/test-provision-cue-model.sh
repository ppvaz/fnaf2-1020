#!/bin/bash
# Mock regression for provision-cue-model.sh's holdout gate. No phone, no adb.
#
# Neither closed defect had coverage before this file: `Model.read` on the
# device only checks that `reportSha256=` is *shaped* like a hash (64 hex
# chars) -- it has no report to verify against, by design, so the real gate
# has to be here, host-side, before the model ever reaches the phone. This
# proves it actually is one: a heldout model with no report, a mismatched
# report hash, a failing report, and -- the defect this file exists for --
# a genuinely passing report that evaluated a *different* model's templates,
# hand-pasted onto this one's header, must each be refused before any adb
# call. A humane transfer (shadow, and heldout with its true report) must
# still install and read back byte-identical.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/provision-cue-model.sh"
EXPORT="$HERE/../cue/export-model.py"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/fnaf2-provision-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT HUP INT TERM

# --- fixtures --------------------------------------------------------------

pcm="$(python3 -c "
import base64, struct
print(base64.b64encode(struct.pack('<128h', *range(128))).decode('ascii'))
")"
cat > "$TMP/shadow.txt" <<EOF
cue-model-v1 calibration=synthetic evidence=shadow rate=4000 margin=0.050000
template cue=bang id=17 threshold=0.750000 pcm=$pcm
EOF

model_sha256="$(shasum -a 256 "$TMP/shadow.txt" | awk '{print $1}')"
python3 - "$TMP/report.json" "$model_sha256" <<'PY'
import json, sys
path, model_sha256 = sys.argv[1], sys.argv[2]
json.dump({
    "schema": "cue-holdout-v1", "verdict": "pass", "model_sha256": model_sha256,
    "split": {"unit": "whole-session", "calibration_sessions": ["c1"],
              "holdout_sessions": ["h1"], "overlap": []},
    "cues": {"bang": {"pass": True}},
}, open(path, "w", encoding="utf-8"))
PY

python3 "$EXPORT" --evidence heldout --shadow-model "$TMP/shadow.txt" \
  --holdout-report "$TMP/report.json" --output "$TMP/heldout.txt"

# A second, unrelated shadow model + its own genuinely passing report --
# neither ever compared against the first model's templates.
pcm2="$(python3 -c "
import base64, struct
print(base64.b64encode(struct.pack('<128h', *range(1, 129))).decode('ascii'))
")"
cat > "$TMP/other-shadow.txt" <<EOF
cue-model-v1 calibration=synthetic evidence=shadow rate=4000 margin=0.050000
template cue=bang id=17 threshold=0.750000 pcm=$pcm2
EOF
other_sha256="$(shasum -a 256 "$TMP/other-shadow.txt" | awk '{print $1}')"
python3 - "$TMP/other-report.json" "$other_sha256" <<'PY'
import json, sys
path, model_sha256 = sys.argv[1], sys.argv[2]
json.dump({
    "schema": "cue-holdout-v1", "verdict": "pass", "model_sha256": model_sha256,
    "split": {"unit": "whole-session", "calibration_sessions": ["c2"],
              "holdout_sessions": ["h2"], "overlap": []},
    "cues": {"bang": {"pass": True}},
}, open(path, "w", encoding="utf-8"))
PY

# The defect this file exists to close: hand-paste a genuinely-passing
# report's hash onto the FIRST model's header. Every earlier check (shaped
# like a hash, matches the supplied report file, that report itself passes a
# disjoint-split holdout) is satisfied. Only a check against the report's
# OWN claimed model_sha256 -- reconstructing what export-model.py actually
# hashed -- catches that this report never evaluated these templates.
other_report_hash="$(shasum -a 256 "$TMP/other-report.json" | awk '{print $1}')"
sed "s/reportSha256=[0-9a-f]*/reportSha256=$other_report_hash/" \
  "$TMP/heldout.txt" > "$TMP/mismatched.txt"

# A failing report, correctly bound to its own model.
python3 - "$TMP/failing-report.json" "$model_sha256" <<'PY'
import json, sys
path, model_sha256 = sys.argv[1], sys.argv[2]
json.dump({
    "schema": "cue-holdout-v1", "verdict": "fail", "model_sha256": model_sha256,
    "split": {"unit": "whole-session", "calibration_sessions": ["c1"],
              "holdout_sessions": ["h1"], "overlap": []},
    "cues": {"bang": {"pass": False}},
}, open(path, "w", encoding="utf-8"))
PY
python3 "$EXPORT" --evidence heldout --shadow-model "$TMP/shadow.txt" \
  --holdout-report "$TMP/failing-report.json" --output "$TMP/would-be-failing.txt" \
  2>"$TMP/failing-export.err" || true
# export-model.py itself already refuses a non-passing report at promotion
# time, so build the ON-DEVICE-shaped artifact by hand: a syntactically valid
# heldout header whose reportSha256 matches failing-report.json, so only
# provision-cue-model.sh's own verdict check is what has to catch it.
failing_hash="$(shasum -a 256 "$TMP/failing-report.json" | awk '{print $1}')"
sed "s/reportSha256=[0-9a-f]*/reportSha256=$failing_hash/" \
  "$TMP/heldout.txt" > "$TMP/failing.txt"

# --- a tiny mock adb, stateful only for the one staged transfer -----------

mkdir -p "$TMP/bin"
cat > "$TMP/bin/adb" <<'MOCK'
#!/bin/bash
set -eu
STATE_DIR="${MOCK_DEVICE_DIR:?}"
case "${1:-}" in
  get-state) echo device; exit 0 ;;
  -s) echo device; exit 0 ;;
  shell)
    case "${2:-}" in
      pidof) exit 1 ;; # helper not running: exercises the non-reload path
      run-as)
        # $3 is the package, ignored -- there is only ever one. $4 is the
        # sub-command; `test -e TARGET` is the only one whose result the
        # script branches on, so it is the only one not unconditionally OK.
        case "${4:-}" in
          test) if [ "${MOCK_TARGET_EXISTS:-0}" = 1 ]; then exit 0; else exit 1; fi ;;
          *) exit 0 ;;
        esac ;;
      *) echo "unexpected mock adb shell invocation: $*" >&2; exit 1 ;;
    esac ;;
  exec-in)
    [ "${2:-}" = run-as ] || { echo "unexpected mock adb exec-in: $*" >&2; exit 1; }
    cat > "$STATE_DIR/staged"; exit 0 ;;
  exec-out)
    [ "${2:-}" = run-as ] || { echo "unexpected mock adb exec-out: $*" >&2; exit 1; }
    cat "$STATE_DIR/staged"; exit 0 ;;
  *) echo "unexpected mock adb invocation: $*" >&2; exit 1 ;;
esac
MOCK
chmod +x "$TMP/bin/adb"

run() { # ARGS... -- prints combined output, exit status is the script's
  PATH="$TMP/bin:$PATH" MOCK_DEVICE_DIR="$STATE_DIR" ANDROID_SERIAL=TEST123 \
    MOCK_TARGET_EXISTS="${MOCK_TARGET_EXISTS:-0}" "$SCRIPT" "$@" 2>&1
}

failed=0
check() { # NAME EXPECTED_RC ACTUAL_RC OUTPUT NEEDLE
  local name=$1 exp_rc=$2 rc=$3 out=$4 needle=${5:-}
  if [ "$rc" -ne "$exp_rc" ]; then
    echo "FAIL $name -- exit $rc, expected $exp_rc"
    printf '%s\n' "$out" | sed 's/^/    /'
    failed=$((failed + 1))
    return
  fi
  if [ -n "$needle" ]; then
    case "$out" in
      *"$needle"*) ;;
      *) echo "FAIL $name -- output missing \"$needle\""
         printf '%s\n' "$out" | sed 's/^/    /'
         failed=$((failed + 1)) ;;
    esac
  fi
}

STATE_DIR="$TMP/device"; mkdir -p "$STATE_DIR"
rc=0; out=$(run "$TMP/heldout.txt") || rc=$?
check 'heldout with no report is refused' 2 "$rc" "$out" \
  'a heldout model requires its cue-holdout-v1 report'

rc=0; out=$(run "$TMP/heldout.txt" "$TMP/other-report.json") || rc=$?
check 'heldout report hash mismatch is refused' 2 "$rc" "$out" \
  'holdout report hash does not match the model'

rc=0; out=$(run "$TMP/mismatched.txt" "$TMP/other-report.json") || rc=$?
check 'a passing report for a DIFFERENT model is refused' 1 "$rc" "$out" \
  "holdout report does not evaluate this model's templates"

rc=0; out=$(run "$TMP/failing.txt" "$TMP/failing-report.json") || rc=$?
check 'a failing report is refused' 1 "$rc" "$out" \
  'holdout report is not a passing cue-holdout-v1 report'

rc=0; out=$(run "$TMP/nonexistent.txt") || rc=$?
check 'a missing model file is refused' 2 "$rc" "$out" 'model does not exist'

STATE_DIR="$TMP/device-a"; mkdir -p "$STATE_DIR"
rc=0; out=$(run "$TMP/shadow.txt") || rc=$?
check 'a shadow model installs with no report' 0 "$rc" "$out" 'installed'
staged_hash="$(shasum -a 256 "$TMP/shadow.txt" | awk '{print $1}')"
device_hash="$(shasum -a 256 "$STATE_DIR/staged" | awk '{print $1}')"
[ "$staged_hash" = "$device_hash" ] || {
  echo "FAIL shadow install -- staged bytes do not match the source model"
  failed=$((failed + 1))
}

MOCK_TARGET_EXISTS=1
rc=0; out=$(run "$TMP/shadow.txt") || rc=$?
check 'an existing model without --replace is refused' 2 "$rc" "$out" \
  'pass --replace to replace it'
MOCK_TARGET_EXISTS=0

STATE_DIR="$TMP/device-b"; mkdir -p "$STATE_DIR"
rc=0; out=$(run "$TMP/heldout.txt" "$TMP/report.json") || rc=$?
check 'a heldout model with its true report installs' 0 "$rc" "$out" 'installed'
staged_hash="$(shasum -a 256 "$TMP/heldout.txt" | awk '{print $1}')"
device_hash="$(shasum -a 256 "$STATE_DIR/staged" | awk '{print $1}')"
[ "$staged_hash" = "$device_hash" ] || {
  echo "FAIL heldout install -- staged bytes do not match the source model"
  failed=$((failed + 1))
}

if [ "$failed" -gt 0 ]; then
  echo "$failed provision-cue-model check(s) failed"
  exit 1
fi
echo "provision-cue-model: holdout gate verified against the shipped script"
