#!/usr/bin/env bash
# Compatibility launcher. New runs go through the validated device service;
# the historical shell runner is retained under an explicit legacy name only
# while command/trace equivalence is being characterized.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
ORIGINAL_ARGS=("$@")

# Preserve the explicitly opt-in historical interface byte-for-byte.  Artifact
# arguments are handled by this facade even when the legacy switch is present,
# so a dry-run cannot accidentally enter the old schedule builder.
if [[ "${FNAF2_LEGACY_TRIAL:-0}" == 1 ]]; then
  has_artifact=0
  for original_arg in "${ORIGINAL_ARGS[@]}"; do
    [ "$original_arg" = --artifact ] && has_artifact=1
  done
  [ "$has_artifact" -eq 1 ] || exec "$HERE/legacy-trial.sh" "${ORIGINAL_ARGS[@]}"
fi

ARTIFACT=""
DRY_RUN=0
LIVE=0
CONFIRM_LIVE=0
QUALIFICATION=""
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
  [ -z "$ARTIFACT_NIGHT" ] || artifact_args+=(--night "$ARTIFACT_NIGHT")
  exec node "${artifact_args[@]}"
fi

exec npm --prefix "$ROOT" run device:dry-run
