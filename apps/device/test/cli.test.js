// Device CLI grammar regression: help is side-effect free and unknown
// positional commands fail closed instead of becoming a dry-run.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'apps/device/src/cli.js');
const run = args => spawnSync(process.execPath, [CLI, ...args], {
  cwd: ROOT, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' },
});

for (const args of [['--help'], ['dry-run', '--help']]) {
  const result = run(args);
  assert.equal(result.status, 0, `${args.join(' ')} failed: ${result.stderr}`);
  assert.match(result.stdout, /Usage:/);
  assert.doesNotMatch(result.stdout, /result=|evidence=/,
    `${args.join(' ')} unexpectedly executed a run`);
}

const unknown = run(['not-a-command']);
assert.equal(unknown.status, 2);
assert.match(unknown.stderr, /unknown command/);
assert.doesNotMatch(unknown.stdout, /result=|evidence=/);

for (const args of [['calibrate', '--live', '--confirm-live'],
  ['calibrate', '--profile', 'hid-mediaprojection'], ['calibrate', '--spec'], ['calibrate', '--spec='],
  ['clockmap', '--live'], ['clockmap', '--count', '3'], ['clockmap', '--span-ms', '1000'], ['clockmap', '--out']]) {
  const result = run(args);
  assert.equal(result.status, 2, args.join(' '));
  assert.doesNotMatch(result.stdout, /result=|evidence=/);
}
const calibration = run(['calibrate', '--json']);
assert.equal(calibration.status, 0, calibration.stderr);
const result = JSON.parse(calibration.stdout);
assert.equal(result.claimLevel, 'FIXTURE');
assert.equal(result.calibration.workflow, 'COMPLETED');
assert.equal(result.calibration.calibration, 'UNVERIFIED');

const oneAttempt = run(['campaign', '--profile', 'fixture-hid-screencap', '--nights', '6',
  '--max-attempts', '1', '--json']);
assert.equal(oneAttempt.status, 0, oneAttempt.stderr);
assert.equal(JSON.parse(oneAttempt.stdout).spec.retry.maxAttempts, 1,
  'a diagnostic campaign must be able to retain one plan epoch');
const invalidAttempts = run(['campaign', '--profile', 'fixture-hid-screencap',
  '--max-attempts', '0']);
assert.equal(invalidAttempts.status, 2);

console.log('device CLI: help is side-effect free and unknown commands fail closed');
