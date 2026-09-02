# Device portability and coordinate profiles

**Status: active, foundation landed; portability gates remain open
(2026-09-02).** The original problem statement below was accurate on 2026-08-26
and is retained as historical context. The current repository already has a
versioned `device-profile-v1`, an explicit adapter/capability registry, profile-
bound calibration IDs and semantic control maps, profile resolution, and
fail-closed campaign preflight. The canonical candidate is still the Moto g56
5G / `com.scottgames.fnaf2` v2.0.7 path, and its live profile remains
`dryRunOnly`.

The remaining work is to complete the profile's device/layout semantics, bind
all models and timing to it, reproduce the calibrated profile through a
manifested calibration session, and validate or refute the inferred rules on a
second handset. Legacy `tools/device` scripts and `coords.sh` remain comparison
surfaces; they are not the current composition boundary.

This plan does not promise the project runs on a second device. It makes the
device an explicit, checkable record, separates what translates by arithmetic
from what must be re-measured, and refuses the pairings that cannot be trusted.

## Goal

Make "which device, which build, which settings" a first-class record that
every coordinate, model and timing constant is bound to, so that a new handset
is a calibration session with a known cost rather than an open-ended porting
exercise — and so that a model built for one profile can never silently run
under another.

## Three kinds of coupling, which do not translate the same way

This is the central distinction; getting it wrong is how a "port" produces
numbers that look fine and mean nothing.

| Kind | Examples | Translates how |
|---|---|---|
| **Geometry** | the 25 taps in `coords.sh`, the title model's bands and gate boxes, `screenstate.py`'s HUD boxes, the HID axis transform | **By arithmetic**, within one aspect ratio |
| **Layout mode** | where the canvas sits inside the panel; where the on-screen controls sit | **By measurement**, per device — it depends on the game's own settings |
| **Pixel models and timing** | `screencheck`/SCM1 nearest-template models, the BB left-opening model, the 100 ms contact floor, 49–93 ms launch lateness, the 180 ms mask→monitor seam | **Not at all** — recapture or re-measure |

### What is already evidence

- **Same-aspect scaling is a pure factor.** The retained 2026-08-25 recording is
  1280x576, exactly **1.875x** smaller than 2400x1080, and the title-item bands
  measured through it match the native screencap within noise (`newGame`
  0.069–0.072 upscaled against 0.067–0.072 native, 2026-08-26). Two sensors,
  one scale factor, agreeing. `[CALIBRATED]`
- **A device-specific transform is now consumed by the modern boundary.**
  `HID-MULTITOUCH.md` §"Coordinate mapping on this phone" carries
  `rawX = (1080 - screenY) * 20 / 9`, `rawY = screenX * 9 / 20`, with the note
  "keep this device-specific mapping in the controller. Recalibrate it for a
  different resolution or orientation." `device-profile-v1` now supplies the
  selected geometry/control-map and calibration bindings to the modern device
  composition, while the complete normalized mapping and second-device proof
  remain open. `[SOURCED to the repo's own measurement]`
- **The game's Options are part of the profile.** A fresh install reports
  Display Mode `Full`, Perspective Effect `On`, Controller Size `120%`
  (2026-08-26). Controller Size moves and scales the on-screen controls;
  Display Mode decides whether the canvas stretches, letterboxes or crops;
  Perspective Effect is what every office screen model was built under. The
  current profile boundary records target/build, geometry, adapter, control-map,
  and calibration provenance, but the full panel/options record planned here is
  not yet complete. `[CALIBRATED]` for the measured g56 values only.

### What is not evidence

**Cross-aspect translation is `[INFERRED]` and must stay so.** Everything above
was measured at one aspect ratio on one panel. Whether a 16:9 tablet letterboxes
or crops, and whether the controller scales with the canvas or independently of
it, is a guess until a second device says otherwise. This plan may not label any
cross-aspect rule `[CALIBRATED]` on the strength of arithmetic alone.

## Invariants

- A coordinate, model, or timing constant names the profile it was measured
  under. An unnamed one is refused, not defaulted.
- A model may not run under a profile it was not built for. This is the same
  rule the title model and the game-package check already enforce, generalised:
  fail closed, and say which profile was expected.
- Geometry may be derived; pixel models and timing may not. A ported classifier
  is a new classifier and needs its own calibration and holdout under Plan 09's
  split discipline.
- The current handset's behaviour is pinned. A refactor that changes an emitted
  coordinate or plan on the calibrated device has failed, whatever it does for
  portability.
- Cross-device claims follow Plan 12's ladder. Running on a second device is not
  evidence of clearing on it.

## Work packages

### 1. Inventory and classify the coupling

- Enumerate every device-specific constant: tap coordinates, classifier band and
  gate boxes, `screenstate.py`'s scanlines and boxes, the HID axis transform, the
  `screencheck` model geometry, capture sizes, and the measured timing floors.
- Classify each as geometry, layout-mode dependent, pixel model, or timing, and
  record which are load-bearing for a live action versus only for grading.
- Name, for each, what a new device would have to do to obtain it: derive,
  measure, or recapture.
- Read-only. Do not move a constant in this package.

