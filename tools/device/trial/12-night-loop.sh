# A contiguous window of one cycle, delivered as a single hid macro.
#
# The shell wall-times only the window's start and then waits it out; every
# boundary inside is a hid_delay. `getevent` on this phone measured hid_delay
# holding the intended period to a 0.76 ms stdev, 116.4-121.9 ms across 60
# contacts at a 120 ms period, where wait_until overshoots 49-93 ms. The route
# has about 100 ms of total lateness margin, and the exact simulator prices the
# difference at 152/300 nights against 282-300/300: it is the spread that costs
# nights, not the mean, and a wall-timed boundary re-rolls the spread at every
# single action.
#
# The window is capped at one cycle so the shell re-syncs at each anchor. That
# is one wall-timed boundary per cycle instead of one per action, and it bounds
# how long input keeps landing on whatever is in front if the game dies inside
# a macro -- a class no simulator can price, so it is bounded rather than
# reasoned about.
run_macro() {
  rm_cycle=$1; rm_base=$2; rm_skip=$3; rm_limit=$4; rm_floor=${5:-0}
  # A macro cannot absorb the epoch slip: the slip is taken out of a wind hold
  # whose *end* must not move, and inside a macro the offsets are relative.
  [ "$SLIP" -eq 0 ] || {
    echo 'a macro cannot absorb the epoch slip; step that cycle instead' >&2
    exit 47
  }
  rm_idx=0; rm_in=0; rm_started=0; rm_cursor=0; rm_shift=0
  while read -r c1 c2 c3 c4 c5 <&9; do
    if [ "$c1" = '#cycle' ]; then
      if [ "$c2" = "$rm_cycle" ]; then rm_in=1; else rm_in=0; fi
      continue
    fi
    [ "$rm_in" -eq 1 ] || continue
    [ -n "$c1" ] || continue
    rm_idx=$((rm_idx + 1))
    [ "$rm_idx" -gt "$rm_skip" ] || continue
    [ "$rm_idx" -le "$rm_limit" ] || continue
    # The read needs a screencap and the classifier, which live in the shell.
    # A window containing one is a programming error, not a runtime condition.
    [ "$c2" != read ] || {
      echo 'a read cannot go in a macro: it needs the classifier' >&2
      exit 47
    }
    if [ "$rm_started" -eq 0 ]; then
      # The window may not open inside a contact the shell is still holding.
      # Shifting the whole macro keeps every released gap the plan guarantees;
      # shifting only its first instruction would eat the next one.
      rm_start=$((rm_base + c1))
      [ "$rm_start" -ge "$rm_floor" ] || rm_start=$rm_floor
      rm_shift=$((rm_start - rm_base - c1))
      wait_until "$rm_start"
      now_rel
      actual=$NOW_REL
      printf '%6d ms  macro %s[%d..%d]\n' "$actual" "$rm_cycle" "$rm_skip" "$rm_limit"
      rm_started=1
    else
      # A non-positive gap here means the plan overlaps itself, and hid_delay's
      # guard would swallow it silently -- the same silence that cost night 6-22.
      # A zero *lead* is legitimate; a zero *gap between two instructions* is a
      # defect, and only the caller can tell those apart.
      [ $((c1 - rm_cursor)) -gt 0 ] || {
        echo "the plan overlaps itself: instruction at +$c1 ms starts $((rm_cursor - c1)) ms" \
             "before the previous one ends" >&2
        exit 47
      }
      hid_delay $((c1 - rm_cursor))
    fi
    plan_emit "$c2" "$c3" "$c4" "$c5"
    plan_span "$c2" "$c3" "$c4" "$c5"
    rm_cursor=$((c1 + PLAN_SPAN))
  done 9< "$PLAN_FILE"
  # Wait the macro out, and then leave the next anchor its released time.
  #
  # Both steady cycles end on a sweep that finishes *past* the cycle boundary:
  # 4667 + 2*120 + 100 = 5007 against a 5000 ms cycle, and 10007 against 10000.
  # So the anchor's monitor press was being written on top of the sweep's final
  # camera release. Fusion polls touch per frame, so that reads as one finger
  # moving from the camera button to the monitor and the press never fires --
  # and a lost monitor press desyncs the toggle permanently, because nothing
  # here observes the monitor's state. Every later anchor then flips the wrong
  # way: the vent read photographs the camera feed and scores `unknown`, the
  # hall press lands on the camera map and pans it, the box stops being wound.
  # That is the whole of nights 6-22 to 6-24, and the reason cycle 1 always survived
  # it is that the opening ends 200 ms clear of its anchor while these end -7.
  [ "$rm_started" -eq 0 ] || \
    wait_until $((rm_base + rm_cursor + rm_shift + FUSION_POLL_MS))
}

