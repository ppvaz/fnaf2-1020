/** Device composition root: profile names select adapters; runtime stays shared. */
import { DeviceControlService } from './service.js';
import { FixtureActuator, AdbTapActuator, HidActuator } from '@fnaf2-1020/adapters/actuators';
import { FixtureRawSensor, ScreencapSensor, MediaProjectionSensor, A2dpPcmSensor, FixtureVisualDetector, CueHelperDetector, ScreencheckDetector } from '@fnaf2-1020/adapters/sensors';

/** @param {any} profile @param {string} mode @param {any} transport @param {any} qualification */
function makeActuator(profile, mode, transport, qualification) {
  if (mode !== 'live') return new FixtureActuator({ id: profile.actuator });
  if (!transport) throw new Error('live composition requires an injected actuator transport');
  if (profile.actuator === 'adb-tap') return new AdbTapActuator({ transport, controlMap: profile.controlMap, qualification });
  if (profile.actuator === 'hid-multi') return new HidActuator({ transport, controlMap: profile.controlMap, qualification });
  throw new Error(`no live actuator composition for ${profile.actuator}`);
}

/** @param {any} profile @param {string} mode @param {any} transport */
function makeSensor(profile, mode, transport) {
  if (mode !== 'live') return new FixtureRawSensor();
  if (!transport?.capture) throw new Error('live composition requires an injected sensor capture transport');
  const common = { capture: transport.capture, clock: profile.clock, calibration: profile.calibrations.visual };
  if (profile.visualSensor === 'screencap') return new ScreencapSensor(common);
  if (profile.visualSensor === 'mediaprojection') return new MediaProjectionSensor(common);
  if (profile.visualSensor === 'a2dp-pcm') return new A2dpPcmSensor(common);
  throw new Error(`no live sensor composition for ${profile.visualSensor}`);
}

/** @param {any} profile @param {string} mode @param {any} read */
function makeDetector(profile, mode, read) {
  if (mode !== 'live') return new FixtureVisualDetector();
  if (typeof read !== 'function') throw new Error('live composition requires an injected detector reader');
  if (profile.visualDetector === 'cue-helper-detector') return new CueHelperDetector({ read });
  if (profile.visualDetector === 'screencheck-detector') return new ScreencheckDetector({ read });
  throw new Error(`no live detector composition for ${profile.visualDetector}`);
}

/** @param {any} options */
export function composeDevice(options = {}) {
  const { profile, mode = 'dry-run', actuatorTransport, sensorTransport, detectorRead, qualification, artifactRoot = 'artifacts', now, sleep, executor } = options;
  const actuator = makeActuator(profile, mode, actuatorTransport, qualification);
  const sensor = makeSensor(profile, mode, sensorTransport);
  const detector = makeDetector(profile, mode, detectorRead);
  return new DeviceControlService({ profile, actuator, sensor, detector, mode, artifactRoot, now, sleep, executor });
}
