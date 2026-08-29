// Emit and replay the measured-device port of the Minus Toys schedule.
// The file format is consumed by trial.sh's existing on-phone plan interpreter.
//
// The schedule is no longer two hand-typed arrays: `build(knobs)` derives the
// opening + steady loop from named knobs (KNOBS0 = the shipped values). This is
// so the loop can be *searched* rather than tuned by hand -- the first device
// run (n2-minustoys-0117, 2026-08-28) died to a BB walk-in the deterministic
// gate could not see, and the published strategy's own margin is only ~0.66 s
// per cycle (docs/strategy/MINUS-3-STRATEGY.md sec.3). `minus-toys-margin.mjs`
// maps where the slack is; a jitter/clock-error search sits on `schedule({shift})`.
import { pathToFileURL } from 'node:url';
import * as C from '../../src/config.js';
import { Sim } from '../../src/engine.js';

// Every tunable number in the schedule. build(KNOBS0) reproduces the shipped
// opening/loop byte-for-byte (asserted below). Each knob names one decision the
// published routine makes; a search perturbs a subset.
export const KNOBS0 = {
  // --- opening: arm the CAM 11-viewing / CAM 09-marker split before 0:05 ---
  openArm: true,           // false skips the CAM 09 tap -> the no-split control schedule
  openViewMs: 0,           // tap monitor: establish `viewing`
  openLastViewedMs: 300,   // tap CAM 11: it becomes g263's sampled `last viewed`
  openArmMs: 833,          // tap CAM 09: g40 writes `viewing` + the marker atomically
  armingGapMs: 50,         // CAM 09 tap -> monitor-down gap. Must stay inside g263's 200 ms
                           //   stale-sample window; 17 ms of it is released after the 33 ms contact.
                           //   The device run showed this collapse to 0 (drag, not two taps).
  openRaiseGapMs: 733,     // monitor-down -> monitor-up (the split is armed on this raise)
  openWindLeadMs: 434,     // monitor-up -> opening wind start
  openWindMs: 1750,        // opening wind hold (shortened live by the epoch slip, up to its full length)
  openCamdropLeadMs: 200,  // opening camdrop: light-only lead before the monitor tap
  openMaskLeadMs: 300,     // opening camdrop end -> mask on (gives the lower animation room)

  // --- steady loop ---
  loopPeriodMs: 10000,     // 10 s cycle = 2x the 5 s GF interval. 5000 builds the faithful
                           //   per-interval routine (MINUS-3-STRATEGY sec.3) -- structurally it
                           //   cannot deliver a 5-tick mask window, see build() and cyclelengthsearch.
  maskOffMs: 9200,         // mask toggles OFF (~:X9), the cams-up / wind phase begins
  maskOnMs: 4400,          // mask toggles ON (~:X4). Used in the opening, and +loopPeriodMs in the loop.
  hallOffsetMs: 9500,      // Foxy-reset hall pulse offset
  hallMs: 33,              // hall contact; a 33 ms hold lights the hallway on the g56 with no pan
  raiseMs: 10100,          // monitor raise, just after the interval boundary
  stunRefreshMs: 10400,    // ventl (camera-feed light) glitch-stun refresh, right after the raise
  stunRefreshHoldMs: 100,  // its hold
  windLeadMs: 10550,       // loop wind start
  windMs: 3250,            // loop wind hold
  camdropMs: 13850,        // camdrop exit (~:X4 of the next interval)
  camdropLeadMs: 150,      // loop camdrop: light-only lead before the monitor tap
  camdropMonitorMs: 33,    // camdrop: monitor contact
  camdropTailMs: 67,       // camdrop: light-only tail after the monitor tap

  contactMs: 33,           // tap/hall contact length. The engine ignores it; the emitted plan carries it.
  reactiveBB: false,       // RESERVED, INERT. A later effort wires a left-opening read + reactive mask
                           //   here (the published routine's blackout / vent-guest branch).

  // --- minimal Night 1 mode (`--minimal`, Night 1 ONLY) ---
  // The 10/20 loop bolted onto Night 1 is wasted motion: the monitor never has
  // to come down (the Toys are flash-pinned on the stage and every "seven" kill
  // path needs cams-up -- MINUS-3-STRATEGY.md sec.9), nothing reaches a vent,
  // Golden Freddy is AI 0. So `minimal` arms the split once, then does exactly
  // two things per 5 s cycle: re-flash CAM 09 and top the box. No mask, no hall,
  // no per-cycle camdrop re-arm. This is the "machine -> elegance" plan.
  // It is Night 1 ONLY -- Night 2 needs a mask (Mangle/BB), Nights 3-5 switch to
  // CAM 08 and need hall flashes; those shapes are not designed. The CLI refuses
  // `--minimal` for any other night.
  minimal: false,
  minPeriodMs: 5000,       // re-flash on the game's 5 s grid, not the 10 s GF-interval cycle
  minLoopStartMs: 10000,   // first loop cycle; the opening wind bridges [openWind, here + minWindAtMs]
  minFlashAtMs: 150,       // ventl (CAM 09 feed light) re-flash, early in each 5 s window
  minFlashHoldMs: 100,     // its hold -- >= one Fusion poll past the 33 ms contact floor
  minWindAtMs: 300,        // wind start, just after the flash
  minWindHoldMs: 4400,     // wind hold -- nearly the whole 5 s window; box stays full
};

