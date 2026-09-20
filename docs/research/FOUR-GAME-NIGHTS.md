# The four games' nights, modelled from the dumps

*2026-09-20. Every number here was read out of this project's own event-sheet
dumps with `tools/dump/nightmap.py`, which parsed all four sheets — 4,450
groups — with **zero unclassified lines**. Nothing was taken from a wiki.
Census results are **model** results: they say what a simulator built from
these rules does, and are not device measurements.*

## What was built

| Layer | Where | Covers |
|---|---|---|
| Reader | `tools/dump/nightmap.py` | all four sheets: clock, difficulty table, rolls, movement graphs, draw census |
| Night models | `packages/core/src/mechanics/games/` | all four: clock, per-night table, roll schedule |
| Simulator | `packages/core/src/mechanics/games/sim-fnaf1.js` | **FNaF 1 only** |
| Policies | `packages/core/src/mechanics/games/policy-fnaf1.js` | **FNaF 1 only** |
| Census | `tools/census.mjs` | **FNaF 1 only** |

FNaF 2's night already has a simulator (`plant-model.js`) and a route; its
entry here contributes the clock groups its constants lacked. **FNaF 3 and
FNaF 4 have night models and extracted movement graphs but no simulator yet**,
so they have no census. See *What is not done* below.

## The four clocks, and they are not one mechanism

| Game | Hour | Night | Mechanism | Win | Source |
|---|---|---|---|---|---|
| FNaF 1 | 90 s then 89 s | **535 s** | accumulator: `minute counter` to 90 | hour 6 | g397–g400, g435 |
| FNaF 2 | 70 s | **420 s** | accumulator: `AM` alterable to 70 | hour 6 | g627–g631, g672 |
| FNaF 3 | **40 s** N1, 60 s N2+ | **240 / 360 s** | wall clock, gated on night | `time of night` 6 | g642–g648 |
| FNaF 4 | 60 s | **360 s** | wall clock | hour 6 | g568–g573 |

Three things that only show up by asking all four the same question:

- **FNaF 1's first hour is a second longer than the rest.** g399 resets the
  minute counter to **1**, not 0, so hour 0 runs 0→90 and every later hour
  1→90. The night is 90 + 5×89 = **535 s**, which is the 8:55 the community
  publishes — derived here rather than copied. FNaF 2 zeroes its accumulator
  instead (g630), so it has no such seam.
- **FNaF 3 is the only game whose hour length depends on the night**, and the
  240 s Night 1 that follows is corroborated by the handset run of 2026-09-20
  that held the office ~240 s and banked the night.
- **Every game halves its hour under a fast-nights flag**, under four
  different names. FNaF 1's power drain (g315) is *not* on that flag, so fast
  nights spend half as much power per in-game hour — an asymmetry in the
  source, not a modelling choice.

`UNKNOWN(frame-handle-map)`: the value a `JumpToFrame` carries is a frame
**handle**, not the dumped frame index. FNaF 3's own timer names settle it —
`JumpToGFreddy` → 21 against index 22, `JumpToMangle` → 17 against index 20 —
so no constant offset reconciles them. A night's end is therefore identified
by the hour it fires at, never by where it lands.

## The four difficulty tables

- **FNaF 1** (g437–g443): one counter per character, set at night start, plus
  hourly `+1` bumps at 2, 3 and 4 AM (g470–g472) that carry **no night
  comparison** and therefore fire on every night including Custom Night.
  Night 4's Freddy is `1 + Random(2)` — the table's only draw.
- **FNaF 2** (g673–g684, g787, g804, g815–g821): the per-hour table already in
  `config.js`. This work did not restate it; `games/fnaf2.js` re-exports it and
  a test round-trips the two.
- **FNaF 3** (g649–g654): **one counter**, `AI`, driving Springtrap *and* every
  phantom. Night 1 → 0, Nights 2–5 → the night number, Night 6+ → 7. Two
  further per-night knobs that no public account of the game states:
  - **Which phantoms are armed** (g694–g696): Night 2+ BB and Mangle, Night 3+
    adds Golden Freddy and Chica, Night 4+ adds the Puppet.
  - **`time limit`** (g777–g782), the phantom *exposure fuse* — how long a
    phantom may be looked at before it fires, tested by g702, g709, g719, g720
    and g746. It falls **100 → 50** across the six nights, so the same glance
    is twice as dangerous on Night 6 as on Night 1.
