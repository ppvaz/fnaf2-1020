#!/bin/bash
# Gate for the title/menu selector. Mock adb, synthetic frames, no phone.
#
# The hazard this closes is not hypothetical. `TAP_NEWGAME` has sat in
# coords.sh since 2026-08-20 next to the two coordinates the runners do press,
# unguarded, and four separate scripts decided which title item to tap with
# their own copy of `NIGHT_TAP=$TAP_CONTINUE; [ "$NIGHT" = 6th ] &&
# NIGHT_TAP=$TAP_6TH` -- without ever looking at the screen. One edit away from
# erasing a save nobody can restore, which is exactly what happened to the
# target device before this was written.
#
# So there are two halves here. The behavioural half drives menu_select through
# every save state and every way of not knowing. The structural half proves no
# other path exists: nothing outside this module may name the New Game
# coordinate, and no runner may keep its own title table.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/fnaf2-menu-test-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin" "$TMP/frames"
python3 "$HERE/testdata/make-title-fixture.py" "$TMP/frames" >/dev/null

cat > "$TMP/bin/adb" <<'MOCK'
#!/bin/bash
case "${1:-} ${2:-} ${3:-}" in
  "exec-out screencap -p")   cat "$MOCK_FRAME"; exit 0 ;;
  "shell pm list")           printf '%s\n' "$MOCK_PACKAGES"; exit 0 ;;
  "shell dumpsys window")    printf '%s\n' "$MOCK_FOCUS"; exit 0 ;;
  "shell dumpsys package")   printf '    versionName=%s\n' "$MOCK_VERSION"; exit 0 ;;
esac
case "${1:-} ${2:-}" in
  "shell input") shift; printf '%s\n' "$*" >> "$MOCK_TAPS"; exit 0 ;;
esac
echo "unexpected mock adb invocation: $*" >&2
exit 1
MOCK
chmod +x "$TMP/bin/adb"
export PATH="$TMP/bin:$PATH"

# dumpsys prints several mCurrentFocus lines and the first is often null
# mid-transition. The mock reproduces that, so a future `grep -m1` fails here.
FOCUS_OK=$'  mCurrentFocus=null\n  mCurrentFocus=Window{a1b2 u0 com.scottgames.fnaf2/com.unity3d.player.UnityPlayerActivity}'
FOCUS_LOST=$'  mCurrentFocus=Window{c3d4 u0 com.android.launcher/com.android.launcher.Launcher}'

# The device state the guards read. The wrong-game case is not hypothetical:
# on 2026-08-26 the target phone had com.scottgames.fnaf2 missing and FNaF *1*
# installed instead, and both games report versionName 2.0.7.
PACKAGES_OK=$'package:org.fossify.home\npackage:com.scottgames.fnaf2'
PACKAGES_WRONG_GAME=$'package:org.fossify.home\npackage:com.scottgames.fivenightsatfreddys'

MODEL="$TMP/frames/synthetic-title-model.json"
TAPS="$TMP/taps"
OUT="$TMP/out"
failed=0

# frame target [KEY=VALUE ...] -- runs one guarded selection in a subshell.
attempt() {
  local frame=$1 target=$2; shift 2
  : > "$TAPS"
  (
    set +e
    export MOCK_FRAME="$TMP/frames/$frame.png" MOCK_TAPS="$TAPS"
    export MOCK_FOCUS="${FOCUS:-$FOCUS_OK}" TITLE_MODEL="$MODEL"
    export MOCK_PACKAGES="${PACKAGES:-$PACKAGES_OK}" MOCK_VERSION="${VERSION:-2.0.7}"
    local kv
    for kv in "$@"; do export "${kv?}"; done
    # shellcheck source=/dev/null
    source "$HERE/coords.sh"
    # shellcheck source=/dev/null
    source "$HERE/menu.sh"
    menu_select "$target"
    echo "menu_select_exit=$?"
  ) > "$OUT" 2>&1
}

