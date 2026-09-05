// No-device regression for the maskraise probe's report stream: the seam
// timing the measurement claims to make, the trap-2 contact discipline, and
// the round ordering. Run by tools/test.mjs alongside the other probes.
import { stream } from './hid-maskraise-probe.mjs';

const check = (ok, message) => { if (!ok) throw new Error(message); };

const GAPS = [133, 200, 267];
const events = stream(GAPS, { rounds: 2 });

check(events[0].command === 'register', 'must register first');
check(events[1].command === 'delay' && events[1].duration >= 6000,
  'must wait for framework-level input attachment, not just UHID open');

for (const event of events.filter(e => e.command === 'delay'))
  check(event.duration > 0, `a zero/negative delay of ${event.duration} would kill the hid process`);

for (const event of events.filter(e => e.command === 'report')) {
  check(event.report.length === 12 && event.report[0] === 1 && event.report[1] <= 2,
    'every report must be a 12-byte report-ID-1 packet within the descriptor');
  // The inactive filler record must always be present (trap 2 in
  // docs/device/HID-MULTITOUCH.md: a report promising one record leaves
  // contact 1 latched down).
  check(event.report[7] === 4 || event.report[7] === 7 || event.report[7] === 0,
    'contact 1 record must be a down/up/inactive form');
}

// Walk the stream on a virtual clock. The probe's claim is that every hall
// press lands exactly `gap` after the mask-off press that precedes it -- the
// same down-to-down quantity MASK_RAISE_GAP_MS names in the runner.
let t = 0;
const presses = [];  // { t, contact }
for (const event of events) {
  if (event.command === 'delay') { t += event.duration; continue; }
  if (event.command !== 'report') continue;
  const r = event.report.slice(2, 7);
  if (r[0] & 1) {
    const x = r[1] | (r[2] << 8), y = r[3] | (r[4] << 8);
    const sx = y * 20 / 9, sy = 1080 - x * 9 / 20;
    const name = Math.abs(sx - 600) <= 4 && Math.abs(sy - 1015) <= 4 ? 'mask'
      : Math.abs(sx - 1200) <= 4 && Math.abs(sy - 540) <= 4 ? 'hall' : '?';
    check(name !== '?', `press at raw ${x},${y} is on no probe control`);
    presses.push({ t, name });
  }
}

const halls = presses.filter(p => p.name === 'hall');
check(halls.length === 3 + GAPS.length * 2,
  `expected 3 preamble + ${GAPS.length * 2} trial hall presses, got ${halls.length}`);
// Preamble spacing: press(hall,133) then delay 500 -> 633 ms apart.
for (let i = 0; i < 2; i++)
  check(halls[i + 1].t - halls[i].t === 633, `preamble flash ${i + 1} spaced ${halls[i + 1].t - halls[i].t}, not 633`);

const trials = [];
const bodyHalls = halls.slice(3);
for (let i = 0; i < bodyHalls.length; i++) {
  const on = presses.filter(p => p.name === 'mask' && p.t < bodyHalls[i].t).at(-2);
  const off = presses.filter(p => p.name === 'mask' && p.t < bodyHalls[i].t).at(-1);
  check(off.t - on.t === 800, `trial ${i}: mask on->off ${off.t - on.t} ms, not maskOnMs 800`);
  trials.push(bodyHalls[i].t - off.t);
}
// Round 1 forward, round 2 reversed -- drift must not correlate with gap.
check(JSON.stringify(trials.slice(0, GAPS.length)) === JSON.stringify(GAPS),
  `round 1 order ${trials.slice(0, GAPS.length)} is not ${GAPS}`);
check(JSON.stringify(trials.slice(GAPS.length)) === JSON.stringify([...GAPS].reverse()),
  `round 2 order ${trials.slice(GAPS.length)} is not ${[...GAPS].reverse()}`);
for (const gap of trials)
  check(gap > 33, `gap ${gap} does not exceed the 33 ms contact`);

console.log('hid-maskraise-probe: seam timing, contact discipline, and round order OK');
