#!/usr/bin/env node
/** CLI composition root; `dry-run` is the only non-interactive default. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { composeDevice } from './composition.js';
import { AdbDeviceBridge } from './adb-bridge.js';
import { CampaignStateMachine, makeCampaignSpec } from './campaign.js';
import { DeviceCampaignRunner } from './campaign-runner.js';
import { guidedCalibrationSteps, validateCustomNightCalibration } from './custom-night.js';
import { evaluateCampaignPreflight } from './campaign-preflight.js';
import { validateCampaignBundle } from './campaign-bundle.js';
import { composeSeamFixture } from './calibration-fixture.js';
import { AdbCueHelperPort } from './physical-ports.js';
import { fitClockMap, CueHelperControlTransport } from '@fnaf2-1020/adapters';
import { stableHash } from '@fnaf2-1020/core/contracts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PROFILES = join(ROOT, 'apps/device/profiles');

function help() {
  console.log(`fnaf2-device — bounded semantic device composition

Usage:
  npm run device:dry-run -- --profile fixture-hid-screencap
  npm run device:run -- --profile PROFILE --live --confirm-live
  npm run device:preflight -- --profile hid-mediaprojection
  npm run device:campaign -- --guided
  npm run device:calibrate -- --json
  npm run device:clockmap -- --count 12 --span-ms 30000 --out FILE

Commands:
  dry-run       run fixture adapters and retain a replayable bundle (default)
  live          require --live --confirm-live and a non-fixture profile
  preflight     inspect one ADB phone without sending game input
  campaign      validate the Night 6 -> Night 7 campaign and its proof gates
  calibrate     exercise the bounded seam runner with the explicit fixture
  clockmap      measure device->host monotonic clock anchors (read-only, no game input)
  bench         print registered capability descriptors
  grade RUN_ID  show a retained result

Options:
  --profile ID  resolved profile under apps/device/profiles
  --serial ID   select one explicit ADB device
  --nights 6,7  campaign target nights (default: 6,7)
  --json        print machine-readable output for preflight/campaign/calibrate
  --guided      print the one-time Custom Night calibration checklist
  --calibration FILE  measured Custom Night calibration artifact
  --spec FILE   seam-calibration-spec-v1 (calibrate; fixture default)
  --bundle DIR  validated device bundle containing the requested plans
  --qualification FILE  DEVICE_MEASURED qualification artifact
  --ports MODULE  explicit campaign-port composition module
  --machine-only  run an explicit MODEL_ONLY machine-input experiment; no claim promotion
  --no-helper   preflight without requiring Cue Helper
  --no-hid      preflight without requiring /system/bin/hid
  --live        explicitly enable physical actuation
  --confirm-live  acknowledge the bounded live-device safety gate
  --count N     clockmap anchor count (default: 12)
  --span-ms MS  clockmap measurement span (default: 30000)
  --source WHO  clockmap device domain: uptime (/proc/uptime boottime) or helper (System.nanoTime capture domain)
  --out FILE    retain the clock-map-v1 artifact at this path`);
}

function parse(argv) {
  const [first = 'help', ...tail] = argv;
  const knownCommands = new Set(['help', 'bench', 'grade', 'dry-run', 'live', 'preflight', 'campaign', 'calibrate', 'clockmap']);
  if (first === '--help' || first === '-h') return { command: 'help', help: true };
  // Options without an explicit command are accepted for the documented
  // non-interactive default, but an unknown positional command must never
  // silently become a dry-run.
  const command = first.startsWith('-') ? 'dry-run' : first;
  const rest = first.startsWith('-') ? argv : tail;
  if (!knownCommands.has(command)) throw new Error(`unknown command: ${first}`);
  const options = { command, profile: 'fixture-hid-screencap', live: false, confirmLive: false,
    json: false, serial: undefined, nights: [6, 7], requireHelper: true, requireHid: true,
    guided: false, machineOnly: false, calibration: undefined, bundle: undefined,
    qualification: undefined, ports: undefined, spec: undefined, count: 12, spanMs: 30000, out: undefined,
    source: 'uptime' };
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (item === '--help' || item === '-h') options.command = 'help';
    else if (item === '--dry-run') options.live = false;
    else if (item === '--live') options.live = true;
    else if (item === '--confirm-live') options.confirmLive = true;
    else if (item === '--json') options.json = true;
    else if (item === '--guided') options.guided = true;
    else if (item === '--machine-only') options.machineOnly = true;
    else if (item === '--no-helper') options.requireHelper = false;
    else if (item === '--no-hid') options.requireHid = false;
    else if (item === '--serial') options.serial = rest[++index];
    else if (item.startsWith('--serial=')) options.serial = item.slice('--serial='.length);
    else if (item === '--nights') options.nights = rest[++index].split(',').map(Number);
    else if (item.startsWith('--nights=')) options.nights = item.slice('--nights='.length).split(',').map(Number);
    else if (item === '--profile') options.profile = rest[++index];
    else if (item.startsWith('--profile=')) options.profile = item.slice('--profile='.length);
    else if (item === '--calibration') options.calibration = rest[++index];
    else if (item.startsWith('--calibration=')) options.calibration = item.slice('--calibration='.length);
    else if (item === '--spec') {
      options.spec = rest[++index];
      if (!options.spec || options.spec.startsWith('--')) throw new Error('--spec requires a file');
    }
    else if (item.startsWith('--spec=')) {
      options.spec = item.slice('--spec='.length);
      if (!options.spec) throw new Error('--spec requires a file');
    }
    else if (item === '--bundle') options.bundle = rest[++index];
    else if (item.startsWith('--bundle=')) options.bundle = item.slice('--bundle='.length);
    else if (item === '--qualification') options.qualification = rest[++index];
    else if (item.startsWith('--qualification=')) options.qualification = item.slice('--qualification='.length);
    else if (item === '--count') options.count = Number(rest[++index]);
    else if (item.startsWith('--count=')) options.count = Number(item.slice('--count='.length));
    else if (item === '--span-ms') options.spanMs = Number(rest[++index]);
    else if (item.startsWith('--span-ms=')) options.spanMs = Number(item.slice('--span-ms='.length));
    else if (item === '--source') options.source = rest[++index];
    else if (item.startsWith('--source=')) options.source = item.slice('--source='.length);
    else if (item === '--out') {
      options.out = rest[++index];
      if (!options.out || options.out.startsWith('--')) throw new Error('--out requires a file');
    }
    else if (item.startsWith('--out=')) {
      options.out = item.slice('--out='.length);
      if (!options.out) throw new Error('--out requires a file');
    }
    else if (item === '--ports') options.ports = rest[++index];
    else if (item.startsWith('--ports=')) options.ports = item.slice('--ports='.length);
    else throw new Error(`unknown option: ${item}`);
  }
  return options;
}

async function profile(id) {
  try { return JSON.parse(await readFile(join(PROFILES, `${id}.json`), 'utf8')); }
  catch (error) { throw new Error(`profile ${id} is not available: ${error.message}`); }
}

async function jsonFile(path, label) {
  if (!path) return null;
  try { return JSON.parse(await readFile(resolve(path), 'utf8')); }
  catch (error) { throw new Error(`${label} is not readable: ${error.message}`); }
}

async function campaignBundle(path, spec, profileId) {
  if (!path) return null;
  const { validateBundle } = await import(pathToFileURL(join(ROOT, 'tools/device/bundle.mjs')).href);
  const validated = validateBundle(resolve(path));
  if (!validated.compiled) throw new Error('campaign bundle has no compiled artifact');
  if (validated.profile.id !== profileId) throw new Error(`campaign bundle profile ${validated.profile.id} does not match ${profileId}`);
  const requested = new Set(spec.nights.map(target => target.night));
  const plans = validated.compiled.filter(plan => requested.has(plan.night));
  const campaign = validateCampaignBundle({ spec, plans });
  const selectedPlans = validated.plans.filter(plan => requested.has(plan.night));
  const selectedWinner = validated.winner;
  return { ...campaign, artifact: { winnerHash: validated.manifest.winnerHash,
    engineHash: validated.manifest.engineHash, profileHash: validated.manifest.profile.sha256 },
    // Host-only handoff metadata for the explicit machine experiment. The
    // executor still receives only the validated compiled request plus the
    // exact emitted plan bytes, never loose strategy knobs.
    planTexts: Object.fromEntries(selectedPlans.map(plan => [plan.night, plan.text])),
    planHashes: Object.fromEntries(selectedPlans.map(plan => [plan.night, plan.sha256])),
    machine: { claimLevel: selectedWinner.gate.claimLevel,
      pilotOffsetMs: selectedWinner.knobs?.pilotOffset ?? 10,
      deviceSpacingMs: selectedWinner.planOptions?.deviceSpacingMs ?? null,
      contactMs: selectedWinner.planOptions?.sweepContactMs ?? null,
      tapContactMs: selectedWinner.planOptions?.tapContactMs ?? null },
    bundleDirectory: resolve(path) };
}

async function campaignTiming(path, nights) {
  if (!path) return {};
  const { validateBundle } = await import(pathToFileURL(join(ROOT, 'tools/device/bundle.mjs')).href);
  const validated = validateBundle(resolve(path));
  if (!validated.compiled) throw new Error('campaign bundle has no compiled artifact');
  const requested = new Set(nights);
  return Object.fromEntries(validated.compiled
    .filter(plan => requested.has(plan.night))
    .map(plan => [String(plan.night), plan.timing]));
}

async function main(argv = process.argv.slice(2)) {
  const options = parse(argv);
  if (options.command === 'help') return help();
  if (options.command === 'bench') {
    const { listAdapters } = await import('@fnaf2-1020/adapters/registry');
    console.log(JSON.stringify({ schema: 'capability-catalog-v1', adapters: listAdapters() }, null, 2)); return;
  }
  if (options.command === 'grade') {
    const run = argv[1]; if (!run) throw new Error('grade requires RUN_ID');
    console.log(await readFile(join(ROOT, 'artifacts', run, 'result.json'), 'utf8')); return;
  }
  if (options.command === 'clockmap') {
    if (options.live) throw new Error('clockmap is a read-only measurement; --live does not apply');
    if (!['uptime', 'helper'].includes(options.source))
      throw new Error('--source must be uptime (device boottime via /proc/uptime) or helper (System.nanoTime, the capture domain)');
    if (!Number.isInteger(options.count) || options.count < 4 || options.count > 64) throw new Error('--count must be 4..64');
    if (!Number.isInteger(options.spanMs) || options.spanMs < 10000 || options.spanMs > 600000)
      throw new Error('--span-ms must be 10000..600000');
    const hostBoot = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(hostBoot))
      throw new Error('host boot identity is unavailable; refusing to fabricate a clock session');
    const bridge = new AdbDeviceBridge({ serial: options.serial });
    let helperTransport = null;
    if (options.source === 'helper') {
      const selected = await bridge.selectDevice();
      if (selected.status !== 'READY') throw new Error(`clockmap needs one ready device: ${selected.reason ?? 'unavailable'}`);
      const port = new AdbCueHelperPort({ serial: selected.serial });
      const endpoint = port.discover();
      helperTransport = new CueHelperControlTransport({ request: line => port.request(line), token: endpoint.token });
    }
    const sleep = ms => new Promise(done => setTimeout(done, ms));
    /** @type {{bootId: string, quantizationMs: number, sourceMs: number,
     *   targetBeforeMs: number, targetAfterMs: number}[]} */
    const samples = [];
    for (let index = 0; index < options.count; index += 1) {
      if (index) await sleep(Math.floor(options.spanMs / (options.count - 1)));
      if (options.source === 'helper') {
        const targetBeforeMs = Number(process.hrtime.bigint()) / 1e6;
        const fields = /** @type {any} */ (helperTransport.snapshot());
        const targetAfterMs = Number(process.hrtime.bigint()) / 1e6;
        if (!/^\d+$/.test(fields.snapshotNs ?? '')) throw new Error('helper snapshot has no monotonic timestamp');
        const identity = /** @type {any} */ (await bridge.uptimeSample());
        if (identity.status !== 'READY') throw new Error(`boot identity is unavailable: ${identity.reason ?? 'unavailable'}`);
        samples.push({ bootId: identity.bootId, quantizationMs: 1,
          sourceMs: Number(BigInt(fields.snapshotNs) / 1000000n), targetBeforeMs, targetAfterMs });
        continue;
      }
      const sample = /** @type {any} */ (await bridge.uptimeSample());
      if (sample.status !== 'READY') throw new Error(`clockmap anchor ${index} is ${sample.status}: ${sample.reason ?? 'unavailable'}`);
      samples.push({ bootId: sample.bootId, quantizationMs: sample.quantizationMs,
        sourceMs: sample.sourceMs, targetBeforeMs: sample.targetBeforeMs, targetAfterMs: sample.targetAfterMs });
    }
    if (samples.some(sample => sample.bootId !== samples[0].bootId))
      throw new Error('device rebooted during sampling; the clock session changed');
    const anchors = samples.map(sample => ({ sourceMs: sample.sourceMs,
      targetBeforeMs: sample.targetBeforeMs, targetAfterMs: sample.targetAfterMs }));
    const quantizationMs = Math.max(...samples.map(sample => sample.quantizationMs));
    // The session name carries the measured domain: helper GET stamps
    // System.nanoTime (suspend-excluding), /proc/uptime is boottime
    // (suspend-including). The two drift apart across device suspends, so a
    // capture composition must stamp the matching convention.
    const sourceSession = `${samples[0].bootId}#${options.source === 'helper' ? 'monotonic' : 'boottime'}`;
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const suffix = stableHash({ anchors, sourceSession, hostBoot,
      spanMs: options.spanMs, count: options.count }).slice(6, 12);
    const id = `clockmap-${stamp}-${samples[0].bootId.slice(0, 8)}-${suffix}`;
    const artifact = fitClockMap({ samples: anchors,
      sourceClock: 'device-monotonic-ms', targetClock: 'host-monotonic-ms',
      sourceSession, targetSession: hostBoot,
      id, evidenceId: id, sourceUncertaintyMs: quantizationMs + (options.source === 'helper' ? 0 : 1) });
    const { mapClockInterval } = await import('@fnaf2-1020/adapters');
    const check = anchors[anchors.length - 2];
    const mapped = mapClockInterval({ clock: 'device-monotonic-ms', value: check.sourceMs }, {
      targetClock: 'host-monotonic-ms', targetSession: hostBoot, sourceSession,
      uncertaintyMs: quantizationMs, mapping: artifact });
    // Self-check: the conservative interval must still bracket the observed
    // host bracket of an interior anchor it was fitted from. The final anchor
    // sits on the validity edge by construction and cannot carry uncertainty.
    if (mapped.latestMs < check.targetBeforeMs || mapped.earliestMs > check.targetAfterMs)
      throw new Error('fitted map does not bracket its own anchors; refusing to retain it');
    if (options.out) await writeFile(resolve(options.out), JSON.stringify(artifact, null, 2) + '\n');
    console.log(options.json ? JSON.stringify(artifact, null, 2) :
      `clockmap READY rate=${artifact.rate.toFixed(6)} errorMs=${artifact.errorMs} ` +
      `rateErrorPpm=${artifact.rateErrorPpm} span=${artifact.spanMs}ms anchors=${artifact.sampleCount} ` +
      `source=${artifact.sourceSession.replace(/^[0-9a-f-]+#/, '')} evidence=${artifact.evidenceId}` +
      (options.out ? ` out=${resolve(options.out)}` : ''));
    return;
  }
  const selected = await profile(options.profile);
  if (options.command === 'calibrate') {
    if (options.live) throw new Error('live seam calibration is HOLD: qualified timed-block actuator, positive state calibration and clock mapping are not composed');
    const spec = await jsonFile(options.spec ?? join(ROOT, 'apps/device/fixtures/seam-calibration.json'), 'seam spec');
    const { service } = composeSeamFixture({ profile: selected, artifactRoot: join(ROOT, 'artifacts') });
    service.startSession();
    const result = await service.executeCalibration(spec);
    console.log(options.json ? JSON.stringify(result, null, 2) :
      `result=${result.outcome} claim=${result.claimLevel} calibration=${result.calibration.calibration} evidence=${result.evidenceId}`);
    if (result.outcome !== 'PASS') process.exitCode = 1;
    return;
  }
  if (options.command === 'preflight') {
    const bridge = new AdbDeviceBridge({ serial: options.serial });
    const result = await bridge.preflight({ targetBuild: selected.targetBuild,
      requireHelper: options.requireHelper, requireHid: options.requireHid });
    console.log(options.json ? JSON.stringify(result, null, 2) :
      `${result.status} ${result.serial ?? ''} ${result.reason ?? ''}\n` +
      result.checks.map(item => `  ${item.status.padEnd(7)} ${item.id}: ${typeof item.detail === 'string' ? item.detail : JSON.stringify(item.detail)}`).join('\n'));
    if (result.status === 'FAIL') process.exitCode = 1;
    return;
  }
  if (options.command === 'campaign') {
    if (!options.nights.every(Number.isInteger) || options.nights.length < 1 || options.nights.length > 2 ||
        options.nights.some(night => night !== 6 && night !== 7) || new Set(options.nights).size !== options.nights.length)
      throw new Error('--nights must be a unique subset of 6,7');
    const timingByNight = await campaignTiming(options.bundle, options.nights);
    const fullSpec = makeCampaignSpec({ profile: selected.id, targetBuild: selected.targetBuild, timingByNight });
    const spec = { ...fullSpec, nights: fullSpec.nights.filter(entry => options.nights.includes(entry.night)) };
    const machine = new CampaignStateMachine({ spec });
    const calibration = await jsonFile(options.calibration, 'calibration');
    if (calibration) validateCustomNightCalibration(calibration, { targetBuild: selected.targetBuild });
    if (options.guided) {
      const output = { schema: 'device-campaign-guidance-v1', version: 1, status: 'GUIDED',
        targetBuild: selected.targetBuild, steps: guidedCalibrationSteps({ targetBuild: selected.targetBuild }) };
      console.log(options.json ? JSON.stringify(output, null, 2) : output.steps.map((step, index) => `${index + 1}. ${step}`).join('\n'));
      return;
    }
    if (!options.live) {
      const bundle = await campaignBundle(options.bundle, spec, selected.id);
      const output = { status: 'READY', mode: 'dry-run', spec, state: machine.snapshot(), bundle,
        note: 'configuration and proof gates validated; no phone or input transport opened',
        next: 'run this command with --live --confirm-live after the guided calibration and qualification gates pass' };
      console.log(options.json ? JSON.stringify(output, null, 2) :
        `campaign READY (dry-run): ${spec.nights.map(entry => `Night ${entry.night} ${entry.mode}`).join(' -> ')}\n` +
        'proof gates: positive 6 AM plus save/menu advancement; retries: 3');
      return;
    }
    if (!options.confirmLive) throw new Error('live campaign requires --confirm-live');
    const bridge = new AdbDeviceBridge({ serial: options.serial });
    machine.startPreflight();
    const device = await bridge.preflight({ targetBuild: selected.targetBuild,
      requireHelper: options.requireHelper, requireHid: options.requireHid });
    machine.acceptPreflight(device);
    const bundle = await campaignBundle(options.bundle, spec, selected.id);
    const qualification = await jsonFile(options.qualification, 'qualification');
    let composition = null;
    const useDefaultModernPorts = bundle && selected.actuator === 'hid-multi' && selected.visualSensor === 'mediaprojection';
    if (options.ports || useDefaultModernPorts) {
      const modulePath = options.ports
        ? resolve(options.ports)
        : join(ROOT, 'apps/device/src/modern-campaign-ports.js');
      const module = await import(pathToFileURL(modulePath).href);
      const factory = module.createCampaignPorts ?? module.default;
      if (typeof factory !== 'function') throw new Error('ports module must export createCampaignPorts()');
      composition = await factory({ spec, bundle, profile: selected, calibration, qualification,
        serial: device.serial, machineOnly: options.machineOnly });
    }
    const ports = composition?.ports ?? composition;
    const requiredPorts = ['preflight', 'menu', 'intro', 'executeAttempt', 'terminal',
      'terminalVerification', 'save', 'retryReady', 'releaseAll'];
    if (spec.nights.some(target => target.mode === 'custom')) requiredPorts.push('customNight');
    const capabilities = {
      terminal: typeof ports?.terminal === 'function', save: typeof ports?.save === 'function',
      portsReady: requiredPorts.every(name => typeof ports?.[name] === 'function'),
      deviceLocal: composition?.deviceLocal === true || ports?.deviceLocal === true,
    };
    const campaignPreflight = evaluateCampaignPreflight({ spec, device, profile: selected,
      calibration, bundle, qualification, machineOnly: options.machineOnly, executor: capabilities });
    const output = { status: campaignPreflight.status, mode: 'live', preflight: campaignPreflight,
      state: machine.snapshot(), reason: campaignPreflight.status === 'READY' ? null : 'campaign-gates-incomplete' };
    console.log(JSON.stringify(output, null, 2));
    if (campaignPreflight.status === 'FAIL') process.exitCode = 1;
    if (campaignPreflight.status === 'READY') {
      const result = await new DeviceCampaignRunner({ spec, ports }).run();
      console.log(JSON.stringify({ status: result.state === 'COMPLETE' ? 'COMPLETE' : result.state,
        mode: 'live', result }, null, 2));
    }
    return;
  }
  const live = options.command === 'live' || options.live;
  if (live && (!options.live || !options.confirmLive)) throw new Error('live execution requires both --live and --confirm-live');
  if (live) throw new Error('live transport is not composed by this CLI; inject a DEVICE_MEASURED adapter into DeviceControlService');
  const service = composeDevice({ profile: selected, mode: live ? 'live' : 'dry-run', artifactRoot: join(ROOT, 'artifacts') });
  service.startSession();
  const result = await service.execute();
  console.log(`result=${result.outcome} claim=${result.claimLevel} evidence=${result.evidenceId}`);
}

main().catch(error => { console.error(`device: ${error.message}`); process.exitCode = 2; });
