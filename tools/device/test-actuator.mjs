// The actuator model must reproduce the measurements it claims to encode.
//
// Each check below pins one property the model exists for: holds keep their
// planned length (plans/04: an error model that varies flash lengths prices
// nothing), the queue preserves order, the mask-seam bands drop at the
// measured rates and never outside them, worst luck pins drops but not
// lateness, and a seeded actuator replays identically. No device.
import { pathToFileURL } from 'node:url';
import * as C from '../../src/config.js';
import { DeviceActuator, SEAM_SAFE_MS } from './actuator.mjs';

// The actuator only reads sim.frame and sim.maskOn, and writes press/release.
function stubSim() {
  return {
    frame: 0, maskOn: false, delivered: [],
    press(a) { this.delivered.push([this.frame, 'press', a]); },
    release(a) { this.delivered.push([this.frame, 'release', a]); },
  };
}

// Submit each event on its scheduled frame while the clock actually runs, the
// way a pilot does -- submitting first and draining afterwards would deliver
// the whole backlog on one frame and time nothing.
function runSchedule(sim, act, events, until) {
  const evs = [...events].sort((a, b) => a[0] - b[0]);
  for (sim.frame = 0; sim.frame <= until; sim.frame++) {
    while (evs.length && evs[0][0] === sim.frame) {
      const [, kind, a] = evs.shift();
      act[kind](a);
    }
    act.deliver();
  }
}

const problems = [];

// A hold's press and release share one draw, so its length survives lateness.
{
  for (let seed = 0; seed < 200; seed++) {
    const sim = stubSim();
    const act = new DeviceActuator(sim, { seed, lateMinMs: 110, lateMaxMs: 300 });
    runSchedule(sim, act, [
      [0, 'press', 'light'],
      [60, 'press', 'wind'], // unrelated traffic between down and up
      [90, 'release', 'light'],
    ], 200);
    const down = sim.delivered.find(d => d[2] === 'light' && d[1] === 'press');
    const up = sim.delivered.find(d => d[2] === 'light' && d[1] === 'release');
    if (up[0] - down[0] !== 90) {
      problems.push(`seed ${seed}: a 90-frame hold landed as ${up[0] - down[0]} frames`);
      break;
    }
  }
}

// Order in is order out, whatever each press draws.
{
  for (let seed = 0; seed < 200; seed++) {
    const sim = stubSim();
    const act = new DeviceActuator(sim, { seed, lateMinMs: 0, lateMaxMs: 400 });
    runSchedule(sim, act,
      [[0, 'press', 'a'], [3, 'press', 'b'], [4, 'press', 'c'], [20, 'press', 'd']], 100);
    const order = sim.delivered.map(d => d[2]).join('');
    if (order !== 'abcd') { problems.push(`seed ${seed}: delivered ${order}, not abcd`); break; }
  }
}

// The seam: run one mask-off -> monitor pair per trial at a controlled gap and
// compare the loss rate to the census (5/7 under 140 ms, 4/8 at 140-180 ms,
// 0/17 at 180+). The two sampled bands get a tolerance; the safe band gets
// none, because the measurement there is a clean zero.
function seamRate(gapFrames, trials, worst = false) {
  let lost = 0;
  for (let seed = 0; seed < trials; seed++) {
    const sim = stubSim();
    const act = new DeviceActuator(sim, { seed, worst, lateMinMs: 0, lateMaxMs: 0 });
    sim.maskOn = true;          // the landing mask press is the mask-OFF press
    act.press('mask'); act.deliver();
    sim.maskOn = false;
    sim.frame = gapFrames;
    act.press('monitor'); act.deliver();
    const dropped = !sim.delivered.some(d => d[2] === 'monitor');
    if (dropped) lost++;
    if (act.seamDrops !== (dropped ? 1 : 0)) return { broken: true };
  }
  return { rate: lost / trials };
}
{
  const ms = (fr) => fr * 1000 / C.FPS;
  const cases = [
    [6, 5 / 7, 0.06],   // 100 ms
    [10, 4 / 8, 0.06],  // 167 ms
    [11, 0, 0],         // 183 ms -- at or past SEAM_SAFE_MS, never lost
    [30, 0, 0],
  ];
  for (const [gap, want, tol] of cases) {
    const { rate, broken } = seamRate(gap, 2000);
    if (broken) { problems.push('seamDrops disagrees with what was delivered'); break; }
    if (Math.abs(rate - want) > tol)
      problems.push(`seam at ${ms(gap).toFixed(0)} ms lost ${(rate * 100).toFixed(1)}%, ` +
        `census says ${(want * 100).toFixed(1)}%`);
  }
  if (ms(11) < SEAM_SAFE_MS) problems.push('the safe-band case sits under SEAM_SAFE_MS');
  // Worst luck pins every in-band press lost and still never touches the safe band.
  if (seamRate(6, 50, true).rate !== 1) problems.push('worst luck let an in-band press land');
  if (seamRate(11, 50, true).rate !== 0) problems.push('worst luck dropped a safe-band press');
}

// A monitor press with no mask press before it is never seam-dropped.
{
  const sim = stubSim();
  const act = new DeviceActuator(sim, { seed: 7, worst: true, lateMinMs: 0, lateMaxMs: 0 });
  act.press('monitor'); act.deliver();
  if (!sim.delivered.length) problems.push('a monitor press with no seam was dropped');
}

// Seeded replay: the same seed lands the same schedule on the same frames.
{
  const runOnce = (seed) => {
    const sim = stubSim();
    const act = new DeviceActuator(sim, { seed, lateMinMs: 110, lateMaxMs: 300 });
    runSchedule(sim, act, [[0, 'press', 'monitor'], [30, 'press', 'cam:11'],
      [40, 'press', 'wind'], [200, 'press', 'mask']], 300);
    return JSON.stringify(sim.delivered);
  };
  if (runOnce(42) !== runOnce(42)) problems.push('the same seed produced two different nights');
  if (runOnce(42) === runOnce(43)) problems.push('two seeds produced the same lateness draws');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (problems.length) {
    console.error('device actuator model:');
    for (const p of problems) console.error('  FAIL  ' + p);
    process.exit(1);
  }
  console.log('device actuator: holds keep length, order holds, seam bands match the census, replays are seeded');
}
