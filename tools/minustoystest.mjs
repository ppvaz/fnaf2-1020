// Android policy probe for Zach_Scream's glitch-based Minus Toys (2025).
//
// The setup deliberately arms the sourced Android split-camera state before
// 0:05: establish CAM 11 as g263's sampled `last viewed`, touch CAM 09, and
// lower before the next 200 ms sample. On the next raise the displayed feed
// (`viewing`) returns to CAM 11 while the `your view` marker stays on CAM 09.
// No later camera touch is made, so the split persists.
//
// The published rhythm is represented as a ten-second loop: wind on displayed
// CAM 11 for the first four seconds, flash the parked CAM 09 marker on entry
// and exit, then stay continuously masked across the next five-second interval.
// The long office half is load-bearing on Android: it spans the five sourced
// consecutive mask ticks needed by Mangle and Balloon Boy. Golden Freddy's
// five-second checks always land with the monitor down.
import { pathToFileURL } from 'node:url';
import * as C from '../src/config.js';
import { Sim } from '../src/engine.js';
import { formatRate } from './stat.mjs';

const SETUP = new Map([
  [0,   [['press', 'monitor']]],
  [13,  [['press', 'cam:11']]],
  // Frame 24 is the next g263 sample. Touching CAM 09 immediately after it and
  // lowering in the same input turn gives the sample no tick in which to run.
  [25,  [['press', 'cam:9'], ['press', 'monitor']]],
  [48,  [['press', 'monitor']]],
  [62,  [['press', 'light']]],
  [66,  [['release', 'light']]],
  [67,  [['press', 'wind']]],
  [235, [['release', 'wind'], ['press', 'light']]],
  [240, [['press', 'monitor']]],
  [242, [['press', 'mask']]],
  [244, [['release', 'light']]],
]);

// Repeats every ten seconds after setup. Offsets are measured from the first
// 0:00 boundary; the first row used is +9.00 s (frame 540).
const LOOP = new Map([
  [540, [['press', 'mask']]],       // mask off; fully clear before hall flash
  [556, [['press', 'light']]],
  [560, [['release', 'light']]],
  [606, [['press', 'monitor']]],    // safely after the 10 s GF interval
  [619, [['press', 'light']]],      // glitched CAM 09 entry refresh
  [623, [['release', 'light']]],
  [624, [['press', 'wind']]],
  [835, [['release', 'wind'], ['press', 'light']]],
  [840, [['press', 'monitor']]],    // :X4/:X9 exit; held light becomes hall
  [842, [['press', 'mask']]],
  [844, [['release', 'light']]],
]);

function act(sim, rows) {
  for (const [kind, action] of rows || []) sim[kind](action);
}

export function run(opts = {}) {
  const sim = new Sim(Object.assign({ seed: 1 }, opts));
  let minBox = 1, minPower = sim.power, splitAt = -1;
  let blackouts = 0, ventArrivals = 0;
  let eventIndex = 0;

  while (sim.alive && !sim.won) {
    const setupRows = sim.frame === 25 && opts.splitCamera === false
      ? [['press', 'monitor']] // control: viewing + marker both stay on CAM 11
      : SETUP.get(sim.frame);
    act(sim, setupRows);
    for (const [offset, rows] of LOOP) {
      if (sim.frame >= offset && (sim.frame - offset) % (C.MO_FRAMES * 2) === 0)
        act(sim, rows);
    }

    sim.tick();
    if (splitAt < 0 && sim.camsUp && sim.viewing === 11 && sim.cam === 9)
      splitAt = sim.frame;
    minBox = Math.min(minBox, sim.box);
    minPower = Math.min(minPower, sim.power);
    for (; eventIndex < sim.events.length; eventIndex++) {
      const e = sim.events[eventIndex];
      if (e.type === 'blackout') blackouts++;
      if (e.type === 'vent-bang' && !e.data?.leaving && !e.data?.cam) ventArrivals++;
    }
  }
  return { sim, minBox, minPower, splitAt, blackouts, ventArrivals };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runs = +(process.argv[2] || 200);
  const worst = process.argv.includes('--worst');
  const control = process.argv.includes('--no-split');
  const assert = process.argv.includes('--assert');
  const deaths = {};
  let wins = 0, minBox = 1, minPower = Infinity, splitMisses = 0;
  let maxBlackouts = 0, maxVentArrivals = 0;
  for (let i = 0; i < runs; i++) {
    const result = run({ seed: (i * 2654435761) >>> 0, worst, splitCamera: !control });
    if (result.sim.won) wins++;
    else deaths[result.sim.death?.reason || 'unknown'] =
      (deaths[result.sim.death?.reason || 'unknown'] || 0) + 1;
    if (result.splitAt < 0) splitMisses++;
    minBox = Math.min(minBox, result.minBox);
    minPower = Math.min(minPower, result.minPower);
    maxBlackouts = Math.max(maxBlackouts, result.blackouts);
    maxVentArrivals = Math.max(maxVentArrivals, result.ventArrivals);
  }
  console.log(`Minus Toys probe (${worst ? 'pinned worst-luck' : 'normal'} seeds${control ? ', no-split control' : ''})`);
  console.log(`${wins}/${runs} survived (${formatRate(wins, runs, { label: 'survival' })}) on the current Android model`);
  for (const [reason, count] of Object.entries(deaths)) console.log(`  ${count}x ${reason}`);
  console.log(`split misses ${splitMisses} | min box ${(minBox * 100).toFixed(0)}% | ` +
    `min power ${minPower} | max blackouts ${maxBlackouts} | max vent arrivals ${maxVentArrivals}`);
  if (assert) {
    const passed = control ? wins === 0 : wins === runs && splitMisses === 0;
    if (!passed) process.exitCode = 1;
  }
}
