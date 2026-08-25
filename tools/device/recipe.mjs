// Emit the device pilot's cycle recipes from the exact simulator, with their
// budgets, as one artifact both the runner and its checks read.
//
// Why this exists: the cycle table used to live twice -- as JS here and as
// hand-typed millisecond literals inside trial-minus7.sh -- with nothing
// checking that they agreed and nothing tracking what a cycle spends. A hall
// pulse transcribed as the simulator's 83 ms reached the phone three times and
// `grade-minus7.py` found zero visible beams, because 83 ms is under the
// contact length Fusion's per-frame touch poll reliably sees.
//
// Usage: node tools/device/recipe.mjs [--night=6] [--slot-ms=120] ... [--json]
import { pathToFileURL } from 'node:url';
import * as C from '../../src/config.js';
import { Sim } from '../../src/engine.js';
import { run } from '../hidpilottest.mjs';

// The phone's proven floor for a contact Fusion cannot miss, and the camera
// spacing the shipped route uses. Both are device measurements; see
// docs/device/HID-MULTITOUCH.md.
export const MIN_CONTACT_MS = 100;
// 120 ms is what hid-sweep-probe.sh lands 4/4, and what a real night lands too:
// sweepcheck.py on night 6-26 reports "11/11 sweeps flashed all of 10,4,7", every
// camera lit while it was the selected feed. So the stun is being applied at
// this spacing and there is no measured reason to widen it.
//
// A widening to 140 ms was built and then withdrawn. The case for it was
// camtrace reporting "4 complete sweeps, 4 incomplete sweep starts" on that
// same night -- but camtrace grades the ordered 10-04-07-11 *sequence*, and at
// a finer dwell floor it reported MORE incomplete starts (7), not fewer, so it
// is measuring sequence shape rather than dropped selections. The independent
// signal disagreed with it and the independent signal has a negative control.
// This repo has already withdrawn one spacing figure that turned out to be a
// camtrace artifact; it is not going to adopt one.
//
// The emitter can still widen -- see the sweep branch, which anchors the END so
// the stun bridge does not move -- and the route tolerates up to 140 ms that
// way (400/400 at 140, 3/400 at 160, holding the end fixed). That headroom is
// measured and recorded here so a future change has a ceiling, but it is not
// taken without a device measurement that asks for it.
export const DEVICE_SPACING_MS = 120;
// The slot the POLICY is validated at. It is deliberately not the device
// spacing: widening the actuator is a device compensation applied by the
// emitter, not a new route. Rebuilding the policy at 140 moves its sweeps
// 50 ms earlier and the plan then replays 11/300 -- that is the tail this
// route cannot give up, not a rounding difference.
export const MODEL_SLOT_MS = 120;
export const NIGHT_MS = 420_000;
export const CYCLE_MS = 5_000;

const ms = f => Math.round(f * 1000 / 60);

// Which physical control a press means depends on the monitor: `light` is the
// camera light with the cams up and the hallway light with them down.
function controlFor(act, camsUp) {
  if (act === 'light') return camsUp ? 'camlight' : 'hall';
  if (act === 'ventL') return 'ventl';
  if (act.startsWith('cam:')) return 'cam' + act.slice(4);
  return act;
}

export function capture(opts) {
  const log = [];
  const patched = [];
  for (const m of ['press', 'release']) {
    const orig = Sim.prototype[m];
    patched.push([m, orig]);
    Sim.prototype[m] = function (act) {
      const camsUp = this.camsUp;
      const result = orig.call(this, act);
      // Record the state the engine actually reached, never a toggle count.
      // Monitor and mask are toggles at the button and states everywhere else,
      // and every time a schedule has inferred the state by counting presses
      // it has eventually counted wrong -- that is what `pilottest --sync`
      // exists to repair. A recipe carries the state the engine reports.
      log.push({ f: this.frame, kind: m, act, camsUp,
                 monitor: this.monitor, maskOn: this.maskOn });
      return result;
    };
  }
  try {
    run({ ...opts, sim: { seed: opts.seed ?? 7, night: opts.night ?? 6 } });
  } finally {
    for (const [m, orig] of patched) Sim.prototype[m] = orig;
  }
  return log;
}

