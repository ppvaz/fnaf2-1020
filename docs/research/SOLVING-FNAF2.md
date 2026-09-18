# What it would mean to completely solve FNaF 2

This page states the end state this project is aimed at, in the strongest form worth stating, and
marks where the work actually stands against each rung. It is a research charter, not a plan: the
plan is [`plans/PROGRESS.md`](../../plans/PROGRESS.md) and the promotion ladder is Plan 12. Nothing
here promotes a claim, and nothing here is evidence. Where a rung has been reached, the evidence
record that reached it is named.

The framing below came from Pedro on 2026-09-17, in the middle of the seed-locking work. It is
kept close to his words because the shape of the argument is the point.

## The game as a control problem

FNaF 2 is a partially observable stochastic real-time control problem. The player does not observe
every animatronic's internal state, AI roll, movement timer, or pending transition. So the
strongest practical definition of solved is:

> Given everything the player can observe, and the entire history of observations and actions,
> determine the action policy that maximises the probability of surviving until 6 AM.

That definition has levels.

**Mechanically solved.** Every relevant mechanic is known precisely: movement opportunities and
intervals, RNG distributions, camera-stalling behaviour, blackout mechanics, mask windows, Foxy's
flashlight requirements, Puppet and music-box decay, interaction rules, frame and tick timing, and
every edge case. At this point there are no mysterious deaths.

**State-estimation solved.** From observations you can maintain the best possible belief about the
hidden state: `P(S_t | O_0..t, A_0..t-1)`, where `S_t` is the true internal state. The runtime's
belief-gated controller is a coarse move in this direction.

**Control solved.** Given that belief, you know the optimal action:
`π*(b_t) = argmax_a P(survive to 6 AM | b_t, a)`. This answers questions of the form: is another
80 ms of winding worth more than another Foxy flash; is CAM 08 or CAM 09 better in this
configuration; exactly when does a Minus-7-style sweep stop paying for itself.

**Globally optimised.** Not merely a very good strategy, but a search of the whole meaningful
strategy space, establishing that no alternative policy survives more often under the stated
constraints.

That last distinction matters. A bot winning 10,000 of 10,000 attempts is spectacular evidence and
still not a proof of optimality. Conversely the true optimum may be 99.97% rather than 100%,
because some RNG states admit no survival. Complete solving does not require eliminating RNG. It
requires proving what the maximum achievable survival probability is.

Borrowing the vocabulary of solved games: **empirically solved** when the remaining failures can be
attributed to identified RNG rather than strategic mistakes; **computationally solved** when an
exact enough simulator can compute the optimal policy; **formally solved** when the model can be
shown complete and the policy optimal.

## Constraint-relative solving

There is not one solution but a family, one per constraint set: unrestricted perfect-machine play;
Android touchscreen play with real input latency; human reaction-time limits; human-friendly
policies with a bounded action rate; camera-only strategies; named families such as Minus 7;
policies that minimise cognitive workload rather than maximise survival.

The objective then stops being `max P(win)` and becomes something like

```
max [ P(win) − λ1 (input rate) − λ2 (timing precision) − λ3 (cognitive load) ]
```

which is a more interesting problem than an inhumanly perfect bot. This project already lives on
that surface: the device lane carries a measured input latency, a contact floor, and an anchor
band, and every binding is a point in that trade-off.

## With a perfect model and 65,536 enumerable seeds

If the model is exact and a run is determined by one of 65,536 seeds, the game becomes a finite
deterministic planning problem conditional on the seed. For each seed `s` compute
`π*_s = argmax_π Outcome(s, π)`, and — more importantly — whether the seed is survivable at all.

Classify all 65,536: **winnable** (some legal play survives), **unwinnable** (none does),
**conditionally winnable** (survival needs particular timing or input assumptions),
**multiple-optimum** (several distinct strategies tie). Then the exact ceiling is
`P_max = #winnable / 65536`, and no controller, human or clairvoyant, can exceed it.

Three different solutions hide inside that.

1. **Clairvoyant.** The seed is known before the run, so the plan can be seed-specific and almost
   entirely open loop. This is the theoretical upper bound.
2. **Observable-game.** The seed exists but is unknown, so the policy is a function of the
   observation history, and the run itself becomes a seed-identification process:
   65,536 → 12,000 → 1,800 → 74 → 3 → 1. This is the one that corresponds to legitimate
   closed-loop play, and it raises its own question: which observations should be provoked
   deliberately, to identify the seed fastest? Optimal play becomes partly an information-gathering
   problem.
3. **Human-constrained.** Compute the machine optimum per seed, then impose reaction time, tap
   rate and timing precision, and measure exactly how many seeds each constraint costs. The result
   is a table of controllers against winnable seeds, which is a quantification of the whole
   strategy landscape rather than a league table of win rates.

Beyond one optimal trajectory per seed, compute the set of states from which survival is still
possible, `W(s, t)`. Every action then classifies as safe, suboptimal but recoverable, eventually
fatal, or immediately fatal — a complete viability kernel. A controller built on it can say things
like: you have 420 ms of slack here; winding past 610 ms makes 17 seeds unwinnable; skipping this
flash cuts the viable seed set from 31,204 to 28,991.

