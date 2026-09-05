/**
 * DeviceControlService is the single local boundary for dry and live runs.
 * It owns leases, profile resolution, safety budgets, semantic trajectories,
 * telemetry, and retained results; MCP/CLI clients are thin callers.
 * CONTRACT:device-executor-v1 CONTRACT:session-manifest-v1.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { dispatchTrajectory, SafetySupervisor, makeEvent, makeManifest, validateQualification } from '@fnaf2-1020/runtime';
import { resolveProfile } from '@fnaf2-1020/adapters/registry';
import { stableHash, validateActuationResult } from '@fnaf2-1020/core/contracts';
import { validateExecutorRequest } from './artifact-executor.js';
import { SeamCalibrationRunner } from './seam-calibration.js';

const controls = Object.freeze(['monitor', 'mask', 'light', 'hall', 'ventL', 'ventR',
  'cam:10', 'cam:4', 'cam:7', 'cam:9', 'cam:11', 'wind']);

const cameraControl = control => typeof control === 'string' && control.startsWith('cam:');

/**
 * Return the monitor state an action requires, or null when the action carries
 * no monitor invariant.  Compiled artifact commands state the invariant
 * explicitly; the camera/wind defaults are a second line of defence so a
 * malformed caller cannot put camera coordinates onto the office.
 */
export function requiredMonitorState(command) {
  const declared = command?.source?.requiresMonitorUp;
  if (typeof declared === 'boolean') return declared;
  const control = command?.action?.control;
  if (cameraControl(control) || control === 'wind' || control === 'light') return true;
  if (control === 'mask' || control === 'hall' || control === 'ventL' || control === 'ventR') return false;
  return null;
}

export class DeviceControlService {
  #writer = null;
  #calibrationAbort = null;
  #abortPromise = null;
  #cleanupFault = false;

