# The offset of a cycle's first instruction, so the opening can be slipped
# relative to whatever the plan actually starts with.
plan_first_offset() {
  pf_cycle=$1; pf_in=0
  while read -r c1 c2 _rest <&9; do
    if [ "$c1" = '#cycle' ]; then
      if [ "$c2" = "$pf_cycle" ]; then pf_in=1; else pf_in=0; fi
      continue
    fi
    [ "$pf_in" -eq 1 ] || continue
    printf '%s\n' "$c1"
    return 0
  done 9< "$PLAN_FILE"
  echo "the plan has no cycle named $pf_cycle" >&2
  exit 47
}

# One instruction. SLIP is the epoch latch's cost; it is absorbed by the first
# wind hold, whose start moves but whose end does not -- the sweep after it is
# anchored to that end, not to the wind's start.
plan_step() {
  ps_base=$1; ps_at=$2; ps_kind=$3; ps_a=$4; ps_b=$5; ps_c=$6
  ps_when=$((ps_base + ps_at + SLIP))
  case "$ps_kind" in
    tap)
      plan_control_xy "$ps_a"
      press_at "$ps_when" "$PX" "$PY" "$ps_a"
      ;;
    hold)
      plan_control_xy "$ps_a"
      hold_at "$ps_when" "$PX" "$PY" $((ps_b - SLIP)) "$ps_a"
      SLIP=0
      ;;
    hall)
      hold_at "$ps_when" "$HALL_X" "$HALL_Y" "$ps_a" flash-hall
      ;;
    hallraise)
      hall_reset_and_raise_at "$ps_when" "$ps_a" hall-raise
      ;;
    maskraise)
      mask_and_raise_at "$ps_when" "$ps_a" "$ps_b" "$ps_c" mask-raise
      ;;
    sweep)
      pulsed_sweep_at "$ps_when" "$ps_a" "$ps_b" "$ps_c" sweep
      ;;
    read)
      # The light's end is a device readiness boundary -- screencap's first
      # output byte -- not a schedule value, so the plan's nominal duration is
      # a budget the capture has to fit inside rather than a time to obey.
      [ "$ps_a" -ge $((READ_CAPTURE_DELAY_MS + 348)) ] || {
        echo "the plan budgets ${ps_a} ms of vent light; the capture needs " \
             "$((READ_CAPTURE_DELAY_MS + 348))" >&2
        exit 47
      }
      light_down_at "$ps_when" left-vent-light
      # From when the light actually went down, not from where the plan put it.
      # READ_CAPTURE_DELAY_MS is a position in the vent-light ramp -- the only
      # control over where the classifier's frame lands, and moving it is what
      # produced the `inside` and `unknown` misreads -- so it has to follow the
      # light. Both the flip gate above and the in-cycle correction can move it,
      # and the correction moves it far enough that this used to capture before
      # the light was even down.
      classify_left_and_queue_mask_at \
        $((LIGHT_DOWN_MS + READ_CAPTURE_DELAY_MS)) "$ps_b" left-view
      ;;
    *)
      echo "the plan names an instruction this runner cannot execute: $ps_kind" >&2
      exit 47
      ;;
  esac
}

# The hid time one instruction consumes, so the next one's delay can be
# computed from the plan's offsets rather than re-derived.
plan_span() {
  pn_kind=$1; pn_a=$2; pn_b=$3; pn_c=${4:-0}
  case "$pn_kind" in
    tap|hold)  PLAN_SPAN=$pn_b ;;
    hall)      PLAN_SPAN=$pn_a ;;
    hallraise) PLAN_SPAN=$((SWEEP_LIGHT_LEAD_MS + pn_a)) ;;
    maskraise)
      if [ "$pn_b" = hall ]; then
        PLAN_SPAN=$((pn_a + SWEEP_LIGHT_LEAD_MS + pn_c))
      else
        PLAN_SPAN=$((pn_a + TAP_CONTACT_MS))
      fi
      ;;
    sweep)     PLAN_SPAN=$((2 * pn_a + $(sweep_cam_ms "$pn_b"))) ;;
    *) echo "the plan names an instruction with no known span: $pn_kind" >&2
       exit 47 ;;
  esac
}

