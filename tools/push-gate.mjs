#!/usr/bin/env node
// Run the CI job locally, against the commits about to be pushed.
//
// The point is the CHECKOUT, not the commands. CI clones the pushed commit and
// runs there; a developer running the same `npm run` lines runs them against a
// working tree that also holds uncommitted edits, untracked files, and stale
// generated output. Those two answers differ, and the difference is not
// theoretical: `fcd4312` added `tools/nightloop-run.mjs` without its
// `command-registry.json` row and CI failed `git diff --exit-code` on every
// push for a day, while the same catalog command in the author's tree looked
// settled. `npm run catalog` in a dirty tree is a DIFFERENT MEASUREMENT from
// the one CI takes. So this gate builds a throwaway `git worktree` at the exact
// commit being pushed and runs the lanes there.
//
// Two deliberate differences from CI, both strictly more informative:
//
//   - CI stops the job at its first failed step. This runs every lane, because
//     a job that stops early reports one break and hides the rest.
//   - When a lane fails, its `&&` chain is re-run command by command to name
//     every failure in it. `deb6463` broke both `night-policy.test.js` and
//     `observationlanguagetest.mjs`; they sit in one `&&` chain, so CI only
//     ever named the first and the second stayed invisible for a day.
//
// The verdict itself is CI's: a lane is the step text from `ci.yml`, and
// `laneDrift` fails the run if the two drift apart, because a mirror that has
// stopped mirroring is worse than no mirror.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const ZERO = /^0+$/;

// Each lane is one `ci.yml` step. `needs` names a binary the lane cannot run
// without; a missing one is reported as SKIPPED rather than passed, because a
// gate that quietly drops a lane is how a green local run turns red online.
const LANES = [
  { name: 'Type and architecture contracts', run: 'npm run typecheck && npm run test:unit && npm run test:contracts' },
  { name: 'Clean-checkout model lane', run: 'npm run test:core' },
  { name: 'Trainer build', run: 'npm run build:trainer' },
  { name: 'Fixture device dry-run', run: 'npm run device:dry-run -- --profile fixture-hid-screencap' },
  { name: 'Documentation and catalog links', run: 'npm run catalog && git diff --exit-code -- docs/architecture/generated && node tools/test-docs.mjs' },
  { name: 'ShellCheck critical diagnostics', needs: 'docker', multiline: true },
  { name: 'Shell footgun regressions', run: 'tools/device/test-shell-footguns.sh' },
  { name: 'Cue helper query (mock ADB)', run: 'tools/device/test-query-cue-helper.sh' },
  { name: 'Cue helper soak (mock ADB)', run: 'tools/device/test-soak-cue-helper.sh' },
];

// --- The gate must stay the job it claims to mirror ------------------------

/** Read `- name:` / `run:` pairs out of the CI job, without a YAML parser. */
function ciSteps(dir) {
  const lines = readFileSync(join(dir, '.github/workflows/ci.yml'), 'utf8').split('\n');
  const steps = [];
  for (let i = 0; i < lines.length; i += 1) {
    const named = lines[i].match(/^\s*- name:\s*(.+?)\s*$/);
    if (!named) continue;
    let run = null;
    for (let j = i + 1; j < lines.length && !/^\s*- /.test(lines[j]); j += 1) {
      const single = lines[j].match(/^\s*run:\s*(.+?)\s*$/);
      if (single) { run = single[1] === '|' ? null : single[1]; break; }
    }
    steps.push({ name: named[1], run });
  }
  return steps;
}

function laneDrift(dir) {
  const steps = ciSteps(dir).filter(step => !/^(Fixture rendering dependency|Install the pinned workspace toolchain)$/.test(step.name));
  const drift = [];
  const ciNames = steps.map(step => step.name);
  const laneNames = LANES.map(lane => lane.name);
  if (ciNames.join('\n') !== laneNames.join('\n'))
    drift.push(`lane list differs from ci.yml\n  ci.yml: ${ciNames.join(' | ')}\n  gate:   ${laneNames.join(' | ')}`);
  for (const lane of LANES) {
    const step = steps.find(candidate => candidate.name === lane.name);
    if (!step || lane.multiline) continue;
    if (step.run !== lane.run)
      drift.push(`step "${lane.name}" runs a different command\n  ci.yml: ${step.run}\n  gate:   ${lane.run}`);
  }
  return drift;
}

