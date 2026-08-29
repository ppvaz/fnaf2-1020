# Policy-program synthesis and search-to-device equivalence

**Status: proposed 2026-08-29, Pedro's directive.** Build an invention engine
that searches complete, auditable night programs—not timing knobs inside one
hand-authored loop—and guarantees the device executes the same program that the
exact engine evaluated.

## Goal

Given sourced mechanics, calibrated actuator constraints, and an explicit
observation budget, synthesize structurally distinct candidate policies; replay
them in the exact engine; prune dominated candidates; and compile a promoted
candidate into the phone runner without changing its meaning.

The initial target shape is exemplified by Night 1 Minimal Minus Toys:

```text
idle until 115 s
arm the split camera state
repeat every 5 s from 140 s to 360 s:
  refresh CAM 09 light
  wind the box
finish at 360 s:
  lower the monitor
observe without input through 420 s
```

That is a program with phases, a setup action, a periodic body, a terminal
action, and an observation tail. It is not recoverable from the old search
space, which represented a fixed cycle plus timing knobs.

## Non-goals

- Do not use unrestricted natural-language generation as the controller.
- Do not treat unsourced mechanics, invisible state, or unmeasured device
  actions as searchable facts.
- Do not promote a simulator winner directly to a live-night claim.
- Do not keep separate hand-maintained definitions for simulator policy,
  emitted plan, and phone execution.

## Policy IR

Use a versioned plain-data policy program. A program contains:

- metadata: strategy family, game/night scope, source dependencies, calibration
  profile, and policy hash;
- phases: `idle`, `setup`, `repeat`, `finish`, and `observe` with absolute or
  derived time bounds;
- typed actions: monitor/mask/camera/light/wind plus their expected visible
  result, resource cost, and action-lock constraints;
- observations: allowed sensor fact, latest acceptable age, confidence floor,
  and whether it may alter control or only record evidence;
- proof obligations: model gate seed sets, device-contact limits, end-state
  requirements, and a trace equivalence check.

The IR is deliberately finite and auditable. It can express a policy as data,
but not arbitrary shell commands or unbounded branching.

## Work packages

### P1 — versioned policy-program schema

Define the JSON/plain-data schema, canonical serialization, program hash,
source-dependency record, and replay fixtures for idle/setup/repeat/finish/
observe. Port the current device-plan headers into this schema rather than
adding another format.

**Done when:** the Night 1 minimal policy serializes and round-trips with the
same phases, action timestamps, and terminal observation window.

### P2 — one semantic interpreter

Implement the IR evaluator on top of `Sim`. It must derive action events,
resource accounting, and expected control state from the program; no strategy
may carry a second inline timeline.

**Done when:** existing Minus 7, standard Minus Toys, and Night 1 minimal
replay identically to their current gated behavior or have a documented,
source-backed semantic difference.

### P3 — structural policy grammar

Define a small grammar for legal synthesis moves: choose sourced setup target,
idle/loop/finish boundaries, cycle period, action primitives, bounded proof
visits, and safe observation tails. Encode known-family fingerprints so the
search labels a rediscovery rather than calling it novel.

**Done when:** the grammar generates the existing families, rejects impossible
action orderings, and identifies each known family from its canonical IR.

### P4 — constrained structural search

Enumerate or beam-search grammar candidates with exact-engine replay, worst
controls where meaningful, actuator/contact constraints, resource margins,
and Pareto/dominance pruning. Persist every candidate, rejection reason, and
dependency set.

**Done when:** one reproducible campaign returns a frontier with both positive
controls and known negatives, and no candidate is admitted solely because an
unmodelled device behavior was assumed.

### P5 — compiler equivalence gate

Compile the same IR to (a) simulator events, (b) the device plan, and (c) a
mocked phone-interpreter trace. Compare timestamped actions, phase boundaries,
touch releases, terminal actions, and observation windows byte-for-byte within
declared clock rounding.

**Done when:** a test would have rejected all three Night 1 defects found on
2026-08-29: early arm, hard-coded 10 s cadence, and missing terminal/observe
tail.

### P6 — safe device execution contract

Make the runner consume only a compiled IR artifact, record its hash in the
session manifest, and separate low-cost capture from opt-in bounded grading.
The runner must finish all terminal actions, remain hands-off during declared
observation phases, and never launch unbounded host analysis automatically.

**Done when:** a device session can prove it ran the compiled program while the
host remains responsive; post-run analysis is an explicit, resource-capped
operation.

### P7 — invention campaign and promotion

Run the new grammar against a scoped target (story Nights 1–5 first), inspect
survivors, source every novel mechanic, and promote only candidates that pass
P5 then shadow/device evidence under Plan 12's claim ladder.

**Done when:** the campaign publishes either one structurally distinct,
evidence-backed candidate or a complete negative frontier explaining why every
legal family was rejected.

## Dependencies

P1–P2 are the foundation. P3–P4 depend on exact semantic replay; P5 binds
search to execution and must precede live promotion. P6 depends on P5 and
Plan 09's manifest contract. P7 depends on all earlier packages plus Plans 11
and 12 for fair baselines and claims.

Plans 19 and 20 remain complementary: they provide facts, uncertainty, and
short-horizon decisions. This plan provides the policy-program language and
the invention/equivalence discipline beneath them.
