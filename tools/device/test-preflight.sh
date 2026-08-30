#!/bin/bash
# Gate for preflight.sh. Mock adb, no phone.
#
# What this covers: every mechanical check that decides whether a run can
# observe anything -- device count, both packages, the helper actually running,
# a live port and token, and the helper answering with grey=. That last one is
# the check that exists because n1-full-1640 ran with CUE_HELPER=0, recorded no
# cue data at all, and a later session read its failed recovery as a threshold
# bug instead of a run that never sampled.
#
# What this does NOT cover, stated rather than implied: the two screen checks.
# The synthetic title fixtures in testdata/ classify as `state=night` under
# lifecycle-observe.py -- they are built to prove the selector's plumbing and
# their own generator says they prove nothing about a real screen. So the
# screen steps are asserted structurally (they exist, they run last, they are
# reached only after everything above passes) and their classification is
# proven by test-screenstate.py against real frames, not here.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/fnaf2-preflight-test-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/out" "$TMP/frames"

cat > "$TMP/bin/adb" <<'MOCK'
#!/bin/bash
case "$*" in
  "devices")                      printf 'List of devices attached\n'
                                  [ -z "$MOCK_DEVICES" ] || printf '%s\tdevice\n' $MOCK_DEVICES
                                  exit 0 ;;
  "shell pm list packages "*)     [ "$MOCK_PKGS" = none ] || printf 'package:%s\n' "${!#}"; exit 0 ;;
  "shell pidof "*)                printf '%s\n' "$MOCK_PID"; exit 0 ;;
  "logcat -d"*)                   printf '%s\n' "$MOCK_CONTROL"; exit 0 ;;
  "shell toybox nc"*)             printf '%s\n' "$MOCK_SNAP"; exit 0 ;;
  "shell dumpsys window")         printf '%s\n' "$MOCK_FOCUS"; exit 0 ;;
  "exec-out screencap -p")        cat "$MOCK_FRAME"; exit 0 ;;
esac
echo "unexpected mock adb: $*" >&2; exit 1
MOCK
chmod +x "$TMP/bin/adb"
export PATH="$TMP/bin:$PATH" PREFLIGHT_OUT="$TMP/out"

python3 "$HERE/testdata/make-title-fixture.py" "$TMP/frames" >/dev/null
export MOCK_FRAME="$TMP/frames/story-progress.png"
export MOCK_DEVICES=ZF525F5BH5
export MOCK_PKGS=all
export MOCK_PID=7007
export MOCK_CONTROL='I/FnafCueHelper(7007): RUNNING control=READY port=49707 token=0123456789abcdef0123456789abcdef'
export MOCK_SNAP='OK snapshotNs=1 visual=OBSERVED seq=1 rgba=1,2,3 luma=2 cam05_mean_luma=30 grey=178 ageUs=1200'
# Two mCurrentFocus lines, the first null, because that is what the device
# prints mid-transition and matching only the first is a documented trap.
export MOCK_FOCUS='  mCurrentFocus=null
  mCurrentFocus=Window{a1b2c3 u0 com.scottgames.fnaf2/com.scottgames.fnaf2.MainActivity}'

printf 'SCM1 stub' > "$TMP/bb.scm"
export BB_LEFT_MODEL="$TMP/bb.scm"

run() { "$HERE/preflight.sh" "${1:-1}" 2>&1 || true; }
want() { # want <substring> <output> <label>
  case "$2" in *"$1"*) ;; *) echo "FAIL $3: expected '$1' in:"$'\n'"$2" >&2; exit 1 ;; esac
}

# Bad night arguments are refused before anything touches the device.
want "usage" "$("$HERE/preflight.sh" 2>&1 || true)" "no night"
want "not 1-6" "$(run 7)" "night 7"

# Everything healthy: the run reaches the screen checks, which proves each
# mechanical step above it passed.
out="$(run 1)"
want "ok    device" "$out" "device listed"
want "grey=178" "$out" "snapshot reported"
want "game focused" "$out" "focus checked"
# The healthy path must reach the SCREEN step -- the furthest a mock can go,
# since the synthetic fixtures classify as state=night (see the header). Every
# other assertion here matches a substring printed early, so before this line a
# new refusal inserted anywhere in the middle broke every real run while this
# gate stayed green. That is precisely what the back-stack focus check did when
# it was first added: the mock had no `dumpsys window` case, preflight refused
# at step 7 on every invocation, and nothing here noticed.
want "the game is not at the title" "$out" "healthy path reaches the screen step"

# One device only.
# The assignment must sit INSIDE the substitution: in `VAR=x want ... "$(run)"`
# the substitution is expanded before VAR=x takes effect, so every one of these
# would run against the healthy environment and pass for the wrong reason.
want "exactly one adb device" "$(MOCK_DEVICES=$'ZF525F5BH5\nEMULATOR29X' run 1)" "two devices"
want "exactly one adb device" "$(MOCK_DEVICES='' run 1)" "no devices"

