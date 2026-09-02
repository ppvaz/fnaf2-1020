// Offline player-skill model and adaptive selector for Plan 24 package 4.
//
// This consumer reads only microtrainer session records. It has no access to
// the activity gate, belief reducer, policy, device, or game simulator, so a
// player's score cannot change live safety or game-state truth.

import { stableHash } from '@fnaf2-1020/core/contracts';
import { validateMicrotrainerSession } from './microtrainer.js';

export const ADAPTIVE_SKILL_SCHEMA = 'adaptive-skill-model-v1';
export const ADAPTIVE_SELECTION_SCHEMA = 'adaptive-selection-v1';
export const ADAPTIVE_MODEL_VERSION = 1;
export const DEFAULT_ADAPTIVE_POLICY = Object.freeze({
  policyId: 'weak-state-capped-v1', policyVersion: '1',
  maxRecentPerState: 2, recentWindowMs: 300000, maxSessionPrompts: 20,
  minimumStableSamples: 8,
});

const clone = value => structuredClone(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new TypeError(`adaptive coach: ${message}`); };

function object(name, value) {
  if (!isRecord(value)) fail(`${name} must be an object`);
  return value;
}

function text(name, value, max = 160) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max)
    fail(`${name} must be a non-empty bounded string`);
  return value;
}

function number(name, value, { min = 0, max = Infinity } = {}) {
  if (!finite(value) || value < min || value > max) fail(`${name} is outside its numeric bounds`);
  return value;
}

