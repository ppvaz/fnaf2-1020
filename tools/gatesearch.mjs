// Gate-aware strategy search (plan 06, first sourced-model pass).
//
// The sourced route graph turned "cams down" from a blindness tax into a
// wall: nearly every final approach requires the monitor UP, Withered
// Bonnie inverts it, the office light stalls mid-routes, and vent kills
// need a long continuous cams-up streak. None of that is expressible as a
// camera-cover permutation, so this sweeps a different family entirely:
// MONITOR-DENIAL macro-cycles — cams down almost always, up only in short
// periodic winding trips, office kept safe with mask flicks, hall flashes
// and (optionally) light-stall pulses.
//
// Caveats printed with every run: results are claims about this model.
// The camera-flash stall mechanism is not yet located in the mobile
// decompile (irrelevant here — denial uses no camera flashes), and the
// office endgame beyond the sourced gates is approximated.
//
//   node tools/gatesearch.mjs [--quick]
import { pathToFileURL } from 'node:url';
import * as C from '../src/config.js';
import { run } from './bbtest.mjs';

const F = C.FPS;
const QUICK = process.argv.includes('--quick');

// One macro-cycle spanning `anchors` 5-second blocks. Every block gets the
// office half (mask flick, hall flash, optional light pulse); the last
// block carries the winding trip: monitor up, CAM 11, hold wind, down.
function denialCycle({ anchors, windHold, lightPulse }) {
  // Bot table convention (same as Minus 7's): the monitor is UP when a
  // cycle begins, so row 0 lowers it; the trailing wind trip raises it and
  // leaves it up for the next cycle's row 0.
  const rows = [[0, 'tap', 'monitor']];
  for (let b = 0; b < anchors; b++) {
    const o = b * 5 * F;
    rows.push([o + 18, 'tap', 'mask'], [o + 27, 'tap', 'mask']);
    rows.push([o + 30, 'down', 'light'], [o + 32, 'up', 'light']);
    if (lightPulse) rows.push([o + 150, 'down', 'light'], [o + 154, 'up', 'light']);
  }
  const total = anchors * 5 * F;
  const upAt = total - windHold - 24; // raise, wind, leave it up
  rows.push([upAt, 'tap', 'monitor'], [upAt + 14, 'tap', 'cam:11'],
            [upAt + 18, 'down', 'wind'], [upAt + 18 + windHold, 'up', 'wind']);
  return rows.sort((a, b) => a[0] - b[0]);
}

// run() with a thin reactive layer on top of the scripted cycle: blackout ->
// mask immediately (release when it resolves); crowded vents -> hold the mask
// to bank the 5 cumulative seconds that clears them.
import { Sim } from '../src/engine.js';
import { Bot } from './bbtest.mjs';

function runReactive(opts) {
  const sim = new Sim(Object.assign({ seed: 999 }, opts));
  const bot = new Bot(sim, opts.cycle, []);
  if (opts.jitter) {
    const wrap = (fn) => (a) => {
      const base = Math.floor(sim.rng.next() * opts.jitter);
      const spread = Math.max(1, Math.round(opts.jitter / 3));
      return fn.call(bot, a)
        .map(([f, k, act]) => [f + base + Math.floor(sim.rng.next() * spread), k, act])
        .sort((x, y) => x[0] - y[0]);
    };
    bot.cycle = wrap(Bot.prototype.cycle);
    bot.phaseA = wrap(Bot.prototype.phaseA);
    bot.attack = wrap(Bot.prototype.attack);
    bot.recover = wrap(Bot.prototype.recover);
  }
  let minBox = 1, reactiveMask = false;
  while (sim.alive && !sim.won) {
    bot.step();
    const crowd = sim.units.filter(u => u.atOpening).length;
    const need = (sim.blackout.active && !sim.blackout.masked) || (!sim.camsUp && crowd >= 2);
    if (need && !sim.maskOn) { sim.press('mask'); reactiveMask = true; }
    else if (!need && reactiveMask && sim.maskOn && !sim.blackout.active) { sim.press('mask'); reactiveMask = false; }
    // Golden Freddy lurking in an otherwise empty hall: every flash feeds his
    // exposure kill, and Foxy's arrival evicts him anyway — so hold fire.
    // (A real player sees him in the doorway when flashing; this is knowable.)
    if (sim.gf.inHall && sim.lightHeld && !sim.camsUp) sim.release('light');
    sim.tick();
    minBox = Math.min(minBox, sim.box);
  }
  return { sim, minBox };
}

function evaluate(name, cycle, seeds) {
  let clean = 0, worst = 0, j10 = 0, j12 = 0, minBox = 1, minPower = C.POWER_FRAMES;
  const deaths = {};
  for (let i = 0; i < seeds; i++) {
    const seed = (i * 2246822519) >>> 0;
    const r = runReactive({ seed, cycle });
    minBox = Math.min(minBox, r.minBox); minPower = Math.min(minPower, r.sim.power);
    if (r.sim.won) clean++;
    else { const k = r.sim.death.reason; deaths[k] = (deaths[k] || 0) + 1; }
    if (runReactive({ seed, cycle, worst: true }).sim.won) worst++;
    if (runReactive({ seed, cycle, jitter: Math.round(0.100 * F) }).sim.won) j10++;
    if (runReactive({ seed, cycle, jitter: Math.round(0.200 * F) }).sim.won) j12++;
  }
  const pct = (x) => `${Math.round(x / seeds * 100)}%`.padStart(4);
  console.log(`  ${name.padEnd(26)} clean ${pct(clean)}  worst ${pct(worst)}  j100 ${pct(j10)}  j200 ${pct(j12)}  box ${(minBox * 100).toFixed(0)}%  pw ${minPower}`);
  const top = Object.entries(deaths).sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (top.length) console.log(`  ${''.padEnd(26)} deaths: ${top.map(([k, v]) => `${v}x ${k}`).join(', ')}`);
  return { clean, worst, j10, j12 };
}

console.log('gate-aware search: monitor-denial family (sourced model, night 7)');
console.log('caveat: model claims only; camera-flash stall mechanism still unlocated in source\n');

const seeds = QUICK ? 40 : 150;
const candidates = [];
for (const anchors of [2, 3]) {
  for (const windHold of [Math.round(2.2 * F), Math.round(2.8 * F), Math.round(3.6 * F)]) {
    for (const lightPulse of [false, true]) {
      candidates.push({
        name: `deny${anchors * 5}s w${(windHold / F).toFixed(1)}${lightPulse ? ' +light' : ''}`,
        cycle: denialCycle({ anchors, windHold, lightPulse }),
      });
    }
  }
}

let best = null;
for (const c of candidates) {
  const r = evaluate(c.name, c.cycle, seeds);
  if (!best || r.clean + r.j12 > best.r.clean + best.r.j12) best = { c, r };
}
console.log(`\nbest: ${best.c.name} — clean ${Math.round(best.r.clean / seeds * 100)}%, 200ms-jitter ${Math.round(best.r.j12 / seeds * 100)}%`);
console.log('Minus 7 reference (same harness): run tools/bbtest.mjs');

if (!(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)) {
  // imported as a module: expose the generator for other tools
}
export { denialCycle };
