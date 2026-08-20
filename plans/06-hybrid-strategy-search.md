# Derivation, tier 4: hybrid and phase-based strategies

**Status:** first gate-aware pass complete; no survivor (`GATE-SEARCH.md`). The
Android decompile is available and is now the validation gate. The search corrected
two simulator errors, retracted an apparent 150/150 monitor-denial result, and closed
the fixed/clock-phased policy family below under the current sourced model.

## 2026-08-19 result

`tools/gatesearch.mjs` now covers reactive box thresholds, fixed CAM 06 / CAM 07 /
CAM 03 / CAM 06+07 anchors, and all 125 three-phase schedules that switch among
those sets (or no camera) at 2 AM and 4 AM. A perfect-information timer policy was
also tested as an upper bound.

The first monitor-denial result appeared clean because the engine incorrectly gave
every office-opening occupant the Toys' six-second continuous-cams-up grace. The
event sheets show separate endgames: Withered Bonnie's night-7 per-unit cooldown is
300 frames before a later cams-up entry; Withered Chica arms after six scheduler
ticks. Once those are modeled and masked, the music-box economy collapses. Final
clean survival: denial 10%, CAM 06 0%, CAM 07 12%, CAM 03 7%, CAM 06+07 0%; the
best phase schedule is simply `07 → 07 → 07` at 12%. Every row reaches 0% box.
Minus 7 remains 200/200. Full audit and reproducible table: `GATE-SEARCH.md`.

## Goal

Search beyond fixed full-cover loops for a second structurally novel strategy:
partially stall the most dangerous routes, handle the rest reactively, and keep the
result short enough for a human to learn.

Plan 05 mostly exhausted the simple static-cover space. CAM 06/07 (the Six-Seven
Strat) is the unique two-camera cover in the current graph; a one-camera full cover
does not exist. The remaining room for novelty is therefore in **hybrids, unequal
cadences, phase changes and compact decision policies**, not another permutation of
three permanently flashed rooms.

## Former lead candidate: “Minus Right”

> **Search result:** 0/150 clean after the sourced per-unit office endgames were
> folded in. Retained below as the hypothesis that motivated this plan.

Flash only **CAM 06** every five seconds, permanently stalling the three modeled
right-route occupants:

- Toy Bonnie
- Withered Chica
- Mangle

Then handle Withered Bonnie, Withered Freddy, Toy Chica and Toy Freddy through their
normal hall/blackout/mask behavior. Foxy, Balloon Boy, Golden Freddy and the Puppet
remain hand-managed as usual.

The intent is to remove Toy Bonnie — the main source of losable RNG — with one fixed
camera anchor, while accepting predictable reactive work from the other routes. If it
works, the steady loop would have only one stall flash and unusually generous music-
box time.

### Why it should feel like FNaF 1’s 4B strategy

The control philosophy is the same:

> make one camera the run's permanent strategic anchor, use it to neutralize the
> nastiest roaming threat, and manage everyone else reactively around that lock.

In FNaF 1's optimal 4/20 strategy, CAM 4B (East Hall Corner) camera-stalls Freddy once
he reaches his final phase. Freddy is effectively removed while the player handles
Bonnie, Chica, Foxy, doors and power. Minus Right would give CAM 06 that same *role*:
the player repeatedly returns to it to remove the right-route problem, then handles
the remaining office threats.

The mechanics are not identical. FNaF 1 Freddy is stopped by watching/parking CAM 4B;
Minus Right would have to land a **camera-light stun** on CAM 06 and refresh its
6.66-second timer. FNaF 2 also forces visits to CAM 11 for the music box, so CAM 06
cannot simply remain selected. The analogy predicts how the strategy would *feel*,
not that the underlying code is the same.

FNaF 1 references:

- Technical-FNaF Wiki — [4B Strat](https://technicalfnaf.fandom.com/wiki/4B_Strat_%28Best%29)
- Technical-FNaF Wiki — [Freddy Fazbear mechanics](https://technicalfnaf.fandom.com/wiki/Freddy_Fazbear_%28Fnaf_1%29)

## Other search branches

1. **CAM 07-only + right-vent-light control.** Stall the hall group on CAM 07 and
   reuse Shooter25's right-vent-light stall for Toy Bonnie; clear Withered Chica and
   Mangle through mask timing. Likely more reactive than Minus Right, but still built
   around one camera flash.
2. **Unequal camera cadences.** Refresh the dangerous route every five seconds while
   checking safer routes only on the movement phases when they can actually be
   occupied. Search schedules over a 10-, 15- or 20-second repeating supercycle.
3. **Phase-based routines.** Exploit the known travel time at the start of the night:
   wind aggressively while target rooms are empty, then switch to a stable holding
   loop once the animatronics reach them.
4. **Hybrid stall/tank partitions.** Enumerate which animatronics are stalled and
   which are deliberately allowed into blackouts or vent openings. Compile each
   partition into a fixed backbone plus the smallest necessary reaction table.
5. **Human-readable policy search.** Search short rules — for example, “after a
   blackout do X; otherwise flash CAM 06 and wind” — rather than a black-box learned
   agent. Fitness must penalize branches, inputs and memory burden as well as deaths.

## Work

1. ~~Generalize the bot from a fixed camera-cover script to a fixed backbone plus
   reactive blackout/vent decisions.~~ Done for the gate-aware family; reproducing
   published RVC remains separate future work.
2. ~~Evaluate Minus Right before widening the space.~~ Done; 0/150 clean.
3. ~~Enumerate CAM 07, hybrid partitions and clock phases.~~ Fixed CAM 07 and all
   125 three-phase schedules done. Right-vent-light control remains unmodeled.
4. ~~Rank survivors by consistency first, then human cost.~~ Done; no row clears
   the consistency gate, and every row reaches an empty box.
5. ~~Compare against the documented frontier.~~ Done; Minus 7 remains 200/200,
   while the CAM 03/06/07 branches and phase schedules all fail.
6. No real-game protocol was produced because no simulator survivor exists. Any
   future branch must first beat the corrected model and audit its unsupported
   mechanics.

## Model gates

- Toy Bonnie's special CAM 06 → blind-spot timer remains the first gate for Minus
  Right, just as it is for Six-Seven.
- The engine's post-chokepoint routes, blackout forcing and vent departures are
  approximations. A hybrid policy makes all of them load-bearing.
- Right-vent-light stalling is not implemented yet.
- A simulator win is a candidate-generation result only. Nothing becomes a named,
  teachable strategy until it survives the owned Android build.

## Done when

Either a second compact candidate exists with full simulator metrics, prior-art
comparison, dependency audit and real-game protocol — or the searched hybrid/policy
space is recorded well enough to show why Six-Seven and the known strategies remain
the useful frontier.