/** The ShellCheck lane's script, taken verbatim from the `run: |` block. */
function shellcheckScript(dir) {
  const lines = readFileSync(join(dir, '.github/workflows/ci.yml'), 'utf8').split('\n');
  const at = lines.findIndex(line => /- name:\s*ShellCheck critical diagnostics\s*$/.test(line));
  const start = lines.findIndex((line, index) => index > at && /^\s*run:\s*\|\s*$/.test(line));
  const body = [];
  const indent = lines[start + 1].match(/^\s*/)[0];
  for (let i = start + 1; i < lines.length && (lines[i].startsWith(indent) || !lines[i].trim()); i += 1)
    body.push(lines[i].slice(indent.length));
  return body.join('\n').trim();
}

// --- A checkout that resolves its own packages -----------------------------

/**
 * Wire `node_modules` in a fresh worktree. The workspace links must point at
 * the WORKTREE's packages: symlinking the main repository's `node_modules`
 * wholesale makes `@fnaf2-1020/core` resolve back to the working tree, so the
 * gate would type-check and test the code it was built to ignore.
 */
function linkDependencies(worktree) {
  // The lockfile is what `npm ci` installs from, so an identical lockfile means
  // an identical tree and the existing one can be linked. `package.json` is not
  // the test: it changes whenever a script is added, and reinstalling for that
  // would cost minutes for nothing.
  const source = join(ROOT, 'node_modules');
  const same = existsSync(source) && readFileSync(join(ROOT, 'package-lock.json'), 'utf8')
    === readFileSync(join(worktree, 'package-lock.json'), 'utf8');
  if (!same) {
    console.log('  the lockfile differs from the working tree; running npm ci');
    execFileSync('npm', ['ci'], { cwd: worktree, stdio: 'inherit' });
    return;
  }
  mkdirSync(join(worktree, 'node_modules'), { recursive: true });
  for (const entry of readdirSync(source)) {
    const target = join(worktree, 'node_modules', entry);
    if (!entry.startsWith('@')) { symlinkSync(join(source, entry), target); continue; }
    // A scope directory holds the workspace links, and those are relative
    // (`../../packages/core`), so copying the link text re-points them at this
    // checkout. Anything else in the scope is a real dependency directory.
    mkdirSync(target, { recursive: true });
    for (const scoped of readdirSync(join(source, entry))) {
      const from = join(source, entry, scoped);
      symlinkSync(lstatSync(from).isSymbolicLink() ? readlinkSync(from) : from, join(target, scoped));
    }
  }
}

// --- Running the lanes -----------------------------------------------------

