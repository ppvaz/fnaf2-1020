# End-to-end stock-device evidence campaign

**Status: proposed 2026-08-26.** This is the promotion plan, not a strategy plan.
It defines what must be captured before the project can claim an operational
controller, a full Night 6 clear, or a 10/20 attempt. It does not authorize a
device run by itself.

## Goal

Produce one self-contained, independently gradable chain from repository commit
and simulator policy to stock-device observations, inputs, recovery decisions,
and terminal outcome—then repeat it enough to describe reliability honestly.

## Dependencies

- Plan 09: session manifest, replay, lifecycle and action-state evidence.
- Plan 10: explicit controller and terminal states.
- Plan 11: policy/fault results and replay contract. Its public-bot baselines are
  useful but not blocking for the first Night 6 artifact.
- Plan 08: required only for a policy branch that consumes audio.
- Existing human/model gate, focus/watchdog, plan interpreter, cue-helper cleanup,
  and grading tests remain mandatory.

## Claim ladder

Do not collapse these into “the bot works”:

| Level | Claim allowed |
|---|---|
| 0. Offline | Policy/model result only |
| 1. Replay | Recorded observations reproduce decisions; no live action claim |
| 2. Shadow | Controller observed a real night and would have decided correctly; existing runner acted |
| 3. Bounded live branch | One verified action/recovery branch controlled the game |
| 4. Full Night 6 attempt | Controller owned the complete run; terminal outcome graded |
| 5. Night 6 clear | One complete stock-device 6 AM artifact exists |
| 6. Night 6 reliability | A declared consecutive cohort reports all wins, deaths, aborts, and exclusions |
| 7. 10/20 attempt/clear | Same evidence contract on verified Night 7 configuration |

An abort, lost focus, helper failure, truncated capture, or invalid artifact is
reported separately. It is never silently removed from a reliability cohort.

## Canonical run artifact

Every promoted run must retain or derive:

- commit, dirty-tree status, build/configuration, device, viewport, and night;
- policy/model/schema hashes and simulator preflight result;
- exact emitted and observed input times;
- observations, scores/unknowns, validity windows, and decisions;
- monitor/mask/camera belief and verification transitions;
- focus, watchdog, helper, queue, and cleanup events;
- video and optional audio with common monotonic alignment;
- post-run grading outputs and machine-readable terminal verdict;
- simulator replay priced with the measured actuator/observation trace;
- hashes for retained artifacts and an explanation for anything missing.

Game media remains ignored/local. Commit the manifest, aggregate report, and
non-copyright diagnostic summaries only.

## Promotion gates

### Gate A: offline readiness

- canonical engine/source/device suites pass;
- policy passes ordinary, pinned-worst, and required fault sweeps;
- plan 09 replay and terminal classifiers pass holdout contracts;
- controller has tested `UNKNOWN`, stale, focus-loss, forcedown, and terminal
  paths;
- the exact emitted plan passes the current human/model gate;
- no unreviewed environment switch weakens a guard.

**Stop if:** a required fallback is simulator-rejected or a detector lacks the
positive/negative evidence its branch assumes.

### Gate B: lifecycle dry run

- verify package/version, display geometry, focus, helper token, model hashes,
  storage, recording, and cleanup without starting a survival attempt;
- prove terminal detector behavior against retained non-live fixtures;
- interrupt deliberately and confirm no orphan loop, stuck contact, helper,
  recording, or stale sentinel remains.

### Gate C: shadow night

- run the new controller in shadow beside the current route;
- compare expected actions and beliefs against the recording;
- require no unexplained deadline misses or permanent belief inversion;
- replay the session offline and reproduce the shadow decisions.

### Gate D: one bounded live branch

Promote one branch whose timeout/unknown fallback is already safe. Monitor
forcedown recovery or monitor/mask verification is preferable to a new threat
detector. Record the control mode and the exact branch authorized.

**Gate:** action, verification, and any recovery land inside measured p99 plus
explicit model margin. No unrelated policy change rides along.

### Gate E: complete Night 6 ownership

- controller owns launch/sync through terminal stop;
- recording and structured trace cover the full attempt;
- every forcedown/recovery is verified;
- terminal grader agrees with retained frames;
- offline replay explains the same decisions and outcome;
- artifact validator reports no missing mandatory component.

The first valid attempt may be a death. Operational closure means the evidence
chain is complete, not that failure is relabeled success.

### Gate F: Night 6 clear and cohort

After one full 6 AM artifact, predeclare a consecutive cohort size and retry
rules. Report:

- wins, deaths by cause, aborts, invalid artifacts, and operator interventions;
- survival-time distribution;
- observation unknown/late rates and verification recoveries;
- resource minima and model-versus-device disagreements;
- exact commit/model/configuration for every run.

Do not tune inside the cohort. A change starts a new versioned cohort.

### Gate G: 10/20 promotion

Require all of the following:

- verified Night 7 configuration and terminal lifecycle;
- exact simulator policy success under measured observation/actuator faults;
- no dependency on a rejected non-audio fallback;
- holdout evidence for every Night 7-only action-driving observation;
- resource margin after real p99 sensing/verification costs;
- one explicit safety/recovery review of BB, Foxy, Golden Freddy, forcedown,
  music box, and camera stalls.

Begin with shadow and bounded branches again. A Night 6 clear does not transfer
its AI table, resource budget, or observation assumptions automatically.

## Failure taxonomy

Every unsuccessful run receives exactly one primary layer and optional
contributing causes:

- mechanics/model mismatch;
- policy decision;
- observation false/unknown/stale/late;
- action rejected/dropped/late;
- belief synchronization/recovery;
- resource starvation;
- lifecycle/focus/helper/recording fault;
- operator or configuration error;
- game death with controller behaving as designed.

Use counterfactual replay from plan 11 to support attribution. Do not diagnose
from the jumpscare character alone when an earlier desync or missed flash can
be the root cause.

## Reporting

Publish a dated report for each promoted level containing:

- claim and explicit non-claims;
- configuration and provenance;
- pass/fail gates;
- cohort selection rules;
- aggregate outcome table;
- representative minimized failures;
- links to committed schemas/reports and local artifact hashes;
- open discrepancies and next permitted experiment.

Videos are demonstrations, not the sole evidence. A highlight clear without the
cohort and trace remains level 5, not a reliability claim.

## Done when

- one complete Night 6 attempt has a valid end-to-end artifact and replay;
- one stock-device Night 6 clear, if achieved, is reported at the correct claim
  level without implying 10/20;
- a versioned consecutive cohort quantifies reliability before policy tuning;
- every exclusion or invalid run is visible;
- 10/20 remains gated until its own observation, policy, resource, and recovery
  contracts pass.

## Non-goals

- promising that a clear will occur by a date or run count;
- running unattended beyond the device/lifecycle safeguards;
- optimizing for a publishable video at the expense of trace completeness;
- weakening fail-closed behavior to increase apparent survival;
- treating simulator, modified-game, Night 6, and 10/20 results as equivalent.
