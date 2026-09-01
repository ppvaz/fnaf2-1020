#!/usr/bin/env node
// Host-side artifact consumer. It validates the exact emitted plan and builds
// state-conditioned semantic blocks. Dry-run never opens ADB/HID; live remains
// locked until a qualified transport composition is injected.
import { readFileSync } from 'node:fs';
import { validateQualification } from '@fnaf2-1020/runtime';
import { parsePlan, validateBundle } from './bundle.mjs';
import { compileArtifactPlans } from './artifact-commands.mjs';

function value(name) {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? undefined : process.argv[at + 1];
}

const directory = value('artifact') ?? value('bundle');
const dryRun = process.argv.includes('--dry-run');
const live = process.argv.includes('--live');
const confirmLive = process.argv.includes('--confirm-live');
const qualificationPath = value('qualification');
if (!directory || dryRun === live) {
  console.error('usage: artifact-runner.mjs --artifact artifacts/run-001 (--dry-run | --live --confirm-live --qualification FILE) [--night N]');
  process.exit(2);
}
const nightValue = value('night');
try {
  const result = validateBundle(directory, { night: nightValue === undefined ? undefined : Number(nightValue) });
  const compiled = compileArtifactPlans(result.plans, parsePlan, result.profile);
  const blocks = compiled.reduce((sum, plan) => sum + Object.values(plan.cycles)
    .reduce((cycleSum, cycle) => cycleSum + cycle.blocks.length, 0), 0);
  if (dryRun) {
    console.log(`artifact READY (dry-run): strategy=${result.manifest.strategy} ` +
      `nights=${result.manifest.nights.join(',')} plans=${result.plans.map(plan => plan.file).join(',')}`);
    console.log(`state-conditioned blocks READY: ${blocks} bounded blocks; monitor targets and preconditions explicit`);
    console.log(`replay PASS: ${result.replay.hash} (${result.replay.results.length} bounded candidate replays)`);
  } else {
    if (!confirmLive) throw new Error('live artifact execution requires --confirm-live');
    if (!qualificationPath) throw new Error('live artifact execution requires --qualification FILE');
    const qualification = validateQualification(JSON.parse(readFileSync(qualificationPath, 'utf8')));
    if (qualification.verdict !== 'PASS' || qualification.claimLevel !== 'DEVICE_MEASURED')
      throw new Error('live artifact qualification must be DEVICE_MEASURED PASS');
    if (qualification.policyHash !== result.manifest.winnerHash ||
        qualification.modelHash !== result.manifest.engineHash)
      throw new Error('live artifact qualification is not bound to this winner/model');
    throw new Error('live artifact transport is not composed: qualify and inject the state-feedback HID/MediaProjection adapter');
  }
} catch (error) {
  console.error(`artifact rejected: ${error.message}`);
  process.exit(1);
}
