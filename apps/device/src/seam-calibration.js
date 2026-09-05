/** One bounded semantic experiment at a time. No coordinates, ADB, HID bytes,
 * or video-derived execution epochs. The service owns the sole input writer;
 * this runner owns state gates and retains UNKNOWN acceptance explicitly. */
import { stableHash, validateMeasurement } from '@fnaf2-1020/core/contracts';
import { mapClockInterval } from '@fnaf2-1020/adapters';

const fail = reason => { throw new Error(`seam calibration: ${reason}`); };
const integer = (name, value, min, max) => {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${name} must be in ${min}..${max}`);
};

export function validateSeamSpec(input, profile) {
  if (input?.schema !== 'seam-calibration-spec-v1' || !/^[\w.-]{1,64}$/.test(input.id ?? '')) fail('invalid spec');
  const keys = ['schema', 'id', 'profileId', 'probe', 'contactMs', 'probeContactMs', 'restoreContactMs',
    'maskOnMs', 'restoreSettleMs', 'resetTimeoutMs', 'maxDurationMs', 'maxObservationAgeMs',
    'maxObservations', 'maxClockUncertaintyMs', 'rounds', 'gapsMs', 'startDelaysMs'];
  if (Object.keys(input).some(key => !keys.includes(key))) fail('unknown spec field');
  if (input.profileId !== profile.id) fail('profile mismatch');
  if (!['hall', 'monitor', 'compound'].includes(input.probe)) fail('unknown probe');
  const spec = structuredClone(input);
  for (const key of ['contactMs', 'probeContactMs', 'restoreContactMs']) integer(key, spec[key], 1, 1000);
  integer('maskOnMs', spec.maskOnMs, spec.contactMs + 1, 2000);
  integer('restoreSettleMs', spec.restoreSettleMs, 1, 2000);
  integer('resetTimeoutMs', spec.resetTimeoutMs, spec.restoreSettleMs + spec.restoreContactMs + 1, 5000);
  integer('maxDurationMs', spec.maxDurationMs, 1, Math.min(30000, profile.limits?.maxDurationMs ?? 15000));
  integer('maxObservationAgeMs', spec.maxObservationAgeMs, 1, 500);
  integer('maxObservations', spec.maxObservations, 4, 128);
  if (!Number.isFinite(spec.maxClockUncertaintyMs) || spec.maxClockUncertaintyMs < 0 || spec.maxClockUncertaintyMs > spec.maxObservationAgeMs)
    fail('invalid clock uncertainty budget');
  integer('rounds', spec.rounds, 1, 4);
  if (!Array.isArray(spec.gapsMs) || !spec.gapsMs.length || spec.gapsMs.length * spec.rounds > 8) fail('need 1..8 trials');
  spec.gapsMs.forEach(gap => integer('gapMs', gap, spec.contactMs + 1, 2000));
  const trials = spec.gapsMs.length * spec.rounds;
  if (!Array.isArray(spec.startDelaysMs) || spec.startDelaysMs.length !== trials) fail('one start delay per trial is required');
  spec.startDelaysMs.forEach(delay => integer('startDelayMs', delay, 0, 1000));
  // Budget the experiment including state restoration. Timing is a requested
  // protocol; it is not a calibration of handset latency or game phase.
  const duration = spec.resetTimeoutMs + spec.rounds * spec.gapsMs.reduce((total, gap) =>
    total + spec.maskOnMs + gap + spec.probeContactMs + spec.resetTimeoutMs, 0)
    + spec.startDelaysMs.reduce((a, b) => a + b, 0);
  if (duration > spec.maxDurationMs) fail('protocol exceeds duration budget');
  const actionBudget = 2 + trials * (spec.probe === 'compound' ? 6 : 5);
  if (actionBudget > (profile.limits?.maxActions ?? 64)) fail('protocol exceeds action budget');
  return spec;
}

export function seamBlock(spec, gapMs, id) {
  return {
    schema: 'seam-block-v1', id, kind: 'probe', durationMs: spec.maskOnMs + gapMs + spec.probeContactMs,
    steps: [
      { id: `${id}-mask-on`, atMs: 0, controls: ['mask'], durationMs: spec.contactMs },
      { id: `${id}-mask-off`, atMs: spec.maskOnMs, controls: ['mask'], durationMs: spec.contactMs },
      { id: `${id}-probe`, atMs: spec.maskOnMs + gapMs,
        controls: spec.probe === 'compound' ? ['hall', 'monitor'] : [spec.probe], durationMs: spec.probeContactMs },
    ],
  };
}

export class SeamCalibrationRunner {
  /** @param {any} options */
  constructor({ spec, profile, profileHash, runId, now, clockName, clockSession, sleep, observe, executeBlock, event,
    signal, clockMap = null, active = () => true }) {
    this.spec = validateSeamSpec(spec, profile);
    this.stateCalibration = profile.calibrations['calibration-state'];
    if (!this.stateCalibration) fail('positive office/mask state calibration is not bound');
    if (!['host-monotonic-ms', 'device-monotonic-ms'].includes(clockName)) fail('executor clock is undeclared');
    if (typeof clockSession !== 'string' || !clockSession) fail('executor clock session is undeclared');
    this.clockSession = clockSession; this.runId = runId;
    this.profileHash = profileHash; this.now = now; this.clockName = clockName;
    this.sleep = sleep; this.observe = observe; this.executeBlock = executeBlock;
    this.event = event; this.signal = signal; this.active = active;
    this.clockMap = clockMap ? structuredClone(clockMap) : null;
    this.lastSequence = -1; this.lastCaptureAt = -1; this.sourceSession = null; this.observationCount = 0;
    this.trials = [];
  }

  check(deadline) {
    if (this.signal?.aborted || !this.active()) fail('aborted');
    if (this.now() >= deadline) fail('deadline expired');
  }

  // A never-resolving sensor/actuator must also release the service lease.
  // Ports receive the abort signal and must terminate their pending I/O on
  // service abort; a Promise resolving late never authorizes another block.
  async bounded(deadline, operation) {
    this.check(deadline);
    let timer;
    let aborted;
    try {
      const value = await Promise.race([
        Promise.resolve().then(() => { this.check(deadline); return operation(); }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('seam calibration: I/O deadline expired')), deadline - this.now());
          aborted = () => reject(new Error('seam calibration: aborted'));
          this.signal?.addEventListener('abort', aborted, { once: true });
        }),
      ]);
      this.check(deadline);
      return value;
    } finally {
      clearTimeout(timer);
      if (aborted) this.signal?.removeEventListener('abort', aborted);
    }
  }

  async stableState(deadline, notBefore) {
    let previous = null;
    for (;;) {
      if (++this.observationCount > this.spec.maxObservations) fail('observation budget exhausted');
      const measurement = await this.bounded(deadline, () => this.observe({
        id: `${this.spec.id}-observe-${this.observationCount}`, signal: 'calibrationState', signalAbort: this.signal,
      }));
      validateMeasurement(measurement);
      this.event('calibration.observation', measurement);
      const source = measurement.source;
      if (source.calibrationProfile !== this.stateCalibration) fail('state calibration mismatch');
      if (!Number.isSafeInteger(source.sequence) || source.sequence <= this.lastSequence) fail('duplicate or reordered frame');
      if (typeof source.session !== 'string' || !source.session || (this.sourceSession && source.session !== this.sourceSession))
        fail('sensor session changed or is absent');
      this.lastSequence = source.sequence; this.sourceSession = source.session;
      if (!['image-timestamp', 'snapshot-minus-age-upper-bound', 'fixture-source'].includes(source.acquisitionBasis))
        fail('capture timestamp is unverified');
      if (measurement.observedAt.value <= this.lastCaptureAt) fail('capture time is not advancing');
      this.lastCaptureAt = measurement.observedAt.value;
      const interval = mapClockInterval(measurement.observedAt, {
        targetClock: this.clockName, targetSession: this.clockSession, sourceSession: source.session,
        uncertaintyMs: source.uncertaintyMs, mapping: this.clockMap,
      });
      this.event('calibration.capture-mapped', { measurementId: measurement.id, ...interval });
      if (interval.uncertaintyMs > this.spec.maxClockUncertaintyMs) fail('clock uncertainty exceeds budget');
      if (interval.latestMs > this.now()) fail('capture is in the future');
      if (this.now() - interval.earliestMs > this.spec.maxObservationAgeMs) fail('capture is stale');
      const value = measurement.state === 'OBSERVED' && measurement.signal === 'calibrationState' ? measurement.value : null;
      if (value?.screen && !['NIGHT', 'UNKNOWN'].includes(value.screen)) fail('night is no longer observed');
      if (interval.earliestMs < notBefore || !value || value.screen !== 'NIGHT' ||
          !['UP', 'DOWN'].includes(value.monitor) || !['ON', 'OFF'].includes(value.mask)) {
        previous = null;
        await this.bounded(deadline, () => this.sleep(1));
        continue;
      }
      if (value.monitor === 'UP' && value.mask === 'ON') fail('contradictory monitor/mask state');
      if (previous && previous.value.monitor === value.monitor && previous.value.mask === value.mask)
        return { value, interval, measurementId: measurement.id };
      previous = { value };
    }
  }

  async send(block, deadline) {
    // Reserve the whole requested macro; no screenshot is inserted between
    // mask-off and probe. Only a device-local, completion-aware port can
    // implement this contract; a successful FIFO write is insufficient.
    if (this.now() + block.durationMs >= deadline) fail('block cannot fit before deadline');
    const request = { ...block, profileHash: this.profileHash,
      requestedAt: { clock: this.clockName, value: this.now() },
      deadline: { clock: this.clockName, value: deadline } };
    this.event('calibration.block.requested', request);
    const result = await this.bounded(deadline, () => this.executeBlock(request, this.signal));
    if (result?.blockId !== block.id || result.status !== 'SENT' || result.completed !== true)
      fail('block completion is unknown or failed');
    if (this.now() < request.requestedAt.value + block.durationMs)
      fail('block completed before requested duration');
    this.event('calibration.block.completed', { blockId: block.id, result,
      receivedAt: { clock: this.clockName, value: this.now() }, gameAcceptance: 'UNKNOWN' });
    return result;
  }

  async restoreOffice(deadline, notBefore) {
    const corrected = new Set();
    for (;;) {
      const state = await this.stableState(deadline, notBefore);
      if (state.value.monitor === 'DOWN' && state.value.mask === 'OFF') return state;
      const control = state.value.monitor === 'UP' ? 'monitor' : 'mask';
      if (corrected.has(control)) fail(`${control} restore did not land; no blind retry`);
      corrected.add(control);
      const id = `${this.runId}-${this.spec.id}-restore-${this.observationCount}-${control}`;
      await this.send({ schema: 'seam-block-v1', kind: 'restore', id,
        durationMs: this.spec.restoreContactMs,
        steps: [{ id, atMs: 0, controls: [control], durationMs: this.spec.restoreContactMs }] }, deadline);
      notBefore = this.now();
      await this.bounded(deadline, () => this.sleep(this.spec.restoreSettleMs));
    }
  }

  async run() {
    const spec = this.spec;
    const startedAt = this.now(), deadline = startedAt + spec.maxDurationMs;
    const trials = this.trials;
    let state = await this.restoreOffice(Math.min(deadline, this.now() + spec.resetTimeoutMs), startedAt);
    for (let round = 0; round < spec.rounds; round++) {
      const order = round % 2 ? [...spec.gapsMs].reverse() : spec.gapsMs;
      for (const gapMs of order) {
        const index = trials.length;
        const delay = spec.startDelaysMs[index];
        if (delay) {
          await this.bounded(deadline, () => this.sleep(delay));
          // Deliberate start delay is NOT measured game phase. Re-observe if
          // the delay could leave us acting on an old office state.
          state = await this.stableState(Math.min(deadline, this.now() + spec.resetTimeoutMs), this.now());
          if (state.value.monitor !== 'DOWN' || state.value.mask !== 'OFF') fail('precondition changed during start delay');
        }
        this.check(deadline);
        if (this.now() - state.interval.earliestMs > spec.maxObservationAgeMs) fail('office precondition expired');
        const id = `${this.runId}-${spec.id}-trial-${index}`;
        const trial = { id, index, round, gapMs, startDelayMs: delay,
          precondition: state.measurementId, status: 'STARTED', gameAcceptance: 'UNKNOWN' };
        trials.push(trial);
        this.event('calibration.trial.started', { ...trial });
        await this.send(seamBlock(spec, gapMs, id), deadline);
        // All subsequent observations must be newer than the completed block.
        state = await this.restoreOffice(Math.min(deadline, this.now() + spec.resetTimeoutMs), this.now());
        trial.status = 'RESTORED'; trial['restoration'] = state.measurementId;
        this.event('calibration.trial.restored', { id, restoration: state.measurementId });
      }
    }
    return { schema: 'seam-calibration-result-v1', specHash: stableHash(spec),
      profileHash: this.profileHash, trials, observationCount: this.observationCount,
      elapsedMs: this.now() - startedAt, workflow: 'COMPLETED',
      calibration: 'UNVERIFIED', reason: 'ID-matched-app-dispatch-and-game-effect-evidence-required' };
  }
}
