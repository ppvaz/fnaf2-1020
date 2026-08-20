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
//
// Result (2026-08-20, second pass): the published shape does not transfer.
// Best adapted variant (right-vent Toy Bonnie stall + boundary-aligned Foxy
// hold-flashes): 16/200 normal seeds, deaths inside-office via Toy Chica;
// the pin-all-six --cams=3,5,6 extension is 0/200 (last-room pins have no
// depth, so each held cycle's stun gap feeds someone into a vent). The
// pinned worst-luck 100/100 is a diagnostic artifact — pinning also freezes
// the escape RNG — not a worst-case proof. Structural conflict: Foxy's
// boundary lock rolls demand ~5 s-cadence hall flashes, each flash resets
// the sourced consecutive-mask counters, so Toy Chica's five-tick clear
// cannot finish before her five-second opening timer arms, and the next
// monitor raise admits her to marker 123. Adding flash depth to fix that
// re-derives Minus 7's {4,7,10} cut set. See MINUS-3-STRATEGY.md §7.
import { pathToFileURL } from 'node:url';
import * as C from '../src/config.js';
import { Sim } from '../src/engine.js';

// Cycle phases, frames from each 5 s boundary (GF rolls land on boundaries;
// the monitor is always down across them).
const PH = {
  maskOff: 1,     // ticks at +240/+300 gave TC/Mangle two counted mask seconds
  raise: 17,
  camBox: 31, windOn: 33,
  windOff: 174,                  // swap to the first stall camera
  stallLightOn: 178,             // camera light on -> 400-frame stuns
  drop: 204,                     // light still held: the hall gets flashed
  lightOff: 212,                 // ...zeroing Foxy's D on the way down
  maskOn: 214,                   // fully on +226, before the +240 tick
  // Hold cycles with Foxy audibly in the hall: unmask, flash him just before
  // the boundary his lock roll lands on, remask. D re-enters every boundary
  // at ~0, so he can never lock; the cost is that the continuous-mask window
  // shrinks to four ticks while he is in the hall.
  holdUnmask: 274, holdLight: 290, holdLightOff: 298, holdRemask: 299,
};

export function run(opts = {}) {
  const boxFloor = opts.boxFloor ?? 0.35;
  // Which cameras the exit sweep flashes. [3] is published Minus Two; [3,5,6]
  // is the "pin all six" extension (it fails harder: last-room pins have no
  // depth, so any held cycle's stun gap feeds someone straight into a vent).
  const cams = opts.flashCams ?? [3];
  const sim = new Sim(Object.assign({ seed: 1 }, opts));
  let evIdx = 0, threats = 0, raised = false, minBox = 1, holds = 0, maxD = 0;
  let consecHolds = 0, maxConsecHolds = 0;
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
      // Two held cycles cover every sourced five-continuous-tick clear
      // (Toy Chica / Mangle / BB), so anything left after that is either
      // inside already or a fresh arrival: run a flash cycle to reset
      // Foxy's D before holding again. Never raise while BB is visibly in
      // the opening — that is the instant loss.
      const wantHold = (threats > 0 || sim.blackout.active) &&
        (consecHolds < 2 || sim.blackout.active) && !mustWind;
      if (wantHold || sim.bb.inOpening) {
        holds++; consecHolds++;
        maxConsecHolds = Math.max(maxConsecHolds, consecHolds);
        raised = false;
        if (!sim.maskOn) sim.press('mask'); // keep the continuous-mask clear going
      } else {
        consecHolds = 0;
        if (sim.maskOn) sim.press('mask');
        sim.press('monitor');
        raised = true;
      }
    }
    // The Shooter25 stall (brayden 2024, sourced group 428): the right vent
    // light is free and blocks Toy Bonnie's vent hop, so hold it whenever the
    // monitor is down.
    if (ph === PH.drop || (!raised && ph === PH.raise + 1)) sim.press('ventR');
    if (!raised && sim.foxy.loc === 'hall' && !sim.blackout.active && !sim.foxy.gotYou) {
      if (ph === PH.holdUnmask && sim.maskOn) sim.press('mask');
      if (ph === PH.holdLight) sim.press('light');
      if (ph === PH.holdLightOff) sim.release('light');
    }
    if (!raised && ph === PH.holdRemask && !sim.maskOn) sim.press('mask');
    if (raised) {
      if (ph === PH.camBox) { sim.release('ventR'); sim.press('cam:11'); }
      if (ph === PH.windOn) sim.press('wind');
      if (ph === PH.windOff) { sim.release('wind'); sim.press('cam:' + cams[0]); }
      if (ph === PH.stallLightOn) sim.press('light');
      for (let k = 1; k < cams.length; k++)
        if (ph === PH.stallLightOn + 9 * k) sim.press('cam:' + cams[k]);
      if (ph === PH.drop) sim.press('monitor');
      if (ph === PH.lightOff) sim.release('light');
      if (ph === PH.maskOn && !sim.maskOn) sim.press('mask');
    }
    sim.tick();
    minBox = Math.min(minBox, sim.box);
    maxD = Math.max(maxD, sim.foxy.D);
  }
  return { sim, minBox, holds, maxConsecHolds, maxD };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const n = +(process.argv[2] || 200);
  const worst = process.argv.includes('--worst');
  const camsArg = process.argv.find(a => a.startsWith('--cams='));
  const flashCams = camsArg ? camsArg.slice(7).split(',').map(Number) : [3];
  const deaths = {};
  let wins = 0, minBox = 1, minPower = C.POWER_FRAMES, maxHolds = 0, maxD = 0;
  for (let i = 0; i < n; i++) {
    const r = run({ seed: (i * 2654435761) >>> 0, worst, flashCams });
    minBox = Math.min(minBox, r.minBox);
    minPower = Math.min(minPower, r.sim.power);
    maxHolds = Math.max(maxHolds, r.maxConsecHolds);
    maxD = Math.max(maxD, r.maxD);
    if (r.sim.won) wins++;
    else deaths[r.sim.death.reason] = (deaths[r.sim.death.reason] || 0) + 1;
  }
  console.log(`Minus Two probe (${worst ? 'pinned worst-luck' : 'normal'} seeds, flashing CAM ${flashCams.join('/')})`);
  console.log(`${wins}/${n} survived on the current Android model`);
  for (const [reason, count] of Object.entries(deaths)) console.log(`  ${count}x ${reason}`);
  console.log(`min box ${(minBox * 100).toFixed(0)}% | min power ${minPower} | max consecutive holds ${maxHolds} | max Foxy D ${maxD}`);
}
