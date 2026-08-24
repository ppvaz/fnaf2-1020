// Microroutine oracle for the runner's own HID stream.
//
// The routine level already has one: the device plan replays through the
// engine and either survives the night or does not. The microroutine level --
// how long a contact is held, how much released time separates two buttons,
// whether a slot ever loses its touch-end -- had no oracle but a phone, and
// every input bug this project has hit lives there. `HID_TRACE_RUN=1` makes
// the runner append every report it sends, and the stream carries its own
// `delay` commands, so the intended timing is recoverable from the artifact.
//
// Usage: test-hid-trace.mjs [trace.jsonl]   (no argument runs the self-test)
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Both from device measurement; see docs/device/HID-MULTITOUCH.md.
//
// 90 ms is the shortest contact anything on this phone has been observed to
// accept: it is the light pulse inside the sweep geometry hid-sweep-probe.sh
// landed 4/4. It is deliberately *not* the 100 ms floor quoted for a fresh
// button tap -- this is the "below all evidence" line, not the recommended
// one. It still catches what shipped: the hall flash transcribed from the
// simulator's five frames as an 83 ms contact, which produced zero visible
// beams across a graded night.
export const MIN_CONTACT_MS = 90;
// Fusion polls touch once per frame, so two different buttons with no released
// time between them can read as one finger moving from one to the other. The
// mask press lost that way stuck the mask on and blinded every later read.
export const MIN_RELEASED_MS = 20;

export function audit(text) {
  const events = text.split('\n').filter(Boolean).map(line => JSON.parse(line));
  const problems = [];
  const active = new Map();          // id -> {at, xy}
  let now = 0, lastReleaseAt = null, lastReleaseXy = null;

  for (const event of events) {
    // A mark is the runner's real clock at an action boundary. Without them
    // only hid-side delays advance the timeline, and every wall-timed pair of
    // actions reads as a zero-gap button change.
    if (event.command === 'mark') { now = Math.max(now, event.ms); continue; }
    if (event.command === 'delay') { now += event.duration; continue; }
    if (event.command !== 'report') continue;
    const report = event.report;
    if (report.length !== 12 || report[0] !== 1 || report[1] > 2) {
      problems.push(`malformed report at ${now} ms: ${JSON.stringify(report)}`);
      continue;
    }
    const count = report[1];
    const records = [report.slice(2, 7), report.slice(7, 12)].slice(0, count);
    const before = new Set(active.keys());
    const consumed = new Set();
    for (const record of records) {
      const id = record[0] >> 2, down = (record[0] & 1) !== 0;
      const xy = `${record[1] | (record[2] << 8)},${record[3] | (record[4] << 8)}`;
      consumed.add(id);
      if (down) {
        if (!active.has(id)) {
          // Fusion polls touch per frame: pressing a different button in the
          // same instant a contact lifts can read as one finger moving.
          if (lastReleaseAt !== null && xy !== lastReleaseXy &&
              now - lastReleaseAt < MIN_RELEASED_MS)
            problems.push(`only ${now - lastReleaseAt} ms released between ` +
              `${lastReleaseXy} and ${xy} at ${now} ms`);
          active.set(id, { at: now, xy });
        }
      } else if (active.has(id)) {
        const held = now - active.get(id).at;
        if (held < MIN_CONTACT_MS)
          problems.push(`contact ${id} at ${active.get(id).xy} held ${held} ms ` +
            `(floor ${MIN_CONTACT_MS}) ending ${now} ms`);
        lastReleaseAt = now; lastReleaseXy = active.get(id).xy;
        active.delete(id);
      }
    }
    // Trap 2: the count is how many records the driver consumes, so a contact
    // that is no longer touching but not named in the packet stays latched.
    for (const id of before)
      if (!consumed.has(id) && count <= id)
        problems.push(`contact ${id} left unnamed by a count=${count} report at ${now} ms`);
  }
  for (const [id, c] of active)
    problems.push(`contact ${id} at ${c.xy} never released (down since ${c.at} ms)`);
  return { problems, spanMs: now, reports: events.filter(e => e.command === 'report').length };
}

const R = (count, ...recs) => JSON.stringify({ id: 92, command: 'report',
  report: [1, count, ...recs.flat(), ...Array(10 - recs.flat().length).fill(0)] });
const D = ms => JSON.stringify({ id: 92, command: 'delay', duration: ms });

function selfTest() {
  const rec = (flags, x, y) => [flags, x & 255, x >> 8, y & 255, y >> 8];
  // A clean pulsed camera select: 100 ms contact, both contacts named on release.
  const good = [R(2, rec(0, 100, 200), rec(7, 300, 400)), D(10),
                R(2, rec(3, 100, 200), rec(7, 300, 400)), D(90),
                R(2, rec(0, 100, 200), rec(4, 300, 400)), D(20),
                R(2, rec(0, 100, 200), rec(7, 500, 600)), D(10),
                R(2, rec(3, 100, 200), rec(7, 500, 600)), D(90),
                R(2, rec(0, 100, 200), rec(4, 500, 600))].join('\n');
  const clean = audit(good);
  if (clean.problems.length) throw new Error('self-test: a clean stream was rejected: ' +
    clean.problems.join('; '));

  // The three failures this session actually shipped to the phone.
  const short = audit([R(1, rec(3, 700, 800)), D(83), R(1, rec(0, 700, 800))].join('\n'));
  if (!short.problems.some(p => /held 83 ms/.test(p)))
    throw new Error('self-test: an 83 ms contact was not caught');

  const nogap = audit([R(1, rec(3, 100, 200)), D(100), R(1, rec(0, 100, 200)),
                       R(1, rec(3, 900, 900)), D(100), R(1, rec(0, 900, 900))].join('\n'));
  if (!nogap.problems.some(p => /released between/.test(p)))
    throw new Error('self-test: a zero-gap button change was not caught');

  const latched = audit([R(2, rec(3, 100, 200), rec(7, 300, 400)), D(100),
                         R(1, rec(0, 100, 200))].join('\n'));
  if (!latched.problems.some(p => /never released|unnamed/.test(p)))
    throw new Error('self-test: a latched contact 1 was not caught');

  console.log('HID trace auditor self-test passed ' +
    '(clean stream accepted; short contact, zero-gap change and latched contact all caught)');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) { selfTest(); }
  else {
    const text = readFileSync(file, 'utf8');
  if (!/"command":"mark"/.test(text))
    throw new Error(`${file} has no marks: it was recorded before the runner ` +
      'emitted them, and without a real clock every wall-timed action reads ' +
      'as a zero-gap button change');
  const { problems, spanMs, reports } = audit(text);
    console.log(`${file}: ${reports} reports over ${spanMs} ms of scheduled hid time`);
    for (const p of problems) console.log('  ' + p);
    console.log(problems.length ? `${problems.length} problems` : 'no problems');
    if (problems.length) process.exitCode = 1;
  }
}
