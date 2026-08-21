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
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Device geometry, measured -- see the module docstring.
DEVICE_PX_PER_WORLD = 5.625          # 390 CSS px * dpr 3 / 208 world px view
TARGET_ART_PER_WORLD = 1.875         # 5.625 / 3 -> an exact 3x nearest upscale
DENSITY_TOL = 0.004                  # ~4 px on a 1950 plate

# Palette: hold the settled town. Measured on the shipped plate.
LUM_TARGET, LUM_TOL = 90.1, 6.0
BR_TARGET, BR_TOL = 0.674, 0.06
# ---- WHOLE-PLATE blue/red IS A COMPOSITION STATISTIC, NOT A COLOUR CHECK (2026-08-21) ------------
# Measured on the three Act 1 towns, all of which sat at 0.672 +/- 0.001 -- inside the band, looking
# identical to this gate -- while their FOLIAGE differed by a factor of four:
#
#                     foliage b/r    ground b/r    foliage % of plate    WHOLE b/r
#   portSapphire         0.142         0.718            26.8%             0.672
#   millbrook            0.603         0.661            78.6%             0.672
#   greenhollow          0.536         0.709            70.4%             0.671
#
# The aggregate is pinned because the mix is different, not because the colours agree: a harbour is
# a quarter foliage with water and cobble making up the rest, a forest village is three quarters
# foliage. Worse, the gate CAUSED the fault the owner reported twice -- to reach 0.672 overall with
# 75% foliage, that foliage has to be blue-green, which is exactly what "the colors are still weird"
# was pointing at. So compare like with like: grass against the anchor's lawn, ground against its
# ground. The whole-plate figure is still REPORTED, because it is a useful summary, and no longer
# gated on its own.
SURFACE_BR_TOL = 0.14                # per-surface blue/red tolerance against the anchor

# Finish: reach the hero's neighbourhood. Bands are deliberately wide at the bottom -- the point is
# to leave "painterly", not to become a sprite sheet.
HARD_STEP = 24                       # a "hard" step in luminance between neighbouring pixels

# ---- RECALIBRATED 2026-08-18, AND THE OLD THRESHOLDS CAUSED A FAILURE ---------------------------
# HARD_FRAC_MIN was 0.34 and MEAN_STEP_MIN 24.0, both taken from the HEROINE (0.475 / 31.6). She is
# a CHARACTER: high internal contrast, dense form, no large uniform fields. A town plate is mostly
# cobble, grass and water, and no hand-drawn town reaches a character's per-pixel contrast without
# becoming noise. Two pieces of owner evidence say the old floor was simply wrong:
#
#   v8   hard 26.1%   owner: "sharpness it looks good"          <- ACCEPTED, below the old floor
#   v6   hard 49.5%   owner: "looks like a painting"            <- REJECTED, well above it
#
# So the old floor rejected what he liked and admitted what he refused. Worse, it CAUSED v6: the
# only way to reach 49.5% from a soft painting is to run a posterize over it, which is exactly what
# v6 did and exactly what he saw. A gate that can only be satisfied by a filter will be satisfied by
# a filter.
#
# The floor is therefore set from HIS approval point, not from the hero, with the shipped painting
# (13.9%, rejected as fuzzy) fixing the bottom. The SOFT band below is untouched and is what
# actually distinguishes drawn art from filtered art -- it caught v6 at 9.0% and it is the reason
# this loosening is safe.
HARD_FRAC_MIN = 0.22                 # shipped plate 0.139 (rejected), v8 0.261 (accepted)
MEAN_STEP_MIN = 17.0                 # shipped plate 11.7, v8-class candidates ~19-20

# ---- THE SOFT BAND, AND WHY IT EXISTS -------------------------------------------------------------
# v6 PASSED every band above and the owner rejected it on sight: "the artwork looks like a painting
# rather than pixel art". v8 then FAILED `hard_frac` (0.261) while being genuinely hard-edged, because
# huge flat fills contribute zero steps. So neither the mean nor the hard fraction distinguishes
# hand-pixelled art from its two failure modes, and a gate that cannot tell them apart is what let two
# candidates through to the owner.
#
# Measured across all three, the discriminator is the MIDDLE of the step distribution:
#
#                       flat <4     soft 4-20     hard >=24
#   hero (target)         13.1%        33.2%         47.5%
#   shipping plate        34.6%        47.0%         13.9%     <- painterly: gradients everywhere
#   v6 (posterized)       41.2%         9.0%         49.5%     <- the FILTER's fingerprint
#
# The hero is NOT flat-and-bimodal. She carries a THIRD of her steps in the intermediate band: that is
# real shading, anti-aliasing and material rendering inside her shapes. A painting has too MUCH of it
# (soft swamps hard). `-posterize` destroys it outright, which is why v6 scored 49.5% hard and still
# read as filtered -- 9% is a distribution no hand-drawn art produces.
#
# So the soft band is checked FROM BOTH SIDES. A candidate must shade like the hero, neither smearing
# (soft too high) nor flattening (soft too low). This is the band that would have caught v6.
SOFT_LO, SOFT_HI = 4, 20             # the intermediate/gradient band
SOFT_FRAC_MIN = 0.22                 # below this the art has been posterized or is flat vector fill
SOFT_FRAC_MAX = 0.40                 # above this it is a painting (shipping plate 0.470)

