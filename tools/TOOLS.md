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
| Explore a strategy or cycle | `tools/cyclesearch.mjs`, `tools/strategysearch.mjs`, `tools/gatesearch.mjs` |
| Run a guarded phone trial | `tools/device/trial-minus7.sh`, `tools/device/trial-maskcamp.sh` |
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

## Simulator checks and reports

| Tool | Kind | Purpose and interface |
|---|---|---|
| `tools/sourcetest.mjs` | check | Direct assertions for sourced engine rules and reachable input states, keyed to event-sheet groups. Runs first in the engine suite so a wrong mechanism cannot hide behind unchanged population statistics. |
| `tools/simtest.mjs` | check | Canonical headless engine/mechanics regressions, plus the coach's per-step grading contract (a measured window may only tighten a lesson's tolerance, and must grade lopsidedly). `--sweep` also drives perfect Minus 7 over 200 seeds. |
| `tools/bbtest.mjs [n]` | report/check | BB-aware reactive Minus 7 bot and reusable worker task. Supports `--worst`, `--jitter=MS`, and `--assert`; only `--assert` turns the survival result into a failing check, and it also guards the step model (ids matching `CYCLE_SCRIPT`, and both per-step paths being identities when asked for nothing). As a worker task it additionally accepts `profile` (per-step error weights, see `PROFILES`) and `stepShift` (move one step by a fixed number of frames). |
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
| `tools/device/query-cue-helper.sh [loopback\|forward\|record PRE POST [label]]` | device check/report, **device action** for `record` | Focus-guarded one-shot query of the helper's authenticated snapshot socket. `loopback` (default) exchanges inside one device shell, modelling the on-device controller; `forward` reaches the abstract socket over an ephemeral `adb forward` it removes on exit. Only a bounded text snapshot returns, and a fail-closed snapshot is an error. Calibration plumbing, not a host-driven controller. `watch SECONDS [out]` polls the snapshot at ~11 Hz into a TSV of snapshotNs/seq/luma, which is the independent label channel for cue evidence. `latency [count]` times device-local snapshot reads against the device clock and reports p50/p95/p99/max beside a shell-only baseline. `record` is the one state-changing mode: it arms the helper's calibration ring, captures a PRE+POST second window, disarms it again, and pulls the WAV into ignored `captures/cue-helper/calibration/` without overwriting. It sends no input and never launches the game. |
| `tools/device/collect-cue-audio.sh [rounds] [seconds] [label]` | **device action** | Cold-starts short 6th Nights, mutes the opening call, and waits while Balloon Boy takes his route, with the helper logging audio throughout. Sends no other input; surviving is not the point. Writes a session-boundary TSV so a holdout can split by session rather than by adjacent windows. |
| `tools/device/test-query-cue-helper.sh` | check | Mock-ADB regression for helper PID/token discovery, focus gating, transport selection, and snapshot parsing. Serves a real local socket for the forward transport; does not touch a real device. |
| `tools/device/coords.sh` | sourced config | Moto g56 5G, 2400x1080 landscape touch coordinates used by the trial scripts. Source it; do not execute it. Recalibrate before using another layout/device. |
| `tools/device/screenstate.py` | classifier | Reads an ADB PNG on stdin and prints `night`, `gameover`, or `other`. `--adb-fast [timeout]` transfers only sampled raw scanlines for watchdog polling. Requires Pillow in PNG mode. |
| `tools/device/clocktrace.mjs VIDEO` | analyzer | Measures the first office HUD and 1 AM transitions in a 1280x576 trial recording. `--expect-ms=70000 --tolerance-ms=N` turns the sourced 70-second hour edge into an assertion for device-epoch trials. |
| `tools/device/trial-minus7.sh [name] [cycles]` | **device action** | The sole device route: an emitted, model-gated Night 6 `hid-multi` plan with device epoch latch and clean left-opening classification enabled by default. It requires `BB_LEFT_MODEL`; use `captures/screencheck/bb-left/models/runtime-gh.scm`, whose latch window matches this loop. The old swipe table, `NIGHT6_LEFT` selector, and `HID_LEFT_SURVIVAL` sparse probe are retired as device modes; `pilottest.mjs` remains temporarily as a legacy research model. `CUE_AUDIO=1` (with `CUE_HELPER=1`) retains PCM, and `GRADE_RUN=1` grades the resulting capture by default. **Run:** `BB_LEFT_MODEL=captures/screencheck/bb-left/models/runtime-gh.scm tools/device/trial-minus7.sh NAME 90`. |
| `tools/device/recipe.mjs` | generator/report | Emits the device pilot's opening/clear/attack cycle recipes **from the exact simulator**, with per-cycle budgets (light, wind against break-even, sweep span, camera spacing, shortest contact) and the nightly flashlight total. `--json` for the artifact, `--track` to render the same recipe in `CYCLE_SCRIPT`'s trainer shape. Monitor and mask events carry the state the engine reached, never an inferred toggle. |
| `tools/device/test-recipe.mjs` | check | Gates that recipe: contacts at or above the phone's 100 ms floor, camera spacing at or below the 120 ms it has landed, a hall flash per cycle, clear-cycle wind above break-even, the flashlight inside night 6's 3000 frames, and the monitor/mask polarity invariants. No device. |
| `tools/device/actuator.mjs` | internal module | The phone's measured failure modes as a simulator layer: launch lateness (110-300 ms, order-preserving queue, one draw per hold so flash lengths survive) and the mask-seam monitor drop at the desync census's band rates (5/7 under 140 ms, 4/8 at 140-180 ms, 0/17 at 180+). Draws come from its own seeded RNG so the game's roll stream is unmoved. The wind-overlap and vent-light drops are documented in its header as measured-but-unmodelled: no clean rate yet. |
| `tools/device/test-actuator.mjs` | check | Gates that model: holds keep their planned length, submission order is delivery order, the seam bands reproduce the census within tolerance and never drop at or past 180 ms, worst luck pins drops but not lateness, and a seed replays identically. No device. |
| `tools/device/test-runner-plan.mjs` | check | Gates that the runner *interprets* the plan rather than carrying a second copy: no schedule literals in the plan driver, the host pushes what `recipe.mjs --device-plan` emits, the branch windows line up with the plan's instructions, and the plan itself replays through the engine 300/300. No device. |
| `tools/device/human-gate.mjs plan.txt` | check | The model gate: replays the plan through the exact engine over 100 seeds with every row shifted by ±60 ms of human slack (the measured plans/04 bracket floor, until the trace census supersedes it with correlated bands) and refuses below the 40% replay contract. Compound actuator rows preserve their measured internal spacing. `trial-minus7.sh` runs it before its first adb command, and has no inline schedule fallback. Absolute, no override (2026-08-25). |
| `tools/device/test-human-gate.mjs` | check | Mock regression for the model gate plus the decision record: plan-text round-trip, bounded deterministic error injection, exact verdict thresholding, the shipped Night 6 plan passing (46/100), and the sole runner path reaching only a mock adb after its gate. |
| `tools/device/test-human-floor.sh` | check | Mock regression for the runner's live floor: extracts the shipped press primitives, stubs the device and the clock, and asserts tight presses, tight holds, and inhuman sweeps abort with exit 44. No device. |
| `tools/device/test-plan-interpreter.sh` | check | Mock regression for the interpreter itself. Lifts `plan_control_xy`/`plan_first_offset`/`plan_step`/`run_cycle` out of the shipped runner, stubs the device primitives, and runs the real plan through them: opening, shared prefix, both branches, the epoch slip the wind absorbs, and refusal on an instruction or control it cannot execute. No device. |
| `tools/device/test-hid-trace.mjs [trace]` | check | Audits a recorded HID stream for contact length, released time between two different buttons, and the trap-2 release discipline. `HID_TRACE_RUN=1 tools/device/trial-minus7.sh ...` records `captures/NAME-hid.jsonl`; running the checker with no argument runs its self-test, which is what the suite executes. |
| `tools/device/test-hid-walltime.mjs` | check | Static gate on the runner's sweep primitives: the sweep may wall-time only its start, its per-camera hid time must total the 120 ms the phone has landed, and the classify path must leave a Fusion poll of released time before the mask press. |
| `tools/device/hid-sweep-probe.mjs [spacing ...]` | generator | Emits a `hid` report stream that selects CAM 10/04/07 at a chosen inter-selection spacing with the camera light **pulsed after each selection** rather than held across the sweep. Prints to stdout; touches no device. |
| `tools/device/hid-sweep-probe.sh [spacing ...]` | **device action** | Runs those sweeps on 6th Night and grades the recording with `camtrace.py`, to measure the phone's real spacing floor. Defaults to 240/200/160/120 ms. It defends nothing and the night is expected to end to W. Foxy after the sweeps, which is why they run first. Refuses to act on a locked device or without game focus. |
| `tools/device/test-hid-sweep-probe.mjs` | check | No-device regression for that stream: both contacts released, one light pulse per selection, the requested spacing, and at most 300 ms of light per sweep. |
| `tools/device/hid-multitouch-smoke.json` | **device action/fixture** | Direct `/system/bin/hid FILE` replay that selects 6th Night, holds camera light as contact 0, and taps CAM 10/04/07 as independently released contact 1. Read `docs/device/HID-MULTITOUCH.md`; it is not focus-guarded by itself. |
| `tools/hidreporttest.mjs` | check | Parses the HID fixture and fails unless CAM 10/04/07 each receive a fresh contact-1 down/up while contact 0 stays on the light, with a final explicit two-contact release. Runs without a device. |
| `tools/hidpilottest.mjs [runs] [--night=6]` | report/check | Exact-simulator report for HID policy comparisons. `--sparse-left --night=7` is the idealized 267 ms upper bound; `--pilot-offset-ms=N` exposes its epoch dependency. `--device-sweep` substitutes the phone-proven 790 ms/240 ms-feed actuator and now also applies to the selected Night 6 left-opening route, and `--assert-rejected` requires zero survivors so the ideal result cannot be mistaken for a live route. `--pulse-light` pulses the camera light around each selection instead of holding contact 0 across the sweep, which is what makes the sweep affordable at all on night 6's 3000-frame flashlight; `--mask-margin-ms=N` sizes the BB mask's phase margin against a known T0 instead of spending a blind second. `--vocal-cam5` is plan 08's perfect-third-vocal upper bound; its error controls are `--drop-vocal=1..3` and `--vocal-false-count=1..3`. `--assert` requires complete survival with no missed BB state. Other diagnostic modes include `--cam5`, `--sparse-cam5`, `--always-threat`, and `--tick-aligned-mask`. `--bang-cam5` arms the CAM 05 read from the source bang and re-syncs its count on the read result; `--drop-bang=`/`--false-bang=` inject cue errors. `--device-actuator` prices the run through `tools/device/actuator.mjs` with one lateness draw per wall-timed beat (the branch macros floor off the read that happened, like `rm_floor`); `--press-late-ms=MIN,MAX` overrides the measured band. This pilot has no desync recovery loop, so its actuator numbers price open-loop monitor toggling, not the live runner. |
| `tools/device/trial-maskcamp.sh [name] [seconds] [night] [protocol]` | **device action** | Guarded mask-clear experiment. Protocol is `wind`, `nowind`, or `nowind-flash`; it cold-starts the game and records the trial. |
| `tools/device/run-batch.sh COUNT [night] [prefix] [protocol]` | **device action** | Runs repeated `trial-maskcamp` experiments and then reports visual events for each recording. |