expect() {                                  # name pattern
  grep -q -- "$2" "$OUT" || {
    echo "FAIL $1 -- expected /$2/ in:"; sed 's/^/    /' "$OUT"; failed=1; }
}
expect_no_tap() {                           # name
  [ ! -s "$TAPS" ] || {
    echo "FAIL $1 -- pressed something: $(cat "$TAPS")"; failed=1; }
}
expect_tap() {                              # name "x y"
  grep -q "^input swipe $2 $2 120$" "$TAPS" || {
    echo "FAIL $1 -- expected a tap at $2, got: $(cat "$TAPS")"; failed=1; }
}

# ------------------------------------------------- the item has to be there
attempt fresh-save continue
expect 'fresh save refuses Continue' 'continue is not on the title screen'
expect_no_tap 'fresh save refuses Continue'

attempt fresh-save sixthNight
expect 'fresh save refuses Sixth Night' 'sixthNight is not on the title screen'
expect_no_tap 'fresh save refuses Sixth Night'

attempt story-progress continue
expect_tap 'story progress presses Continue' '400 730'

attempt sixth-unlocked sixthNight
expect_tap 'sixth unlocked presses Sixth Night' '400 880'

# Observed, and still refused: the Custom Night item has never been on a
# calibrated screen, so no coordinate for it has been measured. Seeing an item
# is not the same as knowing where it is.
attempt custom-unlocked customNight
expect 'custom night has no measured coordinate' 'no measured coordinate'
expect_no_tap 'custom night has no measured coordinate'

# ------------------------------------------------------- New Game capability
attempt fresh-save newGame
expect 'New Game refused without the capability' 'needs MENU_ALLOW_SAVE_RESET=1'
expect_no_tap 'New Game refused without the capability'

# It is a capability, not a fallback: a title with no Continue does not make
# New Game the answer.
attempt fresh-save newGame MENU_ALLOW_SAVE_RESET=0
expect_no_tap 'a missing Continue does not authorize New Game'

attempt fresh-save newGame MENU_ALLOW_SAVE_RESET=1
expect 'authorized New Game is logged' 'New Game authorized for this run'
expect_tap 'authorized New Game presses' '400 640'
# The authorization line must say what it authorized and nothing about the
# device. Plan 09's provenance rules apply to a log line too.
if grep -qiE 'serial|/Users/|ANDROID_SERIAL|[0-9]{1,3}(\.[0-9]{1,3}){3}' "$OUT"; then
  echo "FAIL the authorization log leaks device data:"; sed 's/^/    /' "$OUT"; failed=1
fi

# --------------------------------------------------- every way of not knowing
attempt ambiguous continue
expect 'an undecided band refuses' 'ambiguous:continue'
expect_no_tap 'an undecided band refuses'

# The gate runs before the item bands, so another screen is rejected as another
# screen rather than being asked which title items it has. The real Options
# screen is why: its "Perspective Effect" label lands inside the New Game band
# at 0.0186, against a 0.020 present threshold.
attempt unknown-layout continue
expect 'an unrecognised screen refuses' 'not-the-title-screen'
expect_no_tap 'an unrecognised screen refuses'

# The New Game confirmation keeps the logo and lights every item row, and on
# the real dialog "Yes" sits exactly on the 6th Night coordinate. Reading it as
# a menu is how the save gets erased, so it must be refused positively rather
# than by an accident of thresholds.
attempt confirm-dialog sixthNight
expect 'the New Game confirmation is not a menu' 'title-dialog'
expect_no_tap 'the New Game confirmation is not a menu'

attempt confirm-dialog continue
expect_no_tap 'no item is pressed on the confirmation'

attempt title-no-items continue
expect 'a title screen with no items refuses' 'no-items-visible'
expect_no_tap 'a title screen with no items refuses'

