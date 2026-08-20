// Android policy probe for plan 02: Zach_Scream's glitchless "Minus Two"
// (2025), adapted to the canonical Android model. Minus Toys itself cannot
// transfer (the double-camera glitch has no Android state and CAM 09 is
// flash-excluded), so this probes the family's glitchless member: an
// interval-anchored 5 s cycle that flashes only CAM 03 (pinning Toy Bonnie
// and W. Freddy), hall-flashes Foxy on every exit, and mask-camps the rest.
//
// The controller is observable-only: the clock, its own inputs, vent-bang /
// leave cues, the visible blackout, and the box gauge. Reactive branches per
// the published routine: on an unresolved arrival or a blackout it holds the
// mask through whole boundaries (clearing Toy Chica / Mangle / BB via their
// sourced continuous-mask leaves) instead of raising; a low box overrides the
// hold. A loss here closes only this policy shape on the current model.
import { pathToFileURL } from 'node:url';
import * as C from '../src/config.js';
import { Sim } from '../src/engine.js';

// Cycle phases, frames from each 5 s boundary (GF rolls land on boundaries;
// the monitor is always down across them).
const PH = {
  maskOff: 1,     // ticks at +240/+300 gave TC/Mangle two counted mask seconds
  raise: 17,
  camBox: 31, windOn: 33,
  windOff: 180, camStall: 180,   // swap to CAM 03
  stallLightOn: 184,             // 20 frames of camera light -> 400-frame stun
  drop: 204,                     // light still held: the hall gets flashed
  lightOff: 212,                 // ...zeroing Foxy's D on the way down
  maskOn: 214,                   // fully on +226, before the +240 tick
};

export function run(opts = {}) {
  const boxFloor = opts.boxFloor ?? 0.35;
  const sim = new Sim(Object.assign({ seed: 1 }, opts));
  let evIdx = 0, threats = 0, raised = false, minBox = 1, holds = 0, maxD = 0;
  while (sim.alive && !sim.won) {
    // observable cues since last frame
    for (; evIdx < sim.events.length; evIdx++) {
      const e = sim.events[evIdx];
      if (e.type === 'vent-bang' && !e.data?.cam)
        threats = Math.max(0, threats + (e.data.leaving ? -1 : 1));
    }
    const ph = sim.frame % C.MO_FRAMES;
    if (ph === PH.maskOff && sim.maskOn && !(threats > 0 || sim.blackout.active))
      sim.press('mask');
    if (ph === PH.raise) {
      const mustWind = sim.box < boxFloor;
      if ((threats > 0 || sim.blackout.active) && !mustWind) {
        holds++;
        if (!sim.maskOn) sim.press('mask'); // keep the continuous-mask clear going
        raised = false;
      } else {
        if (sim.maskOn) sim.press('mask');
        sim.press('monitor');
        raised = true;
      }
    }
    if (raised) {
      if (ph === PH.camBox) sim.press('cam:11');
      if (ph === PH.windOn) sim.press('wind');
      if (ph === PH.windOff) { sim.release('wind'); sim.press('cam:3'); }
      if (ph === PH.stallLightOn) sim.press('light');
      if (ph === PH.drop) sim.press('monitor');
      if (ph === PH.lightOff) sim.release('light');
      if (ph === PH.maskOn && !sim.maskOn) sim.press('mask');
    }
    sim.tick();
    minBox = Math.min(minBox, sim.box);
    maxD = Math.max(maxD, sim.foxy.D);
  }
  return { sim, minBox, holds, maxD };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const n = +(process.argv[2] || 200);
  const worst = process.argv.includes('--worst');
  const deaths = {};
  let wins = 0, minBox = 1, minPower = C.POWER_FRAMES, maxHolds = 0, maxD = 0;
  for (let i = 0; i < n; i++) {
    const r = run({ seed: (i * 2654435761) >>> 0, worst });
    minBox = Math.min(minBox, r.minBox);
    minPower = Math.min(minPower, r.sim.power);
    maxHolds = Math.max(maxHolds, r.holds);
    maxD = Math.max(maxD, r.maxD);
    if (r.sim.won) wins++;
    else deaths[r.sim.death.reason] = (deaths[r.sim.death.reason] || 0) + 1;
  }
  console.log(`Minus Two probe (${worst ? 'pinned worst-luck' : 'normal'} seeds)`);
  console.log(`${wins}/${n} survived on the current Android model`);
  for (const [reason, count] of Object.entries(deaths)) console.log(`  ${count}x ${reason}`);
  console.log(`min box ${(minBox * 100).toFixed(0)}% | min power ${minPower} | max held cycles ${maxHolds} | max Foxy D ${maxD}`);
}
