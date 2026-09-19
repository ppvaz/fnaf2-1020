// Write down what the model says will kill, and when, BEFORE a run.
//
// A 6 AM attempt measures everything at once and, when it fails, says only
// that something did. A run read against a death prediction says which
// mechanism broke and by how much: on 2026-09-12 Night 6 the model predicted
// Foxy at 60-170 s and the phone delivered Foxy at 26 s, and the 50 s gap was
// a term the model lacked (the mask-off latency swallowing the hall flash).
// That residual is only readable because the prediction existed first.
//
// The record is `death-prediction-v1`: killer shares and death-time quantiles
// over the epoch phases a drawn release can land on, at the 3000-replay
// standard. `--attach` writes it into the winner as a DEATH_TARGETED gate,
// which bundle.mjs accepts in place of PASS -- honestly labelled, carried in
// the manifest, never a route claim.
//
// Usage:
//   node tools/device/death-prediction.mjs --winner W.json --night N
//        [--replays 3000] [--step-ms 50] [--out prediction.json] [--attach]
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { replay, KNOBS0 } from './minus-toys-plan.mjs';
import { DEATH_PREDICTION_SCHEMA, DEATH_TARGETED_STATUS, STRATEGY_REGISTRY } from './bundle.mjs';

const argValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback;
};

const quantile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

/**
 * @param {{strategy: string, knobs: object|string}} winner
 * @param {{night: number, replays?: number, stepMs?: number}} options
 */
export function predictDeaths(winner, { night, replays = 3000, stepMs = 50 }) {
  // A death prediction is the only honest gate for a route that is not
  // zero-RNG, and every community strategy except Minus Toys and Minus 7 is in
  // that class -- Minus 3 scores 2980/3000, Right Vent Camp about 99%. While
  // this generator accepted minus-toys alone, none of them could be gated at
  // all: bundle.mjs takes PASS or DEATH_TARGETED, a 2980/3000 route is not
  // PASS, and the prediction it would need could not be produced. The bundle
  // validator was always strategy-independent; only this was not.
  const strategy = winner.strategy === 'minus7' || winner.strategy === 'minus-7'
    ? 'minus7' : winner.strategy;
  const entry = STRATEGY_REGISTRY[strategy];
  if (!entry) throw new Error(`no device emitter is registered for strategy ${JSON.stringify(winner.strategy)}`);
  if (!Number.isInteger(night) || night < 1 || night > 7) throw new Error('night must be 1..7');
  if (!Number.isInteger(replays) || replays < 3000) throw new Error('death prediction needs at least 3000 replays');
  const times = new Map();
  let wins = 0;

  // minus3 and minus7 replay at epoch 0 only. Sweeping `phasesMs` for them
  // would score the same schedule twenty times and report it as a span of
  // phases -- a tautology dressed as coverage, which is what bundle.mjs's own
  // registry note refuses when it will not certify "a phase no census has
  // seen". A phase-blind strategy therefore records the single phase it can
  // actually see and says so, and the validator requires the marker instead of
  // a fabricated span.
  const phaseAware = entry.phaseAware === true;
  const phasesMs = [];
  if (phaseAware) for (let ms = 0; ms < 1000; ms += stepMs) phasesMs.push(ms);
  else phasesMs.push(0);

  if (phaseAware) {
    const knobs = typeof winner.knobs === 'string' ? KNOBS0 : winner.knobs;
    // Seeds and phases are interleaved so every phase sees the same seed cohort.
    for (let i = 0; i < replays; i += 1) {
      const seed = 1 + Math.floor(i / phasesMs.length);
      const epochMs = phasesMs[i % phasesMs.length];
      const { sim } = replay({ night, seed, epochMs, knobs });
      if (sim.won) { wins += 1; continue; }
      const killer = sim.death?.reason ?? 'unknown';
      if (!times.has(killer)) times.set(killer, []);
      times.get(killer).push(sim.death?.t ?? NaN);
    }
  } else {
    // The emitted plan's own replay, so the prediction describes the bytes the
    // phone will execute rather than a parallel model of them.
    const emitted = entry.emit(winner, night);
    for (let seed = 1; seed <= replays; seed += 1) {
      const { sim } = emitted.replay(seed);
      if (sim.won) { wins += 1; continue; }
      const killer = sim.death?.reason ?? 'unknown';
      if (!times.has(killer)) times.set(killer, []);
      times.get(killer).push(sim.death?.t ?? NaN);
    }
  }
  const killers = [...times.entries()]
    .map(([killer, ts]) => {
      const sorted = ts.filter(Number.isFinite).sort((a, b) => a - b);
      return { killer, count: ts.length, share: ts.length / replays,
        tSeconds: { min: sorted[0], p10: quantile(sorted, 0.1), p50: quantile(sorted, 0.5),
          p90: quantile(sorted, 0.9), max: sorted.at(-1) } };
    })
    .sort((a, b) => b.count - a.count);
  return { schema: DEATH_PREDICTION_SCHEMA, night, replays, phasesMs, wins, winRate: wins / replays, killers,
    strategy, ...(phaseAware ? {} : { phaseBlind: true }),
    generatedBy: 'tools/device/death-prediction.mjs', generatedAt: new Date().toISOString() };
}

export function describe(prediction) {
  const lines = [`death prediction night ${prediction.night}: ${prediction.replays} replays over ${prediction.phasesMs.length} phases, ` +
    `wins ${prediction.wins} (${(100 * prediction.winRate).toFixed(1)}%)`];
  for (const k of prediction.killers)
    lines.push(`  ${k.killer}: ${(100 * k.share).toFixed(1)}%  t p10 ${k.tSeconds.p10.toFixed(1)} p50 ${k.tSeconds.p50.toFixed(1)} ` +
      `p90 ${k.tSeconds.p90.toFixed(1)} s (${k.tSeconds.min.toFixed(1)}-${k.tSeconds.max.toFixed(1)})`);
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const winnerPath = argValue('--winner');
  const night = Number(argValue('--night'));
  if (!winnerPath || !Number.isInteger(night)) {
    console.error('usage: death-prediction.mjs --winner W.json --night N [--replays 3000] [--step-ms 50] [--out FILE] [--attach]');
    process.exit(64);
  }
  const winner = JSON.parse(readFileSync(winnerPath, 'utf8'));
  const prediction = predictDeaths(winner, { night,
    replays: Number(argValue('--replays', 3000)), stepMs: Number(argValue('--step-ms', 50)) });
  console.log(describe(prediction));
  const out = argValue('--out');
  if (out) writeFileSync(out, `${JSON.stringify(prediction, null, 2)}\n`);
  if (process.argv.includes('--attach')) {
    // A prediction with no deaths is a PASS candidate, not a death target.
    if (prediction.wins === prediction.replays) throw new Error('the model predicts no death: gate this winner as PASS instead');
    const gate = { status: DEATH_TARGETED_STATUS, claimLevel: 'MODEL_ONLY', prediction,
      evidence: `death-targeting: the model predicts ${prediction.killers[0].killer} in ${(100 * prediction.killers[0].share).toFixed(0)}% ` +
        `of phases; this bundle exists to test that prediction on the phone, not to win` };
    writeFileSync(winnerPath, `${JSON.stringify({ ...winner, gate }, null, 2)}\n`);
    console.log(`attached ${DEATH_TARGETED_STATUS} gate to ${winnerPath}`);
  }
}
