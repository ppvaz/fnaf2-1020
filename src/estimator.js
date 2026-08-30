// Uncertainty-aware estimator for Plan 20 package 3.
//
// This is deliberately a thin layer over belief-state.js.  The estimator does
// not invent hidden character positions or rewind the game to an audio event;
// it records when a fact was observed, when it arrived, and whether the fact
// is still safe to use at the current decision boundary.
import {
  BELIEF_SCHEMA, FACT_STATES, initialBelief, reduceBelief,
} from './belief-state.js';

export const ESTIMATOR_SCHEMA = 'estimator-v1';

const clone = value => structuredClone(value);
const finite = value => Number.isFinite(value);
const CONTROL_FACT = Object.freeze({ monitorUp: 'monitor', maskOn: 'mask' });

function requireEnvelope(name, fact) {
  if (!fact || !Object.values(FACT_STATES).includes(fact.state))
    throw new TypeError(`invalid fact envelope for ${name}`);
  if (fact.state === FACT_STATES.UNKNOWN && !fact.reason)
    throw new TypeError(`UNKNOWN fact ${name} needs a reason`);
  if (fact.confidence !== undefined &&
      (!finite(fact.confidence) || fact.confidence < 0 || fact.confidence > 1))
    throw new RangeError(`fact confidence for ${name} must be between 0 and 1`);
}

function timeOf(fact, key, fallback) {
  const value = fact[key];
  return value === null || value === undefined ? fallback : value;
}

function appendIncident(state, incident) {
  state.belief.incidents.push({ ...incident, atMs: state.nowMs });
  state.trace.push({ type: 'incident', ...incident, atMs: state.nowMs });
}

function lockForControl(state, factName, reason) {
  const control = CONTROL_FACT[factName];
  if (!control) return;
  state.verificationRequired[control] = true;
  state.belief.control.actionLockout = true;
  // A contradiction is not allowed to become the latest physical truth.
  if (reason === 'sensor-contradiction') {
    state.belief.control[control] = {
      value: 'unknown', confidence: 0, source: reason,
    };
  }
}

function maxAgeFor(state, factName, fact, maxAgeMs) {
  const explicit = maxAgeMs?.[factName] ?? fact.maxAgeMs;
  if (explicit === undefined || explicit === null) return Infinity;
  if (!finite(explicit) || explicit < 0)
    throw new RangeError(`maxAgeMs for ${factName} must be non-negative`);
  return explicit;
}

function latestReceived(entry) {
  return entry?.receivedAtMs ?? -Infinity;
}

function contradiction(state, name, fact, receivedAtMs) {
  const previous = state.latest[name];
  if (!previous || previous.state !== FACT_STATES.OBSERVED ||
      fact.state !== FACT_STATES.OBSERVED || previous.value === fact.value)
    return false;
  // A single calibrated sensor is allowed to report a real state transition
  // (blackout clear, mask off, monitor raise). The contradiction contract is
  // for two sources disagreeing inside the same decision window; treating a
  // normal transition from one source as a sensor conflict would lock the
  // controller precisely when a visible hazard arrives.
  if ((previous.source ?? null) === (fact.source ?? null)) return false;
  const age = Math.abs(receivedAtMs - latestReceived(previous));
  return age <= state.config.contradictionWindowMs;
}

function applyUnknown(state, name, reason, fact, receivedAtMs) {
  const envelope = {
    state: FACT_STATES.UNKNOWN,
    reason,
    source: fact.source ?? 'estimator',
    calibrationProfile: fact.calibrationProfile ?? null,
    observedAtMs: fact.observedAtMs ?? receivedAtMs,
    receivedAtMs,
    confidence: 0,
  };
  state.belief = reduceBelief(state.belief, {
    type: 'observation', nowMs: state.nowMs, facts: { [name]: envelope },
  });
  state.trace.push({ type: 'fact-rejected', fact: name, reason,
    observedAtMs: envelope.observedAtMs, receivedAtMs, atMs: state.nowMs });
  lockForControl(state, name, reason);
}

