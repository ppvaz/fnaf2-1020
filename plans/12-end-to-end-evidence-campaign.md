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

## Offline blocker: the emitted route's per-night ladder (measured 2026-08-26)

Levels 4–7 are blocked offline, before any phone is involved. Everything below
is **in the simulator**; reproduce with

```sh
node tools/device/test-night-matrix.mjs            # the human-gate column
node tools/hidpilottest.mjs 200 --night=N --device-sweep --pulse-light \
  --sweep-slot-ms=120 --mask-margin-ms=900 --read-latency-ms=480 \
  --pilot-offset-ms=167 [--device-actuator] [--press-late-ms=MIN,MAX]
```

### The human gate (`recipe.devicePlan` replayed at ±60 ms iid slack, 100 seeds)

| Night | Foxy AI (capped) | exact replay | gate ±60 ms | Foxy deaths | mechanism |
|---|---|---|---|---|---|
| 1 | 0 | 100/100 | **99** | 0 | — |
| 2 | 1 | 100/100 | **77** | 17 | missed BB read |
| 3 | 2→3 | 100/100 | **89** | 8 | missed BB read |
| 4 | 7 | 100/100 | **85** | 12 | missed BB read |
| 5 | 5→7 | 100/100 | **78** | 13 | missed BB read |
| 6 | 10→15 | 100/100 | **46** | 48 | both |
| 7 (10/20) | 17 | 100/100 | **12** | 88 | Foxy phase island |

`GATE_MIN_SURVIVAL` is 40/100, so **Night 7 is the first night the route cannot
run at all**, and Night 6 clears by six points. Two independent mechanisms
produce that curve, and separating them was the whole point — the death string
says "foxy" for both:

- **Nights 2–6 — the missed Balloon Boy read.** Slack on the `read` row makes
  the classifier miss BB in the opening; he reaches the office, *disables the
  flashlight* (`hallLightOn` requires `!bb.inside`), D climbs unchecked and Foxy
  executes. Control: at the fatal check the route had been dark for a median
  **1022–1322 frames (17–22 s)** with D = 17–27, and **every** such death
  (11/11, 6/6, 10/10, 11/11, 4/4 on Nights 2–6) had BB inside the office for
  >80% of that window. This is the sourced BB→Foxy chain, not a timing bug.
- **Night 7 only — a one-frame Foxy phase island.** The flash lands normally
  (median dark interval **293 frames = 4.9 s**, exactly one cycle) and D reaches
  5. `20 - 17 = 3` is the largest safe D at the 10/20 Foxy cap, so 5 is fatal —
  while the same D = 5 is safe on every night up to AI 15. The route only
  replays Night 7 exactly because the sweep's trailing camera light overlaps the
  next cycle's monitor drop by **one frame** and zeroes D a second time. Moving
  the cycle-opening `tap monitor` +16 ms, or the trailing `sweep` −8 ms, takes
  exact Night 7 replay from 20/20 to 0/20. Full derivation:
  [`MINUS-7-STRATEGY.md` §3.1](../docs/strategy/MINUS-7-STRATEGY.md).

**No knob setting rescues Night 7.** Searched, each against Night 7's own AI
table at ±60 ms: `hallPulseMs` ∈ {50,80,100,130,170,220,300}; `readLatencyMs` ∈
{200…900}; `maskMarginMs` ∈ {0…1000}; `pilotOffset` ∈ {0…60 frames}; and, as a
diagnostic outside the emitter's documented freedoms, sliding the whole
down/hall/up beat 300–800 ms earlier to restore the canonical `:X2` phase. The
best knob value is the shipped one (12/100). The beat slide is the only lever
that moves anything — Night 6 **46 → 80**, Night 7 **12 → 31** — and it still
misses the 40/100 bar, because the Balloon Boy branch holds the mask for 4.85 s
with no flash and its mid-cycle 5 s check is unreachable by any single flash the
plan's two-row shared prefix can schedule. `GATE_MIN_SURVIVAL` and
`HUMAN_SLACK_MS` were not touched, and must not be.

### The measured actuator (`tools/device/actuator.mjs`, HID pilot, 200 nights)

`recipe.replay()` has no actuator path, so this prices the *pilot* at the
`hidpilot n6 target` settings, not the emitted plan.