## The wilder programme

The rungs above still treat FNaF 2 as a game. The following treat it as a finite artificial
universe whose causal structure is fully accessible.

- **Every reachable state, not merely every run.** A retrograde table giving `V(x)`, the maximum
  survival probability from state `x`, over the whole reachable graph.
- **Every uncertainty state.** The real object is the player's knowledge, so solve the belief-state
  game over subsets `B_t ⊆ S`. That solves the game *as experienced*.
- **The minimal sufficient state.** Find the smallest representation preserving optimal decisions,
  and prove the rest strategically irrelevant. The whole relevant universe may collapse to
  something like (box debt, Foxy pressure, office hazard, camera lock, phase).
- **The game's strategic laws.** Let the analysis discover invariants rather than hand-writing
  them: some `R = aM + bF + cB + dC` whose sub-critical region is survival. That is a conserved
  quantity, or a Lyapunov function, for FNaF 2, and the strategy becomes "stay inside it".
- **A tablebase.** Not the move but the outcome, with the geometry attached: distance to forced
  death, to an unavoidable mask, to music-box collapse; minimum flashes; maximum recoverable
  timing mistake; minimum cognitive complexity.
- **The survivability manifold.** Plot the strategic resources as dimensions, take the viability
  kernel `V`, and measure `d(x, ∂V)`, the survival margin. A strategy is then characterised by how
  deep inside the safe region it keeps the player, which is probably why some strategies feel safer
  at equal win rate.
- **Robustness itself.** For bounded input error `|ε| ≤ δ`, compute the largest `δ*(x)` that still
  guarantees survival — a robustness field over the whole game — and then
  `max_π min_t δ*(x_t)`, the strategy that maximises the worst-case timing margin. That may be a
  completely different strategy from the machine optimum, and it is the mathematically optimal
  *human* strategy.
- **An exact difficulty function.** Model reaction time, motor jitter, attention switching, memory,
  actions per minute and visual processing, then compute `P(win | H)` for hypothetical players.
  The game becomes a psychometric instrument: is 30 ms less jitter worth more than 50 ms less
  decision latency?
- **Automatic discovery of strategy families.** Cluster all optimal trajectories: 65,536 plans →
  motifs → macro-strategies → a few fundamental regimes. Minus 7 and Minus 3 may turn out to be
  human-discovered projections of deeper families, and there may be families no human would invent.
- **A strategy lattice.** `A` dominates `B` when `W_B ⊆ W_A`. "Is Minus 7 better than Minus 3"
  becomes exact, decided by which seed sets each covers rather than by observed rates.
- **Strategy compression.** Minimise description length subject to a survival floor, and map the
  frontier: 20 GB at 100%, 400 KB at 99.999%, 3 KB at 99.97%, 280 bytes at 99.2%, six human rules
  at 97.8%. Minus 7 is one point on that frontier. The limit of this is the irreducible strategic
  complexity of the game: how many bits are fundamentally necessary to play it optimally.
- **A theorem prover.** Every action carries a certificate: flash here, because otherwise these
  states enter a region where music-box recovery and blackout safety become incompatible 1.34 s
  later. Every impossible seed carries a machine-checkable proof of incompatible deadlines, so
  "10/20 has an unavoidable RNG death rate of X" becomes a theorem rather than folklore.
- **Forced moves and puzzles.** Classify decision points by branching factor and extract the game's
  tactics: you have 380 ms, what is the only winning action?
- **Critical events.** With `N(x)` the number of winning continuations, `log N(x_t) − log N(x_t+1)`
  measures an event's damage in information terms. "Toy Bonnie accounts for 41% of strategic
  entropy loss in 10/20" is then a measurement.
- **Counterfactual surgery.** Vary the constants and compute `P_max(θ)` — the complete difficulty
  phase diagram, including sharp thresholds where survivability collapses. Then optimise the game
  itself: the hardest version that remains beatable, and the exact point where `P_max = 0`. The
  solver becomes a game-design compiler.
- **Information acquisition and seed reconstruction.** Actions have survival value and information
  value; optimal play may deliberately provoke observations. Ask for the minimum observation
  sequence that identifies the seed, watch `H(S | O_0..t)` fall to zero, and the controller becomes
  effectively clairvoyant partway through the night: infer, then execute.
- **An adversarial FNaF 2.** Replace RNG with an opponent choosing the worst legal outcome, and
  solve `max_π min_RNG`. A policy that wins there cannot lose to any legal RNG sequence; if none
  exists, find the least adversarial power that forces death. That separates bad luck from
  unavoidable failure exactly.
- **Glitch classification.** Treat glitches as transitions in the same machine and decide,
  mathematically, which are useful, which merely save inputs, which enlarge the viability region,
  which enable otherwise impossible seeds, and which are dominated.
- **Program synthesis.** Give a synthesiser the primitives (flash, wind, mask, camera, wait,
  branch, repeat) and ask for the smallest program meeting a target win rate. Then study what it
  invented.
