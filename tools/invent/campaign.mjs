// Plan 05 package 7c: run the search per warranted target.
//
//   node tools/invent/campaign.mjs [--target=foxy,bb] [--gens=12] [--pop=24]
//                                  [--inner=120] [--admit=1200] [--out=DIR]
//
// Two seed cohorts on purpose. The inner cohort drives selection cheaply; only
// finalists are re-scored at the 1200-seed admission gate, so a frontier entry
// is never promoted on the cheap number. Both are reported.
//
// SCOPE: privileged surface, upper bound, refutation instrument. A survivor is
// NOT a route. Its privileged-read manifest names the sensors a real controller
// would need, and a survivor whose decisive reads are all unobservable is a
// negative of the second kind: winnable in principle, unobservable in practice.
import { mkdirSync, writeFileSync } from 'node:fs';
import * as C from '@fnaf2-1020/core/mechanics';
import { canonicalJson, stableHash } from '@fnaf2-1020/core/contracts';
import {
  ADMISSION_SEEDS, evaluate, rollout, reactiveRollout, EMPTY_GENOME,
  paretoFront, provenanceManifest,
} from './search.mjs';
import { mutate, crossover, randomGenome, classifyFamily, validateGenome }
  from './policy-lang.mjs';
import { REACTIVE_GENOME } from './reference-genome.mjs';
import { singleThreat } from './targets.mjs';

const argOf = (name, fallback) => {
  const found = process.argv.find(a => a.startsWith(`--${name}=`));
  return found ? found.split('=')[1] : fallback;
};
const TARGETS = String(argOf('target', 'foxy,bb')).split(',').filter(Boolean);
const GENS = Number(argOf('gens', 12));
const POP = Number(argOf('pop', 24));
const INNER = Number(argOf('inner', 120));
const ADMIT = Number(argOf('admit', ADMISSION_SEEDS));
const OUT = argOf('out', 'captures/invent');

function seededRng(seed) {
  let state = seed >>> 0;
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

const key = genome => stableHash(genome);

function searchTarget(target, rng) {
  const customNight = singleThreat(target);
  const score = (genome, seeds) =>
    evaluate(s => rollout(genome, { night: 7, seed: s, customNight }), { seeds });

  // Controls, every generation. A "solved" claim always has a floor beside it.
  const controls = {
    empty: score(EMPTY_GENOME, INNER),
    reactive: evaluate(s => reactiveRollout({ night: 7, seed: s, customNight }), { seeds: INNER }),
    random: score(randomGenome(rng), INNER),
  };

  // Seeded with the reference policy: the bar is beating reaction, not beating
  // nothing. Random genomes fill the rest so the seed cannot monopolise.
  let population = [REACTIVE_GENOME,
    ...Array.from({ length: POP - 1 }, () => randomGenome(rng, { rules: 3 + Math.floor(rng() * 6) }))];

  const pruningLog = [];
  const seen = new Set();
  let evaluated = [];

  for (let gen = 0; gen < GENS; gen++) {
    const scored = [];
    for (const genome of population) {
      const family = classifyFamily(genome);
      if (family) {
        pruningLog.push({ gen, reason: 'known-family', family: family.id, why: family.why });
        continue;
      }
      const id = key(genome);
      if (seen.has(id)) { pruningLog.push({ gen, reason: 'duplicate-genome' }); continue; }
      seen.add(id);
      scored.push({ genome, result: score(genome, INNER) });
    }
    evaluated = [...evaluated, ...scored];
    // Rank by survival, then fewer inputs, then fewer rules.
    scored.sort((a, b) => b.result.rate - a.result.rate ||
      a.result.meanInputs - b.result.meanInputs ||
      a.genome.rules.length - b.genome.rules.length);
    const elite = scored.slice(0, Math.max(2, Math.floor(POP / 4)));
    if (!elite.length) { population = [REACTIVE_GENOME]; continue; }
    const next = elite.map(entry => entry.genome);
    while (next.length < POP) {
      const a = elite[Math.floor(rng() * elite.length)].genome;
      const b = elite[Math.floor(rng() * elite.length)].genome;
      next.push(rng() < 0.5 ? mutate(a, rng) : mutate(crossover(a, b, rng), rng));
    }
    population = next;
  }

  // Only the inner-cohort leaders pay for the admission gate.
  const leaders = [...evaluated]
    .sort((a, b) => b.result.rate - a.result.rate)
    .slice(0, 6);
  const admitted = leaders.map(entry => ({
    genome: entry.genome, inner: entry.result,
    result: score(entry.genome, ADMIT),
  }));
  const reactiveAdmitted = evaluate(
    s => reactiveRollout({ night: 7, seed: s, customNight }), { seeds: ADMIT });

  return {
    target, customNight, generations: GENS, population: POP,
    innerSeeds: INNER, admissionSeeds: ADMIT,
    controls, reactiveAdmitted,
    front: paretoFront(admitted).map(entry => ({
      rate: entry.result.rate, innerRate: entry.inner.rate,
      meanInputs: entry.result.meanInputs, rules: entry.genome.rules.length,
      deaths: entry.result.deaths,
      beatsReaction: entry.result.rate > reactiveAdmitted.rate,
      genome: entry.genome,
      manifest: provenanceManifest(entry.genome),
    })),
    pruned: pruningLog.length,
    pruningLog: pruningLog.slice(0, 200),
  };
}

mkdirSync(OUT, { recursive: true });
const rng = seededRng(0x5eed);
for (const target of TARGETS) {
  const started = Date.now();
  const report = searchTarget(target, rng);
  const path = `${OUT}/frontier-${target}.json`;
  writeFileSync(path, canonicalJson({ schema: 'invention-frontier-v1', ...report }));
  const best = report.front.reduce((a, b) => (b.rate > (a?.rate ?? -1) ? b : a), null);
  console.log(`\ntarget ${target}  (${((Date.now() - started) / 1000).toFixed(1)}s) -> ${path}`);
  console.log(`  controls  empty ${(report.controls.empty.rate * 100).toFixed(1)}%  ` +
    `random ${(report.controls.random.rate * 100).toFixed(1)}%  ` +
    `reactive ${(report.controls.reactive.rate * 100).toFixed(1)}% (inner)`);
  console.log(`  reactive at the ${ADMIT}-seed admission gate: ` +
    `${(report.reactiveAdmitted.rate * 100).toFixed(1)}%  ` +
    `${JSON.stringify(report.reactiveAdmitted.deaths)}`);
  console.log(`  frontier ${report.front.length} entries, ${report.pruned} pruned`);
  if (best) {
    console.log(`  best ${(best.rate * 100).toFixed(1)}% at ${ADMIT} seeds ` +
      `(inner ${(best.innerRate * 100).toFixed(1)}%), ${best.rules} rules, ` +
      `beatsReaction=${best.beatsReaction}`);
    console.log(`    deaths ${JSON.stringify(best.deaths)}`);
    console.log(`    no-known-observable: ${best.manifest.noKnownObservable.join(', ') || 'none'}`);
  }
  if (!best || !best.beatsReaction)
    console.log(`  RESULT: nothing in the searched grammar beat reaction on ${target}.`);
}
