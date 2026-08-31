# Plans

Future work across the evidence model, strategy research, human trainer, and
constrained controllers, one file per ask, written to be picked up cold in any
later session. The trainer remains the current public application, but it is one
consumer of the canonical model rather than the architectural root. See the
[`PROJECT-CHARTER.md`](../PROJECT-CHARTER.md) for the shared scope and claim
discipline. Suggested order and dependencies:

**Current completion and the single next action:**
[`PROGRESS.md`](PROGRESS.md).

Current triage (2026-08-29):

- **Plan 02 remains open around Minus Toys.** Android can deliberately arm its
  split-camera state, and the glitch-aware engine probe is 200/200 normal plus
  100/100 pinned worst-luck; the no-split control is 0/200. The first graded
  open-loop Night 2 run failed, while a later Night 1 calibration found no
  measurable drift or desync but did not stress monitor transitions. The next
  gate is a monitor-stressing observe-only run, followed by direct evidence
  that a glitched CAM 09 flash holds the Toys. Glitchless Minus Two remains a
  separate 16/200 negative.
- **Most untouched work:** Plan 03, a real reactive-grading mode; it is larger than
  a script addition and still needs its Android vent/endgame rules sourced.
- **Plan 04's runnable experiment is complete:** per-step model windows and an
  explicitly inferred human-error profile now exist. The next useful input is
  measured trainer timing by step, not another invented profile.
  *(2026-08-25: the collection pipeline for exactly that now exists —
  `/save-trace` + `tools/tracereport.mjs`. What remains is practice runs.)*
- **Plan 05 is reopened for invention.** Its original static-cover pass remains a
  sourced negative; the new campaign searches policy structure with the exact RNG,
  stateful probes, dominance pruning and 1200-seed gates now available. Do not rerun
  Plan 06's closed 125-schedule family or Plan 16's Minus 7 timing grid and call it
  novelty.
- **Plan 17 is the focused in-APK campaign.** Straight re-signing remains blocked
  by measured PAIRIP behavior, but same-process hooks, loader/runtime approaches,
  CCN mutation/rebuild and Chowdren recompilation are active hypotheses. The target
  is a traceable personal research APK with internal observation and actuation.

Bot-research roadmap added 2026-08-26:

- **Plan 09 defines the shared evidence substrate.** Build its schema/replay
  contract before collecting another unstructured detector corpus.
- **Plan 10 closes the stock-device controller loop.** Start in shadow over the
  current runner; it is an incremental extraction, not a big-bang rewrite.
- **Plan 11 makes simulator policy comparisons fair.** It can proceed beside
  Plan 09 after their observation record is agreed, and does not require RL.
- **Plan 12 owns promotion and claims.** It is the gate from replay to shadow,
  bounded action, full Night 6, reliability cohort, and only then 10/20.
- **Plan 15 owns sensor independence.** A game fact is taught once and each
  capture method reads it through a declared, calibrated adapter. Plan 19 P2
  now owns the native-resolution visual watchlist that replaces the old
  cue-helper/screencap threshold mismatch.
- **Plan 14 owns device portability.** Every device-facing number in the repo
  describes one handset; plan 14 makes the device an explicit record, separates
  geometry (translates by arithmetic) from layout mode (must be measured) from
  pixel models and timing (do not translate at all), and refuses mismatched
  pairings.
- **Plan 13 owns campaign and all-night support.** The target-device save loss
  is treated as an evidence opportunity: safe New Game handling, verified
  story progression, per-night policy gates, Sixth/Custom unlocks, and explicit
  Custom Night configuration rather than a permanent Night 6 menu assumption.

1. [01-research-pass.md](01-research-pass.md) — sourced docs for the 10/20 meta.
   Prerequisite for 02, 03 and the novelty check in 05.
2. [04-optimize-minus-7.md](04-optimize-minus-7.md) — slack-maximise the existing
   script. No dependencies; runnable today.
3. [02-minus-3-mode.md](02-minus-3-mode.md) — Minus 3 as a second trainer mode.
4. [03-right-vent-camp-mode.md](03-right-vent-camp-mode.md) — right vent camp mode;
   needs a reactive coaching model, the biggest piece.
5. [05-derive-new-strategy.md](05-derive-new-strategy.md) — first derivation pass
   produced **Six-Seven**, then the sourced route graph refuted it; reopened for a
   broader stateful/event-driven policy invention campaign that excludes the closed
   grids.
