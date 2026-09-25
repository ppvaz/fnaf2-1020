#!/usr/bin/env node
/**
 * One FNaF 1 Custom Night on the handset, observed only through the Cue
 * Helper: whole native frames (SNAP) for the title and the dials, raw native
 * regions (REGION) for the night. No screencap, no luma, no grid.
 *
 *   tools/device/fnaf1-custom-run.sh --dry-run
 *   tools/device/fnaf1-custom-run.sh --live --confirm-live --dials 0,0,0,0 --mode calibrate-empty [--label NAME]
 *
 * The menu path is the probe's measured one (fnaf1-menu-probe.mjs): three
 * identical confident title reads, the Custom Night row, the settled screen,
 * every dial walked to its target with a read after each press. Then Ready --
 * the one control on that screen the probe never pressed.
 *
 * `calibrate-empty` needs 0/0/0/0: with every dial at 0 nothing moves until
 * the 2 AM row gives Bonnie 1 (179 s), so the choreography below is
 * open-loop and safe. It exercises every control the 4/20 route uses -- both
 * lights with each door open and shut, both doors, the monitor, CAM 4B, both
 * pans -- while every native region frame is recorded with its image time on
 * the host clock. Those frames are the empty-class templates and the latency
 * measurements (press to first changed frame) the route's detectors and
 * margins are built from. The night is left by a title-gated force-stop.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { AdbDeviceBridge } from '../../apps/device/src/adb-bridge.js';
import { AdbCueHelperPort, AdbHidProcess } from '../../apps/device/src/physical-ports.js';
import { HidWireTransport } from '../../packages/adapters/src/transports/hid.js';
import { ProbeRecord, ensureTitle, titleRead, titleConsensus, settleCustomNight, setDials, restartToTitle,
  DIALS, PACKAGE, BUILD, LEAVE_WAIT_MS } from './fnaf1-menu-probe.mjs';
import { loadRegionSet, registerSet } from './native-regions.mjs';
import { loadDetectors, makeClassifier } from './fnaf1-detectors.mjs';
import { grid420 } from '../fnaf1-device-lane.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const DEFAULT_SERIAL = 'ZF525F5BH5';
const TITLE_MODEL_PATH = join(HERE, 'models/title-fnaf1-moto-g56-v207.json');
const CUSTOM_NIGHT_MODEL_PATH = join(HERE, 'models/custom-night-fnaf1-moto-g56-v207.json');
const CONTROLS_PATH = join(HERE, 'models/controls-fnaf1-moto-g56-v207.json');
const REGIONS_PATH = join(HERE, 'models/regions-fnaf1-moto-g56-v207.json');
const CONTACT_MS = 160;
const MODES = Object.freeze(['calibrate-empty', 'grid420']);
const NIGHT_MS = 535000;                 // 90 s + 5 x 89 s (fnaf1.js CLOCK)

const sleep = ms => new Promise(r => setTimeout(r, ms));
const stamp = () => new Date().toISOString().replace(/[-:.]/g, '');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function fail(message) { throw new Error(`fnaf1-custom-run: ${message}`); }

export function parseArgs(argv) {
  const o = { live: false, confirmLive: false, dryRun: false, dials: null, mode: null, label: null,
    detectors: null, stopAfterMs: NIGHT_MS + 3000, originOffsetMs: -97, chicaByCamera: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--live') o.live = true;
    else if (a === '--confirm-live') o.confirmLive = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--dials') {
      const parts = String(argv[++i] ?? '').split(',').map(Number);
      if (parts.length !== 4 || !parts.every(v => Number.isInteger(v) && v >= 0 && v <= 20)) fail('--dials is F,B,C,X in 0..20');
      if (parts.join('/') === '1/9/8/7') fail('--dials refuses 1/9/8/7: Ready goes somewhere other than a night');
      o.dials = Object.fromEntries(DIALS.map((d, n) => [d, parts[n]]));
    } else if (a === '--mode') o.mode = argv[++i];
    else if (a === '--label') o.label = argv[++i];
    else if (a === '--detectors') o.detectors = argv[++i];
    else if (a === '--stop-after-ms') o.stopAfterMs = Number(argv[++i]);
    else fail(`unknown argument ${a}`);
  }
  if (o.label !== null && !/^[a-z0-9][a-z0-9-]{0,40}$/.test(o.label)) fail('--label is lowercase letters, digits, hyphens');
  if (o.dryRun) return o;
  if (!o.live || !o.confirmLive) fail('live actuation needs --live and --confirm-live');
  if (!MODES.includes(o.mode)) fail(`--mode is one of ${MODES.join(', ')}`);
  if (!o.dials) fail('--dials is required');
  if (o.mode === 'calibrate-empty' && DIALS.some(d => o.dials[d] !== 0))
    fail('calibrate-empty is open-loop and is only safe at 0/0/0/0');
  if (o.mode === 'grid420' && !o.detectors) fail('grid420 needs --detectors (a fnaf1-detectors-v1 file)');
  return o;
}

/** The probe's bridge shape, backed by the helper's projection instead of screencap. */
class HelperFrameBridge {
  constructor(serial, port, adbBridge) {
    this.serial = serial; this.port = port; this.adbBridge = adbBridge; this.n = 0;
    this.dir = join(tmpdir(), `fnaf1-snap-${process.pid}`);
  }
  async capturePng() {
    await mkdir(this.dir, { recursive: true });
    this.n += 1;
    const target = join(this.dir, `f${this.n}.png`);
    await this.port.snap(`f${this.n}`, target);
    return readFile(target);
  }
  preflight(options) { return this.adbBridge.preflight(options); }
}

