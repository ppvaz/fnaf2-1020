# Android release-7 source status

This is the canonical accuracy ledger for the project. The target is Pedro's
modern Android FNaF 2 release-7 build: Fusion build 296, project revision dated
August 2025. Community PC mechanics and strategies are useful leads, but a rule
enters the Android simulator only when the Android event sheet, an Android
experiment, or an explicitly labeled approximation supports it.

## Labels

- **Implemented** — Android source rule is represented and regression-tested.
- **Confirmed / pending implementation** — event rule is located, but the engine
  does not reproduce its full state machine yet.
- **Partially decoded** — relevant events are located but object identity, ordering,
  or counter meaning is incomplete.
- **Model-only** — useful approximation; not source evidence.

## Implemented Android mechanics

| Mechanic | Evidence / implementation status |
| --- | --- |
| Night clock and movement cadence | Global 1000 ms ticker, 70 ticks/hour, movement opportunity every 5000 ms |
| Movement RNG and Night-7 AI cap | `Random(20)+1 <= AI`; stalled movers capped at 15 |
| Main route graph | Office-frame transitions extracted, including invisible markers 120/121 |
| Per-edge monitor gates | Final approaches use cams-up/cams-down conditions; Withered Bonnie's polarity is inverted |
| Office-light movement latch | Physical light state is immediate; `new bonnie` persists to the next one-second event and guards only specific route edges |
| Shared office-light battery behavior | Office/vent light inputs use the shared battery model; night 5+ capacity is 3000 frames |
| Camera and hall light separation | A short physical tap no longer produces a fake one-second Foxy/GF exposure |
| Threshold mask polling | Mask is tested continuously; a newly arriving unarmed marker-122 attacker is repelled even when the mask was already on |
| Monitor and mask animation durations | Derived from the Android animation bank and represented as asymmetric frame counts |
| Minus 7 control policy | 200/200 normal seeds and 100/100 pinned worst-luck seeds in the current model, with zero stun lapses |

## Confirmed or located, but not fully implemented

| Priority | Mechanic | What remains |
| --- | --- | --- |
| P0 | Office threshold/inside state machine | Map each exported object identity at markers 122/123; reproduce the `danger 2`, `music button`, mask-fuse, and monitor forcedown ordering |
| P0 | Office queue pacing | Determine exactly when a threshold occupant forces the monitor down, how one-at-a-time arbitration works, and when the next occupant may act |
| P0 | Toy Bonnie Android endgame | Decode marker 120 timer reset, 60→122 gate, 122→123 transition, masked leave rolls, attack animation, and return immunity as one state machine |
| P0 | Foxy | Reconcile the Android equation operator and event order; implement D reduction in Parts/Service, exact light-on reset/stun behavior, GOT-YOU execution, and any scheduler offset |
| P0 | Golden Freddy | Decode the office/hall object identities and exact monitor-animation interaction; replace the calibrated 18-frame Android raise window |
| P0 | Mask counter semantics | Separate threshold repel, marker-123 occupants, cumulative partial-second storage, early-leave rolls, and guaranteed leave without applying one generic rule to everyone |
| P1 | Camera-light stun event | Pin the exact Android event group, refresh timing, multi-occupant targeting, and immunity exceptions rather than inheriting the community abstraction |
| P1 | Display-camera mapping | Replace the two route-fitted low-confidence room mappings with direct Android UI/object anchors |
| P1 | Mangle | Decode the right-light visibility transition, office park/kill behavior, and Android vent direction completely |
| P1 | Puppet | Implement Android's post-box roaming route and verify the CAM 11 flash-stall event |
| P1 | Balloon Boy inside-office behavior | Route/latch/opening behavior is modeled; flashlight disable and eventual departure after a failed defense are not |
| P2 | Input event ordering | Establish same-frame order for monitor, mask, hall light, and vent-light touch objects |
| P2 | Sound cue frames | Tie bangs, laughs, static, and blackout cues to source state transitions for reaction training |
| P2 | Auxiliary counters | Decode `old chica`, `Active 21`, and remaining route mutex/branch counters |

## Research rules

1. Android event data outranks PC/community descriptions for this project.
2. A community strategy may seed an Android policy test, but its published PC win
   rate is never an Android calibration target.
3. Simulator sweeps search policies; they do not establish mechanics. Any policy
   that depends on a model-only rule stays a hypothesis.
4. Every source interpretation gets a focused deterministic regression before it
   changes search conclusions.
5. A negative result closes only the modeled policy family and the decoded Android
   mechanics it actually exercises.

## Current strategic verdict

- Minus 7 remains the only source-shaped, human-executable policy with a fully
  surviving regression control.
- Six-Seven has no two-camera cover on the extracted Android route graph and stays
  refuted for the target platform.
- Monitor denial has **reopened at the privileged-model level**: after implementing
  continuous mask polling on threshold arrival, the hidden-state GateBot survives
  150/150 clean and pinned seeds with 31% minimum box. This is not yet a playable
  strategy because it reads unseen arming frames 16–26 times per night.
- The next useful work is source decoding of the Android office endgame, not a wider
  brute-force policy sweep. That state machine is the main uncertainty shared by
  RVC-style and gate-aware candidates.
