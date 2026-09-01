# `@fnaf2-1020/adapters`

This package owns capability-described actuator, sensor, detector, clock, and
transport implementations. A backend implements a core port and retains its
timing, calibration, verification, and claim limitations. Profiles select
adapters; controllers never branch on backend names.

Public API: the adapter classes and `resolveProfile` from `src/index.js`, plus
the `/registry`, `/actuators`, `/sensors`, `/transports/hid`, and
`/transports/cue-helper` subpaths. Dependency: core only.
Commands: use the root `test:contracts`, `test:device:dry`, and `device:bench`
lanes. Artifacts: profile-resolved capability and calibration metadata.

The fixture adapters are hermetic and are used by `device:dry-run` and the
conformance lane. A legal HID/ADB send is not evidence that the game accepted
the command. This package does not own policy, scheduling, shell orchestration,
or live-device authorization.

The HID and cue-helper transport modules are codecs over injected ports. They
own report encoding, coordinate conversion, authentication framing, and
protocol parsing, but never open adb, select a policy, or claim that a legal
transport write was accepted by the game. `apps/device` composes those ports at
the edge, so Plan 22's modern composition remains testable with fakes.

Profile resolution is fail-closed: the selected sensor format must be listed
by the detector, and the visual and detector calibration IDs must match. A
profile with an unbound or incompatible acquisition path is refused before a
service can actuate.
