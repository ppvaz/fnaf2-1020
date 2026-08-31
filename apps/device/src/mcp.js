/**
 * Optional bounded JSON-RPC/MCP-shaped adapter over DeviceControlService.
 * This is orchestration only: scheduling, leases, safety, and telemetry stay
 * local to the service. Raw coordinates and arbitrary shell are absent.
 * CONTRACT:device-executor-v1 CONTRACT:actuator-v1.
 */
import { validateControlCommand } from '@fnaf2-1020/core/contracts';

const MUTATING = new Set(['session.start', 'session.abort', 'actuator.apply', 'trajectory.execute']);
const TOOLS = Object.freeze([
  'devices.list', 'profiles.list', 'profiles.resolve', 'device.capabilities', 'device.preflight',
  'session.start', 'session.status', 'session.abort', 'sensor.sample', 'actuator.apply',
  'trajectory.execute', 'artifacts.list', 'artifacts.read',
]);

function error(code, message) { return { ok: false, error: { code, message } }; }

export function createActuatorMcp(service, { profiles = [service.profile] } = {}) {
  if (!service || typeof service.preflight !== 'function') throw new TypeError('MCP needs DeviceControlService');
  const profileList = profiles.map(profile => ({ id: profile.id, targetBuild: profile.targetBuild, actuator: profile.actuator }));
  const idempotency = new Set();
  const requireLease = args => {
    if (!service.session || service.session.status !== 'ACTIVE') return error('NO_SESSION', 'a session lease is required');
    if (args?.lease !== service.session.lease) return error('LEASE_MISMATCH', 'session lease does not match');
    if (args?.profileHash !== service.session.profileHash) return error('PROFILE_MISMATCH', 'resolved profile hash is required');
    if (typeof args?.idempotencyKey !== 'string' || args.idempotencyKey.length === 0) return error('IDEMPOTENCY_REQUIRED', 'mutating calls require an idempotency key');
    if (idempotency.has(args.idempotencyKey)) return error('DUPLICATE', 'idempotency key was already used');
    idempotency.add(args.idempotencyKey);
    if (args.deadlineMs !== undefined && (!Number.isFinite(args.deadlineMs) || args.deadlineMs < 0 || args.deadlineMs > (service.profile.limits?.maxDurationMs ?? 15000))) return error('DEADLINE_INVALID', 'deadline exceeds the profile bound');
    return null;
  };
  return {
    tools: () => [...TOOLS],
    async call(name, args = {}) {
      if (!TOOLS.includes(name)) return error('NOT_FOUND', `tool is not exposed: ${name}`);
      if (name === 'session.start') {
        if (typeof args.idempotencyKey !== 'string' || args.idempotencyKey.length === 0) return error('IDEMPOTENCY_REQUIRED', 'session start requires an idempotency key');
        if (idempotency.has(args.idempotencyKey)) return error('DUPLICATE', 'idempotency key was already used');
        idempotency.add(args.idempotencyKey);
      } else if (MUTATING.has(name)) {
        const rejected = requireLease(args); if (rejected) return rejected;
      }
      try {
        if (name === 'devices.list') return { ok: true, devices: [] };
        if (name === 'profiles.list') return { ok: true, profiles: profileList };
        if (name === 'profiles.resolve') return { ok: true, profile: service.profile, profileHash: service.session?.profileHash ?? null };
        if (name === 'device.capabilities') return { ok: true, capabilities: service.profile.capabilities };
        if (name === 'device.preflight') return { ok: true, preflight: service.preflight() };
        if (name === 'session.start') return { ok: true, session: service.startSession({ lease: args.lease }) };
        if (name === 'session.status') return { ok: true, status: service.session ? { ...service.session, results: undefined } : { status: 'IDLE' } };
        if (name === 'session.abort') return { ok: true, result: service.abort(args.reason ?? 'mcp-abort') };
        if (name === 'sensor.sample') {
          if (typeof service.sensor?.sample !== 'function') return error('UNAVAILABLE', 'sensor is not selected in this composition');
          return { ok: true, sample: await service.sensor.sample(args.request ?? {}) };
        }
        if (name === 'actuator.apply') {
          if (!args.command || args.command.source?.controller?.startsWith('mcp') !== true) return error('INVALID_COMMAND', 'MCP commands must name their source');
          validateControlCommand(args.command);
          return { ok: true, result: await service.applyCommand(args.command, { idempotencyKey: args.idempotencyKey }) };
        }
        if (name === 'trajectory.execute') return { ok: true, runId: service.session.id, result: await service.execute(args.trajectory) };
        if (name === 'artifacts.list') return { ok: true, artifacts: service.session?.artifacts ?? {} };
        if (name === 'artifacts.read') return error('UNAVAILABLE', 'artifact reads are served by the evidence CLI');
      } catch (cause) { return error('REJECTED', cause.message); }
      return error('UNIMPLEMENTED', name);
    },
  };
}
