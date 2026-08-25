// The runner must interpret the plan, not carry a second copy of it.
//
// The cycle table used to live twice: as the recipe and as hand-typed
// millisecond literals in the runner. Fixing one did not fix the other, and a
// wind lead corrected in the model still reached the phone as the old value --
// which the device's own HID trace then measured as 0 ms of released time
// before the sweep. An earlier version of this file compared the two copies.
// There is one copy now, so the check changed shape: the driver must contain
// no schedule of its own, and the plan it does execute must survive the night.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build, devicePlan, replay, DEVICE_SPACING_MS, MODEL_SLOT_MS } from './recipe.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'trial-minus7.sh'), 'utf8');
const check = (ok, message) => { if (!ok) throw new Error(message); };

// The guard for this mode and the driver for it are both `if NIGHT6_LEFT`;
// the driver is the later one, after the hid helpers.
const start = src.lastIndexOf('if [ "$NIGHT6_LEFT" -eq 1 ]; then');
const block = src.slice(start, src.indexOf('if [ "$HID_LEFT_SURVIVAL" -eq 1 ]; then', start));
check(block.includes('run_cycle'), 'could not find the NIGHT6_LEFT driver block');

// No schedule literals. The driver positions cycles; it does not time actions
// inside them. `base + N` is what a second copy of the table looks like.
const literals = [...block.matchAll(/^\s*(press_at|hold_at|pulsed_sweep_at|hall_reset_and_raise_at|light_down_at|classify_left_and_queue_mask_at)\s+\$\(\(base \+ \d+\)\)/gm)];
check(!literals.length,
  'the driver still schedules actions from its own millisecond literals:\n  ' +
  literals.map(m => m[0].trim()).join('\n  ') +
  '\nThose belong in the plan recipe.mjs emits.');

// The one departure from the plan that is real, so it is named rather than
// merely absent: the mute press precedes the plan's first cycle.
check(/press_at 0 "\$MUTE_X"/.test(block),
  'the driver must still mute before the opening; the plan does not carry it');
check(!/mask-on-bb/.test(block),
  'the BB branch must keep the read\'s prophylactic mask, not toggle it off');
check(/run_macro clear "\$base" 2 999/.test(block),
  'the clear branch must resume at instruction 3, the maskraise compound');

// A detector that recognises one way of being dead must never be the thing
// that says you are alive.
//
// The cue helper's death signature was measured on a single death and matches
// the static screen only. Wired as `if (static) gameover else night`, it
// returned "night" through the "Take cake to the children" minigame and a
// restarted "12:00 AM 6th Night" screen, so the pilot pressed into a dead game
// for over a minute and that wall time was reported as run length. The helper
// may only ADD a detection; screenstate stays the authority on whether a night
// is still running.
{
  const stateOnce = src.slice(src.indexOf('state_once() {'));
  const helperBranch = stateOnce.slice(0, stateOnce.indexOf('screenstate.py'));
  check(!/printf '%s\\n' "night"/.test(helperBranch),
    'the cue-helper branch of state_once must never vouch that the game is alive; ' +
    'it may print "gameover" and otherwise fall through to screenstate');
  check(/screenstate\.py/.test(stateOnce),
    'state_once must still consult screenstate, which classifies night/gameover/other');
}

// The runner must refuse to improvise when the plan did not arrive.
check(/\[ -s "\$PLAN_FILE" \] \|\|/.test(block),
  'the driver must refuse to run without a plan rather than fall back to a table');
check(/adb push "\$RUN_TMP\/device-plan.txt" "\$REMOTE_PLAN"/.test(src),
  'the host must push the plan the runner reads');
check(/recipe\.mjs" --device-plan/.test(src),
  'the plan the host pushes must be the one recipe.mjs emits');

// The prefix the driver runs before it knows the branch has to be the prefix
// both steady cycles actually share, and the branch has to resume at the right
// instruction. Off by one here silently drops a monitor press or repeats it.
const recipe = build({ night: 6, sweepSlotMs: MODEL_SLOT_MS, maskMarginMs: 900,
                       readLatencyMs: 550, hallPulseMs: 130, pilotOffset: 10 });
const plan = devicePlan(recipe);

