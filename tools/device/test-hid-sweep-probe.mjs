// No-device regression for the sweep probe's report stream: the trap-2
// contact discipline, the pulsed (not held) light, and the requested spacing.
import { stream, COORDS, toRaw } from './hid-sweep-probe.mjs';

const check = (ok, message) => { if (!ok) throw new Error(message); };
const key = (point) => toRaw(point).join(',');

const SPACINGS = [240, 160, 120];
const events = stream(SPACINGS);
check(events[0].command === 'register', 'must register first');
check(events[1].command === 'delay' && events[1].duration >= 6000,
  'must wait for framework-level input attachment, not just UHID open');

for (const event of events.filter(e => e.command === 'report'))
  check(event.report.length === 12 && event.report[0] === 1 && event.report[1] <= 2,
    'every report must be a 12-byte report-ID-1 packet within the descriptor');

// Walk the stream on a virtual clock and record what the light and the
// selected camera are doing.
let t = 0, lightDown = null, camDown = null;
const selections = [];   // [camKey, downMs]
const lightPulses = [];  // [downMs, upMs, camKeyAtDown]
for (const event of events) {
  if (event.command === 'delay') { t += event.duration; continue; }
  if (event.command !== 'report') continue;
  const count = event.report[1];
  const records = [event.report.slice(2, 7), event.report.slice(7, 12)].slice(0, count);
  for (const r of records) {
    const id = r[0] >> 2, down = (r[0] & 1) !== 0;
    const xy = `${r[1] | (r[2] << 8)},${r[3] | (r[4] << 8)}`;
    if (id === 0) {
      if (down && lightDown === null) lightDown = [t, xy];
      if (!down && lightDown !== null) { lightPulses.push([lightDown[0], t, camDown, lightDown[1]]); lightDown = null; }
    } else {
      if (down && camDown === null) { camDown = xy; selections.push([xy, t]); }
      else if (!down) camDown = null;
    }
  }
}
check(lightDown === null && camDown === null, 'both contacts must end released');

const wanted = [COORDS.cam10, COORDS.cam4, COORDS.cam7].map(key);
check(selections.length === SPACINGS.length * 3,
  `expected ${SPACINGS.length * 3} camera selections, got ${selections.length}`);
for (const [i, [xy]] of selections.entries())
  check(xy === wanted[i % 3], `selection ${i} should be ${wanted[i % 3]}, got ${xy}`);

for (const [i, spacing] of SPACINGS.entries()) {
  const [a, b, c] = selections.slice(i * 3, i * 3 + 3).map(([, at]) => at);
  check(b - a === spacing && c - b === spacing,
    `sweep ${i} must space selections ${spacing} ms apart, got ${b - a} and ${c - b}`);
}

// Contact 0 also carries the plain taps that get the probe into the office.
const menuTaps = lightPulses.filter(([, , , xy]) => xy !== key(COORDS.light));
check(menuTaps.map(([, , , xy]) => xy).join(' ') ===
  [COORDS.sixth, COORDS.monitor, ...SPACINGS.map(() => COORDS.cam11)].map(key).join(' '),
  'the probe must tap 6th Night, raise the monitor, and park on CAM 11 after each sweep');
const litPulses = lightPulses.filter(([, , , xy]) => xy === key(COORDS.light));
check(litPulses.length === SPACINGS.length * 3,
  'the light must be pulsed once per selection, not held across the sweep');
for (const [down, up, cam] of litPulses) {
  check(up - down <= 100, `each light pulse must be at most 100 ms, got ${up - down}`);
  check(wanted.includes(cam), 'the light must only be on while a target camera is selected');
}
// The point of the pulse: 90 ms of light per camera instead of a hold that
// would outspend night 6's 3000-frame flashlight.
const litMs = litPulses.reduce((sum, [down, up]) => sum + (up - down), 0) / SPACINGS.length;
check(litMs <= 300, `a sweep must draw at most 300 ms of light, got ${litMs}`);

console.log(`HID sweep probe checks passed (${SPACINGS.join('/')} ms spacings, ${litMs} ms lit per sweep)`);
