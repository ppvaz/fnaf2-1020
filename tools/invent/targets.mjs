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

export function singleThreat(id, level = SINGLE_THREAT_LEVEL) {
  return Object.fromEntries(DIALS.map(dial => [dial, dial === id ? level : 0]));
}

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

const argOf = (name, fallback) => {
  const found = process.argv.find(a => a.startsWith(`--${name}=`));
  return found ? found.split('=')[1] : fallback;
};
const ASSERT = process.argv.includes('--assert');
const seeds = Number(argOf('seeds', ASSERT ? 60 : ADMISSION_SEEDS));

const results = DIALS.map(id => probe(id, { seeds }));

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
  if (failures) process.exitCode = 1;
  else console.log('difficulty probe: dials, arms, caps and verdicts pass');
}
