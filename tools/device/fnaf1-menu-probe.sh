#!/usr/bin/env bash
# One FNaF 1 menu probe under the shared serial lease.  The JS probe refuses a
# live invocation without FNAF1_LEASE_HELD=1, so a caller cannot reach the
# phone around this wrapper while a Cue Helper/device operation owns it.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERIAL="${FNAF_SERIAL:-ZF525F5BH5}"
case "$SERIAL" in
  ''|*[!A-Za-z0-9._:-]*) echo "fnaf1-menu-probe: FNAF_SERIAL is invalid" >&2; exit 2 ;;
esac

if [ "${FNAF1_LEASE_HELD:-}" != 1 ]; then
  exec python3 "$HERE/device-lock-exec.py" "$SERIAL" -- \
    env FNAF1_LEASE_HELD=1 FNAF_SERIAL="$SERIAL" node "$HERE/fnaf1-menu-probe.mjs" "$@"
fi
exec node "$HERE/fnaf1-menu-probe.mjs" "$@"