// Pair each press with its release; a bare press is a tap the device must
// still hold for MIN_CONTACT_MS.
function events(log, from, to) {
  const open = new Map();
  const out = [];
  for (const e of log) {
    if (e.f < from || e.f >= to) continue;
    if (e.kind === 'press') {
      const rec = { at: ms(e.f - from), act: controlFor(e.act, e.camsUp),
                    dur: MIN_CONTACT_MS, tap: true };
      // MON_RAISING/MON_LOWERING are the animation; the intent is the endpoint.
      rec.camsUp = e.camsUp;
      if (e.act === 'monitor') rec.want = e.monitor === 'up' || e.monitor === 'raising' ? 'up' : 'down';
      if (e.act === 'mask') rec.want = e.maskOn ? 'on' : 'off';
      open.set(e.act, rec);
      out.push(rec);
    } else {
      const rec = open.get(e.act);
      if (!rec) continue;            // release of a press from the prior slice
      rec.dur = ms(e.f - from) - rec.at;
      rec.tap = false;
      open.delete(e.act);
    }
  }
  return out;
}

// A budget is what the cycle spends, not what it intends: light-on time is the
// flashlight, wind time is the box, cams-down time is everything the schedule
// cannot do while it is reading.
export function budget(cycle, lengthMs) {
  const lit = cycle.filter(e => e.act === 'camlight' || e.act === 'hall')
    .reduce((sum, e) => sum + e.dur, 0);
  const wind = cycle.filter(e => e.act === 'wind').reduce((sum, e) => sum + e.dur, 0);
  const cams = cycle.filter(e => e.act.startsWith('cam') && e.act !== 'camlight');
  const sweeps = [];
  for (const e of cams) {
    if (e.act === 'cam11') continue;
    const last = sweeps[sweeps.length - 1];
    if (last && e.at - last[last.length - 1].at <= 400) last.push(e);
    else sweeps.push([e]);
  }
  const spacings = sweeps.flatMap(s => s.slice(1).map((e, i) => e.at - s[i].at));
  // Nights 6-7 drain 120 box units/s and add 300/s while winding, so a cycle
  // is net-neutral at 120/(300+120) of its length.
  const windBreakEven = Math.round(lengthMs * 120 / 420);
  return {
    lengthMs,
    litMs: lit,
    windMs: wind,
    windBreakEvenMs: windBreakEven,
    windMarginMs: wind - windBreakEven,
    sweepSpanMs: sweeps.length ? sweeps[0][sweeps[0].length - 1].at - sweeps[0][0].at : 0,
    maxSpacingMs: spacings.length ? Math.max(...spacings) : 0,
    minContactMs: Math.min(...cycle.map(e => e.dur)),
  };
}

