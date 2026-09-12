import assert from 'node:assert/strict';
import { anchorNightRelease } from '../src/night-anchor.js';

// Fake host clock in ms. The helper's device clock is host - 5000; the night's
// onset is at host 10000 (device 5000). The latch reads -1 until host 10500
// (its 500 ms hold), then the onset.
const OFFSET_MS = 5000;
const ONSET_HOST_MS = 10000;
const ns = hostMs => String(Math.round((hostMs - OFFSET_MS) * 1e6));

function harness({ startMs = 8000, authorizeAt, latchAt = ONSET_HOST_MS + 500, onsetHostMs = ONSET_HOST_MS,
  field = 'present', readError = null, uncertaintyMs = 3, staleUntil = null } = {}) {
  const state = { t: startMs, releases: [], events: [], reads: 0 };
  const fields = () => {
    if (field === 'absent') return {};
    if (field === 'malformed') return { nightOnsetImageNs: 'nope' };
    // An earlier night's onset: a real (positive) device time from before the intro began.
    if (staleUntil !== null && state.t < staleUntil) return { nightOnsetImageNs: ns(6000) };
    return { nightOnsetImageNs: state.t >= latchAt ? ns(onsetHostMs) : '-1' };
  };
  const sample = () => ({ offsetMs: OFFSET_MS, uncertaintyMs, rttMs: uncertaintyMs * 2, fields: fields() });
  const options = {
    now: () => state.t,
    wallNow: () => 1_700_000_000_000 + state.t,
    sleep: async ms => { state.t += Math.max(1, ms); },
    release: () => state.releases.push(state.t),
    onEvent: event => state.events.push(event),
    clock: {
      read: async () => { state.reads += 1; state.t += 10; if (readError) throw readError; return sample(); },
      probe: async () => { state.t += 170; if (readError) throw readError; return sample(); },
    },
    authorization: {
      isAuthorized: () => state.t >= authorizeAt,
      authorizedAt: () => state.t >= authorizeAt ? authorizeAt : null,
      whenAuthorized: async () => { if (state.t < authorizeAt) state.t = authorizeAt; return authorizeAt; },
    },
    aimMs: 233, maxK: 2, notBeforeHostMs: startMs,
  };
  return { state, options };
}
const released = state => state.events.find(event => event.status === 'released');

// The measured case: latch at +500 ms, authorization at +1953 ms. The plan is
// made from the latch; k=0 (+233) and k=1 (+1233) pass unauthorized; k=2 fires.
{
  const { state, options } = harness({ authorizeAt: ONSET_HOST_MS + 1953 });
  const result = await anchorNightRelease(options);
  assert.equal(result.status, 'released');
  assert.equal(result.k, 2);
  assert.deepEqual(state.releases, [ONSET_HOST_MS + 2233]);
  assert.equal(released(state).releasedAimMs, 233);
  assert.equal(state.events.filter(event => event.status === 'skipped').length, 1,
    'k=0 is already behind the latch read at +510 ms, so only k=1 is skipped');
  const scheduled = state.events.find(event => event.status === 'scheduled');
  assert.deepEqual(scheduled.candidates.map(candidate => candidate.k), [1, 2]);
  assert.equal(released(state).authorizedAfterOnsetMs, 1953, 'the fired k must say when authorization resolved');
}

// A quick authorization takes the earliest clean second.
{
  const { state, options } = harness({ authorizeAt: ONSET_HOST_MS + 900 });
  const result = await anchorNightRelease(options);
  assert.equal(result.k, 1);
  assert.deepEqual(state.releases, [ONSET_HOST_MS + 1233]);
}

// Authorization after the last clean candidate: release at authorization, unanchored.
{
  const { state, options } = harness({ authorizeAt: ONSET_HOST_MS + 2500 });
  const result = await anchorNightRelease(options);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'authorization-late');
  assert.deepEqual(state.releases, [ONSET_HOST_MS + 2500]);
  assert.equal(state.events.at(-1).status, 'released-unanchored');
}

// A stale onset from an earlier night is not this night's: keep polling for the fresh one.
{
  const { state, options } = harness({ authorizeAt: ONSET_HOST_MS + 1953, staleUntil: ONSET_HOST_MS + 400 });
  const result = await anchorNightRelease(options);
  assert.equal(result.k, 2);
  assert.deepEqual(state.releases, [ONSET_HOST_MS + 2233]);
}

// Every refusal releases exactly once, and never before authorization.
const refusals = [
  ['onset-not-latched', { latchAt: Infinity }],
  ['helper-has-no-onset', { field: 'absent' }],
  ['onset-malformed', { field: 'malformed' }],
  ['probe-failed', { readError: new Error('forward refused') }],
  ['offset-uncertain', { uncertaintyMs: 40 }],
  ['onset-predates-intro', { staleUntil: Infinity }],
  ['onset-in-future', { onsetHostMs: ONSET_HOST_MS + 60000 }],
  // The latch is first readable 2.3 s after the onset: k=3 would be needed.
  ['k-unreachable', { latchAt: ONSET_HOST_MS + 2300 }],
];
for (const [reason, extra] of refusals) {
  const authorizeAt = ONSET_HOST_MS + 1953;
  const { state, options } = harness({ authorizeAt, ...extra });
  const result = await anchorNightRelease(options);
  assert.equal(result.status, 'unavailable', reason);
  assert.equal(result.reason, reason, reason);
  assert.equal(state.releases.length, 1, `${reason} must still release the night once`);
  assert.ok(state.releases[0] >= authorizeAt, `${reason} must never release before authorization`);
  assert.ok(state.releases[0] <= authorizeAt + 1500 + 250, `${reason} must release within the latch grace`);
}

// The invariant across the whole authorization range: never early, always once.
for (let authorizeOffset = 0; authorizeOffset <= 4000; authorizeOffset += 137) {
  const authorizeAt = ONSET_HOST_MS + authorizeOffset;
  const { state, options } = harness({ authorizeAt });
  const result = await anchorNightRelease(options);
  assert.equal(state.releases.length, 1);
  assert.ok(state.releases[0] >= authorizeAt, `authorization at +${authorizeOffset} released early`);
  if (result.status === 'released') {
    assert.ok(result.k <= 2);
    assert.equal(Math.round(((state.releases[0] - ONSET_HOST_MS) % 1000)), 233);
  }
}

await assert.rejects(() => anchorNightRelease({ ...harness({ authorizeAt: 0 }).options, aimMs: 1000 }), RangeError);
await assert.rejects(() => anchorNightRelease({ ...harness({ authorizeAt: 0 }).options, maxK: undefined }), /maxK/);

console.log('night anchor: plans from the latch, fires only once authorized, k cap, and every refusal releases once');
