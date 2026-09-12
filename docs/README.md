# Documentation index

Research notes for [fnaf2-1020](../README.md). The repository's claims live here;
the code only implements them.

Two conventions run through everything below. **Evidence labels** — `[SOURCED]`,
`[CALIBRATED]`, `[INFERRED]`, `[MODEL]` — say where a number came from, and a
rule enters the simulator only when it earns one. **Retractions stay put**: when
a result is refuted, the document keeps its original reasoning and gains a
correction at the top, because the wrong turn is usually the useful part.

The [project charter](../PROJECT-CHARTER.md) defines how the trainer, model,
controller research, and device evidence form one program.

## Start here

| If you want to… | Read |
|---|---|
| Learn the strategy the trainer teaches | [`strategy/MINUS-7-STRATEGY.md`](strategy/MINUS-7-STRATEGY.md) |
| See how 10/20 was solved, historically | [`strategy/STRATEGY-HISTORY.md`](strategy/STRATEGY-HISTORY.md) |
| Judge whether the simulator can be trusted | [`android/ANDROID-SOURCE-STATUS.md`](android/ANDROID-SOURCE-STATUS.md) |
| Read the game's event sheet yourself | [`android/SOURCE-DUMP-GUIDE.md`](android/SOURCE-DUMP-GUIDE.md) |
| Decompile a Clickteam Android game | [`android/SOURCE-DUMP-GUIDE.md` §4](android/SOURCE-DUMP-GUIDE.md) — the handle scramble |
| Run something against a real phone | [`device/ON-DEVICE-VALIDATION.md`](device/ON-DEVICE-VALIDATION.md) |
| Recover stock-APK RNG seed candidates without modifying the APK | [`device/RNG-SEED-RECOVERY.md`](device/RNG-SEED-RECOVERY.md) |
| Understand the project's scope and claim discipline | [`../PROJECT-CHARTER.md`](../PROJECT-CHARTER.md) |
| Read what the project has learned | [`chronicle/README.md`](chronicle/README.md) |
| Find the right command | [`../tools/TOOLS.md`](../tools/TOOLS.md) |
| Pick up unfinished work | [`../plans/`](../plans/) |
| Understand current package ownership | [`architecture/README.md`](architecture/README.md) |
| Review dependency direction | [`architecture/DEPENDENCY-GRAPH.md`](architecture/DEPENDENCY-GRAPH.md) |
| Review migration shims and removal gates | [`architecture/COMPATIBILITY.md`](architecture/COMPATIBILITY.md) |
| Find where the same thing is implemented twice | [`architecture/DUPLICATE-IMPLEMENTATION-MAP.md`](architecture/DUPLICATE-IMPLEMENTATION-MAP.md) |
| Review the generated contract and command catalogs | [`architecture/generated/README.md`](architecture/generated/README.md) |
| Read the workspace/core decision | [`decisions/0001-workspaces-and-core.md`](decisions/0001-workspaces-and-core.md) |
| Inspect evidence retention and claim ceilings | [`evidence/README.md`](evidence/README.md) |
| See why Night 5 still loses with clean contacts, and what to try next | [`evidence/night5-contacts-clean-still-losing-20260912.md`](evidence/night5-contacts-clean-still-losing-20260912.md) |
| See the Night 5 mask window's measured position tolerance, and why the gate killed its own cycle | [`evidence/night5-mask-window-tolerance-20260912.md`](evidence/night5-mask-window-tolerance-20260912.md) |
| See why longer loop cycles were refuted, and what route changes are now closed | [`evidence/night5-longer-cycle-refuted-20260912.md`](evidence/night5-longer-cycle-refuted-20260912.md) |
| See the hall flash graded per cycle from the trace and the video, the mask-off lockout it runs into, where `hallOffsetMs` can move in the model, and the two clean-contact deaths | [`evidence/night5-hall-lockout-and-offset-sweep-20260912.json`](evidence/night5-hall-lockout-and-offset-sweep-20260912.json) |
| See where the anchored Night 5 release aims and the model bands that priced it | [`evidence/night5-anchor-aim-20260912.json`](evidence/night5-anchor-aim-20260912.json) |
| See the measured Night 5 delivered phase, and a hall measurement retracted twice | [`evidence/night5-phase-measured-and-hall-open-20260912.md`](evidence/night5-phase-measured-and-hall-open-20260912.md) |
| Read why the Withered Bonnie visual cause model was withdrawn, and what metric replaced euclid | [`evidence/withered-bonnie-visual-model-withdrawn-20260912.md`](evidence/withered-bonnie-visual-model-withdrawn-20260912.md) |
| Run device work safely | [`operations/DEVICE-SAFETY.md`](operations/DEVICE-SAFETY.md) |
| See what each grade-run.sh video step feeds, which a frame trace can replace, and how the recording is decoded once | [`operations/GRADE-PIPELINE-STEPS.md`](operations/GRADE-PIPELINE-STEPS.md) |
| Understand research operations | [`research/ARCHITECTURE.md`](research/ARCHITECTURE.md) |