function integer(name, value) {
  if (!Number.isInteger(value) || value < 0) fail(`${name} must be a non-negative integer`);
  return value;
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function metricKey(kind, stateFamily) {
  return `${text('kind', kind, 32)}:${text('stateFamily', stateFamily, 96)}`;
}

function emptyMetric(kind, stateFamily) {
  return {
    kind, stateFamily, exposures: 0, attempts: 0, correct: 0, censored: 0,
    selectionProbabilitySum: 0, selectionCount: 0, lastAtMs: null,
  };
}

function validateMetric(name, input) {
  const value = object(name, input);
  text(`${name}.kind`, value.kind, 32);
  text(`${name}.stateFamily`, value.stateFamily, 96);
  for (const field of ['exposures', 'attempts', 'correct', 'censored', 'selectionCount'])
    integer(`${name}.${field}`, value[field]);
  if (value.correct > value.attempts) fail(`${name}.correct exceeds attempts`);
  if (value.attempts > value.exposures) fail(`${name}.attempts exceeds exposures`);
  number(`${name}.selectionProbabilitySum`, value.selectionProbabilitySum);
  if (value.selectionProbabilitySum > value.selectionCount)
    fail(`${name}.selectionProbabilitySum exceeds selectionCount`);
  if (value.lastAtMs !== null) number(`${name}.lastAtMs`, value.lastAtMs);
  return value;
}

function validateModel(input) {
  const value = object('model', input);
  if (value.schema !== ADAPTIVE_SKILL_SCHEMA) fail(`model schema must be ${ADAPTIVE_SKILL_SCHEMA}`);
  if (value.version !== ADAPTIVE_MODEL_VERSION) fail('model version is unsupported');
  text('model.playerId', value.playerId, 128);
  text('model.profileId', value.profileId);
  number('model.createdAtMs', value.createdAtMs);
  number('model.updatedAtMs', value.updatedAtMs, { min: value.createdAtMs });
  object('model.metrics', value.metrics);
  for (const [key, metric] of Object.entries(value.metrics)) {
    if (key !== metricKey(metric.kind, metric.stateFamily)) fail(`model metric key ${key} is not canonical`);
    validateMetric(`model.metrics.${key}`, metric);
  }
  object('model.holdout', value.holdout);
  for (const [key, metric] of Object.entries(value.holdout)) {
    if (key !== metricKey(metric.kind, metric.stateFamily)) fail(`model holdout key ${key} is not canonical`);
    validateMetric(`model.holdout.${key}`, metric);
  }
  if (!Array.isArray(value.seenSessionIds) || value.seenSessionIds.some(id => typeof id !== 'string'))
    fail('model.seenSessionIds must be a string array');
  if (new Set(value.seenSessionIds).size !== value.seenSessionIds.length)
    fail('model.seenSessionIds must be unique');
  if (!Array.isArray(value.history) || value.history.some(entry =>
      !isRecord(entry) || typeof entry.stateKey !== 'string' || !finite(entry.atMs)))
    fail('model.history must contain state/timestamp entries');
  return value;
}

export function validateSkillModel(input) {
  return freeze(clone(validateModel(input)));
}

/**
 * Create an isolated player/profile model. Models cannot be merged implicitly.
 * @param {any} options
 */
export function makeSkillModel({ playerId, profileId, createdAtMs = 0 } = {}) {
  text('playerId', playerId, 128);
  text('profileId', profileId);
  number('createdAtMs', createdAtMs);
  return freeze({
    schema: ADAPTIVE_SKILL_SCHEMA, version: ADAPTIVE_MODEL_VERSION,
    playerId, profileId, createdAtMs, updatedAtMs: createdAtMs,
    metrics: {}, holdout: {}, seenSessionIds: [], history: [],
  });
}

function addRecord(metric, record, atMs) {
  metric.exposures += 1;
  metric.lastAtMs = Math.max(metric.lastAtMs ?? 0, atMs);
  const probability = record.scheduler.selectionProbability;
  metric.selectionProbabilitySum += probability;
  metric.selectionCount += 1;
  if (record.grade.status === 'SCORED') {
    metric.attempts += 1;
    if (record.grade.correct) metric.correct += 1;
  } else if (record.grade.status === 'CENSORED') {
    metric.censored += 1;
  } else fail('record grade status is invalid');
}

/** Ingest one validated replay session; holdout records are reported separately and never train. */
export function updateSkillModel(modelInput, sessionInput) {
  const model = validateModel(modelInput);
  const session = validateMicrotrainerSession(sessionInput);
  if (session.session.profileId !== model.profileId) fail('session profile does not match model');
  if (model.seenSessionIds.includes(session.session.sessionId))
    return freeze({ model: clone(model), imported: false, reason: 'session-already-ingested' });
  if (session.session.endedAtMs < model.updatedAtMs)
    fail('sessions must be ingested in non-decreasing time order');

  const metrics = Object.fromEntries(Object.entries(model.metrics).map(([key, metric]) => [key, { ...metric }]));
  const holdout = Object.fromEntries(Object.entries(model.holdout).map(([key, metric]) => [key, { ...metric }]));
  const history = [...model.history];
  let scored = 0, censored = 0, holdoutScored = 0;
  for (const record of session.records) {
    const key = metricKey(record.final.kind, record.final.eligibility.stateFamily);
    const target = record.provenance.split === 'holdout' ? holdout : metrics;
    const metric = target[key] ?? emptyMetric(record.final.kind, record.final.eligibility.stateFamily);
    addRecord(metric, record, record.final.promptAtMs);
    target[key] = metric;
    if (record.provenance.split === 'holdout') {
      if (record.grade.status === 'SCORED') holdoutScored += 1;
    } else {
      history.push({ stateKey: key, atMs: record.final.promptAtMs });
      if (record.grade.status === 'SCORED') scored += 1;
      else censored += 1;
    }
  }
  const next = {
    ...clone(model), metrics, holdout,
    seenSessionIds: [...model.seenSessionIds, session.session.sessionId],
    history: history.slice(-2048), updatedAtMs: session.session.endedAtMs,
  };
  return freeze({
    model: freeze(clone(validateModel(next))), imported: true,
    sessionId: session.session.sessionId, scored, censored, holdoutScored,
  });
}

function wilson(correct, attempts, z = 1.96) {
  if (!attempts) return { lower: null, upper: null, halfWidth: null };
  const p = correct / attempts, z2 = z * z, denominator = 1 + z2 / attempts;
  const center = (p + z2 / (2 * attempts)) / denominator;
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * attempts)) / attempts) / denominator;
  return {
    lower: Math.max(0, center - spread), upper: Math.min(1, center + spread), halfWidth: spread,
  };
}

