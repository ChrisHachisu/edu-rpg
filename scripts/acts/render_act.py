#!/usr/bin/env python3
"""Render one act (2-5) of the overworld at 32 px/cell into Act-1-style 512 px chunk layers.

  python3 scripts/acts/render_act.py --act 2 [--out DIR] [--no-chunks]

Layers (same names as public/act1-hifi/chunks): base (RGB webp lossless, UnsharpMask r0.9 130% t2),
water-r2 (RGBA, antialiased water alpha), foam (RGBA), forest (RGBA: whole trees + whole cliff objects),
front (RGBA walk-behind tops), crest (3 half-res frames, RGB premultiplied by alpha, blue glints).
Data: collision.png (1-bit, px32, 1 = blocked, feet-only), walkbehind.png (1-bit), landmarks.json
(+ recoloured sprites in landmarks/), manifest.json.

Coast method = scripts/b89/coast.py as run by scripts/b91/fullcoast91.py (CORRIDOR 160, FRONT 200,
JOIN 48, ROCKFILL off), with the rock mask taken from the placed objects instead of a colour guess.
"""
import os, sys, json, argparse, time, hashlib, base64
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import acts_common as A
import biome_kits as K
import placements as PL

P = 32
MARGIN = 10                     # cells of context rendered around the act bounds
ACT1_ORIGIN = (16, 218)         # meadow tile world phase (Act 1 renderer is phased from its chunk origin)
CORRIDOR, FRONT, JOIN = 160, 200, 48
TRIM_T, TRIM_MINRUN = 24, 40    # walk-behind: top 24 px of every collision run longer than 40 px
SEED = 20261028
HAUNT_BOX = (226, 222, 312, 302)  # Act 2 north-east: Ravenhollow + Haunted Forest band (x0,y0,x1,y1 cells)

def log(*a): print(f'[{time.strftime("%H:%M:%S")}]', *a, flush=True)

# ------------------------------------------------------------------ noise (world-phased)
def vnoise(x0, y0, W, H, scale, seed):
    xs = (x0 + np.arange(W)) / scale; ys = (y0 + np.arange(H)) / scale
    ix = np.floor(xs).astype(np.int64); iy = np.floor(ys).astype(np.int64)
    fx = xs - ix; fy = ys - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
    gx = np.arange(ix.min(), ix.max() + 2); gy = np.arange(iy.min(), iy.max() + 2)
    lat = K._hash01(gx[None, :], gy[:, None], seed).astype(np.float32)
    a = ix - gx[0]; b = iy - gy[0]
    rows = lat[:, a] * (1 - fx)[None, :] + lat[:, a + 1] * fx[None, :]
    return (rows[b] * (1 - fy)[:, None] + rows[b + 1] * fy[:, None]).astype(np.float32)

def up(cellarr, sigma_cells, order=1):
    """Smooth a cell-level float field and resample it to px (cell centres at px 16)."""
    f = ndi.gaussian_filter(cellarr.astype(np.float32), sigma_cells, mode='nearest') if sigma_cells else cellarr.astype(np.float32)
    h, w = f.shape
    yy = (np.arange(h * P) + 0.5) / P - 0.5; xx = (np.arange(w * P) + 0.5) / P - 0.5
    # separable linear interpolation
    x0 = np.clip(np.floor(xx).astype(int), 0, w - 1); x1 = np.clip(x0 + 1, 0, w - 1); tx = np.clip(xx - np.floor(xx), 0, 1)
    y0 = np.clip(np.floor(yy).astype(int), 0, h - 1); y1 = np.clip(y0 + 1, 0, h - 1); ty = np.clip(yy - np.floor(yy), 0, 1)
    r = f[:, x0] * (1 - tx) + f[:, x1] * tx
    return (r[y0] * (1 - ty)[:, None] + r[y1] * ty[:, None]).astype(np.float32)

# ------------------------------------------------------------------ biome field
def biome_cells(cls, act):
    """Per-cell biome label index into K.BIOMES; cells with no act get the nearest act's biome."""
    lab = np.full(act.shape, -1, np.int16)
    for a, b in K.ACT_BIOME.items(): lab[act == a] = K.BIOMES.index(b)
    # haunted sub-flavour: Act 2 cells within ~8 cells of the Haunted Forest band / Ravenhollow
    x0, y0, x1, y1 = HAUNT_BOX
    core = np.zeros_like(lab, bool); core[y0:y1 + 1, x0:x1 + 1] = (cls[y0:y1 + 1, x0:x1 + 1] == A.FOREST)
    core[242:251, 245:254] = True
    dist = ndi.distance_transform_edt(~core)
    yy, xx = np.mgrid[0:act.shape[0], 0:act.shape[1]]
    wob = 3.0 * np.sin(xx / 7.0) + 2.0 * np.cos(yy / 5.0 + xx / 11.0)
    lab[(dist < 8 + wob) & (act == 2)] = K.BIOMES.index('haunt')
    # snowline fades toward Act 1: Act 2's first 6 columns of the divider range keep Act 1's rock colour
    # fix4 (owner 2026-10-28): no Act 1 paint inside Acts 2-5 -- the old 'grass' seam columns are gone
    # Act 3/4 overlap (y 88-128): Act 4's rows win for terrain; the ash->sand change sits at y~110
    ov = np.zeros(lab.shape, bool); ov[110:129, 163:315] = True
    lab[ov & (act == 4)] = K.BIOMES.index('sand')
    miss = lab < 0
    if miss.any():
        _, (iy, ix) = ndi.distance_transform_edt(miss, return_indices=True); lab = lab[iy, ix]
    # domain warp: biome borders meander (+-7 cells) instead of following the act rectangles
    H_, W_ = lab.shape
    dx = (vnoise(0, 0, W_, H_, 19, SEED + 31) - 0.5) * 30 + (vnoise(0, 0, W_, H_, 7, SEED + 33) - 0.5) * 9
    dy = (vnoise(0, 0, W_, H_, 19, SEED + 32) - 0.5) * 30 + (vnoise(0, 0, W_, H_, 7, SEED + 34) - 0.5) * 9
    yy, xx = np.mgrid[0:H_, 0:W_]
    wy = np.clip(np.round(yy + dy).astype(int), 0, H_ - 1); wx = np.clip(np.round(xx + dx).astype(int), 0, W_ - 1)
    warped = lab[wy, wx]
    # band-limit: a cell only takes a neighbour's biome within 9 cells of the act border (3 along the
    # central N-S divider range x 150-176, so Act 3/4 colours don't spill across onto Act 5's slopes)
    orig_act = lab; edge = np.zeros(lab.shape, bool)
    edge[:-1] |= orig_act[:-1] != orig_act[1:]; edge[1:] |= orig_act[:-1] != orig_act[1:]
    edge[:, :-1] |= orig_act[:, :-1] != orig_act[:, 1:]; edge[:, 1:] |= orig_act[:, :-1] != orig_act[:, 1:]
    dedge = ndi.distance_transform_edt(~edge)
    band = 12
    lab = np.where(dedge <= band, warped, lab)
    # Act 1 owns its shipped art: grass stays grass inside Act 1's bounds, and the first columns of
    # Act 2's divider range keep Act 1's rock colour so the snowline fades in east of the seam
    # fix4: Act 1's cells are never painted by Acts 2-5 (Act 1's plate covers them at runtime), so they take
    # the nearest Acts 2-5 biome -- no grass ever blends into an act's own ground, rocks or trees
    g = K.BIOMES.index('grass')
    lab[act == 1] = g
    m_ = lab == g
    if m_.any():
        _, (iy, ix) = ndi.distance_transform_edt(m_, return_indices=True); lab = lab[iy, ix]
    return lab

