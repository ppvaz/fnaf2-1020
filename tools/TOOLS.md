# Tool index

Read this before adding a script. Search this page and `rg` the existing tools,
then extend the closest tool when possible. This is the canonical inventory of
maintained developer, simulator, browser, device, and source-dump tooling in
this repository.

Known false contracts, stale documentation, and worthwhile consolidation work
are tracked separately in
[`plans/07-tooling-consolidation.md`](../plans/07-tooling-consolidation.md). Check
that plan before creating shared infrastructure; this index describes what
exists now, not proposed replacements.

Two labels matter:

- **check** asserts an outcome and exits nonzero when it fails;
- **report** prints evidence for a person to interpret and is not a verdict.

Anything marked **device action** sends input to the connected Android device.
Confirm the device, focus, screen state, coordinates, and selected night before
running it. Captures and extracted game content are local evidence, not repo
assets.

## Quick chooser

| Need | Use this first |
|---|---|
| Run the maintained test suite | `node tools/test.mjs` |
| Check only simulator regressions | `node tools/test.mjs --engine` |
| Check the built page in Chrome | `node tools/test.mjs --browser` |
| See non-asserting policy diagnostics too | `node tools/test.mjs --reports` |
| Serve or make the self-contained trainer | `tools/serve.py`, `tools/build.py` |
| Test the canonical or BB-aware strategy | `tools/simtest.mjs`, `tools/bbtest.mjs` |
| Compare policy families under execution error | `tools/policytest.mjs` |
| Explore a strategy or cycle | `tools/cyclesearch.mjs`, `tools/strategysearch.mjs`, `tools/gatesearch.mjs` |
| Run a guarded phone trial | `tools/device/trial.sh`, `tools/device/trial-maskcamp.sh` |
| Analyze a recorded phone trial | `grade-minus7.py`, `camtrace.py`, `windpct.py`, `find-events.py` |
| Classify a screenshot entirely on-device | the `tools/device/screencheck` pipeline |
| Inspect the Android event-sheet dump | `tools/dump/readdump.py`, `tools/dump/coverage.py` |

Paths in the tables are relative to the repository root.

## Suite, build, and development entry points

| Tool | Kind | Purpose and interface |
|---|---|---|
| `tools/test.mjs` | check runner | Canonical entry point. `--engine`, `--browser`, and `--reports` select groups; `--parallel` opts into concurrent timing-sensitive browser checks. It builds `dist/` and starts the dev server when needed. |
| `tools/build.py` | build | Inlines the imported JS modules, CSS, and fonts into ignored `dist/index.html`. Source works without this build during development. |
| `tools/serve.py [port]` | dev server | Serves the repo, defaulting to port 8731. `POST /save-layout` validates a calibrated layout, rewrites `src/config.js`, and rebuilds, so that endpoint is intentionally mutating. `POST /save-trace` records a trainer run's per-step timing census under ignored `captures/traces/`, stamped with save time and commit (`FNAF_TRACE_DIR` overrides the directory for tests). |
| `tools/chrome.mjs` | internal module | Shared Chrome discovery and DevTools flags for browser tools. `$CHROME` overrides discovery; reuse this instead of adding another locator. |

| `tools/test-docs.mjs` | check | Keeps the two indexes honest: every relative markdown link resolves, every page under `docs/` is listed in `docs/README.md`, and every tool script has a **table entry** in this file -- a mention in prose is not an entry, which is what let this drift to 47 missing scripts and 5 missing pages. A link into gitignored output is a failure, not an exemption. |

## Simulator checks and reports

