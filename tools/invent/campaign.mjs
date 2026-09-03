// Plan 05 package 7c: run the search per warranted target.
//
//   node tools/invent/campaign.mjs [--target=foxy,bb] [--gens=12] [--pop=24]
//                                  [--inner=120] [--admit=1200] [--ablate=N]
//                                  [--out=DIR]
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
import { execFileSync } from 'node:child_process';
import * as C from '@fnaf2-1020/core/mechanics';
import { canonicalJson, stableHash } from '@fnaf2-1020/core/contracts';
import {
  ADMISSION_SEEDS, evaluate, rollout, reactiveRollout, EMPTY_GENOME,
  paretoFront, provenanceManifest, effectiveStaticCover, boxPosture,
  BRANCH_FLOOR,
} from './search.mjs';
import { mutate, crossover, randomGenome, validateGenome } from './policy-lang.mjs';
import { classifyFamily, closedFamilyRegister } from './closed-families.mjs';
import { ablate } from './ablate.mjs';
import { REACTIVE_GENOME } from './reference-genome.mjs';
import { WIND_SEEDS } from './wind-seeds.mjs';
import { threatSet } from './targets.mjs';

const argOf = (name, fallback) => {
  const found = process.argv.find(a => a.startsWith(`--${name}=`));
  return found ? found.split('=')[1] : fallback;
};
const TARGETS = String(argOf('target', 'foxy,bb')).split(',').filter(Boolean);
const GENS = Number(argOf('gens', 12));
const POP = Number(argOf('pop', 24));
const INNER = Number(argOf('inner', 120));
const ADMIT = Number(argOf('admit', ADMISSION_SEEDS));
// Package 8 runs on the frontier at the admission cohort by default, so a rule
// delta is comparable to the rate printed beside it. `--ablate=0` turns it off.
const ABLATE = Number(argOf('ablate', ADMIT));
// Retained, not ignored. Package 7c's gate is "a reproducible frontier file per
// target plus the log", and `captures/` is gitignored -- a gate whose evidence
// is deleted is not a gate. Frontiers are results, not raw captures, so they
// live with the other retained evidence.
const OUT = argOf('out', 'docs/evidence/invent');

// A frontier that cannot be tied to the code that produced it is a number, not
// evidence. `factreplay.mjs` already stamps this; this did not.
//
// `exclude` lists the artifact paths THIS invocation is about to write. The
// 2026-09-03 incident: a re-run of an already-tracked frontier could never
// stamp clean, because provenance() ran while the file being rewritten sat in
// `git diff HEAD` -- the check was self-referential, and a dirty-by-construction
// stamp got committed as clean when the warning line was cut from the output.
// An artifact does not stop corresponding to its commit because the run wrote
// the artifact; sibling outputs of the same invocation are excluded for the
// same reason (they are part of this run, not pre-existing dirt).
function provenance(exclude = []) {
  const skip = new Set(exclude);
  const git = args => {
    try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
    catch { return 'UNKNOWN'; }
  };
  const modified = git(['diff', 'HEAD', '--name-only'])
    .split('\n').filter(Boolean).filter(path => !skip.has(path));
  return {
    commit: git(['rev-parse', 'HEAD']),
    // Only TRACKED modifications mean the artifact does not correspond to the
    // commit. The first version used `git status --porcelain`, which counts
    // untracked files too -- and this repo permanently carries an untracked
    // `.claude/` worktree, so `dirty` was ALWAYS true and the field was noise
    // that would have discredited every artifact it ever stamped.
    dirty: modified.length > 0,
    // Untracked files are reported separately rather than folded into `dirty`:
    // they usually do not affect the run, but an untracked module CAN be
    // imported, so the count is retained instead of discarded.
    untrackedFiles: git(['ls-files', '--others', '--exclude-standard'])
      .split('\n').filter(Boolean).length,
    node: process.version,
    producedAt: new Date().toISOString(),
    argv: process.argv.slice(2),
  };
}

