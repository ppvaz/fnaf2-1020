/**
 * Plan 22's physical composition seam.  The device app owns selection and
 * wiring; adapter transports own HID bytes and cue-helper protocol.  The
 * caller supplies already-open, synchronous device-local ports so scheduling
 * does not hide an adb round trip in the control loop.
 */
import { HidWireTransport, CueHelperControlTransport } from '@fnaf2-1020/adapters';
import { composeDevice } from './composition.js';

/**
 * Compose the current HID + MediaProjection profile from explicit ports.
 * `hid.write` writes one JSONL hid-executor-v1 line near Android and
 * `cue.request` performs one authenticated cue-helper request on the same
 * device-local path. No policy, coordinates, or timing mode is inferred.
 */
/** @param {any} options */
export function composeModernDevice(options = {}) {
  const { profile, hid, cue, qualification, artifactRoot = 'artifacts', now,
    mode = 'live', sleep } = options;
  if (!profile || profile.actuator !== 'hid-multi' || profile.visualSensor !== 'mediaprojection')
    throw new TypeError('modern composition requires the HID + MediaProjection profile');
  if (mode !== 'live') throw new TypeError('modern composition is explicitly live; use composeDevice for dry-run');
  const hidTransport = hid instanceof HidWireTransport ? hid : new HidWireTransport(hid);
  const cueTransport = cue instanceof CueHelperControlTransport ? cue : new CueHelperControlTransport(cue);
  return composeDevice({
    profile, mode, qualification, artifactRoot, now, sleep,
    executor: options.executor,
    actuatorTransport: hidTransport,
    sensorTransport: { capture: () => cueTransport.snapshot() },
    detectorRead: raw => cueTransport.monitorMeasurement(raw.payload),
  });
}
