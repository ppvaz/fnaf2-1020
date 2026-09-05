// Minus Toys (Zach_Scream 2025-05-13), frame-exact, on the sourced engine.
//
//   node tools/minustoys/cycle.mjs --night=7 --seeds=3000
//   node tools/minustoys/cycle.mjs --night=7 --seeds=3000 --open-loop
//   node tools/minustoys/cycle.mjs --night=2 --seeds=200
//
// WHAT A NUMBER FROM HERE IS. A statement about the model, nothing more —
// same charter as tools/minus7/cycle.mjs. Every constant is read from
// `config.js` or a rule the engine already implements; the [CALIBRATED]
// offsets reproduce the published routine and the evaluator the research
// package already owns (`packages/research/src/families/minus-toys.js`).
//
// ---------------------------------------------------------------- the route
//
// docs/strategy/MINUS-3-STRATEGY.md §3, the author's own routine:
//
//   * Before 0:05 the split camera is armed (SETUP): CAM 11 selected, CAM 09
//     touched, monitor dropped inside the 200 ms sample window. From then on
//     `viewing` is 11 (the box winds) while the `your view` marker sits on 9 —
//     and every camera flash lands on CAM 09 (plant-model.js:607-611 names
//     this exact desync "Minus Toys"). The three Toys never leave the stage.
//   * The monitor is never up on a 5 s interval, so office Golden Freddy
//     never rolls (g336 needs `monitor === MON_UP` inside onFiveSecond).
//   * Each armed session: raise at interval+6, a 5-frame CAM 09 flash, wind
//     to interval+235, then the exit — light held across the drop so the
//     camera flash becomes a hall flash (Foxy's D zeroes), mask at +242 to
//     defend whatever blackout the drop started, light dies on the mask.
//   * The mask hold runs to interval+540 (~:X4 of the second window). On the
//     published cadence that is exactly Balloon Boy's five one-second mask
//     ticks (fully on at +254; ticks at +300/+360/+420/+480/+540), and it is
//     the ~0.66 s margin MINUS-3-STRATEGY.md measured the device port
//     dropping (`n2-minustoys-0117`).
//
// ------------------------------------------------------- what the loop adds
//
// The research evaluator is pure open-loop, and open-loop cannot survive
// Night 7: a Mangle or Balloon Boy sitting at an opening when the next
// session raises is a walk-in, and Mangle armed while the cams are up is a
// committed attack. The fix is the one the strategy text itself prescribes —
// "always assume someone is in either vent": count vent bangs (the THUD the
// Minus 7 §6 2026-08-24 note licenses reading while the stalls hold) and hold
// the mask until the count returns to zero. `--open-loop` disables exactly
// that layer and reproduces the research family's schedule for A/B.
//
// Nothing else is reactive: no box level, no stall table, no D, no oracle.
import * as C from '@fnaf2-1020/core/mechanics';
import { Sim, Rng } from '@fnaf2-1020/core/mechanics';

// Interval-relative offsets (w0 = the 5 s interval the session hangs from),
// [CALIBRATED] to the research family's LOOP rows (606/619/624/835/840/842/844
// over interval 600). The raise itself sits at w0+6.
export const CYCLE = {
  raise: 6,
  flashOn: 13, flashOff: 17,   // the CAM 09 stall flash, monitor fully up
  windOn: 18,                  // viewing=11 restored from lastViewed: wind
  windOff: 229,                // release wind, press the exit light
  drop: 240,                   // the :X4 exit; light held across it
  mask: 242,                   // defend the blackout; the light dies here
  lightOff: 244,
  unmaskMin: 540,              // the published hold length (~:X4 next window)
};

const JITTER_SALT = 0x6d32746f;        // "m2to"; its own stream, never the sim's

function jitterer(seed, slackMs) {
  if (!slackMs) return () => 0;
  const span = Math.round(slackMs * C.FPS / 1000);
  return (row, win) => {
    const rng = new Rng((JITTER_SALT ^ (seed * 2654435761) ^ (win * 40503) ^ row) >>> 0);
    return rng.int(-span, span);
  };
}
const ROW = { raise: 1, flashOn: 2, flashOff: 3, wind: 4, windOff: 5, drop: 6,
              mask: 7, lightOff: 8 };

