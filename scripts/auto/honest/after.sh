#!/bin/sh
# Honest player: what runs after the main batch, one Chromium at a time.
#   HONEST_DIR=/home/user/work/honest/runs nohup sh scripts/auto/honest/after.sh > /home/user/work/honest/after.out 2>&1 &
# Waits for the main chain's "CHAIN DONE", then: bag-cap repro, Demon King what-ifs, the two policy variants.
cd "$(dirname "$0")/../../.." || exit 1
export NODE_PATH=/opt/node-tools/node_modules
DIR=${HONEST_DIR:-/home/user/work/honest/runs}
until grep -q "CHAIN DONE" "$DIR/chain.log" 2>/dev/null; do sleep 10; done
echo "== bagcap"; timeout 240 node scripts/auto/honest/bagcap.cjs > "$DIR/bagcap.json" 2> "$DIR/bagcap.err"; echo "exit $?"
for r in g1-r1 g3-r1 g6-r1; do echo "== whatif $r"; timeout 420 node scripts/auto/honest/whatif.cjs --run $r --dungeon demonCastle --tries 20 > "$DIR/whatif-$r.log" 2>&1; echo "exit $?"; done
echo "== savvy"; sh scripts/auto/honest/chain.sh "g1 g3 g6" "1 2" savvy
echo "== nosell"; sh scripts/auto/honest/chain.sh "g1 g3 g6" "1 2" nosell
echo "QUEUE DONE $(date +%T)"
