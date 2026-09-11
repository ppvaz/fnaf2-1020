// Safe transition-only recording stream for mask/monitor animation timing.
//
// This is deliberately not a seam probe. It sends no hall, camera, vent-light,
// or wind input while a toggle could be in flight. The stream starts with the
// office's expected down/off baseline, toggles the monitor up and back down,
// then toggles the mask on and back off, with a settled interval after every
// transition. A missed toggle can make the polarity wrong, but it cannot make
// a dependent control illegal because there is no dependent control here.
//
// The recording is visual timing evidence only. It does not qualify the
// handset for DeviceControlService seam calibration; that still requires the
// positive state sensor, a completion-aware actuator, and a clock map.
//
// Usage: node hid-transition-probe.mjs
//   CONTACT_MS=100 (default) is intentionally conservative for a live timing
//   capture. SETTLE_MS=1400 (default) leaves each state visibly stable.
//   PLAN_MODE=release-isolated (default) leaves SETTLE_MS after release.
//   PLAN_MODE=press-phase-matched holds every press at the same planned
//   interval, compensating the post-release delay for CONTACT_MS.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { COORDS, toRaw } from './hid-sweep-probe.mjs';

const ID = 110;
const MASK = [600, 1015];
const lo = value => value & 0xff;
const hi = value => (value >> 8) & 0xff;
const record = (flags, point) => {
  const [x, y] = toRaw(point);
  return [flags, lo(x), hi(x), lo(y), hi(y)];
};