### Recorded-trial analysis

| Tool | Kind | Purpose and interface |
|---|---|---|
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
| `tools/cue/test-cue.py` | check | Asserts the cue front end on synthesised signals only — level invariance, onset accuracy, fail-closed screening, and that background subtraction raises a transient. Runs in `tools/test.mjs --engine`. |
| `tools/dump/readdump.py` | query | Resolves Android's XOR-28 object handles and provides `frames`, `objects`, `group`, `find`, `object`, `writes`, and `sounds` queries. `sounds <frame>` indexes every play-sample action by handle so a cue's uniqueness is visible; `sounds <frame> <handle>` prints the groups that play one. Sounds are dispatched through `cam 01` registers, so pair it with `writes` to reach the real trigger. Use `--xor 0` for old PC dumps and `--dump`/`FNAF2_DUMP` for the source file. |
| `tools/dump/coverage.py` | report | Classifies all event groups and cross-references citations to expose unread state/setup/input clusters. `--map` prints the full Markdown map; `--dump` and `--frame` select input. |
| `tools/dump/aimap.py [event-sheet]` | report | Replays the per-night/per-hour AI counter table. Reads the canonical tabular dump (`$FNAF2_DUMP`) or an archived rendered `03-04-Office.txt` (`$FNAF2_OFFICE_DUMP`), detected by content. `--json` emits structured output; `--xor 0` reads PC dumps. |
| `tools/dump/test-aimap.py` | check | Runs `aimap.py` over a synthetic sheet in both forms: night-start zeroing, per-hour carry-forward, `<`/`>` night comparisons, Random assignments, and the Custom Night dial copy. Needs no game content. |

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
