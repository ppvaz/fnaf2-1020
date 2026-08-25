#!/bin/bash
# Mock regression for the runner's plan interpreter. No phone, no adb.
#
# The interpreter is the only part of the runner that decides *what* happens;
# everything else decides how. It parses a file the host pushes, so it can be
# run here against the real plan with the device primitives stubbed out, and
# the sequence of actions it produces compared with the plan it was given.
#
# This is the check that would have caught a cycle window off by one: the
# branch resumes at a fixed instruction index, and reading it wrong silently
# drops a monitor press or presses it twice.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
RUNNER="$HERE/trial-minus7.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/fnaf2-plan-interp.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

node "$HERE/recipe.mjs" --device-plan > "$TMP/plan.txt"

# Device constants come from the runner, never restated here: a stub that
# drifts from the value it stands in for tests the stub. Assigned outside any
# `||` list so an unbound one fails loudly rather than skipping an assertion.
runner_const() {
  rc_v="$(grep -m1 "^$1=" "$RUNNER" | cut -d= -f2)"
  case "$rc_v" in
    ''|*[!0-9]*) echo "the runner has no numeric $1" >&2; exit 1 ;;
  esac
  printf '%s\n' "$rc_v"
}
FUSION_POLL_MS="$(runner_const FUSION_POLL_MS)"
MIN_RELEASED_MS="$(runner_const MIN_RELEASED_MS)"
TAP_CONTACT_MS="$(runner_const TAP_CONTACT_MS)"
SWEEP_LIGHT_LEAD_MS="$(runner_const SWEEP_LIGHT_LEAD_MS)"
READ_CAPTURE_DELAY_MS="$(runner_const READ_CAPTURE_DELAY_MS)"

# Lift the interpreter out of the remote program. Extracting by name rather
# than copying keeps this honest: the test runs the shipped source, and a
# renamed function fails here instead of silently testing nothing.
extract() {
  awk -v fn="$1" '
    $0 ~ "^" fn "\\(\\) \\{" { inside = 1 }
    inside { print }
    inside && /^\}$/ { exit }
  ' "$RUNNER"
}

{
  echo 'set -eu'
  for fn in plan_control_xy plan_first_offset plan_step run_cycle \
            plan_span plan_emit run_macro; do
    body="$(extract "$fn")"
    [ -n "$body" ] || { echo "could not extract $fn from the runner" >&2; exit 1; }
    printf '%s\n' "$body"
  done
} > "$TMP/interp.sh"

{
  # The runner's own constants, so the stubs cannot drift from them.
  for c in FUSION_POLL_MS MIN_RELEASED_MS TAP_CONTACT_MS SWEEP_LIGHT_LEAD_MS \
           READ_CAPTURE_DELAY_MS; do
    eval "printf '%s=%s\\n' \"\$c\" \"\$$c\""
  done
} > "$TMP/harness.sh"
cat >> "$TMP/harness.sh" <<'HARNESS'
PLAN_FILE="$1"
SLIP=0
# The runner stamps its log lines from the device clock; BSD date has no %3N,
# and the wall clock is not what this test is about.
T0=0
date() { echo 1000; }
hid_mark() { :; }
READ_CAPTURE_DELAY_MS=200
# Coordinates are irrelevant here; only the control they resolve to matters.
MONITOR_X=1 MONITOR_Y=1 MASK_X=2 MASK_Y=2 WIND_X=3 WIND_Y=3
CAM04_X=4 CAM04_Y=4 CAM05_X=5 CAM05_Y=5 CAM07_X=7 CAM07_Y=7
CAM10_X=10 CAM10_Y=10 CAM11_X=11 CAM11_Y=11 HALL_X=99 HALL_Y=99

press_at()   { printf '%s tap %s\n' "$1" "$4"; }
hold_at()    { printf '%s hold %s %s\n' "$1" "$5" "$4"; }
light_down_at()                  { printf '%s light\n' "$1"; }
classify_left_and_queue_mask_at() { printf '%s classify gap=%s\n' "$1" "$2"; }
pulsed_sweep_at()                 { printf '%s sweep %s %s %s\n' "$1" "$2" "$3" "$4"; }
hall_reset_and_raise_at()         { printf '%s hallraise %s\n' "$1" "$2"; }

