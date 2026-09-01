#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/overlay-observe-test.XXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT HUP INT TERM

mkdir -p "$TEMP_DIR/bin"
ln -s "$HERE/testdata/mock-adb-cue-helper.sh" "$TEMP_DIR/bin/adb"

PATH="$TEMP_DIR/bin:$PATH" CUE_HELPER_OVERLAY_PHASE=off \
  "$HERE/overlay-qualification-observe.sh" 1 0 "$TEMP_DIR/trace.tsv" \
  >"$TEMP_DIR/stdout" 2>"$TEMP_DIR/stderr"

python3 - "$TEMP_DIR/trace.tsv" <<'PY'
import csv
import sys

expected = [
    "phase", "sample", "elapsed_s", "epoch_s", "helper_pid", "target_build",
    "game_focused", "window_count", "overlay_state", "overlay_gate",
    "overlay_updates", "overlay_draws", "overlay_dropped",
    "overlay_cadence_samples", "overlay_p50_ms", "overlay_p95_ms",
    "overlay_p99_ms", "draw_interval_p50_ms", "draw_interval_p95_ms",
    "draw_interval_p99_ms", "visual_seq", "visual_age_us",
    "detector_latency_ms", "monitor_up", "monitor_reason", "camera_selected",
    "camera_reason", "battery_percent", "battery_reason", "cpu_percent",
    "pss_kb", "rss_kb", "threads", "thermal_status", "watch_seq",
    "watch_age_us", "watch_values",
]
with open(sys.argv[1], newline="") as stream:
    rows = list(csv.reader(stream, delimiter="\t"))
assert len(rows) == 2, rows
assert rows[0] == expected, rows[0]
assert len(rows[1]) == len(expected), rows[1]
assert rows[1][5] == "26:2.0.7", rows[1]
assert rows[1][7] == "1", rows[1]
assert rows[1][20:30] == ["121", "1200", "1", "true", "anchors-up", "cam:5", "single-camera-highlight", "75", "bars-observed", "2.0"], rows[1]
assert rows[1][17:20] == ["0.00", "0.00", "0.00"], rows[1]
assert rows[1][34:36] == ["122", "1200"], rows[1]
assert "bb_left_luma=194" in rows[1][36], rows[1]
PY

echo "overlay observation: mock HUD-off trace retains cadence and detector fields"
