// Contract tests for the winner -> device bundle handoff.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileBundle, parsePlan, validateBundle } from './bundle.mjs';

const check = (condition, message) => { if (!condition) throw new Error(message); };
const expectFailure = (fn, message) => {
  let failed = false;
  try { fn(); } catch { failed = true; }
  check(failed, message);
};

const root = mkdtempSync(join(tmpdir(), 'fnaf2-device-bundle-'));
try {
  const winner = {
    schema: 'winner-v1', strategy: 'minus-toys', knobs: 'KNOBS0', nights: [2, 7],
    engineHash: 'minus-toys-engine-fixture-v1', seeds: [1, 2],
    profile: 'fixture-hid-screencap',
    gate: { status: 'PASS', claimLevel: 'MODEL_ONLY' },
  };
  const bundlePath = join(root, 'minus-toys');
  const compiled = compileBundle(winner, bundlePath);
  check(compiled.status === 'READY', 'compiler did not return READY');
  check(readFileSync(join(bundlePath, 'manifest.json'), 'utf8').includes('device-bundle-v1'),
    'manifest was not written');
  check(readFileSync(join(bundlePath, 'night-2.plan'), 'utf8').includes('#loop-start 0'),
    'compiled plan did not receive common timing headers');
  check(readFileSync(join(bundlePath, 'profile.json'), 'utf8').includes('fixture-hid-screencap'),
    'profile was not copied into the bundle');
  const ready = validateBundle(bundlePath);
  check(ready.plans.length === 2 && ready.replay.results.length === 4,
    'bundle validator did not replay each selected night and seed');
  const selected = validateBundle(bundlePath, { night: 7 });
  check(selected.plans.length === 1 && selected.plans[0].night === 7,
    'night selector did not bind to the requested plan');

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

  const output = execFileSync(join(process.cwd(), 'tools/device/trial.sh'),
    ['--artifact', bundlePath, '--dry-run', '--night', '2'], { encoding: 'utf8' });
  check(output.includes('artifact READY (dry-run)') && output.includes('night-2.plan'),
    'trial.sh did not consume the exact artifact');
  expectFailure(() => execFileSync(join(process.cwd(), 'tools/device/trial.sh'),
    ['--artifact', bundlePath]), 'trial.sh allowed artifact live execution');

  console.log('device bundle: winner-v1 -> manifest/plans/profile, hash+syntax+control+replay validation, and trial artifact dry-run pass');
} finally {
  rmSync(root, { recursive: true, force: true });
}
