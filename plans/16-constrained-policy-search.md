# Constrained policy search on the exact engine

**Status: in progress 2026-08-27.** Packages 1–3 built. **Packages 4 and 5
closed by recorded negative.** Pkg 4: the constrained scheduling space is
exhausted — the timing knobs, the cycle length, the sweep geometry (a fragile
phase-lock spike), and the bang-anchored attack raise (needs a bang detector
faster than the phone has) all measured to a wall. Pkg 5: the Night-7 *opener*
is refuted — a perfect opening Foxy reset moves n7 by 0.0; n7 is a steady-state
clear-cycle problem (two existing Foxy resets missing under jitter, + office
entries = the geometry lever). Package 6 (provenance registry) **dropped** —
no promoted candidate for a dependency report to run on, `src/config.js` is
by now ~all `[SOURCED]`; build it against a device-produced candidate if one
ever appears. **Plan 16 is effectively complete.**
This plan is the structured vehicle for the standing goal in `PROGRESS.md`
item 9 ("iterate on Minus 7 until every night clears 70% under the human-gate"),
after two sessions (items 8–11) attacked it by hand and reverted clean. **The
goal is not met**, and every simulator lever is now exhausted — what is left is
device work: a real actuator holding the geometry basin, or new device time for
a cheaper `hallView` path (a second clear-cycle Foxy reset for n7). The audio
route is out (item 10 is closed on latency, 2026-08-27).

## Progress log

- **Pkg 1 (done).** `Sim.snapshot()`/`restore()` in `src/engine.js` —
  bit-identical continuation over 200 seeds (`tools/minus7/test-search.mjs`).
  `jitterPlan`/`modelGate` in `human-gate.mjs` gained a `shape` arg:
  `iid` (unchanged default), `common` (one shared per-cycle draw), `correlated`
  (shared draw + `±round(slackMs/3)` iid). `strategysearch.mjs` un-broken — its
  stale `buildCycle` is now `genCycle(KNOBS0, order)` shared from `cyclesearch`.
- **Pkg 2 (done).** Parameter space is `SEARCH_KNOBS` in `hidpilottest.mjs`
  (exported, default-inert — the 803feb3 plan is byte-identical with every knob
  0): `attackHallDeltaMs`, `attackSweepDeltaMs`, `attackRstDeltaMs`,
  `clearHall2DeltaMs`, `phaseMarginDeltaMs`, `hallPulseDeltaMs`, `openGfFlick`,
  `preReadHallMs`, `bangAgeFrames`.
  Each floor is in `tools/minus7/paramsearch.mjs` `FLOORS` with its citation.
  The search state view is `tools/minus7/sim.mjs` `view()` — sourced fields
  only; office pan, render flicker, sound identity, object handles dropped.
- **Pkg 3 (done).** `tools/minus7/paramsearch.mjs`: dominance-pruned beam over
  the parameter space, `recipe.build → devicePlan → modelGate`, Pareto frontier
  on the per-night survival + seed-CVaR vector, `--admit` re-scores the
  frontier at 1200 seeds. Reproduces the 803feb3 ladder on a zero perturbation
  (pinned in the test).
- **The correlated-shape baseline, the number that reframes the goal.** The
  unchanged 803feb3 plan, per-cycle `common`/`correlated` slack (the shape
  `human-gate.mjs`'s own header calls the right one): **n2 ~70, n5 ~63,
  n6 ~62, n7 ~33** — versus iid's n2 66, n5 62, n6 54, n7 26. The route is
  materially less fragile than iid says, but n5/n6/n7 still miss 70 with no
  change, so the search still has to find real gains.
- **Pkg 4 first pass.** Attack-cycle knobs alone (`attackSweepDeltaMs ≈ -17 ms`,
  earlier recovery sweep — the safe direction; `attackRstDeltaMs ≈ 7100`, an
  extra monitor-down hall reset straddling the recovery 5 s check) move n7
  32.7 → ~38 % under correlated at 350-seed screening. Not enough; n7's death
  is the attack cycle's masked-span 5 s check (mask on at read+0.6 s, check
  ~1.9 s into the hold, D at mask-on ≈ 2–3 → D = 4 at the check), same as n6.
