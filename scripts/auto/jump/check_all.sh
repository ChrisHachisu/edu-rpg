#!/bin/sh
# Every jump point, in groups (one Chromium at a time, each group a few minutes).
#   PROBE_URL=http://127.0.0.1:5505/ sh scripts/auto/jump/check_all.sh [groups=8] [logdir=/tmp/qok-jump]
# Prints the [FAIL] lines and one summary per group; exit 1 when any group failed.
cd "$(dirname "$0")/../../.."
N=${1:-8}; LOG=${2:-/tmp/qok-jump}; mkdir -p "$LOG"; RC=0
export NODE_PATH=${NODE_PATH:-/opt/node-tools/node_modules}
i=1
while [ "$i" -le "$N" ]; do
  timeout 600 node scripts/auto/checks/jump.cjs --group "$i" --of "$N" > "$LOG/group-$i.log" 2>&1 || RC=1
  grep -E '^\[FAIL\]|^jump:' "$LOG/group-$i.log"
  i=$((i + 1))
done
exit $RC
