#!/usr/bin/env python3
"""Cell-level collision plate for one Acts 2-5 runtime export (prototype, see
docs/plans/2026-10-28-acts2-5-runtime-wiring.md section 4).

    python3 scripts/build_act_plate.py <actN/runtime dir> <out plate.json>

The export's collision.png is feet-only at 32 px/cell (1 = blocked). The engine's movement field
(dq-tiles.js a1mFree -> owm field + canMove) is built from mapData TILES, so until dq-tiles grows a
per-act pixel pack (the a1fHeroFree generalisation) the act is written into mapData the Act 1 way
(act1-world-map.js writePlate): a cell is blocked when more than half of its pixels are.
Tile codes are act1_owner_paint_plate.mjs's: 0 open, 2 water/sea, 4 raised (mountain/forest
art), doors 6 (town) / 7 (dungeon) / 15 (Crystal). Doors are stamped from acts-hifi/manifest.json.
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts/acts'))
import acts_common as A  # noqa: E402


def main(runtime_dir, out):
    m = json.load(open(os.path.join(runtime_dir, 'manifest.json')))
    act, (x0, y0, x1, y1) = m['act'], m['bounds']
    ppc = m['collision']['pixelsPerCell']
    bits = np.asarray(Image.open(os.path.join(runtime_dir, m['collision']['file'])).convert('L')) > 0
    w, h = x1 - x0 + 1, y1 - y0 + 1
    frac = bits[:h * ppc, :w * ppc].reshape(h, ppc, w, ppc).mean(axis=(1, 3))
    cls, owner, _land = A.world()
    sub_cls, sub_owner = cls[y0:y1 + 1, x0:x1 + 1], owner[y0:y1 + 1, x0:x1 + 1]
    tiles = np.where(frac > 0.5, np.where(np.isin(sub_cls, (A.WATER, A.SEA)), 2, 4), 0).astype(np.int64)
    tiles[sub_owner != act] = -1                     # not this act's cell: leave mapData alone
    index = json.load(open(os.path.join(ROOT, 'public/acts-hifi/manifest.json')))
    doors = [L for L in index['landmarks'] if L['act'] == act]
    for L in doors:
        tiles[L['at'][1] - y0, L['at'][0] - x0] = L['tile']
        ex = L.get('exit')
        if ex and tiles[ex[1] - y0, ex[0] - x0] not in (0,):
            tiles[ex[1] - y0, ex[0] - x0] = 0        # the exit cell must stand, as in Act 1's SAFE
    rows = [''.join('.' if t < 0 else np.base_repr(int(t), 36).lower() for t in r) for r in tiles]
    json.dump({'act': act, 'bounds': m['bounds'], 'legend': "'.' = not this act, else base-36 tile",
               'rows': rows}, open(out, 'w'))
    print(f'act {act}: {w}x{h} cells, blocked {(tiles > 0).sum()}, open {(tiles == 0).sum()}, doors {len(doors)} -> {out}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
