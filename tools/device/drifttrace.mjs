#!/usr/bin/env node
// What drifted between the plan and the phone, joined onto one clock.
//
// The telemetry a night already produces answers "did the game agree"
// (desync-scan), "did the selects land" (camtrace), "is the HUD clock on the
// hour" (clocktrace) and "is the stream legal" (test-hid-trace). None of them
// answers the question the perfect-experiment run (plans/17) exists to settle:
// for every wall-timed press, how far is DELIVERED from PLANNED, and does that
// gap ACCUMULATE across the night or re-anchor every boundary?
//
// It reads only `$RUN-hid.jsonl`. `wait_until` emits `mark <target>` (the plan
// offset it is blocking on); the press helper that follows emits `mark
// <actual>` (`NOW_REL`) and then a `report`. So a `mark` that is immediately
// followed by a `report` or `delay`, and preceded by another `mark` no more
// than PAIR_MAX_MS earlier, is one (planned, delivered) pair -- and the gap is
// that anchor's residual, the number `HID-MULTITOUCH.md` calls the two-frame
// per-anchor budget and `actuator.mjs` models as launch lateness. Measured
// here, not modelled. Lone `mark`s (idle end, macro start) carry no paired
// press and are skipped.
//
// With `--plan FILE` (a `recipe.mjs --device-plan` emission) it also grades
// the intra-macro `delay` stream against the sweep row the plan actually
// emitted -- so a run at `--device-spacing-ms=113` is checked against 113.
//
//   drifttrace.mjs RUN_OR_HID_JSONL [--plan FILE] [--fps N] [--json]
//
// Exit 0 unless the trace is unreadable: a measurement, not a gate.
import fs from 'node:fs';
import path from 'node:path';

const FPS_DEFAULT = 60;
const PAIR_MAX_MS = 150;  // the fork-free wait_until lands in one 10 ms tick;
                          // even the retired date loop overshot <= 106 ms

function usage(message = '') {
  if (message) console.error(message);
  console.error('usage: drifttrace.mjs RUN_OR_HID_JSONL [--plan FILE] [--fps N] [--json]');
  process.exit(2);
}

const args = process.argv.slice(2);
if (!args.length || args[0].startsWith('--')) usage();
let planPath = null;
let fps = FPS_DEFAULT;
let asJson = false;
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--plan') planPath = args[++i];
  else if (args[i] === '--fps') fps = Number(args[++i]);
  else if (args[i] === '--json') asJson = true;
  else usage(`unknown argument: ${args[i]}`);
}
if (!Number.isFinite(fps) || fps < 5 || fps > 240) usage(`--fps out of range: ${fps}`);
const frameMs = 1000 / fps;

function resolveTrace(t) {
  if (t.endsWith('.jsonl')) return fs.existsSync(t) ? t : null;
  for (const c of [
    `${t}-hid.jsonl`,
    path.join('captures', `${t}-hid.jsonl`),
    path.join('captures', t, `${t}-hid.jsonl`),
  ]) if (fs.existsSync(c)) return c;
  return null;
}

const tracePath = resolveTrace(args[0]);
if (!tracePath) usage(`no hid trace for "${args[0]}"`);

const events = [];
for (const line of fs.readFileSync(tracePath, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  try { events.push(JSON.parse(line)); } catch { /* skip */ }
}
if (!events.length) usage(`hid trace has no events: ${tracePath}`);

// ---- 1. anchor residuals -------------------------------------------------
// mark[i] is an "actual" iff the very next event is a report or delay.
// Its target is the preceding mark, if it is <= PAIR_MAX_MS earlier.
const pairs = [];
for (let i = 0; i < events.length; i++) {
  if (events[i].command !== 'mark') continue;
  const next = events[i + 1];
  if (!next || (next.command !== 'report' && next.command !== 'delay')) continue;
  // preceding mark
  let j = i - 1;
  while (j >= 0 && events[j].command !== 'mark') j--;
  if (j < 0) continue;
  const residual = events[i].ms - events[j].ms;
  if (residual < 0 || residual > PAIR_MAX_MS) continue;
  pairs.push({ planned: events[j].ms, delivered: events[i].ms, residualMs: residual });
}

function stats(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return {
    n: s.length, min: s[0], max: s[s.length - 1], median: q(0.5), p95: q(0.95),
    mean: +(s.reduce((a, b) => a + b, 0) / s.length / 1).toFixed(1),
  };
}

// ---- 2. accumulate or re-anchor? ---------------------------------------
// wait_until targets are absolute (T0 + offset), so residual must be flat
// against wall time. A real positive slope means something downstream is
// scheduling relative and the night is compounding -- the failure this run
// looks for.
function regress(pts) {
  const n = pts.length;
  if (n < 5) return null;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of pts) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  if (sxx === 0) return null;
  return {
    slopeMsPerMin: +((sxy / sxx) * 60000).toFixed(2),
    r2: +(syy === 0 ? 1 : (sxy * sxy) / (sxx * syy)).toFixed(3),
  };
}
const accum = regress(pairs.map(p => ({ x: p.planned, y: p.residualMs })));
const compounds = accum && accum.slopeMsPerMin > 3 && accum.r2 >= 0.25;

