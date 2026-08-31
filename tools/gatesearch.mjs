// Gate-aware strategy search (plan 06).
//
// The sourced route graph exposes a strategy family that a fixed camera-cover
// permutation cannot express: keep the monitor down across movement checks,
// make short trips for the music box, and optionally refresh one camera anchor
// on those trips. Music-box trips use visible box thresholds with hysteresis,
// rather than a fixed metronome, so recovery time is spent only when needed.
//
// The controller is deliberately a short, human-readable policy, not a learned
// agent. It reacts to visible office threats, Balloon Boy and the box gauge.
// Results remain model claims: the Android marker-122/123 office state machine,
// Toy Bonnie and several vent details are only partially decoded.
//
//   node tools/gatesearch.mjs [--quick]
import { pathToFileURL } from 'node:url';
import * as C from '@fnaf2-1020/core/mechanics';
import { pool, closePool } from './pool.mjs';

// The controller itself lives in gatebot.mjs so the pool can import it as a
// task module. Every night goes through the pool; `--serial` pins it to one
// thread and must produce identical output.
const GATEBOT = new URL('./gatebot.mjs', import.meta.url).href;
const sweep = (optsList) => pool().map(GATEBOT, 'summarizePolicy', optsList);

const F = C.FPS;
const QUICK = process.argv.includes('--quick');
const SEED = i => (i * 2246822519) >>> 0;

async function sample(policy, n, extras = {}) {
  const nights = await sweep(Array.from({ length: n },
    (_, i) => ({ ...policy, ...extras, seed: SEED(i) })));
  let survived = 0, minBox = 1, minPower = C.POWER_FRAMES, inputs = 0;
  const deaths = {};
  for (const r of nights) {
    minBox = Math.min(minBox, r.minBox);
    minPower = Math.min(minPower, r.power);
    inputs += r.inputs;
    if (r.won) survived++;
    else deaths[r.reason] = (deaths[r.reason] || 0) + 1;
  }
  return { survived, n, minBox, minPower, inputs: Math.round(inputs / n), deaths };
}

const pct = r => `${Math.round(r.survived / r.n * 100)}%`;
const structures = [
  { name: 'monitor denial', targets: [] },
  { name: 'Minus Right / CAM 06', targets: [6] },
  { name: 'CAM 07-only', targets: [7] },
  { name: 'Minus Two / CAM 03', targets: [3] },
  { name: 'CAM 06 + 07 hybrid', targets: [6, 7] },
];
const phaseSets = [
  { label: 'none', cams: [] }, { label: '03', cams: [3] },
  { label: '06', cams: [6] }, { label: '07', cams: [7] },
  { label: '67', cams: [6, 7] },
];
const thresholds = [[0.35, 0.65], [0.50, 0.80], [0.65, 0.90], [0.80, 0.95],
  [0.90, 1.00], [0.99, 1.00]];

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const searchN = QUICK ? 16 : 40;
  const validN = QUICK ? 40 : 150;
  console.log('gate-aware search: reactive winding + documented hybrid candidates (night 7)');
  console.log('caveat: Android is canonical; unresolved source/model gaps still bound these claims\n');
  console.log('controller: reacts only to represented visible blackouts/office threats\n');

  for (const structure of structures) {
    let best = null;
    for (const [windLow, windHigh] of thresholds) {
      for (const lightPulse of [false, true]) {
        const policy = { ...structure, windLow, windHigh, lightPulse };
        const clean = await sample(policy, searchN);
        const score = clean.survived * 1e6 + clean.minBox * 1e3 - clean.inputs;
        if (!best || score > best.score) best = { policy, clean, score };
      }
    }
    const clean = await sample(best.policy, validN);
    const pinned = await sample(best.policy, validN, { worst: true });
    const j100 = await sample(best.policy, validN, { jitter: Math.round(0.100 * F) });
    const j200 = await sample(best.policy, validN, { jitter: Math.round(0.200 * F) });
    const p = best.policy;
    console.log(`  ${structure.name.padEnd(24)} low/high ${p.windLow.toFixed(2)}/${p.windHigh.toFixed(2)}${p.lightPulse ? ' +light' : '       '}`);
    console.log(`    clean ${pct(clean).padStart(4)}  pinned ${pct(pinned).padStart(4)}  j100 ${pct(j100).padStart(4)}  j200 ${pct(j200).padStart(4)}  box ${(clean.minBox * 100).toFixed(0)}%  pw ${clean.minPower}  inputs ${clean.inputs}`);
    const top = Object.entries(clean.deaths).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (top.length) console.log(`    deaths: ${top.map(([k, v]) => `${v}x ${k}`).join(', ')}`);
  }

  // Three clock-readable phases: 0-2 AM, 2-4 AM and 4-6 AM. This is the
  // bounded version of plan 06's phase-based branch; hidden route state is not
  // used, so any survivor can be played from the night clock alone.
  const phaseN = QUICK ? 10 : 24;
  let phaseBest = null;
  for (const a of phaseSets) for (const b of phaseSets) for (const c of phaseSets) {
    const policy = { phases: [a.cams, b.cams, c.cams], phaseSplit: 140 * F,
                     windLow: 0.65, windHigh: 0.90, lightPulse: false };
    const clean = await sample(policy, phaseN);
    const j200 = await sample(policy, phaseN, { jitter: Math.round(0.200 * F) });
    const score = [clean.survived, j200.survived, Math.round(clean.minBox * 1000), -clean.inputs];
    if (!phaseBest || score.some((v, i) => v !== phaseBest.score[i] &&
        v > phaseBest.score[i] && score.slice(0, i).every((x, j) => x === phaseBest.score[j]))) {
      phaseBest = { labels: [a.label, b.label, c.label], policy, score };
    }
  }
  const phaseClean = await sample(phaseBest.policy, validN);
  const phasePinned = await sample(phaseBest.policy, validN, { worst: true });
  const phaseJ100 = await sample(phaseBest.policy, validN, { jitter: Math.round(0.100 * F) });
  const phaseJ200 = await sample(phaseBest.policy, validN, { jitter: Math.round(0.200 * F) });
  console.log(`\n  best clock-phased set      ${phaseBest.labels.join(' -> ')}`);
  console.log(`    clean ${pct(phaseClean).padStart(4)}  pinned ${pct(phasePinned).padStart(4)}  j100 ${pct(phaseJ100).padStart(4)}  j200 ${pct(phaseJ200).padStart(4)}  box ${(phaseClean.minBox * 100).toFixed(0)}%  pw ${phaseClean.minPower}  inputs ${phaseClean.inputs}`);
  console.log('\nMinus 7 regression: node tools/bbtest.mjs 200');
  await closePool();
}
