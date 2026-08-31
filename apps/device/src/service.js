/**
 * DeviceControlService is the single local boundary for dry and live runs.
 * It owns leases, profile resolution, safety budgets, semantic trajectories,
 * telemetry, and retained results; MCP/CLI clients are thin callers.
 * CONTRACT:device-executor-v1 CONTRACT:session-manifest-v1.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { dispatchTrajectory, SafetySupervisor, makeEvent, makeManifest } from '@fnaf2-1020/runtime';
import { resolveProfile } from '@fnaf2-1020/adapters/registry';
import { stableHash, validateActuationResult } from '@fnaf2-1020/core/contracts';

const controls = Object.freeze(['monitor', 'mask', 'light', 'cam:10', 'cam:4', 'cam:7', 'cam:11', 'wind']);

export class DeviceControlService {
  constructor({ profile, actuator, sensor = null, detector = null, artifactRoot = 'artifacts', mode = 'dry-run', maxActions, now = () => performance.now() } = {}) {
    this.profile = resolveProfile(profile);
    this.actuator = actuator;
    this.artifactRoot = artifactRoot;
    this.mode = mode;
    this.maxActions = maxActions ?? this.profile.limits?.maxActions ?? 64;
    this.now = now;
    this.sensor = sensor;
    this.detector = detector;
    this.session = null;
    this.supervisor = null;
    this.commandKeys = new Set();
  }

  preflight() {
    if (!this.actuator || typeof this.actuator.apply !== 'function') throw new Error('preflight: actuator implementation is missing');
    if (this.mode === 'live' && this.profile.limits?.dryRunOnly) throw new Error(`preflight: profile ${this.profile.id} is fixture-only`);
    const actuatorId = this.actuator.capabilities?.().adapter ?? this.actuator.id;
    if (actuatorId && actuatorId !== this.profile.actuator) throw new Error(`preflight: actuator ${actuatorId} does not match profile ${this.profile.actuator}`);
    const actuatorClaim = this.actuator.capabilities?.().claimLevel;
    if (this.mode === 'live' && actuatorClaim !== 'DEVICE_MEASURED') throw new Error('preflight: live mode requires a DEVICE_MEASURED actuator');
    for (const control of controls) if (!this.profile.capabilities.controls.includes(control)) throw new Error(`preflight: profile does not advertise ${control}`);
    return { ok: true, profile: this.profile.id, mode: this.mode, capabilities: this.profile.capabilities, calibrations: this.profile.calibrations };
  }

  startSession({ lease = `lease-${stableHash({ profile: this.profile.id, mode: this.mode }).slice(-8)}` } = {}) {
    this.preflight();
    if (this.session && this.session.status === 'ACTIVE') throw new Error('session lease already held');
    const id = `run-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}-${stableHash(lease).slice(-6)}`;
    const profileHash = stableHash(this.profile);
    this.session = { id, lease, status: 'ACTIVE', profileHash, events: [], results: [], artifacts: {} };
    this.supervisor = new SafetySupervisor({ profile: this.profile, maxActions: this.maxActions, dryRun: this.mode !== 'live' });
    this.commandKeys.clear();
    this.event('session.started', { lease, mode: this.mode });
    return { id, lease, profile: this.profile.id, profileHash, mode: this.mode };
  }

  event(type, data = {}) {
    if (!this.session) throw new Error('session has not started');
    this.session.events.push(makeEvent(this.session.id, type, 'device-control-service', { clock: 'host-monotonic-ms', value: this.now() }, data));
  }

  trajectory() {
    if (!this.session) throw new Error('session has not started');
    const commands = controls.map((control, index) => ({
      schema: 'control-command-v1', id: `${this.session.id}-cmd-${index + 1}`,
      action: { kind: control.startsWith('cam:') ? 'select' : 'press', control },
      requestedAt: { clock: 'device-monotonic-ms', value: index * 120 },
      deadline: { clock: 'device-monotonic-ms', value: index * 120 + 1000 },
      source: { controller: 'fixture-minus7', policyHash: 'policy-fixture-v1' },
    }));
    return { schema: 'trajectory-v1', id: `${this.session.id}-trajectory`, policyHash: 'policy-fixture-v1', commands };
  }

  async execute(trajectory = this.trajectory()) {
    if (!this.session || this.session.status !== 'ACTIVE') throw new Error('session is not active');
    this.event('trajectory.accepted', { trajectory: trajectory.id, trajectoryHash: stableHash(trajectory), commandCount: trajectory.commands.length });
    const results = await dispatchTrajectory(trajectory, { actuator: this.actuator, supervisor: this.supervisor });
    this.session.results.push(...results);
    for (const result of results) this.event('actuation.result', result);
    this.session.status = 'COMPLETED';
    this.session.outcome = results.every(result => ['SENT', 'ACCEPTED', 'VERIFIED'].includes(result.status)) ? 'PASS' : 'FAIL';
    this.event('session.completed', { outcome: this.session.outcome });
    return this.finish({ trajectoryHash: stableHash(trajectory), resultCount: results.length });
  }

  async applyCommand(command, { idempotencyKey = command?.id } = {}) {
    if (!this.session || this.session.status !== 'ACTIVE') throw new Error('session is not active');
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) throw new Error('idempotency key is required');
    if (this.commandKeys.has(idempotencyKey)) throw new Error('idempotency key was already used');
    this.commandKeys.add(idempotencyKey);
    const approved = this.supervisor.review(command);
    const result = approved
      ? await this.actuator.apply(approved)
      : { schema: 'actuation-result-v1', commandId: command?.id ?? idempotencyKey, status: 'REJECTED', backend: this.actuator.id ?? 'unknown', uncertaintyMs: 0, reason: 'supervisor-rejected' };
    validateActuationResult(result);
    this.session.results.push(result);
    this.event('actuation.result', { ...result, idempotencyKey });
    return result;
  }

  abort(reason = 'operator-abort') {
    if (!this.session) return null;
    this.session.status = 'ABORTED'; this.session.outcome = 'ABORTED';
    this.event('session.aborted', { reason });
    this.actuator.abort?.(); this.actuator.releaseAll?.();
    return this.finish({ reason });
  }

  async finish(extra = {}) {
    this.session.artifacts = { manifest: 'session-manifest.json', result: 'result.json' };
    const manifest = makeManifest({ id: this.session.id, profile: this.profile, profileHash: this.session.profileHash, modelHash: 'model-sim-v1', policyHash: 'policy-fixture-v1', events: this.session.events, artifacts: this.session.artifacts, outcome: this.session.outcome ?? 'IN_PROGRESS' });
    const claimLevel = this.mode === 'live' ? (this.actuator.capabilities?.().claimLevel ?? 'DEVICE_MEASURED') : 'FIXTURE';
    const result = { schema: 'device-run-result-v1', id: this.session.id, evidenceId: this.session.id, mode: this.mode, claimLevel, outcome: this.session.outcome, profile: this.profile.id, profileHash: this.session.profileHash, results: this.session.results, ...extra };
    await mkdir(join(this.artifactRoot, this.session.id), { recursive: true });
    await writeFile(join(this.artifactRoot, this.session.id, 'session-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(join(this.artifactRoot, this.session.id, 'result.json'), JSON.stringify(result, null, 2) + '\n');
    return result;
  }
}
