/** Runtime-owned retained data contracts. */
import { validateClockRef, stableHash } from '@fnaf2-1020/core/contracts';

export function validateQualification(value) {
  if (!value || value.schema !== 'qualification-v1' || typeof value.policyHash !== 'string' ||
      typeof value.modelHash !== 'string' || !Number.isInteger(value.sampleCount) || value.sampleCount < 1 ||
      !['PASS', 'FAIL', 'INCONCLUSIVE'].includes(value.verdict))
    throw new TypeError('qualification is incomplete');
  return value;
}

export function validateTelemetry(value) {
  if (!value || value.schema !== 'telemetry-event-v1' || typeof value.sessionId !== 'string' ||
      typeof value.type !== 'string' || typeof value.component !== 'string')
    throw new TypeError('telemetry event is incomplete');
  validateClockRef(value.at);
  return value;
}

export function validateManifest(value) {
  if (!value || value.schema !== 'session-manifest-v1' || typeof value.id !== 'string' ||
      typeof value.profileHash !== 'string' || typeof value.targetBuild !== 'string' ||
      !Array.isArray(value.events) || !value.artifacts || typeof value.artifacts !== 'object')
    throw new TypeError('session manifest is incomplete');
  for (const event of value.events) validateTelemetry(event);
  return value;
}

export function makeEvent(sessionId, type, component, at, data = {}) {
  const event = { schema: 'telemetry-event-v1', sessionId, type, component, at, data };
  return validateTelemetry(event);
}

export function makeManifest({ id, profile, profileHash, modelHash, policyHash, events = [], artifacts = {}, outcome = 'IN_PROGRESS' }) {
  const manifest = {
    schema: 'session-manifest-v1', version: 1, id, targetBuild: profile.targetBuild,
    profile: profile.id, profileHash, modelHash, policyHash, events, artifacts,
    outcome, redaction: { media: 'none', secrets: 'excluded' },
    manifestHash: stableHash({ id, profileHash, modelHash, policyHash, events, artifacts }),
  };
  return validateManifest(manifest);
}