check(plan.clear[2].split(' ')[1] === 'maskraise' &&
      plan.clear[2].split(' ')[3] === 'up',
  `clear instruction 3 must be mask-off + raise, but it is "${plan.clear[2]}"`);
check(plan.attack[2].split(' ')[1] === 'maskraise' &&
      plan.attack[2].split(' ')[3] === 'hall',
  `attack instruction 3 must be mask-off + hall raise, but it is "${plan.attack[2]}"`);

check(plan.clear.slice(0, 2).join('|') === plan.attack.slice(0, 2).join('|'),
  'the driver runs two instructions before branching, but the cycles differ there');
check(/run_cycle clear "\$base" 0 2/.test(block),
  'the driver must run the shared prefix from the clear cycle');
// Both the clear branch and the desync recovery resume at instruction 3, the
// maskraise compound. The recovery's retained camera frame proves its mask is
// already off, so it omits that toggle while preserving the compound's delay.
check(!/run_macro clear "\$base" 3 /.test(block),
  'no clear-cycle macro may skip instruction 3; that is the maskraise compound');
check((block.match(/run_macro clear "\$base" 2 999/g) || []).length === 2,
  'the clear branch and the desync recovery must both resume at maskraise');
check(/MASK_ALREADY_OFF=1\s+run_macro clear "\$base" 2 999[\s\S]*?MASK_ALREADY_OFF=0/.test(block),
  'desync recovery must omit the mask toggle its camera frame proves is already off');
check(/run_macro attack "\$base" 2 999/.test(block),
  'the attack branch must resume at its maskraise compound');

// Both branch macros must be floored. The resume offset is usually stale by
// the time the classifier answers (30-900 ms, worse after a flip-gate
// correction), and an unfloored macro runs uniformly late with rm_shift=0 --
// so the seam wait undershoots the still-running sweep and the next cycle's
// anchor is queue-serialized onto the sweep's tail, a real zero-gap no trace
// clock can see. Night 6-45 lost a monitor press to it every corrected cycle.
check(/run_macro clear "\$base" 2 999 \$\(\(actual \+ FUSION_POLL_MS\)\)/.test(block),
  'the clear branch macro has no floor: a stale resume offset becomes ' +
  'compression at the seam instead of rm_shift');
check(/run_macro attack "\$base" 2 999 \$\(\(actual \+ FUSION_POLL_MS\)\)/.test(block),
  'the attack branch macro has no floor past classification');

// A dark vent lamp is not an observation, so it must not be a verdict.
//
// The class was called `inside` and it ended the run. It was the vent light
// being off: across every labelled frame the LIGHT lamp inside the model's own
// ROI reads green-excess 104.0 on all 49 `empty`/`bb` frames and 0.2 on both
// frames the `inside` class was trained from, and night 6-41 died on it at
// 13.7 s -- before Balloon Boy's five five-second rolls could possibly have put
// him at 123. One frame cannot separate a dropped light press from marker 123,
// because g96/g301/g303 stop the vent lights answering once he is inside too.
// So the read fails closed like any other unreadable frame and the *streak*
// decides: a dropped press recovers on the next cycle, marker 123 never does.
const noLightCase = block.match(/^\s*nolight\\ \*\)([\s\S]*?)^\s*;;/m);
check(noLightCase, 'the driver has no branch for a `nolight` read; an unlit ' +
  'opening would fall through to the catch-all with no streak of its own');
check(/branch=attack/.test(noLightCase[1]),
  'a `nolight` read must fail closed to the mask: the opening might have him ' +
  'in it and the frame does not say');
check(/nolight_streak/.test(noLightCase[1]),
  'a `nolight` read must count consecutively; a single one is a dropped press');
check(/BB_EARLIEST_INSIDE_MS/.test(noLightCase[1]),
  'concluding Balloon Boy is at 123 must be gated on the earliest he could ' +
  'possibly be there, or a dropped press reads as the office again');
check(!/^\s*bbinside\\ \*\)/m.test(block),
  'the `bbinside` branch must be gone: no frame of Balloon Boy in the office ' +
  'was ever captured, so the class had no training data but unlit openings');

