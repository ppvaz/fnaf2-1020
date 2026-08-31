#!/usr/bin/env node
// Host-side artifact consumer.  It validates the exact emitted plan and runs
// only the model replay recorded in the bundle.  It never opens adb/HID.
import { validateBundle } from './bundle.mjs';

function value(name) {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? undefined : process.argv[at + 1];
}

const directory = value('artifact') ?? value('bundle');
const dryRun = process.argv.includes('--dry-run');
if (!directory || !dryRun) {
  console.error('usage: artifact-runner.mjs --artifact artifacts/run-001 --dry-run [--night N]');
  process.exit(2);
}
const nightValue = value('night');
try {
  const result = validateBundle(directory, { night: nightValue === undefined ? undefined : Number(nightValue) });
  console.log(`artifact READY (dry-run): strategy=${result.manifest.strategy} ` +
    `nights=${result.manifest.nights.join(',')} plans=${result.plans.map(plan => plan.file).join(',')}`);
  console.log(`replay PASS: ${result.replay.hash} (${result.replay.results.length} bounded candidate replays)`);
} catch (error) {
  console.error(`artifact rejected: ${error.message}`);
  process.exit(1);
}
