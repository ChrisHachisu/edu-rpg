#!/usr/bin/env python3
"""Compose an Acts 2-5 town plate in ACT 1 COLOUR SPACE from a layout + the extracted kit.

Order (the Act 1 compose_town.py rule: streets first, buildings onto street frontages, dressing
along edges, never in the middle of a lane):
  1. ground: quilted lawn everywhere, quilted cobble where the lane network is
  2. border: rock cliff / forest / wall outside the town ring, cut open at the exit
  3. water bodies (pond / ice / lava), with a stone rim
  4. kit pieces, painter-sorted by their base line (feet), each with its own ground shadow
  5. class map + collision mask, consumed by grade.py and walkable.py

Everything is in art px of the 1950 plate. A layout gives positions in CELLS (30 art px).
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

import ground
from kitlib import APC, PLATE, SCRATCH, value_noise, read_json

KIT = os.path.join(SCRATCH, "kit")
C_FIELD, C_LANE, C_OBJ, C_ROOF, C_TREE, C_WATER, C_ROCK, C_BORDER, C_STONE, C_VOID, C_WALL = range(11)


_kit_cache = {}


def kit(name):
    if name not in _kit_cache:
        rgba = np.asarray(Image.open(os.path.join(KIT, f"{name}.png"))).astype(np.float32)
        sh = np.asarray(Image.open(os.path.join(KIT, f"{name}-shadow.png"))).astype(np.float32) / 255
        rf = os.path.join(KIT, f"{name}-roof.png")
        roof = (np.asarray(Image.open(rf)) > 127) if os.path.exists(rf) else np.zeros(rgba.shape[:2], bool)
        gf = os.path.join(KIT, f"{name}-ground.png")
        gnd = (np.asarray(Image.open(gf)) > 127) if os.path.exists(gf) else np.zeros(rgba.shape[:2], bool)
        roof = np.dstack([roof, gnd])
        meta = read_json(os.path.join(KIT, "kit-meta.json"))[name]
        band = meta.get("band")
        if band:
            xs = [p[0] for p in band]
            ys = [p[1] for p in band]
            anchor = ((min(xs) + max(xs)) / 2, max(ys))
        else:
            a = rgba[..., 3] > 127
            yy, xx = np.nonzero(a)
            anchor = (xx.mean(), yy.max())
        _kit_cache[name] = (rgba, sh, roof, anchor, meta)
    return _kit_cache[name]


def flipped(name):
    rgba, sh, roof, anchor, meta = kit(name)
    w = rgba.shape[1]
    return rgba[:, ::-1], sh[:, ::-1], roof[:, ::-1], (w - anchor[0], anchor[1]), meta


def lane_mask(layout, seed):
    im = Image.new("L", (PLATE, PLATE), 0)
    d = ImageDraw.Draw(im)
    for ln in layout.get("lanes", []):
        pts = [(x * APC, y * APC) for x, y in ln["pts"]]
        w = ln["w"] * APC
        # smooth the polyline with Chaikin so lanes curve instead of kinking
        for _ in range(3):
            if len(pts) < 3:
                break
            q = [pts[0]]
            for a, b in zip(pts[:-1], pts[1:]):
                q += [(0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]),
                      (0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1])]
            q.append(pts[-1])
            pts = q
        d.line(pts, fill=255, width=int(w))
        for p in pts:
            d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=255)
    for pl in layout.get("plazas", []):
        if "poly" in pl:
            d.polygon([(x * APC, y * APC) for x, y in pl["poly"]], fill=255)
            continue
        cx, cy = pl["c"]
        rx, ry = pl.get("rx", pl.get("r")), pl.get("ry", pl.get("r"))
        d.ellipse([(cx - rx) * APC, (cy - ry) * APC, (cx + rx) * APC, (cy + ry) * APC], fill=255)
    m = np.asarray(im) > 127
    dist = ndi.distance_transform_edt(m) - ndi.distance_transform_edt(~m)
    n = (value_noise(PLATE, PLATE, 12, seed) - 0.5) * 2
    n2 = (value_noise(PLATE, PLATE, 40, seed + 7) - 0.5) * 2
    return (dist + n * 9 + n2 * 10) > 0, dist + n * 9 + n2 * 10, n


def ring_polygon(layout):
    """Town ring in art px: layout 'ring' = {c, rx, ry, wobble} or 'ringPoly' cells."""
    if "ringPoly" in layout:
        return [(x * APC, y * APC) for x, y in layout["ringPoly"] if y < 65.5]
    r = layout.get("ring", {"c": [32.5, 31], "rx": 30, "ry": 28.5})
    cx, cy = r["c"]
    rng = np.random.default_rng(layout.get("seed", 1))
    ph = rng.random(3) * 6.28
    pts = []
    for k in range(180):
        t = k / 180 * 2 * math.pi
        wob = 1 + r.get("wobble", 0.035) * (math.sin(3 * t + ph[0]) + 0.6 * math.sin(5 * t + ph[1])
                                           + 0.4 * math.sin(9 * t + ph[2]))
        pts.append(((cx + r["rx"] * wob * math.cos(t)) * APC, (cy + r["ry"] * wob * math.sin(t)) * APC))
    return pts


def poly_raster(pts, fill=255):
    im = Image.new("L", (PLATE, PLATE), 0)
    ImageDraw.Draw(im).polygon(pts, fill=fill)
    return np.asarray(im) > 127


def water_tile():
    p = os.path.join(os.path.dirname(KIT), "..", "..", "..")
    from kitlib import ACT1_DESIGN
    t = np.asarray(Image.open(os.path.join(ACT1_DESIGN, "ground/ground-water.png")).convert("RGB")).astype(np.float32)
    reps = PLATE // t.shape[0] + 1
    rows = []
    for j in range(reps):
        row = [t if (i + j) % 2 == 0 else t[:, ::-1] for i in range(reps)]
        rows.append(np.concatenate(row, 1))
    return np.concatenate(rows, 0)[:PLATE, :PLATE]


def place(canvas, cls, block, shadow_acc, name, cx, by, flip=False, cls_id=C_OBJ, block_mode="full",
          order_mask=None):
    rgba, sh, roof, anchor, meta = flipped(name) if flip else kit(name)
    h, w = rgba.shape[:2]
    x0 = int(round(cx * APC - anchor[0]))
    y0 = int(round(by * APC - anchor[1]))
    # clip
    sx0, sy0 = max(0, -x0), max(0, -y0)
    sx1, sy1 = min(w, PLATE - x0), min(h, PLATE - y0)
    if sx1 <= sx0 or sy1 <= sy0:
        return None
    A = rgba[sy0:sy1, sx0:sx1, 3:4] / 255.0
    if cls_id == C_OBJ and roof.ndim == 3:
        # painted Act 1 ground inside the cut-out gives way to THIS town's ground
        A = A * (1 - ndi.binary_dilation(roof[sy0:sy1, sx0:sx1, 1], iterations=1)[..., None])
    dst = canvas[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1]
    dst[:] = dst * (1 - A) + rgba[sy0:sy1, sx0:sx1, :3] * A
    a = A[..., 0] > 0.5
    c = cls[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1]
    c[a] = cls_id
    if cls_id == C_OBJ:
        c[a & roof[sy0:sy1, sx0:sx1, 0]] = C_ROOF

    # the cut-out's own painted shadow, plus a short synthetic cast to the lower right
    s = shadow_acc[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1]
    s[:] = np.maximum(s, sh[sy0:sy1, sx0:sx1])
    # collision footprint
    full = np.zeros((h, w), bool)
    al = rgba[..., 3] > 127
    if roof.ndim == 3 and cls_id == C_OBJ:
        al = al & ~roof[..., 1]
    if block_mode == "full":
        m = ndi.binary_fill_holes(ndi.binary_closing(al, iterations=8))
        m = ndi.binary_erosion(m, iterations=3)
    elif block_mode == "base":       # trees, rocks: block the lower part only (feet-only rule)
        ys = np.nonzero(al.any(1))[0]
        cut = int(ys.min() + 0.55 * (ys.max() - ys.min()))
        m = al.copy()
        m[:cut] = False
        m = ndi.binary_fill_holes(ndi.binary_closing(m, iterations=4))
    else:
        m = np.zeros_like(al)
    full |= m
    b = block[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1]
    b |= full[sy0:sy1, sx0:sx1]
    return (x0, y0, w, h)


def footprint(name, cx, by, flip=False, pad=0):
    rgba, sh, roof, anchor, meta = flipped(name) if flip else kit(name)
    h, w = rgba.shape[:2]
    x0 = int(round(cx * APC - anchor[0]))
    y0 = int(round(by * APC - anchor[1]))
    m = np.zeros((PLATE, PLATE), bool)
    al = rgba[..., 3] > 127
    if pad:
        al = ndi.binary_dilation(al, iterations=pad)
    sx0, sy0 = max(0, -x0), max(0, -y0)
    sx1, sy1 = min(w, PLATE - x0), min(h, PLATE - y0)
    if sx1 > sx0 and sy1 > sy0:
        m[y0 + sy0:y0 + sy1, x0 + sx0:x0 + sx1] = al[sy0:sy1, sx0:sx1]
    return m


DRESS = {
    "snow": ["bush-a", "bush-b", "rock-s", "rock-s2", "tree-a", "bush-a"],
    "haunted": ["tree-a", "tree-b", "bush-b", "rock-s", "rock-s2", "tree-a"],
    "desert": ["rock-s", "rock-s2", "bush-a", "rock-s", "bush-b", "rocks"],
    "ash": ["rock-s", "rock-s2", "rock-s", "bush-b", "rock-s2"],
    "barren": ["rock-s", "rock-s2", "bush-b", "tree-b", "rock-s"],
}


def dressing(layout, lanes, inside_d, occupied, avoid_cells):
    """Edge dressing: bushes/rocks tucked against buildings and the town edge, never on a lane,
    never on an NPC/service cell (BRIEF-v4: 'clutter belongs against walls and in corners')."""
    rng = np.random.default_rng(layout.get("seed", 1) + 101)
    kinds = layout.get("dressKinds", DRESS[layout["biome"]])
    n_target = layout.get("dress", 18)
    lane_far = ndi.distance_transform_edt(~lanes)
    occ_d = ndi.distance_transform_edt(~occupied)
    out = []
    tries = 0
    taken = occupied.copy()
    while len(out) < n_target and tries < 4000:
        tries += 1
        x, y = rng.uniform(60, PLATE - 60), rng.uniform(60, PLATE - 60)
        xi, yi = int(x), int(y)
        if inside_d[yi, xi] < 40 or lane_far[yi, xi] < 55 or taken[yi, xi]:
            continue
        near_wall = occ_d[yi, xi] < 70 or inside_d[yi, xi] < 160
        if not near_wall:
            continue
        if any(abs(x / APC - ax) < 3.2 and abs(y / APC - ay) < 3.2 for ax, ay in avoid_cells):
            continue
        name = kinds[rng.integers(0, len(kinds))]
        fp = footprint(name, x / APC, y / APC, pad=6)
        if (fp & taken).any() or (fp & lanes).sum() > 30:
            continue
        taken |= fp
        out.append({"kit": name, "at": [x / APC, y / APC], "flip": bool(rng.random() < 0.5)})
    return out


def cast_shadow(cls, shadow_acc, strength=0.33):
    obj = np.isin(cls, (C_OBJ, C_ROOF, C_TREE, C_ROCK, C_STONE))
    sh = np.zeros_like(shadow_acc)
    sh[10:, 12:] = obj[:-10, :-12]
    sh = ndi.gaussian_filter(sh.astype(np.float32), 4) * strength
    return np.maximum(shadow_acc, sh) * (~obj)


def _seawall():
    from kitlib import ACT1_DESIGN
    sw = np.asarray(Image.open(os.path.join(ACT1_DESIGN, "ground/ground-seawall.png")).convert("RGB")).astype(np.float32)
    return sw[4:84]          # the dressed-stone wall face, above the waterline


def _bands_below(top, depth):
    """For each pixel within `depth` px BELOW the mask `top`, how far below it is (1..depth)."""
    rowk = np.zeros(top.shape, np.int16)
    cur = top.copy()
    for k in range(1, depth + 1):
        nxt = np.zeros_like(cur)
        nxt[1:] = cur[:-1]
        new = nxt & ~top & (rowk == 0)
        rowk[new] = k
        cur = nxt
    return rowk


def fort_wall(canvas, cls, block, shadow, rd, mouth, layout):
    """Last Bastion: a dressed-stone curtain wall on the ring.

    Read from outside in: an outer parapet of dressed blocks (Port Sapphire sea-wall stone), the
    wall-walk (Act 1 cobble, darkened), a row of merlons on the inner edge, and -- where the wall
    faces the viewer, i.e. the north arc -- its inner face hanging below the walk. Two square gate
    towers flank the mouth."""
    cob = ground.get("cobble")
    face_t = _seawall()
    th, tw = face_t.shape[:2]
    yy, xx = np.mgrid[0:PLATE, 0:PLATE]
    wall = (rd > -60) & (rd < 8) & ~mouth
    parapet = wall & (rd > -8)
    walk = wall & (rd <= -8) & (rd > -48)
    merlon_band = wall & (rd <= -48)
    ang = np.arctan2(yy - PLATE / 2, xx - PLATE / 2)
    merlon = merlon_band & ((np.floor(ang * 1950 / (2 * np.pi) / 7) % 2) == 0)
    crenel = merlon_band & ~merlon
    canvas[walk] = cob[walk] * 0.74 + 8
    canvas[crenel] = cob[crenel] * 0.5
    blk = face_t[(yy // 1) % th, (xx // 1) % tw]
    canvas[parapet] = blk[parapet] * 0.9
    canvas[merlon] = blk[merlon] * 1.05
    # inner face below the merlons where the wall faces south (north arc)
    top = wall
    face_depth = 54
    rowk = _bands_below(top, face_depth)
    face = (rowk > 0) & (rd < -40) & (yy < PLATE * 0.62)
    fy = (rowk * (th - 1) // face_depth).clip(0, th - 1)
    fc = face_t[fy, xx % tw]
    shade = (0.95 - 0.35 * (rowk / face_depth))[..., None]
    canvas[face] = (fc * shade)[face]
    cls[wall | face] = C_WALL
    block |= wall | face
    # gate towers
    ex = layout.get("exit", [34.5, 65])[0] * APC
    gap = layout.get("exitGap", 3.2) * APC
    for sgn in (-1, 1):
        cx = ex + sgn * (gap + 2.4 * APC)
        x0, x1 = int(cx - 2.4 * APC), int(cx + 2.4 * APC)
        ytop = int(PLATE - 6.2 * APC)
        tower_top = (xx >= x0) & (xx < x1) & (yy >= ytop) & (yy < ytop + int(3.2 * APC))
        tower_face = (xx >= x0) & (xx < x1) & (yy >= ytop + int(3.2 * APC)) & (yy < PLATE)
        canvas[tower_top] = cob[tower_top] * 0.8 + 10
        ring = tower_top & ~ndi.binary_erosion(tower_top, iterations=10)
        canvas[ring] = blk[ring]
        k = ((yy - ytop - 3.2 * APC) / (3 * APC)).clip(0, 1)
        canvas[tower_face] = (face_t[((yy * 1) % th), xx % tw] * (0.95 - 0.3 * k)[..., None])[tower_face]
        cls[tower_top | tower_face] = C_WALL
        block |= tower_top | tower_face
    lip = ndi.gaussian_filter((wall | face).astype(np.float32), 6)
    shadow = np.maximum(shadow, lip * 0.45 * ~(wall | face))
    return canvas, cls, block, shadow


def void_edge(canvas, cls, block, shadow, rd, layout, seed):
    """Haven's Edge: beyond the north rim the world simply ends -- a starlit void."""
    cy = layout.get("ring", {"c": [34, 33]})["c"][1] * APC + layout.get("voidShift", 4) * APC
    yy, xx = np.mgrid[0:PLATE, 0:PLATE]
    nb = (value_noise(PLATE, PLATE, 26, seed + 17) - 0.5) * 2
    out = (rd + nb * 18 < -2) & (yy < cy + nb * 70 + 60 * np.sin(xx / 210.0))
    t = np.clip(yy / cy, 0, 1)[..., None]
    void = np.array([10, 8, 22], np.float32) * (1 - t) + np.array([34, 22, 52], np.float32) * t
    rng = np.random.default_rng(seed)
    stars = (rng.random((PLATE, PLATE)) > 0.9985)
    stars = ndi.binary_dilation(stars, iterations=1) & out
    canvas[out] = void[out]
    canvas[stars] = (190, 180, 230)
    cls[out] = C_VOID
    # crumbling lip: cliff rock in a thin band on the inner side of the drop
    cliff = ground.get("cliff")
    lip = (~out) & ndi.binary_dilation(out, iterations=22) & (yy < cy + 40)
    canvas[lip] = cliff[lip] * 0.85
    cls[lip] = C_BORDER
    block |= out | lip
    glow = ndi.gaussian_filter(out.astype(np.float32), 40) * ~out
    shadow = np.maximum(shadow, glow * 0.25)
    return canvas, cls, block, shadow


