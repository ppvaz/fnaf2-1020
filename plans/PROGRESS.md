# Plan progress

**Updated:** 2026-08-27

**Overall:** **36%** — 34 of 94 mandatory top-level work packages are closed.
(2026-08-27: Plan 16 resolved — pkgs 1–3 were built in prior commits but the
dashboard row was never updated off the plan's own `(done)` markers; pkgs 4 and
5 closed by recorded negative in `740f5b0` / `4e7abce`; pkg 6 dropped (95 → 94
mandatory) — a dependency report needs a promoted candidate and there is none.)

**Expanded stock-device roadmap (Plans 09–15):** **7%** — 3 of 44 mandatory
packages are closed.

## Very next step

**2026-08-27 (`740f5b0`) — the plan-16 constrained search is done, both levers
measured to a conclusion, and the standing goal (item 9) is NOT met.** The
sweep-geometry axis and item 10's bang-anchored reset — the two levers the
block below named — were each built and gated at 1200 seeds
(`tools/minus7/geometrysearch.mjs`, `SEARCH_KNOBS.attackBangGateMs`; plan 16
progress log has the tables):

- **Sweep geometry: a real +10 on n2–n6 correlated, but a phase-lock SPIKE.**
  Every `dev≈62` geometry (`geometrysearch --mode=admit`) lifts min(n2–6)
  59→70 correlated and holds at the readLatency-480 latch — but the
  ±(slot 2, dev 3) neighbourhood collapses to ~46, it never clears 70 under
  `iid` (n6 ~62), and it drops **n7 to 13–18** (vs shipped 33). `dev` is a
  ~4 ms-wide plateau with cliffs on both sides. Not promotable until the
  device shows a real actuator holds the basin under its own jitter — that is
  the `fnaf2-1020-e8` device thread. (The "does 33 ms *stun* vs merely light"
  question is **answered** — the dump sources no minimum lit time, g450–455
  are single-frame triggers on a per-frame `lit?` boolean, and at zero jitter
  the sim locks every toy on every geometry; see "The stun needs no minimum
  lit time" below. What the device still has to show is that the last-slot
  drift leak and its 67 ms repair behave on the phone as in the model.)
- **Item 10: needs a bang detector faster than the phone has.** Firing the
  attack cycle's mask-off/reset/raise (+ dragged recovery sweep) on the BB
  departure bang clears n2–n6 to ~90% **at a perfect instant oracle**, and is
  **worse than blind at 100 ms bang latency** — the recovery sweep is pinned
  to the cycle end, so acting late drags it late and toy coverage collapses.
  Recorded as a default-off negative. n7 barely moves (it dies to Foxy in the
  opening / clear cycles, not the attack cycle).

**The useful positive:** a <~50 ms BB-specific departure-bang detector would
be worth ~+30 points on n2–n6, so **plan 15 / plan 08 audio-detection latency
is a survival lever, not just an honesty concern.**

**Next, in order (all device — the simulator scheduling space is exhausted):**
1. **The LIGHT_AFTER geometry on the phone.** The 33 ms contact *does* stun in
   the model (dump + sim, no minimum lit time). Open: (a) does the sweep's
   last-slot ~12–30 % jitter leak reproduce on the phone, (b) does a 67 ms
   light close it there — needs the LA/legacy switch made a flag (`fnaf2-1020-02`
   is on this), and (c) does a real actuator hold the ~4 ms `dev≈62` basin.
   `n2-la-212912` already showed the geometry transfers with no HID lit-miss.
