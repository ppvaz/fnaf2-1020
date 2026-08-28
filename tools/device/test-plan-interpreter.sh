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
TMP="$(mktemp -d "${TMPDIR:-/tmp}/fnaf2-plan-interp.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# The DRIVER, assembled -- not the runner file. The program that runs on the
# phone used to be a heredoc inside trial.sh, so reading the runner was the
# only way to reach it. It is built from named parts under trial/ now, and this
# reads exactly what gets sent: a check that greps a source file can pass while
# the phone is sent something else.
RUNNER="$TMP/driver.sh"
bash "$HERE/trial/assemble.sh" > "$RUNNER"

node "$HERE/recipe.mjs" --device-plan > "$TMP/plan.txt"

# Device constants come from the assembled driver, never restated here: a stub that
# drifts from the value it stands in for tests the stub. Assigned outside any
# `||` list so an unbound one fails loudly rather than skipping an assertion.
runner_const() {
  # Every definition, not `grep -m1`.
  #
  # SWEEP_LIGHT_LEAD_MS was defined TWICE in the driver, each with its own
  # justification comment, and `-m1` asserted against the first while the
  # runtime used the second. Taking the first match cannot detect that; counting
  # them can, and a constant defined twice is a bug wherever it is found.
  rc_all="$(grep -c "^$1=" "$RUNNER" || true)"
  [ "$rc_all" -eq 1 ] || {
    echo "the driver defines $1 $rc_all times; it must be defined exactly once" >&2
    exit 1
  }
  rc_v="$(grep "^$1=" "$RUNNER" | cut -d= -f2)"
  case "$rc_v" in
    ''|*[!0-9]*) echo "the driver has no numeric $1" >&2; exit 1 ;;
  esac
  printf '%s\n' "$rc_v"
}
FUSION_POLL_MS="$(runner_const FUSION_POLL_MS)"
MIN_RELEASED_MS="$(runner_const MIN_RELEASED_MS)"
TAP_CONTACT_MS="$(runner_const TAP_CONTACT_MS)"
SWEEP_LIGHT_LEAD_MS="$(runner_const SWEEP_LIGHT_LEAD_MS)"
SWEEP_SELECT_MS="$(runner_const SWEEP_SELECT_MS)"
SWEEP_SETTLE_MS="$(runner_const SWEEP_SETTLE_MS)"
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
  for fn in plan_control_xy sweep_cam_ms sweep_cam_list sweep_last_contact \
            plan_first_offset plan_step run_cycle plan_span plan_emit run_macro; do
    body="$(extract "$fn")"
    [ -n "$body" ] || { echo "could not extract $fn from the runner" >&2; exit 1; }
    printf '%s\n' "$body"
  done
} > "$TMP/interp.sh"

{
  # The runner's own constants, so the stubs cannot drift from them.
  for c in FUSION_POLL_MS MIN_RELEASED_MS TAP_CONTACT_MS SWEEP_LIGHT_LEAD_MS \
           SWEEP_SELECT_MS SWEEP_SETTLE_MS READ_CAPTURE_DELAY_MS; do
    eval "printf '%s=%s\\n' \"\$c\" \"\$$c\""
  done
} > "$TMP/harness.sh"
cat >> "$TMP/harness.sh" <<'HARNESS'
PLAN_FILE="$1"
SLIP=0
# The runner reads the device's monotonic clock through now_rel, which is a
# fork-free `read < /proc/uptime`. macOS has no /proc, and the clock is not
# what this test is about: what matters is that a macro's offsets are relative,
# so a fixed answer is the right stub. It sets NOW_REL rather than echoing,
# exactly as the shipped helper does.
T0=0
T0_UP_MS=0
NOW_REL=1000
now_rel() { NOW_REL=1000; }
hid_mark() { :; }
READ_CAPTURE_DELAY_MS=200
# Coordinates are irrelevant here; only the control they resolve to matters.
MONITOR_X=1 MONITOR_Y=1 MASK_X=2 MASK_Y=2 WIND_X=3 WIND_Y=3
CAM04_X=4 CAM04_Y=4 CAM05_X=5 CAM05_Y=5 CAM07_X=7 CAM07_Y=7
CAM10_X=10 CAM10_Y=10 CAM11_X=11 CAM11_Y=11 HALL_X=99 HALL_Y=99

