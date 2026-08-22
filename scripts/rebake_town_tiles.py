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
# PER-TOWN PATHS. TOWNS ARE ART-FIRST: the REF is the town's own approved PAINTING, and collision
# is DERIVED from the finished plate afterwards. It is never an authored plan -- the plan-primed
# route (scripts/town_layout.py, mode "plan") is the one the owner scrapped twice, and both villages
# were pointed at it until 2026-08-22. A grid is never an input.
#
# portSapphire writes into its OWN directory, not into design/act1-towns/rebake. That directory
# holds the LIVE plate (plate-stitched.png is byte-identical to the shipped screen) and the fresh
# painting is a REPLACEMENT that must not overwrite live art before stage 3 lands.
#
# `paint` is what primes the tiles. It is painting-graded.png where one exists -- the owner picked
# millbrook's colour theme on 2026-08-22 and the other two were graded onto it by
# scripts/match_town_palette.py -- and painting-raw.png for millbrook, which IS the theme.
TOWNS = {
    "portSapphire": {
        "out": "design/act1-towns/portSapphire",
        "ref": "design/act1-towns/portSapphire/painting-graded.png",
        "ship": "public/act1-hifi/town/portSapphire-screen.png",
        "mode": "repaint",
        "subject": ("a top-down JRPG harbour town: cottages and a market stall around a stone well "
                    "on pale paving, with timber jetties and moored rowing boats along the water "
                    "at the bottom and open meadow at the top"),
        "light": "warm late-morning daylight",
    },
    "greenhollow": {
        "out": "design/act1-towns/greenhollow",
        "ref": "design/act1-towns/greenhollow/painting-graded.png",
        "ship": "public/act1-hifi/town/greenhollow-screen.png",
        "mode": "repaint",
        "subject": ("a small top-down JRPG forest village: stone-and-timber cottages, a market "
                    "stall and a healer's cottage around a stone well on pale paving, a low fence "
                    "at the edges, a rock outcrop at the top and woodland pressing in"),
        "light": "warm late-morning daylight",
    },
    "millbrook": {
        "out": "design/act1-towns/millbrook",
        "ref": "design/act1-towns/millbrook/painting-raw.png",
        "ship": "public/act1-hifi/town/millbrook-screen.png",
        "mode": "repaint",
        "subject": ("a small top-down JRPG mill village inside a low stone-and-timber fence: a "
                    "watermill with a wooden wheel, cottages, a market stall and a healer's "
                    "cottage around a stone well on pale paving, one gate at the SOUTH"),
        "light": "warm late-morning daylight",
    },
}
OUT = os.path.join(ROOT, TOWNS["portSapphire"]["out"])
REF = os.path.join(ROOT, TOWNS["portSapphire"]["ref"])
SHIP = os.path.join(ROOT, TOWNS["portSapphire"]["ship"])
GEN = 1254           # what the tool returns, always
PLATE = 1950
# 2x2, NOT 3x3. A 3x3 grid has four seam LINES across the plate; 2x2 has two, and each tile still
# covers a quarter of the town at 1254 px -- 2.41 art px per world px, downscaled to 1.875, so it is
# if anything sharper than the 3x3 tile measured. Halving the seams halves the one risk that can
# ruin the plate outright, and it halves the generation time.
N = 2
TILE = PLATE // N    # 975
BAND = 130           # overlap band in FINAL px that a tile shares with its neighbours
MODEL = "gpt-5.6-sol"


