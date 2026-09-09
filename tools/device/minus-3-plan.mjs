// Emit and replay the story-night Minus 3 route.
//
// Minus 3 is the CAM 11-viewing / CAM 08-marker split.  The parked CAM 08
// marker holds the three Withereds while the viewing feed stays on CAM 11 for
// winding.  The story route then uses a ten-second phase: raise and wind for
// one movement interval, lower before the next one, flash the hall during the
// lowering gesture, and hold the mask through the interval.  The mask window
// is deliberately continuous so BB, Mangle, and the Toy vent entries all get
// the sourced five one-second ticks.
//
// This module is the model/device-plan boundary.  It does not claim device
// success; the CLI gate is the exact simulator census and the emitted plan is
// what the later phone run must grade.
import { pathToFileURL } from 'node:url';
import * as C from '@fnaf2-1020/core/mechanics';
import { Sim } from '@fnaf2-1020/core/mechanics';
import { DOUBLE_GLITCH_CAMERA_PAIRS, cameraPairHeader } from './arm-verification.mjs';

export const KNOBS0 = Object.freeze({
  contactMs: 33,
  periodMs: 10000,
  loopStartMs: 5000,
  // Stop before the final partial hall pulse would cross the observation
  // envelope; the preceding camdrop completes and leaves the mask state safe.
  stopAtMs: 419600,
  observeUntilMs: 420000,

  // The five-input arm is shared with Minus Toys; only the parked camera
  // changes.  Keep CAM 11 sampled as lastViewed before CAM 08 is selected.
  openViewMs: 0,
  openLastViewedMs: 300,
  openArmMs: 833,
  armingGapMs: 50,
  openRaiseGapMs: 733,
  openWindMs: 1800,
  openWindAtMs: 2050,
  openCamdropAtMs: 4000,
  openCamdropLeadMs: 150,
  openCamdropMonitorMs: 33,
  // The monitor's sourced lowering animation is ~367 ms.  The light must
  // remain down long enough to become a real hall flash after the animation,
  // rather than ending during the transition (the rejected candidate did
  // exactly that and left Foxy unreset).
  openCamdropTailMs: 400,
  openMaskAtMs: 4650,

  // One clear cycle begins with the mask already held from the opening. The
  // mask comes off first, then the hall/right-vent compound covers the next
  // Foxy check before the monitor raise. The 400 ms contact is deliberately
  // serializable by the current two-contact HID transport.
  maskOffMs: 4400,
  // MASK_ANIM_OFF is 15 frames (~250 ms); leave a full released poll before
  // the raise or the monitor press is swallowed by the mask surface.
  raiseMs: 5300,
  // The wind hold must not start until the raise is reliably done. 5500 is
  // raise+200 ms and MISSED on device twice (2026-09-09): the taps did not land
  // and the box went unwound, killing a Night 5 at 44.3 s to the Marionette.
  // 5800 is raise+500 ms and is the timing that reached 5 AM. Win-identical in
  // the model at 3000 seeds on nights 3, 4 and 5.
  windAtMs: 5800,
  windMs: 3200,
  camdropMs: 9000,
  camdropLeadMs: 150,
  camdropMonitorMs: 33,
  camdropTailMs: 400,
  // The compound runs after the sourced 15-frame mask-off animation and before
  // the next raise. Its right-vent half also stalls Toy Bonnie at the entry
  // edge while the hall half resets Foxy's D when he is present.
  secondHallMs: 4700,
  secondHallHoldMs: 400,
  // The right-vent half is model-inert on Nights 3-4: the device-winning
  // schedule omitted it and censuses identically with and without it
  // (docs/evidence/pan-right-light-calibration-20260908.json). Keep it on by
  // default -- it is what the 3000-seed census gated -- and let the
  // device-proven recipe select the hall-only contact it actually ran.
  secondHallVent: true,
  // This is after camdrop's physical light tail.
  maskOnMs: 9600,
});

const clone = overrides => ({ ...KNOBS0, ...(overrides ?? {}) });
const frame = ms => Math.round(ms * C.FPS / 1000);
const actionFor = action => action.startsWith('cam') ? `cam:${action.slice(3)}` : action;

export function build(overrides = {}) {
  const k = clone(overrides);
  const c = k.contactMs;
  const opening = [
    [k.openViewMs, 'tap', 'monitor', c],
    [k.openLastViewedMs, 'tap', 'cam11', c],
    [k.openArmMs, 'tap', 'cam8', c],
    [k.openArmMs + k.armingGapMs, 'tap', 'monitor', c],
    [k.openArmMs + k.armingGapMs + k.openRaiseGapMs, 'tap', 'monitor', c],
    [k.openWindAtMs, 'hold', 'wind', k.openWindMs],
    [k.openCamdropAtMs, 'camdrop', k.openCamdropLeadMs,
      k.openCamdropMonitorMs, k.openCamdropTailMs],
    [k.openMaskAtMs, 'tap', 'mask', c],
  ];
  const clear = [
    [k.maskOffMs, 'tap', 'mask', c],
    [k.secondHallMs, k.secondHallVent ? 'hallvent' : 'hall', k.secondHallHoldMs],
    [k.raiseMs, 'tap', 'monitor', c],
    [k.windAtMs, 'hold', 'wind', k.windMs],
    [k.camdropMs, 'camdrop', k.camdropLeadMs,
      k.camdropMonitorMs, k.camdropTailMs],
    [k.maskOnMs, 'tap', 'mask', c],
  ];
  return { opening, clear, knobs: k };
}

