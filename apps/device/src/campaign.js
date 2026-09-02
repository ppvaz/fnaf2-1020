/**
 * Campaign control plane for the two requested device targets.
 *
 * This module owns the distinction between a story Night 6 menu-target run and
 * a Night 7 Custom Night run.  It does not choose coordinates or send input;
 * those remain ports supplied by the composition root.  A campaign can only
 * become COMPLETE after positive 6 AM and save/menu evidence.
 * CONTRACT:device-campaign-v1.
 */
import { AI_10_20, AI_DIALS, PUPPET_AI } from '@fnaf2-1020/core/mechanics';
import { stableHash } from '@fnaf2-1020/core/contracts';
import { makeCustomNightConfig, validateCustomNightConfig } from './custom-night.js';

export const CAMPAIGN_SCHEMA = 'device-campaign-v1';
export const CAMPAIGN_STATES = Object.freeze([
  'IDLE', 'PREFLIGHT', 'MENU', 'INTRO_VERIFY', 'ACTIVE',
  'CUSTOM_VERIFY', 'TERMINAL_VERIFY', 'RETRY_VERIFY', 'SAVE_VERIFY', 'HOLD', 'ABORTED', 'COMPLETE',
]);

const PACKAGE = 'com.scottgames.fnaf2';
const NIGHT6 = 6;
const NIGHT7 = 7;
const MENU_TARGETS = new Set(['continue', 'sixthNight', 'customNight']);
const TRANSITIONS = Object.freeze({
  IDLE: ['PREFLIGHT'],
  PREFLIGHT: ['MENU', 'HOLD', 'ABORTED'],
  HOLD: ['PREFLIGHT', 'ABORTED'],
  MENU: ['INTRO_VERIFY', 'CUSTOM_VERIFY', 'ABORTED', 'HOLD'],
  CUSTOM_VERIFY: ['INTRO_VERIFY', 'ABORTED', 'HOLD'],
  INTRO_VERIFY: ['ACTIVE', 'ABORTED', 'HOLD'],
  ACTIVE: ['TERMINAL_VERIFY', 'RETRY_VERIFY', 'ABORTED', 'HOLD'],
  TERMINAL_VERIFY: ['SAVE_VERIFY', 'ABORTED', 'HOLD'],
  RETRY_VERIFY: ['MENU', 'ABORTED', 'HOLD'],
  SAVE_VERIFY: ['MENU', 'COMPLETE', 'ABORTED', 'HOLD'],
  ABORTED: [],
  COMPLETE: [],
});

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new TypeError(`campaign: ${message}`); };
const text = (value, label) => {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a non-empty string`);
  return value;
};
const integer = (value, label, { min = 0, max = Infinity } = {}) => {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${label} must be an integer in ${min}..${max}`);
  return value;
};

function validateNight(entry, index) {
  if (!isRecord(entry)) fail(`nights[${index}] must be an object`);
  integer(entry.night, `nights[${index}].night`, { min: 6, max: 7 });
  if (entry.night === NIGHT6) {
    if (entry.mode !== 'story' || !['continue', 'sixthNight'].includes(entry.menuTarget))
      fail('Night 6 must use mode=story and menuTarget=continue or sixthNight');
    if (entry.menuTarget === 'continue' && entry.saveCursorObserved !== undefined &&
        entry.saveCursorObserved !== null && entry.saveCursorObserved !== NIGHT6)
      fail('Night 6 saveCursorObserved must be 6 when supplied');
  } else {
    if (entry.mode !== 'custom' || entry.menuTarget !== 'customNight')
      fail('Night 7 must use mode=custom and menuTarget=customNight');
    if (!isRecord(entry.dials)) fail('Night 7 dials are required');
    for (const dial of AI_DIALS) integer(entry.dials[dial], `nights[${index}].dials.${dial}`, { max: AI_10_20 });
    if (entry.puppet !== PUPPET_AI) fail(`Night 7 puppet must be ${PUPPET_AI}`);
    if (entry.custom !== undefined) {
      try { validateCustomNightConfig(entry.custom); }
      catch (error) { fail(`Night 7 custom configuration is invalid: ${error.message}`); }
    }
    const extras = Object.keys(entry.dials).filter(dial => !AI_DIALS.includes(dial));
    if (extras.length) fail(`Night 7 has unknown dials: ${extras.join(',')}`);
  }
  if (entry.timing !== undefined) {
    if (!isRecord(entry.timing)) fail(`nights[${index}].timing must be an object`);
    for (const key of ['periodMs', 'loopStartMs', 'stopAtMs', 'observeUntilMs', 'idleUntilMs'])
      integer(entry.timing[key], `nights[${index}].timing.${key}`);
    if (entry.timing.periodMs < 1 || entry.timing.stopAtMs <= entry.timing.loopStartMs ||
        entry.timing.observeUntilMs < entry.timing.stopAtMs || entry.timing.idleUntilMs > entry.timing.loopStartMs)
      fail(`nights[${index}].timing bounds are invalid`);
  }
  if (!MENU_TARGETS.has(entry.menuTarget)) fail(`nights[${index}].menuTarget is unsupported`);
  if (entry.policy !== undefined) text(entry.policy, `nights[${index}].policy`);
  return entry;
}