# Macro stubs. CLOCK is the hid process's own timeline: only hid_delay moves
# it, which is exactly the property the macro exists to exploit.
CLOCK=0
# AOSP's hid tool rejects `duration: 0` outright -- "Delay has missing or
# invalid duration" at Event$Builder.build -- and then *exits*. mksh loses the
# co-process, the next `print -p` fails, and the run aborts mid-cycle with the
# contacts it had already put down never released. That is a 0 ms two-contact
# touch that changes coordinates and vanishes: a drag, which is why night 22
# showed up as "fails to press hall light and moves the vision instead".
# A zero delay is not a no-op on the wire, so the emitter must never write one.
hid_delay() {
  [ "$1" -gt 0 ] || { printf 'FATAL: emitter wrote hid_delay %s\n' "$1"; exit 9; }
  CLOCK=$((CLOCK + $1))
}
hid_down()         { printf '%s down\n' "$CLOCK"; }
hid_release()      { printf '%s up\n' "$CLOCK"; }
hid_two_down()     { printf '%s two-down\n' "$CLOCK"; }
hid_second_up()    { printf '%s second-up\n' "$CLOCK"; }
pulsed_cam_burst() { printf '%s cam\n' "$CLOCK"; CLOCK=$((CLOCK + $3)); }
wait_until()       { printf 'wait %s\n' "$1"; }
HARNESS

run() {
  # shellcheck disable=SC1090
  bash -c "source '$TMP/harness.sh' '$TMP/plan.txt'; source '$TMP/interp.sh'; $1" \
    _ "$TMP/plan.txt"
}

fail() { printf 'FAIL: %b\n' "$1" >&2; exit 1; }

# The opening runs whole, at the offsets the plan carries. Derived from the
# plan, not transcribed: these numbers move whenever the emitter retimes
# anything -- anchoring the sweep's end rather than its start shifted this one
# by 7 ms -- and a transcribed copy just fails without saying anything useful.
# The stub prints a tap without its contact length, so match that shape.
got="$(run 'run_cycle opening 0 0 999')"
want="$(awk '/^#cycle opening/{a=1;next} /^#cycle/{a=0} a && NF {
    if ($2 == "tap") print $1, $2, $3; else print
  }' "$TMP/plan.txt")"
[ "$got" = "$want" ] || fail "opening cycle:\n$got\n--- want ---\n$want"

# The shared prefix stops at the read, before the branch is known.
got="$(run 'run_cycle clear 7000 0 2')"
want="$(printf '%s\n' '7000 tap monitor' '7367 light' '7567 classify gap=40')"
[ "$got" = "$want" ] || fail "shared prefix:\n$got\n--- want ---\n$want"

# The clear branch resumes after the plan's mask instruction, so the mask the
# driver presses off the classifier's answer is not pressed twice.
got="$(run 'run_cycle clear 7000 2 999')"
case "$got" in
  *"tap mask"*) fail "the clear branch re-pressed the mask:\n$got" ;;
esac
[ "$(printf '%s\n' "$got" | head -1)" = '8383 tap monitor' ] ||
  fail "clear branch starts at $(printf '%s\n' "$got" | head -1), want 8383 tap monitor"
printf '%s\n' "$got" | grep -q '10100 hold flash-hall 133' ||
  fail "the clear branch lost its hall flash:\n$got"

# The attack branch keeps its own mask, which is anchored rather than classifier-
# driven, so it resumes one instruction earlier.
got="$(run 'run_cycle attack 7000 2 999')"
[ "$(printf '%s\n' "$got" | head -1)" = '12917 tap mask' ] ||
  fail "attack branch starts at $(printf '%s\n' "$got" | head -1), want 12917 tap mask"
