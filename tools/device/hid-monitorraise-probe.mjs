// Measure the no-control window after a mask-off press for the MONITOR
// RAISE -- the region the desync census actually measured ("180 ms never
// lost a press in 17 tries"), against the hall control's measured
// 267-283 ms. If the two regions clear at different times, the
// `maskraise` compound -- which presses hall and monitor together -- is
// bound by the slower one, and every number derived from the monitor-only
// census describes a seam the compound does not cross alone.
//
// The monitor is a TOGGLE, so unlike the hall probe a blind stream cannot
// restore state: a swallowed raise leaves the office down and the cleanup
// tap raises it instead, inverting every later trial (the parity chaos
// runs 3 and 4 of the 2026-09-04 hall sweep died of). This is now an OFFLINE
// schedule fixture, not an executable calibration guarantee. Its historical
// structure is retained for replay of captures:
//
//   - a TEACH segment first: monitor raise, 800 ms, lower -- pressed from
//     a quiet office with nothing before it. Neither toggle is guaranteed.
//     A visible map can teach a visual signature, NOT a dispatch epoch;
//   - every trial ends with an idle window (default 1500 ms) in which the
//     former host watcher attempted state restoration. That input path now
//     refuses: read completion drifted the windows and map absence did not
//     prove office-down/mask-off. Qualified service gates must restore and
//     verify state BEFORE releasing another trial, not race this queued file.
//
// Trial shape reproduces the runner's seam semantics exactly: mask tap
// (33 ms), delay(gap - 33), monitor DOWN -- `gap` is mask-DOWN to
// monitor-DOWN, the quantity MASK_RAISE_GAP_MS names.
//
// Usage: node hid-monitorraise-probe.mjs [gapMs ...]
// Emits the report stream on stdout and, when SCHEDULE_OUT is set, the
// idle-window schedule for the watcher as one JSON document.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { COORDS, toRaw } from './hid-sweep-probe.mjs';

const ID = 108;
const lo = v => v & 0xff;
const hi = v => (v >> 8) & 0xff;
const record = (flags, point) => {
  const [x, y] = toRaw(point);
  return [flags, lo(x), hi(x), lo(y), hi(y)];
};

const MASK = [600, 1015];           // coords.sh TAP_MASK -- same as the runner
const MONITOR = COORDS.monitor;     // [1780, 1015]
const HALL = [1200, 540];           // preamble sync flashes only

