# Derivation, tier 1: slack-maximised Minus 7

**Status:** not started. **Depends on:** nothing — runnable today with the existing sim.

## Goal

Search the neighbourhood of the existing `CYCLE_SCRIPT` for the variant with the most
timing slack: same stall guarantee, most forgiving offsets. Ship it either as the new
default script or as an alternative "forgiving" script, whichever the numbers justify.

## Why this is the safe tier

It stays entirely inside the well-modelled region of the engine — the same mechanics
Minus 7 already exercises and the tests already validate — so sim results transfer to
the real game. The known baseline from the README: survivable to ~120 ms late, ~35 %
at 200 ms, dead past 300 ms (`tools/bbtest.mjs --jitter`).

## Search space

Treat the script as a point and vary:

- camera order within the sweep (10/04/07 permutations, CAM 11 position),
- per-step offsets inside the ~1.5 s active window,
- wind hold duration vs. cycle anchor,
- where the mask flick and hall flash sit in the down-phase.

Constraints: the stun chain must never lapse (zero lapses across seeds), BB and the
duel window must stay handleable, wind must keep the box off empty on worst luck.

## Work

1. A search harness in `tools/` (grid or hill-climb — the space is small) with fitness
   = maximum uniform jitter at which the seed sweep still clears, tie-broken by
   survival rate at fixed jitter levels.
2. Validate winners the way the README validates the current script: 200-seed sweep,
   worst-luck sweep, jitter curve.
3. If a meaningfully better script exists, decide with Pedro: replace the default or
   offer both. Update `CYCLE_SCRIPT`, lesson briefs, and the README numbers.

## Markiplier's suspicion, tested against the model (2026-08-19)

Markiplier closes his July 2026 video suspecting his routine can be optimised: "a
better pattern with which to flash Foxy", and rebinding flash to a mouse button to
"use less flashlight". Checked against the Technical-FNaF wiki's flashlight page
(fetched via the API) and our engine:

- **Ground truth:** flashlight power is tracked per *frame held* — hall flash and
  camera light share the 3000-frame (50 s) custom-night budget, vent lights are
  free. Foxy's eviction exposure is also per-frame. But the flash's *effects* (the
  6.66 s stun, resetting it, zeroing Foxy's D) trigger per event. The wiki states
  the consequence outright: "spamming the flashlight is more power efficient than
  holding it down." The engine models all of this faithfully (`engine.js:235`,
  `stunCam`, `tickFoxy`).
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

Human slack is not uniform jitter — real lateness correlates across steps and clusters
on specific inputs (the duel, the wind drag). Worth a second fitness pass with
per-step jitter profiles before claiming the variant is better *for humans*.

## Done when

The search harness is in `tools/` and reproducible, the jitter curves of old vs. new
script are documented, and either the script changed with tests updated, or the plan
records that the current script is already (near-)optimal — a legitimate result.
