#!/usr/bin/env python3
"""Render the semantic maps from the GAME'S OWN overworld grid.

Owner, 2026-07-25: terrain and landmarks must "have the same blocking rules that
were in the original version". The surest way to have the same blocking rules is
to take them from the thing that has them.

`build_semantic_map.py` renders the g2/g3 CLASS MAP, an independently authored
continent. Three review rounds of "this doesn't make sense" all trace to the same
thing: the class map and the game disagree about where the walls are. Measured,
the class map has Act 2 at 23% walkable and Act 4 at 28%, while the game has the
same landmasses at 68% and 67%; the class map has no river barrier, no wall
barrier and no flanking forest in Act 2, all three of which the player actually
walks into; and it puts Scorched Ruins 76 cells from where the game puts it.

This renderer takes the blocked/passable structure straight from
`generateOverworldMap`, so every wall on the map is a wall the player hits, in the
cell they hit it. Biome flavour still comes from ACT_THEME, and the marker and
blur machinery is imported from `build_semantic_map` so the two outputs are
directly comparable -- same palette, same 16 px cells, same organic boundaries.

Requires the runtime grid, which needs no game session:

    node node_modules/typescript/bin/tsc src/utils/MapGenerator.ts \\
        --outDir <tmp> --target ES2020 --module commonjs --skipLibCheck
    node -e "require('<tmp>/MapGenerator.js').generateOverworldMap(320,400)"

`export_runtime_grid()` does both and caches the result next to the maps.
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile

import numpy as np
from PIL import Image

import build_semantic_map as S

ROOT = S.ROOT
OUT = os.path.join(ROOT, "design/continent-terrain-class-method/semantic-maps")
GRID_CACHE = os.path.join(OUT, "runtime-overworld-grid.json")

# Overworld tile ids, from the header of src/utils/MapGenerator.ts. Anything the
# player can stand on is GROUND -- including every landmark tile, because a town
# or cave mouth is entered from walkable ground and must not read as a wall.
RUNTIME_ROLE = {
    "ground": {0, 1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20},
    "vegetation": {3},
    "rock": {4, 14},
    "water": {2},
}
# 16 = frozenLake reads as ice, not as open water, so it stays walkable ground the
# way the game treats it; 17 = mist is an overlay over walkable ground.


def export_runtime_grid(force: bool = False) -> np.ndarray:
    if os.path.exists(GRID_CACHE) and not force:
        return np.asarray(json.load(open(GRID_CACHE)), dtype=np.int16)
    with tempfile.TemporaryDirectory(prefix="rt-mapgen-") as tmp:
        subprocess.run(
            ["node", os.path.join(ROOT, "node_modules/typescript/bin/tsc"),
             os.path.join(ROOT, "src/utils/MapGenerator.ts"),
             "--outDir", tmp, "--target", "ES2020", "--module", "commonjs", "--skipLibCheck"],
            cwd=ROOT, check=False, capture_output=True,
        )
        built = os.path.join(tmp, "MapGenerator.js")
        if not os.path.exists(built):
            raise SystemExit("could not compile MapGenerator.ts")
        out = subprocess.run(
            ["node", "-e",
             f"process.stdout.write(JSON.stringify(require({built!r}).generateOverworldMap(320,400)))"],
            cwd=ROOT, check=True, capture_output=True, text=True,
        )
    grid = json.loads(out.stdout)
    json.dump(grid, open(GRID_CACHE, "w"))
    return np.asarray(grid, dtype=np.int16)


def build(act: int, grid: np.ndarray, px: int = 16, pad: int = 4):
    x0, y0, x1, y1 = S.ACTS[act]
    ys, ye = max(0, y0 - pad), min(grid.shape[0], y1 + 1 + pad)
    xs, xe = max(0, x0 - pad), min(grid.shape[1], x1 + 1 + pad)
    sub = grid[ys:ye, xs:xe]

    theme, ground_rgb, ground_desc, veg_desc, rock_desc, water_desc = S.ACT_THEME[act]
    fields, colours, legend = [], [], []
    for key, rgb, desc in (("ground", ground_rgb, ground_desc),
                           ("vegetation", S.VEG_RGB, veg_desc),
                           ("rock", S.ROCK_RGB, rock_desc),
                           ("water", S.WATER_RGB, water_desc)):
        mask = np.isin(sub, list(RUNTIME_ROLE[key]))
        if not mask.any():
            continue
        fields.append(S._mask_field(mask, px, S.BLUR_CELLS))
        colours.append(rgb)
        legend.append({"key": key, "rgb": list(rgb), "means": desc, "cells": int(mask.sum())})

    idx = np.argmax(np.stack(fields), axis=0)
    art = np.zeros((*idx.shape, 3), dtype=np.uint8)
    for i, rgb in enumerate(colours):
        art[idx == i] = rgb
    legend.extend(S._stamp_landmarks(art, act, xs, ys, px))

    top, left = (y0 - ys) * px, (x0 - xs) * px
    h, w = (y1 - y0 + 1) * px, (x1 - x0 + 1) * px
    return Image.fromarray(art[top:top + h, left:left + w]), legend


def main() -> None:
    grid = export_runtime_grid()
    index = {}
    for act in sorted(S.ACTS):
        img, legend = build(act, grid)
        path = os.path.join(OUT, f"act{act}-semantic-runtime.png")
        img.save(path, optimize=True)
        index[f"act{act}"] = {"bounds": S.ACTS[act], "pxPerCell": 16, "size": list(img.size),
                              "theme": S.ACT_THEME[act][0], "source": "generateOverworldMap",
                              "path": os.path.relpath(path, ROOT), "legend": legend}
        walk = sum(r["cells"] for r in legend if r["key"] == "ground")
        land = sum(r["cells"] for r in legend if r["key"] in ("ground", "vegetation", "rock"))
        print(f"act{act}: {img.size[0]}x{img.size[1]}  walkable {100 * walk / max(land, 1):.1f}% of land")
    json.dump(index, open(os.path.join(OUT, "semantic-maps-runtime-index.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
