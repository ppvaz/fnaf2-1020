# The cams-up luma, measured on this phone.
#
# Across night 6-34's poller trace the snapshot sits at 225-229 for the whole
# cams-up stretch of every cycle and drops to 0-107 for the office window. The
# two populations do not overlap anywhere in 1818 samples, so the line goes
# between them rather than near either.
CUE_CAMS_UP_LUMA=180

# The cams-up grey-cell count, and why it replaced the luma line above for the
# resync check.
#
# The 1818-sample calibration above is sound and narrow: night 6-34's route
# sits on CAM 11 for its entire cams-up stretch, so all 1818 samples came from
# one camera. Selecting all twelve in turn and reading the helper's own grid
# (2026-08-26), luma at (3,6) clears 180 on CAM 11 alone -- 226 there, 0-106 on
# the other eleven -- while an office holding the LEFT VENT light reads 102,
# above eight of the twelve cameras. So this detector is calibrated on the one
# state where it is not needed and blind in the state it exists to catch: a
# desync puts the game on whatever camera the lost press left selected, and
# CAM 11 is not it.
#
# Corrected 2026-08-26, same day: this comment first said night 1's resync
# failed "exactly here". It did not, and the session manifest says so --
# n1-full-1640 ran with CUE_HELPER=0, so CUE_PORT was "-" and the whole
# verification branch was skipped. That resync failed because nothing verified
# it, not because luma was blind. The luma blindness is measured and real; it
# was simply not what broke that night. A cause inferred from a plausible
# mechanism, with the run's own recorded configuration left unread, is the
# failure this repository keeps paying for.
#
# `grey=` is the near-grey cell count over the whole 20x9 grid, which a
# point-sampling sensor cannot defeat by geometry. Measured: monitor-up
# 173-180 across all twelve cameras, office 142-145 across four variants
# including the vent light that fools luma. The line goes between them.
# See docs/device/ON-DEVICE-VALIDATION.md §"Which anchor survives a
# point-sampling sensor". The mask also reads 175, which is why this is only
# ever consulted where the mask is known off -- as the comment below argues,
# the game has no state with both raised.
CUE_CAMS_UP_GREY=159

# Decide, from one cue-helper snapshot line, whether the cams are still up.
# Echoes "<1|0> <why>" -- a subshell cannot hand a variable back, so the reason
# rides the same line the verdict does.
#
# grey= is preferred and luma= is a named fallback, never a silent one. The
# fallback reads cams-up on CAM 11 alone, and the route selects cams 10, 04, 07
# and 11 -- so on three of its own four cameras the luma arm is blind. A quiet
# downgrade to it would read exactly like a working check.
cams_still_up() {
  csu_grey=$(printf '%s\n' "$1" | sed -n 's/.* grey=\([0-9]*\).*/\1/p')
  csu_luma=$(printf '%s\n' "$1" | sed -n 's/.* luma=\([0-9]*\).*/\1/p')
  if [ -n "$csu_grey" ]; then
    if [ "$csu_grey" -ge "$CUE_CAMS_UP_GREY" ]; then
      printf '1 grey %s\n' "$csu_grey"
    else
      printf '0 grey %s\n' "$csu_grey"
    fi
    return 0
  fi
  echo 'WARNING: cue helper sends no grey=; falling back to luma, which sees cams-up on CAM 11 alone' >&2
  if [ -n "$csu_luma" ] && [ "$csu_luma" -ge "$CUE_CAMS_UP_LUMA" ]; then
    printf '1 luma-fallback %s\n' "$csu_luma"
  else
    printf '0 luma-fallback %s\n' "${csu_luma:-none}"
  fi
}

