#!/usr/bin/env python3
"""Bake greenhollow's four tiles with a brief that describes THIS QUADRANT, not the whole town.

TWO DEFECTS THIS FIXES, BOTH MEASURED RATHER THAN SUSPECTED. Neither is a defect in
`scripts/rebake_town_tiles.py`, which is shared with the Millbrook worktree and is left untouched;
they are things a per-town wrapper is the right place to fix.

---- 1. THE LEGEND DESCRIBED A TOWN THE TILE COULD NOT SEE ----------------------------------------
`PLAN_BRIEF` hands the model the WHOLE-TOWN colour legend -- "the tan gap at the bottom is THE ONE
GATE", "grey disc is a stone well" -- while showing it ONE QUADRANT of the plan. The model draws
what the legend describes. Millbrook's tile (0,0) came back with a gateway and a well that are
nowhere in its crop, and without the millstream that is; correlated against its own primer it scored
+0.282, and a crop-specific rewrite took the same tile on the same model to +0.884.

Greenhollow is MORE exposed to this than Millbrook, not less. Its gate is at the south edge and its
well is dead centre, so tiles (0,0) and (0,1) contain no gate at all and each tile holds at most a
quarter of the well. A whole-town legend invites the model to invent both.

So the legend is DERIVED PER TILE, from two sources that cannot disagree with the picture:
  * the plan's own pixels -- each palette colour is counted in this crop and only the ones actually
    present are described;
  * the town's authored geometry (design/act1-towns/greenhollow/spec.json) -- each building, the
    well and the gate are intersected with the crop, and the ones that land in it are named WITH
    THEIR POSITION INSIDE THIS TILE, while the ones that do not are listed as forbidden by name.
Telling the model what is absent turns out to matter as much as telling it what is present: "there
is no gate in this tile" is the sentence that stops it drawing one.

---- 2. THE GROUND WAS DRAWN AT TOO FINE A GRAIN --------------------------------------------------
The first full bake read as good pixel art and FAILED check_town_finish.py from the SOFT side, which
that gate calls "a painting":

                      mean step   hard >=24   soft 4-20     (gate: >=17.0, >=22%, 22-40%)
  greenhollow v1        14.55       18.4%       49.7%
  portSapphire          22.17       29.7%       38.8%       <- the plate the owner accepted

The obvious suspect was the woodland and the obvious suspect was wrong. Split tile (0,0) on the
palisade radius: OUTSIDE the wall measured mean 16.26 / hard 21.5%, INSIDE it mean 13.27 / hard
16.1%. It is the GROUND, not the trees -- grass and paving drawn as fine per-pixel stipple, every
wobble of which lands in the 4-20 band and none in the >=24 band. That is also wasted work: the
plate carries 1.875 art px per world px, so anything finer than about three pixels cannot survive
the resize to 1950 as anything but noise. Hence the GRAIN clause below.

USAGE
    python3 scripts/greenhollow_bake.py                  # all four, in reading order
    python3 scripts/greenhollow_bake.py --only 0,1
    python3 scripts/greenhollow_bake.py --measure        # correlate each tile against its primer
    python3 scripts/greenhollow_bake.py --adopt 0,0,<path>
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rebake_town_tiles as R                                     # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOWN = "greenhollow"
OUT = os.path.join(ROOT, R.TOWNS[TOWN]["out"])
SPEC = os.path.join(ROOT, "design/act1-towns/greenhollow/spec.json")
CELLS = 65                     # the town grid town.json declares; the plan is drawn on it

# scripts/town_layout.py's palette, by value. Read from there, not guessed -- if that file's colours
# ever move, the legend must move with them, and a mismatch here would describe the wrong thing.
PALETTE = {
    "outside": ((58, 92, 48), "dark green", "the WOODLAND OUTSIDE the palisade"),
    "ground": ((96, 132, 70), "mid green", "GRASS inside the palisade"),
    "paving": ((176, 168, 148), "pale warm grey",
               "the PACKED-EARTH STREET AND YARD, which is where the player walks"),
    "palisade": ((104, 82, 54), "brown band", "the TIMBER PALISADE, a wall of upright logs"),
    "roofA": ((150, 78, 60), "dull red", "a BUILDING ROOF"),
    "roofB": ((78, 96, 132), "slate blue", "a BUILDING ROOF"),
}

OURS = re.compile(r"^(primer(\.png|-\d\d(-edit)?\.png)|raw-\d\d.*\.png|tile-\d\d.*\.png|plate.*\.png)$")

GRAIN = """
THE GRAIN IS COARSE, AND THIS IS THE MOST IMPORTANT INSTRUCTION ABOUT HOW IT IS DRAWN. Draw as
though the smallest mark you can make is a 3x3 block. No single-pixel speckle anywhere. No fine
noise, no stipple, no per-pixel value wobble.

  GRASS is flat areas of two or three greens with clean hard boundaries between them, plus a
  scattering of DISTINCT tufts and flowers big enough to see, not a carpet of tiny dots.
  PACKED EARTH AND PAVING is individually drawn stones 8 to 14 pixels across with a definite dark
  line of mortar or shadow between them, and flat worn earth between the stones. They must read one
  by one, not as gravel texture.
  ROOFS are individual tiles or shingles in rows, each one a flat block with a hard edge.
  WOODLAND is distinct tree crowns with hard silhouettes and flat interiors, two or three values
  each, not a fine-grained canopy texture.