export function build(opts = {}) {
  // Golden Freddy is IGNORED on night 6, deliberately and temporarily.
  //
  // The always-taken mask flick is not a Balloon Boy precaution -- it is the
  // Golden Freddy clear that MINUS-7-STRATEGY.md's order rule demands before
  // the hall flash ("Golden Freddy must be cleared *before* you press CTRL, or
  // the flash kills you"). But it is a GUESS: two blind mask toggles every
  // cycle in a runner that cannot see the mask's state. On the phone that is
  // the dominant failure -- a dropped toggle latches the mask on, every later
  // left read comes back dark, and the model scores it a confident `inside`.
  // Nights 6-30 and 6-31 both died exactly that way.
  //
  // Priced in the exact simulator over 1000 night-6 runs:
  //     with the flick      1000/1000 clears
  //     ignoring Golden Freddy 478/1000 clears
  // Every one of those 522 deaths is "raised the monitor with Golden Freddy in
  // the office", and the EARLIEST is at 149 s -- after the 2 AM step-up at
  // 140 s, where his AI goes from "1 in ten runs" to a flat 3. Ignoring him is
  // free for 1000/1000 runs up to 2 AM, and the device has never survived past
  // 73 s.
  //
  // So this trades a certainty (the mask latches and blinds the classifier) for
  // a risk that does not arrive until long past anything reached so far. It is
  // NOT a route decision and must be revisited: Golden Freddy should be
  // identified, not guessed, and building that classifier needs positives that
  // night 6 supplies only one run in ten before 2 AM. Restore the flick, or
  // replace it with a real detection, before any attempt that expects to pass
  // 2 AM.
  const o = { bbMode: 'left', deviceSweep: true, pulseLight: true,
              sweepSlotMs: MODEL_SLOT_MS, maskMarginMs: 900, readLatencyMs: 550,
              hallPulseMs: 130, pilotOffset: 10, prophylacticMask: false, ...opts };
  const log = capture(o);
  const epoch = o.pilotOffset;
  const s = sec => epoch + Math.round(sec * 60);

  // The attack is the only cycle with no monitor press for seconds after the
  // prophylactic mask: the mask blocks every other control while it is held.
  const masks = log.filter(e => e.kind === 'press' && e.act === 'mask').map(e => e.f);
  const monitors = log.filter(e => e.kind === 'press' && e.act === 'monitor').map(e => e.f);
  const attackMask = masks.find(f => !monitors.some(g => g > f && g < f + 180));
  if (attackMask === undefined) throw new Error('no attack cycle in the sampled night');
  const attackAnchor = monitors.filter(f => f < attackMask).pop();

  const opening = events(log, epoch, s(7));
  const clear = events(log, s(7) + 300, s(7) + 600);
  const attack = events(log, attackAnchor, attackAnchor + 600);

  const cycles = {
    opening: { lengthMs: 7000, events: opening },
    clear: { lengthMs: 5000, events: clear },
    attack: { lengthMs: 10000, events: attack },
  };
  for (const [, c] of Object.entries(cycles)) c.budget = budget(c.events, c.lengthMs);

  // A night is mostly clear cycles; price the flashlight against the sourced
  // per-night budget rather than against a single cycle.
  const clearCycles = Math.floor((NIGHT_MS - 7000) / CYCLE_MS);
  const nightLitMs = cycles.opening.budget.litMs + clearCycles * cycles.clear.budget.litMs;
  return {
    options: o,
    powerFramesAvailable: C.POWER_BY_NIGHT[o.night ?? 6],
    powerFramesSpentIfAllClear: Math.round(nightLitMs * 60 / 1000),
    minContactMs: MIN_CONTACT_MS,
    deviceSpacingMs: DEVICE_SPACING_MS,
    cycles,
  };
}

// The same recipe as a trainer track. `src/config.js`'s CYCLE_SCRIPT is the
// canonical Minus 7 cycle a human drills against; a device recipe is a
// derivative of it, and rendering both in one shape is what makes the
// differences reviewable instead of buried in two unrelated files.
// `ventlight` is the one action canonical Minus 7 has no step for -- the BB
// read is exactly what this variant adds -- so a trainer that wants to drill
// this track has to grow that step type first.
export function track(cycle) {
  const steps = [];
  for (const e of cycle.events) {
    const at = +(e.at / 1000).toFixed(3);
    if (e.act === 'camlight') {
      const prev = steps[steps.length - 1];
      if (prev && prev.action === 'cam') { prev.action = 'camflash'; prev.label += ' + light'; }
      continue;
    }
    if (e.act === 'monitor') {
      steps.push({ id: `monitor-${e.want}`, at,
                   label: e.want === 'up' ? 'Cams up' : 'Cams down',
                   action: 'monitor', want: e.want });
    } else if (e.act === 'mask') {
      steps.push({ id: `mask-${e.want}`, at, label: `Mask ${e.want}`,
                   action: 'mask', want: e.want });
    } else if (e.act === 'hall') {
      steps.push({ id: 'flash-hall', at, label: 'Flash hall', action: 'light',
                   want: 'tap', hold: +(e.dur / 1000).toFixed(3) });
    } else if (e.act === 'ventl') {
      steps.push({ id: 'vent-read', at, label: 'Left vent light + read',
                   action: 'ventlight', want: 'tap', hold: +(e.dur / 1000).toFixed(3) });
    } else if (e.act === 'wind') {
      steps.push({ id: 'wind', at, label: 'Hold WIND', action: 'wind', want: 'on',
                   hold: +(e.dur / 1000).toFixed(3) });
    } else if (e.act.startsWith('cam')) {
      const n = +e.act.slice(3);
      steps.push({ id: `cam-${n}`, at, label: `CAM ${String(n).padStart(2, '0')}`,
                   action: 'cam', cam: n });
    }
  }
  return steps;
}

