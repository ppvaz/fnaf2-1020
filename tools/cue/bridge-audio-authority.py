#!/usr/bin/env python3
"""Bridge an external fact stream into the active Cue Helper session.

The APK owns the visual session, while an external receiver publishes the
bounded ``fact-message-v1`` stream.  This bridge creates a temporary adb
forward, authenticates with the current capture token, and forwards validated
fact lines without copying or decoding raw audio.

Start the publisher first, then run:

  tools/cue/audio-authority.py --socket /tmp/fnaf2-audio.sock --quiet
  tools/cue/bridge-audio-authority.py --socket /tmp/fnaf2-audio.sock

The bridge waits for a video-capture session and reconnects when the session
or publisher is restarted.  Before forwarding an event fact (`cue-*` or
`wind-tick`), it performs a positive `screenstate.py --adb-fast` check. Only
`night` (the office HUD) passes; the title/menu BGM, transitions, game-over,
and failed/unknown captures are dropped. Stop it with Ctrl-C; the adb forward
is removed automatically.
"""

from __future__ import annotations

import argparse
import json
import math
import pathlib
import re
import socket
import subprocess
import sys
import time


PACKAGE = "com.fnaf2.cuehelper"
HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[1]
SCREENSTATE = REPO / "tools/device/screenstate.py"
DEFAULT_SOCKET = "/tmp/fnaf2-audio.sock"
DEFAULT_DEVICE_PORT = 49_708
MAX_FACT_BYTES = 1_024
MAX_FACT_TYPE_LENGTH = 64
MAX_FACT_SOURCE_LENGTH = 64
MAX_CALIBRATION_PROFILE_LENGTH = 96
MAX_TOKEN_LENGTH = 32
RETRY_SECONDS = 1.0
UINT32_MAX = 0xFFFF_FFFF
CUE_FACT_PREFIX = "cue-"
SCREEN_STATES = {"night", "other", "gameover"}


def run(command: list[str], timeout: float = 10.0) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(command, text=True, capture_output=True,
                              timeout=timeout, check=False)
    except FileNotFoundError as error:
        raise RuntimeError("missing command: %s" % error.filename) from error


def helper_token() -> str | None:
    pid_result = run(["adb", "shell", "pidof", PACKAGE])
    pid = (pid_result.stdout or "").strip().split()
    if not pid or not pid[0].isdigit():
        return None
    logs = run(["adb", "logcat", "-d", "--pid=%s" % pid[0], "-v", "brief",
                "-s", "FnafCueHelper:I", "*:S"], timeout=20.0)
    matches = re.findall(
        r"control=(?:READY|DEGRADED)\b.*?token=([0-9a-f]{32})\b",
        logs.stdout or "", re.IGNORECASE)
    if not matches:
        return None
    token = matches[-1].lower()
    return token if len(token) == MAX_TOKEN_LENGTH else None


def read_line(sock: socket.socket, limit: int) -> bytes | None:
    data = bytearray()
    while len(data) <= limit:
        block = sock.recv(1)
        if not block:
            return None
        if block == b"\n":
            return bytes(data)
        if block != b"\r":
            data.extend(block)
    return None


