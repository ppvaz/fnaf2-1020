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
const commandRegistry = Object.entries(rootPackage.scripts).map(([id, command]) => ({
  id, command,
  lifecycle: id.includes('legacy') ? 'legacy'
    : id.includes('qualification') || id === 'device:run' ? 'supported-live' : 'supported',
}));
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
  'controller-v1': ['tools/reactivetest.mjs', 'packages/core/test/cycle-controller.test.js'],
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
  'winner-v1': ['tools/device/test-bundle.mjs'],
  'device-bundle-v1': ['tools/device/test-bundle.mjs'],
  'device-artifact-v1': ['tools/device/test-bundle.mjs'],
  'trainer-trace-v1': ['tools/tracereport.mjs'],
  'artifact-ref-v1': ['tools/evidence.js'],
  'claim-evidence-v1': ['tools/evidence.js'],
  'screencheck-process-v1': ['packages/screencheck/src/screencheck.c', 'packages/screencheck/src/screencheck-start.S'],
  'cue-helper-control-v1': ['tools/cue/test-cue.py'],
  'fact-message-v1': ['packages/core/test/fixtures/fact-message-v1.jsonl'],
  'pcm-udp-v1': ['tools/cue/test-audio-authority.py'],
  'hid-executor-v1': ['tools/device/test-runner-plan.mjs'],
  'device-executor-v1': ['apps/device/test/service.test.js'],
  'device-campaign-v1': ['apps/device/test/campaign.test.js', 'apps/device/test/campaign-runner.test.js'],
  'device-adb-preflight-v1': ['apps/device/test/adb-bridge.test.js'],
  'device-campaign-result-v1': ['apps/device/test/campaign.test.js', 'apps/device/test/campaign-runner.test.js'],
  'campaign-proof-v1': ['apps/device/test/campaign-runner.test.js'],
  'custom-night-config-v1': ['apps/device/test/campaign.test.js', 'apps/device/test/campaign-infrastructure.test.js'],
  'custom-night-calibration-v1': ['apps/device/test/campaign-infrastructure.test.js'],
  'device-campaign-preflight-v1': ['apps/device/test/campaign-infrastructure.test.js'],
  'bench-transport-trace-v1': ['tools/benchtracetest.mjs'],
  'exercise-v1': ['tools/exercisetest.mjs'],
  'commitment-v1': ['tools/exercisetest.mjs'],
  'resolution-v1': ['tools/exercisetest.mjs'],
  'exercise-cancellation-v1': ['tools/exercisetest.mjs'],
  'exercise-event-v1': ['tools/exercisetest.mjs'],
  'exercise-attempt-v1': ['tools/exercisetest.mjs'],
  'activity-gate-v1': ['tools/activitygatetest.mjs'],
  'activity-gate-profile-v1': ['tools/activitygatetest.mjs'],
  'activity-gate-decision-v1': ['tools/activitygatetest.mjs'],
  'microtrainer-session-v1': ['tools/microtrainertest.mjs'],
  'adaptive-skill-model-v1': ['tools/adaptivecoachtest.mjs'],
  'adaptive-selection-v1': ['tools/adaptivecoachtest.mjs'],
  'exercise-renderer-v1': ['tools/renderertest.mjs'],
  'arcade-lab-progress-v1': ['tools/arcadelabtest.mjs'],
  'rhythm-highway-chart-v1': ['tools/rhythmhighwaytest.mjs'],
  'threat-constellation-layout-v1': ['tools/threatconstellationtest.mjs'],
  'monitor-rule-v1': ['packages/adapters/test/monitor-rule.test.js', 'tools/device/test-monitor-calibrate.py'],
  'camera-rule-v1': ['packages/adapters/test/camera-rule.test.js', 'tools/device/test-camera-calibrate.py'],
};
const repositoryPaths = new Set(files.map(path => relative(ROOT, path)));
for (const contract of contractRegister.contracts) {
  const fixtures = contractEvidence[contract.id];
  if (!fixtures?.length)
    throw new Error(`catalog: contract ${contract.id} has no conformance fixture`);
  for (const fixture of fixtures) {
    if (!repositoryPaths.has(fixture))
      throw new Error(`catalog: conformance fixture for ${contract.id} is missing: ${fixture}`);
  }
}
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
    conformanceFixtures: contractEvidence[item.id],
  })),
};

