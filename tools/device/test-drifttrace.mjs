#!/usr/bin/env node
// drifttrace.mjs joins the plan and the phone on one clock. This checks it
// pairs marks correctly (a lone idle/macro-start mark is not an anchor), reads
// residuals off the pair, isolates the sweep macro from wind and maskraise,
// and calls accumulation only on a real slope. No phone, no real run.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const tool = path.join(HERE, 'drifttrace.mjs');
let failed = 0;
const check = (ok, msg) => { if (!ok) { console.error(`FAIL: ${msg}`); failed++; } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drifttrace-'));
const write = (name, lines) => {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, lines.map(l => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n');
  return p;
};
const run = (traceArg, extra = []) =>
  JSON.parse(execFileSync('node', [tool, traceArg, '--json', ...extra], { encoding: 'utf8' }));

const mark = ms => ({ command: 'mark', ms });
const down = () => ({ id: 92, command: 'report', report: [1, 1, 3, 100, 0, 100, 0, 0, 0, 0, 0, 0] });
const up = () => ({ id: 92, command: 'report', report: [1, 2, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0] });
const delay = duration => ({ id: 92, command: 'delay', duration });
// one wall-timed tap: wait_until target, then actual, then the contact
const tap = (target, actual) => [mark(target), mark(actual), down(), delay(100), up()];
// a lone mark (idle end / macro start): no press follows immediately
const loneMark = ms => [mark(ms)];
// a three-select sweep macro at (contact, released): its own start mark, then
// only hid_delay boundaries
const sweep = (startTarget, startActual, contact, released) => [
  mark(startTarget), mark(startActual),
  down(), delay(contact), up(), delay(released),
  down(), delay(contact), up(), delay(released),
  down(), delay(contact), up(),
];
const wind = (target, actual, ms) => [mark(target), mark(actual), down(), delay(ms), up()];

// --- 1. residuals come off the pairs, lone marks are skipped -------------
{
  const trace = write('basic-hid.jsonl', [
    { id: 92, command: 'register', name: 'x' },
    ...loneMark(0),                    // startup
    ...loneMark(140000),               // idle end -- NOT an anchor
    ...tap(140183, 140188),            // +5
    ...tap(140503, 140514),            // +11
    ...tap(140636, 140643),            // +7
    ...loneMark(146134),               // macro start -- NOT an anchor
    ...sweep(146160, 146164, 100, 33), // +4, spacing 133
    ...tap(151000, 151002),            // +2
  ]);
  const v = run(trace);
  check(v.anchorsPaired === 5,
    `expected 5 paired anchors (4 taps + 1 sweep start), got ${v.anchorsPaired}`);
  check(v.residualMs.min === 2 && v.residualMs.max === 11,
    `residual range should be 2..11, got ${v.residualMs.min}..${v.residualMs.max}`);
  check(v.residualMs.median === 5,
    `residual median should be 5, got ${v.residualMs.median}`);
  check(!v.compounds, 'a flat trace must not be flagged as compounding');
  check(v.sweepSelectSpacingMs && v.sweepSelectSpacingMs.median === 133,
    `sweep spacing should be 133, got ${v.sweepSelectSpacingMs?.median}`);
  check(v.sweepContactMs.median === 100,
    `sweep contact should be 100, got ${v.sweepContactMs?.median}`);
}

// --- 2. wind and maskraise do not leak into the sweep spacing -----------
{
  const trace = write('mixed-hid.jsonl', [
    ...tap(1000, 1004),
    ...wind(1200, 1205, 5400),                 // wind: one huge delay
    ...sweep(7000, 7003, 100, 33),             // the only real sweep
    [mark(9000), mark(9004), down(), delay(180), up(), delay(134), down(), delay(100), up()], // maskraise-ish: 180 gap
  ]);
  const v = run(trace);
  check(v.sweepSelectSpacingMs && v.sweepSelectSpacingMs.median === 133,
    `sweep spacing should still be 133 with wind+maskraise present, got ${v.sweepSelectSpacingMs?.median}`);
  check(v.sweepSelectSpacingMs.n === 2,
    `only the 2 real select gaps should count, got n=${v.sweepSelectSpacingMs.n}`);
}

// --- 3. a genuine linear slope is flagged as compounding ----------------
{
  const lines = [];
  for (let k = 0; k < 30; k++) {
    const planned = 10000 + k * 5000;
    lines.push(...tap(planned, planned + k * 8));   // residual grows 8 ms/cycle
  }
  const trace = write('compound-hid.jsonl', lines);
  const v = run(trace);
  check(v.compounds === true,
    `an 8 ms/cycle growing residual must be flagged compounding (slope ${v.accumulation?.slopeMsPerMin} ms/min, r2 ${v.accumulation?.r2})`);
}

// --- 4. plan cross-check: emitted 113 spacing is graded against 113 -----
{
  const plan = write('plan113.txt', [
    '#night 6', '#idle-until 0', '#cycle clear 5000',
    '0 tap monitor 100', '2000 sweep 113 100 10,4,7',
  ]);
  const trace = write('dev113-hid.jsonl', [
    ...tap(0, 3),
    ...sweep(2000, 2004, 100, 13),   // 100 + 13 = 113
  ]);
  const v = run(trace, ['--plan', plan]);
  check(v.planSweep && v.planSweep.spacingMs === 113,
    `plan sweep spacing should read 113, got ${v.planSweep?.spacingMs}`);
  check(v.spacingVsPlanMs === 0,
    `delivered 113 vs emitted 113 should be 0, got ${v.spacingVsPlanMs}`);
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\ndrifttrace: ${failed} check(s) failed`); process.exit(1); }
console.log('drifttrace checks passed');
