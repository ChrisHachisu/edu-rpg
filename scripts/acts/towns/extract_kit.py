#!/usr/bin/env python3
"""Cut the Act 1 town plates into a reusable building / prop KIT with alpha.

Input  : public/act1-hifi/town/<town>-screen.png (the three shipped 1950 plates) and
         design/act1-towns/<town>-authored-obstacles.json (the AUTHORED roof/footprint bands
         that Act 1 already locked as collision -- reused here as the "definitely object" seed).
Spec   : scripts/acts/towns/kit.json  -- one entry per piece: source town, crop box, seed band,
         tags, and the piece's collision footprint (art px, relative to the crop).
Output : $SCRATCH/kit/<id>.png  RGBA cut-out, Act 1 colours untouched
         $SCRATCH/kit/<id>-shadow.png  L: how much the painted ground around it was shaded
         $SCRATCH/kit/kit-sheet.png  contact sheet to LOOK at

Matte rule. Ground (pale cobble, sunlit lawn) that is CONNECTED TO THE CROP BORDER is ground and
goes transparent; everything else stays. The authored band is never eaten, so a stone wall that
happens to be cobble-coloured is safe. Shaded ground is kept as a separate shadow channel instead of
as opaque dark pixels, so a building drops onto snow/sand/ash with its own shadow and no green halo.
"""
import argparse
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

from kitlib import (ACT1_DESIGN, ACT1_TOWN, HERE, SCRATCH, hsv, load_rgb, poly_mask, read_json,
                    save_rgba, write_json)


def bands(town):
    p = os.path.join(ACT1_DESIGN, f"{town}-authored-obstacles.json")
    out = {}
    for b in read_json(p)["nonWalkableBands"]:
        if b.get("polygonArt"):
            out[b["id"]] = b["polygonArt"]
    return out


def ground_classes(a):
    h, s, v, lum = hsv(a)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # lawn: the bright yellow-green Act 1 grass, including its own mid-tone blades
    lawn = (h > 52) & (h < 115) & (s > 0.30) & (lum >= 78) & (g > b * 1.6)
    # cobble: pale, low saturation (grout included)
    cob = (lum > 70) & (s < 0.30) & (np.abs(r - g) < 40) & (b < r * 1.3) & (b > r * 0.55)
    # Port Sapphire's big flags have olive grout (sat ~0.35) that breaks connectivity: close the
    # stone mask across the grout, but only where the grout is low-sat olive/grey, never a wall line
    grout = (lum > 60) & (s < 0.55) & (h > 35) & (h < 80)
    cob = cob | (ndi.binary_closing(cob, iterations=3) & grout)
    return lawn, cob, lum


def matte(a, band, min_island=220, protect=None, reach=60):
    lawn, cob, lum = ground_classes(a)
    h0, s0, v0, l0 = hsv(a)
    strict_lawn = (h0 > 60) & (h0 < 96) & (s0 > 0.55) & (l0 >= 92)
    if protect is not None:
        strict_lawn &= ~protect
    cand = ((lawn | cob) & ~band) | (strict_lawn & band)
    lab, n = ndi.label(cand)
    border = np.zeros_like(cand)
    border[0, :] = border[-1, :] = border[:, 0] = border[:, -1] = True
    touch = np.unique(lab[border & cand])
    ground = np.isin(lab, touch[touch > 0])
    obj = ~ground
    # never reach further than `reach` px from the authored band: that is a neighbour's garden
    obj &= ndi.binary_dilation(band, iterations=reach) if band.any() else obj
    # keep only components that overlap the building core, or are large in their own right
    lab2, n2 = ndi.label(obj)
    sizes = ndi.sum(np.ones_like(obj), lab2, index=np.arange(1, n2 + 1))
    core = band & obj
    touch_band = np.unique(lab2[core])
    keep = np.zeros(n2 + 1, bool)
    keep[1:] = sizes >= min_island
    keep[touch_band] = True
    keep[0] = False
    obj = keep[lab2]
    # specks INSIDE the kept component that are pure lawn sparkle: open then re-add the core
    opened = ndi.binary_opening(obj, iterations=2)
    obj = (opened | (core & obj)) & obj
    obj = ndi.binary_closing(obj, iterations=1)
    # enclosed cobble/lawn remnants outside the authored band (a lane the flood could not reach
    # because a barrel walled it in) are still ground: drop the big ones
    rem = obj & ~band & (lawn | cob)
    rem = ndi.binary_opening(rem, iterations=2)
    lab3, n3 = ndi.label(rem)
    if n3:
        sz = ndi.sum(np.ones_like(rem), lab3, index=np.arange(1, n3 + 1))
        obj &= ~np.isin(lab3, 1 + np.nonzero(sz > 500)[0])
    if protect is not None:
        obj |= protect
    # SHADOW is low-pass: the painted ground's own grout/stone pattern must not become shadow.
    # Normalised convolution of luminance over ground pixels only, then compare with the sunlit
    # reference of each class.
    g = (~obj).astype(np.float32)
    num = ndi.gaussian_filter(lum * g, 7)
    den = ndi.gaussian_filter(g, 7) + 1e-3
    low = num / den
    ref_l = np.percentile(lum[lawn & ground], 60) if (lawn & ground).sum() > 200 else 150
    ref_c = np.percentile(lum[cob & ground], 60) if (cob & ground).sum() > 200 else 185
    greenish = ndi.gaussian_filter(((h0 > 50) & (h0 < 140) & (s0 > 0.25)).astype(np.float32), 5) > 0.5
    ref = np.where(greenish, ref_l, ref_c)
    shadow = np.clip((1.0 - low / ref - 0.12) * 1.4, 0, 0.6)
    shadow = ndi.gaussian_filter(shadow, 2.0) * (~obj)
    return obj, shadow


