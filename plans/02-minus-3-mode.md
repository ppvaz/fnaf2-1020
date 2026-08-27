# Trainer mode: Minus 3

**Status:** research done — see `MINUS-3-STRATEGY.md` (2026-08-19). Step 2
(sim-verify before teaching) **done 2026-08-20 (second pass)**: the *glitchless*
member is NOT zero-RNG on the canonical Android model — the adapted Minus Two
probe (`tools/minus2test.mjs`) scores 16/200 with a structural Toy Chica failure
against the sourced consecutive-mask semantics, see `MINUS-3-STRATEGY.md` §7.
Engine gaps from §5 that were load-bearing are now closed (camera stall,
right-vent Toy Bonnie stall, vent-light battery).

~~Minus Toys cannot transfer (no glitch state, CAM 09 flash-excluded)~~ —
**withdrawn 2026-08-26.** The double-camera state *does* exist on Android:
`viewing` (counter 55) and the `your view` marker (126) are separate fields, a
monitor raise restores only `viewing` from a 200 ms-stale `last viewed`, and the
flash groups read the marker for the target and `viewing` for the CAM 08/09/11
immunity — so the exclusion is bypassable. A retained device frame from the
cleared Night 1 caught both camera buttons lit. See
`docs/android/ANDROID-SOURCE-STATUS.md` §"2026-08-26: the double-camera glitch
*does* transfer".

**This reopens the plan's headline question rather than answering it.** Minus
Toys is now *unprobed*, not refuted: the engine has no two-camera state, no
glitch-aware probe exists, and the arming input has never been attempted on the
device. The framing decision (best-odds practice / PC history / close the mode)
is therefore **blocked on a new step 2a**, added to Work below.

**Research verdict:** the mode should teach **Minus Toys** (Zach_Scream, 2025), the
family's state of the art and the second-ever zero-RNG strategy; the 2023 original is
historical. It is still a fixed clock-anchored cycle (good lane fit, two-branch
blackout decision), but it is *not* pure data: cam-stall, the double camera glitch
(sourced on Android 2026-08-26, unmodelled),
CAM 08/09 flash immunity, GF interval avoidance, RVC mask timing and the right-vent
light stall are all engine mechanics Minus 7 never needed — see the doc's §5 gap list.
The glitch also carries a legitimacy caveat the mode must surface; glitchless
"Minus Two" is the natural sibling mode if its CAM 03 stall can be sourced.

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
2a. **Probe Minus Toys properly (new, 2026-08-26).** Three parts, in order:
   split the engine's camera selection into `viewing` and a marker so g450-457
   can read them separately; write a glitch-aware Minus Toys probe beside
   `minus2test.mjs`; and measure on the device whether the 200 ms arming window
   is hit reliably through the phone's actuator. Until all three exist, the
   family's headline verdict stays "possible in the data model, unmeasured".
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
