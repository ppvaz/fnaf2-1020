// Measure how long after a monitor RAISE this phone will accept a camera
// selection on the HID actuator.
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

export function stream(gaps, { readyMs = 7000,
                               contactMs = 100, dwellMs = 1500 } = {}) {
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
    // means the flip swallowed it.
    tap(COORDS.monitor);
    delay(gap);
    tap(COORDS.cam10);
    delay(dwellMs);
    tap(COORDS.monitor);
    delay(900);
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
  for (const event of stream(gaps.length ? gaps : [100, 150, 200, 250, 300, 400]))
    console.log(JSON.stringify(event));
}
