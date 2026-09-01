/** Shared actuator conformance fixture; backend-specific limits stay visible. */
import assert from 'node:assert/strict';
import { FixtureActuator } from '../src/actuators.js';
import { FixtureRawSensor, FixtureVisualDetector, ScreencapSensor, CueHelperDetector } from '../src/sensors.js';
import { Clock } from '../src/clocks.js';
import { getCapability, resolveProfile } from '../src/registry.js';
import { HidWireTransport, toRaw, report } from '../src/transports/hid.js';
import { CueHelperControlTransport, parseCueResponse } from '../src/transports/cue-helper.js';

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
const controls = ['mask', 'monitor', 'light', 'hall', 'wind', 'ventL', 'ventR', 'cam:4', 'cam:7', 'cam:9', 'cam:10', 'cam:11'];
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
assert.deepEqual(toRaw([2275, 685]), [877, 1023], 'HID transform must truncate at the adapter boundary');
assert.deepEqual(report([{ flags: 3, point: { x: 350, y: 615 } }]).slice(0, 7),
  [1, 1, 3, 9, 4, 157, 0], 'HID report must preserve contact flags and native transform');
const lines = [];
const hid = new HidWireTransport({ write: async line => lines.push(JSON.parse(line)), ready: async () => {}, sleep: async () => {} });
await hid.send({ command: { action: { kind: 'press', control: 'light', durationMs: 17 }, source: { controller: 'test' } }, point: { x: 350, y: 615 } });
assert.equal(lines[0].command, 'register');
assert.deepEqual(lines.filter(line => line.command === 'report').map(line => line.report[2]), [3, 0]);
await hid.abort();
assert.equal(lines.at(-1).report[1], 2, 'abort must emit a two-contact release');
assert.deepEqual(parseCueResponse('OK snapshotNs=3 ageUs=17 monitorUp=true'),
  { snapshotNs: '3', ageUs: '17', monitorUp: 'true' });
const cue = new CueHelperControlTransport({ token: '0123456789abcdef0123456789abcdef', request: request =>
  request.startsWith('GET ') ? 'OK snapshotNs=3 ageUs=17 monitorUp=true' : 'ERROR unsupported' });
assert.deepEqual(cue.monitorMeasurement(await cue.snapshot()),
  { signal: 'monitorUp', state: 'OBSERVED', value: true, confidence: 1 });
assert.equal(cue.monitorMeasurement({ ageUs: '900000', monitorUp: 'true' }).state, 'UNKNOWN');
assert.deepEqual(cue.cameraMeasurement({ ageUs: '17', monitorUp: 'true',
  cameraSelected: 'cam:5', cameraReason: 'single-camera-highlight' }),
  { signal: 'cameraSelected', state: 'OBSERVED', value: 'cam:5', confidence: 1 });
assert.deepEqual(cue.cameraMeasurement({ ageUs: '17', monitorUp: 'false',
  cameraSelected: 'cam:5' }),
  { signal: 'cameraSelected', state: 'UNKNOWN', reason: 'monitor-not-up' });
assert.deepEqual(cue.cameraMeasurement({ ageUs: '17', monitorUp: 'true',
  cameraSelected: 'UNKNOWN', cameraReason: 'multiple-camera-highlight' }),
  { signal: 'cameraSelected', state: 'UNKNOWN', reason: 'multiple-camera-highlight' });
assert.deepEqual(cue.cameraMeasurement({ ageUs: '17', monitorUp: 'true',
  cameraSelected: 'cam:13' }),
  { signal: 'cameraSelected', state: 'UNKNOWN', reason: 'sensor-mismatch' });
assert.deepEqual(cue.cameraMeasurement({ ageUs: '900000', monitorUp: 'true',
  cameraSelected: 'cam:5' }),
  { signal: 'cameraSelected', state: 'UNKNOWN', reason: 'read-stale' });
assert.deepEqual(cue.cameraMeasurement({ ageUs: '17', monitorUp: 'true',
  cameraSelected: 'UNKNOWN', cameraReason: 'untrusted-free-text' }),
  { signal: 'cameraSelected', state: 'UNKNOWN', reason: 'read-unavailable' });
assert.deepEqual(cue.batteryMeasurement({ ageUs: '17', screen: 'FNAF2_NIGHT',
  batteryPercent: '75', batteryReason: 'bars-observed' }),
  { signal: 'batteryPercent', state: 'OBSERVED', value: 75, confidence: 1 });
assert.deepEqual(cue.batteryMeasurement({ ageUs: '17', screen: 'FNAF2_MENU',
  batteryPercent: '100' }),
  { signal: 'batteryPercent', state: 'UNKNOWN', reason: 'screen-identity' });
assert.deepEqual(cue.batteryMeasurement({ ageUs: '17', screen: 'FNAF2_NIGHT',
  batteryPercent: 'UNKNOWN', batteryReason: 'untrusted-free-text' }),
  { signal: 'batteryPercent', state: 'UNKNOWN', reason: 'read-unavailable' });
assert.deepEqual(cue.batteryMeasurement({ ageUs: '17', screen: 'FNAF2_NIGHT',
  batteryPercent: '110' }),
  { signal: 'batteryPercent', state: 'UNKNOWN', reason: 'sensor-mismatch' });
console.log('adapter contracts: fixture actuator result and profile refusal pass');
