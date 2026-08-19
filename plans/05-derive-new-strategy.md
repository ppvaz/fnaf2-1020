# Derivation, tiers 2–3: a structurally new strategy

**Status:** first derivation pass complete (2026-08-19). `tools/strategysearch.mjs`
enumerated the minimal camera covers of the modeled route graph and found a unique
two-camera structure, the **Six-Seven Strat** (also **CAM 67** / **Deep 7**). It
clears 200/200 modeled seeds and 100/100
worst-luck seeds while retaining the 167 ms all-survive jitter ceiling. The full
result and its dependency audit are in `CAM-6-7-STRATEGY.md`.

This satisfies the plan's simulator-result branch, but not the stretch goal: the
Six-Seven Strat remains a **sim-derived experiment awaiting real-game/decompile
validation**.
Its key dependency, Toy Bonnie's special CAM 06 → blind-spot timer, is not represented
faithfully enough to call the routine real or zero-RNG. No trainer mode should ship
before Pedro validates that transition on the Android build.

## Goal

Derive a 10/20 strategy structurally different from Minus 7, using the simulator as
the fitness function. Stretch goal (tier 3): one that is new to the community, not a
rediscovery.

## The idea

The chokepoint comment in `src/config.js` is the seed: the three-camera loop works
because every stallable route passes through CAM 10/04/07 one move from its start
room. That is a graph property, and alternatives can be enumerated:

- different camera covers of the route graph (other chokepoint sets, other cadences),
- hybrid schemes — deliberately let specific animatronics past their chokepoint and
  handle them with mask/vent light instead of stalls, stall the rest,
- schemes that trade stun coverage for slack elsewhere (fewer flashes per cycle).

Search: enumerate candidate structures from the route graph, compile each into a cycle
script (or decision table), evaluate with the plan 04 harness — seed sweep, worst-luck
sweep, jitter curve.

## Prior art (searched 2026-08-19)

No public project uses machine learning — or any automated search — to *derive* FNaF
strategy. What exists:

- Screen-automation bots with hand-coded strategy:
  [kevvit/fnafbot](https://github.com/kevvit/fnafbot) (FNaF 1 Night 7, sprite matching
  + scripted responses) and
  [kalebwbishop/FNAF_Bot](https://github.com/kalebwbishop/FNAF_Bot) (FNaF 1 4/20 —
  uses a CNN, but only for recognising animatronics in camera feeds; the strategy is a
  fixed hand-coded sequence). ML as eyes, never as the strategist.
- The closest methodological precedent: Shooter25's in-game bot mod (2024) plays
  brayden's strategy perfectly to *measure its consistency* (104 wins / 1 death —
  see `MINUS-3-STRATEGY.md` §4). Hand-coded execution of a human-derived strategy;
  the same remove-the-human validation idea as this repo's simulator, but not search
  and not learning.
- All strategy innovation, Minus 7 included, comes from humans reasoning over the
  decompiled mechanics
  ([TheBones5's FNaF 2 AI breakdown](https://steamcommunity.com/sharedfiles/filedetails/?id=2996224710),
  the [10/20 guide videos](https://www.youtube.com/watch?v=FizTzjyGP3U),
  the [Max Mode list](https://sites.google.com/view/maxmodelist/main-list/ml-primary)
  community).

Two conclusions baked into this plan:

- **The niche is open.** Simulator-driven strategy search over the known mechanics has
  no published precedent, which raises the odds a survivor here is genuinely new —
  though the novelty check against the plan 01 meta doc still stands.
- **Search over learning, deliberately.** The mechanics are fully known, discrete and
  low-dimensional — the regime where explicit simulation + enumeration beats a learned
  policy. RL would spend millions of episodes rediscovering what the route graph says
  for free, and a learned policy is a black box that can't be turned into a teachable
  human routine. A trainer needs human-executable scripts, so this plan searches; it
  does not train an agent.

## The honest caveats (write them into any result)

1. **Model coverage.** The engine models the mechanics *Minus 7* depends on.
   Post-chokepoint routing is explicitly an approximation and several constants are
   `[CALIBRATED]`. Tier 2/3 candidates will lean on exactly those parts, so a
   "200/200 seeds" verdict is a verdict about the model, not the game. Every
   candidate's mechanical dependencies must be listed, and the approximated ones
   sourced (plan 01 / plan 03 overlap) before trusting the sim.
2. **Novelty.** A decade of max-mode grinding plus the decompiled game means most
   viable structures are probably known. Expect rediscovery; check every survivor
   against the plan 01 meta doc before claiming anything.
3. **Transfer.** Anything that survives ships as *sim-verified, needs human validation
   in the real game* — and only Pedro can run that validation.

## Work

1. ~~Extract the route graph and enumerate camera covers~~ — done in
   `tools/strategysearch.mjs`; five minimal grounded covers, with Six-Seven's CAM
   06/07 the unique
   two-camera cover. Hybrid tanking was unnecessary once a full two-camera cover
   survived, and remains a possible later search branch.
2. ~~Compile and evaluate candidates~~ — done; Six-Seven (CAM 67 / Deep 7) passed
   the clean, worst-luck and jitter sweeps recorded in `CAM-6-7-STRATEGY.md`.
3. ~~Audit the approximated mechanics~~ — done far enough to identify the decisive
   gate: Toy Bonnie's special CAM 06 → blind-spot timer is missing from the model.
   Re-evaluation against exact mechanics awaits the Android decompile/real-game test.
4. ~~Compare against documented prior art and write up the result~~ — done; no CAM
   06/07 match found, but novelty is explicitly not claimed.
5. Trainer mode: intentionally not started. It is gated on real-game validation.

## Done when

Either a written-up, sim-verified candidate exists with dependencies and caveats
documented and awaiting in-game validation — or the enumeration is recorded showing
the searched space and why nothing beat the known strategies. Both are real results.
