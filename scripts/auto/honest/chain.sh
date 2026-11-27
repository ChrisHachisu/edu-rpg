#!/bin/sh
# Honest player: run every profile x replicate to the end of the story, one Chromium at a time.
#   sh scripts/auto/honest/chain.sh "g1 g3 g6" "1 2 3" [variant]
# Each run.cjs process stops itself after ~5.5 minutes and the loop continues it from its checkpoint.
# Logs: $HONEST_DIR/chain.log. Re-running continues unfinished runs; delete a run's folder to redo it.
PROFILES="${1:-g1 g3 g6}"; REPS="${2:-1 2 3}"; VARIANT="$3"
export HONEST_DIR="${HONEST_DIR:-/home/user/work/honest/runs}"; export NODE_PATH=/opt/node-tools/node_modules
HERE="$(cd "$(dirname "$0")" && pwd)"; mkdir -p "$HONEST_DIR"
[ -n "$PROBE_URL" ] || curl -s -o /dev/null http://127.0.0.1:5500/ || { nohup python3 -m http.server 5500 --bind 127.0.0.1 --directory /home/user/work/dist >/dev/null 2>&1 & sleep 2; }
for r in $REPS; do for p in $PROFILES; do
  fails=0
  while :; do
    if [ -n "$VARIANT" ]; then node "$HERE/run.cjs" --profile "$p" --rep "$r" --variant "$VARIANT" --budget "${HONEST_BUDGET:-330}" --tries "${HONEST_TRIES:-20}" >> "$HONEST_DIR/chain.log" 2>&1
    else node "$HERE/run.cjs" --profile "$p" --rep "$r" --budget "${HONEST_BUDGET:-330}" --tries "${HONEST_TRIES:-20}" >> "$HONEST_DIR/chain.log" 2>&1; fi
    c=$?
    [ "$c" = 0 ] && break
    if [ "$c" != 3 ]; then fails=$((fails+1)); [ "$fails" -ge 3 ] && { echo "GIVING UP $p r$r" >> "$HONEST_DIR/chain.log"; break; }; fi
  done
done; done
echo "CHAIN DONE $(date -u +%H:%M:%S) [$PROFILES] [$REPS] $VARIANT" >> "$HONEST_DIR/chain.log"
