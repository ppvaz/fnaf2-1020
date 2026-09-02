// Plan 05 package 8: what, exactly, kills the survivor in its residual?
//
//   node tools/invent/death-anatomy.mjs [--seeds=600] [--target=foxy]
//
// A survival rate is one number and it hides its own failure mode. This runs a
// frontier survivor's minimized genome and, for every death, records the state
// the engine was actually in -- so the residual is described by the mechanic
// that produced it rather than by a percentage.
//
// The sourced hypotheses it is testing, all from the Withered Foxy section:
//   g337  the roll is `21 + Random(0..4) - D <= AI`; at AI 17 it needs D >= 4+r
//   g824  D rises +1/s continuously, so the clock always works against you
//   g745  a hall flash zeroes D only at hall stage 1, with the light held
//   g489  a hall flash inside the mask-off lockout resets NOTHING
//   g573  at marker 123 a monitor-down hall flash kills instantly
//   g846  after a retreat, `hall movement` blocks re-engagement for 300 frames
import { readFileSync } from 'node:fs';
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
const TARGET = argOf('target', 'foxy');
const SEEDS = Number(argOf('seeds', 600));
const FRONTIER = argOf('frontier',
  `docs/evidence/invent/frontier-${TARGET}.json`);

let front;
try { front = JSON.parse(readFileSync(FRONTIER, 'utf8')).front; }
catch { front = JSON.parse(readFileSync(`captures/invent/frontier-${TARGET}.json`, 'utf8')).front; }
const entry = front.reduce((b, c) => (c.rate > (b?.rate ?? -1) ? c : b), null);
const essential = new Set(entry.ablation.essential);
const genome = validateGenome({ ...entry.genome,
  rules: entry.genome.rules.filter((_, i) => essential.has(i)) });

const customNight = threatSet(TARGET);
const AI = C.peakAi(7, 'foxy', customNight);
const THRESHOLD = 21 - AI;   // D >= THRESHOLD + r fires the roll

function runOne(seed) {
  const sim = new Sim({ night: 7, seed, customNight });
  const constants = constantsFor(7, customNight);
  let registers = new Array(REGISTER_COUNT).fill(0);
  let guard = 0, lastFlash = -Infinity;
  // Sample the state each decision so the pre-death context is real, not
  // reconstructed after the fact.
  let prev = null;
  while (sim.alive && !sim.won && guard++ < 4000) {
    const before = {
      frame: sim.frame, D: sim.foxy.D, loc: sim.foxy.loc,
      gotYou: sim.foxy.gotYou, maskAnim: sim.maskAnim, maskOn: sim.maskOn,
      monitor: sim.monitor, blackout: sim.blackout.active,
      sinceFlash: sim.frame - lastFlash,
      power: sim.power, exposure: sim.foxy.exposure,
      lightHeld: sim.lightHeld, lightLogical: sim.lightLogical,
    };
    const step = interpret(genome, view(sim), { registers, constants });
    registers = step.registers;
    if (step.action === 'HALL_FLASH' || step.action === 'HALL_HOLD') lastFlash = sim.frame;
    run(sim, ACTIONS[step.action](view(sim)));
    prev = { ...before, action: step.action };
  }
  return { sim, prev };
}

const deaths = [];
let won = 0;
for (let seed = 0; seed < SEEDS; seed++) {
  const { sim, prev } = runOne(seed);
  if (sim.won) { won++; continue; }
  const lock = sim.mistakes.filter(m => m.code === 'foxy-lock').pop();
  const lockD = lock ? Number(/D = (\d+)/.exec(lock.detail)?.[1] ?? NaN) : NaN;
  deaths.push({
    seed, reason: sim.death?.reason ?? 'none', frame: sim.death?.frame ?? sim.frame,
    hour: Math.floor((sim.death?.frame ?? sim.frame) / C.HOUR_FRAMES),
    lockD, prev,
  });
}

