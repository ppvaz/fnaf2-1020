/**
 * Explicit adapter registry. Backend differences stay in capabilities and
 * profiles; controllers never branch on adapter names. CONTRACT:capability-v1.
 */
import { validateCapability, validateProfile } from '@fnaf2-1020/core/contracts';

const freeze = value => Object.freeze(value);
const deepFreeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};
const capabilities = [
  freeze({ schema: 'capability-v1', adapter: 'sim-actuator', actions: ['press', 'release', 'hold', 'select'], controls: ['mask', 'monitor', 'light', 'hall', 'wind', 'ventL', 'ventR', 'cam:4', 'cam:7', 'cam:9', 'cam:10', 'cam:11'], clock: 'simulator-frame', verification: 'internal', claimLevel: 'MODEL_ONLY', limitations: ['simulated plant only'] }),
  freeze({ schema: 'capability-v1', adapter: 'fixture-hid', actions: ['press', 'release', 'hold', 'select'], controls: ['mask', 'monitor', 'light', 'hall', 'wind', 'ventL', 'ventR', 'cam:4', 'cam:7', 'cam:9', 'cam:10', 'cam:11'], clock: 'device-monotonic-ms', verification: 'external', claimLevel: 'FIXTURE', limitations: ['no physical acceptance claim'] }),
  freeze({ schema: 'capability-v1', adapter: 'adb-tap', actions: ['press', 'release'], controls: ['mask', 'monitor', 'light', 'hall', 'wind', 'ventL', 'ventR', 'cam:4', 'cam:7', 'cam:9', 'cam:10', 'cam:11'], clock: 'device-monotonic-ms', verification: 'external', claimLevel: 'DEVICE_MEASURED', limitations: ['serialized host-mediated input', 'no multitouch'] }),
  freeze({ schema: 'capability-v1', adapter: 'hid-multi', actions: ['press', 'release', 'hold', 'select'], controls: ['mask', 'monitor', 'light', 'hall', 'wind', 'ventL', 'ventR', 'cam:4', 'cam:7', 'cam:9', 'cam:10', 'cam:11'], clock: 'device-monotonic-ms', verification: 'external', claimLevel: 'DEVICE_MEASURED', limitations: ['requires profile calibration', 'send is not game acceptance'] }),
  freeze({ schema: 'capability-v1', adapter: 'screencap', actions: [], controls: [], clock: 'device-monotonic-ms', format: 'rgba8888', verification: 'none', claimLevel: 'DEVICE_MEASURED', limitations: ['raw visual samples only'] }),
  freeze({ schema: 'capability-v1', adapter: 'mediaprojection', actions: [], controls: [], clock: 'device-monotonic-ms', format: 'rgba8888', verification: 'none', claimLevel: 'DEVICE_MEASURED', limitations: ['requires MediaProjection permission and retained frame metadata'] }),
  freeze({ schema: 'capability-v1', adapter: 'a2dp-pcm', actions: [], controls: [], clock: 'audio-sample', format: 'pcm-s16le', verification: 'none', claimLevel: 'DEVICE_MEASURED', limitations: ['audio samples do not prove game state'] }),
  freeze({ schema: 'capability-v1', adapter: 'fixture-visual', actions: [], controls: [], clock: 'host-monotonic-ms', format: 'fixture-rgba-v1', verification: 'none', claimLevel: 'FIXTURE', limitations: ['synthetic samples only'] }),
  freeze({ schema: 'capability-v1', adapter: 'fixture-detector', actions: [], controls: [], clock: 'host-monotonic-ms', acceptsFormats: ['fixture-rgba-v1'], verification: 'none', claimLevel: 'FIXTURE', limitations: ['accepts fixture-rgba-v1 only'] }),
  freeze({ schema: 'capability-v1', adapter: 'cue-helper-detector', actions: [], controls: [], clock: 'device-monotonic-ms', acceptsFormats: ['rgba8888'], verification: 'none', claimLevel: 'DEVICE_MEASURED', limitations: ['helper loss is UNKNOWN'] }),
  freeze({ schema: 'capability-v1', adapter: 'screencheck-detector', actions: [], controls: [], clock: 'device-monotonic-ms', acceptsFormats: ['rgba8888'], verification: 'none', claimLevel: 'DEVICE_MEASURED', limitations: ['classifier output is not game acceptance'] }),
  freeze({ schema: 'capability-v1', adapter: 'host-clock', actions: [], controls: [], clock: 'host-monotonic-ms', verification: 'none', claimLevel: 'FIXTURE', limitations: ['clock supplied by composition root'] }),
  freeze({ schema: 'capability-v1', adapter: 'simulator-clock', actions: [], controls: [], clock: 'simulator-frame', verification: 'none', claimLevel: 'MODEL_ONLY', limitations: ['logical time only'] }),
];
for (const capability of capabilities) validateCapability(capability);

export const ADAPTER_REGISTRY = Object.freeze(capabilities.reduce((map, capability) => {
  map[capability.adapter] = capability;
  return map;
}, {}));

export function getCapability(id) {
  const capability = ADAPTER_REGISTRY[id];
  if (!capability) throw new Error(`adapter capability not registered: ${id}`);
  return capability;
}

export function resolveProfile(profile, { requireCalibration = true } = {}) {
  validateProfile(profile);
  const actuator = getCapability(profile.actuator);
  const sensor = getCapability(profile.visualSensor);
  const detector = getCapability(profile.visualDetector);
  if (!actuator.actions.length) throw new Error(`profile actuator has no actions: ${profile.actuator}`);
  if (requireCalibration) {
    for (const key of ['geometry', 'actuator-timing', 'visual', 'detector']) {
      const value = profile.calibrations[key];
      if (typeof value !== 'string' || !value.length)
        throw new Error(`profile ${profile.id} contains an unbound calibration: ${key}`);
    }
    if (profile.calibrations.visual !== profile.calibrations.detector)
      throw new Error(`profile ${profile.id} has incompatible visual/detector calibrations`);
  }
  if (typeof sensor.format !== 'string' || !Array.isArray(detector.acceptsFormats) ||
      !detector.acceptsFormats.includes(sensor.format))
    throw new Error(`profile ${profile.id} pairs detector ${profile.visualDetector} with ` +
      `sensor format ${sensor.format ?? 'undeclared'} it cannot consume`);
  if (!profile.controlMap || typeof profile.controlMap !== 'object') throw new Error(`profile ${profile.id} has no semantic control map`);
  for (const control of actuator.controls) {
    const point = profile.controlMap[control];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error(`profile ${profile.id} has no coordinate binding for ${control}`);
  }
  // Resolution owns the immutable result. Do not freeze nested objects in the
  // caller's parsed JSON; qualification code may need to derive a candidate
  // without having validation unexpectedly mutate its input.
  return deepFreeze({ ...structuredClone(profile), capabilities: actuator,
    sensorCapabilities: sensor, detectorCapabilities: detector });
}

export function listAdapters() { return Object.values(ADAPTER_REGISTRY); }
