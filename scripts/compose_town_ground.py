#!/usr/bin/env python3
"""Lay the tiled ground for Port Sapphire, using the SHIPPED PLATE'S PAVING as the street shape.

THE LAYOUT IS NOT INVENTED HERE, AND THAT IS THE POINT. Owner rejected v8 for re-laying the streets
as a symmetric cross: "the game is not build on squares so it needs to look more natural." The
shipped plate's paving network is organic and has never been criticised, and
derive_town_walkable.py thresholds that same paving to decide where the player may walk. So the
mask is LIFTED from the shipping plate, not redrawn -- the art changes, the streets do not.

THE GRASS->PAVING JOIN IS DRAWN ART, NOT A CUT. A hard boolean edge between two tiled fields reads
as a vector shape no matter how good the two fields are. The generated `edge` swatch is one
continuous drawn transition with loose cobbles scattering into the grass, its boundary running down
the middle of the tile. So a plate pixel at signed distance d from the mask boundary samples that
swatch at x = half + d: the transition on the plate IS the drawn transition, positioned by the
distance field instead of being blended.

Per-tile orientation is varied from a position hash. A 240px tile repeats every 8 cells, which the
eye finds instantly if every copy is identical; four orientations push the visible period to 16.
"""
from __future__ import annotations
import argparse, os
import numpy as np
import json
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G = os.path.join(ROOT, "design/act1-towns/ground")
WALKABLE = os.path.join(ROOT, "public/act1-hifi/town/portSapphire-walkable.json")
WORLD_PX_PER_CELL = 16        # portSapphire-town.json
PX_PER_CELL = 30              # 16 world px per cell * 1.875 art px per world px


def load(name):
    return np.asarray(Image.open(os.path.join(G, f"ground-{name}.png")).convert("RGB"))


def field(tile, h, w, vary=True):
    """Tile `tile` over h x w, varying orientation per tile from a position hash."""
    t = tile.shape[0]
    out = np.empty((h, w, 3), dtype=np.uint8)
    for ty in range(0, h, t):
        for tx in range(0, w, t):
            v = tile
            if vary:
                k = (hash((tx // t, ty // t, 0xA17)) >> 3) & 3
                v = np.rot90(tile, k) if k else tile
                if (k & 1): v = v[:, ::-1]
            hh = min(t, h - ty); ww = min(t, w - tx)
            out[ty:ty + hh, tx:tx + ww] = v[:hh, :ww]
    return out


def paving_mask(cell0, cell1, h, w):
    """The street network, RASTERISED FROM THE WALKABLE AUTHORITY -- not thresholded out of the art.

    An earlier pass took the mask by luminance-thresholding the shipped painting, the way
    derive_town_walkable.py does. That is backwards and it measured 3.9% paving in the town centre:
    at luminance >= 150 the shipped paving reads as scattered bright STONES, not as a street, so an
    opening pass to kill the speckle killed the street with it.

    portSapphire-walkable.json is the collision authority for this map -- an organic 211-point
    polygon with three holes, in the same 1040 world px space the art covers. Painting the paving
    where the authority says the player may walk makes the art and the collision agree BY
    CONSTRUCTION, instead of hoping a threshold recovers one from the other.
    """
    reg = json.load(open(WALKABLE))["regions"][0]
    scale = w / ((cell1[0] - cell0[0]) * WORLD_PX_PER_CELL)      # plate px per world px
    ox, oy = cell0[0] * WORLD_PX_PER_CELL, cell0[1] * WORLD_PX_PER_CELL

    def ring(pts):
        return [((p["x"] - ox) * scale, (p["y"] - oy) * scale) for p in pts]

    img = Image.new("L", (w, h), 0)
    dr = ImageDraw.Draw(img)
    dr.polygon(ring(reg["outer"]), fill=255)
    for hole in reg.get("holes", []):
        dr.polygon(ring(hole), fill=0)
    return np.asarray(img) > 127


def compose(cell0, cell1, out_path, seed=0xA17):
    w = int(round((cell1[0] - cell0[0]) * PX_PER_CELL))
    h = int(round((cell1[1] - cell0[1]) * PX_PER_CELL))
    grass, paving, edge = load("grass"), load("paving"), load("edge")
    gf, pf = field(grass, h, w), field(paving, h, w)
    ef = field(edge, h, w, vary=False)              # the edge swatch has a direction; do not rotate it

    m = paving_mask(cell0, cell1, h, w)

    # THE JOIN IS DISPLACED AT COBBLE SCALE, NOT SAMPLED FROM A SWATCH.
    # First attempt sampled the generated `edge` swatch by signed distance, mapping d to a column
    # of that swatch. It smeared: along any run of pixels sharing a distance, the same drawn column
    # repeats sideways, and with a band wide enough to matter (114 px, nearly four cells) that
    # covered most of the patch in horizontal streaks.
    # What actually breaks a boundary is displacing it by noise correlated at the size of the
    # features either side. Smoothed at ~12 px -- one cobble -- the polygon edge stops being a
    # polygon edge and starts wandering around individual stones, which is the look the swatch was
    # being asked to supply.
    rng = np.random.default_rng(seed)
    d = distance_transform_edt(m) - distance_transform_edt(~m)
    n = rng.random((h // 12 + 2, w // 12 + 2))
    n = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)).astype(float)
    n = (n / 255.0 - 0.5) * 2.0
    m2 = (d + n * 11.0) > 0

    out = np.where(m2[..., None], pf, gf)

    # Grass tufts push up between the outermost stones: a thin inner rim of the street keeps some
    # grass, so the paving does not start with a clean line of its own.
    rim = m2 & (d < 9) & (n > 0.15)
    out = np.where(rim[..., None], gf, out)
    # ...and loose stones sit a little way out into the grass.
    stray = (~m2) & (d > -16) & (n < -0.45)
    out = np.where(stray[..., None], pf, out)

    Image.fromarray(out).save(out_path)
    print(f"  ground {w}x{h}  cells {cell0}->{cell1}  paving {100*m.mean():.1f}%  -> "
          f"{os.path.relpath(out_path, ROOT)}")
    return out, m


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", default="18,20,46,40", help="x0,y0,x1,y1 in town cells")
    ap.add_argument("--out", default=os.path.join(G, "pilot-ground.png"))
    a = ap.parse_args()
    x0, y0, x1, y1 = (float(v) for v in a.cells.split(","))
    compose((x0, y0), (x1, y1), a.out)
