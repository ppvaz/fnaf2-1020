# Sensor-independent observations

**Status: proposed 2026-08-26.** Every classifier in this repository is written
against the pixels of one capture method, so the same game fact has to be
re-taught for each way of looking at it — and where it has not been re-taught,
the reading is simply unavailable.

## The problem, in the repository's own words

`docs/device/ON-DEVICE-VALIDATION.md` already states it twice:

> the classifier threshold on that path is **not calibrated** — the luma
> separation came from `screencap` frames and an offline bilinear simulation,
> not from Android's own VirtualDisplay scaler.

> …cannot answer it because the VirtualDisplay scaler is a different sensor.

So the cue helper — the fast path, 42 ms p50 against `screencap`'s 225 ms — has
had a usable *shutter* for some time and still cannot answer "is Balloon Boy in
the left opening", because the answer lives in a model bound to a different
sensor. The fast sensor is blocked on a slow sensor's calibration.

This is not one gap. Today the same fact is potentially readable four ways —
raw `screencap`, the cue helper's projection GRID, `screenrecord` video frames,
and the on-phone `screencheck` binary — and a model built for any one of them
silently misreads the others.

**This plan's own author added to the problem on 2026-08-26**: `title-observe.py`,
`lifecycle-observe.py` and `region-classify.py` all hardcode 2400x1080
`screencap` pixels, and none of them declares that. They work, and they are
exactly the shape this plan exists to stop repeating.

## Goal

Teach the project a game fact **once**. A fact is defined independently of the
sensor that captures it; each capture method provides a calibrated adapter into
the space the fact is defined over; and a model that has not been calibrated for
a sensor refuses that sensor rather than guessing.

Balloon Boy in the left opening is the first fact, because it is the one with a
model on one sensor and a documented, blocked need on another.

## The contract

```text
Fact       "bb-left-opening" -> {present, absent, UNKNOWN(reason)}
           defined once, over a canonical observation space

Sensor     screencap-raw | cue-helper-grid | screenrecord-frame | screencheck
           each with its own geometry, scaler, colour handling and cost

Adapter    Sensor -> canonical space, calibrated, with its own error
Binding    Model declares the sensors it is calibrated for; others are refused
```

Three rules that follow, and each of them is already a lesson this repository
paid for somewhere else:

- **A model names its sensors and fails closed on the rest.** Same rule as the
  title model's build check and the game-package check: refusing is cheap,
  guessing has cost nights.
- **Cross-sensor agreement is measured, never assumed.** Two adapters reading
  the same labelled moment must be checked against each other. Where they
  disagree, that is the finding.
- **A faster sensor may not inherit a slower sensor's thresholds.** That is
  precisely the mistake the cue-helper threshold is currently blocked on.

## Work packages

### 1. Inventory the facts and the sensors

- Enumerate every game fact any tool currently reads: BB in the left opening,
  Golden Freddy in the office, monitor up/down, mask on/off, selected camera,
  vent light accepted, music-box level, night identity and clock, and every
  lifecycle screen.
- For each, list which sensors read it today, which pairing is calibrated with
  held-out evidence, which is calibrated by assumption, and which is absent.
- Include the audio cues under the same treatment: a bang detected in the cue
  helper's PCM and a bang detected in a recording are the same fact through two
  sensors.

**Gate:** every fact/sensor pairing in the repository is accounted for as
calibrated, assumed, or absent — with the assumed ones named individually,
because those are the ones that can be wrong without anyone noticing.

### 2. Define the fact and adapter contract

- Give a fact one machine-readable definition: its label set, its UNKNOWN
  reasons, and the canonical space its predicate is evaluated over.
- Give each sensor an identity covering geometry, scaler, colour handling,
  sampling cost, and the device profile it belongs to (see
  [plans/14](14-device-portability-and-profiles.md), which owns the *device*
  half of this; this plan owns the *sensor* half on one device).
- Specify how an adapter declares its calibration and its error.

**Gate:** synthetic fixtures express one fact through two different synthetic
sensors and both reach the same verdict, while a third, uncalibrated sensor is
refused with a distinct reason.

### 3. Bind the existing models, fail closed

- Make every current classifier declare its sensor: the SCM1/`screencheck`
  models, the BB left-opening model, and the three added on 2026-08-26
  (`title-observe.py`, `lifecycle-observe.py`, `region-classify.py`).
- A frame from an undeclared sensor is refused, not resized into compliance.
  Resizing is what makes a sensor mismatch look like a working reading.

**Gate:** a cue-helper frame offered to a screencap-calibrated model is refused
by name. No classifier silently accepts a geometry it was not built for.

### 4. Measure cross-sensor agreement

- Capture the same moments through two sensors simultaneously and compare the
  verdicts on held-out labels, under Plan 09's split discipline.
