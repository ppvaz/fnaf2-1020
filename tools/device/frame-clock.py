#!/usr/bin/env python3
"""Place a capture's frames on a clock, without inventing one.

This is the clock layer under every video measurement. It answers only two
questions -- when did each frame arrive, and how far apart are they -- and it
refuses the two ways this repo has previously got that wrong.

WHY IT EXISTS

`maskraise-grade.py:126` decodes with `-vf fps=60`. On this target that is not
a decode, it is a RESAMPLE. `dumpsys display` on the Moto g56 reports

    supportedRefreshRates=[120, 90, 60, 45, 30]
    mDisplayModeSpecs={... primary=physical: (30.0 120.0) render: (30.0 60.0)}

-- a variable-refresh panel free to run 30-120 Hz under a 60 Hz render cap. The
retained captures show exactly that: measured over
`captures/n5-drift-sidecar-smoke-20260909-video.mp4`, the inter-frame intervals
run 13.17-20.39 ms with a 16.36 ms median, and the eight retained videos report
`avg_frame_rate` from 53.5 to 59.9. Asking ffmpeg for `fps=60` duplicates and
drops frames until that cadence looks like a 60 Hz grid. A frame count taken
from the result counts GRID SLOTS, not panel frames, and inherits up to one
slot of quantisation at each edge.

So: resampling is legal for CLASSIFICATION (is this frame office or camera) and
illegal for TIMING. `check_filters` enforces that at the call site rather than
leaving it to reviewer memory.

The second failure is subtler and cost the 2026-09-05 clock audit
(`docs/evidence/calibration-clock-audit-20260905.json`, status REFUSED, 0 of 12
valid samples). Its sync anchor pooled mask-interval starts against their own
presses -- which ASSUMES the input-to-first-visible-change latency is zero,
when that latency is the quantity being measured. Its residual range across two
anchors was 183 ms, eleven frames, against a stated 1.0 ms requirement. This
module therefore reports presentation timestamps and nothing else: a PTS is
time since recording started, it is NOT the device clock, and nothing here
pretends otherwise. Tying a capture to the device clock needs the
`screenrecord --bugreport` timestamp overlay, which is read by a separate
decoder built against a real frame -- never against a description of one.

Usage: frame-clock.py VIDEO [--json]
"""
import argparse
import json
import re
import statistics
import subprocess
import sys

# showinfo is the only per-frame report guaranteed to be in filter OUTPUT
# order and 1:1 with what a rawvideo pipe emits. `ffprobe -show_frames`
# reports DECODE order, which diverges from presentation order the moment the
# encoder emits B-frames -- and nothing in this repo pins screenrecord's
# encoder settings, so that is not an assumption available to us.
SHOWINFO = re.compile(r"\bn:\s*(?P<n>\d+)\s+pts:\s*\S+\s+pts_time:\s*(?P<t>-?[\d.]+)")

# Filters that rewrite WHICH frames exist or WHEN they claim to be. Any of
# these in a timing decode makes the output a synthetic cadence.
TIMING_FORBIDDEN = ("fps=", "framerate=", "minterpolate", "setpts", "tmix")


class ClockError(RuntimeError):
    """A capture that cannot be placed on a clock is not a measurement."""


def check_filters(vf, purpose="timing"):
    """Refuse a filter chain that would fabricate the cadence being measured.

    `purpose='classification'` is the documented escape hatch: a grader that
    only asks what a frame SHOWS may resample freely, because it never counts.
    """
    if purpose == "classification":
        return vf
    for bad in TIMING_FORBIDDEN:
        if bad in (vf or ""):
            raise ClockError(
                f"filter chain {vf!r} contains {bad!r}, which rewrites the cadence. "
                "Frame counts taken from a resampled stream count grid slots, not "
                "panel frames. Use purpose='classification' only where nothing is counted.")
    return vf


def frame_times(path, vf=None, purpose="timing"):
    """Presentation timestamps in seconds, one per frame, in presentation order.

    Returns [(n, pts_time)]. `vf` may crop or scale -- neither touches time --
    but is checked against TIMING_FORBIDDEN first.
    """
    chain = "showinfo" if not vf else f"{check_filters(vf, purpose)},showinfo"
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "info",
         "-i", path, "-vf", chain, "-fps_mode", "passthrough", "-f", "null", "-"],
        capture_output=True, text=True, errors="replace")
    if proc.returncode:
        tail = proc.stderr.strip().splitlines()[-3:]
        raise ClockError(f"ffmpeg failed on {path} ({proc.returncode}): {' | '.join(tail)}")
    times = []
    for line in proc.stderr.splitlines():
        found = SHOWINFO.search(line)
        if found:
            times.append((int(found.group("n")), float(found.group("t"))))
    if not times:
        raise ClockError(f"{path}: showinfo reported no frames")
    # showinfo numbers frames from 0 in output order. A gap means the parse
    # dropped a line, and a silently short series is how a count becomes wrong
    # without becoming obviously wrong.
    expected = list(range(len(times)))
    if [n for n, _ in times] != expected:
        raise ClockError(f"{path}: showinfo frame numbers are not contiguous from 0")
    return times


def intervals_ms(times):
    """Inter-frame intervals in milliseconds."""
    return [(times[i + 1][1] - times[i][1]) * 1000.0 for i in range(len(times) - 1)]


