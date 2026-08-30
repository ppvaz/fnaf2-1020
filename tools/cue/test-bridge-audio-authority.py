#!/usr/bin/env python3
"""Phone-free checks for the external fact bridge."""

import importlib.util
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "bridge_audio_authority", HERE / "bridge-audio-authority.py")
bridge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bridge)


def fact(state="OBSERVED"):
    value = {
        "schema": "fact-message-v1",
        "seq": 12,
        "type": "audio-route",
        "state": state,
        "confidence": 1.0,
        "source": "audio-authority",
        "calibrationProfile": "external-a2dp-v1",
        "t_received": 100,
        "latencyMin": 10,
        "latencyMax": 40,
    }
    if state == "OBSERVED":
        value["value"] = True
    else:
        value["reason"] = "receiver-disconnected"
    return json.dumps(value, separators=(",", ":")).encode("ascii")


observed = bridge.normalized_fact(fact())
assert observed is not None and observed.endswith(b"\n")
assert json.loads(observed) == json.loads(fact())

unknown = bridge.normalized_fact(fact("UNKNOWN"))
assert unknown is not None

for invalid in (
    b"{}",
    fact().replace(b"audio-route", b"audio route"),
    fact().replace(b'"confidence":1.0', b'"confidence":2.0'),
    fact().replace(b'"value":true', b'"value":[]'),
    fact("UNKNOWN").replace(b'"reason":"receiver-disconnected"', b'"reason":""'),
):
    assert bridge.normalized_fact(invalid) is None, invalid

print("audio bridge: fact validation and normalization pass")
