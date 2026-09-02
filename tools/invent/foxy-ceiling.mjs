// Plan 05 package 8: is perfect Foxy handling reachable, and what blocks it?
//
//   node tools/invent/foxy-ceiling.mjs [--seeds=1200]
//
// The sourced arithmetic says yes. Foxy's roll is `21 + Random(0..4) - D <= AI`
// (g337). At the dial-20 cap of AI 17 it fires only when D >= 4 + r, so if D is
// held BELOW 4 at every five-second check Foxy can never fire at all. D rises
// +1/s and a hall flash resets it to 0 while he is in the hall (g745).
//
// Two candidate explanations for the survivor's 71/1200 Foxy deaths, tested
// here rather than argued:
//   (a) CADENCE. The policy flashes on a 300-frame (5 s) cycle; the mechanic
//       demands faster than 4 s.
//   (b) THE PARTS GUARD. Both Foxy rules carry `foxyLoc != 'parts'`, so the
//       policy does not flash while he is in Parts/Service. D climbs unchecked
//       there, and he arrives in the hall already past the threshold. Flashing
//       into Parts drains D only 1 per 500 ms (g864), which is why `decide()`
//       declines to -- but declining is what leaves the door open.
//
// Reports the whole grid. A cell that reaches 100% is a ceiling result on a
// single-dial PRIVILEGED target, not a route and not a Night 7 claim.
import { readFileSync } from 'node:fs';
import * as C from '@fnaf2-1020/core/mechanics';
import { ADMISSION_SEEDS, evaluate, rollout } from './search.mjs';
import { validateGenome } from './policy-lang.mjs';
import { singleThreat } from './targets.mjs';

const argOf = (n, d) => {
  const f = process.argv.find(a => a.startsWith(`--${n}=`));
  return f ? f.split('=')[1] : d;
};
const SEEDS = Number(argOf('seeds', ADMISSION_SEEDS));
const FRONTIER = argOf('frontier', 'docs/evidence/invent/frontier-foxy.json');

/** Drop every `not(foxyLoc == 'parts')` conjunct, so the policy may flash there. */
function dropPartsGuard(node) {
  if (!node || typeof node !== 'object') return node;
  const isGuard = n => n?.t === 'not' && n.x?.t === 'eq' &&
    n.x.name === 'foxyLoc' && n.x.v === 'parts';
  const copy = Array.isArray(node) ? [...node] : { ...node };
  for (const k of ['a', 'b', 'x']) if (copy[k]) copy[k] = dropPartsGuard(copy[k]);
  if (copy.xs) {
    const kept = copy.xs.filter(child => !isGuard(child)).map(dropPartsGuard);
    if (!kept.length) return { t: 'const', v: 1 };
    if (kept.length === 1) return kept[0];
    copy.xs = kept;
  }
  return copy;
}

/**
 * Set the safety margin directly. `safeD` is `20 - peakAi`, the D threshold the
 * policy treats as unsafe; lowering it makes the policy flash EARLIER, which is
 * the real lever. Retiming the 300 constant looked like a cadence knob but is
 * not: 300 frames is the engine's own five-second check period (g337), so
 * changing it only distorts the policy's model of when the next check lands.
 */
function setMargin(node, value) {
  if (!node || typeof node !== 'object') return node;
  if (node.t === 'param' && node.name === 'safeD') return { t: 'const', v: value };
  const copy = Array.isArray(node) ? [...node] : { ...node };
  for (const k of ['a', 'b', 'x']) if (copy[k]) copy[k] = setMargin(copy[k], value);
  if (copy.xs) copy.xs = copy.xs.map(child => setMargin(child, value));
  return copy;
}

/** Retime the check cadence: every literal 300 belongs to the toCheck term. */
function retime(node, frames) {
  if (!node || typeof node !== 'object') return node;
  if (node.t === 'const' && node.v === 300) return { t: 'const', v: frames };
  const copy = Array.isArray(node) ? [...node] : { ...node };
  for (const k of ['a', 'b', 'x']) if (copy[k]) copy[k] = retime(copy[k], frames);
  if (copy.xs) copy.xs = copy.xs.map(child => retime(child, frames));
  return copy;
}

const front = JSON.parse(readFileSync(FRONTIER, 'utf8')).front;
const entry = front.reduce((b, c) => (c.rate > (b?.rate ?? -1) ? c : b), null);
const essential = new Set(entry.ablation.essential);
const base = validateGenome({ ...entry.genome,
  rules: entry.genome.rules.filter((_, i) => essential.has(i)) });

const customNight = singleThreat('foxy');
const score = g => evaluate(s => rollout(g, { night: 7, seed: s, customNight }), { seeds: SEEDS });
const variant = (guard, frames) => validateGenome({ ...base,
  rules: base.rules.map(r => {
    let when = guard ? r.when : dropPartsGuard(r.when);
    when = retime(when, frames);
    return { ...r, when };
  }) });

const marginVariant = value => validateGenome({ ...base,
  rules: base.rules.map(r => ({ ...r, when: setMargin(r.when, value) })) });

const ai = C.peakAi(7, 'foxy', customNight);
console.log(`foxy ceiling probe, ${SEEDS} seeds, AI ${ai}`);
console.log(`  roll fires when D >= ${21 - ai} + r, so D < ${21 - ai} at every ` +
  `check is immortal; D rises +1/s\n`);
// The margin sweep is the honest lever; the cadence grid below is retained
// because its shape is what showed the retiming was NOT a cadence knob.
const shipped = 20 - ai;
console.log(`  safety margin sweep (shipped safeD = ${shipped}; lower = flash earlier)`);
console.log(`  ${'safeD'.padEnd(12)} ${'survival'.padStart(8)}  deaths`);
for (const margin of [shipped, shipped - 1, shipped - 2, shipped - 3, 0, -1]) {
  const r = score(marginVariant(margin));
  console.log(`  ${String(margin).padEnd(12)} ${(r.rate * 100).toFixed(1).padStart(7)}%  ` +
    `${JSON.stringify(r.deaths)}`);
}
console.log('');
console.log(`  ${'cadence'.padEnd(12)} ${'parts guard'.padEnd(12)} ${'survival'.padStart(8)}  deaths`);
for (const frames of [300, 240, 180, 120]) {
  for (const guard of [true, false]) {
    const r = score(variant(guard, frames));
    console.log(`  ${(frames + 'f / ' + (frames / C.FPS).toFixed(1) + 's').padEnd(12)} ` +
      `${(guard ? 'kept' : 'dropped').padEnd(12)} ` +
      `${(r.rate * 100).toFixed(1).padStart(7)}%  ${JSON.stringify(r.deaths)}`);
  }
}
console.log(`\n  (single-dial Custom Night on the PRIVILEGED surface: a ceiling ` +
  `result, not a route, and not a claim about Night 7)`);
