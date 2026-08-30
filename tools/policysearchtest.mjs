// Plan 21 package 4: reproducible constrained positive/negative campaign.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { minimalPolicy } from './device/policy-ir.mjs';
import { classifyPolicy } from './device/policy-grammar.mjs';
import { runSearch } from './device/policy-search.mjs';

const check = (condition, message) => { if (!condition) throw new Error(message); };
const base = minimalPolicy();
const temp = mkdtempSync(join(tmpdir(), 'fnaf2-policy-search-'));
const output = join(temp, 'report.json');
const report = runSearch(base, {
  night: 1, seeds: 8, periods: [10000], dropRepeatActions: ['wind'],
  minContactMs: 33, output,
});

const accepted = report.candidates.filter(candidate => candidate.status === 'accepted');
const dropped = report.candidates.find(candidate => candidate.id.endsWith('-drop-wind'));
check(accepted.some(candidate => candidate.id === base.metadata.id),
  'constrained search lost the exact-engine positive control');
check(dropped?.status === 'rejected' && dropped.reasons.some(reason => reason.startsWith('exact-survival:')),
  'constrained search did not retain the known negative control');
check(report.frontier.includes(base.metadata.id), 'positive control was pruned from the frontier');
check(classifyPolicy(base).known, 'base candidate was not classified as a known family');
check(dropped.dependencies.sourceDependencies.length > 0 &&
      dropped.dependencies.calibrationProfile === 'moto-g56-v207-landscape',
  'rejected candidate lost its dependency provenance');
check(JSON.parse(readFileSync(output, 'utf8')).candidates.length === report.candidates.length,
  'persisted search report omitted candidates');
rmSync(temp, { recursive: true, force: true });
console.log(`policy search: ${accepted.length} accepted control(s), ${report.candidates.length - accepted.length} rejected, frontier persisted`);
