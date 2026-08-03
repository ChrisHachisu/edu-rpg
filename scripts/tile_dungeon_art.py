#!/usr/bin/env python3
"""Cut the dungeon art bases into the proven production tile, with per-tile truth masks.

The overworld's shipped unit is a **1248x1248 tile = 26x26 cells at 48 px** — that is what
`art-tiles/*-ART.png` are, and what the single-tile dungeon pilot used when it came back
0/676. Generating a whole 65x58 floor in one call would mean ~19 px per cell, well under the
density the hero art was built against, so large floors are tiled.

Tiles overlap by 3 cells, matching the overworld brief's seam rule: a tile's right band is the
same ground as its neighbour's left band, so reproducing each base faithfully is what makes the
join match. The stitcher later cuts the seam through the overlap.

Each tile ships with:
  <id>-tile-<tx>-<ty>-base.png   the art base crop — composition truth for the art pass
  <id>-tile-<tx>-<ty>.json       per-cell rows for that tile, for verification
  <id>-tile-<tx>-<ty>-mask.png   the same as a hard two-colour map, for eyeballing

Usage:
  tile_dungeon_art.py                 # every floor
  tile_dungeon_art.py --only sunkenCellar
"""
from __future__ import annotations

import argparse
import glob
import json
import math
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/act1-dungeon-interiors")
TILES = os.path.join(DIR, "art-tiles")

CELLS = 26        # cells per tile — the proven unit
PX = 48           # TILE_SIZE, src/utils/constants.ts
OVERLAP = 3       # cells shared with the neighbour, per the overworld seam rule

SAND = (226, 210, 156)     # walkable, same contract colour the overworld art pass uses
ROCK = (40, 38, 44)


def tile_origins(extent: int) -> list[int]:
    """Left edges of the tiles covering `extent` cells, overlapping by OVERLAP.

    The last tile is pulled back flush with the far edge rather than hanging off it, so no tile
    contains cells that do not exist.
    """
    step = CELLS - OVERLAP
    if extent <= CELLS:
        return [0]
    starts = list(range(0, extent - CELLS + 1, step))
    if starts[-1] != extent - CELLS:
        starts.append(extent - CELLS)
    return starts


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    args = ap.parse_args()
    os.makedirs(TILES, exist_ok=True)

    manifest = []
    paths = sorted(glob.glob(os.path.join(DIR, "*-f*.json")))
    for p in paths:
        fl = json.load(open(p))
        if args.only and fl["dungeonId"] != args.only:
            continue
        base_path = os.path.join(DIR, f"{fl['id']}-artbase.png")
        if not os.path.exists(base_path):
            print(f"  no art base for {fl['id']} — run smooth_dungeon_semantic.py --artbase")
            continue
        base = Image.open(base_path)
        rows = fl["rows"]
        w, h = fl["width"], fl["height"]

        for ty in tile_origins(h):
            for tx in tile_origins(w):
                name = f"{fl['id']}-tile-{tx}-{ty}"
                crop = base.crop((tx * PX, ty * PX, (tx + CELLS) * PX, (ty + CELLS) * PX))
                crop.save(os.path.join(TILES, f"{name}-base.png"))

                sub = [r[tx:tx + CELLS] for r in rows[ty:ty + CELLS]]
                grid = np.array([[0 if c == "#" else 1 for c in r] for r in sub])
                mask = np.zeros((CELLS * PX, CELLS * PX, 3), dtype=np.uint8)
                big = np.repeat(np.repeat(grid, PX, 0), PX, 1)
                mask[big == 1] = SAND
                mask[big == 0] = ROCK
                Image.fromarray(mask).save(os.path.join(TILES, f"{name}-mask.png"))

                floor_frac = float(grid.mean())
                json.dump({"tile": name, "floor": fl["id"], "dungeon": fl["dungeonId"],
                           "theme": fl["theme"], "cellOrigin": [tx, ty], "cells": CELLS,
                           "pxPerCell": PX, "size": [CELLS * PX, CELLS * PX],
                           "floorFraction": round(floor_frac, 4),
                           "rows": ["".join("." if v else "#" for v in r) for r in grid]},
                          open(os.path.join(TILES, f"{name}.json"), "w"), indent=1)
                manifest.append({"tile": name, "floor": fl["id"], "origin": [tx, ty],
                                 "floorFraction": round(floor_frac, 4)})

    if manifest:
        json.dump({"_source": "scripts/tile_dungeon_art.py", "cellsPerTile": CELLS,
                   "pxPerCell": PX, "overlapCells": OVERLAP,
                   "artOut": "<tile>-ART.png", "tiles": manifest},
                  open(os.path.join(TILES, "tiles.json"), "w"), indent=1)
        by_floor: dict[str, int] = {}
        for m in manifest:
            by_floor[m["floor"]] = by_floor.get(m["floor"], 0) + 1
        for k, v in sorted(by_floor.items()):
            print(f"  {k:26s} {v:2d} tiles")
        # A tile that is nearly all rock teaches the art pass nothing and costs a full call.
        blank = [m["tile"] for m in manifest if m["floorFraction"] < 0.04]
        print(f"\n{len(manifest)} tiles written to {os.path.relpath(TILES, ROOT)}")
        if blank:
            print(f"{len(blank)} tiles are <4% floor — near-solid rock, cheap to fill "
                  f"procedurally instead of generating:")
            for b in blank[:6]:
                print(f"   {b}")


if __name__ == "__main__":
    main()
