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

**2026-08-28: the device half moved from accidental evidence to a deliberate
proof.** A scheduled HID stream armed the split on its first HID attempt on the
target Moto g56: after establishing CAM 11 as `last viewed`, it clicked CAM 09,
left one 17 ms released poll, dropped the monitor, and raised it again. The
result shows the Prize Corner/CAM 11 feed and wind control while **both CAM 09
and CAM 11 are highlighted**. Artifacts are
`captures/n2-doublecam-hid-0003.{png,hid}`. This answers “can the phone's
actuator hit the stale-sample window?” with **yes for one bounded attempt**. It
does not yet prove repeatability or that a held glitched light actually stuns
the Toys.

The headline question remains open rather than refuted: the engine still has no
two-camera state and no glitch-aware Minus Toys probe exists. Crucially, do not
carry Minus Two's Toy Chica failure over as a Minus Toys verdict. Minus Two let
Toy Chica reach the opening; Minus Toys is specifically meant to pin Toy Chica,
Toy Bonnie and Toy Freddy on CAM 09. Android's consecutive mask semantics remain
load-bearing for Mangle and BB, but the prior 16/200 Toy Chica mechanism does not
by itself close this strategy.

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
2a. **Probe Minus Toys properly (advanced 2026-08-28).** Three parts, in order:
   split the engine's camera selection into `viewing` and a marker so g450-457
   can read them separately; write a glitch-aware Minus Toys probe beside
   `minus2test.mjs`; and measure on the device whether the 200 ms arming window
   is hit reliably through the phone's actuator. One 50 ms HID geometry has now
   armed it once; repeatability and the actual glitched stun remain open. Until
   all three exist, the family's headline verdict stays "possible and
   deliberately armed on device, policy unmeasured".
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
