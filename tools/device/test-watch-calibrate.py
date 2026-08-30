#!/usr/bin/env python3
"""Synthetic gate for the native PixelWatch calibration harness."""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
TOOL = HERE / "watch-calibrate.py"


def frame(path, rgb):
    image = Image.new("RGB", (2400, 1080), (24, 24, 24))
    image.putpixel((451, 730), rgb)
    image.save(path)


def run(output, *sources, extra=()):
    return subprocess.run(
        [sys.executable, str(TOOL), "--output", str(output),
         "--fact", "bb-left-opening", *extra, *sources],
        capture_output=True, text=True, check=False,
    )


def main():
    failures = 0

    def check(name, condition, detail=""):
        nonlocal failures
        if not condition:
            print(f"FAIL {name}{' -- ' + detail if detail else ''}")
            failures += 1

    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        empty = root / "empty"
        threat = root / "threat"
        empty.mkdir()
        threat.mkdir()
        frame(empty / "a.png", (144, 209, 255))
        frame(empty / "b.png", (144, 209, 255))
        frame(threat / "a.png", (0, 0, 0))
        frame(threat / "b.png", (0, 0, 0))
        output = root / "watchlist.json"
        result = run(output, f"empty={empty}", f"threat={threat}")
        check("well-separated frames calibrate", result.returncode == 0, result.stderr)
        document = json.loads(output.read_text())
        check("calibration emits the calibrated status", document["status"] == "calibrated")
        check("the sourced BB anchor wins", document["adapter"]["feature"] == "bb_left_luma")
        check("the threshold has a positive margin",
              document["adapter"]["separation_margin"] > 90)
        check("native sensor identity is explicit",
              document["sensor"]["id"] == "cue-helper-native-2400x1080")
        check("service watch spec hash is present",
              len(document["watch_spec"]["sha256"]) == 64)
        check("unknown reasons are explicit",
              "sensor-mismatch" in document["fact"]["unknown_reasons"])

        low = root / "low"
        low_threat = root / "low-threat"
        low.mkdir()
        low_threat.mkdir()
        frame(low / "a.png", (100, 100, 100))
        frame(low_threat / "a.png", (101, 101, 101))
        weak_output = root / "weak.json"
        weak = run(weak_output, f"empty={low}", f"threat={low_threat}")
        weak_doc = json.loads(weak_output.read_text())
        check("weak separation emits refusal", weak.returncode == 0)
        check("refusal names its reason",
              weak_doc["status"] == "refuse"
              and weak_doc["reason"] == "separation-margin-below-floor")
        strict = run(root / "strict.json", f"empty={low}", f"threat={low_threat}",
                     extra=("--strict",))
        check("strict mode rejects a refused calibration", strict.returncode != 0)

        foreign = root / "foreign.png"
        Image.new("RGB", (1280, 576), (1, 1, 1)).save(foreign)
        bad = run(root / "bad.json", f"empty={foreign}", f"threat={foreign}")
        check("foreign geometry refuses without resizing",
              bad.returncode != 0 and "sensor-geometry" in bad.stderr)

    if failures:
        print(f"{failures} watch calibration check(s) failed")
        return 1
    print("watch calibration: native features calibrate, weak margins refuse, foreign geometry refuses")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
