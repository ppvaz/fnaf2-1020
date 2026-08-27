# Constrained policy search on the exact engine

**Status: proposed 2026-08-27.** Nothing landed. This plan is the structured
vehicle for the standing goal in `PROGRESS.md` item 9 ("iterate on Minus 7 until
every night clears 70% under the human-gate"), after two sessions (items 8–11)
attacked it by hand and reverted clean.

## Why this is not a reopening of Plan 06

[`GATE-SEARCH.md`](../docs/strategy/GATE-SEARCH.md) closed the **observable,
fixed-or-clock-phased, reactive-threshold** policy family at 0/150: monitor
denial, Minus Right, Minus Two, CAM 06+07, all 125 three-phase clock schedules,
and the "tolerate the seventh route" Minus 6 variant. That closure is scoped but
real, and its cause is structural — every defended office encounter is ~5 s of
forced cams-down during which stuns lapse and leaked traffic destroys the cover
from behind. **This plan does not search that space again.** Plans 05 and 06
reopen "only after a source-rule change" and there has not been one.

What this plan searches is the layer those searches never touched: the **device
plan's timing geometry** (`recipe.mjs` `devicePlan()` → `hidpilottest.mjs`
`replay()` → `human-gate.mjs` at 1200 seeds), plus a small, bounded amount of
new *cross-cycle* policy state. `cyclesearch.mjs` hill-climbs 11 timing knobs but
against `bbtest`'s abstract cycle and a jitter-maximising fitness, **not** the
human gate. `gatesearch`/`strategysearch` operate on the abstract reactive cycle
too. No search tool in the repo optimises the emitted device plan against the
gate that actually rejects it.

## What items 8–11 already established (do not re-derive)

- **The emitted device schedule replays 400/400 = 100 % on every night 1–7 with
  zero jitter** (item 11). It is *correct*. The sub-70 ladder — n2 63 %, n5
  59 %, n6 51 %, n7 27 % at ±60 ms iid — is entirely `human-gate.mjs`'s jitter
  model applied to a geometrically wedged Foxy reset.
- **The wedge:** the attack cycle's post-mask reset is
  `hold(off + s(0.25), hallPulse, 'light')`. `s(0.25)` = 15 frames = exactly
  `MASK_ANIM_OFF`; `hallLightOn` needs `maskFullyOff`, so with an independent
  ±60 ms draw per row the hall lands inside the mask-off animation on ≈ half the
  draws and resets nothing. Delaying it is blocked: `off + s(0.45)` is
  hard-pinned by the 400-frame Withered stun budget (pushing 7 frames collapses
  nights 5–7).
- **Foxy + office entries are 100 % of all losses on every night; Foxy alone
  52–88 %.** The Puppet is 0 on nights 2–7. Wind budget and the audio controller
  are not where these nights are won.
- **Reverted, with reasons, this week:** eviction (Markiplier's pattern —
  mechanically opposed to uniform low-`D` suppression: sending Foxy dormant lets
  `D` climb unmanaged, then wakes him primed); cycle-widening (5 s read cadence
  is load-bearing — widening it triples BB walk-ins via `onCamsUp`/g417);
  CAM 11 dark-park in the sweep (pulls the light portion's end one slot earlier,
  runs `opening→attack` out of the 400-frame stun budget); naive bang-anchored
  `off` (the bang-wait's length is paid entirely in CAM 10/04/07 stun-coverage
  risk because nothing can be pressed while masked); a monitor-down GF flick in
  the opening (+4–8 points at 300–800 seeds, gate-neutral at 1200).
- **The one unexplored shape (item 10/11):** *decouple the CAM 10/04/07
  stun-refresh from the bang-wait / masked block*, so the wait's length stops
  being paid in stun-coverage risk. This needs cross-cycle state the policy does
  not carry today ("an eviction/bang happened N frames ago") and is real,
  unstarted scope.
- **Statistics discipline:** at p ≈ 0.55 the 2σ interval over 400 seeds is
  ± 10 points. Every apparent win this week evaporated at 1200 seeds. **No
  Minus 7 ladder change is accepted on under ~1200 seeds.**
- **`tools/strategysearch.mjs` throws on start** — its `buildCycle(TARGET_CAMS)`
  byte-identity assert went stale at the 2026-08-24 retiming.

## Design rules

- [`src/engine.js`](../src/engine.js) remains the sole mechanics authority.
  **No second simulator and no event-driven variant** — a frame-skipping engine
  risks silent divergence, and sweeps are already fast enough (`policytest` is
  ~1.4 s). If search proves too slow, profile first.
- The search rides [`tools/policy.mjs`](../tools/policy.mjs) (abstract layer) and
  `replay()` + `modelGate()` (device layer). It adds a harness, not a fork.