def newest_since(t0, only_under=None):
    """The newest generated image since t0 -- and TWO ways this has silently corrupted a plate.

    1. IT SCANS A SHARED DIRECTORY. `~/.codex/generated_images` is global, so with two towns baking
       at once the newest file is not necessarily YOURS. Measured 2026-08-19: millbrook's tile,
       generated at 08:02, was about to be grafted into greenhollow's plate. `only_under` scopes the
       search when the caller knows where its own output landed.

    2. NEWEST IS NOT BEST. `codex exec` does not always stop after producing an image -- it
       dispatches sub-agents that REDRAW it, each writing its own file, and the call exits long
       after the good one. Measured on millbrook tile (0,0): the correct image landed at 08:30:49
       with layout correlation +0.884, then nineteen further minutes produced +0.865, +0.856, +0.868,
       +0.836, +0.674, +0.803 and +0.805. Taking the newest ships +0.805 and nobody ever sees the
       +0.884. The brief now opens with "do this yourself, one generation call, do not dispatch a
       sub-agent", and a caller that can score its candidates should score them rather than trust
       arrival order -- see scripts/millbrook_bake.py and scripts/greenhollow_bake.py.
    """
    root = os.path.expanduser(only_under or "~/.codex/generated_images")
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
    """The tile's input: layout for this cell, plus any finished neighbour band AT FULL DETAIL.

    THE FIRST VERSION BUILT THE WHOLE PRIMER AT FINAL RESOLUTION AND THEN UPSCALED IT, band included.
    So the "already finished artwork" the brief told the generator to reproduce exactly arrived
    BLURRED, indistinguishable from the low-detail layout around it -- and the generator, quite
    reasonably, redrew it. Measured across the join: 88.7 mean step against a plate mean of 20.4,
    and a structure cut in half.

    The band is now taken from the neighbour's RAW generated output, at the generator's own
    resolution, so it reaches the model as obviously-finished pixels in the target style. That is the
    whole difference between "here is a blurry hint" and "here is the drawing you are continuing".

    THE SCALE FACTOR IS PER AXIS, AND ASSUMING IT WAS NOT COST THE PLATE ITS WORST SEAM.
    A tile with a band on only one side is NOT square in final pixels -- tile (1,0) covers 975 x
    1105 -- yet the primer is always 1254x1254, so the primer is aspect-distorted and its px-per-
    final-px differs between the axes (1.286 across, 1.135 down). The first version computed one
    `k = GEN / W` from the WIDTH and used it for the TOP graft as well, and computed the neighbour's
    raw-px-per-final-px from the neighbour's WIDTH when cropping a strip off its BOTTOM. Both are
    the wrong axis, and the two errors do not cancel:

        tile (1,0)  top band pasted 167 primer rows tall where 130 final px is 148  -> +13% stretch
        tile (1,1)  bottom strip cropped 148 raw rows where 130 final px is 167     -> +13% stretch

    So the "already finished artwork" the brief tells the generator to reproduce exactly arrived
    VERTICALLY STRETCHED, and the generator faithfully reproduced the stretch. Measured against what
    each band was supposed to be showing, luminance correlation 0.475 for tile (1,0) and 0.505 for
    (1,1), peaking at 0.635 once shifted by dy=+10 and dy=-6 -- the signature of a scale error, not
    of a redraw. The LEFT bands, whose axis happened to match `k`, correlate 0.88 with no shift.
    That is the whole of the y=975 seam: the joins that used the right scale are fine and the joins
    that used the wrong one are not.
    """
    x0, y0 = j * TILE - (BAND if j else 0), i * TILE - (BAND if i else 0)
    x1, y1 = x0 + TILE + (BAND if j else 0), y0 + TILE + (BAND if i else 0)
    W, H = x1 - x0, y1 - y0
    ref = Image.open(REF).convert("RGB").resize((PLATE, PLATE), Image.LANCZOS)
    pr = ref.crop((x0, y0, x1, y1)).resize((GEN, GEN), Image.LANCZOS)
    kx, ky = GEN / W, GEN / H                     # primer px per final px, PER AXIS

    def graft(ni, nj, side):
        """Paste the neighbour's own raw output into this primer's band, at generator detail."""
        raw_p = os.path.join(OUT, f"raw-{ni}{nj}.png")
        if not os.path.exists(raw_p):
            return
        raw = Image.open(raw_p).convert("RGB")
        nW = TILE + (BAND if nj else 0)           # final px the neighbour's raw image covers, x
        nH = TILE + (BAND if ni else 0)           #                                            y
        if side == "left":
            b = int(round(BAND * raw.size[0] / nW))       # raw COLUMNS spanning BAND final px
            strip = raw.crop((raw.size[0] - b, 0, raw.size[0], raw.size[1]))
            strip = strip.resize((int(round(BAND * kx)), GEN), Image.LANCZOS)
        else:
            b = int(round(BAND * raw.size[1] / nH))       # raw ROWS spanning BAND final px
            strip = raw.crop((0, raw.size[1] - b, raw.size[0], raw.size[1]))
            strip = strip.resize((GEN, int(round(BAND * ky))), Image.LANCZOS)
        pr.paste(strip, (0, 0))

    if j:
        graft(i, j - 1, "left")
    if i:
        graft(i - 1, j, "top")
    return pr, (x0, y0, x1, y1)


