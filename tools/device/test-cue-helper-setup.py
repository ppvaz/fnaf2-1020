#!/usr/bin/env python3
"""No-device safety regression for cue-helper-setup.py."""

from __future__ import annotations

import importlib.util
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("cue_helper_setup", HERE / "cue-helper-setup.py")
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


XML = """
<hierarchy>
  <node index="0" package="com.fnaf2.cuehelper" class="android.widget.Button"
        text="Start video capture" clickable="true" enabled="true"
        bounds="[49,1306][1031,1423]" />
  <node index="1" package="com.scottgames.fnaf2" class="android.widget.Button"
        text="Start video capture" clickable="true" enabled="true"
        bounds="[0,0][100,100]" />
  <node index="2" package="com.fnaf2.cuehelper" class="android.widget.TextView"
        text="Share screen" clickable="true" enabled="true"
        bounds="[550,1457][1002,1574]" />
</hierarchy>
"""

root = MODULE.parse_ui(XML)
assert MODULE.node_center(root, "Start video capture", "helper") == (540, 1364)
assert MODULE.node_center(root, "Start video capture", "system") is None
assert MODULE.node_center(root, "Share screen", "helper") is None
assert MODULE.node_center(root, "Share screen", "system") is None
assert MODULE.node_center(root, "missing", "helper") is None
assert MODULE.overlay_suppression_status(
    "requested permissions:\n      android.permission.ACCESS_NETWORK_STATE\n") == "NOT_REQUESTED"
assert MODULE.overlay_suppression_status(
    "requested permissions:\n      android.permission.HIDE_NON_SYSTEM_OVERLAY_WINDOWS\n") == "REQUESTED_UNSUPPORTED"
original_adb = MODULE.adb
try:
    MODULE.adb = lambda *args, **kwargs: (
        "Media Projection: (com.fnaf2.cuehelper, uid=10351): TYPE_SCREEN_CAPTURE"
        if args == ("shell", "dumpsys", "media_projection") else ""
    )
    assert MODULE.projection_active() is True
    MODULE.adb = lambda *args, **kwargs: "Media Projection: \nnull"
    assert MODULE.projection_active() is False
finally:
    MODULE.adb = original_adb
print("cue-helper setup parser and tap boundary passed")
