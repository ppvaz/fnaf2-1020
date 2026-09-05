/** Calibration orchestration conformance. All inputs are synthetic; nothing
 * here measures a handset, a game frame, input acceptance, or loss rate. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { composeSeamFixture } from '../src/calibration-fixture.js';
import { validateSeamSpec, seamBlock } from '../src/seam-calibration.js';
import { createActuatorMcp } from '../src/mcp.js';
import { mapClockInterval } from '@fnaf2-1020/adapters';

const profile = JSON.parse(await readFile(new URL('../profiles/fixture-hid-screencap.json', import.meta.url), 'utf8'));
const spec = JSON.parse(await readFile(new URL('../fixtures/seam-calibration.json', import.meta.url), 'utf8'));
const artifactRoot = await mkdtemp(join(tmpdir(), 'fnaf2-seam-contract-'));
const make = () => composeSeamFixture({ profile, artifactRoot });
const run = async (fixture, protocol = spec) => {
  fixture.service.startSession();
  return fixture.service.executeCalibration(protocol);
};
const inspect = (fixture, transform) => {
  const detect = fixture.detector.detect.bind(fixture.detector);
  let reads = 0;
  fixture.detector.detect = raw => transform(detect(raw), ++reads);
};
const refused = async (mutate, reason, blocks = 0) => {
  const fixture = make();
  mutate(fixture);
  const result = await run(fixture);
  assert.equal(result.outcome, 'ABORTED', reason.toString());
  assert.equal(result.calibration.calibration, 'UNVERIFIED');
  assert.match(result.calibration.reason, reason);
  assert.equal(fixture.actuator.blocks.length, blocks);
  assert.equal(fixture.actuator.aborts, 1);
  assert.equal(fixture.actuator.releases, 1);
  assert.equal(result.calibration.trials.length <= 1, true, 'no dependent trial after failure');
  return fixture;
};

// Closed semantic vocabulary and bounded protocol, not a hidden shell or a
// coordinate/phase override. A copied protocol cannot change mid-flight.
for (const patch of [{ contactMs: 0 }, { probe: 'adb' }, { gapsMs: [17] },
  { rounds: 5 }, { startDelaysMs: [] }, { maxDurationMs: 16000 },
  { maxObservationAgeMs: 501 }, { maxObservations: 999 }, { maxClockUncertaintyMs: NaN },
  { maskOnMs: 17 }, { profileId: 'other' }, { shell: 'input tap' }, { phaseMs: 517 }])
  assert.throws(() => validateSeamSpec({ ...spec, ...patch }, profile));
assert.throws(() => validateSeamSpec(spec, { ...profile, limits: { ...profile.limits, maxActions: 1 } }), /action budget/);
const block = seamBlock(spec, 267, 'fixture');
assert.equal(block.steps[2].atMs - block.steps[1].atMs, 267);
assert.equal(block.steps[0].durationMs, 17);
assert.deepEqual(block.steps[2].controls, ['hall', 'monitor']);

// Equal units/domain labels are NOT proof of a shared clock epoch.
const map = { schema: 'clock-map-v1', id: 'map-fixture', evidenceId: 'fixture-map-evidence',
  sourceClock: 'device-monotonic-ms', targetClock: 'host-monotonic-ms',
  sourceSession: 'boot-a', targetSession: 'host-a', sourceAtMs: 1000, targetAtMs: 2000,
  rate: 1.0001, errorMs: 0.2, rateErrorPpm: 100, validFromMs: 500, validUntilMs: 3000 };
const mapped = (value, overrides = {}) => mapClockInterval({ clock: 'device-monotonic-ms', value },
  { targetClock: 'host-monotonic-ms', targetSession: 'host-a', sourceSession: 'boot-a',
    uncertaintyMs: 0.01, mapping: map, ...overrides });
const interval = mapped(2000);
assert.ok(Math.abs((interval.earliestMs + interval.latestMs) / 2 - 3000.1) < 1e-9);
assert.ok(Math.abs(interval.uncertaintyMs - 0.310002) < 1e-9);
assert.equal(interval.mappingId, 'map-fixture');
assert.throws(() => mapped(2000, { sourceSession: 'boot-b' }), /session mismatch/);
assert.throws(() => mapped(2000, { targetSession: 'host-b' }), /session mismatch/);
assert.throws(() => mapped(2000, { mapping: null }), /missing mapping/);
for (const at of [499, 3000, 3001]) assert.throws(() => mapped(at), /validity/);
for (const patch of [{ rate: 0 }, { errorMs: -1 }, { rateErrorPpm: NaN }, { validUntilMs: 999 }])
  assert.throws(() => mapped(2000, { mapping: { ...map, ...patch } }));
const same = (value, uncertaintyMs = 0, sourceSession = 'host-a') => mapClockInterval(
  { clock: 'host-monotonic-ms', value }, { targetClock: 'host-monotonic-ms',
    sourceSession, targetSession: 'host-a', uncertaintyMs });
assert.deepEqual(same(10, 1), { clock: 'host-monotonic-ms', earliestMs: 9, latestMs: 11, uncertaintyMs: 1, mappingId: null });
assert.throws(() => same(10, 1, 'other-host'), /mapping/);
assert.throws(() => same(0, 1), /interval/);
assert.throws(() => same(Number.MAX_VALUE, Number.MAX_VALUE), /interval/);

{
  const fixture = make();
  fixture.service.calibrationClockMap = { ...map, sourceAtMs: 0, targetAtMs: 1000,
    sourceSession: 'fixture-device-boot', targetSession: fixture.clock.session,
    rate: 1, errorMs: 0.1, rateErrorPpm: 0, validFromMs: 0, validUntilMs: 10000 };
  inspect(fixture, measurement => {
    measurement.observedAt = { clock: 'device-monotonic-ms', value: measurement.observedAt.value - 1000 };
    measurement.source.session = 'fixture-device-boot';
    fixture.clock.value += 1; // receipt/processing occurs after the whole capture interval
    return measurement;
  });
  assert.equal((await run(fixture)).outcome, 'PASS', 'an explicit bounded offset mapping works end-to-end');
  assert.ok(fixture.service.session.events.filter(event => event.type === 'calibration.capture-mapped')
    .every(event => event.data.mappingId === map.id));
}
{
  const fixture = make();
  const result = await run(fixture);
  assert.equal(result.outcome, 'PASS');
  assert.equal(result.claimLevel, 'FIXTURE');
  assert.equal(result.calibration.workflow, 'COMPLETED');
  assert.equal(result.calibration.calibration, 'UNVERIFIED');
  assert.equal(result.calibration.trials.length, 2);
  assert.ok(result.calibration.trials.every(trial => trial.status === 'RESTORED' && trial.gameAcceptance === 'UNKNOWN'));
  assert.deepEqual(fixture.plant, { screen: 'NIGHT', monitor: 'DOWN', mask: 'OFF' });
  assert.deepEqual(fixture.actuator.blocks.map(item => item.kind), ['probe', 'restore', 'probe', 'restore']);
  assert.ok(fixture.actuator.blocks[2].startedAt > fixture.actuator.blocks[1].startedAt + spec.restoreSettleMs);
  assert.equal(fixture.actuator.releases, 1);
  const manifest = JSON.parse(await readFile(join(artifactRoot, result.id, 'session-manifest.json'), 'utf8'));
  const retained = JSON.parse(await readFile(join(artifactRoot, result.id, 'result.json'), 'utf8'));
  assert.deepEqual(retained, result);
  assert.equal(manifest.events.filter(event => event.type === 'calibration.observation').length, 12);
  assert.ok(manifest.events.filter(event => event.type === 'calibration.trial.started').every(event => event.data.status === 'STARTED'));
  assert.equal(manifest.events.filter(event => event.type === 'calibration.block.completed').length, 4);
}
for (const [monitor, mask, expected] of [['UP', 'OFF', 'monitor'], ['DOWN', 'ON', 'mask']]) {
  const fixture = make();
  Object.assign(fixture.plant, { monitor, mask });
  assert.equal((await run(fixture)).outcome, 'PASS');
  assert.equal(fixture.actuator.blocks[0].kind, 'restore');
  assert.deepEqual(fixture.actuator.blocks[0].steps[0].controls, [expected]);
}
{
  const fixture = make();
  const input = structuredClone(spec);
  const detect = fixture.detector.detect.bind(fixture.detector);
  fixture.detector.detect = raw => { input.contactMs = 999; return detect(raw); };
  assert.equal((await run(fixture, input)).outcome, 'PASS');
  assert.equal(fixture.actuator.blocks[0].steps[0].durationMs, 17);
}
{
  const fixture = make();
  assert.equal((await run(fixture, { ...spec, gapsMs: [267, 300],
    startDelaysMs: [0, 17, 0, 17] })).outcome, 'PASS');
  assert.deepEqual(fixture.actuator.blocks.filter(item => item.kind === 'probe')
    .map(item => item.steps[2].atMs - item.steps[1].atMs), [267, 300, 300, 267]);
}
{
  const fixture = make();
  inspect(fixture, (measurement, reads) => {
    if (reads <= 2) { delete measurement.value; Object.assign(measurement, { state: 'UNKNOWN', reason: 'transition' }); }
    return measurement;
  });
  assert.equal((await run(fixture)).outcome, 'PASS');
  assert.equal(fixture.actuator.blocks[0].startedAt, 1070, 'two unknowns require two new positive frames');
}

for (const [change, reason] of [
  [m => { m.source.sequence = 1; }, /duplicate or reordered/],
  [m => { m.observedAt.value = 1017; }, /not advancing/],
  [(m, n) => { if (n > 1) m.source.session = 'restarted-boot'; }, /session changed/],
  [m => { m.source.acquisitionBasis = 'request-not-capture'; }, /timestamp is unverified/],
  [m => { m.source.uncertaintyMs = 2; }, /uncertainty exceeds/],
  [m => { m.observedAt.value -= 101; }, /capture is stale/],
  [m => { m.observedAt.value += 1; }, /capture is in the future/],
  [m => { m.source.calibrationProfile = 'unbound'; }, /state calibration mismatch/],
  [m => { m.observedAt.clock = 'device-monotonic-ms'; }, /missing mapping/],
  [m => { m.value.screen = 'GAME_OVER'; }, /night is no longer observed/],
  [m => { m.value.mask = 'ON'; m.value.monitor = 'UP'; }, /contradictory/],
]) await refused(f => inspect(f, (m, n) => { change(m, n); return m; }), reason);

await refused(f => inspect(f, m => { m.value.mask = 'UNKNOWN'; return m; }), /observation budget/);
await refused(f => inspect(f, m => { f.clock.value += spec.resetTimeoutMs; return m; }), /deadline expired/);
await refused(f => inspect(f, (m, n) => { if (n > 6) m.value.mask = 'ON'; return m; }), /precondition changed/, 2);
// Drop the restore while acknowledging the write: positive state still UP,
// so never blind-toggle again and never release the second trial.
await refused(f => {
  const execute = f.actuator.executeCalibrationBlock.bind(f.actuator);
  f.actuator.executeCalibrationBlock = async (request, options) => {
    const result = await execute(request, options);
    if (request.kind === 'restore') f.plant.monitor = 'UP';
    return result;
  };
}, /restore did not land/, 2);
for (const result of [{ status: 'SENT', completed: false }, { status: 'FAILED', completed: true },
  { status: 'SENT', completed: true, blockId: 'wrong-id' }])
  await refused(f => {
    f.actuator.executeCalibrationBlock = async request => ({ blockId: request.id, ...result });
  }, /completion is unknown or failed/);
await refused(f => {
  f.actuator.executeCalibrationBlock = async request => ({ blockId: request.id, status: 'SENT', completed: true });
}, /completed before requested duration/);

// Never-resolving I/O has a real wall timeout, even with a stopped fake clock.
{
  const fixture = make();
  fixture.sensor.sample = () => new Promise(() => {});
  const tiny = { ...spec, contactMs: 1, maskOnMs: 2, probeContactMs: 1, restoreContactMs: 1,
    restoreSettleMs: 1, resetTimeoutMs: 4, maxDurationMs: 30, gapsMs: [2], startDelaysMs: [0, 0] };
  const result = await run(fixture, tiny);
  assert.equal(result.outcome, 'ABORTED');
  assert.match(result.calibration.reason, /I\/O deadline/);
  assert.equal(fixture.actuator.blocks.length, 0);
  assert.equal(fixture.actuator.releases, 1);
}
// A single writer spans observation, timed block and restoration. Emergency
// abort remains available without waiting for this lease or the hung read.
{
  const fixture = make();
  let entered, deliver;
  const pendingRead = new Promise(resolve => { entered = resolve; });
  fixture.sensor.sample = () => { entered(); return new Promise(resolve => { deliver = resolve; }); };
  const pending = run(fixture);
  await pendingRead;
  for (const operation of [() => fixture.service.applyCommand({}), () => fixture.service.execute(),
    () => fixture.service.executeConditioned([]), () => fixture.service.ensureMonitor(false),
    () => fixture.service.executeArtifact({}), () => fixture.service.executeCalibration(spec)])
    await assert.rejects(operation, /lease held/);
  assert.throws(() => fixture.service.startSession(), /lease is still held/);
  await fixture.service.abort('test-emergency');
  assert.equal((await pending).outcome, 'ABORTED');
  assert.equal(fixture.actuator.aborts, 1);
  fixture.service.startSession();
  deliver({}); // late completion may not pollute a new session's observations
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(fixture.service.session.events.map(event => event.type), ['session.started']);
  assert.equal(fixture.actuator.blocks.length, 0);
}
{
  const fixture = make();
  fixture.actuator.executeCalibrationBlock = async () => { await fixture.service.abort('in-flight'); };
  assert.equal((await run(fixture)).outcome, 'ABORTED');
  assert.equal(fixture.service.session.events.filter(event => event.type === 'calibration.trial.started').length, 1);
  assert.equal(fixture.actuator.releases, 1);
}
{
  const fixture = make();
  fixture.actuator.releaseAll = () => { throw new Error('release failed'); };
  await assert.rejects(() => run(fixture), /release failed/);
  assert.throws(() => fixture.service.startSession(), /quarantined/);
}
{
  const fixture = make();
  fixture.service.startSession();
  await assert.rejects(() => fixture.service.executeCalibration({ ...spec, contactMs: 0 }), /contactMs/);
  assert.equal(fixture.actuator.blocks.length, 0);
  assert.equal((await fixture.service.executeCalibration(spec)).outcome, 'PASS', 'validation rejection does not leak the writer');
}
{
  const fixture = make();
  fixture.actuator.capabilities = () => ({ adapter: 'fixture-hid', claimLevel: 'FIXTURE' });
  await assert.rejects(() => run(fixture), /completion-aware/);
  assert.equal(fixture.actuator.blocks.length, 0);
  const live = make(); live.service.mode = 'live';
  assert.throws(() => live.service.startSession(), /fixture-only/);
  assert.throws(() => composeSeamFixture({ profile: { ...profile, id: 'hid-mediaprojection' }, artifactRoot }), /explicit fixture/);
}
{
  const fixture = make();
  const mcp = createActuatorMcp(fixture.service);
  assert.ok(mcp.tools().includes('calibration.execute'));
  assert.equal((await mcp.call('calibration.execute', { spec })).error.code, 'NO_SESSION');
  const { session } = await mcp.call('session.start', { idempotencyKey: 'start' });
  const args = { spec, lease: session.lease, profileHash: session.profileHash };
  assert.equal((await mcp.call('calibration.execute', { ...args, profileHash: 'wrong', idempotencyKey: 'bad' })).error.code, 'PROFILE_MISMATCH');
  assert.equal((await mcp.call('calibration.execute', { ...args, deadlineMs: 1, idempotencyKey: 'short' })).error.code, 'DEADLINE_INVALID');
  const result = await mcp.call('calibration.execute', { ...args, idempotencyKey: 'run' });
  assert.equal(result.ok, true);
  assert.equal(result.result.calibration.calibration, 'UNVERIFIED');
}
console.log('seam calibration: clock intervals, serial state gates, deadlines, aborts and UNKNOWN acceptance pass (FIXTURE only)');
