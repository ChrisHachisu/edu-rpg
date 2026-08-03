#!/usr/bin/env python3
"""Chroma-key a generated landmark sprite to RGBA, and preview it over real terrain.

Why a chroma key: the image generator returns OPAQUE RGB (and 1254x1254 natively), so it
cannot emit alpha. Per design/LANDMARK-SPRITE-CONTRACT.md sprites are generated on a pure
magenta 255,0,255 field; this keys that out deterministically and feathers the edge by 1 px.

Also composites the result over an actual terrain base tile, because the only honest test of
a sprite is whether it sits on the ground it will really stand on -- a sprite checked against
a checkerboard always looks fine.

Usage:
    key_landmark_sprite.py <in.png> --out <out.png> [--size 192]
                           [--over <base.png> --at x,y] [--preview p.png]
"""
from __future__ import annotations

import argparse
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

KEY = np.array([255, 0, 255], dtype=np.float32)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--out", required=True)
    ap.add_argument("--size", type=int, default=None,
                    help="resample the keyed sprite to this square size (e.g. 192)")
    ap.add_argument("--tol", type=float, default=88.0,
                    help="chroma distance under which a pixel is treated as background")
    ap.add_argument("--hole-tol", type=float, default=34.0,
                    help="chroma distance under which a key pixel counts as a HOLE even when it "
                         "is enclosed by structure -- for sprites that deliberately show terrain "
                         "through, e.g. sea between jetty planks and around hulls. Much tighter "
                         "than --tol so plum and violet artwork is never punched out.")
    ap.add_argument("--over", help="terrain base png to preview the sprite over")
    ap.add_argument("--at", help="pixel x,y in the base to place the sprite anchor")
    ap.add_argument("--preview")
    args = ap.parse_args()

    im = Image.open(args.src).convert("RGB")
    a = np.asarray(im).astype(np.float32)

    # distance to the key colour, but only magenta-ish directions count, so warm browns and
    # mossy greens in the artwork are never mistaken for background
    d = np.sqrt(((a - KEY) ** 2).sum(axis=2))
    magentaish = (a[..., 0] > 110) & (a[..., 2] > 110) & (a[..., 1] < 110)
    bg = (d < args.tol) & magentaish

    # keep only background connected to the border -- a magenta-ish pixel enclosed by the
    # structure is artwork, not a hole
    h, w = bg.shape
    from collections import deque
    keep = np.zeros_like(bg)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bg[y, x] and not keep[y, x]:
                keep[y, x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if bg[y, x] and not keep[y, x]:
                keep[y, x] = True
                q.append((x, y))
    while q:
        cx, cy = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < w and 0 <= ny < h and bg[ny, nx] and not keep[ny, nx]:
                keep[ny, nx] = True
                q.append((nx, ny))

    # ---- enclosed key regions are HOLES, not artwork ----------------------------------------
    # The border flood-fill above exists so a magenta-ish pixel surrounded by structure is
    # treated as artwork rather than punched out. That was right while sprites were solid. It is
    # wrong now: the Port Sapphire brief deliberately puts key field INSIDE the silhouette --
    # between jetty planks, around hulls and pilings -- so the real sea shows through instead of
    # the sprite painting a second, misaligned copy of it. Those regions are enclosed by
    # structure, so the flood fill never reaches them and they survive as opaque magenta.
    #
    # Connectivity alone cannot tell the two cases apart, so colour does: only pixels within
    # --hole-tol of PURE magenta are holes. That is far tighter than --tol, which has to be
    # loose enough to catch the generator's softened background edge, and it keeps dark plum or
    # violet artwork safe.
    keep = keep | (d < args.hole_tol)

    alpha = np.where(keep, 0.0, 255.0).astype(np.uint8)
    al = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(1.0))

    # ---- bleed the artwork outward before feathering, or the feather IS a pink halo ----------
    # The alpha above is binary and then blurred by 1px, so the ring around the silhouette ends
    # up partially opaque -- while its RGB is still pure key magenta underneath. Composited onto
    # grass that reads as a violet outline around the whole town, which is exactly what the
    # chroma key was supposed to remove. Downscaling to 192 with LANCZOS spreads it further.
    #
    # So the background's colour is replaced by the nearest artwork colour before the alpha is
    # attached: the feathered band then fades artwork-to-transparent instead of
    # artwork-to-magenta, and there is no magenta left anywhere to bleed.
    rgb = np.asarray(im).astype(np.float32)
    known = ~keep
    for _ in range(4):
        if known.all():
            break
        pk = np.pad(known, 1, constant_values=False)
        pv = np.pad(rgb, ((1, 1), (1, 1), (0, 0)))
        nb = (pk[:-2, 1:-1].astype(np.float32) + pk[2:, 1:-1] + pk[1:-1, :-2] + pk[1:-1, 2:])
        acc = (pv[:-2, 1:-1] * pk[:-2, 1:-1, None] + pv[2:, 1:-1] * pk[2:, 1:-1, None]
               + pv[1:-1, :-2] * pk[1:-1, :-2, None] + pv[1:-1, 2:] * pk[1:-1, 2:, None])
        fill = (~known) & (nb > 0)
        rgb[fill] = (acc / np.maximum(nb, 1)[..., None])[fill]
        known = known | fill

    # ---- despill the artwork edge, or thin rigging turns pink at the downscale ---------------
    # The generator anti-aliases its own edges, so every boundary between artwork and key field
    # carries a 1-2px ramp of half-magenta that is too far from pure to be keyed and too
    # magenta-ward to be right. On a solid roofline that ramp is invisible. On the trader's
    # rigging -- 2-3px of rope at 1254, sitting in open key field on both sides -- it is most of
    # the line, and a 6.5:1 downscale to 192 renders the whole rope pink.
    #
    # Restricted to a band around the boundary for the same reason as the NPC keyer: a global
    # "pull red and blue down to green" would flatten any legitimately violet artwork. Nothing
    # here is violet, but the next sprite may be.
    band = keep.copy()
    for _ in range(3):
        p = np.pad(band, 1, constant_values=False)
        band = (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:] | band)
    edge = band & ~keep
    spill = np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1]
    take = np.where(edge & (spill > 0), spill, 0.0)
    rgb[..., 0] -= take
    rgb[..., 2] -= take

    rgba = np.dstack([rgb.clip(0, 255).astype(np.uint8), np.asarray(al)])
    out = Image.fromarray(rgba, "RGBA")
    if args.size:
        # ---- resize PREMULTIPLIED, or the key colour comes back at the downscale ------------
        # PIL blends RGBA channels independently, so a transparent pixel's RGB still gets a vote
        # in the resample. The outward bleed above only reaches a few pixels, so the interior of
        # a hole -- the sea showing between jetty planks, or through the trader's rigging -- is
        # still pure magenta underneath its zero alpha. Downscaling 1254 -> 192 then mixes that
        # magenta into every neighbouring sail and plank pixel and the pink streak reappears
        # after the key had already removed it.
        #
        # Premultiplying weights each pixel's colour by its own alpha before resampling, so a
        # fully transparent pixel contributes nothing at all. This is exact, and it is why it is
        # done here rather than by bleeding further: no fill depth is ever guaranteed to be
        # enough, and premultiplication does not need one.
        pm = np.asarray(out).astype(np.float32)
        al = pm[..., 3:4] / 255.0
        pm[..., :3] *= al
        small = np.asarray(Image.fromarray(pm.astype(np.uint8), "RGBA")
                           .resize((args.size, args.size), Image.LANCZOS)).astype(np.float32)
        sa = np.maximum(small[..., 3:4] / 255.0, 1e-6)
        small[..., :3] = np.clip(small[..., :3] / sa, 0, 255)
        out = Image.fromarray(small.astype(np.uint8), "RGBA")
    out.save(args.out)
    cov = 100.0 * (np.asarray(out)[..., 3] > 8).mean()
    print(f"keyed {os.path.basename(args.src)} -> {os.path.basename(args.out)} "
          f"{out.size[0]}x{out.size[1]}  opaque coverage {cov:.1f}%")
    if cov > 96:
        print("  WARNING: almost nothing was keyed out -- was the magenta field actually used?")
    if cov < 8:
        print("  WARNING: almost everything was keyed out -- tolerance may be too high")

    out = ground(out)
    out.save(args.out)

    if args.over and args.at and args.preview:
        base = Image.open(args.over).convert("RGB")
        ax, ay = (int(v) for v in args.at.split(","))
        fx, fy, fw, _fh = footprint(out)
        px, py = ax - fx, ay - fy
        comp = base.copy()
        comp.paste(out, (px, py), out)
        comp.save(args.preview)
        print(f"preview over terrain: {args.preview}  "
              f"(footprint anchor {fx},{fy} placed at cell centre {ax},{ay})")