function seededRng(seed) {
  let state = seed >>> 0;
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

const key = genome => stableHash(genome);

function searchTarget(target, rng) {
  const customNight = threatSet(target);
  const score = (genome, seeds) =>
    evaluate(s => rollout(genome, { night: 7, seed: s, customNight }), { seeds });
  // Package 8, per frontier survivor: which rules carry the survival and which
  // are decoration. This is what catches a candidate whose branches fire often
  // enough to clear the branch floor and still change nothing -- the 7c
  // degenerate case the floor could not reach without being tuned.
  const ablation = genome => (ABLATE > 0
    ? ablate(genome, { measure: candidate => score(candidate, ABLATE) })
    : null);

  // Controls, every generation. A "solved" claim always has a floor beside it.
  const controls = {
    empty: score(EMPTY_GENOME, INNER),
    reactive: evaluate(s => reactiveRollout({ night: 7, seed: s, customNight }), { seeds: INNER }),
    random: score(randomGenome(rng), INNER),
  };

  // Seeded with the reference policy: the bar is beating reaction, not beating
  // nothing. Random genomes fill the rest so the seed cannot monopolise.
  // Seed the CORRECTED reference alongside the shipped one. `safeD` (20 - AI)
  // is the always-safe RAW D, but the rules compare it against a PROJECTED D,
  // so it fires a second early every cycle and burns light it does not need --
  // measured 94.08% -> 99.92% on the foxy target when swapped for the firing
  // threshold `fireD` (21 - AI). Seeding both lets selection keep whichever
  // wins per target rather than inheriting the off-by-one.
  const toFire = node => {
    if (!node || typeof node !== 'object') return node;
    if (node.t === 'param' && node.name === 'safeD') return { t: 'param', name: 'fireD' };
    const copy = Array.isArray(node) ? [...node] : { ...node };
    for (const key of ['a', 'b', 'x']) if (copy[key]) copy[key] = toFire(copy[key]);
    if (copy.xs) copy.xs = copy.xs.map(toFire);
    return copy;
  };
  const corrected = validateGenome({ ...REACTIVE_GENOME,
    rules: REACTIVE_GENOME.rules.map(r => ({ ...r, when: toFire(r.when) })) });
  // The wind-bearing seeds (Pedro's ruling: there is always a box to be
  // wound) start the population on the winding side of the space, so the
  // search does not have to rediscover the RAISE->WIND chain by accident --
  // the frozen-office local optimum is exactly what random mutation lands on
  // when nothing winds. The seeds are candidates, not privileged: they are
  // scored, ablated and admitted on the same terms as everything else.
  let population = [REACTIVE_GENOME, corrected, ...WIND_SEEDS,
    ...Array.from({ length: Math.max(0, POP - 2 - WIND_SEEDS.length) },
      () => randomGenome(rng, { rules: 3 + Math.floor(rng() * 6) }))];
  while (population.length < POP) population.push(randomGenome(rng));

  const pruningLog = [];
  const seen = new Set();
  let evaluated = [];

  for (let gen = 0; gen < GENS; gen++) {
    const scored = [];
    for (const genome of population) {
      const family = classifyFamily(genome);
      if (family) {
        pruningLog.push({ gen, reason: 'known-family', family: family.id,
          rule: family.rule, plans: family.plans, detail: family.detail });
        continue;
      }
      const id = key(genome);
      if (seen.has(id)) { pruningLog.push({ gen, reason: 'duplicate-genome' }); continue; }
      seen.add(id);
      scored.push({ genome, result: score(genome, INNER) });
    }
    evaluated = [...evaluated, ...scored];
    // Rank by survival, then by SURVIVAL TIME, then cost.
    //
    // The time term is not a nicety. On a target where nothing survives yet,
    // every candidate ties at rate 0 and selection falls through to the cost
    // terms -- which selects for FEWEST INPUTS, i.e. for doing nothing. The
    // first 7c run did exactly that and reported a flat 0.0% everywhere; that
    // was a statement about this sort, not about the game. Mean frames alive
    // is a real gradient (the reactive baseline reaches a mean 401.2s of 420
    // on foxy while still scoring 0%), so it carries the search until a
    // survivor appears.
    scored.sort((a, b) => b.result.rate - a.result.rate ||
      b.result.meanFrames - a.result.meanFrames ||
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
    .sort((a, b) => b.result.rate - a.result.rate ||
      b.result.meanFrames - a.result.meanFrames)
    .slice(0, 6);
  const admitted = [];
  for (const entry of leaders) {
    const result = score(entry.genome, ADMIT);
    // Behavioural duplicate control, applied at the admission gate where the
    // decision counts are real.
    const degenerate = effectiveStaticCover(entry.genome, result);
    if (degenerate) {
      pruningLog.push({ gen: 'admission', reason: 'behavioural-duplicate',
        family: degenerate.id, detail: degenerate.why });
      continue;
    }
    admitted.push({ genome: entry.genome, inner: entry.result, result });
  }
  const reactiveAdmitted = evaluate(
    s => reactiveRollout({ night: 7, seed: s, customNight }), { seeds: ADMIT });

  return {
    target, customNight, generations: GENS, population: POP,
    innerSeeds: INNER, admissionSeeds: ADMIT, ablationSeeds: ABLATE,
    controls, reactiveAdmitted,
    // The register travels with the frontier so a reader can check any prune
    // in the log against the recorded negative that justifies it.
    closedFamilies: closedFamilyRegister(),
    front: paretoFront(admitted).map(entry => ({
      rate: entry.result.rate, innerRate: entry.inner.rate,
      meanAliveS: entry.result.meanFrames / C.FPS,
      branchRate: entry.result.branchRate,
      meanInputs: entry.result.meanInputs, rules: entry.genome.rules.length,
      deaths: entry.result.deaths,
      beatsReaction: entry.result.rate > reactiveAdmitted.rate,
      // A strictly longer mean survival at equal (zero) rate is progress, and
      // is reported separately so it can never be mistaken for a clear.
      outlivesReaction: entry.result.rate === reactiveAdmitted.rate &&
        entry.result.meanFrames > reactiveAdmitted.meanFrames,
      genome: entry.genome,
      manifest: provenanceManifest(entry.genome),
      // Package 8, Pedro's ruling: a zero-wind genome on a box-bearing target
      // is a posture, not a strategy. Annotated, never silently dropped.
      windDecisionsPerSeed: entry.result.windDecisions / ADMIT,
      boxPosture: boxPosture(entry.result),
      ablation: ablation(entry.genome),
    })),
    pruned: pruningLog.length,
    pruningLog: pruningLog.slice(0, 200),
  };
}

mkdirSync(OUT, { recursive: true });
const rng = seededRng(0x5eed);
const written = TARGETS.map(target => `${OUT}/frontier-${target}.json`);
for (const target of TARGETS) {
  const started = Date.now();
  const report = searchTarget(target, rng);
  const path = `${OUT}/frontier-${target}.json`;
  const stamped = { schema: 'invention-frontier-v1',
    provenance: provenance(written),
    rngSeed: 0x5eed, ...report };
  writeFileSync(path, canonicalJson(stamped));
  if (stamped.provenance.dirty)
    console.log(`  WARNING: working tree is dirty; this frontier does not ` +
      `correspond to commit ${stamped.provenance.commit.slice(0, 8)}`);
  const best = report.front.reduce((a, b) => (b.rate > (a?.rate ?? -1) ? b : a), null);
  console.log(`\ntarget ${target}  (${((Date.now() - started) / 1000).toFixed(1)}s) -> ${path}`);
  console.log(`  controls  empty ${(report.controls.empty.rate * 100).toFixed(1)}%  ` +
    `random ${(report.controls.random.rate * 100).toFixed(1)}%  ` +
    `reactive ${(report.controls.reactive.rate * 100).toFixed(1)}% (inner)`);
  console.log(`  reactive at the ${ADMIT}-seed admission gate: ` +
    `${(report.reactiveAdmitted.rate * 100).toFixed(1)}%  ` +
    `${JSON.stringify(report.reactiveAdmitted.deaths)}`);
  console.log(`  frontier ${report.front.length} entries, ${report.pruned} pruned ` +
    `(branch floor ${BRANCH_FLOOR * 100}%)`);
  if (best) {
    console.log(`  best ${(best.rate * 100).toFixed(1)}% at ${ADMIT} seeds ` +
      `(inner ${(best.innerRate * 100).toFixed(1)}%), ${best.rules} rules, ` +
      `mean alive ${best.meanAliveS.toFixed(1)}s vs reaction ` +
      `${(report.reactiveAdmitted.meanFrames / C.FPS).toFixed(1)}s, ` +
      `beatsReaction=${best.beatsReaction}`);
    console.log(`    deaths ${JSON.stringify(best.deaths)}`);
    const m = best.manifest;
    console.log(`    reads: ${m.availableToday.length} available today, ` +
      `${m.needsNewSensor.length} need a new sensor, ` +
      `${m.needsMeasuredAudio.length} need measured audio, ` +
      `${m.noKnownObservable.length} unobservable` +
      (m.unmapped.length ? `, ${m.unmapped.length} unmapped` : ''));
    console.log(`    fullyObservable=${m.fullyObservable}` +
      (m.blockedBy.length ? `  blockedBy: ${m.blockedBy.join(', ')}` : ''));
    if (m.candidateSensors.length)
      console.log(`    candidate sensors: ${m.candidateSensors.join(', ')}`);
    if (best.ablation)
      console.log(`    ablation (${best.ablation.seeds} seeds): ` +
        `${best.ablation.essential.length}/${best.rules} rules carry survival, ` +
        `verdict ${best.ablation.verdict}, minimized to ` +
        `${best.ablation.minimized.rules} (${best.ablation.minimized.method})`);
    for (const e of report.front)
      console.log(`    posture ${e.boxPosture.posture}` +
        (e.boxPosture.why ? ` -- ${e.boxPosture.why.split(';')[0]}` : ''));
  }
  if (!best || !best.beatsReaction)
    console.log(`  RESULT: nothing in the searched grammar beat reaction on ${target}.`);
}
