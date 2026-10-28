#!/usr/bin/env python3
"""Per-biome art kits for Acts 2-5, derived from the shipped Act 1 kits by palette remap/overlay.

Every kit keeps the Act 1 drawing (same atlas pixels, same crop, same normalisation); only colour changes:
  ground  : the R4 periodic meadow tile (96 texels/cell) luminance-mapped onto a biome ramp
  rock    : the 7 Act 1 cliff components (main kit x0.5, companion kit x0.125, alpha>=128 hard cut),
            recoloured (+ snow caps on top-lit faces / ember cracks in crevices)
  crowns  : the 7 Act 1 canopy crowns (side 68 world px -> 136 px at 32 px/cell), recoloured
  shore   : the sand band colour used by the coast pass
  sprites : Act 1 town / dungeon sprites and owprops recoloured so grass reads as the biome ground

Usage:  python3 scripts/acts/biome_kits.py [--sheets]   (writes kits-actN.png contact sheets)
"""
import os, sys, json, functools
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import acts_common as A
PROFILE = A.ROOT + '/design/terrain-current-profile-20261007'
sys.path.insert(0, PROFILE + '/r4-source/scripts')
import render_material_map_r4 as R4

BIOMES = ['grass', 'snow', 'haunt', 'sand', 'ash', 'dark']
ACT_BIOME = {1: 'grass', 2: 'snow', 3: 'sand', 4: 'ash', 5: 'dark'}

def _hash01(x, y, seed):
    n = (np.asarray(x, np.int64) * 374761393 + np.asarray(y, np.int64) * 668265263 + seed * 1442695041) & 0x7fffffff
    n = (n ^ (n >> 13)) * 1274126177 & 0x7fffffff
    return (n & 0xffff) / 65535.0

def ramp(t, stops):
    """t: float array 0..1; stops: [(pos, (r,g,b)), ...] sorted -> float RGB."""
    t = np.clip(t, 0, 1); pos = np.array([s[0] for s in stops], np.float32)
    col = np.array([s[1] for s in stops], np.float32)
    out = np.empty(t.shape + (3,), np.float32)
    for c in range(3): out[..., c] = np.interp(t, pos, col[:, c])
    return out

def lum(rgb):
    rgb = np.asarray(rgb, np.float32)
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114

def norm(L, mask=None, lo=2, hi=98):
    v = L[mask] if mask is not None else L
    a, b = np.percentile(v, lo), np.percentile(v, hi)
    return np.clip((L - a) / max(1e-3, b - a), 0, 1)

@functools.lru_cache(None)
def act1_paint():
    cfg, tex, crowns, rocks = R4._load_paint_art(PROFILE + '/r4-source/paint-source-r4-v5.json')
    return cfg, tex, crowns

# ---------------------------------------------------------------- ground
GROUND_RAMP = {
    # dark tufts .................................................. bright field
    'snow':  [(0, (122, 138, 168)), (0.35, (176, 192, 216)), (0.7, (222, 230, 242)), (1, (246, 249, 253))],
    'haunt': [(0, (112, 118, 146)), (0.35, (164, 170, 194)), (0.7, (202, 208, 226)), (1, (222, 226, 238))],
    'sand':  [(0, (170, 118, 62)), (0.35, (204, 158, 92)), (0.7, (228, 190, 124)), (1, (242, 212, 150))],
    'ash':   [(0, (44, 40, 42)), (0.35, (74, 68, 66)), (0.7, (106, 98, 92)), (1, (128, 120, 112))],
    'dark':  [(0, (36, 31, 40)), (0.35, (60, 53, 64)), (0.7, (82, 74, 86)), (1, (98, 90, 102))],
}
@functools.lru_cache(None)
def ground_tile(biome):
    """1254x1254 RGB uint8, periodic, sampled at 3 texels per output px with the Act 1 world phase."""
    _, tex, _ = act1_paint(); t = tex['meadow_a']
    if biome == 'grass': return t
    L = norm(lum(t), lo=1, hi=99.5)
    return np.clip(ramp(L, GROUND_RAMP[biome]), 0, 255).astype(np.uint8)