/** Every distinct native-region frame, gzipped NDJSON, stamped on the host clock. */
class RegionRecorder {
  constructor(channel, path) {
    this.channel = channel; this.path = path; this.running = false; this.frames = 0; this.errors = 0;
    this.gzip = createGzip(); this.gzip.pipe(createWriteStream(path));
    this.last = -1; this.latest = null;
  }
  start() {
    this.running = true;
    this.loop = (async () => {
      while (this.running) {
        try {
          const r = await this.channel.read();
          if (r.seq < 0 || r.seq === this.last) continue;
          this.last = r.seq;
          this.latest = r;
          const regions = Object.fromEntries(Object.entries(r.regions).map(([k, v]) =>
            [k, Buffer.from(new Uint8Array(v.pixels.buffer)).toString('base64')]));
          this.gzip.write(`${JSON.stringify({ seq: r.seq, imageHostMs: r.imageHostMs, sentAt: r.sentAt,
            receivedAt: r.receivedAt, regions })}\n`);
          this.frames += 1;
        } catch {
          this.errors += 1;
          await sleep(20);
        }
      }
    })();
  }
  async stop() {
    this.running = false;
    await this.loop;
    await new Promise(r => this.gzip.end(r));
  }
}

async function press(hid, record, control, point, detail = {}) {
  const at = performance.now();
  await record.event('input.requested', { control, point, durationMs: CONTACT_MS, hostMs: at, ...detail });
  await hid.send({ command: { action: { kind: 'press', durationMs: CONTACT_MS } }, point });
  record.document.inputsSent += 1;
  await record.event('input.released', { control, hostMs: performance.now() });
}

async function hold(hid, record, control, point, durationMs) {
  const at = performance.now();
  await record.event('input.requested', { control, point, durationMs, hostMs: at, kind: 'hold' });
  await hid.send({ command: { action: { kind: 'hold', durationMs } }, point });
  record.document.inputsSent += 1;
  await record.event('input.released', { control, hostMs: performance.now() });
}

