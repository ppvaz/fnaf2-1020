# Roadmap

**Written 2026-09-02.** One sequenced route from the current evidence state to
the charter's goal: a graded 10/20 clear on the canonical Android target, with
evidence that survives replay and scrutiny.

This file answers *"in what order, and what unblocks what"*. It does not
produce evidence, does not promote anything, and is not a second progress log.
Every status below is read off [`PROGRESS.md`](PROGRESS.md), the plan files,
[`22-STATUS.md`](22-STATUS.md) and the generated catalogs — never from memory.
When one of those changes a ladder position, this file changes in the same
commit; when they disagree with this file, they win.

Rungs are [Plan 12](12-end-to-end-evidence-campaign.md)'s claim ladder,
unchanged. Nothing here weakens the claim discipline in
[`PROJECT-CHARTER.md`](../PROJECT-CHARTER.md): simulation, replay, shadow,
bounded live action, one clear, and reliability remain distinct claims.

## Two directives that set this order (Pedro, 2026-09-02)

1. **The legacy shell runner is deprecated immediately.** It is historical
   reference and characterization input only. No new device run climbs the
   ladder through it.
2. **Open loop is the defect.** The game demands reaction; the program has been
   spending its effort on schedules that cannot react. The closed loop is the
   spine of this roadmap, not a later package.

Both are recorded as decisions, not as findings. What follows is what they cost
and what they unblock.

## Scope

In scope: the Truth → Decision → Embodiment → Proof spine that ends in a graded
Night 7 artifact. The trainer (Plans 04, 24), the in-APK campaign (Plan 17), and
the tooling/architecture work (Plans 18, 22) appear only where they gate a rung.
They are real work with their own value; they are not on this critical path.

## Where we actually are

Package completion is **49 / 158 mandatory packages (31%)**, and that measures
written-plan completion, not probability of a clear. The maintenance gap this
file recorded here is closed: the 2026-09-04 audit folded Plans 22, 23 and 24
into the denominator (133 → 158, Plan 22 P1 the only closure among them) and
corrected a one-package arithmetic error that had left the headline reading 47
against rows that summed to 48. The figure fell 35% → 31% on that maintenance
alone, with no package changing state — admitted scope, not lost ground.

| Route | What it has | Ladder position |
|---|---|---|
| Legacy shell (`tools/device/legacy-trial.sh`) | Real device runs, a **Night 1 clear** (`n1-full-1640`, 2026-08-26, 420.2 s alive, save advanced to Night 2) and a second Night 1 pass under Minus Toys (`n1-minustoys-armverify-20260830`) | **Deprecated.** Its results stay as historical evidence; they do not move the modern path's ladder |
| Modern packages (`packages/*`, `apps/device`) | Contracts, campaign FSM, ADB preflight, executors, belief estimator, cycle planner, bench-trace, dry-run CLI | Level 0–1. Every device record to date is `FIXTURE`; the candidate profile is `dryRunOnly` |

The graded story-night record beyond Night 1 is: Night 2 open-loop Minus Toys
**refuted** on the phone (`n2-minustoys-0117`), and a Night 2 observe-only run
that ended `aborted`/cause-unknown (`n2-reactive-observe-20260830`). Nights 3–6
have no graded device attempt.

Honest one-line summary: **the only real clear belongs to a path we have just
retired, the path that replaces it has zero physical qualification, and the
route it would execute is still open loop.**

## The four structural facts the order follows

Measured results, not opinions. They are not re-litigated here.

1. **Nights 1–6 are offline-viable; Night 7 is not.** The human gate at ±60 ms
   gives 99/89/85/78/46 on Nights 1–5 and 6 against a 40/100 floor, and
   **12/100 on Night 7** — the first night the route cannot run at all
   (Plan 12, "The human gate"). No knob rescues it: `hallPulseMs`,
   `readLatencyMs`, `maskMarginMs` and `pilotOffset` were all swept, and the
   best value is the shipped one.
