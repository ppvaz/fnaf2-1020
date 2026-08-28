// Per-instruction timing margin map for the Minus Toys device loop.
//
// The deterministic gate (minus-toys-plan.mjs --gate) says 200/200 for a
// schedule that has almost no slack: the published strategy's own write-up
// (docs/strategy/MINUS-3-STRATEGY.md sec.3) states its error budget is only
// ~0.66 s per cycle, and the first device run (n2-minustoys-0117, 2026-08-28)
// died to a BB walk-in -> Foxy chain that the gate could not see.
//
// This maps where that slack actually is. It replays the loop with ONE
// instruction shifted in isolation (no other jitter) and reports the widest
// early/late offset at which every seed of a fixed set still survives -- i.e.
// how far off that one press can be before the night stops being winnable.
// It also reports the whole-schedule phase margin: the epoch/T0 alignment
// error the device can absorb before the same thing happens.
//
//   node tools/device/minus-toys-margin.mjs [--night=N] [--seeds=N] [--max=MS]
//
// `--steps` in cyclesearch.mjs asks the same question for Minus 7; this is its
// Minus Toys counterpart. It is a measurement of the MODEL (no randomness), and
// it inherits the engine's Golden-Freddy-interval and Toy-cam-stall gaps
// (plans/02 sec.5) -- read it as "the model has at most this much slack here".
import { OPENING, LOOP, replay } from './minus-toys-plan.mjs';

const arg = (k, d) => {
  const v = process.argv.find(a => a.startsWith(`--${k}=`));
  return v ? +v.slice(k.length + 3) : d;
};
const NIGHT = arg('night', 2);
const SEEDS = arg('seeds', 200);
const MAX = arg('max', 800);          // ms; search this far each way
const STEP = 33;                       // ms; one Fusion poll

const seed = i => (i * 2654435761) >>> 0;

// All seeds survive with this shift applied? `shift` is a schedule() offset fn.
function allSurvive(shift) {
  for (let i = 0; i < SEEDS; i++) {
    const r = replay({ night: NIGHT, seed: seed(i), shift });
    if (!(r.sim.won && r.splitAt >= 0)) return false;
  }
  return true;
}

// Largest k in [0, MAX] (ms, multiples of STEP) for which `mk(k)` still clears,
// scanning outward and stopping at the first failure (the basin is contiguous).
function edge(mk) {
  let last = 0;
  for (let k = STEP; k <= MAX; k += STEP) {
    if (!allSurvive(mk(k))) break;
    last = k;
  }
  return last === MAX ? `>=${MAX}` : String(last);
}

const rowShift = (cycle, index, delta) =>
  (c, i) => (c === cycle && i === index ? delta : 0);

console.log(`Minus Toys margin map -- night ${NIGHT}, ${SEEDS} seeds, ` +
  `+/-${MAX} ms in ${STEP} ms steps`);
console.log('(model only; no jitter. "early"/"late" = ms that one press can ' +
  'move before some seed dies. Strategy write-up budgets ~660 ms/cycle.)\n');

// Baseline sanity: the shipped schedule must clear at zero shift.
if (!allSurvive(() => 0)) {
  console.error('the shipped schedule does not clear at zero shift -- ' +
    'fix the plan before reading margins');
  process.exit(1);
}

const rows = [];
for (const [cycle, table] of [['opening', OPENING], ['toys', LOOP]]) {
  table.forEach((row, index) => {
    const [at, kind, a] = row;
    const label = `${cycle}[${index}] +${at} ${kind} ${a}`;
    const late = edge(k => rowShift(cycle, index, k));
    const early = edge(k => rowShift(cycle, index, -k));
    rows.push({ label, early, late });
  });
}

const pad = rows.reduce((m, r) => Math.max(m, r.label.length), 0);
for (const r of rows) {
  const tight = [r.early, r.late].some(v => /^\d+$/.test(v) && +v < 330);
  console.log(`  ${r.label.padEnd(pad)}   early ${String(r.early).padStart(5)}` +
    `   late ${String(r.late).padStart(5)}${tight ? '   <-- under half the budget' : ''}`);
}

// Whole-schedule phase margin: every instruction shifted together, which is
// what an epoch/T0 misalignment or a steady game-vs-wall clock offset does.
const phaseLate = edge(k => () => k);
const phaseEarly = edge(k => () => -k);
console.log(`\n  WHOLE-SCHEDULE PHASE (epoch/T0 error)   ` +
  `early ${String(phaseEarly).padStart(5)}   late ${String(phaseLate).padStart(5)}`);
console.log(`  n2-minustoys-0117 reported a 302 ms epoch bracket alone.`);

const budget = 330;
const tightPhase = [phaseEarly, phaseLate].some(v => /^\d+$/.test(v) && +v < budget);
if (tightPhase)
  console.log(`\n  => the WHOLE-SCHEDULE phase margin is under half the strategy's ` +
    `own ~660 ms/cycle budget. A fixed cadence anchored to T0 cannot hold it ` +
    `on a device whose epoch latch alone is uncertain by ~300 ms.`);
