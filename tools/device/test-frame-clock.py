#!/usr/bin/env python3
"""A resampled cadence must not be able to masquerade as the panel's own.

The fixture is a deliberately VARIABLE-rate clip. Its expected timestamps are
NOT hardcoded from this file's reading of ffmpeg's `setpts` semantics -- that
would test my arithmetic, not the tool. They come from an independent path:
the container's own packet timestamps, read by ffprobe. `frame_times` decodes
and reports in filter-output order; ffprobe reports what the muxer stored. Two
unrelated reporting paths agreeing frame-for-frame is evidence; a tool agreeing
with its own resampling is the bug this whole module exists to prevent.
"""
import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("frame_clock", HERE / "frame-clock.py")
clock = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(clock)

FRAMES = 24
# 1/120 s timebase so the uneven ticks are exactly representable; mp4's default
# 1/12800 would round them and the comparison would be against noise.
# `-preset ultrafast` also disables B-frames, which is what lets packet order
# stand in for presentation order below.
FIXTURE = ["-fps_mode", "passthrough", "-video_track_timescale", "120",
           "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"]


def build(path, uneven):
    source = f"testsrc2=size=64x48:rate=60:duration={FRAMES / 60}"
    # The comma inside mod() is escaped: unescaped it ends the filter.
    vf = ["-vf", r"settb=1/120,setpts=(N*2+mod(N\,2))"] if uneven else []
    subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", "-y",
                    "-f", "lavfi", "-i", source] + vf + FIXTURE + [str(path)],
                   check=True)


def build_with_info_page(path):
    """Frame 0 far ahead of an evenly spaced body: the --bugreport signature."""
    source = f"testsrc2=size=64x48:rate=60:duration={FRAMES / 60}"
    subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", "-y",
                    "-f", "lavfi", "-i", source,
                    "-vf", r"settb=1/120,setpts=if(eq(N\,0)\,0\,N*2+40)"]
                   + FIXTURE + [str(path)], check=True)


def packet_times(path):
    """Ground truth from the container, independent of the decode path."""
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "packet=pts_time", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True)
    return sorted(float(line.rstrip(",")) for line in probe.stdout.split() if line.strip())


class FilterGuardTest(unittest.TestCase):
    def test_timing_refuses_every_cadence_rewriting_filter(self):
        for bad in ("fps=60", "scale=160:72,fps=30", "minterpolate=fps=120",
                    "framerate=60", "setpts=PTS/2"):
            with self.assertRaises(clock.ClockError):
                clock.check_filters(bad)

    def test_cropping_and_scaling_are_allowed_because_they_do_not_touch_time(self):
        for good in ("crop=160:24:0:0", "scale=160:72", "crop=64:8:0:0,scale=32:4", None):
            self.assertEqual(clock.check_filters(good), good)

    def test_classification_may_resample_because_it_never_counts(self):
        self.assertEqual(clock.check_filters("fps=60", purpose="classification"), "fps=60")


class FrameTimeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.vfr = Path(cls.tmp.name) / "vfr.mp4"
        cls.cfr = Path(cls.tmp.name) / "cfr.mp4"
        build(cls.vfr, uneven=True)
        build(cls.cfr, uneven=False)
        cls.truth = packet_times(cls.vfr)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_the_fixture_really_is_variable_rate(self):
        """Guard the guard: a CFR fixture would make every test below vacuous."""
        gaps = {round((self.truth[i + 1] - self.truth[i]) * 1000, 3)
                for i in range(len(self.truth) - 1)}
        self.assertGreater(len(gaps), 1, f"fixture is not variable-rate: {gaps}")

    def test_presentation_times_match_the_container_frame_for_frame(self):
        times = clock.frame_times(str(self.vfr))
        self.assertEqual([n for n, _ in times], list(range(len(self.truth))))
        for (_, got), want in zip(times, self.truth):
            self.assertAlmostEqual(got, want, places=6)

    def test_a_resampled_read_reports_a_cadence_the_capture_does_not_have(self):
        """The bug, demonstrated on a fixture whose real cadence is known."""
        resampled = clock.frame_times(str(self.vfr), vf="fps=60", purpose="classification")
        gaps = clock.intervals_ms(resampled)
        self.assertTrue(all(abs(gap - 1000 / 60) < 0.01 for gap in gaps),
                        "fps=60 should have flattened the cadence into a grid")
        self.assertNotEqual(len(resampled), len(self.truth),
                            "and it should not even preserve the frame count")

    def test_uniform_captures_are_flagged_rather_than_trusted(self):
        self.assertTrue(clock.cadence(str(self.cfr))["uniform"])
        self.assertFalse(clock.cadence(str(self.vfr))["uniform"])

    def test_quantisation_is_the_worst_interval_not_the_nominal_rate(self):
        report = clock.cadence(str(self.vfr))
        worst = max((self.truth[i + 1] - self.truth[i]) * 1000
                    for i in range(len(self.truth) - 1))
        self.assertAlmostEqual(report["quantisationMs"], worst, places=3)
        self.assertGreater(report["quantisationMs"], 1000 / 60,
                           "a nominal-rate quantisation would understate this capture")

    def test_cropped_pixels_stay_aligned_with_their_timestamps(self):
        got = list(clock.decode_region(str(self.vfr), crop="16:8:0:0"))
        self.assertEqual(len(got), len(self.truth))
        for (_, pts, width, height, raw), want in zip(got, self.truth):
            self.assertAlmostEqual(pts, want, places=6)
            self.assertEqual((width, height), (16, 8))
            self.assertEqual(len(raw), 16 * 8 * 3)


if __name__ == "__main__":
    result = unittest.main(exit=False, verbosity=0).result
    if not result.wasSuccessful():
        sys.exit(1)
    print(f"frame clock: {result.testsRun} checks -- presentation times match the container "
          "frame-for-frame on a variable-rate fixture, cadence-rewriting filters are refused "
          "for timing, and a resampled read is shown reporting a cadence the capture does not have")