def roof_mask(a, obj, band, pts, hue_tol=12, sat_tol=0.16, frac=0.80):
    """Roof = object pixels in the band's upper part sharing the sampled roof chroma."""
    h, s, v, lum = hsv(a)
    if not pts:
        return np.zeros_like(obj)
    hs, ss = [], []
    for (x, y) in pts:
        hs.append(np.median(h[y - 12:y + 13, x - 12:x + 13]))
        ss.append(np.median(s[y - 12:y + 13, x - 12:x + 13]))
    m = np.zeros_like(obj)
    for hh, sv in zip(hs, ss):
        dh = np.abs(((h - hh) + 180) % 360 - 180)
        m |= (dh < hue_tol) & (np.abs(s - sv) < sat_tol) & (lum > 18)
    ys, xs = np.nonzero(band)
    top, bot = ys.min(), ys.max()
    upper = np.zeros_like(obj)
    upper[top:int(top + frac * (bot - top))] = True
    m &= obj & upper
    m = ndi.binary_opening(m, iterations=1)
    # tile shading/gaps are dark and hue-unreliable: close across them and fill enclosed holes so a
    # snow cap is a cap, not a dashed pattern. Hard-limit to the object and the band's upper part.
    m = ndi.binary_fill_holes(ndi.binary_closing(m, iterations=5)) & obj & upper
    leafy = (h > 55) & (h < 120) & (s > 0.45) & (lum > 70)
    m &= ~ndi.binary_dilation(ndi.binary_opening(leafy, iterations=2), iterations=2)
    lab, n = ndi.label(m)
    if n:
        sizes = ndi.sum(np.ones_like(m), lab, index=np.arange(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = sizes > 0.04 * sizes.max()
        m = keep[lab]
    return m


def top_rows(shape, cut):
    m = np.zeros(shape, bool)
    m[:cut] = True
    return m


def soften(obj):
    """1 px anti-aliased edge -- sharp, not over-sharpened."""
    f = ndi.gaussian_filter(obj.astype(np.float32), 0.6)
    # inside edge only: an outside fringe carries the Act 1 ground colour at low alpha, which reads
    # as green/grey specks once the ground around it is snow, sand or ash
    return np.where(obj, np.maximum(f, 0.6), 0.0).clip(0, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", default=os.path.join(HERE, "kit.json"))
    ap.add_argument("--only", default=None)
    args = ap.parse_args()
    spec = read_json(args.spec)
    out_dir = os.path.join(SCRATCH, "kit")
    os.makedirs(out_dir, exist_ok=True)
    plates, bandcache = {}, {}
    mp = os.path.join(out_dir, "kit-meta.json")
    meta = read_json(mp) if (args.only and os.path.exists(mp)) else {}
    for piece in spec["pieces"]:
        pid = piece["id"]
        if args.only and pid not in args.only.split(","):
            continue
        town = piece["src"]
        if town not in plates:
            plates[town] = load_rgb(os.path.join(ACT1_TOWN, f"{town}-screen.png"))
            bandcache[town] = bands(town)
        x0, y0, x1, y1 = piece["box"]
        a = plates[town][y0:y1, x0:x1]
        polys = []
        for bid in piece.get("bands", []):
            polys.append(bandcache[town][bid])
        polys += piece.get("seed", [])
        band = poly_mask(a.shape[:2], polys, offset=(x0, y0)) if polys else np.zeros(a.shape[:2], bool)
        if piece.get("mode") == "fence":
            prot = poly_mask(a.shape[:2], piece["protect"], offset=(x0, y0))
            h0, s0, v0, l0 = hsv(a)
            timber = (h0 >= 15) & (h0 < 52) & (s0 > 0.25)
            dark = l0 < 70
            obj = prot & (timber | dark)
            obj = ndi.binary_closing(obj, iterations=2) & prot
            obj = ndi.binary_opening(obj, iterations=1)
            lab, n = ndi.label(obj)
            if n:
                sz = ndi.sum(np.ones_like(obj), lab, index=np.arange(1, n + 1))
                obj = np.isin(lab, 1 + np.nonzero(sz > 400)[0])
            band = obj
            shadow = np.zeros(a.shape[:2], np.float32)
        elif piece.get("mode") in ("darker", "notgreen"):
            prot = poly_mask(a.shape[:2], piece["protect"], offset=(x0, y0))
            h0, s0, v0, l0 = hsv(a)
            if piece["mode"] == "darker":
                low = ndi.gaussian_filter(l0, 2.5)
                ref = np.percentile(l0[~prot], 55)
                obj = prot & (low < ref * piece.get("k", 0.86))
            else:
                g = (h0 > 50) & (h0 < 118) & (s0 > 0.33)
                g = ndi.binary_opening(g, iterations=1)
                obj = prot & ~g
            if piece["mode"] == "darker":
                from scipy.spatial import ConvexHull
                ys, xs = np.nonzero(obj)
                cut = int(np.percentile(ys, 82))      # canopy above, trunk below
                top = obj.copy(); top[cut:] = False
                pts = np.argwhere(top)[:, ::-1]
                hv = pts[ConvexHull(pts).vertices]
                hull = poly_mask(obj.shape, [hv.tolist()]) & prot
                ring = hull & ~ndi.binary_erosion(hull, iterations=12)
                sl = (h0 > 58) & (h0 < 98) & (s0 > 0.5) & (l0 >= 105)
                hull &= ~(ring & sl)
                obj = hull | (ndi.binary_closing(obj, iterations=2) & ~top_rows(obj.shape, cut))
                sl2 = (h0 > 55) & (h0 < 110) & (s0 > 0.4) & (l0 >= 90)
                obj &= ~(sl2 & ~top_rows(obj.shape, cut))
            obj = ndi.binary_fill_holes(ndi.binary_closing(obj, iterations=3))
            obj = ndi.binary_opening(obj, iterations=2)
            lab, n = ndi.label(obj)
            if n:
                sz = ndi.sum(np.ones_like(obj), lab, index=np.arange(1, n + 1))
                obj = np.isin(lab, 1 + np.nonzero(sz > 0.08 * sz.max())[0])
            band = obj
            shadow = np.zeros(a.shape[:2], np.float32)
        elif piece.get("solid"):
            obj = np.ones(a.shape[:2], bool) if piece["solid"] is True else poly_mask(
                a.shape[:2], piece["solid"], offset=(x0, y0))
            shadow = np.zeros(a.shape[:2], np.float32)
        else:
            prot = poly_mask(a.shape[:2], piece["protect"], offset=(x0, y0)) if piece.get("protect") else None
            obj, shadow = matte(a, band, min_island=piece.get("min_island", 220), protect=prot,
                                reach=piece.get("reach", 60))
        # GARDEN FRINGE: Act 1 hedges/flowers/lawn tufts outside the authored footprint make a lacy
        # green edge that turns into dark speckle in every biome. Keep only SOLID foliage masses
        # (a bush, a tree) and drop the lace.
        if band.any() and not piece.get("mode"):
            h0, s0, v0, l0 = hsv(a)
            greenish = (h0 > 50) & (h0 < 175) & (s0 > 0.25)
            outside = obj & ~band
            lace = outside & greenish
            solid = ndi.binary_opening(lace, iterations=5)
            obj &= ~(lace & ~solid)
            # also anything outside the band that is now a thin sliver
            sliver = obj & ~band
            obj &= ~(sliver & ~ndi.binary_opening(sliver, iterations=3))
        # never end on a ruler-straight crop edge: fade the outer ring of the crop out
        ring = np.zeros_like(obj)
        ring[:6] = ring[-6:] = ring[:, :6] = ring[:, -6:] = True
        obj &= ~ring
        if piece.get("clipTop") is not None and band.any():
            top = np.nonzero(band.any(1))[0].min() - piece["clipTop"]
            obj[:max(0, top)] = False
        lab_c, n_c = ndi.label(obj)
        if n_c > 1:
            szc = ndi.sum(np.ones_like(obj), lab_c, index=np.arange(1, n_c + 1))
            obj = np.isin(lab_c, 1 + np.nonzero(szc > max(150, 0.01 * szc.max()))[0])
        alpha = soften(obj)
        # ground left inside the cut-out (paved aprons, garden lawn) -> graded as ground, not wall
        lw, cb, _ = ground_classes(a)
        gnd = obj & ~band & (lw | cb)
        # paved yards INSIDE the authored band (warehouse yard, porch flags): large, compact cobble
        yard = ndi.binary_opening(obj & band & cb, iterations=4)
        ly, ny = ndi.label(yard)
        if ny:
            sz = ndi.sum(np.ones_like(yard), ly, index=np.arange(1, ny + 1))
            big = np.isin(ly, 1 + np.nonzero(sz > 2500)[0])
            gnd |= ndi.binary_dilation(big, iterations=3) & cb
        # cobble/lawn strips inside the band that touch the cut-out's outer edge (the lane that ran
        # behind or beside the roof in Act 1) are ground too
        outer_edge = ndi.binary_dilation(~obj, iterations=2)
        strip = obj & band & (cb | lw)
        strip = ndi.binary_opening(strip, iterations=1)
        ls, ns = ndi.label(strip)
        if ns:
            touch = np.unique(ls[outer_edge & strip])
            sz = ndi.sum(np.ones_like(strip), ls, index=np.arange(1, ns + 1))
            keep = [t for t in touch if t > 0 and sz[t - 1] > 150]
            gnd |= np.isin(ls, keep)
        if piece.get("protect"):
            gnd &= ~poly_mask(a.shape[:2], piece["protect"], offset=(x0, y0))
        Image.fromarray((gnd * 255).astype(np.uint8)).save(os.path.join(out_dir, f"{pid}-ground.png"))
        rpts = [(x - x0, y - y0) for x, y in piece.get("roof", [])]
        if not rpts and band.any() and not piece.get("noroof"):
            ys, xs = np.nonzero(band)
            yy = int(ys.min() + 0.22 * (ys.max() - ys.min()))
            row = np.nonzero(band[yy])[0]
            rpts = [(int(row.min() + f * (row.max() - row.min())), yy) for f in (0.5,)]
        roof = roof_mask(a, obj, band if band.any() else obj, rpts, hue_tol=piece.get('roofTol', 12), sat_tol=piece.get('roofSat', 0.16), frac=piece.get('roofFrac', 0.80)) if rpts else np.zeros_like(obj)
        if piece.get("roofPoly"):
            roof &= poly_mask(a.shape[:2], [piece["roofPoly"]], offset=(x0, y0))
        Image.fromarray((roof * 255).astype(np.uint8)).save(os.path.join(out_dir, f"{pid}-roof.png"))
        save_rgba(os.path.join(out_dir, f"{pid}.png"), a, alpha)
        Image.fromarray((shadow * 255).astype(np.uint8)).save(os.path.join(out_dir, f"{pid}-shadow.png"))
        # collision footprint relative to crop: authored band, clipped to the BASE of the piece.
        foot = piece.get("foot")
        meta[pid] = {"size": [x1 - x0, y1 - y0], "tags": piece.get("tags", []), "src": town,
                     "box": piece["box"], "foot": foot, "front": piece.get("front"),
                     "roof": piece.get("roof"),
                     "band": [[x - x0, y - y0] for x, y in polys[0]] if polys else None}
        print(f"{pid:22s} {x1-x0}x{y1-y0}  object {obj.mean()*100:5.1f}%")
    write_json(os.path.join(out_dir, "kit-meta.json"), meta)


if __name__ == "__main__":
    main()
