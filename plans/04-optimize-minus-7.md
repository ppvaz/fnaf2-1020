# Derivation, tier 1: slack-maximised Minus 7

**Status: clean guarantee current; 2026-08-19 slack ranking superseded on
2026-08-23.** The shipped cycle still clears 200/200 seeds and 100/100 pinned
luck, but the old uniform-jitter curve no longer reproduces after the sourced
route/endgame, Puppet-roll, and per-night AI corrections. On the current engine
the legacy row-by-row probe is 89/200 at 100-120 ms and 0/200 at 150 ms. Its old
“167 ms ceiling” and 4-10-7 ranking are historical results, not current claims.

The optional per-step instrumentation is now implemented:

- `cyclesearch --steps` shifts one motor step at a time, with no timing
  randomness, and finds these first-failure windows over 200 seeds:

  | Step | Earliest | Latest |
  |---|---:|---:|
  | monitor down | -450 ms | +300 ms |
  | mask on | -300 ms | +200 ms |
  | mask off | -450 ms | +50 ms |
  | hall flash | -50 ms | +267 ms |
  | monitor up | -150 ms | +117 ms |
  | CAM 10 | -117 ms | +150 ms |
  | CAM 04 | -150 ms | +150 ms |
  | CAM 07 | -150 ms | +133 ms |
  | CAM 11 | -133 ms | +517 ms |
  | WIND | at least -750 ms | +467 ms |

- `cyclesearch --curve --profile=human` keeps press/release rows together and
  applies explicitly `[INFERRED]` weights. Its baseline is 100% through 120 ms,
  13% at 150 ms, 1% at 200 ms, and 0% at 250 ms. This is a sensitivity analysis,
  not evidence about Pedro: replace the weights with per-step `Coach.results`
  timing before using it to rank a routine for a person.

**Recommendation: keep the shipped script.** No current evidence supports the
old candidate over it, and the only human-executable difference was the camera
order. Rerun the candidate search only after measured player timing supplies the
profile; do not optimize harder against another invented distribution.

**Android evidence (2026-08-20, corrected same day):** the 400-frame flash
stall is Android-sourced after all — groups 450-457 load it from the
never-rewritten `stun time` counter; the earlier "source Counter fixed at
zero" reading was the pre-XOR handle scramble (see
[`ANDROID-CAMERA-STALL.md`](../ANDROID-CAMERA-STALL.md)). The corrected
sourced model (flash stun + Withered/Mangle look-hold) passes the shipped
schedule 200/200, so the clean guarantee stands on a sourced mechanism. Later
route/endgame corrections changed the jitter curve, so the old optimization
ranking does not.

## Goal

Search the neighbourhood of the existing `CYCLE_SCRIPT` for the variant with the most
timing slack: same stall guarantee, most forgiving offsets. Ship it either as the new
default script or as an alternative "forgiving" script, whichever the numbers justify.

## Why this is the model-local tier

It stays entirely inside the well-modelled region of the engine — the same mechanics
Minus 7 already exercises and the tests already validate — so comparisons between
cycle variants are controlled inside the simulator. The current legacy baseline is
100% at 50 ms, 45% at 100-120 ms, and 0% from 150 ms (`cyclesearch --curve`).
Because it jitters press/release rows independently, use the grouped per-step
profile for human sensitivity work.

## Search space

Treat the script as a point and vary:

- camera order within the sweep (10/04/07 permutations, CAM 11 position),
- per-step offsets inside the ~1.5 s active window,
- wind hold duration vs. cycle anchor,
- where the mask flick and hall flash sit in the down-phase.

Constraints: the stun chain must never lapse (zero lapses across seeds), BB and the
duel window must stay handleable, wind must keep the box off empty on worst luck.

## Work

1. ~~Build the search and per-step sensitivity harness~~ — done in
   `tools/cyclesearch.mjs`.
2. ~~Revalidate the shipped cycle and publish current per-step windows~~ — done;
   see the dated status above.
3. Re-run candidate ranking only after a measured per-step player profile exists.
   Until then the decision is no ship; the old 4-10-7 result is superseded.

## Markiplier's suspicion, tested against the model (2026-08-19)

Markiplier closes his July 2026 video suspecting his routine can be optimised: "a
better pattern with which to flash Foxy", and rebinding flash to a mouse button to
"use less flashlight". Checked against the Technical-FNaF wiki's flashlight page
(fetched via the API) and our engine:

- **Community/PC-derived rule:** flashlight power is tracked per *frame held* — hall flash and
  camera light share the 3000-frame (50 s) custom-night budget, vent lights are
  free. Foxy's eviction exposure is also per-frame. But the flash's *effects* (the
  6.66 s stall, resetting it, zeroing Foxy's D) trigger per event. The wiki states
  the consequence outright: "spamming the flashlight is more power efficient than
  holding it down." The engine models all of this faithfully (`engine.js:235`,
  `stunCam`, `tickFoxy`). Android behavior confirms the same stall duration; its
  static initializer provenance is still open.
- **His flash-pattern hope is a dead end in-model:** exposure is linear in lit
  frames, so evicting Foxy costs exactly 700 lit frames — 23% of the night's power —
  regardless of pattern, and he returns 13–27 s later. Minus 7's per-cycle handling
  (2 lit frames per cycle ≈ 170 frames/night keeping D at 0) strictly dominates
  eviction; there is no pattern to find, only alignment choices (which is what his
  BB-alignment trick already is).
- **His tap-over-hold point is real but already embodied:** per-event effects make
  minimal-length flashes optimal, and the trainer's cycle already uses 2-frame
  (33 ms) flashes; the `flashHold`/`hallHold` knobs in the search explore the floor.
- Residual unknown for the decompile: whether real-game exposure quantises to ~1 s
  ticks (his "goes up by 50, sometimes 60") with proportional partial credit — he
  says proportional, which changes nothing; only a rounding quirk would.

## Caveat to carry into the write-up

Human slack is not uniform jitter — real lateness correlates across steps and
clusters on specific inputs (the duel, the wind drag). The new profile mechanism
can express that, but its shipped `human` weights are deliberately `[INFERRED]`.
Do not claim a variant is better *for humans* until trainer traces replace them.

## Done when

If reopened, the measured profile is in `tools/` and reproducible, current old-vs-
new curves are documented, and either the script changes with tests updated or
the plan records that the shipped script remains best under that evidence.
