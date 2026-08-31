#!/usr/bin/env node
/** Generate checked-in inventories from executable repository truth. */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADAPTER_REGISTRY } from '@fnaf2-1020/adapters/registry';

const ROOT = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const OUT = join(ROOT, 'docs/architecture/generated');
const SKIP = new Set(['.git', 'node_modules', 'captures', 'artifacts', 'dist', '__pycache__']);

async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else result.push(path);
  }
  return result;
}

const files = (await walk(ROOT)).sort();
const sourceFiles = files.filter(path => /\.(?:js|mjs|ts|py|sh|c|S)$/.test(path));
const language = {};
for (const path of sourceFiles) {
  const ext = path.split('.').pop();
  const languageName = { mjs: 'JavaScript', js: 'JavaScript', ts: 'TypeScript', py: 'Python', sh: 'Shell', c: 'C', S: 'Assembly' }[ext] ?? ext;
  const lines = (await readFile(path, 'utf8')).split('\n').length - 1;
  language[languageName] ??= { files: 0, lines: 0 };
  language[languageName].files += 1; language[languageName].lines += lines;
}

const importGraph = [];
for (const path of sourceFiles.filter(path => /\.(?:js|mjs|ts)$/.test(path))) {
  const source = await readFile(path, 'utf8');
  const imports = [...source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map(match => match[2]);
  if (imports.length) importGraph.push({ file: relative(ROOT, path), imports: [...new Set(imports)].sort() });
}

const rootPackage = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
const commandRegistry = Object.entries(rootPackage.scripts).map(([id, command]) => ({ id, command, lifecycle: id.includes('qualification') || id === 'device:run' ? 'supported-live' : 'supported' }));
const toolsIndex = await readFile(join(ROOT, 'tools/TOOLS.md'), 'utf8');
const toolCommands = [...toolsIndex.matchAll(/^\| `([^`]+)` \| ([^|]+) \|/gm)].map(match => ({
  id: match[1].split(/\s+/)[0], invocation: match[1], kind: match[2].trim(), lifecycle: /legacy|historical/i.test(match[2]) ? 'legacy' : 'supported',
}));
const contractRegister = JSON.parse(await readFile(join(ROOT, 'packages/core/contracts/register.json'), 'utf8'));
const protocols = contractRegister.contracts.filter(item => ['wire', 'process'].includes(item.kind));
const contractSpecifications = {
  schema: 'contract-specification-catalog-v1',
  generatedFrom: 'packages/core/contracts/register.json',
  specifications: contractRegister.contracts.map(item => ({
    contractId: item.id,
    id: item.id,
    version: Number(item.id.match(/-v(\d+)$/)?.[1] ?? 1),
    owner: item.owner,
    kind: item.kind,
    purpose: `Stable ${item.id} boundary for ${item.owner}.`,
    nonPurpose: 'Does not grant capabilities beyond the fields and actions explicitly validated by the contract.',
    clockDomains: ['declared-by-payload-or-profile'],
    units: 'Values carry explicit units or are documented by the owning validator.',
    unknownBehavior: 'Invalid or unavailable data is rejected or represented as an explicit UNKNOWN state; it is never silently promoted.',
    errorBehavior: 'Reject malformed, incompatible, uncalibrated, or out-of-budget values at the boundary.',
    compatibility: 'Versioned IDs are additive by default; incompatible changes require a new version and retained fixtures.',
    runtimeValidation: item.validator,
    conformanceFixtures: item.id === 'fact-message-v1'
      ? ['packages/core/test/fixtures/fact-message-v1.jsonl']
      : ['packages/core/test/contracts.test.js', 'packages/adapters/test/conformance.test.js'],
  })),
};
const tests = sourceFiles.filter(path => /(?:test|check|spec)[^/]*\.(?:mjs|js|py|sh)$/.test(path)).map(path => ({
  id: relative(ROOT, path), lane: path.includes('browser') || path.includes('realtime') ? 'test:browser:realtime' : path.includes('device') ? 'test:device:dry' : 'test:unit',
  owner: path.includes('packages/core') ? '@fnaf2-1020/core' : path.includes('packages') ? 'package boundary' : 'legacy migration',
  timeoutMs: path.includes('browser') ? 30000 : path.includes('device') ? 30000 : 10000,
  deterministic: true, fixedSleeps: [], sharedResources: [], subprocesses: /(?:\.sh|test-docs|test\.mjs)/.test(path),
}));
const duplicateResponsibilities = [
  { responsibility: 'canonical mechanics', owner: '@fnaf2-1020/core', legacy: [] },
  { responsibility: 'semantic policy IR', owner: '@fnaf2-1020/core', legacy: ['tools/device/policy-ir.mjs'] },
  { responsibility: 'physical actuation', owner: '@fnaf2-1020/adapters', legacy: ['tools/device/actuator.mjs', 'tools/device/legacy-trial.sh'] },
  { responsibility: 'device composition', owner: '@fnaf2-1020/device', legacy: ['tools/device/legacy-trial.sh', 'tools/device/recipe.mjs'] },
  { responsibility: 'research execution', owner: '@fnaf2-1020/research', legacy: ['tools/*search*', 'tools/*sweep*', 'tools/*probe*'] },
];

const outputs = {
  'language-inventory.json': { schema: 'language-inventory-v1', languages: language },
  'import-graph.json': { schema: 'import-graph-v1', files: importGraph },
  'command-registry.json': { schema: 'command-registry-v1', source: ['package.json', 'tools/TOOLS.md'], commands: commandRegistry, tools: toolCommands },
  'contract-register.json': contractRegister,
  'contract-specifications.json': contractSpecifications,
  'protocol-register.json': { schema: 'protocol-register-v1', protocols },
  'adapter-registry.json': { schema: 'adapter-registry-v1', adapters: Object.values(ADAPTER_REGISTRY) },
  'test-manifest.json': { schema: 'test-manifest-v1', generatedFrom: 'source inventory', tests },
  'duplicate-responsibilities.json': { schema: 'duplicate-responsibility-map-v1', entries: duplicateResponsibilities },
};
for (const [name, value] of Object.entries(outputs)) await writeFile(join(OUT, name), JSON.stringify(value, null, 2) + '\n');
console.log(`catalog: ${Object.keys(outputs).length} inventories (${sourceFiles.length} source files)`);
