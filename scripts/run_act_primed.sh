#!/bin/bash
# Generate an act's terrain tiles in raster order with PRIMED, LOCKED seams.
#
# Per tile: prime the base with the finished art of its left/top neighbours -> generate ->
# resize the generator's native 1254 down to 1248 -> lock the neighbour bands back so the
# shared strip is byte-identical. Style propagates tile to tile, because each generation is
# literally continuing its neighbour's artwork.
#
# One codex call per tile, deliberately: priming has to happen BETWEEN calls, and a single
# chunked call was measured 1.47x worse at the joins anyway.
#
# After every tile it records per-class mean luminance measured THROUGH THE SEMANTIC MASK --
# not through a classifier. Every colour classifier I built misread this artwork; means taken
# through the mask are ground truth by construction. Drift beyond DRIFT_ALERT stops the run so
# it can be reported rather than burning constrained Codex tokens on drifting output.
#
# Usage: run_act_primed.sh <act> [start_index]
set -u
ACT="${1:?usage: run_act_primed.sh <act> [start_index]}"
START="${2:-0}"
cd "$(dirname "$0")/.." || exit 1
D="design/continent-terrain-class-method/owner-terrain/art-tiles"
LOG="/tmp/codex-act${ACT}-primed.log"
PROG="/tmp/act${ACT}-progress.tsv"
DRIFT_ALERT=18          # per-class mean luminance deviation that halts the run
: > "$LOG"
[ "$START" = "0" ] && printf "idx\ttile\ttokens\tground\tforest\trock\twater\tdrift\n" > "$PROG"

