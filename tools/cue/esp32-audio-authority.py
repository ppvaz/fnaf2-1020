#!/usr/bin/env python3
"""External PCM authority for the ESP32 A2DP bench receiver.

The ESP32 is the phone's A2DP sink and sends decoded signed-16 stereo PCM in
bounded UDP datagrams over its private Wi-Fi AP. This adapter validates the
packet contract, counts sequence gaps, writes the received PCM outside the
repository, and publishes the same fact-message-v1 stream used by the
BlueALSA authority. Cue facts are shadow-only and are never commands.

The host must be connected to the ESP32 AP (``FNAF2-AUDIO``) before starting
this process. The phone does not need to join that AP; the fact bridge reaches
the Cue Helper over the authenticated adb-forwarded TCP link.
"""

from __future__ import annotations

import argparse
import importlib.util
import pathlib
import select
import socket
import struct
import sys
import time


HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[1]
BASE_PATH = HERE / "audio-authority.py"
SPEC = importlib.util.spec_from_file_location("fnaf2_audio_authority_base", BASE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("cannot load audio authority base")
BASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BASE)


PCM_PACKET_MAGIC = 0x46325043
PCM_PACKET_VERSION = 1
PCM_PACKET_HEADER = struct.Struct("<IBBBBIIQHH")
PCM_PACKET_MAX_BYTES = 1400
PCM_CHANNELS = 2
PCM_BYTES_PER_FRAME = 4
MODEL_RATE = BASE.MODEL_RATE
FACT_INTERVAL_MS = 1000
DEFAULT_PORT = 49710
DEFAULT_PROFILE = "g56-esp32-a2dp-v0-uncalibrated"
DEFAULT_SOURCE = "esp32-audio-authority"
DEFAULT_LATENCY_MIN_MS = 0
DEFAULT_LATENCY_MAX_MS = 1000


def parse_packet(datagram: bytes) -> dict | None:
    """Validate and unpack one ESP32 PCM datagram."""
    if len(datagram) < PCM_PACKET_HEADER.size:
        return None
    (magic, version, channels, sample_format, _reserved, sample_rate_hz,
     sequence, t_capture_us, payload_bytes, _reserved2) = \
        PCM_PACKET_HEADER.unpack_from(datagram)
    if magic != PCM_PACKET_MAGIC or version != PCM_PACKET_VERSION:
        return None
    if channels != PCM_CHANNELS or sample_format != 1:
        return None
    if sample_rate_hz not in (16000, 32000, 44100, 48000):
        return None
    if payload_bytes != len(datagram) - PCM_PACKET_HEADER.size:
        return None
    if payload_bytes == 0 or payload_bytes % PCM_BYTES_PER_FRAME:
        return None
    if len(datagram) > PCM_PACKET_MAX_BYTES:
        return None
    return {
        "sequence": sequence,
        "sample_rate_hz": sample_rate_hz,
        "t_capture_us": t_capture_us,
        "payload": datagram[PCM_PACKET_HEADER.size:],
    }


class Resampler:
    """Small stateful linear resampler from the negotiated rate to 4 kHz."""

    def __init__(self, sample_rate_hz: int):
        self.sample_rate_hz = 0
        self.step = 0.0
        self.buffer: list[float] = []
        self.position = 0.0
        self.configure(sample_rate_hz)

    def configure(self, sample_rate_hz: int) -> None:
        if sample_rate_hz not in (16000, 32000, 44100, 48000):
            raise ValueError("unsupported sample rate")
        self.sample_rate_hz = sample_rate_hz
        self.step = sample_rate_hz / float(MODEL_RATE)
        self.buffer.clear()
        self.position = 0.0

    def feed(self, samples: list[int]) -> list[int]:
        self.buffer.extend(samples)
        result: list[int] = []
        while self.position + 1.0 < len(self.buffer):
            index = int(self.position)
            fraction = self.position - index
            value = (self.buffer[index] * (1.0 - fraction)
                     + self.buffer[index + 1] * fraction)
            result.append(max(-32768, min(32767, round(value))))
            self.position += self.step
        consumed = int(self.position)
        if consumed:
            del self.buffer[:consumed]
            self.position -= consumed
        return result