function reportMetric(metric, minSamples) {
  const interval = wilson(metric.correct, metric.attempts);
  return {
    key: metricKey(metric.kind, metric.stateFamily), kind: metric.kind,
    stateFamily: metric.stateFamily, exposures: metric.exposures,
    denominator: metric.attempts, correct: metric.correct, censored: metric.censored,
    accuracy: metric.attempts ? metric.correct / metric.attempts : null,
    uncertainty95: interval,
    stableWeakest: metric.attempts >= minSamples,
    selectionProbabilityMean: metric.selectionCount
      ? metric.selectionProbabilitySum / metric.selectionCount : null,
    selectionCount: metric.selectionCount, lastAtMs: metric.lastAtMs,
  };
}

/** Report denominators, uncertainty, censoring, and selection bias metadata. */
export function reportSkill(modelInput, { minimumStableSamples = DEFAULT_ADAPTIVE_POLICY.minimumStableSamples } = {}) {
  const model = validateModel(modelInput);
  integer('minimumStableSamples', minimumStableSamples);
  const rows = Object.values(model.metrics).map(metric => reportMetric(metric, minimumStableSamples))
    .sort((a, b) => a.key.localeCompare(b.key));
  const stable = rows.filter(row => row.stableWeakest && row.accuracy !== null)
    .sort((a, b) => a.accuracy - b.accuracy || a.key.localeCompare(b.key));
  return freeze({
    schema: ADAPTIVE_SKILL_SCHEMA, version: model.version, playerId: model.playerId,
    profileId: model.profileId, updatedAtMs: model.updatedAtMs, rows,
    weakestStable: stable[0]?.key ?? null,
    holdout: Object.values(model.holdout).map(metric => reportMetric(metric, minimumStableSamples))
      .sort((a, b) => a.key.localeCompare(b.key)),
  });
}

function validatePolicy(input) {
  const policy = { ...DEFAULT_ADAPTIVE_POLICY, ...(input ?? {}) };
  text('policy.policyId', policy.policyId, 96);
  text('policy.policyVersion', policy.policyVersion, 64);
  integer('policy.maxRecentPerState', policy.maxRecentPerState);
  number('policy.recentWindowMs', policy.recentWindowMs, { min: 1 });
  integer('policy.maxSessionPrompts', policy.maxSessionPrompts);
  integer('policy.minimumStableSamples', policy.minimumStableSamples);
  if (!policy.maxRecentPerState || !policy.maxSessionPrompts) fail('policy caps must be positive');
  return policy;
}

function validateCandidate(candidate, index, profileId) {
  const value = object(`candidate[${index}]`, candidate);
  text(`candidate[${index}].id`, value.id, 128);
  text(`candidate[${index}].kind`, value.kind, 32);
  text(`candidate[${index}].stateFamily`, value.stateFamily, 96);
  text(`candidate[${index}].profileId`, value.profileId);
  if (value.profileId !== profileId) fail(`candidate[${index}] profile does not match model`);
  if (!['calibration', 'practice', 'replay', 'holdout'].includes(value.split))
    fail(`candidate[${index}].split is invalid`);
  return value;
}

function weakness(model, candidate) {
  const metric = model.metrics[metricKey(candidate.kind, candidate.stateFamily)];
  if (!metric || !metric.attempts) return { priority: 1, accuracy: null, attempts: 0 };
  const interval = wilson(metric.correct, metric.attempts);
  return { priority: 1 - (interval.lower ?? metric.correct / metric.attempts),
    accuracy: metric.correct / metric.attempts, attempts: metric.attempts };
}

/**
 * Select a weak state under explicit repetition/session caps and record its probability.
 * @param {any} options
 */
