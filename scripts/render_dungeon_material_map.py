#!/usr/bin/env python3
"""Render a dungeon floor by SPLATTING tiling materials, in continuous world-pixel coordinates.

Adopts `docs/MATERIAL-RENDERER-METHOD.md`, proven on the act-1 overworld on 2026-07-31 after
per-tile AI generation was abandoned there (~9.2M tokens, never shippable). The dungeon art pass
was heading down the same road and hit the same wall: from bases measuring 9.0-9.7 sigma, nine
generated tiles came back 4-14% wrong at 1.9-5.1 sigma, against a pilot that had scored 0% at
8.59. One good sample was never evidence of a reliable pipeline.

Why the three failures become impossible rather than merely rarer:

  * STYLE DRIFT — the materials come from ONE generation per theme, so they cannot disagree.
    Nothing is generated per floor or per region, however large the dungeon.
  * SEAMS — no tile is ever generated. Every pixel is a function of its world coordinate and the
    grid, so there is no boundary for a seam to sit on.
  * MASK IGNORED — this renderer reads `rows` directly. The generator never sees layout, so it
    has no opportunity to reinterpret it.

The dungeon grid is already the splatmap: `#` wall, everything else floor. Nothing to generate.

WHAT DIFFERS FROM THE OVERWORLD RENDERER

  * Two classes, not four — floor and wall — so the interesting problem moves from class
    boundaries to the ONE junction between them.
  * **The wall base gets its own opaque band** (method rule 4). Blending wall texture into floor
    texture looks exactly as wrong as a treeline dissolving into a lake: it is still one material
    handing over to another, and sharpening the blend does not fix it. A real wall meets a real
    floor at a base — a skirting, a fallen-rubble line, a shadow — which is a thing in itself,
    drawn OVER whatever is behind it and extended past the junction so nothing pokes out.
  * The macro layer is **lighting, not relief**. Interiors are enclosed: what gives form is
    ambient occlusion at the wall foot and light pooling in the open middle of a chamber. Both
    come free from `depth` — the blurred floor mask, which is distance-from-nearest-wall.

    render_dungeon_material_map.py --floor sunkenCellar-f3 [--materials DIR] [--placeholder]
"""
from __future__ import annotations

import argparse
import glob
import json
import math
import os
from fractions import Fraction

import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
# The ONLY scipy use in this repo, and it earns it: labelling rock islands in the warped field
# means connected components over ~13M pixels, which a Python flood fill cannot do in the time
# a bake allows. Everything else here stays numpy + PIL.
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prov  # noqa: E402  (needs the path insert above)

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_dungeon_assets import sprite_at  # noqa: E402  (needs ROOT/sys.path above)
DIR = os.path.join(ROOT, "design/act1-dungeon-interiors")
MATROOT = os.path.join(DIR, "materials")
# WORLD PIXELS PER CELL — 48, per the SETTLED overworld.
#
# `design/LANDMARK-SPRITE-CONTRACT.md:87`: "A world cell is 48 px (TILE_SIZE)". The settled Act-1
# overworld is `owner-terrain/art-tiles/act1-material-map.png`, 7104x8736 = 148x182 cells at 48
# px/cell, rendered by `scripts/render_material_map.py` (PX = 48).
#
# `public/act1-hifi/manifest.json` describes a SUPERSEDED runtime (16 px/cell, 208-world-px
# camera, 3.69x nearest). Its chunks are still on disk and its design locks read authoritatively,
# but it is not the map that was settled on. Do not calibrate against it.
PX = 48

# ── The wall's visible face, in CELLS. Hoisted out of render() so that
# `scripts/check_hero_fits_wall_face.py` can assert against the real number instead of restating
# it -- a checker that carries its own copy of a constant passes happily while the thing it checks
# rots. The derivation, and why it is a derivation and not a preference, is on `face_h` in
# render() and in docs/DUNGEON-EDGE-STYLE-LOCK.md.
FACE_H_CELLS = 0.95
FACE_BLUR_CELLS = 0.07              # softening on the band's own top edge

# ── The Act-1 production density lock (design/ART-DIRECTION.md, OWNER-LOCKED 2026-07-16).
# Authored world art is rendered as a high-resolution MASTER at 57/32 = 1.78125 source pixels per
# world pixel, then reduced deterministically. That number is not arbitrary: the heroine is a
# native 64x64 frame drawn at 36 world pixels, so her finest feature is 64/36 = 1.777... source
# pixels per world pixel, and the lattice sits within 0.195% of it. Matching the ratio is what
# makes the environment's pixel grain read as the same material as the hero and the props.
#
# Rendering straight at 48px/cell — one detail pixel per world pixel — is COARSER than the hero
# and is why the dungeon art looked like it came from a different game.
LATTICE_SCALE = Fraction(57, 32)
PALETTE_COLORS = 192          # MEDIANCUT, dither NONE, per the Port Sapphire lattice builders

# Per-theme tone targets. Kept deliberately dark — these are caves — but the FLOOR must stay
# clearly the lighter surface, because that is how the player reads where they can walk. The
# macro lighting darkens after grading, so these are pre-compensated the same way MACRO_COMP
# does for the overworld.
TARGET = {
    "flooded stone cellar":   {"floor": (104, 102, 96), "wall": (34, 34, 40)},
    "root-riddled earth cave": {"floor": (112, 96, 70), "wall": (36, 30, 24)},
    "jagged black fang rock": {"floor": (98, 96, 100), "wall": (24, 23, 28)},
    "tidal coral reef":       {"floor": (120, 112, 92), "wall": (30, 36, 40)},
    "faceted crystal cavern": {"floor": (108, 108, 124), "wall": (28, 30, 44)},
}
MACRO_COMP = 1.22             # the lighting layer darkens the mean; grade above target by this

# Standing water, splatted from the `accent` material. Kept DARKER and more saturated than the
# floor it sits on: water reads as water because it is a hole in the value range, not because it
# is blue. The rim highlight added at splat time is what actually sells the surface.
WATER = {
    "flooded stone cellar":   (34, 52, 58),
    "root-riddled earth cave": (38, 46, 40),
    "jagged black fang rock": (30, 38, 52),
    "tidal coral reef":       (32, 62, 72),
    "faceted crystal cavern": (40, 48, 78),
}


# ── noise ────────────────────────────────────────────────────────────────────────────────────

def _h(ix, iy, seed):
    """Reused verbatim from `render_material_map._h` — the constants are sized to stay inside
    int64 once multiplied by a coordinate array. A larger mixing constant overflows."""
    h = (ix.astype(np.int64) * 374761393 + iy.astype(np.int64) * 668265263
         + np.int64(seed) * 1442695041) & 0x7FFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0x7FFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFF).astype(np.float32) / float(0xFFFFFF)


def vnoise(wx, wy, scale, seed):
    """Smooth value noise (hash + bilinear), matching dq-tiles.js vnoise."""
    fx, fy = wx / scale, wy / scale
    ix, iy = np.floor(fx).astype(np.int64), np.floor(fy).astype(np.int64)
    rx, ry = (fx - ix).astype(np.float32), (fy - iy).astype(np.float32)
    sx, sy = rx * rx * (3 - 2 * rx), ry * ry * (3 - 2 * ry)
    a, b = _h(ix, iy, seed), _h(ix + 1, iy, seed)
    c, d = _h(ix, iy + 1, seed), _h(ix + 1, iy + 1, seed)
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy


def fbm(wx, wy, scale, seed, octaves=3):
    out, amp, norm = 0.0, 1.0, 0.0
    for o in range(octaves):
        out = out + amp * vnoise(wx, wy, scale / (2 ** o), seed + o * 77)
        norm += amp
        amp *= 0.5
    return out / norm


def blur(a, sigma):
    """Separable Gaussian. PIL's GaussianBlur refuses float ('F') images — the same note
    `smooth_owner_semantic.py` carries, for the same reason."""
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
            out += wt * (ap[:, i:i + cur.shape[1]] if axis == 1
                         else ap[i:i + cur.shape[0], :])
        cur = out
    return cur


def shift(a: np.ndarray, dy: int) -> np.ndarray:
    """`a` resampled at row y+dy, clamped at the edges. `np.roll` would wrap the top of the map
    onto the bottom and hang a phantom wall face off the first row."""
    if dy == 0:
        return a
    out = np.empty_like(a)
    if dy > 0:
        out[:-dy] = a[dy:]
        out[-dy:] = a[-1]
    else:
        out[-dy:] = a[:dy]
        out[:-dy] = a[0]
    return out


# ── materials ────────────────────────────────────────────────────────────────────────────────

def placeholder_materials(theme: str) -> dict:
    """Procedural stand-ins, so the geometry, junction band and lighting can be proved before a
    single token is spent on generation. Swapped out for the real sheet, nothing else changes."""
    rng = np.random.default_rng(7)
    out = {}
    tgt = TARGET.get(theme, TARGET["root-riddled earth cave"])
    for name, base, grain in (("floor", tgt["floor"], 26), ("wall", tgt["wall"], 30),
                              ("rubble", tuple(int(v * 0.8) for v in tgt["floor"]), 34),
                              ("accent", tuple(int(v * 1.15) for v in tgt["floor"]), 20)):
        # Wrap the noise so the placeholder tiles: otherwise its 531px repeat draws ruled lines
        # across the render and looks like a renderer fault rather than a stand-in artefact.
        big = blur(rng.standard_normal((531 * 2, 531 * 2)).astype(np.float32), 2.0)
        n = big[:531, :531] + big[531:, :531] + big[:531, 531:] + big[531:, 531:]
        n = np.roll(np.roll(n, 265, 0), 265, 1)
        n = n / (n.std() or 1)
        t = np.clip(np.array(base, np.float32)[None, None, :] + n[..., None] * grain, 0, 255)
        out[name] = t.astype(np.uint8)
    return out


def load_materials(path: str) -> dict:
    out = {}
    for name in ("floor", "wall", "rubble", "accent"):
        p = os.path.join(path, f"mat-{name}.png")
        if os.path.exists(p):
            out[name] = np.asarray(Image.open(p).convert("RGB"))
    if "floor" not in out or "wall" not in out:
        raise SystemExit(f"REFUSING: {path} needs at least mat-floor.png and mat-wall.png")
    out.setdefault("rubble", out["wall"])
    out.setdefault("accent", out["floor"])
    return out