- Every reported number states the slack **shape** (`iid` / `correlated` /
  `common`) and says "in the simulator". A win under `iid` alone is not a win —
  `human-gate.mjs`'s own comment calls `iid` the wrong shape.
- Robustness is measured as **seed-CVaR** (survival over the worst decile of
  actual seed trajectories), never the `worst: true` per-roll adversary, which
  is explicitly "not a formal worst-case proof".
- Negative controls are mandatory on every search result (CLAUDE.md, "Numbers
  need their control"). At minimum: the unmodified `803feb3` ladder on the same
  seeds, and one deliberately-broken variant of any new mechanism.
- A closed search family stays closed. If a candidate appears to beat 0/150 in
  the Plan 06 space, that is a model regression to hunt, not a result.

## Objective

Lexicographic, but the first key dominates everything at the current margin:

1. **min over nights 2–7 of 1200-seed `modelGate` survival**, under the
   `correlated` shape as primary and `iid` as a reported secondary;
2. then per-night survival vector (Pareto-compared, not summed);
3. then seed-CVaR (worst decile);
4. then device-time cost (HID contacts / cycle, per `recipe.mjs` `sweepSpan`);
5. then stun-coverage margin (`assertStunCoverage` slack on every transition);
6. then input count and contact time.

Keys 4–6 only break ties among candidates that clear key 1 — they are not worth
trading survival for at a 51–56 % Night 6.

## Work packages

### 1. Prerequisites — `snapshot`/`restore`, and un-break `strategysearch`

- Add `Sim.snapshot()` / `Sim.restore(snap)` (plan 11 pkg 1 lists these as not
  done; this plan needs them for any tree search). Bit-identical continuation
  test: snapshot at frame N, run to end; restore, run to end; identical
  `won`/`frame`/`reason`/`detail` across 200 seeds.
- Bring `strategysearch.mjs`'s `buildCycle` forward to the retimed
  `DEFAULT_CYCLE` (or delete `buildCycle` and share `cyclesearch`'s `genCycle`).
  Re-arm its byte-identity assert.
- Give `human-gate.mjs` the three slack shapes `policy.mjs` already has
  (`jitterPlan` is `iid`-only today; item 11 had to hand-roll a correlated
  model to get n2 71 / n5 64 / n6 64 / n7 41).

**Gate:** snapshot/restore continuation test passes; `node tools/test.mjs
--engine` green; `strategysearch.mjs` runs.

### 2. The search state and the parameter space

- Write down the **compressed search state** — the sufficient statistic the
  harness branches on — explicitly listing what is in and what is dropped, with
  the reason, the way the user's proposal framed it. Dropped for cause: office
  pan X (no game rule reads it — `ANDROID-SOURCE-STATUS.md`), blackout render
  flicker, sound identity, object handles. `Sim` is already close to this; the
  point is a documented, tested boundary, not a new struct.
- Define the **parameter space**, which is small and named — not the observable
  policy grid (closed):
  - device-plan timing offsets in the attack and clear cycles (`off`,
    `hallPulse` length, sweep anchor, `phaseMargin`, the raise/clearance
    margins), each with a sourced floor it may not cross (`MASK_ANIM_OFF`,
    `MONITOR_ANIM_UP`, `RAISE_JITTER_MARGIN_MS`, the 400-frame Withered budget);
  - **one new cross-cycle state variable**: frames since the last observed
    departure bang / eviction, against `FOXY_RETURN_MIN`/`MAX` (500–999). This
    is the item-10/11 lever and the only structural addition this plan permits.
  - the opening's structure as a separate sub-space (package 5).

**Gate:** the state boundary has a test that fails if a dropped field is read;
the parameter space is enumerated with every floor cited to its group/constant.

### 3. Dominance-pruned beam search harness

- Beam search over the package-2 parameter space. Each node is a full parameter
  assignment; expansion perturbs one parameter within its floor.
- **Pareto dominance pruning:** a node is discarded if another retained node
  matches or beats it on every objective-vector component (per-night survival
  vector, CVaR, device-time, stun margin). Maintain the frontier, not a single
  incumbent — this is what `cyclesearch`'s hill-climb cannot do.
- Two evaluators behind one interface: the abstract `policy.mjs` sweep (fast,
  for beam expansion screening at ~300 seeds) and `modelGate` at 1200 seeds
  (for frontier admission only). A node reaches the frontier only on a 1200-seed
  evaluation under the `correlated` shape.
- Seed-conditioned throughout (`src/rng.js` stream fixed per seed); CVaR read
  off the per-seed outcomes the sweep already produces.

**Gate:** on the unmodified ladder the harness reproduces the `803feb3` numbers
(n1 100, n2 66.3, n3 79.3, n4 73.8, n5 62.0, n6 54.0, n7 26.0) within binomial
noise, and its frontier for a zero-perturbation search is the single unmodified
point.

### 4. The Foxy-reset decoupling search — the target

- Search the one unexplored shape: the hall Foxy reset fired independent of the
  masked block, funded by the new cross-cycle "bang was N frames ago" state
  rather than a blind worst-case wait. Candidate mechanisms to enumerate:
  the previous cycle's trailing sweep moved later ahead of an anticipated attack
  branch (the `assertStunCoverage` budget accounting, but audio-informed); a
  minimal camera presence kept separate from the masked block; a hall pulse
  fired *during* the read while the vent light is held (item 11 found this is
  mechanically valid but blocked by Golden Freddy — enumerate the GF-suppression
  cost as part of the search, do not assume it away).
- **Regression fixtures for the four reverted approaches** (eviction,
  cycle-widening, CAM 11 dark-park, naive bang-anchor): each re-runnable, each
  asserting the failure mode items 8–11 recorded, so the search cannot
  rediscover them as apparent wins without the fixture flagging it.

**Gate:** either a frontier candidate that beats the `803feb3` ladder on nights
2, 5, 6, 7 at **1200 seeds under both `iid` and `correlated`**, with its
negative controls and its provenance-dependency list (package 6) — or a recorded
negative result showing the decoupling cannot be funded, precise enough that the
next session does not re-attempt it blind. A recorded negative result closes
this package (Plans 05/06 precedent).

### 5. The Night-7 opener search

- Night 7's median death is 54 s — half the runs die in the first in-game hour,
  to Foxy at his capped 17 from midnight with no `foxyDormant` (g872–874 give
  him no dormancy on Night 7). This is a different problem from the steady
  cycle: the opening has **no Golden Freddy clear at all**, and `#idle-until 0`
  means it is not an idle-window artefact.
- Search the opening's structure: first Foxy reset placement before `D` climbs,
  GF-spawn suppression (g336: monitor fully up on a 5 s check), and the
  handoff into the first steady attack cycle.

**Gate:** a candidate that beats 26 % at 1200 seeds under `correlated`, or a
recorded negative result showing the opening budget (Foxy at 17, no dormancy, no
GF clear) rejects every shape — which would make Night 7 a device-time problem
(item 8's "new device time"), not a scheduling one, and that is itself a
publishable conclusion.

### 6. Machine-readable provenance and dependency reporting

- Promote the `[SOURCED]` / `[CALIBRATED]` / `[INFERRED]` / `[MODEL]` tags from
  `src/config.js` / `src/engine.js` comments to a queryable registry
  (constant → {label, group citation, one-line basis}). `sourcetest.mjs`
  cross-checks the registry against its own case list so a tagged-but-unasserted
  rule fails the suite.
- Add a **dependency report** to the search harness: for a winning candidate,
  perturb each non-`SOURCED` rule one at a time (the `sourcetest` mutation
  technique, reused) and report which perturbations move the candidate's
  survival by more than binomial noise. Output the way the user's proposal
  sketched it — the winning policy ships with an explicit "depends on:
  [CALIBRATED: …] [ASSUMED: …]" list.
- **No candidate is promoted past this plan whose ladder gain depends on an
  `ASSUMED` or `MODEL` rule** without that dependency being called out in the
  promotion record and, where it matters, added to
  `ANDROID-SOURCE-STATUS.md`'s open items as a thing to source on the device.

**Gate:** the registry covers every constant `sourcetest` cites; the dependency
report runs on package 4's and 5's candidates; a deliberately `MODEL`-dependent
test candidate is correctly flagged.

## Metrics

- 1200-seed `modelGate` survival per night, under all three slack shapes;
- seed-CVaR (worst decile) per night;
- Pareto-frontier size and its members' objective vectors;
- device-time cost (HID contacts/cycle) and `assertStunCoverage` margin per
  transition;
- for each promoted candidate: its provenance-dependency list;
- search cost (nodes expanded, 1200-seed evaluations spent).

## Non-goals

- Reopening the Plan 06 observable / clock-phased policy grid.
- Model-free RL or any learned policy. Deterministic search is the tool.
- An event-driven or otherwise reimplemented engine.
- Matching any published author's win rate.
- Calling a simulator survival number a device clear (Plan 12 owns that ladder).
- The double-camera glitch — the engine does not model it
  (`ANDROID-SOURCE-STATUS.md`), so the search cannot exploit it; Plan 02
  package 2a owns that.

## Done when

- The Foxy-reset decoupling (package 4) has either a 1200-seed frontier
  candidate that clears the sub-70 nights under `correlated`, or a recorded
  negative result with the mechanism named;
- the Night-7 opener (package 5) likewise;
- every promoted candidate carries its provenance-dependency list, and no
  promotion rests on an unflagged `ASSUMED`/`MODEL` rule;
- `PROGRESS.md` item 9's standing goal is either met in the simulator or shown
  to require new device time, with the search recorded well enough that a later
  session does not repeat it.