# The paving band derive_town_walkable.py keys on. Kept wide; the gate is that ENOUGH of the plate
# still reads as pale paving, not that a specific hue is used.
PAVING_LUM_MIN = 150
PAVING_FRAC_MIN = 0.055              # shipped plate measures ~0.09
# Overlap a candidate's paving must share with the reference town's, when --layout-ref is given.
# Not 1.0: the finish legitimately moves a boundary by a pixel or two, and the plate is rescaled
# 1885 -> 1950. But a re-invented street network scores far below this, which is the point.
PAVING_IOU_MIN = 0.55

# ---- LAYOUT, MEASURED AGAINST THE COLLISION AUTHORITY RATHER THAN AGAINST THE OLD PAINTING -------
# `--layout-ref` compares the candidate's THRESHOLDED paving to the shipped painting's THRESHOLDED
# paving. That is a fair test only between two images drawn the same way. Draw the same street with
# individual cobbles and darker mortar -- which is the entire point of the rebake -- and fewer
# pixels clear luminance 150, so the IoU falls without a single stone moving. Measured: a rebake
# whose streets are visibly identical scores IoU 0.396, under the 0.55 floor.
#
# portSapphire-walkable.json is the real authority (it was derived from the painting once and is now
# frozen; the runtime does not re-derive it). Comparing the candidate's paving to THAT separates the
# candidates the owner actually judged, where IoU does not:
#
#                                    walkable that reads paved    paved but NOT walkable
#   shipped painting (the baseline)          52.9%                      49.7%
#   rebake, streets visibly identical        56.2%                      44.2%   better than baseline
#   v6, which paved the lawns                55.6%                      66.2%   <- the failure
#
# The second column is the discriminator: over-paving shows up there and nowhere else. The first
# column is reported but not gated, because a plate may legitimately draw a lane's edge tighter.
PAVED_NOT_WALKABLE_MAX = 0.55        # shipped 0.497, v6 0.662


def luminance(rgb: np.ndarray) -> np.ndarray:
    return 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]


def steps(lum: np.ndarray, mask: np.ndarray | None = None) -> np.ndarray:
    g = lum if mask is None else np.where(mask, lum, np.nan)
    d = np.concatenate([np.abs(np.diff(g, axis=1)).ravel(), np.abs(np.diff(g, axis=0)).ravel()])
    return d[~np.isnan(d)]


