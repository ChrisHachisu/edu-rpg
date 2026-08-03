#!/usr/bin/env python3
"""Check a returned dungeon ART tile against its per-cell semantic truth.

The art pass reports its own mismatch count. This does not take that on trust -- the overworld
learned the hard way that a pass can report success while having relocated regions, and a
generator grading its own homework is not evidence.

The test is the one hard rule from the brief: at every cell centre, a floor cell must read as
walkable ground and a rock cell must not. "Reads as" is decided by LUMINANCE against the two
populations the tile itself contains, not against an absolute threshold -- the art is free to
choose its own palette and exposure, so the only fair question is whether floor and rock are
separable within this tile, and whether each cell lands on the right side.

Reports:
  separation   how far apart the floor and rock luminance populations are, in pooled sigma.
               Below ~1.5 the player cannot tell a wall from a floor at a glance, which is a
               failure even if every cell technically classifies.
  mismatches   cells whose centre patch reads as the wrong class
  drift        per-cell agreement rendered as a diff image, so a failure is locatable

Usage:
  verify_dungeon_art.py <art.png> <tile.json> [--out diff.png]
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def luminance(rgb: np.ndarray) -> np.ndarray:
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("art")
    ap.add_argument("tile_json")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    meta = json.load(open(args.tile_json))
    rows, px = meta["rows"], meta["pxPerCell"]
    h, w = len(rows), len(rows[0])

    img = Image.open(args.art).convert("RGB")
    if img.size != (w * px, h * px):
        raise SystemExit(f"REFUSING: art is {img.size}, expected {(w * px, h * px)} — "
                         f"a resized tile is no longer cell-aligned and cannot be checked")
    a = np.asarray(img, dtype=np.float32)
    lum = luminance(a)

    # Sample a patch at each cell centre rather than one pixel: a single pixel can land on a
    # pebble or a highlight and say nothing about what the cell reads as.
    half = px // 4
    vals = np.zeros((h, w), dtype=np.float32)
    for y in range(h):
        for x in range(w):
            cy, cx = y * px + px // 2, x * px + px // 2
            vals[y, x] = float(np.median(lum[cy - half:cy + half + 1, cx - half:cx + half + 1]))

    truth = np.array([[1 if c != "#" else 0 for c in r] for r in rows])
    floor_v, rock_v = vals[truth == 1], vals[truth == 0]
    if floor_v.size == 0 or rock_v.size == 0:
        raise SystemExit("tile has only one class — nothing to separate")

    pooled = math_pooled_sigma(floor_v, rock_v)
    sep = abs(floor_v.mean() - rock_v.mean()) / pooled if pooled else 0.0
    # Split at the midpoint between the two population means: the tile defines its own palette,
    # so an absolute threshold would just measure how dark the artist chose to go.
    cut = (floor_v.mean() + rock_v.mean()) / 2
    brighter_is_floor = floor_v.mean() > rock_v.mean()
    got = (vals > cut) if brighter_is_floor else (vals < cut)
    bad = np.argwhere(got.astype(int) != truth)

    print(f"art        {os.path.relpath(args.art, ROOT)}  {img.size[0]}x{img.size[1]}")
    print(f"cells      {w}x{h} = {w * h}   floor {int(truth.sum())}  rock {int((1 - truth).sum())}")
    print(f"luminance  floor {floor_v.mean():6.1f} ± {floor_v.std():4.1f}   "
          f"rock {rock_v.mean():6.1f} ± {rock_v.std():4.1f}")
    verdict = "OK" if sep >= 1.5 else "TOO LOW — wall and floor are not tellable apart"
    print(f"separation {sep:.2f} sigma   {verdict}")
    print(f"mismatches {len(bad)} / {w * h}  ({100 * len(bad) / (w * h):.2f}%)")
    for y, x in bad[:12]:
        want = "floor" if truth[y, x] else "rock"
        print(f"   cell {x},{y} should read {want:5s} (luminance {vals[y, x]:.0f}, cut {cut:.0f})")
    if len(bad) > 12:
        print(f"   … and {len(bad) - 12} more")

    if args.out:
        diff = np.asarray(img).copy()
        for y, x in bad:
            diff[y * px:(y + 1) * px, x * px:x * px + 3] = (255, 0, 0)
            diff[y * px:y * px + 3, x * px:(x + 1) * px] = (255, 0, 0)
        Image.fromarray(diff).save(args.out)
        print(f"diff       {os.path.relpath(args.out, ROOT)}")

    raise SystemExit(0 if (len(bad) == 0 and sep >= 1.5) else 1)


def math_pooled_sigma(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = a.size, b.size
    if na + nb < 3:
        return 0.0
    return float(np.sqrt(((na - 1) * a.var(ddof=1) + (nb - 1) * b.var(ddof=1)) / (na + nb - 2)))


if __name__ == "__main__":
    main()
