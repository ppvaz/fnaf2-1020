#!/usr/bin/env python3
"""Heuristic video evidence must not masquerade as a calibrated clock."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("grade", HERE / "maskraise-grade.py")
grade = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(grade)


class GradeTest(unittest.TestCase):
    def test_old_monitor_close_is_not_new_mask_on(self):
        for value in (None, -198, -132, 901):
            self.assertFalse(grade.mask_on_plausible(value))
        for value in (-1000 / 60, 0, 52, 200):
            self.assertTrue(grade.mask_on_plausible(value))

    def test_even_perfect_visual_alignment_remains_exploratory(self):
        center = [20.] * 360
        for start in (60, 180):
            center[start:start + 48] = [6.] * 48
            center[start + 66:start + 71] = [30.] * 5
        trials = [{"gap": 300, "mask_on_ms": at, "mask_off_ms": at + 800,
                   "probe_ms": at + 1100} for at in (1000, 3000)]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            video, stream, out = root / 'fixture.mp4', root / 'fixture.hid', root / 'grade.json'
            video.write_bytes(b'fixture-not-device-video')
            stream.write_text('fixture-not-device-input')
            with patch.object(grade, 'parse_stream', return_value={"mode": "hall", "anchor_ms": 0, "trials": trials}), \
                 patch.object(grade, 'decode', return_value=(center, [20.] * 360, [20.] * 360, [0.] * 360, [0] * 360, 360)), \
                 patch.object(sys, 'argv', ['grade', str(video), str(stream), '--json-out', str(out)]):
                grade.main()
            payload = json.loads(out.read_text())
            self.assertEqual(payload['status'], 'EXPLORATORY')
            self.assertFalse(payload['calibration_eligible'])
            self.assertEqual(payload['sync']['status'], 'UNKNOWN')
            self.assertIsNone(payload['sync']['drift_ms'])
            self.assertIsNone(payload['terminal_frame'])
            self.assertEqual(len(payload['provenance']['capture_sha256']), 64)
            self.assertTrue(payload['evidenceId'].startswith('maskraise-'))


if __name__ == '__main__':
    unittest.main()
