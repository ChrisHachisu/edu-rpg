#!/usr/bin/env python3
"""Split the generated material sheet into four SEAMLESSLY TILEABLE material textures.

The generator cannot produce wrap-around (no circular padding is exposed), so tileability is
imposed locally and deterministically -- which is fine, because unlike the terrain layout there
is nothing to get wrong here: a material is a uniform field, so any patch of it is as valid as
any other.

Method (Efros-Freeman wrap quilting): to make the left edge join the right edge, take the
texture's LAST `overlap` columns and composite them onto its FIRST `overlap` columns along a
minimum-error cut, then discard the last columns. What remains has, at its left edge, content
that genuinely continued from what is now its right edge -- so the join is real content, not a
cross-fade, and there is no ghosting. Repeat for rows.

The cut reuses `stitch_art_tiles.min_error_seam`, the same routine that joins the art tiles.

    make_materials.py [--sheet sheet.png] [--overlap 96]
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAT = os.path.join(ROOT, "design/continent-terrain-class-method/owner-terrain/materials")
QUADRANTS = [("grass", 0, 0), ("forest", 1, 0), ("rock", 0, 1), ("water", 1, 1)]

_spec = importlib.util.spec_from_file_location(
    "sat", os.path.join(ROOT, "scripts/stitch_art_tiles.py"))
_sat = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_sat)


def wrap_axis(a, overlap, axis):
    """Make `a` tile along `axis` by quilting its trailing overlap onto its leading overlap."""
    if axis == 1:
        return wrap_axis(a.transpose(1, 0, 2), overlap, 0).transpose(1, 0, 2)
    head = a[:overlap].astype(np.float64)          # will stay at the top of the result
    tail = a[-overlap:].astype(np.float64)         # content that precedes the wrap point
    keep = _sat.min_error_seam(tail, head, axis=0)  # True -> take tail
    m = np.asarray(Image.fromarray((keep * 255).astype(np.uint8), "L")
                   .filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float64) / 255.0
    joined = tail * m[..., None] + head * (1 - m[..., None])
    out = a[:-overlap].copy()
    out[:overlap] = np.clip(joined, 0, 255).astype(np.uint8)
    return out


def wrap_error(a):
    """Mean |step| across the wrap join, against the texture's own interior step."""
    L = _sat.lum(a.astype(np.float64))
    seam = np.abs(L[0] - L[-1]).mean() + np.abs(L[:, 0] - L[:, -1]).mean()
    inner = np.abs(np.diff(L, axis=0)).mean() + np.abs(np.diff(L, axis=1)).mean()
    return seam / 2, inner / 2


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", default=os.path.join(MAT, "act1-materials-sheet.png"))
    ap.add_argument("--overlap", type=int, default=96)
    args = ap.parse_args()

    sheet = Image.open(args.sheet).convert("RGB")
    W, H = sheet.size
    qw, qh = W // 2, H // 2
    print(f"sheet {W}x{H} -> quadrants {qw}x{qh}, wrap overlap {args.overlap}px")

    meta = {}
    for name, cx, cy in QUADRANTS:
        q = np.asarray(sheet.crop((cx * qw, cy * qh, (cx + 1) * qw, (cy + 1) * qh)))
        before_s, before_i = wrap_error(q)
        t = wrap_axis(wrap_axis(q, args.overlap, 0), args.overlap, 1)
        after_s, after_i = wrap_error(t)
        p = os.path.join(MAT, f"mat-{name}.png")
        Image.fromarray(t).save(p)
        mean = t.reshape(-1, 3).mean(axis=0)
        meta[name] = {"size": list(t.shape[:2][::-1]),
                      "meanRGB": [round(float(v), 1) for v in mean],
                      "meanLum": round(float(_sat.lum(t.astype(np.float64)).mean()), 1),
                      "wrapStepBefore": round(float(before_s), 2),
                      "wrapStepAfter": round(float(after_s), 2),
                      "interiorStep": round(float(after_i), 2)}
        ok = "OK" if after_s <= after_i * 1.6 else "STILL VISIBLE"
        print(f"  {name:<7} {t.shape[1]}x{t.shape[0]}  mean L {meta[name]['meanLum']:5.1f}  "
              f"wrap step {before_s:6.2f} -> {after_s:5.2f}  (interior {after_i:5.2f})  {ok}")
    json.dump(meta, open(os.path.join(MAT, "materials.json"), "w"), indent=1)
    print(f"wrote {len(meta)} materials + materials.json")


if __name__ == "__main__":
    main()
