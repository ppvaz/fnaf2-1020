// Deterministic Rhythm Highway chart boundary for Plan 24 P3B.
//
// Charts are presentation data derived from a frozen exercise and a declared
// routine. They carry measured timing windows and frozen prediction choices,
// but never carry the independently resolved outcome or live game state.

import { stableHash } from '@fnaf2-1020/core/contracts';
import { validateExercise } from '@fnaf2-1020/core/training';
import { glyphFor } from './lane.js';

export const RHYTHM_CHART_SCHEMA = 'rhythm-highway-chart-v1';
export const RHYTHM_RENDERER_ID = 'rhythm-highway';
export const RHYTHM_MIN_GAP_MS = 80;

const ACTIONS = new Set(['monitor', 'mask', 'light', 'wind', 'cam', 'camflash']);
const GLYPH_KINDS = new Set(['cam', 'light', 'mask', 'monitor', 'wind']);
const clone = value => structuredClone(value);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new TypeError(`rhythm highway: ${message}`); };

function text(name, value, max = 128) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max)
    fail(`${name} must be a non-empty bounded string`);
  return value;
}

function number(name, value, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isFinite(value) || value < min || value > max)
    fail(`${name} is outside its numeric bounds`);
  return value;
}

function integer(name, value, { min = 0, max = Infinity } = {}) {
  if (!Number.isInteger(value) || value < min || value > max)
    fail(`${name} is outside its integer bounds`);
  return value;
}

function object(name, value) {
  if (!isRecord(value)) fail(`${name} must be an object`);
  return value;
}

