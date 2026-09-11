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
import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CueHelperControlTransport, HidWireTransport, measureMaskOn, measureMonitorUp,
  parseCameraRule, parseMaskRule, parseMonitorRule, reconcileExclusiveControls } from '@fnaf2-1020/adapters';
import { configureCustomNight, validateCustomNightCalibration, CUSTOM_NIGHT_CONTACT_MS } from './custom-night.js';
import { AdbDeviceBridge } from './adb-bridge.js';
import { composeCampaignPorts } from './campaign-composition.js';
import { AdbDeviceLocalArtifactExecutor, AdbDeviceLocalMachineExecutor } from './adb-device-local-executor.js';
import { makeCampaignExecutionRequest } from './campaign-bundle.js';
import { AdbCueHelperPort, AdbHidProcess } from './physical-ports.js';
import { DeviceCampaignRunner } from './campaign-runner.js';

const TITLE_MODEL = new URL('../../../tools/device/models/title-moto-g56-v207.json', import.meta.url);
const CAMERA_RULE = new URL('../../../models/camera-rule-moto-g56-v207.json', import.meta.url);
const MONITOR_RULE = new URL('../../../models/monitor-rule-moto-g56-v207.json', import.meta.url);
const MASK_RULE = new URL('../../../models/mask-rule-moto-g56-v207.json', import.meta.url);
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
  const result = await observePython(script, png, args);
  await bridge.recordObservation?.({ script: fileURLToPath(script).split('/').at(-1), png, ...result });
  return result;
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

/**
 * Read the exact camera highlight set from the authenticated native watch.
 * The helper's singular `cameraSelected` fact deliberately becomes UNKNOWN
 * for the Android double-camera glitch; the arm gate needs the complete set,
 * so it consumes the calibrated button entries from that same READ frame.
 */
function nativeCameraHighlights(read, rule) {
  const unknown = reason => ({ state: 'UNKNOWN', reason });
  if (read?.read !== 'OBSERVED') return unknown('read-unavailable');
  const ageUs = Number(read.ageUs);
  if (!Number.isFinite(ageUs) || ageUs < 0) return unknown('read-unavailable');
  if (ageUs > 500000) return unknown('read-stale');
  const highlights = [];
  for (const button of rule.adapter.buttons) {
    const raw = read[button.entry];
    if (raw === undefined || raw === 'UNKNOWN') return unknown('read-unavailable');
    const value = Number(raw);
    if (!Number.isFinite(value)) return unknown('feature-missing');
    const lower = button.rule.threshold - button.rule.refuse_band;
    const upper = button.rule.threshold + button.rule.refuse_band;
    if (value >= upper) highlights.push(button.control);
    else if (value > lower) return unknown('ambiguous-threshold');
  }
  if (highlights.length === 0) return unknown('no-camera-highlight');
  return { state: 'OBSERVED', value: highlights };
}

