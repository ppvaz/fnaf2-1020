#!/usr/bin/env python3
"""No-device regression for validate-overlay-qualification.py."""

import copy
import json
import subprocess
import sys
import tempfile
from pathlib import Path


HERE = Path(__file__).resolve().parent
TOOL = HERE / "validate-overlay-qualification.py"
PROFILE = "moto-g56-fnaf2-v207"


def record():
    return {
        "schema": "cue-helper-overlay-qualification-v1",
        "profileId": PROFILE,
        "targetPackage": "com.scottgames.fnaf2",
        "targetBuild": "26:2.0.7",
        "osApi": 36,
        "window": {
            "type": "TYPE_APPLICATION_OVERLAY",
            "flags": ["FLAG_NOT_FOCUSABLE", "FLAG_NOT_TOUCHABLE",
                      "FLAG_LAYOUT_IN_SCREEN"],
            "alpha": 0.75,
            "maximumObscuringOpacity": 0.8,
            "windowCount": 1,
        },
        "selfCapture": {
            "proof": "PLATFORM_EXCLUDES_OVERLAY",
            "hudOffFrame": "sha256:off-frame-001",
            "hudOnFrame": "sha256:on-frame-001",
            "protectedSamplesEqual": True,
            "screenIdentityUnaffected": True,
        },
        "touchMatrix": {
            "controls": ["mask", "leftVent", "rightVent", "flashlight",
                          "cameraMap", "cameraButtons"],
            "allDelivered": True,
            "overlayPresent": True,
            "otherOverlaysRemoved": True,
            "perControl": {
                control: {
                    "attempts": 3,
                    "delivered": 3,
                    "targetObserved": True,
                    "traceId": f"touch-trace-{control}-001",
                }
                for control in ["mask", "leftVent", "rightVent", "flashlight",
                                "cameraMap", "cameraButtons"]
            },
        },
        "latency": {
            "updateToDrawMs": {"p50": 3.0, "p95": 8.0, "p99": 12.0},
            "criticalCueToClearMs": {"p99": 20.0},
            "detectorDeltaMs": {"p50": 0.5, "p95": 2.0},
        },
        "resources": {
            "cpuPercent": {"median": 2.0, "p95": 5.0},
            "memoryMb": {"median": 24.0, "p95": 29.0},
            "thermal": "sha256:thermal-trace-001",
        },
        "lifecycle": {
            "rotation": "pass",
            "permissionRevocation": "pass",
            "captureStop": "pass",
            "targetHidden": "pass",
            "appSwitchLockUnlock": "pass",
        },
    }


def run(document, *extra):
    with tempfile.TemporaryDirectory(prefix="overlay-qualification-test-") as directory:
        path = Path(directory) / "record.json"
        path.write_text(json.dumps(document))
        return subprocess.run([sys.executable, str(TOOL), str(path), *extra],
                              capture_output=True, text=True)


def first_code(document, *extra):
    result = run(document, "--json", *extra)
    assert result.returncode == 1, (result.returncode, result.stdout, result.stderr)
    payload = json.loads(result.stdout)
    assert payload["ok"] is False and payload["failures"], payload
    return payload["failures"][0]["code"]


good = record()
result = run(good)
assert result.returncode == 0, (result.returncode, result.stdout, result.stderr)
assert "structurally valid" in result.stdout, result.stdout

bad = copy.deepcopy(good)
bad["window"]["alpha"] = bad["window"]["maximumObscuringOpacity"]
assert first_code(bad) == "touch-opacity-invalid"

bad = copy.deepcopy(good)
bad["window"]["alpha"] = 0.795
assert first_code(bad) == "touch-opacity-invalid"

bad = copy.deepcopy(good)
bad["touchMatrix"]["controls"] = bad["touchMatrix"]["controls"][:-1]
assert first_code(bad) == "touch-control-set"

bad = copy.deepcopy(good)
bad["touchMatrix"]["perControl"].pop("mask")
assert first_code(bad) == "touch-trial-set"

bad = copy.deepcopy(good)
bad["touchMatrix"]["perControl"]["mask"]["delivered"] = 2
assert first_code(bad) == "touch-trial-delivery"

bad = copy.deepcopy(good)
bad["touchMatrix"]["perControl"]["mask"]["targetObserved"] = False
assert first_code(bad) == "touch-trial-target"

bad = copy.deepcopy(good)
bad["touchMatrix"]["perControl"]["mask"]["traceId"] = "<retained trace>"
assert first_code(bad) == "touch-trial-evidence"

bad = copy.deepcopy(good)
bad["selfCapture"]["hudOnFrame"] = "<retained frame id>"
assert first_code(bad) == "retained-evidence-missing"

bad = copy.deepcopy(good)
bad["selfCapture"]["protectedSamplesEqual"] = False
assert first_code(bad) == "self-capture-changed"

bad = copy.deepcopy(good)
bad["lifecycle"]["targetHidden"] = "fail"
assert first_code(bad) == "lifecycle-failed"

bad = copy.deepcopy(good)
bad["targetBuild"] = "<installed version/build>"
assert first_code(bad) == "target-build-missing"

bad = copy.deepcopy(good)
bad["unexpected"] = True
assert first_code(bad) == "field-unknown"

assert first_code(good, "--profile", "other-profile") == "profile-mismatch"

print("overlay qualification: positive record plus opacity, per-control touch "
      "trials, evidence, self-capture, lifecycle, target-build, and profile refusals passed")
