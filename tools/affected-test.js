#!/usr/bin/env node
/** Select the smallest deterministic validation set for the current diff. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const explicit = process.argv.slice(2).filter(path => path !== '--files');
const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const changed = explicit.length ? explicit : [...new Set([
  ...git(['diff', '--name-only']).split('\n'),
  ...git(['diff', '--cached', '--name-only']).split('\n'),
  ...git(['ls-files', '--others', '--exclude-standard']).split('\n'),
].filter(Boolean))];

const checks = new Map();
const add = (id, command, args = []) => checks.set(id, { command, args });
add('architecture', 'node', ['tools/architecture-test.js']);
add('references', 'node', ['tools/validate-references.js']);

if (changed.some(path => path.startsWith('packages/core/'))) {
  add('core-contracts', 'node', ['packages/core/test/contracts.test.js']);
  add('core-mechanics', 'node', ['tools/sourcetest.mjs']);
  // The closed loop is the device work's spine (ROADMAP Track A); its gates
  // belong in the same lane as the code they gate, not the legacy campaign.
  // Keyed by path so an edit to the gate itself (below) dedupes against this.
  for (const gate of ['cycle-library', 'cycle-planner', 'cycle-controller'])
    add(`test:packages/core/test/${gate}.test.js`, 'node', [`packages/core/test/${gate}.test.js`]);
  // Offline replay determinism: the same recorded facts must rebuild the same
  // decisions, which is what makes a retained stream evidence rather than a log.
  add('fact-replay', 'node', ['tools/factreplay.mjs', '--assert']);
}
if (changed.some(path => path.startsWith('tools/invent/'))) {
  // Plan 05 package 6b's expressiveness gate: the language must contain the
  // known reactive policy before any search is allowed to run.
  add('policy-language', 'node', ['tools/invent/test-policy-lang.mjs']);
  add('observation-surface', 'node', ['tools/invent/test-observe.mjs']);
  add('difficulty-probe', 'node', ['tools/invent/targets.mjs', '--assert']);
}
if (changed.some(path => path.startsWith('packages/adapters/') || path.startsWith('apps/device/'))) {
  add('adapter-contracts', 'node', ['packages/adapters/test/conformance.test.js']);
  add('device-service', 'node', ['apps/device/test/service.test.js']);
  add('device-dry-run', 'node', ['apps/device/src/cli.js', 'dry-run']);
}
if (changed.some(path => path.startsWith('packages/core/src/control/') ||
    path.startsWith('tools/device/policy-') || path.startsWith('tools/device/closed-families'))) {
  add('policy-grammar', 'node', ['tools/policygrammartest.mjs']);
  add('policy-search', 'node', ['tools/policysearchtest.mjs']);
  add('policy-equivalence', 'node', ['tools/policyequivalencetest.mjs']);
  add('observation-language', 'node', ['tools/observationlanguagetest.mjs']);
}
if (changed.some(path => path.startsWith('packages/research/')))
  add('research-contracts', 'node', ['packages/research/test/experiment.test.js']);
if (changed.some(path => path.startsWith('apps/trainer/')))
  add('trainer-build', 'python3', ['tools/build.py']);
for (const path of changed.filter(p => /^packages\/[^/]+\/test\/.*\.test\.js$/.test(p)))
  add(`test:${path}`, 'node', [path]);
if (changed.some(path => path.startsWith('docs/') || path.startsWith('plans/')))
  add('documentation', 'node', ['tools/test-docs.mjs']);
if (changed.some(path => path.startsWith('tools/model/') || path.startsWith('tools/minus7/')))
  add('model-syntax', 'node', ['--check', ...changed.filter(path => /\.(?:js|mjs)$/.test(path) && (path.startsWith('tools/model/') || path.startsWith('tools/minus7/')))]);

assert.ok(checks.size > 0);
console.log(`affected: ${changed.length} changed paths -> ${[...checks.keys()].join(', ')}`);
for (const [id, { command, args }] of checks) {
  if (!args.length) continue;
  console.log(`affected: ${id}`);
  execFileSync(command, args, { cwd: ROOT, stdio: 'inherit' });
}
