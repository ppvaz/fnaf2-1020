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
