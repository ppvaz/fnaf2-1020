# shellcheck shell=bash
cleanup_remote() {
  if [ "$HID_FD_OPEN" -eq 1 ]; then
    hid_release 2>/dev/null || true
    HID_FD_OPEN=0
    if [ -n "$HID_PID" ]; then
      kill "$HID_PID" 2>/dev/null || true
      wait "$HID_PID" 2>/dev/null || true
    fi
  fi
  children=$(cat "/proc/$$/task/$$/children" 2>/dev/null || true)
  [ -z "$children" ] || kill -TERM $children 2>/dev/null || true
  # The trace is evidence; the host pulls it after the driver stops.
  rm -f "$PIDFILE" "$READYFILE" "$STARTFILE" "$EPOCHFILE" \
    "$CAPTURE_LOCK" "$PIDFILE.left.raw" "$PIDFILE.epoch.raw" "$PLAN_FILE"
}
trap cleanup_remote EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

if [ "$HID_MODE" -eq 1 ]; then
  /system/bin/hid - |&
  HID_PID=$!
  HID_FD_OPEN=1
  hid_emit '{"id":92,"command":"register","name":"FNAF Timed Touch","vid":6353,"pid":61959,"bus":"usb","descriptor":[5,13,9,4,161,1,133,1,9,34,161,0,9,85,21,0,37,2,117,8,149,1,177,2,9,84,129,2,5,13,9,34,161,2,9,66,21,0,37,1,117,1,129,2,9,50,129,2,9,81,37,63,117,6,129,2,5,1,9,48,38,95,9,117,16,129,2,9,49,38,55,4,129,2,192,5,13,9,34,161,2,9,66,21,0,37,1,117,1,129,2,9,50,129,2,9,81,37,63,117,6,129,2,5,1,9,48,38,95,9,117,16,129,2,9,49,38,55,4,129,2,192,192,192]}'
  # UHID_OPEN only means the kernel is ready. On this phone InputReader adds
  # the resulting touchscreen about five seconds later; every report sent in
  # that gap is silently lost. Gate the strategy clock on the framework-level
  # device entry AOSP requires instead of guessing a fixed startup delay.
  hid_ready_deadline=$(( $(date +%s) + 12 ))
  until input_state="$(dumpsys input 2>/dev/null || true)" &&
      grep -F 'FNAF Timed Touch' <<<"$input_state" >/dev/null; do
    kill -0 "$HID_PID" 2>/dev/null || {
      echo 'HID transport exited before InputReader attached it' >&2
      exit 1
    }
    [ "$(date +%s)" -lt "$hid_ready_deadline" ] || {
      echo 'timed out waiting for InputReader to attach HID touchscreen' >&2
      exit 1
    }
    sleep 0.1
  done
fi

