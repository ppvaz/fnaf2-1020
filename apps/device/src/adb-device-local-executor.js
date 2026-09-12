/**
 * Device-local executor for the modern campaign boundary.
 *
 * The host validates and flattens a bound semantic request once.  This module
 * then sends one bounded script to an on-device shell; `/system/bin/hid`
 * owns the inter-action delays on the phone.  It never accepts strategy text,
 * coordinates, or arbitrary shell input from a caller.  Coordinates are
 * resolved here from the already validated profile, at the physical edge.
 * CONTRACT:device-executor-v1 CONTRACT:hid-executor-v1.
 */
import { execFile as execFileCallback, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { HID_DESCRIPTOR, HID_FEATURE_REPORTS, report } from '@fnaf2-1020/adapters';
import { validateExecutorRequest } from './artifact-executor.js';
import { buttonStrokeState } from '@fnaf2-1020/adapters';
import { expandNightBlocks } from './device-local-executor.js';
import { CONTROL_VOCABULARY as V } from '@fnaf2-1020/core/control';

const HID_ID = 92;
const HID_NAME = 'FNAF Timed Touch';
const HID_VID = 6353;
const HID_PID = 61959;
const HID_BUS = 'usb';
// The menu HID waits for InputReader explicitly. The device-local stream
// cannot query readiness without moving its clock, so use the measured
// seven-second attachment bound on the Moto g56 rather than dropping the
// opening reports at the six-second edge.
const DEFAULT_READY_DELAY_MS = 7000;
const MAX_ARM_ATTEMPTS = 3;
const ARM_SETTLE_MS = 600;
// The native screen identity the Cue Helper reports for the office HUD, and
// how often the origin anchor asks for it. The helper's own detector latency
// was measured at 43 ms, so this cadence -- not the classifier round trip --
// becomes the origin's resolution.
const NATIVE_NIGHT_SCREEN = 'FNAF2_NIGHT';
const NATIVE_ANCHOR_POLL_MS = 120;
const ARM_CONFIRM_SAMPLES = 2;
const ARM_OBSERVATION_WINDOW_MS = 3000;
const STARTUP_GRACE_MS = 30000;
const EXIT_CONFIRM_SAMPLES = 3;
// Screens that end a scheduled night on their FIRST positive read once a night
// has been observed. These are not animations a healthy run passes through,
// and two of them put menu controls under the schedule's own tap coordinates.
const TERMINAL_SCREENS = new Set(['title', 'gameover', 'sixam']);
// The title HID is already ready when the intro observes the office. A
// handoff that takes longer than this has already spent the model's measured
// late margin, so the attempt is invalid rather than a silently phase-shifted
// run. This is deliberately a handoff budget, not a contact-duration change.
const NIGHT_HANDOFF_BUDGET_MS = 100;
// A monitor or mask edge is a game-state claim, not merely a HID report. No
// settle constant is asserted here: nothing in the fitted monitor/mask rules
// measures an animation duration, so the ledger samples from the contact
// onward and reports the observed latency instead of grading against a guess.
// This is a per-transition read budget, not a deadline: it bounds what one
// missing effect may spend, since reads are serialised and the next
// transition's sampling waits behind them.
const CONTROL_EFFECT_MAX_SAMPLES = 6;
// A cycle-boundary gate costs one helper READ (85-180 ms measured), one
// corrective contact, and one verifying read. The mask effect appeared
// 358-712 ms after contact across the 2026-09-09 Night 5 runs, so 1200 ms
// covers observe + correct + verify. The budget is spent whether or not a
// correction is needed: releasing early would let each gate advance the
// stream and reintroduce the drift that refuted the per-action host lane.
// Measured on device 2026-09-09 (campaign-2026-09-09T15-18-01): one control
// read is 190 ms at p50 and 374 ms at worst, and the mask effect needs up to
// 712 ms to appear. A gate therefore has to afford up to three reads, a
// corrective contact, and that settle before it may release.
const GATE_BUDGET_MIN_MS = 2200;
// A gate spends its idle rather than a fixed constant, so a plan that idles
// longer buys more attempts and one that idles less is simply not gated.
const GATE_BUDGET_MAX_MS = 4000;
// Keep a measured release reserve between the end of the prior contact and
// the host-owned gate. Fixture timing can shorten this reserve without
// changing the production default or the physical contact duration.
const GATE_BUDGET_RESERVE_MS = 400;
// The mask effect appeared 358-712 ms after contact across 15 transitions in
// the 2026-09-09 runs. Verifying before that measures the old state: the
// first gated run recorded CORRECTION-UNCONFIRMED from a frame captured
// ~200 ms after the corrective press, which could not have shown it yet.
const MASK_SETTLE_MS = 750;
// A single 10 fps frame can be ambiguous without the state being unreadable.
// UNKNOWN still stops the night, but only once it has survived resampling.
// Measured over both 2026-09-09 gated runs: given one ambiguous read, the
// chance the next is also ambiguous is 0.60 at 250 ms, 0.49 at 500 ms and
// bottoms out at 0.37 around 600 ms before rising again. Refusals are
// strongly correlated, so retries only buy anything when they are spaced at
// that minimum -- and five of them are what takes a gate's refusal rate from
// 8% to under 0.2%, which is the difference between a night that aborts and
// one that finishes.
const GATE_READ_ATTEMPTS = 5;
const GATE_RETRY_GAP_MS = 600;
// Measured over 82 frames the fitted rule read confidently across today's
// Night 5 runs: whole-grid mean luma reaches 10 at most with the mask on
// (n=52) and 25 at least with it off (n=30) -- a gap with no overlap. That
// bound refutes mask-on and nothing else. Asserting mask-on from darkness is
// exactly what `mask-calibrate.py` forbids, because a blacked-out office
// reads the same; refuting it is safe, and resolves 71% of the frames the
// anchors refuse.
const MASK_OFF_GRID_LUMA_FLOOR = 25;
// A gate is only placed where the authored plan already has idle to pay for
// it, so gating never displaces a contact the plan's timing was validated on.
const GATE_MIN_SLACK_MS = 2600;
const execFile = promisify(execFileCallback);

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new TypeError(`adb device-local executor: ${message}`); };
const isEpipe = error => typeof error === 'object' && error !== null
  && 'code' in error && error.code === 'EPIPE';

function point(value, control) {
  if (!isRecord(value) || !Number.isInteger(value.x) || !Number.isInteger(value.y) ||
      value.x < 0 || value.y < 0 || value.x >= 2400 || value.y >= 1080)
    fail(`profile.controlMap.${control} is not a bounded screen point`);
  return value;
}

function controlPoint(request, control) {
  return point(request.profile.controlMap?.[control], control);
}

function line(command, fields = {}) {
  return JSON.stringify({ id: HID_ID, command, ...fields });
}

