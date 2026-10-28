#!/usr/bin/env python3
"""Global (whole-continent) placement of whole kit objects for Acts 2-5.

Placed once in world cells so overlapping act windows agree. Output: SCRATCH/placements.json
  trees : Act 1 crown rows (row pitch 1.45 cells, mean pitch along the row 1.86 cells -> 0.37 crowns
          per F cell, the measured Act 1 density), side 68 (136 px), source index 0..6, flipX
  rocks : greedy whole-object max-coverage of owner M cells with the Act 1 main kit (x0.5) then the
          companion kit (x0.125). An object's occupied cells must lie in M or water (it may overhang
          the sea/lakes), its bottom (base) row must stand on M, and it never reaches open ground/forest.
"""
import os, sys, json
import numpy as np
from scipy import ndimage as ndi
from scipy.signal import fftconvolve
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import acts_common as A
import biome_kits as K

LANDMARK_CLEAR = 3.2   # cells: no tree/rock centre within this radius of a landmark cell

def footprint(rgba, ox, oy, thr=0.12):
    """Cells covered (alpha fraction > thr) by an object image drawn with top-left at cell-aligned px."""
    a = rgba[..., 3] > 0; H, W = a.shape
    ch, cw = (H + 31) // 32, (W + 31) // 32
    pad = np.zeros((ch * 32, cw * 32), bool); pad[:H, :W] = a
    f = pad.reshape(ch, 32, cw, 32).mean((1, 3))
    return f > thr

def gate_sgn(cls, l):
    x, y = l['cell']; return -1 if cls[min(A.GH - 1, y + 3), x] in (A.SEA, A.WATER) else 1

def in_approach(cls, l, cx, cy):
    """approach lane in front of a town gate / dungeon mouth: 4.6 cells wide (feet stencil 1.75 + crown
    overhang), 8 cells deep -- no tree or rock centre there"""
    d = (cy - l['cell'][1] - .5) * gate_sgn(cls, l)
    return abs(cx - l['cell'][0] - .5) < 2.3 and 0 < d < 8

