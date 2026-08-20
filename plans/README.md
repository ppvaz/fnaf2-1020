# Plans

Future work beyond the Minus 7 trainer, one file per ask, written to be picked up cold
in any later session. Suggested order and dependencies:

Current triage (2026-08-20):

- **Most product juice:** Plan 02. Android behavior has now cleared its camera-stall
  dependency; the static initializer gap is provenance work, not a product gate.
- **Most untouched work:** Plan 03, a real reactive-grading mode; it is larger than
  a script addition and still needs its Android vent/endgame rules sourced.
- **Smallest runnable experiment:** Plan 04's optional per-step human-jitter pass.
  Its likely payoff is modest.
- **No blind-search juice:** Plans 05 and 06 have completed/closed their defined
  Android search families. Reopen them only when a corrected source rule changes
  the reachable policy space.

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
   [`GATE-SEARCH.md`](../GATE-SEARCH.md).
