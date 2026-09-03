// Plan 05 package 8: the box-side anatomy of the bb and bb+foxy survivors.
//
//   node tools/invent/box-anatomy.mjs [--target=bb+foxy] [--seeds=300]
//                                     [--entry=best|index] [--variant=full|essential]
//
// `death-anatomy.mjs` interrogates the FOXY axis (D, locks, locks-out). These
// two frontiers died a different way: ~1196/1200 and 1199/1200 to the PUPPET,
// which no rule of either genome ever spends an input on. A survival rate is
// one number hiding its own failure mode; this instrument records, per seed:
//
//   the BOX axis     wind spend, box-empty frame, charge at 6 AM
//   the LADDER       escape-stage/hop/opening timeline once the box is empty
//                    (g494-497: 3 escape stages at (AI+1)/20 per second, then
//                    hops at the same rate, then the 1-in-10 office roll)
//   the BB axis      opening/inside events (his final hop needs the monitor up,
//                    g417; the monitor is also the only road to CAM 11)
//   the FOXY axis    max D and whether he ever locked (D +1/s, g824; the flash
//                    zeroes it at hall stage 1, g745)
//
// Pedro's ruling this instrument encodes as a MEASURED verdict, not an
// assertion: holding the monitor down to keep Balloon Boy out is NEVER viable
// as a strategy, because there is ALWAYS a box to be wound -- except at the
// very end of the night, once the box's remaining charge provably outlasts the
// night (the drain is deterministic, g653-660). A survivor that never winds is
// therefore named `box-refusal` and its rate is reported as the probability
// that the AI-0 luck ladder outruns the clock, not as a defence.
import { readFileSync, writeFileSync } from 'node:fs';
import * as C from '@fnaf2-1020/core/mechanics';
import { Sim } from '@fnaf2-1020/core/mechanics';
import { view, ACTIONS, run } from '../minus7/sim.mjs';
import { validateGenome, interpret, REGISTER_COUNT } from './policy-lang.mjs';
import { constantsFor } from './search.mjs';
import { threatSet } from './targets.mjs';

const argOf = (n, d) => {
  const f = process.argv.find(a => a.startsWith(`--${n}=`));
  return f ? f.split('=')[1] : d;
};
const TARGET = argOf('target', 'bb+foxy');
const SEEDS = Number(argOf('seeds', 300));
const ENTRY = argOf('entry', 'best');
const VARIANT = argOf('variant', 'full');

const doc = JSON.parse(readFileSync(`docs/evidence/invent/frontier-${TARGET}.json`, 'utf8'));
const entry = ENTRY === 'best'
  ? doc.front.reduce((b, c) => (c.rate > (b?.rate ?? -1) ? c : b), null)
  : doc.front[Number(ENTRY)];
if (!entry) { console.error('no frontier entry'); process.exit(1); }

// --variant=essential is the death-anatomy convention (drop to the ablation's
// load-bearing rules); --variant=full is the committed genome, which is what
// the artifact's own `ablation.base` numbers measured.
const essential = new Set(entry.ablation.essential);
const genome = VARIANT === 'essential'
  ? validateGenome({ ...entry.genome,
      rules: entry.genome.rules.filter((_, i) => essential.has(i)) })
  : validateGenome(entry.genome);

const customNight = threatSet(TARGET);
const constants = constantsFor(7, customNight);
const DRAIN = C.boxDrainFrames(7);
const NIGHT = C.NIGHT_FRAMES;

