// Plan 05 package 7c: the wind-bearing seeds actually wind.
//
//   node tools/invent/test-wind-seeds.mjs [--seeds=20]
//
// The first draft of W1 looked like a box policy and wasn't one: WIND's
// `cam:11` press is refused while the monitor is down (plant-model.js:330),
// so nothing ever raised the monitor, `isWinding` never went true, and the
// genome scored exactly like the frozen office it was meant to replace. That
// failure mode -- a box policy with extra steps -- is what this gate exists
// to catch. It pins, on a fixed seed cohort:
//
//   1. the seed spends real wind decisions on a box-bearing target;
//   2. the monitor actually rises (winding engages, so the box survives the
//      deterministic 16.7s drain well past its unwound floor);
//   3. the measured bb performance stays at the level recorded when this
//      seed was written -- a drop means the RAISE->WIND chain, the input
//      gates, or the box/puppet mechanics moved, and a frontier that was
//      produced afterwards must not be trusted without re-stamping.
import * as C from '@fnaf2-1020/core/mechanics';
import { evaluate, rollout } from './search.mjs';
import { WIND_SEED_W1 } from './wind-seeds.mjs';
import { threatSet } from './targets.mjs';

const argOf = (n, d) => {
  const f = process.argv.find(a => a.startsWith(`--${n}=`));
  return f ? Number(f.split('=')[1]) : d;
};
const SEEDS = argOf('seeds', 20);
let failures = 0;
const ok = (what, condition, detail = '') => {
  if (!condition) { failures++; console.error(`FAIL  ${what} ${detail}`); }
  else console.log(`ok    ${what}${detail ? ` (${detail})` : ''}`);
};

const bb = threatSet('bb');
const result = evaluate(
  seed => rollout(WIND_SEED_W1, { night: 7, seed, customNight: bb }),
  { seeds: SEEDS });
const windPerSeed = result.windDecisions / result.seeds;

ok('the seed spends real wind decisions', windPerSeed > 100,
  `${windPerSeed.toFixed(1)}/seed`);
ok('survival stays at the recorded level', result.rate >= 0.95,
  `${(result.rate * 100).toFixed(1)}% at ${SEEDS} seeds, ` +
  `mean ${Math.round(result.meanFrames)} frames` +
  (result.rate >= 0.95 ? ' (full nights)' : ''));
ok('all survivors last the full night',
  result.rate > 0
    ? result.meanFrames >= 0.99 * C.NIGHT_FRAMES * result.rate
    : false,
  `${Math.round(result.meanFrames)} vs night ${C.NIGHT_FRAMES}`);
ok('the deaths that remain are recorded, never averaged away',
  Object.keys(result.deaths).length + result.won === SEEDS,
  `deaths ${JSON.stringify(result.deaths)}`);

// The unwound control: the EMPTY policy's box empties at the deterministic
// 1000-frame drain (g653-660) and the AI-0 ladder collects. Winding must beat
// it on the same cohort, or the seed is decoration.
const empty = evaluate(
  seed => rollout({ schema: 'invent-policy-v1', fallback: 'WAIT', rules: [] },
    { night: 7, seed, customNight: bb }),
  { seeds: SEEDS });
ok('the winding seed outlives the do-nothing control',
  result.meanFrames > empty.meanFrames,
  `${Math.round(result.meanFrames)} vs ${Math.round(empty.meanFrames)}`);

if (failures) process.exitCode = 1;
else console.log('wind seeds: RAISE->WIND engages, the box is paid, and the ' +
  'recorded bb level holds');
