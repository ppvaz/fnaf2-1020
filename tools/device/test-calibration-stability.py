#!/usr/bin/env python3
"""No-device contract tests for calibration-stability.py."""

import json
import hashlib
import pathlib
import subprocess
import sys
import tempfile


HERE = pathlib.Path(__file__).resolve().parent
TOOL = HERE / "calibration-stability.py"


def grade(path, trials):
    path.write_text(json.dumps({
        "schema": "maskraise-grade-v2", "calibration_eligible": True,
        "sync": {"status": "VERIFIED", "uncertainty_ms": 1},
        "provenance": {"capture_sha256": hashlib.sha256(path.name.encode()).hexdigest(),
                       "stream_sha256": "a" * 64, "profile_sha256": "b" * 64,
                       "grader_sha256": "c" * 64},
        "mode": "compound",
        "fps": 60,
        "frames": 2400,
        "terminal_frame": None,
        "trials": trials,
    }) + "\n", encoding="utf-8")


def trial(index, gap, landed, valid=True):
    return {"index": index, "gap_ms": gap, "landed": landed, "valid": valid,
            "controls": {"monitor": landed, "hall": landed}, "precondition": "VERIFIED",
            "note": None}


def run(args):
    return subprocess.run([sys.executable, str(TOOL), *map(str, args)],
                          capture_output=True, text=True)


def main():
    with tempfile.TemporaryDirectory() as temporary:
        root = pathlib.Path(temporary)
        paths = [root / f"run-{i}.grade.json" for i in range(3)]
        for i, path in enumerate(paths):
            # 180 ms contains one failure, while 233 ms is perfect over six
            # independent samples. The recommendation must be 233, not the
            # first gap that happened to land in one recording.
            grade(path, [
                trial(0, 180, not (i == 1)), trial(1, 180, True),
                trial(2, 233, True), trial(3, 233, True),
            ])
        report_path = root / "stability.json"
        result = run(["--mode", "compound", "--min-runs", "3",
                      "--min-samples", "6", "--min-lcb", "0",
                      "--json-out", report_path, *paths])
        assert result.returncode == 0, result.stderr + result.stdout
        report = json.loads(result.stdout)
        assert report["recommendation"]["gap_ms"] == 233
        by_gap = {entry["gap_ms"]: entry for entry in report["by_gap"]}
        assert by_gap[180]["status"] == "FAIL"
        assert by_gap[180]["failures"] == 1
        assert by_gap[233]["status"] == "PASS"
        assert json.loads(report_path.read_text())["status"] == "PASS"

        # An invalid trial is not silently dropped. It poisons that gap and
        # leaves the campaign without a recommendation when it is the only
        # otherwise-qualified candidate.
        bad = root / "run-bad.grade.json"
        grade(bad, [trial(0, 233, None, valid=False), trial(1, 233, True)])
        result = run(["--mode", "compound", "--min-runs", "3",
                      "--min-samples", "6", "--min-lcb", "0",
                      *(paths[:2] + [bad])])
        assert result.returncode == 1, result.stdout
        refused = json.loads(result.stdout)
        assert refused["recommendation"] is None
        entry = next(item for item in refused["by_gap"] if item["gap_ms"] == 233)
        assert entry["status"] == "FAIL" and entry["invalid_samples"] == 1

        # Mixed capture modes are an input error, not a weaker pooled result.
        monitor = root / "monitor.grade.json"
        payload = json.loads(paths[0].read_text())
        payload["mode"] = "monitor"
        monitor.write_text(json.dumps(payload), encoding="utf-8")
        result = run(["--min-lcb", "0", paths[0], monitor])
        assert result.returncode == 2 and "different modes" in result.stderr

        def modified(name, edit):
            changed = root / name
            payload = json.loads(paths[0].read_text())
            edit(payload)
            changed.write_text(json.dumps(payload), encoding="utf-8")
            return changed

        copy = modified("copied.json", lambda p: None)
        result = run([paths[0], copy])
        assert result.returncode == 2 and "duplicate capture" in result.stderr
        unknown_clock = modified("clock.json", lambda p: p.update(sync={"status": "UNKNOWN"}))
        result = run(["--min-runs", "1", "--min-samples", "1", "--min-lcb", "0", unknown_clock])
        assert result.returncode == 1 and "clock-mapping-unverified" in result.stdout
        wide_clock = modified("wide-clock.json", lambda p: p["sync"].update(uncertainty_ms=50))
        assert run(["--min-runs", "1", "--min-samples", "1", "--min-lcb", "0", wide_clock]).returncode == 1
        contradictory = modified("contradictory.json", lambda p: p["trials"][0].update(landed=False))
        result = run([contradictory])
        assert result.returncode == 2 and "contradictory" in result.stderr
        legacy = modified("legacy.json", lambda p: p.update(schema="maskraise-grade-v1"))
        assert run(["--min-runs", "1", "--min-samples", "1", "--min-lcb", "0", legacy]).returncode == 1
        hidden = modified("hidden.json", lambda p: [t["controls"].update(hall=None) for t in p["trials"]])
        assert run(["--min-runs", "1", "--min-samples", "1", "--min-lcb", "0", hidden]).returncode == 1
        other_contact = modified("contact.json", lambda p: p["provenance"].update(
            capture_sha256="d" * 64, stream_sha256="e" * 64))
        result = run([paths[0], other_contact])
        assert result.returncode == 2 and "bindings" in result.stderr
        repeated = root / "many-trials.json"
        grade(repeated, [trial(i, 233, True) for i in range(100)])
        result = run(["--min-runs", "1", "--min-samples", "1", repeated])
        assert result.returncode == 1, '100 correlated trials must not buy 100 independent samples'
        assert json.loads(result.stdout)["by_gap"][0]["wilson_lower_95"] < 0.3

    print("calibration stability: independent-run pooling, refusals, and JSON report pass")


if __name__ == "__main__":
    main()
