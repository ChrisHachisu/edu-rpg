#!/usr/bin/env python3
"""Reachability audit of an act's collision.png: which landmark doors share a walkable component.
  python3 scripts/acts/check_collision.py 3"""
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as ndi
sys.path.insert(0, __import__('os').path.dirname(__file__))
import acts_common as A
act = int(sys.argv[1]); D = f'{A.SCRATCH}/act{act}'
m = json.load(open(D + '/manifest.json')); bx0, by0, bx1, by1 = m['bounds']
# --with N: also probe act N's landmarks that fall inside this act's raster (cross-act reachability)
if '--with' in sys.argv:
    o = json.load(open(f"{A.SCRATCH}/act{sys.argv[sys.argv.index('--with') + 1]}/manifest.json"))
    names = {l['name'] for l in m['landmarks']}
    m['landmarks'] += [l for l in o['landmarks'] if l['name'] not in names
                       and bx0 <= l['cell'][0] <= bx1 and by0 + 1 <= l['cell'][1] <= by1 - 1]
c = np.array(Image.open(D + '/collision.png')) > 0
f = 4; h, w = c.shape[0] // f, c.shape[1] // f
blocked = c[:h * f, :w * f].reshape(h, f, w, f).any((1, 3))   # 4 px feet grid, conservative
lab, n = ndi.label(~blocked)
sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
res = {}
for l in m['landmarks']:
    x, y = l['cell']
    # door probe: the cell just in front of the gate
    py = (y - by0) * 32 + 16 + (24 if l['gate'] == 'south' else -40); px = (x - bx0) * 32 + 16
    ys, xs = slice(max(0, py // f - 3), py // f + 4), slice(max(0, px // f - 3), px // f + 4)
    ids = set(np.unique(lab[ys, xs])) - {0}
    best = max(ids, key=lambda i: sizes[i - 1]) if ids else 0
    res[l['name']] = int(best)
comps = {}
for k, v in res.items(): comps.setdefault(v, []).append(k)
for v, ks in comps.items():
    print(f'component {v} ({int(sizes[v-1]) if v else 0} cells@4px):', ', '.join(ks))
