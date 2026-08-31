#!/usr/bin/env python3
"""Regression for detached-child cleanup in pilot-supervisor.py."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import subprocess
import sys
import time


HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("pilot_supervisor", HERE / "pilot-supervisor.py")
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


fixture = (
    "import signal, subprocess, sys, time\n"
    "signal.signal(signal.SIGINT, lambda *_: sys.exit(130))\n"
    "child = subprocess.Popen([sys.executable, '-c', "
    "'import signal,time; signal.signal(signal.SIGINT, signal.SIG_IGN); "
    "signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(60)'], "
    "start_new_session=True)\n"
    "time.sleep(60)\n"
)
root = subprocess.Popen([sys.executable, "-c", fixture], start_new_session=True)
tracked = module.TrackedProcess(root, "fixture")
try:
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        tracked.refresh()
        if len(tracked.known) >= 2:
            break
        time.sleep(0.05)
    assert len(tracked.known) >= 2, tracked.known
    assert module.terminate_tree(tracked, "fixture", grace=0.2)
    root.wait(timeout=2)
    assert not tracked.live_known(), tracked.live_known()
finally:
    if root.poll() is None:
        module.terminate_tree(tracked, "fixture-finally")
        root.wait(timeout=2)

print("pilot supervisor: detached-child interruption cleanup passes")
