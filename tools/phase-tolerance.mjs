// Common-mode phase tolerance of the frame-exact published cycles.
//
//   node tools/phase-tolerance.mjs --family=minus7 --seeds=300 --kmax=30
//   node tools/phase-tolerance.mjs --family=minustoys --night=7
//   node tools/phase-tolerance.mjs --slack=0,8,17,33 --kstep=2   # the joint map
//
// WHAT A NUMBER FROM HERE IS. A statement about the model, and nothing else.
// It is not gameplay evidence, it is not a device claim, and it does not move
// a rung of Plan 12's ladder.
//
// ------------------------------------------------------------ why it exists
//
// `--slack` in either family's `cycle.mjs` perturbs the routine IID PER ROW:
// every row of every cycle draws its own independent error, so a night takes
// roughly 8 x 84 = 670 draws. Under that model both families collapse at
// +/-1 frame (Minus 7 422/3000, Minus Toys 172/3000). That is easy to read as
// "the strategy is impossibly tight", and it is not what it says, because it
// is not the executor a human is:
//
//   * IID per row destroys the RELATIVE spacing inside a cycle, which is where
//     the routine's safety lives (press, MASK_ANIM_ON + 301, release). A human
//     runs the cycle as one motor program and the gaps survive.
//   * 670 independent draws compound over a night. A human re-anchors to the
//     game's own clock every interval (MINUS-7-STRATEGY.md §1's mandatory
//     timer), so the error does not accumulate across cycles.
//
// The human error is COMMON MODE: the whole cycle sits k frames off the
// interval with its internal gaps intact. So is the error of an executor whose
// dispatch latency is stable but unknown -- which is the question that decides
// whether the external device route is reachable at all. The two models
// disagree by more than an order of magnitude, so quote the one that matches
// the executor being argued about, and say which it is.
//
// NEITHER MODEL ALONE IS A DEVICE NUMBER, and the two are orthogonal rather
// than rival. Decompose a real executor's timing error into (a) a common-mode
// offset of the whole cycle against the interval and (b) residual per-row
// scatter around it. `--slack` sweeps (b) with (a) pinned at zero -- note that
// every row is scheduled from `w0`, the TRUE interval, so it also assumes a
// perfect clock and models neither a wrong epoch nor drift. `--kmax` sweeps
// (a) with (b) pinned at zero, which is a perfectly repeatable hand that is
// consistently late. A phone has both at once: an epoch bracket and drift on
// (a), dispatch jitter on (b). `--slack` together with the k sweep prints the
// joint map, which is the only one of the three that can be compared against a
// measured handset.
//
// The asymmetry between them is mechanical, not a curiosity: the routine's
// margins live in the GAPS between rows, so a common-mode shift slides every
// gap along intact until one walks off a cliff, while per-row scatter attacks
// every gap at once and gets ~670 attempts a night.
//
// The families differ only in WHICH cycle rows are absolute offsets from the
// interval, so that is the only family-specific thing here and it is data.
import { CYCLE as M7, runCycle } from './minus7/cycle.mjs';
import { CYCLE as MT, runMinusToys7 } from './minustoys/cycle.mjs';

const FAMILIES = {
  minus7: {
    cycle: M7, run: runCycle,
    // `sweepGap`/`windGap` are gaps measured from `raise`, so they ride along
    // with it and must not be shifted again.
    relative: ['sweepGap', 'windGap'],
  },
  minustoys: {
    cycle: MT, run: runMinusToys7,
    // Every row is documented as an interval-relative offset from w0.
    relative: [],
  },
};

const option = (name, fallback) => {
  const found = process.argv.find(a => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const NAME = option('family', 'minus7');
const family = FAMILIES[NAME];
if (!family) throw new Error(`--family must be one of ${Object.keys(FAMILIES).join(', ')}`);
const SEEDS = Number(option('seeds', '300'));
const KMAX = Number(option('kmax', '30'));
const KSTEP = Number(option('kstep', '1'));
const NIGHT = Number(option('night', '7'));
const SLACKS = option('slack', '0').split(',').map(Number);

// The operator's own clock is what is offset, so every absolute row moves with
// it -- including any guard the routine applies to its own decisions.
const shifted = (k) => Object.fromEntries(Object.entries(family.cycle).map(
  ([key, value]) => [key, family.relative.includes(key) ? value : value + k]));

const cell = (k, slackMs) => {
  const cycle = shifted(k);
  /** @type {Record<string, number>} */ const deaths = {};
  let won = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = family.run(seed, { night: NIGHT, cycle, slackMs });
    if (r.won) won++;
    else deaths[r.death.reason] = (deaths[r.death.reason] ?? 0) + 1;
  }
  const top = Object.entries(deaths).sort((a, b) => b[1] - a[1])[0];
  return { won, top: top ? `${top[0]}:${top[1]}` : '-' };
};

console.log(`phase sweep: ${NAME}, night ${NIGHT}, ${SEEDS} seeds, ` +
  `offset k = -${KMAX}..+${KMAX} step ${KSTEP} (1 frame = ${(1000 / 60).toFixed(1)} ms), ` +
  `scatter = ${SLACKS.join('/')} ms`);
if (SLACKS.length === 1) {
  console.log('|   k |   ms |     won | dominant death |');
  console.log('|----:|-----:|--------:|---|');
  for (let k = -KMAX; k <= KMAX; k += KSTEP) {
    const { won, top } = cell(k, SLACKS[0]);
    console.log(`| ${String(k).padStart(3)} | ${String(Math.round(k * 1000 / 60)).padStart(4)} | ` +
      `${`${won}/${SEEDS}`.padStart(7)} | ${top} |`);
  }
} else {
  // The joint map: offset down the rows, per-row scatter across the columns.
  console.log(`|   k |   ms | ${SLACKS.map(s => `${s}ms`.padStart(8)).join(' | ')} |`);
  console.log(`|----:|-----:|${SLACKS.map(() => '---------:|').join('')}`);
  for (let k = -KMAX; k <= KMAX; k += KSTEP) {
    const row = SLACKS.map(s => `${cell(k, s).won}/${SEEDS}`.padStart(8));
    console.log(`| ${String(k).padStart(3)} | ${String(Math.round(k * 1000 / 60)).padStart(4)} | ` +
      `${row.join(' | ')} |`);
  }
}