function runOne(seed) {
  const sim = new Sim({ night: 7, seed, customNight });
  let registers = new Array(REGISTER_COUNT).fill(0);
  const rec = {
    seed, windDecisions: 0, windFrames: 0, monitorUpFrames: 0,
    maskDecisions: 0, flashDecisions: 0, sweepDecisions: 0,
    boxEmptyFrame: null, maxD: 0, foxyLockedAt: null, foxyArrivedAt: null,
    bbOpeningAt: null, bbInsideAt: null,
    ladder: [], puppetOutAt: null, puppetOpeningAt: null, lastBox: 1,
    actions: {}, blackoutFrames: 0,
  };
  let guard = 0, prevAction = null;
  const stageSeen = new Set();
  while (sim.alive && !sim.won && guard++ < 8000) {
    const f = sim.frame;
    if (sim.monitor === 'up') rec.monitorUpFrames += 1;
    if (sim.blackout.active) rec.blackoutFrames += 1;
    if (rec.boxEmptyFrame === null && sim.box <= 0) rec.boxEmptyFrame = f;
    rec.maxD = Math.max(rec.maxD, sim.foxy.D);
    if (rec.foxyArrivedAt === null && sim.foxy.loc !== 'parts') rec.foxyArrivedAt = f;
    if (rec.foxyLockedAt === null && sim.foxy.gotYou) rec.foxyLockedAt = f;
    if (rec.bbOpeningAt === null && sim.bb.inOpening) rec.bbOpeningAt = f;
    if (rec.bbInsideAt === null && sim.bb.inside) rec.bbInsideAt = f;
    for (let s = 1; s <= sim.puppet.stage; s++)
      if (!stageSeen.has(s)) { stageSeen.add(s); rec.ladder.push({ stage: s, at: f }); }
    if (rec.puppetOutAt === null && sim.puppet.out) rec.puppetOutAt = f;
    if (rec.puppetOpeningAt === null && sim.puppet.atOpening) rec.puppetOpeningAt = f;

    const obs = view(sim);
    const step = interpret(genome, obs, { registers, constants });
    registers = step.registers;
    rec.actions[step.action] = (rec.actions[step.action] ?? 0) + 1;
    if (step.action === 'WIND' || step.action === 'WIND_LONG') {
      rec.windDecisions++;
      rec.windFrames += ACTIONS[step.action](obs).frames;
    }
    if (step.action === 'MASK_ON' || step.action === 'HOLD_MASK') rec.maskDecisions++;
    if (step.action === 'HALL_FLASH' || step.action === 'HALL_HOLD') rec.flashDecisions++;
    if (step.action === 'SWEEP') rec.sweepDecisions++;
    run(sim, ACTIONS[step.action](obs));
    rec.lastBox = sim.box;
    prevAction = step.action;
  }
  rec.endFrame = sim.frame;
  rec.won = sim.won;
  rec.death = sim.won ? null : (sim.death?.reason ?? 'guard');
  rec.boxAtEnd = sim.box;
  rec.puppetStageAtEnd = sim.puppet.stage;
  rec.puppetHopsAtEnd = sim.puppet.idx;
  rec.puppetOut = !!sim.puppet.out;
  rec.puppetAtOpening = !!sim.puppet.atOpening;
  rec.prevAction = prevAction;
  return rec;
}

const rows = [];
for (let seed = 0; seed < SEEDS; seed++) rows.push(runOne(seed));

const pct = (n, of) => `${((n / Math.max(of, 1)) * 100).toFixed(2)}%`;
const tally = (rows_, key) => rows_.reduce((m, r) => {
  const k = typeof key === 'function' ? key(r) : r[key];
  m[k] = (m[k] ?? 0) + 1; return m;
}, {});
const show = (title, counts) => {
  console.log(`\n  ${title}`);
  const max = Math.max(...Object.values(counts), 1);
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1]))
    console.log(`    ${String(k).padEnd(34)} ${String(v).padStart(5)}  ${'#'.repeat(Math.round((v / max) * 36))}`);
};
const stats = a => {
  const s = [...a].sort((x, y) => x - y);
  const q = p => s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN;
  return s.length
    ? `min ${s[0]}  p50 ${q(0.5)}  p90 ${q(0.9)}  p99 ${q(0.99)}  max ${s[s.length - 1]}`
    : 'none';
};
const sec = f => `${(f / C.FPS).toFixed(1)}s`;

console.log(`box anatomy: ${TARGET}  [${VARIANT} genome, ${genome.rules.length} rules]  ` +
  `${SEEDS} seeds  customNight ${JSON.stringify(customNight)}`);
console.log(`  drain g653-660: full -> empty in ${DRAIN} frames (${sec(DRAIN)}), ` +
  `deterministic; night is ${NIGHT} frames (${sec(NIGHT)})`);
