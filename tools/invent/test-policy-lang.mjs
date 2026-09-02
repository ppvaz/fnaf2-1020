// Plan 05 packages 6b/6c gate.
//
// The load-bearing check is EXPRESSIVENESS: a hand-written rule list must
// reproduce `tools/minus7/policy.mjs`'s `decide()` exactly over a 200-seed
// sample. A language that cannot contain the known reactive policy cannot
// contain anything better, so this gate runs before any search does.
import * as C from '@fnaf2-1020/core/mechanics';
import { Sim } from '@fnaf2-1020/core/mechanics';
import { view, ACTIONS, run } from '../minus7/sim.mjs';
import { decide } from '../minus7/policy.mjs';
import {
  POLICY_LANG_SCHEMA, REGISTER_COUNT, interpret, serialize, parse, validateGenome,
  randomGenome, mutate, crossover, classifyFamily, provenanceManifest, readsOf,
} from './policy-lang.mjs';
import { REACTIVE_GENOME as DECIDE_GENOME, K, F, cmp, and, arith } from './reference-genome.mjs';

let failures = 0;
const ok = (what, condition) => {
  if (!condition) { failures++; console.error(`FAIL  ${what}`); }
  else console.log(`ok    ${what}`);
};

// --- 1. serialize / parse round-trips exactly --------------------------------
{
  const text = serialize(DECIDE_GENOME);
  ok('serialize/parse round-trips exactly', serialize(parse(text)) === text);
  ok('a parsed genome is deep-equal to the original',
    JSON.stringify(parse(text)) === JSON.stringify(DECIDE_GENOME));
}

// --- 2. interpreter purity ---------------------------------------------------
{
  const sim = new Sim({ night: 7, seed: 4242 });
  const obs = view(sim);
  const constants = { safeD: 20 - C.peakAi(7, 'foxy'), drain: C.boxDrainFrames(7) };
  const registers = new Array(REGISTER_COUNT).fill(0);
  const a = interpret(DECIDE_GENOME, obs, { registers, constants });
  const b = interpret(DECIDE_GENOME, obs, { registers, constants });
  ok('same observation and registers give the same action', a.action === b.action);
  ok('interpret does not mutate the caller\'s registers',
    registers.every(value => value === 0));
  ok('registers are the only retained state',
    Array.isArray(a.registers) && a.registers.length === REGISTER_COUNT);
}

// --- 3. EXPRESSIVENESS: the language contains decide() -----------------------
{
  const SEEDS = 200, NIGHT = 7;
  const constants = { safeD: 20 - C.peakAi(NIGHT, 'foxy'), drain: C.boxDrainFrames(NIGHT) };
  let steps = 0, divergences = 0;
  let firstDivergence = null;
  for (let seed = 0; seed < SEEDS; seed++) {
    const sim = new Sim({ night: NIGHT, seed });
    let guard = 0;
    while (sim.alive && !sim.won && guard++ < 4000) {
      const v = view(sim);
      const expected = decide(v, NIGHT);
      const actual = interpret(DECIDE_GENOME, v, { constants }).action;
      steps++;
      if (expected !== actual) {
        divergences++;
        if (!firstDivergence)
          firstDivergence = { seed, frame: v.frame, expected, actual };
      }
      run(sim, ACTIONS[expected](v));
    }
  }
  if (firstDivergence)
    console.error(`      first divergence ${JSON.stringify(firstDivergence)}`);
  ok(`the language reproduces decide() over ${SEEDS} seeds ` +
     `(${steps} decisions, ${divergences} divergent)`, divergences === 0);
}

// --- 4. package 6c: duplicate-policy control ---------------------------------
{
  const staticCover = validateGenome({
    schema: POLICY_LANG_SCHEMA,
    rules: [{ when: K(1), then: 'WIND' }, { when: K(1), then: 'SWEEP' }],
    fallback: 'WAIT',
  });
  const phaseSchedule = validateGenome({
    schema: POLICY_LANG_SCHEMA,
    rules: [
      { when: cmp('<', arith('mod', F('frame'), K(300)), K(40)), then: 'SWEEP' },
      { when: cmp('>=', F('hour'), K(4)), then: 'WIND_LONG' },
    ],
    fallback: 'WIND',
  });
  ok('a Plan 05 static cover is pruned as a known family',
    classifyFamily(staticCover)?.id === 'static-cover');
  ok('a Plan 06 phase schedule is pruned as a known family',
    classifyFamily(phaseSchedule)?.id === 'phase-schedule');
  ok('the reactive policy is NOT pruned as a known family',
    classifyFamily(DECIDE_GENOME) === null);
}

// --- 5. genome operators are seeded and keep the genome valid ----------------
{
  let state = 12345;
  const rng = () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const base = randomGenome(rng);
  ok('a random genome validates', !!validateGenome(base));
  let current = base;
  for (let i = 0; i < 50; i++) current = mutate(current, rng);
  ok('50 mutations keep the genome valid', !!validateGenome(current));
  ok('crossover keeps the genome valid', !!validateGenome(crossover(base, current, rng)));
}

// --- 6. privileged-read provenance (Pedro, 2026-09-02) -----------------------
{
  const manifest = provenanceManifest(DECIDE_GENOME);
  ok('every rule carries the reads that justified its decision',
    manifest.rules.length === DECIDE_GENOME.rules.length &&
    manifest.rules.every(rule => Array.isArray(rule.reads)));
  ok('the fallback-only reads are not silently credited',
    manifest.rules.every(rule => rule.reads.every(read => read.provenance)));
  const unobservable = manifest.noKnownObservable;
  ok(`the manifest names the sensors a survivor would need ` +
     `(${unobservable.join(', ') || 'none'})`, unobservable.length > 0);
  ok('foxyD has no observable counterpart and is reported as such',
    unobservable.includes('foxyD'));
  console.log(`      no-known-observable: ${unobservable.join(', ')}`);
  console.log(`      model-tagged reads:  ${[...new Set(manifest.modelReads)].join(', ') || 'none'}`);
}

if (failures) { console.error(`policy language: ${failures} check(s) failed`); process.exitCode = 1; }
else console.log('policy language: expressiveness, purity, round-trip, family control and provenance pass');
