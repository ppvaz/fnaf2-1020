# Plan progress

**Updated:** 2026-09-02

2026-09-02 ROADMAP B1 / Plan 05 packages 6b-7b — the invention substrate is
built on the PRIVILEGED surface and the campaign's first check-in has run.
Privileged-first is Pedro's ordering and it is a refutation instrument, not a
route: the privileged surface is a strict upper bound, so a target it cannot
clear is refuted without building the observable search out, and nothing
expressed there is device-promotable.

**6b/6c.** `tools/invent/policy-lang.mjs` is a first-match rule list with a
predicate AST, four registers as the only retained state, seeded genome
generation, mutate/crossover, exact-round-trip serialize/parse and a pure
interpreter. Its load-bearing gate is expressiveness and it passes: a
hand-written rule list reproduces `tools/minus7/policy.mjs`'s `decide()` over
200 Night 7 seeds, 13848 decisions, 0 divergent. The duplicate control is
mechanical -- a rule list with no observation-conditioned branch is pruned as a
Plan 05 static cover, one branching only on the frame clock as a Plan 06 phase
schedule -- so Plans 05/06/16's closed families cannot be rediscovered by
anyone forgetting the prior result.

**Per-rule privileged-read provenance (Pedro's requirement).** Every rule
records which privileged reads justified which decision and whether each has an
observable counterpart, because a privileged read is a sensor requirement in
disguise. For `decide()` the no-known-observable set is **committed, foxyD,
gfPresent, stun, winding**. Foxy's `D` is the most load-bearing quantity in the
7b result below and is not observable; a 7c survivor leaning on it would be a
negative of the second kind -- winnable in principle, unobservable in practice.

**7b check-in: reaction already clears nine of eleven dials at cap**, 100% each
at the full 1200-seed admission gate (withfreddy, withbonnie, withchica,
toyfreddy, toybonnie, toychica, mangle, golden, puppet), stable against a
120-seed preview. Only foxy and bb resist, both 0.0% -- and they are the SAME
failure. With bb at cap and foxy at ZERO the baseline dies to Foxy 300/300 at a
mean 49.0s, because `decide()`'s `bbOpening -> HOLD_MASK` (62 frames) sits above
its Foxy check and starves the hall flash; the foxy target dies 300/300 at a
mean 401.2s of 420s. The entire unsolved region of the single-threat space is
**the hall time budget**, not any animatronic.

Two corrections the package forced. **There is no such thing as a single-threat
vector:** Foxy's test is `21 + rng(0..4) - D <= ai.foxy`, so at AI 0 he still
fires once D passes ~21, and with all eleven dials at zero the empty policy
still dies to Foxy 20/20 while the baseline survives 100%. Every target carries
Foxy-by-neglect, so a low probe score is evidence about the time budget rather
than about that character. And **`decide()` was mis-parameterised under Custom
Night** -- it called `peakAi(night, 'foxy')` while `peakAi` takes the dials as a
third argument, so it sized its Foxy band for the standard night whatever the
dial said. An earlier probe table built on that bug showed reaction failing on
9/11, the exact inverse of the truth; it was caught by checking the harness
against the reference policy's own published numbers. Package 7b sanctions an
adapted baseline, so the parameter is threaded through; the default is unchanged
and the 6b gate still passes.

The plan says ten single-threat vectors; the engine exposes eleven dials. All
eleven are probed and the discrepancy is recorded rather than resolved by
dropping one.

Typecheck, `test:unit`, `test:core`, `test:affected` and dry-run lanes pass:
`run-20260902181101-4f391063-4e4c57` (`FIXTURE`, not gameplay evidence).
**Open:** package 7c (the search itself) is not started, and by the check-in
rule it should target the hall time budget rather than nine already-cleared
characters. Packages 8 and 9 are untouched. Plan 05 package 6a has a recorded
hole -- its surface has no `winding` and no per-camera stun table, both of which
the rollout surface has and `decide()` reads. Nothing is promoted, no ladder
position moved, and the 47/133 denominator is unchanged.

2026-09-02 ROADMAP A1 complete — the two items left open by the
characterization above are closed, and A1's exit gate is now met on both halves.

**Deferred actions are executed.** `commit()` computed them, returned them, and
no caller consumed them, so every multi-action primitive ran half-executed and
left an input held -- on a phone, a touch contact never lifted. Scheduling is
now the caller's and legality core's, per Pedro's decision and matching
`tools/device/actuator.mjs`'s existing queue: `commit()` stamps each deferred
action with its owning cycle and an absolute `dueFrame`, and
`releaseDeferred()` applies one at its own frame or refuses it with a reason.
A release lands between observation boundaries -- `C.s(4.5)` is 270 frames,
not a multiple of the 4-frame read cadence -- so the reduced state is advanced
to the release frame; requiring the two to coincide refused 23/23 releases and
was caught by the harness's own assertion.

**The corrected survival number is worse, and that is the honest direction.**
Night 1, three full nights per arm, seeds 0/1/2: estimator 0/3 survived, 88
actions, mean 342.8s alive, 21 released / 0 refused / 0 stranded, deaths
`{"inside-office": 3}`; observation-disabled and open-loop 0/3, 0 actions, mean
299.3s alive, deaths `{"puppet": 3}`. The previously recorded 1/3 was partly an
artifact of the defect: a `wind` press never released keeps the box topped up
for free. The acting arm therefore does **not** beat the controls on survival.
It beats them on time alive and on cause of death -- both controls die to the
Puppet 3/3 and the acting arm never does, because it manages the box, dying
instead to a threat the baseline route makes no attempt to defend against.

**The recorded-facts half is met.** `tools/factreplay.mjs` records a night's
observation/decision stream as `offline-fact-stream-v1` -- manifest header with
night, seed, observer configuration, library, commit and a stable digest, then
one JSON boundary per line -- and drives the controller from that stream alone.
Full Night 1 seed 0: 5855 boundaries recorded, all 5855 decisions rebuilt
identically, digest verified on load. Retained exact-gate verdicts travel with
the stream so a replay has no engine to consult and cannot invent one. This is
A1's clause, not A2's: Plan 09 P2's open item is a manifest from a **real phone
run**, and this stream is simulator-produced, claims `MODEL_ONLY`, and says so
in its own manifest. What it establishes is Plan 20 P1's own done-when.

Typecheck, `test:unit`, `test:contracts`, `test:core`, fact-replay and dry-run
lanes pass: `run-20260902172714-8770796f-4e4c57` (`FIXTURE`, not gameplay
evidence). **Open:** Plan 15's fact/adapter contract, Plan 20 P6's real-time
placement, and re-hosting Plan 19's reaction path on this controller. The
baseline route scorer remains a declared control and is not a strategy; nothing
here is promoted, no ladder position moved, and the 47/133 denominator is
unchanged.

2026-09-02 ROADMAP A1 closed-loop characterization — the belief-state cycle
controller has now been driven cycle by cycle over a full night for the first
time. Plan 20 P5's recorded gate is a nine-second horizon against one synthetic
blackout on Night 1; that horizon hid four defects, all of which are only
reachable over a night's length and none of which is a flaw in the closed
loop's design:

1. **The finite cycle library was not closed under its own prerequisites.**
   `wind-and-anchor` requires `viewedCamera === C.BOX_CAM`, no primitive emitted
   a `cam:` action, and `C.initialCamera(1)` is CAM 09. Measured: the wind
   primitive was rejected at 1800/1800 decision boundaries, the controller
   selected `observe-and-hold` 241 times and nothing else all night, and Night 1
   ended `death=puppet` at ~4 AM. The music box could not be wound on any night
   under any scoring. Closed by `select-box-cam`, `lower-monitor` and `unmask`,
   which add no new timing, plus a bounded-reachability gate whose
   known-negative register fails in both directions.
2. **`estimator.update()` deep-cloned an unbounded diagnostic trace.** One entry
   per observed fact, 14 per boundary, so per-decision cost grew with elapsed
   night time -- slowest at 5-6 AM, when deadlines are tightest. Wall clock per
   equal 2000-frame chunk ran 1.4s, 4.3s, 7.5s, 10.8s, 14.2s, 17.6s, 20.9s, then
   199s, with the trace at 56,016 entries by frame 16,000 while replayed engine
   ticks stayed linear. The trace is now bounded with a reported `traceDropped`;
   nothing reads it for logic, so it is a diagnostic window and not a replay
   source. Flat ~1.75s per chunk after, roughly 20x faster. `belief-v1` is
   unchanged.
3. **The exact-gate replay could spin forever.** `tick()` is a no-op once `won`
   is set and does not advance `frame`, so a primitive whose action lands past
   `durationFrames` never terminated. Latent in the committed gate, unreachable
   at a nine-second horizon.
4. **`commit()`'s deferred actions are executed by nobody.** OPEN. The
   controller computes and returns them and no caller in the repository consumes
   them, so every multi-action primitive is committed half-executed:
   `wind-and-anchor` presses `wind` and drops its release, `foxy-hall-reset`
   holds the light forever. Simulation hides this because lowering the monitor
   clears `winding` anyway; on a phone it is a touch contact that is never
   released. Whether the queue is caller-owned or controller-owned is a Plan 20
   P6 boundary decision and is not taken here.

The closed loop's gates also moved out of the legacy campaign into
`packages/core/test/cycle-{library,planner,controller}.test.js` and the
`test:contracts` lane, since ROADMAP Track A names the closed loop as the spine
of the device work and its gates ran only under `npm run test:legacy:engine`.
`reducedmodeltest.mjs` deliberately stays in `tools/`: it imports
`tools/device/minus-toys-plan.mjs`, so moving it would invert the charter's
ownership direction. `affected-test.js` previously had no rule for a changed
test file at all and now runs one directly.

`tools/nightloop.mjs` is the campaign instrument. Night 1, three full nights per
arm, seeds 0/1/2: estimator 1/3 survived (seed 0 reached frame 25200,
`death=won`), 74 actions, mean 367.3s alive, 8336 exact checks, 7 of 8
primitives used; observation-disabled 0/3, 0 actions, mean 299.3s alive, deaths
`{"puppet": 3}`; open-loop identical to disabled. **This is a simulator plumbing
result and nothing more:** the route scorer is a declared baseline control, not
a sourced or promoted strategy, its `WIND_AT` is a harness knob and not a
measured value, and the disabled arm reproduces the open-loop trajectory exactly
because `plan()` correctly refuses to act on UNKNOWN -- so "beats the
disabled-observation control" is one comparison, not two.

Catalog, typecheck, `test:unit`, `test:core`, `test:affected`, documentation and
dry-run lanes pass: `run-20260902161931-3cd53c01-4e4c57` (`FIXTURE`, not
gameplay evidence). **Open:** A1's exit gate also requires *recorded* facts, and
no manifested session exists -- `OBSERVATION-CORPUS-INVENTORY.md` records
`captures/` as an unmanifested video, an epoch file and one SCM model, so that
clause belongs to A2's Plan 09 P2 item and A1 cannot satisfy it as written.
Plan 15's fact/adapter contract, Plan 20 P6's real-time placement, defect 4, and
the re-hosting of Plan 19's reaction path on this controller all remain open. No
ladder position moved, no package closed, and the 47/133 denominator is
unchanged.

2026-09-02 roadmap and legacy deprecation — the program now has one sequenced
route, [`ROADMAP.md`](ROADMAP.md), keyed to Plan 12's claim ladder and derived
from this file, the plan statuses and [`22-STATUS.md`](22-STATUS.md). Two
decisions are recorded in it: the legacy shell runner is deprecated immediately
(reference and characterization only, behind `FNAF2_LEGACY_TRIAL=1`, and it may
not produce new ladder evidence), and the closed loop is the spine of the
device work rather than a later package. The consequences are stated rather
than absorbed: the Night 1 clear `n1-full-1640` stays attributed to the retired
path, so the modern path enters the ladder at Level 1; the measured fork-free
`/proc/uptime` clock and the `REACTIVE=observe` branch exist only in the retired
binary and must be re-established, and measured, on the modern one; and
`apps/device/src/adb-device-local-executor.js` still compiles one full-night HID
script with a lifecycle abort poll, which is a correct actuation edge and the
wrong control boundary. `COMPATIBILITY.md`, the generated legacy-path map and
Plan 22 P5 now carry the deprecation. Catalog, reference, documentation,
`npm run test:affected` and dry-run lanes pass:
`run-20260902134404-09d341f9-4e4c57` (`FIXTURE`, not gameplay evidence).
**Open:** everything the roadmap sequences — no ladder position moved, no
package closed, and the 47/133 denominator is unchanged (Plans 22-24 are still
absent from the dashboard).

2026-09-02 Plan 22 control audit — the closure matrix now keeps P2/P3 distinct,
reopens P7 until screencheck owns its operational lanes, and records the
TypeScript migration as an open P9 gate rather than calling checked JavaScript
strict TypeScript. The architecture guard now inspects module bodies,
template interpolations, research/device boundaries, and physical actuator
composition; CLI help/unknown commands are side-effect free; evidence indexing
distinguishes session, device-bundle, and historical artifact schemas; and the
catalog generator refuses missing contract fixtures. Workspace `npm test`,
affected gates, catalog idempotence, CLI/architecture/activity/screencheck
fixtures pass in the current workspace. This is a phase-1 control improvement, not P0–P9 closure:
measured P0 characterization, strict migration, live qualification, broader
research equivalence, and the legacy lane remain open in [the matrix](22-STATUS.md).

2026-09-02 Plan 24 P4 adaptive skill foundation — the trainer now has an
isolated per-player/profile skill model over validated replay sessions. It
reports scored/censored denominators, Wilson 95% uncertainty, selection
probability means, and a separate holdout bucket that never trains; the capped
selector ranks conservative weak-state candidates, excludes holdout, records
conditional selection probability, and refuses recent-state/session-cap
violations. Export, reset, duplicate-session, and profile-binding checks pass
in `tools/adaptivecoachtest.mjs`. This is replay-only and cannot affect safety,
belief, live prompting, or device policy.

2026-09-02 Plan 24 P3A Arcade Lab renderer/progression foundation — campaign,
Rhythm Highway, and Threat Constellation now share validated renderer
descriptors, frozen exercise views, accessibility capabilities, and semantic
grade invariance. Raw live media is excluded from views; deterministic seeded
sets and local per-player progress support reset/export, while censored
exercises remain neutral for combo and correctness. The shipped trainer now
has a discoverable `FIXTURE / PRACTICE` drawer with answer flow, export/reset,
and a built-page smoke check. Actual retained/live corpus joins, lesson-ladder
integration, and rhythm/spatial canvases remain open; this does not qualify a
live surface.

2026-09-02 Plan 24 P3B Rhythm Highway chart foundation — deterministic charts
now derive from frozen exercises and routine steps carrying declared canonical
timing windows. The chart reuses `glyphFor`, lays hold-aware notes into lanes,
refuses dense collisions, records bounded audio/haptic offsets, and carries a
commit-then-reveal prediction fork without the outcome. `tools/rhythmhighwaytest.mjs`
passes. Canvas UX, refresh/audio/reduced-motion qualification, and measured
player trials remain open; this is replay/practice evidence only.

2026-09-02 Plan 24 P3C Threat Constellation spatial foundation — profile-bound
semantic anchors now have fixed geometry, minimum touch targets, ordered
tap/hold/slider gesture records, and required keyboard/switch/reduced-motion/
non-color/scalable-text alternatives with optional pointer telemetry. Retained
recognition layouts carry artifact references only; profile mismatches, unknown
anchors, and raw media refuse. `tools/threatconstellationtest.mjs` passes. The
hit-circle canvas, retained-corpus localization, and measured gesture trials
remain open; this is replay/practice evidence only.

2026-09-02 Plan 24 P3 offline/replay microtrainer foundation — the trainer now
has a DOM-free factory for prediction, timing, retained/profile-bound
recognition, and exact-simulator `MODEL_ONLY` strategy exercises. Future facts,
timing buckets, retained crop hashes/labels, and simulator provenance are
independent from the player's commitment; timing deadlines inside the measured
response budget refuse; recognition always includes `UNKNOWN`. The frozen
`microtrainer-session-v1` record retains prompt, commitment, resolution,
latency, scheduler, source-fact, artifact, and split metadata and replays to
the same grade. `tools/microtrainertest.mjs` passes. This is offline foundation
evidence only: UI integration, retained corpus loaders, Plan 09 real-session
joins, adaptive scheduling, and all live surfaces remain open.

2026-09-02 Plan 24 P2 activity-gate foundation — core training now has a pure
`activity-gate-v1` evaluator with versioned risk and prompt/reveal,
cancellation, and human-recovery budgets. It admits only a qualified
`FNAF2_NIGHT`, fresh/consistent belief, clear critical state, sufficient quiet
horizon, profile match, and all overlay/capture/response capabilities; unknown,
stale, conflicting, cooling, risky, short, or unqualified inputs retain stable
refusals. A deterministic monotonicity lane proves increasing risk or
cancellation latency cannot weaken admission and critical cues preempt every
prompt. This remains offline foundation evidence, not a live activity or
training-benefit claim.

2026-09-02 Plan 24 P1 exercise/outcome foundation — `@fnaf2-1020/core/training`
now owns frozen `exercise-v1`, `commitment-v1`, `resolution-v1`,
`exercise-cancellation-v1`, `exercise-event-v1`, and `exercise-attempt-v1`
contracts. `replayExercise()` enforces prompt-first monotonic event ordering,
fixed choices/deadlines, independent evidence for outcomes, declared clock
domains, and explicit `CENSORED` cancellation/expiry paths. The deterministic
lane covers completed, cancelled, expired, unresolved, and ambiguous cases;
late or duplicate commitments and reordered/mismatched events refuse. This is
the replay/contract layer only: no activity gate, skill score, live prompt, or
human-benefit claim is made.

2026-09-02 Plan 20 P6 bench-trace foundation — the core telemetry package now
owns `bench-transport-trace-v1`. A trace requires complete screen/audio event
→ fact → executor receipt → actuator command → observed-result stages on one
declared monotonic clock, and its summary reports nearest-rank p50/p95/p99/
p99.9 for each leg and path while retaining UNKNOWN-result counts. The same
contract requires a completed bounded safe-cycle continuation after an upstream
drop and rejects replacement actions, incomplete approvals, mixed clocks,
duplicate samples, and negative legs. The deterministic fixture lane is in the
default suite and the contract catalog is regenerated. This is a host/fixture
contract only: no USB, MCU, external-HID, audio, or physical timing claim is
made; the real bench trace and Plan 20 P7 shadow campaign remain open.

2026-09-02 native Foxy hall collection — six empty and six operator-labelled
Foxy frames were captured from the g56 at the native 2400x1080 RGBA sensor
geometry (`captures/screencheck/foxy-hall/`, ignored with the other captures).
The provisional `foxy_hall_red_cells` channel over `[1650,300,450,400]`, step
8, redness floor 15 reads empty=0 and Foxy=32 on all six respective frames,
with calibration margin 16.0 against the 5.0 floor. The 23-entry helper was
rebuilt and installed as `com.fnaf2.cuehelper` version 10 (`0.1.9`). This is a
single-session collection result, not an independent holdout or a Night 6
claim; live Foxy promotion remains refused until a separated encounter and
the pan-offset/view gate are implemented.

2026-09-01 completed the campaign handoff and modern physical composition layer
for the remaining Night 6 → Night 7 work. `custom-night-config-v1` now
validates the ten 20 dials and Puppet 15; `custom-night-calibration-v1`
requires measured Custom Night menu, dial, Start, and readback geometry; and
the bounded configurator adjusts from an observed starting state before
requiring a fresh full readback. The campaign bundle binds one compiled
full-night plan per target. `DeviceLocalArtifactExecutor` remains the
deterministic test adapter; `AdbDeviceLocalArtifactExecutor` expands the bound
semantic schedule and transfers one device-local HID script with bounded
contact/macro encoding. Both return `UNVERIFIED` until lifecycle proof accepts
a positive 6 AM. `campaign-proof-v1` and `device-campaign-result-v1` retain
terminal, retry, Custom Night readback, and save/menu advancement facts. The
CLI exposes `--guided`, bundle/calibration/qualification inputs, and a combined
campaign preflight. Offline campaign, physical-schedule, composition, bridge,
typecheck, and affected gates pass. **Open:** the selected phone is connected
but the candidate profile remains `dryRunOnly`; Custom Night calibration,
external `DEVICE_MEASURED` qualification, and actual Night 6/Night 7 wins are
still absent.
Latest affected/device fixture evidence: `run-20260902005811-9d6124fd-4e4c57`
(`FIXTURE`, not physical gameplay evidence).

2026-09-01 integrated Night 6/7 device campaign infrastructure — added the
versioned campaign spec and FSM (`device-campaign-v1`), ordered campaign
runner, closed ADB discovery/preflight (`device-adb-preflight-v1`), physical
HID/Cue Helper ports, and persisted full-night artifact timing bounds. The
campaign distinguishes story Night 6 via Continue from Custom Night 7 with
all ten dials at 20 and Puppet 15; it caps retries, holds on UNKNOWN, and
requires positive 6 AM plus save/menu advancement before completion. The
affected suite and full `npm test` pass. Fixture result:
`run-20260902002645-90f6cddf-4e4c57` (`FIXTURE`, not physical gameplay
evidence). **Open:** `adb devices` currently has no ready phone; the HID /
MediaProjection candidate profiles remain `dryRunOnly`, Custom Night menu/dial
coordinates remain unmeasured, and no qualified device-local executor or Night
6/Night 7 win evidence exists yet.

2026-09-01 double-camera arming verification wiring — the native Cue Helper
camera detector now preserves every firmly highlighted camera button, so a
split remains `cameraHighlights=cam:9,cam:11` instead of collapsing to an
unsafe singular selection. The host observation payload and belief reducer
carry the complete pair; the simulated observer covers both the Minus Toys
CAM 09 + CAM 11 pair and the Minus 3 CAM 08 + CAM 11 registry. Minimal device
plans now declare `#arm-verify-cameras`, policy equivalence checks the header,
and the live runner uses the exact pair when `CUE_HELPER=1`, retaining the
CAM 11-only classifier as an explicit compatibility fallback. Adapter, native,
mock transport, observer, belief, plan, typecheck, and full `npm test` lanes
pass. Fixture device boundary record: `run-20260901221146-7c855d48-4e4c57`
(`FIXTURE`, not gameplay or physical camera evidence). **Open:** install and
run the rebuilt helper on a night surface to qualify the pair detector on the
g56; no device claim is made by this implementation pass.

2026-09-01 Cue Helper touch-evidence contract hardening — the Plan 23
qualification validator now requires one retained trial record for each of
`mask`, `leftVent`, `rightVent`, `flashlight`, `cameraMap`, and
`cameraButtons`, including positive attempt/delivery counts, target-observed
proof, and a non-placeholder trace ID. An aggregate `allDelivered=true` can no
longer mask a failed or missing control. Synthetic refusal coverage and the
full default suite pass; no physical touch result is being claimed.

2026-09-01 Cue Helper lease coverage — long-lived overlay qualification
observation, helper soak telemetry, and reviewed qualification-sidecar
provisioning now acquire the same kernel-released per-serial lease used by
setup and queue execution. The independent-process lock regression and mock
observer pass, so a second agent cannot mutate or invalidate an active trace.

2026-09-01 Cue Helper night-check retry boundary — an authenticated menu result
during a queued `night-check` now returns `SETUP HOLD reason=target-not-night`,
stops the temporary projection inside the device lease, and preserves the job
as `PENDING` for a later manually entered night. Setup, queue, and lock
regressions pass; no game input is generated.

2026-09-01 Cue Helper post-checkpoint device hold — the selected g56 remains
connected but reports `mWakefulness=Dozing` and `isKeyguardShowing=true`.
Direct image-free setup and the queue runner both returned
`HOLD reason=device-not-awake` without waking or unlocking the phone; the safe
menu baseline remains `PENDING` under its idempotency key.

2026-09-01 Cue Helper native test coverage — `npm test` now includes
`android/cue-helper/test.sh`, so the default contract lane exercises the
native ROI geometry, screen identity, battery/monitor/camera facts, snapshot
retention, overlay metrics, collision/lifecycle contracts, optional-audio
capture gate, and non-game identity detachment. The expanded suite passes.

2026-09-01 Cue Helper default verification tightening — `npm test` now runs
both TypeScript and checked-JavaScript typechecks before the architecture,
contract, qualification-observer, and simulation lanes. The complete default
suite passes, including the MCP queue boundary and Plan 23 qualification
regressions.

2026-09-01 Cue Helper MCP typecheck correction — the optional injected queue
runner in `apps/device/src/mcp.js` now has an explicit checked-JavaScript type,
so `npm run typecheck` no longer rejects the `cueHelper.run` boundary. The
TypeScript and JavaScript checks, full `npm test`, qualification regressions,
and `git diff --check` pass.

2026-09-01 Cue Helper qualification-test coverage — the default `npm test`
contract lane now runs the strict synthetic Plan 23 qualification-record
validator and the mock observer regression, covering safe opacity, required
touch-control set, paired-evidence placeholders, self-capture consistency,
resource/latency fields, and lifecycle refusal cases. Both pass alongside the
native overlay contracts and device coordination tests.

2026-09-01 Cue Helper live queue integration — with the g56 explicitly
selected, a persisted `menu-check` job was claimed once by the queue runner,
completed against helper `10:0.1.9` and target `26:2.0.7`, reported
`TARGET_SUPPRESSION status=NOT_REQUESTED`, passed the authenticated
`FNAF2_MENU` check, and finished `DONE`; the runner then reported `QUEUE EMPTY`.
Capture was stopped immediately afterward. This was an image-free menu check,
not night or touch qualification.

2026-09-01 Cue Helper setup confirmation hardening — the image-free setup
wrapper no longer treats the landscape/off-screen `Stop video capture` button
as its only startup proof; it now confirms the helper package owns an active
`TYPE_SCREEN_CAPTURE` entry in `dumpsys media_projection`, retaining the named
button as a compatibility fallback. A live g56 menu probe passed after this
change (`helper=10:0.1.9`, `target=26:2.0.7`,
`TARGET_SUPPRESSION status=NOT_REQUESTED`), and safe stop returned
`Media Projection: null`. The prior false setup failure is discarded as
non-evidence. Setup parser coverage and the full `npm test` suite pass.

2026-09-01 Cue Helper independent-agent and lifecycle continuation — the
per-device lease regression now uses a real child process: a second independent
agent is refused with `DeviceBusy`, and terminating the owner releases the
kernel lease for the next agent. The queue-drainer regression likewise uses an
independent process and returns `QUEUE HOLD reason=queue-runner-busy` instead
of allowing two drainers to claim work. On the connected g56, a fresh image-free menu
probe kept the HUD hidden with
`gate=UNQUALIFIED(self-capture-unqualified)`;
force-stopping and restarting FNaF exercised focus loss/recovery, and the
capture stream reported the resulting display resize/aspect transition as
UNKNOWN without restoring the HUD. Safe capture stop left
`Media Projection: null`, no helper process, and FNaF foreground. No
game-control touch was sent. **Open:** P5 touch passthrough and paired HUD
off/on feedback qualification, plus P6 observe-only night evidence.

2026-09-01 Cue Helper project MCP, offline queue, and multi-agent lease — the
safe image-free
setup/menu/night checks are now exposed through a real newline-delimited stdio
MCP server (`tools/device/cue-helper-mcp.mjs`) with project configuration for
Claude Code and OpenCode. Codex requires a one-time `codex mcp add` because its
current launcher registry is user-scoped. Queue enqueue/list work without ADB;
queue run returns HOLD and preserves PENDING jobs for absent, locked, asleep, or
ambiguous devices. The server exposes no arbitrary shell, coordinates, HID, or
game-control operation. A kernel-released per-serial lease now serializes
direct setup and queue execution across independently launched agents, while a
queue-runner lock prevents competing drainers from claiming separate jobs, and
optional enqueue idempotency keys collapse duplicate agent retries; the
contention/recovery and MCP regressions pass.

2026-09-01 Cue Helper battery identity gate — the native flashlight-meter
detector now accepts a battery read only with positive `FNAF2_NIGHT` identity.
Overlay snapshots, authenticated `GET`, and the status card therefore cannot
reinterpret bright pixels at the same coordinates on the menu/helper as game
battery. The screen-scoped detector regression and rebuilt v3-signed APK pass.

2026-09-01 Cue Helper image-free setup protocol — `tools/device/cue-helper-setup.sh`
now resolves the installed target launcher/build, discovers helper and Android
projection controls through UIAutomator text/bounds, starts capture, launches
FNaF, and verifies `screen=FNAF2_MENU` through the authenticated socket. The
connected g56 cold-path run installed helper `10:0.1.9`, accepted projection
consent, passed the menu check, and reported `batteryPercent=UNKNOWN` with
`batteryReason=screen-identity`; no screenshot or game-control touch was used.
The optional `--probe` path is sensor-only and leaves the production gate
unqualified. The parser/allowlist regression passes.

2026-09-01 Cue Helper battery HUD and flicker fix — the shared native
watchlist now samples the four calibrated interior bars of the stock top-left
flashlight meter and reports a fail-closed `battery=OBSERVED` bar count and
coarse percentage through the snapshot/status path and debug badge. A new
bounded snapshot-retention layer keeps the last usable night monitor/camera/
ROI state through 350 ms UNKNOWN projection gaps, while confirmed menu/helper
identity clears immediately and decision cues are never retained. The debug
status badge is drawn without reserving annotation collision space. Host tests,
the full repository suite, the signed APK build, and the battery/retention
regressions pass. The qualification sampler now also retains parsed battery
percentage/reason fields beside monitor/camera state. Device installation and
a night-surface battery read remain to be verified because the phone transport
is currently offline.

2026-09-01 Cue Helper night-surface live check — with the exact FNaF 2 build
(`26:2.0.7`) running on the connected g56, a five-sample debug probe held one
overlay window per sample and remained
`UNQUALIFIED(self-capture-unqualified)`. The night surface reported
`monitor=false (anchors-down)` and correctly kept camera selection hidden as
`UNKNOWN (monitor-not-up)`; detector latency was 24–69 ms and update-to-draw
p50 was 10.82–11.12 ms. After disabling the probe, a three-sample HUD-off
trace reported `windows=0` and `state=READY` with the same fail-closed monitor
and camera facts. Traces are retained at
`captures/cue-helper/overlay-qualification-20260901/hud-probe-current-5.tsv`
and `hud-off-current-3.tsv`; neither is a production qualification record.
The helper was force-stopped afterward, leaving no active MediaProjection or
helper process and the target night activity foreground. No game-control
touches were sent; camera-up verification, touch passthrough, and the
self-capture gate remain open.

2026-09-01 Cue Helper shared-geometry hardening — the twelve camera-button
coordinates are now owned by `PixelWatch`; both the native camera detector and
the display overlay resolve them through that contract, so a same-named point
at foreign geometry refuses as `sensor-mismatch`. Android host tests, the full
repository suite (`npm test`), APK signing, and final device installation pass.
The post-install lifecycle check also force-stopped a stale helper projection
and confirmed no helper process/projection remains; rotation is restored to
`user_rotation=0`, `accelerometer_rotation=0`.

The host `CueHelperControlTransport` now also exposes the helper's explicit
`cameraSelected` fact and complete `cameraHighlights` set, but only for a fresh
snapshot whose monitor is observed up; stale, down, unknown, malformed, and
out-of-range values remain UNKNOWN. Stale reads use `read-stale`, while invalid
or untrusted reason text is reduced to `read-unavailable`, preserving the
camera-rule vocabulary. Adapter contract tests and the Android host suite pass
after this hardening.

The qualification sampler now asserts the same visibility rule in retained
telemetry: camera selection must be `UNKNOWN` with reason `monitor-not-up`
unless monitor state is `true`, and observed selections must be `cam:1` through
`cam:12`. The mock observer and contract suite pass.

The sampler also now rejects invalid monitor/camera enum values before writing
qualification evidence, making the retained trace itself a gate for the
monitor-up-only camera contract. The observer regression and adapter contract
suite pass after this addition.

2026-09-01 Cue Helper final-build control/status check — after the device
reconnected, the rebuilt signed APK was installed on the g56 (`0.1.9`), and
capture started through the helper UI with no audio receiver connected. The
exact FNaF 2 build (`26:2.0.7`) then reported `screen=FNAF2_MENU`,
`monitorUp=UNKNOWN`, and `cameraSelected=UNKNOWN`; the production HUD remained
`DISABLED(self-capture-unqualified)`. The helper was force-stopped afterward,
leaving no MediaProjection/HUD window and restoring portrait rotation
(`user_rotation=0`, `accelerometer_rotation=0`). No gameplay-control touches
were sent; touch passthrough and paired self-capture evidence remain open.

The same final-build check inspected the exact target package's requested
permissions: it declares no `HIDE_NON_SYSTEM_OVERLAY_WINDOWS` permission, so
the Android 12 target-suppression request is not present in this APK. This is
useful static evidence only; a night-surface overlay visibility check is still
required before marking target suppression PASS.

2026-09-01 Cue Helper monitor/camera HUD wiring and polish — the Android
renderer now consumes the calibrated `monitor-rule-v1` and
`camera-rule-v1` thresholds. On the recognized night surface it shows a compact
monitor UP/DOWN/UNKNOWN badge; office regions are gated to monitor-down, while
the camera feed/map regions appear only monitor-up and the unique highlighted
camera gets a bright active keyline and label. Camera selection is fail-closed
on missing, ambiguous, or multiple highlights. A profile-bound
`game-hud-map-v1` collision layer suppresses annotations over future calibrated
game HUD zones and avoids label overlap. Short smooth state transitions, custom
font rendering, corner keylines, and a restrained active-camera pulse add
visual polish without adding touch handling or changing sensor geometry. The
controller now gives transient UNKNOWN identity frames a 250 ms grace instead
of repeatedly tearing down/recreating the window. Host tests, unit tests, and
the signed APK build pass. The rebuilt APK was installed on the g56 and a live
observe-only check over the game menu returned `screen=FNAF2_MENU`,
`monitorUp=UNKNOWN`, `cameraSelected=UNKNOWN`, and a hidden overlay as
required. The capture was stopped and portrait rotation restored afterward;
no game-control touches were sent. Night/camera visual verification remains
part of the authorized touch matrix.

2026-09-01 Cue Helper UI probe — the rebuilt helper was installed on the
connected g56 and a read-only screenshot confirmed the bundled HUD font, compact
screen badge, state color treatment, and quiet double-keyline renderer over the
exact target build (`26:2.0.7`). A fresh five-sample debug probe passed with one
HUD window per sample, `overlay=PROBE`, production gate
`UNQUALIFIED(self-capture-unqualified)`, detector latency 28–52 ms, update-to-
draw p50 13.43–13.87 ms, and thermal status 0 at
`captures/cue-helper/overlay-qualification-20260901/hud-probe-ui-cleanup.tsv`.
Video capture was stopped afterward; the HUD/projection are absent and the
original device rotation (`user_rotation=0`, `accelerometer_rotation=0`) was
restored. No game-control touches were sent.

2026-09-01 Cue Helper debug HUD cleanup — the overlay now derives a screen
scope from the shared `PixelWatch` geometry: menu/helper/unknown frames show no
game-element annotations, recognized night frames show only established office
regions, and monitor-map regions stay hidden until a positive monitor-up fact
exists. Normal boxes no longer carry verbose age/latency labels; exceptional
states get short labels and the HUD uses the bundled CC0 HUD font, thicker
double-keyline frames, and screen/state color variations. Host contracts and a
signed APK build pass, and the rebuilt helper was installed on the connected
g56. No game-control touches were sent.

2026-09-01 Cue Helper self-capture probe — the debug APK now exposes an
explicit sensor/debug-only qualification probe. On the unlocked g56, the
exact FNaF 2 build (`26:2.0.7`) held a live MediaProjection while the target
was focused, and five probe samples passed at
`captures/cue-helper/overlay-qualification-20260901/hud-probe-unlocked-rerun.tsv`:
one HUD window, `overlay=PROBE`, fresh native watch values, detector latency
25–31 ms, update-to-draw p50 15.49–16.03 ms, draw-interval p50 about 50.3 ms,
two dropped frames, 0% sampled CPU delta, and thermal status 0. The production
gate remained `UNQUALIFIED(self-capture-unqualified)` throughout; the probe
cannot render decision cues or write a qualification sidecar. A second
application-context display lookup was fixed after the first probe exposed it,
and the observer now counts live window records instead of repeated diagnostic
title lines. Capture, the probe, and the target were force-stopped afterward;
MediaProjection and HUD windows are now absent. No game-control touches were
sent. **Open:** P5 touch passthrough and HUD-off/on feedback qualification, and
P6 observe-only run-mode evidence.

2026-09-01 Cue Helper overlay qualification continuation — the exact target
build is present on the connected g56 (`com.scottgames.fnaf2`, version
`26:2.0.7`), `SYSTEM_ALERT_WINDOW` is granted, and a fresh signed helper APK
was installed. Direct projection consent still starts capture with the audio
receiver disconnected; the helper observed `FNAF2_NIGHT` on a stable landscape
frame while retaining `gate=UNQUALIFIED(self-capture-unqualified)`. The real
HUD-off sampler was attempted, but the device's `com.nvt.cs` window repeatedly
took physical focus from FNaF, so the sampler correctly rejected the trace and
no qualification record or sidecar was created. The capture was stopped and
the device has zero active MediaProjection/HUD windows. **Open:** the same
device focus interference plus the remaining paired HUD-off/on, touch,
lifecycle, and observe-only evidence required by Plan 23 P5-P6.

The subsequent cleanup probe was also discarded: a helper scroll command was
issued after focus had unexpectedly moved to the target game, so it is not
treated as touch or qualification evidence. The helper and target were then
force-stopped.

The host contract audit also found and fixed an ordering bug in
`OverlayCueArbiter`: a lower-priority equal-priority action conflict could previously
clear a later higher-priority cue. Priority is now resolved before equal-level
conflicts, with unknown/menu identity cue-clear coverage; `test.sh`, the
signed APK build, and device reinstall pass.

The same audit hardened `OverlayController` lifecycle threading: attach,
detach, resize, target-visibility, and snapshot view updates now converge on
the main looper, and a queued attach refuses to run after capture has ended.
Host tests, signed build, reinstall, and `git diff --check` pass; the
self-capture qualification gate is unchanged.

After the g56 was unlocked, the qualification observer was corrected to read
the parent `dumpsys window` output; Android's `dumpsys window windows`
subcommand omitted the focus lines and caused false failures. The real HUD-off
phase then passed five focused samples on FNaF 2 `26:2.0.7`, retaining visual
sequence/age, detector latency, resource, thermal, and fail-closed overlay
fields at `captures/cue-helper/overlay-qualification-20260901/hud-off-g56.tsv`.
Capture was stopped afterward. The HUD-on phase remains intentionally
unrunnable until the real self-capture gate is qualified, so no sidecar was
installed.

The unlocked-device sampler was rerun and passed five focused samples at
`captures/cue-helper/overlay-qualification-20260901/hud-off-unlocked.tsv`,
again retaining exact target build `26:2.0.7`, live visual sequence and
detector latency, zero HUD windows, and the fail-closed state. The target-hidden
boundary was exercised by force-stopping FNaF: focus returned to Cue Helper and
the authenticated overlay query remained disabled. Restarting FNaF preserved
capture; force-stopping Cue Helper cleared MediaProjection to `null`. The game
was stopped for cleanup, and no game-control touches were sent.

2026-09-01 adaptive prediction coach plan — Plan 24 now follows Plan 23 with
state-conditioned prediction, recognition, timing, and strategy microtraining.
It preserves the stock-game HUD as non-interactive, freezes every question and
resolves it from later independent facts, censors ambiguous/interrupted cases,
and gates live prompts on conservative critical-event risk plus measured
prompt, cancellation, render, and human-recovery latency. The staged route is
offline/replay trainer -> adaptive skill model -> passive live mental pilot ->
separately qualified response port; recognition crops and counterfactual
strategy questions start offline. This is planning only: no activity gate,
exercise schema, skill model, prompt renderer, or response channel exists, and
no safety, training-benefit, or gameplay claim was produced. **Open:** Plan 24
P1-P6, after the relevant Plan 23 and belief/session contracts exist.

2026-09-01 Cue Helper overlay plan — Plan 23 now specifies a single
transparent, non-interactive HUD with shared sensor/display ROI geometry,
separate sensor-debug and decision-run modes, expiring fail-closed cues, and
device gates for Android 12 touch obscuring, target-requested overlay hiding,
MediaProjection self-capture, Android 15 service ordering, lifecycle, latency,
and resource interference. Code-scoped P1-P4, coalesced-update metrics, and a
strict fail-closed qualification sidecar/retained-record validator are now
implemented in the APK;
the default gate remains `self-capture-unqualified`, so no qualified HUD run
is being claimed. The accompanying architecture correction makes bridge,
sensor processor, reflex, and actuator deployable roles selected by
capability/profile contracts; an ESP32 may fill any supported combination or
be absent. The lossy 2026-08-30 phone/A2DP/ESP32/Wi-Fi-PCM/same-phone profile
remains rejected specifically, without banning bridge mode. Documentation
gates: `npm run test:unit` green (architecture boundaries + stable
references). **Open:** Plan 23 P5-P6 device qualification; no device or
gameplay claim was produced.

2026-09-01 monitorUp + cameraSelected calibration session (opencode) — both
visual facts are now calibrated on real g56 frames, the helper watch carries
the twelve measured map buttons, and the tap coordinates that were off are
corrected. Request: continue codex open item "(a) a monitorUp detector
calibrated from labeled frames"; Pedro then asked for the selected-camera
fact via "the yellow pixels and their positions on the fixed monitor map".
Read-only captures plus one helper APK reinstall (Pedro operated the phone;
the only machine actuation candidates were refuses — no game input was ever
sent). Outcome, in order:

1. **Whole-frame signatures were measured and then rejected.** A first
   design over the helper grid's whole-frame counts (grey cells + mean luma)
   fitted a two-axis rule, but Pedro pushed back correctly: the up class is
   bimodal by feed content (bright cameras grey 174–178/luma 45–50, dark
   feeds grey 180/luma 26–30), so the signature is a correlated proxy, not
   the state. The monitor map layout drawing — always present while the
   monitor is up, fixed while feeds pan — is the causal signal.
2. **Labeled corpus captured** (`captures/cue-helper/monitor-calibration-
   20260901/`, git-ignored): monitor down 10, monitor up 10 (two cameras),
   mask 10 (mask grey 169–173/luma 5–6 — inside the up band on grey, near
   black on luma, as ScreenStats warned), animation 12. One anchor search on
   those frames: 36 separating cells, margins up to 157.
3. **Helper extended, verdict-free.** `ScreenStats.meanLuma` (grid mean luma)
   is served as `gridLuma=` (darkness guard, never a classifier — measured
   camera/office luma bands overlap 3.8–63.1 vs 28.6–35.6); `PixelWatch.
   defaultSpec` gained twelve `camNN_button` PIXEL/YELLOWNESS entries at the
   measured button centres (selected button renders yellow ~194; fixed map,
   pan-proof). Host vectors updated; `test.sh` green; APK rebuilt
   (`build.sh`, signed) and installed with Pedro's go-ahead; watch
   `d82a2b0f4a5c94e370beb5c1bee850ccf47abacd4dd1388e73266dc421471bd1`
   activated live and verified by READ.
4. **monitorUp calibrated on anchors** (`models/monitor-rule-moto-g56-v207.
   json`, digest `d4b2f7bf…`, bound into the 100 ms profile
   `calibrations.monitorRule`): four present map anchors (cells 112/131/132/
   151, margins 16–72.5) plus two absent covered-office anchors (165/167,
   margins 40.5/78.5). Strict semantics: all anchors up-side → OBSERVED
   true, all firmly not-up → OBSERVED false, anything mixed/in-band →
   UNKNOWN. Corpus 30/30; animation reads 1 true (fully rendered), 1 false,
   10 UNKNOWN; `night-1-corpus` + `blackout-unproven` recorded. Pedro
   confirmed the top-left Night-1 tutorial region holds no selected anchors
   (margins already refused it); the bottom strip is control-bar chrome,
   causally sound. The earlier two-axis grey/luma grammar was replaced by
   these anchors before anything shipped.
5. **cameraSelected calibrated** (`models/camera-rule-moto-g56-v207.json`,
   `camera-rule-v1`, `packages/adapters/src/camera-rule.js`): twelve button
   pixels, exactly-one-lit names the camera, `no-camera-highlight` /
   `multiple-camera-highlight` are distinct UNKNOWNs so a transition and the
   Android double-camera glitch stay separable, in-band → `ambiguous-
   threshold`, gate `monitor-not-up` otherwise. Corpus 39/39 named (cam08
   twice across a night reset). Live READ on CAM 11 while winding: dimmed
   selected state 96 (≈50% alpha blend of the 194 fill), steady; CAM 12
   unwound: 193; unselected −19..−9 — the dimmed state is inside cam11's
   fitted lit band (margin 52.5). Runtime wiring now carries both the singular
   fact and complete highlighted set through the live observation loop;
   physical qualification remains open.
6. **Tap coordinates corrected from the same captures** (both g56 profiles,
   geometry binding bumped to `moto-g56-fnaf2-default-controls-v2`):
   cam:4 → (1728,690), cam:7 → (1776,606), cam:9 → (2144,548),
   cam:10 → (1984,716) (was 61 px off-center), cam:11 → (2228,652) (was 47 px
   off, below the button), wind → (500,888) (was 85 px off; the pressed
   wind fill is lime 149 vs unpressed −19 at pixels ~(584–592, 810–862) — a
   windHeld verification pixel for the next watch rebuild). The seven
   cameras outside the control vocabulary have measured centres recorded in
   the session captures; adding cam:1..3/5/6/8/12 to the semantic control
   vocabulary is a separate core-contract change, not done here.
7. **Capture-process lessons recorded:** the pose session kept a night
   running until the marionette killed it (music box unwound) — a burst
   started after that caught only menu screens; Pedro reset to Night 1 and
   the per-camera protocol used operator confirmations as labels (no timing
   cadence required). Camera pan behavior (07–12 pan; map stays fixed) is
   operator-stated and must be sourced from the dump later.
   Gates: `npm test` green (monitor + camera rule lanes added; 191/191
   sourced rules), typechecks green, docs 253 tools indexed, Java host tests
   green, Python calibration suites green, `npm run device:dry-run` PASS,
   evidence `run-20260901060804-acf5ca2a-4e4c57` (`FIXTURE`).
   **Open:** (a) profile `calibrations.cameraRule` digest binding, the
   windHeld pixel and any other additions on the next APK rebuild;
   monitorUp/cameraSelected qualification runs on the g56 (they are
   calibrated, unqualified); (b) device-local executor, (c) 100 ms Night 6
   qualification, (d) 17 ms qualification, the BB-left model gap, the
   deferred census/geometry search, and later-night re-validation of both
   rules (corpus is Night 1) are unchanged. A send is not game acceptance.
2026-09-01 device + Plan 22 session (codex `01a05a9b`) — the Night 6 winner
was **not** run live; the session became an exact-geometry gate plus a Plan 22
device-boundary build after two legacy phone attempts desynced. Request: "run
the simulator winner Night 6 plan on the connected phone" (moto g56 5G).
Outcome, in order:

1. **The pre-existing 133/100 emit note was not acted on.** The prior opencode
   "emit session" block (below, retained) proposed restoring `DEVICE_SPACING_MS`
   133 / `SWEEP_SELECT_MS` 100 and emitted `artifacts/n6-minus7-3000-20260831`.
   That rollback was **rejected this session** (Pedro: the g56 is proven at
   33 ms contact / 100 ms spacing). Source defaults stay `MIN_CONTACT_MS` /
   `SWEEP_SELECT_MS` 33, `DEVICE_SPACING_MS` 100, `LA_SELECT_MS` /
   `LA_SETTLE_MS` 17 (`tools/device/recipe.mjs`). The `n6-minus7-3000-20260831`
   bundle is superseded; its engine hash is stale against current source.
2. **Exact-geometry admission (`22340f7`, `38755f5`).**
   `tools/minus7/geometrysearch.mjs` gained an exact mode — geometry candidates
   replay directly through the exact simulator with no `modelGate`, jitter, or
   human gate; admission requires **3000/3000 ordinary + 3000/3000
   pinned-worst**. Tap contact is now a fourth geometry axis
   (`slot:spacing:sweep-contact:tap-contact`); wind / hall / 133 ms Foxy-reset
   holds stay long. Model-only winners (both cohorts 3000/3000): `50:66:33`,
   `50:66:17`, `50:66:17:17`, `100:133:100:33`. Losers: old `120:100:33`
   (0/100), literal all-100 `100:133:100:100` (11/3000). Bundles retained under
   `artifacts/n6-minus7-exact-3000-*` (session-scoped, uncommitted); all
   `MODEL_ONLY`, Plan 12 promotion untouched.
3. **Two legacy phone attempts, both desynced — no winning claim.**
   `legacy-trial.sh` (`FNAF2_LEGACY_TRIAL=1`) is the only live-capable path;
   `trial.sh --artifact` is dry-run-only.
   - `50:66:33`: ~2 min on Night 6, then a Withered Bonnie blackout. A monitor
     press at **62.44 s** did not toggle; from there controller and game were
     inverted, camera taps panned the office, the fixed classifier ROI drifted,
     and the safety gate aborted.
   - `100:133:100:33`: desync at **22.5 s**, caught at 27.2 s, two recoveries,
     aborted at 59 s on five unclassifiable left-view frames. `sweepcheck`
     read 9/9 but CAM 07 was dark on sweeps 1–5 and 9.
   - Diagnosis: the legacy simultaneous select+light sweep commits the camera
     on release, so much of the pulse lands on the previous feed; the opening
     **CAM 07** flash (the Withered Bonnie chokepoint) does not light, Bonnie
     escapes, his office approach forces the monitor down, and the blind toggle
     re-raises it → the observed desync. 100 ms contact did not fix it; 17 ms
     would worsen it. Retained as actuator evidence the simulator does not model.
4. **Plan 22 device boundary rebuilt so the fix is not in legacy.**
   - `6b14698` state-conditioned handoff: the `apps/device` service targets
     verified monitor UP/DOWN instead of toggle parity, needs two agreeing
     observations before any camera action, does one bounded
     forcedown-revocation retry then aborts safe, and keeps camera-light vs
     office-hall coordinates distinct. Separate `hid-mediaprojection.json` /
     `hid-mediaprojection-17ms.json` profiles — neither inherits the other's
     qualification. The compiled Night 6 artifact lowers to 24
     state-conditioned blocks with explicit per-row UP/DOWN invariants.
   - `3ab8ef3` transport composition: HID report/coordinate encoding and
     authenticated cue-helper framing moved under `@fnaf2-1020/adapters`
     (`packages/adapters/src/transports/{hid,cue-helper}.js`); `apps/device` is
     the sole composition root through injected ports (`modern-composition.js`),
     refuses non-HID/MediaProjection profiles, infers no timing or coordinates;
     catalogs regenerated. The composed port reports monitor state `UNKNOWN`
     until the helper exposes a qualified signal (fail-closed).
   - `81c92ff` legacy map: 36-entry
     `docs/architecture/generated/legacy-paths.json` (lifecycle / owner /
     replacement / removal gate each), expanded `COMPATIBILITY.md`, stale-path
     checks in `architecture-test.js`.
   - `f373f80` artifact executor boundary: `apps/device/src/artifact-executor.js`;
     the live lane requires a persisted, hashed `artifact.json` emitted with the
     bundle, carrying only semantic blocks + profile/winner/model/plan hashes +
     safety limits — the strategy parser stays on the offline build side. The
     runner rejects strategy/legacy transport fields and aborts/releases the
     injected port on failure.
   All six commits (`22340f7`..`f373f80`) are pushed to `origin/refactor`.
   `npm test` green; `npm run device:dry-run` PASS, evidence
   `run-20260901032451-a1433162-4e4c57` (`FIXTURE`). One process slip: the
   legacy `tools/device/preflight.sh` was invoked once during a readiness check
   (no input sent), flagged, and stopped.
   **Open:** the live Night 6 run is still not done. The modern path stays
   fail-closed pending (a) a helper-emitted native `monitorUp` detector
   calibrated from labeled frames (animation / blackout / stale → UNKNOWN),
   (b) a device-local executor under the adapter boundary consuming only hashed
   semantic blocks, (c) an independent 100 ms qualification run with the g56 on
   Night 6 (it was on Night 5 Continue), then (d) a separate 17 ms
   qualification. `runtime-gh.scm` BB-left model is absent from the modern
   path. All geometry winners are `MODEL_ONLY`. The 2026-08-31 all-strategy
   3000-seed census and geometry search remain deferred. A send is not game
   acceptance.

2026-09-01 emit session (prior, opencode — superseded by the session above;
its point 2 geometry restoration was proposed, not adopted) — Night 6 winner
emitted at 3000-seed 100%, and the red emit lane repaired at its cause.
Request: emit a Night 6 plan that clears 3000 simulator seeds at 100%.
Findings, in order:

1. **The emit lane was red at HEAD (`89aac30`).** The emitted Night 6 plan
   replayed **0/100** in the repo's own matrix — every seed a Toy Freddy
   inside-office death at ~3:24 AM — nights 2/3/5 also failed, and the
   `testdata/n6-device-plan.txt` pin was stale. `git bisect` against a
   build→devicePlan→replay 20-seed oracle names **`8320677`** as the first bad
   commit: it adopted the Perfetto-measured 100 ms/33 ms LIGHT_AFTER sweep
   geometry as the *default* and shortened `replay()`'s per-slot light hold to
   the 33 ms tap floor. At that geometry Toy Freddy (route 9→10→blindA→blindB,
   `entryGate camsUp`, blackout kind) escapes the CAM 10 light hold and
   completes the sourced 40-frame office sequence in 99/100 seeds. The
   in-process pilot still passed 200/200, which is why the fast lanes stayed
   green while the emit path was dead.
2. **Restored the gate-clean geometry** (uncommitted): `DEVICE_SPACING_MS`
   133 / `SWEEP_SELECT_MS` 100 (the phone-proven shipped actuator; the
   measured 100/33 numbers stay reachable via `devicePlan` overrides with the
   standing LIGHT_AFTER caveat), `replay()`'s non-LA sweep light hold back to
   the select's own contact, and the sweep end anchored to `SWEEP_SELECT_MS`
   (the floor change had eroded the attack raise margin by 67 ms; the
   input-gaps gate caught it). Re-pinned `testdata/n6-device-plan.txt`;
   updated `test-recipe.mjs`/`test-runner-plan.mjs` to the restored contract.
   **Night matrix green again: every night 100/100 exact**, and the ±60 ms
   human ladder reproduces the recorded numbers exactly (n1 100, n2 66.3,
   n3 79.3, n4 73.8, n5 62.0, n6 54.0). `npm test` green.
3. **The 3000-seed gate**: the emitted Night 6 plan (`build` defaults =
   the `hidpilot n6 target` route, bundle replay semantics) replays
   **3000/3000 ordinary and 3000/3000 pinned-worst, 0 missed BB states, no
   deaths** (per-seed results retained at `/tmp/opencode/gate-ord.json` /
   `gate-worst.json`; session-scoped, not committed).
   `winner-v1` → `device-bundle-v1` via `device:emit`:
   **`artifacts/n6-minus7-3000-20260831`** (engineHash `e2fdd934595adc10`,
   bounded replay `fnv1a-9f1b7cf6`, 8/8, gate `PASS` at `MODEL_ONLY`).
   `trial.sh --artifact … --dry-run`: READY + replay PASS;
   `npm run device:dry-run`: PASS, evidence `run-20260901002838-86d68984-4e4c57`.
   The connected phone was never touched. Lateness/desync instrumentation is
   armed for the eventual live run (`DEVICE_EPOCH_LATCH=1` default,
   `HID_TRACE_RUN=1` + `desync-scan.py` + `grade-run.sh` opt-in).
   **Open:** live device qualification (refused until an operator injects a
   real `DEVICE_MEASURED` transport; a send is not game acceptance); the
   3000-seed claim is `MODEL_ONLY` and Plan 12 promotion is untouched; the
   2026-08-31 directives (all-strategy 3000-seed census, geometry search) are
   deferred — note the geometry landscape changed with the restoration and any
   search must re-base on the current 33/100 default — the 133/100 rollback
   was not adopted (see the 2026-09-01 device + Plan 22 session above).

**Plan 22 architecture refactor (active branch `refactor`, foundation/phase 1):** workspace/core
boundaries, contract validators and register/spec catalog, trainer move,
runtime/device service, fixture/transport adapter registry, screencheck package,
research experiment primitive, evidence CLI, generated catalogs, portal, and
CI fast lanes are implemented in the worktree. The legacy shell runner is now
explicitly `tools/device/legacy-trial.sh`; `tools/device/trial.sh` is a short
facade. Remaining Plan 22 work is live hardware qualification and broader
research campaigns beyond the checked-in reference cases. The root `src` and
native screencheck shims are removed; the remaining legacy device runner is
explicitly named and isolated. Fixture and model outputs remain capped at
`FIXTURE`/`MODEL_ONLY`.

2026-08-31 foundation audit: `npm ci`, TypeScript-shape typecheck, unit/contract/
core lanes, catalog and documentation-link checks, native screencheck, trial
assembly, device dry-run, research model-smoke, and all five browser checks
pass. The CLI correctly refuses live qualification until an operator injects a
real `DEVICE_MEASURED` transport. The full legacy engine lane remains an
explicit diagnostic command; its known red vent-reactive scientific gate is
not folded into the green edit lane. This is not a P0–P9 completion claim;
the current closure matrix is [plans/22-STATUS.md](22-STATUS.md).

2026-08-31 architecture follow-up: the four former test-named pilot modules
 now live under `tools/model/` with descriptive names, and all production and
 research imports point at those canonical model modules. Plan-16 searches
 pass frozen knob assignments through each build instead of mutating a shared
 `SEARCH_KNOBS` object. Adapter profile resolution now binds detector input
 formats and matching visual/detector calibration IDs, with refusal fixtures
 for both mismatch classes. Fast tests and regenerated catalogs remain green;
 `test:affected` now selects deterministic package-local gates from the diff,
 and research/evidence bundles verify their retained hashes before retrieval.
 Live qualification and broader research campaigns remain external/open gates.

2026-08-31 runtime/evidence follow-up: the scheduler now waits on an injected
monotonic clock, refuses expired deadlines, requires an observed sensor/detector
measurement in live mode, and runs mandatory abort/release cleanup. Live
adapters cannot obtain `DEVICE_MEASURED` from transport self-report; they need
an explicit qualification with evidence. `npm run typecheck` now runs strict TS
and a checked-JavaScript source lane. Research replay reruns the retained spec
and compares its result hash; evidence promotion now invokes a Plan 12 gate and
refuses MODEL_ONLY/fixture bundles. The check runner streams child output with
bounded concurrency and per-test watchdogs. These changes improve the phase-1
foundation but do not close P0/P5/P6/P8/P9.

**Overall:** **35%** — 47 of 133 mandatory top-level work packages are closed.
(2026-08-27: Plan 16 resolved — pkgs 1–3 were built in prior commits but the
dashboard row was never updated off the plan's own `(done)` markers; pkgs 4 and
5 closed by recorded negative in `740f5b0` / `4e7abce`; pkg 6 dropped (95 → 94
mandatory) — a dependency report needs a promoted candidate and there is none.)
2026-08-28: Plan 18 adds nine mandatory tooling packages (104 → 113); the
numerator is unchanged, so overall falls 33% → 30%, the honest direction.
2026-08-29: Plans 19 and 20 add thirteen mandatory packages (113 → 126); Plan 19
package 1 lands the same day (`6bfbc39`), so the numerator moves to 35 and
overall falls 30% → 28%.
2026-08-30: Plan 19 packages 2–3, Plan 20 package 1, and Plan 21 package 1
are implemented and checked in the worktree; the numerator moves to 38 and
the rounded overall to 29%.
2026-08-30: Plan 21 (proposed 2026-08-29) is counted with its seven mandatory
packages (126 → 133); none closed yet, so the numerator stays 35 and overall
falls 28% → 26%.
2026-08-30: Plan 20 package 2 and Plan 21 package 2 are now closed by seeded
exact-engine comparisons: the reduced controller model matches visible
control/resource traces, and the finite Night 1 policy interpreter matches
the device schedule and reaches the same Sim terminal state; numerator 40,
rounded overall 30%.
2026-08-30: Plan 20 packages 3–4 and Plan 21 packages 3 and 5 are now closed
by phone-free fault/constraint/equivalence gates. The estimator preserves
delayed timing and fails closed on stale/conflicting controls; the finite cycle
gate requires exact proof; the policy grammar rejects illegal orderings; and
the Minimal IR/device/mock-phone traces match, including all three Night 1
defect controls. Numerator 44, rounded overall 33%. Plan 20 package 5 remains
open because the selector's survival comparison and oracle/disabled controls
are not yet implemented.
2026-08-30: Plan 21 package 4 is now closed for the initial Minimal target: an
explicit mutation campaign persists a positive control, known negatives,
device/equivalence/exact-engine gates, Pareto frontier, and dependency records.
The broader invention campaign and device execution packages remain open.
Numerator 45, rounded overall 34%.
2026-08-30: Plan 21 package 6's initial safe-execution contract is now closed
for the Minimal target: the runner consumes a canonical IR-derived artifact,
retains policy and plan hashes in the manifest, verifies the pushed plan bytes
on-device, and leaves post-run grading explicitly opt-in. Physical device
evidence and family ports remain open. Numerator 46, rounded overall 35%.
2026-08-30: Plan 20 package 5 is now closed by a bounded exact-engine
comparison: the belief-backed controller beats the observation-disabled
control, the delayed/dropped stress result remains below the truth-state upper
bound, and the production controller contains no engine read. Full-night
survival and hardware transport remain open. Numerator 47, rounded overall 35%.
2026-08-30: The story-Night-2 observe-only device run (`n2-reactive-observe-20260830`)
ended in a captured post-night title after about 190.5 s of positively observed
HUD time. The operator attributed the death to Foxy; the machine manifest keeps
the outcome `aborted`/cause unknown because the baseline lifecycle path did not
yet name the jumpscare. The native watch trace retained 2443 reads (2329
observed, 114 UNKNOWN: 86 frame-stale and 28 aspect-mismatch). This is baseline
evidence only: no live reactive action or promotion claim follows from it.
2026-08-30: Plan 18 Package 5's host/capture foundation landed: the
`atrace-input.sh` wrapper, phone-free `inputtrace.py` parser, optional
SurfaceFlinger-latency cross-check, `grade-run.sh` integration, and coverage
gate are in place. Three direct-HID Continue/Night 2 probes produced valid
traces but no app MotionEvent rows; the parser correctly reports `NO APP
EVENTS`, so the positive 2026-08-28 trace still needs to be reproduced before
the package can close.
2026-08-30: Plan 18 Package 4's bounded property foundation landed in
`tools/propertytest.mjs`: a dependency-free 64-seed campaign now checks
snapshot/restore identity and continuation, same-seed event determinism, and
Night-1 exclusion of Balloon Boy with bounded seed shrinking. The broader
property campaign remains open.
2026-08-30: Plan 18 Package 3's statistical foundation landed in
`tools/stat.mjs` and `tools/stat.py`: Wilson intervals, required-N planning,
two-proportion tests, and explicit PASS/FAIL/INCONCLUSIVE verdicts are now
cross-checked by `tools/test-stat.mjs`. `human-gate.mjs` and the night matrix
print intervals and refuse a straddling sample. The current 1200-seed ladder
is n1 **100.0% [99.7%, 100.0%]**, n2 **66.3% [63.6%, 69.0%]**, n3
**79.3% [76.9%, 81.4%]**, n4 **73.8% [71.3%, 76.2%]**, n5
**62.0% [59.2%, 64.7%]**, and n6 **54.0% [51.2%, 56.8%]** (95% Wilson;
all n=1200). The other assertion CLIs and historical quotations remain to
be migrated.

**Expanded stock-device roadmap (Plans 09–15):** **7%** — 3 of 44 mandatory
packages are closed.

## Very next step

### 2026-08-30 directive — LOCK: reactive handling is the top priority (Pedro)

**"This project has stalled on delivering the reactive handling for far too
long, I want it at the highest priority."** The BB-first detect-and-react
chain is the campaign's deliverable; Mangle's audio-static response is now
modeled, while device occupancy evidence remains open.
It is ahead of the winding-tick experiment and the Night 2 pilot. Build order,
acting on all three fronts the bench allows:

1. **Engine-side reactive policy — implemented, with a red release gate (2026-08-30).**
   `VentThreatReactive` (`src/controller.js`) + the `bbVent` audio fact
   (`src/observer.js`, A2DP-latency model) + `reactiveBB` wired in
   `minus-toys-plan.mjs`, gated by `tools/ventreacttest.mjs`. Cue taxonomy is
   the owner's play: laughs = belief, first thud = pending/prepare, the
   thud+21 arrival pair = evict with priority; pre-mask hall pulse pays the
   Foxy D bill. Coverage gate: the scheduled mask window contains five tick
   boundaries when phase holds (free eviction), so the controller can stand by
   when coverage is proven and intervene only on an uncovered/ambiguous
   interval. The timing, stale-cue, UNKNOWN, endpoint, and intent
   transaction defects are covered by focused checks. The survival claims
   remain a failing `--assert` gate until rescue cost and phase estimation are
   separately priced; the mixed ensemble is not phase-only evidence. Full
   record: `plans/21` "First seed facts" + "A2DP phase-clock estimator".
2. **Phase-clock estimator = the critical path.** Specification landed
   (`plans/21` "The A2DP phase-clock estimator — specification"):
   latency-calibrated multi-tick estimator behind BlueALSA, lock states,
   500 ms parity anchoring, correction protocol, proof ladder (oracle →
   wrong-phase control → estimated clock → re-anchoring → measure). Feeds
   from the real continuous-wind capture (the open 2 Hz-grid item). **Host
   integration landed 2026-08-30:** `WindTickFactAdapter` accepts only
   timestamp-ordered observed wind-tick facts, and the BlueALSA recorder now
   has a read-only `--check` route gate that returns UNKNOWN while the phone is
   disconnected. No detector, latency calibration, parity, or live action is
   implied by this phone-free slice.
3. **Observe-only instrumented run** feeds the detector corpus and drift
   measurement; **live reaction** only after detector proof (22/22-thud
   controls) and priced reactive presses (human-gate rule).

The winding-tick experiment and Night 2 pilot follow; the 2026-08-30 "Night 2
model pricing" block below remains the number set this builds against.

### 2026-08-30 directive — LOCK: Night 2 work (Pedro)

The campaign's active workstream is the **story Night 2 automated pilot**. The
model side is priced and recorded — `MINUS-3-STRATEGY.md` §3 "Story-Night-2
pricing, decomposed": the existing 10 s shape gates 200/200 (no-split control
177/200), the calibrated ensemble is 237/600 with a **Puppet-dominant census**
(puppet:232 / BBin:foxy:73), the phase basin is 66 ms, and the arm miss is
fatal (0/24 on miss epochs). Device order, in sequence:

