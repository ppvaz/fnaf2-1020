# One camera of the sweep, written into the macro the hid process is already
# executing. No wait_until: see pulsed_sweep_at.
# The select leads the light so the camera is already the selected feed when
# the light lands on it. hid-sweep-probe.sh proved this geometry 4/4.
# Resolve a plan control name to this device's calibrated coordinates.
plan_control_xy() {
  case "$1" in
    monitor) PX=$MONITOR_X;   PY=$MONITOR_Y ;;
    mask)    PX=$MASK_X;      PY=$MASK_Y ;;
    wind)    PX=$WIND_X;      PY=$WIND_Y ;;
    hall)    PX=$HALL_X;      PY=$HALL_Y ;;
    ventl)   PX=$CAM_LIGHT_X; PY=$CAM_LIGHT_Y ;;
    cam10)   PX=$CAM10_X;     PY=$CAM10_Y ;;
    cam4)    PX=$CAM04_X;     PY=$CAM04_Y ;;
    cam7)    PX=$CAM07_X;     PY=$CAM07_Y ;;
    cam11)   PX=$CAM11_X;     PY=$CAM11_Y ;;
    cam5)    PX=$CAM05_X;     PY=$CAM05_Y ;;
    *) echo "unknown plan control: $1" >&2; exit 47 ;;
  esac
}

# Per-camera time inside a sweep. The geometry (LIGHT_AFTER vs legacy) is set by
# the sweep's BASE contact, passed as $2; a lengthened last slot ($1 above the
# 50 ms threshold) still costs the LIGHT_AFTER select + settle when the base is
# short. One argument reproduces the old behaviour.
sweep_cam_ms() {
  scm_base=${2:-$1}
  if [ "$scm_base" -lt 50 ]; then echo $((SWEEP_SELECT_MS + SWEEP_SETTLE_MS + $1)); else echo "$1"; fi
}

# The last camera of a cams token may carry a `:N` light-hold override:
# `10,4,7:67`. These strip it off / read it out; no colon -> the base contact.
sweep_cam_list() {
  printf '%s\n' "${1%:*}"
}
sweep_last_contact() {
  case "$1" in
    *:*) printf '%s\n' "${1##*:}" ;;
    *)   printf '%s\n' "$2" ;;
  esac
}

pulsed_cam_burst() {
  x=$1; y=$2; contact=$3; base=${4:-$3}
  if [ "$base" -lt 50 ]; then
    # LIGHT_AFTER: the select and the light are separate single-finger Clicks
    # (see 09-constants.sh). `contact` is the LIGHT hold, not the select's.
    hid_down "$x" "$y"
    hid_delay "$SWEEP_SELECT_MS"
    hid_up "$x" "$y"
    hid_delay "$SWEEP_SETTLE_MS"
    hid_down "$CAM_LIGHT_X" "$CAM_LIGHT_Y"
    hid_delay "$contact"
    hid_up "$CAM_LIGHT_X" "$CAM_LIGHT_Y"
    return
  fi
  # Legacy pulsed geometry: `stunCam` refreshes every frame the light is on
  # while that camera is selected, so contact 0 need not be held across the
  # sweep -- select and light in one report, held `contact` ms. The select
  # leads the light by SWEEP_LIGHT_LEAD_MS (0 in the shipped geometry).
  if [ "$SWEEP_LIGHT_LEAD_MS" -gt 0 ]; then
    hid_cam_down "$x" "$y"
    hid_delay "$SWEEP_LIGHT_LEAD_MS"
  fi
  hid_cam_light_down "$x" "$y"
  hid_delay $((contact - SWEEP_LIGHT_LEAD_MS))
  hid_cam_light_up "$x" "$y"
}

