# `@fnaf2-1020/runtime`

Runtime owns logical scheduling, supervisory interlocks, trajectories, and
session/telemetry contracts. It consumes `@fnaf2-1020/core` ports and receives
concrete sensors and actuators from the device composition root. It does not
select adapters, parse shell, infer profiles, or contain a strategy schedule.

Public API: `Scheduler`, `SafetySupervisor`, and runtime validators from the
package root and `/scheduler` and `/safety` subpaths. Dependency: core only.
Commands: use the root contract and device dry-run lanes. Artifacts: bounded
actuation results, telemetry events, and session manifests.

The runtime is safe to exercise with fixture transports. Live-device lanes are
explicit and retain a resolved profile and session manifest. It does not own
adapter registration, experiment search, policy authoring, or evidence
promotion.
