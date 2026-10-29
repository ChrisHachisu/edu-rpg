#!/usr/bin/env python3
"""Act 1 carved entrance -> release-side override (build 91 files untouched).

Act 1's Crystal Cave is a 144 px landmark sprite (dq-tiles 'a1alm_crystal-cave', depth 9.6) with no sprite
collision. The carved entrance (entrances_apply.py, job entrance-crystal-cave-act1) replaces it with a patch of
rock and a mouth on the door. It ships ONLY as a manifest `overrides` entry (public/acts-hifi/overrides/), the
same path as act1-north-seam:

  base-<k>.png  the patch over the sprite pixels within 6 px of it (straight alpha) -> 1.26
  front-<k>.png the patch's lintel (front.png) -> 10.51
  block         packbits (little) of block.png == 255 (new rock / jambs) at origin (cells) -> runtime actsFree
                ANDs it with Act 1's own pack (it can only add blocking; the mouth channel is open in Act 1's
                pack already -- checked here)
  hideAct1Landmarks ['crystal-cave'] -> runtime sets that sprite's alpha to 0

Usage: act1_entrance_override.py [job ...]   (default: every A.SCRATCH/entrances/*/patch.json with act 1)
"""
import os, sys, json, glob, base64
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import acts_common as A
Image.MAX_IMAGE_PIXELS = None
P = 32
A1 = A.ROOT + '/public/act1-hifi/'
SLUGS = {'entrance-crystal-cave-act1': 'crystal-cave'}


def act1_bits():
    b = open(A1 + 'forest-collision.bin', 'rb').read()
    return np.unpackbits(np.frombuffer(b[64:], np.uint8), bitorder='little').reshape(5824, 4736)


def _ycc(c):
    Y = c @ np.array([.299, .587, .114], np.float32); return Y, c[..., 2] - Y, c[..., 0] - Y


def _rgb(Y, cb, cr):
    b = cb + Y; r = cr + Y; g = (Y - .299 * r - .114 * b) / .587
    return np.dstack([r, g, b])


def act1_match(base, X0, Y0, dx, dy):
    """(1) Codex's rock is greyer than Act 1's tan cliff: quantile-map Y, Cb, Cr of the patch's rock pixels
    (not crystals, not the mouth's dark interior) onto Act 1's own cliff pixels within 96 px of the patch.
    (2) the rock edge against grass is retraced: hard pixel alpha along a noisy line (0-5 px bites) instead of
    the straight ground-model cut, with a 2 px darker foot so the rock sits on the grass like Act 1's cliffs."""
    from scipy import ndimage as ndi
    H, W = base.shape[:2]
    full = np.asarray(Image.open(A.SCRATCH + '/act1_full.png').convert('RGB').crop(
        ((X0 - 16) * P, (Y0 - 218) * P, (X0 - 16) * P + W, (Y0 - 218) * P + H))).astype(np.float32)
    def rocky(c):
        Y = c @ np.array([.299, .587, .114], np.float32)
        return (c[..., 1] < c[..., 0] + 5) & (c[..., 2] < c[..., 0] + 20) & (Y > 30)
    rgb = base[..., :3].astype(np.float32); al = base[..., 3]
    src = (al >= 128) & rocky(rgb)
    ref = rocky(full) & (al == 0) & (ndi.distance_transform_edt(al == 0) <= 96)
    Ys, cbs, crs = _ycc(rgb); Yr, cbr, crr = _ycc(full)
    q = np.linspace(0, 100, 101)
    mp = [np.interp(v, np.percentile(v[src], q), np.percentile(r[ref], q)) for v, r in ((Ys, Yr), (cbs, cbr), (crs, crr))]
    w = ndi.gaussian_filter(src.astype(np.float32), 1.2)[..., None] * src[..., None]
    out = rgb * (1 - w) + _rgb(*mp) * w
    print('  colour match: Y %.1f -> %.1f, Cb %.1f -> %.1f' % (Ys[src].mean(), mp[0][src].mean(), cbs[src].mean(), mp[1][src].mean()))
    # (2) grass edge
    grass = (al < 128) & (full[..., 1] > full[..., 0] + 10)
    yy, xx = np.mgrid[0:H, 0:W]
    lip = (np.abs(xx - dx) <= 44) & (yy >= dy - 60) & (yy <= dy + 20)        # the mouth's own lip stays as painted
    dG = ndi.distance_transform_edt(~grass)
    rng = np.random.default_rng(278)
    n = ndi.gaussian_filter(rng.random((H, W)).astype(np.float32), 2.5); n = (n - n.min()) / (np.ptp(n) + 1e-6) * 5.0
    edge = (al >= 128) & (dG <= 7) & ~lip
    a2 = al.astype(np.float32)
    a2[edge] = 255 * np.clip(dG[edge] - n[edge], 0, 1)
    foot = edge & (a2 >= 128) & (dG - n <= 2.5)
    out[foot] *= 0.82
    print('  grass edge retraced px', int(edge.sum()), 'removed', int((edge & (a2 < 128)).sum()))
    return np.dstack([np.clip(out, 0, 255), a2]).astype(np.uint8)


