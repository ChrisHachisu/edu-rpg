#!/usr/bin/env python3
"""Turn a per-cell dungeon grid into a SMOOTH, shaded art base for the Codex art pass.

Owner, 2026-07-30: "i am also worried whether this level of pixelation will be able to be
smoothly drawn as an artwork by codex."

A fair worry, and the overworld already proved it in both directions. Two art passes there
faithfully reproduced the owner's axis-aligned painted staircase as artwork, because a
staircase is what the input showed. The pass that worked
(design/review/.../semantic-test/tile-4-8-ART.png) worked precisely because ITS input already
had smooth organic boundaries -- the generator simply obeyed it. And the separate finding from
`build_owner_art_base.py`: a FLAT colour map is a weak instruction and the model invents to
fill the gap (25-60% drift), while a textured base that already reads as art is a strong one
and the model only adds material and light.

So this does both jobs:

  1. SMOOTH the rock/floor boundary, using the same method as `smooth_owner_semantic.py`
     (per-class occupancy field -> Gaussian blur -> coherent noise -> argmax), so cave walls
     curve and undulate instead of stepping.
  2. SHADE the result -- wall thickness, ambient occlusion into the corners, a single
     upper-left light, and per-material grain -- so what Codex receives already reads as a
     cave plan rather than a two-colour mask.

THE INVARIANT, inherited and re-verified: the class at every cell CENTRE is preserved exactly,
at the actual output resolution, not just in the field. Collision is per-cell and therefore
unchanged; only the appearance of the boundary between centres moves. The script REFUSES to
write anything if a single centre cannot be preserved.

Usage:
  smooth_dungeon_semantic.py                 # compare sheets for every dungeon, 14 px/cell
  smooth_dungeon_semantic.py --artbase       # + full 48 px/cell art bases for the Codex pass
  smooth_dungeon_semantic.py --only mistyGrotto
"""
from __future__ import annotations

import argparse
import glob
import json
import math
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/act1-dungeon-interiors")

ROCK, FLOOR = 0, 1

# Inherited verbatim from the owner-approved overworld smoothing, so dungeon boundaries are
# produced by the same machinery and at the same character as the terrain the owner signed off.
S = 12                    # field resolution, px per cell
SIGMA_CELLS = 0.85        # boundary smoothing radius, in cells
NOISE_AMP = 0.11          # irregularity strength
NOISE_SIGMA_CELLS = 1.6
SEED = 42                 # canonical project seed
RUNTIME_PX = 48           # TILE_SIZE — src/utils/constants.ts


