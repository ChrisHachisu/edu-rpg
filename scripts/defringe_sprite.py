#!/usr/bin/env python3
"""Strip the chroma-key's colour out of a sprite's soft edge, keeping the edge itself.

THE ARTEFACT. Sprites here are generated on pure magenta and keyed to alpha. Keying feathers the
edge, and a feathered edge pixel keeps the RGB it had -- which is a BLEND OF THE SPRITE AND THE
MAGENTA FIELD. Fully transparent pixels are invisible so nobody notices, but a pixel at 42% alpha
carrying (206,35,160) paints a pink rim over whatever is behind it.

Measured on the shipped Act 1 NPC sheets, every one of the fourteen: ~6,000-8,000 semi-alpha pixels
per sheet, mean RGB (206,35,160), 59% of them unmistakably magenta. Owner, on build 56: *"there is
also a weird pink hue around the npcs, which was probably around the npcs in port sapphire too, but
they need to be removed."* He was right that it predates this batch -- Port Sapphire's shipped
sheets carry it too.

THE FIX, and why it is not "delete the soft edge". Hard-cutting alpha to 0/255 removes the pink and
leaves a jagged silhouette on a 64 px figure drawn at 36 world px. Instead the ALPHA IS KEPT EXACTLY
and only the RGB is replaced: each semi-transparent pixel takes the colour of the nearest fully
opaque pixel, found by flooding opaque colour outward. The shape and the antialiasing survive; the
magenta does not.

Idempotent: a second run finds no magenta left to move and changes nothing.
"""
from __future__ import annotations
import argparse, os, sys
import numpy as np
from PIL import Image

OPAQUE = 250


def defringe(img: Image.Image, passes: int = 6) -> tuple[Image.Image, int]:
    a = np.asarray(img.convert("RGBA")).astype(np.int16)
    alpha = a[..., 3]
    rgb = a[..., :3].astype(np.float32)
    solid = alpha >= OPAQUE
    soft = (alpha > 0) & ~solid
    if not soft.any() or not solid.any():
        return img, 0

    # flood the opaque colours outward; each pass fills soft pixels adjacent to known colour
    known = solid.copy()
    out = rgb.copy()
    for _ in range(passes):
        if known.all():
            break
        acc = np.zeros_like(out)
        cnt = np.zeros(known.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            src = np.roll(np.roll(out, dy, 0), dx, 1)
            m = np.roll(np.roll(known, dy, 0), dx, 1)
            if dy: (m[:1] if dy > 0 else m[-1:]).fill(False)
            if dx: (m[:, :1] if dx > 0 else m[:, -1:]).fill(False)
            acc += src * m[..., None]
            cnt += m
        fill = (~known) & (cnt > 0)
        out[fill] = (acc[fill] / cnt[fill][:, None])
        known |= fill

    changed = int((np.abs(out[soft] - rgb[soft]).max(1) > 2).sum())
    a[..., :3] = np.clip(out, 0, 255).astype(np.int16)
    return Image.fromarray(a.astype(np.uint8), "RGBA"), changed


def magenta_count(img: Image.Image) -> int:
    a = np.asarray(img.convert("RGBA")).astype(np.int16)
    op, r, g, b = a[..., 3] > 0, a[..., 0], a[..., 1], a[..., 2]
    return int((op & (r > 110) & (b > 110) & (g < r - 40) & (g < b - 40)).sum())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--write", action="store_true", help="edit in place; otherwise report only")
    a = ap.parse_args()
    total_before = total_after = 0
    for p in a.paths:
        img = Image.open(p)
        before = magenta_count(img)
        fixed, changed = defringe(img)
        after = magenta_count(fixed)
        total_before += before
        total_after += after
        print(f"  {os.path.basename(p):40s} magenta {before:5d} -> {after:5d}   "
              f"edge px recoloured {changed:5d}")
        if a.write and changed:
            fixed.save(p)
    print(f"  TOTAL magenta {total_before} -> {total_after}"
          + ("" if a.write else "   (dry run -- pass --write)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
