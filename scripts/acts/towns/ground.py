#!/usr/bin/env python3
"""Quilt full-plate ground fields (lawn, cobble) from the Act 1 plates' OWN ground pixels.

Image quilting (Efros & Freeman 2001): random candidate blocks from a clean source patch, chosen
by overlap error, joined along a minimum-error cut. The source is the shipped Act 1 plate, so the
grain, cobble size and pixel lattice match the kit cut-outs exactly (the generated ground swatches
in design/act1-towns/ground/ have visibly larger cobbles than the plates and were not used).

Output: $SCRATCH/ground/{lawn,cobble}.png  1950x1950 RGB, cached.
"""
import os
import sys

import numpy as np
from PIL import Image

from kitlib import ACT1_TOWN, PLATE, SCRATCH

SOURCES = {
    # town, box (x0,y0,x1,y1) of clean ground in the 1950 plate
    "lawn": ("portSapphire", (20, 20, 440, 280)),
    "cobble": ("greenhollow", (840, 560, 1070, 850)),
    "cliff": ("greenhollow", (0, 10, 155, 480)),
}


def min_cut_path(err):
    """err: H x W overlap error; returns for each row the column of the cut (vertical seam)."""
    H, W = err.shape
    cost = err.copy()
    back = np.zeros((H, W), int)
    for i in range(1, H):
        prev = cost[i - 1]
        l = np.r_[np.inf, prev[:-1]]
        r = np.r_[prev[1:], np.inf]
        stack = np.vstack([l, prev, r])
        k = stack.argmin(0)
        back[i] = k - 1
        cost[i] += stack[k, np.arange(W)]
    path = np.zeros(H, int)
    path[-1] = cost[-1].argmin()
    for i in range(H - 1, 0, -1):
        path[i - 1] = np.clip(path[i] + back[i, path[i]], 0, W - 1)
    return path


def quilt(src, H, W, block=64, ov=16, cand=90, seed=1):
    rng = np.random.default_rng(seed)
    src = src.astype(np.float32)
    sh, sw = src.shape[:2]
    step = block - ov
    ny = (H - ov) // step + 2
    nx = (W - ov) // step + 2
    out = np.zeros((ny * step + ov, nx * step + ov, 3), np.float32)
    for by in range(ny):
        for bx in range(nx):
            y, x = by * step, bx * step
            ys = rng.integers(0, sh - block, cand)
            xs = rng.integers(0, sw - block, cand)
            errs = np.zeros(cand, np.float32)
            for c in range(cand):
                b = src[ys[c]:ys[c] + block, xs[c]:xs[c] + block]
                e = 0.0
                if bx > 0:
                    e += ((b[:, :ov] - out[y:y + block, x:x + ov]) ** 2).sum()
                if by > 0:
                    e += ((b[:ov] - out[y:y + ov, x:x + block]) ** 2).sum()
                errs[c] = e
            best = np.argsort(errs)[:3]
            c = best[rng.integers(0, len(best))] if by + bx > 0 else 0
            b = src[ys[c]:ys[c] + block, xs[c]:xs[c] + block].copy()
            mask = np.ones((block, block), bool)
            if bx > 0:
                e = ((b[:, :ov] - out[y:y + block, x:x + ov]) ** 2).sum(2)
                p = min_cut_path(e)
                for i in range(block):
                    mask[i, :p[i]] = False
            if by > 0:
                e = ((b[:ov] - out[y:y + ov, x:x + block]) ** 2).sum(2).T
                p = min_cut_path(e)
                for j in range(block):
                    mask[:p[j], j] = False
            region = out[y:y + block, x:x + block]
            region[mask] = b[mask]
    return out[:H, :W]


def get(name, seed=1):
    os.makedirs(os.path.join(SCRATCH, "ground"), exist_ok=True)
    p = os.path.join(SCRATCH, "ground", f"{name}-{seed}.png")
    if os.path.exists(p):
        return np.asarray(Image.open(p).convert("RGB")).astype(np.float32)
    town, (x0, y0, x1, y1) = SOURCES[name]
    src = np.asarray(Image.open(os.path.join(ACT1_TOWN, f"{town}-screen.png")).convert("RGB"))[y0:y1, x0:x1]
    q = quilt(src, PLATE, PLATE, seed=seed)
    Image.fromarray(np.clip(q, 0, 255).astype(np.uint8)).save(p)
    return q


if __name__ == "__main__":
    for n in (sys.argv[1:] or ["lawn", "cobble"]):
        get(n)
        print(n, "ok")
