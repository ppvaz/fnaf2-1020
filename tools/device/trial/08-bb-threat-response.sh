classify_left_and_queue_mask_at() {
  offset=$1; mask_gap=$2; label=$3
  wait_until "$offset"
  now_rel
  actual=$NOW_REL
  printf '%6d ms  %s start snapshot\n' "$actual" "$label" >&2
  hid_mark "$actual"

  # `screencap` does not latch the SurfaceFlinger frame when the process starts:
  # fixed 80 ms overlap produced both a literal mask frame and an unlit office
  # frame on this phone. It writes nothing until the compositor has returned an
  # immutable buffer. Keep the vent lit until the first output byte appears,
  # then mask immediately while the remaining 10 MB write/classification tail
  # proceeds. This is an observed readiness boundary, not another sleep guess.
  if [ "$HID_LEFT_DEBUG_RAW" != "-" ]; then
    capture_raw="$HID_LEFT_DEBUG_RAW.$offset.raw"
  else
    capture_raw="$PIDFILE.left.raw"
    rm -f "$capture_raw"
  fi
  : > "$CAPTURE_LOCK"
  screencap > "$capture_raw" &
  capture_pid=$!
  # Grab the cue helper's 20x9 sensor for the SAME moment, in parallel -- it is
  # a device-local loopback read (~53 ms) launched alongside screencap, so it
  # adds no serial latency to the mask that follows. This is the paired corpus
  # plans/15 package 5 needs: a real VirtualDisplay-scaler grid line next to the
  # screencap the BB model is trained on. Logged only; the read still decides on
  # the screencap. Empty string when the helper is absent.
  capture_grid="$PIDFILE.left.grid"
  rm -f "$capture_grid"
  if [ "$CUE_PORT" != "-" ]; then
    cue_grid > "$capture_grid" &
    grid_pid=$!
  else
    grid_pid=""
  fi
  while [ ! -s "$capture_raw" ]; do
    kill -0 "$capture_pid" 2>/dev/null || break
    sleep 0.002
  done
  now_rel
  actual=$NOW_REL
  printf '%6d ms  %s snapshot latched; mask now\n' "$actual" "$label" >&2
  hid_mark "$actual"
  hid_release
  # Restore the prophylactic Golden Freddy flick. The earlier diagnosis blamed
  # a dropped mask toggle for the stuck-mask nights, but the HID/video census
  # identified the press the game lost: the MONITOR raise after mask-off, 9/15
  # below 180 ms and 0/17 at or above it. The branch macro now owns that safe
  # mask-off -> raise seam. Here the plan's one-poll release still separates
  # the vent light from mask-on so Fusion cannot read one finger moving between
  # buttons.
  hid_delay "$mask_gap"
  hid_down "$MASK_X" "$MASK_Y"
  hid_delay "$TAP_CONTACT_MS"
  hid_release
  wait "$capture_pid" || true
  classification=$("$CHECKER" classify "$BB_MODEL" < "$capture_raw" 2>/dev/null) || \
    classification='unknown capture-or-classifier-error'
  # Was the monitor actually down when this frame was taken?
  #
  # Every `unknown` this run has produced scored 20-35, and the frames rendered
  # out of nights 6-22 to 6-27 show why: they are the CAMERA FEED, not the office. The
  # anchor's monitor press did not take effect, so the vent light press was the
  # camera light and the classifier was handed CAM 11 or the map. Nothing
  # observed that, so the pilot never recovered.
  #
  # This costs no extra capture: it is the same raw frame, asked a different
  # question. The camera map's lime selection highlight lives on the right of
  # the screen; the office's own green LIGHT button is at x~350 and outside this
  # ROI. Measured on the frames from nights 6-25 to 6-26: office 0-1 bps, camera feed
  # 70-140 bps. The threshold sits two orders of magnitude from both.
  #
  # Reported, not yet acted on -- the intermittency is what needs measuring
  # first, and a schedule that reacts to a signal nobody has watched is how this
  # runner acquired most of its scars.
  # Only asked when it can change the decision. A confident `empty` or `bb` is
  # an office frame by construction -- the model's classes are office frames --
  # and the clear branch's mask-off press has a hard deadline at base+1300 ms
  # that a second checker invocation blew by about 100 ms on night 6-29.
  monitor_seen='cams=office-by-classification'
  case "$classification" in
    empty\ *|bb\ *) ;;
    *)
      # CUE_MONITOR_ROI, not a literal: cams_still_up() verifies the recovery
      # this branch triggers, and a recovery check that can drift from the
      # detection it answers is the same open-loop mistake at one remove.
      monitor_seen=$("$CHECKER" match $CUE_MONITOR_ROI \
        < "$capture_raw" 2>/dev/null) || monitor_seen=unreadable
      case "$monitor_seen" in
        match) monitor_seen='cams=UP-DESYNCED' ;;
        clear) monitor_seen='cams=down' ;;
        *)     monitor_seen='cams=unreadable' ;;
      esac
      ;;
  esac
  # Keep the frames that are worth labelling, and only those.
  #
  # Golden Freddy is one run in ten before 2 AM and his office appearance is a
  # translucent figure, which is why the provisional model separates him by a
  # margin of 3 where Balloon Boy's is 18-21 -- it was built from a single
  # appearance. More positives cannot be requested; they have to be caught. A
  # confident `empty` is the one class we already have plenty of, so retaining
  # every non-empty read costs a few frames a night and turns each rare event
  # into training data instead of a line in a log.
  #
  # The screenrecord capture cannot do this job: it is downscaled to 1280x576
  # and h264-compressed, while every model here is built on 2400x1080 raw
  # screencaps. A frame extracted from the video is not the same measurement.
  case "$classification" in
    empty\ *) [ "$HID_LEFT_DEBUG_RAW" != "-" ] || rm -f "$capture_raw" ;;
    *)
      if [ -n "$KEEP_DIR" ]; then
        mkdir -p "$KEEP_DIR"
        cp "$capture_raw" "$KEEP_DIR/$(printf '%06d' "$actual")-${classification%% *}.raw" \
          2>/dev/null || true
      fi
      [ "$HID_LEFT_DEBUG_RAW" != "-" ] || rm -f "$capture_raw"
      ;;
  esac
  # The paired grid line goes next to the frame for EVERY read, empty included
  # -- `empty` is the class the screencap corpus already has plenty of and the
  # grid corpus has none of, and one line is ~1.1 KB where the frame is 10 MB.
  # Named to match the .raw so a later session pairs them by the timestamp
  # prefix. Nothing reads these yet; plans/15 package 4 builds the signature.
  if [ -n "$grid_pid" ]; then
    wait "$grid_pid" 2>/dev/null || true
    if [ -n "$KEEP_DIR" ] && grep -q '^OK grid=' "$capture_grid" 2>/dev/null; then
      mkdir -p "$KEEP_DIR"
      cp "$capture_grid" "$KEEP_DIR/$(printf '%06d' "$actual")-${classification%% *}.grid" \
        2>/dev/null || true
    fi
  fi
  rm -f "$CAPTURE_LOCK"
  now_rel
  actual=$NOW_REL
  # Logged, never acted on: this is the labelled data the helper's own threshold
  # needs before anything can be read from it. `luma` is its left-opening
  # value and `ageUs` says how stale the projected frame was.
  # Log the cue fields per cycle, each extracted on its own so a missing one
  # cannot blank the rest. The single all-or-nothing sed this replaced printed
  # NOTHING when the device's field set moved, and an unmatched sed is silent:
  # that is how the cue trace went empty without anyone noticing.
  #
  # grey= is recorded and decides nothing, and the record is now the point.
  # It was briefly the resync verification's anchor (ffb1631, withdrawn the
  # same day -- see CUE_MONITOR_ROI). These 77 office samples per cleared night
  # are what refuted it: office grey runs 138-180, straight through the
  # monitor-up band. Keep logging it, because a threshold nobody has a live
  # distribution for is the thing that keeps getting adopted.
  cue_line=""
  if [ "$CUE_PORT" != "-" ]; then
    cl_snap=$(cue_snapshot)
    cl_luma=$(printf '%s\n' "$cl_snap" | sed -n 's/.* luma=\([0-9-]*\).*/\1/p')
    cl_cam5=$(printf '%s\n' "$cl_snap" | sed -n 's/.* cam5=\([0-9-]*\).*/\1/p')
    cl_grey=$(printf '%s\n' "$cl_snap" | sed -n 's/.* grey=\([0-9-]*\).*/\1/p')
    cl_age=$(printf '%s\n' "$cl_snap" | sed -n 's/.* ageUs=\([0-9-]*\).*/\1/p')
    cl_grid=$(sed -n 's/^OK grid=[0-9x]* seq=\([0-9]*\).*/\1/p' "$capture_grid" 2>/dev/null)
    cue_line=" cue[luma=${cl_luma:-UNREAD} cam5=${cl_cam5:-UNREAD} grey=${cl_grey:-ABSENT} age=${cl_age:-UNREAD}us grid=${cl_grid:-MISS}]"
  fi
  printf '%6d ms  classify-bb-left %s %s%s\n' "$actual" "$classification" "$monitor_seen" "$cue_line" >&2
  hid_mark "$actual"
  rm -f "$capture_grid"
}

