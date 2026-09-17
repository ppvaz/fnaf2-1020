import assert from 'node:assert/strict';
import { phoneWallAt, planTimedStart, waitUntilHostMs, SEED_PERIOD_MS } from '../src/timed-start.js';
import { timedStartHeld, PRESS_TO_OFFICE_MS } from '../src/modern-campaign-ports.js';

// Helper sample: snapshot at device mono 5000 ms, host perf = device mono + 1000, wall 1 789 431 000 000 at the snapshot.
const sample = { offsetMs: 1000, fields: { snapshotNs: String(5000n * 1000000n), wallMs: '1789431000000' } };
assert.equal(phoneWallAt(sample, 6000), 1789431000000, 'the snapshot instant maps to its own wall read');
assert.equal(phoneWallAt(sample, 6250), 1789431000250, 'wall time advances with host time');
assert.throws(() => phoneWallAt({ offsetMs: 0, fields: { snapshotNs: '1' } }, 0), /predates the wall-clock stamp/);

{
  const residue = (1789431000000 + 4000) % SEED_PERIOD_MS;
  const plan = planTimedStart({ sample, residueMs: residue, nowHostMs: 6000, minLeadMs: 1500 });
  assert.equal(plan.targetPhoneWallMs % SEED_PERIOD_MS, residue, 'the target lands on the residue');
  assert.equal(plan.waitMs, 4000, 'the nearest residue 4 s ahead is taken');
  assert.equal(plan.targetHostMs, 10000);
}
{
  const residue = (1789431000000 + 1000) % SEED_PERIOD_MS;   // only 1 s ahead: inside the lead, so the next period
  const plan = planTimedStart({ sample, residueMs: residue, nowHostMs: 6000, minLeadMs: 1500 });
  assert.equal(plan.waitMs, 1000 + SEED_PERIOD_MS, 'a residue inside the lead rolls to the next 65 536 ms');
  assert.ok(plan.waitMs <= SEED_PERIOD_MS + 1500);
}
assert.throws(() => planTimedStart({ sample, residueMs: 65536, nowHostMs: 0 }), /0\.\.65535/);
assert.throws(() => planTimedStart({ sample, residueMs: 1.5, nowHostMs: 0 }), /integer/);
{
  // The fake clock advances 0.25 ms per read so the final spin terminates, as performance.now() does.
  let t = 0;
  const fired = await waitUntilHostMs(100, { now: () => (t += 0.25), sleep: async ms => { t += ms; } });
  assert.ok(fired >= 100 && fired < 104, `fired at ${fired}`);
}
console.log('timed start: phone wall mapping, residue planning with the lead roll-over, and the wait');

// A story night's activating press is the one that loads the office frame, so it carries the
// timing; Custom Night times its own Start tap. A timed start never falls back to an untimed tap.
// Whether the timed press was the one that started the night is read back from the seed, not
// guessed while the menu phase is open: holding that phase across the office load is what made
// the strict anchor refuse twin-01 twice on 2026-09-17.
{
  const planned = 1789609004576;
  assert.equal(timedStartHeld({ plannedPhoneWallMs: planned, seedPhoneWallMs: planned + 3566 }).held, true,
    'a seed 3.57 s after the planned press is that press\'s night');
  assert.equal(timedStartHeld({ plannedPhoneWallMs: planned, seedPhoneWallMs: planned + 1900 }).held, true,
    'so is one 1.9 s after it');
  const early = timedStartHeld({ plannedPhoneWallMs: planned, seedPhoneWallMs: planned - 15410 });
  assert.equal(early.held, false, 'a seed before the planned press cannot be its night');
  assert.match(early.reason, /sooner than any office load/);
  const late = timedStartHeld({ plannedPhoneWallMs: planned, seedPhoneWallMs: planned + 12000 });
  assert.equal(late.held, false, 'a seed 12 s later belongs to some other press');
  assert.match(late.reason, /too late to be its night/);
  assert.equal(timedStartHeld({ plannedPhoneWallMs: null, seedPhoneWallMs: planned }).held, false,
    'an untimed run holds nothing');
  assert.ok(PRESS_TO_OFFICE_MS[0] < PRESS_TO_OFFICE_MS[1], 'the measured window is a range');
}
console.log('timed start: phone wall mapping, residue plan, host wait, and the seed-side check that the timed press started the night');
