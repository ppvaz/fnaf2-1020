# Stock-device controller core and act-then-verify loop

**Status: proposed 2026-08-26.** `trial-minus7.sh` is the sole current device
route and already contains focus guards, an epoch latch, generated HID windows,
visual reads, forcedown-aware recovery, a watchdog, and post-run grading. This
plan makes those behaviors an explicit controller contract without rewriting a
working runner all at once.

## Goal

Close the loop against the stock Android game with an auditable
**observation → belief → policy → action → verification** state machine.

The controller must know when it is synchronized, when the game revoked its
assumed state, how much deadline remains for recovery, and when the run ended.
It must preserve the existing exact-model and safety gates.

## Dependencies

- Plan 09 supplies replayable observations and model provenance.
- Plan 08 owns audio-specific observation gates; audio remains optional.
- Plan 07's shared shell-lifecycle extraction may be done opportunistically,
  but this controller must not wait for an unrelated refactor.
- The exact simulator remains authoritative for policy deadlines and recovery
  safety.

## Architectural contract

Use explicit records even if the first implementation remains generated shell:

```text
Observation { at, validUntil, kind, value|UNKNOWN, modelHash, margin, reason }
Belief      { lifecycle, epoch, monitor, mask, camera, threats, stalls, boxBudget }
Decision    { at, deadline, action, verify, fallback, evidence, policyVersion }
Action      { start, reports, finish, actuatorMode }
Result      { accepted|rejected|unknown, observedAt, recoveryBudget }
```

The policy transition should be pure and deterministic for a given belief,
observation sequence, and clock. Device I/O belongs behind observation and
actuator adapters. Do not let a classifier call directly press the game.

## Required controller states

```text
PREFLIGHT → LAUNCH → NIGHT_SYNC → ACTIVE
ACTIVE → DEFENSE → VERIFY → ACTIVE
ACTIVE/VERIFY → RECOVERY → VERIFY
any nonterminal state → ABORT
ACTIVE → WIN | DEATH
```

`ACTIVE` may retain Minus 7's scheduled subphases—office check, hall guard,
camera sweep, wind—but they should be state values, not inferred from which
line of a long shell routine is executing.

## Invariants

- One monotonic clock owns deadlines; wall clock is reporting only.
- The game can lower the monitor independently through sourced forcedown.
  Press parity is never accepted as observed state.
- `UNKNOWN` never means empty, safe, or accepted.
- A late observation cannot authorize an action after its `validUntil`.
- Recovery is bounded by the model's remaining fuse and resource budgets.
- Monitor/mask actions are idempotent at the controller interface even if the
  game exposes them as toggles.
- A classifier or helper failure cannot restart itself repeatedly during a
  night or block the HID schedule.
- Win, death, focus loss, helper loss, and policy abort are distinct terminals.

## Work packages

### 0. Establish a verified interaction vocabulary

**Added 2026-08-26.** The project built a timed full-night schedule before it
built a tested vocabulary of the interactions that schedule is made of, and the
gap shows up in three places at once:

- **Panning exists in this repository only as an accident.** The office view
  pans, and the only records of it are two failures the device owner reported
  from watching the phone before any log showed them — *"started panning view
  instead of flashing"* and *"fails to press hall light and moves the vision
  instead"* (`ON-DEVICE-VALIDATION.md`, `HID-MULTITOUCH.md`). Both cost nights.
  There is no pan action, no pan-position observation, and no test.
- **The engine does not model pan at all.** `hallView` is `monitor !== MON_UP`,
  and `ventLightL`, `ventLightR` and the hall light are all reachable
  unconditionally. If reaching the right vent light on a phone requires panning,
  the simulator is pricing a night the device cannot play.
- **`coords.sh` has one vent-light coordinate**, commented "in office this is
  left vent", and none for the right vent — while plan 03 is an entire right-vent
  camp mode. Every office coordinate is implicitly "valid at whatever pan
  position the office opens at", and nothing states or checks that.

So the vocabulary has to be established before, not after, another schedule is
priced against it.

- Enumerate the basic interactions as a closed set: pan left / pan right / pan
  to centre, left vent light, right vent light, hall flash, mask on / off,
  monitor raise / lower, select each camera, wind the box, mute the call.
- For each one, three things and not fewer: the **actuation** (contact geometry
  the phone accepts), a **positive observation** that it happened, and a
  **precondition** naming the state it is valid in — pan position, monitor
  state, mask state.
- Establish whether office coordinates are pan-dependent, and if they are, make
  pan position an observed part of the controller's state rather than an
  assumption.
- Decide, with evidence, whether the exact engine needs a pan state. If reaching
  a vent light costs a pan and a pan costs time, that is a resource the
  simulator currently gives away free.
- Keep every measurement here separate from any policy that uses it.

