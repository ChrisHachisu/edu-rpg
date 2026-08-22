#!/usr/bin/env python3
"""Stitch the four rebaked town tiles into one plate: exposure-matched FIRST, then quilted.

THE TWO DEFECTS THE OWNER REPORTED, AND WHY THE OLD STITCH PRODUCED BOTH
    Owner, 2026-08-18, on the rebaked Port Sapphire plate: "not connected at the correct location
    and the colors slightly do not match."

    The old path pasted each tile's own 975x975 cell at a HARD CUT and graded the finished plate as
    ONE image (scripts/grade_plate_exposure.py). Both halves of the complaint follow from that:

    COLOURS. A whole-plate grade cannot remove a per-tile difference -- it moves all four tiles by
    the same gamma. And the tiles genuinely differ. The tiles OVERLAP by 130 px, so the same content
    exists twice, once in each neighbour's rendering, which makes the drift measurable with no
    content confound at all. Measured on the shipped plate's own tiles:

        band 00|01   luminance 111.34 vs  93.34   -18.00   <- the vertical join, 16% dark
        band 01|11   luminance  89.93 vs  96.97    +7.04
        band 10|11   luminance  67.62 vs  66.54    -1.08
        band 00|10   luminance 109.42 vs 107.51    -1.91

    Eighteen luminance units of drift on identical content is not a design choice, and no amount of
    whole-plate grading touches it.

    LOCATION. A hard cut has no tolerance: whatever disagreement survives at x=975 becomes a line.
    The overlap band is 130 px wide and was being thrown away, when it is exactly the material a
    minimum-error cut needs. `make_town_materials.min_error_seam` -- the Efros-Freeman cut this repo
    already uses to make materials tileable -- routes the join through the pixels where the two
    renderings AGREE, so the eye is given a boundary that follows real content instead of a ruled
    line through the middle of a roof.

WHY GAMMA AND NOT A GAIN
    Inherited from grade_plate_exposure.py, and it is a gameplay constraint rather than a taste one:
    the walkable network is thresholded out of the PALE PAVING, so a linear gain that clips
    highlights silently changes where the player can walk. Gamma leaves 0 and 255 fixed and moves
    the neighbouring-pixel step distribution -- the whole finish gate -- very little.

    The gamma here is PER CHANNEL, which the old script's single gamma was not. The owner said the
    colours do not match, not the brightness, and the tiles drift in hue as well as level (the
    00|01 band is 108,116,76 against 91,97,65). A per-channel gamma is the same instrument, applied
    to the thing he actually named.

USAGE
    python3 scripts/stitch_plate.py                       # tiles -> plate-stitched.png
    python3 scripts/stitch_plate.py --out X.png --target 90.1
"""
from __future__ import annotations

import argparse
import importlib.util
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_town_materials import min_error_seam            # noqa: E402  the Efros-Freeman cut

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_tl_spec = importlib.util.spec_from_file_location(
    "_tl", os.path.join(os.path.dirname(os.path.abspath(__file__)), "town_layout.py"))
_tl = importlib.util.module_from_spec(_tl_spec)
_tl_spec.loader.exec_module(_tl)
_TOWN_SPECS = _tl.SPECS
OUT = os.path.join(ROOT, "design/act1-towns/rebake")
PLATE = 1950
N = 2
TILE = PLATE // N          # 975
BAND = 130                 # overlap, in final px -- must match rebake_town_tiles.BAND

LUM_W = np.array([0.2126, 0.7152, 0.0722])


def lum(a):
    return a @ LUM_W


def box(i, j):
    """The final-plate rectangle tile (i,j) covers, band included."""
    x0 = j * TILE - (BAND if j else 0)
    y0 = i * TILE - (BAND if i else 0)
    return x0, y0, x0 + TILE + (BAND if j else 0), y0 + TILE + (BAND if i else 0)


def load_tiles(src):
    t = {}
    for i in range(N):
        for j in range(N):
            p = os.path.join(src, f"tile-{i}{j}.png")
            a = np.asarray(Image.open(p).convert("RGB")).astype(np.float64)
            b = box(i, j)
            if a.shape[:2] != (b[3] - b[1], b[2] - b[0]):
                raise SystemExit(f"tile-{i}{j} is {a.shape[1]}x{a.shape[0]}, expected "
                                 f"{b[2]-b[0]}x{b[3]-b[1]}")
            t[(i, j)] = (a, b)
    return t


def crop(t, X0, Y0, X1, Y1):
    a, (x0, y0, _, _) = t
    return a[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0]


# The four shared bands. Each entry: (tile A, tile B, plate rect they both cover).
def shared_bands():
    return [
        ((0, 0), (0, 1), (TILE - BAND, 0, TILE, TILE)),
        ((1, 0), (1, 1), (TILE - BAND, TILE, TILE, PLATE)),
        ((0, 0), (1, 0), (0, TILE - BAND, TILE, TILE)),
        ((0, 1), (1, 1), (TILE, TILE - BAND, PLATE, TILE)),
    ]


