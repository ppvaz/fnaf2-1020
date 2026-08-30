// Small, plain-data transition model for Plan 20 package 2.
//
// This is intentionally not a second game engine. It owns only the facts a
// controller can predict or verify at a cycle boundary: input locks,
// monitor/mask animation, box/power resource motion, and coarse hazard/risk
// labels. Hidden RNG state and character positions stay UNKNOWN/risk buckets.
import * as C from './config.js';

export const REDUCED_SCHEMA = 'reduced-v1';
export const ROUTE_RISK = Object.freeze(['unknown', 'absent', 'possible', 'opening', 'inside']);

const clone = value => structuredClone(value);
const MONITOR = Object.freeze({ DOWN: 'down', LOWERING: 'lowering', UP: 'up', RAISING: 'raising' });

export function initialReducedState({ night = 7, frame = 0, box = 1,
                                      power = C.powerFrames(night) } = {}) {
  return {
    schema: REDUCED_SCHEMA, night, frame,
    monitor: MONITOR.DOWN, monitorAnim: 0,
    maskOn: false, maskAnim: 0,
    viewedCamera: null, lastViewedCamera: null, hasViewedCamera: false, winding: false,
    lightHeld: false, ventLightL: false, ventLightR: false,
    box, power,
    foxyD: 0,
    controlUnknown: { monitor: true, mask: true },
    hazards: {
      blackout: { state: 'unknown', deadlineFrame: -1 },
      opening: { state: 'unknown', observedAtFrame: -1 },
    },
    routeRisk: { bb: 'unknown', mangle: 'unknown' },
    incidents: [],
  };
}

export const isMonitorUp = state => state.monitor === MONITOR.UP;
export const isMaskFullyOn = state => state.maskOn && state.maskAnim === 0;
export const isMaskFullyOff = state => !state.maskOn && state.maskAnim === 0;

function record(state, type, data = {}) {
  state.incidents.push({ type, frame: state.frame, ...data });
}

function stepAnimation(state) {
  if (state.monitorAnim > 0 && --state.monitorAnim === 0) {
    if (state.monitor === MONITOR.RAISING) {
      state.monitor = MONITOR.UP;
      if (!state.hasViewedCamera) {
        state.viewedCamera = C.initialCamera(state.night);
        state.hasViewedCamera = true;
      } else if (state.lastViewedCamera !== null) {
        state.viewedCamera = state.lastViewedCamera;
      }
    }
    else if (state.monitor === MONITOR.LOWERING) {
      state.monitor = MONITOR.DOWN;
      state.viewedCamera = null;
    }
  }
  if (state.maskAnim > 0 && --state.maskAnim === 0 && state.maskOn)
    state.viewedCamera = null;
  if (state.viewedCamera !== null && state.frame % C.LAST_VIEW_SAMPLE_FRAMES === 0)
    state.lastViewedCamera = state.viewedCamera;
}

function stepResources(state) {
  const winding = state.winding && isMonitorUp(state) && state.viewedCamera === C.BOX_CAM;
  if (winding) {
    state.box = Math.min(1, Math.max(state.box, C.BOX_SNAP) + 1 / C.BOX_WIND_FRAMES);
  } else if (C.boxDrainsAtHour(state.night, Math.floor(state.frame / C.HOUR_FRAMES))) {
    state.box = Math.max(0, state.box - 1 / C.boxDrainFrames(state.night));
  }
  if (state.lightHeld && !state.maskOn) state.power = Math.max(0, state.power - 1);
  // This is a lower-bound risk accumulator, not hidden Foxy truth: the full
  // engine can add more while a vent occupant is masked, which this reduced
  // model intentionally cannot observe.
  const foxyDormant = state.night === 1 ||
    (state.night === 2 && state.frame < 2 * C.HOUR_FRAMES);
  if (!state.maskOn && state.hazards.blackout.state !== 'active' &&
      !foxyDormant && state.frame % C.FPS === 0)
    state.foxyD++;
}

// Predict one or more frames. `state.frame` is the frame before the next
// engine tick, matching Sim.tick()'s ++frame convention.
export function advanceReduced(input, targetFrame) {
  const state = clone(input);
  if (!Number.isInteger(targetFrame) || targetFrame < state.frame)
    throw new RangeError('reduced model time must move forward in whole frames');
  while (state.frame < targetFrame) {
    state.frame++;
    stepAnimation(state);
    stepResources(state);
  }
  return state;
}

