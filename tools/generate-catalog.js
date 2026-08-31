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
const contractEvidence = {
  'plant-model-v1': ['tools/sourcetest.mjs', 'tools/simtest.mjs'],
  'semantic-control-v1': ['packages/core/test/contracts.test.js', 'tools/device/test-policy-interpreter.mjs'],
  'policy-program-v1': ['tools/policygrammartest.mjs', 'tools/device/test-policy-ir.mjs'],
  'controller-v1': ['tools/reactivetest.mjs', 'tools/cyclecontrollertest.mjs'],
  'trajectory-v1': ['packages/runtime/test/scheduler.test.js'],
  'qualification-v1': ['apps/device/test/service.test.js'],
  'raw-sample-v1': ['packages/adapters/test/conformance.test.js'],
  'measurement-v1': ['packages/core/test/contracts.test.js', 'packages/adapters/test/conformance.test.js'],
  'detector-v1': ['packages/adapters/test/conformance.test.js'],
  'state-estimate-v1': ['tools/estimatortest.mjs'],
  'supervisor-v1': ['tools/cue/test-pilot-supervisor.py'],
  'clock-v1': ['tools/phaseclocktest.mjs'],
  'actuator-v1': ['packages/adapters/test/conformance.test.js'],
  'capability-v1': ['packages/adapters/test/conformance.test.js'],
  'calibration-v1': ['packages/adapters/test/conformance.test.js'],
  'device-profile-v1': ['apps/device/test/service.test.js'],
  'telemetry-event-v1': ['tools/factlinktest.mjs'],
  'session-manifest-v1': ['tools/device/test-session-manifest.sh'],
  'experiment-spec-v1': ['packages/research/test/experiment.test.js'],
  'experiment-result-v1': ['packages/research/test/experiment.test.js'],
  'trainer-trace-v1': ['tools/tracereport.mjs'],
  'artifact-ref-v1': ['tools/evidence.js'],
  'claim-evidence-v1': ['tools/evidence.js'],
  'screencheck-process-v1': ['packages/screencheck/src/screencheck.c', 'packages/screencheck/src/screencheck-start.S'],
  'cue-helper-control-v1': ['tools/cue/test-cue.py'],
  'fact-message-v1': ['packages/core/test/fixtures/fact-message-v1.jsonl'],
  'pcm-udp-v1': ['tools/cue/test-audio-authority.py'],
  'hid-executor-v1': ['tools/device/test-runner-plan.mjs'],
  'device-executor-v1': ['apps/device/test/service.test.js'],
};
const contractSpecifications = {
  schema: 'contract-specification-catalog-v1',
  generatedFrom: 'packages/core/contracts/register.json',
  specifications: contractRegister.contracts.map(item => ({
    contractId: item.id,
    id: item.id,
    version: Number(item.id.match(/-v(\d+)$/)?.[1] ?? 1),
    owner: item.owner,
    kind: item.kind,
    purpose: `Stable ${item.id} boundary for ${item.owner}; its validator is ${item.validator}.`,
    nonPurpose: 'Does not grant capabilities beyond the fields and actions explicitly validated by the contract.',
    clockDomains: ['declared-by-payload-or-profile'],
    units: 'Values carry explicit units or are documented by the owning validator.',
    unknownBehavior: 'Invalid or unavailable data is rejected or represented as an explicit UNKNOWN state; it is never silently promoted.',
    errorBehavior: 'Reject malformed, incompatible, uncalibrated, or out-of-budget values at the boundary.',
    compatibility: 'Versioned IDs are additive by default; incompatible changes require a new version and retained fixtures.',
    runtimeValidation: item.validator,
    conformanceFixtures: contractEvidence[item.id] ?? ['packages/core/test/contracts.test.js'],
  })),
};
const tests = [];
for (const path of sourceFiles.filter(path => /(?:test|check|spec)[^/]*\.(?:mjs|js|py|sh)$/.test(path))) {
  const source = await readFile(path, 'utf8');
  const id = relative(ROOT, path);
  const lane = path.includes('browser') || path.includes('realtime') ? 'test:browser:realtime' : path.includes('device') ? 'test:device:dry' : 'test:unit';
  const fixedSleeps = [...source.matchAll(/(?:setTimeout|sleep|time\.sleep)\s*\(([^\n)]*)/g)]
    .map(match => match[0].trim()).slice(0, 12);
  const nondeterministic = [...source.matchAll(/\b(Math\.random|Date\.now|new Date\(|performance\.now|crypto\.randomUUID)\b/g)]
    .map(match => match[1]);
  const sharedResources = [...new Set([
    ...(source.includes('chrome') || source.includes('CDP') ? ['browser'] : []),
    ...(source.includes('adb') || source.includes('/dev/') || source.includes('hid') ? ['device-transport'] : []),
    ...(source.includes('8731') || source.includes('serve.py') ? ['local-http-port'] : []),
  ])];
  tests.push({
    id, lane,
    owner: path.includes('packages/core') ? '@fnaf2-1020/core' : path.includes('packages') ? 'package boundary' : 'legacy migration',
    timeoutMs: lane === 'test:browser:realtime' ? 360000
      : id === 'tools/ventreacttest.mjs' ? 900000
        : id === 'tools/minus7/test-search.mjs' ? 600000
        : id === 'tools/reactivetest.mjs' ? 300000
          : id === 'tools/device/test-human-gate.mjs' ? 240000 : 180000,
    timeoutSource: 'tools/test.mjs per-test watchdog',
    deterministic: nondeterministic.length === 0,
    determinismSignals: nondeterministic,
    fixedSleeps,
    sharedResources,
    subprocesses: /(?:\.sh|test-docs|test\.mjs|spawn\(|execFile)/.test(source),
    measurement: { status: 'NOT_MEASURED', runs: 0, durationMs: null, flakiness: null },
  });
}
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
