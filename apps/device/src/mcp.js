/**
 * Optional bounded JSON-RPC/MCP-shaped adapter over DeviceControlService.
 * This is orchestration only: scheduling, leases, safety, and telemetry stay
 * local to the service. Raw coordinates and arbitrary shell are absent.
 * CONTRACT:device-executor-v1 CONTRACT:actuator-v1.
 */
import { execFile as execFileCallback } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { validateControlCommand } from '@fnaf2-1020/core/contracts';

const MUTATING = new Set(['session.start', 'session.abort', 'actuator.apply', 'trajectory.execute', 'calibration.execute']);
const CUE_TOOLS = Object.freeze(['cue.setup', 'cue.queue.enqueue', 'cue.queue.list', 'cue.queue.run']);
const TOOLS = Object.freeze([
  'devices.list', 'profiles.list', 'profiles.resolve', 'device.capabilities', 'device.preflight',
  'session.start', 'session.status', 'session.abort', 'sensor.sample', 'actuator.apply',
  'trajectory.execute', 'calibration.execute', 'artifacts.list', 'artifacts.read',
  ...CUE_TOOLS,
]);

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CUE_SETUP = fileURLToPath(new URL('../../../tools/device/cue-helper-setup.sh', import.meta.url));
const CUE_QUEUE = fileURLToPath(new URL('../../../tools/device/cue-helper-queue.sh', import.meta.url));
const execFile = promisify(execFileCallback);

function error(code, message) { return { ok: false, error: { code, message } }; }

function booleanArg(args, name) {
  if (args[name] !== undefined && typeof args[name] !== 'boolean')
    return error('INVALID_ARGUMENT', `${name} must be boolean`);
  return null;
}

function numberArg(args, name, { defaultValue, min, max }) {
  const value = args[name] ?? defaultValue;
  if (!Number.isFinite(value) || value < min || value > max)
    return error('INVALID_ARGUMENT', `${name} must be between ${min} and ${max}`);
  return value;
}

function cueSetupArgs(args) {
  for (const name of ['install', 'probe', 'stop']) {
    const invalid = booleanArg(args, name); if (invalid) return invalid;
  }
  if (args.screen !== undefined && args.screen !== 'menu' && args.screen !== 'night')
    return error('INVALID_ARGUMENT', 'screen must be menu or night');
  const wait = numberArg(args, 'waitSeconds', { defaultValue: 20, min: 1, max: 300 });
  if (wait?.ok === false) return wait;
  if (args.stop && (args.install || args.probe))
    return error('INVALID_ARGUMENT', 'stop cannot be combined with install or probe');
  return { screen: args.screen ?? 'menu', waitSeconds: wait,
    install: args.install === true, probe: args.probe === true, stop: args.stop === true };
}

function cueSetupCommand(options) {
  const command = [];
  if (options.install) command.push('--install');
  if (options.probe) command.push('--probe');
  if (options.stop) command.push('--stop');
  command.push('--screen', options.screen, '--wait', String(options.waitSeconds));
  return command;
}

function cueQueueEnqueueArgs(args) {
  if (!['setup', 'menu-check', 'night-check'].includes(args.kind))
    return error('INVALID_ARGUMENT', 'kind must be setup, menu-check, or night-check');
  for (const name of ['install', 'probe']) {
    const invalid = booleanArg(args, name); if (invalid) return invalid;
  }
  const expectedScreen = args.kind === 'night-check' ? 'night' : 'menu';
  const screen = args.screen ?? expectedScreen;
  if (screen !== 'menu' && screen !== 'night') return error('INVALID_ARGUMENT', 'screen must be menu or night');
  if (args.kind === 'menu-check' && screen !== 'menu') return error('INVALID_ARGUMENT', 'menu-check must target menu');
  if (args.kind === 'night-check' && screen !== 'night') return error('INVALID_ARGUMENT', 'night-check must target night');
  if (args.kind !== 'setup' && (args.install || args.probe))
    return error('INVALID_ARGUMENT', 'install/probe options are available only for setup jobs');
  if (args.idempotencyKey !== undefined
      && (typeof args.idempotencyKey !== 'string' || args.idempotencyKey.length < 1
        || args.idempotencyKey.length > 128))
    return error('INVALID_ARGUMENT', 'idempotencyKey must be 1..128 characters');
  return { kind: args.kind, screen, install: args.install === true, probe: args.probe === true,
    idempotencyKey: args.idempotencyKey };
}

