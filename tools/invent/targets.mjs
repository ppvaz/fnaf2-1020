// Plan 05 package 7b: targets and difficulty probes.
//
// THIS IS THE CAMPAIGN'S FIRST CHECK-IN POINT. Before any search runs, every
// single-threat vector gets a difficulty probe: the empty policy (the floor)
// and the reactive baseline `decide()`. A target the reactive baseline already
// clears above the threshold is recorded as "no invention needed" and skipped,
// because inventing a policy for a solved target proves nothing.
//
//   node tools/invent/targets.mjs [--seeds=1200] [--json]
//   node tools/invent/targets.mjs --assert     # short probe, gate mode
import * as C from '@fnaf2-1020/core/mechanics';
import { ADMISSION_SEEDS, evaluate, rollout, reactiveRollout, EMPTY_GENOME }
  from './search.mjs';

// Custom Night writes every dial, so a single-threat vector is one dial at the
// requested level and the rest at zero. The engine clamps each to `aiCap`, so
// the effective level is reported rather than the requested one.
export const SINGLE_THREAT_LEVEL = 20;

// Package 7b says "the ten single-threat vectors". The engine exposes ELEVEN
// dials (`C.AI_IDS`). All eleven are probed here and the discrepancy is
// recorded rather than resolved by silently dropping one -- which one the plan
// meant to exclude is not stated, and guessing would be inventing.
export const DIALS = Object.freeze([...C.AI_IDS]);

// A dial at 0 does NOT disable every character, so this vector is "one dial at
// cap", not "one threat". Two characters remain live at AI 0, both [SOURCED]:
//
//   Foxy   roll `21 + Random(0..4) - D <= Foxy AI`, operator `<=`, g337, every
//          5 s (UNIFIED-SOURCED-ENGINE-FACT-INDEX.md, "Withered Foxy",
//          engine.js:874-889). At AI 0 this is `D >= 21 + Random(0..4)`, and D
//          is a TIME counter -- +1/s unengaged, +1/s more while masked with the
//          threshold clear, drained by Parts/Service hall light (g824/g825,
//          g864, g872-874). So Foxy fires at AI 0 after ~21-25 s of neglect.
//   Puppet `Sockpuppet AI` uses bare `Random(20) <= AI`, succeeding for 0..AI,
//          i.e. (AI+1)/20 -- so 5% per roll at AI 0 [SOURCED: g494-497],
//          `PUPPET_MO_CHANCE` in config.js.
//
// The seven stalled characters use `MO_CHANCE = ai/20`, which is exactly 0 at
// AI 0, and Golden Freddy uses `Random(20) < GF AI`, also never at 0. Those
// nine ARE isolated by this vector; Foxy and the Puppet are not.
//
// Cross-checked against the community record, 2026-09-02 (Plan 05 pkg 8's
// novelty-review discipline). Technical-FNaF's Withered Foxy (FNaF 2) page
// independently gives `random(0-4)` INCLUSIVE, D starting at 0 and rising ~1/s,
// a hall flash resetting D to 0 while he is in the hall, D falling 1 per 0.5 s
// of flashlight while he is in Parts/Service, and D paused during blackouts --
// matching the sourced index above field for field. Community reports also
// state Foxy remains active at AI 0 BY DESIGN, and give the reason as keeping
// Balloon Boy meaningful in presets where BB is active and Foxy is dialled to
// 0. That is precisely the interaction the probe below measures: bb=15 with
// foxy=0 dies to FOXY at a mean 49.0 s. A loosely-worded secondary source says
// `random 0-5`; the dump and Technical-FNaF agree on 0..4, so the index stands.
//
// Consequence for reading a probe: a low score is evidence about the policy's
// TIME BUDGET -- can it afford the hall while handling this dial -- and not
// evidence that the named character is hard.
export function singleThreat(id, level = SINGLE_THREAT_LEVEL) {
  return threatSet(id, level);
}

/**
 * A target spec: one dial id, or several joined with `+` (e.g. `bb+foxy`).
 * Every named dial goes to `level`, every other to 0 -- subject to the two
 * characters a zeroed dial does not silence, above.
 */
export function threatSet(spec, level = SINGLE_THREAT_LEVEL) {
  const named = new Set(String(spec).split('+').filter(Boolean));
  for (const id of named) {
    if (!DIALS.includes(id)) throw new Error(`unknown dial ${id} in target ${spec}`);
  }
  return Object.fromEntries(DIALS.map(dial => [dial, named.has(dial) ? level : 0]));
}

// The characters a zeroed dial does not silence. Asserted by the gate so a
// future engine change cannot quietly turn this comment into a lie.
export const LIVE_AT_ZERO = Object.freeze(['foxy', 'puppet']);

// A target the baseline clears above this needs no invention.
export const NO_INVENTION_RATE = 0.95;

