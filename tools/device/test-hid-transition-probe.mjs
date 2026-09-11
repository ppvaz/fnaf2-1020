// No-device regression for the safe transition-only recording stream.
import { stream, timingPlan } from './hid-transition-probe.mjs';

const check = (ok, message) => { if (!ok) throw new Error(message); };
const events = stream({ readyMs: 7000, contactMs: 100, settleMs: 1400 });

check(events[0].command === 'register', 'must register first');
for (const event of events.filter(item => item.command === 'delay'))
  check(event.duration > 0, `invalid delay ${event.duration}`);
for (const event of events.filter(item => item.command === 'report'))
  check(event.report.length === 12 && event.report[0] === 1 && event.report[1] === 1,
    'every transition report must be a single-contact report');

let clock = 0;
const downs = [];
for (const event of events) {
  if (event.command === 'delay') { clock += event.duration; continue; }
  if (event.command !== 'report' || !(event.report[2] & 1)) continue;
  const x = event.report[3] | (event.report[4] << 8);
  const y = event.report[5] | (event.report[6] << 8);
  const sx = y * 20 / 9;
  const sy = 1080 - x * 9 / 20;
  const name = Math.abs(sx - 1780) <= 4 && Math.abs(sy - 1015) <= 4 ? 'monitor'
    : Math.abs(sx - 600) <= 4 && Math.abs(sy - 1015) <= 4 ? 'mask'
    : 'dependent-control';
  downs.push({ name, clock });
}

check(JSON.stringify(downs.map(item => item.name)) === JSON.stringify(['monitor', 'monitor', 'mask', 'mask']),
  `unexpected transition order: ${downs.map(item => item.name).join(',')}`);
check(downs[1].clock - downs[0].clock === 1500,
  'monitor transitions must be separated by contact plus settle');
check(downs[2].clock - downs[1].clock === 1500,
  'monitor-down to mask-on must be settled');
check(downs[3].clock - downs[2].clock === 1500,
  'mask transitions must be separated by contact plus settle');

const phase17 = timingPlan({ contactMs: 17, settleMs: 1400,
  planMode: 'press-phase-matched', referenceContactMs: 33 });
const phase33 = timingPlan({ contactMs: 33, settleMs: 1400,
  planMode: 'press-phase-matched', referenceContactMs: 33 });
check(phase17.postReleaseMs === 1416 && phase33.postReleaseMs === 1400,
  'phase-matched plans must compensate the release gap per contact');
const phaseEvents = stream({ contactMs: 17, settleMs: 1400,
  planMode: 'press-phase-matched', referenceContactMs: 33 });
let phaseClock = 0;
const phaseDowns = [];
for (const event of phaseEvents) {
  if (event.command === 'delay') { phaseClock += event.duration; continue; }
  if (event.command === 'report' && (event.report[2] & 1)) phaseDowns.push(phaseClock);
}
check(phaseDowns.slice(1).every((at, index) => at - phaseDowns[index] === 1433),
  'phase-matched contact plans must preserve every press anchor');
check(phaseEvents.filter(item => item.command === 'report').length === 8,
  'phase-matched plan must not add or remove reports');

const warmed = stream({ readyMs: 7000, contactMs: 17, settleMs: 1400,
  warmupMs: 100 });
const warmReports = warmed.filter(item => item.command === 'report');
check(warmReports.length === 9, 'warm-up must add one release-only report');
check((warmReports[0].report[2] & 1) === 0,
  'warm-up report must not press a control');
check(warmReports.slice(1).filter(item => item.report[2] & 1).length === 4 &&
    warmReports.slice(1).filter(item => !(item.report[2] & 1)).length === 4,
  'warm-up must not alter the four transition contacts');
check(warmed.findIndex(item => item.command === 'report') === 2,
  'warm-up must happen after the initial readiness delay');

console.log('hid-transition-probe: independent transitions, contact-specific timing plans, and no dependent controls OK');
