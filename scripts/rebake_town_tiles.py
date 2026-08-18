#!/usr/bin/env python3
"""Rebake Port Sapphire at 1950x1950 as NINE generated tiles, because one image cannot be sharp.

THE CONSTRAINT, MEASURED. The image tool returns 1254x1254 whatever it is asked for. The plate must
be 1950x1950 to land on an exact 3x device upscale. So a single generation has to be UPSCALED 1.55x,
and upscaling is precisely what destroys the sharpness the owner is asking for. Measured on one
whole-town generation, mean absolute luminance step between neighbouring pixels:

    generated 1254 native      20.64   (hard 29.2%)
    -> upscaled to 1950        13.97   (hard 19.2%)   barely better than the painting's 11.69
    -> downscaled to 975       23.91   (hard 34.0%)
    -> downscaled to 650       25.67   (hard 38.0%)

Scaling art DOWN sharpens it and scaling it UP softens it, and that is the whole of the rule. A
one-image town is therefore permanently soft no matter how well it is drawn. Nine tiles at 1254,
each covering a ninth of the town and landing at 650, spend 3x the source pixels per world pixel and
then get sharpened on the way down. That is the mechanism, and it is arithmetic rather than luck --
which is what "reliably sharper" needs.

TILES DRAWN INDEPENDENTLY DRIFT. Generation is therefore SEQUENTIAL in reading order, and each tile
is primed with the already-finished pixels of its left and upper neighbours inside an overlap band,
with the brief instructing that those bands be reproduced exactly. This is the overworld pipeline
(scripts/regen_tile.sh), which is the one approach in this repo that has produced a seamless
multi-tile image.
"""
from __future__ import annotations
import argparse, os, subprocess, time
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "design/act1-towns/rebake")
REF = os.path.join(ROOT, "design/act1-towns/rebake-v1-raw.png")   # layout + style reference
SHIP = os.path.join(ROOT, "public/act1-hifi/town/portSapphire-screen.png")
GEN = 1254           # what the tool returns, always
PLATE = 1950
N = 3
TILE = PLATE // N    # 650
BAND = 96            # overlap band in FINAL px that a tile shares with its neighbours
MODEL = "gpt-5.6-sol"


def newest_since(t0):
    root = os.path.expanduser("~/.codex/generated_images")
    best, bt = None, t0
    for d, _, fs in os.walk(root):
        for f in fs:
            if not f.endswith(".png"):
                continue
            p = os.path.join(d, f)
            m = os.path.getmtime(p)
            if m > bt:
                best, bt = p, m
    return best


def primer(i, j, plate):
    """The tile's input: the reference layout for this cell, plus any finished neighbour bands.

    The primer is built at FINAL resolution and then upscaled to GEN, so the generator sees the
    right composition at the right proportions and its job is purely to add detail.
    """
    x0, y0 = j * TILE - (BAND if j else 0), i * TILE - (BAND if i else 0)
    x1, y1 = x0 + TILE + (BAND if j else 0), y0 + TILE + (BAND if i else 0)
    ref = Image.open(REF).convert("RGB").resize((PLATE, PLATE), Image.LANCZOS)
    tile = ref.crop((x0, y0, x1, y1))
    # paste back whatever is already finished, so the seam is drawn rather than blended
    fin = plate.crop((x0, y0, x1, y1))
    a = np.asarray(fin)
    done = a.sum(axis=2) > 0
    if done.any():
        tile = Image.composite(fin, tile, Image.fromarray((done * 255).astype(np.uint8)).convert("1"))
    return tile.resize((GEN, GEN), Image.LANCZOS), (x0, y0, x1, y1)