press_at()   { printf '%s tap %s\n' "$1" "$4"; }
hold_at()    { printf '%s hold %s %s\n' "$1" "$5" "$4"; }
# The real one records when the light actually went down, and plan_step places
# the capture from that rather than from the plan's offset. LIGHT_DOWN_SLIP
# stands in for the flip gate and the in-cycle correction, both of which move
# the light off its scheduled offset.
LIGHT_DOWN_SLIP=0
light_down_at() {
  LIGHT_DOWN_MS=$(($1 + LIGHT_DOWN_SLIP))
  printf '%s light\n' "$LIGHT_DOWN_MS"
}
classify_left_and_queue_mask_at() { printf '%s classify gap=%s\n' "$1" "$2"; }
pulsed_sweep_at()                 { printf '%s sweep %s %s %s\n' "$1" "$2" "$3" "$4"; }
hall_reset_and_raise_at()         { printf '%s hallraise %s\n' "$1" "$2"; }
mask_and_raise_at()               { printf '%s maskraise %s %s %s\n' "$1" "$2" "$3" "$4"; }

# Macro stubs. CLOCK is the hid process's own timeline: only hid_delay moves
# it, which is exactly the property the macro exists to exploit.
CLOCK=0
# AOSP's hid tool rejects `duration: 0` outright -- "Delay has missing or
# invalid duration" at Event$Builder.build -- and then *exits*. mksh loses the
# co-process, the next `print -p` fails, and the run aborts mid-cycle with the
# contacts it had already put down never released. That is a 0 ms two-contact
# touch that changes coordinates and vanishes: a drag, which is why night 6-22
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

# The device shell's arithmetic is 32-bit while epoch milliseconds are ~1.8e12.
# The helpers must keep that value as a string and only calculate on its
# seconds/millisecond components. This is the exact value the first real
# fork-free-cycle attempt wrapped to 1060733274.
epoch_math="$({
  extract epoch_sub_ms
  extract epoch_diff_ms
  printf '%s\n' \
    'epoch_sub_ms 1787767128564 154; printf "%s\\n" "$EPOCH_SUB_RESULT"' \
    'epoch_diff_ms 1787767128831 1787767128410; printf "%s\\n" "$EPOCH_DIFF_RESULT"'
} | bash)"
[ "$epoch_math" = $'1787767128410\n421' ] ||
  fail "epoch helper wrapped or miscomputed:\n$epoch_math"

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

# The clear branch resumes at the compound that takes the prophylactic mask off
# and raises after the measured-safe seam.
got="$(run 'run_cycle clear 7000 2 999')"
clear_maskraise="$(awk '/^#cycle clear/{a=1;next} /^#cycle/{a=0} a && $2=="maskraise"{print; exit}' "$TMP/plan.txt")"
set -- $clear_maskraise
[ "$(printf '%s\n' "$got" | head -1)" = "$((7000 + $1)) maskraise $3 $4 $5" ] ||
  fail "clear branch lost the maskraise compound:\n$got"
printf '%s\n' "$got" | grep -q '10100 hold flash-hall 133' ||
  fail "the clear branch lost its hall flash:\n$got"

# The attack branch keeps the read's mask through five ticks, then resumes at
# its mask-off + hall-raise compound.
got="$(run 'run_cycle attack 7000 2 999')"
attack_maskraise="$(awk '/^#cycle attack/{a=1;next} /^#cycle/{a=0} a && $2=="maskraise"{print; exit}' "$TMP/plan.txt")"
set -- $attack_maskraise
[ "$(printf '%s\n' "$got" | head -1)" = "$((7000 + $1)) maskraise $3 $4 $5" ] ||
  fail "attack branch lost the maskraise + hall compound:\n$got"

# The epoch slip moves the opening's start but not the deadline its sweep is
# anchored to: the wind absorbs it, and the sweep stays put.
got="$(run 'SLIP=200; run_cycle opening 0 0 999')"
[ "$(printf '%s\n' "$got" | head -1)" = '383 tap monitor' ] ||
  fail "a 200 ms slip did not move the opening's first press"
