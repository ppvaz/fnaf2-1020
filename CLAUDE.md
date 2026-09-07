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

## Consequence lock (active, 2026-09-06)

A commit is **consequential** only if it advances a Plan 12 rung above
FIXTURE (real device evidence, a graded manifest, a promotion) or ships
trainer code. Everything else — docs, plans, gates, benchmarks, scaffolding,
refactors — is **bookkeeping**.

- The `commit-msg` hook refuses commits that touch only bookkeeping paths
  (`docs/`, `plans/`, `*.md`) unless the same commit stages device evidence
  under `artifacts/` or `docs/evidence/`, or the message carries
  `EVIDENCE:<path>` naming evidence from a prior commit.
- `PEDRO-OK` in a commit message is the human-only override. Agents never
  write it and never bypass hooks (`--no-verify`, `commit -n`).
- Start every session by naming the rung it will move and the physical
  artifact it aims to produce. If that artifact cannot be produced this
  session, say so and stop — no host-side substitute work.
- If device work is blocked because the phone is absent or locked, enqueue a
  Cue Helper job (`cue.queue.enqueue`) and end the device work there.
- When a route is refuted on device, the next commit is the next route's
  physical test or a decision request to Pedro — never further documentation
  of the refutation.
- End every session by reporting the consequential:bookkeeping commit ratio.

Standing directive (Pedro, 2026-09-06): **laser-focus on 6 AM successes
on-device.** Night 6 is the current execution target; nothing outranks the
next graded run bundle.

## Mistake register (2026-09-06 — check before acting; never repeat)

Each entry below cost a live attempt or a false diagnosis on 2026-09-06.

1. **Read a tool's own usage before the first invocation.** Sibling scripts
   differ in shape: `title-observe.py` reads the frame on **stdin** (a
   positional path argument is silently ignored and yields
   `unknown=unreadable-frame`), while `intro_card.py` takes a positional
   frame path. Never assume a uniform CLI across a directory.
2. **An observation-based rule must cite the measured row that backs it.**
   The title model's own table says the Continue band reads present
   (0.0264+) on *fresh* saves — Continue is always rendered on build 26.
   A "Continue visible means a save exists" refusal was wrong and blocked
   a live run. Before encoding any gate on an observation, re-read the
   calibration artifact that measured it.
3. **Operator statements are context, not premises.** "Fresh install" still
   required observing the save cursor before building the flow on it; the
   observed cursor was Night 1 with a rendered save. Observe the device
   state that a flow depends on; never encode an unobserved state.
4. **Re-derive every deadline when a port crosses executors.** A 15 s
   terminal wait was tuned for the machine lane (whose program blocks
   through the night) and starved the artifact lane (whose schedule returns
   while the game clock can trail by a minute). Port reuse is not timing
   reuse.
5. **Never report a test PASS you did not see print.** A wrong test path
   (`tools/test-bundle.mjs` vs `tools/device/test-bundle.mjs`) failed
   silently behind `> /dev/null 2>&1 && echo` twice before being caught.
   Confirm the file exists and the pass line is in the output before
   claiming green.
6. **Every aborted live attempt leaves the game mid-night.** After any
   abort or user kill, drive the device to a known state (game over ->
   menu) and verify it with the title observer before starting new work or
   ending the session.

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
