#!/usr/bin/env python3
"""Overworld landmark gate check with the hero feet stencil (same construction as
towns/check_feet.py overworld(): hero-g3 sheet union, HERO_SCALE 1.0125 / OW_SCALE 0.7, bottom 10 px).
For each landmark of an act: gate channel width (cells, row just in front of the door) and whether the
stencil can reach the door cell from 3 cells in front of it.   python3 scripts/acts/check_gates.py 2 3 4 5"""
import os, sys, json, numpy as np
from PIL import Image
from scipy import ndimage as ndi
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import acts_common as A
Image.MAX_IMAGE_PIXELS = None
SHEET = A.ROOT + '/public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png'
a = np.asarray(Image.open(SHEET).convert('RGBA'))[..., 3] > 8
u = np.zeros((64, 64), bool)
for r in range(a.shape[0] // 64):
    for c in range(a.shape[1] // 64): u |= a[r * 64:(r + 1) * 64, c * 64:(c + 1) * 64]
ys, xs = np.nonzero(u); k = 1.0125 / 0.7 * 32 / 48
pts = np.array(sorted({(int(round((x + .5 - 32) * k)), int(round((y + .5 - 32) * k))) for x, y in zip(xs, ys)}))
pts = pts[pts[:, 1] >= pts[:, 1].max() - 10]; pts[:, 1] -= pts[:, 1].max()     # sole at 0
mx = int(np.abs(pts).max()); st = np.zeros((2 * mx + 1, 2 * mx + 1), bool); st[pts[:, 1] + mx, pts[:, 0] + mx] = True
print(f'feet stencil {np.ptp(pts[:, 0]) + 1} px = {(np.ptp(pts[:, 0]) + 1) / 32:.2f} cells wide')
bad = 0
for act in [int(x) for x in sys.argv[1:]] or [2, 3, 4, 5]:
    D = f'{A.SCRATCH}/act{act}'; m = json.load(open(D + '/manifest.json')); bx0, by0 = m['bounds'][:2]
    col = np.asarray(Image.open(D + '/collision.png')) > 0
    for l in m['landmarks']:
        x, y = l['cell']; px, py = (x - bx0) * 32 + 16, (y - by0) * 32 + 16
        sgn = 1 if l['gate'] == 'south' else -1
        y0, y1 = max(0, py - 8 * 32), min(col.shape[0], py + 8 * 32); x0, x1 = max(0, px - 8 * 32), min(col.shape[1], px + 8 * 32)
        sub = col[y0:y1, x0:x1]
        free = ndi.binary_erosion(~sub, structure=st, border_value=1); lab, _ = ndi.label(free)
        door = lab[py - y0 - 4:py - y0 + 12, px - x0 - 8:px - x0 + 9]           # feet within the door cell
        q = py - y0 + sgn * 3 * 32; front = lab[q - 6:q + 6, px - x0 - 6:px - x0 + 6]
        ok = bool(set(np.unique(door)) - {0} & set(np.unique(front)) - {0})
        row = ~sub[py - y0 + sgn * 24]; c = px - x0; L = R = c
        while L > 0 and row[L - 1]: L -= 1
        while R < len(row) - 1 and row[R + 1]: R += 1
        w = (R - L + 1) / 32 if row[c] else 0
        bad += not ok
        print(f'  act{act} {l["kind"]:8s} {l["name"][:28]:28s} {l["gate"]:5s} channel {w:5.2f} cells  door reachable: {"yes" if ok else "NO"}')
print('FAIL' if bad else 'all doors reachable', bad)
