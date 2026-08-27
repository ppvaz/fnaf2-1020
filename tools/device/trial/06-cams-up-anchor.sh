# The cams-up luma, measured on this phone.
#
# Across night 6-34's poller trace the snapshot sits at 225-229 for the whole
# cams-up stretch of every cycle and drops to 0-107 for the office window. The
# two populations do not overlap anywhere in 1818 samples, so the line goes
# between them rather than near either.
CUE_CAMS_UP_LUMA=180

# The camera-map selection highlight, as one ROI, shared by both consumers.
#
# `classify_left_and_queue_mask_at` already detects the desync with this exact
# region and these exact thresholds, and it is the only cams-up detector in
# this driver with a device grade behind it: on the frames from nights 6-25 and
# 6-26 the office scores 0-1 bright-lime pixels here and the camera feed 70-140,
# two orders of magnitude either side of the 30 threshold. The camera map's
# lime selection highlight lives on the right of the screen; the office's own
# green LIGHT button is at x~350 and outside the ROI.
#
# It is a variable rather than two copies of the literal because the recovery
# below must not be able to drift from the detection that triggers it. Both
# were literals until 2026-08-26 and they were not even the same detector.
CUE_MONITOR_ROI='1300 350 2300 950 4 100 255 100 255 0 99 30'

# WITHDRAWN 2026-08-26, hours after it shipped in ffb1631: CUE_CAMS_UP_GREY=159.
#
# The retraction stays because the reasoning that produced it is the recurring
# error here, not the number. `grey=` is the near-grey cell count over the
# helper's 20x9 grid, and the constant was placed at 159 on a claimed gap
# between monitor-up 173-180 (all twelve cameras) and office 142-145 (four
# variants). The camera half of that measurement is fine. The office half came
# from five idle captures on a PARKED device, and it does not survive a night.
#
# Graded on the cleared run `captures/n1-grey-2202-run.log`, whose office reads
# carry `cue[... grey=N ...]` from the same helper build:
#
#   77 office reads, grey 138-180, median 151
#   21 of 77 at or above 159 -- 16 of them a confident `empty` classification,
#   which is an office frame by construction, and 5 of them frames on which the
#   real `$CHECKER match` ran and answered `cams=down`
#
# So the office reaches the top of the claimed monitor-up band, the two
# populations overlap completely, and no line through `grey=` separates them.
# Every one of those 21 would have been a false "cams still up", and a false
# "still up" is not a harmless extra read: it sends the retry press, which on a
# monitor that is already down RAISES it -- manufacturing the desync the
# corrector exists to repair. That is night 6-38's failure mode again, one
# layer down.
#
# `grey=` is not deleted from the snapshot line; it is still logged by
# `classify_left_and_queue_mask_at`, and the 77-sample distribution above is
# the first labelled population it has. It simply decides nothing.
#
# What replaced it is the ROI above -- the detector that had already read
# those same frames and got them right.

# Decide whether the cams are still up after a resync press.
# Echoes "<1|0> <why>" -- a subshell cannot hand a variable back, so the reason
# rides the same line the verdict does.
#
# This costs a screencap (~225 ms) where the cue helper cost 59 ms, and that is
# affordable here and nowhere else: it is a rare post-desync path that is
# already holding MONITOR_ANIM_DOWN (367 ms) for the flip to finish, and the
# cycle it sits in has already lost its schedule. The main loop's per-cycle
# read is priced against ~680 ms of free time and could not pay this.
#
# Anything that is not a positive `match` reads as "not still up". An
# unreadable frame is not evidence that the monitor is up, and treating it as
# evidence is what would press the monitor back up.
cams_still_up() {
  csu_raw="$PIDFILE.resync.raw"
  rm -f "$csu_raw"
  : > "$CAPTURE_LOCK"
  screencap > "$csu_raw" 2>/dev/null || true
  rm -f "$CAPTURE_LOCK"
  if [ ! -s "$csu_raw" ]; then
    rm -f "$csu_raw"
    printf '0 selection-highlight capture-failed\n'
    return 0
  fi
  csu_seen=$("$CHECKER" match $CUE_MONITOR_ROI < "$csu_raw" 2>/dev/null) || csu_seen=error
  rm -f "$csu_raw"
  case "$csu_seen" in
    match) printf '1 selection-highlight match\n' ;;
    clear) printf '0 selection-highlight clear\n' ;;
    *)     printf '0 selection-highlight unreadable\n' ;;
  esac
}
