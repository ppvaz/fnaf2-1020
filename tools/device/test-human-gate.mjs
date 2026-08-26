// Mock regression for the model gate. No phone, no adb.
//
// Four claims: the plan text round-trips into replay()'s shape; the error
// injection is deterministic, bounded, and touches only offsets (a hold's
// release shares its press's draw by construction -- the duration column is
// untouched); the verdict thresholds exactly; and the shipped Night 6 plan
// PASSES under measured human slack -- the 2026-08-25 grounding after the
// Golden Freddy mask-off + raise became one measured-safe compound row.
// Plus the precondition: the runner gates BEFORE its first adb command and has
// no inline schedule fallback around the gated artifact.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlanText, jitterPlan, modelGate, HUMAN_SLACK_MS, GATE_MIN_SURVIVAL }
  from './human-gate.mjs';
import { build, devicePlan } from './recipe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const check = (name, cond, detail = '') => {
  if (!cond) { failed++; console.error(`FAIL ${name}${detail ? ` -- ${detail}` : ''}`); }
};

// ------------------------------------------------- parse: text -> plan shape
const recipe = build({ night: 6 });
const plan = devicePlan(recipe);
const text = `#night ${recipe.night}\n` + Object.entries(plan).map(([name, lines]) =>
  `#cycle ${name} ${recipe.cycles[name].lengthMs}\n${lines.join('\n')}`).join('\n') + '\n';
