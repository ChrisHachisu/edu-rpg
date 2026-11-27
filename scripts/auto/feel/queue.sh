#!/bin/bash
# Pop jobs ("<dungeon> <floors> <profile> <trials>") from /home/user/work/feel/queue.txt one at a time and run them
# (one Chromium at a time, each under `timeout`). Append lines to the queue while it runs. Exits when the queue is empty.
cd "$(dirname "$0")/../../.."
Q=/home/user/work/feel/queue.txt; LOG=/home/user/work/feel/logs; mkdir -p $LOG
export NODE_PATH=/opt/node-tools/node_modules PROBE_URL=${PROBE_URL:-http://127.0.0.1:5500/} PROBE_OUT=/home/user/work/feel/tmp
while true; do
  job=$(flock $Q.lock sh -c "head -1 $Q; sed -i 1d $Q")
  [ -z "$job" ] && break
  set -- $job; name="$1-f$2-$3"
  curl -s -o /dev/null http://127.0.0.1:5500/ || (nohup python3 -m http.server 5500 --bind 127.0.0.1 --directory /home/user/work/dist >/dev/null 2>&1 &)
  t0=$(date +%s)
  FEEL_BUDGET_S=${FEEL_BUDGET_S:-440} timeout 520 node scripts/auto/feel/feel.cjs "$@" > $LOG/$name.log 2>&1; rc=$?
  echo "$(date +%H:%M:%S) $name rc=$rc pass=$(grep -c ' PASS ' $LOG/$name.log) fail=$(grep -c ' FAIL ' $LOG/$name.log) secs=$(( $(date +%s) - t0 ))" >> $LOG/chain.txt
done
echo "$(date +%H:%M:%S) queue empty" >> $LOG/chain.txt
