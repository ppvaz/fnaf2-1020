// Static gate: the sweep primitives must be wall-timed, never hid-delayed.
//
// `hid_delay` elapses inside the hid process, concurrently with the shell's
// own wait, so a delay inside a wall-timed helper does not add to the spacing
// -- it replaces it. A 10+100 ms delay pair inside pulsed_cam_at collapsed the
// camera spacing from 120 ms to ~105, under the only spacing the phone has
// been proven to accept, and the kernel trace showed consecutive selects
// 1.6 ms apart while the game rendered CAM 07 alone. Nothing caught it because
// the report stream itself was valid; only its timing was wrong.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'trial-minus7.sh'), 'utf8');
const check = (ok, message) => { if (!ok) throw new Error(message); };

// Code only: these helpers document the hazard by name, and a checker that
// matched its own warning text would fire on the fix as readily as the bug.
function body(name) {
  const start = src.indexOf(`\n${name}() {\n`);
  check(start >= 0, `${name} not found in trial-minus7.sh`);
  const end = src.indexOf('\n}\n', start);
  return src.slice(start, end)
    .split('\n').filter(line => !/^\s*#/.test(line)).join('\n');
}

// The sweep is one macro: the shell positions its start and the hid process
// owns every boundary inside it. Mixing the two is what breaks the spacing --
// hid delays elapse concurrently with a shell wait rather than adding to it.
const sweep = body('pulsed_sweep_at');
check((sweep.match(/wait_until/g) || []).length === 1,
  'pulsed_sweep_at must wall-time only its start; a wait_until inside the ' +
  'burst desynchronises the shell from the hid process');

// Each camera costs 10 + 100 + 10 ms of hid time, so the selects land exactly
// 120 ms apart -- the only spacing hid-sweep-probe.sh has landed 4/4.
const burst = body('pulsed_cam_burst');
check(!/wait_until/.test(burst), 'pulsed_cam_burst must not wall-time inside the macro');
const perCam = (burst.match(/hid_delay (\d+)/g) || [])
  .map(m => +m.split(' ')[1]).reduce((a, b) => a + b, 0);
const between = (sweep.match(/hid_delay (\d+)/g) || [])
  .map(m => +m.split(' ')[1]);
check(between.length === 2 && between.every(v => v === 10),
  `pulsed_sweep_at separates its cameras by ${between.join(',')} ms of hid time`);
check(perCam + between[0] === 120,
  `each camera costs ${perCam + between[0]} ms of hid time; the phone has only ` +
  'landed 120 ms spacing, and shorter renders CAM 07 alone');
check(perCam - 10 >= 100,
  `the camera contact is ${perCam - 10} ms, under the phone's 100 ms floor`);

// press_at's own down/delay/release is the proven single-contact form and is
// deliberately exempt: it has one contact and no spacing to preserve.
check(/hid_delay 100/.test(body('press_at')),
  'press_at should keep its proven 100 ms single-contact hold');

console.log('HID wall-timing checks passed');
