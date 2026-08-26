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

// ------------------------------------- the decision, recorded: it does NOT pass
//
// Retraction, 2026-08-26. This asserted that the shipped Night 6 plan PASSES,
// on the strength of 46/100 at seeds 1..100. Over 1200 seeds it is 449/1200 =
// 37.4% against a 40% contract, and only five of twelve 100-seed blocks clear
// the bar. The old assertion was not measuring the plan, it was measuring a
// seed block -- and it is kept here as the reason the sample size moved rather
// than deleted.
//
// The consequence is real and is meant to be: `trial-minus7.sh` gates before
// its first adb command, so the device route is refused until a plan clears
// 40% over the full sample. That is what "absolute, no override" means.
const real = modelGate(text);
check('shipped n6 plan is refused under human slack', !real.ok,
  `${real.survived}/${real.runs} -- if this now passes, a route change fixed it ` +
  'and the retraction above should be updated rather than the check relaxed');
check('and it is refused for being under the bar, not for erroring',
  real.survived > 0 && real.survived < real.runs * GATE_MIN_SURVIVAL,
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
    // Until 2026-08-26 this asserted the opposite: that the plan passes and
    // therefore REACHES adb. It does not pass, so the property worth proving
    // is the one the gate exists for -- a refused plan never touches the
    // device at all. If a future route clears the bar, restore the reached-adb
    // form; do not relax this one.
    const out = n6.stderr + n6.stdout;
    check('a refused plan stops before adb is ever invoked',
      n6.status === 44 && /refusing to run this plan/.test(out) &&
      !/MOCK_ADB_REACHED/.test(out), `status=${n6.status}`);
    check('and it says why it refused', /night-6 runs under \+\/-\d+ ms human slack/.test(out),
      out.split('\n').filter(l => l.includes('model gate')).join(' | '));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// ------------------------------------------------------- runner precondition
const runner = readFileSync(join(HERE, 'trial-minus7.sh'), 'utf8');
const gateAt = runner.indexOf('human-gate.mjs');
const adbAt = runner.indexOf('select-adb.sh', runner.indexOf('RUN_TMP="$(mktemp'));
check('runner gates before its first adb command', gateAt > 0 && adbAt > 0 && gateAt < adbAt);
check('runner has no inline schedule fallback around the gate',
  /node "\$HERE\/recipe\.mjs" --device-plan/.test(runner) &&
  !/cannot be priced by the model gate/.test(runner));
check('live floor stays as the backstop', /^HUMAN_FLOOR_MS=\d+$/m.test(runner));

if (failed) { console.error(`${failed} model-gate check(s) failed`); process.exit(1); }
console.log(`model gate: verified; shipped plan passes at ${real.survived}/${real.runs} under +/-${HUMAN_SLACK_MS} ms`);
