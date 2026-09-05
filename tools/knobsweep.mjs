// Knob factorial over the night policy: run one held-out cohort under every
// combination of a few named policy knobs and print survived/seeds per night.
//
//   node tools/knobsweep.mjs --nights=1-7 --seeds=60 --seed-base=5000
//   node tools/knobsweep.mjs --axes='campMinTicks=5,3,1'
//   node tools/knobsweep.mjs --axes='rollGrid=true,false;useThud=true,false'
//
// It exists because the knobs interact. `deb6463` landed three mechanism
// changes at once and composed them by hand; the survival table that came out
// was a regression on five nights and nobody could say which knob owed it.
// This runs the product instead of guessing at it.
//
// WHAT A NUMBER FROM HERE IS. Exactly what `nightloop.mjs` says one of its
// numbers is -- same runner, same seeds, same gate -- with the control arms
// dropped, because a knob screen compares settings against each other rather
// than against a control. It is a statement about the model. It is not
// gameplay evidence, it is not a device claim, and it moves no rung of
// Plan 12's ladder. Quote `nightloop.mjs` for a headline; quote this only for
// a difference between two settings.
import { NightPolicy } from '@fnaf2-1020/core/control';
import { pool, closePool } from './pool.mjs';

const RUN_MODULE = new URL('./nightloop-run.mjs', import.meta.url).href;
const option = (name, fallback) => {
  const found = process.argv.find(a => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const SEEDS = Number(option('seeds', '60'));
const SEED_BASE = Number(option('seed-base', '5000'));
const GATE = option('gate', 'static');

// `--nights=1-7`, `--nights=1,3,6`, or a single night.
const NIGHTS = option('nights', '1-7').split(',').flatMap(part => {
  const range = part.match(/^(\d+)-(\d+)$/);
  if (!range) return [Number(part)];
  const [, lo, hi] = range.map(Number);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
});
if (NIGHTS.some(n => !Number.isInteger(n) || n < 1))
  throw new Error(`--nights must name whole nights, got ${option('nights', '')}`);

// `name=v1,v2;name=v1,v2`. Values are read as JSON where they parse, so
// `true`, `false` and numbers arrive as themselves and anything else stays a
// string -- a knob is passed through to `new NightPolicy(...)` untouched.
const AXES = option('axes', 'rollGrid=true,false;useThud=true,false')
  .split(';').filter(Boolean).map(part => {
    const eq = part.indexOf('=');
    if (eq < 1) throw new Error(`--axes entry must be name=v1,v2, got ${part}`);
    const values = part.slice(eq + 1).split(',').map(raw => {
      // JSON has no Infinity, and two of the knobs this sweeps default to it
      // (`sweepPeriodFrames`, the dormant Foxy slack). Without this the token
      // would arrive as the STRING "Infinity" and every numeric comparison
      // against it would be NaN -- a silently different policy, not a refusal.
      if (raw === 'Infinity') return Infinity;
      if (raw === '-Infinity') return -Infinity;
      try { return JSON.parse(raw); } catch { return raw; }
    });
    return { name: part.slice(0, eq), values };
  });

// `NightPolicy` destructures the knobs it knows and ignores the rest, so a
// misspelled axis would silently produce N identical arms and read as "the
// knob does nothing". Refuse instead: every axis must name a real knob.
const known = new NightPolicy({ night: 1 });
for (const axis of AXES)
  if (!Object.hasOwn(known, axis.name))
    throw new Error(`--axes names ${axis.name}, which is not a NightPolicy knob`);

/** Every combination of the axes, in declaration order. */
const arms = AXES.reduce((acc, axis) =>
  acc.flatMap(base => axis.values.map(v => ({ ...base, [axis.name]: v }))), [{}]);
const label = arm => AXES.map(a => `${a.name}=${arm[a.name]}`).join(' ') || 'default';

// One flat job list across arms, nights and seeds: the pool is spawned once
// and every worker stays busy to the end instead of draining per night.
// `SimPool.map` writes each result to `out[job.start + i]`, so the returned
// array is index-aligned with this one and `jobArm` is how a result finds its
// arm again -- `runNight` echoes the night and the seed back but not the
// knobs it was given.
/** @type {any[]} */ const jobs = [];
/** @type {number[]} */ const jobArm = [];
for (const [armIndex, policyOptions] of arms.entries())
  for (const night of NIGHTS)
    for (let offset = 0; offset < SEEDS; offset++) {
      jobs.push({ night, seedIndex: SEED_BASE + offset, mode: 'estimator',
        policy: 'night', gate: GATE, policyOptions });
      jobArm.push(armIndex);
    }

const started = Date.now();
console.log(`knob factorial: ${arms.length} arms x ${NIGHTS.length} nights x ` +
  `${SEEDS} seeds = ${jobs.length} nights, gate=${GATE}, ` +
  `seeds ${SEED_BASE}..${SEED_BASE + SEEDS - 1}`);

const runs = await pool().map(RUN_MODULE, 'runNight', jobs);
await closePool();

const cell = new Map();
for (const [index, run] of runs.entries()) {
  const key = `${jobArm[index]}:${run.night}`;
  const acc = cell.get(key) ?? { won: 0, deaths: {} };
  if (run.won) acc.won++;
  if (run.death) acc.deaths[run.death] = (acc.deaths[run.death] ?? 0) + 1;
  cell.set(key, acc);
}

const width = Math.max(...arms.map(a => label(a).length), 4);
console.log(`\n| ${'arm'.padEnd(width)} | ` +
  NIGHTS.map(n => `N${n}`.padStart(6)).join(' | ') + ' |  total |');
console.log(`|${'-'.repeat(width + 2)}|` +
  NIGHTS.map(() => '-------:|').join('') + '-------:|');
for (const [armIndex, arm] of arms.entries()) {
  const cells = NIGHTS.map(night => cell.get(`${armIndex}:${night}`) ?? { won: 0 });
  const total = cells.reduce((sum, c) => sum + c.won, 0);
  console.log(`| ${label(arm).padEnd(width)} | ` +
    cells.map(c => `${c.won}/${SEEDS}`.padStart(6)).join(' | ') +
    ` | ${`${total}/${SEEDS * NIGHTS.length}`.padStart(6)} |`);
}

// The dominant cause per cell, because two arms can tie on survival while
// dying of completely different things -- which is the whole reason the
// composition in `deb6463` was not diagnosable from its survival table.
console.log('\ndominant death by arm and night');
for (const [armIndex, arm] of arms.entries()) {
  const row = NIGHTS.map(night => {
    const acc = cell.get(`${armIndex}:${night}`);
    const top = Object.entries(acc?.deaths ?? {}).sort((a, b) => b[1] - a[1])[0];
    return `N${night} ${top ? `${top[0]}:${top[1]}` : '-'}`;
  });
  console.log(`  ${label(arm).padEnd(width)}  ${row.join('  ')}`);
}
console.log(`\n${((Date.now() - started) / 1000).toFixed(1)}s`);
