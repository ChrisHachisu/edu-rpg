"""Shared world data for the Acts 2-5 overworld art (cloud renderer).
World grid: 320 (x) by 400 (y) cells. Art: 32 px per cell."""
import json, os
import numpy as np
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OWNER = ROOT + '/design/continent-terrain-class-method/owner-terrain/owner-terrain.json'
LANDMASK = ROOT + '/design/review/overworld-art-blueprint/continent/continent-macro-g3/land-mask.npy'
SCRATCH = os.environ.get('ACTS_OUT', '/tmp/claude-0/-home-claude/c446ac0c-2689-576d-8fff-6176ff6d9aad/scratchpad/acts/overworld')
PREVIEW = os.environ.get('ACTS_PREVIEW', '/mnt/project-files/edu-rpg/acts-preview/overworld')
GW, GH, P = 320, 400, 32
# class codes
OPEN, FOREST, MOUNT, WATER, SEA = 0, 1, 2, 3, 4
CODE = {'.': OPEN, 'R': OPEN, 'F': FOREST, 'M': MOUNT, 'W': WATER}
# composite order: later wins.  Act 4 is painted after Act 3 (owner composite: Act 4 wins in y 88-128)
ORDER = ['1', '2', '3', '5', '4']

def owner():
    return json.load(open(OWNER))

def world(order=ORDER):
    """Returns cls[y,x] (uint8 class), act[y,x] (int8 act number, 0 = none), land[y,x] bool."""
    d = owner(); cls = np.full((GH, GW), OPEN, np.uint8); act = np.zeros((GH, GW), np.int8)
    for k in order:
        a = d['acts'][k]; x0, y0, x1, y1 = a['bounds']
        for j, row in enumerate(a['terrainRows']):
            for i, ch in enumerate(row):
                cls[y0 + j, x0 + i] = CODE.get(ch, OPEN); act[y0 + j, x0 + i] = int(k)
    land = np.load(LANDMASK).astype(bool)
    cls = np.where(land, cls, SEA).astype(np.uint8)
    v = os.environ.get('ACTS_VARIANT', '')
    if v in ('A', 'C') and order is ORDER:
        # candidate A: Act 3's painted rows win in the Act 3/4 overlap (y 88-128)
        cls, act, land = world(['1', '2', '4', '5', '3'])
        if os.environ.get('ACTS_FIX2', '1') == '1': cls = fix2(cls, act)
        return cls, act, land
    if v == 'B' and order is ORDER:
        # candidate B: Act 4 stays on top; narrow 3-cell passes cut through Act 4's dividing range
        # (y 117-129) south to Act 3's open ground, at Desert Tomb (x 269-271) and the Magma mouth (x 191-193)
        for x0 in (269, 191):
            for y in range(110, 132):
                for x in range(x0, x0 + 3):
                    if cls[y, x] == MOUNT: cls[y, x] = OPEN
    return cls, act, land

# candidate C (Act 3 rows win + Magma Tunnels mouths moved); env ACTS_VARIANT=C
VARIANT_MOVES = {'C': {'Magma Tunnels (Act 4 side)': [187, 60],
                       # fix2 (owner 2026-10-28): the old spot (198, 213) stood free at a valley head; this is
                       # the nearest Act 3 inner corner of a south-facing cliff (rock behind and both sides)
                       'Shadow Cave (Act 3 side)': [219, 194]}}

def landmarks():
    d = owner(); out = []; mv = VARIANT_MOVES.get(os.environ.get('ACTS_VARIANT', ''), {})
    for k in ['1', '2', '3', '4', '5']:
        for name, (x, y) in d['acts'][k]['landmarks'].items():
            x, y = mv.get(name, (x, y))
            out.append({'act': int(k), 'name': name, 'cell': [x, y]})
    return out

# ---------------------------------------------------------------- owner fixes 2026-10-28 (fix2)
# connecting (two-entrance) dungeons sit IN their blocking range like Act 1's Crystal Cave: blocker class
CONNECTING = {'Crystal Cave (Act 2 side)': MOUNT, 'Shadow Cave': MOUNT, 'Shadow Cave (Act 3 side)': MOUNT,
              'Magma Tunnels': MOUNT, 'Magma Tunnels (Act 4 side)': MOUNT, 'Volcanic Forge': MOUNT,
              'Volcanic Forge (Act 5 side)': MOUNT, 'Haunted Forest': FOREST,
              'Haunted Forest (second entrance)': FOREST}
FLANK_SKIPPED = set()
# fix2: front plazas dug into a range where a mouth has no room for an approach path (x0, x1, y0, y1 cells)
PLAZA = {'Magma Tunnels (Act 4 side)': [(179, 207, 61, 67), (200, 207, 50, 61)]}   # front plaza + east approach
FLANK_FORCE = {'Magma Tunnels (Act 4 side)': [(13, 12, 10)]}   # full panel east of the mouth
FLANK = (13, 10)    # cells: half-width, depth of the blocker stamped around a connecting mouth
NOTCH = (1, 1)     # fix3: only the mouth cells stay open ground; panels run under the sprite's sides/back

def groups(walk, lms):
    """landmark name -> walkable 4-connected component id (front cell 2 below the door)"""
    from scipy import ndimage as ndi
    lab, _ = ndi.label(walk)
    return {l['name']: int(lab[min(GH - 1, l['cell'][1] + 2), l['cell'][0]]) for l in lms}