BRIEF = """Redraw this image at full detail as hand-drawn, hard-edged pixel art.

It is one tile ({i},{j}) of a {n}x{n} grid covering {subject}, shown blurry because it has been
enlarged from a smaller rendering. Every building, street, fence, tree, boat, jetty and patch of
ground is ALREADY IN THE RIGHT PLACE at the right size. Reproduce all of it exactly where it is. Do
not move anything, do not resize anything, do not add a building, do not remove one, do not redesign
anything. Your only job is to draw what is here properly.
{addition}
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

LIGHT AND PALETTE. One upper-left sun, short soft shadows, {light}. THE INPUT'S OWN COLOUR IS THE
AUTHORITY: reproduce its greens, its paving, its roof colours and its water exactly as they are.
Its mean luminance is about {lum:.0f}; come back within a few points of that. Do not darken,
brighten, warm or cool it, and do not restyle the grass.
"""

PLAN_BRIEF = """DO THIS YOURSELF, one generation call, do not dispatch a sub-agent. Produce the
image and stop.

Draw this as hand-drawn, hard-edged pixel art at full detail.

THE INPUT IS A PLAN, NOT A PICTURE. It is a flat colour-coded diagram of one tile ({i},{j}) of a
{n}x{n} grid covering {subject}. It is not a blurry painting to be sharpened; it is a map telling you
WHERE EVERYTHING GOES. Draw the finished village that this plan describes, keeping every element in
exactly the position and at exactly the size the plan gives it.

READ THE COLOURS LIKE THIS, and change nothing about where they are:
  pale warm grey (176,168,148)  the packed-earth street and yard. THIS IS WHERE THE PLAYER WALKS, so
                                it must read unmistakably as open, even ground -- worn earth and set
                                stone, no clutter across it, no bushes or crates growing into it.
  mid green (96,132,70)         grass and planting INSIDE the palisade.
  dark green (58,92,48)         the woodland/meadow OUTSIDE the palisade.
  brown ring (104,82,54)        the TIMBER PALISADE. A continuous wall of upright logs. It must be
                                unbroken all the way round except at the one gate.
  tan gap at the bottom         THE ONE GATE, and the only way in or out. Draw a real gateway there:
                                posts, a lintel, open leaves. Everywhere else the wall is solid.
  brown blocks with a coloured  BUILDINGS. The coloured upper part is the ROOF, the brown lower part
  upper band                    is the facade, so each building faces DOWN-SCREEN toward the yard.
                                Give every one a door on that facade and windows, and stand it
                                exactly on its block.
  blue                          WATER.
  grey disc                     a stone well.

WHAT YOU ARE ADDING is craft, not content: texture, material, light, doors, windows, shutters, roof
tiles, fence posts, cart ruts, planting at the edges of the grass. Do not add a building the plan
does not have, do not move one, do not open a second gap in the wall, and do not pave over grass or
grass over paving -- the boundary between them is the collision the game already uses.
{addition}
{bandnote}
OUTPUT: one RGB PNG the same pixel dimensions as the input. Print its absolute path on a line of its
own. Do not delete it and do not write anywhere under /tmp.

THE FINISH. Crisp definite boundaries between materials. Shading in discrete flat steps, two or
three values per material, dithering where a transition is needed. Individual roof tiles, individual
cobbles, individual planks, individual window panes, distinct leaf clumps. No airbrushed gradients,
no blur, no bloom, no soft focus, no photographic texture.

DRAW IT HARD; DO NOT FILTER A SOFT IMAGE TO FAKE IT. No sharpen, no unsharp mask, no posterize, no
palette reduction. Hand-drawn art of this kind measures, on the mean absolute luminance step between
neighbouring pixels, 26 or more overall, 34-52% of steps at 24 or above, and 22-40% of steps between
4 and 20. That middle band is real shading inside shapes; keep it.

LIGHT AND PALETTE. One upper-left sun, short soft shadows, {light}. Mean luminance about 90.
"""

ADDITION = """
ONE THING IS MISSING FROM THE LAYOUT AND YOU MUST ADD IT. {add} This is the single exception to
"do not add anything": everything ELSE is already in place and is only being drawn properly.
"""