// ---- 3. cycle-boundary residual --------------------------------------
// Anchors spaced ~5000 ms apart are the per-cycle opening monitor press.
const cycleAnchors = pairs.filter((p, i) => {
  const nx = pairs[i + 1];
  return nx && Math.abs((nx.planned - p.planned) - 5000) < 1500;
});

// ---- 4. sweep select spacing, intra-macro ----------------------------
// A sweep macro's delay run is short, all-small, and alternates a ~contact
// with a ~released gap. wind (one 5000+ delay) and maskraise (a >=180 gap)
// are excluded by the ceiling.
let planSweep = null;
if (planPath) {
  if (!fs.existsSync(planPath)) usage(`--plan not found: ${planPath}`);
  for (const l of fs.readFileSync(planPath, 'utf8').split('\n')) {
    const f = l.trim().split(' ');
    if (f[1] === 'sweep') { planSweep = { spacingMs: +f[2], contactMs: +f[3] }; break; }
  }
}
const macroRuns = [];
{
  let cur = [];
  for (const e of events) {
    if (e.command === 'mark') { if (cur.length) macroRuns.push(cur); cur = []; }
    else if (e.command === 'delay') cur.push(e.duration);
  }
  if (cur.length) macroRuns.push(cur);
}
const spacings = [];
const contacts = [];
for (const run of macroRuns) {
  if (run.length < 4 || run.length > 12) continue;
  if (Math.max(...run) > 150) continue;          // not a sweep (wind / maskraise)
  for (let i = 0; i + 1 < run.length; i += 2) {
    const c = run[i], r = run[i + 1];
    if (c >= 60 && c <= 150 && r >= 5 && r <= 130) { spacings.push(c + r); contacts.push(c); }
  }
}

const rs = stats(pairs.map(p => p.residualMs));
const spSt = stats(spacings);
const ctSt = stats(contacts);
const cycSt = stats(cycleAnchors.map(p => p.residualMs));

const verdict = {
  trace: path.basename(tracePath),
  anchorsPaired: rs?.n ?? 0,
  residualMs: rs,
  residualFrames: rs && {
    median: +(rs.median / frameMs).toFixed(2),
    p95: +(rs.p95 / frameMs).toFixed(2),
    max: +(rs.max / frameMs).toFixed(2),
  },
  accumulation: accum,
  compounds,
  cycleBoundaryMs: cycSt,
  sweepSelectSpacingMs: spSt,
  sweepContactMs: ctSt,
  planSweep,
  spacingVsPlanMs: planSweep && spSt ? +(spSt.median - planSweep.spacingMs).toFixed(1) : null,
};

if (asJson) { console.log(JSON.stringify(verdict, null, 2)); process.exit(0); }

const f = s => s ? `min ${s.min}  median ${s.median}  p95 ${s.p95}  max ${s.max}  (n=${s.n})` : 'no data';
console.log(`drift trace: ${verdict.trace}`);
console.log(`  wall-timed anchors paired:      ${verdict.anchorsPaired}`);
console.log(`  per-anchor residual (ms):       ${f(rs)}`);
if (verdict.residualFrames)
  console.log(`  per-anchor residual (frames):   median ${verdict.residualFrames.median}  p95 ${verdict.residualFrames.p95}  max ${verdict.residualFrames.max}  @ ${fps} fps`);
if (accum)
  console.log(`  accumulation:                   ${accum.slopeMsPerMin} ms/min (r2 ${accum.r2})  ->  ${compounds ? 'DRIFT COMPOUNDS -- something schedules relative' : 're-anchors each boundary'}`);
else
  console.log('  accumulation:                   too few anchors to regress');
console.log(`  cycle-boundary residual (ms):   ${f(cycSt)}`);
console.log(`  sweep select spacing (ms):      ${f(spSt)}`);
console.log(`  sweep contact length (ms):      ${f(ctSt)}`);
if (planSweep) {
  console.log(`  plan emitted:                   ${planSweep.spacingMs} ms select spacing / ${planSweep.contactMs} ms contact`);
  if (verdict.spacingVsPlanMs !== null)
    console.log(`  delivered vs emitted spacing:   ${verdict.spacingVsPlanMs >= 0 ? '+' : ''}${verdict.spacingVsPlanMs} ms`);
}
console.log('\nnot in this number: the coprocess->uhid->InputReader->Fusion tail');
console.log('(~1 frame, off-probe -- geteventtrace.sh), and whether the game');
console.log('ACCEPTED each press (desync-scan.py).');