function markStale(state, name, fact, receivedAtMs, observedAtMs, maxAgeMs) {
  applyUnknown(state, name, 'stale-fact', fact, receivedAtMs);
  appendIncident(state, { type: 'stale-fact', fact: name,
    ageMs: receivedAtMs - observedAtMs, maxAgeMs });
}

/** Create an estimator around an existing belief-v1 value. */
export function initialEstimator({ belief = null, nowMs = null,
  staleAfterMs = {}, contradictionWindowMs = 1000 } = {}) {
  const base = belief ? clone(belief) : initialBelief({ nowMs: nowMs ?? 0 });
  if (!base || base.schema !== BELIEF_SCHEMA)
    throw new TypeError('estimator needs a belief-v1 value');
  const clock = nowMs === null ? base.nowMs : nowMs;
  if (!finite(clock) || clock < base.nowMs)
    throw new RangeError('estimator time must be monotonic');
  if (!finite(contradictionWindowMs) || contradictionWindowMs < 0)
    throw new RangeError('contradictionWindowMs must be non-negative');
  for (const [name, maxAge] of Object.entries(staleAfterMs)) {
    if (!finite(maxAge) || maxAge < 0)
      throw new RangeError(`staleAfterMs for ${name} must be non-negative`);
  }
  return {
    schema: ESTIMATOR_SCHEMA,
    nowMs: clock,
    belief: clock === base.nowMs ? base
      : reduceBelief(base, { type: 'time', nowMs: clock }),
    config: { staleAfterMs: clone(staleAfterMs), contradictionWindowMs },
    latest: {},
    verificationRequired: { monitor: false, mask: false },
    trace: [],
  };
}

function checkEstimator(estimator) {
  if (!estimator || estimator.schema !== ESTIMATOR_SCHEMA ||
      !estimator.belief || estimator.belief.schema !== BELIEF_SCHEMA)
    throw new TypeError('estimator schema mismatch');
}

/**
 * Advance the decision clock.  Expiring control evidence is a safety event,
 * not a new control value: the planner must verify before sending another
 * monitor/mask transition.
 */
export function predict(estimator, nowMs) {
  checkEstimator(estimator);
  if (!finite(nowMs) || nowMs < estimator.nowMs)
    throw new RangeError('estimator time must move forward');
  const next = clone(estimator);
  next.nowMs = nowMs;
  next.belief = reduceBelief(next.belief, { type: 'time', nowMs });
  for (const [name, evidence] of Object.entries(next.latest)) {
    const control = CONTROL_FACT[name];
    if (!control || next.verificationRequired[control]) continue;
    const maxAge = next.config.staleAfterMs[name];
    if (!finite(maxAge) || maxAge < 0) continue;
    const age = nowMs - latestReceived(evidence);
    if (age > maxAge) {
      next.verificationRequired[control] = true;
      next.belief.control.actionLockout = true;
      appendIncident(next, { type: 'stale-control', fact: name,
        control, ageMs: age, maxAgeMs: maxAge });
    }
  }
  return next;
}

/**
 * Apply one batch of sensor facts at their receive time.  Delayed facts keep
 * observedAtMs separate from receivedAtMs, so an audio cue can narrow a route
 * hypothesis without pretending it happened at the detector's local clock.
 */
