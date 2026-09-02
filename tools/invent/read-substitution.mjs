// Plan 05 package 8: read substitution -- does a survivor need a read's VALUE,
// or only the behaviour that read happens to schedule?
//
//   node tools/invent/read-substitution.mjs [--field=foxyD] [--seeds=1200]
//                                           [--target=foxy] [--grid=-6..6]
//
// Rule ablation asks which RULES carry survival. This asks which READS do. A
// read whose value can be replaced by a constant without losing survival is not
// a sensor requirement: the rule that consults it is really acting on a
// schedule, and the controller can run that schedule open-loop on that axis.
//
// This is an INTERROGATION of an existing survivor, not a search. It reports
// the whole grid, never the best cell, because reporting the best cell of a
// swept constant is the timing-knob move Plan 16 closed by negative.
import { readFileSync } from 'node:fs';
import * as C from '@fnaf2-1020/core/mechanics';
import { ADMISSION_SEEDS, evaluate, rollout, reactiveRollout } from './search.mjs';
import { validateGenome, provenanceManifest, readsOf } from './policy-lang.mjs';
import { singleThreat } from './targets.mjs';

const argOf = (name, fallback) => {
  const found = process.argv.find(a => a.startsWith(`--${name}=`));
  return found ? found.split('=')[1] : fallback;
};
const FIELD = argOf('field', 'foxyD');
const TARGET = argOf('target', 'foxy');
const SEEDS = Number(argOf('seeds', ADMISSION_SEEDS));
const FRONTIER = argOf('frontier', `captures/invent/frontier-${TARGET}.json`);
const [gridLo, gridHi] = String(argOf('grid', '-6..6')).split('..').map(Number);

/** Replace every read of `field` with a constant, leaving the rest intact. */
function substitute(node, field, value) {
  if (!node || typeof node !== 'object') return node;
  if (node.t === 'field' && node.name === field) return { t: 'const', v: value };
  const copy = Array.isArray(node) ? [...node] : { ...node };
  for (const key of ['a', 'b', 'x']) if (copy[key]) copy[key] = substitute(copy[key], field, value);
  if (copy.xs) copy.xs = copy.xs.map(child => substitute(child, field, value));
  return copy;
}

// Dead reckoning: `foxyD` is not observable, but it is largely CAUSED by the
// controller. D rises ~1/s, a hall flash resets it while Foxy is in the hall
// (g745), and a blackout pauses it (g872-874). A controller that remembers when
// it last flashed can estimate D from its own action history and the clock,
// with no sensor at all. Two sourced leaks make it an estimate rather than a
// reading: D also decays 1 per 0.5 s of hall light while Foxy is in PARTS
// (which needs `foxyLoc`, unobservable), and gains an extra +1/s while masked
// with the threshold clear. Whether that drift matters is what this measures.
//
// `ticksSince(0)` counts frames since the register was last written, and the
// HALL_FLASH rule writes it -- so the estimate resets exactly when the
// controller acts, which is the same event that resets the real D.
const DEAD_RECKON = {
  t: 'arith', op: 'floor',
  a: { t: 'arith', op: '/', a: { t: 'ticksSince', i: 0 }, b: { t: 'const', v: C.FPS } },
};

function deadReckon(node, field) {
  if (!node || typeof node !== 'object') return node;
  if (node.t === 'field' && node.name === field) return structuredClone(DEAD_RECKON);
  const copy = Array.isArray(node) ? [...node] : { ...node };
  for (const key of ['a', 'b', 'x']) if (copy[key]) copy[key] = deadReckon(copy[key], field);
  if (copy.xs) copy.xs = copy.xs.map(child => deadReckon(child, field));
  return copy;
}

const front = JSON.parse(readFileSync(FRONTIER, 'utf8')).front;
const entry = front.reduce((best, candidate) =>
  candidate.rate > (best?.rate ?? -1) ? candidate : best, null);
if (!entry) throw new Error(`no frontier entry in ${FRONTIER}`);

// Interrogate the MINIMIZED genome: the rules ablation proved carry survival.
const essential = new Set(entry.ablation.essential);
const minimized = validateGenome({
  ...entry.genome,
  rules: entry.genome.rules.filter((_, index) => essential.has(index)),
});
const customNight = singleThreat(TARGET);
const score = genome =>
  evaluate(seed => rollout(genome, { night: 7, seed, customNight }), { seeds: SEEDS });

