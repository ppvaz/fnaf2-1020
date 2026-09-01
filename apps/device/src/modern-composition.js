/**
 * Plan 22's physical composition seam.  The device app owns selection and
 * wiring; adapter transports own HID bytes and cue-helper protocol.  The
 * caller supplies already-open, synchronous device-local ports so scheduling
 * does not hide an adb round trip in the control loop.
 */
import { HidWireTransport, CueHelperControlTransport, measureMonitorUp,
  monitorRuleDigest, parseMonitorRule } from '@fnaf2-1020/adapters';
import { composeDevice } from './composition.js';

/**
 * One observation = one GET snapshot + one GRID sensor read. The detector
 * refuses when the two frames disagree (grid-seq-mismatch), so anchors are
 * never evaluated against a stale sensor row.
 * @param {any} cueTransport */
function observe(cueTransport) {
  const snapshot = cueTransport.snapshot();
  const grid = cueTransport.grid();
  return { ...snapshot, gridSeq: grid.seq, cells: grid.cells };
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
    mode = 'live', sleep, monitorRule } = options;
  if (!profile || profile.actuator !== 'hid-multi' || profile.visualSensor !== 'mediaprojection')
    throw new TypeError('modern composition requires the HID + MediaProjection profile');
  if (mode !== 'live') throw new TypeError('modern composition is explicitly live; use composeDevice for dry-run');
  let boundedMonitorRule;
  if (monitorRule !== undefined) {
    boundedMonitorRule = parseMonitorRule(monitorRule);
    if (profile.calibrations?.monitorRule !== monitorRuleDigest(boundedMonitorRule))
      throw new TypeError('monitor rule digest does not match the profile calibration binding');
  }
  const hidTransport = hid instanceof HidWireTransport ? hid : new HidWireTransport(hid);
  const cueTransport = cue instanceof CueHelperControlTransport ? cue : new CueHelperControlTransport(cue);
  return composeDevice({
    profile, mode, qualification, artifactRoot, now, sleep,
    executor: options.executor,
    actuatorTransport: hidTransport,
    sensorTransport: { capture: () => observe(cueTransport) },
    detectorRead: raw => measureMonitorUp(raw.payload, boundedMonitorRule ?? null),
  });
}
