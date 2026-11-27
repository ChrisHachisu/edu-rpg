#!/usr/bin/env python3
"""Census: list suspicious frames (very dark, nearly flat, or mostly one colour) so they can be looked at and retaken.
   python3 scripts/auto/census/scan.py [src=/home/user/work/d4/c/out]   -> prints name mean sd darkfrac"""
import sys, os, glob, json
from PIL import Image
import statistics
src = sys.argv[1] if len(sys.argv) > 1 else '/home/user/work/d4/c/out'
rows = []
for f in sorted(glob.glob(os.path.join(src, '*.png'))):
    im = Image.open(f).convert('L').resize((97, 211))
    px = list(im.getdata()); m = statistics.mean(px); sd = statistics.pstdev(px); dark = sum(1 for p in px if p < 20) / len(px)
    rows.append((os.path.basename(f)[:-4], round(m), round(sd), round(dark, 2)))
bad = [r for r in rows if r[1] < 22 or r[2] < 18 or r[3] > 0.82]
for r in bad: print(*r)
print(len(rows), 'frames,', len(bad), 'suspicious', file=sys.stderr)