- Report agreement, disagreement, and the conditions of each — not a single
  accuracy number.
- A disagreement is a result. Do not tune one sensor to match the other; find
  which is right, or record that it is unknown.

**Gate:** BB left-opening agreement between `screencap` and the cue-helper grid
is measured on session-separated holdouts, and the disagreement cases are
enumerated rather than averaged away.

### 5. Teach Balloon Boy once, then the rest

- Re-express the BB left-opening reading as one fact with two calibrated
  adapters, so the cue helper can answer it at its own cost rather than
  inheriting a `screencap` threshold.
- Only then migrate the remaining facts, cheapest first.
- Retire any duplicate reader that the unified fact replaces, rather than
  leaving both.

**Gate:** the live loop can source BB from either sensor with an explicit,
measured cost and error for each, and the choice is a configuration rather than
a rewrite. The 0/3000 Night 6 result for a route with no BB read still stands as
the reason this fact matters more than the others.

## Test matrix

| Layer | Required coverage |
|---|---|
| Fact contract | label sets, UNKNOWN reasons, an unknown fact name, a malformed definition |
| Adapter | declared vs undeclared sensor, wrong geometry, wrong scaler, missing calibration |
| Agreement | two synthetic sensors agreeing; a deliberately miscalibrated one disagreeing and being caught |
| Regression | every existing classifier's current verdicts unchanged on its own sensor |
| Real device | session-separated holdouts through both real sensors |

## Dependencies and sequencing

- Plan 09 owns the corpus, the split discipline and the clock domains a
  cross-sensor comparison needs; agreement work should use its manifest.
- Plan 14 owns the device profile. A sensor identity is meaningless without one:
  the same cue helper on another handset is another sensor.
- Plan 08's audio cues are facts under this contract too, and should not be
  reimplemented separately.
- Package 5 unblocks the cue helper's 42 ms read for the one decision that
  matters most, which is why it is the mission-relevant end of this plan.

## Done criteria

The project can claim sensor independence when a game fact is defined in exactly
one place, when each capture method that can answer it does so through a
declared, calibrated adapter, when an uncalibrated pairing is refused rather than
approximated, and when cross-sensor agreement has been measured on held-out data
rather than assumed. Two classifiers that happen to agree today are not that.

## Progress log

### 2026-08-27 — opened, BB-first, on Pedro's directive: "anything screencap-dependent must be dropped, the cue helper is the response" (scope: everything, graders included)

**Why now.** `plans/PROGRESS.md` item 13 was pointing the sub-70 nights at
"device-actuator overhead"; the correction there (same date) found the one real
device capture cost in the live loop is the 225 ms `screencap` BB read in
`trial/08-bb-threat-response.sh`, and this plan's package 5 is its named fix.
Note the read cost is **not** an n5/n6/n7 survival lever (the gate is flat from
`readLatencyMs` 550 → 100) — this is architecture and honesty, not a night
fix. It is still worth doing: it is the last `screencap` in the reactive path
and the thing that lets every fact live on one sensor.

**Landed (package 4, instrumentation only — no behaviour change):**

- `trial/02-hid-wire.sh` gains `cue_grid()`, the `GRID` verb companion to
  `cue_snapshot()`. Same contract: device-local loopback, short timeout,
  failure ignored, never stalls the schedule.
- `trial/08-bb-threat-response.sh` launches `cue_grid` **in parallel with**
  `screencap` (backgrounded before the prophylactic mask, reaped after it — so
  it costs the mask-off seam nothing) and writes the `OK grid=20x9 …` line to
  `KEEP_DIR/NNNNNN-<class>.grid` for **every** read, `empty` included. `empty`
  is the class the screencap corpus has plenty of and the grid corpus has none
  of, and the line is ~1.1 KB against a 10 MB frame. The per-cycle log line now
  carries `grid=<seq|MISS>`.
- `test-hid-walltime.mjs` pins the ordering (grid launch before the mask press,
  reap after) and the empty-class write.

So the next device night through `trial.sh` accretes a real
VirtualDisplay-scaler corpus paired with the SCM label the screencap produced.
`tools/device/grid-signature.py` already reads exactly these `.grid` lines
(`load()` → source `grid`, not the provisional `screencap` box-filter).

**Not yet done:** the same paired capture at `trial/06-cams-up-anchor.sh` (the
post-resync monitor check) and `trial/04-session.sh` (the epoch latch); the
fact/adapter contract (package 2); binding the existing classifiers to declare
their sensor (package 3); and the signature build + cross-sensor agreement
(packages 4–5) once the corpus has frames. The graders
(`screenstate.py`, `grade-*.py`, `elegance.py`, `region-classify.py`,
`title-observe.py`, `lifecycle-observe.py`, `intro_card.py`, `nightpredicate.py`)
are in scope per the directive but come after the live loop.
