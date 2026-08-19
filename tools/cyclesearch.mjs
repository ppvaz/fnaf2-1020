// Search the neighbourhood of the Minus 7 cycle for the most forgiving variant
// (plan 04). A candidate cycle is described by named knobs (gaps between the
// cycle's events, in frames); fitness is the largest uniform jitter, in frames,
// at which every seed of a fixed set still survives — i.e. how late a player
// can consistently be before the night stops being winnable.
//
//   node tools/cyclesearch.mjs            # hill-climb from the current cycle
//   node tools/cyclesearch.mjs --curve    # just print jitter curves for the
//                                         # current cycle (no search)
import * as C from '../src/config.js';
import { run, DEFAULT_CYCLE } from './bbtest.mjs';

// The current cycle, expressed as knobs. genCycle(KNOBS0) reproduces
// DEFAULT_CYCLE exactly (asserted below).
const KNOBS0 = {
  maskDelay: 18, // monitor down -> mask on (covers the monitor animation)
  maskHold: 9,   // mask on -> mask off
  hallDelay: 3,  // mask off -> hall flash on
  hallHold: 2,   // hall flash duration
  upDelay: 4,    // hall flash off -> monitor up
  camDelay: 19,  // monitor up -> first camera tap (covers the animation)
  flashDelay: 2, // camera tap -> camera light on
  flashHold: 2,  // camera light duration
  camGap: 8,     // camera light off -> next camera tap
  homeDelay: 7,  // last light off -> CAM 11 tap
  windDelay: 3,  // CAM 11 tap -> wind press
};
const ORDER0 = [10, 4, 7];

const MIN = { maskDelay: 15, maskHold: 1, hallDelay: 1, hallHold: 1, upDelay: 1,
              camDelay: 15, flashDelay: 1, flashHold: 1, camGap: 1,
              homeDelay: 1, windDelay: 1 };

export function genCycle(k, order = ORDER0) {
  const rows = [[0, 'tap', 'monitor']];
  let t = k.maskDelay;
  rows.push([t, 'tap', 'mask']);
  rows.push([t += k.maskHold, 'tap', 'mask']);
  rows.push([t += k.hallDelay, 'down', 'light']);
  rows.push([t += k.hallHold, 'up', 'light']);
  rows.push([t += k.upDelay, 'tap', 'monitor']);
  t += k.camDelay;
  for (const cam of order) {
    rows.push([t, 'tap', `cam:${cam}`]);
    rows.push([t += k.flashDelay, 'down', 'light']);
    rows.push([t += k.flashHold, 'up', 'light']);
    t += k.camGap;
  }
  t -= k.camGap;
  rows.push([t += k.homeDelay, 'tap', 'cam:11']);
  rows.push([t += k.windDelay, 'down', 'wind']);
  return rows;
}

// Sanity: the knob encoding must reproduce the shipped cycle.
{
  const a = JSON.stringify(genCycle(KNOBS0));
  const b = JSON.stringify(DEFAULT_CYCLE);
  if (a !== b) throw new Error(`genCycle(KNOBS0) != DEFAULT_CYCLE\n${a}\n${b}`);
}

const SEED = (i) => (i * 2246822519) >>> 0;

function survivors(cycle, jitter, n) {
  let ok = 0;
  for (let i = 0; i < n; i++)
    if (run({ seed: SEED(i), jitter, cycle }).sim.won) ok++;
  return ok;
}

// Lexicographic fitness: (largest all-survive jitter, survivors just past it).
const J_CAP = 30;
function fitness(cycle, n) {
  let j = 0;
  while (j <= J_CAP && survivors(cycle, j, n) === n) j++;
  const maxJ = j - 1;
  let tie = 0;
  for (let d = 0; d < 3; d++) tie += survivors(cycle, j + d, n);
  return { maxJ, tie };
}
const better = (a, b) => a.maxJ > b.maxJ || (a.maxJ === b.maxJ && a.tie > b.tie);

function hillClimb(knobs, order, n, log) {
  let best = { ...knobs };
  let bestFit = fitness(genCycle(best, order), n);
  log(`start: maxJ ${bestFit.maxJ} frames (${Math.round(bestFit.maxJ / C.FPS * 1000)}ms), tie ${bestFit.tie}`);
  for (let pass = 0; ; pass++) {
    let improved = false;
    for (const key of Object.keys(best)) {
      for (const step of [-4, -2, -1, 1, 2, 4]) {
        const cand = { ...best, [key]: best[key] + step };
        if (cand[key] < MIN[key]) continue;
        const fit = fitness(genCycle(cand, order), n);
        if (better(fit, bestFit)) {
          best = cand; bestFit = fit; improved = true;
          log(`  pass ${pass}: ${key} ${knobs[key]}->${cand[key]} => maxJ ${fit.maxJ}, tie ${fit.tie}`);
        }
      }
    }
    if (!improved) break;
  }
  return { knobs: best, fit: bestFit };
}

function curve(cycle, n) {
  const out = [];
  for (const ms of [0, 50, 100, 120, 150, 200, 250, 300]) {
    const j = Math.round(ms / 1000 * C.FPS);
    out.push(`${ms}ms:${(survivors(cycle, j, n) / n * 100).toFixed(0)}%`);
  }
  return out.join('  ');
}

const isMain = process.argv[1] &&
  import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (isMain) {
  const N_SEARCH = 48, N_VALID = 200;
  console.log(`current cycle jitter curve (${N_VALID} seeds):`);
  console.log(`  ${curve(DEFAULT_CYCLE, N_VALID)}`);
  if (!process.argv.includes('--curve')) {
    // Camera order first (cheap, discrete), then knobs (hill-climb).
    const orders = [[10, 4, 7], [10, 7, 4], [4, 10, 7], [4, 7, 10], [7, 10, 4], [7, 4, 10]];
    let bestOrder = ORDER0, bestOrderFit = fitness(genCycle(KNOBS0, ORDER0), N_SEARCH);
    for (const o of orders) {
      const fit = fitness(genCycle(KNOBS0, o), N_SEARCH);
      console.log(`order ${o.join('-')}: maxJ ${fit.maxJ}, tie ${fit.tie}`);
      if (better(fit, bestOrderFit)) { bestOrder = o; bestOrderFit = fit; }
    }
    console.log(`searching knobs with order ${bestOrder.join('-')} (${N_SEARCH} seeds)...`);
    const { knobs, fit } = hillClimb(KNOBS0, bestOrder, N_SEARCH, (m) => console.log(m));
    const cycle = genCycle(knobs, bestOrder);
    console.log(`\nbest knobs: ${JSON.stringify(knobs)}`);
    console.log(`best order: ${bestOrder.join('-')}  (search fitness: maxJ ${fit.maxJ} = ${Math.round(fit.maxJ / C.FPS * 1000)}ms)`);
    console.log(`\nvalidation (${N_VALID} seeds):`);
    console.log(`  clean sweep : ${survivors(cycle, 0, N_VALID)}/${N_VALID}`);
    let worst = 0;
    for (let i = 0; i < 100; i++) if (run({ seed: SEED(i), cycle, worst: true }).sim.won) worst++;
    console.log(`  worst luck  : ${worst}/100`);
    console.log(`  jitter curve: ${curve(cycle, N_VALID)}`);
    console.log(`\ncycle table:\n${cycle.map(r => JSON.stringify(r)).join('\n')}`);
  }
}
