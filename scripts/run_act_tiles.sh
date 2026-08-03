#!/bin/bash
# Drive an act's terrain-tile elevation through Codex in sequential chunks.
#
# Chunked deliberately: one Codex call per ~6 tiles rather than one call for all 56, so a
# failure or a retry-limit loses six tiles instead of the whole act, and progress is
# inspectable while it runs. Chunks run one at a time -- concurrent Codex processes compete
# for the same machine and slow each other down.
#
# Usage: run_act_tiles.sh <act> [chunk_size]
set -u
ACT="${1:?usage: run_act_tiles.sh <act> [chunk]}"
CHUNK="${2:-6}"
cd "$(dirname "$0")/.." || exit 1
DIR="design/continent-terrain-class-method/owner-terrain/art-tiles"
LOG="/tmp/codex-act${ACT}-tiles.log"
: > "$LOG"

# tiles still needing art, in plan order.
# NOTE: macOS ships bash 3.2, which has no `mapfile` -- use a portable read loop.
TODO=()
while IFS= read -r line; do
  [ -n "$line" ] && TODO+=("$line")
done < <(/usr/bin/python3 -c '
import json,os,sys
act=sys.argv[1]
d="design/continent-terrain-class-method/owner-terrain/art-tiles"
plan=json.load(open(os.path.join(d,"tile-plan.json")))
for t in plan["acts"][act]["tiles"]:
    if not os.path.exists(os.path.join(d,t["art"])):
        print(t["art"])
' "$ACT")

TOTAL=${#TODO[@]}
echo "act $ACT: $TOTAL tiles still need art, chunk size $CHUNK" | tee -a "$LOG"
[ "$TOTAL" -eq 0 ] && exit 0

i=0; n=0
while [ $i -lt "$TOTAL" ]; do
  n=$((n+1))
  SLICE=("${TODO[@]:$i:$CHUNK}")
  LIST=""
  for f in "${SLICE[@]}"; do LIST="${LIST}  ${f}  (base: ${f/-ART.png/-base.png}, mask: ${f/-ART.png/-semantic-smooth-26.png})\n"; done
  echo "=== chunk $n : ${#SLICE[@]} tiles ===" | tee -a "$LOG"
  codex exec -m gpt-5.6-sol --skip-git-repo-check "Read design/continent-terrain-class-method/owner-terrain/art-tiles/CODEX-ART-BRIEF-V7.md IN FULL and follow it exactly. It is the consolidated locked brief and supersedes all earlier ones.

TASK: elevate exactly these ${#SLICE[@]} terrain tiles, each 1248x1248, writing into ${DIR}/ :
$(printf "%b" "$LIST")
Each tile's base is COMPOSITION TRUTH: reproduce what it shows, add material and light, invent nothing. NO structures of any kind - landmarks are composited later as sprites, so the bare packed-earth pads stay bare. ZERO trees on open ground. Rock is a mountain range with crests, cliff faces and foot scree, never rubble or paving. Coastlines stay soft and graded. Water keeps the base's exact shoreline.

TONE MUST BE IDENTICAL ACROSS ALL TILES: open grass hue 68-71 deg, saturation ~0.70, value 0.40-0.50. Judge each tile by its LAND, not its whole-tile average. Do not stylise one tile differently from another - these tiles are stitched into one continuous map and a measured seam test already caught a 14.8 luminance ramp between neighbours.

Tiles overlap by 3 cells (144 px) with their neighbours; features crossing that band must line up, which happens naturally if each base is reproduced faithfully.

Verify each tile at cell centres (i*48+24, j*48+24) against its own mask and report per tile: mismatches out of 676, mean luminance, open-ground HSV, and confirmation that no structure was drawn.

CONSTRAINTS: no git commit, no build, never npm run build, do not modify owner-terrain.json, owner-terrain.raw-export.json, any *-semantic*.png, any *-base.png or any landmark sprite. If you cannot generate raster artwork, say so plainly and stop rather than substituting a placeholder." >> "$LOG" 2>&1
  DONE=$(ls "$DIR"/act${ACT}-tile-*-ART.png 2>/dev/null | wc -l | tr -d ' ')
  echo "--- chunk $n finished; act $ACT now has $DONE ART tiles ---" | tee -a "$LOG"
  i=$((i+CHUNK))
done
echo "ACT $ACT TILE RUN COMPLETE" | tee -a "$LOG"