export function schedule({ opening, clear, knobs, untilMs } = {}) {
  const k = clone(knobs);
  const built = opening && clear ? { opening, clear } : build(k);
  const queue = [];
  const add = (base, row, cycle, index) => {
    const [at, kind, a, b, tail] = row;
    const when = base + at;
    if (kind === 'tap') queue.push([frame(when), index, 'press', actionFor(a)]);
    else if (kind === 'hold') {
      const action = actionFor(a);
      queue.push([frame(when), index, 'press', action],
        [frame(when + b), index, 'release', action]);
    } else if (kind === 'hall') {
      queue.push([frame(when), index, 'press', 'light'],
        [frame(when + a), index, 'release', 'light']);
    } else if (kind === 'hallvent') {
      queue.push([frame(when), index, 'press', 'light'],
        [frame(when), index, 'press', 'ventR'],
        [frame(when + a), index, 'release', 'light'],
        [frame(when + a), index, 'release', 'ventR']);
    } else if (kind === 'camdrop') {
      queue.push([frame(when), index, 'press', 'light'],
        [frame(when + a), index, 'press', 'monitor'],
        [frame(when + a + b + tail), index, 'release', 'light']);
    } else throw new Error(`unknown Minus 3 row ${cycle}/${kind}`);
  };
  built.opening.forEach((row, index) => add(0, row, 'opening', index));
  const end = untilMs ?? k.stopAtMs;
  for (let base = k.loopStartMs; base < end; base += k.periodMs)
    built.clear.forEach((row, index) => add(base, row, 'clear', index));
  return queue.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

export function replay({ night, seed = 1, worst = false, splitCamera = true, knobs } = {}) {
  if (!Number.isInteger(night) || night < 3 || night > 6)
    throw new Error('Minus 3 replay requires story night 3..6');
  const k = clone(knobs);
  const sim = new Sim({ night, seed, worst });
  const built = build(k);
  const queue = schedule({ ...built, knobs: k });
  let cursor = 0;
  let splitAt = -1;
  let minBox = 1;
  let minPower = sim.power;
  while (sim.alive && !sim.won) {
    while (cursor < queue.length && queue[cursor][0] <= sim.frame) {
      const [, , kind, action] = queue[cursor++];
      if (!splitCamera && action === 'cam:8') continue;
      sim[kind](action);
    }
    sim.tick();
    if (splitAt < 0 && sim.camsUp && sim.viewing === 11 && sim.cam === 8)
      splitAt = sim.frame;
    minBox = Math.min(minBox, sim.box);
    minPower = Math.min(minPower, sim.power);
  }
  return { sim, splitAt, minBox, minPower };
}

export function emitPlan(night, overrides = {}) {
  if (!Number.isInteger(night) || night < 3 || night > 6)
    throw new Error('Minus 3 plan requires night 3..6');
  const k = clone(overrides);
  const { opening, clear } = build(k);
  const firstWind = k.openWindAtMs;
  const lines = [
    '#policy minus3',
    `#night ${night}`,
    `#period ${k.periodMs}`,
    `#loop-start ${k.loopStartMs}`,
    `#stop-at ${k.stopAtMs}`,
    `#observe-until ${k.observeUntilMs}`,
    '#arm-verify 1',
    `#arm-verify-cameras ${cameraPairHeader(DOUBLE_GLITCH_CAMERA_PAIRS.minus3)}`,
    '#arm-verify-viewing cam:11',
    `#arm-verify-until ${firstWind - 50}`,
    `#cycle opening ${k.periodMs / 2}`,
    ...opening.map(row => row.join(' ')),
    `#cycle clear ${k.periodMs}`,
    ...clear.map(row => row.join(' ')),
  ];
  return lines.join('\n') + '\n';
}

const seedsFor = i => (i * 2654435761) >>> 0;
const count = (night, { worst = false, splitCamera = true, runs = 3000 } = {}) => {
  let wins = 0;
  const losses = new Map();
  let split = 0;
  for (let i = 0; i < runs; i++) {
    const result = replay({ night, seed: seedsFor(i), worst, splitCamera });
    if (result.sim.won && (splitCamera ? result.splitAt >= 0 : true)) wins++;
    if (result.splitAt >= 0) split++;
    if (!result.sim.won) {
      const reason = result.sim.death?.reason ?? 'unknown';
      losses.set(reason, (losses.get(reason) ?? 0) + 1);
    }
  }
  return { wins, runs, split, losses: Object.fromEntries(losses) };
};

export function gate(nights = [3, 4, 5, 6], runs = 3000) {
  if (!Number.isInteger(runs) || runs < 1) throw new Error('runs must be positive');
  let pass = true;
  for (const night of nights) {
    const normal = count(night, { runs });
    const worst = count(night, { runs, worst: true });
    const control = count(night, { runs, splitCamera: false });
    console.log(`Minus 3 night ${night} normal: ${normal.wins}/${normal.runs} ` +
      `split=${normal.split}/${normal.runs} losses=${JSON.stringify(normal.losses)}`);
    console.log(`Minus 3 night ${night} worst: ${worst.wins}/${worst.runs} ` +
      `split=${worst.split}/${worst.runs} losses=${JSON.stringify(worst.losses)}`);
    console.log(`Minus 3 night ${night} no-split control: ${control.wins}/${control.runs} ` +
      `losses=${JSON.stringify(control.losses)}`);
    pass &&= normal.wins === runs && normal.split === runs;
    // Worst mode deliberately forces AI-zero routes; retain it as diagnostic,
    // but do not turn impossible below-table movement into a story failure.
  }
  return pass;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name, fallback) => {
    const value = process.argv.find(item => item.startsWith(`--${name}=`));
    return value === undefined ? fallback : Number(value.slice(name.length + 3));
  };
  const runs = arg('runs', 3000);
  const night = arg('night', 3);
  if (process.argv.includes('--gate')) {
    if (!gate([night], runs)) process.exitCode = 1;
  } else {
    process.stdout.write(emitPlan(night));
  }
}