function exact(name, value, keys) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${name}.${key} is not allowed`);
  return value;
}

function strings(name, values, { min = 1, max = 32 } = {}) {
  if (!Array.isArray(values) || values.length < min || values.length > max ||
      values.some(value => typeof value !== 'string' || value.length === 0 || value.length > 128))
    fail(`${name} must be a bounded string array`);
  if (new Set(values).size !== values.length) fail(`${name} must be unique`);
  return values;
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function toleranceFor(step, index) {
  object(`routine[${index}].win`, step.win);
  number(`routine[${index}].win.early`, step.win.early, { min: 0, max: 30 });
  number(`routine[${index}].win.late`, step.win.late, { min: 0, max: 30 });
  if (step.win.early === 0 && step.win.late === 0) fail(`routine[${index}].win is empty`);
  return { early: Math.round(step.win.early * 1000), late: Math.round(step.win.late * 1000) };
}

function semanticFor(step) {
  const semantic = { action: step.action, cam: step.cam ?? null, want: step.want ?? null };
  if (semantic.cam !== null) integer('step.cam', semantic.cam, { min: 0, max: 99 });
  if (semantic.want !== null) text('step.want', semantic.want, 32);
  return semantic;
}

function preferredLane(kind, laneCount) {
  const preferred = { cam: 0, monitor: 0, mask: 1, light: 1, wind: 2 }[kind] ?? 0;
  return preferred % laneCount;
}

function laneOrder(seed, noteId, preferred, laneCount) {
  return Array.from({ length: laneCount }, (_, lane) => lane)
    .sort((a, b) => {
      const ar = a === preferred ? '' : stableHash(`${seed}:${noteId}:${a}`);
      const br = b === preferred ? '' : stableHash(`${seed}:${noteId}:${b}`);
      return ar.localeCompare(br) || a - b;
    });
}

function validateFork(fork, exercise = null) {
  if (fork === null) return null;
  object('predictionFork', fork);
  exact('predictionFork', fork, ['target', 'choices', 'atMs', 'commitDeadlineMs', 'revealAtMs']);
  text('predictionFork.target', fork.target, 128);
  strings('predictionFork.choices', fork.choices);
  number('predictionFork.atMs', fork.atMs, { min: 0 });
  number('predictionFork.commitDeadlineMs', fork.commitDeadlineMs, { min: fork.atMs });
  number('predictionFork.revealAtMs', fork.revealAtMs, { min: fork.commitDeadlineMs });
  if (exercise) {
    if (exercise.kind !== 'prediction') fail('prediction fork requires a prediction exercise');
    if (fork.target !== exercise.question.target ||
        JSON.stringify(fork.choices) !== JSON.stringify(exercise.question.choices))
      fail('prediction fork diverges from frozen exercise choices');
  }
  return fork;
}

function validateNote(note, index, laneCount, minGapMs) {
  object(`notes[${index}]`, note);
  exact(`notes[${index}]`, note, ['id', 'action', 'atMs', 'holdMs', 'endAtMs', 'glyph',
    'toleranceMs', 'semantic', 'label', 'lane']);
  text(`notes[${index}].id`, note.id, 128);
  if (!ACTIONS.has(note.action)) fail(`notes[${index}].action is unsupported`);
  number(`notes[${index}].atMs`, note.atMs, { min: 0 });
  number(`notes[${index}].holdMs`, note.holdMs, { min: 0, max: 60_000 });
  integer(`notes[${index}].lane`, note.lane, { max: laneCount - 1 });
  if (note.endAtMs !== note.atMs + note.holdMs) fail(`notes[${index}] end does not match hold`);
  object(`notes[${index}].glyph`, note.glyph);
  exact(`notes[${index}].glyph`, note.glyph, ['text', 'kind']);
  text(`notes[${index}].glyph.text`, note.glyph.text, 32);
  if (!GLYPH_KINDS.has(note.glyph.kind)) fail(`notes[${index}].glyph.kind is unsupported`);
  object(`notes[${index}].toleranceMs`, note.toleranceMs);
  exact(`notes[${index}].toleranceMs`, note.toleranceMs, ['early', 'late']);
  number(`notes[${index}].toleranceMs.early`, note.toleranceMs.early, { min: 0 });
  number(`notes[${index}].toleranceMs.late`, note.toleranceMs.late, { min: 0 });
  object(`notes[${index}].semantic`, note.semantic);
  exact(`notes[${index}].semantic`, note.semantic, ['action', 'cam', 'want']);
  if (note.semantic.action !== note.action) fail(`notes[${index}] semantic action diverges`);
  if (note.semantic.cam !== null && note.semantic.cam !== undefined)
    integer(`notes[${index}].semantic.cam`, note.semantic.cam, { min: 0, max: 99 });
  if (note.semantic.want !== null && note.semantic.want !== undefined)
    text(`notes[${index}].semantic.want`, note.semantic.want, 32);
  const expectedGlyph = glyphFor({ action: note.action, cam: note.semantic.cam, want: note.semantic.want });
  if (JSON.stringify(note.glyph) !== JSON.stringify(expectedGlyph))
    fail(`notes[${index}] glyph does not match semantic action`);
  text(`notes[${index}].label`, note.label, 160);
  number(`notes[${index}].minGapMs`, minGapMs, { min: 0 });
  return note;
}

function validateChart(input) {
  const value = object('chart', input);
  exact('chart', value, ['schema', 'id', 'seed', 'exerciseId', 'rendererId', 'laneCount',
    'minGapMs', 'pixelsPerSecond', 'promptAtMs', 'durationMs', 'notes', 'predictionFork', 'offsets']);
  if (value.schema !== RHYTHM_CHART_SCHEMA) fail(`schema must be ${RHYTHM_CHART_SCHEMA}`);
  text('chart.id', value.id);
  text('chart.seed', value.seed);
  text('chart.exerciseId', value.exerciseId);
  if (value.rendererId !== RHYTHM_RENDERER_ID) fail('rendererId is not rhythm-highway');
  integer('chart.laneCount', value.laneCount, { min: 1, max: 8 });
  number('chart.minGapMs', value.minGapMs, { min: 0, max: 5000 });
  number('chart.pixelsPerSecond', value.pixelsPerSecond, { min: 20, max: 1000 });
  number('chart.promptAtMs', value.promptAtMs, { min: 0 });
  number('chart.durationMs', value.durationMs, { min: 0 });
  object('chart.offsets', value.offsets);
  exact('chart.offsets', value.offsets, ['audioMs', 'hapticsMs']);
  number('chart.offsets.audioMs', value.offsets.audioMs, { min: -1000, max: 1000 });
  number('chart.offsets.hapticsMs', value.offsets.hapticsMs, { min: -1000, max: 1000 });
  if (!Array.isArray(value.notes) || value.notes.length === 0 || value.notes.length > 512)
    fail('chart.notes must be a non-empty bounded array');
  const ids = new Set();
  const ends = Array(value.laneCount).fill(-Infinity);
  for (const [index, note] of value.notes.entries()) {
    validateNote(note, index, value.laneCount, value.minGapMs);
    if (ids.has(note.id)) fail('chart note IDs must be unique');
    ids.add(note.id);
    if (note.atMs < ends[note.lane] + value.minGapMs)
      fail(`notes[${index}] collides with an earlier note in lane ${note.lane}`);
    ends[note.lane] = note.endAtMs;
    if (note.endAtMs > value.durationMs) fail(`notes[${index}] exceeds chart duration`);
  }
  validateFork(value.predictionFork);
  if (value.predictionFork && value.predictionFork.revealAtMs > value.durationMs)
    fail('prediction fork exceeds chart duration');
  return value;
}

/** Validate and freeze a persisted chart without loading a DOM or media. */
export function validateRhythmChart(input) {
  return freeze(clone(validateChart(input)));
}

/**
 * Build a deterministic chart from a routine carrying measured `win` windows.
 * If the routine cannot fit without overlap, the chart is refused rather than
 * teaching a motor collision. A prediction exercise adds a commit-then-reveal
 * fork whose choices are copied from the frozen question; its outcome is absent.
 * @param {any} options
 */
export function makeRhythmChart({ id, seed, exercise: exerciseInput, routine,
  laneCount = 3, pixelsPerSecond = 105, audioOffsetMs = 0, hapticsOffsetMs = 0 } = {}) {
  text('id', id);
  text('seed', seed);
  const exercise = validateExercise(exerciseInput);
  if (!Array.isArray(routine) || routine.length === 0 || routine.length > 512)
    fail('routine must be a non-empty bounded array');
  integer('laneCount', laneCount, { min: 1, max: 8 });
  number('pixelsPerSecond', pixelsPerSecond, { min: 20, max: 1000 });
  number('audioOffsetMs', audioOffsetMs, { min: -1000, max: 1000 });
  number('hapticsOffsetMs', hapticsOffsetMs, { min: -1000, max: 1000 });

  const seen = new Set();
  const rows = routine.map((step, index) => {
    object(`routine[${index}]`, step);
    text(`routine[${index}].id`, step.id, 128);
    if (seen.has(step.id)) fail('routine step IDs must be unique');
    seen.add(step.id);
    if (!ACTIONS.has(step.action)) fail(`routine[${index}].action is unsupported`);
    number(`routine[${index}].at`, step.at, { min: 0, max: 86_400 });
    const holdMs = step.hold === undefined ? 0 : Math.round(number(
      `routine[${index}].hold`, step.hold, { min: 0, max: 60 }) * 1000);
    const glyph = glyphFor(step);
    const toleranceMs = toleranceFor(step, index);
    return {
      id: step.id, action: step.action, atMs: Math.round(step.at * 1000), holdMs,
      endAtMs: Math.round(step.at * 1000) + holdMs, glyph,
      toleranceMs, semantic: semanticFor(step), label: text(`routine[${index}].label`, step.label, 160),
    };
  }).sort((a, b) => a.atMs - b.atMs || a.id.localeCompare(b.id));

  const laneEnds = Array(laneCount).fill(-Infinity);
  const notes = rows.map(row => {
    const order = laneOrder(seed, row.id, preferredLane(row.glyph.kind, laneCount), laneCount);
    const lane = order.find(candidate => row.atMs >= laneEnds[candidate] + RHYTHM_MIN_GAP_MS);
    if (lane === undefined) fail(`routine step ${row.id} collides at ${row.atMs}ms`);
    laneEnds[lane] = row.endAtMs;
    return { ...row, lane };
  });
  const predictionFork = exercise.kind === 'prediction' ? {
    target: exercise.question.target, choices: clone(exercise.question.choices), atMs: 0,
    commitDeadlineMs: exercise.commitDeadlineMs - exercise.promptAtMs,
    revealAtMs: exercise.revealDeadlineMs - exercise.promptAtMs,
  } : null;
  const durationMs = Math.max(...notes.map(note => note.endAtMs), predictionFork?.revealAtMs || 0);
  return validateRhythmChart({
    schema: RHYTHM_CHART_SCHEMA, id, seed, exerciseId: exercise.id,
    rendererId: RHYTHM_RENDERER_ID, laneCount, minGapMs: RHYTHM_MIN_GAP_MS,
    pixelsPerSecond, promptAtMs: exercise.promptAtMs, durationMs, notes,
    predictionFork, offsets: { audioMs: audioOffsetMs, hapticsMs: hapticsOffsetMs },
  });
}