# shore band (coast pass): base colour, speck colour, wet multiplier
SHORE = {
    'grass': ((226, 198, 140), (196, 166, 112), 0.86),
    'snow':  ((168, 180, 198), (132, 144, 166), 0.84),
    'haunt': ((150, 156, 172), (118, 124, 142), 0.84),
    'sand':  ((232, 202, 142), (204, 168, 110), 0.86),
    'ash':   ((88, 80, 78), (52, 48, 50), 0.80),
    'dark':  ((92, 84, 92), (54, 48, 58), 0.80),
}
# foam tint per biome (snow/ice shores slightly bluer)
FOAM = {'grass': (235, 248, 255), 'snow': (230, 244, 255), 'haunt': (220, 232, 244), 'sand': (235, 248, 255),
        'ash': (200, 214, 226), 'dark': (190, 200, 216)}

# ---------------------------------------------------------------- rock kit
@functools.lru_cache(None)
def act1_rock_sources():
    comp = json.load(open(PROFILE + '/placements/cliff-composition-report.json'))
    comps = {c['name']: c for c in comp['coordinateContract']['assetComponents']}
    atl = {'main': PROFILE + '/atlases/act1-cliff-kit-imagegen-v1.png',
           'companion': PROFILE + '/atlases/companion-cliff-kit-imagegen-v2.png'}
    out = {}
    for name, c in comps.items():
        src = Image.open(atl[c['group']]).convert('RGBA').crop(tuple(c['sourceCrop']))
        s = 0.5 if c['group'] == 'main' else 0.125
        im = src.resize((round(src.width * s), round(src.height * s)), Image.NEAREST)
        a = np.asarray(im).copy(); a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
        ys, xs = np.nonzero(a[..., 3]); a = a[:ys.max() + 1]
        out[name] = a
    return out