# `spacing` and `contact` are the plan's; `cams` is its comma-separated list,
# whose last entry may carry a `:N` light-hold override for the drift-exposed
# last slot.
pulsed_sweep_at() {
  sweep_start=$1; spacing=$2; contact=$3; cams=$4; sweep_label=$5
  sweep_last_ms=$(sweep_last_contact "$cams" "$contact")
  cams=$(sweep_cam_list "$cams")
  # A sweep is successive presses at $spacing, so the floor applies inside it
  # as well as at its edges. Checked before waiting: an inhuman sweep is known
  # from its arguments, and refusing early beats refusing mid-macro.
  #
  # Same arm as human_floor_check, and it has to be stated again because this
  # call site reaches human_floor_abort DIRECTLY rather than through it. That
  # omission is not hypothetical: it killed the first real Night 1 attempt
  # (2026-08-26, `n1-validate-1607`) at `sweep slots lands 120 ms after the
  # previous press`. The emitted slot is an actuator detail already priced by
  # the model gate, so the scalar floor must not second-guess it. It is now
  # 133 ms: a 100 ms contact followed by one 33 ms released Fusion poll.
  if [ "$NIGHT6_LEFT" -ne 1 ]; then
    [ "$spacing" -ge "$HUMAN_FLOOR_MS" ] || human_floor_abort "$spacing" "$sweep_label slots"
  fi
  wait_until "$sweep_start"
  now_rel
  actual=$NOW_REL
  human_floor_check "$actual" "$sweep_label"
  hf_slots=$(printf '%s' "$cams" | tr -cd , | wc -c | tr -d ' ')
  HF_LAST_PRESS_MS=$((actual + hf_slots * spacing))
  printf '%6d ms  %s (%s, %d ms apart, light pulsed after each)\n' \
    "$actual" "$sweep_label" "$cams" "$spacing"
  hid_mark "$actual"
  # The whole sweep is one uninterrupted macro, exactly as hid-sweep-probe.sh
  # replays it. The 120 ms probe established the stream's precision; the
  # shipped 133 ms geometry adds one complete released Fusion poll.
  # The shell only positions the start. Two other arrangements were measured
  # and both compressed the spacing below the plan, after which
  # the game renders CAM 07 alone: wall-timing every report inside the sweep
  # jittered it to 90-160 ms because wait_until placed every select on the
  # shell's clock, and mixing a wall-timed start with hid-side contact delays
  # gave 105-112 ms because the hid delays elapse concurrently with the shell's
  # wait instead of adding to it. Each camera costs `spacing` ms of hid time: a `contact` ms
  # select with the light pulsed inside it, then the remainder released before
  # the next select.
  sweep_cam_time=$(sweep_cam_ms "$contact")
  sweep_rest=$cams
  sweep_first=1
  while [ -n "$sweep_rest" ]; do
    sweep_cam=${sweep_rest%%,*}
    case "$sweep_rest" in
      *,*) sweep_rest=${sweep_rest#*,}; sweep_this_ms=$contact ;;
      *)   sweep_rest=;              sweep_this_ms=$sweep_last_ms ;;
    esac
    [ "$sweep_first" -eq 1 ] || hid_delay $((spacing - sweep_cam_time))
    sweep_first=0
    plan_control_xy "cam$sweep_cam"
    pulsed_cam_burst "$PX" "$PY" "$sweep_this_ms" "$contact"
  done
  # Resynchronise the shell with the hid stream. The macro is scheduled to end
  # on the next cycle's anchor, and the simulator will not let it end earlier:
  # one frame of tail costs 272 of 400 nights, because this stun has to bridge
  # the five-tick mask with nothing to spare. So the anchor's monitor press is
  # written while the macro is still draining, is delivered late, and -- since
  # its contact is measured from when the shell wrote it -- gets released
  # early. A 73 ms contact is dropped, the cams stay up, and the frame the
  # classifier is then handed is the CAM 11 feed. Waiting out the macro costs
  # the press a few milliseconds and buys it a real contact. The last slot's
  # burst may be longer than the rest, so the macro end uses its time.
  wait_until $((sweep_start + 2 * spacing + $(sweep_cam_ms "$sweep_last_ms" "$contact")))
}

hall_reset_and_raise_at() {
  offset=$1; duration=$2; label=$3
  wait_until "$offset"
  now_rel
  actual=$NOW_REL
  human_floor_check "$actual" "$label"
  printf '%6d ms  %s (hall pulse under the raise)\n' "$actual" "$label"
  hid_mark "$actual"
  # The table presses the hall light and the monitor on the same frame. Doing
  # them sequentially would push the raise 90 ms late and the following sweep
  # inside MONITOR_ANIM_UP, so hold the light on contact 0 and tap the monitor
  # on contact 1 -- the verified two-contact primitive.
  # Wall-timed for the same reason as pulsed_cam_at.
  hid_down "$HALL_X" "$HALL_Y"
  wait_until $((offset + 10))
  # This is a monitor press too, and it starts a flip like any other, so a read
  # after it must wait the animation out. See light_down_at.
  LAST_MONITOR_PRESS_MS=$((offset + 10))
  hid_two_down "$HALL_X" "$HALL_Y" "$MONITOR_X" "$MONITOR_Y"
  # The monitor gets the plan's full contact; the hall light keeps it plus the
  # lead. wait_until can still return up to one 10 ms tick late, and a
  # measured run held this 83 ms.
  wait_until $((offset + SWEEP_LIGHT_LEAD_MS + duration))
  hid_second_up "$HALL_X" "$HALL_Y" "$MONITOR_X" "$MONITOR_Y"
  hid_release
}

# Mask off, then raise after the measured-safe press-to-press gap. Keeping both
# boundaries inside one hid report stream prevents shell launch spread from
# compressing the seam back into the 9/15 loss band. MODE is `up` or `hall`;
# the latter performs the usual two-contact hall pulse under the raise.
mask_and_raise_at() {
  offset=$1; gap=$2; mode=$3; duration=$4; label=$5
  [ "$gap" -ge "$TAP_CONTACT_MS" ] || {
    echo "maskraise gap $gap ms is shorter than its $TAP_CONTACT_MS ms mask contact" >&2
    exit 47
  }
  wait_until "$offset"
  now_rel
  actual=$NOW_REL
  human_floor_check "$actual" "$label"
  printf '%6d ms  %s (mask off, %d ms to raise)\n' "$actual" "$label" "$gap"
  hid_mark "$actual"
  hid_down "$MASK_X" "$MASK_Y"
  hid_delay "$TAP_CONTACT_MS"
  hid_release
  hid_delay $((gap - TAP_CONTACT_MS))
  LAST_MONITOR_PRESS_MS=$((offset + gap))
  if [ "$mode" = hall ]; then
    hid_down "$HALL_X" "$HALL_Y"
    [ "$SWEEP_LIGHT_LEAD_MS" -le 0 ] || hid_delay "$SWEEP_LIGHT_LEAD_MS"
    hid_two_down "$HALL_X" "$HALL_Y" "$MONITOR_X" "$MONITOR_Y"
    hid_delay "$duration"
    hid_second_up "$HALL_X" "$HALL_Y" "$MONITOR_X" "$MONITOR_Y"
    hid_release
  else
    [ "$mode" = up ] || { echo "unknown maskraise mode: $mode" >&2; exit 47; }
    hid_down "$MONITOR_X" "$MONITOR_Y"
    hid_delay "$TAP_CONTACT_MS"
    hid_release
  fi
}

# --- the plan interpreter -----------------------------------------------------
#
# recipe.mjs emits the cycle table from the exact simulator and the host pushes
# it here. Everything above this line is a device primitive; everything the
# schedule says arrives in the file. There is one copy of the table, and it is
# not this one.
