/**
 * Plan 22's physical composition seam.  The device app owns selection and
 * wiring; adapter transports own HID bytes and cue-helper protocol.  The
 * caller supplies already-open, synchronous device-local ports so scheduling
 * does not hide an adb round trip in the control loop.
 */
import { HidWireTransport, CueHelperControlTransport, measureMonitorUp,
  monitorRuleDigest, parseMonitorRule, measureCalibrationState,
  calibrationStateRuleDigest, parseCalibrationStateRule } from '@fnaf2-1020/adapters';
import { composeDevice } from './composition.js';
import { createAdbModernPorts } from './physical-ports.js';

/**
 * One observation = one FRAME read: snapshot fields and the sensor serialized
 * from the same locked read on the device, so the detector's freshness, screen
 * identity and anchor cells all describe one frame.
 *
 * This was GET followed by GRID, with the detector refusing when the two
 * disagreed (grid-seq-mismatch). The refusal was right and the pairing was
 * not: measured on the moto g56, the two sequences agreed 0 times in 12,
 * always 1-2 frames apart, because they are separate round trips against a
 * 60 fps capture. Every live observation refused, so no positive state was
 * ever reachable and the seam runner's two-consecutive-positives could never
 * be satisfied. No fixture could show it -- a fixture returns one synthetic
 * snapshot whose sequences match by construction.
 * @param {any} cueTransport */
function observe(cueTransport) {
  const snapshot = cueTransport.frame();
  return {
    ...snapshot,
    measurements: {
      cameraSelected: cueTransport.cameraMeasurement(snapshot),
      cameraHighlights: cueTransport.cameraHighlightsMeasurement(snapshot),
      batteryPercent: cueTransport.batteryMeasurement(snapshot),
    },
  };
}

/**
 * Compose the current HID + MediaProjection profile from explicit ports.
 * `hid.write` writes one JSONL hid-executor-v1 line near Android and
 * `cue.request` performs one authenticated cue-helper request on the same
 * device-local path. No policy, coordinates, or timing mode is inferred.
 * `monitorRule` is an optional parsed `monitor-rule-v1` artifact; when
 * supplied, the profile's `calibrations.monitorRule` must carry the artifact
 * digest, so composition refuses an unbound or mismatched calibration.
 */
/** @param {any} options */
export function composeModernDevice(options = {}) {
  const { profile, hid, cue, qualification, artifactRoot = 'artifacts', now,
    mode = 'live', sleep, monitorRule, calibrationStateRule } = options;
  if (!profile || profile.actuator !== 'hid-multi' || profile.visualSensor !== 'mediaprojection')
    throw new TypeError('modern composition requires the HID + MediaProjection profile');
  if (mode !== 'live') throw new TypeError('modern composition is explicitly live; use composeDevice for dry-run');
  let boundedMonitorRule;
  if (monitorRule !== undefined) {
    boundedMonitorRule = parseMonitorRule(monitorRule);
    if (profile.calibrations?.monitorRule !== monitorRuleDigest(boundedMonitorRule))
      throw new TypeError('monitor rule digest does not match the profile calibration binding');
  }
  // A profile that binds `calibration-state` demands the matching measured
  // artifact at composition; without the binding the seam runner keeps
  // refusing live calibration, which is the correct default.
  let boundedCalibrationStateRule;
  if (calibrationStateRule !== undefined || profile.calibrations?.['calibration-state'] !== undefined) {
    if (calibrationStateRule === undefined)
      throw new TypeError('profile binds calibration-state but no measured artifact was supplied');
    boundedCalibrationStateRule = parseCalibrationStateRule(calibrationStateRule);
    if (profile.calibrations?.['calibration-state'] !==
        calibrationStateRuleDigest(boundedCalibrationStateRule))
      throw new TypeError('calibration-state digest does not match the profile calibration binding');
  }
  const hidTransport = hid instanceof HidWireTransport ? hid : new HidWireTransport(hid);
  const cueTransport = cue instanceof CueHelperControlTransport ? cue : new CueHelperControlTransport(cue);
  return composeDevice({
    profile, mode, qualification, artifactRoot, now, sleep,
    executor: options.executor,
    actuatorTransport: hidTransport,
    sensorTransport: { capture: request => {
      const payload = observe(cueTransport);
      const { sequence, ...acquisition } = cueTransport.visualAcquisition(payload);
      return {
        schema: 'raw-sample-v1', id: `mediaprojection-${request.id ?? sequence}`,
        format: 'rgba8888', dimensions: { width: 20, height: 9 }, rate: 60,
        acquisition, source: { sensor: 'mediaprojection', sequence },
        calibration: { profile: profile.calibrations.visual }, loss: null, payload,
      };
    } },
    detectorRead: raw => boundedCalibrationStateRule
      ? measureCalibrationState(raw.payload, boundedCalibrationStateRule)
      : measureMonitorUp(raw.payload, boundedMonitorRule ?? null),
  });
}

/**
 * Open the named physical ports from one explicitly selected ADB device.
 * Profile, qualification, and artifact executor gates are still enforced by
 * composeModernDevice and DeviceControlService.
 */
/** @param {any} options */
export function composeAdbModernDevice(options = {}) {
  const { serial, adb = 'adb' } = options;
  const ports = createAdbModernPorts({ serial, adb });
  try {
    const service = composeModernDevice({ ...options, hid: ports.hid, cue: ports.cue });
    /** @type {any} */ (service).closePhysicalPorts = ports.close;
    return service;
  } catch (error) {
    void ports.close();
    throw error;
  }
}
