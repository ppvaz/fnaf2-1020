# The Night 5 mask window's tolerance, and why the gate was killing its own cycle

Measured 2026-09-12 with `minus-toys-plan.mjs --night=5 --gate --runs=3000`,
holding the window's LENGTH fixed at 4751 ms and moving only its POSITION
(`maskOnMs` and `maskOffMs` shifted together).

| shift | night 5 |
|---|---|
| −400 ms | 5/3000 |
| −350 ms | 5/3000 |
| −300 ms | 5/3000 |
| −250 ms | 5/3000 |
| **−200 ms** | **3000/3000** |
| −100 / −50 / 0 / +50 / +100 / +125 / +150 / **+175 ms** | **3000/3000** |
| +200 ms | 0/3000 |
| +400 / +800 ms | 0/3000 |

**The safe band is [−200, +175] ms**, about 375 ms wide, centred at −12.5 ms.
The shipped position sits essentially at that centre, so the route is
well-placed; the margin is ±~185 ms, which is ±1 `LAST_VIEW_SAMPLE_FRAMES`
(12 frames = 200 ms). The cliff is a sampler quantum, not a coincidence.

## Length is not the variable — position is

Shortening the window collapses just as hard:

| `maskOnMs` | window | night 5 |
|---|---|---|
| 4449 | 4751 ms | 3000/3000 |
| 4649 | 4551 ms | 0/3000 |
| 4849 | 4351 ms | 0/3000 |
| 5249 | 3951 ms | 0/3000 |

but a full-length window moved +200 ms is also 0/3000, so "don't truncate the
correction" is not the fix. Arriving on time is.

## What this says about the gate

The gate's correction read-back held the stream:

    releaseAt = Math.max(releaseAt, correctedAt + maskSettleMs + 250);
    await waitUntil(correctedAt + maskSettleMs);

`MASK_SETTLE_MS` is 750 ms, because the mask effect needs a measured 358–712 ms
to become visible. So a corrected cycle released up to **1000 ms** late —
**five times outside a ±185 ms band**. The gate exists to rescue a cycle whose
mask press was lost, and it was instead converting that cycle from *possibly
saved* to *certainly dead*.

This also closes an arithmetic gap that had been open all session. Corrections
run at a measured ~12.5% of cycles across three device runs (3/24, 2/15, 3/25,
2/16). If every correction kills its cycle, a clean run needs zero corrections
across ~16 gates: 0.875¹⁶ ≈ **12%**. Multiplied by the 45.8% the route scores
under an uncontrolled epoch, that is ~5.5% per attempt — and zero wins across
the runs to date stops being bad luck and becomes the expected outcome.

## The change

The corrective contact is delivered exactly as before; the game never cared
whether anyone watched it land. What is removed is the *schedule's* payment for
watching. The read-back now runs after the release as a `control.gate.verify`
event, awaited at teardown so no night ends with one in flight, and best-effort:
a verification that cannot run is never a night failure.

`apps/device/test/adb-device-local-executor.test.js` pins it, with the fixture
flaw that hid the defect named in place — the existing gate fixtures set
`maskSettleMs: 0`, zeroing the exact constant responsible. The new fixture sets
it to 4000 ms and asserts the release is not anchored to it. Verified by
negative control: restoring the old anchoring fails the test.

## Still open

- Whether the unverified correction actually lands. The read-back moved off the
  critical path; it did not become more certain.
- The ~12.5% press loss itself, which is the root the correction only patches.
- The delivered epoch, which is a different quantity: it shifts *every* action,
  not just the mask window, and the route's loss bands under a drawn epoch
  cover 583 ms of 1000 — far wider than this window's own ±185 ms.
