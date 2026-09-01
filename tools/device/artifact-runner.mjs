#!/usr/bin/env node
// Host-side artifact consumer. It validates the exact emitted plan and builds
// state-conditioned semantic blocks. Dry-run never opens ADB/HID; live accepts
// only a qualified, explicitly injected Plan 22 executor module.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateQualification } from '@fnaf2-1020/runtime';
import { validateBundle } from './bundle.mjs';
import { DeviceArtifactExecutor, makeExecutorRequest } from '../../apps/device/src/artifact-executor.js';

function value(name) {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? undefined : process.argv[at + 1];
}

const directory = value('artifact') ?? value('bundle');
const dryRun = process.argv.includes('--dry-run');
const live = process.argv.includes('--live');
const confirmLive = process.argv.includes('--confirm-live');
const qualificationPath = value('qualification');
const executorPath = value('executor');
if (!directory || dryRun === live) {
  console.error('usage: artifact-runner.mjs --artifact artifacts/run-001 (--dry-run | --live --confirm-live --qualification FILE --executor MODULE) [--night N]');
  process.exit(2);
}
const nightValue = value('night');
try {
  const result = validateBundle(directory, { night: nightValue === undefined ? undefined : Number(nightValue) });
  let compiled = result.compiled;
  if (!compiled && dryRun) {
    // Existing pre-Plan-22 bundles can still be inspected offline.  New
    // bundles persist this output so the live lane never invokes a strategy
    // parser at execution time.
    const [{ parsePlan }, { compileArtifactPlans }] = await Promise.all([
      import('./bundle.mjs'), import('./artifact-commands.mjs'),
    ]);
    compiled = compileArtifactPlans(result.plans, parsePlan, result.profile);
  }
  if (!compiled) throw new Error('live artifact is missing compiled semantic blocks; re-emit the bundle');
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
    if (!executorPath)
      throw new Error('live artifact execution requires --executor MODULE (explicit Plan 22 device composition)');
    const executorModule = await import(pathToFileURL(resolve(executorPath)).href);
    const factory = executorModule.createExecutor ?? executorModule.default;
    if (typeof factory !== 'function') throw new Error('executor module must export createExecutor()');
    // No winner strategy or plan text crosses into the device composition.
    const port = await factory({ profile: result.profile, qualification });
    const executor = port instanceof DeviceArtifactExecutor ? port : new DeviceArtifactExecutor(port);
    const request = makeExecutorRequest({ manifest: result.manifest, profile: result.profile,
      compiledPlans: compiled, mode: 'live' });
    let execution;
    try {
      execution = await executor.execute(request);
    } catch (error) {
      // Cleanup is best-effort but both calls are attempted; a failing abort
      // must not suppress the release-all safety action or the original error.
      try { await executor.abort(`artifact-execution: ${error.message}`); } catch {}
      try { await executor.releaseAll(); } catch {}
      throw error;
    }
    const outcome = execution?.outcome ?? execution?.status ?? 'PASS';
    console.log(`artifact execution ${outcome}: winner=${request.artifact.winnerHash} ` +
      `nights=${request.artifact.plans.map(plan => plan.night).join(',')} blocks=${request.blocks.length}`);
  }
} catch (error) {
  console.error(`artifact rejected: ${error.message}`);
  process.exit(1);
}
