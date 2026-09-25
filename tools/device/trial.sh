#!/usr/bin/env bash
# Compatibility launcher for a validated device bundle (artifact-runner.mjs);
# with no bundle it runs the fixture dry-run. The historical shell runner it
# used to hand FNAF2_LEGACY_TRIAL=1 to was archived on 2026-09-25 (Plan 22 P9,
# docs/ARCHIVED-ROUTES.md). Live nights go through night-run.sh.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

ARTIFACT=""
DRY_RUN=0
LIVE=0
CONFIRM_LIVE=0
QUALIFICATION=""
EXECUTOR=""
ARTIFACT_NIGHT=""
while (($#)); do
  case "$1" in
    --artifact)
      [ "$#" -ge 2 ] || { echo "trial.sh: --artifact needs a directory" >&2; exit 2; }
      ARTIFACT=$2; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --live) LIVE=1; shift ;;
    --confirm-live) CONFIRM_LIVE=1; shift ;;
    --qualification)
      [ "$#" -ge 2 ] || { echo "trial.sh: --qualification needs a file" >&2; exit 2; }
      QUALIFICATION=$2; shift 2 ;;
    --executor)
      [ "$#" -ge 2 ] || { echo "trial.sh: --executor needs a module path" >&2; exit 2; }
      EXECUTOR=$2; shift 2 ;;
    --executor=*) EXECUTOR=${1#*=}; shift ;;
    --night)
      [ "$#" -ge 2 ] || { echo "trial.sh: --night needs a number" >&2; exit 2; }
      ARTIFACT_NIGHT=$2; shift 2 ;;
    --night=*) ARTIFACT_NIGHT=${1#*=}; shift ;;
    *) echo "trial.sh: unknown option $1" >&2; exit 2 ;;
  esac
done

if [ -n "$ARTIFACT" ]; then
  [ $((DRY_RUN + LIVE)) -eq 1 ] || {
    echo "trial.sh: choose exactly one of --dry-run or --live" >&2; exit 2;
  }
  artifact_args=("$ROOT/tools/device/artifact-runner.mjs" --artifact "$ARTIFACT")
  [ "$DRY_RUN" -eq 0 ] || artifact_args+=(--dry-run)
  [ "$LIVE" -eq 0 ] || artifact_args+=(--live)
  [ "$CONFIRM_LIVE" -eq 0 ] || artifact_args+=(--confirm-live)
  [ -z "$QUALIFICATION" ] || artifact_args+=(--qualification "$QUALIFICATION")
  [ -z "$EXECUTOR" ] || artifact_args+=(--executor "$EXECUTOR")
  [ -z "$ARTIFACT_NIGHT" ] || artifact_args+=(--night "$ARTIFACT_NIGHT")
  exec node "${artifact_args[@]}"
fi

exec npm --prefix "$ROOT" run device:dry-run
