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

`composeDevice` is the shared composition factory for fixture and qualification
profiles. Live composition requires injected ADB/HID and sensor transports,
`abort`/`releaseAll`, a `qualification-v1` record with external evidence, and
an observed sensor→detector result before each command. Transport self-report
cannot create a `DEVICE_MEASURED` claim; the stock CLI refuses to invent that
composition, so hardware qualification remains an operator-owned lane.

The optional JSON-RPC/MCP-shaped adapter exposes bounded semantic tools over
the same service (`devices.list`, `profiles.resolve`, `device.preflight`,
`session.*`, `sensor.sample`, `actuator.apply`, `trajectory.execute`, and
artifact inspection). It is not a scheduler and never exposes arbitrary shell
or raw tap coordinates.
