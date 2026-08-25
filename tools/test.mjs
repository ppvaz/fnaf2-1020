// The single entry point for the suite.
//
//   node tools/test.mjs             # every check that can run here
//   node tools/test.mjs --engine    # headless engine checks only (seconds)
//   node tools/test.mjs --browser   # Chrome checks only (minutes)
//   node tools/test.mjs --reports   # also print the diagnostic tools
//   node tools/test.mjs --parallel  # run the browser checks at once (see below)
//
// Two kinds of tool live in tools/, and the split matters: CHECKS assert and
// exit non-zero, so a runner can give a verdict on them. REPORTS print numbers
// for a human to read and always exit 0 -- running them under a PASS heading
// would be a lie, so they are opt-in and unjudged.
//
// The engine checks run concurrently. The browser checks do NOT, by default:
// they drive a trainer that runs at real time and grades inputs in
// milliseconds, and five headless Chromes on four cores measurably degrade it
// -- the same lessontest run reached best streak 5 alone and 3 under load.
// Neither run passed, so nothing here rests on that; but a timing-graded page
// is the wrong thing to starve for wall clock. `--parallel` opts in and takes
// the group from about 280 s to about 200 s.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromeBinary, chromeAvailable } from './chrome.mjs';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = join(TOOLS, '..');
const PORT = 8731;
const PAGE = `http://localhost:${PORT}/dist/index.html`;

