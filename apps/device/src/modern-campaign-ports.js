/**
 * Modern physical campaign composition for the calibrated Android path.
 *
 * This is the campaign composition root: title/lifecycle observers are
 * bounded read ports, HID is the only game actuator, and the full-night
 * request is handed to the device-local executor as one scheduled transfer.
 * No legacy runner, strategy interpreter, or arbitrary shell port is used.
 * CONTRACT:device-campaign-v1 CONTRACT:device-executor-v1.
 */
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { HidWireTransport } from '@fnaf2-1020/adapters';
import { configureCustomNight, validateCustomNightCalibration } from './custom-night.js';
import { AdbDeviceBridge } from './adb-bridge.js';
import { composeCampaignPorts } from './campaign-composition.js';
import { AdbDeviceLocalArtifactExecutor, AdbDeviceLocalMachineExecutor } from './adb-device-local-executor.js';
import { makeCampaignExecutionRequest } from './campaign-bundle.js';
import { AdbCueHelperPort, AdbHidProcess } from './physical-ports.js';
import { DeviceCampaignRunner } from './campaign-runner.js';

const TITLE_MODEL = new URL('../../../tools/device/models/title-moto-g56-v207.json', import.meta.url);
const LIFECYCLE_OBSERVER = new URL('../../../tools/device/lifecycle-observe.py', import.meta.url);
const TITLE_OBSERVER = new URL('../../../tools/device/title-observe.py', import.meta.url);
const DRIVER_ASSEMBLER = new URL('../../../tools/device/trial/assemble.sh', import.meta.url);
const SCREENCHECK_BUILDER = new URL('../../../tools/device/build-screencheck.sh', import.meta.url);
const SCREENCHECK_BINARY = fileURLToPath(new URL('../../../tools/device/fnaf-screencheck', import.meta.url));
const BB_LEFT_MODEL = fileURLToPath(new URL('../../../captures/screencheck/bb-left/models/runtime-gh.scm', import.meta.url));
const execFile = promisify(execFileCallback);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

async function machineAssets() {
  const [driver, model] = await Promise.all([
    execFile('bash', [DRIVER_ASSEMBLER.pathname], { maxBuffer: 1024 * 1024 }),
    readFile(BB_LEFT_MODEL),
  ]);
  try { await readFile(SCREENCHECK_BINARY); }
  catch {
    await execFile('bash', [SCREENCHECK_BUILDER.pathname, SCREENCHECK_BINARY], { timeout: 30000, maxBuffer: 1024 * 1024 });
  }
  return { driverProgram: driver.stdout, checkerPath: SCREENCHECK_BINARY,
    modelPath: BB_LEFT_MODEL, modelBytes: model.length };
}

async function observePython(script, input, args = []) {
  return new Promise(resolve => {
    const child = spawn('python3', [script.pathname, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'], shell: false,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (code, detail = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: Number.isInteger(code) ? code : 1, stdout, stderr: stderr || detail });
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(1, 'observer timeout');
    }, 15000);
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', error => finish(1, error.message));
    child.on('close', code => finish(code));
    child.stdin.end(input);
  });
}

function lastLine(output) {
  return String(output).replace(/\r/g, '').trim().split(/\n/).at(-1) ?? '';
}

async function captureAndObserve(bridge, serial, script, args = []) {
  const png = await bridge.capturePng(serial);
  if (!png) throw new Error('observer capture failed');
  return observePython(script, png, args);
}

async function lifecycle(bridge, serial) {
  const result = await captureAndObserve(bridge, serial, LIFECYCLE_OBSERVER, ['--sensor', 'screencap-2400x1080']);
  const line = lastLine(result.stdout);
  return line.startsWith('state=') ? line.slice(6) : null;
}

async function title(bridge, serial, model) {
  const result = await captureAndObserve(bridge, serial, TITLE_OBSERVER,
    ['--sensor', 'screencap-2400x1080', '--model', model]);
  const line = lastLine(result.stdout);
  if (!line.startsWith('items=')) {
    const detail = line || lastLine(result.stderr) || `observer-exit-${result.code}`;
    throw new Error(`title observer refused: ${detail}`);
  }
  return line.slice(6).split(',').filter(Boolean);
}

async function waitFor(bridge, serial, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await lifecycle(bridge, serial);
    if (predicate(last)) return last;
    await sleep(150);
  }
  throw new Error(`${label} was not observed before the ${timeoutMs}ms deadline (last=${last ?? 'unknown'})`);
}