## Android source and fidelity

The canonical target is `com.scottgames.fnaf2` v2.0.7 — modern Android release-7,
Fusion build 296, August 2025.

- [`ANDROID-SOURCE-STATUS.md`](android/ANDROID-SOURCE-STATUS.md) — the accuracy
  ledger, and the project's most load-bearing document. Enforced by
  `tools/sourcetest.mjs` so a corrupted mechanism cannot hide behind unchanged
  survival statistics.
- [`UNIFIED-SOURCED-ENGINE-FACT-INDEX.md`](android/UNIFIED-SOURCED-ENGINE-FACT-INDEX.md)
  — every `[SOURCED]` engine fact in one place: a master constant table, then a
  section per subsystem, each with its group citations and the document that
  owns it. A digest and router, not a new authority — the ledger and the other
  pages still win on any disagreement.
- [`SOURCE-DUMP-GUIDE.md`](android/SOURCE-DUMP-GUIDE.md) — chain of custody from
  APK to readable event sheet, the file format, and **the XOR-28 handle
  scramble**. Read §4 before citing any group number; every dump produced before
  2026-08-20 had Toy↔Withered pairs silently swapped.
- [`ANDROID-CAMERA-STALL.md`](android/ANDROID-CAMERA-STALL.md) — the 400-frame
  (6.67 s) camera-flash stun that Minus 7 stands on, and the audit that first got
  it wrong.
- [`ANDROID-OFFICE-ENDGAME.md`](android/ANDROID-OFFICE-ENDGAME.md) — the 45-frame
  defense fuse and 300-frame resolution chain.
- [`ANDROID-GROUP-MAP.md`](android/ANDROID-GROUP-MAP.md) — coverage of all 1332
  office-frame groups, so blind spots stay a list rather than a feeling.
- [`PC-DECOMP-CHECKLIST.md`](android/PC-DECOMP-CHECKLIST.md) — the PC 1.033
  cross-platform boundary. Deferred, non-blocking.

## Strategy

- [`STRATEGY-HISTORY.md`](strategy/STRATEGY-HISTORY.md) — the whole 10/20 lineage,
  from reaction play to two independent zero-RNG proofs.
- [`MINUS-7-STRATEGY.md`](strategy/MINUS-7-STRATEGY.md) — exact input sequence for
  the strategy the trainer drills.
- [`MINUS-3-STRATEGY.md`](strategy/MINUS-3-STRATEGY.md) — the cam-stall family.
  The Android split-camera mechanism transfers; the tested open-loop device
  policy does not yet transfer reliably. §7–9 keep those verdicts separate.
- [`VENT-CAMP-STRATEGY.md`](strategy/VENT-CAMP-STRATEGY.md) — the right-vent-camp
  lineage up to brayden's timer strategy.
- [`CAM-6-7-STRATEGY.md`](strategy/CAM-6-7-STRATEGY.md) — a strategy this project
  derived and then **refuted**, kept as the derivation record.
- [`GATE-SEARCH.md`](strategy/GATE-SEARCH.md) — gate-aware policy search. Closed
  at 0/150, including two retracted false positives.

## On-device

- [`android/cue-helper/README.md`](../android/cue-helper/README.md) — the unified
  MediaProjection APK, its build/run procedure, and first target-device soak.
- [`CUE-HELPER-MCP.md`](device/CUE-HELPER-MCP.md) — the bounded MCP/queue
  interface for safe helper setup and read-only device readiness checks.
- [`OVERLAY-QUALIFICATION.md`](device/OVERLAY-QUALIFICATION.md) — the retained
  evidence protocol and structural validator for the non-interactive HUD's
  touch, target-suppression, self-capture, latency, resource, and lifecycle
  gates.
- [`HID-MULTITOUCH.md`](device/HID-MULTITOUCH.md) — the two traps in stock
  Android multitouch, the phone's measured input budget, and the Night 6 route
  priced against the actuator it actually has. **Read this before claiming
  anything about a device run's configuration or its failure**; CLAUDE.md's
  read-before-concluding table points here, and it was missing from this index
  until 2026-08-26 despite being the most-cited device page in the repository.
- [`ACCESSIBILITY-VS-HID-BENCHMARK.md`](device/ACCESSIBILITY-VS-HID-BENCHMARK.md)
  — online evidence check and the qualification matrix for a hostless
  AccessibilityService actuator versus the existing on-device UHID path.