2. **The phone cannot hold a phase-locked schedule.** `n2-minustoys-0117`
   cleared the deterministic gate 200/200 and died on the phone at ~2 AM: every
   beat was locked to a clock the device holds to ~302 ms + drift, against a
   whole-schedule tolerance of **33 ms early / 99 ms late**. Under the
   calibrated ensemble the same route is 0/600 on Nights 3–5, and a perfect
   AM-digit re-anchor tops out at ~27–48%. This is the measured form of
   directive 2.
3. **Verifying your own presses is not the closed loop.** A modelled monitor
   recovery loop — and a free, ideal, always-correct one — reclaim **0/200 on
   every night** (Plan 12, "The closed loop, modelled and priced"). The cliff is
   the sweep's stun geometry under 7–18 frames of launch lateness. Read
   precisely: that result refutes *actuator-state repair inside a fixed macro*.
   It says nothing against reacting to **game** state, and the deaths it
   explains — Nights 2–6's dominant cause is a **missed Balloon Boy read** —
   are reaction failures by name.
4. **The clock fix unblocks Night 6 and only Night 6.** A fork-free
   `read < /proc/uptime` wait loop lands 0 ms late on 15/15 targets with the
   game running; at a 0–10 ms band the route recovers Nights 1–5 to 197–200/200
   and Night 6 to 171/200 — Night 7 to **25/200**, still under the floor.

Consequence: **Night 6 is an execution problem and can start now; Night 7 is a
research problem and must run in parallel.** And by fact 2, the execution
problem is not "run the macro more precisely" — it is "stop running a macro".

## The debt the two directives create

Both directives are right and neither is free. Naming the cost is the point.

- **The Night 1 clear does not transfer.** It was produced by the deprecated
  runner. The modern path enters Plan 12's ladder at Level 1 and climbs it
  again. Nothing else is honest.
- **The measured clock lives in the retired binary.** The fork-free
  `/proc/uptime` loop exists in `legacy-trial.sh` and its test scripts.
  Whatever the modern executor does about timing, it must be *measured there*,
  not inherited by assumption from a file we no longer run.
- **The reactive branch has lost its host.** `REACTIVE=observe` (Plan 19 P4) is
  wired into `legacy-trial.sh` only. Re-hosting it is not a port — it is
  Track A's first milestone, done properly.
- **The modern executor is open loop at a better boundary.**
  `apps/device/src/adb-device-local-executor.js` compiles one bounded HID
  script with fixed inter-action delays, pushes it to the phone, and observes
  only a lifecycle poll that can abort on `gameover`. That is a safer, better
  contracted version of exactly the architecture directive 2 rejects. It is a
  correct *actuation* boundary and the wrong *control* boundary: keep it as the
  bounded physical edge, and stop letting a whole night be one compiled script.
- **`test:contracts` still points at the retired lane.** The device gates that
  exercise the legacy driver stay green as characterization tests; they must not
  be read as qualification of the path that climbs.

## Track A — a closed-loop controller that clears Night 6

Sequential. Each milestone's exit gate is an artifact, not an opinion. The
deliverable at every rung is the **belief-state cycle controller**
(Plan 20, `packages/core/src/control`, `packages/core/src/estimation`),
executing bounded cycles through the modern actuation edge — never a full-night
compiled schedule.

### A0 — Record the deprecation and the cutover (done as a decision, open as work)

- `docs/architecture/COMPATIBILITY.md` and `generated/legacy-paths.json`
  already carry `tools/device/legacy-trial.sh` as lifecycle `legacy` with a
  removal gate. Tighten the wording to match the directive: reference and
  characterization only, **no new ladder evidence**, with `FNAF2_LEGACY_TRIAL=1`
  remaining the explicit opt-in for historical replay.
- Update `22-STATUS.md` P5: the crossover is no longer a question of *whether*
  the modern path takes over, only of injecting a qualified transport and
  retaining a real bundle.
- **Exit gate:** the registry, `22-STATUS.md` and this file agree, and
  `npm run catalog` regenerates clean.

### A1 — Close the loop offline, end to end (no phone)

The controller must be the thing that decides, before it is the thing that acts.

