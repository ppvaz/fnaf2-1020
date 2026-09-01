/** Exact Android-model evaluator for the glitch-based Minus Toys family. */
import * as C from '@fnaf2-1020/core/mechanics';
import { Sim } from '@fnaf2-1020/core/mechanics';
import { stableHash } from '@fnaf2-1020/core/contracts';

const SETUP = new Map([
  [0, [['press', 'monitor']]],
  [13, [['press', 'cam:11']]],
  [25, [['press', 'cam:9'], ['press', 'monitor']]],
  [48, [['press', 'monitor']]],
  [62, [['press', 'light']]],
  [66, [['release', 'light']]],
  [67, [['press', 'wind']]],
  [235, [['release', 'wind'], ['press', 'light']]],
  [240, [['press', 'monitor']]],
  [242, [['press', 'mask']]],
  [244, [['release', 'light']]],
]);

const LOOP = new Map([
  [540, [['press', 'mask']]],
  [556, [['press', 'light']]],
  [560, [['release', 'light']]],
  [606, [['press', 'monitor']]],
  [619, [['press', 'light']]],
  [623, [['release', 'light']]],
  [624, [['press', 'wind']]],
  [835, [['release', 'wind'], ['press', 'light']]],
  [840, [['press', 'monitor']]],
  [842, [['press', 'mask']]],
  [844, [['release', 'light']]],
]);

const act = (sim, rows) => { for (const [kind, action] of rows ?? []) sim[kind](action); };

/** Run the published split-camera setup and ten-second loop. */
export function runMinusToys(opts = {}) {
  const sim = new Sim(Object.assign({ seed: 1 }, opts));
  let minBox = 1, minPower = sim.power, splitAt = -1;
  let blackouts = 0, ventArrivals = 0, eventIndex = 0;
  while (sim.alive && !sim.won) {
    const setupRows = sim.frame === 25 && opts.splitCamera === false
      ? [['press', 'monitor']] : SETUP.get(sim.frame);
    act(sim, setupRows);
    for (const [offset, rows] of LOOP) {
      if (sim.frame >= offset && (sim.frame - offset) % (C.MO_FRAMES * 2) === 0)
        act(sim, rows);
    }
    sim.tick();
    if (splitAt < 0 && sim.camsUp && sim.viewing === 11 && sim.cam === 9) splitAt = sim.frame;
    minBox = Math.min(minBox, sim.box);
    minPower = Math.min(minPower, sim.power);
    for (; eventIndex < sim.events.length; eventIndex++) {
      const event = sim.events[eventIndex];
      if (event.type === 'blackout') blackouts++;
      if (event.type === 'vent-bang' && !event.data?.leaving && !event.data?.cam) ventArrivals++;
    }
  }
  return { sim, minBox, minPower, splitAt, blackouts, ventArrivals };
}

export function summarizeMinusToys(opts = {}) {
  const result = runMinusToys(opts);
  return {
    family: 'minus-toys', seed: opts.seed ?? 1, won: result.sim.won,
    reason: result.sim.death?.reason ?? null, minBox: result.minBox,
    minPower: result.minPower, splitAt: result.splitAt,
    blackouts: result.blackouts, ventArrivals: result.ventArrivals,
    terminal: { alive: result.sim.alive, won: result.sim.won,
      death: result.sim.death ?? null, frame: result.sim.frame },
    traceHash: stableHash(result.sim.events),
    eventCount: result.sim.events.length,
  };
}
