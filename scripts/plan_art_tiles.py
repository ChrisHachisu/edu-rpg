#!/usr/bin/env python3
"""Plan the full act-by-act art-tile grid, WITH OVERLAP so adjacent tiles can be blended.

Why overlap. Every tile generated so far has been isolated and non-adjacent, so tile-to-tile
SEAMS have never been tested. Two neighbouring tiles generated independently will not agree at
their shared edge -- the image model has no knowledge of what it drew next door. The previous
pipeline solved this with a 3-cell overlap and separable linear blending, and it kept a
seam-report with a mean-step threshold of 24.0 to prove it worked
(dq-art-full-v2/seam-report-fixedbase2.json).

So tiles step by STRIDE = CELLS - OVERLAP, every tile still renders CELLS cells, and the
shared band is cross-faded at stitch time by scripts/stitch_art_tiles.py.

This is a PLANNER only -- it writes no images. It exists so the batch size, cost and tile
origins are known and reviewable before ~200 generations are launched.

Usage:
    plan_art_tiles.py [--cells 26] [--overlap 3] [--px 48] [act ...]
"""
from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/continent-terrain-class-method/owner-terrain")
SRC = os.path.join(DIR, "owner-terrain.json")
OUT = os.path.join(DIR, "art-tiles", "tile-plan.json")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_owner_semantic_maps import kind_of  # noqa: E402


def origins(span, cells, stride):
    """Tile origins covering `span` cells; the last is pulled back to stay in bounds."""
    if span <= cells:
        return [0]
    out = list(range(0, span - cells + 1, stride))
    if out[-1] != span - cells:
        out.append(span - cells)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("acts", nargs="*")
    ap.add_argument("--cells", type=int, default=26)
    ap.add_argument("--overlap", type=int, default=3)
    ap.add_argument("--px", type=int, default=48)
    args = ap.parse_args()
    N, OV, PX = args.cells, args.overlap, args.px
    stride = N - OV
    data = json.load(open(SRC))
    plan = {"cellsPerTile": N, "overlapCells": OV, "strideCells": stride,
            "pxPerCell": PX, "tilePx": N * PX, "acts": {}}
    tot_t = tot_l = 0
    print(f"tile {N} cells @ {PX}px = {N*PX}px, overlap {OV}, stride {stride}\n")
    for act in sorted(data["acts"]):
        if args.acts and act not in args.acts:
            continue
        A = data["acts"][act]
        x0, y0, x1, y1 = A["bounds"]
        w, h = x1 - x0 + 1, y1 - y0 + 1
        xs = origins(w, N, stride)
        ys = origins(h, N, stride)
        tiles = []
        for gy, oy in enumerate(ys):
            for gx, ox in enumerate(xs):
                tx, ty = x0 + ox, y0 + oy
                inside = {n: v for n, v in A["landmarks"].items()
                          if tx <= v[0] < tx + N and ty <= v[1] < ty + N}
                tiles.append({
                    "grid": [gx, gy], "worldTopLeft": [tx, ty],
                    "base": f"act{act}-tile-{tx}-{ty}-base.png",
                    "art": f"act{act}-tile-{tx}-{ty}-ART.png",
                    "mask": f"act{act}-tile-{tx}-{ty}-semantic-smooth-{N}.png",
                    "landmarks": {n: {"cell": v, "kind": kind_of(n)}
                                  for n, v in inside.items()},
                })
        lms = list(A["landmarks"])
        plan["acts"][act] = {"bounds": [x0, y0, x1, y1], "cells": [w, h],
                             "grid": [len(xs), len(ys)], "tiles": tiles,
                             "landmarks": {n: kind_of(n) for n in lms}}
        print(f"act {act}: {w}x{h} cells -> {len(xs)}x{len(ys)} = {len(tiles)} tiles, "
              f"{len(lms)} landmarks")
        tot_t += len(tiles)
        tot_l += len(lms)
    plan["totals"] = {"tiles": tot_t, "sprites": tot_l, "generations": tot_t + tot_l}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(plan, open(OUT, "w"), indent=1)
    print(f"\nTOTAL {tot_t} tiles + {tot_l} sprites = {tot_t + tot_l} generations")
    print(f"plan: {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
