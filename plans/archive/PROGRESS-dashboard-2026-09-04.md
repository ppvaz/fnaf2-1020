# Plan progress: the package dashboard and counting rule (archived)

**Archived 2026-09-25, unchanged below this note except for link paths.** This
was the head of [`../PROGRESS.md`](../PROGRESS.md) from 2026-08-26. It measured
completion of the *written plans* (49 of 158 mandatory packages, 31%), not
progress toward the objective, and its rows had not been re-read since
2026-09-04: several "next gate" cells name commands that were archived on
2026-09-24/25. [`../ROADMAP.md`](../ROADMAP.md)'s steps S1-S7 replace it, per
Pedro's 2026-09-25 directive that gates which are superseded or compete with
the objective are loosened or archived.

## Dashboard

| Plan | Closed / mandatory packages | Progress | Current state | Next gate |
|---|---:|---:|---|---|
| [01 — research pass](01-research-pass.md) | 3 / 3 | **100%** | Done | None |
| [02 — Minus 3 mode](../02-minus-3-mode.md) | 1 / 7 | **14%** | **Pkg 2a modelling done (`c038938`, 2026-08-28); device side open.** Engine has the `viewing`/`lastViewed`/marker split; `minustoystest.mjs` gates 200/200 + 100/100 worst + 0/200 no-split; `minus-toys-plan.mjs --night=N` emits a gated device plan (Night 1: 200/200). Glitchless Minus Two remains 16/200 — not a Minus Toys verdict. **Story campaign is a distinct, softer target (`MINUS-3-STRATEGY.md` §9):** CAM 09 nights 1–2, CAM 08 nights 3–5; Pedro hand-cleared 1/3/4 on the g56 uncaptured. | Measure the glitched Toy stun on hardware. Night 1 (`trial.sh DEVICE_POLICY=minus-toys CALIBRATION_STORY_NIGHT=1`, needs save reset to Night 1) is the clean calibration run — also the place to test the music-box audio phase clock against the −184 ms/min drift. |
| [03 — right-vent-camp mode](../03-right-vent-camp-mode.md) | 1 / 5 | **20%** | Engine sourcing complete (2026-08-24). The existing 0/300 `rvctest` is a deliberately incomplete non-reactive skeleton, not the brayden/Shooter25 policy; decision table, coach, ladder and grading untouched. | Encode and measure the published four-way post-wind controller before designing lessons or quoting an Android rate. |
| [04 — optimize Minus 7](../04-optimize-minus-7.md) | 3 / 4 | **75%** | Search and grading work complete | Replace inferred human profile with accumulated trainer traces |
| [05 — derive new strategy](../05-derive-new-strategy.md) | 5 / 9 | **56%** | **Reopened 2026-08-28.** Original static-cover pass closed by sourced refutation; broader stateful/event-driven invention campaign is active on the now-sourced model/search substrate. | Package 6: define and source the novel-policy language, with duplicate controls excluding Plans 05/06/16's closed families. |
| [06 — hybrid search](06-hybrid-strategy-search.md) | 6 / 6 | **100%** | Closed with no survivor | Reopen only after a corrected mechanic changes reachable policy space |
| [07 — tooling consolidation](../07-tooling-consolidation.md) | 5 / 8 | **63%** | Correctness pass complete; opportunistic refactors remain | Extract shared browser session during the next browser-tool change |
| [08 — audio-cue controller](../08-audio-cue-controller.md) | 2 / 7 | **29%** | Source map and playback capture pass. A live **fail-closed, shadow-only** detector now exists on device (`ARM`/`RESULT`/`MODEL`, named refusal reasons, `UNKNOWN` for every degradation) and **cannot influence a run** — the runner sends only `GET` and reads only the visual pixel. It closes no package: the exporter is not an evaluator, close→MISS latency is unmeasurable as built, and no shadow run exists | Derive or retract the guessed `threshold=0.25`/`margin=0.05` now provisioned on the phone, then the session-split holdout and confusion matrix |
| [09 — observation corpus](../09-observation-corpus.md) | 1 / 6 | **17%** | Schemas, validator and producers all landed; every runner emits a manifest on every exit path, proven against mock adb only | Validate one real captured session; the next hardware run closes package 2 |
| [10 — stock-device controller](../10-stock-device-controller.md) | 0 / 7 | **0%** | Package 0 advanced: pan sourced and measured, both lights verified, office proven 1600×768 and the screen mapping derived; the right vent's scene X stays unknown | Price the right vent's ~570 ms pan round trip, then close the vocabulary |
| [11 — policy interface](../11-policy-interface-and-baselines.md) | 0 / 5 | **0%** | Proposed; optional Gym package excluded from denominator | Freeze exact-engine policy protocol after Plan 09 record agreement |
| [12 — evidence campaign](../12-end-to-end-evidence-campaign.md) | 0 / 7 | **0%** | Lateness decomposed and priced: the knee is the 2→3 frame boundary, and the fork-free clock recovers Nights 1–5 in the simulator; Night 7 stays blocked by the phase island | Gate A after Plans 09–11 provide their contracts |
| [13 — campaign/all-night](../13-campaign-and-all-night-support.md) | 2 / 8 | **25%** | **Night 1 CLEARED on device 2026-08-26** (`n1-full-1640`, 420.2 s alive, save advanced Night 1 → Night 2). Package 3 is **advanced, not closed**: generic intro and positive 6 AM now timeline the real clear, while minigames, ordinal recognition, committed real holdouts, clock alignment and save advancement remain open. The live title has only New Game + Continue and the device owner confirmed cursor Night 2; Sixth Night is not unlocked. The 2026-08-30 run added a shadow-only labelled Foxy-cause foundation, but the operator label is not a holdout or a promotion. Current simulator ladder (1200 seeds, 95% Wilson) is 100.0% [99.7%, 100.0%], 66.3% [63.6%, 69.0%], 79.3% [76.9%, 81.4%], 73.8% [71.3%, 76.2%], 62.0% [59.2%, 64.7%], and 54.0% [51.2%, 56.8%]; this is not device evidence. The marker-123 source pass has landed (`47dcd1b`) with the engine suite green, so nothing blocks hardware | One traced Night 2 cycle, then a full graded Night 2 attempt |
| [14 — device portability](../14-device-portability-and-profiles.md) | 0 / 6 | **0%** | Proposed; the canvas→screen mapping is now derived (stretch-to-fill, predicted 1720 against a measured 1700–1800) rather than calibrated | Inventory and classify the coupling: geometry, layout mode, pixel models, timing |
| [15 — sensor independence](../15-sensor-independent-observations.md) | 0 / 5 | **0%** | In progress (2026-08-27, Pedro's directive: drop every screencap read, cue helper is the response). Pkg-4 instrumentation landed — `trial/08` logs paired `GRID` lines per BB read; corpus accretes on the next device night. Pkgs 2/3/5 and the grader migration open. | Same capture at `trial/06` + `trial/04`, then build the BB grid signature from the paired frames |
| [16 — constrained policy search](16-constrained-policy-search.md) | 5 / 5 | **100%** | **Resolved 2026-08-27 and scoped 2026-08-28.** Pkgs 1–3 built; pkgs 4 and 5 closed by recorded negative (`740f5b0`, `4e7abce`); pkg 6 dropped. The searched Minus 7 timing/geometry space is a wall under the human gate, and the Night-7 opener is irrelevant. This is not a claim that Minus Toys, faithful RVC, GOT-YOU blackout cover, or measured machine execution was searched. | Reopen this Minus 7 search only for a device candidate or corrected mechanic; pursue the separate frontier at the top of this page independently. |
| [17 — in-APK bot](../17-in-apk-bot.md) | 0 / 6 | **0%** | **Opened 2026-08-28.** Naive retail re-sign is a measured PAIRIP negative; modified-package, runtime hook, loader/shim, CCN rebuild and faithful-recompile routes remain active. | Package 1, then 2: freeze the stock oracle and localize the known re-sign failure while preparing the smallest read-only runtime-attachment probe. |
| [18 — modern tooling](../18-modern-tooling.md) | 0 / 9 | **0%** | **Proposed 2026-08-28; Packages 4–5 bounded foundations landed, gates remain open.** Nine additions, each tied to a documented failure and none adding a runtime dependency or a build step. Package 4 has the phone-free 64-seed property harness; Package 5 has the phone-free parser and capture wrapper, but three current direct-HID traces had no app MotionEvent rows, so dispatch/frame landing is unproven. | Reproduce the earlier positive input-trace configuration and place each camera-select event on an actual frame landing; expand the property campaign; in parallel, Package 1 (`shellcheck` + the three footgun fixtures). |
| [19 — video reactive controller](../19-video-reactive-controller.md) | 3 / 6 | **50%** | **Proposed 2026-08-29; packages 1–3 are implemented in the worktree.** The observer/controller audit fixes cover deadline timing, stale cue identity, actual mask endpoints, UNKNOWN polarity, and rejected-intent rollback. `PixelWatch.java` / `CaptureService.java` provide the native watch protocol; `watch-calibrate.py` refuses weak or foreign calibration; `reactivetest.mjs` remains green and `ventreacttest.mjs --assert` is intentionally red on the survival-cost claims. P4 now has one Night 2 observe-only baseline (operator saw Foxy; machine cause remained unknown); the run is not a clean Night 5/7 promotion gate. P5 blackout attachment and P6 external audio remain open. | Run the observe-only branch on a monitor-stressing Night 5 or 7 session, then grade it. |
| [20 — belief-state cycle controller](../20-belief-state-cycle-controller.md) | 5 / 7 | **71%** | **Packages 1–5 implemented in the worktree; P6 trace contract foundation added 2026-09-02.** `src/estimator.js` preserves delayed timing, refuses stale/uncalibrated/conflicting facts, and reconciles actions transactionally. `src/cycle-library.js` and `src/cycle-planner.js` provide reviewed primitives and worst-case selection; `src/cycle-controller.js` composes them without an engine read, and the exact-engine blackout control comparison is 0/80 disabled, 80/80 normal estimator, **46/80** harsh stress, 80/80 oracle (this row said 13/80 until the 2026-09-04 audit; the plan itself has said 46/80 since 2026-09-03, when hazard preemption moved it, and `cycle-controller.test.js` prints 46/80 today). `bench-transport-trace-v1` now retains complete visual/audio latency legs and safe-cycle continuation proof in a deterministic host fixture. Physical bench timing and the shadow campaign remain open. | Package 6: real bench transport trace, then safe-cycle continuation under measured link loss. |
| [21 — policy-program synthesis](../21-policy-program-synthesis.md) | 6 / 7 | **86%** | **Packages 1–6 implemented for the initial Minimal target.** The finite named-target grammar fingerprints known families; IR/device/mock-phone equivalence rejects the three Night 1 defect controls; `policy-search.mjs` persists an exact-engine positive/negative mutation frontier with provenance; and `policy-artifact.mjs` binds the canonical program to the pushed plan and manifest while keeping grading opt-in. Broader 1200-seed invention, family ports, physical device evidence, and promotion remain open. The BB-only reactive experiment remains a failing release gate; Mangle audio-static handling is modeled, but device calibration/evidence remains open. | Package 7: scoped invention campaign and promotion. |
| [22 — architecture refactor](../22-architecture-and-developer-experience-refactor.md) | 1 / 10 | **10%** | **Foundation/phase 1 on branch `refactor`; counted here from 2026-09-04.** Read off [22-STATUS.md](../22-STATUS.md), which is the plan's own closure matrix: P1 (workspace/core front door) is the only `Closed` row. P0, P2, P3, P4, P6, P7 and P8 are `Foundation` — the boundary or scaffold exists and each names the gate it still owes. P5 (device execution) and P9 (compatibility removal/audit) are `Open`. The plan's release rule is explicit that a green scaffold or a CLI refusal is not a physical qualification result, so no `Foundation` row earns anything here. | P5: inject a qualified transport, run bounded temporal execution, retain a real session bundle. Since the 2026-09-02 legacy deprecation this row is the only path to new ladder evidence. |
| [23 — cue helper overlay HUD](../23-cue-helper-overlay-hud.md) | 0 / 6 | **0%** | **Proposed 2026-09-01; counted here from 2026-09-04.** Six packages, no closure marker of any kind in the plan. P1–P4 (ROI/snapshot contracts, overlay permission and lifecycle shell, sensor/debug renderer, decision/run renderer) are host-testable and phone-free; P5 (feasibility and interference qualification) and P6 (observe-only night, then player-facing) need the g56. The plan creates no gameplay claim on its own and defers any 10/20 use of overlay-derived human response to Plan 12's ladder. | P1: extract the versioned geometry contract from `PixelWatch` without changing its wire grammar, with the rotation/letterbox/stale/mismatch cases tested. |
| [24 — adaptive prediction coach](../24-adaptive-prediction-coach.md) | 0 / 9 | **0%** | **Proposed 2026-09-01, expanded 2026-09-02; counted here from 2026-09-04.** Nine packages — P1, P2, P3, P3A, P3B, P3C, P4, P5, P6 — and **every one of them is `FOUNDATION LANDED` with its own remaining work named**, which is exactly the partial state this file gives no fractional credit for. Real substance exists (`exercise-v1` replay contracts, the `activity-gate-v1` refusal evaluator, the DOM-free microtrainer, Arcade Lab campaign/Rhythm Highway/Threat Constellation layout foundations, the skill model), but each entry ends in retained-corpus, UI-integration, or measured-qualification work. The Arcade Lab trio is called optional prose-side yet is named by acceptance criteria 9 and 10, so it counts — the Plan 14 package 6 precedent, not the Plan 11 Gymnasium one. | Close one package outright rather than widening the foundation: P1 needs only the retained-corpus join to be a closure rather than a contract. |

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
- Plan 05 adds four mandatory packages on reopening (94 -> 98 mandatory). Its
  original five packages remain closed; the new denominator records that the
  invention goal is active again without erasing the Six-Seven refutation.
- Plan 17 adds six mandatory packages on 2026-08-28 (98 -> 104 mandatory). The
  percentage falls 36% -> 33% with no invented completion credit; the earlier
  naive re-sign negative is starting evidence, not a closed package in the new
  route campaign.
- Plan 18 adds nine mandatory packages on 2026-08-28 (104 -> 113 mandatory).
  Each package is scoped to close either on a landed check or on a recorded
  negative (packages 4 and 6 are the likely negatives); the percentage falls
  33% -> 30% with no invented completion credit.
- Plans 19 and 20 add six and seven mandatory packages on 2026-08-29 (113 ->
  126 mandatory). Plan 19 package 1 (`src/observer.js`, `src/controller.js`,
  `tools/reactivetest.mjs` in `--engine`) closes the same day on its landed
  gate, so the numerator moves 34 -> 35 and the percentage falls 30% -> 28%.
  Plan 20 packages 1–5 are now closed by their recorded phone-free gates;
  packages 6–7 remain open.
- Plan 21 adds seven mandatory packages on 2026-08-30 (126 -> 133 mandatory).
  Packages 1–6 are now closed for the initial target by their canonical IR,
  grammar, constrained mutation campaign, compiler-equivalence checks, and
  safe artifact binding; package 7 remains open.
- Plans 22, 23 and 24 add ten, six and nine mandatory packages on 2026-09-04
  (133 -> 158 mandatory). They had been written, worked on and cited for weeks
  while sitting outside the denominator; `ROADMAP.md` named that as a
  maintenance gap. Plan 22's row is read off [22-STATUS.md](../22-STATUS.md)
  rather than its plan text, because that plan deliberately keeps status in a
  separate closure matrix — one `Closed` row, so the numerator moves 48 -> 49
  and the percentage falls 36% -> 31%. Plan 24's three Arcade Lab packages
  (P3A/P3B/P3C) are counted despite the plan calling those surfaces
  "optional": its acceptance criteria 9 and 10 name all three, so its done
  criteria cannot close without them. That is the Plan 14 package 6 precedent,
  not the Plan 11 Gymnasium exclusion — the test is whether the plan's own
  goal can close without the package, not whether the prose says "optional".
- The 2026-08-30 entry closing Plan 19 packages 2–3, Plan 20 package 1 and
  Plan 21 package 1 moved the numerator 35 -> 38 for four packages. The
  correct value was 39, and every later figure inherited the error, so the
  headline read 47 while the rows summed to 48. Corrected 2026-09-04 by
  re-reading all 24 plans. **Check the rows against the headline whenever
  either changes: they are two representations of one number and they drifted
  for five days without anything catching it.**
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
[Plan 12](../12-end-to-end-evidence-campaign.md).