- **A state quotient.** Collapse strategically equivalent states by bisimulation. Billions of
  concrete states may become thousands of distinct classes, and that quotient graph is the true
  game hiding under the implementation.
- **One master strategy.** Perhaps Minus 2, Minus 3, Minus Toys and Minus 7 are parameterisations
  of a single controller `π_α`, where `α` allocates risk between the Puppet, Foxy and the office.
  Then a decade of community strategy collapses into one equation, and the last question is how
  much of the exact solution compresses into something a human can memorise and execute: seven
  rules, two timers, one invariant.

## Where this project actually is

Marked honestly, rung by rung, as of 2026-09-18. On 09-17 the model gap this page first called the
sharpest open defect turned out to be an instrument error rather than a rule
([`night6-model-gap-two-clocks`](../evidence/night6-model-gap-two-clocks-20260917.json)); on 09-18
the frame clock it left open was measured on the phone, and the seed became writable
([`night6-model-traced-clock`](../evidence/night6-model-traced-clock-20260918.json),
[`night6-twin-nights-proven`](../evidence/night6-twin-nights-proven-20260918.json)).

| Rung | Where we are |
|---|---|
| Mechanically solved | Partly. The event dump is the ground truth and a large part of the Office sheet is sourced group by group — the 5 s rolls, Foxy's A/B chain, the hall-movement latch, the hour table, the blackout clock and its flicker draws, the random image, the monitor raise gate. Every group that could produce the disputed death was read out of the dump line by line and found faithful. The **frame period is now measured rather than assumed** for binding h: on two frame-traced nights the model, driven by the phone's own frame intervals, predicts survival at each night's seed and phase, one of them a 6 AM; the survival band runs from 175 ms early to 50 ms late and the game's phase sits about 30 ms inside its late edge. That is outcomes, not encounters: at a traced Night 6 6 AM's own seed and phase the model matches 2 of the phone's 11 occupied mask windows, no seed offset does better than chance, and its nights run about half again as busy, the excess being Withered Chica and Withered Freddy ([encounter fidelity](../evidence/model-encounter-fidelity-20260918.json)). On Night 7 it kills nights the phone wins. |
| No mysterious deaths | Closer than this page first said. The deaths that looked mysterious — every clock-named seed for the 2026-09-16 Night 6 dying to Foxy at 260-285 s on a night the phone won — were a **two-wall-clock reconstruction error**, not a rule: host and phone stamps stood 1374.8 ms apart, placing the schedule 1.37 s late against the game's own clock, near the worst phase available. On one clock the same route reaches 6 AM on all 65,536 seeds. That record does **not** claim the model now predicts the phone; it claims the wipeout was an instrument error and the remaining uncertainty is named. One more is explained end to end: the 2026-09-17 twin's schedule landed 86 ms late, Balloon Boy got into the office and disabled the flashlight, and Foxy killed — the model's prediction at that phase. |
| State estimation | The hidden state's *root* is readable and now **writable**. The office seed is bracketed to one or two milliseconds from the game's own log, and a device-side clock pin forces it into a seven-value window on every attempt, hitting one chosen value about one time in five — the floor is the phone's ~6.5 ms per clock set, a `settimeofday()` plus a hardware RTC write. Proven twins exist at 24850. They did not replay the same night: frame timing and input phase enter the random sequence, so state estimation must track the frame clock as well as the seed. Belief over the rest of the state is still coarse. |
| Control | Hand-built open-loop bindings with a belief-gated supervisor, not a policy. The best, k3, reached 6 AM on 8 of 10 predeclared Night 7 10/20 runs, and both losses were Foxy at mask-off ([k3 cohort](../evidence/night7-cohort-k3-result-20260918.json)). |
| Globally optimised | Not attempted. Exhaustive 65,536-seed censuses are routine, but over fixed schedules, not over policies. |
| Constraint-relative | This is where the project lives: measured input latency, a contact floor, anchor bands, and a device lane that refuses claims the transport cannot support. |
| Viability kernel, robustness field, tablebase | Not started. The robustness field is the nearest: the harness already measures per-cycle timing slack. |

The practical consequence is unchanged even though its cause moved: the ladder's first two rungs
are the bottleneck, and they are where the current work sits. A model that cannot reproduce one
observed winning night at its own named seed cannot be used to compute a policy, let alone prove
one optimal. Everything above mechanical fidelity waits on mechanical fidelity. The frame-traced
re-run it asked for is done; the next physical test is a same-phase twin — the pinned 24850 night
replayed at today's anchor phase, both traced, read with an instrument that sees both eyeholes —
which is the first check of fidelity at the level of individual encounters rather than outcomes.

Related: [the model gap resolved as two wall clocks](../evidence/night6-model-gap-two-clocks-20260917.json),
[all ten Custom Night presets at 3000 seeds](../evidence/night7-preset-sweep-20260917.json),
[seed-lock census and the first-frame timing rule](../evidence/night6-h-seedlock-census-20260916.json),
[twin nights predeclaration](../evidence/night6-twin-nights-predeclaration-20260916.json),
[the charter](../../PROJECT-CHARTER.md), [evidence policy](../evidence/README.md).
