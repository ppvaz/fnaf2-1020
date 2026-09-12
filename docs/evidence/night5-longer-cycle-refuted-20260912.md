# Longer loop cycles refuted — Night 5, 2026-09-12

## The gap that suggested it

`plans/16-constrained-policy-search.md` and `tools/TOOLS.md` record that
`tools/minus7/cyclelengthsearch.mjs` swept the cycle **6000–10000 ms** and found
every shorter window collapses, concluding:

> 10 s is load-bearing (it is 2x the 5 s movement-opportunity grid; anything
> else permanently shifts the clear cycle's monitor-down phase).

The sweep only went **down**. But the stated reason — being a multiple of the
5 s movement-opportunity grid — equally admits 15000 and 20000 ms, and those
were never scored. That looked like an unexplored dimension against the
standing constraint that "the 10 s cycle has no slack for both" a
phase-independent mask window and enough winding: a longer cycle buys absolute
slack per cycle.

## Result: refuted, decisively

    node tools/device/minus-toys-plan.mjs --night=5 --gate --runs=3000 \
      --knobs=loopPeriodMs=N

    loopPeriodMs 10000   ->   3000/3000
    loopPeriodMs 15000   ->      0/3000
    loopPeriodMs 20000   ->      0/3000

Not a degradation — a collapse. The slack a longer cycle buys is worth nothing
because the mask window's *recurrence* is what clears vent occupants; spacing
the windows 15 s apart lets an approach complete between them. The period is
load-bearing in both directions, and grid alignment is necessary but nowhere
near sufficient.

## What this closes

The strategy space around this route is now explored in every direction that
has been proposed:

| route | result |
|---|---|
| shorter cycle (6000–9500 ms) | every window collapses (Plan 16) |
| **longer cycle (15000, 20000 ms)** | **0/3000 — this document** |
| widen the mask to a phase-independent ≥5200 ms | ticks 5 at every phase, but costs 300 ms/cycle of winding: mean 46.7% → 32.8% |
| minus 3 | same 4800 ms window, same zero margin |
| `reactiveBB` feedback layer | 0/1080 on Night 5 at every phase and observation model |

None of these is the escape. What remains is not a better *route* but better
*execution*: the delivered epoch. The same route scores 3000/3000 at epoch 0
and 1375/3000 (45.8%) when the epoch is drawn uniformly over one game second,
and the epoch has been drawn, not chosen, on every device run to date.

See `night5-phase-measured-and-hall-open-20260912.md`: the delivered epoch is
now measurable to ±38 ms, against a sampler quantum of 200 ms and an origin
that could previously only be bracketed at 2358–3261 ms. Choosing it is the
one lever with an order of magnitude in it that has not been pulled.
