#!/usr/bin/env python3
"""Split the generated town material sheet into named, seamlessly tileable materials.

Two modes:

  --sheet PATH    split a generated 4x2 sheet into the eight named materials
  --placeholder   synthesise a deterministic stand-in set

The placeholder set exists so the renderer and the lattice gate
(`verify_town_lattice.py`) can be proven BEFORE any art is generated. Proving the harness
first is the point: art generated against an unverified target is art that has to be
generated twice. The placeholders are deliberately plain -- they are a measuring instrument,
not a proposal.

Tileability is imposed locally with wrap quilting, exactly as `make_materials.py` does for the
overworld: take the trailing `overlap` rows, composite them onto the leading `overlap` rows
along a minimum-error cut, discard the trailing rows. Safe to do to a material in a way it
never was to a layout, because a material is a uniform field, so any patch of it is as valid
as any other.
"""
from __future__ import annotations

import argparse
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "design/act1-towns/materials")

# sheet order, left to right then top to bottom -- must match the generation brief
ORDER = ["street", "grass", "water", "roof", "wall", "deck", "hedge", "cobble"]
COLS, ROWS = 4, 2


def min_error_seam(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Boolean mask: True where `a` should win, along a minimum-error vertical cut per column.

    Dynamic programming down the overlap, the Efros-Freeman cut. A blend would ghost; a cut
    through low-difference pixels puts real content on both sides of the join.
    """
    err = ((a.astype(np.float64) - b.astype(np.float64)) ** 2).sum(axis=2)
    h, w = err.shape
    cost = err.copy()
    back = np.zeros((h, w), dtype=int)
    for y in range(1, h):
        for x in range(w):
            lo, hi = max(0, x - 1), min(w, x + 2)
            k = int(np.argmin(cost[y - 1, lo:hi])) + lo
            back[y, x] = k
            cost[y, x] += cost[y - 1, k]
    mask = np.zeros((h, w), dtype=bool)
    x = int(np.argmin(cost[-1]))
    for y in range(h - 1, -1, -1):
        mask[y, :x] = True
        x = back[y, x]
    return mask


def wrap_axis(a: np.ndarray, overlap: int, axis: int) -> np.ndarray:
    if axis == 1:
        return wrap_axis(a.transpose(1, 0, 2), overlap, 0).transpose(1, 0, 2)
    head = a[:overlap].astype(np.float64)
    tail = a[-overlap:].astype(np.float64)
    keep = min_error_seam(tail, head)
    m = np.asarray(Image.fromarray((keep * 255).astype(np.uint8), "L")
                   .filter(ImageFilter.GaussianBlur(1.0)), dtype=np.float64) / 255.0
    joined = tail * m[..., None] + head * (1 - m[..., None])
    out = a[:-overlap].copy()
    out[:overlap] = np.clip(joined, 0, 255).astype(np.uint8)
    return out


def make_tileable(a: np.ndarray, overlap: int) -> np.ndarray:
    overlap = max(4, min(overlap, a.shape[0] // 4, a.shape[1] // 4))
    return wrap_axis(wrap_axis(a, overlap, 0), overlap, 1)


def split_sheet(path: str, overlap: int) -> dict[str, np.ndarray]:
    im = np.asarray(Image.open(path).convert("RGB"))
    h, w = im.shape[:2]
    sh, sw = h // ROWS, w // COLS
    out = {}
    for i, name in enumerate(ORDER):
        r, c = divmod(i, COLS)
        swatch = im[r * sh:(r + 1) * sh, c * sw:(c + 1) * sw]
        # centre-crop to square: the generator returns 4:3-ish swatches, and reducing a
        # rectangle to a square material period would stretch the grain along one axis.
        s = min(swatch.shape[:2])
        oy, ox = (swatch.shape[0] - s) // 2, (swatch.shape[1] - s) // 2
        out[name] = make_tileable(swatch[oy:oy + s, ox:ox + s], overlap)
    return out


def placeholder(size: int = 192) -> dict[str, np.ndarray]:
    """Deterministic stand-ins. Flat fields with grain, no subjects -- a measuring instrument."""
    rng = np.random.default_rng(20260731)
    base = {
        "street": (150, 118, 84), "grass": (86, 118, 62), "water": (34, 66, 106),
        "roof": (128, 62, 48), "wall": (186, 168, 140), "deck": (140, 116, 86),
        "hedge": (40, 62, 44), "cobble": (120, 116, 110),
    }
    out = {}
    for name, rgb in base.items():
        n = rng.normal(0, 9, (size, size, 1))
        coarse = np.asarray(Image.fromarray(
            (rng.random((size // 8, size // 8)) * 255).astype(np.uint8), "L")
            .resize((size, size), Image.BICUBIC), dtype=np.float64)[..., None]
        a = np.array(rgb, dtype=np.float64)[None, None, :] + n + (coarse - 128) * 0.12
        out[name] = make_tileable(np.clip(a, 0, 255).astype(np.uint8), size // 6)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet")
    ap.add_argument("--placeholder", action="store_true")
    ap.add_argument("--overlap", type=int, default=96)
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    if args.sheet:
        mats = split_sheet(args.sheet, args.overlap)
        src = os.path.basename(args.sheet)
    elif args.placeholder:
        mats = placeholder()
        src = "deterministic placeholder"
    else:
        ap.error("pass --sheet PATH or --placeholder")

    for name, a in mats.items():
        p = os.path.join(args.out, f"{name}.png")
        Image.fromarray(a, "RGB").save(p)
        print(f"  {name:<8} {a.shape[1]}x{a.shape[0]}  -> {p}")
    print(f"source: {src}")


if __name__ == "__main__":
    main()
