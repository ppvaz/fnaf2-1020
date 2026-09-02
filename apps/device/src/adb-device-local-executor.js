/**
 * Device-local executor for the modern campaign boundary.
 *
 * The host validates and flattens a bound semantic request once.  This module
 * then sends one bounded script to an on-device shell; `/system/bin/hid`
 * owns the inter-action delays on the phone.  It never accepts strategy text,
 * coordinates, or arbitrary shell input from a caller.  Coordinates are
 * resolved here from the already validated profile, at the physical edge.
 * CONTRACT:device-executor-v1 CONTRACT:hid-executor-v1.
 */
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { HID_DESCRIPTOR, report } from '@fnaf2-1020/adapters';
import { validateExecutorRequest } from './artifact-executor.js';
import { expandNightBlocks } from './device-local-executor.js';

const HID_ID = 92;
const HID_NAME = 'FNAF Timed Touch';
const HID_VID = 6353;
const HID_PID = 61959;
const HID_BUS = 'usb';
const DEFAULT_READY_DELAY_MS = 6000;
const execFile = promisify(execFileCallback);

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new TypeError(`adb device-local executor: ${message}`); };
const isEpipe = error => typeof error === 'object' && error !== null
  && 'code' in error && error.code === 'EPIPE';

function point(value, control) {
  if (!isRecord(value) || !Number.isInteger(value.x) || !Number.isInteger(value.y) ||
      value.x < 0 || value.y < 0 || value.x >= 2400 || value.y >= 1080)
    fail(`profile.controlMap.${control} is not a bounded screen point`);
  return value;
}

function controlPoint(request, control) {
  return point(request.profile.controlMap?.[control], control);
}

function line(command, fields = {}) {
  return JSON.stringify({ id: HID_ID, command, ...fields });
}

function addDelay(events, duration) {
  if (!Number.isInteger(duration) || duration < 0) fail(`invalid integer delay ${duration}`);
  // AOSP hid rejects a zero duration. A zero is a valid semantic adjacency,
  // so it is represented by no event rather than a fatal device command.
  if (duration > 0) events.push(line('delay', { duration }));
}

function addReport(events, records) {
  events.push(line('report', { report: report(records) }));
}

function addSingle(events, request, control, duration) {
  const target = controlPoint(request, control);
  if (!Number.isInteger(duration) || duration < 1 || duration > 30000)
    fail(`${control} duration is outside 1..30000 ms`);
  addReport(events, [{ flags: 3, point: target }]);
  addDelay(events, duration);
  addReport(events, [{ flags: 0, point: target }]);
}

function addTwoContact(events, request, first, second, duration) {
  const firstPoint = controlPoint(request, first);
  const secondPoint = controlPoint(request, second);
  if (!Number.isInteger(duration) || duration < 1 || duration > 30000)
    fail(`${first}/${second} duration is outside 1..30000 ms`);
  addReport(events, [{ flags: 3, point: firstPoint }, { flags: 7, point: secondPoint }]);
  addDelay(events, duration);
  // Both records remain in the packet. The HID descriptor's contact count is
  // the number of records consumed, not the number that stays active.
  addReport(events, [{ flags: 0, point: firstPoint }, { flags: 4, point: secondPoint }]);
}

