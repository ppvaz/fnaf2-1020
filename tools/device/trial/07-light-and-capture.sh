# shellcheck shell=bash
# ld_ prefixes because this calls press_at, and the runner's functions share one
# global scope: plain `offset` and `label` came back clobbered, so the vent
# light's own log line was printed as "monitor-verify (contact 0 down)".
light_down_at() {
  ld_offset=$1; ld_label=$2
  # Verify the anchor's monitor press actually landed, before spending the vent
  # light on a frame that would be the camera feed.
  #
  # A lost monitor press desyncs the toggle for the rest of the night, and the
  # only thing that ever noticed was the classifier one full cycle later -- so
  # every desync cost a cycle even once recovery existed. The helper answers the
  # same question in 42 ms, which is affordable here, and a correction now costs
  # the flip instead of the cycle.
  if [ "$CUE_PORT" != "-" ]; then
    # Never sample the monitor inside its own flip.
    #
    # The plan reads at exactly MONITOR_ANIM_DOWN from the cycle base while the
    # anchor's press lands 110-180 ms into the cycle, so without this the
    # sample always falls inside the animation it is checking. Night 6-38 sampled
    # 214 ms in, believed the camera feed still on screen, and "corrected" a
    # monitor that was already coming down -- and that press was dropped by the
    # same flip, so the run spent its remaining 58 s inverted. The corrector
    # caused the desync it was looking for.
    #
    # The gate is measured, not assumed. Across nights 6-36 to 6-38 the cue helper
    # still reported luma >= CUE_CAMS_UP_LUMA up to 202 ms after a lowering
    # press and never later, so one MONITOR_ANIM_DOWN leaves about 165 ms of
    # margin. It costs the read the press's own lateness, which the plan's
    # 416 ms of slack before the next instruction absorbs.
    wait_until $((LAST_MONITOR_PRESS_MS + MONITOR_ANIM_DOWN_MS))
    cue_luma=$(cue_snapshot | sed -n 's/.* luma=\([0-9]*\).*/\1/p')
    # Confirm before correcting: one sample cannot tell a flash from the cams.
    #
    # The gate above fixed *when* this samples. It did not fix that a single
    # reading decides. Steady cams-up is a tight band -- 225-250, median 227
    # across nights 6-40, 6-41 and 6-42 -- while saturated `luma 255` is a
    # separate and short-lived population: runs of one or two samples, and a
    # third of them are already below the threshold by the very next sample.
    # Both clear CUE_CAMS_UP_LUMA, so the correction cannot distinguish them.
    #
    # Every correction on file triggered on 255, and 255 never appears beside a
    # classifier read. That is the shape of a flash -- a camera light pulse or a
    # hall flash washing the sensor pixel -- not a monitor that is up. Night
    # 6-38's correction invented the desync it was looking for this way, and
    # night 6-42 corrected at 17.876 s on a 255 and was inverted by 30.38 s.
    #
    # A second read costs 59 ms against the ~416 ms of slack the plan leaves
    # before the next instruction, and a transient does not survive it.
    if [ -n "$cue_luma" ] && [ "$cue_luma" -ge "$CUE_CAMS_UP_LUMA" ]; then
      cue_luma_confirm=$(cue_snapshot | sed -n 's/.* luma=\([0-9]*\).*/\1/p')
      if [ -z "$cue_luma_confirm" ] || [ "$cue_luma_confirm" -lt "$CUE_CAMS_UP_LUMA" ]; then
        now_rel
        actual=$NOW_REL
        printf '%6d ms  cue read %s then %s; a transient, not the cams -- not correcting\n' \
          "$actual" "$cue_luma" "${cue_luma_confirm:-unreadable}"
        cue_luma=0
      fi
    fi
    if [ -n "$cue_luma" ] && [ "$cue_luma" -ge "$CUE_CAMS_UP_LUMA" ]; then
      now_rel
      actual=$NOW_REL
      printf '%6d ms  cams still up at the read (luma %s); correcting in-cycle\n' \
        "$actual" "$cue_luma"
      hid_mark "$actual"
      press_at $((actual + FUSION_POLL_MS)) "$MONITOR_X" "$MONITOR_Y" monitor-verify
      ld_offset=$((LAST_PRESS_MS + TAP_CONTACT_MS + MONITOR_ANIM_DOWN_MS))
    fi
  fi
  wait_until "$ld_offset"
  now_rel
  actual=$NOW_REL
  # The capture is placed from here, not from the plan's offset: see plan_step.
  LIGHT_DOWN_MS=$actual
  printf '%6d ms  %s (contact 0 down)\n' "$actual" "$ld_label"
  hid_mark "$actual"
  hid_down "$CAM_LIGHT_X" "$CAM_LIGHT_Y"
}