Every boundary between two materials is a hard line, never a blend. Inside a material use two or
three flat values and dithering, never a gradient.
"""

BRIEF = """Draw this as hand-drawn, hard-edged pixel art at full detail.

THE INPUT IS A PLAN, NOT A PICTURE. It is a flat colour-coded diagram of ONE QUADRANT -- tile
({i},{j}) of a 2x2 grid -- of {subject}. It is not a blurry painting to be sharpened; it is a map
telling you WHERE EVERYTHING GOES. Draw the finished village that this plan describes, keeping every
element in exactly the position and at exactly the size the plan gives it.

YOU ARE SEEING ONE CORNER OF THE VILLAGE, NOT THE WHOLE OF IT. Everything below describes THIS CROP
and only this crop. Draw what is listed as present. Do not draw anything listed as absent, however
natural it would be in a village of this kind -- the missing parts are in the other three tiles and
drawing them here would put two of them in the finished map.

WHAT IS IN THIS TILE, AND WHAT EACH COLOUR MEANS HERE:
{present}
WHAT IS *NOT* IN THIS TILE. DO NOT DRAW ANY OF THESE:
{absent}
WHAT YOU ARE ADDING is craft, not content: texture, material, light, doors, windows, shutters, roof
tiles, fence posts, cart ruts, planting at the edges of the grass. Do not add a building the plan
does not have, do not move one, do not open a gap in the palisade, and do not pave over grass or
grass over paving -- the boundary between them is the collision the game already uses.
{grain}{bandnote}
OUTPUT: one RGB PNG the same pixel dimensions as the input. Print its absolute path on a line of its
own. Do not delete it and do not write anywhere under /tmp.

THE FINISH. Crisp definite boundaries between materials. Shading in discrete flat steps, two or
three values per material, dithering where a transition is needed. Individual roof tiles, individual
cobbles, individual planks, individual window panes, distinct leaf clumps. No airbrushed gradients,
no blur, no bloom, no soft focus, no photographic texture.

DRAW IT HARD; DO NOT FILTER A SOFT IMAGE TO FAKE IT. No sharpen, no unsharp mask, no posterize, no
palette reduction. Hand-drawn art of this kind measures, on the mean absolute luminance step between
neighbouring pixels, 22 or more overall, with 30% or more of steps at 24 or above and 22-40% of
steps between 4 and 20. That middle band is real shading inside shapes; keep it, but do not let it
swamp the picture -- too much of it is what a painting looks like to this measurement.

