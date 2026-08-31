// The single entry point for the suite.
//
//   node tools/test.mjs             # every check that can run here
//   node tools/test.mjs --engine    # fast headless checks for edit feedback
//   node tools/test.mjs --engine --extended # include exhaustive model sweeps
//   node tools/test.mjs --browser   # Chrome checks only (minutes)
//   node tools/test.mjs --reports   # also print the diagnostic tools
//   node tools/test.mjs --parallel  # run the browser checks at once (see below)
//
// Two kinds of tool live in tools/, and the split matters: CHECKS assert and
// exit non-zero, so a runner can give a verdict on them. REPORTS print numbers
// for a human to read and always exit 0 -- running them under a PASS heading
// would be a lie, so they are opt-in and unjudged.
//
// The engine checks run concurrently. A few exhaustive model sweeps live in
// the extended tier: they are valuable CI gates, but re-running thousands of
// full simulated nights after every edit makes the normal feedback loop drag.
// The browser checks do NOT, by default:
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
  // Plan 18 package 3: JavaScript/Python statistical primitives agree on
  // Wilson intervals, planning-N, two-proportion tests and fail-closed bars.
  ['stat helper', ['test-stat.mjs']],
  // Plan 02's reopened Android route: the sourced split-camera state must arm,
  // the published 10 s Minus Toys loop must clear both normal and pinned
  // worst-luck seeds, and the same loop without the split must fail.
  ['minus toys', ['minustoystest.mjs', '200', '--assert']],
  ['minus toys worst', ['minustoystest.mjs', '100', '--worst', '--assert']],
  ['minus toys no-split', ['minustoystest.mjs', '200', '--no-split', '--assert']],
  ['simtest', ['simtest.mjs', '--sweep']],
  ['hidreporttest', ['hidreporttest.mjs']],
  // Plan 19 pkg 1: the stock-device observation model (OBSERVED/UNKNOWN facts,
  // sensor cadence + latency + drops) and the blackout-reactive controller
  // (animation-window guard, lower-mask-verify-raise, graceful under a noisy
  // observer).
  ['reactivetest', ['reactivetest.mjs', '--assert']],
  // Plan 19/21 BB vent policy: this is deliberately a release gate. Its
  // measured policy regressions must fail -- they are not printable
  // known-negatives that allow --assert to pass.
  ['vent reactive', ['ventreacttest.mjs', '--assert']],
  // Mangle audio-static contexts and the named five-tick mask response;
  // kept separate from the BB gate so the two audio channels cannot cross.
  ['mangle reactive', ['mangletest.mjs', '--assert']],
  // Plan 21 phase-clock foundation: paired A2DP latency calibration, 2 Hz
  // period/phase lock, explicit 500 ms parity, and stale/low-confidence
  // recovery. No privileged engine phase is used here.
  ['phase clock', ['phaseclocktest.mjs']],
  // Plan 20 package 6 foundation: bounded fact messages, ordered receipt and
  // gap/stale reporting, plus a local drain that can finish an already-
  // approved cycle without inventing actions after the host link drops.
  ['fact link', ['factlinktest.mjs']],
  // Plan 20 package 1: unknown-safe, calibration-bound facts and explicit
  // action verification in a deterministic replayable belief contract.
  ['belief state', ['belieftest.mjs']],
  // Plan 20 package 2: controller-visible reduced transition model agrees with
  // seeded Sim control/resource traces; hidden routes remain risk buckets.
  ['reduced model', ['reducedmodeltest.mjs']],
  // Plan 20 package 3: delayed facts retain event time, UNKNOWN never clears
  // risk, stale controls require verification, and contradictions fail safe.
  ['estimator', ['estimatortest.mjs']],
  // Plan 20 package 4: reviewed cycle data, reduced-model locks, device
  // contact floors, and mandatory exact-engine proof callback.
  ['cycle library', ['cycletest.mjs']],
  // Plan 20 package 5 foundation: worst-case (not average) selection across
  // plausible reduced states with readable rejection records.
  ['cycle planner', ['plannertest.mjs']],
  // Plan 20 package 5: exact-engine blackout controls compare fixed open-loop,
  // truth-state oracle, disabled observations, and the estimator controller.
  ['cycle controller', ['cyclecontrollertest.mjs']],
  // Plan 21 package 1: the current Minimal Minus Toys headers are represented
  // once as finite policy IR and round-trip with a canonical hash.
  ['policy IR', ['device/test-policy-ir.mjs']],
  // Plan 21 package 2 foundation: compile the finite IR into semantic press /
  // release events, including repeat and terminal phases.
  ['policy interpreter', ['device/test-policy-interpreter.mjs']],
  // Plan 21 package 3: finite phase/action grammar, engine-shaped ordering
  // checks, and duplicate-family classification.
  ['policy grammar', ['policygrammartest.mjs']],
  // Plan 21 package 5: IR, device-plan text, and mocked phone trace stay
  // equivalent, including arm timing, repeat cadence, and terminal tail.
  ['policy equivalence', ['policyequivalencetest.mjs']],
  // Plan 21 package 4: explicit structural mutations run through grammar,
  // device-equivalence, exact-engine, and provenance/Pareto gates.
  ['policy search', ['policysearchtest.mjs']],
  // Plan 21 package 6: canonical policy artifact, compiled-plan hash binding,
  // runner wiring, and the opt-in post-run analysis boundary.
  ['policy artifact', ['policyartifacttest.mjs']],
  // Plan 16 pkg 1/3 gates: Sim.snapshot()/restore() bit-identity, the semantic
  // action layer, and the parameter search harness reproducing the 803feb3
  // ladder on a zero perturbation.
  ['minus7 search', ['minus7/test-search.mjs']],
  ['bbtest', ['bbtest.mjs', '200', '--assert']],
  ['bbtest --worst', ['bbtest.mjs', '100', '--worst', '--assert']],
  // The human-slack budget, measured 2026-08-25: reactive Minus 7 holds
  // 200/200 at +/-60 ms uniform per-input error, 89/200 at +/-100, 0/200 at
  // +/-150. The strategy's human-executability rests on this margin (and on
  // human error correlating rather than being iid -- plans/04), so hold the
  // floor of the bracket. If this flips, the human-viability picture changed.
  ['bbtest jitter 60', ['bbtest.mjs', '200', '--jitter=60', '--assert']],
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
  // The policy target: 120 ms model slots, the pessimistic 480 ms lit-frame
  // latch, and the centre of the 83-267 ms scheduler-phase window. The device
  // emitter widens those slots to 133 ms by moving the sweep start earlier and
  // preserving its end; recipe replay and the human gate cover that actuator.
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
  // Joins the emitted plan and the phone on one clock: per-anchor residual
  // (planned vs delivered), whether it re-anchors or compounds, and the
  // intra-macro sweep spacing against what the plan emitted. The number the
  // perfect-experiment run (plans/17) reads. Self-test only here.
  ['drift trace', ['device/test-drifttrace.mjs']],
  // The other half of that oracle: the trace says what the phone was sent, and
  // this says whether the game acted on it. A monitor press the port drops
  // inverts every later cycle silently, so the run keeps producing schedule
  // output that reads like a working night. Self-test only here; point the
  // tool at a run name to grade one.
  ['desync scan', ['device/desync-scan.py', '--self-test']],
  // The runner must schedule the plan the simulator emits. The table lived in
  // two places and a fix to one silently missed the other.
  ['runner plan', ['device/test-runner-plan.mjs']],
  // The Minus Toys device plan (plan 02 pkg 2a, device half): the ported
  // glitch loop still clears nights 2 and 7 in the exact model with the split
  // armed, the no-split control still loses, and every instruction kind and
  // control it emits is one the on-phone interpreter implements.
  ['minus toys plan', ['device/test-minus-toys-plan.mjs']],
  // The --minimal arm verifier's fixtures: lit/unlit from the 2026-08-29 r2/r3
  // recordings, plus the office and menu never-lit controls. Pins the crop
  // fractions, the thresholds and the rotation convention the live verify in
  // trial.sh leans on to re-arm or abort.
  ['cam11lit fixtures', ['device/test-cam11lit.sh']],
  // The per-instruction timing margin map for that plan: how far each press can
  // move before a seed dies. Pins the two facts the 2026-08-28 device-run
  // writeup rests on -- the split-arming pair has ~one Fusion poll of slack, and
  // the whole-schedule phase tolerance (33/99 ms) is far under the 302 ms epoch
  // bracket the run reported.
  ['minus toys margin', ['device/test-minus-toys-margin.mjs']],
  // The robustness objective: replays the loop through a calibrated model of
  // the first device run's clock error (epoch bracket, game-vs-wall drift,
  // per-press jitter) with an optional per-hour AM re-anchor. A search fitness
  // function -- the deterministic gate's 200/200 has ~66 ms of phase tolerance
  // behind it.
  ['minus toys jitter', ['device/test-minus-toys-jitter.mjs']],
  // The engine cannot price an input the port refuses, so the plan is checked
  // against the phone's measured input-acceptance gaps separately.
  ['device input gaps', ['device/test-device-input-gaps.mjs']],
  // The measured actuator as a simulator layer -- launch lateness and the
  // mask-seam monitor drop. This gates that the model reproduces the desync
  // census's band rates, keeps hold lengths, and replays under a seed.
  ['device actuator', ['device/test-actuator.mjs']],
  // Nothing reaches the phone unless locally proven (2026-08-25, absolute,
  // no override). The model gate replays the plan through the engine under
  // measured human slack before the runner's first adb command, and refuses
  // old inline-schedule modes are no longer selectable; the live press floor
  // stays as the backstop for recovery actions outside the artifact. These
  // checks verify both layers against mocks, exercise the sole runner path
  // with a fake adb, and assert the shipped Night 6 plan PASSES (648/1200 with
  // the sourced Fusion LCG and measured-safe maskraise compound).
  ['human gate', ['device/test-human-gate.mjs']],
  // The gate counts the deaths and prints its top four; on Night 2 that cut
  // says "Foxy, mostly" when Foxy is 58% and the office is 42%. deathchart.mjs
  // charts the whole census by the engine's own kill() reasons. This pins the
  // part that can go wrong silently: a new engine death cause with no slice,
  // and slices ordered by count rather than by character (which would repaint
  // Foxy between two panels meant to be compared).
  ['deathchart', ['device/test-deathchart.mjs']],
  // Plan 13 package 3 foundation: a labelled, nearest-centroid visual Foxy
  // cause envelope can add attribution after the last office segment, but it
  // is hard-bound to shadow mode and cannot replace lifecycle authority.
  ['death cause', ['device/test-death-cause.py']],
  // The external audio recorder must expose a fail-closed, phone-free route
  // preflight before it can create an output directory or stop monitoring.
  ['BT audio route', ['cue/test-capture-bt-audio.sh']],
  // The external authority owns rendered audio and publishes the same bounded
  // fact contract regardless of whether its receiver is BlueALSA or an ESP32.
  ['audio authority', ['cue/test-audio-authority.py']],
  ['ESP32 audio authority', ['cue/test-esp32-audio-authority.py']],
  ['human floor', ['device/test-human-floor.sh']],
  ['provision-cue-model', ['device/test-provision-cue-model.sh']],
  // The campaign can request any story night, so every story night must build,
  // replay and receive a verdict priced against ITS OWN AI table. Nights 1 and
  // 3 used to crash the builder on one shared message that covered two
  // opposite facts -- Balloon Boy is impossible on 1 and merely rare on 3.
  ['night matrix', ['device/test-night-matrix.mjs']],
  // The interpreter is the only part of the runner that decides *what*
  // happens. This runs the shipped functions against the real plan with the
  // device primitives stubbed, so a branch window off by one fails here
  // instead of on the phone.
  ['plan interpreter', ['device/test-plan-interpreter.sh']],
  // Nothing is pressed on the title screen that was not seen there, and New
  // Game -- which erases a save that cannot be restored -- needs a capability
  // the caller sets for one run. The structural half proves no second title
  // table exists to route around this.
  ['menu selector', ['device/test-menu.sh']],
  // plans/10 package 0: an interaction must be distinguishable from a dropped
  // contact and from a pan. Two nights were lost to a finger that missed a
  // light hitbox and landed in the pan band, and nothing in the run noticed.
  ['interaction classifier', ['device/test-region-classify.py']],
  // The alive/dead authority, and the regression that made it one: the New Game
  // newspaper cutscene read as `night` because it is bright everywhere, and no
  // route had ever pressed New Game so the gap had never been reachable.
  ['screenstate', ['device/test-screenstate.py']],
  // Plan 13 package 3: a generic intro-card label needs all four measured
  // signals. It must reject the brighter pre-card cutscene, fade, office and
  // 6 AM, and must never turn "an intro exists" into a guessed night number.
  ['intro card', ['device/test-intro-card.py']],
  // plans/15: a classifier reads the capture method it was calibrated for and
  // refuses the rest. Resizing a foreign frame to fit is what makes a sensor
  // mismatch look like a working reading.
  ['sensor', ['device/test-sensor.py']],
  // Plan 19 P3: derive a native-resolution watch adapter from labelled frames;
  // weak separation is an explicit refusal and foreign geometry is not resized.
  ['watch calibration', ['device/test-watch-calibrate.py']],
  // The cue-trace loop's kill switch must be a file the loop never writes:
  // the first form resurrected itself past cleanup's rm and orphaned ~14 Hz
  // stale-token loops that stalled 1-3% of live cue reads for ~1 s each.
  ['cue trace loop', ['device/test-cue-trace-loop.sh']],
  // The trainer's per-step lateness census -- the raw material for a future
  // HumanActuator's measured bands (plans/04). Checks the Coach's trace rows
  // against known lateness and the /save-trace endpoint against a temp dir,
  // no browser involved.
  ['trainer trace', ['tracetest.mjs']],
  // Plan 11's exact-engine policy adapter and the independently reimplemented
  // Jason/Shooter25/Couraeel baselines, with their controls: a null policy, a
  // wind-only policy, an inverted ladder and a flash-deleted Minus 7 must all
  // score zero on Night 7, and Night 1 -- whose AI table cannot arm Balloon Boy
  // -- is the positive control every family must clear.
  ['policytest', ['policytest.mjs', '--assert']],
  ['camtrace', ['device/test-camtrace.py']],
  // Plan 09's read-only corpus index: classify existing artifacts without
  // rewriting them, preserve basename joins, and surface unknown/empty files.
  // The dump's frame instance list, and the trap that comes with it: frame
  // instance handles are NOT XOR-28 scrambled while event handles are, so the
  // same integer names two different objects depending on line type. Name
  // plausibility cannot separate the readings; the item table's TYPE column
  // does, 914/914 against a coin flip.
  ['dump instances', ['dump/test-instances.py']],
  // Unwired since it was written; the AI table is what every survival figure
  // in this repository is computed against.
  ['aimap', ['dump/test-aimap.py']],
  ['observation index', ['device/test-index-observations.py']],
  // elegance.py's SERVES table, which has been wrong four times in the same
  // way -- one multi-purpose route action attributed to one animatronic, and
  // then graded as pure waste on the night that animatronic sits out. The pins
  // are on the table and on the compound-macro split, not on a headline figure.
  ['elegance', ['device/test-elegance.py']],
  // Plan 09's v1 session contract: the manifest/event schemas, and the proof
  // that each way of being malformed fails with its own reason rather than one
  // generic rejection. A validator that refuses everything identically is
  // indistinguishable from one that refuses everything.
  ['session contract', ['device/test-validate-session.py']],
  // Plan 09 package 2's producer half: one session id threaded through the
  // runners, hashes rather than filenames, and a manifest on every exit path.
  // Mock adb, synthetic artifacts, no phone.
  ['session producer', ['device/test-session-manifest.sh']],
  // A 420-second night must not be represented by screenrecord's legacy
  // 180-second default, and an abort must not suppress the grader that explains
  // it. The runner negotiates unlimited mode from captured device help and
  // fails closed on old recorders rather than stitching over evidence gaps.
  ['screenrecord capability', ['device/test-screenrecord-capability.sh']],
  // The cue helper's detector, compiled and exercised on the host. CueDetector
  // imports nothing from android.*, so this needs no phone and no Android SDK
  // -- only a JDK, which test.sh probes for and fails loudly without.
  //
  // It is here because it was the one check that actually exercises the live
  // detector and it ran nowhere: not in this suite, not in ci.yml. The mock-ADB
  // regressions around it drive `query-cue-helper.sh` against fixtures that
  // FABRICATE the detector's answers, so before this entry the detector's own
  // fail-closed behaviour -- shadow evidence cannot arm control, silence is
  // UNKNOWN, an unsupported rate refuses -- was asserted by nothing that ran.
  ['cue detector (java)', ['../android/cue-helper/test.sh']],
  // The device driver is assembled from named parts and piped to the phone.
  // `sh` executes a script before it has read all of it, so a truncated or
  // misordered driver does not fail at launch -- it presses real buttons and
  // dies mid-night. This gates the assembly instead.
  ['trial assembly', ['device/test-trial-assembly.sh']],
  // Plan 19 P4: native watchlist observe-only wiring is explicit, while live
  // reactive action refuses until that evidence has promoted.
  ['trial reactive', ['device/test-trial-reactive.sh']],
  // One screen->raw transform written in shell, Python and JS, held to the
  // same answer over the real tap table. They disagreed on 24 of 39
  // coordinates: the probe measuring what the phone accepts was sending
  // coordinates the runner never sends, and the auditor deciding what the game
  // did was keyed to a third set. Shell cannot import JS, so a control test is
  // the answer -- the same shape as sourcetest.mjs's second Fusion LCG.
  ['screen map', ['device/test-screen-map.mjs']],
  // Plan 18 Package 5: parse source-side InputDispatcher evidence without a
  // phone or a trace-processor dependency in the normal checkout.
  ['input trace', ['device/test-inputtrace.py']],
  // Plan 18 Package 1 foundation: reproduce the three shell failures that
  // already cost recorded nights, without requiring a phone or shellcheck.
  ['shell footguns', ['device/test-shell-footguns.sh']],
  // Plan 18 Package 4: bounded dependency-free properties for Sim state,
  // event determinism, and sourced Night-1 reachability.
  ['engine properties', ['propertytest.mjs']],
  // The indexes are how a cold session finds anything, and nothing recomputed
  // them: TOOLS.md was missing 47 of 137 scripts including grade-run.sh, and
  // docs/README.md was missing HID-MULTITOUCH.md. Cheap, so it runs here
  // rather than being remembered.
  ['docs', ['test-docs.mjs']],
  // The pre-run refusal check. n1-full-1640 was launched with CUE_HELPER=0,
  // so its cue port was "-", the resync verification branch never executed,
  // and a later session read the failed recovery as evidence the luma
  // threshold was blind. It was not; nothing had run. A run's configuration
  // is not a detail to reconstruct afterwards.
  ['preflight', ['device/test-preflight.sh']],
  // The on-phone classifier's host-side checks: frame framing, model refusal
  // bands, and the streaming protocol. It ran NOWHERE before 2026-08-26 --
  // not here, not in ci.yml -- while four grade-run coverage exclusions named
  // it as the reason a script was not an instrument. A gate cited as
  // provenance that nothing executes is worse than no gate.
  ['screencheck', ['device/test-screencheck.py']],
  // Same story: the transport helper every device runner picks its phone
  // with, whose exclusion reads "gated by test-select-adb.sh".
  ['select-adb', ['device/test-select-adb.sh']],
  // The drawer itself: every tools/device script is either invoked by
  // grade-run.sh, a test- gate, or consciously excluded with a reason -- and
  // every test- gate is actually reachable from this list or from ci.yml.
  // The tearing-vs-flash discriminator. sweepcheck reported 68/75 sweeps
  // flashed on a night where it was reading camera-switch tearing: a
  // torn-and-unlit frame's whole-ROI mean is 173 against a clean-and-lit
  // frame's 111. Four reference frames pin all four states.
  ['sweepcheck discriminator', ['device/test-sweepcheck.py']],
  ['grade-run coverage', ['device/test-grade-run-coverage.mjs']],
  ['cuetest', ['cue/test-cue.py']],
  ['BB cue state', ['device/test-bb-cue-state.mjs']],
  ['cue shadow evaluator', ['cue/test-evaluate-shadow.py']],
  ['cue shadow window builder', ['cue/test-build-shadow-windows.py']],
  ['cue model promotion', ['cue/test-export-model.py']],
  ['latency experiment', ['cue/test-latency-experiment.py']],
  ['pilot supervisor', ['cue/test-pilot-supervisor.py']],
  ['audio fact bridge', ['cue/test-bridge-audio-authority.py']],
];

