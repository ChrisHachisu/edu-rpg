#!/usr/bin/env python3
"""Composite the approved landmark sprites onto a finished act map. Preview/review only.

Landmarks are RUNTIME sprites (owner decision 2026-07-30, LANDMARK-SPRITE-CONTRACT.md), so this
does not bake anything the game ships -- it produces the image the owner reviews to judge
placement and whether each sprite sits on its ground.

Placement follows the contract exactly, and the one rule that matters is that the anchor is
MEASURED, never assumed: `key_landmark_sprite.footprint()` returns the centre of the sprite's
widest opaque band, which on an isometric diorama is the base ellipse where it meets the
ground. That point is placed on the landmark cell's centre. A hardcoded "80% down the canvas"
was previously out by 43px -- nearly a full cell -- on Greenhollow, which is what made sprites
look like they were floating.

Sizes per contract: towns 192px (4x4 cells), dungeons/reef/portals 144px (3x3 cells).

Usage:
    composite_landmarks.py <act> <map.png> <out.png> [--labels]
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os

import numpy as np
from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OWNER = os.path.join(ROOT, "design/continent-terrain-class-method/owner-terrain")
SPRITES = os.path.join(OWNER, "landmark-sprites")
TERRAIN = os.path.join(OWNER, "owner-terrain.json")      # owner INPUT -- read only, never write
PX = 48                                                  # TILE_SIZE, src/utils/constants.ts
TOWNS = {"Greenhollow", "Millbrook", "Port Sapphire"}     # 192px; everything else 144px

_spec = importlib.util.spec_from_file_location(
    "kls", os.path.join(ROOT, "scripts/key_landmark_sprite.py"))
_kls = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_kls)


def slug(name):
    return name.lower().replace(" ", "-")


def _hash(ix, iy, seed):
    h = (ix.astype(np.int64) * 374761393 + iy.astype(np.int64) * 668265263
         + np.int64(seed) * 1442695041) & 0x7FFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0x7FFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFF).astype(np.float32) / float(0xFFFFFF)


def _vnoise(gx, gy, scale, seed):
    fx, fy = gx / scale, gy / scale
    ix, iy = np.floor(fx).astype(np.int64), np.floor(fy).astype(np.int64)
    rx, ry = (fx - ix).astype(np.float32), (fy - iy).astype(np.float32)
    sx, sy = rx * rx * (3 - 2 * rx), ry * ry * (3 - 2 * ry)
    a, b = _hash(ix, iy, seed), _hash(ix + 1, iy, seed)
    c, d = _hash(ix, iy + 1, seed), _hash(ix + 1, iy + 1, seed)
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy


def overdraw_terrain(canvas, terrain, sp, ox, oy, fy):
    """Draw TERRAIN BACK OVER the sprite's foot, so the ground overlaps the object.

    This is the step that actually makes a composited sprite look planted, and no amount of
    work on the sprite's own alpha can substitute for it. Softening or dissolving the sprite
    edge only decides where the object stops -- the ground still ends where the object begins,
    and two layers meeting along any line read as two layers. In a real scene the grass, scree
    and leaf litter in FRONT of a bank occlude its base; the object is partly behind the
    ground, not merely adjacent to it.

    So after the sprite is composited, the terrain that was already there is painted back over
    its lower silhouette in noise-broken tufts. The mask is strongest at the very bottom and
    fades to nothing at the anchor row, so the mouth and structure stay fully readable while
    the foot disappears into whatever it is standing in -- grass, scree or leaf litter, since
    the pixels come from the terrain itself and therefore always match it exactly.
    """
    w, h = sp.size
    H, W = canvas.size[1], canvas.size[0]
    x1, y1 = min(ox + w, W), min(oy + h, H)
    x0c, y0c = max(ox, 0), max(oy, 0)
    if x1 <= x0c or y1 <= y0c:
        return
    sub = (slice(y0c, y1), slice(x0c, x1))
    a = np.asarray(sp)[y0c - oy:y1 - oy, x0c - ox:x1 - ox, 3].astype(np.float32) / 255.0
    cur = np.asarray(canvas).astype(np.float32)[sub]
    ter = np.asarray(terrain).astype(np.float32)[sub]

    gy, gx = np.mgrid[y0c:y1, x0c:x1].astype(np.float32)
    # 0 at the anchor row (where the base ellipse sits), 1 at the bottom of the sprite
    span = max((oy + h) - (oy + fy), 1.0)
    band = np.clip((gy - (oy + fy)) / span, 0, 1) ** 0.75
    # tufts at grass/stone scale, sampled in WORLD coordinates so they line up with the
    # terrain's own detail rather than floating in sprite space
    n = _vnoise(gx, gy, 11.0, 71) * 0.6 + _vnoise(gx, gy, 5.0, 73) * 0.4
    m = band * np.clip((n - 0.40) / 0.30, 0, 1) * (a > 0.02)
    m = np.clip(m, 0, 1)[..., None]
    out = cur * (1 - m) + ter * m
    arr = np.asarray(canvas).copy()
    arr[sub] = np.clip(out, 0, 255).astype(np.uint8)
    canvas.paste(Image.fromarray(arr, "RGBA"), (0, 0))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("act")
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--labels", action="store_true")
    ap.add_argument("--no-overdraw", action="store_true",
                    help="skip painting terrain back over each sprite foot")
    args = ap.parse_args()

    act = json.load(open(TERRAIN))["acts"][args.act]
    x0, y0 = act["bounds"][0], act["bounds"][1]
    base = Image.open(args.src).convert("RGBA")
    terrain = base.copy()          # pristine terrain, for the foot overdraw
    draw = ImageDraw.Draw(base)
    print(f"map {base.size[0]}x{base.size[1]}   origin cell ({x0},{y0})")

    placed, missing = 0, []
    for name, (cx, cy) in sorted(act["landmarks"].items()):
        sp_path = os.path.join(SPRITES, f"{slug(name)}.png")
        if not os.path.exists(sp_path):
            missing.append(name)
            continue
        size = 192 if name in TOWNS else 144
        sp = Image.open(sp_path).convert("RGBA")
        if sp.size != (size, size):
            sp = sp.resize((size, size), Image.LANCZOS)
        fx, fy, wmax, band = _kls.footprint(sp)

        # the anchor lands on the CENTRE of the landmark's cell
        tx = (cx - x0) * PX + PX // 2
        ty = (cy - y0) * PX + PX // 2
        ox, oy = tx - fx, ty - fy
        base.alpha_composite(sp, (ox, oy))
        if not args.no_overdraw:
            overdraw_terrain(base, terrain, sp, ox, oy, fy)
        placed += 1
        print(f"  {name:<18} cell ({cx:>3},{cy:>3})  {size}px  anchor ({fx:>3},{fy:>3}) "
              f"width {wmax:>3}  -> paste ({ox},{oy})")
        if args.labels:
            draw.ellipse([tx - 5, ty - 5, tx + 5, ty + 5], outline=(255, 40, 40, 255), width=3)
            draw.text((tx + 10, ty - 26), name, fill=(255, 255, 120, 255))

    base.convert("RGB").save(args.dst)
    print(f"placed {placed}/{len(act['landmarks'])} sprites -> {args.dst}")
    if missing:
        print(f"  MISSING sprite art: {', '.join(missing)}")


if __name__ == "__main__":
    main()
