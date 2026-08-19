# Research pass: the 10/20 strategy landscape

**Status:** not started. **Depends on:** nothing — this is the prerequisite for every other plan in this directory.

## Goal

A sourced write-up of the current FNaF 2 10/20 strategy meta, at the same standard as
`MINUS-7-STRATEGY.md`: what each strategy is, its exact input routine, which mechanics it
depends on, whether it has losable RNG, and its most recent community revisions.

Minimum coverage:

- **Minus 3** (Niko Frost lineage) — exact camera set, cadence, and latest revision.
- **Right vent camp** — the routine, its decision points, and its known RNG losses.
- Anything newer that has superseded either since late 2023.

## Why it comes first

- Plans 02 and 03 (new trainer modes) need the routines pinned down before any code.
- Plan 05 (deriving a new strategy) needs the meta to judge whether a result is novel
  or a rediscovery.
- This repo holds itself to `[SOURCED]` discipline in `src/config.js`; nothing gets
  taught by the trainer on my (Claude's) background knowledge alone.

## Work

1. Web research: community AI breakdowns, decompilation write-ups, strategy authors'
   own posts/videos (Niko Frost et al.), speedrun/challenge community docs.
2. For each strategy, map its mechanical dependencies against what `engine.js` models,
   and flag every dependency that is currently `[CALIBRATED]` or approximated
   (post-chokepoint routing is the known big one).
3. Write one doc per strategy (`MINUS-3-STRATEGY.md`, `VENT-CAMP-STRATEGY.md`, …) in
   the style of `MINUS-7-STRATEGY.md`, with sources inline.

## Done when

Each strategy doc is complete enough that plan 02/03 could be implemented from the doc
alone, and each engine gap needed by a strategy is explicitly listed in that doc.
