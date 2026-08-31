#!/usr/bin/env bash
# Compatibility launcher. New runs go through the validated device service;
# the historical shell runner is retained under an explicit legacy name only
# while command/trace equivalence is being characterized.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

if [[ "${FNAF2_LEGACY_TRIAL:-0}" == 1 ]]; then
  exec "$HERE/legacy-trial.sh" "$@"
fi

if (($#)); then
  echo "trial.sh is a compatibility launcher; positional shell-run arguments are legacy-only" >&2
  echo "use FNAF2_LEGACY_TRIAL=1 tools/device/trial.sh ... during characterization" >&2
  exit 2
fi

exec npm --prefix "$ROOT" run device:dry-run