const clone = k => ({ ...KNOBS0, ...(k || {}) });

// Derive { opening, loop } from knobs. build() === the shipped schedule.
export function build(knobs) {
  const k = clone(knobs);
  const c = k.contactMs;

  if (k.minimal) {
    // Arm-only opening: establish viewing, sample CAM 11 as last-viewed, tap
    // CAM 09 (marker), drop, raise -- the split is armed on that raise. Then
    // wind, held until the first loop cycle takes over. No camdrop, no mask.
    const open = [];
    open.push([k.openViewMs, 'tap', 'monitor', c]);
    open.push([k.openLastViewedMs, 'tap', 'cam11', c]);
    const drop = k.openArmMs + k.armingGapMs;
    if (k.openArm) open.push([k.openArmMs, 'tap', 'cam9', c]);
    open.push([drop, 'tap', 'monitor', c]);
    const raise = drop + k.openRaiseGapMs;
    open.push([raise, 'tap', 'monitor', c]);
    const windAt = raise + k.openWindLeadMs;
    open.push([windAt, 'hold', 'wind', k.minLoopStartMs + k.minWindAtMs - windAt]);
    // Steady 5 s cycle: re-flash CAM 09, then wind. Nothing else.
    const loop = [
      [k.minFlashAtMs, 'hold', 'ventl', k.minFlashHoldMs],
      [k.minWindAtMs, 'hold', 'wind', k.minWindHoldMs],
    ];
    return { opening: open, loop };
  }

  const opening = [];
  opening.push([k.openViewMs, 'tap', 'monitor', c]);
  opening.push([k.openLastViewedMs, 'tap', 'cam11', c]);
  const drop = k.openArmMs + k.armingGapMs;
  if (k.openArm) opening.push([k.openArmMs, 'tap', 'cam9', c]);
  opening.push([drop, 'tap', 'monitor', c]);
  const raise = drop + k.openRaiseGapMs;
  opening.push([raise, 'tap', 'monitor', c]);
  const windAt = raise + k.openWindLeadMs;
  opening.push([windAt, 'hold', 'wind', k.openWindMs]);
  const camdropAt = windAt + k.openWindMs;
  opening.push([camdropAt, 'camdrop', k.openCamdropLeadMs, k.camdropMonitorMs, k.camdropTailMs]);
  const camdropEnd = camdropAt + k.openCamdropLeadMs + k.camdropMonitorMs + k.camdropTailMs;
  opening.push([camdropEnd + k.openMaskLeadMs, 'tap', 'mask', c]);

  let loop;
  if (k.loopPeriodMs === 10000) {
    loop = [
      [k.maskOffMs, 'tap', 'mask', c],
      [k.hallOffsetMs, 'hall', k.hallMs],
      [k.raiseMs, 'tap', 'monitor', c],
      [k.stunRefreshMs, 'hold', 'ventl', k.stunRefreshHoldMs],
      [k.windLeadMs, 'hold', 'wind', k.windMs],
      [k.camdropMs, 'camdrop', k.camdropLeadMs, k.camdropMonitorMs, k.camdropTailMs],
      [k.maskOnMs + k.loopPeriodMs, 'tap', 'mask', c],
    ];
  } else {
    // Faithful per-interval routine, MINUS-3-STRATEGY sec.3: enter the cameras
    // just after the interval, refresh the CAM 09 stun and wind, exit at :X4
    // holding the flashlight (which also flashes Foxy through the animation),
    // mask until the next interval. NOTE: a symmetric loop this short cannot
    // give Balloon Boy the sourced 5 consecutive mask ticks -- the published
    // routine covers that with its blackout / vent-guest branch (reactiveBB),
    // which this open-loop build does not have. Expect it to fail the gate;
    // that failure is the measurement (cf. cyclelengthsearch.mjs for Minus 7).
    const p = k.loopPeriodMs;
    const enter = Math.round(p * 0.02);              // just after the interval
    const windAt5 = enter + 300;
    const camdrop5 = Math.round(p * 0.80);           // exit near :X(0.8p)
    const camEnd5 = camdrop5 + k.camdropLeadMs + k.camdropMonitorMs + k.camdropTailMs;
    loop = [
      [enter, 'tap', 'monitor', c],
      [enter + 50, 'hold', 'ventl', k.stunRefreshHoldMs],
      [windAt5, 'hold', 'wind', Math.max(200, camdrop5 - windAt5 - 100)],
      [camdrop5, 'camdrop', k.camdropLeadMs, k.camdropMonitorMs, k.camdropTailMs],
      [camEnd5 + 50, 'hall', k.hallMs],
      [camEnd5 + 150, 'tap', 'mask', c],
    ];
  }
  return { opening, loop };
}

