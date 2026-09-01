# `@fnaf2-1020/device`

The device app is the only composition root that chooses a profile, adapters,
runtime services, artifact retention, and live mode. It exposes a fixture-backed
dry run from a clean checkout and an explicit live lane that requires a lease,
resolved profile, bounded budget, and operator confirmation.

Public API: `DeviceControlService`, `composeDevice`, the CLI, and the bounded
JSON-RPC/MCP-shaped adapter. Dependencies: core, runtime, and adapters.
Commands: `device:dry-run`, `device:bench`, `device:qualification`, and
`device:grade`. Artifacts: resolved profiles, telemetry, manifests, and result
bundles under ignored `artifacts/`.

```sh
npm run device:dry-run -- --profile fixture-hid-screencap
```

The generated session manifest and result bundle are retained under the ignored
`artifacts/` directory. Coordinates and transport details come from the
profile; they are never inferred from a policy or conversation.

Research winners use a separate, content-addressed handoff before any device
lane is considered: `npm run device:emit -- --winner winner.json --out
artifacts/run-001` writes `winner.json`, `manifest.json`, `night-N.plan`,
`profile.json`, and a hashed `artifact.json` containing the transport-neutral
semantic blocks, then validates the interpreter vocabulary, timing/contact
budget, identity, hashes, and bounded replay. The shell facade consumes that
exact bundle with `tools/device/trial.sh --artifact artifacts/run-001
--dry-run` (or an explicit `--executor MODULE` for the qualified live lane).
Plans are compiled into bounded state-conditioned blocks: monitor
operations name an UP/DOWN target, camera coordinates require two agreeing UP
observations, and office controls require DOWN. UNKNOWN or a failed bounded
retry aborts and releases all contacts instead of continuing by toggle parity.

`composeDevice` is the shared composition factory for fixture and qualification
profiles. Live composition requires injected ADB/HID and sensor transports,
`abort`/`releaseAll`, a `qualification-v1` record with external evidence, and
an observed sensor→detector result before each command. Transport self-report
cannot create a `DEVICE_MEASURED` claim; the stock CLI refuses to invent that
composition, so hardware qualification remains an operator-owned lane.

`composeModernDevice` is the Plan 22 physical seam for the current HID +
MediaProjection profile. It accepts explicit adapter-owned HID and cue-helper
ports; those ports must already use the device-local execution path. It does
not import the legacy trial, infer coordinates, or turn transport availability
into qualification evidence. Pass an explicit `DeviceArtifactExecutor` when
consuming a compiled artifact; without it artifact execution is refused.

Monitor state comes from a calibrated `monitor-rule-v1` artifact
(`packages/adapters/src/monitor-rule.js`), fitted offline from labeled
2400x1080 frames by `tools/device/monitor-calibrate.py`. The rule anchors on
the monitor's map layout drawing — present if and only if the monitor is up,
independent of the camera feed — read through the helper's `GRID` verb. The
fitted g56 rule (`models/monitor-rule-moto-g56-v207.json`) carries four map
anchors plus two covered-office anchors; every anchor must agree before the
fact votes. Without a fitted rule — or when the frame is stale, off-identity,
blackout-dark, mid-animation, or otherwise ambiguous — the detector returns
`UNKNOWN` with the reason and the service refuses actuation. Composition
requires the profile's `calibrations.monitorRule` to carry the artifact
digest, so an unbound or mismatched rule cannot drive a run. A future
helper-emitted explicit `monitorUp` field supersedes the derived value
frame-by-frame.

`cameraSelected` is the sibling fact (`camera-rule-v1`,
`packages/adapters/src/camera-rule.js`, fitted by
`tools/device/camera-calibrate.py` from `models/camera-rule-moto-g56-v207.json`):
the twelve map buttons are measured watch pixels, the selected one renders
yellow (bright ~194, dimmed ~96 while the wind control is held) against
cool-grey unselected. Exactly one lit button names the camera; zero and
several lit buttons are distinct UNKNOWN reasons so a camera transition and
the Android double-camera glitch stay separable in telemetry. The rule's
runtime wiring into the live observation loop is still open.

The Moto g56 100 ms and 17 ms profiles are deliberately separate
qualification candidates. Both remain `dryRunOnly` until their own
MediaProjection monitor-state detector, HID transport, atomic compound macros,
and artifact-bound physical qualification pass. A 100 ms result never promotes
the 17 ms profile.

The optional JSON-RPC/MCP-shaped adapter exposes bounded semantic tools over
the same service (`devices.list`, `profiles.resolve`, `device.preflight`,
`session.*`, `sensor.sample`, `actuator.apply`, `trajectory.execute`, and
artifact inspection). It is not a scheduler and never exposes arbitrary shell
or raw tap coordinates.
