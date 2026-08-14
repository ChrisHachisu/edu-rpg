#!/usr/bin/env python3
"""Extract Port Sapphire's OVERHEAD props into a transparent foreground layer.

Why this exists
----------------
OWNER, 2026-08-13/14, asked directly: "draw over the hero AND be passable." town.html paints one
flat baked painting and then sorts NPCs/hero by foot Y on top of it -- nothing in the painting can
ever draw in FRONT of her, so she appears to stand ON the ship's mast, on the demijohn's chain, on
a rooftop chimney and on a roof ridge, regardless of where she actually is relative to them.

The fix is a second image, the same size and same camera alignment as the base painting, drawn
AFTER the actor sort: everywhere except the confirmed overhead props is fully transparent, and the
props themselves carry an exact copy of the base painting's own pixels. Drawing it with the SAME
drawImage(src, 0, 0, naturalWidth, naturalHeight, 0, 0, WORLD, WORLD) call the base layer already
uses guarantees pixel-perfect alignment for free -- no second scale or offset to get wrong.

This NEVER repaints or invents art. It only copies pixels that already exist in the locked
painting, gated by design/act1-towns/portSapphire-foreground-props.json, which records which
props are confirmed members and why. The base file's hash is asserted unchanged before and after,
the same guarantee derive_town_walkable.py gives the walkable geometry.

A pixel inside an authored region is kept opaque if it FAILS the same paving_mask() test
scripts/derive_town_walkable.py uses for collision (i.e. it is not pale cobblestone), and made
transparent otherwise -- so real pavement showing through a gap in a chain or under a roof eave
stays see-through rather than becoming an opaque grey patch floating over the hero.
"""
from __future__ import annotations

import hashlib
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCREEN = os.path.join(ROOT, "design/act1-towns/portSapphire-screen-v5-graded.png")
SHIPPED_SCREEN = os.path.join(ROOT, "public/act1-hifi/town/portSapphire-screen.png")
PROPS = os.path.join(ROOT, "design/act1-towns/portSapphire-foreground-props.json")
OUT = os.path.join(ROOT, "public/act1-hifi/town/portSapphire-foreground.png")
PROOF = os.path.join(ROOT, "design/act1-towns/portSapphire-foreground-proof.png")


def paving_mask(art: np.ndarray) -> np.ndarray:
    """Identical to derive_town_walkable.py's own test -- one classifier, one meaning, shared by
    both scripts. Duplicated rather than imported: this repo does not package scripts as a module
    and the two files are meant to be read standalone."""
    r, g, b = art[..., 0], art[..., 1], art[..., 2]
    return (r > 95) & (np.abs(r - g) < 42) & (b > r * 0.5) & (b < r * 1.25)


def _step(a: np.ndarray, grow: bool) -> np.ndarray:
    h, w = a.shape
    acc = a.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        shifted = np.full_like(a, not grow)
        ys, ye = max(0, dy), min(h, h + dy)
        xs, xe = max(0, dx), min(w, w + dx)
        shifted[ys:ye, xs:xe] = a[ys - dy:ye - dy, xs - dx:xe - dx]
        acc = (acc | shifted) if grow else (acc & shifted)
    return acc


def close_alpha(a: np.ndarray, r: int = 1) -> np.ndarray:
    """Morphological CLOSE (dilate then erode) by r art px, not a plain dilate. A plain dilate
    only pads a shape's outer edge and still leaves interior pinholes exactly where the well's
    lit rim problem repeats: a compact stone object like the chimney/tower has a sunlit face that
    reads as paving-coloured in patches, so the raw not-paving mask is a speckle rather than a
    solid silhouette (measured: only ~29% of its bbox before closing). Closing bridges those
    interior gaps while returning the boundary close to its original position, rather than
    dilate's "everything grows outward and stays grown"."""
    out = a
    for _ in range(r):
        out = _step(out, grow=True)
    for _ in range(r):
        out = _step(out, grow=False)
    return out


def main() -> None:
    before = hashlib.sha256(open(SCREEN, "rb").read()).hexdigest()
    if os.path.exists(SHIPPED_SCREEN):
        shipped = hashlib.sha256(open(SHIPPED_SCREEN, "rb").read()).hexdigest()
        if shipped != before:
            raise SystemExit(
                "design and shipped Port Sapphire screen art have DIVERGED -- this script reads "
                "the design copy and assumes it is byte-identical to what ships. Reconcile before "
                "extracting a foreground layer from it.")

    img = Image.open(SCREEN).convert("RGB")
    art = np.asarray(img).astype(np.float32)
    h, w = art.shape[:2]
    not_paving = ~paving_mask(art)

    spec = json.load(open(PROPS))
    keep = np.zeros((h, w), dtype=bool)
    counts = {}
    for region in spec["regions"]:
        x0, y0, x1, y1 = region["bboxArt"]
        if region.get("solid"):
            # Skip the paving-mask-inverse test entirely: some compact objects (the chimney) have
            # a sunlit face that reads as paving-coloured across large patches -- the well-rim
            # ambiguity again -- and stay a speckle no matter how far the closing radius is
            # pushed. Filling the whole (tightly measured) bbox trades a few px of pavement at the
            # edges for reliable occlusion.
            local = np.ones((y1 - y0, x1 - x0), dtype=bool)
        else:
            local = close_alpha(not_paving[y0:y1, x0:x1], region.get("close", 1))
        keep[y0:y1, x0:x1] |= local
        counts[region["id"]] = int(local.sum())
        print(f"{region['id']}: bbox {x1 - x0}x{y1 - y0} art px, {counts[region['id']]} kept "
              f"({100 * counts[region['id']] / max(1, (x1 - x0) * (y1 - y0)):.1f}%)")

    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., :3] = np.asarray(img)
    rgba[..., 3] = np.where(keep, 255, 0).astype(np.uint8)
    out_img = Image.fromarray(rgba, mode="RGBA")
    out_img.save(OUT)
    kept_total = int(keep.sum())
    print(f"wrote {OUT}  {kept_total} px opaque of {h * w} ({100 * kept_total / (h * w):.2f}%)")

    after = hashlib.sha256(open(SCREEN, "rb").read()).hexdigest()
    if after != before:
        raise SystemExit("STOP: the source painting changed while this script ran. Do not ship.")

    # ---- proof: the extracted layer alone, on a checkerboard, so transparency is visible -------
    tile = 16
    board = np.zeros((h, w, 3), dtype=np.uint8)
    cy, cx = np.indices((h, w)) // tile
    checker = (cy + cx) % 2 == 0
    board[checker] = (60, 60, 68)
    board[~checker] = (40, 40, 46)
    proof = Image.fromarray(board, mode="RGB").convert("RGBA")
    proof.alpha_composite(out_img)
    proof.convert("RGB").save(PROOF)
    print(f"proof  {PROOF}")


if __name__ == "__main__":
    main()
