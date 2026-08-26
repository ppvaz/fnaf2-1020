# Exact-simulator policy interface and public-bot baselines

**Status: proposed 2026-08-26.** The repository has several focused policy and
search tools, but no single observation/action contract for comparing scripted,
belief-state, and learned policies. Public FNaF RL projects show the value of
that interface and the danger of silently changing the environment to suit it.

## Goal

Expose the existing exact engine through a stable, replayable policy interface
without creating a second simplified simulator. Use it to compare this project's
policies with independently reimplemented public-bot strategy families and to
price real sensor/actuator errors.

## Design rules

- [`src/engine.js`](../src/engine.js) remains the sole mechanics authority.
- Observation modes may hide truth; they must never mutate underlying mechanics.
- RNG, sensor noise, and actuator noise use independent seeded streams.
- Every result states whether it used truth, belief, detector-like observations,
  or recorded device inputs.
- A Gymnasium adapter is optional compatibility, not the canonical API.
- Baselines are reimplemented from documented behavior. Do not copy code from
  repositories without a compatible license.

## Core interface

The minimal contract should support:

```text
reset(configuration, gameSeed, noiseSeed)
observe(mode)
decide(policy, observation, deadline)
step(action, duration)
snapshot() / restore(snapshot)
inject(fault)
explainTerminal()
metrics()
```

Support at least four observation modes:

1. `truth` — full engine state, for debugging and upper bounds;
2. `stock-belief` — only information the planned controller can maintain;
3. `sensor-model` — delayed/noisy/unknown observations drawn from measured plan
   09 reports;
4. `recorded` — observation and actuator events from one device session.

## Baselines

### Local baselines

- shipped Minus 7 schedule;
- current Night 6 device recipe with measured actuator layer;
- `gatebot` and closed gate-aware families, preserving their 0/150 result;
- BB visual/audio experimental policies with their existing clean, worst-case,
  false-cue, and missed-cue anchors;
- a truth-state upper bound used only to quantify the cost of perception.

### Public-bot-inspired baselines

- **Jason-style FNaF 2 phase loop:** coarse timed wind/vent/office/Foxy phases,
  cheap pixel-like observations, menu lifecycle outside the night policy;
- **Shooter25-style priority machine:** explicit Wind/Stalling/Checking/Blackout/
  vent states, run once with truth and once through stock-belief observations;
- **Couraeel-style emergency priority policy:** direct-state upper bound followed
  by an observation-constrained adaptation;
- **small external-bot lifecycle baseline:** relative setup, retry, and terminal
  stop inspired by the better FNaF 1 bots.

These are architectural experiments, not ports. Cite the research census and
record every behavioral assumption that cannot be derived from public source.

## Work packages

### 1. Freeze the policy protocol

- Wrap current simulator construction, tick advancement, actions, RNG, and
  terminal reports.
- Add snapshot/restore with bit-identical continuation tests.
- Define action duration and overlapping-contact semantics once.
- Add a policy version and observation-mode stamp to every report.

**Gate:** existing tests and Minus 7 seed/worst-case results are bit-identical
through the adapter.

### 2. Port local policies as equivalence fixtures

- Run existing policy tools through both their legacy path and the adapter.
- Compare survival, death reason/time, box/power minima, stalls, and actions.
- Keep specialized search tools; use the adapter as their shared execution
  contract, not as a forced general search framework.

**Gate:** any difference is explained and deliberately accepted or fixed before
adding new baselines.

### 3. Add measured observation and actuator faults

Inject independently controllable:

- observation latency distribution and deadline expiry;
- false positive, false negative, unknown, and stale result;
- dropped or late contact;
- monitor forcedown and belief inversion;
- projection/helper/focus loss;
- controller pause, queue tail, and clock-offset uncertainty.

Support forced single faults before sampled compound distributions. A policy
that survives only average latency is rejected.

### 4. Implement and explain public-bot baselines

For each baseline, publish:

- source artifact and research summary;
- observation privileges;
- timing/coordinate assumptions translated into engine actions;
- unsupported mechanics or ambiguous branches;
- ordinary, pinned-worst, and fault-injected results;
- minimized representative death traces.

The Jason-like baseline is first because it is the nearest source-available
stock FNaF 2 comparator and its reported roughly one-in-three success provides
an external sanity target, not an expected exact match across PC and Android.

### 5. Add policy differential and counterfactual reports

- Replay the same seed and noise trace across policies.
- Snapshot immediately before a death and try bounded alternative decisions.
- Minimize a failing observation/action trace.
- Attribute failures to mechanics, policy, observation, actuator, or lifecycle.
- Report resource and reaction costs, not survival alone.

### 6. Optional Gymnasium compatibility

Only after the canonical interface and baselines pass:

- provide discrete or parameterized action spaces;
- expose truth and partial observations as explicitly different environments;
- support deterministic reset/seeding and episode recording;
- add heuristic/random baselines before any learned result;
- never describe simulator reward as stock-game performance.

RL promotion requires a policy to beat a scripted baseline on held-out noise/
session distributions and pass the same exact-model safety suite. Model-free RL
is not required for this plan to finish.

## Metrics

- survival and terminal reason/time;
- box and flashlight minima;
- camera-stall lapses and uncovered threat transitions;
- action count, contact time, and deadline slack;
- observation count, unknowns, stale/late results, and verification retries;
- belief-versus-truth divergence duration;
- recovery success/cost;
- results by game seed, noise seed, policy version, and observation mode.

## Deliverables

- canonical policy adapter and schema;
- snapshot/restore and deterministic replay tests;
- local-policy equivalence report;
- measured fault-injection layer consuming plan 09 distributions;
- Jason-, Shooter25-, and Couraeel-inspired reports;
- optional Gymnasium wrapper only if the core contract stays exact;
- documentation that keeps simulation, stock-device, and modified-game results
  visibly separate.

## Done when

- every compared policy runs on the same exact engine and seeded fault trace;
- truth and stock-observable privileges cannot be confused in output;
- current policy results remain reproducible;
- at least one public-bot-inspired baseline has an explained ordinary,
  worst-case, and fault-injected result;
- a real run from plan 09 can be replayed through the interface;
- the interface can reject a policy because of p99/tail faults rather than
  average behavior alone.

## Non-goals

- proving PC and Android implementations are identical;
- matching another author's reported success percentage exactly;
- replacing source provenance with empirical tuning;
- calling direct-state or simulator success a stock-game clear;
- requiring neural RL where deterministic search is stronger.