function createHidSender(hidProcess, { registerDelayMs = 0 } = {}) {
  const name = 'FNAF Campaign Menu';
  const transport = new HidWireTransport({
    write: line => hidProcess.write(line),
    ready: () => hidProcess.ready(name),
    name,
    contactMs: CUSTOM_NIGHT_CONTACT_MS,
    registerDelayMs,
  });
  return {
    transport,
    send: ({ point: target, durationMs = CUSTOM_NIGHT_CONTACT_MS }) => transport.send({
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
    machineOnly = false, allowSaveReset = false } = options;
  if (typeof serial !== 'string' || serial.length === 0) throw new TypeError('modern campaign ports require an ADB serial');
  if (typeof allowSaveReset !== 'boolean') throw new TypeError('allowSaveReset must be boolean');
  if (profile?.actuator !== 'hid-multi' || profile?.visualSensor !== 'mediaprojection')
    throw new TypeError('modern campaign ports require a HID + MediaProjection profile');
  const bridge = new AdbDeviceBridge({ serial, adb });
  const evidenceDirectory = resolve('artifacts', `campaign-${new Date().toISOString().replaceAll(':', '-')}`);
  await mkdir(evidenceDirectory, { recursive: false });
  await writeFile(join(evidenceDirectory, 'request.json'), JSON.stringify({ spec, bundle, profile }, null, 2));
  const onEvent = event => {
    const row = JSON.stringify({ at: new Date().toISOString(), ...event });
    appendFileSync(join(evidenceDirectory, 'events.jsonl'), row + '\n');
    process.stderr.write(row + '\n');
  };
  onEvent({ type: 'evidence.started', evidenceDirectory });
  let lastLabel = null;
  let lastFrameAt = 0;
  let frameNumber = 0;
  bridge.recordObservation = async ({ script, png, stdout, stderr, code }) => {
    const label = lastLine(stdout);
    const at = Date.now();
    const retain = label !== lastLabel || !label.startsWith('state=night') || at - lastFrameAt >= 10000;
    let frame;
    if (retain) {
      frame = `${String(++frameNumber).padStart(5, '0')}-${script}.png`;
      await writeFile(join(evidenceDirectory, frame), png);
      lastFrameAt = at;
    }
    await appendFile(join(evidenceDirectory, 'observations.jsonl'), JSON.stringify({ at, script, label, code, stderr, frame }) + '\n');
    if (label !== lastLabel) onEvent({ type: 'observation', label, frame });
    lastLabel = label;
  };
  // The device-local runner is the only path that assembles the legacy shell
  // driver. Give that driver the already-running Cue Helper endpoint so its
  // lifecycle/read functions can use the authenticated visual sensor too.
  // Endpoint discovery is bounded and happens before the executor is armed;
  // no input is sent here.
  const cuePort = new AdbCueHelperPort({ serial, adb });
  const cueEndpoint = cuePort.discover();
  const cueTransport = new CueHelperControlTransport({
    request: line => cuePort.request(line), token: cueEndpoint.token,
  });
  const [cameraRule, monitorRule, maskRule] = await Promise.all([
    readJson(CAMERA_RULE).then(parseCameraRule),
    readJson(MONITOR_RULE).then(parseMonitorRule),
    readJson(MASK_RULE).then(parseMaskRule),
  ]);
  const maskLimitations = (maskRule.adapter?.limitations ?? []).filter(value =>
    typeof value === 'string' && value.length <= 63);
  // The fitted mask rule is intentionally diagnostic-only until its blackout
  // and animation limitations are retired. Preserve that fact in each ACK so
  // later analysis cannot mistake a useful trace clue for a live safety gate.
  const maskEvidence = maskLimitations.length
    ? `diagnostic-provisional:${maskLimitations.join(',')}` : 'calibrated';
  let armWatchLoaded = false;
  const ensureArmWatch = () => {
    if (armWatchLoaded) return;
    const status = cueTransport.watch('status');
    if (typeof status.spec !== 'string' || !/^[0-9a-f]{64}$/.test(status.spec))
      throw new Error('native camera watchlist status has no valid spec hash');
    const active = status.watch === 'ACTIVE';
    const loaded = active ? status : cueTransport.watch(status.spec);
    if (loaded.watch !== 'ACTIVE' || loaded.spec !== status.spec)
      throw new Error('native camera watchlist did not activate');
    armWatchLoaded = true;
  };
  const observeArm = () => {
    if (!armWatchLoaded) throw new Error('native camera watchlist is not active');
    const read = cueTransport.read();
    const highlights = nativeCameraHighlights(read, cameraRule);
    const cameraValues = Object.fromEntries(cameraRule.adapter.buttons.map(button =>
      [button.control, read[button.entry] ?? 'UNKNOWN']));
    return {
      sequence: read.seq,
      highlights: highlights.state === 'OBSERVED' ? highlights.value : null,
      cameraValues,
      // A true double highlight intentionally has no singleton camera fact.
      // The declared viewing camera is verified by the exact pair contract.
      viewing: null,
      reason: highlights.state === 'UNKNOWN' ? highlights.reason : null,
    };
  };
  const observeControlState = () => {
    // FRAME carries the snapshot and its 20x9 grid under one sequence. A
    // GET/GRID pair is deliberately not used here: those reads cannot prove
    // they describe the same image at the helper's capture cadence.
    const frame = cueTransport.frame();
    const monitor = measureMonitorUp(frame, monitorRule, { cells: frame.cells });
    const mask = measureMaskOn(frame, maskRule, { cells: frame.cells });
    // The fitted monitor rule answers only on the office HUD -- the screen a
    // raised monitor hides. Measured on Night 5 (campaign-2026-09-09T14-14-39,
    // 41 observations: 40 false, 1 true) it never once saw the monitor up,
    // while the retained video shows the camera feed up for half the night.
    // A visible camera highlight is the positive evidence it cannot give, so
    // the two are read as complements rather than one replacing the other:
    // highlights decide monitor-up, the office HUD decides monitor-down.
    /** @type {{state: string, reason?: string, value?: string[]}} */
    let panel = { state: 'UNKNOWN', reason: 'camera-watch-unavailable' };
    let panelRead = null;
    try {
      ensureArmWatch();
      panelRead = cueTransport.read();
      panel = nativeCameraHighlights(panelRead, cameraRule);
    } catch { /* the fitted rule still carries the monitor-down half */ }
    // The camera rule is calibrated on monitor-up frames only; its behaviour
    // over the office is unmeasured. The helper's own screen classifier is the
    // independent guard: FNAF2_NIGHT is the office HUD, which a raised monitor
    // covers, so a highlight claimed against it is a contradiction and not a
    // state. FRAME and READ are separate round trips, so this also catches a
    // pairing straddling a real transition.
    const officeOnScreen = frame.screen === 'FNAF2_NIGHT';
    const panelUp = panel.state === 'OBSERVED' && !officeOnScreen ? true : null;
    // A positive monitor-rule result on a known office frame is impossible:
    // the office HUD is covered by a raised monitor. Do not let a stale or
    // overfit rule manufacture the illegal half of the pair.
    const ruleUp = monitor.state === 'OBSERVED' &&
      !(officeOnScreen && monitor.value === true) ? monitor.value : null;
    const contradicted = panel.state === 'OBSERVED' && officeOnScreen;
    const rawMonitorUp = panelUp ?? ruleUp;
    const rawMaskOn = mask.state === 'OBSERVED' ? mask.value : null;
    const exclusive = reconcileExclusiveControls({
      monitorUp: rawMonitorUp, maskOn: rawMaskOn,
    });
    const monitorUp = exclusive.monitorUp;
    const monitorSource = panelUp !== null ? 'camera-panel'
      : ruleUp !== null ? 'monitor-rule' : exclusive.monitorInference;
    const maskOn = exclusive.maskOn;
    const maskSource = exclusive.maskInference ??
      (mask.state === 'OBSERVED' ? 'mask-rule' : null);
    let visualCapture = null;
    try { visualCapture = cueTransport.visualAcquisition(frame); }
    catch { /* an unavailable timestamp leaves the state ACK usable but bounded */ }
    return {
      sequence: frame.seq,
      ageUs: frame.ageUs,
      screen: frame.screen,
      monitorUp,
      ...(monitorSource ? { monitorSource } : {}),
      panelSequence: panelRead?.seq ?? null,
      monitorReason: monitorUp !== null ? null
        : exclusive.contradiction ? exclusive.reason
        : contradicted ? 'camera-panel-over-office-hud'
        : monitor.state === 'UNKNOWN' ? monitor.reason : panel.reason,
      maskOn,
      ...(maskSource ? { maskSource } : {}),
      maskReason: maskOn !== null ? null
        : exclusive.contradiction ? exclusive.reason
        : mask.state === 'UNKNOWN' ? mask.reason : null,
      // A frame the fitted rule cannot classify is the only frame worth the
      // bytes: retaining its sensor row is what lets a later refit cover the
      // state, instead of another night spent rediscovering that it exists.
      ...(mask.state === 'OBSERVED' ? {} : { maskCells: frame.cells }),
      // The helper's darkness feature, carried so a refused frame can still
      // refute mask-on. It is never used to assert mask-on: that is the one
      // direction a blackout is indistinguishable from the mask.
      gridLuma: Math.floor(frame.cells.reduce((sum, cell) =>
        sum + (((77 * ((cell >> 16) & 0xff)) + (150 * ((cell >> 8) & 0xff)) +
          (29 * (cell & 0xff))) >> 8), 0) / frame.cells.length),
      maskEvidence: exclusive.maskInference === 'monitor-up-complement'
        ? 'exclusive-monitor-up' : maskEvidence,
      ...(visualCapture ? { visualCaptureAt: visualCapture.at,
        visualCaptureUncertaintyMs: visualCapture.uncertaintyMs } : {}),
    };
  };
  const localExecutor = machineOnly
    ? new AdbDeviceLocalMachineExecutor({ serial, adb, ...(await machineAssets()),
      planPath: `${bundle.bundleDirectory}/night-6.plan`,
      planHash: bundle.planHashes?.[6],
      pilotOffsetMs: bundle.machine?.pilotOffsetMs ?? 10,
      deviceSpacingMs: bundle.machine?.deviceSpacingMs ?? 66,
      contactMs: bundle.machine?.contactMs ?? 33,
      cuePort: cueEndpoint.port,
      cueToken: cueEndpoint.token,
      onOutput: chunk => process.stderr.write(chunk),
      observe: () => lifecycle(bridge, serial), pollMs: 1000 })
    : new AdbDeviceLocalArtifactExecutor({ serial, adb,
      observe: () => lifecycle(bridge, serial), observeArm, observeControlState,
      pollMs: 250, onEvent,
      onOutput: output => onEvent({ type: 'hid.stderr', output }) });
  const titleModel = await readJson(TITLE_MODEL);
  const modelPath = TITLE_MODEL.pathname;
  let menuHid = null;
  // Set when save() observes the game roll a 6 AM straight into the next
  // night's gameplay (story Nights 1..4 on this build). The next night's
  // menu step is then satisfied by the roll: there is no title to read.
  let rolledIntoNight = 0;

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
  // The artifact-lane request is identical in shape to the machine one; the
  // pre-armed schedule below needs it before the runner calls executeAttempt.
  const artifactRequestFor = machineRequestFor;
  let pendingExecution = null;

  const tap = async ({ point: target, holdMs = CUSTOM_NIGHT_CONTACT_MS }) => {
    point(target, 'tap point');
    const sender = openMenuHid();
    await sender.transport.send({
      command: { action: { kind: 'press', durationMs: holdMs }, source: { controller: 'modern-campaign' } },
      point: target,
    });
  };

  const menu = async ({ target }) => {
    // A story night the game rolled straight into after the previous night's
    // observed 6 AM: the roll performed the selection, no title exists to
    // read, and no press may be sent. Anything else still goes through the
    // observed-title path below.
    if (rolledIntoNight === target.night && target.mode === 'story' && target.menuTarget === 'continue') {
      const state = await lifecycle(bridge, serial);
      if (state !== 'night')
        throw new Error(`rolled-through night ${target.night} left gameplay before its attempt (state=${state})`);
      if (machineOnly) {
        if (!(localExecutor instanceof AdbDeviceLocalMachineExecutor))
          throw new Error('machine campaign did not compose a machine executor');
        await localExecutor.arm(machineRequestFor(target));
      }
      return { target: target.menuTarget, visible: false, selected: true, observed: true,
        rolledThrough: true, state };
    }
    const items = await title(bridge, serial, modelPath);
    const targetName = target.menuTarget;
    if (!items.includes(targetName)) return { target: targetName, visible: false, selected: false, observed: true };
    if (targetName === 'newGame' && !allowSaveReset)
      throw new Error('New Game requires the explicit allow-save-reset capability');
    // HID registration waits for Android InputReader. Re-read the title after
    // that bounded wait so the press is tied to a fresh target observation.
    const sender = openMenuHid();
    await sender.transport.start();
    // Register and qualify the gameplay HID while the title is still visible.
    // Doing this in intro() consumed the night opening during InputReader's
    // attachment delay. The menu transport has a distinct device name so it
    // cannot satisfy the gameplay driver's readiness check.
    if (machineOnly) {
      if (!(localExecutor instanceof AdbDeviceLocalMachineExecutor))
        throw new Error('machine campaign did not compose a machine executor');
      await localExecutor.arm(machineRequestFor(target));
    }
    const freshItems = await title(bridge, serial, modelPath);
    if (!freshItems.includes(targetName))
      return { target: targetName, visible: false, selected: false, observed: true, items: freshItems };
    // Spawn the gameplay schedule here, not in intro(). The device script
    // registers the HID device, waits readyDelayMs for Android InputReader,
    // touches its start marker and only then blocks on night_go, so nothing
    // can fire before the office is observed no matter how early it spawns --
    // the gate, not the spawn, releases the prefix. Spawning in intro() left
    // that whole setup racing the intro card and lost it: measured 30.2 s,
    // 25.8 s and 26.5 s from the first observed office frame to the marker,
    // across both story-night winners and the 2026-09-08 Night 5 attempt.
    // The model prices that delay at 1000/1000 on Night 1 and 0/1000 on
    // Night 5, which is what the phone did. The machine lane already armed at
    // this point for the same reason; the artifact lane did not.
    // Placed after the visibility check so an unselectable target cannot leave
    // a spawned schedule waiting on a night that never starts.
    if (!machineOnly && !pendingExecution) {
      if (!(localExecutor instanceof AdbDeviceLocalArtifactExecutor))
        throw new Error('artifact campaign did not compose an artifact executor');
      pendingExecution = localExecutor.execute(artifactRequestFor(target));
      // executeAttempt surfaces the failure; nothing else may await it.
      pendingExecution.catch(() => {});
    }
    const targetPoint = targetName === 'customNight'
      ? point(calibration?.menu?.point, 'calibration.menu.point')
      : modelPoint(titleModel.items?.[targetName], `title model ${targetName}`);
    const holdMs = targetName === 'customNight' ? calibration.menu.holdMs : CUSTOM_NIGHT_CONTACT_MS;
    await tap({ point: targetPoint, holdMs });

    // This build separates focusing a title row from activating it: the first
    // press paints the `>>` cursor and the second press activates the focused
    // row.  The old one-press path returned selected=true while the title was
    // still on screen, so intro() later timed out without ever starting a
    // night.  The lifecycle `title` result above is the focus confirmation;
    // the title model intentionally does not re-read the transient cursor
    // frame because it classifies that frame as unknown.
    const firstSelectionState = await waitFor(bridge, serial,
      value => value === 'title' || value === 'titleDialog' || value === 'intro' || value === 'night',
      10000, 'title row focus or night start');
    if (firstSelectionState === 'title') {
      await tap({ point: targetPoint, holdMs });
    }
    if (targetName !== 'newGame')
      return { target: targetName, visible: true, selected: true, observed: true,
        menuPresses: firstSelectionState === 'title' ? 2 : 1 };

    // New Game raises a measured confirmation dialog. The capability above
    // authorizes the save reset; this second observation proves the dialog is
    // actually present before the calibrated Yes coordinate is pressed. A
    // direct transition is also accepted for builds/states that do not show
    // the prompt, but no unobserved confirmation press is allowed.
    const confirmationState = await waitFor(bridge, serial,
      value => value === 'titleDialog' || value === 'intro' || value === 'night',
      30000, 'new-game confirmation or night start');
    if (confirmationState === 'titleDialog') {
      const yesPoint = modelPoint(titleModel.items?.sixthNight,
        'title model new-game confirmation yes');
      await tap({ point: yesPoint });
      return { target: targetName, visible: true, selected: true, observed: true,
        saveResetAuthorized: true, confirmation: 'observed-and-accepted' };
    }
    return { target: targetName, visible: true, selected: true, observed: true,
      saveResetAuthorized: true, confirmation: 'not-present' };
  };

  const intro = async ({ target }) => {
    // The gameplay driver is already attached and waiting for the office.
    // Close the separate menu channel before accepting the night transition.
    await closeMenuHid();
    if (machineOnly) {
      if (!(localExecutor instanceof AdbDeviceLocalMachineExecutor))
        throw new Error('machine campaign did not compose a machine executor');
      if (!localExecutor.armed) throw new Error('machine input was not armed before the night selection');
    }
    // Pre-arm the device-local schedule while the intro card plays. The
    // executor's night_go gate holds every plan action -- arm taps included --
    // until the lifecycle observer positively sees the office, so spawning
    // during the intro no longer spends plan time on registration and ready
    // delays: the grid origin lands within one poll of 12 AM instead of the
    // measured 30-37 s post-intro offset that killed Night 2 to Foxy on
    // 2026-09-07. The one-shot double-camera arm stays equally protected
    // because the gate, not the spawn, releases the prefix.
    if (!machineOnly) {
      if (!(localExecutor instanceof AdbDeviceLocalArtifactExecutor))
        throw new Error('artifact campaign did not compose an artifact executor');
      if (!pendingExecution) {
        pendingExecution = localExecutor.execute(artifactRequestFor(target));
        // executeAttempt surfaces the failure; nothing else may await it.
        pendingExecution.catch(() => {});
      }
    }
    // Do not accept the night transition on the newspaper/intro card: the
    // mute press and identity below need the office, and only the
    // authoritative office `night` state establishes them.
    const state = await waitFor(bridge, serial, value => value === 'night', 30000, 'night start');
    if (bundle.plans.find(plan => plan.night === target.night)?.armVerification)
      ensureArmWatch();
    // Night setup, not strategy: one bounded press on the office MUTE CALL
    // button so the phone guy call is silent for the run. The measured point
    // comes from the profile; without it the call simply plays.
    if (target.mode === 'story' && isRecord(profile.controlMap?.mute)) {
      const mutePoint = point(profile.controlMap.mute, 'profile.controlMap.mute');
      try {
        const sender = openMenuHid();
        await sender.transport.start();
        await sender.send({ point: mutePoint, durationMs: 33 });
      } finally {
        await closeMenuHid();
      }
    }
    // The 6th Night and Custom Night menu targets identify the configured
    // night. A story night inside a chained campaign is identified by its
    // selection chain: newGame on an observed fresh save, continue after the
    // previous night's observed 6 AM, or continue from an operator-observed
    // save cursor equal to the target night. A standalone continue with an
    // unobserved cursor keeps its identity unknown and is not promoted.
    const storyTargets = spec.nights.filter(entry => entry.mode === 'story');
    const chainedStory = target.mode === 'story' &&
      (target.menuTarget === 'newGame' ||
        (target.menuTarget === 'continue' &&
          (storyTargets.findIndex(entry => entry.night === target.night) > 0 ||
            target.saveCursorObserved === target.night)));
    const identified = target.menuTarget === 'sixthNight' || target.menuTarget === 'customNight' ||
      chainedStory;
    return { night: target.night, identity: identified ? target.mode : 'unknown', observed: identified, state };
  };

  const terminal = async ({ target }) => {
    // The schedule already spanned the night; the game clock can trail the
    // plan by a minute, so the terminal window is generous, not 15 s.
    const state = await waitFor(bridge, serial,
      value => value === 'sixam' || value === 'gameover', 120000, 'night terminal');
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
    // Story Nights 1..4 roll a 6 AM straight into the next night's gameplay
    // on this build — regardless of spec shape — while Night 5 (and 6) end
    // in the paycheck/title instead. For a rolling night the observed roll
    // into night N+1 is the advancement evidence; the deadline must span the
    // 6 AM jingle, newspaper, and intro card, so it is generous like the
    // terminal window, not 15 s.
    const rollsIntoNext = target.night >= 1 && target.night <= 4;
    if (rollsIntoNext) {
      const state = await waitFor(bridge, serial, value => value === 'night', 90000, 'post-win next-night roll');
      rolledIntoNight = target.night + 1;
      return { observed: true, advanced: true, nextNightStarted: true, state };
    }
    await waitFor(bridge, serial, value => value === 'title', 90000, 'post-win title menu');
    const items = await title(bridge, serial, modelPath);
    if (target.night === 6) {
      // `sixthNight` is not evidence of advancement: it was already visible
      // before this campaign. Custom Night visibility is the only currently
      // calibrated positive advancement signal; otherwise proof refuses.
      return { observed: true, customNightVisible: items.includes('customNight'),
        cursorNight: undefined, items };
    }
    if (target.night === 7) {
      return { observed: true, menuReturned: true, customCompleted: items.includes('customNight'), items };
    }
    // Story Nights 1..5: the save advanced when Continue is visible after a
    // 6 AM that this campaign started; Night 5's clear additionally reveals
    // the measured sixthNight item.
    return { observed: true, menuReturned: true,
      continueVisible: items.includes('continue'),
      ...(target.night === 5 ? { sixthNightVisible: items.includes('sixthNight') } : {}),
      items };
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
    executeAttempt: async ({ target }) => {
      // intro() pre-armed the schedule during the intro card; the attempt
      // owns that execution. A retry (or any path that skipped intro)
      // falls back to composing the request here.
      if (pendingExecution) {
        const pending = pendingExecution;
        pendingExecution = null;
        return pending;
      }
      return localExecutor.execute(artifactRequestFor(target));
    },
    releaseAll: async () => {
      pendingExecution = null;
      await composed.ports.releaseAll();
      await closeMenuHid();
    },
    cleanup: async reason => {
      pendingExecution = null;
      try { await composed.ports.cleanup(reason); }
      finally { await closeMenuHid(); }
    },
  };
  return Object.freeze({ ports, runner: new DeviceCampaignRunner({ spec, ports }), deviceLocal: true,
    close: closeMenuHid, qualification, evidenceDirectory });
}

export default createCampaignPorts;