2. **New device time for a second clear-cycle Foxy reset** — the one thing
   Night 7 needs (plan 16 pkg 5: the opener is refuted, n7's Foxy deaths are
   the clear cycle's two resets missing under jitter; perfect x2 → 61 %, the
   rest is office entries = lever 1). Pkg 4 showed the reset cannot clear
   `MASK_ANIM_OFF` without hitting the sweep pin, so this is a device-side
   question: is there a cheaper path to `hallView` (e.g. folding the reset
   into the read's own monitor-down)?
3. **Plan 15 detection latency** is on the critical path for survival, not
   only architecture — a <~50 ms departure-bang read is worth ~+30 points on
   n2–n6 (it would unlock item 10, which is otherwise a recorded negative).

---

*(Superseded 2026-08-27 by the 1200-seed search above — the "needs a proper
1200-seed search" it calls for is now done. Kept per the retractions rule; its
7-point 400-seed table is subsumed by the plan-16 grid.)*

**2026-08-27, `minus7-perfect-experiment` branch — the actuator question is
CLOSED, and the answer is that it was never the constraint.** Session on this
branch measured, on the g56: 33 ms contacts register for **every** touch
control — camera select (via the LIGHT_AFTER decoupling, `plans/17`), monitor,
mask, and the hall beam (a 33 ms hold lights the hallway). The 100 ms floor
this project defended since the swipe era is margin. LIGHT_AFTER is a
device-validated sweep that spans ~200 ms (vs 366) and locks Toy Bonnie AND
Toy Chica where the 100 ms geometry did only intermittently (the CAM-07
last-flash saga). `docs/device/HID-MULTITOUCH.md` §"The 100 ms contact floor
is margin".

**What it does to the sub-70 nights is a TRADEOFF, and the landscape is
chaotic — phase-lock, not a smooth curve.** Gate ladder + a 7-point geometry
sweep, `minus7-perfect-experiment`, human-correlated ±60 ms, 400 seeds:

| sweep geom (slot/dev/con) | n2 | n5 | n6 | n7 | n7 @ measured |
|---|---|---|---|---|---|
| 120/133/100 (shipped) | 71 | 64 | 63 | 33 | 90 |
| 67/33 slot 50 | 70 | 57 | 57 | 12 | 11 |
| **50/60/30 slot 50** | **82** | **76** | **71** | 17 | 14 |
| **40/50/25 slot 40** | **81** | **74** | **67** | 22 | 42 |
| 45/56/28 slot 45 | 60 | 46 | 45 | 14 | 52 |
| 36/45/22 slot 36 | **3** | **0** | **0** | 0 | 0 |
| 33/40/20 slot 33 | 8 | 5 | 0 | 0 | 0 |

Read that carefully:

- **A tight LIGHT_AFTER sweep (50/60/30 or 40/50/25) lifts n2-n6 at human
  jitter by +5 to +13 points — n5 crosses 70, n6 gets to 67-71.** This is a
  real re-phasing gain, not noise (it repeats across two geometries and both
  jitter shapes).
- **Every geometry that helps n2-n6 WRECKS n7** (17-22 human, 14-42 measured
  vs the shipped 33/90). n7's sparse-mask stun bridge had no phase to give up.
- **Two nearby geometries collapse EVERYTHING to 0** (36/45/22, 33/40/20) —
  the phase-lock cliff. So this is not a knob to turn; it is a search.
- **The simulator still does not model contact length** — a 33 ms *tap* plan
  replays identically to a 100 ms one. The gain here is entirely from the
  narrower SWEEP re-phasing the cycle, which the LIGHT_AFTER geometry makes
  landable, not from shorter taps.

**So the corrected standing: the actuator discovery IS a lever for n2-n6 at
human jitter — through cycle re-phasing, needing a proper 1200-seed search
over the sweep geometry (a plan-16 axis that was never in the search) — and
it is NOT a lever for n7, which gets worse.** The other two levers still
stand and n7 needs them: **item 12's correlated jitter shape** and **item
10's bang-anchored Foxy reset**.

*(The 2026-08-27 09:xx line just above, "does not move the sub-70 nights,"
was written before the 50/60/30 point and is wrong — kept per the retractions
rule.)*

### Device run `n2-la-212912` (2026-08-27): the geometry transfers; the death was Foxy during a mask-camp

First graded on-device Night 2 with the LIGHT_AFTER sweep (`SWEEP_SLOT_MS=50
SWEEP_SPACING_MS=66 SWEEP_CONTACT_MS=33`, `EXPERIMENT_UNGATED=1`, no cue
helper — it had died). `grade-run.sh` verdict + Pedro's eyewitness:

**Confirmed by the instruments — the open question is answered YES:**
- The LIGHT_AFTER burst executed correctly on the phone (hid trace: per camera,
  select-down 17 ms → up → 17 ms settle → light-down 33 ms → up; all of 10, 4, 7).
- **CAM 07 lit on ~20 consecutive sweeps** (sweepcheck 8–27 all `cam07=lit`).
  The geometry that only intermittently lit CAM 07 at 100 ms lights it here.
- All camera selects registered (camtrace: 10, 4, 7 every sweep).
- **The monitor model held with ZERO desync for 154 s** (desync-scan: "held for
  the whole graded interval"; every monitor/mask press agreed with the game).
- screenstate: **ALIVE ≥ 180 s**; no instrument saw the end (run aborted on
  focus-loss at 193 s).

**What killed it (keyframe at 187.5 s = the withered-Foxy jumpscare):**
- ~148 s: `left-view` flips to `inside` (margin 18, the displaced boundary) and
  stays there — Pedro saw Toy Chica in the office, and a BB "kill" in the chain.
  So the lit CAM 07 sweep **rendered** but did not **pin** Toy Chica this run.
- The runner correctly failed closed: prophylactic mask, 5 ticks, 4× over
  148–188 s (`macro attack[2..999]`).
- **While mask-camping, the normal cycle — including the hall Foxy resets — is
  suspended.** Foxy, un-reset for ~40 s, jumpscared at ~188 s.

**Reading:** this is *not* a refutation of the n2–n6 lever (the geometry
transfers, which was the doubt) but *not* a confirmation either. Two
pre-existing problems bit, both already named on this page:
1. The office-entry **mask-camp emergency mode has no Foxy handling.** Lever
   10 (bang-anchored Foxy reset) and "the office-entry mask" are exactly where
   CLAUDE.md says the nights are won.
2. Toy Chica escaped because of **sweep geometry, not contact length** — see
   the source + sim finding below.
3. No cue-helper BB read this run (helper dead) — the runner never separated
   "BB inside" from "toy inside" and just mask-camped. `plans/15` BB-first.

### The stun needs no minimum lit time — Toy Chica leaks on ORDER (2026-08-27)

**The dump sources no minimum `lit?` duration.** Groups 450–455 (g455 = Toy
Chica) are single-frame triggers: `your view` marker overlaps the character
**and** `viewing > 0` **and** `lit? == 1` **and** `viewing != <excluded cam>`
→ stun set that frame. `lit?` itself (g75–79) is a plain per-frame boolean —
1 on any frame `Key-17` is held with battery and not `in danger`, 0 the frame
it releases. No ramp, no accumulator, no hold counter anywhere. A 33 ms
contact spans ~2 frames > one 16.7 ms poll, so `lit?` is 1 for ≥1 frame and
the stun lands that frame. **So "33 ms is below a stun threshold" is not a
thing** — the A/B/C contact-length probe is not needed to answer this.

**The sim confirms it and localises the real fault.** `modelGate`, night 2,
1200 seeds, Toy-death census:

| geometry | slack 0 | slack ±30 | slack ±60 |
|---|---|---|---|
| shipped 133/100 | TC 0 TB 0 TF 0 | TC 3 TB 6 TF 3 | TC 85 TB 66 TF 35 |
| LIGHT_AFTER 66/**33** slot 50 | **TC 0 TB 0 TF 0** | **TC 146** TB 0 TF 0 | TC 349 |
| LIGHT_AFTER 80/**50** slot 50 | — | TC 233 | TC 413 |
| LIGHT_AFTER 100/**67** slot 50 | — | **TC 0 TB 0 TF 0**, surv 1199 | surv 850 |
| LIGHT_AFTER 100/**67** slot 67 | — | **TC 0**, surv 1199 | **surv 936** |

- **At zero jitter every geometry locks every toy.** The stun lands. The
  device run's Chica escape is a jitter/drift effect, not a mechanic failure.
- **The leak is the sweep's LAST slot, whatever camera sits there** — reorder
  `10,4,7`→`7,4,10` and the ~145-at-±30 hole moves from Toy Chica to Toy
  Freddy (CAM 10); →`7,10,4` moves it to Toy Bonnie (CAM 04). Flashing 07
  twice (`10,4,7,7`) does **not** help — the extra slot is just the new last
  one. So it is not Chica's path (`[9,7,blindA,1,5,ventL]`, CAM 07 her only
  swept room) that is special; it is the position.
- **The cause is drift margin, not stun threshold.** The whole ~200 ms sweep
  landed up to 150 ms late on the device run (60–99 ms median cycle-boundary
  residual). A 33 ms light on the last, most-delayed slot often arrives after
  its target has already taken the 5 s move — 50 ms is no better (worse,
  even) — but **67 ms closes it completely** (±30: 0 leak, 1199/1200; ±60:
  936 vs 653). 100 ms would too, but forces the slot wide enough to re-trigger
  the Foxy phase-lock (`133/100 slot 50` → Foxy 880/1200).

**The fix is a 67 ms light contact — and it needs a code change first.**
`sweepCamMs`/`replay` currently pick the decoupled LIGHT_AFTER path only when
`contact < 50`; at 67 they fall back to the legacy same-report geometry, which
is exactly what renders CAM 07 dark on the phone (the whole reason LIGHT_AFTER
exists). The LA/legacy switch has to become a flag, not a contact-length
threshold, so 67 ms decoupled is expressible. **This is session 31's search
axis** — the useful band is ~`100/67 slot 55–67`, and every search so far
capped contact below the value that actually works.

**Device probe, reframed:** one graded Night 2 at `100/67 slot 67` with the
decoupled select forced on, `CUE_HELPER=1 CUE_AUDIO=1` — does 67 ms close the
last-slot hole on the phone as the sim says (1199/1200, zero toy leak).

---

*(Superseded 2026-08-27, kept per the retractions rule.)* **The standing goal
(item 9): nights 2-6 are sweep-selection-spacing-bound; Night 7 is
jitter-shape-bound. Item 13's "device-actuator overhead" framing
was checked and corrected on 2026-08-27 (two sessions) — see the correction
appended to item 13.** The emitted schedule replays 400/400 = 100% on every
night at zero jitter (item 11). The read-capture cost moves nothing
(`readLatencyMs` 550→100 → <1 pt). But sweep selection spacing **does**:
emitted 133→113 ms takes corr **n2 75, n5 73, n6 72, n7 43** (session `55`,
`devicetimesearch.mjs`, `plans/16` log) — and 113 ms sits *below* the
device-validated 133 ms floor. So 2-6 to 70% is a 113 ms sweep actuator; n7
is still short at 43 for the jitter-shape / reset-placement reasons, not
spacing.

**Is the unjittered schedule runnable on the phone?** The precision is there
— `hid_delay` holds intra-macro boundaries to **±2 ms** (getevent), and the
fork-free `/proc/uptime` `wait_until` lands the one per-cycle wall boundary
**inside a 10 ms tick** (device-probed 2026-08-26, was 34–73 ms late on the
`date` loop). The gate's ±60 ms iid is a *human* model, not the machine. Four
things stand between that and "runnable", none of them raw timing precision:
(1) the human gate refuses a machine-precision plan by design; (2) the one
un-macro'd beat — the `screencap`-gated BB read → branch — slips **30–900 ms**
past the plan cut-off on the real phone (`actuator.mjs`), on the Foxy-critical
beat, which is what `plans/15`'s cue-helper migration fixes; (3) the sweep
spacing the nights want (113 ms) is below the proven-reliable actuator floor;
(4) `--device-actuator` is still 0% (forcedown cascade, verified recovery
unmodeled). Concrete next moves:

- **A 113 ms sweep actuator, proven against the phone** — `HID-MULTITOUCH.md`
  "Answered: the phone accepts 120 ms spacing" says the actuator can hit it;
  the CAM-07 last-flash finding says at 20 ms released (120 ms spacing) the
  *game* may still drop ~1 flash in 32. Re-run `hid-sweep-probe.sh` at 113 ms
  with an HID trace and grade both signals before trusting it.

- **`plans/15`, BB-first** — Pedro's directive 2026-08-27: *every*
  screencap-dependent read moves to the cue helper, graders included, live
  loop first. **In progress:** `trial/08-bb-threat-response.sh` now logs a
  paired `GRID` line next to every BB frame (`cue_grid()` in
  `trial/02-hid-wire.sh`, parallel to `screencap`, empty class included), so
  the next device night accretes the VirtualDisplay-scaler corpus package 4
  needs. See `plans/15` progress log. Next: same capture at
  `trial/06-cams-up-anchor.sh` and `trial/04-session.sh`, then the signature
  build. **This is architecture/honesty, not an n5/n6/n7 fix** — the gate is
  flat from `readLatencyMs` 550 → 100.
- **item 12's correlated jitter shape** for `human-gate.mjs` — this *is* an
  n5/n6/n7 lever. Its own header says iid is the wrong shape, and under a
  rough correlated model the same unchanged plans already sit at n2 ~71 /
  n5 ~64 / n6 ~64 / **n7 ~41** (vs iid's 26). Landing
  `tools/tracereport.mjs`'s correlated bands from real trainer traces is
  measurement, not tuning, and is the biggest legitimate move left on n7.

### What moves Night 7 out of impossible territory (2026-08-27)

> **Levers 1–3 below are partly superseded by plan 16 pkg 5 (`740f5b0` +
> follow-up, `tools/minus7/n7probe.mjs`). Kept per the retractions rule.**
> Measured with controlled `Sim` patches: **the opener is irrelevant** — a
> perfect opening Foxy reset moves n7 by 0.0 points. n7's Foxy deaths are in
> the **clear** cycle, not the attack cycle: its two existing resets (b+1.38,
> b+3.10) miss under jitter, and making just those two perfect takes n7
> **33 → 61 %**. Item 10's attack-cycle bang-gate (lever 2) barely touches it
> (33 → 47 even at a perfect bang oracle). The remaining ~39 % once Foxy is
> perfect is entirely `inside-office` — the sweep-geometry lever. So n7 → 70 %
> is **a jitter-robust second clear-cycle Foxy reset (new device time — pkg 4:
> cannot clear `MASK_ANIM_OFF` without the sweep pin) + the tight geometry**.
> Lever 1 (correlated jitter) still stands as the honest-measurement move.

n7 gate is **310/1200 = 25.8%**, 87.5% Foxy deaths, median death 54 s — half
the runs dead in the first in-game hour, because `foxyDormant` (engine.js
g872-874) holds Foxy at D=0 for none of Night 7 where it covers all of Night 1.

**Not the screencap.** Proven this session: the read cost does not move any
n7 model.

**The levers, in order of how load-bearing:**

1. **The jitter model shape (item 12).** iid ±60 ms per row is the wrong
   structure; correlated bands already put the *unchanged* plan at n7 ~41.
   Biggest move, and it is honest — it measures the real human error, not
   tunes the schedule.
2. **The bang-anchored Foxy reset (item 10).** n7's post-mask hall reset
   lands inside `MASK_ANIM_OFF` under jitter ~half the draws and resets
   nothing. Anchoring `off` to the observed departure bang decouples it from
   the stun-refresh geometry. The one schedule lever items 8–12 left open.
3. **A different attack-cycle geometry.** The current one wedges the reset
   between `MASK_ANIM_OFF` (15 fr) and the 400-frame Withered stun budget;
   every timing sweep on it is a hard wall (item 12 a–e). "New device time"
   done right = folding the reset into the read's own monitor-down, not a
   faster phone. Hardest, least explored.

**Are we hitting the strategy's wall?** Precisely:

- **Route shape (left-opening sparse): no.** `hidpilot --night=7 --sparse-left`
  is 10000/10000 + 3000/3000 worst with *free* lit reads (`HID-MULTITOUCH.md`).
  The strategy is sound.
- **The schedule: no.** 400/400 = 100% zero-jitter on every night (item 11).
- **The Foxy reset's *placement*: yes** — pinned by two game constants, every
  sweep fails.
- **n7 flashlight budget: near a wall** — the tightest night, ~3 s of
  headroom, every lit observation competes.
- **The actuator model: unfinished** — even the free-read route is 100% only
  *without* `--device-actuator`; with it, 0% (forcedown cascade, the live
  runner's verified recovery is unmodeled). No n7 claim is real until that
  closes.

So n7 → 70% is: get the jitter model honest, bang-anchor the reset, and only
if both fall short, re-geometry the attack cycle. It is **not** a device-speed
problem and **not** a route-shape problem.

**Other open items from earlier sessions follow, in priority order.** Written
as work is done rather than composed at the end; two are delegated and named.

1. ~~**LIVE DEFECT: `CUE_CAMS_UP_GREY=159` is refuted and still shipped**~~
   **CLOSED 2026-08-26.** The measurement held on re-derivation: of the 77
   office reads in `captures/n1-grey-2202-run.log`, **21 sit at or above 159**
   -- 16 confident `empty` and 5 on which `$CHECKER match` itself said
   `cams=down`, so all 21 are false positives and none is a missed desync.
   `cams_still_up()` now re-asks that same `$CHECKER match` on a fresh frame,
   through a shared `CUE_MONITOR_ROI`; the constant is gone and
   `test-plan-interpreter.sh` refuses its return. See the grey-anchor section
   below for the retraction in full.
2. ~~**The night-blind BB-model guard**~~ **CLOSED 2026-08-26, and the fix is
   not the one that was asked for.** The refusal in `trial.sh` (and its mirror
   in `preflight.sh`) now asks `canAct(night,'bb')` and names the night it is
   refusing for, so a Night 1 operator is no longer told a Night 6 statistic.
   **But the requirement itself still holds on every night**, because the
   premise that the model "is never consulted" on Night 1 does not survive
   checking: `recipe.mjs --night=1` emits a `read` in every cycle, and that one
   capture feeds three consumers in `12-night-loop.sh` -- the bb/empty branch,
   the `blind_streak`/`nolight_streak` health guards, and `monitor_seen`, the
   desync checkpoint. `elegance.py` already says this in prose ("on a night
   where `canAct(n,'bb')` is false the read still carries the other two"). With
   `BB_LEFT_MODEL` unset the driver is handed `BB_MODEL=-` *and* `CHECKER=-`,
   every classify fails, every read is `unknown`, and the run exits 45 on its
   fifth cycle. So what was night-blind was the *reason*, not the rule.
3. **Third and fourth attribution defects in `elegance.py`**, same class as the
   two already fixed (sweep, vent read): `cam-?11 -> puppet` ignores that CAM 11
   is Mangle's cam-stall (g357) and flash target (g456); `mask -> toys` ignores
   that the mask also answers the Withereds, Foxy and Golden Freddy. Neither
   mis-grades today; both are wrong models. DELEGATED.
4. **Hour-aware Night 1 plan, not built.** Sourced and ready: hours 0-1 need
   nothing (no threat armed until 2 AM, and g653 gates the box drain to 2 AM),
   and the BB attack branch is dead all night. Needs `recipe.mjs` emission, the
   runner honouring it, and a 1200-seed re-gate **watching the seven
   Puppet-sensitive seeds (136, 139, 403, 715, 825, 978, 1197)** the concurrent
   session identified -- they are wind *timing*, not budget.
5. **Toy Chica has not been found.** Pedro saw her in the hall on the live
   Night 1; no instrument here has caught her, and the repository still has no
   frame of an animatronic in the office. That control is what would settle
   whether `grey=` and the yellow anchor survive a real occupant.
6. **The white bands in the recordings are unexplained.** Three hypotheses
   measured and refuted: not the cue helper (the run without it is torn *more*,
   34.7% vs 27.7%), not the "lost signal" cue (that is a dark camera with text),
   not the camera-switch animation (bands are uniform across cycle phase at a
   ~0.2-0.3 s period, not twice per 5 s cycle). What is settled: **do not filter
   frames on them and do not use per-frame variance on this footage** -- doing
   so discarded the very frame that showed Toy Bonnie.

7. **NEW 2026-08-27: `tools/device/deathchart.mjs` charts the gate's whole
   death census** -- one pie plus a full detail table per night, colour fixed
   per character, median time of death per cause, gated by
   `test-deathchart.mjs` and listed in `TOOLS.md` and the coverage exclusions.
   `modelGate()` now also returns `deathTimes`. Engine suite green.

   **What it found, and it contradicts `CLAUDE.md` (now corrected in place):
   the Puppet is at ZERO on every night 2-7** at `6e27c79`, where that page
   records 15 on Night 6. Mechanism checked, not inferred: `windtrace.mjs
   --night=6` has the box never below 0.56 across 300 seeds, so he cannot
   reach an attack. Foxy plus office entries are now **100%** of all losses.

   **Open, and this is the next thing worth doing.** Foxy is 52-88% of deaths
   on every night and the ladder's whole remaining cost:

   | night | survived | foxy | office | median death |
   |---|---|---|---|---|
   | 2 | 825/1200 68.8% | 219 (58.4%) | 156 | 276 s / 3 AM |
   | 3 | 959/1200 79.9% | 164 (68.0%) | 77 | 299 s / 4 AM |
   | 4 | 891/1200 74.3% | 226 (73.1%) | 83 | 239 s / 3 AM |
   | 5 | 774/1200 64.5% | 220 (51.6%) | 206 | 160 s / 2 AM |
   | 6 | 680/1200 56.7% | 342 (65.8%) | 178 | 175 s / 2 AM |
   | 7 | 310/1200 25.8% | 779 (87.5%) | 111 |  54 s / 12 AM |

   Two facts to start from, both visible in `captures/deathchart-n2-7.svg`.
   **(a) Night 2 is harder than Night 3** (68.8% vs 79.9%) and the sourced AI
   table says why: night 2 arms toybonnie/toychica at 3 and toyfreddy at 2,
   where night 3 arms the toys at 1. Night 2 is not a gentle night.
   **(b) The two Foxy causes are one mechanism seen twice** -- "locked on, no
   blackout covered the 10s interval" and "flashed the hall after Foxy locked
   on" are both D having already exceeded 3. The reset is what is missing, not
   the flash. `foxyExposureFrames = 100 * night` also means Foxy locks on
   *sooner* on Night 2 than Night 3, which is the other half of (a).
   **(c) Night 7's median death is 54 s -- half its runs are dead inside the
   first in-game hour.** Checked, not assumed: the night-7 plan emits
   `#idle-until 0`, so this is not the opening idle. It is `foxyDormant`
   (engine.js, g872-874) holding D at zero for all of Night 1 and until 2 AM on
   Night 2, and for *no* part of Night 7, where Foxy is at his capped 17 from
   midnight. That is also why Night 1 is 1200/1200. So on Night 7 the question
   is what the opening does, not what the steady cycle does.

   **Before acting on (b), know the device-side gap that sits under it
   (from the concurrent session, 2026-08-27).** `sweepcheck.py` was measuring
   camera-switch **tearing**, not the flashlight -- a torn frame's whole-ROI
   mean is 173 against its own lit threshold of 86, where a clean lit frame is
   111. Fixed in `7b70927` (textured rows only, gated by four reference frames
   in `docs/img/tearing-vs-flash`), but the honest state is that **no
   instrument here has yet confirmed a flash landing on the device**, and the
   stun is game state that rendering cannot see. A Foxy-reset fix priced only
   in the gate would be a simulator result resting on an unmeasured actuator.

   **Not yet done:** nothing has been changed in the plan on the strength of
   this. It is a census, not a fix.

8. **REVERTED 2026-08-27, after a third refuted fix: the widened
   (CAM 10/04/07/11-dark) sweep from the interrupted `~/.codex` session had a
   real, unfixable-within-this-session stun-coverage gap on the transition
   into any 'attack'-shaped cycle -- opening or steady.** `tools/device/
   recipe.mjs`, `tools/hidpilottest.mjs`, `tools/device/trial/{02-hid-wire,
   10-minus7-sweep,11-plan-interpreter}.sh` and `tools/device/
   test-human-floor.sh` are checked out back to `803feb3` (`git checkout --`).
   Nothing about *when Minus 7 flashes which camera* changed -- the reverted
   code was purely the actuator's CAM 11 dark-park addition, undocumented
   anywhere (no HID-MULTITOUCH.md/ON-DEVICE-VALIDATION.md entry motivates it,
   unlike the already-committed 133 ms Fusion-poll widening in the same area,
   which stays). Full record of why, so this is not re-attempted blind:

   Found two independent ways:

   - `recipe.mjs`'s `assertStunCoverage` (added the same session, uncommitted)
     throws `opening -> attack: CAM 10 is unlit for 7200 ms` against the
     6666.7 ms (400-frame) stun budget, on every night 1-7. `clear -> attack`
     and `attack -> attack` are also over budget, by 33-66 ms per camera.
   - Independently, in the exact `hidpilottest.mjs` simulator (no recipe.mjs
     involved): `hidpilot n6 target` went 500/500 -> 0/500. Traced one seed to
     its mechanism, not just its symptom -- `withchica` (Withered Chica) sits
     gated on CAM 04 (`u.stunUntil`, refreshed every ~300-frame clear cycle)
     from frame 900 until frame 7116, where she advances. Her last CAM 04
     relight before that was frames [6709,6716), giving `stunUntil=7115`; the
     next scheduled relight (a `clear -> attack` transition, since the read at
     frame 8230/8530-equivalent classified `bb` on this seed) doesn't land
     until frame 7126 -- an 11-frame (183 ms) window in which she is
     unstunned, and her per-tick advance roll landed inside it. She reaches
     the office 40-frame marker-123 attack and completes it at frame 8653; the
     224+171+62 = 457/500 "Withered X completed the sourced 40-frame
     marker-123 attack" deaths are this same mechanism, not 457 unrelated
     bugs.

   **Root cause, confirmed by bisection (`git diff` reverted piece by piece
   against the same 500 seeds):** the dark CAM 11 park added to the sweep is
   real, needed device time (a fourth HID contact, priced correctly in
   `recipe.mjs`'s `SWEEP_ROUTE`/`sweepSpan`). Anchoring the *whole 4-contact
   macro's end* at the old boundary (so the extra contact doesn't overrun the
   cycle) pulls the *light* portion's own end earlier by one slot, which is
   exactly the two edges above run out of stun budget on.

   **Three "obvious" fixes were tried and all three are refuted, not merely
   unconvincing -- each closes the gap and breaks something else specifically
   tuned against the same lever:**
   1. *Don't count the park in the anchor; append it after the light's old
      end instead.* Implemented in `recipe.mjs`, then reverted after
      measurement: for the shipped `MODEL_SLOT_MS=120`/`DEVICE_SPACING_MS=133`
      pair, the underlying `hidpilottest.mjs` model's own CAM 07->CAM 11 gap
      already sits at exactly 133 ms, so the two anchor formulas are
      numerically identical here -- the edit was a no-op that would have
      shipped a false "fixes the 7200 ms gap" comment.
   2. *Shrink `maskMarginMs` (900 ms), the attack cycle's phase-safety margin,
      since a comment in `hidpilottest.mjs` calls it "the only place the
      extra stun gap can be paid from."* Closing the WORST edge
      (`opening -> attack`, 7200 ms) needs it down to ~300 ms; at 300 ms the
      human-gate's 300-seed screen collapses Night 6 to 0.3%, Night 7 to 0%.
   3. *A smaller, more surgical cut (900 -> 800 ms) closes only the
      RECURRING edges* (`clear -> attack`/`attack -> attack`, over budget by
      just 33-66 ms, not 533-566 -- confirmed algebraically: their outgoing
      side already has zero slack, its sweep ends exactly on the cycle
      boundary, so 800 ms is the exact value that makes `clear->attack`'s gap
      6633 ms, just under the 6666.7 ms budget). Measured full 1200 seeds,
      night 6: the "Withered X completed the attack" deaths it targets DID
      fall (99+65+33=197/300 at 900 ms -> 31+17+8=56/300 at 800 ms, one
      300-seed screen) -- **but Foxy deaths exploded in their place**
      (38+31=69/300 -> 126+109=235/300), because the SAME `off`/phaseMargin
      anchor that gates the first flash also fires the attack cycle's Foxy
      hall-reset (`leftAttack`'s comment: "the hall press... resets Foxy
      during the raise frame"). Whole-night 1200-seed verdict at 800 ms:
      night 2 19.8%, 3 34.7%, 4 13.1%, 5 2.6%, 6 0.2%, 7 0.0% -- worse than
      900 ms on every night but 2 and 3. There is no free lever left in this
      sequence: the five-tick mask hold is a sourced BB-repel requirement, the
      0.25 s hall-then-raise and 0.45 s raise-clearance are the SAME kind of
      measured animation floor `RAISE_JITTER_MARGIN_MS`/`MONITOR_ANIM_UP_MS`
      exist to protect elsewhere in this file, and no press can land at all
      while `maskOn` (`press()` drops every non-mask input). Closing this
      gap without breaking Foxy or the mask genuinely needs NEW device time,
      not a reshuffled budget -- e.g., a relight burst inserted before the
      monitor first lowers each cycle, while it is still up from the
      previous cycle's raise, which is unexplored and not a small change (it
      touches the runner's shared per-cycle entry point, not just the sweep).

   **Given that, and that this row of investigation had already run three
   refuted fixes without net progress, the decision is to revert rather than
   keep iterating on an unvalidated addition with no documented benefit.**
   The pre-existing (`803feb3`) 66/79/74/62/54/26% human-gate baseline
   (nights 2-7, 1200 seeds, confirmed by direct re-measurement this session)
   is restored and confirmed clean: `tools/test.mjs --engine` is
   **all checks passed**. If the CAM 11 dark park is worth its device-side
   benefit (whatever it was -- battery, desync recovery; never written down),
   it needs to be re-attempted as its own scoped, documented, gate-validated
   change, not resumed from this state.

   **Two adjacent, unambiguous fixes landed this session and are safe, and
   were kept through the revert (they do not touch the sweep):**
   `tools/device/test-cue-trace-loop.sh` was covering only one of the
   runner's two remote background loops (cue-trace; the newer cue-shadow loop
   added the same session was unguarded) -- rewritten to cover both, pinned to
   the actual loop count so a third goes uncovered loudly, and each is now
   proven to both progress (arm+result) and actually die on sentinel removal,
   not just fail to hang. The audio cue-helper's `heldout`-promotion gate was
   honour-system (`plans/08-audio-cue-controller.md` defect 2) -- closed:
   `provision-cue-model.sh` now reconstructs the exact shadow-form bytes a
   holdout report claims to have scored and hashes them, so a genuinely
   passing report from a DIFFERENT promotion can no longer be hand-pasted
   onto an unrelated model's header. `test-provision-cue-model.sh` is its
   first mock-ADB regression and proves the specific gap: the same fixture
   with only that one check removed installs a passing-but-wrong model clean.

9. **Standing goal, set 2026-08-27: iterate on Minus 7 until every night
   clears 70% under the human-gate.** Baseline to beat (1200 seeds,
   `803feb3`, confirmed this session): night 1 100.0%, 2 66.3%, 3 79.3%,
   4 73.8%, 5 62.0%, 6 54.0%, 7 26.0%. Four nights (2, 5, 6, 7) are below the
   bar. Per the death census in item 7, Foxy and office entries are 100% of
   all losses on every night, Foxy alone 52-88% of them -- so this is where
   effort goes, not wind or the audio controller. **Not reached. Two sessions
   have now attempted it (eviction, below; and the 2026-08-27 later session's
   jitter-robustness pass, item 11) -- both reverted clean, both documented
   rather than left half-built. Item 11's finding narrows the problem: the
   schedule already replays 100% on every night with no jitter, so what is
   open is slack-tolerance of one geometrically-wedged Foxy reset, not the
   route.**

   **The `bb.inside` mechanism, sourced and confirmed.** Traced one Foxy death
   to its exact cause, not just its symptom: `hallLightOn` requires
   `!bb.inside` (`[SOURCED: g75 (hall), g76/g77 (camera), g301/g303/g320
   (vent)]`, `src/engine.js:172`), and BB is walked `inside` -- not by
   lingering, but by *our own response*: `onCamsUp()` (`g417`, engine.js:677)
   sets it the instant the monitor is raised again while he is still
   `inOpening`, which the BB-response macro always does right after masking
   (to get back to flashing CAM 10/04/07). "He does not kill... Foxy finishes
   the job" is the engine's own comment. Once inside, every hall flash is a
   no-op regardless of how many are tried -- confirmed empirically:
   deterministic replay (no human-slack jitter) walks BB inside 0/1636 times
   across 300 seeds; jittered replay does it 55/1150 (4.8%) -- and D climbs
   unopposed (`tickMask` doubles his rate when nobody is credited as
   "in an opening") until he locks on.

   **Tried: Markiplier's eviction pattern (`docs/strategy/MINUS-7-STRATEGY.md`
   §9, "evict instead of suppress"), sourced and mechanically real --
   `fx.loc==='parts'` skips the `gotYou` lock-on check ENTIRELY
   (`engine.js:876`), a genuine 500-999 frame (8.3-16.6 s) immunity window,
   not a reduced-risk one. Confirmed by trace: one seed's Foxy did reach
   `parts` and got a real 16.6 s window. But it made every tested night
   WORSE, and is reverted (`git checkout --` on `recipe.mjs`/
   `hidpilottest.mjs`; the two files are back to `803feb3` byte-for-byte,
   `tools/test.mjs --engine` confirmed clean).**

   What was built: a periodic `evict` cycle (opt-in, `evictFoxy`/
   `clearCycleS` options; a genuinely separate named cycle alongside
   opening/clear/attack, captured from its own `HidPilot` run since
   `evictFoxy` is a whole-instance flag, substituted for `clear` every Nth
   cycle in `replay()`) -- widened to 6.2 s (using 1666.7 ms of the
   camera-stun budget's own slack, the same margin the reverted CAM11-park
   work in item 8 spent and lost) to fit a 1200 ms hall hold instead of the
   usual ~133 ms D-reset pulse.

   Two real, fixed bugs surfaced along the way and are worth keeping in mind
   if this is re-attempted: the legacy `secondBeat` code path had two stale
   spacing defects (a 16 ms gap and a 13 ms overlap) that predated
   `FUSION_POLL_MS` enforcement and were never brought forward with it; and a
   wind-hold formula in the new `evict` path was off by exactly one Fusion
   poll (used `camAt + MIN_CONTACT_FRAMES` where the original -- correctly --
   used `camAt + MIN_CONTACT_FRAMES + FUSION_POLL_FRAMES`), which was
   silently corrupting the PLAIN, non-evict `clear` cycle too before it was
   caught by `devicePlan()` itself refusing the plan -- worth remembering as
   a general lesson: verify a refactor against the unmodified baseline
   byte-for-byte, not just by eye.

   **Why it made things worse -- fully diagnosed, not left open. Two
   separate, both-confirmed causes, found in this order:**

   1. **Widening the cycle length is independently destructive, regardless
      of eviction.** Isolated with a controlled A/B that changed nothing
      else -- identical `plan.clear`/`plan.attack` content, only the read
      cadence moved from 5 s to 6.2 s (a hand-rolled `replay()` copy, no
      tracked-file changes, so this cost nothing to verify): BB walk-ins
      (the `bb.inside` mechanism two paragraphs up) went **55/300 -> 167/300**
      and night 6 survival **161/300 -> 0/300**. Fewer reads per night means
      BB is detected later on average, giving him more time to still be
      `inOpening` when a routine cams-up event (not even a response --
      *any* monitor raise) walks him inside. **5 s read cadence is
      load-bearing on its own merits; do not widen it for any reason without
      re-measuring this specific number.**
   2. **Even holding cadence fixed at exactly 5000 ms and funding the wider
      pulse purely from that cycle's own wind time (in place, same
      `raiseAt`/`camAt`/`windAt` dynamic-spacing technique that made the
      `evict` cycle's plan build cleanly), Foxy deaths still roughly
      TRIPLED** (evictPulseMs 300 -> 224/300 foxy deaths, 500 -> 239/300,
      vs. 69/300 at the unwidened 130 ms baseline) **and this reproduces
      deterministically, with zero human-slack jitter** (0/300 survived) --
      ruling out jitter-sensitivity as the cause and making it traceable.
      The trace found the actual mechanism: `fx.D` is **not** reset while
      Foxy is dormant (`loc==='parts'`) -- only a slow, hall-light-gated
      -1-per-30-frames decay applies there, far short of keeping pace with
      the unconditional +1/s (or +2/s while masked) accumulation. Worse,
      the SAME formula (`eq() = 21+rand(0,4)-D <= ai.foxy`) gates BOTH his
      arrival from `parts` back to `hall` AND his lock-on -- so D must
      already be near the lock-on threshold just to trigger the arrival
      transition. A traced deterministic run showed this exactly: dormant
      and safe for 16 s (t=354-370), arrived back in `hall` with **D
      already at 18**, no reset landed in the following 5 s, and he locked
      on at D=23 at t=375. **Sending Foxy to sleep does not reset his danger
      meter -- it lets it climb unmanaged, then wakes him already primed.**
      This is not a tuning problem the same lever can fix by degree; more
      exposure spent per cycle produces MORE wake-up events, each one a
      near-immediate lock-on risk, not fewer total risk-seconds.

   **The conclusion this repository should treat as settled, not
   re-attempted the same way:** canonical Minus 7's uniform, every-cycle
   suppression is not incidental -- it is *why* the strategy is safe. It
   works by never letting D approach the threshold `eq()` needs at all.
   Eviction requires the opposite precondition (D near-threshold) to even
   begin, so it cannot be bolted onto the low-D-always policy as an
   occasional extra beat; the two are mechanically opposed, not
   complementary, and this session's numbers are the proof, not a
   suspicion. `docs/strategy/MINUS-7-STRATEGY.md` §9 already said as much in
   prose (*"Take from it the eviction pattern and the metronome trick; keep
   the timer"* -- not both mechanisms in the same policy) and this is the
   measured confirmation of why.

   **If eviction is revisited, it needs a different shape than anything
   tried here:** not "spend more toward eviction," but a cycle type that
   tracks *when* an eviction happened (against `FOXY_RETURN_MIN`/`MAX`,
   500-999 frames) and schedules a rapid, targeted reset right at his
   predicted wake window, rather than waiting for the next routine ~5 s
   pulse. That needs cross-cycle state this policy does not carry today
   (nothing here remembers "an eviction happened N frames ago") and is
   real, unstarted scope -- not a parameter to sweep further.

   Both `tools/hidpilottest.mjs` and `tools/device/recipe.mjs` are
   `git checkout --`-clean at `803feb3` after this; nothing from this
   investigation is left half-applied in the tracked files.

10. **NEW 2026-08-27, same session, real remaining promise (not a dead end
    like eviction): audio-confirmed BB departure, in the fast simulator
    only, no device involved.** `48 of 69 (70%) of night 6's Foxy deaths are
    BB-chained` (measured: a Foxy death within 30 s of a BB walk-in). The
    walk-in itself was traced to one frame: the response macro's mask-off
    (`off = b + s(5.02) + phaseMargin(900ms)`) landed **33 ms before** BB's
    5th mask-tick (`VENT_MASK_TICKS=5`, `bbLeave()`), so the monitor raised
    while he was still `inOpening` and `onCamsUp()` walked him inside --
    which then permanently disables the hall-light Foxy-reset for as long as
    he stays there (`hallLightOn` requires `!bb.inside`, already documented
    above). `phaseMargin` is a *guess padded for the worst case* because the
    policy cannot see the game's 1-second tick phase; `bbLeave()` itself
    emits a real, sourced bang the instant he actually leaves (same cue as
    every other vent-bang, `THUD_SAMPLE`) -- `tools/device/bb-cue-state.mjs`
    already anticipated exactly this ("The departure bang can arrive early
    ... without its timestamp the full-duration recovery deadline is
    unknowable"). Building `off` from that bang's real timestamp instead of
    a fixed guess is a fundamentally different, better-motivated lever than
    anything else tried tonight -- it does not fight an existing safety
    mechanism the way eviction does.

    **First measurement was wrong, and the correction matters more than the
    original claim -- this is its own "numbers need their control" case.**
    A hand-rolled `replay()` variant (scratch file, not a tracked-file
    change -- shipped code untouched throughout) hooked `sim.events` for
    `{type:'vent-bang', data:{who:'bb', leaving:true}}` and anchored `off`
    to `bangEvent.f + audioLatencyMs` instead of the fixed formula. First
    pass reported Foxy deaths on night 6 falling from 69/300 to 7-12/300 --
    but that number was never checked against a control. Adding one (the
    same scaffolding with the bang trigger effectively disabled, which
    *must* reproduce vanilla `replay()`'s numbers almost exactly if the
    harness is sound) found it did not: 44/100 vs vanilla's 68/100 survived,
    a real bug, not audio-related. Cause: the fallback path recomputed
    `off` as `b + s(5.02) + phaseMargin` in raw milliseconds instead of
    reading the actual frame-quantized offset baked into `plan.attack`'s
    own emitted text (`+5857 ms`, not the ~5920 ms the approximation
    produced) -- a few frames of drift per cycle that compounded into a
    fully diverged run over 420 s. Fixed by extracting `plan.attack`'s real
    offset once (`+plan.attack[2].split(' ')[0]`) and using it for both the
    deadline and the post-bang re-anchor; sanity check afterward: 171/300 vs
    vanilla's 161/300 (small residual gap from independent-rounding noise
    in the hand-rolled `parse()`, not a logic bug -- acceptable for this
    prototype's purpose).

    **With the bug fixed, the honest numbers are far weaker than first
    reported.** Night 6, swept `audioLatencyMs` 50/100/200/300 ms (all
    unmeasured placeholders -- see below): survived 34-50/300 across the
    sweep, against baseline's 161/300. Foxy deaths did drop, but only
    modestly (69 -> ~54-58, roughly 20%, not 69 -> 7-12) -- and
    Withered-character inside-office deaths rose sharply enough (Withered
    Chica 72-83/300 alone, Withered Freddy 55-67/300) to make every tested
    configuration a net loss, not a near-win. The mechanism insight from the
    corrected run stands even though the first number was wrong: BB→Foxy
    chaining is real and the bang-anchoring idea does reduce it somewhat,
    but the naive implementation (waiting for the bang delays whatever comes
    after it, and nothing can be pressed while masked, so the wait's length
    is paid entirely in CAM 10/04/07 stun-coverage risk) costs more than it
    saves as built.

    **Not a dead end -- an unfinished design, now correctly scoped smaller
    than first thought.** The fix is not another deadline tweak: it is
    decoupling the CAM 10/04/07 stun-refresh from the bang-wait so the
    wait's length stops being paid in stun-coverage risk. Concretely
    unexplored:
    - Does the *previous* cycle's own trailing sweep have slack to move
      later specifically ahead of an anticipated attack branch, the same
      kind of budget accounting `assertStunCoverage` already does in
      `recipe.mjs` (item 8 above) -- paid for by knowing the wait is usually
      short (audio-informed), not by a blind worst case?
    - Is there a way to keep a minimal camera presence (even briefly)
      separate from the masked block, exploiting some other room in the
      engine's input rules not yet checked?
    - The real audio latency (package 3 of `plans/08-audio-cue-controller.md`)
      is still unmeasured -- `close→MISS latency cannot be observed, because
      completeIfExpired is only reached from accept() or a RESULT poll` per
      that plan's own status. 50-300 ms here are placeholders swept for
      sensitivity, not numbers to build on, and the sweep shows the result
      is NOT latency-sensitive in this range (34-50/300 throughout) -- the
      stun-coverage cost dominates regardless of how fast detection is,
      which is itself useful: fixing detection latency alone will not save
      this design without also fixing the stun-refresh coupling.
    - This also needs the cue-helper's own remaining defects closed first
      (`plans/08-audio-cue-controller.md`'s open packages 2/3/5/6) before
      ANY of this could run on a real device -- this finding is
      simulator-only, and deliberately so per this session's own
      instruction to check the simulator before the device.

    **Process lesson worth keeping alongside the technical one:** the first
    (wrong, dramatic) number was reported to the user before it was
    controlled. It should have been checked against the disabled-trigger
    case immediately, the same reflex this repository already documents
    elsewhere ("Numbers need their control"). Caught and corrected the same
    session, but the corrected number is the one that belongs in anyone's
    memory of this finding, not the first one.

    Scratch prototype (session-local, not preserved in the repo -- re-derive
    from this description): `.../scratchpad/audio_replay_module.mjs`
    (the `audioReplay()` function) and `.../scratchpad/final_check.mjs`
    (the sanity check + latency sweep that produced the corrected numbers).
    (session-local temp path, not preserved in the repo -- re-derive from
    this description rather than hunting for the file).


11. **NEW 2026-08-27, later session, same standing goal (item 9). No lever
    shipped; the schedule was found to already be perfect and the gap is
    entirely a robustness-model question. Reverted clean, documented here.**

    **The headline: the emitted device plan replays 400/400 = 100% on every
    night 1-7 with zero human-slack jitter** (`replay(plan, {night, seed})`
    over seeds 1..400, no `jitterPlan`). Night 7 included. The whole sub-70
    ladder -- n2 63%, n5 59%, n6 51%, n7 27% at ±60 ms iid over 400 seeds --
    is produced by `human-gate.mjs`'s jitter model, not by anything the
    schedule does wrong. Item 9's "deterministic replay walks BB inside
    0/1636" is the same fact seen narrowly; stated plainly, **the Minus 7
    device schedule is correct on all seven nights and the open problem is
    slack-tolerance of the Foxy resets, nothing else.**

    **A specific fragility, and why it cannot be widened.** The attack
    cycle's post-mask Foxy reset is `hold(off + s(0.25), hallPulse, 'light')`
    with `off` the mask-off tap. `s(0.25)` = 15 frames = **exactly
    `MASK_ANIM_OFF`** (`src/config.js:487`). `hallLightOn` needs
    `maskFullyOff` (`engine.js:181`), so with each row taking an independent
    ±60 ms draw the hall lands `0.25 ± 0.13 s` after the mask-off's own
    `±0.06 s` -- inside the 0.25 s animation on roughly half the draws, and
    resets nothing. `leftClear` documents this exact trap for its own early
    slot. The obvious fix (delay the hall past the animation) is blocked: the
    sweep at `off + s(0.45)` is hard-pinned by the 400-frame Withered stun
    budget -- measured, pushing it 7 frames (`off+0.45 -> off+0.54`)
    collapses nights 5-7 to inside-office (Withered Chica/Freddy) at
    100-160/300. Same wall item 8 hit from the other side.

    **A pre-read reset works mechanically but is blocked by Golden Freddy.**
    `lightHeld` and `ventLightL` are independent, so a hall pulse fired
    *during* the read (while the vent light is held, monitor down, mask off)
    is a valid Foxy reset and lands ~0.3 s before the prophylactic mask --
    entering the attack cycle's masked hold at D≈0 instead of D≈3, which is
    the masked-span 5 s check (n6/n7's dominant Foxy lock). But: (a) any
    GF-clear mask blip ahead of it delays the read past the sourced 45-frame
    office-defense fuse and Withered/Toy office entries explode; (b) a naked
    flash kills outright on Golden Freddy (`onLightPress`, `engine.js:274`),
    and GF spawns (g336: monitor fully up on a 5 s check) at the attack
    cycle's monitor-up recovery check ~1 per seed on Night 7. Suppressing
    that spawn needs a monitor-down beat in the attack cycle's tail, which
    re-opens the same wind/stun budget the reset needed.

    **The opening has no Golden Freddy clear at all** -- unlike every steady
    cycle, whose prophylactic mask clears him. Adding a monitor-down mask
    flick straddling the frame-300 check looked like a +4-8 point win on
    every night at 300-800 seeds. **At 1200 seeds it is gate-neutral to
    slightly negative** (n6 673→646, n2 ~801, n7 ~326 -- all inside binomial
    noise). This is the item-9-style trap again at the iteration level: at
    p≈0.55 the 2σ interval over 400 seeds is ±10 points, so a 300-800 seed
    A/B measures the block, not the rate. Every apparent win this session
    evaporated at 1200 seeds. **Do not accept a Minus 7 ladder change on
    under ~1200 seeds.**

    **Conclusion, consistent with items 8-10:** the schedule is right, the
    remaining nights are lost to iid-jitter fragility in a reset that is
    geometrically wedged (mask animation on one side, Withered stun budget on
    the other), and `human-gate.mjs`'s own comment already flags iid as the
    wrong shape ("humans clear at per-step error the iid model calls fatal";
    correlated per-step bands pending). Under a rough correlated model
    (one shared per-cycle draw + a small iid term, 90% shared) the same
    unchanged plans sit at n2 71, n5 64, n6 64, n7 41 -- still not 70
    everywhere, but the gap is a model artifact as much as a schedule one.
    The real levers are item 10's bang-anchored `off` (decoupled from the
    stun refresh) and item 8's "new device time" -- not another timing sweep
    on the current geometry.

    **Also found: `tools/strategysearch.mjs` is stale and throws on start** --
    `buildCycle(TARGET_CAMS) no longer reproduces DEFAULT_CYCLE` (line 77).
    `DEFAULT_CYCLE` was retimed 2026-08-24 for the post-mask flash lockout and
    `strategysearch`'s own `buildCycle` was not brought forward; `cyclesearch.mjs`
    stayed in sync (it asserts `genCycle(KNOBS0) === DEFAULT_CYCLE` and passes).
    Neither search touches the device route anyway (both operate on
    `bbtest.mjs`'s abstract reactive cycle, not `hidpilottest`/`recipe.mjs`),
    so this did not block item 11; noting it so a future session does not
    rediscover the crash. **Fixed in the plan-16 work below** (`strategysearch`
    now shares `cyclesearch`'s `genCycle`).

12. **NEW 2026-08-27: `plans/16-constrained-policy-search.md` opened and pkgs
    1-3 built.** The structured vehicle for the standing goal (item 9), after
    items 8-11 exhausted hand-tuning. See that plan's progress log for detail;
    the two things a cold session needs from here:

    - **`human-gate.mjs` now takes a slack `shape`** (`iid` default, `common`,
      `correlated`). Under `correlated` -- which `human-gate.mjs`'s own header
      says is the right shape -- the **unchanged 803feb3 plan** is n2 ~70,
      n5 ~63, n6 ~62, n7 ~33, versus iid's 66/62/54/26. Less fragile than iid
      claims, but n5/n6/n7 still miss 70 with no change.
    - **`tools/minus7/paramsearch.mjs`** is the search: dominance-pruned beam
      over `hidpilottest.mjs` `SEARCH_KNOBS` (all default-inert), evaluated
      `recipe.build -> devicePlan -> modelGate`, 1200-seed frontier admission.

    **Closed 2026-08-27, all measured, all in plan 16's progress log.** The
    constrained timing space is exhausted and every lever is a hard wall:
    (a) the masked-span Foxy decoupling is geometrically impossible -- pushing
    `off` +50 ms drops n5/n6/n7 to 46/45/26 correlated; (b) `openGfFlick`
    collapses correlated to a GF massacre (40/38/3); (c) the pre-read hall
    evicts Foxy (n6/n7 -> 0); (d) the one gate-improving candidate
    (`attackSweepDeltaMs:-17`) is a **gate-overfit** -- +Pareto against
    `human-gate.mjs` (readLatency 550) but 0-1/500 on `hidpilot n6 target`
    (readLatency 480); (e) the **shorter (7 s / variable-length) attack
    cycle** collapses monotonically below 10 s. `attackWindowMs` is now a
    threaded parameter (`hidpilottest.mjs` `attackWindow` -> `recipe.build`
    -> `replay` via the `#cycle attack N` header, default 10000 = every plan
    byte-identical) and `tools/minus7/cyclelengthsearch.mjs` sweeps it
    against every pinned actuator config. Gate n5/n6/n7 correlated goes
    **63/63/33 at 10 s -> 37/0/0 at 9 s -> 0/0/0 at 7 s**, and `n6target`
    (readLatency 480) goes **100 -> 0 by 8 s**; 10 s exactly reproduces
    `803feb3` (the regression fixture). There is no basin at 7 s -- it is a
    smooth cliff, and the failure mass moves from Foxy toward Golden Freddy
    and inside-office as W shrinks, which is the phase-lock signature.
    **Cause:** a 10 s attack cycle is exactly two 5 s movement-opportunity
    grid periods (`MO_FRAMES` x 2), so it preserves the clear cycle's
    monitor-down 5 s-check phase -- which is what keeps Golden Freddy from
    spawning (g336) and the Foxy checks landing at low D. Any other length
    permanently shifts that phase after the first BB response; the clear
    cycles never re-align. 5 s is too short for the 5-tick BB hold + reset +
    sweep; 15 s is worse. **The 10 s attack cycle is load-bearing, not a
    tunable.**

    **Conclusion: nights 5/6/7 to 70% need NEW DEVICE TIME**, not a
    scheduling change. The purely-simulator search is done; the next step is
    item 13.

    **Extended and closed 2026-08-27 (`740f5b0`), and the "need new device
    time" conclusion is now precise.** Two more levers were built and gated at
    1200 seeds:
    - **The sweep geometry** (`tools/minus7/geometrysearch.mjs`; the LIGHT_AFTER
      breakthrough lets `devicePlan` emit the sweep NARROW, which re-phases the
      cycle). Every `dev≈62` geometry lifts min(n2-6) 59→70 correlated and
      holds at the 480 latch, but it is a **phase-lock spike** — the ±ms
      neighbourhood collapses to ~46, it fails the iid bar (n6 ~62), and it
      drops n7 to 13-18. Marginal; pending device validation of the ~4 ms
      basin. `paramsearch.mjs` now takes a `--geom` context so timing knobs
      can search on top of a fixed geometry.
    - **Item 10, bang-anchored attack raise** (`SEARCH_KNOBS.attackBangGateMs`,
      default 0). At a **perfect instant bang oracle** it clears n2-n6 to ~90%
      on both shapes; at **100 ms bang-detection latency it is worse than
      blind**; at 200 ms near-total collapse. The recovery sweep is pinned to
      the cycle end, so acting on the bang late drags the sweep late and toy
      coverage collapses. Recorded negative. n7 barely moves (its Foxy deaths
      are not in the attack cycle).

    So the shape of "new device time" is now specific: **either** a real
    actuator that holds a ~4 ms sweep-spacing basin under its own jitter,
    **or** a <~50 ms BB-specific departure-bang detector (which would be worth
    ~+30 points on n2-n6 — this makes plan 15 / plan 08 detection latency a
    *survival* lever).

    **n7 update (plan 16 pkg 5, `tools/minus7/n7probe.mjs`): the opener is
    refuted, not a factor.** A perfect opening Foxy reset moves n7 by 0.0.
    n7's Foxy deaths are the **clear** cycle's two resets (b+1.38, b+3.10)
    missing under jitter — perfect execution of just those two → n7 33 → 61 %,
    and the remaining 39 % is office entries (the geometry lever). So n7 → 70 %
    needs a jitter-robust *second* clear-cycle Foxy reset (which pkg 4 shows
    cannot clear `MASK_ANIM_OFF` without the 400-frame sweep pin — new device
    time) plus the tight geometry. Not an opener change, and not the
    attack-cycle geometry item 10 targets.

13. **NEXT STEP -- device-actuator overhead, the only thing item 9 is now
    blocked on.** The masked-span Foxy check on nights 6/7 (and the eviction
    runaway on 5) is fatal because the attack cycle has no room for an extra
    hall reset: a monitor-down -> hall -> monitor-up beat costs ~600-900 ms
    (`MONITOR_ANIM_DOWN` 22 fr + `MONITOR_ANIM_UP` 12 fr + a ~130 ms hall
    contact + two Fusion-poll gaps), and the measured phone leaves only
    ~680 ms of discretionary time per 5 s cycle (`HID-MULTITOUCH.md`). The
    sweep, the wind and the 5-tick mask are all load-bearing, so the
    milliseconds are not there to take.

    **What "new device time" concretely means, in decreasing order of
    likely payoff:**
    - **A cheaper Foxy reset.** The reset needs `hallLightOn`, which needs
      the monitor NOT up (`hallView`) and the mask fully off. The ~370 ms
      monitor-down + ~200 ms monitor-up animation is most of the cost. Is
      there a shorter path to `hallView` on the phone -- e.g. the monitor
      already mid-lower from the cycle's own read, so the reset rides an
      animation the schedule was already paying for? `recipe.mjs`'s
      `foldMaskRaise` / `clearTheRaise` already do this kind of accounting
      for the mask-off + raise seam; the question is whether the hall reset
      can be folded into the read's own monitor-down the same way.
    - **A faster actuator.** The HID route's per-macro wall-time is one
      boundary draw plus `hid_delay` spacing (`HID-MULTITOUCH.md`
      "Answered: 120 ms spacing"). If the inter-press floor can go below
      133 ms measured on the phone (the 2026-08-27 literature survey found
      nothing in Android/evdev/uinput imposing one -- `HID-MULTITOUCH.md`
      "Input injection and sequential budgets"), the sweep tightens and
      frees slack for the reset.
    - **A dual-purpose input.** The hall reset and the recovery sweep both
      raise the monitor. `leftAttack` already queues the hall press before
      the simultaneous monitor raise so it "resets Foxy during the raise
      frame". Can a SECOND reset be folded into the recovery sweep's raise
      the same way, at the cost of only the hall contact?

    **How to measure it:** the levers above are all things the exact engine
    can price -- `recipe.mjs`'s budget accounting, `cyclelengthsearch.mjs`'s
    per-actuator-config scoring, and a real device trace (`grade-run.sh`,
    `test-hid-trace.mjs`) for the inter-press floor. The one thing this must
    NOT do is shrink a simulated delay the phone cannot actually hit --
    `ANDROID-SOURCE-STATUS.md` "The simulator prices nothing". Any candidate
    that clears the sub-70 nights only by assuming a faster phone than the
    HID trace shows is a simulator-only result, not a route.

    **CORRECTED 2026-08-27 (two sessions, `66` and `55`). This item's
    framing was partly wrong and partly right: the *reset cost* it computes
    is mostly game constants, and the *read-capture cost* moves nothing --
    but there IS one device number that moves the nights, and this item never
    isolated it. The paragraphs above are kept; the specifics change.**

    - **Two of the three cited "device times" are sourced *game* constants.**
      `MONITOR_ANIM_DOWN` (367 ms) + `MONITOR_ANIM_UP` (204 ms) = 571 ms of
      the quoted 600-900 ms reset cost is the decompiled Android build-296
      animation bank (`src/config.js:481`, `SOURCED`). No actuator and no
      capture method moves it; only folding the reset into an animation the
      schedule already pays (lever 1) can.

    - **The read-capture cost moves nothing.** Sweeping `readLatencyMs`
      550 -> 100 and `classifyMs` 250 -> 20 through `replay()` /
      `human-gate.mjs` moves n5/n6/n7 by **< 1 point** (session `66`, 400-600
      seeds). `hidpilottest.run` without `deviceActuator` is 100% at every
      read latency; with it, 0% at every read latency (the unmodeled
      forcedown cascade, not the read). So the 225 ms `screencap` BB read is
      real device cost but not a survival lever -- the `plans/15` migration
      of it to the cue helper's ~59 ms `GRID` path is architecture and
      honesty, not a night fix.

    - **The sweep selection spacing IS the lever, and 113 ms is a sweet
      spot.** Session `55`'s `tools/minus7/devicetimesearch.mjs` (see
      `plans/16` progress log) isolated every device number and found only
      this one moves the ladder. Emitted spacing 133 -> 123 -> 113 ms
      (`sweepSlotMs` 120/110/100): **n2 68 -> 75, n5 62 -> 70 -> 73,
      n6 61 -> 68 -> 72, and n7 34 -> 39 -> 43** (its best-ever). The pinned
      `n6target` configs hold 500/500. It only breaks *below* 113: at 103 ms
      n7 falls to 32 on a phase break. **The lever sits below the
      device-validated 133 ms floor** (`HID-MULTITOUCH.md`: 100 ms contact +
      one full released Fusion poll; the CAM-07 last-flash finding is exactly
      this boundary -- at 120 ms spacing the released interval is 20 ms
      against a 33 ms poll). So nights 2-6 to 70% is a **113 ms sweep
      actuator** -- lever 2 above, now priced -- not the reset cost this item
      leads with.

    - **Night 7 is still short at 113 ms (43), for reasons unrelated to
      spacing.** Tightening the sweep helps n7 monotonically down to 113;
      there is no 2-6-vs-7 tradeoff until 103 ms. n7's remaining gap is the
      jitter-shape fix and the bang-anchored reset -- see the N7 block under
      "Very next step".

    The `~680 ms free per cycle` figure is a steady-5 s-cycle number, and
    this item mis-applies it to the 10 s attack cycle where the monitor
    animations it counts as "reset cost" are already spent on the read and
    recovery.


**Legibility/maintainability/coherence pass, closed 2026-08-26 (`084a8d7`..`fb68baf`).**
Nothing from it is outstanding and the engine suite is green on `222278d`. What
a later session needs to know:

- **`tools/device/trial-minus7.sh` is now `tools/device/trial.sh`**, and the
  1619-line heredoc that runs on the phone is assembled from named parts under
  `tools/device/trial/` (`10-minus7-sweep.sh` is the strategy,
  `08-bb-threat-response.sh` is the Balloon Boy read). The assembled text is
  byte-identical to the old heredoc, so nothing the device runs changed. **Cite
  driver code by part name, not by `trial.sh:NNNN`** — three citations in this
  file were already dangling and are re-pointed.
- **Four gates now read the assembled driver rather than grepping the runner**,
  which exposed six checks asserting device-side facts against host text. The
  host/device boundary is visible for the first time; keep it that way.
- **New gates, all in `tools/test.mjs`:** `trial assembly`, `screen map`,
  `docs`, plus `screencheck`, `select-adb` and `preflight`, which previously ran
  nowhere. `test-grade-run-coverage.mjs` now fails when a gate an exclusion
  *cites* does not exist or does not run.
- **Two things stay open and are deliberate, not forgotten.** `tools/device`
  remains physically flat (the taxonomy is machine-checked in the exclusion map
  instead; moving 83 files is not a surgical refactor). And the **Fusion
  touch-poll rate is asserted 30 Hz in eight places and measured never** — it
  had fallen out of both tracking documents, so it now lives in
  `HID-MULTITOUCH.md` §"Open: the tick rate is asserted twice and measured
  never". The recording-rate half is closed: `grade-run.sh` probes with
  `ffprobe` and refuses a capture that is not the rate its graders assume.
- **What kills Night 1, measured:** in the simulator only the Puppet, 7/1200,
  and they are the **same seven seeds on every night** — a fixed human-slack
  pattern, not night difficulty. Jitter never changes a hold's length, only
  where it lands, so it is wind *timing* rather than wind budget. On the phone
  Night 1 is cleared and the near-miss was desync, absorbed by 4192 frames of
  flashlight headroom that Nights 5-6 do not have.

The live hardware thread below is the next action.


**Live hardware thread, 2026-08-26 22:05 BRT -- the cue helper's sensor was
mischaracterised, and one anchor survives it.** Measured on the phone: the
`20x9` grid **point-samples ~180 source pixels**; it is not a small image, and
`ONE-PIXEL-VISION.md` §3 said the opposite (`a1abafa`). So the lit camera
button is visible to the helper on **7 of 12** cameras -- 194 or 0-10, nothing
between -- and on the five it misses the office scores *higher*, inverting the
classifier. Mean luma overlaps too. The **near-grey cell count over the whole
grid** separates office 142-145 from monitor-up 173-180 and is now emitted as
`grey=` in the snapshot (`ScreenStats`, gated host-side by `ScreenStatsTest`).

The APK is **installed and `grey=178` reads live**. The resync verification now
decides on it (`cams_still_up()`, gated by `test-plan-interpreter.sh`): the old
`luma >= 180` arm was calibrated over 1818 samples of night 6-34, whose route
sits on CAM 11 all night, and **cleared 180 on CAM 11 alone** -- this route
selects cams 10, 04, 07 and 11, reading 0, 106, 47 and 226. It was blind on
three of the four cameras a desync can leave selected.

**Corrected within the hour:** this first said that is "why night 1's single
resync failed". It is not. `n1-full-1640` ran with **`CUE_HELPER=0`** -- its
session manifest records it -- so `CUE_PORT` was `-` and the verification
branch never ran at all. The luma blindness is measured and real; it did not
cause that failure. **Any rerun must set `CUE_HELPER=1`**, or it repeats the
same blind run and records no `grey=` either.

**RETRACTED 2026-08-26, same evening: `grey=` cannot verify the resync and no
threshold through it can.** The office band 142-145 came from five idle
captures on a parked device. Graded against the cleared run's own office reads
(`captures/n1-grey-2202-run.log`, 77 samples of `cue[... grey=N ...]`), office
grey runs **138-180, median 151, with 21 of 77 at or above 159** -- 16 of them
a confident `empty` (an office frame by construction) and 5 on frames where
`$CHECKER match` itself answered `cams=down`. The office reaches the top of the
monitor-up band; the populations overlap completely. Every one of those 21
would have sent the retry press into a monitor that was already down, *raising*
it -- the exact desync the corrector exists to repair.

`cams_still_up()` now re-asks the **device-graded detector that fired**: the
same `$CHECKER match` on the same region, hoisted into `CUE_MONITOR_ROI` so the
recovery cannot drift from the detection (`test-plan-interpreter.sh` pins the
single definition, both uses, and that no reading which is not a positive
`match` reports "still up"). It costs a screencap (~225 ms) that only this path
can pay: it already waits `MONITOR_ANIM_DOWN` (367 ms) for the flip.

`grey=` is still logged and now decides nothing. The 77-sample distribution is
the first *live* population it has, and it is why the calibration below is not
merely incomplete but was measured on the wrong device state. Still unsampled,
and still the reason to keep logging it: an office with an animatronic present,
and the blackout. The mask reads 175, inside the monitor-up band.

**Landed 2026-08-26 21:20 BRT, and it contradicts something the repository
said:** the **double-camera glitch transfers to Android**. A retained classifier
frame from the cleared Night 1 (`n1-full-1640`, runner clock 92879 ms) shows CAM
04 and CAM 07 lit at once; re-read against the dump, the camera selection is two
fields (`viewing` counter 55 / `your view` marker 126) and the monitor-raise
restore (g1 → g2) writes only the first, from a `last viewed` that g263 samples
every 200 ms. Groups 450-457 read the marker for *who* is stunned and `viewing`
for the `<> 8 / <> 9 / <> 11` immunity, so the exclusions are bypassable. Four
documents plus `minus2test.mjs`'s header said the opposite and are corrected in
place. **Nothing is modelled or measured**: the engine has no two-camera state,
no glitch-aware probe exists, and nobody has tried to arm it on the phone —
that is plan 02's new package 2a. Full sourcing and controls:
`docs/android/ANDROID-SOURCE-STATUS.md` §"2026-08-26: the double-camera glitch
*does* transfer". **This does not change the hardware thread below**, which is
still the live next action.

**Resume point, written 2026-08-26 20:01 BRT.** Four scoped changes landed on
`master` this pass:

- `e04924c` makes the session producer use an OS monotonic clock shared across
  its separate Python processes. In this environment `time.monotonic()` is
  process-relative; it produced negative, out-of-order manifest events. The
  end-to-end session producer gate now passes.
- `98eb7ff` removes the runner's duplicate sweep-light constant and incomplete
  coordinate resolver, and structurally gates every remaining HID timestamp
  against a freshly frozen value.
- `d5cb725` resolves the deliberately red cycle-seam check. The emitted sweep
  ends on the nominal boundary, but the runner delivers the next anchor after
  a drift-aware **33 ms** released gap. The plan did not need to move.
- `ff8fc00` adds and gates a generic, fractional intro-card classifier. It says
  `intro`, never guesses the night ordinal. On local real evidence it accepts
  5/5 Night 1 card frames, rejects 21/21 non-card frames and all 17/17 6 AM
  frames, and the cleared Night 1 timelines from intro through a positive 6 AM.

**Closed 2026-08-26: the source pass landed and the gate is green again.**
This block said the working tree was dirty with an in-flight marker-123 source
pass and that `simtest` was failing on W. Bonnie's hall-light B tail. That pass
is committed as `47dcd1b` ("Split the reaction window from the committed
attack"), the tree is clean, and `node tools/test.mjs --engine` passes every
check. Nothing is blocked on it, and Plan 13's next gate no longer waits on a
reconciliation that already happened.

*Kept rather than deleted, because the staleness is the lesson.* This paragraph
is the first thing a cold session reads, and it stood for hours after the
condition it describes had cleared — sending the next session to redo finished
work and to hold off the phone for a red suite that was green. CLAUDE.md's rule
is that the "Very next step" is re-pointed *the moment* it is finished, not at
the end of a session that may not have an end.

**The hardware ladder is Night 2, not Night 6.** The live title observer reads
`items=continue,newGame`, so Sixth Night is not unlocked. The device owner
directly confirmed the open game's Continue label says **Night 2**. Once the
suite is green, run the bounded fork-free-clock check with a trace:

```sh
BB_LEFT_MODEL=captures/screencheck/bb-left/models/runtime-gh.scm \
NIGHT=continue CALIBRATION_STORY_NIGHT=2 STORY_CURSOR_OBSERVED=2 \
HID_TRACE_RUN=1 GRADE_RUN=1 \
tools/device/trial.sh n2-clock-cycle-20260826 1
```

If its real-cycle log proves the clock and delivered seam, attempt the full
Night 2 immediately with a fresh run name and `90` cycles. A clear must be
proved by positive 6 AM **and** the title/save cursor advancing to Night 3.

# NIGHT 1 IS CLEARED ON THE DEVICE.

The first full-night stock-device clear this project has recorded. Run
`n1-full-1640`, 2026-08-26.

**The proof is the save, not a classifier.** The label under `Continue` read
**Night 1** before the run — checked twice at full resolution — and reads
**Night 2** after it. The device owner watched the 6 AM screen. The driver
printed `night6-left finished: 74 cycles` at **417.9 s** of a 420 s night, and
the capture saved as `n1-full-1640.mp4`, not `-aborted`. Re-graded after the
fix below, `grade-night.py` reports **420.2 s alive**.

**The save cursor now sits at Night 2**, so a repeat of this command plays
Night 2, not Night 1. `STORY_CURSOR_OBSERVED` must be set to what is actually
on screen; it is checked against the requested night and refuses on mismatch.

```sh
BB_LEFT_MODEL=captures/screencheck/bb-left/models/runtime-gh.scm \
NIGHT=continue CALIBRATION_STORY_NIGHT=2 STORY_CURSOR_OBSERVED=2 \
tools/device/trial.sh NAME 90
```

**Read this before celebrating it.** The run desynced roughly **eight times and
the runner noticed once**, and every one of its 9 "Balloon Boy responses" was
false — BB's AI is 0 on Night 1 and he cannot act. Night 1 is the easiest night
in the game and has 4192 frames of flashlight headroom; the same faults on
Night 5 or 6, which have 192, are unlikely to be survivable. **This is a floor,
not a ceiling.**

**No package closed.** The headline stays 29/89 (the denominator is 89; this line read 29/88 until 2026-08-26 while the header two screens up read 29 of 89, and the dashboard table sums to 89). Plan 13 package 3 is advanced,
not closed: 6 AM and the generic intro are now classified, but the intro's night
ordinal, minigames, save advancement, committed real holdouts, and media-PTS ↔
runner-clock alignment remain open. An honest percentage that does not move is
worth more than a flattering one.

### The single most important thing learned today

**Night 6 was refused, and then the refusal was fixed at its cause.** The gate
was passing on its seed block: `GATE_RUNS` was 100, which cannot measure a rate
near its own bar, and over 1200 seeds the shipped plan was 449/1200 = 37.4%
against a 40% contract. It was correctly refused.

The cause turned out to be a lost input, not a bad bar. The clear branch's first
Foxy reset sat in a standalone hall slot that landed inside mask-off and did
nothing at the measured read latency; carrying that contact on the existing
post-read `maskraise` row restores it without moving the read, the sweep, or the
measured 180 ms mask→monitor seam. **Re-verified independently this session, on
the same 1200 seeds: all six nights now clear the unchanged 40% contract** —
99.1, 68.9, 78.8, 73.2, 63.9 and **56.1** per cent. The bar never moved.

**The margin was bought with flashlight, and that bill is not recorded anywhere
else.** The restored contact is lit, so light spend went 2148 → 2808 frames on
every night. Nights 1–4 absorb it; **Nights 5 and 6 fall from 852 to 192 frames
of headroom**, about 3.2 s of light against a 3000-frame budget. The two nights
that most need slack now have the least. `test-night-matrix.mjs` fails the suite
if headroom reaches zero, but nothing warns on approach.

### The next concrete action

**Superseded by the resume point at the top of this file.** This section used
to call for Night 6, but the live title now proves Sixth Night is not unlocked
and the device owner read the Continue cursor as Night 2. The fork-free-clock
question remains first, now as a bounded Night 2 cycle; a passing result is
followed by a full graded Night 2 attempt.

### Closed and committed this session

Each of these was an "Open" item here as recently as this morning:

- **A 6 AM can now be recorded.** `screenrecord` no longer caps at 180 s. The
  runner probes the handset's `--help` for the advertised unlimited mode and
  uses `--time-limit 0`; a device that does not advertise it is **refused, not
  degraded**, because a plausible-looking 180 s artifact of a 420 s night is
  worse than no video (`trial.sh`, `screenrecord_time_limit`).
- **Grading is no longer success-only.** `grade-run.sh` runs on every exit path,
  so the run that failed is no longer the run that is never graded. The runner's
  own exit status is preserved.
- **The driver's stdout/stderr is durable.** It tees to `$OUT-run.log` and is
  declared in the session manifest as operational metadata with
  `clock_domain=null` — honest, because the stream mixes runner-relative decision
  lines with transport errors that carry no clock.
- **A real 32-bit wrap bug in the remote shell is fixed.** Android's mksh does
  signed 32-bit arithmetic and epoch milliseconds are ~1.8e12, so the epoch
  centring arithmetic wrapped; `epoch_sub_ms`/`epoch_diff_ms` keep the value as a
  string and calculate only on its parts. The interpreter test pins the exact
  value that wrapped in the first real attempt.
- **`desync-scan.py` can no longer invent an alignment.** `align()` refuses a
  trace with no monitor presses, no confident edges, zero matches, or an optimum
  on a search boundary, and `scan()` reports `UNKNOWN` and exits before
  attributing anything.

### External check, 2026-08-26: is this architecture normal?

Surveyed, because nobody had. **It is not normal — it is near-unprecedented, and
the one precedent is instructive rather than discouraging.** Full write-up in
`HID-MULTITOUCH.md` §"Prior art". Three things that change what to work on:

- **`hid-multi` is on the right side of the only documented detection line.**
  Android stamps injected input with `deviceId = -1` *by deliberate design*
  (AOSP `InputDispatcher.cpp`), and per a scrcpy contributor the only mechanisms
  that do not are AOA HID and uinput. Every mainstream alternative — `adb shell
  input`, MaaTouch, scrcpy's sdk mode, Airtest maxtouch, minitouch — is
  detectable; this route is not. That was not why it was chosen, and it is a
  second reason to keep it.
- **The one prior attempt died of something we do not use.** `phisap` drove an
  unrooted handset in hard real time via **AOAv2** and broke on Android 13 on
  vendor USB-gadget bugs. This project runs `/system/bin/hid`, a **uhid** device
  created on the phone — verified, not assumed — so it gets the same identity
  property without the dependency that killed the precedent.
- **Its author's unsolved problem was ours.** He shipped a working 1 kHz HID
  touchscreen and then started his timer *by having a human press space*,
  because he could not read the song's progress without root. His rule — "Full
  Combo but not All-Perfect always means the timer sync is off, never the plan"
  — is this repository's graded-interval rule in miniature. **Actuation was
  never the bottleneck for the only person who tried this before.** The cue
  helper and the epoch latch are the parts of this project with no prior art,
  and today's 32-bit T0 wrap says that is still where the risk lives.

**Both surveys are retained in full** under
[`docs/research/`](../docs/research/README.md), which now indexes all four
reports with what each answers and where it was distilled to. An `UNKNOWN` in
them is a result, not a gap: it means the question was asked and the public
record does not answer it, so nobody needs to search again.

Also corroborated: 225 ms `screencap` sits where the literature says it should,
the 59 ms device-local read beats anything published for a physical handset, and
the ≥100 ms contact rule is Unity's own documented failure mode. And one honest
negative: **no case was found of any Android game detecting a bot by input
timing** — only by input identity. That does not license relaxing the human gate,
whose justification is evidential rather than ban-avoidance, but it does mean the
gate should stop being argued for on detection grounds.

### The stale claim that mattered most, corrected 2026-08-26

**`CLAUDE.md` was asserting a device limit the repository had withdrawn two days
earlier.** Its `--device-sweep` bullet said *"at the proven 240 ms spacing the
same route is 0/1000"*, and used it to argue the 267 ms three-camera sweep is
unproducible. But `HID-MULTITOUCH.md` §"Answered: the phone accepts 120 ms
spacing (2026-08-24)" had already **withdrawn 240 ms as a measurement artifact**
— `camtrace.py` decoded at 30 fps and demanded a 100 ms stable run, so at 160 ms
every dwell reported as exactly the 0.10 s floor and read as a dropped
selection. Re-graded at the recording's native 60 fps, the same three probe runs
are **4/4 at 240, 160 and 120 ms**. Nothing about the input changed.

That page's own table prices the phase window by spacing: 240 ms → 2 frames
("not landable"), 160 ms → 6, **120 ms → 12 frames (200 ms)** against an ~80 ms
`DEVICE_EPOCH_LATCH` bracket. So the blocker it calls *singular* — the camera
actuator's inter-selection spacing — **was answered in the phone's favour.**

**Scope it honestly: this unlocks nothing new.** `DEVICE_SPACING_MS` is already
120 in `recipe.mjs`, `test-recipe.mjs` already gates against it, and the shipped
route already spends it. The engine absorbed the finding on the day it was made;
only the always-loaded instructions file lagged. What the correction prevents is
a *future* session reading CLAUDE.md, believing the sweep route is dead, and
re-deriving a conclusion the repository had already overturned — which is
precisely the cost this project's front page says it exists to stop.

A 2026-08-26 literature pass reached the same conclusion from the other side:
**nothing in Android, evdev, uinput, InputReader or InputDispatcher imposes any
inter-press floor.** AOSP's own synthesised swipe runs at 120 Hz; RERAN replays
raw event streams on real phones at 3.87 ms median. Full write-up in
`HID-MULTITOUCH.md` §"Input injection and sequential budgets", which also
corroborates three of our numbers, corrects two more, and names two silent
failure modes we have not guarded — the evdev ring overflowing to `SYN_DROPPED`
(whole-frame drop in `EventHub`), and the kernel dropping unchanged `EV_ABS`
after fuzz.

**The one with a lever attached:** on `screencap`'s path `sourceCrop` is
*ignored in source* and every layer is composited regardless of region, while
AOSP's own small-region sampler budgets **3 ms** for the same shape of work by
caching its buffer, filtering layers, and never leaving SurfaceFlinger. Our
59 ms for 180 pixels is ~20× that, which points at fixed per-read entry cost
rather than pixels.

### The cycle seam is resolved; the current red check is unrelated

The deliberately red `recipe` check was comparing the emitted plan's nominal
clock with the runner's delivered wall clock. The sweep does end exactly on the
nominal boundary, but `run_macro` waits through `rm_shift + FUSION_POLL_MS`
before writing the next anchor. That delivers **33 ms released**, clears the
HID auditor's 20 ms floor, and carries lateness forward rather than compressing
later seams. `test-recipe.mjs`, `test-runner-plan.mjs`, and the real shell
interpreter now prove the complete path.

The 4660 → 4640 counterfactual was still priced, 1200 seeds per cell. Under the
measured actuator both shipped and candidate were 0/1200 on Nights 5 and 6 for
an unrelated lateness cliff, with **zero seam drops** in roughly 1.25 million
sent actions. With lateness zeroed, both were 1200/1200. Moving the sweep offers
no seam benefit, so the recipe stays at 4660.

~~The suite is currently red only because of the separate uncommitted
marker-123 engine edits named in the top resume point.~~ **Stale as of
2026-08-26:** that source pass landed in `47dcd1b` and the engine suite is
green. The cycle boundary this section resolves was never the reason it was
red.

### Retracted 2026-08-26: the cycle-wrap seam was not the desync cause

Earlier today this dashboard named the cycle wrap-around as the prime suspect
for the cleared Night 1's ~8 desyncs: every cycle's last instruction ends
exactly on the next cycle's `0 tap monitor`, 0 ms released against the HID
auditor's 20 ms floor.

**The 0 ms is real in the emitted plan and irrelevant in delivery.** The runner
already compensates: the driver's `12-night-loop.sh` waits
`rm_base + rm_cursor + rm_shift + FUSION_POLL_MS`, holding the next anchor back
one Fusion poll (33 ms), and `test-runner-plan.mjs:223` pins that. Because the
wait is relative to `rm_shift`, a late macro moves the boundary with it instead
of compressing the seam. The delivered gap is 33 ms and legal.

So the sweep-shift variants priced against it — 20 ms free, 33 ms costing 3.5
points on night 6 — were pricing a fix for a defect the runner does not have.
Those figures stay on the record because they measure something real about
Foxy's tolerance, but they are not a desync fix.

**This is the second time this exact mistake has been made here.** The trace
auditor made it first, mistaking the nominal plan clock for wall-clock delivery,
and its zero-gap finding was retracted for the same reason. `test-recipe.mjs`
now checks the DELIVERED seam rather than the nominal one, which is the check
that would have caught both of us.

What caused the Night 1 desyncs is therefore **open again**. `HID_TRACE_RUN=1`
on the next graded run remains the way to attribute them, since only
`desync-scan.py` can line the sent trace against what the game did.

### Open, with what is known

- **The music box contradicts `src/config.js` and is not fixed.** Measured on
  Night 1: inert for the first ~133 s, then ~55 s full→empty, against a constant
  of 16.67 s that `recipe.mjs` states is the *Nights 6-7* rate. The per-night
  drain groups have not been located in the dump; the wind side is sourced
  (g652 sets 2000, g638/g643 add +5/tick, g645 snaps to 300). Do not change the
  constant until the drain is sourced.
- **Lifecycle package 3 is advanced, not closed.** A positive 6 AM is recognised
  by `run-timeline.py`, and the new fractional intro-card classifier is gated by
  a committed synthetic generator. Against local real media: intro 5/5,
  non-card 21/21 rejected, 6 AM 17/17 rejected as intro and accepted as 6 AM;
  `n1-full-1640` reports intro at 3.0–5.5 s and clear at 428.5 s. Still absent:
  minigame fixtures/classification, Night 2–6 intro evidence and ordinal
  recognition, a committed real holdout corpus, media-PTS ↔ runner-clock
  alignment, and save-advancement classification. Those gaps keep the package
  open.
- **The controller desyncs far more than it detects, and pan is the tell.**
  Measured on the cleared Night 1: 16 of 16 `empty` vent reads sit at 0–6 px of
  office pan, and 6 of 7 false `inside` reads at **64–178 px**, with the
  classifier's margin tracking pan monotonically (0 px → 19, 6 px → 20,
  displaced → 18, which is the `inside` boundary). Per the device owner,
  unexpected pan during a run *means* desync. So that run desynced roughly
  **eight times and the runner noticed once** — and its one correction failed:
  the resync at 93089 ms was followed five seconds later by a read that still
  photographed the Main Hall camera feed. Two consequences: every `inside` on
  that night was false (BB's AI is 0), and a panned office means every press in
  that cycle lands on coordinates calibrated for an unpanned one. Pan is a
  better desync detector than the luma check and is **unpriced inside the
  cycle** — a full-frame correlation, so price it before scheduling it.
  `ON-DEVICE-SCREEN-CHECKS.md` §"The left-opening classifier measures camera
  pan" has the frames and the method.
- **Nights 5 and 6 have 192 frames of flashlight headroom, down from 852.** The
  Night 6 route repair paid for its gate margin in light. Nothing warns as that
  approaches zero; `test-night-matrix.mjs` only fails once it crosses. Price any
  new lit observation against 192 frames, not against the old 852.
- **The live human floor is now off on the shipped route, and nothing replaced
  it for runtime presses.** `human_floor_check` returns early when
  `NIGHT6_LEFT=1` (`trial/05-press.sh`), because the model gate prices the
  emitted plan and the old scalar check aborted on the plan's own deliberate
  120/180 ms compound boundaries. That is defensible for *scheduled* presses.
  But the corrector's monitor-verify press in `light_down_at` is **not in the
  plan** — it is a runtime reaction — so on the shipped route it is now priced
  by nothing at all. In the modelled path it waits out `MONITOR_ANIM_DOWN`
  (367 ms) and clears the old 350 ms floor anyway — but **the margin is 50 ms**,
  measured: the corrective press lands at 400 ms against a 350 ms floor. So this
  is a missing check rather than a known-bad press, with less room than anyone
  had assumed. `test-plan-interpreter.sh` pins both arms of the bypass *and*
  that 400 ms gap, so shortening the corrector's wait by 51 ms now fails locally
  instead of on the phone. Pinning is not pricing: routing reactive presses
  through a check that knows they are unplanned needs the device in the loop,
  and was deliberately not attempted blind against the one gate-clean route.
- **The right vent costs ~570 ms of pan round trip** against ~680 ms of free
  cycle, and no schedule prices it. Plan 03 depends on it.
- **The Fusion touch-poll rate is asserted (30 Hz, eight places) and measured
  never**, while the engine runs at 60 FPS. Load-bearing in both directions:
  at 60 Hz the emitter's 33 ms gaps spend twice the budget they need against
  192 frames of Nights 5-6 headroom, and at 30 Hz the Night 7 phase island is
  not landable. **This item fell out of both tracking documents** — the audit
  filed it as a note deferring to this dashboard, and this dashboard stopped
  naming it — so it now lives in `HID-MULTITOUCH.md` §"Open: the tick rate is
  asserted twice and measured never", beside the constants it governs. The
  *recording* rate half is closed: `grade-run.sh` probes with `ffprobe` and
  refuses a capture that is not the 60 fps its graders assume.
- **`docs/ARCHITECTURE-AUDIT.md`** holds ten ranked findings. **1, 2, 4 and 7
  are resolved, and 8 is mostly resolved**; the rest are not. **This line said
  "1, 2 and 4" on 2026-08-26 and finding 2 was not in fact resolved** — the
  audit named four copies of the alive/dead predicate, there were five, and two
  of them still stated the rule. The worse one was `screenstate.py --adb-fast`,
  the *live* watchdog that decides whether the phone is in a night, which
  nothing had ever run. Both are ported and gated in `8a9925b`, and the audit
  now carries the correction in place. The dashboard was ahead of the code,
  which is the direction that costs most: a reader trusts "resolved" and stops
  looking. Finding 8 was the
  mission-critical one, because the claim CLAUDE.md stated as absolute — "the
  device runs nothing the model gate has not passed" — was *false*, and it is
  what authorizes every device run on the Plan 12 ladder. Now: the 378 dead
  inline `press_at` lines are deleted, `test-runner-plan.mjs` scans the whole
  driver instead of a slice that ended where they began (verified by positive
  control against the old file), the prose-absence check is structural, and
  CLAUDE.md's rule is scoped to what is actually enforced. **Two things still
  sit outside the gate**: `trial-maskcamp.sh`, which needs a decision rather
  than one session's judgement — gate it, port its table, or retire it — and
  the reactive presses noted above, which are now priced by nothing.
- `docs/device/RUN-TELEMETRY.md` ranks ten diagnostic signals by value per
  millisecond. Items 3–6 total ~23 ms of a 5000 ms cycle and belong in the
  plan's ~416 ms post-read slack; re-check placement with `windpct.py
  --samples`, since the screencap that once collapsed the box 52% → 10% was
  only 10.3 ms/s and did it by landing on the wind.
- ~~Two defects found while reading and not fixed: `SWEEP_LIGHT_LEAD_MS` and
  `plan_control_xy` are each **defined twice** in `trial.sh`~~ —
  **fixed, and this entry was stale when written.** `98eb7ff` removed both the
  duplicate sweep-light constant and the incomplete coordinate resolver, and
  that commit is cited eight lines above this bullet in the same file, which is
  how a dashboard ends up asserting a fix and its absence on one screen. Both
  now have exactly one definition, and every remaining HID timestamp is
  structurally gated against a freshly frozen value — which was the `hid_mark
  "$actual"` stale-global half.

## Dashboard

| Plan | Closed / mandatory packages | Progress | Current state | Next gate |
|---|---:|---:|---|---|
| [01 — research pass](01-research-pass.md) | 3 / 3 | **100%** | Done | None |
| [02 — Minus 3 mode](02-minus-3-mode.md) | 1 / 7 | **14%** | **Reopened 2026-08-26.** The glitchless Minus Two verdict stands (16/200, consecutive-mask failure), but the reason the *family* was closed — "Minus Toys cannot transfer, the build has no double-camera state" — is retracted: `viewing` and the `your view` marker are separate fields and a monitor raise restores only `viewing` from a 200 ms-stale sample, so the CAM 08/09/11 flash exclusions are bypassable. A device frame caught both buttons lit. Minus Toys is unprobed, not refuted; the framing decision is blocked behind the new package 2a | Package 2a: split the engine's camera selection into counter + marker, write a glitch-aware Minus Toys probe, and measure the 200 ms arming window on the device |
| [03 — right-vent-camp mode](03-right-vent-camp-mode.md) | 1 / 5 | **20%** | Engine sourcing complete (2026-08-24); reactive coach, decision table, ladder and grading untouched | Design the reactive coach: situation detection, expected response, reaction window, decision grading |
| [04 — optimize Minus 7](04-optimize-minus-7.md) | 3 / 4 | **75%** | Search and grading work complete | Replace inferred human profile with accumulated trainer traces |
| [05 — derive new strategy](05-derive-new-strategy.md) | 5 / 5 | **100%** | Closed by sourced refutation/negative result | Reopen only after a source-rule change |
| [06 — hybrid search](06-hybrid-strategy-search.md) | 6 / 6 | **100%** | Closed with no survivor | Reopen only after a corrected mechanic changes reachable policy space |
| [07 — tooling consolidation](07-tooling-consolidation.md) | 5 / 8 | **63%** | Correctness pass complete; opportunistic refactors remain | Extract shared browser session during the next browser-tool change |
| [08 — audio-cue controller](08-audio-cue-controller.md) | 2 / 7 | **29%** | Source map and playback capture pass. A live **fail-closed, shadow-only** detector now exists on device (`ARM`/`RESULT`/`MODEL`, named refusal reasons, `UNKNOWN` for every degradation) and **cannot influence a run** — the runner sends only `GET` and reads only the visual pixel. It closes no package: the exporter is not an evaluator, close→MISS latency is unmeasurable as built, and no shadow run exists | Derive or retract the guessed `threshold=0.25`/`margin=0.05` now provisioned on the phone, then the session-split holdout and confusion matrix |
| [09 — observation corpus](09-observation-corpus.md) | 1 / 6 | **17%** | Schemas, validator and producers all landed; every runner emits a manifest on every exit path, proven against mock adb only | Validate one real captured session; the next hardware run closes package 2 |
| [10 — stock-device controller](10-stock-device-controller.md) | 0 / 7 | **0%** | Package 0 advanced: pan sourced and measured, both lights verified, office proven 1600×768 and the screen mapping derived; the right vent's scene X stays unknown | Price the right vent's ~570 ms pan round trip, then close the vocabulary |
| [11 — policy interface](11-policy-interface-and-baselines.md) | 0 / 5 | **0%** | Proposed; optional Gym package excluded from denominator | Freeze exact-engine policy protocol after Plan 09 record agreement |
| [12 — evidence campaign](12-end-to-end-evidence-campaign.md) | 0 / 7 | **0%** | Lateness decomposed and priced: the knee is the 2→3 frame boundary, and the fork-free clock recovers Nights 1–5 in the simulator; Night 7 stays blocked by the phase island | Gate A after Plans 09–11 provide their contracts |
| [13 — campaign/all-night](13-campaign-and-all-night-support.md) | 2 / 8 | **25%** | **Night 1 CLEARED on device 2026-08-26** (`n1-full-1640`, 420.2 s alive, save advanced Night 1 → Night 2). Package 3 is **advanced, not closed**: generic intro and positive 6 AM now timeline the real clear, while minigames, ordinal recognition, committed real holdouts, clock alignment and save advancement remain open. The live title has only New Game + Continue and the device owner confirmed cursor Night 2; Sixth Night is not unlocked. All six story configurations pass the last committed human gate (99.1, 68.9, 78.8, 73.2, 63.9, 56.1%), and the marker-123 source pass has landed (`47dcd1b`) with the engine suite green, so nothing blocks hardware | One traced Night 2 cycle, then a full graded Night 2 attempt |
| [14 — device portability](14-device-portability-and-profiles.md) | 0 / 6 | **0%** | Proposed; the canvas→screen mapping is now derived (stretch-to-fill, predicted 1720 against a measured 1700–1800) rather than calibrated | Inventory and classify the coupling: geometry, layout mode, pixel models, timing |
| [15 — sensor independence](15-sensor-independent-observations.md) | 0 / 5 | **0%** | In progress (2026-08-27, Pedro's directive: drop every screencap read, cue helper is the response). Pkg-4 instrumentation landed — `trial/08` logs paired `GRID` lines per BB read; corpus accretes on the next device night. Pkgs 2/3/5 and the grader migration open. | Same capture at `trial/06` + `trial/04`, then build the BB grid signature from the paired frames |
| [16 — constrained policy search](16-constrained-policy-search.md) | 5 / 5 | **100%** | **Resolved 2026-08-27.** Pkgs 1–3 built (row was stale at 0/6). **Pkgs 4 and 5 closed by recorded negative (`740f5b0`, `4e7abce`).** Pkg 4: the constrained scheduling space is a wall — timing knobs, the 10 s attack cycle, the sweep geometry (a phase-lock spike that fails iid and wrecks n7), and item 10's bang-anchored raise (needs a <~50 ms bang detector the phone lacks). Pkg 5: the Night-7 *opener* is refuted — a perfect opening Foxy reset moves n7 by 0.0; n7 is a steady-state clear-cycle problem (two existing Foxy resets missing under jitter → 33/61 %, + office entries = the geometry lever). Pkg 6 dropped — no promoted candidate for a dependency report. Every simulator lever is exhausted; the standing goal (item 9) is **not met in the simulator** and moves entirely to the device | Reopen only if a device result produces a candidate to harden, or a source-rule change reopens the scheduling space |

## Counting rule

- The denominator is the mandatory numbered work packages in each plan. Plan
  11's explicitly optional Gymnasium package is excluded.
- Plan 13 adds eight mandatory packages; the completion numerator remains
  unchanged until one of its gates actually closes.
- Plan 14 adds six mandatory packages on 2026-08-26 (77 -> 83 mandatory). Its
  package 6 needs a second handset the project does not have; it is counted
  because the plan's done criteria cannot close without it, unlike Plan 11's
  Gymnasium package which is optional to its own goal.
- Plan 15 adds five mandatory packages on 2026-08-26 (83 -> 88 mandatory). It
  exists because the same game fact is currently re-taught per capture method,
  and three more sensor-bound classifiers were added the same day.
- Plan 16 adds six mandatory packages on 2026-08-27 (89 -> 95 mandatory). It
  exists because the standing goal in item 9 has been attacked by hand twice
  and reverted twice; no search tool optimises the emitted device plan against
  `human-gate.mjs`, and the one unexplored lever (items 10/11) needs cross-cycle
  state. Overall falls 33% -> 31% on the same numerator, the honest direction.
- Plan 10 gained a package 0 on 2026-08-26 (76 -> 77 mandatory): the basic
  interaction vocabulary the schedule is made of was never established, and
  office panning appears in the record only as a failure mode.
- Plan 02 gained a package 2a on 2026-08-26 (88 -> 89 mandatory): the
  double-camera glitch turned out to exist on Android, so the Minus Toys half of
  the family needs an engine state, a probe and a device measurement that were
  never written. Its percentage falls 17% -> 14% on the same numerator, which is
  the honest direction.
- A package contributes only when its plan marks it closed, completed, passed,
  or closed by a documented negative result. Partial or “advanced” work receives
  no fractional credit.
- Plans 05 and 06 count as complete because their done criteria explicitly
  accept a recorded refutation/no-survivor result; implementation was correctly
  not started after the candidate failed. **Plan 16 closes the same way**
  (2026-08-27): pkgs 4 and 5 are recorded negatives, and pkg 6 (a
  dependency-report on a promoted candidate) was dropped because no candidate
  was promoted — 95 → 94 mandatory. Its row was also corrected off a stale
  `0 / 6` (pkgs 1–3 built in prior commits, never counted).
- Prerequisite research outside a plan's numbered implementation packages is
  described in the state column but does not inflate its percentage.
- Adding, removing, reopening, or closing a mandatory package changes the
  numerator or denominator here in the same commit.
- A row is read off its plan's own completion markers, never from memory. This
  file was written on 2026-08-26, after several plans had already closed
  packages, and a same-day audit found Plan 03's row had been authored stale:
  its work item 1 closed on 2026-08-24 and the row still said `0 / 5` and named
  that finished work as the next gate. The audit also found Plan 08's "Done
  when" section still carrying a withdrawn refutation that, read literally,
  closed five packages the plan's own table lists as open.

This percentage measures completion of the written plans, not probability of a
clear. In particular, simulator success, a bounded device branch, a Night 6
attempt, a Night 6 clear, and a 10/20 clear remain distinct claims under
[Plan 12](12-end-to-end-evidence-campaign.md).