def build(job):
    E = f'{A.SCRATCH}/entrances/{job}/'
    meta = json.load(open(E + 'patch.json'))
    assert meta['act'] == 1, job
    slug = SLUGS[job]
    X0, Y0 = meta['origin_cells']; W, H = meta['size_px']
    pr = np.asarray(Image.open(E + 'patch.png').convert('RGBA')).astype(np.float32)
    bk = np.asarray(Image.open(E + 'block.png'))
    fr = np.asarray(Image.open(E + 'front.png').convert('RGBA'))
    L = [l for l in json.load(open(A1 + 'landmarks/landmarks.json'))['landmarks'] if l['slug'] == slug][0]
    sp = np.zeros((H, W, 4), np.float32)
    # dq-tiles draws the sprite at L['size'] world px with OW_TILE = 33.6 world px per cell -> 32/33.6 here
    sc = P / 33.6; n = round(L['size'] * sc)
    s = np.asarray(Image.open(A1 + f'landmarks/{slug}.png').convert('RGBA').resize((n, n), Image.LANCZOS)).astype(np.float32)
    cx, cy = L['cell']; sx, sy = (cx - X0) * P + 16 - round(L['anchor'][0] * sc), (cy - Y0) * P + 16 - round(L['anchor'][1] * sc)
    sp[sy:sy + s.shape[0], sx:sx + s.shape[1]] = s
    # the old sprite's foot outside the patch (rubble/threshold of the replaced mouth) is dropped: grass from Act 1's
    # base shows there. Sprite pixels stay only under / next to the patch (6 px), where its feathered edge needs them.
    from scipy import ndimage as ndi
    sp[~ndi.binary_dilation(pr[..., 3] > 0, iterations=6)] = 0
    pa, sa = pr[..., 3:4] / 255, sp[..., 3:4] / 255
    oa = pa + sa * (1 - pa)
    rgb = np.where(oa > 0, (pr[..., :3] * pa + sp[..., :3] * sa * (1 - pa)) / np.maximum(oa, 1e-6), 0)
    base = np.dstack([np.clip(rgb, 0, 255), np.clip(255 * oa, 0, 255)]).astype(np.uint8)
    base = act1_match(base, X0, Y0, (cx - X0) * P + 16, (cy - Y0) * P + 16)

    bits = act1_bits(); bx, by = (X0 - 16) * P, (Y0 - 218) * P
    own = bits[by:by + H, bx:bx + W] > 0
    blk = bk == 255
    print(job, 'base px', int((base[..., 3] > 0).sum()), 'new blocked px', int((blk & ~own).sum()),
          'Act 1 pack blocked inside open channel', int((own & (bk == 0)).sum()))

    out = f'{A.SCRATCH}/overrides/act1-{slug}'; os.makedirs(out, exist_ok=True)
    tiles = []
    for k, x in enumerate(range(0, W, 512)):
        t = {'x': X0 + x // P, 'cols': min(512, W - x) // P}
        b = base[:, x:x + 512]; f = fr[:, x:x + 512]
        if b[..., 3].any(): Image.fromarray(b).save(f'{out}/base-{k}.png', optimize=True); t['base'] = f'base-{k}.png'
        if f[..., 3].any(): Image.fromarray(f).save(f'{out}/front-{k}.png', optimize=True); t['front'] = f'front-{k}.png'
        if len(t) > 2: tiles.append(t)
    meta_o = {'id': f'act1-{slug}', 'origin': [X0, Y0], 'rows': H // P, 'pixelsPerCell': P,
              'depths': {'base': 1.26, 'front': 10.51}, 'tiles': tiles,
              'hideAct1Landmarks': [slug],
              'block': {'origin': [X0, Y0], 'w': W, 'h': H, 'pixelsPerCell': P, 'bitorder': 'little',
                        'b64': base64.b64encode(np.packbits(blk.ravel(), bitorder='little').tobytes()).decode()},
              'collision': 'adds blocking (block bits AND Act 1 pack)',
              'note': f'carved entrance {meta["name"]} ({job}); replaces the build 91 sprite a1alm_{slug}'}
    json.dump(meta_o, open(out + '/override.json', 'w'), indent=1)
    print('wrote', out, len(tiles), 'tiles')


if __name__ == '__main__':
    jobs = sys.argv[1:] or [os.path.basename(os.path.dirname(p)) for p in sorted(glob.glob(A.SCRATCH + '/entrances/*/patch.json'))
                            if json.load(open(p))['act'] == 1]
    for j in jobs: build(j)