- **FNaF 4** (g228, g581–g588, g598–g600): Nights 1–4 *escalate* mid-night by
  `add`ing at 3 AM; **Night 6 switches antagonist** at 4 AM with a `set` to 0
  for all four and Fredbear to 15; **Night 5 names only Fredbear**, so the
  other four cannot act on it at all.

**FNaF 2 is the only game in the series that clamps its AI counters**
(g829, g830, g856–g863). The same detector was run against FNaF 2 first and
read the positive, so its silence on FNaF 1, 3 and 4 is evidence rather than a
blind query.

## Draw accounting, and a column that means two things

`nightmap.py --draws` reproduces Plan 26's total-draw column exactly. Its
"timer-driven" column reproduces only under the looser of two readings:

| Game | total draws | in a timer-gated group | **timer-forced** |
|---|---|---|---|
| FNaF 3 | 115 | 21 | **5** |
| FNaF 4 | 107 | 34 | **8** |
| FNaF 1 | 49 | 30 | **15** |
| FNaF 2 | 123 | 53 | **17** |

The middle column is Plan 26's. The right-hand column is the one a seed model
owes: draws with **nothing that can fail in front of them**, consumed on every
tick whatever happens. The distinction matters because a `Random` inside a
*condition* is evaluated while the conditions are being tested, and Clickteam
stops at the first that fails — so position in the condition list decides
whether a draw is forced.

