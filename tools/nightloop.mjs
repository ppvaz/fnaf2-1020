// Full-night closed-loop campaign: drive the belief-state cycle controller
// cycle by cycle for a whole night and compare it against its controls.
// ROADMAP Track A1's exit-gate instrument.
//
//   node tools/nightloop.mjs [runs] [night]
//   node tools/nightloop.mjs --assert          # smoke cohort, exit 1 on failure
//
// There is NO compiled full-night schedule anywhere in this path. Every action
// is a bounded primitive selected at its own decision boundary and committed
// only as an immediate prefix.
//
// SCOPE, stated plainly: the `route` scorer below is a BASELINE CONTROL that I
// wrote to exercise the loop. It is not a sourced strategy and it is not
// promoted. Its one knob (`WIND_AT`) is a harness knob, not a measured value.
// A survival number from this harness is a simulator result about the
// controller's plumbing -- never gameplay evidence, never a device claim.
import * as C from '@fnaf2-1020/core/mechanics';
import { Sim, Rng } from '@fnaf2-1020/core/mechanics';
import { Observer } from '@fnaf2-1020/core/sensing';
import { CycleController, makeUnknownFacts, getCycle } from '@fnaf2-1020/core/control';

const ASSERT = process.argv.includes('--assert');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const RUNS = Number(args[0] ?? (ASSERT ? 3 : 10));
const NIGHT = Number(args[1] ?? 1);

// Every primitive the reviewed library offers. A full night needs the whole
// set: the monitor/camera/mask primitives exist so winding is reachable at all.
const LIBRARY = ['observe-and-hold', 'defensive-mask', 'wind-and-anchor',
  'foxy-hall-reset', 'verify-and-resume', 'select-box-cam', 'lower-monitor',
  'unmask'].map(getCycle);

const WIND_AT = 0.55;   // harness knob: box fraction below which winding leads

/**
 * Baseline route model. Returns worst-case risk per candidate from the
 * controller's own reduced state -- no privileged engine read. Lower is
 * selected. This encodes "keep the box wound, mask a blackout, otherwise watch
 * the office", which is the cheapest route that exercises every primitive.
 */
function route(cycle, hypothesis, _gate, controller) {
  const st = controller.reduced;
  const want = (() => {
    if (hypothesis.hazard === 'active') return st.maskOn ? null : 'defensive-mask';
    if (st.maskOn) return 'unmask';
    if (st.box < WIND_AT) {
      if (st.monitor !== 'up') return 'verify-and-resume';
      if (st.viewedCamera !== C.BOX_CAM) return 'select-box-cam';
      return 'wind-and-anchor';
    }
    return st.monitor === 'up' ? 'lower-monitor' : 'observe-and-hold';
  })();
  // resourceMargin is a TIE-BREAK, so it must not carry a continuous quantity:
  // `selectCycle` sorts on worstRisk then resourceMargin, and feeding the box
  // fraction in here reorders equal-risk candidates as the box drains, which
  // livelocked the loop into replanning every two frames on `select-box-cam`.
  return cycle.id === want
    ? { risk: 0, resourceMargin: 10, detail: `route wants ${want}` }
    : { risk: 1, resourceMargin: 0, detail: `route wants ${want}` };
}

// The exact proof stays outside the controller: it is a proof oracle for an
// already-reviewed primitive, never a state read the controller can use.
let GATE_CALLS = 0;
const TRACE_PROGRESS = process.argv.includes('--progress');
function exactGate(sim, cycle) {
  GATE_CALLS++;
  if (cycle.id === 'observe-and-hold') return { accepted: true };
  const copy = Sim.fromSnapshot(sim.opts, sim.snapshot());
  const origin = copy.frame;
  for (const action of cycle.actions) {
    const target = origin + action.atFrame;
    // `tick()` is a no-op once `won` is set and does not advance the frame,
    // so a target past `durationFrames` spins forever without this guard.
    while (copy.alive && !copy.won && copy.frame < target) copy.tick();
    if (!copy.alive) return { accepted: false, reason: 'exact-death-before-action' };
    copy[action.kind](action.action);
  }
  const end = origin + cycle.durationFrames;
  while (copy.alive && !copy.won && copy.frame < end) copy.tick();
  return (copy.alive || copy.won)
    ? { accepted: true }
    : { accepted: false, reason: `exact-death:${copy.death?.reason ?? 'unknown'}` };
}

