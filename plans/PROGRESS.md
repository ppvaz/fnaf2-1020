# Plan progress

**Updated:** 2026-08-26

**Overall:** **33%** — 29 of 88 mandatory top-level work packages are closed.

**Expanded stock-device roadmap (Plans 09–15):** **7%** — 3 of 44 mandatory
packages are closed.

## Very next step

Attack **actuator lateness**, which is now the only lever left standing on the
10/20 mission.

Three independent offline investigations closed on 2026-08-26 and all three came
back negative, which is what makes this the next step rather than a guess:

- **No route shape reaches the Night 7 gate.** Every documented emitter freedom
  was swept; the shipped plan holds 12/100 under +/-60 ms human slack against a
  40% contract, and its 100/100 at zero slack is a one-frame phase island
  ([plans/12](12-end-to-end-evidence-campaign.md)).
- **No reimplemented public policy survives it either.** Jason-, Shooter25- and
  Couraeel-style controllers all score 0 on Night 7; Foxy takes 71–100% of their
  deaths, and doubling the hall rate only converts them into Puppet deaths
  ([plans/11](11-policy-interface-and-baselines.md)).
- **No monitor recovery survives the actuator.** The live runner's loop reclaims
  zero at every lateness band, and so does a free, instant, always-right,
  bidirectional one. The cliff is geometric: camera stalls lapse, occupants
  reach the opening, and 177/180 die to the 45-frame office-defense fuse.

So the failure is upstream of policy, upstream of recovery, and upstream of
perception. It is the **49–93 ms macro anchor spread and the 110–300 ms lateness
band** themselves: 7–18 frames on a sweep the emitter documents as unable to move
by one.

**This step is complete when** the sources of launch lateness are measured and
separated — shell spread, HID report scheduling, and Fusion's own frame poll —
and each is either reduced with device evidence or recorded as a floor the route
must be designed around. Until then no further policy search is worth running,
because every candidate is priced against an actuator nobody has tried to fix.

## Dashboard

| Plan | Closed / mandatory packages | Progress | Current state | Next gate |
|---|---:|---:|---|---|
| [01 — research pass](01-research-pass.md) | 3 / 3 | **100%** | Done | None |
| [02 — Minus 3 mode](02-minus-3-mode.md) | 1 / 6 | **17%** | Research/simulator verdict complete; framing decision blocks implementation | Decide best-odds practice, PC history, or close the mode |
| [03 — right-vent-camp mode](03-right-vent-camp-mode.md) | 1 / 5 | **20%** | Engine sourcing complete (2026-08-24); reactive coach, decision table, ladder and grading untouched | Design the reactive coach: situation detection, expected response, reaction window, decision grading |
| [04 — optimize Minus 7](04-optimize-minus-7.md) | 3 / 4 | **75%** | Search and grading work complete | Replace inferred human profile with accumulated trainer traces |
| [05 — derive new strategy](05-derive-new-strategy.md) | 5 / 5 | **100%** | Closed by sourced refutation/negative result | Reopen only after a source-rule change |
| [06 — hybrid search](06-hybrid-strategy-search.md) | 6 / 6 | **100%** | Closed with no survivor | Reopen only after a corrected mechanic changes reachable policy space |
| [07 — tooling consolidation](07-tooling-consolidation.md) | 5 / 8 | **63%** | Correctness pass complete; opportunistic refactors remain | Extract shared browser session during the next browser-tool change |
| [08 — audio-cue controller](08-audio-cue-controller.md) | 2 / 7 | **29%** | Source map and playback capture pass; detector/latency/shadow gates remain | Session-split bang holdout and confusion matrix |
| [09 — observation corpus](09-observation-corpus.md) | 1 / 6 | **17%** | Inventory complete; the v1 manifest/event schemas and their validator exist, but no producer emits one | Give `trial-minus7.sh`, cue-helper capture, SCM1 and `grade-run.sh` one session ID and monotonic origin |
| [10 — stock-device controller](10-stock-device-controller.md) | 0 / 7 | **0%** | Package 0 advanced: pan sourced and measured, both lights verified, office proven 1600×768 and the screen mapping derived; the right vent's scene X stays unknown | Price the right vent's ~570 ms pan round trip, then close the vocabulary |
| [11 — policy interface](11-policy-interface-and-baselines.md) | 0 / 5 | **0%** | Proposed; optional Gym package excluded from denominator | Freeze exact-engine policy protocol after Plan 09 record agreement |
| [12 — evidence campaign](12-end-to-end-evidence-campaign.md) | 0 / 7 | **0%** | Proposed; the actuator cliff is now measured as geometric, not a monitor desync — the closed loop reclaims zero and "open loop, not the phone" is retracted | Gate A after Plans 09–11 provide their contracts |
| [13 — campaign/all-night](13-campaign-and-all-night-support.md) | 2 / 8 | **25%** | Nights 1–6 build, replay and gate; title observed; a real death now classifies night→static→gameover→title with no unknown | Capture a 6 AM and the minigames; both still report unknown |
| [14 — device portability](14-device-portability-and-profiles.md) | 0 / 6 | **0%** | Proposed; the canvas→screen mapping is now derived (stretch-to-fill, predicted 1720 against a measured 1700–1800) rather than calibrated | Inventory and classify the coupling: geometry, layout mode, pixel models, timing |
| [15 — sensor independence](15-sensor-independent-observations.md) | 0 / 5 | **0%** | Proposed; every classifier is bound to one capture method and the cue helper's fast read is blocked on a `screencap` threshold | Inventory every fact × sensor pairing as calibrated, assumed, or absent |

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
- Plan 10 gained a package 0 on 2026-08-26 (76 -> 77 mandatory): the basic
  interaction vocabulary the schedule is made of was never established, and
  office panning appears in the record only as a failure mode.
- A package contributes only when its plan marks it closed, completed, passed,
  or closed by a documented negative result. Partial or “advanced” work receives
  no fractional credit.
- Plans 05 and 06 count as complete because their done criteria explicitly
  accept a recorded refutation/no-survivor result; implementation was correctly
  not started after the candidate failed.
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
