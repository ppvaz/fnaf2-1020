# The one title/menu selector. Source this; do not re-derive it.
#
# plans/13 keeps four facts apart, and the runners used to collapse all four
# into a single environment variable named `NIGHT`:
#
#   GameConfig  which night is being played              (6, or custom dials)
#   MenuTarget  which title item gets pressed            (newGame|continue|sixthNight|customNight)
#   SaveState   what the save cursor actually holds      (only an observation can say)
#   Policy      which gated plan is executing            (recipe.mjs + human-gate.mjs)
#
# `NIGHT=continue` was all four at once: a menu action standing in for a night
# identity, resolved by `NIGHT_TAP=$TAP_CONTINUE; [ "$NIGHT" = 6th ] &&
# NIGHT_TAP=$TAP_6TH` in four separate scripts, none of which ever looked at the
# screen. `Continue` does not say which night the save cursor owns, and after
# the target device's save was lost it does not say the item is even there.
#
# So: every press goes through menu_select, every menu_select needs a positive
# observation of the item it is about to press, and New Game -- which is
# save-destructive and has never been pressed by any route -- additionally needs
# a deliberate capability the caller must set for that one run.
#
# Requires coords.sh to have been sourced (for the measured tap coordinates).

MENU_HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# How stale an observation may be when the tap goes out. A title screen is
# static, so this is generous; it exists to catch an observation taken before a
# long unrelated step rather than to model animation.
MENU_STALE_MS="${MENU_STALE_MS:-2000}"
# Set to 1, for one run, to permit the save-destructive New Game press. It is
# never inferred from a missing Continue: plans/13 is explicit that New Game is
# not a fallback.
MENU_ALLOW_SAVE_RESET="${MENU_ALLOW_SAVE_RESET:-0}"
MENU_PACKAGE="${MENU_PACKAGE:-com.scottgames.fnaf2}"

MENU_ITEMS=""
MENU_UNKNOWN=""
MENU_OBSERVED_MS=0

# `date +%s%3N` is a GNU extension: BSD date prints a literal "N" and the
# subtraction that follows would then be nonsense rather than an error. This
# runs on the host, not inside the timed policy, so a python3 call is cheap
# enough and correct everywhere.
menu_now_ms() { python3 -c 'import time; print(int(time.time() * 1000))'; }

# MenuTarget -> the measured tap coordinate. This is the only table.
menu_coord() {
  case "$1" in
    newGame)     printf '%s' "$TAP_NEWGAME" ;;
    continue)    printf '%s' "$TAP_CONTINUE" ;;
    sixthNight)  printf '%s' "$TAP_6TH" ;;
    # Deliberately unset. The Custom Night item has never been on screen on the
    # calibrated device, so no coordinate for it has been measured, and a
    # plausible one derived from the spacing of the others would be a guess
    # wearing the same clothes as a measurement.
    customNight) echo 'menu: no measured coordinate for the Custom Night item' >&2; return 3 ;;
    *)           echo "menu: not a MenuTarget: $1" >&2; return 3 ;;
  esac
}

# Observe the title screen. Sets MENU_ITEMS on success, MENU_UNKNOWN otherwise.
# Never decides anything: menu_select does that.
menu_observe() {
  local line
  MENU_ITEMS=""; MENU_UNKNOWN=""
  MENU_OBSERVED_MS=$(menu_now_ms)
  line=$(TITLE_MODEL="${TITLE_MODEL:-}" python3 "$MENU_HERE/title-observe.py" --adb 2>/dev/null) || true
  case "$line" in
    items=*)   MENU_ITEMS="${line#items=}" ;;
    unknown=*) MENU_UNKNOWN="${line#unknown=}" ;;
    *)         MENU_UNKNOWN="observer-produced-no-verdict" ;;
  esac
  [ -n "$MENU_ITEMS" ]
}

menu_has_item() {
  # A herestring, not a pipeline. `printf | tr | grep -q` reports 141 under
  # `set -o pipefail` because grep exits on the first match and tr dies of
  # SIGPIPE -- the guard then reads false exactly when the pattern matched.
  # That bug has already cost this repository two silent nights.
  grep -qx "$1" <<<"$(tr ',' '\n' <<<"$MENU_ITEMS")"
}

# The game must be the focused window before anything is pressed. dumpsys
# prints several mCurrentFocus lines and the first is often null mid-transition,
# so match the package across all of them rather than taking -m1.
menu_focused() {
  local focus
  focus=$(adb shell dumpsys window 2>/dev/null || true)
  grep -q "mCurrentFocus=.*$MENU_PACKAGE" <<<"$focus"
}

# The guarded press. Refuses on: an unknown MenuTarget, an uncalibrated
# coordinate, lost focus, an observation the observer could not make, an item
# that is not on screen, a stale observation, and -- for New Game -- a missing
# capability.
menu_select() {
  local target=$1 xy age
  xy=$(menu_coord "$target") || return 3

  menu_focused || {
    echo "menu: $MENU_PACKAGE is not the focused window; refusing to press $target" >&2
    return 3
  }

  menu_observe || {
    echo "menu: cannot see the title screen ($MENU_UNKNOWN); refusing to press $target" >&2
    [ "$MENU_UNKNOWN" = "no-title-model" ] && cat >&2 <<'HINT'
menu: no title model exists for this build yet, and one is not invented here.
      Capture title frames for each save state and run
        tools/device/title-observe.py --measure < frame.png
      then write the separating thresholds into a title-model-v1 file and point
      TITLE_MODEL at it. Until then no route may press a title item.
HINT
    return 3
  }

  menu_has_item "$target" || {
    echo "menu: $target is not on the title screen (saw: ${MENU_ITEMS:-nothing}); refusing" >&2
    return 3
  }

  if [ "$target" = newGame ]; then
    # Save-destructive, and never a fallback for a missing Continue.
    [ "$MENU_ALLOW_SAVE_RESET" = "1" ] || {
      echo 'menu: New Game erases the save and needs MENU_ALLOW_SAVE_RESET=1 for this run' >&2
      return 3
    }
    # The authorization is recorded, and records nothing about the device: no
    # serial, no path, no account. Plan 09's provenance rules apply to this
    # line as much as to a capture.
    echo "menu: New Game authorized for this run (MENU_ALLOW_SAVE_RESET=1); the save will be erased"
  fi

  age=$(( $(menu_now_ms) - MENU_OBSERVED_MS ))
  [ "$age" -le "$MENU_STALE_MS" ] || {
    echo "menu: the title observation is ${age} ms old (limit ${MENU_STALE_MS} ms); refusing to press $target" >&2
    return 3
  }

  # A 120 ms contact. Fusion polls touch per frame and drops anything shorter.
  adb shell input swipe $xy $xy 120
  echo "menu: pressed $target at $xy (observed ${age} ms earlier: $MENU_ITEMS)"
}
