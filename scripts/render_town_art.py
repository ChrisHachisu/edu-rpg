#!/usr/bin/env python3
"""Render a town's artwork from its semantic map by splatting materials.

Owner, 2026-07-31: "go ahead and generate the artwork but make sure to check the pixel
resolution against the player."

THE LATTICE IS THE WHOLE POINT OF THIS FILE
-------------------------------------------
The engine draws the world at TILE_LOGICAL = 24 pixels per tile and upscales by
SPRITE_SCALE = 2 to TILE_SIZE = 48 (`src/utils/constants.ts:1-4`,
`src/utils/AssetGenerator.ts:126-127`). `docs/hero-walk-art-contract.md:56-57` states the
consequence: every world pixel is a 2x2 block.

So this renderer composes the ENTIRE image at 24 px per cell and upscales 2x NEAREST at the
very end. It never draws a detail finer than one logical pixel. Rendering at 48 and hoping it
looks right is exactly the defect the owner caught in the dungeon material renders, where
sunkenCellar-f1-material.png is 1248x1248 for 26x26 cells -- 48 px per cell at 1:1, twice the
hero's density, so the terrain out-resolves the character and reads as a different game.

Materials are therefore reduced to logical density BEFORE any splatting. Reducing after would
average across the 2x2 blocks and reintroduce the very sub-block detail the lattice forbids.

WHY A TOWN RENDERER IS NOT THE DUNGEON RENDERER
-----------------------------------------------
MATERIAL-RENDERER-METHOD.md rule 2 warps class boundaries so terrain classes interlock. That
is right for terrain and wrong for architecture: a wall does not interlock with the street, it
stops at it. So boundaries here are split in two:

  natural classes (grass, water, dirt)   -> warped boundary, they belong to each other
  built classes (wall, roof, door, deck) -> crisp boundary plus its OWN junction band

The junction band is rule 4 applied to a town: a wall base painted over whatever is behind it,
so a house meets the street at a line rather than dissolving into it.

Usage:
  render_town_art.py --only portSapphire
  render_town_art.py --only portSapphire --materials design/act1-towns/materials
"""
from __future__ import annotations

import argparse
import glob
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/act1-towns")

TILE_LOGICAL = 24          # constants.ts TILE_LOGICAL
SPRITE_SCALE = 2           # constants.ts SPRITE_SCALE -> TILE_SIZE 48
# Logical-pixel tiling period PER MATERIAL. A single shared period is wrong: it renders every
# material at the same world scale, so terracotta shingles came out a third of a cell across
# and a roof read as six giant barrel tiles. The period is what sets a material's apparent
# scale, so a shingle needs a short one and open ground needs a long one.
# Every value is deliberately NOT a multiple of TILE_LOGICAL, or the repeat lands on the cell
# grid and the town gets a visible lattice back through the texture.
PERIOD = {"street": 92, "grass": 92, "water": 100, "cobble": 60,
          "roof": 40, "wall": 56, "deck": 52, "hedge": 64}

# semantic char -> (material name, class kind)
CLASS = {
    "=": ("street", "natural"),
    ".": ("cobble", "natural"),
    ",": ("grass", "natural"),
    "E": ("street", "natural"),
    "~": ("water", "natural"),
    "#": ("hedge", "built"),
    "^": ("roof", "built"),
    "H": ("wall", "built"),
    "D": ("wall", "built"),
    "W": ("wall", "built"),
    "C": ("wall", "built"),
    "A": ("roof", "built"),
    "S": ("cobble", "natural"),
}
BUILT = {c for c, (_, k) in CLASS.items() if k == "built"}


def load_materials(path: str, names: list[str]) -> dict[str, np.ndarray]:
    """Materials reduced to LOGICAL density and tiled to MAT_PERIOD.

    Reduction happens here, before splatting. Doing it after would average across the 2x2
    device blocks and put back the sub-block detail the lattice exists to forbid.
    """
    out = {}
    for n in names:
        f = os.path.join(path, f"{n}.png")
        if not os.path.exists(f):
            out[n] = None
            continue
        per = PERIOD[n]
        im = Image.open(f).convert("RGB")
        im = im.resize((per, per), Image.LANCZOS)                 # authored master -> logical
        a = np.asarray(im, dtype=np.float64)
        if n == "wall":
            a = 60.0 + a * 0.72        # lime plaster reads as a white slab at full value
        out[n] = a
    return out