const SHARED_HID_RELEASE = line('report', {
  report: [1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
});

export function sharedScheduleBody(schedule, { armObserveOnce = false } = {}) {
  // Blocking mode hands over only the prefix and waits for the arm to confirm
  // before the remainder is released. Observe-once hands over the prefix and
  // the first gated segment together, so the stream never parks and adds no
  // phase lag -- the later cycle gates are unchanged and still fire.
  if (schedule.gated) return armObserveOnce
    ? [...schedule.gated.prefix, ...schedule.gated.remainderSegments[0]]
    : schedule.gated.prefix;
  const register = JSON.parse(schedule.lines[0]);
  const readyDelay = JSON.parse(schedule.lines[1]);
  if (register.command !== 'register' || readyDelay.command !== 'delay' ||
      readyDelay.duration !== schedule.readyDelayMs)
    fail('shared HID handoff requires a register and ready delay prefix');
  return schedule.lines.slice(2);
}

function addDelay(events, duration) {
  if (!Number.isInteger(duration) || duration < 0) fail(`invalid integer delay ${duration}`);
  // AOSP hid rejects a zero duration. A zero is a valid semantic adjacency,
  // so it is represented by no event rather than a fatal device command.
  if (duration > 0) events.push(line('delay', { duration }));
}

function addReport(events, records) {
  events.push(line('report', { report: report(records) }));
}

function addSingle(events, request, control, duration) {
  const target = controlPoint(request, control);
  if (!Number.isInteger(duration) || duration < 1 || duration > 30000)
    fail(`${control} duration is outside 1..30000 ms`);
  addReport(events, [{ flags: 3, point: target }]);
  addDelay(events, duration);
  addReport(events, [{ flags: 0, point: target }]);
}

function addTwoContact(events, request, first, second, duration) {
  const firstPoint = controlPoint(request, first);
  const secondPoint = controlPoint(request, second);
  if (!Number.isInteger(duration) || duration < 1 || duration > 30000)
    fail(`${first}/${second} duration is outside 1..30000 ms`);
  addReport(events, [{ flags: 3, point: firstPoint }, { flags: 7, point: secondPoint }]);
  addDelay(events, duration);
  // Both records remain in the packet. The HID descriptor's contact count is
  // the number of records consumed, not the number that stays active.
  addReport(events, [{ flags: 0, point: firstPoint }, { flags: 4, point: secondPoint }]);
}

function addAction(events, request, action) {
  const duration = action.durationMs ?? 33;
  if (action.kind === 'ensure' || action.kind === 'tap' || action.kind === 'press' ||
      action.kind === 'hold') {
    addSingle(events, request, action.control, duration);
    return duration;
  }
  if (action.kind === 'observe-left') {
    addSingle(events, request, action.control, duration);
    const maskGap = action.maskGapMs ?? 0;
    const released = Math.max(0, maskGap - duration);
    addDelay(events, released);
    addSingle(events, request, V.mask, 33);
    return duration + released + 33;
  }
  if (action.kind === 'sweep-slot') {
    addSingle(events, request, action.control, action.selectMs);
    addDelay(events, action.settleMs);
    addSingle(events, request, V.cameraFeedLight, action.lightMs);
    return action.selectMs + action.settleMs + action.lightMs;
  }
  if (action.kind === 'compound' && action.compound === 'hallvent') {
    addTwoContact(events, request, V.hallLight, V.rightVentLight, duration);
    return duration;
  }
  if (action.kind === 'compound' && action.compound === 'hallraise') {
    addTwoContact(events, request, V.hallLight, V.monitor, duration);
    return duration;
  }
  if (action.kind === 'compound' && action.compound === 'maskraise') {
    addSingle(events, request, V.mask, 33);
    const gap = action.gapMs ?? 0;
    addDelay(events, Math.max(0, gap - 33));
    addSingle(events, request, action.control === V.hallLight ? V.hallLight : V.monitor, duration);
    return gap + duration;
  }
  if (action.kind === 'compound' && action.compound === 'camdrop') {
    const lightPoint = controlPoint(request, V.cameraFeedLight);
    const monitorPoint = controlPoint(request, V.monitor);
    const lead = action.leadMs ?? 0;
    // camdrop's monitor transition is a second contact. The light is kept
    // active over the monitor press and for its declared tail.
    addReport(events, [{ flags: 3, point: lightPoint }]);
    addDelay(events, lead);
    addReport(events, [{ flags: 3, point: lightPoint }, { flags: 7, point: monitorPoint }]);
    addDelay(events, duration);
    addReport(events, [{ flags: 3, point: lightPoint }, { flags: 4, point: monitorPoint }]);
    addDelay(events, action.tailMs ?? 0);
    addReport(events, [{ flags: 0, point: lightPoint }, { flags: 4, point: monitorPoint }]);
    return lead + duration + (action.tailMs ?? 0);
  }
  fail(`unsupported physical action ${action.kind}/${action.compound ?? ''}`);
}

function actionsOf(block) {
  return block.actions.map(action => ({ action,
    atMs: block.scheduleAtMs + action.atMs - block.atMs }));
}

function compileActionEvents(request, actions, { originAtMs = 0 } = {}) {
  const events = [];
  let cursor = originAtMs;
  for (const { action, atMs } of actions) {
    if (!Number.isFinite(atMs) || atMs < cursor)
      fail(`action ${action.id} overlaps the previous HID macro`);
    addDelay(events, atMs - cursor);
    cursor = atMs + addAction(events, request, action);
  }
  return { events, cursor };
}

/**
 * Return the point at which an artifact action actually asks the game to
 * change monitor state.  A camdrop starts with a flashlight lead, so treating
 * its block start as the monitor edge would falsely accuse a healthy
 * transition before the monitor contact has even been sent.
 */
function monitorPressAtMs(action, atMs) {
  if (action.kind === 'compound' && action.compound === 'camdrop')
    return atMs + (action.leadMs ?? 0);
  if (action.kind === 'compound' && action.compound === 'maskraise')
    return atMs + (action.gapMs ?? 0);
  return atMs;
}

/**
 * The stream remains semantic at this boundary: retain only authored monitor
 * targets and their actual contact times.  The IDs bind effect samples back
 * to the artifact rather than asking a post-run reader to infer a control
 * from otherwise identical HID DOWN/UP pairs.
 */
function monitorTransitionsOf(actions) {
  return Object.freeze(actions
    .filter(({ action }) => typeof action.targetMonitorUp === 'boolean')
    .map(({ action, atMs }) => Object.freeze({
      actionId: action.id,
      cycle: action.cycle,
      atMs: monitorPressAtMs(action, atMs),
      targetMonitorUp: action.targetMonitorUp,
    }))
    .sort((left, right) => left.atMs - right.atMs || left.actionId.localeCompare(right.actionId)));
}

/** Return the actual contact where an action asks the game to toggle mask. */
function maskPressAtMs(action, atMs) {
  // An observe-left macro holds the vent button first, then presses mask. The
  // target belongs to that latter contact, not the start of the visual read.
  if (action.kind === 'observe-left')
    return atMs + Math.max(action.durationMs ?? 33, action.maskGapMs ?? 0);
  return atMs;
}

/**
 * Retain authored mask targets beside their real HID contact times.  `true`
 * means the mask should be on; `false` means it should be off.  This is an
 * evidence ledger only and never feeds state back into the scheduled plan.
 */
function maskTransitionsOf(actions) {
  return Object.freeze(actions
    .filter(({ action }) => typeof action.targetMaskOn === 'boolean')
    .map(({ action, atMs }) => Object.freeze({
      actionId: action.id,
      cycle: action.cycle,
      atMs: maskPressAtMs(action, atMs),
      targetMaskOn: action.targetMaskOn,
    }))
    .sort((left, right) => left.atMs - right.atMs || left.actionId.localeCompare(right.actionId)));
}

/**
 * Split the post-arm stream at the points where the authored plan already
 * idles, and record the mask parity the plan believes holds there.
 *
 * A plan's `targetMaskOn` chain is a simulation: `artifact-commands.mjs`
 * derives it by toggling a modelled state, so every target after the first
 * missed contact describes a device state that no longer exists. Gating at a
 * cycle boundary is what stops one missed toggle from re-aiming the whole
 * night -- and mask-on and monitor-up are mutually exclusive on device, so
 * one mask observation settles both halves of the parity.
 *
 * Gates are placed only where the idle is wide enough to pay for them, so no
 * authored contact moves. The budget is carved out of that idle, never added
 * to it.
 */
function compileGateSegments(request, actions, originAtMs, {
  minSlackMs = GATE_MIN_SLACK_MS,
  budgetMinMs = GATE_BUDGET_MIN_MS,
  budgetMaxMs = GATE_BUDGET_MAX_MS,
  budgetReserveMs = GATE_BUDGET_RESERVE_MS,
} = {}) {
  const ends = actions.map(({ action, atMs }) =>
    atMs + compileActionEvents(request, [{ action, atMs }]).cursor - atMs);
  const points = [];
  for (let index = 0; index + 1 < actions.length; index += 1) {
    const finishedAtMs = ends[index];
    const nextAtMs = actions[index + 1].atMs;
    if (nextAtMs - finishedAtMs < minSlackMs) continue;
    const budgetMs = Math.max(budgetMinMs,
      Math.min(budgetMaxMs, nextAtMs - finishedAtMs - budgetReserveMs));
    const gateAtMs = nextAtMs - budgetMs;
    if (gateAtMs <= finishedAtMs) continue;
    points.push({ index: index + 1, gateAtMs, budgetMs });
  }
  const segments = [];
  const gates = [];
  let from = 0;
  let cursor = originAtMs;
  for (const point of points) {
    const group = actions.slice(from, point.index);
    const compiled = compileActionEvents(request, group, { originAtMs: cursor });
    if (!group.length) fail('gate split produced an empty stream segment');
    const events = [...compiled.events];
    // Park the stream exactly on the gate instant. The host owns the budget
    // between here and the next authored contact, and nothing else does.
    addDelay(events, point.gateAtMs - compiled.cursor);
    segments.push(Object.freeze(events));
    // The plan's own belief about the mask at this instant is the assertion
    // the gate checks; an unstated belief is not invented here.
    const believed = maskTransitionsOf(actions.slice(0, point.index))
      .filter(transition => transition.atMs <= point.gateAtMs).at(-1);
    gates.push(Object.freeze({ gateAtMs: point.gateAtMs, budgetMs: point.budgetMs,
      nextActionId: actions[point.index].action.id,
      cycle: actions[point.index].action.cycle,
      believedMaskOn: believed ? believed.targetMaskOn : null }));
    from = point.index;
    // The host holds the stream for exactly `budgetMs` and releases on the
    // next contact's authored instant, so the resumed segment starts with no
    // lead-in. Compiling it against the gate instead would make every cycle
    // wait the budget twice and drift a further 1200 ms late.
    cursor = actions[point.index].atMs;
  }
  const tail = compileActionEvents(request, actions.slice(from), { originAtMs: cursor });
  segments.push(Object.freeze(tail.events));
  return { segments, gates, cursor: tail.cursor };
}

function compileArmWindow(request, actions) {
  const firstWind = actions.find(({ action }) =>
    action.control === V.wind);
  if (!firstWind) fail('arm-verified schedule has no wind action');

  // The opening prefix ends after the raised-monitor arm. Blocking execution
  // parks here; observe-once execution uses the same boundary only to choose
  // one later frame to inspect without moving the HID stream.
  const openingPrefix = actions.filter(item =>
    item.action.cycle === 'opening' && item.atMs < firstWind.atMs);
  if (openingPrefix.length < 2) fail('arm-verified schedule has no re-armable opening');
  const prefixCompiled = compileActionEvents(request, openingPrefix);
  return Object.freeze({ firstWind, prefix: openingPrefix, prefixCompiled,
    armReadyAtMs: prefixCompiled.cursor });
}

function compileArmSegments(request, actions, register, plan,
  armWindow = compileArmWindow(request, actions), gateTiming = {}) {
  const { firstWind, prefix, prefixCompiled, armReadyAtMs } = armWindow;
  // A minimal Night 1 has a steady CAM 09 flash at 140150 ms and its first
  // wind at 140300 ms. That flash is not part of the arm prefix: it must stay
  // behind the same host gate as the wind, otherwise a missed opening would
  // sit idle until 2 AM before it was allowed to re-arm.
  const remainder = actions.filter(item => !prefix.includes(item));
  if (remainder.some(item => item.atMs < prefix[0].atMs))
    fail('arm-verified schedule has an action before the opening arm');
  const remainderCompiled = compileGateSegments(request, remainder, prefixCompiled.cursor, gateTiming);

  // Re-arm from the already-raised monitor: CAM 11, CAM 09, drop, raise.
  // Keep this derived from the authored opening so the physical retry cannot
  // drift from the policy's own split-arm sequence.
  // Production plans author the camera arm in `opening`; keep the retry
  // sequence tied to that opening rather than any later steady action.
  const rearmStart = prefix[1].atMs;
  const rearmActions = prefix.slice(1).map(item => ({
    ...item, atMs: item.atMs - rearmStart,
  }));
  const rearmCompiled = compileActionEvents(request, rearmActions);
  if (rearmCompiled.cursor < 1) fail('arm re-arm sequence has no physical duration');

  const remainderSegments = remainderCompiled.segments.map(events => [...events]);
  const tail = plan.timing.observeUntilMs - remainderCompiled.cursor;
  if (tail < 0) fail('HID schedule exceeds the observation envelope');
  addDelay(remainderSegments.at(-1), tail);
  // The corrective contact is the plan's own authored mask press, not a
  // coordinate invented for the corrector. A plan with no mask action cannot
  // be parity-corrected, and says so rather than pressing something else.
  const maskAction = remainder.find(({ action }) => action.control === V.mask &&
    typeof action.targetMaskOn === 'boolean');
  const maskCorrection = maskAction
    ? compileActionEvents(request, [{ action: maskAction.action, atMs: 0 }]).events : null;
  return Object.freeze({
    register,
    prefix: Object.freeze(prefixCompiled.events),
    remainderSegments: Object.freeze(remainderSegments.map(events => Object.freeze(events))),
    gates: Object.freeze(remainderCompiled.gates),
    maskCorrection: maskCorrection ? Object.freeze(maskCorrection) : null,
    rearm: Object.freeze(rearmCompiled.events),
    monitorTransitions: Object.freeze({
      prefix: monitorTransitionsOf(prefix),
      remainder: monitorTransitionsOf(remainder),
      rearm: monitorTransitionsOf(rearmActions),
    }),
    maskTransitions: Object.freeze({
      prefix: maskTransitionsOf(prefix),
      remainder: maskTransitionsOf(remainder),
      rearm: maskTransitionsOf(rearmActions),
    }),
    armReadyAtMs: prefixCompiled.cursor,
    // The authored arm window is also the maximum phase error the route can
    // tolerate. A retry that resumes beyond it cannot claim the same stream.
    phaseBudgetMs: plan.armVerification.untilMs,
    rearmDurationMs: rearmCompiled.cursor,
    firstWindAtMs: firstWind.atMs,
  });
}

/**
 * Compile a validated one-night request to the device-local HID event stream.
 * The returned lines contain only the fixed hid vocabulary and are suitable
 * for one bounded `adb shell sh -s` transfer.
 */
export function compileDeviceLocalHidSchedule(request, {
  readyDelayMs = DEFAULT_READY_DELAY_MS, gateTiming = {},
} = {}) {
  validateExecutorRequest(request);
  if (request.artifact.plans.length !== 1) fail('one night per execution is required');
  if (!Number.isInteger(readyDelayMs) || readyDelayMs < 1 || readyDelayMs > 30000)
    fail('readyDelayMs must be an integer in 1..30000');
  const night = request.artifact.plans[0].night;
  const blocks = expandNightBlocks(request, night);
  const plan = request.artifact.plans[0];
  const phaseOffsetMs = plan.timing.phaseOffsetMs ?? 0;
  if (!Number.isInteger(phaseOffsetMs) || phaseOffsetMs < 0 || phaseOffsetMs > 2000)
    fail('plan phase offset is outside 0..2000 ms');
  // The offset is applied once at the phone-local night origin. It preserves
  // every authored interval and every gate budget while moving the complete
  // stream against the game's one-second frame grid.
  const actions = blocks.flatMap(actionsOf)
    .map(item => ({ ...item, atMs: item.atMs + phaseOffsetMs }))
    .sort((a, b) => a.atMs - b.atMs || a.action.id.localeCompare(b.action.id));
  const register = line('register', { name: HID_NAME, vid: HID_VID, pid: HID_PID,
    bus: HID_BUS, descriptor: HID_DESCRIPTOR, feature_reports: HID_FEATURE_REPORTS });
  const events = [register];
  addDelay(events, readyDelayMs);
  const compiled = compileActionEvents(request, actions);
  events.push(...compiled.events);
  const cursor = compiled.cursor;
  if (cursor > plan.timing.observeUntilMs) fail('HID schedule exceeds the observation envelope');
  addDelay(events, plan.timing.observeUntilMs - cursor);
  const armWindow = plan.armVerification
    ? compileArmWindow(request, actions) : undefined;
  // The cycle gates are compiled for BOTH arm modes.
  //
  // `observe-once` used to skip compileArmSegments entirely, which silently
  // threw away the per-cycle state gates and the authored mask correction
  // along with the blocking wait. The 2026-09-12 run showed what that costs:
  // zero gates, a mask parity inversion at the 1 AM edge, and nothing left in
  // the run that could repair it -- every later mask press was swallowed.
  //
  // Only the double-camera ARM is observed once. Everything else keeps
  // observing, which is Pedro's standing direction (2026-09-12). The two modes
  // now differ in one thing only: whether the opening prefix is PARKED on the
  // arm observation, which is what costs delivered phase.
  const gated = armWindow
    ? compileArmSegments(request, actions, register, plan, armWindow, gateTiming) : undefined;
  return Object.freeze({ schema: 'device-local-hid-schedule-v1', version: 1, night,
    readyDelayMs, phaseOffsetMs, actionCount: actions.length, plannedUntilMs: plan.timing.observeUntilMs,
    lines: Object.freeze(events), monitorTransitions: monitorTransitionsOf(actions),
    maskTransitions: maskTransitionsOf(actions),
    ...(armWindow ? { armObservation: Object.freeze({ armReadyAtMs: armWindow.armReadyAtMs,
      firstWindAtMs: armWindow.firstWind.atMs }) } : {}),
    ...(gated ? { gated } : {}) });
}

function boundedSampleText(value) {
  return typeof value === 'string' && value.length <= 160 ? value : null;
}

function compactControlSample(value) {
  const sample = isRecord(value) ? value : {};
  const sequence = typeof sample.sequence === 'string' || Number.isSafeInteger(sample.sequence)
    ? sample.sequence : null;
  const ageUs = typeof sample.ageUs === 'string' && /^\d+$/.test(sample.ageUs)
    ? sample.ageUs : Number.isSafeInteger(sample.ageUs) && sample.ageUs >= 0 ? sample.ageUs : null;
  const screen = typeof sample.screen === 'string' && sample.screen.length <= 80 ? sample.screen : null;
  const monitorUp = typeof sample.monitorUp === 'boolean' ? sample.monitorUp : null;
  const maskOn = typeof sample.maskOn === 'boolean' ? sample.maskOn : null;
  const monitorReason = boundedSampleText(sample.monitorReason ?? sample.reason)
    ?? (monitorUp === null ? 'monitor-state-unavailable' : null);
  const maskReason = boundedSampleText(sample.maskReason)
    ?? (maskOn === null ? 'mask-state-unavailable' : null);
  const maskEvidence = boundedSampleText(sample.maskEvidence);
  const maskSource = boundedSampleText(sample.maskSource);
  // Which detector answered is part of the observation: the camera panel and
  // the office HUD see opposite halves of the monitor state.
  const monitorSource = boundedSampleText(sample.monitorSource);
  const gridLuma = Number.isSafeInteger(sample.gridLuma) && sample.gridLuma >= 0
    ? sample.gridLuma : null;
  // Only ever present on a frame the fitted rule refused, and bounded to the
  // helper's fixed 20x9 sensor so a run bundle cannot grow without limit.
  const maskCells = Array.isArray(sample.maskCells) && sample.maskCells.length === 180 &&
    sample.maskCells.every(Number.isSafeInteger) ? sample.maskCells : null;
  const panelSequence = typeof sample.panelSequence === 'string' ||
    Number.isSafeInteger(sample.panelSequence) ? sample.panelSequence : null;
  // The helper's fixed downward-chevron scores. They are what the cycle gate
  // decides a frame's readability on, so they are retained in the bundle.
  const strokeScore = value => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  };
  const maskButtonDownstroke = strokeScore(sample.maskButtonDownstroke);
  const monitorButtonDownstroke = strokeScore(sample.monitorButtonDownstroke);
  const visualCaptureAt = Number.isFinite(sample.visualCaptureAt) ? sample.visualCaptureAt : null;
  const visualCaptureUncertaintyMs = Number.isFinite(sample.visualCaptureUncertaintyMs) &&
    sample.visualCaptureUncertaintyMs >= 0 ? sample.visualCaptureUncertaintyMs : null;
  return { sequence, ageUs, screen, monitorUp, monitorReason, maskOn, maskReason,
    ...(monitorSource ? { monitorSource } : {}),
    ...(maskSource ? { maskSource } : {}),
    ...(gridLuma === null ? {} : { gridLuma }),
    ...(maskCells ? { maskCells } : {}),
    ...(panelSequence === null ? {} : { panelSequence }),
    ...(maskEvidence ? { maskEvidence } : {}),
    ...(maskButtonDownstroke === null ? {} : { maskButtonDownstroke }),
    ...(monitorButtonDownstroke === null ? {} : { monitorButtonDownstroke }),
    ...(visualCaptureAt === null ? {} : { visualCaptureAt }),
    ...(visualCaptureUncertaintyMs === null ? {} : { visualCaptureUncertaintyMs }) };
}