function run(command, cwd) {
  const result = spawnSync('sh', ['-c', command], { cwd, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

// The scripts of the CHECKOUT being validated, not of the working tree: a
// pushed commit may have redefined the very chain the lane runs.
let SCRIPTS = {};

/**
 * The commands a failing command is made of, or null when it is a leaf. An
 * `npm run` name expands to its script body so the search reaches the actual
 * test file: `test:contracts` is a forty-command `&&` chain, and naming it as
 * one failure is the reporting CI already gives.
 */
function expand(command, depth) {
  if (depth <= 0) return null;
  const parts = command.split(' && ').filter(Boolean);
  if (parts.length > 1) return parts;
  const script = command.match(/^npm run ([\w:-]+)$/);
  return script && SCRIPTS[script[1]] ? [SCRIPTS[script[1]]] : null;
}

/**
 * Name every failure under a failed lane, not just the one that stopped it.
 * Long chains print their failures only: forty passing lines bury the two that
 * matter, and the count line still says nothing was skipped.
 */
function diagnose(command, worktree, indent, depth) {
  const result = run(command, worktree);
  if (result.status === 0) return true;
  const children = expand(command, depth);
  console.log(`${indent}FAIL ${command.length > 110 ? `${command.slice(0, 110)}...` : command}`);
  if (children) { walk(children, worktree, `${indent}  `, depth - 1); return false; }
  for (const line of result.output.trimEnd().split('\n').slice(-15))
    console.log(`${indent}     ${line}`);
  return false;
}

function walk(children, worktree, indent, depth) {
  let passed = 0;
  for (const child of children) {
    if (diagnose(child, worktree, indent, depth)) {
      passed += 1;
      if (children.length <= 6) console.log(`${indent}ok   ${child}`);
    }
  }
  if (children.length > 6) console.log(`${indent}(${passed} of ${children.length} commands passed)`);
}

/** A lane already ran, so open it up rather than paying for it a second time. */
function reportLane(command, worktree, result, depth) {
  const children = expand(command, depth);
  if (!children) {
    for (const line of result.output.trimEnd().split('\n').slice(-25))
      console.log(`      ${line}`);
    return;
  }
  console.log('      -- every command in this lane, not just the one that stopped it --');
  walk(children, worktree, '      ', depth - 1);
}

function validate(sha, subject) {
  const worktree = mkdtempSync(join(tmpdir(), 'fnaf2-push-gate-'));
  rmSync(worktree, { recursive: true, force: true });
  execFileSync('git', ['worktree', 'add', '--detach', worktree, sha], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
  console.log(`\npush-gate: ${sha.slice(0, 7)} ${subject}`);
  const failed = [];
  const skipped = [];
  try {
    // ci.yml comes from the commit under test, because that is the job GitHub
    // will run for it. A gate checking a stale copy is checking nothing.
    const drift = laneDrift(worktree);
    if (drift.length) {
      console.log('  FAIL push-gate is out of step with .github/workflows/ci.yml:');
      for (const item of drift) console.log(`      ${item}`);
      console.log('      Update LANES in tools/push-gate.mjs, or the gate no longer checks what CI checks.');
      return { failed: ['push-gate is out of step with ci.yml'], skipped: [] };
    }
    SCRIPTS = JSON.parse(readFileSync(join(worktree, 'package.json'), 'utf8')).scripts;
    linkDependencies(worktree);
    for (const lane of LANES) {
      if (lane.needs && spawnSync('sh', ['-c', `command -v ${lane.needs} >/dev/null 2>&1 && ${lane.needs} info >/dev/null 2>&1`]).status !== 0) {
        console.log(`  SKIP ${lane.name} (${lane.needs} is not available here; CI still runs it)`);
        skipped.push(lane.name);
        continue;
      }
      const command = lane.multiline ? shellcheckScript(worktree) : lane.run;
      const started = Date.now();
      const result = run(command, worktree);
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`  ${result.status === 0 ? 'ok  ' : 'FAIL'} ${lane.name} (${seconds}s)`);
      if (result.status !== 0) {
        failed.push(lane.name);
        reportLane(command, worktree, result, lane.multiline ? 0 : 4);
      }
    }
  } finally {
    execFileSync('git', ['worktree', 'remove', '--force', worktree], { cwd: ROOT, stdio: 'ignore' });
  }
  return { failed, skipped };
}

// --- Entry point -----------------------------------------------------------

/** Pre-push feeds `<local ref> <local sha> <remote ref> <remote sha>` on stdin. */
function commitsFromStdin() {
  let input = '';
  try { input = readFileSync(0, 'utf8'); } catch { input = ''; }
  const shas = [];
  for (const line of input.split('\n')) {
    const [, localSha] = line.split(/\s+/);
    if (localSha && !ZERO.test(localSha) && !shas.includes(localSha)) shas.push(localSha);
  }
  return shas;
}

const argv = process.argv.slice(2);
const commits = argv.includes('--stdin')
  ? commitsFromStdin()
  : (argv.length ? argv : ['HEAD']).map(ref =>
      execFileSync('git', ['rev-parse', ref], { cwd: ROOT, encoding: 'utf8' }).trim());

if (!commits.length) {
  console.log('push-gate: nothing to validate');
  process.exit(0);
}

const broken = [];
const notRun = [];
for (const sha of commits) {
  const subject = execFileSync('git', ['log', '-1', '--format=%s', sha], { cwd: ROOT, encoding: 'utf8' }).trim();
  const { failed, skipped } = validate(sha, subject);
  broken.push(...failed.map(name => `${sha.slice(0, 7)} ${name}`));
  notRun.push(...skipped);
}

if (notRun.length)
  console.log(`\npush-gate: ${notRun.length} lane(s) could not run here and are unverified: ${[...new Set(notRun)].join(', ')}`);
if (broken.length) {
  console.log(`\npush-gate: these lanes would fail on GitHub:`);
  for (const lane of broken) console.log(`  ${lane}`);
  console.log('Fix them, or push with --no-verify to send them anyway.');
  process.exit(1);
}
console.log('\npush-gate: every lane CI runs passes on the pushed commit');
