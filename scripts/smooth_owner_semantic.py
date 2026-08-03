#!/usr/bin/env python3
"""Turn the owner's per-cell painted terrain into an ORGANIC-EDGED semantic map.

Why: the owner painted terrain cell by cell, so every class boundary in
actN-owner-semantic.png is a literal axis-aligned staircase. Two art passes now have
reproduced that staircase as artwork. The approved method test
(design/review/.../semantic-test/tile-4-8-ART.png) succeeded precisely because ITS input
already had smooth organic boundaries -- the generator simply obeyed it.

So we smooth here, deterministically, in code -- and then tell Codex to respect the edges
exactly as given. That removes the generator's licence to reinterpret boundaries, which is
where topology drift came from (a V2 trial dropped a whole rock cap while "being organic").

THE INVARIANT: the class at every cell CENTRE is preserved exactly. Collision is unchanged.
Only the appearance of the boundary between cell centres moves.

Method:
  1. one occupancy field per class, at S px/cell
  2. Gaussian blur  -> boundaries become smooth curves instead of steps
  3. + coherent seeded noise -> curves become irregular, not merely rounded
  4. argmax per pixel -> a label map
  5. iteratively add a small Gaussian bump at any cell centre whose class flipped, until
     ZERO centres are wrong. Bumps are smooth, so this never reintroduces squares.

Usage:
  smooth_owner_semantic.py <act> --preview               # full act at 16 px/cell + report
  smooth_owner_semantic.py <act> --tiles x,y ... [--px 48] [--cells 32]
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/continent-terrain-class-method/owner-terrain")
SRC = os.path.join(DIR, "owner-terrain.json")
PACK = os.path.join(ROOT, "design/review/overworld-art-blueprint/continent/continent-macro-g3")
OUT = os.path.join(DIR, "art-tiles")

RGB = {"ground": (226, 210, 156), "vegetation": (26, 82, 46), "rock": (128, 126, 122),
       "water": (30, 82, 170), "path": (170, 120, 60)}
ROLE = {".": "ground", "F": "vegetation", "M": "rock", "W": "water", "R": "path"}

S = 12                 # field resolution, px per cell
SIGMA_CELLS = 0.85     # boundary smoothing radius, in cells
NOISE_AMP = 0.11       # irregularity strength
NOISE_SIGMA_CELLS = 1.6
SEED = 42              # canonical project seed


def class_grid(act: str):
    data = json.load(open(SRC))
    A = data["acts"][act]
    x0, y0, x1, y1 = A["bounds"]
    rows = A["terrainRows"]
    land = np.load(os.path.join(PACK, "land-mask.npy"))
    w, h = x1 - x0 + 1, y1 - y0 + 1
    g = np.empty((h, w), dtype=object)
    for yy in range(h):
        for xx in range(w):
            g[yy, xx] = "water" if not land[y0 + yy, x0 + xx] else ROLE[rows[yy][xx]]
    return A, (x0, y0), g


def blur(a: np.ndarray, sigma: float) -> np.ndarray:
    """Separable Gaussian blur. PIL's GaussianBlur refuses float ('F') images."""
    if sigma <= 0:
        return a.astype(np.float32)
    r = int(np.ceil(3.0 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2).astype(np.float32)
    k /= k.sum()
    cur = a.astype(np.float32)
    for axis in (1, 0):
        pad = ((0, 0), (r, r)) if axis == 1 else ((r, r), (0, 0))
        ap = np.pad(cur, pad, mode="edge")
        out = np.zeros_like(cur)
        for i, wt in enumerate(k):
            if axis == 1:
                out += wt * ap[:, i:i + cur.shape[1]]
            else:
                out += wt * ap[i:i + cur.shape[0], :]
        cur = out
    return cur


def build_fields(g: np.ndarray):
    """Smoothed, irregular per-class fields at S px/cell, with cell centres guaranteed."""
    h, w = g.shape
    classes = sorted(set(g.ravel()))
    H, W = h * S, w * S
    rng = np.random.default_rng(SEED)

    fields = {}
    for c in classes:
        m = (g == c).astype(np.float32)
        up = np.repeat(np.repeat(m, S, axis=0), S, axis=1)
        f = blur(up, SIGMA_CELLS * S)
        n = blur(rng.standard_normal((H, W)).astype(np.float32), NOISE_SIGMA_CELLS * S)
        sd = n.std()
        if sd > 0:
            n /= sd
        fields[c] = f + NOISE_AMP * n

    # centre indices
    cy = np.arange(h) * S + S // 2
    cx = np.arange(w) * S + S // 2
    truth_idx = np.array([[classes.index(g[y, x]) for x in range(w)] for y in range(h)])

    # a reusable unit bump, ~0.55 cell radius
    br = max(2, int(round(0.55 * S)))
    yy, xx = np.mgrid[-br:br + 1, -br:br + 1]
    bump = np.exp(-(yy ** 2 + xx ** 2) / (2 * (0.42 * S) ** 2)).astype(np.float32)

    for it in range(12):
        stack = np.stack([fields[c] for c in classes])
        lab = stack.argmax(axis=0)
        got = lab[np.ix_(cy, cx)]
        bad = np.argwhere(got != truth_idx)
        if len(bad) == 0:
            return classes, fields, it, 0
        # nudge the true class up at each offending centre
        amp = 0.30 + 0.22 * it
        for by, bx in bad:
            c = classes[truth_idx[by, bx]]
            py, px = by * S + S // 2, bx * S + S // 2
            y0b, y1b = max(0, py - br), min(H, py + br + 1)
            x0b, x1b = max(0, px - br), min(W, px + br + 1)
            sub = bump[y0b - (py - br):y1b - (py - br), x0b - (px - br):x1b - (px - br)]
            fields[c][y0b:y1b, x0b:x1b] += amp * sub
    stack = np.stack([fields[c] for c in classes])
    got = stack.argmax(axis=0)[np.ix_(cy, cx)]
    return classes, fields, 12, int((got != truth_idx).sum())


def render(classes, fields, g, box, px):
    """Render a cell-space box (cx0,cy0,cw,ch) at `px` px/cell from the fields."""
    cx0, cy0, cw, ch = box
    pad = 3
    fy0, fy1 = max(0, (cy0 - pad) * S), min(fields[classes[0]].shape[0], (cy0 + ch + pad) * S)
    fx0, fx1 = max(0, (cx0 - pad) * S), min(fields[classes[0]].shape[1], (cx0 + cw + pad) * S)
    scale = px / S
    ups = []
    for c in classes:
        sub = fields[c][fy0:fy1, fx0:fx1]
        im = Image.fromarray(sub).resize(
            (int(round(sub.shape[1] * scale)), int(round(sub.shape[0] * scale))),
            Image.Resampling.BICUBIC)
        ups.append(np.asarray(im, dtype=np.float32))
    lab = np.stack(ups).argmax(axis=0)
    oy = int(round((cy0 * S - fy0) * scale))
    ox = int(round((cx0 * S - fx0) * scale))
    lab = lab[oy:oy + ch * px, ox:ox + cw * px]
    out = np.zeros((lab.shape[0], lab.shape[1], 3), dtype=np.uint8)
    for i, c in enumerate(classes):
        out[lab == i] = RGB[c]
    return out, lab


def add_bump(fields, classes, g, gx, gy, amp):
    """Nudge the true class up at one cell's centre, smoothly."""
    H, W = fields[classes[0]].shape
    br = max(2, int(round(0.55 * S)))
    yy, xx = np.mgrid[-br:br + 1, -br:br + 1]
    bump = np.exp(-(yy ** 2 + xx ** 2) / (2 * (0.42 * S) ** 2)).astype(np.float32)
    c = g[gy, gx]
    py, px_ = gy * S + S // 2, gx * S + S // 2
    y0b, y1b = max(0, py - br), min(H, py + br + 1)
    x0b, x1b = max(0, px_ - br), min(W, px_ + br + 1)
    sub = bump[y0b - (py - br):y1b - (py - br), x0b - (px_ - br):x1b - (px_ - br)]
    fields[c][y0b:y1b, x0b:x1b] += amp * sub


def enforce_render(classes, fields, g, box, px, max_iter=12):
    """Guarantee cell centres survive at the ACTUAL output resolution, not just the field's.

    The field-level solve only pins the centre pixel at S px/cell; bicubic upsampling to
    `px` px/cell can still flip a centre. So re-check after rendering and keep nudging.
    """
    for it in range(max_iter):
        img, lab = render(classes, fields, g, box, px)
        bad = check_centres(lab, classes, g, box, px)
        if not bad:
            return img, lab, it, []
        for gx, gy, _want, _got in bad:
            add_bump(fields, classes, g, gx, gy, 0.35 + 0.25 * it)
    img, lab = render(classes, fields, g, box, px)
    return img, lab, max_iter, check_centres(lab, classes, g, box, px)


def check_centres(lab, classes, g, box, px):
    cx0, cy0, cw, ch = box
    bad = []
    half = 5
    for j in range(ch):
        for i in range(cw):
            py, pxx = j * px + px // 2, i * px + px // 2
            patch = lab[py - half:py + half, pxx - half:pxx + half]
            vals, cnt = np.unique(patch, return_counts=True)
            got = classes[vals[cnt.argmax()]]
            want = g[cy0 + j, cx0 + i]
            if got != want:
                bad.append((cx0 + i, cy0 + j, want, got))
    return bad


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("act")
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--tiles", nargs="*")
    ap.add_argument("--px", type=int, default=48)
    ap.add_argument("--cells", type=int, default=32)
    args = ap.parse_args()

    A, (x0, y0), g = class_grid(args.act)
    h, w = g.shape
    classes, fields, iters, remaining = build_fields(g)
    print(f"act {args.act}: {w}x{h} cells, classes {classes}")
    print(f"centre-preservation solve: {iters} iteration(s), {remaining} unresolved")
    if remaining:
        raise SystemExit("REFUSING: some cell centres could not be preserved")

    os.makedirs(OUT, exist_ok=True)
    if args.preview:
        px = 16
        img, lab, fix_iters, bad = enforce_render(classes, fields, g, (0, 0, w, h), px)
        p = os.path.join(OUT, f"act{args.act}-smoothed-semantic.png")
        Image.fromarray(img).save(p)
        print(f"wrote {os.path.relpath(p, ROOT)}  {img.shape[1]}x{img.shape[0]}")
        print(f"cell-centre mismatches at {px} px/cell: {len(bad)} / {w*h}")
        # how much area moved
        for c in classes:
            before = int((g == c).sum()) / (w * h)
            after = float((lab == classes.index(c)).mean())
            print(f"  {c:<11} area {100*before:5.1f}% -> {100*after:5.1f}%  "
                  f"(delta {100*(after-before):+.1f})")
        return

    if not args.tiles:
        raise SystemExit("give --tiles x,y ... or --preview")
    N, px = args.cells, args.px
    man = []
    for spec in args.tiles:
        tx, ty = (int(v) for v in spec.split(","))
        cx0, cy0 = tx - x0, ty - y0
        if not (0 <= cx0 and cx0 + N <= w and 0 <= cy0 and cy0 + N <= h):
            raise SystemExit(f"tile {spec} outside act bounds")
        img, lab, fix_iters, bad = enforce_render(classes, fields, g, (cx0, cy0, N, N), px)
        name = f"act{args.act}-tile-{tx}-{ty}-semantic-smooth.png"
        Image.fromarray(img).save(os.path.join(OUT, name))
        inside = {n: v for n, v in A["landmarks"].items()
                  if tx <= v[0] < tx + N and ty <= v[1] < ty + N}
        cnt = {c: int((g[cy0:cy0+N, cx0:cx0+N] == c).sum()) for c in
               set(g[cy0:cy0+N, cx0:cx0+N].ravel())}
        man.append({"tile": name, "worldTopLeft": [tx, ty], "cells": N, "pxPerCell": px,
                    "size": [N*px, N*px], "centreMismatches": len(bad),
                    "composition": {c: round(100*n/(N*N), 1) for c, n in
                                    sorted(cnt.items(), key=lambda kv: -kv[1])},
                    "landmarksInside": inside,
                    "artOut": name.replace("-semantic-smooth", "-ART")})
        print(f"{name}  {N*px}x{N*px}  centre-mismatches {len(bad)}  " +
              "  ".join(f"{c} {100*n/(N*N):.0f}%" for c, n in
                        sorted(cnt.items(), key=lambda kv: -kv[1])) +
              (f"  landmarks: {', '.join(inside)}" if inside else ""))
    mp = os.path.join(OUT, f"act{args.act}-tiles-smooth.json")
    json.dump({"act": args.act, "pxPerCell": px, "cellsPerTile": N, "runtimeTileSize": 48,
               "smoothing": {"fieldPxPerCell": S, "sigmaCells": SIGMA_CELLS,
                             "noiseAmp": NOISE_AMP, "noiseSigmaCells": NOISE_SIGMA_CELLS,
                             "seed": SEED},
               "invariant": "class at every cell centre is preserved exactly",
               "tiles": man}, open(mp, "w"), indent=1)
    print("manifest:", os.path.relpath(mp, ROOT))


if __name__ == "__main__":
    main()
