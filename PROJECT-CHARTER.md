# Project charter

## Scope

This project concerns one canonical target: `com.scottgames.fnaf2` v2.0.7, the
modern Android release-7 build (Fusion build 296). PC and community work are
supporting evidence, never silent substitutes for Android behaviour.

FNaF 1, 3 and 4 on the same handset run the same Clickteam runtime (770.0,
build 296; Plan 26) and are admitted as sibling targets. Each is its own
target, identified by its package name; no result on one stands in for
another.

## Vision

Make that 10/20 night understandable, learnable, and demonstrably controllable
with evidence that survives replay, scrutiny, and testing on real hardware.

Taken to its last consequence (Pedro, 2026-09-25): a verified solver for the
build-296 night games — the game itself as ground truth, an exact table of
what is winnable, a controller that plays at that ceiling on the phone, a
route a human can hold, and a provenance label on every answer. The path, its
boundaries and the gates changed for it are in
[`plans/ROADMAP.md`](plans/ROADMAP.md).

## Mission

Build an evidence-labelled, replayable model of the canonical game; use it to
derive and test policies; translate proven knowledge into human practice tools
and constrained controllers; and make only the claim that the available
device evidence supports.

## One program, five layers

| Layer | Question it answers | Examples |
|---|---|---|
| Truth | What does this Android build actually do? | source ledger, calibration, decompile |
| Understanding | How can a person learn a proven policy? | Minus 7 trainer, strategy docs |
| Decision | Which policies are viable under declared assumptions? | engine, search, belief-state planner |
| Embodiment | Can a policy observe and act through a real implementation? | HID, video/audio adapters, faithful recompile |
| Proof | What result may we honestly claim? | manifests, replay, grading, Plan 12 ladder |

The trainer is the current public product. The stock-device and in-engine
controller paths are research interfaces to the same evidence base, not rival
projects. A refuted strategy, failed device run, or blocked implementation path
is a first-class result when its conditions and artifacts remain reproducible.

## Claim discipline

Simulation, replay, shadow operation, bounded live control, a single clear,
and reliability are distinct claims. Plan 12 owns their promotion ladder. No
platform-general, full-state, or autonomous-controller claim is implied by a
result at a lower level. A night whose seed was pinned (`seedpin`) is a
clairvoyant result, labelled as one and never merged with natural-clock nights.

## Admission rule for new work

Every proposed effort must name: the layer it strengthens, the decision or user
outcome it unlocks, its falsifiable hypothesis, its retained evidence artifact,
and its promotion or stopping gate.

## Consequence rule (2026-09-06, loosened 2026-09-25)

A session or commit is consequential if it retains a verifiable record that
closes or advances a step of [`plans/ROADMAP.md`](plans/ROADMAP.md): device
evidence, a run pack or a promotion; a twin or trace-equivalence record; a
census naming its policy family and held-out block; or code a gate exercises in
the Companion, controller, trainer or solver interface. Documentation and plans
alone are bookkeeping: permitted only in direct attendance on consequential
work. A host-side record never stands in for a device claim. The consequence lock (the `commit-msg` hook plus the
session protocol in `AGENTS.md`/`CLAUDE.md`) enforces this mechanically; its
`PEDRO-OK` override key is reserved to Pedro. When a route is refuted, the next
work item is the next route's physical test or a human decision — not further
recording. The 2026-09-06 standing objective (6 AM successes on-device) is
absorbed by the path: Nights 1-7 have each reached 6 AM, promotion of what is
won is step S1 and comes first, and Night 7 reliability is step S4.