def apply_gamma(a, g):
    """Per-channel gamma on 0-255 data. 0 and 255 are fixed points, so nothing clips."""
    return np.clip((a / 255.0) ** np.asarray(g)[None, None, :], 0, 1) * 255.0


def exposure_match(tiles, target_lum, target_br, verbose=True):
    """Bisect a per-channel gamma for each tile so neighbours AGREE on the content they share.

    Twelve unknowns (four tiles x three channels), solved by coordinate descent: each unknown is
    bisected against its own partial derivative of the objective while the others are held. The
    objective is the squared per-channel mean difference over the four shared bands, plus two
    anchors -- plate mean luminance and plate blue/red -- because band agreement alone is
    translation-invariant: it is equally happy with all four tiles wrong by the same amount, and
    check_town_finish.py gates both of those absolutes.
    """
    keys = [(i, j) for i in range(N) for j in range(N)]
    # Precompute each band's pixels once, per side. Sub-sample: the means converge long before the
    # pixels run out and this is inside a coordinate-descent loop.
    bands = []
    for ka, kb, r in shared_bands():
        A = crop(tiles[ka], *r).reshape(-1, 3)[::7]
        B = crop(tiles[kb], *r).reshape(-1, 3)[::7]
        bands.append((ka, kb, A / 255.0, B / 255.0))
    cells = {k: crop(tiles[k], k[1] * TILE, k[0] * TILE,
                     (k[1] + 1) * TILE, (k[0] + 1) * TILE).reshape(-1, 3)[::11] / 255.0
             for k in keys}

    g = {k: np.ones(3) for k in keys}

    def cost(g):
        c = 0.0
        for ka, kb, A, B in bands:
            c += (((A ** g[ka]).mean(0) - (B ** g[kb]).mean(0)) ** 2).sum() * 3.0
        m = np.concatenate([(cells[k] ** g[k]) for k in keys], 0).mean(0) * 255.0
        c += ((m @ LUM_W - target_lum) / 40.0) ** 2
        c += ((m[2] / m[0] - target_br) / 0.30) ** 2
        return c

    for _ in range(14):                        # sweeps; converges in far fewer, cheap to be sure
        for k in keys:
            for ch in range(3):
                lo, hi = 0.35, 2.2
                for _ in range(22):            # ternary search on a 1-D convex-enough slice
                    a1 = lo + (hi - lo) / 3
                    a2 = hi - (hi - lo) / 3
                    g[k][ch] = a1
                    c1 = cost(g)
                    g[k][ch] = a2
                    c2 = cost(g)
                    if c1 < c2:
                        hi = a2
                    else:
                        lo = a1
                g[k][ch] = (lo + hi) / 2

    out = {}
    for k in keys:
        a, b = tiles[k]
        out[k] = (apply_gamma(a, g[k]), b)
    if verbose:
        print("  per-tile per-channel gamma (R,G,B) and the band drift it removes:")
        for k in keys:
            print(f"    tile {k[0]}{k[1]}   {g[k][0]:.3f} {g[k][1]:.3f} {g[k][2]:.3f}")
        for (ka, kb, r), _ in zip(shared_bands(), range(4)):
            b0 = lum(crop(tiles[ka], *r)).mean() - lum(crop(tiles[kb], *r)).mean()
            b1 = lum(crop(out[ka], *r)).mean() - lum(crop(out[kb], *r)).mean()
            print(f"    band {ka[0]}{ka[1]}|{kb[0]}{kb[1]}   luminance delta "
                  f"{b0:+7.2f} -> {b1:+7.2f}")
    return out


def quilt(a, b, axis, feather=1.0):
    """Composite two equal-shaped overlap bands along a minimum-error cut.

    `axis=0` cuts a path that runs DOWN the band choosing a column per row (a vertical join);
    `axis=1` transposes so the path runs ACROSS choosing a row per column (a horizontal join).
    `a` wins before the cut, `b` after it. The 1 px feather is the same one make_town_materials
    uses: it stops the chosen path from aliasing into a staircase without blending enough to ghost.
    """
    if axis == 1:
        return quilt(a.transpose(1, 0, 2), b.transpose(1, 0, 2), 0, feather).transpose(1, 0, 2)
    keep = min_error_seam(a, b)
    m = np.asarray(Image.fromarray((keep * 255).astype(np.uint8), "L")
                   .filter(ImageFilter.GaussianBlur(feather)), dtype=np.float64) / 255.0
    return a * m[..., None] + b * (1 - m[..., None])