BRIEF = """Redraw this image at full detail as hand-drawn, hard-edged pixel art.

It is ONE NINTH of a top-down JRPG harbour town, tile ({i},{j}) of a 3x3 grid, shown blurry because
it has been enlarged from a smaller rendering. Every building, street, fence, tree, boat, jetty and
patch of ground is ALREADY IN THE RIGHT PLACE at the right size. Reproduce all of it exactly where
it is. Do not move anything, do not resize anything, do not add a building, do not remove one, do
not redesign anything. Your only job is to draw what is here properly.

{bandnote}
OUTPUT: one RGB PNG the same pixel dimensions as the input. Print its absolute path on a line of
its own. Do not delete it and do not write anywhere under /tmp.

THE FINISH. Crisp definite boundaries between materials. Shading in discrete flat steps, two or
three values per material, dithering where a transition is needed. Individual roof tiles,
individual cobbles, individual planks, individual window panes, distinct leaf clumps. No airbrushed
gradients, no blur, no bloom, no soft focus, no photographic texture.

DRAW IT HARD; DO NOT FILTER A SOFT IMAGE TO FAKE IT. No sharpen, no unsharp mask, no posterize, no
palette reduction. A filtered attempt was rejected and it is measurable: filtering empties the
intermediate tones. Hand-drawn art of this kind measures, on the mean absolute luminance step
between neighbouring pixels, 26 or more overall, 34-52% of steps at 24 or above, and 22-40% of steps
between 4 and 20. That middle band is real shading inside shapes; keep it.

LIGHT AND PALETTE. One upper-left sun, short soft shadows, bright coastal daylight. Mean luminance
about 90. Do not darken, warm or cool it.
"""

BANDNOTE = """THE {which} OF THIS IMAGE IS ALREADY FINISHED ARTWORK, carried over from the tile
drawn before this one. Reproduce those {bandpx} pixels EXACTLY -- same shapes, same colours, same
level of detail -- and continue that same drawing inward across the rest of the tile. Do not
restyle them, do not brighten them, do not reinterpret them. They are the join, and a visible
change across it is a failure.

"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="i,j to regenerate a single tile")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    plate_p = os.path.join(OUT, "plate.png")
    plate = (Image.open(plate_p).convert("RGB") if os.path.exists(plate_p)
             else Image.new("RGB", (PLATE, PLATE), (0, 0, 0)))

    cells = [tuple(int(v) for v in a.only.split(","))] if a.only else \
            [(i, j) for i in range(N) for j in range(N)]
    for i, j in cells:
        pr, box = primer(i, j, plate)
        pp = os.path.join(OUT, f"primer-{i}{j}.png")
        pr.save(pp)
        which = ("LEFT EDGE" if j and not i else "TOP EDGE" if i and not j
                 else "LEFT AND TOP EDGES" if i and j else None)
        bn = "" if which is None else BANDNOTE.format(
            which=which, bandpx=int(BAND * GEN / pr.size[0] * pr.size[0] / (TILE + BAND)))
        brief = BRIEF.format(i=i, j=j, bandnote=bn)
        bp = os.path.join(OUT, f"brief-{i}{j}.md")
        open(bp, "w").write(brief)
        print(f"  tile {i},{j}  primer {pr.size}  box {box}  -> {os.path.relpath(pp, ROOT)}")
        if a.dry_run:
            continue
        t0 = time.time() - 1
        r = subprocess.run(["codex", "exec", "-m", MODEL, "--skip-git-repo-check", "-i", pp],
                           stdin=open(bp), capture_output=True, text=True, timeout=2400)
        got = newest_since(t0)
        if not got:
            print(f"    FAILED (exit {r.returncode}); last output:\n{r.stdout[-600:]}")
            continue
        art = Image.open(got).convert("RGB").resize(
            (box[2] - box[0], box[3] - box[1]), Image.LANCZOS)
        art.save(os.path.join(OUT, f"tile-{i}{j}.png"))
        plate.paste(art, (box[0], box[1]))
        plate.save(plate_p)
        print(f"    -> {os.path.relpath(got, os.path.expanduser('~'))}  placed at {box[:2]}")
    print("  plate ->", os.path.relpath(plate_p, ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