def walkable(cls, lms):
    """conservative walkable cells as rendered: open ground only (forest is solid trees), minus the 2 cells
    that mountain panels may spill onto, plus every landmark's approach lane and door cells"""
    from scipy import ndimage as ndi
    w = (cls == OPEN) & ~ndi.binary_dilation(cls == MOUNT, iterations=2)
    for l in lms:
        x, y = l['cell']; w[max(0, y - 1):y + 9, max(0, x - 2):x + 3] |= (cls[max(0, y - 1):y + 9, max(0, x - 2):x + 3] != SEA)
    return w

def same_partition(a, b):
    ka = {}; kb = {}
    for n in a: ka.setdefault(a[n], set()).add(n); kb.setdefault(b[n], set()).add(n)
    return sorted(map(sorted, ka.values())) == sorted(map(sorted, kb.values()))

# (left half-width, right half-width, depth): symmetric first; asymmetric leaves one side open as an approach
# path that runs below the mouth row into the front lane (Act 1's Crystal Cave has rock behind + one side)
FLANK_TRY = [(13, 13, 10), (10, 10, 8), (13, 6, 10), (6, 13, 10), (13, 5, 8), (5, 13, 8), (7, 7, 6),
             (13, 4, 8), (4, 13, 8), (5, 5, 4)]
FLANK_USED = {}    # name -> (half-width, depth) fix2 settled on (largest that keeps every link)

def flank_mask(name, x, y, size=None):
    sz = size or FLANK_USED.get(name, FLANK); nw, nd = NOTCH
    hl, hr, dp = sz if len(sz) == 3 else (sz[0], sz[0], sz[1])
    m = np.zeros((GH, GW), bool)
    # fix3: an organic foot -- full depth beside the mouth (|dx| <= 4), receding 1-3 rows further out with
    # a per-column hash jitter, so the cliff front steps instead of running ruler-straight
    for dx in range(-hl, hr + 1):
        X = x + dx
        if not 0 <= X < GW: continue
        k = abs(dx); jit = ((X * 73856093 ^ y * 19349663) % 997) / 997.0
        drop = 0 if k <= 4 else min(3, (k - 3) // 3 + (jit > 0.55))
        m[max(0, y - dp):y + 1 - drop, X] = True
    m[y - nd:y + 1, x - nw:x + nw + 1] = False
    return m

def fix2(cls, act):
    """1. thin walkable land between mountain and water becomes mountain (Act 1: cliffs meet the sea);
       2. connecting dungeons get their blocker stamped on both sides and behind the mouth.
    Both keep every landmark's walkable component partition unchanged."""
    from scipy import ndimage as ndi
    cls = cls.copy()
    lms = [l for l in landmarks() if l['act'] >= 2]
    near = np.zeros((GH, GW), bool)
    for l in lms:
        x, y = l['cell']; near[max(0, y - 4):y + 10, max(0, x - 5):x + 6] = True
    mine = (act >= 2); mine[218:, :161] = False
    g0 = groups(walkable(cls, lms), lms)
    # 2. connecting mouths first (their notch stays open ground)
    for l in lms:
        if l['name'] not in CONNECTING: continue
        x, y = l['cell']; B = CONNECTING[l['name']]
        if l['name'] in PLAZA:
            pz = np.zeros((GH, GW), bool)
            for x0, x1, y0, y1 in PLAZA[l['name']]: pz[y0:y1, x0:x1] = True
            cls[pz & (cls == MOUNT) & mine] = OPEN
        for sz in FLANK_FORCE.get(l['name'], FLANK_TRY):
            fm = flank_mask(l['name'], x, y, sz) & mine & ((cls == OPEN) | (cls == FOREST))
            trial = cls.copy(); trial[fm] = B
            if same_partition(g0, groups(walkable(trial, lms), lms)):
                cls = trial; FLANK_USED[l['name']] = sz; break
        else: print('fix2: flank would cut a link, skipped', l['name']); FLANK_SKIPPED.add(l['name'])
    print('fix2: flanks', FLANK_USED)
    # 1. coast strips: walkable cells whose gap mountain->water is <= 4 cells, then leftover pockets
    walk = (cls == OPEN) | (cls == FOREST)
    wet = (cls == SEA) | (cls == WATER)
    dM = ndi.distance_transform_edt(cls != MOUNT); dW = ndi.distance_transform_edt(~wet)
    strip = walk & mine & ~near & (dM + dW <= 4.5)
    lab, n = ndi.label(strip, structure=np.ones((3, 3), bool))
    g1 = groups(walk, lms); done = 0
    for i in range(1, n + 1):
        comp = lab == i
        trial = cls.copy(); trial[comp] = MOUNT
        if same_partition(g1, groups((trial == OPEN) | (trial == FOREST), lms)): cls = trial; done += comp.sum()
    walk = (cls == OPEN) | (cls == FOREST)
    lab, n = ndi.label(walk)
    keep_ids = {int(lab[min(GH - 1, l['cell'][1] + 2), l['cell'][0]]) for l in landmarks()}
    sizes = ndi.sum(walk, lab, range(1, n + 1)); pockets = 0
    for i in range(1, n + 1):
        if i in keep_ids or sizes[i - 1] > 400: continue
        comp = lab == i
        if not (comp & mine).all(): continue
        ring = ndi.binary_dilation(comp) & ~comp
        if (cls[ring] == MOUNT).any() and np.isin(cls[ring], (SEA, WATER)).any():
            cls[comp] = MOUNT; pockets += comp.sum()
    print(f'fix2: coast strips -> mountain {done} cells, pockets {pockets} cells')
    return cls