def surface_br(rgb: np.ndarray) -> dict:
    """blue/red of the two surfaces that are comparable between any two towns."""
    a = rgb.astype(float)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    green = (g > r + 10) & (g > b + 10)
    water = (b > r + 22) & (b > g + 8)
    out = {}
    for name, m in (('grass', green & (l > 85)), ('ground', (l > 140) & ~green & ~water)):
        out[name] = None if m.sum() < 500 else float(b[m].mean() / max(r[m].mean(), 1e-6))
    return out


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
    ap.add_argument('--style-anchor', default='design/act1-towns/_anchor/'
                                              'style-anchor-portSapphire-accepted.png',
                    help='ACCEPTED TOWN PLATE whose grass and ground this plate is matched against. '
                         'Distinct from --anchor, which is a hero sheet: overloading that flag '
                         'would have made two unrelated checks share one argument.')
    ap.add_argument('--layout-ref', help='plate whose PAVING LAYOUT this candidate must preserve '
                                         '(normally the shipping plate). Gates IoU, not just coverage.')
    ap.add_argument('--walkable', help='portSapphire-walkable.json -- the COLLISION AUTHORITY. '
                                       'Preferred over --layout-ref, which cannot tell a restyled '
                                       'street from a moved one.')
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
        'surf': surface_br(rgb),
        'mean_step': float(d.mean()),
        'p90_step': float(np.percentile(d, 90)),
        'hard_frac': float((d >= HARD_STEP).mean()),
        'flat_frac': float((d < SOFT_LO).mean()),
        'soft_frac': float(((d >= SOFT_LO) & (d < SOFT_HI)).mean()),
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
    print(f'  flat steps < {SOFT_LO}        {100*m["flat_frac"]:.2f}%   (hero 13.1%)')
    print(f'  SOFT steps {SOFT_LO}-{SOFT_HI}       {100*m["soft_frac"]:.2f}%   '
          f'(band {100*SOFT_FRAC_MIN:.0f}-{100*SOFT_FRAC_MAX:.0f}%, hero 33.2%)')
    print(f'  pale paving coverage  {100*m["paving_frac"]:.2f}%   (min {100*PAVING_FRAC_MIN:.1f}%)')

    sa = Path(ROOT) / args.style_anchor if not os.path.isabs(args.style_anchor) else Path(args.style_anchor)
    if sa.exists() and sa.resolve() != Path(args.plate).resolve():
        m['surf']['anchor'] = surface_br(np.asarray(Image.open(sa).convert('RGB')))
        av, gv = m['surf']['anchor'].get('grass'), m['surf'].get('grass')
        ao, go = m['surf']['anchor'].get('ground'), m['surf'].get('ground')
        print(f'  grass  blue/red       {gv if gv is None else round(gv,3)}   '
              f'(anchor {av if av is None else round(av,3)} +/- {SURFACE_BR_TOL})')
        print(f'  ground blue/red       {go if go is None else round(go,3)}   '
              f'(anchor {ao if ao is None else round(ao,3)} +/- {SURFACE_BR_TOL})')
    if args.anchor:
        a = measure_anchor(Path(args.anchor))
        print(f'  ANCHOR {Path(args.anchor).name}: mean step {a["mean_step"]:.2f}, '
              f'hard {100*a["hard_frac"]:.2f}%  <- what the owner compares against')

    # ---- LAYOUT PRESERVATION ---------------------------------------------------------------------
    # Coverage alone is blind to WHERE the paving is. v6 held a plausible-looking 23.4% and had paved
    # the lawns, making 14.2% of the town newly walkable; v8 held a fine 15.6% and had rebuilt the
    # street network as a symmetric cross, which the owner rejected as "the game is not build on
    # squares so it needs to look more natural". Since paving IS the collision map, a candidate that
    # keeps the right AMOUNT in the wrong PLACES is worse than one that misses the amount: it silently
    # rewrites where the player may walk. So compare the masks pixelwise, not their totals.
    iou = None
    if args.layout_ref:
        ref = Image.open(args.layout_ref).convert('RGB')
        ref_pav = luminance(np.asarray(ref).astype(float)) >= PAVING_LUM_MIN
        if ref.size != im.size:                       # 1885 -> 1950: nearest, a mask has no midtones
            ref_pav = np.asarray(Image.fromarray(ref_pav.astype(np.uint8) * 255)
                                 .resize(im.size, Image.NEAREST)) > 127
        cand = lum >= PAVING_LUM_MIN
        inter = int((cand & ref_pav).sum()); union = int((cand | ref_pav).sum())
        iou = inter / max(union, 1)
        kept = inter / max(int(ref_pav.sum()), 1)
        added = int((cand & ~ref_pav).sum()) / max(cand.size, 1)
        print(f'  paving IoU vs ref     {iou:.3f}   (min {PAVING_IOU_MIN}) '
              f'[keeps {100*kept:.1f}% of the reference streets, '
              f'newly paves {100*added:.1f}% of the plate]')

    pnw = None
    if args.walkable:
        import json
        from PIL import ImageDraw
        reg = json.load(open(args.walkable))['regions'][0]
        sc = im.size[0] / 1040.0
        msk = Image.new('L', im.size, 0)
        dr = ImageDraw.Draw(msk)
        dr.polygon([(p_['x'] * sc, p_['y'] * sc) for p_ in reg['outer']], fill=255)
        for hole in reg.get('holes', []):
            dr.polygon([(p_['x'] * sc, p_['y'] * sc) for p_ in hole], fill=0)
        walk = np.asarray(msk) > 127
        cand = lum >= PAVING_LUM_MIN
        covered = int((cand & walk).sum()) / max(int(walk.sum()), 1)
        pnw = int((cand & ~walk).sum()) / max(int(cand.sum()), 1)
        print(f'  walkable read as paving {100*covered:.1f}%   paved but NOT walkable {100*pnw:.1f}%'
              f'   (max {100*PAVED_NOT_WALKABLE_MAX:.0f}%; shipped 49.7%, v6 66.2%)')

    if args.report:
        return 0

    fails = []
    if pnw is not None and pnw > PAVED_NOT_WALKABLE_MAX:
        fails.append(f'LAYOUT: {100*pnw:.1f}% of the plate\'s paving lies OUTSIDE the walkable '
                     f'authority (max {100*PAVED_NOT_WALKABLE_MAX:.0f}%, shipped plate 49.7%). The '
                     f'candidate has paved ground the player cannot walk on, which is what v6 did '
                     f'at 66.2%. Draw the streets where portSapphire-walkable.json says they are.')
    if pnw is None and iou is not None and iou < PAVING_IOU_MIN:
        fails.append(f'LAYOUT: paving IoU {iou:.3f} against {Path(args.layout_ref).name} is below '
                     f'{PAVING_IOU_MIN}. The streets are not where the town\'s streets are. Paving is '
                     f'the collision map, so this silently rewrites where the player may walk -- and '
                     f'a re-laid street grid is exactly what the owner rejected in v8. Follow the '
                     f'existing layout instead of inventing one.')
    if abs(m['art_per_world'] - TARGET_ART_PER_WORLD) > DENSITY_TOL:
        want = round(TARGET_ART_PER_WORLD * args.world)
        fails.append(f'DENSITY: {m["art_per_world"]:.4f} art px per world px gives a '
                     f'{m["device_ratio"]:.4f}x device upscale, not a whole 3x. '
                     f'Plate must be {want}x{want}.')
    if abs(m['lum'] - LUM_TARGET) > LUM_TOL:
        fails.append(f'LUMINANCE: {m["lum"]:.1f}, outside {LUM_TARGET} +/- {LUM_TOL}. '
                     f'The settled town is bright; ART-DIRECTION.md\'s dark block is stale here.')
    if m.get('surf') and m['surf'].get('anchor'):
        for name in ('grass', 'ground'):
            got, want = m['surf'].get(name), m['surf']['anchor'].get(name)
            if got is None or want is None:
                continue
            if abs(got - want) > SURFACE_BR_TOL:
                fails.append(f'SURFACE COLOUR: {name} blue/red {got:.3f} against the anchor\'s '
                             f'{want:.3f} (tolerance {SURFACE_BR_TOL}). Match the surface, not the '
                             f'whole-plate ratio -- see the note by BR_TARGET.')
    elif abs(m['br'] - BR_TARGET) > BR_TOL:
        fails.append(f'BLUE/RED: {m["br"]:.3f}, outside {BR_TARGET} +/- {BR_TOL}. '
                     f'(No --anchor given, so this falls back to the whole-plate ratio, which is a '
                     f'composition statistic; pass --anchor for the per-surface check.)')
    if m['soft_frac'] < SOFT_FRAC_MIN:
        fails.append(f'POSTERIZED / FLAT FILL: only {100*m["soft_frac"]:.1f}% of steps land in the '
                     f'{SOFT_LO}-{SOFT_HI} band (hero 33.2%, floor {100*SOFT_FRAC_MIN:.0f}%). No '
                     f'hand-drawn art has a middle this empty -- this is the signature of '
                     f'-posterize/-unsharp or of flat vector fills. v6 scored 9.0% here and the '
                     f'owner called it a painting on sight. The fix is to SHADE the shapes, not to '
                     f'raise the edge count.')
    if m['soft_frac'] > SOFT_FRAC_MAX:
        fails.append(f'PAINTERLY: {100*m["soft_frac"]:.1f}% of steps are soft gradients '
                     f'(ceiling {100*SOFT_FRAC_MAX:.0f}%, shipping plate 47.0%). Material '
                     f'boundaries must be hard; shading inside a shape is what the band allows.')
    if m['hard_frac'] < HARD_FRAC_MIN or m['mean_step'] < MEAN_STEP_MIN:
        fails.append(f'FINISH: mean step {m["mean_step"]:.2f} / hard {100*m["hard_frac"]:.2f}% is '
                     f'still painterly (need >= {MEAN_STEP_MIN} and >= {100*HARD_FRAC_MIN:.0f}%). '
                     f'This is the half of the complaint a redesign exists to fix. Raise it by '
                     f'DRAWING detail that survives 3x magnification -- individual tiles, cobbles, '
                     f'planks, panes -- not by filtering; the soft band above is watching for that.')
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