// The shipped schedule, frozen. schedule()/emitPlan() default to these; a
// non-default build is passed explicitly.
const _default = build();
export const OPENING = _default.opening;
export const LOOP = _default.loop;

// build(KNOBS0) must reproduce the schedule this file shipped with.
{
  const OPENING0 = [
    [0, 'tap', 'monitor', 33], [300, 'tap', 'cam11', 33], [833, 'tap', 'cam9', 33],
    [883, 'tap', 'monitor', 33], [1616, 'tap', 'monitor', 33], [2050, 'hold', 'wind', 1750],
    [3800, 'camdrop', 200, 33, 67], [4400, 'tap', 'mask', 33],
  ];
  const LOOP0 = [
    [9200, 'tap', 'mask', 33], [9500, 'hall', 33], [10100, 'tap', 'monitor', 33],
    [10400, 'hold', 'ventl', 100], [10550, 'hold', 'wind', 3250],
    [13850, 'camdrop', 150, 33, 67], [14400, 'tap', 'mask', 33],
  ];
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (!eq(OPENING, OPENING0) || !eq(LOOP, LOOP0))
    throw new Error('build(KNOBS0) does not reproduce the shipped schedule:\n' +
      `opening ${JSON.stringify(OPENING)}\nloop ${JSON.stringify(LOOP)}`);
}

const frame = ms => Math.round(ms * C.FPS / 1000);

// The interpreter's control vocabulary is not the engine's: a camera button is
// `camN`, the feed light is `ventl`. Map both to the sim's action names.
const actionFor = action =>
  action.startsWith('cam') ? `cam:${action.slice(3)}`
  : action === 'ventl' ? 'light'
  : action;