# ---- EDITING AN ALREADY-ACCEPTED TILE ------------------------------------------------------------
# MEASURED 2026-08-18: THIS DOES NOT WORK ON THIS MODEL, AND THE MEASUREMENT IS THE POINT.
# The first attempt asked gpt-5.6-sol to add one chimney to tile (0,0) and change nothing else. It
# changed 27.8% of the tile's pixels by more than 18 luminance, over a bounding box covering the
# whole 975x975 cell -- it redrew the market stall at a different size and position -- and it did
# NOT draw the chimney. So the result failed on both halves at once: not local, and not the edit.
# `--suffix` is what caught it, by keeping the candidate out of the plate until it was measured.
#
# The tool is image-to-image generation, not inpainting; there is no mask, so "leave the rest alone"
# is a request the model has no mechanism to honour. Adding a prop therefore goes through --add on
# the FULL bake instead, which is the path that produced the accepted plate, and it is only safe on
# a tile NOTHING ELSE DEPENDS ON. Generation runs in reading order and each tile's band is grafted
# from its left and upper neighbours' raw output, so re-baking tile (1,1) invalidates nothing, while
# re-baking tile (0,0) invalidates all three others.
#
# The edit path is kept because it is the right shape for the job and would work against a model
# with a mask; do not reach for it again on this one without re-running the locality measurement.
# Restoring a prop is NOT the same job as baking a tile, and running it through BRIEF would throw
# away work the owner has already approved. BRIEF primes from `rebake-v1-raw.png`, a blurry layout
# hint, and asks for a full redraw -- so a tile regenerated that way comes back as a DIFFERENT
# drawing of the same layout. The owner said "port sapphire looks perfect now"; a redraw spends that.
#
# The edit brief primes from the tile's OWN raw output instead: finished art, at the generator's
# native resolution, i.e. the exact condition the neighbour-band mechanism already relies on to get
# faithful reproduction (measured: bands grafted at native resolution correlate 0.88, bands that
# arrived upscaled were redrawn outright). The tile is then verified by correlating the result
# against its source OUTSIDE the edit box; a low score means the model redrew rather than edited,
# and the result is rejected rather than shipped.
EDIT_BRIEF = """This image is FINISHED hand-drawn pixel art. It is not a sketch and it does not need
improving. Your job is a single local edit, and everything else must survive untouched.

THE EDIT: {edit}

EVERYTHING ELSE IS UNCHANGED. Outside the area named above, reproduce this image EXACTLY --
pixel for pixel, the same shapes, the same colours, the same dithering, the same level of detail.
Do not redraw the buildings. Do not restyle the ground. Do not move, resize, add or remove anything
else. Do not brighten, darken, warm or cool the image. Do not sharpen, blur, posterize or reduce the
palette. If you are unsure whether something is part of the edit, it is not: leave it alone.

MATCH THE DRAWING YOU ARE EDITING. The new object must be drawn in the same hand as the rest of the
image: hard-edged, flat shading in two or three discrete steps per material, dithering for
transitions, individual stones and planks and panes, lit from the upper left with a short soft
shadow on the ground beneath it. It must look like it was always there.

OUTPUT: one RGB PNG the same pixel dimensions as the input. Print its absolute path on a line of
its own. Do not delete it and do not write anywhere under /tmp.
"""

