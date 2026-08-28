wait_until() {
  # Every wall-timed boundary advances the trace's clock. Without this only
  # hid-side delays do, and a helper that spaces its reports with wait_until
  # reads back as a burst of zero-length contacts.
  hid_mark "$1"
  # The target is on the monotonic axis. The polling loop used to fork `date`
  # per iteration, so its granularity was one fork (~21 ms) and it landed
  # 34-73 ms late; reading /proc/uptime is a builtin and lands inside one
  # 10 ms tick. The structure is unchanged -- sleep to 20 ms out, then spin --
  # because the spin is what absorbs `sleep`'s own fork overshoot.
  target=$((T0_UP_MS + $1))
  while :; do
    read wu_u wu_rest < /proc/uptime
    left=$((target - (${wu_u%.*} * 100 + 10#${wu_u#*.}) * 10))
    [ "$left" -le 0 ] && return
    if [ "$left" -gt 40 ]; then
      delay=$((left - 20))
      delay_frac=$((1000 + delay % 1000))
      sleep "$((delay / 1000)).${delay_frac#1}"
    fi
  done
}

# The time of the last press, so a following action can be scheduled from
# when the game actually received it rather than from where the table put it.
LAST_PRESS_MS=0
# The last press that started a monitor flip, tracked apart from LAST_PRESS_MS
# because what it gates is the flip's animation and not the press before the
# read. A large negative start means "no flip is running", so the first cycle
# does not wait for one.
LAST_MONITOR_PRESS_MS=-100000
# When the vent light actually went down, which the plan's offset stops being
# once anything above moves it.
LIGHT_DOWN_MS=0

# The human floor (2026-08-25 decision: absolute, no override -- deliberately
# not env-overridable). The pilot may not deliver inputs a human could not:
# 350 ms press-to-press, [INFERRED] from the trainer's duel pass gate until
# the trainer trace census (tools/tracereport.mjs) supersedes it. The same
# model gate in tools/device/human-gate.mjs supersedes this for emitted plans;
# this remains only as a backstop for dormant/unpriced branches.
HUMAN_FLOOR_MS=350
# Tracked apart from LAST_PRESS_MS, whose zero start and receipt-time uses
# belong to scheduling; a gate must not change what schedules.
HF_LAST_PRESS_MS=-100000

human_floor_abort() {
  echo "HUMAN FLOOR: $2 lands $1 ms after the previous press (< $HUMAN_FLOOR_MS ms)" >&2
  echo "refusing: the pilot may not deliver inhumanly timed inputs (2026-08-25, no override)" >&2
  exit 44
}

human_floor_check() {
  # A model-gated controller path has priced its own schedule: Minus 7
  # (NIGHT6_LEFT=1) through human-gate.mjs, Minus Toys (NIGHT6_LEFT=2) through
  # minus-toys-plan.mjs --gate. Their intentional compound rows contain sub-350
  # ms boundaries on purpose -- the Minus Toys arming geometry lands CAM 09 and
  # the monitor 50 ms apart. The old scalar gap check aborted those plans at
  # their first press. Retain it only for dormant unpriced branches
  # (NIGHT6_LEFT=0); the plan path is covered by replay, input-gap, interpreter
  # and actuator checks.
  case "$NIGHT6_LEFT" in 1|2) return 0 ;; esac
  hf_gap=$(($1 - HF_LAST_PRESS_MS))
  [ "$hf_gap" -ge "$HUMAN_FLOOR_MS" ] || human_floor_abort "$hf_gap" "$2"
  HF_LAST_PRESS_MS=$1
}

press_at() {
  offset=$1; x=$2; y=$3; label=$4
  wait_until "$offset"
  now_rel
  actual=$NOW_REL
  human_floor_check "$actual" "$label"
  LAST_PRESS_MS=$actual
  case "$label" in monitor*) LAST_MONITOR_PRESS_MS=$actual ;; esac
  printf '%6d ms  %s\n' "$actual" "$label"
  hid_mark "$actual"
  if [ "$PRESS_MODE" = "tap" ]; then
    input tap "$x" "$y"
  elif [ "$HID_MODE" -eq 1 ]; then
    # The contact is timed inside the hid process. That is not a convenience:
    # `sleep` and `date` are fork+exec on this phone, and timing the release
    # from the shell instead cost one fork per press and drifted the cycle
    # anchor 434 ms -- the schedule fell apart within the opening. hid_delay
    # also measures from when the press is *delivered*, so a backlogged stream
    # still produces a full-length contact.
    hid_down "$x" "$y"
    hid_delay "$TAP_CONTACT_MS"
    hid_release
  elif [ "$PRESS_MODE" = "async-swipe" ]; then
    input swipe "$x" "$y" "$x" "$y" 120 >/dev/null 2>&1 &
  elif [ "$PRESS_MODE" = "fast-swipe" ]; then
    # Sixty milliseconds crosses at least one 30 Hz Fusion update with margin.
    # Keep this synchronous: the helper finishes in about 170 ms on this
    # device, leaving roughly 20 ms before the next 190 ms slot and making a
    # late action delay the next one instead of overlapping it.
    input swipe "$x" "$y" "$x" "$y" 60
  else
    input swipe "$x" "$y" "$x" "$y" 120
  fi
}

hold_at() {
  offset=$1; x=$2; y=$3; duration=$4; label=$5
  wait_until "$offset"
  now_rel
  actual=$NOW_REL
  human_floor_check "$actual" "$label"
  printf '%6d ms  %s (%d ms)\n' "$actual" "$label" "$duration"
  hid_mark "$actual"
  if [ "$HID_MODE" -eq 1 ]; then
    hid_down "$x" "$y"
    hid_delay "$duration"
    hid_release
  else
    input swipe "$x" "$y" "$x" "$y" "$duration"
  fi
}

