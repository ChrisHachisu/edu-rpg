#!/bin/sh
# Day 4 census chain: one Chromium at a time, each job under a timeout; a job is skipped when its
# log already ends with "JOBDONE". Create $D4/pause to hold the chain between jobs.
#   sh scripts/auto/census/run_d4.sh <chain> [job ...]     chains: world (towns, dungeons, overworld) | ui | battles | extra
# env: PROBE_URL (default http://127.0.0.1:5560/), CENSUS_OUT; logs in $D4/logs; done file $D4/<chain>.done
set -u
cd "$(dirname "$0")/../../.."
export NODE_PATH=/opt/node-tools/node_modules PROBE_URL=${PROBE_URL:-http://127.0.0.1:5560/}
D4=/home/user/work/d4/c; export CENSUS_OUT=${CENSUS_OUT:-$D4/out} PROBE_OUT=$D4/probe-out; mkdir -p $D4/logs $CENSUS_OUT
S=scripts/auto/census
job() {
  n=$1; t=$2; shift; shift
  if [ -f $D4/logs/$n.log ] && tail -1 $D4/logs/$n.log | grep -q JOBDONE && [ -z "${FORCE:-}" ]; then echo "$(date +%T) SKIP $n"; return; fi
  while [ -f $D4/pause ]; do sleep 5; done
  echo "$(date +%T) START $n"; timeout $t node "$@" > $D4/logs/$n.log 2>&1; r=$?; echo "$(date +%T) END $n exit $r"; [ $r -eq 0 ] && echo JOBDONE >> $D4/logs/$n.log
}
chain=${1:-world}; shift
case "$chain" in
world)
  job towns1 900 $S/towns.cjs greenhollow millbrook portSapphire ironkeep frostwatch hauntedVillage
  job towns2 900 $S/towns.cjs ruinsCamp oasisHaven embersRest cinderwatch lastBastion havensEdge
  for d in sunkenCellar whisperingWoodsCave coastalReef mistyGrotto crystalCave ironMine frozenLake hauntedForest shadowCave banditHideout oasisDepths desertTomb scorchedRuins magmaTunnels obsidianCavern emberMines volcanicForge demonBarracks voidRift frostfallCavern stormreachSpire sunkenTempleDungeon twilightDungeon demonCastle stormNest; do
    job d-$d 1500 $S/dungeons.cjs $d
  done
  job ow1 900 $S/overworld.cjs 1 2 3 gate
  job ow2 900 $S/overworld.cjs 4 5 borders act1
  ;;
rest)
  S=scripts/auto/census
  for L in en ja-kana ja-kanji; do
    job ui-$L-a 900 $S/ui.cjs $L title menu town
    job ui-$L-b 900 $S/ui.cjs $L battle defeat boss dungeon
    job ui-$L-end 900 $S/ui.cjs $L ending
    job ui2-$L 1500 $S/ui2.cjs $L fold questcard keypad crit buttons grades
  done
  job battles 1800 $S/battles.cjs
  job towns-npc1 1500 $S/towns_npc.cjs greenhollow millbrook portSapphire ironkeep frostwatch hauntedVillage
  job towns-npc2 1500 $S/towns_npc.cjs ruinsCamp oasisHaven embersRest cinderwatch lastBastion havensEdge
  job portal 1500 $S/portal.cjs
  job atlas-1 1800 $S/overworld_atlas.cjs 1
  job atlas-2 1800 $S/overworld_atlas.cjs 2
  job atlas-3 1800 $S/overworld_atlas.cjs 3
  job atlas-4 1800 $S/overworld_atlas.cjs 4
  job atlas-5 1800 $S/overworld_atlas.cjs 5
  for d in sunkenCellar whisperingWoodsCave coastalReef mistyGrotto crystalCave ironMine frozenLake hauntedForest shadowCave banditHideout oasisDepths desertTomb scorchedRuins magmaTunnels obsidianCavern emberMines volcanicForge demonBarracks voidRift frostfallCavern stormreachSpire sunkenTempleDungeon twilightDungeon demonCastle stormNest; do
    job d-$d 1500 $S/dungeons.cjs $d
  done
  for d in stormNest banditHideout demonBarracks desertTomb frostfallCavern frozenLake hauntedForest ironMine magmaTunnels oasisDepths scorchedRuins shadowCave stormreachSpire sunkenTempleDungeon twilightDungeon voidRift volcanicForge demonCastle emberMines obsidianCavern; do
    job mech-$d 900 $S/dungeons_mech.cjs $d
  done
  job ow1 900 $S/overworld.cjs 1 2 3 gate
  job ow2 900 $S/overworld.cjs 4 5 borders act1
  ;;
*) for j in "$@"; do job $chain-$(echo "$j" | tr ' /' '__') 1500 $S/$j; done ;;
esac
touch $D4/$chain.done
