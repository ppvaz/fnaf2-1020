import assert from 'node:assert/strict';
import {
  MIN_TOUCH_RADIUS_PX,
  THREAT_CONSTELLATION_SCHEMA,
  makeThreatConstellation,
  validateThreatConstellation,
} from '../apps/trainer/src/threat-constellation.js';
import { makeRecognitionExercise, makeReplaySnapshot } from '../apps/trainer/src/microtrainer.js';

const expectThrow = (fn, pattern) => assert.throws(fn, error => !pattern || pattern.test(error.message));
const profileId = 'constellation-profile-v1';
const snapshot = makeReplaySnapshot({
  id: 'constellation-snapshot', sessionId: 'constellation-source', beliefSequence: 4,
  clock: 'host-monotonic-ms', atMs: 100, profileId,
  activityGateVersion: 'activity-gate-v1', factIds: ['before'], stateFamily: 'vent', split: 'practice',
});
const exercise = makeRecognitionExercise({
  id: 'constellation-exercise', snapshot,
  crop: { schema: 'retained-crop-v1', id: 'crop-1', artifactId: 'artifact-1', sha256: 'a'.repeat(64),
    factId: 'after', sessionId: 'constellation-source', profileId, retained: true,
    split: 'practice', label: 'LEFT VENT', labelProvenance: { source: 'operator-label' } },
  choices: ['LEFT VENT', 'RIGHT VENT'],
  scheduler: { policyId: 'constellation-test', policyVersion: '1', selectionProbability: 1 },
}).exercise;
const anchors = [
  { id: 'left', semanticId: 'left-vent', label: 'LEFT VENT', region: 'vent', x: .22, y: .58, radiusPx: 32 },
  { id: 'right', semanticId: 'right-vent', label: 'RIGHT VENT', region: 'vent', x: .78, y: .58, radiusPx: 32 },
  { id: 'office', semanticId: 'office', label: 'OFFICE', region: 'office', x: .50, y: .40, radiusPx: 40 },
];
const layout = makeThreatConstellation({ id: 'constellation-1', exercise, profileId,
  anchors, targetAnchorId: 'left' });
assert.equal(layout.schema, THREAT_CONSTELLATION_SCHEMA);
assert.equal(layout.targetAnchorId, 'left');
assert.equal(layout.sourceArtifact.artifactId, 'artifact-1');
assert.equal(layout.sourceArtifact.profileId, profileId);
assert.equal(layout.gesture.kind, 'tap');
assert.equal(layout.anchors.every(anchor => anchor.radiusPx >= MIN_TOUCH_RADIUS_PX), true);
assert.deepEqual(layout.alternatives, {
  keyboard: true, switch: true, reducedMotion: true, nonColorLabels: true,
  scalableText: true, pointerTelemetryOptional: true,
});
assert.equal(Object.isFrozen(layout), true);
assert.deepEqual(layout, makeThreatConstellation({ id: 'constellation-1', exercise, profileId,
  anchors, targetAnchorId: 'left' }));

const slider = makeThreatConstellation({ id: 'slider', exercise, profileId, anchors,
  targetAnchorId: 'left', gesture: { kind: 'slider', minDurationMs: 200,
    path: [{ x: .22, y: .58 }, { x: .50, y: .40 }, { x: .78, y: .58 }] },
  sequence: [{ anchorId: 'left', atMs: 0, holdMs: 200 }, { anchorId: 'right', atMs: 300, holdMs: 0 }] });
assert.equal(slider.gesture.path.length, 3);
assert.equal(slider.sequence[0].holdMs, 200);
assert.deepEqual(validateThreatConstellation(slider), slider);

expectThrow(() => makeThreatConstellation({ id: 'wrong-profile', exercise, profileId: 'other',
  anchors, targetAnchorId: 'left' }), /profiles do not match/);
expectThrow(() => makeThreatConstellation({ id: 'unknown-target', exercise, profileId,
  anchors, targetAnchorId: 'random' }), /unknown/);
expectThrow(() => makeThreatConstellation({ id: 'tiny', exercise, profileId,
  anchors: [{ ...anchors[0], radiusPx: MIN_TOUCH_RADIUS_PX - 1 }], targetAnchorId: 'left' }), /radiusPx/);
expectThrow(() => validateThreatConstellation({ ...layout, pixels: 'raw-media' }), /not allowed/);
expectThrow(() => makeThreatConstellation({ id: 'random', exercise, profileId,
  anchors, targetAnchorId: 'left', gesture: { kind: 'tap', path: [{ x: .1, y: .1 }, { x: .2, y: .2 }] } }), /cannot carry a path/);

console.log('threat constellation: profile-bound semantic anchors, minimum touch targets, gesture paths, accessibility alternatives, and raw-media refusal pass');
