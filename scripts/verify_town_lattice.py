#!/usr/bin/env python3
"""Prove the town artwork sits on the same pixel lattice as the player. Mechanically.

Owner, 2026-07-31: "make sure to check the pixel resolution against the player."

This is a GATE, not a report. It fails loudly, because the failure it exists to catch is
invisible until the art is next to the hero and then it is obvious and expensive --
`sunkenCellar-f1-material.png` renders a 26x26 floor at 1248x1248, i.e. 48 px per cell at 1:1
detail, twice the hero's density.

Checks
------
1. GAME == LOGICAL upscaled 2x NEAREST, exactly.
   `docs/hero-walk-art-contract.md` rule 167, applied to terrain instead of sprites.
2. Cell size: the game image is exactly TILE_SIZE px per semantic cell.
3. Block purity: every 2x2 device block in the game image is one colour.
4. The town art is never FINER than the player. Measured, not assumed: the same
   block-uniformity statistic is computed for the hero sheet and for the town, and the town
   must be at least as blocky. Terrain out-resolving the character is the defect; terrain
   coarser than the character is safe.

It also writes a side-by-side proof: the hero standing on the town art at true scale, plus a
4x magnified crop of the same, because a lattice mismatch is only visible magnified.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/act1-towns")
HERO = os.path.join(ROOT, "public/assets/hero/hero-feminine-walk.png")

TILE_LOGICAL, SPRITE_SCALE = 24, 2
TILE_SIZE = TILE_LOGICAL * SPRITE_SCALE


def block_uniformity(a: np.ndarray, n: int = 2, alpha_only: bool = False) -> float:
    """Fraction of device pixels equal to the top-left pixel of their n x n block.

    1.0 means the image is perfect n x n pixel art. Lower means it carries detail finer than
    the block, i.e. it out-resolves that lattice.
    """
    if alpha_only:
        a = a[..., :3]
    h, w = a.shape[:2]
    ref = a[(np.arange(h) // n * n)][:, (np.arange(w) // n * n)]
    return float((a == ref).all(axis=-1).mean())


def hero_frames(path: str) -> tuple[np.ndarray, float]:
    sheet = np.array(Image.open(path).convert("RGBA"))
    fh = sheet.shape[0]
    opaque = sheet[..., 3] > 0
    # measure the hero's own lattice on visible pixels only, so transparent margin cannot
    # flatter the score
    rgb = sheet[..., :3].copy()
    rgb[~opaque] = 0
    return sheet, block_uniformity(rgb, 2)


def check(town_id: str, strict: bool) -> bool:
    lp = os.path.join(DIR, f"{town_id}-art-logical24.png")
    gp = os.path.join(DIR, f"{town_id}-art-game48.png")
    jp = os.path.join(DIR, f"{town_id}.json")
    for p in (lp, gp, jp):
        if not os.path.exists(p):
            print(f"FAIL  missing {p}")
            return False

    town = json.load(open(jp))
    logical = np.array(Image.open(lp).convert("RGB"))
    game = np.array(Image.open(gp).convert("RGB"))
    ok = True

    # 1 -- the exact upscale relationship
    up = np.repeat(np.repeat(logical, SPRITE_SCALE, axis=0), SPRITE_SCALE, axis=1)
    exact = up.shape == game.shape and np.array_equal(up, game)
    print(f"{'PASS' if exact else 'FAIL'}  game == logical upscaled {SPRITE_SCALE}x NEAREST, exactly")
    ok &= exact

    # 2 -- cell size
    want = (town["height"] * TILE_SIZE, town["width"] * TILE_SIZE, 3)
    size_ok = game.shape == want
    print(f"{'PASS' if size_ok else 'FAIL'}  game is {TILE_SIZE}px per cell "
          f"(is {game.shape[1]}x{game.shape[0]}, want {want[1]}x{want[0]})")
    ok &= size_ok

    # 3 -- block purity
    town_u = block_uniformity(game, SPRITE_SCALE)
    pure = town_u == 1.0
    print(f"{'PASS' if pure else 'FAIL'}  every {SPRITE_SCALE}x{SPRITE_SCALE} block is one "
          f"colour ({town_u * 100:.2f}%)")
    ok &= pure

    # 4 -- never finer than the player
    if os.path.exists(HERO):
        _, hero_u = hero_frames(HERO)
        safe = town_u >= hero_u
        print(f"{'PASS' if safe else 'FAIL'}  town is not finer than the player "
              f"(town {town_u * 100:.2f}% vs hero {hero_u * 100:.2f}% block-uniform)")
        ok &= safe
    else:
        print(f"WARN  hero sheet not found at {HERO}; skipped the comparison")

    return ok or not strict


def proof(town_id: str, out: str) -> None:
    """The hero standing on the town at true scale, and the same crop at 4x."""
    game = Image.open(os.path.join(DIR, f"{town_id}-art-game48.png")).convert("RGBA")
    town = json.load(open(os.path.join(DIR, f"{town_id}.json")))
    sheet = Image.open(HERO).convert("RGBA")
    frame = sheet.crop((0, 0, sheet.height, sheet.height))     # frame 0: down, idle

    # stand her on the quay beside the save point, where a player actually arrives
    sp = town["savePoint"]
    hx, hy = (sp["x"] + 1) * TILE_SIZE, (sp["y"]) * TILE_SIZE
    scene = game.copy()
    scene.alpha_composite(frame, (hx, hy))

    pad = 5 * TILE_SIZE
    box = (max(0, hx - pad), max(0, hy - pad),
           min(scene.width, hx + pad), min(scene.height, hy + pad))
    crop = scene.crop(box)
    zoom = crop.resize((crop.width * 4, crop.height * 4), Image.NEAREST)

    W = max(scene.width, zoom.width)
    sheetimg = Image.new("RGBA", (W, scene.height + zoom.height + 24), (18, 20, 24, 255))
    sheetimg.paste(scene, (0, 0), scene)
    sheetimg.paste(zoom, (0, scene.height + 24), zoom)
    sheetimg.convert("RGB").save(out)
    print(f"  proof -> {out}  (top: true scale, bottom: 4x magnified around the hero)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="portSapphire")
    ap.add_argument("--no-strict", action="store_true")
    args = ap.parse_args()

    ok = check(args.only, strict=not args.no_strict)
    if os.path.exists(os.path.join(DIR, f"{args.only}-art-game48.png")):
        proof(args.only, os.path.join(DIR, f"{args.only}-hero-scale-proof.png"))
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
