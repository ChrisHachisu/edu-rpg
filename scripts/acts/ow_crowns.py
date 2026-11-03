#!/usr/bin/env python3
"""Overworld palm (Act 3 oasis) and leafless dead-tree (Act 5) crowns, drawn with the towns agent's
procedural method (scripts/acts/towns/procprops.py: half-resolution drawing, Act 1 leaf texture
skin, 1-logical-px dark outline, 2x nearest upscale -> Act 1 2-px pixel grain).

Like the Act 1 canopy atlas crowns (each a small clump of 2-3 trees), every sprite is a clump of
2-3 trees, fitted so its longer side is 68 world px = 136 px at 32 px/cell, the Act 1 crown side.
7 variants each, indexed like the 7 Act 1 crowns, so placements are reused unchanged.
Each crown also has a SOLID mask (closed, hole-filled silhouette) for feet collision, so gaps
between fronds/branches never open a walkable hole through a forest.
"""
import os, sys, math, functools
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'towns'))
import procprops as PP   # palm(), dead_tree(), skin(), OUTLINE

HALF = 68           # half-res target longer side (x2 nearest -> 136 px)

def dead_tree_big(seed, H=96, W=80):
    """procprops.dead_tree at a larger half-res canvas: same branching rule, same two-tone bark."""
    rng = np.random.default_rng(seed)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    def branch(x, y, ang, ln, w, depth):
        x2 = x + math.cos(ang) * ln; y2 = y + math.sin(ang) * ln
        d.line([(x, y), (x2, y2)], fill=(84, 66, 50, 255), width=max(1, int(w)))
        if w > 1.5:
            d.line([(x - w / 3, y), (x2 - w / 3, y2)], fill=(122, 100, 78, 255), width=1)
        if depth > 0:
            for s in (-1, 1):
                if depth <= 2 and rng.random() < 0.25: continue
                branch(x2, y2, ang + s * rng.uniform(0.35, 0.75), ln * rng.uniform(0.6, 0.78), w * 0.62, depth - 1)
    branch(W / 2, H - 4, -math.pi / 2 + rng.uniform(-0.12, 0.12), 26, 7, 5)
    d.ellipse([W / 2 - 9, H - 7, W / 2 + 9, H - 1], fill=(66, 52, 40, 255))
    return im

def _clump(kind, seed):
    """Compose 2-3 trees (back first) on a supersampled half-res canvas, then fit to HALF px."""
    rng = np.random.default_rng(seed)
    n = 3 if rng.random() < 0.6 else 2
    can = Image.new('RGBA', (190, 190), (0, 0, 0, 0))
    spots = [(-30, -16), (30, -10), (0, 14)] if n == 3 else [(-22, -6), (22, 6)]
    rng.shuffle(spots); spots.sort(key=lambda s: s[1])
    for k, (dx, dy) in enumerate(spots):
        if kind == 'palm':
            t = PP.palm(seed * 7 + k, lean=1 if (k + seed) % 2 == 0 else -1)
        else:
            t = dead_tree_big(seed * 7 + k)
        s = rng.uniform(0.85, 1.0); t = t.resize((round(t.width * s), round(t.height * s)), Image.NEAREST)
        can.alpha_composite(t, (95 + dx - t.width // 2, 175 + dy - t.height))
    a = np.asarray(can); ys, xs = np.nonzero(a[..., 3] > 0)
    can = can.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    f = (HALF - 2) / max(can.size)
    sm = can.resize((max(1, round(can.width * f)), max(1, round(can.height * f))), Image.LANCZOS)
    arr = np.asarray(sm).copy(); al = arr[..., 3]
    thr = 90 if kind == 'dead' else 110          # keep thin twigs connected
    arr[..., 3] = np.where(al >= thr, 255, 0)
    # un-premultiply-ish: fringe pixels were darkened by transparent black in LANCZOS
    m = arr[..., 3] > 0
    arr[m, :3] = np.clip(arr[m, :3].astype(np.float32) * (255.0 / np.maximum(al[m], 1))[:, None], 0, 255).astype(np.uint8)
    return arr

def _finish(arr, kind):
    a = PP.skin(arr.copy(), 0.4 if kind == 'palm' else 1.0)
    pad = np.zeros((a.shape[0] + 2, a.shape[1] + 2, 4), np.uint8); pad[1:-1, 1:-1] = a; a = pad
    al = a[..., 3] > 0
    ring = ndi.binary_dilation(al, iterations=1) & ~al
    a[ring] = PP.OUTLINE
    up = np.asarray(Image.fromarray(a, 'RGBA').resize((a.shape[1] * 2, a.shape[0] * 2), Image.NEAREST)).copy()
    solid = up[..., 3] > 0
    solid = ndi.binary_fill_holes(ndi.binary_closing(np.pad(solid, 12), iterations=10))[12:-12, 12:-12]
    return up, solid

@functools.lru_cache(None)
def crowns(kind):
    """-> list of 7 (rgba uint8, solid bool) at final 32 px/cell size."""
    return [_finish(_clump(kind, 1000 * (kind == 'dead') + 41 * i + 5), kind) for i in range(7)]

if __name__ == '__main__':
    sys.path.insert(0, HERE); import acts_common as A
    for kind, bg in (('palm', (228, 190, 124)), ('dead', (60, 53, 64))):
        cs = crowns(kind); W = sum(c[0].shape[1] + 10 for c in cs)
        sheet = Image.new('RGBA', (W, 160), bg + (255,)); x = 0
        for c, s in cs: sheet.alpha_composite(Image.fromarray(c), (x, 160 - c.shape[0])); x += c.shape[1] + 10
        sheet.convert('RGB').resize((W * 2, 320), Image.NEAREST).save(f'{A.SCRATCH}/crowns-{kind}.png')
        print(kind, [c[0].shape for c in cs])