# Derived, not pinned: the emitter slides a raise earlier so the select after it
# clears MONITOR_ANIM_UP, so a literal here would break every time that
# relaxation does its job. What must hold is that the instruction survives the
# window with its hall pulse intact and at the offset the plan actually carries.
hallraise_at="$(awk '/^#cycle attack/{a=1;next} /^#cycle/{a=0} a && $2=="hallraise"{print $1; exit}' "$TMP/plan.txt")"
[ -n "$hallraise_at" ] || fail "the attack cycle has no hallraise in the plan"
printf '%s\n' "$got" | grep -q "$((7000 + hallraise_at)) hallraise 133" ||
  fail "the attack branch lost its two-contact hall raise (plan puts it at +$hallraise_at ms):\n$got"

# The epoch slip moves the opening's start but not the deadline its sweep is
# anchored to: the wind absorbs it, and the sweep stays put.
got="$(run 'SLIP=200; run_cycle opening 0 0 999')"
[ "$(printf '%s\n' "$got" | head -1)" = '383 tap monitor' ] ||
  fail "a 200 ms slip did not move the opening's first press"
printf '%s\n' "$got" | grep -q '^800 hold wind 5317$' ||
  fail "the opening's wind did not absorb the slip:\n$got"
# Derived, not transcribed: the emitter anchors each sweep's END, so its start
# moves whenever the spacing or the model's quantisation does. What must hold is
# that the slip does not move it at all.
sweep_at="$(awk '/^#cycle opening/{a=1;next} /^#cycle/{a=0} a && $2=="sweep"{print $1; exit}' "$TMP/plan.txt")"
printf '%s\n' "$got" | grep -q "^$sweep_at sweep" ||
  fail "the slip moved the sweep off its absolute deadline (plan puts it at +$sweep_at ms):\n$got"

# A plan the runner cannot execute must stop it, not be half-run.
printf '#cycle opening 7000\n0 teleport monitor 100\n' > "$TMP/bad.txt"
if bash -c "source '$TMP/harness.sh' '$TMP/bad.txt'; source '$TMP/interp.sh'; \
    PLAN_FILE='$TMP/bad.txt'; run_cycle opening 0 0 999" >/dev/null 2>&1; then
  fail 'an unknown instruction was accepted'
fi
printf '#cycle opening 7000\n0 tap doorbell 100\n' > "$TMP/bad2.txt"
if bash -c "source '$TMP/harness.sh' '$TMP/bad2.txt'; source '$TMP/interp.sh'; \
    PLAN_FILE='$TMP/bad2.txt'; run_cycle opening 0 0 999" >/dev/null 2>&1; then
  fail 'an unmapped control was accepted'
fi


# --- the macro path ----------------------------------------------------------
#
# The macro's whole claim is that the hid clock reproduces the plan's offsets.
# Check it against the plan rather than against transcribed numbers: every
# contact must go down exactly where the plan put it, relative to the window's
# wall-timed start.
expected_starts() {
  node -e '
    const { build, devicePlan, MODEL_SLOT_MS } = await import("./tools/device/recipe.mjs");
    const plan = devicePlan(build({ night: 6, sweepSlotMs: MODEL_SLOT_MS, maskMarginMs: 900,
                                    readLatencyMs: 550, hallPulseMs: 130, pilotOffset: 10 }));
    const lines = plan[process.argv[1]].slice(+process.argv[2]);
    const base = +lines[0].split(" ")[0];
    for (const l of lines) console.log(+l.split(" ")[0] - base);
  ' "$1" "$2"
}

