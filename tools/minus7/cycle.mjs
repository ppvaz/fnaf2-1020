// The canonical Minus 7 main cycle, frame-exact, run against the sourced
// engine (`packages/core/src/mechanics/plant-model.js`).
//
//   node tools/minus7/cycle.mjs --night=7 --seeds=3000
//   node tools/minus7/cycle.mjs --night=7 --all-seeds        # every RNG stream
//   node tools/minus7/cycle.mjs --night=7 --seeds=1200 --slack=60
//
// WHAT A NUMBER FROM HERE IS. A statement about the model, and nothing else.
// It is not gameplay evidence, it is not a device claim, and it does not move
// a rung of Plan 12's ladder. Nothing here is a new game rule; every constant
// below is read from `config.js` or derived from a rule the engine already
// implements.
//
// ---------------------------------------------------------------- the route
//
// This is `docs/strategy/MINUS-7-STRATEGY.md` §5 with §8's one structural
// change: THE MONITOR IS NEVER UP ON A 5 s INTERVAL. Everything else follows
// from that single decision, and each consequence is a sourced rule:
//
//   * Golden Freddy (office) cannot spawn at all. g336 rolls only with the
//     raise finished (`monitor === MON_UP` inside `onFiveSecond`), so a cycle
//     that is down on every `frame % MO_FRAMES === 0` removes him from the
//     night — and with him the §5 mask flick, its mask-off cliff, and the
//     hall-flash-into-Golden-Freddy death.
//   * Balloon Boy becomes deterministic. g417 is his only monitor-gated edge;
//     with the cams down at every interval his stage-4 roll can only LATCH
//     (`bb.pending`), and it is spent on the next completed raise. He
//     therefore always arrives at the opening at `raise + MONITOR_ANIM_UP`,
//     of our choosing, never mid-cycle. §6's Phase A deferral, taken to its
//     end.
//   * The hall flash moves from §5's `:X2` to `:X4.5`. §3.1 prices `:X2` at
//     D = 3 and calls it "the last safe value" at Foxy AI 17. Flashing 30
//     frames before the interval instead lands D = 0 AND puts the interval
//     inside the 50-frame hall pin (`FOXY_HALL_PIN_FRAMES`, group 855), which
//     skips his lock-on check outright. Two independent margins where §5 has
//     none.
//
// The one place the route pays for that is the Withereds/Toy Freddy entry
// streak: `entryStreakFrames(7)` is 360 frames and the cams-up leg here is
// ~237, so the streak is never in play even if a stall lapses.
//
// TWO SWEEPS PER CYCLE, not one. `STUN_FRAMES` is 400 and the cycle is 300,
// so one sweep is arithmetically enough — until Balloon Boy's mask window
// takes a whole cycle away, and a character that walked onto a choke camera
// during that window is never lit before its next roll. The late sweep
// (`sweepB`, just before the monitor drops) is what carries the stall across
// the mask; the early one carries anything that arrived on the interval.
//
// ------------------------------------------------------------ what it reads
//
// The stopwatch (§1's mandatory timer), its own two controls as they are
// drawn on screen, and the vent bang. Nothing else — no D, no stun table, no
// Golden Freddy presence, no AI levels. `bb.inOpening` is the arrival bang
// (thud + sample 21, g417/g607) and its falling edge is the departure bang
// (g292/g294), read here exactly as §6's 2026-08-24 note licenses it: while
// the stalls are current and the box is wound, no other writer of
// `THUD_SAMPLE` is loose. A lapsed stall costs the cue as well as the flash.
//
// An earlier revision also read `foxy.loc`, `foxy.gotYou` and `gf.inHall` to
// refuse an unsafe hall flash. Measured over 3000 Night 7 seeds it changed
// nothing (3000/3000 either way), so it is gone rather than carried as an
// unpriced privilege: with Foxy parked in the hall, `inTransit` holds
// `hallMovementUntil` up permanently and g779 can never bank hall exposure on
// Golden Freddy anyway.
import * as C from '@fnaf2-1020/core/mechanics';
import { Sim, Rng } from '@fnaf2-1020/core/mechanics';

const W = C.MO_FRAMES;                 // the movement grid: 300 frames