/** The 0/0/0/0 choreography: every route control, open-loop, timestamped. */
async function calibrateEmpty({ hid, record, bridge, controls, snapTo }) {
  const c = controls.controlMap;
  const pt = (name) => ({ x: c[name].x, y: c[name].y });
  const mark = (phase) => record.event('phase', { phase, hostMs: performance.now() });
  await mark('office-pan0'); await snapTo('office-pan0');
  for (const side of ['left', 'right']) {
    if (side === 'right') {
      const p = controls.panMap.right;
      await hold(hid, record, 'pan-right', { x: p.x, y: p.y }, p.durationMs);
      await sleep(600); await mark('office-pan600'); await snapTo('office-pan600');
    }
    const light = side === 'left' ? 'leftDoorLight' : 'rightDoorLight';
    const door = side === 'left' ? 'leftDoor' : 'rightDoor';
    await mark(`${side}-light-open`);
    for (let i = 0; i < 5; i += 1) {
      await press(hid, record, light, pt(light), { state: 'on' }); await sleep(1200);
      if (i === 0) await snapTo(`${side}-lit-open`);
      await press(hid, record, light, pt(light), { state: 'off' }); await sleep(800);
    }
    await mark(`${side}-door-shut`);
    await press(hid, record, door, pt(door), { state: 'close' }); await sleep(1500);
    await snapTo(`${side}-door-shut`);
    for (let i = 0; i < 4; i += 1) {
      await press(hid, record, light, pt(light), { state: 'on' }); await sleep(1200);
      if (i === 0) await snapTo(`${side}-lit-shut`);
      await press(hid, record, light, pt(light), { state: 'off' }); await sleep(800);
    }
    await press(hid, record, door, pt(door), { state: 'open' }); await sleep(1200);
    await mark(`${side}-monitor`);
    for (let i = 0; i < 5; i += 1) {
      await press(hid, record, 'monitor', pt('monitor'), { state: 'up' }); await sleep(900);
      if (i === 0 && side === 'left') {
        await press(hid, record, 'cam4B', controls.cam4bButton, { state: 'select' }); await sleep(800);
        await snapTo('cam4b');
      }
      await sleep(300);
      await press(hid, record, 'monitor', pt('monitor'), { state: 'down' }); await sleep(900);
    }
  }
  const p = controls.panMap.left;
  await hold(hid, record, 'pan-left', { x: p.x, y: p.y }, p.durationMs);
  await mark('choreography-done');
}

/** A live REGION read as the classifier takes it: region name -> raw samples. */
const samples = (r) => ({ ...r, regions: Object.fromEntries(Object.entries(r.regions).map(([k, v]) => [k, v.pixels])) });

/** The office's first frame: the left panel reads a known empty state at pan 0. */
async function waitForOffice(recorder, classify, boundMs) {
  const until = performance.now() + boundMs;
  let seen = -1;
  while (performance.now() < until) {
    const r = recorder.latest;
    if (r && r.seq !== seen) {
      seen = r.seq;
      const f = classify(samples(r), 0);
      if (f.monitor === 'down' && f.leftDoor === 0 && f.left === 'dark') return r;
    }
    await sleep(5);
  }
  return null;
}

/**
 * Drive a device-lane policy (tools/fnaf1-device-lane.mjs) on the phone: the
 * same generator, its actions performed by the HID and its reads answered by
 * the newest native-region frame, classified. Time is the night's own: 0 is
 * the origin placed from the first office frame.
 */
async function runPolicy({ policy, options, hid, record, controls, recorder, classify, epochHostMs, stopAfterMs }) {
  const c = controls.controlMap;
  const point = (control, pan) => {
    const p = c[control];
    if (p.anchor === 'world' && p.measuredAtPan !== pan) throw new Error(`${control} is not reachable at pan ${pan}`);
    return { x: p.x, y: p.y };
  };
  let pan = 0;
  const ctx = {
    now: () => performance.now() - epochHostMs,
    epochErrorMs: 0,
    believedRollMs: (period, k) => k * period,
    options: { ...options, debug: (m) => { record.event('policy', { m }).catch(() => {}); } },
  };
  const it = policy(ctx);
  let value; let send;
  let lastSeq = -1; let stale = 0;
  while (ctx.now() < stopAfterMs) {
    ({ value } = it.next(send));
    send = undefined;
    if (value === undefined) break;
    if ('wait' in value) { await sleep(Math.max(0, value.wait)); continue; }
    if ('read' in value) {
      const r = recorder.latest;
      if (!r) { await sleep(10); continue; }
      const f = classify(samples(r), pan);
      f.frame = (r.imageHostMs - epochHostMs) / (1000 / 60);
      f.seq = r.seq;
      // A room that stops being the office (a jumpscare, a blackout, the
      // 6 AM screen) is the end of the night, not a state to act on.
      if (r.seq !== lastSeq) { lastSeq = r.seq; stale = f.monitor === 'flipping' ? stale + 1 : 0; }
      if (stale > 150) { await record.event('night-left-office', { atMs: ctx.now() }); return 'LEFT_OFFICE'; }
      send = f;
      continue;
    }
    if ('pan' in value) {
      const p = controls.panMap[value.pan];
      await hold(hid, record, `pan-${value.pan}`, { x: p.x, y: p.y }, p.durationMs);
      pan = p.resultingPan;
      continue;
    }
    if ('tapCam' in value) { await press(hid, record, 'cam4B', controls.cam4bButton, { atNightMs: ctx.now() }); continue; }
    if ('tap' in value) {
      const map = { leftLight: 'leftDoorLight', rightLight: 'rightDoorLight', leftDoor: 'leftDoor', rightDoor: 'rightDoor', monitor: 'monitor' };
      const control = map[value.tap];
      await press(hid, record, control, point(control, pan), { atNightMs: ctx.now(), pan });
      continue;
    }
    throw new Error(`unknown policy action ${JSON.stringify(value)}`);
  }
  return 'STOP_AFTER';
}

