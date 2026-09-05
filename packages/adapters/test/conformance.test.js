/** Shared actuator conformance fixture; backend-specific limits stay visible. */
import assert from 'node:assert/strict';
import { FixtureActuator } from '../src/actuators.js';
import { FixtureRawSensor, FixtureVisualDetector, ScreencapSensor, CueHelperDetector } from '../src/sensors.js';
import { Clock } from '../src/clocks.js';
import { getCapability, resolveProfile } from '../src/registry.js';
import { HID_DESCRIPTOR, HidWireTransport, toRaw, report } from '../src/transports/hid.js';
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
assert.equal(HID_DESCRIPTOR.length, 124, 'HID descriptor must declare both contact identifiers');
assert.equal(report([{ flags: 0, point: { x: 350, y: 615 } }])[7], 4,
  'single-contact release must consume the inactive second contact record');
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
const captureTiming = cue.visualAcquisition({ snapshotNs: '5000000000',
  visualCaptureNs: '4990000000', ageUs: '10000', seq: '12' });
assert.equal(captureTiming.at, 4990);
assert.equal(captureTiming.basis, 'image-timestamp');
assert.equal(captureTiming.sequence, 12);
const oldTiming = cue.visualAcquisition({ snapshotNs: '5000000000', ageUs: '10000', seq: '12' });
assert.equal(oldTiming.at, 4990);
assert.equal(oldTiming.uncertaintyMs, 0.001);

// FRAME: snapshot fields and the sensor from ONE device read. The helper emits
// the 180 cells as a single concatenated hex run, no separators -- `parseCueGrid`
// once demanded space-separated tokens, a shape only our own fixture produced,
// and so threw on every real grid read. Both forms are accepted; the 180-cell
// length decides.
const runCells = Array.from({ length: 180 }, (_, index) => (index << 8) | 0x11);
const runBody = runCells.map(cell => cell.toString(16).padStart(6, '0')).join('');
const framed = new CueHelperControlTransport({ token: '0123456789abcdef0123456789abcdef',
  request: request => request.startsWith('FRAME ')
    ? `OK snapshotNs=3 seq=42 ageUs=17 screen=FNAF2_NIGHT grid=20x9 cells=${runBody}`
    : request.startsWith('GRID ') ? `OK grid=20x9 seq=42 ${runBody}` : 'ERROR unsupported' });
const oneRead = framed.frame();
assert.equal(oneRead.cells.length, 180);
assert.deepEqual([...oneRead.cells], runCells);
// One read means one frame: the sequence a detector correlates on is shared by
// construction, so grid-seq-mismatch cannot arise from the transport.
assert.equal(oneRead.seq, oneRead.gridSeq);
assert.equal(oneRead.screen, 'FNAF2_NIGHT');
// The concatenated run parses identically through the GRID path.
assert.deepEqual([...framed.grid().cells], runCells);
for (const bad of [
  'OK snapshotNs=3 seq=42 grid=20x9 cells=deadbeef',
  'OK snapshotNs=3 seq=42 cells=' + runBody,
]) assert.throws(() => new CueHelperControlTransport({ token: '0123456789abcdef0123456789abcdef',
  request: () => bad }).frame(), /cue-helper frame/);
assert.throws(() => cue.visualAcquisition({ snapshotNs: '1', ageUs: '1', seq: '1' }), /invalid/);
assert.throws(() => cue.visualAcquisition({ snapshotNs: '5000000000',
  visualCaptureNs: '4990000000', ageUs: '1', seq: '12' }), /disagrees/);
let captureCompleteAt = 30;
const stamped = await new ScreencapSensor({ now: () => captureCompleteAt, capture: async () => {
  captureCompleteAt = 55;
  return { ...raw, id: 'async-frame', source: { sensor: 'screencap', sequence: 12 },
    acquisition: captureTiming };
} }).sample({ id: 'request', at: 999 });
assert.equal(stamped.acquisition.at, 4990, 'request time must not replace source time');
const stampedMeasurement = new CueHelperDetector({ read: () => ({ value: true }) }).detect(stamped);
assert.deepEqual(stampedMeasurement.observedAt, { clock: 'device-monotonic-ms', value: 4990 });
assert.deepEqual(stampedMeasurement.receivedAt, { clock: 'host-monotonic-ms', value: 55 });
assert.equal(stampedMeasurement.source.sequence, 12);
const lost = await new ScreencapSensor({ capture: async () => { throw new Error('capture-timeout'); } }).sample();
let readsOfLostFrames = 0;
assert.equal(new CueHelperDetector({ read: () => { readsOfLostFrames++; return { value: true }; } })
  .detect(lost).reason, 'capture-timeout');
assert.equal(readsOfLostFrames, 0, 'a capture failure cannot become an observed state');
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
assert.deepEqual(cue.cameraHighlightsMeasurement({ ageUs: '17', monitorUp: 'true',
  cameraHighlights: 'cam:9,cam:11', cameraReason: 'multiple-camera-highlight' }),
  { signal: 'cameraHighlights', state: 'OBSERVED', value: ['cam:9', 'cam:11'], confidence: 1 });
assert.deepEqual(cue.cameraHighlightsMeasurement({ ageUs: '17', monitorUp: 'true',
  cameraSelected: 'cam:5', cameraReason: 'single-camera-highlight' }),
  { signal: 'cameraHighlights', state: 'OBSERVED', value: ['cam:5'], confidence: 1 });
assert.deepEqual(cue.cameraHighlightsMeasurement({ ageUs: '17', monitorUp: 'false',
  cameraHighlights: 'cam:9,cam:11' }),
  { signal: 'cameraHighlights', state: 'UNKNOWN', reason: 'monitor-not-up' });
assert.deepEqual(cue.cameraHighlightsMeasurement({ ageUs: '17', monitorUp: 'true',
  cameraHighlights: 'cam:9,cam:9' }),
  { signal: 'cameraHighlights', state: 'UNKNOWN', reason: 'sensor-mismatch' });
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
