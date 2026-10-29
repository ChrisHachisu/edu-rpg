#!/usr/bin/env python3
"""Render a pilot2 floor with the SHIPPED Act 1 renderer, unchanged (render_dungeon_material_map
render() + walkable_mask(), scale 1, props on), on the authored layout. Placeholder materials:
  ironMine, stormNest   design/materials/<id>/ (derived from the Act 1 sets, themes.py)
  hauntedForest         pilot2/materials/hauntedForest/: mat-wall is a procedural tileable
                        tree-canopy (leaf clumps lit from the upper left) so the wall mass reads as
                        trees, floor/rubble/accent are Whispering Woods' earth. The renderer is not
                        touched, only its input material.
Tower floors draw tile 9 with the climbing-stairs sprite (`ascending`).

  python3 pilot2_render.py ironMine-f1 [--fast]
Writes <scratch>/pilot2/art/<floor>-props.png and -walk.png.
"""
import json, os, resource, sys, time
import numpy as np
from PIL import Image
import common
from common import SCRATCH, MATROOT, ACT1_MATS
import render_floors                     # installs the bit-identical fast hash + Acts 2-5 TARGET/WATER
import render_dungeon_material_map as R
from themes import T

P2 = os.path.join(SCRATCH, "pilot2")
ART = os.path.join(P2, "art")
FOREST_MATS = os.path.join(P2, "materials", "hauntedForest")
R.TARGET["storm-battered stone tower"] = T["stormNest"]["target"]
R.WATER["storm-battered stone tower"] = T["stormNest"]["water"]
R.TARGET["timbered iron mine"] = T["ironMine"]["target"]
R.WATER["timbered iron mine"] = T["ironMine"]["water"]
R.TARGET["haunted forest maze"] = {"floor": (96, 88, 66), "wall": (30, 44, 30)}
R.WATER["haunted forest maze"] = (30, 40, 34)


def canopy(size=531, seed=5):
    """Tileable tree-canopy material: overlapping leaf clumps (height field of domes, drawn on a
    torus so it wraps), shaded from the upper left, leaf detail from Whispering Woods' accent."""
    rng = np.random.default_rng(seed)
    hf = np.zeros((size, size), np.float32)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    for _ in range(260):
        cx, cy = rng.uniform(0, size, 2)
        r = rng.uniform(16, 34)
        dx = (xx - cx + size / 2) % size - size / 2
        dy = (yy - cy + size / 2) % size - size / 2
        d = 1 - (dx * dx + dy * dy) / (r * r)
        hf = np.maximum(hf, np.sqrt(np.clip(d, 0, 1)) * rng.uniform(0.75, 1.0))
    gy, gx = np.gradient(hf)
    shade = np.clip(0.80 - (gx + gy) * 16.0, 0.30, 1.35)
    leaf = np.asarray(Image.open(os.path.join(ACT1_MATS, "whisperingWoodsCave", "mat-accent.png")).convert("RGB")
                      .resize((size, size)), np.float32)
    lum = leaf.mean(-1, keepdims=True) / max(1.0, leaf.mean())
    base = np.array([58, 92, 52], np.float32) * (0.75 + 0.5 * lum)
    gaps = (hf < 0.15)[..., None]
    img = base * shade[..., None] * np.where(gaps, 0.35, 1.0)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def forest_materials():
    os.makedirs(FOREST_MATS, exist_ok=True)
    canopy().save(os.path.join(FOREST_MATS, "mat-wall.png"))
    for k in ("floor", "rubble", "accent"):
        Image.open(os.path.join(ACT1_MATS, "whisperingWoodsCave", f"mat-{k}.png")).save(os.path.join(FOREST_MATS, f"mat-{k}.png"))
    return FOREST_MATS


TOWER_MATS = os.path.join(P2, "materials", "stormNest")