// The frame-stamped sim queue for one night of the loop. `shift(cycle, index,
// whenMs)` returns a per-instruction millisecond offset -- 0 everywhere is the
// shipped schedule; a constant models an epoch/T0 phase error; a single nonzero
// row is the per-instruction margin probe (minus-toys-margin.mjs). `opening` /
// `loop` default to the shipped tables; pass build(knobs).opening/.loop to
// schedule a searched variant. `periodMs` is how often the loop table repeats.
export function schedule({ splitCamera = true, shift = () => 0,
                           opening = OPENING, loop = LOOP,
                           periodMs = KNOBS0.loopPeriodMs, loopStartMs = 0 } = {}) {
  const queue = [];
  const add = (cycle, index, base, row) => {
    const [at, kind, a, b, cc] = row;
    const when = base + at + shift(cycle, index, base + at);
    if (kind === 'tap') queue.push([frame(when), 'press', actionFor(a)]);
    else if (kind === 'hold' || kind === 'hall') {
      const action = kind === 'hall' ? 'light' : actionFor(a);
      const duration = kind === 'hall' ? a : b;
      queue.push([frame(when), 'press', action],
                 [frame(when + duration), 'release', action]);
    } else if (kind === 'camdrop') {
      queue.push([frame(when), 'press', 'light'],
                 [frame(when + a), 'press', 'monitor'],
                 [frame(when + a + b + cc), 'release', 'light']);
    }
  };
  opening.forEach((row, i) => {
    if (!splitCamera && row[2] === 'cam9') return;
    add('opening', i, 0, row);
  });
  for (let base = loopStartMs; base < 420000; base += periodMs)
    loop.forEach((row, i) => add('toys', i, base, row));
  return queue.sort((x, y) => x[0] - y[0]);
}

export function replay({ night = 7, seed = 1, worst = false, splitCamera = true,
                         shift, knobs } = {}) {
  const sim = new Sim({ night, seed, worst });
  const { opening, loop } = knobs ? build(knobs) : _default;
  const kk = knobs ? clone(knobs) : KNOBS0;
  const periodMs = kk.minimal ? kk.minPeriodMs : kk.loopPeriodMs;
  const loopStartMs = kk.minimal ? kk.minLoopStartMs : 0;
  const queue = schedule({ splitCamera, shift, opening, loop, periodMs, loopStartMs });

  let i = 0, splitAt = -1, minBox = 1, minPower = sim.power;
  while (sim.alive && !sim.won) {
    while (i < queue.length && queue[i][0] <= sim.frame) {
      const [, kind, action] = queue[i++];
      sim[kind](action);
    }
    sim.tick();
    if (splitAt < 0 && sim.camsUp && sim.viewing === 11 && sim.cam === 9)
      splitAt = sim.frame;
    minBox = Math.min(minBox, sim.box);
    minPower = Math.min(minPower, sim.power);
  }
  return { sim, splitAt, minBox, minPower };
}

export function emitPlan(night, knobs) {
  const { opening, loop } = knobs ? build(knobs) : _default;
  const kk = knobs ? clone(knobs) : KNOBS0;
  const periodMs = kk.minimal ? kk.minPeriodMs : kk.loopPeriodMs;
  // `#period` names the loop cadence so trial.sh does not have to guess it
  // (POLICY_CYCLE_MS). The 10/20 plan is 10 s; `--minimal` is 5 s.
  const lines = [`#policy minus-toys`, `#night ${night}`, `#period ${periodMs}`,
                 '#cycle opening'];
  for (const row of opening) lines.push(row.join(' '));
  lines.push('#cycle toys');
  for (const row of loop) lines.push(row.join(' '));
  return lines.join('\n') + '\n';
}

// death.reason -> the AI id the sourced table gates it on (for canAct checks).
const REASON_AI = {
  'golden-freddy': 'golden', 'golden-freddy-hall': 'golden',
  foxy: 'foxy', puppet: 'puppet', 'balloon-boy': 'bb',
};