- [`ON-DEVICE-VALIDATION.md`](device/ON-DEVICE-VALIDATION.md) — the adb harness,
  its hard-won safety rules, and findings against the real build.
- [`ON-DEVICE-SCREEN-CHECKS.md`](device/ON-DEVICE-SCREEN-CHECKS.md) — the
  libc-free on-phone classifier, its model-building discipline, and measured
  latency.
- [`OBSERVATION-CORPUS-INVENTORY.md`](device/OBSERVATION-CORPUS-INVENTORY.md) —
  every current visual, audio, video, HID, trace, model, clock, producer, and
  consumer; the provenance gaps the shared session schema must close.
- [`ONE-PIXEL-VISION.md`](device/ONE-PIXEL-VISION.md) — an educational case
  study in reducing a visual bot sensor from a full screenshot to one tested
  logical pixel, with Android capture and audio analogues.
- [`ANDROID-AUDIO-CAPTURE.md`](device/ANDROID-AUDIO-CAPTURE.md) — the mobile
  recording bug that exposes normally inaudible Mangle/music-box loops, its
  evidence boundary, and the implications for an audio-cue detector.
- [`REAL-TIME-CLOSED-LOOP-ARCHITECTURE.md`](device/REAL-TIME-CLOSED-LOOP-ARCHITECTURE.md)
  — the event-driven, three-loop controller boundary. Hardware roles are
  profile-selected capabilities: an ESP32 may bridge, process, host a reflex,
  participate in actuation, or be absent.
- [`RUN-TELEMETRY.md`](device/RUN-TELEMETRY.md) — what a night run should
  record, ten diagnostic signals ranked by value per millisecond of a cycle
  that has only ~680 ms free.
- [`RNG-SEED-RECOVERY.md`](device/RNG-SEED-RECOVERY.md) — sourced RNG facts,
  device-time candidate windows, observation filters, and the boundary between
  useful shadow evidence and live control authority.
- [`../plans/19-video-reactive-controller.md`](../plans/19-video-reactive-controller.md)
  and [`../plans/20-belief-state-cycle-controller.md`](../plans/20-belief-state-cycle-controller.md)
  — the current stock-device sensing/controller build and its uncertainty-aware
  planning layer.

## In-engine and prior art

- [`research/FNAF-BOT-CENSUS.md`](research/FNAF-BOT-CENSUS.md) — franchise-wide
  census of public stock-game bots, modified/in-engine controllers, simulations,
  RL agents, TAS, chat control, and verified false positives.
- [`research/FNAF-BOT-IMPLEMENTATION-COMPARISON.md`](research/FNAF-BOT-IMPLEMENTATION-COMPARISON.md)
  — source-level comparison with every substantive scope in this repository,
  including its simulator, trainer, Android sensing/actuation, and evidence gaps.
- [`research/ANDROID-BOT-LANDSCAPE.md`](research/ANDROID-BOT-LANDSCAPE.md) and
  [`research/ANDROID-INPUT-AND-OBSERVATION.md`](research/ANDROID-INPUT-AND-OBSERVATION.md)
  — the two integral survey reports, retained in full. **No number in either is
  a measurement of this handset.** Their distilled conclusions live in
  [`device/HID-MULTITOUCH.md`](device/HID-MULTITOUCH.md); read these for the
  evidence and the method, or before re-asking a question they closed.
- [`TRAINER-IN-GAME.md`](in-engine/TRAINER-IN-GAME.md) — could the trainer live
  inside the game?
- [`IN-ENGINE-PILOT-RECOMPILE.md`](in-engine/IN-ENGINE-PILOT-RECOMPILE.md) — APK
  injection is blocked by PAIRIP; the CCN→Chowdren recompile path is the
  alternative.
- [`SHOOTER25-PRACTICE-MOD.md`](in-engine/SHOOTER25-PRACTICE-MOD.md) — forensic
  comparison with the closest existing precedent.
- [`SHOOTER25-BOT-STATE-MACHINE.md`](in-engine/SHOOTER25-BOT-STATE-MACHINE.md) —
  its controller reconstructed as a state machine.

## Project

- [`ARCHITECTURE-AUDIT.md`](ARCHITECTURE-AUDIT.md) — ranked cross-cutting
  structural findings, each with what it costs the mission and where it is
  resolved. Retractions and resolutions are recorded in place.
- [`architecture/LEGIBILITY-FOLLOWUPS.md`](architecture/LEGIBILITY-FOLLOWUPS.md)
  — open architecture findings for human and agent legibility, with evidence,
  owners, priorities, and acceptance checks.
- [`HANDOVER.md`](HANDOVER.md) — historical snapshot of the iteration-time work.
- [`../UPSTREAM-LEDGER.md`](../UPSTREAM-LEDGER.md) — give-back ledger: what this
  project owes upstream, and where each item stands.
