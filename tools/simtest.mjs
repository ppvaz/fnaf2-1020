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
  const wbGate = gate.units.find(u => u.id === 'withbonnie');
  wbGate.idx = wbGate.path.length - 2; // CAM 05 -> left opening requires cams up
  gate.frame = C.MO_FRAMES;
  gate.onFiveSecond();
  if (wbGate.atOpening || !wbGate.pending)
    throw new Error('closed cams-up entry gate did not retain W. Bonnie as pending');
  gate.monitor = 'up';
  gate.tickUnits(gate.frame);
  if (!wbGate.atOpening || wbGate.pending)
    throw new Error('pending W. Bonnie did not advance when the cams-up gate opened');

  // A short office-light tap latches through the next global second tick, but
  // only blocks the route edges that test `viewing hall light` = 0 in the
  // source.
  const lightGate = new Sim({ seed: 3, worst: true, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, powerEnabled: false, record: false });
  const litWb = lightGate.units.find(u => u.id === 'withbonnie');
  litWb.idx = 1; // source CAM 07 -> hall stage 1 (g381) is light-gated
  lightGate.press('light'); lightGate.tick(); lightGate.release('light');
  litWb.pending = true;
  lightGate.tickUnits(lightGate.frame);
  if (!litWb.pending || litWb.idx !== 1)
    throw new Error('W. Bonnie crossed a sourced light-gated edge while latch was active');
  while (lightGate.frame < C.FPS) lightGate.tick();
  if (litWb.pending || litWb.idx !== 2)
    throw new Error('W. Bonnie did not cross after the office-light latch cleared');

  const ungated = new Sim({ seed: 4, worst: true, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, powerEnabled: false, record: false });
  const lateWb = ungated.units.find(u => u.id === 'withbonnie');
  lateWb.idx = 3; lateWb.pending = true; // CAM 01 -> CAM 05 (g383) has no light gate
  ungated.press('light'); ungated.tick(); ungated.release('light');
  ungated.tickUnits(ungated.frame);
  if (lateWb.pending || lateWb.idx !== 4)
    throw new Error('office light incorrectly blocked an ungated W. Bonnie edge');

  const ventLight = new Sim({ seed: 5, worst: true, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, record: false });
  const ventWb = ventLight.units.find(u => u.id === 'withbonnie');
  ventWb.idx = 1; ventWb.pending = true;
  ventLight.press('ventR'); ventLight.tick(); ventLight.release('ventR');
  if (!ventWb.pending || ventLight.power !== C.POWER_FRAMES - 1)
    throw new Error('right vent light did not share the sourced light latch and battery');

  const threshold = new Sim({ seed: 6, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, powerEnabled: false, record: false });
  const tc = threshold.units.find(u => u.id === 'toychica');
  tc.idx = tc.path.length - 1; tc.atOpening = true;
  tc.openingReadyAt = threshold.frame + C.TOY_CHICA_OPENING_FRAMES;
  threshold.press('mask');
  if (!tc.atOpening)
    throw new Error('Toy Chica incorrectly received an immediate marker-122 mask repel');
  threshold.maskAnim = 0;
  for (let n = 1; n <= 5; n++) {
    threshold.frame = n * C.FPS;
    threshold.tickUnits(threshold.frame);
  }
  if (tc.atOpening || tc.idx !== 0)
    throw new Error('five sourced Toy Chica mask ticks did not clear marker 122');

  const maskedArrival = new Sim({ seed: 7, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, powerEnabled: false, record: false });
  const arrivingTc = maskedArrival.units.find(u => u.id === 'toychica');
  arrivingTc.idx = arrivingTc.path.length - 2;
  maskedArrival.press('mask');
  maskedArrival.advance(arrivingTc);
  if (!arrivingTc.atOpening)
    throw new Error('mask already on incorrectly erased a newly arrived threshold attacker');

  const tbCue = new Sim({ seed: 1, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, powerEnabled: false, record: false });
  const cueTb = tbCue.units.find(u => u.id === 'toybonnie');
  cueTb.idx = cueTb.path.length - 1; cueTb.atOpening = true;
  cueTb.openingReadyAt = C.s(5);
  tbCue.press('mask');
  if (!cueTb.atOpening)
    throw new Error('mask directly repelled Toy Bonnie before his office cue existed');
  tbCue.maskAnim = 0;
  tbCue.frame = C.TOY_BONNIE_CUE_FRAMES;
  tbCue.tickUnits(tbCue.frame);
  if (!cueTb.atOpening || !tbCue.blackout.active || tbCue.blackout.unitId !== 'toybonnie')
    throw new Error('Toy Bonnie mask cue did not start the sourced office sequence');

  const streakEncounter = new Sim({ seed: 8, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, powerEnabled: false, record: false });
  const encounterWb = streakEncounter.units.find(u => u.id === 'withbonnie');
  encounterWb.idx = encounterWb.path.length - 1; encounterWb.atOpening = true;
  streakEncounter.tickUnits(0);
  if (!streakEncounter.blackout.active || streakEncounter.blackout.unitId !== 'withbonnie')
    throw new Error('cams-down W. Bonnie did not start the shared office sequence');
  streakEncounter.press('mask');
  while (streakEncounter.frame < C.BLACKOUT_FRAMES) streakEncounter.tick();
  if (!streakEncounter.alive || encounterWb.atOpening || streakEncounter.blackout.active)
    throw new Error('timely fully-on mask did not survive and resolve the office sequence');

  const missedEncounter = new Sim({ seed: 9, worst: true, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, powerEnabled: false, record: false });
  const missedWb = missedEncounter.units.find(u => u.id === 'withbonnie');
  for (const u of missedEncounter.units) if (u !== missedWb) u.done = true;
  missedWb.idx = missedWb.path.length - 1; missedWb.atOpening = true;
  missedEncounter.tickUnits(0);
  while (missedEncounter.alive && missedEncounter.frame < C.BLACKOUT_FRAMES)
    missedEncounter.tick();
  if (!missedEncounter.alive || !missedWb.inside || missedWb.atOpening)
    throw new Error('missed 45-frame fuse did not send the attacker to marker 123');
  missedEncounter.press('mask');
  while (missedEncounter.alive && missedEncounter.frame < C.BLACKOUT_FRAMES + C.FPS * 2)
    missedEncounter.tick();
  if (missedEncounter.alive || missedEncounter.death?.reason !== 'inside-office')
    throw new Error('marker-123 mask roll did not start the sourced 40-frame attack');

  const fuseEdge = new Sim({ seed: 10, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, powerEnabled: false, record: false });
  const edgeWb = fuseEdge.units.find(u => u.id === 'withbonnie');
  edgeWb.idx = edgeWb.path.length - 1; edgeWb.atOpening = true;
  fuseEdge.tickUnits(0);
  while (fuseEdge.frame < C.maskGraceFrames(7) - C.MASK_ANIM_ON) fuseEdge.tick();
  fuseEdge.press('mask'); // becomes fully on exactly as group 532 arms the attack
  while (fuseEdge.alive && fuseEdge.frame < C.BLACKOUT_FRAMES) fuseEdge.tick();
  if (!fuseEdge.alive || !edgeWb.inside)
    throw new Error('mask completion on the fuse-expiry frame incorrectly defused the encounter');

  const endgame = new Sim({ seed: 2, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, powerEnabled: false, record: false });
  const armedTb = endgame.units.find(u => u.id === 'toybonnie');
  armedTb.idx = armedTb.path.length - 1; armedTb.atOpening = true; armedTb.openingReadyAt = 0;
  endgame.monitor = 'up'; endgame.camsUpSince = endgame.frame;
  endgame.tickUnits(endgame.frame);
  if (!endgame.alive || !armedTb.inside)
    throw new Error('armed Toy Bonnie incorrectly received the shared cams-up streak grace');
  endgame.setMonitor(false);
  while (endgame.alive && endgame.frame < C.INSIDE_ATTACK_FRAMES) endgame.tick();
  if (endgame.alive || endgame.death?.reason !== 'inside-office')
    throw new Error('Toy Bonnie at marker 123 did not attack on monitor lowering');

  const mangleRaise = new Sim({ seed: 11, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, powerEnabled: false, record: false });
  const mg = mangleRaise.units.find(u => u.id === 'mangle');
  for (const u of mangleRaise.units) if (u !== mg) u.done = true;
  mg.idx = mg.path.length - 1; mg.atOpening = true;
  mangleRaise.setMonitor(true);
  while (mangleRaise.monAnim > 0) mangleRaise.tick();
  if (!mg.inside || mg.atOpening)
    throw new Error('Mangle did not cross 122 -> 123 when the monitor raise completed');

  const mangleMask = new Sim({ seed: 12, worst: true, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, powerEnabled: false, record: false });
  const maskedMg = mangleMask.units.find(u => u.id === 'mangle');
  for (const u of mangleMask.units) if (u !== maskedMg) u.done = true;
  maskedMg.idx = maskedMg.path.length - 1; maskedMg.atOpening = true;
  mangleMask.press('mask');
  while (mangleMask.maskAnim > 0) mangleMask.tick();
  for (let n = 0; n < 2; n++) {
    while (mangleMask.frame % C.FPS !== 0) mangleMask.tick();
    if (n === 0) mangleMask.tick();
  }
  mangleMask.press('mask');
  mangleMask.press('mask');
  while (mangleMask.maskAnim > 0) mangleMask.tick();
  if (maskedMg.maskExposureTicks !== 0)
    throw new Error('a new fully-on mask did not reset Mangle mask exposure');
  const firstMaskTick = Math.ceil((mangleMask.frame + 1) / C.FPS) * C.FPS;
  for (let n = 0; n < 5; n++) {
    mangleMask.frame = firstMaskTick + n * C.FPS;
    mangleMask.tickUnits(mangleMask.frame);
  }
  if (maskedMg.atOpening || maskedMg.idx !== 0)
    throw new Error('five continuous sourced Mangle mask ticks did not clear marker 122');

  // Groups 556-559 execute before 747-750. If both marker-123 rolls pass on
  // one scheduler tick, the attacker leaves but the global danger countdown
  // must survive that return.
  const orderedInside = new Sim({ seed: 13, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, powerEnabled: false, record: false });
  const orderedTb = orderedInside.units.find(u => u.id === 'withbonnie');
  for (const u of orderedInside.units) if (u !== orderedTb) u.done = true;
  orderedTb.inside = true;
  orderedInside.maskOn = true; orderedInside.maskAnim = 0;
  orderedInside.rng.chance = () => true;
  orderedInside.frame = C.FPS;
  orderedInside.tickUnits(orderedInside.frame);
  if (orderedTb.inside || orderedTb.insideDangerAt !== C.FPS + C.INSIDE_ATTACK_FRAMES)
    throw new Error('same-tick marker-123 leave incorrectly cancelled danger 2');
  orderedInside.frame = orderedTb.insideDangerAt;
  orderedInside.tickUnits(orderedInside.frame);
  if (orderedInside.alive || orderedInside.death?.reason !== 'inside-office')
    throw new Error('persisted marker-123 danger did not complete after 40 frames');

  const insideTriggers = new Sim({ seed: 14, worst: true, bbEnabled: false,
    foxyEnabled: false, gfEnabled: false, boxEnabled: false, powerEnabled: false,
    record: false });
  const insideTb = insideTriggers.units.find(u => u.id === 'toybonnie');
  const insideMg = insideTriggers.units.find(u => u.id === 'mangle');
  for (const u of insideTriggers.units)
    if (u !== insideTb && u !== insideMg) u.done = true;
  insideTb.inside = true;
  insideTriggers.monitor = 'up';
  insideTriggers.frame = C.FPS * 10;
  insideTriggers.tickUnits(insideTriggers.frame);
  if (insideTb.insideDangerAt !== insideTriggers.frame + C.INSIDE_ATTACK_FRAMES)
    throw new Error('Toy Bonnie marker-123 ten-second cameras-up trigger was not modeled');

  // Isolate Mangle after checking Toy Bonnie: her 1-in-20 cameras-up roll arms
  // a later cameras-down edge rather than raising danger immediately.
  insideTb.done = true; insideTb.insideDangerAt = -1;
  insideMg.inside = true;
  insideTriggers.frame = C.FPS * 11;
  insideTriggers.tickUnits(insideTriggers.frame);
  if (!insideMg.insideArmed || insideMg.insideDangerAt >= 0)
    throw new Error('Mangle marker-123 cameras-up roll did not arm separately');
  insideTriggers.setMonitor(false);
  if (insideMg.insideDangerAt !== insideTriggers.frame + C.INSIDE_ATTACK_FRAMES)
    throw new Error('cameras-down edge did not convert Mangle arm into danger 2');

  const mutex = new Sim({ seed: 15, bbEnabled: false, foxyEnabled: false,
    gfEnabled: false, boxEnabled: false, powerEnabled: false, record: false });
  const mutexWb = mutex.units.find(u => u.id === 'withbonnie');
  const mutexTf = mutex.units.find(u => u.id === 'toyfreddy');
  mutex.monitor = 'up';
  mutexWb.idx = mutexWb.path.length - 2;
  mutex.advance(mutexWb);
  mutexTf.idx = mutexTf.path.length - 2;
  if (mutex.canAdvance(mutexTf, mutex.frame))
    throw new Error('`office occupied` mutex admitted two shared attackers to marker 122');
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
