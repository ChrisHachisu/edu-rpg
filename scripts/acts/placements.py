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

def place_rocks(cls, act, lms):
    kit = K.act1_rock_sources()
    order = [('broad-joining-mass-A', 'main'), ('interior-rock-panel', 'main'), ('broad-joining-mass-B', 'main'),
             ('narrow-notch-buttress', 'main'), ('companion-narrow-buttress', 'companion'),
             ('companion-low-shoulder', 'companion'), ('companion-tall-fin', 'companion')]
    M = (cls == A.MOUNT) & (act >= 2)
    # Act 5's art also covers the top 4 rows of Act 1's range (y 218-221, x 80-160) so the seam strip disappears
    M[218:222, 80:161] |= (cls[218:222, 80:161] == A.MOUNT)
    wet = (cls == A.SEA) | (cls == A.WATER)
    allowed = M | wet
    # keep landmarks and their approach ring free
    clear = np.zeros_like(M)
    for l in lms:
        x, y = l['cell']; clear[max(0, y - 3):y + 3, max(0, x - 3):x + 4] = True
    # thin ridges (<= ~4 cells across) may widen by 2 cells onto open ground so whole main objects fit
    # instead of rows of lone spires (picket fences)
    thick = ndi.distance_transform_edt(M)
    core = ndi.binary_opening(M, iterations=2)
    thin = M & ~ndi.binary_dilation(core, iterations=2)
    widen = ndi.binary_dilation(thin, iterations=2) & ~M & (cls == A.OPEN) & (act >= 2)
    allowed |= widen
    allowed &= ~clear
    # keep whole objects inside the art of their own act: nothing of Acts 2-5 may reach into Act 1's
    # shipped raster (x < 161 for y >= 218), so no object is ever clipped by a chunk-grid edge there
    allowed[222:, :161] = False; allowed[218:222, :80] = False
    uncovered = M & ~clear
    # also: never start new objects inside Act 1's shipped mountains (Act 1 owns x<164, y>=218)
    act1zone = np.zeros_like(M); act1zone[218:, :164] = True
    placed = []
    temps = {}
    for name, grp in order:
        # a cell counts as occupied above this alpha fraction; the companions get a looser rule so
        # wider shoulders fit 2-3 cell ridges (fewer lone spires -> no picket fences)
        fp = footprint(kit[name], 0, 0, thr=0.25 if grp == 'main' else 0.4)
        base = np.zeros_like(fp);
        for cx in range(fp.shape[1]):
            ys = np.nonzero(fp[:, cx])[0]
            if len(ys): base[ys.max(), cx] = True
        temps[name] = (fp, base, grp)
    def valid_map(fp, base):
        # origin (y,x) valid if all fp cells allowed and all base cells in M (correlation via flipped conv)
        bad = fftconvolve((~allowed).astype(np.float32), fp[::-1, ::-1].astype(np.float32), mode='full')
        nb = fftconvolve((~M).astype(np.float32), base[::-1, ::-1].astype(np.float32), mode='full')
        h, w = fp.shape
        # full-mode index (y+h-1, x+w-1) corresponds to origin (y, x)
        v = (bad[h - 1:h - 1 + M.shape[0], w - 1:w - 1 + M.shape[1]] < 0.5) & \
            (nb[h - 1:h - 1 + M.shape[0], w - 1:w - 1 + M.shape[1]] < 0.5)
        return v
    for phase, names, min_gain in (('main', order[:4], 18), ('companion', order[4:], 2)):
        vm = {n: valid_map(temps[n][0], temps[n][1]) for n, _ in names}
        for it in range(3000):
            best = None
            for n, _ in names:
                fp = temps[n][0]
                g = fftconvolve(uncovered.astype(np.float32), fp[::-1, ::-1].astype(np.float32), mode='full')
                h, w = fp.shape
                g = g[h - 1:h - 1 + M.shape[0], w - 1:w - 1 + M.shape[1]]
                g = np.where(vm[n], g, -1)
                # prefer the larger objects slightly, tie-break by position hash (variety)
                gmax = g.max()
                cand = np.flatnonzero(g >= max(min_gain, gmax * 0.9))
                if len(cand) == 0: cand = np.array([np.argmax(g)])
                hh = K._hash01(cand % 997, cand // 997 + it, 4242 + len(n))
                k = int(cand[np.argmax(hh)]); gv = g.flat[k]
                if best is None or gv > best[0]: best = (gv, n, k)
            if best[0] < min_gain: break
            gv, n, k = best; y, x = divmod(k, M.shape[1])
            fp = temps[n][0]; h, w = fp.shape
            uncovered[y:y + h, x:x + w] &= ~fp
            placed.append({'asset': n, 'group': temps[n][2], 'originWorldCell': [int(x), int(y)],
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
                if all((cx - l['cell'][0] - .5) ** 2 + (cy - l['cell'][1] - .5) ** 2 > LANDMARK_CLEAR ** 2 for l in lms):
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
    json.dump(doc, open(p, 'w'))
    return doc

if __name__ == '__main__':
    build(force=True)
