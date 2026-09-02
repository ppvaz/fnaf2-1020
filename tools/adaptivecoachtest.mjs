import assert from 'node:assert/strict';
import {
  ADAPTIVE_SELECTION_SCHEMA,
  DEFAULT_ADAPTIVE_POLICY,
  exportSkillModel,
  makeSkillModel,
  resetSkillModel,
  reportSkill,
  selectAdaptiveExercise,
  skillModelHash,
  updateSkillModel,
  validateAdaptiveSelection,
  validateSkillModel,
} from '../apps/trainer/src/adaptive-coach.js';
import {
  makeMicrotrainerAttempt,
  makeMicrotrainerRecord,
  makeMicrotrainerSession,
  makePredictionExercise,
  makeReplaySnapshot,
} from '../apps/trainer/src/microtrainer.js';

const expectThrow = (fn, pattern) => {
  assert.throws(fn, error => !pattern || pattern.test(error.message));
};

const profileId = 'trainer-profile-v1';
const sourceSessionId = 'source-session-adaptive';
const trainingScheduler = Object.freeze({
  policyId: 'fixed-replay-v1', policyVersion: '1', selectionProbability: 0.5, seed: 9,
});

function predictionRecord({ id, atMs, split = 'replay', choice = 'THREAT', sessionId = 'trainer-adaptive-1' }) {
  const snapshot = makeReplaySnapshot({
    id: `snapshot-${id}`, sessionId: sourceSessionId, beliefSequence: atMs,
    clock: 'host-monotonic-ms', atMs, profileId,
    activityGateVersion: 'activity-gate-v1', factIds: [`before-${id}`],
    stateFamily: 'hall-threat', split,
  });
  const made = makePredictionExercise({
    id, snapshot, target: 'next-hall-state', choices: ['CLEAR', 'THREAT'],
    horizonMs: 500, scheduler: trainingScheduler,
    futureFact: { schema: 'resolution-v1', outcome: 'THREAT', occurredAtMs: atMs + 200,
      evidenceFactIds: [`after-${id}`] },
    commitment: choice === null ? null : {
      schema: 'commitment-v1', choice, committedAtMs: atMs + 100,
      responsePort: 'replay-keyboard',
    },
  });
  const attempt = makeMicrotrainerAttempt({
    exercise: made.replay, rendererId: 'campaign', rendererVersion: '1', sessionId,
    shownAtMs: atMs, commitment: made.replay.commitment,
  });
  return makeMicrotrainerRecord({ exercise: made.exercise, events: made.events, attempt });
}

const records = [
  predictionRecord({ id: 'correct', atMs: 1000 }),
  predictionRecord({ id: 'wrong', atMs: 1200, choice: 'CLEAR' }),
  predictionRecord({ id: 'holdout', atMs: 1400, split: 'holdout' }),
  predictionRecord({ id: 'censored', atMs: 1600, choice: null }),
];
const session = makeMicrotrainerSession({
  session: {
    sessionId: 'trainer-adaptive-1', sourceSessionId, clock: 'host-monotonic-ms',
    startedAtMs: 1000, endedAtMs: 2000, profileId, surface: 'replay', split: 'replay',
  }, records, artifacts: [],
});

let model = makeSkillModel({ playerId: 'player-a', profileId, createdAtMs: 0 });
const imported = updateSkillModel(model, session);
assert.equal(imported.imported, true);
assert.equal(imported.scored, 2);
assert.equal(imported.censored, 1);
assert.equal(imported.holdoutScored, 1);
model = imported.model;
assert.deepEqual(validateSkillModel(model), model);
assert.equal(model.metrics['prediction:hall-threat'].exposures, 3,
  'censored exercises are tracked as exposure but do not enter the accuracy denominator');
assert.equal(model.metrics['prediction:hall-threat'].attempts, 2);
assert.equal(model.metrics['prediction:hall-threat'].correct, 1);
assert.equal(model.holdout['prediction:hall-threat'].attempts, 1,
  'holdout outcomes remain in a separate report bucket');

const report = reportSkill(model, { minimumStableSamples: 2 });
const row = report.rows.find(item => item.key === 'prediction:hall-threat');
assert.equal(row.accuracy, 0.5);
assert.equal(row.denominator, 2);
assert.equal(row.censored, 1);
assert.equal(row.stableWeakest, true);
assert(row.uncertainty95.lower < row.accuracy && row.uncertainty95.upper > row.accuracy);
assert.equal(row.selectionProbabilityMean, 0.5);
assert.equal(report.holdout[0].denominator, 1);
assert.equal(report.weakestStable, row.key);

const duplicate = updateSkillModel(model, session);
assert.equal(duplicate.imported, false);
assert.equal(duplicate.reason, 'session-already-ingested');
assert.equal(duplicate.model.metrics['prediction:hall-threat'].attempts, 2);

const candidates = [
  { id: 'weak-hall', kind: 'prediction', stateFamily: 'hall-threat', profileId, split: 'practice' },
  { id: 'new-blackout', kind: 'timing', stateFamily: 'blackout', profileId, split: 'practice' },
  { id: 'holdout-never-train', kind: 'prediction', stateFamily: 'hall-threat', profileId, split: 'holdout' },
];
const selected = selectAdaptiveExercise({ model, candidates, nowMs: 10000,
  policy: { ...DEFAULT_ADAPTIVE_POLICY, recentWindowMs: 100 } });
assert.equal(selected.selection.schema, ADAPTIVE_SELECTION_SCHEMA);
assert.equal(selected.selection.candidateCount, 2);
assert.equal(selected.selection.selectionProbability, 0.5);
assert(selected.selection.excluded.some(item => item.reason === 'holdout-excluded'));
assert.equal(validateAdaptiveSelection(selected.selection).selectedExerciseId, selected.candidate.id);

expectThrow(() => selectAdaptiveExercise({
  model, candidates: [candidates[0]], nowMs: 1700,
  policy: { ...DEFAULT_ADAPTIVE_POLICY, maxRecentPerState: 3, recentWindowMs: 10000 },
}), /no-candidate-after-caps/);
expectThrow(() => selectAdaptiveExercise({
  model, candidates, nowMs: 10000, sessionPromptCount: DEFAULT_ADAPTIVE_POLICY.maxSessionPrompts,
}), /session-prompt-cap/);
expectThrow(() => updateSkillModel(model, {
  ...session, session: { ...session.session, profileId: 'other-profile' },
}), /profile does not match/);

const exported = exportSkillModel(model);
assert.equal(JSON.parse(exported).playerId, 'player-a');
assert.equal(skillModelHash(model), skillModelHash(validateSkillModel(JSON.parse(exported))));
const reset = resetSkillModel(model, 3000);
assert.equal(reset.playerId, model.playerId);
assert.equal(Object.keys(reset.metrics).length, 0);
assert.equal(reset.updatedAtMs, 3000);
assert.equal(Object.isFrozen(reset), true);

console.log('adaptive coach: isolated player model, Wilson uncertainty, censored/holdout denominators, selection bias, caps, reset, export, and replay-safe selection pass');