1. **Arm-verify's first hardware run** — the pending Night 1 `--minimal`
   re-run (`trial.sh DEVICE_POLICY=minus-toys MINUS_TOYS_VARIANT=minimal`;
   g56 re-plug needed) is step zero of *this* workstream: it validates the
   `#arm-verify`/`cam11lit.py` re-arm machinery Night 2 inherits, and the
   halt-file abort protects the save cursor Night 2 needs. Expecting an armed
   split or a named arm-verify abort inside the 2 AM idle window.
2. **Night 2 device run of the gated shape** (`minus-toys-plan.mjs
   --night=2`, `HID_TRACE_RUN=1`, cue-helper video, AM-digit + camtrace
   instruments) — it doubles as the drift-under-load test that decides
   whether the 237/600 ensemble is real or pessimistic (calib-01 measured
   no drift on a no-churn night).
3. **If drift is real:** the lever is dense wind-phase re-anchoring — the
   A2DP winding-tick phase clock (flagship path), starting from the open
   2 Hz-grid item (scripted continuous wind + timestamped capture).
   BB/Mangle vent sensing is second-order (12% of ensemble deaths) and
   follows it. Foxy stays scheduled, not sensed (§9).

This supersedes the blocks below as campaign priority; the 2026-08-28 reset's
ranked frontier and the active tracks (plans 05/17) are unchanged.

