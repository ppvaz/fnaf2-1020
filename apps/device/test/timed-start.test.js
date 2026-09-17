import assert from 'node:assert/strict';
import { phoneWallAt, planTimedStart, waitUntilHostMs, SEED_PERIOD_MS } from '../src/timed-start.js';
import { timedStartRefusal, MENU_ACTIVATION_SETTLE_MS } from '../src/modern-campaign-ports.js';

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
assert.equal(timedStartRefusal({ targetName: 'sixthNight', stateAfterPresses: 'night', residueMs: 20000 }), null,
  'a press on the residue started the night, so nothing is refused');
assert.equal(timedStartRefusal({ targetName: 'sixthNight', stateAfterPresses: 'intro', residueMs: 20000 }), null,
  'the intro counts as left the title');
assert.equal(timedStartRefusal({ targetName: 'sixthNight', stateAfterPresses: 'title', residueMs: null }), null,
  'no residue requested, nothing to refuse');
assert.equal(timedStartRefusal({ targetName: 'customNight', stateAfterPresses: 'title', residueMs: 20000 }), null,
  'Custom Night times its Start tap, not the menu press');
assert.match(timedStartRefusal({ targetName: 'sixthNight', stateAfterPresses: 'title', residueMs: 20000 }) ?? '',
  /two presses on the residue left the game on the title/, 'a timed story start never falls back to an untimed tap');
assert.match(timedStartRefusal({ targetName: 'continue', stateAfterPresses: 'title', residueMs: 0 }) ?? '',
  /timed continue start refused/, 'residue 0 is a request, not an absence');
assert.ok(MENU_ACTIVATION_SETTLE_MS > 600,
  'a press gets longer than the 0.6 s press-to-office transition before the state is read');
console.log('timed start: phone wall mapping, residue plan, host wait, and the story-night activating press');