| Tool | Kind | Purpose and interface |
|---|---|---|
| `tools/sourcetest.mjs` | check | Direct assertions for sourced engine rules and reachable input states, keyed to event-sheet groups. Runs first in the engine suite so a wrong mechanism cannot hide behind unchanged population statistics. |
| `tools/simtest.mjs` | check | Canonical headless engine/mechanics regressions, plus the coach's per-step grading contract (a measured window may only tighten a lesson's tolerance, and must grade lopsidedly). `--sweep` also drives perfect Minus 7 over 200 seeds. |
| `tools/bbtest.mjs [n]` | report/check | BB-aware reactive Minus 7 bot and reusable worker task. Supports `--worst`, `--jitter=MS`, and `--assert`; only `--assert` turns the survival result into a failing check, and it also guards the step model (ids matching `CYCLE_SCRIPT`, and both per-step paths being identities when asked for nothing). As a worker task it additionally accepts `profile` (per-step error weights, see `PROFILES`) and `stepShift` (move one step by a fixed number of frames). |
| `tools/policy.mjs` | internal module | The plans/11 exact-engine policy adapter: one observation/action contract over `src/engine.js`'s `Sim`, with `truth`/`belief` observation modes, three execution-error shapes (`iid`, `correlated`, `common`), and an optional `tools/device/actuator.mjs` layer. It creates no second simulator and prices nothing; reuse it instead of adding another run loop. |
| `tools/policybaselines.mjs` | internal module | The policies compared through `policy.mjs`: the local Minus 7 control (literally `bbtest.mjs`'s `Bot`, driven through the adapter), Jason-, Shooter25- and Couraeel-style reimplementations from this repository's own reconstructions, and the five deliberate controls. Every guessed detail is marked `[GUESS]` in place. |
| `tools/policytest.mjs` | report/check | Prints the plans/11 comparison -- `--nights`, `--deaths`, `--slack`, `--actuator` -- and `--assert` is the regression: the adapter must reproduce `bbtest.mjs` night-for-night, zero error must be an identity in all three shapes, belief mode must not leak a truth-only field, all five controls must score zero on night 7, and the baselines must still clear night 1. `POLICY_RUNS` sets the seeds per cell. |
| `tools/androidstalltest.mjs` | report | Controlled comparison of sourced, legacy, no-stall, and gate-only Android camera-stall models. |
| `tools/minus2test.mjs [n]` | report | Android probe of the glitchless Minus Two policy family. Supports `--worst` and `--cams=3,5,6`-style camera sets. |
| `tools/minus6test.mjs [n]` | report | Android-model probe of a two-camera Minus 6 candidate that tolerates defended office encounters. Supports `--worst`. |
| `tools/rvctest.mjs [n]` | report | Diagnostic skeleton of the PC-origin RVC timer policy on the Android model. `--no-vent-stall` disables its free right-vent-light stall. |
| `tools/pilottest.mjs [n]` | legacy report/check | Replays the retired swipe-era phone schedule in the simulator for historical sweeps and actuator regressions. It is no longer a selectable device route. Options include `--vent`, `--sync`, `--evict`, `--late-flash`, `--cycles=N`, `--night=N`, and `--worst`; `--assert` guards the narrow BB→Foxy claim rather than full survival. `--device-actuator` prices the model through per-press launch lateness plus the mask seam. |
| `tools/phasesweep.mjs [n] [--sync]` | report | Retained negative search over every 200 ms pilot-cycle phase: delaying BB's latched final hop reduces but never eliminates office arrivals. |
| `tools/periodicsweep.mjs [n]` | report | Prices a blind full BB response every N cycles; it can exclude BB but loses earlier to the hall/office trade. |
| `tools/flicksweep.mjs [n]` | report | Prices removing the blind Golden Freddy mask flick, alone and with periodic BB responses. |
| `tools/tracetest.mjs` | check | Gates the trainer's per-step trace: the Coach's census rows against scripted lateness, `tracereport.mjs` banding math, and serve.py's `/save-trace` against a temporary directory. No browser or phone. |
| `tools/tracereport.mjs [dir]` | report | Bands the recorded trainer traces per step: lateness quantiles, wind-hold coverage, inter-press spacing, and provenance. Excludes webdriver and off-speed runs from the census. The measured replacement for plans/04's `[INFERRED]` human profile, once enough runs accumulate. |

The canonical runner judges only the explicit engine-check invocations in
`tools/test.mjs`, including the `--assert` forms of `bbtest` and `pilottest`.
Policy scripts remain reports when invoked without an assertion contract.

| `tools/latenesssweep.mjs` | report | What a reduction in actuator launch lateness would be worth, and where the knee is. Sweeps the measured 110-300 ms band through the exact engine; the knee sits at the 2->3 frame boundary. Its band is labelled "actuator.mjs default band" and is a second copy of it -- see `tools/device/device-constants.json`. |
| `tools/closedlooptest.mjs` | report | What the live runner's closed loop reclaims from the measured actuator. `hidpilottest --device-actuator` prices an **open-loop** monitor model (23/200 Night 1, 0/200 Nights 2-7); this adds the checkpoint read and verified recovery the live runner has and the pilots do not, so the gap between the two is the value of the recovery rather than a property of the phone. |

## Strategy search and worker infrastructure

| Tool | Kind | Purpose and interface |
|---|---|---|
| `tools/cyclesearch.mjs` | search/report | Hill-climbs timing variants around the shipped Minus 7 cycle. `--curve` prints only the baseline jitter curve; `--steps` prints the per-step tolerance window (what the model tolerates on each input on its own, no randomness) and takes `--order=10-4-7`; `--profile=NAME` scores against per-step human error weights instead of uniform jitter, which are `[INFERRED]` and make the result a sensitivity analysis rather than a measurement; `--knobs=hallHold=5,flashHold=3` overrides the shipped knobs, so a published variant curve stays reproducible and a search can resume from a winner; `--serial` disables worker parallelism. Note that the legacy `--jitter` model moves a light's press and release independently and so randomises flash length; prefer a profile when comparing cycles. |
| `tools/strategysearch.mjs` | search/report | Enumerates fixed camera-cover strategies over the modeled route graph. `--quick` is a smoke-sized search; `--serial` checks deterministic equivalence. Non-Minus-7 results are model claims. |
| `tools/gatesearch.mjs` | search/report | Searches short gate-aware, visible-state policies. Supports `--quick` and `--serial`; results retain the model's office-state caveats. |
| `tools/gatebot.mjs` | internal module | The reusable controller and worker task searched by `gatesearch`; do not point the pool at the CLI itself. |
| `tools/pool.mjs` | internal module | Process-wide persistent worker pool for pure simulated-night batches. Reuse it instead of creating another worker layer. |
| `tools/pool-worker.mjs` | internal module | Worker half of `pool.mjs`; keeps task modules imported between batches. |

## Browser checks

These use Node's built-in WebSocket and Chrome's DevTools Protocol, with no
Puppeteer dependency. Prefer `node tools/test.mjs --browser`; individual tools
accept a page URL when a focused run is useful.

| Tool | Kind | Purpose and interface |
|---|---|---|
| `tools/browsertest.mjs [url] [screenshot]` | check | General load/input smoke check; writes `/tmp/m7-report.png` by default. |
| `tools/caltest.mjs [url]` | check | Exercises drag-versus-press and layout saving. It snapshots and restores `src/config.js` because saving is a real write. |
| `tools/lessontest.mjs [url]` | check | Drives the lesson ladder with an in-page perfect player and checks gating, cues, streaks, and pass screens. It takes real lesson time; `--wind-only` is the focused held-input regression. |
| `tools/lightcheck.mjs [url]` | check | Verifies that office and camera lights swap with monitor state and remain independently calibratable. |
| `tools/phasetest.mjs [url]` | check | Drives the BB-focused Phase A and Phase B lessons and asserts their browser behavior. |

## Android device tools

### Coordinates, state, and active trials

| Tool | Kind | Purpose and interface |
|---|---|---|
| `tools/device/select-adb.sh` | sourced transport guard | Honors an explicit `ANDROID_SERIAL`; otherwise selects exactly one ready USB device, falling back to exactly one wireless device only when USB is absent. Ambiguous preferred transports fail before a trial starts. Direct-ADB shell entry points source it. |
| `tools/device/test-select-adb.sh` | check | Regression coverage for explicit selection, USB preference, wireless fallback, ambiguity, and missing-device failures. Uses a shell-local ADB mock and does not touch a real device. |
| `tools/device/soak-cue-helper.sh [samples] [interval-seconds] [output]` | device check/report | Read-only health and resource soak for an already-consented unified MediaProjection helper. Defaults to 41 samples one minute apart, fails on process restart, lost game focus, stale/stalled/fail-closed sensor status, or missing streams, and writes an ignored TSV with memory, geometry, freshness, and thermal evidence. It never launches or presses the game. |
| `tools/device/test-soak-cue-helper.sh` | check | Mock-ADB regression for cue-helper soak parsing and no-overwrite behavior; does not touch a real device. |
| `tools/device/query-cue-helper.sh [loopback\|forward\|record PRE POST [label]\|log\|watch\|grid\|latency\|model\|arm\|result]` | device check/report; **device action** for `record`, `log`, `model reload`, and `arm` | Focus-guarded one-shot query of the helper's authenticated snapshot socket. `loopback` (default) exchanges inside one device shell, modelling the on-device controller; `forward` reaches the abstract socket over an ephemeral `adb forward` it removes on exit. Only a bounded text snapshot returns, and a fail-closed snapshot is an error. Calibration plumbing, not a host-driven controller. `watch SECONDS [out]` polls the snapshot at ~11 Hz into a TSV of snapshotNs/seq/luma, which is the independent label channel for cue evidence. `latency [count]` times device-local snapshot reads against the device clock and reports p50/p95/p99/max beside a shell-only baseline. `record` is the one state-changing mode: it arms the helper's calibration ring, captures a PRE+POST second window, disarms it again, and pulls the WAV into ignored `captures/cue-helper/calibration/` without overwriting. It sends no input and never launches the game. **Cue-detector verbs (2026-08-26):** `model status\|reload` prints or re-reads the app-private `cue-model-v1.txt`, and reports `detector=UNAVAILABLE reason=model-missing` rather than a plausible state when there is none; `arm ID CUES MS [shadow\|control]` opens one bounded detection window (default `shadow`); `result ID` polls it and returns `PENDING`, `HIT`, `MISS`, or `UNKNOWN <reason>`. **The result is pulled, never pushed** — nothing fires at window close, so a window resolves only when polled or when the next audio chunk arrives, and plan 08 package 3's window-close-to-`MISS` leg cannot be measured against this shape. `control` is refused unless the installed model is labelled `evidence=heldout`, and no runner consumes any of these verbs: `trial.sh` sends only `GET`. |
| `tools/device/collect-cue-audio.sh [rounds] [seconds] [label]` | **device action** | Cold-starts short 6th Nights, mutes the opening call, and waits while Balloon Boy takes his route, with the helper logging audio throughout. Sends no other input; surviving is not the point. Writes a session-boundary TSV so a holdout can split by session rather than by adjacent windows. |
| `tools/device/test-query-cue-helper.sh` | check | Mock-ADB regression for helper PID/token discovery, focus gating, transport selection, and snapshot parsing. Serves a real local socket for the forward transport; does not touch a real device. |
| `tools/device/provision-cue-model.sh MODEL [--replace]` | **device action** | Installs one generated `cue-model-v1` file into the cue helper's app-private storage over `run-as`, then asks a running helper to reload it. The model goes straight to app-private storage so no game-derived template is left world-readable in `/data/local/tmp`, it is staged and hashed back over adb before an atomic `mv` so a short transport write cannot become a model, and an existing model is never replaced without `--replace`. It is a **provisioner, not a grader** — it has no run to read — which is why `test-grade-run-coverage.mjs` carries it in the exclusion list rather than wiring it into `grade-run.sh`. It has no mock-ADB regression yet, so its only exercise is a real phone. |
| `tools/device/coords.sh` | sourced config | Moto g56 5G, 2400x1080 landscape touch coordinates used by the trial scripts. Source it; do not execute it. Recalibrate before using another layout/device. |
| `tools/device/screenstate.py` | classifier | Reads an ADB PNG on stdin and prints `night`, `gameover`, or `other`. `--adb-fast [timeout]` transfers only sampled raw scanlines for watchdog polling. Requires Pillow in PNG mode. |
| `tools/device/clocktrace.mjs VIDEO` | analyzer | Measures the first office HUD and 1 AM transitions in a 1280x576 trial recording. `--expect-ms=70000 --tolerance-ms=N` turns the sourced 70-second hour edge into an assertion for device-epoch trials. |
| `tools/device/trial.sh [name] [cycles]` | **device action** | The sole device route: an emitted, model-gated Night 6 `hid-multi` plan with device epoch latch and clean left-opening classification enabled by default. It requires `BB_LEFT_MODEL`; use `captures/screencheck/bb-left/models/runtime-gh.scm`, whose latch window matches this loop. The old swipe table, `NIGHT6_LEFT` selector, and `HID_LEFT_SURVIVAL` sparse probe are retired as device modes; `pilottest.mjs` remains temporarily as a legacy research model. `CUE_AUDIO=1` (with `CUE_HELPER=1`) retains PCM, and `GRADE_RUN=1` grades both completed and aborted captures after their manifest is finalized. Capture duration is negotiated from `screenrecord --help`: short runs stay bounded, full nights use advertised unlimited `--time-limit 0`, and legacy 180-second-only devices fail before launch rather than emit incomplete evidence. The connected Moto g56's screenrecord v1.4 advertises unlimited mode; a 2026-08-26 device probe ran it for 3 seconds, finalized it with SIGINT, and produced a 688,958-byte 1280x576 MP4. **Run:** `BB_LEFT_MODEL=captures/screencheck/bb-left/models/runtime-gh.scm tools/device/trial.sh NAME 90`. |
| `tools/device/recipe.mjs` | generator/report | Emits the device pilot's opening/clear/attack cycle recipes **from the exact simulator**, with per-cycle budgets (light, wind against break-even, sweep span, camera spacing, shortest contact) and the nightly flashlight total. `--json` for the artifact, `--track` to render the same recipe in `CYCLE_SCRIPT`'s trainer shape. Monitor and mask events carry the state the engine reached, never an inferred toggle. |
| `tools/device/test-recipe.mjs` | check | Gates that recipe: contacts at or above the phone's 100 ms floor, camera spacing at or below the 120 ms it has landed, a hall flash per cycle, clear-cycle wind above break-even, the flashlight inside night 6's 3000 frames, and the monitor/mask polarity invariants. No device. |
| `tools/device/actuator.mjs` | internal module | The phone's measured failure modes as a simulator layer: launch lateness (110-300 ms, order-preserving queue, one draw per hold so flash lengths survive) and the mask-seam monitor drop at the desync census's band rates (5/7 under 140 ms, 4/8 at 140-180 ms, 0/17 at 180+). Draws come from its own seeded RNG so the game's roll stream is unmoved. The wind-overlap and vent-light drops are documented in its header as measured-but-unmodelled: no clean rate yet. |
| `tools/device/test-actuator.mjs` | check | Gates that model: holds keep their planned length, submission order is delivery order, the seam bands reproduce the census within tolerance and never drop at or past 180 ms, worst luck pins drops but not lateness, and a seed replays identically. No device. |
| `tools/device/test-runner-plan.mjs` | check | Gates that the runner *interprets* the plan rather than carrying a second copy: no schedule literals in the plan driver, the host pushes what `recipe.mjs --device-plan` emits, the branch windows line up with the plan's instructions, and the plan itself replays through the engine 300/300. No device. |
| `tools/device/human-gate.mjs plan.txt` | check | The model gate: replays the plan through the exact engine over 1200 named seeds with every row shifted by ±60 ms of human slack (the measured plans/04 bracket floor, until the trace census supersedes it with correlated bands) and refuses below the 40% replay contract. Compound actuator rows preserve their measured internal spacing. `trial.sh` runs it before its first adb command, and has no inline schedule fallback. Absolute, no override (2026-08-25). |
| `tools/device/test-human-gate.mjs` | check | Mock regression for the model gate plus the decision record: plan-text round-trip, bounded deterministic error injection, exact verdict thresholding, the repaired Night 6 plan passing (673/1200), and the sole runner path reaching only a mock adb after its gate. |
| `tools/device/test-human-floor.sh` | check | Mock regression for the runner's live floor: extracts the shipped press primitives, stubs the device and the clock, and asserts tight presses, tight holds, and inhuman sweeps abort with exit 44. No device. |
| `tools/device/test-plan-interpreter.sh` | check | Mock regression for the interpreter itself. Lifts `plan_control_xy`/`plan_first_offset`/`plan_step`/`run_cycle` out of the shipped runner, stubs the device primitives, and runs the real plan through them: opening, shared prefix, both branches, the epoch slip the wind absorbs, and refusal on an instruction or control it cannot execute. No device. |
| `tools/device/test-hid-trace.mjs [trace]` | check | Audits a recorded HID stream for contact length, released time between two different buttons, and the trap-2 release discipline. `HID_TRACE_RUN=1 tools/device/trial.sh ...` records `captures/NAME-hid.jsonl`; running the checker with no argument runs its self-test, which is what the suite executes. |
| `tools/device/test-hid-walltime.mjs` | check | Static gate on the runner's sweep primitives: the sweep may wall-time only its start, its per-camera hid time must total the 120 ms the phone has landed, and the classify path must leave a Fusion poll of released time before the mask press. |
| `tools/device/hid-sweep-probe.mjs [spacing ...]` | generator | Emits a `hid` report stream that selects CAM 10/04/07 at a chosen inter-selection spacing with the camera light **pulsed after each selection** rather than held across the sweep. Prints to stdout; touches no device. |
| `tools/device/hid-sweep-probe.sh [spacing ...]` | **device action** | Runs those sweeps on 6th Night and grades the recording with `camtrace.py`, to measure the phone's real spacing floor. Defaults to 240/200/160/120 ms. It defends nothing and the night is expected to end to W. Foxy after the sweeps, which is why they run first. Refuses to act on a locked device or without game focus. |
| `tools/device/test-screen-map.mjs` | check | Holds the screen->raw touch transform `rawX = (1080 - screenY) * 20 / 9` to one answer across all three languages that implement it -- the runner's shell arithmetic, `desync-scan.py`'s `//`, and `hid-sweep-probe.mjs`'s JS -- over the real `coords.sh` taps plus `desync-scan.py`'s camera table. They disagreed on 24 of 39 coordinates until 2026-08-26, including `cam11`, which the probe sweeps. **The runner is the authority**: it is what presses the phone, and it truncates. Shell cannot import JS, so this is a control rather than a shared module -- the same shape as `sourcetest.mjs`'s second Fusion LCG. |
| `tools/device/test-hid-sweep-probe.mjs` | check | No-device regression for that stream: both contacts released, one light pulse per selection, the requested spacing, and at most 300 ms of light per sweep. |
| `tools/device/hid-multitouch-smoke.json` | **device action/fixture** | Direct `/system/bin/hid FILE` replay that selects 6th Night, holds camera light as contact 0, and taps CAM 10/04/07 as independently released contact 1. Read `docs/device/HID-MULTITOUCH.md`; it is not focus-guarded by itself. |
| `tools/hidreporttest.mjs` | check | Parses the HID fixture and fails unless CAM 10/04/07 each receive a fresh contact-1 down/up while contact 0 stays on the light, with a final explicit two-contact release. Runs without a device. |
| `tools/hidpilottest.mjs [runs] [--night=6]` | report/check | Exact-simulator report for HID policy comparisons. `--sparse-left --night=7` is the idealized 267 ms upper bound; `--pilot-offset-ms=N` exposes its epoch dependency. `--device-sweep` substitutes the phone-proven 790 ms/240 ms-feed actuator and now also applies to the selected Night 6 left-opening route, and `--assert-rejected` requires zero survivors so the ideal result cannot be mistaken for a live route. `--pulse-light` pulses the camera light around each selection instead of holding contact 0 across the sweep, which is what makes the sweep affordable at all on night 6's 3000-frame flashlight; `--mask-margin-ms=N` sizes the BB mask's phase margin against a known T0 instead of spending a blind second. `--vocal-cam5` is plan 08's perfect-third-vocal upper bound; its error controls are `--drop-vocal=1..3` and `--vocal-false-count=1..3`. `--assert` requires complete survival with no missed BB state. Other diagnostic modes include `--cam5`, `--sparse-cam5`, `--always-threat`, and `--tick-aligned-mask`. `--bang-cam5` arms the CAM 05 read from the source bang and re-syncs its count on the read result; `--drop-bang=`/`--false-bang=` inject cue errors. `--device-actuator` prices the run through `tools/device/actuator.mjs` with one lateness draw per wall-timed beat (the branch macros floor off the read that happened, like `rm_floor`); `--press-late-ms=MIN,MAX` overrides the measured band. This pilot has no desync recovery loop, so its actuator numbers price open-loop monitor toggling, not the live runner. |
| `tools/device/trial-maskcamp.sh [name] [seconds] [night] [protocol]` | **device action** | Guarded mask-clear experiment. Protocol is `wind`, `nowind`, or `nowind-flash`; it cold-starts the game and records the trial. |
| `tools/device/run-batch.sh COUNT [night] [prefix] [protocol]` | **device action** | Runs repeated `trial-maskcamp` experiments and then reports visual events for each recording. |

| `tools/device/preflight.sh NIGHT` | check | One command that says whether a night **can** be run, and prints the invocation. Refuses when the helper is stopped, has no port or token, or sends no `grey=`. It launches nothing: the last step is a human reading the save cursor, which `trial.sh` keeps manual on purpose. It exists because `n1-full-1640` was launched with `CUE_HELPER=0`, so its cue port was `-`, the resync verification branch never executed, and a later session read the failed recovery as evidence that a luma threshold was blind. Nothing had run. |
| `tools/device/test-preflight.sh` | check | Mock-ADB gate for those refusals. No phone. |
| `tools/device/menu.sh` | sourced selector | The one title/menu selector. **Source it; do not re-derive it.** plans/13 keeps four facts apart that the runners used to collapse into a single `NIGHT` variable: which night is played, which title item is pressed, where the save cursor sits, and what the run is called. It gates on the Options row being lit before it believes a menu is up, because the "Start a new game?" confirmation reuses the same three rows and `TAP_6TH` on that dialog erases the save. |
| `tools/device/test-menu.sh` | check | Mock-ADB gate for the selector, with synthetic title frames. No phone. |
| `tools/device/title-observe.py` | classifier | Reports which title-screen items are visible, or why that is `unknown`. Refuses a model with no undecided band (`title-model-has-no-undecided-band`) -- the abstain check `build-screen-model.py` does not yet make. |
| `tools/device/sensor.py` | module | Which capture method a frame came from, and whether a model may read it. The declaration every classifier reads through, so a model built on `screencap` frames cannot be silently applied to helper frames. Gated by `test-sensor.py`. |
| `tools/device/test-sensor.py` | check | Synthetic-frame regression for that declaration. No phone. |
| `tools/device/session.sh` | sourced helper | Threads one session id and one OS-monotonic origin through every producer, so a helper started inside a run joins that run's manifest instead of opening its own. Sourced, never executed; `session-manifest.py` owns the file format. |
| `tools/device/session-manifest.py` | producer | Emits the v1 session manifest and ordered event stream for one device run -- every runner emits one on every exit path, including aborts. |
| `tools/device/validate-session.py` | check | Validates a v1 manifest and its event stream: shape, ordering, and hashes. It gates the manifest's **shape**, not whether its `env` block describes the run that produced it. |
| `tools/device/test-validate-session.py` | check | Synthetic contract for that validator, including that a validator which accepts everything is indistinguishable from one that refuses everything. |
| `tools/device/test-session-manifest.sh` | check | End-to-end gate for the producer through the real shell entry points (`fnaf_session_begin`, `probe_target`, `record`, `event`, `artifact`, `finalize`). Mock adb, synthetic artifacts, no phone. |
| `tools/device/test-screenrecord-capability.sh` | check | No-device regression for full-night capture negotiation and abort grading: a 420-second night must not be represented by screenrecord's legacy 180-second default, and an abort must not suppress the grader that explains it. |
| `tools/device/test-device-input-gaps.mjs` | check | The plan must respect the gaps the **phone** needs to accept an input. The simulator emits frames and has no concept of a refused input, so a plan can be 1000/1000 in the engine and un-runnable on the handset. |
| `tools/device/test-night-matrix.mjs` | check | Every night the campaign can request must build, replay, and receive a configuration-correct gate verdict. Whether a threat branch is reachable comes from the sourced AI table (`C.canAct`), never from whether one sampled seed showed it -- Night 1 cannot arm Balloon Boy at all, Night 3 merely makes him rare, and one `throw` used to conflate those. |
| `tools/device/gate-worker.mjs` | internal module | One worker's share of a model-gate sweep. A gated night is pure, so the gate's 1200 seeds and the matrix's six nights are embarrassingly parallel; this is what made 1200 seeds affordable at 4.7 s. Not a grader -- it has no run artifacts. |
| `tools/device/hid-raise-probe.mjs` | **device action** | Measures how long after a monitor **raise** this phone will accept a camera selection. `ON-DEVICE-VALIDATION.md` recorded 500 ms from observation ("shorter gaps were visibly swallowed by the flip"); this measures it rather than inheriting it. |
| `tools/device/pan-probe.sh` | **device action** | Measures the office pan on a connected phone. The pan was known only by accident until 2026-08-26 -- two nights were lost to a finger that missed a light hitbox on a panned office. A probe, not a grader. |
| `tools/device/pan-shift.py before.png after.png` | report | Horizontal displacement between two office frames, or `UNKNOWN`. The measuring stick for `pan-probe.sh`. |
| `tools/device/region-probe.sh` | **device action** | Maps what a touch **does**, by screen region -- plans/10 package 0's actuation/verification/precondition map. A probe, not a grader. |
| `tools/device/region-classify.py pre.png during.png post.png` | classifier | Classifies what one held touch did, from three office frames. The decision `region-probe.sh` records. |
| `tools/device/test-region-classify.py` | check | Synthetic-frame regression for that classifier. No phone. |
| `tools/device/watch-vent-cue.sh [seconds] [label]` | **device action** | Cold-starts a 6th Night, mutes the opening call, and sits while the helper logs audio, to catch Balloon Boy arriving at the vent. Sends no other input; surviving is not the point. |
| `tools/device/test-cue-trace-loop.sh` | check | Gate for the cue-trace loop's kill switch, which must be a file the loop never writes: the first form used one file as both sentinel and output, so cleanup's `rm` was resurrected by the loop's own appends. |

### The device driver (`tools/device/trial/`)

`trial.sh` runs on this machine; the **driver** runs on the phone. 1619 of the
runner's 2934 lines used to be one heredoc, which is why the file was 47% over
the working agreement's ceiling and why four tests reached into it with `awk`.
You cannot `source` into a heredoc -- the phone gets one stream of text on
stdin -- so the parts below are concatenated by `assemble.sh` and piped to
`adb shell sh -s`.

They are named for **what they do**, not for which layer they are: the strategy
is in `10-minus7-sweep.sh` and Balloon Boy is answered in
`08-bb-threat-response.sh`. Order is semantic, not decorative -- `sh` has no
forward declarations, and `01-arguments.sh` must be first because it consumes
the positionals with `shift`.

**The phone runs mksh, not POSIX `sh`.** The driver opens its HID coprocess
with `/system/bin/hid - |&`, a ksh/mksh operator that `dash` and bash 3.2 both
refuse -- so `sh -n` on a developer machine reports a syntax error in working
code.

| Tool | Kind | Purpose and interface |
|---|---|---|
| `tools/device/trial/assemble.sh` | build | Prints the complete device driver to stdout. `PARTS` is the authority on order and membership -- not a glob, which would order by accident and sweep in an editor backup. |
| `tools/device/test-trial-assembly.sh` | check | Gates the assembly: `trial.sh` sends exactly this and carries no second copy, the parts list matches what is on disk, the line count adds up, the driver parses under a ksh-family shell (or says `UNKNOWN` with the reason), and nothing calls a function defined later. The failure it prevents is quiet -- `sh` executes a script before reading all of it, so a truncated driver runs, presses real buttons, and dies mid-night. |
| `tools/device/trial/01-arguments.sh` | driver part | Everything the host tells the phone: positionals, calibrated geometry, globals. **Must be first.** |
| `tools/device/trial/02-hid-wire.sh` | driver part | The `/system/bin/hid` report stream: contacts, releases, and hid-side delay. |
| `tools/device/trial/03-clock.sh` | driver part | The device clock -- fork-free `/proc/uptime` reads and epoch arithmetic. |
| `tools/device/trial/04-session.sh` | driver part | Driver lifecycle: cleanup traps, the device epoch latch, and the start handshake. |
| `tools/device/trial/05-press.sh` | driver part | What a press *is*: wall-timed waits, the live `HUMAN_FLOOR_MS` backstop, taps and holds. |
| `tools/device/trial/06-cams-up-anchor.sh` | driver part | Is the monitor still up? The anchor a desync is detected against. |
| `tools/device/trial/07-light-and-capture.sh` | driver part | The lights, the camera sweeps, and taking a frame off the screen. |
| `tools/device/trial/08-bb-threat-response.sh` | driver part | Read the lit left opening and answer it with the mask -- the Balloon Boy branch, and the only reactive read on the route. |
| `tools/device/trial/09-constants.sh` | driver part | Device timing constants: the numbers the phone imposes, each named and sourced. |
| `tools/device/trial/10-minus7-sweep.sh` | driver part | **Minus 7 itself** -- the pulsed camera sweep, the hall reset, and the measured mask->monitor seam. |
| `tools/device/trial/11-plan-interpreter.sh` | driver part | Reads the emitted plan and turns its rows into presses. The only part that decides *what* happens. |
| `tools/device/trial/12-night-loop.sh` | driver part | Runs the cycles: macros, per-instruction stepping, and the branch decisions. |

### Recorded-trial analysis

**Start here.** `grade-run.sh` runs every instrument below against one run and
prints one verdict; the individual entries are for when you need one of them
alone. Quote the interval it reports, never wall clock -- nights 6-36 and 6-37
were published at 163 s and 153 s and graded at 26.0 s and 72.2 s.

| Tool | Kind | Purpose and interface |
|---|---|---|
| `tools/device/grade-run.sh RUN_NAME [--require-seconds N]` | check | **The one command to run before quoting any number off a device run.** Drives every instrument this repository owns against one run and prints a single verdict. It exists because the drawer was full of instruments and nothing ran them: `screenstate.py` could have refuted the 163 s claim from any frame of that recording and nobody invoked it. `RUN_NAME` is the `OUT` name the trial was launched with, e.g. `n6-night-39`. |
| `tools/device/test-grade-run-coverage.mjs` | check | The rule "do not add an instrument without adding it to `grade-run.sh`", enforced. Every script in `tools/device`, `tools/cue` and `tools/dump` must be invoked by the pipeline, be a gate that this suite or CI actually runs, or carry a written exclusion -- and any gate an exclusion **cites** must itself exist and run. Four exclusions once named gates that nothing executed. |
| `tools/device/grade-night.py VIDEO [--fps 4] [--require-seconds 420]` | check | **The only number that is a run length.** Reports the interval the office HUD was actually present, using the shared predicate. A HUD-absent stretch is the monitor, not a death -- the controller lives on the monitor 3.5 s of every 5 s cycle, and ending the run at the first gap graded a 418 s winning night at 6.5 s. Only the death static ends a run; `dark screen` is reported as ambiguous rather than decided. |
| `tools/device/nightpredicate.py` | module | The **one** definition of the alive/dead rule, in fractions of the frame with the caller supplying a sampler. Four callers evaluate it -- `screenstate.py`'s PNG and live `--adb-fast` paths, `grade-night.py`, and `death-census.py` -- so a 2400x1080 caller and a 1280x576 one run the same rule rather than two rules that agree by inspection. It existed in five hand copies; each drift began as a threshold typed into a second file, which `test-screenstate.py` now forbids. |
| `tools/device/test-screenstate.py` | check | Regression for that authority and the lifecycle refinement: all four callers must agree at both geometries, no other file may restate the rule, and the alive interval must survive monitor dwells. |
| `tools/device/lifecycle-observe.py` | classifier | Refines `screenstate.py`'s `other` into named screens (intro, 6 AM, static, newspaper, title, dialog, options). **Adds classes; never overrides the authority.** |
| `tools/device/intro_card.py` | module | Recognises a story-night intro card without guessing which night it names. Fractional and generic: it says `intro`, never an ordinal. |
| `tools/device/test-intro-card.py` | check | Gate for that decision, against synthetic fixtures and the retained real frames. |
| `tools/device/desync-scan.py RUN_NAME [--strips] [--all-intervals]` | check | **The only instrument that says what the game did**, as opposed to what the phone was sent. Aligns the HID trace against the recording and attributes each divergence. It refuses rather than inventing an offset: no monitor presses, no confident edges, zero matches, or an optimum on a search boundary all report `UNKNOWN` and exit 2 before walking or blaming anything. |
| `tools/device/sweepcheck.py VIDEO [--fps 60] [--expect 10,4,7]` | check | Did the sweep actually **flash** each camera, not merely select it? Measures brightness over textured rows only, so camera-switch tearing cannot read as a flash. |
| `tools/device/windtrace.mjs --night=N [--seeds=A..B]` | report | What fraction of the plan's wind frames the engine actually CREDITED. A wind counts only with the monitor up and CAM 11 selected; a plan can send every wind and land none. |
| `tools/device/test-sweepcheck.py` | check | Pins the tearing-vs-flash discriminator against four reference frames in `docs/img/tearing-vs-flash`. |
| `tools/device/run-timeline.py VIDEO` | report | Segments a recorded run into named phases and names how it ended. |
| `tools/device/elegance.py RUN_LOG --night N` | report | How many inputs the run sent against how many that night needed. Reports wasted work -- e.g. `hall 147 WASTED -- AI 0 this night` on Night 1, where neither Withered Foxy nor Withered Freddy can act. Its `SERVES` table has been wrong four times by naming one animatronic for a multi-purpose action; `tools/device/test-elegance.py` pins it. |
| `tools/device/test-elegance.py` | check | Pins `elegance.py`'s `SERVES` table -- what each label serves, that every class it names has ids the sourced AI table knows, and that a compound HID macro (`maskraise`, `hallraise`) is charged to each thing its contacts do rather than to one of them. No phone, no dump, no `recipe.mjs`. |
| `tools/device/keyframes.py VIDEO [--count 12] [--fps 2] [--out sheet.png]` | report | Pulls the most *different* frames out of a run and tiles them into one sheet. |
| `tools/device/death-census.py OUT_DIR` | report | What killed us, across every night on disk. **Read the times, not just the faces:** 19 Withered Foxy deaths look like the BB->Foxy chain, but they cluster at ~30 s, before Balloon Boy can reach the office at all -- so they are Foxy killing unflashed, which is what a monitor desync causes. A census of faces alone would have shipped the wrong cause. |
| `tools/device/grid-signature.py` | build | Turns labelled frames into a signature the cue helper can evaluate live. Derives its abstain band from the frames the model was built on, so it marks the result `PROVISIONAL` and prints `NOT VALIDATED`. |
| `tools/device/index-observations.py [root] [--json] [--hash] [--strict]` | report/check | Read-only Plan 09 inventory of retained capture paths, sizes, authority classes, artifact families, and basename joins. It never opens media content unless `--hash` is requested and never rewrites a capture. `--strict` fails on empty or unclassified artifacts; classification does not make an old artifact manifested or replayable. |
| `tools/device/test-index-observations.py` | check | Synthetic coverage for all current artifact families, join keys, optional hashes, strict-mode refusal, and the guarantee that indexing changes no file. |
| `tools/device/grade-minus7.py VIDEO` | report | Post-run office/mask/camera/hall interval grading for a recorded trial. Supports assertion options shown by `--help`; requires ffmpeg. |
| `tools/device/camtrace.py VIDEO` | report/check | Finds stable `10 -> 04 -> 07 -> 11` selected-camera sweeps. `--expected N` makes a missing-sweep result fail. `--fps`/`--min-ms` set the decode rate and the shortest run counted as a selection: **the 30 fps / 100 ms defaults cannot resolve a sweep faster than about 200 ms spacing** and will report its selections as dropped. screenrecord captures at 60 fps on this phone, so pass `--fps 60 --min-ms 50` for any short-sweep measurement. Requires ffmpeg. |
| `tools/device/test-camtrace.py` | check | Guards that resolution gate on synthetic sample runs; no video or device needed. |
| `tools/device/windpct.py [--samples] VIDEO` | report | Measures the CAM 11 music-box gauge in recordings; `--samples` includes roughly half-second samples. Requires ffmpeg. |
| `tools/device/find-events.py VIDEO` | report | Stdlib wrapper around ffmpeg frame differencing that locates sharp visual changes in mask-camp videos. |

### Device-local visual classification (`screencheck`)

This pipeline exists for time-sensitive BB, Golden Freddy, and Toy Bonnie
checks. The live path is `screencap | fnaf-screencheck classify MODEL` entirely
inside one `adb shell`; do not replace it with full-frame USB transfer or a new
host-side CV loop.

| Tool | Kind | Purpose and interface |
|---|---|---|
| `tools/device/screencheck.c` | internal source | Streaming raw RGBA classifier. Supports ROI `stats`, color `count`/`match`, and compact nearest-template `classify`; bounded model/grid/template storage keeps it tiny. |
| `tools/device/screencheck-start.S` | internal source | Freestanding AArch64 `_start` and syscall exit shim for the Android binary. |
| `tools/device/build-screencheck.sh [output]` | build | Cross-builds the static, libc-free AArch64 helper with Apple clang and Rust's bundled `ld.lld`. Default output is ignored `tools/device/fnaf-screencheck`. |
| `tools/device/test-screencheck.py` | check | Compiles the host form and tests raw/RGBA parsing, stats/count/match, model building/classification/rejection, and replay behavior with synthetic frames. |
| `tools/device/bench-screencheck.sh [samples] [model]` | device benchmark | Builds and installs the helper at `/data/local/tmp/fnaf-screencheck`, then reports capture, classification, and combined latency distributions. With no model it times full-frame stats. It does not press the game. |
| `tools/device/capture-screen-sample.sh VIEW LABEL NAME [hold-x hold-y [hold-ms]]` | **device action** | Focus-guarded capture of one labeled raw frame into ignored `captures/screencheck/`. Optional coordinates hold a light/control on-device during capture; it refuses overwrite. |
| `tools/device/build-screen-model.py --roi X0,Y0,X1,Y1 --output MODEL LABEL=PATH ...` | build/check | Builds an `SCM1` nearest-template model from raw screencaps or PNGs. Directories recurse. `--grid`, `--step`, `--mean-weight`, `--max-score`, and `--min-margin` tune it. Leave-one-out separation fails by default; `--allow-errors` is diagnostic only. PNG input requires Pillow. |
| `tools/device/replay-screen-model.py MODEL LABEL=PATH ...` | check | Replays independent labeled raw/PNG holdouts through the actual native classifier and fails on misclassification. `--checker PATH` uses an existing host binary. |

The model should have separate calibration and holdout frames, include
negative/other states, and reject uncertain inputs as `unknown`. Keep models
and screenshots under ignored `captures/` or another local scratch directory;
do not commit game imagery.

## Android source-dump tools

Read `SOURCE-DUMP-GUIDE.md` before using or citing these. The extracted CCN and
event dump are copyrighted game content and must remain outside the repo.

| Tool | Kind | Purpose and interface |
|---|---|---|
| `tools/dump/regen-dump.sh APPLICATION.CCN [outfile]` | extraction | Runs a CTFAK build in the .NET 6 Docker image and writes the event text dump. Configure `CTFAK_SRC`, `CTFAK_IMAGE`, and/or `DUMP_DIR` as needed. |
| `tools/dump/EventTextDumper.cs` | CTFAK plugin source | CTFAK `IFusionTool` used by `regen-dump.sh` to serialize objects, frames, conditions, actions, and parameters. It is not a standalone command. |
| `tools/dump/extract-samples.sh APK [outdir] [handle ...]` | query | Extracts reference cue samples from the game APK by Fusion sample handle (`res/raw/sNNNN.*`). Game content: it refuses to write anywhere inside the repository, and only derived reports are committed. |
| `tools/cue/features.py` | module | Stdlib front end for cue audio — decode, downmix to 16 kHz mono, 32 ms frames, 16 log-spaced bands with each frame's mean removed. Includes its own FFT; the repository's Python tooling has no numpy. |
| `tools/cue/reference-report.py [refdir]` | report | Fingerprints the extracted references — duration, hash, band profile — and prints their pairwise separability. That separability is the ceiling any detector can reach on this cue set. |
| `tools/cue/detect.py WINDOW...` | report | Template-matches the references against captured windows and reports per-sample score, onset, and level above background. Matches each reference's transient core by default (`--core`); whole-sample matching measured 19x fewer detections of the positive control on device. `--scan` reports onsets across a long recording, `--subtract` removes the per-run background profile. Fail-closed: empty, silent, clipped, or too-short windows are `UNKNOWN`. |
| `tools/cue/evaluate.py BACKGROUND` | report | Injects a reference into a real captured window at swept signal-to-background ratios and reports class-level hits and margins, with and without per-run background subtraction. A controlled lower bound, not a held-out detector result. `--anchor <dB>` is the gate-1 mode: it treats that level as a real thud detection's measured level and tests each vocal at its own played level relative to it, deriving the offset from the source channel volumes and reporting how much louder it would need to be. |
| `tools/cue/scan-night.sh WAV [--refs DIR]` | report | Scans one night's captured audio for Balloon Boy's vent bang, denoising before the cascade because that is measured to matter: injecting 52 copies of sample 17 into 159.5 s of real night background and scanning, the raw capture confirms **3/52** and the denoised one **27/52**, all 27 true and none false. Its floor is about **-12 dB** relative to background (0 dB -> 27/52, -6 -> 17/52, -12 -> 7/52, -18 -> 0/52), so a zero means "no bang above that level", not "no bang". `grade-run.sh` calls it whenever a run kept audio, and says so plainly when none was kept. |
| `tools/cue/label-misses.py VISUAL AUDIO --start-ns N` | report | Scores the bang detector's miss rate against visually labeled arrivals. The label is the lit opening going bright->dark, so it is independent of the detector under test; the luma split is derived from the recording and a dwell filter rejects screen flicker, which otherwise reports a confident rate from noise. Prints a rule-of-three upper bound and refuses to be believed below 60 events. |
| `tools/cue/export-model.py --refs DIR --cue C=H[,H] --threshold C=S --margin M --calibration NAME --output OUT` | generator | Turns uncommitted reference WAVs into the `cue-model-v1` text file the on-device matcher reads: each reference's most energetic 0.40 s core, resampled to 4 kHz and base64'd, with its cue name and threshold. The APK deliberately ships no game audio and no threshold, so this is the only way one gets onto a phone — pair it with `tools/device/provision-cue-model.sh`. Output is still a derived cue template: it refuses any in-repository path outside ignored `captures/cue-helper/models/`, and refuses to overwrite. `--evidence shadow` is the default and the helper will not let a shadow model arm a control window. |
| `tools/cue/correlate.py` | report | Full-rate waveform correlation: the confirming stage of the cue detector, and **the control that refuted the 22 thuds**. A band-feature detector reported 22 thuds across 285 s of night audio and was believed until this disagreed on all 22. Run by hand against a chosen pair; it grades no run. |
| `tools/cue/test-cue.py` | check | Asserts the cue front end on synthesised signals only — level invariance, onset accuracy, fail-closed screening, and that background subtraction raises a transient. Runs in `tools/test.mjs --engine`. |
| `tools/dump/readdump.py` | query | Resolves Android's XOR-28 object handles and provides `frames`, `objects`, `group`, `find`, `object`, `writes`, and `sounds` queries. `sounds <frame>` indexes every play-sample action by handle so a cue's uniqueness is visible; `sounds <frame> <handle>` prints the groups that play one. Sounds are dispatched through `cam 01` registers, so pair it with `writes` to reach the real trigger. Use `--xor 0` for old PC dumps and `--dump`/`FNAF2_DUMP` for the source file. |
| `tools/dump/coverage.py` | report | Classifies all event groups and cross-references citations to expose unread state/setup/input clusters. `--map` prints the full Markdown map; `--dump` and `--frame` select input. |
| `tools/dump/aimap.py [event-sheet]` | report | Replays the per-night/per-hour AI counter table. Reads the canonical tabular dump (`$FNAF2_DUMP`) or an archived rendered `03-04-Office.txt` (`$FNAF2_OFFICE_DUMP`), detected by content. `--json` emits structured output; `--xor 0` reads PC dumps. |
| `tools/dump/test-instances.py` | check | Checks the frame-instance reader against a synthetic dump. Needs no game content. |
| `tools/dump/test-aimap.py` | check | Runs `aimap.py` over a synthetic sheet in both forms: night-start zeroing, per-hour carry-forward, `<`/`>` night comparisons, Random assignments, and the Custom Night dial copy. Needs no game content. |

## Test fixtures and mocks

These exist so device tooling can be tested without a phone. They are not
instruments and produce no evidence about a run.

| Tool | Kind | Purpose and interface |
|---|---|---|
| `tools/device/testdata/mock-adb-cue-helper.sh` | mock | Stands in for `adb` in the cue-helper regressions. |
| `tools/device/testdata/mock-control-server.py` | mock | Protocol stand-in for the helper's control socket over the forward transport, field-for-field with the device's `CaptureService.buildSnapshot()`. |
| `tools/device/testdata/make-title-fixture.py` | fixture builder | Synthesises title-screen frames and a matching model for `test-menu.sh`. Requires Pillow. |
| `tools/device/testdata/make-intro-card-fixture.py` | fixture builder | Synthesises intro-card decision fixtures and a deliberately **wide** model, so the refusal band is exercised rather than assumed. Requires Pillow. |

## Generated files and dependencies

- `dist/`, `captures/`, raw screenshots, classifier models, and the built
  `tools/device/fnaf-screencheck` are generated/local and ignored.
- Node tools use built-in modules; Chrome browser checks expect Node 22 and a
  Chrome binary (or `$CHROME`).
- Recorded-video analysis requires `ffmpeg`; PNG screen tools require Pillow.
- Device tools require `adb`, the owned Android game, the calibrated landscape
  layout, and exactly one intended device unless the script explicitly gains a
  serial selector.
- Dump regeneration additionally requires Docker and a prepared CTFAK checkout.

## Adding or changing a tool

1. Search this index and existing implementations with `rg`; extend an
   existing entry point or shared module when the responsibility overlaps.
2. Decide whether the result is an asserting **check**, a human-read **report**,
   an internal module, or a state-changing **device action**. Make the exit
   behavior match the label.
3. Reuse `chrome.mjs`, `pool.mjs`, `screenstate.py`, `coords.sh`, or the
   `screencheck` pipeline instead of duplicating browser, parallel, device
   guard, coordinate, or visual-classification infrastructure.
4. For device actions, validate inputs, focus, and screen state; refuse unsafe
   overwrite; use a device-side monotonic schedule for timed sequences.
5. Add or update the entry here in the same change, including its interface,
   side effects, dependencies, and whether it is safe to run unattended.
