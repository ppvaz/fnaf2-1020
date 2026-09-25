// A cohort result computed from run packs (tools/evidence-cohort.mjs). Builds a
// four-slot cohort of packs in a throwaway tree -- a clean win, a death, a sixam
// the video never graded, and a slot re-run after an attempt that never reached
// the night -- and checks the predeclared rule is applied, not assumed.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CAMPAIGN_RESULT_SCHEMA } from './evidence-campaign.mjs';
import { buildPack, writePack } from './evidence-pack.mjs';
import { COHORT_RESULT_SCHEMA, computeCohort, labelPrefix } from './evidence-cohort.mjs';

const root = mkdtempSync(join(tmpdir(), 'evidence-cohort-test-'));
const packs = join(root, 'docs/evidence/runs');
const put = (path, content) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), content); };
let serial = 0;
const night = 7;
function run(label, { outcome, reached = true, video = null, winnerHash = 'fnv1a-bound' }) {
  serial += 1;
  const campaign = `campaign-2026-09-18T0${serial}-00-00.000Z`;
  const stamp = `20260918T0${serial}0000Z`;
  const id = `night${night}-${label}-${stamp}`;
  const win = outcome === 'sixam';
  put(`artifacts/${campaign}/result.json`, JSON.stringify({ mode: 'live', status: 'COMPLETE', result: {
    schema: CAMPAIGN_RESULT_SCHEMA, version: 1, state: win ? 'COMPLETE' : 'ABORTED', specHash: 'fnv1a-spec',
    completedNights: win ? [night] : [], events: [],
    attempts: [{ attempt: 1, mode: 'live', night, status: win ? 'WIN' : 'DEATH', proofHash: win ? 'fnv1a-proof' : null,
      terminal: { night, outcome } }] } }));
  put(`artifacts/${campaign}/events.jsonl`, '{"type":"evidence.started"}\n');
  put(`artifacts/${campaign}/request.json`, '{}');
  put(`artifacts/runs/${id}/verdict.txt`, `run          ${id}\nbundle       artifacts/b\ncampaign dir ${root}/artifacts/${campaign}\n`);
  put(`artifacts/runs/${id}/run-report.json`, JSON.stringify({ night: { reached } }));
  if (video) put(`artifacts/runs/${id}/grade.log`, `--- run timeline ---\n  TERMINAL: ${video}\n`);
  put('artifacts/b/manifest.json', JSON.stringify({ winnerHash }));
  const built = buildPack({ root, campaignDir: join(root, 'artifacts', campaign),
    runDir: join(root, 'artifacts/runs', id), packId: id });
  writePack(join(packs, id), built);
  return id;
}
try {
  const predeclaration = { schema: 'cohort-predeclaration-v1', night, size: 4,
    binding: { winnerHash: 'fnv1a-bound' }, labels: 'night7-k9-cohort-r01 .. night7-k9-cohort-r04' };
  assert.equal(labelPrefix(predeclaration), 'night7-k9-cohort');
  run('night7-k9-cohort-r01', { outcome: 'sixam', video: 'clear -- sixam at 453.5 s' });
  run('night7-k9-cohort-r02', { outcome: 'death', video: 'death -- visual-foxy-jumpscare at 20.0 s' });
  run('night7-k9-cohort-r03', { outcome: 'sixam' });
  run('night7-k9-cohort-r04', { outcome: 'death', reached: false });
  run('night7-k9-cohort-r04b', { outcome: 'sixam', video: 'clear -- sixam at 455.0 s' });
  run('night7-other-r01', { outcome: 'sixam', video: 'clear' });

  const result = computeCohort(predeclaration, packs, { source: 'fixture' });
  assert.equal(result.schema, COHORT_RESULT_SCHEMA);
  assert.deepEqual(result.slots.map(slot => slot.status), ['WIN', 'DEATH', 'UNGRADED', 'WIN']);
  assert.equal(result.winRate, '2/4');
  assert.equal(result.ungraded, 1, 'a sixam the video never graded is not a win');
  assert.equal(result.status, 'INCOMPLETE');
  const r04 = result.slots[3].runs;
  assert.deepEqual(r04.map(entry => entry.role), ['excluded', 'counted'], 'a run that never reached the night is excluded, its re-run counts');
  assert.ok(result.slots.every(slot => slot.runs.every(entry => /^[0-9a-f]{64}$/.test(entry.packSha256))),
    'every slot cites the pack it was read from');
  assert.equal(result.slots.flatMap(slot => slot.runs).length, 5, 'another cohort\'s packs are not read');
  assert.deepEqual(result.wrongBinding, []);

  run('night7-k9-cohort-r03b', { outcome: 'sixam', video: 'clear -- sixam at 454.0 s', winnerHash: 'fnv1a-other' });
  const rerun = computeCohort(predeclaration, packs);
  assert.equal(rerun.slots[2].status, 'WIN');
  assert.deepEqual(rerun.slots[2].runs.map(entry => entry.role), ['superseded', 'counted']);
  assert.equal(rerun.wrongBinding.length, 1, 'a run on another binding is named, not silently counted');
  assert.throws(() => computeCohort({ ...predeclaration, schema: 'x' }, packs), /cohort-predeclaration-v1/);
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log('evidence cohort: the predeclared rule is applied per slot from packs, ungraded sixams are not wins, re-runs and exclusions are named');
