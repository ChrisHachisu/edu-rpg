#!/usr/bin/env python3
"""fix5: Act 1 north-seam override (ships with the Acts 2-5 release; build 91 files untouched).

Build 91's Act 1 plate (x 16-163, y 218-399) was painted as an island: its top rows show a water strip
(y 218-219) and flat-cut cliff tops, although Act 1's own collision (act1-world-map.js ROWS) and the
owner terrain both say MOUNTAIN there, continuous with Act 5's range to the north. Against Act 5 that reads
as a canal and two straight cut lines.

The override repaints only the seam band, with layered ridges as Act 1 builds a range:
  * back ridge  -- Act 5's own cliff kit (Act 5 rock biome), tops at y ~215.6, straddling the act line, so
                   Act 5's straight bottom edge (y 217/218) and the water strip disappear behind rock;
  * front ridge -- Act 1's own cliff kit (untinted, the build 91 atlas), tops at y ~218.5, bottoms cut along
                   dark crevices (min-luminance seam) at y ~222-223.3 onto Act 1's existing cliff faces,
                   so Act 1's own art continues unchanged south of the band.
Rules: hard alpha (>=128), no strips, no spires (only the large main panels), never over walkable cells:
pixels south of 218 only on ROWS '4' (mountain) or '2' (sea) cells, north of 218 only on Act 5 mountain cells.
Collision does not change (every painted cell is already blocked in Act 1's ROWS / Act 5's plate).

Outputs (A.SCRATCH/overrides/act1-north-seam/):
  base-<k>.png   RGBA, 512 px wide tiles aligned to Act 1 chunk columns -> drawn at depth 1.26
                 (above Act 1 base 1.1, water 1.2, crest 1.21x and foam 1.25; below north/forest 9.5)
  front-<k>.png  the override pixels where Act 1's front layer (10.5) has cut cliff tops in the band
                 -> drawn at 10.51 so those tops cannot show through
  override.json  origin (cells), tile list, depths -> merged into acts-hifi/manifest.json `overrides`
"""
import os, sys, json, re
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import acts_common as A
import biome_kits as K
Image.MAX_IMAGE_PIXELS = None

P = 32
X0, X1, Y0, Y1 = 16, 164, 213, 225          # canvas in world cells (x 16..163 inclusive = Act 1 plate width)
SEAM = 218
OUT = A.SCRATCH + '/overrides/act1-north-seam'
A1 = A.ROOT + '/public/act1-hifi/'


def act1_rows():
    s = open(A.ROOT + '/public/act1-world-map.js').read()
    body = s[s.index('var ROWS = ['):]; body = body[:body.index('];')]
    return re.findall(r"'([0-9a-z]+)'", body)


def dp_cut(alpha_rgb, ya, yb, seed):
    """per-column cut row in [ya, yb) following the darkest crevice; |step| <= 2 px"""
    rgb, al = alpha_rgb
    H, W = al.shape; ya, yb = max(0, ya), min(H, yb)
    if yb - ya < 3: return np.full(W, yb, int)
    L = rgb[ya:yb].astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
    L = np.where(al[ya:yb], L, 400.0)
    n = yb - ya; cost = L.copy(); back = np.zeros((n, W), int)
    for x in range(1, W):
        prev = cost[:, x - 1]
        best = np.full(n, np.inf); arg = np.zeros(n, int)
        for d in (-2, -1, 0, 1, 2):
            sh = np.roll(prev, d);
            if d > 0: sh[:d] = np.inf
            elif d < 0: sh[d:] = np.inf
            better = sh < best; best = np.where(better, sh, best); arg = np.where(better, np.arange(n) - d, arg)
        cost[:, x] = L[:, x] + best; back[:, x] = arg
    path = np.zeros(W, int); path[-1] = int(np.argmin(cost[:, -1]))
    for x in range(W - 1, 0, -1): path[x - 1] = back[path[x], x]
    return path + ya


def paste(canvas, owner, rgba, x, y, tag):
    h, w = rgba.shape[:2]; H, W = canvas.shape[:2]
    xa, ya_, xb, yb = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if xb <= xa or yb <= ya_: return
    s = rgba[ya_ - y:yb - y, xa - x:xb - x]; m = s[..., 3] >= 128
    canvas[ya_:yb, xa:xb][m] = s[m]; owner[ya_:yb, xa:xb][m] = tag