const positive = (name, value, min, max) => {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${name} must be an integer between ${min} and ${max} ms`);
  return value;
};

export function timingPlan({ contactMs = 100, settleMs = 1400,
                             planMode = 'release-isolated',
                             referenceContactMs = 33,
                             pressIntervalMs = null } = {}) {
  positive('contactMs', contactMs, 17, 1000);
  positive('settleMs', settleMs, 250, 5000);
  positive('referenceContactMs', referenceContactMs, 17, 1000);
  if (!['release-isolated', 'press-phase-matched'].includes(planMode))
    throw new Error(`planMode must be release-isolated or press-phase-matched (got ${planMode})`);
  const targetPressInterval = pressIntervalMs == null
    ? referenceContactMs + settleMs : positive('pressIntervalMs', pressIntervalMs, 267, 6000);
  if (targetPressInterval <= contactMs)
    throw new Error(`pressIntervalMs ${targetPressInterval} must exceed contactMs ${contactMs}`);
  const postReleaseMs = planMode === 'press-phase-matched'
    ? targetPressInterval - contactMs : settleMs;
  return Object.freeze({
    planMode,
    contactMs,
    settleMs,
    referenceContactMs,
    pressIntervalMs: planMode === 'press-phase-matched'
      ? targetPressInterval : contactMs + settleMs,
    postReleaseMs,
  });
}

export function stream({ readyMs = 7000, contactMs = 100, settleMs = 1400,
                         initialDelayMs = null, warmupMs = 0, splitOut = null,
                         planMode = 'release-isolated', referenceContactMs = 33,
                         pressIntervalMs = null } = {}) {
  positive('readyMs', readyMs, 1, 30000);
  const plan = timingPlan({ contactMs, settleMs, planMode,
    referenceContactMs, pressIntervalMs });
  const firstDelay = initialDelayMs == null
    ? (splitOut ? Math.min(settleMs, 500) : readyMs) : initialDelayMs;
  positive('initialDelayMs', firstDelay, 1, 30000);
  positive('warmupMs', warmupMs, 0, 5000);

  const events = [];
  const emit = (command, extra) => events.push({ id: ID, command, ...extra });
  const delay = duration => emit('delay', { duration });
  const tap = point => {
    emit('report', { report: [1, 1, ...record(0x03, point), 0, 0, 0, 0, 0] });
    delay(contactMs);
    emit('report', { report: [1, 1, ...record(0x00, point), 4, 0, 0, 0, 0] });
    delay(plan.postReleaseMs);
  };

  emit('register', {
    name: 'FNAF HID transition-only probe', vid: 6353, pid: 61964, bus: 'usb',
    descriptor: DESCRIPTOR,
  });
  // With SPLIT_OUT, registration happens at the title and this short delay is
  // retained at body release. The wrapper has already waited for the office,
  // so a fixed prelude sized for night loading is unnecessary.
  delay(firstDelay);

  // A release-only report is a transport warm-up, not a game action. It is
  // useful when separating the first post-office HID delivery from the
  // contact-duration question. Keep it opt-in so the ordinary schedule and
  // its timing evidence remain unchanged.
  if (warmupMs > 0) {
    emit('report', { report: [1, 1, ...record(0x00, MASK), 4, 0, 0, 0, 0] });
    delay(warmupMs);
  }

  // Baseline is the expected office state: monitor down, mask off.
  tap(COORDS.monitor); // monitor DOWN -> UP
  tap(COORDS.monitor); // monitor UP -> DOWN
  tap(MASK);            // mask OFF -> ON
  tap(MASK);            // mask ON -> OFF
  return events;
}

const DESCRIPTOR = [5,13,9,4,161,1,133,1,9,34,161,0,9,85,21,0,37,2,117,8,149,1,177,2,9,84,129,2,
  5,13,9,34,161,2,9,66,21,0,37,1,117,1,129,2,9,50,129,2,9,81,37,63,117,6,129,2,
  5,1,9,48,38,95,9,117,16,129,2,9,49,38,55,4,129,2,192,
  5,13,9,34,161,2,9,66,21,0,37,1,117,1,129,2,9,50,129,2,9,81,37,63,117,6,129,2,
  5,1,9,48,38,95,9,117,16,129,2,9,49,38,55,4,129,2,192,192,192];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length > 2)
    throw new Error('transition probe takes no positional arguments');
  const env = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) ? value : fallback;
  };
  const splitOut = process.env.SPLIT_OUT || null;
  const planMode = process.env.PLAN_MODE || 'release-isolated';
  const referenceContactMs = env('REFERENCE_CONTACT_MS', 33);
  const pressIntervalMs = process.env.PRESS_INTERVAL_MS == null
    ? null : env('PRESS_INTERVAL_MS', referenceContactMs + env('SETTLE_MS', 1400));
  const plan = timingPlan({
    contactMs: env('CONTACT_MS', 100),
    settleMs: env('SETTLE_MS', 1400),
    planMode,
    referenceContactMs,
    pressIntervalMs,
  });
  const events = stream({
    readyMs: env('READY_MS', 7000),
    ...plan,
    initialDelayMs: process.env.INITIAL_DELAY_MS == null
      ? null : env('INITIAL_DELAY_MS', 500),
    warmupMs: env('WARMUP_NEUTRAL_MS', 0),
    splitOut,
  });
  if (splitOut) {
    writeFileSync(`${splitOut}.register.jsonl`, JSON.stringify(events[0]) + '\n');
    writeFileSync(`${splitOut}.body.jsonl`, events.slice(1).map(event => JSON.stringify(event)).join('\n') + '\n');
    writeFileSync(`${splitOut}.transition.json`, JSON.stringify({
      schema: 'transition-probe-schedule-v1',
      controls: ['monitor-up', 'monitor-down', 'mask-on', 'mask-off'],
      contactMs: plan.contactMs,
      settleMs: plan.settleMs,
      planMode: plan.planMode,
      referenceContactMs: plan.referenceContactMs,
      pressIntervalMs: plan.pressIntervalMs,
      postReleaseMs: plan.postReleaseMs,
      initialDelayMs: process.env.INITIAL_DELAY_MS == null
        ? null : env('INITIAL_DELAY_MS', 500),
      warmupNeutralMs: env('WARMUP_NEUTRAL_MS', 0),
      dependentControlsSent: false,
    }, null, 2) + '\n');
  }
  for (const event of events) console.log(JSON.stringify(event));
}
