#!/bin/bash
# Bracket a device command with a Perfetto input-dispatch trace.
#
# The trace is intentionally started outside trial.sh: it observes the same
# phone run without adding screencap work to the timed policy. The command
# after `--` is run only after Perfetto reports that its data sources started.
#
# Usage:
#   atrace-input.sh RUN [SECONDS] -- COMMAND [ARGS...]
#
# Output:
#   captures/RUN-input.pftrace
#   captures/RUN-surfaceflinger-latency.txt when SF_LAYER is set.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CAPTURES="$HERE/../../captures"
RUN="${1:-}"
TRACE_SECONDS="${2:-600}"
[ -n "$RUN" ] && [ -n "${2:-}" ] || {
  echo "usage: atrace-input.sh RUN SECONDS -- COMMAND [ARGS...]" >&2
  exit 2
}
shift 2
[ "${1:-}" = "--" ] && shift || {
  echo "usage: atrace-input.sh RUN SECONDS -- COMMAND [ARGS...]" >&2
  exit 2
}
[ "$#" -gt 0 ] || { echo "missing command after --" >&2; exit 2; }

case "$RUN" in
  ''|.*|*..*|*[!A-Za-z0-9_-]*)
    echo "RUN must use letters, numbers, dash, or underscore" >&2
    exit 2
    ;;
esac
case "$TRACE_SECONDS" in
  ''|*[!0-9]*) echo "SECONDS must be a positive integer" >&2; exit 2 ;;
esac
[ "$TRACE_SECONDS" -gt 0 ] || { echo "SECONDS must be positive" >&2; exit 2; }
case "${PERFETTO_BUFFER_MB:-256}" in
  ''|*[!0-9]*) echo "PERFETTO_BUFFER_MB must be a positive integer" >&2; exit 2 ;;
esac
[ "${PERFETTO_BUFFER_MB:-256}" -gt 0 ] || {
  echo "PERFETTO_BUFFER_MB must be positive" >&2
  exit 2
}
PERFETTO_APP="${PERFETTO_APP:-*}"
case "$PERFETTO_APP" in
  '*'|[A-Za-z0-9._-]*) ;;
  *) echo "PERFETTO_APP must be a package name or '*'" >&2; exit 2 ;;
esac

OUTPUT="$CAPTURES/${RUN}-input.pftrace"
[ ! -e "$OUTPUT" ] || { echo "refusing to overwrite $OUTPUT" >&2; exit 2; }
SF_OUTPUT="$CAPTURES/${RUN}-surfaceflinger-latency.txt"
if [ -n "${SF_LAYER:-}" ] && [ -e "$SF_OUTPUT" ]; then
  echo "refusing to overwrite $SF_OUTPUT" >&2
  exit 2
fi

# Select exactly one phone before the trace starts. This also keeps the
# subsequent plain `adb` commands on the same explicit transport.
# shellcheck source=select-adb.sh
. "$HERE/select-adb.sh"
PERFETTO_HELP=$(adb shell perfetto --help 2>&1 || true)
case "$PERFETTO_HELP" in
  *"Usage: perfetto"*) ;;
  *) echo "selected device has no usable perfetto client" >&2; exit 1 ;;
esac
mkdir -p "$CAPTURES"

REMOTE="/data/misc/perfetto-traces/${RUN}-input-$$.pftrace"
TRACE_PID=""

finish() {
  status=$?
  set +e
  if [ -n "$TRACE_PID" ]; then
    # perfetto's documented termination path flushes the trace before exit.
    adb shell kill -TERM "$TRACE_PID" >/dev/null 2>&1
    ready=0
    for _ in $(seq 1 80); do
      if adb shell test -s "$REMOTE" >/dev/null 2>&1; then
        ready=1
        break
      fi
      sleep 0.25
    done
    if [ "$ready" -eq 1 ]; then
      if ! adb pull "$REMOTE" "$OUTPUT" >/dev/null; then
        echo "could not pull Perfetto trace" >&2
        [ "$status" -ne 0 ] || status=1
      else
        echo "saved ${OUTPUT#"$HERE/../../"}"
      fi
    else
      echo "Perfetto trace did not become readable: $REMOTE" >&2
      [ "$status" -ne 0 ] || status=1
    fi
    adb shell rm "$REMOTE" >/dev/null 2>&1
  fi
  if [ -n "${SF_LAYER:-}" ]; then
    if ! adb shell dumpsys SurfaceFlinger --latency "$SF_LAYER" > "$SF_OUTPUT"; then
      echo "could not read SurfaceFlinger latency for '$SF_LAYER'" >&2
      [ "$status" -ne 0 ] || status=1
    else
      echo "saved ${SF_OUTPUT#"$HERE/../../"}"
    fi
  fi
  exit "$status"
}
trap finish EXIT HUP INT TERM

pid_text=$(adb shell "perfetto --background-wait -t ${TRACE_SECONDS}s -b ${PERFETTO_BUFFER_MB:-256}mb --out ${REMOTE} -a '${PERFETTO_APP}' input view wm gfx sched")
TRACE_PID=$(printf '%s\n' "$pid_text" | awk '/^[0-9]+$/{pid=$0} END{print pid}')
[ -n "$TRACE_PID" ] || {
  echo "Perfetto did not return a background session pid" >&2
  exit 1
}
echo "Perfetto input trace running (pid $TRACE_PID, max ${TRACE_SECONDS}s)"

"$@"
