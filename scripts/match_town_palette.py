#!/usr/bin/env python3
"""Grade a town painting onto millbrook's colour theme, surface by surface.

WHY THIS IS NOT A WHOLE-FRAME GRADE. The three paintings' frame luminances are 119.8, 81.2 and
83.4, which looks like a two-stop exposure difference and is not one: millbrook is 36% open sunlit
lawn while Port Sapphire is 16% dark harbour water and greenhollow is backed by a rock cliff and
dense canopy. Frame luminance is a COMPOSITION statistic. Matched like surface with like surface,
the towns differ in exactly one place:

    surface   millbrook        portSapphire     greenhollow
    cobble    (192,183,165)    (198,194,166)    (186,182,161)   <- already identical, leave alone
    sunlit    (157,184, 45)    (124,146, 30)    (108,133, 24)   <- millbrook's is the warm one
    shade     ( 60, 81, 31)    ( 21, 30,  8)    ( 19, 30,  7)   <- and its shadows are not black

So the grade touches the GREEN FAMILY ONLY: grass, canopy, hedge, planting. Cobble, timber, roofs,
water and rock are left exactly as painted, because they already agree and because Port Sapphire's
harbour and greenhollow's cliff are subject, not palette.

THE CURVE. Per channel, a monotone piecewise-linear map pinned at four points: (0,0), this town's
shade green -> millbrook's shade green, this town's sunlit green -> millbrook's sunlit green, and
(255,255). Two anchors rather than one because a single gain fitted on sunlit grass leaves the
shadows too cold -- fitted that way the blue channel lands shade at 15-19 where millbrook's is 31,
and the greens read as night-time. Pinning 0 and 255 keeps the curve from crushing or blowing.

THE MASK IS FEATHERED. A hard green/not-green mask leaves a one-pixel unlifted fringe everywhere
grass meets a wall, which reads as a dark outline around every building. The mask is blurred and
the graded result is blended through it.
"""
from __future__ import annotations
import argparse, os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REFERENCE = "millbrook"          # the town whose theme the owner picked


def green_mask(im: np.ndarray) -> np.ndarray:
    """Grass, canopy, hedge and planting -- hue 55-175 with enough saturation to be foliage."""
    a = im / 255.0
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(2), a.min(2)
    d = mx - mn + 1e-6
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    h = np.where(mx == r, ((g - b) / d) % 6,
                 np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    return (h > 55) & (h < 175) & (s > 0.15)


def anchors(im: np.ndarray):
    """This painting's sunlit green and its shade green, as RGB triples."""
    m = green_mask(im)
    px = im[m]
    lum = 0.299 * px[:, 0] + 0.587 * px[:, 1] + 0.114 * px[:, 2]
    return px[lum >= np.percentile(lum, 60)].mean(0), px[lum <= np.percentile(lum, 30)].mean(0)


def grade(src: np.ndarray, sun_t: np.ndarray, shade_t: np.ndarray) -> np.ndarray:
    sun_s, shade_s = anchors(src)
    out = src.copy()
    for c in range(3):
        xs = [0.0, float(shade_s[c]), float(sun_s[c]), 255.0]
        ys = [0.0, float(shade_t[c]), float(sun_t[c]), 255.0]
        for k in range(1, 4):                      # keep it monotone even if an anchor inverts
            xs[k] = max(xs[k], xs[k - 1] + 1e-3)
            ys[k] = max(ys[k], ys[k - 1] + 1e-3)
        out[..., c] = np.interp(src[..., c], xs, ys)
    w = np.asarray(Image.fromarray((green_mask(src) * 255).astype(np.uint8))
                   .filter(ImageFilter.GaussianBlur(2.0)), np.float32)[..., None] / 255.0
    return np.clip(src * (1 - w) + out * w, 0, 255)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--town", required=True)
    ap.add_argument("--src", default=None, help="default design/act1-towns/<town>/painting-raw.png")
    ap.add_argument("--out", default=None, help="default alongside src as painting-graded.png")
    a = ap.parse_args()
    src_p = a.src or f"design/act1-towns/{a.town}/painting-raw.png"
    out_p = a.out or os.path.join(os.path.dirname(src_p), "painting-graded.png")
    ref = np.asarray(Image.open(
        f"design/act1-towns/{REFERENCE}/painting-raw.png").convert("RGB")).astype(np.float32)
    sun_t, shade_t = anchors(ref)
    src = np.asarray(Image.open(src_p).convert("RGB")).astype(np.float32)
    res = grade(src, sun_t, shade_t)
    Image.fromarray(res.astype(np.uint8)).save(out_p)
    s_sun, s_sh = anchors(src)
    r_sun, r_sh = anchors(res)
    f = lambda v: "(%5.1f,%5.1f,%5.1f)" % tuple(v)
    print(f"{a.town}: sunlit {f(s_sun)} -> {f(r_sun)}  target {f(sun_t)}")
    print(f"{a.town}: shade  {f(s_sh)} -> {f(r_sh)}  target {f(shade_t)}")
    print("  ->", out_p)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