// Offsets in frames from the 5 s interval the cycle is anchored to. Only
// `sweepGap`/`windGap` are sourced outright (`MONITOR_ANIM_UP` is 12, so the
// first camera touch that the engine will accept is 12 frames after the tap);
// the rest are [CALIBRATED] and their margins are measured by `--slack`.
export const CYCLE = {
  raise: 2,        // monitor up, just after the interval
  sweepGap: 12,    // C.MONITOR_ANIM_UP: the first frame a camera select lands
  windGap: 16,     // select CAM 11 and start winding, one slot after the sweep
  windEnd: 244,    // release the wind
  sweepB: 245,     // the late sweep; its 400-frame stun carries the mask cycle
  lower: 250,      // monitor down, 50 frames before the interval
  hall: 270,       // the hall flash: D = 0 and pinUntil = interval + 20
  mask: 273,       // mask on for the Balloon Boy repel, 27 frames before it
  // A cycle whose cams-up leg cannot finish before `lower` is not started.
  raiseMax: 210,
  // ...unless there is still room for the compressed leg (raise, sweep, drop,
  // flash). This is the branch that carries the stall out of a mask window:
  // a full-length repel releases at interval+240 and the mask animation ends
  // at +256, which is past `raiseMax` and 44 frames short of the next roll.
  lateMax: 261,
};

const JITTER_SALT = 0x6d377374;        // "m7st"; its own stream, never the sim's

// Per-row iid timing error, the `human-gate.mjs` model: every scheduled row is
// shifted by an independent draw in +/-slackMs, compound rows (a sweep, a
// press/release pair) moving as one unit so their internal spacing survives.
function jitterer(seed, slackMs) {
  if (!slackMs) return () => 0;
  const span = Math.round(slackMs * C.FPS / 1000);
  return (row, win) => {
    const rng = new Rng((JITTER_SALT ^ (seed * 2654435761) ^ (win * 40503) ^ row) >>> 0);
    return rng.int(-span, span);
  };
}
const ROW = { raise: 1, sweepA: 2, wind: 3, windOff: 4, sweepB: 5, lower: 6,
              hall: 7, mask: 8 };

/**
 * One full night under the cycle above.
 * @param {number} seed
 * @param {{night?: number, slackMs?: number, bangLatencyMs?: number,
 *          cycle?: typeof CYCLE, simOpts?: object}} [opts]
 */
