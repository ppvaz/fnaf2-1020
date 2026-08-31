#!/usr/bin/env python3
"""Phone-free checks for the ESP32 PCM transport and authority."""

import importlib.util
import json
import struct
import tempfile
from pathlib import Path
from types import SimpleNamespace


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "esp32_audio_authority", HERE / "esp32-audio-authority.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def packet(sequence=7, rate=44_100, payload=None, capture_us=1234):
    if payload is None:
        payload = struct.pack("<hhhh", 1000, -1000, 2000, -2000)
    header = MODULE.PCM_PACKET_HEADER.pack(
        MODULE.PCM_PACKET_MAGIC, MODULE.PCM_PACKET_VERSION, 2, 1, 0,
        rate, sequence, capture_us, len(payload), 0)
    return header + payload


valid = MODULE.parse_packet(packet())
assert valid is not None
assert valid["sequence"] == 7
assert valid["sample_rate_hz"] == 44_100
assert valid["t_capture_us"] == 1234
assert valid["payload"] == struct.pack("<hhhh", 1000, -1000, 2000, -2000)
assert MODULE.parse_packet(packet()[:-1]) is None
assert MODULE.parse_packet(b"bad") is None

resampler = MODULE.Resampler(44_100)
assert len(resampler.feed([1000] * 441)) in (39, 40)

with tempfile.TemporaryDirectory(prefix="fnaf2-esp32-authority-test-") as directory:
    raw = Path(directory) / "audio.raw"
    args = SimpleNamespace(
        socket=None, quiet=True, source=MODULE.DEFAULT_SOURCE,
        profile=MODULE.DEFAULT_PROFILE, model=None, shadow_cues=[],
        latency_min=0, latency_max=1000, raw_output=str(raw),
    )
    authority = MODULE.Esp32AudioAuthority(args)
    authority.raw_stream = raw.open("xb")
    authority.accept_packet(MODULE.parse_packet(packet(sequence=10)), 2_000_000_000)
    authority.accept_packet(MODULE.parse_packet(packet(sequence=12)), 2_001_000_000)
    authority.close()
    metadata = json.loads(Path(str(raw) + ".meta.json").read_text())
    assert metadata["transport"] == "esp32-udp-pcm-v1"
    assert metadata["sample_format"] == "s16le"
    assert metadata["packets"] == 2
    assert metadata["lost_packets"] == 1
    assert metadata["frames"] == 4
    assert metadata["status"] == "complete"

print("esp32 audio authority: packet contract, resampler, loss accounting, and metadata pass")
