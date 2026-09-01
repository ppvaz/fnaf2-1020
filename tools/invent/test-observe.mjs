// Plan 05 package 6a gate: every Custom Night observation is tagged, the
// source subset stays inside Plan 17's in-process tuple, and the view exposes
// all eleven characters plus the event wake flags.
import assert from 'node:assert/strict';
import * as C from '@fnaf2-1020/core/mechanics';
import { Sim } from '@fnaf2-1020/core/mechanics';
import {
  CHARACTER_IDS, IN_PROCESS_TUPLE_FIELDS, MODEL_APPROXIMATIONS, MODEL_FIELDS,
  OBSERVATION_SCHEMA, PROVENANCE, observe, validateObservation, view,
} from './observe.mjs';

const sim = new Sim({
  seed: 7,
  night: 7,
  customNight: Object.fromEntries(C.AI_DIALS.map((id) => [id, 20])),
  durationFrames: 500,
});
const initial = view(sim);

assert.equal(CHARACTER_IDS.length, 11);
assert.deepEqual(Object.keys(initial.characters).sort(), [...CHARACTER_IDS].sort());
assert.ok(Object.keys(PROVENANCE).length > 0);
assert.doesNotThrow(() => validateObservation(initial));

// The tagged source set is mechanically checked by validateObservation. Keep
// the public constants asserted too, so deleting one of the tuple anchors is a
// visible test change rather than a silent widening of the policy surface.
assert.ok(IN_PROCESS_TUPLE_FIELDS.includes('camera.marker'));
assert.ok(IN_PROCESS_TUPLE_FIELDS.includes('characters.bb.inside'));
assert.ok(MODEL_APPROXIMATIONS.includes('post-chokepoint routing'));
assert.ok(MODEL_FIELDS.some((field) => field.endsWith('.location')));

// Plan 17 tuple values are represented with their intended source semantics.
assert.equal(initial.frame, 0);
assert.equal(initial.resources.box, C.BOX_UNITS);
assert.equal(initial.camera.viewing, 0);
assert.equal(initial.camera.marker, C.parkedCamera(7));
assert.equal(initial.camera.lastViewed, 0);
assert.equal(initial.mask.state, 0);
assert.equal(initial.mask.ticks.bb, 0);
assert.equal(initial.blackout.active, false);
assert.equal(initial.danger.active, false);
assert.equal(initial.characters.foxy.d, 0);
assert.equal(initial.characters.bb.stage, 0);
assert.equal(initial.characters.bb.inOpening, false);
assert.equal(initial.characters.bb.inside, false);

// Every required per-character field exists, including the fields that are
// intentionally model-only until the rebuilt runtime exposes them.
for (const id of CHARACTER_IDS) {
  const character = initial.characters[id];
  for (const field of ['location', 'stage', 'stunRemaining', 'committedAttack'])
    assert.ok(field in character, `${id}.${field} is missing`);
}

// Event flags are edge flags for the current game frame, not sticky history.
sim.startBlackout('test');
assert.equal(view(sim).eventFlags.blackoutStart, true);
sim.tick();
assert.equal(view(sim).eventFlags.blackoutStart, false);

sim.bb.stage = C.BB_STAGES - 1;
sim.bbEnterOpening();
assert.equal(view(sim).eventFlags.bbOpening, true);
sim.tick();
assert.equal(view(sim).eventFlags.bbOpening, false);

sim.emit('foxy-leave');
assert.equal(view(sim).eventFlags.foxyDeparture, true);

// The tagged wrapper is stable and carries the schema separately from the
// policy state, keeping the interpreter's observation reads free of metadata.
const tagged = observe(sim);
assert.equal(tagged.schema, OBSERVATION_SCHEMA);
assert.strictEqual(tagged.provenance, PROVENANCE);
assert.doesNotThrow(() => validateObservation(tagged.state));

// A newly invented field must be refused unless it also receives a tag.
assert.throws(() => validateObservation({
  ...initial,
  camera: { ...initial.camera, invented: true },
}), /fields and provenance fields differ/);

console.log('observe: eleven characters, tuple boundary, provenance, and event flags pass');
