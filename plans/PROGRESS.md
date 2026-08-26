# Plan progress

**Updated:** 2026-08-26

**Overall:** **36%** — 27 of 76 mandatory top-level work packages are closed.

**Expanded stock-device roadmap (Plans 09–13):** **6%** — 2 of 32 mandatory
packages are closed.

## Very next step

Complete **Plan 13, work package 2: the save-safe title/menu observer and
selector**.

Plan 13 package 1 closed on 2026-08-26: all six story nights build, replay
100/100 exactly, and pass the ±60 ms human-slack gate priced against their own
AI table (99, 77, 89, 85, 78 and 46 of 100). Night 6's emitted plan is pinned
byte-for-byte. Those are simulator figures; no night below 6 has been attempted
on a device.

The next step separates `MenuTarget` from `GameConfig`, puts the title
coordinates behind one tested selector instead of duplicating them across
runners and HID fixtures, and requires a deliberate `allowSaveReset`
capability before New Game can ever be pressed.

**This step is complete when** synthetic menu-frame fixtures cover fresh save,
story progress, Sixth Night unlocked, Custom Night unlocked, unknown layouts,
and stale/focus loss; and a test proves no unapproved path can press New Game.
This remains local-only work—do not tap New Game or collect a new device run in
this step.

## Dashboard

| Plan | Closed / mandatory packages | Progress | Current state | Next gate |
|---|---:|---:|---|---|
| [01 — research pass](01-research-pass.md) | 3 / 3 | **100%** | Done | None |
| [02 — Minus 3 mode](02-minus-3-mode.md) | 1 / 6 | **17%** | Research/simulator verdict complete; framing decision blocks implementation | Decide best-odds practice, PC history, or close the mode |
| [03 — right-vent-camp mode](03-right-vent-camp-mode.md) | 0 / 5 | **0%** | Research complete; implementation untouched | Source load-bearing Android vent/endgame mechanics |
| [04 — optimize Minus 7](04-optimize-minus-7.md) | 3 / 4 | **75%** | Search and grading work complete | Replace inferred human profile with accumulated trainer traces |
| [05 — derive new strategy](05-derive-new-strategy.md) | 5 / 5 | **100%** | Closed by sourced refutation/negative result | Reopen only after a source-rule change |
| [06 — hybrid search](06-hybrid-strategy-search.md) | 6 / 6 | **100%** | Closed with no survivor | Reopen only after a corrected mechanic changes reachable policy space |
| [07 — tooling consolidation](07-tooling-consolidation.md) | 5 / 8 | **63%** | Correctness pass complete; opportunistic refactors remain | Extract shared browser session during the next browser-tool change |
| [08 — audio-cue controller](08-audio-cue-controller.md) | 2 / 7 | **29%** | Source map and playback capture pass; detector/latency/shadow gates remain | Session-split bang holdout and confusion matrix |
| [09 — observation corpus](09-observation-corpus.md) | 1 / 6 | **17%** | Inventory complete; the v1 manifest/event schemas and their validator exist, but no producer emits one | Give `trial-minus7.sh`, cue-helper capture, SCM1 and `grade-run.sh` one session ID and monotonic origin |
| [10 — stock-device controller](10-stock-device-controller.md) | 0 / 6 | **0%** | Proposed | Agree observation/decision records with Plan 09, then emit shadow state |
| [11 — policy interface](11-policy-interface-and-baselines.md) | 0 / 5 | **0%** | Proposed; optional Gym package excluded from denominator | Freeze exact-engine policy protocol after Plan 09 record agreement |
| [12 — evidence campaign](12-end-to-end-evidence-campaign.md) | 0 / 7 | **0%** | Proposed | Gate A after Plans 09–11 provide their contracts |
| [13 — campaign/all-night](13-campaign-and-all-night-support.md) | 1 / 8 | **13%** | Nights 1–6 build, replay and gate against their own AI table; the device path still assumes Sixth Night | Separate `MenuTarget` from `GameConfig` behind one tested title selector |

## Counting rule

- The denominator is the mandatory numbered work packages in each plan. Plan
  11's explicitly optional Gymnasium package is excluded.
- Plan 13 adds eight mandatory packages; the completion numerator remains
  unchanged until one of its gates actually closes.
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

This percentage measures completion of the written plans, not probability of a
clear. In particular, simulator success, a bounded device branch, a Night 6
attempt, a Night 6 clear, and a 10/20 clear remain distinct claims under
[Plan 12](12-end-to-end-evidence-campaign.md).
