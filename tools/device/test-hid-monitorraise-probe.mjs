// No-device regression for the monitorraise probe's report stream: the
// teach pair first, the watcher's idle windows after every observe, the
// seam timing the measurement claims, and the trap-2 contact discipline.
import { stream } from './hid-monitorraise-probe.mjs';

const check = (ok, message) => { if (!ok) throw new Error(message); };

const GAPS = [183, 233, 283];
const ROUNDS = 2;
const { events, teachRaiseAt, idles } = stream(GAPS, { rounds: ROUNDS });

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
check(monitors.length === GAPS.length * ROUNDS + 2,
  `expected teach pair + ${GAPS.length * ROUNDS} probes, got ${monitors.length}`);
check(halls.length === 3, `expected the 3-flash preamble, got ${halls.length}`);
// Teach first, before any mask or probe: nothing may precede it that could
// swallow a toggle.
check(presses[0].name === 'monitor' && presses[1].name === 'monitor',
  'the teach pair must be the stream\'s first presses');
check(teachRaiseAt === monitors[0].t, 'the schedule anchor must be the teach press DOWN');
// Preamble flashes spaced press+133 then delay 500 -> 633 ms apart.
for (let i = 0; i < 2; i++)
  check(halls[i + 1].t - halls[i].t === 633, `preamble flash ${i + 1} spaced wrong`);

const probes = monitors.slice(2);
check(masks.length === GAPS.length * ROUNDS * 2,
  `expected two mask taps per trial, got ${masks.length}`);
check(idles[0].reason === 'teach-restore', 'the first watcher window must verify the teach lower');
check(idles[0].end - idles[0].start === 800, 'teach restore window must leave a 400 ms preamble guard');
for (let i = 0; i < probes.length; i++) {
  const probe = probes[i], on = masks[2 * i], off = masks[2 * i + 1];
  check(off.t - on.t === 800, `trial ${i}: mask on->off ${off.t - on.t} ms, not maskOnMs 800`);
  const round = Math.floor(i / GAPS.length);
  const expected = round % 2 === 0 ? GAPS[i % GAPS.length] : [...GAPS].reverse()[i % GAPS.length];
  check(probe.t - off.t === expected, `trial ${i}: seam is ${probe.t - off.t} ms, not ${expected}`);
  check(probe.t > off.t && off.t > on.t, `trial ${i}: press order broke`);
}
// The watcher may only touch the phone inside idles: every idle must sit
// between a probe's observe window and the next trial's first press, with
// the generator's guard to spare.
check(idles.length === GAPS.length * ROUNDS + 1, `teach idle plus one trial idle per trial, got ${idles.length}`);
for (let i = 0; i < probes.length; i++) {
  const probe = probes[i];
  const idle = idles[i + 1];
  check(idle.start >= probe.t + 900, `idle ${i} starts before the observe window ends`);
  const nextPress = i + 1 < probes.length ? masks[2 * (i + 1)].t : Infinity;
  check(idle.end + 300 <= nextPress,
    `idle ${i} leaves under 300 ms before the next press (${idle.end} vs ${nextPress})`);
  check(idle.round === Math.floor(i / GAPS.length), `idle ${i} has wrong round`);
}

console.log('hid-monitorraise-probe: teach-first, seam timing, idles, and contact discipline OK');

for (const options of [{ contactMs: 100, maskOnMs: 50 }, { idleMs: 400 },
  { teachSettleMs: 100 }, { rounds: 1.5 }, { readyMs: NaN }]) {
  let refused = false;
  try { stream([267], options); } catch { refused = true; }
  check(refused, `invalid geometry must refuse: ${JSON.stringify(options)}`);
}
// The exploratory 17 ms contact must remain expressible, without claiming
// it succeeded on the handset. A compound keeps both IDs until release.
const compound = stream([267], { rounds: 1, contactMs: 17, twoFinger: true });
const down = compound.events.findIndex(e => e.command === 'report' && e.report[1] === 2 && e.report[7] === 7);
check(down > 0, 'compound must contain both contacts');
check(compound.events[down + 1].duration === 133, 'compound hold must reproduce the runner');
check(compound.events[down + 2].report[7] === 4 && compound.events[down + 3].report[2] === 0,
  'compound must release monitor then hall with stable IDs');