def drop_info_page(times):
    """Discard the synthetic first frame `screenrecord --bugreport` prepends.

    A --bugreport capture opens with an INFO PAGE -- "Android screenrecord
    v1.4 / Started <date>" -- which is not a composited frame of the display.
    It sits an arbitrary distance before the first real frame, so including it
    poisons every summary statistic. Measured on the 2026-09-10 title capture
    it reported the game at 57.13 Hz when the game was in fact rendering a
    clean 60.10 Hz with zero dropped frames: the 328.89 ms info-page gap was
    the entire deficit, and nothing about the number looked wrong.

    This refuses rather than guesses. If frame 0 is not separated from the
    body by a gap far outside the body's own spread, this is not the capture
    the caller thinks it is, and a silent discard would delete a real frame.
    """
    if len(times) < 3:
        raise ClockError("a --bugreport capture needs an info page and at least "
                         "two content frames before it can be summarised")
    gaps = intervals_ms(times)
    body = gaps[1:]
    if gaps[0] <= 3 * statistics.median(body):
        raise ClockError(
            f"frame 0 leads by {gaps[0]:.2f} ms against a body median of "
            f"{statistics.median(body):.2f} ms, which is not the info-page signature. "
            "Either this capture was not made with --bugreport, or its first frame is "
            "real -- discarding it would delete an observation.")
    return [(n - 1, t) for n, t in times[1:]]


def cadence(path, vf=None, bugreport=False):
    """What this capture's own cadence is, before anyone counts anything on it.

    `bugreport=True` declares that the capture came from
    `screenrecord --bugreport`, whose leading info page is discarded and
    verified. The caller knows how the capture was made; this module will not
    infer it from the pixels.
    """
    times = frame_times(path, vf)
    if bugreport:
        times = drop_info_page(times)
    gaps = intervals_ms(times)
    if not gaps:
        raise ClockError(f"{path}: a single frame has no cadence")
    ordered = sorted(gaps)
    span = times[-1][1] - times[0][1]
    return {
        "frames": len(times),
        "spanSeconds": span,
        "meanRateHz": (len(times) - 1) / span if span > 0 else None,
        "intervalMs": {
            "min": ordered[0],
            "p50": statistics.median(ordered),
            "max": ordered[-1],
            "stdev": statistics.pstdev(gaps) if len(gaps) > 1 else 0.0,
        },
        # A capture whose intervals never vary is either genuinely CFR or has
        # already been resampled. This flag does not decide which; it marks a
        # capture whose provenance has to be established before it is counted.
        "uniform": (ordered[-1] - ordered[0]) < 0.05,
        # The floor on any single-edge timing claim from this capture: an event
        # can land anywhere inside the frame that first shows it.
        "quantisationMs": ordered[-1],
    }


def decode_region(path, crop=None, pix_fmt="rgb24"):
    """Frames as raw bytes at their true timestamps, cropped, never resampled.

    `crop` is an ffmpeg crop expression ("w:h:x:y"). Cropping is how a long
    capture stays inside memory without a scale that would destroy the overlay
    glyphs -- the band is small text and does not survive a downscale.
    Yields (n, pts_time, width, height, raw).
    """
    vf = f"crop={crop}" if crop else None
    times = frame_times(path, vf)
    chain = check_filters(vf) if vf else None
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", path],
        capture_output=True, text=True)
    if probe.returncode:
        raise ClockError(f"ffprobe failed on {path}")
    width, height = (int(v) for v in probe.stdout.strip().split(",")[:2])
    if crop:
        parts = crop.split(":")
        width, height = int(parts[0]), int(parts[1])
    args = ["ffmpeg", "-hide_banner", "-nostdin", "-v", "error", "-i", path]
    if chain:
        args += ["-vf", chain]
    # `-fps_mode passthrough` is load-bearing, and its absence is invisible.
    # A rawvideo output has no frame rate of its own, so ffmpeg falls back to
    # constant-rate conversion and DUPLICATES frames to fill this panel's
    # uneven gaps -- caught here by the 25-decoded-against-24-timestamps guard
    # below. That is a third resampling path, and unlike `fps=` it is nowhere
    # in the filter chain, so no amount of reading the filters would find it.
    args += ["-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", pix_fmt, "-"]
    decoded = subprocess.run(args, capture_output=True)
    if decoded.returncode:
        raise ClockError(f"ffmpeg raw decode failed on {path} ({decoded.returncode})")
    stride = width * height * (3 if pix_fmt == "rgb24" else 1)
    count = len(decoded.stdout) // stride
    if count != len(times):
        raise ClockError(
            f"{path}: {count} decoded frames against {len(times)} timestamps. "
            "The two passes must agree frame for frame or the timestamps belong "
            "to different frames than the pixels.")
    for i in range(count):
        yield times[i][0], times[i][1], width, height, decoded.stdout[i * stride:(i + 1) * stride]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("video")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--bugreport", action="store_true",
                        help="the capture came from `screenrecord --bugreport`; "
                             "discard and verify its leading info page")
    args = parser.parse_args(argv)
    report = cadence(args.video, bugreport=args.bugreport)
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
        return 0
    gaps = report["intervalMs"]
    print(f"{args.video}: {report['frames']} frames over {report['spanSeconds']:.3f} s "
          f"({report['meanRateHz']:.2f} Hz mean)")
    print(f"  interval ms: min {gaps['min']:.2f}  p50 {gaps['p50']:.2f}  "
          f"max {gaps['max']:.2f}  sd {gaps['stdev']:.2f}")
    print("  " + ("UNIFORM -- establish whether this is CFR or already resampled"
                  if report["uniform"] else "variable cadence, as this panel produces"))
    print(f"  a single-edge claim from this capture cannot beat "
          f"{report['quantisationMs']:.2f} ms")
    return 0


if __name__ == "__main__":
    sys.exit(main())
