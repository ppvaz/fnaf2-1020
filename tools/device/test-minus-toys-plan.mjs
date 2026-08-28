// Gate for the Minus Toys device plan. No phone required.
//
// minus-toys-plan.mjs is the device half of plan 02 package 2a: it ports the
// engine-verified glitch-based Minus Toys loop (tools/minustoystest.mjs) into
// the file format trial.sh's on-phone interpreter reads, and trial.sh runs its
// `--gate` before its first adb command exactly as it runs human-gate.mjs for
// Minus 7. This checks three things that can each go wrong silently:
//
//  1. the ported schedule still clears the night in the exact model, with the
//     split actually armed (splitAt >= 0) and the no-split control still losing;
//  2. the emitted plan is shaped the way the interpreter expects -- policy and
//     night headers, the two named cycles, columns in the right order;
//  3. every instruction kind and control the plan names is one the interpreter
//     actually implements. A `hold light` row the plan interpreter has no
//     `light` control for would abort the run at exit 47 on the phone; a plan
//     control this test parses from the shipped source cannot drift from it.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { OPENING, LOOP, KNOBS0, build, replay, emitPlan } from './minus-toys-plan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const check = (ok, message) => { if (!ok) throw new Error(message); };
const seed = i => (i * 2654435761) >>> 0;

// --- 0. the parametrized build reproduces the shipped schedule ---------------
//
// minus-toys-plan.mjs self-asserts this on import (build(KNOBS0) === the frozen
// arrays); re-state it here so a change to that assertion also trips a suite
// check, and pin the two facts a search depends on: a knob perturbs the plan,
// and the shipped default does not.
{
  const d = build();
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check(eq(d.opening, OPENING) && eq(d.loop, LOOP),
    'build() does not reproduce the exported OPENING/LOOP');
  check(!eq(build({ windMs: KNOBS0.windMs + 500 }).loop, LOOP),
    'a windMs knob change did not alter the loop -- build() is not reading knobs');
  check(emitPlan(2, { windMs: KNOBS0.windMs + 500 }) !== emitPlan(2),
    'emitPlan ignored its knobs argument');
}

// The published routine is 5 s-interval-anchored but the port is a 10 s loop.
// cyclelengthsearch.mjs found the same for Minus 7: a 10 s period is structural
// (2x the 5 s movement grid). Pin that a 5 s symmetric build does NOT clear --
// it cannot deliver Balloon Boy's 5 consecutive mask ticks without the
// reactive blackout branch. If this ever passes, the loop-period picture changed.
{
  let wins = 0;
  for (let i = 0; i < 100; i++) {
    const r = replay({ night: 2, seed: seed(i), knobs: { loopPeriodMs: 5000 } });
    if (r.sim.won && r.splitAt >= 0) wins++;
  }
  check(wins < 20,
    `the 5 s loop-period build cleared night 2 ${wins}/100 -- it was expected to ` +
    'fail without the reactive branch; the 10 s period may no longer be structural');
}

// --- 1. the ported schedule survives, and the split is what does it ----------

for (const night of [2, 7]) {
  for (const worst of [false, true]) {
    const runs = worst ? 100 : 200;
    let wins = 0, armed = 0, minBox = 1;
    for (let i = 0; i < runs; i++) {
      const r = replay({ night, worst, seed: seed(i) });
      if (r.sim.won) wins++;
      if (r.splitAt >= 0) armed++;
      minBox = Math.min(minBox, r.minBox);
    }
    check(wins === runs,
      `night ${night} ${worst ? 'worst' : 'normal'}: ${wins}/${runs} survived`);
    check(armed === runs,
      `night ${night} ${worst ? 'worst' : 'normal'}: the split armed on only ${armed}/${runs} runs`);
    check(minBox > 0.4,
      `night ${night} ${worst ? 'worst' : 'normal'}: music box fell to ${(minBox * 100).toFixed(0)}%`);
  }
}