/** Validate the complete, serializable campaign specification. */
export function validateCampaignSpec(value) {
  if (!isRecord(value) || value.schema !== CAMPAIGN_SCHEMA || value.version !== 1)
    fail('schema/version mismatch');
  if (!isRecord(value.target)) fail('target is required');
  if (value.target.package !== PACKAGE) fail(`target.package must be ${PACKAGE}`);
  text(value.target.build, 'target.build');
  text(value.profile, 'profile');
  if (!Array.isArray(value.nights) || value.nights.length < 1 || value.nights.length > 2)
    fail('nights must contain one or two targets');
  const seen = new Set();
  for (const [index, entry] of value.nights.entries()) {
    validateNight(entry, index);
    if (seen.has(entry.night)) fail(`night ${entry.night} is duplicated`);
    seen.add(entry.night);
  }
  if (!isRecord(value.retry) || !Number.isInteger(value.retry.maxAttempts) ||
      value.retry.maxAttempts < 1 || value.retry.maxAttempts > 5)
    fail('retry.maxAttempts must be an integer in 1..5');
  if (value.proof?.requireSixAm !== true || value.proof?.requireSaveOrMenu !== true)
    fail('proof must require positive six-AM and save/menu evidence');
  return value;
}

/** Construct the reviewed default campaign: story Night 6, then 10/20 Night 7. */
/** @param {{profile?: string, targetBuild?: string, maxAttempts?: number, night6MenuTarget?: string,
 *   timingByNight?: Record<string, object>}} options */
export function makeCampaignSpec({ profile, targetBuild, maxAttempts = 3,
  night6MenuTarget = 'sixthNight', timingByNight = {} } = {}) {
  text(profile, 'profile');
  text(targetBuild, 'targetBuild');
  if (!['continue', 'sixthNight'].includes(night6MenuTarget))
    fail('night6MenuTarget must be continue or sixthNight');
  if (!isRecord(timingByNight)) fail('timingByNight must be an object');
  const dials = Object.fromEntries(AI_DIALS.map(dial => [dial, AI_10_20]));
  const timing = night => timingByNight[String(night)] ??
    { periodMs: 10000, loopStartMs: 0, stopAtMs: 420000, observeUntilMs: 420000, idleUntilMs: 0 };
  return validateCampaignSpec({
    schema: CAMPAIGN_SCHEMA, version: 1,
    target: { package: PACKAGE, build: targetBuild }, profile,
    nights: [
      { night: NIGHT6, mode: 'story', menuTarget: night6MenuTarget,
        ...(night6MenuTarget === 'continue' ? { saveCursorObserved: null } : {}),
        timing: timing(NIGHT6) },
      { night: NIGHT7, mode: 'custom', menuTarget: 'customNight',
        custom: makeCustomNightConfig(dials), dials, puppet: PUPPET_AI,
        timing: timing(NIGHT7) },
    ],
    retry: { maxAttempts },
    proof: { requireSixAm: true, requireSaveOrMenu: true },
  });
}

function event(state, type, data, at) {
  return Object.freeze({ schema: 'campaign-event-v1', type, state, at, data: structuredClone(data ?? {}) });
}

export function validateCampaignResult(value) {
  if (!isRecord(value) || value.schema !== 'device-campaign-result-v1' || value.version !== 1)
    fail('result schema/version mismatch');
  if (!CAMPAIGN_STATES.includes(value.state)) fail('result state is invalid');
  text(value.specHash, 'result.specHash');
  if (!Array.isArray(value.completedNights) || !Array.isArray(value.attempts) || !Array.isArray(value.events))
    fail('result attempts/events are required');
  if (value.completedNights.some(night => night !== NIGHT6 && night !== NIGHT7))
    fail('result completedNights contains an unsupported night');
  return value;
}

