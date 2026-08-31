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
ARTIFACT_NIGHT=""
while (($#)); do
  case "$1" in
    --artifact)
      [ "$#" -ge 2 ] || { echo "trial.sh: --artifact needs a directory" >&2; exit 2; }
      ARTIFACT=$2; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --night)
      [ "$#" -ge 2 ] || { echo "trial.sh: --night needs a number" >&2; exit 2; }
      ARTIFACT_NIGHT=$2; shift 2 ;;
    --night=*) ARTIFACT_NIGHT=${1#*=}; shift ;;
    *) echo "trial.sh: unknown option $1" >&2; exit 2 ;;
  esac
done

if [ -n "$ARTIFACT" ]; then
  if [ "$DRY_RUN" -ne 1 ]; then
    echo "trial.sh: artifact handoff is validated, but live execution remains disabled until device qualification" >&2
    exit 44
  fi
  artifact_args=("$ROOT/tools/device/artifact-runner.mjs" --artifact "$ARTIFACT" --dry-run)
  [ -z "$ARTIFACT_NIGHT" ] || artifact_args+=(--night "$ARTIFACT_NIGHT")
  exec node "${artifact_args[@]}"
fi

exec npm --prefix "$ROOT" run device:dry-run