# Run instructions (skip, limit] of one cycle, anchored at `base`. The window
# exists because the phone does not know which cycle it is in until the
# classifier answers: both steady cycles share a prefix, and the branch picks
# up after it. recipe.mjs's replay() splits at the same instruction.
run_cycle() {
  rc_cycle=$1; rc_base=$2; rc_skip=$3; rc_limit=$4
  rc_idx=0; rc_in=0
  while read -r c1 c2 c3 c4 c5 <&9; do
    if [ "$c1" = '#cycle' ]; then
      if [ "$c2" = "$rc_cycle" ]; then rc_in=1; else rc_in=0; fi
      continue
    fi
    [ "$rc_in" -eq 1 ] || continue
    [ -n "$c1" ] || continue
    rc_idx=$((rc_idx + 1))
    [ "$rc_idx" -gt "$rc_skip" ] || continue
    [ "$rc_idx" -le "$rc_limit" ] || continue
    plan_step "$rc_base" "$c1" "$c2" "$c3" "$c4" "$c5"
  done 9< "$PLAN_FILE"
}


if [ "$NIGHT6_LEFT" -eq 1 ]; then
  [ -s "$PLAN_FILE" ] || {
    echo 'night6-left needs the device plan, and none was pushed' >&2
    exit 47
  }
  press_at 0 "$MUTE_X" "$MUTE_Y" mute

  # The plan's idle window: hours this night has nothing to answer.
  #
  # Derived in recipe.mjs from the sourced AI table and the per-night music-box
  # drain, and priced by the model gate, which runs the sim through the window
  # rather than skipping it. Night 1 reports 140000: its Toys do not arm until
  # 2 AM (g674) and g653 holds its box full until 2 AM, while the Puppet cannot
  # roll on a full box (g494/g495). Every other night reports 0.
  #
  # Read here rather than assumed: a runner that idles on its own judgement is
  # exactly the unpriceable inline schedule the model gate exists to refuse.
  IDLE_UNTIL=$(sed -n 's/^#idle-until \([0-9][0-9]*\).*/\1/p' "$PLAN_FILE" | head -1)
  [ -n "$IDLE_UNTIL" ] || IDLE_UNTIL=0
  if [ "$IDLE_UNTIL" -gt 0 ]; then
    printf '%6d ms  idling to %d ms: nothing is armed and the box is not draining\n' \
      0 "$IDLE_UNTIL"
    wait_until "$IDLE_UNTIL"
  fi
  # The epoch detector needs one more confirming capture after T0, so the
  # opening's first instruction can already be due. Let it slip rather than
  # firing the cam-11 select inside MONITOR_ANIM_UP; the opening's wind absorbs
  # the slip, so the sweep after it still lands on the absolute deadline the
  # route is anchored to.
  opening_at=$(plan_first_offset opening)
  now_rel
  now=$NOW_REL
  # Relative to where the opening actually starts, which is IDLE_UNTIL, not 0.
  # Without this the idle's own 140 s reads as epoch slip and the guard below
  # refuses the night with status 46 -- which it did, correctly, on the first
  # elegant Night 1 attempt. The guard was right; it had been handed a slip
  # measured from the wrong origin.
  SLIP=$((now + 20 - IDLE_UNTIL - opening_at))
  [ "$SLIP" -ge 0 ] || SLIP=0
  [ "$SLIP" -le 1017 ] || {
    echo 'epoch latch left no room for the opening' >&2
    exit 46
  }
  run_cycle opening "$IDLE_UNTIL" 0 999

  base=$((IDLE_UNTIL + 7000))
  cycle=0
  unknowns=0
  nolights=0
  nolight_streak=0
  attacks=0
  desyncs=0
  blind_streak=0
  while [ "$base" -lt 419000 ] && [ "$cycle" -lt "$CYCLES" ]; do
    SLIP=0
    # The shared prefix: lower the monitor, light the vent, read it. Both
    # steady cycles begin with these two instructions and test-recipe.mjs
    # asserts they stay identical, because the branch is not known until the
    # classifier has answered.
    run_cycle clear "$base" 0 2

    # The monitor desynced: this frame is the camera feed, not the office.
    #
    # The anchor's monitor press did not take effect, so the vent light press
    # was the *camera* light and the classifier was handed CAM 11 or the map.
    # Confirmed in-run on night 6-28: cams=down, cams=down, then cams=UP-DESYNCED
    # at cycle 3 and never again down. Nothing observed it, so a single lost
    # press ended every night from 22 to 27.
    #
    # A camera frame carries no information about Balloon Boy, so failing closed
    # on it is not safety, it is noise -- and the 10 s attack cycle it buys does
    # not wind, which is what turned one lost press into a starved box. It does
    # tell us two things exactly: the cams are up, and the mask is off, because
    # the game has no state with both raised (engine.js press(): a mask press
    # with the monitor up is an input the player cannot make).
    #
    # So put the cams back down and run the cycle's remainder from a floor that
    # clears MONITOR_ANIM_DOWN. The mask-off press is skipped: there is no mask
    # on to take off, and pressing it would put one ON and blind every later
    # read.
    if [ "$monitor_seen" = 'cams=UP-DESYNCED' ]; then
      desyncs=$((desyncs + 1))
      now_rel
      actual=$NOW_REL
      printf '%6d ms  monitor desynced; lowering and resuming the cycle (%d)\n' \
        "$actual" "$desyncs"
      hid_mark "$actual"
      [ "$desyncs" -le 12 ] || {
        echo 'the monitor desynced repeatedly; the schedule is not reaching the game' >&2
        exit 48
      }
      press_at $((actual + FUSION_POLL_MS)) "$MONITOR_X" "$MONITOR_Y" monitor-resync
      # Verify the press worked before resuming the schedule on top of it.
      #
      # The cause of the inversion is the engine, not the input: `drop
      # everything` is set every 10 s while an attacker waits at marker 122
      # with the cams up (g718-721), on any attack start (g624) and on the
      # Puppet's arrival (g574), and g262 then lowers the monitor without a
      # press. Night 6-43 shows the cadence directly -- recoveries at 15.8 s,
      # 25.9 s, 36.7 s and 43.1 s -- and its "dropped" monitor press at
      # 26.02 s had 352 ms of clean released time: nothing was dropped, the
      # raise was spent by the forcedown one frame later.
      #
      # A recovery that assumes its own press landed is therefore the same
      # open-loop mistake at one remove, and it is why 6-43 stayed inverted
      # through four recoveries. Read the cams back (59 ms) and press again
      # once if they are still up; past that, let the next cycle's checkpoint
      # catch it rather than fighting the engine over the toggle.
      #
      # Verified with the classifier, not the cue helper. This branch fired
      # BECAUSE `$CHECKER match` read the selection highlight on the frame; the
      # only honest way to ask whether the press cleared it is to ask the same
      # question again. It costs a screencap (~225 ms) on top of the flip wait,
      # which is why the check exists here and not in the per-cycle loop.
      if [ "$CHECKER" != "-" ]; then
        wait_until $((LAST_PRESS_MS + TAP_CONTACT_MS + MONITOR_ANIM_DOWN_MS))
        rs_verdict=$(cams_still_up)
        rs_why=${rs_verdict#* }
        if [ "${rs_verdict%% *}" = 1 ]; then
          now_rel
          actual=$NOW_REL
          printf '%6d ms  cams still up after the resync (%s); pressing once more\n' \
            "$actual" "$rs_why"
          hid_mark "$actual"
          press_at $((actual + FUSION_POLL_MS)) "$MONITOR_X" "$MONITOR_Y" monitor-resync-2
        fi
      fi
      # The retained frame proves the mask is off: a mask press cannot land
      # while the cams are up. Instruction 3 is the maskraise compound, so run
      # its raise at the same internal offset without toggling the mask on.
      # The flag is scoped around this one macro and the interpreter regression
      # asserts both the omitted toggle and the preserved delay.
      MASK_ALREADY_OFF=1
      run_macro clear "$base" 2 999 \
        $((LAST_PRESS_MS + TAP_CONTACT_MS + MONITOR_ANIM_DOWN_MS + FUSION_POLL_MS))
      MASK_ALREADY_OFF=0
      base=$((base + 5000))
      cycle=$((cycle + 1))
      continue
    fi

    case "$classification" in
      empty\ *) branch=clear; blind_streak=0; nolight_streak=0 ;;
      bb\ *)    branch=attack; blind_streak=0; nolight_streak=0 ;;
      nolight\ *)
        # The lamp is dark, so this frame is not an observation of the opening.
        #
        # It was called `inside` and it ended the run (exit 49). It is not
        # Balloon Boy: measured across every labelled frame, the LIGHT lamp
        # inside the model's own ROI reads green-excess 104.0 on all 49
        # `empty`/`bb` frames and 0.2 on both frames the `inside` class was
        # trained from. The class was the vent light being off. Night 6-41 died
        # on it at 13.7 s -- before BB_EARLIEST_INSIDE_MS, so it could not have
        # been him -- and the run video shows the lamp lit exactly once in 20 s.
        #
        # Three things make the lamp dark and one frame cannot separate them:
        # the light press was dropped; `in danger` is latched, so no light
        # answers at all (g75/g76/g77); or he really is at 123 and g301/g303
        # have stopped the vent lights answering. So fail closed like any other
        # unreadable frame -- the mask is the right answer to an opening that
        # might have him in it, and it is also the thing that resolves an
        # `in danger` encounter -- and let the *streak* decide: a dropped press
        # recovers next cycle, an encounter clears under the mask within two to
        # three cycles (night 6-43, Mangle), and only marker 123 never relights.
        branch=attack
        nolights=$((nolights + 1))
        nolight_streak=$((nolight_streak + 1))
        blind_streak=0
        now_rel
        actual=$NOW_REL
        printf '%6d ms  left-view %s: the vent lamp is dark; masking and retrying (%d in a row, %d total)\n' \
          "$actual" "$classification" "$nolight_streak" "$nolights"
        hid_mark "$actual"
        if [ "$nolight_streak" -ge "$NOLIGHT_STREAK_MAX" ]; then
          if [ "$actual" -ge "$BB_EARLIEST_INSIDE_MS" ]; then
            echo "the vent light has not answered for $nolight_streak consecutive reads past ${BB_EARLIEST_INSIDE_MS} ms; Balloon Boy is at 123 and no group moves him back out" >&2
            exit 49
          fi
          echo "the vent light has not answered for $nolight_streak consecutive reads, and it is too early for Balloon Boy to be inside; the light press is not reaching the game" >&2
          exit 44
        fi
        ;;
      *)
        # A single unreadable frame fails closed, because an unseen BB costs
        # the night. Failing closed on *every* cycle is the simulator's
        # all-threat negative control and it dies, so a run that cannot see is
        # not running this policy and should stop rather than pretend.
        branch=attack
        unknowns=$((unknowns + 1))
        blind_streak=$((blind_streak + 1))
        now_rel
        actual=$NOW_REL
        printf '%6d ms  left-view %s; failing closed (%d in a row, %d total)\n' \
          "$actual" "$classification" "$blind_streak" "$unknowns"
        hid_mark "$actual"
        # Consecutive, not cumulative.
        #
        # The cap is meant to stop a run that cannot see -- "a run that cannot
        # see is not running this policy and should stop rather than pretend".
        # A total counter does not measure that. Night 6-36 reached 163 s, past
        # 2 AM and past every previous run, and was then killed by its seventh
        # unknown of the night rather than by the game: the reads were spread
        # across 163 s, each one got the correct response (the five-tick mask is
        # what repels a vent visitor as well as Balloon Boy), and the schedule
        # recovered every time.
        #
        # What actually means blind is several in a row. The retained frames say
        # why a single one happens: an animatronic filling the office view is
        # none of empty/bb/inside, so the model has no class for it and returns
        # `unknown` -- a correct refusal to guess, not a broken sensor.
        [ "$blind_streak" -le 4 ] || {
          echo 'four consecutive unclassified left reads; the BB branch is blind' >&2
          exit 45
        }
        ;;
    esac

    if [ "$branch" = clear ]; then
      # The read put the prophylactic mask on. Instruction 3 is the compound
      # mask-off + monitor raise, with the phone-measured 180 ms seam held
      # inside one HID macro.
      #
      # Floored at now, like the recovery, because the resume offset is usually
      # already stale: the capture pipeline finishes 30-900 ms past the plan's
      # cut-off (worse when the flip gate corrected first). Launched without a
      # floor the macro runs uniformly late with rm_shift=0, so the seam wait
      # undershoots the still-running sweep and the next cycle's anchor is
      # queue-serialized straight onto the sweep's tail -- a real zero-gap the
      # marks cannot see, and night 6-45 lost a monitor press to it every
      # corrected cycle. The floor turns that lateness into rm_shift, which
      # keeps every plan gap *and* holds the next anchor back the same amount.
      now_rel
      actual=$NOW_REL
      run_macro clear "$base" 2 999 $((actual + FUSION_POLL_MS))
      base=$((base + 5000))
    else
      attacks=$((attacks + 1))
      now_rel
      actual=$NOW_REL
      # The read already put the mask on before classification completed, so a
      # true positive keeps that same continuous hold through five ticks. g293
      # zeroes the counter on every new fully-on entry; pressing again here
      # would turn the mask off and destroy the response.
      printf '%6d ms  left-view BB; keeping prophylactic mask through five ticks\n' "$actual"
      hid_mark "$actual"
      # Floored past classification for the same reason the clear branch is: a
      # stale resume offset must become rm_shift, not compression.
      run_macro attack "$base" 2 999 $((actual + FUSION_POLL_MS))
      base=$((base + 10000))
    fi
    cycle=$((cycle + 1))
  done
  hid_release
  printf 'night6-left finished: %d cycles, %d BB responses, %d unclassified\n' \
    "$cycle" "$attacks" "$unknowns"
  exit 0
fi
