// Profile-bound Threat Constellation layout boundary for Plan 24 P3C.
//
// Spatial meaning belongs to the calibrated profile, never to a random seed.
// This record describes hit targets and optional gestures for a retained
// exercise; it carries artifact references only and never raw pixels or live
// belief state.

import { validateExercise } from '@fnaf2-1020/core/training';

export const THREAT_CONSTELLATION_SCHEMA = 'threat-constellation-layout-v1';
export const THREAT_CONSTELLATION_RENDERER_ID = 'threat-constellation';
export const THREAT_CONSTELLATION_GESTURES = Object.freeze(['tap', 'hold', 'slider']);
export const MIN_TOUCH_RADIUS_PX = 24;

const clone = value => structuredClone(value);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new TypeError(`threat constellation: ${message}`); };

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

function validateAnchor(anchor, index, profileId) {
  object(`anchors[${index}]`, anchor);
  exact(`anchors[${index}]`, anchor, ['id', 'semanticId', 'label', 'region', 'profileId', 'x', 'y', 'radiusPx']);
  text(`anchors[${index}].id`, anchor.id);
  text(`anchors[${index}].semanticId`, anchor.semanticId);
  text(`anchors[${index}].label`, anchor.label, 96);
  text(`anchors[${index}].region`, anchor.region, 64);
  text(`anchors[${index}].profileId`, anchor.profileId);
  if (anchor.profileId !== profileId) fail(`anchors[${index}] is bound to another profile`);
  number(`anchors[${index}].x`, anchor.x, { min: 0, max: 1 });
  number(`anchors[${index}].y`, anchor.y, { min: 0, max: 1 });
  number(`anchors[${index}].radiusPx`, anchor.radiusPx, { min: MIN_TOUCH_RADIUS_PX, max: 512 });
  return anchor;
}

function validateSequence(sequence, anchors, gesture) {
  if (!Array.isArray(sequence) || sequence.length === 0 || sequence.length > 64)
    fail('sequence must be a non-empty bounded array');
  const anchorIds = new Set(anchors.map(anchor => anchor.id));
  let previousAtMs = -Infinity;
  return sequence.map((step, index) => {
    object(`sequence[${index}]`, step);
    exact(`sequence[${index}]`, step, ['anchorId', 'atMs', 'holdMs']);
    text(`sequence[${index}].anchorId`, step.anchorId);
    if (!anchorIds.has(step.anchorId)) fail(`sequence[${index}] targets an unknown anchor`);
    number(`sequence[${index}].atMs`, step.atMs, { min: 0 });
    if (step.atMs < previousAtMs) fail('sequence timestamps must be ordered');
    previousAtMs = step.atMs;
    const holdMs = step.holdMs === undefined ? 0 : number(
      `sequence[${index}].holdMs`, step.holdMs, { min: 0, max: 60_000 });
    if (gesture === 'tap' && holdMs !== 0) fail('tap sequence cannot contain a hold');
    if (gesture === 'hold' && holdMs < 100) fail('hold gesture requires at least 100ms');
    return { anchorId: step.anchorId, atMs: step.atMs, holdMs };
  });
}

function validatePath(path) {
  if (!Array.isArray(path) || path.length < 2 || path.length > 128)
    fail('slider path must contain 2-128 points');
  return path.map((point, index) => {
    object(`gesture.path[${index}]`, point);
    exact(`gesture.path[${index}]`, point, ['x', 'y']);
    return { x: number(`gesture.path[${index}].x`, point.x, { min: 0, max: 1 }),
      y: number(`gesture.path[${index}].y`, point.y, { min: 0, max: 1 }) };
  });
}

function validateGesture(gesture) {
  object('gesture', gesture);
  exact('gesture', gesture, ['kind', 'path', 'minDurationMs']);
  if (!THREAT_CONSTELLATION_GESTURES.includes(gesture.kind)) fail('gesture.kind is unsupported');
  if (gesture.kind === 'slider') {
    if (gesture.minDurationMs !== undefined) number('gesture.minDurationMs', gesture.minDurationMs, { min: 0, max: 60_000 });
    return { kind: gesture.kind, path: validatePath(gesture.path), minDurationMs: gesture.minDurationMs ?? 0 };
  }
  if (gesture.path !== undefined && gesture.path !== null) fail('tap/hold gestures cannot carry a path');
  if (gesture.minDurationMs !== undefined) number('gesture.minDurationMs', gesture.minDurationMs, { min: 0, max: 60_000 });
  return { kind: gesture.kind, path: null, minDurationMs: gesture.minDurationMs ?? 0 };
}

