#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cue-helper-soak-test.XXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT HUP INT TERM

MOCK_BIN="$TEMP_DIR/bin"
mkdir -p "$MOCK_BIN"
ln -s "$HERE/testdata/mock-adb-cue-helper.sh" "$MOCK_BIN/adb"

REPORT="$TEMP_DIR/report.tsv"
PATH="$MOCK_BIN:$PATH" "$HERE/soak-cue-helper.sh" 1 1 "$REPORT" >/dev/null

header="$(sed -n '1p' "$REPORT")"
row="$(sed -n '2p' "$REPORT")"
case "$header" in
  *$'pss_kb\trss_kb\tthreads\tthermal_status\tstatus_age_s\tvisual_seq'*) ;;
  *) echo "missing report columns: $header" >&2; exit 1 ;;
esac
case "$row" in
  *$'7007\t51200\t64000\t7\t0\t0\t120\t1500\t2400\t1080\t1\t1\t32000\t3000\t9\t20') ;;
  *) echo "unexpected parsed row: $row" >&2; exit 1 ;;
esac

if PATH="$MOCK_BIN:$PATH" "$HERE/soak-cue-helper.sh" 1 1 "$REPORT" >/dev/null 2>&1; then
  echo "existing reports must not be overwritten" >&2
  exit 1
fi

echo "cue-helper soak tests passed"
