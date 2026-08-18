#!/usr/bin/env python3
"""Bake the OVERHEAD layer for each dungeon floor-1 cave mouth.

WHY THIS EXISTS
    Owner, on build 48: "the player walks under the floor and the arch so the problem is that the
    arch and the floor is on the same layer. something that the player walks under needs to be on a
    completely separate layer."

    He is exactly right, and it is the correction to my own previous fix. That fix cropped a
    RECTANGLE out of `-props.png` and drew it over the hero. A rectangle of a baked plate contains
    the floor and the lit opening as well as the arch, and it is fully opaque -- so she passed behind
    the ground she was standing on, not just behind the arch.

    An overhead layer has to carry ALPHA and contain ONLY the thing you pass beneath. Once it does,
    it needs no depth sorting at all: it can simply always draw above the hero, because she shows
    through the archway opening wherever the layer is transparent. That removes the whole
    depth-flip mechanism and the fold-line it depended on -- which is also why the previous fix could
    never work on coastalReef, whose approach never crossed that line.

THE RULE, and why it is this one
    THE ARCH IS THE MASONRY THAT RINGS THE OPENING. Not "everything above the opening" -- that was
    the previous rule and it was wrong in exactly the way the owner named: "it is clearly a square
    tile with the floor and arch drawn on it ... the player still looks like she is walking behind
    the ground." A band above the opening is a RECTANGLE OF PLATE CONTENT; it carries the gravel and
    the rock with it, so she vanished behind ground she was walking on.

    So the shape is derived from the opening OUTWARD: dilate the lit opening by ARCH_R, subtract the
    opening itself, and keep nothing below the opening's own base (that is floor she stands on). What
    survives is the horseshoe of masonry, and only that. Everything else -- gravel, distant rock, the
    floor above and around -- stays TRANSPARENT, so she is only ever hidden by the arch itself.

    Luminance cannot do this job: masonry, gravel and rock overlap in every band that was tried, and
    three separate attempts each produced a broken ring. Distance from the opening is the feature
    that actually distinguishes the arch, because the arch is *defined* by surrounding the mouth.

    The outer edge of the ring is arbitrary and INVISIBLE IN PLAY: the overlay is a copy of the
    plate's own pixels drawn at the plate's own position, so it is pixel-identical to what is already
    beneath it. Only the alpha is observable.

OUTPUT
    public/act1-dungeon-art/<floor>-overhead.png -- full floor size, RGBA, almost entirely
    transparent. Drawn by dq-tiles.js a1dOverheadTick at a depth above the hero.

USAGE
    python3 scripts/bake_dungeon_overhead.py            # write
    python3 scripts/bake_dungeon_overhead.py --check    # verify only, exit 1 if a bake is due
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "public" / "act1-dungeon-art"
FLOORS = ROOT / "dist" / "act1-dungeon-floors.json"
TILE = 48

OPENING_LUM = 200     # the lit mouth: unambiguous, and the only feature that is
BRIGHT_CAP = 190      # never carry bright gravel into the arch, even if it abuts the masonry
ARCH_R = 55           # px of masonry ringing the opening. MEASURED, not guessed: on mistyGrotto the
                      # opening's top sits at y=1286 and the rock above the arch begins at y=1236, so
                      # a ring shorter than ~50 leaves a horizontal STRIP of walkable-but-drawn arch
                      # between them -- and the hero's head lands exactly in it (sprite rows
                      # 1238..1302 when she stands on the arch cell). At 22 her scalp showed above the
                      # crown, which is the same defect as the original bug displaced upward by one
                      # sprite. BRIGHT_CAP is what stops the extra reach eating the pale gravel.
CROWN_H = 58          # px of masonry above the opening that belongs to the arch. NOT "everything
                      # above": filling to the top of the crop swallowed the pale floor ABOVE the
                      # arch on sunkenCellar, which would hide her when she walked there.
PAD_CELLS = 1         # neighbourhood around the mouth cell to consider


def luminance(rgb: np.ndarray) -> np.ndarray:
    return 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]


def build_overhead(props: Image.Image, mouth: dict, walk: Image.Image | None) -> Image.Image | None:
    W, H = props.size
    x0 = max(0, (mouth["x"] - PAD_CELLS) * TILE)
    y0 = max(0, (mouth["y"] - 2) * TILE)
    x1 = min(W, (mouth["x"] + PAD_CELLS + 1) * TILE)
    y1 = min(H, (mouth["y"] + 1) * TILE)

    sub = np.asarray(props.crop((x0, y0, x1, y1)).convert("RGB")).astype(float)
    lum = luminance(sub)
    h, w = lum.shape

    opening = lum > OPENING_LUM
    lab, n = ndimage.label(opening)
    if not n:
        return None                                   # no lit mouth here: nothing to lift
    sizes = ndimage.sum(opening, lab, range(1, n + 1))
    opening = lab == (int(np.argmax(sizes)) + 1)      # the mouth itself, not stray highlights

    base = int(np.where(opening.any(axis=1))[0].max())        # the opening's own base line
    ring = ndimage.binary_dilation(opening, ndimage.generate_binary_structure(2, 2),
                                   iterations=ARCH_R) & ~opening
    rows = np.arange(h)[:, None] * np.ones((1, w), bool)
    ring &= rows <= base                                      # never below it: that is walkable floor
    ring &= lum < BRIGHT_CAP                                  # never the gravel, even where it abuts
    ring = ndimage.binary_closing(ring, np.ones((3, 3)))
    lab2, n2 = ndimage.label(ring)
    if n2:
        sizes2 = ndimage.sum(ring, lab2, range(1, n2 + 1))
        ring = lab2 == (int(np.argmax(sizes2)) + 1)           # one arch, not speckle
    # PLUS THE ROCK SHE CAN NEVER STAND ON. The ring alone stops at the masonry, so while she is
    # under the arch her HEAD draws on top of the rock above it -- the same defect as before, moved
    # up by one sprite. The walk mask is the authority on where she can be: a pixel it calls BLOCKED
    # is somewhere she can never stand, so drawing it over her is always correct and can never hide
    # her while she is legitimately standing anywhere. Walkable pixels stay transparent, which is the
    # invariant that keeps her visible on the floor and in the opening.
    if walk is not None:
        blocked = ~np.asarray(walk.crop((x0, y0, x1, y1)).convert("L")).astype(bool)
        alpha = ring | (blocked & (rows <= base))
    else:
        alpha = ring
    alpha = ndimage.binary_closing(alpha, np.ones((3, 3)))
    if not alpha.any():
        return None

    out = np.zeros((H, W, 4), np.uint8)
    out[y0:y1, x0:x1, :3] = sub.astype(np.uint8)
    out[y0:y1, x0:x1, 3] = (alpha * 255).astype(np.uint8)
    return Image.fromarray(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    floors = json.loads(FLOORS.read_text())["floors"]
    ok = True
    for key, fl in sorted(floors.items()):
        if fl.get("floor") != 1:
            continue
        mouth = next((a for a in fl.get("assets", []) if a.get("kind") == "mouth"), None)
        props = ART / f"{key}-props.png"
        if not mouth or not props.exists():
            continue
        walk_p = ART / f"{key}-walk.png"
        walk = Image.open(walk_p) if walk_p.exists() else None
        img = build_overhead(Image.open(props), mouth, walk)
        dest = ART / f"{key}-overhead.png"
        if img is None:
            print(f"  {key}: no lit opening found, skipped")
            continue
        cover = 100 * (np.asarray(img)[:, :, 3] > 0).mean()
        if args.check:
            if not dest.exists():
                print(f"  {key}: MISSING {dest.name}  [--check: bake is DUE]")
                ok = False
            else:
                print(f"  {key}: {dest.name} present")
            continue
        img.save(dest)
        print(f"  {key}: {dest.name} written, {cover:.2f}% of the floor is overhead")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
