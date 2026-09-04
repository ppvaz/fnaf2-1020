# Repository operating contract

This is an evidence-bearing study of the modern Android FNaF 2 target. Keep
the five charter layers—Truth, Understanding, Decision, Embodiment, Proof—and
never silently promote a model or fixture result. Plan 12 owns promotion;
known negatives and retractions remain discoverable.

Ownership is directional: `@fnaf2-1020/core` owns mechanics and semantic
contracts; runtime schedules and supervises; adapters own capabilities,
calibration, and transport; trainer, research, and device are leaves.
`research/sandbox` may depend inward, never vice versa. Production never
imports tests, reports, mutable search knobs, DOM, shell, or device details
into core.

For a migration use characterize -> contract test -> change -> compare semantic
traces -> switch -> remove shim. Use explicit units/clocks and `UNKNOWN` for
missing or ambiguous measurements. A send is not game acceptance.

Device work is dry-run by default. Use a resolved, hashed profile, capability
preflight, exclusive lease, bounded commands/deadlines, retained telemetry, and
fail-safe release/abort. Never infer mode, geometry, coordinates, timing, ports,
or calibration from prose or conversation. No arbitrary shell is exposed to an
agent.

Start with `npm ci` and run affected gates plus `npm run device:dry-run`. Before
pushing run `npm run push-gate`, which runs the CI lanes against the pushed
commit in a throwaway worktree; the working tree is a different measurement
from CI's clean clone. `git config core.hooksPath .githooks` makes it automatic.
Finish by updating the structured progress/result record, citing its generated
evidence ID, and stating exactly what remains open; do not create a parallel
handwritten evidence log.

Canonical routes: [charter](PROJECT-CHARTER.md),
[architecture](docs/architecture/README.md),
[contracts](docs/architecture/generated/contract-register.json),
[commands](docs/architecture/generated/command-registry.json),
[evidence policy](docs/evidence/README.md),
[device safety](docs/operations/DEVICE-SAFETY.md),
[progress](plans/PROGRESS.md). The full legacy campaign is explicit as
`npm run test:legacy:engine`; intentionally red scientific controls are not
part of the green edit lane. Historical incident notes remain in
[`docs/operations/CLAUDE-HISTORY.txt`](docs/operations/CLAUDE-HISTORY.txt).
