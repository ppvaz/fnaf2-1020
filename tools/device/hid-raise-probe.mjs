// Measure how long after a monitor RAISE this phone will accept a camera
// selection on the HID actuator -- and, with CONTACT_MS, whether the monitor
// and mask register at a contact shorter than the 100 ms tap floor.
//
// The monitor (`flip panel button`) and the mask are Fusion Clicks, same as
// the camera-map buttons (g22), so a 33 ms down + release should toggle them
// exactly as the LIGHT_AFTER camera select does. If it does, the 100 ms tap
// floor is margin and the attack cycle's 5-tick mask and its monitor flips
// can be scheduled tighter -- the one place the sub-70 nights need room.
// MASK_TOGGLES=1 adds mask-on / mask-off taps to each trial.
//
// docs/device/ON-DEVICE-VALIDATION.md records 500 ms, "shorter gaps were
// visibly swallowed by the flip and left the feed on CAM 11" -- but that was
// measured on the `input swipe` path, whose helper alone costs about 170 ms.
// The shipped plan asks for 133-184 ms on the HID path and the classifier
// frames from nights 6-22 to 6-25 show the feed stuck exactly as that note describes.
//
// One of those two things is wrong and neither can be settled by argument:
// either the plan violates a real floor, or the floor belongs to a different
// actuator and the HID path has its own. The opening's CAM 11 lands at a
// 284 ms gap on the device, which is already evidence that 500 is not the
// number for this path -- so measure it rather than re-time the route around
// a figure that may not apply.
//
// Each trial parks the feed on CAM 11, lowers, raises, waits `gap`, and asks
// for CAM 10. If CAM 10 appears the selection was accepted; if the trace shows
// CAM 11 straight through, the flip swallowed it.
//
// Usage: node hid-raise-probe.mjs [gapMs ...]   (default 100 150 200 250 300 400)
import { pathToFileURL } from 'node:url';
import { COORDS, toRaw } from './hid-sweep-probe.mjs';

const ID = 104;
const lo = v => v & 0xff;
const hi = v => (v >> 8) & 0xff;
const record = (flags, point) => {
  const [x, y] = toRaw(point);
  return [flags, lo(x), hi(x), lo(y), hi(y)];
};

// coords.sh: controls hid-sweep-probe's COORDS does not carry.
const MASK = [600, 1015];
const HALL = [1200, 540];

export function stream(gaps, { readyMs = 7000,
                               contactMs = 100, dwellMs = 1500,
                               maskToggles = false, hallMs = 0 } = {}) {
  const out = [];
  const emit = (command, extra) => out.push({ id: ID, command, ...extra });
  const delay = duration => emit('delay', { duration });
  // Single-contact tap. contact_count is 1 and the second record is the
  // inactive filler the descriptor still expects (trap 2 applies to releases
  // of a contact that was named, which this one never is).
  const tap = (point, hold = contactMs) => {
    emit('report', { report: [1, 1, ...record(0x03, point), 0, 0, 0, 0, 0] });
    delay(hold);
    emit('report', { report: [1, 1, ...record(0x00, point), 4, 0, 0, 0, 0] });
  };

  emit('register', {
    name: 'FNAF HID raise probe',
    vid: 6353, pid: 61964, bus: 'usb',
    descriptor: DESCRIPTOR,
  });
  // InputReader attaches about 5.1 s after registration on this phone.
  // The night is already running -- the wrapper selects it through menu.sh.
  delay(readyMs);

  for (const gap of gaps) {
    // Park: raise, settle well clear of any floor, select CAM 11, let the
    // trace see it, then lower. The park deliberately uses a generous gap so
    // a failure here means the probe is broken rather than the phone slow.
    tap(COORDS.monitor);
    delay(900);
    tap(COORDS.cam11);
    delay(dwellMs);
    tap(COORDS.monitor);
    delay(900);

    // The measurement: raise, wait exactly `gap` past the release, ask for
    // CAM 10. CAM 10 in the trace means accepted; CAM 11 straight through
    // means the flip swallowed it. Both the monitor tap and the CAM 10 tap
    // are `contactMs` -- if CAM 10 shows at a short contactMs, both the flip
    // and the select registered at that contact.
    tap(COORDS.monitor);
    delay(gap);
    tap(COORDS.cam10);
    delay(dwellMs);
    tap(COORDS.monitor);
    delay(900);

    if (maskToggles) {
      // Mask on, hold, mask off -- both `contactMs`. The mask overlay
      // appearing then clearing is the Click registering.
      tap(MASK);
      delay(dwellMs);
      tap(MASK);
      delay(900);
      // The hall beam is a HELD interaction (Key-17, g75-79: lit? = 1 while
      // held, cleared on release), NOT a Click -- a 33 ms tap there panned
      // the office instead. hallMs holds it: sweep 50/66/100/133 to find the
      // shortest hold that lights the hallway. 0 = skip.
      if (hallMs > 0) {
        tap(HALL, hallMs);
        delay(dwellMs);
      }
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
  if (gaps.some(v => !Number.isInteger(v) || v < 0 || v > 2000))
    throw new Error('gaps must be integers between 0 and 2000 ms');
  const contactMs = Number(process.env.CONTACT_MS || 100);
  if (!Number.isInteger(contactMs) || contactMs < 10 || contactMs > 200)
    throw new Error('CONTACT_MS must be an integer between 10 and 200');
  const maskToggles = process.env.MASK_TOGGLES === '1';
  const hallMs = Number(process.env.HALL_MS || 0);
  if (!Number.isInteger(hallMs) || hallMs < 0 || hallMs > 400)
    throw new Error('HALL_MS must be an integer in [0, 400]');
  for (const event of stream(gaps.length ? gaps : [100, 150, 200, 250, 300, 400],
                             { contactMs, maskToggles, hallMs }))
    console.log(JSON.stringify(event));
}