def stitch(tiles):
    """Two passes: quilt each row's vertical join, then quilt the two rows' horizontal join."""
    rows = []
    for i in range(N):
        L, R = tiles[(i, 0)][0], tiles[(i, 1)][0]      # L is TILE wide, R is TILE+BAND wide
        h = L.shape[0]
        row = np.zeros((h, PLATE, 3))
        row[:, :TILE - BAND] = L[:, :TILE - BAND]
        row[:, TILE:] = R[:, BAND:]
        row[:, TILE - BAND:TILE] = quilt(L[:, TILE - BAND:], R[:, :BAND], axis=0)
        rows.append(row)
    T, B = rows[0], rows[1]                            # T is TILE tall, B is TILE+BAND tall
    plate = np.zeros((PLATE, PLATE, 3))
    plate[:TILE - BAND] = T[:TILE - BAND]
    plate[TILE:] = B[BAND:]
    plate[TILE - BAND:TILE] = quilt(T[TILE - BAND:], B[:BAND], axis=1)
    return plate


def report(plate):
    l = lum(plate)
    d = np.concatenate([np.abs(np.diff(l, axis=1)).ravel(), np.abs(np.diff(l, axis=0)).ravel()])
    print(f"  luminance {l.mean():.1f}   blue/red {plate[:,:,2].mean()/plate[:,:,0].mean():.3f}")
    print(f"  mean |step| {d.mean():.2f}   hard {100*(d>=24).mean():.2f}%   "
          f"soft {100*((d>=4)&(d<20)).mean():.2f}%")
    for at, name in ((TILE, "x"), (TILE, "y")):
        pass
    for name, ax in (("x", 0), ("y", 1)):
        ll = l if ax == 0 else l.T
        cut = np.abs(ll[:, TILE] - ll[:, TILE - 1]).mean()
        print(f"  seam {name}={TILE}   cut |step| {cut:6.2f}   plate-mean ratio {cut/d.mean():.2f}x")



GREEN_ANCHOR = os.path.join(ROOT, "design/act1-towns/_anchor/style-anchor-portSapphire-accepted.png")


def _foliage(a):
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    return (g > r + 10) & (g > b + 10)


def _lum(a):
    return 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]


