#!/usr/bin/env python3
"""Kernel-released per-device lease for safe Cue Helper host operations."""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
import socket
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LOCK_DIR = ROOT / "captures/cue-helper/locks"


class DeviceBusy(RuntimeError):
    """Another process currently owns the device lease."""


def lock_path(serial: str) -> Path:
    digest = hashlib.sha256(serial.encode("utf-8")).hexdigest()[:24]
    return Path(os.environ.get("CUE_HELPER_LOCK_DIR", str(DEFAULT_LOCK_DIR))) / f"device-{digest}.lock"


class DeviceLock:
    """One non-blocking, process-safe lease; the kernel releases it on exit."""

    def __init__(self, serial: str):
        if not serial or any(character.isspace() for character in serial):
            raise ValueError("device serial must be a non-empty token")
        self.serial = serial
        self.path = lock_path(serial)
        self.handle = None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.handle = self.path.open("a+", encoding="utf-8")
        try:
            fcntl.flock(self.handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            self.handle.seek(0)
            owner = self.handle.read().strip()
            self.handle.close()
            self.handle = None
            detail = f" owner={owner}" if owner else ""
            raise DeviceBusy(f"device {self.serial} is already leased{detail}") from error
        self.handle.seek(0)
        self.handle.truncate()
        json.dump({
            "serial": self.serial,
            "pid": os.getpid(),
            "host": socket.gethostname(),
            "acquiredAt": time.time(),
        }, self.handle, sort_keys=True)
        self.handle.flush()
        return self

    def __exit__(self, *_):
        if self.handle is None:
            return
        self.handle.seek(0)
        self.handle.truncate()
        self.handle.flush()
        fcntl.flock(self.handle.fileno(), fcntl.LOCK_UN)
        self.handle.close()
        self.handle = None
