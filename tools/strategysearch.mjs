// Enumerate fixed camera-cover strategies over the simulator's route graph
// (plan 05).  Unlike cyclesearch.mjs, which only nudges Minus 7's timings,
// this changes the rooms being refreshed and asks whether the resulting cycle
// survives clean, worst-luck, and late-input sweeps.
//
// Important: every non-Minus-7 result is a claim about this model, not FNaF 2.
// STALLED's post-chokepoint routes are explicitly approximate, and CAM 08/09
// light immunity is not represented.  The output keeps those caveats visible.
//
//   node tools/strategysearch.mjs
//   node tools/strategysearch.mjs --quick
import { pathToFileURL } from 'node:url';
import * as C from '../src/config.js';
import { DEFAULT_CYCLE } from './bbtest.mjs';
import { pool, closePool } from './pool.mjs';

// Every night goes through the worker pool; `--serial` pins it to one thread
// and must produce identical output.
const BBTEST = new URL('./bbtest.mjs', import.meta.url).href;
const sweep = (optsList) => pool().map(BBTEST, 'summarize', optsList);

const ALL_CAMS = Object.keys(C.CAMS).map(Number).filter(n => n !== C.BOX_CAM);
const GROUNDED_CAMS = ALL_CAMS.filter(n => n !== 8 && n !== 9);
const SEED = (i) => (i * 2246822519) >>> 0;

export function isCover(cams) {
  const chosen = new Set(cams);
  return C.STALLED.every(u => u.path.some(node => chosen.has(node)));
}

export function enumerateCovers(maxSize = 3, pool = GROUNDED_CAMS) {
  const out = [];
  const walk = (start, picked) => {
    if (picked.length && isCover(picked)) out.push([...picked]);
    if (picked.length >= maxSize) return;
    for (let i = start; i < pool.length; i++) {
      picked.push(pool[i]); walk(i + 1, picked); picked.pop();
    }
  };
  walk(0, []);
  // A superset of an already-recorded cover is not a minimal structure.
  return out.filter(a => !out.some(b => b.length < a.length && b.every(x => a.includes(x))));
}

export function permutations(xs) {
  if (xs.length < 2) return [xs.slice()];
  const out = [];
  xs.forEach((x, i) => {
    for (const rest of permutations(xs.slice(0, i).concat(xs.slice(i + 1))))
      out.push([x, ...rest]);
  });
  return out;
}

// Preserve Minus 7's office half and its 12-frame camera rhythm, but allow a
// different number and order of camera flashes.  Fewer cameras turn directly
// into more music-box winding time.
export function buildCycle(order) {
  const rows = [
    [0, 'tap', 'monitor'], [18, 'tap', 'mask'], [27, 'tap', 'mask'],
    [30, 'down', 'light'], [32, 'up', 'light'], [36, 'tap', 'monitor'],
  ];
  let t = 55;
  for (const cam of order) {
    rows.push([t, 'tap', `cam:${cam}`], [t + 2, 'down', 'light'], [t + 4, 'up', 'light']);
    t += 12;
  }
  const lastLightUp = t - 8;
  rows.push([lastLightUp + 7, 'tap', `cam:${C.BOX_CAM}`],
    [lastLightUp + 10, 'down', 'wind']);
  return rows;
}

// The structural generator must leave the shipped strategy byte-for-byte
// unchanged when fed its original camera order.
if (JSON.stringify(buildCycle(C.TARGET_CAMS)) !== JSON.stringify(DEFAULT_CYCLE))
  throw new Error('buildCycle(TARGET_CAMS) no longer reproduces DEFAULT_CYCLE');

async function sample(order, jitter, n, worst = false) {
  const cycle = buildCycle(order);
  const nights = await sweep(Array.from({ length: n },
    (_, i) => ({ seed: SEED(i), cycle, targets: order, jitter, worst })));
  let survived = 0, minBox = 1, minPower = C.POWER_FRAMES;
  const deaths = {};
  for (const r of nights) {
    minBox = Math.min(minBox, r.minBox);
    minPower = Math.min(minPower, r.power);
    if (r.won) survived++;
    else deaths[r.reason] = (deaths[r.reason] || 0) + 1;
  }
  return { survived, n, minBox, minPower, deaths };
}

export async function evaluate(order, n = 16) {
  return {
    order,
    clean: await sample(order, 0, n),
    j10: await sample(order, 10, n),
    j12: await sample(order, 12, n),
  };
}

// Once a structure clears the hard all-survive threshold, compactness is the
// point of this search: a two-camera cover is a new routine, while another
// ordering of 04/07/10 is plan 04 territory.  Tail survival and resources are
// tie-breakers after camera count.
const score = r => [r.clean.survived, r.j10.survived, -r.order.length,
  r.j12.survived, Math.round(r.clean.minBox * 10000), r.clean.minPower];
