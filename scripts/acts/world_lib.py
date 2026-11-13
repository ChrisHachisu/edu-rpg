"""World model shared by scripts/build_acts_hifi_manifest.py and scripts/acts/check_world.py.

It answers, offline, the question dq-tiles.js a1mFree answers in the game: can the hero's sole
disc stand here? The numbers below are the live ones (window.__DQ_TILES__.soleSpec(), asserted by
scripts/acts/probe/world.cjs): the disc centre sits SOLE_DY collision px under the sprite centre,
its radius is DISC_R, and it meets each act's QOKF8COL pack closed by CLOSE_R.

Two models, because the two claims need opposite errors:
  TIGHT  blocks at least what the game blocks (closing and disc both over-sized). A door that is
         reachable here is reachable in the game.
  LOOSE  blocks at most what the game blocks (no closing, an under-sized diamond for the disc).
         Two places that are separate here are separate in the game.
World grid 320 x 400 cells, 32 collision px per cell (10240 x 12800 px).
"""
import json, os, re, struct
import numpy as np
import cv2

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GW, GH, P = 320, 400, 32
A1 = (16, 218, 163, 399)                 # Act 1 plate rectangle (public/act1-world-map.js BOUNDS)
SOLE_DY, DISC_R, CLOSE_R = 25, 8.571428571428571, 20
FOOT_DY = 44.11607142857143 * 32 / 48    # the tile-test point under the sprite centre, collision px
ZONES = {2: 'iron-mountains', 3: 'scorched-wastes', 4: 'scorched-wastes', 5: 'demons-threshold'}


def read_bin(path):
    raw = open(path, 'rb').read()
    assert raw[:8] == b'QOKF8COL', path
    ver, head, w, h, ppc = struct.unpack('<HHIII', raw[8:24])
    assert (ver, head, ppc) == (1, 64, P) and len(raw) == 64 + (w * h + 7) // 8, path
    return np.unpackbits(np.frombuffer(raw, np.uint8, offset=64), bitorder='little')[:w * h].reshape(h, w).astype(bool)


def act1_js():
    s = open(os.path.join(ROOT, 'public/act1-world-map.js')).read()
    rows = re.search(r'var ROWS = \[(.*?)\];', s, re.S).group(1)
    rows = re.findall(r"'([0-9a-z]+)'", rows)
    lms = json.loads(re.search(r'var LANDMARKS = (\[.*?\]);', s, re.S).group(1))
    return rows, lms


def act_dir(n):
    return os.path.join(ROOT, f'public/act{n}-hifi')


def act_manifest(n):
    p = os.path.join(act_dir(n), 'manifest.json')
    return json.load(open(p)) if os.path.isfile(p) else None


def cell_raster(owner_act, manifests):
    """Which pack answers for each cell: 0 nobody (open sea), 1 Act 1's rectangle, 2-5 an act.
    The owner act, except that a landmark's mask box answers to the act that drew it (variant C:
    Ember's Rest is Act 4 art on rows Act 3 owns)."""
    cell = owner_act.astype(np.uint8).copy()
    for n, m in manifests.items():
        if not m: continue
        x0, y0, x1, y1 = m['bounds']
        for L in m.get('landmarks', []):
            if L.get('carved') or 'maskSize' not in L: continue
            an, sz = L['maskAnchor'], L['maskSize']
            px0, py0 = (L['cell'][0] + 0.5) * P - an[0], (L['cell'][1] + 0.5) * P - an[1]
            cx0, cy0 = int(np.floor(px0 / P)), int(np.floor(py0 / P))
            cx1, cy1 = int(np.floor((px0 + sz[0] - 1) / P)), int(np.floor((py0 + sz[1] - 1) / P))
            cell[max(y0, cy0):min(y1, cy1) + 1, max(x0, cx0):min(x1, cx1) + 1] = n
    cell[A1[1]:A1[3] + 1, A1[0]:A1[2] + 1] = 1
    return cell