- **Pkg 4 negative result, measured (2026-08-27).** The masked-span check can
  only be made safe by entering the five-tick BB hold at D = 0, which needs a
  hall reset that restarts the tick counter (g293) and therefore pushes `off`
  ≥ +1000 ms. That is geometrically impossible: the recovery sweep at
  `off + 0.45` is pinned ≤ b + 6.67 s by the 400-frame Withered stun, so `off`
  may not exceed b + 6.22 s and the hold must start by b + 1.2 s — exactly
  where the prophylactic mask already is. Confirmed by sweeping
  `phaseMarginDeltaMs` (pushes `off` later): **+50 ms → n5/n6/n7 46/45/26 %
  correlated; +100 ms → 14/14/8 %; +150 → ~1 %.** Deterministic (5 s hold +
  sweep-every-6.67 s + 10 s cycle), so it holds under iid and correlated
  alike. The decoupling cannot be funded inside the 10 s attack geometry —
  it needs a structurally shorter attack cycle (ATTACK_WINDOW_FRAMES + replay
  + emitter) or item 8's new device time.
- **openGfFlick (pkg 5) is a net loss under the honest shape.** It helps iid
  (n6 56→60, n7 28→36) but its monitor-raise-back near the frame-300 GF spawn
  is fragile to a coordinated shift: under `correlated` it collapses to
  n5/n6/n7 40/38/3 % (a Golden-Freddy massacre). The opening cannot be
  GF-cleared without a monitor-down beat, and every such beat has this
  raise-back fragility.
- **Pkg 4 enumerator (built; no result promoted).**
  `tools/constrainedsearch.mjs` exhaustively enumerates the finite permitted
  recovery-sweep/recovery-reset/in-read-reset geometry. Its screen is
  informational: `--mode=exhaustive` sends every mechanically legal candidate
  through the 1200-seed exact replay gate, with `803feb3` included as an
  immutable control. It uses the persistent worker pool as candidate × night
  seed batches; no parallel engine or approximate simulator was added.
- **The enumerator's best candidate is a gate-overfit — do not promote it.**
  `{attackSweepDeltaMs: -17, attackRstDeltaMs: 7400}` (recovery sweep one
  frame earlier + a monitor-down hall beat at b+7.4 s straddling the recovery
  check) reads as a uniform Pareto gain against `human-gate.mjs`: at 1200
  seeds correlated, n2/n3/n4/n5/n6/n7 **75/83/77/70/69/36** vs baseline
  **67/78/72/61/60/33**; under iid every night is also up. But the human gate
  runs `readLatencyMs = 550`, and **`tools/test.mjs`'s `hidpilot n6 target`
  runs `readLatencyMs = 480`** — a second sourced actuator model — and there
  the SAME change is **0-1/500** (Toy Freddy floods the office). The recovery
  sweep's *end* is the five-tick-mask stun bridge "with nothing to spare"
  (CLAUDE.md; HID-MULTITOUCH.md: one frame of tail = 272/400 nights), and
  moving it one frame either way breaks whichever `readLatencyMs` config the
  search did not score. **The pkg-3 objective must include every pinned
  actuator config (`hidpilot n6 target`, `n6 target worst`, `n6 target
  actuator`), or its winners game one latch model at another's expense.**
  With that constraint added, this candidate — and the whole
  recovery-sweep-timing lever — is out. Combined with the measured pkg-4
  negative result above (masked-span decoupling is geometrically impossible)
  and the openGfFlick collapse, the constrained parameter space contains no
  candidate that clears the sub-70 nights without regressing a pinned config.
- **The "shorter attack cycle" lever is closed — measured, `7176afc`.**
  `attackWindowMs` is now a threaded parameter (`hidpilottest.mjs`
  `attackWindow` → `recipe.build` → `replay` via the `#cycle attack N`
  header), default 10000 = every plan and pinned test byte-identical.
  `tools/minus7/cyclelengthsearch.mjs` sweeps it 6000–10000 ms against every
  pinned actuator config. **It collapses monotonically below 10 s:** gate
  n5/n6/n7 correlated goes 63/63/33 → 37/0/0 at 9000 → 0/0/0 at 7000, and
  `n6target` (readLatency 480) goes 100 → 0 by 8000 ms. 10000 exactly
  reproduces `803feb3` (the regression fixture). The cause is phase-lock: a
  10 s attack cycle is exactly **two 5 s movement-opportunity grid periods**
  (`MO_FRAMES` × 2), so it preserves the clear cycle's monitor-down 5 s-check
  phase — which is what keeps Golden Freddy from spawning (g336) and the Foxy
  checks safe. Any other length permanently shifts that phase after the first
  BB response. 5 s is too short for the 5-tick BB hold + reset + sweep; 15 s
  is longer. **10 s is not a tunable — it is load-bearing.**