def biome_weights(lab_win, gx0, gy0):
    """px weights {biome: HxW float32}; organic, noise-perturbed transitions ~4-6 cells wide."""
    H, W = lab_win.shape[0] * P, lab_win.shape[1] * P
    present = [i for i in range(len(K.BIOMES)) if (lab_win == i).any()]
    n1 = vnoise(gx0, gy0, W, H, 96, SEED + 1) - 0.5; n2 = vnoise(gx0, gy0, W, H, 23, SEED + 2) - 0.5
    ws = {}
    for i in present:
        sig = 3.0 if K.BIOMES[i] == 'haunt' else 4.5
        w = up((lab_win == i).astype(np.float32), sig)
        nn = (vnoise(gx0, gy0, W, H, 61, SEED + 10 + i) - 0.5) + 0.5 * (vnoise(gx0, gy0, W, H, 19, SEED + 20 + i) - 0.5)
        ws[i] = np.clip(w + 0.45 * nn + 0.25 * n1 * (i % 2 * 2 - 1) + 0.12 * n2, 0, None) ** 3
    tot = sum(ws.values()) + 1e-6
    return {K.BIOMES[i]: (w / tot).astype(np.float32) for i, w in ws.items()}

# ------------------------------------------------------------------ object drawing
def draw_objects(win, doc, bw_cell, lab_full, near=None):
    """Draw whole trees + whole cliff objects (sorted by contact y) into an RGBA layer.
    biome per object = biome label at its contact cell, dithered by a hash across boundaries."""
    cx0, cy0, cx1, cy1 = win; W, H = (cx1 - cx0) * P, (cy1 - cy0) * P
    layer = np.zeros((H, W, 4), np.uint8); rockm = np.zeros((H, W), bool); treem = np.zeros((H, W), bool)
    solidm = np.zeros((H, W), bool)   # feet collision of trees: closed silhouettes (palms / dead trees have gaps)
    events = []
    rk = K.act1_rock_sources(); crs = K.crown_sources(); geo = K.cliff_geometry()
    for i, r in enumerate(doc['rocks']):
        im = rk[r['asset']] if not geo else geo[r['asset']]['union'][..., None].repeat(4, -1).astype(np.uint8); ox, oy = r['originWorldCell']
        x = int(round((ox - cx0) * P)); y = int(round((oy - cy0) * P)); h, w = im.shape[:2]
        if x > W or y > H or x + w < 0 or y + h < 0: continue
        a = im[..., 3]; by = h - 1; cols = np.flatnonzero(a[by]); ax = int(np.median(cols))
        events.append((y + by, 'rock', r, x, y, (ox + ax / P, oy + by / P), i))
    for i, t in enumerate(doc['trees']):
        im = crs[t['sourceIndex']]; h, w = im.shape[:2]
        cx, cy = t['center']; x = round((cx - cx0) * P - w / 2); y = round((cy - cy0) * P - h / 2)
        if x > W or y > H or x + w < 0 or y + h < 0: continue
        events.append((y + h - 1, 'tree', t, x, y, (cx, cy + h / 2 / P), i))
    events.sort(key=lambda e: (e[0], e[3]))
    cache = {}
    for cy_, kind, rec, x, y, (wx, wy), i in events:
        # biome: sample the smooth cell weights at the contact point, pick by hash (dithered boundary)
        iy = int(np.clip(wy, 0, A.GH - 1)); ix = int(np.clip(wx, 0, A.GW - 1))
        if kind == 'rock' and near is not None:
            # a cliff takes the kit of the open ground its face looks onto (nearest non-mountain land cell),
            # so a range on an act border splits along its crest instead of into colour columns
            # query point jittered by a smooth noise vector (+-6 cells, ~10-cell features) so the crest
            # split between two kits wanders instead of running straight along a straight range
            jx = int(round((near[2][iy, ix] - 0.5) * 12)); jy = int(round((near[3][iy, ix] - 0.5) * 8))
            qy = int(np.clip(iy + jy, 0, A.GH - 1)); qx = int(np.clip(ix + jx, 0, A.GW - 1))
            iy, ix = near[0][qy, qx], near[1][qy, qx]
        bi = int(np.argmax(bw_cell[:, iy, ix])); b = K.BIOMES[bi]
        if kind == 'rock':
            key = ('r', rec['asset'], b)
            if key not in cache: cache[key] = K.rock_kit(b)[rec['asset']]
        else:
            lst = K.crown_kit_solid(b)   # Codex clump sheets have 12 entries: spread the 7 Act 1 indices
            si = rec['sourceIndex'] if len(lst) == 7 else (rec['sourceIndex'] + 7 * int(rec['id'][-1])) % len(lst)
            key = ('t', si, b, rec['flipX'])
            if key not in cache:
                c, sd = lst[si]
                cache[key] = (c[:, ::-1], sd[:, ::-1]) if rec['flipX'] else (c, sd)
        if kind == 'tree':
            im, sd = cache[key]; h, w = im.shape[:2]
            cx_, cy_ = rec['center']; x = round((cx_ - cx0) * P - w / 2); y = round((cy_ - cy0) * P - h / 2)
        else:
            im = cache[key]; h, w = im.shape[:2]
        X0, Y0 = max(0, x), max(0, y); X1, Y1 = min(W, x + w), min(H, y + h)
        if X1 <= X0 or Y1 <= Y0: continue
        s = im[Y0 - y:Y1 - y, X0 - x:X1 - x]; m = s[..., 3] > 0
        layer[Y0:Y1, X0:X1][m] = s[m]
        (rockm if kind == 'rock' else treem)[Y0:Y1, X0:X1] |= m
        if kind == 'tree': solidm[Y0:Y1, X0:X1] |= sd[Y0 - y:Y1 - y, X0 - x:X1 - x]
        else: solidm[Y0:Y1, X0:X1] &= ~m
        # a tree drawn over rock hides it -> the pixel is no longer rock
        if kind == 'tree': rockm[Y0:Y1, X0:X1] &= ~m
        else: treem[Y0:Y1, X0:X1] &= ~m
    return layer, rockm, treem, solidm

