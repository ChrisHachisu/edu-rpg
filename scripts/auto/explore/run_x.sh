#!/bin/bash
# Run one explorer script under the shared Chromium lock, <= ${TMO:-540}s, logging to logs/<tag>.log
#   scripts/auto/explore/run_x.sh <tag> <script.cjs> [args...]
cd "$(dirname "$0")/../../.."
W=/home/user/work/explore; mkdir -p $W/logs; tag=$1; shift; s=$1; shift
export NODE_PATH=/opt/node-tools/node_modules PROBE_URL=${PROBE_URL:-http://127.0.0.1:5500/} PROBE_OUT=${PROBE_OUT:-$W/out/x}
t0=$(date +%s)
flock $W/chrome.lock timeout ${TMO:-540} node scripts/auto/explore/$s "$@" > $W/logs/$tag.log 2>&1; rc=$?
echo "$tag rc=$rc secs=$(( $(date +%s) - t0 ))" >> $W/logs/x-summary.txt