- **So the conclusion is now airtight: Night 5/6/7 to 70% requires new
  device time**, not any scheduling change. "New device time" = a faster
  actuator (or a single input doing two jobs) that frees the ~600–900 ms an
  in-attack-cycle Foxy reset needs — the monitor-down animation, the hall
  contact, the poll gaps, the monitor-up — which the current ~680 ms/cycle
  of measured phone slack cannot provide without cutting the sweep, the wind
  or the 5-tick mask, all load-bearing. Every purely-simulator lever has now
  been enumerated and measured.
- **Not the plan's shape, kept as a probe:** `tools/minus7/{search,policy}.mjs`
  — a from-scratch semantic-action beam search + reactive policy over the
  engine (the user's architecture note). They run but a myopic heuristic /
  untuned reactive policy does not find Minus-7-quality play; a real MCTS with
  a tuned default policy is unstarted. The parameter search is the one
  producing results.
- **Item 13 priced, and it names which device number (2026-08-27,
  `tools/minus7/devicetimesearch.mjs`, `ef5eb46`/`b265653`).** `devicePlan`
  now takes an explicit `deviceSpacingMs`; the tool sweeps `readLatencyMs`,
  `sweepSlotMs` and `hallPulseMs` one at a time through
  `build → devicePlan → jitterPlan → replay`, correlated and iid, every story
  night. **Only `sweepSlotMs` moves the sub-70 nights** — and it is the sweep's
  inter-selection spacing (`→` emitted `deviceSpacingMs = slot + 13`):

  | slot | emit spacing | corr n2 | n5 | n6 | n7 |
  |---|---|---|---|---|---|
  | 120 | 133 (device-validated) | 69 | 62 | 61 | 34 |
  | 110 | 123 | 75 | 70 | 68 | 39 |
  | 100 | 113 | 78 | 73 | 72 | 43 |
  | 90 | 103 | 82 | 77 | 75 | 32 (phase break) |

  `n6target` / `n6target-worst` (readLatency 480) hold **500/500** at slot 100,
  so this is not a latch overfit like `{attackSweepDeltaMs:-17}`. But slot 100
  emits a **113 ms** spacing, under the device-validated **133 ms** floor
  (`HID-MULTITOUCH.md`: 100 ms contact + one full 33 ms Fusion poll released;
  the CAM 07 last-flash finding is a fight over exactly this boundary). The
  other numbers are inert: `readLatencyMs` 550→400 moves every night < 1 pt
  (250/100 throw — `leftClear`'s fixed hall/tap offsets don't adapt to a
  shorter latch), `hallPulseMs` 130→83 costs n7 ~15 pt, and the recovery
  Foxy-reset beat (`attackRstDeltaMs = 7400`) is +0.5–1 pt everywhere.

  **So "new device time" has a specific shape: a sweep actuator that reliably
  delivers sub-120 ms inter-selection spacing.** That clears nights 2–6 to
  70%+. It is the same knob the last-flash / dropped-selection investigation
  (`ON-DEVICE-VALIDATION.md`) is contesting — closing that in the phone's
  favour is what unblocks nights 2–6. **n7 is not spacing-bound**: it tops out
  near 43 and phase-breaks below slot 90, so it still needs the jitter-shape
  fix (item 12) and the bang-anchored Foxy reset (item 10), per
  `PROGRESS.md` "What moves Night 7".

- **The sweep-geometry axis, searched properly (2026-08-27, `740f5b0`,
  `tools/minus7/geometrysearch.mjs`).** Item 13 could only *widen* the emitted
  spacing; the `minus7-perfect-experiment` LIGHT_AFTER breakthrough (33 ms
  contacts register, `1ac9e13`) lets `devicePlan` emit the sweep NARROW, which
  re-phases the whole 5 s cycle. `build({sweepSlotMs})` sets the model layout,
  `devicePlan(r, {deviceSpacingMs, sweepContactMs})` the device emission;
  `paramsearch.mjs` now takes a fixed `geom` context (not a beam knob — the
  landscape is phase-locked, 2 ms of `dev` flips n6 ~30 points), and
  `geometrysearch.mjs` maps it on a dense grid then admits at 1200 seeds.

  | geom slot/dev/con | corr n2 | n3 | n4 | n5 | n6 | n7 | iid min(n2-6) | 480 rebuild | ±ms nbhd worst |
  |---|---|---|---|---|---|---|---|---|---|
  | 120/133/100 shipped | 66.7 | 78.2 | 71.8 | 60.9 | 59.4 | 31.8 | 54 | 59.2 | — |
  | 54/62/30 | 79.3 | 84.3 | 78.9 | 74.5 | 69.8 | 13.0 | **62.4** | 69.5 | **48.3** |
  | 50/62/28 | 78.7 | 83.8 | 78.6 | 74.0 | 69.1 | 14.5 | **63.0** | 68.8 | **46.5** |

  The grid: `dev ∈ {54, 59–62}` is a ~4 ms-wide plateau at min(n2-6) ~70;
  `dev ∈ {56–58, 63–64}` are cliffs to ~45; `dev ≤ 42` and the whole thing
  is 0. So the +10-point correlated gain is real and holds at the 480 latch,
  **but it is a phase-lock SPIKE, not a basin** — the ±(slot 2, dev 3)
  neighbourhood collapses to ~46, it never clears 70 under `iid` (n6 ~62),
  and **every helping geometry drops n7 to 13–18** (its sparse-mask stun
  bridge has no phase to give up). No single geometry serves all seven
  nights. Verdict: marginal, and not promotable until the device confirms a
  real actuator can hold the ~4 ms basin under its own jitter — that is
  `fnaf2-1020-e8`'s device thread, gated by the still-open question of whether
  a 33 ms light contact *stuns* (vs merely lights).

- **Item 10 (the bang-anchored attack raise) — a recorded NEGATIVE, and the
  shape of it is the finding (2026-08-27, `740f5b0`).** The attack cycle's
  mask-off + hall Foxy-reset + monitor-raise sits blind behind a 900 ms phase
  pad because the policy cannot see the game's tick phase. `bbLeave()` emits a
  real departure bang. `SEARCH_KNOBS.attackBangGateMs` (default 0) fires that
  whole group `gateMs` after the observed bang instead of the blind
  `off = b + 5.02 + phaseMargin`, and **drags the recovery sweep with it** so
  the toy stun-refresh stays a fixed offset behind the raise (the fix the
  item-11 scratch prototype lacked). `replay()` gains `bangLatencyMs` /
  `bbOnlyBang` to price it honestly.

  | | corr n2 | n5 | n6 | n7 |
  |---|---|---|---|---|
  | blind (gate off) | 69 | 62 | 61 | 33 |
  | gate 1, **bang latency 0** | **94** | **92** | **91** | 47 |
  | gate 1, bang latency 100 ms | 53 | 29 | 26 | 16 |
  | gate 1, bang latency 200 ms | 34 | 4 | 1 | 0 |

  `bbOnlyBang` (ignore non-BB vent departures — a phone's mic cannot tell them
  apart, all use `THUD_SAMPLE`) changes nothing; latency is the whole story.
  At a **perfect instant oracle** the attack-cycle Foxy deaths are *eliminated*
  and n2–n6 clear ~90% on both slack shapes. At any realistic
  bang-detection latency the group (and the dragged sweep) fires late, toy
  stun coverage collapses, and it is **worse than doing nothing**. The
  recovery sweep is pinned to the cycle end (the 400-frame Withered stun
  bridge), so there is no slack to absorb the lag — the same wall pkg 4 hit.

  n7 is barely moved either way (33 → 47 at the oracle) because its Foxy
  deaths are not in the attack cycle — bang-gating cannot touch them.

  **So item 10 needs a fast BB-departure-bang read.** Kept default-off with a
  `test-search.mjs` fixture pinning both halves. **Pinned exactly, 2026-08-27**
  (`tools/minus7/i10latency.mjs`): the budget is end-to-end < ~33 ms for a
  useful +10 on n5/n6, < ~50 ms to break even, a net loss above ~67 ms.
  Android's CDD recommends ≤ 30 ms for continuous PCM delivery *alone* (cold
  start, plan 08's windowed default, is recommended ≤ 100 ms / allowed
  ≤ 500 ms), and that is before onset classification or the 5–22 ms IPC leg
  plan 08 measured. **The latency item 10 needs is below what the audio path
  can deliver — item 10 is closed on latency, not blocked** (`plans/08` §"The
  latency budget an early-unmask would need"). The `bang` cue does not enable
  a Minus 7 survival gain; the cue helper's value is the fast *visual* read
  (plan 15 pkg 5) and shadow research.

- **`replay()` queue-drain bug, fixed in passing (`740f5b0`).** The drain
  tested `queue[0][0]` on an *unsorted* head, so a queue entry pushed at
  runtime (`recent-hall`'s light release; item 10's `bangraise`) could stall
  behind a far-future entry and only fire when some later entry re-entered the
  loop — tens of frames late. Now sorts before testing. Nothing pushed at
  parse time is affected; the 803feb3 ladder reproduces byte-for-byte and the
  engine suite is green.

- **Standing goal status after this session: NOT met, and now bounded on
  both sides.** The purely-simulator scheduling space is exhausted (pkg 4's
  timing knobs, the cycle length, and now the sweep geometry). Geometry gives
  a fragile +10 pending device validation; item 10 needs a detector that does
  not exist. Nights 5/6/7 to 70% still requires either (a) the device
  confirming the geometry basin is real *and* stacking the correlated shape,
  or (b) new device time for a jitter-robust second Foxy reset in the clear
  cycle (see the pkg 5 entry below — the *opener* is refuted). ~~(c) a fast
  departure-bang detector~~ — ruled out 2026-08-27, item 10 is closed on
  latency (`tools/minus7/i10latency.mjs`).

- **Pkg 5 (the Night-7 opener) closed by recorded negative (2026-08-27,
  `tools/minus7/n7probe.mjs`).** Its premise — n7 dies in the opening because
  Foxy has no dormancy and the opening has no reset/GF-clear — is wrong. Three
  controlled `Sim` patches:
  - A **perfect opening Foxy reset** (extend `foxyDormant` on n7 to the first
    5/8/12/20/40 s) moves n7 by **~0.0 points**. The opener is irrelevant.
  - n7's Foxy shortfall is the clear cycle's **two existing resets (b+1.38,
    b+3.10) missing under jitter**: making those two perfect takes n7 **33 →
    61 %**; one perfect reset per cycle, or a perfect third, does nothing.
  - Once Foxy is perfect, **every remaining n7 death is `inside-office`**
    (232/600) — the sweep-geometry lever, not Foxy.

  So n7 → 70 % is a jitter-robust second clear-cycle Foxy reset (pkg 4: cannot
  clear `MASK_ANIM_OFF` without hitting the sweep pin → device time) stacked
  with the tight geometry. The n7-in-the-attack-cycle framing in
  `PROGRESS.md` "What moves Night 7" (levers 1–3) is superseded: n7's Foxy
  deaths are in the **clear** cycle, item 10's attack-cycle bang-gate barely
  touches them (33 → 47 even at a perfect oracle), and the *opener* is not a
  factor at all.

- **The 55–67 ms contact band — built, gated, and it is an n2/n5 lever, not
  the sub-70 fix (2026-08-27, `853f8bc`, `fnaf2-1020-02`).** The blocker this
  bullet named is gone: `devicePlan` now takes `sweepLastContactMs` and the
  sweep line carries a `:N` suffix on the last camera (`10,4,7:67`), so only
  the drift-exposed last slot's light lengthens and the geometry stays
  LIGHT_AFTER (`sweepCamMs` is geometry-aware, not a bare `< 50` threshold).
  1200-seed `66/33 slot50 last67` vs shipped, correlated:
  - **n2 +12, n5 +10 — robust.** Holds at the pinned rl480 actuator and under
    `iid`, and it is a **basin, not a spike**: ±6 ms device-spacing keeps n6
    71–76, the model slot is a smooth gradient with no cliff. Mechanism, not
    coincidence: 67 ms is 4 lit frames vs 33 ms's 2, widening the last flash's
    coverage past the drift. This is the geometry lever the grid was looking
    for — but only for n2/n5.
  - **n6 +13 at rl550 → +4 at rl480.** Mostly a gate artifact; n6 → 70 % not
    delivered.
  - **n7 unaffected and still broken** — any LIGHT_AFTER base-33 sweep fails
    the n7 schedule at **zero jitter** (Toy Bonnie / Foxy flood), last-slot
    67 ms or not. So the two structural verdicts stand: n7 needs new device
    time, and n5/n6 to 70 % is not a scheduling change.
  Full table and controls in `ON-DEVICE-VALIDATION.md` §"The localized
  last-slot 67 ms light, gated". Device probe open: does the last-slot leak,
  and its repair, behave on the phone as in the model.

  **Parked, flagged:** `--device-spacing-ms=100 --sweep-contact-ms=67` (legacy
  geometry, `contact ≥ 50`) reads correlated n7 ≈ 50–63 flat across model slot,
  holding at rl480. If real that breaks the "n5/n6/n7 need device time"
  conclusion and contradicts `devicetimesearch`. But it is the legacy path
  where `replay` holds the light `f(100)` while the emitter anchors on
  `sweepCamMs(67)` — a 33 ms emit/replay mismatch that is the likely source.
  Untangle the legacy contact semantics before trusting it.

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

### 5. The Night-7 opener search — CLOSED by recorded negative (2026-08-27)

**The premise was wrong: the opener is not where Night 7 is lost.**
`tools/minus7/n7probe.mjs` tested it with three controlled `Sim` prototype
patches (each applied and restored — a measurement control, not a second
engine):

- **A *perfect* opening Foxy reset** — extend `foxyDormant` to cover the first
  N seconds on n7 — moves n7 by **~0.0 points** at N = 5, 8, 12, 20, 40
  (33.0 → 32.8–33.8, all inside noise). "Foxy arrives hot because the opening
  never resets him" is not the mechanism.
- **A perfect *extra* Foxy D-zero once per 5 s cycle**: no change. **Twice per
  cycle** (either 2.5 s apart, or at the clear cycle's own two reset phases
  ~1.7 s apart): **n7 33 → 61 %.** A third beyond that adds nothing. So n7's
  Foxy shortfall is the clear cycle's **two existing resets (b+1.38, b+3.10)
  missing under jitter** — not a missing reset, and not the opening.
- With those two resets made perfect, **every remaining n7 death is
  `inside-office`** (232/600) — toys/Withereds past the sweep, which is the
  sweep-geometry lever's territory, not Foxy's.

**So Night 7 → 70 % needs, and only needs:** (a) jitter-robust execution of the
clear cycle's two existing Foxy resets — and pkg 4 already established those
cannot be moved clear of the `MASK_ANIM_OFF` window without colliding with the
400-frame sweep pin, i.e. it is new device time — stacked with (b) the tight
sweep geometry for the office entries (device-validation gated). **Neither is an
opener change**, and the opening's lack of a Golden Freddy clear is not on the
n7 critical path (GF deaths are a small minority and appear at the tight
geometries, not the opening).

This is the "recorded negative → Night 7 is a device-time problem, not a
scheduling one" outcome the gate below anticipated, reached from a different
direction than expected (the opening is *irrelevant*, not *unfixable*).

**Gate:** ~~a candidate that beats 26 % at 1200 seeds under `correlated`, or~~ a
recorded negative result — **met**: `n7probe.mjs` + the `test-search.mjs`
fixture pinning that a perfect opening reset does not move n7.

### 6. Machine-readable provenance and dependency reporting — DROPPED (2026-08-27)

**Not built, deliberately.** This package exists to make a *promoted candidate's*
dependency on non-`SOURCED` rules explicit. Packages 4 and 5 both closed by
recorded negative — there is no promoted candidate, so the dependency report has
nothing to run on, and `src/config.js` is by now ~entirely `[SOURCED]` (the
music-box drain, the last hold-out, was closed by g653–660). A dependency-report
tool retains value for whatever candidate a future *device* result produces;
build it then, against that candidate, not speculatively now. Pedro's call,
2026-08-27: "it's too late for package 6, everything has been refuted already."

The original spec, kept:

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

- ~~The Foxy-reset decoupling (package 4) has either a 1200-seed frontier
  candidate that clears the sub-70 nights under `correlated`, or a recorded
  negative result with the mechanism named;~~ **met — recorded negative
  (2026-08-27), mechanism named: the constrained scheduling space is a wall.**
- ~~the Night-7 opener (package 5) likewise;~~ **met — recorded negative
  (2026-08-27): the opener is refuted, n7 is a steady-state clear-cycle
  problem. `tools/minus7/n7probe.mjs`.**
- ~~every promoted candidate carries its provenance-dependency list~~
  **package 6 dropped** — nothing was promoted, so there is nothing to flag;
  rebuild it against a device-produced candidate if one appears;
- ~~`PROGRESS.md` item 9's standing goal is either met in the simulator or
  shown to require new device time~~ **shown to require new device time
  (2026-08-27), with the search recorded** in this log and in
  `tools/minus7/{geometrysearch,n7probe}.mjs` + `SEARCH_KNOBS.attackBangGateMs`
  so a later session does not repeat it.

**This plan is effectively complete** — 4 of 6 packages closed (5 of 6 if the
stale 0/6 dashboard row is corrected for pkgs 1–3), and pkg 6 blocks nothing
because no candidate was promoted. The standing goal moves to the device.
