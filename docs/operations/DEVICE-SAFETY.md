# Device operation safety

Use a versioned profile and `DeviceControlService`. Profiles resolve adapter
capabilities, geometry, timing, calibration, target build, and safety limits;
the resolved profile and hash are retained in the session manifest.

Dry-run is the default and uses fixture transports. Live mode requires an
explicit `--live --confirm-live`, a non-fixture profile, an exclusive lease,
bounded action count/duration, preflight, externally evidenced
`qualification-v1`, mandatory abort/release methods, and sensor→detector
observation in the execution loop. The service owns semantic-to-physical
mapping, temporal/deadline checks, emergency release/abort, telemetry, and
cleanup. Agent-facing interfaces may call this service only with semantic
bounded commands; they may not execute arbitrary shell or invent coordinates.

`SENT` proves a transport write. It does not prove that the game accepted the
input. `UNKNOWN`, unsupported, uncalibrated, transport-failed, rejected, and
unverified states remain distinct in results.
