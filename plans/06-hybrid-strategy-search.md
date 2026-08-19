# Derivation, tier 4: hybrid and phase-based strategies

**Status:** planned, not started. **Depends on:** plan 05's camera-cover search and
its CAM 06/Toy Bonnie validation gate. This work can produce simulator hypotheses
before the Android decompile is available, but cannot prove that they transfer to the
game.

## Goal

Search beyond fixed full-cover loops for a second structurally novel strategy:
partially stall the most dangerous routes, handle the rest reactively, and keep the
result short enough for a human to learn.

Plan 05 mostly exhausted the simple static-cover space. CAM 06/07 (the Six-Seven
Strat) is the unique two-camera cover in the current graph; a one-camera full cover
does not exist. The remaining room for novelty is therefore in **hybrids, unequal
cadences, phase changes and compact decision policies**, not another permutation of
three permanently flashed rooms.

## Lead candidate: “Minus Right”

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

1. Generalize the bot from a fixed camera-cover script to a fixed backbone plus
   reactive blackout/vent decisions. First reproduce a known reactive strategy so
   its behavior can be checked against the published consistency rate.
2. Evaluate Minus Right before widening the space: clean seeds, worst luck, jitter,
   music-box floor, power use, and deaths grouped by escaped character/transition.
3. Enumerate CAM 07/right-vent-light and hybrid partitions, then unequal cadences and
   phase changes.
4. Rank survivors by consistency first, then human cost: inputs per ten seconds,
   number of conditional branches, tightest reaction window and layout travel.
5. Compare each survivor against Minus Two, Minus Toys, RVC and Six-Seven before
   making any novelty claim.
6. Produce a real-game test protocol for every survivor's unsupported mechanics.

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

