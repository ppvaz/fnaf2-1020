#!/usr/bin/env python3
"""Cross-process-safe lease regression for multiple agents sharing one phone."""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import tempfile
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("cue_helper_device_lock", HERE / "cue_helper_device_lock.py")
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

with tempfile.TemporaryDirectory(prefix="cue-helper-device-lock-") as directory:
    previous = os.environ.get("CUE_HELPER_LOCK_DIR")
    os.environ["CUE_HELPER_LOCK_DIR"] = directory
    try:
        first = MODULE.DeviceLock("one-device")
        with first:
            assert first.path.parent == Path(directory)
            try:
                with MODULE.DeviceLock("one-device"):
                    raise AssertionError("second agent acquired the same device lease")
            except MODULE.DeviceBusy:
                pass
        with MODULE.DeviceLock("one-device"):
            pass

        child = subprocess.Popen(
            [sys.executable, str(HERE / "device-lock-exec.py"), "one-device", "--",
             sys.executable, "-c",
             "import time; print('child-lease-acquired', flush=True); time.sleep(30)"],
            env=os.environ.copy(), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True)
        try:
            assert child.stdout is not None
            assert child.stdout.readline().strip() == "child-lease-acquired"
            try:
                with MODULE.DeviceLock("one-device"):
                    raise AssertionError("independent agent acquired the same device lease")
            except MODULE.DeviceBusy:
                pass
        finally:
            child.terminate()
            child.wait(timeout=5)
            if child.poll() is None:
                child.kill()
                child.wait(timeout=5)

        # flock is held by the kernel, so termination must not strand the
        # serial for future agents.
        with MODULE.DeviceLock("one-device"):
            pass
    finally:
        if previous is None:
            os.environ.pop("CUE_HELPER_LOCK_DIR", None)
        else:
            os.environ["CUE_HELPER_LOCK_DIR"] = previous

print("cue-helper per-device lease contention and kernel-release passed")
