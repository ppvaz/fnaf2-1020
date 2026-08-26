# Plans

Future work beyond the Minus 7 trainer, one file per ask, written to be picked up cold
in any later session. Suggested order and dependencies:

**Current completion and the single next action:**
[`PROGRESS.md`](PROGRESS.md).

Current triage (2026-08-20):

- **Plan 02 is blocked on a framing decision (2026-08-20 second pass):** the
  sim-verify step ran and the Minus 3 family is NOT zero-RNG on Android
  (Minus Toys can't transfer; adapted Minus Two probes 16/200 — see
  `MINUS-3-STRATEGY.md` §7). The mode is only worth building as best-odds
  practice or PC history, or after on-device validation of the
  consecutive-tick mask clears.
- **Most untouched work:** Plan 03, a real reactive-grading mode; it is larger than
  a script addition and still needs its Android vent/endgame rules sourced.
- **Plan 04's runnable experiment is complete:** per-step model windows and an
  explicitly inferred human-error profile now exist. The next useful input is
  measured trainer timing by step, not another invented profile.
  *(2026-08-25: the collection pipeline for exactly that now exists —
  `/save-trace` + `tools/tracereport.mjs`. What remains is practice runs.)*
- **No blind-search juice:** Plans 05 and 06 have completed/closed their defined
  Android search families. Reopen them only when a corrected source rule changes
  the reachable policy space.

Bot-research roadmap added 2026-08-26:

- **Plan 09 defines the shared evidence substrate.** Build its schema/replay
  contract before collecting another unstructured detector corpus.
- **Plan 10 closes the stock-device controller loop.** Start in shadow over the
  current runner; it is an incremental extraction, not a big-bang rewrite.
- **Plan 11 makes simulator policy comparisons fair.** It can proceed beside
  Plan 09 after their observation record is agreed, and does not require RL.
- **Plan 12 owns promotion and claims.** It is the gate from replay to shadow,
  bounded action, full Night 6, reliability cohort, and only then 10/20.

1. [01-research-pass.md](01-research-pass.md) — sourced docs for the 10/20 meta.
   Prerequisite for 02, 03 and the novelty check in 05.
2. [04-optimize-minus-7.md](04-optimize-minus-7.md) — slack-maximise the existing
   script. No dependencies; runnable today.
3. [02-minus-3-mode.md](02-minus-3-mode.md) — Minus 3 as a second trainer mode.
4. [03-right-vent-camp-mode.md](03-right-vent-camp-mode.md) — right vent camp mode;
   needs a reactive coaching model, the biggest piece.
5. [05-derive-new-strategy.md](05-derive-new-strategy.md) — first derivation pass
   produced **Six-Seven**, then the sourced route graph refuted it and independently
   re-derived Minus 7 as the only robust minimal cover.
6. [06-hybrid-strategy-search.md](06-hybrid-strategy-search.md) — first gate-aware
   pass complete: Minus Right, monitor denial and 125 clock-phased combinations all
   fail after the sourced per-unit Withered endgames are modeled. See
   [`GATE-SEARCH.md`](../docs/strategy/GATE-SEARCH.md).
7. [07-tooling-consolidation.md](07-tooling-consolidation.md) — queued tooling
   correctness fixes and consolidation opportunities found by the 2026-08-23
   all-tools audit; take the contract fixes first and refactor opportunistically.
8. [08-audio-cue-controller.md](08-audio-cue-controller.md) — recovered plan for
   windowed, fully on-device Android playback capture and cue classification;
   source mapping, target-phone calibration, timing, simulation, and shadow-mode
   gates precede any Night 7 action.
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