const usesField = minimized.rules.some(rule => readsOf(rule.when).has(FIELD));
const base = score(minimized);
const reaction = evaluate(seed => reactiveRollout({ night: 7, seed, customNight }), { seeds: SEEDS });

console.log(`read substitution on \`${FIELD}\`, target ${TARGET}, ${SEEDS} seeds`);
console.log(`  minimized genome: ${minimized.rules.length} rules, ` +
  `reads ${FIELD}: ${usesField}`);
console.log(`  baseline (reads ${FIELD}):  ${(base.rate * 100).toFixed(1)}%  ` +
  `mean alive ${(base.meanFrames / C.FPS).toFixed(1)}s  ${JSON.stringify(base.deaths)}`);
console.log(`  reactive control:          ${(reaction.rate * 100).toFixed(1)}%  ` +
  `mean alive ${(reaction.meanFrames / C.FPS).toFixed(1)}s`);
console.log(`\n  ${FIELD} replaced by a constant (whole grid, not the best cell):`);

const grid = [];
for (let value = gridLo; value <= gridHi; value++) {
  const variant = validateGenome({
    ...minimized,
    rules: minimized.rules.map(rule => ({ ...rule, when: substitute(rule.when, FIELD, value) })),
  });
  const result = score(variant);
  grid.push({ value, rate: result.rate, meanFrames: result.meanFrames, deaths: result.deaths });
  console.log(`    ${FIELD}=${String(value).padStart(3)}  ` +
    `${(result.rate * 100).toFixed(1).padStart(5)}%  ` +
    `mean ${(result.meanFrames / C.FPS).toFixed(1).padStart(5)}s  ${JSON.stringify(result.deaths)}`);
}

const best = grid.reduce((a, b) => (b.rate > a.rate ? b : a), grid[0]);
const retained = best.rate / (base.rate || 1);
console.log(`\n  VERDICT: best constant retains ${(retained * 100).toFixed(1)}% of ` +
  `the baseline's survival (${(best.rate * 100).toFixed(1)}% vs ${(base.rate * 100).toFixed(1)}%).`);
if (best.rate >= base.rate * 0.95)
  console.log(`  \`${FIELD}\` is NOT a sensor requirement here: a constant reproduces the ` +
    `survival, so the rule acts on a schedule and the axis can run open-loop.`);
else if (best.rate <= reaction.rate)
  console.log(`  \`${FIELD}\` is LOAD-BEARING: no constant beats the reactive control.`);
else
  console.log(`  \`${FIELD}\` is PARTIALLY load-bearing: a constant recovers some but not all ` +
    `of the survival. The remainder is what observing it actually buys.`);

// --- Dead-reckoned estimate, the honest alternative to a constant ----------
const reckoned = validateGenome({
  ...minimized,
  rules: minimized.rules.map(rule => ({
    ...rule,
    when: deadReckon(rule.when, FIELD),
    // The flash rule stamps the register, so the estimate resets on the same
    // action that resets the real counter.
    ...(rule.then === 'HALL_FLASH' ? { set: 0 } : {}),
  })),
});
const reckonResult = score(reckoned);
console.log(`\n  ${FIELD} replaced by DEAD RECKONING (frames since own last ` +
  `HALL_FLASH, no sensor):`);
console.log(`    ${(reckonResult.rate * 100).toFixed(1)}%  ` +
  `mean ${(reckonResult.meanFrames / C.FPS).toFixed(1)}s  ` +
  `${JSON.stringify(reckonResult.deaths)}`);
const reckonRetained = reckonResult.rate / (base.rate || 1);
console.log(`    retains ${(reckonRetained * 100).toFixed(1)}% of the baseline ` +
  `(vs ${(retained * 100).toFixed(1)}% for the best constant)`);
if (reckonResult.rate >= base.rate * 0.95)
  console.log(`    => \`${FIELD}\` does not need to be SENSED: the controller can ` +
    `track it from its own actions. The blocker is soft.`);
else if (reckonResult.rate > best.rate)
  console.log(`    => tracking beats a constant but not the true value; the gap is ` +
    `the sourced drift (Parts-light decay needs foxyLoc, masked +1/s).`);
else
  console.log(`    => tracking does not recover it; the blocker is hard.`);

const manifest = provenanceManifest(minimized);
console.log(`\n  minimized blockers: ${manifest.blockedBy.join(', ') || 'none'}`);
console.log(`  (this is a single-dial Custom Night target on the PRIVILEGED surface: ` +
  `an upper bound, not a route, and not a statement about Night 7)`);
