# Contributing

This repository publishes derived knowledge about the modern Android target;
never commit game assets, decompiled content, recordings, secrets, or local
calibrations. Preserve evidence labels, negative results, controls, and
retractions.

## Clean-checkout workflow

```sh
npm ci
npm test
npm run build:trainer
npm run device:dry-run -- --profile fixture-hid-screencap
```

Use `npm run test:unit` for boundary checks, `npm run test:contracts` for
ports/codecs, and `npm run test:core` for the legacy exact-model lane. Slow
simulation, browser real-time, bench, and qualification lanes are explicit;
retries never turn a red gate green.

Core owns mechanics and semantic commands. Runtime schedules and supervises.
Adapters own physical capability, calibration, and transport differences.
Trainer, research, and device are application leaves. New device behavior must
be profile-selected and fixture-tested before any live lane.

For migrations, characterize -> add a contract test -> change -> compare
semantic traces -> switch the canonical path -> remove the compatibility shim
at a named gate. Keep core free of DOM, filesystem, shell, network, wall-clock,
and device imports. See [`CLAUDE.md`](CLAUDE.md) and the
[architecture docs](docs/architecture/README.md).
