#!/bin/bash
# Mock regression for the runner's LIVE human floor. No phone, no adb.
#
# human-gate.mjs refuses a plan file before launch, but the swipe and HID
# schedules never pass through a plan file -- their only gate is the one
# inside press_at/hold_at/pulsed_sweep_at. This runs those shipped functions
# (extracted by name, as test-plan-interpreter.sh does) with the device
# primitives stubbed and a fake clock, and asserts the floor actually aborts:
# a guard that is never exercised is the graded-nothing pipeline again.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# The assembled driver, not the runner file: the press primitives run on the
# phone, and this must read what is sent there rather than a source file that
# may no longer be what gets sent.
TMP="$(mktemp -d "${TMPDIR:-/tmp}/fnaf2-human-floor.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
RUNNER="$TMP/driver.sh"
bash "$HERE/trial/assemble.sh" > "$RUNNER"

extract() {
  awk -v fn="$1" '
    $0 ~ "^" fn "\\(\\) \\{" { inside = 1 }
    inside { print }
    inside && /^\}$/ { exit }
  ' "$RUNNER"
}

FLOOR="$(grep -m1 '^HUMAN_FLOOR_MS=' "$RUNNER" | cut -d= -f2)"
case "$FLOOR" in
  ''|*[!0-9]*) echo "the runner has no numeric HUMAN_FLOOR_MS" >&2; exit 1 ;;
esac

{
  echo 'set -eu'
  echo "HUMAN_FLOOR_MS=$FLOOR"
  echo 'HF_LAST_PRESS_MS=-100000'
  echo 'NIGHT6_LEFT=0'
  echo 'LAST_PRESS_MS=0; LAST_MONITOR_PRESS_MS=-100000'
  echo 'T0=0; T0_UP_MS=0; PRESS_MODE=tap; HID_MODE=0; FAKE_NOW=0; NOW_REL=0'
  # The clock and every device primitive are stubs; the gate is not. The runner
  # reads the phone's monotonic clock through now_rel (`read < /proc/uptime`,
  # which macOS does not have) and it assigns NOW_REL rather than echoing, so
  # the stub assigns too.
  echo 'now_rel() { NOW_REL=$FAKE_NOW; }'
  echo 'wait_until() { :; }; hid_mark() { :; }'
  echo 'hid_down() { :; }; hid_delay() { :; }; hid_release() { :; }'
  echo 'input() { :; }; pulsed_cam_burst() { :; }'
  echo 'plan_control_xy() { PX=1; PY=1; }'
  for fn in human_floor_abort human_floor_check press_at hold_at pulsed_sweep_at; do
    body="$(extract "$fn")"
    [ -n "$body" ] || { echo "could not extract $fn from the runner" >&2; exit 1; }
    printf '%s\n' "$body"
  done
} > "$TMP/harness.sh"

failed=0
expect() { # NAME EXPECTED_RC SCRIPT...
  ex_name=$1; ex_rc=$2; shift 2
  set +e
  out=$( { cat "$TMP/harness.sh"; printf '%s\n' "$@"; } | bash 2>&1 )
  rc=$?
  set -e
  if [ "$rc" -ne "$ex_rc" ]; then
    echo "FAIL $ex_name -- exit $rc, expected $ex_rc"
    printf '%s\n' "$out" | sed 's/^/    /'
    failed=$((failed + 1))
  fi
}

# A press inside the floor of the previous one aborts with 44.
expect 'tight press aborts' 44 \
  'FAKE_NOW=1000; press_at 1000 1 1 first' \
  'FAKE_NOW=1200; press_at 1200 1 1 second'

# A press exactly at the floor is allowed.
expect 'floor-spaced press allowed' 0 \
  'FAKE_NOW=1000; press_at 1000 1 1 first' \
  "FAKE_NOW=$((1000 + FLOOR)); press_at $((1000 + FLOOR)) 1 1 second"

# The emitted controller plan is gated as a whole. Its actuator macros contain
# deliberate 120/180 ms boundaries, so applying the retired scalar gap rule to
# them would make every accepted plan abort on-device.
expect 'model-gated plan bypasses the legacy scalar floor' 0 \
  'NIGHT6_LEFT=1; FAKE_NOW=1000; press_at 1000 1 1 first' \
  'FAKE_NOW=1120; press_at 1120 1 1 planned-second'

# hold_at is a press too.
expect 'tight hold aborts' 44 \
  'FAKE_NOW=1000; press_at 1000 1 1 first' \
  'FAKE_NOW=1100; hold_at 1100 1 1 500 wind'

# An inhuman sweep is refused from its arguments, before any contact.
# NIGHT6_LEFT is 0 in this harness, so this is the DORMANT arm.
expect 'inhuman sweep spacing aborts' 44 \
  'FAKE_NOW=1000; pulsed_sweep_at 1000 120 100 10,4,7 sweep'

# ...and the gated arm must NOT refuse the plan's own 133 ms actuator spacing,
# which is priced by the model gate and carries a full released Fusion poll.
#
# This pair exists because the bypass was applied to human_floor_check and
# missed pulsed_sweep_at, which reaches human_floor_abort directly. The gap was
# invisible here: the harness sets NIGHT6_LEFT=0, so every sweep assertion ran
# on the dormant arm and the gated one was never executed. It cost the first
# real Night 1 attempt, which aborted at exactly this line.
expect 'the gated route accepts the plan spacing it was priced at' 0 \
  'NIGHT6_LEFT=1; FAKE_NOW=1000; pulsed_sweep_at 1000 133 100 10,4,7 sweep'

# A humane sweep advances the tracker to its LAST slot: a press floor-spaced
# from the sweep's start but inside the floor of its last slot still aborts.
expect 'press too close after sweep tail aborts' 44 \
  "FAKE_NOW=1000; pulsed_sweep_at 1000 $FLOOR 100 10,4,7 sweep" \
  "FAKE_NOW=$((1000 + 2 * FLOOR + 200)); press_at $((1000 + 2 * FLOOR + 200)) 1 1 after"
expect 'press floor-spaced after sweep tail allowed' 0 \
  "FAKE_NOW=1000; pulsed_sweep_at 1000 $FLOOR 100 10,4,7 sweep" \
  "FAKE_NOW=$((1000 + 3 * FLOOR)); press_at $((1000 + 3 * FLOOR)) 1 1 after"

if [ "$failed" -gt 0 ]; then
  echo "$failed human-floor check(s) failed"
  exit 1
fi
echo "human floor: live gate verified at $FLOOR ms against the shipped primitives"
