#!/usr/bin/env node
/** CLI composition root; `dry-run` is the only non-interactive default. */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { composeDevice } from './composition.js';
import { AdbDeviceBridge } from './adb-bridge.js';
import { CampaignStateMachine, makeCampaignSpec } from './campaign.js';
import { DeviceCampaignRunner } from './campaign-runner.js';
import { guidedCalibrationSteps, validateCustomNightCalibration } from './custom-night.js';
import { evaluateCampaignPreflight } from './campaign-preflight.js';
import { validateCampaignBundle } from './campaign-bundle.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PROFILES = join(ROOT, 'apps/device/profiles');

function help() {
  console.log(`fnaf2-device — bounded semantic device composition

Usage:
  npm run device:dry-run -- --profile fixture-hid-screencap
  npm run device:run -- --profile PROFILE --live --confirm-live
  npm run device:preflight -- --profile hid-mediaprojection
  npm run device:campaign -- --guided

Commands:
  dry-run       run fixture adapters and retain a replayable bundle (default)
  live          require --live --confirm-live and a non-fixture profile
  preflight     inspect one ADB phone without sending game input
  campaign      validate the Night 6 -> Night 7 campaign and its proof gates
  bench         print registered capability descriptors
  grade RUN_ID  show a retained result

Options:
  --profile ID  resolved profile under apps/device/profiles
  --serial ID   select one explicit ADB device
  --nights 6,7  campaign target nights (default: 6,7)
  --json        print machine-readable output for preflight/campaign
  --guided      print the one-time Custom Night calibration checklist
  --calibration FILE  measured Custom Night calibration artifact
  --bundle DIR  validated device bundle containing the requested plans
  --qualification FILE  DEVICE_MEASURED qualification artifact
  --ports MODULE  explicit campaign-port composition module
  --machine-only  run an explicit MODEL_ONLY machine-input experiment; no claim promotion
  --no-helper   preflight without requiring Cue Helper
  --no-hid      preflight without requiring /system/bin/hid
  --live        explicitly enable physical actuation
  --confirm-live  acknowledge the bounded live-device safety gate`);
}

function parse(argv) {
  const [command = 'help', ...rest] = argv;
  const options = { command, profile: 'fixture-hid-screencap', live: false, confirmLive: false,
    json: false, serial: undefined, nights: [6, 7], requireHelper: true, requireHid: true,
    guided: false, machineOnly: false, calibration: undefined, bundle: undefined,
    qualification: undefined, ports: undefined };
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
    else if (item === '--bundle') options.bundle = rest[++index];
    else if (item.startsWith('--bundle=')) options.bundle = item.slice('--bundle='.length);
    else if (item === '--qualification') options.qualification = rest[++index];
    else if (item.startsWith('--qualification=')) options.qualification = item.slice('--qualification='.length);
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
  const selected = await profile(options.profile);
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