**Gate:** each interaction in the vocabulary has a device-verified actuation, a
positive verification that distinguishes "it happened" from "it was dropped" and
from "it panned instead", and a stated precondition. A deliberate pan is
demonstrated and observed. The simulator either models pan cost or records a
sourced reason it does not need to.

This package is a prerequisite for act-then-verify (package 3) and for plan 03's
right-vent mode, and it is the layer plans 12 and 13 have been assuming.

### 1. Extract a shadow state transition log

- Define the records above and emit them from the existing runner without
  changing actions.
- Reconstruct expected monitor, mask, camera, and phase from current traces.
- Compare that shadow state with `desync-scan.py`, video grading, and cue-helper
  observations.
- Record every state correction and why it happened.

**Gate:** current retained runs replay to the same actions and known desync
diagnoses. The shadow layer must not change device timing.

### 2. Make the policy transition pure

- Move decision rules into a host-testable module or declarative transition
  table that consumes observations and produces deadline-bearing decisions.
- Keep exact timings generated from the simulator/recipe rather than copied
  into a second hand-maintained table.
- Add table tests for normal cycles, forcedown, attack, `nolight`, stale reads,
  projection loss, focus loss, death, and 6 AM.
- Replay real observation logs through it.

Do not choose a new runtime language until a thin prototype prices startup,
IPC, p99 scheduling, packaging, and cleanup against the current mksh/HID path.
Architecture first; rewrite only if measurements justify it.

### 3. Close act-then-verify in priority order

1. monitor raise/lower and forcedown recovery;
2. mask on/off around lethal office transitions;
3. vent-light acceptance versus `nolight`;
4. camera selection when a wrong feed changes the policy;
5. terminal screen.

Every verification specifies:

- earliest stable read time after the action;
- deadline and p99 observation cost;
- accepted, rejected, transition, and unknown outcomes;
- bounded retry/recovery;
- simulator proof that the recovery remains safe.

The existing verified monitor recovery is the first behavior to migrate, not a
feature to discard.

### 4. Add belief and uncertainty explicitly

- Represent monitor/mask transition as states, not booleans.
- Track BB as a set of possible route positions when observations are missing.
- Track whether camera-stall uniqueness assumptions still hold; a lapse removes
  permissions that depend on them, including cue attribution.
- Record resource floors for music box and flashlight before optional reads.
- Prefer conservative bounded actions only when the simulator proves they are
  conservative; unnecessary mask time is not automatically safe on Night 7.

### 5. Complete lifecycle ownership

- Identify launch/menu/night/live/death/win screens through plan 09 models.
- Start only from a verified configuration.
- Latch epoch with provenance and a confidence interval.
- End input immediately on terminal or focus loss.
- Preserve the complete artifact and return a machine-readable outcome.
- Never automatically call an abort, short capture, or title screen a loss or
  retryable death.

### 6. Promote behind control modes

Run modes, in order:

1. replay only;
2. shadow decisions beside the current runner;
3. verification active, decisions unchanged;
4. one bounded recovery branch active;
5. full controller on Night 6;
6. Night 7 only after plan 12's promotion gate.

Keep the current open-loop/generated route available as a comparison until the
new controller matches its clean timing and improves its measured failure modes.

## Tests

- deterministic transition-table and deadline tests;
- property tests that no `UNKNOWN` authorizes a positive observation;
- forcedown and monitor-parity regression fixtures;
- stale/late observation rejection;
- one-action-drop and one-observation-drop injection;
- replay of retained nights with decision diffs;
- current `human-gate`, engine, plan-interpreter, focus, cleanup, and grader
  suites;
- long soak demonstrating no orphan loops, unbounded logs, queue overflow, or
  helper restart storm.

## Deliverables

- versioned state, observation, decision, and outcome schemas;
- a pure policy transition with replay tests;
- device observation and actuator adapters;
- act-then-verify paths with measured latency and bounded recovery;
- explicit lifecycle/terminal handling;
- structured per-run controller trace consumed by plan 09 and `grade-run.sh`;
- updated tool and device documentation.

## Done when

- the same recorded observations deterministically reproduce the same decisions;
- a sourced forcedown cannot leave the controller inverted for the rest of the
  night;
- monitor and mask state are observed/verified rather than inferred solely from
  press count;
- every late, missing, or ambiguous observation has a tested fallback;
- the controller recognizes and stops on win, death, focus loss, and abort;
- one full Night 6 attempt is controlled and graded end-to-end under plan 12,
  without weakening the exact-model or human-safety gates.

## Non-goals

- importing another bot's timing table or unlicensed code;
- replacing the exact engine with live heuristics;
- enabling Night 7 merely because the controller compiles;
- making audio mandatory for a path whose non-audio fallback is simulator-rejected;
- a big-bang rewrite of `trial-minus7.sh` before shadow equivalence exists.
