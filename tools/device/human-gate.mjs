// The model gate: the pilot may not deliver inhumanly timed inputs.
//
// Decision 2026-08-25 (block, no override), semantics reworked the same day:
// a static press-gap floor was the wrong model of "inhuman" -- the canonical
// Minus 7 cycle lands a 70 ms chord while the machine route's comfortable
// 120 ms gaps need a one-frame phase island no hand can hit. What separates
// human from machine is precision, not speed. So the gate stops asking "how
// wide are the gaps?" and asks the engine: does this plan still clear the
// night when a modeled human executes it?
//
// Mechanically it is the test-runner-plan.mjs replay with human error
// injected: every scheduled press row is shifted by an independent draw in
// +/-HUMAN_SLACK_MS before recipe.replay() runs the plan, over GATE_RUNS
// seeds, and the plan must clear GATE_MIN_SURVIVAL of them. Compound actuator
// rows (`sweep`, `maskraise`) shift as units, preserving their measured
// internal report spacing.
//
// The provisional numbers, until the trainer trace census supersedes them:
// - HUMAN_SLACK_MS = 60: the measured floor of the human-slack bracket
//   (2026-08-25, plans/04): reactive Minus 7 holds 200/200 at +/-60 ms iid,
//   89/200 at +/-100, 0/200 at +/-150. A plan that clears under +/-60 is at
//   least as slack-tolerant as the human-proven strategy. The census must be
//   fit as CORRELATED per-step bands (iid is the wrong shape -- humans clear
//   at per-step error the iid model calls fatal), which will replace this.
// - GATE_MIN_SURVIVAL = 0.40: the replay contract test-runner-plan.mjs
//   already holds, for the same reason (the plan family eats a priced Golden
//   Freddy loss rate rather than model his flick). The bar is unchanged; what
//   changed on 2026-08-26 is that the estimate compared against it is no longer
//   a 100-seed block. See GATE_RUNS.
//
// Known v1 simplifications, deliberate and documented: a sweep is shifted as
// one unit (its internal spacing stays the plan's), a hold's release shares
// its press's draw (plans/04: independent draws price nothing), and the
// read->branch reaction path keeps the machine's classifier latency -- this
// gate prices scheduled presses, not reactivity. The live HUMAN_FLOOR_MS
// check inside trial.sh remains the backstop for schedules that never
// pass through a plan file.
//
//   node tools/device/human-gate.mjs plan.txt    # exit 44 when the gate refuses

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { replay } from './recipe.mjs';
import { Rng } from '../../src/rng.js';

export const HUMAN_SLACK_MS = 60;
// Corrected 2026-08-26. This was 100, and 100 is not a measurement of a rate
// near the contract -- it is a measurement of a seed block.
//
// At p = 0.37 the binomial standard error over 100 draws is 4.8 points, so a
// 2-sigma interval spans nearly 20 points. The pre-reset Night 6 plan's twelve
// consecutive 100-seed blocks bear that out exactly:
//
//     46 36 29 27 53 39 23 30 30 47 44 45      pooled 449/1200 = 37.4%
//
// Seeds 1..100 gave 46 and the gate reported a pass. Five of twelve blocks
// clear 40; the plan does not. The control that this is sampling noise and not
// a biased block: the sourced Fusion LCG's 4x16384 cycle decomposition splits
// seeds 1..100 exactly 25/25/25/25.
//
// So the figure this project quoted on 2026-08-25 -- "the shipped plan replays
// 46/100 under human slack" -- was a lucky block, and the gate CLAUDE.md called
// absolute had grounded a route that did not meet its own bar. The repaired
// route is measured on these same 1200 seeds; this sample-size rationale stays.
// 1200 runs costs 4.7 s and brings the 2-sigma interval to about 2.8 points,
// which is enough to separate 37.4 from 40.
export const GATE_RUNS = 1200;
export const GATE_MIN_SURVIVAL = 0.40;
const JITTER_SALT = 0x68756d61; // "huma"; its own stream, never the sim's rolls

