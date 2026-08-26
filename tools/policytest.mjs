// Report and check for the plans/11 policy comparison.
//
//   node tools/policytest.mjs                 # the whole comparison (slow)
//   node tools/policytest.mjs --nights        # survival by night
//   node tools/policytest.mjs --slack         # the degradation curves
//   node tools/policytest.mjs --actuator      # through the measured phone
//   node tools/policytest.mjs --assert        # the regression (fast)
//
// EVERY NUMBER THIS PRINTS IS A SIMULATOR NUMBER. `pilottest`/`hidpilottest`
// count frames and so does this: a press and a sensor read both look free
// (CLAUDE.md, "The simulator prices nothing"). `--actuator` narrows that gap
// without closing it, and none of these figures is a device clear.
import { pathToFileURL } from 'node:url';
import * as C from '../src/config.js';
import { sweep, runPolicy } from './policy.mjs';
import { POLICIES } from './policybaselines.mjs';
import { run as bbRun } from './bbtest.mjs';

const RUNS = +(process.env.POLICY_RUNS || 100);
const SLACKS = [0, 20, 40, 60, 100];
const MODELS = ['iid', 'correlated', 'common'];

// The families reported side by side. `privilege` is not decoration: a truth
// policy is an upper bound and must never be compared to a belief policy as
// though they had solved the same problem.
const FAMILIES = [
  ['minus7', 'local Minus 7 (bbtest Bot)', 'truth'],
  ['jason-10s', 'Jason-style, 10 s phase', 'belief'],
  ['jason-5s', 'Jason-style, 5 s phase', 'belief'],
  ['shooter25', 'Shooter25-style priority machine (literal)', 'truth'],
  ['shooter25-belief', 'Shooter25-style, stock-belief', 'belief'],
  ['couraeel', 'Couraeel-style emergency priority', 'truth'],
  ['couraeel-2x', 'Couraeel-style, doubled hall rate', 'truth'],
  ['couraeel-belief', 'Couraeel-style, stock-belief', 'belief'],
];
const CONTROLS = [
  ['null', 'C1 no inputs at all'],
  ['wind-only', 'C2 a perfect box and nothing else'],
  ['couraeel-inverted', 'C3 the same ladder, upside down'],
  ['minus7-no-stun', 'C4 Minus 7 with the camera flashes deleted'],
  ['shooter25-hoisted', 'C5 Shooter25 with the danger test hoisted out of Checking'],
];

const pct = (r) => `${String(r.survived).padStart(3)}/${r.runs}`;

function nightsTable() {
  console.log('\n== survival by night, exact replay, no execution error ==');
  console.log(`   (${RUNS} seeds each; simulator only)\n`);
  const nights = [1, 2, 3, 4, 5, 6, 7];
  console.log('policy'.padEnd(20) + 'priv  ' + nights.map(n => `  n${n}`).join('  '));
  for (const [key, , priv] of [...FAMILIES, ...CONTROLS.map(c => [c[0], c[1], '-'])]) {
    const cells = nights.map(n => String(sweep(POLICIES[key], { runs: RUNS, night: n }).survived)
      .padStart(4));
    console.log(key.padEnd(20) + String(priv).padEnd(6) + cells.join('  '));
  }
}

function slackTable(nights = [4, 5, 6, 7]) {
  for (const night of nights) {
    console.log(`\n== night ${night}: survival out of ${RUNS} as execution error grows ==`);
    for (const model of MODELS) {
      console.log(`\n  error shape: ${model}`);
      console.log('  ' + 'policy'.padEnd(20) +
        SLACKS.map(s => `+/-${s}ms`.padStart(9)).join(''));
      for (const [key] of FAMILIES) {
        const cells = SLACKS.map(slackMs =>
          pct(sweep(POLICIES[key], { runs: RUNS, night, slackMs, slackModel: model }))
            .padStart(9));
        console.log('  ' + key.padEnd(20) + cells.join(''));
      }
    }
  }
}

function actuatorTable(nights = [4, 5, 6, 7]) {
  console.log('\n== through tools/device/actuator.mjs (measured phone) ==');
  console.log('   launch lateness 110-300 ms, one draw per delivery frame, ' +
    'mask-seam monitor drops\n');
  console.log('policy'.padEnd(20) + nights.map(n => `night ${n}`.padStart(12)).join('') +
    '   seam drops');
  for (const [key] of FAMILIES) {
    let drops = 0;
    const cells = nights.map(n => {
      const r = sweep(POLICIES[key], { runs: RUNS, night: n, deviceActuator: true });
      drops += r.seamDrops;
      return pct(r).padStart(12);
    });
    console.log(key.padEnd(20) + cells.join('') + `   ${drops}`);
  }
}

function deathTable(night = 7) {
  console.log(`\n== night ${night}: what killed each policy (exact replay) ==\n`);
  for (const [key] of FAMILIES) {
    const r = sweep(POLICIES[key], { runs: RUNS, night });
    console.log(key.padEnd(20) + pct(r) + '  ' +
      r.deaths.map(([k, v]) => `${v}x ${k}`).join(', '));
  }
}

