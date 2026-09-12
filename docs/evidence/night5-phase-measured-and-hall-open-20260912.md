# Night 5, 2026-09-12: the delivered phase, measured — and the hall still open

Three runs (strokes1 traced, strokes2 untraced, strokes3 traced). None reached
6 AM: 174 s, 248.9 s, ~192 s against 420 s. The best result on record remains
285 s, from before this session.

## 1. The delivered phase is now measurable

`model.uncontrolledPhase` is the number that reorders the problem: the route
scores **3000/3000 at epoch 0 and 1233/3000 (41.1%) when the epoch is drawn
uniformly over one game second**. Its loss bands cover 583 ms of the 1000 ms
period, and 1 − 0.583 = 0.417 matches the measured rate.

Until now the origin could not be resolved better than the lifecycle sampler's
cadence: brackets of 2358, 3261 and 2792 ms across the three runs, all *wider
than the period they had to resolve*. The dominant term was unmeasurable.

The Cue Helper native frame trace pins it. It carries `screen_identity` per
frame at ~60 Hz (p50 16.69 ms, held even with the gate draining the same
ImageReader), so the first `FNAF2_NIGHT` frame is bracketed by one frame
interval instead of one second.

`phase-reconstruct.mjs --frame-trace` now reports, for strokes3:

    errorMs             4692.5     game's first night frame, after T0
    deliveredEpochMs     307.5     = -errorMs mod 1000
    uncertaintyMs         38.1     = frame 18.8 + clock 19.3
    nearest band edge      9.2     [316.67, 800)
    conclusive           false

**Sign convention**, stated because getting it backwards names the opposite
band: `minus-toys-plan.mjs` computes `when = base + at + epochMs` in
game-relative time, so positive `epochMs` fires later against the game's grid.
On the phone the plan is anchored to T0 while the night starts `errorMs` later,
placing every action `errorMs` *early* — so the delivered epoch is the negative
of that error, modulo one game second.

### The estimator mattered more than the filter

Asked where a Kalman filter would help, the data says: not here.

- **No drift to track.** The two clocks drift 0.33 and 0.06 ms per 1000 s —
  0.05 ms across a night.
- **The noise is one-sided.** What remains after anchoring on `ageUs` is
  residual read latency, which can only push an estimate later. Residuals
  against their own floor: `0 17 18 18 19 20 21 22 35 38 44 60 61 66 70 105`.

So the estimator is the **minimum**, as NTP takes the minimum round trip, not
the median — which sits ~28 ms above the floor on both runs — and the
uncertainty is how fast the distribution rises off its floor, not the full
spread. Quoting the spread treated the dispersion of one sample as the
uncertainty of an estimate built from sixteen. Correcting this alone took the
phase uncertainty from 124.1 ms to 38.1 ms.

A Kalman filter would have been wrong twice: symmetric-noise assumption the
data violates, and a drift state with nothing to track.

## 2. The hall is still open, and the numbers do not agree

`minus-toys-plan.mjs` sets `hallMs: 33`, exactly `MIN_CONTACT_MS`. Unlike the
floors corrected earlier this session, **this is not a tautology**: 33 ms is a
measured length that lights the hallway without panning, and the comment
records a reasoned refusal to lengthen it, because the hall button sits in the
view region where a held touch pans. That is a documented trade-off.

What does not fit is the rate. The comment records a **1-in-3 drop measured
2026-09-09** — about 67% success. The video instrument reports **1 visible hall
flash in ~24 loop cycles** (and 1 in ~28 on strokes1), about 4%.

That is a 16x discrepancy between a recorded measurement and the current one,
and it is unresolved. Either the hall degraded, or the instrument is blind. Its
own note says visible flashes are a *rendering lower bound* — the sourced
movement blackout can hide logically accepted flashes — so blindness is live.

### Settled by the frame trace: the instrument was blind, the hall is 31%

A first pass with hand-picked screen thirds could not separate a 33 ms hall
pulse from the office reveal, and this document said no hall region signature
existed. **That was wrong.** `PixelWatch.java` has carried one all along:

    FOXY_HALL_X 1650  Y 300  WIDTH 450  HEIGHT 400  STEP 8
    foxy_hall_mean_luma | foxy_hall_mean_redness | foxy_hall_red_cells

Those ROIs are readable live through the watch API but are **not** in the
frame-trace v3 schema, which carries only the watch spec's sha256, the 20x9
`grid_hex`, and the mask/monitor luma and downstrokes. So the hall is measured
from `grid_hex` through the cells covering that rectangle -- a coarser
superset (600x480 at 1560,240 against 450x400 at 1650,300), derived from the
Java constants rather than typed by hand.

Reading that window against an office window away from it separates the two
events, which is what the thirds could not do: if both brighten the mask came
off and the hall lit; if only the office does, the hall did not light.

    gateAtMs   HALL     DESK    verdict
       5200   +41.1    +21.6    hall lit
      15200    +1.9    +18.2    HALL DARK
      25200   +44.0    +21.6    hall lit
      ...
      85200    -0.4     +4.8    mask never came off
      95200    +0.8    +18.2    HALL DARK
     105200    +1.6     +4.8    mask never came off
     115200    -0.3    +18.2    HALL DARK
     145200    +0.5    +15.0    HALL DARK

**4 of 13 revealed cycles are HALL DARK -- 31%** -- against the plan's recorded
1-in-3 drop from 2026-09-09. The two measurements agree. The 4% the video
instrument reported was its own blindness, exactly as its note warned; the hall
has not degraded. Separately, 2 of 15 cycles never took the mask off at all,
which is a different defect and is counted as one.

`tools/device/hall-flash-metric.mjs` is this measurement, so it is not
rediscovered. The exact fix is a frame-trace v4 carrying the three
`foxy_hall_*` values directly instead of a grid proxy; that is an APK change
and an operator decision.

## 3. How strokes3 actually ended

Balloon Boy entered the office at 189.2 s (Night 5, 2 AM), neutralising the
flashlight; the screen went dark for 2.1 s; Foxy struck at 192.2 s. Confirmed
by eye from the retained video, not from a classifier — the withered-bonnie
model built earlier the same day called 24 ordinary gameplay frames Bonnie and
stayed silent on the actual Foxy jumpscare, and has been withdrawn
(`withered-bonnie-visual-model-withdrawn-20260912.md`).

## Open, in the order they are worth attacking

1. **The hall drops 31% of cycles**, now measured rather than disputed. Foxy is
   repelled by that light and Foxy ended this run. `hallMs` is 33 ms, exactly
   `MIN_CONTACT_MS` -- but unlike the floors corrected earlier today this is not
   a tautology: 33 ms is measured to light without panning, and the plan records
   a reasoned refusal to lengthen it because the button sits in the pan region.
   Any change has to be qualified against a pan first.
2. **Accumulate the phase measurement across traced runs.** One run cannot say
   which side of a band edge 307.5 ± 38.1 sits on; the epoch is redrawn every
   run, so the distribution is what carries the claim.
3. **Anchor the night origin natively.** If the first night frame is detectable
   at 18.8 ms *live* rather than post-hoc, the release can be placed at a chosen
   epoch instead of a drawn one — 41% becomes a choice. This changes the
   actuator and is an operator decision.
4. The ~12.5% lost mask press, stable across all three runs, is a Bernoulli
   rate and no estimator fixes it.
