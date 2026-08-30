// Belief-backed short-horizon cycle supervisor for Plan 20 package 5.
//
// This is the composition layer between the estimator and the finite cycle
// selector. It consumes fact envelopes only; it never imports the exact game
// engine and therefore cannot read hidden route state. A caller supplies the
// exact proof callback and the route score, keeping those two authorities
// explicit at the boundary.
import * as C from './config.js';
import { initialEstimator, update, reconcile, send, needsVerification } from './estimator.js';
import { initialReducedState, observeReduced, applyReduced, REDUCED_SCHEMA } from './reduced-model.js';
import { getCycle } from './cycle-library.js';
import { selectCycle } from './cycle-planner.js';

export const CYCLE_CONTROLLER_SCHEMA = 'cycle-controller-v1';

const clone = value => structuredClone(value);
const finite = value => Number.isFinite(value);
const CONTROL_FACTS = Object.freeze({ monitorUp: 'monitor', maskOn: 'mask' });
const CONTROL_ACTIONS = Object.freeze({ monitor: 'monitorUp', mask: 'maskOn' });

function fail(message) { throw new TypeError(`cycle controller: ${message}`); }

function stripFrame(facts) {
  const result = {};
  for (const [name, fact] of Object.entries(facts ?? {})) {
    if (name !== 'frame') result[name] = fact;
  }
  return result;
}

// Add the two clocks at the composition boundary. A delayed watch read keeps
// its sampled frame as observedAtMs, while receipt is the current decision
// frame. A pre-read UNKNOWN has no meaningful sample time, so it is timestamped
// at receipt rather than manufacturing a negative event time.
function timedFacts(facts, frame, receivedAtMs) {
  if (!facts || typeof facts !== 'object' || Array.isArray(facts))
    fail('facts must be an object');
  if (!Number.isInteger(frame) || frame < 0 || !finite(receivedAtMs))
    fail('frame and receipt time must be valid');
  const sampleFrame = Number.isInteger(facts.frame) && facts.frame >= 0
    ? facts.frame : frame;
  const observedAtMs = sampleFrame * 1000 / C.FPS;
  const result = {};
  for (const [name, fact] of Object.entries(stripFrame(facts))) {
    if (!fact || typeof fact !== 'object' || Array.isArray(fact))
      fail(`fact ${name} is not an envelope`);
    result[name] = {
      ...fact,
      source: fact.source ?? 'observer',
      observedAtMs: fact.observedAtMs ?? observedAtMs,
      receivedAtMs: fact.receivedAtMs ?? receivedAtMs,
    };
  }
  return result;
}

function noDecision(controller, reason, extra = {}) {
  const decision = {
    schema: 'cycle-plan-decision-v1', selected: null,
    decisions: [], record: { selected: null, reason }, reason,
    frame: controller.reduced.frame, ...extra,
  };
  controller.decisions.push(clone(decision));
  return decision;
}

function observedBoolean(facts, name) {
  const fact = facts?.[name];
  return fact?.state === 'OBSERVED' && typeof fact.value === 'boolean'
    ? fact.value : null;
}

/**
 * A pure-data-facing supervisor. Methods mutate only this supervisor's
 * private state; snapshots are plain JSON-compatible values for replay.
 */
export class CycleController {
  constructor({ reduced = null, estimator = null, cycles = null } = {}) {
    this.reduced = clone(reduced ?? initialReducedState({ night: 1 }));
    if (!this.reduced || this.reduced.schema !== REDUCED_SCHEMA)
      fail('initial reduced state schema mismatch');
    this.estimator = estimator ?? initialEstimator({
      nowMs: this.reduced.frame * 1000 / C.FPS,
    });
    this.cycles = (cycles ?? [getCycle('observe-and-hold'), getCycle('defensive-mask')])
      .map(clone);
    if (!this.cycles.length) fail('at least one cycle is required');
    this.facts = {};
    this.activeCycleId = null;
    this.activeUntilFrame = -1;
    this.decisions = [];
    this.nextToken = 1;
  }

  /** Apply one fact batch and reconcile only matching pending control actions. */
  observe(facts, { frame = this.reduced.frame,
    receivedAtMs = frame * 1000 / C.FPS } = {}) {
    const timed = timedFacts(facts, frame, receivedAtMs);
    this.estimator = update(this.estimator, { facts: timed, nowMs: receivedAtMs });
    const physicalFacts = stripFrame(facts);
    this.reduced = observeReduced(this.reduced, physicalFacts, { frame });
    this.facts = clone(facts);

    const pending = this.estimator.belief.pendingAction;
    if (pending) {
      for (const [factName, control] of Object.entries(CONTROL_FACTS)) {
        if (pending.action !== control) continue;
        const fact = timed[factName];
        if (!fact || fact.state !== 'OBSERVED' || typeof fact.value !== 'boolean') continue;
        this.estimator = reconcile(this.estimator, {
          action: CONTROL_ACTIONS[control], value: fact.value,
          verifiedAtMs: fact.receivedAtMs, token: pending.token,
        });
        break;
      }
    }
    // Do not clone the growing trace on every sensor tick. Callers that need a
    // replayable record can request snapshot() at a cycle boundary; the hot
    // path returns only a small status value.
    return {
      schema: CYCLE_CONTROLLER_SCHEMA, frame: this.reduced.frame,
      activeCycleId: this.activeCycleId,
      verificationRequired: { ...this.estimator.verificationRequired },
    };
  }