const ENGINE = [
  // First, because it is the only check that fails on a wrong *rule* rather
  // than a wrong *outcome*: the population checks below all pass with a
  // corrupted sourced constant.
  ['sourcetest', ['sourcetest.mjs']],
  ['simtest', ['simtest.mjs', '--sweep']],
  ['hidreporttest', ['hidreporttest.mjs']],
  ['bbtest', ['bbtest.mjs', '200', '--assert']],
  ['bbtest --worst', ['bbtest.mjs', '100', '--worst', '--assert']],
  // The pilot asserts one narrow claim, not survival: Balloon Boy never
  // reaches the office, and no Foxy death follows him taking the lights.
  ['pilottest', ['pilottest.mjs', '200', '--vent', '--sync', '--assert']],
  ['pilottest --worst', ['pilottest.mjs', '100', '--vent', '--sync', '--worst', '--assert']],
  ['pilottest --guard', ['pilottest.mjs', '200', '--night=6', '--vent', '--sync', '--assert-guard']],
  // The sparse-left Night 7 candidate is an aligned simulator contract, not a
  // device clear. Its explicit pilot offset keeps the phase dependency visible.
  ['hidpilot sparse-left', ['hidpilottest.mjs', '500', '--night=7', '--sparse-left', '--assert']],
  ['hidpilot sparse worst', ['hidpilottest.mjs', '200', '--night=7', '--sparse-left', '--worst', '--assert']],
  // The phone-accepted 790 ms sweep invalidates that idealized table. Preserve
  // the rejection until a different policy is consciously modeled and proven.
  ['hidpilot device reject', ['hidpilottest.mjs', '200', '--night=7', '--sparse-left', '--device-sweep', '--assert-rejected']],
  // The selected Night 6 left-opening route, priced against the actuator the
  // phone actually has. Held at 790 ms it dies -- and not only on stalls: a
  // 47-frame lit sweep 84 times over spends more than night 6's whole 3000
  // frame flashlight. Pulsing the light around each contact fixes the power,
  // but at the phone's proven 240 ms spacing the stun bridge across the
  // five-tick BB mask still lapses. Both rejections stay until a faster
  // camera actuator is measured on a phone.
  ['hidpilot n6 device reject', ['hidpilottest.mjs', '200', '--night=6',
    '--device-sweep', '--assert-rejected']],
  ['hidpilot n6 pulse reject', ['hidpilottest.mjs', '200', '--night=6',
    '--device-sweep', '--pulse-light', '--sweep-slot-ms=240',
    '--mask-margin-ms=800', '--pilot-offset-ms=217', '--assert-rejected']],
  // The route at the human floor's 350 ms slots: 0/200 at every offset tried
  // (0/83/167/250/300, 2026-08-25), dying to stun-lapse office attacks -- the
  // sweep span cannot bridge the five-tick mask. The left-opening architecture
  // cannot be slowed into human compliance; a human-executable night 6 needs a
  // different route shape. If this check ever flips, that is a finding.
  ['hidpilot n6 human reject', ['hidpilottest.mjs', '200', '--night=6',
    '--device-sweep', '--pulse-light', '--sweep-slot-ms=350',
    '--mask-margin-ms=900', '--read-latency-ms=480', '--pilot-offset-ms=167',
    '--assert-rejected']],
  // The shipped device target: 120 ms spacing (measured on the phone), the
  // pessimistic 480 ms lit-frame latch, and the centre of the 83-267 ms
  // scheduler-phase window. Both the offset and the latch are explicit so the
  // two device dependencies cannot drift out of the contract silently.
  ['hidpilot n6 target', ['hidpilottest.mjs', '500', '--night=6',
    '--device-sweep', '--pulse-light', '--sweep-slot-ms=120',
    '--mask-margin-ms=900', '--read-latency-ms=480', '--pilot-offset-ms=167',
    '--assert']],
  ['hidpilot n6 target worst', ['hidpilottest.mjs', '200', '--night=6',
    '--device-sweep', '--pulse-light', '--sweep-slot-ms=120',
    '--mask-margin-ms=900', '--read-latency-ms=480', '--pilot-offset-ms=167',
    '--worst', '--assert']],
  // Just past the window's upper edge (83-267 ms), so the window is a
  // measurement and not a hope. Below the edge survival is a 1-in-400
  // straggler rather than a clean zero, which is why this control sits above.
  ['hidpilot n6 off-phase', ['hidpilottest.mjs', '200', '--night=6',
    '--device-sweep', '--pulse-light', '--sweep-slot-ms=120',
    '--mask-margin-ms=900', '--read-latency-ms=480', '--pilot-offset-ms=300',
    '--assert-rejected']],
  // Perfect sourced events only: this guards the visual policy upper bound,
  // while plan 08's forced-miss report explicitly rejects promotion as-is.
  ['hidpilot vocal bound', ['hidpilottest.mjs', '200', '--night=7', '--vocal-cam5', '--assert']],
  // The bang-armed policy, and the property that makes it worth having: the
  // CAM 05 read re-syncs the count, so false positives are absorbed. Guard
  // both, because the false-tolerance is the whole argument for it over the
  // counted-vocal policy plan 08 rejected.
  ['hidpilot bang', ['hidpilottest.mjs', '200', '--night=7', '--bang-cam5', '--assert']],
  ['hidpilot bang false', ['hidpilottest.mjs', '200', '--night=7', '--bang-cam5',
    '--false-bang=2', '--assert']],
  // The cue detector's front end, on synthesised signals: the reference
  // samples are game content and live outside the repository.
  // The sweep probe is a device action, but its report stream is not: the
  // trap-2 contact discipline and the pulsed light are checked without a phone.
  ['hid sweep probe', ['device/test-hid-sweep-probe.mjs']],
  // The device pilot's cycle recipes and their budgets: contact lengths above
  // the phone's floor, camera spacing it has actually landed, a hall flash per
  // cycle, wind above break-even, the flashlight inside night 6's 3000 frames,
  // and the monitor/mask polarity invariants.
  ['recipe', ['device/test-recipe.mjs']],
  // The runner's sweep primitives must be wall-timed. A hid_delay inside them
  // elapses in the hid process instead of adding to the shell's wait, which
  // silently shortened the camera spacing below what the phone accepts.
  ['hid walltime', ['device/test-hid-walltime.mjs']],
  // The microroutine oracle: the runner can record every report it sends, and
  // this audits that artifact for contact length, released time between two
  // buttons, and the trap-2 release discipline. Its self-test runs here; point
  // it at a captured trace to audit a real run.
  ['hid trace', ['device/test-hid-trace.mjs']],
  // The other half of that oracle: the trace says what the phone was sent, and
  // this says whether the game acted on it. A monitor press the port drops
  // inverts every later cycle silently, so the run keeps producing schedule
  // output that reads like a working night. Self-test only here; point the
  // tool at a run name to grade one.
  ['desync scan', ['device/desync-scan.py', '--self-test']],
  // The runner must schedule the plan the simulator emits. The table lived in
  // two places and a fix to one silently missed the other.
  ['runner plan', ['device/test-runner-plan.mjs']],
  // The engine cannot price an input the port refuses, so the plan is checked
  // against the phone's measured input-acceptance gaps separately.
  ['device input gaps', ['device/test-device-input-gaps.mjs']],
  // The measured actuator as a simulator layer -- launch lateness and the
  // mask-seam monitor drop. This gates that the model reproduces the desync
  // census's band rates, keeps hold lengths, and replays under a seed.
  ['device actuator', ['device/test-actuator.mjs']],
  // The pilot may not deliver inhumanly timed inputs (2026-08-25, absolute,
  // no override). The gate audits plan files pre-flight and the runner's
  // press primitives live; these two checks pin the floor's copies equal,
  // verify both layers against mocks, and assert the shipped 120 ms Night 6
  // plan is REFUSED -- the grounding is a recorded fact until a
  // human-executable route ships.
  ['human gate', ['device/test-human-gate.mjs']],
  ['human floor', ['device/test-human-floor.sh']],
  // The interpreter is the only part of the runner that decides *what*
  // happens. This runs the shipped functions against the real plan with the
  // device primitives stubbed, so a branch window off by one fails here
  // instead of on the phone.
  ['plan interpreter', ['device/test-plan-interpreter.sh']],
  // The cue-trace loop's kill switch must be a file the loop never writes:
  // the first form resurrected itself past cleanup's rm and orphaned ~14 Hz
  // stale-token loops that stalled 1-3% of live cue reads for ~1 s each.
  ['cue trace loop', ['device/test-cue-trace-loop.sh']],
  // The trainer's per-step lateness census -- the raw material for a future
  // HumanActuator's measured bands (plans/04). Checks the Coach's trace rows
  // against known lateness and the /save-trace endpoint against a temp dir,
  // no browser involved.
  ['trainer trace', ['tracetest.mjs']],
  ['camtrace', ['device/test-camtrace.py']],
  ['cuetest', ['cue/test-cue.py']],
];
const BROWSER = [
  ['browsertest', ['browsertest.mjs']],
  ['caltest', ['caltest.mjs']],
  ['lightcheck', ['lightcheck.mjs']],
  ['phasetest', ['phasetest.mjs']],
  ['lessontest', ['lessontest.mjs']],
];
const REPORTS = [
  ['minus2test', ['minus2test.mjs']],
  ['minus6test', ['minus6test.mjs']],
  ['rvctest', ['rvctest.mjs', '200']],
  ['androidstalltest', ['androidstalltest.mjs']],
  // The blind schedule, still unjudged: it is what the phone runs today, and
  // it fails the assertion above by construction (200/200 BB->Foxy).
  ['pilottest blind', ['pilottest.mjs']],
  // ...and on the night the device actually selects, where the same schedule
  // reaches about 118 s instead of 48 s and still loses.
  ['pilottest 6th night', ['pilottest.mjs', '200', '--night=6', '--vent', '--sync']],
  // The same night through the measured actuator (launch lateness plus the
  // mask-seam drop). A report, not a check: survival under the model is still
  // a statement about the model.
  ['pilottest device actuator', ['pilottest.mjs', '200', '--night=6', '--vent',
    '--sync', '--device-actuator']],
  // The shipped n6 target under the same actuator. The death mix is the
  // forcedown parity cascade the device recovery loop exists for -- this
  // pilot has no recovery, so read it as the price of open-loop monitor
  // toggling at measured lateness, not as a verdict on the live runner.
  ['hidpilot n6 target actuator', ['hidpilottest.mjs', '200', '--night=6',
    '--device-sweep', '--pulse-light', '--sweep-slot-ms=120',
    '--mask-margin-ms=900', '--read-latency-ms=480', '--pilot-offset-ms=167',
    '--device-actuator']],
  // The measured human bands, from whatever trainer runs have been recorded.
  // Empty until practice sessions accumulate under /save-trace.
  ['tracereport', ['tracereport.mjs']],
];

