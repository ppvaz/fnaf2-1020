/**
 * Runtime validators and immutable plain-data contracts for core boundaries.
 * This module has no Node, DOM, filesystem, subprocess, network, or wall-clock
 * dependency. CONTRACT:semantic-control-v1 CONTRACT:measurement-v1.
 */

export const CONTRACTS = Object.freeze([
  'plant-model-v1', 'semantic-control-v1', 'policy-program-v1', 'controller-v1',
  'trajectory-v1', 'qualification-v1', 'raw-sample-v1', 'measurement-v1',
  'detector-v1', 'state-estimate-v1', 'supervisor-v1', 'clock-v1',
  'actuator-v1', 'capability-v1', 'calibration-v1', 'device-profile-v1',
  'telemetry-event-v1', 'session-manifest-v1', 'experiment-spec-v1',
  'experiment-result-v1', 'winner-v1', 'device-bundle-v1', 'trainer-trace-v1', 'artifact-ref-v1',
  'claim-evidence-v1', 'screencheck-process-v1', 'cue-helper-control-v1',
  'fact-message-v1', 'pcm-udp-v1', 'hid-executor-v1', 'device-executor-v1',
]);

export const CLOCKS = Object.freeze([
  'game-frame', 'simulator-frame', 'device-monotonic-ms',
  'host-monotonic-ms', 'audio-sample',
]);

export const CONTROL_KINDS = Object.freeze(['press', 'release', 'hold', 'select']);
export const ACTUATION_STATUSES = Object.freeze([
  'REQUESTED', 'SENT', 'ACCEPTED', 'VERIFIED', 'REJECTED', 'FAILED', 'UNKNOWN',
]);
export const CLAIM_LEVELS = Object.freeze(['MODEL_ONLY', 'FIXTURE', 'DEVICE_MEASURED']);

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const requiredString = (value, label) => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256)
    throw new TypeError(`${label} must be a non-empty bounded string`);
  return value;
};
const fail = message => { throw new TypeError(`contract: ${message}`); };

export function validateClockRef(value, label = 'clock') {
  if (!isRecord(value) || !CLOCKS.includes(value.clock) || !finite(value.value) || value.value < 0)
    fail(`${label} must name a non-negative value in a declared clock domain`);
  return Object.freeze({ clock: value.clock, value: value.value });
}

function validateControl(control) {
  if (typeof control !== 'string' ||
      !(['mask', 'monitor', 'light', 'wind', 'ventL', 'ventR'].includes(control) ||
       /^cam:(?:[0-9]|1[0-2])$/.test(control)))
    fail('action.control must be semantic and must not contain coordinates or transport text');
  return control;
}

export function validateControlCommand(input) {
  if (!isRecord(input) || input.schema !== 'control-command-v1') fail('control command schema mismatch');
  requiredString(input.id, 'command id');
  if (!isRecord(input.action) || !CONTROL_KINDS.includes(input.action.kind)) fail('control action kind is invalid');
  validateControl(input.action.control);
  validateClockRef(input.requestedAt, 'requestedAt');
  if (input.deadline !== undefined) validateClockRef(input.deadline, 'deadline');
  if (!isRecord(input.source)) fail('command source is required');
  requiredString(input.source.controller, 'command source controller');
  if (input.source.policyHash !== undefined) requiredString(input.source.policyHash, 'policy hash');
  const forbidden = ['x', 'y', 'coordinates', 'shell', 'adb', 'hid', 'bytes'];
  if (forbidden.some(key => Object.hasOwn(input, key) || Object.hasOwn(input.action, key)))
    fail('physical encoding is not allowed in core commands');
  return input;
}

export function validateMeasurement(input) {
  if (!isRecord(input) || input.schema !== 'measurement-v1') fail('measurement schema mismatch');
  requiredString(input.id, 'measurement id');
  requiredString(input.signal, 'measurement signal');
  if (input.state !== 'OBSERVED' && input.state !== 'UNKNOWN') fail('measurement state is invalid');
  if (input.state === 'UNKNOWN') {
    if (Object.hasOwn(input, 'value') || typeof input.reason !== 'string' || input.reason.length === 0)
      fail('UNKNOWN measurement requires a reason and has no value');
  } else if (!Object.hasOwn(input, 'value')) fail('OBSERVED measurement requires a value');
  if (!finite(input.confidence) || input.confidence < 0 || input.confidence > 1)
    fail('measurement confidence must be between 0 and 1');
  validateClockRef(input.observedAt, 'observedAt');
  validateClockRef(input.receivedAt, 'receivedAt');
  if (input.validUntil !== undefined) validateClockRef(input.validUntil, 'validUntil');
  if (!isRecord(input.source)) fail('measurement provenance is required');
  return input;
}