  /**
   * Select a bounded cycle only from a positive, current blackout fact. An
   * UNKNOWN hazard is not silently promoted to clear or threat; the caller can
   * continue observing and replan at the next boundary.
   */
  plan({ exactGate, score } = {}) {
    if (typeof exactGate !== 'function' || typeof score !== 'function')
      fail('exactGate and score callbacks are required');
    if (this.activeCycleId && this.reduced.frame < this.activeUntilFrame)
      return noDecision(this, 'cycle-in-flight', { activeCycleId: this.activeCycleId });
    if (this.activeCycleId) {
      this.activeCycleId = null;
      this.activeUntilFrame = -1;
    }
    if (needsVerification(this.estimator, 'monitor') ||
        needsVerification(this.estimator, 'mask'))
      return noDecision(this, 'control-verification-required');

    const blackout = this.facts.blackout;
    if (!blackout || blackout.state !== 'OBSERVED' ||
        typeof blackout.value !== 'boolean')
      return noDecision(this, 'blackout-unknown');

    const hypothesisState = clone(this.reduced);
    hypothesisState.hazards.blackout = {
      state: blackout.value ? 'active' : 'clear',
      deadlineFrame: blackout.value
        ? this.reduced.frame + C.maskGraceFrames(this.reduced.night) : -1,
    };
    const hypothesis = {
      id: blackout.value ? 'blackout-active' : 'blackout-clear',
      state: hypothesisState,
      hazard: blackout.value ? 'active' : 'clear',
      plausible: true,
    };
    const decision = selectCycle(this.cycles, [hypothesis], {
      exactGate: (cycle, h) => exactGate(cycle, h, this),
      score: (cycle, h, gate) => score(cycle, h, gate, this),
    });
    decision.frame = this.reduced.frame;
    decision.hazard = hypothesis.hazard;
    this.decisions.push(clone(decision));
    return decision;
  }

  /**
   * Commit only the selected cycle's immediate prefix. Future actions are
   * returned as deferred data and must be revalidated at their own boundary;
   * this prevents a stale plan from becoming an unbounded macro.
   */
  commit(decision, { frame = this.reduced.frame } = {}) {
    if (!decision || decision.selected === null) return { cycleId: null, actions: [], deferred: [] };
    const cycle = this.cycles.find(candidate => candidate.id === decision.selected);
    if (!cycle) fail(`selected cycle ${decision.selected} is not in the library`);
    if (frame !== this.reduced.frame) fail('commit frame does not match reduced state');
    const immediate = cycle.actions.filter(action => action.atFrame === 0);
    const deferred = cycle.actions.filter(action => action.atFrame > 0).map(clone);
    const actions = [];
    for (const action of immediate) {
      let target = null;
      if (action.kind === 'press' && CONTROL_ACTIONS[action.action]) {
        target = CONTROL_ACTIONS[action.action];
        const expected = action.action === 'mask'
          ? !this.reduced.maskOn
          : !(this.reduced.monitor === 'up' || this.reduced.monitor === 'raising');
        const token = `cycle-${this.nextToken++}`;
        this.estimator = send(this.estimator, {
          action: target, expected,
          sentAtMs: frame * 1000 / C.FPS, token,
        });
        this.reduced = applyReduced(this.reduced, action.action, action.kind).state;
        this.reduced.controlUnknown[action.action === 'mask' ? 'mask' : 'monitor'] = true;
        actions.push({ ...clone(action), token, expected });
      } else {
        this.reduced = applyReduced(this.reduced, action.action, action.kind).state;
        actions.push(clone(action));
      }
    }
    this.activeCycleId = cycle.id;
    this.activeUntilFrame = frame + cycle.durationFrames;
    return { cycleId: cycle.id, actions, deferred };
  }

  snapshot() {
    return clone({
      schema: CYCLE_CONTROLLER_SCHEMA,
      reduced: this.reduced, estimator: this.estimator, cycles: this.cycles,
      facts: this.facts, activeCycleId: this.activeCycleId,
      activeUntilFrame: this.activeUntilFrame, decisions: this.decisions,
      nextToken: this.nextToken,
    });
  }
}

export const makeUnknownFacts = (facts = {}) => Object.fromEntries(
  Object.keys(facts).filter(name => name !== 'frame')
    .map(name => [name, { state: 'UNKNOWN', reason: 'observations-disabled' }])
);
