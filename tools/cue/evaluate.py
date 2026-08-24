#!/usr/bin/env python3
"""Score cue detection against real device background at known SNRs.

ANDROID-AUDIO-CAPTURE.md records that internal capture on this phone carries
the music-box winding loop and Mangle's static even when the operator hears
neither. Plan 08 therefore requires the detector to be challenged with those
loops as negative background rather than evaluated on clean samples.

This injects a reference cue into a real captured window at a known offset and
a swept signal-to-background ratio, and reports whether the correct sample wins
and by how much. It is a controlled lower bound on the real problem, not a
substitute for labeled gameplay: the true mix also contains the game's own
concurrent voices.

  tools/cue/evaluate.py captures/cue-helper/calibration/title-*.wav
  tools/cue/evaluate.py bg.wav --cues 21 23 24 --snr 12 6 0 -6

The `background` column repeats the run with a per-run background profile
subtracted in the feature domain (plan 08 detector shape, step 3). Subtraction
is reported as an experiment, never assumed to have removed the artifact.
"""
import argparse
import pathlib
import statistics
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import detect  # noqa: E402
import features  # noqa: E402

# Gate 0 left the controller needing "a BB vocal happened", not which one:
# identity comes from controller state, and the cue only arms a visual check.
# So the scored decision is the class, and 23-mistaken-for-24 is a hit.
CLASSES = {
    "bb-vocal": (21, 23, 24),
    "thud": (17,),
    "taunt": (16,),
    "footstep": (25, 26, 27, 28, 29),
}
DEFAULT_CUES = [21, 23, 24, 17]
DEFAULT_SNR = [18, 12, 6, 0, -6]


def inject(background, cue, offset_s, snr_db):
    """Add `cue` into a copy of `background` at the requested ratio."""
    out = list(background)
    start = int(offset_s * features.RATE)
    bg_rms = features.rms(background) or 1e-9
    cue_rms = features.rms(cue) or 1e-9
    gain = (bg_rms * (10.0 ** (snr_db / 20.0))) / cue_rms
    for i, value in enumerate(cue):
        target = start + i
        if target >= len(out):
            break
        out[target] += value * gain
    return [max(-1.0, min(1.0, v)) for v in out]


def background_profile(frames):
    """Per-band median across time: the stationary part of the window."""
    if not frames:
        return []
    return [statistics.median([f[b] for f in frames])
            for b in range(len(frames[0]))]


def subtract(frames, profile):
    out = []
    for frame in frames:
        row = [v - p for v, p in zip(frame, profile)]
        mean = sum(row) / len(row)
        out.append([v - mean for v in row])
    return out


def score_all(frames, refs):
    scores = {}
    for handle, template in refs.items():
        result = detect.best_alignment(frames, template)
        if result is not None:
            scores[handle] = result
    return scores


def class_of(handle):
    for name, members in CLASSES.items():
        if handle in members:
            return name
    return "other"


def class_scores(scores):
    """Best score per class, and where its winner landed."""
    best = {}
    for handle, (score, at) in scores.items():
        name = class_of(handle)
        if name not in best or score > best[name][0]:
            best[name] = (score, at, handle)
    return best


def report(label, scores, truth):
    if not scores:
        return "%-10s no-templates" % label
    best = class_scores(scores)
    order = sorted(best.items(), key=lambda kv: kv[1][0], reverse=True)
    name, (top_score, top_at, handle) = order[0]
    runner = order[1][1][0] if len(order) > 1 else 0.0
    want = class_of(truth) if truth >= 0 else None
    verdict = "-" if want is None else ("hit" if name == want else "MISS")
    return ("%-10s top=%-9s %6.3f (s%d)  margin %6.3f  onset %5.2fs  %s"
            % (label, name, top_score, handle, top_score - runner,
               top_at * features.HOP / float(features.RATE), verdict))


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("background")
    parser.add_argument("--refs", default=detect.DEFAULT_REFS)
    parser.add_argument("--cues", type=int, nargs="+", default=DEFAULT_CUES)
    parser.add_argument("--snr", type=float, nargs="+", default=DEFAULT_SNR)
    parser.add_argument("--offset", type=float, default=1.5,
                        help="seconds into the window to place the cue")
    opts = parser.parse_args()

    refs = detect.load_references(opts.refs)
    if not refs:
        sys.exit("no reference samples in %s" % opts.refs)
    background = features.load_window(opts.background)
    bad = detect.window_quality(background)
    if bad:
        sys.exit("background window is unusable: %s" % bad)

    base_frames = features.band_frames(background)
    profile = background_profile(base_frames)
    print("background %s  %.2fs rms=%.4f"
          % (pathlib.Path(opts.background).name,
             len(background) / float(features.RATE), features.rms(background)))
    print()
    print("no cue injected (every hit here is a false positive):")
    print("  " + report("raw", score_all(base_frames, refs), -1))
    print("  " + report("subtracted",
                        score_all(subtract(base_frames, profile), refs), -1))

    for cue in opts.cues:
        if cue not in refs:
            print("\nsample %d: no reference" % cue)
            continue
        source = features.load_window(
            pathlib.Path(opts.refs) / ("s%04d.wav" % cue))
        print("\nsample %d injected at %.2fs:" % (cue, opts.offset))
        for snr in opts.snr:
            mixed = inject(background, source, opts.offset, snr)
            frames = features.band_frames(mixed)
            print("  %+5.0f dB  %s" % (snr, report("raw", score_all(frames, refs), cue)))
            print("           %s" % report(
                "subtracted",
                score_all(subtract(frames, background_profile(frames)), refs), cue))


if __name__ == "__main__":
    main()
