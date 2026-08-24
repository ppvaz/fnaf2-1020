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

// The phone's proven floor for a contact Fusion cannot miss, and the shortest
// camera spacing hid-sweep-probe.sh has landed 4/4. Both are device
// measurements; see docs/device/HID-MULTITOUCH.md.
export const MIN_CONTACT_MS = 100;
export const DEVICE_SPACING_MS = 120;
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
  const o = { bbMode: 'left', deviceSweep: true, pulseLight: true,
              sweepSlotMs: 120, maskMarginMs: 900, readLatencyMs: 550,
              hallPulseMs: 130, pilotOffset: 10, ...opts };
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
export function devicePlan(recipe) {
  const out = {};
  for (const [name, cycle] of Object.entries(recipe.cycles)) {
    const lines = [];
    const ev = cycle.events;
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
        const spacing = ats.length > 1 ? ats[1] - ats[0] : DEVICE_SPACING_MS;
        lines.push(`${e.at} sweep ${spacing} ${MIN_CONTACT_MS + 10} ${cams.join(',')}`);
        i = j - 1;
        continue;
      }
      if (e.act === 'hall') {
        const twin = ev.find(x => x.act === 'monitor' && x.at === e.at);
        lines.push(`${e.at} ${twin ? 'hallraise' : 'hall'} ${e.dur}`);
        continue;
      }
      if (e.act === 'monitor' && ev.some(x => x.act === 'hall' && x.at === e.at)) continue;
      if (e.act === 'ventl') { lines.push(`${e.at} read ${e.dur}`); continue; }
      if (e.act === 'wind') { lines.push(`${e.at} hold wind ${e.dur}`); continue; }
      lines.push(`${e.at} tap ${e.act} ${e.dur}`);
    }
    out[name] = lines;
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
        at(t + f(readLatencyMs), 'snapshot', base);
      } else throw new Error(`unknown instruction ${kind}`);
    }
  };

  // The opening, then a steady cycle whose kind the read chooses -- exactly
  // the branch the phone makes.
  parse(plan.opening, pilotOffset);
  let base = pilotOffset + f(7000);
  let pending = null;
  parse(plan.clear.slice(0, 3), base);      // the shared prefix, up to the read
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
      const lines = bb ? plan.attack : plan.clear;
      parse(lines.slice(3), b);             // the branch, after the read
      base = b + f(bb ? 10000 : 5000);
      parse(plan.clear.slice(0, 3), base);
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
    night: arg('night', 6), sweepSlotMs: arg('slot-ms', 120),
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
