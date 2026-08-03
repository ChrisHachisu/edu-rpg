#!/bin/bash
# Regenerate ONE act tile, primed and locked, with BOTH style anchors attached.
#
# One codex call, generate-only. Measured: a brief that also demands self-verification costs
# ~11 min / ~152k tokens per tile against ~2 min / ~20k for generate-only, and the verification
# it produced was not trustworthy anyway. Geometry is guaranteed by the base; appearance is
# judged by the owner.
#
# Two things this fixes versus the previous prompt:
#   1. BOTH anchors are attached. Only the dark 4-8 was referenced before, which is why the
#      whole run generated too dark.
#   2. Anchor 4-8 CONTAINS A BUILDING. That is where the invented structure in tile 39-287 came
#      from. The anchors are now explicitly scoped to palette/exposure/material, with the
#      building called out as forbidden.
#
# Tone: the tile must match its PRIMED BANDS, not the final target palette. The act is graded
# once, globally, after stitching (grade_act_map.py). A tile generated at the final target
# level while its neighbours sit lower would be lifted again by that grade and blow out -- the
# exact patchwork this pipeline is trying to remove.
#
# Usage: regen_tile.sh <act> <x,y> "<what this tile must show>"
set -u
ACT="${1:?usage: regen_tile.sh <act> <x,y> <description>}"
TL="${2:?missing tile x,y}"
DESC="${3:?missing description}"
cd "$(dirname "$0")/.." || exit 1
D="design/continent-terrain-class-method/owner-terrain/art-tiles"
B="design/review/overworld-art-blueprint/act-by-act/act1/dq-art-full-v2/semantic-test"
X="${TL%,*}"; Y="${TL#*,}"
ART="$D/act${ACT}-tile-${X}-${Y}-ART.png"
PRIMED="$D/act${ACT}-tile-${X}-${Y}-primed.png"
SEM="$D/act${ACT}-tile-${X}-${Y}-semantic-smooth-26.png"
LOG="/tmp/regen-${ACT}-${X}-${Y}.log"

/usr/bin/python3 scripts/prime_tile_base.py "$ACT" --tile "$TL" || exit 1
[ -f "$PRIMED" ] || { echo "ABORT: priming failed"; exit 1; }

echo "generating $TL  $(date +%H:%M:%S)"
codex exec -m gpt-5.6-sol --skip-git-repo-check "Generate one finished overworld terrain artwork tile.

INPUT:  ${PRIMED}
OUTPUT: ${ART}   (RGB PNG, same pixel dimensions as the input)

REGION MAP (read only, do not modify): ${SEM}
In that map, dark green = dense forest, pale sand colour = open walkable ground, grey = rock,
blue = water. It is the authority on WHERE each material goes.

WHAT THIS TILE MUST SHOW: ${DESC}

The input is not uniform. Any of its LEFT 144 pixels and TOP 144 pixels that already look like
finished artwork ARE finished artwork, carried over from neighbouring tiles generated before
this one. The rest is a textured proxy of the terrain that still needs turning into finished art.

Continue that finished artwork inward across the whole tile:
- Reproduce the finished edge bands EXACTLY. Do not restyle, redraw, brighten or reinterpret them.
- MATCH THEIR EXPOSURE EXACTLY across the rest of the tile. Do not brighten, do not lift, do not
  apply any global exposure change. The whole act is colour-graded later as one image; a tile
  that is brighter than its neighbours becomes a visible block and is a failure.
- Keep every region exactly where the region map puts it. Invent nothing.

FORBIDDEN -- each of these is a defect a previous pass actually shipped here:
- NO structures of any kind: no cottage, tower, keep, wall, fence, gate, bridge, cave mouth,
  arch, standing stone, boat, jetty or ruin. Landmarks are composited later as sprites.
- NO roads, trails, paths or tracks unless the region map shows bare ground there.
- NO rock, scree or cliff anywhere the region map says forest.
- NO water the region map does not show.
- NO corduroy furrows, no worm or maze-like ridge patterns, no flat flagstones or paving in rock.
- No people, animals, banners, signs, text, labels or UI.

Where the region map says FOREST, draw impassable dense old-growth evergreen: layered conifer
canopy with individually readable crowns (a mature canopy is about 60-95 px across), visible
trunks and deep shadow between them. A flat dark mass with no canopy detail is a failure -- that
is the specific defect being corrected in this tile.

Style: dark, dense, realistic old-growth JRPG environment art, 3/4 top-down, crisp faux-pixel
finish, stepped shading, single upper-left light. Not painterly, not flat cartoony cel.

STYLE ANCHORS -- for palette, exposure and material treatment ONLY:
  ${B}/tile-4-8-ART.png    (rock facets, cliff shadow, forest)
  ${B}/tile-7-6-ART.png    (grass, treeline, open ground)
Take colour, light and material handling from these. Do NOT copy any content or composition from
them. The first anchor contains a small BUILDING near its lower right -- that building must NOT
appear in your output, and no structure like it. It is present only because the anchor predates
the no-structures rule.

Just generate the one image. Do not write or run verification scripts, do not sample pixels, do
not compute statistics, do not retry. One line when the file exists, then stop.

No git commit, no build, never npm run build. Do not modify any *-base.png, *-primed.png,
*-semantic*.png, owner-terrain.json or any landmark sprite." 2>&1 | tee "$LOG"

[ -f "$ART" ] || { echo "ABORT: no art produced"; exit 1; }

/usr/bin/python3 - "$ACT" "$X" "$Y" <<'PY'
import sys, os
from PIL import Image
act, x, y = sys.argv[1], sys.argv[2], sys.argv[3]
p = f"design/continent-terrain-class-method/owner-terrain/art-tiles/act{act}-tile-{x}-{y}-ART.png"
im = Image.open(p).convert("RGB")
if im.size != (1248, 1248):          # codex returns 1254 natively regardless of request
    im.resize((1248, 1248), Image.LANCZOS).save(p)
    print(f"  resized {im.size} -> (1248, 1248)")
PY
/usr/bin/python3 scripts/prime_tile_base.py "$ACT" --tile "$TL" --lock
grep -i "^tokens used" -A1 "$LOG" | tail -1