function cueQueueCommand(options) {
  const command = ['enqueue', options.kind];
  if (options.screen) command.push('--screen', options.screen);
  if (options.install) command.push('--install');
  if (options.probe) command.push('--probe');
  if (options.idempotencyKey) command.push('--idempotency-key', options.idempotencyKey);
  command.push('--json');
  return command;
}

function cueRunOptions(args) {
  const wait = numberArg(args, 'waitSeconds', { defaultValue: 0, min: 0, max: 86400 });
  if (wait?.ok === false) return wait;
  const interval = numberArg(args, 'intervalSeconds', { defaultValue: 5, min: 0.1, max: 300 });
  if (interval?.ok === false) return interval;
  return { waitSeconds: wait, intervalSeconds: interval };
}

async function runCueCommand(script, args, options = {}) {
  try {
    const result = await execFile(script, args, {
      cwd: ROOT, shell: false, env: process.env,
      timeout: options.timeoutMs ?? 360000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { exitCode: 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  } catch (cause) {
    return {
      exitCode: Number.isInteger(cause.code) ? cause.code : 1,
      stdout: cause.stdout ?? '', stderr: cause.stderr ?? cause.message ?? '',
    };
  }
}

function cueResult(operation, result) {
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (result.exitCode === 75 || output.includes('QUEUE HOLD'))
    return { ok: true, operation, status: 'HOLD', exitCode: result.exitCode, output };
  if (result.exitCode !== 0)
    return error(`${operation.toUpperCase().replaceAll('.', '_')}_FAILED`, `${operation} failed (exit ${result.exitCode}): ${output}`);
  return { ok: true, operation, status: 'DONE', exitCode: 0, output };
}

/**
 * The Cue Helper host tools are also usable without composing the actuation
 * service. They intentionally remain a closed, safe vocabulary: setup and
 * queue scripts are fixed, and no caller-provided shell, coordinates, or HID
 * input can cross this boundary.
 */
export function createCueHelperMcp({ run = runCueCommand } = {}) {
  return {
    tools: () => [...CUE_TOOLS],
    async call(name, args = {}) {
      if (!CUE_TOOLS.includes(name)) return error('NOT_FOUND', `tool is not exposed: ${name}`);
      try {
        if (name === 'cue.setup') {
          const options = cueSetupArgs(args);
          if (options.ok === false) return options;
          const result = await run(CUE_SETUP, cueSetupCommand(options), {
            timeoutMs: Math.max(120000, (options.waitSeconds + 120) * 1000),
          });
          return cueResult('cue.setup', result);
        }
        if (name === 'cue.queue.enqueue') {
          const options = cueQueueEnqueueArgs(args);
          if (options.ok === false) return options;
          const result = await run(CUE_QUEUE, cueQueueCommand(options));
          if (result.exitCode !== 0) return cueResult('cue.queue.enqueue', result);
          let payload;
          try { payload = JSON.parse(result.stdout); }
          catch { return error('QUEUE_PROTOCOL', 'queue enqueue returned invalid JSON'); }
          const job = payload.job;
          return { ok: true, operation: 'cue.queue.enqueue',
            status: payload.created === false ? 'EXISTING' : 'QUEUED', job };
        }
        if (name === 'cue.queue.list') {
          const result = await run(CUE_QUEUE, ['list', '--json']);
          if (result.exitCode !== 0) return cueResult('cue.queue.list', result);
          try { return { ok: true, operation: 'cue.queue.list', jobs: JSON.parse(result.stdout).jobs }; }
          catch { return error('QUEUE_PROTOCOL', 'queue list returned invalid JSON'); }
        }
        const options = cueRunOptions(args);
        if (options.ok === false) return options;
        const result = await run(CUE_QUEUE, ['run', '--wait', String(options.waitSeconds), '--interval', String(options.intervalSeconds)], {
          timeoutMs: Math.max(120000, (options.waitSeconds + 120) * 1000),
        });
        return cueResult('cue.queue.run', result);
      } catch (cause) { return error('REJECTED', cause.message); }
    },
  };
}

/** @param {any} service @param {{profiles?: any[], cueHelper?: any, bridge?: any}} options */
export function createActuatorMcp(service, { profiles = [service.profile], cueHelper = {}, bridge = null } = {}) {
  if (!service || typeof service.preflight !== 'function') throw new TypeError('MCP needs DeviceControlService');
  const profileList = profiles.map(profile => ({ id: profile.id, targetBuild: profile.targetBuild, actuator: profile.actuator }));
  const idempotency = new Set();
  const cueHelperOptions = /** @type {{run?: typeof runCueCommand}} */ (cueHelper);
  const cueMcp = createCueHelperMcp({ run: cueHelperOptions.run ?? runCueCommand });
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
      if (CUE_TOOLS.includes(name)) return cueMcp.call(name, args);
      if (name === 'session.start') {
        if (typeof args.idempotencyKey !== 'string' || args.idempotencyKey.length === 0) return error('IDEMPOTENCY_REQUIRED', 'session start requires an idempotency key');
        if (idempotency.has(args.idempotencyKey)) return error('DUPLICATE', 'idempotency key was already used');
        idempotency.add(args.idempotencyKey);
      } else if (MUTATING.has(name)) {
        const rejected = requireLease(args); if (rejected) return rejected;
      }
      try {
        if (name === 'devices.list') {
          if (!bridge || typeof bridge.devices !== 'function') return { ok: true, devices: [] };
          const result = await bridge.devices();
          return { ok: true, ...result, devices: result.devices ?? [] };
        }
        if (name === 'profiles.list') return { ok: true, profiles: profileList };
        if (name === 'profiles.resolve') return { ok: true, profile: service.profile, profileHash: service.session?.profileHash ?? null };
        if (name === 'device.capabilities') return { ok: true, capabilities: service.profile.capabilities };
        if (name === 'device.preflight') {
          if (args.physical === true) {
            if (!bridge || typeof bridge.preflight !== 'function') return error('UNAVAILABLE', 'physical ADB preflight is not composed');
            return { ok: true, preflight: await bridge.preflight({ targetBuild: service.profile.targetBuild }) };
          }
          return { ok: true, preflight: service.preflight() };
        }
        if (name === 'session.start') return { ok: true, session: service.startSession({ lease: args.lease }) };
        if (name === 'session.status') return { ok: true, status: service.session ? { ...service.session, results: undefined } : { status: 'IDLE' } };
        if (name === 'session.abort') return { ok: true, result: await service.abort(args.reason ?? 'mcp-abort') };
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
        if (name === 'calibration.execute') {
          if (args.deadlineMs !== undefined && args.spec?.maxDurationMs > args.deadlineMs)
            return error('DEADLINE_INVALID', 'seam spec exceeds caller deadline');
          return { ok: true, result: await service.executeCalibration(args.spec) };
        }
        if (name === 'artifacts.list') return { ok: true, artifacts: service.session?.artifacts ?? {} };
        if (name === 'artifacts.read') return error('UNAVAILABLE', 'artifact reads are served by the evidence CLI');
      } catch (cause) { return error('REJECTED', cause.message); }
      return error('UNIMPLEMENTED', name);
    },
  };
}
