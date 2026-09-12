# Withered Bonnie visual death-cause model — withdrawn 2026-09-12

Built 2026-09-12 from the night5-strokes2 jumpscare (271.90–272.20 s), 9
positives against 24 negatives drawn from the same night. **Withdrawn the same
day. Do not rebuild it this way.**

## What happened

Applied to the next run (night5-strokes3) it produced **24 false positives**,
spread evenly across ordinary gameplay from 39.58 s to 191.92 s, and did not
fire on the actual jumpscare — which was Foxy, at 192.2 s, after Balloon Boy
entered the office at 189.2 s and neutralised the flashlight.

That is a leave-one-run-out holdout, run by accident, and the model failed it.

## Why it cannot be fixed by adding those frames

Rebuilding with both runs' negatives (9 positives, 48 negatives) still builds,
but the margin gets *worse*, not better:

| corpus | positive_max | negative_min | margin |
|---|---|---|---|
| strokes2 only | 0.0697 | 0.0883 | 27% |
| strokes2 + strokes3 hard negatives | 0.0697 | 0.0757 | 8.7% |
| (for comparison) mangle | 0.102 | 0.212 | 108% |

Fitting the frames it failed on is not generalisation, and there is no third
run left to test on. The narrow margin says what the failure already said: this
jumpscare is dark and mid-distance, and in a 16×9 BOX luma grid over the centre
crop it is not separable from ordinary dark office and camera frames. The model
was a brightness detector wearing a label.

## The rule this breaks

`death-cause.py`'s own docstring: *"A one-run operator label is useful for
corpus work but is not enough to promote a model; calibration and holdout
sessions must remain separate before this can become a live fact."* The model
was built from one run, cited that sentence in its commit message, and shipped
anyway.

## What is kept

`withered-bonnie` stays in `SUPPORTED_LABELS`, and `test-death-cause.py` keeps
its fixture and its mutual-refusal check against the Marionette: the label and
the shadow-only protocol are fine. Only the retained device model is gone, so
the `grade-run.sh` glob over `models/death-cause-*.json` stops reporting it.

## What a real one needs

Positives from at least two separate Bonnie deaths, negatives from every run
available, and a holdout run the corpus never saw. If the envelopes still do
not separate, the answer is that this feature space cannot name this death —
which is a result, and belongs here rather than in a model file.

## Follow-up, same day: the metric was the defect, not just the corpus

The feature vector was never the problem — `_feature` already keeps all three
RGB channels. The **distance** was. Euclidean distance over raw RGB is
dominated by magnitude, and magnitude here is brightness: every channel of a
dark cell sits near zero, so two dark frames are near neighbours however
differently they are coloured. A dark, mid-distance Bonnie and a dark office
are exactly that pair.

Measured against the 24 frames that broke the model, used as the held-out run:

| metric | positive max | negative min (holdout) | margin | Foxy |
|---|---|---|---|---|
| euclid (what shipped) | 0.0697 | 0.0757 | +8.7% | 0.1018 |
| **cosine** | 0.2897 | 0.3893 | **+34.4%** | 0.3367 |
| chromaticity | 0.1218 | 0.1478 | +21.4% | 0.1120 |

Cosine compares the direction of the colour vector and discards its magnitude,
so it is brightness-invariant by construction, and it quadruples the margin on
the frames that caused the failure while still refusing Foxy.

Per-cell chromaticity looks like the obvious choice and is worse: normalising
brightness away entirely pulls the Foxy jumpscare *inside* the Bonnie envelope
(0.1120 against a 0.1218 positive maximum), collapsing two different deaths
into one label.

`death-cause.py` now records `metric` in the model and defaults to `euclid`
when the field is absent, so the three retained models — fitted under euclid,
and whose thresholds would mean nothing under another metric — are unchanged.

**The model is still withdrawn.** Cosine was chosen *by looking at this
holdout*, so the +34.4% is an optimistic number selected on the test set. A run
the corpus has never seen is what would make it a real result, and that run has
not happened yet.
