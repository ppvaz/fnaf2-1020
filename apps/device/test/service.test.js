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
console.log('device service: profile lease, bounded trajectory, observation wiring, cleanup, and claim refusal pass');