function addAction(events, request, action) {
  const duration = action.durationMs ?? 33;
  if (action.kind === 'ensure' || action.kind === 'tap' || action.kind === 'press' ||
      action.kind === 'hold') {
    addSingle(events, request, action.control, duration);
    return duration;
  }
  if (action.kind === 'observe-left') {
    addSingle(events, request, action.control, duration);
    const maskGap = action.maskGapMs ?? 0;
    const released = Math.max(0, maskGap - duration);
    addDelay(events, released);
    addSingle(events, request, 'mask', 33);
    return duration + released + 33;
  }
  if (action.kind === 'sweep-slot') {
    addSingle(events, request, action.control, action.selectMs);
    addDelay(events, action.settleMs);
    addSingle(events, request, 'light', action.lightMs);
    return action.selectMs + action.settleMs + action.lightMs;
  }
  if (action.kind === 'compound' && action.compound === 'hallraise') {
    addTwoContact(events, request, 'hall', 'monitor', duration);
    return duration;
  }
  if (action.kind === 'compound' && action.compound === 'maskraise') {
    addSingle(events, request, 'mask', 33);
    const gap = action.gapMs ?? 0;
    addDelay(events, Math.max(0, gap - 33));
    addSingle(events, request, action.control === 'hall' ? 'hall' : 'monitor', duration);
    return gap + duration;
  }
  if (action.kind === 'compound' && action.compound === 'camdrop') {
    const lightPoint = controlPoint(request, 'light');
    const monitorPoint = controlPoint(request, 'monitor');
    const lead = action.leadMs ?? 0;
    // camdrop's monitor transition is a second contact. The light is kept
    // active over the monitor press and for its declared tail.
    addReport(events, [{ flags: 3, point: lightPoint }]);
    addDelay(events, lead);
    addReport(events, [{ flags: 3, point: lightPoint }, { flags: 7, point: monitorPoint }]);
    addDelay(events, duration);
    addReport(events, [{ flags: 3, point: lightPoint }, { flags: 4, point: monitorPoint }]);
    addDelay(events, action.tailMs ?? 0);
    addReport(events, [{ flags: 0, point: lightPoint }, { flags: 4, point: monitorPoint }]);
    return lead + duration + (action.tailMs ?? 0);
  }
  fail(`unsupported physical action ${action.kind}/${action.compound ?? ''}`);
}

function actionsOf(block) {
  return block.actions.map(action => ({ action,
    atMs: block.scheduleAtMs + action.atMs - block.atMs }));
}

/**
 * Compile a validated one-night request to the device-local HID event stream.
 * The returned lines contain only the fixed hid vocabulary and are suitable
 * for one bounded `adb shell sh -s` transfer.
 */
export function compileDeviceLocalHidSchedule(request, { readyDelayMs = DEFAULT_READY_DELAY_MS } = {}) {
  validateExecutorRequest(request);
  if (request.artifact.plans.length !== 1) fail('one night per execution is required');
  if (!Number.isInteger(readyDelayMs) || readyDelayMs < 1 || readyDelayMs > 30000)
    fail('readyDelayMs must be an integer in 1..30000');
  const night = request.artifact.plans[0].night;
  const blocks = expandNightBlocks(request, night);
  const actions = blocks.flatMap(actionsOf).sort((a, b) => a.atMs - b.atMs || a.action.id.localeCompare(b.action.id));
  const events = [line('register', { name: HID_NAME, vid: HID_VID, pid: HID_PID,
    bus: HID_BUS, descriptor: HID_DESCRIPTOR })];
  addDelay(events, readyDelayMs);
  let cursor = 0;
  for (const { action, atMs } of actions) {
    if (!Number.isFinite(atMs) || atMs < cursor) fail(`action ${action.id} overlaps the previous HID macro`);
    addDelay(events, atMs - cursor);
    cursor = atMs + addAction(events, request, action);
  }
  const plan = request.artifact.plans[0];
  if (cursor > plan.timing.observeUntilMs) fail('HID schedule exceeds the observation envelope');
  addDelay(events, plan.timing.observeUntilMs - cursor);
  return Object.freeze({ schema: 'device-local-hid-schedule-v1', version: 1, night,
    readyDelayMs, actionCount: actions.length, plannedUntilMs: plan.timing.observeUntilMs,
    lines: Object.freeze(events) });
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function renderDeviceLocalScript(schedule) {
  if (!schedule || schedule.schema !== 'device-local-hid-schedule-v1' ||
      !Array.isArray(schedule.lines))
    fail('render requires a compiled device-local HID schedule');
  // Android 16's shell domain denies named-pipe creation in /data/local/tmp.
  // A regular file is sufficient here: the complete bounded stream is
  // written before hid starts, and hid owns every inter-action delay locally.
  const stream = '/data/local/tmp/fnaf2-modern-hid-$$.jsonl';
  const writes = schedule.lines.map(value => `printf '%s\\n' ${shellQuote(value)} >> "$stream"`).join('\n');
  return [
    'set -eu',
    // `stream` is a fixed path prefix; leave the shell PID expansion active so
    // two bounded executor processes cannot share a remote stream file.
    `stream=${stream}`,
    'hid_pid=',
    'cleanup() {',
    '  set +e',
    '  [ -z "$hid_pid" ] || kill "$hid_pid" 2>/dev/null',
    '  [ -z "$hid_pid" ] || wait "$hid_pid" 2>/dev/null',
    '  rm -f "$stream"',
    '}',
    'trap cleanup EXIT HUP INT TERM',
    'rm -f "$stream"',
    ': > "$stream"',
    writes,
    '/system/bin/hid - < "$stream" >/dev/null 2>&1 &',
    'hid_pid=$!',
    'wait "$hid_pid"',
    'hid_pid=',
    'rm -f "$stream"',
    '',
  ].join('\n');
}

function runAdbScript(adb, serial, script) {
  const child = spawn(adb, ['-s', serial, 'shell', 'sh', '-s'], {
    stdio: ['pipe', 'ignore', 'pipe'], shell: false,
  });
  let stderr = '';
  const promise = new Promise((resolve, reject) => {
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => code === 0
      ? resolve()
      : reject(new Error(`device-local HID shell exited with ${code}: ${stderr.trim()}`)));
  });
  // A game-over watchdog can terminate the remote shell while the bounded
  // script is still being flushed into adb.  Node otherwise reports the
  // resulting EPIPE as an unhandled stream error; the child close/error event
  // remains the authoritative transport result.
  child.stdin.on('error', error => {
    if (!isEpipe(error)) child.emit('error', error);
  });
  child.stdin.end(script);
  return { child, promise };
}

