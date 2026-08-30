#!/bin/bash
# Phone-free contract for Plan 19 P4's observe-only branch.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TRIAL="$HERE/trial.sh"

bash -n "$TRIAL"
if REACTIVE=act "$TRIAL" reactive-contract 1 >/dev/null 2>&1; then
  echo "FAIL REACTIVE=act was accepted before observe-only promotion" >&2
  exit 1
fi
if REACTIVE=observe CUE_HELPER=0 "$TRIAL" reactive-contract 1 >/dev/null 2>&1; then
  echo "FAIL REACTIVE=observe ran without the cue helper" >&2
  exit 1
fi
grep -q 'watchlist load' "$TRIAL" || { echo "FAIL no watchlist load" >&2; exit 1; }
grep -q 'CUE_READ_VERB="READ"' "$TRIAL" || { echo "FAIL no native READ path" >&2; exit 1; }
grep -q 'reactive-watch-trace' "$TRIAL" || { echo "FAIL no reactive trace artifact" >&2; exit 1; }
echo "trial reactive: act refuses, observe requires helper, native watch trace is wired"
