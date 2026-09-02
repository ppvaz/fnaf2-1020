// Plan 05 packages 6b/6c gate.
//
// The load-bearing check is EXPRESSIVENESS: a hand-written rule list must
// reproduce `tools/minus7/policy.mjs`'s `decide()` exactly over a 200-seed
// sample. A language that cannot contain the known reactive policy cannot
// contain anything better, so this gate runs before any search does.
import * as C from '@fnaf2-1020/core/mechanics';
import { Sim } from '@fnaf2-1020/core/mechanics';
import { OBSERVATION_BUDGET } from '@fnaf2-1020/core/control';
import { view, ACTIONS, run } from '../minus7/sim.mjs';
import { decide } from '../minus7/policy.mjs';
import {
  POLICY_LANG_SCHEMA, REGISTER_COUNT, interpret, serialize, parse, validateGenome,
  randomGenome, mutate, crossover, provenanceManifest, readsOf, structuralShape,
  OBSERVABLE_COUNTERPART,
} from './policy-lang.mjs';
import {
  CLOSED_FAMILIES, CLOSED_FAMILIES_SCHEMA, IMPLEMENTED_RULES, classifyFamily,
} from './closed-families.mjs';
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
//
// The control classifies against `tools/device/closed-families.json`, the one
// register of closures this repository keeps. The checks below are therefore
// about the REGISTER being honoured on this surface, not about a list kept
// here: the privileged search used to carry its own weaker copy, and the whole
// point of the change is that adding a family to the register now fails this
// gate until the privileged surface implements it too.
{
  ok(`the register is ${CLOSED_FAMILIES_SCHEMA} with ${CLOSED_FAMILIES.length} families`,
    CLOSED_FAMILIES_SCHEMA === 'closed-policy-families-v1' && CLOSED_FAMILIES.length > 0);
  const registered = [...new Set(CLOSED_FAMILIES.map(entry => entry.rule))].sort();
  ok(`every registered rule is implemented here (${registered.join(', ')})`,
    JSON.stringify(registered) === JSON.stringify([...IMPLEMENTED_RULES]));
  ok('every family is closed by a RECORDED negative, with citations',
    CLOSED_FAMILIES.every(entry => entry.closure === 'recorded-negative' &&
      Array.isArray(entry.citations) && entry.citations.length > 0));

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
  // Both are the SAME closure in the register -- the frame clock is not a game
  // fact -- where the old privileged list split them into two invented ids.
  ok('a Plan 05 static cover is pruned as an unconditioned schedule',
    classifyFamily(staticCover)?.id === 'unconditioned-schedule');
  ok('a Plan 06 phase schedule is pruned as the same closure',
    classifyFamily(phaseSchedule)?.id === 'unconditioned-schedule');
  const cited = classifyFamily(phaseSchedule);
  ok(`the prune cites where the negative is recorded (plans ${cited.plans.join('/')})`,
    cited.closure === 'recorded-negative' && cited.citations.length >= 3 &&
    cited.plans.includes('06'));

  // The reference policy is the search's SEED and its bar. Pruning it would
  // empty generation zero, so identity with a known shape is deliberately not
  // a match.
  ok('the reactive policy is NOT pruned; it is the declared bar',
    classifyFamily(DECIDE_GENOME) === null);

  // `timing-only-mutation`: the family the privileged list did not have.
  const bumpOneConstant = node => {
    if (!node || typeof node !== 'object') return false;
    if (node.t === 'const') { node.v += 1; return true; }
    for (const key of ['a', 'b', 'x', 'value'])
      if (node[key] && bumpOneConstant(node[key])) return true;
    for (const child of node.xs ?? []) if (bumpOneConstant(child)) return true;
    return false;
  };
  const retimed = structuredClone(DECIDE_GENOME);
  let changed = false;
  for (const rule of retimed.rules) if (!changed) changed = bumpOneConstant(rule.when);
  ok('the retimed fixture really did change a threshold',
    changed && serialize(retimed) !== serialize(DECIDE_GENOME));
  ok('the same policy at a different threshold is pruned as a swept knob',
    classifyFamily(retimed)?.id === 'timing-only-mutation');
  ok('erasing times leaves the shape identical',
    structuralShape(retimed) === structuralShape(DECIDE_GENOME));

  // A structural change is what the campaign is FOR, so it must survive. Rule
  // order is semantics here (first match wins), which is what package 7b
  // indicted.
  const reordered = structuredClone(DECIDE_GENOME);
  reordered.rules.splice(2, 0, reordered.rules.splice(6, 1)[0]);
  ok('a reordered policy is a different shape and is NOT pruned',
    structuralShape(reordered) !== structuralShape(DECIDE_GENOME) &&
    classifyFamily(reordered) === null);

  // `audio-anchored-branch` is carried and matches nothing today, for a reason
  // that is checked rather than asserted: the privileged surface reads
  // simulator ground truth, so no privileged read maps onto an audio fact.
  const audioCounterparts = Object.values(OBSERVABLE_COUNTERPART)
    .filter(fact => fact && OBSERVATION_BUDGET[fact]?.channel === 'audio');
  ok('no privileged read has an audio-channel counterpart, so the Plan 08 ' +
     'closure is carried but unreachable on this surface',
    audioCounterparts.length === 0 &&
    CLOSED_FAMILIES.some(entry => entry.rule === 'branch-on-audio-fact'));
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
