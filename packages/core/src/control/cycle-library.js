// Finite reviewed cycle primitives and their fail-closed gate (Plan 20 P4).
//
// A primitive is data, not a callback. The reduced model checks local engine
// locks and animation windows; an explicit exactGate callback must additionally
// attest that the primitive was replayed through the exact engine. Keeping
// those two checks separate prevents a controller-visible approximation from
// being mistaken for a survival proof.
import * as C from '../mechanics/config.js';
import { REDUCED_SCHEMA, advanceReduced, applyReduced } from '../mechanics/reduced-model.js';

export const CYCLE_SCHEMA = 'cycle-v1';
export const DEVICE_CONSTRAINTS = Object.freeze({
  // The g56 runner's accepted contact floor and released Fusion poll are
  // measured device constraints; callers may provide a stricter profile.
  minContactMs: 33,
  minReleasedMs: 33,
});

const clone = value => structuredClone(value);
const ACTIONS = new Set(['monitor', 'mask', 'cam:9', 'cam:11', 'ventL', 'ventR',
  'light', 'wind']);
const CONTROL_FIELDS = new Set(['monitor', 'maskOn', 'viewedCamera', 'winding',
  'lightHeld', 'ventLightL', 'ventLightR']);
const finiteInt = value => Number.isInteger(value) && value >= 0;

function fail(message) { throw new TypeError(`cycle: ${message}`); }

function stateField(state, field) {
  if (field.startsWith('controlUnknown.'))
    return state.controlUnknown[field.slice('controlUnknown.'.length)];
  if (field.startsWith('hazards.'))
    return state.hazards[field.slice('hazards.'.length)]?.state;
  if (CONTROL_FIELDS.has(field)) {
    if (field === 'monitor') return state.monitor === 'up' ? 'up' : state.monitor;
    return state[field];
  }
  return undefined;
}

function checkExpected(state, expected, label) {
  for (const [field, value] of Object.entries(expected ?? {})) {
    if (stateField(state, field) !== value)
      return `${label}:${field} expected ${JSON.stringify(value)}, got ${JSON.stringify(stateField(state, field))}`;
  }
  return null;
}

function validateAction(action, index) {
  if (!action || typeof action !== 'object' || Array.isArray(action))
    fail(`action ${index} is not an object`);
  if (!finiteInt(action.atFrame)) fail(`action ${index} needs a non-negative atFrame`);
  if (action.kind !== 'press' && action.kind !== 'release')
    fail(`action ${index} has invalid kind`);
  if (!ACTIONS.has(action.action)) fail(`action ${index} is unsupported`);
  if (action.contactMs !== undefined &&
      (!Number.isFinite(action.contactMs) || action.contactMs <= 0))
    fail(`action ${index} has invalid contactMs`);
}

export function validateCycle(cycle) {
  if (!cycle || cycle.schema !== CYCLE_SCHEMA || typeof cycle.id !== 'string')
    fail('schema or id is invalid');
  if (!finiteInt(cycle.durationFrames) || cycle.durationFrames <= 0)
    fail('durationFrames must be positive');
  if (!Array.isArray(cycle.prerequisites) || !Array.isArray(cycle.actions) ||
      !Array.isArray(cycle.verifications)) fail('cycle arrays are incomplete');
  if (!cycle.proof || cycle.proof.exactEngineRequired !== true)
    fail('proof.exactEngineRequired must be true');
  for (const [index, action] of cycle.actions.entries()) {
    validateAction(action, index);
    if (action.atFrame > cycle.durationFrames)
      fail(`action ${index} escapes durationFrames`);
  }
  for (let i = 1; i < cycle.actions.length; i++) {
    if (cycle.actions[i].atFrame < cycle.actions[i - 1].atFrame)
      fail('actions are not ordered by frame');
  }
  for (const [index, verification] of cycle.verifications.entries()) {
    if (!finiteInt(verification.atFrame) || verification.atFrame > cycle.durationFrames ||
        !verification.fields || typeof verification.fields !== 'object')
      fail(`verification ${index} is invalid`);
  }
  if (!cycle.cost || typeof cycle.cost !== 'object' ||
      !Array.isArray(cycle.hazardCoverage)) fail('cost/hazard coverage is incomplete');
  return cycle;
}

function primitive({ id, durationFrames, prerequisites, actions, verifications,
  cost, hazardCoverage }) {
  return Object.freeze({
    schema: CYCLE_SCHEMA, id, durationFrames,
    prerequisites: Object.freeze(prerequisites.map(clone)),
    actions: Object.freeze(actions.map(clone)),
    verifications: Object.freeze(verifications.map(clone)),
    cost: Object.freeze(clone(cost)), hazardCoverage: Object.freeze([...hazardCoverage]),
    proof: Object.freeze({ exactEngineRequired: true }),
  });
}