def place_rocks(cls, act, lms):
    kit = K.act1_rock_sources(); geo = K.cliff_geometry()
    # owner ruling 2026-10-28: only the large Act 1 cliff-kit panels (main kit x0.5); no companion spires
    order = [('broad-joining-mass-A', 'main'), ('interior-rock-panel', 'main'), ('broad-joining-mass-B', 'main'),
             ('narrow-notch-buttress', 'main')]
    M = (cls == A.MOUNT) & (act >= 2)
    # Act 5's art also covers the top 4 rows of Act 1's range (y 218-221, x 80-160) so the seam strip disappears
    M[218:222, 80:161] |= (cls[218:222, 80:161] == A.MOUNT)
    wet = (cls == A.SEA) | (cls == A.WATER)
    clear = np.zeros_like(M)
    for l in lms:
        x, y = l['cell']; clear[max(0, y - 3):y + 3, max(0, x - 3):x + 4] = True
        if gate_sgn(cls, l) > 0: clear[y + 1:y + 9, max(0, x - 2):x + 3] = True
        else: clear[max(0, y - 8):y, max(0, x - 2):x + 3] = True
    # ridges too thin for a panel widen into ground (up to 4 cells; that ground becomes blocked mountain);
    # everywhere else a panel may spill 1 cell past the painted range edge
    core = ndi.binary_opening(M, iterations=3)
    thin = M & ~ndi.binary_dilation(core, iterations=3)
    opn = (cls == A.OPEN) & (act >= 2)
    widen = (ndi.binary_dilation(thin, iterations=4) | ndi.binary_dilation(M, iterations=2)) & ~M & opn
    # Act 1's range top (rows 218-221, under Act 5's art) is only 4 rows deep: widen it up to 9 rows into
    # Act 5 ground so a whole panel stands there
    top = np.zeros_like(M); colm = M[218:222, :161].any(0)
    top[209:218, :161] = colm[None, :] & opn[209:218, :161]
    widen |= top
    allowed = (M | wet | widen) & ~clear
    stand = (M | widen) & ~clear
    # keep whole objects inside the art of their own act (never into Act 1's shipped raster)
    allowed[222:, :161] = False; allowed[218:222, :80] = False
    # Act 2's divider strip (x 161-170) is narrower than a panel: panels may reach 9 cells into Act 1's
    # mountain columns; Act 1's shipped raster is pasted back over x < 161, so they end at the act seam
    allowed[222:, 152:161] |= (cls[222:, 152:161] == A.MOUNT)
    stand[222:, 152:161] |= (cls[222:, 152:161] == A.MOUNT)
    uncovered = M & ~clear
    placed = []; temps = {}
    for name, grp in order:
        if geo:   # Codex per-act panels share one canvas per slot: union must fit, intersection covers
            fpa = footprint(geo[name]['union'][..., None].repeat(4, -1), 0, 0, thr=0.04)
            fpc = footprint(geo[name]['inter'][..., None].repeat(4, -1), 0, 0, thr=0.6)
        else:
            fpa = footprint(kit[name], 0, 0, thr=0.04)     # every cell the art touches must be allowed
            fpc = footprint(kit[name], 0, 0, thr=0.6)      # a cell counts as filled only when the art is solid there
        base = np.zeros_like(fpa)
        for cx in range(fpa.shape[1]):
            ys = np.nonzero(fpa[:, cx])[0]
            if len(ys): base[ys.max(), cx] = True
        temps[name] = (fpa, fpc, base, grp)
    def crop(full, h, w): return full[h - 1:h - 1 + M.shape[0], w - 1:w - 1 + M.shape[1]]
    vm = {}
    for n, _ in order:
        fpa, fpc, base, _g = temps[n]; h, w = fpa.shape
        bad = crop(fftconvolve((~allowed).astype(np.float32), fpa[::-1, ::-1].astype(np.float32), mode='full'), h, w)
        nb = crop(fftconvolve((~stand).astype(np.float32), base[::-1, ::-1].astype(np.float32), mode='full'), h, w)
        vm[n] = (bad < 0.5) & (nb < 0.5)
    for min_gain in (20, 8, 2):
        for it in range(4000):
            best = None
            for n, _ in order:
                fpa, fpc, base, _g = temps[n]; h, w = fpc.shape
                g = crop(fftconvolve(uncovered.astype(np.float32), fpc[::-1, ::-1].astype(np.float32), mode='full'), h, w)
                g = np.where(vm[n], g, -1)
                gmax = g.max()
                cand = np.flatnonzero(g >= max(min_gain, gmax * 0.9))
                if len(cand) == 0: cand = np.array([np.argmax(g)])
                hh = K._hash01(cand % 997, cand // 997 + it, 4242 + len(n))
                k = int(cand[np.argmax(hh)]); gv = g.flat[k]
                if best is None or gv > best[0]: best = (gv, n, k)
            if best[0] < min_gain: break
            gv, n, k = best; y, x = divmod(k, M.shape[1])
            fpc = temps[n][1]; h, w = fpc.shape
            uncovered[y:y + h, x:x + w] &= ~fpc
            placed.append({'asset': n, 'group': 'main', 'originWorldCell': [int(x), int(y)],
                           'gainCells': int(round(gv))})
    print('rocks', len(placed), 'uncovered M cells', int(uncovered.sum()), 'of', int(M.sum()))
    return placed, uncovered

def place_trees(cls, act, lms, seed=20261028):
    F = (cls == A.FOREST) & (act >= 2)
    out = []; n = 0
    ys = np.arange(0, A.GH, 1.45)
    for ri, y in enumerate(ys):
        x = K._hash01(ri, 7, seed) * 1.86
        while x < A.GW:
            cx, cy = x, y + (K._hash01(int(x * 100), ri, seed + 1) - 0.5) * 0.3
            ix, iy = int(cx), int(cy)
            ok_seam = not ((cy >= 216 and cx < 163.3) or (cx < 164 and 215.8 < cy < 218))
            if 0 <= iy < A.GH and F[iy, ix] and ok_seam:
                if all((cx - l['cell'][0] - .5) ** 2 + (cy - l['cell'][1] - .5) ** 2 > LANDMARK_CLEAR ** 2 and not in_approach(cls, l, cx, cy) for l in lms):
                    h = K._hash01(ix * 7 + ri, iy * 13, seed + 2)
                    out.append({'id': f'tree-{n:05d}', 'center': [round(cx, 3), round(cy, 3)],
                                'sourceIndex': int(h * 7) % 7, 'side': 68,
                                'flipX': bool(K._hash01(ix, iy * 3 + ri, seed + 3) > 0.5), 'candidateRow': ri})
                    n += 1
            x += 0.425 * (2 + int(K._hash01(int(x * 1000), ri, seed + 4) * 6.0))  # 0.85 .. 3.4, mean ~1.86
    print('trees', len(out), 'F cells', int(F.sum()), 'density', len(out) / max(1, F.sum()))
    return out

def build(force=False):
    p = A.SCRATCH + '/placements.json'
    if os.path.exists(p) and not force: return json.load(open(p))
    cls, act, land = A.world(); lms = [l for l in A.landmarks() if l['act'] >= 2]
    rocks, unc = place_rocks(cls, act, lms)
    trees = place_trees(cls, act, lms)
    doc = {'kind': 'acts2-5-whole-object-placements-v1', 'pixelsPerCell': 32,
           'rockNormalization': {'main': 0.5, 'companion': 0.125}, 'treeSide': 68,
           'rocks': rocks, 'trees': trees, 'uncoveredMountainCells': int(unc.sum())}
    json.dump(doc, open(p, 'w')); np.save(A.SCRATCH + '/uncovered.npy', unc)
    return doc

if __name__ == '__main__':
    build(force=True)
