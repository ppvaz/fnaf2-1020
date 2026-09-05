#!/usr/bin/env python3
"""No phone: slow reads cannot create an epoch, office-ready fact, or input."""
import importlib.util
import os
import pathlib
import subprocess
import unittest
from unittest.mock import patch

HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("watch", HERE / "monitorraise-watch.py")
watch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(watch)


class WatchTest(unittest.TestCase):
    def test_slow_map_read_is_not_clock_or_state_confirmation(self):
        times = iter([10, 10.7])
        row = watch.observe_map(1, lambda: "clear", now=lambda: next(times))
        self.assertAlmostEqual(row["readLatencyMs"], 700)
        self.assertEqual(row["state"], "MAP_ABSENT")
        for field in ("captureTime", "frameSequence", "streamEpoch"):
            self.assertIsNone(row[field])
        self.assertEqual(row["officeReady"], "UNKNOWN")
        self.assertEqual(row["actuation"], "NONE")

    def test_legacy_invocation_refuses_without_device_access(self):
        with patch.object(watch.subprocess, "run", side_effect=AssertionError("device accessed")):
            self.assertEqual(watch.main(["nonexistent.schedule.json"]), 2)

    def test_capture_error_is_unknown(self):
        def fail():
            raise subprocess.TimeoutExpired("fixture", 1)
        self.assertEqual(watch.observe_map(2, fail)["state"], "UNKNOWN")

    def test_wrapper_refuses_before_adb_or_cleanup(self):
        result = subprocess.run(["/bin/bash", str(HERE / "hid-sweep-probe.sh"), "267"],
                                env={**os.environ, "PROBE_GEN": "monitorraise", "PATH": "/nonexistent"},
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn("service-controlled", result.stderr)
        self.assertNotIn("not found", result.stderr)


if __name__ == "__main__":
    unittest.main()