TILES=()
while IFS= read -r line; do [ -n "$line" ] && TILES+=("$line"); done < <(/usr/bin/python3 -c '
import json,os,sys
d="design/continent-terrain-class-method/owner-terrain/art-tiles"
p=json.load(open(os.path.join(d,"tile-plan.json")))
for t in p["acts"][sys.argv[1]]["tiles"]:
    print("%d,%d" % tuple(t["worldTopLeft"]))
' "$ACT")

TOTAL=${#TILES[@]}
echo "act $ACT: $TOTAL tiles, primed+locked, starting at index $START" | tee -a "$LOG"

i=-1
for TL in "${TILES[@]}"; do
  i=$((i+1))
  [ "$i" -lt "$START" ] && continue
  X="${TL%,*}"; Y="${TL#*,}"
  ART="$D/act${ACT}-tile-${X}-${Y}-ART.png"
  echo "[$((i+1))/$TOTAL] tile $TL  $(date +%H:%M:%S)" | tee -a "$LOG"

  /usr/bin/python3 scripts/prime_tile_base.py "$ACT" --tile "$TL" >> "$LOG" 2>&1
  PRIMED="$D/act${ACT}-tile-${X}-${Y}-primed.png"
  [ -f "$PRIMED" ] || { echo "  ABORT: priming failed" | tee -a "$LOG"; exit 1; }

  codex exec -m gpt-5.6-sol --skip-git-repo-check "Generate one finished overworld terrain artwork tile.

INPUT:  ${PRIMED}
OUTPUT: ${ART}   (RGB PNG)

The input is not uniform. Any of its LEFT 144 pixels and TOP 144 pixels that already look like finished artwork ARE finished artwork, carried over from neighbouring tiles generated before this one. The rest is a textured proxy of the terrain that still needs turning into finished art.

Continue that finished artwork inward across the whole tile:
- Reproduce the finished edge bands exactly. Do not restyle, redraw, brighten or reinterpret them.
- Render the rest to match them seamlessly: same palette, same exposure, same material treatment, same upper-left light. Grass, treeline, ridge or shoreline arriving at an edge must carry straight on along the same path.
- Keep every region exactly where the proxy puts it. Invent nothing: no new land, water, trails, structures, or trees on open ground. Water keeps the proxy's exact shoreline. Bare earth pads are landmark sites and stay bare - landmarks are added later as sprites.
- Near-uniform tiles are correct. If it is mostly sea or mostly mountain, keep it that way and find the interest inside the material: depth and swell in water; crests, cliff faces, scree and moss on rock.

Style: dark, dense, realistic old-growth JRPG environment art, 3/4 top-down, crisp faux-pixel finish, stepped shading, single upper-left light. Not painterly, not flat cartoony cel. Reference design/review/overworld-art-blueprint/act-by-act/act1/dq-art-full-v2/semantic-test/tile-4-8-ART.png.

Just generate the one image. Do not write or run verification scripts, do not sample pixels, do not compute statistics, do not retry. One line when the file exists, then stop.

No git commit, no build, never npm run build. Do not modify any *-base.png, *-primed.png, *-semantic*.png, owner-terrain.json or any landmark sprite." >> "$LOG" 2>&1

  [ -f "$ART" ] || { echo "  ABORT: no art produced for $TL" | tee -a "$LOG"; exit 1; }
  TOK=$(grep -A1 "^tokens used" "$LOG" | tail -1 | tr -d ', ')

  # resize to plan size, lock the neighbour bands, then measure drift through the mask
  /usr/bin/python3 - "$ACT" "$X" "$Y" "$i" "$TOK" "$DRIFT_ALERT" "$PROG" <<'PY' | tee -a "$LOG"
import sys, os, numpy as np
from PIL import Image
act,x,y,idx,tok,alert,prog = sys.argv[1],sys.argv[2],sys.argv[3],int(sys.argv[4]),sys.argv[5],float(sys.argv[6]),sys.argv[7]
D="design/continent-terrain-class-method/owner-terrain/art-tiles/"
ap=D+f"act{act}-tile-{x}-{y}-ART.png"
im=Image.open(ap).convert("RGB")
if im.size!=(1248,1248):
    im=im.resize((1248,1248), Image.LANCZOS); im.save(ap)
os.system(f"/usr/bin/python3 scripts/prime_tile_base.py {act} --tile {x},{y} --lock >/dev/null 2>&1")
art=np.asarray(Image.open(ap).convert("RGB")).astype(float)
sem=np.asarray(Image.open(D+f"act{act}-tile-{x}-{y}-semantic-smooth-26.png").convert("RGB")).astype(int)
LEG={(226,210,156):"ground",(26,82,46):"forest",(128,126,122):"rock",(30,82,170):"water"}
lum=lambda a:0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2]
vals={}
for rgb,k in LEG.items():
    m=(np.abs(sem-np.array(rgb)).sum(axis=2)<20)
    if m.sum()>=2000: vals[k]=float(lum(art[m]).mean())
# baseline = running median of previous rows
hist={}
if os.path.exists(prog):
    for line in open(prog).read().splitlines()[1:]:
        p=line.split("\t")
        if len(p)>=7:
            for j,k in enumerate(("ground","forest","rock","water")):
                if p[3+j] not in ("","-"): hist.setdefault(k,[]).append(float(p[3+j]))
drift=0.0
for k,v in vals.items():
    if len(hist.get(k,[]))>=3:
        drift=max(drift, abs(v-float(np.median(hist[k]))))
row=[str(idx), f"{x},{y}", tok] + [f"{vals.get(k,float('nan')):.1f}" if k in vals else "-" for k in ("ground","forest","rock","water")] + [f"{drift:.1f}"]
open(prog,"a").write("\t".join(row)+"\n")
print("  " + "  ".join(f"{k} {v:.0f}" for k,v in sorted(vals.items())) + f"   drift {drift:.1f}   tokens {tok}")
if drift>alert:
    print(f"  *** DRIFT ALERT: {drift:.1f} exceeds {alert:.0f} -- halting so this can be reported ***")
    sys.exit(3)
PY
  [ $? -eq 3 ] && { echo "HALTED ON DRIFT at index $i ($TL)" | tee -a "$LOG"; exit 3; }
done
echo "ACT $ACT PRIMED RUN COMPLETE" | tee -a "$LOG"