export function actionAllowed(state, action) {
  if (typeof action !== 'string') return false;
  if (action === 'release') return true;
  if (state.maskOn && action !== 'mask') return false;
  if (action === 'mask' && !state.maskOn &&
      (state.monitor === MONITOR.UP || state.monitor === MONITOR.RAISING)) return false;
  if (action.startsWith('cam:') && !isMonitorUp(state)) return false;
  if (!['monitor', 'mask', 'wind', 'light', 'ventL', 'ventR'].includes(action) &&
      !action.startsWith('cam:')) return false;
  return true;
}

function setMonitor(state, up) {
  if (up && (state.monitor === MONITOR.UP || state.monitor === MONITOR.RAISING)) return false;
  if (!up && (state.monitor === MONITOR.DOWN || state.monitor === MONITOR.LOWERING)) return false;
  if (up) {
    state.monitor = MONITOR.RAISING;
    state.monitorAnim = C.MONITOR_ANIM_UP;
  } else {
    state.monitor = MONITOR.LOWERING;
    state.monitorAnim = C.MONITOR_ANIM_DOWN;
    state.viewedCamera = null;
    state.winding = false;
  }
  return true;
}

// Apply an engine-semantic action at the state's current frame. Returns a
// structured acceptance result so callers can log rejected inputs instead of
// assuming that a press executed.
export function applyReduced(input, action, kind = 'press') {
  const state = clone(input);
  if (kind === 'release') {
    if (action === 'light') state.lightHeld = false;
    else if (action === 'wind') state.winding = false;
    else if (action === 'ventL') state.ventLightL = false;
    else if (action === 'ventR') state.ventLightR = false;
    return { state, accepted: true, reason: null };
  }
  if (!actionAllowed(state, action)) {
    record(state, 'action-rejected', { action, reason: 'engine-input-lock' });
    return { state, accepted: false, reason: 'engine-input-lock' };
  }
  if (action === 'mask') {
    state.maskOn = !state.maskOn;
    state.maskAnim = state.maskOn ? C.MASK_ANIM_ON : C.MASK_ANIM_OFF;
  } else if (action === 'monitor') {
    setMonitor(state, !(state.monitor === MONITOR.UP || state.monitor === MONITOR.RAISING));
  } else if (action === 'wind') state.winding = true;
  else if (action === 'light') state.lightHeld = true;
  else if (action === 'ventL') state.ventLightL = true;
  else if (action === 'ventR') state.ventLightR = true;
  else if (action.startsWith('cam:')) {
    state.viewedCamera = +action.slice(4);
    state.hasViewedCamera = true;
  }
  else record(state, 'action-rejected', { action, reason: 'unknown-action' });
  return { state, accepted: true, reason: null };
}

function updateFact(state, name, fact) {
  if (!fact || (fact.state !== 'OBSERVED' && fact.state !== 'UNKNOWN'))
    throw new TypeError(`invalid reduced fact: ${name}`);
  if (fact.state === 'UNKNOWN') {
    state.controlUnknown[name === 'monitorUp' ? 'monitor' : name === 'maskOn' ? 'mask' : name] = true;
    return;
  }
  if (name === 'monitorUp') state.controlUnknown.monitor = false;
  if (name === 'maskOn') state.controlUnknown.mask = false;
  if (name === 'blackout') state.hazards.blackout = {
    state: fact.value ? 'active' : 'clear',
    deadlineFrame: fact.value ? state.frame + C.maskGraceFrames(state.night) : -1,
  };
  if (name === 'leftOpening') state.hazards.opening = {
    state: fact.value, observedAtFrame: state.frame,
  };
  if (name === 'bbVent' && ROUTE_RISK.includes(fact.value)) state.routeRisk.bb = fact.value;
  if (name === 'mangleOpening' && ROUTE_RISK.includes(fact.value)) state.routeRisk.mangle = fact.value;
}

// Apply sensor facts without turning UNKNOWN into a negative claim. The
// current value is deliberately represented by controlUnknown; callers may
// still use the last verified physical state held elsewhere in their belief.
export function observeReduced(input, facts, { frame = input.frame } = {}) {
  const state = advanceReduced(input, frame);
  for (const [name, fact] of Object.entries(facts ?? {})) updateFact(state, name, fact);
  return state;
}

export function reduceCycle(input, { actions = [], observations = [] } = {}) {
  let state = clone(input);
  const events = [...actions.map(event => ({ ...event, kind: event.kind ?? 'press' })),
                  ...observations.map(event => ({ ...event, kind: 'observation' }))]
    .sort((a, b) => a.frame - b.frame || (a.kind === 'observation' ? 1 : -1));
  for (const event of events) {
    state = advanceReduced(state, event.frame);
    state = event.kind === 'observation'
      ? observeReduced(state, event.facts)
      : applyReduced(state, event.action, event.kind).state;
  }
  return state;
}
