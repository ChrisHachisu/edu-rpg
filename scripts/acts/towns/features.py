"""Built features the Act 1 kit has no single piece for, assembled from Act 1 TEXTURES:

  walls / towers / gatehouses   faces from Port Sapphire's dressed quay stone (ground-quay.png),
                                walk-tops from the plates' own cobble
  terraces                      retaining walls with stairs where a lane climbs them
  channels / pools              lava, ice or water behind a rock rim with a lit inner lip;
                                interiors from Act 1 water pixels, graded later by grade.py
  bridges                       Port Sapphire deck planks across a channel

All drawn in Act 1 colour space and art px of the 1950 plate; grade.py re-grades them by class.
Every function returns updated (canvas, cls, block, shadow) and never touches anything else.
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

import ground
from kitlib import ACT1_DESIGN, APC, PLATE, value_noise

_T = {}


def tex(name):
    if name not in _T:
        t = np.asarray(Image.open(os.path.join(ACT1_DESIGN, f"ground/ground-{name}.png")).convert("RGB")).astype(np.float32)
        _T[name] = t
    return _T[name]


def tiled(name, flip=True):
    t = tex(name)
    th, tw = t.shape[:2]
    reps = (PLATE // th + 2, PLATE // tw + 2)
    rows = []
    for j in range(reps[0]):
        rows.append(np.concatenate([t if not (flip and (i + j) % 2) else t[:, ::-1] for i in range(reps[1])], 1))
    return np.concatenate(rows, 0)[:PLATE, :PLATE]


def raster_line(pts, w, closed=False):
    im = Image.new("L", (PLATE, PLATE), 0)
    d = ImageDraw.Draw(im)
    P = [(x * APC, y * APC) for x, y in pts]
    if closed:
        P = P + [P[0]]
    d.line(P, fill=255, width=int(w * APC), joint="curve")
    for p in P:
        r = w * APC / 2
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=255)
    return np.asarray(im) > 127


def raster_poly(pts):
    im = Image.new("L", (PLATE, PLATE), 0)
    ImageDraw.Draw(im).polygon([(x * APC, y * APC) for x, y in pts], fill=255)
    return np.asarray(im) > 127


def bands_below(top, depth):
    rowk = np.zeros(top.shape, np.int16)
    cur = top.copy()
    for k in range(1, depth + 1):
        nxt = np.zeros_like(cur)
        nxt[1:] = cur[:-1]
        new = nxt & ~top & (rowk == 0)
        rowk[new] = k
        cur = nxt
    return rowk


def _face(canvas, face, rowk, depth, shade_top=1.0, shade_bot=0.62):
    """Dressed-stone face: quay ashlar, darker toward the foot, lit lip, dark footing line."""
    q = tiled("quay", flip=False)
    yy, xx = np.mgrid[0:PLATE, 0:PLATE]
    t = (rowk / max(depth, 1)).astype(np.float32)
    sh = shade_top + (shade_bot - shade_top) * t
    canvas[face] = (q * sh[..., None])[face]
    lip = face & (rowk <= 2)
    canvas[lip] = np.minimum(canvas[lip] * 1.25 + 18, 255)
    foot = face & (rowk >= depth - 2)
    canvas[foot] = canvas[foot] * 0.45


def stone_mass(canvas, cls, block, shadow, top, depth, C_WALL, crenel=True, top_shade=0.82):
    """Generic raised stone mass: `top` is the walk/roof surface, the face hangs `depth` px below."""
    cob = ground.get("cobble")
    q = tiled("quay", flip=False)
    yy, xx = np.mgrid[0:PLATE, 0:PLATE]
    rowk = bands_below(top, depth)
    face = rowk > 0
    # walk top: cobble, framed by a ring of dressed blocks
    canvas[top] = cob[top] * top_shade
    frame = top & ~ndi.binary_erosion(top, iterations=9)
    canvas[frame] = q[frame] * 0.78
    edge_hi = top & ~ndi.binary_erosion(top, iterations=2)
    canvas[edge_hi] = np.minimum(canvas[edge_hi] * 1.2 + 14, 255)
    if crenel:
        # merlons along the south (viewer-facing) edge of the top, every ~0.8 cell
        south = top & ~np.roll(top, -12, axis=0)
        mer = south & (((xx // 24) % 2) == 0)
        mer = ndi.binary_dilation(mer, iterations=2) & top
        mrow = bands_below(mer, 8) * (~top)
        canvas[mer] = np.minimum(q[mer] * 1.15 + 10, 255)
        mface = (mrow > 0) & ~mer
        # merlon faces sit ON the wall face (they are the top of it)
        canvas[mface & face] = canvas[mface & face] * 0.9
        mo = ndi.binary_dilation(mer, iterations=1) & top & ~mer
        canvas[mo] = canvas[mo] * 0.45
        # each merlon throws a short shadow back onto the walk (light from the south-west)
        msh = np.zeros_like(mer)
        for k in range(2, 8):
            msh[:-k, k // 2:] |= mer[k:, :-(k // 2) or None]
        msh &= top & ~mer & ~mo
        canvas[msh] = canvas[msh] * 0.62
    _face(canvas, face, rowk, depth)
    # DQ-style outline: a 2-px dark line round the whole mass reads it off the ground
    mass = top | face
    ring = ndi.binary_dilation(mass, iterations=2) & ~mass
    ring &= (cls == 0) | (cls == 1)          # only over open field / lane
    canvas[ring] = canvas[ring] * 0.38
    cls[ring] = C_WALL                       # graded as stone, so the ground transfer keeps it dark
    cls[top | face] = C_WALL
    block |= top | face
    # contact shadow at the foot and a soft cast to the lower right
    foot = ndi.binary_dilation(face | top, iterations=1) & ~(face | top)
    ao = ndi.gaussian_filter((face | top).astype(np.float32), 5)
    shadow = np.maximum(shadow, ao * 0.5 * ~(face | top))
    return canvas, cls, block, shadow


def walls(canvas, cls, block, shadow, layout, C_WALL):
    for w in layout.get("walls", []):
        top = raster_line(w["pts"], w.get("t", 1.6), closed=w.get("closed", False))
        for g in w.get("gaps", []):     # gate openings, [x0, x1, y0, y1] cells
            x0, x1, y0, y1 = [v * APC for v in g]
            top[int(y0):int(y1), int(x0):int(x1)] = False
        canvas, cls, block, shadow = stone_mass(canvas, cls, block, shadow, top,
                                                int(w.get("h", 1.5) * APC), C_WALL,
                                                crenel=not w.get("low", False))
    for t in layout.get("towers", []):
        cx, cy = t["at"]                # at = centre of the tower's FOOT line
        wcell = t.get("w", 4.0)
        hcell = t.get("h", 3.0)          # face height
        dcell = t.get("d", 3.0)          # roof/top depth
        x0, x1 = int((cx - wcell / 2) * APC), int((cx + wcell / 2) * APC)
        yb = int(cy * APC)
        yt = yb - int((hcell + dcell) * APC)
        top = np.zeros((PLATE, PLATE), bool)
        top[yt:yt + int(dcell * APC), x0:x1] = True
        canvas, cls, block, shadow = stone_mass(canvas, cls, block, shadow, top, int(hcell * APC), C_WALL,
                                                top_shade=0.7)
        # door and a lit window on the face
        fy0 = yt + int(dcell * APC)
        if t.get("door", True):
            dw = int(0.9 * APC)
            d = Image.new("L", (PLATE, PLATE), 0)
            ImageDraw.Draw(d).rounded_rectangle([cx * APC - dw / 2, yb - int(1.6 * APC), cx * APC + dw / 2, yb - 2],
                                                radius=dw // 2, fill=255)
            dm = np.asarray(d) > 127
            canvas[dm] = (34, 24, 16)
        if t.get("window", True):
            wy = fy0 + int(0.5 * APC)
            canvas[wy:wy + 14, int(cx * APC) - 6:int(cx * APC) + 6] = (250, 210, 120)
            canvas[wy:wy + 14, int(cx * APC) - 1:int(cx * APC) + 1] = (120, 80, 40)
            layout.setdefault("_lights", []).append([cx, (wy + 7) / APC, 1.3])
    return canvas, cls, block, shadow


def terraces(canvas, cls, block, shadow, layout, C_WALL, C_LANE):
    cob = ground.get("cobble")
    yy, xx = np.mgrid[0:PLATE, 0:PLATE]
    for t in layout.get("terraces", []):
        line = raster_line(t["pts"], 0.5)
        depth = int(t.get("h", 1.4) * APC)
        rowk = bands_below(line, depth)
        face = (rowk > 0) | line
        stairs = np.zeros_like(face)
        for (sx0, sx1) in t.get("stairs", []):
            stairs |= (xx >= sx0 * APC) & (xx < sx1 * APC)
        stairs &= ndi.binary_dilation(face, iterations=4)
        wall = face & ~stairs
        _face(canvas, wall & (rowk > 0), rowk, depth)
        canvas[line & ~stairs] = np.minimum(cob[line & ~stairs] * 1.1 + 10, 255)
        cls[wall] = C_WALL
        block |= wall
        # stairs: cobble with a dark riser every 7 px and lit tread edge
        st = stairs
        canvas[st] = cob[st] * 0.95
        riser = st & (((yy - (yy * 0)) % 8) < 2)
        canvas[riser] = canvas[riser] * 0.55
        tread = st & (((yy % 8) == 2))
        canvas[tread] = np.minimum(canvas[tread] * 1.2 + 10, 255)
        sides = st & ~ndi.binary_erosion(st, iterations=4, border_value=1) & ndi.binary_dilation(wall, iterations=5)
        canvas[sides] = canvas[sides] * 0.6
        cls[st] = C_LANE
        # the lower tier sits in the terrace's shadow: a band under the foot of the face
        below = bands_below(face, 26) * ~face
        sb = np.where(below > 0, 0.5 * (1 - below / 26.0), 0).astype(np.float32)
        shadow = np.maximum(shadow, ndi.gaussian_filter(sb, 2) * ~stairs)
    return canvas, cls, block, shadow


def _liquid(canvas, cls, block, shadow, m, C_WATER, C_ROCK, rim_px=14):
    """Pool / channel interior from Act 1 water pixels, behind a rock rim with a lit inner lip."""
    wt = tiled("water")
    cliff = ground.get("cliff")
    rim = ndi.binary_dilation(m, iterations=rim_px) & ~m
    canvas[m] = wt[m]
    cls[m] = C_WATER
    # rim: Act 1 cliff rock, brightened on its upper (north) inner side where light catches it
    canvas[rim] = cliff[rim] * 1.05
    cls[rim] = C_ROCK
    lip_in = m & ~ndi.binary_erosion(m, iterations=3)
    up = np.zeros_like(m)
    up[3:] = rim[:-3]
    canvas[lip_in & up] = canvas[lip_in & up] * 0.5            # shadowed inner wall under the north rim
    lit = rim & ndi.binary_dilation(m, iterations=3) & ~up      # the south rim's inner edge catches light
    canvas[lit] = np.minimum(canvas[lit] * 1.35 + 20, 255)
    outer = rim & ~ndi.binary_dilation(m, iterations=rim_px - 2)
    canvas[outer] = canvas[outer] * 0.7
    block |= ndi.binary_dilation(m, iterations=rim_px - 6)
    ao = ndi.gaussian_filter((rim | m).astype(np.float32), 4)
    shadow = np.maximum(shadow, ao * 0.3 * ~(rim | m))
    return canvas, cls, block, shadow


def liquids(canvas, cls, block, shadow, layout, C_WATER, C_ROCK, seed):
    for wb in layout.get("water", []):
        if "poly" in wb:
            pts = wb["poly"]
            for _ in range(3):        # Chaikin: a pond has no corners
                q = []
                for i in range(len(pts)):
                    a, b = pts[i], pts[(i + 1) % len(pts)]
                    q += [[0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]],
                          [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]]
                pts = q
            m = raster_poly(pts)
        else:
            cx, cy = wb["c"]
            rr = np.random.default_rng(seed + int(cx * 7 + cy))
            ph = rr.random(2) * 6.28
            pts = []
            for k in range(90):
                t = k / 90 * 2 * math.pi
                wob = 1 + 0.08 * math.sin(3 * t + ph[0]) + 0.05 * math.sin(5 * t + ph[1])
                pts.append((cx + wb["rx"] * wob * math.cos(t), cy + wb["ry"] * wob * math.sin(t)))
            m = raster_poly(pts)
        canvas, cls, block, shadow = _liquid(canvas, cls, block, shadow, m, C_WATER, C_ROCK)
    for ch in layout.get("channels", []):
        m = raster_line(ch["pts"], ch.get("w", 1.6))
        canvas, cls, block, shadow = _liquid(canvas, cls, block, shadow, m, C_WATER, C_ROCK, rim_px=11)
    return canvas, cls, block, shadow


def bridges(canvas, cls, block, shadow, layout, C_LANE):
    deck = tiled("deck")
    yy, xx = np.mgrid[0:PLATE, 0:PLATE]
    for b in layout.get("bridges", []):
        cx, cy = b["at"]
        w, ln = b.get("w", 3.0), b.get("len", 4.0)
        vertical = b.get("dir", "v") == "v"
        hw, hl = (w if vertical else ln) / 2 * APC, (ln if vertical else w) / 2 * APC
        m = (np.abs(xx - cx * APC) < hw) & (np.abs(yy - cy * APC) < hl)
        canvas[m] = deck[m] if not vertical else np.transpose(deck, (1, 0, 2))[m]
        # plank seams across the direction of travel, rails along it
        seam = m & ((((yy if vertical else xx) // 10) % 1 == 0) & (((yy if vertical else xx) % 10) == 0))
        canvas[seam] = canvas[seam] * 0.55
        rail = m & ~((np.abs(xx - cx * APC) < hw - 6) if vertical else (np.abs(yy - cy * APC) < hl - 6))
        canvas[rail] = (96, 66, 36)
        rail_hi = rail & ((np.abs(xx - cx * APC) > hw - 2) if vertical else (np.abs(yy - cy * APC) > hl - 2))
        canvas[rail_hi] = (150, 108, 62)
        cls[m] = C_LANE
        block[m & ~rail] = False
        block[rail] = True
    return canvas, cls, block, shadow