export function probe(id, { seeds = ADMISSION_SEEDS, level = SINGLE_THREAT_LEVEL } = {}) {
  const customNight = singleThreat(id, level);
  const effective = Math.min(level, C.aiCap(id));
  const empty = evaluate(seed => rollout(EMPTY_GENOME, { night: 7, seed, customNight }), { seeds });
  const reactive = evaluate(seed => reactiveRollout({ night: 7, seed, customNight }), { seeds });
  return {
    dial: id, requested: level, effective,
    empty: { rate: empty.rate, deaths: empty.deaths },
    reactive: { rate: reactive.rate, deaths: reactive.deaths, meanInputs: reactive.meanInputs },
    verdict: reactive.rate >= NO_INVENTION_RATE ? 'no-invention-needed'
      : empty.rate >= NO_INVENTION_RATE ? 'not-a-threat'
      : 'search-warranted',
  };
}

// Importing this module must not run the probe. `campaign.mjs` imports
// `singleThreat`, and an unguarded CLI here ran a full 1200-seed probe as an
// import side effect.
const INVOKED_DIRECTLY = process.argv[1] &&
  process.argv[1].endsWith('targets.mjs');

const argOf = (name, fallback) => {
  const found = process.argv.find(a => a.startsWith(`--${name}=`));
  return found ? found.split('=')[1] : fallback;
};
const ASSERT = process.argv.includes('--assert');
const seeds = Number(argOf('seeds', ASSERT ? 60 : ADMISSION_SEEDS));

const results = INVOKED_DIRECTLY ? DIALS.map(id => probe(id, { seeds })) : [];
if (INVOKED_DIRECTLY) {

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ schema: 'difficulty-probe-v1', seeds, results }, null, 2));
} else {
  console.log(`single-threat difficulty probe, ${seeds} seeds per arm, night 7 custom\n`);
  console.log(`  ${'dial'.padEnd(12)} ${'cap'.padStart(4)} ${'empty'.padStart(7)} ` +
    `${'reactive'.padStart(9)}  verdict`);
  for (const result of results) {
    console.log(`  ${result.dial.padEnd(12)} ${String(result.effective).padStart(4)} ` +
      `${(result.empty.rate * 100).toFixed(1).padStart(6)}% ` +
      `${(result.reactive.rate * 100).toFixed(1).padStart(8)}%  ${result.verdict}`);
  }
  const warranted = results.filter(r => r.verdict === 'search-warranted');
  console.log(`\n  search warranted for ${warranted.length}/${results.length}: ` +
    `${warranted.map(r => r.dial).join(', ') || 'none'}`);
  const solved = results.filter(r => r.verdict === 'no-invention-needed');
  if (solved.length)
    console.log(`  reaction already clears (skipped): ${solved.map(r => r.dial).join(', ')}`);
  const trivial = results.filter(r => r.verdict === 'not-a-threat');
  if (trivial.length)
    console.log(`  not a threat even to the empty policy: ${trivial.map(r => r.dial).join(', ')}`);
  if (!warranted.length)
    console.log('\n  CHECK-IN: reaction clears every single-threat vector. ' +
      'The campaign moves to pairs and triples; single-threat invention is ' +
      'not refuted, it is unnecessary.');
}

if (ASSERT) {
  let failures = 0;
  const ok = (what, condition) => {
    if (!condition) { failures++; console.error(`FAIL  ${what}`); } else console.log(`ok    ${what}`);
  };
  console.log('');
  ok('every dial produced a probe', results.length === DIALS.length);
  ok('every probe reports both arms',
    results.every(r => Number.isFinite(r.empty.rate) && Number.isFinite(r.reactive.rate)));
  ok('the reactive baseline is never worse than the empty policy on every dial at once',
    results.some(r => r.reactive.rate >= r.empty.rate));
  ok('effective levels respect the engine cap',
    results.every(r => r.effective === Math.min(r.requested, C.aiCap(r.dial))));
  // Pin the sourced AI-0 behaviour: a zeroed dial silences the seven stalled
  // characters and Golden Freddy, but not Foxy (threshold on D) or the Puppet
  // (bare `Random(20) <= AI`). If this ever changes, the probe's meaning
  // changes with it and this gate must be the thing that says so.
  ok('MO_CHANCE is exactly zero at AI 0 (the seven are isolated)',
    C.MO_CHANCE(0) === 0);
  ok('PUPPET_MO_CHANCE is non-zero at AI 0 (the Puppet is not isolated)',
    C.PUPPET_MO_CHANCE(0) > 0);
  ok('LIVE_AT_ZERO names exactly the characters a zeroed dial does not silence',
    LIVE_AT_ZERO.length === 2 && LIVE_AT_ZERO.includes('foxy') &&
    LIVE_AT_ZERO.includes('puppet'));
  if (failures) process.exitCode = 1;
  else console.log('difficulty probe: dials, arms, caps and verdicts pass');
}
}
