# Architecture legibility follow-up register

Status: open findings recorded on 2026-09-11. This register is a backlog for
future implementation work; it does not claim that any item is fixed.

The scope is human and agent legibility: a contributor should be able to find
the canonical owner, understand the state and safety invariants, and select the
smallest trustworthy validation command without reconstructing the architecture
from history, aliases, and unrelated tools.

The existing architecture direction remains valid: `core` owns the model and
semantic contracts, `runtime` owns temporal dispatch and safety, `adapters` own
physical boundaries, and `apps/device` owns composition. These findings concern
the distance between that declared architecture and its executable surface.

## Triage rules

- `P0` can mis-send input, claim an actuation that did not happen, or produce a
  green validation result for an invalid tree.
- `P1` materially increases the chance of choosing the wrong owner, path, or
  contract during normal work.
- `P2` increases maintenance and navigation cost but does not directly widen a
  device claim.
- An item is closed only when its acceptance checks are implemented and printed
  by the relevant test lane. Documentation alone does not close a code or
  contract finding.

## Findings

### LEG-001 — Make temporal dispatch fail closed (P0)

**Status:** OPEN
**Owner:** `packages/runtime`
**Evidence:** [`scheduler.js` (line 69)](../../packages/runtime/src/scheduler/scheduler.js)

An expired command is recorded as `REJECTED`, then the dispatcher continues to
the next command. There is no dependency model that can distinguish an
independent command from a command that assumes the expired toggle or state
transition happened. The audit reproduced a late `mask` followed by a sent
dependent command.

**Acceptance:** the default trajectory policy stops after `REJECTED`, `FAILED`,
or `UNKNOWN`; an explicit, tested independent-command policy is required for
continuation. Add a regression test for an expired prerequisite followed by a
dependent command.

### LEG-002 — Enforce capability/action and physical-binding contracts (P0)

**Status:** OPEN
**Owner:** `packages/runtime`, `packages/adapters`
**Evidence:** [`supervisor.js` (line 20)](../../packages/runtime/src/safety/supervisor.js), [`registry.js` (line 18)](../../packages/adapters/src/registry.js), [`actuators.js` (line 59)](../../packages/adapters/src/actuators.js)

The supervisor checks the requested control but not `action.kind`, although
the adapter registry declares supported actions. A profile that only declares
`press` accepted `select` in the audit. An unmapped ADB control can fall back to
the fixture result path and report `SENT` without a physical tap.

**Acceptance:** one shared predicate validates adapter, control, action, and
binding; supervisor and every actuator use it; unsupported actions and missing
bindings produce honest `REJECTED`/`FAILED` results. Add conformance tests for
`select` on ADB and for an unmapped control.

### LEG-003 — Make affected validation complete (P0)

**Status:** OPEN
**Owner:** test infrastructure
**Evidence:** [`affected-test.js` (lines 52 and 65)](../../tools/affected-test.js)

`npm run test:affected` can pass while JavaScript typecheck fails, and changes
under several `tools/device` paths do not select their focused tests. The
affected map is a second, incomplete definition of source ownership.

**Acceptance:** source changes always run the applicable typecheck; every
owned source family has an affected-test mapping; CI proves that a changed
device plan selects its contract test. Generate package scripts, CI lanes, and
the affected runner from one machine-readable test manifest.

### LEG-004 — Split device orchestration by responsibility (P1)

**Status:** OPEN
**Owner:** `apps/device`
**Evidence:** [`adb-device-local-executor.js` (line 401)](../../apps/device/src/adb-device-local-executor.js), [`modern-campaign-ports.js` (line 172)](../../apps/device/src/modern-campaign-ports.js), [`service.js` (line 1)](../../apps/device/src/service.js)

The local executor combines artifact compilation, shell rendering, ADB process
lifecycle, HID execution, observation, cleanup, and a machine compatibility
executor. Campaign ports combine evidence persistence, menu navigation,
pre-arm promises, lifecycle, and execution. `DeviceControlService` combines
leases, profiles, sessions, safety, telemetry, persistence, and dispatch.

**Acceptance:** separate modules for use cases, ports, executors, evidence,
and legacy compatibility. No module should own policy decisions, physical
transport, and evidence persistence at the same time. Each new module gets one
entry point, one owner, and one focused test file.

### LEG-005 — Narrow the public API and isolate legacy paths (P1)

**Status:** OPEN
**Owner:** `apps/device`
**Evidence:** [`index.js` (line 1)](../../apps/device/src/index.js), [`COMPATIBILITY.md` (line 21)](COMPATIBILITY.md)

The device barrel exposes many composition roots, executors, compatibility
facades, and modern paths together. A caller can import an implementation
without an obvious signal that it is legacy or transitional.

**Acceptance:** add an explicit package `exports` map with one canonical live
entry point and named compatibility subpaths. Legacy modules are not exported
from the default surface. Update the compatibility catalog and add an import
test that rejects new code importing legacy paths.

### LEG-006 — Establish one source of truth for contracts and resolved profiles (P1)

**Status:** OPEN
**Owner:** `packages/core`, `packages/adapters`
**Evidence:** [`types.ts` (line 73)](../../packages/core/src/contracts/types.ts), [`registry.js` (line 69)](../../packages/adapters/src/registry.js), [`index.js` (line 156)](../../packages/core/src/contracts/index.js)

