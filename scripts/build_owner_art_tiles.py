#!/usr/bin/env python3
"""Cut semantic ART-INPUT tiles from the owner's painted terrain at RUNTIME scale.

Why this exists: the first act-1 art pass was generated at 16 px per world cell and
collapsed into flat texture fill. The runtime draws a world cell at TILE_SIZE = 48 px
(src/utils/constants.ts), and the approved method test
(design/review/.../semantic-test/tile-*-ART.png) worked at that same ~48 px/cell. Detail
of the approved density -- individual conifers with trunks and cast shadows, ferns,
boulders, leaf litter -- is not representable at 16 px/cell.

So art inputs are cut as 32x32-cell tiles at 48 px/cell = 1536x1536 px.

NO marker discs are drawn. Last pass the model had to erase eight annotation discs and
restore ground beneath them; omitting them removes that failure mode entirely. Landmark
positions are reported in the manifest for the brief instead.

Usage:
    build_owner_art_tiles.py <act> [--cells 32] [--px 48] [--tiles x,y x,y ...]
    build_owner_art_tiles.py <act> --survey     # rank candidate tiles by class mix
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/continent-terrain-class-method/owner-terrain")
SRC = os.path.join(DIR, "owner-terrain.json")
PACK = os.path.join(ROOT, "design/review/overworld-art-blueprint/continent/continent-macro-g3")
OUT = os.path.join(DIR, "art-tiles")

ROLE = {".": ("ground", (226, 210, 156)), "F": ("vegetation", (26, 82, 46)),
        "M": ("rock", (128, 126, 122)), "W": ("water", (30, 82, 170)),
        "R": ("path", (170, 120, 60))}
SEA = (30, 82, 170)


def class_grid(act: str):
    data = json.load(open(SRC))
    A = data["acts"][act]
    x0, y0, x1, y1 = A["bounds"]
    rows = A["terrainRows"]
    land = np.load(os.path.join(PACK, "land-mask.npy"))
    w, h = x1 - x0 + 1, y1 - y0 + 1
    role = np.empty((h, w), dtype=object)
    for yy in range(h):
        for xx in range(w):
            role[yy, xx] = "water" if not land[y0 + yy, x0 + xx] else ROLE[rows[yy][xx]][0]
    return A, (x0, y0), role


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("act")
    ap.add_argument("--cells", type=int, default=32)
    ap.add_argument("--px", type=int, default=48)
    ap.add_argument("--tiles", nargs="*", default=None,
                    help="world-cell top-left corners, e.g. 88,220 136,256")
    ap.add_argument("--survey", action="store_true")
    args = ap.parse_args()

    A, (x0, y0), role = class_grid(args.act)
    h, w = role.shape
    N, PX = args.cells, args.px
    RGB = {k: v for k, v in
           [(ROLE[c][0], ROLE[c][1]) for c in ROLE] + [("water", SEA)]}

    if args.survey:
        # rank windows by how many distinct classes they hold and how balanced they are
        cands = []
        for wy in range(0, h - N + 1, N // 2):
            for wx in range(0, w - N + 1, N // 2):
                win = role[wy:wy + N, wx:wx + N]
                cnt = {c: int((win == c).sum()) for c in set(win.ravel())}
                if len(cnt) < 2:
                    continue
                tot = N * N
                # balance score: reward many classes each with real presence
                real = [c for c, n in cnt.items() if n / tot >= 0.08]
                score = len(real) * 100 + min(cnt.values()) / tot * 100
                cands.append((score, wx + x0, wy + y0, cnt))
        cands.sort(reverse=True)
        print(f"act {args.act}: top candidate {N}x{N}-cell tiles (world top-left)")
        for s, wx, wy, cnt in cands[:16]:
            mix = "  ".join(f"{c} {100*n/(N*N):.0f}%" for c, n in
                            sorted(cnt.items(), key=lambda kv: -kv[1]))
            print(f"  ({wx:>3},{wy:>3})  score {s:6.1f}   {mix}")
        return

    if not args.tiles:
        raise SystemExit("give --tiles x,y ... or --survey")
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    for spec in args.tiles:
        tx, ty = (int(v) for v in spec.split(","))
        cx, cy = tx - x0, ty - y0
        if not (0 <= cx and cx + N <= w and 0 <= cy and cy + N <= h):
            raise SystemExit(f"tile {spec} outside act {args.act} bounds")
        win = role[cy:cy + N, cx:cx + N]
        img = np.zeros((N, N, 3), dtype=np.uint8)
        for c in set(win.ravel()):
            img[win == c] = RGB[c]
        out = Image.fromarray(img).resize((N * PX, N * PX), Image.Resampling.NEAREST)
        name = f"act{args.act}-tile-{tx}-{ty}-semantic.png"
        out.save(os.path.join(OUT, name))
        cnt = {c: int((win == c).sum()) for c in set(win.ravel())}
        inside = {n: v for n, v in A["landmarks"].items()
                  if tx <= v[0] < tx + N and ty <= v[1] < ty + N}
        manifest.append({
            "tile": name, "worldTopLeft": [tx, ty], "cells": N, "pxPerCell": PX,
            "size": [N * PX, N * PX],
            "composition": {c: round(100 * n / (N * N), 1) for c, n in
                            sorted(cnt.items(), key=lambda kv: -kv[1])},
            "landmarksInside": inside,
            "artOut": name.replace("-semantic", "-ART"),
        })
        print(f"{name}  {N*PX}x{N*PX}  " +
              "  ".join(f"{c} {100*n/(N*N):.0f}%" for c, n in
                        sorted(cnt.items(), key=lambda kv: -kv[1])) +
              (f"  landmarks: {', '.join(inside)}" if inside else ""))
    mp = os.path.join(OUT, f"act{args.act}-tiles.json")
    json.dump({"act": args.act, "pxPerCell": PX, "cellsPerTile": N,
               "runtimeTileSize": 48, "tiles": manifest}, open(mp, "w"), indent=1)
    print("manifest:", os.path.relpath(mp, ROOT))


if __name__ == "__main__":
    main()
