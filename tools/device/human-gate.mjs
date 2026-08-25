// The pilot must not deliver inhumanly timed inputs to the device.
//
// Decision 2026-08-25: absolute, no override. The device exists to validate
// strategies a human can transfer to, and a run cleared with 120 ms camera
// sweeps proves nothing about human play -- so a plan scheduling press gaps
// below the human floor is refused before the game is even launched. This
// deliberately grounds the shipped Night 6 left-opening route (120 ms sweep
// slots) until a human-executable route exists; test-human-gate.mjs asserts
// that refusal so the grounding is a recorded fact, not an accident.
//
// The floor itself is provisional. 350 ms press-to-press is [INFERRED] from
// the trainer's duel pass gate: 700 ms for the two-gap un-mask -> CAM 10 ->
// CAM 04 motion (src/curriculum.js, duelTarget). Recorded tension: the
// trainer's own rehearsed sweep schedules 200 ms gaps and humans pass those
// lessons, so this floor also calls classic Minus 7's sweep inhuman. The
// trainer trace census (tools/tracereport.mjs, inter-press spacing) supersedes
// this number as soon as it has runs; argue with the census, not here.
//
// The same floor lives as HUMAN_FLOOR_MS in trial-minus7.sh, where press_at/
// hold_at enforce it live on-device for the schedules that never pass through
// a plan file. test-human-gate.mjs pins the two copies equal.
//
//   node tools/device/human-gate.mjs plan.txt    # exit 44 on violation

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const HUMAN_GAP_FLOOR_MS = 350;

// One press onset per finger action the plan schedules. `read` observes and
// is not an input; a sweep is one onset per camera slot (the light pulsed
// inside a slot shares the slot's chord); `hallraise` is the verified
// two-contact chord and counts once. A verb this parser does not know is a
// press it cannot price, and a plan it must not pass -- same rule as the
// runner's plan_control_xy.
export function pressOnsets(planText) {
  const cycles = [];
  let cur = null;
  for (const raw of planText.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#cycle')) {
      const [, name, period] = line.split(/\s+/);
      cur = { name, periodMs: Number(period), onsets: [] };
      cycles.push(cur);
      continue;
    }
    if (!cur) throw new Error(`plan row before any #cycle header: "${line}"`);
    const parts = line.split(/\s+/);
    const t = Number(parts[0]);
    const verb = parts[1];
    if (!Number.isFinite(t)) throw new Error(`unreadable offset in "${line}"`);
    switch (verb) {
      case 'tap':
      case 'hold':
        cur.onsets.push({ t, what: `${verb} ${parts[2]}` });
        break;
      case 'hall':
      case 'hallraise':
        cur.onsets.push({ t, what: verb });
        break;
      case 'sweep': {
        const spacing = Number(parts[2]);
        const cams = (parts[4] || '').split(',').filter(Boolean);
        if (!Number.isFinite(spacing) || !cams.length)
          throw new Error(`unreadable sweep in "${line}"`);
        cams.forEach((cam, i) =>
          cur.onsets.push({ t: t + i * spacing, what: `sweep cam${cam}` }));
        break;
      }
      case 'read':
        break;
      default:
        throw new Error(`verb this gate cannot price: "${line}"`);
    }
  }
  return cycles;
}

// Successive onsets within a cycle, plus the cycle's own wraparound (last
// press to the first press of its next repetition). Cross-cycle transitions
// between different cycle types are not modelled here; the live press_at gate
// in the runner covers whatever sequence actually executes.
export function audit(planText, floorMs = HUMAN_GAP_FLOOR_MS) {
  const violations = [];
  for (const c of pressOnsets(planText)) {
    const on = [...c.onsets].sort((a, b) => a.t - b.t);
    for (let i = 1; i < on.length; i++) {
      const gap = on[i].t - on[i - 1].t;
      if (gap < floorMs) violations.push({
        cycle: c.name, gapMs: gap, a: on[i - 1].what, b: on[i].what, atMs: on[i].t,
      });
    }
    if (on.length && Number.isFinite(c.periodMs)) {
      const wrap = on[0].t + c.periodMs - on[on.length - 1].t;
      if (wrap < floorMs) violations.push({
        cycle: c.name, gapMs: wrap, a: on[on.length - 1].what,
        b: `${on[0].what} (next ${c.name})`, atMs: on[0].t,
      });
    }
  }
  return violations;
}

function main() {
  const file = process.argv[2];
  if (!file) { console.error('usage: human-gate.mjs plan.txt'); process.exit(2); }
  const text = readFileSync(file, 'utf8');
  let violations;
  try { violations = audit(text); }
  catch (e) { console.error(`human gate: ${e.message}`); process.exit(44); }
  if (violations.length) {
    console.error(`human gate: ${violations.length} press gap(s) under ${HUMAN_GAP_FLOOR_MS} ms -- refusing to run this plan`);
    for (const v of violations)
      console.error(`  ${v.cycle}: ${v.a} -> ${v.b} is ${v.gapMs} ms (at ${v.atMs} ms)`);
    console.error('the pilot may not deliver inhumanly timed inputs (2026-08-25, no override)');
    process.exit(44);
  }
  const n = pressOnsets(text).reduce((a, c) => a + c.onsets.length, 0);
  console.log(`human gate: all gaps between ${n} presses are >= ${HUMAN_GAP_FLOOR_MS} ms`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