console.log(`  outcomes: won ${rows.filter(r => r.won).length}/${SEEDS} (${pct(rows.filter(r => r.won).length, SEEDS)})`);

show('1. cause of death', tally(rows.filter(r => !r.won), 'death'));

const winders = rows.filter(r => r.windDecisions > 0);
console.log(`\n  2. WIND SPEND (Pedro's ruling: no wind spend => box-refusal, ` +
  `except a provable endgame cutoff)`);
console.log(`    seeds that wound at all: ${winders.length}/${SEEDS}`);
console.log(`    wind decisions per seeding: ${stats(rows.map(r => r.windDecisions))}`);
console.log(`    total action mix: ${JSON.stringify(
  rows.reduce((m, r) => { for (const [k, v] of Object.entries(r.actions)) m[k] = (m[k] ?? 0) + v; return m; }, {}))}`);

const empties = rows.map(r => r.boxEmptyFrame).filter(Number.isFinite);
console.log(`\n  3. WHEN the box emptied (no winding => one deterministic value)`);
console.log(`    ${empties.length ? `${[...new Set(empties)].map(sec).join(', ')}   (frames: ${stats(empties)})` : 'never emptied'}`);
const charged = rows.filter(r => r.won && r.boxAtEnd > 0).length;
const luckyWins = rows.filter(r => r.won && r.boxAtEnd <= 0).length;
console.log(`    wins with charge left at 6 AM (a real endgame cutoff): ${charged}`);
console.log(`    wins with the box EMPTY at 6 AM (the ladder lost the race): ${luckyWins}`);

const marches = rows.filter(r => !r.won && Number.isFinite(r.boxEmptyFrame))
  .map(r => r.endFrame - r.boxEmptyFrame);
console.log(`\n  4. the AI-0 LADDER: box-empty -> death (mean ${(C.PUPPET_MO_CHANCE(0) * 100).toFixed(0)}%/roll, ` +
  `${C.PUPPET_ESCAPE_STAGES} stages + hops + 1-in-${C.PUPPET_OFFICE_ROLL} office roll)`);
console.log(`    march duration frames: ${stats(marches)}`);
const residual = NIGHT - (empties.length ? empties[0] : 0);
const need = marches.filter(m => m > residual).length;
console.log(`    residual after empty: ${residual} frames (${sec(residual)}); ` +
  `deaths needing a LONGER march than that: ${need}/${marches.length}`);
console.log(`    => the frontier rate is P(ladder slower than ${sec(residual)}): ` +
  `${pct(rows.filter(r => r.won).length, SEEDS)}`);

