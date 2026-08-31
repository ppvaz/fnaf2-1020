#!/usr/bin/env node
/** Experiment composition root; evaluators remain pure core consumers. */
import { stableHash } from '@fnaf2-1020/core';
import { runModelExperiment } from './experiment.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '../../..'));

const CASES = Object.freeze([
  'model-smoke', 'controller-synthesis', 'cycle-optimization',
  'robustness-sweep', 'model-probe', 'device-characterization',
]);

const help = () => console.log(`fnaf2-research — explicit experiment operations\n\nUsage:\n  npm run research -- --help\n  npm run research -- <case>\n\nCases:\n  ${CASES.join(', ')}\n\nEvery case retains its spec, structured result, and session manifest. Results\nare claim-capped until the Plan 12 promotion ladder supplies external evidence.`);

async function runCase(id) {
  if (!CASES.includes(id)) throw new Error(`unknown experiment case: ${id}`);
  const spec = JSON.parse(await readFile(join(ROOT, 'packages/research/specs', `${id}.json`), 'utf8'));
  const evaluation = runModelExperiment(spec);
  const result = {
    ...evaluation,
    evidenceId: `research-${id}-${stableHash(evaluation).slice(-10)}`,
    terminal: evaluation.evaluations[0]?.terminal,
    eventCount: evaluation.evaluations.reduce((sum, item) => sum + item.eventCount, 0),
  };
  const manifest = {
    schema: 'session-manifest-v1', version: 1, id: result.evidenceId,
    targetBuild: 'com.scottgames.fnaf2:2.0.7+26', profile: spec.profile ?? 'simulator-fixture',
    profileHash: 'profile-simulator-fixture-v1', modelHash: result.modelHash,
    policyHash: stableHash({ operation: spec.operation, policyFamily: spec.policyFamily }),
    events: [{ schema: 'telemetry-event-v1', sessionId: result.evidenceId, type: 'experiment.result', component: 'research', at: { clock: 'simulator-frame', value: result.terminal?.frame ?? 0 }, data: result }],
    artifacts: { result: 'result.json', spec: 'experiment-spec.json' }, outcome: 'COMPLETED', redaction: { media: 'none', secrets: 'excluded' },
  };
  const output = join(ROOT, 'artifacts', result.evidenceId);
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  await writeFile(join(output, 'experiment-spec.json'), JSON.stringify(spec, null, 2) + '\n');
  await writeFile(join(output, 'session-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  console.log(`result=${result.verdict} claim=${result.claimLevel} evidence=${result.evidenceId}`);
}

const operation = process.argv[2];
if (!operation || operation === '--help' || operation === '-h') help();
else await runCase(operation).catch(error => { console.error(`research: ${error.message}`); process.exitCode = 2; });
