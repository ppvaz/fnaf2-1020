# Evidence policy

Supported commands that print a claim, comparison, rate, timing, or verdict
also emit a stable evidence ID and a versioned result artifact. `MODEL_ONLY`,
`FIXTURE`, and `DEVICE_MEASURED` are distinct ceilings; architecture changes do
not promote claims. Plan 12 is the only promotion ladder.

```sh
npm run evidence -- list
npm run evidence -- show RUN_ID
npm run evidence -- diff RUN_A RUN_B
npm run evidence -- replay RUN_ID
npm run evidence -- why RUN_ID
npm run evidence -- promote RUN_ID
```

`list`, `show`, `replay`, and `promote` recognize both runtime session bundles
and validated `device-bundle-v1` handoffs; historical manifests are labelled as
archives instead of being mistaken for malformed current sessions. Promotion
of a handoff still refuses until the external and Plan 12 gates are present.

Large or sensitive media is content-addressed and retained separately. The
manifest retains profile, policy/model hashes, clocks, capabilities,
calibrations, semantic commands, actuation results, lifecycle, grading, and
redaction. Research bundles additionally retain content-addressed spec/result
artifact refs, spec/result/manifest hashes, and a reproducer command; evidence
lookup verifies these before showing or diffing a run. `replay` reruns that
retained research spec through the shared deterministic evaluator and compares
the result hash. `promote` invokes the Plan 12 gate and returns a structured
refusal until external device evidence and a passing terminal result exist.
Generators may propose graph edges; humans approve support, refutation,
supersession, retraction, and promotion edges.

The [2026-09-05 calibration clock audit](calibration-clock-audit-20260905.json)
is a generated `calibration-stability-v2` REFUSED result, not a device-session
qualification or a promotion edge. It retains hashes and ambiguous trial
evidence so the project can distinguish exploratory map appearances from
verified mask/monitor/flash calibration. Reproducer and current hold:
[Plan progress](../../plans/PROGRESS.md).

Device handoff is a separate `winner-v1` -> `device-bundle-v1` step:
`npm run device:emit -- --winner winner.json --out artifacts/run-001` persists
the winner, resolved profile, night plans, hashed semantic `artifact.json`, and
bounded replay. The artifact consumer validates that exact bundle before any
runner can use it;
`trial.sh --artifact ... --dry-run` remains host/model-only while live device
qualification is open. The modern campaign CLI composes
`apps/device/src/modern-campaign-ports.js` by default (or accepts an explicit
port module); it receives only compiled semantic blocks and bound hashes,
never the strategy interpreter or historical transport lane.

The two-night campaign adds a second proof layer: `device-campaign-result-v1`
records each bounded attempt, `campaign-proof-v1` requires a positive 6 AM
observation plus save/menu advancement, and `custom-night-calibration-v1`
binds all ten Custom Night dial controls to measured readback boxes. A local
executor completing its schedule is therefore still `UNVERIFIED` until the
terminal and save ports provide positive observations.

The architecture generator also emits
`docs/architecture/generated/reverse-links.json`. It is a navigational index
from stable IDs to source, test, fixture, and evidence references; it does not
grant a claim or promotion authority. `npm run test:retrieval` keeps the main
human-facing routes discoverable from newcomer questions.