for spec in "clear 2" "attack 2"; do
  set -- $spec
  cyc=$1; skip=$2
  out="$(run "run_macro $cyc 7000 $skip 999")"

  # The window is wall-timed once, at its first instruction, and waited out
  # once at the end. Nothing in between may consult the shell clock.
  waits="$(printf '%s\n' "$out" | grep -c '^wait ')"
  [ "$waits" -eq 2 ] ||
    fail "$cyc macro wall-times $waits boundaries; a macro may only anchor its start and wait itself out"

  # A sweep emits three cam bursts; only the first is an instruction start, so
  # collapse consecutive cams and keep every down.
  got="$(printf '%s\n' "$out" | grep -E '^[0-9]+ (down|cam)$' | node -e '
    const rows = require("fs").readFileSync(0, "utf8").trim().split("\n")
      .map(l => l.split(" "));
    const out = [];
    rows.forEach(([at, kind], i) => {
      if (kind === "cam" && i && rows[i - 1][1] === "cam") return;
      out.push(at);
    });
    console.log(out.join("\n"));
  ')"
  want="$(expected_starts "$cyc" "$skip")"
  [ "$got" = "$want" ] ||
    fail "$cyc macro contact starts:\n$got\n--- want (from the plan) ---\n$want"
done

# The floor: a window may not open inside a contact the shell is still
# holding. The whole macro shifts, so every released gap the plan guarantees is
# preserved -- shifting only the first instruction would eat the second.
out="$(run 'run_macro clear 7000 2 999 9000')"
first_wait="$(printf '%s\n' "$out" | grep -m1 '^wait ' | awk '{print $2}')"
[ "$first_wait" = 9000 ] ||
  fail "the floor did not move the window: first wait_until was $first_wait, want 9000"
last_wait="$(printf '%s\n' "$out" | grep '^wait ' | tail -1 | awk '{print $2}')"
# The 617 ms shift must carry through to the resync, or the shell writes the
# next anchor while the macro drains, and the resync adds FUSION_POLL_MS on top
# so the anchor's monitor press does not land on the sweep's final camera
# release -- two different buttons with no released time between them read as
# one finger moving, and the press never fires.
#
# The window's own end is derived, not transcribed. It was 5007 ms into a
# 5000 ms cycle while the emitter placed the sweep by its start; anchoring the
# sweep's END instead brought it to 5000, which is the seam overrun disappearing
# rather than a number to re-copy.
cycle_end="$(awk '/^#cycle clear/{a=1;next} /^#cycle/{a=0} a && NF {
    if ($2 == "sweep") e = $1 + 2*$3 + $4;
    else if ($2 == "tap" || $2 == "hold") e = $1 + $4;
    else if ($2 == "hall" || $2 == "hallraise") e = $1 + $3;
    else if ($2 == "read") e = $1 + $3 + $4 + 100;
  } END { print e }' "$TMP/plan.txt")"
want_resync=$((7000 + cycle_end + 617 + FUSION_POLL_MS))
[ "$last_wait" = "$want_resync" ] ||
  fail "the floor did not carry to the resync: last wait_until was $last_wait, want $want_resync"

# Without a floor the window opens where the plan says.
out="$(run 'run_macro clear 7000 2 999')"
first_wait="$(printf '%s\n' "$out" | grep -m1 '^wait ' | awk '{print $2}')"
[ "$first_wait" = 8383 ] ||
  fail "an unfloored window opened at $first_wait, want 8383"

# A macro must refuse the read rather than skip it: the classifier lives in the
# shell, and a silently dropped read blinds the BB branch.
if bash -c "source '$TMP/harness.sh' '$TMP/plan.txt'; source '$TMP/interp.sh'; \
    PLAN_FILE='$TMP/plan.txt'; SLIP=0; run_macro clear 7000 0 999" >/dev/null 2>&1; then
  fail 'a macro accepted a window containing the read'
fi

# A macro cannot absorb the epoch slip, and must say so rather than run late.
if bash -c "source '$TMP/harness.sh' '$TMP/plan.txt'; source '$TMP/interp.sh'; \
    PLAN_FILE='$TMP/plan.txt'; SLIP=200; run_macro clear 7000 2 999" >/dev/null 2>&1; then
  fail 'a macro ran with a nonzero epoch slip'
fi

echo 'plan interpreter checks passed (opening, prefix, both branches, epoch slip, refusals; macro timeline matches the plan)'