# Re-pinned 2026-08-27 (was 800/5317). RAISE_JITTER_MARGIN_MS moved the
# opening's CAM 11 park 36 ms later so it clears the monitor-raise animation
# under the model gate's own jitter, and the wind that follows pays for it.
# The 133 ms sweep begins 26 ms earlier while keeping its end fixed. makeRoom
# takes 16 ms from this hold to preserve a full 33 ms released approach, so the
# slip arithmetic is 636 + 200 = 836, 5465 - 200 = 5265.
printf '%s\n' "$got" | grep -q '^836 hold wind 5265$' ||
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
    for (const l of lines) {
      const p = l.split(" ");
      const at = +p[0] - base;
      console.log(at);
      if (p[1] === "maskraise") console.log(at + +p[2]);
    }
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

# The localized last-slot light contact: `10,4,7:67` lengthens only the final
# slot, so the runner's timeline span for that sweep must count the longer hold
# or the seam wait is written early. The geometry stays LIGHT_AFTER -- decided
# by the base contact (33) -- so the last slot costs select + settle + 67, not
# the legacy same-report 67.
la_base=$((2 * 100 + SWEEP_SELECT_MS + SWEEP_SETTLE_MS))
[ "$(run 'sweep_cam_list 10,4,7:67')" = '10,4,7' ] ||
  fail "sweep_cam_list did not strip the :N suffix"
[ "$(run 'sweep_cam_list 10,4,7')" = '10,4,7' ] ||
  fail "sweep_cam_list altered an unsuffixed token"
[ "$(run 'sweep_last_contact 10,4,7:67 33')" = 67 ] ||
  fail "sweep_last_contact did not read the :N override"
[ "$(run 'sweep_last_contact 10,4,7 33')" = 33 ] ||
  fail "sweep_last_contact did not fall back to the base contact"
[ "$(run 'plan_span sweep 100 33 10,4,7; printf %s "$PLAN_SPAN"')" = "$((la_base + 33))" ] ||
  fail "an unsuffixed sweep's span is not 2*spacing + select + settle + base"
[ "$(run 'plan_span sweep 100 33 10,4,7:67; printf %s "$PLAN_SPAN"')" = "$((la_base + 67))" ] ||
  fail "a localized sweep's span did not grow by the last slot's longer hold"

# The floor: a window may not open inside a contact the shell is still
# holding. The whole macro shifts, so every released gap the plan guarantees is
# preserved -- shifting only the first instruction would eat the second.
out="$(run 'run_macro clear 7000 2 999 9000')"
first_wait="$(printf '%s\n' "$out" | grep -m1 '^wait ' | awk '{print $2}')"
[ "$first_wait" = 9000 ] ||
  fail "the floor did not move the window: first wait_until was $first_wait, want 9000"
last_wait="$(printf '%s\n' "$out" | grep '^wait ' | tail -1 | awk '{print $2}')"
# The floor's derived shift must carry through to the seam wait, or the shell writes the
# next anchor while the macro drains. The wait adds FUSION_POLL_MS on top
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
    else if ($2 == "maskraise") e = $1 + $3 + ($4 == "hall" ? $5 : 100);
    else if ($2 == "read") e = $1 + $3 + $4 + 100;
  } END { print e }' "$TMP/plan.txt")"
first_branch_at="$(awk '/^#cycle clear/{a=1;next} /^#cycle/{a=0} a && NF { n++; if (n == 3) { print $1; exit } }' "$TMP/plan.txt")"
macro_shift=$((9000 - 7000 - first_branch_at))
want_seam=$((7000 + cycle_end + macro_shift + FUSION_POLL_MS))
[ "$last_wait" = "$want_seam" ] ||
  fail "the floor did not carry to the seam: last wait_until was $last_wait, want $want_seam"

# Without a floor the window opens where the plan says.
out="$(run 'run_macro clear 7000 2 999')"
first_wait="$(printf '%s\n' "$out" | grep -m1 '^wait ' | awk '{print $2}')"
want_first=$((7000 + first_branch_at))
[ "$first_wait" = "$want_first" ] ||
  fail "an unfloored window opened at $first_wait, want $want_first"

# A desync frame proves the mask press inside the read was rejected while the
# cams were up. Recovery keeps the maskraise row's 180 ms internal timing but
# must omit its first contact, or it would put the mask on and lose the raise.
out="$(run 'MASK_ALREADY_OFF=1; run_macro clear 7000 2 3')"
first_down="$(printf '%s\n' "$out" | awk '/^[0-9]+ down$/{print $1; exit}')"
[ "$first_down" = 180 ] ||
  fail "mask-already-off recovery pressed before the compound raise at 180 ms:\n$out"

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

