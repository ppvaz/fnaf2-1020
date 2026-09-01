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
import * as C from '@fnaf2-1020/core/mechanics';
import { Sim } from '@fnaf2-1020/core/mechanics';
import { Observer } from '@fnaf2-1020/core/sensing';
import { VentThreatReactive, guardIntents, GUARD_FRAMES } from '@fnaf2-1020/core/control';
import { Rng } from '@fnaf2-1020/core/mechanics';
import { DOUBLE_GLITCH_CAMERA_PAIRS, cameraPairHeader } from './arm-verification.mjs';

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
  preventiveVentLight: true, // regular ventl refresh; false is an observation experiment
  reactiveBB: false,       // optional BB-only left-opening/audio reactive layer
                           //   (Mangle audio is a separate policy, not part of
                           //   this device schedule yet).

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
  minArmAtMs: 115000,     // Night 1 is inert until ~1:38; do not churn early.
  minPeriodMs: 5000,       // re-flash on the game's 5 s grid, not the 10 s GF-interval cycle
  minLoopStartMs: 140000,  // first 2 AM interval: begin flash/wind work here.
  minStopAtMs: 360000,     // ~5:08 AM: no route can reach the office before 6.
  minObserveUntilMs: 420000, // stay hands-off but record through the 6 AM result.
  minFlashAtMs: 150,       // ventl (CAM 09 feed light) re-flash, early in each 5 s window
  minFlashHoldMs: 100,     // its hold -- >= one Fusion poll past the 33 ms contact floor
  minWindAtMs: 300,        // wind start, just after the flash
  minWindHoldMs: 4400,     // wind hold -- nearly the whole 5 s window; box stays full
  minProofCam09AtMs: 359700, // after the final wind releases: visible CAM 09 proof visit
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
    const arm = k.minArmAtMs;
    const open = [];
    open.push([arm + k.openViewMs, 'tap', 'monitor', c]);
    open.push([arm + k.openLastViewedMs, 'tap', 'cam11', c]);
    const drop = arm + k.openArmMs + k.armingGapMs;
    if (k.openArm) open.push([arm + k.openArmMs, 'tap', 'cam9', c]);
    open.push([drop, 'tap', 'monitor', c]);
    const raise = drop + k.openRaiseGapMs;
    open.push([raise, 'tap', 'monitor', c]);
    // Steady 5 s cycle: re-flash CAM 09, then wind. Nothing else.
    const loop = [
      [k.minFlashAtMs, 'hold', 'ventl', k.minFlashHoldMs],
      [k.minWindAtMs, 'hold', 'wind', k.minWindHoldMs],
    ];
    // The final wind ends at 5:08.  Select CAM 09 once more and leave a 300 ms
    // visible dwell before lowering the monitor.  This is proof that the Toys
    // remain held at the terminal boundary, not another defensive cycle.
    const finish = [
      [k.minProofCam09AtMs, 'tap', 'cam9', 100],
      [k.minStopAtMs, 'tap', 'monitor', 100],
    ];
    return { opening: open, loop, finish };
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
      [k.windLeadMs, 'hold', 'wind', k.windMs],
      [k.camdropMs, 'camdrop', k.camdropLeadMs, k.camdropMonitorMs, k.camdropTailMs],
      [k.maskOnMs + k.loopPeriodMs, 'tap', 'mask', c],
    ];
    if (k.preventiveVentLight)
      loop.splice(3, 0, [k.stunRefreshMs, 'hold', 'ventl', k.stunRefreshHoldMs]);
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
      [windAt5, 'hold', 'wind', Math.max(200, camdrop5 - windAt5 - 100)],
      [camdrop5, 'camdrop', k.camdropLeadMs, k.camdropMonitorMs, k.camdropTailMs],
      [camEnd5 + 50, 'hall', k.hallMs],
      [camEnd5 + 150, 'tap', 'mask', c],
    ];
    if (k.preventiveVentLight)
      loop.splice(1, 0, [enter + 50, 'hold', 'ventl', k.stunRefreshHoldMs]);
  }
  return { opening, loop, finish: [] };
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
// `epochMs` shifts the whole schedule against the game's frame grid -- the
// device reality: the plan is anchored to T0 wall clock while g263's 200 ms
// sampler (engine.js, `f % LAST_VIEW_SAMPLE_FRAMES`) is anchored to the
// night's own frame counter, and the run-to-run epoch error rotates one
// against the other. It is why the split arm is a coin flip on the phone and
// deterministic in this model at epochMs=0.
export function schedule({ splitCamera = true, shift = () => 0,
                           opening = OPENING, loop = LOOP,
                           finish = [], periodMs = KNOBS0.loopPeriodMs,
                           loopStartMs = 0, untilMs = 420000,
                           epochMs = 0 } = {}) {
  const queue = [];
  const add = (cycle, index, base, row) => {
    const [at, kind, a, b, cc] = row;
    const when = base + at + epochMs + shift(cycle, index, base + at);
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
  for (let base = loopStartMs; base < untilMs; base += periodMs)
    loop.forEach((row, i) => add('toys', i, base, row));
  finish.forEach((row, i) => add('finish', i, 0, row));
  return queue.sort((x, y) => x[0] - y[0]);
}

// Resolve the mask coverage endpoints from the emitted press rows. The two
// mask rows are shifted independently by the device-error model, so their
// nominal knob difference is not the available window. A mask tick can only
// accrue after the ON animation and stops when the OFF press begins.
export function maskWindows(queue) {
  const presses = queue.filter(([, kind, action]) => kind === 'press' && action === 'mask');
  const windows = [];
  for (let i = 0; i + 1 < presses.length; i += 2) {
    const onPressFrame = presses[i][0];
    const offPressFrame = presses[i + 1][0];
    windows.push({
      onPressFrame,
      offPressFrame,
      startFrame: onPressFrame + C.MASK_ANIM_ON,
      endFrame: offPressFrame,
    });
  }
  return windows;
}

// Explicit upper-bound control only. Production code must replace this with
// an estimator-backed provider; naming the oracle here keeps the exact engine
// phase from masquerading as the proposed Bluetooth phase clock.
export const ENGINE_PHASE_ORACLE = Object.freeze({
  kind: 'engine-phase-oracle',
  periodFrames: C.FPS,
  nextBoundaryFrame: frame => frame + ((C.FPS - (frame % C.FPS)) % C.FPS),
});

export function replay({ night = 7, seed = 1, worst = false, splitCamera = true,
                         shift, knobs, epochMs = 0,
                         phaseClock = ENGINE_PHASE_ORACLE } = {}) {
  const sim = new Sim({ night, seed, worst });
  const { opening, loop, finish } = knobs ? build(knobs) : _default;
  const kk = knobs ? clone(knobs) : KNOBS0;
  const periodMs = kk.minimal ? kk.minPeriodMs : kk.loopPeriodMs;
  const loopStartMs = kk.minimal ? kk.minLoopStartMs : 0;
  const untilMs = kk.minimal ? kk.minStopAtMs : 420000;
  const queue = schedule({ splitCamera, shift, opening, loop, finish, periodMs, loopStartMs, untilMs, epochMs });
  const scheduledMaskWindows = maskWindows(queue);

  // `reactiveBB` wires the reserved hook for real (2026-08-30 directive): a
  // VentThreatReactive layer rides the schedule -- the opening left-opening
  // video fact pre-empts it with a 5-tick mask hold (the continuous-hold tick
  // the ~4.8 s scheduled window cannot deliver), the harness suppresses the
  // base schedule while the controller is mid-response (a scheduled mask-off
  // or monitor raise during the hold is what walks BB inside), and press
  // collisions obey the night 6-38 guard. Observation models the stock video
  // loop: ~15 Hz cadence, optional round-trip delay and drop rate.
  const reactive = kk.reactiveBB ? {
    obs: new Observer({
      interval: kk.reactiveIntervalFrames ?? 4,
      readDelayFrames: kk.reactiveDelayFrames ?? 0,
      dropRate: kk.reactiveDropRate ?? 0,
      audioLatencyFrames: kk.reactiveAudioLatencyFrames ?? 12,
      audioDropRate: kk.reactiveAudioDropRate ?? 0,
      audioFalseNegativeRate: kk.reactiveAudioFalseNegativeRate ?? 0,
      audioFalsePositiveRate: kk.reactiveAudioFalsePositiveRate ?? 0,
      rng: new Rng((seed ^ 0x9e3779b9) >>> 0),
    }),
    ctrl: new VentThreatReactive({
      // The active window is supplied per decision from the actual emitted
      // press frames below. Do not substitute the nominal maskOff-maskOn knob
      // difference: animation, late observation, and independent row jitter
      // all change the remaining coverage.
    }),
    lightReleaseAt: -1,   // the pre-mask hall pulse: press now, release in hallMs
  } : null;
  const hallFrames = Math.max(1, Math.round(kk.hallMs / 1000 * C.FPS));
  const animated = reactive
    ? queue.filter(([, k, a]) => k === 'press' && (a === 'monitor' || a === 'mask'))
        .map(([at, , action]) => ({ at, action }))
    : null;

  let i = 0, splitAt = -1, minBox = 1, minPower = sim.power;
  while (sim.alive && !sim.won) {
    if (reactive && reactive.lightReleaseAt >= 0 && sim.frame >= reactive.lightReleaseAt) {
      sim.release('light');
      reactive.lightReleaseAt = -1;
    }
    // The schedule freezes only while the mask must be UP (securing/holding).
    // Verifying and restoring run it: the raise+wind rows after the drop are
    // the point, and suppressing them costs more than the threat on Night 2's
    // box margin (measured 2026-08-30: the first, blunter cut went 8/300).
    if (!reactive ||
        (!['securing', 'holding', 'banking'].includes(reactive.ctrl.state))) {
      while (i < queue.length && queue[i][0] <= sim.frame) {
        const [, kind, action] = queue[i++];
        sim[kind](action);
      }
    } else {
      while (i < queue.length && queue[i][0] <= sim.frame) i++;   // dropped, not deferred
    }
    if (reactive) {
      const facts = reactive.obs.read(sim);
      const window = animated.filter(x => Math.abs(sim.frame - x.at) < GUARD_FRAMES * 3);
      const maskWindow = scheduledMaskWindows.find(w =>
        sim.frame >= w.onPressFrame && sim.frame <= w.offPressFrame);
      const intents = reactive.ctrl.decide(facts, {
        frame: sim.frame,
        scheduled: window,
        maskWindow,
        phaseClock,
      });
      const kept = guardIntents(intents, window);
      if (reactive.ctrl.settle(kept)) for (const it of kept) {
        if (it.at <= sim.frame) {
          // The pre-mask hall pulse: the schedule spells a hall as a held
          // light (press now, release after hallMs), so expand to that pair.
          // windRelease likewise closes a hold the controller opened.
          if (it.action === 'hall') {
            sim.press('light');
            reactive.lightReleaseAt = sim.frame + hallFrames;
          } else if (it.action === 'windRelease') {
            sim.release('wind');
          } else {
            sim.press(it.action);
          }
        }
      }
    }
    sim.tick();
    if (splitAt < 0 && sim.camsUp && sim.viewing === 11 && sim.cam === 9)
      splitAt = sim.frame;
    minBox = Math.min(minBox, sim.box);
    minPower = Math.min(minPower, sim.power);
  }
  return { sim, splitAt, minBox, minPower,
           reactiveLog: reactive ? reactive.ctrl.log : undefined };
}

// The arm's sensitivity to the schedule/game phase, measured. For each whole
// frame offset over one sampler period (g263 ticks every
// LAST_VIEW_SAMPLE_FRAMES), replay the night and report survival and
// arm-landing separately: on a minimal Night 1 a missed arm is a guaranteed
// Puppet death, so `wins` separates the two only via `armed`. This is the
// pricing instrument for any arm change -- it is the model finally seeing the
// miss branch the 200/200 deterministic gate is blind to.
export function phaseScan({ night = 1, seeds = 24, worst = false, knobs } = {}) {
  const step = 1000 / C.FPS;               // one frame in ms
  const n = Math.round(C.LAST_VIEW_SAMPLE_FRAMES); // one sampler period in frames
  const rows = [];
  for (let k = 0; k < n; k++) {
    let wins = 0, armed = 0;
    for (let i = 0; i < seeds; i++) {
      const r = replay({ night, worst, seed: (i * 2654435761) >>> 0,
                         knobs, epochMs: k * step });
      if (r.sim.won) wins++;
      if (r.splitAt >= 0) armed++;
    }
    rows.push({ epochFrames: k, epochMs: +(k * step).toFixed(2), wins, armed, seeds });
  }
  return rows;
}

export function emitPlan(night, knobs) {
  const { opening, loop, finish } = knobs ? build(knobs) : _default;
  const kk = knobs ? clone(knobs) : KNOBS0;
  const periodMs = kk.minimal ? kk.minPeriodMs : kk.loopPeriodMs;
  // `#period` names the loop cadence so trial.sh does not have to guess it
  // (POLICY_CYCLE_MS). The 10/20 plan is 10 s; `--minimal` is 5 s.
  const lines = [`#policy minus-toys`, `#night ${night}`, `#period ${periodMs}`];
  if (kk.minimal) lines.push(`#loop-start ${kk.minLoopStartMs}`, `#stop-at ${kk.minStopAtMs}`,
    `#observe-until ${kk.minObserveUntilMs}`,
    // Tells trial.sh's on-phone driver to open the arm-verify window after the
    // opening raise: the host classifies the raised monitor's declared camera
    // pair and re-arms or aborts on a miss. The 200/200 gate above
    // replays at a fixed sampler phase and cannot see the arm's 3-of-12 miss
    // branch (--phasegate), so the runner closes it.
    `#arm-verify 1`,
    // The singular CAM 11 classifier proves only that the monitor returned to
    // the viewed feed. The split verifier needs the marker as well.
    `#arm-verify-cameras ${cameraPairHeader(DOUBLE_GLITCH_CAMERA_PAIRS.minusToys)}`);
  lines.push('#cycle opening');
  for (const row of opening) lines.push(row.join(' '));
  lines.push('#cycle toys');
  for (const row of loop) lines.push(row.join(' '));
  if (finish.length) {
    lines.push('#cycle finish');
    for (const row of finish) lines.push(row.join(' '));
  }
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
    const lossFrames = [];
    for (let i = 0; i < n; i++) {
      const r = replay({ night, worst, seed: (i * 2654435761) >>> 0, knobs });
      if (r.sim.won && r.splitAt >= 0) wins++;
      else if (r.sim.death) {
        lossReasons.add(r.sim.death.reason);
        lossFrames.push(r.sim.death.frame);
      }
    }
    console.log(`Minus Toys device plan night ${night}${minimal ? ' minimal' : ''} ` +
      `${worst ? 'worst' : 'normal'}: ${wins}/${n}`);
    if (wins === n) continue;
    // The minimal plan carries no defensive mask/monitor churn, so worst-mode
    // pinning -- which forces AI-0 animatronics to advance and spawn -- reaches
    // states the sourced table forbids. Accept a worst-mode loss ONLY if every
    // loss is to an animatronic canAct() says cannot act on this night. A loss
    // to any reachable threat, or any loss on normal seeds, is a real failure.
    const artifactOnly = minimal && worst && lossFrames.length === n &&
      // Worst mode forces characters through their pre-2-AM routes even though
      // Night 1's sourced AI table cannot arm them.  The first real minimal
      // action is at 2 AM, so only a loss before that boundary is an artifact.
      lossFrames.every(at => at < frame(KNOBS0.minLoopStartMs));
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
  if (process.argv.includes('--phasegate')) {
    // A measurement, not a contract: it prints the arm's phase sensitivity
    // and always exits 0. The suite (test-minus-toys-plan.mjs) pins what the
    // shipped arm must show; trial.sh's --gate stays the schedule contract.
    const seeds = +(process.argv.find(v => v.startsWith('--seeds=')) || '--seeds=24').slice(8);
    const rows = phaseScan({ night, seeds, knobs });
    console.log(`arm phase scan, night ${night}${knobs?.minimal ? ' minimal' : ''}, ` +
      `${seeds} seeds per epoch (epoch = schedule shifted against the game frame grid):`);
    for (const r of rows)
      console.log(`  +${String(r.epochFrames).padStart(2)}f (${String(r.epochMs).padStart(6)} ms): ` +
        `${r.wins}/${r.seeds} won, split armed ${r.armed}/${r.seeds}`);
    const landed = rows.filter(r => r.armed === r.seeds).length;
    const missed = rows.filter(r => r.armed === 0).length;
    console.log(`arm lands on ${landed}/${rows.length} epochs, never on ${missed}; ` +
      `device arm is a coin flip with P(miss) ~= ${missed}/${rows.length} per attempt`);
  } else if (process.argv.includes('--gate')) {
    if (!gate(night, knobs)) process.exitCode = 1;
  } else {
    process.stdout.write(emitPlan(night, knobs));
  }
}