def ridge(canvas, owner, kit, names, top_cells, cut_cells, xs_cells, rng, tag, allowed):
    """a row of panels, tops at top_cells (+-jitter), each cut along its darkest crevice inside cut_cells"""
    x = (xs_cells[0] - X0) * P - 40; xe = (xs_cells[1] - X0) * P + 40; i = 0; placed = []
    while x < xe:
        nm = names[i % len(names)]; a = kit[nm]
        ys, xs_ = np.nonzero(a[..., 3] >= 128); a = a[ys.min():, xs_.min():xs_.max() + 1]
        top = int((top_cells - Y0) * P + rng.integers(-10, 11))
        ca, cb = int((cut_cells[0] - Y0) * P) - top, int((cut_cells[1] - Y0) * P) - top
        cut = dp_cut((a[..., :3], a[..., 3] >= 128), ca, cb, i)
        a = a.copy(); yy = np.arange(a.shape[0])[:, None]; a[..., 3] = np.where(yy < cut[None, :], a[..., 3], 0)
        placed.append((a, int(x), top))
        x += int(a.shape[1] * 0.58) + int(rng.integers(-24, 25)); i += 1
    # even panels first, odd ones over both neighbours (Act 1 interleaving: no single sweep direction)
    for k in list(range(0, len(placed), 2)) + list(range(1, len(placed), 2)):
        a, px, py = placed[k]
        b = a.copy(); h, w = b.shape[:2]
        sub = np.zeros((h, w), bool)
        ya, xa = max(0, py), max(0, px); yb, xb = min(allowed.shape[0], py + h), min(allowed.shape[1], px + w)
        if yb > ya and xb > xa: sub[ya - py:yb - py, xa - px:xb - px] = allowed[ya:yb, xa:xb]
        b[..., 3] = np.where(sub, b[..., 3], 0)
        paste(canvas, owner, b, px, py, tag)


def act5_rock_biome():
    m5 = json.load(open(A.SCRATCH + '/act5/manifest.json')); bx0, by0 = m5['bounds'][:2]
    im = np.asarray(Image.open(A.SCRATCH + '/act5/full.png').convert('RGB').crop(
        ((100 - bx0) * P, (212 - by0) * P, (150 - bx0) * P, (217 - by0) * P))).reshape(-1, 3).astype(np.float32)
    ref = np.median(im, 0); best = None
    for b in K.BIOMES:
        if b == 'grass': continue
        a = K.rock_kit(b)['interior-rock-panel']; c = np.median(a[a[..., 3] > 0][:, :3].astype(np.float32), 0)
        d = float(np.abs(c - ref).sum())
        if best is None or d < best[0]: best = (d, b)
    return best[1]