export function update(estimator, { facts = {}, nowMs = null, maxAgeMs = {} } = {}) {
  checkEstimator(estimator);
  if (!facts || typeof facts !== 'object' || Array.isArray(facts))
    throw new TypeError('estimator facts must be an object');
  let receivedNow = nowMs ?? estimator.nowMs;
  for (const [name, fact] of Object.entries(facts)) {
    requireEnvelope(name, fact);
    const received = timeOf(fact, 'receivedAtMs', receivedNow);
    if (!finite(received) || received < estimator.nowMs)
      throw new RangeError(`receivedAtMs for ${name} is not monotonic`);
    receivedNow = Math.max(receivedNow, received);
  }
  let next = predict(estimator, receivedNow);

  for (const [name, fact] of Object.entries(facts)) {
    const received = timeOf(fact, 'receivedAtMs', receivedNow);
    const observed = timeOf(fact, 'observedAtMs', received);
    if (!finite(observed) || observed > received) {
      applyUnknown(next, name, 'invalid-fact-timing', fact, received);
      appendIncident(next, { type: 'invalid-fact-timing', fact: name,
        observedAtMs: observed, receivedAtMs: received });
      continue;
    }
    const maxAge = maxAgeFor(next, name, fact, maxAgeMs);
    if (received - observed > maxAge) {
      markStale(next, name, fact, received, observed, maxAge);
      continue;
    }
    if (next.belief.calibrationProfiles[name] &&
        fact.calibrationProfile !== next.belief.calibrationProfiles[name]) {
      applyUnknown(next, name, 'calibration-mismatch', fact, received);
      appendIncident(next, { type: 'sensor-mismatch', fact: name,
        expectedProfile: next.belief.calibrationProfiles[name],
        receivedProfile: fact.calibrationProfile });
      continue;
    }
    if (contradiction(next, name, fact, received)) {
      applyUnknown(next, name, 'sensor-contradiction', fact, received);
      lockForControl(next, name, 'sensor-contradiction');
      appendIncident(next, { type: 'sensor-contradiction', fact: name,
        previous: next.latest[name].value, actual: fact.value,
        previousSource: next.latest[name].source ?? null,
        actualSource: fact.source ?? null });
      continue;
    }

    const timedFact = { ...fact, observedAtMs: observed, receivedAtMs: received };
    next.belief = reduceBelief(next.belief, {
      type: 'observation', nowMs: receivedNow, facts: { [name]: timedFact },
    });
    next.trace.push({ type: 'fact-accepted', fact: name,
      value: fact.state === FACT_STATES.OBSERVED ? fact.value : null,
      state: fact.state, observedAtMs: observed, receivedAtMs: received,
      delayedMs: received - observed, atMs: next.nowMs });
    if (fact.state === FACT_STATES.OBSERVED) {
      next.latest[name] = {
        state: fact.state, value: fact.value, source: fact.source ?? null,
        observedAtMs: observed, receivedAtMs: received,
      };
    }
  }
  return next;
}

/** Record a command; it is not physical truth until reconcile() succeeds. */
export function send(estimator, { action, expected, sentAtMs = estimator.nowMs,
  token = null } = {}) {
  checkEstimator(estimator);
  if (!finite(sentAtMs) || sentAtMs < estimator.nowMs)
    throw new RangeError('action sent time is not monotonic');
  const next = predict(estimator, sentAtMs);
  next.belief = reduceBelief(next.belief, {
    type: 'action-sent', action, expected, sentAtMs, token,
  });
  next.trace.push({ type: 'action-sent', action, expected, sentAtMs, token });
  return next;
}

/**
 * Reconcile a control action with a delivered/observed result.  Mismatches
 * leave the pending action and force recovery; matching verification clears
 * only the corresponding control requirement.
 */
export function reconcile(estimator, { action, value, verifiedAtMs = estimator.nowMs,
  token = undefined } = {}) {
  checkEstimator(estimator);
  if (!finite(verifiedAtMs) || verifiedAtMs < estimator.nowMs)
    throw new RangeError('verification time is not monotonic');
  const next = predict(estimator, verifiedAtMs);
  const control = action === 'monitorUp' ? 'monitor'
    : action === 'maskOn' ? 'mask' : null;
  if (!control) throw new TypeError('reconcile needs monitorUp or maskOn');
  const pending = next.belief.pendingAction;
  const matches = pending && pending.action === control &&
    (token === undefined || token === pending.token) && value === pending.expected;
  next.belief = reduceBelief(next.belief, {
    type: 'action-verified', value, token,
  });
  if (matches) {
    next.verificationRequired[control] = false;
    next.trace.push({ type: 'action-verified', action, value, verifiedAtMs, token });
  } else {
    next.verificationRequired[control] = true;
    next.belief.control.actionLockout = true;
    next.trace.push({ type: 'verification-failed', action, value,
      verifiedAtMs, token });
  }
  return next;
}

export const needsVerification = (estimator, control) => {
  checkEstimator(estimator);
  if (!['monitor', 'mask'].includes(control)) throw new TypeError('unknown control');
  return estimator.verificationRequired[control] ||
    estimator.belief.control.actionLockout;
};
