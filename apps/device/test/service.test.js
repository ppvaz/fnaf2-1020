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
import { composeDevice } from '../src/composition.js';
import { composeModernDevice } from '../src/modern-composition.js';

const here = fileURLToPath(new URL('../profiles/fixture-hid-screencap.json', import.meta.url));
const profile = JSON.parse(await readFile(here, 'utf8'));
const artifactRoot = await mkdtemp(join(tmpdir(), 'fnaf2-device-contract-'));
const service = new DeviceControlService({ profile, actuator: new FixtureActuator({ now: () => 1 }), sensor: new FixtureRawSensor(), artifactRoot });
const mcp = createActuatorMcp(service);
assert.ok((await mcp.call('devices.list')).ok);
assert.equal((await mcp.call('sensor.sample', { request: { id: 'mcp-frame', at: 1 } })).ok, true);
assert.ok(!mcp.tools().includes('shell.exec'));
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