### 2026-08-28 strategic reset — this is not a dead end

**Pedro's second strategic directive (2026-08-28): two dormant paths are active
again.** Plan 05 reopens novel-strategy invention now that the simulation and search
methodologies are sufficiently sourced; its old static-cover negative remains
closed evidence, not the boundary of the new search. Plan 17 opens a laser-focused
campaign to bake the bot into an APK by every technically distinct same-process
route worth falsifying. The measured PAIRIP re-sign failure is a route result, not a
blanket stop. These are durable tracks alongside the ranked near-term frontier
below, not permission to relabel another Minus 7 timing permutation as novelty.

The 2026-08-27 conclusion below is narrow: plan 16 exhausted timing changes to
the **emitted Minus 7 device plan under the synthetic human gate**. It did not
exhaust the Android strategy space, and it did not show that the exact machine
route is impossible. Do not begin the next session by searching another Minus 7
sweep knob. Start from this ranked frontier instead:

### 2026-08-29 device session — two results that move the frontier

**1. No measurable drift, zero desync (`n1-minustoys-calib-01`).** First device
run of `minus-toys-plan.mjs --night=1` on the g56. The split-camera glitch armed
and **held the entire ~5 min pilot** (CAM 09 co-lit 99.5 %, 0/31 monitor-up
windows failed) — deliberate arming persisting through a full run, past the
one-shot `n2-doublecam-hid-0003`. `desync-scan.py`: **zero desync** over ~30
cycles. AM-digit hours **69.99 / 70.04 / 70.00 s** vs nominal 70.000; map cycle
9.99949 ± 0.00086 s vs scheduled 10.000 (−51 ± 86 ppm). **The −184 ms/min drift
that refuted open-loop Minus Toys (`n2-minustoys-0117`) did not reproduce.**
Either it was a `n2-…-0117` artifact (→ open-loop is back on the table, §3 needs
a caveat) or it only shows under load (Night 1 has no forcedowns/mask churn).
**Next: a Night 5 or 7 run with the same instrumentation, observing only, to
grade drift+desync under a schedule that stresses the monitor.** Full record:
`MINUS-3-STRATEGY.md` §9 "The calibration run happened".

**1b. The `--minimal` split arm is non-deterministic on device — and a missed
arm is a guaranteed Puppet death (2026-08-29).** Two full back-to-back runs of
`minus-toys-plan.mjs --night=1 --minimal` from a byte-identical emitted opening:
`-r2` armed the split (feed = *Prize Corner*, box 100 % all run, ALIVE ≥ 360 s),
`-r3` did **not** arm (feed stayed *Show Stage*, only CAM 09 lit, no wind
button) and **died to the Puppet at ~4 AM** — you cannot wind the box from
CAM 09, so the per-cycle 4400 ms `hold wind` was inert. The CAM 09 light held
the Toys off the player mask-less for 2+ hours (whether all three stayed on
stage is not legible — Toy Bonnie is not clearly on the Show Stage). The arm is
a coin flip on the 33 ms opening taps (armed on calib-01 + r2, missed on
r1 + r3); the model's 200/200 gate assumes it always lands. `--minimal` has no
defensive churn to catch the miss.

> **Mechanism corrected later the same day — it is sampler phase, not contact
> length.** The "hold the arm taps to ≥100 ms" first fix below was stale-era
> reasoning (Pedro: the 100 ms floor is from before the g56 proved 33 ms
> contacts register on every touch control). The real mechanism, now modelled:
> the arm's CAM 09 touch → monitor drop gap is **3 frames wide**, and g263
> samples `lastViewed` only on `f % LAST_VIEW_SAMPLE_FRAMES === 0` while cams
> are up (engine.js) — at 3 of 12 schedule/game phase alignments a tick falls
> inside that window, samples `viewing=9`, and the raise writes `viewing=9`:
> exactly r3. `minus-toys-plan.mjs --phasegate` measures it (epochs +7f/+8f/+9f
> miss, perfectly bimodal, P(miss) = 3/12 per attempt); the deterministic gate
> stays blind because it replays at one fixed phase. No static same-slot
> geometry reaches 12/12 (1 frame needs overlapping contacts = the measured
> drag defect), so the fix is runner-side.

**Landed 2026-08-29 (late), pending only the device re-run:**
`emitPlan --minimal` emits `#arm-verify 1`; after the opening raise the driver
opens an arm-verify window and `trial.sh watch_arm_verify` photographs the
raised monitor, classifies the **CAM 11 map button** with
`tools/device/cam11lit.py` (lit ⇔ `viewing===11` via g46-57; lit 228.0–229.7 vs
unlit 110.2–111.8 green across the r2/r3 recordings, office 34 / menu 16 as
never-lit controls; unknown band between — a weird frame re-reads, never votes
"armed"), touches `rearm` on a miss (the driver re-runs the opening camera rows
as one macro, skip=1 — no leading monitor tap) and aborts via `armfail` →
driver exit 50 after 3 misses: the run ends **named, before the guaranteed
Puppet death**, instead of two hours later. The save-wipe hazard is closed the
same way: `stop_remote_driver` touches `halt` (one adb round trip) before its
slow force-stop/kill path, and the driver checks it at every macro boundary in
both loops — residual exposure is at most the in-flight macro, not ~7 s of
pressing into the death menu. Pinned by `test-minus-toys-plan.mjs` (phase
table), `test-cam11lit.sh` (fixtures + controls), and `test-plan-interpreter.sh`
(re-arm skip=1, armwin consumed, exit 50).
**PASSED Night 1 on the phone, 2026-08-30 (`n1-minustoys-armverify-20260830`).**
The fixed `--minimal` pilot ran the full story night: 44/44 cycles, terminal
CAM 09 proof at 359.8 s, monitor down at 360 s, hands-off observe to 420 s.
`grade-run.sh` verdict: every instrument passed — office idle 7.5→124.5 s, the
CAM 11 feed continuous **124.67→367.92 s** (the split armed and held the entire
night), office 368→428 s with **no death static anywhere in 427.9 s**, 51
contacts all scheduled, 0 desync overhead, 0 wasted inputs. Instruments'
`TERMINAL: unknown` (the recording ends at 427.9 s and no instrument can see a
6 AM card — plan 13 pkg 3); the game's own statement closes it: **the save
cursor advanced to Night 2** (operator-observed; my junk 1-cycle probe then
pressed Continue and got Night 2). First completed story-night pass of the
glitch-based family on the device. Two caveats, honestly: (1) n=1, and the arm
landed first-try — the verify chain never had to re-arm, so re-arm/exit-50
remain unproven live; (2) the live arm-verify telemetry is still **unproven**:
the run armed and held but left no verify event, and the manifest could not
say why — fixed the same day (driver logs the window opening;
`watch_arm_verify` records `watcher-started`, every attempt verdict, and an
`arm-window-never-opened` fault on timeout — a verify that can be silent is
the r3 "reads as coverage" lesson again). **Next: nothing to do on Night 1 —
the save sits on Night 2 and Pedro parked it (2026-08-30); `--minimal` is
Night-1-only, so the verify chain's first live firing waits for the next
natural Night 1 run.** The junk probe run is `n1-minustoys-armprobe-20260830`
(aborted ~25 s, started Night 2 by accident — it is also what confirmed the
advanced cursor). Full record: `MINUS-3-STRATEGY.md`
§9 "The `--minimal` plan run twice".

