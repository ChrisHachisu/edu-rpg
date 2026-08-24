#!/usr/bin/env python3
"""Pull each authored building footprint in until it stops eating the lane beside it.

Owner, 2026-08-24, on build 58: *"the town boundaries are still incorrect in many places. port
sapphire was done very well so the quality needs to match in other towns."*

He is right and the difference is measurable. A band's defect is how much LANE it swallows: ground
the painting shows as open cobble or grass, inside the authored polygon, and reachable from the
walkable body just outside it. Measured the day he said it:

    portSapphire   worst band 28.9 cells^2, median 4.7   <- the one he approved
    greenhollow    worst band 70.6 cells^2
    millbrook      worst band 103.3 cells^2, five bands over 50

Port Sapphire's bands were traced as polygons that follow each building; millbrook's and
greenhollow's were authored as generous bounding boxes on the same day and never tightened. That is
the whole difference, and it is why this exists rather than another round of hand-tracing.

HOW IT SHRINKS, AND WHY IT IS EDGE-WISE RATHER THAN A FLOOD FILL. The obvious move -- subtract every
"eaten" pixel from the band -- is unsafe here, because a sunlit roof classifies as ground and abuts
open cobble directly (that is the whole reason these bands are authored; see
`derive_town_walkable.py::stamp_roof_bands`). A flood from the lane can therefore run straight up
onto the roof and punch it back out of the band.

So each EDGE is pulled inward independently, in small steps, and stops the moment the strip it would
uncover is no longer almost entirely open ground. A building's outline -- eave, shadow, timber,
wall -- is not open ground, so the edge halts against the building instead of climbing over it. The
band therefore stays a simple shape that contains its building, and can only ever give lane back.

This is a MEASURING-AND-EDITING instrument, not a gate. Run it, then look at the proof render and at
`scripts/check_town_roofs.py`, which is the thing that fails if a band was pulled too far.
"""
from __future__ import annotations
import argparse, json, os, sys
from collections import deque
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import derive_town_walkable as D                                    # noqa: E402


def raster(poly, size):
    im = Image.new("1", size, 0)
    ImageDraw.Draw(im).polygon([tuple(p) for p in poly], fill=1)
    return np.asarray(im).astype(bool)


def walk_body(walk, size):
    """The RAW walkable surface, NOT standable(): standable erodes by actorFootRadius, so nothing is
    ever adjacent to a band edge and every measurement comes back zero."""
    w, h = int(walk["width"]), int(walk["height"])
    im = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(im)
    for reg in walk["regions"]:
        d.polygon([(p["x"], p["y"]) for p in reg["outer"]], fill=255)
        for hole in reg.get("holes", []):
            d.polygon([(p["x"], p["y"]) for p in hole], fill=0)
    for ob in walk.get("staticObstacles", []):
        d.polygon([(p["x"], p["y"]) for p in ob["polygon"]], fill=0)
    return np.asarray(im.resize(size, Image.NEAREST)) > 0


