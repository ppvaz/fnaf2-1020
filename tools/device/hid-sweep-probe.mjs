// Emit a `/system/bin/hid` report stream that selects CAM 10, CAM 04 and
// CAM 07 at a chosen inter-selection spacing, pulsing the camera light after
// each selection instead of holding contact 0 across the sweep.
//
// This exists to settle one measurement. The Night 6 left-opening route needs
// a three-camera sweep spanning about 300 ms; the phone's only proven figure
// is 240 ms spacing, which spans 580 ms and leaves a one-frame scheduler-phase
// window. See docs/device/HID-MULTITOUCH.md. The rejected evidence on record
// is for *batched* `hid delay` macros, not for wall-timed spacing below
// 240 ms, so the floor has never actually been measured.
//
// Usage: node hid-sweep-probe.mjs [spacingMs ...]   (default 240 200 160 120)
import { pathToFileURL } from 'node:url';

// docs/device/HID-MULTITOUCH.md: the virtual descriptor is 2400x1080 but
// InputReader exposes it through the portrait-natural display.
//
// FLOOR, not round. This used Math.round until 2026-08-26 while the two other
// implementations of the same transform -- trial.sh's shell arithmetic
// and desync-scan.py's `//` -- both truncate. Over the real tap table they
// disagreed on four coordinates: cam11 (878 vs 877), mute (2227 vs 2226),
// newGame (778 vs 777) and continue (978 vs 977).
//
// cam11 is the one that matters: this probe sweeps it. So the probe measuring
// what the phone accepts was sending a coordinate the runner never sends, and
// the auditor deciding what the game did was keyed to a third. Nothing
// compared them -- test-hid-sweep-probe.mjs tested only this copy.
//
// The runner wins the tie because it is what actually presses the phone; the
// auditor must match the runner or it attributes presses to the wrong control.
// test-screen-map.mjs now holds all three to the same answer.
export const toRaw = ([x, y]) => [Math.floor((1080 - y) * 20 / 9), Math.floor(x * 9 / 20)];

export const COORDS = {
  sixth: [400, 880],
  monitor: [1780, 1015],
  light: [350, 615],
  cam10: [2045, 720],
  cam4: [1730, 710],
  cam7: [1775, 615],
  cam11: [2275, 685],
};

const ID = 102;
const lo = v => v & 0xff;
const hi = v => (v >> 8) & 0xff;
// 0x03/0x00 are contact 0 down/up; 0x07/0x04 are contact 1 down/up. Both
// records are always present so Linux consumes contact 1's release: a report
// that promises one record leaves contact 1 latched down (trap 2).
const record = (flags, point) => {
  const [x, y] = toRaw(point);
  return [flags, lo(x), hi(x), lo(y), hi(y)];
};

export function stream(spacings, { readyMs = 7000, introMs = 8000,
                                   contactMs = 100, lightLeadMs = 0 } = {}) {
  const out = [];
  const emit = (command, extra) => out.push({ id: ID, command, ...extra });
  const report = (r) => emit('report', { report: [1, 2, ...r] });
  const delay = (duration) => emit('delay', { duration });
  // A one-contact tap still sends its own release; contact 1 stays untouched.
  const tap = (point, hold = 120) => {
    out.push({ id: ID, command: 'report', report: [1, 1, ...record(0x03, point), 0, 0, 0, 0, 0] });
    delay(hold);
    out.push({ id: ID, command: 'report', report: [1, 1, ...record(0x00, point), 4, 0, 0, 0, 0] });
  };

  emit('register', {
    name: 'FNAF HID sweep probe',
    vid: 6353, pid: 61959, bus: 'usb',
    descriptor: DESCRIPTOR,
  });
  // Kernel readiness is not input readiness: InputReader attaches about 5.1 s
  // after registration on this phone, and reports sent before that are lost.
  delay(readyMs);
  tap(COORDS.sixth);
  delay(introMs);
  tap(COORDS.monitor);
  delay(900);

  for (const spacing of spacings) {
    for (const cam of ['cam10', 'cam4', 'cam7']) {
      // A lead puts the light down *inside* the select, which costs the light
      // exactly that much of its own contact: at the 120 ms spacing the route
      // needs, the select is pinned at 100 ms and 20 ms is the released gap,
      // so any positive lead drops the pulse under the 100 ms floor
      // HID-MULTITOUCH.md's verified sequence asks for. The runner ships a
      // zero lead for that reason and this defaults to it; the old 10 ms form
      // is kept reachable so the recordings taken under it stay reproducible.
      if (lightLeadMs > 0) {
        report([...record(0x00, COORDS.light), ...record(0x07, COORDS[cam])]);
        delay(lightLeadMs);
      }
      report([...record(0x03, COORDS.light), ...record(0x07, COORDS[cam])]);
      delay(contactMs - lightLeadMs);
      report([...record(0x00, COORDS.light), ...record(0x04, COORDS[cam])]);
      delay(Math.max(1, spacing - contactMs));
    }
    // camtrace.py reads a sweep as 10 -> 04 -> 07 -> 11, so park on the box
    // camera between spacings and leave it there long enough to be stable.
    tap(COORDS.cam11);
    delay(1500);
  }
  return out;
}

const DESCRIPTOR = [5,13,9,4,161,1,133,1,9,34,161,0,9,85,21,0,37,2,117,8,149,1,177,2,9,84,129,2,
  5,13,9,34,161,2,9,66,21,0,37,1,117,1,129,2,9,50,129,2,9,81,37,63,117,6,129,2,
  5,1,9,48,38,95,9,117,16,129,2,9,49,38,55,4,129,2,192,
  5,13,9,34,161,2,9,66,21,0,37,1,117,1,129,2,9,50,129,2,9,81,37,63,117,6,129,2,
  5,1,9,48,38,95,9,117,16,129,2,9,49,38,55,4,129,2,192,192,192];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const contactMs = Number(process.env.CONTACT_MS || 100);
  if (!Number.isInteger(contactMs) || contactMs < 20 || contactMs > 200)
    throw new Error('CONTACT_MS must be an integer between 20 and 200');
  const spacings = process.argv.slice(2).map(Number);
  if (spacings.some(v => !Number.isInteger(v) || v < 40 || v > 500))
    throw new Error('spacings must be integers between 40 and 500 ms');
  if (spacings.some(v => v <= contactMs))
    throw new Error('each spacing must exceed CONTACT_MS');
  const lightLeadMs = Number(process.env.LIGHT_LEAD_MS || 0);
  if (!Number.isInteger(lightLeadMs) || lightLeadMs < 0 || lightLeadMs >= contactMs)
    throw new Error('LIGHT_LEAD_MS must be an integer in [0, CONTACT_MS)');
  for (const event of stream(spacings.length ? spacings : [240, 200, 160, 120],
                             { contactMs, lightLeadMs }))
    console.log(JSON.stringify(event));
}