export function runCycle(seed, opts = {}) {
  const { night = 7, slackMs = 0, bangLatencyMs = 0, cycle = CYCLE,
          simOpts = {} } = opts;
  const sim = new Sim({ seed, night, ...simOpts });
  const shift = jitterer(seed, slackMs);
  const bangLatency = Math.round(bangLatencyMs * C.FPS / 1000);

  const queue = new Map();
  const at = (frame, fn) => {
    const f = Math.max(sim.frame + 1, frame);
    if (!queue.has(f)) queue.set(f, []);
    queue.get(f).push(fn);
  };
  const up = () => sim.monitor === 'up';
  const rising = () => sim.monitor === 'raising';

  // The three stall cameras, in §5's fixed order, with the light held across
  // all three: one camera select per frame is one power frame per room, and
  // the monitor is left parked on CAM 07 — which is where the Withered
  // marker hold (g344-348) wants it while the cams are down.
  const sweep = (base) => {
    at(base + 0, () => { if (up()) { sim.press('cam:10'); sim.press('light'); } });
    at(base + 1, () => { if (up()) sim.press('cam:4'); });
    at(base + 2, () => { if (up()) sim.press('cam:7'); });
    at(base + 3, () => sim.release('light'));
  };
  const hallFlash = () => {
    if (up() || rising() || sim.maskOn || sim.maskAnim > 0) return;
    sim.press('light');
    at(sim.frame + 2, () => sim.release('light'));
  };

  // --countUnmask: the departure bang is replaced by arithmetic. This build
  // zeroes bb.maskTicks on every entry into the fully-on state and departs at
  // 5 one-second ticks of one CONTINUOUS hold (plant-model.js:740-751), and
  // any 300 consecutive fully-on frames contain 5 second boundaries. So
  // unmask at press + MASK_ANIM_ON + 301 is provably past the 5th tick --
  // never while he is still in the opening. The bang stays in the model as a
  // fast-path for the 10%/tick early leave; with this flag its latency only
  // ever costs D, which the next hall flash resets.
  const countUnmask = opts.countUnmask ?? false;
  const UNMASK_SLACK = C.MASK_ANIM_ON + 301;

  let plannedWin = -1;
  let unmaskAt = -1;
  while (sim.alive && !sim.won) {
    const frame = sim.frame + 1;
    const phase = frame % W;
    const win = (frame - phase) / W;
    const w0 = win * W;

    const due = queue.get(frame);
    if (due) { queue.delete(frame); for (const fn of due) fn(); }

    if (sim.maskOn) {
      // The departure bang. `bangLatencyMs` is the player's reaction time; at
      // 0 this is an instant oracle and not a hand.
      if (!sim.bb.inOpening) {
        const bangAt = frame + bangLatency;
        unmaskAt = unmaskAt < 0 ? bangAt : Math.min(unmaskAt, bangAt);
      }
      if (unmaskAt >= 0 && frame >= unmaskAt) { sim.press('mask'); unmaskAt = -1; }
    } else if (sim.maskAnim === 0) {
      const maskDue = w0 + cycle.mask + shift(ROW.mask, win);
      if (frame === maskDue && sim.bb.inOpening && sim.monitor === 'down') {
        sim.press('mask');
        if (countUnmask) unmaskAt = frame + UNMASK_SLACK;
      } else if (plannedWin !== win && sim.monitor === 'down' &&
                 !sim.bb.inOpening &&
                 phase >= cycle.raise + shift(ROW.raise, win) &&
                 phase <= cycle.lateMax) {
        plannedWin = win;
        sim.press('monitor');
        sweep(frame + cycle.sweepGap + shift(ROW.sweepA, win));
        if (phase <= cycle.raiseMax) {
          at(frame + cycle.windGap + shift(ROW.wind, win), () => {
            if (up()) { sim.press(`cam:${C.BOX_CAM}`); sim.press('wind'); }
          });
          at(w0 + cycle.windEnd + shift(ROW.windOff, win), () => sim.release('wind'));
          sweep(w0 + cycle.sweepB + shift(ROW.sweepB, win));
          at(w0 + cycle.lower + shift(ROW.lower, win),
             () => { if (up() || rising()) sim.press('monitor'); });
          at(w0 + cycle.hall + shift(ROW.hall, win), hallFlash);
        } else {
          // The compressed leg: sweep and get back down before the interval,
          // then flash once the monitor has finished falling.
          at(frame + cycle.sweepGap + 4,
             () => { if (up() || rising()) sim.press('monitor'); });
          at(frame + cycle.sweepGap + 4 + C.MONITOR_ANIM_DOWN, hallFlash);
        }
      } else if (phase === cycle.hall + shift(ROW.hall, win) && plannedWin !== win) {
        hallFlash();   // a window with no cams-up leg still owes Foxy its flash
      }
    }
    sim.tick();
  }
  return {
    seed, night, won: sim.won, frame: sim.frame,
    seconds: +(sim.frame / C.FPS).toFixed(1),
    death: sim.death ? { reason: sim.death.reason, detail: sim.death.detail } : null,
    powerLeft: sim.power, box: +sim.box.toFixed(3),
    blackouts: sim.blackoutCount, brokeLoose: sim.mistakes.length,
  };
}

/** A cohort, shaped for `tools/pool.mjs`. */
export function cohort({ night = 7, from, to, slackMs = 0, bangLatencyMs = 0,
                         worst = false } = {}) {
  const deaths = {};
  let won = 0, minPower = Infinity, minBox = Infinity, loose = 0;
  const lost = [];
  for (let seed = from; seed <= to; seed++) {
    const r = runCycle(seed, { night, slackMs, bangLatencyMs,
                               simOpts: worst ? { worst: true } : {} });
    if (r.won) won++;
    else {
      if (lost.length < 8) lost.push(seed);
      const key = `${r.death.reason}: ${r.death.detail}`;
      deaths[key] = (deaths[key] ?? 0) + 1;
    }
    minPower = Math.min(minPower, r.powerLeft);
    minBox = Math.min(minBox, r.box);
    loose += r.brokeLoose;
  }
  return { night, from, to, runs: to - from + 1, won, deaths, lost,
           minPower, minBox, loose };
}