# The capture is placed from the light, not from the plan. READ_CAPTURE_DELAY_MS
# is where in the vent-light ramp the classifier's frame lands, and moving it is
# what produced the `inside` and `unknown` misreads, so anything that moves the
# light has to carry the capture with it. With the correction moving the light
# by 400 ms this used to capture before the light was down.
got="$(run 'LIGHT_DOWN_SLIP=400; run_cycle clear 7000 0 2')"
want="$(printf '%s\n' '7000 tap monitor' '7767 light' "$((7767 + READ_CAPTURE_DELAY_MS)) classify gap=40")"
[ "$got" = "$want" ] || fail "a moved light did not carry its capture:\n$got\n--- want ---\n$want"


# --- the monitor-flip gate on the cue read -----------------------------------
#
# light_down_at samples the cue helper to check the anchor's monitor press
# landed. The sample is only worth anything once the flip it is checking has
# finished: night 6-38 sampled 214 ms into a 367 ms animation, believed the
# camera feed still on screen, pressed a monitor that was already coming down,
# and lost that press to the same flip -- the corrector caused the desync.
MONITOR_ANIM_DOWN_MS="$(runner_const MONITOR_ANIM_DOWN_MS)"
CUE_CAMS_UP_LUMA="$(runner_const CUE_CAMS_UP_LUMA)"
HUMAN_FLOOR_MS="$(runner_const HUMAN_FLOOR_MS)"

# The recovery check and the detection that triggers it must be the same ROI.
#
# They were two literals until 2026-08-26 and they were not even the same
# detector: the detector matched the camera map's selection highlight, the
# recovery read a cue-helper grey-cell count whose office band came from idle
# captures. Sharing one variable is what makes drift impossible, so assert both
# the single definition and the single literal.
roi_defs="$(grep -c "^CUE_MONITOR_ROI=" "$RUNNER" || true)"
[ "$roi_defs" -eq 1 ] || {
  echo "the driver defines CUE_MONITOR_ROI $roi_defs times; it must be exactly once" >&2
  exit 1
}
roi_uses="$(grep -c 'match \$CUE_MONITOR_ROI' "$RUNNER" || true)"
[ "$roi_uses" -eq 2 ] || {
  echo "CUE_MONITOR_ROI is matched on $roi_uses times; the desync detector and" >&2
  echo "the resync verification must both use it, and nothing else should" >&2
  exit 1
}
roi_literals="$(grep -v '^[[:space:]]*#' "$RUNNER" \
  | grep -c '1300 350 2300 950 4 100 255 100 255 0 99 30' || true)"
[ "$roi_literals" -eq 1 ] || {
  echo "the monitor ROI appears as a literal $roi_literals times; only its own" >&2
  echo "definition may spell it out -- a second copy is how the recovery drifted" >&2
  exit 1
}
# Comments may name it -- the retraction is meant to stay. Live code may not.
if grep -v '^[[:space:]]*#' "$RUNNER" | grep -q 'CUE_CAMS_UP_GREY'; then
  echo "CUE_CAMS_UP_GREY is refuted: office grey= reaches 180 on a live night" >&2
  echo "(77 reads, captures/n1-grey-2202-run.log). It must not be a threshold." >&2
  exit 1
fi

{
  echo 'set -eu'
  # The human floor ships inside press_at, so whichever arm of it applies runs
  # here too. Since 2026-08-26 that is an arm, not a scalar: the model gate
  # supersedes the floor on the gated plan path, and the floor is retained only
  # for dormant unpriced branches. Both arms are exercised below.
  for fn in human_floor_abort human_floor_check press_at light_down_at cams_still_up; do
    body="$(extract "$fn")"
    [ -n "$body" ] || { echo "could not extract $fn from the runner" >&2; exit 1; }
    printf '%s\n' "$body"
  done
} > "$TMP/light.sh"

