/**
 * Architectural guardrails for the refactor. This is intentionally small and
 * deterministic: it protects package ownership while explicitly named legacy
 * device boundaries remain.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

// Keep the guard deterministic without depending on a parser/toolchain in the
// fast lane.  Strings/comments are removed before checking runtime globals so
// prose such as `const window = ...` does not create a false boundary failure.
function codeOnly(source) {
  return source
    .replace(/`(?:\\.|[^`\\])*`/gs, template =>
      [...template.matchAll(/\$\{([\s\S]*?)\}/g)].map(match => match[1]).join('\n'))
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/gs, '')
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
}

function importSpecifiers(source) {
  return [...source.matchAll(/\b(?:from|import)\s*(?:\(\s*)?['"]([^'"]+)['"]/g)]
    .map(match => match[1]);
}

const forbiddenCoreGlobal = /\b(?:document|window|fetch|process|globalThis|performance)\b/;
const forbiddenCoreNames = ['document', 'window', 'fetch', 'process', 'globalThis', 'performance'];
const unboundCoreCode = source => {
  const code = codeOnly(source);
  const bindings = [...code.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)]
    .map(match => match[1]).filter(name => forbiddenCoreNames.includes(name));
  return bindings.length
    ? code.replace(new RegExp(`\\b(?:${[...new Set(bindings)].join('|')})\\b`, 'g'), '')
    : code;
};
assert.match(unboundCoreCode('const host = window;'), forbiddenCoreGlobal,
  'architecture guard must recognize host-global access in module bodies');
assert.doesNotMatch(unboundCoreCode('const window = 1; return window;'), forbiddenCoreGlobal,
  'architecture guard must not mistake a local binding for a host global');
assert.match(unboundCoreCode('const host = `${window}`;'), forbiddenCoreGlobal,
  'architecture guard must inspect template interpolations');

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
// The checked-in inventories describe the REPOSITORY, and a directory walk
// cannot tell that from the working directory it happens to run in. On
// 2026-09-02 an agent worktree under `.claude/` was walked into three of them
// and doubled every count (Shell 63 -> 126 files), so the catalogs asserted
// code that is not in this repository. git already draws the line -- it
// reports a nested checkout as one opaque directory entry -- so its
// enumeration is the authority here.
const enumerated = new Set(execFileSync('git',
  ['ls-files', '--cached', '--others', '--exclude-standard'],
  { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean));
const catalogPaths = {
  'import-graph.json': catalog => catalog.files.map(entry => entry.file),
  'test-manifest.json': catalog => catalog.tests.map(entry => entry.id),
  'reverse-links.json': catalog => catalog.links.map(link => link.path),
};
for (const [name, select] of Object.entries(catalogPaths)) {
  const catalog = JSON.parse(await readFile(join(ROOT, 'docs/architecture/generated', name), 'utf8'));
  const foreign = [...new Set(select(catalog)
    .map(path => path.split('#', 1)[0])
    .filter(path => !enumerated.has(path)))].sort();
  assert.deepEqual(foreign, [],
    `${name} names ${foreign.length} path(s) outside this repository, starting ` +
    `with ${foreign[0]}; regenerate with npm run catalog`);
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
  const imports = importSpecifiers(source);
  assert.ok(!imports.some(spec => spec.startsWith('node:') ||
    /^@fnaf2-1020\/(?:adapters|device|trainer)/.test(spec)),
  `${path} crosses the core package boundary`);
  assert.doesNotMatch(unboundCoreCode(source), forbiddenCoreGlobal,
    `${path} uses a host/browser global in core`);
}
const research = await files(join(ROOT, 'packages/research/src'));
for (const path of research) {
  const source = await readFile(path, 'utf8');
  const imports = importSpecifiers(source);
  assert.ok(!imports.some(spec => spec.includes('tools/device') || spec.includes('apps/device') ||
    spec === '@fnaf2-1020/device' ||
    spec === 'node:child_process' || spec === 'node:net' || spec === 'node:dgram'),
  `${path} imports a device-shell boundary directly`);
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
const physicalActuatorOwner = join(ROOT, 'apps/device/src/composition.js');
for (const path of [...await files(join(ROOT, 'apps')), ...await files(join(ROOT, 'tools'))]
  .filter(path => !/(?:^|\/)test[^/]*\.(?:js|mjs|ts)$/.test(path) &&
                  !/(?:^|\/)report[^/]*\.(?:js|mjs|ts)$/.test(path) &&
                  path !== fileURLToPath(import.meta.url))) {
  const source = await readFile(path, 'utf8');
  if (path !== physicalActuatorOwner &&
      /\b(?:AdbTapActuator|HidActuator)\b/.test(codeOnly(source)))
    assert.fail(`${path} reaches a physical actuator outside the device composition root`);
}
const cli = await readFile(join(ROOT, 'apps/device/src/cli.js'), 'utf8');
assert.match(cli, /live execution requires both --live and --confirm-live/,
  'device live execution lost its explicit confirmation gate');
assert.match(cli, /live transport is not composed by this CLI/,
  'device CLI must remain fail-closed until a qualified live composition exists');
console.log(`architecture: ${core.length} core modules and ${production.length} package modules obey boundary checks`);
