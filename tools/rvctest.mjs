// Diagnostic skeleton of brayden's timer strategy.
//
// This is deliberately a calibration bot, not yet a trainer mode. It encodes
// the published clock beats against the canonical Android Sim so they can be
// tested as a policy hypothesis on this platform. Brayden's published 104-1 bot
// result is PC history, not an Android calibration target. The reactive post-wind
// branches are not encoded yet, so a mismatch is not a strategy refutation.
import { pathToFileURL } from 'node:url';
import * as C from '../src/config.js';
import { Sim } from '../src/engine.js';

const at = sec => C.s(sec);

function tap(q, sec, action, frames = 2) {
  q.push([at(sec), 'down', action], [at(sec) + frames, 'up', action]);
}

export function makePlan({ ventStall = true } = {}) {
  const q = [];

  // Opening: wind between the first four interval-safe Foxy flashes. Cams are
  // down before each 5-second boundary so Golden Freddy never gets a roll.
  q.push([1, 'tap', 'monitor'], [C.MONITOR_ANIM_UP + 2, 'down', 'wind']);
  for (const boundary of [5, 10, 15, 20]) {
    q.push([at(boundary - 0.6), 'up', 'wind'],
      [at(boundary - 0.55), 'tap', 'monitor']);
    tap(q, boundary - 0.15, 'light');
    if (boundary < 20) {
      q.push([at(boundary + 0.1), 'tap', 'monitor'],
        [at(boundary + 0.1) + C.MONITOR_ANIM_UP + 1, 'down', 'wind']);
    }
  }

  // Published transition: idle 20-24, flash at 24, cams at 25 and wind.
  tap(q, 24, 'light');
  q.push([at(25), 'tap', 'monitor'],
    [at(25) + C.MONITOR_ANIM_UP + 1, 'down', 'wind']);

  // Main 15-second cycle. The transcript describes one complete loop as:
  //   wind 4.5s -> mask/blackout 5.5s -> recovery 2s -> RVC stall 3s.
  // Thus the monitor drops at 29.5, 44.5, 59.5... and the next winding windows
  // begin at 40, 55, 70... . The old 20-second interpretation accidentally
  // left an uncovered five-second hole in every loop.
  for (let base = 29.5; base < C.NIGHT_FRAMES / C.FPS; base += 15) {
    q.push([at(base), 'up', 'wind'], [at(base), 'down', 'light'],
      [at(base), 'tap', 'monitor'], [at(base), 'tap', 'mask']);
    q.push([at(base + 5.7), 'tap', 'mask'], [at(base + 5.7), 'up', 'light']);
    tap(q, base + 7.6, 'light');
    if (ventStall) q.push([at(base + 7.7), 'down', 'ventR']);
    q.push([at(base + 10.5), 'up', 'ventR'], [at(base + 10.5), 'tap', 'monitor'],
      [at(base + 10.5) + C.MONITOR_ANIM_UP + 1, 'down', 'wind'],
      [at(base + 15), 'up', 'wind']);
  }
  return q.sort((a, b) => a[0] - b[0]);
}

export function run(opts = {}) {
  const sim = new Sim(Object.assign({ seed: 1 }, opts));
  const q = makePlan(opts);
  let i = 0, minBox = 1, powerOutAt = -1;
  while (sim.alive && !sim.won) {
    while (i < q.length && q[i][0] <= sim.frame) {
      const [, kind, action] = q[i++];
      if (kind === 'up') sim.release(action); else sim.press(action);
    }
    sim.tick();
    minBox = Math.min(minBox, sim.box);
    if (powerOutAt < 0 && sim.power <= 0) powerOutAt = sim.frame;
  }
  return { sim, minBox, powerOutAt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const n = +(process.argv[2] || 200);
  const ventStall = !process.argv.includes('--no-vent-stall');
  const deaths = {};
  let wins = 0, minBox = 1, minPower = C.POWER_FRAMES, firstPowerOut = Infinity;
  for (let i = 0; i < n; i++) {
    const r = run({ seed: (i * 2654435761) >>> 0, ventStall });
    minBox = Math.min(minBox, r.minBox);
    minPower = Math.min(minPower, r.sim.power);
    if (r.powerOutAt >= 0) firstPowerOut = Math.min(firstPowerOut, r.powerOutAt);
    if (r.sim.won) wins++;
    else deaths[r.sim.death.reason] = (deaths[r.sim.death.reason] || 0) + 1;
  }
  console.log(`brayden timer diagnostic (${ventStall ? 'right-vent stall' : 'no vent stall'})`);
  console.log('Android policy probe; current runner is a non-reactive RVC skeleton');
  console.log(`${wins}/${n} survived on the current Android model`);
  for (const [reason, count] of Object.entries(deaths)) console.log(`  ${count}x ${reason}`);
  console.log(`min box ${(minBox * 100).toFixed(0)}% | min power ${minPower}`);
  console.log(`first power-out ${Number.isFinite(firstPowerOut) ? (firstPowerOut / C.FPS).toFixed(1) + 's' : 'never'}`);
}
