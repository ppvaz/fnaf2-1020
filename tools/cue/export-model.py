#!/usr/bin/env python3
"""Export app-private cue-model-v1 data from uncommitted reference WAVs.

The APK deliberately ships with no game audio and no threshold. This command
turns the most energetic 0.40 s of each supplied reference into a 4 kHz PCM
correlation core that the on-device matcher can consume. The output is still a
derived cue template: keep it in ignored ``captures/cue-helper/models/`` or
outside the repository.

Example::

  export-model.py --refs /private/tmp/fnaf2-cue-refs \
    --cue bang=17 --cue footstep=25,26,27,28,29 \
    --threshold bang=.25 --threshold footstep=.25 --margin=.05 \
    --calibration moto-g56-v207-provisional --output captures/cue-helper/models/cues.txt

``evidence=shadow`` is the default and cannot arm a control-mode window. The
heldout label requires a report path so promotion always names its evidence;
the helper still cannot judge whether that report's experiment was sound.
"""
import argparse
import base64
import hashlib
import json
import re
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import correlate  # noqa: E402
import features  # noqa: E402

MODEL_RATE = 4_000
SAFE = re.compile(r"[A-Za-z0-9._-]{1,64}\Z")


def parse_mapping(values, cast=str):
    out = {}
    for value in values:
        name, sep, raw = value.partition("=")
        if not sep or not SAFE.fullmatch(name):
            raise ValueError(f"invalid mapping: {value}")
        out[name] = cast(raw)
    return out


def resample_core(path):
    source = features.load_window(path)
    core, _ = correlate.core_window(source)
    reduced = features.resample(core, features.RATE, MODEL_RATE)
    pcm = []
    for value in reduced:
        pcm.append(max(-32768, min(32767, round(value * 32767.0))))
    if len(pcm) < 128 or len(pcm) > MODEL_RATE:
        raise ValueError(f"{path}: correlation core has {len(pcm)} samples")
    if not any(pcm):
        raise ValueError(f"{path}: correlation core is silent")
    return struct.pack("<%dh" % len(pcm), *pcm)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refs")
    parser.add_argument("--cue", action="append",
                        help="CUE=HANDLE[,HANDLE...] (repeatable)")
    parser.add_argument("--threshold", action="append",
                        help="CUE=SCORE; no threshold is guessed")
    parser.add_argument("--margin", type=float)
    parser.add_argument("--calibration")
    parser.add_argument("--evidence", choices=("shadow", "heldout"),
                        default="shadow")
    parser.add_argument("--holdout-report")
    parser.add_argument("--shadow-model",
                        help="exact evidence=shadow model evaluated by the report")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    report_hash = None
    promoted_lines = None
    if args.evidence == "heldout":
        if not args.holdout_report or not args.shadow_model:
            parser.error("heldout evidence requires --holdout-report and --shadow-model")
        if any(value is not None for value in
               (args.refs, args.cue, args.threshold, args.margin, args.calibration)):
            parser.error("heldout promotion copies the exact shadow model; do not supply "
                         "refs, cues, thresholds, margin, or calibration")
        report = Path(args.holdout_report)
        if not report.is_file():
            parser.error("holdout report does not exist")
        shadow = Path(args.shadow_model)
        if not shadow.is_file():
            parser.error("shadow model does not exist")
        try:
            evidence = json.loads(report.read_text())
        except (OSError, json.JSONDecodeError) as error:
            parser.error("invalid holdout report: %s" % error)
        if evidence.get("schema") != "cue-holdout-v1" or evidence.get("verdict") != "pass":
            parser.error("holdout report is not a passing cue-holdout-v1 report")
        shadow_bytes = shadow.read_bytes()
        if evidence.get("model_sha256") != hashlib.sha256(shadow_bytes).hexdigest():
            parser.error("holdout report does not evaluate the supplied shadow model")
        try:
            promoted_lines = shadow_bytes.decode("ascii").splitlines()
        except UnicodeDecodeError:
            parser.error("shadow model is not ASCII")
        if not promoted_lines or " evidence=shadow " not in promoted_lines[0]:
            parser.error("--shadow-model is not an evidence=shadow cue-model-v1")
        if not promoted_lines[0].startswith("cue-model-v1 ") or \
                " reportSha256=" in promoted_lines[0]:
            parser.error("shadow model header is invalid")
        report_hash = hashlib.sha256(report.read_bytes()).hexdigest()
        promoted_lines[0] = promoted_lines[0].replace(
            " evidence=shadow ", " evidence=heldout ", 1) + \
            " reportSha256=" + report_hash
    elif args.holdout_report:
        parser.error("--holdout-report is only meaningful with evidence=heldout")
    elif args.shadow_model:
        parser.error("--shadow-model is only meaningful with evidence=heldout")
    else:
        if not all(value is not None for value in
                   (args.refs, args.cue, args.threshold, args.margin, args.calibration)):
            parser.error("shadow export requires refs, cues, thresholds, margin, and calibration")
        if not SAFE.fullmatch(args.calibration):
            parser.error("--calibration must use letters, numbers, dot, dash, or underscore")
        if not 0.0 <= args.margin <= 1.0:
            parser.error("--margin must be in 0..1")
        try:
            cues = parse_mapping(args.cue,
                                 lambda text: [int(v) for v in text.split(",")])
            thresholds = parse_mapping(args.threshold, float)
        except ValueError as error:
            parser.error(str(error))
        if set(cues) != set(thresholds):
            parser.error("every --cue needs exactly one matching --threshold")
        if any(not 0.0 <= value <= 1.0 for value in thresholds.values()):
            parser.error("thresholds must be in 0..1")

    root = Path(__file__).resolve().parents[2]
    output = Path(args.output).resolve()
    try:
        relative = output.relative_to(root)
    except ValueError:
        relative = None
    if relative is not None and relative.parts[:3] != ("captures", "cue-helper", "models"):
        parser.error("models inside the repository must live under ignored "
                     "captures/cue-helper/models/")
    if output.exists():
        parser.error(f"refusing to overwrite {output}")

    if promoted_lines is not None:
        lines = promoted_lines
        count = sum(line.startswith("template ") for line in lines)
    else:
        refs = Path(args.refs)
        lines = [
            "cue-model-v1 calibration=%s evidence=%s rate=%d margin=%.6f" % (
                args.calibration, args.evidence, MODEL_RATE, args.margin)
        ]
        count = 0
        for cue, handles in cues.items():
            for handle in handles:
                path = refs / f"s{handle:04d}.wav"
                if not path.is_file():
                    parser.error(f"missing reference {path}")
                pcm = resample_core(path)
                encoded = base64.b64encode(pcm).decode("ascii")
                lines.append("template cue=%s id=%d threshold=%.6f pcm=%s" % (
                    cue, handle, thresholds[cue], encoded))
                count += 1
        if count > 16:
            parser.error("the helper accepts at most 16 templates")

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines) + "\n", encoding="ascii")
    print(f"wrote {output} ({count} templates, evidence={args.evidence})")
    if args.evidence == "shadow":
        print("SHADOW ONLY: the helper will refuse this model for control windows")


if __name__ == "__main__":
    main()