LIGHT AND PALETTE. One upper-left sun, short soft shadows, {light}. Mean luminance about 90; do not
draw it darker than that.
"""


def is_generated(name: str) -> bool:
    return name.lower().endswith(".png") and not OURS.match(name)


def newest_in_town(t0: float):
    """The newest generator output IN THIS TOWN'S FOLDER since t0.

    THE GLOBAL VERSION IS A RACE AND IT VERY NEARLY LANDED. `rebake_town_tiles.newest_since` takes
    the newest PNG anywhere under ~/.codex/generated_images, which is shared by every codex process
    on the machine. Greenhollow and Millbrook were baking at the same moment and their outputs
    interleaved: mine at 08:01, Millbrook's at 07:58, 08:00 and 08:02. My process had not returned
    at 08:02, so the next thing it would have grafted into greenhollow's plate was a Millbrook tile
    -- silently, and only intermittently, which is worse than reproducibly.

    `codex exec -i <primer>` also writes its output next to the INPUT, and the input lives in this
    town's own folder, where another town's bake cannot put anything. So look there, and nowhere
    else: a fallback to the global tree would reopen the race this exists to close.
    """
    best, bt = None, t0
    for f in os.listdir(OUT):
        if not is_generated(f):
            continue
        p = os.path.join(OUT, f)
        m = os.path.getmtime(p)
        if m > bt:
            best, bt = p, m
    return best


def box_cells(i: int, j: int):
    """The tile's rectangle in TOWN CELLS, band included -- rebake's box arithmetic, in plan units."""
    x0, y0, x1, y1 = R.primer(i, j, None)[1]
    k = CELLS / R.PLATE
    return x0 * k, y0 * k, x1 * k, y1 * k


def where(cx, cy, x0, y0, x1, y1):
    """Name a point's position INSIDE this crop, in words the model can act on."""
    fx, fy = (cx - x0) / (x1 - x0), (cy - y0) / (y1 - y0)
    ns = "upper" if fy < 0.34 else "lower" if fy > 0.66 else "middle"
    ew = "left" if fx < 0.34 else "right" if fx > 0.66 else "centre"
    return f"{ns} {ew}" if ew != "centre" or ns != "middle" else "centre"


def legend(i: int, j: int):
    """Everything in THIS crop, and everything conspicuously not in it."""
    spec = json.load(open(SPEC))
    x0, y0, x1, y1 = box_cells(i, j)
    plan = np.asarray(Image.open(os.path.join(ROOT, R.TOWNS[TOWN]["ref"]))
                      .convert("RGB").resize((R.PLATE, R.PLATE), Image.NEAREST))
    px = R.PLATE / CELLS
    crop = plan[int(y0 * px):int(y1 * px), int(x0 * px):int(x1 * px)]
    total = crop.shape[0] * crop.shape[1]

    present, absent = [], []
    for key, (rgb, name, meaning) in PALETTE.items():
        frac = (np.abs(crop.astype(int) - np.array(rgb)).sum(2) < 30).mean()
        if key in ("roofA", "roofB"):
            continue                              # buildings are named individually below
        (present if frac * total > 400 else absent).append(
            (f"  {name} ({rgb[0]},{rgb[1]},{rgb[2]}) is {meaning}.",
             f"  There is NO {meaning.split(',')[0].lower()} in this tile."))
    present = [p for p, _ in present]
    absent = [a for _, a in absent]

    for b in spec["buildings"]:
        bx, by, bw, bh = b["box"]
        if bx < x1 and bx + bw > x0 and by < y1 and by + bh > y0:
            colour = PALETTE[b["roof"]][1]
            clipped = "" if (bx >= x0 and bx + bw <= x1 and by >= y0 and by + bh <= y1) else \
                (" It is CUT OFF by the edge of this tile: draw only the part that is here, right up"
                 " to the edge, and do not complete it.")
            present.append(
                f"  the block with the {colour} upper band in the "
                f"{where(bx + bw / 2, by + bh / 2, x0, y0, x1, y1)} is a BUILDING. The coloured part"
                f" is its ROOF and the brown strip below it is its FACADE, so it faces DOWN-SCREEN."
                f" Give it a door on that facade and windows, and stand it exactly on its block.{clipped}")
    if not any("BUILDING" in p for p in present):
        absent.append("  There are NO buildings in this tile at all.")

    wx, wy, wr = spec["well"]
    if x0 - wr < wx < x1 + wr and y0 - wr < wy < y1 + wr:
        present.append(f"  the grey disc in the {where(wx, wy, x0, y0, x1, y1)} is a STONE WELL."
                       " Only the part of it inside this tile is drawn here.")
    else:
        absent.append("  There is NO well in this tile. Do not draw a well, a fountain or a cistern.")

    side, half = spec["ring"]["gate"]
    gx, gy = spec["ring"]["cx"], spec["ring"]["cy"] + spec["ring"]["r"]
    if x0 - half < gx < x1 + half and y0 - 2 < gy < y1 + 2:
        present.append(f"  the tan gap in the palisade in the {where(gx, gy, x0, y0, x1, y1)} is THE"
                       " ONE GATE of the village, and the only way in or out. Draw a real gateway"
                       " there: posts, a lintel, open leaves.")
    else:
        absent.append("  There is NO GATE in this tile. The palisade here is UNBROKEN: do not draw a"
                      " gateway, a gap, a door or an opening through it anywhere in this tile.")
    if not spec.get("water"):
        absent.append("  There is NO WATER anywhere in this village: no stream, no pond, no river,"
                      " no well-fed channel, no bridge.")
    return "\n".join(present) + "\n", "\n".join(absent) + "\n"


