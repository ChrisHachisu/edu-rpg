"""Shared world data for the Acts 2-5 overworld art (cloud renderer).
World grid: 320 (x) by 400 (y) cells. Art: 32 px per cell."""
import json, os
import numpy as np
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OWNER = ROOT + '/design/continent-terrain-class-method/owner-terrain/owner-terrain.json'
LANDMASK = ROOT + '/design/review/overworld-art-blueprint/continent/continent-macro-g3/land-mask.npy'
SCRATCH = os.environ.get('ACTS_OUT', '/tmp/claude-0/-home-claude/c446ac0c-2689-576d-8fff-6176ff6d9aad/scratchpad/acts/overworld')
PREVIEW = os.environ.get('ACTS_PREVIEW', '/mnt/project-files/edu-rpg/acts-preview/overworld')
GW, GH, P = 320, 400, 32
# class codes
OPEN, FOREST, MOUNT, WATER, SEA = 0, 1, 2, 3, 4
CODE = {'.': OPEN, 'R': OPEN, 'F': FOREST, 'M': MOUNT, 'W': WATER}
# composite order: later wins.  Act 4 is painted after Act 3 (owner composite: Act 4 wins in y 88-128)
ORDER = ['1', '2', '3', '5', '4']

def owner():
    return json.load(open(OWNER))

def world(order=ORDER):
    """Returns cls[y,x] (uint8 class), act[y,x] (int8 act number, 0 = none), land[y,x] bool."""
    d = owner(); cls = np.full((GH, GW), OPEN, np.uint8); act = np.zeros((GH, GW), np.int8)
    for k in order:
        a = d['acts'][k]; x0, y0, x1, y1 = a['bounds']
        for j, row in enumerate(a['terrainRows']):
            for i, ch in enumerate(row):
                cls[y0 + j, x0 + i] = CODE.get(ch, OPEN); act[y0 + j, x0 + i] = int(k)
    land = np.load(LANDMASK).astype(bool)
    cls = np.where(land, cls, SEA).astype(np.uint8)
    v = os.environ.get('ACTS_VARIANT', '')
    if v == 'A' and order is ORDER:
        # candidate A: Act 3's painted rows win in the Act 3/4 overlap (y 88-128)
        return world(['1', '2', '4', '5', '3'])
    if v == 'B' and order is ORDER:
        # candidate B: Act 4 stays on top; narrow 3-cell passes cut through Act 4's dividing range
        # (y 117-129) south to Act 3's open ground, at Desert Tomb (x 269-271) and the Magma mouth (x 191-193)
        for x0 in (269, 191):
            for y in range(110, 132):
                for x in range(x0, x0 + 3):
                    if cls[y, x] == MOUNT: cls[y, x] = OPEN
    return cls, act, land

def landmarks():
    d = owner(); out = []
    for k in ['1', '2', '3', '4', '5']:
        for name, (x, y) in d['acts'][k]['landmarks'].items():
            out.append({'act': int(k), 'name': name, 'cell': [x, y]})
    return out
