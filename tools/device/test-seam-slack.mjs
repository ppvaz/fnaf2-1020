#!/usr/bin/env node
// Refuse a plan that only just clears a device timing floor, and refuse a floor
// that was calibrated to the route instead of to its own measurement.
//
// WHY THIS EXISTS. `artifact-commands.mjs` already refuses a mask press that
// lands inside the monitor-down animation. It never fired for the Night 5
// route, because that route presses the mask at +400 ms and the floor is
// MONITOR_MASK_READY_MS = 400: `400 < 400` is false, so the plan compiled in
// silence. The floor's own comment says it was set to "the +400 ms timing used
// by the Night 5 route", and test-artifact-animation-gates.mjs then pinned
// that boundary as correct -- so the one check that could have caught this was
// calibrated to accept it, and a test protected the calibration.
//
// On the phone that zero cost about one cycle in eight: the mask press was
// graded MISSING with the monitor observably down, and every corrected cycle
// handed a vent occupant a free pass (docs/evidence/night5-mask-tick-budget-*).
//
// A floor with no margin is a floor that documents the status quo. Two things
// are checked here, and both are about margin rather than legality:
//
//   1. every compiled plan clears every timing floor by at least the jitter
//      allowance, not by zero;
//   2. every floor that derives from a measurement stands at least the jitter
//      allowance above that measurement.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileArtifactPlans, SEAM_FLOORS } from './artifact-commands.mjs';
import { parsePlan, validateWinner, STRATEGY_REGISTRY } from './bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// One Fusion poll, and two engine frames at 60 fps. The monitor-down animation
// is 22 frames, so two frames of frame-rate wobble is the smallest error that
// can move a press across a floor -- and it is the error the device showed.
// This is the same quantum the repository already treats as the contact floor;
// it is deliberately not a new number.
export const SEAM_JITTER_ALLOWANCE_MS = 33;

let failed = 0;
const fail = message => { failed += 1; process.stdout.write(`  FAIL ${message}\n`); };

// --- 1. floors must stand above their own measurement ----------------------
{
  const measured = SEAM_FLOORS.maskButtonFullyVisibleAfterMonitorDownMs;
  const floor = SEAM_FLOORS.monitorMaskReadyMs;
  const required = measured + SEAM_JITTER_ALLOWANCE_MS;
  process.stdout.write(
    `mask-after-monitor-down floor ${floor} ms vs measured full visibility ` +
    `${measured} ms (needs >= ${required} ms)\n`);
  if (floor < required)
    fail(`MONITOR_MASK_READY_MS is ${floor} ms, only ${(floor - measured).toFixed(1)} ms past the ` +
      `measured ~${measured} ms full-visibility point. A press there is inside the fade-in the ` +
      `same trace recorded (absent to 322 ms, faint at ~337 ms). Raise the floor to ` +
      `>= ${required} ms and move any route that no longer compiles.`);
}

// --- 2. every shipped plan must clear every floor by the allowance ----------
const winners = readdirSync(HERE)
  .filter(name => name.startsWith('campaign-') && name.endsWith('-winner.json'))
  .sort();
if (!winners.length) fail('no shipped winner was found to audit');

const profile = JSON.parse(readFileSync(
  join(HERE, '../../apps/device/profiles/hid-mediaprojection.json'), 'utf8'));

for (const file of winners) {
  const winner = validateWinner(JSON.parse(readFileSync(join(HERE, file), 'utf8')));
  const emit = STRATEGY_REGISTRY[winner.strategy]?.emit;
  if (typeof emit !== 'function') { fail(`${file}: no emitter for ${winner.strategy}`); continue; }
  const plans = winner.nights.map(night => ({
    night, policy: winner.strategy, text: emit(winner, night).text,
  }));
  let compiled;
  try { compiled = compileArtifactPlans(plans, parsePlan, profile); }
  catch (error) { fail(`${file}: ${error.message}`); continue; }
  for (const plan of compiled) {
    const tight = (plan.seams ?? []).filter(s => s.slackMs < SEAM_JITTER_ALLOWANCE_MS)
      .sort((a, b) => a.slackMs - b.slackMs);
    const worst = (plan.seams ?? []).reduce((low, s) =>
      (low === null || s.slackMs < low.slackMs ? s : low), null);
    process.stdout.write(`${file} night ${plan.night}: ${(plan.seams ?? []).length} gated rows, ` +
      `worst slack ${worst ? `${worst.slackMs} ms (${worst.relation} at +${worst.atMs})` : 'n/a'}\n`);
    for (const s of tight)
      fail(`${file} night ${plan.night}: ${s.kind} at +${s.atMs} ms clears the ${s.relation} ` +
        `floor of ${s.floorMs} ms by only ${s.slackMs} ms (gap ${s.gapMs} ms); ` +
        `needs >= ${SEAM_JITTER_ALLOWANCE_MS} ms`);
  }
}

if (failed) {
  process.stdout.write(`\nseam slack: ${failed} zero-or-thin margin(s). These are not style ` +
    'findings: each one is a press the phone can lose to a frame of jitter.\n');
  process.exit(1);
}
process.stdout.write('seam slack: every floor stands above its measurement and every shipped ' +
  `plan clears every timing floor by at least ${SEAM_JITTER_ALLOWANCE_MS} ms\n`);