function runOne(index, mode) {
  const seed = (index * 2654435761) >>> 0;
  const sim = new Sim({ night: NIGHT, seed });
  const observer = new Observer({ interval: 4, rng: new Rng(seed ^ 0x9e3779b9) });
  const controller = new CycleController({ cycles: LIBRARY });
  controller.reduced.night = NIGHT;
  const selected = {};
  /** @type {any[]} */ const pending = [];
  let actions = 0;
  let released = 0;
  let refused = 0;

  while (sim.alive && !sim.won && sim.frame < C.NIGHT_FRAMES) {
    if (mode !== 'open-loop' && sim.frame % 4 === 0) {
      const facts = observer.read(sim);
      controller.observe(mode === 'disabled' ? makeUnknownFacts(facts) : facts,
        { frame: sim.frame });
      const decision = controller.plan({
        exactGate: cycle => exactGate(sim, cycle), score: route,
      });
      if (decision.selected) selected[decision.selected] = (selected[decision.selected] ?? 0) + 1;
      const committed = controller.commit(decision, { frame: sim.frame });
      for (const action of committed.actions) {
        sim[action.kind](action.action);
        actions++;
      }
      // Scheduling is the caller's. The controller commits only an immediate
      // prefix; without this queue a primitive's release is simply dropped and
      // the input stays held -- on a phone, a touch contact never lifted.
      for (const action of committed.deferred) pending.push(action);
    }
    for (let i = pending.length - 1; i >= 0; i--) {
      if (sim.frame < pending[i].dueFrame) continue;
      const action = pending[i];
      const result = controller.releaseDeferred(action, { frame: sim.frame });
      if (result.accepted) { sim[action.kind](action.action); released++; actions++; }
      else refused++;
      pending.splice(i, 1);
    }
    sim.tick();
    if (TRACE_PROGRESS && sim.frame % 4000 === 0)
      console.log(`      f=${sim.frame} gate=${GATE_CALLS} act=${actions} ` +
        `box=${(controller.reduced.box ?? -1).toFixed(2)} mon=${controller.reduced.monitor} ` +
        `cam=${controller.reduced.viewedCamera} dec=${controller.decisions.length} heap=${(process.memoryUsage().heapUsed/1e6).toFixed(0)}MB`);
  }
  return { won: sim.won, frame: sim.frame,
    death: sim.death?.reason ?? null, actions, selected, gateCalls: GATE_CALLS,
    released, refused, stranded: pending.length };
}

function cohort(mode) {
  const result = { mode, won: 0, deaths: {}, actions: 0, selected: {}, frames: 0,
    gateCalls: 0, released: 0, refused: 0, stranded: 0 };
  for (let i = 0; i < RUNS; i++) {
    GATE_CALLS = 0;
    const at = Date.now();
    const run = runOne(i, mode);
    result.gateCalls += run.gateCalls;
    result.released += run.released;
    result.refused += run.refused;
    result.stranded += run.stranded;
    if (!process.argv.includes('--quiet'))
      console.log(`    seed ${i} ${mode}: frame=${run.frame} death=${run.death ?? (run.won ? 'won' : 'none')} ` +
        `actions=${run.actions} gateCalls=${run.gateCalls} ${((Date.now() - at) / 1000).toFixed(1)}s`);
    if (run.won) result.won++;
    if (run.death) result.deaths[run.death] = (result.deaths[run.death] ?? 0) + 1;
    result.actions += run.actions;
    result.frames += run.frame;
    for (const [id, n] of Object.entries(run.selected))
      result.selected[id] = (result.selected[id] ?? 0) + n;
  }
  return result;
}

// `--arms=a,b` narrows the run; the default is all three.
const armFlag = process.argv.find(a => a.startsWith('--arms='));
const ARMS = armFlag ? armFlag.slice('--arms='.length).split(',') : null;
const timed = mode => {
  if (ARMS && !ARMS.includes(mode))
    return { mode, won: 0, deaths: {}, actions: 0, selected: {}, frames: 0, skipped: true };
  const at = Date.now();
  const result = cohort(mode);
  result.seconds = (Date.now() - at) / 1000;
  return result;
};

const started = Date.now();
const estimator = timed('estimator');
const disabled = timed('disabled');
const openLoop = timed('open-loop');

console.log(`night ${NIGHT} closed loop, ${RUNS} full nights per arm ` +
  `(${((Date.now() - started) / 1000).toFixed(1)}s):`);
for (const arm of [estimator, disabled, openLoop]) {
  if (arm.skipped) { console.log(`  ${arm.mode.padEnd(10)} skipped`); continue; }
  console.log(`  ${arm.mode.padEnd(10)} ${String(arm.won).padStart(3)}/${RUNS} survived, ` +
    `${(arm.seconds ?? 0).toFixed(1)}s, ` +
    `${String(arm.actions).padStart(5)} actions, ` +
    `mean ${(arm.frames / RUNS / C.FPS).toFixed(1)}s alive, ${arm.gateCalls} exact checks, ` +
    `${arm.released} released / ${arm.refused} refused / ${arm.stranded} stranded`);
  console.log(`    deaths ${JSON.stringify(arm.deaths)}`);
  if (Object.keys(arm.selected).length)
    console.log(`    cycles ${JSON.stringify(arm.selected)}`);
}

if (ASSERT) {
  const check = (condition, message) => {
    if (!condition) { console.error(`FAIL ${message}`); process.exitCode = 1; }
    else console.log(`ok   ${message}`);
  };
  check(estimator.actions > 0, 'the acting arm actually acted');
  check(estimator.released > 0,
    `held inputs were released at their own boundary (${estimator.released})`);
  check(estimator.stranded === 0,
    `no deferred action was left holding an input at the end of a night (${estimator.stranded})`);
  check(Object.keys(estimator.selected).length >= 4,
    `the acting arm used a real primitive set (used ${Object.keys(estimator.selected).length})`);
  check(estimator.frames > disabled.frames,
    `observations bought survival time (${estimator.frames} > ${disabled.frames})`);
  check(disabled.actions === 0,
    'the observation-disabled control never acted on an UNKNOWN fact');
  check(openLoop.won === 0 && openLoop.actions === 0,
    'the open-loop control neither acted nor survived');
}