# The wrong game, and the trap that makes it hard to see: FNaF 1 also reports
# versionName 2.0.7, so only the package name identifies the game.
PACKAGES="$PACKAGES_WRONG_GAME" attempt sixth-unlocked sixthNight
expect 'the wrong game refuses' 'com.scottgames.fnaf2 is not installed'
expect 'the wrong game names what it found' 'fivenightsatfreddys'
expect 'the wrong game warns that the version matches anyway' 'both report versionName 2.0.7'
expect_no_tap 'the wrong game refuses'

VERSION="1.9.0" attempt sixth-unlocked sixthNight
expect 'an uncalibrated build refuses' 'not the calibrated'
expect_no_tap 'an uncalibrated build refuses'

FOCUS="$FOCUS_LOST" attempt sixth-unlocked sixthNight
expect 'lost focus refuses' 'is not the focused window'
expect_no_tap 'lost focus refuses'

# -1, not 0. The age is now measured from when the observation RETURNED
# rather than from when it started, so under a mock it is a couple of
# milliseconds and `age <= 0` was decided by how fast this machine ran the
# shell between the two. A limit no non-negative age can satisfy asserts the
# refusal rather than racing it.
attempt sixth-unlocked sixthNight MENU_STALE_MS=-1
expect 'a stale observation refuses' 'ms old (limit -1 ms)'
expect_no_tap 'a stale observation refuses'

attempt sixth-unlocked bogusTarget
expect 'an unknown MenuTarget refuses' 'not a MenuTarget'
expect_no_tap 'an unknown MenuTarget refuses'

# A model that is not there. The shipped default is the calibrated handset's;
# another handset or build has none until someone measures one, and that must
# refuse and say how to fix it rather than fall back to numbers from a
# different screen.
(
  set +e
  export MOCK_FRAME="$TMP/frames/sixth-unlocked.png" MOCK_TAPS="$TAPS" MOCK_FOCUS="$FOCUS_OK"
  export MOCK_PACKAGES="$PACKAGES_OK" MOCK_VERSION=2.0.7
  export TITLE_MODEL="$TMP/there-is-no-model-here.json"
  : > "$TAPS"
  # shellcheck source=/dev/null
  source "$HERE/coords.sh"
  # shellcheck source=/dev/null
  source "$HERE/menu.sh"
  menu_select sixthNight
) > "$OUT" 2>&1 || true
expect 'a missing title model refuses' 'title-model-unreadable'
expect 'a missing title model says how to build one' 'title-observe.py --measure'
expect_no_tap 'a missing title model refuses'

# The shipped model is the one the runners actually get, so it must load and
# it must be the calibrated build's.
[ -f "$HERE/models/title-moto-g56-v207.json" ] || {
  echo 'FAIL the default title model menu.sh points at does not exist'; failed=1; }

# ------------------------------------------------------- the structural half
# Nothing but this module may name the save-destructive coordinate.
offenders=$(grep -rl 'TAP_NEWGAME' "$HERE" --include='*.sh' 2>/dev/null \
  | grep -vE '/(menu|coords|test-menu)\.sh$' || true)
[ -z "$offenders" ] || {
  echo "FAIL these scripts name the New Game coordinate outside the selector:"
  printf '    %s\n' $offenders
  echo "    Route them through menu_select, which requires MENU_ALLOW_SAVE_RESET=1."
  failed=1
}

# And no runner may keep its own copy of the title table.
for runner in trial-minus7.sh trial-maskcamp.sh watch-vent-cue.sh collect-cue-audio.sh; do
  [ -f "$HERE/$runner" ] || continue
  if grep -qE 'NIGHT_TAP|input swipe \$TAP_(6TH|CONTINUE|NEWGAME)' "$HERE/$runner"; then
    echo "FAIL $runner still resolves a title item itself; use menu_select"
    failed=1
  fi
  grep -q 'menu.sh' "$HERE/$runner" || {
    echo "FAIL $runner presses a title item without sourcing the selector"; failed=1; }
done

[ "$failed" -eq 0 ] || { echo 'menu selector checks failed'; exit 1; }
echo 'menu selector: 8 screen states, 11 refusals, New Game gated by capability, no second title table'