**2. Direct on-device audio capture is dead without root — but the A2DP
external mix carries the cues (2026-08-29).** The winding tick and every discrete `Play sample`
cue (BB's laughs, samples 21/23/24) is a SoundPool track on the g56's
`AUDIO_OUTPUT_FLAG_FAST` mixer, a separate HAL stream `AudioPlaybackCapture`
never taps (ear + matched filter + `dumpsys media.audio_flinger`). `setprop
af.fast_track_multiplier 0` is **denied on the user build**, so `plans/08`'s
*on-device* `AudioPlaybackCapture` premise stays blocked. **However:** the
Bluetooth encoder sits downstream of the full HAL mix, so an **A2DP sink on a
Linux box captures the fast-mixer SFX.** Validated 2026-08-29 —
`phone → aptX HD → BlueALSA → bluealsa-cli open` (PipeWire's own BT receive path
is broken on this host; BlueALSA with `bluealsa-aplay`+WirePlumber stopped is
the working one). Matched filter of `res/raw/s0033.wav` ('WinD') vs a wound-box
capture: **max NC 0.56 while winding** vs 0.09–0.15 not-winding vs **0.045 on
the on-device capture** — the tick is there. Open: the 2 Hz phase grid did not
resolve in one hand-wound take (needs a scripted continuous wind + timestamped
capture); and A2DP suspends on true silence (resume gap after every silent
stretch). This unblocks **offline detector proofing** and is a live path to the
winding-tick phase clock. Full record: `ANDROID-AUDIO-CAPTURE.md`
§"Discrete SFX are on the fast mixer" and §"The A2DP mix DOES carry the
fast-mixer SFX".

   **Runtime target updated 2026-08-30 (Pedro): phone + ESP32, with no PC in
   the live loop.** BlueALSA remains the validated capture proof and optional
   calibration/offline diagnostic. At runtime the phone sends the game mix by
   A2DP to `FNAF2 Audio Consumer`; the ESP32's local decoded-PCM callback sends
   sequenced/timestamped PCM back over its `FNAF2-AUDIO` Wi-Fi AP on UDP 49710;
   the Cue Helper on that same phone analyzes, records, and optionally monitors
   it through the built-in speaker. The callback itself crosses no device
   boundary — Wi-Fi is the required return leg. No exact public precedent for
   this same-phone loop was located, though every individual leg has precedent;
   see `ANDROID-AUDIO-CAPTURE.md` §"Phone → ESP32 → same-phone loopback".
   Receiver-specific calibration remains mandatory. First consumer: Night 2's
   vent-stage BB/Mangle tracking (`MINUS-3-STRATEGY.md` §9 "Night 2 detection
   scoping"). Open items unchanged: the 2 Hz grid needs a scripted continuous
   wind, and any absolute-time anchor must expect A2DP's silence-suspend resume
   gap plus measured ESP32 Bluetooth/Wi-Fi coexistence jitter.

**Night 2 model pricing (2026-08-30): the existing 10 s shape gates clean on
the story table, and its binding failure is the Puppet, not BB.**
`minus-toys-plan.mjs --night=2 --gate`: 200/200 + 100/100 worst, no-split
control **177/200** (weak story AI — the split buys margin, not
survival-in-model). Ensemble: 237/600, census puppet:232 / BBin:foxy:73 /
inside-office:54; AM re-anchor 263/600; phase basin 66 ms; arm-miss epochs
0/24 — `#arm-verify` is mandatory on Night 2. So the Night 2 open-loop lever
is dense wind-phase re-anchoring (the A2DP winding-tick phase clock), not
deeper BB sensing, and the device Night 2 run doubles as the drift-under-load
test (calib-01 found none). Note the 10/20-shaped-vs-story-table distinction
explicitly — it was conflated in session on 2026-08-30 and retracted. Full
record: `MINUS-3-STRATEGY.md` §3 "Story-Night-2 pricing, decomposed".

**3. Rooting the g56 is now a shared dependency.** Multiple frontier paths need
it: forcing SoundPool off the fast mixer (audio cues live), Frida/runtime
attachment (`plans/17` routes 2/3, parked for exactly this), and any HAL-level
capture. Pedro is weighing it (2026-08-29). If a rooted device becomes
available, re-open those rows.

**4. The video live loop, scoped.** With audio out, the reactive sensor is the
cue helper's `VirtualDisplay` at **native res** with a device-side pixel
watchlist (~59 ms/read, ~14 Hz, no SurfaceFlinger contention). Affordable:
left-opening (BB→Foxy, already 0/3000 without it), blackout, monitor/mask state,
AM digit, pan-reference edge, pie angle, split-armed tiles. Reaction ≈ 300 ms
vs a 0.75 s Night 7 mask window — fits. **BB vent detection stays dead for
Minus 7** (the pilot is mid-routine when he'd appear), but **blackout-reactive
strategies (RVC / brayden / the Minus Toys blackout branch) are within budget.**
For a timer route the loop's job is verification + conservative resync, not
reaction. `MINUS-3-STRATEGY.md` §9 "What a video-only live loop can and can't do".
**[`plans/19`](19-video-reactive-controller.md) now owns this build.** Package 1
landed 2026-08-29 (`6bfbc39`): `src/observer.js` fact model + `src/controller.js`
`BlackoutReactive` + `tools/reactivetest.mjs` in `--engine`, phone-free.
[`plans/20`](20-belief-state-cycle-controller.md) is the estimator/planner layer
above it (Pedro's digital-twin directive). **Next: Plan 19 P2** — the native-res
`PixelWatch`/`CaptureService` watchlist verbs, compiled offline against mock ADB.

| Route | What is actually known | Next falsifiable gate |
|---|---|---|
| **In-APK read-true-state** (`plans/17`) | **Promoted 2026-08-28** after the Minus Toys device refutation below. The only bot family with a demonstrated ceiling: Shooter25's practice mod is **104–1** reading `in danger` / `blackout` / the music-box counter directly, frame-locked because it runs in-process; no external FNaF 2 bot exceeds ~1/3, and none solves live game-clock sync (mapped-bot research this session). Runtime established: Clickteam Fusion build 296, `application.ccn`, PAIRIP + `libpairipcore.so`. `plans/17` now carries the minimal internal-state tuple (each value with its Android group ref), a failure→fix table against `n2-minustoys-0117`, and WP4 = the Foxy hall-reset as the first in-process closed-loop decision. | One installed research build that boots to a night, exposes the state tuple, executes one closed-loop decision, and logs evidence comparable to a stock run. **Runtime attachment (routes 2/3) parked 2026-08-28** — Pedro's call: it depends on defeating PAIRIP's signature + anti-instrumentation layers, and there is no approved rooted device. Active path is the **faithful recompile (route 5)**: owned CCN → open-source Chowdren → separate research binary, no PAIRIP contact. Source emission completes for 29 real frames, arm64 CMake links the desktop target, and **it boots to the FNaF 2 02-title screen** (Xvfb+llvmpipe, `ALSOFT_DRIVERS=null`, CWD at the asset dir): frame 0 → frame 1, title event logic runs (title text, `12:00 AM` clock, WARNING block, camera map, menu buttons), stable 45 s+. The image bank now decodes correctly (2026-08-28 `& 0xFFFF` handle mask, 723→18 missing-image fallbacks) so the real title images render on desktop; title-screen layout/blend cosmetics remain and no gameplay yet. Fidelity `rebuilt-runtime`. Next: rebuild the g56 APK with the image fix, then drive the menu to a night and compare to the sourced model. |
| **Minus Toys** | **Open-loop external port refuted on the phone, 2026-08-28** (`n2-minustoys-0117`): cleared the deterministic gate 200/200, died Night 2 at ~2 AM to a BB→Foxy chain the gate cannot see. The Toys *were* held (no Toy in any office frame; CAM 11 the viewed feed every cycle) and the monitor/mask model held zero-desync — the failure is that every beat is phase-locked to a clock the device holds only to ~302 ms + drift, against the ~0.66 s/cycle budget `MINUS-3-STRATEGY.md` §3 already predicts. `minus-toys-margin.mjs`: whole-schedule phase tolerance **33 ms early / 99 ms late**, arming pair one Fusion poll. `minus-toys-jitter.mjs` under the calibrated ensemble: n2 237/600, n3–5 **0/600**, and even a perfect AM-digit re-anchor tops out at ~27–48% (n7 12%); phase basin ~66 ms wide. **Story-night aside (2026-08-29):** `--minimal` Night 1 run twice on the g56 (2.0.7+26). `-r3` armed CAM 09 only (no split) and reached ~4 AM with no mask ever used — the CAM 09 light held the Toys off the player for 2+ hours (though Toy Bonnie is not clearly on the Show Stage in any frame) — then died to the Puppet because the box cannot be wound from CAM 09. `-r2`, identical plan, armed the full split (box 100 %, ALIVE ≥ 360 s). The 33 ms opening taps make the arm non-deterministic and `--minimal` has no margin for a miss (`MINUS-3-STRATEGY.md` §9 "The `--minimal` plan run twice"). Story campaign ≠ 10/20: Night 1 has only the Puppet left after the stun. **Story-night PASS (2026-08-30): `n1-minustoys-armverify-20260830` — the fixed `--minimal` pilot (sampler-phase model + `#arm-verify` + halt guard) passed the full Night 1 on the g56: split armed first-try and held, CAM 11 feed continuous 124.7→367.9 s, no death static in 427.9 s, 44/44 cycles + terminal proof + observe to 6 AM, and the save advanced to Night 2. n=1; the verify telemetry was silent on this run (fixed same day — every path now records), so re-arm/exit-50 fire live only on a future Night 1 run, which waits on the save cursor.** | Not the open-loop loop. (a) external hybrid re-anchor + reactive left-vent BB read + mask verify/retry — jasonclone ceiling ~1/3; (b) the in-APK row above. `loopPeriodMs=5000` faithful build is 0/200 — the 10 s period is structural. **New lead (2026-08-29): the winding-tick phase clock.** Sample 33 `'WinD'` (g637/g644) fires strictly 2 Hz on a fixed frame grid while winding — and *every* strategy on *every* night must wind (Puppet always armed). Modelled (`WIND_TICK_*`, `sourcetest.mjs`); a far denser re-anchor than the once-per-70 s AM digit. **2026-08-29: the tick is capturable** — it survives the A2DP mix to a BlueALSA sink (matched-filter NC 0.56 winding vs 0.045 on-device), so this is a live non-root sensor. Still open: frame- vs wall-locked on the g56 (one hand-wound take did not resolve the 2 Hz grid — needs a scripted continuous wind, timestamped), and A2DP's silence-suspend resume gap. `ANDROID-AUDIO-CAPTURE.md` §"The A2DP mix DOES carry the fast-mixer SFX". Night 1 Minus Toys is the calibration run. |
| **Faithful brayden/Shooter25 RVC** | Still untested on Android. `rvctest.mjs` is explicitly a non-reactive skeleton and its 0/300 (206 Puppet) is not a verdict on the published four-way post-wind decision policy. Most load-bearing Android mechanics are now sourced. | Implement the actual blackout / Toy Bonnie / vent guest / empty decision tree before quoting a rate. |
| **Machine-exact Minus 7** | The emitted schedule replays 100/100 exactly on every night; its Night 7 collapse is an iid ±60 ms *human* robustness result. `/system/bin/hid` schedules one on-device event timeline, and target measurements put intra-macro error around ±2 ms. | Build a measured machine-delivery/acceptance gate (including dropped game contacts and desync), not a zero-jitter claim and not iid human row jitter. |
| **Foxy GOT-YOU blackout cover** | Engine and source contain the two kill triggers. The public 2999/3000 greenrun deliberately locks Foxy and covers every 10 s execution check with a blackout. Searches here penalise `gotYou`; none deliberately synthesize this policy. | Encode it as an explicit, likely-RNG baseline and measure it before deciding whether it is useful on Android. |
| **Original Minus 3** | For **10/20**, dominated by Minus Toys — Toy Bonnie stays live on CAM 08. **For the story campaign it is not (2026-08-29):** Toy Bonnie is only AI 1–2 on Nights 3–5, Golden Freddy is 0 below Night 6 (g804), and the CAM 08 glitch removes the three Withereds that carry those nights. Pedro hand-played Nights 3–4 on the g56 with the glitch armed, both trivial (n=1, uncaptured); the split held the full night with no re-arm — first reported full-night persistence in play. `MINUS-3-STRATEGY.md` §9. | A recorded Night 3–5 sweep through `tools/device/grade-run.sh` — the only sourced device risk is arming the glitch (proved once, §8). |

Routes that really have been measured down: glitchless **Minus Two** is 16/200
on the current Android model; Six-Seven, Minus Right and the fixed gate-aware
families have sourced structural failures; the attempted periodic Foxy-eviction
addition made every tested Minus 7 night worse. Reopen those only for a corrected
mechanic or a genuinely different policy, not a new timing permutation.

**Minus Toys correction that must survive context loss.** The 16/200 Minus Two
failure was Toy Chica reaching the office against Android's consecutive mask
semantics. Minus Toys is not that policy: its glitched CAM 09 light is intended
to pin Toy Chica, Toy Bonnie and Toy Freddy on the Show Stage. Therefore the
Minus Two Toy Chica failure is **not evidence that Minus Toys fails**. Mangle and
BB still require the sourced five-consecutive-tick mask handling, so the full
policy must be modelled rather than declared solved.

**Device proof, 2026-08-28, Moto g56 / v2.0.7 Night 2.** A single HID stream used
33 ms contacts and a 17 ms released gap between the CAM 09 Click and monitor
down (50 ms through the pair, inside the sourced 200 ms stale-sample window).
After the next raise the screenshot shows the CAM 11 feed/label and wind control,
with CAM 09 and CAM 11 highlighted. Artifacts:
`captures/n2-doublecam-hid-0003.{png,hid}` (ignored capture corpus). This proves
deliberate arming and the actuator window. It does **not** prove the glitched
light applies a stun, that the split survives a full night, or that the published
PC loop transfers unchanged — **and the full-loop run below now shows the last of
those is false for the open-loop port.**

**Do not run the advertised localized-last67 trial yet.** `recipe.mjs` accepts
`--sweep-last-contact-ms=67` and the plan interpreter understands `10,4,7:67`,
but `tools/device/trial.sh` currently forwards only slot, spacing and base
contact. Setting an environment variable for the last contact therefore emits
the old all-33 plan. Thread the option through the live entry point and pin it in
the runner-plan test before claiming that device experiment ran.

**Concrete next action (2026-08-28): building the Chowdren Android backend
(option a, Pedro's call).** Feasibility spike **done, GO**, and the **full APK
pipeline is proven end to end** (`IN-ENGINE-PILOT-RECOMPILE.md` §"Route (a)",
`tools/recompile/android/README.md`): `fnaf2-android-build:local` container
(`--platform linux/amd64`, NDK, SDK, `adb`, SDL2 2.30) → SDL2 `android-project`
`testgles2` app → `./gradlew assembleDebug` → `adb install` on the **g56
(Android 16, arm64, PowerVR GPU) = Success**, launched, **GLES rendering on the
device**. Chowdren engine compiles for arm64 Android with **one** fix
(`fileio.cpp` `#include <iostream>`, in the patch) — the `overlap.cpp` /
`glslshader.h` probe errors were artefacts (non-standalone TU / desktop-only
shader header). Every uncertain link verified.

**Backend built; APK built (2026-08-28).** The whole engine + all 27 event / 29
frame / 5 object generated units + the Android backend + inline ogg/vorbis +
cross-built openal-soft link to `libmain.so` (exports `SDL_main`), and
`./gradlew assembleDebug` → `app-debug.apk` (134 MB, `Assets.dat` stored
uncompressed). The backend turned out small: `desktop/{renderplatform,fbo}.cpp`
compile as-is under GLES1 (`include_gl.h` `*OES` remaps), the only new file is
`base/android/glesshader.cpp` (no-op `BaseShader`), and the rest is
`#ifdef CHOWDREN_IS_ANDROID` widening of `CHOWDREN_IS_DESKTOP` gates (run.cpp
SDL.h/`SDL_main`, keydef.h, media.cpp audio, platform.cpp window + Assets.dat
extraction). freetype was not a real dep. All in
`tools/recompile/mmfparser-chowdren-mobile.patch`; native build in
`tools/recompile/android/game-CMakeLists.txt`.

**The recompiled FNaF 2 renders its title screen on the g56 (2026-08-28).**
`adb install` (USB) → launches, `OpenGL ES-CM 1.1` context, `screen_fbo`
`GL_FRAMEBUFFER_COMPLETE_OES`, no GL errors, frame 0 → frame 1, **60 fps**,
**openal-soft audio playing**, and the 02-title event logic renders — "Five
Nights at Freddy's 2", the `12:00 AM` clock, the WARNING block, the camera-map
layout, menu buttons. Same fidelity as the desktop build. The white-screen bug was
`glEnable(GL_TEXTURE_2D)` — the desktop path samples via `texture_shader`, but
the Android `glesshader` stand-in is a no-op so the ES 1.1 fixed pipeline had
texturing disabled and every textured draw rendered the flat vertex colour.
Fixed in `set_gl_state()`.

**Image bank fixed (2026-08-28, desktop-verified; Android needs a reconvert +
APK rebuild to pick it up).** "Placeholder boxes" was a wrong diagnosis: the
mobile `ImageItem` record decodes all 782 images, but its 4-byte opening field is
`handle | (section_counter << 16)` and the parser took it whole, scattering ~350
images to `0x1xxxx`–`0x5xxxx`. `imagebank.pyx` now masks `& 0xFFFF` → object-side
missing-image count **723 → 18** (the 18 are the genuine `(0,0)` placeholder).
On desktop the real title images now render (animated TV static, camera-map
thumbnails, `CAM` buttons).

**Very next step:** reconvert + rebuild the g56 APK to carry the image-bank fix;
then the title-screen cosmetics that are *not* image-bank
(`IN-ENGINE-PILOT-RECOMPILE.md` §"Phase 3b" lists them: letterbox anchored not
centred, stacked title text overlaps the clock, static/map draw at full opacity)
and touch input, then drive the menu to a night frame and compare to the sourced
model. `rebuilt-runtime`.

The desktop build (boots to the FNaF 2 title screen, runs the real decoded event
logic) stays valuable regardless — Plan 05's Custom Night campaign names it as
its pkg 9 measurement oracle. Runtime attachment stays parked (defeats a PAIRIP
layer, no rooted device — `plans/17` §"Runtime attachment (route 2) is not being
pursued").

Route context (kept): route 5 as first built produced a **desktop binary only**
— the Chowdren fork has platforms `generic` + `d3d`, no Android backend / NDK /
APK packaging. With runtime attachment (routes 2/3) parked, option (a) is the
path to `plans/17`'s "installed research APK" goal; (b) accept the desktop build
as a fidelity oracle and rescope; (c) stop the recompile. Pedro picked (a).

**Recompile status.** Toolchain committed at `tools/recompile/` (content-free
patch + config + probes + README). No maintained Python decompiler exists, so the
build-293→296 `mmfparser` port is done in place with **`AITYunivers/NebulaFD`
(C#, active) as the byte-layout spec**. Cleared so far: parse, assets,
`write_objects`, and — after this session's port work — **`write_loops`**.
Landed: parameter loaders 67–72, frame chunk `13132`, a `ChunkList` end-of-data
guard (the 4 unparsable frames were truncated `olivier_DEBUG_*` stubs; the real
game is frames 0–28), numeric-fastloop naming in Chowdren, and `RunningAs` /
`SetGlobalValueDouble` stubs.

**Generation gate passed, and it boots to the title screen (2026-08-28).** The
external converter emits C++ for all 29 real frames, arm64 CMake links the
desktop target, and under Xvfb+llvmpipe (`ALSOFT_DRIVERS=null`, CWD at the asset
dir) the binary boots frame 0 → frame 1 and runs the FNaF 2 02-title event logic
(title text, `12:00 AM` clock, WARNING block, camera map, menu buttons), stable
45 s+. Frame-1 resolution fixed: the events reference objects genuinely not on
the frame (Fusion Globals placed later, dead cross-frame refs) and Chowdren
dereferenced `back_obj` unconditionally — landed absent-ACE default/skip,
`JumpToFrame` no longer dropped, universal `create_alterables()`, and an
`INVALID_ASSET_ID` sound guard (`tools/recompile/mmfparser-chowdren-mobile.patch`,
now also carrying the touched `Chowdren/base/*.cpp`). Playable now over VNC:
container `fnaf2-play`, `x11vnc` on `127.0.0.1:5901` (`open vnc://localhost:5901`).
**Very next step: the decision above** — the desktop-only finding means "polish
the desktop build" (menu→night, night comparison; the image bank was fixed
2026-08-28) is only worth doing under option (b). Fidelity `rebuilt-runtime`.
Fallback if it proves pervasive: NebulaFD → MFA → licensed Fusion → desktop CCN.
Full record: `docs/in-engine/IN-ENGINE-PILOT-RECOMPILE.md` §"Phase 2 — the mobile
event format" / "Tooling survey". CCN + `gamesrc/` cache stay external.

**Superseded fork (kept for context): the Minus Toys decision.** The open-loop
device port is built, run, and refuted (`n2-minustoys-0117`, 2026-08-28 — full
record in `docs/device/ON-DEVICE-VALIDATION.md` §"The Minus Toys open-loop policy
is refuted on the phone", and `plans/02` pkg 2a). It clears the deterministic
gate 200/200 and dies on the phone at the ~0.66 s/cycle margin the strategy's own
write-up (`MINUS-3-STRATEGY.md` §3) predicts — mask-window cliff ~300–500 ms,
BB→Foxy chain, wind-phase drift → Puppet under the clock-error model
(`minus-toys-jitter.mjs`: n2 237/600, n3–5 0/600, AM-reanchor caps ~27–48%). The
external hybrid below remains a valid parallel track if picked up; it is no
longer the pointer.

Two paths, with the external-hybrid foundation now built but not promoted:

1. **External hybrid** — keep the timed skeleton, add: AM-digit clock re-anchor
   every 70 s, a reactive left-vent BB read (the Minus 7 runner already has
   one), and mask verify-and-retry. Ceiling ~1/3 (jasonclone bot; AM-anchor
   sim). Search tooling landed this session: `tools/device/minus-toys-plan.mjs`
   is now `build(knobs)`-parametrized (arming gap, mask window, wind, hall,
   camdrop, `loopPeriodMs`) with an optional BB-only `reactiveBB` hook. The
   hook is wired in the exact replay but its survival gate is red; the phone
   runner is observe-only until evidence closes. `trial/12-night-loop.sh`
   still hardcodes `base += 10000` so a non-10 s period is search-only for now;
   `minus-toys-margin.mjs` maps per-press slack; `minus-toys-jitter.mjs` is
   the robustness fitness function under the calibrated clock-error ensemble.
2. **In-APK read-internal-state** (`plans/17`) — the clock-sync problem
   disappears; the only approach with demonstrated reliability (Shooter25
   practice mod, 104–1). `plans/17` now carries the state tuple and WP4.
   **Runtime attachment parked 2026-08-28** (ethics + no rooted device); the
   route to this end state is now the faithful recompile (route 5), working
   through its Phase 2 generate boundaries.

Also open, low priority: the deterministic Minus Toys gate needs a jitter/margin
check (200/200 hid a 33 ms phase cliff — wire `minus-toys-jitter.mjs`'s
`evalEnsemble` into it); `test-hid-trace.mjs`'s 100 ms contact floor
false-fails this policy's deliberate 33 ms contacts.

**Session review, 2026-08-28 (survey + reframe, nothing measured on the phone).**
Two notes landed that a cold session should read before touching actuator geometry
or plan 17 again:

- **The frontier is phase, not actuation** —
  `docs/device/ON-DEVICE-VALIDATION.md` §"The frontier is phase, not actuation".
  A perfect actuator at a 300 ms-wrong phase still dies (margin 33/99 ms vs a
  302 ms epoch bracket). The unbuilt lever is an **audio-locked clock estimator**
  (music-box track as metronome via cross-correlation; Kalman/PLL over the
  −184 ms/min skew; BB laugh as the read no pixel can give). Mandatory control:
  the 22/22-false-thud lesson — a cue-free recording plus a second signature
  before any audio number counts. The one real actuator defect (the arming pair
  merging to a 0 ms drag) is topology, not time — fix with distinct tracking
  slots: `docs/device/HID-MULTITOUCH.md` §"The arming pair merged into a drag".
- **PAIRIP posture corrected** — `plans/17` §"PAIRIP-specific refresh". The VM is
  not on this plan's path (state lives in the Chowdren runtime, not `executeVM()`);
  the signature layer has a named LSPosed defeat (`pairipfix`); the confirmed-biting
  layer is anti-Frida. Corrected first probe: **package-scoped Zygisk/LSPosed
  module**, not bare Frida attach. All external, mostly Android-10-era, none
  reproduced here — changes which probe runs first, promises nothing.
  **Superseded 2026-08-28 (Pedro's call):** the runtime-attachment route is
  parked. Every viable form of it defeats a PAIRIP layer (signature bypass +
  anti-instrumentation evasion), which is circumventing the app's integrity
  protection, and there is no approved rooted device. `plans/17` §"Runtime
  attachment (route 2) is not being pursued". The route survey is kept; the
  route is declined.
- **Recompile fallback (route 5) is the active in-engine path; boots to the
  02-title screen (2026-08-28).** The externally parsed build-296 CCN emits
  source for 29 real frames; arm64 CMake links the desktop target; under real
  Xvfb + llvmpipe (`ALSOFT_DRIVERS=null`, CWD at the asset dir) the binary boots
  frame 0 → frame 1 and runs the FNaF 2 title event logic — title text, the
  `12:00 AM` clock, the WARNING block, the camera-map layout, menu buttons —
  stable 45 s+. The frame-1 "instance emission gap" reading was wrong: the events
  reference objects genuinely not on the frame (Fusion Globals placed later,
  dead cross-frame refs) and Chowdren dereferenced `back_obj` unconditionally.
  Landed: absent single-object ACEs → type default / skipped no-op; `JumpToFrame`
  &c. no longer dropped (frame transitions emit); every object gets
  `create_alterables()`; `Media::play_id` guards `INVALID_ASSET_ID`; and
  (2026-08-28) the image-bank handle mask — the mobile `ImageItem` field is
  `handle | (counter << 16)`, `& 0xFFFF` cut missing-image fallbacks 723→18 and
  the real title images render on desktop. Title-screen layout/blend cosmetics
  remain and it does not reach gameplay — `rebuilt-runtime`, no night comparison.
  Full record in `docs/in-engine/IN-ENGINE-PILOT-RECOMPILE.md` §"Phase 3 — boots
  to the FNaF 2 title screen" and §"Phase 3b — the image bank was decoding, the
  handles were wrong".
- **HTML5-export shortcut probed and rejected (2026-08-28).** `irv77/hd_fnaf`'s
  `.../2/` runs a full FNaF 2 on the freely-redistributable Clickteam HTML5
  runtime (no PAIRIP) — tempting as a route-5 shortcut. Probed live: it is
  **PC v1.0, not Android build 296** (27 frames vs 29; title reads `v 1.0`), and
  its Closure-minified runtime exposes **no names** — reading AI state needs the
  same `.cch` decompile + mapping work as a fresh parse. Not a shortcut. Value
  that remains: a playable PC reference for eyeballing mechanics, and `Runtime.js`
  as a reference implementation of Fusion event semantics (it no-ops an action on
  a zero-instance object type — confirms the Chowdren emit's frame-1
  `playvoice4_3` null-safe-no-op fix is Fusion-correct). Full record in
  `docs/in-engine/IN-ENGINE-PILOT-RECOMPILE.md` §"Probed and rejected as a
  shortcut".

### Plan 05 — Custom Night invention campaign (active 2026-08-28)

**Direction (Pedro's call, 2026-08-28): aim the reopened invention search at the
Custom Night configuration space, not another 10/20 pass.** The published FNaF 2
strategy corpus is entirely human-derived from the decompiled AI and concentrated
on a handful of canonical challenges. The Custom Night space (10 dials × 21
levels) has no published routine for the overwhelming majority of vectors, so a
machine-found policy there has a real shot at genuine novelty — there is nothing
to rediscover. Target selection: **systematic single- then pair-threat vectors**
first (each animatronic alone at 20, then dangerous pairs) — a single-threat
vector also isolates exactly which approximated mechanic a survivor leans on,
which is the honest-caveat work Plan 05 already requires.

**Landed 2026-08-28 (`8694c1b`):** `Sim` accepts `opts.customNight`, an
`AI_DIALS` vector that replaces the night-7 table with one 12 AM row (`night`
stays 7, so every `night >= 7` rule applies; Puppet pinned at 15 by g821; the
per-frame caps clamp on apply). `peakAi`/`canAct` take the vector too. Pinned by
`sourcetest.mjs`. This was the one engine blocker — the search infra Plan 16
built (`Sim.snapshot`/`restore`, exact RNG, 1200-seed gates, dominance pruning)
is otherwise reusable as-is.

**The build-out is planned** in `plans/05` §"Implementation plan (2026-08-28)":
representation is an ordered rule-list + register bank, action grain is semantic
(frame-level lowering deferred to pkg 9), decision tick is the sourced 5 s
scheduler with event wakes. Sequencing 6a → 6b → 6c → 7a → 7b (check-in) → 7c →
8 → 9; all new tooling in `tools/invent/`.

**Very next step for this track:** pkg 6a — `tools/invent/observe.mjs`, the
Custom Night observation surface with per-field provenance tags (group citation
or `[MODEL]`), cross-checked against Plan 17's internal-state tuple. Unverified
model dependency to carry into any result: `src/config.js:166` — Custom Night's
`night` variable and the 0.75 s cams-up grace have never been read on a real
Custom Night run.

### Prior Minus 7 frontier (retained, now scoped)

**2026-08-27 (`740f5b0`) — the plan-16 constrained search is done, both levers
measured to a conclusion, and the standing goal (item 9) is NOT met.** The
sweep-geometry axis and item 10's bang-anchored reset — the two levers the
block below named — were each built and gated at 1200 seeds
(`tools/minus7/geometrysearch.mjs`, `SEARCH_KNOBS.attackBangGateMs`; plan 16
progress log has the tables):

- **Sweep geometry: a real +10 on n2–n6 correlated, but a phase-lock SPIKE.**
  Every `dev≈62` geometry (`geometrysearch --mode=admit`) lifts min(n2–6)
  59→70 correlated and holds at the readLatency-480 latch — but the
  ±(slot 2, dev 3) neighbourhood collapses to ~46, it never clears 70 under
  `iid` (n6 ~62), and it drops **n7 to 13–18** (vs shipped 33). `dev` is a
  ~4 ms-wide plateau with cliffs on both sides. Not promotable until the
  device shows a real actuator holds the basin under its own jitter — that is
  the `fnaf2-1020-e8` device thread. (The "does 33 ms *stun* vs merely light"
  question is **answered** — the dump sources no minimum lit time, g450–455
  are single-frame triggers on a per-frame `lit?` boolean, and at zero jitter
  the sim locks every toy on every geometry; see "The stun needs no minimum
  lit time" below. What the device still has to show is that the last-slot
  drift leak and its 67 ms repair behave on the phone as in the model.)
- **Item 10: closed on latency.** Firing the attack cycle's
  mask-off/reset/raise (+ dragged recovery sweep) on the BB departure bang
  clears n2–n6 to ~90% **at a perfect instant oracle** — but the gain needs
  end-to-end bang latency **< ~33 ms** (useful +10 on n5/n6), < ~50 ms to
  break even, and is a **net loss above ~67 ms** (`tools/minus7/i10latency.mjs`;
  the recovery sweep is pinned to the cycle end, so acting late drags it late
  and toy coverage collapses). Android's CDD recommends ≤30 ms for continuous
  PCM delivery *alone*. So the latency is below what the audio path can give,
  and a fast bang detector would not unlock it. Default-off recorded negative;
  n7 barely moves regardless (it dies to Foxy in the clear cycle, not the
  attack cycle).

**~~The useful positive: a <~50 ms bang detector would be worth ~+30 points.~~
Checked 2026-08-27 (`tools/minus7/i10latency.mjs`) and withdrawn.** Item 10's
gain needs end-to-end bang latency **< ~33 ms** for a useful +10 on n5/n6,
< ~50 ms to break even — and Android's CDD recommends ≤30 ms for *continuous
PCM delivery alone*, before onset classification or IPC, with plan 08's
windowed capture paying cold start on top. The latency item 10 needs is below
what the audio path can deliver. **Item 10 is closed on latency, not blocked.**
The cue helper's remaining value is the fast *visual* read (plan 15 pkg 5),
not an audio-driven action. See `plans/08` §"The latency budget an early-unmask
would need".

**Next, in order (all device — the simulator scheduling space is exhausted):**
1. **The LIGHT_AFTER geometry on the phone — device run, not more code.** The
   33 ms contact *does* stun in the model (dump + sim, no minimum lit time),
   and the localized 67 ms last-slot light is now built and gated
   (`fnaf2-1020-02`, `853f8bc`: `recipe.mjs sweepLastContactMs`, sweep line
   `10,4,7:67`, plan interpreter threaded, `--sweep-last-contact-ms=67`). The
   live `trial.sh` option is **not** threaded yet; see the 2026-08-28 reset
   above. **Scrutinised
   1200-seed (Pedro: "surprising results fall under scrutiny"):** `66/33 slot50
   last67` correlated is a **robust +10–12 on n2 and n5** across both actuator
   models (rl550 *and* the pinned rl480) — a perturbation-stable basin, not a
   spike, and mechanism-grounded (67 ms = 4 lit frames vs 33 ms = 2, widening
   the last flash's coverage past the drift). **n6's +13 is mostly a rl550
   artifact — only +4 at rl480.** **n7 is broken deterministically** — *any*
   LIGHT_AFTER base-33 geometry fails the n7 schedule at zero jitter (Toy
   Bonnie / Foxy flood the office), the last-slot 67 ms does not touch it.
   Open, and all device: (a) does the sweep's last-slot jitter leak reproduce
   on the phone, (b) does the 67 ms light close it there, (c) does a real
   actuator hold the ~4 ms `dev≈62` basin under its own jitter.
   `n2-la-212912` already showed the geometry transfers with no HID lit-miss.
   Full scrutiny in `ON-DEVICE-VALIDATION.md` §"The localized last-slot 67 ms
   light, gated (2026-08-27)".

   **Parked, flagged 2026-08-27 (`fnaf2-1020-02`):** a `--device-spacing-ms=100
   --sweep-contact-ms=67` config (legacy geometry — `contact ≥ 50`, so `replay`
   holds the light 100 ms regardless of the emitted 67) reads correlated **n7
   ≈ 50–63**, flat across model slot 42–83, holding at rl480 (n7 50). That
   contradicts `devicetimesearch`'s "emit spacing ~103 → n7 32 phase break"
   and, if real, breaks plan 16's "n5/n6/n7 need new device time" conclusion.
   But it is a legacy-geometry corner with an emit/replay inconsistency (the
   emitter anchors the sweep end on the 67 ms cost, `replay` models 100 ms), so
   it is most likely a model artifact, not a lever. Not chased — needs the
   inconsistency untangled first. `ON-DEVICE-VALIDATION.md` same section.
2. **New device time for a second clear-cycle Foxy reset** — the one thing
   Night 7 needs (plan 16 pkg 5: the opener is refuted, n7's Foxy deaths are
   the clear cycle's two resets missing under jitter; perfect x2 → 61 %, the
   rest is office entries = lever 1). Pkg 4 showed the reset cannot clear
   `MASK_ANIM_OFF` without hitting the sweep pin, so this is a device-side
   question: is there a cheaper path to `hallView` (e.g. folding the reset
   into the read's own monitor-down)?
3. **Plan 15's fast *visual* read** (BB in the left opening via the cue-helper
   GRID, ~42–59 ms vs `screencap`'s 225 ms) — architecture and honesty, not an
   n5/n6/n7 survival lever. The *audio* path is not on the critical path: item
   10's early-unmask needs a bang latency (<~33 ms end-to-end) below what
   Android audio can deliver, so a fast bang detector would not unlock it
   (checked 2026-08-27, `tools/minus7/i10latency.mjs`; `plans/08` §"The latency
   budget an early-unmask would need").

---

*(Superseded 2026-08-27 by the 1200-seed search above — the "needs a proper
1200-seed search" it calls for is now done. Kept per the retractions rule; its
7-point 400-seed table is subsumed by the plan-16 grid.)*

**2026-08-27, `minus7-perfect-experiment` branch — the actuator question is
CLOSED, and the answer is that it was never the constraint.** Session on this
branch measured, on the g56: 33 ms contacts register for **every** touch
control — camera select (via the LIGHT_AFTER decoupling, `plans/17`), monitor,
mask, and the hall beam (a 33 ms hold lights the hallway). The 100 ms floor
this project defended since the swipe era is margin. LIGHT_AFTER is a
device-validated sweep that spans ~200 ms (vs 366) and locks Toy Bonnie AND
Toy Chica where the 100 ms geometry did only intermittently (the CAM-07
last-flash saga). `docs/device/HID-MULTITOUCH.md` §"The 100 ms contact floor
is margin".

**What it does to the sub-70 nights is a TRADEOFF, and the landscape is
chaotic — phase-lock, not a smooth curve.** Gate ladder + a 7-point geometry
sweep, `minus7-perfect-experiment`, human-correlated ±60 ms, 400 seeds:

| sweep geom (slot/dev/con) | n2 | n5 | n6 | n7 | n7 @ measured |
|---|---|---|---|---|---|
| 120/133/100 (shipped) | 71 | 64 | 63 | 33 | 90 |
| 67/33 slot 50 | 70 | 57 | 57 | 12 | 11 |
| **50/60/30 slot 50** | **82** | **76** | **71** | 17 | 14 |
| **40/50/25 slot 40** | **81** | **74** | **67** | 22 | 42 |
| 45/56/28 slot 45 | 60 | 46 | 45 | 14 | 52 |
| 36/45/22 slot 36 | **3** | **0** | **0** | 0 | 0 |
| 33/40/20 slot 33 | 8 | 5 | 0 | 0 | 0 |

Read that carefully:

- **A tight LIGHT_AFTER sweep (50/60/30 or 40/50/25) lifts n2-n6 at human
  jitter by +5 to +13 points — n5 crosses 70, n6 gets to 67-71.** This is a
  real re-phasing gain, not noise (it repeats across two geometries and both
  jitter shapes).
- **Every geometry that helps n2-n6 WRECKS n7** (17-22 human, 14-42 measured
  vs the shipped 33/90). n7's sparse-mask stun bridge had no phase to give up.
- **Two nearby geometries collapse EVERYTHING to 0** (36/45/22, 33/40/20) —
  the phase-lock cliff. So this is not a knob to turn; it is a search.
- **The simulator still does not model contact length** — a 33 ms *tap* plan
  replays identically to a 100 ms one. The gain here is entirely from the
  narrower SWEEP re-phasing the cycle, which the LIGHT_AFTER geometry makes
  landable, not from shorter taps.

**So the corrected standing: the actuator discovery IS a lever for n2-n6 at
human jitter — through cycle re-phasing, needing a proper 1200-seed search
over the sweep geometry (a plan-16 axis that was never in the search) — and
it is NOT a lever for n7, which gets worse.** The other two levers still
stand and n7 needs them: **item 12's correlated jitter shape** and **item
10's bang-anchored Foxy reset**.

*(The 2026-08-27 09:xx line just above, "does not move the sub-70 nights,"
was written before the 50/60/30 point and is wrong — kept per the retractions
rule.)*

### Device run `n2-la-212912` (2026-08-27): the geometry transfers; the death was Foxy during a mask-camp

First graded on-device Night 2 with the LIGHT_AFTER sweep (`SWEEP_SLOT_MS=50
SWEEP_SPACING_MS=66 SWEEP_CONTACT_MS=33`, `EXPERIMENT_UNGATED=1`, no cue
helper — it had died). `grade-run.sh` verdict + Pedro's eyewitness:

**Confirmed by the instruments — the open question is answered YES:**
- The LIGHT_AFTER burst executed correctly on the phone (hid trace: per camera,
  select-down 17 ms → up → 17 ms settle → light-down 33 ms → up; all of 10, 4, 7).
- **CAM 07 lit on ~20 consecutive sweeps** (sweepcheck 8–27 all `cam07=lit`).
  The geometry that only intermittently lit CAM 07 at 100 ms lights it here.
- All camera selects registered (camtrace: 10, 4, 7 every sweep).
- **The monitor model held with ZERO desync for 154 s** (desync-scan: "held for
  the whole graded interval"; every monitor/mask press agreed with the game).
- screenstate: **ALIVE ≥ 180 s**; no instrument saw the end (run aborted on
  focus-loss at 193 s).

**What killed it (keyframe at 187.5 s = the withered-Foxy jumpscare):**
- ~148 s: `left-view` flips to `inside` (margin 18, the displaced boundary) and
  stays there — Pedro saw Toy Chica in the office, and a BB "kill" in the chain.
  So the lit CAM 07 sweep **rendered** but did not **pin** Toy Chica this run.
- The runner correctly failed closed: prophylactic mask, 5 ticks, 4× over
  148–188 s (`macro attack[2..999]`).
- **While mask-camping, the normal cycle — including the hall Foxy resets — is
  suspended.** Foxy, un-reset for ~40 s, jumpscared at ~188 s.

**Reading:** this is *not* a refutation of the n2–n6 lever (the geometry
transfers, which was the doubt) but *not* a confirmation either. Two
pre-existing problems bit, both already named on this page:
1. The office-entry **mask-camp emergency mode has no Foxy handling.** Lever
   10 (bang-anchored Foxy reset) and "the office-entry mask" are exactly where
   CLAUDE.md says the nights are won.
2. Toy Chica escaped because of **sweep geometry, not contact length** — see
   the source + sim finding below.
3. No cue-helper BB read this run (helper dead) — the runner never separated
   "BB inside" from "toy inside" and just mask-camped. `plans/15` BB-first.

### The stun needs no minimum lit time — Toy Chica leaks on ORDER (2026-08-27)

**The dump sources no minimum `lit?` duration.** Groups 450–455 (g455 = Toy
Chica) are single-frame triggers: `your view` marker overlaps the character
**and** `viewing > 0` **and** `lit? == 1` **and** `viewing != <excluded cam>`
→ stun set that frame. `lit?` itself (g75–79) is a plain per-frame boolean —
1 on any frame `Key-17` is held with battery and not `in danger`, 0 the frame
it releases. No ramp, no accumulator, no hold counter anywhere. A 33 ms
contact spans ~2 frames > one 16.7 ms poll, so `lit?` is 1 for ≥1 frame and
the stun lands that frame. **So "33 ms is below a stun threshold" is not a
thing** — the A/B/C contact-length probe is not needed to answer this.

**The sim confirms it and localises the real fault.** `modelGate`, night 2,
1200 seeds, Toy-death census:

| geometry | slack 0 | slack ±30 | slack ±60 |
|---|---|---|---|
| shipped 133/100 | TC 0 TB 0 TF 0 | TC 3 TB 6 TF 3 | TC 85 TB 66 TF 35 |
| LIGHT_AFTER 66/**33** slot 50 | **TC 0 TB 0 TF 0** | **TC 146** TB 0 TF 0 | TC 349 |
| LIGHT_AFTER 80/**50** slot 50 | — | TC 233 | TC 413 |
| LIGHT_AFTER 100/**67** slot 50 | — | **TC 0 TB 0 TF 0**, surv 1199 | surv 850 |
| LIGHT_AFTER 100/**67** slot 67 | — | **TC 0**, surv 1199 | **surv 936** |

- **At zero jitter every geometry locks every toy.** The stun lands. The
  device run's Chica escape is a jitter/drift effect, not a mechanic failure.
- **The leak is the sweep's LAST slot, whatever camera sits there** — reorder
  `10,4,7`→`7,4,10` and the ~145-at-±30 hole moves from Toy Chica to Toy
  Freddy (CAM 10); →`7,10,4` moves it to Toy Bonnie (CAM 04). Flashing 07
  twice (`10,4,7,7`) does **not** help — the extra slot is just the new last
  one. So it is not Chica's path (`[9,7,blindA,1,5,ventL]`, CAM 07 her only
  swept room) that is special; it is the position.
- **The cause is drift margin, not stun threshold.** The whole ~200 ms sweep
  landed up to 150 ms late on the device run (60–99 ms median cycle-boundary
  residual). A 33 ms light on the last, most-delayed slot often arrives after
  its target has already taken the 5 s move — 50 ms is no better (worse,
  even) — but **67 ms closes it completely** (±30: 0 leak, 1199/1200; ±60:
  936 vs 653). 100 ms would too, but forces the slot wide enough to re-trigger
  the Foxy phase-lock (`133/100 slot 50` → Foxy 880/1200).

**The fix is a 67 ms light contact — and it needs a code change first.**
`sweepCamMs`/`replay` currently pick the decoupled LIGHT_AFTER path only when
`contact < 50`; at 67 they fall back to the legacy same-report geometry, which
is exactly what renders CAM 07 dark on the phone (the whole reason LIGHT_AFTER
exists). The LA/legacy switch has to become a flag, not a contact-length
threshold, so 67 ms decoupled is expressible. **This is session 31's search
axis** — the useful band is ~`100/67 slot 55–67`, and every search so far
capped contact below the value that actually works.

**Device probe, reframed:** one graded Night 2 at `100/67 slot 67` with the
decoupled select forced on, `CUE_HELPER=1 CUE_AUDIO=1` — does 67 ms close the
last-slot hole on the phone as the sim says (1199/1200, zero toy leak).

---

*(Superseded 2026-08-27, kept per the retractions rule.)* **The standing goal
(item 9): nights 2-6 are sweep-selection-spacing-bound; Night 7 is
jitter-shape-bound. Item 13's "device-actuator overhead" framing
was checked and corrected on 2026-08-27 (two sessions) — see the correction
appended to item 13.** The emitted schedule replays 400/400 = 100% on every
night at zero jitter (item 11). The read-capture cost moves nothing
(`readLatencyMs` 550→100 → <1 pt). But sweep selection spacing **does**:
emitted 133→113 ms takes corr **n2 75, n5 73, n6 72, n7 43** (session `55`,
`devicetimesearch.mjs`, `plans/16` log) — and 113 ms sits *below* the
device-validated 133 ms floor. So 2-6 to 70% is a 113 ms sweep actuator; n7
is still short at 43 for the jitter-shape / reset-placement reasons, not
spacing.

**Is the unjittered schedule runnable on the phone?** The precision is there
— `hid_delay` holds intra-macro boundaries to **±2 ms** (getevent), and the
fork-free `/proc/uptime` `wait_until` lands the one per-cycle wall boundary
**inside a 10 ms tick** (device-probed 2026-08-26, was 34–73 ms late on the
`date` loop). The gate's ±60 ms iid is a *human* model, not the machine. Four
things stand between that and "runnable", none of them raw timing precision:
(1) the human gate refuses a machine-precision plan by design; (2) the one
un-macro'd beat — the `screencap`-gated BB read → branch — slips **30–900 ms**
past the plan cut-off on the real phone (`actuator.mjs`), on the Foxy-critical
beat, which is what `plans/15`'s cue-helper migration fixes; (3) the sweep
spacing the nights want (113 ms) is below the proven-reliable actuator floor;
(4) `--device-actuator` is still 0% (forcedown cascade, verified recovery
unmodeled). Concrete next moves:

- **A 113 ms sweep actuator, proven against the phone** — `HID-MULTITOUCH.md`
  "Answered: the phone accepts 120 ms spacing" says the actuator can hit it;
  the CAM-07 last-flash finding says at 20 ms released (120 ms spacing) the
  *game* may still drop ~1 flash in 32. Re-run `hid-sweep-probe.sh` at 113 ms
  with an HID trace and grade both signals before trusting it.

- **`plans/15`, BB-first** — Pedro's directive 2026-08-27: *every*
  screencap-dependent read moves to the cue helper, graders included, live
  loop first. **In progress:** `trial/08-bb-threat-response.sh` now logs a
  paired `GRID` line next to every BB frame (`cue_grid()` in
  `trial/02-hid-wire.sh`, parallel to `screencap`, empty class included), so
  the next device night accretes the VirtualDisplay-scaler corpus package 4
  needs. See `plans/15` progress log. Next: same capture at
  `trial/06-cams-up-anchor.sh` and `trial/04-session.sh`, then the signature
  build. **This is architecture/honesty, not an n5/n6/n7 fix** — the gate is
  flat from `readLatencyMs` 550 → 100.
- **item 12's correlated jitter shape** for `human-gate.mjs` — this *is* an
  n5/n6/n7 lever. Its own header says iid is the wrong shape, and under a
  rough correlated model the same unchanged plans already sit at n2 ~71 /
  n5 ~64 / n6 ~64 / **n7 ~41** (vs iid's 26). Landing
  `tools/tracereport.mjs`'s correlated bands from real trainer traces is
  measurement, not tuning, and is the biggest legitimate move left on n7.

### What moves Night 7 out of impossible territory (2026-08-27)

> **Levers 1–3 below are partly superseded by plan 16 pkg 5 (`740f5b0` +
> follow-up, `tools/minus7/n7probe.mjs`). Kept per the retractions rule.**
> Measured with controlled `Sim` patches: **the opener is irrelevant** — a
> perfect opening Foxy reset moves n7 by 0.0 points. n7's Foxy deaths are in
> the **clear** cycle, not the attack cycle: its two existing resets (b+1.38,
> b+3.10) miss under jitter, and making just those two perfect takes n7
> **33 → 61 %**. Item 10's attack-cycle bang-gate (lever 2) barely touches it
> (33 → 47 even at a perfect bang oracle). The remaining ~39 % once Foxy is
> perfect is entirely `inside-office` — the sweep-geometry lever. So n7 → 70 %
> is **a jitter-robust second clear-cycle Foxy reset (new device time — pkg 4:
> cannot clear `MASK_ANIM_OFF` without the sweep pin) + the tight geometry**.
> Lever 1 (correlated jitter) still stands as the honest-measurement move.

n7 gate is **312/1200 = 26.0% [23.6%, 28.6%]**, 82.0% Foxy deaths
[79.3%, 84.4%], median death 55 s — most of the runs are dead in the first
in-game hour, because `foxyDormant` (engine.js
g872-874) holds Foxy at D=0 for none of Night 7 where it covers all of Night 1.

**Not the screencap.** Proven this session: the read cost does not move any
n7 model.

**The levers, in order of how load-bearing:**

1. **The jitter model shape (item 12).** iid ±60 ms per row is the wrong
   structure; correlated bands already put the *unchanged* plan at n7 ~41.
   Biggest move, and it is honest — it measures the real human error, not
   tunes the schedule.
2. **The bang-anchored Foxy reset (item 10).** n7's post-mask hall reset
   lands inside `MASK_ANIM_OFF` under jitter ~half the draws and resets
   nothing. Anchoring `off` to the observed departure bang decouples it from
   the stun-refresh geometry. The one schedule lever items 8–12 left open.
3. **A different attack-cycle geometry.** The current one wedges the reset
   between `MASK_ANIM_OFF` (15 fr) and the 400-frame Withered stun budget;
   every timing sweep on it is a hard wall (item 12 a–e). "New device time"
   done right = folding the reset into the read's own monitor-down, not a
   faster phone. Hardest, least explored.

**Are we hitting the strategy's wall?** Precisely:

- **Route shape (left-opening sparse): no.** `hidpilot --night=7 --sparse-left`
  is 10000/10000 + 3000/3000 worst with *free* lit reads (`HID-MULTITOUCH.md`).
  The strategy is sound.
- **The schedule: no.** 400/400 = 100% zero-jitter on every night (item 11).
- **The Foxy reset's *placement*: yes** — pinned by two game constants, every
  sweep fails.
- **n7 flashlight budget: near a wall** — the tightest night, ~3 s of
  headroom, every lit observation competes.
- **The actuator model: unfinished** — even the free-read route is 100% only
  *without* `--device-actuator`; with it, 0% (forcedown cascade, the live
  runner's verified recovery is unmodeled). No n7 claim is real until that
  closes.

So n7 → 70% is: get the jitter model honest, bang-anchor the reset, and only
if both fall short, re-geometry the attack cycle. It is **not** a device-speed
problem and **not** a route-shape problem.

**Other open items from earlier sessions follow, in priority order.** Written
as work is done rather than composed at the end; two are delegated and named.

1. ~~**LIVE DEFECT: `CUE_CAMS_UP_GREY=159` is refuted and still shipped**~~
   **CLOSED 2026-08-26.** The measurement held on re-derivation: of the 77
   office reads in `captures/n1-grey-2202-run.log`, **21 sit at or above 159**
   -- 16 confident `empty` and 5 on which `$CHECKER match` itself said
   `cams=down`, so all 21 are false positives and none is a missed desync.
   `cams_still_up()` now re-asks that same `$CHECKER match` on a fresh frame,
   through a shared `CUE_MONITOR_ROI`; the constant is gone and
   `test-plan-interpreter.sh` refuses its return. See the grey-anchor section
   below for the retraction in full.
2. ~~**The night-blind BB-model guard**~~ **CLOSED 2026-08-26, and the fix is
   not the one that was asked for.** The refusal in `trial.sh` (and its mirror
   in `preflight.sh`) now asks `canAct(night,'bb')` and names the night it is
   refusing for, so a Night 1 operator is no longer told a Night 6 statistic.
   **But the requirement itself still holds on every night**, because the
   premise that the model "is never consulted" on Night 1 does not survive
   checking: `recipe.mjs --night=1` emits a `read` in every cycle, and that one
   capture feeds three consumers in `12-night-loop.sh` -- the bb/empty branch,
   the `blind_streak`/`nolight_streak` health guards, and `monitor_seen`, the
   desync checkpoint. `elegance.py` already says this in prose ("on a night
   where `canAct(n,'bb')` is false the read still carries the other two"). With
   `BB_LEFT_MODEL` unset the driver is handed `BB_MODEL=-` *and* `CHECKER=-`,
   every classify fails, every read is `unknown`, and the run exits 45 on its
   fifth cycle. So what was night-blind was the *reason*, not the rule.
3. **Third and fourth attribution defects in `elegance.py`**, same class as the
   two already fixed (sweep, vent read): `cam-?11 -> puppet` ignores that CAM 11
   is Mangle's cam-stall (g357) and flash target (g456); `mask -> toys` ignores
   that the mask also answers the Withereds, Foxy and Golden Freddy. Neither
   mis-grades today; both are wrong models. DELEGATED.
4. **Hour-aware Night 1 plan, not built.** Sourced and ready: hours 0-1 need
   nothing (no threat armed until 2 AM, and g653 gates the box drain to 2 AM),
   and the BB attack branch is dead all night. Needs `recipe.mjs` emission, the
   runner honouring it, and a 1200-seed re-gate **watching the seven
   Puppet-sensitive seeds (136, 139, 403, 715, 825, 978, 1197)** the concurrent
   session identified -- they are wind *timing*, not budget.
5. **Toy Chica has not been found.** Pedro saw her in the hall on the live
   Night 1; no instrument here has caught her, and the repository still has no
   frame of an animatronic in the office. That control is what would settle
   whether `grey=` and the yellow anchor survive a real occupant.
6. **The white bands in the recordings are unexplained.** Three hypotheses
   measured and refuted: not the cue helper (the run without it is torn *more*,
   34.7% vs 27.7%), not the "lost signal" cue (that is a dark camera with text),
   not the camera-switch animation (bands are uniform across cycle phase at a
   ~0.2-0.3 s period, not twice per 5 s cycle). What is settled: **do not filter
   frames on them and do not use per-frame variance on this footage** -- doing
   so discarded the very frame that showed Toy Bonnie.

7. **NEW 2026-08-27: `tools/device/deathchart.mjs` charts the gate's whole
   death census** -- one pie plus a full detail table per night, colour fixed
   per character, median time of death per cause, gated by
   `test-deathchart.mjs` and listed in `TOOLS.md` and the coverage exclusions.
   `modelGate()` now also returns `deathTimes`. Engine suite green.

   **What it found, and it contradicts `CLAUDE.md` (now corrected in place):
   the Puppet is at ZERO on every night 2-7** at `6e27c79`, where that page
   records 15 on Night 6. Mechanism checked, not inferred: `windtrace.mjs
   --night=6` has the box never below 0.56 across 300 seeds, so he cannot
   reach an attack. Foxy plus office entries are now **100%** of all losses.

   **Open, and this is the next thing worth doing.** Foxy is 52-88% of deaths
   on every night and the ladder's whole remaining cost:

   | night | survived | foxy losses | office losses | median death |
   |---|---|---|---|---|
   | 2 | 796/1200 66.3% | 216 (53.5%, 48.6–58.3%) | 188 (46.5%, 41.7–51.4%) | 281 s / 4 AM |
   | 3 | 951/1200 79.3% | 165 (66.3%, 60.2–71.9%) | 84 (33.7%, 28.1–39.8%) | 310 s / 4 AM |
   | 4 | 886/1200 73.8% | 224 (71.3%, 66.1–76.1%) | 90 (28.7%, 23.9–33.9%) | 240 s / 3 AM |
   | 5 | 744/1200 62.0% | 217 (47.6%, 43.0–52.2%) | 239 (52.4%, 47.8–57.0%) | 160 s / 2 AM |
   | 6 | 648/1200 54.0% | 329 (59.6%, 55.5–63.6%) | 223 (40.4%, 36.4–44.5%) | 180 s / 2 AM |
   | 7 | 312/1200 26.0% | 728 (82.0%, 79.3–84.4%) | 160 (18.0%, 15.6–20.7%) |  55 s / 12 AM |

   Two facts to start from, both visible in `captures/deathchart-n2-7.svg`.
   **(a) Night 2 is harder than Night 3** (66.3% vs 79.3%) and the sourced AI
   table says why: night 2 arms toybonnie/toychica at 3 and toyfreddy at 2,
   where night 3 arms the toys at 1. Night 2 is not a gentle night.
   **(b) The two Foxy causes are one mechanism seen twice** -- "locked on, no
   blackout covered the 10s interval" and "flashed the hall after Foxy locked
   on" are both D having already exceeded 3. The reset is what is missing, not
   the flash. `foxyExposureFrames = 100 * night` also means Foxy locks on
   *sooner* on Night 2 than Night 3, which is the other half of (a).
   **(c) Night 7's median death is 55 s -- most of its runs are dead inside the
   first in-game hour.** Checked, not assumed: the night-7 plan emits
   `#idle-until 0`, so this is not the opening idle. It is `foxyDormant`
   (engine.js, g872-874) holding D at zero for all of Night 1 and until 2 AM on
   Night 2, and for *no* part of Night 7, where Foxy is at his capped 17 from
   midnight. That is also why Night 1 is 1200/1200. So on Night 7 the question
   is what the opening does, not what the steady cycle does.

   **Before acting on (b), know the device-side gap that sits under it
   (from the concurrent session, 2026-08-27).** `sweepcheck.py` was measuring
   camera-switch **tearing**, not the flashlight -- a torn frame's whole-ROI
   mean is 173 against its own lit threshold of 86, where a clean lit frame is
   111. Fixed in `7b70927` (textured rows only, gated by four reference frames
   in `docs/img/tearing-vs-flash`), but the honest state is that **no
   instrument here has yet confirmed a flash landing on the device**, and the
   stun is game state that rendering cannot see. A Foxy-reset fix priced only
   in the gate would be a simulator result resting on an unmeasured actuator.

   **Not yet done:** nothing has been changed in the plan on the strength of
   this. It is a census, not a fix.

8. **REVERTED 2026-08-27, after a third refuted fix: the widened
   (CAM 10/04/07/11-dark) sweep from the interrupted `~/.codex` session had a
   real, unfixable-within-this-session stun-coverage gap on the transition
   into any 'attack'-shaped cycle -- opening or steady.** `tools/device/
   recipe.mjs`, `tools/hidpilottest.mjs`, `tools/device/trial/{02-hid-wire,
   10-minus7-sweep,11-plan-interpreter}.sh` and `tools/device/
   test-human-floor.sh` are checked out back to `803feb3` (`git checkout --`).
   Nothing about *when Minus 7 flashes which camera* changed -- the reverted
   code was purely the actuator's CAM 11 dark-park addition, undocumented
   anywhere (no HID-MULTITOUCH.md/ON-DEVICE-VALIDATION.md entry motivates it,
   unlike the already-committed 133 ms Fusion-poll widening in the same area,
   which stays). Full record of why, so this is not re-attempted blind:

   Found two independent ways:

   - `recipe.mjs`'s `assertStunCoverage` (added the same session, uncommitted)
     throws `opening -> attack: CAM 10 is unlit for 7200 ms` against the
     6666.7 ms (400-frame) stun budget, on every night 1-7. `clear -> attack`
     and `attack -> attack` are also over budget, by 33-66 ms per camera.
   - Independently, in the exact `hidpilottest.mjs` simulator (no recipe.mjs
     involved): `hidpilot n6 target` went 500/500 -> 0/500. Traced one seed to
     its mechanism, not just its symptom -- `withchica` (Withered Chica) sits
     gated on CAM 04 (`u.stunUntil`, refreshed every ~300-frame clear cycle)
     from frame 900 until frame 7116, where she advances. Her last CAM 04
     relight before that was frames [6709,6716), giving `stunUntil=7115`; the
     next scheduled relight (a `clear -> attack` transition, since the read at
     frame 8230/8530-equivalent classified `bb` on this seed) doesn't land
     until frame 7126 -- an 11-frame (183 ms) window in which she is
     unstunned, and her per-tick advance roll landed inside it. She reaches
     the office 40-frame marker-123 attack and completes it at frame 8653; the
     224+171+62 = 457/500 "Withered X completed the sourced 40-frame
     marker-123 attack" deaths are this same mechanism, not 457 unrelated
     bugs.

   **Root cause, confirmed by bisection (`git diff` reverted piece by piece
   against the same 500 seeds):** the dark CAM 11 park added to the sweep is
   real, needed device time (a fourth HID contact, priced correctly in
   `recipe.mjs`'s `SWEEP_ROUTE`/`sweepSpan`). Anchoring the *whole 4-contact
   macro's end* at the old boundary (so the extra contact doesn't overrun the
   cycle) pulls the *light* portion's own end earlier by one slot, which is
   exactly the two edges above run out of stun budget on.

   **Three "obvious" fixes were tried and all three are refuted, not merely
   unconvincing -- each closes the gap and breaks something else specifically
   tuned against the same lever:**
   1. *Don't count the park in the anchor; append it after the light's old
      end instead.* Implemented in `recipe.mjs`, then reverted after
      measurement: for the shipped `MODEL_SLOT_MS=120`/`DEVICE_SPACING_MS=133`
      pair, the underlying `hidpilottest.mjs` model's own CAM 07->CAM 11 gap
      already sits at exactly 133 ms, so the two anchor formulas are
      numerically identical here -- the edit was a no-op that would have
      shipped a false "fixes the 7200 ms gap" comment.
   2. *Shrink `maskMarginMs` (900 ms), the attack cycle's phase-safety margin,
      since a comment in `hidpilottest.mjs` calls it "the only place the
      extra stun gap can be paid from."* Closing the WORST edge
      (`opening -> attack`, 7200 ms) needs it down to ~300 ms; at 300 ms the
      human-gate's 300-seed screen collapses Night 6 to 0.3%, Night 7 to 0%.
   3. *A smaller, more surgical cut (900 -> 800 ms) closes only the
      RECURRING edges* (`clear -> attack`/`attack -> attack`, over budget by
      just 33-66 ms, not 533-566 -- confirmed algebraically: their outgoing
      side already has zero slack, its sweep ends exactly on the cycle
      boundary, so 800 ms is the exact value that makes `clear->attack`'s gap
      6633 ms, just under the 6666.7 ms budget). Measured full 1200 seeds,
      night 6: the "Withered X completed the attack" deaths it targets DID
      fall (99+65+33=197/300 at 900 ms -> 31+17+8=56/300 at 800 ms, one
      300-seed screen) -- **but Foxy deaths exploded in their place**
      (38+31=69/300 -> 126+109=235/300), because the SAME `off`/phaseMargin
      anchor that gates the first flash also fires the attack cycle's Foxy
      hall-reset (`leftAttack`'s comment: "the hall press... resets Foxy
      during the raise frame"). Whole-night 1200-seed verdict at 800 ms:
      night 2 19.8%, 3 34.7%, 4 13.1%, 5 2.6%, 6 0.2%, 7 0.0% -- worse than
      900 ms on every night but 2 and 3. There is no free lever left in this
      sequence: the five-tick mask hold is a sourced BB-repel requirement, the
      0.25 s hall-then-raise and 0.45 s raise-clearance are the SAME kind of
      measured animation floor `RAISE_JITTER_MARGIN_MS`/`MONITOR_ANIM_UP_MS`
      exist to protect elsewhere in this file, and no press can land at all
      while `maskOn` (`press()` drops every non-mask input). Closing this
      gap without breaking Foxy or the mask genuinely needs NEW device time,
      not a reshuffled budget -- e.g., a relight burst inserted before the
      monitor first lowers each cycle, while it is still up from the
      previous cycle's raise, which is unexplored and not a small change (it
      touches the runner's shared per-cycle entry point, not just the sweep).

   **Given that, and that this row of investigation had already run three
   refuted fixes without net progress, the decision is to revert rather than
   keep iterating on an unvalidated addition with no documented benefit.**
   The pre-existing (`803feb3`) 66/79/74/62/54/26% human-gate baseline
   (nights 2-7, 1200 seeds, confirmed by direct re-measurement this session)
   is restored and confirmed clean: `tools/test.mjs --engine` is
   **all checks passed**. If the CAM 11 dark park is worth its device-side
   benefit (whatever it was -- battery, desync recovery; never written down),
   it needs to be re-attempted as its own scoped, documented, gate-validated
   change, not resumed from this state.

   **Two adjacent, unambiguous fixes landed this session and are safe, and
   were kept through the revert (they do not touch the sweep):**
   `tools/device/test-cue-trace-loop.sh` was covering only one of the
   runner's two remote background loops (cue-trace; the newer cue-shadow loop
   added the same session was unguarded) -- rewritten to cover both, pinned to
   the actual loop count so a third goes uncovered loudly, and each is now
   proven to both progress (arm+result) and actually die on sentinel removal,
   not just fail to hang. The audio cue-helper's `heldout`-promotion gate was
   honour-system (`plans/08-audio-cue-controller.md` defect 2) -- closed:
   `provision-cue-model.sh` now reconstructs the exact shadow-form bytes a
   holdout report claims to have scored and hashes them, so a genuinely
   passing report from a DIFFERENT promotion can no longer be hand-pasted
   onto an unrelated model's header. `test-provision-cue-model.sh` is its
   first mock-ADB regression and proves the specific gap: the same fixture
   with only that one check removed installs a passing-but-wrong model clean.

9. **Standing goal, set 2026-08-27: iterate on Minus 7 until every night
   clears 70% under the human-gate.** Baseline to beat (1200 seeds,
   `803feb3`, confirmed this session): night 1 100.0%, 2 66.3%, 3 79.3%,
   4 73.8%, 5 62.0%, 6 54.0%, 7 26.0%. Four nights (2, 5, 6, 7) are below the
   bar. Per the death census in item 7, Foxy and office entries are 100% of
   all losses on every night, Foxy alone 52-88% of them -- so this is where
   effort goes, not wind or the audio controller. **Not reached. Two sessions
   have now attempted it (eviction, below; and the 2026-08-27 later session's
   jitter-robustness pass, item 11) -- both reverted clean, both documented
   rather than left half-built. Item 11's finding narrows the problem: the
   schedule already replays 100% on every night with no jitter, so what is
   open is slack-tolerance of one geometrically-wedged Foxy reset, not the
   route.**

   **The `bb.inside` mechanism, sourced and confirmed.** Traced one Foxy death
   to its exact cause, not just its symptom: `hallLightOn` requires
   `!bb.inside` (`[SOURCED: g75 (hall), g76/g77 (camera), g301/g303/g320
   (vent)]`, `src/engine.js:172`), and BB is walked `inside` -- not by
   lingering, but by *our own response*: `onCamsUp()` (`g417`, engine.js:677)
   sets it the instant the monitor is raised again while he is still
   `inOpening`, which the BB-response macro always does right after masking
   (to get back to flashing CAM 10/04/07). "He does not kill... Foxy finishes
   the job" is the engine's own comment. Once inside, every hall flash is a
   no-op regardless of how many are tried -- confirmed empirically:
   deterministic replay (no human-slack jitter) walks BB inside 0/1636 times
   across 300 seeds; jittered replay does it 55/1150 (4.8%) -- and D climbs
   unopposed (`tickMask` doubles his rate when nobody is credited as
   "in an opening") until he locks on.

   **Tried: Markiplier's eviction pattern (`docs/strategy/MINUS-7-STRATEGY.md`
   §9, "evict instead of suppress"), sourced and mechanically real --
   `fx.loc==='parts'` skips the `gotYou` lock-on check ENTIRELY
   (`engine.js:876`), a genuine 500-999 frame (8.3-16.6 s) immunity window,
   not a reduced-risk one. Confirmed by trace: one seed's Foxy did reach
   `parts` and got a real 16.6 s window. But it made every tested night
   WORSE, and is reverted (`git checkout --` on `recipe.mjs`/
   `hidpilottest.mjs`; the two files are back to `803feb3` byte-for-byte,
   `tools/test.mjs --engine` confirmed clean).**

   What was built: a periodic `evict` cycle (opt-in, `evictFoxy`/
   `clearCycleS` options; a genuinely separate named cycle alongside
   opening/clear/attack, captured from its own `HidPilot` run since
   `evictFoxy` is a whole-instance flag, substituted for `clear` every Nth
   cycle in `replay()`) -- widened to 6.2 s (using 1666.7 ms of the
   camera-stun budget's own slack, the same margin the reverted CAM11-park
   work in item 8 spent and lost) to fit a 1200 ms hall hold instead of the
   usual ~133 ms D-reset pulse.

   Two real, fixed bugs surfaced along the way and are worth keeping in mind
   if this is re-attempted: the legacy `secondBeat` code path had two stale
   spacing defects (a 16 ms gap and a 13 ms overlap) that predated
   `FUSION_POLL_MS` enforcement and were never brought forward with it; and a
   wind-hold formula in the new `evict` path was off by exactly one Fusion
   poll (used `camAt + MIN_CONTACT_FRAMES` where the original -- correctly --
   used `camAt + MIN_CONTACT_FRAMES + FUSION_POLL_FRAMES`), which was
   silently corrupting the PLAIN, non-evict `clear` cycle too before it was
   caught by `devicePlan()` itself refusing the plan -- worth remembering as
   a general lesson: verify a refactor against the unmodified baseline
   byte-for-byte, not just by eye.

   **Why it made things worse -- fully diagnosed, not left open. Two
   separate, both-confirmed causes, found in this order:**

   1. **Widening the cycle length is independently destructive, regardless
      of eviction.** Isolated with a controlled A/B that changed nothing
      else -- identical `plan.clear`/`plan.attack` content, only the read
      cadence moved from 5 s to 6.2 s (a hand-rolled `replay()` copy, no
      tracked-file changes, so this cost nothing to verify): BB walk-ins
      (the `bb.inside` mechanism two paragraphs up) went **55/300 -> 167/300**
      and night 6 survival **161/300 -> 0/300**. Fewer reads per night means
      BB is detected later on average, giving him more time to still be
      `inOpening` when a routine cams-up event (not even a response --
      *any* monitor raise) walks him inside. **5 s read cadence is
      load-bearing on its own merits; do not widen it for any reason without
      re-measuring this specific number.**
   2. **Even holding cadence fixed at exactly 5000 ms and funding the wider
      pulse purely from that cycle's own wind time (in place, same
      `raiseAt`/`camAt`/`windAt` dynamic-spacing technique that made the
      `evict` cycle's plan build cleanly), Foxy deaths still roughly
      TRIPLED** (evictPulseMs 300 -> 224/300 foxy deaths, 500 -> 239/300,
      vs. 69/300 at the unwidened 130 ms baseline) **and this reproduces
      deterministically, with zero human-slack jitter** (0/300 survived) --
      ruling out jitter-sensitivity as the cause and making it traceable.
      The trace found the actual mechanism: `fx.D` is **not** reset while
      Foxy is dormant (`loc==='parts'`) -- only a slow, hall-light-gated
      -1-per-30-frames decay applies there, far short of keeping pace with
      the unconditional +1/s (or +2/s while masked) accumulation. Worse,
      the SAME formula (`eq() = 21+rand(0,4)-D <= ai.foxy`) gates BOTH his
      arrival from `parts` back to `hall` AND his lock-on -- so D must
      already be near the lock-on threshold just to trigger the arrival
      transition. A traced deterministic run showed this exactly: dormant
      and safe for 16 s (t=354-370), arrived back in `hall` with **D
      already at 18**, no reset landed in the following 5 s, and he locked
      on at D=23 at t=375. **Sending Foxy to sleep does not reset his danger
      meter -- it lets it climb unmanaged, then wakes him already primed.**
      This is not a tuning problem the same lever can fix by degree; more
      exposure spent per cycle produces MORE wake-up events, each one a
      near-immediate lock-on risk, not fewer total risk-seconds.

   **The conclusion this repository should treat as settled, not
   re-attempted the same way:** canonical Minus 7's uniform, every-cycle
   suppression is not incidental -- it is *why* the strategy is safe. It
   works by never letting D approach the threshold `eq()` needs at all.
   Eviction requires the opposite precondition (D near-threshold) to even
   begin, so it cannot be bolted onto the low-D-always policy as an
   occasional extra beat; the two are mechanically opposed, not
   complementary, and this session's numbers are the proof, not a
   suspicion. `docs/strategy/MINUS-7-STRATEGY.md` §9 already said as much in
   prose (*"Take from it the eviction pattern and the metronome trick; keep
   the timer"* -- not both mechanisms in the same policy) and this is the
   measured confirmation of why.

   **If eviction is revisited, it needs a different shape than anything
   tried here:** not "spend more toward eviction," but a cycle type that
   tracks *when* an eviction happened (against `FOXY_RETURN_MIN`/`MAX`,
   500-999 frames) and schedules a rapid, targeted reset right at his
   predicted wake window, rather than waiting for the next routine ~5 s
   pulse. That needs cross-cycle state this policy does not carry today
   (nothing here remembers "an eviction happened N frames ago") and is
   real, unstarted scope -- not a parameter to sweep further.

   Both `tools/hidpilottest.mjs` and `tools/device/recipe.mjs` are
   `git checkout --`-clean at `803feb3` after this; nothing from this
   investigation is left half-applied in the tracked files.

10. **NEW 2026-08-27, same session, real remaining promise (not a dead end
    like eviction): audio-confirmed BB departure, in the fast simulator
    only, no device involved.** `48 of 69 (70%) of night 6's Foxy deaths are
    BB-chained` (measured: a Foxy death within 30 s of a BB walk-in). The
    walk-in itself was traced to one frame: the response macro's mask-off
    (`off = b + s(5.02) + phaseMargin(900ms)`) landed **33 ms before** BB's
    5th mask-tick (`VENT_MASK_TICKS=5`, `bbLeave()`), so the monitor raised
    while he was still `inOpening` and `onCamsUp()` walked him inside --
    which then permanently disables the hall-light Foxy-reset for as long as
    he stays there (`hallLightOn` requires `!bb.inside`, already documented
    above). `phaseMargin` is a *guess padded for the worst case* because the
    policy cannot see the game's 1-second tick phase; `bbLeave()` itself
    emits a real, sourced bang the instant he actually leaves (same cue as
    every other vent-bang, `THUD_SAMPLE`) -- `tools/device/bb-cue-state.mjs`
    already anticipated exactly this ("The departure bang can arrive early
    ... without its timestamp the full-duration recovery deadline is
    unknowable"). Building `off` from that bang's real timestamp instead of
    a fixed guess is a fundamentally different, better-motivated lever than
    anything else tried tonight -- it does not fight an existing safety
    mechanism the way eviction does.

    **First measurement was wrong, and the correction matters more than the
    original claim -- this is its own "numbers need their control" case.**
    A hand-rolled `replay()` variant (scratch file, not a tracked-file
    change -- shipped code untouched throughout) hooked `sim.events` for
    `{type:'vent-bang', data:{who:'bb', leaving:true}}` and anchored `off`
    to `bangEvent.f + audioLatencyMs` instead of the fixed formula. First
    pass reported Foxy deaths on night 6 falling from 69/300 to 7-12/300 --
    but that number was never checked against a control. Adding one (the
    same scaffolding with the bang trigger effectively disabled, which
    *must* reproduce vanilla `replay()`'s numbers almost exactly if the
    harness is sound) found it did not: 44/100 vs vanilla's 68/100 survived,
    a real bug, not audio-related. Cause: the fallback path recomputed
    `off` as `b + s(5.02) + phaseMargin` in raw milliseconds instead of
    reading the actual frame-quantized offset baked into `plan.attack`'s
    own emitted text (`+5857 ms`, not the ~5920 ms the approximation
    produced) -- a few frames of drift per cycle that compounded into a
    fully diverged run over 420 s. Fixed by extracting `plan.attack`'s real
    offset once (`+plan.attack[2].split(' ')[0]`) and using it for both the
    deadline and the post-bang re-anchor; sanity check afterward: 171/300 vs
    vanilla's 161/300 (small residual gap from independent-rounding noise
    in the hand-rolled `parse()`, not a logic bug -- acceptable for this
    prototype's purpose).

    **With the bug fixed, the honest numbers are far weaker than first
    reported.** Night 6, swept `audioLatencyMs` 50/100/200/300 ms (all
    unmeasured placeholders -- see below): survived 34-50/300 across the
    sweep, against baseline's 161/300. Foxy deaths did drop, but only
    modestly (69 -> ~54-58, roughly 20%, not 69 -> 7-12) -- and
    Withered-character inside-office deaths rose sharply enough (Withered
    Chica 72-83/300 alone, Withered Freddy 55-67/300) to make every tested
    configuration a net loss, not a near-win. The mechanism insight from the
    corrected run stands even though the first number was wrong: BB→Foxy
    chaining is real and the bang-anchoring idea does reduce it somewhat,
    but the naive implementation (waiting for the bang delays whatever comes
    after it, and nothing can be pressed while masked, so the wait's length
    is paid entirely in CAM 10/04/07 stun-coverage risk) costs more than it
    saves as built.

    **Not a dead end -- an unfinished design, now correctly scoped smaller
    than first thought.** The fix is not another deadline tweak: it is
    decoupling the CAM 10/04/07 stun-refresh from the bang-wait so the
    wait's length stops being paid in stun-coverage risk. Concretely
    unexplored:
    - Does the *previous* cycle's own trailing sweep have slack to move
      later specifically ahead of an anticipated attack branch, the same
      kind of budget accounting `assertStunCoverage` already does in
      `recipe.mjs` (item 8 above) -- paid for by knowing the wait is usually
      short (audio-informed), not by a blind worst case?
    - Is there a way to keep a minimal camera presence (even briefly)
      separate from the masked block, exploiting some other room in the
      engine's input rules not yet checked?
    - The real audio latency (package 3 of `plans/08-audio-cue-controller.md`)
      is still unmeasured -- `close→MISS latency cannot be observed, because
      completeIfExpired is only reached from accept() or a RESULT poll` per
      that plan's own status. 50-300 ms here are placeholders swept for
      sensitivity, not numbers to build on, and the sweep shows the result
      is NOT latency-sensitive in this range (34-50/300 throughout) -- the
      stun-coverage cost dominates regardless of how fast detection is,
      which is itself useful: fixing detection latency alone will not save
      this design without also fixing the stun-refresh coupling.
    - This also needs the cue-helper's own remaining defects closed first
      (`plans/08-audio-cue-controller.md`'s open packages 2/3/5/6) before
      ANY of this could run on a real device -- this finding is
      simulator-only, and deliberately so per this session's own
      instruction to check the simulator before the device.

    **Process lesson worth keeping alongside the technical one:** the first
    (wrong, dramatic) number was reported to the user before it was
    controlled. It should have been checked against the disabled-trigger
    case immediately, the same reflex this repository already documents
    elsewhere ("Numbers need their control"). Caught and corrected the same
    session, but the corrected number is the one that belongs in anyone's
    memory of this finding, not the first one.

    Scratch prototype (session-local, not preserved in the repo -- re-derive
    from this description): `.../scratchpad/audio_replay_module.mjs`
    (the `audioReplay()` function) and `.../scratchpad/final_check.mjs`
    (the sanity check + latency sweep that produced the corrected numbers).
    (session-local temp path, not preserved in the repo -- re-derive from
    this description rather than hunting for the file).


11. **NEW 2026-08-27, later session, same standing goal (item 9). No lever
    shipped; the schedule was found to already be perfect and the gap is
    entirely a robustness-model question. Reverted clean, documented here.**

    **The headline: the emitted device plan replays 400/400 = 100% on every
    night 1-7 with zero human-slack jitter** (`replay(plan, {night, seed})`
    over seeds 1..400, no `jitterPlan`). Night 7 included. The whole sub-70
    ladder -- n2 63%, n5 59%, n6 51%, n7 27% at ±60 ms iid over 400 seeds --
    is produced by `human-gate.mjs`'s jitter model, not by anything the
    schedule does wrong. Item 9's "deterministic replay walks BB inside
    0/1636" is the same fact seen narrowly; stated plainly, **the Minus 7
    device schedule is correct on all seven nights and the open problem is
    slack-tolerance of the Foxy resets, nothing else.**

    **A specific fragility, and why it cannot be widened.** The attack
    cycle's post-mask Foxy reset is `hold(off + s(0.25), hallPulse, 'light')`
    with `off` the mask-off tap. `s(0.25)` = 15 frames = **exactly
    `MASK_ANIM_OFF`** (`src/config.js:487`). `hallLightOn` needs
    `maskFullyOff` (`engine.js:181`), so with each row taking an independent
    ±60 ms draw the hall lands `0.25 ± 0.13 s` after the mask-off's own
    `±0.06 s` -- inside the 0.25 s animation on roughly half the draws, and
    resets nothing. `leftClear` documents this exact trap for its own early
    slot. The obvious fix (delay the hall past the animation) is blocked: the
    sweep at `off + s(0.45)` is hard-pinned by the 400-frame Withered stun
    budget -- measured, pushing it 7 frames (`off+0.45 -> off+0.54`)
    collapses nights 5-7 to inside-office (Withered Chica/Freddy) at
    100-160/300. Same wall item 8 hit from the other side.

    **A pre-read reset works mechanically but is blocked by Golden Freddy.**
    `lightHeld` and `ventLightL` are independent, so a hall pulse fired
    *during* the read (while the vent light is held, monitor down, mask off)
    is a valid Foxy reset and lands ~0.3 s before the prophylactic mask --
    entering the attack cycle's masked hold at D≈0 instead of D≈3, which is
    the masked-span 5 s check (n6/n7's dominant Foxy lock). But: (a) any
    GF-clear mask blip ahead of it delays the read past the sourced 45-frame
    office-defense fuse and Withered/Toy office entries explode; (b) a naked
    flash kills outright on Golden Freddy (`onLightPress`, `engine.js:274`),
    and GF spawns (g336: monitor fully up on a 5 s check) at the attack
    cycle's monitor-up recovery check ~1 per seed on Night 7. Suppressing
    that spawn needs a monitor-down beat in the attack cycle's tail, which
    re-opens the same wind/stun budget the reset needed.

    **The opening has no Golden Freddy clear at all** -- unlike every steady
    cycle, whose prophylactic mask clears him. Adding a monitor-down mask
    flick straddling the frame-300 check looked like a +4-8 point win on
    every night at 300-800 seeds. **At 1200 seeds it is gate-neutral to
    slightly negative** (n6 673→646, n2 ~801, n7 ~326 -- all inside binomial
    noise). This is the item-9-style trap again at the iteration level: at
    p≈0.55 the 2σ interval over 400 seeds is ±10 points, so a 300-800 seed
    A/B measures the block, not the rate. Every apparent win this session
    evaporated at 1200 seeds. **Do not accept a Minus 7 ladder change on
    under ~1200 seeds.**

    **Conclusion, consistent with items 8-10:** the schedule is right, the
    remaining nights are lost to iid-jitter fragility in a reset that is
    geometrically wedged (mask animation on one side, Withered stun budget on
    the other), and `human-gate.mjs`'s own comment already flags iid as the
    wrong shape ("humans clear at per-step error the iid model calls fatal";
    correlated per-step bands pending). Under a rough correlated model
    (one shared per-cycle draw + a small iid term, 90% shared) the same
    unchanged plans sit at n2 71, n5 64, n6 64, n7 41 -- still not 70
    everywhere, but the gap is a model artifact as much as a schedule one.
    The real levers are item 10's bang-anchored `off` (decoupled from the
    stun refresh) and item 8's "new device time" -- not another timing sweep
    on the current geometry.

    **Also found: `tools/strategysearch.mjs` is stale and throws on start** --
    `buildCycle(TARGET_CAMS) no longer reproduces DEFAULT_CYCLE` (line 77).
    `DEFAULT_CYCLE` was retimed 2026-08-24 for the post-mask flash lockout and
    `strategysearch`'s own `buildCycle` was not brought forward; `cyclesearch.mjs`
    stayed in sync (it asserts `genCycle(KNOBS0) === DEFAULT_CYCLE` and passes).
    Neither search touches the device route anyway (both operate on
    `bbtest.mjs`'s abstract reactive cycle, not `hidpilottest`/`recipe.mjs`),
    so this did not block item 11; noting it so a future session does not
    rediscover the crash. **Fixed in the plan-16 work below** (`strategysearch`
    now shares `cyclesearch`'s `genCycle`).

12. **NEW 2026-08-27: `plans/16-constrained-policy-search.md` opened and pkgs
    1-3 built.** The structured vehicle for the standing goal (item 9), after
    items 8-11 exhausted hand-tuning. See that plan's progress log for detail;
    the two things a cold session needs from here:

    - **`human-gate.mjs` now takes a slack `shape`** (`iid` default, `common`,
      `correlated`). Under `correlated` -- which `human-gate.mjs`'s own header
      says is the right shape -- the **unchanged 803feb3 plan** is n2 ~70,
      n5 ~63, n6 ~62, n7 ~33, versus iid's 66/62/54/26. Less fragile than iid
      claims, but n5/n6/n7 still miss 70 with no change.
    - **`tools/minus7/paramsearch.mjs`** is the search: dominance-pruned beam
      over `hidpilottest.mjs` `SEARCH_KNOBS` (all default-inert), evaluated
      `recipe.build -> devicePlan -> modelGate`, 1200-seed frontier admission.

    **Closed 2026-08-27, all measured, all in plan 16's progress log.** The
    constrained timing space is exhausted and every lever is a hard wall:
    (a) the masked-span Foxy decoupling is geometrically impossible -- pushing
    `off` +50 ms drops n5/n6/n7 to 46/45/26 correlated; (b) `openGfFlick`
    collapses correlated to a GF massacre (40/38/3); (c) the pre-read hall
    evicts Foxy (n6/n7 -> 0); (d) the one gate-improving candidate
    (`attackSweepDeltaMs:-17`) is a **gate-overfit** -- +Pareto against
    `human-gate.mjs` (readLatency 550) but 0-1/500 on `hidpilot n6 target`
    (readLatency 480); (e) the **shorter (7 s / variable-length) attack
    cycle** collapses monotonically below 10 s. `attackWindowMs` is now a
    threaded parameter (`hidpilottest.mjs` `attackWindow` -> `recipe.build`
    -> `replay` via the `#cycle attack N` header, default 10000 = every plan
    byte-identical) and `tools/minus7/cyclelengthsearch.mjs` sweeps it
    against every pinned actuator config. Gate n5/n6/n7 correlated goes
    **63/63/33 at 10 s -> 37/0/0 at 9 s -> 0/0/0 at 7 s**, and `n6target`
    (readLatency 480) goes **100 -> 0 by 8 s**; 10 s exactly reproduces
    `803feb3` (the regression fixture). There is no basin at 7 s -- it is a
    smooth cliff, and the failure mass moves from Foxy toward Golden Freddy
    and inside-office as W shrinks, which is the phase-lock signature.
    **Cause:** a 10 s attack cycle is exactly two 5 s movement-opportunity
    grid periods (`MO_FRAMES` x 2), so it preserves the clear cycle's
    monitor-down 5 s-check phase -- which is what keeps Golden Freddy from
    spawning (g336) and the Foxy checks landing at low D. Any other length
    permanently shifts that phase after the first BB response; the clear
    cycles never re-align. 5 s is too short for the 5-tick BB hold + reset +
    sweep; 15 s is worse. **The 10 s attack cycle is load-bearing, not a
    tunable.**

    **Conclusion: nights 5/6/7 to 70% need NEW DEVICE TIME**, not a
    scheduling change. The purely-simulator search is done; the next step is
    item 13.

    **Extended and closed 2026-08-27 (`740f5b0`), and the "need new device
    time" conclusion is now precise.** Two more levers were built and gated at
    1200 seeds:
    - **The sweep geometry** (`tools/minus7/geometrysearch.mjs`; the LIGHT_AFTER
      breakthrough lets `devicePlan` emit the sweep NARROW, which re-phases the
      cycle). Every `dev≈62` geometry lifts min(n2-6) 59→70 correlated and
      holds at the 480 latch, but it is a **phase-lock spike** — the ±ms
      neighbourhood collapses to ~46, it fails the iid bar (n6 ~62), and it
      drops n7 to 13-18. Marginal; pending device validation of the ~4 ms
      basin. `paramsearch.mjs` now takes a `--geom` context so timing knobs
      can search on top of a fixed geometry.
    - **Item 10, bang-anchored attack raise** (`SEARCH_KNOBS.attackBangGateMs`,
      default 0). At a **perfect instant bang oracle** it clears n2-n6 to ~90%
      on both shapes; at **100 ms bang-detection latency it is worse than
      blind**; at 200 ms near-total collapse. The recovery sweep is pinned to
      the cycle end, so acting on the bang late drags the sweep late and toy
      coverage collapses. Recorded negative. n7 barely moves (its Foxy deaths
      are not in the attack cycle).

    So the shape of "new device time" is now specific: a real actuator that
    holds a ~4 ms sweep-spacing basin under its own jitter, or a cheaper path
    to `hallView` for a second clear-cycle Foxy reset (n7). **The audio route
    is out** — item 10's early-unmask needs a bang latency < ~33 ms end-to-end
    for a useful gain (`tools/minus7/i10latency.mjs`), below what Android audio
    can deliver (CDD: ≤30 ms for continuous PCM delivery alone). A fast bang
    detector would not unlock it; `plans/08` §"The latency budget an
    early-unmask would need".

    **n7 update (plan 16 pkg 5, `tools/minus7/n7probe.mjs`): the opener is
    refuted, not a factor.** A perfect opening Foxy reset moves n7 by 0.0.
    n7's Foxy deaths are the **clear** cycle's two resets (b+1.38, b+3.10)
    missing under jitter — perfect execution of just those two → n7 33 → 61 %,
    and the remaining 39 % is office entries (the geometry lever). So n7 → 70 %
    needs a jitter-robust *second* clear-cycle Foxy reset (which pkg 4 shows
    cannot clear `MASK_ANIM_OFF` without the 400-frame sweep pin — new device
    time) plus the tight geometry. Not an opener change, and not the
    attack-cycle geometry item 10 targets.

13. **NEXT STEP -- device-actuator overhead, the only thing item 9 is now
    blocked on.** The masked-span Foxy check on nights 6/7 (and the eviction
    runaway on 5) is fatal because the attack cycle has no room for an extra
    hall reset: a monitor-down -> hall -> monitor-up beat costs ~600-900 ms
    (`MONITOR_ANIM_DOWN` 22 fr + `MONITOR_ANIM_UP` 12 fr + a ~130 ms hall
    contact + two Fusion-poll gaps), and the measured phone leaves only
    ~680 ms of discretionary time per 5 s cycle (`HID-MULTITOUCH.md`). The
    sweep, the wind and the 5-tick mask are all load-bearing, so the
    milliseconds are not there to take.

    **What "new device time" concretely means, in decreasing order of
    likely payoff:**
    - **A cheaper Foxy reset.** The reset needs `hallLightOn`, which needs
      the monitor NOT up (`hallView`) and the mask fully off. The ~370 ms
      monitor-down + ~200 ms monitor-up animation is most of the cost. Is
      there a shorter path to `hallView` on the phone -- e.g. the monitor
      already mid-lower from the cycle's own read, so the reset rides an
      animation the schedule was already paying for? `recipe.mjs`'s
      `foldMaskRaise` / `clearTheRaise` already do this kind of accounting
      for the mask-off + raise seam; the question is whether the hall reset
      can be folded into the read's own monitor-down the same way.
    - **A faster actuator.** The HID route's per-macro wall-time is one
      boundary draw plus `hid_delay` spacing (`HID-MULTITOUCH.md`
      "Answered: 120 ms spacing"). If the inter-press floor can go below
      133 ms measured on the phone (the 2026-08-27 literature survey found
      nothing in Android/evdev/uinput imposing one -- `HID-MULTITOUCH.md`
      "Input injection and sequential budgets"), the sweep tightens and
      frees slack for the reset.
    - **A dual-purpose input.** The hall reset and the recovery sweep both
      raise the monitor. `leftAttack` already queues the hall press before
      the simultaneous monitor raise so it "resets Foxy during the raise
      frame". Can a SECOND reset be folded into the recovery sweep's raise
      the same way, at the cost of only the hall contact?

    **How to measure it:** the levers above are all things the exact engine
    can price -- `recipe.mjs`'s budget accounting, `cyclelengthsearch.mjs`'s
    per-actuator-config scoring, and a real device trace (`grade-run.sh`,
    `test-hid-trace.mjs`) for the inter-press floor. The one thing this must
    NOT do is shrink a simulated delay the phone cannot actually hit --
    `ANDROID-SOURCE-STATUS.md` "The simulator prices nothing". Any candidate
    that clears the sub-70 nights only by assuming a faster phone than the
    HID trace shows is a simulator-only result, not a route.

    **CORRECTED 2026-08-27 (two sessions, `66` and `55`). This item's
    framing was partly wrong and partly right: the *reset cost* it computes
    is mostly game constants, and the *read-capture cost* moves nothing --
    but there IS one device number that moves the nights, and this item never
    isolated it. The paragraphs above are kept; the specifics change.**

    - **Two of the three cited "device times" are sourced *game* constants.**
      `MONITOR_ANIM_DOWN` (367 ms) + `MONITOR_ANIM_UP` (204 ms) = 571 ms of
      the quoted 600-900 ms reset cost is the decompiled Android build-296
      animation bank (`src/config.js:481`, `SOURCED`). No actuator and no
      capture method moves it; only folding the reset into an animation the
      schedule already pays (lever 1) can.

    - **The read-capture cost moves nothing.** Sweeping `readLatencyMs`
      550 -> 100 and `classifyMs` 250 -> 20 through `replay()` /
      `human-gate.mjs` moves n5/n6/n7 by **< 1 point** (session `66`, 400-600
      seeds). `hidpilottest.run` without `deviceActuator` is 100% at every
      read latency; with it, 0% at every read latency (the unmodeled
      forcedown cascade, not the read). So the 225 ms `screencap` BB read is
      real device cost but not a survival lever -- the `plans/15` migration
      of it to the cue helper's ~59 ms `GRID` path is architecture and
      honesty, not a night fix.

    - **The sweep selection spacing IS the lever, and 113 ms is a sweet
      spot.** Session `55`'s `tools/minus7/devicetimesearch.mjs` (see
      `plans/16` progress log) isolated every device number and found only
      this one moves the ladder. Emitted spacing 133 -> 123 -> 113 ms
      (`sweepSlotMs` 120/110/100): **n2 68 -> 75, n5 62 -> 70 -> 73,
      n6 61 -> 68 -> 72, and n7 34 -> 39 -> 43** (its best-ever). The pinned
      `n6target` configs hold 500/500. It only breaks *below* 113: at 103 ms
      n7 falls to 32 on a phase break. **The lever sits below the
      device-validated 133 ms floor** (`HID-MULTITOUCH.md`: 100 ms contact +
      one full released Fusion poll; the CAM-07 last-flash finding is exactly
      this boundary -- at 120 ms spacing the released interval is 20 ms
      against a 33 ms poll). So nights 2-6 to 70% is a **113 ms sweep
      actuator** -- lever 2 above, now priced -- not the reset cost this item
      leads with.

    - **Night 7 is still short at 113 ms (43), for reasons unrelated to
      spacing.** Tightening the sweep helps n7 monotonically down to 113;
      there is no 2-6-vs-7 tradeoff until 103 ms. n7's remaining gap is the
      jitter-shape fix and the bang-anchored reset -- see the N7 block under
      "Very next step".

    The `~680 ms free per cycle` figure is a steady-5 s-cycle number, and
    this item mis-applies it to the 10 s attack cycle where the monitor
    animations it counts as "reset cost" are already spent on the read and
    recovery.


**Legibility/maintainability/coherence pass, closed 2026-08-26 (`084a8d7`..`fb68baf`).**
Nothing from it is outstanding and the engine suite is green on `222278d`. What
a later session needs to know:

- **`tools/device/trial-minus7.sh` is now `tools/device/trial.sh`**, and the
  1619-line heredoc that runs on the phone is assembled from named parts under
  `tools/device/trial/` (`10-minus7-sweep.sh` is the strategy,
  `08-bb-threat-response.sh` is the Balloon Boy read). The assembled text is
  byte-identical to the old heredoc, so nothing the device runs changed. **Cite
  driver code by part name, not by `trial.sh:NNNN`** — three citations in this
  file were already dangling and are re-pointed.
- **Four gates now read the assembled driver rather than grepping the runner**,
  which exposed six checks asserting device-side facts against host text. The
  host/device boundary is visible for the first time; keep it that way.
- **New gates, all in `tools/test.mjs`:** `trial assembly`, `screen map`,
  `docs`, plus `screencheck`, `select-adb` and `preflight`, which previously ran
  nowhere. `test-grade-run-coverage.mjs` now fails when a gate an exclusion
  *cites* does not exist or does not run.
- **Two things stay open and are deliberate, not forgotten.** `tools/device`
  remains physically flat (the taxonomy is machine-checked in the exclusion map
  instead; moving 83 files is not a surgical refactor). And the **Fusion
  touch-poll rate is asserted 30 Hz in eight places and measured never** — it
  had fallen out of both tracking documents, so it now lives in
  `HID-MULTITOUCH.md` §"Open: the tick rate is asserted twice and measured
  never". The recording-rate half is closed: `grade-run.sh` probes with
  `ffprobe` and refuses a capture that is not the rate its graders assume.
- **What kills Night 1, measured:** in the simulator only the Puppet, 7/1200,
  and they are the **same seven seeds on every night** — a fixed human-slack
  pattern, not night difficulty. Jitter never changes a hold's length, only
  where it lands, so it is wind *timing* rather than wind budget. On the phone
  Night 1 is cleared and the near-miss was desync, absorbed by 4192 frames of
  flashlight headroom that Nights 5-6 do not have.

The live hardware thread below is the next action.


**Live hardware thread, 2026-08-26 22:05 BRT -- the cue helper's sensor was
mischaracterised, and one anchor survives it.** Measured on the phone: the
`20x9` grid **point-samples ~180 source pixels**; it is not a small image, and
`ONE-PIXEL-VISION.md` §3 said the opposite (`a1abafa`). So the lit camera
button is visible to the helper on **7 of 12** cameras -- 194 or 0-10, nothing
between -- and on the five it misses the office scores *higher*, inverting the
classifier. Mean luma overlaps too. The **near-grey cell count over the whole
grid** separates office 142-145 from monitor-up 173-180 and is now emitted as
`grey=` in the snapshot (`ScreenStats`, gated host-side by `ScreenStatsTest`).

The APK is **installed and `grey=178` reads live**. The resync verification now
decides on it (`cams_still_up()`, gated by `test-plan-interpreter.sh`): the old
`luma >= 180` arm was calibrated over 1818 samples of night 6-34, whose route
sits on CAM 11 all night, and **cleared 180 on CAM 11 alone** -- this route
selects cams 10, 04, 07 and 11, reading 0, 106, 47 and 226. It was blind on
three of the four cameras a desync can leave selected.

**Corrected within the hour:** this first said that is "why night 1's single
resync failed". It is not. `n1-full-1640` ran with **`CUE_HELPER=0`** -- its
session manifest records it -- so `CUE_PORT` was `-` and the verification
branch never ran at all. The luma blindness is measured and real; it did not
cause that failure. **Any rerun must set `CUE_HELPER=1`**, or it repeats the
same blind run and records no `grey=` either.

**RETRACTED 2026-08-26, same evening: `grey=` cannot verify the resync and no
threshold through it can.** The office band 142-145 came from five idle
captures on a parked device. Graded against the cleared run's own office reads
(`captures/n1-grey-2202-run.log`, 77 samples of `cue[... grey=N ...]`), office
grey runs **138-180, median 151, with 21 of 77 at or above 159** -- 16 of them
a confident `empty` (an office frame by construction) and 5 on frames where
`$CHECKER match` itself answered `cams=down`. The office reaches the top of the
monitor-up band; the populations overlap completely. Every one of those 21
would have sent the retry press into a monitor that was already down, *raising*
it -- the exact desync the corrector exists to repair.

`cams_still_up()` now re-asks the **device-graded detector that fired**: the
same `$CHECKER match` on the same region, hoisted into `CUE_MONITOR_ROI` so the
recovery cannot drift from the detection (`test-plan-interpreter.sh` pins the
single definition, both uses, and that no reading which is not a positive
`match` reports "still up"). It costs a screencap (~225 ms) that only this path
can pay: it already waits `MONITOR_ANIM_DOWN` (367 ms) for the flip.

`grey=` is still logged and now decides nothing. The 77-sample distribution is
the first *live* population it has, and it is why the calibration below is not
merely incomplete but was measured on the wrong device state. Still unsampled,
and still the reason to keep logging it: an office with an animatronic present,
and the blackout. The mask reads 175, inside the monitor-up band.

**Landed 2026-08-26 21:20 BRT, and it contradicts something the repository
said:** the **double-camera glitch transfers to Android**. A retained classifier
frame from the cleared Night 1 (`n1-full-1640`, runner clock 92879 ms) shows CAM
04 and CAM 07 lit at once; re-read against the dump, the camera selection is two
fields (`viewing` counter 55 / `your view` marker 126) and the monitor-raise
restore (g1 → g2) writes only the first, from a `last viewed` that g263 samples
every 200 ms. Groups 450-457 read the marker for *who* is stunned and `viewing`
for the `<> 8 / <> 9 / <> 11` immunity, so the exclusions are bypassable. Four
documents plus `minus2test.mjs`'s header said the opposite and are corrected in
place. **Nothing is modelled or measured**: the engine has no two-camera state,
no glitch-aware probe exists, and nobody has tried to arm it on the phone —
that is plan 02's new package 2a. Full sourcing and controls:
`docs/android/ANDROID-SOURCE-STATUS.md` §"2026-08-26: the double-camera glitch
*does* transfer". **Superseded 2026-08-28:** all three are now answered through
one deliberate device arm and the gated engine probe; repeatability and an
on-device Toy-stun observation remain open. **This does not change the hardware thread below**, which is
still the live next action.

**Resume point, written 2026-08-26 20:01 BRT.** Four scoped changes landed on
`master` this pass:

- `e04924c` makes the session producer use an OS monotonic clock shared across
  its separate Python processes. In this environment `time.monotonic()` is
  process-relative; it produced negative, out-of-order manifest events. The
  end-to-end session producer gate now passes.
- `98eb7ff` removes the runner's duplicate sweep-light constant and incomplete
  coordinate resolver, and structurally gates every remaining HID timestamp
  against a freshly frozen value.
- `d5cb725` resolves the deliberately red cycle-seam check. The emitted sweep
  ends on the nominal boundary, but the runner delivers the next anchor after
  a drift-aware **33 ms** released gap. The plan did not need to move.
- `ff8fc00` adds and gates a generic, fractional intro-card classifier. It says
  `intro`, never guesses the night ordinal. On local real evidence it accepts
  5/5 Night 1 card frames, rejects 21/21 non-card frames and all 17/17 6 AM
  frames, and the cleared Night 1 timelines from intro through a positive 6 AM.

**Closed 2026-08-26: the source pass landed and the gate is green again.**
This block said the working tree was dirty with an in-flight marker-123 source
pass and that `simtest` was failing on W. Bonnie's hall-light B tail. That pass
is committed as `47dcd1b` ("Split the reaction window from the committed
attack"), the tree is clean, and `node tools/test.mjs --engine` passes every
check. Nothing is blocked on it, and Plan 13's next gate no longer waits on a
reconciliation that already happened.

*Kept rather than deleted, because the staleness is the lesson.* This paragraph
is the first thing a cold session reads, and it stood for hours after the
condition it describes had cleared — sending the next session to redo finished
work and to hold off the phone for a red suite that was green. CLAUDE.md's rule
is that the "Very next step" is re-pointed *the moment* it is finished, not at
the end of a session that may not have an end.

**The hardware ladder is Night 2, not Night 6.** The live title observer reads
`items=continue,newGame`, so Sixth Night is not unlocked. The device owner
directly confirmed the open game's Continue label says **Night 2**. Once the
suite is green, run the bounded fork-free-clock check with a trace:

```sh
BB_LEFT_MODEL=captures/screencheck/bb-left/models/runtime-gh.scm \
NIGHT=continue CALIBRATION_STORY_NIGHT=2 STORY_CURSOR_OBSERVED=2 \
HID_TRACE_RUN=1 GRADE_RUN=1 \
tools/device/trial.sh n2-clock-cycle-20260826 1
```

If its real-cycle log proves the clock and delivered seam, attempt the full
Night 2 immediately with a fresh run name and `90` cycles. A clear must be
proved by positive 6 AM **and** the title/save cursor advancing to Night 3.

# NIGHT 1 IS CLEARED ON THE DEVICE.

The first full-night stock-device clear this project has recorded. Run
`n1-full-1640`, 2026-08-26.

**The proof is the save, not a classifier.** The label under `Continue` read
**Night 1** before the run — checked twice at full resolution — and reads
**Night 2** after it. The device owner watched the 6 AM screen. The driver
printed `night6-left finished: 74 cycles` at **417.9 s** of a 420 s night, and
the capture saved as `n1-full-1640.mp4`, not `-aborted`. Re-graded after the
fix below, `grade-night.py` reports **420.2 s alive**.

**The save cursor now sits at Night 2**, so a repeat of this command plays
Night 2, not Night 1. `STORY_CURSOR_OBSERVED` must be set to what is actually
on screen; it is checked against the requested night and refuses on mismatch.

```sh
BB_LEFT_MODEL=captures/screencheck/bb-left/models/runtime-gh.scm \
NIGHT=continue CALIBRATION_STORY_NIGHT=2 STORY_CURSOR_OBSERVED=2 \
tools/device/trial.sh NAME 90
```

**Read this before celebrating it.** The run desynced roughly **eight times and
the runner noticed once**, and every one of its 9 "Balloon Boy responses" was
false — BB's AI is 0 on Night 1 and he cannot act. Night 1 is the easiest night
in the game and has 4192 frames of flashlight headroom; the same faults on
Night 5 or 6, which have 192, are unlikely to be survivable. **This is a floor,
not a ceiling.**

**No package closed.** The headline stays 29/89 (the denominator is 89; this line read 29/88 until 2026-08-26 while the header two screens up read 29 of 89, and the dashboard table sums to 89). Plan 13 package 3 is advanced,
not closed: 6 AM and the generic intro are now classified, but the intro's night
ordinal, minigames, save advancement, committed real holdouts, and media-PTS ↔
runner-clock alignment remain open. An honest percentage that does not move is
worth more than a flattering one.

### The single most important thing learned today

**Night 6 was refused, and then the refusal was fixed at its cause.** The gate
was passing on its seed block: `GATE_RUNS` was 100, which cannot measure a rate
near its own bar, and over 1200 seeds the shipped plan was 449/1200 = 37.4%
against a 40% contract. It was correctly refused.

The cause turned out to be a lost input, not a bad bar. The clear branch's first
Foxy reset sat in a standalone hall slot that landed inside mask-off and did
nothing at the measured read latency; carrying that contact on the existing
post-read `maskraise` row restores it without moving the read, the sweep, or the
measured 180 ms mask→monitor seam. **Re-verified independently this session, on
the same 1200 seeds: all six nights now clear the unchanged 40% contract** —
99.1, 68.9, 78.8, 73.2, 63.9 and **56.1** per cent. The bar never moved.

**The margin was bought with flashlight, and that bill is not recorded anywhere
else.** The restored contact is lit, so light spend went 2148 → 2808 frames on
every night. Nights 1–4 absorb it; **Nights 5 and 6 fall from 852 to 192 frames
of headroom**, about 3.2 s of light against a 3000-frame budget. The two nights
that most need slack now have the least. `test-night-matrix.mjs` fails the suite
if headroom reaches zero, but nothing warns on approach.

### The next concrete action

**Superseded by the resume point at the top of this file.** This section used
to call for Night 6, but the live title now proves Sixth Night is not unlocked
and the device owner read the Continue cursor as Night 2. The fork-free-clock
question remains first, now as a bounded Night 2 cycle; a passing result is
followed by a full graded Night 2 attempt.

### Closed and committed this session

Each of these was an "Open" item here as recently as this morning:

- **A 6 AM can now be recorded.** `screenrecord` no longer caps at 180 s. The
  runner probes the handset's `--help` for the advertised unlimited mode and
  uses `--time-limit 0`; a device that does not advertise it is **refused, not
  degraded**, because a plausible-looking 180 s artifact of a 420 s night is
  worse than no video (`trial.sh`, `screenrecord_time_limit`).
- **Grading is no longer success-only.** `grade-run.sh` runs on every exit path,
  so the run that failed is no longer the run that is never graded. The runner's
  own exit status is preserved.
- **The driver's stdout/stderr is durable.** It tees to `$OUT-run.log` and is
  declared in the session manifest as operational metadata with
  `clock_domain=null` — honest, because the stream mixes runner-relative decision
  lines with transport errors that carry no clock.
- **A real 32-bit wrap bug in the remote shell is fixed.** Android's mksh does
  signed 32-bit arithmetic and epoch milliseconds are ~1.8e12, so the epoch
  centring arithmetic wrapped; `epoch_sub_ms`/`epoch_diff_ms` keep the value as a
  string and calculate only on its parts. The interpreter test pins the exact
  value that wrapped in the first real attempt.
- **`desync-scan.py` can no longer invent an alignment.** `align()` refuses a
  trace with no monitor presses, no confident edges, zero matches, or an optimum
  on a search boundary, and `scan()` reports `UNKNOWN` and exits before
  attributing anything.

### External check, 2026-08-26: is this architecture normal?

Surveyed, because nobody had. **It is not normal — it is near-unprecedented, and
the one precedent is instructive rather than discouraging.** Full write-up in
`HID-MULTITOUCH.md` §"Prior art". Three things that change what to work on:

- **`hid-multi` is on the right side of the only documented detection line.**
  Android stamps injected input with `deviceId = -1` *by deliberate design*
  (AOSP `InputDispatcher.cpp`), and per a scrcpy contributor the only mechanisms
  that do not are AOA HID and uinput. Every mainstream alternative — `adb shell
  input`, MaaTouch, scrcpy's sdk mode, Airtest maxtouch, minitouch — is
  detectable; this route is not. That was not why it was chosen, and it is a
  second reason to keep it.
- **The one prior attempt died of something we do not use.** `phisap` drove an
  unrooted handset in hard real time via **AOAv2** and broke on Android 13 on
  vendor USB-gadget bugs. This project runs `/system/bin/hid`, a **uhid** device
  created on the phone — verified, not assumed — so it gets the same identity
  property without the dependency that killed the precedent.
- **Its author's unsolved problem was ours.** He shipped a working 1 kHz HID
  touchscreen and then started his timer *by having a human press space*,
  because he could not read the song's progress without root. His rule — "Full
  Combo but not All-Perfect always means the timer sync is off, never the plan"
  — is this repository's graded-interval rule in miniature. **Actuation was
  never the bottleneck for the only person who tried this before.** The cue
  helper and the epoch latch are the parts of this project with no prior art,
  and today's 32-bit T0 wrap says that is still where the risk lives.

**Both surveys are retained in full** under
[`docs/research/`](../docs/research/README.md), which now indexes all four
reports with what each answers and where it was distilled to. An `UNKNOWN` in
them is a result, not a gap: it means the question was asked and the public
record does not answer it, so nobody needs to search again.

Also corroborated: 225 ms `screencap` sits where the literature says it should,
the 59 ms device-local read beats anything published for a physical handset, and
the ≥100 ms contact rule is Unity's own documented failure mode. And one honest
negative: **no case was found of any Android game detecting a bot by input
timing** — only by input identity. That does not license relaxing the human gate,
whose justification is evidential rather than ban-avoidance, but it does mean the
gate should stop being argued for on detection grounds.

### The stale claim that mattered most, corrected 2026-08-26

**`CLAUDE.md` was asserting a device limit the repository had withdrawn two days
earlier.** Its `--device-sweep` bullet said *"at the proven 240 ms spacing the
same route is 0/1000"*, and used it to argue the 267 ms three-camera sweep is
unproducible. But `HID-MULTITOUCH.md` §"Answered: the phone accepts 120 ms
spacing (2026-08-24)" had already **withdrawn 240 ms as a measurement artifact**
— `camtrace.py` decoded at 30 fps and demanded a 100 ms stable run, so at 160 ms
every dwell reported as exactly the 0.10 s floor and read as a dropped
selection. Re-graded at the recording's native 60 fps, the same three probe runs
are **4/4 at 240, 160 and 120 ms**. Nothing about the input changed.

That page's own table prices the phase window by spacing: 240 ms → 2 frames
("not landable"), 160 ms → 6, **120 ms → 12 frames (200 ms)** against an ~80 ms
`DEVICE_EPOCH_LATCH` bracket. So the blocker it calls *singular* — the camera
actuator's inter-selection spacing — **was answered in the phone's favour.**

**Scope it honestly: this unlocks nothing new.** `DEVICE_SPACING_MS` is already
120 in `recipe.mjs`, `test-recipe.mjs` already gates against it, and the shipped
route already spends it. The engine absorbed the finding on the day it was made;
only the always-loaded instructions file lagged. What the correction prevents is
a *future* session reading CLAUDE.md, believing the sweep route is dead, and
re-deriving a conclusion the repository had already overturned — which is
precisely the cost this project's front page says it exists to stop.

A 2026-08-26 literature pass reached the same conclusion from the other side:
**nothing in Android, evdev, uinput, InputReader or InputDispatcher imposes any
inter-press floor.** AOSP's own synthesised swipe runs at 120 Hz; RERAN replays
raw event streams on real phones at 3.87 ms median. Full write-up in
`HID-MULTITOUCH.md` §"Input injection and sequential budgets", which also
corroborates three of our numbers, corrects two more, and names two silent
failure modes we have not guarded — the evdev ring overflowing to `SYN_DROPPED`
(whole-frame drop in `EventHub`), and the kernel dropping unchanged `EV_ABS`
after fuzz.

**The one with a lever attached:** on `screencap`'s path `sourceCrop` is
*ignored in source* and every layer is composited regardless of region, while
AOSP's own small-region sampler budgets **3 ms** for the same shape of work by
caching its buffer, filtering layers, and never leaving SurfaceFlinger. Our
59 ms for 180 pixels is ~20× that, which points at fixed per-read entry cost
rather than pixels.

### The cycle seam is resolved; the current red check is unrelated

The deliberately red `recipe` check was comparing the emitted plan's nominal
clock with the runner's delivered wall clock. The sweep does end exactly on the
nominal boundary, but `run_macro` waits through `rm_shift + FUSION_POLL_MS`
before writing the next anchor. That delivers **33 ms released**, clears the
HID auditor's 20 ms floor, and carries lateness forward rather than compressing
later seams. `test-recipe.mjs`, `test-runner-plan.mjs`, and the real shell
interpreter now prove the complete path.

The 4660 → 4640 counterfactual was still priced, 1200 seeds per cell. Under the
measured actuator both shipped and candidate were 0/1200 on Nights 5 and 6 for
an unrelated lateness cliff, with **zero seam drops** in roughly 1.25 million
sent actions. With lateness zeroed, both were 1200/1200. Moving the sweep offers
no seam benefit, so the recipe stays at 4660.

~~The suite is currently red only because of the separate uncommitted
marker-123 engine edits named in the top resume point.~~ **Stale as of
2026-08-26:** that source pass landed in `47dcd1b` and the engine suite is
green. The cycle boundary this section resolves was never the reason it was
red.

### Retracted 2026-08-26: the cycle-wrap seam was not the desync cause

Earlier today this dashboard named the cycle wrap-around as the prime suspect
for the cleared Night 1's ~8 desyncs: every cycle's last instruction ends
exactly on the next cycle's `0 tap monitor`, 0 ms released against the HID
auditor's 20 ms floor.

**The 0 ms is real in the emitted plan and irrelevant in delivery.** The runner
already compensates: the driver's `12-night-loop.sh` waits
`rm_base + rm_cursor + rm_shift + FUSION_POLL_MS`, holding the next anchor back
one Fusion poll (33 ms), and `test-runner-plan.mjs:223` pins that. Because the
wait is relative to `rm_shift`, a late macro moves the boundary with it instead
of compressing the seam. The delivered gap is 33 ms and legal.

So the sweep-shift variants priced against it — 20 ms free, 33 ms costing 3.5
points on night 6 — were pricing a fix for a defect the runner does not have.
Those figures stay on the record because they measure something real about
Foxy's tolerance, but they are not a desync fix.

**This is the second time this exact mistake has been made here.** The trace
auditor made it first, mistaking the nominal plan clock for wall-clock delivery,
and its zero-gap finding was retracted for the same reason. `test-recipe.mjs`
now checks the DELIVERED seam rather than the nominal one, which is the check
that would have caught both of us.

What caused the Night 1 desyncs is therefore **open again**. `HID_TRACE_RUN=1`
on the next graded run remains the way to attribute them, since only
`desync-scan.py` can line the sent trace against what the game did.

### Open, with what is known

- **The music box contradicts `src/config.js` and is not fixed.** Measured on
  Night 1: inert for the first ~133 s, then ~55 s full→empty, against a constant
  of 16.67 s that `recipe.mjs` states is the *Nights 6-7* rate. The per-night
  drain groups have not been located in the dump; the wind side is sourced
  (g652 sets 2000, g638/g643 add +5/tick, g645 snaps to 300). Do not change the
  constant until the drain is sourced.
- **Lifecycle package 3 is advanced, not closed.** A positive 6 AM is recognised
  by `run-timeline.py`, and the new fractional intro-card classifier is gated by
  a committed synthetic generator. Against local real media: intro 5/5,
  non-card 21/21 rejected, 6 AM 17/17 rejected as intro and accepted as 6 AM;
  `n1-full-1640` reports intro at 3.0–5.5 s and clear at 428.5 s. Still absent:
  minigame fixtures/classification, Night 2–6 intro evidence and ordinal
  recognition, a committed real holdout corpus, media-PTS ↔ runner-clock
  alignment, and save-advancement classification. Those gaps keep the package
  open.
- **The Night 2 death source is now observable in shadow mode, but not
  promotion-ready.** The `n2-reactive-observe-followup-20260830` recording's
  `different frames` sheet surfaced a Marionette jumpscare at about 116.0 s,
  followed by static and the generic Game Over face. `death-cause.py` now
  accepts explicitly labelled Foxy/Marionette envelopes, and `run-timeline.py`
  scans them at an independent 12 fps cadence while keeping lifecycle
  authoritative. The local one-run Marionette calibration also produced
  lookalike hits during live camera/mask transitions; the final-tail join
  excludes those and identifies only the 116.0 s episode. A session-separated
  holdout corpus and validated model remain open, so this is attribution
  evidence rather than a live detector or action rule.
- **The controller desyncs far more than it detects, and pan is the tell.**
  Measured on the cleared Night 1: 16 of 16 `empty` vent reads sit at 0–6 px of
  office pan, and 6 of 7 false `inside` reads at **64–178 px**, with the
  classifier's margin tracking pan monotonically (0 px → 19, 6 px → 20,
  displaced → 18, which is the `inside` boundary). Per the device owner,
  unexpected pan during a run *means* desync. So that run desynced roughly
  **eight times and the runner noticed once** — and its one correction failed:
  the resync at 93089 ms was followed five seconds later by a read that still
  photographed the Main Hall camera feed. Two consequences: every `inside` on
  that night was false (BB's AI is 0), and a panned office means every press in
  that cycle lands on coordinates calibrated for an unpanned one. Pan is a
  better desync detector than the luma check and is **unpriced inside the
  cycle** — a full-frame correlation, so price it before scheduling it.
  `ON-DEVICE-SCREEN-CHECKS.md` §"The left-opening classifier measures camera
  pan" has the frames and the method.
- **Nights 5 and 6 have 192 frames of flashlight headroom, down from 852.** The
  Night 6 route repair paid for its gate margin in light. Nothing warns as that
  approaches zero; `test-night-matrix.mjs` only fails once it crosses. Price any
  new lit observation against 192 frames, not against the old 852.
- **The live human floor is now off on the shipped route, and nothing replaced
  it for runtime presses.** `human_floor_check` returns early when
  `NIGHT6_LEFT=1` (`trial/05-press.sh`), because the model gate prices the
  emitted plan and the old scalar check aborted on the plan's own deliberate
  120/180 ms compound boundaries. That is defensible for *scheduled* presses.
  But the corrector's monitor-verify press in `light_down_at` is **not in the
  plan** — it is a runtime reaction — so on the shipped route it is now priced
  by nothing at all. In the modelled path it waits out `MONITOR_ANIM_DOWN`
  (367 ms) and clears the old 350 ms floor anyway — but **the margin is 50 ms**,
  measured: the corrective press lands at 400 ms against a 350 ms floor. So this
  is a missing check rather than a known-bad press, with less room than anyone
  had assumed. `test-plan-interpreter.sh` pins both arms of the bypass *and*
  that 400 ms gap, so shortening the corrector's wait by 51 ms now fails locally
  instead of on the phone. Pinning is not pricing: routing reactive presses
  through a check that knows they are unplanned needs the device in the loop,
  and was deliberately not attempted blind against the one gate-clean route.
- **The right vent costs ~570 ms of pan round trip** against ~680 ms of free
  cycle, and no schedule prices it. Plan 03 depends on it.
- **The Fusion touch-poll rate is asserted (30 Hz, eight places) and measured
  never**, while the engine runs at 60 FPS. Load-bearing in both directions:
  at 60 Hz the emitter's 33 ms gaps spend twice the budget they need against
  192 frames of Nights 5-6 headroom, and at 30 Hz the Night 7 phase island is
  not landable. **This item fell out of both tracking documents** — the audit
  filed it as a note deferring to this dashboard, and this dashboard stopped
  naming it — so it now lives in `HID-MULTITOUCH.md` §"Open: the tick rate is
  asserted twice and measured never", beside the constants it governs. The
  *recording* rate half is closed: `grade-run.sh` probes with `ffprobe` and
  refuses a capture that is not the 60 fps its graders assume.
- **`docs/ARCHITECTURE-AUDIT.md`** holds ten ranked findings. **1, 2, 4 and 7
  are resolved, and 8 is mostly resolved**; the rest are not. **This line said
  "1, 2 and 4" on 2026-08-26 and finding 2 was not in fact resolved** — the
  audit named four copies of the alive/dead predicate, there were five, and two
  of them still stated the rule. The worse one was `screenstate.py --adb-fast`,
  the *live* watchdog that decides whether the phone is in a night, which
  nothing had ever run. Both are ported and gated in `8a9925b`, and the audit
  now carries the correction in place. The dashboard was ahead of the code,
  which is the direction that costs most: a reader trusts "resolved" and stops
  looking. Finding 8 was the
  mission-critical one, because the claim CLAUDE.md stated as absolute — "the
  device runs nothing the model gate has not passed" — was *false*, and it is
  what authorizes every device run on the Plan 12 ladder. Now: the 378 dead
  inline `press_at` lines are deleted, `test-runner-plan.mjs` scans the whole
  driver instead of a slice that ended where they began (verified by positive
  control against the old file), the prose-absence check is structural, and
  CLAUDE.md's rule is scoped to what is actually enforced. **Two things still
  sit outside the gate**: `trial-maskcamp.sh`, which needs a decision rather
  than one session's judgement — gate it, port its table, or retire it — and
  the reactive presses noted above, which are now priced by nothing.
- `docs/device/RUN-TELEMETRY.md` ranks ten diagnostic signals by value per
  millisecond. Items 3–6 total ~23 ms of a 5000 ms cycle and belong in the
  plan's ~416 ms post-read slack; re-check placement with `windpct.py
  --samples`, since the screencap that once collapsed the box 52% → 10% was
  only 10.3 ms/s and did it by landing on the wind.
- ~~Two defects found while reading and not fixed: `SWEEP_LIGHT_LEAD_MS` and
  `plan_control_xy` are each **defined twice** in `trial.sh`~~ —
  **fixed, and this entry was stale when written.** `98eb7ff` removed both the
  duplicate sweep-light constant and the incomplete coordinate resolver, and
  that commit is cited eight lines above this bullet in the same file, which is
  how a dashboard ends up asserting a fix and its absence on one screen. Both
  now have exactly one definition, and every remaining HID timestamp is
  structurally gated against a freshly frozen value — which was the `hid_mark
  "$actual"` stale-global half.

## Dashboard

| Plan | Closed / mandatory packages | Progress | Current state | Next gate |
|---|---:|---:|---|---|
| [01 — research pass](01-research-pass.md) | 3 / 3 | **100%** | Done | None |
| [02 — Minus 3 mode](02-minus-3-mode.md) | 1 / 7 | **14%** | **Pkg 2a modelling done (`c038938`, 2026-08-28); device side open.** Engine has the `viewing`/`lastViewed`/marker split; `minustoystest.mjs` gates 200/200 + 100/100 worst + 0/200 no-split; `minus-toys-plan.mjs --night=N` emits a gated device plan (Night 1: 200/200). Glitchless Minus Two remains 16/200 — not a Minus Toys verdict. **Story campaign is a distinct, softer target (`MINUS-3-STRATEGY.md` §9):** CAM 09 nights 1–2, CAM 08 nights 3–5; Pedro hand-cleared 1/3/4 on the g56 uncaptured. | Measure the glitched Toy stun on hardware. Night 1 (`trial.sh DEVICE_POLICY=minus-toys CALIBRATION_STORY_NIGHT=1`, needs save reset to Night 1) is the clean calibration run — also the place to test the music-box audio phase clock against the −184 ms/min drift. |
| [03 — right-vent-camp mode](03-right-vent-camp-mode.md) | 1 / 5 | **20%** | Engine sourcing complete (2026-08-24). The existing 0/300 `rvctest` is a deliberately incomplete non-reactive skeleton, not the brayden/Shooter25 policy; decision table, coach, ladder and grading untouched. | Encode and measure the published four-way post-wind controller before designing lessons or quoting an Android rate. |
| [04 — optimize Minus 7](04-optimize-minus-7.md) | 3 / 4 | **75%** | Search and grading work complete | Replace inferred human profile with accumulated trainer traces |
| [05 — derive new strategy](05-derive-new-strategy.md) | 5 / 9 | **56%** | **Reopened 2026-08-28.** Original static-cover pass closed by sourced refutation; broader stateful/event-driven invention campaign is active on the now-sourced model/search substrate. | Package 6: define and source the novel-policy language, with duplicate controls excluding Plans 05/06/16's closed families. |
| [06 — hybrid search](06-hybrid-strategy-search.md) | 6 / 6 | **100%** | Closed with no survivor | Reopen only after a corrected mechanic changes reachable policy space |
| [07 — tooling consolidation](07-tooling-consolidation.md) | 5 / 8 | **63%** | Correctness pass complete; opportunistic refactors remain | Extract shared browser session during the next browser-tool change |
| [08 — audio-cue controller](08-audio-cue-controller.md) | 2 / 7 | **29%** | Source map and playback capture pass. A live **fail-closed, shadow-only** detector now exists on device (`ARM`/`RESULT`/`MODEL`, named refusal reasons, `UNKNOWN` for every degradation) and **cannot influence a run** — the runner sends only `GET` and reads only the visual pixel. It closes no package: the exporter is not an evaluator, close→MISS latency is unmeasurable as built, and no shadow run exists | Derive or retract the guessed `threshold=0.25`/`margin=0.05` now provisioned on the phone, then the session-split holdout and confusion matrix |
| [09 — observation corpus](09-observation-corpus.md) | 1 / 6 | **17%** | Schemas, validator and producers all landed; every runner emits a manifest on every exit path, proven against mock adb only | Validate one real captured session; the next hardware run closes package 2 |
| [10 — stock-device controller](10-stock-device-controller.md) | 0 / 7 | **0%** | Package 0 advanced: pan sourced and measured, both lights verified, office proven 1600×768 and the screen mapping derived; the right vent's scene X stays unknown | Price the right vent's ~570 ms pan round trip, then close the vocabulary |
| [11 — policy interface](11-policy-interface-and-baselines.md) | 0 / 5 | **0%** | Proposed; optional Gym package excluded from denominator | Freeze exact-engine policy protocol after Plan 09 record agreement |
| [12 — evidence campaign](12-end-to-end-evidence-campaign.md) | 0 / 7 | **0%** | Lateness decomposed and priced: the knee is the 2→3 frame boundary, and the fork-free clock recovers Nights 1–5 in the simulator; Night 7 stays blocked by the phase island | Gate A after Plans 09–11 provide their contracts |
| [13 — campaign/all-night](13-campaign-and-all-night-support.md) | 2 / 8 | **25%** | **Night 1 CLEARED on device 2026-08-26** (`n1-full-1640`, 420.2 s alive, save advanced Night 1 → Night 2). Package 3 is **advanced, not closed**: generic intro and positive 6 AM now timeline the real clear, while minigames, ordinal recognition, committed real holdouts, clock alignment and save advancement remain open. The live title has only New Game + Continue and the device owner confirmed cursor Night 2; Sixth Night is not unlocked. The 2026-08-30 run added a shadow-only labelled Foxy-cause foundation, but the operator label is not a holdout or a promotion. Current simulator ladder (1200 seeds, 95% Wilson) is 100.0% [99.7%, 100.0%], 66.3% [63.6%, 69.0%], 79.3% [76.9%, 81.4%], 73.8% [71.3%, 76.2%], 62.0% [59.2%, 64.7%], and 54.0% [51.2%, 56.8%]; this is not device evidence. The marker-123 source pass has landed (`47dcd1b`) with the engine suite green, so nothing blocks hardware | One traced Night 2 cycle, then a full graded Night 2 attempt |
| [14 — device portability](14-device-portability-and-profiles.md) | 0 / 6 | **0%** | Proposed; the canvas→screen mapping is now derived (stretch-to-fill, predicted 1720 against a measured 1700–1800) rather than calibrated | Inventory and classify the coupling: geometry, layout mode, pixel models, timing |
| [15 — sensor independence](15-sensor-independent-observations.md) | 0 / 5 | **0%** | In progress (2026-08-27, Pedro's directive: drop every screencap read, cue helper is the response). Pkg-4 instrumentation landed — `trial/08` logs paired `GRID` lines per BB read; corpus accretes on the next device night. Pkgs 2/3/5 and the grader migration open. | Same capture at `trial/06` + `trial/04`, then build the BB grid signature from the paired frames |
| [16 — constrained policy search](16-constrained-policy-search.md) | 5 / 5 | **100%** | **Resolved 2026-08-27 and scoped 2026-08-28.** Pkgs 1–3 built; pkgs 4 and 5 closed by recorded negative (`740f5b0`, `4e7abce`); pkg 6 dropped. The searched Minus 7 timing/geometry space is a wall under the human gate, and the Night-7 opener is irrelevant. This is not a claim that Minus Toys, faithful RVC, GOT-YOU blackout cover, or measured machine execution was searched. | Reopen this Minus 7 search only for a device candidate or corrected mechanic; pursue the separate frontier at the top of this page independently. |
| [17 — in-APK bot](17-in-apk-bot.md) | 0 / 6 | **0%** | **Opened 2026-08-28.** Naive retail re-sign is a measured PAIRIP negative; modified-package, runtime hook, loader/shim, CCN rebuild and faithful-recompile routes remain active. | Package 1, then 2: freeze the stock oracle and localize the known re-sign failure while preparing the smallest read-only runtime-attachment probe. |
| [18 — modern tooling](18-modern-tooling.md) | 0 / 9 | **0%** | **Proposed 2026-08-28; Packages 4–5 bounded foundations landed, gates remain open.** Nine additions, each tied to a documented failure and none adding a runtime dependency or a build step. Package 4 has the phone-free 64-seed property harness; Package 5 has the phone-free parser and capture wrapper, but three current direct-HID traces had no app MotionEvent rows, so dispatch/frame landing is unproven. | Reproduce the earlier positive input-trace configuration and place each camera-select event on an actual frame landing; expand the property campaign; in parallel, Package 1 (`shellcheck` + the three footgun fixtures). |
| [19 — video reactive controller](19-video-reactive-controller.md) | 3 / 6 | **50%** | **Proposed 2026-08-29; packages 1–3 are implemented in the worktree.** The observer/controller audit fixes cover deadline timing, stale cue identity, actual mask endpoints, UNKNOWN polarity, and rejected-intent rollback. `PixelWatch.java` / `CaptureService.java` provide the native watch protocol; `watch-calibrate.py` refuses weak or foreign calibration; `reactivetest.mjs` remains green and `ventreacttest.mjs --assert` is intentionally red on the survival-cost claims. P4 now has one Night 2 observe-only baseline (operator saw Foxy; machine cause remained unknown); the run is not a clean Night 5/7 promotion gate. P5 blackout attachment and P6 external audio remain open. | Run the observe-only branch on a monitor-stressing Night 5 or 7 session, then grade it. |
| [20 — belief-state cycle controller](20-belief-state-cycle-controller.md) | 5 / 7 | **71%** | **Packages 1–5 implemented in the worktree; P6 trace contract foundation added 2026-09-02.** `src/estimator.js` preserves delayed timing, refuses stale/uncalibrated/conflicting facts, and reconciles actions transactionally. `src/cycle-library.js` and `src/cycle-planner.js` provide reviewed primitives and worst-case selection; `src/cycle-controller.js` composes them without an engine read, and the exact-engine blackout control comparison is 0/80 disabled, 80/80 normal estimator, 13/80 harsh stress, 80/80 oracle. `bench-transport-trace-v1` now retains complete visual/audio latency legs and safe-cycle continuation proof in a deterministic host fixture. Physical bench timing and the shadow campaign remain open. | Package 6: real bench transport trace, then safe-cycle continuation under measured link loss. |
| [21 — policy-program synthesis](21-policy-program-synthesis.md) | 6 / 7 | **86%** | **Packages 1–6 implemented for the initial Minimal target.** The finite named-target grammar fingerprints known families; IR/device/mock-phone equivalence rejects the three Night 1 defect controls; `policy-search.mjs` persists an exact-engine positive/negative mutation frontier with provenance; and `policy-artifact.mjs` binds the canonical program to the pushed plan and manifest while keeping grading opt-in. Broader 1200-seed invention, family ports, physical device evidence, and promotion remain open. The BB-only reactive experiment remains a failing release gate; Mangle audio-static handling is modeled, but device calibration/evidence remains open. | Package 7: scoped invention campaign and promotion. |

## Counting rule

- The denominator is the mandatory numbered work packages in each plan. Plan
  11's explicitly optional Gymnasium package is excluded.
- Plan 13 adds eight mandatory packages; the completion numerator remains
  unchanged until one of its gates actually closes.
- Plan 14 adds six mandatory packages on 2026-08-26 (77 -> 83 mandatory). Its
  package 6 needs a second handset the project does not have; it is counted
  because the plan's done criteria cannot close without it, unlike Plan 11's
  Gymnasium package which is optional to its own goal.
- Plan 15 adds five mandatory packages on 2026-08-26 (83 -> 88 mandatory). It
  exists because the same game fact is currently re-taught per capture method,
  and three more sensor-bound classifiers were added the same day.
- Plan 16 adds six mandatory packages on 2026-08-27 (89 -> 95 mandatory). It
  exists because the standing goal in item 9 has been attacked by hand twice
  and reverted twice; no search tool optimises the emitted device plan against
  `human-gate.mjs`, and the one unexplored lever (items 10/11) needs cross-cycle
  state. Overall falls 33% -> 31% on the same numerator, the honest direction.
- Plan 10 gained a package 0 on 2026-08-26 (76 -> 77 mandatory): the basic
  interaction vocabulary the schedule is made of was never established, and
  office panning appears in the record only as a failure mode.
- Plan 02 gained a package 2a on 2026-08-26 (88 -> 89 mandatory): the
  double-camera glitch turned out to exist on Android, so the Minus Toys half of
  the family needs an engine state, a probe and a device measurement that were
  never written. Its percentage falls 17% -> 14% on the same numerator, which is
  the honest direction.
- A package contributes only when its plan marks it closed, completed, passed,
  or closed by a documented negative result. Partial or “advanced” work receives
  no fractional credit.
- Plans 05 and 06 count as complete because their done criteria explicitly
  accept a recorded refutation/no-survivor result; implementation was correctly
  not started after the candidate failed. **Plan 16 closes the same way**
  (2026-08-27): pkgs 4 and 5 are recorded negatives, and pkg 6 (a
  dependency-report on a promoted candidate) was dropped because no candidate
  was promoted — 95 → 94 mandatory. Its row was also corrected off a stale
  `0 / 6` (pkgs 1–3 built in prior commits, never counted).
- Plan 05 adds four mandatory packages on reopening (94 -> 98 mandatory). Its
  original five packages remain closed; the new denominator records that the
  invention goal is active again without erasing the Six-Seven refutation.
- Plan 17 adds six mandatory packages on 2026-08-28 (98 -> 104 mandatory). The
  percentage falls 36% -> 33% with no invented completion credit; the earlier
  naive re-sign negative is starting evidence, not a closed package in the new
  route campaign.
- Plan 18 adds nine mandatory packages on 2026-08-28 (104 -> 113 mandatory).
  Each package is scoped to close either on a landed check or on a recorded
  negative (packages 4 and 6 are the likely negatives); the percentage falls
  33% -> 30% with no invented completion credit.
- Plans 19 and 20 add six and seven mandatory packages on 2026-08-29 (113 ->
  126 mandatory). Plan 19 package 1 (`src/observer.js`, `src/controller.js`,
  `tools/reactivetest.mjs` in `--engine`) closes the same day on its landed
  gate, so the numerator moves 34 -> 35 and the percentage falls 30% -> 28%.
  Plan 20 packages 1–5 are now closed by their recorded phone-free gates;
  packages 6–7 remain open.
- Plan 21 adds seven mandatory packages on 2026-08-30 (126 -> 133 mandatory).
  Packages 1–6 are now closed for the initial target by their canonical IR,
  grammar, constrained mutation campaign, compiler-equivalence checks, and
  safe artifact binding; package 7 remains open.
- Prerequisite research outside a plan's numbered implementation packages is
  described in the state column but does not inflate its percentage.
- Adding, removing, reopening, or closing a mandatory package changes the
  numerator or denominator here in the same commit.
- A row is read off its plan's own completion markers, never from memory. This
  file was written on 2026-08-26, after several plans had already closed
  packages, and a same-day audit found Plan 03's row had been authored stale:
  its work item 1 closed on 2026-08-24 and the row still said `0 / 5` and named
  that finished work as the next gate. The audit also found Plan 08's "Done
  when" section still carrying a withdrawn refutation that, read literally,
  closed five packages the plan's own table lists as open.

This percentage measures completion of the written plans, not probability of a
clear. In particular, simulator success, a bounded device branch, a Night 6
attempt, a Night 6 clear, and a 10/20 clear remain distinct claims under
[Plan 12](12-end-to-end-evidence-campaign.md).