def temper(mat: np.ndarray, lowfreq: float = 0.35, grain: float = 24.0) -> np.ndarray:
    """Move a material onto the overworld's SHAPE of detail, not just its amount.

    Measured against `owner-terrain/materials/mat-rock.png`, the regenerated wall was not short of
    detail — it had far too much of the wrong kind. Total std 51.97 against the target's 30.66,
    with only 26.3% of its energy below 1 px against 35.4%, and 20.9% above 16 px against 11.1%.
    Its blocks were shouting over its grain, and that ratio is what reads as "coarser pixelation".

    Two ops, each aimed at one measured band. Compressing the LOW frequencies keeps every block
    edge exactly where it is and only reduces how far block value drifts from block value, so the
    fractured structure survives. Per-pixel grain then fills the sub-pixel band, which smooth
    noise cannot reach — `fbm` at any scale is interpolated and never puts energy below 1 px
    (tried: it moved 26.3% to 27.1% at three times this amplitude).

    Lands at fine 33.9% / coarse 12.1% / std 37.9 against 35.4 / 11.1 / 30.7.

    NOT the `flatten()` removed earlier that day: that one zeroed the low band outright, was
    applied to the FLOOR on a misread of a patch grid that measurement later showed did not
    exist, and was verified inert. This is partial, applied to the wall, and aimed at a gap that
    was measured first.
    """
    m = mat.astype(np.float32)
    mean = m.reshape(-1, 3).mean(axis=0)[None, None, :]
    lo = np.dstack([blur(m[..., c], 14.0) for c in range(3)])
    out = (m - lo) + (lo - mean) * lowfreq + mean
    if grain > 0:
        h, w = m.shape[:2]
        iy, ix = np.mgrid[0:h, 0:w]
        n = (_h(ix, iy, 909) - 0.5) * 2.0
        lum = np.clip(out.mean(axis=2, keepdims=True), 0, 255) / 255.0
        out = out + n[..., None] * grain * (0.30 + 0.70 * lum)   # grain sits on lit faces
    return np.clip(out, 0, 255)


def grade(mat: np.ndarray, target: tuple) -> np.ndarray:
    """Move a material's mean onto the theme target, keeping its own contrast."""
    m = mat.astype(np.float32)
    mean = m.reshape(-1, 3).mean(axis=0)
    scale = np.array(target, np.float32) * MACRO_COMP / np.maximum(mean, 1e-3)
    return np.clip(m * scale[None, None, :], 0, 255)


def sample(mat: np.ndarray, wx: np.ndarray, wy: np.ndarray) -> np.ndarray:
    """Nearest-tap sample of a wrapping material at continuous world coordinates."""
    h, w = mat.shape[:2]
    return mat[np.mod(wy.astype(np.int64), h), np.mod(wx.astype(np.int64), w)]


def sample_patched(mat: np.ndarray, wx: np.ndarray, wy: np.ndarray, cell: float,
                   seed: int, patch: float = 4.5, tex: float = 1.0) -> tuple:
    """Stochastic patch sampling, plus the crevice that hides its own boundary.

    A 531px material repeats every ~11 cells. While the material was soft that repeat was hard to
    see; once it carried real detail — angular blocks and deep crevices — both the repeat AND the
    quilt's wrap seam became obvious. Blending several taps would kill the repeat but average away
    exactly the contrast the regenerated material was made for.

    So: cut world space into irregular patches and give each one a DIFFERENT offset into the
    material. No two neighbouring patches can line up, so nothing repeats and the wrap seam lands
    in a different place every time instead of ruling a straight line across the map. The switch
    between patches is a hard edge — and a hard edge in stone is a crack, so it is darkened and
    read as one. The seam becomes a feature of the rock rather than a defect in the tiling.

    Returns (texels, crack) so the caller can darken the joint after grading.
    """
    h, w = mat.shape[:2]
    s = cell * patch
    # Irregular patch boundaries. On a straight grid the joints read as masonry courses, which is
    # the exact look this dungeon had to get away from.
    jx = ((fbm(wx, wy, cell * 2.7, seed + 1) - 0.5) * 1.35
          + (fbm(wx, wy, cell * 0.8, seed + 3) - 0.5) * 0.45) * s
    jy = ((fbm(wx, wy, cell * 2.7, seed + 2) - 0.5) * 1.35
          + (fbm(wx, wy, cell * 0.8, seed + 4) - 0.5) * 0.45) * s
    u, v = (wx + jx) / s, (wy + jy) / s
    gx, gy = np.floor(u), np.floor(v)
    gxi, gyi = gx.astype(np.int64), gy.astype(np.int64)

    # `tex` shrinks the material relative to the world. TRIED AND REVERTED to 1.0: at 2.3 the
    # image changed a lot (mean abs diff 27) and the scale spectrum did not move at all
    # (25.1% -> 25.4% of energy under 1 px). Shrinking pushes the material's grain BELOW what the
    # 57/32 LANCZOS reduction can carry, so the reduction filters straight back out what the
    # shrink just created — and the rock stops reading as fractured blocks and starts reading as
    # gravel. Coarseness lives in the MATERIAL's own detail, not in how it is sampled.
    sx, sy = wx * tex, wy * tex
    ox = _h(gxi, gyi, seed + 7) * float(w)
    oy = _h(gxi, gyi, seed + 8) * float(h)
    texels = mat[np.mod((sy + oy).astype(np.int64), h), np.mod((sx + ox).astype(np.int64), w)]

    fu, fv = u - gx, v - gy
    d = np.minimum(np.minimum(fu, 1.0 - fu), np.minimum(fv, 1.0 - fv)) * s   # px to the joint
    crack = np.clip(1.0 - d / max(1.5, cell * 0.055), 0.0, 1.0)
    return texels, crack


# ── master-resolution compositing ────────────────────────────────────────────────────────────

