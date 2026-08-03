#!/usr/bin/env python3
"""Render overworld terrain by SPLATTING tiling materials, in continuous world-pixel coordinates.

This is the architecture `public/dq-tiles.js` already uses -- its header says it draws "into ONE
windowed canvas in CONTINUOUS WORLD-PIXEL coordinates ... so grass value-noise, sand coasts, foam
and dirt paths are SEAMLESS across tile borders (no per-tile texture = no banding)". The only
change here is what fills each material: AI-generated texture instead of a flat palette ramp.

Why this removes both failure modes at the root, rather than mitigating them:

  * STYLE DRIFT is impossible. There are four textures, generated in ONE call, so they cannot
    disagree with each other. Nothing is generated per region, so nothing can drift across the
    map however large it gets.
  * SEAMS are impossible. No tile is ever generated. Every pixel is a function of its world
    coordinate and the semantic mask, both continuous, so there is no boundary for a seam to
    live on. The materials themselves wrap (make_materials.py), so even the sampling repeat has
    no edge.
  * IGNORING THE SEMANTIC MAP is impossible. Layout is read directly from the mask by this
    renderer; the generator never sees layout at all and has no opportunity to reinterpret it.

The trade this makes is repetition instead of uniqueness: a 531px material covers ~11 cells, so
it recurs. That is countered by low-frequency luminance modulation and a two-tap stochastic
blend, and it is the same trade every tile-based RPG makes.

    render_material_map.py --window x0,y0,w,h  [--out p.png] [--scale 1]
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os

import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OWNER = os.path.join(ROOT, "design/continent-terrain-class-method/owner-terrain")
MAT = os.path.join(OWNER, "materials")
MASK = os.path.join(OWNER, "art-tiles/act1-smoothed-semantic.png")
# FOUR classes, and there is deliberately NO road/path class. Roads were removed from Act 1 on
# purpose -- the roadless base (docs/handoffs/2026-07-19-act1-polygon-conformance-roadless-base-g2.md)
# and then ADR-0069's polygon-first ground authority. Unpainted ground is walkable, so THE OPEN
# COUNTRY IS THE WALKABLE NETWORK; there are no drawn routes by design.
# docs/handoffs/2026-07-29-owner-painted-terrain-to-codex-art.md is explicit that adding drawn
# routes is the owner's call, not an inference from the class count: "Only worth revisiting if
# the owner wants drawn routes in the art." A fifth `path` class was added here on 2026-08-01
# on exactly that bad inference and reverted the same day. Do not re-add it without the owner.
LEGEND = {"ground": (226, 210, 156), "forest": (26, 82, 46),
          "rock": (128, 126, 122), "water": (30, 82, 170)}
MATNAME = {"ground": "grass", "forest": "forest", "rock": "rock", "water": "water"}
# owner's picked theme, measured from TARGET-COLOUR-THEME.png
TARGET_RGB = {"ground": (101, 114, 33), "forest": (21, 29, 19),
              "water": (10, 34, 55), "rock": (69, 67, 56)}
# The macro layer darkens after the materials are graded -- water by its depth gradient, forest
# by its interior shadow -- so a material graded exactly to target renders BELOW it. Measured on
# the finished act: water 19.0 against 31, forest 20.2 against 27. These pre-compensate that, so
# the finished map lands on the owner's palette rather than the material sheet doing so. Any
# change to the depth or shadow strengths above means re-measuring these.
MACRO_COMP = {"ground": 1.00, "forest": 27.0 / 20.2, "rock": 1.180, "water": 31.0 / 19.0}
# rock's 1.180 is re-measured, not inherited: the ridged hillshade and its valley occlusion take
# far more out of the rock than the old flat relief did (66 -> 55 before compensating). This is
# exactly the "re-measure after changing the macro layer" note above, applied.
# Per-material local contrast. Only water is pulled down, and for a specific reason: the
# generated swell is regular enough that at gameplay zoom the 531px repeat reads as a net laid
# over the sea. Flattening the wave contrast leaves the swell as texture rather than pattern,
# and the large-scale interest comes from the depth gradient instead, which never repeats.
MAT_CONTRAST = {"ground": 1.00, "forest": 1.00, "rock": 1.00, "water": 0.50}
SAND = np.array([156, 138, 95], np.float32)
EARTH = np.array([128, 104, 66], np.float32)      # packed earth of a landmark site
# A site takes the material it is cut into: scree and grit at a cliff foot, leaf litter and
# damp earth on a forest floor. Only an open-ground site is a bare packed-earth plaza.
SITE_TONE = {"rock": np.array([104, 99, 86], np.float32),
             "forest": np.array([78, 62, 41], np.float32)}
TOWN_NAMES = {"Greenhollow", "Millbrook", "Port Sapphire"}
SITES, X0C, Y0C = [], 0, 0


def load_sites(act="1"):
    """Landmark sites, with each pad sized from its sprite's MEASURED footprint.

    Reads owner-terrain.json (owner INPUT -- read only, never written) and reuses
    key_landmark_sprite.footprint(), the same measurement that positions the sprite and its
    contact shadow, so the clearing cannot disagree with the thing standing in it.
    """
    global SITES, X0C, Y0C
    spec = importlib.util.spec_from_file_location(
        "kls", os.path.join(ROOT, "scripts/key_landmark_sprite.py"))
    kls = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(kls)
    a = json.load(open(os.path.join(OWNER, "owner-terrain.json")))["acts"][act]
    X0C, Y0C = a["bounds"][0], a["bounds"][1]
    SITES = []
    for name, (cx, cy) in sorted(a["landmarks"].items()):
        p = os.path.join(OWNER, "landmark-sprites", name.lower().replace(" ", "-") + ".png")
        if not os.path.exists(p):
            continue
        size = 192 if name in TOWN_NAMES else 144
        sp = Image.open(p).convert("RGBA")
        if sp.size != (size, size):
            sp = sp.resize((size, size), Image.LANCZOS)
        _fx, _fy, wmax, _b = kls.footprint(sp)
        # HOST material: the non-ground class the landmark actually belongs to, measured from
        # its surroundings. Crystal Cave sits on 78% open ground BESIDE the rock rather than in
        # it, and Darkfang on 57% ground at a forest edge -- which is exactly why both read as
        # dropped onto a lawn. A dungeon mouth has to be cut INTO something.
        host, hf, hdir = None, 0.0, (0.0, -1.0)
        for key in ("rock", "forest"):
            f, dvec = _class_near(key, cx, cy)
            if f > hf:
                host, hf, hdir = key, f, dvec
        if name in TOWN_NAMES:
            host, hf = None, 0.0                # towns clear their ground, they do not burrow
        SITES.append((cx, cy, wmax * 0.72, host, hf, hdir))
        print(f"  site {name:<18} cell ({cx:>3},{cy:>3})  pad r={wmax * 0.72:.0f}px"
              f"  host {host or '-'} {hf * 100:.0f}%  dir ({hdir[0]:+.2f},{hdir[1]:+.2f})")
    return SITES


_SEM_CACHE = {}


def _class_near(key, cx, cy, cells=5):
    """How much of a landmark's neighbourhood is `key`, and WHICH WAY that mass lies.

    The direction matters as much as the amount: an embedded mouth needs its host material to
    reach out and meet it, so the collar has to grow toward the mass rather than ring the site
    symmetrically. Returned as a unit vector in world-pixel space.
    """
    if "sem" not in _SEM_CACHE:
        _SEM_CACHE["sem"] = np.asarray(Image.open(MASK).convert("RGB")).astype(int)
    sem = _SEM_CACHE["sem"]
    S = 16                                       # mask px per cell
    mx, my = (cx - X0C) * S, (cy - Y0C) * S
    r = cells * S
    y0m, x0m = max(my - r, 0), max(mx - r, 0)
    sub = sem[y0m:my + r, x0m:mx + r]
    if sub.size == 0:
        return 0.0, (0.0, -1.0)
    m = (np.abs(sub - np.array(LEGEND[key])).sum(axis=2) < 20)
    frac = float(m.mean())
    if m.sum() < 40:
        return frac, (0.0, -1.0)
    ys, xs = np.nonzero(m)
    vx, vy = float((xs + x0m - mx).mean()), float((ys + y0m - my).mean())
    n = (vx * vx + vy * vy) ** 0.5
    return frac, ((vx / n, vy / n) if n > 1e-6 else (0.0, -1.0))
FOAM = np.array([196, 214, 216], np.float32)
PX = 48


def _h(ix, iy, seed):
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


def smoothstep(e0, e1, x):
    # np.maximum, not max: the edges are themselves fields wherever a band's width wanders
    t = np.clip((x - e0) / np.maximum(e1 - e0, 1e-6), 0, 1)
    return t * t * (3 - 2 * t)


def load_materials():
    mats = {}
    for key, name in MATNAME.items():
        p = os.path.join(MAT, f"mat-{name}.png")
        a = np.asarray(Image.open(p).convert("RGB")).astype(np.float32)
        cur = a.reshape(-1, 3).mean(axis=0)
        curl = float(0.2126 * cur[0] + 0.7152 * cur[1] + 0.0722 * cur[2])
        tgt = TARGET_RGB[key]
        tgtl = float(0.2126 * tgt[0] + 0.7152 * tgt[1] + 0.0722 * tgt[2])
        if key in ("water", "forest"):
            # Dark materials: match LUMINANCE only. A per-channel match on a near-black mean is
            # the same trap the act grade hit -- water's mean red is ~4, so hitting a target red
            # of 10 asks for a 2.4x gain and turns the sea purple. Hue here is already right.
            gain = np.full(3, tgtl / max(curl, 1e-6), np.float32)
        else:
            gain = np.array([tgt[c] / max(cur[c], 1e-6) for c in range(3)], np.float32)
        gain = np.clip(gain * MACRO_COMP[key], 0.4, 2.0)
        # graded ONCE, here, per material -- four numbers for the entire world. There is no
        # per-region tone correction anywhere in this pipeline, so patchwork has no way in.
        c = MAT_CONTRAST[key]
        if c != 1.0:
            a = a.mean(axis=(0, 1), keepdims=True) + (a - a.mean(axis=(0, 1), keepdims=True)) * c
        mats[key] = np.clip(a * gain, 0, 255)
        print(f"  {key:<7} {a.shape[1]}x{a.shape[0]}  gain {np.round(gain, 3)}")
    return mats


def sample(mat, wx, wy):
    T = mat.shape[0]
    return mat[np.mod(wy, T), np.mod(wx, T)]


CANOPY_ALPHA = 242          # matches the shipped act1-hifi occlusion layer exactly
CANOPY_CUT = 0.50           # forest weight above which a pixel overdraws the hero


def render_window(x0, y0, w, h, mats, sem, occlusion=False):
    """Render one window. A PURE FUNCTION of world coordinates and the mask.

    That purity is the whole guarantee: rendering the act in one pass and rendering it in
    strips produce byte-identical output, because no pixel depends on which window it was
    drawn in. It is the exact property the tile pipeline could never have.
    """
    # mask is 16px/cell, world is 48px/cell -> factor 3. Pad so the blur has real context.
    # PAD must exceed ~3.5x the widest blur below (sigma 26) or a strip boundary would show.
    PAD = 110
    mx0, my0 = max(x0 // 3 - PAD, 0), max(y0 // 3 - PAD, 0)
    mx1 = min(-(-(x0 + w) // 3) + PAD, sem.shape[1])
    my1 = min(-(-(y0 + h) // 3) + PAD, sem.shape[0])
    sub = sem[my0:my1, mx0:mx1]

    oy, ox = y0 - my0 * 3, x0 - mx0 * 3
    wx = (x0 + np.arange(w, dtype=np.int32))[None, :].repeat(h, 0)
    wy = (y0 + np.arange(h, dtype=np.int32))[:, None].repeat(w, 1)

    def field(m, sigma, sx=0, sy=0):
        """Blurred class field. (sx,sy) shifts the SAMPLE POINT in world px -- taken by moving
        the crop inside the padded region, never by rolling the result, so a strip renders
        identically to a full pass."""
        im = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(sigma))
        im = im.resize(((mx1 - mx0) * 3, (my1 - my0) * 3), Image.BILINEAR)
        a = np.asarray(im, np.float32)
        # At the very edge of the act the pad is clamped, so a negative offset would index
        # before the array and silently return an empty slice. Clamp into range: the only
        # affected pixels are outside the landmass.
        cy0 = min(max(oy + sy, 0), max(a.shape[0] - h, 0))
        cx0 = min(max(ox + sx, 0), max(a.shape[1] - w, 0))
        return a[cy0:cy0 + h, cx0:cx0 + w] / 255.0

    # ---- class weights with NOISE-WARPED, INTERLOCKING boundaries ---------------------------
    # A plain blur of the mask does two things that read as artificial: it cross-fades two
    # materials through a mush, and it follows the mask's smoothed contour exactly, so every
    # boundary is a clean drawn curve with an airbrushed edge. Real boundaries interlock --
    # clumps of forest push out into the meadow, tongues of meadow run back in, and the shore
    # widens and pinches.
    #
    # So displace each class weight by its OWN multi-octave noise before blending, then sharpen
    # the blend. Near a boundary the local noise decides which class wins, at four scales at
    # once, giving a ragged interlocking edge instead of a fade. Away from boundaries nothing
    # changes, because the weight there is already saturated at 0 or 1. Still seamless: noise
    # is a continuous function of world position and knows nothing about tiles.
    # A blurred mask's contour shifts by about AMP*sigma*2.5 mask px, so at sigma 4 a 0.3
    # displacement moves the edge under 10px -- invisible. The wander has to be about a cell to
    # read as terrain. That needs a wide blur AND a large amplitude, and a large amplitude on
    # its own would raise a class's weight in open ground far from any boundary and ghost
    # forest into the middle of a meadow.
    # So the displacement is GATED by 4*f*(1-f), which is 1 exactly at the boundary and 0 where
    # the field is saturated. The warp then acts only in the transition zone, and can be pushed
    # hard without contaminating anything.
    # BLUR is deliberately wide: it is what gives the warp room to move the edge a whole cell.
    # But a wide blur also means a wide CROSS-FADE, and a cross-fade at a treeline renders
    # half-transparent trees over grass, which is why the edge looked soft and airbrushed.
    # So the two concerns are separated: blur wide, warp inside that width, then put the result
    # through a STEEP transfer so the final blend happens over ~13px. The edge keeps its
    # organic wander and regains a crisp, per-clump quality.
    # Edge softness is PER CLASS, because the classes are not alike. A shoreline is a genuine
    # hard boundary and wants a crisp edge; a treeline is a gradient -- canopy thins into
    # scrub and then meadow -- and a hard cut there reads as a cookie-cutter. Owner's call on
    # seeing both, and it matches how the terrain actually behaves.
    BLUR, AMP = 11.0, 0.55
    # forest is near-binary ON PURPOSE: its softness now comes from the crown-scale breakup
    # above, which is what a treeline actually looks like, not from an alpha fade
    EDGE = {"water": 0.10, "rock": 0.20, "forest": 0.07, "ground": 0.22}

    def edge_noise(seed):
        return ((vnoise(wx, wy, 190, seed) - 0.5) * 0.62
                + (vnoise(wx, wy, 76, seed + 1) - 0.5) * 0.42
                + (vnoise(wx, wy, 29, seed + 2) - 0.5) * 0.26
                + (vnoise(wx, wy, 12, seed + 3) - 0.5) * 0.13)

    weights, deep, disp, fw = {}, {}, {}, {}
    raw_mask = {}
    for i, (key, rgb) in enumerate(LEGEND.items()):
        m = (np.abs(sub - np.array(rgb)).sum(axis=2) < 20).astype(np.float32)
        raw_mask[key] = m
        f = field(m, BLUR)
        disp[key] = edge_noise(101 + i * 11) * AMP
        fw[key] = f + disp[key] * (4.0 * f * (1.0 - f))
        if key == "forest":
            # A TREELINE IS NOT A FADE. Blending canopy into grass renders half-transparent
            # trees, which is why the forest edge looked wrong however the blend was tuned --
            # there is no such thing as half a tree. A real edge is binary at the scale of a
            # single CROWN: whole trees stand at the margin, grass runs up between them.
            # So displace the forest field by crown-scale noise (a mature crown is 60-95px)
            # and let the steep transfer below resolve each lobe to fully canopy or fully
            # grass. The edge then breaks into crown-sized clumps instead of dissolving.
            crown = ((vnoise(wx, wy, 78, 401) - 0.5) * 0.62
                     + (vnoise(wx, wy, 37, 403) - 0.5) * 0.30
                     + (vnoise(wx, wy, 17, 405) - 0.5) * 0.14)
            fw[key] = fw[key] + crown * 0.60 * (4.0 * f * (1.0 - f))
        # a heavily blurred copy is a cheap "distance from the edge of this class": high deep
        # inside the mass, low near its border. Drives water depth and forest interior shadow.
        deep[key] = field(m, 26.0)

    # Softness belongs to the BOUNDARY, not to the class. Giving water a crisp transfer and
    # forest a soft one still left a mushy shore wherever forest met water, because the blend
    # there is governed by BOTH transfers and forest was still fading across a wide band -- so
    # the shore looked crisp against grass and vague against trees.
    # Fix: locate the waterline (4f(1-f) on the water field is 1 exactly on it, 0 away from it)
    # and drive EVERY class to its crisp transfer there. The shore is then hard against forest,
    # rock and grass alike, while a treeline meeting a meadow keeps its soft fade.
    shore = np.clip(4.0 * fw["water"] * (1.0 - fw["water"]), 0, 1)
    for key in fw:
        soft = smoothstep(0.5 - EDGE[key], 0.5 + EDGE[key], fw[key])
        crisp = smoothstep(0.5 - EDGE["water"], 0.5 + EDGE["water"], fw[key])
        # the +0.04*fw floor keeps the weight sum non-zero where three classes meet and every
        # steep transfer would otherwise read 0 at once
        weights[key] = soft * (1.0 - shore) + crisp * shore + 0.04 * np.clip(fw[key], 0, 1)

    # No LAND material may reach past the waterline. Even with a crisp transfer, a land class
    # keeps a little weight just beyond it, and normalisation then lets it show through the
    # water -- which read as trees bleeding out from under the bank into the lake.
    # SHORE CHARACTER varies along the coast. Owner: strict class edges are not required, some
    # bleed between walkable terrain and water is fine as long as it looks natural -- and a
    # uniform sand rim drawn around every body of water is itself the unnatural thing. Real
    # coast alternates: open beach here, forest and grass coming right down to the waterline
    # there, with canopy leaning out over it.
    #
    # So a low-frequency field decides, stretch by stretch, which kind of shore this is, and on
    # the vegetated stretches the land is allowed to OVERHANG the water instead of being cut
    # off at it. That relaxation is what the hard land-stop was preventing.
    beachy = smoothstep(0.42, 0.60, vnoise(wx, wy, 780, 211) * 0.72
                        + vnoise(wx, wy, 260, 217) * 0.28)
    overhang = (1.0 - beachy) * 0.17
    past = 1.0 - smoothstep(0.50 + overhang, 0.64 + overhang, fw["water"])
    for key in ("ground", "forest", "rock"):
        weights[key] = weights[key] * past

    # ---- HOST COLLAR: draw the landmark's own terrain in around its mouth -------------------
    # A dungeon entrance has to be cut INTO something. Both Crystal Cave and Darkfang sit on
    # majority open ground next to their rock/forest, so a clearing alone left them looking
    # dropped onto a lawn. This closes the host material back in around the mouth as an
    # annulus -- absent at the mouth itself, strongest just outside the clearing, fading out --
    # and it is deliberately WEAK AT THE FRONT so the southward approach stays open and the
    # mouth stays visible (dungeon mouths face S/SE/SW/E/W; landmark_orientation.py).
    for (lx, ly, rad, host, hf, hdir) in SITES:
        if not host or hf < 0.05:
            continue
        px, py = (lx - X0C) * PX + PX // 2, (ly - Y0C) * PX + PX // 2
        REACH = rad * 5.0                          # far enough to meet the mass it grows from
        if not (x0 - REACH < px < x0 + w + REACH and y0 - REACH < py < y0 + h + REACH):
            continue
        dx, dy = wx - px, wy - py
        r = np.sqrt(dx * dx + dy * dy) + 1e-6
        ux, uy = dx / r, dy / r
        # A TONGUE toward the host mass, not a symmetric ring: where the pixel lies in the
        # direction of the rock/forest, the collar reaches much further, so the two join up and
        # the mouth ends up cut into the mass instead of standing in a clearing beside it.
        toward = np.clip(ux * hdir[0] + uy * hdir[1], 0, 1)
        reach = rad * (1.25 + 3.2 * toward ** 1.5)
        collar = smoothstep(rad * 0.62, rad * 1.05, r) * (1.0 - smoothstep(reach * 0.55, reach, r))
        collar *= 1.0 - 0.75 * smoothstep(0.15, 0.9, dy / r)       # keep the front approach open
        collar *= 0.50 + 0.50 * vnoise(wx, wy, rad * 0.5, 151)     # ragged, never an arc
        collar = np.clip(collar * (1.35 * min(1.0, hf * 3.0)), 0, 1)
        weights[host] = np.clip(weights[host] + collar, 0, 1)
        weights["ground"] = weights["ground"] * (1.0 - collar)
    tot_w = sum(weights.values())
    for key in weights:
        weights[key] = weights[key] / np.maximum(tot_w, 1e-6)

    # ---- splat -----------------------------------------------------------------------------
    out = np.zeros((h, w, 3), np.float32)
    tot = np.zeros((h, w), np.float32)
    for key, mat in mats.items():
        a = weights[key]
        if a.max() <= 0.001:
            continue
        T = mat.shape[0]
        base = sample(mat, wx, wy)
        # second tap at an offset, mixed by low-frequency noise: breaks the sampling repeat
        # without any grid, because the mix field is continuous noise, not a tiling.
        alt = sample(mat, wx + T // 3, wy + 2 * T // 5)
        k = smoothstep(0.42, 0.58, vnoise(wx, wy, T * 0.85, 91 + len(key)))[..., None]
        col = base * (1 - k) + alt * k
        out += col * a[..., None]
        tot += a
    out /= np.maximum(tot, 1e-6)[..., None]

    # ---- MACRO layer ------------------------------------------------------------------------
    # A tiling material carries micro detail only, and micro detail alone reads flat over a
    # 7000px map -- the eye wants relief, depth and weather at a scale far larger than any
    # texture. So the material supplies grain and a continuous field supplies form, which is
    # the same split dq-tiles.js makes with elevAt()/waterColor(). Still seamless: every field
    # below is noise or a blurred mask, both continuous functions of world position.

    # relief: light the whole landmass from the upper left off a multi-octave height field
    def elev(dx, dy):
        return (vnoise(wx + dx, wy + dy, 300, 71) * 0.5
                + vnoise(wx + dx, wy + dy, 118, 73) * 0.32
                + vnoise(wx + dx, wy + dy, 47, 75) * 0.18)
    relief = (elev(0, 0) - elev(11, 11))            # >0 where the slope faces the light
    rock_w, forest_w = weights["rock"], weights["forest"]
    shade = 1.0 + relief * (0.85 * forest_w + 0.55 * weights["ground"])

    # ---- MOUNTAINS: a ridged height field, then hillshade it ---------------------------------
    # Plain value noise is isotropic, so shading it gives round blobs -- which is why the range
    # read as an even carpet of boulders with no ridgelines however much the amplitude was
    # raised. A range is read from its SPINE and the valleys either side of it.
    #
    # Ridged multifractal fixes exactly this: folding each octave as 1-|2n-1| turns what was a
    # mid-value into a CREST, giving sharp ridgelines and rounded valleys instead of lumps.
    # Squaring sharpens the crests further.
    def ridged(dx, dy):
        t, amp, sc = 0.0, 1.0, 620.0
        for seed in (71, 73, 75, 77):
            n = 1.0 - np.abs(2.0 * vnoise(wx + dx, wy + dy, sc, seed) - 1.0)
            t = t + n * n * amp
            amp *= 0.48
            sc *= 0.45
        return t / 1.86
    # The range must also RISE from its foot to its spine, or the ridges sit on a flat plate.
    # deep["rock"] is distance-from-the-edge-of-the-mass, so it doubles as the massif profile.
    massif = 0.32 + 0.68 * smoothstep(0.03, 0.72, deep["rock"])
    H = ridged(0, 0) * massif
    slope = (H - ridged(14, 14) * massif)           # gradient along the upper-left light
    rock_shade = 1.0 + slope * 11.0 + (H - 0.45) * 0.55
    rock_shade *= 1.0 - smoothstep(0.42, 0.06, H) * 0.34      # valleys occlude and go dark
    shade = shade + (rock_shade - 1.0) * rock_w
    out *= np.clip(shade, 0.34, 1.85)[..., None]

    # bare, paler stone along the summit line, following the ridge rather than a noise blob
    crest = smoothstep(0.62, 0.86, H) * rock_w
    crest *= 0.35 + 0.65 * vnoise(wx, wy, 60, 83)
    out = out * (1 - (crest * 0.22)[..., None]) \
        + np.array([186, 188, 180], np.float32)[None, None, :] * (crest * 0.22)[..., None]

    # water depth: shallow and luminous at the shore, deep and dark offshore
    d = deep["water"]
    out *= (1.0 - weights["water"] * smoothstep(0.15, 0.85, d) * 0.42)[..., None]
    shallow = weights["water"] * (1.0 - smoothstep(0.02, 0.35, d))
    out += (np.array([26, 74, 96], np.float32)[None, None, :]
            * (shallow * 0.5)[..., None])

    # forest interior sits in its own shadow; its rim catches light
    out *= (1.0 - forest_w * smoothstep(0.25, 0.9, deep["forest"]) * 0.30)[..., None]

    # CANOPY SHADOW cast out onto the open ground beside a treeline. Trees are tall, the light
    # is upper-left, so the ground down-and-right of a forest edge lies in shade -- and that
    # cast shadow is most of what makes a treeline read as a wall of trees rather than a change
    # of ground colour. Sampled at an offset INTO the padded crop so strips stay identical.
    cast = field(raw_mask["forest"], BLUR * 0.55, -8, -8)   # forest as seen up-and-left of here
    cast = smoothstep(0.30, 0.80, cast) * (1.0 - weights["forest"])
    cast *= 0.55 + 0.45 * vnoise(wx, wy, 46, 407)           # broken by the crowns casting it
    out *= (1.0 - cast * 0.30)[..., None]

    # leaf litter and scrub at the canopy foot: the ground does not stay clean meadow right up
    # to the trunks
    litter = smoothstep(0.12, 0.55, cast) * (1.0 - weights["forest"]) * weights["ground"]
    litter *= 0.4 + 0.6 * vnoise(wx, wy, 27, 409)
    out = out * (1 - (litter * 0.30)[..., None]) \
        + np.array([84, 78, 40], np.float32)[None, None, :] * (litter * 0.30)[..., None]

    # meadow variation: broad drier/lusher sweeps so grassland is not one flat green
    gv = vnoise(wx, wy, 900, 41) * 0.6 + vnoise(wx, wy, 330, 43) * 0.4
    dry = np.array([132, 128, 58], np.float32)
    out = (out * (1 - (weights["ground"] * smoothstep(0.55, 0.95, gv) * 0.45)[..., None])
           + dry[None, None, :] * (weights["ground"] * smoothstep(0.55, 0.95, gv) * 0.45)[..., None])

    # ---- low-frequency luminance modulation: kills any residual sense of a repeat ----------
    mod = (vnoise(wx, wy, 620, 7) - 0.5) * 0.13 + (vnoise(wx, wy, 190, 9) - 0.5) * 0.07
    out *= (1.0 + mod)[..., None]

    # ---- LANDMARK SITES: the terrain owns the ground a landmark stands on --------------------
    # LANDMARK-SPRITE-CONTRACT.md splits the two halves deliberately: the sprite owns the
    # STRUCTURE, the terrain owns the SITE -- "packed-earth plaza, worn approach paths, trodden
    # grass, the clearing ... it IS terrain, so it blends by definition and needs no seam".
    # Without the site a composited sprite reads as a sticker dropped on grass, however good it
    # is, because its ground contact has nothing to sit in.
    #
    # The pad radius comes from the sprite's MEASURED footprint, the same measurement that
    # drives its anchor and contact shadow, so all three agree by construction rather than by a
    # guessed percentage (which was previously out by 43px on Greenhollow).
    for (lx, ly, rad, host, hf, _hdir) in SITES:
        px, py = (lx - X0C) * PX + PX // 2, (ly - Y0C) * PX + PX // 2
        if px < x0 - rad * 2 or px > x0 + w + rad * 2:
            continue
        if py < y0 - rad * 2 or py > y0 + h + rad * 2:
            continue
        dx, dy = wx - px, wy - py
        r = np.sqrt(dx * dx + dy * dy) + 1e-6
        # ragged, wandering edge so the clearing never reads as a drawn circle
        edge = rad * (0.80 + 0.34 * vnoise(px + dx * 0.35, py + dy * 0.35, rad * 0.42, 137))
        pad = 1.0 - smoothstep(edge * 0.68, edge, r)
        if pad.max() <= 0.004:
            continue
        # worn approaches: four trodden spurs reaching out of the clearing onto the open ground
        ang = np.arctan2(dy, dx)
        spur = np.abs(np.cos(2.0 * ang)) ** 6
        pad = np.clip(pad + spur * (1.0 - smoothstep(edge, edge * 1.85, r)) * 0.75, 0, 1)
        pad *= 0.55 + 0.45 * vnoise(wx, wy, 34, 139)          # broken, trodden, not a flat disc
        # A site is LAND. Port Sapphire stands right on the shore, and without this the pad and
        # its approach spurs painted a brown smear straight out across the sea.
        pad *= 1.0 - weights["water"]
        # The site adopts its HOST material. A cave in a cliff has scree and bare stone at its
        # foot, not a dirt plaza; a forest dungeon has leaf litter and damp earth. Using packed
        # earth everywhere was the second reason these two read as pasted on.
        tone = SITE_TONE.get(host, EARTH)
        opacity = 0.94 if host is None else 0.72   # let the host texture show through
        earth = tone[None, None, :] * (0.86 + 0.30 * vnoise(wx, wy, 19, 141))[..., None]
        k = (pad * opacity)[..., None]
        out = out * (1 - k) + earth * k

    # ---- coast: a GRADED shore, never a drawn line -------------------------------------------
    # The first attempt defined the shore on the sharp class weight, whose transition is only
    # ~8px wide, so every band came out as a hard contour -- the foam read as an inked outline
    # around the lake. The shore needs its own, much wider gradient to live on, and each band
    # has to be broken up by noise so it never closes into a continuous stroke.
    # Owner contract (LANDMARK-SPRITE-CONTRACT.md): "a soft graded coastline -- never a hard
    # line or a contour band".
    # wider than the class blur on purpose: the shore's bands need room to be read as a beach
    # rather than a line, and this field only drives colour, never which material is placed
    COAST_BLUR = 14.0
    cw0 = field((np.abs(sub - np.array(LEGEND["water"])).sum(axis=2) < 20).astype(np.float32),
                COAST_BLUR)
    # Carry the SAME displacement the water class boundary got, so the shore bands hug the
    # actual rendered waterline instead of the mask's contour. A blurred field's 0.5 contour
    # shifts by about d*sigma, so the displacement is rescaled by the blur ratio to move both
    # contours the same distance -- otherwise the sand would sit off the water's edge.
    #
    # GATE it exactly as the class weights are gated. Ungated, the displacement raised cw from
    # 0 to ~0.4 far inland and out at sea, which lands inside the sand and surf bands and threw
    # pale blotches of beach into the middle of open water and open meadow.
    cw = cw0 + disp["water"] * (BLUR / COAST_BLUR) * (4.0 * cw0 * (1.0 - cw0))
    # Vary the WIDTH of the shore bands without moving the waterline: scaling about the 0.5
    # contour leaves that contour exactly where it is, so the beach widens into bays and
    # pinches out at headlands the way a real shore does.
    cw = 0.5 + (cw - 0.5) * (0.68 + 0.64 * vnoise(wx, wy, 260, 37))
    rag = 0.45 + 0.55 * (vnoise(wx, wy, 90, 23) * 0.6 + vnoise(wx, wy, 31, 25) * 0.4)

    # A SOLID BANK, always, on the land side of every waterline.
    #
    # Making the class transfer crisp near water was not enough, and could not have been: it
    # still ends in one material handing over to another, so a treeline still dissolved into
    # the sea. Terrain does not do that -- a forest stops at a bank, and the bank is a thing in
    # its own right, not the absence of the two things either side of it.
    #
    # So the shore is now drawn as its own opaque band rather than blended out of the
    # neighbouring materials. It starts hard at the waterline and reaches inland by a wandering
    # width, painting over whatever is behind it, forest and rock included.
    inland = np.clip((0.5 - cw) / 0.40, 0, 1)          # 0 at the waterline, 1 well inland
    reach = 0.34 + 0.42 * (vnoise(wx, wy, 150, 23) * 0.65 + vnoise(wx, wy, 47, 25) * 0.35)
    bank = 1.0 - smoothstep(reach * 0.40, reach, inland)
    # Carry the bank a little way INTO the water rather than stopping dead on the waterline, so
    # it reads as a bank shelving into the shallows and reliably covers the foot of whatever
    # stands behind it. Ending exactly at the line left tree bases poking out below it.
    bank *= smoothstep(-0.24, -0.09, 0.5 - cw)
    wet = 1.0 - smoothstep(0.0, 0.34, inland)          # damp and darker right at the water
    sand_col = SAND[None, None, :] * (1.0 - 0.34 * wet)[..., None]
    # Only the BEACHY stretches get a real sand bank. On the vegetated stretches barely any
    # survives -- just a trace of shingle at the waterline -- so grass and canopy run straight
    # down into the water there instead of every lake wearing the same sandy ring.
    sand = bank * 0.96 * (0.05 + 0.95 * beachy)
    out = out * (1 - sand[..., None]) + sand_col * sand[..., None]

    # a damp, darker margin where vegetation meets the water on the non-beach stretches: wet
    # earth, exposed roots and shadow, which is what that edge actually looks like
    damp = (1.0 - beachy) * smoothstep(0.28, 0.50, cw) * (1.0 - smoothstep(0.50, 0.70, cw))
    damp *= 0.45 + 0.55 * vnoise(wx, wy, 58, 213)
    out *= (1.0 - damp * 0.30)[..., None]

    # shingle: scattered darker pebbles through the damp band, so the waterline has grain
    # rather than reading as clean airbrushed sand meeting clean water
    peb = np.clip(vnoise(wx, wy, 6.5, 51) * 1.9 - 0.92, 0, 1)
    peb *= smoothstep(0.16, 0.46, cw) * (1.0 - smoothstep(0.50, 0.64, cw))
    out *= (1.0 - peb * 0.42)[..., None]

    # sunlit shallows just offshore, fading out into the deep
    shelf = smoothstep(0.50, 0.66, cw) * (1.0 - smoothstep(0.66, 0.88, cw))
    out = out * (1 - (shelf * 0.40)[..., None]) \
        + np.array([44, 104, 124], np.float32)[None, None, :] * (shelf * 0.40)[..., None]

    # surf: broken, low-contrast, and only where the swell noise says so -- never continuous
    surf = smoothstep(0.44, 0.53, cw) * (1.0 - smoothstep(0.53, 0.63, cw))
    surf *= np.clip(vnoise(wx, wy, 44, 29) * 1.5 - 0.42, 0, 1)
    out = out * (1 - (surf * 0.45)[..., None]) + FOAM[None, None, :] * (surf * 0.45)[..., None]
    rgb = np.clip(out, 0, 255).astype(np.uint8)
    if not occlusion:
        return rgb

    # ---- OCCLUSION layer: the canopy that overdraws the hero --------------------------------
    # Measured off the shipped act1-hifi layer rather than guessed, because the contract is not
    # what it looks like: alpha is BINARY (0 or 242 -- no midtones anywhere in the chunk) and
    # where it is 242 the occlusion RGB is PIXEL-IDENTICAL to the base. So this layer is not a
    # separately-painted canopy at all; it is the base, masked. runtime.html draws it twice --
    # once at alpha .055 with an ambient offset, then again at full alpha after the hero -- and
    # because the colour matches the base exactly, the full-alpha pass is invisible over terrain
    # and only shows where it covers the hero. Reproducing that identity is the whole job.
    #
    # A hard cut, not a feather, for the same reason the treeline is near-binary: there is no
    # such thing as half a tree to walk behind. `weights["forest"]` is already crown-resolved,
    # so the cut lands on crown-shaped lobes rather than a circle.
    canopy = (weights["forest"] > CANOPY_CUT)
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., :3] = rgb
    rgba[..., 3] = np.where(canopy, CANOPY_ALPHA, 0).astype(np.uint8)
    return rgba


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--window", help="x0,y0,w,h in WORLD PIXELS; omit with --full")
    ap.add_argument("--full", action="store_true", help="render the whole act, in strips")
    ap.add_argument("--strip", type=int, default=1024)
    ap.add_argument("--out", default="/tmp/material-map.png")
    args = ap.parse_args()

    print("materials (graded once to the owner's target palette):")
    mats = load_materials()
    print("landmark sites (terrain owns the ground, the sprite owns the structure):")
    load_sites()
    sem = np.asarray(Image.open(MASK).convert("RGB")).astype(int)

    if args.full:
        W, H = sem.shape[1] * 3, sem.shape[0] * 3
        print(f"full act {W}x{H}, {args.strip}px strips")
        canvas = Image.new("RGB", (W, H))
        for y in range(0, H, args.strip):
            hh = min(args.strip, H - y)
            canvas.paste(Image.fromarray(render_window(0, y, W, hh, mats, sem)), (0, y))
            print(f"  rows {y:>5}-{y+hh:<5} ({100*(y+hh)/H:5.1f}%)")
        canvas.save(args.out)
        print(f"wrote {args.out}  {W}x{H}")
    else:
        x0, y0, w, h = (int(v) for v in args.window.split(","))
        W, H = sem.shape[1] * 3, sem.shape[0] * 3
        w, h = min(w, W - x0), min(h, H - y0)          # a window may not run past the act
        a = render_window(x0, y0, w, h, mats, sem)
        Image.fromarray(a).save(args.out)
        L = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
        print(f"wrote {args.out}  {w}x{h}  mean L {L.mean():.1f}")


if __name__ == "__main__":
    main()
