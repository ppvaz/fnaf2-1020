# Trainer mode: Minus 3

**Status:** not started. **Depends on:** plan 01 (the `MINUS-3-STRATEGY.md` doc it produces).

## Goal

Minus 3 as a selectable strategy mode alongside Minus 7: its own cycle script, its own
lesson ladder, same trainer machinery.

## Why it's a good fit

Minus 3 is the same family as Minus 7 — a fixed, metronomic flash loop, just a different
camera set/cadence. The trainer's Minus 7-specific surface is mostly data:

- `CYCLE_SCRIPT` in `src/config.js` is a declarative timeline.
- The lesson ladder in `src/curriculum.js` is built from it.
- The rhythm lane, coach, and millisecond grading are script-agnostic.
- `tools/simtest.mjs` can prove any scripted routine against seeds.

So this is "new script + new lesson ladder + strategy selection UI," not a new engine.

## Work

1. Encode the sourced routine as a second cycle script; parameterise `TARGET_CAMS`,
   anchor times, and tolerances per strategy.
2. **Sim-verify before teaching:** seed sweep + worst-luck sweep. Establish whether
   Minus 3 is RNG-proof like Minus 7 or has losable rolls — the answer changes how the
   mode is framed (drill machine vs. best-odds practice).
3. Fill any engine gaps the strategy doc flagged (mechanics Minus 7 never exercised).
4. Build the lesson ladder (mirroring the 10-step structure where it maps).
5. Strategy picker in the UI; per-strategy progress/records kept separate.
6. Extend `simtest`/`lessontest` to cover the new script; jitter sweep to publish its
   lateness tolerance like the README does for Minus 7.

## Open questions

- Does mode selection live in Settings or as a top-level entry screen?
- Shared vs. per-strategy layout calibration (probably shared — same physical controls).

## Done when

Minus 3 is playable end-to-end through its lesson ladder, the sim sweeps for it are in
the test suite, and the README documents it with the same honesty as Minus 7
(including its RNG verdict).
