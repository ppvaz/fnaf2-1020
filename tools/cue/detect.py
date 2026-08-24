#!/usr/bin/env python3
"""Template-match reference cue samples against a captured window.

Plan 08's detector shape, implemented as written there: deterministic features,
a score margin rather than a bare threshold, and `UNKNOWN` for any window the
front end cannot vouch for. It reports onsets; it does not decide anything.

  tools/cue/detect.py captures/cue-helper/calibration/*.wav
  tools/cue/detect.py --refs /private/tmp/fnaf2-cue-refs window.wav

A match is the mean per-frame cosine similarity between a reference's
log-band frames and the window's, at the best alignment. Because each frame
has its own mean removed, the score is a shape agreement: playing the cue
quieter does not lower it, and turning the whole mix up cannot raise it.
"""
import argparse
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import features  # noqa: E402

DEFAULT_REFS = "/private/tmp/fnaf2-cue-refs"
# A window that is clipped, silent, or too short to hold the shortest template
# is not a negative observation -- it is no observation.
CLIP_LEVEL = 0.995
CLIP_FRACTION = 0.001
SILENCE_RMS = 1e-4


def load_references(refdir):
    root = pathlib.Path(refdir)
    refs = {}
    for path in sorted(root.glob("s*.wav")):
        match = re.fullmatch(r"s(\d+)\.wav", path.name)
        if not match:
            continue
        frames = features.band_frames(features.load_window(path))
        if frames:
            refs[int(match.group(1))] = frames
    return refs


def window_quality(samples):
    """Return None if the window is usable, else the reason it is not."""
    if not samples:
        return "empty"
    clipped = sum(1 for v in samples if abs(v) >= CLIP_LEVEL)
    if clipped > len(samples) * CLIP_FRACTION:
        return "clipped"
    if features.rms(samples) < SILENCE_RMS:
        return "silent"
    if len(samples) < features.FRAME * 4:
        return "too-short"
    return None


def _cosine(a, b):
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0.0 or nb <= 0.0:
        return 0.0
    return dot / ((na ** 0.5) * (nb ** 0.5))


def best_alignment(window_frames, template):
    """Best mean-cosine score and its onset frame, over all alignments."""
    span = len(window_frames) - len(template) + 1
    if span <= 0:
        return None
    best_score = -1.0
    best_at = 0
    for offset in range(span):
        total = 0.0
        for i, row in enumerate(template):
            total += _cosine(window_frames[offset + i], row)
        score = total / len(template)
        if score > best_score:
            best_score = score
            best_at = offset
    return best_score, best_at


def analyse(path, refs):
    samples = features.load_window(path)
    bad = window_quality(samples)
    if bad:
        return {"file": pathlib.Path(path).name, "state": "UNKNOWN",
                "reason": bad, "scores": {}}
    frames = features.band_frames(samples)
    scores = {}
    for handle, template in refs.items():
        result = best_alignment(frames, template)
        if result is None:
            continue
        score, offset = result
        scores[handle] = {
            "score": round(score, 4),
            "onset_s": round(offset * features.HOP / float(features.RATE), 3),
        }
    return {
        "file": pathlib.Path(path).name,
        "state": "OBSERVED",
        "seconds": round(len(samples) / float(features.RATE), 3),
        "rms": round(features.rms(samples), 4),
        "scores": scores,
    }


def ranked(result):
    return sorted(result["scores"].items(),
                  key=lambda kv: kv[1]["score"], reverse=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("windows", nargs="+")
    parser.add_argument("--refs", default=DEFAULT_REFS)
    parser.add_argument("--top", type=int, default=4)
    opts = parser.parse_args()

    refs = load_references(opts.refs)
    if not refs:
        sys.exit("no reference samples in %s -- run tools/dump/extract-samples.sh"
                 % opts.refs)

    for target in opts.windows:
        result = analyse(target, refs)
        if result["state"] != "OBSERVED":
            print("%s  UNKNOWN (%s)" % (result["file"], result["reason"]))
            continue
        top = ranked(result)[:opts.top]
        head = "%s  %.3fs rms=%.4f" % (
            result["file"], result["seconds"], result["rms"])
        margin = (top[0][1]["score"] - top[1][1]["score"]) if len(top) > 1 else 0.0
        print("%s  margin=%.3f" % (head, margin))
        for handle, item in top:
            print("    sample %-3d score %6.3f  onset %6.3fs"
                  % (handle, item["score"], item["onset_s"]))


if __name__ == "__main__":
    main()
