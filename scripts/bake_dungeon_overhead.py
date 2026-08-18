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
    The cave mouth's lit opening is the only unambiguous feature in the plate: it is far brighter
    than anything around it. Masonry, gravel and rock all overlap in luminance and cannot be
    separated by a threshold -- measured, three different bands all produced a broken ring.

    So: within the opening's own horizontal span (plus a small pad for the arch legs), every pixel
    ABOVE the opening is overhead. Everything else is transparent. That is the arch's crown and legs
    and nothing else, and it is robust because it keys on the one feature that is unambiguous.

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
BRIGHT_CAP = 210      # never carry near-white gravel into the overhead layer
SPAN_PAD = 14         # px each side of the opening, to catch the arch's legs
CROWN_H = 58          # px of masonry above the opening that belongs to the arch. NOT "everything
                      # above": filling to the top of the crop swallowed the pale floor ABOVE the
                      # arch on sunkenCellar, which would hide her when she walked there.
PAD_CELLS = 1         # neighbourhood around the mouth cell to consider


def luminance(rgb: np.ndarray) -> np.ndarray:
    return 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]


def build_overhead(props: Image.Image, mouth: dict) -> Image.Image | None:
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

    cols = np.where(opening.any(axis=0))[0]
    if not len(cols):
        return None
    lo, hi = max(0, cols.min() - SPAN_PAD), min(w - 1, cols.max() + SPAN_PAD)

    # The band the arch occupies: CROWN_H of masonry ending at the opening's own top edge. Anchored
    # to the WHOLE opening's top, so the leg columns (which contain no opening pixels of their own)
    # get the same band rather than an arbitrary cell count.
    top_all = int(np.where(opening.any(axis=1))[0].min())
    band_top = max(0, top_all - CROWN_H)

    alpha = np.zeros((h, w), bool)
    for cx in range(lo, hi + 1):
        col = np.where(opening[:, cx])[0]
        stop = int(col.min()) if len(col) else top_all + 6   # legs run a little past the opening's top
        alpha[band_top:stop, cx] = True
    alpha &= lum < BRIGHT_CAP
    alpha = ndimage.binary_opening(alpha, np.ones((3, 3)))
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
        img = build_overhead(Image.open(props), mouth)
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
