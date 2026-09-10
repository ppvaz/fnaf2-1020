#!/usr/bin/env node
// Phone-free contract tests for the curated Chronicle and its generated view.
// This checks the presentation's claims are reachable; it does not promote
// any finding or manufacture device evidence.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkCorpus } from './chronicle-schema.mjs';
import { generate, loadCorpus, OUTPUT, ROOT } from './chronicle.mjs';

function sourcePath(source) {
  if (source.startsWith('commit:')) return null;
  const match = source.match(/^(.*?)(?::(\d+))?$/);
  assert(match, `source has no path shape: ${source}`);
  const file = resolve(ROOT, match[1]);
  assert(existsSync(file), `source file does not exist: ${source}`);
  if (match[2]) {
    const line = Number(match[2]);
    const lines = readFileSync(file, 'utf8').split('\n').length;
    assert(line <= lines, `source line is past EOF: ${source}`);
  }
  return file;
}

function checkSource(source) {
  if (source.startsWith('commit:')) {
    execFileSync('git', ['cat-file', '-e', `${source.slice(7)}^{commit}`], { cwd: ROOT, stdio: 'ignore' });
    return;
  }
  sourcePath(source);
}

function checkOutlook(outlook) {
  for (const section of ['next', 'missing']) {
    for (const item of outlook?.[section] ?? []) {
      assert(item.title && item.body, `outlook ${section} item is incomplete`);
      item.sources.forEach(checkSource);
    }
  }
}

const corpus = await loadCorpus();
assert(corpus.entries.length > 0, 'chronicle corpus is empty');
assert(corpus.checkpoints.length > 0, 'chronicle has no checkpoints');
corpus.entries.forEach((entry) => entry.sources.forEach(checkSource));
checkOutlook(corpus.outlook);

const invalid = structuredClone(corpus.checkpoints[0]);
invalid.file = 'fixture.json';
invalid.entries = [structuredClone(invalid.entries[0])];
invalid.entries[0].kind = 'commit-explorer';
assert(checkCorpus([invalid]).some((problem) => problem.includes('kind must be one of')),
  'schema accepted an unknown finding kind');

const first = await generate({ write: true });
const second = await generate({ write: false });
assert.equal(first.output, second.output, 'chronicle generation is not deterministic');
assert.equal(readFileSync(OUTPUT, 'utf8'), first.output, 'generated page differs from generator output');
assert(first.output.includes("WHAT'S NEXT"), 'generated page has no future section');
assert(first.output.includes("WHAT'S LEFT / MISSING"), 'generated page has no missing-work section');
for (const item of [...(corpus.outlook?.next ?? []), ...(corpus.outlook?.missing ?? [])])
  assert(first.output.includes(item.title), `generated page dropped outlook item: ${item.title}`);

const since = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
checkSource(`commit:${since}`);
const harvested = JSON.parse(execFileSync(process.execPath, ['tools/chronicle-harvest.mjs', '--since', since, '--until', 'HEAD', '--json'], { cwd: ROOT, encoding: 'utf8' }));
assert(Array.isArray(harvested), 'harvester did not emit a JSON array');
for (const candidate of harvested) {
  assert(candidate.id && candidate.date && candidate.sources?.length, 'harvester emitted an incomplete candidate');
  candidate.sources.forEach(checkSource);
}

console.log(`chronicle: ${corpus.entries.length} curated findings, ${harvested.length} harvest candidates, outlook wired`);
