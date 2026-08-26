# Plan progress

**Updated:** 2026-08-26

**Overall:** **34%** — 26 of 76 mandatory top-level work packages are closed.

**Expanded stock-device roadmap (Plans 09–13):** **3%** — 1 of 32 mandatory
packages is closed.

## Very next step

Complete **Plan 13, work package 1: remove the Night-6 construction
assumption**, then return to Plan 09's schema slice before collecting new
fresh-save evidence.

Separate cycle-template extraction from the night being evaluated; thread an
explicit Nights 1–6 configuration through recipe generation, replay, and the
human gate; and add a deterministic per-night matrix. Preserve the current
Night 6 plan behavior while making a legitimately unreachable Balloon Boy
attack branch non-fatal to Nights 1 and 3.

**This step is complete when** all six story nights build and receive exact and
human-slack verdicts; branch reachability and resource use are reported; a
forced unexpected-BB fixture fails closed; and the Night 6 emitted plan retains
its pinned semantics. This is local-only work—do not tap New Game or collect a
new device run in this step.

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
| [09 — observation corpus](09-observation-corpus.md) | 1 / 6 | **17%** | Capture/consumer/clock inventory complete | Add and validate v1 manifest/event schemas with synthetic fixtures |
| [10 — stock-device controller](10-stock-device-controller.md) | 0 / 6 | **0%** | Proposed | Agree observation/decision records with Plan 09, then emit shadow state |
| [11 — policy interface](11-policy-interface-and-baselines.md) | 0 / 5 | **0%** | Proposed; optional Gym package excluded from denominator | Freeze exact-engine policy protocol after Plan 09 record agreement |
| [12 — evidence campaign](12-end-to-end-evidence-campaign.md) | 0 / 7 | **0%** | Proposed | Gate A after Plans 09–11 provide their contracts |
| [13 — campaign/all-night](13-campaign-and-all-night-support.md) | 0 / 8 | **0%** | Proposed after target-device save loss; simulator models per-night AI but the device path assumes Sixth Night | Fix low-threat recipe construction and add the Nights 1–6 offline matrix |

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