/**
 * Grade one authored transition from the samples taken after its contact.
 *
 * The latency is measured, not compared against a settle constant, and it is
 * reported as the bracket of the read that first saw the target: the host
 * cannot place a device frame inside its own read without inferring a clock
 * offset, so both bounds are retained and neither is called the answer.
 * `atFirstFrame` marks the case the series cannot separate — a state already
 * at target before the contact looks exactly like an instant effect.
 */
function controlEffectVerdict(reads, signal, target, contactAt) {
  const reasonKey = signal === 'monitorUp' ? 'monitorReason' : 'maskReason';
  const samples = reads.map(read => ({ ...compactControlSample(read.sample),
    readStartedAt: read.readStartedAt, readFinishedAt: read.readFinishedAt,
    sinceContactLowerMs: read.readStartedAt === null ? null : read.readStartedAt - contactAt,
    sinceContactUpperMs: read.readFinishedAt === null ? null : read.readFinishedAt - contactAt }));
  const verdict = (status, reason, latency = null) => ({ status, reason, latency, samples });
  if (samples.some(sample => sample.screen !== null &&
      sample.screen !== 'FNAF2_NIGHT' && sample.screen !== 'UNKNOWN'))
    return verdict('UNKNOWN', 'screen-identity');
  // A repeated frame sequence is the helper's capture cadence, not a fault. It
  // carries no new observation, so it can neither confirm nor refute a target.
  const frames = [];
  for (const sample of samples) {
    if (sample.sequence === null || sample[signal] === null) continue;
    if (frames.length && String(frames.at(-1).sequence) === String(sample.sequence)) continue;
    frames.push(sample);
  }
  if (!frames.length)
    return verdict('UNKNOWN', samples.find(sample => sample[reasonKey])?.[reasonKey]
      ?? `${signal}-state-unavailable`);
  // One frame decides nothing in either direction: a stalled capture shows the
  // pre-contact state as convincingly as a genuinely lost effect does.
  if (frames.length < 2) return verdict('UNKNOWN', 'insufficient-frames');
  const held = frames.findIndex((sample, index) =>
    sample[signal] === target && frames[index + 1]?.[signal] === target);
  if (held !== -1)
    return verdict('PASS', null, { lowerMs: frames[held].sinceContactLowerMs,
      upperMs: frames[held].sinceContactUpperMs, frameAgeUs: frames[held].ageUs,
      atFirstFrame: held === 0 });
  if (frames.some(sample => sample[signal] === target))
    return verdict('UNSTABLE', 'target-not-held-across-frames');
  return verdict('MISSING', 'target-not-observed');
}

function effectTransitions(monitorTransitions = [], maskTransitions = []) {
  return [
    ...monitorTransitions.map(transition => ({ ...transition, signal: 'monitorUp',
      target: transition.targetMonitorUp })),
    ...maskTransitions.map(transition => ({ ...transition, signal: 'maskOn',
      target: transition.targetMaskOn })),
  ].sort((left, right) => left.atMs - right.atMs ||
    left.actionId.localeCompare(right.actionId) || left.signal.localeCompare(right.signal));
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function boundedRemotePath(value, label) {
  if (typeof value !== 'string' ||
      !/^\/data\/local\/tmp\/fnaf2-modern-(?:start|go|retry|fail|rearm|night-go|gate-go|gate-fix)-[A-Za-z0-9._$-]+$/.test(value))
    fail(`${label} is not a bounded device-local control path`);
  return value;
}

function shellSleepMs(milliseconds) {
  if (!Number.isInteger(milliseconds) || milliseconds < 1 || milliseconds > 30000)
    fail('device-local setup delay is outside 1..30000');
  return `sleep ${milliseconds / 1000}`;
}

function appendWrites(lines, path, values) {
  lines.push(`rm -f ${path}`, `: > ${path}`);
  if (values.length === 0) return;
  // One printf per file, not one per line. `printf '%s\n' a b c` reuses its
  // format for every argument, so the whole stream is a single process and a
  // single open/append/close instead of several hundred of them. The per-line
  // form cost ~25 s on the phone before `/system/bin/hid` was even registered,
  // which is the whole of the measured office-to-start-marker latency: the
  // schedule spawned 8.7 s before the office and still did not begin for
  // another 23 s (2026-09-09 instrumented run). On Night 5 that delay is
  // 0/3000 in the model, and the device died to an exhausted music box.
  lines.push(`printf '%s\\n' ${values.map(value => shellQuote(value)).join(' ')} >> ${path}`);
}

export function renderDeviceLocalScript(schedule, { startMarker = '/data/local/tmp/fnaf2-modern-start-$$', armControl = null } = {}) {
  if (!schedule || schedule.schema !== 'device-local-hid-schedule-v1' ||
      !Array.isArray(schedule.lines))
    fail('render requires a compiled device-local HID schedule');
  boundedRemotePath(startMarker, 'render startMarker');
  if (armControl !== null) {
    if (!isRecord(armControl)) fail('render armControl must be an object');
    for (const key of ['go', 'retry', 'fail', 'rearm', 'nightGo', 'gateGo', 'gateFix'])
      boundedRemotePath(armControl[key], `render armControl.${key}`);
  }
  if (schedule.gated && armControl === null)
    fail('gated arm schedule requires render armControl');
  if (!schedule.gated && armControl !== null)
    fail('render armControl requires a gated arm schedule');
  // Android 16's shell domain denies named-pipe creation in /data/local/tmp.
  // A regular file is sufficient here: the complete bounded stream is
  // written before hid starts, and hid owns every inter-action delay locally.
  const stream = '/data/local/tmp/fnaf2-modern-hid-$$.jsonl';
  if (!schedule.gated) {
    const writes = schedule.lines.map(value => `printf '%s\\n' ${shellQuote(value)} >> "$stream"`).join('\n');
    return [
    'set -eu',
    // `stream` is a fixed path prefix; leave the shell PID expansion active so
    // two bounded executor processes cannot share a remote stream file.
    `stream=${stream}`,
    `start_marker=${startMarker}`,
    'hid_pid=',
    'cleanup() {',
    '  set +e',
    '  [ -z "$hid_pid" ] || kill "$hid_pid" 2>/dev/null',
    '  [ -z "$hid_pid" ] || wait "$hid_pid" 2>/dev/null',
    '  rm -f "$start_marker"',
    '  rm -f "$stream"',
    '}',
    'trap cleanup EXIT HUP INT TERM',
    'rm -f "$stream"',
    ': > "$stream"',
    writes,
    'rm -f "$start_marker"',
    // Anchor the host verifier to the phone-side HID launch, not to the ADB
    // process spawn. The stream's ready delay starts only after this point.
    ': > "$start_marker"',
    '/system/bin/hid - < "$stream" >/dev/null &',
    'hid_pid=$!',
    'wait "$hid_pid"',
    'hid_pid=',
    'rm -f "$stream"',
    '',
    ].join('\n');
  }

  const gated = schedule.gated;
  const { go, retry, fail: failed, rearm, nightGo, gateGo, gateFix } = armControl;
  const armPrefix = '/data/local/tmp/fnaf2-modern-arm-prefix-$$.jsonl';
  const segmentDir = '/data/local/tmp/fnaf2-modern-seg-$$';
  const gateCorrection = '/data/local/tmp/fnaf2-modern-gate-fix-$$.jsonl';
  const armRetry = '/data/local/tmp/fnaf2-modern-arm-rearm-$$.jsonl';
  const lines = [
    'set -eu',
    `arm_prefix=${armPrefix}`,
    `seg_dir=${segmentDir}`,
    `gate_correction=${gateCorrection}`,
    `arm_retry=${armRetry}`,
    `start_marker=${startMarker}`,
    `arm_go=${go}`,
    `arm_retry_signal=${retry}`,
    `arm_fail=${failed}`,
    `arm_rearm=${rearm}`,
    `night_go=${nightGo}`,
    `gate_go=${gateGo}`,
    `gate_fix=${gateFix}`,
    `seg_total=${gated.remainderSegments.length}`,
    'hid_pid=',
    'cleanup() {',
    '  set +e',
    '  [ -z "$hid_pid" ] || kill "$hid_pid" 2>/dev/null',
    '  [ -z "$hid_pid" ] || wait "$hid_pid" 2>/dev/null',
    '  rm -f "$start_marker" "$arm_go" "$arm_retry_signal" "$arm_fail" "$arm_rearm" "$night_go"',
    '  rm -f "$gate_go" "$gate_fix" "$gate_correction"',
    '  rm -f "$arm_prefix" "$arm_retry"',
    '  rm -rf "$seg_dir"',
    '}',
    'trap cleanup EXIT HUP INT TERM',
  ];
  appendWrites(lines, '"$arm_prefix"', gated.prefix);
  appendWrites(lines, '"$arm_retry"', gated.rearm);
  appendWrites(lines, '"$gate_correction"', gated.maskCorrection ?? []);
  lines.push('rm -rf "$seg_dir"', 'mkdir -p "$seg_dir"');
  gated.remainderSegments.forEach((events, index) =>
    appendWrites(lines, `"$seg_dir/seg-${String(index).padStart(3, '0')}.jsonl"`, events));
  lines.push(
    'rm -f "$start_marker" "$arm_go" "$arm_retry_signal" "$arm_fail" "$arm_rearm" "$night_go"',
    'rm -f "$gate_go" "$gate_fix"',
    // The setup delay happens after the registration line has reached hid.
    // The marker therefore means "the first authored gameplay action is
    // about to be emitted", not merely "the adb shell was spawned".
    '(',
    `  printf '%s\\n' ${shellQuote(gated.register)}`,
    `  ${shellSleepMs(schedule.readyDelayMs)}`,
    '  : > "$start_marker"',
    // The grid anchor: no plan-relative action may run before the office HUD
    // exists. The host lifecycle observer touches night_go on the first
    // positively observed night frame, aligning the timeline's origin to
    // 12 AM within one poll instead of the measured 30-37 s post-intro
    // spawn offset (2026-09-07 runs: the Night 2 Foxy death). Bounded at
    // 120 s so a night that never starts fails instead of hanging.
    '  night_waits=0',
    '  while [ ! -e "$night_go" ] && [ ! -e "$arm_fail" ]; do',
    '    night_waits=$((night_waits+1))',
    '    if [ "$night_waits" -ge 2400 ]; then',
    '      : > "$arm_fail"',
    '      break',
    '    fi',
    '    sleep 0.05',
    '  done',
    '  cat "$arm_prefix"',
    '  while [ ! -e "$arm_go" ] && [ ! -e "$arm_fail" ]; do',
    '    if [ -e "$arm_retry_signal" ]; then',
    '      rm -f "$arm_retry_signal"',
    '      cat "$arm_retry"',
    '    else',
    '      sleep 0.05',
    '    fi',
    '  done',
    // Each segment ends parked on a cycle boundary the plan already idles
    // through. The host owns that budget: it observes the mask parity, emits
    // the authored corrective press through `gate_fix` if the device
    // disagrees with the plan, and releases with `gate_go`. The stream never
    // advances on its own here, so a host that goes quiet stops the night
    // instead of running it blind.
    '  if [ -e "$arm_go" ]; then',
    '    seg_index=0',
    '    for seg in "$seg_dir"/seg-*.jsonl; do',
    '      cat "$seg"',
    '      seg_index=$((seg_index+1))',
    '      [ "$seg_index" -ge "$seg_total" ] && break',
    '      while [ ! -e "$gate_go" ] && [ ! -e "$arm_fail" ]; do',
    '        if [ -e "$gate_fix" ]; then',
    '          rm -f "$gate_fix"',
    '          cat "$gate_correction"',
    '        else',
    '          sleep 0.02',
    '        fi',
    '      done',
    '      [ -e "$arm_fail" ] && break',
    '      rm -f "$gate_go"',
    '    done',
    '  fi',
    ') | /system/bin/hid - >/dev/null &',
    'hid_pid=$!',
    'wait "$hid_pid"',
    'hid_pid=',
    '',
  );
  return lines.join('\n');
}

/**
 * @param {string} adb
 * @param {string} serial
 * @param {string} script
 * @param {(chunk: string) => void} [onOutput]
 */
function runAdbScript(adb, serial, script, onOutput = () => {}) {
  const child = spawn(adb, ['-s', serial, 'shell', 'sh', '-s'], {
    stdio: ['pipe', 'ignore', 'pipe'], shell: false,
  });
  let stderr = '';
  const promise = new Promise((resolve, reject) => {
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); onOutput(chunk.toString()); });
    child.on('error', reject);
    child.on('close', code => code === 0
      ? resolve()
      : reject(new Error(`device-local HID shell exited with ${code}: ${stderr.trim()}`)));
  });
  // A game-over watchdog can terminate the remote shell while the bounded
  // script is still being flushed into adb.  Node otherwise reports the
  // resulting EPIPE as an unhandled stream error; the child close/error event
  // remains the authoritative transport result.
  child.stdin.on('error', error => {
    if (!isEpipe(error)) child.emit('error', error);
  });
  child.stdin.end(script);
  return { child, promise };
}

