# Compatibility and legacy-path map

This is the bounded migration inventory. Every compatibility or legacy path
has one replacement owner, an explicit removal gate, and a reason it still
exists. No entry is a second semantic authority. The machine-readable view is
generated at [`generated/legacy-paths.json`](generated/legacy-paths.json) from
the registry in `tools/generate-catalog.js`; regenerate it with `npm run
catalog` when a path or gate changes.

Lifecycle meanings:

- **compatibility** — caller-facing alias/facade; new behavior must land in the
  canonical owner only.
- **transitional** — still shared by a current path, but its responsibility is
  scheduled to move behind a package or adapter boundary.
- **legacy** — historical implementation or experiment; diagnosis/replay only,
  never a source of new policy or live claims.

## Device execution paths

| Surface | Lifecycle | Canonical replacement | Removal gate |
|---|---|---|---|
| `tools/device/trial.sh` | compatibility | `apps/device/src/cli.js` + `tools/device/artifact-runner.mjs` | P5 command/trace equivalence, then P9 audit |
| `tools/device/legacy-trial.sh` | legacy (deprecated 2026-09-02) | `device-bundle-v1` + `DeviceControlService` + `device-executor-v1` | remote executor and trace equivalence, live qualification, then P9 |
| `tools/device/trial/*.sh` and `assemble.sh` | legacy | `device-executor-v1` semantic artifact stream | remove with the historical runner after each responsibility has an adapter/test owner |
| `tools/device/trial-maskcamp.sh` and `run-batch.sh` | legacy | structured observation/qualification experiment artifacts | migrate or archive the experiment recipes; no new route work |
| `tools/device/preflight.sh` | compatibility | `DeviceControlService.preflight` plus profile/qualification checks | modern CLI covers helper, focus, title, and qualification checks |
| `tools/device/session.sh` | compatibility | service-owned session manifest and result bundle | legacy migration retains equivalent provenance |
| `tools/device/session-manifest.py` + `validate-session.py` | legacy/transitional | runtime manifest validator and evidence CLI | historical shell manifests are indexed and replayable |
| `tools/device/grade-run.sh` | transitional | evidence CLI over content-addressed device bundles | historical video/HID/session artifacts have an equivalent structured grader |
| `tools/device/select-adb.sh` | transitional | injected transport selected by the device composition root | direct-ADB probes become adapters or are explicitly archived |
| `tools/device/coords.sh` | transitional | resolved profile `controlMap` | every device action consumes profile geometry |
| `tools/device/menu.sh` | transitional | calibrated title/menu detector and service state gate | detector evidence and a dry-run fixture cover the menu states |

The old runner is intentionally not hidden behind a new name: if it is needed
for historical characterization, callers must opt into
`FNAF2_LEGACY_TRIAL=1`. The artifact facade never falls back to it. In
particular, `preflight.sh` is a historical shell gate, not permission to start
a modern live run.

**Deprecated 2026-09-02.** `legacy-trial.sh` is reference and characterization
input only. It may not produce new evidence on
[Plan 12](../../plans/12-end-to-end-evidence-campaign.md)'s ladder; the modern
path climbs it from Level 1. The runner's own historical results — including
the Night 1 clear `n1-full-1640` — remain citable and remain attributed to it.
Its device gates stay green as characterization tests and are not qualification
of the path that climbs. See [`ROADMAP.md`](../../plans/ROADMAP.md).

## Transitional model and research paths

| Surface | Lifecycle | Canonical replacement | Removal gate |
|---|---|---|---|
| `tools/device/recipe.mjs` | transitional | package-owned winner/device-bundle emitter | bundle compiler no longer imports the tools tree and replay hashes match |
| `tools/device/actuator.mjs` | transitional | adapter actuator/error model with conformance fixtures | pilot/model consumers migrate without changing measured error semantics |
| `tools/device/policy-ir.mjs` | transitional | core policy-program contract and research emitter | P3 vocabulary migration and fixed-seed artifact equivalence |
| `tools/model/stock-device-pilot.mjs` | legacy | structured research experiment with an explicit historical actuator model | historical sweeps replay from retained artifacts |
| `tools/minustoystest.mjs` | compatibility | `npm run research -- minus-toys` | package artifacts and fixed-seed output are equivalent |
| `tools/minus2test.mjs` | compatibility | `npm run research -- minus-two` | package artifacts and fixed-seed output are equivalent |
| `package.json#scripts.test:legacy:engine` | compatibility | `node tools/test.mjs --engine` (canonical engine fixture lane) | bare-Node compatibility lane is no longer needed and P9 is green |

The cue-model provisioner (`tools/device/provision-cue-model.sh`) and ESP32
fallback packer (`tools/cue/pack-esp32-cues.py`) are also registered as legacy
paths. They remain only to replay historical APK/firmware experiments; current
models are content-addressed adapter/profile inputs.

The legacy session producer/validator pair has a similarly named but distinct
schema (`fnaf2.session-manifest`) from the runtime `session-manifest-v1`
contract. That distinction is recorded in the generated map so removal cannot
silently strand old manifests or merge two incompatible validators.

## Already removed

The root `src/` compatibility re-exports were removed after the import
equivalence gate. Package and application imports are canonical. Historical
fixtures that mention deleted command names remain negative test inputs and do
not make those commands available again.