function validateAlternatives(value) {
  object('alternatives', value);
  exact('alternatives', value, ['keyboard', 'switch', 'reducedMotion', 'nonColorLabels', 'scalableText', 'pointerTelemetryOptional']);
  for (const key of ['keyboard', 'switch', 'reducedMotion', 'nonColorLabels', 'scalableText', 'pointerTelemetryOptional'])
    if (value[key] !== true) fail(`alternatives.${key} is required`);
  return value;
}

function validateLayout(input) {
  const value = object('layout', input);
  exact('layout', value, ['schema', 'id', 'exerciseId', 'rendererId', 'profileId', 'anchors',
    'targetAnchorId', 'sequence', 'gesture', 'alternatives', 'sourceArtifact']);
  if (value.schema !== THREAT_CONSTELLATION_SCHEMA) fail(`schema must be ${THREAT_CONSTELLATION_SCHEMA}`);
  text('layout.id', value.id);
  text('layout.exerciseId', value.exerciseId);
  if (value.rendererId !== THREAT_CONSTELLATION_RENDERER_ID) fail('rendererId is not threat-constellation');
  text('layout.profileId', value.profileId);
  if (!Array.isArray(value.anchors) || value.anchors.length === 0 || value.anchors.length > 128)
    fail('layout.anchors must be a non-empty bounded array');
  const ids = new Set(), semanticIds = new Set();
  for (const [index, anchor] of value.anchors.entries()) {
    validateAnchor(anchor, index, value.profileId);
    if (ids.has(anchor.id)) fail('anchor IDs must be unique');
    if (semanticIds.has(anchor.semanticId)) fail('semantic anchor IDs must be unique');
    ids.add(anchor.id); semanticIds.add(anchor.semanticId);
  }
  text('targetAnchorId', value.targetAnchorId);
  if (!ids.has(value.targetAnchorId)) fail('targetAnchorId is unknown');
  const sequence = validateSequence(value.sequence, value.anchors, value.gesture.kind);
  const gesture = validateGesture(value.gesture);
  validateAlternatives(value.alternatives);
  if (value.sourceArtifact !== null) {
    object('sourceArtifact', value.sourceArtifact);
    exact('sourceArtifact', value.sourceArtifact, ['artifactId', 'sha256', 'profileId', 'split']);
    text('sourceArtifact.artifactId', value.sourceArtifact.artifactId);
    text('sourceArtifact.sha256', value.sourceArtifact.sha256, 128);
    text('sourceArtifact.profileId', value.sourceArtifact.profileId);
    if (value.sourceArtifact.profileId !== value.profileId) fail('source artifact profile mismatch');
    text('sourceArtifact.split', value.sourceArtifact.split, 32);
  }
  return { ...value, anchors: value.anchors, sequence, gesture };
}

/** Validate and freeze a profile-bound spatial layout. */
export function validateThreatConstellation(input) {
  return freeze(clone(validateLayout(input)));
}

/**
 * Build a spatial recognition layout. Coordinates are profile-relative and
 * semantic IDs remain fixed; a seed/randomizer is intentionally not accepted.
 * @param {any} options
 */
export function makeThreatConstellation({ id, exercise: exerciseInput, profileId,
  anchors, targetAnchorId, sequence = null, gesture = { kind: 'tap' },
  alternatives = {
    keyboard: true, switch: true, reducedMotion: true, nonColorLabels: true,
    scalableText: true, pointerTelemetryOptional: true,
  } } = {}) {
  text('id', id);
  const exercise = validateExercise(exerciseInput);
  if (exercise.kind !== 'recognition') fail('Threat Constellation starts with recognition exercises');
  text('profileId', profileId);
  if (exercise.eligibility.profileId !== profileId) fail('exercise and layout profiles do not match');
  if (!Array.isArray(anchors) || anchors.length === 0) fail('anchors are required');
  const normalizedAnchors = anchors.map((anchor, index) => validateAnchor({ ...anchor, profileId }, index, profileId));
  const crop = exercise.eligibility.sourceCrop;
  const sourceArtifact = crop ? {
    artifactId: crop.artifactId, sha256: crop.sha256, profileId: crop.profileId, split: crop.split,
  } : null;
  const normalizedGesture = validateGesture(gesture);
  const normalizedSequence = sequence ?? [{ anchorId: targetAnchorId, atMs: 0,
    holdMs: normalizedGesture.kind === 'hold' ? Math.max(100, normalizedGesture.minDurationMs) : 0 }];
  return validateThreatConstellation({
    schema: THREAT_CONSTELLATION_SCHEMA, id, exerciseId: exercise.id,
    rendererId: THREAT_CONSTELLATION_RENDERER_ID, profileId,
    anchors: normalizedAnchors, targetAnchorId, sequence: normalizedSequence,
    gesture: normalizedGesture, alternatives, sourceArtifact,
  });
}
