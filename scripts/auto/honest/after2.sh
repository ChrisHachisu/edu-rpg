#!/bin/sh
# Honest player: last steps, after after.sh has finished (one Chromium at a time).
#   nohup sh scripts/auto/honest/after2.sh > /home/user/work/honest/after2.out 2>&1 &
# Bag-cap repro again, then a grade 6 run up to the first boss door and the Mosswarden what-ifs from that record.
cd "$(dirname "$0")/../../.." || exit 1
export NODE_PATH=/opt/node-tools/node_modules
until grep -q "QUEUE DONE" /home/user/work/honest/after.out 2>/dev/null; do sleep 10; done
DIR=/home/user/work/honest/runs; DOORS=/home/user/work/honest/doors; mkdir -p "$DOORS"
echo "== bagcap"; timeout 240 node scripts/auto/honest/bagcap.cjs > "$DIR/bagcap.json" 2> "$DIR/bagcap.err"; echo "exit $?"
for p in g6 g3; do
  echo "== door $p"; HONEST_DIR="$DOORS" timeout 400 node scripts/auto/honest/run.cjs --profile $p --rep 1 --to 2 > "$DOORS/run-$p.log" 2>&1; echo "exit $?"
  echo "== whatif $p mosswarden"; HONEST_DIR="$DOORS" timeout 400 node scripts/auto/honest/whatif.cjs --run $p-r1 --dungeon whisperingWoodsCave --tries 40 > "$DOORS/whatif-$p-mosswarden.log" 2>&1; echo "exit $?"
done
echo "QUEUE2 DONE $(date +%T)"
