// Plan 05 package 8 gate: rule ablation.
//
// The load-bearing check is the one the branch floor cannot make. A rule that
// fires on EVERY decision and changes nothing is dead weight, and the 7c
// degenerate candidate was exactly that shape wearing a 2.3-2.5% branch rate.
// So the fixtures here are built to separate "the branch fired" from "the
// branch mattered", which is the whole point of ablating.
import * as C from '@fnaf2-1020/core/mechanics';
import { POLICY_LANG_SCHEMA, validateGenome, serialize } from './policy-lang.mjs';
import { evaluate, rollout } from './search.mjs';
import { ablate, ablateRules, minimizeGenome, withoutRule, withoutRules }
  from './ablate.mjs';
import { REACTIVE_GENOME } from './reference-genome.mjs';
import { singleThreat } from './targets.mjs';

let failures = 0;
const ok = (what, condition) => {
  if (!condition) { failures++; console.error(`FAIL  ${what}`); }
  else console.log(`ok    ${what}`);
};

const SEEDS = 60;
const customNight = singleThreat('bb');
const measure = genome =>
  evaluate(seed => rollout(genome, { night: 7, seed, customNight }), { seeds: SEEDS });

const rule = (when, then) => ({ when, then });
const K = v => ({ t: 'const', v });
const F = name => ({ t: 'field', name });

// --- 1. removing a rule removes exactly that rule ----------------------------
{
  const genome = validateGenome({
    schema: POLICY_LANG_SCHEMA,
    rules: [rule(F('blackout'), 'MASK_ON'), rule(F('maskOn'), 'MASK_OFF'),
      rule(K(1), 'WIND')],
    fallback: 'WAIT',
  });
  const one = withoutRule(genome, 1);
  ok('withoutRule drops one rule and keeps the order of the rest',
    one.rules.length === 2 && one.rules[0].then === 'MASK_ON' &&
    one.rules[1].then === 'WIND');
  ok('withoutRules drops a set in one step',
    withoutRules(genome, [0, 2]).rules.length === 1);
  ok('the original genome is untouched', genome.rules.length === 3);
}

// --- 2. a rule that always fires and changes nothing is INERT ----------------
//
// This is the case the branch floor is blind to by construction: its branch
// rate is 100%, the highest possible, and it is still decoration.
{
  const decorated = validateGenome({
    schema: POLICY_LANG_SCHEMA,
    rules: [rule(K(1), 'WIND')],
    fallback: 'WIND',
  });
  const report = ablate(decorated, { measure });
  const branch = measure(decorated);
  ok(`the decorated genome branches on 100% of decisions ` +
     `(${(branch.branchRate * 100).toFixed(0)}%)`, branch.branchRate === 1);
  ok('and its only rule is measured INERT', report.inert.length === 1 &&
    report.essential.length === 0);
  ok('so the verdict is no-load-bearing-rule, which the branch floor cannot reach',
    report.verdict === 'no-load-bearing-rule');
  ok('minimization drops it and the measured survival is unchanged',
    report.minimized.rules === 0 &&
    report.minimized.rate === report.base.rate &&
    report.minimized.meanFrames === report.base.meanFrames);
}

// --- 3. a rule that carries survival is LOAD-BEARING ------------------------
{
  const report = ablate(REACTIVE_GENOME, { measure });
  const carriers = report.rules.filter(entry => entry.loadBearing);
  ok(`the reference policy has load-bearing rules ` +
     `(${carriers.length}/${REACTIVE_GENOME.rules.length} at ${SEEDS} seeds)`,
    carriers.length > 0);
  ok('the verdict is load-bearing', report.verdict === 'load-bearing');
  ok('every rule reports its delta on both survival axes',
    report.rules.length === REACTIVE_GENOME.rules.length &&
    report.rules.every(entry => Number.isFinite(entry.deltaRate) &&
      Number.isFinite(entry.deltaMeanFrames)));
  ok('the minimized genome keeps every load-bearing rule',
    report.minimized.rules >= carriers.length);
  ok(`the minimized genome measures the same survival ` +
     `(${report.minimized.rules} of ${REACTIVE_GENOME.rules.length} rules, ` +
     `${(report.base.meanFrames / C.FPS).toFixed(1)}s)`,
    report.minimized.rate === report.base.rate &&
    report.minimized.meanFrames === report.base.meanFrames);
  console.log(`      essential rules: ${report.essential.join(', ') || 'none'}`);
  console.log(`      minimization: ${report.minimized.method}, ` +
    `dropped ${REACTIVE_GENOME.rules.length - report.minimized.rules}`);
}

// --- 4. a delta that is not survival is reported, not swallowed -------------
//
// Appending an unreachable rule to the reference policy must be inert on
// survival AND cost nothing; the point of the check is that the fields exist
// and are populated, so a rule that moves inputs or cause of death without
// moving survival stays visible in the artifact.
{
  const padded = validateGenome({
    ...structuredClone(REACTIVE_GENOME),
    rules: [...structuredClone(REACTIVE_GENOME.rules),
      rule({ t: 'cmp', op: '>', a: F('frame'), b: K(10 ** 9) }, 'SWEEP')],
  });
  const pass = ablateRules(padded, { measure });
  const appended = pass.rules.at(-1);
  ok('an unreachable rule is inert on survival', !appended.loadBearing);
  ok('and every entry carries its input-cost and death-shape deltas',
    pass.rules.every(entry => Number.isFinite(entry.deltaMeanInputs) &&
      typeof entry.deathsChanged === 'boolean'));
  const minimized = minimizeGenome(padded, { measure, ablation: pass });
  ok(`the unreachable rule is dropped (${minimized.method})`,
    minimized.genome.rules.length < padded.rules.length);
  ok('the padded genome is not mutated by ablation',
    serialize(padded).includes('1000000000'));
}

if (failures) { console.error(`ablation: ${failures} check(s) failed`); process.exitCode = 1; }
else console.log(`ablation: rule deltas, inert detection, minimization proof and ` +
  `non-survival reporting pass at ${SEEDS} seeds`);