// These checks establish robustness margins and campaign-wide survival floors,
// rather than a local engine invariant. Keep them in the default full suite
// and CI, but let `--engine` remain a practical edit-time command.
const EXTENDED_ENGINE = new Set([
  'minus toys margin',
  'minus toys jitter',
  'night matrix',
]);
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
  // The shipped n6 target under the same actuator.
  //
  // Corrected 2026-08-26. This used to read "the price of open-loop monitor
  // toggling ... not a verdict on the live runner", on the strength of the
  // resyncing pilot surviving the same actuator better. That comparison
  // changed the ROUTE as well as the loop, and the same route with the resync
  // removed is equally tolerant. The live runner's loop was then modelled and
  // measured: it reclaims zero, at every lateness band, and so does a free,
  // instant, always-right, bidirectional one. The cliff is geometric -- camera
  // stalls lapse, occupants reach the opening, and 177/180 die to the 45-frame
  // office-defense fuse. Read this as the price of LATENESS, not of open loop.
  ['hidpilot n6 target actuator', ['hidpilottest.mjs', '200', '--night=6',
    '--device-sweep', '--pulse-light', '--sweep-slot-ms=120',
    '--mask-margin-ms=900', '--read-latency-ms=480', '--pilot-offset-ms=167',
    '--device-actuator']],
  // What the live runner's monitor loop reclaims against that, per night. The
  // answer is zero, and the controls are what make that worth printing: a
  // loop whose reads are always wrong HURTS, one that reads inside the flip
  // window causes the desyncs it looks for, and a free perfect one gains
  // nothing either.
  ['closed-loop reclaim', ['closedlooptest.mjs', '--runs=200']],
  // What a lateness reduction would be worth. Two controls before a table: the
  // zero row must reproduce the exact figure and the 110-300 ms row must
  // reproduce plans/12, so a drifted cell fails instead of being re-read. The
  // knee is the 2->3 frame boundary -- free to 41 ms, gone at 42.
  ['lateness sweep', ['latenesssweep.mjs', '--runs=200', '--assert']],
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
const extended = process.argv.includes('--extended') || only === 'all';
let failed = 0;

if (only !== 'browser') {
  const engine = extended ? ENGINE : ENGINE.filter(([name]) => !EXTENDED_ENGINE.has(name));
  console.log(extended ? 'engine checks (including extended model sweeps)' : 'engine checks');
  failed += await runGroup(engine, true);
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