6. [06-hybrid-strategy-search.md](06-hybrid-strategy-search.md) — first gate-aware
   pass complete: Minus Right, monitor denial and 125 clock-phased combinations all
   fail after the sourced per-unit Withered endgames are modeled. See
   [`GATE-SEARCH.md`](../docs/strategy/GATE-SEARCH.md).
7. [07-tooling-consolidation.md](07-tooling-consolidation.md) — queued tooling
   correctness fixes and consolidation opportunities found by the 2026-08-23
   all-tools audit; take the contract fixes first and refactor opportunistically.
8. [08-audio-cue-controller.md](08-audio-cue-controller.md) — audio-cue research:
   the target phone's internal capture cannot hear the critical fast-mixer cues
   without root; external A2DP is the validated slower path now composed by
   Plan 19 P6 and Plan 20.
9. [09-observation-corpus.md](09-observation-corpus.md) — versioned multimodal
   session, holdout, and replay contract for lifecycle, actuator-state, visual,
   and audio observations.
10. [10-stock-device-controller.md](10-stock-device-controller.md) — explicit
    observation/belief/policy/action/verification controller, extracted in
    shadow from the existing device route.
11. [11-policy-interface-and-baselines.md](11-policy-interface-and-baselines.md)
    — exact-engine policy adapter, measured fault injection, and independently
    reimplemented Jason/Shooter25/Couraeel-style baselines.
12. [12-end-to-end-evidence-campaign.md](12-end-to-end-evidence-campaign.md) —
    claim ladder and promotion gates from offline replay through a Night 6
    cohort and, only after separate qualification, 10/20.
13. [13-campaign-and-all-night-support.md](13-campaign-and-all-night-support.md)
    — save-safe lifecycle, per-night policy qualification, fresh-save story
    progression, and verified Custom Night configuration.
15. [15-sensor-independent-observations.md](15-sensor-independent-observations.md)
    — one definition per game fact, one calibrated adapter per capture method,
    and a refusal for every pairing that has not been calibrated.
14. [14-device-portability-and-profiles.md](14-device-portability-and-profiles.md)
    — normalized canvas/controller coordinates behind a device profile, models
    and timing bound to the profile they were measured under, and a bounded
    new-device calibration session.
16. [16-constrained-policy-search.md](16-constrained-policy-search.md) —
    dominance-pruned beam search over the device plan's timing geometry
    (evaluated through `human-gate.mjs` at 1200 seeds), targeting the item 10/11
    Foxy-reset decoupling and the Night 7 opener, with machine-readable
    provenance so a winning candidate ships its `[SOURCED]`/`[ASSUMED]`
    dependency list. Structured vehicle for `PROGRESS.md` item 9.
17. [17-in-apk-bot.md](17-in-apk-bot.md) — laser-focused same-process bot campaign:
    test retail hooks, modified-package, loader/shim, CCN rebuild and faithful
    recompile routes until one APK can observe, decide and act internally with an
    auditable trace.
18. [18-modern-tooling.md](18-modern-tooling.md) — nine tooling additions, each
    tied to a documented failure: `shellcheck` + footgun fixtures, `tsc --checkJs`
    on the engine, a confidence-interval helper for the gates, a property-based
    harness, an on-device input-dispatch trace, a `scrcpy` capture path, a pinned
    Python toolchain, executable-doc number checks, and a devcontainer. No new
    runtime dependency, no build step.
19. [19-video-reactive-controller.md](19-video-reactive-controller.md) — the
    stock-device visual loop: calibrated native-resolution watchlist facts,
    animation-safe blackout reaction, observe-only promotion, and a delayed
    external-A2DP audio slow path.
20. [20-belief-state-cycle-controller.md](20-belief-state-cycle-controller.md)
    — the architecture above the sensor and driver plans: an ESP32-maintained,
    uncertainty-aware digital twin that evaluates and verifies bounded next
    cycles instead of replaying a fixed macro.
21. [21-policy-program-synthesis.md](21-policy-program-synthesis.md) — a shared
    policy-program IR, structural strategy search, and simulator-to-phone
    equivalence gate so the invention engine can synthesize complete pilots
    rather than timing permutations.
22. [22-architecture-and-developer-experience-refactor.md](22-architecture-and-developer-experience-refactor.md)
    — architectural umbrella: a `@fnaf2-1020/*` workspaces monorepo, canonical
    core package, trainer as a leaf application, conventional automation
    vocabulary, capability-aware sensor/actuator adapters, first-class research
    experiments, strict typed/runtime contracts, fast deterministic test lanes,
    a profile-driven device service and optional actuator MCP, generated
    knowledge indexes/portal, a legible repository front door, and a
    characterized migration away from the monolithic device shell path.
