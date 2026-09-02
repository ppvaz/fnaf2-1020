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

console.log('device CLI: help is side-effect free and unknown commands fail closed');
