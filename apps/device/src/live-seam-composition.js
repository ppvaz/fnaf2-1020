/** Synthetic-port LIVE-MODE seam composition for gate conformance only.
 *
 * This mirrors calibration-fixture.js but drives DeviceControlService with
 * mode 'live' so the live-only gates -- the formal seam-actuator
 * qualification record and the profile-bound calibration-state digest --
 * are exercised end to end over logical ports. It is test scaffolding:
 * it strips `dryRunOnly` from the profile it is handed (real handset
 * profiles keep that flag until their measured bindings exist), and the
 * CLI's live calibrate path remains HOLD independent of this module.
 * Nothing here opens a device.
 */
import { validateMeasurement, validateRawSample, stableHash } from '@fnaf2-1020/core/contracts';
import { FixtureActuator } from '@fnaf2-1020/adapters/actuators';
import { calibrationStateRuleDigest, parseCalibrationStateRule } from '@fnaf2-1020/adapters';
import { resolveProfile } from '@fnaf2-1020/adapters/registry';
import { DeviceControlService } from './service.js';
import { parseSeamActuatorQualification } from './seam-calibration.js';

/** @param {any} options */
export async function composeSeamFixtureLive({ profile, spec, stateRule = null, qualification = null,
  bindProfileHash = null, artifactRoot }) {
  let digest = null;
  if (stateRule !== null) {
    digest = calibrationStateRuleDigest(parseCalibrationStateRule(stateRule));
    if (profile.calibrations?.['calibration-state'] !== digest)
      throw new TypeError('calibration-state digest does not match the profile calibration binding');
  } else if (profile.calibrations?.['calibration-state'] === undefined) {
    // Fall through: the runner itself must refuse the unbound profile.
  }
  const clock = { value: 1000, session: 'live-seam-conformance-clock-v1',
    now() { return this.value; },
    async sleep(ms) { this.value += ms; } };
  const plant = { screen: 'NIGHT', monitor: 'DOWN', mask: 'OFF' };
  class ConformanceActuator extends FixtureActuator {
    blocks = [];
    stopped = false;
    qualification = null;
    seamQualification = null;
    capabilities() { return { adapter: profile.actuator, verification: 'external',
      claimLevel: 'DEVICE_MEASURED', calibrationProtocol: 'seam-block-v1' }; }
    async executeCalibrationBlock(block, { signal }) {
      const check = () => {
        if (signal.aborted || this.stopped) throw new Error('conformance block aborted');
        if (clock.now() >= block.deadline.value) throw new Error('conformance block deadline');
      };
      check();
      const startedAt = clock.now();
      this.blocks.push(structuredClone({ ...block, startedAt }));
      for (const step of block.steps) {
        await clock.sleep(Math.max(0, startedAt + step.atMs - clock.now()));
        check();
        for (const control of step.controls) {
          if (control === 'mask') plant.mask = plant.mask === 'ON' ? 'OFF' : 'ON';
          if (control === 'monitor') plant.monitor = plant.monitor === 'UP' ? 'DOWN' : 'UP';
        }
        await clock.sleep(step.durationMs);
        check();
      }
      await clock.sleep(Math.max(0, startedAt + block.durationMs - clock.now()));
      check();
      return { blockId: block.id, status: 'SENT', completed: true,
        clockModel: 'conformance-logical-ms', gameAcceptance: 'UNKNOWN' };
    }
    abort() { this.stopped = true; }
    releaseAll() {}
  }
  const actuator = new ConformanceActuator({ now: clock.now.bind(clock) });
  const sensor = {
    sequence: 0,
    async sample(request) {
      if (request.signalAbort?.aborted) throw new Error('conformance capture aborted');
      await clock.sleep(17);
      return validateRawSample({ schema: 'raw-sample-v1', id: request.id,
        format: 'fixture-rgba-v1', dimensions: { width: 16, height: 16 }, rate: 1000 / 17,
        acquisition: { clock: 'host-monotonic-ms', at: clock.now() },
        receivedAt: { clock: 'host-monotonic-ms', value: clock.now() },
        source: { sensor: 'fixture-visual', session: clock.session, sequence: ++this.sequence,
          acquisitionBasis: 'fixture-source', uncertaintyMs: 0 },
        calibration: { profile: digest ?? 'unbound-state-rule' }, loss: null, payload: { ...plant } });
    },
  };
  const detector = {
    detect(raw) {
      return validateMeasurement({ schema: 'measurement-v1', id: `${raw.id}-measurement`,
        signal: 'calibrationState', confidence: raw.loss ? 0 : 1,
        ...(raw.loss ? { state: 'UNKNOWN', reason: 'fixture-capture-loss' } : { state: 'OBSERVED', value: raw.payload }),
        observedAt: { clock: raw.acquisition.clock, value: raw.acquisition.at }, receivedAt: raw.receivedAt,
        source: { ...raw.source, detector: 'fixture-detector', calibrationProfile: raw.calibration.profile } });
    },
  };
  const service = new DeviceControlService({ actuator, sensor, detector, artifactRoot,
    profile: { ...profile, limits: { ...profile.limits, dryRunOnly: false } },
    now: clock.now.bind(clock), sleep: clock.sleep.bind(clock), mode: 'live',
    modelHash: 'live-seam-conformance-v1', policyHash: 'seam-calibration-runner-v1',
    calibrationClock: 'host-monotonic-ms', calibrationClockSession: clock.session });
  // The transport-level qualification-v1 evidence satisfies live preflight;
  // the formal seam record is a separate, profile-hash-bound contract.
  const runId = `run-conformance-${stableHash({ profile: profile.id, digest }).slice(-12)}`;
  actuator.qualification = { schema: 'qualification-v1', claimLevel: 'DEVICE_MEASURED',
    policyHash: 'seam-calibration-runner-v1', modelHash: 'live-seam-conformance-v1',
    sampleCount: 2, verdict: 'PASS', evidenceId: `${runId}-transport` };
  const profileHash = stableHash(resolveProfile({ ...profile, limits: { ...profile.limits, dryRunOnly: false } }));
  if (qualification !== null) {
    const record = parseSeamActuatorQualification(qualification);
    actuator.seamQualification = { ...record, profileHash: bindProfileHash ?? profileHash };
  } else {
    actuator.seamQualification = parseSeamActuatorQualification({
      schema: 'seam-actuator-qualification-v1', schema_version: 1, verdict: 'QUALIFIED',
      calibrationProtocol: 'seam-block-v1', actuator: profile.actuator,
      profileHash: bindProfileHash ?? profileHash,
      completion: { mechanism: 'conformance-logical-clock', evidenceId: `${runId}-completion` },
      cancellation: { mechanism: 'abort-signal', evidenceId: `${runId}-cancellation` },
      evidenceId: `${runId}-qualification` });
  }
  service.startSession();
  const result = await service.executeCalibration({ ...spec, profileId: profile.id });
  return { result, service, actuator, clock, plant };
}
