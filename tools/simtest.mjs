// Headless check: drive a "perfect player" through the Minus 7 cycle and see
// whether the simulation's economics actually work out over a full night.
import * as C from '../src/config.js';
import { Sim } from '../src/engine.js';

// Regression for the sourced hop gates: a fresh successful movement roll must
// wait behind a closed gate just like an already-stunned pending move. This was
// easy to miss because the retry path and the initial-roll path are separate.
{
  const gate = new Sim({ seed: 1, worst: true, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, powerEnabled: false, record: false });
  const tb = gate.units.find(u => u.id === 'toybonnie');
  tb.idx = tb.path.length - 2; // CAM 06 -> right opening requires cams up
  gate.frame = C.MO_FRAMES;
  gate.onFiveSecond();
  if (tb.atOpening || !tb.pending)
    throw new Error('closed cams-up entry gate did not retain Toy Bonnie as pending');
  gate.monitor = 'up';
  gate.tickUnits(gate.frame);
  if (!tb.atOpening || tb.pending)
    throw new Error('pending Toy Bonnie did not advance when the cams-up gate opened');

  // A short office-light tap latches through the next global second tick, but
  // only blocks the two route edges that test `new bonnie = 0` in the source.
  const lightGate = new Sim({ seed: 3, worst: true, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, powerEnabled: false, record: false });
  const litTb = lightGate.units.find(u => u.id === 'toybonnie');
  litTb.idx = 1; // source marker 62 -> 120 is light-gated
  lightGate.press('light'); lightGate.tick(); lightGate.release('light');
  litTb.pending = true;
  lightGate.tickUnits(lightGate.frame);
  if (!litTb.pending || litTb.idx !== 1)
    throw new Error('Toy Bonnie crossed a sourced light-gated edge while latch was active');
  while (lightGate.frame < C.FPS) lightGate.tick();
  if (litTb.pending || litTb.idx !== 2)
    throw new Error('Toy Bonnie did not cross after the office-light latch cleared');

  const ungated = new Sim({ seed: 4, worst: true, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, powerEnabled: false, record: false });
  const lateTb = ungated.units.find(u => u.id === 'toybonnie');
  lateTb.idx = 3; lateTb.pending = true; // marker 56 -> 60 has no light gate
  ungated.press('light'); ungated.tick(); ungated.release('light');
  ungated.tickUnits(ungated.frame);
  if (lateTb.pending || lateTb.idx !== 4)
    throw new Error('office light incorrectly blocked an ungated Toy Bonnie edge');

  const ventLight = new Sim({ seed: 5, worst: true, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, record: false });
  const ventTb = ventLight.units.find(u => u.id === 'toybonnie');
  ventTb.idx = 1; ventTb.pending = true;
  ventLight.press('ventR'); ventLight.tick(); ventLight.release('ventR');
  if (!ventTb.pending || ventLight.power !== C.POWER_FRAMES - 1)
    throw new Error('right vent light did not share the sourced light latch and battery');

  const threshold = new Sim({ seed: 6, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, powerEnabled: false, record: false });
  const wc = threshold.units.find(u => u.id === 'withchica');
  wc.idx = wc.path.length - 1; wc.atOpening = true;
  wc.openingReadyAt = threshold.frame + C.WITHERED_CHICA_OPENING_FRAMES;
  threshold.press('mask');
  if (wc.atOpening || wc.idx !== 0)
    throw new Error('timely mask did not immediately repel an unarmed threshold attacker');

  const maskedArrival = new Sim({ seed: 7, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, powerEnabled: false, record: false });
  const arrivingWc = maskedArrival.units.find(u => u.id === 'withchica');
  arrivingWc.idx = arrivingWc.path.length - 2;
  maskedArrival.press('mask');
  maskedArrival.advance(arrivingWc);
  if (arrivingWc.atOpening || arrivingWc.idx !== 0)
    throw new Error('mask already on did not repel a newly arrived threshold attacker');

  const endgame = new Sim({ seed: 2, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, powerEnabled: false, record: false });
  const wb = endgame.units.find(u => u.id === 'withbonnie');
  wb.idx = wb.path.length - 1; wb.atOpening = true; wb.openingReadyAt = 0;
  endgame.monitor = 'up'; endgame.camsUpSince = endgame.frame;
  endgame.tickUnits(endgame.frame);
  if (endgame.alive)
    throw new Error('armed Withered Bonnie incorrectly received the shared cams-up streak grace');
}

