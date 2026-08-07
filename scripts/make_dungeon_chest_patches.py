#!/usr/bin/env python3
"""Build the OPEN-CHEST PATCH STRIPS the hi-fi dungeon runtime blits over a looted chest.

WHY THIS EXISTS
    Act-1 dungeon floors ship as a BAKED picture (`act1-dungeon-art/<floor>-props.png`) with every
    prop composited in at render time -- so the chest in that picture is painted CLOSED and no
    amount of runtime state can change it. `tryOpenTreasure` sets `mapData[y][x] = 8` and persists
    `chest.<map>.f<floor>.<x>.<y>`, and `a1dReplayProgress` replays that on re-entry, but
    `dngSpecialObjects` draws no sprites at all on the baked layer, so the player loots a chest and
    the lid stays shut. That is the owner's report.

WHY A PATCH AND NOT A SPRITE ON TOP
    An `asset-chestOpen` sprite laid over the baked closed chest does not hide it. The two
    silhouettes do not nest: the closed chest is a WIDE DOME (86x78 master px at 1.0 cell), the
    open one a NARROW TALL box (71x86), because `sprite_at()` normalises each to its own LONG
    side. Measured against the bake's own anchor, an overlay at the authored 1.0 cell leaves
    19.1% of the closed chest showing, and it still leaves a rim at 1.45 cells -- by which point
    the chest has grown ~45% on opening. A rim of the old lid is worse than not fixing it.

    So the open state ships as a small OPAQUE PATCH of the floor instead: the chest's 3x3 cell
    neighbourhood, taken FROM the shipped picture, with the chest swapped. Registration is exact
    by construction -- the patch is cropped from, and blitted back to, the same pixel rect of the
    same image -- and coverage is total because the patch is opaque.

    It also leaves the approved art alone. `*-props.png` is not rewritten; these strips are new
    files beside it, so the dungeon the owner signed off on is still the dungeon that ships.

HOW A PATCH IS BUILT
    1. Crop the chest's 3x3 cell neighbourhood (144x144 px at the render's 48 px/cell).
    2. Locate the CLOSED chest empirically. Its placement is re-derived from `paste_props()`, but
       that arithmetic goes through int() and a 57/32 LANCZOS reduction, so it can sit a pixel off
       what was actually baked -- measured, 33 of 36 chests land exactly and 3 are off by one. So
       the re-derived sprite is cross-correlated against the shipped pixels and the winning offset
       is used, then dilated by 1 px for the reduction's soft edge.
    3. Refill every pixel of that silhouette not covered by the open chest from the nearest
       surrounding floor pixel (EDT). This is the only synthesised region and it is a thin sliver,
       almost all of it behind the new chest.
    4. Seat `asset-chestOpen` at the same anchor `paste_props()` would use, reduced 57/32 exactly
       as the bake reduces its own props.
    The baked CONTACT SHADOW is deliberately KEPT. The chest has not moved, so its shadow is still
    correct, and reusing it avoids inventing a second one that would not match the bake's lighting.

OUTPUT
    `public/act1-dungeon-art/<floor>-chests.png` -- one horizontal strip per floor, one 144x144
    cell per chest, in the order the chests appear in that floor's `assets` array. The runtime
    indexes it with exactly that list, so the mapping needs no side-car file.

Only the 12 BAKED floors get a strip. crystalCave ships no `-props.png` and draws procedurally,
where the chest already changes state on its own.
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import prov  # noqa: E402
from make_dungeon_assets import sprite_at  # noqa: E402

Image.MAX_IMAGE_PIXELS = None

PX = 48                      # world px per cell, the render scale of *-props.png
LAT = 57 / 32                # the Act-1 master lattice (design/ART-DIRECTION.md)
MPX = PX * LAT               # 85.5 master px per cell
MARGIN = 1                   # cells of margin around the chest cell -> 3x3 patch
PATCH = PX * (2 * MARGIN + 1)
FLOORS_JSON = "public/act1-dungeon-floors.json"
ART = "public/act1-dungeon-art"


def final_sprite(kind):
    """The prop as the bake ends up drawing it: `sprite_at` at 1.0 cell on the MASTER, placed by
    `paste_props`, then carried through the same 57/32 reduction. Returns (image, dx, dy) where
    dx/dy are the offsets from the prop's own cell origin, in FINAL pixels."""
    sp = sprite_at(kind, int(round(MPX * 1.0)))
    ox = int(MPX / 2 - sp.width / 2)
    oy = int(MPX / 2 - sp.height / 2 - MPX * 0.04)
    w = max(1, int(round(sp.width / LAT)))
    h = max(1, int(round(sp.height / LAT)))
    return sp.resize((w, h), Image.LANCZOS), ox / LAT, oy / LAT


def register(img, cx, cy, sp, offx, offy, search=3):
    """Find where the CLOSED chest actually is in the shipped picture, as an offset in final px
    from where the arithmetic predicts. Correlates only the sprite's fully opaque core, which is
    the part the floor underneath cannot have tinted."""
    a = np.asarray(sp).astype(float)
    core = a[..., 3] / 255.0 > 0.98
    ref = a[..., :3]
    bx, by = int(round(cx * PX + offx)), int(round(cy * PX + offy))
    best = None
    for dy in range(-search, search + 1):
        for dx in range(-search, search + 1):
            reg = np.asarray(img.crop((bx + dx, by + dy, bx + dx + sp.width,
                                       by + dy + sp.height)).convert("RGB")).astype(float)
            err = float(np.abs(reg[core] - ref[core]).mean())
            if best is None or err < best[0]:
                best = (err, dx, dy)
    return best[1], best[2], best[0]


