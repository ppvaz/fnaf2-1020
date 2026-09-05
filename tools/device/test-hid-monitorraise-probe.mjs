// No-device regression for the monitorraise probe's report stream: the
// teach pair first, the watcher's idle windows after every observe, the
// seam timing the measurement claims, and the trap-2 contact discipline.
import { stream } from './hid-monitorraise-probe.mjs';

const check = (ok, message) => { if (!ok) throw new Error(message); };

const GAPS = [183, 233, 283];
const { events, teachRaiseAt, idles } = stream(GAPS);

check(events[0].command === 'register', 'must register first');
check(events[1].command === 'delay' && events[1].duration >= 5000,
  'must wait for framework-level input attachment, not just UHID open');
for (const event of events.filter(e => e.command === 'delay'))
  check(event.duration > 0, `a zero/negative delay of ${event.duration} would kill the hid process`);
for (const event of events.filter(e => e.command === 'report'))
  check(event.report.length === 12 && event.report[0] === 1 && event.report[1] <= 2,
    'every report must be a 12-byte report-ID-1 packet within the descriptor');

// Virtual clock: classify every press.
let t = 0;
const presses = [];
for (const event of events) {
  if (event.command === 'delay') { t += event.duration; continue; }
  if (event.command !== 'report') continue;
  const r = event.report.slice(2, 7);
  if (r[0] & 1) {
    const x = r[1] | (r[2] << 8), y = r[3] | (r[4] << 8);
    const sx = y * 20 / 9, sy = 1080 - x * 9 / 20;
    const name = Math.abs(sx - 600) <= 4 && Math.abs(sy - 1015) <= 4 ? 'mask'
      : Math.abs(sx - 1200) <= 4 && Math.abs(sy - 540) <= 4 ? 'hall'
      : Math.abs(sx - 1780) <= 4 && Math.abs(sy - 1015) <= 4 ? 'monitor' : '?';
    check(name !== '?', `press at raw ${x},${y} is on no probe control`);
    presses.push({ t, name });
  }
}

const monitors = presses.filter(p => p.name === 'monitor');
const halls = presses.filter(p => p.name === 'hall');
const masks = presses.filter(p => p.name === 'mask');
check(monitors.length === GAPS.length + 2, `expected teach pair + ${GAPS.length} probes, got ${monitors.length}`);
check(halls.length === 3, `expected the 3-flash preamble, got ${halls.length}`);
// Teach first, before any mask or probe: nothing may precede it that could
// swallow a toggle.
check(presses[0].name === 'monitor' && presses[1].name === 'monitor',
  'the teach pair must be the stream\'s first presses');
check(teachRaiseAt === monitors[0].t, 'the schedule anchor must be the teach press DOWN');
// Preamble flashes spaced press+133 then delay 500 -> 633 ms apart.
for (let i = 0; i < 2; i++)
  check(halls[i + 1].t - halls[i].t === 633, `preamble flash ${i + 1} spaced wrong`);

for (let i = 0; i < GAPS.length; i++) {
  const probe = monitors[2 + i], on = masks[2 * i], off = masks[2 * i + 1];
  check(off.t - on.t === 800, `trial ${i}: mask on->off ${off.t - on.t} ms, not maskOnMs 800`);
  check(probe.t - off.t === GAPS[i], `trial ${i}: seam is ${probe.t - off.t} ms, not ${GAPS[i]}`);
  check(probe.t > off.t && off.t > on.t, `trial ${i}: press order broke`);
}
// The watcher may only touch the phone inside idles: every idle must sit
// between a probe's observe window and the next trial's first press, with
// the generator's guard to spare.
check(idles.length === GAPS.length, `one idle per trial, got ${idles.length}`);
for (let i = 0; i < GAPS.length; i++) {
  const probe = monitors[2 + i];
  check(idles[i].start >= probe.t + 900, `idle ${i} starts before the observe window ends`);
  const nextPress = i + 1 < GAPS.length ? masks[2 * (i + 1)].t : Infinity;
  check(idles[i].end + 300 <= nextPress,
    `idle ${i} leaves under 300 ms before the next press (${idles[i].end} vs ${nextPress})`);
}

console.log('hid-monitorraise-probe: teach-first, seam timing, idles, and contact discipline OK');