const CYCLE = [
  [0,  'tap',  'monitor'],   // cams down
  [18, 'tap',  'mask'],      // mask on  (clears Golden Freddy)
  [27, 'tap',  'mask'],      // mask off
  [30, 'down', 'light'],     // flash the hall
  [32, 'up',   'light'],
  [36, 'tap',  'monitor'],   // cams up (fully up at +51)
  [55, 'tap',  'cam:10'], [57, 'down', 'light'], [59, 'up', 'light'],
  [67, 'tap',  'cam:4'],  [69, 'down', 'light'], [71, 'up', 'light'],
  [79, 'tap',  'cam:7'],  [81, 'down', 'light'], [83, 'up', 'light'],
  [90, 'tap',  'cam:11'],
  [93, 'down', 'wind'],
];

export function run(opts = {}) {
  const sim = new Sim(Object.assign({ bbEnabled: false, seed: 12345 }, opts));
  // Start of night: raise the cams, sit on CAM 11 and wind until 0:07, which is
  // the first anchor. From there the main cycle runs on :X2 / :X7.
  let anchor = C.s(7);
  let queue = [
    [2, 'tap', 'monitor'], [20, 'tap', 'cam:11'], [24, 'down', 'wind'],
    ...CYCLE.map(([o, k, a]) => [anchor + o, k, a]),
  ];
  let minBox = 1, maxD = 0;

  while (sim.alive && !sim.won) {
    while (queue.length && queue[0][0] <= sim.frame) {
      const [, kind, act] = queue.shift();
      if (kind === 'up') sim.release(act); else sim.press(act);
    }
    if (!queue.length) {
      anchor += C.MO_FRAMES;
      queue = CYCLE.map(([o, k, a]) => [anchor + o, k, a]);
    }
    sim.tick();
    minBox = Math.min(minBox, sim.box);
    maxD = Math.max(maxD, sim.foxy.D);
  }
  return { sim, minBox, maxD };
}

const r = run();
const s = r.sim;
console.log(`result        : ${s.won ? 'SURVIVED to 6 AM' : 'DIED ' + s.death.reason}`);
if (s.death) console.log(`               ${s.death.detail} @ ${(s.death.t).toFixed(2)}s`);
console.log(`time          : ${(s.frame / 60).toFixed(1)}s of ${(C.NIGHT_FRAMES / 60)}s`);
console.log(`power left    : ${s.power}/${C.POWER_FRAMES} frames (${(s.power / 60).toFixed(1)}s)`);
console.log(`light used    : ${((C.POWER_FRAMES - s.power) / 60).toFixed(1)}s  rate ${Math.round((C.POWER_FRAMES - s.power) / s.frame * 1000)}ms/s`);
console.log(`min box       : ${(r.minBox * 100).toFixed(0)}%`);
console.log(`max Foxy D    : ${r.maxD}`);
console.log(`puppet stage  : ${s.puppet.stage}`);
console.log(`broke loose   : ${s.mistakes.filter(m => m.code === 'broke-loose').length}`);
const stunGaps = [0, 1, 2].map(k => {
  let g = 0; for (let i = 1; i < s.rec.n; i++) if (s.rec.stun[k][i] === 0 && s.rec.stun[k][i - 1] > 0) g++;
  return `${C.TARGET_CAMS[k]}:${g}`;
}).join(' ');
console.log(`stun lapses   : ${stunGaps}`);

// --- sweep: Minus 7's claim is that a correct cycle never loses -------------
if (process.argv.includes('--sweep')) {
  const n = 200; const fails = {};
  let worstD = 0, minBoxAll = 1, minPower = C.POWER_FRAMES;
  for (let i = 0; i < n; i++) {
    const r = run({ seed: (i * 2654435761) >>> 0 });
    worstD = Math.max(worstD, r.maxD);
    minBoxAll = Math.min(minBoxAll, r.minBox);
    minPower = Math.min(minPower, r.sim.power);
    if (!r.sim.won) fails[r.sim.death.reason] = (fails[r.sim.death.reason] || 0) + 1;
  }
  const failed = Object.values(fails).reduce((a, b) => a + b, 0);
  console.log(`\nsweep of ${n} seeds: ${n - failed} survived, ${failed} died`);
  for (const [k, v] of Object.entries(fails)) console.log(`  ${k}: ${v}`);
  console.log(`worst Foxy D ${worstD} | min box ${(minBoxAll * 100).toFixed(0)}% | min power left ${minPower}`);
}