FNaF 3 is lightest under both readings, so Plan 26's conclusion stands. But
**FNaF 1 and FNaF 4 swap places**: FNaF 1 has the *most* forced draws of the
three expansion targets, not the fewest. Its own three background draws
(g58/g59/g192 in FNaF 2's case) are joined by a full grid of eleven movement
rolls.

The reader agrees with this repository's own independent account of FNaF 2's
unconditional draws (`packages/core/test/unconditional-draws.test.js`, which
names g58, g59, g192 and g822): it finds exactly those three timer-driven
sites, and correctly does not call g822 timer-forced because it is a
`StartOfFrame`, not a timer.

## FNaF 1: a seed census

The simulator runs at 60 Hz in ascending group order — which is the order the
runtime evaluates in, and therefore the order the RNG is consumed in. Both
policies are **observation-limited**: they may read a door light, a camera and
the HUD's hour and power, and never a position the player is not looking at.

### Results, 3000 seeds per night

| Night | `community-loop` | `roll-grid` |
|---|---|---|
| 1 | 2999/3000 | **3000/3000** |
| 2 | 2998/3000 | **3000/3000** |
| 3 | 3000/3000 | **3000/3000** |
| 4 | 2989/3000 | **3000/3000** |
| 5 | 2965/3000 | **3000/3000** |
| 6 | 2987/3000 | **3000/3000** |
| **7 (4/20)** | 2995/3000 | **3000/3000** |

`community-loop` is the published 4/20 line — left light, camera, right light,
camera — with a power governor. `roll-grid` is not a community strategy and is
not offered as one; see below.

### Controls, which are the part worth trusting

- `sealed` (both doors shut all night) loses **every** seed, and always to
  power — never to a character.
- `do-nothing` loses, and loses mostly to **Foxy**: with no camera ever raised
  his hold never loads, so he advances on every roll.
- Parking the camera anywhere but CAM 4B loses **1000/1000** at 4/20, to
  Freddy.

### Three things the census found that the strategies do not say

**1. CAM 4B is a unique safe park, and CAM 4A is not.** g556 (Freddy's entry)
and g557 (his retreat) do **not** carry the same view exclusions. Both need
the monitor up and `viewing <> 42`, so watching CAM 4B shuts him out
completely. Only the *retreat* additionally excludes `viewing <> 4`: watching
CAM 4A does not stop him getting in, it stops him being turned back. Reading
the two as one rule made CAM 4A look like a second safe park — it kills
1000/1000 at 4/20. This was caught only because the control was run.

**2. 4/20 is cheaper than Night 5.** Under the published loop, Night 7 at all
dials 20 clears more often than Night 5 does. At maximum AI a blocked
character leaves on its **next** roll, because every roll succeeds; at mid AI
it camps the door through failed rolls and the door stays shut. The published
accounts describe camping as an annoyance. It is the binding cost.

**3. Foxy is held by camera *flicks*, not camera *dwell*.** g460 re-sets his
hold to a fresh `50 + Random(1000)` every 100 ms while any camera is up. It is
a set, not a maximum, so dwelling re-rolls protection rather than accumulating
it. A flick buys nearly the same expected hold at a fraction of the power.

### Why `roll-grid` exists, and what it is

The published loop cannot afford Night 5. Base drain plus the per-night drain
(g477–g480) already spends **713 of the 999-unit reserve**, and holding a door
through a camp costs more than the 286 that remain.

`roll-grid` uses what the source makes available and the published accounts do
not: **a movement roll is on a fixed global timer**, not on anything the player
does. `Every 4970 ms` and `Every 4980 ms` load on first reach and fire at
multiples of their period from frame 0, so the instants a door has to be shut
are known in advance for the whole night. Shutting each door for 20 frames
around its own roll instants costs 20/298 of what holding it costs.

That is a machine strategy, not a human one — it needs frame-accurate timing
from night start — and it is exactly the shape this project already wins with
on FNaF 2. It is reported separately from the community line rather than
blended into it.

## The censuses

Every figure is a **model** result at the project's 3000-seed floor. Controls
are reported beside each, because a sweep with no failing control cannot tell
a working route from a dead code path.

### FNaF 3 — 3000/3000 on all six nights, community line

| Night | `community-line` | night length |
|---|---|---|
| 1 | **3000/3000** | 240 s |
| 2–6 | **3000/3000** each | 360 s |

The night lengths are the clock groups' own (6 x 40 s and 6 x 60 s) and the
240 s matches what the handset measured on 2026-09-20.

The policy is the published line — let him roam, seal the vent adjacent to
where he was last seen, stay on the monitor, reboot ventilation when the meter
drops — and it is **belief-limited**: it learns his position only by looking at
the camera he is on, and sweeps to find him.

Controls: **office camping** loses every night after the first (the office
drains ventilation and raises aggression off one counter, g908/g909), and
**doing nothing** loses Night 2 onward but is only a coin flip on Night 1.

Two source facts do the work, and neither is in any public account:

- **The attack chain advances on the ventilation blackout**, not on a move
  (g486, g487, g256, g262). Springtrap's rule alone cannot end a night. A
  simulator built from his movement graph and nothing else reports a night
  that never ends — which is exactly what the `test-fnaf3-census.mjs` negative
  control demonstrates: disabling the blackout ramp makes the *failing*
  controls start passing.
- **The blackout needs twice the error dwell the hallucination does**
  (`2000 − AI×200` against `1000 − AI×100`), so clearing an error late still
  avoids the chain entirely.

### FNaF 1 — 3000/3000 on all six nights and 4/20, community loop

See the table below. What made it reachable was measuring where the 999 units
go rather than sweeping knobs: on Night 5, **713 of the reserve is spent before
the player touches anything** (base 535 plus the per-night drain 178), leaving
286 for every control.

Two source-derived levers closed the gap:

- **Foxy's hold is re-set to `50 + Random(1000)` every 100 ms of viewing**, so
  the worst draw is 50 frames. Flick the camera more often than that and he can
  never act; the loop uses 42.
- **A light flash costs 1/60 of a unit against a shut door's 1 per second**, so
  checking a shut door often is ~60x cheaper than holding it a moment too long.

### FNaF 2 — not re-censused, and deliberately

It already has a simulator, a route and device evidence, so a new one here
would add nothing. Run through the existing machinery, `minus7` clears nights
1–4 at 3000/3000 and Night 5 at 2998/3000, and scores **0/3000 on nights 6 and
7**. That is one mechanic: **Golden Freddy is ~96% of all night-6/7 losses
across every family**. He does not kill on his own — he kills when the player
flashes the hall or raises the monitor while he is in the office (g690, g701,
g727, g1292), and **a fully-on mask is his only dismissal** (g776). The
families in `policybaselines.mjs` keep to a fixed cycle and never check. The
routes that actually win those nights are artifact plans
(`campaign-night6-h2`, `campaign-night7-k3`), scored by other machinery.

## What is not done

**FNaF 4's simulator is incomplete and its census is not reported.** The night
model, roll schedule, Freddy's meter, the `follow` map and its walk durations
are all traced and stand on their own. The step function built on them does
not, and its own controls say so: `do-nothing` clears every night, because
every `gameover = 1` group in the frame is player-triggered and a player who
never leaves the middle of the room is never in a state that can kill. That is
wrong about the real game, so a mechanic forcing the player out of the hub is
missing — `force turn` (g589–g591, g595) is modelled at the bed only. Foxy's
closet chain is a guess rather than a trace.

`UNKNOWN(not-traced)`: what sets `Bonnie`/`Chica` AV7, the bedroom flag
g375/g376 test; and Foxy's real closet progression.

It is labelled `INCOMPLETE` in `sim-fnaf4.js` and in `census.mjs`'s reporter,
which prints the warning beside every FNaF 4 row. Reporting a rate from a model
whose controls pass when they should fail is the shape of mistake register #12,
so it is not reported.

### The walk durations, caught from the animation bank (2026-09-20)

`dump_animations.py` over the owned CCN, at build 296 and the app's own 60 fps,
under the Fusion model the tool documents: the counter advances by `speed` each
tick and the frame flips at 100, so a sequence lasts `frames × 100 / (speed × rate)`.
Each `follow` leg was joined to the animation its `AnimationFinished` condition
names.

| leg | animation time |
|---|---|
| hub → left door | 2.366 s |
| left door → hub | 1.533 s |
| hub → right door | 2.366 s |
| right door → hub | 1.566 s |
| hub → closet / back | 1.733 / 1.366 s |
| hub → bed / back | 0.633 / 0.667 s |
| close a door (L / R) | 0.733 / 0.600 s |
| seal the closet | 0.334 s |
| flash a light | 0.300 s |

**Left door → right door is 3.899 s against a 5000 ms roll grid — 78% of one
roll period spent walking.** A tour of both doors and back is 7.831 s, *longer
than a whole roll cycle*, so a rotation cannot cover both doors within one grid
period and a schedule has to choose which door a given roll protects. That is
the quantity the unmapped state machine was hiding.

The approach is longer than the return at every station, so a rotation is not
symmetric. `carpet run` (1.033 s) is the shared walk in all four directions.
The bed is the cheap station at 1.300 s round trip, which matters against a
meter that drains 20/s while it is viewed and fills at `Freddy AI / 4` per
second.

**This is an established method here, not a new one** — and it comes with its
own warning. `config.js:528-535` derived FNaF 2's mask and monitor flips from
the same bank, and a fresh dump reproduces all four to the millisecond
(`mmaskOn` 9fr@75 = 0.200 s, `mmaskOff` 11fr@75 = 0.244 s, `mmonitorUp`
11fr@90 = 0.204 s, `mmonitorDown` 11fr@50 = 0.367 s).

But **an animation length is not control readiness**. FNaF 2 is the worked
example: `mmonitorDown` runs 367 ms, while the native frame trace has the mask
button absent through 322 ms, faint at ~337 ms and fully visible only at
**382.5 ms** — about one frame later. `tools/device/artifact-commands.mjs`
uses the measured figure, because the derived one sat 66.5 ms above the real
visibility point and chasing it took the Minus Toys loop from 120/120 to
0/120. So every figure above is a **lower bound**, to be replaced per leg by a
device measurement before a FNaF 4 schedule is bound to it.

`UNKNOWN(not-measured)`: four legs on the two door approaches advance on a test
of `follow`'s X position (g30 `CompareX = 512`, g32 `> 530`) rather than on an
animation, and are not in the totals. Nothing in the event sheet moves `follow`
in X, which would make those tests constant — but the movement-block reader
used to check that found **no movement block on any of the 485 objects**, so it
cannot tell a real absence from its own blindness, and the question stays open.

Neither blocker needed device time; both were readable from the dumps already
in hand.

## Reproducing

```sh
tools/dump/nightmap.py --game fnaf3 --table --clock --rolls
tools/dump/nightmap.py --game fnaf1 --graph charBonnie
node tools/census.mjs --game fnaf1 --seeds 3000 --policy roll-grid
node tools/census.mjs --game fnaf1 --policy roll-grid --custom 20 --seeds 3000
```

Gated by `tools/dump/test-nightmap.py`, `tools/test-night-models.mjs` and
`tools/test-fnaf1-census.mjs`, all in `npm run test:unit`. The first two need
no game content.