Compile-time types, JavaScript validators, the contract register, and generated
catalogs do not fully describe the same shapes. `DeviceProfile` omits fields
added by profile resolution, while experiment validators accept only shallow
top-level structure. The JavaScript check is also configured with `strict:
false` and `noImplicitAny:
false`.

**Acceptance:** define `RawDeviceProfile` and `ResolvedDeviceProfile`; choose a
canonical schema source; generate or mechanically compare types, validators,
and catalogs; validate seed values, claim levels, nested samples, and profile
capability relationships. Remove broad `any` escapes from boundary objects.

### LEG-007 — Centralize the semantic control catalog (P1)

**Status:** OPEN
**Owner:** `packages/core/control`
**Evidence:** [`vocabulary.js` (line 11)](../../packages/core/src/control/vocabulary.js), [`types.ts` (line 17)](../../packages/core/src/contracts/types.ts), [`service.js` (line 17)](../../apps/device/src/service.js)

The canonical vocabulary coexists with legacy aliases and repeated camera
lists. `service.js`, the artifact executor, the adapter registry, and the
compile-time types do not expose one obviously authoritative control catalog.

**Acceptance:** create a descriptor for every semantic control containing its
canonical ID, aliases, allowed action kinds, adapter bindings, state
preconditions, and observation requirements. Generate validators, profile
checks, adapter capabilities, and documentation from that catalog.

### LEG-008 — Give `tools/device` a physical taxonomy (P1)

**Status:** OPEN
**Owner:** device tooling
**Evidence:** [`COMPATIBILITY.md` (line 19)](COMPATIBILITY.md)

The directory currently contains about 190 files with mixed roles: probes,
graders, emitters, runners, tests, transitional scripts, and historical
implementations. The lifecycle is documented, but the filesystem does not make
the canonical path apparent.

**Acceptance:** group tools by role and lifecycle, for example `observe`,
`calibrate`, `compile`, `grade`, `test`, and `legacy`; provide one README and
one canonical invocation per group; keep compatibility wrappers visibly thin.

### LEG-009 — Make research result timing and terminal semantics explicit (P2)

**Status:** OPEN
**Owner:** `packages/research`
**Evidence:** [`experiment.js` (line 160)](../../packages/research/src/experiment.js), [`cli.js` (line 44)](../../packages/research/src/cli.js)

`makeResultPayload()` promotes the terminal state of the first evaluation to
the whole experiment, and the CLI uses that value as the result event time.
Multi-seed or multi-candidate experiments do not necessarily have one terminal
frame.

**Acceptance:** keep terminal state per evaluation; expose an explicit aggregate
time or frame interval for the experiment; make the manifest event use that
aggregate field and add a multi-evaluation regression test.

### LEG-010 — Finish and verify the seed-cohort boundary (P1, current-tree item)

**Status:** OPEN — confirm after the current dirty research changes settle
**Owner:** `packages/research`, device plan consumers
**Evidence:** current-tree path `packages/research/src/seeds.js:64` (not yet
versioned in this audit commit), [`minus-3-plan.mjs` (line 211)](../../tools/device/minus-3-plan.mjs)

The current working tree fails JavaScript typecheck because the explicit
`seeds` option is not typed. The escape hatch also does not enforce the same
uint32/uniqueness rules as the canonical generator. Some consumers record the
golden salt even when an explicit seed array was supplied, which can misstate
provenance.

**Acceptance:** type the complete options object; validate explicit cohorts;
add focused seed tests; record derivation as `golden`, `explicit`, or
`explicit-range` instead of inferring it from a salt field.

### LEG-011 — Upgrade the architectural guard from regex heuristics (P2)

**Status:** OPEN
**Owner:** architecture tooling
**Evidence:** [`architecture-test.js` (lines 30 and 41)](../../tools/architecture-test.js)

The guard strips strings and finds imports with regular expressions. It is a
useful fast check, but it is not a complete parser and should not be the only
enforcement of package direction.

**Acceptance:** use an AST-based dependency rule or explicitly document the
guard as advisory and add a slower parser-backed lane for CI. Include dynamic
import and aliasing cases in the fixture suite.

### LEG-012 — Separate durable agent rules from dated operational history (P2)

**Status:** OPEN
**Owner:** project documentation
**Evidence:** [`AGENTS.md` (lines 94 and 121)](../../AGENTS.md)

The agent instruction file combines stable project invariants, commit policy,
device objectives, and a dated mistake register. This is useful operational
context but makes the canonical instruction surface harder to scan and easier
to misapply. The managed ai-memory block must remain intact.

**Acceptance:** keep stable rules and routing in `AGENTS.md`; move dated
lessons and detailed runbooks to linked documentation; add a short “when this
applies” label to each non-managed section.

## Existing validation snapshot

The following checks passed during the audit but do not close the findings:

- `node tools/architecture-test.js`
- `node tools/test-docs.mjs`
- `node tools/validate-references.js`
- `npm run test:affected`

`npm run typecheck` currently fails in `packages/research/src/seeds.js`; that
failure belongs to the current working tree and should be rechecked after the
pending seed changes are finalized.
