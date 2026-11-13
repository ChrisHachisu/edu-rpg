#!/usr/bin/env python3
"""Stand-in Acts 2-5 runtime export, for wiring tests before the real art lands.

    ACTS_VARIANT=C ACTS_OUT=<dir> python3 scripts/acts/placeholder_runtime.py [2 3 4 5]
    ACTS_VARIANT=C ACTS_OUT=<dir> python3 scripts/acts/export_collision_bin.py

Writes <dir>/actN/runtime/ in the layout of scripts/acts/export_runtime.py (format
flattened-ground-v0), from the owner's class raster alone (acts_common.world()):
  chunks/ground/cK-rJ.webp  64 px flat class colours (the runtime scales any chunk to 16 cells)
  collision.png             32 px per cell, 1 = blocked: every cell that is not open ground,
                            with each landmark's door cell and the cell at its gate side opened
  manifest.json             bounds, chunks, landmarks (all `carved`: no sprite file needed)
Nothing here is art. scripts/acts/install_runtime.py installs either this or the real export.
"""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import acts_common as A  # noqa: E402

TINT = {2: (207, 227, 242), 3: (217, 184, 120), 4: (138, 59, 42), 5: (86, 78, 96)}
CLASS = {A.FOREST: (38, 84, 52), A.MOUNT: (96, 90, 88), A.WATER: (64, 120, 190), A.SEA: (28, 70, 140)}


def gate_side(cls, x, y):
    return 'south' if cls[min(A.GH - 1, y + 1), x] == A.OPEN or cls[max(0, y - 1), x] != A.OPEN else 'north'


def export(act, cls, lms):
    b = A.owner()['acts'][str(act)]['bounds']; x0, y0, x1, y1 = b
    w, h = x1 - x0 + 1, y1 - y0 + 1
    out = f'{A.SCRATCH}/act{act}/runtime'
    os.makedirs(out + '/chunks/ground', exist_ok=True)
    sub = cls[y0:y1 + 1, x0:x1 + 1]
    blocked = sub != A.OPEN
    marks = []
    for L in lms:
        x, y = L['cell']
        if not (x0 <= x <= x1 and y0 <= y <= y1): continue
        g = gate_side(cls, x, y); dy = 1 if g == 'south' else -1
        for yy in (y, y + dy):
            if y0 <= yy <= y1: blocked[yy - y0, x - x0] = False
        if L['act'] == act:
            kind = 'town' if L['name'] in TOWNS else 'dungeon'
            marks.append({'carved': True, 'name': L['name'], 'slug': L['name'].lower().replace(' ', '-').replace("'", ''),
                          'cell': [x, y], 'size': 192 if kind == 'town' else 144, 'anchor': [96, 96], 'kind': kind, 'gate': g})
    Image.fromarray(np.kron(blocked, np.ones((A.P, A.P), bool)).astype(np.uint8) * 255, 'L').convert('1').save(out + '/collision.png')
    chunks = []
    for r in range(-(-h // 16)):
        for c in range(-(-w // 16)):
            cells = sub[r * 16:(r + 1) * 16, c * 16:(c + 1) * 16]
            img = np.zeros((16, 16, 3), np.uint8); img[:] = CLASS[A.SEA]
            ch, cw = cells.shape
            rgb = np.zeros((ch, cw, 3), np.uint8); rgb[:] = TINT[act]
            for k, col in CLASS.items(): rgb[cells == k] = col
            yy, xx = np.mgrid[0:ch, 0:cw]; rgb[((yy + xx) & 1) == 1] = (rgb[((yy + xx) & 1) == 1] * 0.94).astype(np.uint8)
            img[:ch, :cw] = rgb
            cid = f'c{c}-r{r}'
            Image.fromarray(np.kron(img, np.ones((4, 4, 1), np.uint8))).save(f'{out}/chunks/ground/{cid}.webp', lossless=True)
            chunks.append({'id': cid, 'x': c * 256, 'y': r * 256, 'width': cw * 16, 'height': ch * 16, 'ground': f'chunks/ground/{cid}.webp'})
    json.dump({'act': act, 'bounds': b, 'origin': [x0, y0], 'pixelsPerCell': A.P, 'chunkPx': 512, 'chunkCells': 16,
               'placeholder': True, 'format': 'flattened-ground-v0', 'layers': ['ground'],
               'collision': {'file': 'collision.png', 'pixelsPerCell': A.P, 'feetOnly': True, 'blocked': 1},
               'chunks': chunks, 'landmarks': marks}, open(out + '/manifest.json', 'w'), indent=1)
    print(f'act {act}: placeholder runtime, {len(chunks)} chunks, {len(marks)} landmarks -> {out}')


TOWNS = {'Ironkeep', 'Frostwatch', 'Ravenhollow', 'Ruins Camp', 'Oasis Haven', "Ember's Rest", 'Cinderwatch', 'Last Bastion', "Haven's Edge"}

if __name__ == '__main__':
    cls, _act, _land = A.world()
    lms = A.landmarks()
    for a in [int(v) for v in sys.argv[1:]] or [2, 3, 4, 5]:
        export(a, cls, lms)
