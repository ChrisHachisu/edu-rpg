#!/usr/bin/env python3
"""Lift ONE generated prop out of a candidate tile and set it into the accepted tile.

WHY A GRAFT RATHER THAN A REGENERATION
    The owner reversed his own 2026-08-15 removal and wants the chimney and the demijohn back. The
    obvious route -- re-bake the tile with the prop in the brief -- was tried and MEASURED, and it
    costs more than it buys. `--add` put a correct, well-drawn chimney exactly where it was asked
    for, but the tile it came in came back a different drawing: correlation 0.807 against the tile
    the owner accepted, two of the moored boats gone, the trader's rigging thinned, and the finish
    softer on every band that gates it --

        tile (1,0) accepted    mean |step| 21.32   hard 27.6%   soft 35.5%
        tile (1,0) candidate   mean |step| 17.35   hard 22.0%   soft 33.2%

    -- which on a quarter of the plate is enough to drag the whole plate under the numbers the
    owner's accepted version scores. So the candidate is used as a PARTS BIN, not as a replacement:
    take the prop, which is the only thing that was missing, and leave the accepted art alone.

WHY THE MASK IS COLOUR-KEYED AND NOT A DIFFERENCE
    The first instinct is to mask wherever the two tiles differ. That does not work here and the
    reason is worth recording: the candidate redrew the roof's tile pattern as well as adding the
    chimney, so the difference is large EVERYWHERE inside the window (local surround correlation
    0.546) and a difference mask selects the whole roof. What actually separates the prop from its
    background is what it is made of -- grey masonry against orange terracotta, or dark glass and
    rope against pale cobble -- so the mask is a colour test, the same instrument
    derive_town_foreground.py already uses to separate an overhead prop from the ground behind it.

    The lifted patch is exposure-matched to the ACCEPTED tile first, on the surround where both
    tiles show the same material, so the prop does not arrive carrying the candidate's own grade.
"""
from __future__ import annotations

import argparse

import numpy as np
from PIL import Image, ImageFilter


def lum(a):
    return 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]


def key_grey(a, base=None):
    """Low-saturation masonry: red, green and blue within a narrow spread of each other."""
    mx, mn = a.max(axis=2), a.min(axis=2)
    return (mx - mn) < 34


def key_dark(a, base=None):
    """Dark glass/rope/metal against pale cobble."""
    return lum(a) < 118


def key_unlike_ground(a, base):
    """Anything that is not the ground the prop hangs over, measured FROM THE BASE TILE.

    `key_dark` was tried first on the demijohn and took only slivers: the vessel is dull teal glass
    in a pale GOLDEN rope cradle with hard highlights, so most of it is brighter than any threshold
    that still excludes cobble. What actually separates it is that cobble is one narrow, neutral,
    pale colour and the prop is not -- so the reference is the median colour of the BASE tile inside
    the same box, i.e. the ground that is actually there, rather than a constant guessed in advance.
    This is derive_town_foreground.py's question ("is this pixel the prop or the ground behind it")
    asked with a locally-measured answer instead of a global classifier.
    """
    ref = np.median(base.reshape(-1, 3), axis=0)
    return np.sqrt(((a - ref[None, None, :]) ** 2).sum(axis=2)) > 46


KEYS = {"grey": key_grey, "dark": key_dark, "unlike-ground": key_unlike_ground}


def match_exposure(cand, base, keep):
    """Per-channel gamma fitted on the SURROUND (~keep), so the prop inherits the base's grade."""
    if keep.all() or (~keep).sum() < 200:
        return cand
    g = np.ones(3)
    c = cand[~keep] / 255.0
    b = base[~keep] / 255.0
    for ch in range(3):
        lo, hi = 0.4, 2.5
        tgt = b[:, ch].mean()
        for _ in range(40):
            mid = (lo + hi) / 2
            if (c[:, ch] ** mid).mean() > tgt:
                lo = mid
            else:
                hi = mid
        g[ch] = (lo + hi) / 2
    return np.clip((cand / 255.0) ** g[None, None, :], 0, 1) * 255.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base"); ap.add_argument("candidate"); ap.add_argument("out")
    ap.add_argument("--box", required=True, help="x0,y0,x1,y1 in the TILE's own pixels")
    ap.add_argument("--key", default="grey", choices=sorted(KEYS))
    ap.add_argument("--feather", type=float, default=0.8)
    ap.add_argument("--min-run", type=int, default=3,
                    help="drop mask specks thinner than this, in px, on both axes")
    ap.add_argument("--mask-out", help="write the mask for inspection")
    a = ap.parse_args()

    base = np.asarray(Image.open(a.base).convert("RGB")).astype(np.float64)
    cand = np.asarray(Image.open(a.candidate).convert("RGB")).astype(np.float64)
    if base.shape != cand.shape:
        raise SystemExit(f"shape mismatch {base.shape} vs {cand.shape}")
    x0, y0, x1, y1 = (int(v) for v in a.box.split(","))

    cb, bb = cand[y0:y1, x0:x1], base[y0:y1, x0:x1]
    keep = KEYS[a.key](cb, bb)
    # Erode-then-dilate by min-run on each axis: the key alone speckles on individual roof
    # highlights, and a speck of chimney floating on a roof tile reads as damage, not as a prop.
    m = Image.fromarray((keep * 255).astype(np.uint8))
    m = m.filter(ImageFilter.MinFilter(2 * a.min_run + 1)).filter(ImageFilter.MaxFilter(2 * a.min_run + 1))
    keep = np.asarray(m) > 127
    if not keep.any():
        raise SystemExit("mask is empty: the key selected nothing inside the box")

    cb = match_exposure(cb, bb, keep)
    soft = np.asarray(Image.fromarray((keep * 255).astype(np.uint8))
                      .filter(ImageFilter.GaussianBlur(a.feather)), dtype=np.float64) / 255.0
    out = base.copy()
    out[y0:y1, x0:x1] = cb * soft[..., None] + bb * (1 - soft[..., None])
    ys, xs = np.nonzero(keep)
    print(f"  grafted {keep.sum()} px  ({100*keep.mean():.1f}% of the box)  "
          f"tile bbox x{x0+xs.min()}-{x0+xs.max()} y{y0+ys.min()}-{y0+ys.max()}")
    if a.mask_out:
        Image.fromarray((soft * 255).astype(np.uint8)).save(a.mask_out)
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB").save(a.out)
    print("  ->", a.out)


if __name__ == "__main__":
    raise SystemExit(main())