  async #withWriter(label, operation) {
    if (this.#writer !== null) throw new Error(`actuation lease held by ${this.#writer}`);
    this.#writer = label;
    try { return await operation(); }
    finally { this.#writer = null; }
  }
  /** @param {any} options */
  constructor(options = {}) {
    const { profile, actuator, sensor = null, detector = null, artifactRoot = 'artifacts', mode = 'dry-run', maxActions, now = () => performance.now(), sleep, executor = null, modelHash = 'model-sim-v1', policyHash = 'policy-fixture-v1' } = options;
    this.profile = resolveProfile(profile);
    this.actuator = actuator;
    this.artifactRoot = artifactRoot;
    this.mode = mode;
    this.maxActions = maxActions ?? this.profile.limits?.maxActions ?? 64;
    this.now = now;
    this.sleep = sleep;
    this.sensor = sensor;
    this.detector = detector;
    this.executor = executor;
    this.modelHash = modelHash;
    this.policyHash = policyHash;
    this.session = null;
    this.supervisor = null;
    this.commandKeys = new Set();
    this.calibrationClock = options.calibrationClock ?? 'host-monotonic-ms';
    this.calibrationClockSession = options.calibrationClockSession ?? null;
    this.calibrationClockMap = options.calibrationClockMap ?? null;
  }

  preflight() {
    if (!this.actuator || typeof this.actuator.apply !== 'function') throw new Error('preflight: actuator implementation is missing');
    if (this.mode === 'live' && this.profile.limits?.dryRunOnly) throw new Error(`preflight: profile ${this.profile.id} is fixture-only`);
    const actuatorId = this.actuator.capabilities?.().adapter ?? this.actuator.id;
    if (actuatorId && actuatorId !== this.profile.actuator) throw new Error(`preflight: actuator ${actuatorId} does not match profile ${this.profile.actuator}`);
    const actuatorClaim = this.actuator.capabilities?.().claimLevel;
    if (this.mode === 'live' && actuatorClaim !== 'DEVICE_MEASURED') throw new Error('preflight: live mode requires an externally qualified DEVICE_MEASURED actuator');
    if (this.mode === 'live') {
      if (!this.actuator.qualification || this.actuator.qualification.claimLevel !== 'DEVICE_MEASURED')
        throw new Error('preflight: DEVICE_MEASURED requires explicit qualification evidence; transport claims are ignored');
      try { validateQualification(this.actuator.qualification); }
      catch { throw new Error('preflight: qualification evidence does not satisfy qualification-v1'); }
    }
    if (this.mode === 'live' && (typeof this.actuator.abort !== 'function' || typeof this.actuator.releaseAll !== 'function'))
      throw new Error('preflight: live actuator must implement abort and releaseAll');
    if (this.mode === 'live' && (typeof this.sensor?.sample !== 'function' || typeof this.detector?.detect !== 'function'))
      throw new Error('preflight: live mode requires a sensor and detector in the execution loop');
    for (const control of controls) if (!this.profile.capabilities.controls.includes(control)) throw new Error(`preflight: profile does not advertise ${control}`);
    return { ok: true, profile: this.profile.id, mode: this.mode, capabilities: this.profile.capabilities, calibrations: this.profile.calibrations };
  }

  startSession({ lease = `lease-${stableHash({ profile: this.profile.id, mode: this.mode }).slice(-8)}` } = {}) {
    if (this.#writer !== null) throw new Error('actuation lease is still held');
    if (this.#cleanupFault) throw new Error('actuator cleanup is incomplete; composition is quarantined');
    this.preflight();
    if (this.session && this.session.status === 'ACTIVE') throw new Error('session lease already held');
    const id = `run-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}-${stableHash(lease).slice(-6)}`;
    const profileHash = stableHash(this.profile);
    this.session = { id, lease, status: 'ACTIVE', profileHash, modelHash: this.modelHash,
      policyHash: this.policyHash, events: [], results: [], artifacts: {} };
    this.supervisor = new SafetySupervisor({ profile: this.profile, maxActions: this.maxActions, dryRun: this.mode !== 'live' });
    this.commandKeys.clear();
    this.#abortPromise = null;
    this.event('session.started', { lease, mode: this.mode });
    return { id, lease, profile: this.profile.id, profileHash, mode: this.mode };
  }

  event(type, data = {}) {
    if (!this.session) throw new Error('session has not started');
    this.session.events.push(makeEvent(this.session.id, type, 'device-control-service', { clock: 'host-monotonic-ms', value: this.now() }, data));
  }

  trajectory() {
    if (!this.session) throw new Error('session has not started');
    const base = this.now();
    const commands = controls.map((control, index) => ({
      schema: 'control-command-v1', id: `${this.session.id}-cmd-${index + 1}`,
      action: { kind: control.startsWith('cam:') ? 'select' : 'press', control },
      requestedAt: { clock: 'device-monotonic-ms', value: base + index * 120 },
      deadline: { clock: 'device-monotonic-ms', value: base + index * 120 + 1000 },
      source: { controller: 'fixture-minus7', policyHash: 'policy-fixture-v1' },
    }));
    return { schema: 'trajectory-v1', id: `${this.session.id}-trajectory`, policyHash: 'policy-fixture-v1', commands };
  }

  async observeCommand({ command, at }) {
    if (!this.sensor || !this.detector) return null;
    const raw = await this.sensor.sample({ id: `${command.id}-sample`, at });
    const measurement = await this.detector.detect(raw);
    this.event('sensor.sample', { id: raw.id, format: raw.format, source: raw.source,
      acquisition: raw.acquisition, receivedAt: raw.receivedAt ?? null,
      loss: raw.loss ?? null, calibration: raw.calibration });
    this.event('measurement.observed', measurement);
    return measurement;
  }

  async observeMonitor({ id = 'monitor-state', confirmations = 2 } = {}) {
    if (!this.sensor || !this.detector) throw new Error('monitor observation requires a sensor and detector');
    if (!Number.isInteger(confirmations) || confirmations < 1 || confirmations > 3)
      throw new Error('monitor observation confirmations must be in 1..3');
    let agreed = null;
    let previousSequence = null;
    for (let index = 0; index < confirmations; index += 1) {
      const at = this.now();
      const raw = await this.sensor.sample({ id: `${id}-${index + 1}`, at, signal: 'monitorUp' });
      const measurement = await this.detector.detect(raw);
      this.event('sensor.sample', { id: raw.id, format: raw.format, source: raw.source,
        acquisition: raw.acquisition, receivedAt: raw.receivedAt ?? null,
        loss: raw.loss ?? null, calibration: raw.calibration });
      this.event('measurement.observed', measurement);
      const sequence = raw.source.sequence;
      if (sequence !== undefined) {
        if (!Number.isSafeInteger(sequence) || (previousSequence !== null && sequence <= previousSequence))
          return { state: 'UNKNOWN', reason: 'monitor-frame-not-advancing', measurement };
        previousSequence = sequence;
      }
      const current = measurement.state === 'OBSERVED' && measurement.signal === 'monitorUp' &&
        typeof measurement.value === 'boolean' ? measurement.value : null;
      if (current === null) return { state: 'UNKNOWN', reason: measurement.reason ?? 'monitor-state-unreadable', measurement };
      if (agreed !== null && current !== agreed)
        return { state: 'UNKNOWN', reason: 'monitor-state-disagrees', measurement };
      agreed = current;
    }
    return { state: 'OBSERVED', value: agreed };
  }

  monitorCommand(target, id) {
    const at = this.now();
    return {
      schema: 'control-command-v1', id,
      action: { kind: 'press', control: 'monitor' },
      requestedAt: { clock: 'device-monotonic-ms', value: at },
      deadline: { clock: 'device-monotonic-ms', value: at + 1000 },
      source: { controller: 'artifact-state-controller', targetMonitorUp: target,
        requiresMonitorUp: !target },
    };
  }

  /**
   * Idempotent monitor transition.  Observation, not press parity, is the
   * authority.  A forcedown between attempts therefore becomes an observed
   * revocation rather than a permanent inversion.
   */
  async ensureMonitor(target, options = {}) {
    return this.#withWriter('ensure-monitor', () => this.#ensureMonitorInternal(target, options));
  }

  async #ensureMonitorInternal(target, { id = `ensure-monitor-${target ? 'up' : 'down'}`,
    settleMs = target ? 250 : 367, retries = 1 } = {}) {
    if (typeof target !== 'boolean') throw new Error('ensureMonitor target must be boolean');
    if (!Number.isInteger(retries) || retries < 0 || retries > 1)
      throw new Error('ensureMonitor retries must be zero or one');
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const before = await this.observeMonitor({ id: `${id}-before-${attempt + 1}` });
      if (before.state !== 'OBSERVED') throw new Error(`monitor state UNKNOWN: ${before.reason}`);
      if (before.value === target) {
        this.event('monitor.ensured', { target, attempt, acted: false });
        return { state: 'VERIFIED', target, attempts: attempt, acted: attempt > 0 };
      }
      const command = this.monitorCommand(target, `${this.session.id}-${id}-press-${attempt + 1}`);
      await this.#applyCommandInternal(command, { idempotencyKey: command.id });
      await (this.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))))(settleMs);
      const after = await this.observeMonitor({ id: `${id}-after-${attempt + 1}` });
      if (after.state !== 'OBSERVED') throw new Error(`monitor verification UNKNOWN: ${after.reason}`);
      if (after.value === target) {
        this.event('monitor.ensured', { target, attempt: attempt + 1, acted: true });
        return { state: 'VERIFIED', target, attempts: attempt + 1, acted: true };
      }
      this.event('monitor.revoked', { target, attempt: attempt + 1, observed: after.value });
    }
    throw new Error(`monitor did not reach ${target ? 'UP' : 'DOWN'} after bounded retry`);
  }

  /** Execute a short artifact block, revalidating every deferred action. */
  async executeConditioned(commands) {
    return this.#withWriter('conditioned-block', () => this.#executeConditionedInternal(commands));
  }

  async #executeConditionedInternal(commands) {
    if (!Array.isArray(commands) || commands.length > this.maxActions)
      throw new Error('conditioned action block exceeds the bounded action budget');
    const results = [];
    try {
      for (const command of commands) {
        const required = requiredMonitorState(command);
        if (required !== null) await this.#ensureMonitorInternal(required, { id: `${command.id}-precondition` });
        if (command.action.control === 'monitor') {
          const target = command.source?.targetMonitorUp;
          if (typeof target !== 'boolean') throw new Error('artifact monitor action has no target state');
          results.push(await this.#ensureMonitorInternal(target, { id: command.id }));
        } else {
          results.push(await this.#applyCommandInternal(command, { idempotencyKey: command.id }));
        }
      }
      return results;
    } catch (error) {
      await this.abort(`conditioned-execution: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute a previously compiled artifact through the explicit device port.
   * The service checks the request/profile binding and owns session cleanup;
   * the injected executor owns only device-local scheduling and I/O.
   */
  async executeArtifact(request) {
    return this.#withWriter('artifact', () => this.#executeArtifactInternal(request));
  }

  async #executeArtifactInternal(request) {
    if (!this.session || this.session.status !== 'ACTIVE') throw new Error('session is not active');
    if (!this.executor || typeof this.executor.execute !== 'function')
      throw new Error('artifact execution requires an explicit device executor port');
    const validated = validateExecutorRequest(request);
    const expectedMode = this.mode === 'live' ? 'live' : 'dry-run';
    if (validated.mode !== expectedMode) throw new Error(`artifact mode ${validated.mode} does not match service mode ${expectedMode}`);
    let requestedProfile;
    try { requestedProfile = resolveProfile(validated.profile); }
    catch { throw new Error('artifact profile is not a valid device profile'); }
    if (requestedProfile.id !== this.profile.id || stableHash(requestedProfile) !== stableHash(this.profile))
      throw new Error('artifact profile does not match the resolved device profile');
    this.event('artifact.accepted', {
      winnerHash: validated.artifact.winnerHash,
      engineHash: validated.artifact.engineHash,
      profileHash: validated.artifact.profileHash,
      planCount: validated.artifact.plans.length,
      blockCount: validated.blocks.length,
    });
    try {
      const execution = await this.executor.execute(validated);
      if (execution?.results && Array.isArray(execution.results)) this.session.results.push(...execution.results);
      const outcome = execution?.outcome ?? 'PASS';
      this.session.status = outcome === 'ABORTED' ? 'ABORTED' : 'COMPLETED';
      this.session.outcome = outcome;
      this.event(outcome === 'ABORTED' ? 'session.aborted' : 'session.completed', {
        outcome, artifactHash: validated.artifact.winnerHash,
      });
      return this.finish({
        artifact: validated.artifact,
        blockCount: validated.blocks.length,
        executorResult: execution ?? null,
      });
    } catch (error) {
      await this.abort(`artifact-execution: ${error.message}`);
      throw error;
    }
  }

  schedulerOptions() {
    return {
      actuator: this.actuator, supervisor: this.supervisor, clock: this.now,
      clockName: 'device-monotonic-ms', sleep: this.sleep,
      advance: this.mode === 'live' ? undefined : async () => {},
      observe: this.sensor && this.detector ? this.observeCommand.bind(this) : undefined,
      requireObserved: this.mode === 'live',
    };
  }

  async execute(trajectory = this.trajectory()) {
    return this.#withWriter('trajectory', () => this.#executeInternal(trajectory));
  }

  async #executeInternal(trajectory) {
    if (!this.session || this.session.status !== 'ACTIVE') throw new Error('session is not active');
    this.event('trajectory.accepted', { trajectory: trajectory.id, trajectoryHash: stableHash(trajectory), commandCount: trajectory.commands.length });
    let results;
    try {
      results = await dispatchTrajectory(trajectory, this.schedulerOptions());
    } catch (error) {
      this.session.status = 'ABORTED'; this.session.outcome = 'ABORTED';
      this.event('session.aborted', { reason: error.message });
      await this.finish({ reason: error.message });
      throw error;
    }
    this.session.results.push(...results);
    for (const result of results) this.event('actuation.result', result);
    const stopped = this.supervisor.aborted || results.some(result => result.reason === 'observation-unknown' || result.reason === 'observation-missing');
    this.session.status = stopped ? 'ABORTED' : 'COMPLETED';
    this.session.outcome = stopped ? 'ABORTED' : results.every(result => ['SENT', 'ACCEPTED', 'VERIFIED'].includes(result.status)) ? 'PASS' : 'FAIL';
    this.event(stopped ? 'session.aborted' : 'session.completed', { outcome: this.session.outcome });
    return this.finish({ trajectoryHash: stableHash(trajectory), resultCount: results.length });
  }

  async applyCommand(command, options = {}) {
    return this.#withWriter('command', () => this.#applyCommandInternal(command, options));
  }

  async #applyCommandInternal(command, { idempotencyKey = command?.id } = {}) {
    if (!this.session || this.session.status !== 'ACTIVE') throw new Error('session is not active');
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) throw new Error('idempotency key is required');
    if (this.commandKeys.has(idempotencyKey)) throw new Error('idempotency key was already used');
    this.commandKeys.add(idempotencyKey);
    const results = await dispatchTrajectory({ schema: 'trajectory-v1', id: `${this.session.id}-single`, commands: [command] }, this.schedulerOptions());
    const result = results[0];
    if (!result) throw new Error('command was not dispatched');
    validateActuationResult(result);
    this.session.results.push(result);
    this.event('actuation.result', { ...result, idempotencyKey });
    return result;
  }

  /** Exclusive seam campaign. No independent watcher can inject a cleanup;
   * restores and probes use the SAME actuator and profile-bound semantic port.
   * Completion is retained as UNVERIFIED, never promoted to game acceptance.
   */
  async executeCalibration(spec) {
    return this.#withWriter('seam-calibration', async () => {
      if (!this.session || this.session.status !== 'ACTIVE') throw new Error('session is not active');
      this.preflight();
      if (this.actuator.capabilities?.().calibrationProtocol !== 'seam-block-v1' ||
          typeof this.actuator.executeCalibrationBlock !== 'function' ||
          typeof this.actuator.abort !== 'function' || typeof this.actuator.releaseAll !== 'function')
        throw new Error('calibration requires one completion-aware, abortable timed-block actuator');
      if (!this.sensor || !this.detector) throw new Error('calibration requires a sensor and detector');
      if (this.mode === 'live' && (this.actuator.qualification.calibrationProtocol !== 'seam-block-v1' ||
          this.actuator.qualification.profileHash !== this.session.profileHash))
        throw new Error('live calibration requires profile-bound timed-block qualification');
      const abortController = new AbortController();
      const runner = new SeamCalibrationRunner({
        spec, profile: this.profile, profileHash: this.session.profileHash, runId: this.session.id,
        now: this.now, clockName: this.calibrationClock, clockMap: this.calibrationClockMap,
        clockSession: this.calibrationClockSession,
        sleep: this.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))),
        signal: abortController.signal, active: () => this.session.status === 'ACTIVE',
        event: this.event.bind(this),
        observe: async request => {
          const raw = await this.sensor.sample({ ...request, at: this.now() });
          if (abortController.signal.aborted) throw new Error('calibration capture returned after abort');
          this.event('sensor.sample', { id: raw.id, acquisition: raw.acquisition,
            receivedAt: raw.receivedAt ?? null, source: raw.source, loss: raw.loss ?? null });
          return this.detector.detect(raw);
        },
        executeBlock: async (block, signal) => {
          for (const step of block.steps) for (const control of step.controls) {
            const command = { schema: 'control-command-v1', id: `${step.id}-${control}`,
              action: { kind: 'press', control, durationMs: step.durationMs },
              requestedAt: { clock: block.requestedAt.clock, value: block.requestedAt.value + step.atMs },
              deadline: block.deadline, source: { controller: 'seam-calibration', blockId: block.id } };
            if (!this.supervisor.review(command)) throw new Error('calibration supervisor refused block');
          }
          return this.actuator.executeCalibrationBlock(block, { signal });
        },
      });
      this.#calibrationAbort = abortController;
      this.event('calibration.started', { spec: runner.spec, specHash: stableHash(runner.spec),
        executorClock: { clock: runner.clockName, session: runner.clockSession },
        clockMap: runner.clockMap, clockMapHash: runner.clockMap ? stableHash(runner.clockMap) : null });
      try {
        const calibration = await runner.run();
        await this.actuator.releaseAll();
        if (this.session.status !== 'ACTIVE') throw new Error('calibration was aborted');
        this.session.status = 'COMPLETED';
        this.session.outcome = this.mode === 'live' ? 'UNVERIFIED' : 'PASS';
        this.event('session.completed', { outcome: this.session.outcome, calibration: 'UNVERIFIED' });
        return this.finish({ calibration });
      } catch (error) {
        await this.abort(error.message);
        return this.finish({ calibration: { schema: 'seam-calibration-result-v1',
          workflow: 'ABORTED', calibration: 'UNVERIFIED', reason: error.message,
          trials: runner.trials, observationCount: runner.observationCount,
          profileHash: this.session.profileHash, specHash: stableHash(runner.spec) } });
      } finally { this.#calibrationAbort = null; }
    });
  }

  async abort(reason = 'operator-abort') {
    this.#calibrationAbort?.abort();
    if (!this.session) return null;
    if (!this.#abortPromise) this.#abortPromise = this.#abortInternal(reason);
    return this.#abortPromise;
  }

  async #abortInternal(reason) {
    this.session.status = 'ABORTED'; this.session.outcome = 'ABORTED';
    this.#cleanupFault = true;
    this.event('session.aborted', { reason });
    this.supervisor?.abort(reason);
    if (typeof this.actuator.abort !== 'function' || typeof this.actuator.releaseAll !== 'function')
      throw new Error('abort requires actuator.abort and actuator.releaseAll');
    await this.actuator.abort(reason); await this.actuator.releaseAll();
    if (this.executor && this.executor !== this.actuator) {
      if (typeof this.executor.abort === 'function') await this.executor.abort(reason);
      if (typeof this.executor.releaseAll === 'function') await this.executor.releaseAll();
    }
    const result = await this.finish({ reason });
    this.#cleanupFault = false;
    return result;
  }

  async finish(extra = {}) {
    this.session.artifacts = { manifest: 'session-manifest.json', result: 'result.json' };
    const manifest = makeManifest({ id: this.session.id, profile: this.profile, profileHash: this.session.profileHash, modelHash: this.session.modelHash, policyHash: this.session.policyHash, events: this.session.events, artifacts: this.session.artifacts, outcome: this.session.outcome ?? 'IN_PROGRESS' });
    const claimLevel = this.mode === 'live' ? (this.actuator.capabilities?.().claimLevel ?? 'DEVICE_MEASURED') : 'FIXTURE';
    const result = { schema: 'device-run-result-v1', id: this.session.id, evidenceId: this.session.id, mode: this.mode, claimLevel, outcome: this.session.outcome, profile: this.profile.id, profileHash: this.session.profileHash, results: this.session.results, ...extra };
    await mkdir(join(this.artifactRoot, this.session.id), { recursive: true });
    await writeFile(join(this.artifactRoot, this.session.id, 'session-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(join(this.artifactRoot, this.session.id, 'result.json'), JSON.stringify(result, null, 2) + '\n');
    return result;
  }
}