// The recipe as device instructions. The runner used to carry these as
// hand-typed millisecond literals; emitting them merges the pairs the phone
// performs as one gesture (a camera select and its light pulse; a hall pulse
// under a simultaneous monitor raise) so the shell executes a table instead of
// re-deriving one. Contact lengths are device lengths, never simulator frames.
// The released time the runner leaves between the vent light and the mask.
export const MASK_GAP_MS = 40;

// The sweep is the one instruction whose numbers are the *actuator's*, not the
// simulator's. hid-sweep-probe.sh landed 4/4 at exactly this geometry: a 100 ms
// select, 20 ms released, the next select 120 ms after the last. The simulator
// quantises the same slot to frames and reports 116 ms, and shipping that to
// the phone shortens both the spacing and the released time between selects --
// the collapse to ~105 ms is what rendered CAM 07 alone. Emit the device's
// numbers and let `replay` ask the engine whether the night still survives at
// the actuator the phone actually has.
export const SWEEP_SELECT_MS = MIN_CONTACT_MS;
export const SWEEP_RELEASED_MS = DEVICE_SPACING_MS - SWEEP_SELECT_MS;

// MONITOR_ANIM_UP is 12 sourced frames and `engine.js` drops a camera select
// outright until the raise finishes:
//
//     if (this.monitor === MON_UP && C.CAMS[n]) this.cam = n;
//
// The policy emits selects that clear that animation by 0-30 ms. In the engine
// that is fine, because the select lands exactly on the frame the animation
// completes. On the phone the macro's anchor is wall-timed and lands 49-93 ms
// late, so the same instruction arrives *inside* the animation and sets
// nothing -- the feed stays where it was, the pilot winds on the wrong camera,
// and the sweep that bridges the five-tick mask never happens. Nights 6-22 to 6-25
// died that way and the rendered classifier frame is CAM 11, unchanged.
//
// Move the RAISE earlier rather than the select later: HID-MULTITOUCH.md
// records that one frame of sweep tail costs 272 of 400 nights, so the sweep's
// end is the one thing in this cycle that must not move. Each instruction may
// slide back to one Fusion poll after the one before it, and the relaxation
// runs backwards so freeing a raise can free the hall pulse ahead of it.
export const MONITOR_ANIM_UP_MS = Math.round(C.MONITOR_ANIM_UP * 1000 / 60);
export const RAISE_MARGIN_MS = 33;

function clearTheRaise(name, lines) {
  const ins = lines.map(line => {
    const [at, kind, ...rest] = line.split(' ');
    return { at: +at, kind, rest };
  });
  const spanOf = e =>
    e.kind === 'tap' || e.kind === 'hold' ? +e.rest[1] :
    e.kind === 'hall' ? +e.rest[0] :
    e.kind === 'hallraise' ? +e.rest[0] :
    e.kind === 'sweep' ? 2 * +e.rest[0] + +e.rest[1] :
    e.kind === 'read' ? +e.rest[0] : MIN_CONTACT_MS;
  const isCamera = e => e.kind === 'sweep' ||
    (e.kind === 'tap' && /^cam\d+$/.test(e.rest[0]));
  const isRaise = (e, up) => !up &&
    (e.kind === 'hallraise' || (e.kind === 'tap' && e.rest[0] === 'monitor'));

  // Which monitor presses are raises depends on where the cycle starts: a
  // steady cycle is entered with the cams up and its anchor lowers them.
  let up = name !== 'opening';
  const raises = [];
  for (const e of ins) {
    if (e.kind === 'hallraise' || (e.kind === 'tap' && e.rest[0] === 'monitor')) {
      if (isRaise(e, up)) raises.push(e);
      up = !up;
    }
  }

  for (const raise of raises) {
    const i = ins.indexOf(raise);
    const select = ins.slice(i + 1).find(isCamera);
    if (!select) continue;
    const want = select.at - (MONITOR_ANIM_UP_MS + RAISE_MARGIN_MS);
    if (raise.at <= want) continue;
    // Slide the raise and, if it runs into what precedes it, that too.
    let moving = i, target = want;
    while (moving >= 0) {
      const e = ins[moving];
      if (e.at <= target) break;
      e.at = target;
      const prev = ins[moving - 1];
      if (!prev) break;
      target = e.at - RAISE_MARGIN_MS - spanOf(prev);
      moving -= 1;
    }
    if (raise.at > want)
      throw new Error(`${name}: the raise at +${raise.at} ms cannot clear ` +
        `MONITOR_ANIM_UP before the select at +${select.at} ms without moving the ` +
        'select, and the sweep\'s end is what bridges the five-tick mask');
    if (ins.some((e, k) => k > 0 && e.at < ins[k - 1].at))
      throw new Error(`${name}: relaxing the raise reordered the cycle`);
  }
  return ins.map(e => [e.at, e.kind, ...e.rest].join(' '));
}

