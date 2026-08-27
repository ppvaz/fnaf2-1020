// Plan 16 package 1/3 gates: snapshot/restore fidelity, the semantic action
// layer's clone, and the harness reproducing the 803feb3 ladder on a zero
// perturbation.
import * as C from '../../src/config.js';
import { Sim } from '../../src/engine.js';
import { cloneSim, view, ACTIONS, run } from './sim.mjs';
import { searchParams, baselineLadder, evalParams } from './paramsearch.mjs';
import { enumeratePackage4 } from '../constrainedsearch.mjs';

let fails = 0;
const ok = (name, cond) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`); if (!cond) fails++; };

// --- snapshot/restore: bit-identical continuation from an arbitrary frame
{
  let mismatch = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const night = (seed % 7) + 1;
    const a = new Sim({ seed, night });
    const N = 2000 + (seed * 131) % 9000;
    for (let i = 0; i < N && a.alive && !a.won; i++) a.tick();
    const b = Sim.fromSnapshot({ seed, night }, a.snapshot());
    while (a.alive && !a.won) a.tick();
    while (b.alive && !b.won) b.tick();
    if (JSON.stringify([a.won, a.frame, a.death]) !== JSON.stringify([b.won, b.frame, b.death])) mismatch++;
  }
  ok('snapshot/restore: 60/60 bit-identical continuation', mismatch === 0);
}

// --- Package 4 enumeration is finite, constrained, and has one baseline.
{
  const candidates = enumeratePackage4();
  const baseline = candidates.filter(c => Object.values(c.params).every(v => v === 0));
  const invalidPulse = candidates.filter(c => c.params.preReadHallMs > 0 && c.params.openGfFlick !== 1);
  const invalidAge = candidates.filter(c => c.params.preReadHallMs === 0 && c.params.bangAgeFrames !== 0);
  ok('pkg-4 enumerator omits its duplicate baseline', baseline.length === 0);
  ok('pkg-4 in-read resets always include GF suppression', invalidPulse.length === 0);
  ok('pkg-4 bang-age state only controls an in-read reset', invalidAge.length === 0);
  const conditional = evalParams({ preReadHallMs: 500, openGfFlick: 1,
    bangAgeFrames: 37 }, [7], 1, 'correlated');
  ok('pkg-4 conditional read replays through modelGate', conditional.ok &&
    conditional.nights[7].runs === 1);
}

// --- cloneSim (the search branch primitive) agrees with a fresh run
{
  const s = new Sim({ seed: 7, night: 7 });
  for (let i = 0; i < 900; i++) s.tick();
  const c = cloneSim(s);
  for (let i = 0; i < 1200; i++) { s.tick(); c.tick(); }
  ok('cloneSim: 1200-tick continuation identical', JSON.stringify(s) === JSON.stringify(c));
}

// --- every semantic action compiles and runs without throwing
{
  let threw = null;
  for (const key of Object.keys(ACTIONS)) {
    try {
      const sim = new Sim({ seed: 3, night: 6 });
      for (let i = 0; i < 400; i++) sim.tick();
      run(sim, ACTIONS[key](view(sim)));
    } catch (e) { threw = `${key}: ${e.message}`; }
  }
  ok(`all ${Object.keys(ACTIONS).length} semantic actions run` + (threw ? ` (${threw})` : ''), !threw);
}

// --- Package 3 gate: a zero-perturbation search reproduces the 803feb3 ladder
//     within binomial noise, and its frontier is the single unmodified point.
{
  const RUNS = 160;
  const baseline = { 2: 66.3, 5: 62.0, 7: 26.0 };
  const lad = baselineLadder([2, 5, 7], RUNS, 'iid');
  let within = true;
  for (const n of [2, 5, 7]) {
    const se = 100 * Math.sqrt(0.25 / RUNS);         // conservative binomial SE
    if (Math.abs(lad[n] - baseline[n]) > 4.5 * se) within = false;
  }
  ok(`harness reproduces 803feb3 ladder within noise (n2 ${lad[2]} n5 ${lad[5]} n7 ${lad[7]})`, within);

  const frontier = searchParams({ nights: [6], runs: RUNS, beam: 1, rounds: 0, shape: 'iid' });
  ok('zero-perturbation search frontier is the single unmodified point',
    frontier.length === 1 && Object.keys(frontier[0].params).every(k => frontier[0].params[k] === 0));
}

console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
process.exit(fails ? 1 : 0);
