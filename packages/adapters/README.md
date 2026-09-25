# `@fnaf2-1020/adapters`

What the campaign executor sends and reads through: the HID wire
(`transports/hid`), the Cue Helper control protocol (`transports/cue-helper`),
clocks and clock maps, night-onset detection, and the fitted detection rules
the executor consults -- monitor, mask and camera rules, the calibration-state
rule, control exclusion, button strokes and the pan-aware control anchor.

Public API: `src/index.js` plus the `/transports/hid`, `/transports/cue-helper`
and `/night-onset` subpaths. Dependency: core only. Command: the root
`test:contracts` lane (`packages/adapters/test/`).

The transport modules are codecs over injected ports. They own report
encoding, coordinate conversion, authentication framing and protocol parsing,
but never open adb, select a policy, or claim that a legal write was accepted by
the game: a legal HID send is not evidence of acceptance. `apps/device`
composes the ports at the edge, and `tools/architecture-test.js` confines the
HID transport to the device runners.

The capability registry, the actuator and sensor classes and the fixture
adapters that served the retired `DeviceControlService` were removed on
2026-09-25 (`docs/ARCHIVED-ROUTES.md`).
