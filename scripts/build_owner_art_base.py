#!/usr/bin/env python3
"""Render a TEXTURED PROXY-ART BASE from the owner's painted terrain, for img2img elevation.

The point. A flat colour map is a weak conditioning signal: given one, the image model
invents a scene and invention relocates terrain (measured drift of 25-60%, and a V2 trial
silently dropped an entire rock cap). A textured base that already READS as terrain art is
a strong signal -- the model only has to add material and light, so composition survives.
Measured: swapping a flat map for a base like this cut layout drift from ~40-60% to 3-14%.

    "The base is composition truth and it is now clean.
     Reproduce what it shows; add material and light, invent nothing."
        -- dq-art-full-v2/RESUME-briefs/phase3-batch-01.md

THE LESSON FROM V4 (owner review): the base teaches the model what the material IS, so a
flat proxy yields flat material. V4's rock was a scatter of flat shaded polygons and the
model faithfully elevated it into flat cracked flagstones -- "the mountain ranges just look
like rubble". Scattered slabs have no topography, so there is no range to elevate into.

So rock is now built from an actual HEIGHTFIELD:
  * a smooth dome (rising away from the mask edge) gives the massif its bulk
  * ridged multifractal noise (1-|n|)^2 lays down crest LINES, so there are spines and peaks
  * hillshading against the locked upper-left light gives real slopes and cast shadow
  * the shade is QUANTIZED into bands, which reads as the locked "stepped shading" and as
    faceted rock -- facets that follow the topography instead of scattered rubble
  * crests go bare and light, hollows collect moss, scree gathers at the foot

Grass likewise gets multi-scale patchiness, clustered ferns, dry scuffs and leaf litter near
treelines, because V4's grass elevated into something "a bit too uniform".

THE INVARIANT: the class at every cell CENTRE equals the owner's paint. Decoration layers
are clipped to their own mask dilated by OVERHANG_MAX (< half a cell), so canopy overhangs
the treeline and scree spills onto grass while no object can ever reach a neighbouring
cell's centre.

Usage:
    build_owner_art_base.py <act> --tile x,y [--cells 26] [--px 48]
"""
from __future__ import annotations

import argparse
import os
import sys

import json

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import smooth_owner_semantic as sm  # noqa: E402
from build_owner_semantic_maps import kind_of  # noqa: E402

ROOT = sm.ROOT
OUT = sm.OUT

# ground/forest from the owner-approved method test; rock/trail from the FINALISED
# pipeline's landTargetsRgb (finalization-report-fixedbase2.json).
BASE_RGB = {
    "ground":     (116, 134, 38),
    "vegetation": (39, 50, 28),
    "rock":       (86, 79, 67),
    "water":      (26, 56, 84),
    "path":       (106, 84, 49),
}
OVERHANG_MAX = 20
SEED = 42