// The steady cycles' post-read windows carry the night: they run 83 times
// against the opening's once, and each wall-timed boundary re-rolls a 49-93 ms
// overshoot the route has only ~100 ms of total margin for. They go on the hid
// clock. The prefix cannot -- it contains the read -- and the opening keeps the
// stepped path because its epoch slip has to come out of a wind hold.
check(/run_cycle clear "\$base" 0 2/.test(block),
  'the shared prefix must be stepped: it contains the read');
check(/run_cycle opening 0 0 999/.test(block),
  'the opening must be stepped: a macro cannot absorb the epoch slip');
// The flick is one actuator row so human jitter shifts the two game inputs
// together and the HID macro preserves the measured-safe seam.
check(plan.clear[2].split(' ')[2] === '180' && plan.attack[2].split(' ')[2] === '180',
  'maskraise must preserve the 180 ms device-safe press-to-press gap');

// The desync recovery must close its loop, because the cause is the engine.
//
// `drop everything` is set every 10 s while an attacker waits at marker 122
// with the cams up (g718-721), on any attack start (g624) and on the Puppet's
// arrival (g574); g262 then lowers the monitor without a press. A recovery
// that assumes its own press landed is the same open-loop mistake at one
// remove -- night 6-43 stayed inverted through four recoveries at exactly the
// 10 s cadence. So after the resync press the runner reads the cams back
// through the cue helper and presses once more if they are still up, bounded
// at one retry so it never fights the engine over the toggle.
const resyncCase = src.match(/monitor-resync\b[\s\S]*?run_macro clear/);
check(resyncCase, 'the UP-DESYNCED recovery is gone');
check(/CUE_CAMS_UP_LUMA/.test(resyncCase[0]),
  'the resync press is not verified: a forcedown can spend it and the ' +
  'recovery resumes the schedule inverted');
check(/monitor-resync-2/.test(resyncCase[0]),
  'a resync that reads the cams still up must press once more');
check((resyncCase[0].match(/monitor-resync-2/g) || []).length === 1,
  'the resync retry must be bounded at one press');

// An office encounter darkens the lamp for two to three cycles while the mask
// clears it (night 6-43, Mangle). Only marker 123 never relights, so the
// streak that concludes BB is inside must outlast any encounter.
check(/^NOLIGHT_STREAK_MAX=5$/m.test(src),
  'NOLIGHT_STREAK_MAX must be 5: three dark reads span a single masked ' +
  'encounter and aborted a live night as "BB inside"');

// The seam. Both steady cycles end past their own length, so the runner has to
// leave the released gap before it writes the next cycle's anchor -- otherwise
// the anchor lands on the sweep's last camera release and the monitor press is
// read as a drag off the camera. test-recipe.mjs asserts the overrun is small
// enough to compensate; this asserts the runner actually compensates, and by a
// full Fusion poll rather than the auditor's bare floor.
check(/wait_until \$\(\(rm_base \+ rm_cursor \+ rm_shift \+ FUSION_POLL_MS\)\)/.test(src),
  "run_macro must leave a full Fusion poll after the macro before the shell " +
  'writes the next anchor; without it the cycle seam has no released time');
check(/^FUSION_POLL_MS=33$/m.test(src),
  'FUSION_POLL_MS must be defined as one 30 Hz poll');

// The plan is generated, which only means the emitter ran. Run the plan itself
// through the engine, instruction by instruction, and ask whether the night
// still survives -- an emitter bug and a hand edit both survive every check
// that reads the recipe, because they all read the same side of the loop.
let survived = 0, missedTotal = 0, detections = 0;
const RUNS = 300;
for (let seed = 1; seed <= RUNS; seed++) {
  const { sim, missed, detections: d } = replay(plan, { night: 6, seed });
  if (sim.won) survived++;
  missedTotal += missed;
  detections += d;
}

// Restoring the Golden Freddy flick must restore the full exact-model clear.
// The human gate prices timing error separately; this gate says the emitted
// instruction semantics still reproduce the policy they came from.
check(missedTotal === 0, `the plan missed BB ${missedTotal} times`);
check(survived === RUNS,
  `the restored Golden Freddy plan clears ${survived}/${RUNS}, not every exact run`);

console.log(`runner interprets the plan: no schedule literals in the driver; ` +
  `the plan replays ${survived}/${RUNS} with ${detections} BB responses and no misses`);
