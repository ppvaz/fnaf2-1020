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
