// Plan 16: constrained policy search over the device plan's named timing
// geometry, evaluated on the exact engine through recipe.build ->
// devicePlan -> modelGate. Dominance-pruned beam search over a small, sourced-
// floored parameter space (tools/hidpilottest.mjs SEARCH_KNOBS). No second
// simulator, no semantic-action free search (Plan 16 non-goals).
//
//   node tools/minus7/paramsearch.mjs --nights=5,6,7 [--runs=400] [--admit=1200]
//                                     [--beam=12] [--rounds=6] [--shape=correlated]
//
// The objective's first key dominates at the current margin: min over the
// searched nights of modelGate survival under `--shape`. Frontier admission is
// a --admit-seed re-evaluation; screening during beam expansion is at --runs.
import { execFileSync } from 'node:child_process';
import { build, devicePlan, replay, idleUntilMs } from '../device/recipe.mjs';
import { modelGate, jitterPlan, parsePlanText } from '../device/human-gate.mjs';
import { SEARCH_KNOBS } from '../hidpilottest.mjs';
import * as C from '../../src/config.js';

const arg = (k, d) => {
  const m = process.argv.find(a => a.startsWith(`--${k}=`));
  return m ? m.split('=')[1] : d;
};

// Each knob's admissible delta window, in ms, with the sourced floor it may
// not cross. Steps are the perturbations beam expansion tries.
export const FLOORS = {
  // off+0.25 is exactly MASK_ANIM_OFF (15 fr, config.js:487); earlier lands
  // inside the mask-off animation and hallLightOn never asserts. Later is
  // bounded by the sweep (attackSweepDeltaMs).
  attackHallDeltaMs:   { min: 0,   max: 130, step: [17, 33, 50, -17] },
  // off+0.45 recovery sweep. EARLIER is safe (more Withered coverage); later
  // is hard-pinned by the 400-fr STUN_FRAMES budget from the prior sweep.
  attackSweepDeltaMs:  { min: -100, max: 34, step: [-33, -50, -67, -17, 17] },
  // Extra recovery reset. 0 = off; a value places a monitor-down hall beat
  // that many ms into the recovery wind (needs ~1 s of wind to fund it).
  attackRstDeltaMs:    { min: 0,   max: 8300, step: [0, 6800, 7100, 7400, 7700] },
  // Clear-cycle second reset b+3.10. Bounded by the b+3.27 raise ahead of it.
  clearHall2DeltaMs:   { min: -130, max: 130, step: [17, 33, -17, -33, 50] },
  // `off` phase margin, base 900. Floor ~300 (item 8: 300 collapses the gate).
  phaseMarginDeltaMs:  { min: -400, max: 200, step: [-100, -200, 100, -50] },
  // Hall pulse length, base 130. Floor MIN_CONTACT 100 -> delta >= -30.
  hallPulseDeltaMs:    { min: -30,  max: 170, step: [33, 67, -17, 100] },
  // pkg 5: opening gains a monitor-down GF-clear flick across the frame-300
  // check. Boolean.
  openGfFlick:         { min: 0,   max: 1,  step: [1, -1] },
};
const KNOBS = Object.keys(FLOORS);

function planTextFor(night) {
  const recipe = build({ night });
  const plan = devicePlan(recipe);
  let text = `#night ${recipe.night}\n#idle-until ${idleUntilMs(recipe.night)}\n`;
  for (const [name, lines] of Object.entries(plan))
    text += `#cycle ${name} ${recipe.cycles[name].lengthMs}\n${lines.join('\n')}\n`;
  return text;
}

// Apply a parameter assignment, then evaluate every requested night. Returns
// per-night { pct, won, runs, cvar } plus `ok` (false if any night threw --
// an over-floor value that devicePlan/makeRoom rejects, which is the sourced
// constraint doing its job).
export function evalParams(params, nights, runs, shape) {
  for (const k of KNOBS) SEARCH_KNOBS[k] = params[k] || 0;
  const out = { params: { ...params }, nights: {}, ok: true };
  try {
    for (const night of nights) {
      const text = planTextFor(night);
      // per-seed outcomes for CVaR: reuse modelGate's replay but keep the
      // vector. modelGate does not expose it, so replay directly here with
      // the same jitterPlan + shape.
      const { plan, idleUntilMs: idle } = parsePlanText(text);
      const alive = [];
      for (let seed = 1; seed <= runs; seed++) {
        const { sim } = replay(jitterPlan(plan, seed, 60, shape), { night, seed, idleUntilMs: idle });
        alive.push(sim.won ? 1 : 0);
      }
      const won = alive.reduce((a, b) => a + b, 0);
      // seed-CVaR: survival over the worst decile of seed trajectories. With a
      // 0/1 outcome this is just the mean of the lowest 10% -- i.e. is the
      // worst decile all deaths (cvar 0) or does it carry some survivors.
      const dec = Math.max(1, Math.floor(runs / 10));
      const cvar = alive.slice().sort((a, b) => a - b).slice(0, dec).reduce((a, b) => a + b, 0) / dec;
      out.nights[night] = { won, runs, pct: +(100 * won / runs).toFixed(1), cvar };
    }
  } catch (e) { out.ok = false; out.error = e.message; }
  for (const k of KNOBS) SEARCH_KNOBS[k] = 0;
  return out;
}

