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
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build, devicePlan, MASK_GAP_MS, DEVICE_SPACING_MS, MODEL_SLOT_MS } from './recipe.mjs';
import { MIN_CONTACT_MS, MIN_RELEASED_MS } from './test-hid-trace.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// The assembled driver: every primitive checked here runs on the PHONE, so
// this reads what is sent there rather than the host script that sends it.
// They were the same file until 2026-08-26, when the 1619-line heredoc became
// named parts under trial/.
const src = execFileSync('bash', [join(here, 'trial', 'assemble.sh')], { encoding: 'utf8' });
const check = (ok, message) => { if (!ok) throw new Error(message); };

// Code only: these helpers document the hazard by name, and a checker that
// matched its own warning text would fire on the fix as readily as the bug.
function body(name) {
  const start = src.indexOf(`\n${name}() {\n`);
  check(start >= 0, `${name} not found in the assembled driver`);
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
check(/wait_until \$\(\(sweep_start \+ 2 \* spacing \+ \$\(sweep_cam_ms "\$sweep_last_ms" "\$contact"\)\)\)/.test(sweep),
  'pulsed_sweep_at must wait out its own macro before returning, or the next ' +
  "action is written while the stream is draining and its contact is cut short");

// The per-camera hid time is `sweep_cam_ms contact base`: the plan's `contact`
// for the legacy pulsed geometry, or SELECT_MS + SETTLE_MS + contact for a
// LIGHT_AFTER plan (the second arg -- the sweep's BASE contact -- under 50, so
// a lengthened last slot stays LIGHT_AFTER). Either way the shell releases
// `spacing - sweep_cam_time` between selects and never wall-times inside.
const burst = body('pulsed_cam_burst');
check(!/wait_until/.test(burst), 'pulsed_cam_burst must not wall-time inside the macro');
check(/if \[ "\$base" -lt 50 \]/.test(burst),
  'pulsed_cam_burst must branch on the base contact < 50 for the LIGHT_AFTER geometry');
check(/hid_delay "\$SWEEP_SELECT_MS"[\s\S]*hid_up "\$x" "\$y"[\s\S]*hid_delay "\$SWEEP_SETTLE_MS"[\s\S]*hid_down "\$CAM_LIGHT_X"/.test(burst),
  'the LIGHT_AFTER burst must be select-down / SELECT_MS / select-up / SETTLE_MS / light-down');
check(/hid_cam_light_down "\$x" "\$y"[\s\S]*hid_delay \$\(\(contact - SWEEP_LIGHT_LEAD_MS\)\)/.test(burst),
  'the legacy burst must still spend exactly `contact` ms of hid time per select');
check(/hid_delay \$\(\(spacing - sweep_cam_time\)\)/.test(sweep),
  'pulsed_sweep_at must release for `spacing - sweep_cam_time` between selects');

// The numbers themselves are the plan's, not the shell's: the runner reads
// them from the file recipe.mjs emits. Check what will actually reach the
// phone rather than a default that no longer decides anything.
const leadMs = +(/^SWEEP_LIGHT_LEAD_MS=(\d+)$/m.exec(src) || [])[1];
check(Number.isInteger(leadMs), 'SWEEP_LIGHT_LEAD_MS is not defined in the runner');
check((src.match(/^SWEEP_LIGHT_LEAD_MS=/gm) || []).length === 1,
  'SWEEP_LIGHT_LEAD_MS must have one definition; a later assignment silently ' +
  'overrides the calibrated geometry');

const plan = devicePlan(build({ night: 6, sweepSlotMs: MODEL_SLOT_MS, maskMarginMs: 900,
                                readLatencyMs: 550, hallPulseMs: 130, pilotOffset: 10 }));
for (const [name, lines] of Object.entries(plan)) {
  for (const line of lines) {
    const [at, kind, ...rest] = line.split(' ');
    if (kind !== 'sweep') continue;
    const spacingMs = +rest[0], contactMs = +rest[1];
    check(spacingMs === DEVICE_SPACING_MS,
      `${name}: the sweep at +${at} ms spaces selects ${spacingMs} ms apart; ` +
      `${DEVICE_SPACING_MS} ms is the shipped full-poll device geometry`);
    check(contactMs >= 100,
      `${name}: the sweep's select is ${contactMs} ms; HID-MULTITOUCH.md's ` +
      'verified sequence requires 100-120 ms so the 30 Hz Fusion runtime sees it');
    check(spacingMs - contactMs >= MIN_RELEASED_MS,
      `${name}: only ${spacingMs - contactMs} ms released between selects; Fusion ` +
      'polls touch per frame, so back-to-back contacts can read as one finger moving');
    check(leadMs >= 0 && leadMs < contactMs,
      `the light lead is ${leadMs} ms, which does not fall inside the select`);
    // The pulse inside a held select is deliberately not held to the 100 ms
    // floor a fresh button press has to clear: 90 ms is the light pulse in the
    // exact geometry hid-sweep-probe.sh landed 4/4, and test-hid-trace.mjs
    // records it as the shortest contact this phone has been seen to accept.
    check(contactMs - leadMs >= MIN_CONTACT_MS,
      `${name}: leading the light by ${leadMs} ms leaves it ${contactMs - leadMs} ms, ` +
      `under the ${MIN_CONTACT_MS} ms hid-sweep-probe.sh landed`);
  }
}

// Same hazard, the place it actually bit: the classifier releases the vent
// light and presses the mask. With no gap the game can see one finger moving
// between them, the mask press is lost, the mask sticks on, and every later
// read is dark.
const classify = body('classify_left_and_queue_mask_at');
const maskSeq = classify.slice(classify.indexOf('hid_release'));
// The read releases the vent light, waits the plan's mask gap, and presses the
// prophylactic mask. The HID/video census showed the lost input was the later
// monitor raise, not this mask press; mask-off + raise is now one macro with a
// measured-safe internal gap.
const readBody = body('classify_left_and_queue_mask_at');
check(/hid_delay "\$mask_gap"[\s\S]*hid_down "\$MASK_X"/.test(readBody),
  'the read must wait the plan\'s mask gap before pressing the prophylactic mask');

// The paired-grid capture (plans/15) must not cost the mask any latency: it is
// launched in the background alongside screencap and reaped only after the
// mask press has gone out. A serial `cue_grid` before the mask would add ~53 ms
// to the mask-off seam the census already showed is where reads are lost.
const gridLaunch = readBody.indexOf('cue_grid > "$capture_grid" &');
const maskPress = readBody.indexOf('hid_down "$MASK_X"');
check(gridLaunch !== -1 && gridLaunch < maskPress,
  'the paired grid read must be backgrounded before the prophylactic mask press, not block it');
check(readBody.indexOf('wait "$grid_pid"') > maskPress,
  'the grid read must be reaped after the mask press, so it never delays the seam');
check(/\$\{classification%% \*\}\.grid/.test(readBody),
  'every read must write its grid line next to the frame, empty class included');
check(!/mask-on-bb/.test(src),
  'the BB branch must keep the read\'s mask on, not toggle it off');
check(MASK_GAP_MS >= 33,
  `the plan leaves ${MASK_GAP_MS} ms between the vent light and the mask; one ` +
  '30 Hz Fusion poll is 33 ms, and a lost mask press sticks the mask on, which ' +
  'blinds every later read');

// The macro exists to take the shell's clock out of the loop, so nothing
// inside it may consult that clock. `getevent` measured hid_delay holding a
// 120 ms probe period to a 0.76 ms stdev against wait_until's 49-93 ms overshoot;
// one stray wait_until inside a macro re-rolls that spread and gives the
// difference back.
check(!/wait_until/.test(body('plan_emit')),
  'plan_emit must not wall-time: inside a macro the hid process owns every ' +
  'boundary, which is the only reason a macro is worth having');
const macro = body('run_macro');
const macroWaits = (macro.match(/wait_until/g) || []).length;
check(macroWaits === 2,
  `run_macro wall-times ${macroWaits} boundaries; it may anchor its start and ` +
  'wait itself out, and nothing else');
check(/\[ "\$SLIP" -eq 0 \]/.test(macro),
  'run_macro must refuse a nonzero epoch slip rather than run the window late: ' +
  'the slip comes out of a wind hold whose end must not move, and a macro\'s ' +
  'offsets are relative');
check(/\[ "\$c2" != read \]/.test(macro),
  'run_macro must refuse a window containing the read, which needs the classifier');

// Every instruction the emitter can produce must have an arm in the
// interpreter, and every control it can name must have a coordinate. A plan
// the runner half-executes is worse than one it refuses.
const step = body('plan_step');
const kinds = new Set(Object.values(plan).flatMap(ls => ls.map(l => l.split(' ')[1])));
for (const kind of kinds)
  check(new RegExp(`^\\s*${kind}\\)`, 'm').test(step),
    `the emitter produces "${kind}" instructions and plan_step has no arm for it`);

const controls = body('plan_control_xy');
check((src.match(/^plan_control_xy\(\) \{/gm) || []).length === 1,
  'plan_control_xy must have one definition; body() and the device shell can ' +
  'otherwise use different resolvers');
const named = new Set(Object.values(plan).flatMap(ls => ls.flatMap(l => {
  const [, kind, ...rest] = l.split(' ');
  if (kind === 'tap' || kind === 'hold') return [rest[0]];
  if (kind === 'sweep') return rest[2].split(',').map(n => 'cam' + n);
  return [];
})));
for (const control of named)
  check(new RegExp(`^\\s*${control}\\)`, 'm').test(controls),
    `the emitter names the control "${control}" and plan_control_xy cannot press it`);

// A fork-free clock read writes NOW_REL. Freeze that value into `actual`
// before pairing a human-readable timestamp with a trace mark: the legacy
// calibration branches once printed fresh NOW_REL but marked an unrelated
// global `actual`, making the trace disagree with the adjacent log line.
const sourceLines = src.split('\n');
let actualIsCurrent = false;
for (let i = 0; i < sourceLines.length; i++) {
  const line = sourceLines[i];
  if (/^\s*now_rel\s*$/.test(line)) actualIsCurrent = false;
  if (/^\s*actual=\$NOW_REL\s*$/.test(line)) actualIsCurrent = true;
  if (/^\s*hid_mark "\$actual"\s*$/.test(line))
    check(actualIsCurrent,
      `hid_mark uses stale actual after now_rel at driver line ${i + 1}`);
}

console.log('HID wall-timing checks passed');