// The emitted plan text, back into replay()'s {name: [lines]} shape, plus the
// night the plan names. A plan that names no night is not gated against a
// guess: modelGate refuses it. See plans/13 -- pricing a Night 3 plan against
// Night 6's AI table is a silent substitution, not a conservative default.
export function parsePlanText(text) {
  const plan = {};
  let night = null;
  let cur = null;
  // Absent means zero, so a plan emitted before this header existed still
  // prices. A plan that names one must name a valid one.
  let idleUntilMs = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#night')) {
      if (cur) throw new Error('#night must precede every #cycle');
      night = +line.split(/\s+/)[1];
      if (!Number.isInteger(night) || night < 1 || night > 7)
        throw new Error(`plan names night "${line.split(/\s+/)[1]}"`);
      continue;
    }
    if (line.startsWith('#idle-until')) {
      if (cur) throw new Error('#idle-until must precede every #cycle');
      idleUntilMs = +line.split(/\s+/)[1];
      if (!Number.isInteger(idleUntilMs) || idleUntilMs < 0)
        throw new Error(`plan names idle window "${line.split(/\s+/)[1]}"`);
      continue;
    }
    if (line.startsWith('#cycle')) {
      cur = line.split(/\s+/)[1];
      plan[cur] = [];
      continue;
    }
    if (!cur) throw new Error(`plan row before any #cycle header: "${line}"`);
    if (!/^\d+ (tap|hold|sweep|read|hall|hallraise|maskraise)\b/.test(line))
      throw new Error(`instruction this gate cannot price: "${line}"`);
    plan[cur].push(line);
  }
  if (!Object.keys(plan).length) throw new Error('empty plan');
  return { night, plan, idleUntilMs };
}

// One modeled execution: every row's offset shifted by an iid draw, clamped
// at zero. Row order is preserved -- replay()'s queue sorts by frame, so a
// draw that swaps two tight presses swaps them there, exactly as a human's
// hands would have.
export function jitterPlan(plan, seed, slackMs = HUMAN_SLACK_MS) {
  const rng = new Rng((((seed >>> 0) ^ JITTER_SALT) >>> 0));
  const out = {};
  for (const [name, lines] of Object.entries(plan)) {
    out[name] = lines.map(line => {
      const sp = line.indexOf(' ');
      const offs = Math.max(0, +line.slice(0, sp) + rng.int(-slackMs, slackMs));
      return `${offs}${line.slice(sp)}`;
    });
  }
  return out;
}

export function modelGate(planText, {
  runs = GATE_RUNS, slackMs = HUMAN_SLACK_MS, minSurvival = GATE_MIN_SURVIVAL,
  night, replayFn = replay,
} = {}) {
  const { night: named, plan, idleUntilMs } = parsePlanText(planText);
  night = night ?? named;
  if (night === undefined || night === null)
    throw new Error('this plan does not name its night, and the gate will not guess one');
  let survived = 0;
  const deaths = new Map();
  for (let seed = 1; seed <= runs; seed++) {
    const { sim } = replayFn(jitterPlan(plan, seed, slackMs),
                             { night, seed, idleUntilMs });
    if (sim.won) survived++;
    else if (sim.death) {
      const k = `${sim.death.reason}: ${sim.death.detail}`;
      deaths.set(k, (deaths.get(k) || 0) + 1);
    }
  }
  return {
    survived, runs, slackMs, minSurvival, night,
    ok: survived >= runs * minSurvival,
    deaths: [...deaths.entries()].sort((a, b) => b[1] - a[1]),
  };
}

function main() {
  const file = process.argv[2];
  if (!file) { console.error('usage: human-gate.mjs plan.txt'); process.exit(2); }
  let r;
  try { r = modelGate(readFileSync(file, 'utf8')); }
  catch (e) { console.error(`model gate: ${e.message}`); process.exit(44); }
  const need = Math.ceil(r.runs * r.minSurvival);
  if (!r.ok) {
    console.error(`model gate: ${r.survived}/${r.runs} night-${r.night} runs under +/-${r.slackMs} ms human slack (need ${need}) -- refusing to run this plan`);
    for (const [k, v] of r.deaths.slice(0, 4)) console.error(`  ${v}x  ${k}`);
    console.error('the pilot may not deliver inhumanly timed inputs (2026-08-25, no override)');
    process.exit(44);
  }
  console.log(`model gate: ${r.survived}/${r.runs} night-${r.night} runs under +/-${r.slackMs} ms human slack (need ${need})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
