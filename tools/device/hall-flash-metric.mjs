#!/usr/bin/env node
// Did the hallway light actually fire, per loop cycle?
//
// The video instrument in grade-run.sh counts VISIBLE hall flashes and says so
// itself: they are a rendering lower bound, because the sourced movement
// blackout can hide a flash the game accepted. On 2026-09-12 it reported 1
// flash in ~24 cycles (4%) while `minus-toys-plan.mjs` records a 1-in-3 drop
// measured 2026-09-09 (67% success). A 16x disagreement between two
// measurements of the same thing is not a result, it is a question.
//
// This answers it from the native frame trace instead. Two windows are read
// per cycle and compared, which is what makes the reading a HALL fact rather
// than a brightness fact:
//
//   HALL  the FOXY_HALL region PixelWatch.java already defines
//   DESK  office floor well away from it
//
// If both brighten, the mask came off and the hall lit. If only DESK
// brightens, the mask came off and THE HALL DID NOT LIGHT -- the failure this
// tool exists to count. If neither does, the mask never came off, which is a
// different defect and is reported as one.
//
// Foxy is repelled by that light. night5-strokes3 ended with Balloon Boy
// entering the office at 189.2 s and Foxy striking at 192.2 s.
//
//   node tools/device/hall-flash-metric.mjs --run artifacts/campaign-... \
//     --frame-trace captures/frame-traces/NAME.tsv
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// PixelWatch.java, verbatim. Derived, never hand-picked: a window typed in by
// hand is a window that silently stops matching the one the helper reads.
export const FOXY_HALL = { x: 1650, y: 300, width: 450, height: 400 };
export const CAPTURE = { width: 2400, height: 1080 };
export const GRID = { cols: 20, rows: 9 };

/** The grid cells covering a native-resolution rectangle. */
export function cellsFor(roi, capture = CAPTURE, grid = GRID) {
  const cw = capture.width / grid.cols;
  const ch = capture.height / grid.rows;
  const cells = [];
  for (let row = Math.floor(roi.y / ch); row <= Math.floor((roi.y + roi.height - 1) / ch); row += 1)
    for (let col = Math.floor(roi.x / cw); col <= Math.floor((roi.x + roi.width - 1) / cw); col += 1)
      cells.push(row * grid.cols + col);
  return cells;
}

// Office floor, left of and below the hall: it reveals with the mask but
// carries no hallway light, so it separates "mask came off" from "hall lit".
export const DESK_CELLS = cellsFor({ x: 480, y: 720, width: 960, height: 360 });
export const HALL_CELLS = cellsFor(FOXY_HALL);
export const SCREEN_FNAF2_NIGHT = 2;
/** A reveal this size or larger counts; the measured split is ~40 against ~2. */
export const BRIGHTEN_MS = 10;

const luma = value => (((value >> 16) & 255) * 299 + ((value >> 8) & 255) * 587 +
  (value & 255) * 114) / 1000;
const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

export function parseTrace(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#') || line.startsWith('seq')) continue;
    const field = line.split('\t');
    if (field.length < 12) continue;
    const hex = field[11].trim();
    if (hex.length < GRID.cols * GRID.rows * 6) continue;
    const cell = index => parseInt(hex.slice(index * 6, index * 6 + 6), 16);
    const mean = cells => cells.reduce((sum, index) => sum + luma(cell(index)), 0) / cells.length;
    rows.push({ imageMs: Number(field[1]) / 1e6, screenIdentity: Number(field[6]),
      hall: mean(HALL_CELLS), desk: mean(DESK_CELLS) });
  }
  return rows;
}

/**
 * The helper clock offset, by the same one-sided-latency argument
 * phase-reconstruct.mjs uses: the residual is a read latency, so the MINIMUM
 * is the estimator and a median sits about 28 ms above it.
 */
export function clockOffset(events) {
  const offsets = events.flatMap(event => {
    const sample = event?.sample;
    const finishedAt = event?.reads?.at?.(-1)?.finishedAt;
    return sample?.visualCaptureAt && sample?.ageUs && finishedAt
      ? [(finishedAt - Number(sample.ageUs) / 1000) - sample.visualCaptureAt] : [];
  });
  return offsets.length ? Math.min(...offsets) : null;
}

export function hallCycles(events, trace, { windowMs = 900, baselineMs = 400 } = {}) {
  const offset = clockOffset(events);
  if (offset === null) return null;
  const cycles = [];
  for (const event of events) {
    if (event.type !== 'control.gate' || !event.releaseAt) continue;
    const at = event.releaseAt - offset;
    const night = row => row.screenIdentity === SCREEN_FNAF2_NIGHT;
    const base = trace.filter(row => night(row) && row.imageMs >= at - baselineMs && row.imageMs < at);
    const after = trace.filter(row => night(row) && row.imageMs >= at && row.imageMs < at + windowMs);
    if (!base.length || !after.length) continue;
    const hallDelta = Math.max(...after.map(r => r.hall)) - median(base.map(r => r.hall));
    const deskDelta = Math.max(...after.map(r => r.desk)) - median(base.map(r => r.desk));
    const revealed = deskDelta >= BRIGHTEN_MS;
    const lit = hallDelta >= BRIGHTEN_MS;
    cycles.push({ gateAtMs: event.gateAtMs, status: event.status, hallDelta, deskDelta,
      verdict: !revealed && !lit ? 'MASK-NEVER-CAME-OFF' : lit ? 'hall-lit' : 'HALL-DARK' });
  }
  return cycles;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = name => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : undefined;
  };
  const run = arg('run');
  const tracePath = arg('frame-trace');
  if (!run || !tracePath) {
    process.stderr.write('usage: hall-flash-metric.mjs --run artifacts/campaign-... ' +
      '--frame-trace captures/frame-traces/NAME.tsv\n');
    process.exit(2);
  }
  const events = readFileSync(join(run, 'events.jsonl'), 'utf8').trim().split('\n')
    .filter(Boolean).map(line => JSON.parse(line));
  const cycles = hallCycles(events, parseTrace(readFileSync(tracePath, 'utf8')));
  if (!cycles?.length) {
    process.stdout.write('HALL_FLASH no gate/trace overlap; nothing measured\n');
    process.exit(3);
  }
  for (const cycle of cycles)
    process.stdout.write(`  ${String(cycle.gateAtMs).padStart(7)} ms  ` +
      `hall ${cycle.hallDelta.toFixed(1).padStart(6)}  desk ${cycle.deskDelta.toFixed(1).padStart(6)}` +
      `  ${cycle.verdict}\n`);
  const dark = cycles.filter(c => c.verdict === 'HALL-DARK').length;
  const revealed = cycles.filter(c => c.verdict !== 'MASK-NEVER-CAME-OFF').length;
  const never = cycles.filter(c => c.verdict === 'MASK-NEVER-CAME-OFF').length;
  process.stdout.write(`HALL_FLASH dark=${dark}/${revealed} revealed cycles ` +
    `(${revealed ? (100 * dark / revealed).toFixed(0) : 0}%) mask-never-off=${never}\n`);
  // A dark hall is a fact about the RUN, not a broken instrument: exit 3 is
  // grade-run.sh's code for exactly that, the same one sweepcheck.py now uses.
  process.exit(dark > 0 ? 3 : 0);
}
