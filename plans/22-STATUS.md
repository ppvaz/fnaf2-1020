# Plan 22 closure matrix

**Rows last reconciled against the device record on 2026-09-17.** P5 moved to
`Closed`; every other row is as it stood on 2026-09-02.

Status is intentionally separate from the plan text and the historical progress
log. `Foundation` means the boundary or scaffold exists; `Closed` means the
plan's stated Done when is evidenced; `Open` means a required gate remains.

| Package | Status | Evidence in this branch | Required closure / remaining gap |
|---|---|---|---|
| P0 — characterize boundaries | Foundation | `npm run catalog`, `node tools/architecture-test.js`, `node tools/validate-references.js`, shared contract fixtures | Three isolated duration/flakiness runs and a measured test manifest are still required. |
| P1 — establish workspace/core | Closed | `npm ci`, `npm test`, `npm run typecheck`, package exports and root `src` absence | Keep the clean-checkout bootstrap green. |
| P2 — extract canonical mechanics | Foundation | `packages/core/src/mechanics`, `packages/core/src/control`, `packages/core/src/estimation`, `node tools/sourcetest.mjs`, `node tools/simtest.mjs`, core boundary audit | Broader controller/trainer equivalence and measured migration fixtures remain open. |
| P3 — define contracts and ports | Foundation | `packages/core/contracts/register.json`, runtime validators, adapter conformance, `packages/runtime/test/scheduler.test.js`, shared contract vectors | Complete detector/calibration protocol detail and external qualification contract. |
| P4 — adapters and runtime composition | Foundation | `node packages/adapters/test/conformance.test.js`, `node apps/device/test/service.test.js`, `npm run device:dry-run` | Live executor remains blocked until temporal, observation, cleanup, and qualification gates are promoted together. |
| P5 — device execution | Closed 2026-09-14 | Qualified transport `hid-mediaprojection` (`qualification-hid-mediaprojection-20260907`); bounded temporal execution on every story night and Custom Night 7; real session bundles retained per run under `artifacts/` with their evidence records in `docs/evidence/` | Closed by execution, not by reliability: the only declared cohort is Night 7's at 3 wins in 10 runs, and no Plan 12 promotion edge has been recorded. **The crossover is decided (2026-09-02): the legacy runner is deprecated, so this row was the only path to new ladder evidence — and it carried it.** |
| P6 — research/evidence path | Foundation | Generic reference cases plus real family evaluators for Minus Toys and Minus Two; legacy aliases call the same evaluators; family campaigns emit candidate statistics, terminal causes, trace hashes, artifact refs, and effective replay; `promote` invokes a structured Plan 12 gate; `winner-v1` now compiles into a replay-checked device bundle | Port a broader real synthesis/optimization/robustness campaign set and retain external evidence before closing. |
| P7 — screencheck extraction | Foundation | native source moved to `packages/screencheck/src`; existing native fixture lane passes | Move ownership of build, benchmark, and host conformance into the screencheck package; preserve freestanding/no-APK property. |
| P8 — docs/indexes/evidence | Foundation | generated catalogs, static portal, evidence CLI, hash-checked replay, Plan 12 promotion refusal, claim graph, generated reverse links, five-query retrieval benchmark, `node tools/test-docs.mjs` | Promotion remains blocked without external evidence. |
| P9 — compatibility removal/audit | Open | descriptive `tools/model/` pilots, no production test imports, TypeScript shape check plus checked JS (strict migration still open), `test:affected`, bounded progressive runner; **legacy shell lane archived 2026-09-25** (`legacy-trial.sh`, its 13 driver parts, the mask-camp runners, shell preflight, pilot supervisor and the graders that read only their artifacts; [`ARCHIVED-ROUTES.md`](../docs/ARCHIVED-ROUTES.md)) — `grade-run.sh` output on a retained night was unchanged in every live instrument | Apply strict TypeScript to new/materially extracted long-lived modules or document an approved exception; resolve the known red engine gate; fold the artifact lane (`trial.sh` → `artifact-runner.mjs`) and the service/dry-run path into the campaign executor; complete live qualification. |

## Release rule

Plan 22 remains `foundation/phase 1` while any row is `Foundation` or `Open`.
Only a checked-in evidence artifact or an explicitly documented external gate
may change a row to `Closed`; a green scaffold or a CLI refusal is not a
physical qualification result.

## Recheck commands

```sh
npm test
npm run typecheck
npm run test:affected
npm run catalog
node tools/test-docs.mjs
npm run device:dry-run
npm run research -- model-smoke
npm run evidence -- list
```