// Widening the sweep moves its START earlier, which eats the released time the
// instruction before it was given. Pay for that out of the wind, which is the
// only elastic thing in the cycle: the clear cycle runs a +471 ms wind margin,
// so 30-50 ms is free, while every other gap here is a device constraint.
//
// Fusion polls touch once per frame, so two different controls closer than one
// poll can read as a single finger moving between them and the second never
// fires. That is the same rule test-recipe.mjs enforces; this keeps it true
// after the emitter has retimed anything.
export const FUSION_POLL_MS = 33;

function makeRoom(name, lines) {
  const ins = lines.map(line => {
    const [at, kind, ...rest] = line.split(' ');
    return { at: +at, kind, rest };
  });
  const endOf = e =>
    e.kind === 'tap' ? e.at + +e.rest[1] :
    e.kind === 'hold' ? e.at + +e.rest[1] :
    e.kind === 'hall' || e.kind === 'hallraise' ? e.at + +e.rest[0] :
    e.kind === 'sweep' ? e.at + 2 * +e.rest[0] + +e.rest[1] :
    e.kind === 'read' ? e.at + +e.rest[0] + +e.rest[1] + MIN_CONTACT_MS :
    e.at + MIN_CONTACT_MS;
  for (let i = 0; i + 1 < ins.length; i++) {
    const a = ins[i], b = ins[i + 1];
    const gap = b.at - endOf(a);
    if (gap >= FUSION_POLL_MS) continue;
    if (a.kind !== 'hold')
      throw new Error(`${name}: only ${gap} ms between ${a.kind} at +${a.at} ms and ` +
        `${b.kind} at +${b.at} ms, and the earlier one is not a wind to shorten`);
    const want = +a.rest[1] - (FUSION_POLL_MS - gap);
    if (want < MIN_CONTACT_MS)
      throw new Error(`${name}: shortening the wind at +${a.at} ms to clear ${b.kind} ` +
        `at +${b.at} ms would leave ${want} ms, under the ${MIN_CONTACT_MS} ms contact floor`);
    a.rest[1] = String(want);
  }
  return ins.map(e => [e.at, e.kind, ...e.rest].join(' '));
}