const { night: parsedNight, plan: parsed } = parsePlanText(text);
check('round-trips the emitted plan', JSON.stringify(parsed) === JSON.stringify(plan));
check('the plan names its own night', parsedNight === 6);
let threw = false;
try { parsePlanText('#cycle x 1000\n0 teleport monitor 100\n'); } catch { threw = true; }
check('unknown instruction refused', threw);
// The gate prices a plan against the night it names. A default of 6 would
// have gated a Night 3 plan against Night 6's AI table; see plans/13.
let unnamed = '';
try { modelGate(text.replace(/^#night 6\n/, ''), { runs: 1 }); }
catch (e) { unnamed = e.message; }
check('a plan that names no night is refused', /does not name its night/.test(unnamed), unnamed);

// -------------------------------------------------------- the error injection
const j1 = jitterPlan(parsed, 7);
const j2 = jitterPlan(parsed, 7);
const j3 = jitterPlan(parsed, 8);
check('deterministic per seed', JSON.stringify(j1) === JSON.stringify(j2));
check('seeds differ', JSON.stringify(j1) !== JSON.stringify(j3));
let bounded = true, tailsIntact = true, moved = 0, offsets = 0;
for (const name of Object.keys(parsed)) {
  for (let i = 0; i < parsed[name].length; i++) {
    const [o0, ...rest0] = parsed[name][i].split(' ');
    const [o1, ...rest1] = j1[name][i].split(' ');
    offsets++;
    if (+o1 !== +o0) moved++;
    if (+o1 < 0 || Math.abs(+o1 - +o0) > HUMAN_SLACK_MS) bounded = false;
    if (rest0.join(' ') !== rest1.join(' ')) tailsIntact = false;
  }
}
check('draws bounded by the slack and clamped', bounded);
check('only offsets move (hold durations, sweep spacing untouched)', tailsIntact);
check('draws actually move rows', moved > offsets / 2, `${moved}/${offsets}`);

// ------------------------------------------------------- verdict thresholding
const stub = (survivals) => {
  let i = 0;
  return () => ({ sim: { won: survivals[i++ % survivals.length], death: { reason: 'x', detail: 'y' } } });
};
const runs = 10;
const atBar = modelGate(text, { runs, replayFn: stub([true, true, true, true, false, false, false, false, false, false]) });
check('exactly the bar passes', atBar.ok && atBar.survived === Math.ceil(runs * GATE_MIN_SURVIVAL));
const underBar = modelGate(text, { runs, replayFn: stub([true, true, true, false, false, false, false, false, false, false]) });
check('one under the bar refuses', !underBar.ok && underBar.deaths.length === 1);

// ----------------------------------------- the decision: the repaired plan passes
//
// The prior plan was first asserted to pass on the strength of 46/100 at seeds
// 1..100. Over 1200 seeds it was 449/1200 =
// 37.4% against a 40% contract, and only five of twelve 100-seed blocks clear
// the bar. That assertion measured a seed block, not the plan. The route fix
// carries the previously omitted first Foxy reset on the post-read maskraise;
// it clears the same broad sample at 673/1200 without moving the read or sweep.
//
// Keep both sides pinned: the gate bar stays 40%, and the plan must pass the
// full sample before `trial-minus7.sh` reaches its first adb command.
const real = modelGate(text);
check('shipped n6 plan passes under human slack', real.ok,
  `${real.survived}/${real.runs} -- the route must clear the unchanged 40% bar`);
check('the broad Night 6 result stays pinned', real.survived === 673,
  `${real.survived}/${real.runs}`);

// ---------------------------------- the precondition, exercised end-to-end
// The priced invocation passes the gate, then reaches a mock adb and stops;
// this proves the ordering without touching a phone.
{
  const tmp = mkdtempSync(join(tmpdir(), 'fnaf2-gate-test-'));
  try {
    const bin = join(tmp, 'bin');
    mkdirSync(bin);
    const mockAdb = join(bin, 'adb');
    writeFileSync(mockAdb, '#!/bin/sh\necho MOCK_ADB_REACHED >&2\nexit 1\n');
    chmodSync(mockAdb, 0o755);
    const n6 = spawnSync('bash', [join(HERE, 'trial-minus7.sh'), `gate-test-${process.pid}`, '90'],
      { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`,
        TMPDIR: tmp, BB_LEFT_MODEL: join(HERE, 'hid-smoke.json') } });
    // The repaired route clears the gate, so execution reaches the first adb
    // command. The fake adb fails there; reaching its marker proves the model
    // gate no longer blocks the route without touching a phone.
    const out = n6.stderr + n6.stdout;
    check('an accepted plan reaches adb only after the gate',
      n6.status !== 44 && !/refusing to run this plan/.test(out) &&
      /MOCK_ADB_REACHED/.test(out), `status=${n6.status}`);
    check('and it reports the accepted Night 6 sample',
      /model gate: 673\/1200 night-6 runs under \+\/-60 ms human slack/.test(out),
      out.split('\n').filter(l => l.includes('model gate')).join(' | '));

    const n1 = spawnSync('bash', [join(HERE, 'trial-minus7.sh'),
      `gate-test-n1-${process.pid}`, '1'], { encoding: 'utf8', env: {
        ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp,
        BB_LEFT_MODEL: join(HERE, 'hid-smoke.json'), NIGHT: 'continue',
        CALIBRATION_STORY_NIGHT: '1', GRADE_RUN: '0',
      } });
    const n1out = n1.stderr + n1.stdout;
    check('bounded Night 1 calibration emits and gates a Night 1 plan',
      /model gate: 1189\/1200 night-1 runs/.test(n1out) &&
      /MOCK_ADB_REACHED/.test(n1out), `status=${n1.status}`);

    // A story-night run longer than one cycle is a real attempt at that night,
    // so it must name the save cursor the operator read under Continue.
    //
    // Corrected 2026-08-26. This used to assert the one-cycle bound
    // ("bounded to exactly one cycle"), which existed because nothing
    // established WHICH night Continue would resume. The bound is gone -- a
    // night cannot be cleared one cycle at a time -- but the property it
    // protected is not, so it is asserted in its new form: an unnamed cursor
    // still stops the run before adb. Nothing here machine-verifies the
    // cursor; the point is that a human must have looked and said so, and that
    // the claim lands in the manifest.
    const storyRun = (name, extraEnv) => spawnSync('bash',
      [join(HERE, 'trial-minus7.sh'), `${name}-${process.pid}`, '2'],
      { encoding: 'utf8', env: {
        ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp,
        BB_LEFT_MODEL: join(HERE, 'hid-smoke.json'), NIGHT: 'continue',
        CALIBRATION_STORY_NIGHT: '1', GRADE_RUN: '0', ...extraEnv,
      } });

    const unnamed = storyRun('gate-test-n1-unnamed', {});
    check('a multi-cycle story night refuses without a named save cursor',
      unnamed.status === 2 && /must name the save cursor/.test(unnamed.stderr) &&
      !/MOCK_ADB_REACHED/.test(unnamed.stderr + unnamed.stdout),
      `status=${unnamed.status}`);

    const mismatched = storyRun('gate-test-n1-mismatch', { STORY_CURSOR_OBSERVED: '3' });
    check('a cursor that disagrees with the requested night refuses',
      mismatched.status === 2 && /must name the save cursor/.test(mismatched.stderr) &&
      !/MOCK_ADB_REACHED/.test(mismatched.stderr + mismatched.stdout),
      `status=${mismatched.status}`);

    const named = storyRun('gate-test-n1-named', { STORY_CURSOR_OBSERVED: '1' });
    check('a named, matching cursor reaches adb after its gate',
      /MOCK_ADB_REACHED/.test(named.stderr + named.stdout) &&
      /save cursor reported as Night 1/.test(named.stderr + named.stdout),
      `status=${named.status}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// ------------------------------------------------------- runner precondition
const runner = readFileSync(join(HERE, 'trial-minus7.sh'), 'utf8');
const gateAt = runner.indexOf('human-gate.mjs');
const adbAt = runner.indexOf('select-adb.sh', runner.indexOf('RUN_TMP="$(mktemp'));
check('runner gates before its first adb command', gateAt > 0 && adbAt > 0 && gateAt < adbAt);
check('runner has no inline schedule fallback around the gate',
  /node "\$HERE\/recipe\.mjs" --device-plan "--night=\$STORY_NIGHT"/.test(runner) &&
  !/cannot be priced by the model gate/.test(runner));
check('legacy live floor does not contradict the model-gated route',
  /^HUMAN_FLOOR_MS=\d+$/m.test(runner) &&
  /\[ "\$NIGHT6_LEFT" -eq 1 \] && return 0/.test(runner));

if (failed) { console.error(`${failed} model-gate check(s) failed`); process.exit(1); }
console.log(`model gate: verified; shipped plan passes at ${real.survived}/${real.runs} under +/-${HUMAN_SLACK_MS} ms`);