def footprint(sp):
    """Where the sprite actually MEETS THE GROUND, measured -- not a guessed percentage.

    The owner's note: "fixing the shadows so the assets don't look like they are floating and
    the patch underneath the town is in the wrong place... my guess is that the terrain
    generation and asset placement logic are not in line." They were right: the sprite was
    anchored at a hardcoded 80% down the canvas while the terrain's earth pad was centred on
    the landmark cell, so the two never lined up.

    For an isometric diorama the ground contact is the base ellipse, and the base ellipse's
    centre is the widest part of the silhouette. So measure that band and use its centre as
    the anchor. Then the pad, the shadow and the sprite all agree.
    """
    a = np.asarray(sp)[..., 3] > 8
    widths = a.sum(axis=1)
    if not widths.any():
        return sp.size[0] // 2, sp.size[1] // 2, sp.size[0], 1
    wmax = int(widths.max())
    band = np.where(widths >= 0.85 * wmax)[0]
    fy = int(round(band.mean()))
    cols = np.where(a[band.min():band.max() + 1].any(axis=0))[0]
    fx = int(round((cols.min() + cols.max()) / 2))
    return fx, fy, wmax, int(band.max() - band.min() + 1)


def ground(sp):
    """Bake a contact shadow that matches the measured footprint, so it reads as grounded.

    The previous version drew a small ellipse at the very BOTTOM of the bounding box. On an
    isometric sprite the bottom of the box is the front tip of the base, not the contact
    area, so the shadow sat under the sprite's nose and it looked like it was floating.
    """
    fx, fy, fw, fh = footprint(sp)
    w, h = sp.size
    sh = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(sh)

    # The ellipse has to FIT THE CANVAS, or the clip turns it into a rectangle.
    # `fh` is the height of the band where the silhouette is within 85% of its widest, which is
    # a fine proxy for contact depth on a compact diorama and a bad one on a sprawling one: Port
    # Sapphire stays near-full-width from its rooftops down through the quay, so fh measured 142
    # of 192. The old `max(fh, fw*0.22) * 1.35` then asked for a 203x192 ellipse on a 192x192
    # canvas, and the visible result was a dark RECTANGLE around the town, clipped left, right
    # and bottom -- exactly the "patch underneath the town is in the wrong place" the footprint
    # rewrite was meant to end.
    #
    # A contact shadow under a 2:1 isometric base is wide and shallow by construction, so cap the
    # minor axis against the WIDTH rather than letting the band height drive it, and keep both
    # axes inside the canvas.
    sw = min(int(fw * 1.06), w - 2)
    shh = max(8, min(int(max(fh, fw * 0.22) * 1.35), int(fw * 0.34), h - 2))
    cx = fx + int(fw * 0.045)          # offset down-right, matching the upper-left light
    cy = fy + int(shh * 0.30)
    d.ellipse([cx - sw // 2, cy - shh // 2, cx + sw // 2, cy + shh // 2],
              fill=(12, 14, 12, 132))
    sh = sh.filter(ImageFilter.GaussianBlur(max(3.0, fw * 0.035)))
    return Image.alpha_composite(sh, sp)


if __name__ == "__main__":
    main()
