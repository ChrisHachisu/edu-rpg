#!/usr/bin/env python3
"""Gate a town screen plate on DENSITY, PALETTE and EDGE FINISH — the failable check that
docs/ART-GENERATION-PREFLIGHT.md requires to exist before any generation call is made.

WHY THIS EXISTS
    Owner, build 38: "the resolution is currently fuzzy on the app and i can clearly tell that the
    texture is different from the hero so this needs to be matched in the updated design."

    Both halves of that sentence are now numbers rather than adjectives.

    RESOLUTION. Measured in WebKit on an iPhone 13, 2026-08-17: the town view is 208 world px across
    390 CSS px at dpr 3, i.e. 5.625 device px per world px. The shipped plate carries 1885 art px
    over 1040 world px = 1.8125 per world px, so each art pixel was stretched 3.1034x -- NOT a whole
    number, which makes some art pixels 3 device px wide and others 4. Only 14% of 3x3 device-pixel
    blocks were uniform, against 100% for the overworld. That irregularity is the fuzz. A plate at
    1950x1950 (1.875 per world px) lands on an exact 3x instead. `town.html` also snaps the camera
    so today's plate already renders on a whole ratio; the density target is what makes it whole
    without spending 3.4% of the view.

    FINISH. The hero he compares against is drawn with hard pixel steps and the town is painted with
    soft gradients, at the same magnification. Measured on the mean absolute luminance step between
    neighbouring pixels:

        hero  hero-act1-female-walk-8x3-64-g3.png   mean 31.6   p90 73.6   47.5% of pairs >= 24
        town  portSapphire-screen.png (shipped)     mean 11.7   p90 28.9   13.9% of pairs >= 24

    The hero is ~2.7x harder per pixel. That single ratio IS the style gap, and closing it is what a
    redesign buys -- separately from resolution, which is why the two must be gated separately.

    PALETTE is held, not changed: the settled town is bright (luminance 90.1, blue/red 0.674) and
    ART-DIRECTION.md's "dark, dense, deep forest shadows" block is stale for this family -- it
    already cost one full regeneration 25 luminance too dark.

    THE PAVING IS THE COLLISION AUTHORITY. scripts/derive_town_walkable.py thresholds the pale stone
    paving out of this painting to produce the walkable network, so a re-bake that darkens or
    de-saturates the paving silently changes where the player can walk. The paving band is therefore
    gated too, and a failure here is a gameplay failure, not a cosmetic one.

USAGE
    python3 scripts/check_town_finish.py <plate.png> [--world 1040] [--report]
    python3 scripts/check_town_finish.py <plate.png> --anchor public/act1-hifi/hero-g3/<sheet>.png

    Exit 0 = every band met. Exit 1 = at least one miss, named with its number.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# Device geometry, measured -- see the module docstring.
DEVICE_PX_PER_WORLD = 5.625          # 390 CSS px * dpr 3 / 208 world px view
TARGET_ART_PER_WORLD = 1.875         # 5.625 / 3 -> an exact 3x nearest upscale
DENSITY_TOL = 0.004                  # ~4 px on a 1950 plate

# Palette: hold the settled town. Measured on the shipped plate.
LUM_TARGET, LUM_TOL = 90.1, 6.0
BR_TARGET, BR_TOL = 0.674, 0.06

# Finish: reach the hero's neighbourhood. Bands are deliberately wide at the bottom -- the point is
# to leave "painterly", not to become a sprite sheet.
HARD_STEP = 24                       # a "hard" step in luminance between neighbouring pixels
HARD_FRAC_MIN = 0.34                 # shipped plate 0.139, hero 0.475
MEAN_STEP_MIN = 24.0                 # shipped plate 11.7, hero 31.6

# The paving band derive_town_walkable.py keys on. Kept wide; the gate is that ENOUGH of the plate
# still reads as pale paving, not that a specific hue is used.
PAVING_LUM_MIN = 150
PAVING_FRAC_MIN = 0.055              # shipped plate measures ~0.09


def luminance(rgb: np.ndarray) -> np.ndarray:
    return 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]


def steps(lum: np.ndarray, mask: np.ndarray | None = None) -> np.ndarray:
    g = lum if mask is None else np.where(mask, lum, np.nan)
    d = np.concatenate([np.abs(np.diff(g, axis=1)).ravel(), np.abs(np.diff(g, axis=0)).ravel()])
    return d[~np.isnan(d)]


def measure_anchor(path: Path) -> dict:
    a = np.asarray(Image.open(path).convert('RGBA')).astype(float)
    op = a[:, :, 3] > 8
    lum = luminance(a[:, :, :3])
    d = steps(lum, op)
    return {'mean_step': float(d.mean()), 'hard_frac': float((d >= HARD_STEP).mean())}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('plate')
    ap.add_argument('--world', type=float, default=1040.0, help='world px the plate covers')
    ap.add_argument('--anchor', help='hero sheet to report beside the plate (not a gate)')
    ap.add_argument('--report', action='store_true', help='print measurements and exit 0')
    args = ap.parse_args()

    p = Path(args.plate)
    im = Image.open(p).convert('RGB')
    rgb = np.asarray(im).astype(float)
    lum = luminance(rgb)
    d = steps(lum)

    art_per_world = im.size[0] / args.world
    ratio = DEVICE_PX_PER_WORLD / art_per_world
    m = {
        'size': im.size,
        'art_per_world': art_per_world,
        'device_ratio': ratio,
        'lum': float(lum.mean()),
        'br': float(rgb[:, :, 2].mean() / max(rgb[:, :, 0].mean(), 1e-6)),
        'mean_step': float(d.mean()),
        'p90_step': float(np.percentile(d, 90)),
        'hard_frac': float((d >= HARD_STEP).mean()),
        'paving_frac': float((lum >= PAVING_LUM_MIN).mean()),
    }

    print(f'TOWN PLATE {p.name}  {m["size"][0]}x{m["size"][1]}')
    print(f'  art px per world px   {m["art_per_world"]:.4f}   (target {TARGET_ART_PER_WORLD})')
    print(f'  -> device upscale     {m["device_ratio"]:.4f}x   (target exactly 3.0000)')
    print(f'  mean luminance        {m["lum"]:.1f}   (target {LUM_TARGET} +/- {LUM_TOL})')
    print(f'  blue/red              {m["br"]:.3f}   (target {BR_TARGET} +/- {BR_TOL})')
    print(f'  mean |pixel step|     {m["mean_step"]:.2f}   (min {MEAN_STEP_MIN})')
    print(f'  p90 |pixel step|      {m["p90_step"]:.1f}')
    print(f'  hard steps >= {HARD_STEP}      {100*m["hard_frac"]:.2f}%   (min {100*HARD_FRAC_MIN:.0f}%)')
    print(f'  pale paving coverage  {100*m["paving_frac"]:.2f}%   (min {100*PAVING_FRAC_MIN:.1f}%)')

    if args.anchor:
        a = measure_anchor(Path(args.anchor))
        print(f'  ANCHOR {Path(args.anchor).name}: mean step {a["mean_step"]:.2f}, '
              f'hard {100*a["hard_frac"]:.2f}%  <- what the owner compares against')

    if args.report:
        return 0

    fails = []
    if abs(m['art_per_world'] - TARGET_ART_PER_WORLD) > DENSITY_TOL:
        want = round(TARGET_ART_PER_WORLD * args.world)
        fails.append(f'DENSITY: {m["art_per_world"]:.4f} art px per world px gives a '
                     f'{m["device_ratio"]:.4f}x device upscale, not a whole 3x. '
                     f'Plate must be {want}x{want}.')
    if abs(m['lum'] - LUM_TARGET) > LUM_TOL:
        fails.append(f'LUMINANCE: {m["lum"]:.1f}, outside {LUM_TARGET} +/- {LUM_TOL}. '
                     f'The settled town is bright; ART-DIRECTION.md\'s dark block is stale here.')
    if abs(m['br'] - BR_TARGET) > BR_TOL:
        fails.append(f'BLUE/RED: {m["br"]:.3f}, outside {BR_TARGET} +/- {BR_TOL}.')
    if m['hard_frac'] < HARD_FRAC_MIN or m['mean_step'] < MEAN_STEP_MIN:
        fails.append(f'FINISH: mean step {m["mean_step"]:.2f} / hard {100*m["hard_frac"]:.2f}% is '
                     f'still painterly (need >= {MEAN_STEP_MIN} and >= {100*HARD_FRAC_MIN:.0f}%). '
                     f'This is the half of the complaint a redesign exists to fix.')
    if m['paving_frac'] < PAVING_FRAC_MIN:
        fails.append(f'PAVING: only {100*m["paving_frac"]:.2f}% of the plate reads as pale paving '
                     f'(>= {PAVING_LUM_MIN} luminance), under {100*PAVING_FRAC_MIN:.1f}%. '
                     f'derive_town_walkable.py thresholds the paving to build the WALKABLE network, '
                     f'so this is a gameplay failure, not a cosmetic one.')

    if fails:
        print('\nFAIL')
        for f in fails:
            print(f'  - {f}')
        return 1
    print('\nTOWN FINISH CHECK PASS')
    return 0


if __name__ == '__main__':
    sys.exit(main())
