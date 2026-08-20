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
