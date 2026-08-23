#!/usr/bin/env python3
"""Host-side correctness checks for the streaming Android screen helper."""

import pathlib
import struct
import subprocess
import tempfile


HERE = pathlib.Path(__file__).resolve().parent


def rgba_frame(width, height, offset=0):
    pixels = bytearray()
    for y in range(height):
        for x in range(width):
            pixels.extend((x * 10 + offset, y * 20 + offset, (x + y) * 5 + offset, 255))
    return bytes(pixels)


def threat_frame(width, height, offset=0):
    pixels = bytearray()
    for y in range(height):
        for x in range(width):
            if 2 <= x < 6 and 1 <= y < 5:
                pixels.extend((210 + offset, 35 + offset, 25 + offset, 255))
            else:
                pixels.extend((15 + offset, 25 + offset, 35 + offset, 255))
    return bytes(pixels)


def run(binary, arguments, data, expected_status=0):
    result = subprocess.run(
        [binary, *arguments], input=data, capture_output=True, check=False
    )
    assert result.returncode == expected_status, (
        result.returncode,
        result.stdout.decode(),
        result.stderr.decode(),
    )
    return result.stdout.decode().strip()


def main():
    with tempfile.TemporaryDirectory(prefix="fnaf-screencheck-test-") as temp:
        binary = pathlib.Path(temp) / "screencheck"
        subprocess.run(
            ["cc", "-std=c99", "-O2", str(HERE / "screencheck.c"), "-o", binary],
            check=True,
        )

        width, height = 8, 6
        pixels = rgba_frame(width, height)
        header = struct.pack("<IIII", width, height, 1, 0)
        stream = header + pixels

        stats = run(binary, ["stats", "2", "1", "6", "5", "1"], stream)
        assert stats == (
            "samples=16 mean_rgb=35,50,30 mean_luma=42 "
            "dark_bps=6250 bright_bps=0 horizontal_edge=3"
        ), stats

        # R=20..40 includes x=2,3,4: three of the four columns in every row.
        count = run(
            binary,
            ["count", "2", "1", "6", "5", "1", "20", "40", "0", "255", "0", "255"],
            stream,
        )
        assert count == "7500", count
        matched = run(
            binary,
            ["match", "2", "1", "6", "5", "1", "20", "40", "0", "255", "0", "255", "7500"],
            stream,
        )
        assert matched == "match", matched
        clear = run(
            binary,
            ["match", "2", "1", "6", "5", "1", "20", "40", "0", "255", "0", "255", "7501"],
            stream,
        )
        assert clear == "clear", clear

        raw_stats = run(
            binary,
            ["stats", "--rgba", str(width), str(height), "2", "1", "6", "5", "1"],
            pixels,
        )
        assert raw_stats == stats, (raw_stats, stats)

        # The reader must fail closed on a truncated frame or bad geometry.
        run(binary, ["stats", "2", "1", "6", "5", "1"], stream[:-60], 3)
        run(binary, ["stats", "2", "1", "9", "5", "1"], stream, 2)

        empty_dir = pathlib.Path(temp) / "empty"
        threat_dir = pathlib.Path(temp) / "threat"
        empty_dir.mkdir()
        threat_dir.mkdir()
        for directory, name, frame in (
            (empty_dir, "a.raw", rgba_frame(width, height)),
            (empty_dir, "b.raw", rgba_frame(width, height, 2)),
            (threat_dir, "a.raw", threat_frame(width, height)),
            (threat_dir, "b.raw", threat_frame(width, height, 2)),
        ):
            (directory / name).write_bytes(header + frame)

        model = pathlib.Path(temp) / "vent.scm"
        built = subprocess.run(
            [
                str(HERE / "build-screen-model.py"),
                "--roi", "0,0,8,6",
                "--grid", "4x3",
                "--step", "1",
                "--max-score", "20",
                "--min-margin", "5",
                "--output", model,
                f"empty={empty_dir}",
                f"threat={threat_dir}",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        assert built.returncode == 0, (built.stdout, built.stderr)
        assert "4 templates" in built.stdout, built.stdout

        empty_result = run(binary, ["classify", str(model)], header + rgba_frame(width, height))
        assert empty_result.startswith("empty score=0 margin="), empty_result
        threat_result = run(
            binary,
            ["classify", str(model), "--rgba", str(width), str(height)],
            threat_frame(width, height, 1),
        )
        assert threat_result.startswith("threat score="), threat_result

        unknown = bytes((110, 110, 110, 255)) * (width * height)
        unknown_result = run(binary, ["classify", str(model)], header + unknown)
        assert unknown_result.startswith("unknown score="), unknown_result
        run(
            binary,
            ["classify", str(model), "--rgba", "7", str(height)],
            unknown,
            3,
        )

        holdout_empty = pathlib.Path(temp) / "holdout-empty.raw"
        holdout_threat = pathlib.Path(temp) / "holdout-threat.raw"
        holdout_empty.write_bytes(header + rgba_frame(width, height, 1))
        holdout_threat.write_bytes(header + threat_frame(width, height, 1))
        replayed = subprocess.run(
            [
                str(HERE / "replay-screen-model.py"),
                model,
                f"empty={holdout_empty}",
                f"threat={holdout_threat}",
                "--checker", binary,
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        assert replayed.returncode == 0, (replayed.stdout, replayed.stderr)
        assert "all 2 holdout frames classified correctly" in replayed.stdout

        wrong_label = subprocess.run(
            [
                str(HERE / "replay-screen-model.py"),
                model,
                f"threat={holdout_empty}",
                "--checker", binary,
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        assert wrong_label.returncode == 1, (wrong_label.stdout, wrong_label.stderr)
        assert "expected threat, got empty" in wrong_label.stdout

    print("screencheck: all host-side checks passed")


if __name__ == "__main__":
    main()