# ------------------------------------------------------------------ coast (b89/b91 method)
def edt(m):
    return ndi.distance_transform_edt(m).astype(np.float32)

def coast(base, water0, rockm, ground_ok, keep, shore_rgb, speck_rgb, wetmul, gx0, gy0):
    """base float HxWx3 (land ground), water0 bool (smoothed sea+lakes), rockm bool (cliff alpha).
    Returns water bool, out (land+sand+textured water) float, extras."""
    H, W = water0.shape
    n = lambda s, k: vnoise(gx0, gy0, W, H, s, SEED + 100 + k)
    rock = rockm
    water = water0.copy()
    grassy = ground_ok & ~rock
    # the ground ribbon between rock and water becomes water: rock overhangs the sea
    near_rock = ndi.binary_dilation(rock, iterations=22)
    ribbon = near_rock & ~rock & grassy & ndi.binary_dilation(water, iterations=26)
    water = water | ribbon
    water = ndi.binary_opening(water, iterations=2)
    lab, nl = ndi.label(~water)
    if nl:
        sizes = ndi.sum(np.ones_like(lab), lab, range(1, nl + 1))
        water = water | np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s < 4000])
    labw, nw = ndi.label(water)
    if nw:
        sz = ndi.sum(np.ones_like(labw), labw, range(1, nw + 1))
        water = water & ~np.isin(labw, [i + 1 for i, s in enumerate(sz) if s < 300])
    lg, ng = ndi.label(~water & ~rock)
    if ng:
        gs = ndi.sum(np.ones_like(lg), lg, range(1, ng + 1))
        tl = set(np.unique(lg[ndi.binary_dilation(water, iterations=2)]))
        water = water | (grassy & np.isin(lg, [i + 1 for i, v in enumerate(gs) if v < 8000 and (i + 1) in tl]))
    # CORRIDOR (ROCKFILL off, FRONT on)
    dr_ = edt(~rock); dw_ = edt(~water)
    cand = ~water & ~rock & grassy & (dr_ + dw_ < CORRIDOR) & (dw_ < CORRIDOR * 0.75)
    del dr_, dw_
    lc, nc = ndi.label(cand)
    if nc:
        touch = set(np.unique(lc[ndi.binary_dilation(water, iterations=2) & cand])) - {0}
        corr = np.isin(lc, list(touch))
        above = ndi.maximum_filter1d(rock, size=2 * FRONT + 1, axis=0, origin=FRONT)
        corr = corr & ~above
        water = water | corr
    water = ndi.binary_opening(water, iterations=2) | (water & ndi.binary_dilation(rock, iterations=2))
    lg2, ng2 = ndi.label(~water & ~rock)
    if ng2:
        gs2 = ndi.sum(np.ones_like(lg2), lg2, range(1, ng2 + 1))
        tl2 = set(np.unique(lg2[ndi.binary_dilation(water, iterations=2)]))
        water = water | np.isin(lg2, [i + 1 for i, v in enumerate(gs2) if v < 8000 and (i + 1) in tl2])
    # JOIN: fill coast notches where the shore meets a mountain base (water nearer to ground than rock)
    Aa = ~water
    D = edt(~Aa) <= JOIN
    clo = edt(D) > JOIN
    land = Aa & ~rock
    dg = edt(~land); dr2 = edt(~rock)
    fill = clo & water & (dg < dr2) & (dr2 < JOIN * 2.5)
    water = water & ~fill
    del D, clo, dg, dr2
    # fix2 (owner 2026-10-28): cliffs meet the sea the Act 1 way -- no walkable strip or patch between a
    # cliff and the water. Ground whose rock->water gap is under 3.5 cells becomes water, then any small
    # ground pocket left touching both rock and water goes too (landmark pads are kept below).
    if os.environ.get('ACTS_FIX2', '1') == '1':
        g_ = ~water & ~rock
        thin = g_ & (edt(~rock) + edt(~water) < 3.5 * P)
        lt, nt = ndi.label(thin)
        if nt:
            tw = set(np.unique(lt[ndi.binary_dilation(water, iterations=2) & thin])) - {0}
            water = water | np.isin(lt, list(tw))
        water = ndi.binary_opening(water, iterations=2) | (water & ndi.binary_dilation(rock, iterations=2))
        lg3, ng3 = ndi.label(~water & ~rock)
        if ng3:
            gs3 = ndi.sum(np.ones_like(lg3), lg3, range(1, ng3 + 1))
            tw3 = set(np.unique(lg3[ndi.binary_dilation(water, iterations=2)]))
            tr3 = set(np.unique(lg3[ndi.binary_dilation(rock, iterations=2)]))
            kp = set(np.unique(lg3[keep])) if keep is not None else set()
            water = water | np.isin(lg3, [i + 1 for i, v in enumerate(gs3)
                                         if v < 40000 and (i + 1) in tw3 and (i + 1) in tr3 and (i + 1) not in kp])
            del lg3
        del g_, thin, lt
    if keep is not None: water = water & ~keep
    land = ~water
    del lab, labw, lg, lg2, lc
    dl = edt(land); dw = edt(water)
    rockzone = ndi.binary_dilation(rock, iterations=16)
    sandw = 11 + 6 * n(9, 2)
    sand = land & (dl <= sandw) & ~rockzone
    ls, ns = ndi.label(sand)
    if ns:
        ss = ndi.sum(np.ones_like(ls), ls, range(1, ns + 1))
        sand = sand & ~np.isin(ls, [i + 1 for i, v in enumerate(ss) if v < 900])
    out = base  # modified in place (caller no longer needs the plain ground)
    # colours are mixed only at the pixels that need them (memory: no full-frame RGB fields)
    sy_, sx_ = np.nonzero(sand)
    shore_s = shore_rgb(sy_, sx_); speck_s = speck_rgb(sy_, sx_); wm = wetmul(sy_, sx_)
    nn = n(2, 3)[sy_, sx_][:, None]
    sandc = shore_s + (nn - 0.5) * np.array([28, 24, 20], np.float32)
    spk = K._hash01(sx_ + gx0, sy_ + gy0, SEED + 4) < 0.08
    sandc[spk] = speck_s[spk]
    wet = dl[sy_, sx_] < 3.2
    sandc[wet] *= wm[wet][:, None]
    out[sy_, sx_] = sandc
    del sandc, shore_s, speck_s, nn
    edge = land & (dl > sandw) & (dl < sandw + 2.5) & ~rockzone
    ey, ex = np.nonzero(edge)
    out[ey, ex] = 0.5 * out[ey, ex] + 0.5 * (0.5 * shore_rgb(ey, ex) + 0.5 * out[ey, ex])
    f1 = water & (dw <= 2.2) & ndi.binary_dilation(sand, iterations=3)
    f2 = water & (dw > 5) & (dw <= 6.4) & (n(6, 5) > 0.45) & ndi.binary_dilation(sand, iterations=8)
    rn = np.zeros_like(rock)
    for k in range(1, 13): rn[k:] |= rock[:-k]
    rn = ndi.binary_dilation(rn, structure=np.ones((1, 5), bool))
    rs = water & (dw <= 7) & rn & ndi.binary_dilation(rock, iterations=8)
    rf = water & (dw <= 1.5) & rn & ndi.binary_dilation(rock, iterations=3) & (n(3, 6) > 0.5)
    return water, out, dict(sand=sand, f1=f1, f2=f2, rs=rs, rf=rf)