/**
 * Small deterministic FSM used by both a CLI runner and a future app runner.
 * Ports call the observation methods only after their own transport has
 * returned a bounded, identity-checked result.
 */
export class CampaignStateMachine {
  /** @param {{spec?: any, now?: () => number, onEvent?: (record: any) => void}} options */
  constructor({ spec, now = () => performance.now(), onEvent = /** @type {(record: any) => void} */ (() => {}) } = {}) {
    this.spec = validateCampaignSpec(spec);
    this.now = now;
    this.onEvent = onEvent;
    this.state = 'IDLE';
    this.targetIndex = 0;
    this.attempt = 0;
    this.events = [];
    this.attempts = [];
    this.activeAttempt = null;
  }

  get target() { return this.spec.nights[this.targetIndex] ?? null; }

  snapshot() {
    return {
      schema: CAMPAIGN_SCHEMA, version: 1, state: this.state,
      specHash: stableHash(this.spec), targetIndex: this.targetIndex,
      target: this.target, attempt: this.attempt, eventCount: this.events.length,
      attempts: this.attempts.length,
    };
  }

  result() {
    return validateCampaignResult(Object.freeze({ schema: 'device-campaign-result-v1', version: 1,
      specHash: stableHash(this.spec), state: this.state, targetIndex: this.targetIndex,
      completedNights: this.attempts.filter(item => item.proof).map(item => item.night),
      attempts: structuredClone(this.attempts), events: structuredClone(this.events) }));
  }

  transition(next, data = {}) {
    if (!CAMPAIGN_STATES.includes(next)) fail(`unknown state ${next}`);
    if (!TRANSITIONS[this.state].includes(next)) fail(`cannot transition ${this.state} -> ${next}`);
    const previous = this.state;
    this.state = next;
    const record = event(next, 'campaign.state', { previous, ...data }, this.now());
    this.events.push(record);
    this.onEvent(record);
    return this.snapshot();
  }

  startPreflight() { return this.transition('PREFLIGHT'); }

  /** @param {any} result */
  acceptPreflight(result) {
    if (result?.status !== 'READY') return this.transition('HOLD', { reason: result?.reason ?? 'device-not-ready' });
    return this.transition('MENU', { device: result.serial ?? null });
  }

  /** @param {{target?: string, visible?: boolean, selected?: boolean}} options */
  acceptMenu({ target, visible = false, selected = false } = {}) {
    if (target !== this.target?.menuTarget || !visible || !selected)
      return this.transition('HOLD', { reason: 'menu-observation-not-confirmed', target, expected: this.target?.menuTarget });
    return this.target?.mode === 'custom'
      ? this.transition('CUSTOM_VERIFY', { target })
      : this.transition('INTRO_VERIFY', { target });
  }

  /** @param {{status?: string, dials?: object, puppet?: number, readback?: object}} result */
  acceptCustomConfiguration(result = {}) {
    const target = this.target;
    const expected = target?.mode === 'custom' ? validateCustomNightConfig(target.custom ?? makeCustomNightConfig(target.dials)) : null;
    const sameDials = expected && AI_DIALS.every(dial => result.dials?.[dial] === expected.dials[dial]);
    const readbackDials = expected && AI_DIALS.every(dial => result.readback?.dials?.[dial] === expected.dials[dial]);
    if (target?.mode !== 'custom' || result.status !== 'PASS' || result.puppet !== PUPPET_AI ||
        !sameDials || !readbackDials || result.readback?.puppet !== PUPPET_AI)
      return this.transition('HOLD', { reason: 'custom-night-readback-not-confirmed' });
    return this.transition('INTRO_VERIFY', { target: 'customNight', readback: true });
  }

  /** @param {{night?: number, identity?: string, observed?: boolean}} options */
  acceptIntro({ night, identity, observed = false } = {}) {
    if (!observed || night !== this.target?.night ||
        identity !== this.target.mode)
      return this.transition('HOLD', { reason: 'intro-identity-not-confirmed', night, identity });
    return this.transition('ACTIVE', { night });
  }