const pct = n => `${((n / SEEDS) * 100).toFixed(1)}%`;
const bar = (n, of) => '#'.repeat(Math.round((n / Math.max(of, 1)) * 40));
const tally = (rows, key) => rows.reduce((m, r) => {
  const k = typeof key === 'function' ? key(r) : r[key];
  m[k] = (m[k] ?? 0) + 1; return m;
}, {});
const show = (title, counts) => {
  console.log(`\n  ${title}`);
  const max = Math.max(...Object.values(counts), 1);
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1]))
    console.log(`    ${String(k).padEnd(22)} ${String(v).padStart(4)}  ${bar(v, max)}`);
};

console.log(`death anatomy: ${TARGET}, ${SEEDS} seeds, AI ${AI}`);
console.log(`  survived ${won}/${SEEDS} (${pct(won)}), died ${deaths.length} (${pct(deaths.length)})`);
console.log(`  the roll fires at D >= ${THRESHOLD} + r, r in 0..4 (g337)`);

show('1. cause of death', tally(deaths, 'reason'));
show('2. WHEN it happens (game hour of death)', tally(deaths, d => `${d.hour} AM`.replace('0 AM', '12 AM')));
show('3. D at the fatal roll (g824 raises it +1/s)',
  tally(deaths.filter(d => Number.isFinite(d.lockD)), d => `D=${d.lockD}`));
show('4. where Foxy was on the last decision', tally(deaths, d => d.prev?.loc ?? 'UNKNOWN'));
show('5. what the policy was doing on the last decision', tally(deaths, d => d.prev?.action ?? 'UNKNOWN'));
show('6. was the D reset AVAILABLE at all?', tally(deaths, d => {
  const p = d.prev ?? {};
  if (p.maskAnim > 0) return 'no: mask-off lockout (g489)';
  if (p.gotYou) return 'no: already GOT-YOU at 123';
  if (p.blackout) return 'no: blackout (D paused, g872)';
  if (p.loc === 'parts') return 'weak: Parts drain only (g864)';
  return 'yes: hall stage 1, flash would zero it (g745)';
}));
show('7. POWER remaining at death (a dead light cannot fire g745)', tally(deaths, d => {
  const p = d.prev?.power;
  if (!Number.isFinite(p)) return 'UNKNOWN';
  return p <= 0 ? 'ZERO - light is dead' : p < 600 ? '< 10s of light left'
    : p < 1800 ? '10-30s left' : 'plenty';
}));
show('8. Foxy exposure banked (retreat needs > 100*night)', tally(deaths, d => {
  const e = d.prev?.exposure;
  if (!Number.isFinite(e)) return 'UNKNOWN';
  const need = 100 * 7;
  return e === 0 ? 'none' : e < need / 2 ? `< half (${need})` : `>= half (${need})`;
}));
show('9. time since the policy last flashed', tally(deaths, d => {
  const s = d.prev?.sinceFlash;
  if (!Number.isFinite(s)) return 'never flashed';
  const sec = s / C.FPS;
  return sec < 2 ? '< 2s' : sec < 4 ? '2-4s' : sec < 6 ? '4-6s' : '>= 6s';
}));

const lockDs = deaths.map(d => d.lockD).filter(Number.isFinite);
if (lockDs.length) {
  const over = lockDs.filter(d => d > THRESHOLD + 4).length;
  console.log(`\n  10. how far past the threshold`);
  console.log(`     minimum D seen at a lock: ${Math.min(...lockDs)} (floor is ${THRESHOLD})`);
  console.log(`     deaths at the WORST-LUCK roll only (D == ${THRESHOLD}, r == 0): ` +
    `${lockDs.filter(d => d === THRESHOLD).length}/${lockDs.length}`);
  console.log(`     deaths where D had run well past the band (> ${THRESHOLD + 4}): ` +
    `${over}/${lockDs.length} -- these are lost control, not bad luck`);
}
console.log(`\n  (single-dial Custom Night, PRIVILEGED surface: describes this policy's ` +
  `residual, not Night 7)`);
