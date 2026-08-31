import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCandidates, runModelExperiment } from '../src/experiment.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const cases = ['model-smoke', 'controller-synthesis', 'cycle-optimization',
  'robustness-sweep', 'model-probe', 'device-characterization'];
for (const id of cases) {
  const spec = JSON.parse(await readFile(join(ROOT, 'specs', `${id}.json`), 'utf8'));
  const candidates = generateCandidates(spec);
  const result = runModelExperiment(spec);
  assert.equal(candidates.length, spec.seeds.length, `${id}: candidate count`);
  assert.equal(result.evaluations.length, spec.seeds.length, `${id}: evaluation count`);
  assert.equal(result.operation, spec.operation, `${id}: operation`);
  assert.equal(result.claimLevel, 'MODEL_ONLY', `${id}: claim ceiling`);
  assert.ok(result.evaluations.every(item => item.traceHash.startsWith('fnv1a-')), `${id}: trace hashes`);
}
console.log(`research reference cases: ${cases.length} shared experiment paths pass`);