{
  for c in FUSION_POLL_MS TAP_CONTACT_MS MONITOR_ANIM_DOWN_MS CUE_CAMS_UP_LUMA \
           HUMAN_FLOOR_MS; do
    eval "printf '%s=%s\\n' \"\$c\" \"\$$c\""
  done
} > "$TMP/light-harness.sh"
grep '^CUE_MONITOR_ROI=' "$RUNNER" >> "$TMP/light-harness.sh"
cat >> "$TMP/light-harness.sh" <<'HARNESS'
T0=0
T0_UP_MS=0
NOW=0
NOW_REL=0
# A clock the test drives. wait_until only ever moves it forward, which is the
# one property of the real one this depends on. The runner reads it through
# now_rel -- a fork-free `read < /proc/uptime` on the phone, which macOS does
# not have -- and now_rel assigns NOW_REL rather than echoing, so the stub does
# the same.
now_rel() { NOW_REL=$NOW; }
wait_until() { [ "$1" -le "$NOW" ] || NOW=$1; }
hid_mark() { :; }
hid_down() { printf '%s light-down\n' "$NOW"; }
input() { :; }
PRESS_MODE=tap
HID_MODE=0
# Which arm of human_floor_check applies. 1 is the shipped gated route, where
# the model gate has already priced the schedule and the scalar floor stands
# down -- the compound rows it emits contain deliberate 120/180 ms actuator
# boundaries that the old blanket check aborted on. 0 is a dormant unpriced
# branch, where the floor is still the only thing standing between the pilot
# and an inhuman input. Stubbed explicitly rather than defaulted: the runner
# takes this from argv, and a harness that let it go unbound would silently
# test whichever arm `set -eu` happened not to trip on.
NIGHT6_LEFT=1
CUE_PORT=1
CAM_LIGHT_X=1 CAM_LIGHT_Y=1 MONITOR_X=2 MONITOR_Y=2
LAST_PRESS_MS=0
LAST_MONITOR_PRESS_MS=-100000
LIGHT_DOWN_MS=0
HF_LAST_PRESS_MS=-100000
# 1 = the phone as measured below; 0 = the cams really are still up, because
# the press was lost.
CUE_HONEST=1
# 1 = the first sample is a saturated flash and the next one is the office, which
# is what every correction on file actually saw.
CUE_TRANSIENT=0
# The phone, as measured: while the flip is still running the helper reports
# the camera feed that is still on screen, and only afterwards the office.
# Across nights 6-36 to 6-38 the last such sample after a lowering press was +202 ms.
cue_snapshot() {
  printf '%s\n' "$NOW" >> "$CUE_LOG"
  if [ "$CUE_TRANSIENT" -eq 1 ]; then
    # A camera light pulse or a hall flash saturates the sensor pixel for one
    # sample. Steady cams-up is 225-250; 255 is the flash.
    #
    # The call count has to come off the log: the runner reads this through a
    # command substitution, so a shell variable incremented here dies with the
    # subshell and every call would look like the first.
    if [ "$(wc -l < "$CUE_LOG" | tr -d ' ')" -gt 1 ]; then
      printf 'OK luma=20 cam5=30 grey=145 ageUs=1500\n'
    else
      printf 'OK luma=255 cam5=30 grey=178 ageUs=1500\n'
    fi
    return 0
  fi
  if [ "$CUE_HONEST" -eq 1 ] && [ "$NOW" -ge $((LAST_MONITOR_PRESS_MS + 202)) ]; then
    printf 'OK luma=20 cam5=30 grey=145 ageUs=1500\n'
  else
    printf 'OK luma=228 cam5=30 grey=178 ageUs=1500\n'
  fi
}
HARNESS

light_run() {
  CUE_LOG="$TMP/cue.log"
  : > "$CUE_LOG"
  # shellcheck disable=SC1090
  CUE_LOG="$CUE_LOG" bash -c \
    "source '$TMP/light-harness.sh'; CUE_LOG='$CUE_LOG'; source '$TMP/light.sh'; $1"
}

# The anchor's press lands 132 ms late, as night 6-38's did, and the plan reads at
# +367 from the base. The sample must wait the flip out before it is believed,
# and then there is nothing to correct.
got="$(light_run 'NOW=12132; press_at 12000 2 2 monitor; light_down_at 12367 vent')"
sampled="$(cat "$TMP/cue.log")"
[ "$sampled" -ge $((12132 + MONITOR_ANIM_DOWN_MS)) ] ||
  fail "the cue was sampled at $sampled ms, inside the flip that started at 12132 ms"
case "$got" in
  *monitor-verify*) fail "a flip still rendering was corrected as a desync:\n$got" ;;