export function stream(gaps, { readyMs = 5600,
                               contactMs = 33,
                               maskOnMs = 800,
                               observeMs = 900,
                               idleMs = 1500,
                               teachMs = 800,
                               teachSettleMs = 1200,
                               twoFinger = false,
                               rounds = 3 } = {}) {
  for (const [name, value] of Object.entries({ readyMs, contactMs, maskOnMs, observeMs, idleMs, teachMs, teachSettleMs, rounds }))
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  if (maskOnMs <= contactMs || idleMs <= 400 || teachSettleMs <= 400)
    throw new Error('contact/idle geometry leaves no positive delay or restore window');
  if (gaps.some(gap => !Number.isInteger(gap) || gap <= contactMs))
    throw new Error('each gap must be an integer greater than contactMs');
  const out = [];
  let t = 0;
  const emit = (command, extra) => { out.push({ at: t, id: ID, command, ...extra }); };
  const delay = duration => { t += duration; emit('delay', { duration }); };
  const press = (point, hold = contactMs) => {
    emit('report', { report: [1, 1, ...record(0x03, point), 0, 0, 0, 0, 0] });
    delay(hold);
    emit('report', { report: [1, 1, ...record(0x00, point), 4, 0, 0, 0, 0] });
  };
  // The runner's maskraise compound press (11-plan-interpreter.sh): hall
  // held on contact 0, the monitor tap riding as contact 1 inside the hold
  // -- the exact input path the desync census measured, and the one thing
  // that can reconcile its 180 ms with the single-finger probes' ~270.
  // SWEEP_LIGHT_LEAD_MS is 0 in the shipped geometry, so no lead.
  const compoundPress = (holdMs = 133) => {
    emit('report', { report: [1, 2, ...record(0x03, HALL), ...record(0x07, MONITOR)] });
    delay(holdMs);
    emit('report', { report: [1, 2, ...record(0x03, HALL), ...record(0x04, MONITOR)] });
    emit('report', { report: [1, 2, ...record(0x00, HALL), ...record(0x04, MONITOR)] });
  };
  const idles = [];

  emit('register', {
    name: 'FNAF HID monitorraise probe',
    vid: 6353, pid: 61964, bus: 'usb',
    descriptor: DESCRIPTOR,
  });
  delay(readyMs); // InputReader attaches ~5.1 s after registration

  // Intended teach raise+lower. This is virtual input time, not observed
  // execution; a visible transition does not establish an executor clock.
  const teachRaiseAt = t;  // the press DOWN, not the release
  press(MONITOR);
  delay(teachMs);
  press(MONITOR);
  // The second teach tap is itself a toggle and must be observed before the
  // trial body starts. Leave a watcher-only window before the preamble so a
  // swallowed lower cannot poison every later parity-sensitive trial.
  const teachRestoreStart = t;
  delay(teachSettleMs);
  idles.push({ start: teachRestoreStart, end: teachRestoreStart + teachSettleMs - 400,
               reason: 'teach-restore' });

  // Preamble: three hall flashes, so the grader can cross-check the teach
  // anchor the same way the maskraise grader anchors on beams.
  for (let i = 0; i < 3; i++) {
    press(HALL, 133);
    delay(500);
  }

  const idleGuardMs = 400; // nominal tail only; no measured dispatch bound
  for (let round = 0; round < rounds; round++) {
    // Alternate the order so a monotonic sweep cannot mistake clock drift,
    // thermal change, or night age for a gap-dependent acceptance boundary.
    const order = round % 2 === 0 ? gaps : [...gaps].reverse();
    for (const gap of order) {
      if (gap <= contactMs) throw new Error(`gap ${gap} must exceed the ${contactMs} ms contact`);
      press(MASK);
      delay(maskOnMs - contactMs);
      press(MASK);
      delay(gap - contactMs);        // THE SEAM: next control down at off-down + gap
      if (twoFinger) compoundPress(133);  // hall (contact 0) + monitor (contact 1)
      else press(MONITOR);                // the single-finger measured press
      delay(observeMs);
      idles.push({ start: t, end: t + idleMs - idleGuardMs, reason: 'restore', round, gap });
      delay(idleMs);
    }
  }
  return { events: out.map(({ at, ...e }) => e), teachRaiseAt, idles };
}

const DESCRIPTOR = [5,13,9,4,161,1,133,1,9,34,161,0,9,85,21,0,37,2,117,8,149,1,177,2,9,84,129,2,
  5,13,9,34,161,2,9,66,21,0,37,1,117,1,129,2,9,50,129,2,9,81,37,63,117,6,129,2,
  5,1,9,48,38,95,9,117,16,129,2,9,49,38,55,4,129,2,192,
  5,13,9,34,161,2,9,66,21,0,37,1,117,1,129,2,9,50,129,2,9,81,37,63,117,6,129,2,
  5,1,9,48,38,95,9,117,16,129,2,9,49,38,55,4,129,2,192,192,192];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gaps = process.argv.slice(2).map(Number);
  if (gaps.some(v => !Number.isInteger(v) || v < 34 || v > 2000))
    throw new Error('gaps must be integers between 34 and 2000 ms');
  const env = name => {
    const v = Number(process.env[name]);
    return Number.isInteger(v) && v > 0 ? v : undefined;
  };
  const splitOut = process.env.SPLIT_OUT;
  const settleMs = env('SETTLE_MS') ?? 500;
  const { events, teachRaiseAt, idles } = stream(gaps, {
    readyMs: splitOut ? settleMs : (env('READY_MS') ?? 5600),
    contactMs: env('CONTACT_MS'), maskOnMs: env('MASK_ON_MS'),
    observeMs: env('OBSERVE_MS'), idleMs: env('IDLE_MS'),
    twoFinger: process.env.TWO_FINGER === '1',
    teachSettleMs: env('TEACH_SETTLE_MS') ?? 1200,
    rounds: env('ROUNDS') ?? 3,
  });
  if (splitOut) {
    writeFileSync(`${splitOut}.register.jsonl`, JSON.stringify(events[0]) + '\n');
    writeFileSync(`${splitOut}.body.jsonl`, events.slice(1).map(e => JSON.stringify(e)).join('\n') + '\n');
  }
  for (const event of events) console.log(JSON.stringify(event));
  const scheduleOut = process.env.SCHEDULE_OUT;
  if (scheduleOut)
    writeFileSync(scheduleOut, JSON.stringify({ schema: 'monitorraise-schedule-v2',
      clock: 'hid-virtual-ms', epoch: null, calibrationEligible: false, teachRaiseAt, idles }));
}
