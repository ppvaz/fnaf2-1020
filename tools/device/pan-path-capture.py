#!/usr/bin/env python3
"""Capture a manual full-office pan sweep without generating game input.

The phone's helper already measures the warm ceiling bulb on every captured
frame. This tool retains that measurement beside a native-resolution
screenrecord video so a complete curved anchor path can be learned from a
single manual left/right sweep. It waits for a positively identified night and
only reads the authenticated helper socket after activating the native
watchlist.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
HELPER = ROOT / "tools/device/query-cue-helper.sh"
TARGET_PACKAGE = "com.scottgames.fnaf2"
HELPER_PACKAGE = "com.fnaf2.cuehelper"
REMOTE_PREFIX = "/data/local/tmp/fnaf2-pan-path"
NATIVE_SIZE = "2400x1080"

CONTROL_RE = re.compile(r"control=(?:READY|DEGRADED)\b.*")
PORT_RE = re.compile(r"\bport=(\d+)\b")
TOKEN_RE = re.compile(r"\btoken=([0-9a-f]{32})\b")
FIELD_RE = {
    "snapshot_ns": re.compile(r"\bsnapshotNs=(\d+)\b"),
    "seq": re.compile(r"\bseq=(\d+)\b"),
    "age_us": re.compile(r"\bageUs=(-?\d+)\b"),
    "screen": re.compile(r"\bscreen=([^ ]+)"),
    "state": re.compile(r"\bpan_anchor_state=([^ ]+)"),
    "x": re.compile(r"\bpan_anchor_x=([^ ]+)"),
    "y": re.compile(r"\bpan_anchor_y=([^ ]+)"),
    "area": re.compile(r"\bpan_anchor_area=([^ ]+)"),
    "margin": re.compile(r"\bpan_anchor_margin=([^ ]+)"),
    "confidence": re.compile(r"\bpan_anchor_confidence=([^ ]+)"),
    "reason": re.compile(r"\bpan_anchor_reason=([^ ]+)"),
}
ANCHOR_COLUMNS = [
    "poll_ns", "snapshot_ns", "seq", "age_us", "screen", "pan_anchor_state",
    "pan_anchor_x", "pan_anchor_y", "pan_anchor_area", "pan_anchor_margin",
    "pan_anchor_confidence", "pan_anchor_reason",
]


class CaptureError(RuntimeError):
    pass


def adb(*args: str, timeout: float = 30.0, check: bool = True) -> str:
    result = subprocess.run(
        ["adb", *args],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )
    output = (result.stdout or "").replace("\r", "")
    if check and result.returncode != 0:
        detail = (result.stderr or output).strip()
        raise CaptureError(f"adb {' '.join(args)} failed: {detail}")
    return output


def helper_query(*args: str, timeout: float = 30.0) -> str:
    environment = os.environ.copy()
    environment["CUE_HELPER_TRANSPORT"] = "loopback"
    result = subprocess.run(
        [str(HELPER), *args],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
        env=environment,
    )
    output = (result.stdout or result.stderr).replace("\r", "").strip()
    if result.returncode != 0:
        raise CaptureError(output or f"helper query failed: {' '.join(args)}")
    return output


def current_focus_is_game() -> bool:
    windows = adb("shell", "dumpsys", "window", check=False)
    return bool(re.search(r"mCurrentFocus=.*com\.scottgames\.fnaf2", windows))


def helper_pid() -> str:
    pid = adb("shell", "pidof", HELPER_PACKAGE, check=False).strip().split()
    if not pid or not pid[0].isdigit():
        raise CaptureError("cue helper is not running")
    return pid[0]


def control_endpoint(pid: str) -> tuple[str, str]:
    log = adb(
        "logcat", "-d", f"--pid={pid}", "-v", "brief", "-s",
        "FnafCueHelper:I", "*:S", check=False,
    )
    lines = [line for line in log.splitlines() if CONTROL_RE.search(line)]
    if not lines:
        raise CaptureError("cue helper has no READY/DEGRADED control endpoint")
    line = lines[-1]
    port = PORT_RE.search(line)
    token = TOKEN_RE.search(line)
    if not port or not token:
        raise CaptureError("cue helper control endpoint has no port/token")
    return port.group(1), token.group(1)


def ensure_watchlist() -> str:
    status = helper_query("watchlist", "status")
    match = re.search(r"\bspec=([0-9a-fA-F]{64})\b", status)
    if not match:
        raise CaptureError(f"watchlist status has no spec hash: {status}")
    spec = match.group(1)
    if "watch=ACTIVE" not in status:
        loaded = helper_query("watchlist", "load", spec)
        if "watch=ACTIVE" not in loaded:
            raise CaptureError(f"watchlist did not activate: {loaded}")
    return spec


def wait_for_night(timeout_s: float) -> str:
    deadline = time.monotonic() + timeout_s
    last = ""
    while time.monotonic() < deadline:
        if not current_focus_is_game():
            last = "game-not-focused"
            time.sleep(0.5)
            continue
        try:
            last = helper_query()
        except CaptureError as error:
            last = str(error)
            time.sleep(0.5)
            continue
        if "visual=OBSERVED" in last and "screen=FNAF2_NIGHT" in last:
            return last
        time.sleep(0.5)
    raise CaptureError(f"FNAF2_NIGHT was not observed within {timeout_s:.0f}s; last={last}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Record native office-pan video and per-frame pan-anchor samples"
    )
    parser.add_argument("duration", nargs="?", type=int, default=45,
                        help="recording duration in seconds (default: 45)")
    parser.add_argument("label", nargs="?", default="office-pan",
                        help="artifact label using letters, numbers, dash, underscore")
    parser.add_argument("--out", type=Path,
                        help="output directory (default: captures/cue-helper/pan-path/<timestamp>-<label>)")
    parser.add_argument("--wait", type=float, default=120.0,
                        help="seconds to wait for FNAF2_NIGHT (default: 120)")
    parser.add_argument("--poll-ms", type=int, default=50,
                        help="device-side READ poll interval in milliseconds (default: 50)")
    parser.add_argument("--bit-rate", type=int, default=12000000,
                        help="screenrecord AVC bit rate (default: 12000000)")
    return parser.parse_args()


def output_dir(args: argparse.Namespace) -> Path:
    if not 1 <= args.duration <= 180:
        raise CaptureError("duration must be between 1 and 180 seconds")
    if args.poll_ms < 10 or args.poll_ms > 1000:
        raise CaptureError("poll interval must be between 10 and 1000 ms")
    if args.bit_rate <= 0:
        raise CaptureError("bit rate must be positive")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", args.label):
        raise CaptureError("label must contain only letters, numbers, dash, or underscore")
    if args.out is not None:
        path = args.out if args.out.is_absolute() else ROOT / args.out
    else:
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        path = ROOT / "captures/cue-helper/pan-path" / f"{stamp}-{args.label}"
    if path.exists():
        raise CaptureError(f"refusing to overwrite existing output directory: {path}")
    path.mkdir(parents=True, exist_ok=False)
    return path


def suppress_touch_indicators() -> tuple[str, str]:
    show_touches = adb("shell", "settings", "get", "system", "show_touches").strip()
    pointer_location = adb(
        "shell", "settings", "get", "system", "pointer_location").strip()
    if show_touches not in {"0", "1"} or pointer_location not in {"0", "1"}:
        raise CaptureError(
            "could not read Android touch-indicator settings before capture")
    adb("shell", "settings", "put", "system", "show_touches", "0")
    adb("shell", "settings", "put", "system", "pointer_location", "0")
    return show_touches, pointer_location


def restore_touch_indicators(settings: tuple[str, str] | None) -> None:
    if settings is None:
        return
    show_touches, pointer_location = settings
    adb("shell", "settings", "put", "system", "show_touches", show_touches,
        check=False)
    adb("shell", "settings", "put", "system", "pointer_location", pointer_location,
        check=False)


REMOTE_RECORD = r"""
set -eu
video=$1
pidfile=$2
size=$3
rate=$4
duration=$5
rm -f "$pidfile"
screenrecord --size "$size" --bit-rate "$rate" --time-limit "$duration" "$video" &
pid=$!
printf '%s\n' "$pid" > "$pidfile"
wait "$pid"
rm -f "$pidfile"
"""

REMOTE_POLL = r"""
set -u
port=$1
token=$2
duration=$3
poll_ms=$4
poll_seconds="0.$(printf '%03d' "$poll_ms")"
end=$(( $(date +%s) + duration + 2 ))
while [ "$(date +%s)" -lt "$end" ]; do
    poll_ns=$(date +%s%N)
    response=$(printf 'GET %s\n' "$token" |
        toybox nc -w 2 127.0.0.1 "$port" 2>/dev/null |
        tr -d '\r\n' || true)
    printf '%s\t%s\n' "$poll_ns" "$response"
    if ! printf '%s' "$response" | grep -q 'screen=FNAF2_NIGHT'; then
        exit 3
    fi
    sleep "$poll_seconds"