def void_poly(canvas, cls, block, shadow, layout, seed):
    """Haven's Edge: past the drop the world ends -- starlit void, a crumbling rock lip, and a
    sheer cliff face hanging below the lip where it faces the viewer."""
    yy, xx = np.mgrid[0:PLATE, 0:PLATE]
    nb = (value_noise(PLATE, PLATE, 14, seed + 17) - 0.5) * 2
    m = poly_raster([(x * APC, y * APC) for x, y in layout["voidPoly"]])
    d = ndi.distance_transform_edt(~m) - ndi.distance_transform_edt(m)
    out = (d + nb * 14) < 0
    t = np.clip(yy / PLATE, 0, 1)[..., None]
    void = np.array([8, 6, 20], np.float32) * (1 - t) + np.array([40, 26, 60], np.float32) * t
    rng = np.random.default_rng(seed)
    st = rng.random((PLATE, PLATE))
    stars = (st > 0.9988) & out
    big = ndi.binary_dilation((st > 0.99985) & out, iterations=1)
    # the void is not flat: drifting cloud strata in 4 posterised bands on the 2-px grain, with a
    # Bayer dither at each band edge (the way DQ paints a night sky), stars, and a few floating
    # rock islets broken off the cliff
    H = PLATE // 2
    cn = value_noise(H, H, 24, seed + 31, octaves=3)
    yh = np.arange(H)[:, None] / H
    cn = np.clip(cn * 0.8 + 0.25 * np.sin(yh * 26 + cn * 5) * 0.5 + 0.1, 0, 1)
    bayer = (np.array([[0, 2], [3, 1]], np.float32) + 0.5) / 4
    bt = np.tile(bayer, (H // 2 + 1, H // 2 + 1))[:H, :H]
    lvl = np.clip(np.floor(cn * 5 + (bt - 0.5) * 1.8), 0, 4).astype(int)
    pal = np.array([[8, 6, 22], [22, 16, 44], [40, 28, 70], [66, 46, 100], [104, 78, 140]], np.float32)
    sky = pal[lvl]
    sky = np.repeat(np.repeat(sky, 2, 0), 2, 1)
    vv = np.zeros_like(canvas); vv[:2 * H, :2 * H] = sky
    vv = vv * (0.75 + 0.45 * t)
    canvas[out] = vv[out]
    stars = (st > 0.995) & out
    canvas[stars] = (190, 180, 230)
    canvas[big] = (236, 230, 255)
    cross = ndi.binary_dilation((st > 0.99993) & out, structure=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]]), iterations=3)
    canvas[cross] = (220, 214, 255)
    # islets
    ys_, xs_ = np.nonzero(ndi.distance_transform_edt(out) > 140)
    for k in range(int(layout.get("islets", 5))):
        if not len(xs_):
            break
        i = rng.integers(0, len(xs_))
        cx_, cy_ = xs_[i], ys_[i]
        rx, ry = rng.integers(26, 60), rng.integers(12, 22)
        top_ = ((xx - cx_) / rx) ** 2 + ((yy - cy_) / ry) ** 2 + nb * 0.25 < 1
        under = ((xx - cx_) / (rx * 0.8)) ** 2 + ((yy - cy_ - ry) / (ry * 2.6)) ** 2 + nb * 0.3 < 1
        under &= (yy > cy_) & ~top_
        cl = ground.get("cliff")
        g_ = cl.mean(axis=2, keepdims=True) * np.array([0.92, 0.9, 1.0], np.float32)
        canvas[under] = (g_ * 0.5)[under]
        canvas[top_] = (g_ * 0.95)[top_]
        ih = top_ & ~np.roll(top_, 3, axis=0)
        canvas[ih] = np.minimum(canvas[ih] * 1.35 + 16, 255)
        ring_ = ndi.binary_dilation(top_ | under, iterations=2) & ~(top_ | under)
        canvas[ring_] = (6, 4, 14)
    cls[out] = C_VOID
    cliff = ground.get("cliff")
    # the drop: a rock face hangs BELOW the lip where the void is south of solid ground ... and
    # where solid ground is south of the void, the lip is just a crumbling edge
    solid = ~out
    face_rows = _bands_below(solid, 48) * out
    face = (face_rows > 0)
    canvas[face] = (cliff[face] * (0.85 - 0.6 * (face_rows[face] / 48))[..., None])
    cls[face] = C_BORDER
    lip = solid & ndi.binary_dilation(out, iterations=10)
    canvas[lip] = cliff[lip] * 0.95
    cls[lip] = C_BORDER
    hi = lip & ~ndi.binary_dilation(out, iterations=7)
    canvas[hi] = np.minimum(canvas[hi] * 1.3 + 12, 255)
    block |= out | lip | face
    glow = ndi.gaussian_filter(out.astype(np.float32), 30) * solid
    shadow = np.maximum(shadow, glow * 0.3)
    return canvas, cls, block, shadow