| Night | no actuator | lateness 0 ms | uniform 110 ms | full band 110–300 ms | dominant death under the band |
|---|---|---|---|---|---|
| 1 | 200/200 | 200/200 | 68/200 | **23/200** | `inside-office` (Toy Chica) |
| 2 | 200/200 | 200/200 | — | **0/200** | `inside-office` |
| 3 | 200/200 | 200/200 | — | **0/200** | `inside-office` |
| 4 | 200/200 | 200/200 | 0/200 | **0/200** | `foxy` / `inside-office` |
| 5 | 200/200 | 200/200 | — | **0/200** | `inside-office` |
| 6 | 200/200 | 200/200 | 0/200 | **0/200** | `inside-office` (W. Freddy) |
| 7 | 200/200 | 200/200 | 0/200 | **0/200** | `golden-freddy`, 168/200 |

So the actuator cliff is at **Night 2**, four nights earlier than the human
gate's, and it is not the Night 7 Foxy mechanism at all.

Which part is real actuator error and which is the pilot model's missing closed
loop, measured rather than asserted:

- **The mask seam costs nothing here.** 0 seam-dropped monitor presses in
  237,987 / 138,068 / 116,710 / 104,761 / 58,219 / 40,886 / 7,485 sent on
  Nights 1–7. `MASK_RAISE_GAP_MS` = 180 is doing exactly its job.
- **All of it is lateness, and it is not spread.** A *constant* 110 ms with zero
  spread already gives 68/200 on Night 1 and 0/200 on Nights 4/6/7. Contrary to
  `actuator.mjs`'s header ("the mean is nearly free… the epoch offset dials it
  out"), the epoch does **not** dial it out on this route: scanning
  `--pilot-offset-ms` over 0–300 ms in 17 ms steps leaves Night 1 flat at
  68/200 and Night 6 flat at 0/200. That header claim needs re-scoping to the
  route it was measured on.
- **It is the open loop, not the phone.** The same actuator over the
  monitor-resyncing pilot (`pilottest --vent --sync`) is nearly free:
  200→200, 15→29, 97→79, 8→10, 0→0, 0→0, 0→0 on Nights 1–7. The HID route's
  200/200 → 0/200 is therefore a statement about open-loop monitor toggling at
  measured lateness, and the live runner's checkpoint read and verified recovery
  are the untested variable. Nothing in this repository models that recovery, so
  **how much of the gap is recoverable is currently unmeasured** — that is the
  first thing the campaign should instrument, not a number to assume.

  **Retracted 2026-08-26 — the comparison was confounded, and the answer is
  zero.** See the section below. The recovery is now modelled and reclaims
  nothing; and `--sync` was never what made the `pilottest` route
  actuator-tolerant, because the same route with the resync *removed*
  (`pilottest --vent`, unconditional monitor toggling) is equally tolerant:
  200/27/72/6/0/0/0 against `--vent --sync`'s 200/29/79/10/0/0/0 on Nights 1–7,
  in the simulator. The bullet changed the *route* as well as the loop and
  credited the difference to the loop. The reasoning is kept because the
  measurement it prompted is the one that refuted it.

### The closed loop, modelled and priced (measured 2026-08-26)

`tools/device/actuator.mjs` now carries `MonitorSupervisor`, a model of
`trial-minus7.sh`'s actual monitor loop — the flip gate in `light_down_at`
(wait `MONITOR_ANIM_DOWN` from the *logged* press, read the cue helper, confirm
with a second read, correct only if both agree), the classifier checkpoint's
`cams=UP-DESYNCED` question and its verified two-press recovery with
`MASK_ALREADY_OFF`, the read costs, and the `desyncs -le 12` abort. It is
deliberately not an idealised controller: it is one-directional, it looks twice
a cycle and nowhere else, and it reads a screen state rather than a toggle
parity. Reproduce with `node tools/closedlooptest.mjs`. **In the simulator:**

| Night | exact | actuator, open loop | actuator + modelled loop | reclaim | free ideal bidirectional resync | `--vent --sync` route ref |
|---|---|---|---|---|---|---|
| 1 | 200/200 | 23/200 | **23/200** | **0** | 23/200 | 200/200 |
| 2 | 200/200 | 0/200 | **0/200** | **0** | 0/200 | 29/200 |
| 3 | 200/200 | 0/200 | **0/200** | **0** | 0/200 | 79/200 |
| 4 | 200/200 | 0/200 | **0/200** | **0** | 0/200 | 10/200 |
| 5 | 200/200 | 0/200 | **0/200** | **0** | 0/200 | 0/200 |
| 6 | 200/200 | 0/200 | **0/200** | **0** | 0/200 | 0/200 |
| 7 | 200/200 | 0/200 | **0/200** | **0** | 0/200 | 0/200 |