def vnoise(shape, cells, rng, octaves=4):
    """Multi-octave value noise, unit variance."""
    h, w = shape
    acc = np.zeros(shape, dtype=np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = max(2, int(cells * (2 ** o)))
        gg = rng.standard_normal((n, n)).astype(np.float32)
        up = np.asarray(Image.fromarray(gg).resize((w, h), Image.Resampling.BICUBIC),
                        dtype=np.float32)
        acc += amp * up
        tot += amp
        amp *= 0.5
    acc /= max(tot, 1e-6)
    s = acc.std()
    return acc / s if s > 0 else acc


def ridged(shape, cells, rng, octaves=5):
    """Ridged multifractal -- produces crest LINES, which is what makes a range read."""
    h, w = shape
    acc = np.zeros(shape, dtype=np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = max(2, int(cells * (1.9 ** o)))
        gg = rng.standard_normal((n, n)).astype(np.float32)
        up = np.array(Image.fromarray(gg).resize((w, h), Image.Resampling.BICUBIC),
                      dtype=np.float32)
        up /= max(float(up.std()), 1e-6)
        acc += amp * (1.0 - np.abs(up)) ** 2
        tot += amp
        amp *= 0.52
    acc /= max(tot, 1e-6)
    lo, hi = acc.min(), acc.max()
    return (acc - lo) / max(hi - lo, 1e-6)


def hillshade(hf, zf=2.6):
    """Shade a heightfield with the locked single upper-left light source."""
    gy, gx = np.gradient(hf.astype(np.float32))
    nx, ny, nz = -gx * zf, -gy * zf, np.ones_like(hf)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    lx, ly, lz = -0.58, -0.58, 0.57      # from the upper LEFT
    return np.clip((nx * lx + ny * ly + nz * lz) / np.maximum(ln, 1e-6), 0.0, 1.0)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("act")
    ap.add_argument("--tile", nargs="*", default=None,
                    help="one or more world-cell origins, e.g. --tile 62,264 85,264")
    ap.add_argument("--plan", action="store_true",
                    help="render EVERY tile for this act from art-tiles/tile-plan.json. The "
                         "whole-act smoothing field is computed once and reused, instead of "
                         "once per tile.")
    ap.add_argument("--cells", type=int, default=26)
    ap.add_argument("--px", type=int, default=48)
    ap.add_argument("--structures", action="store_true",
                    help="bake buildings/cave mouths into the terrain base. OFF by default: "
                         "landmarks are runtime sprites (owner decision 2026-07-30), so the "
                         "terrain layer carries only the SITE -- the earth plaza and worn "
                         "approach the sprite will stand on.")
    args = ap.parse_args()
    N, PX = args.cells, args.px
    assert OVERHANG_MAX < PX // 2

    A, (x0, y0), g = sm.class_grid(args.act)
    h, w = g.shape
    classes, fields, _it, remaining = sm.build_fields(g)
    if remaining:
        raise SystemExit("REFUSING: cell centres could not be preserved")

    if args.plan:
        plan = json.load(open(os.path.join(OUT, "tile-plan.json")))
        todo = [tuple(t["worldTopLeft"]) for t in plan["acts"][args.act]["tiles"]]
        N = plan["cellsPerTile"]
    elif args.tile:
        todo = [tuple(int(v) for v in t.split(",")) for t in args.tile]
    else:
        raise SystemExit("give --tile x,y [x,y ...] or --plan")

    print(f"act {args.act}: rendering {len(todo)} tile(s), field computed once")
    for tn, (tx, ty) in enumerate(todo, 1):
        render_one(args, A, x0, y0, g, h, w, classes, fields, N, PX, tx, ty, tn, len(todo))


def render_one(args, A, x0, y0, g, h, w, classes, fields, N, PX, tx, ty, tn, ttot):
    cx0, cy0 = tx - x0, ty - y0
    if not (0 <= cx0 and cx0 + N <= w and 0 <= cy0 and cy0 + N <= h):
        raise SystemExit(f"tile {tx},{ty} outside act bounds")

    semimg, lab, _fi, bad = sm.enforce_render(classes, fields, g, (cx0, cy0, N, N), PX)
    if bad:
        raise SystemExit(f"REFUSING: {len(bad)} cell centres wrong in the smoothed mask")
    S = N * PX
    rng = np.random.default_rng(SEED + tx * 1000 + ty)

    art = np.zeros((S, S, 3), dtype=np.float32)
    masks = {}
    for i, c in enumerate(classes):
        m = (lab == i)
        masks[c] = m
        art[m] = BASE_RGB[c]

    inside = {n: v for n, v in A["landmarks"].items()
              if tx <= v[0] < tx + N and ty <= v[1] < ty + N}

    def dilate_px(mask, r):
        im = Image.fromarray((mask * 255).astype(np.uint8), "L")
        return np.asarray(im.filter(ImageFilter.MaxFilter(2 * r + 1))) > 127

    # ---------------- GROUND: multi-scale patchiness, not a flat field ----------------
    if "ground" in masks:
        m = masks["ground"]
        n_fine = vnoise((S, S), 10, rng)
        n_mid = vnoise((S, S), 4, rng)
        n_broad = vnoise((S, S), 2, rng)
        lush = np.array((104, 132, 40), np.float32)
        dry = np.array((146, 142, 62), np.float32)
        moss = np.array((80, 110, 44), np.float32)
        t = np.clip(0.5 + 0.16 * n_broad + 0.10 * n_mid, 0, 1)
        blend = (lush[None, None, :] * (1 - t)[..., None]
                 + dry[None, None, :] * t[..., None])
        mossy = np.clip(0.5 + 0.5 * vnoise((S, S), 13, rng), 0, 1) < 0.20
        blend[mossy] = moss * 0.5 + blend[mossy] * 0.5
        shade = 1.0 + 0.13 * n_fine + 0.04 * n_mid
        art[m] = np.clip(blend * shade[..., None], 0, 255)[m]
        # small, rare scuffs only -- broad brown blobs read as camouflage, not grassland
        bare = (np.clip(0.5 + 0.5 * vnoise((S, S), 22, rng), 0, 1) > 0.955) & m
        art[bare] = art[bare] * 0.45 + np.array((132, 122, 76), np.float32) * 0.55

    if "vegetation" in masks:
        m = masks["vegetation"]
        art[m] *= (1.0 + 0.12 * vnoise((S, S), 9, rng)[m])[:, None]

    # ---------------- WATER + COAST: a graded shore, not an abrupt line ---------------
    # Owner review 2026-07-30: "the coast line also needs to look a little more natural since
    # it currently looks very abrupt." The old version was one hard brightened band just
    # inside the waterline. A real shore reads as a GRADIENT of depth: wet shingle on the
    # land side, foam at the line, a pale shallow shelf, then deep water -- with irregular
    # band widths so the transition never reads as a contour line.
    if "water" in masks:
        m = masks["water"]
        # depth proxy: 0 at the waterline, 1 far out to sea
        wf = sm.blur(m.astype(np.float32), PX * 1.15)
        wf = np.clip((wf - 0.28) / 0.62, 0, 1)
        jitter = 0.08 * vnoise((S, S), 5, rng) + 0.04 * vnoise((S, S), 13, rng)
        wf = np.clip(wf + jitter, 0, 1)

        deep = np.array((16, 42, 70), np.float32)
        mid = np.array((28, 72, 104), np.float32)
        shal = np.array((64, 124, 136), np.float32)
        t1 = np.clip(wf / 0.34, 0, 1)[..., None]          # shallow -> mid
        t2 = np.clip((wf - 0.34) / 0.66, 0, 1)[..., None]  # mid -> deep
        wcol = shal * (1 - t1) + mid * t1
        wcol = wcol * (1 - t2) + deep * t2
        wcol *= (1.0 + 0.07 * vnoise((S, S), 18, rng))[..., None]
        art[m] = np.clip(wcol, 0, 255)[m]

        # foam right at the line, broken up so it is not a stripe
        foam = m & (wf < 0.10)
        fn = np.clip(0.5 + 0.5 * vnoise((S, S), 26, rng), 0, 1)
        art[foam & (fn > 0.46)] = np.array((186, 214, 218), np.float32)

        # Wet shingle on the LAND side. Measured rings, NOT a wide blur: the blur version
        # spread sand several cells inland as big tan blobs (owner-visible defect).
        if "ground" in masks:
            inner = dilate_px(m, int(PX * 0.45))     # within ~0.5 cell of the water
            outer = dilate_px(m, int(PX * 1.10))     # out to ~1 cell
            ramp = np.where(inner, 1.0, np.where(outer, 0.45, 0.0)).astype(np.float32)
            ramp *= np.clip(0.55 + 0.6 * vnoise((S, S), 11, rng), 0, 1.25)
            beach = masks["ground"] & (ramp > 0.08)
            sand = np.array((136, 124, 98), np.float32)
            k = np.clip(ramp * 0.8, 0, 0.85)[..., None]
            art[beach] = np.clip(art * (1 - k) + sand * k, 0, 255)[beach]

        # REEF sites. Owner review 2026-07-30 on Coastal Reef: "the terrain around it does
        # not look like a reef and the dungeon does not either. it should look like a cave
        # leading under water." The cave mouth is a sprite; the SITE is this -- the water
        # around a reef landmark becomes a shallow shelf with exposed reef rock and coral
        # showing through, so the surroundings actually read as a reef.
        reefs = [(wx, wy) for n, (wx, wy) in inside.items() if "Reef" in n]
        if reefs and "ground" in masks:
            # Owner: "i want the coastal reef area look more like a beach if possible."
            # So near a reef the narrow shingle band widens into an actual beach -- dry pale
            # sand inland, damp sand at the water, blending back to grass further up.
            yy_, xx_ = np.mgrid[0:S, 0:S]
            dry = np.array((196, 182, 146), np.float32)
            wet = np.array((150, 136, 108), np.float32)
            for wx, wy in reefs:
                bx = (wx - tx) * PX + PX // 2
                by = (wy - ty) * PX + PX // 2
                BR = PX * 9.0
                near_w = sm.blur(m.astype(np.float32), PX * 0.85)
                prox = np.clip(1.0 - np.sqrt((xx_ - bx) ** 2 + (yy_ - by) ** 2) / BR, 0, 1)
                prox *= np.clip(0.6 + 0.55 * vnoise((S, S), 8, rng), 0, 1.3)
                sandk = np.clip(near_w * 2.1, 0, 1) * prox
                band = masks["ground"] & (sandk > 0.05)
                wetk = np.clip(near_w * 3.0 - 0.55, 0, 1)[..., None]
                col_s = dry[None, None, :] * (1 - wetk) + wet[None, None, :] * wetk
                kk = np.clip(sandk * 1.15, 0, 0.92)[..., None]
                art[band] = np.clip(art * (1 - kk) + col_s * kk, 0, 255)[band]
        if reefs:
            yy_, xx_ = np.mgrid[0:S, 0:S]
            for wx, wy in reefs:
                cx = (wx - tx) * PX + PX // 2
                cy = (wy - ty) * PX + PX // 2
                R = PX * 7.0
                # Centre the shelf ON THE LANDMARK. An earlier version pulled it 65% toward
                # the nearest water pixel, which put the coral cluster visibly off to one side
                # of the cave -- owner: "the reef that is generated around the coastal reef
                # also does not look like it is in the right place. my guess is that the
                # terrain generation and asset placement logic are not in line." They were
                # right. The shelf is masked to water anyway, so centring on the landmark
                # makes it radiate from the cave instead of sitting beside it.
                dist = np.sqrt((xx_ - cx) ** 2 + (yy_ - cy) ** 2)
                fall = np.clip(1.0 - dist / R, 0, 1) ** 0.55
                fall = fall * np.clip(0.62 + 0.5 * vnoise((S, S), 9, rng), 0, 1.3)
                sh_w = np.array((78, 140, 142), np.float32)      # sunlit shallow shelf
                kk = (fall * m)[..., None]
                art[:] = np.clip(art * (1 - kk) + sh_w * kk, 0, 255)
                # exposed reef rock and coral heads breaking the surface
                rr_rng = np.random.default_rng(SEED + wx * 31 + wy)
                reef_zone = m & (fall > 0.22)
                ys3, xs3 = np.where(reef_zone)
                if len(xs3):
                    lyr_r = Image.new("RGBA", (S, S), (0, 0, 0, 0))
                    dr_r = ImageDraw.Draw(lyr_r, "RGBA")
                    for _ in range(int(len(xs3) / (PX * PX) * 16.0)):
                        k2 = rr_rng.integers(len(xs3))
                        px2, py2 = int(xs3[k2]), int(ys3[k2])
                        rad = int(rr_rng.integers(8, 30))
                        if rr_rng.random() < 0.62:
                            c2 = np.array((66, 78, 66), np.float32) * rr_rng.uniform(.8, 1.3)
                            al = 210
                        else:
                            c2 = np.array((128, 96, 68), np.float32) * rr_rng.uniform(.85, 1.2)
                            al = 175
                        dr_r.ellipse([px2 - rad, py2 - rad // 2, px2 + rad, py2 + rad // 2],
                                     fill=tuple(int(q) for q in np.clip(c2, 0, 255)) + (al,))
                    la = np.asarray(lyr_r).astype(np.float32)
                    aa = (la[..., 3] / 255.0) * reef_zone
                    art[:] = np.clip(art * (1 - aa[..., None])
                                     + la[..., :3] * aa[..., None], 0, 255)

    # ---------------- ROCK: a hillshaded RANGE, not scattered rubble ------------------
    if "rock" in masks:
        m = masks["rock"]
        dome = sm.blur(m.astype(np.float32), PX * 1.7)
        crest = ridged((S, S), 7, rng)   # ridges every ~3.5 world cells
        hf = 0.52 * (dome / max(dome.max(), 1e-6)) + 0.48 * crest
        hf = sm.blur(hf, PX * 0.10)
        # Express height in PIXELS before shading. Normalised 0..1 height over a 1248 px
        # tile has gradients of ~0.001/px, so every normal points straight up and the
        # hillshade comes out constant (measured std 0.003 -- that is why V5's first rock
        # was flat grey). At PX*8 px of relief the shade std is ~0.25.
        sh = hillshade(hf * (PX * 8.0), zf=1.0)
        steps = np.clip(np.floor(sh * 6.0) / 5.0, 0, 1)
        sh_q = 0.35 + 0.95 * steps

        rockc = np.array(BASE_RGB["rock"], np.float32)
        bare_c = np.array((150, 145, 134), np.float32)
        deep = np.array((44, 41, 36), np.float32)
        lo_h = hf[m].min() if m.any() else 0.0
        hi_h = hf[m].max() if m.any() else 1.0
        hn = (hf - lo_h) / max(hi_h - lo_h, 1e-6)
        expose = np.clip((hn - 0.52) / 0.48, 0, 1)
        col = (rockc[None, None, :] * (1 - expose)[..., None]
               + bare_c[None, None, :] * expose[..., None])
        col = col * sh_q[..., None]
        crev = (sh < 0.34) & (hn < 0.62)
        col[crev] = deep * (0.8 + 0.5 * sh[crev])[..., None]
        mossy_r = crev & (np.clip(0.5 + 0.5 * vnoise((S, S), 6, rng), 0, 1) > 0.55)
        col[mossy_r] = np.array((52, 66, 34), np.float32)
        art[m] = np.clip(col, 0, 255)[m]

    img = Image.fromarray(np.clip(art, 0, 255).astype(np.uint8))

    # Object layers, each clipped to its own class dilated by OVERHANG_MAX. Without this
    # clipping a 190px conifer crown or an 80px slab paints deep into the neighbour.
    def layer():
        return Image.new("RGBA", (S, S), (0, 0, 0, 0))

    def dilate(mask, r):
        im = Image.fromarray((mask * 255).astype(np.uint8), "L")
        return np.asarray(im.filter(ImageFilter.MaxFilter(2 * r + 1))) > 127

    def stamp(lyr, mask, r=OVERHANG_MAX):
        keep = dilate(mask, r)
        la = np.asarray(lyr).astype(np.float32)
        a = (la[..., 3] / 255.0) * keep
        base = np.asarray(img).astype(np.float32)
        out = base * (1 - a[..., None]) + la[..., :3] * a[..., None]
        img.paste(Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)))

    # scree gathering at the foot of the range, spilling a little onto the grass
    if "rock" in masks:
        m = masks["rock"]
        lyr = layer()
        dr = ImageDraw.Draw(lyr, "RGBA")
        foot = m & (sm.blur(m.astype(np.float32), PX * 0.35) < 0.55)
        ys, xs = np.where(foot)
        if len(xs):
            for _ in range(int(len(xs) / PX * 0.34)):
                k = rng.integers(len(xs))
                cx, cy = int(xs[k]), int(ys[k])
                rr = int(rng.integers(5, 15))
                ox, oy = int(rng.integers(-13, 14)), int(rng.integers(-13, 14))
                v = rng.uniform(.72, 1.5)
                col2 = np.clip(np.array(BASE_RGB["rock"], float) * v, 0, 255)
                dr.ellipse([cx + ox - rr, cy + oy - rr, cx + ox + rr, cy + oy + rr],
                           fill=tuple(int(q) for q in col2) + (255,))
                dr.arc([cx + ox - rr, cy + oy - rr, cx + ox + rr, cy + oy + rr],
                       200, 340, fill=(230, 228, 220, 90), width=2)
            stamp(lyr, m)

    # ---------------- forest: canopy IS the footprint --------------------------------
    if "vegetation" in masks:
        m = masks["vegetation"]
        lyr = layer()
        dr = ImageDraw.Draw(lyr, "RGBA")
        step = int(PX * 0.68)
        pts = []
        for cy in range(0, S, step):
            for cx in range(0, S, step):
                jx = cx + int(rng.integers(-step // 3, step // 3 + 1))
                jy = cy + int(rng.integers(-step // 3, step // 3 + 1))
                if 0 <= jx < S and 0 <= jy < S and m[jy, jx]:
                    pts.append((jx, jy))
        for cx, cy in sorted(pts, key=lambda p: p[1]):
            tw = int(rng.integers(int(PX * 1.25), int(PX * 1.95)))
            thh = int(tw * 0.78)
            top = cy - int(thh * 1.15)
            dr.ellipse([cx - tw // 2 + 7, cy + thh // 3, cx + tw // 2 + 9, cy + thh - 2],
                       fill=(12, 16, 10, 130))
            dr.rectangle([cx - 4, cy + thh // 4, cx + 4, cy + thh - 4],
                         fill=(44, 31, 21, 255))
            for tier, f in enumerate((1.0, .72, .44)):
                ty_ = top + int(thh * (0.62 + 0.52 * tier))
                hw = max(4, int(tw * f / 2))
                hh = max(6, int(thh * .60 * f))
                shd = 1.0 + (.26 if tier == 2 else .0) - .11 * tier
                col3 = np.clip(np.array((34, 58, 32), float) * shd, 0, 255)
                dr.polygon([(cx, ty_ - hh), (cx - hw, ty_ + hh // 2),
                            (cx + hw, ty_ + hh // 2)],
                           fill=tuple(int(v) for v in col3) + (255,))
        stamp(lyr, m)

    # ---------------- ground objects: CLUSTERED ferns, stones, litter ------------------
    if "ground" in masks:
        m = masks["ground"]
        lyr = layer()
        dr = ImageDraw.Draw(lyr, "RGBA")
        ys, xs = np.where(m)
        if len(xs):
            # clustered ferns read as natural growth; a uniform scatter reads as a carpet
            for _ in range(int(len(xs) / (PX * PX) * 0.45)):
                k = rng.integers(len(xs))
                gx, gy = int(xs[k]), int(ys[k])
                for _f in range(int(rng.integers(2, 6))):
                    cx = gx + int(rng.integers(-PX, PX + 1))
                    cy = gy + int(rng.integers(-PX, PX + 1))
                    if not (0 <= cx < S and 0 <= cy < S and m[cy, cx]):
                        continue
                    rr = int(rng.integers(PX * .28, PX * .70)) // 2
                    tone = rng.uniform(.8, 1.25)
                    fc = tuple(int(q) for q in np.clip(
                        np.array((58, 86, 34), float) * tone, 0, 255)) + (235,)
                    for _b in range(int(rng.integers(5, 9))):
                        a2 = rng.uniform(0, 2 * np.pi)
                        dr.line([cx, cy, cx + rr * np.cos(a2) * .85,
                                 cy + rr * np.sin(a2) * .55], fill=fc,
                                width=int(rng.integers(2, 5)))
            for _ in range(int(len(xs) / (PX * PX) * 0.9)):
                k = rng.integers(len(xs))
                cx, cy = int(xs[k]), int(ys[k])
                rr = int(rng.integers(3, 8))
                col4 = np.clip(np.array((104, 100, 88), float) * rng.uniform(.85, 1.3),
                               0, 255)
                dr.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                           fill=tuple(int(q) for q in col4) + (255,))
            if "vegetation" in masks:
                near = m & dilate(masks["vegetation"], PX)
                ys2, xs2 = np.where(near)
                for _ in range(int(len(xs2) / (PX * PX) * 7.0)):
                    k = rng.integers(len(xs2))
                    cx, cy = int(xs2[k]), int(ys2[k])
                    rr = int(rng.integers(2, 6))
                    col5 = np.clip(np.array((116, 92, 52), float) * rng.uniform(.8, 1.25),
                                   0, 255)
                    dr.ellipse([cx - rr, cy - rr // 2, cx + rr, cy + rr // 2],
                               fill=tuple(int(q) for q in col5) + (215,))
            stamp(lyr, m, r=6)

    # ---------------- landmarks: town clusters and dungeon entrances -------------------
    # Every landmark stands on OPEN GROUND, and those cells stay walkable in collision. So
    # a building must never cover a cell CENTRE, or walkable ground would read as a wall.
    # Structures are therefore anchored on the cell-CORNER lattice and capped at 40 px
    # (half-extent 20 px < the 24 px from a corner to any neighbouring centre), which keeps
    # all four surrounding centres clear by construction. Asserted below.
    struct = np.zeros((S, S), bool)
    if inside:
        lyr_soft = layer()
        lyr = layer()
        dr_soft = ImageDraw.Draw(lyr_soft, "RGBA")
        dr = ImageDraw.Draw(lyr, "RGBA")

        def corners(cx, cy, reach_cells, rng_):
            """Cell-corner lattice points within reach of (cx,cy), nearest first."""
            out = []
            R = int(reach_cells * PX)
            for gy in range(cy - R, cy + R + 1):
                if (gy % PX) != 0:
                    continue
                for gx in range(cx - R, cx + R + 1):
                    if (gx % PX) != 0:
                        continue
                    d2 = (gx - cx) ** 2 + (gy - cy) ** 2
                    if d2 <= R * R and 8 < d2 ** .5:
                        out.append((gx, gy, d2))
            out.sort(key=lambda t: t[2])
            return [(x, y) for x, y, _ in out]

        def building(gx, gy, rng_):
            bw = int(rng_.integers(22, 30))   # half-extent <=15, +2 roof = 17
            bh = int(rng_.integers(20, 28))
            wall = np.clip(np.array((172, 150, 116), float) * rng_.uniform(.85, 1.1), 0, 255)
            roof = np.clip(np.array((116, 68, 50), float) * rng_.uniform(.8, 1.15), 0, 255)
            x1b, y1b = gx - bw // 2, gy - bh // 2
            dr.ellipse([x1b + 4, y1b + bh - 5, x1b + bw + 2, y1b + bh + 2],
                       fill=(14, 14, 12, 110))                       # ground shadow
            dr.rectangle([x1b, y1b + bh // 3, x1b + bw, y1b + bh],
                         fill=tuple(int(v) for v in wall) + (255,))  # walls
            dr.polygon([(x1b - 2, y1b + bh // 3 + 2), (x1b + bw + 2, y1b + bh // 3 + 2),
                        (x1b + bw // 2, y1b - 2)],
                       fill=tuple(int(v) for v in roof) + (255,))    # pitched roof
            dr.rectangle([gx - 3, y1b + bh - 9, gx + 3, y1b + bh],
                         fill=(52, 38, 26, 255))                     # door

        def town(cx, cy, rng_):
            spots = corners(cx, cy, 2.3, rng_)
            for gx, gy in spots[:int(rng_.integers(6, 10))]:
                if 0 <= gx < S and 0 <= gy < S:
                    building(gx, gy, rng_)

        def dungeon(cx, cy, rng_):
            # rocky outcrop set BEHIND (north of) the entrance, arch on a corner
            for gx, gy in corners(cx, cy - int(PX * .8), 1.4, rng_)[:5]:
                rr = int(rng_.integers(11, 17))
                v = rng_.uniform(.8, 1.35)
                col6 = np.clip(np.array((104, 98, 88), float) * v, 0, 255)
                dr.ellipse([gx - rr, gy - rr, gx + rr, gy + rr],
                           fill=tuple(int(q) for q in col6) + (255,))
            ax, ay = cx - PX // 2, cy - PX // 2          # a corner, so centres stay clear
            aw, ah = 26, 24
            dr.ellipse([ax - aw // 2 - 3, ay - ah // 2 - 3, ax + aw // 2 + 3, ay + ah // 2 + 3],
                       fill=(96, 90, 80, 255))            # stone surround
            dr.pieslice([ax - aw // 2, ay - ah // 2, ax + aw // 2, ay + ah // 2 + 6],
                        180, 360, fill=(16, 15, 18, 255))  # dark arched mouth
            dr.rectangle([ax - aw // 2, ay, ax + aw // 2, ay + ah // 2],
                         fill=(16, 15, 18, 255))
            for gx, gy in corners(cx, cy, 1.9, rng_)[:3]:  # standing stones
                sw = int(rng_.integers(8, 13))
                dr.rectangle([gx - sw // 2, gy - sw, gx + sw // 2, gy + sw // 2],
                             fill=(112, 106, 96, 255))

        def site(cx, cy, rng_, kind, is_reef=False):
            """Ground preparation only -- what a landmark sprite will stand on.

            Split out per the owner's 2026-07-30 decision to make landmarks runtime sprites:
            the terrain layer bakes the SITE (packed earth, worn approach) because that is
            terrain and blends by definition, while the structures themselves ship as sprites
            with a baked contact shadow. That is what stops a composited sprite reading as a
            sticker, without freezing the structure into the artwork.
            """
            if is_reef:
                return          # a reef's site is the shallow shelf, not a dirt pad
            # sprite footprint: town 4 cells, dungeon 2 cells (LANDMARK-SPRITE-CONTRACT.md)
            foot = 4.0 if kind == "town" else 3.0   # sprite footprints, per the contract
            rad = foot * PX * 0.40          # pad radius, just inside the sprite
            n = 9 if kind == "town" else 5
            reach = int(rad * 0.45)
            for _ in range(n):
                rr = int(rng_.integers(int(rad * 0.45), int(rad) + 1))
                ox = int(rng_.integers(-reach, reach + 1))
                oy = int(rng_.integers(-reach, reach + 1))
                dr_soft.ellipse([cx + ox - rr, cy + oy - rr, cx + ox + rr, cy + oy + rr],
                                fill=(128, 108, 74, 210))

        for name, (wx, wy) in sorted(inside.items()):
            k = kind_of(name)
            cx = (wx - tx) * PX + PX // 2
            cy = (wy - ty) * PX + PX // 2
            rng_l = np.random.default_rng(SEED + wx * 7919 + wy)
            site(cx, cy, rng_l, k, is_reef=("Reef" in name))
            if not args.structures:
                continue
            if k == "town":
                town(cx, cy, rng_l)
            else:
                dungeon(cx, cy, rng_l)
        land = masks.get("ground", np.zeros((S, S), bool))
        if "rock" in masks:
            land = land | masks["rock"]
        # plaza is packed earth -- walkable-looking, so it may pass under a cell centre.
        # Only the SOLID layer is checked against centres.
        stamp(lyr_soft, land)
        struct = (np.asarray(lyr)[..., 3] > 0) & dilate(land, OVERHANG_MAX)
        stamp(lyr, land)

    # ---------------- verify the CONSTRUCTION, not the pixels --------------------------
    # Colour-classifying the finished base cannot work and must not be attempted: moss in a
    # rock crevice IS rock, a fern on grass IS walkable grass. Four different colour checks
    # produced false alarms before this was accepted. What matters is (1) the label map's
    # class at each cell centre equals the owner's paint, guaranteed by sm.enforce_render,
    # and (2) no decoration can reach a neighbouring class's centre, guaranteed by the
    # clipped stamp plus OVERHANG_MAX < PX//2.
    wrong = []
    for j in range(N):
        for i in range(N):
            py, pxx = j * PX + PX // 2, i * PX + PX // 2
            if classes[int(lab[py, pxx])] != g[cy0 + j, cx0 + i]:
                wrong.append((tx + i, ty + j))

    os.makedirs(OUT, exist_ok=True)
    bp = os.path.join(OUT, f"act{args.act}-tile-{tx}-{ty}-base.png")
    spth = os.path.join(OUT, f"act{args.act}-tile-{tx}-{ty}-semantic-smooth-{N}.png")
    img.save(bp)
    Image.fromarray(semimg).save(spth)
    print(f"act {args.act} tile ({tx},{ty})  {N}x{N} cells @ {PX}px = {S}x{S}")
    print("  composition: " + "  ".join(
        f"{c} {100*float(masks[c].mean()):.1f}%" for c in classes))
    print(f"  base          : {os.path.relpath(bp, ROOT)}")
    print(f"  smoothed mask : {os.path.relpath(spth, ROOT)}")
    hit = []
    for j in range(N):
        for i in range(N):
            py, pxx = j * PX + PX // 2, i * PX + PX // 2
            if struct[py - 6:py + 6, pxx - 6:pxx + 6].any():
                hit.append((tx + i, ty + j))
    print(f"  CELL-CENTRE class vs owner paint: {len(wrong)} wrong of {N*N}")
    if hit:
        print(f"    WARNING structure pixels on {len(hit)} cell centres: {hit[:6]}")
    if wrong:
        print(f"    WARNING {len(wrong)} cell centres disagree with the owner paint")


if __name__ == "__main__":
    main()
