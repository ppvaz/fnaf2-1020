#!/bin/bash
# One command that says whether a night can be run, and prints the invocation.
#
# Every check here was done by hand before a run and got inferred wrong at
# least once. The expensive one: n1-full-1640 was launched with CUE_HELPER=0,
# so its cue port was "-", the resync verification branch never executed, and
# a later session read the failed recovery as evidence that the luma threshold
# was blind. It was not; nothing had run. A run's configuration is not a
# detail to reconstruct afterwards -- it decides what the run can even observe.
#
# Refuses loudly and names the reason. It never launches anything: the last
# step is a human reading the save cursor, which trial.sh keeps manual
# on purpose (see its STORY_CURSOR_OBSERVED guard).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
NIGHT="${1:-}"
case "$NIGHT" in
  ''|*[!0-9]*) echo "usage: preflight.sh <night 1-6>" >&2; exit 2 ;;
esac
[ "$NIGHT" -ge 1 ] && [ "$NIGHT" -le 6 ] || { echo "night $NIGHT is not 1-6" >&2; exit 2; }

HELPER_PKG=com.fnafminus7.cuehelper
GAME_PKG=com.scottgames.fnaf2
OUT_DIR="${PREFLIGHT_OUT:-$HERE/../../captures/preflight}"
fail() { echo "REFUSED: $*" >&2; exit 1; }
ok()   { printf '  ok    %s\n' "$*"; }

echo "preflight for night $NIGHT"

# 1. Exactly one device, so a command cannot silently address another handset.
devices="$(adb devices | awk 'NR>1 && $2=="device" {print $1}')"
count="$(printf '%s\n' "$devices" | grep -c . || true)"
[ "$count" -eq 1 ] || fail "expected exactly one adb device, found $count"
ok "device $devices"

# 2. Both packages present.
for pkg in "$HELPER_PKG" "$GAME_PKG"; do
  pm_out="$(adb shell pm list packages "$pkg" 2>/dev/null | tr -d '\r')"
  grep -q "package:$pkg" <<<"$pm_out" || fail "$pkg is not installed"
done
ok "helper and game installed"

# 3. The helper is RUNNING. A stale install that was never reopened after an
#    `adb install` looks identical from `pm list` and answers nothing.
cue_pid="$(adb shell pidof "$HELPER_PKG" 2>/dev/null | tr -d '\r' | awk '{print $1}')"
[ -n "$cue_pid" ] || fail "the cue helper is not running -- open it and press START UNIFIED CAPTURE"
ok "helper running (pid $cue_pid)"

# 4. It has a live control port and a per-run token.
control="$(adb logcat -d --pid="$cue_pid" -v brief -s FnafCueHelper:I '*:S' 2>/dev/null |
  tr -d '\r' | awk '/control=(READY|DEGRADED)/ { line=$0 } END { print line }')"
port="$(sed -n 's/.* port=\([^ ]*\).*/\1/p' <<<"$control")"
token="$(sed -n 's/.*token=\([0-9a-f][0-9a-f]*\).*/\1/p' <<<"$control")"
case "$port" in ''|*[!0-9]*) fail "the helper has no live loopback port (capture not started?)" ;; esac
[ "${#token}" -eq 32 ] || fail "the helper has no valid 32-char token"
ok "control port $port"

# 5. It actually answers, and answers with the field the resync check needs.
#    An older build that predates grey= runs fine and degrades the verification
#    to an arm that sees cams-up on CAM 11 alone -- silently, if nobody asks.
snap="$(printf 'GET %s\n' "$token" | adb shell "toybox nc -w 2 127.0.0.1 $port" 2>/dev/null | tr -d '\r' || true)"
case "$snap" in
  'OK '*) ;;
  *) fail "the helper did not answer a snapshot (got: ${snap:-nothing})" ;;
esac
grey="$(sed -n 's/.* grey=\([0-9-]*\).*/\1/p' <<<"$snap")"

[ -n "$grey" ] || fail "this helper build sends no grey= -- rebuild and reinstall android/cue-helper"
ok "snapshot answers, grey=$grey"