// These are intentionally conservative primitives, not complete strategies.
// They cover reviewed monitor/mask/wind/hall building blocks and leave
// route-specific branches to a later selector package.
export const CYCLE_LIBRARY = Object.freeze([
  primitive({
    id: 'wind-and-anchor', durationFrames: C.s(5),
    prerequisites: [
      { field: 'monitor', equals: 'up' },
      { field: 'maskOn', equals: false },
      { field: 'viewedCamera', equals: C.BOX_CAM },
      { field: 'controlUnknown.monitor', equals: false },
      { field: 'controlUnknown.mask', equals: false },
    ],
    actions: [
      { atFrame: 0, kind: 'press', action: 'wind', contactMs: 33 },
      { atFrame: C.s(4.5), kind: 'release', action: 'wind' },
    ],
    verifications: [{ atFrame: C.s(4.5), fields: { winding: false } }],
    cost: { presses: 1, heldFrames: C.s(4.5), maskFrames: 0, powerFrames: 0 },
    hazardCoverage: ['clock-anchor'],
  }),
  primitive({
    id: 'defensive-mask', durationFrames: C.MASK_ANIM_ON + C.s(5),
    prerequisites: [
      { field: 'monitor', equals: 'down' },
      { field: 'maskOn', equals: false },
      { field: 'controlUnknown.monitor', equals: false },
      { field: 'controlUnknown.mask', equals: false },
    ],
    actions: [{ atFrame: 0, kind: 'press', action: 'mask', contactMs: 33 }],
    verifications: [{ atFrame: C.MASK_ANIM_ON, fields: { maskOn: true } }],
    cost: { presses: 1, heldFrames: 0, maskFrames: C.s(5), powerFrames: 0 },
    hazardCoverage: ['visible-office-threat', 'blackout'],
  }),
  primitive({
    id: 'observe-and-hold', durationFrames: C.s(1),
    prerequisites: [
      { field: 'controlUnknown.monitor', equals: false },
      { field: 'controlUnknown.mask', equals: false },
    ],
    actions: [],
    verifications: [],
    cost: { presses: 0, heldFrames: 0, maskFrames: 0, powerFrames: 0 },
    hazardCoverage: [],
  }),
  primitive({
    id: 'foxy-hall-reset', durationFrames: C.s(1),
    prerequisites: [
      { field: 'monitor', equals: 'down' },
      { field: 'maskOn', equals: false },
      { field: 'controlUnknown.monitor', equals: false },
      { field: 'controlUnknown.mask', equals: false },
    ],
    actions: [
      { atFrame: 0, kind: 'press', action: 'light', contactMs: 33 },
      { atFrame: C.s(0.55), kind: 'release', action: 'light' },
    ],
    verifications: [{ atFrame: C.s(0.55), fields: { lightHeld: false } }],
    cost: { presses: 1, heldFrames: C.s(0.55), maskFrames: 0, powerFrames: C.s(0.55) },
    hazardCoverage: ['foxy-reset'],
  }),
  primitive({
    id: 'verify-and-resume', durationFrames: C.MONITOR_ANIM_UP + 1,
    prerequisites: [
      { field: 'monitor', equals: 'down' },
      { field: 'maskOn', equals: false },
      { field: 'controlUnknown.monitor', equals: false },
      { field: 'controlUnknown.mask', equals: false },
    ],
    actions: [{ atFrame: 0, kind: 'press', action: 'monitor', contactMs: 33 }],
    verifications: [{ atFrame: C.MONITOR_ANIM_UP, fields: { monitor: 'up' } }],
    cost: { presses: 1, heldFrames: 0, maskFrames: 0, powerFrames: 0 },
    hazardCoverage: ['control-verification'],
  }),
  // The three primitives below exist because the library was not closed under
  // its own prerequisites. `wind-and-anchor` demands monitor-up on the box
  // camera, and nothing could establish either; measured 2026-09-02, a Night 1
  // controller driven cycle by cycle selected `observe-and-hold` 241 times and
  // died `death=puppet` at ~4 AM. These add no new timing: every duration is an
  // existing sourced animation constant, and each is one engine-legal tap.
  primitive({
    id: 'select-box-cam', durationFrames: 2,
    prerequisites: [
      { field: 'monitor', equals: 'up' },
      { field: 'maskOn', equals: false },
      { field: 'controlUnknown.monitor', equals: false },
      { field: 'controlUnknown.mask', equals: false },
    ],
    actions: [{ atFrame: 0, kind: 'press', action: `cam:${C.BOX_CAM}`, contactMs: 33 }],
    verifications: [{ atFrame: 0, fields: { viewedCamera: C.BOX_CAM } }],
    cost: { presses: 1, heldFrames: 0, maskFrames: 0, powerFrames: 0 },
    hazardCoverage: ['box-access'],
  }),
  // Lowering clears viewedCamera and winding in the engine; that is the point
  // of a separate primitive rather than a tail on the wind cycle.
  primitive({
    id: 'lower-monitor', durationFrames: C.MONITOR_ANIM_DOWN + 1,
    prerequisites: [
      { field: 'monitor', equals: 'up' },
      { field: 'maskOn', equals: false },
      { field: 'controlUnknown.monitor', equals: false },
      { field: 'controlUnknown.mask', equals: false },
    ],
    actions: [{ atFrame: 0, kind: 'press', action: 'monitor', contactMs: 33 }],
    verifications: [{ atFrame: C.MONITOR_ANIM_DOWN, fields: { monitor: 'down' } }],
    cost: { presses: 1, heldFrames: 0, maskFrames: 0, powerFrames: 0 },
    hazardCoverage: ['office-access'],
  }),
  // While the mask is on or animating the engine accepts no other action, so
  // without this the defensive mask is a terminal state for the controller.
  primitive({
    id: 'unmask', durationFrames: C.MASK_ANIM_OFF + 1,
    prerequisites: [
      { field: 'maskOn', equals: true },
      { field: 'controlUnknown.mask', equals: false },
    ],
    actions: [{ atFrame: 0, kind: 'press', action: 'mask', contactMs: 33 }],
    verifications: [{ atFrame: C.MASK_ANIM_OFF, fields: { maskOn: false } }],
    cost: { presses: 1, heldFrames: 0, maskFrames: 0, powerFrames: 0 },
    hazardCoverage: ['mask-release'],
  }),
]);