# One instruction as hid reports only. No wait_until anywhere: inside a macro
# the hid process owns every boundary, which is the entire point of one.
plan_emit() {
  pe_kind=$1; pe_a=$2; pe_b=$3; pe_c=$4
  case "$pe_kind" in
    tap|hold)
      plan_control_xy "$pe_a"
      hid_down "$PX" "$PY"
      hid_delay "$pe_b"
      hid_release
      ;;
    hall)
      hid_down "$HALL_X" "$HALL_Y"
      hid_delay "$pe_a"
      hid_release
      ;;
    hallraise)
      hid_down "$HALL_X" "$HALL_Y"
      # Guarded exactly as pulsed_cam_burst guards the same value. The lead is
      # legitimately zero; a zero *gap* would be a defect, and hid_delay cannot
      # tell them apart, so the call site that knows does the guarding.
      [ "$SWEEP_LIGHT_LEAD_MS" -le 0 ] || hid_delay "$SWEEP_LIGHT_LEAD_MS"
      hid_two_down "$HALL_X" "$HALL_Y" "$MONITOR_X" "$MONITOR_Y"
      hid_delay "$pe_a"
      hid_second_up "$HALL_X" "$HALL_Y" "$MONITOR_X" "$MONITOR_Y"
      hid_release
      ;;
    maskraise)
      # Recovery may know from the retained frame that the mask is already off
      # (a mask press cannot land with the cams up). Preserve the compound's
      # timing in that case, but omit the toggle that would put it on.
      [ "$pe_a" -gt "$TAP_CONTACT_MS" ] || {
        echo "maskraise gap $pe_a ms leaves no released time after its mask contact" >&2
        exit 47
      }
      if [ "${MASK_ALREADY_OFF:-0}" -eq 0 ]; then
        hid_down "$MASK_X" "$MASK_Y"
        hid_delay "$TAP_CONTACT_MS"
        hid_release
        hid_delay $((pe_a - TAP_CONTACT_MS))
      else
        hid_delay "$pe_a"
      fi
      if [ "$pe_b" = hall ]; then
        hid_down "$HALL_X" "$HALL_Y"
        [ "$SWEEP_LIGHT_LEAD_MS" -le 0 ] || hid_delay "$SWEEP_LIGHT_LEAD_MS"
        hid_two_down "$HALL_X" "$HALL_Y" "$MONITOR_X" "$MONITOR_Y"
        hid_delay "$pe_c"
        hid_second_up "$HALL_X" "$HALL_Y" "$MONITOR_X" "$MONITOR_Y"
        hid_release
      else
        [ "$pe_b" = up ] || { echo "unknown maskraise mode: $pe_b" >&2; exit 47; }
        hid_down "$MONITOR_X" "$MONITOR_Y"
        hid_delay "$TAP_CONTACT_MS"
        hid_release
      fi
      ;;
    sweep)
      pe_rest=$pe_c
      pe_first=1
      pe_cam_time=$(sweep_cam_ms "$pe_b")
      while [ -n "$pe_rest" ]; do
        pe_cam=${pe_rest%%,*}
        case "$pe_rest" in
          *,*) pe_rest=${pe_rest#*,} ;;
          *)   pe_rest= ;;
        esac
        [ "$pe_first" -eq 1 ] || hid_delay $((pe_a - pe_cam_time))
        pe_first=0
        plan_control_xy "cam$pe_cam"
        pulsed_cam_burst "$PX" "$PY" "$pe_b"
      done
      ;;
    *)
      echo "the plan names an instruction that cannot go in a macro: $pe_kind" >&2
      exit 47
      ;;
  esac
}

