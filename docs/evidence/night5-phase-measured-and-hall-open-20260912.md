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

## 2. The hall: measured twice, wrong twice, retracted

This section previously reported that the hallway light fails on 31% of loop
cycles, that the failure was perfectly separated by the office-reveal onset
(408-445 ms lit 9/9, 208-244 ms dark 4/4), and that `hall-flash-metric.mjs`
measured it. **All of that is withdrawn. It was measured on the wrong screen.**

Pedro asked to see example frames. One look settled it: the frames the tool
scored as "hall lit" and "hall dark" are the **camera monitor screen** — the
CAM map and the Prize Corner feed — not the office. The `FOXY_HALL` rectangle
only means anything with the monitor down, and the measurement never required
that. It filtered on `screen_identity == 2`, which only says a night is in
progress and is equally true with the monitor raised. What was actually being
compared was the brightness of a camera feed.

A second attempt added an office filter — both button strokes drawn, per
`buttonStrokeState` — and selected the *same frames*, so that filter does not
exclude the camera screen either. That is a second, separate defect and it is
unexplained: the stroke pair is supposed to read monitor-up as mask-absent.

`tools/device/hall-flash-metric.mjs` is removed rather than patched. It was
wrong twice in one session, in the same direction both times — a number that
looked like a finding because it agreed with a remembered one (the 1-in-3 drop
of 2026-09-09). Agreement with a prior is not verification.

### What still stands

- `PixelWatch.java` does define a hall ROI (`FOXY_HALL` 1650, 300, 450x400,
  plus `foxy_hall_mean_luma|redness|red_cells`). It is real and it is not in
  the frame-trace v3 schema, only the watch spec's sha256 is.
- The dump settles the semantics, and this part was never in doubt: during a
  hall occupant's movement the light is still ON (`lit?` stays 1, group 202
  renders animation 99 instead of 36) and `viewing hall light` is set from
  `lit?` with **no movement condition** (group 489), so Foxy's reset still
  applies. Any future instrument must treat a dark-looking hall as an upper
  bound on failure, never as a failure. Pedro's judgement that separating
  animation 99 from 35 is too subtle to be worth chasing stands.
- `hallMs` is 33 ms, exactly `MIN_CONTACT_MS`. The standing refusal to lengthen
  it — "the hall button is in the view region where a held touch pans" — is
  **retracted by Pedro on 2026-09-12**: a held touch inside the region does not
  pan; that was a misreading of the mask/monitor state desync, made before the
  desync was understood. Lengthening is open, and still needs qualification and
  an operator rebinding.

### The lesson, which is the same one twice

Both the withdrawn withered-bonnie model and this measurement produced a
confident number from data that was never looked at. In both cases one glance
at the actual frames ended it. **Look at the frames before reporting a rate.**

## 3. How strokes3 actually ended

Balloon Boy entered the office at 189.2 s (Night 5, 2 AM), neutralising the
flashlight; the screen went dark for 2.1 s; Foxy struck at 192.2 s. Confirmed
by eye from the retained video, not from a classifier — the withered-bonnie
model built earlier the same day called 24 ordinary gameplay frames Bonnie and
stayed silent on the actual Foxy jumpscare, and has been withdrawn
(`withered-bonnie-visual-model-withdrawn-20260912.md`).

## Open, in the order they are worth attacking

1. **The hall drop rate is UNKNOWN.** The 31% figure this list used to quote is
   withdrawn in section 2 -- it was measured on the camera-monitor screen. The
   only standing figure is the 1-in-3 drop recorded 2026-09-09. The pan
   constraint on lengthening `hallMs` is also retracted (Pedro, 2026-09-12): a
   held touch inside the region does not pan. Lengthening is open and needs
   qualification, but there is no current measurement to aim it at.
2. **Accumulate the phase measurement across traced runs.** One run cannot say
   which side of a band edge 307.5 ± 38.1 sits on; the epoch is redrawn every
   run, so the distribution is what carries the claim.
3. **Anchor the night origin natively.** If the first night frame is detectable
   at 18.8 ms *live* rather than post-hoc, the release can be placed at a chosen
   epoch instead of a drawn one — 41% becomes a choice. This changes the
   actuator and is an operator decision.
4. The ~12.5% lost mask press, stable across all three runs, is a Bernoulli
   rate and no estimator fixes it.
