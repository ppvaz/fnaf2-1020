// The device pilot, run in the simulator.
//
// tools/device/trial-minus7.sh drives the phone from a fixed millisecond
// table. This replays that exact table against the sourced engine, so a
// schedule change can be judged before it costs a night on the device.
//
// Unlike tools/bbtest.mjs -- whose bot reads sim state freely -- this bot is
// blind by construction. Its only optional input is one left-vent check per
// cycle, which is what the phone can actually do: flash the left vent light
// and classify one screenshot. That check is sourced: with the left light on,
// Balloon Boy standing at the vent opening renders his own view (group 289),
// distinct from the empty-vent view (group 287).
//
//   node tools/pilottest.mjs 200            # blind, as the device runs today
//   node tools/pilottest.mjs 200 --vent     # with the once-a-cycle vent check
//   node tools/pilottest.mjs 200 --vent --cycles=80
import { pathToFileURL } from 'node:url';
import * as C from '../src/config.js';
import { Sim } from '../src/engine.js';

const ms = (v) => Math.round(v / 1000 * C.FPS);

// trial-minus7.sh, PRESS_MODE=fast-swipe: the opening sequence, then a 5000 ms
// cycle from base = 7000 + cycle * 5000. Camera-light and hall presses are
// holds; the phone's 60 ms swipe is one frame of contact but the game latches
// the flash for the frame it lands on.
const OPENING = [
  [180, 'tap', 'monitor'], [460, 'tap', 'cam:11'],
  [4000, 'tap', 'cam:10'], [4190, 'hold', 'light', 60],
  [4380, 'tap', 'cam:4'], [4570, 'hold', 'light', 60],
  [4760, 'tap', 'cam:7'], [4950, 'hold', 'light', 60],
  [5140, 'tap', 'cam:11'],
];

const CYCLE = [
  [0, 'tap', 'monitor'],                       // cams down
  [450, 'tap', 'mask'], [800, 'tap', 'mask'],  // Golden Freddy flick
  [950, 'hold', 'light', 200],                 // hall, two attempts
  [1300, 'hold', 'light', 150],
  [1550, 'tap', 'monitor'],                    // cams up
  [2050, 'tap', 'cam:10'], [2240, 'hold', 'light', 60],
  [2430, 'tap', 'cam:4'], [2620, 'hold', 'light', 60],
  [2810, 'tap', 'cam:7'], [3000, 'hold', 'light', 60],
  [3190, 'tap', 'cam:11'], [3380, 'hold', 'wind', 1400],
];

// Same cycle with the box wound first and the three stall cameras refreshed
// last, so the newest flash is ~1 s old when the cams drop. That is what makes
// a Balloon Boy mask hold survivable: the 400-frame stun has to cover the whole
// masked window, and the human Phase B buys that margin the same way.
const CYCLE_LATE_FLASH = [
  [0, 'tap', 'monitor'],                       // cams down
  [450, 'tap', 'mask'], [800, 'tap', 'mask'],  // Golden Freddy flick
  [950, 'hold', 'light', 200],
  [1300, 'hold', 'light', 150],
  [1550, 'tap', 'monitor'],                    // cams up
  [1800, 'tap', 'cam:11'], [1990, 'hold', 'wind', 1400],
  [3500, 'tap', 'cam:10'], [3690, 'hold', 'light', 60],
  [3880, 'tap', 'cam:4'], [4070, 'hold', 'light', 60],
  [4260, 'tap', 'cam:7'], [4450, 'hold', 'light', 60],
];

// The response when the vent check says Balloon Boy is at the opening. He
// walks in on the next completed monitor raise (g290-291), so the monitor must
// stay down until he is gone. The check happens with the cams already down, so
// the mask goes on immediately and holds for more than the five consecutive
// fully-masked scheduler ticks that send him back to CAM 10 (g294). The
// response occupies two cycles and re-flashes the stall cameras on the way out.
const RESPONSE = [
  [0, 'tap', 'mask'],                          // mask on, cams stay down
  // No hall flash can happen in here: g75/g84 require mask = 0, so a masked
  // player can only take the mask off. The whole window is dark for Foxy.
  [5900, 'tap', 'mask'],                       // >5 fully-masked ticks, then off
  // The raise must not land in the 0.3 s before a 5 s interval: on Android
  // that hands Golden Freddy a free spawn and the same raise then kills you.
  // The check fires at base+300, so this lands 200 ms past the interval.
  [6200, 'tap', 'monitor'],
  [6700, 'tap', 'cam:10'], [6890, 'hold', 'light', 60],
  [7080, 'tap', 'cam:4'], [7270, 'hold', 'light', 60],
  [7460, 'tap', 'cam:7'], [7650, 'hold', 'light', 60],
  [7840, 'tap', 'cam:11'], [8030, 'hold', 'wind', 1400],
  // Ends with the monitor up, which is what the normal cycle expects.
];