ROCK_RAMP = {
    'grass': None,
    'snow':  [(0, (30, 34, 50)), (0.35, (70, 76, 96)), (0.7, (116, 122, 142)), (1, (164, 172, 190))],
    'haunt': [(0, (28, 28, 40)), (0.35, (62, 62, 80)), (0.7, (98, 98, 118)), (1, (140, 140, 160))],
    'sand':  [(0, (78, 30, 18)), (0.3, (150, 66, 34)), (0.65, (204, 112, 58)), (1, (244, 178, 114))],
    'ash':   [(0, (8, 6, 12)), (0.35, (26, 24, 34)), (0.72, (54, 52, 66)), (0.92, (96, 96, 116)), (1, (150, 150, 172))],
    'dark':  [(0, (22, 20, 28)), (0.35, (52, 50, 60)), (0.7, (86, 84, 96)), (1, (126, 124, 138))],
}
def recolor_rock(rgba, biome, seed=7):
    a = rgba.copy(); m = a[..., 3] > 0
    if biome == 'grass' or not m.any(): return a
    L = norm(lum(a[..., :3]), m, 1, 99)
    rgb = ramp(L, ROCK_RAMP[biome])
    H, W = m.shape; yy, xx = np.mgrid[0:H, 0:W]
    if biome in ('snow', 'haunt'):
        # snow caps: top-lit faces = bright pixels whose upper neighbour is brighter-or-sky; more snow higher up
        Lr = lum(a[..., :3]); up = np.vstack([np.zeros((1, W)), Lr[:-1]])
        top_air = np.vstack([np.zeros((1, W), bool), ~m[:-1]])
        lit = L > (0.6 if biome == 'snow' else 0.86)
        ys = np.nonzero(m.any(1))[0]; hfrac = (yy - ys.min()) / max(1, ys.max() - ys.min())
        cap = m & (lit | (top_air & (L > 0.3))) & (hfrac < (0.85 if biome == 'snow' else 0.5))
        cap = ndi.binary_opening(cap, np.ones((1, 2), bool)) | (cap & top_air)
        snowc = ramp(np.clip((L - 0.5) * 2, 0, 1), [(0, (196, 210, 232)), (0.5, (230, 238, 248)), (1, (252, 253, 255))])
        if biome == 'haunt': snowc = snowc * 0.82
        rgb = np.where(cap[..., None], snowc, rgb)
    if biome == 'ash':
        # ember cracks: the darkest crevice pixels in the lower 70% of the object glow orange
        ys = np.nonzero(m.any(1))[0]; hfrac = (yy - ys.min()) / max(1, ys.max() - ys.min())
        crev = m & (L < 0.12) & (hfrac > 0.3)
        gate = _hash01(xx // 6, yy // 9, seed) < 0.22
        crack = crev & gate
        hot = ramp(_hash01(xx, yy, seed + 1), [(0, (196, 52, 16)), (0.6, (244, 112, 28)), (1, (255, 186, 70))])
        rgb = np.where(crack[..., None], hot, rgb)
        glow = ndi.gaussian_filter(crack.astype(np.float32), 1.6) * m
        rgb = rgb + glow[..., None] * np.array([120, 40, 0], np.float32) * 1.4
    a[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return a

# ---------------------------------------------------------------- Codex cliff kits (lead 2026-10-28)
# kit-actN-cliffs-tryK.png: 1254x1254, 2x2 panels on pure magenta, same construction as Act 1's main kit.
# Keyed (magenta -> alpha, hard cut, edge despill), sliced, x0.5 nearest like Act 1's main kit, and padded
# bottom-centre onto one canvas per slot so a placement (top-left origin) fits every act's panel.
CODEX_PICK = {2: 'try1', 3: 'try1', 4: 'try1', 5: 'try1'}
SLOT_QUAD = {'broad-joining-mass-A': (0, 0), 'narrow-notch-buttress': (0, 1),
             'broad-joining-mass-B': (1, 0), 'interior-rock-panel': (1, 1)}
CODEX_ACT = {'snow': 2, 'haunt': 2, 'grass': 2, 'sand': 3, 'ash': 4, 'dark': 5}

def _codex_dir():
    import acts_common as A
    return os.environ.get('CODEX_KITS', os.path.join(os.path.dirname(A.SCRATCH), 'codex-kits'))

def key_magenta(rgb):
    """-> RGBA: background where min(R,B)-G > 120 (pure magenta 255,0,255), hard alpha, holes < 400 px
    filled, specks dropped, and a 3 px despill band that removes the magenta excess from edge pixels."""
    x = rgb.astype(np.int32); mg = np.minimum(x[..., 0], x[..., 2]) - x[..., 1]
    fg = mg <= 120
    lab, n = ndi.label(fg)
    if n:
        sz = ndi.sum(fg, lab, range(1, n + 1)); fg = np.isin(lab, 1 + np.flatnonzero(sz >= 600))
    holes = ndi.binary_fill_holes(fg) & ~fg
    hl, hn = ndi.label(holes)
    if hn:
        hs = ndi.sum(holes, hl, range(1, hn + 1)); small = np.isin(hl, 1 + np.flatnonzero(hs < 400))
    else: small = np.zeros_like(fg)
    band = ndi.binary_dilation(~fg, iterations=3) & fg
    exc = np.clip(mg - 30, 0, None) * band
    x[..., 0] -= exc; x[..., 2] -= exc
    if small.any():
        dark = np.percentile(x[fg][:, :3].sum(1), 8); sel = fg & (x[..., :3].sum(-1) <= dark)
        x[small] = x[sel].mean(0).astype(np.int32) if sel.any() else 40
        fg = fg | small
    out = np.zeros(rgb.shape[:2] + (4,), np.uint8)
    out[..., :3] = np.clip(x, 0, 255); out[..., 3] = fg * 255
    return out

@functools.lru_cache(None)
def codex_panels(act):
    """slot -> RGBA panel at Act 1 main-kit scale (x0.5), trimmed to its alpha; None if the sheet is missing."""
    f = f"{_codex_dir()}/kit-act{act}-cliffs/kit-act{act}-cliffs-{CODEX_PICK[act]}.png"
    if not os.path.exists(f): return None
    rgba = key_magenta(np.asarray(Image.open(f).convert('RGB')))
    H, W = rgba.shape[:2]; h2, w2 = H // 2, W // 2; out = {}
    # slice by connected component (a peak may cross the quadrant line), assigned by centroid quadrant
    lab, n = ndi.label(rgba[..., 3] > 0); cm = ndi.center_of_mass(rgba[..., 3] > 0, lab, range(1, n + 1))
    quad = {i + 1: (int(cy >= h2), int(cx >= w2)) for i, (cy, cx) in enumerate(cm)}
    for slot, rc in SLOT_QUAD.items():
        sel = np.isin(lab, [i for i, q_ in quad.items() if q_ == rc])
        q = rgba.copy(); q[~sel] = 0
        ys, xs = np.nonzero(sel); q = q[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        im = Image.fromarray(q).resize((round(q.shape[1] * 0.5), round(q.shape[0] * 0.5)), Image.NEAREST)
        a = np.asarray(im).copy(); a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
        ys, xs = np.nonzero(a[..., 3]); out[slot] = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return out

@functools.lru_cache(None)
def cliff_geometry():
    """slot -> {'canvas': (H, W), 'acts': {act: padded RGBA}, 'union': alpha, 'inter': alpha}; every
    available act's panel padded bottom-centre onto the slot's common canvas."""
    have = {a: codex_panels(a) for a in (2, 3, 4, 5)}; have = {a: p for a, p in have.items() if p}
    geo = {}
    if 2 not in have: return geo
    for slot in SLOT_QUAD:
        ps = {a: p[slot] for a, p in have.items()}
        Hc = max(p.shape[0] for p in ps.values()); Wc = max(p.shape[1] for p in ps.values())
        acts = {}
        for a, p in ps.items():
            c = np.zeros((Hc, Wc, 4), np.uint8); h, w = p.shape[:2]; x0 = (Wc - w) // 2
            c[Hc - h:, x0:x0 + w] = p; acts[a] = c
        al = np.stack([c[..., 3] > 0 for c in acts.values()])
        geo[slot] = {'canvas': (Hc, Wc), 'acts': acts, 'union': al.any(0), 'inter': al.all(0)}
    return geo

@functools.lru_cache(None)
def _act1_rock_tones(bins=24):
    px = np.concatenate([v[v[..., 3] > 0][:, :3] for k, v in act1_rock_sources().items()
                         if not k.startswith('companion')]).astype(np.float32)
    L = lum(px); o = np.argsort(L); ch = np.array_split(px[o], bins)
    return [(i / (bins - 1), tuple(c.mean(0))) for i, c in enumerate(ch)]

def codex_rock(slot, biome, seed=7):
    geo = cliff_geometry()[slot]; acts = geo['acts']; want = CODEX_ACT[biome]
    if biome == 'grass':          # Act 1's rock tones on the Act 2 panel (snowline fade at the Act 1 seam)
        a = acts[2].copy(); m = a[..., 3] > 0
        a[..., :3] = np.clip(ramp(norm(lum(a[..., :3]), m, 1, 99), _act1_rock_tones()), 0, 255).astype(np.uint8)
        return a
    if biome == 'haunt':          # Ravenhollow: the Act 2 panel in dusk light
        a = acts[2].copy(); a[..., :3] = np.clip(a[..., :3] * np.array([0.72, 0.72, 0.82]), 0, 255).astype(np.uint8)
        return a
    if want in acts: return acts[want].copy()
    return recolor_rock(acts[2], biome, seed)   # fallback until the act's own sheet lands (Act 5)

@functools.lru_cache(None)
def rock_kit(biome):
    if cliff_geometry():
        return {k: codex_rock(k, biome, seed=hash(k) & 0xffff) for k in SLOT_QUAD}
    return {k: recolor_rock(v, biome, seed=hash(k) & 0xffff) for k, v in act1_rock_sources().items()}

# ---------------------------------------------------------------- crowns
CROWN_RAMP = {
    'grass': None,
    'snow':  [(0, (10, 30, 38)), (0.4, (28, 62, 62)), (0.75, (52, 96, 88)), (1, (86, 130, 118))],
    'haunt': [(0, (16, 20, 32)), (0.4, (40, 50, 66)), (0.75, (70, 84, 102)), (1, (112, 126, 146))],
    'sand':  [(0, (26, 54, 14)), (0.4, (70, 112, 26)), (0.75, (128, 164, 44)), (1, (196, 210, 96))],
    'ash':   [(0, (10, 7, 6)), (0.4, (32, 24, 20)), (0.75, (58, 46, 38)), (1, (96, 80, 66))],
    'dark':  [(0, (28, 22, 30)), (0.4, (64, 54, 66)), (0.75, (102, 90, 104)), (1, (146, 134, 150))],
}
def recolor_crown(rgba, biome, seed=3):
    a = rgba.copy(); m = a[..., 3] > 0
    if biome == 'grass': return a
    c = a[..., :3].astype(np.int32)
    trunk = m & (c[..., 0] > c[..., 1] + 6)
    leaf = m & ~trunk
    L = norm(lum(a[..., :3]), leaf, 1, 99)
    rgb = ramp(L, CROWN_RAMP[biome])
    H, W = m.shape; yy, xx = np.mgrid[0:H, 0:W]
    if biome == 'snow':
        Lr = lum(a[..., :3]); top_air = np.vstack([np.zeros((1, W), bool), ~m[:-1]])
        cap = leaf & ((L > 0.62) | (top_air & (L > 0.3)))
        snowc = ramp(np.clip((L - 0.55) * 2.2, 0, 1), [(0, (190, 206, 228)), (0.6, (232, 240, 250)), (1, (255, 255, 255))])
        rgb = np.where(cap[..., None], snowc, rgb)
    if biome == 'haunt':
        frost = leaf & (L > 0.8)
        rgb = np.where(frost[..., None], np.array([120, 128, 150], np.float32), rgb)
    if biome == 'dark':
        # dead / leafless read: thin the foliage mass (holes in the mid-tones), keep the silhouette rim
        rim = m & ~ndi.binary_erosion(m, iterations=3)
        holes = leaf & ~rim & (L > 0.15) & (L < 0.66) & (_hash01(xx // 2, yy // 2, seed + 5) < 0.7)
        a[..., 3] = np.where(holes, 0, a[..., 3])
        twig = leaf & (L <= 0.18)
        rgb = np.where(twig[..., None], np.array([34, 26, 38], np.float32), rgb)
    if biome == 'ash':
        ember = leaf & (L > 0.9) & (_hash01(xx // 3, yy // 3, seed) < 0.35)
        rgb = np.where(ember[..., None], np.array([226, 96, 30], np.float32), rgb)
    tr = c.astype(np.float32) * {'snow': .7, 'haunt': .45, 'sand': .95, 'ash': .4, 'dark': .55}[biome]
    if biome == 'dark': tr = tr * np.array([0.9, 0.85, 1.0])
    rgb = np.where(trunk[..., None], tr, rgb)
    a[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return a

@functools.lru_cache(None)
def crown_sources():
    """The 7 Act 1 crowns at final size (side 68 world px = 136 px @32ppc), nearest RGB, alpha>=128."""
    _, _, crowns = act1_paint(); out = []
    for raw in crowns:
        raw = raw.convert('RGBA'); s = 68 / max(raw.size)
        size = (max(1, round(raw.width * s * 2)), max(1, round(raw.height * s * 2)))
        al = np.asarray(raw.getchannel('A').resize(size, Image.NEAREST))
        rgb = np.asarray(raw.convert('RGB').resize(size, Image.NEAREST))
        out.append(np.dstack([rgb, np.where(al >= 128, 255, 0).astype(np.uint8)]))
    return out

DEAD_RAMP = [(0, (34, 26, 38)), (0.35, (100, 88, 106)), (0.7, (152, 140, 158)), (1, (198, 188, 204))]

@functools.lru_cache(None)
def crown_kit_solid(biome):
    """-> list of 7 (rgba, solid-mask). Act 3 sand = procedural palm clumps, Act 5 dark = leafless dead-tree
    clumps (ow_crowns.py, towns-agent method); other biomes = recoloured Act 1 crowns (solid = alpha)."""
    if biome in ('sand', 'dark'):
        import ow_crowns
        out = []
        for rgba, solid in ow_crowns.crowns('palm' if biome == 'sand' else 'dead'):
            a = rgba.copy()
            if biome == 'dark':
                m = a[..., 3] > 0; L = lum(a[..., :3]); Ln = norm(L, m, 1, 99)
                a[..., :3] = np.clip(ramp(Ln, DEAD_RAMP), 0, 255).astype(np.uint8)
                a[np.all(rgba[..., :3] == (34, 30, 18), -1) & m, :3] = (20, 16, 24)   # keep the dark outline
            out.append((a, solid))
        return out
    return [(c, c[..., 3] > 0) for c in (recolor_crown(c, biome, seed=i + 11) for i, c in enumerate(crown_sources()))]

def crown_kit(biome):
    return [c for c, _ in crown_kit_solid(biome)]

# ---------------------------------------------------------------- sprites (towns / dungeons)
SPRITE_GROUND = {'snow': 'snow', 'haunt': 'haunt', 'sand': 'sand', 'ash': 'ash', 'dark': 'dark'}
ROOF_TINT = {'snow': (0.95, 1.0, 1.1), 'haunt': (0.8, 0.8, 0.95), 'sand': (1.12, 1.0, 0.82),
             'ash': (0.85, 0.72, 0.68), 'dark': (0.78, 0.7, 0.86)}
def recolor_sprite(rgba, biome, keep_hue=False):
    """Greens (grass, bushes, moss) become the biome ground/foliage ramp; everything else is tinted."""
    a = np.asarray(rgba).copy(); m = a[..., 3] > 0
    if biome == 'grass': return a
    c = a[..., :3].astype(np.float32); r, g, b = c[..., 0], c[..., 1], c[..., 2]
    green = m & (g > r + 6) & (g > b + 4)
    L = lum(c); Ln = norm(L, green if green.any() else m, 1, 99)
    gr = GROUND_RAMP[SPRITE_GROUND[biome]]
    if biome == 'sand':  # oasis towns keep some palms: alternate bright greens stay olive
        gr = [(0, (120, 96, 50)), (0.4, (184, 146, 86)), (0.8, (226, 190, 128)), (1, (244, 214, 156))]
    newg = ramp(Ln, gr)
    out = c * np.array(ROOF_TINT[biome], np.float32)
    if biome in ('ash', 'dark', 'haunt'):
        sat = c.mean(-1, keepdims=True); out = (out * 0.6 + sat * 0.4) * (0.78 if biome != 'haunt' else 0.85)
    if biome == 'snow':  # roofs get a snow dusting on their brightest pixels
        roofish = m & ~green & (L > np.percentile(L[m], 80))
        out = np.where(roofish[..., None], out * 0.4 + np.array([235, 242, 252]) * 0.6, out)
    out = np.where(green[..., None], newg, out)
    a[..., :3] = np.clip(out, 0, 255).astype(np.uint8)
    return a

# ---------------------------------------------------------------- contact sheet
def contact_sheet(act):
    biomes = ['snow', 'haunt'] if act == 2 else [ACT_BIOME[act]]
    rows = []
    for bi in biomes:
        W = 1800; row = Image.new('RGBA', (W, 640), (40, 40, 48, 255))
        g = ground_tile(bi); row.paste(Image.fromarray(g[:600:3 * 1, :600][::1]).resize((300, 300), Image.NEAREST), (10, 10))
        # ground sample at final scale (every 3rd texel = 32 px/cell)
        gs = Image.fromarray(np.ascontiguousarray(g[::3, ::3][:300, :300])); row.paste(gs, (10, 320))
        sh = SHORE[bi][0]; row.paste(Image.new('RGBA', (60, 60), sh + (255,)), (320, 10))
        x = 400
        for k, v in rock_kit(bi).items():
            im = Image.fromarray(v); row.alpha_composite(im, (x, 630 - im.height)); x += im.width + 8
        x = 400
        for c in crown_kit(bi):
            im = Image.fromarray(c); row.alpha_composite(im, (x, 10)); x += im.width + 4
        rows.append(row)
    sheet = Image.new('RGBA', (1800, 640 * len(rows)), (0, 0, 0, 255))
    for i, r in enumerate(rows): sheet.paste(r, (0, 640 * i))
    return sheet.convert('RGB')

if __name__ == '__main__':
    os.makedirs(A.PREVIEW, exist_ok=True)
    for act in (2, 3, 4, 5):
        p = A.PREVIEW + f'/kits-act{act}.png'; contact_sheet(act).save(p, optimize=True); print('wrote', p)