def stitch(cell, tight):
    """Blocked raster of the whole world (uint8 0/1), each cell answered by its own pack."""
    B = np.ones((GH * P, GW * P), np.uint8)                       # nobody's cells: sea
    for n in (2, 3, 4, 5):
        p = os.path.join(act_dir(n), 'collision.bin')
        if not os.path.isfile(p): continue
        m = act_manifest(n); x0, y0, x1, y1 = m['bounds']
        bits = read_bin(p)
        mine = np.repeat(np.repeat(cell[y0:y1 + 1, x0:x1 + 1] == n, P, 0), P, 1)
        view = B[y0 * P:(y1 + 1) * P, x0 * P:(x1 + 1) * P]
        view[mine] = bits[:view.shape[0], :view.shape[1]][mine]
    # Act 1: its own pack (forest + cliff alpha) and its water cells. Water's real edge is an
    # analytic field in the game, so TIGHT takes every water cell and LOOSE only interior water.
    rows, _ = act1_js()
    bits = read_bin(os.path.join(ROOT, 'public/act1-hifi/forest-collision.bin'))
    water = np.array([[c == '2' for c in r] for r in rows], np.uint8)
    if not tight: water = cv2.erode(water, np.ones((3, 3), np.uint8), borderValue=1)
    a1 = bits | np.repeat(np.repeat(water.astype(bool), P, 0), P, 1)
    B[A1[1] * P:(A1[3] + 1) * P, A1[0] * P:(A1[2] + 1) * P] = a1
    return B


def free_space(B, tight):
    """Where the sole disc CENTRE may be (uint8 0/1)."""
    if tight:
        k = 2 * (CLOSE_R + 2) + 1
        closed = cv2.dilate(B, np.ones((k, k), np.uint8))
        closed = cv2.erode(closed, cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3)), iterations=CLOSE_R + 2, borderValue=1)
        closed |= B
        r = int(np.ceil(DISC_R)) + 1
        return 1 - cv2.dilate(closed, np.ones((2 * r + 1, 2 * r + 1), np.uint8))
    r = int(np.floor(DISC_R)) - 1
    return 1 - cv2.dilate(B, cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3)), iterations=r)


def label(F, tight):
    n, lab = cv2.connectedComponents(F, connectivity=4 if tight else 8, ltype=cv2.CV_32S)
    return lab


def stand(x, y):
    """Disc-centre px of a hero whose sprite centre is on the centre of cell (x, y)."""
    return x * P + 16, y * P + 16 + SOLE_DY


def exit_for(at, gate):
    """Where an interior puts the hero back. South gate: the cell below the door. North gate: two
    cells above it, because her tile-test point is FOOT_DY (0.92 cell) under her centre and one
    cell above would stand her feet inside the door cell."""
    return [at[0], at[1] + 1] if gate != 'north' else [at[0], at[1] - 2]


def fire_px(at, gate):
    """Disc-centre px at the moment the door answers: her centre crossing into the door cell from
    the south, or her tile-test point touching the door cell from the north."""
    x, y = at
    if gate != 'north': return x * P + 16, (y + 1) * P - 1 + SOLE_DY
    return x * P + 16, int(y * P - 1 - FOOT_DY + SOLE_DY)


def rle(a):
    rows = []
    for r in a:
        runs, cur, n = [], int(r[0]), 0
        for v in r:
            v = int(v)
            if v == cur: n += 1
            else: runs.append(f'{cur}:{n}'); cur, n = v, 1
        runs.append(f'{cur}:{n}')
        rows.append(','.join(runs))
    return {'width': int(a.shape[1]), 'height': int(a.shape[0]), 'rows': rows}


def unrle(o):
    out = np.zeros((o['height'], o['width']), np.int16)
    for y, row in enumerate(o['rows']):
        x = 0
        for run in row.split(','):
            v, n = run.split(':'); out[y, x:x + int(n)] = int(v); x += int(n)
    return out