async function main(argv) {
  const options = parseArgs(argv);
  const controlsModel = JSON.parse(await readFile(CONTROLS_PATH, 'utf8'));
  const regionModel = loadRegionSet(REGIONS_PATH, 'night');
  const cam = regionModel.model.controlsMeasuredFrom?.cam4bButton;
  if (!cam || !Number.isInteger(cam.x) || !Number.isInteger(cam.y)) fail('region model has no CAM 4B button point');
  const controls = { ...controlsModel, cam4bButton: { x: cam.x, y: cam.y } };
  const titleModel = JSON.parse(await readFile(TITLE_MODEL_PATH, 'utf8'));
  const customNight = JSON.parse(await readFile(CUSTOM_NIGHT_MODEL_PATH, 'utf8'));
  const ready = customNight.controls?.ready?.point;
  if (!Array.isArray(ready) || ready.length !== 2) fail('Custom Night model has no measured Ready point');
  const bindings = Object.fromEntries(await Promise.all([
    ['controls', CONTROLS_PATH], ['regions', REGIONS_PATH], ['title', TITLE_MODEL_PATH], ['customNight', CUSTOM_NIGHT_MODEL_PATH],
  ].map(async ([k, p]) => [k, { path: p.slice(ROOT.length + 1), sha256: sha256(await readFile(p)) }])));
  if (options.dryRun) { console.log(JSON.stringify({ status: 'DRY_RUN', modes: MODES, bindings }, null, 2)); return; }
  if (process.env.FNAF1_LEASE_HELD !== '1') fail('run through fnaf1-custom-run.sh so the serial lease is held');
  const serial = process.env.FNAF_SERIAL ?? DEFAULT_SERIAL;

  const id = `fnaf1-custom-${options.mode}-${options.label ?? 'run'}-${stamp()}`;
  const outdir = join(ROOT, 'artifacts', 'runs', id);
  const captureDir = join(homedir(), 'fnaf-apks', 'fnaf1-device-runs', id);
  await Promise.all([mkdir(outdir, { recursive: true }), mkdir(captureDir, { recursive: true })]);
  const record = new ProbeRecord({ id, outdir, captureDir, options, bindings });
  record.document.schema = 'fnaf1-custom-run-v1';
  record.document.claimLevel = 'DEVICE_MEASURED helper native frames and regions; no detector or route is promoted by this record';
  record.document.capture.sensor = 'cue-helper-mediaprojection-2400x1080';
  await record.save('PREFLIGHT');

  const adbBridge = new AdbDeviceBridge({ serial });
  const port = new AdbCueHelperPort({ serial });
  const bridge = new HelperFrameBridge(serial, port, adbBridge);
  const snapTo = async (name) => { const png = await bridge.capturePng(); await record.capture(name, png); };
  let hidProcess = null; let hid = null; let recorder = null; let channel = null;
  let entered = false; let error = null;
  try {
    await ensureTitle(bridge, record, { requireHid: true });
    hidProcess = new AdbHidProcess({ serial });
    hid = new HidWireTransport({ write: l => hidProcess.write(l), ready: () => hidProcess.ready(), contactMs: CONTACT_MS });
    await hid.start();
    record.document.titleBefore = await titleConsensus(bridge, record, 'title-before', ['customNight']);
    const row = titleModel.items.customNight;
    entered = true;
    await press(hid, record, 'customNight', { x: row[0], y: row[1] });
    const deadline = performance.now() + LEAVE_WAIT_MS;
    for (let n = 1; ; n += 1) {
      await sleep(500);
      const read = await titleRead(bridge, record, `after-row-${n}`);
      if (!read.confident && /not-the-title-screen/.test(read.output)) break;
      if (performance.now() > deadline) fail('the Custom Night row did not leave the title');
    }
    const start = await settleCustomNight(bridge, record, customNight.settle.boundMs);
    if (start.status !== 'PASS') fail(`dials unreadable at entry: ${start.reason}`);
    record.document.dialsAtEntry = start.dials;
    record.document.dialsSet = await setDials(bridge, record, hid, customNight, CONTACT_MS, options.dials, 'set');

    channel = port.openRegions({ timeoutMs: 1500 });
    await registerSet(channel, regionModel.set);
    recorder = new RegionRecorder(channel, join(captureDir, 'regions.ndjson.gz'));
    recorder.start();
    await sleep(500);
    await press(hid, record, 'ready', { x: ready[0], y: ready[1] });
    record.document.readyHostMs = performance.now();
    await record.save('NIGHT');
    if (options.mode === 'calibrate-empty') {
      await sleep(12000);
      await calibrateEmpty({ hid, record, bridge, controls, snapTo });
      // Hold through 1 AM (90 s after the office) so the hour change is recorded.
      const until = record.document.readyHostMs + 110000;
      while (performance.now() < until) await sleep(500);
      await snapTo('end-of-calibration');
    } else if (options.mode === 'grid420') {
      const classify = makeClassifier(loadDetectors(options.detectors));
      const office = await waitForOffice(recorder, classify, 20000);
      if (!office) fail('no office frame within 20 s of Ready');
      const epochHostMs = office.imageHostMs + options.originOffsetMs;
      record.document.night = { officeImageHostMs: office.imageHostMs, officeAfterReadyMs: office.imageHostMs - record.document.readyHostMs,
        epochHostMs, originOffsetMs: options.originOffsetMs };
      await record.event('night-origin', record.document.night);
      await record.save('NIGHT_RUNNING');
      const ended = await runPolicy({ policy: grid420, options: { chicaByCamera: options.chicaByCamera }, hid, record,
        controls, recorder, classify, epochHostMs, stopAfterMs: options.stopAfterMs });
      record.document.night.ended = ended;
      record.document.night.endedAtNightMs = performance.now() - epochHostMs;
      await record.event('night-ended', { ended, atNightMs: record.document.night.endedAtNightMs });
      try { await hid.abort(); } catch { /* release any held contact before looking */ }
      for (let i = 0; i < 3; i += 1) { await snapTo(`after-night-${i}`); await sleep(2500); }
    }
  } catch (e) {
    error = e;
  } finally {
    try { await hid?.abort(); } catch { /* best effort */ }
    try { await hidProcess?.close(); } catch { /* the lease bounds cleanup */ }
    if (recorder) {
      await recorder.stop();
      record.document.regions = { frames: recorder.frames, errors: recorder.errors, path: join(captureDir, 'regions.ndjson.gz') };
    }
    try { await channel?.clear(); } catch { /* the helper drops regions with its session */ }
    channel?.close();
    if (entered) {
      try { await restartToTitle(bridge, record); record.document.recovery = 'TITLE_CONFIRMED'; }
      catch (e) { record.document.recovery = `FAILED: ${e.message}`; error ??= e; }
    }
  }
  if (error) {
    record.document.error = error.message;
    await record.event('error', { message: error.message });
    await record.save('FAILED_OR_REFUSED');
  } else await record.save('COMPLETE');
  console.log(`fnaf1 custom run ${id}: ${record.document.status}; inputs=${record.document.inputsSent}; ` +
    `regionFrames=${record.document.regions?.frames}; out=${outdir}; frames=${captureDir}`);
  if (record.document.status !== 'COMPLETE') process.exitCode = 3;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 2; });
}
