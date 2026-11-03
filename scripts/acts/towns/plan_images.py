"""Flat colour-key LAYOUT GUIDES for the Codex town briefs (Act 1 method: plan for WHERE, anchors for HOW).

Renders each town's round-2 composition (layouts.py -> compose.py) as a flat key: ground, pale
lanes, buildings as roof block + brown facade (shop red roof, healer green roof), walls, liquids,
border, trees. Writes <out>/<id>-layout-guide.png at 975 px (15 px per cell).

  python3 plan_images.py <out_dir> [ids]
"""
import os
import sys
from multiprocessing import Pool

import numpy as np
from PIL import Image

sys.setrecursionlimit(20000)
from compose import (C_BORDER, C_FIELD, C_LANE, C_OBJ, C_ROCK, C_ROOF, C_STONE, C_TREE, C_VOID,  # noqa: E402
                     C_WALL, C_WATER, compose, footprint)
from layouts import TOWNS  # noqa: E402

GROUND = {"snow": (226, 232, 240), "haunted": (186, 188, 204), "desert": (222, 192, 132),
          "ash": (96, 88, 84), "barren": (126, 116, 110)}
LIQUID = {"snow": (150, 196, 226), "haunted": (150, 180, 210), "desert": (40, 160, 170),
          "ash": (236, 96, 30), "barren": (40, 46, 80)}
ROOFS = [(70, 90, 140), (120, 70, 60), (90, 110, 90), (110, 100, 130), (140, 110, 70)]


def one(args):
    tid, out = args
    lay = dict(TOWNS[tid])
    comp = compose(lay)
    cls = comp["cls"]
    b = lay["biome"]
    img = np.zeros(cls.shape + (3,), np.uint8)
    img[:] = GROUND[b]
    img[cls == C_LANE] = (196, 194, 186)
    img[(cls == C_TREE)] = (40, 80, 50) if b not in ("ash", "barren", "haunted") else (60, 54, 50)
    img[(cls == C_ROCK) | (cls == C_BORDER)] = (104, 94, 86)
    img[(cls == C_WALL) | (cls == C_STONE)] = (84, 86, 98)
    img[cls == C_WATER] = LIQUID[b]
    img[cls == C_VOID] = (16, 10, 30)
    img[cls == C_OBJ] = (150, 120, 90)
    for i, p in enumerate(comp["placed"]):
        fp = footprint(p["kit"], p["at"][0], p["at"][1])
        # flat key: upper ~62% of the footprint is ROOF, the lower band the FACADE (faces down-screen)
        ys = np.nonzero(fp.any(1))[0]
        if not len(ys):
            continue
        cut = int(ys.max() - 0.38 * (ys.max() - ys.min()))
        roof = fp.copy(); roof[cut:] = False
        face = fp & ~roof
        col = ((214, 52, 52) if p.get("role") == "shop" else (52, 176, 84) if p.get("role") == "healer"
               else ROOFS[i % len(ROOFS)])
        img[face] = (112, 74, 46)
        img[roof] = col
    Image.fromarray(img).resize((975, 975), Image.NEAREST).save(os.path.join(out, f"{tid}-layout-guide.png"))
    return tid


if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    ids = sys.argv[2:] or list(TOWNS)
    with Pool(5) as p:
        print(p.map(one, [(t, out) for t in ids]))
