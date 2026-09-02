// Plan 05 package 8: rule ablation.
//
// WHY THIS EXISTS. Package 7c's first gradient run produced a candidate at a
// mean 140.1 s against reaction's 49.4 s, still 0% clears, and it was
// degenerate: THREE different rule sets produced identical survival, so the
// rules were decoration on a fallback that did all the work. Neither duplicate
// control could see it. The syntactic one asks whether a rule reads an
// observation and these do; the behavioural one prunes below a declared branch
// floor and these fire on 2.3-2.5% of decisions, above the 1% floor. Raising
// the floor until it pruned would be tuning a control to produce a desired
// answer, so `fab5969` left the floor alone, recorded that the control did not
// catch it, and named the correct instrument: drop each rule and measure the
// survival delta. This is that instrument.
//
// WHAT A ZERO DELTA IS. A statement about a COHORT, never a proof that a rule
// does nothing -- every number here carries its seed count. "Inert" means the
// survival axis did not move: rate and mean frames alive, which is the axis
// package 8 minimizes on. A rule that changed input cost or cause of death
// without changing survival is REPORTED, not quietly called harmless.
import { readsOf, validateGenome } from './policy-lang.mjs';

export const ABLATION_SCHEMA = 'rule-ablation-v1';

/** The genome with one rule removed. Rule order is semantics; the rest holds. */
export function withoutRule(genome, index) {
  return withoutRules(genome, [index]);
}

/** The genome with a set of rules removed, in one step. */
export function withoutRules(genome, indices) {
  validateGenome(genome);
  const drop = new Set(indices);
  const next = structuredClone(genome);
  next.rules = next.rules.filter((_, index) => !drop.has(index));
  return validateGenome(next);
}

const sameSurvival = (a, b) => a.rate === b.rate && a.meanFrames === b.meanFrames;
// Dropped rules are described, not indexed: greedy removal renumbers the list
// as it goes, so an index means something different on each path. The original
// indices of the inert rules stay available as `inert`.
const describe = rule => ({ then: rule.then, reads: [...readsOf(rule.when)].sort() });
const sameDeaths = (a, b) => JSON.stringify(Object.entries(a.deaths ?? {}).sort()) ===
  JSON.stringify(Object.entries(b.deaths ?? {}).sort());

/**
 * One ablation pass: the survival delta of removing each rule on its own.
 *
 * @param genome  the candidate.
 * @param measure `genome -> evaluate() result`, so the caller owns the night,
 *   the Custom Night vector and the cohort size and this module owns none of it.
 */
export function ablateRules(genome, { measure }) {
  validateGenome(genome);
  const base = measure(genome);
  const rules = genome.rules.map((rule, index) => {
    const result = measure(withoutRule(genome, index));
    const deltaRate = base.rate - result.rate;
    const deltaMeanFrames = base.meanFrames - result.meanFrames;
    return {
      rule: index,
      then: rule.then,
      reads: [...readsOf(rule.when)].sort(),
      withoutRate: result.rate,
      withoutMeanFrames: result.meanFrames,
      deltaRate,
      deltaMeanFrames,
      // Reported, not folded into the verdict: a rule can pay for itself in
      // inputs or change what kills you without moving survival at all.
      deltaMeanInputs: base.meanInputs - result.meanInputs,
      deathsChanged: !sameDeaths(base, result),
      loadBearing: deltaRate !== 0 || deltaMeanFrames !== 0,
    };
  });
  return { seeds: base.seeds, base, rules };
}

/**
 * Drop every rule whose removal did not move survival, and PROVE the drop by
 * re-measuring rather than assuming the inert rules were independent.
 *
 * The joint drop is one extra measurement and is what happens in the ordinary
 * case. When it changes survival the inert rules were interacting -- which is a
 * finding, not an error -- and the fallback removes them one at a time under an
 * explicit evaluation budget, reporting when the budget truncated the search.
 */
export function minimizeGenome(genome, { measure, ablation, budget = 64 }) {
  const pass = ablation ?? ablateRules(genome, { measure });
  const inert = pass.rules.filter(entry => !entry.loadBearing).map(entry => entry.rule);
  if (!inert.length)
    return { genome, dropped: [], result: pass.base, method: 'nothing-inert' };

  const together = withoutRules(genome, inert);
  const joint = measure(together);
  if (sameSurvival(joint, pass.base))
    return { genome: together, method: 'joint', result: joint,
      dropped: inert.map(index => describe(genome.rules[index])) };

  let current = genome, base = pass.base, spent = 1, truncated = false;
  const dropped = [];
  for (let round = 0; round < genome.rules.length; round++) {
    let removed = false;
    for (let index = 0; index < current.rules.length; index++) {
      if (spent >= budget) { truncated = true; break; }
      const candidate = withoutRule(current, index);
      const result = measure(candidate);
      spent += 1;
      if (!sameSurvival(result, base)) continue;
      dropped.push(describe(current.rules[index]));
      current = candidate; base = result; removed = true;
      break;
    }
    if (!removed || truncated) break;
  }
  return { genome: current, dropped, result: base,
    method: truncated ? 'greedy-truncated' : 'greedy', evaluations: spent };
}

/**
 * The package 8 artifact for one candidate: which rules carry the survival,
 * which are decoration, and the minimized genome that is the thing to name.
 *
 * `verdict: 'no-load-bearing-rule'` is the finding the branch floor could not
 * reach. It says the rule list did not move survival at all, so the candidate
 * is a fixed action sequence whatever its branch rate -- reached by measurement
 * rather than by tuning a threshold until it gave the wanted answer.
 */
export function ablate(genome, { measure, budget = 64 }) {
  const pass = ablateRules(genome, { measure });
  const minimized = minimizeGenome(genome, { measure, ablation: pass, budget });
  const essential = pass.rules.filter(entry => entry.loadBearing).map(entry => entry.rule);
  return {
    schema: ABLATION_SCHEMA,
    seeds: pass.seeds,
    base: { rate: pass.base.rate, meanFrames: pass.base.meanFrames,
      meanInputs: pass.base.meanInputs, deaths: pass.base.deaths },
    rules: pass.rules,
    essential,
    inert: pass.rules.filter(entry => !entry.loadBearing).map(entry => entry.rule),
    verdict: genome.rules.length && !essential.length
      ? 'no-load-bearing-rule' : 'load-bearing',
    minimized: {
      method: minimized.method,
      rules: minimized.genome.rules.length,
      dropped: minimized.dropped,
      rate: minimized.result.rate,
      meanFrames: minimized.result.meanFrames,
      genome: minimized.genome,
    },
  };
}
