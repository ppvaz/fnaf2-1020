// Plan 20 package 2: reduced transition model against a seeded exact-engine
// replay. The comparison is intentionally limited to controller-visible
// control/resource state; hidden RNG routes remain risk buckets.
import * as C from '../src/config.js';
import { Sim } from '../src/engine.js';
import { build, schedule } from './device/minus-toys-plan.mjs';
import { advanceReduced, applyReduced, initialReducedState,
         observeReduced, isMaskFullyOn, isMaskFullyOff } from '../src/reduced-model.js';

const check = (condition, message) => { if (!condition) throw new Error(message); };
const seed = (i) => (i * 2654435761) >>> 0;

function compare(sim, reduced, label) {
  check(sim.frame === reduced.frame, `${label}: frame diverged (${sim.frame} vs ${reduced.frame})`);
  check(sim.monitor === reduced.monitor && sim.monAnim === reduced.monitorAnim,
    `${label}: monitor diverged (${sim.monitor}/${sim.monAnim} vs ` +
    `${reduced.monitor}/${reduced.monitorAnim})`);
  check(sim.maskOn === reduced.maskOn && sim.maskAnim === reduced.maskAnim,
    `${label}: mask diverged (${sim.maskOn}/${sim.maskAnim} vs ` +
    `${reduced.maskOn}/${reduced.maskAnim})`);
  check(sim.winding === reduced.winding && sim.lightHeld === reduced.lightHeld,
    `${label}: held controls diverged`);
  check(Math.abs(sim.box - reduced.box) < 1e-9,
    `${label} at frame ${sim.frame}: box diverged (${sim.box} vs ${reduced.box})`);
  check(sim.power === reduced.power,
    `${label}: power diverged (${sim.power} vs ${reduced.power})`);
}

function run(seedValue) {
  const sim = new Sim({ night: 1, seed: seedValue });
  const built = build({ minimal: true });
  const queue = schedule({
    opening: built.opening, loop: built.loop, finish: built.finish,
    periodMs: 5000, loopStartMs: 140000, untilMs: 360000,
  });
  let reduced = initialReducedState({ night: 1 });
  let i = 0;
  while (sim.alive && !sim.won) {
    const next = queue[i]?.[0] ?? C.NIGHT_FRAMES;
    while (sim.alive && !sim.won && sim.frame < next) {
      sim.tick();
    }
    if (!sim.alive) break;
    reduced = advanceReduced(reduced, sim.frame);
    while (i < queue.length && queue[i][0] === sim.frame) {
      const [, kind, action] = queue[i++];
      sim[kind](action);
      reduced = applyReduced(reduced, action, kind).state;
    }
    sim.tick();
    if (sim.frame > reduced.frame) reduced = advanceReduced(reduced, sim.frame);
    compare(sim, reduced, `seed ${seedValue}`);
  }
  check(sim.won, `seed ${seedValue}: reduced replay did not reach the engine terminal frame`);
  return reduced;
}

for (const n of [0, 1, 2, 17]) run(seed(n));

// Action locks are explicit and UNKNOWN observations do not become false.
let state = initialReducedState({ night: 2 });
state = observeReduced(state, {
  monitorUp: { state: 'OBSERVED', value: false },
  maskOn: { state: 'UNKNOWN', reason: 'mask-animating' },
});
check(state.controlUnknown.mask && state.hazards.blackout.state === 'unknown',
  'UNKNOWN control observation collapsed into a negative hazard claim');
check(isMaskFullyOff(state) && !isMaskFullyOn(state),
  'initial mask polarity was not represented as fully off');
state = applyReduced(state, 'monitor').state;
state = advanceReduced(state, C.MONITOR_ANIM_UP);
check(!applyReduced(state, 'mask').accepted,
  'mask-on was accepted while the reduced monitor was up');
console.log('reduced model: control/resource trace matches seeded Night 1 Sim replays; locks and UNKNOWN pass');