export function validateActuationResult(input) {
  if (!isRecord(input) || input.schema !== 'actuation-result-v1') fail('actuation result schema mismatch');
  requiredString(input.commandId, 'command id');
  if (!ACTUATION_STATUSES.includes(input.status)) fail('actuation status is invalid');
  requiredString(input.backend, 'actuation backend');
  if (input.sentAt !== undefined) validateClockRef(input.sentAt, 'sentAt');
  if (input.verifiedAt !== undefined && input.verifiedAt !== null) validateClockRef(input.verifiedAt, 'verifiedAt');
  if (!finite(input.uncertaintyMs) || input.uncertaintyMs < 0) fail('uncertaintyMs is invalid');
  return input;
}

export function validateCapability(input) {
  if (!isRecord(input) || input.schema !== 'capability-v1') fail('capability schema mismatch');
  requiredString(input.adapter, 'adapter');
  if (!Array.isArray(input.actions) || input.actions.some(action => !CONTROL_KINDS.includes(action))) fail('capability actions are invalid');
  if (!Array.isArray(input.controls) || input.controls.some(control => typeof control !== 'string')) fail('capability controls are invalid');
  if (!CLOCKS.includes(input.clock) || !['none', 'external', 'internal'].includes(input.verification)) fail('capability timing or verification is invalid');
  if (!CLAIM_LEVELS.includes(input.claimLevel)) fail('capability claim level is invalid');
  if (!Array.isArray(input.limitations)) fail('capability limitations are required');
  return input;
}

export function validateProfile(input) {
  if (!isRecord(input) || input.schema !== 'device-profile-v1') fail('profile schema mismatch');
  for (const field of ['id', 'targetBuild', 'actuator', 'visualSensor', 'visualDetector']) requiredString(input[field], `profile ${field}`);
  if (!CLOCKS.includes(input.clock)) fail('profile clock is not declared');
  if (!isRecord(input.calibrations)) fail('profile calibrations are required');
  return input;
}

export function validateRawSample(input) {
  if (!isRecord(input) || input.schema !== 'raw-sample-v1' || typeof input.id !== 'string' ||
      typeof input.format !== 'string' || !isRecord(input.acquisition) ||
      !isRecord(input.dimensions) || !finite(input.dimensions.width) || !finite(input.dimensions.height) ||
      input.dimensions.width <= 0 || input.dimensions.height <= 0 || !finite(input.rate) || input.rate <= 0 ||
      !isRecord(input.source) || !isRecord(input.calibration) ||
      typeof input.source.sensor !== 'string' || typeof input.calibration.profile !== 'string') fail('raw sample is incomplete');
  validateClockRef({ clock: input.acquisition.clock, value: input.acquisition.at }, 'raw sample acquisition');
  return input;
}

export function validateStateEstimate(input) {
  if (!isRecord(input) || input.schema !== 'state-estimate-v1' || typeof input.id !== 'string' ||
      !isRecord(input.at) || !isRecord(input.values)) fail('state estimate is incomplete');
  validateClockRef(input.at, 'state estimate at');
  return input;
}

export function validateCalibration(input) {
  if (!isRecord(input) || input.schema !== 'calibration-v1' || typeof input.id !== 'string' ||
      typeof input.device !== 'string' || typeof input.implementationHash !== 'string' ||
      !isRecord(input.uncertainty) || typeof input.validUntil !== 'string') fail('calibration is incomplete');
  return input;
}

export function validateExperiment(input) {
  if (!isRecord(input) || input.schema !== 'experiment-spec-v1' || typeof input.id !== 'string' ||
      typeof input.operation !== 'string' || typeof input.modelHash !== 'string' ||
      !Array.isArray(input.seeds) || !isRecord(input.sample) || typeof input.claimLevel !== 'string') fail('experiment spec is incomplete');
  return input;
}

export function validateExperimentResult(input) {
  if (!isRecord(input) || input.schema !== 'experiment-result-v1' || typeof input.operation !== 'string' ||
      typeof input.verdict !== 'string' || typeof input.modelHash !== 'string' || typeof input.specHash !== 'string' || !isRecord(input.sample) ||
      typeof input.claimLevel !== 'string') fail('experiment result is incomplete');
  return input;
}

export function validateArtifactRef(input) {
  if (!isRecord(input) || input.schema !== 'artifact-ref-v1' || typeof input.hash !== 'string' ||
      typeof input.mediaType !== 'string' || typeof input.producer !== 'string' ||
      typeof input.size !== 'number' || input.size < 0) fail('artifact reference is incomplete');
  return input;
}

export function validateClaimEvidence(input) {
  if (!isRecord(input) || input.schema !== 'claim-evidence-v1' || typeof input.id !== 'string' ||
      !Array.isArray(input.nodes) || !Array.isArray(input.edges)) fail('claim/evidence graph is incomplete');
  return input;
}

export function canonicalJson(value) {
  const sort = current => {
    if (Array.isArray(current)) return current.map(sort);
    if (!isRecord(current)) return current;
    return Object.fromEntries(Object.keys(current).sort().map(key => [key, sort(current[key])]));
  };
  return JSON.stringify(sort(value)) + '\n';
}

export function stableHash(value) {
  const text = typeof value === 'string' ? value : canonicalJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
