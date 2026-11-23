#!/bin/sh
# Full census, chained jobs (one Chromium at a time, each under 9 minutes), then JPEG + index.json.
#   sh scripts/auto/census/run_all.sh            (from the repo root; game served on 127.0.0.1:5500)
# Logs: /home/user/work/census/<job>.log ; PNGs: /home/user/work/census/out ; result: /mnt/project-files/edu-rpg/autoloop/census/
set -u
cd "$(dirname "$0")/../../.."
export NODE_PATH=/opt/node-tools/node_modules PROBE_URL=${PROBE_URL:-http://127.0.0.1:5500/}
W=/home/user/work/census; mkdir -p $W
job() { n=$1; shift; echo "$(date +%T) START $n"; timeout 540 node "$@" > $W/$n.log 2>&1; echo "$(date +%T) END $n exit $?"; }
S=scripts/auto/census
job ui-en-a   $S/ui.cjs en title menu town
job ui-en-b   $S/ui.cjs en battle defeat boss dungeon
job ui-en-end $S/ui.cjs en ending
for L in ja-kana ja-kanji; do
  job ui-$L-a   $S/ui.cjs $L title menu town
  job ui-$L-b   $S/ui.cjs $L battle defeat boss dungeon
  job ui-$L-end $S/ui.cjs $L ending
done
job towns1 $S/towns.cjs greenhollow millbrook portSapphire ironkeep frostwatch hauntedVillage
job towns2 $S/towns.cjs ruinsCamp oasisHaven embersRest cinderwatch lastBastion havensEdge
job d1  $S/dungeons.cjs sunkenCellar whisperingWoodsCave coastalReef mistyGrotto
job d2a $S/dungeons.cjs crystalCave        # slow: ~70 s per seeded boot; floors 4-6 do not fit in 9 min
job d2b $S/dungeons.cjs ironMine frozenLake hauntedForest
job d3  $S/dungeons.cjs shadowCave banditHideout oasisDepths desertTomb
job d4  $S/dungeons.cjs scorchedRuins magmaTunnels obsidianCavern emberMines
job d5  $S/dungeons.cjs volcanicForge demonBarracks voidRift
job d6  $S/dungeons.cjs frostfallCavern stormreachSpire sunkenTempleDungeon
job d7  $S/dungeons.cjs twilightDungeon demonCastle
job ow1 $S/overworld.cjs 1 2 3 gate
job ow2 $S/overworld.cjs 4 5 borders act1
python3 $S/finish.py
