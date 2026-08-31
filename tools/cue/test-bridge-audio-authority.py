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


def cue_line(name="cue-bang"):
    value = json.loads(fact())
    value["type"] = name
    value["value"] = True
    return bridge.normalized_fact(
        json.dumps(value, separators=(",", ":")).encode("ascii"))


class FakeVisualGate:
    def __init__(self, state):
        self._state = state
        self.calls = 0

    def state(self):
        self.calls += 1
        return self._state


# Audio health is useful on every screen, but a cue is only usable with a
# positive office observation. Menu and unknown are both safe refusals; neither
# can let title-screen BGM through as a cue-bang.
bang = cue_line()
assert bang is not None and bridge.is_cue_fact(bang)
menu_gate = FakeVisualGate("other")
assert bridge.cue_allowed(bang, menu_gate) == (False, "other")
assert menu_gate.calls == 1
night_gate = FakeVisualGate("night")
assert bridge.cue_allowed(bang, night_gate) == (True, "night")
assert bridge.cue_allowed(observed, night_gate) == (True, "not-a-cue")
assert bridge.cue_allowed(bang, None) == (False, "unknown(no-visual-gate)")
assert bridge.cue_allowed(cue_line("wind-tick"), FakeVisualGate("gameover")) == \
    (False, "gameover")

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