// The phone flashes the left vent just before the cams come up, which is the
// last moment a response can still beat the raise that would let him in.
const VENT_CHECK_AT = 300;

export function run(opts = {}) {
  const cycles = opts.cycles ?? 80;
  const sim = new Sim(Object.assign({ seed: 1 }, opts.sim));
  const queue = [];
  const at = (t0, table) => table.forEach(([o, kind, act, dur]) =>
    queue.push([t0 + ms(o), kind, act, dur ? ms(dur) : 0]));

  at(0, OPENING);
  let checks = 0, responses = 0, missed = 0;
  // Absolute frame each cycle starts at, matching base = 7000 + cycle * 5000.
  const cycleAt = (k) => ms(7000 + k * 5000);
  const cycleTable = opts.lateFlash ? CYCLE_LATE_FLASH : CYCLE;
  for (let k = 0; k < cycles; k++) at(cycleAt(k), cycleTable);

  const releases = [];
  let skipUntil = -1;
  while (sim.alive && !sim.won) {
    const f = sim.frame;

    // One observation per cycle, at a fixed phase -- everything else is blind.
    if (opts.vent) {
      const k = Math.round((f - ms(7000 + VENT_CHECK_AT)) / ms(5000));
      if (k >= 0 && f === cycleAt(k) + ms(VENT_CHECK_AT) && f > skipUntil) {
        checks++;
        if (sim.bb.inOpening) {
          responses++;
          // Drop the rest of this cycle's scripted presses and the next
          // cycle's: the response occupies both.
          const resume = cycleAt(k + 2);
          for (let i = queue.length - 1; i >= 0; i--)
            if (queue[i][0] >= f && queue[i][0] < resume) queue.splice(i, 1);
          at(f, RESPONSE);
          queue.sort((a, b) => a[0] - b[0]);
          skipUntil = resume;
        }
      }
    }

    while (queue.length && queue[0][0] <= f) {
      const [, kind, act, dur] = queue.shift();
      if (kind === 'tap') sim.press(act);
      else { sim.press(act); releases.push([f + dur, act]); }
    }
    for (let i = releases.length - 1; i >= 0; i--)
      if (releases[i][0] <= f) { sim.release(releases[i][1]); releases.splice(i, 1); }

    if (opts.vent && sim.bb.inOpening && sim.camsUp) missed++;
    sim.tick();
  }
  return { sim, checks, responses, missed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const n = +(process.argv[2] || 200);
  const vent = process.argv.includes('--vent');
  const lateFlash = process.argv.includes('--late-flash');
  const cyclesArg = (process.argv.find(a => a.startsWith('--cycles=')) || '').split('=')[1];
  const cycles = cyclesArg ? +cyclesArg : 80;
  const fails = {};
  let survived = 0, minBox = 1, minPower = Infinity, checks = 0, responses = 0;
  for (let i = 0; i < n; i++) {
    const r = run({ vent, cycles, lateFlash, sim: { seed: (i * 2246822519) >>> 0 } });
    checks += r.checks; responses += r.responses;
    minBox = Math.min(minBox, r.sim.box); minPower = Math.min(minPower, r.sim.power);
    if (r.sim.won) survived++;
    else {
      const key = `${r.sim.death.reason}: ${r.sim.death.detail}`;
      fails[key] = (fails[key] || 0) + 1;
    }
  }
  console.log(`${survived}/${n} survived a full night — device schedule${lateFlash ? ' (late flash)' : ''}${vent ? ' + vent check' : ' (blind, as shipped)'}`);
  for (const [k, v] of Object.entries(fails).sort((a, b) => b[1] - a[1])) console.log(`  ${v}x  ${k}`);
  console.log(`min box ${(minBox * 100).toFixed(0)}% | min power ${minPower}` +
    (vent ? ` | ${responses} responses in ${checks} checks` : ''));
}
