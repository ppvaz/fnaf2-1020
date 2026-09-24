#!/usr/bin/env python3
"""Phone-free regression for receiver-side A2DP PCM timing bounds."""

from __future__ import annotations

import json
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path


HERE = Path(__file__).resolve().parent
COLLECTOR = HERE / "bt-audio-collector.py"


def wait_for(path: Path, predicate, timeout: float = 3.0) -> dict:
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        if path.exists():
            value = json.loads(path.read_text())
            if predicate(value):
                return value
        time.sleep(0.02)
    raise AssertionError(f"timed out waiting for {path}")


with tempfile.TemporaryDirectory(prefix="bt-audio-collector-") as directory:
    root = Path(directory)
    fake = root / "bluealsa-cli"
    fake.write_text(
        "#!" + sys.executable + "\n"
        "import os, sys, time\n"
        "assert sys.argv[1] == 'open'\n"
        "for _ in range(40):\n"
        "  os.write(1, b'\\0' * 1764)\n"
        "  time.sleep(0.01)\n"
    )
    fake.chmod(0o755)
    raw, state, err = root / "capture.raw", root / "capture.stream.json", root / "capture.err"
    command = [sys.executable, str(COLLECTOR), "--pcm", "/org/bluealsa/hci0/dev_A/a2dpsnk/source",
               "--raw", str(raw), "--state", str(state), "--stderr", str(err),
               "--format", "S16_LE", "--rate", "44100", "--channels", "2", "--bluealsa-cli", str(fake)]
    completed = subprocess.run(command, text=True, capture_output=True, check=False, timeout=10)
    if completed.returncode != 0:
        raise AssertionError(completed.stderr)
    ended = json.loads(state.read_text())
    assert ended["status"] == "ENDED", ended
    assert ended["rawBytes"] == 40 * 1764, ended
    assert ended["firstPcmMonotonicMs"] is not None and ended["lastPcmMonotonicMs"] is not None, ended
    assert ended["sampleSpanMs"] > 0 and ended["chunks"] >= 1, ended
    expected_ms = 1000.0 * ended["rawBytes"] / (44_100 * 2 * 2)
    assert abs(ended["sampleSpanMs"] - expected_ms) < 80.0, (ended, expected_ms)

    endless = root / "bluealsa-endless"
    endless.write_text(
        "#!" + sys.executable + "\n"
        "import os, sys, time\n"
        "assert sys.argv[1] == 'open'\n"
        "while True:\n"
        "  os.write(1, b'\\0' * 1764)\n"
        "  time.sleep(0.01)\n"
    )
    endless.chmod(0o755)
    raw2, state2, err2 = root / "interrupted.raw", root / "interrupted.stream.json", root / "interrupted.err"
    interrupted = subprocess.Popen([
        sys.executable, str(COLLECTOR), "--pcm", "/org/bluealsa/hci0/dev_A/a2dpsnk/source",
        "--raw", str(raw2), "--state", str(state2), "--stderr", str(err2),
        "--format", "S16_LE", "--rate", "44100", "--channels", "2", "--bluealsa-cli", str(endless),
    ])
    wait_for(state2, lambda row: row.get("status") == "RUNNING")
    time.sleep(0.12)
    interrupted.send_signal(signal.SIGINT)
    if interrupted.wait(timeout=5) != 0:
        raise AssertionError("SIGINT collector did not terminate cleanly")
    stopped = wait_for(state2, lambda row: row.get("status") == "STOPPED")
    assert stopped["requestedSignal"] == "SIGINT", stopped
    assert stopped["rawBytes"] > 0 and stopped["sampleSpanMs"] > 0, stopped

print("bt-audio collector: first/final PCM bounds and SIGINT finalization pass")