def eaten(band, ground, body):
    """Ground inside the band, reachable through ground from the body just outside it."""
    cand = band & ground
    seed = np.zeros_like(cand)
    outside = body & ~band
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        seed |= cand & np.roll(np.roll(outside, dy, 0), dx, 1)
    seen = seed.copy()
    q = deque(zip(*np.nonzero(seed)))
    h, w = cand.shape
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and cand[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    return seen


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--town", required=True)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--step", type=int, default=5, help="art px per inward step, for the edges")
    ap.add_argument("--corner-step", type=int, default=20,
                    help="art px per 45-degree corner cut. Bigger than --step on purpose: a cut of "
                         "depth d removes only d*d/2 px, so a 5px corner step uncovers 12 pixels "
                         "and is rejected as noise before it can measure anything.")
    ap.add_argument("--open-frac", type=float, default=0.90,
                    help="a strip may be uncovered only while at least this fraction of it is open "
                         "ground reachable from the lane. 0.90, not 1.0: cobble carries grout and "
                         "grass carries flowers, so a genuinely open strip is never quite 100%%.")
    ap.add_argument("--min-span", type=int, default=60,
                    help="never shrink an edge past this, in art px (2 cells). A backstop against "
                         "a band collapsing onto a building drawn almost entirely in ground colours.")
    a = ap.parse_args()

    img = Image.open(os.path.join(ROOT, f"public/act1-hifi/town/{a.town}-screen.png")).convert("RGB")
    art = np.asarray(img).astype(np.float32)
    ring, _ = D.town_boundary(art)
    inring = raster(ring, img.size)
    ground = D.paving_mask(art) | (D.lawn_mask(art) & inring)
    walk = json.load(open(os.path.join(ROOT, f"public/act1-hifi/town/{a.town}-walkable.json")))
    body = walk_body(walk, img.size)

    path = os.path.join(ROOT, f"design/act1-towns/{a.town}-authored-obstacles.json")
    spec = json.load(open(path))
    total_before = total_after = 0
    for b in spec["nonWalkableBands"]:
        poly = [list(p) for p in b["polygonArt"]]
        before = int(eaten(raster(poly, img.size), ground, body).sum())
        total_before += before
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        full = raster(poly, img.size)
        e_full = eaten(full, ground, body)

        def clamp(px0, py0, px1, py1):
            """The polygon with every vertex pulled inside the shrunken bbox.

            Clamping rather than re-rasterising a rectangle is what keeps an authored shape --
            a chimney notch, a clipped gable corner -- instead of flattening every band back into
            the bounding box this pass exists to remove."""
            return [[min(max(px, px0), px1), min(max(py, py0), py1)] for px, py in poly]

        def strip_ok(px0, py0, px1, py1):
            """Would pulling this side in uncover open lane, and ONLY open lane?"""
            if px1 - px0 < a.min_span or py1 - py0 < a.min_span:
                return False
            strip = full & ~raster(clamp(px0, py0, px1, py1), img.size)
            n = int(strip.sum())
            if n < 40:                       # nothing meaningful uncovered; stop rather than creep
                return False
            return int((e_full & strip).sum()) / n >= a.open_frac

        nx0, nx1, ny0, ny1 = x0, x1, y0, y1
        while strip_ok(nx0 + a.step, ny0, nx1, ny1):
            nx0 += a.step
        while strip_ok(nx0, ny0, nx1 - a.step, ny1):
            nx1 -= a.step
        while strip_ok(nx0, ny0 + a.step, nx1, ny1):
            ny0 += a.step
        while strip_ok(nx0, ny0, nx1, ny1 - a.step):
            ny1 -= a.step

        # ---- corner clip -----------------------------------------------------------------
        # An edge pass alone stalls almost immediately, and the measurement says why: the lane a
        # band eats is at its CORNERS, not along a whole side. A gabled roof is a diamond in a
        # rectangle, so the four corners of its bounding box are open cobble while the middle of
        # every edge is roof. Pulling a whole edge in stops at the first roof pixel and leaves all
        # four corners behind -- millbrook's purple cottage went 103 -> 43 cells^2 on edges alone
        # and stopped there.
        #
        # Cutting each corner with a 45-degree chord is what Port Sapphire's hand-traced bands do,
        # and it is why they measure 0-29 cells^2 against millbrook's 5-103. Each corner is cut as
        # deep as its own triangle stays open lane, independently of the other three.
        def clip_half(poly_pts, f):
            """Sutherland-Hodgman against one half-plane f(p) >= 0."""
            out = []
            n = len(poly_pts)
            for i in range(n):
                cur, prv = poly_pts[i], poly_pts[i - 1]
                fc, fp = f(cur), f(prv)
                if fc >= 0:
                    if fp < 0:
                        t = fp / (fp - fc)
                        out.append([prv[0] + (cur[0] - prv[0]) * t, prv[1] + (cur[1] - prv[1]) * t])
                    out.append(list(cur))
                elif fp >= 0:
                    t = fp / (fp - fc)
                    out.append([prv[0] + (cur[0] - prv[0]) * t, prv[1] + (cur[1] - prv[1]) * t])
            return [[int(round(px)), int(round(py))] for px, py in out]

        def corners(poly_pts, px0, py0, px1, py1, d):
            """Cut all four corners of `poly_pts` with 45-degree chords of the given depths.

            CLIPPING the authored polygon rather than rebuilding an octagon from its bounding box:
            a band may carry a chimney notch or an already-traced gable, and rebuilding would throw
            that away to gain the corners."""
            tl, tr, br, bl = d
            out = list(poly_pts)
            if tl: out = clip_half(out, lambda q: (q[0] - px0) + (q[1] - py0) - tl)
            if tr: out = clip_half(out, lambda q: (px1 - q[0]) + (q[1] - py0) - tr)
            if br: out = clip_half(out, lambda q: (px1 - q[0]) + (py1 - q[1]) - br)
            if bl: out = clip_half(out, lambda q: (q[0] - px0) + (py1 - q[1]) - bl)
            return out

        base = clamp(nx0, ny0, nx1, ny1)
        base_r = raster(base, img.size)
        base_eat = int(eaten(base_r, ground, body).sum())
        e_base = eaten(base_r, ground, body)
        span = min(nx1 - nx0, ny1 - ny0)
        # TWO CANDIDATE SHAPES, KEEP WHICHEVER MEASURES LOWER. Clipping the authored polygon keeps
        # a chimney notch but the notch itself constrains where the chords can land; rebuilding a
        # plain octagon from the bounding box loses the notch but cuts deeper. Neither wins
        # everywhere -- measured on millbrook, clipping took the purple cottage to 19 cells^2 where
        # the octagon reached 32, and the octagon took the market to 28 where clipping reached 55.
        # Both are cheap, so both are tried.
        def plain_octagon(d):
            tl, tr, br, bl = d
            return [[nx0 + tl, ny0], [nx1 - tr, ny0], [nx1, ny0 + tr], [nx1, ny1 - br],
                    [nx1 - br, ny1], [nx0 + bl, ny1], [nx0, ny1 - bl], [nx0, ny0 + tl]]

        cand = []
        for maker in (lambda d: corners(base, nx0, ny0, nx1, ny1, d), plain_octagon):
            cc = [0, 0, 0, 0]
            start = maker(cc)
            if len(start) < 3:
                continue
            start_r = raster(start, img.size)
            e_start = eaten(start_r, ground, body)
            for k in range(4):
                while cc[k] + a.corner_step <= span:
                    trial = list(cc)
                    trial[k] += a.corner_step
                    shp = maker(trial)
                    if len(shp) < 3:
                        break
                    strip = start_r & ~raster(shp, img.size)
                    n = int(strip.sum())
                    if n < 40 or int((e_start & strip).sum()) / n < a.open_frac:
                        break
                    cc[k] += a.corner_step
            shp = maker(cc)
            if len(shp) >= 3:
                cand.append((int(eaten(raster(shp, img.size), ground, body).sum()), shp))
        cand.append((base_eat, base))
        oct_eat, oct_poly = min(cand, key=lambda c: c[0])
        newpoly = oct_poly if oct_eat < base_eat else base
        after = int(eaten(raster(newpoly, img.size), ground, body).sum())
        total_after += after
        b["polygonArt"] = newpoly
        print(f"  {b['id']:<18} [{x0},{y0},{x1},{y1}] -> [{nx0},{ny0},{nx1},{ny1}]   "
              f"eats {before/256:6.1f} -> {after/256:5.1f} cells^2")
    print(f"  {'TOTAL':<18} eats {total_before/256:6.1f} -> {total_after/256:5.1f} cells^2")
    if a.write:
        json.dump(spec, open(path, "w"), indent=1)
        open(path, "a").write("\n")
        print(f"  wrote {os.path.relpath(path, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