const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;

function runTool(argv) {
  return new Promise((resolve) => {
    const started = Date.now();
    // Most checks are node; the cue front end is stdlib Python, like the rest
    // of the device tooling, so dispatch on the extension.
    const runner = argv[0].endsWith('.py') ? 'python3'
      : argv[0].endsWith('.sh') ? 'bash' : process.execPath;
    const child = spawn(runner, [join(TOOLS, argv[0]), ...argv.slice(1)],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('close', code => resolve({ code, out, ms: Date.now() - started }));
  });
}

// Checks report as they land, because the browser group runs for minutes and a
// silent terminal is indistinguishable from a hung one. The verdict block that
// follows is in list order, so a run stays diffable against the last one.
async function runGroup(group, judge, { progress = false, concurrent = true } = {}) {
  const one = async ([name, argv]) => {
    const r = await runTool(argv);
    if (progress) process.stderr.write(`    ... ${name} finished in ${secs(r.ms)}\n`);
    return r;
  };
  let results;
  if (concurrent) {
    results = await Promise.all(group.map(one));
  } else {
    results = [];
    for (const entry of group) results.push(await one(entry));
  }
  let failed = 0;
  group.forEach(([name], i) => {
    const r = results[i];
    const bad = judge && r.code !== 0;
    if (bad) failed++;
    console.log(`  ${(judge ? (bad ? 'FAIL' : 'pass') : '----').padEnd(4)}  ${name.padEnd(16)} ${secs(r.ms).padStart(7)}`);
    if (bad || !judge) console.log(r.out.trimEnd().split('\n').map(l => `        ${l}`).join('\n'));
  });
  return failed;
}

// The browser checks load the built single-file page, so a stale dist/ would
// test the last build rather than the working tree.
function build() {
  return new Promise((resolve, reject) => {
    spawn('python3', [join(TOOLS, 'build.py')], { cwd: ROOT, stdio: 'ignore' })
      .on('close', c => c === 0 ? resolve() : reject(new Error(`build.py exited ${c}`)));
  });
}

const reachable = async () => {
  try { return (await fetch(PAGE)).ok; } catch { return false; }
};

async function serve() {
  if (await reachable()) return null;   // the user already has one running
  const child = spawn('python3', [join(TOOLS, 'serve.py'), String(PORT)],
    { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    if (await reachable()) return child;
    await new Promise(r => setTimeout(r, 250));
  }
  child.kill();
  throw new Error(`tools/serve.py never answered on ${PORT}`);
}

const only = process.argv.includes('--engine') ? 'engine'
  : process.argv.includes('--browser') ? 'browser' : 'all';
let failed = 0;

if (only !== 'browser') {
  console.log('engine checks');
  failed += await runGroup(ENGINE, true);
}

if (only !== 'engine') {
  console.log('browser checks');
  if (!chromeAvailable()) {
    console.log(`  SKIP  no Chrome at ${chromeBinary()} -- set $CHROME to override`);
  } else {
    await build();
    const server = await serve();
    try {
      failed += await runGroup(BROWSER, true,
        { progress: true, concurrent: process.argv.includes('--parallel') });
    }
    finally { server?.kill(); }
  }
}

if (process.argv.includes('--reports')) {
  console.log('reports (no pass/fail -- read the numbers)');
  await runGroup(REPORTS, false, {});
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exitCode = failed ? 1 : 0;