done
"""


def start_remote_recording(out: Path, duration: int, bit_rate: int) -> tuple[subprocess.Popen, str, str]:
    unique = f"{os.getpid()}-{int(time.time())}"
    remote_video = f"{REMOTE_PREFIX}-{unique}.mp4"
    remote_pidfile = f"{REMOTE_PREFIX}-{unique}.pid"
    log = (out / "screenrecord.log").open("w", encoding="utf-8")
    process = subprocess.Popen(
        ["adb", "shell", "sh", "-s", "--", remote_video, remote_pidfile,
         NATIVE_SIZE, str(bit_rate), str(duration)],
        cwd=ROOT,
        stdin=subprocess.PIPE,
        stdout=log,
        stderr=subprocess.STDOUT,
        text=True,
    )
    log.close()
    assert process.stdin is not None
    process.stdin.write(REMOTE_RECORD)
    process.stdin.close()
    return process, remote_video, remote_pidfile


def start_remote_poller(out: Path, port: str, token: str,
                        duration: int, poll_ms: int) -> subprocess.Popen:
    raw = (out / "anchor-read.raw.tsv").open("w", encoding="utf-8")
    stderr = (out / "anchor-read.log").open("w", encoding="utf-8")
    process = subprocess.Popen(
        ["adb", "shell", "sh", "-s", "--", port, token, str(duration), str(poll_ms)],
        cwd=ROOT,
        stdin=subprocess.PIPE,
        stdout=raw,
        stderr=stderr,
        text=True,
    )
    raw.close()
    stderr.close()
    assert process.stdin is not None
    process.stdin.write(REMOTE_POLL)
    process.stdin.close()
    return process


def remote_pid(pidfile: str) -> str | None:
    value = adb("shell", "cat", pidfile, check=False).strip()
    return value if value.isdigit() else None


def stop_remote_recording(process: subprocess.Popen, pidfile: str) -> None:
    if pidfile:
        pid = remote_pid(pidfile)
        if pid is not None:
            adb("shell", "kill", "-INT", pid, check=False)
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def first_match(pattern: re.Pattern[str], text: str, default: str = "UNKNOWN") -> str:
    match = pattern.search(text)
    return match.group(1) if match else default


def parse_anchor_samples(raw_path: Path, tsv_path: Path) -> tuple[int, int]:
    rows = 0
    observed = 0
    with raw_path.open(encoding="utf-8", errors="replace") as source, \
            tsv_path.open("w", encoding="utf-8", newline="") as target:
        writer = csv.writer(target, delimiter="\t", lineterminator="\n")
        writer.writerow(ANCHOR_COLUMNS)
        for line in source:
            line = line.rstrip("\r\n")
            if "\t" not in line:
                continue
            poll_ns, response = line.split("\t", 1)
            if not poll_ns.isdigit():
                continue
            values = {
                "poll_ns": poll_ns,
                "snapshot_ns": first_match(FIELD_RE["snapshot_ns"], response),
                "seq": first_match(FIELD_RE["seq"], response),
                "age_us": first_match(FIELD_RE["age_us"], response),
                "screen": first_match(FIELD_RE["screen"], response),
                "state": first_match(FIELD_RE["state"], response),
                "x": first_match(FIELD_RE["x"], response),
                "y": first_match(FIELD_RE["y"], response),
                "area": first_match(FIELD_RE["area"], response),
                "margin": first_match(FIELD_RE["margin"], response),
                "confidence": first_match(FIELD_RE["confidence"], response),
                "reason": first_match(FIELD_RE["reason"], response),
            }
            row = [
                values["poll_ns"], values["snapshot_ns"], values["seq"],
                values["age_us"], values["screen"], values["state"],
                values["x"], values["y"],
                values["area"], values["margin"], values["confidence"],
                values["reason"],
            ]
            writer.writerow(row)
            rows += 1
            if values["state"] == "OBSERVED":
                observed += 1
    return rows, observed


def target_build() -> str:
    dump = adb("shell", "dumpsys", "package", TARGET_PACKAGE, check=False)
    code = re.search(r"\bversionCode=(\d+)\b", dump)
    name = re.search(r"\bversionName=([^\s]+)", dump)
    return f"{code.group(1)}:{name.group(1)}" if code and name else "UNKNOWN"


def main() -> int:
    args = parse_args()
    try:
        out = output_dir(args)
    except (CaptureError, OSError) as error:
        print(f"capture failed: {error}", file=sys.stderr)
        return 1
    video_process = None
    remote_video = None
    remote_pidfile = None
    poll_process = None
    touch_settings = None
    stop_reason = "duration"
    try:
        pid = helper_pid()
        spec = ensure_watchlist()
        night_status = wait_for_night(args.wait)
        port, token = control_endpoint(pid)
        if not current_focus_is_game():
            raise CaptureError("FNaF lost focus before recording")

        touch_settings = suppress_touch_indicators()
        start_host_ns = time.time_ns()
        video_process, remote_video, remote_pidfile = start_remote_recording(
            out, args.duration, args.bit_rate)
        time.sleep(0.35)
        poll_process = start_remote_poller(out, port, token, args.duration, args.poll_ms)
        print(f"RECORDING native={NATIVE_SIZE} duration={args.duration}s output={out}")
        print("Sweep the office manually across the full range, then back again.", flush=True)

        poll_process.wait(timeout=args.duration + 20)
        if poll_process.returncode != 0:
            if poll_process.returncode == 3:
                stop_reason = "screen-left-night"
                print("night identity was lost; stopping the partial capture", flush=True)
                stop_remote_recording(video_process, remote_pidfile)
            else:
                raise CaptureError(f"anchor poller exited with {poll_process.returncode}")
        else:
            video_process.wait(timeout=args.duration + 15)
        if video_process.returncode != 0 and stop_reason == "duration":
            raise CaptureError(f"screenrecord exited with {video_process.returncode}")

        local_video = out / "office-pan.mp4"
        adb("pull", remote_video, str(local_video), timeout=60)
        rows, observed = parse_anchor_samples(out / "anchor-read.raw.tsv", out / "anchor.tsv")
        manifest = {
            "schema": "fnaf2-pan-path-capture-v2",
            "device_serial": os.environ.get("ANDROID_SERIAL", "UNKNOWN"),
            "target_package": TARGET_PACKAGE,
            "target_build": target_build(),
            "native_size": NATIVE_SIZE,
            "duration_s": args.duration,
            "bit_rate": args.bit_rate,
            "poll_interval_ms": args.poll_ms,
            "watch_spec": spec,
            "start_host_ns": start_host_ns,
            "stop_reason": stop_reason,
            "night_status": night_status,
            "anchor_rows": rows,
            "anchor_observed_rows": observed,
            "video": local_video.name,
            "anchor_tsv": "anchor.tsv",
            "raw_anchor_tsv": "anchor-read.raw.tsv",
        }
        (out / "manifest.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"CAPTURE complete video={local_video} anchor_rows={rows} observed={observed}")
        return 0
    except KeyboardInterrupt:
        print("capture interrupted", file=sys.stderr)
        return 130
    except (CaptureError, OSError, subprocess.SubprocessError) as error:
        print(f"capture failed: {error}", file=sys.stderr)
        return 1
    finally:
        if video_process is not None and video_process.poll() is None:
            stop_remote_recording(video_process, remote_pidfile or "")
        if poll_process is not None and poll_process.poll() is None:
            poll_process.terminate()
            try:
                poll_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                poll_process.kill()
        if remote_video is not None:
            adb("shell", "rm", "-f", remote_video, check=False)
        if remote_pidfile is not None:
            adb("shell", "rm", "-f", remote_pidfile, check=False)
        restore_touch_indicators(touch_settings)


if __name__ == "__main__":
    raise SystemExit(main())