export function devicePlan(recipe) {
  const out = {};
  for (const [name, cycle] of Object.entries(recipe.cycles)) {
    const lines = [];
    const ev = cycle.events;
    let skipMask = null;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.act === 'camlight') continue;            // merged into its select
      if (/^cam(10|4|7)$/.test(e.act)) {
        const cams = [];
        const ats = [];
        let j = i;
        while (j < ev.length && /^cam(10|4|7)$/.test(ev[j].act)) {
          cams.push(ev[j].act.slice(3));
          ats.push(ev[j].at);
          j += ev[j + 1] && ev[j + 1].act === 'camlight' ? 2 : 1;
        }
        // Spacing comes from this sweep's own selects. Looking the camera up
        // by name found the first one in the cycle instead, which produced a
        // negative spacing on a second sweep.
        const modelled = ats.length > 1 ? ats[1] - ats[0] : DEVICE_SPACING_MS;
        // The emitted spacing is the actuator's, not the model's, and the phone
        // needs a wider one than the model quantises to. Widen by starting the
        // sweep EARLIER so its end does not move: that end is the stun bridge
        // across the five-tick mask, and HID-MULTITOUCH.md records that one
        // frame of tail costs 272 of 400 nights. Anchoring the end is what makes
        // 140 ms free (400/400) where rebuilding the policy at 140 is not
        // (11/300) -- the difference is entirely which end of the sweep moves.
        if (DEVICE_SPACING_MS < modelled)
          throw new Error(`the device spacing ${DEVICE_SPACING_MS} ms is narrower ` +
            `than the ${modelled} ms the recipe models; this emitter only widens`);
        const modelledEnd = ats[ats.length - 1] + MIN_CONTACT_MS;
        const deviceSpan = (cams.length - 1) * DEVICE_SPACING_MS + SWEEP_SELECT_MS;
        const start = modelledEnd - deviceSpan;
        if (start < 0)
          throw new Error(`widening the sweep to ${DEVICE_SPACING_MS} ms starts it ` +
            `at ${start} ms, before the cycle begins`);
        lines.push(`${start} sweep ${DEVICE_SPACING_MS} ${SWEEP_SELECT_MS} ${cams.join(',')}`);
        i = j - 1;
        continue;
      }
      if (e.act === 'hall') {
        const twin = ev.find(x => x.act === 'monitor' && x.at === e.at);
        lines.push(`${e.at} ${twin ? 'hallraise' : 'hall'} ${e.dur}`);
        continue;
      }
      if (e.act === 'monitor' && ev.some(x => x.act === 'hall' && x.at === e.at)) continue;
      if (e.act === 'ventl') {
        // The runner performs the read and the prophylactic mask as one step:
        // it releases the vent light the instant the capture latches and
        // presses the mask 40 ms later, one Fusion poll, so the game sees an
        // unpressed frame between two different buttons. The plan says so,
        // rather than listing a mask the schedule does not separately time.
        skipMask = ev.find(x => x.act === 'mask' && x.at >= e.at);
        lines.push(`${e.at} read ${e.dur} ${MASK_GAP_MS}`);
        continue;
      }
      if (e === skipMask) continue;
      if (e.act === 'wind') { lines.push(`${e.at} hold wind ${e.dur}`); continue; }
      lines.push(`${e.at} tap ${e.act} ${e.dur}`);
    }
    out[name] = makeRoom(name, clearTheRaise(name, lines));
  }
  return out;
}