**Gate:** every device-specific constant in `tools/device` is accounted for with
its kind and its acquisition cost, or explicitly marked unknown with a reason.
The inventory names the ones no arithmetic can port.

### 2. Complete the device profile record — foundation exists; closure open

- Extend the versioned profile with panel resolution, aspect, orientation, the game
  package and build, the in-game Options that affect layout (Display Mode,
  Controller Size, Perspective Effect), and the HID axis transform.
- Keep the existing Moto g56 v2.0.7 values bound to the first profile, unchanged.
- Continue moving ownership from the legacy `coords.sh` values into the profile,
  without changing any emitted coordinate on the calibrated device.
- Follow Plan 09's manifest rules: the profile is provenance, and it belongs in
  a session manifest.

The initial `device-profile-v1` and `resolveProfile()` boundary now exist in
`packages/core` and `packages/adapters`; the profile is immutable after
resolution and its adapter/calibration/control-map pairing is checked before
composition. This is a foundation, not a portability qualification.

**Gate:** the calibrated device's emitted coordinates and device plan are
byte-identical before and after. A session records its profile. A missing or
partial profile is refused.

### 3. Separate the canvas mapping from the controller mapping — partial foundation

- Express game-art coordinates in a normalized canvas space and controller
  coordinates in their own, because Controller Size scales the on-screen bars
  independently of how Display Mode places the canvas.
- Derive screen pixels from profile plus normalized coordinate.
- The current g56 canvas mapping and corrected semantic control coordinates are
  bound in the profile; the generic normalized derivation is not yet complete.
- Prove the two mappings are genuinely separate on the calibrated device by
  changing Controller Size and re-measuring, rather than asserting it.

**Gate:** a Controller Size change moves the mask/monitor bars and does not move
the office art, as predicted by the two mappings, and the prediction is recorded
before the measurement is taken.

### 4. Bind models and timing to their profile, fail closed — foundation exists;
closure open

- Every classifier model (title, SCM1/`screencheck`, BB left opening) records the
  profile it was built under and refuses a mismatch.
- Measured timing constants record the device they were measured on; a run on a
  different device may not silently inherit them.
- Extend the existing preflight so a profile mismatch is refused with the same
  clarity as the wrong game package.

The modern registry and campaign preflight already refuse missing/incompatible
adapter, calibration, control-map, and candidate-profile combinations. The
remaining gate is to bind every pixel model and timing artifact—not only the
current geometry/visual/detector IDs—and retain the refusal fixtures and live
qualification evidence.

**Gate:** a synthetic mismatched pairing — right game, wrong panel; right panel,
wrong Options; a model with no profile — is refused with a distinct reason for
each, before any input is sent.

### 5. Define the new-device calibration session

- Specify the minimum capture set that pins a new profile: title states, office
  at rest, each control's hit region, and the timing probes.
- Make each step produce a manifested artifact under Plan 09's contract.
- State plainly what the session cannot pin, and what therefore has to be
  recaptured or re-measured rather than derived.

**Gate:** the session is runnable end to end against the calibrated device and
reproduces its existing profile from scratch, as a control. A session that skips
a step fails rather than producing a partial profile.

### 6. Validate on a second device

- Run the calibration session on a genuinely different handset.
- Compare derived geometry against measured geometry and record the error.
- Promote or retract each cross-aspect rule this plan marked `[INFERRED]`.
- Record what broke. The expected failures are the pixel models and the timing
  constants, and finding that they broke is the result, not a setback.

**Gate:** a second device either runs the offline and shadow path under its own
profile, or the plan records exactly which of its assumptions the second device
refuted. Both close this package; neither may be skipped.

## Test matrix

| Layer | Required coverage |
|---|---|
| Pure profile | valid profiles, missing fields, unknown schema version, contradictory Options |
| Derivation | same-aspect scaling against the 1.875x recording control, round-trip canvas↔screen, boundary coordinates |
| Mismatch | model without a profile, model from another panel, another Options set, another game build |
| Pinning | the calibrated device's coordinates and emitted plan unchanged across the whole refactor |
| Real device | the calibration session reproducing the existing profile; then a second handset |

## Dependencies and sequencing

- Plan 09 owns the manifest the profile is recorded in; its schema/producer
  foundation is ready, while validation of a real phone manifest remains open.
- Plan 10 package 0 owns the interaction vocabulary. The modern semantic
  control-map already consumes that boundary; unresolved actions and the right-
  vent geometry stay explicit UNKNOWNs rather than being copied from legacy
  coordinate tables.
- Plan 22 owns the current workspace, contract, capability, profile-resolution,
  and composition architecture. This plan owns the portability-specific
  calibration and cross-device gates.
- Plan 12 remains the authority for claims. A second device that runs is not a
  second device that clears.
- Packages 1–5 are local and need only the calibrated handset. Package 6 needs
  hardware this project does not currently have, and blocks nothing else.

## Done criteria

The project can truthfully claim device portability when a new handset is a
bounded calibration session with a written cost, when every coordinate, model
and timing constant names the profile it belongs to and refuses a mismatch, when
the calibrated device's behaviour is provably unchanged by the indirection, and
when a second device has either validated the derived geometry or refuted it on
the record. Running the same script on two phones is not that claim.