def fbm(shape: tuple[int, int], rng, octaves: int = 4) -> np.ndarray:
    """Multi-octave value noise on the logical grid, in [-1, 1]."""
    h, w = shape
    acc = np.zeros(shape)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        gh, gw = max(2, h >> (octaves - o)), max(2, w >> (octaves - o))
        g = rng.random((gh, gw))
        up = np.asarray(Image.fromarray((g * 255).astype(np.uint8), "L")
                        .resize((w, h), Image.BICUBIC), dtype=np.float64) / 255.0
        acc += amp * up
        tot += amp
        amp *= 0.5
    return (acc / tot) * 2.0 - 1.0


def sample(mat: np.ndarray, ys: np.ndarray, xs: np.ndarray) -> np.ndarray:
    """Pixel = f(world coordinate). A strip render and a full render are byte-identical."""
    p = mat.shape[0]
    return mat[ys % p, xs % p]


def render(town: dict, mats: dict, seed: int) -> Image.Image:
    rows = town["rows"]
    hc, wc = len(rows), len(rows[0])
    H, W = hc * TILE_LOGICAL, wc * TILE_LOGICAL
    rng = np.random.default_rng(seed)

    grid = np.array([[CLASS[c][0] for c in r] for r in rows], dtype=object)
    is_built = np.array([[c in BUILT for c in r] for r in rows])

    yy, xx = np.mgrid[0:H, 0:W]
    cy, cx = yy // TILE_LOGICAL, xx // TILE_LOGICAL

    # --- warp: natural classes wander into each other by about a cell; built ones never do.
    warp = TILE_LOGICAL * 0.55
    wx = (fbm((H, W), rng) * warp).astype(int)
    wy = (fbm((H, W), rng) * warp).astype(int)
    built_here = is_built[cy, cx]
    sy = np.where(built_here, cy, np.clip((yy + wy) // TILE_LOGICAL, 0, hc - 1))
    sx = np.where(built_here, cx, np.clip((xx + wx) // TILE_LOGICAL, 0, wc - 1))
    # a built cell is never displaced INTO, either: architecture keeps its own footprint
    src_built = is_built[sy, sx]
    sy = np.where(src_built & ~built_here, cy, sy)
    sx = np.where(src_built & ~built_here, cx, sx)

    names = sorted({CLASS[c][0] for c in CLASS})
    img = np.zeros((H, W, 3), dtype=np.float64)
    picked = grid[sy, sx]
    for n in names:
        mat = mats.get(n)
        if mat is None:
            continue
        m = picked == n
        if m.any():
            img[m] = sample(mat, yy[m], xx[m])

    # --- macro layer: micro texture alone reads flat. Form, not grain.
    macro = fbm((H, W), rng, octaves=3)
    img *= (1.0 + 0.10 * macro)[..., None]

    # --- BUILT FORM. Without this a building is a coloured rectangle, which is exactly how the
    # first render came back. A top-down building reads as a volume because of four one-to-
    # three-pixel features, not because of its texture: a cast shadow on the ground, a dark
    # eave where the roof overhangs, a lit ridge, and a lit/shaded pair of side edges. All of
    # them are whole logical pixels, so none of them breaks the lattice.
    kind = grid
    roof_c = kind == "roof"
    solid_c = np.isin(kind, ["roof", "wall", "hedge"])
    within = (yy % TILE_LOGICAL) / TILE_LOGICAL
    withinx = (xx % TILE_LOGICAL) / TILE_LOGICAL

    def opens(mask: np.ndarray, dy: int, dx: int) -> np.ndarray:
        """cells of `mask` whose (dy,dx) neighbour is NOT in `mask` -- i.e. an exposed face"""
        out = np.ones_like(mask)
        ys = slice(max(0, -dy), hc - max(0, dy))
        xs = slice(max(0, -dx), wc - max(0, dx))
        ys2 = slice(max(0, dy), hc - max(0, -dy))
        xs2 = slice(max(0, dx), wc - max(0, -dx))
        out[ys, xs] = ~mask[ys2, xs2]
        return out

    # cast shadow: light from the upper left, so the shadow falls down and to the right
    solid_px = solid_c[cy, cx]
    off = 5
    shifted = np.zeros_like(solid_px)
    shifted[off:, off:] = solid_px[:-off, :-off]
    img[shifted & ~solid_px] *= 0.70

    roof_px = roof_c[cy, cx]
    img[roof_px] *= (0.90 + 0.20 * (1.0 - within))[roof_px][..., None]
    img[roof_px & opens(roof_c, 1, 0)[cy, cx] & (within > 0.87)] *= 0.55    # eave
    img[roof_px & opens(roof_c, -1, 0)[cy, cx] & (within < 0.09)] *= 1.30   # lit ridge
    img[roof_px & opens(roof_c, 0, -1)[cy, cx] & (withinx < 0.09)] *= 1.16  # lit west edge
    img[roof_px & opens(roof_c, 0, 1)[cy, cx] & (withinx > 0.91)] *= 0.80   # shaded east edge

    # --- rule 4: the wall/street junction gets its OWN band, painted over what is behind it.
    wall_px = np.isin(kind[cy, cx], ["wall", "hedge"])
    img[wall_px & opens(solid_c, 1, 0)[cy, cx] & (within > 0.80)] *= 0.52

    # outline: one logical pixel of dark at every exposed face of a built mass. Without it the
    # roof texture's own contrast swamps the eave and ridge and the building reads as a patch
    # of shingles lying flat on the street rather than a structure standing on it.
    for dy, dx, lo in ((1, 0, within > 0.95), (-1, 0, within < 0.05),
                       (0, 1, withinx > 0.95), (0, -1, withinx < 0.05)):
        img[solid_px & opens(solid_c, dy, dx)[cy, cx] & lo] *= 0.42

    # a hedge is a rounded mass, not a slab: darken every exposed face
    hedge_c = kind == "hedge"
    hedge_px = hedge_c[cy, cx]
    for dy, dx, lo in ((1, 0, within > 0.88), (-1, 0, within < 0.12),
                       (0, 1, withinx > 0.88), (0, -1, withinx < 0.12)):
        img[hedge_px & opens(hedge_c, dy, dx)[cy, cx] & lo] *= 0.72

    # --- water depth: large-scale interest that never repeats, so the swell cannot read as a net
    water = grid[cy, cx] == "water"
    if water.any():
        depth = np.clip((yy - (hc - 4) * TILE_LOGICAL) / (4.0 * TILE_LOGICAL), 0, 1)
        img[water] *= (1.0 - 0.35 * depth)[water][..., None]

    logical = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")
    return logical


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--materials", default=os.path.join(DIR, "materials"))
    args = ap.parse_args()

    names = sorted({CLASS[c][0] for c in CLASS})
    mats = load_materials(args.materials, names)
    missing = [n for n in names if mats.get(n) is None]
    if missing:
        print(f"  MISSING materials: {', '.join(missing)}")

    for path in sorted(glob.glob(os.path.join(DIR, "*.json"))):
        town = json.load(open(path))
        if args.only and town["id"] != args.only:
            continue
        logical = render(town, mats, town["seed"])
        game = logical.resize((logical.width * SPRITE_SCALE, logical.height * SPRITE_SCALE),
                              Image.NEAREST)
        lp = path.replace(".json", "-art-logical24.png")
        gp = path.replace(".json", "-art-game48.png")
        logical.save(lp)
        game.save(gp)
        print(f"{town['id']}: logical {logical.size} -> game {game.size}")
        print(f"  -> {lp}\n  -> {gp}")


if __name__ == "__main__":
    main()
