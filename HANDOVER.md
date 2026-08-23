# Handover — iteration-time work, 2026-08-20

> **Historical snapshot.** The 2026-08-23 consolidation added direct
> `sourcetest` assertions, narrow `pilottest --assert` checks, a real failing
> `phasetest` exit contract, and the canonical [`tools/TOOLS.md`](tools/TOOLS.md)
> inventory. Use the current runner/index for present behavior; the measurements
> below remain the point of this handover. The held-WIND autoplay bug described
> below was fixed on 2026-08-23 by keeping a current held cue down across poll
> iterations; the full serial browser suite is the regression gate.

Answering "would the project benefit from faster iteration if we refactor the
engine?" The measured answer was **no, not the engine** — and then three things
that do pay, all shipped, plus one real bug found on the way out.

## The measurement that redirected the work

`src/engine.js` is not the bottleneck. A CPU profile over 400 nights is flat:
the hottest single line is `for (const u of this.units)` at 10%, and the rest is
25 200 frames x 7 units x a dozen cheap predicates with no hot spot to attack.

Two "skip idle work" refactors were prototyped and **thrown away**: an
early-`continue` in `tickUnits` for units with none of
`inside`/`pending`/`atOpening`/`insideDangerAt`, and a lazy `hallOccupied` in
`tickGoldenHall`. Both were byte-identical over 300 seeds and **2-4% slower** —
V8 was already doing better than the branches. Don't redo these. An SoA/typed-array
rewrite might buy 2x for serious fidelity risk on a decompile-sourced state
machine; that trade looks bad.

The bottleneck was never the engine's speed. It was that the searches wasted
half their work and used one core.

## What shipped

**1. `record` defaults off** (`48bcc18`). `Sim` allocated six per-frame typed
arrays and wrote them on all 25 200 frames by default; only the in-app report
and two diagnostic CLI paths read them. 5.4 ms -> 2.65 ms per night.
`cyclesearch --curve` 5.22 s -> 2.77 s, byte-identical output.

**2. Worker pool** (`787f061`, `57c3a69`). `tools/pool.mjs` spreads nights
across threads; a night is pure, so this was free correctness-wise. Pool is
created once per process and reused — startup dominates below ~1000 nights.
Batches deal round-robin, not in blocks, because a night that dies at 0:30
costs a fraction of one that runs to 6 AM and deaths cluster.

- 20 x 200 nights: 13.2 s on one worker, 5.3 s on eight.
- full `strategysearch` 12.8 s -> 6.2 s; full `gatesearch` 5.3 s -> 3.2 s.
- `--serial` pins to one thread and must produce identical output. It does,
  for every tool, and both match the pre-pool output.

Two traps found while wiring it, both now documented in the code:
- A worker inherits `process.argv`, so a task module with a CLI entry point
  needs `isMainThread` or the whole search re-runs inside every worker.
- Never point a pool at the CLI script driving it: on the single-threaded path
  the self-import deadlocks against its own top-level await. That is why the
  gate controller moved out to `tools/gatebot.mjs`.
- The clock-phased gate policy carried its camera sets as a closure, which
  cannot cross a structured clone. It is now `phases` + `phaseSplit` data.

**3. `tools/test.mjs`, one entry point** (this commit). `--engine` (about a
second), `--browser` (about four minutes), `--reports`, `--parallel`.

The honest part: **only `simtest` ever asserted.** `bbtest`, `minus2test`,
`minus6test`, `rvctest`, `androidstalltest` and `pilottest` print numbers and
always exit 0, so calling them "tests" under a PASS heading would be a lie.
They are `--reports`, unjudged. `bbtest --assert` was added to turn the
README's headline claim (no unwinnable RNG, zero stun lapses) into something
that can actually fail.

**4. Chrome is findable on macOS** (this commit). All five browser tools
hardcoded `google-chrome`, the Linux package name. **They had never been
runnable on this machine.** `tools/chrome.mjs` resolves the bundle path, with
`$CHROME` overriding.

## The bug that fell out of #4

Once `lessontest` could run at all, it failed two assertions:

```
— winding must be HELD, not tapped —
  FAIL holding builds a streak: false (want true)     held seconds: "0.00"
— jump to the full cycle —
  FAIL cycle passed: false (want true)                cycles run: 11, best streak: 5
```

**This is pre-existing and unrelated to any change here** — the only edit to
`lessontest.mjs` was the Chrome path. Confirmed by running it alone (199.8 s,
same two failures) and inside the concurrent group (201.8 s, same two failures).

`held seconds: 0.00` says the autoplayer's *hold* on WIND never registers as a
hold. Either the test's autoplayer stopped emitting a real press/release pair,
or the coach's hold grading regressed. Both lessons that fail are the two that
require a held control, which points at one shared cause. **Start here.**
It has been invisible for as long as the suite has been macOS-unrunnable.

## Open question deliberately left to you

The browser group runs **serially by default**. Concurrency is safe for the
verdict — same failures either way — but measurably degrades the page: the
same lessontest run reached best streak 5 alone and 3 under five headless
Chromes on four cores. Starving a millisecond-graded trainer to save wall clock
felt like the wrong default to pick on your behalf. `--parallel` takes the
group from about 280 s to about 200 s if you disagree.

## Why the browser suite is slow, and what could cut it

Not padding. `src/curriculum.js` sets `target: 8` for *beat*/*sweep* and
`target: 10` for *cycle*, at one clean pass per 5 s — 40 s and 50 s of real
drilling, and "timing is never slowed down" means the page cannot be
fast-forwarded. The 47 s / 58 s sleeps are those numbers plus slack.

Three levers, none taken:

| lever | saves | gives up |
|---|---|---|
| poll `#passed` instead of a fixed sleep | ~15-25 s of 192 s | nothing |
| test sets `window.app.mode.target = 3` after entering a lesson | ~120 s | stops proving 8/10 passes are *required* |
| `--parallel` | ~80 s | timing fidelity under load (above) |

The first is free and worth doing. The second is a real trade and is your call.

## Not done

- The full `cyclesearch` hill-climb was never re-run to completion on the pool.
  Pre-pool it ran past 11 minutes; expect roughly 2-2.5x off that. Worth one
  confirming run.
- `minus2test`, `minus6test`, `rvctest`, `androidstalltest`, `pilottest` have
  no assertions. Whether each has a defensible threshold is a judgement about
  the model that belongs to you, not to a runner.
