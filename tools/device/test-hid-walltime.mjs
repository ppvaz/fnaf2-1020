// Static gate on where the runner's timing comes from.
//
// The rule is not "wall-time everything" -- that was tried and it is worse.
// The shell may place *when* a gesture starts; the hid process must own every
// boundary inside it. Both halves are measured:
//
//   - Mixing them inside a gesture breaks the spacing. A wall-timed start with
//     hid-side contact delays gave 105 ms selects instead of 120, because the
//     hid delay elapses concurrently with the shell's wait rather than adding
//     to it, and the game then renders CAM 07 alone.
//   - Moving the timing out to the shell breaks the schedule. `sleep` and
//     `date` are fork+exec on this phone, so timing each release from the
//     shell cost a fork per press and drifted the cycle anchor 434 ms -- the
//     schedule came apart inside the opening.
//
// Neither failure is visible in the report stream, which is valid in both
// cases. Only the timing is wrong, which is why this gate reads the source.
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
// The shell positions the start and resynchronises at the end; nothing may
// wall-time *between* the selects, because that desynchronises the shell from
// the hid process and jitters the spacing to 90-160 ms.
const loop = sweep.slice(sweep.indexOf('while '), sweep.lastIndexOf('done'));
check(!/wait_until/.test(loop),
  'pulsed_sweep_at must not wall-time between its selects');
check(/wait_until "\$sweep_start"/.test(sweep),
  'pulsed_sweep_at must wall-time its start');
check(/wait_until \$\(\(sweep_start \+ 2 \* spacing \+ contact\)\)/.test(sweep),
  'pulsed_sweep_at must wait out its own macro before returning, or the next ' +
  "action is written while the stream is draining and its contact is cut short");

// The sweep is parameterised by the plan now, so check the relationship
// symbolically and the defaults numerically. Per camera the hid process must
// spend exactly `spacing`: a `contact` ms select with the light pulsed inside
// it, then `spacing - contact` released before the next select.
const burst = body('pulsed_cam_burst');
check(!/wait_until/.test(burst), 'pulsed_cam_burst must not wall-time inside the macro');
check(/hid_delay "\$SWEEP_LIGHT_LEAD_MS"/.test(burst) &&
      /hid_delay \$\(\(contact - SWEEP_LIGHT_LEAD_MS\)\)/.test(burst),
  'pulsed_cam_burst must spend exactly `contact` ms of hid time per select');
check(/hid_delay \$\(\(spacing - contact\)\)/.test(sweep),
  'pulsed_sweep_at must release for `spacing - contact` between selects');

// The defaults the runner ships with, against what the phone has landed.
const def = name => {
  const m = new RegExp(`${name}="\\$\\{${name}:-(\\d+)\\}"`).exec(src);
  check(m, `${name} has no default`);
  return +m[1];
};
const spacingMs = def('PLAN_SPACING_MS'), contactMs = def('PLAN_CONTACT_MS');
const leadMs = +(/^SWEEP_LIGHT_LEAD_MS=(\d+)$/m.exec(src) || [])[1];
check(spacingMs <= 120,
  `the sweep spaces selects ${spacingMs} ms apart; hid-sweep-probe.sh has ` +
  'landed 120 ms and nothing shorter');
check(contactMs >= 90,
  `the sweep's select is ${contactMs} ms, under every contact the phone has accepted`);
check(spacingMs - contactMs >= 20,
  `only ${spacingMs - contactMs} ms released between selects; Fusion polls ` +
  'touch per frame, so back-to-back contacts can read as one finger moving');
check(leadMs > 0 && leadMs < contactMs,
  `the light lead is ${leadMs} ms, which does not fall inside the select`);

// Same hazard, the place it actually bit: the classifier releases the vent
// light and presses the mask. With no gap the game can see one finger moving
// between them, the mask press is lost, the mask sticks on, and every later
// read is dark.
const classify = body('classify_left_and_queue_mask_at');
const maskSeq = classify.slice(classify.indexOf('hid_release'));
const gap = /hid_release\s*\n\s*hid_delay (\d+)\s*\n\s*hid_down "\$MASK_X"/.exec(maskSeq);
check(gap && +gap[1] >= 33,
  'classify_left_and_queue_mask_at must leave at least one 30 Hz Fusion poll ' +
  '(33 ms) of released time between the vent light and the mask press');

// Contacts are timed inside the hid process, never from the shell. `sleep`
// and `date` are fork+exec on this phone: timing releases from the shell cost
// one fork per press and drifted the cycle anchor 434 ms, which took the
// schedule apart inside the opening. hid_delay also measures from when the
// press is delivered, so a backlogged stream still makes a full contact.
for (const name of ['press_at', 'hold_at']) {
  const text = body(name);
  const hid = text.slice(text.indexOf('HID_MODE'));
  check(/hid_delay/.test(hid),
    `${name} must time its contact with hid_delay; timing it from the shell ` +
    'costs a fork per press and drifts the whole schedule');
  check(!/sleep_ms|wait_until/.test(hid),
    `${name} times its release from the shell; that is a fork per press`);
}
console.log('HID wall-timing checks passed');