export function baselineLadder(nights, runs, shape = 'iid') {
  const r = evalParams({}, nights, runs, shape);
  const lad = {};
  for (const n of nights) lad[n] = r.nights[n].pct;
  return lad;
}

const minPct = (r, nights) => Math.min(...nights.map(n => r.nights[n].pct));
function dominates(a, b, nights) {  // a dominates b: >= on every night pct AND cvar, > somewhere
  const axes = nights.flatMap(n => [a.nights[n].pct - b.nights[n].pct, a.nights[n].cvar - b.nights[n].cvar]);
  return axes.every(d => d >= -1e-9) && axes.some(d => d > 1e-9);
}

export function searchParams({ nights, runs = 400, beam = 12, rounds = 6, shape = 'correlated', admit = 0 } = {}) {
  const zero = Object.fromEntries(KNOBS.map(k => [k, 0]));
  let frontier = [evalParams(zero, nights, runs, shape)];
  let pool = [...frontier];
  for (let round = 0; round < rounds; round++) {
    const cand = [];
    for (const node of pool) {
      for (const k of KNOBS) {
        for (const d of FLOORS[k].step) {
          const v = (node.params[k] || 0) + d;
          if (v < FLOORS[k].min || v > FLOORS[k].max) continue;
          const params = { ...node.params, [k]: v };
          if (JSON.stringify(params) === JSON.stringify(node.params)) continue;
          const r = evalParams(params, nights, runs, shape);
          if (r.ok) cand.push(r);
        }
      }
    }
    if (!cand.length) break;
    // merge into frontier, Pareto-prune
    const all = [...frontier, ...cand];
    const kept = all.filter(x => !all.some(y => y !== x && dominates(y, x, nights)));
    frontier = kept.sort((a, b) => minPct(b, nights) - minPct(a, nights));
    pool = frontier.slice(0, beam);
    const best = frontier[0];
    console.error(`round ${round + 1}: frontier ${frontier.length}, best min ${minPct(best, nights).toFixed(1)}%  ${JSON.stringify(bestDeltas(best))}`);
  }
  // frontier admission: re-score the top candidates at `admit` seeds
  if (admit) {
    for (const node of frontier.slice(0, beam)) {
      const hi = evalParams(node.params, nights, admit, shape);
      node.admit = hi.nights;
    }
  }
  return frontier;
}
const bestDeltas = node => Object.fromEntries(Object.entries(node.params).filter(([, v]) => v));

function main() {
  const nights = arg('nights', '5,6,7').split(',').map(Number);
  const runs = +arg('runs', '400');
  const admit = +arg('admit', '0');
  const beam = +arg('beam', '12');
  const rounds = +arg('rounds', '6');
  const shape = arg('shape', 'correlated');

  console.log(`plan-16 parameter search  nights ${nights}  screen ${runs} seeds  shape ${shape}`);
  for (const sh of ['iid', 'correlated']) {
    const lad = baselineLadder(nights, runs, sh);
    console.log(`  803feb3 baseline (${sh}): ${nights.map(n => `n${n} ${lad[n]}`).join('  ')}`);
  }
  console.log('');
  const frontier = searchParams({ nights, runs, beam, rounds, shape, admit });
  console.log(`\nPareto frontier (${frontier.length} members), best-min first:`);
  for (const node of frontier.slice(0, 8)) {
    const line = nights.map(n => `n${n} ${node.nights[n].pct}%`).join('  ');
    console.log(`  min ${minPct(node, nights).toFixed(1)}%  ${line}   ${JSON.stringify(bestDeltas(node))}`);
    if (node.admit)
      console.log(`      @${admit}: ${nights.map(n => `n${n} ${node.admit[n].pct}%`).join('  ')}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('paramsearch.mjs')) main();
