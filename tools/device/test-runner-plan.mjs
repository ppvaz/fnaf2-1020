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

// The two departures from the plan that are real, so they are named rather
// than merely absent: the mute press precedes the plan's first cycle, and the
// clear cycle's mask comes off the classifier's answer instead of the anchor.
check(/press_at 0 "\$MUTE_X"/.test(block),
  'the driver must still mute before the opening; the plan does not carry it');
// Golden Freddy is ignored on night 6 for now, so the clear cycle carries no
// mask at all and the runner's one departure from the plan is the BB mask-on.
check(/press_at \$\(\(actual \+ FUSION_POLL_MS\)\) "\$MASK_X" "\$MASK_Y" mask-on-bb/.test(block),
  "the BB branch must put the mask on off the classifier's answer");
check(/run_macro clear "\$base" 2 999/.test(block),
  'the clear branch must resume at instruction 3, the monitor raise');
// The floor that used to guard the clear branch's mask contact is gone with the
// mask: night 6-22's trace measured 0 ms released between that mask and the
// monitor raise, and the fix was to floor the macro past it. There is no mask
// in the clear cycle now, so the macro opens where the plan says. The BB branch
// keeps a mask and is the only place that ordering still matters.

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

check(!plan.clear.some(l => l.includes('tap mask')),
  'the clear cycle must carry no mask while Golden Freddy is ignored');

check(plan.clear.slice(0, 2).join('|') === plan.attack.slice(0, 2).join('|'),
  'the driver runs two instructions before branching, but the cycles differ there');
check(/run_cycle clear "\$base" 0 2/.test(block),
  'the driver must run the shared prefix from the clear cycle');
// Both the clear branch and the desync recovery resume at instruction 3, the
// monitor raise. There is no mask instruction in the clear cycle to skip any
// more, and skipping one anyway drops the raise itself: that inverted the very
// parity the recovery exists to repair and made night 6-33 desync harder on every
// attempt. Assert that no clear-cycle window starts at 3.
check(!/run_macro clear "\$base" 3 /.test(block),
  'no clear-cycle macro may skip instruction 3; that is the monitor raise');
check((block.match(/run_macro clear "\$base" 2 999/g) || []).length === 2,
  'the clear branch and the desync recovery must both resume at the monitor raise');
check(/run_macro attack "\$base" 2 999/.test(block),
  'the attack branch must resume at its own mask instruction');

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
// With the Golden Freddy flick dropped, instruction 3 of the clear cycle is the
// monitor raise, not a mask -- which is exactly why the branch resumes at 2 and
// not 3. Asserting the shape here keeps the two in step: if the flick ever
// comes back, this fails before the runner silently skips the raise.
check(plan.clear[2].split(' ').slice(1).join(' ') === 'tap monitor 100',
  `the clear branch resumes at instruction 3, which must be the monitor raise, but it is "${plan.clear[2]}"`);
check(plan.attack[2].split(' ')[1] === 'tap',
  `the attack branch resumes at instruction 3, but it is "${plan.attack[2]}"`);

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
let survived = 0, missedTotal = 0, detections = 0, earliestDeath = Infinity;
const RUNS = 300;
for (let seed = 1; seed <= RUNS; seed++) {
  const { sim, missed, detections: d } = replay(plan, { night: 6, seed });
  if (sim.won) survived++;
  else earliestDeath = Math.min(earliestDeath, sim.death.t);
  missedTotal += missed;
  detections += d;
}

// This deliberately no longer asserts a full clear.
//
// Golden Freddy is ignored on night 6 (see recipe.mjs), so the plan loses the
// runs where he is in the office at a monitor raise. That is a priced trade,
// not a regression: with the flick the plan is 1000/1000, without it 478/1000,
// and EVERY loss is "raised the monitor with Golden Freddy in the office" after
// the 2 AM step-up. What must still hold is the part the trade did not buy.
check(missedTotal === 0, `the plan missed BB ${missedTotal} times`);
// 2 AM is 140 s in. Nothing may die before it: if something does, the loss is
// no longer Golden Freddy's step-up and the trade has stopped being the one
// that was measured.
check(earliestDeath > 140,
  `a run died at ${earliestDeath.toFixed(0)} s, before the 2 AM step-up at 140 s; ` +
  'ignoring Golden Freddy was priced on every loss arriving after it');
// And the clear rate must not quietly rot below what the trade was priced at.
check(survived >= RUNS * 0.40,
  `the plan clears ${survived}/${RUNS}; ignoring Golden Freddy was priced at ` +
  'about 478/1000, so anything under 40% is a different failure');

console.log(`runner interprets the plan: no schedule literals in the driver; ` +
  `the plan replays ${survived}/${RUNS} with ${detections} BB responses and no misses`);