  beginAttempt() {
    if (this.state !== 'ACTIVE') fail('beginAttempt requires ACTIVE');
    this.attempt += 1;
    if (this.attempt > this.spec.retry.maxAttempts) {
      this.transition('ABORTED', { reason: 'attempt-budget-exhausted' });
      return this.snapshot();
    }
    const record = { night: this.target.night, mode: this.target.mode, attempt: this.attempt, status: 'ACTIVE' };
    this.attempts.push(record);
    this.activeAttempt = record;
    const attemptEvent = event(this.state, 'campaign.attempt', { night: this.target.night, attempt: this.attempt }, this.now());
    this.events.push(attemptEvent); this.onEvent(attemptEvent);
    return this.snapshot();
  }

  /** @param {{night?: number, outcome?: string, sixAm?: boolean}} options */
  acceptTerminal({ night, outcome, sixAm = false } = {}) {
    if (this.activeAttempt) this.activeAttempt.terminal = { night, outcome, sixAm };
    if (night !== this.target?.night) return this.transition('HOLD', { reason: 'terminal-night-identity-unknown', night });
    if (outcome === 'unknown') return this.transition('HOLD', { reason: 'terminal-outcome-unknown', night });
    if (outcome === 'death') {
      if (this.activeAttempt) this.activeAttempt.status = 'DEATH';
      return this.transition('RETRY_VERIFY', { reason: 'attempt-ended-with-death', night });
    }
    if (outcome !== 'sixam' || sixAm !== true)
      return this.transition('ABORTED', { reason: 'terminal-win-not-proven', night, outcome });
    return this.transition('TERMINAL_VERIFY', { night, outcome });
  }

  /** @param {{menuReady?: boolean}} options */
  acceptRetry({ menuReady = false } = {}) {
    if (!menuReady) return this.transition('HOLD', { reason: 'retry-menu-not-confirmed' });
    if (this.attempt >= this.spec.retry.maxAttempts)
      return this.transition('ABORTED', { reason: 'attempt-budget-exhausted' });
    return this.transition('MENU', { retry: true, attempt: this.attempt + 1 });
  }

  /** @param {{sixAm?: boolean, positive?: boolean}} options */
  acceptTerminalVerification({ sixAm = false, positive = false } = {}) {
    if (sixAm !== true || positive !== true)
      return this.transition('ABORTED', { reason: 'terminal-verification-failed' });
    if (this.activeAttempt) this.activeAttempt.terminalVerification = { sixAm, positive };
    return this.transition('SAVE_VERIFY', { sixAm: true });
  }

  /** @param {{cursorNight?: number, customNightVisible?: boolean, menuReturned?: boolean, customCompleted?: boolean, observed?: boolean, dials?: object, puppet?: number, customReadback?: object, proofHash?: string}} options */
  acceptSave({ cursorNight, menuReturned = false, customCompleted = false, observed = false,
    customNightVisible = false, dials, puppet, customReadback, proofHash } = {}) {
    const target = this.target;
    const valid = target?.night === NIGHT6
      ? observed === true && (cursorNight === NIGHT7 || customNightVisible === true)
      : menuReturned === true && customCompleted === true && observed === true;
    if (!valid) return this.transition('ABORTED', { reason: 'save-or-menu-advancement-not-proven', cursorNight });
    const completedNight = target.night;
    if (this.activeAttempt) {
      this.activeAttempt.save = { cursorNight, customNightVisible, menuReturned, customCompleted, observed };
      if (target.night === NIGHT7) this.activeAttempt.customReadback = { dials, puppet, ...customReadback };
      if (proofHash) this.activeAttempt.proofHash = proofHash;
      this.activeAttempt.status = 'WIN';
      this.activeAttempt.proof = true;
    }
    if (this.targetIndex + 1 < this.spec.nights.length) {
      this.targetIndex += 1;
      this.attempt = 0;
      return this.transition('MENU', { completedNight });
    }
    return this.transition('COMPLETE', { completedNight });
  }

  hold(reason = 'operator-hold') {
    if (this.state === 'HOLD') return this.snapshot();
    if (!TRANSITIONS[this.state].includes('HOLD')) fail(`cannot hold from ${this.state}`);
    return this.transition('HOLD', { reason });
  }

  resume() {
    if (this.state !== 'HOLD') fail('resume requires HOLD');
    return this.transition('PREFLIGHT');
  }

  abort(reason = 'operator-abort') {
    if (this.state === 'ABORTED' || this.state === 'COMPLETE') return this.snapshot();
    return this.transition('ABORTED', { reason });
  }
}

export const campaignTargetPackage = PACKAGE;