# 6. A Balloon Boy read is configured, and its model file is actually there.
#
# The runner refuses without one and it is right to: HID-MULTITOUCH.md records
# 0/3000 on Night 6 for a blind configuration, through the BB->Foxy chain. This
# check exists because preflight passed a night that the runner then refused --
# preflight is worth nothing if the runner knows a precondition it does not.
BB_LEFT_MODEL="${BB_LEFT_MODEL:-$HERE/../../captures/screencheck/bb-left/models/runtime-gh.scm}"
[ -f "$BB_LEFT_MODEL" ] || fail "no BB left model at $BB_LEFT_MODEL -- a run without a BB read is 0/3000"
head -c 4 "$BB_LEFT_MODEL" | grep -q SCM || fail "$BB_LEFT_MODEL is not an SCM model"
ok "BB left model $(basename "$BB_LEFT_MODEL")"

# 7. The GAME is the focused window -- not the helper.
#
# You must foreground the helper's MainActivity to grant MediaProjection
# consent, and Android leaves it in the back stack afterwards. If it comes
# forward again for any reason, the runner's own focus guard finds the helper
# focused instead of the game and refuses mid-run. The failure reads as a
# transient and sends you looking at window state, when the answer is that the
# consent screen never went away.
#
# `dumpsys window` prints several mCurrentFocus lines and the first is often
# `null` mid-transition, so this matches the package across all of them rather
# than taking `-m1` -- and greps a herestring, because `cmd | grep -q` under
# `set -o pipefail` reports 141 when the pattern DOES match. Both traps are
# CLAUDE.md entries paid for in lost nights.
focus="$(adb shell dumpsys window 2>/dev/null | tr -d '\r' | grep mCurrentFocus || true)"
if grep -q "$HELPER_PKG" <<<"$focus"; then
  fail "the cue helper's activity is focused, not the game -- press Back or Home
    on the phone until FNaF 2 is in front. It is left in the back stack after
    you grant capture consent, and a run that starts behind it dies to the
    runner's focus guard partway through."
fi
grep -q "$GAME_PKG" <<<"$focus" || fail "the game is not the focused window (focus: ${focus:-none})"
ok "game focused"

# 8. The game is at its title, which is the only state the runner can start from.
mkdir -p "$OUT_DIR"
shot="$OUT_DIR/preflight-title.png"
adb exec-out screencap -p > "$shot" 2>/dev/null
state="$(python3 "$HERE/lifecycle-observe.py" < "$shot" 2>/dev/null | tail -1)"
[ "$state" = "state=title" ] || fail "the game is not at the title ($state) -- close any running night first"
items="$(TITLE_MODEL="${TITLE_MODEL:-$HERE/models/title-moto-g56-v207.json}" \
  python3 "$HERE/title-observe.py" < "$shot" 2>/dev/null | tail -1)"
grep -q continue <<<"$items" || fail "the title offers no Continue item ($items)"
ok "at the title, $items"

# 9. The save cursor. Deliberately NOT decided here.
#
# trial.sh keeps STORY_CURSOR_OBSERVED as a human assertion on purpose,
# because a run that resumes the wrong night masquerades as a campaign attempt
# on a night nobody verified. So crop the evidence and make a person look at
# it; automating this would be automating away the guard, not satisfying it.
crop="$OUT_DIR/preflight-cursor.png"
python3 - "$shot" "$crop" <<'PY'
from PIL import Image
import sys
im = Image.open(sys.argv[1]).convert('RGB')
w, h = im.size
box = (int(w * 0.04), int(h * 0.63), int(w * 0.34), int(h * 0.80))
im.crop(box).resize(((box[2]-box[0])*2, (box[3]-box[1])*2), Image.LANCZOS).save(sys.argv[2])
PY
ok "cursor crop written to $crop"

cat <<EOF

  All mechanical checks passed. One human step is left by design.

  Open $crop and read the night printed under "Continue".
  If and only if it says Night $NIGHT, run:

    CUE_HELPER=1 NIGHT=continue CALIBRATION_STORY_NIGHT=$NIGHT \\
    STORY_CURSOR_OBSERVED=$NIGHT PRESS_MODE=hid-multi \\
    BB_LEFT_MODEL=$BB_LEFT_MODEL \\
    tools/device/trial.sh n${NIGHT}-\$(date +%H%M) 90

  CUE_HELPER=1 is not optional. Without it CUE_PORT is "-", the resync
  verification never executes, and no grey= is recorded -- which is exactly
  how n1-full-1640 produced a failed recovery that looked like a threshold bug.
EOF
