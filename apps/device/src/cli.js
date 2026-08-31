#!/usr/bin/env node
/** CLI composition root; `dry-run` is the only non-interactive default. */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeDevice } from './composition.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PROFILES = join(ROOT, 'apps/device/profiles');

function help() {
  console.log(`fnaf2-device — bounded semantic device composition\n\nUsage:\n  npm run device:dry-run -- --profile fixture-hid-screencap\n  npm run device:run -- --profile PROFILE --live --confirm-live\n\nCommands:\n  dry-run       run fixture adapters and retain a replayable bundle (default)\n  live          require --live --confirm-live and a non-fixture profile\n  bench         print registered capability descriptors\n  grade RUN_ID  show a retained result\n\nOptions:\n  --profile ID  resolved profile under apps/device/profiles\n  --live        explicitly enable physical actuation\n  --confirm-live  acknowledge the bounded live-device safety gate`);
}

function parse(argv) {
  const [command = 'help', ...rest] = argv;
  const options = { command, profile: 'fixture-hid-screencap', live: false, confirmLive: false };
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (item === '--help' || item === '-h') options.command = 'help';
    else if (item === '--live') options.live = true;
    else if (item === '--confirm-live') options.confirmLive = true;
    else if (item === '--profile') options.profile = rest[++index];
    else if (item.startsWith('--profile=')) options.profile = item.slice('--profile='.length);
    else throw new Error(`unknown option: ${item}`);
  }
  return options;
}

async function profile(id) {
  try { return JSON.parse(await readFile(join(PROFILES, `${id}.json`), 'utf8')); }
  catch (error) { throw new Error(`profile ${id} is not available: ${error.message}`); }
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
  const live = options.command === 'live' || options.live;
  if (live && (!options.live || !options.confirmLive)) throw new Error('live execution requires both --live and --confirm-live');
  if (live) throw new Error('live transport is not composed by this CLI; inject a DEVICE_MEASURED adapter into DeviceControlService');
  const service = composeDevice({ profile: selected, mode: live ? 'live' : 'dry-run', artifactRoot: join(ROOT, 'artifacts') });
  service.startSession();
  const result = await service.execute();
  console.log(`result=${result.outcome} claim=${result.claimLevel} evidence=${result.evidenceId}`);
}

main().catch(error => { console.error(`device: ${error.message}`); process.exitCode = 2; });