def masonry_materials():
    """Placeholder DRESSED-STONE set for the tower until the Codex mat-tower-storm sheet lands:
    the derived stormNest stone, low-passed so the rock cracks go, cut into running-bond blocks
    (64x32 texture px, ~36x18 world px through the 57/32 lattice) with a tone per block and
    mortar joints; the floor is the same stone as 64x64 flags. 512 px so the coursing tiles."""
    from scipy.ndimage import gaussian_filter
    os.makedirs(TOWER_MATS, exist_ok=True)
    N = 512
    def load(k):
        return np.asarray(Image.open(os.path.join(MATROOT, "stormNest", f"mat-{k}.png")).convert("RGB")
                          .resize((N, N), Image.LANCZOS), np.float32)
    yy, xx = np.mgrid[0:N, 0:N]
    def blocks(src, bw, bh, joint, tone_amp, seed):
        lo = np.stack([gaussian_filter(src[..., c], 10, mode="wrap") for c in range(3)], -1)
        mean = src.reshape(-1, 3).mean(0)
        lo = mean + 0.3 * (lo - mean)                                 # flatten the rock's big cracks
        grain = src - np.stack([gaussian_filter(src[..., c], 1.5, mode="wrap") for c in range(3)], -1)
        row = yy // bh
        col = (xx + (row % 2) * (bw // 2)) // bw
        h = ((row * 73856093) ^ (col * 19349663) ^ seed) & 1023
        tone = 1 - tone_amp + 2 * tone_amp * h / 1023.0
        jy = (yy % bh) < joint
        jx = ((xx + (row % 2) * (bw // 2)) % bw) < joint
        lit = (yy % bh) == joint                                      # bevel: lit top edge of each block
        m = np.where(jy | jx, 0.50, np.where(lit, 1.18, 1.0))
        m = gaussian_filter(m.astype(np.float32), 0.7, mode="wrap")
        return np.clip((lo * tone[..., None] + grain * 0.55) * m[..., None], 0, 255).astype(np.uint8)
    wall, floor = load("wall"), load("floor")
    Image.fromarray(blocks(wall, 64, 32, 3, 0.16, 7)).save(os.path.join(TOWER_MATS, "mat-wall.png"))
    Image.fromarray(blocks(floor, 64, 64, 3, 0.10, 11)).save(os.path.join(TOWER_MATS, "mat-floor.png"))
    Image.fromarray(blocks(load("rubble"), 32, 16, 2, 0.2, 3)).save(os.path.join(TOWER_MATS, "mat-rubble.png"))
    Image.open(os.path.join(MATROOT, "stormNest", "mat-accent.png")).save(os.path.join(TOWER_MATS, "mat-accent.png"))
    return TOWER_MATS


def render_one(fid):
    o = json.load(open(os.path.join(P2, f"{fid}.json")))
    did = o["dungeonId"]
    mdir = (forest_materials() if did == "hauntedForest" else
            masonry_materials() if did == "stormNest" else os.path.join(MATROOT, did))
    assets = o["assets"]
    if o.get("ascending"):
        sw = {"stairsDown": "stairsUp", "stairsUp": "stairsDown"}
        assets = [dict(a, kind=sw.get(a["kind"], a["kind"])) for a in assets]
    # assets the renderer has no sprite for (mechanic tiles) are runtime layers: keep them out
    assets = [a for a in assets if a["kind"] in R.PROP_CELLS or a["kind"] == "mouth"]
    os.makedirs(ART, exist_ok=True)
    t0 = time.time()
    R.walkable_mask(o["rows"], assets).save(os.path.join(ART, f"{fid}-walk.png"), optimize=True)
    img = R.render(o["rows"], R.load_materials(mdir), o["theme"], 1, assets, True, None, ())
    img.save(os.path.join(ART, f"{fid}-props.png"))
    mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    print(f"{fid} {o['width']}x{o['height']} -> {img.size} in {time.time() - t0:.0f}s, peak {mb:.0f} MB", flush=True)


if __name__ == "__main__":
    if "--fast" in sys.argv:
        R.blur = render_floors._fast_blur
    for fid in sys.argv[1].split(","):
        render_one(fid)
