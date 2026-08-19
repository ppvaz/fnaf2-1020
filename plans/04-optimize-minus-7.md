# Derivation, tier 1: slack-maximised Minus 7

**Status: search done (2026-08-19) — the shipped cycle already sits at the slack
ceiling.** `tools/cyclesearch.mjs` (camera-order sweep + coordinate hill-climb over
11 timing knobs, fitness = largest uniform jitter with a 100% seed sweep):

- **Ceiling unchanged:** every camera order and every knob neighbourhood tops out at
  10 frames (167 ms) of all-survive jitter — the current routine is already optimal
  at the ceiling.
- **Tail fattened:** the best variant (order **4-10-7**, mask 1 frame earlier, hall
  flash 1 frame shorter, 3-frame cam flashes) survives 33% at 200 ms vs the current
  19%, 3% vs 0% at 250 ms; validated 200/200 clean and 100/100 worst-luck.
- **Recommendation: keep the shipped script.** The gains live past the death cliff
  and the timing deltas are single frames — below the trainer's own `TOL_GOOD`
  (150 ms) grading resolution, so teaching them would churn muscle memory for
  nothing measurable. The camera-order swap (4 before 10) is the only
  human-executable difference; worth revisiting only with the per-step jitter
  profiles below, where "which step is most often late" could favour it. Pedro
  decides if it ever ships.

Remaining (optional) work: the per-step-jitter fitness pass below.

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

1. ~~A search harness in `tools/`~~ done — `tools/cyclesearch.mjs`.
2. ~~Validate winners~~ done — see status above.
3. Decision on shipping the 4-10-7 variant: parked with Pedro (recommendation: no,
   for now — see status).

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
