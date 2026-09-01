#!/usr/bin/env python3
"""Validate retained device evidence for the Plan 23 overlay qualification.

    validate-overlay-qualification.py RECORD.json [--profile PROFILE] [--json]

This is a record-shape and consistency gate, not a substitute for running the
test on a Moto g56. It refuses an apparently complete record when it contains
placeholders, missing touch controls, an unsafe alpha, changed protected
samples, or an incomplete lifecycle/resource trace.

Exit status: 0 valid record, 1 validation failure, 2 usage or I/O error.
"""

import argparse
import json
import math
import re
import sys
from pathlib import Path


SCHEMA = "cue-helper-overlay-qualification-v1"
DEFAULT_PROFILE = "moto-g56-fnaf2-v207"
TARGET_PACKAGE = "com.scottgames.fnaf2"
MIN_OPACITY_MARGIN = 0.01
PROOFS = {
    "PLATFORM_EXCLUDES_OVERLAY",
    "OUTSIDE_PROTECTED_REGIONS",
    "PHASE_SEPARATED",
}
FLAGS = {
    "FLAG_NOT_FOCUSABLE",
    "FLAG_NOT_TOUCHABLE",
    "FLAG_LAYOUT_IN_SCREEN",
}
CONTROLS = {
    "mask",
    "leftVent",
    "rightVent",
    "flashlight",
    "cameraMap",
    "cameraButtons",
}
LIFECYCLE = {
    "rotation",
    "permissionRevocation",
    "captureStop",
    "targetHidden",
    "appSwitchLockUnlock",
}
TOP_LEVEL = {
    "schema", "profileId", "targetPackage", "targetBuild", "osApi",
    "window", "selfCapture", "touchMatrix", "latency", "resources",
    "lifecycle",
}
WINDOW_FIELDS = {"type", "flags", "alpha", "maximumObscuringOpacity", "windowCount"}
SELF_CAPTURE_FIELDS = {
    "proof", "hudOffFrame", "hudOnFrame", "protectedSamplesEqual",
    "screenIdentityUnaffected",
}
TOUCH_FIELDS = {
    "controls", "allDelivered", "overlayPresent", "otherOverlaysRemoved", "perControl"
}
TOUCH_TRIAL_FIELDS = {"attempts", "delivered", "targetObserved", "traceId"}
LATENCY_FIELDS = {"updateToDrawMs", "criticalCueToClearMs", "detectorDeltaMs"}
RESOURCES_FIELDS = {"cpuPercent", "memoryMb", "thermal"}
PERCENTILE_FIELDS = {"p50", "p95", "p99"}
DELTA_FIELDS = {"p50", "p95"}
LIFECYCLE_FIELDS = LIFECYCLE


class Failures:
    def __init__(self):
        self.rows = []

    def add(self, code, detail):
        self.rows.append({"code": code, "detail": detail})

    def __bool__(self):
        return bool(self.rows)


def is_number(value):
    return (isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value))


def placeholder(value):
    if not isinstance(value, str) or not value.strip():
        return True
    text = value.strip().lower()
    return (text.startswith("<") or text.endswith(">")
            or text in {"todo", "tbd", "unknown", "null", "none"})


def required_object(document, key, failures):
    value = document.get(key)
    if not isinstance(value, dict):
        failures.add("field-invalid", f"{key}: expected an object")
        return {}
    return value


def require_fields(document, fields, where, failures):
    for field in fields:
        if field not in document:
            failures.add("field-missing", f"{where}: missing '{field}'")


def reject_unknown_fields(document, fields, where, failures):
    for field in document:
        if field not in fields:
            failures.add("field-unknown", f"{where}: unknown field '{field}'")


def ordered_numbers(document, fields, where, failures):
    values = []
    for field in fields:
        value = document.get(field)
        if not is_number(value) or value < 0:
            failures.add("metric-invalid", f"{where}.{field}: expected a non-negative number")
        else:
            values.append(value)
    if len(values) == len(fields) and values != sorted(values):
        failures.add("metric-order", f"{where}: values must be non-decreasing ({fields})")


