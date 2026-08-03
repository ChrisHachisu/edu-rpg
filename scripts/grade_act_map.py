#!/usr/bin/env python3
"""ONE global colour grade on the ONE stitched act map. Replaces all per-tile tone correction.

Why this exists, and why it is the only tone step left:

Three separate corrections used to be stacked on these pixels -- the generation itself, then
`retone_tiles.py --apply`, then `stitch_art_tiles.py`'s `normalise_tone` -- each measured
against a different reference, and each computed PER TILE. A per-tile gain is what made the sea
read as a patchwork: two neighbours get two different gains, and the 144px band they share
(byte-identical by construction, via prime_tile_base.py --lock) is pulled apart by that
difference right before the min-error cut has to choose between the two copies.

The gain field here depends ONLY on the act-wide semantic mask, never on which tile a pixel came
from. Two pixels with the same class and the same neighbourhood get the same gain wherever they
are, so byte-identical strips stay byte-identical and no tile boundary can appear. That is the
whole argument for grading once, globally, at the end.

The field is built at the semantic mask's native resolution and upsampled, which is exact enough
because it is smooth by construction, and keeps peak memory to a few hundred MB on a 62 Mpx map.

Class edges are feathered (--sigma, in mask pixels) so that a shoreline -- where the gain steps
from 1.33 on land to 0.64 on water -- grades across the same soft band the artwork already
draws, instead of cutting a hard line through it.

Hue handling (--mode):
  luminance  every channel of a class scaled by the same factor: hits the target LUMINANCE and
             leaves hue untouched.
  rgb        each channel scaled to hit the target mean RGB exactly: hits hue too.
  hybrid     (default) rgb for ground/rock/water, luminance for forest.

`hybrid` is the default because of a real measurement trap. The target theme's forest mean is
(13,30,40) -- hue 202 degrees, i.e. blue -- against the current (21,27,18) at hue 100 degrees.
That is not a forest that is meant to be blue; it is what averaging a near-black, shadow-
dominated region does to a mean. Taking it literally means a 2.28x blue gain and a teal forest.
The forest's LUMINANCE is already almost right (24.9 against a target of 27), so the honest
correction there is the luminance one. The other three classes shift hue by under 10 degrees,
where the per-channel match is safe and lands exactly on the palette the owner picked.

Flat-field (--ff-sigma, 0 disables):

A single gain per class fixes the act's OVERALL palette but keeps every relative difference
inside a class. The tiles were generated independently, so water alone spans 42-55 before
grading; a constant gain carries that straight through and the sea still reads as blocks.

So each class gets a smooth gain FIELD instead of a single number: divide out a heavily blurred
local mean of that class and multiply in its target, which lands the class on target EVERYWHERE
rather than only on average. The local mean is masked (blur(L*m)/blur(m)), so a class is only
ever measured against its own pixels and boundaries do not bleed.

This is not per-tile correction wearing a disguise, and the difference is the whole point. A
per-tile gain field is piecewise-constant with jumps exactly on the tile grid -- it CREATES
edges, which is what broke the seams. This field is a wide Gaussian of the image content: it is
continuous everywhere, knows nothing about where tiles are, and its gradient is bounded by the
blur radius. A continuous field cannot introduce a discontinuity; it can only reduce the ones
already there.

Usage:
    grade_act_map.py <in.png> <out.png> [--mode hybrid] [--sigma 5.3] [--ff-sigma 30]
                     [--report r.json]
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/continent-terrain-class-method/owner-terrain/art-tiles")
MASK = os.path.join(DIR, "act1-smoothed-semantic.png")
LEGEND = {(226, 210, 156): "ground", (26, 82, 46): "forest",
          (128, 126, 122): "rock", (30, 82, 170): "water"}

# The owner picked this theme; these are measured from TARGET-COLOUR-THEME.png, not chosen.
TARGET_RGB = {"ground": (101, 114, 33), "forest": (13, 30, 40),
              "water": (10, 34, 55), "rock": (69, 67, 56)}
TARGET_LUM = {"ground": 105.0, "forest": 27.0, "water": 31.0, "rock": 66.0}
LUM_ONLY = {"forest"}                      # see the hue note above
SHOULDER = 205.0                           # highlights roll off instead of clipping flat
MAX_GAIN = 2.6


def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def _box(a, r, axis):
    """Edge-clamped moving average of width 2r+1, via cumulative sums."""
    n = a.shape[axis]
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r, r)
    ap = np.pad(a, pad, mode="edge")
    zshape = list(ap.shape)
    zshape[axis] = 1
    c = np.concatenate([np.zeros(zshape, np.float64),
                        np.cumsum(ap, axis=axis, dtype=np.float64)], axis=axis)
    hi = [slice(None)] * a.ndim
    lo = [slice(None)] * a.ndim
    hi[axis] = slice(2 * r + 1, 2 * r + 1 + n)
    lo[axis] = slice(0, n)
    return ((c[tuple(hi)] - c[tuple(lo)]) / (2 * r + 1)).astype(np.float32)


def gblur(a, sigma):
    """Gaussian blur by three successive box passes (PIL cannot blur float images, and this
    map has no scipy). Three passes is within ~3% of a true Gaussian, which is far tighter
    than anything the flat-field needs -- it only has to be smooth."""
    if sigma <= 0:
        return a.astype(np.float32)
    r = max(1, int(round((np.sqrt(4.0 * sigma * sigma + 1.0) - 1.0) / 2.0)))
    out = a.astype(np.float32)
    for _ in range(3):
        out = _box(_box(out, r, 0), r, 1)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--mode", choices=("hybrid", "luminance", "rgb"), default="hybrid")
    ap.add_argument("--sigma", type=float, default=5.3,
                    help="feather radius in MASK pixels (mask is 1/3 scale, so ~16px on the map)")
    ap.add_argument("--ff-sigma", type=float, default=30.0,
                    help="flat-field blur, in QUARTER-mask pixels (30 ~= 1.4 tiles). 0 disables")
    ap.add_argument("--report")
    args = ap.parse_args()

    img = Image.open(args.src).convert("RGB")
    W, H = img.size
    sem_img = Image.open(MASK).convert("RGB")
    mw, mh = sem_img.size
    sem = np.asarray(sem_img).astype(int)
    print(f"map {W}x{H}   mask {mw}x{mh}   mode {args.mode}   sigma {args.sigma} mask-px")

    # ---- measure current per-class means, through the mask (the one reliable measurement) ----
    arr = np.asarray(img)
    small = np.asarray(img.resize((mw, mh), Image.BOX)).astype(np.float32)
    cur, masks = {}, {}
    for rgb, key in LEGEND.items():
        m = (np.abs(sem - np.array(rgb)).sum(axis=2) < 20)
        masks[key] = m
        if m.sum() >= 10000:
            cur[key] = (small[m].mean(axis=0), float(lum(small[m]).mean()))

    # ---- per-class, per-channel gains ----
    gains, report = {}, {}
    for key, (mean_rgb, mean_l) in cur.items():
        use_lum = (args.mode == "luminance") or (args.mode == "hybrid" and key in LUM_ONLY)
        if use_lum:
            g = np.full(3, TARGET_LUM[key] / max(mean_l, 1e-6), np.float32)
        else:
            g = np.array([TARGET_RGB[key][c] / max(float(mean_rgb[c]), 1e-6)
                          for c in range(3)], np.float32)
        g = np.clip(g, 1.0 / MAX_GAIN, MAX_GAIN)
        gains[key] = g
        report[key] = {"currentRGB": [round(float(v), 1) for v in mean_rgb],
                       "currentLum": round(mean_l, 1),
                       "targetRGB": list(TARGET_RGB[key]), "targetLum": TARGET_LUM[key],
                       "gain": [round(float(v), 3) for v in g],
                       "mode": "luminance" if use_lum else "rgb",
                       "coveragePct": round(float(masks[key].mean() * 100), 1)}
        print(f"  {key:<7} {str([round(float(v),1) for v in mean_rgb]):<20} L{mean_l:5.1f}"
              f"  ->  gain {np.round(g,3)}  ({'lum' if use_lum else 'rgb'})")

    # ---- build the gain field at mask resolution, feather, then upsample --------------------
    # Weights come only from the act-wide mask, so the field is identical for identical
    # neighbourhoods anywhere on the map. That is what makes patchwork impossible.
    wsum = np.zeros((mh, mw), np.float32)
    acc = np.zeros((mh, mw, 3), np.float32)
    blur = ImageFilter.GaussianBlur(args.sigma)
    Lm = lum(small)                                   # luminance at mask resolution
    qw, qh = mw // 4, mh // 4


    def shrink(a):
        return np.asarray(Image.fromarray(a.astype(np.float32), mode="F")
                          .resize((qw, qh), Image.BOX), dtype=np.float32)

    for key, g in gains.items():
        m = masks[key]
        # chroma-only part of the gain: g with its luminance component divided out, so the
        # spatial term below is solely responsible for level.
        chroma = g * (cur[key][1] / TARGET_LUM[key])
        if args.ff_sigma > 0:
            num = gblur(shrink(Lm * m), args.ff_sigma)
            den = gblur(shrink(m.astype(np.float32)), args.ff_sigma)
            local = np.where(den > 1e-3, num / np.maximum(den, 1e-6), cur[key][1])
            local = np.clip(local, 1.0, None)
            s = np.clip(TARGET_LUM[key] / local, 0.55, 1.9)
            s = np.asarray(Image.fromarray(s, mode="F").resize((mw, mh), Image.BILINEAR),
                           dtype=np.float32)
            report[key]["flatFieldGainRange"] = [round(float(s.min()), 3),
                                                 round(float(s.max()), 3)]
        else:
            s = np.full((mh, mw), TARGET_LUM[key] / cur[key][1], np.float32)
        w = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(blur),
                       dtype=np.float32) / 255.0
        wsum += w
        acc += (w * s)[..., None] * chroma[None, None, :]
        del s, w
    unc = float((wsum < 0.05).mean() * 100)
    acc += (np.clip(1.0 - wsum, 0.0, 1.0)[..., None])      # unclassified -> gain 1.0
    wsum = np.maximum(wsum, 0.0) + np.clip(1.0 - wsum, 0.0, 1.0)
    field = acc / np.maximum(wsum, 1e-6)[..., None]
    print(f"  gain field built; {unc:.2f}% of the map is unclassified (left at gain 1.0)")

    # ---- apply, one channel at a time to bound memory on a 62 Mpx image ---------------------
    out = np.empty_like(arr)
    for c in range(3):
        gch = np.asarray(Image.fromarray(field[..., c], mode="F").resize((W, H), Image.BILINEAR),
                         dtype=np.float32)
        v = arr[..., c].astype(np.float32) * gch
        del gch
        hi = v > SHOULDER                    # soft shoulder: compress instead of clipping flat
        v[hi] = SHOULDER + (255.0 - SHOULDER) * (
            1.0 - np.exp(-(v[hi] - SHOULDER) / (255.0 - SHOULDER)))
        out[..., c] = np.clip(v, 0, 255).astype(np.uint8)
        del v
    res = Image.fromarray(out)
    res.save(args.dst)
    print(f"wrote {args.dst}  {res.size[0]}x{res.size[1]}")

    # ---- verify we landed on the target ----------------------------------------------------
    chk = np.asarray(res.resize((mw, mh), Image.BOX)).astype(np.float32)
    print("  after grade:")
    for key in cur:
        m = masks[key]
        gl = float(lum(chk[m]).mean())
        report[key]["gradedLum"] = round(gl, 1)
        report[key]["gradedRGB"] = [round(float(v), 1) for v in chk[m].mean(axis=0)]
        print(f"    {key:<7} L {gl:5.1f}  (target {TARGET_LUM[key]:5.1f})   "
              f"RGB {report[key]['gradedRGB']}")
    if args.report:
        json.dump({"mode": args.mode, "sigma": args.sigma, "classes": report},
                  open(args.report, "w"), indent=1)
        print(f"  report: {args.report}")


if __name__ == "__main__":
    main()
