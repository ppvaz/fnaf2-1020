/** Pure experiment primitives shared by named research cases. */
import { PlantModel, stableHash, validateControlCommand, validateExperiment, validateExperimentResult } from '@fnaf2-1020/core';

export function generateCandidates(spec) {
  validateExperiment(spec);
  const parameters = Array.isArray(spec.candidateParameters) ? spec.candidateParameters : [];
  return Object.freeze(spec.seeds.map((seed, index) => Object.freeze({
    id: `${spec.id}-${index + 1}`, seed,
    parameters: Object.freeze(parameters[index] ? { ...parameters[index] } : {}),
  })));
}

export function evaluateModelCandidate(spec, candidate) {
  const model = new PlantModel({ seed: candidate.seed, night: spec.night ?? 7,
    durationFrames: spec.durationFrames ?? 60, lethal: spec.lethal ?? false });
  const defaults = [
    { at: 0, action: { kind: 'press', control: 'monitor' } },
    { at: 12, action: { kind: 'select', control: 'cam:10' } },
  ];
  const rows = spec.commands ?? defaults;
  const explicit = candidate.parameters.commandAtFrames;
  const offset = Number.isInteger(candidate.parameters.offsetFrames) ? candidate.parameters.offsetFrames : 0;
  let at = model.frame;
  for (const [index, row] of rows.entries()) {
    const requestedAt = Number.isInteger(explicit?.[index]) ? explicit[index] : row.at;
    const frame = Math.max(at, requestedAt + offset);
    if (frame > model.frame) model.advance(frame);
    if (!model.alive) break;
    const command = validateControlCommand({
      schema: 'control-command-v1', id: `${candidate.id}-command-${index + 1}`,
      action: { ...row.action }, requestedAt: { clock: 'game-frame', value: frame },
      source: { controller: spec.id, policyHash: stableHash(candidate.parameters) },
    });
    model.apply(command);
    at = frame;
  }
  model.advance(spec.durationFrames ?? 60);
  return {
    candidateId: candidate.id,
    seed: candidate.seed,
    parameters: candidate.parameters,
    traceHash: stableHash(model.events),
    terminal: model.terminalState(),
    eventCount: model.events.length,
  };
}

export function aggregateExperiment(spec, evaluations) {
  const result = {
    schema: 'experiment-result-v1', operation: spec.operation, verdict: 'MODEL_ONLY',
    outcome: 'COMPLETED', modelHash: spec.modelHash, specHash: stableHash(spec),
    sample: { firstSeed: spec.seeds[0], count: evaluations.length, seeds: evaluations.map(item => item.seed) },
    evaluations, claimLevel: spec.claimLevel,
    profile: spec.profile ?? 'simulator-fixture',
    reproducer: { case: spec.id, command: `npm run research -- ${spec.id}`, seeds: [...spec.seeds] },
  };
  return validateExperimentResult(result);
}

export function runModelExperiment(spec) {
  const candidates = generateCandidates(spec);
  return aggregateExperiment(spec, candidates.map(candidate => evaluateModelCandidate(spec, candidate)));
}

export function makeResultPayload(evaluation, evidenceId) {
  return {
    ...evaluation,
    evidenceId,
    terminal: evaluation.evaluations[0]?.terminal,
    eventCount: evaluation.evaluations.reduce((sum, item) => sum + item.eventCount, 0),
  };
}

/** Rebuild the exact result payload used by the CLI without mutating artifacts. */
export function replayModelResult(spec, result) {
  if (!result || typeof result.evidenceId !== 'string') throw new TypeError('replay needs an evidence id');
  const evaluation = runModelExperiment(spec);
  const payload = makeResultPayload(evaluation, result.evidenceId);
  return { evaluation, payload, resultHash: stableHash(payload) };
}
