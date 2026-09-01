/**
 * Architectural guardrails for the refactor. This is intentionally small and
 * deterministic: it protects package ownership while explicitly named legacy
 * device boundaries remain.
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const rootPackage = JSON.parse(await readFile(join(ROOT, 'package.json')));
const compatibility = await readFile(join(ROOT, 'docs/architecture/COMPATIBILITY.md'), 'utf8');
assert.deepEqual(rootPackage.workspaces, ['packages/*', 'apps/*']);
assert.equal(rootPackage.private, true);
assert.ok(rootPackage.scripts['device:dry-run']);

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await files(path));
    else if (/\.(?:js|mjs|ts)$/.test(entry.name)) output.push(path);
  }
  return output;
}

const core = await files(join(ROOT, 'packages/core/src'));
const legacyCatalog = JSON.parse(await readFile(join(ROOT, 'docs/architecture/generated/legacy-paths.json'), 'utf8'));
assert.equal(legacyCatalog.schema, 'legacy-path-map-v1');
assert.ok(Array.isArray(legacyCatalog.entries) && legacyCatalog.entries.length > 0,
  'legacy path catalog must contain migration entries');
for (const entry of legacyCatalog.entries) {
  assert.match(entry.id, /^[a-z0-9][a-z0-9.-]+$/,
    'legacy path entries need stable ids');
  assert.ok(['compatibility', 'transitional', 'legacy'].includes(entry.lifecycle),
    `${entry.id} has an invalid lifecycle`);
  assert.equal(typeof entry.replacement, 'string');
  assert.ok(entry.replacement.length > 0, `${entry.id} has no replacement owner`);
  assert.equal(typeof entry.removalGate, 'string');
  assert.ok(entry.removalGate.length > 0, `${entry.id} has no removal gate`);
  const target = entry.path.split('#', 1)[0];
  assert.ok(target && !target.startsWith('/') && !target.includes('..'),
    `${entry.id} has an unsafe path`);
  try {
    await readFile(join(ROOT, target));
  } catch (error) {
    assert.fail(`${entry.id} points at missing path ${entry.path}: ${error.message}`);
  }
}
for (const shim of ['tools/device/trial.sh', 'tools/device/legacy-trial.sh']) {
  assert.match(compatibility, new RegExp(shim.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')), `${shim} is missing from the compatibility inventory`);
}
try {
  const rootSrc = await readdir(join(ROOT, 'src'));
  assert.equal(rootSrc.length, 0, 'root src must remain empty after P9 shim removal');
} catch (error) {
  assert.equal(error.code, 'ENOENT');
}
for (const path of core) {
  const source = await readFile(path, 'utf8');
  assert.doesNotMatch(source, /^\s*(?:import|export).*?(?:from\s+|import\()[^\n]*(?:@fnaf2-1020\/(?:adapters|device|trainer)|node:|\b(?:document|window|process|fetch)\b)/m, `${path} crosses the core boundary`);
}
const production = await files(join(ROOT, 'packages'));
for (const path of production) {
  const source = await readFile(path, 'utf8');
  assert.doesNotMatch(source, /from ['"][^'"]*(?:test|report)[^'"]*['"]/, `${path} imports a test/report module`);
}
const operational = [
  ...production,
  ...await files(join(ROOT, 'apps')),
  ...await files(join(ROOT, 'tools')),
].filter(path => !/(?:^|\/)test[^/]*\.(?:js|mjs|ts)$/.test(path) &&
                !/(?:^|\/)report[^/]*\.(?:js|mjs|ts)$/.test(path));
for (const path of operational) {
  const source = await readFile(path, 'utf8');
  // `apps/trainer/src/report.js` is presentation code, not a report harness;
  // only test-named modules are forbidden across operational boundaries.
  assert.doesNotMatch(source, /(?:from\s+|import\s*\()['"][^'"]*(?:^|\/|[-_.])test[^'"]*['"]/i, `${path} imports a test module`);
  assert.doesNotMatch(source, /\bSEARCH_KNOBS(?:\s*\.\s*[A-Za-z_$][\w$]*|\s*\[[^\]]+\])\s*=/, `${path} mutates a process-global search knob`);
}
console.log(`architecture: ${core.length} core modules and ${production.length} package modules obey boundary checks`);