// The load-bearing negative control: the identical loop with the marker left
// synchronized on CAM 11 must not clear canonical 10/20. Its splitAt stays -1.
let controlWins = 0, controlArmed = 0;
for (let i = 0; i < 200; i++) {
  const r = replay({ night: 7, splitCamera: false, seed: seed(i) });
  if (r.sim.won) controlWins++;
  if (r.splitAt >= 0) controlArmed++;
}
check(controlWins === 0,
  `the no-split control cleared night 7 ${controlWins}/200 times; the split is not what wins`);
check(controlArmed === 0,
  `the no-split control reported the split armed ${controlArmed} times`);

// The CLI entry point trial.sh actually calls: `--gate` exits 0, plain emits.
for (const night of ['2', '7']) {
  execFileSync('node', [join(here, 'minus-toys-plan.mjs'), `--night=${night}`, '--gate'],
    { stdio: 'ignore' });
}

// --- 2. the emitted plan is shaped for the interpreter -----------------------

const plan = emitPlan(7);
const lines = plan.trimEnd().split('\n');
check(lines[0] === '#policy minus-toys', `first line is "${lines[0]}", not the policy header`);
check(lines.includes('#night 7'), 'the emitted plan does not name its night');
check(lines.indexOf('#cycle opening') === 2, 'the opening cycle must follow the two headers');
check(lines.includes('#cycle toys'), 'the emitted plan has no toys loop cycle');
check(plan.endsWith('\n'), 'the plan must end with a newline for `read` to see its last row');

// Rows round-trip: what emitPlan writes is exactly OPENING then LOOP, joined.
const rowText = rows => rows.map(r => r.join(' '));
check(
  lines.slice(3, 3 + OPENING.length).join('|') === rowText(OPENING).join('|'),
  'the opening rows are not the OPENING table verbatim');
const toysAt = lines.indexOf('#cycle toys');
check(
  lines.slice(toysAt + 1).join('|') === rowText(LOOP).join('|'),
  'the toys rows are not the LOOP table verbatim');

// --- 3. every kind and control the plan names is implemented -----------------

// Parsed from the shipped interpreter, never restated here: a copied list is a
// second source that drifts. `plan_step` names the kinds; `plan_control_xy`
// (in 10-minus7-sweep.sh) names the tap/hold controls.
const interp = readFileSync(join(here, 'trial', '11-plan-interpreter.sh'), 'utf8');
const sweep = readFileSync(join(here, 'trial', '10-minus7-sweep.sh'), 'utf8');

const stepBody = interp.slice(interp.indexOf('plan_step() {'), interp.indexOf('plan_span() {'));
const KINDS = new Set(
  [...stepBody.matchAll(/^\s{4}([a-z]+)\)$/gm)].map(m => m[1]));
check(KINDS.has('camdrop') && KINDS.has('tap') && KINDS.has('hold') && KINDS.has('hall'),
  `plan_step is missing a kind this plan needs; it knows: ${[...KINDS].join(', ')}`);

const xyBody = sweep.slice(sweep.indexOf('plan_control_xy() {'));
const CONTROLS = new Set(
  [...xyBody.slice(0, xyBody.indexOf('\n}')).matchAll(/^\s{4}([a-z0-9]+)\)/gm)].map(m => m[1]));

for (const [, kind, a] of [...OPENING, ...LOOP]) {
  check(KINDS.has(kind), `the plan uses instruction "${kind}", which plan_step cannot execute`);
  if (kind === 'tap' || kind === 'hold')
    check(CONTROLS.has(a),
      `the plan taps/holds control "${a}", which plan_control_xy does not resolve ` +
      `(it knows: ${[...CONTROLS].join(', ')})`);
}

// plan_span must count camdrop's full light hold, or the macro seam wait is
// written early and the next interval's first press lands on the light's tail.
const spanBody = interp.slice(interp.indexOf('plan_span() {'), interp.indexOf('plan_emit() {'));
check(/camdrop\)\s+PLAN_SPAN=\$\(\(pn_a \+ pn_b \+ pn_c\)\)/.test(spanBody),
  'plan_span does not sum camdrop as light-lead + monitor-contact + light-tail');

console.log(
  `minus toys device plan: nights 2 and 7 clear 200/200 + 100/100 worst with the ` +
  `split armed every run, no-split control 0/200; emitted plan parses and every ` +
  `kind/control is implemented`);
