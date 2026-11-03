#!/usr/bin/env python3
"""Act 3+4 joint reachability on a stitched collision (Act 4 raster for y<88, Act 3 raster for y>=88).
  ACTS_OUT=<variant dir> python3 scripts/acts/check_act34.py"""
import sys, os, json, numpy as np
from PIL import Image
from scipy import ndimage as ndi
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import acts_common as A
m3 = json.load(open(f'{A.SCRATCH}/act3/manifest.json')); m4 = json.load(open(f'{A.SCRATCH}/act4/manifest.json'))
c3 = np.array(Image.open(f'{A.SCRATCH}/act3/collision.png')) > 0; c4 = np.array(Image.open(f'{A.SCRATCH}/act4/collision.png')) > 0
y0 = 3; H = (221 - y0 + 1) * 32; W = 152 * 32
c = np.zeros((H, W), bool); c[:(88 - y0) * 32] = c4[:(88 - y0) * 32]; c[(88 - y0) * 32:] = c3[:H - (88 - y0) * 32]
f = 4; b = c.reshape(H // f, f, W // f, f).any((1, 3)); lab, n = ndi.label(~b)
sz = ndi.sum(np.ones_like(lab), lab, range(1, n + 1)); comps = {}
for l in m3['landmarks'] + m4['landmarks']:
    x, y = l['cell']; py = (y - y0) * 32 + 16 + (24 if l['gate'] == 'south' else -40); px = (x - 163) * 32 + 16
    ids = set(np.unique(lab[max(0, py // f - 3):py // f + 4, max(0, px // f - 3):px // f + 4])) - {0}
    k = max(ids, key=lambda i: sz[i - 1]) if ids else 0; comps.setdefault(k, []).append(l['name'])
for k, v in comps.items(): print(f'component {k}:', ', '.join(v))
