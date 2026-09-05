#!/usr/bin/env python3
"""Read-only monitor-map telemetry; never a second input writer.

The historical restorer anchored a virtual HID schedule on completion of an
ADB screenshot. That includes unknown dispatch, animation, capture and read
latency. It checked idle deadlines BEFORE another blocking screenshot, and
interpreted map absence as a settled office. Neither permits a toggle.

The legacy invocation now refuses before accessing the phone. --observe-only
retains bounded request/receipt telemetry, NOT capture timestamps or a stream
epoch. Restoring game state belongs to the qualified DeviceControlService;
no future trial may be prequeued across an unverified restore.
"""
import argparse
import json
import subprocess
import sys
import time

CHECKER = "/data/local/tmp/fnaf-monraise-check"
ROI = "1300 350 2300 950 4 100 255 100 255 0 99 30"


def observe_map(sequence, read, now=time.monotonic):
    requested = now() * 1000
    try:
        output = read()
        verdict = output.strip().splitlines()[-1] if output.strip() else ""
        state = {"match": "MAP_PRESENT", "clear": "MAP_ABSENT"}.get(verdict, "UNKNOWN")
        reason = None if state != "UNKNOWN" else "checker-unavailable"
    except (OSError, subprocess.SubprocessError):
        state, reason = "UNKNOWN", "capture-failed"
    received = now() * 1000
    return {
        "schema": "monitor-map-observation-v1", "requestSequence": sequence,
        "requestedAt": {"clock": "host-monotonic-ms", "value": requested},
        "receivedAt": {"clock": "host-monotonic-ms", "value": received},
        "captureTime": None, "frameSequence": None, "streamEpoch": None,
        "readLatencyMs": received - requested, "state": state, "reason": reason,
        "officeReady": "UNKNOWN", "actuation": "NONE",
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("schedule", nargs="?", help="historical schedule (never used as a clock)")
    parser.add_argument("--observe-only", action="store_true")
    parser.add_argument("--serial")
    parser.add_argument("--seconds", type=float, default=5)
    args = parser.parse_args(argv)
    if not args.observe_only:
        print("monitorraise-watch: REFUSED: screenshot completion is not a HID epoch; "
              "concurrent ADB restore disabled. Use qualified DeviceControlService "
              "or --observe-only for read-only telemetry.", file=sys.stderr)
        return 2
    if not 0 < args.seconds <= 30:
        parser.error("--seconds must be in (0, 30]")
    deadline = time.monotonic() + args.seconds
    command = ["adb"] + (["-s", args.serial] if args.serial else [])
    command += ["shell", f"screencap | {CHECKER} match {ROI}"]
    def read():
        return subprocess.run(command, check=True, capture_output=True, text=True,
                              timeout=max(0.001, min(10, deadline - time.monotonic()))).stdout
    sequence = 0
    while time.monotonic() < deadline:
        sequence += 1
        print(json.dumps(observe_map(sequence, read)), flush=True)
        time.sleep(min(0.05, max(0, deadline - time.monotonic())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
