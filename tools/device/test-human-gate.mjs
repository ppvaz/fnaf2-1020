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

// -------------------------------------------- the decision, recorded: passes
const real = modelGate(text);
check('shipped n6 plan passes under human slack', real.ok,
  `${real.survived}/${real.runs} -- the route must clear ${Math.ceil(real.runs * GATE_MIN_SURVIVAL)}`);

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
    check('passing plan reaches adb only after its model gate', n6.status !== 44 &&
      /model gate: \d+\/\d+ night-6 runs/.test(n6.stderr + n6.stdout) &&
      /MOCK_ADB_REACHED/.test(n6.stderr + n6.stdout), `status=${n6.status}`);
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
