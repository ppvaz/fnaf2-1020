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
const liveService = composeDevice({
  profile: liveProfile, mode: 'live', artifactRoot,
  actuatorTransport: { claimLevel: 'DEVICE_MEASURED', send: async () => { sent += 1; } },
  sensorTransport: { capture: () => new Uint8Array([0, 0, 0, 255]) },
  detectorRead: () => ({ state: 'UNKNOWN', reason: 'fixture-live-composition' }),
});
liveService.startSession();
const liveResult = await liveService.execute();
assert.equal(liveResult.claimLevel, 'DEVICE_MEASURED');
assert.equal(sent, liveService.trajectory().commands.length);
console.log('device service: profile lease, bounded trajectory, artifact path, and MCP idempotency pass');
