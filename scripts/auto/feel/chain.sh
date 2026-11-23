#!/bin/bash
# Run feel.cjs jobs one after another (one Chromium at a time), each under `timeout`, logs in /home/user/work/feel/logs.
#   scripts/auto/feel/chain.sh "stormNest 1 g1 20" "stormNest 2 g1 20" ...
cd "$(dirname "$0")/../../.."
export NODE_PATH=/opt/node-tools/node_modules PROBE_URL=${PROBE_URL:-http://127.0.0.1:5500/} PROBE_OUT=/home/user/work/feel/tmp
LOG=/home/user/work/feel/logs; mkdir -p $LOG
for job in "$@"; do
  set -- $job; name="$1-f$2-$3"
  curl -s -o /dev/null http://127.0.0.1:5500/ || (nohup python3 -m http.server 5500 --bind 127.0.0.1 --directory /home/user/work/dist >/dev/null 2>&1 &)
  t0=$(date +%s)
  FEEL_BUDGET_S=${FEEL_BUDGET_S:-440} timeout 520 node scripts/auto/feel/feel.cjs "$@" > $LOG/$name.log 2>&1; rc=$?
  echo "$(date +%H:%M:%S) $name rc=$rc pass=$(grep -c ' PASS ' $LOG/$name.log) fail=$(grep -c ' FAIL ' $LOG/$name.log) secs=$(( $(date +%s) - t0 ))" >> $LOG/chain.txt
done