- Plan 20 P6's real-time placement, now that its trace contract exists as a
  host/fixture lane: what runs where, on which clock, with which deadline.
  `docs/device/REAL-TIME-CLOSED-LOOP-ARCHITECTURE.md` owns the boundary.
- Re-host Plan 19's observation/reaction path on the modern controller: video
  facts and their refusal semantics feed the estimator; the cycle planner emits
  the next bounded cycle; the actuation edge stays the executor.
- Plan 15's remaining packages: one definition per game fact, one calibrated
  adapter per capture method, and a refusal for every uncalibrated pairing. A
  reactive controller with sensor-bound classifiers reacts to the wrong thing.
- **Exit gate:** a full night driven cycle-by-cycle against recorded and
  synthetic facts, beating the disabled-observation control, with no compiled
  full-night schedule anywhere in the path.
- **2026-09-03:** the synthetic-fact half is met on all seven nights and the
  controller now SURVIVES four of them -- 92.0%, 50.5%, 83.5%, 82.5% and 37.5%
  on Nights 1-5 over a held-out 200-seed cohort each, against controls that are
  0/200 everywhere. Nights 6 and 7 are 0/200 against a measured resource wall
  (the box period and the Foxy band are both shorter than one wind trip). The
  recorded-fact half remains `tools/factreplay.mjs`'s simulator-produced
  stream, which claims `MODEL_ONLY`; a manifest from a real phone run is still
  A2's item. Detail and the seven defects this closed are in
  [`PROGRESS.md`](PROGRESS.md), 2026-09-03.

### A2 — Level 1, replay: one real session validated

- Plan 09 P2's single remaining item: *no manifest from a real phone run has
  been validated yet*. Every producer emits one; none has been proven against
  hardware rather than mock adb.
- Plan 14 packages 1–2: classify every device-facing number as geometry
  (translates), layout mode (must be measured), or pixel model / timing (does
  not translate), and bind the g56 profile digest into the bundle.
- **Exit gate:** one captured night replays offline to the same decisions, with
  a validated manifest and a profile digest.

### A3 — Level 2, shadow: the controller watches a real night

- Plan 20 P7 with `act=false`, on a monitor-stressing Night 5 or 7 geometry —
  the rule the `n2-minustoys-0117` incident wrote.
- Plan 23 P5–P6: HUD interference, touch passthrough and self-capture
  qualification, so the overlay cannot be the thing that kills a run.
- Measure the modern edge's timing here, against fact 4's numbers: the bench
  trace stops being a fixture and starts being a phone.
- **Exit gate:** a graded observe-only night where intended actions, belief,
  timing margin and recovery count are recorded and correct, with no measurable
  game-affecting side effect.

### A4 — Level 3, bounded live branch

- Fast safety actions first, then one cycle primitive at a time — Plan 20 P7's
  own promotion order.
- Requires a qualified transport (Plan 22 P5) and a profile that is no longer
  `dryRunOnly`.
- **Exit gate:** a retained bundle showing the branch fired, the game accepted
  it (a send is not acceptance — verify the observed result), and the fail-safe
  release ran.

### A5 — Levels 4–5, full Night 6 attempt, then a clear

- Plan 13's remaining packages: save-safe lifecycle, per-night qualification,
  fresh-save story progression through Nights 2–5. Those nights are also the
  cheapest place to prove the loop fixes what the macro could not — their
  dominant simulated death is the missed BB read (fact 3).
- **Exit gate:** one complete stock-device Night 6 with a positive 6 AM, save
  advancement, and a full artifact chain from commit to terminal outcome.

### A6 — Level 6, Night 6 reliability

- A declared consecutive cohort, reporting all wins, deaths, aborts and
  exclusions. Aborts, focus loss, helper failures and truncated captures are
  reported, never silently dropped.
- **Exit gate:** the cohort report. Nothing about 10/20 is implied by it.

## Track B — the Night 7 route (runs in parallel, starting now)

