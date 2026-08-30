#!/usr/bin/env bash
# Phone-free regression for capture-bt-audio.sh's route gate.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/fnaf2-bt-route.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
mkdir "$TMP/bin"
cat > "$TMP/bin/bluealsa-cli" <<'EOF'
#!/usr/bin/env bash
if [ "${MOCK_BLUEALSA_ROUTE:-}" = ready ] && [ "${1:-}" = info ]; then
  exit 0
fi
exit 1
EOF
chmod +x "$TMP/bin/bluealsa-cli"

MAC=10:2B:1C:DA:18:2C
ready="$(MOCK_BLUEALSA_ROUTE=ready PATH="$TMP/bin:$PATH" \
  "$HERE/capture-bt-audio.sh" --check "$MAC")"
[[ "$ready" == audio-route=READY* ]]

set +e
missing="$(MOCK_BLUEALSA_ROUTE=missing PATH="$TMP/bin:$PATH" \
  "$HERE/capture-bt-audio.sh" --check "$MAC" 2>&1)"
status=$?
set -e
[ "$status" -eq 3 ]
[[ "$missing" == audio-route=UNKNOWN\ reason=a2dp-source-not-connected* ]]

set +e
invalid="$(PATH="$TMP/bin:$PATH" "$HERE/capture-bt-audio.sh" --check bad 2>&1)"
status=$?
set -e
[ "$status" -eq 2 ]
[[ "$invalid" == Bluetooth\ MAC\ must\ have\ the\ form\ 00:11:22:33:44:55 ]]

echo "bt audio: route preflight distinguishes ready, disconnected, and invalid inputs"
