# Plan 22 closure matrix

Status is intentionally separate from the plan text and the historical progress
log. `Foundation` means the boundary or scaffold exists; `Closed` means the
plan's stated Done when is evidenced; `Open` means a required gate remains.

| Package | Status | Evidence in this branch | Required closure / remaining gap |
|---|---|---|---|
| P0 — characterize boundaries | Foundation | `npm run catalog`, `node tools/architecture-test.js`, `node tools/validate-references.js`, shared contract fixtures | Three isolated duration/flakiness runs and a measured test manifest are still required. |
| P1 — establish workspace/core | Closed | `npm ci`, `npm test`, `npm run typecheck`, package exports and root `src` absence | Keep the clean-checkout bootstrap green. |
| P2 — define contracts and ports | Foundation | `packages/core/contracts/register.json`, runtime validators, adapter conformance, `packages/runtime/test/scheduler.test.js` | Complete detector/calibration protocol detail and external qualification contract. |
| P3 — extract canonical mechanics | Foundation | `node tools/sourcetest.mjs`, `node tools/simtest.mjs`, core boundary audit | Broader controller and research equivalence remains open. |
| P4 — adapters and runtime composition | Foundation | `node packages/adapters/test/conformance.test.js`, `node apps/device/test/service.test.js`, `npm run device:dry-run` | Live executor remains blocked until temporal, observation, cleanup, and qualification gates are promoted together. |
| P5 — device execution | Open | CLI refusal test; `DEVICE_MEASURED` is no longer accepted from transport self-report | Inject a qualified transport, run bounded temporal execution, and retain a real session bundle. |
| P6 — research/evidence path | Foundation | Six named specs share one evaluator; hashes/artifact refs/reproducer verified; `evidence replay` reruns the spec and compares the result hash; `promote` invokes a structured Plan 12 gate | Migrate at least one real synthesis/optimization/robustness campaign and retain external evidence before closing. |
| P7 — screencheck extraction | Closed | native build/conformance and Python screencheck fixture lane | Preserve the freestanding/no-APK property. |
| P8 — docs/indexes/evidence | Foundation | generated catalogs, static portal, evidence CLI, hash-checked replay, Plan 12 promotion refusal, claim graph, `node tools/test-docs.mjs` | Add a retrieval benchmark and generated reverse links; promotion remains blocked without external evidence. |
| P9 — compatibility removal/audit | Open | descriptive `tools/model/` pilots, no production test imports, strict TS plus checked JS for package/trainer/device sources, `test:affected`, bounded progressive runner | Resolve the known red engine gate, characterize the remaining legacy shell lane, and complete live qualification. |

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
