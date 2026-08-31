# Research architecture

Research operations are classified as controller synthesis,
trajectory/parameter optimization, model discrimination, robustness analysis,
device characterization, or conformance/regression. Each operation declares
its model hash, candidate space, observation privilege, fault/profile, seeds,
sample/stopping/statistical contract, controls, artifacts, and claim ceiling.

`ExperimentSpec -> CandidateGenerator -> Evaluator -> Objectives/Aggregator ->
experiment-result-v1`. Candidate generation is replaceable; pure evaluation is
not coupled to trainer or live shell. Search winners are model candidates until
Plan 12 supplies promotion evidence. Sandbox probes can remain cheap but may
only depend inward on published contracts.

The reference CLI cases currently cover model probing, controller synthesis,
cycle optimization, bounded robustness, and fixture-profile characterization.
They are deterministic scaffolds for the shared path and remain capped at
`MODEL_ONLY` until external/device evidence is retained.