# ------------------------------------------------------------------ water texture
_WT = None
def water_tex(gx0, gy0, W, H):
    global _WT
    if _WT is None:
        m = Image.open(A.ROOT + '/public/act1-hifi/materials/act1-water-r2.png').convert('RGB')
        _WT = np.array(m.resize((m.width // 3, m.height // 3), Image.LANCZOS)).astype(np.float32)
    th, tw = _WT.shape[:2]
    return _WT[((np.arange(H) + gy0) % th)][:, ((np.arange(W) + gx0) % tw)]

# ------------------------------------------------------------------ crest (b91 option A glints)
def crest_frames(water, gx0, gy0, K_=3):
    import importlib.util
    sys.path.insert(0, A.ROOT + '/scripts/b89'); sys.path.insert(0, A.ROOT + '/scripts/b91')
    import crest2
    fr = crest2.frames(water, gx0, gy0, 'glint', K_)
    out = []
    for f in fr:
        h, w = f.shape[:2]
        x = np.array(Image.fromarray(f).resize((max(1, w // 2), max(1, h // 2)), Image.BOX)).astype(np.float32)
        x[..., :3] = np.round(x[..., :3] * x[..., 3:] / 255.0)   # PREMULTIPLIED (build-90 white-sea fix)
        out.append(x.astype(np.uint8))
    return out

# ------------------------------------------------------------------ landmarks
LM_SCALE = 32 / 33.6  # runtime draws a landmark at `size` world px; one overworld cell = 48*0.7 = 33.6 world px
TOWNS = {'Ironkeep': ('millbrook', 'snow'), 'Frostwatch': ('greenhollow', 'snow'),
         'Ravenhollow': ('greenhollow', 'haunt'), 'Oasis Haven': ('greenhollow', 'sand'),
         'Ruins Camp': ('millbrook', 'sand'), "Ember's Rest": ('greenhollow', 'ash'),
         'Cinderwatch': ('millbrook', 'ash'), 'Last Bastion': ('millbrook', 'dark'),
         "Haven's Edge": ('greenhollow', 'dark')}
CASTLES = {'Demon Castle': 192, 'Demon Barracks': 144}
def dungeon_art(name, biome):
    n = name.lower()
    if 'crystal' in n: return ('a1', 'crystal-cave', biome)
    if 'storm nest' in n: return ('op', 'storm-nest', None)
    if 'frozen lake' in n: return ('op', 'ice-cave', None)
    if 'haunted forest' in n: return ('a1', 'whispering-woods', 'haunt')
    if 'shadow cave' in n: return ('op', 'shadow-cave', None)
    if 'desert tomb' in n: return ('op', 'desert-tomb', None)
    if 'portal' in n or 'void rift' in n: return ('op', 'portal', None)
    if 'iron mine' in n: return ('a1', 'sunken-cellar', biome)
    if 'oasis depths' in n: return ('a1', 'misty-grotto', 'sand')
    if 'bandit' in n: return ('a1', 'darkfang', 'sand')
    if 'scorched' in n: return ('op', 'desert-tomb', 'ash')
    if 'magma' in n or 'forge' in n or 'ember mines' in n or 'obsidian' in n: return ('a1', 'darkfang', 'ash')
    return ('op', 'cave', biome)

def landmark_sprites(act, lab_full):
    """-> list of dicts with RGBA sprite, size, anchor, cell, kind, gate."""
    A1 = A.ROOT + '/public/act1-hifi/landmarks/'
    a1 = {l['slug']: l for l in json.load(open(A1 + 'landmarks.json'))['landmarks']}
    out = []
    for l in A.landmarks():
        if l['act'] != act: continue
        x, y = l['cell']; b = K.BIOMES[lab_full[y, x]]
        nm = l['name']
        if nm in TOWNS:
            slug, bb = TOWNS[nm]; im = Image.open(A1 + slug + '.png').convert('RGBA')
            rgba = K.recolor_sprite(im, bb); size = 192; anchor = a1[slug]['anchor']; kind = 'town'
        elif nm in CASTLES:
            size = CASTLES[nm]; im = Image.open(A.ROOT + '/public/owprops/owprop-castle-128.png').convert('RGBA')
            im = im.resize((size, size), Image.LANCZOS)
            rgba = K.recolor_sprite(im, 'dark'); c = rgba[..., :3].astype(np.float32)
            rgba[..., :3] = np.clip(c * np.array([0.62, 0.5, 0.78]), 0, 255).astype(np.uint8)
            anchor = [size // 2, int(size * 0.86)]; kind = 'castle'
        else:
            src, slug, rb = dungeon_art(nm, b); kind = 'dungeon'; size = 144
            if src == 'a1':
                im = Image.open(A1 + slug + '.png').convert('RGBA'); anchor = a1[slug]['anchor']
            else:
                im = Image.open(A.ROOT + f'/public/owprops/owprop-{slug}-128.png').convert('RGBA')
                im = im.resize((144, 144), Image.LANCZOS).filter(ImageFilter.UnsharpMask(0.9, 130, 2))
                al = np.asarray(im)[..., 3]; ys = np.nonzero(al.max(1) > 128)[0]
                anchor = [72, int(ys.max()) - 10]
            rgba = K.recolor_sprite(im, rb) if rb else np.asarray(im).copy()
        rgba = np.asarray(rgba).copy(); rgba[..., 3] = np.where(rgba[..., 3] >= 128, 255, 0)
        sz = round(size * LM_SCALE)
        art = np.asarray(Image.fromarray(rgba).resize((sz, sz), Image.LANCZOS)).copy()
        art[..., 3] = np.where(art[..., 3] >= 128, 255, 0)
        art_anchor = [round(anchor[0] * LM_SCALE), round(anchor[1] * LM_SCALE)]
        slugn = nm.lower().replace("'", '').replace(' - ', '-').replace(' (', '-').replace(')', '').replace(' ', '-')
        out.append(dict(name=nm, slug=slugn, cell=[x, y], size=size, anchor=list(map(int, anchor)), kind=kind,
                        biome=b, rgba=rgba, art=art, artAnchor=art_anchor))
    return out

# gate / mouth channel: hero feet stencil is ~1.75 cells wide (dq-tiles a1fBuildStencil); channel =
# stencil + 0.75 cell = 2.5 cells (80 px), reaching 20 px past the anchor into the door cell
GATE_HALF, GATE_DEPTH = 40, 20

def landmark_mask(lm, water_near_south):
    """Feet-only blocking mask in sprite px. Towns: closed outline with a 31 px gate channel.
    Dungeons/castles: closed outline; only a front (south) mouth channel above the anchor is open."""
    a = lm['art'][..., 3] >= 128; ax, ay = lm['artAnchor']; S = a.shape[0]
    m = ndi.binary_closing(np.pad(a, 6), iterations=4)[6:-6, 6:-6] | a
    if lm['kind'] == 'town':
        gate = 'north' if water_near_south else 'south'
        if gate == 'south': m[max(0, ay - GATE_DEPTH):, ax - GATE_HALF:ax + GATE_HALF] = False
        else: m[:ay + GATE_DEPTH, ax - GATE_HALF:ax + GATE_HALF] = False
    else:
        gate = 'south'
        # mouth: enterable only from the front (sides and back of the outline stay blocked)
        m[max(0, ay - GATE_DEPTH):, ax - GATE_HALF:ax + GATE_HALF] = False
    return m, gate

# ------------------------------------------------------------------ Act 1 shipped art (read-only)
A1_PLATE = (16, 218, 163, 399)   # public/act1-world-map.js BOUNDS (x0, y0, x1, y1), inclusive
A1_OVERLAP_Y1 = 221          # Act 5 output runs to this row (inclusive)
A1_OVERLAP_X = (80, 161)     # stretch of Act 1's top rows that Act 5 repaints under Act 1's cliffs
def act1_window(gx0, gy0, W, H):
    """Act 1 shipped layers for a window (global px): forest (+north overhang), flat composite, collision."""
    R = A.ROOT + '/public/act1-hifi/chunks/'; ox, oy = 16 * P, 218 * P
    big = {k: np.zeros((H, W, 4), np.uint8) for k in ('base', 'water-r2', 'foam', 'forest')}
    valid = np.zeros((H, W), bool)
    def paste(dst, im, x, y):
        h, w = im.shape[:2]; X0, Y0 = max(0, x), max(0, y); X1, Y1 = min(W, x + w), min(H, y + h)
        if X1 > X0 and Y1 > Y0:
            s = im[Y0 - y:Y1 - y, X0 - x:X1 - x]
            if dst is None: return (slice(Y0, Y1), slice(X0, X1))
            m = s[..., 3] > 0; dst[Y0:Y1, X0:X1][m] = s[m]; return (slice(Y0, Y1), slice(X0, X1))
    for c in range(10):
        for rr in range(12):
            x = ox + c * 512 - gx0; y = oy + rr * 512 - gy0
            if x > W or y > H or x + 512 < 0 or y + 512 < 0: continue
            for k, e in (('base', 'webp'), ('water-r2', 'png'), ('foam', 'png'), ('forest', 'png')):
                q = f'{R}{k}/c{c}-r{rr}.{e}'
                if not os.path.exists(q): continue
                im = np.asarray(Image.open(q).convert('RGBA'))
                if k == 'base':
                    sl = paste(None, im, x, y)
                    if sl: big['base'][sl] = im[sl[0].start - y:sl[0].stop - y, sl[1].start - x:sl[1].stop - x]; valid[sl] = True
                else: paste(big[k], im, x, y)
    for c in (4, 5, 6):
        q = f'{R}north/c{c}-r0.png'
        if os.path.exists(q):
            im = np.asarray(Image.open(q).convert('RGBA')); paste(big['forest'], im, ox + c * 512 - gx0, oy - im.shape[0] - gy0)
    flat = big['base'][..., :3].astype(np.float32)
    for k in ('water-r2', 'foam', 'forest'):
        a = big[k][..., 3:4].astype(np.float32) / 255; flat = flat * (1 - a) + big[k][..., :3] * a
    coll = (big['forest'][..., 3] >= 128) | (big['water-r2'][..., 3] >= 128)
    return {'forest': big['forest'], 'flat': np.clip(flat, 0, 255).astype(np.uint8), 'coll': coll, 'valid': valid}

# ------------------------------------------------------------------ main
def render(act, out_dir, chunks=True):
    t0 = time.time()
    d = A.owner(); bx0, by0, bx1, by1 = d['acts'][str(act)]['bounds']
    owner_bounds = [bx0, by0, bx1, by1]
    # fix4: Act 5 no longer repaints Act 1's top rows (218-221); every act stops at its own bounds
    cx0, cy0 = max(0, bx0 - MARGIN), max(0, by0 - MARGIN)
    cx1, cy1 = min(A.GW, bx1 + 1 + MARGIN), min(A.GH, by1 + 1 + MARGIN)
    Wc, Hc = cx1 - cx0, cy1 - cy0; W, H = Wc * P, Hc * P
    gx0, gy0 = cx0 * P, cy0 * P
    cls, actmap, land = A.world()
    lab_full = biome_cells(cls, actmap)
    doc = PL.build()
    log(f'act {act} window cells {cx0},{cy0}-{cx1},{cy1} = {W}x{H}px')
    # biome weights (px) for the window and cell-level weights (objects)
    lab = lab_full[cy0:cy1, cx0:cx1]
    bw = biome_weights(lab, gx0, gy0)
    # kit field: blurred (warped) biome labels + per-biome cell noise (scale ~6 cells); argmax per object
    # one meandering kit boundary (low-frequency noise only), never a speckle of mixed kits
    bw_cell = np.stack([ndi.gaussian_filter((lab_full == i).astype(np.float32), 4.0)
                        + 0.35 * (vnoise(0, 0, A.GW, A.GH, 14, SEED + 60 + i) - 0.5)
                        for i, b in enumerate(K.BIOMES)])
    # ---- ground
    ys = (np.arange(H) + gy0 - ACT1_ORIGIN[1] * P) * 3; xs = (np.arange(W) + gx0 - ACT1_ORIGIN[0] * P) * 3
    base = np.zeros((H, W, 3), np.float32)
    for b, w in bw.items():
        t = K.ground_tile(b); ty = np.mod(ys, t.shape[0]); tx = np.mod(xs, t.shape[1])
        base += t[ty][:, tx].astype(np.float32) * w[..., None]
    # gentle low-frequency light/shade drifts on the new biomes (Act 1 grass stays exactly as shipped)
    var = 1 + 0.16 * (vnoise(gx0, gy0, W, H, 220, SEED + 40) - 0.5) + 0.08 * (vnoise(gx0, gy0, W, H, 70, SEED + 41) - 0.5)
    g1 = bw.get('grass', 0)
    base *= (var * (1 - g1) + g1)[..., None] if isinstance(g1, np.ndarray) else var[..., None]
    log('ground')
    # ---- water (sea from land mask + owner W bodies), smooth organic outline
    wcell = ((cls == A.SEA) | (cls == A.WATER))[cy0:cy1, cx0:cx1]
    soft = up(wcell.astype(np.float32), 0.9) + (vnoise(gx0, gy0, W, H, 14 * 2, SEED + 20) - 0.5) * 0.28 \
           + (vnoise(gx0, gy0, W, H, 5 * 2, SEED + 21) - 0.5) * 0.10
    water0 = soft > 0.5
    lake = up(((cls == A.WATER) & (lab_full == K.BIOMES.index('snow')))[cy0:cy1, cx0:cx1].astype(np.float32), 1.5) > 0.3
    # ---- objects
    gnd = (cls != A.MOUNT) & (cls != A.SEA)
    _, near = ndi.distance_transform_edt(~gnd, return_indices=True)
    near = (near[0], near[1], vnoise(0, 0, A.GW, A.GH, 10, SEED + 90), vnoise(0, 0, A.GW, A.GH, 10, SEED + 91))
    fo, rockm, treem, solidm = draw_objects((cx0, cy0, cx1, cy1), doc, bw_cell, lab_full, near)
    a1 = None
    if False:   # fix4: Act 1's shipped cliffs are no longer composited into Act 5's output
        # Act 1's own cliffs (forest layer rows >= 218, and its north overhang above 218) stand in front of
        # every Act 5 object: draw them on top so the seam keeps Act 1's paint exactly
        a1 = act1_window(gx0, gy0, W, H)
        y218 = 218 * P - gy0; m1 = a1['forest'][..., 3] > 0
        fo[m1] = a1['forest'][m1]; rockm |= m1; treem &= ~m1
    log('objects')
    # landmarks: keep their footprint dry and clear of objects
    lms = landmark_sprites(act, lab_full)
    keep = np.zeros((H, W), bool)
    for lm in lms:
        x, y = lm['cell']; px, py = (x - cx0) * P + 16, (y - cy0) * P + 16
        S = lm['art'].shape[0]; ax, ay = lm['artAnchor']
        X0, Y0 = px - ax - 8, py - ay - 8; X1, Y1 = X0 + S + 16, Y0 + S + 16
        al = lm['art'][..., 3] >= 128; sx, sy = px - ax, py - ay
        ya, xa = np.nonzero(al); ya = ya + sy; xa = xa + sx; ok = (ya >= 0) & (ya < H) & (xa >= 0) & (xa < W)
        keep[ya[ok], xa[ok]] = True
    if keep.any():
        # rounded dry pad around each landmark sprite (no rectangular bites out of a shoreline)
        keep = ndi.gaussian_filter(ndi.binary_dilation(keep, iterations=10).astype(np.float32), 6) > 0.3
    # owner open/forest ground that is NOT water in the owner data stays land around landmarks only
    ground_ok = ~water0
    # ---- coast pass
    shore = lambda yy, xx: sum(np.array(K.SHORE[b][0], np.float32) * w[yy, xx][:, None] for b, w in bw.items())
    speck = lambda yy, xx: sum(np.array(K.SHORE[b][1], np.float32) * w[yy, xx][:, None] for b, w in bw.items())
    wetm = lambda yy, xx: sum(K.SHORE[b][2] * w[yy, xx] for b, w in bw.items())
    water, out, E = coast(base, water0, rockm, ground_ok, keep, shore, speck, wetm, gx0, gy0)
    log('coast')
    del ground_ok
    wtex = water_tex(gx0, gy0, W, H)
    # icy frozen lake (Act 2 snow lakes): pale, desaturated, crests suppressed
    if lake.any():
        lm_ = lake & water
        wtex[lm_] = wtex[lm_] * 0.45 + np.array([150, 196, 222], np.float32) * 0.55
    out[water] = wtex[water]; sandimg = out; del wtex
    # trees standing in the new water: remove whole tufts only where their contact is in water
    # (rocks overhang water by design; trees do not)
    tw = treem & water & ~ndi.binary_dilation(~water, iterations=6)
    if tw.any():
        fo[tw] = 0; treem &= ~tw
    solidm &= ~(water & ~ndi.binary_dilation(~water, iterations=6))
    # ---- layers
    wa = ndi.gaussian_filter(water.astype(np.float32), 0.6); wa[water] = np.maximum(wa[water], 0.5)
    wa = np.clip((wa - 0.25) * 2, 0, 1)
    base_u8 = np.clip(sandimg, 0, 255).astype(np.uint8); del sandimg, out
    # rock floor: any ground showing through gaps INSIDE a range (between whole panels) is painted as
    # dark rock of the local kit and blocked, so a range reads as one solid mass
    rk_ = rockm & ~water
    hull = ndi.binary_fill_holes(ndi.binary_closing(np.pad(rk_, 24), structure=np.ones((3, 3), bool), iterations=20))[24:-24, 24:-24]
    lane = np.zeros((H, W), bool)   # gate / mouth approach lanes (placements.in_approach) stay open ground
    for lm in lms:
        x, y = lm['cell']; px, py = (x - cx0) * P + 16, (y - cy0) * P + 16
        sw = water[min(H - 1, py + 3 * P):min(H, py + 4 * P), max(0, px - 16):px + 16]
        sg = -1 if (sw.size and sw.mean() > 0.5) else 1
        y0_, y1_ = (py, py + 8 * P) if sg > 0 else (py - 8 * P, py)
        lane[max(0, y0_):max(0, y1_), max(0, px - 74):max(0, px + 74)] = True
    # fix2: connecting dungeons sit in their range -- the stamped flank (acts_common.flank_mask) that no
    # panel covers is rock floor (or blocked forest floor), so rock/trees touch the mouth on both sides
    flankM = np.zeros((H, W), bool); flankF = np.zeros((H, W), bool); mouthzone = np.zeros((H, W), bool)
    for lm in lms:
        if lm['name'] not in A.CONNECTING or lm['name'] in A.FLANK_SKIPPED: continue
        x, y = lm['cell']; sz = A.FLANK_USED.get(lm['name'], A.FLANK); nw, nd = A.NOTCH; fm = np.zeros((H, W), bool)
        hl, hr, dp = sz if len(sz) == 3 else (sz[0], sz[0], sz[1])
        def rect(x0_, y0_, x1_, y1_, v):   # cell rect [x0,x1) x [y0,y1) -> window px, clipped
            X0, Y0 = max(0, (x0_ - cx0) * P), max(0, (y0_ - cy0) * P)
            X1, Y1 = min(W, (x1_ - cx0) * P), min(H, (y1_ - cy0) * P)
            if X1 > X0 and Y1 > Y0: fm[Y0:Y1, X0:X1] = v
        fc = A.flank_mask(lm['name'], x, y)   # same organic outline as the class stamp, in window px
        ys_, xs_ = np.nonzero(fc[max(0, cy0):cy1, max(0, cx0):cx1])
        for yc, xc in zip(ys_ + max(0, cy0), xs_ + max(0, cx0)): rect(xc, yc, xc + 1, yc + 1, True)
        yy_, xx_ = np.ogrid[:H, :W]; mx_, my_ = (x - cx0) * P + 16, (y - cy0) * P + 16
        mouthzone |= (xx_ - mx_) ** 2 + (yy_ - my_) ** 2 < (3.2 * P) ** 2
        if A.CONNECTING[lm['name']] == A.MOUNT: flankM |= fm
        else: flankF |= fm
    # fix3: no flat floor around connecting mouths -- panels cover the flank; the hull floor is also kept
    # out of a 7-cell radius round each connecting mouth (any gap there shows painted rock from the panels)
    floorm = hull & ~rk_ & ~water & ~keep & ~lane & ~mouthzone
    # fix4: owner mountain cells no whole panel could cover (e.g. Act 2's 7-cell divider strip beside Act 1's
    # plate) are textured rock floor and blocked, with a smoothed outline -- never walkable ground
    mc = ((cls == A.MOUNT) & (actmap >= 2))[cy0:cy1, cx0:cx1]
    floorm |= (up(mc.astype(np.float32), 0.9) > 0.5) & ~rk_ & ~water & ~keep & ~lane & ~mouthzone
    if floorm.any():
        fy, fx = np.nonzero(floorm)
        fc = np.zeros((len(fy), 3), np.float32)
        for b, w in bw.items():   # fix3: tiled panel texture of the local kit (world-phased), not a flat ramp
            t = K.rock_floor_tile(b); ts = t.shape[0]
            fc += t[(fy + gy0) % ts, (fx + gx0) % ts] * w[fy, fx][:, None]
        base_u8[fy, fx] = np.clip(fc, 0, 255).astype(np.uint8)
    if 'dark' in bw:
        # dead forest floor: the ground under leafless clumps is shaded so the wood reads as a mass
        sh = ndi.gaussian_filter((solidm & ~water).astype(np.float32), 6) * bw['dark']
        base_u8[:] = np.clip(base_u8 * (1 - 0.8 * sh[..., None]), 0, 255).astype(np.uint8)
        del sh
    wl = np.dstack([base_u8, (wa * 255).astype(np.uint8)])
    rsm = E['rs']; wl[rsm, :3] = (wl[rsm, :3].astype(np.float32) * 0.62).astype(np.uint8)
    foam = np.zeros((H, W, 4), np.uint8)
    for mk, a_, mul in (('f2', 110, 0.92), ('rf', 140, 0.96), ('f1', 200, 1.0)):
        yy_, xx_ = np.nonzero(E[mk])
        fc = sum(np.array(K.FOAM[b], np.float32) * w[yy_, xx_][:, None] for b, w in bw.items())
        foam[yy_, xx_, :3] = np.clip(fc * mul, 0, 255).astype(np.uint8); foam[yy_, xx_, 3] = a_
    foam[lake & water] = 0
    log('layers')
    # ---- collision (feet-only px mask) and walk-behind
    raised = (fo[..., 3] >= 128) | solidm
    coll = raised | (wl[..., 3] >= 128)
    # walk-behind: top 24 px of each raised run (with open ground to its north) are walkable but draw over the hero
    b_ = raised
    rb = np.zeros((H, W), np.int32); rb[H - 1] = H - 1
    for yy in range(H - 2, -1, -1): rb[yy] = np.where(b_[yy] & b_[yy + 1], rb[yy + 1], yy)
    start = b_.copy(); start[1:] &= ~b_[:-1]; start[0] = False
    start &= np.vstack([np.zeros((1, W), bool), ~(wl[:-1, :, 3] >= 128)])  # open ground (not water) above
    L = rb - np.arange(H)[:, None] + 1
    sel = start & (L > TRIM_MINRUN)
    wb = np.zeros((H, W), bool); ys_, xs_ = np.nonzero(sel)
    for k in range(TRIM_T): wb[np.minimum(ys_ + k, H - 1), xs_] = True
    wb &= raised
    coll &= ~wb
    coll |= floorm & ~wb
    # (forest flanks: the stamped F cells get real trees from placements; no invisible blocking)
    del rb, L
    front = np.zeros_like(fo); fm = ndi.binary_dilation(wb, np.ones((3, 3), bool)) & (fo[..., 3] > 0)
    front[fm] = fo[fm]
    # landmarks into collision
    lmjson = []
    os.makedirs(out_dir + '/landmarks', exist_ok=True)
    for lm in lms:
        x, y = lm['cell']; px, py = (x - cx0) * P + 16, (y - cy0) * P + 16
        ax, ay = lm['artAnchor']; S = lm['art'].shape[0]
        sx, sy = px - ax, py - ay
        south = water[min(H - 1, py + 3 * P):min(H, py + 4 * P), max(0, px - 16):px + 16]
        m, gate = landmark_mask(lm, south.size and south.mean() > 0.5)
        Y0, X0 = max(0, sy), max(0, sx); Y1, X1 = min(H, sy + S), min(W, sx + S)
        coll[Y0:Y1, X0:X1] |= m[Y0 - sy:Y1 - sy, X0 - sx:X1 - sx]
        if A.CONNECTING.get(lm['name']) == A.MOUNT and lm['name'] not in A.FLANK_SKIPPED:
            # fix3: the backing panel's foot runs under the sprite; keep the mouth channel walkable
            coll[max(0, py - GATE_DEPTH):max(0, py + 16), max(0, px - GATE_HALF):max(0, px + GATE_HALF)] = False
        # the gate/mouth approach and the 1-cell ring around the door cell stay walkable
        Image.fromarray(lm['rgba']).save(out_dir + f"/landmarks/{lm['slug']}.png", optimize=True)
        lmjson.append({k: lm[k] for k in ('name', 'slug', 'cell', 'size', 'anchor', 'kind', 'biome')} |
                      {'gate': gate, 'worldPxPerCell': 33.6, 'maskPixelsPerCell': P, 'maskSize': list(m.shape), 'maskAnchor': lm['artAnchor'], 'maskB64': base64.b64encode(np.packbits(m.ravel(), bitorder='little').tobytes()).decode()})
    log('collision')
    # ---- crop to act bounds and write chunks
    ox, oy = (bx0 - cx0) * P, (by0 - cy0) * P; AW, AH = (bx1 - bx0 + 1) * P, (by1 - by0 + 1) * P
    S_ = (slice(oy, oy + AH), slice(ox, ox + AW))
    if a1 is not None:
        # rows 218-221 outside the covered stretch (x 80..161) stay Act 1's shipped pixels exactly
        y218 = 218 * P - gy0; keep1 = np.zeros((H, W), bool); keep1[y218:, :] = True
        keep1[y218:, max(0, A1_OVERLAP_X[0] * P - gx0):max(0, A1_OVERLAP_X[1] * P - gx0)] = False
        keep1 &= a1['valid']
        base_u8[keep1] = a1['flat'][keep1]
        for arr in (wl, foam, fo, front): arr[keep1] = 0
        coll[keep1] = a1['coll'][keep1]; wb[keep1] = False
    # fix4: nothing of Acts 2-5 draws over Act 1's plate (x 16-163, y 218-399; act1-world-map.js BOUNDS):
    # Act 1's base covers act ground there at runtime, and the act's raised layers (forest/front/crest
    # source) are emptied so no act paint sits on top of Act 1's shipped paint
    r1 = np.zeros((H, W), bool)
    X1_, Y1_ = (A1_PLATE[2] + 1) * P - gx0, A1_PLATE[1] * P - gy0
    if X1_ > 0 and Y1_ < H: r1[max(0, Y1_):, max(0, A1_PLATE[0] * P - gx0):max(0, X1_)] = True
    for arr in (wl, foam, fo, front): arr[r1] = 0
    wb[r1] = False; water[r1] = False; lake[r1] = False
    base_c = Image.fromarray(base_u8[S_]).filter(ImageFilter.UnsharpMask(radius=0.9, percent=130, threshold=2))
    base_c = np.asarray(base_c)
    res = dict(base=base_c, water=wl[S_], foam=foam[S_], forest=fo[S_], front=front[S_],
               coll=coll[S_], wb=wb[S_], waterm=water[S_], lake=lake[S_], window=(cx0, cy0, cx1, cy1))
    manifest = {'act': act, 'bounds': [bx0, by0, bx1, by1], 'ownerBounds': owner_bounds, 'origin': [bx0, by0], 'pixelsPerCell': P,
                'chunkPx': 512, 'chunkCells': 16, 'layers': ['base', 'water-r2', 'foam', 'forest', 'front', 'crest'],
                'coast': {'CORRIDOR': CORRIDOR, 'FRONT': FRONT, 'JOIN': JOIN, 'ROCKFILL': False},
                'sharpen': {'radius': 0.9, 'percent': 130, 'threshold': 2, 'layer': 'base'},
                'collision': {'file': 'collision.png', 'pixelsPerCell': P, 'feetOnly': True, 'blocked': 1,
                              'walkBehindTopPx': TRIM_T, 'walkBehindMinRun': TRIM_MINRUN},
                'chunks': []}
    if chunks:
        for sub in ['base', 'water-r2', 'foam', 'forest', 'front', 'crest']: os.makedirs(f'{out_dir}/chunks/{sub}', exist_ok=True)
        nc_ = (AW + 511) // 512; nr_ = (AH + 511) // 512
        for c in range(nc_):
            for r in range(nr_):
                sl = (slice(r * 512, min(AH, r * 512 + 512)), slice(c * 512, min(AW, c * 512 + 512)))
                cid = f'c{c}-r{r}'; ent = {'id': cid, 'x': c * 256, 'y': r * 256,
                       'width': (sl[1].stop - sl[1].start) // 2, 'height': (sl[0].stop - sl[0].start) // 2}
                Image.fromarray(base_c[sl]).save(f'{out_dir}/chunks/base/{cid}.webp', lossless=True, method=4)
                ent['base'] = f'chunks/base/{cid}.webp'
                for key, arr, sub in (('water', wl, 'water-r2'), ('foam', foam, 'foam'), ('forest', fo, 'forest'), ('front', front, 'front')):
                    a_ = arr[S_][sl]
                    if a_[..., 3].any():
                        Image.fromarray(a_).save(f'{out_dir}/chunks/{sub}/{cid}.png', optimize=False, compress_level=6)
                        ent[key] = f'chunks/{sub}/{cid}.png'
                wm = (wl[S_][sl][..., 3] >= 128) & ~lake[S_][sl]
                if wm.any():
                    for k, f in enumerate(crest_frames(wm, bx0 * P + c * 512, by0 * P + r * 512)):
                        Image.fromarray(f).save(f'{out_dir}/chunks/crest/{cid}-{k}.png', compress_level=6)
                        ent[f'crest{k}'] = f'chunks/crest/{cid}-{k}.png'
                manifest['chunks'].append(ent)
        log('chunks written', len(manifest['chunks']))
    Image.fromarray(res['coll']).save(out_dir + '/collision.png', optimize=True)
    Image.fromarray(res['wb']).save(out_dir + '/walkbehind.png', optimize=True)
    manifest['landmarks'] = lmjson
    json.dump(manifest, open(out_dir + '/manifest.json', 'w'), indent=1)
    log(f'done act {act} in {time.time() - t0:.0f}s')
    res['landmarks'] = lms; res['manifest'] = manifest
    return res

def composite(res, with_landmarks=True):
    """Flattened preview RGB of a render result (cropped act raster)."""
    out = res['base'].astype(np.float32)
    for k in ('water', 'foam', 'forest'):
        a = res[k][..., 3:4].astype(np.float32) / 255; out = out * (1 - a) + res[k][..., :3] * a
    im = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).convert('RGBA')
    if with_landmarks:
        bx0, by0 = res['manifest']['bounds'][:2]
        for lm in res['landmarks']:
            x, y = lm['cell']; px, py = (x - bx0) * P + 16, (y - by0) * P + 16
            qx, qy = px - lm['artAnchor'][0], py - lm['artAnchor'][1]
            if qx >= 0 and qy >= 0: im.alpha_composite(Image.fromarray(lm['art']), (qx, qy))
    return im.convert('RGB')

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--act', type=int, required=True)
    ap.add_argument('--out'); ap.add_argument('--no-chunks', action='store_true')
    a = ap.parse_args()
    out = a.out or f'{A.SCRATCH}/act{a.act}'
    os.makedirs(out, exist_ok=True)
    res = render(a.act, out, chunks=not a.no_chunks)
    im = composite(res); im.save(out + '/full.png')
    s = 1600 / im.height; im.resize((round(im.width * s), 1600), Image.LANCZOS).save(out + '/overview.png')