want "is not installed" "$(MOCK_PKGS=none run 1)" "missing package"
want "not running" "$(MOCK_PID='' run 1)" "helper stopped"
want "no live loopback port" \
  "$(MOCK_CONTROL='I/FnafCueHelper(7007): RUNNING control=READY token=0123456789abcdef0123456789abcdef' run 1)" \
  "no port"
want "no valid 32-char token" \
  "$(MOCK_CONTROL='I/FnafCueHelper(7007): RUNNING control=READY port=49707 token=short' run 1)" \
  "bad token"
want "did not answer a snapshot" "$(MOCK_SNAP='ERROR unavailable' run 1)" "helper mute"

# The one that matters most: an older helper build runs, answers, and silently
# degrades the resync verification to an arm that sees one camera in four.
want "sends no grey=" \
  "$(MOCK_SNAP='OK visual=OBSERVED luma=2 cam05_mean_luma=30 ageUs=1200' run 1)" \
  "helper predates grey="

# The helper's MainActivity sits in the back stack after you grant capture
# consent. If it comes forward, the runner's own focus guard refuses partway
# through a night and the failure reads as a transient.
want "cue helper's activity is focused" \
  "$(MOCK_FOCUS='  mCurrentFocus=Window{9f8e7d u0 com.fnaf2.cuehelper/com.fnaf2.cuehelper.MainActivity}' run 1)" \
  "helper in front"
want "not the focused window" "$(MOCK_FOCUS='  mCurrentFocus=null' run 1)" "nothing focused"
# The game must be matched across ALL mCurrentFocus lines, not just the first:
# the first is routinely null mid-transition, and `-m1` would refuse a healthy
# phone. This is the healthy fixture with the order reversed.
want "game focused" \
  "$(MOCK_FOCUS='  mCurrentFocus=null
  mCurrentFocus=Window{a1b2c3 u0 com.scottgames.fnaf2/com.scottgames.fnaf2.MainActivity}' run 1)" \
  "null first line does not refuse"

# A run with no left-opening read is refused by the runner, so preflight must
# refuse it first -- this is the check it was missing when it green-lit a night
# the runner then rejected. It must also refuse for the same REASON, and the
# reason is night-dependent: `canAct(1,'bb')` is false, so quoting the Night 6
# BB->Foxy figure at a Night 1 operator is the conflation the engine already
# fixed and the shell did not. The requirement itself does not move -- the same
# capture carries the desync checkpoint and the health guards on every night.
want "no BB left model" "$(BB_LEFT_MODEL="$TMP/absent.scm" run 1)" "missing bb model"
printf 'not a model' > "$TMP/bad.scm"
want "is not an SCM model" "$(BB_LEFT_MODEL="$TMP/bad.scm" run 1)" "corrupt bb model"
want "cannot act on night 1" "$(BB_LEFT_MODEL="$TMP/absent.scm" run 1)" "night 1 reason"
want "desync checkpoint" "$(BB_LEFT_MODEL="$TMP/absent.scm" run 1)" "night 1 real reason"
want "can act on night 6" "$(BB_LEFT_MODEL="$TMP/absent.scm" run 6)" "night 6 reason"
want "0/3000" "$(BB_LEFT_MODEL="$TMP/absent.scm" run 6)" "night 6 cites the figure"
# The healthy path says which reason applied, so a passing preflight is not
# silent about a night where Balloon Boy is not the threat being guarded.
want "cannot act on night 1" "$(run 1)" "healthy night 1 names the reason"

# Structural: the printed invocation must set CUE_HELPER=1 and must thread the
# requested night through both the calibration and the human assertion, or a
# copy-paste runs a different night blind.
src="$(cat "$HERE/preflight.sh")"
for needle in 'CUE_HELPER=1' 'CALIBRATION_STORY_NIGHT=$NIGHT' 'STORY_CURSOR_OBSERVED=$NIGHT' 'BB_LEFT_MODEL='; do
  case "$src" in *"$needle"*) ;; *) echo "FAIL: preflight must print $needle" >&2; exit 1 ;; esac
done
# The cursor stays a human assertion: preflight must never launch the runner.
case "$src" in
  *'trial.sh n${NIGHT}'*) ;;
  *) echo "FAIL: preflight must print the invocation" >&2; exit 1 ;;
esac
if grep -qE '^[^#]*(bash|sh|exec)[^#]*trial\.sh' "$HERE/preflight.sh"; then
  echo "FAIL: preflight must print the invocation, never execute it -- the save" \
       "cursor is a human assertion by design" >&2
  exit 1
fi

echo "preflight checks passed"
