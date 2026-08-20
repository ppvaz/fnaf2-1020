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
| UI state identity | `Multiple Touch` is camera selection/up state; `monitorFrame` is the four-state Freddy-mask animation, despite its exported name |
| Shared office defense sequence | Marker-122 encounter starts a 45-frame Night-7 fuse and resolves after 300 frames; only a fully-on mask before fuse expiry defends it |
| Character-specific threshold branches | Toys/W. Freddy, W. Bonnie, and W. Chica now use separate sourced marker-122 rules instead of a generic instant mask repel |
| Mangle office endgame | Marker 122 clears after five continuous fully-masked scheduler ticks, while completing the next monitor raise sends her to marker 123 |
| Marker-123 attacks | Per-family Android attack triggers and the shared 40-frame `danger 2` transition are represented |
| Toy/W. Freddy threshold mutex | `chicalookatyou` serializes final entry for the four shared-streak attackers |
| Monitor and mask animation durations | Derived from the Android animation bank and represented as asymmetric frame counts |
| Minus 7 control policy | 200/200 normal seeds and 100/100 pinned worst-luck seeds in the current model, with zero stun lapses |

## Confirmed or located, but not fully implemented

| Priority | Mechanic | What remains |
| --- | --- | --- |
| P0 | Office threshold/inside state machine | Core marker-122/123 behavior is implemented; finish exact same-frame visual and input ordering around attack transitions |
| P0 | Office queue pacing | The four-attacker mutex and shared encounter latch are anchored; determine exact ordering when W. Bonnie, W. Chica, or Mangle coexist with them |
| P0 | Toy Bonnie Android endgame | Integrate the marker-120 timer reset, exact office cue/animation, marker-123 masked leave, and return immunity as one state machine |
| P0 | Foxy | Reconcile the Android equation operator and event order; implement D reduction in Parts/Service, exact light-on reset/stun behavior, GOT-YOU execution, and any scheduler offset |
| P0 | Golden Freddy | Decode the office/hall object identities and exact monitor-animation interaction; replace the calibrated 18-frame Android raise window |
| P0 | Mask counter semantics | W. Chica/Mangle continuous counters and marker-123 leave rolls are separated; finish BB storage semantics and any remaining auxiliary counters |
| P1 | Camera-light stun event | Pin the exact Android event group, refresh timing, multi-occupant targeting, and immunity exceptions rather than inheriting the community abstraction |
| P1 | Display-camera mapping | Replace the two route-fitted low-confidence room mappings with direct Android UI/object anchors |
| P1 | In-office auxiliary mover | Identify the exported `in office` object, which has a Mangle-like 122/123 monitor-raise branch but is outside the seven modeled movers |
| P1 | Puppet | Implement Android's post-box roaming route and verify the CAM 11 flash-stall event |
| P1 | Balloon Boy inside-office behavior | Route/latch/opening behavior is modeled; flashlight disable and eventual departure after a failed defense are not |
| P2 | Input event ordering | Establish same-frame order for monitor, mask, hall light, and vent-light touch objects |
| P2 | Sound cue frames | Tie bangs, laughs, static, and blackout cues to source state transitions for reaction training |
| P2 | Auxiliary counters | `old chica` is anchored as the office encounter latch; decode `Active 21` and remaining route mutex/branch counters |

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
6. An unresolved source detail stays on this ledger rather than entering the
   engine unless it can change survival, player timing, or a policy under test.

## Current strategic verdict

- Minus 7 remains the only source-shaped, human-executable policy with a fully
  surviving regression control.
- Six-Seven has no two-camera cover on the extracted Android route graph and stays
  refuted for the target platform.
- The apparent 150/150 monitor-denial reopening is **retracted**. It came from
  reading groups 538-555 as continuous mask polling; they actually resolve the
  latched defense state at the end of the 300-frame office sequence. The corrected
  observable controller scores 0/150 across every tested gate-aware family.
- The office audit is documented in
  [`ANDROID-OFFICE-ENDGAME.md`](ANDROID-OFFICE-ENDGAME.md). W. Chica's state-99
  branch, auxiliary movers, and exact non-mutex ordering remain ledgered gaps;
  they do not justify more engine complexity without a reachable policy or
  observable Android test that depends on them.
