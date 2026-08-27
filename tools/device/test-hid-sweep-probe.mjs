// No-device regression for the sweep probe's report stream: the trap-2
// contact discipline, the pulsed (not held) light, and the requested spacing.
import { stream, COORDS, toRaw } from './hid-sweep-probe.mjs';

const check = (ok, message) => { if (!ok) throw new Error(message); };
const key = (point) => toRaw(point).join(',');

const SPACINGS = [240, 160, 120];
const events = stream(SPACINGS);   // the shipped geometry: no light lead
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

// Contact 0 also carries the plain taps the probe makes inside the office.
//
// The night is NOT among them any more. Selecting one was a sixth copy of the
// title selection, in the only language test-menu.sh could not see, tapped
// blind as the stream's first report. hid-sweep-probe.sh now enters through
// menu_select and confirms a night started before a report goes out, so this
// asserts the stream contains no title tap at all -- the strongest form of the
// property, since a reintroduced one would have to appear here.
const menuTaps = lightPulses.filter(([, , , xy]) => xy !== key(COORDS.light));
check(menuTaps.map(([, , , xy]) => xy).join(' ') ===
  [COORDS.monitor, ...SPACINGS.map(() => COORDS.cam11)].map(key).join(' '),
  'the probe must raise the monitor and park on CAM 11 after each sweep, and ' +
  'must not select a night itself -- that is menu_select\'s job');
check(!('sixth' in COORDS),
  'COORDS must not carry a title coordinate; menu.sh owns night selection');
const litPulses = lightPulses.filter(([, , , xy]) => xy === key(COORDS.light));
check(litPulses.length === SPACINGS.length * 3,
  'the light must be pulsed once per selection, not held across the sweep');
for (const [down, up, cam] of litPulses) {
  check(up - down <= 100, `each light pulse must be at most 100 ms, got ${up - down}`);
  check(wanted.includes(cam), 'the light must only be on while a target camera is selected');
}

// The default geometry gives the light the same contact the select gets. A
// lead spends the light's own contact: at the 120 ms spacing this route needs,
// the select is pinned at 100 ms by the 20 ms released gap, so a 10 ms lead
// leaves the pulse at 90 -- under the floor HID-MULTITOUCH.md's verified
// sequence asks for, which is why 9a9d2fb moved the light into the select's
// own report rather than lowering the auditor to match it.
for (const [down, up] of litPulses)
  check(up - down === 100,
    `the shipped zero-lead pulse must hold the full 100 ms, got ${up - down}`);
// The 10 ms lead stays reachable so recordings taken under it stay
// reproducible, and it must still be the shorter pulse it always was.
const led = stream([120], { lightLeadMs: 10 });
let lt = 0, ldown = null, ledPulses = [];
for (const event of led) {
  if (event.command === 'delay') { lt += event.duration; continue; }
  if (event.command !== 'report') continue;
  const r = event.report.slice(2, 7);
  if ((r[0] >> 2) !== 0) continue;
  if ((r[0] & 1) !== 0) { if (ldown === null) ldown = lt; }
  else if (ldown !== null) { ledPulses.push(lt - ldown); ldown = null; }
}
check(ledPulses.filter(d => d === 90).length === 3,
  `a 10 ms lead must leave three 90 ms pulses, got ${ledPulses.join('/')}`);
// The point of the pulse: 90 ms of light per camera instead of a hold that
// would outspend night 6's 3000-frame flashlight.
const litMs = litPulses.reduce((sum, [down, up]) => sum + (up - down), 0) / SPACINGS.length;
check(litMs <= 300, `a sweep must draw at most 300 ms of light, got ${litMs}`);

// HELD_LIGHT mode (plans/17): contact 0 goes down at the first select and
// stays down until the last camera's release, so the light spans the whole
// sweep instead of pulsing per camera. The c33 probe showed 33 ms selects
// land but the third camera's pulsed light loses its edge -- holding removes
// the edges.
{
  const held = stream([66], { contactMs: 33, heldLight: true });
  let ht = 0, hLightDown = null, hSelections = [], hLightSpan = null;
  for (const event of held) {
    if (event.command === 'delay') { ht += event.duration; continue; }
    if (event.command !== 'report') continue;
    const count = event.report[1];
    const recs = [event.report.slice(2, 7), event.report.slice(7, 12)].slice(0, count);
    for (const r of recs) {
      const id = r[0] >> 2, down = (r[0] & 1) !== 0;
      const xy = `${r[1] | (r[2] << 8)},${r[3] | (r[4] << 8)}`;
      if (id === 0 && xy === key(COORDS.light)) {
        if (down && hLightDown === null) hLightDown = ht;
        if (!down && hLightDown !== null) { hLightSpan = ht - hLightDown; hLightDown = null; }
      } else if (id === 1 && down && wanted.includes(xy)) hSelections.push(xy);
    }
  }
  check(hSelections.join(' ') === wanted.join(' '),
    `held-light sweep must still select 10,4,7 in order, got ${hSelections.join(' ')}`);
  // one continuous span, not three pulses: 3 * 33 contact + 2 * 33 gap = 165
  check(hLightSpan === 165,
    `held light must be one continuous 165 ms span across the c33 sweep, got ${hLightSpan}`);
}

console.log(`HID sweep probe checks passed (${SPACINGS.join('/')} ms spacings, ${litMs} ms lit per sweep)`);
