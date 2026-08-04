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


def floor_field(rows: list[str], scale: int = 1, assets: list | None = None) -> Field:
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
    face_h = max(2, int(px * 0.46))     # apparent height of the wall's visible face, in pixels
    drop = max(2, int(px * 0.34))       # how far its shadow reaches out across the floor

    wall = 1.0 - a
    face = blur(np.clip(wall * shift(a, face_h), 0.0, 1.0), px * 0.07)   # floor lies south of it
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
