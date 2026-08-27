#!/usr/bin/env python3
import base64
import hashlib
import json
import pathlib
import struct
import subprocess
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
EXPORT = HERE / "export-model.py"

with tempfile.TemporaryDirectory() as directory:
    root = pathlib.Path(directory)
    pcm = base64.b64encode(struct.pack("<128h", *range(128))).decode("ascii")
    shadow = root / "shadow.txt"
    shadow.write_text(
        "cue-model-v1 calibration=synthetic evidence=shadow rate=4000 margin=0.050000\n"
        "template cue=bb_voice id=21 threshold=0.750000 pcm=%s\n" % pcm,
        encoding="ascii")
    report = root / "report.json"
    report.write_text(json.dumps({
        "schema": "cue-holdout-v1",
        "verdict": "pass",
        "model_sha256": hashlib.sha256(shadow.read_bytes()).hexdigest(),
        "split": {"unit": "whole-session", "calibration_sessions": ["c1"],
                  "holdout_sessions": ["h1"], "overlap": []},
        "cues": {"bb_voice": {"pass": True}},
    }), encoding="utf-8")
    promoted = root / "heldout.txt"
    result = subprocess.run([
        "python3", str(EXPORT), "--evidence", "heldout",
        "--shadow-model", str(shadow), "--holdout-report", str(report),
        "--output", str(promoted),
    ], text=True, capture_output=True)
    assert result.returncode == 0, result.stdout + result.stderr
    lines = promoted.read_text(encoding="ascii").splitlines()
    report_hash = hashlib.sha256(report.read_bytes()).hexdigest()
    assert " evidence=heldout " in lines[0]
    assert " reportSha256=" + report_hash in lines[0]
    assert lines[1:] == shadow.read_text(encoding="ascii").splitlines()[1:]

    bad_report = root / "bad-report.json"
    bad = json.loads(report.read_text())
    bad["model_sha256"] = "0" * 64
    bad_report.write_text(json.dumps(bad))
    rejected = subprocess.run([
        "python3", str(EXPORT), "--evidence", "heldout",
        "--shadow-model", str(shadow), "--holdout-report", str(bad_report),
        "--output", str(root / "bad.txt"),
    ], text=True, capture_output=True)
    assert rejected.returncode != 0
    assert "does not evaluate the supplied shadow model" in rejected.stderr

print("cue model promotion: exact shadow bytes and holdout report are bound")