const better = (a, b) => {
  const x = score(a), y = score(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

function pct(r) { return `${Math.round(r.survived / r.n * 100)}%`; }
async function curve(order, n) {
  const out = [];
  for (const ms of [0, 50, 100, 120, 150, 167, 200, 250, 300]) {
    const j = Math.round(ms / 1000 * C.FPS);
    out.push(`${ms}ms:${pct(await sample(order, j, n))}`);
  }
  return out.join('  ');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const quick = process.argv.includes('--quick');
  const N_SEARCH = quick ? 6 : 16;
  const N_VALID = quick ? 24 : 200;
  const N_WORST = quick ? 12 : 100;
  const covers = enumerateCovers();
  const allModelCovers = enumerateCovers(3, ALL_CAMS);
  const modelOnly = allModelCovers.filter(a => a.some(c => c === 8 || c === 9));

  console.log('route-graph cover enumeration');
  console.log(`  grounded minimal covers (CAM 08/09 excluded): ${covers.length}`);
  console.log(`  additional model-only covers using CAM 08/09: ${modelOnly.length}`);
  console.log(`  unique minimum: ${covers.filter(c => c.length === Math.min(...covers.map(x => x.length))).map(c => c.join('-')).join(', ')}`);
  console.log(`\nsearching ${covers.reduce((n, c) => n + permutations(c).length, 0)} orders (${N_SEARCH} seeds/order)...`);

  const winners = [];
  for (const cover of covers) {
    let best = null;
    for (const order of permutations(cover)) {
      const r = await evaluate(order, N_SEARCH);
      if (!best || better(r, best)) best = r;
    }
    if (best.clean.survived === N_SEARCH) winners.push(best);
    console.log(`  ${cover.join('-').padEnd(8)} best ${best.order.join('-').padEnd(8)} clean ${pct(best.clean)}  j10 ${pct(best.j10)}  j12 ${pct(best.j12)}  min box ${Math.round(best.clean.minBox * 100)}%`);
  }

  const sameSet = (a, b) => a.length === b.length &&
    [...a].sort((x, y) => x - y).every((x, i) => x === [...b].sort((x, y) => x - y)[i]);
  const structural = winners.filter(r => !sameSet(r.order, C.TARGET_CAMS));
  structural.sort((a, b) => better(a, b) ? -1 : better(b, a) ? 1 : 0);
  let best = structural[0];
  if (!best) {
    console.log('\nNo structurally new camera-cover strategy survived the search sweep.');
    process.exitCode = 1;
  } else {
    // The small search sweep is intentionally cheap and noisy past the hard
    // ceiling. Re-rank the permutations of the winning cover on the full
    // validation set so a one-seed tail difference does not pick its order.
    const finalists = [];
    for (const order of permutations(best.order))
      finalists.push({ order, clean: await sample(order, 0, N_VALID),
                       j12: await sample(order, 12, N_VALID) });
    finalists.sort((a, b) => b.j12.survived - a.j12.survived ||
      a.order.join('-').localeCompare(b.order.join('-')));
    best = finalists[0];
    console.log(`\nbest structurally new model candidate: CAM ${best.order.join(' -> CAM ')}`);
    const valid = best.clean;
    const worst = await sample(best.order, 0, N_WORST, true);
    console.log(`  clean validation: ${valid.survived}/${valid.n} (min box ${Math.round(valid.minBox * 100)}%, min power ${valid.minPower})`);
    console.log(`  worst luck      : ${worst.survived}/${worst.n} (min box ${Math.round(worst.minBox * 100)}%, min power ${worst.minPower})`);
    console.log(`  jitter curve    : ${await curve(best.order, N_VALID)}`);
    const baseline = [];
    for (const ms of [0, 50, 100, 120, 150, 167, 200, 250, 300]) {
      const j = Math.round(ms / 1000 * C.FPS);
      const nights = await sweep(Array.from({ length: N_VALID },
        (_, i) => ({ seed: SEED(i), cycle: DEFAULT_CYCLE, jitter: j })));
      baseline.push(`${ms}ms:${Math.round(nights.filter(r => r.won).length / N_VALID * 100)}%`);
    }
    console.log(`  Minus 7 baseline: ${baseline.join('  ')}`);
    console.log('\nCAVEAT: this candidate depends on approximate post-chokepoint routes and has not been validated against the game/decompile.');
    console.log('cycle table:');
    console.log(buildCycle(best.order).map(r => JSON.stringify(r)).join('\n'));
  }
  await closePool();
}
