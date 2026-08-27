# Every report the runner sends, appended verbatim. The routine level has an
# oracle -- the device plan replays through the engine -- but the microroutine
# level had none but a phone, and every input bug this project has hit lives
# there: contact lengths, select spacing, and released time between two
# buttons. The stream carries its own `delay` commands, so the intended timing
# is fully recoverable from it without timestamping each line, which would put
# a clock read in the hot path.
hid_emit() {
  print -p -- "$1"
  [ -z "$HID_TRACE" ] || printf '%s\n' "$1" >> "$HID_TRACE"
}

# Snap the trace's clock to the real one. Only the hid-side `delay` commands
# are recoverable from the report stream itself, so a sequence spaced by
# wait_until looks instantaneous to a reader -- which made the first version of
# the auditor report every wall-timed action as a zero-gap button change. The
# helpers already read the monotonic clock once for their own log line, so
# reusing that value costs nothing.
# One device-local cue-helper snapshot. Loopback nc inside this same shell, so
# it costs no adb round trip -- the whole point of the helper. Returns the
# response line, or an empty string if the helper is absent or slow; a missing
# snapshot must never be able to stall the schedule, so the timeout is short and
# the caller ignores failures.
cue_snapshot() {
  [ "$CUE_PORT" != "-" ] || return 0
  printf 'GET %s\n' "$CUE_TOKEN" | toybox nc -w 1 127.0.0.1 "$CUE_PORT" 2>/dev/null | tr -d '\r'
}

# The helper's whole 20x9 visual sensor as one `OK grid=20x9 seq=N <hex>` line
# (CaptureService.dispatchControl, verb GRID). This is the sensor the
# screencap-free BB read has to be calibrated against -- Android's own
# VirtualDisplay scaler, not a host box-filter of a screencap
# (plans/15, ON-DEVICE-VALIDATION.md "pricing the stream as the classifier's
# capture"). Logged only; nothing decides on it yet. Same contract as
# cue_snapshot: short timeout, failure ignored, never stalls the schedule.
cue_grid() {
  [ "$CUE_PORT" != "-" ] || return 0
  printf 'GRID %s\n' "$CUE_TOKEN" | toybox nc -w 1 127.0.0.1 "$CUE_PORT" 2>/dev/null | tr -d '\r'
}

hid_mark() {
  [ -z "$HID_TRACE" ] || printf '{"command":"mark","ms":%s}\n' "$1" >> "$HID_TRACE"
}

hid_release() {
  [ "$HID_FD_OPEN" -eq 1 ] || return 0
  # Report both inactive contact IDs. A count of zero makes hid-multitouch
  # stop after the first collection and can leave contact 1 stuck down.
  hid_emit '{"id":92,"command":"report","report":[1,2,0,0,0,0,0,4,0,0,0,0]}'
}

hid_down() {
  x=$1; y=$2
  # InputReader rotates the virtual device's 2400x1080 natural axes into the
  # phone's landscape viewport. This is the inverse mapping measured with the
  # system touch overlay: rawX=(1080-screenY)*20/9, rawY=screenX*9/20.
  rx=$(((1080 - y) * 20 / 9))
  ry=$((x * 9 / 20))
  hid_emit "{\"id\":92,\"command\":\"report\",\"report\":[1,1,3,$((rx % 256)),$((rx / 256)),$((ry % 256)),$((ry / 256)),0,0,0,0,0]}"
}

hid_up() {
  # Single-contact-0 release at a coordinate. Byte 7 (contact 1 flags) is 0x04
  # so Linux consumes contact 1's inactive record -- a report promising one
  # record leaves it latched down (trap 2). Used by the LIGHT_AFTER sweep,
  # where the select and the light are separate single-finger Clicks.
  x=$1; y=$2
  rx=$(((1080 - y) * 20 / 9))
  ry=$((x * 9 / 20))
  hid_emit "{\"id\":92,\"command\":\"report\",\"report\":[1,1,0,$((rx % 256)),$((rx / 256)),$((ry % 256)),$((ry / 256)),4,0,0,0,0]}"
}

hid_two_down() {
  x1=$1; y1=$2; x2=$3; y2=$4
  rx1=$(((1080 - y1) * 20 / 9)); ry1=$((x1 * 9 / 20))
  rx2=$(((1080 - y2) * 20 / 9)); ry2=$((x2 * 9 / 20))
  hid_emit "{\"id\":92,\"command\":\"report\",\"report\":[1,2,3,$((rx1 % 256)),$((rx1 / 256)),$((ry1 % 256)),$((ry1 / 256)),7,$((rx2 % 256)),$((rx2 / 256)),$((ry2 % 256)),$((ry2 / 256))]}"
}

hid_second_up() {
  x1=$1; y1=$2; x2=$3; y2=$4
  rx1=$(((1080 - y1) * 20 / 9)); ry1=$((x1 * 9 / 20))
  rx2=$(((1080 - y2) * 20 / 9)); ry2=$((x2 * 9 / 20))
  # Contact Count is the number of records in this hybrid packet, not the
  # number still touching. Count 2 makes the kernel consume ID 1's explicit
  # inactive record and emit ACTION_POINTER_UP while preserving ID 0.
  hid_emit "{\"id\":92,\"command\":\"report\",\"report\":[1,2,3,$((rx1 % 256)),$((rx1 / 256)),$((ry1 % 256)),$((ry1 / 256)),4,$((rx2 % 256)),$((rx2 / 256)),$((ry2 % 256)),$((ry2 / 256))]}"
}

# The pulsed-light sweep needs the inverse of hid_two_down: contact 1 selects
# the camera and contact 0 is pulsed afterwards. Both records are always
# present so Linux consumes contact 1's release -- a report promising one
# record leaves it latched down (trap 2 in docs/device/HID-MULTITOUCH.md).
hid_cam_report() {
  f0=$1; f1=$2; x=$3; y=$4
  rx0=$(((1080 - CAM_LIGHT_Y) * 20 / 9)); ry0=$((CAM_LIGHT_X * 9 / 20))
  rx1=$(((1080 - y) * 20 / 9)); ry1=$((x * 9 / 20))
  hid_emit "{\"id\":92,\"command\":\"report\",\"report\":[1,2,$f0,$((rx0 % 256)),$((rx0 / 256)),$((ry0 % 256)),$((ry0 / 256)),$f1,$((rx1 % 256)),$((rx1 / 256)),$((ry1 % 256)),$((ry1 / 256))]}"
}

hid_cam_down()       { hid_cam_report 0 7 "$1" "$2"; }
hid_cam_light_down() { hid_cam_report 3 7 "$1" "$2"; }
hid_cam_light_up()   { hid_cam_report 0 4 "$1" "$2"; }

hid_delay() {
  # `hid` does not treat a zero duration as "no delay": Event$Builder.build
  # throws IllegalStateException("Delay has missing or invalid duration"), the
  # process exits, mksh loses the co-process, and the next `print -p` ends the
  # night. Reproduced in isolation on this phone with no game running.
  #
  # Guarded here rather than at the call site because a zero duration means
  # nothing everywhere, and the failure is fatal and silent at every emitter.
  # SWEEP_LIGHT_LEAD_MS is 0 in the shipped geometry and reaches this from more
  # than one place; pulsed_cam_burst happened to guard it and plan_emit's
  # hallraise did not, which cost night 6-22 at 18 s.
  [ "$1" -gt 0 ] || return 0
  hid_emit "{\"id\":92,\"command\":\"delay\",\"duration\":$1}"
}