def correlate(i: int, j: int) -> float:
    """Pearson correlation of the tile's luminance against its own primer's, both downsampled.

    THE POINT OF THIS NUMBER is that the failure it catches is invisible by eye: the tile that drew
    the legend instead of the plan came back beautifully drawn. Downsampled to 64x64 the plan's
    blocks and the finished art's masses should track each other closely; a tile that has invented a
    landmark decorrelates hard.
    """
    tp = os.path.join(OUT, f"tile-{i}{j}.png")
    pp = os.path.join(OUT, f"primer-{i}{j}.png")
    if not (os.path.exists(tp) and os.path.exists(pp)):
        return float("nan")
    W = np.array([0.2126, 0.7152, 0.0722])
    a = np.asarray(Image.open(tp).convert("RGB").resize((64, 64), Image.LANCZOS)).astype(float) @ W
    b = np.asarray(Image.open(pp).convert("RGB").resize((64, 64), Image.LANCZOS)).astype(float) @ W
    return float(np.corrcoef(a.ravel(), b.ravel())[0, 1])


def install(i: int, j: int, src: str) -> None:
    box = R.primer(i, j, None)[1]
    img = Image.open(src).convert("RGB")
    img.save(os.path.join(OUT, f"raw-{i}{j}.png"))
    img.resize((box[2] - box[0], box[3] - box[1]), Image.LANCZOS).save(
        os.path.join(OUT, f"tile-{i}{j}.png"))
    print(f"  installed tile {i},{j} from {os.path.relpath(src, ROOT)}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="i,j -- bake a single tile")
    ap.add_argument("--adopt", help="i,j,<path>")
    ap.add_argument("--measure", action="store_true", help="correlate each tile against its primer")
    ap.add_argument("--dry-run", action="store_true", help="write the briefs, generate nothing")
    a = ap.parse_args()

    R.OUT = OUT
    R.REF = os.path.join(ROOT, R.TOWNS[TOWN]["ref"])
    R.SHIP = os.path.join(ROOT, R.TOWNS[TOWN]["ship"])
    R.newest_since = newest_in_town

    if a.measure:
        for i in range(2):
            for j in range(2):
                c = correlate(i, j)
                verdict = "no tile" if c != c else "OK" if c >= 0.6 else "*** LOW: redrew the legend"
                print(f"  tile {i},{j}  correlation vs its own primer {c:+.3f}   {verdict}")
        return 0
    if a.adopt:
        i, j, src = a.adopt.split(",", 2)
        install(int(i), int(j), src if os.path.isabs(src) else os.path.join(ROOT, src))
        return 0

    cells = [tuple(int(v) for v in a.only.split(","))] if a.only else \
            [(i, j) for i in range(2) for j in range(2)]
    # THE BRIEF IS SWAPPED IN PER TILE, so `{present}`/`{absent}` are already filled by the time
    # rebake formats the rest. Its own placeholders are left intact for it to fill.
    original = R.PLAN_BRIEF
    for i, j in cells:
        present, absent = legend(i, j)
        R.PLAN_BRIEF = (BRIEF.replace("{present}", present).replace("{absent}", absent)
                        .replace("{grain}", GRAIN).replace("{addition}", ""))
        argv, sys.argv = sys.argv, ["rebake_town_tiles.py", "--town", TOWN, "--only", f"{i},{j}"] \
            + (["--dry-run"] if a.dry_run else [])
        try:
            R.main()
        finally:
            sys.argv = argv
        if not a.dry_run:
            print(f"    tile {i},{j} correlation vs its own primer {correlate(i, j):+.3f}")
    R.PLAN_BRIEF = original
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