// Feed the device plan back through the engine.
//
// The plan is generated from the simulator, so it is tempting to trust it --
// but "generated" only means the emitter ran, not that it emitted the policy.
// An emitter bug (a sweep whose spacing was looked up by camera name and found
// the wrong one) or a hand edit to the plan would both survive every check
// that reads the recipe, because they all read the same side of the loop.
// This runs the plan itself, instruction by instruction, and asks the engine
// whether the night still survives.
export function replay(plan, { night = 6, seed = 1, worst = false,
                               pilotOffset = 10, readLatencyMs = 550,
                               classifyMs = 250 } = {}) {
  const sim = new Sim({ seed, night, worst });
  const f = msv => Math.round(msv * 60 / 1000);
  const queue = [];
  const at = (frame, kind, act) => queue.push([frame, queue.length, kind, act]);

  const parse = (lines, base) => {
    for (const line of lines) {
      const [offs, kind, ...rest] = line.split(' ');
      const t = base + f(+offs);
      if (kind === 'tap') {
        at(t, 'press', rest[0] === 'monitor' ? 'monitor' : rest[0] === 'mask' ? 'mask'
          : 'cam:' + rest[0].slice(3));
      } else if (kind === 'hold') {
        at(t, 'press', 'wind'); at(t + f(+rest[1]), 'release', 'wind');
      } else if (kind === 'hall' || kind === 'hallraise') {
        at(t, 'press', 'light'); at(t + f(+rest[0]), 'release', 'light');
        if (kind === 'hallraise') at(t, 'press', 'monitor');
      } else if (kind === 'sweep') {
        const [spacing, , cams] = rest;
        cams.split(',').forEach((n, i) => {
          const st = t + f(i * +spacing);
          at(st, 'press', 'cam:' + n);
          at(st + 1, 'press', 'light');
          at(st + 1 + f(100), 'release', 'light');
        });
      } else if (kind === 'read') {
        at(t, 'press', 'ventL');
        at(t + f(+rest[0]), 'release', 'ventL');
        // No mask here: the Golden Freddy flick is dropped on night 6 and the
        // mask is pressed on the classifier's answer instead, below.
        at(t + f(readLatencyMs), 'snapshot', base);
      } else throw new Error(`unknown instruction ${kind}`);
    }
  };

  // The opening, then a steady cycle whose kind the read chooses -- exactly
  // the branch the phone makes.
  parse(plan.opening, pilotOffset);
  let base = pilotOffset + f(7000);
  let pending = null;
  parse(plan.clear.slice(0, 2), base);      // the shared prefix, up to the read
  let missed = 0, detections = 0;

  while (sim.alive && !sim.won) {
    while (queue.length && queue[0][0] <= sim.frame) {
      queue.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const [, , kind, act] = queue.shift();
      if (kind === 'press') sim.press(act);
      else if (kind === 'release') sim.release(act);
      else if (kind === 'snapshot') {
        pending = { base: act, bb: sim.bb.inOpening, inside: sim.bb.inside,
                    resolveAt: sim.frame + f(classifyMs) };
      }
    }
    if (pending && sim.frame >= pending.resolveAt) {
      const { base: b, bb, inside } = pending;
      pending = null;
      if (!bb && inside) missed++;
      if (bb) detections++;
      // The runner masks off the answer, not off the anchor, so the model has
      // to as well -- otherwise the five-tick hold starts in a different place
      // than the phone starts it.
      if (bb) at(sim.frame + f(FUSION_POLL_MS), 'press', 'mask');
      const lines = bb ? plan.attack : plan.clear;
      parse(lines.slice(2), b);             // the branch, after the read
      base = b + f(bb ? 10000 : 5000);
      parse(plan.clear.slice(0, 2), base);
    }
    sim.tick();
  }
  return { sim, missed, detections };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name, def) => {
    const v = (process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1];
    return v === undefined ? def : +v;
  };
  const recipe = build({
    night: arg('night', 6), sweepSlotMs: arg('slot-ms', MODEL_SLOT_MS),
    maskMarginMs: arg('mask-margin-ms', 900), readLatencyMs: arg('read-latency-ms', 550),
    hallPulseMs: arg('hall-pulse-ms', 130), pilotOffset: arg('offset-frames', 10),
  });
  if (process.argv.includes('--device-plan')) {
    const plan = devicePlan(recipe);
    for (const [name, lines] of Object.entries(plan)) {
      console.log(`#cycle ${name} ${recipe.cycles[name].lengthMs}`);
      for (const line of lines) console.log(line);
    }
  } else if (process.argv.includes('--track')) {
    for (const [name, c] of Object.entries(recipe.cycles)) {
      console.log(`// ${name}`);
      for (const step of track(c)) console.log('  ' + JSON.stringify(step) + ',');
    }
  } else if (process.argv.includes('--json')) {
    console.log(JSON.stringify(recipe, null, 2));
  } else {
    console.log(`power ${recipe.powerFramesSpentIfAllClear}/${recipe.powerFramesAvailable} frames if every cycle is a clear`);
    for (const [name, c] of Object.entries(recipe.cycles)) {
      const b = c.budget;
      console.log(`\n${name}  ${b.lengthMs} ms` +
        `  lit ${b.litMs} ms  wind ${b.windMs}/${b.windBreakEvenMs} ms (${b.windMarginMs >= 0 ? '+' : ''}${b.windMarginMs})` +
        `  sweep span ${b.sweepSpanMs} ms  spacing ${b.maxSpacingMs} ms  shortest contact ${b.minContactMs} ms`);
      for (const e of c.events)
        console.log(`  +${String(e.at).padStart(6)} ms  ${e.act.padEnd(9)} ${e.dur} ms${e.tap ? ' (tap)' : ''}`);
    }
  }
}
