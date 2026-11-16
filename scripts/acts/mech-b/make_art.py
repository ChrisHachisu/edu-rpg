#!/usr/bin/env python3
"""Cut the MECH-B mechanic sprites out of the Codex object sheets (mech-tiles-a/b.png) and paint the
one that has no sheet tile (the Void Rift block). Output: public/acts-dungeons/modules/b-art/*.png.

  python3 scripts/acts/mech-b/make_art.py            (D2_CODEX overrides the sheet folder)

Deterministic; no hand work. Sheets are 3x3 objects on magenta."""
import os, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
CODEX = os.environ.get("D2_CODEX", "/home/user/work/codex/out")
OUT = os.path.join(ROOT, "public", "acts-dungeons", "modules", "b-art")


def objects(sheet):
    """The nine objects of a sheet as RGBA crops, row-major."""
    im = np.asarray(Image.open(os.path.join(CODEX, sheet)).convert("RGB")).astype(np.int32)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    key = (r > 170) & (b > 170) & (g < 110) & (abs(r - b) < 70)           # magenta ground
    solid = ndimage.binary_opening(~key, np.ones((3, 3), bool))
    lab, n = ndimage.label(solid)
    boxes = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if h * w > 120 * 120:
            boxes.append((sl, i + 1))
    assert len(boxes) == 9, (sheet, len(boxes))
    boxes.sort(key=lambda b: (round(b[0][0].start / 400), b[0][1].start))
    out = []
    for sl, i in boxes:
        y0, y1, x0, x1 = sl[0].start - 2, sl[0].stop + 2, sl[1].start - 2, sl[1].stop + 2
        rgb = im[y0:y1, x0:x1].astype(np.float32)
        a = (lab[y0:y1, x0:x1] == i)
        a = ndimage.binary_fill_holes(a)
        # magenta fringe: pull edge pixels back toward their non-magenta part
        rr, gg, bb = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        spill = np.clip(np.minimum(rr, bb) - gg, 0, 255) * (~ndimage.binary_erosion(a, iterations=3))
        rgb[..., 0] -= spill * 0.9; rgb[..., 2] -= spill * 0.9
        alpha = ndimage.gaussian_filter(a.astype(np.float32), 0.6)
        alpha = np.clip((alpha - 0.35) / 0.4, 0, 1) * a
        out.append(Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8), "RGBA"))
    return out


def fit(im, w, h=None):
    h = h or round(im.height * w / im.width)
    return im.resize((w, h), Image.LANCZOS)


def save(im, name):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name)
    im.save(p, optimize=True)
    print(f"{name:20} {im.size[0]}x{im.size[1]}  {os.path.getsize(p) / 1e3:.1f} KB")


def top_face(im, frac=0.84):
    """The square top face of a floor-tile object (drops the front lip), as an opaque square."""
    w, h = im.size
    box = (round(w * 0.06), round(h * 0.05), round(w * 0.94), round(h * frac))
    return im.crop(box).convert("RGB")


def void_block(size=144, lip=22, seed=7):
    """A square slab of rift stone, top face `size` px, with a lit rim and a front face `lip` px tall."""
    rng = np.random.default_rng(seed)
    H = size + lip
    rgb = np.zeros((H, size, 3), np.float32); a = np.zeros((H, size), np.float32)
    n = ndimage.gaussian_filter(rng.random((H, size)), 5); n = (n - n.min()) / (n.max() - n.min())
    fine = ndimage.gaussian_filter(rng.random((H, size)), 1.2); fine = (fine - fine.min()) / (fine.max() - fine.min())
    base = np.array([124, 112, 150], np.float32)
    top = base[None, None, :] * (0.82 + 0.26 * n[..., None] + 0.10 * (fine[..., None] - 0.5))
    rgb[:size] = top[:size]
    # flagstone joints: an irregular 3x3 of slabs
    cuts_x = [0, 46 + int(rng.integers(-5, 6)), 98 + int(rng.integers(-5, 6)), size]
    cuts_y = [0, 50 + int(rng.integers(-5, 6)), 96 + int(rng.integers(-5, 6)), size]
    for c in cuts_x[1:-1]:
        rgb[:size, c - 1:c + 1] *= 0.62; rgb[:size, c + 1:c + 2] *= 1.12
    for c in cuts_y[1:-1]:
        rgb[c - 1:c + 1, :] *= 0.62; rgb[c + 1:c + 2, :] *= 1.12
    # rim light (top/left) and rim shade (bottom/right)
    rgb[0:3, :] *= 1.28; rgb[:size, 0:3] *= 1.18; rgb[size - 3:size, :] *= 0.80; rgb[:size, size - 3:] *= 0.86
    # front face
    face = np.array([70, 60, 96], np.float32)
    for y in range(size, H):
        t = (y - size) / lip
        rgb[y] = face * (1.0 - 0.55 * t) * (0.9 + 0.2 * n[y][:, None])
    for c in cuts_x[1:-1]:
        rgb[size:, c - 1:c + 1] *= 0.6
    a[:] = 1
    # chipped corners
    yy, xx = np.mgrid[0:H, 0:size]
    for (cx, cy) in ((0, 0), (size - 1, 0), (0, H - 1), (size - 1, H - 1)):
        a[(abs(xx - cx) + abs(yy - cy)) < 5] = 0
    a[size + lip - 3:, :] *= np.linspace(1, 0.3, 3)[:, None]
    # violet glow seam under the lip
    rgb[size:size + 2] = rgb[size:size + 2] * 0.5 + np.array([150, 110, 255], np.float32) * 0.5
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8), "RGBA")


def main():
    A, B = objects("mech-tiles-a.png"), objects("mech-tiles-b.png")
    # crust bridges: a crusted tile and a molten tile, one cell each (the module flips them per cell)
    save(fit(top_face(A[8]), 96, 96), "crust.png")
    save(fit(top_face(A[7]), 96, 96), "molten.png")
    # push-ice: the block (two cells a side, drawn a little taller) and the frozen bridge tile
    save(fit(A[5], 112), "ice-block.png")
    save(fit(top_face(A[6], 0.86), 96, 96), "ice-bridge.png")
    # portals: stone ring + a white swirl the module tints per pair colour
    g = np.asarray(B[1]).astype(np.float32)
    rgb, al = g[..., :3], g[..., 3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    glow = np.clip((sat - 0.42) / 0.25, 0, 1) * np.clip((mx - 120) / 80, 0, 1)
    glow = ndimage.gaussian_filter(glow, 1.0)
    lum = (rgb * [0.3, 0.59, 0.11]).sum(-1)
    grey = np.dstack([lum, lum, lum])
    ring = rgb * (1 - glow[..., None]) + grey * 0.55 * glow[..., None]
    ring_im = Image.fromarray(np.dstack([np.clip(ring, 0, 255), al]).astype(np.uint8), "RGBA")
    sw = np.clip(lum * 1.25 + 30, 0, 255)
    swirl = Image.fromarray(np.dstack([sw, sw, sw, al * glow]).astype(np.uint8), "RGBA")
    save(fit(ring_im, 104), "portal-ring.png")
    save(fit(swirl, 104), "portal-swirl.png")
    save(void_block(), "void-block.png")


if __name__ == "__main__":
    main()
