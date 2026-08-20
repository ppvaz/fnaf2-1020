#!/bin/bash
# Run N mask-camp trials back-to-back and report detected events per run.
# Usage: run-batch.sh <count> [night] [prefix] [protocol]
set -euo pipefail
N="${1:-3}"; NIGHT="${2:-6th}"; PREFIX="${3:-mc}"; PROTOCOL="${4:-wind}"
for i in $(seq 1 "$N"); do
  "$(dirname "$0")/trial-maskcamp.sh" "$PREFIX$i" 170 "$NIGHT" "$PROTOCOL"
  sleep 2
done
for i in $(seq 1 "$N"); do
  echo "--- $PREFIX$i"
  python3 "$(dirname "$0")/find-events.py" "$(dirname "$0")/../../captures/$PREFIX$i.mp4"
done