console.log(`\n  5. ladder progress at the END (wins should sit mid-ladder)`);
show('   puppet escape stage reached', tally(rows, r => `stage ${Math.min(r.puppetStageAtEnd, C.PUPPET_ESCAPE_STAGES)}${r.puppetOut ? ' (OUT)' : ''}${r.puppetAtOpening ? ' +atOpening' : ''}`));
const winRows = rows.filter(r => r.won);
if (winRows.length)
  console.log(`   winning seeds: ${winRows.map(r => `#${r.seed} (stage ${r.puppetStageAtEnd}, hops ${r.puppetHopsAtEnd}${r.puppetOut ? ', OUT' : ''})`).join(', ')}`);

console.log(`\n  6. the BB axis (his final hop needs the monitor UP, g417; ` +
  `CAM 11 needs it too)`);
console.log(`    monitor-up frames per seed: ${stats(rows.map(r => r.monitorUpFrames))}`);
console.log(`    seeds where BB reached the opening: ${rows.filter(r => r.bbOpeningAt !== null).length}/${SEEDS}`);
console.log(`    seeds where BB got INSIDE (flashlight gone): ${rows.filter(r => r.bbInsideAt !== null).length}/${SEEDS}`);
const bbIn = rows.filter(r => r.bbInsideAt !== null).map(r => sec(r.bbInsideAt));
if (bbIn.length) console.log(`    inside at: ${bbIn.slice(0, 8).join(', ')}${bbIn.length > 8 ? ' ...' : ''}`);

console.log(`\n  7. the FOXY axis on this target`);
console.log(`    max D per seed: ${stats(rows.map(r => r.maxD))}`);
console.log(`    seeds Foxy ever left Parts: ${rows.filter(r => r.foxyArrivedAt !== null).length}/${SEEDS}`);
console.log(`    seeds Foxy ever locked on:  ${rows.filter(r => r.foxyLockedAt !== null).length}/${SEEDS}`);
console.log(`    flash decisions per seed: ${stats(rows.map(r => r.flashDecisions))}`);

const verdict = winders.length === 0
  ? 'box-refusal: ZERO wind spend. There is always a box to be wound; this ' +
    'genome refuses it all night, so the rate is P(AI-0 luck ladder outruns ' +
    `${sec(residual)}), not a defence. Viable only as an ENDGAME CUTOFF, and ` +
    'only once remaining box charge provably outlasts the night.'
  : charged > 0
    ? 'endgame-aware: some wins kept charge at 6 AM -- measure the cutoff frame.'
    : 'winds but never banks a cutoff: every win is the ladder losing the race.';

const summary = {
  schema: 'box-anatomy-v1',
  target: TARGET, customNight, variant: VARIANT, rules: genome.rules.length,
  seeds: SEEDS, drainFrames: DRAIN, nightFrames: NIGHT,
  residualAfterEmpty: residual,
  won: rows.filter(r => r.won).length,
  deaths: tally(rows.filter(r => !r.won), 'death'),
  seedsThatWound: winders.length,
  windDecisions: rows.map(r => r.windDecisions),
  actionMix: rows.reduce((m, r) => {
    for (const [k, v] of Object.entries(r.actions)) m[k] = (m[k] ?? 0) + v;
    return m;
  }, {}),
  monitorUpFrames: rows.map(r => r.monitorUpFrames),
  bbOpening: rows.filter(r => r.bbOpeningAt !== null).length,
  bbInside: rows.filter(r => r.bbInsideAt !== null).length,
  foxyArrived: rows.filter(r => r.foxyArrivedAt !== null).length,
  foxyLocked: rows.filter(r => r.foxyLockedAt !== null).length,
  maxD: rows.map(r => r.maxD),
  marchFrames: marches,
  winsWithChargeAtEnd: charged,
  winsWithBoxEmptyAtEnd: luckyWins,
  winSeeds: winRows.map(r => ({ seed: r.seed, stage: r.puppetStageAtEnd,
    hops: r.puppetHopsAtEnd, out: r.puppetOut, boxAtEnd: r.boxAtEnd })),
  verdict,
};
if (process.argv.includes('--json'))
  console.log(JSON.stringify(summary, null, 2));

// Retained evidence, same discipline as campaign.mjs: stamped, canonical, and
// written next to the frontier it interrogates. `--out=PATH` opts in.
const OUT = process.argv.find(a => a.startsWith('--out='))?.split('=')[1];
if (OUT) {
  const { canonicalJson } = await import('@fnaf2-1020/core/contracts');
  const { execFileSync } = await import('node:child_process');
  const git = args => {
    try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
    catch { return 'UNKNOWN'; }
  };
  const stamped = {
    provenance: {
      commit: git(['rev-parse', 'HEAD']),
      // Same rule as campaign.mjs: the artifact's own output path is part of
      // this run, not pre-existing dirt -- otherwise a re-run of a tracked
      // artifact could never stamp clean.
      dirty: git(['diff', 'HEAD', '--name-only']).split('\n')
        .filter(p => p && p !== OUT).length > 0,
      node: process.version,
      producedAt: new Date().toISOString(),
      argv: process.argv.slice(2),
    },
    ...summary,
  };
  writeFileSync(OUT, canonicalJson(stamped) + '\n');
  console.log(`\n  retained: ${OUT}` +
    (stamped.provenance.dirty
      ? `  (WARNING: dirty tree; does not correspond to ` +
        `${stamped.provenance.commit.slice(0, 8)})` : ''));
}

console.log(`\n  VERDICT: ${verdict}`);
console.log(`  (single/two-dial Custom Night, PRIVILEGED surface: an interrogation ` +
  `of one frontier entry, not a Night 7 claim and not a promotion)`);
