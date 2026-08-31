# `@fnaf2-1020/research`

Named experiments use the shared `generateCandidates` → pure evaluator →
aggregator path in `src/experiment.js`. The checked-in reference cases are
`model-smoke`, `controller-synthesis`, `cycle-optimization`,
`robustness-sweep`, `model-probe`, and `device-characterization`. Each
claim-producing operation retains its input spec, structured result, and
session manifest; console output is a view of that bundle.
`research/sandbox/` is deliberately outside this package.

Research owns experiment specifications, candidate generation, pure model
evaluation, statistics, and structured result artifacts. It consumes core and
declared fault/adapter models; it never imports trainer presentation or live
device shell internals. `research/sandbox/` is intentionally permissive and
has a one-way dependency inward toward published contracts.

Public API: experiment primitives from the package root and the explicit CLI
entry point. Dependency: core only. Commands: `npm run research -- --help` and
named operations such as `model-smoke`. Artifacts: versioned specs, result
bundles, manifests, and evidence IDs. It does not own device execution,
trainer presentation, or Plan 12 promotion.

Every claim-producing operation reports model/profile/hash/sample context and a
claim ceiling. Simulation results remain model candidates until Plan 12's
promotion ladder supplies the required evidence.
