#!/usr/bin/env python3
"""Run one host device operation while holding the shared serial lease."""

from __future__ import annotations

import os
import subprocess
import sys

from cue_helper_device_lock import DeviceBusy, DeviceLock


def main() -> int:
    if len(sys.argv) < 4 or sys.argv[2] != "--":
        print("usage: device-lock-exec.py SERIAL -- COMMAND [ARGS...]", file=sys.stderr)
        return 2
    serial = sys.argv[1]
    command = sys.argv[3:]
    try:
        with DeviceLock(serial):
            return subprocess.run(command, check=False).returncode
    except DeviceBusy as error:
        print(f"DEVICE HOLD reason=device-busy serial={serial} detail={error}",
              file=sys.stderr)
        return 75
    except OSError as error:
        print(f"DEVICE ERROR command-start-failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
