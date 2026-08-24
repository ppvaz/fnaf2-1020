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
| `tools/serve.py [port]` | dev server | Serves the repo, defaulting to port 8731. `POST /save-layout` validates a calibrated layout, rewrites `src/config.js`, and rebuilds, so that endpoint is intentionally mutating. |
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
| `tools/pilottest.mjs [n]` | report/check | Replays the phone pilot schedule in the simulator. Options include `--vent`, `--sync`, `--evict`, `--late-flash`, `--cycles=N`, `--night=N`, and `--worst`; `--assert` guards the narrow BB→Foxy claim rather than full survival. `--night=6` is the night the device actually plays. |
| `tools/phasesweep.mjs [n] [--sync]` | report | Retained negative search over every 200 ms pilot-cycle phase: delaying BB's latched final hop reduces but never eliminates office arrivals. |
| `tools/periodicsweep.mjs [n]` | report | Prices a blind full BB response every N cycles; it can exclude BB but loses earlier to the hall/office trade. |
| `tools/flicksweep.mjs [n]` | report | Prices removing the blind Golden Freddy mask flick, alone and with periodic BB responses. |

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
| `tools/device/coords.sh` | sourced config | Moto g56 5G, 2400x1080 landscape touch coordinates used by the trial scripts. Source it; do not execute it. Recalibrate before using another layout/device. |
| `tools/device/screenstate.py` | classifier | Reads an ADB PNG on stdin and prints `night`, `gameover`, or `other`. `--adb-fast [timeout]` transfers only sampled raw scanlines for watchdog polling. Requires Pillow in PNG mode. |
| `tools/device/trial-minus7.sh [name] [cycles]` | **device action** | Guarded, recorded timed loop with experimental clean-frame controls `BB_LEFT_CAPTURE_*`, `BB_LEFT_MODEL`, and `GF_OFFICE_MODEL`. A model result other than confident `empty` masks and aborts before the hall. `GF_SKIP_MASK_ON_EXACT_EMPTY=1` is an unvalidated collection path that omits the blind mask only for `empty score=0`; it is off by default. For clean left-opening captures, `POST_CAPTURE_TOUCHES=1` (default) enables touch dots only after each raw frame, exposing later hall/control coordinates in the recording without contaminating the classifiers. Other controls include `NIGHT`, `DEBUG_OVERLAYS`, `GRADE_RUN`, `PRESS_MODE`, and watchdog intervals. |
| `tools/device/hid-multitouch-smoke.json` | **device action/fixture** | Direct `/system/bin/hid FILE` replay that selects 6th Night, holds camera light as contact 0, and taps CAM 10/04/07 as independently released contact 1. Read `docs/device/HID-MULTITOUCH.md`; it is not focus-guarded by itself. |
| `tools/hidreporttest.mjs` | check | Parses the HID fixture and fails unless CAM 10/04/07 each receive a fresh contact-1 down/up while contact 0 stays on the light, with a final explicit two-contact release. Runs without a device. |
| `tools/hidpilottest.mjs [runs] [--night=6]` | report | Exploratory exact-simulator comparison for the HID timing primitive and CAM 05 tracking experiment. `--no-cam5` deliberately means no BB handling and fails Night 6; it does not model the selected lit-left-opening replacement. `--hypothetical-unlit` is a rejected bound, not a usable controller. |
| `tools/device/trial-maskcamp.sh [name] [seconds] [night] [protocol]` | **device action** | Guarded mask-clear experiment. Protocol is `wind`, `nowind`, or `nowind-flash`; it cold-starts the game and records the trial. |
| `tools/device/run-batch.sh COUNT [night] [prefix] [protocol]` | **device action** | Runs repeated `trial-maskcamp` experiments and then reports visual events for each recording. |

### Recorded-trial analysis

| Tool | Kind | Purpose and interface |
|---|---|---|
| `tools/device/grade-minus7.py VIDEO` | report | Post-run office/mask/camera/hall interval grading for a recorded trial. Supports assertion options shown by `--help`; requires ffmpeg. |
| `tools/device/camtrace.py VIDEO` | report/check | Finds stable `10 -> 04 -> 07 -> 11` selected-camera sweeps. `--expected N` makes a missing-sweep result fail. Requires ffmpeg. |
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
| `tools/dump/readdump.py` | query | Resolves Android's XOR-28 object handles and provides `frames`, `objects`, `group`, `find`, `object`, and `writes` queries. Use `--xor 0` for old PC dumps and `--dump`/`FNAF2_DUMP` for the source file. |
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
