#!/usr/bin/env python3
"""Give a keyed landmark sprite a soft ALPHA SKIRT at its base, so it sits in the ground.

LANDMARK-SPRITE-CONTRACT.md: "Baked contact shadow cast down-and-right, plus a soft alpha skirt
at the base where the structure meets the ground. The skirt is the single most important
anti-sticker measure."

The chroma key produces a hard silhouette with a 1px feather. That is correct for the structure
itself -- a wall or a cave mouth should have a crisp edge -- but wrong where the sprite MEETS
the terrain: a real bank, outcrop or palisade foot is buried in leaf litter, scree and grass,
not sitting on a cut-out line. A hard base edge is what makes a composited sprite read as a
sticker no matter how good the artwork is.

So the alpha is eroded progressively, and ONLY in the lower part of the footprint:

  * the top and sides keep their silhouette, so the structure stays readable;
  * the base dissolves over ~a third of the sprite's height, letting whatever terrain is behind
    it show through and blend across the contact.

A smooth alpha ramp is NOT enough, and it was the first thing tried here: fading the base just
makes it blurry, and a blurry edge reads as badly as a hard one because nothing in terrain
fades. What makes a contact look real is IRREGULARITY AT THE RIGHT SCALE -- the same thing that
fixed the treeline and the shore in this project. A bank meets the ground in tufts, clumps of
moss, loose stones and roots that interlock with whatever is around them.

So the base is DISSOLVED, not faded: the alpha is thresholded against a blurred copy of itself
plus multi-octave noise, which breaks the contact into irregular clumps and lets terrain show
through in fingers between them. The dissolve gets more aggressive toward the base, so the
structure keeps its silhouette up top and disintegrates into the ground at the bottom.

    skirt_sprite.py <sprite.png> [more.png ...] [--strength 0.62] [--start 0.42] [--radius 7]
                    [--grain 16] [--backup-dir DIR]
"""
from __future__ import annotations

import argparse
import os
import shutil

import numpy as np
from PIL import Image, ImageFilter


def _hash(ix, iy, seed):
    h = (ix.astype(np.int64) * 374761393 + iy.astype(np.int64) * 668265263
         + np.int64(seed) * 1442695041) & 0x7FFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0x7FFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFF).astype(np.float32) / float(0xFFFFFF)


def _vnoise(h, w, scale, seed):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    fx, fy = xx / scale, yy / scale
    ix, iy = np.floor(fx).astype(np.int64), np.floor(fy).astype(np.int64)
    rx, ry = fx - ix, fy - iy
    sx, sy = rx * rx * (3 - 2 * rx), ry * ry * (3 - 2 * ry)
    a, b = _hash(ix, iy, seed), _hash(ix + 1, iy, seed)
    c, d = _hash(ix, iy + 1, seed), _hash(ix + 1, iy + 1, seed)
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy


def _smoothstep(e0, e1, x):
    t = np.clip((x - e0) / max(e1 - e0, 1e-6), 0, 1)
    return t * t * (3 - 2 * t)


def despill(img):
    """Remove magenta key spill from the anti-aliased edge.

    Measured on the shipped sprites: 28% of Darkfang's partial-alpha pixels, 21% of Whispering
    Woods', 14% of Crystal Cave's. That is the purple fringe outlining every mound, and it is a
    large part of why they read as cut-outs -- an object with a coloured outline is a sticker by
    definition, whatever its silhouette does.

    The key is (255,0,255), so spill shows as R and B BOTH sitting above G. Reducing them by
    their shared excess kills magenta while leaving real browns (high R, low B) and real blues
    (low R, high B) untouched -- which naive clamping to G would destroy, and these sprites are
    mostly brown roots and grey-blue stone.
    """
    a = np.asarray(img).astype(np.float32)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    excess = np.minimum(r - g, b - g)
    excess = np.maximum(excess, 0.0)
    # strongest where the pixel is most transparent, i.e. where the key bled in most
    w = np.clip(1.0 - al / 255.0, 0.0, 1.0) * 0.55 + 0.45
    a[..., 0] = np.clip(r - excess * w, 0, 255)
    a[..., 2] = np.clip(b - excess * w, 0, 255)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def skirt(img, strength, start, radius, grain):
    a = np.asarray(img)[..., 3].astype(np.float32) / 255.0
    if a.max() <= 0:
        return img
    ys = np.nonzero(a.max(axis=1) > 0.03)[0]
    ytop, ybot = int(ys.min()), int(ys.max())
    if ybot <= ytop:
        return img
    h, w = a.shape
    # blurred alpha as a soft "distance from the silhouette edge"
    blur = np.asarray(Image.fromarray((a * 255).astype(np.uint8))
                      .filter(ImageFilter.GaussianBlur(radius)), np.float32) / 255.0
    # multi-octave noise at tuft / stone / root scale, in the sprite's own pixel space
    n = (_vnoise(h, w, grain, 11) * 0.55
         + _vnoise(h, w, grain * 0.45, 13) * 0.30
         + _vnoise(h, w, grain * 0.22, 17) * 0.15)
    yy = np.arange(h, dtype=np.float32)[:, None]
    t = np.clip((yy - ytop) / float(ybot - ytop), 0, 1)
    thr = np.clip((t - start) / max(1.0 - start, 1e-6), 0, 1) ** 1.25 * strength
    # threshold, not fade: clumps survive, gaps open between them, terrain shows through
    keep = _smoothstep(-0.05, 0.05, (blur + (n - 0.5) * 0.85) - thr)
    rgba = np.asarray(img).copy()
    rgba[..., 3] = np.clip(a * keep * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("sprites", nargs="+")
    ap.add_argument("--strength", type=float, default=0.62)
    ap.add_argument("--start", type=float, default=0.42,
                    help="fraction down the footprint where the skirt begins")
    ap.add_argument("--radius", type=float, default=7.0)
    ap.add_argument("--grain", type=float, default=16.0,
                    help="tuft/stone scale of the dissolve, in sprite px")
    ap.add_argument("--backup-dir")
    args = ap.parse_args()

    for p in args.sprites:
        img = Image.open(p).convert("RGBA")
        before = float((np.asarray(img)[..., 3] > 8).mean() * 100)
        if args.backup_dir:
            os.makedirs(args.backup_dir, exist_ok=True)
            shutil.copy2(p, os.path.join(args.backup_dir, os.path.basename(p)))
        out = skirt(despill(img), args.strength, args.start, args.radius, args.grain)
        out.save(p)
        after = float((np.asarray(out)[..., 3] > 8).mean() * 100)
        print(f"  {os.path.basename(p):<22} opaque {before:5.1f}% -> {after:5.1f}%  "
              f"(skirt from {args.start:.0%} down, strength {args.strength})")


if __name__ == "__main__":
    main()