def _seat(dst: Image.Image, sp: Image.Image, cx: int, cy: int, px: float) -> None:
    """Drop a sprite with the contact shadow that seats it on the floor. Without one it hovers,
    however well it is drawn."""
    al = np.asarray(sp)[..., 3].astype(np.float32) / 255.0
    foot = al[int(al.shape[0] * 0.55):]
    if foot.size and foot.max() > 0:
        cols = np.nonzero(foot.max(axis=0) > 0.2)[0]
        if len(cols):
            sw = int((cols.max() - cols.min() + 1) * 1.15)
            sh = max(3, int(sw * 0.34))
            # THE MARGIN IS THE WHOLE POINT (owner, 2026-08-01: "a faint square below it").
            #
            # The ellipse used to span the full canvas, [0, 0, sw-1, sh-1], so it touched all four
            # edges. GaussianBlur then had nowhere to fade: alpha measured 32 in the CORNERS and
            # up to 109 along the boundary, terminating abruptly at the canvas edge. A blurred
            # ellipse that is clipped on every side does not read as a soft shadow — it reads as
            # the rectangle it is being clipped to. Padding by 3 sigma gives the falloff room to
            # reach zero inside the canvas, so only the ellipse survives.
            blur = max(1.0, sw * 0.10)
            pad = int(math.ceil(blur * 3))
            shade = Image.new("RGBA", (sw + 2 * pad, sh + 2 * pad), (0, 0, 0, 0))
            ImageDraw.Draw(shade).ellipse([pad, pad, pad + sw - 1, pad + sh - 1],
                                          fill=(0, 0, 0, 115))
            shade = shade.filter(ImageFilter.GaussianBlur(blur))
            dst.alpha_composite(shade, (max(0, cx + (sp.width - sw) // 2 - pad),
                                        max(0, cy + sp.height - sh // 2 - int(px * 0.06) - pad)))
    dst.alpha_composite(sp, (max(0, cx), max(0, cy)))


# Prop size in CELLS. A flat 0.86 cell put every prop at 41 px against a 56 px hero figure — the
# owner's "much smaller compared to the hero and out of scale". The landmark contract settles the
# principle: it bumped a dungeon mouth 96 -> 144 px because 1.7x hero "read as insignificant", so
# legibility beats literal scale. These follow the same reasoning, and a mouth matches the
# contract's 3-cell dungeon entrance exactly so the same opening reads the same size inside and out.
PROP_CELLS = {
    "mouth": 3.0,        # LANDMARK-SPRITE-CONTRACT.md: dungeon entrance is 144px / 3x3 cells
    "stairsUp": 1.5, "stairsDown": 1.5,
    # 1.6 -> 2.2 (owner, 2026-08-01: "not prominent enough ... looks like a sliver of smoke").
    # It is no longer a slab the fight happens on — it is the monster itself, so it has to loom
    # over the 1.17-cell hero rather than sit under her feet.
    "boss": 2.2,
    "save": 1.3,         # stands taller than the hero; it is a place you go to, so it must read
    "chest": 1.0,
    "sign": 1.1,
    "torch": 0.7,
}


def paste_props(dst: Image.Image, assets: list, px: float) -> None:
    """`px` is MASTER pixels per cell (~85.5). A prop draws at 0.86 of a cell, so its master size
    follows the same 57/32 lattice everything else is authored on."""
    for it in assets:
        sp = sprite_at(it["kind"], int(round(px * PROP_CELLS.get(it["kind"], 1.0))))
        if sp is None:
            continue
        _seat(dst, sp,
              int(it["x"] * px + px / 2 - sp.width / 2),
              int(it["y"] * px + px / 2 - sp.height / 2 - px * 0.04), px)


def paste_hero(dst: Image.Image, cell: tuple, px: float) -> None:
    """The heroine draws at 36 WORLD pixels (ART-DIRECTION.md), which on this lattice is
    36 * 57/32 = 64.125 MASTER pixels — her native frame size. She is therefore pasted 1:1 with no
    resampling at all, and the single shared reduction takes her to exactly the locked scale.
    That the two numbers agree to 0.195% is the reason the lattice is 57/32 in the first place."""
    p = os.path.join(ROOT, "public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png")
    if not os.path.exists(p):
        return
    sheet = Image.open(p).convert("RGBA")
    frame = sheet.crop((0, 0, 64, 64))                 # row 0 col 0 = down, idle
    # LANDMARK-SPRITE-CONTRACT.md:110 — the scale reference is the locked g3 hero, a 56 px
    # FIGURE inside a 64 px frame = 1.17 cells. So the frame draws at 64 world px on the 48px
    # cell grid; it is NOT scaled to 36, which belongs to the superseded 16px/cell runtime.
    n = int(round(px * 64.0 / PX))
    if n != 64:
        frame = frame.resize((n, n), Image.Resampling.LANCZOS)
    _seat(dst, frame,
          int(cell[0] * px + px / 2 - frame.width / 2),
          int(cell[1] * px + px / 2 - frame.height / 2 - px * 0.10), px)


# ── render ───────────────────────────────────────────────────────────────────────────────────

class Field:
    """The floor-weight field every pixel of a floor is decided by.

    Pulled out of `render()` verbatim in 2026-08-05 so that COLLISION can be derived from the
    same `fw` that draws the art instead of from the `#`/`.` lattice. Measured on sunkenCellar-f3
    before this existed: 105 of 986 cells (10.6%) were rock to the tile grid and open floor in the
    picture, because `blur()` softens the lattice and `warp` then pushes the boundary off it
    entirely. The player saw open ground and was stopped by an invisible square. Sharing this
    function is what makes that disagreement impossible rather than merely small — there is only
    one boundary, and both consumers threshold it at the same 0.5.

    Nothing here is new code. `render()` calls it and its output is byte-identical (verified
    against all three shipped sunkenCellar renders).
    """

    __slots__ = ("fw", "prot", "xx", "yy", "px", "W", "H", "Ww", "Hw", "cw", "ch")

    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)


# A wall mass has to be big enough to READ as rock, and deep enough to wear the face band.
#
# Owner, 2026-08-06, first pass: "this also causes a minor problem with small patches of walls
# since some do not have enough mass to support the massive shadow part, so the easy fix is to
# just remove these and make a rule to only have larger wall masses that can have a large shadow
# patch." Second pass, after seeing the bake: "i told you the issue with the smaller walls so i
# need you to remove them or merge them into bigger walls."
#
# THE FIRST RULE WAS TOO WEAK and this is why. It failed a component only when its longest
# VERTICAL RUN was under 2 cells, which is the band-fit test -- so it caught single-cell slivers
# and nothing else, 1-8 specks a floor. Measured across the shipped bake, 27 wall masses under
# 6 cells survived it, 19 of them in coastalReef, whose braided loops leave small rock cores
# between the bypasses. A 3-cell island passes a depth test and still reads as a speck of grit,
# not as rock you walk beside.
#
# So there are two conditions now, and a mass must meet BOTH:
#   * DEPTH   -- longest vertical run >= MIN_WALL_DEPTH_CELLS. The band eats `face_h` px NORTHWARD
#                from a mass's southern boundary, so vertical run, not area, is what decides
#                whether any lit top survives. At 0.95 the band is 45 px: one cell (48 px) leaves
#                3 px of top, two cells (96 px) leave 51.
#   * MASS    -- area >= MIN_WALL_AREA_CELLS, which is the owner's "larger wall masses" and is
#                about legibility rather than lighting.
#
# A failing mass is MERGED if it can be, and REMOVED if it cannot -- both of which the owner
# named. Merging is preferred because it keeps the rock the layout intended, but it is only safe
# across a hairline: filling a wide gap would wall off a corridor. So a merge is allowed only into
# an ORTHOGONALLY ADJACENT gap of at most MERGE_GAP cells, and only when the fill leaves every
# floor cell still reachable -- checked, not assumed. Everything else is removed, which is always
# safe because it can only ever OPEN floor.
MIN_WALL_DEPTH_CELLS = 2
MIN_WALL_AREA_CELLS = 6
MERGE_GAP = 1


def _components(solid: set[tuple[int, int]]) -> list[list[tuple[int, int]]]:
    """8-connected wall masses."""
    seen: set[tuple[int, int]] = set()
    out = []
    for cell in sorted(solid):
        if cell in seen:
            continue
        comp, stack = [], [cell]
        seen.add(cell)
        while stack:
            cy, cx = stack.pop()
            comp.append((cy, cx))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    n = (cy + dy, cx + dx)
                    if n in solid and n not in seen:
                        seen.add(n)
                        stack.append(n)
        out.append(comp)
    return out


def _deepest_run(comp: list[tuple[int, int]]) -> int:
    members = set(comp)
    best = 0
    for cy, cx in comp:
        if (cy - 1, cx) in members:
            continue                                    # not the top of a run
        run = 0
        while (cy + run, cx) in members:
            run += 1
        best = max(best, run)
    return best


def _floor_connected(solid: set[tuple[int, int]], ch: int, cw: int) -> bool:
    """Every open cell still reachable from every other. A merge that fails this walls off play."""
    open_cells = {(y, x) for y in range(ch) for x in range(cw) if (y, x) not in solid}
    if not open_cells:
        return False
    start = next(iter(open_cells))
    seen, stack = {start}, [start]
    while stack:
        cy, cx = stack.pop()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            n = (cy + dy, cx + dx)
            if n in open_cells and n not in seen:
                seen.add(n)
                stack.append(n)
    return len(seen) == len(open_cells)


def prune_thin_walls(rows: list[str]) -> tuple[list[str], list[tuple[int, int]]]:
    """Merge or remove wall masses too small or too shallow. Returns (rows, cells removed).

    Applied inside `floor_field`, which is the ONE path both the picture and the collision mask
    go through, so the two cannot disagree about where the rock is.
    """
    ch, cw = len(rows), len(rows[0])
    solid = {(y, x) for y in range(ch) for x in range(cw) if rows[y][x] == "#"}
    removed: list[tuple[int, int]] = []
    filled: list[tuple[int, int]] = []

    def passes(comp):
        return len(comp) >= MIN_WALL_AREA_CELLS and _deepest_run(comp) >= MIN_WALL_DEPTH_CELLS

    for _ in range(4):                                  # a merge can promote a mass; re-settle
        comps = _components(solid)
        failing = [c for c in comps if not passes(c)]
        if not failing:
            break
        keep = {cell for c in comps if passes(c) for cell in c}
        changed = False
        for comp in failing:
            bridge = None
            for cy, cx in comp:                         # a hairline gap to a mass that passes
                for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    for step in range(1, MERGE_GAP + 1):
                        gap = [(cy + dy * k, cx + dx * k) for k in range(1, step + 1)]
                        beyond = (cy + dy * (step + 1), cx + dx * (step + 1))
                        if beyond in keep and all(
                                g not in solid and 0 <= g[0] < ch and 0 <= g[1] < cw
                                for g in gap):
                            bridge = gap
                            break
                    if bridge:
                        break
                if bridge:
                    break
            if bridge and _floor_connected(solid | set(bridge), ch, cw):
                solid |= set(bridge)
                filled.extend(bridge)
            else:
                solid -= set(comp)
                removed.extend(comp)
            changed = True
        if not changed:
            break

    if removed or filled:
        grid = [list(r) for r in rows]
        for y, x in removed:
            grid[y][x] = "."
        for y, x in filled:
            grid[y][x] = "#"
        rows = ["".join(r) for r in grid]
    return rows, removed + filled


def drop_rock_islands(fw: np.ndarray, px: float) -> np.ndarray:
    """Fill rock islands below MIN_WALL_AREA_CELLS that the BOUNDARY WARP created.

    `prune_thin_walls` runs on the lattice, before `warp` exists, so it cannot see rock the warp
    itself breaks off the edge of a mass. Measured after the lattice rule shipped: 27 masses under
    6 cells fell to 8, and every survivor -- 0.3 to 5.3 cells -- had no lattice component behind
    it. The owner's rule is about what is on SCREEN, so it has to be enforced where the screen is
    decided, which is here.

    Applied to `fw` itself rather than to the mask afterwards, because `fw` is the single field the
    picture and the collision mask are both derived from. Cleaning it once is what keeps them
    identical by construction; cleaning them separately would be two opinions about where rock is.
    """
    rock = fw < 0.5
    lab, n = ndimage.label(rock)
    if n == 0:
        return fw
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0                                        # label 0 is the floor, never a candidate
    doomed = np.flatnonzero((sizes > 0) & (sizes < MIN_WALL_AREA_CELLS * px * px))
    if not len(doomed):
        return fw
    kill = np.isin(lab, doomed)
    # 0.75 rather than 1.0: comfortably floor, without punching a hole in `depth` -- the blurred
    # floor mask that drives light pooling -- where a speck of rock used to be.
    return np.where(kill, np.maximum(fw, 0.75), fw).astype(fw.dtype)


# ── Every shaded part must have at least as much LIT wall above it.
#
# Owner, 2026-08-06, third pass: "we still have an issue where some edges cannot visually withstand
# the shadow part so they need to be thicker in some locations (some parts only have shadows, so we
# need at least the same area of walls above the shaded parts in every location)".
#
# Read literally -- every wall column at least 2 x face_h deep -- the constraint is UNSATISFIABLE
# without destroying the caves, and measuring says so: 11,600 column-runs are shallower than that,
# they are overwhelmingly the one- and two-pixel tapers at the sides of masses, and a naive
# northward thickening sealed corridors and split coastalReef-f2 and whisperingWoodsCave-f2 into
# SIX disconnected floor regions each. Squaring off every taper would also break the organic
# silhouette this file's own rule 1 protects ("you misunderstood crispness with angularness").
#
# What he can actually SEE is different and much smaller: connected patches of wall whose whole
# depth is band, big enough to read as a dark smear rather than as the edge of a rock. Measured:
# 91 such patches of >= 1 cell across the 12 floors, the largest 5.6 cells. Those are the defect.
#
# So each visible patch is THICKENED where there is room -- extending it north until it carries a
# lit top at least as deep as its band -- and REMOVED where there is not. Both remedies are the
# owner's. Two invariants are enforced rather than hoped for:
#   * a corridor never drops below MIN_CORRIDOR_CELLS, and
#   * the floor stays ONE connected region -- checked after every change, and the change is
#     reverted if it is not. All 12 floors are one region today; that is what a naive thicken broke.
#
# The edit is FEATHERED into `fw` rather than stamped on it. `a` is `(fw - 0.5) * 34`, so a hard
# write would give the new wall edge a mechanical boundary in a picture whose whole point is that
# its boundaries are not.
MIN_SHADOW_PATCH_CELLS = 1.0
# AREA WAS THE WRONG PROXY FOR VISIBILITY, and the owner found it (2026-08-06): "i see several
# places on the sunken cellar map where the walls are all shadow and has no top part. please check
# the ends of each wall."
#
# He is describing the END of a wall mass. The band eats `face_h` northward from a mass's southern
# boundary, so wherever the warp rounds a mass off — which is exactly at its east and west ends —
# the vertical run drops under `need` for the last fraction of a cell and no lit top survives. The
# result is a blunt dark lobe hanging off the end of the rock.
#
# Those lobes are TALL AND THIN, and that is why an area test could not see them. Measured on the
# three shipped sunkenCellar floors: 87 all-shadow patches, EVERY ONE of them under the 1.0-cell
# area threshold, so `thicken_shadow_walls()` skipped all 87 and then truthfully reported zero.
# The worst is 0.85 cell of AREA and 40 x 87 world px on screen — a full cell wide, nearly two
# tall, solid black. Their shape is consistently 0.2-1.0 cells wide by 1.4-2.2 tall, which is the
# signature of a wedge at a mass's end rather than of a smear in its middle.
#
# So visibility is now decided by EXTENT as well as area, and the two are OR'd: the area rule
# still catches the broad smears it was written for, and the extent rule catches the end lobes it
# could not. This can only ever select MORE patches, never fewer, so no patch that was being
# treated stops being treated.
#
# The thresholds are what the screen shows, not what is convenient: at 48 world px per cell,
# 0.25 x 0.75 cells is a 12 x 36 px block of unbroken band. Sampled at 1:1 against the shipped
# render, 15 px wide still reads as a lobe and 9 px reads as the edge of the rock.
MIN_SHADOW_PATCH_W_CELLS = 0.25
MIN_SHADOW_PATCH_H_CELLS = 0.75
# Rounds of thicken-or-remove. Convergence, not a budget: the loop exits the moment a round
# changes nothing, and on the shipped floors it settles well inside this. It exists only so an
# unluckily-shaped mass cannot cycle forever.
PATCH_PASSES = 8
# An unreachable pocket smaller than this is sealed; anything bigger is left to fail the gate
# loudly. One cell is the smallest thing the heroine could stand in at all, so a pocket under it
# is a rounding artefact of the reduce-and-threshold boundary rather than a place in the dungeon.
SEAL_SPECK_CELLS = 1.0
# 1.5 cells, not 1.0. At 1.0 a corridor survives as 48 world px, which the raw mask calls connected
# and the HEROINE cannot use: she is not a point, and a1mFree demands A1M_FOOT + A1M_LEAN = 16 px
# of clearance at her soles, so a 48 px corridor leaves her a 16 px ribbon that the boundary warp
# then pinches shut. Shipped once, briefly: sunkenCellar-f3 came back with 17 disconnected
# passable regions and its BOSS and SAVE unreachable, on a mask that passed a zero-radius
# connectivity test. Owner had called it: "if this causes occlusions we will need to redraw the
# dungeons so they make sense visually and are playable."
MIN_CORRIDOR_CELLS = 1.5
# Clearance the collider demands at her ground-contact point, in WORLD px, mirroring
# A1M_FOOT + A1M_LEAN in dq-tiles.js. scripts/check_dungeon_playable.py reads the real values out
# of that file and gates on them; this is the render-time guard that stops us shipping a floor it
# would reject.
HERO_CLEARANCE_PX = 16


def _runs(rock: np.ndarray, x: int):
    """(start, length) of every maximal vertical rock run in column x."""
    col = rock[:, x]
    idx = np.flatnonzero(col)
    if not len(idx):
        return []
    cuts = np.flatnonzero(np.diff(idx) > 1)
    starts = np.concatenate([[idx[0]], idx[cuts + 1]])
    ends = np.concatenate([idx[cuts], [idx[-1]]])
    return list(zip(starts, ends - starts + 1))


def _shadow_only(rock: np.ndarray, need: int) -> np.ndarray:
    out = np.zeros_like(rock)
    for x in range(rock.shape[1]):
        for y0, L in _runs(rock, x):
            if L < need:
                out[y0:y0 + L, x] = True
    return out


def _passable_field(fw: np.ndarray, px: float) -> tuple[int, int]:
    """`_passable`, but asked of the FLOAT FIELD exactly as `walkable_mask` asks it.

    `_passable` reduces a BOOLEAN and thresholds the average -- "were most sub-pixels rock". The
    gate reduces `fw` ITSELF and thresholds that -- "does this pixel come out mostly floor". Near
    a boundary those are different questions, which is why aligning only the RESOLUTION was not
    enough: mistyGrotto-f3 kept splitting, the round-level guard kept approving it, and the two
    were simply measuring different masks.

    Used for the round-level verdict, where the field exists. The in-round candidate checks still
    use `_passable`, because a candidate is a boolean with no field behind it yet -- they are a
    cheap filter, and this is the decision.
    """
    Ww = max(1, int(round(fw.shape[1] * PX / px)))
    Hw = max(1, int(round(fw.shape[0] * PX / px)))
    small = np.asarray(Image.fromarray(fw, "F").resize((Ww, Hw), Image.Resampling.BOX)) >= 0.5
    lab, n = ndimage.label(ndimage.distance_transform_edt(small) >= HERO_CLEARANCE_PX)
    if n == 0:
        return 0, 0
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    return n, int(sizes.max()) * (px / PX) ** 2


def _grow_patch(cand: np.ndarray, rock: np.ndarray, lab: np.ndarray, tgt: int,
                need: int, keep: int) -> bool:
    """Extend one all-shadow patch NORTHWARD in `cand` until it can carry a lit top.

    Gaps are measured against `rock`, never against `cand`, so a patch's room to grow is the same
    whether it is attempted alone or inside a batch. Returns whether anything was written.
    """
    ys, xs = np.where(lab == tgt)
    touched = False
    for x in np.unique(xs):
        col = ys[xs == x]
        y0, length = col.min(), col.max() + 1 - col.min()
        if length >= need:
            continue
        gap, k = 0, y0 - 1
        while k >= 0 and not rock[k, x]:
            gap += 1
            k -= 1
        take = max(0, min(need - length, gap - keep))
        if take:
            cand[y0 - take:y0, x] = True
            touched = True
    return touched


def seal_floor_specks(fw: np.ndarray, px: float,
                      prot: np.ndarray | None) -> tuple[np.ndarray, np.ndarray | None]:
    """Close isolated sub-cell pockets of standable floor that nothing can reach.

    `check_dungeon_playable.py` requires the passable area to be ONE region and does not care how
    small an extra one is. Nothing in this file ever guaranteed that. The untreated field
    legitimately carries a few specks -- `_no_worse` says so in as many words, and tolerates them
    because it is a RELATIVE test -- and the old shadow pass happened to thicken rock over
    mistyGrotto-f3's, so the floor shipped as one region by luck rather than by rule. Change what
    that pass does and the luck runs out: the speck at cell (8.2, 12.3) survived, 0.00 cells in
    size, and failed the gate.

    Only SUB-THRESHOLD specks are sealed. A genuinely large region cut off from the rest is a
    playability bug that the gate must keep shouting about, so it is deliberately left alone -- a
    function that quietly filled it would hide exactly the failure it was written to prevent.

    A pocket holding a prop is never sealed: the layout is authoritative about where props stand.
    """
    Ww = max(1, int(round(fw.shape[1] * PX / px)))
    Hw = max(1, int(round(fw.shape[0] * PX / px)))
    small = np.asarray(Image.fromarray(fw, "F").resize((Ww, Hw), Image.Resampling.BOX)) >= 0.5
    lab, n = ndimage.label(ndimage.distance_transform_edt(small) >= HERO_CLEARANCE_PX)
    if n <= 1:
        return fw, None
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    main = int(sizes.argmax())
    doomed = np.zeros_like(small)
    for i in np.flatnonzero(sizes):
        if i == main or sizes[i] >= SEAL_SPECK_CELLS * PX * PX:
            continue
        doomed |= (lab == i)
    if not doomed.any():
        return fw, None
    up = np.asarray(Image.fromarray(doomed.astype(np.float32), "F")
                    .resize((fw.shape[1], fw.shape[0]), Image.Resampling.NEAREST)) > 0.5
    # `doomed` is the ERODED core -- where her CENTRE could stand. The pocket she would occupy is
    # that dilated by her clearance, and sealing only the core would leave the pocket open.
    r = int(round(HERO_CLEARANCE_PX * px / PX))
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    up = ndimage.binary_dilation(up, xx * xx + yy * yy <= r * r)
    if prot is not None:
        up &= prot < 0.5
    if not up.any():
        return fw, None
    # WRITTEN HARD, and this is the one edit in this file that should be. Every other boundary is
    # feathered so it does not look mechanical; feathering THIS one is what left the speck behind
    # on the first attempt, because blurring a sub-cell region spreads the -0.60 so thin that the
    # field never crosses 0.5 and the pocket stays open. The same trap as the shadow pass.
    #
    # A hard write is safe here precisely because the region is smaller than one cell and no one
    # can reach it: there is no silhouette to make mechanical. It is closing a pinhole in the
    # collision mask, not drawing a wall.
    fw = np.where(up, np.minimum(fw, 0.42), fw)
    return np.clip(fw, 0.0, 1.0).astype(np.float32), up


def _visible_patches(lab: np.ndarray, sizes: np.ndarray,
                     min_patch: float, min_w: float, min_h: float) -> np.ndarray:
    """Labels of the all-shadow patches a player can actually SEE.

    Area OR extent, never area alone — see the MIN_SHADOW_PATCH_* block above. A wall-end lobe is
    a tall thin wedge, so it carries very little area while covering a lot of screen; an area-only
    test measured 87 of them on sunkenCellar and skipped every one.
    """
    keep = []
    for i in np.flatnonzero(sizes > 0):
        if sizes[i] >= min_patch:
            keep.append(i)
            continue
        ys, xs = np.where(lab == i)
        if (xs.max() - xs.min() + 1) >= min_w and (ys.max() - ys.min() + 1) >= min_h:
            keep.append(i)
    return np.array(keep, dtype=np.int64)


def _passable(rock: np.ndarray, px: float) -> tuple[int, int]:
    """(region count, largest region) of the floor a body of the heroine's radius can reach.

    NOT `label(~rock)`. That asks whether a zero-radius POINT could get through, which is the
    question that let a 48 px corridor pass and stranded the Sunken Cellar boss under 17
    disconnected regions. Erode by her real clearance first, then ask.
    """
    # ASK AT THE RESOLUTION THE GATE ASKS AT. This used to erode the LATTICE (~85.5 px/cell) and
    # scale her clearance up to match, which sounds equivalent and is not: `walkable_mask` reduces
    # the field to 48 px/cell by AREA AVERAGE and only then thresholds, and that boundary is
    # slightly wider than the lattice's. A spot this guard called sealed could come back open once
    # the picture was reduced.
    #
    # It cost a real regression. mistyGrotto-f3 shipped as ONE region, the guard approved every
    # edit on it, and the reduced mask came out as TWO -- the second a 0.00-cell speck at cell
    # (8.2, 12.3), far too small to matter visually and an instant failure of
    # `check_dungeon_playable.py`, which requires regions == 1 and does not care how small the
    # extra one is. A guard that answers a different question from the gate is not a guard.
    #
    # Reducing first is also ~4x less work than eroding the lattice, so the bake got faster.
    Ww = max(1, int(round(rock.shape[1] * PX / px)))
    Hw = max(1, int(round(rock.shape[0] * PX / px)))
    small = np.asarray(Image.fromarray((~rock).astype(np.float32), "F")
                       .resize((Ww, Hw), Image.Resampling.BOX)) >= 0.5
    lab, n = ndimage.label(ndimage.distance_transform_edt(small) >= HERO_CLEARANCE_PX)
    if n == 0:
        return 0, 0
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    return n, int(sizes.max()) * (px / PX) ** 2         # report in LATTICE px, as callers expect


def _no_worse(before: tuple[int, int], after: tuple[int, int], px: float) -> bool:
    """Did this edit avoid making the floor less playable than it already was?

    NOT "is the floor perfect". Asking for perfection as a PRECONDITION is what silently disabled
    this whole pass on coastalReef-f1 -- the field at this stage has not had its prop pockets
    carved yet, so it legitimately carries a few isolated specks, and demanding one region meant
    the function returned untouched and the floor shipped 12 all-shadow patches. The invariant that
    actually protects the player is RELATIVE: never add a disconnection, never eat the main region.
    """
    slack = 2.0 * px * px                               # two cells of give: thickening costs floor
    return after[0] <= before[0] and after[1] >= before[1] - slack


def thicken_shadow_walls(fw: np.ndarray, px: float,
                         protected: np.ndarray | None = None) -> np.ndarray:
    """Give every VISIBLE all-shadow wall patch a lit top, by thickening it or removing it.

    CONVERGE IN `fw`, NOT IN THE BOOLEAN PROXY. `_treat_shadow_patches` reasons about `rock`, a
    hard `fw < 0.5`, but it may not WRITE a hard edge -- the result is feathered back into `fw` as
    a blurred +-0.60 delta, because a stamped boundary would be mechanical in a picture whose
    whole point is that its boundaries are not. For a thin sliver those two do not agree: the
    blur spreads the delta over the sliver's own width, so the field it hands back can still be
    under 0.5 where the boolean pass was certain it had opened floor.

    That is exactly how the last patches survived. Measured on sunkenCellar-f1: the inner pass
    finished believing zero patches remained, `_no_worse` said both of the survivors were safe to
    remove, and they were still there in the returned field at their original size -- never
    re-examined, because nothing looked again after the feathering.

    So the inner pass runs until the field it PRODUCES is clean, or until it stops improving.
    `base` is measured once, here, so every edit in every round is judged against the floor we
    started with rather than against the previous round's output.
    """
    base = _passable(fw < 0.5, px)
    gate = _passable_field(fw, px)              # the verdict, measured as the gate measures it
    prev = None
    for _ in range(PATCH_PASSES):
        before = fw
        fw, remaining = _treat_shadow_patches(fw, px, base, protected)
        # RE-CHECK CONNECTIVITY ON THE FIELD THE ROUND ACTUALLY PRODUCED, not on the boolean it
        # validated. `_no_worse` inside the round is applied to `cand`, a hard `fw < 0.5`; what
        # the round then WRITES is a blurred +-0.60 delta whose own 0.5 crossing is wider than
        # that boolean. So a round can pass every check it makes and still hand back a field that
        # is pinched somewhere the boolean was clear.
        #
        # That is not hypothetical: mistyGrotto-f3 arrived here as ONE region, every edit in the
        # round was approved, and the field that came out had TWO -- the second a 0.00-cell speck.
        # It was diagnosed twice as a pre-existing artefact and it was neither; the pass made it.
        # A guard that inspects a proxy of the output guards nothing.
        if not _no_worse(gate, _passable_field(fw, px), px):
            return before
        if remaining == 0 or (prev is not None and remaining >= prev):
            break
        prev = remaining
    return fw


def _treat_shadow_patches(fw: np.ndarray, px: float, base: tuple[int, int],
                          protected: np.ndarray | None = None) -> tuple[np.ndarray, int]:
    """One round. Returns the new field and how many visible patches are left IN it.

    `protected` is rock this pass may THICKEN but must not REMOVE. `seal_floor_specks` needs it:
    the rock it writes to close an unreachable pocket is, by construction, a sub-cell blob that
    cannot carry a lit top, so this pass identified it as an unsupportable lobe and deleted it --
    which re-opened the pocket and put the floor back to two regions. The two passes simply undid
    each other, once each, every round.

    Thickening is deliberately still allowed, and is usually what happens: the seal sits against
    existing rock, so there is something to grow it into, and the result carries a lit top like
    any other wall instead of surviving as a dark speck.
    """
    need = 2 * max(2, int(px * FACE_H_CELLS))
    keep = max(1, int(px * MIN_CORRIDOR_CELLS))
    min_patch = MIN_SHADOW_PATCH_CELLS * px * px
    min_w = MIN_SHADOW_PATCH_W_CELLS * px
    min_h = MIN_SHADOW_PATCH_H_CELLS * px
    rock = fw < 0.5
    start = rock.copy()

    # THICKEN WHAT CAN BE THICKENED, REMOVE WHAT CANNOT, AND REPEAT UNTIL NOTHING VISIBLE IS LEFT.
    #
    # Removal used to be a single pass after the thicken loop, and a single pass is not enough:
    # taking the lobe off the end of a mass shortens the column that was standing behind it, so an
    # equivalent lobe reappears one step along. Measured on the three shipped sunkenCellar floors,
    # one pass left 4 of 87 patches alive AT THEIR ORIGINAL SIZE AND POSITION -- treated, and no
    # better for it.
    #
    # THICKENING RUNS TO CONVERGENCE BEFORE ANY REMOVAL, and the order is not cosmetic. Measured
    # on sunkenCellar: interleaving the two -- removing a patch the moment one thicken attempt
    # failed -- ended at 5 visible patches and 10.9 cells of shadow, against 4 and 8.8 for
    # thicken-first. Removal is the destructive remedy AND the self-propagating one, so a patch
    # that merely needs another round of thickening must never be handed to it. This is also the
    # owner's own order: "remove them or merge them into bigger walls" -- merging is preferred,
    # removal is the fallback.
    #
    # Bounded, and every edit still has to clear `_no_worse`. The worst case is that it stops with
    # a patch it could not afford to fix -- never that it eats a floor.
    for _ in range(PATCH_PASSES):
        lab, n = ndimage.label(_shadow_only(rock, need), np.ones((3, 3)))
        if n == 0:
            break
        sizes = np.bincount(lab.ravel())
        sizes[0] = 0
        targets = _visible_patches(lab, sizes, min_patch, min_w, min_h)
        if not len(targets):
            break
        # BATCH FIRST, ONE PATCH AT A TIME ONLY IF THE BATCH FAILS.
        #
        # `_passable` runs a distance transform over the whole lattice (~7M px), and paying it
        # once per patch per round is what made this pass the dominant cost of a bake: a floor
        # carrying twenty patches over several rounds pays it hundreds of times, and a 12-floor
        # bake stopped finishing in a sitting.
        #
        # The batch attempt costs ONE check and succeeds on nearly every round. The per-patch path
        # below is kept verbatim for the rounds where it does not, which preserves the property it
        # was written for: a single awkward patch must not veto a whole floor -- coastalReef-f1
        # came back 12 patches in, 12 out, because one of its twelve could not be thickened
        # without pinching a corridor.
        changed = False
        cand = rock.copy()
        # NOT `any(... for ...)`: a generator short-circuits on the first True and the remaining
        # patches never get grown at all. The list is materialised so every patch is attempted.
        if any([_grow_patch(cand, rock, lab, t, need, keep) for t in targets]) \
                and _no_worse(base, _passable(cand, px), px):
            rock = cand
            changed = True
        else:
            for tgt in targets:
                cand = rock.copy()
                if _grow_patch(cand, rock, lab, tgt, need, keep) \
                        and _no_worse(base, _passable(cand, px), px):
                    rock = cand
                    changed = True
        if not changed:
            break

    # Only now, what thickening could not support. This loop converges too, for the reason in the
    # block comment above: taking a lobe off the end of a mass shortens the column behind it, so a
    # single pass leaves an equivalent lobe one step along -- 4 of the 87 sunkenCellar patches
    # survived the old single pass at their ORIGINAL size and position.
    for _ in range(PATCH_PASSES):
        lab, n = ndimage.label(_shadow_only(rock, need), np.ones((3, 3)))
        if n == 0:
            break
        sizes = np.bincount(lab.ravel())
        sizes[0] = 0
        targets = _visible_patches(lab, sizes, min_patch, min_w, min_h)
        if protected is not None and len(targets):
            targets = np.array([t for t in targets if not (protected & (lab == t)).any()],
                               dtype=np.int64)
        if not len(targets):
            break
        # Removal opens floor, which sounds unconditionally safe and is not: opening a pocket the
        # heroine's clearance could not previously enter can ADD a passable region that connects
        # to nothing, and `_no_worse` counts regions. So it is checked -- batched, then per patch.
        changed = False
        cand = rock.copy()
        for tgt in targets:
            cand[lab == tgt] = False
        if _no_worse(base, _passable(cand, px), px):
            rock = cand
            changed = True
        else:
            for tgt in targets:
                cand = rock.copy()
                cand[lab == tgt] = False
                if _no_worse(base, _passable(cand, px), px):
                    rock = cand
                    changed = True
        if not changed:
            break

    added = rock & ~start
    dropped = start & ~rock
    if added.any() or dropped.any():
        # Feathered, so the new boundary carries the same soft transition every other one does.
        soft = px * 0.08
        fw = fw - blur(added.astype(np.float32), soft) * 0.60
        fw = fw + blur(dropped.astype(np.float32), soft) * 0.60
        fw = np.clip(fw, 0.0, 1.0).astype(np.float32)
    return fw, _count_visible(fw, px, need, min_patch, min_w, min_h)


def _count_visible(fw: np.ndarray, px: float, need: int,
                   min_patch: float, min_w: float, min_h: float) -> int:
    """Visible all-shadow patches in the FIELD -- the thing the picture is drawn from."""
    lab, n = ndimage.label(_shadow_only(fw < 0.5, need), np.ones((3, 3)))
    if n == 0:
        return 0
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    return len(_visible_patches(lab, sizes, min_patch, min_w, min_h))


def floor_field(rows: list[str], scale: int = 1, assets: list | None = None) -> Field:
    rows, pruned = prune_thin_walls(rows)
    if pruned:
        print(f"  pruned {len(pruned)} wall cell(s) too shallow for the face band: "
              + ", ".join(f"({x},{y})" for y, x in sorted(pruned)[:12])
              + (" ..." if len(pruned) > 12 else ""))
    px_world = max(1, PX // scale)
    ch, cw = len(rows), len(rows[0])
    Ww, Hw = cw * px_world, ch * px_world

    # Author the MASTER on the locked lattice, not at world resolution. Every detail below is a
    # function of the world coordinate, so raising the sampling rate genuinely adds detail rather
    # than interpolating it — this is an authored master in the sense the lock requires, not an
    # upscale of a lower-resolution image.
    W = int(round(Ww * LATTICE_SCALE))
    H = int(round(Hw * LATTICE_SCALE))
    px = W / cw                                   # ~85.5 lattice px per cell; deliberately float

    solid = np.array([[1.0 if c == "#" else 0.0 for c in r] for r in rows], np.float32)

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

    # Floor weight at master resolution. Indexed rather than np.repeat'd because the lattice cell
    # size is fractional (85.5) and np.repeat only takes whole counts.
    cx = np.minimum((xx / px).astype(np.int64), cw - 1)
    cy = np.minimum((yy / px).astype(np.int64), ch - 1)
    up = 1.0 - solid[cy, cx]
    del cx, cy
    f = blur(up, px * 0.34)

    # Warp the boundary, GATED by 4f(1-f) (method rule 2). Ungated, an amplitude big enough to
    # interlock the edge also lifts the weight far from any boundary and throws floor blotches
    # into solid rock.
    warp = (fbm(xx, yy, px * 2.6, 11) - 0.5) * 2.0
    gate = np.clip(4.0 * f * (1.0 - f), 0.0, 1.0)
    fw = np.clip(f + warp * 0.42 * gate, 0.0, 1.0)
    fw = drop_rock_islands(fw, px)

    # ── Props stand in TRUE terminal cells — one way in, rock on the other three sides. Both the
    #    mask blur and the boundary warp pull the floor weight at such a cell below the 0.5
    #    threshold, so the cell renders as rock and the chest standing on it looks embedded in the
    #    wall. The layout is authoritative and the render is not: carve a floor pocket that
    #    guarantees the cell the generator placed. Reads as an alcove, which is what it is.
    prot = np.zeros((H, W), np.float32)
    if assets:
        # Biased UPWARD and slightly taller than wide: a prop sprite is drawn standing, with its
        # feet near the cell's bottom edge and its head above the cell centre, so a pocket centred
        # on the cell leaves the top half of the sprite over rock.
        # THE POCKET MUST SCALE WITH HOW BIG THE PROP DRAWS (owner, 2026-08-01: the top-left chest
        # is "still touching the wall severely").
        #
        # It was a flat 0.80 cells for every prop. The smoothstep only reaches the 0.5 transfer
        # midpoint at HALF that radius — 0.40 cells — while a sprite is 0.86 cells across TIMES
        # its PROP_CELLS entry. So the pocket never covered even a 1.0-cell chest's corners, and
        # for the bigger props it was hopeless: measured through the renderer's own field, rock
        # under the sprite ran 7.3% on a chest, 15.8% on stairsUp (1.5 cells) and 19.8% on save
        # (1.3 cells). Counting neighbouring CELLS could not see any of it.
        #
        # Radius needed so the >=0.5 region reaches a sprite's half-diagonal:
        #     r = 2 * (0.86 * cells * sqrt(2)/2) ~= 1.22 * cells
        # Capped at 1.9 cells so the boss's 2.2 does not gouge a crater; it stands in an arena, so
        # there is no rock within reach for the pocket to remove anyway (measured 2.8%).
        #
        # EXCLUDES `mouth` and any onWall prop. A cave mouth is an arch IN the rock and a plaque is
        # mounted ON it — carving floor under those deletes the thing they are.
        for it in assets:
            if it["kind"] == "mouth" or it.get("onWall"):
                continue
            r = px * min(1.22 * PROP_CELLS.get(it["kind"], 1.0), 1.9)
            d = np.sqrt((xx - (it["x"] + 0.5) * px) ** 2
                        + ((yy - (it["y"] + 0.38) * px) / 1.18) ** 2)
            t = np.clip(1.0 - d / r, 0.0, 1.0)
            prot = np.maximum(prot, t * t * (3.0 - 2.0 * t))       # smoothstep, not a hard disc
        fw = np.maximum(fw, prot)

    # THE POCKETS ARE CARVED BEFORE THE SHADOW PASS LOOKS, AND RE-ASSERTED AFTER IT.
    #
    # They used to be carved after it, and carving floor into the side of a mass shortens the rock
    # columns beside the pocket -- which manufactures exactly the all-shadow wall end this pass
    # exists to remove, at a point where the pass has already finished. That is where the last
    # survivor on sunkenCellar-f3 came from: a 21 x 89 px lobe at cell (11.7, 19.7), sitting
    # inside the pocket of the `save` prop at (11, 21).
    #
    # Ordering it this way means the pass sees the geometry the player will actually stand in. The
    # second `maximum` is what keeps the pockets non-negotiable: thickening may not close one, so
    # whatever the pass decided, the prop still gets the cell the layout gave it.
    # SEALING RUNS BEFORE THE SHADOW PASS, NOT AFTER IT. Sealing writes ROCK, and rock written
    # after the shadow pass has finished is rock nothing will ever check -- mistyGrotto-f3 came
    # back with its region count fixed and a fresh all-shadow lobe standing on the seal, trading
    # one defect for the other. Running it first means `thicken_shadow_walls` treats whatever the
    # seal creates, and its `_no_worse` guard then holds the region count at the sealed value,
    # so neither pass can undo the other.
    fw, sealed = seal_floor_specks(fw, px, prot if assets else None)
    fw = thicken_shadow_walls(fw, px, sealed)
    if assets:
        fw = np.maximum(fw, prot)

    return Field(fw=fw, prot=prot, xx=xx, yy=yy, px=px, W=W, H=H, Ww=Ww, Hw=Hw, cw=cw, ch=ch)


def walkable_mask(rows: list[str], assets: list | None = None) -> Image.Image:
    """The floor mask, at the shipped art's OWN resolution (48 px per cell, one sample per world
    pixel), thresholded at the same 0.5 the renderer draws the boundary with.

    WHY THIS RESOLUTION AND NOT A COARSER ONE. The blocker exists so it cannot disagree with the
    visible edge; any sub-cell grid coarser than the picture reintroduces exactly the quantisation
    this replaces, just with a smaller square. 48/cell costs ~30 kB a floor as a 1-bit PNG.

    WHY THE FIELD IS REDUCED BEFORE IT IS THRESHOLDED. `render()` reduces its master to world
    resolution with an area-weighted filter, so a world pixel's colour is the AVERAGE of the
    master pixels under it. Area-averaging `fw` and then testing 0.5 asks the same question the
    picture answers: does this world pixel come out mostly floor or mostly rock. Thresholding
    first and reducing after would decide the edge at master resolution and then blur the
    decision, which is a different (and slightly wider) boundary.
    """
    fld = floor_field(rows, 1, assets)
    small = Image.fromarray(fld.fw, "F").resize((fld.Ww, fld.Hw), Image.Resampling.BOX)
    return Image.fromarray(
        ((np.asarray(small) >= 0.5) * 255).astype(np.uint8)).convert("1")


def render(rows: list[str], mats: dict, theme: str, scale: int = 1,
           assets: list | None = None, props: bool = False,
           hero: tuple | None = None) -> Image.Image:
    fld = floor_field(rows, scale, assets)
    fw, prot, xx, yy = fld.fw, fld.prot, fld.xx, fld.yy
    px, W, H, Ww, Hw = fld.px, fld.W, fld.H, fld.Ww, fld.Hw

    # Crisp transfer: a cave wall meets the floor over a few pixels, not a soft airbrush.
    a = np.clip((fw - 0.5) * 34.0 + 0.5, 0.0, 1.0)

    # A generated material is only 531px — about 11 cells at 48px/cell — so on any real floor its
    # repeat draws a visible grid of identical cobbles. Offsetting the sample point by a very slow
    # noise field breaks the loop without touching the material or costing a generation.
    # Superseded by sample_patched(). A slow domain offset hid a SOFT material's repeat, but it
    # only slides a high-detail one around — the repeat and the wrap seam both survive it.
    ox = fbm(xx, yy, px * 26.0, 91) * 210.0
    ndc = fbm(xx, yy, px * 26.0, 92) * 210.0

    tgt = TARGET.get(theme, TARGET["root-riddled earth cave"])
    floor_m = grade(mats["floor"], tgt["floor"])
    wall_m = grade(temper(mats["wall"]), tgt["wall"])
    ftex, fcrack = sample_patched(floor_m, xx, yy, px, 91, patch=5.0)
    wtex, wcrack = sample_patched(wall_m, xx, yy, px, 41, patch=4.0)
    img = ftex * a[..., None] + wtex * (1 - a[..., None])
    # The joint reads as a crack in the stone. Deeper in rock than on the floor, because a floor
    # crack is a hairline and a rock joint is a crevice with shadow in it.
    joint = fcrack * a + wcrack * (1.0 - a)
    img *= (1.0 - (0.04 + 0.56 * (1.0 - a)) * joint)[..., None]

    # ── Macro layer: LIGHTING, not relief. `depth` is distance from the nearest wall, free from
    #    the blurred mask, and it drives both the ambient occlusion at the wall foot and the
    #    pooling of light in the open middle of a chamber.
    depth = blur(np.clip(fw, 0, 1), px * 1.5)
    # A prop pocket is a tight alcove, so raw AO buries it: measured 60-80 against 115 for open
    # floor, which is close enough to rock that the chest still looked embedded. Light the pocket
    # as if it were open. It is also where the player most needs to see the floor.
    ao = np.clip(np.maximum(depth * 2.1, prot * 0.95), 0.0, 1.0)   # 0 against a wall, 1 deep inside
    pool = 0.72 + 0.55 * np.clip(blur(np.clip(fw, 0, 1), px * 4.0), 0, 1)
    lamp = 0.88 + 0.24 * fbm(xx, yy, px * 22.0, 5)            # slow unevenness, never repeating
    light = (0.42 + 0.58 * ao) * pool * lamp

    # ── STEPPED CEL SHADING, not a continuous ramp (ART-DIRECTION.md: "2-4 tones per hue",
    #    "crisp faux-pixel material detail"). Measured against the props and the heroine, a
    #    smoothly-lit background carries 3-8x LESS edge energy than they do, so the two read as
    #    different media even once their pixel density matches exactly. Quantising the light into
    #    discrete tones is what puts the environment in the same drawing style as the sprites.
    steps = 5.0
    q = np.floor(light * steps) / steps
    light = q + (light - q) * 0.25          # keep a quarter of the ramp so bands do not posterise
    img *= light[..., None]

    # Material contrast: push each material away from its own mean so the stone has definition
    # rather than tone. A soft material cannot be rescued by lighting alone.
    mean = img.reshape(-1, 3).mean(axis=0)
    img = np.clip(mean[None, None, :] + (img - mean[None, None, :]) * 1.22, 0, 255)

    # ── HEIGHT. The wall was previously a flat region wearing a different texture, which is why
    #    it read as wallpaper rather than as rock you stand beside. Seen from above, a solid needs
    #    three things, and it needs all three: a TOP that catches light, a near FACE turned away
    #    from it, and a SHADOW the mass throws onto the floor. The step from lit top to dark face
    #    to shadowed floor IS the depth cue — no amount of texture detail substitutes for it.
    # 0.70, owner 2026-08-06, chosen off a three-way in-game comparison with the heroine
    # composited in at true scale. At the previous 0.46 the shaded face measured ~22 px while she
    # is 52 px tall above her soles, so her body could not fit inside it and always spilled onto
    # the LIT top -- which is what he saw as "bleeding into the shaded area of the walls seem too
    # much". He named the two levers himself: deepen the shading, or cut the bleed. Deepening wins
    # because more foot clearance narrows the cave (18 px orphans three assets) while a taller
    # face costs no corridor width at all. ~34 px now sits most of her body inside the shade.
    #
    # 0.95, owner 2026-08-06, SECOND pass: "the character's top part still sticks out of the
    # shadow part a bit, which makes it look unnatural so the character needs to fit within the
    # shadow area." MOST of her was not enough -- ALL of her is the requirement, so this is now
    # DERIVED rather than judged, from three measurements:
    #
    #   * her crown stands 55 px above her soles. NOT the 52 px quoted above and in dq-tiles.js:
    #     that figure is from a different row, and the row that matters here is the one you are
    #     actually looking at when she is against a north wall -- NORTH, her back, whose piled
    #     hair makes it the TALLEST of the eight (crown at sprite row 3, soles at 58). Measuring
    #     the wrong row is what left 0.70 three pixels short and would have left 0.85 one short.
    #   * her soles stop A1M_FOOT + A1M_LEAN = 12 + 4 = 16 px short of the junction (dq-tiles.js).
    #   * so her highest pixel over the wall sits 55 - 16 = 39 px above the junction.
    #
    # The band must also clear its OWN top edge, which is blurred over ~3.4 px (px * 0.07 below),
    # or her crown sits in the soft margin rather than the shade. 39 + 3.4 = 43 px minimum.
    #   0.70 -> 33 px   3 px short, the sliver he could see
    #   0.85 -> 40 px   1 px of margin, inside the blur -- not enough
    #   0.95 -> 45 px   6 px clear of her crown and past the blur
    # Raising this again means re-deriving it from those three numbers, not taste. The cost is
    # paid by the lit top, which is why MIN_WALL_DEPTH_CELLS exists: at 45 px a 2-cell mass still
    # keeps 51 px of lit top, and a 1-cell mass has none, so 1-cell masses are pruned.
    face_h = max(2, int(px * FACE_H_CELLS))   # apparent height of the wall's visible face, px
    drop = max(2, int(px * 0.34))       # how far its shadow reaches out across the floor

    wall = 1.0 - a
    face = blur(np.clip(wall * shift(a, face_h), 0.0, 1.0), px * FACE_BLUR_CELLS)  # floor is south
    cast = blur(np.clip(a * shift(wall, -drop), 0.0, 1.0), px * 0.20)    # wall lies north of it
    top = np.clip(wall - face, 0.0, 1.0)

    img *= (1.0 + 0.34 * top)[..., None]      # the rock top is the lit plane
    img *= (1.0 - 0.60 * face)[..., None]     # its near face falls away
    img *= (1.0 - 0.58 * cast)[..., None]     # and drops a shadow onto the floor

    # ── The wall base: its OWN opaque band (method rule 4). Not a blend — a band of rubble drawn
    #    over whatever is behind it, sitting just inside the floor and extending back under the
    #    wall so nothing pokes out from under it.
    #    The profile is ASYMMETRIC on purpose. A symmetric band fades on both sides and reads as
    #    a glowing halo tracing the floor rather than as a base the wall stands on. Rule 4 wants a
    #    crisp INNER edge — the band stops abruptly where the floor begins, and only its outer
    #    side dies away under the wall.
    #
    #    THE CODE USED TO DO THE EXACT OPPOSITE OF THAT PARAGRAPH, and that — not the lighting,
    #    not the mask blur, not the material — is what made every non-south rock edge read fuzzy
    #    (owner, 2026-08-04: "the other sides are fuzzy and don't look natural").
    #    `outer`, the ROCK side, carried the 0.02 hard stop; `inner`, the FLOOR side, carried a
    #    0.10 fade. Measured through this renderer's own field, 0.10 of `fw` is 8 OUTPUT PIXELS:
    #    the band did not stop where the floor begins, it airbrushed a low-contrast mid-tone over
    #    the first 8 px of floor around every wall, at 57-62% opacity, washing out the floor's own
    #    cobble detail exactly where the eye looks for the boundary. Rock and floor were then
    #    joined by a smooth monotonic ramp with no step anywhere in it.
    #    On the SOUTH side that smear is invisible because it sits inside `cast`, which is why the
    #    south was the one side the owner liked. Nothing else about the south changes here.
    #
    #    Giving `inner` the hard stop the paragraph always asked for takes the 10-90% luminance
    #    transition across the boundary from 6.6/6.2/6.8 px (W/E/N) to 3.4/3.4/3.5 px, which is
    #    the material edge itself — as crisp as this lattice can resolve. It is also as crisp as
    #    deleting the band outright (3.6/3.4/3.2) while KEEPING the base, so rule 4 still holds
    #    and `wet` below still has a band to be pushed off the wall foot by.
    #    Strictly edge-local: mean |delta| is 19 in the 4-6 px contact strip, 0.5 at 12-16 px and
    #    0.05 beyond 24 px; floor more than 12 px from any wall moves by -0.00 luminance and the
    #    rock by +0.03. `fw` is not touched, so the organic silhouette is bit-identical.
    inner = np.clip((0.555 - fw) / 0.015, 0.0, 1.0)     # HARD stop where the floor begins
    outer = np.clip((fw - 0.50) / 0.02, 0.0, 1.0)       # hard stop AT the rock, never inside it
    band = inner * outer
    band *= np.clip(0.45 + 0.55 * fbm(xx, yy, px * 1.1, 23), 0, 1)   # ragged, not a drawn line
    rub = grade(mats["rubble"], tuple(int(v * 0.42) for v in tgt["floor"]))
    rtex, _ = sample_patched(rub, xx, yy, px, 63, patch=3.5)
    img = img * (1 - band[..., None]) + rtex * band[..., None]

    # ── STANDING WATER. The `accent` material was loaded and never splatted, so a dungeon whose
    #    entire premise is that it is flooded had not one drop of water in it. Pools gather where
    #    the floor opens out, in irregular patches — never as a uniform sheet, and never climbing
    #    the wall base, which is the one place the eye checks.
    #    `depth` alone puts water against the walls, because the blurred mask peaks in the middle
    #    of a PASSAGE as readily as a chamber. Gating on the low-frequency field FIRST and using
    #    depth only to keep pools off the wall foot is what makes them sit in the open.
    pooln = fbm(xx, yy, px * 5.0, 41)
    wet = np.clip((pooln - 0.56) / 0.09, 0.0, 1.0) * np.clip((depth - 0.42) / 0.30, 0.0, 1.0) * a
    wet = blur(np.clip(wet - band * 1.4, 0.0, 1.0), px * 0.09)

    wat = grade(mats["accent"], WATER.get(theme, WATER["flooded stone cellar"]))
    # A cheap but convincing reflection: what stands a little to the north shows in the surface.
    refl = shift(img, -max(1, int(px * 0.55))) * 0.26
    img = img * (1 - wet[..., None]) + (sample(wat, xx + ox, yy + ndc) * 0.62 + refl) * wet[..., None]

    # The rim has to be a THIN line at the waterline. Taken as a band of the coverage value it
    # spreads across the whole pool and turns it into milky ice; taken as the edge of the blurred
    # coverage it stays a rim. The glint is what then reads as a surface rather than a blue floor.
    rim = np.clip(blur(wet, px * 0.20) - wet, 0.0, 1.0) * 1.5
    glint = np.clip(fbm(xx, yy, px * 0.85, 57) - 0.66, 0.0, 1.0) * wet * 1.2
    img += (rim + glint)[..., None] * np.array([40.0, 54.0, 60.0], np.float32)[None, None, :]

    # ── The bold dark outline the style block calls for, exactly at the rock/floor junction. It
    #    is the single strongest thing that makes the environment sit with the outlined sprites.
    edge = np.clip(1.0 - np.clip(fw - 0.5, 0.0, None) / 0.075, 0.0, 1.0) * a \
        + np.clip(1.0 - np.clip(0.5 - fw, 0.0, None) / 0.030, 0.0, 1.0) * (1.0 - a) * 0.55
    edge *= np.clip(0.55 + 0.45 * fbm(xx, yy, px * 0.9, 31), 0, 1)   # hand-drawn, not a stroke
    img *= (1.0 - 0.42 * edge)[..., None]

    # ── FLOOR GRAIN. A flat field is fine at map zoom and empty at walking zoom, which is the
    #    zoom the game actually runs at. A sparse scatter of the rubble material breaks it up
    #    without ever resolving into a pattern. Dry floor only — it would float on the water.
    #    At the lattice density a single-octave scatter resolves into evenly spaced pebbles — a
    #    polka dot, not grain. A fine octave CLUMPED by a coarse one gathers the debris into
    #    drifts the way it actually falls.
    spec = np.clip((fbm(xx, yy, px * 0.17, 67) - 0.64) * 3.4, 0.0, 1.0)
    spec *= np.clip((fbm(xx, yy, px * 1.9, 68) - 0.36) * 2.2, 0.0, 1.0)
    spec = spec * a * (1.0 - wet) * 0.60
    img = img * (1 - spec[..., None]) + rtex * spec[..., None]

    # ── Deterministic lattice + palette reduction, exactly as the Port Sapphire region builders
    #    do it (`build_act1_*_lattices.py`): LANCZOS down to world resolution, then MEDIANCUT to
    #    192 colours with NO dither. The reduction is what puts the pixel grain on the same
    #    footing as the heroine and the props; dithering would reintroduce single-pixel noise
    #    finer than the lattice and undo it.
    master = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert("RGBA")

    # ── Props and hero go on the MASTER, not on the reduced image. Compositing after the
    #    reduction was the density mismatch: the background had been through LANCZOS + a
    #    192-colour MEDIANCUT, while a prop arrived as a smooth 24-bit thumbnail that had been
    #    resampled from ~350px straight down to 41px. Two different finishes in one picture.
    #    Put everything on the master and reduce ONCE and they cannot disagree — same lattice,
    #    same palette, by construction.
    # ── Draw order IS the occlusion rule (owner, 2026-08-01).
    #
    #    "The treasure boxes are overlayed on top of the walls." They were: props went on last, so
    #    anything reaching past its cell was painted over the rock. Choosing roomier terminals in
    #    the generator cut the chests walled on 6+ sides from 29 to 9, but a dead end is enclosed
    #    by construction and no placement can finish the job.
    #
    #    The owner already settled the rule for the hero — she may seep into the wall's SHADED
    #    BASE and must be HIDDEN BEHIND its CRISP TOP — and `top` above is precisely that lit
    #    plane. So props and hero are drawn, then the rock top is composited back over them: an
    #    object may sit into the shaded base at the wall's foot, and is cut off by the rock face
    #    it is standing behind. Collision is unaffected; this is purely what is drawn on top.
    #
    #    ON-WALL props are the exception and go AFTER the occluder. A plaque is MOUNTED on the
    #    rock and the cave mouth is an opening THROUGH it — occluding those would erase them.
    on_wall = [a for a in (assets or []) if a.get("onWall")]
    in_room = [a for a in (assets or []) if not a.get("onWall")]
    if assets and props:
        paste_props(master, in_room, px)
    if hero is not None:
        paste_hero(master, hero, px)
    if (assets and props) or hero is not None:
        alpha = np.clip(top, 0.0, 1.0)

        # A PROP IS NEVER OCCLUDED ON ITS OWN CELL (owner, 2026-08-01: the top-left chest "is
        # behind the wall now").
        #
        # The floor/rock boundary is deliberately warped and blurred, so `top` carries weight a
        # little way INSIDE a floor cell that borders rock. On an open floor that is invisible;
        # on the one cell where a prop is standing it sliced the chest vertically — and the rock
        # doing the slicing was WEST of it, beside it rather than in front, so the cut read as
        # the chest being buried rather than as depth.
        #
        # Its own cell is floor by definition, so exempting it cannot put a prop back on top of a
        # wall: it only stops the boundary's soft edge from eating the object standing there.
        # Anything reaching BEYOND that cell is still cut, which is the whole point.
        for a in (in_room if (assets and props) else []) + (
                [{"x": hero[0], "y": hero[1]}] if hero is not None else []):
            x0, x1 = int(a["x"] * px), int((a["x"] + 1) * px)
            y0, y1 = int(a["y"] * px), int((a["y"] + 1) * px)
            alpha[max(0, y0):min(H, y1), max(0, x0):min(W, x1)] = 0.0

        occl = np.dstack([np.clip(img, 0, 255).astype(np.uint8),
                          (alpha * 255).astype(np.uint8)])
        master.alpha_composite(Image.fromarray(occl, "RGBA"))
    if assets and props and on_wall:
        paste_props(master, on_wall, px)

    # NO palette quantisation. Measured on the art the Act-1 runtime actually loads,
    # `public/act1-hifi/chunks/base/*.png` carry 14,672-57,627 colours — they are full continuous
    # tone. The overworld's chunky look comes ENTIRELY from the 3.69x nearest-neighbour camera at
    # runtime, not from any palette reduction. Quantising here to 192 made the dungeon flatter
    # than the world it sits in (run-continuity 0.210 against the overworld's 0.023-0.067).
    # The 192-colour MEDIANCUT in `build_act1_*_lattices.py` belongs to the region-overlay path,
    # which is not what the runtime draws.
    return master.convert("RGB").resize((Ww, Hw), Image.Resampling.LANCZOS)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--floor", required=True, help="floor id, e.g. sunkenCellar-f3")
    ap.add_argument("--materials", help="directory of mat-*.png; omit with --placeholder")
    ap.add_argument("--placeholder", action="store_true",
                    help="procedural stand-in materials, to prove the render before generating")
    ap.add_argument("--scale", type=int, default=1,
                    help="PREVIEW ONLY. 1 = full 48px/cell and the only shippable value; 2 = half, "
                         "which the game then blows back up 4x with nearest-neighbour "
                         "(pixelArt: true, ZOOM>=2) into visible blocks. Never review art at >1.")
    ap.add_argument("--props", action="store_true",
                    help="composite the prop sprites onto the MASTER, before reduction")
    ap.add_argument("--hero", help="X,Y cell to stand the heroine on, for scale review")
    ap.add_argument("--allow-stale", action="store_true",
                    help="render onto materials that are not verifiably current (says so loudly)")
    ap.add_argument("--emit-mask", action="store_true",
                    help="write the WALKABLE MASK instead of the picture: the same floor field, "
                         "the same 0.5 threshold, at 48 px/cell. Reads no materials.")
    ap.add_argument("--out")
    args = ap.parse_args()

    path = os.path.join(DIR, f"{args.floor}.json")
    if not os.path.exists(path):
        raise SystemExit(f"no such floor: {path}")
    fl = json.load(open(path))
    theme = fl["theme"]

    if args.emit_mask:
        # No materials are read, so there is nothing to be stale against: the mask is a function
        # of the floor JSON and this file alone. prov records exactly that.
        img = walkable_mask(fl["rows"], fl.get("assets"))
        out = args.out or os.path.join(DIR, f"{args.floor}-walk.png")
        img.save(out, optimize=True)
        prov.stamp(out, inputs=[path], generator=__file__, params={"kind": "walkable-mask"})
        open_px = int(np.asarray(img).sum())
        print(f"{fl['id']}  {fl['width']}x{fl['height']} cells  ->  {img.size[0]}x{img.size[1]} "
              f"mask px, {100.0 * open_px / (img.size[0] * img.size[1]):.1f}% walkable")
        print(f"wrote {os.path.relpath(out, ROOT)}")
        return

    if args.placeholder:
        mats = placeholder_materials(theme)
    else:
        mdir = args.materials or os.path.join(MATROOT, fl["dungeonId"])
        # A material replaced without being stamped is exactly the 2026-08-01 08:27 failure, and
        # it is cheapest to catch here — before spending ten minutes rendering onto it.
        prov.require_fresh(*sorted(glob.glob(os.path.join(mdir, "mat-*.png"))),
                           allow_stale=args.allow_stale)
        mats = load_materials(mdir)

    hero = None
    if args.hero:
        hero = tuple(int(v) for v in args.hero.split(","))
    img = render(fl["rows"], mats, theme, args.scale, fl.get("assets"), args.props, hero)
    out = args.out or os.path.join(DIR, f"{args.floor}-material"
                                        f"{'-placeholder' if args.placeholder else ''}.png")
    img.save(out)

    # Record what this render was actually made FROM. Without this a material can be replaced
    # underneath every floor — as mat-wall.png was at 08:27 on 2026-08-01 — and nothing
    # downstream can tell. The generator's own hash goes in too, because `temper()` and the
    # TARGET table are inputs as surely as the PNGs are.
    inputs = [path] + ([] if args.placeholder
                       else [os.path.join(mdir, f"mat-{m}.png") for m in sorted(mats)
                             if os.path.isfile(os.path.join(mdir, f"mat-{m}.png"))])
    prov.stamp(out, inputs=inputs, generator=__file__,
               params={"theme": theme, "scale": args.scale, "props": bool(args.props),
                       "hero": args.hero, "placeholder": bool(args.placeholder)})

    print(f"{fl['id']}  {fl['width']}x{fl['height']} cells  ->  {img.size[0]}x{img.size[1]}px")
    print(f"theme: {theme}")
    print(f"wrote {os.path.relpath(out, ROOT)}")


if __name__ == "__main__":
    main()
