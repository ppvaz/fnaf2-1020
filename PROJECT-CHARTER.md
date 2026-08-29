# Project charter

## Scope

This project concerns one canonical target: `com.scottgames.fnaf2` v2.0.7, the
modern Android release-7 build (Fusion build 296). PC and community work are
supporting evidence, never silent substitutes for Android behaviour.

## Vision

Make that 10/20 night understandable, learnable, and demonstrably controllable
with evidence that survives replay, scrutiny, and testing on real hardware.

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
result at a lower level.

## Admission rule for new work

Every proposed effort must name: the layer it strengthens, the decision or user
outcome it unlocks, its falsifiable hypothesis, its retained evidence artifact,
and its promotion or stopping gate.