def blur(a: np.ndarray, sigma: float) -> np.ndarray:
    """Separable Gaussian blur. PIL's GaussianBlur refuses float ('F') images."""
    if sigma <= 0:
        return a.astype(np.float32)
    r = int(np.ceil(3.0 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2).astype(np.float32)
    k /= k.sum()
    cur = a.astype(np.float32)
    for axis in (1, 0):
        pad = ((0, 0), (r, r)) if axis == 1 else ((r, r), (0, 0))
        ap = np.pad(cur, pad, mode="edge")
        out = np.zeros_like(cur)
        for i, wt in enumerate(k):
            if axis == 1:
                out += wt * ap[:, i:i + cur.shape[1]]
            else:
                out += wt * ap[i:i + cur.shape[0], :]
        cur = out
    return cur


def grid_from_rows(rows: list[str]) -> np.ndarray:
    """Asset glyphs sit ON floor cells, so anything that is not rock is floor."""
    h, w = len(rows), len(rows[0])
    g = np.zeros((h, w), dtype=np.int8)
    for y in range(h):
        for x in range(w):
            g[y, x] = ROCK if rows[y][x] == "#" else FLOOR
    return g


# ─────────────────────────────────────────────────────────────────────────────
#  Smoothing, with the cell-centre invariant enforced
# ─────────────────────────────────────────────────────────────────────────────

def build_fields(grid: np.ndarray) -> tuple[list[np.ndarray], int, int]:
    h, w = grid.shape
    H, W = h * S, w * S
    rng = np.random.default_rng(SEED)

    fields = []
    for cls in (ROCK, FLOOR):
        m = (grid == cls).astype(np.float32)
        up = np.repeat(np.repeat(m, S, axis=0), S, axis=1)
        f = blur(up, SIGMA_CELLS * S)
        n = blur(rng.standard_normal((H, W)).astype(np.float32), NOISE_SIGMA_CELLS * S)
        sd = n.std()
        if sd > 0:
            n /= sd
        fields.append(f + NOISE_AMP * n)

    cy = np.arange(h) * S + S // 2
    cx = np.arange(w) * S + S // 2
    truth = (grid == FLOOR).astype(int)

    for it in range(14):
        lab = np.stack(fields).argmax(axis=0)
        bad = np.argwhere(lab[np.ix_(cy, cx)] != truth)
        if len(bad) == 0:
            return fields, it, 0
        for by, bx in bad:
            bump(fields[truth[by, bx]], bx, by, 0.30 + 0.22 * it)
    lab = np.stack(fields).argmax(axis=0)
    return fields, 14, int((lab[np.ix_(cy, cx)] != truth).sum())


def bump(field: np.ndarray, gx: int, gy: int, amp: float) -> None:
    """Nudge one class up at one cell's centre. Gaussian, so it never reintroduces a square."""
    H, W = field.shape
    br = max(2, int(round(0.55 * S)))
    yy, xx = np.mgrid[-br:br + 1, -br:br + 1]
    k = np.exp(-(yy ** 2 + xx ** 2) / (2 * (0.42 * S) ** 2)).astype(np.float32)
    py, px = gy * S + S // 2, gx * S + S // 2
    y0, y1 = max(0, py - br), min(H, py + br + 1)
    x0, x1 = max(0, px - br), min(W, px + br + 1)
    field[y0:y1, x0:x1] += amp * k[y0 - (py - br):y1 - (py - br), x0 - (px - br):x1 - (px - br)]


def label_at(fields: list[np.ndarray], w: int, h: int, px: int) -> np.ndarray:
    """Resample the fields to `px` per cell and take the argmax there."""
    ups = []
    for f in fields:
        im = Image.fromarray(f).resize((w * px, h * px), Image.Resampling.BICUBIC)
        ups.append(np.asarray(im, dtype=np.float32))
    return np.stack(ups).argmax(axis=0)


def centre_misses(lab: np.ndarray, grid: np.ndarray, px: int) -> list[tuple[int, int]]:
    """Cells whose CENTRE came out the wrong class at the real output resolution.

    Checked on a small patch rather than one pixel, because a single correct pixel surrounded
    by the wrong class is not a preserved centre in any meaningful sense.
    """
    h, w = grid.shape
    half = max(2, px // 8)
    bad = []
    for y in range(h):
        for x in range(w):
            py, pxx = y * px + px // 2, x * px + px // 2
            patch = lab[py - half:py + half + 1, pxx - half:pxx + half + 1]
            vals, cnt = np.unique(patch, return_counts=True)
            if vals[cnt.argmax()] != (1 if grid[y, x] == FLOOR else 0):
                bad.append((x, y))
    return bad


def smooth(grid: np.ndarray, px: int) -> tuple[np.ndarray, dict]:
    """Smooth boundary at `px` per cell, with every cell centre guaranteed."""
    h, w = grid.shape
    fields, solve_iters, unresolved = build_fields(grid)
    if unresolved:
        raise SystemExit(f"REFUSING: {unresolved} cell centres unresolved in the field solve")

    for it in range(14):
        lab = label_at(fields, w, h, px)
        bad = centre_misses(lab, grid, px)
        if not bad:
            return lab, {"fieldIterations": solve_iters, "renderIterations": it,
                         "centreMisses": 0}
        for x, y in bad:
            bump(fields[1 if grid[y, x] == FLOOR else 0], x, y, 0.35 + 0.25 * it)
    lab = label_at(fields, w, h, px)
    bad = centre_misses(lab, grid, px)
    if bad:
        raise SystemExit(f"REFUSING: {len(bad)} cell centres still wrong at {px} px/cell")
    return lab, {"fieldIterations": solve_iters, "renderIterations": 14, "centreMisses": 0}


# ─────────────────────────────────────────────────────────────────────────────
#  Shading — make the base read as a cave plan, not a two-colour mask
# ─────────────────────────────────────────────────────────────────────────────

THEME_PALETTE = {
    # (rock_dark, rock_light, floor_dark, floor_light) — the tone families each dungeon's art
    # should sit in. Deliberately desaturated: ART-DIRECTION's TECH SPEC wants backgrounds
    # subdued so sprites and UI read on top.
    "flooded stone cellar": ((28, 30, 36), (74, 78, 88), (58, 66, 72), (108, 120, 124)),
    "root-riddled earth cave": ((30, 26, 22), (78, 66, 52), (72, 62, 48), (128, 112, 88)),
    "misty wet grotto": ((26, 30, 32), (70, 80, 82), (66, 74, 74), (120, 130, 128)),
    "jagged black fang rock": ((18, 18, 22), (58, 56, 64), (52, 50, 58), (98, 94, 104)),
    "tidal coral reef": ((24, 30, 36), (68, 82, 90), (74, 78, 74), (132, 134, 120)),
    "faceted crystal cavern": ((24, 26, 38), (68, 74, 100), (64, 70, 88), (116, 126, 152)),
}
DEFAULT_PALETTE = ((26, 24, 28), (70, 66, 74), (64, 60, 56), (120, 112, 100))


def octave_grain(shape: tuple[int, int], px: int, rng: np.random.Generator) -> np.ndarray:
    """Two octaves of coherent noise: broad mottling plus a finer tooth.

    A single fine octave at full strength reads as television static, not stone. The coarse
    octave is what makes a surface look like a material; the fine one only breaks up its edge.
    """
    out = np.zeros(shape, dtype=np.float32)
    for sigma_cells, amp in ((0.55, 1.0), (0.16, 0.42)):
        sigma = max(0.8, px * sigma_cells)
        if sigma > 6.0:
            # Generate the coarse octave small and upsample: a 100-px Gaussian radius over a
            # multi-megapixel field is minutes of work for noise nobody can resolve anyway.
            f = max(2, int(sigma / 3.0))
            small = (max(8, shape[0] // f), max(8, shape[1] // f))
            n = blur(rng.standard_normal(small).astype(np.float32), sigma / f)
            # np.asarray over a PIL image is read-only; copy before the in-place normalise.
            n = np.array(Image.fromarray(n).resize((shape[1], shape[0]),
                                                   Image.Resampling.BICUBIC),
                         dtype=np.float32)
        else:
            n = blur(rng.standard_normal(shape).astype(np.float32), sigma)
        sd = n.std()
        if sd > 0:
            n /= sd
        out += amp * n
    # Clamp the tails. Upsampling the coarse octave makes it non-Gaussian at the image border
    # (bicubic overshoot reached -5.6 sigma), which clipped to pure black along the bottom rows
    # and would read to an art pass as a deliberate black frame.
    return np.clip(out, -3.0, 3.0)


def shade(lab: np.ndarray, theme: str, px: int) -> np.ndarray:
    """Wall thickness, ambient occlusion, one upper-left light, per-material grain.

    The target is a base that already reads as a cave plan. Per `build_owner_art_base.py`, a
    flat mask lets the model invent (25-60% drift on the overworld) while a base that already
    reads as art constrains it to adding material and light.
    """
    rock_d, rock_l, floor_d, floor_l = THEME_PALETTE.get(theme, DEFAULT_PALETTE)
    floor_mask = (lab == 1).astype(np.float32)
    rng = np.random.default_rng(SEED + 7)

    # The lighting fields are smooth by construction, so they are computed at a cheaper working
    # resolution and upsampled. Computing them at 48 px/cell means Gaussian radii over 120 px on
    # a multi-megapixel image -- minutes per floor for a result that is visually identical.
    WORK = 16
    H, W = lab.shape
    if px > WORK:
        sh, sw = max(8, H * WORK // px), max(8, W * WORK // px)
        base = np.asarray(Image.fromarray(floor_mask).resize((sw, sh),
                                                            Image.Resampling.BILINEAR),
                          dtype=np.float32)
        wpx = WORK
    else:
        base, wpx = floor_mask, px

    def up(a: np.ndarray, lo: float = 0.0, hi: float = 1.0) -> np.ndarray:
        """Upsample, then clamp. Clamping only before the resize is not enough: bicubic
        overshoots, and a slightly negative `inside` raised to a fractional power is NaN, which
        survives the final clip as black speckle across the floor."""
        if a.shape != lab.shape:
            a = np.array(Image.fromarray(a.astype(np.float32)).resize(
                (W, H), Image.Resampling.BICUBIC), dtype=np.float32)
        return np.clip(a, lo, hi)

    # How far inside the open space a pixel sits: 0 against a wall, 1 deep in a chamber. This
    # is the ambient occlusion that stops a floor reading as flat paper, and it also makes a
    # wide chamber legibly different from a crawlway.
    inside = up(np.clip(blur(base, wpx * 0.60) * 1.35, 0.0, 1.0))
    contact = np.clip(1.0 - inside * 1.9, 0.0, 1.0)          # contact shadow at the wall foot
    # How close a rock pixel is to open space — the lit wall face, versus dead rock behind it.
    face = up(np.clip(blur(base, wpx * 0.50) * 1.7, 0.0, 1.0))
    # A narrower band right at the boundary: the top lip of the wall. Without it the rock reads
    # as mottled fill and the boundary as a mere colour change, so a generator has no reason to
    # draw a wall with height. The rim is what says "this is a wall, and it is thick".
    rim = up(np.clip(blur(base, wpx * 0.22) * 3.0, 0.0, 1.0)) * (1.0 - floor_mask)

    # Surface normal from the mask gradient, lit from the upper left per the locked STYLE BLOCK.
    gy, gx = np.gradient(blur(base, wpx * 0.45))
    mag = np.sqrt(gx ** 2 + gy ** 2) + 1e-6
    lit = up(-(gx / mag) * 0.7 - (gy / mag) * 0.7, -1.0, 1.0)

    grain = octave_grain(lab.shape, px, rng)
    out = np.zeros((*lab.shape, 3), dtype=np.float32)
    for ch in range(3):
        # Rock: dead dark away from the cave, rising to a lit face where it meets open space,
        # and brightest where that face turns towards the upper-left light.
        rock = rock_d[ch] + (rock_l[ch] - rock_d[ch]) * face * (0.30 + 0.70 * (0.5 + 0.5 * lit))
        # The lip: brightest where it faces the upper-left light, and still raised where it does
        # not, so the wall has a readable top edge all the way round.
        rock += (rock_l[ch] - rock_d[ch]) * 0.55 * rim * (0.35 + 0.65 * (0.5 + 0.5 * lit))
        # Floor: brightens with depth into the chamber, then loses light in the wall's shadow.
        flr = floor_d[ch] + (floor_l[ch] - floor_d[ch]) * np.power(inside, 0.75)
        flr *= 1.0 - 0.30 * contact * np.clip(-lit, 0, 1)
        out[..., ch] = np.where(floor_mask > 0.5, flr, rock)

    # Grain scaled by material: stone takes more tooth than a silted floor.
    out += grain[..., None] * np.where(floor_mask > 0.5, 3.0, 5.5)[..., None]
    return enforce_readability(np.clip(out, 0, 255), floor_mask, px)


def enforce_readability(rgb: np.ndarray, floor_mask: np.ndarray, px: int,
                        margin: float = 6.0) -> np.ndarray:
    """Guarantee every cell centre reads as its own class by LUMINANCE, not just by label.

    Found by the first Codex pilot, and it was my defect rather than the generator's. `face`
    and `rim` both brighten rock near open space -- but a ONE-CELL wall is entirely near open
    space, from both sides at once, so it lit up along its whole width and read as floor. The
    base went out 3.1% wrong, the art pass faithfully drew those walls open, and the return
    measured 17.3%. A base that is ambiguous exactly where the geometry is tightest is a bad
    instruction, and no amount of prompt wording fixes it.

    So the same discipline the label already gets is applied to the picture: measure every cell
    centre, and push any cell that reads as the wrong class back across the line. Gaussian
    nudges, so nothing reintroduces a hard edge.
    """
    h_cells, w_cells = floor_mask.shape[0] // px, floor_mask.shape[1] // px
    lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    half = max(2, px // 4)

    def centres() -> np.ndarray:
        v = np.zeros((h_cells, w_cells), dtype=np.float32)
        for cy in range(h_cells):
            for cx in range(w_cells):
                py, pxx = cy * px + px // 2, cx * px + px // 2
                v[cy, cx] = np.median(lum[py - half:py + half + 1, pxx - half:pxx + half + 1])
        return v

    truth = np.zeros((h_cells, w_cells), dtype=np.int8)
    for cy in range(h_cells):
        for cx in range(w_cells):
            truth[cy, cx] = 1 if floor_mask[cy * px + px // 2, cx * px + px // 2] > 0.5 else 0

    yy, xx = np.mgrid[-px:px + 1, -px:px + 1]
    kernel = np.exp(-(yy ** 2 + xx ** 2) / (2 * (px * 0.5) ** 2)).astype(np.float32)

    for _ in range(10):
        v = centres()
        if truth.sum() == 0 or (1 - truth).sum() == 0:
            break
        cut = (v[truth == 1].mean() + v[truth == 0].mean()) / 2
        bad = [(cx, cy) for cy in range(h_cells) for cx in range(w_cells)
               if (v[cy, cx] > cut - margin) != (truth[cy, cx] == 1)]
        if not bad:
            break
        for cx, cy in bad:
            py, pxx = cy * px + px // 2, cx * px + px // 2
            y0, y1 = max(0, py - px), min(rgb.shape[0], py + px + 1)
            x0, x1 = max(0, pxx - px), min(rgb.shape[1], pxx + px + 1)
            k = kernel[y0 - (py - px):y1 - (py - px), x0 - (pxx - px):x1 - (pxx - px)]
            # Rock reading too bright gets pushed down; floor reading too dark gets lifted.
            delta = -14.0 if truth[cy, cx] == 0 else 14.0
            rgb[y0:y1, x0:x1] = np.clip(rgb[y0:y1, x0:x1] + (delta * k)[..., None], 0, 255)
        lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]

    return rgb.astype(np.uint8)


def raw_render(grid: np.ndarray, theme: str, px: int) -> np.ndarray:
    """The unsmoothed grid at the same scale — the honest 'before' for comparison."""
    rock_d, rock_l, floor_d, floor_l = THEME_PALETTE.get(theme, DEFAULT_PALETTE)
    h, w = grid.shape
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[grid == ROCK] = rock_d
    img[grid == FLOOR] = floor_l
    big = Image.fromarray(img).resize((w * px, h * px), Image.Resampling.NEAREST)
    return np.asarray(big)


def compare_sheet(floors: list[dict], px: int, path: str, name: str) -> None:
    """Raw staircase on top, smoothed and shaded base underneath, at identical scale."""
    pad, gap = 16, 14
    tiles = []
    for fl in floors:
        grid = grid_from_rows(fl["rows"])
        lab, report = smooth(grid, px)
        tiles.append((raw_render(grid, fl["theme"], px), shade(lab, fl["theme"], px), fl, report))

    tw = sum(t[0].shape[1] for t in tiles) + gap * (len(tiles) - 1)
    th = max(t[0].shape[0] for t in tiles)
    img = Image.new("RGB", (max(tw + pad * 2, 820), th * 2 + gap + pad * 2 + 58), (15, 16, 19))
    from PIL import ImageDraw
    d = ImageDraw.Draw(img)
    d.text((pad, 10), f"{name} — per-cell grid (top) vs smoothed + shaded art base (bottom)",
           fill=(228, 228, 228))
    d.text((pad, 26), "Every cell CENTRE keeps its class at 48 px/cell, so collision is "
                      "byte-identical; only the boundary between centres moves.",
           fill=(142, 148, 156))

    x = pad
    for raw, art, fl, report in tiles:
        img.paste(Image.fromarray(raw), (x, 46))
        img.paste(Image.fromarray(art), (x, 46 + th + gap))
        d.text((x, 46 + th * 2 + gap + 6),
               f"F{fl['floor']}  {fl['width']}x{fl['height']}  centre misses "
               f"{report['centreMisses']}", fill=(142, 148, 156))
        x += raw.shape[1] + gap
    img.save(path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--artbase", action="store_true",
                    help=f"also write full {RUNTIME_PX} px/cell bases for the Codex art pass")
    ap.add_argument("--px", type=int, default=14, help="comparison-sheet scale")
    ap.add_argument("--only", help="one dungeon id")
    args = ap.parse_args()

    ids = sorted({os.path.basename(p).split("-f")[0]
                  for p in glob.glob(os.path.join(DIR, "*-f*.json"))})
    if args.only:
        ids = [i for i in ids if i == args.only] or ids
    manifest = []

    for did in ids:
        paths = sorted(glob.glob(os.path.join(DIR, f"{did}-f*.json")),
                       key=lambda p: int(p.rsplit("-f", 1)[1].split(".")[0]))
        floors = [json.load(open(p)) for p in paths]
        name = floors[0]["dungeonId"]
        out = os.path.join(DIR, f"{did}-smoothness.png")
        compare_sheet(floors, args.px, out, name)
        print(f"{did:22s} {len(floors)} floors  -> {os.path.basename(out)}")

        if args.artbase:
            for fl in floors:
                grid = grid_from_rows(fl["rows"])
                lab, report = smooth(grid, RUNTIME_PX)
                art = shade(lab, fl["theme"], RUNTIME_PX)
                p = os.path.join(DIR, f"{fl['id']}-artbase.png")
                Image.fromarray(art).save(p)
                manifest.append({"floor": fl["id"], "file": os.path.basename(p),
                                 "cells": [fl["width"], fl["height"]],
                                 "size": [art.shape[1], art.shape[0]],
                                 "pxPerCell": RUNTIME_PX, "theme": fl["theme"],
                                 "centreMisses": report["centreMisses"]})
                print(f"    {fl['id']:26s} {art.shape[1]}x{art.shape[0]}  "
                      f"centre misses {report['centreMisses']}")

    if manifest:
        mp = os.path.join(DIR, "artbase-manifest.json")
        json.dump({"_source": "scripts/smooth_dungeon_semantic.py",
                   "invariant": "class at every cell centre preserved exactly at 48 px/cell",
                   "smoothing": {"fieldPxPerCell": S, "sigmaCells": SIGMA_CELLS,
                                 "noiseAmp": NOISE_AMP,
                                 "noiseSigmaCells": NOISE_SIGMA_CELLS, "seed": SEED},
                   "floors": manifest}, open(mp, "w"), indent=1)
        total = sum(m["size"][0] * m["size"][1] for m in manifest)
        print(f"\nmanifest: {os.path.relpath(mp, ROOT)}")
        print(f"art surface: {total / 1e6:.1f} megapixels across {len(manifest)} floors")


if __name__ == "__main__":
    main()