class Esp32AudioAuthority:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.publisher = BASE.FactPublisher(
            args.socket, not args.quiet, args.source)
        self.profile = args.profile
        self.matcher = None
        if args.model:
            _profile, _digest, templates = BASE.parse_model(args.model)
            self.matcher = BASE.LiveMatcher(templates, args.shadow_cues)
        self.last_health_ms = -10**12
        self.route_ready = False
        self.total_frames = 0
        self.last_rms = 0.0
        self.last_peak = 0.0
        self.current_rate_hz: int | None = None
        self.resampler: Resampler | None = None
        self.last_sequence: int | None = None
        self.packets = 0
        self.invalid_packets = 0
        self.lost_packets = 0
        self.out_of_order_packets = 0
        self.first_packet_before_ns: int | None = None
        self.first_packet_after_ns: int | None = None
        self.first_capture_us: int | None = None
        self.raw_path = (pathlib.Path(args.raw_output).expanduser().resolve()
                         if args.raw_output else None)
        self.raw_stream = None
        self.raw_bytes = 0
        self.raw_nonzero_bytes = 0
        if self.raw_path is not None:
            if self.raw_path == REPO or REPO in self.raw_path.parents:
                raise ValueError(
                    "refusing to write game audio inside the repository")
            self.raw_path.parent.mkdir(parents=True, exist_ok=True)

    def emit_unknown(self, fact_type: str, reason: str) -> None:
        self.publisher.fact(
            fact_type, reason=reason, confidence=0.0, profile=self.profile,
            latency_min=self.args.latency_min,
            latency_max=self.args.latency_max)

    def emit_health(self, ready: bool, now_ms: int, reason: str | None = None) -> None:
        if now_ms - self.last_health_ms < FACT_INTERVAL_MS:
            return
        self.last_health_ms = now_ms
        if not ready:
            self.publisher.fact(
                "audio-route", reason=reason or "esp32-pcm-not-received",
                confidence=0.0, profile=self.profile,
                latency_min=self.args.latency_min,
                latency_max=self.args.latency_max)
            return
        self.publisher.fact(
            "audio-route", value=True, confidence=1.0, profile=self.profile,
            latency_min=self.args.latency_min,
            latency_max=self.args.latency_max)
        self.publisher.fact(
            "audio-rms", value=round(self.last_rms, 6), confidence=1.0,
            profile=self.profile, latency_min=self.args.latency_min,
            latency_max=self.args.latency_max)
        self.publisher.fact(
            "audio-peak", value=round(self.last_peak, 6), confidence=1.0,
            profile=self.profile, latency_min=self.args.latency_min,
            latency_max=self.args.latency_max)

    def accept_packet(self, packet: dict, received_ns: int) -> None:
        sequence = packet["sequence"]
        if self.last_sequence is not None:
            delta = (sequence - self.last_sequence) & 0xFFFF_FFFF
            if delta == 0 or delta > 0x8000_0000:
                self.out_of_order_packets += 1
                return
            if delta > 1:
                self.lost_packets += delta - 1
        self.last_sequence = sequence

        rate_hz = packet["sample_rate_hz"]
        if self.current_rate_hz != rate_hz:
            self.current_rate_hz = rate_hz
            self.resampler = Resampler(rate_hz)
        assert self.resampler is not None

        payload = packet["payload"]
        if self.raw_stream is not None:
            self.raw_stream.write(payload)
            self.raw_stream.flush()
            self.raw_bytes += len(payload)
            self.raw_nonzero_bytes += sum(1 for value in payload if value)

        mono: list[int] = []
        for offset in range(0, len(payload), PCM_BYTES_PER_FRAME):
            left, right = struct.unpack_from("<hh", payload, offset)
            mono.append((left + right) // 2)
        self.total_frames += len(mono)
        if mono:
            self.last_rms = (
                sum(value * value for value in mono) / len(mono)) ** 0.5 / 32768.0
            self.last_peak = max(abs(value) for value in mono) / 32768.0

        model_samples = self.resampler.feed(mono)
        now_ms = received_ns // 1_000_000
        self.route_ready = True
        self.emit_health(True, now_ms)
        self.packets += 1
        if self.first_packet_before_ns is None:
            self.first_packet_before_ns = received_ns
            self.first_packet_after_ns = received_ns
            self.first_capture_us = packet["t_capture_us"]
        if self.matcher:
            for cue, score, confidence in self.matcher.accept(model_samples, now_ms):
                fact_type = ("wind-tick" if cue in ("wind", "wind-tick", "winding")
                             else "cue-" + cue)
                self.publisher.fact(
                    fact_type, value=True, confidence=round(confidence, 6),
                    profile=self.profile, observed_ms=now_ms,
                    latency_min=self.args.latency_min,
                    latency_max=self.args.latency_max)

    def metadata(self) -> dict:
        return {
            "schema": "fnaf2-audio-authority-capture-v2",
            "transport": "esp32-udp-pcm-v1",
            "raw": str(self.raw_path) if self.raw_path else None,
            "sample_format": "s16le",
            "rate": self.current_rate_hz,
            "channels": PCM_CHANNELS,
            "bytes_per_frame": PCM_BYTES_PER_FRAME,
            "frames": self.raw_bytes // PCM_BYTES_PER_FRAME,
            "bytes": self.raw_bytes,
            "nonzero_fraction": self.raw_nonzero_bytes / float(max(1, self.raw_bytes)),
            "packets": self.packets,
            "invalid_packets": self.invalid_packets,
            "lost_packets": self.lost_packets,
            "out_of_order_packets": self.out_of_order_packets,
            "first_capture_us": self.first_capture_us,
            "first_packet_before_ns": self.first_packet_before_ns,
            "first_packet_after_ns": self.first_packet_after_ns,
            "sample_zero_host_ns_estimate": self.first_packet_before_ns,
            "sample_zero_uncertainty_ms": 0.0,
            "status": "complete" if self.raw_bytes else "error",
        }

    def close(self) -> None:
        if self.raw_stream is not None:
            self.raw_stream.close()
            metadata_path = pathlib.Path(str(self.raw_path) + ".meta.json")
            metadata_path.write_text(
                BASE.json_dumps(self.metadata()) + "\n", encoding="utf-8")
        self.publisher.close()

    def run(self) -> int:
        receiver = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        receiver.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 1 << 20)
        receiver.bind((self.args.bind, self.args.port))
        receiver.setblocking(False)
        if self.raw_path is not None:
            self.raw_stream = self.raw_path.open("xb")
        try:
            self.publisher.start()
            while True:
                now_ms = time.monotonic_ns() // 1_000_000
                if not self.route_ready:
                    self.emit_health(False, now_ms)
                readable, _writable, _exceptional = select.select(
                    [receiver] + self.publisher.sockets(), [], [], 0.25)
                self.publisher.accept(readable)
                if receiver not in readable:
                    continue
                while True:
                    before_ns = time.monotonic_ns()
                    try:
                        datagram, address = receiver.recvfrom(PCM_PACKET_MAX_BYTES + 64)
                    except BlockingIOError:
                        break
                    after_ns = time.monotonic_ns()
                    if self.args.source_ip and address[0] != self.args.source_ip:
                        self.invalid_packets += 1
                        continue
                    packet = parse_packet(datagram)
                    if packet is None:
                        self.invalid_packets += 1
                        continue
                    if self.first_packet_before_ns is None:
                        self.first_packet_before_ns = before_ns
                        self.first_packet_after_ns = after_ns
                        self.first_capture_us = packet["t_capture_us"]
                    self.accept_packet(packet, after_ns)
                    if self.args.once:
                        return 0
        finally:
            receiver.close()
            self.close()


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--source-ip",
                        help="accept PCM only from this ESP32 AP address")
    parser.add_argument("--socket", help="Unix stream socket for fact messages")
    parser.add_argument("--model", help="cue-model-v1 for shadow detection")
    parser.add_argument("--shadow-cue", action="append", dest="shadow_cues", default=[])
    parser.add_argument("--profile", default=DEFAULT_PROFILE)
    parser.add_argument("--source", default=DEFAULT_SOURCE)
    parser.add_argument("--latency-min", type=int, default=DEFAULT_LATENCY_MIN_MS)
    parser.add_argument("--latency-max", type=int, default=DEFAULT_LATENCY_MAX_MS)
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--raw-output")
    args = parser.parse_args()
    if not 0 <= args.latency_min <= args.latency_max:
        parser.error("latency bounds must be ordered and non-negative")
    if args.quiet and not args.socket:
        parser.error("--quiet requires --socket")
    if not 1 <= args.port <= 65535:
        parser.error("--port must be in 1..65535")
    return args


def main() -> int:
    args = arguments()
    try:
        return Esp32AudioAuthority(args).run()
    except (OSError, RuntimeError, ValueError) as error:
        print("esp32-audio-authority: %s" % error, file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
