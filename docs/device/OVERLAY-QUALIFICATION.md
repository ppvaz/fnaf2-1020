# Cue Helper overlay qualification

This is the device-side evidence protocol for Plan 23. It is intentionally
separate from the host contract tests: a passing geometry test cannot prove
Android compositor behavior or touch delivery.

## Current disposition

The checked-in controller starts with the status
`UNQUALIFIED(self-capture-unqualified)`. Therefore an
explicit overlay permission alone does not attach a window beside authoritative
sensing. The target configuration is unsupported until this document's paired
HUD-off/HUD-on capture and input matrix are retained for the exact FNaF 2 APK
and Moto g56 build.

## Required retained record

One JSON record must accompany each qualified profile. Values below are
illustrative field names, not a claim that the measurement exists:

```json
{
  "schema": "cue-helper-overlay-qualification-v1",
  "profileId": "moto-g56-fnaf2-v207",
  "targetPackage": "com.scottgames.fnaf2",
  "targetBuild": "<versionCode>:<versionName>",
  "osApi": 36,
  "window": {
    "type": "TYPE_APPLICATION_OVERLAY",
    "flags": ["FLAG_NOT_FOCUSABLE", "FLAG_NOT_TOUCHABLE", "FLAG_LAYOUT_IN_SCREEN"],
    "alpha": "<measured <= input maximum with margin>",
    "maximumObscuringOpacity": "<queried value>",
    "windowCount": 1
  },
  "selfCapture": {
    "proof": "PLATFORM_EXCLUDES_OVERLAY | OUTSIDE_PROTECTED_REGIONS | PHASE_SEPARATED",
    "hudOffFrame": "<retained frame id/hash>",
    "hudOnFrame": "<retained frame id/hash>",
    "protectedSamplesEqual": "<boolean>",
    "screenIdentityUnaffected": "<boolean>"
  },
  "touchMatrix": {
    "controls": ["mask", "leftVent", "rightVent", "flashlight", "cameraMap", "cameraButtons"],
    "allDelivered": "<boolean>",
    "overlayPresent": true,
    "otherOverlaysRemoved": true,
    "perControl": {
      "mask": {"attempts": 3, "delivered": 3, "targetObserved": true, "traceId": "<retained trace>"},
      "leftVent": {"attempts": 3, "delivered": 3, "targetObserved": true, "traceId": "<retained trace>"},
      "rightVent": {"attempts": 3, "delivered": 3, "targetObserved": true, "traceId": "<retained trace>"},
      "flashlight": {"attempts": 3, "delivered": 3, "targetObserved": true, "traceId": "<retained trace>"},
      "cameraMap": {"attempts": 3, "delivered": 3, "targetObserved": true, "traceId": "<retained trace>"},
      "cameraButtons": {"attempts": 3, "delivered": 3, "targetObserved": true, "traceId": "<retained trace>"}
    }
  },
  "latency": {
    "updateToDrawMs": {"p50": "<number>", "p95": "<number>", "p99": "<number>"},
    "criticalCueToClearMs": {"p99": "<number>"},
    "detectorDeltaMs": {"p50": "<number>", "p95": "<number>"}
  },
  "resources": {
    "cpuPercent": {"median": "<number>", "p95": "<number>"},
    "memoryMb": {"median": "<number>", "p95": "<number>"},
    "thermal": "<retained trace>"
  },
  "lifecycle": {
    "rotation": "<pass/fail>",
    "permissionRevocation": "<pass/fail>",
    "captureStop": "<pass/fail>",
    "targetHidden": "<pass/fail>",
    "appSwitchLockUnlock": "<pass/fail>"
  }
}
```

`OverlayCaptureGate.comparePairedSamples()` is the host-testable protected
sample check. It is not sufficient by itself when scene motion could explain a
match; the frame IDs, screen identity, timing, and exact target build must be
retained with the record. A changed protected sample rejects the profile.

The retained JSON record can be checked before review with:

```sh
python3 tools/device/validate-overlay-qualification.py RECORD.json --json
```