def match_grass_to_anchor(plate, town):
    """Match the town's INTERIOR GRASS to the accepted plate's lawn, at constant luminance.

    Owner, twice: "the color scheme is a bit off as well (port sapphire looks better)", then "the
    colors are still weird". Three things had to be measured before this landed, and two earlier
    attempts are recorded here so they are not retried:

    1. IT IS NOT THE GROUND. Walkable ground reads rgb(195,194,129) and (183,182,130) against the
       anchor's (206,196,148) -- close, and its blue/red is 0.66-0.71 against 0.718. Fine already.

    2. IT IS NOT ALL FOLIAGE, AND MATCHING ALL OF IT GIVES KHAKI. Split by the palisade, interior
       grass is luminance 97-101 -- the same brightness as the anchor's lawn at 97 -- while exterior
       forest is 68-71. The forest is dark canopy the anchor barely contains; recolouring it to a
       lawn's ratio turns a village olive-drab. Only the interior is touched, feathered across the
       wall, and the woodland is deliberately left cool.

    3. MATCHING blue/red ALONE ALSO GIVES KHAKI. Interior grass is b/r 0.544 against the anchor's
       0.142, and pulling only those two channels together raises red to meet an untouched green.
       The anchor's lawn is rgb(75,113,11): green sits far above BOTH others. So the whole colour
       DIRECTION is matched and the luminance renormalised, which lands grass at (79,118,12) with
       luminance unchanged.

    Why the whole-plate blue/red gate cannot arbitrate this: all three plates measure 0.672 while
    their foliage differs FOURFOLD (0.142 against 0.603 and 0.536). That number is a function of
    composition -- the anchor is 27% foliage with water and cobble making up the rest, a forest
    village is 75% foliage -- so forcing it equal is what MAKES village grass blue. check_town_finish
    now compares surface to surface instead.
    """
    if not os.path.exists(GREEN_ANCHOR):
        print("  match-grass SKIPPED: no anchor on disk")
        return plate
    spec_fn = _TOWN_SPECS.get(town)
    if spec_fn is None:
        print(f"  match-grass SKIPPED: no ring geometry for {town!r}")
        return plate
    anch = np.asarray(Image.open(GREEN_ANCHOR).convert("RGB")).astype(float)
    am = _foliage(anch)
    tgt = np.array([anch[:, :, c][am].mean() for c in range(3)])

    a = np.clip(plate, 0, 255)
    n = a.shape[0]
    rg = spec_fn()["ring"]
    yy, xx = np.mgrid[0:n, 0:n]
    sc = n / 65.0
    d = np.sqrt((xx / sc - rg["cx"]) ** 2 + (yy / sc - rg["cy"]) ** 2)
    w = np.clip((rg["r"] - 0.5 - d) / 2.0, 0, 1)          # feather across the wall
    w = np.where(_foliage(a), w, 0.0)
    sel = w > 0.5
    if sel.sum() < 500:
        print("  match-grass SKIPPED: no interior grass to match")
        return plate
    cur = np.array([a[:, :, c][sel].mean() for c in range(3)])
    gain = tgt / np.maximum(cur, 1e-6)
    # renormalise the gain so the matched region keeps the luminance it had
    gain *= _lum(a)[sel].mean() / (0.2126 * gain[0] * cur[0]
                                   + 0.7152 * gain[1] * cur[1] + 0.0722 * gain[2] * cur[2])
    out = a.copy()
    for c in range(3):
        out[:, :, c] = a[:, :, c] * (1 + (gain[c] - 1) * w)
    out = np.clip(out, 0, 255)
    got = np.array([out[:, :, c][sel].mean() for c in range(3)])
    print(f"  match-grass   interior grass {tuple(cur.round().astype(int))} -> "
          f"{tuple(got.round().astype(int))}, anchor {tuple(tgt.round().astype(int))}; "
          f"luminance {_lum(a)[sel].mean():.0f} -> {_lum(out)[sel].mean():.0f}")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=OUT)
    ap.add_argument("--out", default=os.path.join(OUT, "plate-stitched.png"))
    # THE ANCHORS ARE PER-TOWN, AND HARDCODING PORT SAPPHIRE'S NEARLY COST MILLBROOK ITS COLOUR.
    # 90.1 / 0.674 are Port Sapphire's plate statistics. Measured on the three approved paintings:
    #     portSapphire  96.36 / 0.5464     millbrook 119.84 / 0.5535     greenhollow 107.58 / 0.4468
    # Stitching millbrook against the defaults darkens the plate about a fifth and lifts its
    # blue/red 22%, which is the same mechanism the handoff recorded as "a blue/red gate actively
    # FORCING village grass blue-green". Passing the right numbers by hand works and is exactly the
    # kind of flag that gets forgotten on the third town, so the default now MEASURES them from the
    # painting the tiles were primed from. Port Sapphire's --src (design/act1-towns/rebake) holds no
    # painting, so it keeps the literal defaults and its behaviour is unchanged.
    ap.add_argument("--target", type=float, default=None, help="plate mean luminance anchor; "
                    "default measured from <src>/painting-graded.png or painting-raw.png")
    ap.add_argument("--target-br", type=float, default=None, help="plate blue/red anchor; "
                    "default measured the same way")
    ap.add_argument("--no-match", action="store_true", help="quilt only, skip exposure match")
    ap.add_argument("--no-quilt", action="store_true", help="exposure match only, hard cut")
    ap.add_argument("--town", help="town id, for the interior-grass match to the accepted plate")
    ap.add_argument("--no-match-grass", action="store_true", help="skip that match")
    a = ap.parse_args()

    if a.target is None or a.target_br is None:
        lum, br = 90.1, 0.674
        src_dir = a.src if os.path.isdir(a.src) else os.path.dirname(a.src)
        for name in ("painting-graded.png", "painting-raw.png"):
            cand = os.path.join(src_dir, name)
            if os.path.exists(cand):
                px = np.asarray(Image.open(cand).convert("RGB"), np.float32).reshape(-1, 3).mean(0)
                lum, br = float(px @ LUM_W), float(px[2] / px[0])
                print(f"  anchors measured from {os.path.relpath(cand, ROOT)}: "
                      f"luminance {lum:.2f}, blue/red {br:.4f}")
                break
        else:
            print(f"  anchors: no painting under {os.path.relpath(src_dir, ROOT)}, "
                  f"using the Port Sapphire literals {lum} / {br}")
        a.target = lum if a.target is None else a.target
        a.target_br = br if a.target_br is None else a.target_br

    tiles = load_tiles(a.src)
    if not a.no_match:
        tiles = exposure_match(tiles, a.target, a.target_br)
    if a.no_quilt:
        plate = np.zeros((PLATE, PLATE, 3))
        for (i, j), (t, b) in tiles.items():
            ox, oy = (BAND if j else 0), (BAND if i else 0)
            plate[i * TILE:(i + 1) * TILE, j * TILE:(j + 1) * TILE] = \
                t[oy:oy + TILE, ox:ox + TILE]
    else:
        plate = stitch(tiles)
    report(plate)
    if not a.no_match_grass and a.town:
        plate = match_grass_to_anchor(plate, a.town)
    Image.fromarray(np.clip(plate, 0, 255).astype(np.uint8), "RGB").save(a.out)
    print("  ->", os.path.relpath(a.out, ROOT))


if __name__ == "__main__":
    raise SystemExit(main())
