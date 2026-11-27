#!/bin/bash
# Baseline: run existing browser probes one at a time (one Chromium; flock on chrome.lock) against
# the served build. Each job: timeout ${TMO:-560}s, log + out dir under /home/user/work/explore/.
#   scripts/auto/explore/run_probes.sh 'logic' 'towns' 'mouths 0 6' 'da emberMines' 'mech slide-ice' ...
# job forms: <probe> [args]  -> scripts/acts/probe/<probe>.cjs args
#            da <id[:mode]>  -> dungeon_authored.cjs <id[:mode]>
#            mech <name>     -> scripts/acts/probe/mech/<name>.cjs
# summary: /home/user/work/explore/logs/summary.txt (job, rc, PASS/FAIL counts, seconds)
cd "$(dirname "$0")/../../.."
W=/home/user/work/explore; L=$W/logs; mkdir -p $L
export NODE_PATH=/opt/node-tools/node_modules PROBE_URL=${PROBE_URL:-http://127.0.0.1:5500/}
export D2_PLANS=${D2_PLANS:-$W/e1/plans} D2_NAV=${D2_NAV:-$W/e1/nav}
for job in "$@"; do
  set -- $job; kind=$1; shift
  case $kind in
    da) f=scripts/acts/probe/dungeon_authored.cjs; name="da-${1//:/-}";;
    mech) f=scripts/acts/probe/mech/$1.cjs; name="mech-$1"; shift;;
    *) f=scripts/acts/probe/$kind.cjs; name="$kind${1:+-$1}${2:+-$2}";;
  esac
  out=$W/out/$name; mkdir -p $out
  curl -s -o /dev/null http://127.0.0.1:5500/ || (nohup python3 -m http.server 5500 --bind 127.0.0.1 --directory /home/user/work/dist >/dev/null 2>&1 &)
  t0=$(date +%s)
  PROBE_OUT=$out PROBE_SHOTS=$out/shots PT_DIR=$out flock $W/chrome.lock timeout ${TMO:-560} node $f "$@" > $L/$name.log 2>&1; rc=$?
  echo "$name rc=$rc pass=$(grep -c '\[PASS\]' $L/$name.log) fail=$(grep -c '\[FAIL\]' $L/$name.log) secs=$(( $(date +%s) - t0 ))" >> $L/summary.txt
done
