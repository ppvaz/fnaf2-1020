# Stock-device observation corpus and replay contract

**Status: proposed 2026-08-26.** The repository has useful labeled visual sets,
night recordings, HID traces, projection snapshots, and PCM captures, but they
are collected and evaluated by subsystem. This plan gives them one session and
replay contract. It does not replace the existing SCM1 or cue evaluators.

## Goal

Make every observation that can change a live action reproducible offline.
Calibration, holdout, timing, provenance, and controller decisions should be
replayable without the phone or commercial game.

The first contract covers three kinds of evidence:

1. **lifecycle:** title/menu, live night, death/static, 6 AM/win, focus loss;
2. **actuator state:** monitor up/down/in transition, mask on/off/in transition,
   selected camera, vent light accepted or `nolight`;
3. **policy observations:** BB left opening, Golden Freddy guards, clock/epoch,
   and the audio cues already scoped by
   [`08-audio-cue-controller.md`](08-audio-cue-controller.md).

## Why this is separate from plan 08

Plan 08 owns audio-source mapping, detector design, IPC, latency, and the rules
for promoting a cue into a decision. This plan owns the shared **recording and
replay envelope** used by audio, visual, lifecycle, and action-verification
models. Audio work should emit the same session identifiers and decision records
without being reimplemented here.

## Current evidence to preserve

- SCM1 building/replay already separates calibration and holdout directories.
- The BB left-opening boundary has a held-out model and live-loop use.
- Golden Freddy has only provisional positive evidence and must stay fail-safe.
- Projection `GRID` and single-value reads have similar measured cost; their
  pixels are a different sensor from raw `screencap` and need their own labels.
- Audio and projection frames share `System.nanoTime()` inside the cue helper.
- `grade-run.sh` already centralizes survival, trace, camera, wind, desync, and
  optional audio reports.
- A 1–3% one-second cue-read tail was traced to orphaned loops and fixed. Corpus
  metadata must retain tail latency and lifecycle faults, not only valid reads.

## Session format

Raw captures remain ignored. Commit a schema, examples with synthetic data, and
aggregate reports; do not commit game imagery or audio.

Each session manifest should contain:

```text
schema version
session id and start/end monotonic timestamps
game package, version/build, night/configuration
device, display geometry, orientation, projection geometry
runner commit and dirty-tree flag
controller/policy version
sensor/model names and hashes
capture commands and relevant environment switches
terminal outcome and its evidence
artifact paths, sizes, hashes, clocks, and truncation flags
```

Each observation/decision record should contain:

```text
timestamp and source clock
sensor and model version
requested label set
value, score/margin, or UNKNOWN reason
valid-from / valid-until interval
controller state before the read
decision and deadline influenced by the read
action result or terminal outcome
link to the source frame/window when retained
```

Use JSON Lines for ordered records and a versioned JSON manifest. A schema
version change must fail old replay explicitly rather than silently reinterpret
fields.

## Work packages

### 1. Inventory and normalize existing captures

- Enumerate current ignored capture layouts and every producer/consumer.
- Define which artifacts are authoritative versus derived.
- Add a read-only migration/index command; do not rename or rewrite old captures
  automatically.
- Mark unlabeled, ambiguous, truncated, post-death, or clock-incomparable data as
  such. Never infer a positive label from a filename alone.

**Gate:** the index explains every retained artifact or marks it unusable with a
reason, and does not expose tokens or device-specific secrets.

### 2. Introduce the manifest and event schema

- Add schema validation and synthetic fixtures.
- Give `trial-minus7.sh`, cue-helper capture, SCM1 collection, and `grade-run.sh`
  one session ID and monotonic origin.
- Record model hashes, not merely model filenames.
- Preserve raw source timestamps; derived alignment belongs in a report field.

**Gate:** a deliberately malformed, mixed-build, stale-model, or cross-clock
session fails validation.

### 3. Build one replay entry point

The replay command should:

- run the relevant visual/audio/lifecycle classifiers;
- reproduce `UNKNOWN` and deadline-expired results;
- compare recorded and current classifications;
- optionally feed ordered observations to the pure policy interface from plan
  10 without emitting device input;
- print a confusion matrix and transition/decision diff;
- exit nonzero on a declared regression contract.

Keep SCM1 and cue-specific evaluators authoritative for their math. The shared
entry point orchestrates them and normalizes results rather than hiding them
behind a new generic classifier.

### 4. Enforce session-level calibration and holdout splits

- Split by complete capture session, device/build, and sensor path.
- Forbid adjacent windows from one recording appearing in both sets.
- Report sample counts, session counts, false positives, false negatives,
  unknowns, and 95% binomial bounds.
- Derive acceptable error rates from a policy failure-injection sweep; do not
  select a convenient generic accuracy threshold.

**Gate:** every action-driving model has a named holdout contract. A model with
insufficient positives remains shadow-only or fail-safe regardless of aggregate
accuracy.

### 5. Add lifecycle and action-state labels

Prioritize labels by their ability to close the loop:

1. live night versus death/static versus 6 AM/win;
2. monitor stable up/down versus transition/unknown;
3. mask stable on/off versus transition/unknown;
4. vent light accepted versus `nolight`;
5. selected-camera identity where the policy depends on it;
6. threat-specific models already justified by the simulator.

For terminal state, false win is never acceptable. A terminal `UNKNOWN` stops
input and preserves evidence; it must not be converted to retry or success.

### 6. Soak and fault replay

Exercise projection revocation, helper death, stale token, focus loss, truncated
recording, clock discontinuity, full queue, late result, missing model, and
controller interruption. Retain the fault as a first-class observation.

**Gate:** no fault can silently become `empty`, `safe`, `night`, or `win`.

## Deliverables

- versioned manifest/event schemas and synthetic fixtures;
- capture index/migration report;
- one orchestration/replay command with a documented exit contract;
- session-split detector reports for each promoted observation;
- integration in `grade-run.sh` and the canonical tool index;
- updated device documentation describing which models are shadow, fail-safe,
  or action-authorized.

## Done when

- one retained run can be replayed from sensor inputs through policy decisions
  without a connected phone;
- every action-driving observation names its model hash, holdout, latency
  distribution, validity interval, and `UNKNOWN` behavior;
- terminal state is independently graded and cannot confuse an aborted/title
  recording with survival;
- a detector or policy change produces an explicit replay diff;
- raw commercial-game media and credentials remain outside git.

## Non-goals

- building a universal computer-vision framework;
- replacing SCM1, cue features, or post-run graders with one opaque model;
- using modified-game internal state as production input;
- collecting more data before the session and label contract exists.
