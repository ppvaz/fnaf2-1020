import assert from 'node:assert/strict';
import { anchorNightRelease } from '../src/night-anchor.js';

/** A fake host clock: sleep advances it, a zero sleep costs one ms. */
function harness({ startMs, probes }) {
  const state = { t: startMs, releases: [], events: [], probeCalls: 0 };
  const options = {
    now: () => state.t,
    wallNow: () => 1_700_000_000_000 + state.t,
    sleep: async ms => { state.t += Math.max(1, ms); },
    release: () => state.releases.push(state.t),
    onEvent: event => state.events.push(event),
    probe: async () => {
      const next = probes[Math.min(state.probeCalls, probes.length - 1)];
      state.probeCalls += 1;
      state.t += 10;
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { state, options };
}
const sample = (onsetNs, { offsetMs = 5000, uncertaintyMs = 3 } = {}) => ({
  offsetMs, uncertaintyMs, rttMs: uncertaintyMs * 2,
  fields: onsetNs === undefined ? {} : { nightOnsetImageNs: onsetNs },
});

// Latched on the first read: the next whole second that clears the lead.
{
  const { state, options } = harness({ startMs: 6300, probes: [sample('1000000000')] });
  const result = await anchorNightRelease({ ...options, aimMs: 233, notBeforeHostMs: 0 });
  assert.equal(result.status, 'released');
  assert.equal(result.k, 1);
  assert.deepEqual(state.releases, [7233], 'released exactly once, on the aim, never early');
  assert.equal(result.releasedAimMs, 233);
  const scheduled = state.events.find(event => event.status === 'scheduled');
  assert.equal(scheduled.onsetHostMs, 6000);
  assert.ok(scheduled.leadMs >= 80);
}

// Not yet latched: keep reading inside the bound, then anchor.
{
  const { state, options } = harness({ startMs: 6300, probes: [sample('-1'), sample('-1'), sample('1000000000')] });
  const result = await anchorNightRelease({ ...options, aimMs: 233, notBeforeHostMs: 0 });
  assert.equal(result.status, 'released');
  assert.equal(state.probeCalls, 3);
  assert.equal(state.releases.length, 1);
  assert.equal(((state.releases[0] - 6000) % 1000 + 1000) % 1000, 233);
}

// Every refusal releases at once, exactly once, and says why.
const refusals = [
  ['onset-not-latched', [sample('-1')], {}],
  ['helper-has-no-onset', [sample(undefined)], {}],
  ['probe-failed', [new Error('adb forward refused')], {}],
  ['onset-malformed', [sample('nope')], {}],
  ['offset-uncertain', [sample('1000000000', { uncertaintyMs: 40 })], {}],
  ['onset-predates-intro', [sample('1000000000')], { notBeforeHostMs: 6200 }],
  ['onset-in-future', [sample('9000000000')], {}],
];
for (const [reason, probes, extra] of refusals) {
  const { state, options } = harness({ startMs: 6300, probes });
  const startedAt = state.t;
  const result = await anchorNightRelease({ ...options, aimMs: 233, notBeforeHostMs: 0, ...extra });
  assert.equal(result.status, 'unavailable', reason);
  assert.equal(result.reason, reason);
  assert.equal(state.releases.length, 1, `${reason} must still release the night once`);
  assert.ok(state.releases[0] - startedAt <= 1500 + 200, `${reason} must release inside the latch bound`);
  assert.equal(state.events.at(-1).reason, reason);
}

assert.rejects(() => anchorNightRelease({ probe: async () => ({}), release: () => {}, aimMs: 1000, notBeforeHostMs: 0 }), RangeError);

console.log('night anchor: aimed release, bounded latch wait, and every refusal releases once');
