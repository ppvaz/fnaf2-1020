// Contract tests for the winner -> device bundle handoff.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileBundle, parsePlan, validateBundle } from './bundle.mjs';
import { compileArtifactPlans } from './artifact-commands.mjs';

const check = (condition, message) => { if (!condition) throw new Error(message); };
const expectFailure = (fn, message) => {
  let failed = false;
  try { fn(); } catch { failed = true; }
  check(failed, message);
};
const ARTIFACT_RUNNER = join(process.cwd(), 'tools/device/artifact-runner.mjs');

const root = mkdtempSync(join(tmpdir(), 'fnaf2-device-bundle-'));
try {
  const winner = {
    schema: 'winner-v1', strategy: 'minus-toys', knobs: 'KNOBS0', nights: [2, 7],
    engineHash: 'minus-toys-engine-fixture-v1', seeds: [1, 2],
    profile: 'fixture-hid-screencap',
    gate: { status: 'PASS', claimLevel: 'MODEL_ONLY' },
  };
  const bundlePath = join(root, 'minus-toys');

  // A death-targeting bundle: the gate is honestly not PASS and carries the
  // prediction the run will be read against. Without the prediction it is
  // refused; with it the manifest carries it verbatim.
  const targeted = { ...winner, nights: [6],
    gate: { status: 'DEATH_TARGETED', claimLevel: 'MODEL_ONLY' } };
  expectFailure(() => compileBundle(targeted, join(root, 'targeted-no-prediction')),
    'a DEATH_TARGETED gate without its prediction must be refused');
  const prediction = { schema: 'death-prediction-v1', night: 6, replays: 3000, phasesMs: [0, 500], wins: 0,
    killers: [{ killer: 'foxy', count: 2250, share: 0.75, tSeconds: { min: 50, p10: 80, p50: 150, p90: 170, max: 230 } },
      { killer: 'puppet', count: 750, share: 0.25, tSeconds: { min: 24.7, p10: 26.7, p50: 32.7, p90: 49.7, max: 82.7 } }],
    generatedBy: 'test' };
  expectFailure(() => compileBundle({ ...targeted, gate: { ...targeted.gate, prediction: { ...prediction, replays: 600, killers: [{ ...prediction.killers[0], count: 600 }] } } },
    join(root, 'targeted-short')), 'a death prediction below 3000 replays must be refused');
  expectFailure(() => compileBundle({ ...targeted, gate: { ...targeted.gate, prediction: { ...prediction, wins: 5 } } },
    join(root, 'targeted-sum')), 'a death prediction whose counts do not add up must be refused');
  const targetedPath = join(root, 'targeted');
  check(compileBundle({ ...targeted, gate: { ...targeted.gate, prediction } }, targetedPath).status === 'READY',
    'a DEATH_TARGETED gate with a valid prediction must compile');
  const targetedManifest = JSON.parse(readFileSync(join(targetedPath, 'manifest.json'), 'utf8'));
  check(targetedManifest.gate.status === 'DEATH_TARGETED' && targetedManifest.gate.prediction.killers[0].killer === 'foxy',
    'the manifest must carry the death-targeted gate and its prediction');
  check(validateBundle(targetedPath).plans.length === 1, 'a death-targeted bundle must validate like any other');
  expectFailure(() => compileBundle({ ...winner, gate: { status: 'FAIL' } }, join(root, 'fail-gate')),
    'a plain FAIL gate is still refused');
  const compiled = compileBundle(winner, bundlePath);
  check(compiled.status === 'READY', 'compiler did not return READY');
  check(readFileSync(join(bundlePath, 'manifest.json'), 'utf8').includes('device-bundle-v1'),
    'manifest was not written');
  check(readFileSync(join(bundlePath, 'night-2.plan'), 'utf8').includes('#loop-start 0'),
    'compiled plan did not receive common timing headers');
  check(readFileSync(join(bundlePath, 'profile.json'), 'utf8').includes('fixture-hid-screencap'),
    'profile was not copied into the bundle');
  const compiledArtifactText = readFileSync(join(bundlePath, 'artifact.json'), 'utf8');
  check(compiledArtifactText.includes('device-artifact-v1') && !compiledArtifactText.includes('"strategy"') &&
    !compiledArtifactText.includes('"policy"'), 'compiled artifact leaked host strategy metadata');
  const ready = validateBundle(bundlePath);
  check(ready.plans.length === 2 && ready.replay.results.length === 4,
    'bundle validator did not replay each selected night and seed');
  check(ready.compiled?.length === 2, 'bundle validator did not return persisted semantic artifact plans');
  check(ready.compiled.every(plan => plan.timing?.periodMs > 0 &&
    plan.timing.stopAtMs >= plan.timing.loopStartMs &&
    plan.timing.observeUntilMs >= plan.timing.stopAtMs),
  'persisted artifact plans did not retain their bounded full-night timing envelope');
  const selected = validateBundle(bundlePath, { night: 7 });
  check(selected.plans.length === 1 && selected.plans[0].night === 7,
    'night selector did not bind to the requested plan');
  const conditioned = compileArtifactPlans(selected.plans, parsePlan, selected.profile);
  const actions = Object.values(conditioned[0].cycles).flatMap(cycle =>
    cycle.blocks.flatMap(block => block.actions));
  check(actions.filter(action => action.control?.startsWith('cam:'))
    .every(action => action.requiresMonitorUp === true),
  'artifact compiler emitted a camera action without an UP precondition');
  check(actions.filter(action => action.control === 'monitor')
    .every(action => typeof action.targetMonitorUp === 'boolean'),
  'artifact compiler retained a parity-only monitor toggle');

  // The campaign target is an all-night target, not a Night 6 + Custom Night
  // special case. Keep one fixture bundle covering the complete 1..7 chain so
  // the emitter/parser/semantic compiler cannot regress to a two-night default.
  const allNightBundle = compileBundle({ ...winner, nights: [1, 2, 3, 4, 5, 6, 7], seeds: [1] },
    join(root, 'all-nights'));
  check(allNightBundle.manifest.nights.join(',') === '1,2,3,4,5,6,7' &&
    allNightBundle.compiled.length === 7,
  'bundle compiler did not bind one semantic plan for every night');

  const cliWinner = join(root, 'winner-input.json');
  const cliBundle = join(root, 'cli-bundle');
  writeFileSync(cliWinner, JSON.stringify(winner) + '\n');
  const cliOutput = execFileSync('node', [join(process.cwd(), 'tools/device/emit.mjs'),
    '--winner', cliWinner, '--out', cliBundle], { encoding: 'utf8' });
  check(cliOutput.includes('device bundle READY') && validateBundle(cliBundle).status === 'READY',
    'device:emit CLI did not create a valid bundle');

  const planPath = join(bundlePath, 'night-2.plan');
  const originalPlan = readFileSync(planPath, 'utf8');
  writeFileSync(planPath, `${originalPlan}#manual-edit\n`);
  expectFailure(() => validateBundle(bundlePath),
    'validator accepted a manually edited plan');
  writeFileSync(planPath, originalPlan);
  check(validateBundle(bundlePath).status === 'READY', 'bundle did not recover after restoring the plan');
  writeFileSync(join(bundlePath, 'artifact.json'), `${compiledArtifactText}\n`);
  expectFailure(() => validateBundle(bundlePath),
    'validator accepted a manually edited compiled artifact');
  writeFileSync(join(bundlePath, 'artifact.json'), compiledArtifactText);
  check(validateBundle(bundlePath).compiled?.length === 2,
    'bundle did not recover after restoring the compiled artifact');

  const malformed = originalPlan.replace('tap cam11 33', 'tap unsupported 33');
  expectFailure(() => parsePlan(malformed, { strategy: 'minus-toys', night: 2 }),
    'plan parser accepted an unsupported interpreter control');

  const minus7 = compileBundle({
    schema: 'winner-v1', strategy: 'minus7',
    knobs: { night: 6, sweepSlotMs: 120, maskMarginMs: 900, readLatencyMs: 550, hallPulseMs: 130, pilotOffset: 10 },
    planOptions: { deviceSpacingMs: 100, sweepContactMs: 33 }, nights: [6],
    engineHash: 'minus7-engine-fixture-v1', seeds: [1], profile: 'fixture-hid-screencap',
    gate: { status: 'PASS', claimLevel: 'MODEL_ONLY' },
  }, join(root, 'minus7'));
  check(minus7.manifest.plans[0].policy === 'minus7', 'minus7 emitter was not registered');

  const minus3 = compileBundle({
    schema: 'winner-v1', strategy: 'minus3', knobs: 'KNOBS0', nights: [3],
    engineHash: 'minus3-engine-fixture-v1', seeds: [1], profile: 'hid-mediaprojection',
    gate: { status: 'PASS', claimLevel: 'MODEL_ONLY' },
  }, join(root, 'minus3'));
  check(minus3.manifest.plans[0].policy === 'minus3', 'minus3 emitter was not registered');
  const minus3Actions = Object.values(minus3.compiled[0].cycles).flatMap(cycle =>
    cycle.blocks.flatMap(block => block.actions));
  check(minus3Actions.some(action => action.compound === 'hallvent' &&
    action.control === 'hallLight' && action.ventControl === 'rightVentLight'),
  'minus3 did not compile the hall/right-vent compound');

  const output = execFileSync(process.execPath, [ARTIFACT_RUNNER,
    '--artifact', bundlePath, '--dry-run', '--night', '2'], { encoding: 'utf8' });
  check(output.includes('artifact READY (dry-run)') && output.includes('night-2.plan'),
    'artifact-runner did not consume the exact artifact');
  expectFailure(() => execFileSync(process.execPath, [ARTIFACT_RUNNER,
    '--artifact', bundlePath]), 'artifact-runner allowed artifact execution without a mode');

  const qualificationPath = join(root, 'qualification.json');
  writeFileSync(qualificationPath, JSON.stringify({ schema: 'qualification-v1',
    evidenceId: 'fixture-device-evidence', claimLevel: 'DEVICE_MEASURED',
    policyHash: ready.manifest.winnerHash, modelHash: ready.manifest.engineHash,
    sampleCount: 1, verdict: 'PASS' }) + '\n');
  let liveError = '';
  try {
    execFileSync(process.execPath, [ARTIFACT_RUNNER, '--artifact', bundlePath,
      '--live', '--confirm-live', '--qualification', qualificationPath], { encoding: 'utf8' });
  } catch (error) { liveError = `${error.stdout ?? ''}${error.stderr ?? ''}`; }
  check(liveError.includes('live artifact execution requires --executor MODULE'),
    'artifact live lane bypassed the explicit executor-composition gate');

  const executorModule = join(root, 'executor.mjs');
  writeFileSync(executorModule, `
    export function createExecutor() {
      return {
        execute: async request => {
          if (request.schema !== 'device-executor-v1') throw new Error('wrong executor schema');
          if (JSON.stringify(request).includes('"strategy"') || JSON.stringify(request).includes('"policy"'))
            throw new Error('strategy leaked');
          return { outcome: 'PASS', blockCount: request.blocks.length };
        },
        abort: async () => {}, releaseAll: async () => {},
      };
    }
  `);
  const liveOutput = execFileSync(process.execPath, [ARTIFACT_RUNNER, '--artifact', bundlePath,
    '--live', '--confirm-live', '--qualification', qualificationPath, '--executor', executorModule], { encoding: 'utf8' });
  check(liveOutput.includes('artifact execution PASS') && liveOutput.includes('blocks='),
    'artifact live lane did not pass the explicit executor boundary');

  // A phase offset rotates the whole emitted stream against the game's own
  // frame grid, so the replay that gates the winner has to score it. The
  // 2026-09-11 Night 5 bundle shipped `#phase-offset 333` while its replay ran
  // epoch 0: the plan text changed, the replay hash did not, and the winner's
  // `MODEL_ONLY 3000/3000` evidence was re-certified for a stream no census had
  // seen. These two checks are what makes that impossible.
  const phased = { ...winner, nights: [7], phaseOffsetMs: 333 };
  const unphased = { ...winner, nights: [7] };
  const phasedPath = join(root, 'phased');
  const unphasedPath = join(root, 'unphased');
  const phasedBundle = compileBundle(phased, phasedPath);
  const unphasedBundle = compileBundle(unphased, unphasedPath);
  check(readFileSync(join(phasedPath, 'night-7.plan'), 'utf8').includes('#phase-offset 333'),
    'phase offset did not reach the emitted plan');
  check(phasedBundle.replay.hash !== unphasedBundle.replay.hash,
    'replay hash ignored the phase offset: the gate cannot see the rotation it ships');

  // minus3 and minus7 replay at epoch 0 only. Emitting an offset they cannot
  // score would reopen the same hole through a different strategy.
  // Assert the reason, not just the refusal: this winner also trips the
  // profile's control map, and a test that accepts any error would pass with
  // the phase check deleted.
  let phaseRefusal = '';
  try {
    compileBundle({ ...winner, strategy: 'minus3', nights: [5], knobs: 'KNOBS0',
      engineHash: 'minus3-engine-fixture-v1', phaseOffsetMs: 333 }, join(root, 'minus3-phased'));
  } catch (error) { phaseRefusal = error.message; }
  check(phaseRefusal.includes('minus3 cannot replay a phase offset'),
    `a strategy whose replay cannot evaluate a phase offset still accepted one (${phaseRefusal})`);

  console.log('device bundle: winner-v1 -> manifest/plans/profile, hash+syntax+control+replay validation, and artifact runner pass');
} finally {
  rmSync(root, { recursive: true, force: true });
}