The validator is strict about the profile, target build, one-window flags and
opacity, all six touch controls, one non-placeholder retained trial trace per
control, non-placeholder paired evidence, latency and resource summaries, and
every lifecycle result. A structurally valid record is still evidence supplied
by the device harness; the validator does not invent or simulate any
measurement.

After the record is reviewed, the device harness may install the following
strict sidecar at the app's private files directory as
`overlay-qualification.properties`. The service accepts it only when every
field is present, the profile matches the built-in geometry profile, and the
target package/build and all three platform gates report `PASS`:

```properties
schema=cue-helper-overlay-qualification-v1
profileId=moto-g56-fnaf2-v207
proof=PLATFORM_EXCLUDES_OVERLAY
targetPackage=com.scottgames.fnaf2
targetBuild=<versionCode>:<versionName>
touchPassthrough=PASS
targetSuppression=PASS
screenIdentity=PASS
```

This sidecar is a reviewed qualification result, not a user-facing toggle or
permission substitute. The service also compares `targetBuild` with the
currently installed `com.scottgames.fnaf2` package (`versionCode:versionName`),
so an app update invalidates the record. Missing, malformed, mismatched, stale,
or revoked records fall back to `self-capture-unqualified`.

## Execution order

1. Install the APK and exact target game build on the g56. Remove unrelated
   overlays and record API, display rotation, insets, cutout, density, and
   screen bounds.
2. Run capture with the HUD disabled and retain the protected point/ROI values
   and screen-identity trace. Enable the HUD, retain the paired trace, and
   prove either capture exclusion, a guard band, or explicit phase separation.
3. With the chosen alpha, exercise every control in the touch matrix repeatedly
   and retain the delivered event/result trace. A transparent screenshot is
   not an input test.
4. Exercise rotation, app switch, lock/unlock, projection stop/restart,
   permission revocation, target visibility loss, and service destruction.
   Each path must leave exactly zero attached overlay windows, except that a
   valid target-night frame may reattach after an app switch returns to FNaF.
5. Retain the `OverlayMetrics` update-to-draw p50/p95/p99 trace alongside
   detector latency, frame drops, CPU, memory, thermal, and cue-clear latency.
   The authenticated device query `tools/device/query-cue-helper.sh overlay`
   returns the HUD lifecycle/gate and bounded counters without requiring the
   game to remain focused; capture its output at each lifecycle boundary and
   at the end of the observe-only run.

The repeatable telemetry sampler is
`tools/device/overlay-qualification-observe.sh`. Run it once with
`CUE_HELPER_OVERLAY_PHASE=off` and once with `CUE_HELPER_OVERLAY_PHASE=on`,
using distinct output paths. Each TSV row retains visual sequence/age,
detector latency, explicit monitor state/reason, explicit selected-camera
state/reason, explicit battery percentage/reason, overlay update-to-draw
percentiles, draw-interval percentiles,
process CPU/PSS/RSS/thread count, thermal status, and the authenticated native
watchlist sequence/age/value set protecting the detector ROIs. The sampler
also rejects a selected camera unless monitor state is `true`, and rejects
invalid camera identifiers. Compare the
off/on detector-latency distributions for `detectorDeltaMs` in the retained
JSON record; the sampler does not turn a difference into a qualification claim.
The debug build's explicit **Start qualification probe** action provides a
third `CUE_HELPER_OVERLAY_PHASE=probe` phase: it temporarily attaches the
sensor/debug renderer, reports `overlay=PROBE` while retaining the production
gate as `UNQUALIFIED(self-capture-unqualified)`, and cannot render decision
cues. Use this only to obtain the HUD-on comparison needed before the reviewed
sidecar exists; a probe trace is not itself qualification evidence.

The queued `night-check` path treats an authenticated `FNAF2_MENU` result as a
retryable hold (`target-not-night`): it releases the temporary projection while
holding the per-device lease, leaves the job `PENDING`, and waits for the
operator to enter night manually. It never sends game input.

Until all five steps have a retained record, report
`overlay=DISABLED(self-capture-unqualified)` or, for target suppression,
`overlay=UNAVAILABLE(target-hidden) state=HIDDEN`. Do not describe the run HUD
as usable and do not make a gameplay claim.