def main():
    rows = act1_rows()
    cls, act = A.world()[:2]
    Hc, Wc = Y1 - Y0, X1 - X0
    ok_cell = np.zeros((Hc, Wc), bool); hard = np.zeros((Hc, Wc), bool)
    for cy in range(Y0, Y1):
        for cx in range(X0, X1):
            if cy >= SEAM:
                ch = rows[cy - SEAM][cx - 16]
                ok_cell[cy - Y0, cx - X0] = ch == '4'; hard[cy - Y0, cx - X0] = ch in '42'
            else:
                v = cls[cy, cx] == A.MOUNT and act[cy, cx] == 5
                ok_cell[cy - Y0, cx - X0] = v; hard[cy - Y0, cx - X0] = v
    up = lambda m: np.kron(m, np.ones((P, P), np.float32))
    allowed = (ndi.gaussian_filter(up(ok_cell.astype(np.float32)), 0.9 * P) > 0.5) & (up(hard.astype(np.float32)) > 0.5)
    cols = np.nonzero(ok_cell[SEAM - Y0])[0]
    xa_c, xb_c = X0 + cols.min(), X0 + cols.max() + 1
    rng = np.random.default_rng(218)
    W, H = Wc * P, Hc * P
    canvas = np.zeros((H, W, 4), np.uint8); owner = np.zeros((H, W), np.uint8)
    b5 = act5_rock_biome(); print('act5 rock biome', b5)
    kit5 = K.rock_kit(b5); kit1 = K.act1_rock_sources()
    main_panels = ['interior-rock-panel', 'broad-joining-mass-A', 'broad-joining-mass-B']
    # back ridge (Act 5 kit): tops ~215.6, cut 219.4-220.4 (hidden behind the front ridge)
    north5 = np.nonzero(ok_cell[SEAM - 1 - Y0])[0]
    ridge(canvas, owner, kit5, main_panels, 215.6, (219.4, 220.4), (X0 + north5.min(), X0 + north5.max() + 1), rng, 5, allowed)
    # front ridge (Act 1 kit, untinted): tops ~218.5, cut 222.0-223.3 onto Act 1's own cliff faces
    ridge(canvas, owner, kit1, main_panels + ['narrow-notch-buttress'], 218.5, (222.0, 223.3), (xa_c, xb_c), rng, 1, allowed)

    # coverage: nothing of the old strip / Act 5's straight bottom edge may show through
    band = np.zeros((H, W), bool); band[(217 - Y0) * P:(220 - Y0) * P] = True
    need = band & up(ok_cell.astype(np.float32)).astype(bool) & ndi.binary_erosion(allowed, iterations=6)
    hole = need & (canvas[..., 3] < 128)
    print('band pixels needing rock', int(need.sum()), 'uncovered', int(hole.sum()))
    if hole.any():   # residual pinholes between crowns: recessed rock floor of the back ridge's kit (fix5 sampler)
        hy, hx = np.nonzero(hole)
        c = K.rock_floor_sample(b5, (hy + Y0 * P).astype(np.int64), (hx + X0 * P).astype(np.int64))
        canvas[hy, hx, :3] = np.clip(c, 0, 255).astype(np.uint8); canvas[hy, hx, 3] = 255

    # Act 1's north overhang (build 91 'north' layer, depth 9.5) draws spire tops ABOVE y 218; their lower part
    # is in Act 1's base. Keep those base pixels visible under each spire column (down to the first water
    # pixel), so a spire is never sliced at 218 by the override.
    man = json.load(open(A1 + 'manifest.json')); keep = np.zeros((H, W), bool)
    for c in man['chunks']:
        if 'north' not in c: continue
        cx = 16 + c['x'] // 16; na = np.asarray(Image.open(A1 + c['north']).convert('RGBA'))[..., 3]
        bot = ndi.binary_dilation(na[-3:].max(0) > 0, iterations=1)
        base1 = np.asarray(Image.open(A1 + c['base']).convert('RGB')).astype(np.int16)
        wet = (base1[..., 2] > base1[..., 0] + 40) & (base1[..., 2] > base1[..., 1] + 10)
        px = (cx - X0) * P; sy = (SEAM - Y0) * P
        for j in np.nonzero(bot)[0]:
            if px + j >= W: continue
            col = wet[:H - sy, j]; d = int(np.argmax(col)) if col.any() else H - sy
            keep[sy:sy + d, px + j] = True
    keep = ndi.binary_opening(keep, np.ones((1, 3), bool))
    canvas[keep] = 0
    print('north-spire columns kept from Act 1', int(keep.any(0).sum()))

    # front part: Act 1 front (10.5) cut tops inside the override footprint
    f1 = np.zeros((H, W), bool)
    for c in man['chunks']:
        if 'front' not in c: continue
        cx, cy = 16 + c['x'] // 16, 218 + c['y'] // 16
        if cy >= Y1: continue
        fa = np.asarray(Image.open(A1 + c['front']).convert('RGBA'))[..., 3] > 0
        px, py = (cx - X0) * P, (cy - Y0) * P; h, w = fa.shape
        ya, xa, yb, xb = max(0, py), max(0, px), min(H, py + h), min(W, px + w)
        if yb > ya and xb > xa: f1[ya:yb, xa:xb] |= fa[ya - py:yb - py, xa - px:xb - px]
    f1 = ndi.binary_dilation(f1, iterations=2) & (canvas[..., 3] >= 128)
    front = np.zeros_like(canvas); front[f1] = canvas[f1]
    print('front px', int(f1.sum()))

    os.makedirs(OUT, exist_ok=True); tiles = []
    for k, x in enumerate(range(0, W, 512)):
        b = canvas[:, x:x + 512]; fr = front[:, x:x + 512]; t = {'x': X0 + x // P, 'cols': b.shape[1] // P}
        if b[..., 3].any(): Image.fromarray(b).save(f'{OUT}/base-{k}.png', optimize=True); t['base'] = f'base-{k}.png'
        if fr[..., 3].any(): Image.fromarray(fr).save(f'{OUT}/front-{k}.png', optimize=True); t['front'] = f'front-{k}.png'
        if len(t) > 2: tiles.append(t)
    meta = {'id': 'act1-north-seam', 'origin': [X0, Y0], 'rows': Hc, 'pixelsPerCell': P,
            'depths': {'base': 1.26, 'front': 10.51}, 'tiles': tiles, 'collision': 'unchanged',
            'note': 'fix5: replaces the build 91 island edge (water strip + cut tops) where Act 1 meets Act 5'}
    json.dump(meta, open(OUT + '/override.json', 'w'), indent=1)
    np.save(OUT + '/_canvas.npy', canvas); np.save(OUT + '/_front.npy', front)
    print('wrote', OUT, len(tiles), 'tiles')


if __name__ == '__main__':
    main()
