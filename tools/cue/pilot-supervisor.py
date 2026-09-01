#!/usr/bin/env python3
"""Run the latency collector and device pilot under one killable supervisor.

The collector starts some helpers in their own sessions. A plain terminal
Ctrl-C can therefore stop the foreground pilot while leaving the collector,
bridge, or watcher alive. This supervisor tracks both process trees and
performs a bounded, verified shutdown.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from typing import Iterable


ROOT = Path(__file__).resolve().parents[2]
LATENCY = ROOT / "tools/cue/latency-experiment.py"
TRIAL = ROOT / "tools/device/legacy-trial.sh"


def _children(pid: int) -> list[int]:
    """Read direct children without requiring psutil or a shell pipeline."""
    path = Path(f"/proc/{pid}/task/{pid}/children")
    try:
        text = path.read_text(encoding="ascii")
    except (FileNotFoundError, PermissionError):
        # macOS has no /proc. `pgrep -P` is a narrow equivalent and keeps the
        # supervisor dependency-free; it is used only for process discovery.
        result = subprocess.run(["pgrep", "-P", str(pid)], text=True,
                                capture_output=True, check=False)
        return [int(value) for value in result.stdout.split() if value.isdigit()]
    return [int(value) for value in text.split()]


def descendants(pid: int) -> set[int]:
    result: set[int] = set()
    pending = list(_children(pid))
    while pending:
        child = pending.pop()
        if child in result:
            continue
        result.add(child)
        pending.extend(_children(child))
    return result


def alive(pid: int) -> bool:
    proc_stat = Path(f"/proc/{pid}/stat")
    try:
        stat = proc_stat.read_text(encoding="ascii")
        state = stat.rsplit(")", 1)[-1].lstrip().split(" ", 1)[0]
        if state == "Z":
            return False
    except (FileNotFoundError, PermissionError):
        pass
    try:
        os.kill(pid, 0)
    except (ProcessLookupError, PermissionError):
        return False
    # On platforms without /proc, distinguish a live process from a zombie
    # that has not yet been reaped by its parent.
    if not proc_stat.exists():
        result = subprocess.run(["ps", "-o", "state=", "-p", str(pid)],
                                text=True, capture_output=True, check=False)
        state = result.stdout.strip()
        if not state or state.startswith("Z"):
            return False
    return True


class TrackedProcess:
    def __init__(self, process: subprocess.Popen, label: str):
        self.process = process
        self.label = label
        self.known: set[int] = {process.pid}

    def refresh(self) -> None:
        self.known.update(descendants(self.process.pid))

    def live_known(self) -> set[int]:
        return {pid for pid in self.known if alive(pid)}


def _signal_pid(pid: int, sig: signal.Signals) -> None:
    try:
        os.kill(pid, sig)
    except (ProcessLookupError, PermissionError):
        pass


def _signal_tree(tracked: TrackedProcess, sig: signal.Signals) -> None:
    tracked.refresh()
    # The group catches ordinary descendants. The inventory also catches the
    # latency runner's detached authority/bridge/watcher sessions.
    try:
        os.killpg(tracked.process.pid, sig)
    except (ProcessLookupError, PermissionError):
        pass
    _signal_pid(tracked.process.pid, sig)
    for pid in sorted(tracked.known - {tracked.process.pid}):
        _signal_pid(pid, sig)


def terminate_tree(tracked: TrackedProcess, label: str, grace: float = 8.0) -> bool:
    """Stop one tracked tree and return whether all known processes ended."""
    _signal_tree(tracked, signal.SIGINT)
    deadline = time.monotonic() + grace
    while time.monotonic() < deadline:
        tracked.refresh()
        if not tracked.live_known():
            return True
        time.sleep(0.1)

    _signal_tree(tracked, signal.SIGTERM)
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline:
        tracked.refresh()
        if not tracked.live_known():
            return True
        time.sleep(0.1)

    _signal_tree(tracked, signal.SIGKILL)
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline:
        tracked.refresh()
        if not tracked.live_known():
            return True
        time.sleep(0.1)

    remaining = sorted(tracked.live_known())
    print(f"SUPERVISOR cleanup=incomplete label={label} pids={remaining}", flush=True)
    return False


def _env_assignments(values: Iterable[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for item in values:
        key, separator, value = item.partition("=")
        valid = key and all(char.isalnum() or char == "_" for char in key)
        if not separator or not valid:
            raise ValueError(f"invalid --pilot-env assignment: {item!r}")
        result[key] = value
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", required=True)
    parser.add_argument("--seconds", type=float, required=True)
    parser.add_argument("--pilot-cycles", type=int, required=True)
    parser.add_argument("--focus-timeout", type=float, default=45.0,
                        help="seconds to wait for trial.sh to put FNaF in focus")
    parser.add_argument("--refs", type=Path, required=True)
    parser.add_argument("--authority-model", type=Path, required=True)
    parser.add_argument("--authority-cue", default="bang")
    parser.add_argument("--shadow-cue", dest="shadow_cues", action="append")
    parser.add_argument("--latency-log", type=Path)
    parser.add_argument("--pilot-log", type=Path)
    parser.add_argument("--pilot-env", action="append", default=[], metavar="KEY=VALUE",
                        help="environment override for trial.sh; may be repeated")
    return parser.parse_args()


def _open_log(path: Path, label: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        return path.open("x", encoding="utf-8"), path
    except FileExistsError as exc:
        raise SystemExit(f"{label} log already exists; choose a new path: {path}") from exc


def _game_focused() -> bool:
    try:
        result = subprocess.run(
            ["adb", "shell", "dumpsys", "window"],
            text=True, capture_output=True, timeout=5, check=False)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False
    return any("mCurrentFocus=" in line and "com.scottgames.fnaf2" in line
               for line in result.stdout.splitlines())


def _wait_for_focus(tracked: TrackedProcess, timeout: float) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if tracked.process.poll() is not None:
            return False
        if _game_focused():
            return True
        time.sleep(0.25)
    return _game_focused() and tracked.process.poll() is None


def main() -> int:
    args = parse_args()
    if args.seconds <= 0 or args.pilot_cycles <= 0:
        raise SystemExit("--seconds and --pilot-cycles must be positive")
    try:
        pilot_env = _env_assignments(args.pilot_env)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

    shadow_cues = args.shadow_cues or ["bang"]
    authority_socket = Path("/tmp") / f"fnaf2-audio-supervisor-{os.getpid()}.sock"
    latency_cmd = [
        sys.executable, str(LATENCY), "run", "--seconds", str(args.seconds),
        "--name", args.name, "--refs", str(args.refs),
        "--authority-model", str(args.authority_model),
        "--authority-cue", args.authority_cue,
        "--authority-socket", str(authority_socket),
    ]
    for cue in shadow_cues:
        latency_cmd.extend(["--shadow-cue", cue])
    pilot_cmd = ["bash", str(TRIAL), args.name, str(args.pilot_cycles)]
    latency_log = args.latency_log or Path("/tmp") / f"fnaf2-{args.name}-latency.log"
    pilot_log = args.pilot_log or Path("/tmp") / f"fnaf2-{args.name}-pilot.log"
    latency_handle, latency_log = _open_log(latency_log, "latency")
    try:
        pilot_handle, pilot_log = _open_log(pilot_log, "pilot")
    except BaseException:
        latency_handle.close()
        raise

    env = os.environ.copy()
    env.update(pilot_env)
    if env.get("CUE_AUDIO") == "1":
        env["AUDIO_AUTHORITY_SOCKET"] = str(authority_socket)
    print(f"SUPERVISOR start latency_log={latency_log} pilot_log={pilot_log}", flush=True)
    latency: TrackedProcess | None = None
    pilot: TrackedProcess | None = None
    pilot_completion_reported = False
    stop_requested: dict[str, signal.Signals | None] = {"signal": None}

    def request_stop(sig: signal.Signals, _frame) -> None:
        if stop_requested["signal"] is None:
            stop_requested["signal"] = sig
            print(f"SUPERVISOR stop_requested signal={sig.name}", flush=True)

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)

    try:
        pilot = TrackedProcess(subprocess.Popen(
            pilot_cmd, cwd=ROOT, env=env, stdout=pilot_handle,
            stderr=subprocess.STDOUT, start_new_session=True), "pilot")
        print(f"SUPERVISOR audio_socket={authority_socket}", flush=True)
        if not _wait_for_focus(pilot, args.focus_timeout):
            terminate_tree(pilot, "pilot")
            print("SUPERVISOR cleanup=complete reason=focus-timeout", flush=True)
            return 1
        latency = TrackedProcess(subprocess.Popen(
            latency_cmd, cwd=ROOT, env=env, stdout=latency_handle,
            stderr=subprocess.STDOUT, start_new_session=True), "latency")

        while True:
            latency.refresh()
            pilot.refresh()
            if stop_requested["signal"] is not None:
                terminate_tree(pilot, "pilot")
                terminate_tree(latency, "latency")
                print("SUPERVISOR cleanup=complete reason=operator", flush=True)
                return 128 + int(stop_requested["signal"])

            pilot_rc = pilot.process.poll()
            latency_rc = latency.process.poll()
            if pilot_rc is not None:
                if pilot_rc != 0:
                    terminate_tree(latency, "latency")
                    print(f"SUPERVISOR cleanup=complete reason=pilot-exit rc={pilot_rc}", flush=True)
                    return pilot_rc if pilot_rc > 0 else 1
                if not pilot_completion_reported:
                    print("SUPERVISOR pilot=complete waiting=latency", flush=True)
                    pilot_completion_reported = True

            if latency_rc is not None:
                if pilot is not None:
                    terminate_tree(pilot, "pilot")
                print(f"SUPERVISOR complete latency_rc={latency_rc}", flush=True)
                return latency_rc
            time.sleep(0.2)
    except KeyboardInterrupt:
        if latency is not None:
            terminate_tree(latency, "latency")
        if pilot is not None:
            terminate_tree(pilot, "pilot")
        print("SUPERVISOR cleanup=complete reason=keyboard-interrupt", flush=True)
        return 130
    except BaseException:
        if pilot is not None:
            terminate_tree(pilot, "pilot")
        if latency is not None:
            terminate_tree(latency, "latency")
        raise
    finally:
        latency_handle.close()
        pilot_handle.close()


if __name__ == "__main__":
    raise SystemExit(main())
