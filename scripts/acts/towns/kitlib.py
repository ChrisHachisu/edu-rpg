"""Shared helpers for the Acts 2-5 town kitbash pipeline.

Everything here is deterministic numpy/PIL. No image generation: every pixel of an Acts 2-5 town
plate is an Act 1 plate pixel (re-composed, then re-graded), so the new towns share the Act 1 hand,
scale and lattice by construction.

Geometry contract (identical to public/act1-hifi/town/*-town.json):
  plate 1950 x 1950 art px, 65 x 65 cells, 30 art px / cell, 16 world px / cell (world 1040).
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
HERE = os.path.dirname(os.path.abspath(__file__))
ACT1_TOWN = os.path.join(ROOT, "public/act1-hifi/town")
ACT1_DESIGN = os.path.join(ROOT, "design/act1-towns")
SCRATCH = os.environ.get(
    "TOWNS_SCRATCH",
    "/tmp/claude-0/-home-claude/c446ac0c-2689-576d-8fff-6176ff6d9aad/scratchpad/acts/towns")
PREVIEW = os.environ.get("TOWNS_PREVIEW", "/mnt/project-files/edu-rpg/acts-preview/towns")

PLATE = 1950
CELLS = 65
APC = 30          # art px per cell
WPC = 16          # world px per cell
WORLD = CELLS * WPC


def load_rgb(path):
    return np.asarray(Image.open(path).convert("RGB")).astype(np.float32)


def hsv(a):
    """a: float HxWx3 0..255 -> hue deg, sat 0..1, val 0..255, luminance."""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(2), a.min(2)
    d = mx - mn + 1e-6
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    h = np.where(mx == r, ((g - b) / d) % 6,
                 np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    return h, s, mx, lum


def green_mask(a, lum_min=0):
    h, s, v, lum = hsv(a)
    return (h > 50) & (h < 175) & (s > 0.18) & (lum >= lum_min)


def lawn_mask(a):
    """Act 1 sunlit lawn: bright yellow-green (same test as derive_town_walkable.lawn_mask)."""
    h, s, v, lum = hsv(a)
    return (h > 55) & (h < 175) & (s > 0.15) & (lum >= 95)


def paving_mask(a, loose=False):
    """Pale low-saturation cobble (derive_town_walkable.paving_mask), optionally loosened so the
    cobble's own grout and shaded stones count too."""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if not loose:
        return (r > 95) & (np.abs(r - g) < 42) & (b > r * 0.5) & (b < r * 1.25)
    h, s, v, lum = hsv(a)
    return (lum > 62) & (s < 0.30) & (np.abs(r - g) < 40) & (b < r * 1.3)


def poly_mask(shape, polys, offset=(0, 0), value=True):
    h, w = shape
    im = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(im)
    for p in polys:
        d.polygon([(x - offset[0], y - offset[1]) for x, y in p], fill=255)
    return np.asarray(im) > 127


def save_rgba(path, rgb, alpha):
    a = np.clip(alpha * 255, 0, 255).astype(np.uint8) if alpha.dtype != np.uint8 else alpha
    out = np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), a])
    Image.fromarray(out, "RGBA").save(path)


def value_noise(h, w, scale, seed, octaves=1):
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        sc = max(2, int(scale / (2 ** o)))
        n = rng.random((h // sc + 3, w // sc + 3)).astype(np.float32)
        n = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize(
            ((w // sc + 3) * sc, (h // sc + 3) * sc), Image.BICUBIC)).astype(np.float32)[:h, :w] / 255.0
        out += amp * n
        tot += amp
        amp *= 0.5
    return out / tot


def read_json(p):
    with open(p) as f:
        return json.load(f)


def write_json(p, d):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump(d, f, indent=1)