// Stable IDs are the joins between source, tests, documentation, and retained
// evidence. Keep the forward register as the authority, but generate the
// reverse view from repository text so a reader can start at a contract or
// claim and reach every current reference without maintaining another table.
const stableLinks = [];
const linkFiles = files.filter(path => /\.(?:md|txt|js|mjs|ts|py|sh|c|S|json)$/.test(path));
const stablePatterns = [
  ['CONTRACT', /CONTRACT:([a-z0-9-]+)/gi],
  ['ADR', /ADR:([0-9]{4}-[a-z0-9-]+)/gi],
  ['CLAIM', /CLAIM:([a-z0-9._-]+)/gi],
  ['EVIDENCE', /EVIDENCE:([a-z0-9._-]+)/gi],
];
for (const path of linkFiles) {
  const source = await readFile(path, 'utf8');
  const relativePath = relative(ROOT, path);
  for (const [kind, pattern] of stablePatterns) {
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split('\n').length;
      stableLinks.push({ id: `${kind.toLowerCase()}.${match[1]}`, kind,
        path: relativePath, line, relation: 'REFERENCES' });
    }
  }
}
for (const [contractId, paths] of Object.entries(contractEvidence)) {
  for (const path of paths)
    stableLinks.push({ id: `contract.${contractId}`, kind: 'CONTRACT', path,
      relation: 'CONFORMANCE_FIXTURE' });
}
const reverseLinks = {
  schema: 'reverse-links-v1',
  generatedFrom: ['stable IDs in repository text', 'contractEvidence in tools/generate-catalog.js'],
  links: [...new Map(stableLinks.map(link => [
    `${link.id}\u0000${link.path}\u0000${link.line ?? ''}\u0000${link.relation}`, link,
  ])).values()].sort((a, b) => a.id.localeCompare(b.id) || a.path.localeCompare(b.path) ||
    (a.line ?? 0) - (b.line ?? 0) || a.relation.localeCompare(b.relation)),
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

// The compatibility page is the human view; this register is the machine view
// used by migration checks and release reviews. Keep an entry for every
// caller-visible legacy or transitional path, including the generated remote
// driver pieces. A path is never removed merely because a replacement exists:
// the removal gate records the evidence still needed to make deletion safe.
const legacyPaths = [
  {
    id: 'device.trial-launcher', path: 'tools/device/trial.sh', category: 'device',
    lifecycle: 'compatibility', owner: '@fnaf2-1020/device',
    replacement: 'apps/device/src/cli.js + tools/device/artifact-runner.mjs',
    removalGate: 'P5 command/trace equivalence, then P9 compatibility audit',
    notes: 'Short facade only; positional legacy arguments require explicit FNAF2_LEGACY_TRIAL=1.',
  },
  {
    id: 'device.legacy-runner', path: 'tools/device/legacy-trial.sh', category: 'device',
    lifecycle: 'legacy', owner: '@fnaf2-1020/device',
    replacement: 'device-bundle-v1 + DeviceControlService + device-executor-v1',
    removalGate: 'P5 remote executor and trace equivalence, live qualification, then P9',
    notes: 'Historical open-loop phone runner. Deprecated 2026-09-02: historical characterization and replay only, behind FNAF2_LEGACY_TRIAL=1. It may not produce new Plan 12 ladder evidence, and its own results stay attributed to it.',
  },
  {
    id: 'device.legacy-driver-assembly', path: 'tools/device/trial/assemble.sh', category: 'device',
    lifecycle: 'legacy', owner: '@fnaf2-1020/device',
    replacement: 'device-executor-v1 on-device executor',
    removalGate: 'Remove with legacy-runner after byte/trace characterization is retained',
    notes: 'Assembles the shell program sent to Android; it is not a policy module.',
  },
  ...[
    '01-arguments.sh', '02-hid-wire.sh', '03-clock.sh', '04-session.sh',
    '05-press.sh', '06-cams-up-anchor.sh', '07-light-and-capture.sh',
    '08-bb-threat-response.sh', '09-constants.sh', '10-minus7-sweep.sh',
    '11-plan-interpreter.sh', '12-night-loop.sh',
  ].map(name => ({
    id: `device.legacy-driver.${name.replace(/\.sh$/, '')}`,
    path: `tools/device/trial/${name}`, category: 'device-driver-part',
    lifecycle: 'legacy', owner: '@fnaf2-1020/device',
    replacement: 'device-executor-v1 + semantic artifact blocks',
    removalGate: 'Remove with legacy-runner after each responsibility has an adapter/test owner',
    notes: 'Generated remote-driver fragment retained for historical characterization.',
  })),
  {
    id: 'device.mask-camp-runner', path: 'tools/device/trial-maskcamp.sh', category: 'device-experiment',
    lifecycle: 'legacy', owner: '@fnaf2-1020/device',
    replacement: 'artifact-runner observation/qualification lane',
    removalGate: 'Migrate or archive experiment recipes with retained evidence; no new runs',
    notes: 'Second phone runner with its own cold-start and timing path.',
  },
  {
    id: 'device.mask-camp-batch', path: 'tools/device/run-batch.sh', category: 'device-experiment',
    lifecycle: 'legacy', owner: '@fnaf2-1020/device',
    replacement: 'research experiment runner + retained device artifacts',
    removalGate: 'Mask-camp results replayable from structured artifacts',
    notes: 'Batch wrapper around the legacy mask-camp runner.',
  },
  {
    id: 'device.shell-preflight', path: 'tools/device/preflight.sh', category: 'device',
    lifecycle: 'compatibility', owner: '@fnaf2-1020/device',
    replacement: 'DeviceControlService.preflight + profile/qualification checks',
    removalGate: 'Modern CLI covers helper, focus, title, and qualification checks',
    notes: 'Read-only shell gate; do not use it as the modern live entry point.',
  },
  {
    id: 'device.shell-session', path: 'tools/device/session.sh', category: 'device',
    lifecycle: 'compatibility', owner: '@fnaf2-1020/device',
    replacement: 'DeviceControlService session manifest and retained result bundle',
    removalGate: 'Legacy-runner migration retains equivalent session provenance',
    notes: 'Sourced manifest bridge used by the historical shell runner.',
  },
  {
    id: 'device.session-manifest-producer', path: 'tools/device/session-manifest.py', category: 'device',
    lifecycle: 'legacy', owner: '@fnaf2-1020/device',
    replacement: 'runtime `session-manifest-v1` emitter used by DeviceControlService',
    removalGate: 'Historical manifests are indexed/replayable and the shell runner is removed',
    notes: 'Plan 09 producer for the shell-specific `fnaf2.session-manifest` dialect.',
  },
  {
    id: 'device.session-manifest-validator', path: 'tools/device/validate-session.py', category: 'device',
    lifecycle: 'transitional', owner: '@fnaf2-1020/evidence',
    replacement: 'runtime manifest validator + evidence CLI',
    removalGate: 'Historical shell manifests remain inspectable through the evidence boundary',
    notes: 'Validator for the legacy shell manifest; its filename must not be confused with the runtime contract.',
  },
  {
    id: 'device.session-manifest-schema', path: 'tools/device/schema/session-manifest-v1.json', category: 'device',
    lifecycle: 'legacy', owner: '@fnaf2-1020/device',
    replacement: 'runtime `session-manifest-v1` contract',
    removalGate: 'Legacy `fnaf2.session-manifest` fixtures and consumers are archived',
    notes: 'Legacy schema whose internal id is `fnaf2.session-manifest`; it is not the runtime JSON contract.',
  },
  {
    id: 'device.legacy-grader', path: 'tools/device/grade-run.sh', category: 'device-evidence',
    lifecycle: 'transitional', owner: '@fnaf2-1020/evidence',
    replacement: 'evidence CLI over content-addressed device bundles',
    removalGate: 'Historical video/HID/session artifacts have an equivalent structured grader',
    notes: 'Historical run grader that consumes shell-runner captures and manifests.',
  },
  {
    id: 'cue.legacy-pilot-supervisor', path: 'tools/cue/pilot-supervisor.py', category: 'device-experiment',
    lifecycle: 'legacy', owner: '@fnaf2-1020/device',
    replacement: 'device-executor-v1 supervisor with explicit transport ownership',
    removalGate: 'Legacy pilot process-tree evidence is retained and no caller starts the old runner',
    notes: 'External authority supervisor hard-wired to the historical runner.',
  },
  {
    id: 'device.shell-adb-selector', path: 'tools/device/select-adb.sh', category: 'transport',
    lifecycle: 'transitional', owner: '@fnaf2-1020/adapters',
    replacement: 'explicit injected transport selected by the device composition root',
    removalGate: 'All direct-ADB probes either become adapters or are explicitly archived',
    notes: 'Useful characterization guard, but it must not select a canonical live strategy.',
  },
  {
    id: 'device.shell-coordinates', path: 'tools/device/coords.sh', category: 'transport',
    lifecycle: 'transitional', owner: '@fnaf2-1020/adapters',
    replacement: 'resolved device profile controlMap',
    removalGate: 'All device actions consume profile geometry; probe-only users are archived',
    notes: 'Legacy shell coordinate authority; modern semantic commands carry no coordinates.',
  },
  {
    id: 'device.shell-menu', path: 'tools/device/menu.sh', category: 'device',
    lifecycle: 'transitional', owner: '@fnaf2-1020/device',
    replacement: 'title/menu detector and DeviceControlService state gate',
    removalGate: 'Automated menu-state detector has calibrated evidence and a dry-run fixture',
    notes: 'Human-safe selector retained because the current phone cursor is not machine-qualified.',
  },
  {
    id: 'device.simulated-actuator', path: 'tools/device/actuator.mjs', category: 'simulation',
    lifecycle: 'transitional', owner: '@fnaf2-1020/adapters',
    replacement: 'adapter actuator/error model with conformance fixtures',
    removalGate: 'Pilot/model consumers migrate without changing measured error semantics',
    notes: 'Historical device-lateness model; not a physical transport.',
  },
  {
    id: 'device.recipe-emitter', path: 'tools/device/recipe.mjs', category: 'device-artifact',
    lifecycle: 'transitional', owner: '@fnaf2-1020/device',
    replacement: 'package-owned winner/device-bundle emitter',
    removalGate: 'Bundle emitter no longer imports the tools tree and replay hashes match',
    notes: 'Still used by the bundle compiler, so removal is blocked until extraction.',
  },
  {
    id: 'device.policy-ir-module', path: 'tools/device/policy-ir.mjs', category: 'policy',
    lifecycle: 'transitional', owner: '@fnaf2-1020/core',
    replacement: 'core policy-program contract and research package emitter',
    removalGate: 'P3 policy vocabulary migration and fixed-seed artifact equivalence',
    notes: 'Compatibility policy builder retained while policy ownership moves out of tools.',
  },
  {
    id: 'research.stock-device-pilot', path: 'tools/model/stock-device-pilot.mjs', category: 'research',
    lifecycle: 'legacy', owner: '@fnaf2-1020/research',
    replacement: 'experiment spec/runner with an explicit historical actuator model',
    removalGate: 'Historical sweeps have structured, replayable experiment artifacts',
    notes: 'Retired swipe-era schedule report; it is not a selectable device route.',
  },
  {
    id: 'device.cue-model-provisioner', path: 'tools/device/provision-cue-model.sh', category: 'device',
    lifecycle: 'legacy', owner: '@fnaf2-1020/adapters',
    replacement: 'cue-helper/screen detector profile with content-addressed model binding',
    removalGate: 'No supported APK build loads the provisioned file and all holdouts are retained',
    notes: 'Historical APK model installer; current visual-only helper does not consume it.',
  },
  {
    id: 'cue.esp32-model-packer', path: 'tools/cue/pack-esp32-cues.py', category: 'firmware',
    lifecycle: 'legacy', owner: '@fnaf2-1020/adapters',
    replacement: 'transport-neutral cue authority and versioned firmware profile',
    removalGate: 'Semantic-DSP fallback is archived with reproducible model artifacts',
    notes: 'Retained fallback generator; production bridge does not link its generated assets.',
  },
  {
    id: 'research.minus-toys-alias', path: 'tools/minustoystest.mjs', category: 'research-alias',
    lifecycle: 'compatibility', owner: '@fnaf2-1020/research',
    replacement: 'npm run research -- minus-toys',
    removalGate: 'Package structured artifacts and fixed-seed output are equivalent',
    notes: 'Compatibility alias for the research package family evaluator.',
  },
  {
    id: 'research.minus-two-alias', path: 'tools/minus2test.mjs', category: 'research-alias',
    lifecycle: 'compatibility', owner: '@fnaf2-1020/research',
    replacement: 'npm run research -- minus-two',
    removalGate: 'Package structured artifacts and fixed-seed output are equivalent',
    notes: 'Compatibility alias for the research package family evaluator.',
  },
  {
    id: 'package.legacy-engine-command', path: 'package.json#scripts.test:legacy:engine', category: 'command',
    lifecycle: 'compatibility', owner: '@fnaf2-1020/core',
    replacement: 'node tools/test.mjs --engine (canonical engine fixture lane)',
    removalGate: 'Bare-Node compatibility lane is no longer needed and P9 audit is green',
    notes: 'Retained package command for the old engine test entry point.',
  },
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
  'legacy-paths.json': { schema: 'legacy-path-map-v1', generatedFrom: 'tools/generate-catalog.js', entries: legacyPaths },
  'reverse-links.json': reverseLinks,
};
for (const [name, value] of Object.entries(outputs)) await writeFile(join(OUT, name), JSON.stringify(value, null, 2) + '\n');
console.log(`catalog: ${Object.keys(outputs).length} inventories (${sourceFiles.length} source files)`);