def dig_pit(canvas, cls, block, shadow, pit, seed):
    """Ruins Camp: an excavation pit -- sunk floor, the far (north) wall shown as rock face."""
    cx, cy = pit["c"]
    yy, xx = np.mgrid[0:PLATE, 0:PLATE]
    nb = (value_noise(PLATE, PLATE, 14, seed + 23) - 0.5) * 2
    m = (((xx / APC - cx) / pit["rx"]) ** 2 + ((yy / APC - cy) / pit["ry"]) ** 2 + nb * 0.08) < 1
    rowk = _bands_below(~m, 40)
    face = m & (rowk > 0) & (yy < cy * APC)
    cliff = ground.get("cliff")
    canvas[m] = canvas[m] * 0.6
    canvas[face] = cliff[face] * (0.95 - 0.3 * (rowk[face] / 40))[..., None]
    cls[face] = C_ROCK
    block |= m
    rim = ndi.binary_dilation(m, iterations=6) & ~m
    shadow = np.maximum(shadow, rim * 0.3)
    inner = m & ~face
    shadow = np.maximum(shadow, inner * 0.18)
    return canvas, cls, block, shadow


def compose(layout):
    seed = layout.get("seed", 1)
    lawn = ground.get("lawn")
    cob = ground.get("cobble")
    canvas = lawn.copy()
    cls = np.full((PLATE, PLATE), C_FIELD, np.uint8)
    block = np.zeros((PLATE, PLATE), bool)
    shadow = np.zeros((PLATE, PLATE), np.float32)

    # door aprons: every building gets a short paved path from its front to the street
    layout = dict(layout)
    layout["lanes"] = list(layout.get("lanes", [])) + [
        {"pts": [[b["at"][0] + b.get("door", 0), b["at"][1] - 0.5],
                 [b["at"][0] + b.get("door", 0), b["at"][1] + 2.4]], "w": b.get("apron", 3.0)}
        for b in layout.get("buildings", [])]
    lanes, dist, n = lane_mask(layout, seed)
    canvas[lanes] = cob[lanes]
    cls[lanes] = C_LANE
    # grass tufts between the outermost stones, loose stones just outside (compose_town_ground.py)
    rim = lanes & (dist < 8) & (n > 0.2)
    canvas[rim] = lawn[rim]
    cls[rim] = C_FIELD
    stray = (~lanes) & (dist > -14) & (n < -0.5)
    canvas[stray] = cob[stray]

    # ---- border outside the ring -----------------------------------------------------------
    ring = ring_polygon(layout)
    inside = poly_raster(ring)
    rd = ndi.distance_transform_edt(inside) - ndi.distance_transform_edt(~inside)
    nb = (value_noise(PLATE, PLATE, 18, seed + 3) - 0.5) * 2
    border = (rd + nb * 16) < 0
    exit_x = layout.get("exit", [34.5, 65])[0] * APC
    gap = layout.get("exitGap", 3.2) * APC
    yy, xx = np.mgrid[0:PLATE, 0:PLATE]
    mouth = (np.abs(xx - exit_x) < gap + nb * 10) & (yy > PLATE * 0.55)
    border &= ~mouth
    kind = layout.get("border", "cliff")
    if kind in ("cliff", "wall"):
        cliff = ground.get("cliff")
        canvas[border] = cliff[border]
        cls[border] = C_BORDER
        block |= border
        # inner lip shadow so the rock face reads as standing up
        lip = ndi.gaussian_filter(border.astype(np.float32), 6)
        shadow = np.maximum(shadow, lip * 0.35 * (~border))
    elif kind == "forest":
        block |= border
    if layout.get("voidPoly"):
        canvas, cls, block, shadow = void_poly(canvas, cls, block, shadow, layout, seed)
    for pit in layout.get("dig", []):
        canvas, cls, block, shadow = dig_pit(canvas, cls, block, shadow, pit, seed)
    # trees ALONG the outside of the ring (and densely in forest mode)
    rng = np.random.default_rng(seed + 11)
    trees = []
    dens = layout.get("treeDensity", 0.0 if kind != "forest" else 1.0)
    if kind == "forest":
        cand = [(gx + rng.uniform(-22, 22), gy + rng.uniform(-14, 14))
                for gy in np.arange(-30, PLATE + 90, 58) for gx in np.arange(-40 + (gy % 116) / 2, PLATE + 60, 74)]
        # forest floor under the canopy is in deep shade
        shadow = np.maximum(shadow, ndi.gaussian_filter(border.astype(np.float32), 10) * 0.5)
    else:
        cand = [(rng.uniform(-60, PLATE + 60), rng.uniform(-40, PLATE + 80)) for _ in range(int(260 * dens))]
    bfp = np.zeros((PLATE, PLATE), bool)
    for b in layout.get("buildings", []):
        bfp |= footprint(b["kit"], b["at"][0], b["at"][1], b.get("flip", False), pad=10)
    if dens > 0 or kind == "forest":
        tk = layout.get("borderTrees", ["tree-a", "tree-b"])
        for (x, y) in cand:
            name = tk[int(x / APC * 7 + y / APC * 13) % len(tk)]
            if (footprint(name, x / APC, y / APC) & bfp).any():
                continue
            xi, yi = int(np.clip(x, 0, PLATE - 1)), int(np.clip(y, 0, PLATE - 1))
            if inside[yi, xi] and rd[yi, xi] > -10:
                continue
            if cls[yi, xi] == C_VOID:
                continue
            if abs(x - exit_x) < gap + 40 and y > PLATE * 0.55:
                continue
            trees.append((x / APC, y / APC, rng.random() < 0.5))
    tree_kinds = layout.get("borderTrees", ["tree-a", "tree-b"])

    # ---- built features from Act 1 textures (features.py) -----------------------------------
    import features
    canvas, cls, block, shadow = features.terraces(canvas, cls, block, shadow, layout, C_WALL, C_LANE)
    canvas, cls, block, shadow = features.liquids(canvas, cls, block, shadow, layout, C_WATER, C_ROCK, seed)
    canvas, cls, block, shadow = features.bridges(canvas, cls, block, shadow, layout, C_LANE)
    canvas, cls, block, shadow = features.walls(canvas, cls, block, shadow, layout, C_WALL)
    for p in layout.get("props", []):
        if p["kit"].startswith(("brazier", "lamp")):
            layout.setdefault("_lights", []).append([p["at"][0], p["at"][1] - (1.4 if p["kit"].startswith("brazier") else 2.6),
                                                     1.6 if p["kit"].startswith("brazier") else 1.2])

    # ---- pieces, painter's order by base line -------------------------------------------------
    occupied = np.zeros((PLATE, PLATE), bool)
    for b in layout.get("buildings", []):
        occupied |= footprint(b["kit"], b["at"][0], b["at"][1], b.get("flip", False), pad=4)
    for p in layout.get("props", []):
        occupied |= footprint(p["kit"], p["at"][0], p["at"][1], p.get("flip", False), pad=4)
    occupied |= (cls == C_WATER) | (cls == C_STONE) | block
    avoid = layout.get("_avoid", [])
    extra = dressing(layout, lanes, rd, occupied, avoid) if layout.get("dress", 18) else []
    items = []
    for p in extra:
        items.append((p["at"][1], "p", p))
    for b in layout.get("buildings", []):
        items.append((b["at"][1], "b", b))
    for p in layout.get("props", []):
        items.append((p["at"][1], "p", p))
    for (x, y, f) in trees:
        items.append((y, "t", {"kit": tree_kinds[int(x * 7 + y * 13) % len(tree_kinds)], "at": [x, y], "flip": f}))
    items.sort(key=lambda t: t[0])
    placed = []
    for _, kind_, it in items:
        name = it["kit"]
        if kind_ == "b":
            box = place(canvas, cls, block, shadow, name, it["at"][0], it["at"][1], it.get("flip", False))
            placed.append({"kit": name, "at": it["at"], "box": box, "role": it.get("role")})
        else:
            cid = (C_TREE if name.startswith(("tree", "bush", "palm", "pine")) else
                   C_ROCK if name.startswith(("rock", "grave", "column", "anvil")) else
                   C_OBJ if name.startswith(("fence", "tent", "deadtree", "brazier", "lamp", "cart", "crate")) else C_STONE)
            mode = "base" if cid in (C_TREE, C_ROCK) else "full"
            if name.startswith(("bush", "grave", "column", "tent", "brazier", "anvil", "cart", "crate")):
                mode = "full"
            if name.startswith(("deadtree", "lamp")):
                mode = "base"
            if kind_ == "t":
                mode = "none" if not inside[min(PLATE - 1, max(0, int(it["at"][1] * APC))),
                                            min(PLATE - 1, max(0, int(it["at"][0] * APC)))] else "base"
            place(canvas, cls, block, shadow, name, it["at"][0], it["at"][1], it.get("flip", False),
                  cls_id=cid, block_mode=mode)
    shadow = cast_shadow(cls, shadow)
    # emissive: fire / lantern glass of light props, lit tower windows -- grade.py keeps them as is
    zone = np.zeros((PLATE, PLATE), bool)
    for p in layout.get("props", []):
        if p["kit"].startswith(("brazier", "lamp")):
            zone |= footprint(p["kit"], p["at"][0], p["at"][1], p.get("flip", False))
    r_, g_, b_ = canvas[..., 0], canvas[..., 1], canvas[..., 2]
    warm = (r_ > 200) & (g_ > 80) & (b_ < g_)
    emissive = (zone & warm) | ((np.abs(r_ - 250) < 2) & (np.abs(g_ - 210) < 2) & (np.abs(b_ - 120) < 2))
    return {"emissive": emissive, "rgb": canvas, "cls": cls, "block": block, "shadow": shadow, "inside": inside,
            "ring": ring, "lanes": lanes, "placed": placed, "border": border,
            "lights": layout.get("_lights", [])}
