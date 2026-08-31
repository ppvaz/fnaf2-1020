#!/bin/bash
# No-device regression for full-night capture negotiation and abort grading.
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
RUNNER="$HERE/legacy-trial.sh"
failed=0

check() {
  local name=$1 status=$2
  if [ "$status" -eq 0 ]; then
    echo "ok - $name"
  else
    echo "FAIL - $name" >&2
    failed=$((failed + 1))
  fi
}

# Exercise the production function without running the runner's top-level adb
# path. This keeps capability decisions independently testable with captured
# help text from old and current Android builds.
eval "$(awk '/^screenrecord_time_limit\(\)/,/^}/' "$RUNNER")"

old_help='--time-limit TIME
    Set the maximum recording time, in seconds. Default is 180.'
new_help='--time-limit TIME
    Set the maximum recording time, in seconds. Default is 180. Set to 0
    to remove the time limit.'

value=$(printf '%s\n' "$old_help" | screenrecord_time_limit 150)
[ "$?" -eq 0 ] && [ "$value" = 150 ]
check "short capture remains explicitly bounded" $?

value=$(printf '%s\n' "$new_help" | screenrecord_time_limit 475)
[ "$?" -eq 0 ] && [ "$value" = 0 ]
check "full-night capture selects advertised unlimited mode" $?

value=$(printf '%s\n' "$old_help" | screenrecord_time_limit 475 2>/dev/null)
[ "$?" -eq 2 ] && [ -z "$value" ]
check "old 180-second recorder fails closed for a full night" $?

[ "$(grep -Fc -- '--time-limit $SCREENRECORD_LIMIT' "$RUNNER")" -eq 2 ] &&
  ! grep -q 'MAXDUR=180' "$RUNNER"
check "both recorder paths use the negotiated limit without a hidden cap" $?

cleanup_body=$(awk '/^cleanup\(\) \{/,/^}/' "$RUNNER")
printf '%s\n' "$cleanup_body" | grep -Fq 'if [ "$GRADE_RUN" = 1 ]; then'
check "grading is enabled by policy, not runner success" $?
printf '%s\n' "$cleanup_body" | grep -Eq 'status.*GRADE_RUN|GRADE_RUN.*status'
[ "$?" -ne 0 ]
check "abort status cannot suppress grading" $?

if [ "$failed" -gt 0 ]; then
  echo "$failed screenrecord/grading check(s) failed" >&2
  exit 1
fi
echo "screenrecord capability: bounded short runs, uncapped full nights, fail-closed fallback; every terminal run grades"
