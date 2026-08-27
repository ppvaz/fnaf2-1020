#!/usr/bin/env python3
import importlib.util
import json
import pathlib
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("evaluate_shadow", HERE / "evaluate-shadow.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def row(session, split, index, truth, predicted, state="HIT"):
    open_ns = index * 10_000_000_000
    return {
        "schema": "cue-shadow-window-v1",
        "session_id": session,
        "split": split,
        "window_id": "w%d" % index,
        "open_ns": open_ns,
        "close_ns": open_ns + 5_000_000_000,
        "truth": truth,
        "observation": {"state": state,
                        "events": [{"cue": cue, "template": "17" if cue == "bang" else "21",
                                    "cue_ns": open_ns + 1_000_000_000,
                                    "score": .8, "margin": .2}
                                   for cue in predicted]},
        "label_provenance": {"source": "manual-video", "independent": True},
        "model_sha256": "a" * 64,
        "audio_sha256": ("b" if session.startswith("cal") else "c") * 64,
    }


with tempfile.TemporaryDirectory() as directory:
    path = pathlib.Path(directory) / "windows.jsonl"
    rows = []
    # Calibration is present but never contributes to held-out metrics.
    rows.append(row("cal-1", "calibration", 0, ["bb_voice"], ["bb_voice"]))
    # 60 positives and 60 negatives per class make rule-of-three <= 5%.
    for i in range(60):
        rows.append(row("hold-1", "holdout", i, ["bb_voice", "bang"],
                        ["bb_voice", "bang"]))
    for i in range(60, 120):
        rows.append(row("hold-1", "holdout", i, [], [] , state="MISS"))
    path.write_text("".join(json.dumps(item) + "\n" for item in rows))
    loaded = module.load(path)
    report = module.evaluate(loaded, ["bb_voice", "bang"],
                             {"bb_voice": .05, "bang": .05},
                             {"bb_voice": .05, "bang": .05}, path)
    assert report["verdict"] == "pass"
    assert report["split"]["overlap"] == []
    assert report["cues"]["bb_voice"]["tp"] == 60
    assert report["cues"]["bang"]["tn"] == 60

    broken = list(loaded)
    broken[-1] = dict(broken[-1])
    broken[-1]["observation"] = {"state": "HIT", "events": [{"cue": "bang"}]}
    failed = module.evaluate(broken, ["bb_voice", "bang"],
                             {"bb_voice": .05, "bang": .05},
                             {"bb_voice": .05, "bang": .05}, path)
    assert failed["verdict"] == "fail"
    assert failed["cues"]["bang"]["fp"] == 1

    overlap = list(loaded)
    overlap[-1] = dict(overlap[-1], session_id="cal-1")
    try:
        module.evaluate(overlap, ["bb_voice", "bang"],
                        {"bb_voice": .05, "bang": .05},
                        {"bb_voice": .05, "bang": .05}, path)
        raise AssertionError("session overlap was accepted")
    except ValueError as error:
        assert "calibration and holdout" in str(error)

    untimed = json.loads(json.dumps(rows[1]))
    del untimed["observation"]["events"][0]["cue_ns"]
    bad_path = pathlib.Path(directory) / "untimed.jsonl"
    bad_path.write_text(json.dumps(untimed) + "\n")
    try:
        module.load(bad_path)
        raise AssertionError("an untimestamped detector event was accepted")
    except ValueError as error:
        assert "timestamped window" in str(error)

print("shadow evaluator: whole-session split and error-bound gates pass")