**The reclaim is zero on every night, and the loop is not idle while producing
it.** Over 200 Night 6 seeds it takes 2306 cue reads, finds and repairs 86
genuine inversions, and never once corrects a monitor that was not up. Removing
only the corrective press — keeping every read and paying for it — leaves those
86 inversions to reach the classifier as `cams=UP-DESYNCED`, and survival is
identical either way. Mean time alive moves 61.9 s → 61.7 s.

The control that settles it is the last column but one: a **free, instantaneous,
always-correct, bidirectional** repair of the pilot's monitor belief — strictly
better than anything the shell can do, and not a model of the runner — also
changes nothing, on any night. No monitor loop recovers the actuator cliff,
because the cliff is not a desync.

**What the cliff actually is.** Under the actuator the camera stalls lapse and
marker-122 occupants reach the office opening at all, which the exact route
never permits: office cues over 200 nights go **0 → 134** (Night 1) and
**0 → 217** (Night 6), and 177/180 of those nights end in an `inside-office`
death when the 45-frame office-defense fuse expires. The loop leaves the cue
count unchanged to the unit (134 → 134, 217 → 217). The mechanism is the one the
route's own emitter already documents: the sweep has to land *exactly* on its
anchor because the stun it refreshes bridges the five-tick mask with nothing to
spare, and 110–300 ms of launch lateness is 7–18 frames of exactly that. This is
consistent with the earlier finding that a *constant* 110 ms is already fatal
and no `--pilot-offset-ms` dials it out: the loss is the sweep's geometry, not a
phase.

Controls, and their results (Night 6 / Night 1, 200 seeds each, in the simulator):

| Control | Expected | Result |
|---|---|---|
| classifier's monitor read always wrong | must not help | 0/200 and 2/200 — **hurts** (61.9 s → 52.8 s alive; 200/200 corrections taken on a monitor that was down) |
| correction removed, reads retained | must gain nothing | 0/200 and 23/200 — identical to open loop, and the 86/24 desyncs it declined to fix reappear at the classifier |
| cue reads the cams as up for 600 ms after the press (samples inside the flip) | must be able to *cause* desyncs | 199/200 nights desync, alive 61.7 s → 22.6 s on Night 6 — the night 6-38 failure, reproduced |
| flip-animation window anchored to the press's *landing* instead of its log | sensitivity of the sourced 202 ms | 85/200 false corrections, alive 61.7 s → 54.5 s |
| gate wait cut to 100 ms | (no-op, and worth knowing) | unchanged: `wait_until` on a past offset returns at once, so nothing can move the read earlier than the plan's 360 ms read position |
| flip gate only / checkpoint only | separate the two sensors | the gate does all the work — with it on, the classifier checkpoint sees **0** desyncs; with only the checkpoint, 91 |

One honest wrinkle in the controls, recorded because it is the strongest
evidence for the mechanism above: on Night 1 the two *deliberately broken* loops
**improve** survival (23/200 → 36/200 and → 57/200), trading `inside-office`
deaths for `puppet` deaths. A loop whose false corrections invert the monitor
stops the pilot executing the geometry that was killing it. That is not a
defence of a broken loop; it is another measurement saying the deaths are
geometric.

Pinned in `tools/device/test-actuator.mjs`, including the vacuity guard — if
there is nothing for the loop to correct, the zero is not a result.

### What this means for the ladder

Working Nights 1–6 in order is the right call and is not blocked: Nights 1–5
clear the human gate with 78–99/100 and Night 6 with 46/100. The two things that
must land before Night 7 is even attemptable are (a) a Foxy reset the Balloon Boy
attack cycle can reach — which the plan grammar's two-row shared prefix cannot
express today — and (b) a modelled closed-loop monitor recovery, without which
every night ≥ 2 is 0/200 through the measured actuator. Neither is a knob.

**(b) is answered, and it was the wrong question (2026-08-26).** The recovery is
modelled and reclaims 0/200 on every night, as does a free ideal one. The
actuator cliff is the sweep's stun geometry under 7–18 frames of launch
lateness, not a monitor desync, so the item that replaces (b) is *a route whose
camera sweep tolerates the phone's lateness* — and that is a route question, not
a controller question. Nights 2+ do not become viable through the phone model by
adding a loop.

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
