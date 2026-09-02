import assert from 'node:assert/strict';
import * as C from '@fnaf2-1020/core/mechanics';
import {
  RHYTHM_CHART_SCHEMA,
  RHYTHM_MIN_GAP_MS,
  makeRhythmChart,
  validateRhythmChart,
} from '../apps/trainer/src/rhythm-highway.js';
import { makePredictionExercise, makeTimingExercise, makeReplaySnapshot } from '../apps/trainer/src/microtrainer.js';

const expectThrow = (fn, pattern) => assert.throws(fn, error => !pattern || pattern.test(error.message));
const scheduler = { policyId: 'rhythm-test', policyVersion: '1', selectionProbability: 1 };
const snapshot = makeReplaySnapshot({
  id: 'rhythm-snapshot', sessionId: 'rhythm-source', beliefSequence: 1,
  clock: 'host-monotonic-ms', atMs: 100, profileId: 'rhythm-profile',
  activityGateVersion: 'activity-gate-v1', factIds: ['before'], stateFamily: 'cycle', split: 'practice',
});
const exercise = makePredictionExercise({
  id: 'rhythm-exercise', snapshot, target: 'next-state', choices: ['CLEAR', 'THREAT'],
  horizonMs: 800, scheduler,
  futureFact: { schema: 'resolution-v1', outcome: 'THREAT', occurredAtMs: 500,
    evidenceFactIds: ['after'] },
}).exercise;

const chart = makeRhythmChart({ id: 'chart-1', seed: 'daily-1', exercise,
  routine: C.CYCLE_SCRIPT, audioOffsetMs: 12, hapticsOffsetMs: -8 });
assert.equal(chart.schema, RHYTHM_CHART_SCHEMA);
assert.equal(chart.notes.length, C.CYCLE_SCRIPT.length);
assert.equal(chart.predictionFork.choices.join(','), 'CLEAR,THREAT');
assert.equal(Object.hasOwn(chart.predictionFork, 'outcome'), false);
assert.equal(Object.isFrozen(chart), true);
assert.deepEqual(chart, makeRhythmChart({ id: 'chart-1', seed: 'daily-1', exercise,
  routine: C.CYCLE_SCRIPT, audioOffsetMs: 12, hapticsOffsetMs: -8 }));

for (const lane of new Set(chart.notes.map(note => note.lane))) {
  const notes = chart.notes.filter(note => note.lane === lane);
  for (let i = 1; i < notes.length; i++)
    assert(notes[i].atMs >= notes[i - 1].endAtMs + RHYTHM_MIN_GAP_MS);
}
assert.equal(chart.notes.find(note => note.id === 'wind').holdMs, 3500);
assert.equal(chart.notes.find(note => note.id === 'mask-off').toleranceMs.late, 50);
assert.deepEqual(validateRhythmChart(chart), chart);

const dense = [
  { id: 'a', at: 0, label: 'A', action: 'light', win: { early: 0.1, late: 0.1 } },
  { id: 'b', at: 0, label: 'B', action: 'light', win: { early: 0.1, late: 0.1 } },
  { id: 'c', at: 0, label: 'C', action: 'light', win: { early: 0.1, late: 0.1 } },
  { id: 'd', at: 0, label: 'D', action: 'light', win: { early: 0.1, late: 0.1 } },
];
expectThrow(() => makeRhythmChart({ id: 'dense', seed: 'x', exercise, routine: dense }), /collides/);
expectThrow(() => makeRhythmChart({ id: 'missing-window', seed: 'x', exercise,
  routine: [{ ...dense[0], win: undefined }] }), /win must be an object/);
expectThrow(() => validateRhythmChart({ ...chart, notes: chart.notes.map(note => ({ ...note,
  outcome: 'THREAT' })) }), /notes\[0\]/);

const timingExercise = makeTimingExercise({ id: 'no-fork', snapshot, target: 'response-latency',
  deadlineAtMs: 1000, responseLatencyBudgetMs: 100,
  timingBuckets: { schema: 'timing-buckets-v1', buckets: [
    { id: 'early', minMs: null, maxMs: 0 }, { id: 'late', minMs: 0, maxMs: null },
  ] }, scheduler }).exercise;
const noFork = makeRhythmChart({ id: 'no-fork-chart', seed: 'x', exercise: timingExercise,
  routine: [dense[0]] });
assert.equal(noFork.predictionFork, null);

console.log('rhythm highway: deterministic measured-window charts, hold notes, collision refusal, offsets, and outcome-free prediction forks pass');
