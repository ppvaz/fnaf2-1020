#!/usr/bin/env python3
"""Checks for the cue front end, using synthesised signals only.

No game audio is involved: the reference samples live outside the repository
and may not exist on a given machine, so every signal here is generated. What
is asserted are the properties the detector's conclusions rest on -- level
invariance, alignment accuracy, fail-closed window screening, and that
subtracting a stationary background helps a transient stand out.

  tools/cue/test-cue.py
"""
import math
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import detect  # noqa: E402
import evaluate  # noqa: E402
import features  # noqa: E402

FAILURES = []
PASSED = 0


def ok(what, condition):
    global PASSED
    if condition:
        PASSED += 1
    else:
        FAILURES.append(what)


def chirp(seconds, f0=400.0, f1=2600.0, rate=features.RATE):
    """A transient with moving spectral content, like a short vocal."""
    n = int(seconds * rate)
    out = []
    for i in range(n):
        t = i / float(rate)
        freq = f0 + (f1 - f0) * (i / float(n))
        envelope = math.sin(math.pi * i / n) ** 2
        out.append(0.5 * envelope * math.sin(2 * math.pi * freq * t))
    return out


def hum(seconds, rate=features.RATE, seed=7):
    """Stationary background: a low tone plus steady broadband noise.

    Stands in for the music-box winding loop and Mangle's static, which
    ANDROID-AUDIO-CAPTURE.md records as always present in internal capture.
    """
    rng = random.Random(seed)
    n = int(seconds * rate)
    return [0.25 * math.sin(2 * math.pi * 160.0 * i / rate)
            + 0.12 * (rng.random() * 2 - 1) for i in range(n)]


# ------------------------------------------------------------ level invariance
signal = chirp(1.0)
quiet = [v * 0.1 for v in signal]
loud = [v * 2.0 for v in signal]
frames_ref = features.band_frames(signal)
frames_quiet = features.band_frames(quiet)
ok("features are non-empty", len(frames_ref) > 10)
worst = max(abs(a - b)
            for ra, rb in zip(frames_ref, frames_quiet)
            for a, b in zip(ra, rb))
ok("a 20 dB level change barely moves the features (%.4f)" % worst, worst < 0.05)
score, _ = detect.best_alignment(features.band_frames(loud), frames_ref)
ok("a scaled copy still scores ~1 (%.3f)" % score, score > 0.99)

# ---------------------------------------------------------- alignment accuracy
background = hum(5.0)
onset = 1.5
mixed = evaluate.inject(background, signal, onset, 12.0)
score, at = detect.best_alignment(features.band_frames(mixed), frames_ref)
found = at * features.HOP / float(features.RATE)
ok("onset recovered within 100 ms (got %.3fs, wanted %.3fs)" % (found, onset),
   abs(found - onset) <= 0.1)

# ------------------------------------------------------------- window screening
ok("silence is UNKNOWN", detect.window_quality([0.0] * 16000) == "silent")
ok("an empty window is UNKNOWN", detect.window_quality([]) == "empty")
ok("a short window is UNKNOWN", detect.window_quality(chirp(0.05)) == "too-short")
clipped = [1.0 if i % 2 else -1.0 for i in range(16000)]
ok("clipping is UNKNOWN", detect.window_quality(clipped) == "clipped")
ok("a normal window passes", detect.window_quality(background) is None)

# ------------------------------------------- background subtraction, measured
# The property the operating rule depends on: against a stationary background,
# subtracting its profile must raise the transient's score, not lower it.
mixed_frames = features.band_frames(evaluate.inject(background, signal, onset, 0.0))
raw_score, _ = detect.best_alignment(mixed_frames, frames_ref)
profile = evaluate.background_profile(mixed_frames)
sub_score, sub_at = detect.best_alignment(
    evaluate.subtract(mixed_frames, profile), frames_ref)
ok("subtraction raises a transient at 0 dB (%.3f -> %.3f)" % (raw_score, sub_score),
   sub_score > raw_score)
ok("and keeps the onset (%.3fs)" % (sub_at * features.HOP / float(features.RATE)),
   abs(sub_at * features.HOP / float(features.RATE) - onset) <= 0.15)

# A background with no transient in it must not produce a confident match.
plain = features.band_frames(background)
plain_score, _ = detect.best_alignment(
    evaluate.subtract(plain, evaluate.background_profile(plain)), frames_ref)
ok("background alone scores below the injected cue (%.3f < %.3f)"
   % (plain_score, sub_score), plain_score < sub_score)

# --------------------------------------------------------------- class mapping
ok("the three vocals share one class",
   len({evaluate.class_of(h) for h in (21, 23, 24)}) == 1)
ok("the thud is its own class", evaluate.class_of(17) == "thud")
ok("an unmapped handle is not a cue class", evaluate.class_of(999) == "other")

if FAILURES:
    for item in FAILURES:
        print("FAIL: %s" % item)
    sys.exit("cue checks: %d/%d pass" % (PASSED, PASSED + len(FAILURES)))
print("cue checks: %d/%d pass" % (PASSED, PASSED))