// ------------------------------------------------------------------- checks
function assertSuite() {
  const problems = [];
  const check = (name, cond, detail = '') => {
    if (!cond) problems.push(`${name}${detail ? ` -- ${detail}` : ''}`);
  };

  // 1. Equivalence. The Minus 7 control IS bbtest.mjs's Bot, so at zero slack
  //    and with no actuator the adapter must not change a single night.
  //    This is plans/11 work package 2's gate.
  for (let i = 0; i < 25; i++) {
    const seed = (i * 2246822519) >>> 0;
    const legacy = bbRun({ seed });
    const viaAdapter = runPolicy({ policy: POLICIES.minus7(seed, 0), night: 7, seed });
    const a = [legacy.sim.won, legacy.sim.frame, legacy.sim.death?.reason ?? null,
               legacy.sim.death?.detail ?? null];
    const b = [viaAdapter.won, viaAdapter.frame, viaAdapter.reason, viaAdapter.detail];
    check('the adapter changed a bbtest night', JSON.stringify(a) === JSON.stringify(b),
      `seed ${seed}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    if (problems.length) break;
  }

  // 2. Zero slack is an identity in every error shape, and a zero-lateness
  //    actuator is an identity for a schedule that keeps every mask -> monitor
  //    pair at or past SEAM_SAFE_MS (test-actuator.mjs makes the same claim
  //    for pilottest).
  {
    const key = (r) => JSON.stringify([r.won, r.frame, r.reason]);
    for (const name of ['minus7', 'shooter25', 'couraeel']) {
      const plain = key(runPolicy({ policy: POLICIES[name](7, 0), night: 7, seed: 7 }));
      for (const slackModel of MODELS)
        check('zero slack changed a night', plain === key(runPolicy(
          { policy: POLICIES[name](7, 0, slackModel), night: 7, seed: 7,
            slackMs: 0, slackModel })), `${name}/${slackModel}`);
    }
    const plain = key(runPolicy({ policy: POLICIES.minus7(9, 0), night: 7, seed: 9 }));
    const wrapped = runPolicy({ policy: POLICIES.minus7(9, 0), night: 7, seed: 9,
      deviceActuator: { lateMinMs: 0, lateMaxMs: 0 } });
    check('a zero-lateness actuator changed the night', plain === key(wrapped),
      `${plain} vs ${key(wrapped)}`);
    check('the Minus 7 schedule seam-dropped at zero lateness', wrapped.seamDrops === 0);
  }

  // 3. Determinism.
  {
    const one = () => JSON.stringify(runPolicy(
      { policy: POLICIES.couraeel(3, 60), night: 7, seed: 3, slackMs: 60 }));
    check('the same seed produced two different nights', one() === one());
  }

  // 4. Observation privilege. A belief policy must not be handed anything a
  //    stock Android screen cannot show: Foxy's D and Balloon Boy's route
  //    stage are the two that would silently make it an oracle.
  {
    let leaked = false;
    const spy = { name: 'spy', version: 0, observation: 'belief',
      step(obs) { if (obs.foxyD !== -1 || obs.bbStage !== -1) leaked = true; } };
    runPolicy({ policy: spy, night: 7, seed: 1 });
    check('belief mode leaked a truth-only field', !leaked);
  }

  // 5. The controls. Each of these SHOULD NOT clear night 7, and a suite that
  //    never checks that cannot tell a working policy from a working engine.
  for (const [key, why] of CONTROLS) {
    const r = sweep(POLICIES[key], { runs: 25, night: 7 });
    check(`control scored on night 7: ${why}`, r.survived === 0, pct(r));
  }

  // 6. Night 1 sanity, the other direction: night 1's AI table cannot arm
  //    Balloon Boy at all and holds Foxy's D at zero, so a baseline that
  //    cannot clear it is failing of its own defects, not of the strategy.
  for (const key of ['minus7', 'shooter25', 'couraeel']) {
    const r = sweep(POLICIES[key], { runs: 25, night: 1 });
    check(`${key} cannot clear night 1`, r.survived >= 22, pct(r));
  }

  if (problems.length) {
    console.error('policy adapter and baselines:');
    for (const p of problems) console.error('  FAIL  ' + p);
    process.exitCode = 1;
    return;
  }
  console.log('policy adapter: bbtest-equivalent, zero-error identities hold, ' +
    'belief privilege enforced, all five controls score zero on night 7');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const known = ['--assert', '--nights', '--slack', '--actuator', '--deaths'];
  const bad = args.filter(a => !known.includes(a));
  if (bad.length) throw new Error(`unknown argument: ${bad.join(', ')}`);
  if (args.includes('--assert')) { assertSuite(); }
  else {
    const all = !args.length;
    console.log(`policy comparison -- IN THE SIMULATOR. ${RUNS} seeds a cell, ` +
      `engine ${C.NIGHT_FRAMES} frames.`);
    if (all || args.includes('--nights')) nightsTable();
    if (all || args.includes('--deaths')) deathTable();
    if (all || args.includes('--slack')) slackTable();
    if (all || args.includes('--actuator')) actuatorTable();
  }
}
