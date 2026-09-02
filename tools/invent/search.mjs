// Plan 05 package 7a: the invention search harness.
//
// A rollout is `interpret` -> semantic action -> exact engine, seeded the same
// way as `tools/minus7/search.mjs`. The engine is the authority; the language
// never sees a transition it did not cause.
//
// SCOPE: this searches the PRIVILEGED surface and is a refutation instrument,
// an upper bound. A survivor here is not a route -- it is a statement that the
// target is not refuted, plus (via the privileged-read manifest) the list of
// sensors a real controller would need. Nothing here is device-promotable.
import * as C from '@fnaf2-1020/core/mechanics';
import { Sim } from '@fnaf2-1020/core/mechanics';
import { view, ACTIONS, run } from '../minus7/sim.mjs';
import { decide } from '../minus7/policy.mjs';
import {
  POLICY_LANG_SCHEMA, REGISTER_COUNT, interpret, validateGenome, randomGenome,
  classifyFamily, provenanceManifest,
} from './policy-lang.mjs';

// Package 7a: the admission gate is 1200 seeds, reused from the Minus 7 search.
export const ADMISSION_SEEDS = 1200;
const GUARD = 4000;

/** The negative-control floor: a policy that never does anything. */
export const EMPTY_GENOME = validateGenome({
  schema: POLICY_LANG_SCHEMA, rules: [], fallback: 'WAIT',
});

export const constantsFor = (night, customNight = null) => ({
  safeD: 20 - C.peakAi(night, 'foxy', customNight),
  drain: C.boxDrainFrames(night),
});

/** One night. Returns survival plus the cost terms the Pareto front uses. */
export function rollout(genome, { night = 7, seed = 0, customNight = null } = {}) {
  const sim = new Sim({ night, seed, ...(customNight ? { customNight } : {}) });
  const constants = constantsFor(night, customNight);
  let registers = new Array(REGISTER_COUNT).fill(0);
  let guard = 0, inputs = 0;
  while (sim.alive && !sim.won && guard++ < GUARD) {
    const observation = view(sim);
    const step = interpret(genome, observation, { registers, constants });
    registers = step.registers;
    const plan = ACTIONS[step.action](observation);
    inputs += plan.steps.length;
    run(sim, plan);
  }
  return { won: sim.won, frames: sim.frame, inputs,
    death: sim.death?.reason ?? null };
}

/** The reactive baseline, run through the same harness for a fair comparison. */
export function reactiveRollout({ night = 7, seed = 0, customNight = null } = {}) {
  const sim = new Sim({ night, seed, ...(customNight ? { customNight } : {}) });
  let guard = 0, inputs = 0;
  while (sim.alive && !sim.won && guard++ < GUARD) {
    const observation = view(sim);
    const plan = ACTIONS[decide(observation, night, customNight)](observation);
    inputs += plan.steps.length;
    run(sim, plan);
  }
  return { won: sim.won, frames: sim.frame, inputs,
    death: sim.death?.reason ?? null };
}

/** Survival over a seeded cohort. Deaths are reported, never averaged away. */
export function evaluate(runner, { seeds = ADMISSION_SEEDS, ...options } = {}) {
  let won = 0, inputs = 0, frames = 0;
  const deaths = {};
  for (let seed = 0; seed < seeds; seed++) {
    const result = runner(seed);
    if (result.won) won++;
    else if (result.death) deaths[result.death] = (deaths[result.death] ?? 0) + 1;
    inputs += result.inputs;
    frames += result.frames;
  }
  return { seeds, won, rate: won / seeds, deaths,
    meanInputs: inputs / seeds, meanFrames: frames / seeds, ...options };
}

const registersUsed = genome => {
  const used = new Set();
  for (const rule of genome.rules) if (rule.set !== undefined) used.add(rule.set);
  return used.size;
};

/**
 * Pareto front over (survival up, inputs down, registers down, rules down).
 * A candidate survives only if nothing dominates it on every axis at once.
 */
export function paretoFront(candidates) {
  const axes = candidate => [-candidate.result.rate, candidate.result.meanInputs,
    registersUsed(candidate.genome), candidate.genome.rules.length];
  return candidates.filter((candidate, index) => !candidates.some((other, j) => {
    if (index === j) return false;
    const a = axes(candidate), b = axes(other);
    return b.every((value, k) => value <= a[k]) && b.some((value, k) => value < a[k]);
  }));
}

/**
 * One search generation with its controls attached. The empty policy and a
 * random-genome baseline run EVERY generation, so a "solved" claim always has
 * a floor printed beside it.
 */
export function generation(population, { night, customNight, seeds, rng }) {
  const admitted = [];
  const pruned = [];
  for (const genome of population) {
    const family = classifyFamily(genome);
    if (family) { pruned.push({ genome, family }); continue; }
    admitted.push({ genome,
      result: evaluate(seed => rollout(genome, { night, seed, customNight }), { seeds }) });
  }
  const controls = {
    empty: evaluate(seed => rollout(EMPTY_GENOME, { night, seed, customNight }), { seeds }),
    random: evaluate(seed => rollout(randomGenome(rng), { night, seed, customNight }), { seeds }),
    reactive: evaluate(seed => reactiveRollout({ night, seed, customNight }), { seeds }),
  };
  return { admitted, pruned, controls, front: paretoFront(admitted) };
}

export { provenanceManifest };