function point(value, label) {
  if (!isRecord(value) || !Number.isInteger(value.x) || !Number.isInteger(value.y) ||
      value.x < 0 || value.y < 0 || value.x >= 2400 || value.y >= 1080)
    throw new TypeError(`${label} must be a bounded screen point`);
  return value;
}

function modelPoint(value, label) {
  if (!Array.isArray(value) || value.length !== 2)
    throw new TypeError(`${label} must be a two-element model point`);
  return point({ x: value[0], y: value[1] }, label);
}

function createHidSender(hidProcess, { registerDelayMs = 0 } = {}) {
  const transport = new HidWireTransport({
    write: line => hidProcess.write(line),
    ready: () => hidProcess.ready(),
    contactMs: 33,
    registerDelayMs,
  });
  return {
    transport,
    send: ({ point: target, durationMs = 33 }) => transport.send({
      command: { action: { kind: 'press', durationMs }, source: { controller: 'modern-campaign-menu' } },
      point: target,
    }),
  };
}

/**
 * Create all ports for one explicit phone. Construction is side-effect free:
 * it does not start HID, query the helper, capture the screen, or press a
 * menu item. Those actions occur only after campaign preflight is READY.
 *
 * `configReadback` is an optional measured Custom Night readback adapter. The
 * default CLI intentionally leaves it absent until a config-model artifact is
 * reviewed; a missing reader refuses before a dial is changed.
 */