def validate(document, expected_profile):
    failures = Failures()
    if not isinstance(document, dict):
        failures.add("record-invalid", "record must be a JSON object")
        return failures
    reject_unknown_fields(document, TOP_LEVEL, "record", failures)

    if document.get("schema") != SCHEMA:
        failures.add("schema-mismatch",
                     f"record declares {document.get('schema')!r}, expected {SCHEMA!r}")
    if document.get("profileId") != expected_profile:
        failures.add("profile-mismatch",
                     f"record profileId {document.get('profileId')!r} does not match "
                     f"expected {expected_profile!r}")
    if document.get("targetPackage") != TARGET_PACKAGE:
        failures.add("target-package-mismatch",
                     f"targetPackage must be {TARGET_PACKAGE!r}")
    if placeholder(document.get("targetBuild")):
        failures.add("target-build-missing", "targetBuild must identify the installed build")
    elif not re.fullmatch(r"[0-9]+:[^\s]+", document["targetBuild"]):
        failures.add("target-build-invalid",
                     "targetBuild must use versionCode:versionName")
    if not isinstance(document.get("osApi"), int) or document["osApi"] < 31:
        failures.add("os-api-invalid", "osApi must be an Android 12+ integer")

    window = required_object(document, "window", failures)
    reject_unknown_fields(window, WINDOW_FIELDS, "window", failures)
    require_fields(window, {"type", "flags", "alpha", "maximumObscuringOpacity",
                            "windowCount"}, "window", failures)
    if window.get("type") != "TYPE_APPLICATION_OVERLAY":
        failures.add("window-type-invalid", "window.type must be TYPE_APPLICATION_OVERLAY")
    flags = window.get("flags")
    if not isinstance(flags, list) or set(flags) != FLAGS or len(flags) != len(FLAGS):
        failures.add("window-flags-invalid",
                     "window.flags must contain exactly the three non-interactive flags")
    if window.get("windowCount") != 1:
        failures.add("window-count-invalid", "qualification requires exactly one overlay window")
    alpha = window.get("alpha")
    maximum = window.get("maximumObscuringOpacity")
    if (not is_number(alpha) or not is_number(maximum) or not (0 <= alpha <= 1)
            or not (0 < maximum <= 1)
            or alpha > maximum - MIN_OPACITY_MARGIN):
        failures.add("touch-opacity-invalid",
                     "window.alpha must stay at least 0.01 below the queried maximum")

    self_capture = required_object(document, "selfCapture", failures)
    reject_unknown_fields(self_capture, SELF_CAPTURE_FIELDS, "selfCapture", failures)
    require_fields(self_capture, {"proof", "hudOffFrame", "hudOnFrame",
                                  "protectedSamplesEqual", "screenIdentityUnaffected"},
                   "selfCapture", failures)
    if self_capture.get("proof") not in PROOFS:
        failures.add("self-capture-proof", "selfCapture.proof is not an accepted proof")
    for key in ("hudOffFrame", "hudOnFrame"):
        if placeholder(self_capture.get(key)):
            failures.add("retained-evidence-missing",
                         f"selfCapture.{key} must be a retained frame id or hash")
    if self_capture.get("protectedSamplesEqual") is not True:
        failures.add("self-capture-changed",
                     "protected HUD-off/HUD-on samples did not remain equal")
    if self_capture.get("screenIdentityUnaffected") is not True:
        failures.add("screen-identity-changed",
                     "screen identity was not proven unaffected by the HUD")

    touch = required_object(document, "touchMatrix", failures)
    reject_unknown_fields(touch, TOUCH_FIELDS, "touchMatrix", failures)
    require_fields(touch, {"controls", "allDelivered", "overlayPresent",
                           "otherOverlaysRemoved", "perControl"}, "touchMatrix", failures)
    controls = touch.get("controls")
    if (not isinstance(controls, list) or set(controls) != CONTROLS
            or len(controls) != len(CONTROLS)):
        failures.add("touch-control-set",
                     "touchMatrix.controls must cover each required FNaF control exactly once")
    for key in ("allDelivered", "overlayPresent", "otherOverlaysRemoved"):
        if touch.get(key) is not True:
            failures.add("touch-proof-missing", f"touchMatrix.{key} must be true")

    per_control = required_object(touch, "perControl", failures)
    reject_unknown_fields(per_control, CONTROLS, "touchMatrix.perControl", failures)
    if set(per_control) != CONTROLS or len(per_control) != len(CONTROLS):
        failures.add("touch-trial-set",
                     "touchMatrix.perControl must contain one retained trial record per control")
    every_delivered = True
    for control in CONTROLS:
        trial = per_control.get(control)
        if not isinstance(trial, dict):
            failures.add("touch-trial-invalid",
                         f"touchMatrix.perControl.{control} must be an object")
            every_delivered = False
            continue
        reject_unknown_fields(trial, TOUCH_TRIAL_FIELDS,
                              f"touchMatrix.perControl.{control}", failures)
        require_fields(trial, TOUCH_TRIAL_FIELDS,
                       f"touchMatrix.perControl.{control}", failures)
        attempts = trial.get("attempts")
        delivered = trial.get("delivered")
        valid_attempts = (isinstance(attempts, int) and not isinstance(attempts, bool)
                          and attempts > 0)
        valid_delivered = (isinstance(delivered, int) and not isinstance(delivered, bool)
                           and delivered >= 0 and valid_attempts
                           and delivered <= attempts)
        if not valid_attempts or not valid_delivered:
            failures.add("touch-trial-count",
                         f"touchMatrix.perControl.{control} needs valid attempts/delivered counts")
            every_delivered = False
        elif delivered != attempts:
            failures.add("touch-trial-delivery",
                         f"touchMatrix.perControl.{control} did not deliver every attempted touch")
            every_delivered = False
        if trial.get("targetObserved") is not True:
            failures.add("touch-trial-target",
                         f"touchMatrix.perControl.{control} lacks target-observed proof")
            every_delivered = False
        if placeholder(trial.get("traceId")):
            failures.add("touch-trial-evidence",
                         f"touchMatrix.perControl.{control}.traceId must identify retained evidence")
            every_delivered = False
    if touch.get("allDelivered") is True and not every_delivered:
        failures.add("touch-summary-inconsistent",
                     "touchMatrix.allDelivered disagrees with per-control trial records")

    latency = required_object(document, "latency", failures)
    reject_unknown_fields(latency, LATENCY_FIELDS, "latency", failures)
    update = required_object(latency, "updateToDrawMs", failures)
    reject_unknown_fields(update, PERCENTILE_FIELDS, "latency.updateToDrawMs", failures)
    require_fields(update, {"p50", "p95", "p99"}, "latency.updateToDrawMs", failures)
    ordered_numbers(update, ("p50", "p95", "p99"), "latency.updateToDrawMs", failures)
    critical = required_object(latency, "criticalCueToClearMs", failures)
    reject_unknown_fields(critical, {"p99"}, "latency.criticalCueToClearMs", failures)
    require_fields(critical, {"p99"}, "latency.criticalCueToClearMs", failures)
    ordered_numbers(critical, ("p99",), "latency.criticalCueToClearMs", failures)
    delta = required_object(latency, "detectorDeltaMs", failures)
    reject_unknown_fields(delta, DELTA_FIELDS, "latency.detectorDeltaMs", failures)
    require_fields(delta, {"p50", "p95"}, "latency.detectorDeltaMs", failures)
    for key in ("p50", "p95"):
        if not is_number(delta.get(key)):
            failures.add("metric-invalid", f"latency.detectorDeltaMs.{key}: expected a number")

    resources = required_object(document, "resources", failures)
    reject_unknown_fields(resources, RESOURCES_FIELDS, "resources", failures)
    for group_name in ("cpuPercent", "memoryMb"):
        group = required_object(resources, group_name, failures)
        reject_unknown_fields(group, {"median", "p95"}, f"resources.{group_name}", failures)
        require_fields(group, {"median", "p95"}, f"resources.{group_name}", failures)
        ordered_numbers(group, ("median", "p95"), f"resources.{group_name}", failures)
    if placeholder(resources.get("thermal")):
        failures.add("resource-trace-missing", "resources.thermal must identify a retained trace")

    lifecycle = required_object(document, "lifecycle", failures)
    reject_unknown_fields(lifecycle, LIFECYCLE_FIELDS, "lifecycle", failures)
    require_fields(lifecycle, LIFECYCLE, "lifecycle", failures)
    for key in LIFECYCLE:
        if lifecycle.get(key) != "pass":
            failures.add("lifecycle-failed", f"lifecycle.{key} must be 'pass'")

    return failures


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("record", type=Path)
    parser.add_argument("--profile", default=DEFAULT_PROFILE)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        document = json.loads(args.record.read_text())
    except (OSError, json.JSONDecodeError) as error:
        print(f"cannot read {args.record}: {error}", file=sys.stderr)
        raise SystemExit(2)

    failures = validate(document, args.profile)
    if args.json:
        print(json.dumps({
            "record": str(args.record),
            "profile": args.profile,
            "ok": not failures,
            "failures": failures.rows,
        }, indent=2))
    elif failures:
        print(f"{args.record.name}: {len(failures.rows)} failure(s)", file=sys.stderr)
        for row in failures.rows:
            print(f"FAIL {row['code']}: {row['detail']}", file=sys.stderr)
    else:
        print(f"{args.record.name}: overlay qualification record is structurally valid "
              f"for {args.profile}; device evidence remains required")
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