light_cam_at() {
  offset=$1; x=$2; y=$3; label=$4
  wait_until "$offset"
  now_rel
  actual=$NOW_REL
  printf '%6d ms  %s (contact 1 tap)\n' "$actual" "$label"
  hid_mark "$actual"
  hid_two_down "$CAM_LIGHT_X" "$CAM_LIGHT_Y" "$x" "$y"
  hid_delay 100
  hid_second_up "$CAM_LIGHT_X" "$CAM_LIGHT_Y" "$x" "$y"
}

light_up_at() {
  offset=$1; label=$2
  wait_until "$offset"
  now_rel
  actual=$NOW_REL
  printf '%6d ms  %s (contacts up)\n' "$actual" "$label"
  hid_mark "$actual"
  hid_release
}

capture_lit_at() {
  offset=$1; name=$2; label=$3
  wait_until "$offset"
  now_rel
  actual=$NOW_REL
  printf '%6d ms  capture-%s %s\n' "$actual" "$label" "$name"
  hid_mark "$actual"
  # Keep the view light down across the screencap without putting a host round
  # trip between the actuator and frame. The game needs about 350 ms to draw a
  # visibly lit office vent; the measured raw capture p95 is another 206 ms.
  # A 600 ms hold still covers the 350 ms draw delay plus the measured 206 ms
  # raw-capture p95, without needlessly delaying the classifier and mask.
  if [ "$HID_MODE" -eq 1 ]; then
    hid_down "$CAM_LIGHT_X" "$CAM_LIGHT_Y"
    sleep 0.35
    screencap > "$SAMPLE_DIR/$name.raw"
    hid_release
  else
    input swipe "$CAM_LIGHT_X" "$CAM_LIGHT_Y" "$CAM_LIGHT_X" "$CAM_LIGHT_Y" 600 >/dev/null 2>&1 &
    light_pid=$!
    sleep 0.35
    screencap > "$SAMPLE_DIR/$name.raw"
    wait "$light_pid"
  fi
}

capture_unlit_at() {
  offset=$1; name=$2; label=$3
  wait_until "$offset"
  now_rel
  actual=$NOW_REL
  printf '%6d ms  capture-%s-unlit %s\n' "$actual" "$label" "$name"
  hid_mark "$actual"
  screencap > "$SAMPLE_DIR/$name.raw"
}

hid_sweep_at() {
  start=$1; label=$2
  light_down_at "$start" "$label-light-down"
  light_cam_at  $((start + 30))  "$CAM10_X" "$CAM10_Y" "$label-cam-10"
  light_cam_at  $((start + 130)) "$CAM04_X" "$CAM04_Y" "$label-cam-04"
  light_cam_at  $((start + 230)) "$CAM07_X" "$CAM07_Y" "$label-cam-07"
  light_up_at   $((start + 340)) "$label-light-up"
}

device_sweep_at() {
  sweep_start=$1; sweep_label=$2
  # This is the shortest primitive with repeated complete phone traces. Keep
  # each call wall-timed: sending all `delay` commands in one burst lets hid's
  # Handler coalesce/reorder the intermediate reports. The 70 ms light settle,
  # 100 ms contacts, 240 ms feed starts, and 790 ms total match the validated
  # default HID path rather than the rejected 267/357/477/597 ms batches.
  light_down_at "$sweep_start" "$sweep_label-light-down"
  light_cam_at  $((sweep_start +  70)) "$CAM10_X" "$CAM10_Y" "$sweep_label-cam-10"
  light_cam_at  $((sweep_start + 310)) "$CAM04_X" "$CAM04_Y" "$sweep_label-cam-04"
  light_cam_at  $((sweep_start + 550)) "$CAM07_X" "$CAM07_Y" "$sweep_label-cam-07"
  light_up_at   $((sweep_start + 790)) "$sweep_label-light-up"
}