Track A cannot reach Night 7 by executing better. The current route's grammar
cannot express a Foxy reset the Balloon Boy attack cycle can reach, and its
sweep does not tolerate one frame of differential displacement (Plan 12, "What
this means for the ladder"; `MINUS-7-STRATEGY.md` §3.1).

Directive 2 applies to the search as much as to the runtime: **a route that
tolerates a frame is a route that observes.** A search over timing geometry has
already been run to exhaustion and recorded as a wall (Plan 16, closed by
negative). What has not been searched is the space of observation-conditioned
programs.

- **B1 — invention substrate.** Plan 21 P7's invention campaign on the
  grammar/IR/equivalence machinery P1–P6 closed, with the grammar ranging over
  branches conditioned on facts the controller can actually observe within its
  measured budget. Plan 05 P6 defines and sources that language, with duplicate
  controls excluding Plans 05/06/16's closed families.
  **Correction, 2026-09-02: P1–P6 are closed for the Night 1 Minimal target
  only, and until this date the grammar had no branch construct at all — so B1
  was never "run the campaign", it was "close the prerequisite".** The
  observation-conditioned language, its measured budget (visual read 59.5 ms
  p95 DEVICE_MEASURED; all four audio facts and the host round trip `UNKNOWN`
  and excluded) and the mechanical duplicate control have landed. The remaining
  B1 blocker is an evaluator: the exact-engine adapter compiles one
  unconditional stream, so a branched program refuses to compile rather than
  being flattened, and no campaign has been run. See `plans/PROGRESS.md`
  §"Plan 05 — Custom Night invention campaign", 2026-09-02.
- **B2 — the falsifiable target.** A route that survives ±1 frame of
  differential displacement *and* can reach the BB branch's mid-cycle 5 s check,
  which the two-row shared prefix cannot.
- **B3 — the gate.** ≥40/100 on the human gate at ±60 ms against Night 7's own
  AI table, then the actuator-band and compiler-equivalence gates the Minimal
  target already passes. A candidate that clears the simulator inherits
  Track A's rungs from Level 1; it does not skip them.
- **Sensor lead worth pricing here:** the 2 Hz winding-tick phase clock is
  capturable over A2DP and every strategy must wind. It is the densest known
  re-anchor and a natural input to a reactive program — a candidate input to B1,
  not a prerequisite.
- **Stopping rule.** If B2 is refuted across the searched grammar, that is a
  first-class negative and the program's honest answer becomes "Night 6
  reliability, and 10/20 refuted for this policy class" — not a quieter attempt
  at the same wall.

## Track C — explicitly not on the critical path

Kept visible so it is neither mistaken for a blocker nor for dead work:

- **Trainer / Arcade Lab (Plans 04, 24, 03).** Plan 04's remaining input is
  measured trainer timing by step — practice runs, not more modelling. Plan 24
  P1–P4 and P3A are offline foundations; the live pilots (P5, P6) depend on
  Plan 23's activity gate, so they queue behind A3 rather than gating it.
  Plan 03's Android vent/mask/light sourcing is complete; its reactive coach,
  decision table, lesson ladder, and grading remain unimplemented.
- **In-APK bot (Plan 17).** An independent route with its own ladder; the
  recompiled engine already renders on the g56. If it ever observes and acts
  internally with an auditable trace it changes which path climbs Track A — it
  is not permitted to become the reason Track A stalls.
- **Architecture and tooling (Plans 18, 22, 07).** Plan 22 P5 and P0 gate
  Track A; the rest is opportunistic.
- **Audio (Plan 08, Plan 19 P6).** Input to B1 as above.

## Rules this roadmap does not get to bend

- Plan 12 owns promotion. A rung is climbed by a retained artifact, never by a
  roadmap entry or a green scaffold.
- `FIXTURE` is not gameplay evidence, a send is not game acceptance, and a
  transport's self-report is not `DEVICE_MEASURED`.
- Device work stays dry-run by default: resolved hashed profile, capability
  preflight, exclusive lease, bounded deadlines, retained telemetry, fail-safe
  release.
- A refuted route, a failed run, or a blocked path is a result. It stays
  discoverable; it does not get quietly re-attempted under a new name.
- Deprecating the legacy runner retires the *path*, not its evidence. Its
  measurements remain citable; its clears remain its own.
