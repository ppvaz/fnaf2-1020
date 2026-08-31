/** Shared actuator conformance fixture; backend-specific limits stay visible. */
import assert from 'node:assert/strict';
import { FixtureActuator } from '../src/actuators.js';
import { FixtureRawSensor, FixtureVisualDetector, ScreencapSensor, CueHelperDetector } from '../src/sensors.js';
import { Clock } from '../src/clocks.js';
import { getCapability, resolveProfile } from '../src/registry.js';

const actuator = new FixtureActuator({ now: () => 12 });
const command = { schema: 'control-command-v1', id: 'fixture-1', action: { kind: 'select', control: 'cam:10' }, requestedAt: { clock: 'device-monotonic-ms', value: 0 }, source: { controller: 'conformance' } };
const result = await actuator.apply(command);
assert.equal(result.status, 'SENT');
assert.equal(result.commandId, command.id);
assert.equal(getCapability('fixture-hid').claimLevel, 'FIXTURE');
const raw = new FixtureRawSensor({ samples: [] }).sample({ id: 'raw-1', at: 10 });
assert.equal(new FixtureVisualDetector().detect(raw).state, 'UNKNOWN');
const frame = new ScreencapSensor({ capture: () => new Uint8Array([0, 0, 0, 255]), dimensions: { width: 1, height: 1 } }).sample({ id: 'frame-1', at: 2 });
assert.equal(new CueHelperDetector({ read: () => ({ state: 'UNKNOWN', reason: 'helper-timeout' }) }).detect(frame).state, 'UNKNOWN');
assert.deepEqual(new Clock({ name: 'simulator-frame', read: () => 7 }).now(), { clock: 'simulator-frame', value: 7 });
assert.throws(() => resolveProfile({ schema: 'device-profile-v1', id: 'bad', targetBuild: 'x', actuator: 'fixture-hid', visualSensor: 'fixture-visual', visualDetector: 'fixture-visual', clock: 'device-monotonic-ms', calibrations: { visual: '' } }), /unbound calibration/);
const controls = ['mask', 'monitor', 'light', 'wind', 'ventL', 'ventR', 'cam:4', 'cam:7', 'cam:9', 'cam:10', 'cam:11'];
const profile = {
  schema: 'device-profile-v1', id: 'compatibility-fixture', targetBuild: 'fixture',
  actuator: 'fixture-hid', visualSensor: 'fixture-visual', visualDetector: 'fixture-detector',
  clock: 'host-monotonic-ms',
  calibrations: { geometry: 'fixture-geometry-v1', 'actuator-timing': 'fixture-hid-timing-v1', visual: 'fixture-visual-v1', detector: 'fixture-visual-v1' },
  controlMap: Object.fromEntries(controls.map(control => [control, { x: 1, y: 1 }])),
};
assert.doesNotThrow(() => resolveProfile(profile));
assert.throws(() => resolveProfile({ ...profile, visualDetector: 'screencheck-detector' }), /sensor format .* cannot consume/);
assert.throws(() => resolveProfile({ ...profile, calibrations: { ...profile.calibrations, detector: 'other-visual-v1' } }), /incompatible visual\/detector calibrations/);
console.log('adapter contracts: fixture actuator result and profile refusal pass');
