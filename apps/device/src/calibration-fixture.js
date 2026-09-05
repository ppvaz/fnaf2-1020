/** Offline plumbing fixture, NOT an FNaF plant or handset timing model.
 * A logical millisecond clock exercises the service's serialized state gates;
 * only the declared fixture profile is accepted. Nothing opens a device.
 */
import { validateMeasurement, validateRawSample } from '@fnaf2-1020/core/contracts';
import { FixtureActuator } from '@fnaf2-1020/adapters/actuators';
import { DeviceControlService } from './service.js';

/** @param {any} options */
export function composeSeamFixture({ profile, artifactRoot }) {
  if (profile.id !== 'fixture-hid-screencap' || profile.actuator !== 'fixture-hid' ||
      profile.limits?.dryRunOnly !== true || profile.calibrations['calibration-state'] !== 'fixture-seam-state-v1')
    throw new Error('seam fixture requires the explicit fixture profile and state calibration');
  const clock = { value: 1000, session: 'fixture-seam-logical-clock-v1',
    now() { return this.value; },
    async sleep(ms) { this.value += ms; },
  };
  const plant = { screen: 'NIGHT', monitor: 'DOWN', mask: 'OFF' };
  class SeamActuator extends FixtureActuator {
    blocks = [];
    releases = 0;
    aborts = 0;
    stopped = false;
    capabilities() { return { ...super.capabilities(), calibrationProtocol: 'seam-block-v1' }; }
    async executeCalibrationBlock(block, { signal }) {
      const check = () => {
        if (signal.aborted || this.stopped) throw new Error('fixture block aborted');
        if (clock.now() >= block.deadline.value) throw new Error('fixture block deadline');
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
        clockModel: 'fixture-logical-ms', gameAcceptance: 'UNKNOWN' };
    }
    abort() { this.aborts++; this.stopped = true; }
    releaseAll() { this.releases++; }
  }
  const actuator = new SeamActuator({ now: clock.now.bind(clock) });
  const sensor = {
    sequence: 0,
    async sample(request) {
      if (request.signalAbort?.aborted) throw new Error('fixture capture aborted');
      await clock.sleep(17);
      return validateRawSample({ schema: 'raw-sample-v1', id: request.id,
        format: 'fixture-rgba-v1', dimensions: { width: 16, height: 16 }, rate: 1000 / 17,
        acquisition: { clock: 'host-monotonic-ms', at: clock.now() },
        receivedAt: { clock: 'host-monotonic-ms', value: clock.now() },
        source: { sensor: 'fixture-visual', session: clock.session, sequence: ++this.sequence,
          acquisitionBasis: 'fixture-source', uncertaintyMs: 0 },
        calibration: { profile: 'fixture-seam-state-v1' }, loss: null, payload: { ...plant } });
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
  const service = new DeviceControlService({ profile, actuator, sensor, detector, artifactRoot,
    now: clock.now.bind(clock), sleep: clock.sleep.bind(clock), mode: 'dry-run',
    modelHash: 'fixture-seam-plumbing-v1', policyHash: 'seam-calibration-runner-v1',
    calibrationClock: 'host-monotonic-ms', calibrationClockSession: clock.session });
  return { service, clock, plant, actuator, sensor, detector };
}
