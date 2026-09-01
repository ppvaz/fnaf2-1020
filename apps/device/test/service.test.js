/** Device composition contract: fixture and MCP clients share one service. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DeviceControlService } from '../src/service.js';
import { createActuatorMcp } from '../src/mcp.js';
import { FixtureActuator } from '@fnaf2-1020/adapters/actuators';
import { FixtureRawSensor } from '@fnaf2-1020/adapters/sensors';
import { measureMonitorUp, monitorRuleDigest, parseMonitorRule } from '@fnaf2-1020/adapters';
import { composeDevice } from '../src/composition.js';
import { composeModernDevice } from '../src/modern-composition.js';
import { DeviceArtifactExecutor, DEVICE_EXECUTOR_SCHEMA } from '../src/artifact-executor.js';
import { stableHash } from '@fnaf2-1020/core/contracts';

const here = fileURLToPath(new URL('../profiles/fixture-hid-screencap.json', import.meta.url));
const profile = JSON.parse(await readFile(here, 'utf8'));
const artifactRoot = await mkdtemp(join(tmpdir(), 'fnaf2-device-contract-'));
const service = new DeviceControlService({ profile, actuator: new FixtureActuator({ now: () => 1 }), sensor: new FixtureRawSensor(), artifactRoot });
const mcp = createActuatorMcp(service);
assert.ok((await mcp.call('devices.list')).ok);
assert.equal((await mcp.call('sensor.sample', { request: { id: 'mcp-frame', at: 1 } })).ok, true);
assert.ok(!mcp.tools().includes('shell.exec'));
assert.ok(mcp.tools().includes('cue.setup'));
assert.ok(mcp.tools().includes('cue.queue.enqueue'));
const started = await mcp.call('session.start', { idempotencyKey: 'start-1' });
assert.equal(started.ok, true);
assert.match(started.session.id, /^run-\d{14}-[0-9a-f-]+-/);
const lease = started.session.lease;
const profileHash = started.session.profileHash;
const trajectory = service.trajectory();
const applied = await mcp.call('actuator.apply', { lease, profileHash, idempotencyKey: 'command-1', command: { ...trajectory.commands[0], source: { controller: 'mcp-test' } } });
assert.equal(applied.ok, true);
const commandDuplicate = await mcp.call('actuator.apply', { lease, profileHash, idempotencyKey: 'command-1', command: trajectory.commands[0] });
assert.equal(commandDuplicate.error.code, 'DUPLICATE');
const executed = await mcp.call('trajectory.execute', { lease, profileHash, idempotencyKey: 'trajectory-1', deadlineMs: 1000, trajectory });
assert.equal(executed.ok, true);
const duplicate = await mcp.call('trajectory.execute', { lease, profileHash, idempotencyKey: 'trajectory-1', trajectory });
assert.equal(duplicate.error.code, 'NO_SESSION');
assert.equal((await mcp.call('actuator.apply', { lease, profileHash, idempotencyKey: 'bad-command', command: { ...trajectory.commands[0], source: { controller: 'mcp-test' } } })).error.code, 'NO_SESSION');

const liveProfile = JSON.parse(await readFile(fileURLToPath(new URL('../profiles/hid-mediaprojection.json', import.meta.url)), 'utf8'));
const fastProfile = JSON.parse(await readFile(fileURLToPath(new URL('../profiles/hid-mediaprojection-17ms.json', import.meta.url)), 'utf8'));
for (const candidate of [liveProfile, fastProfile]) {
  assert.equal(candidate.limits.dryRunOnly, true,
    'an unqualified timing candidate must remain dry-run only');
  assert.notDeepEqual(candidate.controlMap.light, candidate.controlMap.hall,
    'camera light and office hall light must have distinct physical bindings');
  assert.doesNotThrow(() => composeDevice({ profile: candidate }));
}
assert.notEqual(liveProfile.calibrations['actuator-timing'],
  fastProfile.calibrations['actuator-timing'],
  '17 ms must have qualification evidence distinct from the 100 ms candidate');
const modern = composeModernDevice({ profile: liveProfile,
  hid: { write: async () => {}, ready: async () => {}, sleep: async () => {} },
  cue: { token: '0123456789abcdef0123456789abcdef', request: () =>
    'OK snapshotNs=1 ageUs=1 monitorUp=true' },
  qualification: { schema: 'qualification-v1', evidenceId: 'fixture-modern-composition',
    claimLevel: 'DEVICE_MEASURED', policyHash: 'policy-fixture-v1', modelHash: 'model-sim-v1',
    sampleCount: 1, verdict: 'PASS' }, artifactRoot });
assert.equal(modern.mode, 'live');
assert.equal(modern.profile.id, liveProfile.id);

// MonitorUp rule binding: without a fitted rule the detector stays UNKNOWN,
// and an injected rule must match the profile's declared digest exactly.
// The committed g56 rule is anchored on the monitor map drawing; the test
// synthesises grid rows from the anchors' own measured edges.
const fittedRule = JSON.parse(await readFile(
  fileURLToPath(new URL('../../../models/monitor-rule-moto-g56-v207.json', import.meta.url)), 'utf8'));
const ruleDigest = monitorRuleDigest(fittedRule);
{
  const ruleProfile = JSON.parse(await readFile(
    fileURLToPath(new URL('../profiles/hid-mediaprojection.json', import.meta.url)), 'utf8'));
  assert.equal(ruleProfile.calibrations.monitorRule, ruleDigest,
    'the committed profile must bind the committed rule artifact digest');

  const luma = cell => (77 * ((cell >> 16) & 0xff) + 150 * ((cell >> 8) & 0xff)
    + 29 * (cell & 0xff)) >> 8;
  const greyTriple = value => value * 0x010101;
  const anchorCells = up => {
    const cells = Array.from({ length: 180 }, () => greyTriple(32));
    for (const anchor of fittedRule.adapter.anchors) {
      const { threshold, refuse_band: band } = anchor.rule;
      const present = anchor.kind === 'present';
      const edge = Math.round(up === present ? threshold + band : threshold - band);
      cells[anchor.cell] = greyTriple(Math.max(0, Math.min(255, edge)));
    }
    return cells;
  };
  const upRow = anchorCells(true);
  const downRow = anchorCells(false);
  for (const anchor of fittedRule.adapter.anchors) {
    const { threshold, refuse_band: band } = anchor.rule;
    const upEdge = anchor.kind === 'present' ? threshold + band : threshold - band;
    const notUpEdge = anchor.kind === 'present' ? threshold - band : threshold + band;
    assert.equal(luma(upRow[anchor.cell]) === Math.round(upEdge), true,
      `anchor ${anchor.cell} must sit on its up edge in the up row`);
    assert.equal(luma(downRow[anchor.cell]) === Math.round(notUpEdge), true,
      `anchor ${anchor.cell} must sit on its not-up edge in the down row`);
  }
  const hex = cells => `OK grid=20x9 seq=7 ${cells.map(cell => cell.toString(16).padStart(6, '0')).join(' ')}`;
  const cueWith = (cells, { gridSeq = 7, facts = false } = {}) => ({
    token: '0123456789abcdef0123456789abcdef',
    request: request => request.startsWith('GET ')
    ? 'OK snapshotNs=1 seq=7 ageUs=1 screen=FNAF2_NIGHT gridLuma=32'
        + (facts
          ? ' monitorUp=true monitorReason=anchors-up '
            + 'cameraSelected=cam:5 cameraHighlights=cam:5 cameraReason=single-camera-highlight '
            + 'batteryPercent=75 batteryReason=bars-observed'
          : '')
      : request.startsWith('GRID ') ? hex(cells).replace('seq=7', `seq=${gridSeq}`) : 'ERROR unsupported',
  });
  const ports = {
    hid: { write: async () => {}, ready: async () => {}, sleep: async () => {} },
    qualification: { schema: 'qualification-v1', evidenceId: 'fixture-monitor-rule',
      claimLevel: 'DEVICE_MEASURED', policyHash: 'policy-fixture-v1', modelHash: 'model-sim-v1',
      sampleCount: 1, verdict: 'PASS' }, artifactRoot,
  };
  const unruled = composeModernDevice({ profile: ruleProfile, cue: cueWith(upRow), ...ports });
  const unruledSample = await unruled.sensor.sample({ id: 'probe-unruled', at: 0 });
  const unruledMeasurement = unruled.detector.detect(unruledSample);
  assert.equal(unruledMeasurement.state, 'UNKNOWN');
  assert.equal(unruledMeasurement.reason, 'monitor-rule-absent',
    'without a fitted rule the monitor fact stays UNKNOWN even on a plausible frame');

  const wrongDigestProfile = { ...ruleProfile,
    calibrations: { ...ruleProfile.calibrations, monitorRule: '0'.repeat(64) } };
  assert.throws(() => composeModernDevice({ profile: wrongDigestProfile, monitorRule: fittedRule,
    cue: cueWith(upRow), ...ports }), /monitor rule digest/,
    'a digest mismatch refuses composition');

  const boundProfile = { ...ruleProfile };
  boundProfile.limits = { ...boundProfile.limits, dryRunOnly: false };
  const ruled = composeModernDevice({ profile: boundProfile, monitorRule: fittedRule,
    cue: cueWith(upRow, { facts: true }), ...ports });
  const ruledSample = await ruled.sensor.sample({ id: 'probe-ruled', at: 0 });
  const ruledMeasurement = ruled.detector.detect(ruledSample);
  assert.equal(ruledMeasurement.state, 'OBSERVED');
  assert.equal(ruledMeasurement.value, true,
    'map-anchor presence must derive monitorUp through the bound rule');
  assert.deepEqual(ruledSample.payload.measurements.cameraSelected,
    { signal: 'cameraSelected', state: 'OBSERVED', value: 'cam:5', confidence: 1 },
    'the live observation payload must carry the sibling selected-camera fact');
  assert.deepEqual(ruledSample.payload.measurements.cameraHighlights,
    { signal: 'cameraHighlights', state: 'OBSERVED', value: ['cam:5'], confidence: 1 },
    'the live observation payload must carry the complete highlighted-camera fact');
  assert.deepEqual(ruledSample.payload.measurements.batteryPercent,
    { signal: 'batteryPercent', state: 'OBSERVED', value: 75, confidence: 1 },
    'the live observation payload must carry the game-UI battery fact');

  // Full conditioned chain: rule-derived UP observations gate a camera select.
  let cameraSends = 0;
  const cameraTransport = { send: async () => { cameraSends += 1; }, abort: () => {}, releaseAll: () => {} };
  const cameraService = composeDevice({
    profile: boundProfile, mode: 'live', artifactRoot,
    actuatorTransport: cameraTransport,
    qualification: ports.qualification,
    sensorTransport: { capture: () => ({ ageUs: 1, screen: 'FNAF2_NIGHT', seq: 7, gridSeq: 7,
      gridLuma: 32, cells: upRow }) },
    detectorRead: raw => measureMonitorUp(raw.payload, parseMonitorRule(fittedRule)),
    now: () => 10, sleep: async () => {},
  });
  cameraService.startSession();
  const camCommand = { schema: 'control-command-v1', id: 'ruled-cam7',
    action: { kind: 'select', control: 'cam:7' },
    requestedAt: { clock: 'device-monotonic-ms', value: 10 },
    deadline: { clock: 'device-monotonic-ms', value: 1000 },
    source: { controller: 'artifact-test', requiresMonitorUp: true } };
  await cameraService.executeConditioned([camCommand]);
  assert.equal(cameraSends, 1,
    'two agreeing rule-derived UP observations must gate the camera select through');

  // A stale grid (seq disagreement) must refuse the fact and never send.
  let staleSends = 0;
  const staleService = composeDevice({
    profile: boundProfile, mode: 'live', artifactRoot,
    actuatorTransport: { send: async () => { staleSends += 1; }, abort: () => {}, releaseAll: () => {} },
    qualification: ports.qualification,
    sensorTransport: { capture: () => ({ ageUs: 1, screen: 'FNAF2_NIGHT', seq: 7, gridSeq: 8,
      gridLuma: 32, cells: upRow }) },
    detectorRead: raw => measureMonitorUp(raw.payload, parseMonitorRule(fittedRule)),
    now: () => 10, sleep: async () => {},
  });
  staleService.startSession();
  await assert.rejects(() => staleService.executeConditioned([{ ...camCommand, id: 'stale-cam7' }]),
    /monitor state UNKNOWN: grid-seq-mismatch/,
    'a grid row from another frame must refuse the monitor fact');
  assert.equal(staleSends, 0,
    'an UNKNOWN monitor state must never put a camera coordinate onto the office');
}

liveProfile.limits.dryRunOnly = false;
let sent = 0;
const liveTransport = {
  claimLevel: 'DEVICE_MEASURED', send: async () => { sent += 1; },
  abort: () => {}, releaseAll: () => {},
};
const liveService = composeDevice({
  profile: liveProfile, mode: 'live', artifactRoot,
  actuatorTransport: liveTransport,
  sensorTransport: { capture: () => new Uint8Array([0, 0, 0, 255]) },
  detectorRead: () => ({ state: 'UNKNOWN', reason: 'fixture-live-composition' }),
});
assert.throws(() => liveService.startSession(), /externally qualified DEVICE_MEASURED/);
assert.equal(sent, 0);

const qualifiedTransport = {
  send: async () => { sent += 1; }, abort: () => {}, releaseAll: () => {},
};
const qualifiedService = composeDevice({
  profile: liveProfile, mode: 'live', artifactRoot,
  actuatorTransport: qualifiedTransport,
  qualification: { schema: 'qualification-v1', evidenceId: 'fixture-live-evidence', claimLevel: 'DEVICE_MEASURED', policyHash: 'policy-fixture-v1', modelHash: 'model-sim-v1', sampleCount: 1, verdict: 'PASS' },
  sensorTransport: { capture: () => new Uint8Array([0, 0, 0, 255]) },
  detectorRead: () => ({ state: 'OBSERVED', value: true, confidence: 1 }),
  now: () => 0,
});
qualifiedService.startSession({ lease: 'qualified-live' });
const liveCommand = { schema: 'control-command-v1', id: 'qualified-live-command', action: { kind: 'press', control: 'mask' }, requestedAt: { clock: 'device-monotonic-ms', value: 0 }, deadline: { clock: 'device-monotonic-ms', value: 100 }, source: { controller: 'test-live' } };
const liveResult = await qualifiedService.applyCommand(liveCommand, { idempotencyKey: 'qualified-live-command' });
assert.equal(liveResult.status, 'SENT');
assert.equal(sent, 1);
await qualifiedService.abort('test-stop');
assert.equal(sent, 1);

// Plan 22 artifact boundary: only compiled semantic blocks and content
// bindings reach the injected device-local executor; no strategy or legacy
// transport selector is reconstructed at this layer.
let artifactRequest;
let executorAborts = 0;
let executorReleases = 0;
const artifactExecutor = new DeviceArtifactExecutor({
  execute: async request => { artifactRequest = request; return { outcome: 'PASS', results: [] }; },
  abort: async () => { executorAborts += 1; },
  releaseAll: async () => { executorReleases += 1; },
});
const artifactService = composeDevice({
  profile: liveProfile, mode: 'live', artifactRoot,
  actuatorTransport: qualifiedTransport,
  qualification: { schema: 'qualification-v1', evidenceId: 'fixture-artifact-evidence',
    claimLevel: 'DEVICE_MEASURED', policyHash: 'policy-fixture-v1', modelHash: 'model-sim-v1',
    sampleCount: 1, verdict: 'PASS' },
  sensorTransport: { capture: () => new Uint8Array([0, 0, 0, 255]) },
  detectorRead: () => ({ state: 'OBSERVED', value: true, confidence: 1 }),
  executor: artifactExecutor, now: () => 0,
});
artifactService.startSession({ lease: 'artifact-live' });
const artifactRequestInput = {
  schema: DEVICE_EXECUTOR_SCHEMA, version: 1, mode: 'live',
  artifact: { winnerHash: 'fnv1a-artifact', engineHash: 'engine-v1', profileHash: 'a'.repeat(64),
    profileStableHash: stableHash(liveProfile), plans: [{ night: 6, sha256: 'b'.repeat(64) }] },
  profile: liveProfile,
  limits: { maxActions: 64, maxDurationMs: 15000 },
  blocks: [{ schema: 'artifact-action-block-v1', id: 'opening-block-1', cycle: 'opening',
    night: 6, atMs: 0, actions: [{ schema: 'artifact-action-v1', id: 'opening-1', cycle: 'opening',
      atMs: 0, kind: 'press', control: 'mask', requiresMonitorUp: false, durationMs: 33 }] }],
};
const artifactResult = await artifactService.executeArtifact(artifactRequestInput);
assert.equal(artifactResult.outcome, 'PASS');
assert.equal(artifactRequest.artifact.profileStableHash, stableHash(liveProfile));
assert.equal('strategy' in artifactRequest, false);
assert.equal('policy' in artifactRequest, false);
assert.equal('transport' in artifactRequest, false);
assert.equal(executorAborts, 0);
assert.equal(executorReleases, 0);

const malformedArtifact = { ...artifactRequestInput, blocks: [{ ...artifactRequestInput.blocks[0],
  actions: [{ ...artifactRequestInput.blocks[0].actions[0], command: 'legacy' }] }] };
const refusalService = composeDevice({
  profile: liveProfile, mode: 'live', artifactRoot,
  actuatorTransport: qualifiedTransport,
  qualification: { schema: 'qualification-v1', evidenceId: 'fixture-artifact-refusal',
    claimLevel: 'DEVICE_MEASURED', policyHash: 'policy-fixture-v1', modelHash: 'model-sim-v1',
    sampleCount: 1, verdict: 'PASS' },
  sensorTransport: { capture: () => new Uint8Array([0, 0, 0, 255]) },
  detectorRead: () => ({ state: 'OBSERVED', value: true, confidence: 1 }),
  executor: artifactExecutor, now: () => 0,
});
refusalService.startSession({ lease: 'artifact-refusal' });
await assert.rejects(() => refusalService.executeArtifact(malformedArtifact), /command is not allowed/);

let failedExecutorAborts = 0;
let failedExecutorReleases = 0;
const failedExecutor = new DeviceArtifactExecutor({
  execute: async () => { throw new Error('device-port-failure'); },
  abort: async () => { failedExecutorAborts += 1; },
  releaseAll: async () => { failedExecutorReleases += 1; },
});
const failedArtifactService = composeDevice({
  profile: liveProfile, mode: 'live', artifactRoot,
  actuatorTransport: qualifiedTransport,
  qualification: { schema: 'qualification-v1', evidenceId: 'fixture-artifact-failure',
    claimLevel: 'DEVICE_MEASURED', policyHash: 'policy-fixture-v1', modelHash: 'model-sim-v1',
    sampleCount: 1, verdict: 'PASS' },
  sensorTransport: { capture: () => new Uint8Array([0, 0, 0, 255]) },
  detectorRead: () => ({ state: 'OBSERVED', value: true, confidence: 1 }),
  executor: failedExecutor, now: () => 0,
});
failedArtifactService.startSession({ lease: 'artifact-failure' });
await assert.rejects(() => failedArtifactService.executeArtifact(artifactRequestInput), /device-port-failure/);
assert.equal(failedExecutorAborts, 1, 'artifact failure must abort the injected executor');
assert.equal(failedExecutorReleases, 1, 'artifact failure must release the injected executor');

function conditionedService(states) {
  let sends = 0;
  const readings = [...states];
  const transport = {
    send: async () => { sends += 1; }, abort: () => {}, releaseAll: () => {},
  };
  const instance = composeDevice({
    profile: liveProfile, mode: 'live', artifactRoot,
    actuatorTransport: transport,
    qualification: { schema: 'qualification-v1', evidenceId: 'fixture-conditioned-evidence',
      claimLevel: 'DEVICE_MEASURED', policyHash: 'policy-fixture-v1',
      modelHash: 'model-sim-v1', sampleCount: 2, verdict: 'PASS' },
    sensorTransport: { capture: () => new Uint8Array([0, 0, 0, 255]) },
    detectorRead: () => {
      const value = readings.shift();
      return value === null || value === undefined
        ? { signal: 'monitorUp', state: 'UNKNOWN', reason: 'fixture-unknown' }
        : { signal: 'monitorUp', state: 'OBSERVED', value, confidence: 1 };
    },
    now: () => 10, sleep: async () => {},
  });
  instance.startSession();
  return { instance, sends: () => sends };
}

const lowering = conditionedService([true, true, true, false, false]);
const lowered = await lowering.instance.ensureMonitor(false, { id: 'forcedown-safe-lower' });
assert.equal(lowered.state, 'VERIFIED');
assert.equal(lowering.sends(), 1, 'ensure-down must press exactly once when the monitor is up');

const revoked = conditionedService([
  false, false, false, false, false, // first raise is revoked/does not reach UP
  false, false, false, true, true, // bounded retry reaches UP
]);
const raised = await revoked.instance.ensureMonitor(true, { id: 'forcedown-retry' });
assert.equal(raised.state, 'VERIFIED');
assert.equal(revoked.sends(), 2, 'forcedown recovery must be bounded at one retry');

const guardedCamera = conditionedService([null]);
const cameraAt = { clock: 'device-monotonic-ms', value: 10 };
const cameraCommand = { schema: 'control-command-v1', id: 'guarded-cam7',
  action: { kind: 'select', control: 'cam:7' }, requestedAt: cameraAt,
  deadline: { clock: 'device-monotonic-ms', value: 1000 },
  source: { controller: 'artifact-test', requiresMonitorUp: true } };
await assert.rejects(() => guardedCamera.instance.executeConditioned([cameraCommand]),
  /monitor state UNKNOWN/);
assert.equal(guardedCamera.sends(), 0,
  'an UNKNOWN monitor state must never put a camera coordinate onto the office');
console.log('device service: profile lease, bounded trajectory, observation wiring, cleanup, and claim refusal pass');