function runAdbProgram(adb, serial, program, args) {
  const child = spawn(adb, ['-s', serial, 'shell', 'sh', '-s', '--', ...args], {
    stdio: ['pipe', 'pipe', 'pipe'], shell: false,
  });
  let stdout = '';
  let stderr = '';
  const promise = new Promise((resolve, reject) => {
    child.stdout?.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
  child.stdin.on('error', error => {
    if (!isEpipe(error)) child.emit('error', error);
  });
  child.stdin.end(program);
  return { child, promise };
}

async function pushFile(adb, serial, source, destination) {
  try {
    await execFile(adb, ['-s', serial, 'push', source, destination], { timeout: 30000, maxBuffer: 1024 * 1024 });
  } catch (error) {
    throw new Error(`could not push ${source}: ${error.stderr?.trim() || error.message}`);
  }
}

async function remoteHash(adb, serial, path) {
  try {
    const result = await execFile(adb, ['-s', serial, 'shell', 'sha256sum', path], {
      timeout: 10000, maxBuffer: 1024 * 1024,
    });
    return result.stdout.trim().split(/\s+/)[0] ?? '';
  } catch (error) {
    throw new Error(`could not hash remote asset ${path}: ${error.stderr?.trim() || error.message}`);
  }
}

async function removeRemoteFiles(adb, serial, paths) {
  const safe = paths.filter(value => typeof value === 'string' && /^\/data\/local\/tmp\/fnaf2-[A-Za-z0-9._-]+$/.test(value));
  if (!safe.length) return;
  try { await execFile(adb, ['-s', serial, 'shell', 'rm', '-f', ...safe], { timeout: 10000, maxBuffer: 1024 * 1024 }); }
  catch { /* cleanup is best effort; the active HID process is handled separately */ }
}

async function waitForRemoteFile(adb, serial, path, {
  timeoutMs = 15000, pollMs = 100,
  processDone = () => !!false, processResult = async () => null,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await execFile(adb, ['-s', serial, 'shell', 'test', '-e', path], {
        timeout: 3000, maxBuffer: 1024 * 1024,
      });
      return;
    } catch { /* the marker is not visible yet */ }
    if (processDone()) {
      const result = await processResult();
      throw new Error(`machine device program exited before HID readiness (${result?.code ?? 'unknown'}): ${result?.stderr?.trim() || result?.stdout?.trim() || 'no output'}`);
    }
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  throw new Error(`machine HID readiness marker was not observed before ${timeoutMs}ms`);
}

/**
 * Retain the target's ANR record for the run.  An `Input dispatching timed
 * out` entry says the app stopped consuming MotionEvents, which is the same
 * class of fault as a swallowed control tap: the run bundle should carry that
 * either way, so the absence of one is recorded as deliberately as a hit.
 */
async function readAnrEvents(adb, serial) {
  try {
    const { stdout } = await execFile(adb, ['-s', serial, 'logcat', '-b', 'events', '-d', '-s', 'am_anr'],
      { timeout: 10000, maxBuffer: 1024 * 1024 });
    return stdout.split('\n').filter(line => line.includes('am_anr'))
      .slice(-8).map(line => line.trim().slice(0, 300));
  } catch {
    return null;
  }
}

async function touchRemote(adb, serial, path) {
  boundedRemotePath(path, 'remote arm signal');
  try {
    await execFile(adb, ['-s', serial, 'shell', 'touch', path], {
      timeout: 10000, maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`could not signal device-local arm gate: ${error.stderr?.trim() || error.message}`);
  }
}

export class AdbDeviceLocalArtifactExecutor {
  /** @param {any} options */
  constructor(options = {}) {
    const { serial, adb = 'adb', readyDelayMs = DEFAULT_READY_DELAY_MS,
      observe = null, observeArm = null, observeControlState = null,
      sharedHid = null, pollMs = 1000, onEvent = () => {}, onOutput = () => {}, timing = {},
      nightReleaseOwner = 'observer' } = options;
    if (typeof serial !== 'string' || serial.length === 0) throw new TypeError('device-local executor requires an ADB serial');
    if (observe !== null && typeof observe !== 'function') throw new TypeError('device-local executor observe must be a function');
    if (observeArm !== null && typeof observeArm !== 'function') throw new TypeError('device-local executor observeArm must be a function');
    if (observeControlState !== null && typeof observeControlState !== 'function')
      throw new TypeError('device-local executor observeControlState must be a function');
    if (sharedHid !== null && typeof sharedHid !== 'function')
      throw new TypeError('device-local executor sharedHid must be a function');
    if (!['observer', 'port'].includes(nightReleaseOwner))
      throw new TypeError('device-local executor nightReleaseOwner must be observer or port');
    if (!Number.isInteger(pollMs) || pollMs < 250 || pollMs > 10000)
      throw new TypeError('device-local executor pollMs must be an integer in 250..10000');
    const timingValues = {
      armSettleMs: timing.armSettleMs ?? ARM_SETTLE_MS,
      armObservationWindowMs: timing.armObservationWindowMs ?? ARM_OBSERVATION_WINDOW_MS,
      gateRetryGapMs: timing.gateRetryGapMs ?? GATE_RETRY_GAP_MS,
      maskSettleMs: timing.maskSettleMs ?? MASK_SETTLE_MS,
      pollMs: timing.pollMs ?? pollMs,
      gateMinSlackMs: timing.gateMinSlackMs ?? GATE_MIN_SLACK_MS,
      gateBudgetMinMs: timing.gateBudgetMinMs ?? GATE_BUDGET_MIN_MS,
      gateBudgetMaxMs: timing.gateBudgetMaxMs ?? GATE_BUDGET_MAX_MS,
      gateBudgetReserveMs: timing.gateBudgetReserveMs ?? GATE_BUDGET_RESERVE_MS,
    };
    for (const [name, value] of Object.entries(timingValues)) {
      if (!Number.isInteger(value) || value < 0)
        throw new TypeError(`device-local executor ${name} must be a non-negative integer`);
    }
    this.serial = serial; this.adb = adb; this.readyDelayMs = readyDelayMs;
    this.observe = observe; this.observeArm = observeArm;
    this.observeControlState = observeControlState; this.pollMs = timingValues.pollMs;
    this.armSettleMs = timingValues.armSettleMs;
    this.armObservationWindowMs = timingValues.armObservationWindowMs;
    this.gateRetryGapMs = timingValues.gateRetryGapMs;
    this.maskSettleMs = timingValues.maskSettleMs;
    this.gateTiming = { minSlackMs: timingValues.gateMinSlackMs,
      budgetMinMs: timingValues.gateBudgetMinMs, budgetMaxMs: timingValues.gateBudgetMaxMs,
      budgetReserveMs: timingValues.gateBudgetReserveMs };
    this.sharedHid = sharedHid;
    // `observer`: the first authoritative office frame releases the shared
    // schedule (the 1 Hz classifier draws the night's epoch). `port`: that
    // frame only authorizes the night, and the composition calls
    // releaseNight() at an instant it placed against the game's grid
    // (night-anchor.js). Unshared runs ignore it.
    this.nightReleaseOwner = nightReleaseOwner;
    this.onEvent = onEvent; this.onOutput = onOutput;
    this.child = null; this.running = false; this.aborted = false;
    this.stopProcess = null;
    this.nightReleaseResolve = null;
    this.nightReleaseAction = null;
    this.nightReleaseGranted = false;
    this.nightReleaseGrantedAt = null;
    this.nightAuthorizedListeners = new Set();
    this.deviceLocal = true;
  }

  /**
   * Resolves with the observer's sample time on the next authoritative office
   * frame of a port-owned night. The composition places the release from this
   * edge: its own lifecycle poll is slower, and on night5-anchor1 it planned
   * 2134 ms after this edge, which cost the anchor two whole game seconds.
   */
  whenNightAuthorized() {
    return new Promise(resolve => this.nightAuthorizedListeners.add(resolve));
  }

  // The modern campaign opens and qualifies one HID process on the title
  // screen. The intro calls this after its setup tap; a retry that starts
  // after intro consumes the already-granted release immediately.
  releaseNight() {
    const grantedAt = Date.now();
    this.nightReleaseGranted = true;
    this.nightReleaseGrantedAt = grantedAt;
    this.nightReleaseResolve?.();
    this.nightReleaseResolve = null;
    if (this.nightReleaseAction) void this.nightReleaseAction(grantedAt);
  }

  // Cleanup must wake an observer waiting for the intro handoff without
  // starting the schedule as a side effect of stopping it.
  unblockNightRelease() {
    this.nightReleaseGranted = true;
    this.nightReleaseResolve?.();
    this.nightReleaseResolve = null;
  }

  async execute(request) {
    validateExecutorRequest(request);
    if (request.mode !== 'live') fail('physical executor accepts live requests only');
    if (this.running) fail('executor is already running');
    const armVerification = request.artifact.plans[0].armVerification;
    const armObserveOnce = armVerification?.mode === 'observe-once';
    if (armVerification && typeof this.observeArm !== 'function')
      fail('arm-verified artifact requires an exact camera observation port');
    const schedule = compileDeviceLocalHidSchedule(request, {
      readyDelayMs: this.readyDelayMs, gateTiming: this.gateTiming,
    });
    // Startup phase anchors. Without them the only timestamp between night
    // entry and the first action was the start marker, so two separate
    // attempts to remove the measured 26-30 s office-to-marker latency each
    // claimed success that the evidence did not support.
    this.onEvent({ type: 'hid.execute-entered', at: Date.now() });
    this.running = true; this.aborted = false;
    const sharedHid = this.sharedHid?.() ?? null;
    const sharedMode = sharedHid !== null;
    if (sharedMode && typeof sharedHid.write !== 'function')
      fail('shared HID handoff requires a line writer');
    const releaseAlreadyGranted = this.nightReleaseGranted;
    const releaseAlreadyGrantedAt = this.nightReleaseGrantedAt;
    this.nightReleaseGranted = false;
    this.nightReleaseGrantedAt = null;
    this.nightReleaseAction = null;
    const tag = `${globalThis.process.pid}-${Date.now()}`;
    const startMarker = `/data/local/tmp/fnaf2-modern-start-${tag}`;
    const armControl = schedule.gated ? {
      go: `/data/local/tmp/fnaf2-modern-go-${tag}`,
      retry: `/data/local/tmp/fnaf2-modern-retry-${tag}`,
      fail: `/data/local/tmp/fnaf2-modern-fail-${tag}`,
      rearm: `/data/local/tmp/fnaf2-modern-rearm-${tag}`,
      nightGo: `/data/local/tmp/fnaf2-modern-night-go-${tag}`,
      gateGo: `/data/local/tmp/fnaf2-modern-gate-go-${tag}`,
      gateFix: `/data/local/tmp/fnaf2-modern-gate-fix-${tag}`,
    } : null;
    let process = null;
    let resolveSharedProcess = null;
    let sharedStopped = false;
    let sharedFeedTail = Promise.resolve();
    /** @type {(lines: readonly string[], options?: {onFirstWrite?: (at: number) => void}) => Promise<void>} */
    const feedShared = (lines, { onFirstWrite } = {}) => {
      if (!sharedMode) return Promise.resolve();
      const task = sharedFeedTail.then(async () => {
        let first = true;
        for (const value of lines) {
          await sharedHid.write(value);
          if (first) {
            first = false;
            onFirstWrite?.(Date.now());
          }
        }
      });
      // A failed write must not poison the queue forever; its caller still
      // receives the failure and the run cleanup owns the final release.
      sharedFeedTail = task.then(() => {}, () => {});
      return task;
    };
    const processPromise = sharedMode
      ? new Promise((resolve, reject) => {
          resolveSharedProcess = resolve;
        })
      : (() => {
          process = runAdbScript(this.adb, this.serial,
            renderDeviceLocalScript(schedule, { startMarker, armControl }), this.onOutput);
          return process.promise;
        })();
    this.onEvent(sharedMode
      ? { type: 'hid.handoff-reused', at: Date.now(), source: 'menu', readyDelayMs: 0 }
      : { type: 'hid.shell-spawned', at: Date.now(), readyDelayMs: schedule.readyDelayMs });
    this.child = sharedMode ? sharedHid : process.child;
    const processIdentity = this.child;
    this.stopProcess = async () => {
      this.unblockNightRelease();
      if (sharedMode) {
        if (sharedStopped) return;
        sharedStopped = true;
        try { await feedShared([SHARED_HID_RELEASE]); }
        finally { resolveSharedProcess?.({ code: 0, shared: true }); }
        return;
      }
      try {
        if (armControl) await touchRemote(this.adb, this.serial, armControl.fail);
      } finally {
        process.child.kill('SIGTERM');
      }
    };
    let processDone = false;
    const observedProcessPromise = processPromise.then(value => {
      processDone = true;
      return value;
    }, error => {
      processDone = true;
      throw error;
    });
    // The marker wait below owns the first await; keep a launch failure from
    // becoming an unhandled rejection while that wait is in progress.
    observedProcessPromise.catch(() => {});
    let observedTerminal = null;
    let observedExitState = null;
    let armVerified = !armVerification || armObserveOnce;
    let armObservation = null;
    let armObservationStatus = armVerification ? (armObserveOnce ? 'UNRESOLVED' : 'PENDING') : null;
    let lastArmObservation = null;
    let armFailure = null;
    let armAttempt = 1;
    let nightObserved = false;
    // The night ORIGIN, sharpened. `observe` is a full 2400x1080 screencap
    // piped into the Python lifecycle classifier, so a night confirmed by it
    // is stamped up to a capture-and-classify round trip after the frame that
    // showed it: the 2026-09-11 observe-once run reconstructed
    // origin.bracketedByMs = 1852 against a 1000 ms model phase period, which
    // leaves the delivered phase unconstrained.
    //
    // The native Cue Helper read already names the screen at ~43 ms, so it can
    // say WHEN inside the bracket the authority establishes. It is never
    // allowed to say WHETHER: `observe` remains the authority on a night
    // running, per the rule that a detector which knows one way to be dead is
    // not what says you are alive. The refinement is clamped to the
    // authority's own bracket, so it can only ever SHRINK it.
    let nativeNightAt = null;
    let nativeLastNotNightAt = null;
    let lastNonNightObserveAt = null;
    let nativeAnchorSamples = 0;
    /** @type {number | null} */
    let nightAnchoredAt = null;
    /** @type {number | null} */
    let nightReleasedAt = null;
    let nightGoEmitted = false;
    let sharedReleaseInFlight = false;
    let sharedReleaseTask = null;
    let handoffDelayMs = null;
    let handoffFailure = null;
    let nonNightSamples = 0;
    const buildArmResult = () => armVerification ? {
      status: armObserveOnce ? armObservationStatus : 'PASS',
      cameras: armVerification.cameras, viewing: armVerification.viewing,
      observation: armObservation,
      ...(armObserveOnce ? { mode: 'observe-once' } : {}),
    } : undefined;
    let stopObserver = false;
    let observer = Promise.resolve();
    let armObserver = Promise.resolve();
    const effectObservers = [];
    // Correction read-backs, deliberately OFF the schedule's critical path:
    // they are awaited at teardown so a night never ends with one in flight,
    // but they never hold a gate release. See the gate body for why.
    const verifyTasks = [];
    let completionTimer = null;
    /** @type {(phase: string, originAt: number, monitorTransitions: any[], maskTransitions: any[], options?: any) => void} */
    let startControlEffectLedger = () => {};
    // Hoisted for the same reason `startControlEffectLedger` is: the shared
    // night release can fire BEFORE execute() reaches the const that defines
    // the real gate ledger, and a direct reference there is a temporal dead
    // zone error that kills the run ("startGateLedger is not defined",
    // observed on device 2026-09-12). The release records its origin; whoever
    // is later -- the release or the definition -- starts the ledger.
    let startGateLedgerHook = null;
    let pendingGateLedgerAt = null;
    const requestGateLedger = at => {
      pendingGateLedgerAt = at;
      if (startGateLedgerHook && schedule.gated) {
        const origin = pendingGateLedgerAt;
        pendingGateLedgerAt = null;
        startGateLedgerHook(origin, schedule.gated);
      }
    };
    const recordNightGo = (at, source) => {
      if (nightAnchoredAt === null) nightAnchoredAt = at;
      if (nightGoEmitted) return;
      nightGoEmitted = true;
      this.onEvent({ type: 'hid.night-go', at: nightAnchoredAt,
        ...(source ? { source } : {}) });
    };
    const startSharedSchedule = requestedAt => {
      if (!sharedMode || sharedReleaseInFlight || stopObserver ||
          this.child !== processIdentity || !this.running)
        return sharedReleaseTask ?? Promise.resolve();
      sharedReleaseInFlight = true;
      sharedReleaseTask = (async () => {
        recordNightGo(requestedAt, 'intro-handoff');
        nightObserved = true;
        let firstWriteAt = null;
        try {
          await feedShared(sharedScheduleBody(schedule, { armObserveOnce }), {
            onFirstWrite: at => {
              firstWriteAt = at;
              handoffDelayMs = at - requestedAt;
              this.onEvent({ type: 'hid.handoff', requestedAt, firstWriteAt: at,
                delayMs: handoffDelayMs, budgetMs: NIGHT_HANDOFF_BUDGET_MS });
              if (handoffDelayMs > NIGHT_HANDOFF_BUDGET_MS) {
                handoffFailure = new Error(
                  `night handoff was ${handoffDelayMs}ms late ` +
                  `(budget ${NIGHT_HANDOFF_BUDGET_MS}ms)`);
                this.onEvent({ type: 'hid.handoff.abort', delayMs: handoffDelayMs,
                  budgetMs: NIGHT_HANDOFF_BUDGET_MS, reason: 'late-night-handoff' });
                throw handoffFailure;
              }
            },
          });
          if (firstWriteAt === null) throw new Error('night handoff wrote no HID action');
          // `firstWriteAt` is assigned inside the onFirstWrite callback, so the
          // null check above does not narrow it for later uses. Snapshot it.
          const releasedAt = firstWriteAt;
          nightReleasedAt = releasedAt;
          if (schedule.gated) {
            startControlEffectLedger('prefix', firstWriteAt,
              schedule.gated.monitorTransitions.prefix, schedule.gated.maskTransitions.prefix,
              { originUncertaintyMs: 50, attempt: 1,
                phaseEndMs: schedule.gated.armReadyAtMs });
            // Observe-once never waits for an arm release, so the wall time
            // that corresponds to plan cursor `armReadyAtMs` is simply where
            // the unparked prefix ends. That is the gate ledger's origin, and
            // it is started here rather than deferred: the release is the last
            // moment that knows it, and a one-shot drain installed earlier in
            // execute() would run BEFORE this ever set it.
            const prefixEndsAt = releasedAt + schedule.gated.armReadyAtMs;
            if (armObserveOnce) requestGateLedger(prefixEndsAt);
          } else {
            startControlEffectLedger('full', firstWriteAt,
              schedule.monitorTransitions, schedule.maskTransitions,
              { phaseEndMs: schedule.plannedUntilMs });
          }
          completionTimer = setTimeout(() => {
            void this.stopProcess?.().catch(() => {});
          }, Math.min(2147483647, Math.max(1000, schedule.plannedUntilMs + 10000)));
          this.onEvent({ type: 'hid.night-go-released', at: firstWriteAt,
            originUncertaintyMs: 50, shared: true, handoffDelayMs });
        } catch (error) {
          handoffFailure ??= error;
          try { await this.stopProcess(); } catch { /* cleanup owns the final state */ }
        }
      })();
      return sharedReleaseTask;
    };
    this.nightReleaseAction = sharedMode ? startSharedSchedule : null;
    try {
      // The marker is created on the phone immediately before `/system/bin/hid`
      // starts consuming the preloaded stream. Anchoring here avoids charging
      // ADB connection setup against the plan-relative ready delay and arm
      // deadline. A shared title HID is already past that boundary, so its
      // schedule starts as soon as this executor is handed the ready process.
      if (!sharedMode) await waitForRemoteFile(this.adb, this.serial, startMarker, {
        timeoutMs: 60000,
        processDone: () => processDone,
        processResult: () => observedProcessPromise,
      });
      const startedAt = Date.now();
      this.onEvent({ type: 'hid.schedule-start', startedAt, actionCount: schedule.actionCount,
        phaseOffsetMs: schedule.phaseOffsetMs });
      const startupDeadline = startedAt + STARTUP_GRACE_MS;
      // These are observation-only ACKs. They never alter the HID stream or
      // its timing: a failed/late state acknowledgement is evidence of a
      // desync, not a command to retry or compensate mid-night.
      let controlReadTail = Promise.resolve();
      const controlStillRunning = () => !stopObserver && this.child === processIdentity && this.running;
      const waitUntil = async deadline => {
        while (controlStillRunning()) {
          const remainingMs = deadline - Date.now();
          if (remainingMs <= 0) return true;
          await new Promise(resolve => setTimeout(resolve, Math.min(remainingMs, 50)));
        }
        return false;
      };
      const readControlState = () => {
        let readStartedAt = null;
        const read = controlReadTail.then(async () => {
          if (!controlStillRunning()) return { sample: null, readStartedAt, readFinishedAt: Date.now() };
          readStartedAt = Date.now();
          try {
            const sample = await this.observeControlState();
            return { sample, readStartedAt, readFinishedAt: Date.now() };
          } catch {
            return { sample: null, readStartedAt, readFinishedAt: Date.now() };
          }
        });
        // A bad diagnostic read must not poison later, independent samples.
        controlReadTail = read.then(() => {}, () => {});
        return read;
      };
      startControlEffectLedger = (phase, originAt, monitorTransitions, maskTransitions,
        { timelineOffsetMs = 0, originUncertaintyMs = 0, attempt = null, phaseEndMs = null } = {}) => {
        if (typeof this.observeControlState !== 'function') return;
        const transitions = effectTransitions(monitorTransitions, maskTransitions)
          .map(transition => ({ ...transition, relativeAtMs: transition.atMs - timelineOffsetMs }));
        if (!transitions.length) return;
        // Only the next authored transition of the SAME signal may legitimately
        // change it, so that contact — or the phase's own end — bounds each
        // observation window. Both come from the compiled plan, not a constant.
        const windowEndsMs = transitions.map((transition, index) => transitions
          .slice(index + 1).find(later => later.signal === transition.signal)?.relativeAtMs
          ?? phaseEndMs);
        this.onEvent({ type: 'control.effect.phase', phase, originAt, originUncertaintyMs,
          ...(attempt === null ? {} : { attempt }), transitionCount: transitions.length });
        const ledger = (async () => {
          for (const [index, transition] of transitions.entries()) {
            if (!controlStillRunning()) break;
            const contactAt = originAt + transition.relativeAtMs;
            const windowEndMs = windowEndsMs[index];
            const windowEndAt = windowEndMs === null ? Infinity : originAt + windowEndMs;
            this.onEvent({ type: 'control.effect.expected', phase, actionId: transition.actionId,
              cycle: transition.cycle, signal: transition.signal, target: transition.target,
              contactAt, windowEndAt, sampleBudget: CONTROL_EFFECT_MAX_SAMPLES,
              originAt, originUncertaintyMs, ...(attempt === null ? {} : { attempt }) });
            const reads = [];
            if (!await waitUntil(contactAt)) break;
            while (reads.length < CONTROL_EFFECT_MAX_SAMPLES && Date.now() < windowEndAt) {
              if (!controlStillRunning()) break;
              const read = await readControlState();
              if (read.readStartedAt === null) break;
              reads.push(read);
              this.onEvent({ type: 'control.effect.sample', phase, actionId: transition.actionId,
                cycle: transition.cycle, signal: transition.signal, target: transition.target,
                sampleIndex: reads.length,
                readStartedAt: read.readStartedAt, readFinishedAt: read.readFinishedAt,
                sinceContactLowerMs: read.readStartedAt - contactAt,
                sinceContactUpperMs: read.readFinishedAt - contactAt,
                sample: compactControlSample(read.sample), ...(attempt === null ? {} : { attempt }) });
              // Two distinct frames holding the target end the read early: the
              // measurement is complete and the budget belongs to the next one.
              if (controlEffectVerdict(reads, transition.signal, transition.target,
                contactAt).status === 'PASS') break;
            }
            if (!reads.length) continue;
            const verdict = controlEffectVerdict(reads, transition.signal, transition.target, contactAt);
            const evidence = transition.signal === 'maskOn'
              ? verdict.samples.find(sample => sample.maskEvidence)?.maskEvidence ?? 'diagnostic-unqualified'
              : 'calibrated';
            this.onEvent({ type: 'control.effect.result', phase, actionId: transition.actionId,
              cycle: transition.cycle, signal: transition.signal, target: transition.target,
              contactAt, windowEndAt, resultAt: Date.now(), status: verdict.status,
              reason: verdict.reason, latency: verdict.latency, sampleCount: reads.length,
              evidence, samples: verdict.samples, ...(attempt === null ? {} : { attempt }) });
          }
        })().catch(() => {
          // A diagnostic observer must never become a second actuator failure
          // mode. The absent result is visible from expected/sample events.
          this.onEvent({ type: 'control.effect.observer-error', phase,
            ...(attempt === null ? {} : { attempt }) });
        });
        effectObservers.push(ledger);
      };
      /**
       * Hold each cycle boundary until the device's mask parity matches what
       * the plan believes. The plan's targets are a simulated toggle chain,
       * so the first missed contact re-aims every action after it; this is
       * what bounds that damage to a single cycle.
       *
       * Mask-on and monitor-up are mutually exclusive on the device, so one
       * mask observation settles both halves -- and the mask detector is the
       * one that held across both 2026-09-09 Night 5 runs.
       */
      const startGateLedger = (armGoAt, gated) => {
        if (typeof this.observeControlState !== 'function' || !gated.gates.length) return;
        const ledger = (async () => {
          // The stream runs on the phone's own clock from the arm release, so
          // a gate held past its budget leaves it behind this model. Carrying
          // that lag forward keeps every later release after the stream has
          // actually parked: releasing early would let the marker pre-exist,
          // skip the gate, and fire the next contact a whole budget early.
          let lagMs = 0;
          let releaseTouchMs = 0;
          for (const entry of gated.gates) {
            if (!controlStillRunning()) break;
            const reachedAt = armGoAt + (entry.gateAtMs - gated.armReadyAtMs) + lagMs;
            let releaseAt = reachedAt + entry.budgetMs;
            if (!await waitUntil(reachedAt)) break;
            // One ambiguous frame is not an unreadable state. Resample within
            // the budget so UNKNOWN means the state stayed unreadable, not
            // that a single 10 fps capture landed mid-animation.
            const reads = [];
            let sample = null;
            for (let attempt = 0; attempt < GATE_READ_ATTEMPTS; attempt += 1) {
              if (!controlStillRunning()) break;
              // Spaced, not back to back: consecutive reads a frame apart see
              // the same game moment, so an animation that refuses one read
              // refuses all three and a night ends on a state that would have
              // resolved on its own.
              if (attempt > 0) await waitUntil(Date.now() + this.gateRetryGapMs);
              const read = await readControlState();
              reads.push({ startedAt: read.readStartedAt, finishedAt: read.readFinishedAt });
              sample = compactControlSample(read.sample);
              // Keep reading until the STROKES answer. A grid answer on a
              // frame with no button signature is what produced the spurious
              // corrections; it is no longer a reason to stop looking.
              const strokeRead = buttonStrokeState(sample);
              if (strokeRead.maskOn !== null) break;
              if (strokeRead.office && sample.maskOn !== null) break;
              // No stroke source AT ALL is a different thing from a stroke
              // source that sees no signature. A helper build that does not
              // publish the chevrons must still be gradeable by the grid rule;
              // what is removed is the luma GUESS, not the grid opinion.
              if (!strokeRead.available && sample.maskOn !== null) break;
              if ((!strokeRead.available || strokeRead.office) &&
                entry.believedMaskOn === true && sample.gridLuma !== null &&
                sample.gridLuma >= MASK_OFF_GRID_LUMA_FLOOR) break;
            }
            if (!sample) break;
            // The helper's fixed button chevrons decide this, not the 20x9 grid.
            //
            // Each state hides one button and keeps the other, so the pair is a
            // direct read of both facts: both drawn is the office, a missing
            // mask button is the monitor up, and a missing MONITOR button is
            // the mask on -- the mirror the operator named on 2026-09-12, whose
            // game fact actuator.mjs already records ("while the mask is up or
            // coming off, the monitor bar is not drawn").
            //
            // The grid rule stays as a SECOND opinion and only where the
            // strokes already say the office is drawn. What is gone is the
            // grid-luma refutation: it let a gate correct on a frame whose
            // screen the classifier could not even identify, and on the
            // 2026-09-12T02-20 run every single correction did exactly that
            // (71% across all runs, against 30% of gates that agreed). A
            // correction ACTS -- it presses the mask -- so a wrong one does not
            // report an inversion, it creates one.
            // `tools/device/intersection-state-gate.mjs` has stated this rule
            // all along: a missing stroke score is a refusal, never a luma
            // fallback.
            const strokes = buttonStrokeState(sample);
            // The bright-grid refutation is KEPT -- it is the abort case, and
            // without it a night ends instead of correcting -- but it may no
            // longer decide a frame whose stroke source is present and shows no
            // signature. That is the unreadable frame, and it is where the
            // spurious corrections came from.
            const lumaMayDecide = !strokes.available || strokes.office;
            const refutesMaskOn = lumaMayDecide && sample.maskOn === null &&
              entry.believedMaskOn === true && sample.gridLuma !== null &&
              sample.gridLuma >= MASK_OFF_GRID_LUMA_FLOOR;
            const observedMaskOn = strokes.maskOn !== null ? strokes.maskOn
              : strokes.office && sample.maskOn !== null ? sample.maskOn
                : !strokes.available && sample.maskOn !== null ? sample.maskOn
                  : refutesMaskOn ? false
                    : null;
            const maskEvidenceSource = strokes.maskOn !== null
              ? `button-stroke:${strokes.signature}`
              : strokes.office && sample.maskOn !== null ? 'office-stroke+mask-rule'
                : !strokes.available && sample.maskOn !== null ? 'mask-rule'
                  : refutesMaskOn ? 'grid-luma-refutation'
                    : strokes.available ? 'stroke-signature-absent' : 'stroke-unavailable';
            let corrected = false;
            let correctedAt = null;
            let status;
            if (entry.believedMaskOn === null || observedMaskOn === null) {
              // A gate that cannot see the state has not verified anything.
              // Releasing here would run the rest of the night on an
              // assumption, which is the failure this gate exists to end.
              status = 'UNKNOWN';
            } else if (observedMaskOn === entry.believedMaskOn) {
              status = 'AGREED';
            } else {
              status = 'CORRECTED';
              corrected = true;
              if (sharedMode) await feedShared(gated.maskCorrection ?? []);
              else await touchRemote(this.adb, this.serial, armControl.gateFix);
              correctedAt = Date.now();
            }
            // The correction's read-back USED TO hold the stream:
            //
            //   releaseAt = Math.max(releaseAt, correctedAt + maskSettleMs + 250);
            //   await waitUntil(correctedAt + maskSettleMs);
            //
            // which pushed the release up to 1000 ms past its scheduled point,
            // because the mask effect needs 358-712 ms to become visible. That
            // is a diagnostic cost charged to the schedule, and on 2026-09-12
            // the model priced it: the Night 5 mask window tolerates almost
            // nothing in POSITION. Holding its length fixed at 4751 ms and
            // moving it later,
            //
            //     +0 ms   3000/3000        +400 ms   0/3000
            //     +200 ms    0/3000        +800 ms   0/3000
            //
            // a 200 ms shift is total collapse, and 200 ms is exactly
            // LAST_VIEW_SAMPLE_FRAMES (12 frames). So waiting to SEE the
            // correction converted a cycle that might have been saved into one
            // that was certainly lost: the gate existed to rescue the cycle and
            // was reliably killing it instead.
            //
            // The corrective contact is already delivered above; the game does
            // not care whether anyone watched. So release on schedule and read
            // the verification frame afterwards, off the critical path. The
            // diagnostic survives as a `control.gate.verify` event; only its
            // bill to the schedule is gone.
            if (corrected) {
              const correctionAt = correctedAt;
              const believed = entry.believedMaskOn;
              const gateAt = entry.gateAtMs;
              const priorSequence = sample.sequence;
              verifyTasks.push((async () => {
                try {
                  await waitUntil(correctionAt + this.maskSettleMs);
                  if (!controlStillRunning()) return;
                  const verify = compactControlSample((await readControlState()).sample);
                  const staleFrame = verify !== null && verify.sequence !== null &&
                    String(verify.sequence) === String(priorSequence);
                  this.onEvent({ type: 'control.gate.verify', gateAtMs: gateAt,
                    outcome: staleFrame ? 'CORRECTION-UNREAD'
                      : verify && verify.maskOn !== null && verify.maskOn !== believed
                        ? 'CORRECTION-UNCONFIRMED' : 'CORRECTION-CONFIRMED',
                    correctedAt: correctionAt, verify });
                } catch { /* a verification that cannot run is not a night failure */ }
              })());
            }
            this.onEvent({ type: 'control.gate', gateAtMs: entry.gateAtMs,
              cycle: entry.cycle, nextActionId: entry.nextActionId,
              believedMaskOn: entry.believedMaskOn, observedMaskOn,
              maskEvidence: maskEvidenceSource,
              strokeSignature: strokes.signature,
              status, reachedAt, releaseAt, reads, sample,
              ...(correctedAt === null ? {} : { correctedAt }) });
            if (status === 'UNKNOWN') {
              this.onEvent({ type: 'control.gate.abort', gateAtMs: entry.gateAtMs,
                reason: sample.maskReason ?? 'mask-state-unavailable' });
              if (sharedMode) await this.stopProcess();
              else await touchRemote(this.adb, this.serial, armControl.fail);
              break;
            }
            // The stream resumes when the marker appears, not when the
            // release is decided, so the touch is started early by what the
            // last one cost. Without this each gate paid its own adb latency
            // again and the night drifted 50-130 ms per cycle.
            if (!await waitUntil(releaseAt - releaseTouchMs)) break;
            const touchStartedAt = Date.now();
            if (sharedMode) {
              // A ready process has no ADB marker round trip to hide. The next
              // segment must be written at the release instant; writing it
              // early would let /system/bin/hid consume it before the gate.
              await feedShared(gated.remainderSegments[gated.gates.indexOf(entry) + 1]);
              releaseTouchMs = 0;
            } else {
              await touchRemote(this.adb, this.serial, armControl.gateGo);
              releaseTouchMs = Math.min(entry.budgetMs / 2, Date.now() - touchStartedAt);
            }
            lagMs += Math.max(0, Date.now() - releaseAt);
          }
        })().catch(async () => {
          // A parked stream never resumes on its own. An observer that dies
          // silently would hang the night at a gate, so it fails the run
          // instead and lets the shell unwind through its own trap.
          this.onEvent({ type: 'control.gate.observer-error' });
          try {
            if (sharedMode) await this.stopProcess();
            else await touchRemote(this.adb, this.serial, armControl.fail);
          } catch { /* the run is ending */ }
        });
        effectObservers.push(ledger);
      };
      if (!schedule.gated && !sharedMode) {
        startControlEffectLedger('full', startedAt + schedule.readyDelayMs,
          schedule.monitorTransitions, schedule.maskTransitions,
          { phaseEndMs: schedule.plannedUntilMs });
      }
      if (sharedMode && releaseAlreadyGranted)
        void startSharedSchedule(releaseAlreadyGrantedAt ?? Date.now());
      // Native camera reads must not wait behind a full screencap + Python
      // lifecycle classification. An UNKNOWN frame is a reason to leave the
      // one-shot observation unresolved, not permission to destroy a
      // potentially successful arm.
      const observeArmOnce = async () => {
        const armReadyAtMs = schedule.armObservation?.armReadyAtMs;
        if (!Number.isInteger(armReadyAtMs)) {
          armObservationStatus = 'UNRESOLVED';
          this.onEvent({ type: 'arm.unresolved', mode: 'observe-once', reason: 'arm-window-unavailable' });
          return;
        }
        while (!stopObserver && this.child === processIdentity && this.running && nightAnchoredAt === null)
          await new Promise(resolve => setTimeout(resolve, this.pollMs));
        if (stopObserver || this.child !== processIdentity || !this.running || nightAnchoredAt === null)
          return;
        const checkAt = (nightReleasedAt ?? nightAnchoredAt) + armReadyAtMs + this.armSettleMs;
        if (!await waitUntil(checkAt)) return;
        let sample = null;
        try { sample = await this.observeArm(); }
        catch { /* an unavailable frame remains unresolved */ }
        const elapsedMs = Date.now() - startedAt;
        this.onEvent({ type: 'arm.sample', mode: 'observe-once', elapsedMs, attempt: 1, sample });
        lastArmObservation = sample;
        const highlights = sample?.highlights ?? sample?.cameraHighlights;
        const sequence = sample?.sequence;
        if (sequence === undefined || sequence === null || !Array.isArray(highlights)) {
          armObservationStatus = 'UNRESOLVED';
          this.onEvent({ type: 'arm.unresolved', mode: 'observe-once', elapsedMs,
            reason: sample?.reason ?? 'no-definitive-camera-frame' });
          return;
        }
        const key = JSON.stringify([...highlights].sort());
        const expected = JSON.stringify([...armVerification.cameras].sort());
        if (key === expected) {
          armObservation = sample;
          armObservationStatus = 'PASS';
          this.onEvent({ type: 'arm.verified', mode: 'observe-once', attempt: 1, elapsedMs });
          return;
        }
        armObservationStatus = 'FAILED';
        armFailure = new Error(`camera arm verification identified a mismatch ` +
          `(expected=${expected} observed=${key})`);
        this.onEvent({ type: 'arm.failed', mode: 'observe-once', attempt: 1, elapsedMs,
          reason: 'camera-pair-mismatch', expected: JSON.parse(expected), observed: JSON.parse(key) });
        await this.stopProcess();
      };
      startGateLedgerHook = startGateLedger;
      if (pendingGateLedgerAt !== null && schedule.gated) {
        const origin = pendingGateLedgerAt;
        pendingGateLedgerAt = null;
        startGateLedger(origin, schedule.gated);
      }
      const armObservationTask = armObserveOnce ? observeArmOnce() : (async () => {
        const gate = schedule.gated;
        // The arm taps only begin once night_go releases them, so the arm
        // observation window is anchored to that same first night frame --
        // not to the shell spawn, which now precedes night entry.
        let nextCheckAt = Infinity;
        let deadlineAt = Infinity;
        let lastSequence = null;
        let candidate = null;
        let confirmations = 0;
        const retryArm = async reason => {
          if (sharedMode) await feedShared(gate.rearm);
          else await touchRemote(this.adb, this.serial, armControl.retry);
          const rearmAt = Date.now();
          armAttempt += 1;
          startControlEffectLedger('rearm', rearmAt,
            gate.monitorTransitions.rearm, gate.maskTransitions.rearm,
            { originUncertaintyMs: 50, attempt: armAttempt,
              phaseEndMs: gate.rearmDurationMs });
          // Anchor to the actual retry signal, not a theoretical first-attempt
          // timeline that observation latency can outrun.
          nextCheckAt = Date.now() + gate.rearmDurationMs + this.armSettleMs;
          deadlineAt = nextCheckAt + this.armObservationWindowMs;
          candidate = null;
          confirmations = 0;
          this.onEvent({ type: 'arm.retry', attempt: armAttempt,
            elapsedMs: Date.now() - startedAt, reason });
        };
        while (!stopObserver && !armVerified && this.child === processIdentity && this.running) {
          await new Promise(resolve => setTimeout(resolve, this.pollMs));
          if (stopObserver || this.child !== processIdentity || !this.running) break;
          if (nextCheckAt === Infinity) {
            if (nightAnchoredAt === null) continue;
            nextCheckAt = (nightReleasedAt ?? nightAnchoredAt) + gate.armReadyAtMs + this.armSettleMs;
            deadlineAt = nextCheckAt + this.armObservationWindowMs;
          }
          if (Date.now() < nextCheckAt) continue;
          let sample = null;
          try { sample = await this.observeArm(); }
          catch { /* an unavailable frame remains UNKNOWN */ }
          const elapsedMs = Date.now() - startedAt;
          this.onEvent({ type: 'arm.sample', elapsedMs, attempt: armAttempt, sample });
          lastArmObservation = sample;
          const highlights = sample?.highlights ?? sample?.cameraHighlights;
          const sequence = sample?.sequence;
          const fresh = sequence !== undefined && sequence !== null && sequence !== lastSequence;
          if (fresh) lastSequence = sequence;
          if (fresh && Array.isArray(highlights)) {
            const key = JSON.stringify([...highlights].sort());
            confirmations = key === candidate ? confirmations + 1 : 1;
            candidate = key;
            if (confirmations >= ARM_CONFIRM_SAMPLES) {
              const sameHighlights = key === JSON.stringify([...armVerification.cameras].sort());
              if (sameHighlights) {
                  if (stopObserver) break;
                  let armGoAt = null;
                  if (armControl) {
                    armGoAt = Date.now();
                    if (sharedMode) {
                      await feedShared(gate.remainderSegments[0]);
                      if (!gate.gates.length) {
                        for (const segment of gate.remainderSegments.slice(1)) await feedShared(segment);
                      }
                    } else {
                      await touchRemote(this.adb, this.serial, armControl.go);
                    }
                    // The parked prefix has already consumed armReadyAtMs. Any
                    // extra wall time before go is phase error, not harmless
                    // observation latency: the game clock keeps running.
                    const phaseLagMs = nightReleasedAt === null ? null
                      : armGoAt - nightReleasedAt - gate.armReadyAtMs;
                    if (phaseLagMs !== null && phaseLagMs > gate.phaseBudgetMs) {
                      this.onEvent({ type: 'phase.invalid', reason: 'late-arm-release',
                        phaseLagMs, phaseBudgetMs: gate.phaseBudgetMs,
                        armAttempt, nightReleasedAt, armGoAt });
                      armFailure = new Error(
                        'phase-invalid: arm release lag ' + phaseLagMs +
                        'ms exceeds budget ' + gate.phaseBudgetMs + 'ms');
                      await this.stopProcess();
                      break;
                    }
                    // A gated stream has a timing-critical host-owned release at
                    // every cycle boundary. `observeControlState` is synchronous
                    // at the physical port and its diagnostic ledger can spend
                    // six reads in one burst; on the 2026-09-11 Night 5 run it
                    // occupied the event loop for ~870 ms exactly when the first
                    // post-gate contact was due, delaying the gate release and
                    // shifting the phone-local stream. The gate itself retains
                    // the bounded state evidence, so do not run a competing
                    // remainder ledger while the stream is parked. Ungated
                    // schedules still get the full diagnostic ledger below.
                    startGateLedger(armGoAt, gate);
                  }
                  armVerified = true;
                  armObservation = sample;
                  this.onEvent({ type: 'arm.verified', attempt: armAttempt, elapsedMs,
                    ...(armGoAt === null ? {} : { armGoAt }) });
              } else if (armAttempt < MAX_ARM_ATTEMPTS) {
                  await retryArm('camera-pair-mismatch');
              } else {
                  deadlineAt = Date.now();
              }
            }
          } else {
            candidate = null;
            confirmations = 0;
          }
          if (!armVerified && Date.now() >= deadlineAt) {
              // A native watch can return a fresh sequence while the camera
              // panel is still between frames. That is not evidence that the
              // authored arm is wrong, but waiting longer on the same raised
              // monitor cannot repair it. Replay the physical arm sequence so
              // the next bounded window gets a new panel transition; keep the
              // fail-closed result once all attempts are spent.
              if (armAttempt < MAX_ARM_ATTEMPTS) {
                await retryArm('camera-observation-unavailable');
                continue;
              }
              armFailure = new Error(`camera arm verification missed after ${armAttempt} attempt(s) ` +
                `(expected=${JSON.stringify(armVerification.cameras)} ` +
                `viewing=${armVerification.viewing} last=${JSON.stringify(lastArmObservation)})`);
              await this.stopProcess();
              break;
          }
        }
      })();
      armObserver = armVerification ? armObservationTask.catch(async error => {
        armFailure = error;
        await this.stopProcess();
      }) : Promise.resolve();
      // Runs beside the authority, not instead of it. It only records WHEN the
      // native read first named the night screen; nothing here releases a
      // stream, ends a run, or decides that a night is running.
      const nativeAnchor = (this.observe && typeof this.observeControlState === 'function')
        ? (async () => {
          while (!stopObserver && this.child === processIdentity && this.running &&
                 nativeNightAt === null && !nightObserved) {
            const startedAt = Date.now();
            let sample = null;
            try { ({ sample } = await readControlState()); } catch { sample = null; }
            nativeAnchorSamples += 1;
            if (sample?.screen === NATIVE_NIGHT_SCREEN) { nativeNightAt = startedAt; break; }
            // A read that positively named some OTHER screen is the native
            // stream's own lower bound on the transition. An UNKNOWN read
            // names nothing and must not move it.
            if (typeof sample?.screen === 'string' && sample.screen !== 'UNKNOWN')
              nativeLastNotNightAt = startedAt;
            const spent = Date.now() - startedAt;
            if (spent < NATIVE_ANCHOR_POLL_MS)
              await new Promise(resolve => setTimeout(resolve, NATIVE_ANCHOR_POLL_MS - spent));
          }
        })().catch(() => {})
        : Promise.resolve();
      observer = this.observe ? (async () => {
        while (!stopObserver && this.child === processIdentity && this.running) {
          await new Promise(resolve => setTimeout(resolve, this.pollMs));
          if (stopObserver || this.child !== processIdentity || !this.running) break;
          const observeStartedAt = Date.now();
          try {
            const state = this.observe ? await this.observe() : null;
            // A lifecycle observer that positively names any other screen has
            // proved that the scheduled night is gone once a night frame has
            // been seen. Classifiers are frame-based and can produce one bad
            // positive during a camera/monitor animation, so require a short
            // consecutive run of positive non-night samples. A single bad
            // frame, or an UNKNOWN capture, never kills the stream.
            if (state === 'night') {
              if (!nightObserved) {
                // The first authoritative office frame is the timeline's
                // 12 AM anchor: release the schedule and stamp the arm
                // verifier's window origin. The executor owns this edge for
                // the shared title HID; waiting for the separate intro
                // observer would spend the handoff budget on PNG retention
                // and let a healthy run abort before its first contact.
                // Clamp: the refined origin must lie inside the window the
                // authority itself bracketed -- after the last frame it called
                // NOT a night, and not after the capture that proved one. A
                // native read outside that window is discarded rather than
                // trusted, so a premature FNAF2_NIGHT on an intro or dark
                // frame cannot pull the origin earlier than the evidence.
                // The authority's own previous sample is the preferred lower
                // bound. When the authority found the night on its first look
                // it has none, and the native stream supplies one instead: the
                // last read that positively named a DIFFERENT screen. Both are
                // real observations; if neither exists the refinement is
                // refused rather than guessed.
                const lowerBound = lastNonNightObserveAt ?? nativeLastNotNightAt;
                const nativeAt = nativeNightAt;
                const refined = (nativeAt !== null && lowerBound !== null &&
                  nativeAt >= lowerBound && nativeAt <= observeStartedAt)
                  ? nativeAt : null;
                this.onEvent({ type: 'origin.refined',
                  authorityAtMs: observeStartedAt,
                  authorityBracketFromMs: lastNonNightObserveAt,
                  nativeBracketFromMs: nativeLastNotNightAt,
                  bracketSource: lastNonNightObserveAt !== null ? 'authority'
                    : (nativeLastNotNightAt !== null ? 'native' : 'none'),
                  nativeAtMs: nativeNightAt,
                  nativeSamples: nativeAnchorSamples,
                  accepted: refined !== null,
                  shrunkByMs: refined === null ? 0 : observeStartedAt - refined });
                const portOwnsRelease = sharedMode && this.nightReleaseOwner === 'port';
                if (portOwnsRelease) {
                  // Authorization only: releaseNight() records its own
                  // night-go when the port fires, so the schedule's origin is
                  // the placed instant, not this classifier sample.
                  this.onEvent({ type: 'hid.night-authorized', at: observeStartedAt, owner: 'port' });
                  for (const resolve of this.nightAuthorizedListeners) resolve(observeStartedAt);
                  this.nightAuthorizedListeners.clear();
                } else {
                  recordNightGo(refined ?? observeStartedAt, 'lifecycle');
                }
                if (portOwnsRelease) {
                  /* the composition's releaseNight() starts the schedule */
                } else if (sharedMode) {
                  try {
                    if (!sharedReleaseInFlight) await startSharedSchedule(Date.now());
                    if (stopObserver) break;
                    await sharedReleaseTask;
                    if (handoffFailure || stopObserver) break;
                  } catch (error) {
                    handoffFailure ??= error;
                    await this.stopProcess();
                    break;
                  }
                } else if (armControl?.nightGo) {
                  try {
                    await touchRemote(this.adb, this.serial, armControl.nightGo);
                    const nightGoAt = Date.now();
                    nightReleasedAt = nightGoAt;
                    startControlEffectLedger('prefix', nightGoAt,
                      schedule.gated.monitorTransitions.prefix, schedule.gated.maskTransitions.prefix,
                      { originUncertaintyMs: 50, attempt: 1,
                        phaseEndMs: schedule.gated.armReadyAtMs });
                    this.onEvent({ type: 'hid.night-go-released', at: nightGoAt,
                      originUncertaintyMs: 50 });
                  }
                  catch { /* the drop guard below still governs the run */ }
                }
              }
              nightObserved = true;
              nonNightSamples = 0;
            } else if (!state) {
              // An UNKNOWN classification withholds a vote; see the catch below.
            } else if (!nightObserved) {
              // The authority's own lower bound on the origin: it looked at a
              // frame captured about now and did not call it a night.
              lastNonNightObserveAt = observeStartedAt;
            }
            if (state === 'gameover' || state === 'sixam') {
              if (!armVerified) {
                armFailure = new Error(`camera arm verification ended with ${state} ` +
                  `(expected=${JSON.stringify(armVerification.cameras)} ` +
                  `viewing=${armVerification.viewing} last=${JSON.stringify(lastArmObservation)})`);
              }
              observedTerminal = state;
              stopObserver = true;
              await this.stopProcess();
              break;
            }
            // Once a night has been seen, the TITLE is not a transient
            // animation the way an intro or a dark frame is: the night is over
            // and the schedule is now pressing into a menu. `coords.sh` puts
            // New Game on that screen, so continuing to actuate there risks
            // the save, not just the run. It stops on the first positive read,
            // like gameover and sixam above.
            if (nightObserved && TERMINAL_SCREENS.has(state)) {
              observedExitState = state;
              stopObserver = true;
              await this.stopProcess();
              break;
            }
            const startupTransition = !nightObserved &&
              (state === 'intro' || state === 'newspaper') && Date.now() < startupDeadline;
            if (startupTransition) {
              nonNightSamples = 0;
            } else if (state && state !== 'night') {
              nonNightSamples += 1;
              if (nonNightSamples >= EXIT_CONFIRM_SAMPLES) {
                observedExitState = state;
                stopObserver = true;
                await this.stopProcess();
                break;
              }
            }
          } catch {
            // An unreadable frame does NOT reset the evidence.
            //
            // It used to. The 2026-09-12 origin run read `state=title`
            // alternating with `unknown=no-signature-matched` for over a
            // minute while the schedule kept pressing into the title screen:
            // every UNKNOWN zeroed the counter, so three CONSECUTIVE non-night
            // samples never accumulated and the run could not end itself. An
            // unreadable frame is an absence of evidence, so it withholds a
            // vote rather than destroying the votes already cast.
          }
        }
      })() : Promise.resolve();
      await processPromise;
      stopObserver = true;
      await nativeAnchor;
      if (handoffFailure) throw handoffFailure;
      if (observedExitState)
        throw new Error(`device: lifecycle left night state (${observedExitState})`);
      if (!armVerified) throw armFailure ?? new Error('camera arm verification did not produce a positive observation');
      const completedArm = buildArmResult();
      return { status: 'COMPLETED', outcome: 'UNVERIFIED', night: schedule.night,
        plannedUntilMs: schedule.plannedUntilMs, blockCount: schedule.actionCount,
        deviceLocal: true, ...(observedTerminal ? { terminal: observedTerminal } : {}),
        ...(completedArm ? { armVerification: completedArm } : {}) };
    } catch (error) {
      // A fresh lifecycle observation is the only accepted reason to turn a
      // killed remote schedule into a normal failed attempt. Transport or
      // shell failures remain errors and are handled by the campaign abort
      // path.
      if (handoffFailure) throw handoffFailure;
      if (armFailure) throw armFailure;
      if (observedTerminal === 'gameover' || observedTerminal === 'sixam') {
        if (!armVerified) throw new Error(`camera arm verification ended with ${observedTerminal}`);
        const completedArm = buildArmResult();
        return { status: 'COMPLETED', outcome: 'UNVERIFIED', night: schedule.night,
          plannedUntilMs: schedule.plannedUntilMs, blockCount: schedule.actionCount,
          deviceLocal: true, terminal: observedTerminal,
          ...(completedArm ? { armVerification: completedArm } : {}) };
      }
      if (observedExitState)
        throw new Error(`device: lifecycle left night state (${observedExitState})`);
      throw error;
    } finally {
      stopObserver = true;
      if (completionTimer !== null) clearTimeout(completionTimer);
      this.nightReleaseAction = null;
      this.unblockNightRelease();
      await Promise.all([observer, armObserver, ...effectObservers, ...verifyTasks]);
      const anr = await readAnrEvents(this.adb, this.serial);
      if (anr !== null) this.onEvent({ type: 'device.anr', count: anr.length, lines: anr });
      this.child = null; this.running = false;
      this.stopProcess = null;
      this.nightReleaseResolve = null;
      this.nightReleaseGranted = false;
      this.nightReleaseGrantedAt = null;
    }
  }

  async abort(reason = 'aborted') {
    this.aborted = true;
    if (this.stopProcess) await this.stopProcess();
    return { status: 'ABORTED', reason: String(reason) };
  }

  async releaseAll() {
    if (this.stopProcess) await this.stopProcess();
  }
}

/**
 * Explicit compatibility executor for a research-emitted winner.
 *
 * This retains the older assembled-program experiment without copying its
 * strategy into a new host scheduler. The modern campaign composition does not
 * select this compatibility class; its MODEL_ONLY lane uses the artifact
 * executor above. The
 * program receives the exact validated emitted plan, checker, and model as
 * content-addressed files; all timing, screencheck classification, and HID
 * input remain on the phone. It is intentionally separate from the qualified
 * executor and never returns a positive claim.
 */
export class AdbDeviceLocalMachineExecutor {
  /** @param {any} options */
  constructor(options = {}) {
    const { serial, adb = 'adb', driverProgram, planPath, planHash, modelPath, checkerPath,
      pilotOffsetMs = 10, deviceSpacingMs = 66, contactMs = 33, observe = null,
      pollMs = 1000, cuePort = '-', cueToken = '-', onOutput = null } = options;
    if (typeof serial !== 'string' || serial.length === 0) throw new TypeError('machine executor requires an ADB serial');
    if (typeof driverProgram !== 'string' || driverProgram.length === 0) throw new TypeError('machine executor requires the assembled device program');
    for (const [value, label] of [[planPath, 'planPath'], [planHash, 'planHash'], [modelPath, 'modelPath'], [checkerPath, 'checkerPath']])
      if (typeof value !== 'string' || value.length === 0) throw new TypeError(`machine executor requires ${label}`);
    for (const [value, label] of [[pilotOffsetMs, 'pilotOffsetMs'], [deviceSpacingMs, 'deviceSpacingMs'], [contactMs, 'contactMs']])
      if (!Number.isInteger(value) || value < 1 || value > 30000) throw new TypeError(`machine executor ${label} is outside 1..30000`);
    if (deviceSpacingMs <= contactMs) throw new TypeError('machine executor spacing must exceed contact');
    if (observe !== null && typeof observe !== 'function') throw new TypeError('machine executor observe must be a function');
    if (onOutput !== null && typeof onOutput !== 'function') throw new TypeError('machine executor onOutput must be a function');
    if (!Number.isInteger(pollMs) || pollMs < 250 || pollMs > 10000)
      throw new TypeError('machine executor pollMs must be an integer in 250..10000');
    if (cuePort !== '-' && (!Number.isInteger(cuePort) || cuePort < 1 || cuePort > 65535))
      throw new TypeError('machine executor cuePort is outside 1..65535');
    if (cuePort !== '-' && (typeof cueToken !== 'string' || !/^[0-9a-f]{32}$/.test(cueToken)))
      throw new TypeError('machine executor cueToken is not a bounded helper token');
    this.serial = serial; this.adb = adb; this.driverProgram = driverProgram;
    this.planPath = planPath; this.planHash = planHash; this.modelPath = modelPath; this.checkerPath = checkerPath;
    this.pilotOffsetMs = pilotOffsetMs; this.deviceSpacingMs = deviceSpacingMs; this.contactMs = contactMs;
    this.cuePort = cuePort; this.cueToken = cueToken;
    this.onOutput = onOutput;
    this.observe = observe; this.pollMs = pollMs; this.child = null; this.running = false;
    this.armed = false; this.armedBinding = null; this.processHandle = null;
    this.processPromise = null;
    /** @type {boolean} */
    this.processDone = false;
    this.observerPromise = null;
    this.stopObserver = false; this.observedTerminal = null;
    this.remoteFiles = []; this.deviceLocal = true;
  }

  validateRequest(request) {
    validateExecutorRequest(request);
    if (request.mode !== 'live') fail('machine executor accepts live requests only');
    if (request.artifact.plans.length !== 1)
      fail('machine executor is scoped to one night request');
    return request.artifact.plans[0];
  }

  binding(request) {
    const plan = request.artifact.plans[0];
    return JSON.stringify({ plan: plan.sha256, timing: plan.timing,
      profile: request.artifact.profileStableHash, winner: request.artifact.winnerHash,
      engine: request.artifact.engineHash });
  }

  async arm(request) {
    const plan = this.validateRequest(request);
    if (this.running || this.armed) fail('machine executor is already armed or running');
    const planText = await readFile(this.planPath, 'utf8');
    const emittedPlanHash = createHash('sha256').update(planText).digest('hex');
    if (emittedPlanHash !== this.planHash) fail('emitted plan hash does not match the validated bundle manifest');
    const checkerBytes = await readFile(this.checkerPath);
    const modelBytes = await readFile(this.modelPath);
    const checkerHash = createHash('sha256').update(checkerBytes).digest('hex');
    const modelHash = createHash('sha256').update(modelBytes).digest('hex');

    const tag = `${process.pid}-${Date.now()}`;
    const remoteBase = `/data/local/tmp/fnaf2-machine-${tag}`;
    const remotePid = `${remoteBase}.pid`;
    // The assembled driver's first argument is the pidfile and its canonical
    // plan lookup is "$PIDFILE.plan". Keep the host push on that exact name;
    // a sibling of the pidfile is not the same input on the phone.
    const remotePlan = `${remotePid}.plan`;
    const remoteChecker = `${remoteBase}.checker`;
    const remoteModel = `${remoteBase}.model`;
    const remoteKeep = `${remoteBase}-keep`;
    const remoteReady = `${remoteBase}.ready`;
    const remoteStart = `${remoteBase}.start`;
    const remoteEpoch = `${remoteBase}.epoch`;
    const remoteCapture = `${remoteBase}.capture`;
    const remoteHalt = `${remoteBase}.halt`;
    const remoteArmWindow = `${remoteBase}.armwin`;
    const remoteRearm = `${remoteBase}.rearm`;
    const remoteArmFail = `${remoteBase}.armfail`;
    const remoteFiles = [remotePlan, remoteChecker, remoteModel, remotePid, remoteReady,
      remoteStart, remoteEpoch, remoteCapture, remoteHalt, remoteArmWindow, remoteRearm,
      remoteArmFail];
    this.remoteFiles = remoteFiles;
    try {
      await pushFile(this.adb, this.serial, this.planPath, remotePlan);
      await pushFile(this.adb, this.serial, this.checkerPath, remoteChecker);
      await pushFile(this.adb, this.serial, this.modelPath, remoteModel);
      for (const [path, label] of [[remotePlan, 'plan'], [remoteChecker, 'checker'], [remoteModel, 'model']]) {
        const digest = await remoteHash(this.adb, this.serial, path);
        const expected = label === 'plan' ? emittedPlanHash : label === 'checker' ? checkerHash : modelHash;
        if (digest !== expected) throw new Error(`remote ${label} hash mismatch`);
      }
      const controls = request.profile.controlMap ?? {};
      const point = (name, fallback = null) => {
        const value = controls[name] ?? fallback;
        if (!isRecord(value) || !Number.isInteger(value.x) || !Number.isInteger(value.y))
          fail(`profile.controlMap.${name} is missing`);
        return `${value.x} ${value.y}`;
      };
      const cycles = Math.ceil((plan.timing.stopAtMs - plan.timing.loopStartMs - 7000) / plan.timing.periodMs);
      if (!Number.isInteger(cycles) || cycles < 1 || cycles > 120) fail('cycle count is outside 1..120');
      const args = [
        remotePid, remoteReady, remoteStart, remoteEpoch, remoteCapture, '1', String(cycles), 'hid-multi', '0', '-', '1',
        String(this.pilotOffsetMs), '-', String(this.deviceSpacingMs), String(this.contactMs),
        '0', '0', '0', '0', '0', '0', remoteKeep, remoteChecker, '-', remoteModel, '-', '0', '0',
        ...point('mute', { x: 545, y: 78 }).split(' '), ...point(V.monitor).split(' '), ...point(V.mask).split(' '),
        ...point(V.cameraFeedLight).split(' '), ...point(V.hallLight).split(' '), ...point(V.wind).split(' '),
        ...point('cam:10').split(' '), ...point('cam:4').split(' '), ...point('cam:7').split(' '),
        ...point('cam:9').split(' '), ...point('cam:11').split(' '), ...point('cam:5', { x: 1, y: 1 }).split(' '),
        this.cuePort === '-' ? '-' : String(this.cuePort), this.cueToken, remoteKeep,
        remoteHalt, remoteArmWindow, remoteRearm, remoteArmFail,
      ];
      this.running = true;
      this.processDone = false;
      this.observedTerminal = null;
      this.stopObserver = false;
      const processHandle = runAdbProgram(this.adb, this.serial, this.driverProgram, args);
      if (this.onOutput) {
        processHandle.child.stdout.on('data', chunk => this.onOutput(chunk.toString()));
        processHandle.child.stderr.on('data', chunk => this.onOutput(chunk.toString()));
      }
      this.processHandle = processHandle;
      this.child = processHandle.child;
      this.processPromise = processHandle.promise.then(result => {
        this.processDone = true;
        return result;
      }, error => {
        this.processDone = true;
        throw error;
      });
      // The promise is also awaited by execute(); this handler prevents a
      // launch-time transport error from becoming unhandled while arm() is
      // still waiting for the device readiness marker.
      this.processPromise.catch(() => {});
      this.observerPromise = this.observe ? (async () => {
        while (!this.stopObserver && this.child === processHandle.child && this.running && !this.processDone) {
          await new Promise(resolve => setTimeout(resolve, this.pollMs));
          if (this.stopObserver || this.child !== processHandle.child || !this.running || this.processDone) break;
          try {
            const state = await this.observe();
            if (state === 'gameover' || state === 'sixam') {
              this.observedTerminal = state;
              processHandle.child.kill('SIGTERM');
              break;
            }
          } catch { /* UNKNOWN observation never becomes a death claim */ }
        }
      })() : Promise.resolve();
      await waitForRemoteFile(this.adb, this.serial, remoteReady, {
        processDone: () => this.processDone,
        processResult: () => this.processPromise,
      });
      if (this.observedTerminal === 'gameover') throw new Error('machine input armed after game-over was observed');
      this.armed = true;
      this.armedBinding = this.binding(request);
      return { status: 'ARMED', night: plan.night, deviceLocal: true, readyFile: remoteReady };
    } catch (error) {
      await this.cleanupRun({ kill: true });
      throw error;
    }
  }

  async execute(request) {
    const plan = this.validateRequest(request);
    const binding = this.binding(request);
    if (!this.armed) await this.arm(request);
    else if (this.armedBinding !== binding) fail('execute request does not match the armed campaign request');
    const processPromise = this.processPromise;
    const observer = this.observerPromise ?? Promise.resolve();
    const cycles = Math.ceil((plan.timing.stopAtMs - plan.timing.loopStartMs - 7000) / plan.timing.periodMs);
    try {
      const result = await processPromise;
      if (result.code !== 0 && !['gameover', 'sixam'].includes(this.observedTerminal))
        throw new Error(`machine device program exited with ${result.code}: ${result.stderr.trim() || result.stdout.trim()}`);
      return { status: 'COMPLETED', outcome: 'UNVERIFIED', night: plan.night,
        plannedUntilMs: plan.timing.observeUntilMs, cycles, deviceLocal: true,
        terminal: this.observedTerminal, programOutput: result.stdout.slice(-12000) };
    } finally {
      this.stopObserver = true;
      await observer;
      await this.cleanupRun();
    }
  }

  async cleanupRun({ kill = false } = {}) {
    if (kill && this.child) this.child.kill('SIGTERM');
    if (kill && this.processPromise) {
      try { await this.processPromise; } catch { /* transport cleanup follows */ }
    }
    this.stopObserver = true;
    if (this.observerPromise) await this.observerPromise;
    if (this.processPromise && !this.processDone) {
      try { await this.processPromise; } catch { /* cleanup is best effort */ }
    }
    const paths = [...this.remoteFiles];
    this.child = null; this.running = false; this.armed = false;
    this.armedBinding = null; this.processHandle = null; this.processPromise = null;
    this.processDone = false; this.observerPromise = null; this.observedTerminal = null;
    this.remoteFiles = [];
    await removeRemoteFiles(this.adb, this.serial, paths);
  }

  async abort(reason = 'aborted') {
    if (this.remoteFiles.length) {
      try { await execFile(this.adb, ['-s', this.serial, 'shell', 'touch', this.remoteFiles.find(path => path.endsWith('.halt'))], { timeout: 10000, maxBuffer: 1024 * 1024 }); } catch {}
    }
    if (this.child) this.child.kill('SIGTERM');
    return { status: 'ABORTED', reason: String(reason) };
  }

  async releaseAll() {
    await this.cleanupRun({ kill: true });
  }
}