BANDNOTE = """THE {which} OF THIS IMAGE IS ALREADY FINISHED ARTWORK, carried over from the tile
drawn before this one. Reproduce those {bandpx} pixels EXACTLY -- same shapes, same colours, same
level of detail -- and continue that same drawing inward across the rest of the tile. Do not
restyle them, do not brighten them, do not reinterpret them. They are the join, and a visible
change across it is a failure.

"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--town", choices=sorted(TOWNS), default="portSapphire")
    ap.add_argument("--only", help="i,j to regenerate a single tile")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--edit", help="edit an ALREADY-BAKED tile instead of rebaking it: primes from "
                                   "the tile's own raw output and applies only this instruction. "
                                   "MEASURED NOT TO WORK on gpt-5.6-sol -- see ADDITION's comment")
    ap.add_argument("--add", help="one prop the layout reference does not contain, to be drawn "
                                  "during a FULL bake. Only safe on a tile no other tile's band "
                                  "is grafted from, i.e. the last in reading order")
    ap.add_argument("--suffix", default="", help="write raw-/tile-<ij><suffix>.png, so an edit "
                                                 "attempt can be measured before it replaces "
                                                 "anything")
    a = ap.parse_args()
    global OUT, REF, SHIP
    OUT = os.path.join(ROOT, TOWNS[a.town]["out"])
    REF = os.path.join(ROOT, TOWNS[a.town]["ref"])
    SHIP = os.path.join(ROOT, TOWNS[a.town]["ship"])
    if not os.path.exists(REF):
        raise SystemExit(f"{a.town}: no layout reference at {os.path.relpath(REF, ROOT)}. "
                         f"For an authored town run: python3 scripts/town_layout.py --town {a.town}")
    _r = np.asarray(Image.open(REF).convert("RGB"), np.float32)
    ref_lum = float((0.299 * _r[..., 0] + 0.587 * _r[..., 1] + 0.114 * _r[..., 2]).mean())
    if a.edit and not a.only:
        ap.error("--edit needs --only i,j: an edit is local to one tile by definition")
    os.makedirs(OUT, exist_ok=True)
    plate_p = os.path.join(OUT, "plate.png")
    plate = (Image.open(plate_p).convert("RGB") if os.path.exists(plate_p)
             else Image.new("RGB", (PLATE, PLATE), (0, 0, 0)))

    cells = [tuple(int(v) for v in a.only.split(","))] if a.only else \
            [(i, j) for i in range(N) for j in range(N)]
    for i, j in cells:
        if a.edit:
            src = os.path.join(OUT, f"raw-{i}{j}.png")
            if not os.path.exists(src):
                raise SystemExit(f"--edit needs {src}: there is no baked tile to edit")
            pr = Image.open(src).convert("RGB")
            box = (j * TILE - (BAND if j else 0), i * TILE - (BAND if i else 0),
                   j * TILE + TILE, i * TILE + TILE)
            pp = os.path.join(OUT, f"primer-{i}{j}-edit.png")
            pr.save(pp)
            brief = EDIT_BRIEF.format(edit=a.edit)
        else:
            pr, box = primer(i, j, plate)
            pp = os.path.join(OUT, f"primer-{i}{j}.png")
            pr.save(pp)
            which = ("LEFT EDGE" if j and not i else "TOP EDGE" if i and not j
                     else "LEFT AND TOP EDGES" if i and j else None)
            bn = "" if which is None else BANDNOTE.format(
                which=which, bandpx=int(round(BAND * GEN / (TILE + BAND))))
            tmpl = PLAN_BRIEF if TOWNS[a.town].get("mode") == "plan" else BRIEF
            brief = tmpl.format(i=i, j=j, n=N, bandnote=bn, lum=ref_lum,
                                subject=TOWNS[a.town]["subject"], light=TOWNS[a.town]["light"],
                                addition=ADDITION.format(add=a.add) if a.add else "")
        bp = os.path.join(OUT, f"brief-{i}{j}{'-edit' if a.edit else ''}.md")
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
        sfx = a.suffix
        Image.open(got).convert("RGB").save(os.path.join(OUT, f"raw-{i}{j}{sfx}.png"))
        art = Image.open(got).convert("RGB").resize(
            (box[2] - box[0], box[3] - box[1]), Image.LANCZOS)
        art.save(os.path.join(OUT, f"tile-{i}{j}{sfx}.png"))
        print(f"    -> {os.path.relpath(got, os.path.expanduser('~'))}  "
              f"raw-/tile-{i}{j}{sfx}.png written")
        if sfx:
            # A suffixed run is a CANDIDATE. It is not allowed to touch the plate or the unsuffixed
            # tiles until it has been measured -- which is the whole reason the flag exists.
            continue
        # THE BAND IS INPUT CONTEXT, NOT OUTPUT. Pasting the whole tile, band included, overwrites
        # the neighbour's finished pixels with this tile's re-drawing of them -- and the generator
        # does not reproduce them exactly, so the join became a hard edge: measured 88.7 mean step
        # across x=554 against a plate mean of 20.4, i.e. 4.3x. Pasting only the tile's OWN cell
        # leaves the neighbour intact and leaves the band doing what it was for, which is telling
        # the generator what it is drawing towards.
        #
        # scripts/stitch_plate.py supersedes this paste for the SHIPPED plate: a hard cut has no
        # tolerance for whatever disagreement survives, and the 130 px overlap it throws away is
        # exactly what a minimum-error cut needs. This paste is kept as the pipeline's own running
        # preview, not as the thing that goes to the owner.
        ox, oy = (BAND if j else 0), (BAND if i else 0)
        own = art.crop((ox, oy, ox + TILE, oy + TILE))
        plate.paste(own, (j * TILE, i * TILE))
        plate.save(plate_p)
    print("  plate ->", os.path.relpath(plate_p, ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