function gate(night, knobs, runs = 200) {
  const minimal = !!clone(knobs).minimal;
  for (const worst of [false, true]) {
    const n = worst ? Math.min(100, runs) : runs;
    let wins = 0;
    const lossReasons = new Set();
    for (let i = 0; i < n; i++) {
      const r = replay({ night, worst, seed: (i * 2654435761) >>> 0, knobs });
      if (r.sim.won && r.splitAt >= 0) wins++;
      else if (r.sim.death) lossReasons.add(r.sim.death.reason);
    }
    console.log(`Minus Toys device plan night ${night}${minimal ? ' minimal' : ''} ` +
      `${worst ? 'worst' : 'normal'}: ${wins}/${n}`);
    if (wins === n) continue;
    // The minimal plan carries no defensive mask/monitor churn, so worst-mode
    // pinning -- which forces AI-0 animatronics to advance and spawn -- reaches
    // states the sourced table forbids. Accept a worst-mode loss ONLY if every
    // loss is to an animatronic canAct() says cannot act on this night. A loss
    // to any reachable threat, or any loss on normal seeds, is a real failure.
    const artifactOnly = minimal && worst && [...lossReasons].every(reason => {
      const id = REASON_AI[reason];
      return id && !C.canAct(night, id);
    });
    if (artifactOnly) {
      console.log(`  worst-mode losses are pinned-RNG artifacts (${[...lossReasons].join(', ')} ` +
        `-- all AI 0 on night ${night}); the normal-seed gate is the proof`);
      continue;
    }
    return false;
  }
  let controlWins = 0;
  for (let i = 0; i < runs; i++)
    if (replay({ night, splitCamera: false, seed: (i * 2654435761) >>> 0, knobs }).sim.won) controlWins++;
  console.log(`Minus Toys device plan night ${night} no-split control: ${controlWins}/${runs}`);
  // On early story nights the weak AI can let an unstalled control survive;
  // the load-bearing control is canonical 10/20, where it must clear none.
  return night === 7 ? controlWins === 0 : true;
}

// --knobs=loopPeriodMs=5000,windMs=3000 -- overrides on KNOBS0, for --gate and emission.
function parseKnobs() {
  const v = process.argv.find(a => a.startsWith('--knobs='));
  if (!v) return undefined;
  const k = {};
  for (const pair of v.slice(8).split(',')) {
    const [name, val] = pair.split('=');
    if (!(name in KNOBS0)) throw new Error(`unknown knob: ${name}`);
    k[name] = val === 'true' ? true : val === 'false' ? false : +val;
  }
  return k;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const nightArg = (process.argv.find(v => v.startsWith('--night=')) || '--night=7').slice(8);
  const night = +nightArg;
  if (!Number.isInteger(night) || night < 1 || night > 7)
    throw new Error('--night must be 1..7');
  let knobs = parseKnobs();
  if (process.argv.includes('--minimal')) {
    // The elegant story plan is NOT one shape for all nights: Night 1 alone
    // reduces to "arm + flash + wind" (MINUS-3-STRATEGY.md sec.9 -- monitor-down
    // disarms every Toy, nothing reaches a vent, GF is AI 0). Night 2 needs a
    // mask for Mangle/BB; Nights 3-5 switch to CAM 08 and need hall flashes.
    // Those shapes are not designed yet, so --minimal is Night 1 only.
    if (night !== 1)
      throw new Error('--minimal is Night 1 only (MINUS-3-STRATEGY.md sec.9); ' +
        'nights 2-5 need their own shapes and do not have them yet');
    knobs = { ...(knobs || {}), minimal: true };
  }
  if (process.argv.includes('--gate')) {
    if (!gate(night, knobs)) process.exitCode = 1;
  } else {
    process.stdout.write(emitPlan(night, knobs));
  }
}
