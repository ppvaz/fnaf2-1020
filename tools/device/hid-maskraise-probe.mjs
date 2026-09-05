// Measure the real no-control window after a mask-off press -- the seam the
// runner's `maskraise` compound crosses.
//
// Three numbers currently claim to own this seam and they disagree:
//   - packages/core/src/mechanics/config.js MASK_ANIM_OFF = 15 frames, whose
//     own comment says 0.244s while 15 frames at the measured 60.0 FPS render
//     clock is 250 ms;
//   - trial/09-constants.sh MASK_RAISE_GAP_MS = 267 (15 frames + 1 at 60 FPS),
//     "the active model/runner contract";
//   - the desync census (ON-DEVICE-VALIDATION.md): a 180 ms compound never
//     lost a press in 17 tries, 140-180 lost half, under 140 lost most.
// The model replays presses at exact frames with zero acceptance lag, so it
// can never fail this seam ("the simulator cannot fail this way; only the
// phone can"). This probe measures the phone.
//
// Each trial reproduces the maskraise seam exactly as 11-plan-interpreter.sh
// emits it: mask tap (33 ms contact), delay(gap - 33), next control DOWN --
// so `gap` is mask-DOWN to next-DOWN, the same quantity MASK_RAISE_GAP_MS
// names. The next control is the HALL beam, not the monitor raise, for two
// measured reasons:
//   - the hall is a HELD interaction (Key-17, g75-79: lit while held, cleared
//     on release), so every trial ends in the state it started regardless of
//     whether the press landed. A monitor-raise probe cannot do that blind:
//     the cleanup toggle leaves UP when the press landed and DOWN -- one
//     parity step from corrupting every later trial -- when it did not;
//   - the hall flash IS the Foxy reset, so the probe night defends itself
//     against the one killer an office-dwelling loop otherwise cannot.
// The beam is plainly visible in a 60 FPS screenrecord, so landing is a
// per-trial binary from the video, not from a trace inference.
//
// The mask-ON animation length is also measurable from the same recording,
// cleanly (no other press lands near it), which cross-checks the animation
// clock against the sourced 12-frame MASK_ANIM_ON.
//
// Usage: node hid-maskraise-probe.mjs [gapMs ...]
//   ROUNDS=3 (default) repeats the gap list, alternating direction each round
//   so drift decorrelates from gap value.
import { pathToFileURL } from 'node:url';
import { COORDS, toRaw } from './hid-sweep-probe.mjs';

const ID = 106;
const lo = v => v & 0xff;
const hi = v => (v >> 8) & 0xff;
const record = (flags, point) => {
  const [x, y] = toRaw(point);
  return [flags, lo(x), hi(x), lo(y), hi(y)];
};

// hid-raise-probe.mjs: controls COORDS does not carry. Same values, same
// source (coords.sh measured table) -- the mask Click and the hall beam.
const MASK = [600, 1015];
const HALL = [1200, 540];

export function stream(gaps, { readyMs = 7000,
                               contactMs = 33,
                               maskOnMs = 800,
                               hallMs = 133,
                               observeMs = 600,
                               settleMs = 500,
                               rounds = 3 } = {}) {
  const out = [];
  const emit = (command, extra) => out.push({ id: ID, command, ...extra });
  const delay = duration => emit('delay', { duration });
  // Single-contact press, same shape as the runner's taps: down, hold, up,
  // with contact 1's inactive filler record present on both reports (trap 2).
  const press = (point, hold = contactMs) => {
    emit('report', { report: [1, 1, ...record(0x03, point), 0, 0, 0, 0, 0] });
    delay(hold);
    emit('report', { report: [1, 1, ...record(0x00, point), 4, 0, 0, 0, 0] });
  };

  emit('register', {
    name: 'FNAF HID maskraise probe',
    vid: 6353, pid: 61964, bus: 'usb',
    descriptor: DESCRIPTOR,
  });
  // InputReader attaches about 5.1 s after registration on this phone; the
  // night is already running -- the wrapper selects it through menu.sh.
  delay(readyMs);

  // Sync preamble: three hall flashes. The grader anchors video time to
  // stream time on the third flash, so every later expected time rides on
  // the hid process's own clock rather than on host launch order.
  for (let i = 0; i < 3; i++) {
    press(HALL, hallMs);
    delay(500);
  }

  for (let round = 0; round < rounds; round++) {
    // Ping-pong the order every round: a monotonic sweep would confound any
    // drift (heating, battery, night-age threat pressure) with gap value.
    const order = round % 2 === 0 ? gaps : [...gaps].reverse();
    for (const gap of order) {
      if (gap <= contactMs) throw new Error(`gap ${gap} must exceed the ${contactMs} ms contact`);
      press(MASK);                    // mask ON: down at t, up at t+contactMs
      delay(maskOnMs - contactMs);    // fully on (sourced 12-frame animation) + margin
      press(MASK);                    // mask OFF: down at t+maskOnMs
      delay(gap - contactMs);         // THE SEAM: hall down at off-down + gap
      press(HALL, hallMs);            // the measured press
      delay(observeMs);               // beam window the grader reads
      delay(settleMs);                // office quiet before the next trial
    }
  }
  return out;
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
  for (const event of stream(gaps, {
    readyMs: env('READY_MS'), contactMs: env('CONTACT_MS'), maskOnMs: env('MASK_ON_MS'),
    hallMs: env('HALL_MS'), observeMs: env('OBSERVE_MS'), settleMs: env('SETTLE_MS'),
    rounds: env('ROUNDS'),
  }))
    console.log(JSON.stringify(event));
}