# Preload the slow virtual-device registration while the title screen is
# harmless. In the legacy mode the host creates STARTFILE after its screenshot
# gate. The phase experiment instead timestamps the first immutable device-side
# frame whose top-right clock is present and never crosses USB to choose T0.
: > "$READYFILE"
if [ "$DEVICE_EPOCH_LATCH" -eq 1 ]; then
  [ "$CHECKER" != "-" ] || {
    echo 'device epoch latch requires screencheck' >&2
    exit 44
  }
  epoch_raw="$PIDFILE.epoch.raw"
  epoch_deadline=$(( $(date +%s) + 45 ))
  epoch_previous_clear=""
  epoch_first_match=""
  epoch_confirmations=0
  epoch_attempts=0
  while :; do
    rm -f "$epoch_raw"
    : > "$CAPTURE_LOCK"
    screencap > "$epoch_raw" &
    epoch_capture_pid=$!
    while [ ! -s "$epoch_raw" ]; do
      kill -0 "$epoch_capture_pid" 2>/dev/null || break
      sleep 0.002
    done
    epoch_latch=$(date +%s%3N)
    # The same instant on the monotonic clock, read immediately after so the
    # two are within one builtin of each other. `date` is what the epoch report
    # publishes and what joins to host artifacts; /proc/uptime is what the
    # schedule is then measured on. Neither is derived from the other.
    read epoch_up_u epoch_up_rest < /proc/uptime
    epoch_latch_up_ms=$(( (${epoch_up_u%.*} * 100 + 10#${epoch_up_u#*.}) * 10 ))
    wait "$epoch_capture_pid" || {
      rm -f "$CAPTURE_LOCK" "$epoch_raw"
      echo 'device epoch screencap failed' >&2
      exit 44
    }
    rm -f "$CAPTURE_LOCK"
    epoch_attempts=$((epoch_attempts + 1))
    # Both checks read the same frame, so run them concurrently: the bracket
    # is the sampling period, and the sampling period is what decides whether
    # the pilot's scheduler phase lands inside its window at all.
    "$CHECKER" match 1960 20 2380 180 4 180 255 180 255 180 255 400 \
      < "$epoch_raw" > "$epoch_raw.clock" 2>/dev/null &
    epoch_clock_pid=$!
    "$CHECKER" stats 95 40 260 95 4 \
      < "$epoch_raw" > "$epoch_raw.flash" 2>/dev/null &
    epoch_flash_pid=$!
    wait "$epoch_clock_pid" || true
    wait "$epoch_flash_pid" || true
    epoch_clock=$(cat "$epoch_raw.clock" 2>/dev/null) || epoch_clock=error
    epoch_flash_stats=$(cat "$epoch_raw.flash" 2>/dev/null) || epoch_flash_stats=error
    [ -n "$epoch_clock" ] || epoch_clock=error
    [ -n "$epoch_flash_stats" ] || epoch_flash_stats=error
    epoch_flash_mean=${epoch_flash_stats#*mean_rgb=}
    epoch_flash_mean=${epoch_flash_mean%%,*}
    case "$epoch_flash_mean" in
      ''|*[!0-9]*) epoch_detection=error ;;
      *)
        if [ "$epoch_clock" = match ] && [ "$epoch_flash_mean" -gt 90 ]; then
          epoch_detection=match
        else
          epoch_detection=clear
        fi
        ;;
    esac
    case "$epoch_detection" in
      match)
        if [ "$epoch_confirmations" -eq 0 ]; then
          epoch_first_match=$epoch_latch
          epoch_first_match_up_ms=$epoch_latch_up_ms
          epoch_confirmations=1
          continue
        fi
        epoch_confirmations=$((epoch_confirmations + 1))
        if [ -n "$epoch_previous_clear" ]; then
          epoch_diff_ms "$epoch_first_match" "$epoch_previous_clear"
          epoch_bracket=$EPOCH_DIFF_RESULT
        else
          epoch_bracket=-1
        fi
        T0=$epoch_first_match
        T0_UP_MS=$epoch_first_match_up_ms
        # The published route's phase window is one-sided -- it tolerates a
        # late T0 and almost no early one -- so the conservative first-positive
        # edge is right for it. Minus 7 Left-Read's window is 83-267 ms, which
        # is centred, so the edge is the wrong estimator: the true HUD frame is
        # uniform inside the bracket, and taking the edge throws away half of
        # it. Centring roughly doubles how often a run lands in phase.
        if [ "$NIGHT6_LEFT" -eq 1 ] && [ "$epoch_bracket" -gt 0 ]; then
          epoch_sub_ms "$epoch_first_match" $((epoch_bracket / 2))
          T0=$EPOCH_SUB_RESULT
          # The monotonic origin moves by the same amount, so the two stay one
          # instant described twice rather than two different starts.
          T0_UP_MS=$((epoch_first_match_up_ms - epoch_bracket / 2))
          printf 'epoch centred: first match %s, bracket %s, T0 %s\n' \
            "$epoch_first_match" "$epoch_bracket" "$T0"
        fi
        epoch_diff_ms "$epoch_latch" "$T0"
        epoch_confirmation_delay=$EPOCH_DIFF_RESULT
        printf 'epoch_ms=%s previous_clear_ms=%s bracket_ms=%s confirmation_ms=%s confirmation_delay_ms=%s attempts=%s detector=clock+flash-2f\n' \
          "$T0" "${epoch_previous_clear:--1}" "$epoch_bracket" "$epoch_latch" \
          "$epoch_confirmation_delay" "$epoch_attempts" > "$EPOCHFILE"
        break
        ;;
      clear)
        epoch_previous_clear=$epoch_latch
        epoch_first_match=""
        epoch_confirmations=0
        ;;
      *)
        echo "device epoch detector failed: $epoch_detection" >&2
        exit 44
        ;;
    esac
    # Deliberately still `date`: this is a coarse epoch-domain deadline in a
    # loop whose every iteration already spends a screencap (0.7-2.5 s), so the
    # fork is free here, and the monotonic origin does not exist yet -- it is
    # latched by the very transition this loop is looking for.
    [ "$(date +%s)" -lt "$epoch_deadline" ] || {
      echo 'device epoch detector timed out waiting for the office clock' >&2
      exit 44
    }
  done
  # READYFILE means the HID device is attached to InputReader, not that the
  # epoch latch is still pending. Keep it through the run so a caller that
  # arms during the intro cannot lose the readiness edge while the first HUD
  # capture is being classified; cleanup_remote removes it at exit.
  rm -f "$epoch_raw" "$epoch_raw.clock" "$epoch_raw.flash"
else
  while [ ! -e "$STARTFILE" ]; do
    sleep 0.02
  done
  rm -f "$STARTFILE"
  T0=$(date +%s%3N)
  read start_up_u start_up_rest < /proc/uptime
  T0_UP_MS=$(( (${start_up_u%.*} * 100 + 10#${start_up_u#*.}) * 10 ))
fi

if [ "$NIGHT6_LEFT" -eq 1 ]; then
  # T0 is the first office-HUD frame. The exact simulator's phase window for
  # this route is 83-267 ms after the night's start, so the pilot's epoch is
  # deliberately offset from the latch rather than equal to it.
  T0=$((T0 + PILOT_OFFSET_MS))
  T0_UP_MS=$((T0_UP_MS + PILOT_OFFSET_MS))
  printf 'pilot epoch = latch + %s ms\n' "$PILOT_OFFSET_MS"
fi
