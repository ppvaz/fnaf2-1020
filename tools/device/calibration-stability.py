#!/usr/bin/env python3
"""Aggregate independent mask/monitor seam grades into a fail-closed verdict.

``maskraise-grade.py`` answers one recording.  This tool answers the question
that a calibration actually needs: which gap survives repeated *independent*
recordings without a dropped control or an invalid/desynchronised trial.

Every input is one ``maskraise-grade-v2`` JSON result (v1 is readable but cannot
qualify). A gap is never credited
from an invalid trial, and a single false landing disqualifies that gap.  The
Independent-run Wilson lower bound is printed as context and can be required with
``--min-lcb``; it prevents a short perfect run from being promoted as a stable
device rule. Results with unverified timing/preconditions, duplicate captures,
or different modes, rates, stream/profile/grader bindings cannot qualify.

Usage:

    calibration-stability.py --mode compound --min-runs 3 \
        --min-samples 16 --min-lcb 0.80 captures/*.grade.json

Exit status is 0 only when a recommended gap meets every requirement.  The
JSON report is suitable for retaining beside the input grades with
``--json-out``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import pathlib
import re
import sys
from collections import defaultdict


SCHEMAS = {"maskraise-grade-v1", "maskraise-grade-v2"}
MODES = {"hall", "monitor", "compound"}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, allow_nan=False).encode()).hexdigest()


def evidence_refusals(payload, max_sync_uncertainty_ms=1.0):
    reasons = []
    if payload.get("schema") != "maskraise-grade-v2" or payload.get("calibration_eligible") is not True:
        reasons.append("exploratory-or-legacy-grade")
    sync = payload.get("sync", {})
    uncertainty = sync.get("uncertainty_ms")
    if (sync.get("status") != "VERIFIED" or isinstance(uncertainty, bool)
            or not isinstance(uncertainty, (float, int))
            or not math.isfinite(uncertainty) or not 0 <= uncertainty <= max_sync_uncertainty_ms):
        reasons.append("clock-mapping-unverified")
    provenance = payload.get("provenance", {})
    for key in ("capture_sha256", "stream_sha256", "profile_sha256", "grader_sha256"):
        if not re.fullmatch(r"[a-f0-9]{64}", str(provenance.get(key, ""))):
            reasons.append(f"missing-{key}")
    return reasons


def wilson_lower(successes: int, samples: int, z: float = 1.96) -> float | None:
    """Return the two-sided 95% Wilson lower bound for a binomial rate."""
    if samples <= 0:
        return None
    p = successes / samples
    z2 = z * z
    denominator = 1.0 + z2 / samples
    centre = p + z2 / (2.0 * samples)
    spread = z * math.sqrt(p * (1.0 - p) / samples + z2 / (4.0 * samples * samples))
    return (centre - spread) / denominator


def load_result(path: pathlib.Path) -> dict:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"{path}: cannot read grade JSON: {error}") from error
    if payload.get("schema") not in SCHEMAS:
        raise ValueError(f"{path}: expected a maskraise-grade-v1/v2 result")
    mode = payload.get("mode")
    if mode not in MODES:
        raise ValueError(f"{path}: unsupported grade mode {mode!r}")
    if not isinstance(payload.get("fps"), int) or payload["fps"] <= 0:
        raise ValueError(f"{path}: grade has no positive integer fps")
    trials = payload.get("trials")
    if not isinstance(trials, list) or not trials:
        raise ValueError(f"{path}: grade has no trials")
    indices = set()
    for index, trial in enumerate(trials):
        if not isinstance(trial, dict) or type(trial.get("gap_ms")) is not int or trial["gap_ms"] <= 0:
            raise ValueError(f"{path}: trial {index} has no integer gap_ms")
        if type(trial.get("index")) is not int or trial["index"] in indices:
            raise ValueError(f"{path}: missing or duplicate trial index")
        indices.add(trial["index"])
        if trial.get("valid") is True and not isinstance(trial.get("landed"), bool):
            raise ValueError(f"{path}: valid trial {index} must have boolean landed")
        primary = "monitor" if mode == "compound" else mode
        primary_landed = trial.get("controls", {}).get(primary)
        if type(primary_landed) is bool and primary_landed is not trial.get("landed"):
            raise ValueError(f"{path}: contradictory landed/control result in trial {index}")
    return payload


def assess(results: list[tuple[pathlib.Path, dict]], min_runs: int,
           min_samples: int, min_lcb: float, mode: str | None,
           max_sync_uncertainty_ms: float = 1.0) -> dict:
    if not results:
        raise ValueError("at least one grade JSON is required")
    modes = {payload["mode"] for _, payload in results}
    if mode is not None and modes != {mode}:
        raise ValueError(f"requested mode {mode!r}, inputs contain {sorted(modes)!r}")
    if len(modes) != 1:
        raise ValueError(f"cannot pool different modes: {sorted(modes)!r}")
    fps = {payload["fps"] for _, payload in results}
    if len(fps) != 1:
        raise ValueError(f"cannot pool different capture rates: {sorted(fps)!r}")

    # Same capture under different filenames is still ONE experiment. Binding
    # the whole stream is conservative: contact/hold/phase variants cannot be
    # pooled accidentally while claiming to measure only the seam gap.
    identities = set()
    bindings = set()
    input_refusals = []
    for path, payload in results:
        provenance = payload.get("provenance", {})
        identity = provenance.get("capture_sha256") or payload.get("video") or digest(payload)
        if identity in identities:
            raise ValueError(f"duplicate capture: {path}")
        identities.add(identity)
        if not evidence_refusals(payload, max_sync_uncertainty_ms):
            bindings.add(tuple(provenance[key] for key in ("stream_sha256", "profile_sha256", "grader_sha256")))
        input_refusals.append({"path": str(path), "reasons": evidence_refusals(payload, max_sync_uncertainty_ms)})
    if len(bindings) > 1:
        raise ValueError("cannot pool different stream/profile/grader bindings")

    by_gap: dict[int, list[dict]] = defaultdict(list)
    for path, payload in results:
        run_id = payload.get("provenance", {}).get("capture_sha256") or payload.get("video") or digest(payload)
        run_qualified = not evidence_refusals(payload, max_sync_uncertainty_ms)
        required = {"hall", "monitor"} if payload["mode"] == "compound" else {payload["mode"]}
        for trial in payload["trials"]:
            controls = trial.get("controls", {})
            controls_known = all(type(controls.get(control)) is bool for control in required)
            valid = (run_qualified and trial.get("valid") is True
                     and trial.get("precondition") == "VERIFIED" and controls_known)
            by_gap[trial["gap_ms"]].append({
                "run": run_id,
                "path": str(path),
                "valid": valid,
                "landed": all(controls[control] for control in required) if controls_known else None,
                "index": trial.get("index"),
                "note": trial.get("note"),
            })

    gaps = []
    for gap in sorted(by_gap):
        samples = by_gap[gap]
        runs: dict[str, list[dict]] = defaultdict(list)
        for sample in samples:
            runs[sample["run"]].append(sample)
        complete_runs = 0
        pass_runs = 0
        invalid_runs = 0
        successes = 0
        valid_samples = 0
        invalid_samples = 0
        failures = 0
        for run_samples in runs.values():
            complete = all(sample["valid"] for sample in run_samples)
            if complete:
                complete_runs += 1
            else:
                invalid_runs += 1
            if complete and all(sample["landed"] is True for sample in run_samples):
                pass_runs += 1
            for sample in run_samples:
                if not sample["valid"]:
                    invalid_samples += 1
                elif sample["landed"] is True:
                    successes += 1
                    valid_samples += 1
                else:
                    failures += 1
                    valid_samples += 1

        # Trials in one run share clocks/state. Do not pretend they are IID
        # and multiply confidence by copying or lengthening one successful run.
        lcb = wilson_lower(pass_runs, len(runs))
        reasons = []
        if len(runs) < min_runs:
            reasons.append(f"only {len(runs)}/{min_runs} independent runs")
        if valid_samples < min_samples:
            reasons.append(f"only {valid_samples}/{min_samples} valid samples")
        if invalid_samples:
            reasons.append(f"{invalid_samples} invalid sample(s)")
        if failures:
            reasons.append(f"{failures} landed=false sample(s)")
        if lcb is None or lcb < min_lcb:
            shown = "none" if lcb is None else f"{lcb:.3f}"
            reasons.append(f"independent-run Wilson lower bound {shown} < {min_lcb:.3f}")
        accepted = not reasons
        gaps.append({
            "gap_ms": gap,
            "runs": len(runs),
            "complete_runs": complete_runs,
            "pass_runs": pass_runs,
            "invalid_runs": invalid_runs,
            "successes": successes,
            "valid_samples": valid_samples,
            "invalid_samples": invalid_samples,
            "failures": failures,
            "landing_rate": successes / valid_samples if valid_samples else None,
            "wilson_lower_95": lcb,
            "wilson_unit": "independent-capture-run",
            "status": "PASS" if accepted else ("FAIL" if failures or invalid_samples else "INSUFFICIENT"),
            "reasons": reasons,
        })

    accepted = [entry for entry in gaps if entry["status"] == "PASS"]
    recommendation = min(accepted, key=lambda entry: entry["gap_ms"]) if accepted else None
    report = {
        "schema": "calibration-stability-v2",
        "mode": next(iter(modes)),
        "fps": next(iter(fps)),
        "inputs": [str(path) for path, _ in results],
        "input_artifacts": [{"path": str(path), "grade_sha256": digest(payload),
                             "evidenceId": payload.get("evidenceId"),
                             "provenance": payload.get("provenance"),
                             "sync": payload.get("sync"), "trials": payload["trials"]}
                            for path, payload in results],
        "input_refusals": input_refusals,
        "requirements": {
            "min_runs": min_runs,
            "min_samples": min_samples,
            "min_wilson_lower_95": min_lcb,
            "max_sync_uncertainty_ms": max_sync_uncertainty_ms,
            "no_invalid_or_failed_samples": True,
        },
        "by_gap": gaps,
        "recommendation": {
            "gap_ms": recommendation["gap_ms"],
            "status": "PASS",
            "basis": "earliest gap satisfying every stability requirement",
        } if recommendation else None,
        "status": "PASS" if recommendation else "REFUSED",
    }
    report["evidenceId"] = "calibration-stability-" + digest({
        "requirements": report["requirements"],
        "grades": [digest(payload) for _, payload in results],
        "assessor": hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
    })[:20]
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("grades", nargs="+", type=pathlib.Path)
    parser.add_argument("--mode", choices=sorted(MODES))
    parser.add_argument("--min-runs", type=int, default=3)
    parser.add_argument("--min-samples", type=int, default=12)
    parser.add_argument("--min-lcb", type=float, default=0.80,
                        help="minimum Wilson lower bound (default: 0.80)")
    parser.add_argument("--json-out", type=pathlib.Path)
    parser.add_argument("--max-sync-uncertainty-ms", type=float, default=1.0,
                        help="qualification requirement, not a measured clock value (default: 1 ms)")
    args = parser.parse_args()
    if args.min_runs <= 0 or args.min_samples <= 0:
        parser.error("--min-runs and --min-samples must be positive")
    if not 0.0 <= args.min_lcb <= 1.0:
        parser.error("--min-lcb must be between 0 and 1")
    if not math.isfinite(args.max_sync_uncertainty_ms) or args.max_sync_uncertainty_ms < 0:
        parser.error("--max-sync-uncertainty-ms must be finite and non-negative")
    try:
        results = [(path, load_result(path)) for path in args.grades]
        report = assess(results, args.min_runs, args.min_samples, args.min_lcb, args.mode,
                        args.max_sync_uncertainty_ms)
    except ValueError as error:
        print(f"calibration-stability: {error}", file=sys.stderr)
        return 2

    encoded = json.dumps(report, indent=2, sort_keys=True) + "\n"
    print(encoded, end="")
    if args.json_out:
        try:
            args.json_out.write_text(encoded, encoding="utf-8")
        except OSError as error:
            print(f"calibration-stability: cannot write {args.json_out}: {error}", file=sys.stderr)
            return 2
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