def normalized_fact(line: bytes) -> bytes | None:
    if len(line) + 1 > MAX_FACT_BYTES:
        return None
    try:
        value = json.loads(line.decode("ascii"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(value, dict) or value.get("schema") != "fact-message-v1":
        return None
    seq = value.get("seq")
    if (isinstance(seq, bool) or not isinstance(seq, int)
            or not 0 <= seq <= UINT32_MAX):
        return None
    fact_type = value.get("type")
    source = value.get("source")
    profile = value.get("calibrationProfile")
    for candidate, limit in ((fact_type, MAX_FACT_TYPE_LENGTH),
                             (source, MAX_FACT_SOURCE_LENGTH)):
        if not isinstance(candidate, str) or not candidate or len(candidate) > limit:
            return None
        if any(ord(character) < 0x21 or ord(character) > 0x7e
               for character in candidate):
            return None
    if profile is not None:
        if (not isinstance(profile, str) or not profile
                or len(profile) > MAX_CALIBRATION_PROFILE_LENGTH):
            return None
        if any(ord(character) < 0x21 or ord(character) > 0x7e
               for character in profile):
            return None
    state = value.get("state")
    if state not in ("OBSERVED", "UNKNOWN"):
        return None
    confidence = value.get("confidence")
    if (isinstance(confidence, bool) or not isinstance(confidence, (int, float))
            or not math.isfinite(confidence) or not 0.0 <= confidence <= 1.0):
        return None
    received = value.get("t_received")
    if (isinstance(received, bool) or not isinstance(received, (int, float))
            or not math.isfinite(received) or received < 0):
        return None
    observed = value.get("t_observed")
    if observed is not None:
        if (isinstance(observed, bool) or not isinstance(observed, (int, float))
                or not math.isfinite(observed) or observed < 0
                or observed > received):
            return None
    latency_min = value.get("latencyMin")
    latency_max = value.get("latencyMax")
    if (isinstance(latency_min, bool) or not isinstance(latency_min, (int, float))
            or not math.isfinite(latency_min) or latency_min < 0
            or isinstance(latency_max, bool) or not isinstance(latency_max, (int, float))
            or not math.isfinite(latency_max) or latency_max < latency_min):
        return None
    if state == "OBSERVED":
        if "value" not in value:
            return None
        fact_value = value["value"]
        if (fact_value is not None and not isinstance(fact_value, (bool, int, float, str))):
            return None
        if isinstance(fact_value, float) and not math.isfinite(fact_value):
            return None
    else:
        if "value" in value:
            return None
    reason = value.get("reason")
    if state == "UNKNOWN":
        if not isinstance(reason, str) or not reason or len(reason) > 128:
            return None
        if any(ord(character) < 0x21 or ord(character) > 0x7e
               for character in reason):
            return None

    # Forward the canonical field set only. This keeps optional/unknown fields
    # from changing the bounded wire contract between receiver adapters.
    normalized_value = {
        "schema": "fact-message-v1",
        "seq": seq,
        "type": fact_type,
        "state": state,
        "confidence": confidence,
        "source": source,
        "calibrationProfile": profile,
        "t_received": received,
        "latencyMin": latency_min,
        "latencyMax": latency_max,
    }
    if observed is not None:
        normalized_value["t_observed"] = observed
    if state == "OBSERVED":
        normalized_value["value"] = value["value"]
    else:
        normalized_value["reason"] = reason
    normalized = (json.dumps(normalized_value, separators=(",", ":"), ensure_ascii=True)
                  + "\n").encode("ascii")
    return normalized if len(normalized) <= MAX_FACT_BYTES else None


def fact_type(line: bytes) -> str | None:
    """Read the type from a line that has already passed normalization."""
    try:
        value = json.loads(line.decode("ascii"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    candidate = value.get("type") if isinstance(value, dict) else None
    return candidate if isinstance(candidate, str) else None


def is_cue_fact(line: bytes) -> bool:
    """Return true for event facts, not route/health facts."""
    candidate = fact_type(line)
    return candidate == "wind-tick" or bool(
        candidate and candidate.startswith(CUE_FACT_PREFIX))


class VisualGate:
    """Positive night-context gate for external cue facts.

    A menu is an audio-producing screen, so "not menu" is not enough: a
    transition, death screen, or unknown frame must also be unable to pass a
    cue. The existing screenstate authority answers `night` only when the
    office HUD is present. Every other answer is fail-closed here.
    """

    def __init__(self, timeout: float = 0.8):
        self.timeout = timeout

    def state(self) -> str:
        if not SCREENSTATE.is_file():
            return "unknown(screenstate-missing)"
        try:
            result = subprocess.run(
                [sys.executable, str(SCREENSTATE), "--adb-fast", str(self.timeout)],
                text=True, capture_output=True, timeout=self.timeout + 0.25,
                check=False)
        except (OSError, subprocess.TimeoutExpired):
            return "unknown(screenstate-failed)"
        state = (result.stdout or "").strip()
        return state if state in SCREEN_STATES else "unknown(screenstate-invalid)"


def cue_allowed(line: bytes, visual_gate: VisualGate | None) -> tuple[bool, str]:
    """Allow event facts only with a positive office/night observation.

    Production forwarding always supplies a gate. A missing gate is refused
    rather than becoming an accidental command-line bypass.
    """
    if not is_cue_fact(line):
        return True, "not-a-cue"
    if visual_gate is None:
        return False, "unknown(no-visual-gate)"
    state = visual_gate.state()
    return state == "night", state


def open_forward(device_port: int) -> int:
    result = run(["adb", "forward", "tcp:0", "tcp:%d" % device_port])
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError("adb forward failed: %s" % detail)
    lines = (result.stdout or "").splitlines()
    if not lines or not lines[-1].strip().isdigit():
        raise RuntimeError("adb forward returned no host port")
    return int(lines[-1].strip())


def remove_forward(host_port: int) -> None:
    run(["adb", "forward", "--remove", "tcp:%d" % host_port])


def connect_helper(host_port: int, token: str) -> socket.socket:
    client = socket.create_connection(("127.0.0.1", host_port), timeout=3.0)
    client.sendall(("AUTH %s\n" % token).encode("ascii"))
    response = read_line(client, 256)
    if response != b"OK audio-link=READY":
        client.close()
        raise RuntimeError("Cue Helper audio link refused authentication")
    client.settimeout(1.0)
    return client


def forward_stream(host_port: int, token: str, authority_socket: str,
                   once: bool = False,
                   visual_gate: VisualGate | None = None) -> int:
    with connect_helper(host_port, token) as helper:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as source:
            source.settimeout(3.0)
            source.connect(authority_socket)
            source.settimeout(1.0)
            pending = bytearray()
            forwarded = 0
            while True:
                try:
                    block = source.recv(4096)
                except socket.timeout:
                    continue
                if not block:
                    raise ConnectionError("external fact stream ended")
                pending.extend(block)
                if len(pending) > MAX_FACT_BYTES and b"\n" not in pending:
                    raise ValueError("external fact line exceeds 1024 bytes")
                while b"\n" in pending:
                    raw, _, remainder = pending.partition(b"\n")
                    pending = bytearray(remainder)
                    fact = normalized_fact(raw.rstrip(b"\r"))
                    if fact is None:
                        print("bridge: dropped invalid external fact", file=sys.stderr)
                        continue
                    allowed, reason = cue_allowed(fact, visual_gate)
                    if not allowed:
                        print("bridge: dropped %s; visual=%s "
                              "(cue facts require an observed night)" %
                              (fact_type(fact) or "cue", reason),
                              file=sys.stderr, flush=True)
                        continue
                    helper.sendall(fact)
                    forwarded += 1
                    if once:
                        return forwarded


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description=__doc__)
    command.add_argument("--socket", default=DEFAULT_SOCKET,
                         help="external fact publisher Unix socket")
    command.add_argument("--device-port", type=int, default=DEFAULT_DEVICE_PORT,
                         help="temporary Cue Helper device port")
    command.add_argument("--once", action="store_true",
                         help="forward one valid fact and exit")
    command.add_argument("--screenstate-timeout", type=float, default=0.8,
                         help="maximum seconds for the positive night screen gate")
    return command


def main() -> int:
    args = parser().parse_args()
    if not 1 <= args.device_port <= 65_535:
        parser().error("--device-port must be in 1..65535")
    if not 0.1 <= args.screenstate_timeout <= 5.0:
        parser().error("--screenstate-timeout must be 0.1..5.0 seconds")
    state = run(["adb", "get-state"])
    if state.returncode != 0 or state.stdout.strip() != "device":
        raise RuntimeError("ADB has no usable phone")
    host_port = open_forward(args.device_port)
    visual_gate = VisualGate(args.screenstate_timeout)
    print("BRIDGE host_port=%d device_port=%d" % (host_port, args.device_port),
          flush=True)
    try:
        while True:
            token = helper_token()
            if token is None:
                print("bridge: waiting for active video capture", file=sys.stderr,
                      flush=True)
                time.sleep(RETRY_SECONDS)
                continue
            try:
                count = forward_stream(host_port, token, args.socket, args.once,
                                       visual_gate)
                print("BRIDGE forwarded=%d" % count, flush=True)
                if args.once:
                    return 0
            except (ConnectionError, OSError, RuntimeError, ValueError) as error:
                print("bridge: %s; retrying" % error, file=sys.stderr, flush=True)
                time.sleep(RETRY_SECONDS)
    finally:
        remove_forward(host_port)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError) as error:
        print("bridge-audio-authority: %s" % error, file=sys.stderr)
        raise SystemExit(1)