export function selectAdaptiveExercise({ model: modelInput, candidates, nowMs,
  sessionPromptCount = 0, policy: policyInput = null } = {}) {
  const model = validateModel(modelInput);
  if (!Array.isArray(candidates) || candidates.length === 0) fail('candidates are required');
  number('nowMs', nowMs);
  integer('sessionPromptCount', sessionPromptCount);
  const policy = validatePolicy(policyInput);
  if (sessionPromptCount >= policy.maxSessionPrompts)
    fail('adaptive selection refused: session-prompt-cap');
  const recent = new Map();
  for (const entry of model.history) {
    if (entry.atMs >= nowMs - policy.recentWindowMs)
      recent.set(entry.stateKey, (recent.get(entry.stateKey) ?? 0) + 1);
  }
  const excluded = [];
  const available = candidates.map((candidate, index) => validateCandidate(candidate, index, model.profileId))
    .filter(candidate => {
      const key = metricKey(candidate.kind, candidate.stateFamily);
      if (candidate.split === 'holdout') {
        excluded.push({ id: candidate.id, reason: 'holdout-excluded' });
        return false;
      }
      if ((recent.get(key) ?? 0) >= policy.maxRecentPerState) {
        excluded.push({ id: candidate.id, reason: 'recent-state-cap' });
        return false;
      }
      return true;
    });
  if (!available.length) fail('adaptive selection refused: no-candidate-after-caps');
  const ranked = available.map(candidate => ({ candidate, weakness: weakness(model, candidate) }))
    .sort((a, b) => b.weakness.priority - a.weakness.priority || a.candidate.id.localeCompare(b.candidate.id));
  const selected = ranked[0];
  const selection = freeze({
    schema: ADAPTIVE_SELECTION_SCHEMA, policyId: policy.policyId, policyVersion: policy.policyVersion,
    profileId: model.profileId, modelVersion: model.version, selectedExerciseId: selected.candidate.id,
    stateKey: metricKey(selected.candidate.kind, selected.candidate.stateFamily),
    candidateCount: available.length, selectionProbability: 1 / available.length, atMs: nowMs,
    excluded, weakness: selected.weakness,
  });
  return freeze({ candidate: freeze(clone(selected.candidate)), selection });
}

export function validateAdaptiveSelection(input) {
  const value = object('selection', input);
  if (value.schema !== ADAPTIVE_SELECTION_SCHEMA) fail(`selection schema must be ${ADAPTIVE_SELECTION_SCHEMA}`);
  text('selection.policyId', value.policyId, 96);
  text('selection.policyVersion', value.policyVersion, 64);
  text('selection.profileId', value.profileId);
  integer('selection.modelVersion', value.modelVersion);
  text('selection.selectedExerciseId', value.selectedExerciseId, 128);
  text('selection.stateKey', value.stateKey, 128);
  integer('selection.candidateCount', value.candidateCount);
  if (!value.candidateCount) fail('selection.candidateCount must be positive');
  number('selection.selectionProbability', value.selectionProbability, { min: Number.MIN_VALUE, max: 1 });
  number('selection.atMs', value.atMs);
  if (!Array.isArray(value.excluded)) fail('selection.excluded must be an array');
  object('selection.weakness', value.weakness);
  return freeze(clone(value));
}

/** Serialize an isolated model for local export; no cross-player merge is provided. */
export function exportSkillModel(modelInput) {
  const model = validateModel(modelInput);
  return JSON.stringify(model) + '\n';
}

/**
 * Reset produces a new empty model with the same explicit player/profile identity.
 * @param {any} modelInput
 */
export function resetSkillModel(modelInput, createdAtMs = null) {
  const model = validateModel(modelInput);
  return makeSkillModel({ playerId: model.playerId, profileId: model.profileId,
    createdAtMs: createdAtMs ?? model.updatedAtMs });
}

export function skillModelHash(modelInput) {
  return stableHash(validateModel(modelInput));
}
