#!/bin/sh
# Baseline part 1a: every no-browser mech probe (unit + solve). Logs: /home/user/work/explore/logs/u-<name>.log
cd "$(dirname "$0")/../../.."
export NODE_PATH=/opt/node-tools/node_modules D2_PLANS=${D2_PLANS:-/home/user/work/explore/e1/plans}
L=/home/user/work/explore/logs; mkdir -p $L; : > $L/units-summary.txt
for f in scripts/acts/probe/mech/*.unit.cjs scripts/acts/probe/mech/_b-unit.cjs; do
  n=$(basename $f .cjs); timeout 480 node $f > $L/u-$n.log 2>&1; rc=$?
  echo "$n rc=$rc pass=$(grep -c PASS $L/u-$n.log) fail=$(grep -c FAIL $L/u-$n.log)" >> $L/units-summary.txt
done
echo DONE >> $L/units-summary.txt