for (const cycle of CYCLE_LIBRARY) validateCycle(cycle);

export function getCycle(id) {
  const found = CYCLE_LIBRARY.find(cycle => cycle.id === id);
  return found ? clone(found) : null;
}

function gateContact(actions, constraints, reasons) {
  const minContact = constraints.minContactMs;
  const minReleased = constraints.minReleasedMs;
  let lastPress = null;
  let lastRelease = null;
  for (const action of actions) {
    if (action.kind === 'press') {
      if (minContact !== undefined && (action.contactMs ?? 0) < minContact)
        reasons.push(`contact-floor:${action.action}:${action.contactMs ?? 0}<${minContact}`);
      if (lastPress && lastRelease === null && lastPress.action !== action.action)
        reasons.push(`missing-release:${lastPress.action}->${action.action}`);
      if (lastRelease !== null && minReleased !== undefined &&
          (action.atFrame - lastRelease) * 1000 / C.FPS < minReleased)
        reasons.push(`released-gap:${action.action}`);
      lastPress = action;
      lastRelease = null;
    } else if (lastPress && action.action === lastPress.action) {
      lastRelease = action.atFrame;
    }
  }
}

/**
 * Gate one primitive from a current reduced-model state. The result is a
 * readable record even on rejection, so the planner can retain why a move was
 * not legal instead of retrying it blindly.
 */
export function gateCycle(cycle, input, {
  constraints = DEVICE_CONSTRAINTS, exactGate = null,
} = {}) {
  const reasons = [];
  let state = clone(input);
  try {
    validateCycle(cycle);
    if (!state || state.schema !== REDUCED_SCHEMA) fail('initial state schema mismatch');
    for (const prerequisite of cycle.prerequisites) {
      if (stateField(state, prerequisite.field) !== prerequisite.equals)
        reasons.push(`prerequisite:${prerequisite.field}=${JSON.stringify(stateField(state, prerequisite.field))}`);
    }
    gateContact(cycle.actions, constraints ?? {}, reasons);
    const originFrame = state.frame;
    let lastFrame = originFrame;
    let lastOffset = -Infinity;
    for (const action of cycle.actions) {
      if (action.atFrame < lastOffset) reasons.push(`time-reversed:${action.action}`);
      const at = Math.max(lastFrame, originFrame + action.atFrame);
      state = advanceReduced(state, at);
      if (action.kind === 'press' &&
          ((action.action === 'monitor' && state.monitorAnim > 0) ||
           (action.action === 'mask' && state.maskAnim > 0)))
        reasons.push(`animation-window:${action.action}@${action.atFrame}`);
      const result = applyReduced(state, action.action, action.kind);
      if (!result.accepted) reasons.push(`engine-rejected:${action.action}:${result.reason}`);
      state = result.state;
      lastFrame = at;
      lastOffset = action.atFrame;
    }
    for (const verification of cycle.verifications) {
      state = advanceReduced(state, Math.max(state.frame, originFrame + verification.atFrame));
      const mismatch = checkExpected(state, verification.fields,
        `verification@${verification.atFrame}`);
      if (mismatch) reasons.push(mismatch);
    }
    if (exactGate === null) reasons.push('exact-model-gate-missing');
    else {
      const proof = exactGate(cycle);
      if (proof !== true && proof?.accepted !== true)
        reasons.push(`exact-model-gate:${proof?.reason ?? 'rejected'}`);
    }
  } catch (error) {
    reasons.push(error.message);
  }
  return {
    schema: 'cycle-decision-v1', cycleId: cycle?.id ?? null,
    accepted: reasons.length === 0, reasons, finalState: state,
    record: {
      cycleId: cycle?.id ?? null, accepted: reasons.length === 0,
      reasons: [...reasons], cost: cycle?.cost ?? null,
      hazardCoverage: cycle?.hazardCoverage ?? [],
    },
  };
}