function runAdbProgram(adb, serial, program, args) {
  const child = spawn(adb, ['-s', serial, 'shell', 'sh', '-s', '--', ...args], {
    stdio: ['pipe', 'pipe', 'pipe'], shell: false,
  });
  let stdout = '';
  let stderr = '';
  const promise = new Promise((resolve, reject) => {
    child.stdout?.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
  child.stdin.on('error', error => {
    if (!isEpipe(error)) child.emit('error', error);
  });
  child.stdin.end(program);
  return { child, promise };
}

async function pushFile(adb, serial, source, destination) {
  try {
    await execFile(adb, ['-s', serial, 'push', source, destination], { timeout: 30000, maxBuffer: 1024 * 1024 });
  } catch (error) {
    throw new Error(`could not push ${source}: ${error.stderr?.trim() || error.message}`);
  }
}

async function remoteHash(adb, serial, path) {
  try {
    const result = await execFile(adb, ['-s', serial, 'shell', 'sha256sum', path], {
      timeout: 10000, maxBuffer: 1024 * 1024,
    });
    return result.stdout.trim().split(/\s+/)[0] ?? '';
  } catch (error) {
    throw new Error(`could not hash remote asset ${path}: ${error.stderr?.trim() || error.message}`);
  }
}

async function removeRemoteFiles(adb, serial, paths) {
  const safe = paths.filter(value => typeof value === 'string' && /^\/data\/local\/tmp\/fnaf2-[A-Za-z0-9._-]+$/.test(value));
  if (!safe.length) return;
  try { await execFile(adb, ['-s', serial, 'shell', 'rm', '-f', ...safe], { timeout: 10000, maxBuffer: 1024 * 1024 }); }
  catch { /* cleanup is best effort; the active HID process is handled separately */ }
}

async function waitForRemoteFile(adb, serial, path, {
  timeoutMs = 15000, pollMs = 100,
  processDone = () => !!false, processResult = async () => null,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await execFile(adb, ['-s', serial, 'shell', 'test', '-e', path], {
        timeout: 3000, maxBuffer: 1024 * 1024,
      });
      return;
    } catch { /* the marker is not visible yet */ }
    if (processDone()) {
      const result = await processResult();
      throw new Error(`machine device program exited before HID readiness (${result?.code ?? 'unknown'}): ${result?.stderr?.trim() || result?.stdout?.trim() || 'no output'}`);
    }
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  throw new Error(`machine HID readiness marker was not observed before ${timeoutMs}ms`);
}

export class AdbDeviceLocalArtifactExecutor {
  /** @param {any} options */
  constructor(options = {}) {
    const { serial, adb = 'adb', readyDelayMs = DEFAULT_READY_DELAY_MS,
      observe = null, pollMs = 1000 } = options;
    if (typeof serial !== 'string' || serial.length === 0) throw new TypeError('device-local executor requires an ADB serial');
    if (observe !== null && typeof observe !== 'function') throw new TypeError('device-local executor observe must be a function');
    if (!Number.isInteger(pollMs) || pollMs < 250 || pollMs > 10000)
      throw new TypeError('device-local executor pollMs must be an integer in 250..10000');
    this.serial = serial; this.adb = adb; this.readyDelayMs = readyDelayMs;
    this.observe = observe; this.pollMs = pollMs;
    this.child = null; this.running = false; this.aborted = false;
    this.deviceLocal = true;
  }

  async execute(request) {
    validateExecutorRequest(request);
    if (request.mode !== 'live') fail('physical executor accepts live requests only');
    if (this.running) fail('executor is already running');
    const schedule = compileDeviceLocalHidSchedule(request, { readyDelayMs: this.readyDelayMs });
    this.running = true; this.aborted = false;
    const process = runAdbScript(this.adb, this.serial, renderDeviceLocalScript(schedule));
    this.child = process.child;
    let observedTerminal = null;
    let stopObserver = false;
    const observer = this.observe ? (async () => {
      while (!stopObserver && this.child === process.child && this.running) {
        await new Promise(resolve => setTimeout(resolve, this.pollMs));
        if (stopObserver || this.child !== process.child || !this.running) break;
        try {
          const state = await this.observe();
          if (state === 'gameover') {
            observedTerminal = state;
            process.child.kill('SIGTERM');
            break;
          }
        } catch { /* an unreadable sample is UNKNOWN, never a death claim */ }
      }
    })() : Promise.resolve();
    try {
      await process.promise;
      return { status: 'COMPLETED', outcome: 'UNVERIFIED', night: schedule.night,
        plannedUntilMs: schedule.plannedUntilMs, blockCount: schedule.actionCount,
        deviceLocal: true };
    } catch (error) {
      // A fresh lifecycle observation is the only accepted reason to turn a
      // killed remote schedule into a normal failed attempt. Transport or
      // shell failures remain errors and are handled by the campaign abort
      // path.
      if (observedTerminal === 'gameover') {
        return { status: 'COMPLETED', outcome: 'UNVERIFIED', night: schedule.night,
          plannedUntilMs: schedule.plannedUntilMs, blockCount: schedule.actionCount,
          deviceLocal: true, terminal: observedTerminal };
      }
      throw error;
    } finally {
      stopObserver = true;
      await observer;
      this.child = null; this.running = false;
    }
  }

  async abort(reason = 'aborted') {
    this.aborted = true;
    if (this.child) this.child.kill('SIGTERM');
    return { status: 'ABORTED', reason: String(reason) };
  }

  async releaseAll() {
    if (this.child) this.child.kill('SIGTERM');
  }
}

/**
 * Explicit machine-only executor for the research-emitted Minus 7 winner.
 *
 * This promotes the existing assembled device program into the modern campaign
 * composition without copying its strategy into a new host scheduler. The
 * program receives the exact validated emitted plan, checker, and model as
 * content-addressed files; all timing, screencheck classification, and HID
 * input remain on the phone. It is intentionally separate from the qualified
 * executor and never returns a positive claim.
 */
export class AdbDeviceLocalMachineExecutor {
  /** @param {any} options */
  constructor(options = {}) {
    const { serial, adb = 'adb', driverProgram, planPath, planHash, modelPath, checkerPath,
      pilotOffsetMs = 10, deviceSpacingMs = 66, contactMs = 33, observe = null,
      pollMs = 1000, cuePort = '-', cueToken = '-' } = options;
    if (typeof serial !== 'string' || serial.length === 0) throw new TypeError('machine executor requires an ADB serial');
    if (typeof driverProgram !== 'string' || driverProgram.length === 0) throw new TypeError('machine executor requires the assembled device program');
    for (const [value, label] of [[planPath, 'planPath'], [planHash, 'planHash'], [modelPath, 'modelPath'], [checkerPath, 'checkerPath']])
      if (typeof value !== 'string' || value.length === 0) throw new TypeError(`machine executor requires ${label}`);
    for (const [value, label] of [[pilotOffsetMs, 'pilotOffsetMs'], [deviceSpacingMs, 'deviceSpacingMs'], [contactMs, 'contactMs']])
      if (!Number.isInteger(value) || value < 1 || value > 30000) throw new TypeError(`machine executor ${label} is outside 1..30000`);
    if (deviceSpacingMs <= contactMs) throw new TypeError('machine executor spacing must exceed contact');
    if (observe !== null && typeof observe !== 'function') throw new TypeError('machine executor observe must be a function');
    if (!Number.isInteger(pollMs) || pollMs < 250 || pollMs > 10000)
      throw new TypeError('machine executor pollMs must be an integer in 250..10000');
    if (cuePort !== '-' && (!Number.isInteger(cuePort) || cuePort < 1 || cuePort > 65535))
      throw new TypeError('machine executor cuePort is outside 1..65535');
    if (cuePort !== '-' && (typeof cueToken !== 'string' || !/^[0-9a-f]{32}$/.test(cueToken)))
      throw new TypeError('machine executor cueToken is not a bounded helper token');
    this.serial = serial; this.adb = adb; this.driverProgram = driverProgram;
    this.planPath = planPath; this.planHash = planHash; this.modelPath = modelPath; this.checkerPath = checkerPath;
    this.pilotOffsetMs = pilotOffsetMs; this.deviceSpacingMs = deviceSpacingMs; this.contactMs = contactMs;
    this.cuePort = cuePort; this.cueToken = cueToken;
    this.observe = observe; this.pollMs = pollMs; this.child = null; this.running = false;
    this.armed = false; this.armedBinding = null; this.processHandle = null;
    this.processPromise = null;
    /** @type {boolean} */
    this.processDone = false;
    this.observerPromise = null;
    this.stopObserver = false; this.observedTerminal = null;
    this.remoteFiles = []; this.deviceLocal = true;
  }

  validateRequest(request) {
    validateExecutorRequest(request);
    if (request.mode !== 'live') fail('machine executor accepts live requests only');
    if (request.artifact.plans.length !== 1 || request.artifact.plans[0].night !== 6)
      fail('machine executor is scoped to one Night 6 request');
    return request.artifact.plans[0];
  }

  binding(request) {
    const plan = request.artifact.plans[0];
    return JSON.stringify({ plan: plan.sha256, timing: plan.timing,
      profile: request.artifact.profileStableHash, winner: request.artifact.winnerHash,
      engine: request.artifact.engineHash });
  }

  async arm(request) {
    const plan = this.validateRequest(request);
    if (this.running || this.armed) fail('machine executor is already armed or running');
    const planText = await readFile(this.planPath, 'utf8');
    const emittedPlanHash = createHash('sha256').update(planText).digest('hex');
    if (emittedPlanHash !== this.planHash) fail('emitted plan hash does not match the validated bundle manifest');
    const checkerBytes = await readFile(this.checkerPath);
    const modelBytes = await readFile(this.modelPath);
    const checkerHash = createHash('sha256').update(checkerBytes).digest('hex');
    const modelHash = createHash('sha256').update(modelBytes).digest('hex');

    const tag = `${process.pid}-${Date.now()}`;
    const remoteBase = `/data/local/tmp/fnaf2-machine-${tag}`;
    const remotePid = `${remoteBase}.pid`;
    // The assembled driver's first argument is the pidfile and its canonical
    // plan lookup is "$PIDFILE.plan". Keep the host push on that exact name;
    // a sibling of the pidfile is not the same input on the phone.
    const remotePlan = `${remotePid}.plan`;
    const remoteChecker = `${remoteBase}.checker`;
    const remoteModel = `${remoteBase}.model`;
    const remoteKeep = `${remoteBase}-keep`;
    const remoteReady = `${remoteBase}.ready`;
    const remoteStart = `${remoteBase}.start`;
    const remoteEpoch = `${remoteBase}.epoch`;
    const remoteCapture = `${remoteBase}.capture`;
    const remoteHalt = `${remoteBase}.halt`;
    const remoteArmWindow = `${remoteBase}.armwin`;
    const remoteRearm = `${remoteBase}.rearm`;
    const remoteArmFail = `${remoteBase}.armfail`;
    const remoteFiles = [remotePlan, remoteChecker, remoteModel, remotePid, remoteReady,
      remoteStart, remoteEpoch, remoteCapture, remoteHalt, remoteArmWindow, remoteRearm,
      remoteArmFail];
    this.remoteFiles = remoteFiles;
    try {
      await pushFile(this.adb, this.serial, this.planPath, remotePlan);
      await pushFile(this.adb, this.serial, this.checkerPath, remoteChecker);
      await pushFile(this.adb, this.serial, this.modelPath, remoteModel);
      for (const [path, label] of [[remotePlan, 'plan'], [remoteChecker, 'checker'], [remoteModel, 'model']]) {
        const digest = await remoteHash(this.adb, this.serial, path);
        const expected = label === 'plan' ? emittedPlanHash : label === 'checker' ? checkerHash : modelHash;
        if (digest !== expected) throw new Error(`remote ${label} hash mismatch`);
      }
      const controls = request.profile.controlMap ?? {};
      const point = (name, fallback = null) => {
        const value = controls[name] ?? fallback;
        if (!isRecord(value) || !Number.isInteger(value.x) || !Number.isInteger(value.y))
          fail(`profile.controlMap.${name} is missing`);
        return `${value.x} ${value.y}`;
      };
      const cycles = Math.ceil((plan.timing.stopAtMs - plan.timing.loopStartMs - 7000) / plan.timing.periodMs);
      if (!Number.isInteger(cycles) || cycles < 1 || cycles > 120) fail('Night 6 cycle count is outside 1..120');
      const args = [
        remotePid, remoteReady, remoteStart, remoteEpoch, remoteCapture, '1', String(cycles), 'hid-multi', '0', '-', '1',
        String(this.pilotOffsetMs), '-', String(this.deviceSpacingMs), String(this.contactMs),
        '0', '0', '0', '0', '0', '0', remoteKeep, remoteChecker, '-', remoteModel, '-', '0', '0',
        ...point('mute', { x: 545, y: 78 }).split(' '), ...point('monitor').split(' '), ...point('mask').split(' '),
        ...point('light').split(' '), ...point('hall').split(' '), ...point('wind').split(' '),
        ...point('cam:10').split(' '), ...point('cam:4').split(' '), ...point('cam:7').split(' '),
        ...point('cam:9').split(' '), ...point('cam:11').split(' '), ...point('cam:5', { x: 1, y: 1 }).split(' '),
        this.cuePort === '-' ? '-' : String(this.cuePort), this.cueToken, remoteKeep,
        remoteHalt, remoteArmWindow, remoteRearm, remoteArmFail,
      ];
      this.running = true;
      this.processDone = false;
      this.observedTerminal = null;
      this.stopObserver = false;
      const processHandle = runAdbProgram(this.adb, this.serial, this.driverProgram, args);
      this.processHandle = processHandle;
      this.child = processHandle.child;
      this.processPromise = processHandle.promise.then(result => {
        this.processDone = true;
        return result;
      }, error => {
        this.processDone = true;
        throw error;
      });
      // The promise is also awaited by execute(); this handler prevents a
      // launch-time transport error from becoming unhandled while arm() is
      // still waiting for the device readiness marker.
      this.processPromise.catch(() => {});
      this.observerPromise = this.observe ? (async () => {
        while (!this.stopObserver && this.child === processHandle.child && this.running && !this.processDone) {
          await new Promise(resolve => setTimeout(resolve, this.pollMs));
          if (this.stopObserver || this.child !== processHandle.child || !this.running || this.processDone) break;
          try {
            const state = await this.observe();
            if (state === 'gameover') {
              this.observedTerminal = state;
              processHandle.child.kill('SIGTERM');
              break;
            }
          } catch { /* UNKNOWN observation never becomes a death claim */ }
        }
      })() : Promise.resolve();
      await waitForRemoteFile(this.adb, this.serial, remoteReady, {
        processDone: () => this.processDone,
        processResult: () => this.processPromise,
      });
      if (this.observedTerminal === 'gameover') throw new Error('machine input armed after game-over was observed');
      this.armed = true;
      this.armedBinding = this.binding(request);
      return { status: 'ARMED', night: 6, deviceLocal: true, readyFile: remoteReady };
    } catch (error) {
      await this.cleanupRun({ kill: true });
      throw error;
    }
  }

  async execute(request) {
    const plan = this.validateRequest(request);
    const binding = this.binding(request);
    if (!this.armed) await this.arm(request);
    else if (this.armedBinding !== binding) fail('execute request does not match the armed campaign request');
    const processPromise = this.processPromise;
    const observer = this.observerPromise ?? Promise.resolve();
    const cycles = Math.ceil((plan.timing.stopAtMs - plan.timing.loopStartMs - 7000) / plan.timing.periodMs);
    try {
      const result = await processPromise;
      if (result.code !== 0 && this.observedTerminal !== 'gameover')
        throw new Error(`machine device program exited with ${result.code}: ${result.stderr.trim() || result.stdout.trim()}`);
      return { status: 'COMPLETED', outcome: 'UNVERIFIED', night: 6,
        plannedUntilMs: plan.timing.observeUntilMs, cycles, deviceLocal: true,
        terminal: this.observedTerminal, programOutput: result.stdout.slice(-12000) };
    } finally {
      this.stopObserver = true;
      await observer;
      await this.cleanupRun();
    }
  }

  async cleanupRun({ kill = false } = {}) {
    if (kill && this.child) this.child.kill('SIGTERM');
    if (kill && this.processPromise) {
      try { await this.processPromise; } catch { /* transport cleanup follows */ }
    }
    this.stopObserver = true;
    if (this.observerPromise) await this.observerPromise;
    if (this.processPromise && !this.processDone) {
      try { await this.processPromise; } catch { /* cleanup is best effort */ }
    }
    const paths = [...this.remoteFiles];
    this.child = null; this.running = false; this.armed = false;
    this.armedBinding = null; this.processHandle = null; this.processPromise = null;
    this.processDone = false; this.observerPromise = null; this.observedTerminal = null;
    this.remoteFiles = [];
    await removeRemoteFiles(this.adb, this.serial, paths);
  }

  async abort(reason = 'aborted') {
    if (this.remoteFiles.length) {
      try { await execFile(this.adb, ['-s', this.serial, 'shell', 'touch', this.remoteFiles.find(path => path.endsWith('.halt'))], { timeout: 10000, maxBuffer: 1024 * 1024 }); } catch {}
    }
    if (this.child) this.child.kill('SIGTERM');
    return { status: 'ABORTED', reason: String(reason) };
  }

  async releaseAll() {
    await this.cleanupRun({ kill: true });
  }
}
