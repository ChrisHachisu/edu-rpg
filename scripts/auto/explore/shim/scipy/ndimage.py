"""numpy-only distance_transform_edt / label / binary_dilation, exact for the uses in
scripts/acts/dungeons2/export_runtime.py (8-connected label, 3x3 dilation, EDT of a bool mask)."""
import numpy as np


def _vert(m):
    # 1D distance (in rows) to the nearest False pixel in each column; inf if none
    H, W = m.shape
    INF = 10 ** 6
    d = np.full((H, W), INF, np.int64)
    cur = np.full(W, INF, np.int64)
    for y in range(H):
        cur = np.where(m[y], np.minimum(cur + 1, INF), 0); d[y] = cur
    cur = np.full(W, INF, np.int64)
    for y in range(H - 1, -1, -1):
        cur = np.where(m[y], np.minimum(cur + 1, INF), 0); d[y] = np.minimum(d[y], cur)
    return d


def distance_transform_edt(m, cap=64):
    """Exact Euclidean distance to the nearest zero, for distances < cap (larger values are
    reported as >= cap). export_runtime only thresholds at 17."""
    m = np.asarray(m, bool)
    g = _vert(m).astype(np.float64)
    g2 = np.minimum(g, cap) ** 2
    H, W = m.shape
    best = g2.copy()
    for dx in range(1, cap):
        dd = dx * dx
        if dd >= cap * cap:
            break
        # neighbour at x+dx and x-dx; outside the image counts as no zero there
        best[:, :-dx] = np.minimum(best[:, :-dx], g2[:, dx:] + dd)
        best[:, dx:] = np.minimum(best[:, dx:], g2[:, :-dx] + dd)
    return np.sqrt(np.minimum(best, cap * cap))


def binary_dilation(m, structure=None):
    m = np.asarray(m, bool)
    out = m.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            s = np.zeros_like(m)
            ys = slice(max(0, dy), m.shape[0] + min(0, dy)); yd = slice(max(0, -dy), m.shape[0] + min(0, -dy))
            xs = slice(max(0, dx), m.shape[1] + min(0, dx)); xd = slice(max(0, -dx), m.shape[1] + min(0, -dx))
            s[yd, xd] = m[ys, xs]
            out |= s
    return out


def label(m, structure=None):
    """8-connected component labels by row runs + union-find."""
    m = np.asarray(m, bool)
    H, W = m.shape
    lab = np.zeros((H, W), np.int32)
    par = [0]

    def find(i):
        while par[i] != i:
            par[i] = par[par[i]]; i = par[i]
        return i
    prev = []
    for y in range(H):
        row = m[y]
        if not row.any():
            prev = []; continue
        e = np.diff(np.concatenate(([0], row.view(np.int8), [0])))
        starts = np.nonzero(e == 1)[0]; ends = np.nonzero(e == -1)[0]
        cur = []
        j = 0
        for s, t in zip(starts.tolist(), ends.tolist()):
            n = len(par); par.append(n)
            while j < len(prev) and prev[j][1] < s:      # prev run ends (excl) before s-1 reach
                j += 1
            k = j
            while k < len(prev) and prev[k][0] <= t:     # 8-conn: [ps,pt) touches [s-1, t+1)
                if prev[k][1] >= s:
                    a, b = find(prev[k][2]), find(n)
                    if a != b:
                        par[max(a, b)] = min(a, b)
                k += 1
            cur.append((s, t, n))
        for s, t, n in cur:
            lab[y, s:t] = n
        prev = cur
    roots = {}
    mp = np.zeros(len(par), np.int32)
    for i in range(1, len(par)):
        r = find(i)
        if r not in roots:
            roots[r] = len(roots) + 1
        mp[i] = roots[r]
    return mp[lab], len(roots)
