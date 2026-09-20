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

## What is not done

- **FNaF 2**: no new census. It has a simulator and a live route already; this
  work contributed only its clock groups.
- **FNaF 3**: night model, Springtrap's full 73-edge graph, the vent topology,
  the seal's `what vent is closed` test (g604–g613: a sealed vent returns him,
  an unsealed one advances him) — and, as of 2026-09-20, **the ventilation
  economy that was the blocker** (see below). **No simulator yet**, but nothing
  unmapped stands in front of one.
- **FNaF 4**: night model, rolls, the four movement graphs, Freddy's meter
  (fill g397/g398/g593, drain g401, floor g399, kill at **≥ 60** at the bed,
  g427/g428) — and **the `follow` state machine that was the blocker** (see
  below). **No simulator yet.**

### Both blockers are closed (2026-09-20)

**FNaF 3's attack chain does not advance on movement.** It advances on
`blackout` AV1 passing 250 (g486 stage 1→2, g487 2→3, g256 3→4, g262 4→kill),
so Springtrap's rule alone cannot kill. The full path:

```
drain → error (AV0 ≤ −10) → dwell (AV1 per frame)
      → hallucination  at AV1 > 1000 − AI×100   [g463]
      → blackout ramp  at AV1 > 2000 − AI×200   [g473]  +1/frame
      → attack chain   at blackout AV1 > 250
```

Two drains, and they are different mechanisms. **g908** takes 1 per second
while the office-inactivity counter is above 10, on every night but Night 1 —
the same counter g909 reads to raise `aggresive?`, so sitting still costs
ventilation *and* aggression from one source. **g448–g452** add a background
drain indexed by `AI` at 12/10/9/8/6 s for AI 2–6.

That second table is written with `=` comparisons and **stops at AI 6, while
g654 sets AI 7 on Night 6 and after** — so on Night 6 it matches nothing and
ventilation degrades only through g908 and through events. Recorded because a
model that extrapolated the 12/10/9/8/6 series to AI 7 would drain a night the
game does not. `UNKNOWN(not-decompiled)`: whether the missing row is deliberate.

A reboot of ventilation zeroes AV0 outright (g429), and `white flash` (g704) is
a scripted catastrophic failure that sets `blackout` AV1 straight to 255 —
already past the chain threshold, with no dwell required.

**FNaF 4's `follow` is a walk animation, not an abstract state.** Its 46 values
are driven by `AnimationFinished` and by the object's own X position (g30 tests
`CompareX = 512`). Four are places the player can act; the rest are frames of
getting there:

| state | place |
|---|---|
| 0 | the middle of the room — the hub, the only state with four exits |
| 10 | at the left door |
| 17 | at the right door |
| 29 | in the closet |
| 43 | at the bed — the state Freddy's kill is gated on (g427/g428) |

Those five account for 114 of the frame's `follow` comparisons. A station
action (close, flashlight) runs a sub-cycle that **returns to the same
station**, so it costs animation time but not position; moving between stations
runs a separate walk each way. **The two doors are never both reachable**, and
every rotation is a tour with travel time between stops — the same shape as
FNaF 1's "pan, then press", arriving from a different mechanism.

`UNKNOWN(in-animation-data)`: the **duration** of each walk. The transitions
fire on animation completion and X position, so the frame costs are in the
animation data and the object's movement speed, neither of which is in the
event sheet. `~/fnaf-apks/dump_animations.py` is the route, or one device
measurement per leg. That is a bounded measurement, not an unmapped mechanism.

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