// The first frame at which a continuous fully-on hold begun at `f` is
// PROVABLY finished serving Balloon Boy's `VENT_MASK_TICKS`
// (plant-model.js:747-751): the fifth one-second boundary, plus one — the
// tick itself runs inside that frame's `sim.tick()`, so unmasking on the
// boundary frame cancels the fifth tick and he never leaves.
const fifthBoundary = (f) => f + ((C.FPS - (f % C.FPS)) % C.FPS) + 4 * C.FPS + 1;

/**
 * One full night under the Minus Toys cycle.
 * @param {number} seed
 * @param {{night?: number, slackMs?: number, openLoop?: boolean,
 *          cycle?: typeof CYCLE, simOpts?: object}} [opts]
 */
export function runMinusToys7(seed, opts = {}) {
  const { night = 7, slackMs = 0, openLoop = false, cycle = CYCLE,
          simOpts = {} } = opts;
  const sim = new Sim({ seed, night, ...simOpts });
  // `opts.shift` lets a caller supply its own executor error model in place
  // of the iid-per-row one above -- (row, win) -> frames. Used by
  // tools/phase-tolerance.mjs, whose latency model has to reach the same
  // place the jitterer does. Omitted, nothing changes.
  const shift = opts.shift ?? jitterer(seed, slackMs);

  const queue = new Map();
  const at = (frame, fn) => {
    const f = Math.max(sim.frame + 1, frame);
    if (!queue.has(f)) queue.set(f, []);
    queue.get(f).push(fn);
  };
  const up = () => sim.monitor === 'up';
  const down = () => sim.monitor === 'down';

  // The vent-bang ledger. Arrivals at an opening and departures from one both
  // emit `vent-bang`; BB's stage-4 hop bangs with `cam: true` (he is on CAM
  // 05, not at an opening) and must not count. `threats` is the office-
  // threshold occupancy the strategy text tells the player to assume.
  let threats = 0;
  let eventIndex = 0;
  const drainEvents = () => {
    for (; eventIndex < sim.events.length; eventIndex++) {
      const e = sim.events[eventIndex];
      if (e.type !== 'vent-bang') continue;
      if (e.data?.cam) continue;
      threats = Math.max(0, threats + (e.data?.leaving ? -1 : 1));
    }
  };

  // The unmask decision is polled, not queued: it waits on the ledger.
  let poll = null;            // { w0, fullOn }
  const pressMask = (w0) => {
    sim.press('mask');
    if (sim.maskOn) poll = { w0, fullOn: sim.frame + C.MASK_ANIM_ON };
  };

  let session = 0;
  const scheduleSession = (raiseFrame, w0) => {
    const sh = (row) => shift(row, w0 / C.MO_FRAMES);
    session++;
    at(raiseFrame + cycle.flashOn + sh(ROW.flashOn), () => { mark('flashOn'); if (up()) sim.press('light'); });
    at(raiseFrame + cycle.flashOff + sh(ROW.flashOff), () => { mark('flashOff'); sim.release('light'); });
    at(raiseFrame + cycle.windOn + sh(ROW.wind), () => { mark('windOn'); if (up()) sim.press('wind'); });
    at(raiseFrame + cycle.windOff + sh(ROW.windOff),
       () => { mark('windOff'); sim.release('wind'); sim.press('light'); });
    at(w0 + cycle.drop + sh(ROW.drop), () => { mark('drop'); if (!down()) sim.press('monitor'); });
    at(w0 + cycle.mask + sh(ROW.mask), () => { mark('maskRow'); if (!sim.maskOn) pressMask(w0); });
    at(w0 + cycle.lightOff + sh(ROW.lightOff), () => { mark('lightOff'); sim.release('light'); });
  };

  const flashAfterUnmask = (unmaskFrame) => {
    at(unmaskFrame + C.MASK_ANIM_OFF + 1, () => {
      if (sim.maskFullyOff && down()) sim.press('light');
    });
    at(unmaskFrame + C.MASK_ANIM_OFF + 5, () => sim.release('light'));
  };

  // The night's first window arms the split camera and stalls the Toys before
  // 0:05; the research SETUP schedule, verbatim, plus the hold bookkeeping.
  at(0, () => { if (down()) sim.press('monitor'); });
  at(13, () => { if (up()) sim.press('cam:11'); });
  at(25, () => { if (up()) { sim.press('cam:9'); sim.press('monitor'); } });
  at(48, () => { if (down()) sim.press('monitor'); });
  at(62, () => { if (up()) sim.press('light'); });
  at(66, () => sim.release('light'));
  at(67, () => { if (up()) sim.press('wind'); });
  at(235, () => { sim.release('wind'); sim.press('light'); });
  at(240, () => { if (!down()) sim.press('monitor'); });
  at(242, () => { if (!sim.maskOn) pressMask(0); });
  at(244, () => sim.release('light'));

  let raiseAt = -1;   // the raise slot this window offered
  const trace = opts.trace ? [] : null;
  const mark = (kind, extra = {}) => {
    if (trace) trace.push({ f: sim.frame + 1, kind, threats,
                            D: sim.foxy.D, ...extra });
  };
  while (sim.alive && !sim.won) {
    const frame = sim.frame + 1;
    const phase = frame % C.MO_FRAMES;
    const w0 = frame - phase;

    const due = queue.get(frame);
    if (due) { queue.delete(frame); for (const fn of due) fn(); }
    drainEvents();
    if (trace && phase === 0) mark('check');

    // The unmask poll: published hold length, BB's five ticks, and — unless
    // --open-loop — an empty opening ledger.
    if (poll && sim.maskOn) {
      const deadline = Math.max(poll.w0 + cycle.unmaskMin,
                                fifthBoundary(poll.fullOn));
      if (frame >= deadline && (openLoop || threats === 0)) {
        poll = null;
        mark('unmask');
        sim.press('mask');
        flashAfterUnmask(frame);
      }
    }

    // Interim vent assumption: while down and unmasked with someone at an
    // opening, mask until the ledger clears. Covers arrivals between the
    // unmask flash and the next raise slot, and blackouts the drop started
    // while the monitor was still lowering.
    if (!openLoop && threats > 0 && down() && sim.maskFullyOff && !poll &&
        frame > 300) {
      pressMask(w0);
    }

    // Raise slots: interval+6, armed camera, nobody at an opening, mask off.
    // Open-loop raises every slot regardless; that is the A/B arm.
    if (phase === cycle.raise && raiseAt !== w0 && down() && !sim.maskOn &&
        sim.maskAnim === 0 && !sim.bb.inOpening && !sim.blackout.active &&
        (openLoop || threats === 0)) {
      raiseAt = w0;
      mark('raise');
      sim.press('monitor');
      scheduleSession(frame, w0);
    }

    sim.tick();
  }
  return {
    seed, night, won: sim.won, frame: sim.frame, trace,
    seconds: +(sim.frame / C.FPS).toFixed(1),
    death: sim.death ? { reason: sim.death.reason, detail: sim.death.detail } : null,
    powerLeft: sim.power, box: +sim.box.toFixed(3),
    blackouts: sim.blackoutCount, brokeLoose: sim.mistakes.length,
    sessions: session,
  };
}

/** A cohort, shaped for `tools/pool.mjs`. */
export function cohort({ night = 7, from, to, slackMs = 0, openLoop = false,
                         worst = false } = {}) {
  const deaths = {};
  let won = 0, minPower = Infinity, minBox = Infinity, loose = 0;
  const lost = [];
  for (let seed = from; seed <= to; seed++) {
    const r = runMinusToys7(seed, { night, slackMs, openLoop,
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

// CLI
if (process.argv[1] &&
    import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const arg = (name, dflt) => {
    const raw = process.argv.find(a => a.startsWith(`--${name}=`));
    return raw ? +(raw.slice(name.length + 3)) : dflt;
  };
  const night = arg('night', 7);
  const seeds = arg('seeds', 300);
  const from = arg('from', 1);
  const openLoop = process.argv.includes('--open-loop');
  const t0 = Date.now();
  const r = cohort({ night, from, to: from + seeds - 1, openLoop });
  console.log(JSON.stringify({ ...r, elapsedMs: Date.now() - t0 }, null, 1));
}