/** @param {any} options */
export async function createCampaignPorts(options = {}) {
  const { spec, bundle, profile, calibration, qualification, serial, adb = 'adb', configReadback,
    machineOnly = false } = options;
  if (typeof serial !== 'string' || serial.length === 0) throw new TypeError('modern campaign ports require an ADB serial');
  if (profile?.actuator !== 'hid-multi' || profile?.visualSensor !== 'mediaprojection')
    throw new TypeError('modern campaign ports require a HID + MediaProjection profile');
  const bridge = new AdbDeviceBridge({ serial, adb });
  // The device-local runner is the only path that assembles the legacy shell
  // driver. Give that driver the already-running Cue Helper endpoint so its
  // lifecycle/read functions can use the authenticated visual sensor too.
  // Endpoint discovery is bounded and happens before the executor is armed;
  // no input is sent here.
  const cueEndpoint = machineOnly ? new AdbCueHelperPort({ serial, adb }).discover() : null;
  const localExecutor = machineOnly
    ? new AdbDeviceLocalMachineExecutor({ serial, adb, ...(await machineAssets()),
      planPath: `${bundle.bundleDirectory}/night-6.plan`,
      planHash: bundle.planHashes?.[6],
      pilotOffsetMs: bundle.machine?.pilotOffsetMs ?? 10,
      deviceSpacingMs: bundle.machine?.deviceSpacingMs ?? 66,
      contactMs: bundle.machine?.contactMs ?? 33,
      cuePort: cueEndpoint.port,
      cueToken: cueEndpoint.token,
      observe: () => lifecycle(bridge, serial), pollMs: 1000 })
    : new AdbDeviceLocalArtifactExecutor({ serial, adb,
      observe: () => lifecycle(bridge, serial), pollMs: 1000 });
  const titleModel = await readJson(TITLE_MODEL);
  const modelPath = TITLE_MODEL.pathname;
  let menuHid = null;

  const openMenuHid = () => {
    if (!menuHid) {
      const process = new AdbHidProcess({ serial, adb });
      const sender = createHidSender(process, { registerDelayMs: 6000 });
      menuHid = { process, sender };
    }
    return menuHid.sender;
  };

  const closeMenuHid = async () => {
    const current = menuHid;
    menuHid = null;
    await current?.process.close();
  };

  const machineRequestFor = target => makeCampaignExecutionRequest({
    bundle, plan: bundle.plans.find(item => item.night === target.night), profile,
    mode: 'live', artifact: bundle.artifact,
  });

  const tap = async ({ point: target, holdMs = 33 }) => {
    point(target, 'tap point');
    const sender = openMenuHid();
    await sender.transport.send({
      command: { action: { kind: 'press', durationMs: holdMs }, source: { controller: 'modern-campaign' } },
      point: target,
    });
  };

  const menu = async ({ target }) => {
    const items = await title(bridge, serial, modelPath);
    const targetName = target.menuTarget;
    if (!items.includes(targetName)) return { target: targetName, visible: false, selected: false, observed: true };
    // HID registration waits for Android InputReader. Re-read the title after
    // that bounded wait so the press is tied to a fresh target observation.
    const sender = openMenuHid();
    await sender.transport.start();
    const freshItems = await title(bridge, serial, modelPath);
    if (!freshItems.includes(targetName))
      return { target: targetName, visible: false, selected: false, observed: true, items: freshItems };
    const targetPoint = targetName === 'customNight'
      ? point(calibration?.menu?.point, 'calibration.menu.point')
      : modelPoint(titleModel.items?.[targetName], `title model ${targetName}`);
    const holdMs = targetName === 'customNight' ? calibration.menu.holdMs : 120;
    await tap({ point: targetPoint, holdMs });
    return { target: targetName, visible: true, selected: true, observed: true };
  };

  const intro = async ({ target }) => {
    // The menu HID is a separate short-lived channel. Close it before arming
    // the full-night driver, then wait for that driver's READY marker before
    // accepting the night transition. This puts InputReader attachment and
    // the on-device classifier on the critical path before Night 6 starts.
    await closeMenuHid();
    if (machineOnly) {
      if (!(localExecutor instanceof AdbDeviceLocalMachineExecutor))
        throw new Error('machine campaign did not compose a machine executor');
      await localExecutor.arm(machineRequestFor(target));
    }
    // A full-screen screencap over Wireless ADB can take longer than the
    // stock intro card remains visible.  The menu target (and, for Custom
    // Night, the dial readback) has already established identity before this
    // boundary, so the authoritative `night` state is also a valid fresh
    // start observation when the card has already elapsed.
    const state = await waitFor(bridge, serial, value => value === 'intro' || value === 'night', 15000, 'night start');
    // The 6th Night and Custom Night menu targets identify the configured
    // night; Continue is deliberately not promoted to a night identity.
    const identified = target.menuTarget === 'sixthNight' || target.menuTarget === 'customNight';
    return { night: target.night, identity: identified ? target.mode : 'unknown', observed: identified, state };
  };

  const terminal = async ({ target }) => {
    const state = await lifecycle(bridge, serial);
    if (state === 'sixam') return { night: target.night, identity: target.mode,
      outcome: 'sixam', sixAm: true, positive: true, state };
    if (state === 'gameover') return { night: target.night, identity: target.mode,
      outcome: 'death', sixAm: false, positive: false, state };
    return { night: target.night, identity: target.mode, outcome: 'unknown', sixAm: false, positive: false, state };
  };

  const terminalVerification = async ({ target }) => {
    const state = await lifecycle(bridge, serial);
    return { night: target.night, sixAm: state === 'sixam', positive: state === 'sixam', state };
  };

  const save = async ({ target }) => {
    await waitFor(bridge, serial, value => value === 'title', 15000, 'post-win title menu');
    const items = await title(bridge, serial, modelPath);
    if (target.night === 6) {
      // `sixthNight` is not evidence of advancement: it was already visible
      // before this campaign. Custom Night visibility is the only currently
      // calibrated positive advancement signal; otherwise proof refuses.
      return { observed: true, customNightVisible: items.includes('customNight'),
        cursorNight: undefined, items };
    }
    return { observed: true, menuReturned: true, customCompleted: items.includes('customNight'), items };
  };

  const retryReady = async ({ target }) => {
    await waitFor(bridge, serial, value => value === 'title', 15000, 'retry title menu');
    const items = await title(bridge, serial, modelPath);
    return { menuReady: items.includes(target.menuTarget), observed: true, items };
  };

  const customNight = async ({ target }) => {
    validateCustomNightCalibration(calibration, { targetBuild: spec.target.build });
    if (typeof configReadback !== 'function')
      throw new Error('Custom Night readback adapter is not composed; refusing to change dials');
    const configured = await configureCustomNight({ target, calibration,
      targetBuild: spec.target.build,
      tap: ({ point: targetPoint, holdMs }) => tap({ point: targetPoint, holdMs }),
      readback: args => configReadback({ ...args, bridge, serial }),
    });
    await tap({ point: calibration.start.point, holdMs: calibration.start.holdMs });
    return configured;
  };

  const devicePreflight = args => bridge.preflight({ targetBuild: spec.target.build, ...args });
  const composed = composeCampaignPorts({ spec, bundle, profile,
    artifact: bundle.artifact, devicePreflight, menu, customNight, intro,
    terminal, terminalVerification, save, retryReady, localExecutor });
  const ports = {
    ...composed.ports,
    releaseAll: async () => {
      await composed.ports.releaseAll();
      await closeMenuHid();
    },
    cleanup: async reason => {
      try { await composed.ports.cleanup(reason); }
      finally { await closeMenuHid(); }
    },
  };
  return Object.freeze({ ports, runner: new DeviceCampaignRunner({ spec, ports }), deviceLocal: true,
    close: closeMenuHid, qualification });
}

export default createCampaignPorts;