esac

# A real desync -- the cams are still up after the flip would have finished --
# is still corrected, and the light waits out the corrective flip.
got="$(light_run 'CUE_HONEST=0; NOW=12132; press_at 12000 2 2 monitor
                  light_down_at 12367 vent')"
case "$got" in
  *monitor-verify*) ;;
  *) fail "a genuine desync was not corrected:\n$got" ;;
esac
verify_at="$(printf '%s\n' "$got" | awk '/monitor-verify/{print $1}')"
light_at="$(printf '%s\n' "$got" | awk '/light-down/{print $1}')"
[ "$light_at" -ge $((verify_at + TAP_CONTACT_MS + MONITOR_ANIM_DOWN_MS)) ] ||
  fail "the vent light went down $((light_at - verify_at)) ms after the corrective press, inside its flip"

# The corrective press is REACTIVE: it is in no plan, so no plan gate prices
# it, and since the live floor stands down on the gated route (NIGHT6_LEFT=1)
# nothing prices it at runtime either. See ARCHITECTURE-AUDIT finding 8.
#
# It does clear the old 350 ms floor, but only because the corrector waits out
# MONITOR_ANIM_DOWN (367 ms) first -- a coincidence of the corrector's design,
# not a check. **Measured here: the gap is 400 ms against a 350 ms floor, so the
# margin is 50 ms.** That is thin enough to be worth a gate: shaving 51 ms off
# the corrector's wait would deliver, on the shipped route, a press that nothing
# in the system prices.
#
# Pin the coincidence. This asserts nothing about the runtime behaviour and
# changes none of it; it makes such a change fail HERE, on this machine,
# instead of on a phone at a press no instrument prices. If this ever goes red,
# the answer is to price reactive presses properly, not to lower the number.
verify_gap=$((verify_at - 12132))
[ "$verify_gap" -ge "$HUMAN_FLOOR_MS" ] ||
  fail "the reactive monitor-verify lands ${verify_gap} ms after the previous press, under the ${HUMAN_FLOOR_MS} ms floor that no longer runs on the gated route"

# A saturated single sample is a flash, not the cams. Steady cams-up sits at
# 225-250 (median 227 across nights 6-40 to 6-42) while 255 lasts one or two
# samples, and every correction on file fired on a 255. One reading cannot tell
# them apart, so the correction has to confirm before it spends a press.
got="$(light_run 'CUE_TRANSIENT=1; NOW=12132; press_at 12000 2 2 monitor
                  light_down_at 12367 vent')"
case "$got" in
  *monitor-verify*) fail "a one-sample flash was corrected as a desync:\n$got" ;;
esac
case "$got" in
  *"not correcting"*) ;;
  *) fail "the rejected transient was not reported:\n$got" ;;
esac

# With no monitor press yet -- the first read of a run -- there is no flip to
# wait for, and the read must not be held back by one.
got="$(light_run 'NOW=300; light_down_at 367 vent')"
[ "$(printf '%s\n' "$got" | awk '/light-down/{print $1}')" = 367 ] ||
  fail "the first read waited for a flip that never happened:\n$got"

# --- both arms of the human floor --------------------------------------------
#
# The floor stopped being a scalar on 2026-08-26: the model gate prices the
# emitted plan, so on the gated route (NIGHT6_LEFT=1) the floor stands down,
# and it is retained only for dormant unpriced branches (NIGHT6_LEFT=0). That
# bypass arrived with no test of either arm, and it broke this file by leaving
# NIGHT6_LEFT unbound under `set -eu`. Pin both directions, so neither a
# re-widened floor that aborts the shipped compound rows nor a floor quietly
# disabled everywhere passes here.
#
# Two presses one FUSION_POLL_MS apart: far inside HUMAN_FLOOR_MS, and the
# shape the plan's own compound rows have.
tight="NOW=1000; press_at 1000 2 2 monitor; NOW=$((1000 + FUSION_POLL_MS))
       press_at $((1000 + FUSION_POLL_MS)) 1 1 cam11"

if ! light_run "NIGHT6_LEFT=1; $tight" >/dev/null 2>&1; then
  fail 'the gated route aborted on its own compound spacing; the model gate, not the scalar floor, prices that plan'
fi