def build_patch(img, cx, cy, closed, coff, openx, oopen):
    """One 144x144 patch: the chest's neighbourhood with the chest opened."""
    csp, coffx, coffy = closed
    osp, ooffx, ooffy = oopen
    x0, y0 = (cx - MARGIN) * PX, (cy - MARGIN) * PX
    patch = img.crop((x0, y0, x0 + PATCH, y0 + PATCH)).convert("RGBA")

    dx, dy = coff
    cm = np.zeros((PATCH, PATCH), bool)
    px0 = int(round(MARGIN * PX + coffx)) + dx
    py0 = int(round(MARGIN * PX + coffy)) + dy
    cm[py0:py0 + csp.height, px0:px0 + csp.width] = np.asarray(csp)[..., 3] > 8
    # 1 px for the reduction's soft edge, on top of the measured registration above.
    cm = ndimage.binary_dilation(cm, np.ones((3, 3), bool))

    om = np.zeros((PATCH, PATCH), bool)
    ox0 = int(round(MARGIN * PX + ooffx)) + dx
    oy0 = int(round(MARGIN * PX + ooffy)) + dy
    # Only SOLID pixels of the open chest count as cover; a half-transparent edge does not hide
    # what is under it.
    om[oy0:oy0 + osp.height, ox0:ox0 + osp.width] = np.asarray(osp)[..., 3] > 250

    hole = cm & ~om
    arr = np.asarray(patch).astype(np.uint8).copy()
    if hole.any():
        valid = ~(cm | om)
        idx = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
        for c in range(3):
            ch = arr[..., c]
            ch[hole] = ch[idx[0][hole], idx[1][hole]]
            arr[..., c] = ch
    out = Image.fromarray(arr)
    out.alpha_composite(osp, (ox0, oy0))
    return out, int(cm.sum()), int(hole.sum())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--floor", help="only this floor id; default every baked floor")
    ap.add_argument("--check", action="store_true",
                    help="report what would be written without writing it")
    args = ap.parse_args()

    fj = os.path.join(ROOT, FLOORS_JSON)
    floors = json.load(open(fj))["floors"]
    closed = final_sprite("chest")
    oopen = final_sprite("chestOpen")

    ids = [args.floor] if args.floor else sorted(
        k for k in floors
        if os.path.exists(os.path.join(ROOT, ART, f"{k}-props.png")))
    if not ids:
        raise SystemExit("no baked floors found")

    for fid in ids:
        src = os.path.join(ROOT, ART, f"{fid}-props.png")
        if not os.path.exists(src):
            raise SystemExit(f"{fid}: no baked art at {prov.rel(src)}")
        fl = floors[fid]
        chests = [a for a in fl.get("assets", []) if a["kind"] == "chest"]
        if not chests:
            print(f"{fid}: no chests, skipped")
            continue
        # A patch is a rectangle of the CLOSED render, so it must not reach any other prop: if it
        # did, blitting it would redraw that prop from the closed bake and undo its own state.
        # Measured today the nearest two chests are 8 cells apart, but placement is generated, so
        # assert it rather than assume it.
        for c in chests:
            for o in fl.get("assets", []):
                if o is c:
                    continue
                if max(abs(c["x"] - o["x"]), abs(c["y"] - o["y"])) <= MARGIN:
                    raise SystemExit(
                        f"{fid}: chest at ({c['x']},{c['y']}) has {o['kind']} at "
                        f"({o['x']},{o['y']}) inside its patch; patches may not overlap props")
        img = Image.open(src).convert("RGBA")
        strip = Image.new("RGBA", (PATCH * len(chests), PATCH), (0, 0, 0, 0))
        notes = []
        for i, ch in enumerate(chests):
            cx, cy = ch["x"], ch["y"]
            if not (cx - MARGIN >= 0 and cy - MARGIN >= 0
                    and cx + MARGIN < fl["width"] and cy + MARGIN < fl["height"]):
                raise SystemExit(f"{fid} chest {i} at ({cx},{cy}) has no room for a 3x3 patch")
            dx, dy, err = register(img, cx, cy, closed[0], closed[1], closed[2])
            patch, cpx, hpx = build_patch(img, cx, cy, closed, (dx, dy), None, oopen)
            strip.alpha_composite(patch, (PATCH * i, 0))
            notes.append(f"    chest {i} ({cx},{cy}) offset ({dx:+d},{dy:+d}) err {err:.2f} "
                         f"closed {cpx} px, refilled {hpx} px")
        out = os.path.join(ROOT, ART, f"{fid}-chests.png")
        print(f"{fid}: {len(chests)} chest(s) -> {strip.width}x{strip.height}")
        for n in notes:
            print(n)
        if args.check:
            continue
        strip.save(out, optimize=True)
        prov.stamp(out, inputs=[src, fj], generator=__file__,
                   params={"cellPx": PX, "margin": MARGIN, "chests": len(chests)})
        print(f"    wrote {prov.rel(out)}  {os.path.getsize(out)} B")


if __name__ == "__main__":
    main()
