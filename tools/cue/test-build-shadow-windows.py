#!/usr/bin/env python3
import hashlib
import importlib.util
import json
import pathlib
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("build_shadow", HERE / "build-shadow-windows.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

with tempfile.TemporaryDirectory() as directory:
    root = pathlib.Path(directory)
    audio = root / "night.wav"
    audio.write_bytes(b"RIFF source audio")
    sidecar = root / "night.wav.meta.json"
    sidecar.write_text(json.dumps({
        "schema": "cue-audio-anchor-v1", "clock_domain": "helper_monotonic_ns",
        "wav": audio.name,
        "audio_sha256": hashlib.sha256(audio.read_bytes()).hexdigest(),
        "start_ns": 1_000, "frames": 160_000, "rate": 16_000,
    }))
    trace = root / "trace.txt"
    trace.write_text(
        "cue-shadow-trace-v1 session=night-01 modelSha256=" + "a" * 64 +
        " evidence=shadow\n"
        "ARM OK armed=w0 cues=all mode=shadow openNs=1000 closeNs=5000001000 calibration=c1\n"
        "RESULT HIT window=w0 count=2 events=bb_voice:21:2000:0.8000:0.2000,bang:17:3000:0.9000:0.3000 closeNs=5000001000 mode=shadow\n"
        "ARM OK armed=w1 cues=all mode=shadow openNs=5000002000 closeNs=10000002000 calibration=c1\n"
        "RESULT MISS window=w1 closeNs=10000002000 bestCue=none template=none score=0.1 mode=shadow\n")
    label = root / "labels.jsonl"
    label.write_text(
        json.dumps({"window_id": "w0", "truth": ["bb_voice", "bang"],
                    "label_provenance": {"source": "manual-video", "independent": True}}) + "\n" +
        json.dumps({"window_id": "w1", "truth": [],
                    "label_provenance": {"source": "manual-video", "independent": True}}) + "\n")
    rows = module.build(trace, label, sidecar, "holdout")
    assert len(rows) == 2
    assert rows[0]["observation"]["events"][0]["cue_ns"] == 2000
    assert rows[0]["truth"] == ["bb_voice", "bang"]
    assert rows[1]["observation"] == {"state": "MISS", "events": []}
    assert rows[0]["audio_sha256"] == hashlib.sha256(audio.read_bytes()).hexdigest()

    missing = root / "missing-label.jsonl"
    missing.write_text(label.read_text().splitlines()[0] + "\n")
    try:
        module.build(trace, missing, sidecar, "holdout")
        raise AssertionError("an unlabelled detector result was accepted")
    except ValueError as error:
        assert "must match exactly" in str(error)

print("shadow window builder: timestamps, model/audio binding, and independent labels pass")