if got="$(light_run "NIGHT6_LEFT=0; $tight" 2>&1)"; then
  fail "a dormant unpriced branch delivered a ${FUSION_POLL_MS} ms gap with no floor:\n$got"
fi
case "$got" in
  *"HUMAN FLOOR"*"cam11"*) ;;
  *) fail "the dormant branch refused without naming the press or the floor:\n$got" ;;
esac

echo 'plan interpreter checks passed (opening, prefix, both branches, epoch slip, refusals; macro timeline matches the plan; the cue read waits out the monitor flip and confirms it before correcting)'

# --- cams_still_up: the resync verification ------------------------------
#
# What it verifies WITH changed twice on 2026-08-26, and the second change
# retracted the first.
#
# It read `luma` against 180, calibrated over 1818 samples of night 6-34 -- a
# route that sits on CAM 11 for its whole cams-up stretch. Reading all twelve
# cameras on the phone, luma clears 180 on CAM 11 alone, so the check was blind
# on three of the four cameras a desync can leave selected.
#
# It was then moved to the cue helper's `grey=` count against 159, on a claimed
# office band of 142-145. That band came from five idle captures on a parked
# device. The cleared run captures/n1-grey-2202-run.log carries `grey=` beside
# every office read: 77 reads, 138-180, median 151, and 21 of them at or above
# 159 -- 16 confident `empty` (an office frame by construction) and 5 on which
# `$CHECKER match` itself answered `cams=down`. The populations overlap
# completely; no line through `grey=` separates them. Each of those 21 would
# have sent `monitor-resync-2` into a monitor that was already down, RAISING it
# and manufacturing the desync the corrector exists to repair.
#
# It now asks the device-graded detector that fired in the first place, on a
# fresh frame. So this block stubs `screencap` and `$CHECKER` and pins the
# translation from the matcher's answers to the verdict.
csu() { # csu <checker-answer|SKIP> [empty-capture]
  light_run "export CSU_ANSWER='$1' CSU_EMPTY='${2:-0}'; cams_still_up"
}

cat >> "$TMP/light-harness.sh" <<'CSUHARNESS'
PIDFILE="$TMP_CSU/pid"
CAPTURE_LOCK="$TMP_CSU/lock"
# The phone's screencap, and the one failure mode that matters: a frame that
# never arrives must not read as "the monitor is up".
screencap() { [ "$CSU_EMPTY" = 1 ] || printf 'RAWFRAME'; }
CHECKER="$TMP_CSU/checker"
CSUHARNESS

mkdir -p "$TMP/csu"
cat > "$TMP/csu/checker" <<'CHECK'
#!/bin/sh
# The real screencheck: `match <roi...>` prints match|clear, or fails.
[ "$CSU_ANSWER" != FAIL ] || exit 3
printf '%s\n' "$CSU_ANSWER"
CHECK
chmod +x "$TMP/csu/checker"
export TMP_CSU="$TMP/csu"

case "$(csu match)" in
  '1 selection-highlight match') ;;
  *) echo "cams_still_up: a matched selection highlight must read still-up, got: $(csu match)" >&2; exit 1 ;;
esac
case "$(csu clear)" in
  '0 selection-highlight clear') ;;
  *) echo "cams_still_up: a clear ROI must read down, got: $(csu clear)" >&2; exit 1 ;;
esac
# Every non-answer is "not still up". An unreadable frame is not evidence that
# the monitor is up, and acting on it as evidence presses the monitor back up.
for bad in FAIL '' 'usage: screencheck'; do
  got="$(csu "$bad")"
  case "$got" in
    '0 selection-highlight unreadable') ;;
    *) echo "cams_still_up: checker answer '$bad' must not report still-up, got: $got" >&2; exit 1 ;;
  esac
done
# A capture that produced no bytes is the same class of non-evidence, and it is
# reported separately so a log can tell a blind check from a negative one.
got="$(csu match 1)"
case "$got" in
  '0 selection-highlight capture-failed') ;;
  *) echo "cams_still_up: an empty capture must not report still-up, got: $got" >&2; exit 1 ;;
esac
# The verification must ask the SAME region the detector fired on.
case "$(extract cams_still_up)" in
  *'match $CUE_MONITOR_ROI'*) ;;
  *) echo "cams_still_up must match on CUE_MONITOR_ROI, not its own region" >&2; exit 1 ;;
esac
echo "cams_still_up checks passed"
