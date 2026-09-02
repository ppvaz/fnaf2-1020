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
import { view, ACTIONS as BASE_ACTIONS, run } from '../minus7/sim.mjs';

// --- The eviction primitive (Plan 05 package 8, added 2026-09-02) ----------
//
// WHY IT IS NEEDED. Every genome the search produced controls Foxy by
// SUPPRESSION: short `HALL_FLASH` taps that zero D and nothing more. The
// published human strategies do something the grammar could not express --
// they EVICT him. The mechanic (plant-model.js:712-724, g745/g855/g846):
//
//   while the hall light is on him:  exposure++ AND D = 0 every frame,
//                                    and pinUntil = now + 50 is refreshed
//   once the light is off:           exposure > 100*night AND 50 frames of
//                                    darkness  ->  retreat, exposure = 0,
//                                    D = 0, and he cannot move for
//                                    500 + Random(500) frames
//
// Three things follow that suppression cannot buy. Holding is strictly better
// for D than tapping (D is zeroed every lit frame, not just once). Exposure
// ACCUMULATES across separate holds -- it only resets on retreat or arrival --
// so eviction can be paid for in rounds, which is the "three rounds" of the
// published strategy. And the retreat window is a GUARANTEED safe interval:
// while he is in Parts before `readyAt` he cannot advance or lock on at all,
// which is the only place 5 continuous masked ticks (VENT_MASK_TICKS) are safe
// against Balloon Boy.
//
// `HALL_BANK` is one round: 300 lit frames, then 60 dark. 300 banks toward the
// 700 threshold on night 7 and zeroes D throughout; the 60-frame tail exceeds
// FOXY_HALL_PIN_FRAMES = 50, so the round that crosses the threshold is also
// the round that triggers the retreat rather than deferring it.
//
// It is defined here, not in `tools/minus7/sim.mjs`, so the Minus 7 beam
// search's own action space is unchanged.
export const INVENT_ACTIONS = Object.freeze({
  HALL_BANK: () => ({ frames: 360,
    steps: [[0, 'press', 'light'], [300, 'release', 'light']] }),
});

export const ACTIONS = Object.freeze({ ...BASE_ACTIONS, ...INVENT_ACTIONS });
import { decide } from '../minus7/policy.mjs';
import {
  POLICY_LANG_SCHEMA, REGISTER_COUNT, interpret, validateGenome, randomGenome,
  provenanceManifest,
} from './policy-lang.mjs';
import { classifyFamily } from './closed-families.mjs';

// Package 7a: the admission gate is 1200 seeds, reused from the Minus 7 search.
export const ADMISSION_SEEDS = 1200;
const GUARD = 4000;

/** The negative-control floor: a policy that never does anything. */
export const EMPTY_GENOME = validateGenome({
  schema: POLICY_LANG_SCHEMA, rules: [], fallback: 'WAIT',
});

export const constantsFor = (night, customNight = null) => {
  const ai = C.peakAi(night, 'foxy', customNight);
  return {
    // The index's `Largest always-safe D = 20 - AI`: the highest RAW D at which
    // the roll `21 + Random(0..4) - D <= AI` (g337) still cannot fire.
    safeD: 20 - ai,
    // The FIRING threshold, one higher. `decide()` compares its safeD against a
    // PROJECTED D (`foxyD + seconds until the next check`), so using the raw
    // always-safe value there fires a full second early on every cycle. That is
    // not free: measured 2026-09-02 on the foxy single-dial target, the shipped
    // comparison flashes every 1.14s against a mechanic needing only faster
    // than 4s, consumes 2944 of the 3000-frame light budget, and every death in
    // the residual is at power == 0 with the flashlight dead, so g745 can never
    // zero D again. Anticipating to the firing threshold instead took the target
    // from 94.08% to 99.92% at 1200 seeds (71 deaths to 1).
    fireD: 21 - ai,
    drain: C.boxDrainFrames(night),
  };
};

/** One night. Returns survival plus the cost terms the Pareto front uses. */
export function rollout(genome, { night = 7, seed = 0, customNight = null } = {}) {
  const sim = new Sim({ night, seed, ...(customNight ? { customNight } : {}) });
  const constants = constantsFor(night, customNight);
  let registers = new Array(REGISTER_COUNT).fill(0);
  let guard = 0, inputs = 0, decisions = 0, branchFires = 0;
  while (sim.alive && !sim.won && guard++ < GUARD) {
    const observation = view(sim);
    const step = interpret(genome, observation, { registers, constants });
    registers = step.registers;
    decisions++;
    // `rule: -1` means the fallback ran, i.e. no observation-conditioned
    // branch was taken on this decision.
    if (step.rule >= 0) branchFires++;
    const plan = ACTIONS[step.action](observation);
    inputs += plan.steps.length;
    run(sim, plan);
  }
  return { won: sim.won, frames: sim.frame, inputs, decisions, branchFires,
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
  let won = 0, inputs = 0, frames = 0, decisions = 0, branchFires = 0;
  const deaths = {};
  for (let seed = 0; seed < seeds; seed++) {
    const result = runner(seed);
    if (result.won) won++;
    else if (result.death) deaths[result.death] = (deaths[result.death] ?? 0) + 1;
    inputs += result.inputs;
    frames += result.frames;
    decisions += result.decisions ?? 0;
    branchFires += result.branchFires ?? 0;
  }
  return { seeds, won, rate: won / seeds, deaths,
    meanInputs: inputs / seeds, meanFrames: frames / seeds,
    decisions, branchFires,
    branchRate: decisions ? branchFires / decisions : 0, ...options };
}

// A branch that never fires is not a branch. `classifyFamily` is syntactic --
// it asks whether a rule reads an observation -- and the first gradient run
// exploited exactly that hole: its best candidate was `when gfInHall ->
// WIND_LONG` with a HALL_FLASH fallback, and `gfInHall` is almost never true,
// so the genome was "always flash the hall" wearing a rule it never took.
// Functionally a Plan 05 static cover, syntactically not one.
//
// The floor is a declared knob, not a measurement: a genome whose branches are
// taken on fewer than this fraction of decisions is reported as an EFFECTIVE
// static cover and pruned from the frontier.
//
// It is a screen, not the verdict, and it has a known blind spot: a rule that
// fires on every decision and changes nothing passes it at a 100% branch rate.
// `tools/invent/ablate.mjs` is the instrument that reaches past it -- it drops
// each rule and measures the survival delta -- and it decides by measurement
// where raising this floor would only be tuning a control to give a wanted
// answer.
export const BRANCH_FLOOR = 0.01;

export function effectiveStaticCover(genome, result) {
  if (!genome.rules.length) return { id: 'static-cover-empty',
    why: 'no rules at all; every decision is the fallback' };
  if (result.branchRate >= BRANCH_FLOOR) return null;
  return {
    id: 'effective-static-cover',
    why: `branches fired on ${(result.branchRate * 100).toFixed(3)}% of ` +
      `${result.decisions} decisions, under the ${BRANCH_FLOOR * 100}% floor: ` +
      `this is a fixed action sequence wearing a rule it does not take`,
  };
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
