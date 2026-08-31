# `@fnaf2-1020/adapters`

This package owns capability-described actuator, sensor, detector, clock, and
transport implementations. A backend implements a core port and retains its
timing, calibration, verification, and claim limitations. Profiles select
adapters; controllers never branch on backend names.

Public API: the adapter classes and `resolveProfile` from `src/index.js`, plus
the `/registry`, `/actuators`, and `/sensors` subpaths. Dependency: core only.
Commands: use the root `test:contracts`, `test:device:dry`, and `device:bench`
lanes. Artifacts: profile-resolved capability and calibration metadata.

The fixture adapters are hermetic and are used by `device:dry-run` and the
conformance lane. A legal HID/ADB send is not evidence that the game accepted
the command. This package does not own policy, scheduling, shell orchestration,
or live-device authorization.
