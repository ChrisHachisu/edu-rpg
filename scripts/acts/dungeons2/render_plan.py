#!/usr/bin/env python3
"""Paint one authored Acts 2-5 floor plan (qok-floorplan-v1) in the Act 1 dungeon style.

  render_plan.py emberMines-f1 [more floors...] [--crop x0,y0,x1,y1] [--out DIR] [--q 85]

The wall/floor picture is Act 1's: `render_dungeon_material_map.py` is imported and its own
functions build the organic boundary field (`floor_field`: blur + warp + neck/speck/shadow passes),
sample the materials (`sample_patched`, `grade`, `temper`) and seat props (`paste_props`). The
body of `paint()` follows that module's `render()` step for step (lighting, cel steps, face band,
cast shadow, rubble base, outline, grain). What is new, because Act 1 has none of it:

  * terrain beyond rock/floor, per `d2common.DUNGEONS[...]['hazards']`: lava pools, chasms, pillars.
    Each gets its own organic edge on the plan grid, and THE COLLISION MASK IS CUT FROM THE SAME
    FIELDS (one boundary, two consumers: the picture and `-walk.png`).
  * a mouth on any side of the map: the corridor runs off the picture's edge into daylight.
  * live props: chests, crystals and the boss are runtime sprites (they change state), so only
    their contact shadows are baked. Stairs never change and are baked with Act 1's own sprites.
  * an OVER layer: the part of a pillar that stands above its base cell, as a small atlas the
    runtime depth-sorts against the hero (she walks behind a pillar, never under the floor).

Outputs in <out>:  <floor>-material.webp  <floor>-walk.png  <floor>-over.webp (if any)  <floor>.art.json
"""
import argparse, json, os, resource, sys, time
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage
import d2common as C
import render_dungeon_material_map as R


def _h32(ix, iy, seed):
    """Bit-identical to R._h, ~2.5x faster (see scripts/acts/dungeons/render_floors.py in the
    prototype branch: array_equal on 9 M coords incl. negatives)."""
    u = np.uint32
    h = (ix.astype(u) * u(374761393) + iy.astype(u) * u(668265263)
         + u((int(seed) * 1442695041) & 0xFFFFFFFF)) & u(0x7FFFFFFF)
    h = ((h ^ (h >> u(13))) * u(1274126177)) & u(0x7FFFFFFF)
    return ((h ^ (h >> u(16))) & u(0xFFFFFF)).astype(np.float32) / float(0xFFFFFF)


def _vnoise_table(wx, wy, scale, seed):
    """R.vnoise with the four corner hashes read from one small table of the lattice points the
    floor touches, instead of hashing every pixel four times. Same numbers bit for bit (the hash
    is a function of the integer lattice point only); about half of a floor's render time."""
    fx, fy = wx / scale, wy / scale
    ix, iy = np.floor(fx).astype(np.int64), np.floor(fy).astype(np.int64)
    rx, ry = (fx - ix).astype(np.float32), (fy - iy).astype(np.float32)
    del fx, fy
    sx, sy = rx * rx * (3 - 2 * rx), ry * ry * (3 - 2 * ry)
    del rx, ry
    x0, y0 = int(ix.min()), int(iy.min())
    nx, ny = int(ix.max()) - x0 + 2, int(iy.max()) - y0 + 2
    if nx * ny > max(4096, ix.size // 3):                         # lattice as fine as the pixels: no gain
        a, b = _h32(ix, iy, seed), _h32(ix + 1, iy, seed)
        c, d = _h32(ix, iy + 1, seed), _h32(ix + 1, iy + 1, seed)
    else:
        gy, gx = np.mgrid[y0:y0 + ny, x0:x0 + nx]
        T = _h32(gx, gy, seed).ravel()
        j = ((iy - y0) * nx + (ix - x0)).astype(np.intp)
        a, b, c, d = T[j], T[j + 1], T[j + nx], T[j + nx + 1]
        del j
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy


BIG_BLUR = 48.0        # master px: from here a blur is a lighting field, not a boundary


def _fast_blur(a, sigma):
    """R.blur's separable kernel and edge padding in scipy's C loop (float diff <= 1.5e-6).
    A WIDE blur (sigma >= BIG_BLUR; only lighting uses those: depth, light pools, deep rock,
    glow) is taken on a 4x or 8x area-reduced copy and brought back bilinearly: the result is
    band-limited far below that sampling, the difference is under 0.004 of the field's range, and
    the kernel is 4-8x shorter on 16-64x fewer pixels. Every blur that decides WHERE a wall or a
    hazard edge is (sigma under a cell) still runs exactly."""
    if sigma <= 0:
        return a.astype(np.float32)
    if sigma >= BIG_BLUR and min(a.shape) >= 256 and os.environ.get("D2_EXACT_BLUR") != "1":
        k = 8 if sigma >= 160 else 4
        H, W = a.shape
        ph, pw = (-H) % k, (-W) % k
        ap = np.pad(a.astype(np.float32), ((0, ph), (0, pw)), mode="edge")
        sm = ap.reshape((H + ph) // k, k, (W + pw) // k, k).mean(axis=(1, 3), dtype=np.float32)
        del ap
        sb = _fast_blur_exact(sm, sigma / k)
        up = Image.fromarray(sb, "F").resize((W + pw, H + ph), Image.Resampling.BILINEAR)
        return np.asarray(up)[:H, :W].copy()
    return _fast_blur_exact(a, sigma)


def _fast_blur_exact(a, sigma):
    r = int(np.ceil(3.0 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2).astype(np.float32)
    k /= k.sum()
    cur = ndimage.correlate1d(a.astype(np.float32), k, axis=1, mode="nearest")
    return ndimage.correlate1d(cur, k, axis=0, mode="nearest")


class _FastNd:
    """scipy.ndimage for the Act 1 renderer, with its disc erosions / dilations / closings done by
    a Euclidean distance transform. Same result bit for bit (a pixel survives erosion by a disc of
    radius r exactly when its nearest background pixel is farther than r; scipy's border is
    background, hence the one-pixel pad), but O(N) instead of O(N r^2): on a floor this was 45% of
    the render time. Anything that is not a centred disc goes to scipy unchanged."""

    def __getattr__(self, name):
        return getattr(ndimage, name)

    @staticmethod
    def _disc(st):
        if st is None or getattr(st, "ndim", 0) != 2 or st.shape[0] != st.shape[1] or st.shape[0] % 2 == 0 or st.shape[0] < 7:
            return None
        r = st.shape[0] // 2
        gy, gx = np.mgrid[-r:r + 1, -r:r + 1]
        return r if np.array_equal(np.asarray(st, bool), gx * gx + gy * gy <= r * r) else None

    def binary_erosion(self, a, structure=None, *args, **kw):
        r = self._disc(structure)
        if r is None or args or kw:
            return ndimage.binary_erosion(a, structure, *args, **kw)
        d = ndimage.distance_transform_edt(np.pad(np.asarray(a, bool), 1))[1:-1, 1:-1]
        return d > r

    def binary_dilation(self, a, structure=None, *args, **kw):
        r = self._disc(structure)
        if r is None or args or kw:
            return ndimage.binary_dilation(a, structure, *args, **kw)
        a = np.asarray(a, bool)
        if not a.any():
            return a.copy()
        return ndimage.distance_transform_edt(~a) <= r

    def binary_closing(self, a, structure=None, *args, **kw):
        r = self._disc(structure)
        if r is None or args or kw:
            return ndimage.binary_closing(a, structure, *args, **kw)
        return self.binary_erosion(self.binary_dilation(a, structure), structure)


R._h = _h32
R.blur = _fast_blur
if os.environ.get("D2_SLOW_NOISE") != "1":
    R.vnoise = _vnoise_table
if os.environ.get("D2_SLOW_MORPH") != "1":
    R.ndimage = _FastNd()

KIND = {"stairsPrev": "stairsUp", "stairsNext": "stairsDown"}
POCKET = {"chest", "save", "boss", "sign", "stairsUp", "stairsDown"}      # get a prop pocket in the field
SHADOW = {"chest": (0.34, 0.86), "save": (0.26, 0.90), "sign": (0.34, 0.86), "boss": (0.80, 0.98)}
CAP_MB = 1.6
ATLAS_W = 2040


def norm_assets(plan):
    out = []
    for a in plan["assets"]:
        k = KIND.get(a["kind"], a["kind"])
        out.append(dict(a, kind=k))
    return out


def wall_rows(plan, cfg=None):
    """Rock vs everything else, with every mouth's corridor carried on to the map edge.
    `cfg['rock']` names plan characters that are painted as plain rock (a cracked wall is a wall
    until the mechanic module breaks it)."""
    rock = set("#") | set((cfg or {}).get("rock", ""))
    rows = [["#" if c in rock else "." for c in r] for r in plan["rows"]]
    for m in plan["assets"]:
        if m["kind"] != "mouth":
            continue
        cells, run, _ = C.mouth_cells(plan, m)
        for x, y in cells + run:
            rows[y][x] = "."
    return ["".join(r) for r in rows]


def organic(cells, cyi, cxi, xx, yy, px, seed, k=0.30, amp=0.40):
    up = cells.astype(np.float32)[cyi, cxi]
    f = R.blur(up, px * k)
    del up
    warp = (R.fbm(xx, yy, px * 2.2, seed) - 0.5) * 2.0
    gate = np.clip(4.0 * f * (1.0 - f), 0.0, 1.0)
    return np.clip(f + warp * amp * gate, 0.0, 1.0)


def hazard_cells(plan, chars, wrows):
    """Cells of this hazard, plus the rock cells touching them: the hazard then runs right up to
    the rock's own painted edge instead of leaving a sliver of floor between two warped lines."""
    H, W = plan["height"], plan["width"]
    hz = np.array([[c in chars for c in r] for r in plan["rows"]], bool)
    rock = np.array([[c == "#" for c in r] for r in wrows], bool)
    return hz | (rock & ndimage.binary_dilation(hz, np.ones((3, 3), bool)))


def void_fill(cfg, mats, xx, yy, px):
    """What is seen down a drop. dark: a cave chasm. sky: open air round a tower (soft cloud,
    which is also most of such a floor's area, so it must compress). tex: the sheet's accent."""
    style = cfg.get("void_style", "dark")
    if style == "sky":
        lo, hi = (np.array(c, np.float32) for c in cfg["sky"])
        c1 = np.clip((R.fbm(xx, yy, px * 6.0, 77) - 0.40) / 0.32, 0.0, 1.0)
        c2 = np.clip((R.fbm(xx, yy, px * 1.8, 78) - 0.48) / 0.40, 0.0, 1.0)
        t = np.clip(c1 * 0.75 + c1 * c2 * 0.45, 0.0, 1.0)
        return lo[None, None, :] + (hi - lo)[None, None, :] * t[..., None]
    if style == "tex":
        tex, _ = R.sample_patched(mats["accent"].astype(np.float32), xx, yy, px, 79, patch=7.0)
        return tex * float(cfg.get("void_gain", 0.8))
    void = np.array(cfg.get("void", (8, 7, 10)), np.float32)
    fog = (R.fbm(xx, yy, px * 3.0, 77) - 0.5) * 10.0
    return void[None, None, :] + fog[..., None]


SIDES = {"N": (0, -1), "S": (0, 1), "W": (-1, 0), "E": (1, 0)}
RAIL_OFF = 0.19        # rail centre line, cells from the track's centre line (told to the cart module)


def rail_routes(plan, chars):
    """Every piece of track as a polyline in cell units. Track runs through cell centres; a cell
    joined on two opposite sides is straight, on two adjacent sides a quarter circle about their
    shared corner, and a junction carries every pairing of its sides. Returns [(cell, pts)]."""
    rows, W, H = plan["rows"], plan["width"], plan["height"]
    on = lambda x, y: 0 <= x < W and 0 <= y < H and rows[y][x] in chars
    out = []
    for y in range(H):
        for x in range(W):
            if not on(x, y):
                continue
            con = [k for k, (dx, dy) in SIDES.items() if on(x + dx, y + dy)]
            if len(con) == 1:                                  # a dead end runs to the far edge (the buffer stop stands beyond it)
                con.append({"N": "S", "S": "N", "W": "E", "E": "W"}[con[0]])
            if not con:
                con = ["W", "E"]
            for i in range(len(con)):
                for j in range(i + 1, len(con)):
                    a, b = SIDES[con[i]], SIDES[con[j]]
                    pa = (x + 0.5 + a[0] * 0.5, y + 0.5 + a[1] * 0.5)
                    pb = (x + 0.5 + b[0] * 0.5, y + 0.5 + b[1] * 0.5)
                    if a[0] == -b[0] and a[1] == -b[1]:
                        pts = [(pa[0] + (pb[0] - pa[0]) * t / 8.0, pa[1] + (pb[1] - pa[1]) * t / 8.0) for t in range(9)]
                    else:
                        cx_, cy_ = x + 0.5 + (a[0] + b[0]) * 0.5, y + 0.5 + (a[1] + b[1]) * 0.5
                        a0 = np.arctan2(pa[1] - cy_, pa[0] - cx_); a1 = np.arctan2(pb[1] - cy_, pb[0] - cx_)
                        if a1 - a0 > np.pi: a1 -= 2 * np.pi
                        if a0 - a1 > np.pi: a1 += 2 * np.pi
                        pts = [(cx_ + 0.5 * np.cos(a0 + (a1 - a0) * t / 10.0), cy_ + 0.5 * np.sin(a0 + (a1 - a0) * t / 10.0)) for t in range(11)]
                    out.append(((x, y), pts))
    return out


def draw_rails(plan, cfg, px, W, H):
    """Rails as a master-size RGBA layer: (trestle timbers,) sleepers, then the two rails.
    Returns (rgba float array, trestle-cell mask at cell resolution) or None."""
    chars = set(cfg.get("rails", ""))
    routes = rail_routes(plan, chars) if chars else []
    if not routes:
        return None
    tres = set(cfg.get("trestle", ""))
    rows = plan["rows"]
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    P = lambda q: (q[0] * px, q[1] * px)

    def offs(pts, off):
        o = []
        for i, q in enumerate(pts):
            a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]
            tx, ty = b[0] - a[0], b[1] - a[1]; n = max(1e-6, (tx * tx + ty * ty) ** 0.5)
            o.append(P((q[0] - ty / n * off, q[1] + tx / n * off)))
        return o

    def tie(q, tan, half, thick, fill, outline):
        tx, ty = tan; n = max(1e-6, (tx * tx + ty * ty) ** 0.5); tx, ty = tx / n, ty / n
        nx, ny = -ty, tx
        c = [(q[0] + nx * half + tx * thick, q[1] + ny * half + ty * thick), (q[0] - nx * half + tx * thick, q[1] - ny * half + ty * thick),
             (q[0] - nx * half - tx * thick, q[1] - ny * half - ty * thick), (q[0] + nx * half - tx * thick, q[1] + ny * half - ty * thick)]
        d.polygon([P(v) for v in c], fill=fill, outline=outline)

    lw = lambda cells: max(1, int(round(px * cells)))
    # trestle: two long beams and cross-braces under the deck
    for (cell, pts) in routes:
        if rows[cell[1]][cell[0]] in tres:
            for off in (-0.33, 0.33):
                d.line(offs(pts, off), fill=(30, 20, 14, 255), width=lw(0.16), joint="curve")
                d.line(offs(pts, off), fill=(86, 58, 36, 255), width=lw(0.10), joint="curve")
    for (cell, pts) in routes:
        on_t = rows[cell[1]][cell[0]] in tres
        n = len(pts)
        for k in ((1, 4, 7) if n == 9 else (2, 5, 8)):
            a, b = pts[k - 1], pts[k + 1]
            h = (cell[0] * 7 + cell[1] * 13 + k * 5) % 9 - 4
            tie(pts[k], (b[0] - a[0], b[1] - a[1]), 0.42 if on_t else 0.36, 0.062,
                (104 + h * 2, 72 + h, 46 + h, 255), (44, 28, 18, 255))
    for (cell, pts) in routes:
        for off in (-RAIL_OFF, RAIL_OFF):
            d.line(offs(pts, off), fill=(34, 34, 40, 255), width=lw(0.10), joint="curve")
    for (cell, pts) in routes:
        for off in (-RAIL_OFF, RAIL_OFF):
            d.line(offs(pts, off), fill=(132, 136, 148, 255), width=lw(0.058), joint="curve")
            d.line(offs(pts, off - 0.008), fill=(196, 200, 210, 255), width=max(1, lw(0.014)), joint="curve")
    return np.asarray(lay).astype(np.float32)


def paint_rock(reg, X, Y, bx, by, rx, ry, hg, tex, px, seed, frost=0.0, tint=1.0):
    """A boulder standing on the floor at (bx,by): an egg, flat under, domed over, lit from the
    upper left in the same cel steps as the walls. Paints into `reg` and returns its body mask."""
    wob = (R.fbm(X, Y, px * 0.40, seed) - 0.5) * 0.22 * px
    wob2 = (R.fbm(X, Y, px * 0.40, seed + 1) - 0.5) * 0.16 * px
    u = (X + wob - bx) / rx
    dv = Y + wob2 - by
    v = np.where(dv > 0, dv / ry, dv / (hg + ry))
    r2 = u * u + v * v
    body = r2 <= 1.0
    sh = (((X - (bx + 0.20 * px)) / (rx * 1.30)) ** 2 + ((Y - (by + 0.10 * px)) / (ry * 1.30)) ** 2)
    reg *= (1.0 - np.clip(1.15 - sh, 0.0, 1.0) * 0.58 * (~body))[..., None]
    up = np.clip(-dv / (hg + ry), 0.0, 1.0)
    l = 0.62 + 0.62 * up - 0.34 * u + 0.10 * (R.fbm(X, Y, px * 0.22, seed + 2) - 0.5)
    l = np.floor(np.clip(l, 0.25, 1.5) * 5.0) / 5.0 + 0.10
    col = tex.astype(np.float32) * (l * 1.55 * tint)[..., None]
    if frost > 0:
        fr = np.clip((up - 0.34 + 0.25 * (R.fbm(X, Y, px * 0.30, seed + 3) - 0.5) - 0.20 * u) / 0.16, 0.0, 1.0) * frost
        col = col * (1 - fr[..., None]) + np.array([232.0, 242.0, 252.0], np.float32) * (0.80 + 0.20 * l)[..., None] * fr[..., None]
    col = np.clip(col, 0, 255)
    er = ndimage.binary_erosion(body, iterations=max(1, int(px * 0.035)))
    col[body & ~er] *= 0.32
    reg[body] = col[body]
    return body


def paint_plates(img, plan, cfg, a, px):
    """Stone slabs let into the floor (one per plate zone): a cut groove, a bevel, a paler face.
    The glyph and its lit state are the mechanic module's; this is the slab it sits on."""
    kinds = set(cfg.get("plate_zones", ()))
    for z in plan.get("zones", []):
        if z.get("kind") not in kinds or "rect" not in z:
            continue
        x0, y0, x1, y1 = z["rect"]
        xa, xb, ya, yb = int(x0 * px), int((x1 + 1) * px), int(y0 * px), int((y1 + 1) * px)
        Y, X = np.mgrid[ya:yb, xa:xb].astype(np.float32)
        dl, dr, dt, db = (X - x0 * px) / px, ((x1 + 1) * px - X) / px, (Y - y0 * px) / px, ((y1 + 1) * px - Y) / px
        dmin = np.minimum(np.minimum(dl, dr), np.minimum(dt, db))
        reg = img[ya:yb, xa:xb]
        ok = a[ya:yb, xa:xb]
        mean = reg.reshape(-1, 3).mean(axis=0)
        face = np.clip((dmin - 0.10) / 0.02, 0.0, 1.0) * ok
        flat = mean[None, None, :] + (reg - mean[None, None, :]) * 0.55
        gain = float(cfg.get("plate_gain", 1.10)) * np.array(cfg.get("plate_tint", (1.0, 1.0, 1.0)), np.float32)
        reg[:] = reg * (1 - face[..., None]) + np.clip(flat * gain[None, None, :], 0, 255) * face[..., None]
        lit = np.clip(1.0 - np.abs(np.minimum(dl, dt) - 0.125) / 0.03, 0.0, 1.0) * (np.minimum(dl, dt) <= np.minimum(dr, db))
        dark = np.clip(1.0 - np.abs(np.minimum(dr, db) - 0.125) / 0.03, 0.0, 1.0) * (np.minimum(dr, db) < np.minimum(dl, dt))
        groove = np.clip(1.0 - np.abs(dmin - 0.07) / 0.035, 0.0, 1.0)
        reg *= ((1.0 + 0.22 * lit * ok) * (1.0 - 0.22 * dark * ok) * (1.0 - 0.55 * groove * ok))[..., None]
        np.clip(reg, 0, 255, out=reg)


def paint(plan, mats, cfg):
    t0 = time.time()
    assets = norm_assets(plan)
    wrows = wall_rows(plan, cfg)
    known = set("#") | C.open_chars(plan["dungeonId"]) | set(cfg.get("rock", "")) | set(cfg.get("hazards", {})) | set(cfg.get("surfaces", {}))
    stray = set("".join(plan["rows"])) - known
    assert not stray, f"{plan['dungeonId']}: the dungeon table does not say how to paint {sorted(stray)}"
    f_assets = [a for a in assets if a["kind"] in POCKET]
    fld = R.floor_field(wrows, 1, f_assets)
    fw, prot, xx, yy = fld.fw, fld.prot, fld.xx, fld.yy
    px, W, H, Ww, Hw = fld.px, fld.W, fld.H, fld.Ww, fld.Hw
    cw, ch = fld.cw, fld.ch
    cxi = np.minimum((xx / px).astype(np.int32), cw - 1)
    cyi = np.minimum((yy / px).astype(np.int32), ch - 1)
    a = np.clip((fw - 0.5) * 34.0 + 0.5, 0.0, 1.0)

    tgt = cfg["target"]
    # The Codex floors are drawn at full contrast (every ember lit, every grain black or white).
    # Underfoot that is noise: a child has to read WHERE THE FLOOR IS first, so the floor is
    # calmed towards its own mean (pilot 3 did the same for the tower flags) and the walls,
    # lava and crystal keep the sheet's full contrast.
    fm = mats["floor"].astype(np.float32)
    sg = float(cfg.get("floor_soft", 0.0))
    if sg > 0:
        fm = np.dstack([ndimage.gaussian_filter(fm[..., c], sg, mode="wrap") for c in range(3)])
    fmean = fm.reshape(-1, 3).mean(axis=0)[None, None, :]
    # What reads as "busy" underfoot is not grain but BLOBS: pebble-sized lumps of value and hue
    # (measured: Ember's floor has less fine contrast than Obsidian's calm one, and 2.6x its
    # colour spread). `floor_coarse` turns the pebble band down and leaves the grain alone.
    cc = cfg.get("floor_coarse")
    if cc is not None:
        lo = np.dstack([ndimage.gaussian_filter(fm[..., c], float(cfg.get("floor_split", 6.0)), mode="wrap") for c in range(3)])
        fm = fmean + float(cfg.get("floor_fine", 1.0)) * (fm - lo) + float(cc) * (lo - fmean)
        del lo
    sat = float(cfg.get("floor_sat", 1.0))                       # <1: pull stray hues (ember specks) toward the floor's own colour
    if sat < 1.0:
        lum = fm.mean(axis=2, keepdims=True) / max(1.0, float(fmean.mean()))
        fm = (fmean * lum) * (1.0 - sat) + fm * sat
    fm = np.clip(fmean + float(cfg.get("floor_calm", 0.55)) * (fm - fmean), 0, 255)
    floor_m = R.grade(fm, tgt["floor"])
    del fm
    wall_m = R.grade(R.temper(mats["wall"]), tgt["wall"])
    ftex, fcrack = R.sample_patched(floor_m, xx, yy, px, 91, patch=5.0)
    wtex, wcrack = R.sample_patched(wall_m, xx, yy, px, 41, patch=4.0)
    img = ftex * a[..., None] + wtex * (1 - a[..., None])
    del ftex
    joint = fcrack * a + wcrack * (1.0 - a)
    del fcrack, wcrack
    img *= (1.0 - (0.04 + 0.56 * (1.0 - a)) * joint)[..., None]
    del joint

    depth = R.blur(np.clip(fw, 0, 1), px * 1.5)
    ao = np.clip(np.maximum(depth * 2.1, prot * 0.95), 0.0, 1.0)
    pool = 0.72 + 0.55 * np.clip(R.blur(np.clip(fw, 0, 1), px * 4.0), 0, 1)
    lamp = 0.88 + 0.24 * R.fbm(xx, yy, px * 22.0, 5)
    light = (0.42 + 0.58 * ao) * pool * lamp
    del ao, pool, lamp, depth
    steps = 5.0
    q = np.floor(light * steps) / steps
    light = q + (light - q) * 0.25
    img *= light[..., None]
    del q
    mean = img.reshape(-1, 3).mean(axis=0)
    img = np.clip(mean[None, None, :] + (img - mean[None, None, :]) * 1.22, 0, 255)

    face_h = max(2, int(px * R.FACE_H_CELLS))
    drop = max(2, int(px * 0.34))
    wall = 1.0 - a
    face = R.blur(np.clip(wall * R.shift(a, face_h), 0.0, 1.0), px * R.FACE_BLUR_CELLS)
    cast = R.blur(np.clip(a * R.shift(wall, -drop), 0.0, 1.0), px * 0.20)
    top = np.clip(wall - face, 0.0, 1.0)
    img *= (1.0 + 0.34 * top)[..., None]
    img *= (1.0 - 0.60 * face)[..., None]
    img *= (1.0 - 0.58 * cast)[..., None]
    del face, cast

    # rock tops near the walked space carry the sheet's accent (crystal growth): scenery, never floor
    ta = float(cfg.get("top_accent") or 0.0)
    if ta > 0:
        near = np.clip(R.blur(a, px * 1.3) * 3.0, 0.0, 1.0)
        acc = np.clip((R.fbm(xx, yy, px * 1.5, 131) - 0.58) / 0.07, 0.0, 1.0) * top * near * ta
        atex, _ = R.sample_patched(mats["accent"].astype(np.float32), xx, yy, px, 137, patch=3.0)
        img = img * (1 - acc[..., None]) + atex * (0.62 * light[..., None] + 0.30) * acc[..., None]
        del near, acc, atex

    inner = np.clip((0.555 - fw) / 0.015, 0.0, 1.0)
    outer = np.clip((fw - 0.50) / 0.02, 0.0, 1.0)
    band = inner * outer
    del inner, outer
    band *= np.clip(0.45 + 0.55 * R.fbm(xx, yy, px * 1.1, 23), 0, 1)
    rub = R.grade(mats["rubble"], tuple(int(v * 0.42) for v in tgt["floor"]))
    rtex, _ = R.sample_patched(rub, xx, yy, px, 63, patch=3.5)
    img = img * (1 - band[..., None]) + rtex * band[..., None]
    del band

    edge = np.clip(1.0 - np.clip(fw - 0.5, 0.0, None) / 0.075, 0.0, 1.0) * a \
        + np.clip(1.0 - np.clip(0.5 - fw, 0.0, None) / 0.030, 0.0, 1.0) * (1.0 - a) * 0.55
    edge *= np.clip(0.55 + 0.45 * R.fbm(xx, yy, px * 0.9, 31), 0, 1)
    img *= (1.0 - 0.42 * edge)[..., None]
    del edge

    spec = np.clip((R.fbm(xx, yy, px * 0.17, 67) - 0.64) * 3.4, 0.0, 1.0)
    spec *= np.clip((R.fbm(xx, yy, px * 1.9, 68) - 0.36) * 2.2, 0.0, 1.0)
    spec = spec * a * 0.60
    img = img * (1 - spec[..., None]) + rtex * spec[..., None]
    del spec

    # Rock nobody can reach or see into goes dark and quiet: it frames the cave (as in the pilot
    # the owner saw) and it is most of the picture's area, so it is also most of the file.
    deepk = np.clip((0.05 - R.blur(a, px * 2.0)) / 0.05, 0.0, 1.0) * 0.90
    flat = np.array(tgt["wall"], np.float32) * 0.30
    img = img * (1 - deepk[..., None]) + flat[None, None, :] * deepk[..., None]
    del deepk

    # ── terrain beyond rock and floor ─────────────────────────────────────────────────────────
    block = np.zeros((H, W), np.float32)             # painted blockers, for the walk mask
    kinds = {}
    for chr_, kind in cfg.get("hazards", {}).items():
        kinds.setdefault(kind, set()).add(chr_)
    present = set("".join(plan["rows"]))

    if "chasm" in kinds and (kinds["chasm"] & present):
        hz = organic(hazard_cells(plan, kinds["chasm"], wrows), cyi, cxi, xx, yy, px, 211)
        ca = np.clip((hz - 0.5) * 34.0 + 0.5, 0.0, 1.0) * a
        vfill = void_fill(cfg, mats, xx, yy, px)
        cliff = int(px * float(cfg.get("cliff", 1.30)))
        idx = np.arange(H, dtype=np.int32)[:, None]
        last = np.maximum.accumulate(np.where(ca < 0.5, idx, -1).astype(np.int32), axis=0)
        d = (idx - last).astype(np.float32)
        s = np.where(last >= 0, np.clip(1.0 - d / cliff, 0.0, 1.0), 0.0).astype(np.float32)
        del last, d
        strata = 0.80 + 0.40 * R.fbm(xx * 0.35, yy * 2.2, px * 0.9, 217)
        cl = np.clip(wtex * (float(cfg.get("cliff_gain", 1.55)) * strata * (0.30 + 0.70 * s))[..., None], 0, 255)
        k = (s ** 1.4)[..., None]
        chasm = vfill + (cl - vfill) * k
        img = img * (1 - ca[..., None]) + np.clip(chasm, 0, 255) * ca[..., None]
        del cl, chasm, strata, k, s, vfill
        ring = np.clip(R.blur(ca, px * 0.10) * 2.2, 0.0, 1.0) * (1.0 - ca) * a      # the lit lip
        img *= (1.0 + 0.24 * ring)[..., None]
        ec = np.clip(1.0 - np.abs(hz - 0.5) / 0.035, 0.0, 1.0) * a
        img *= (1.0 - 0.50 * ec)[..., None]
        block = np.maximum(block, ca)
        del ring, ec, hz, ca

    if "lava" in kinds and (kinds["lava"] & present):
        hz = organic(hazard_cells(plan, kinds["lava"], wrows), cyi, cxi, xx, yy, px, 223, amp=0.38)
        la = np.clip((hz - 0.5) * 34.0 + 0.5, 0.0, 1.0) * a
        ltex, _ = R.sample_patched(mats["accent"].astype(np.float32), xx, yy, px, 73, patch=3.0)
        flow = 0.86 + 0.34 * R.fbm(xx, yy, px * 1.7, 75)
        lava = np.clip(ltex * (flow * 1.08)[..., None], 0, 255)
        lava += (np.clip((hz - 0.80) / 0.20, 0.0, 1.0))[..., None] * np.array([34.0, 26.0, 6.0], np.float32)
        crust = np.clip((0.64 - hz) / 0.11, 0.0, 1.0) * np.clip(0.35 + 0.9 * R.fbm(xx, yy, px * 0.5, 79), 0, 1)
        lava = lava * (1 - 0.80 * crust[..., None]) + rtex * 0.50 * (0.80 * crust[..., None])
        img = img * (1 - la[..., None]) + np.clip(lava, 0, 255) * la[..., None]
        del ltex, flow, lava, crust
        g = np.clip(R.blur(la, px * 0.85) * 1.7, 0.0, 1.0) * (1.0 - la)
        img += g[..., None] * np.array(cfg.get("glow", (255, 120, 36)), np.float32)[None, None, :] * 0.36
        block = np.maximum(block, la)
        del g, hz, la

    if "water" in kinds and (kinds["water"] & present):            # still, deep, cold: a blocker, not a glow
        hz = organic(hazard_cells(plan, kinds["water"], wrows), cyi, cxi, xx, yy, px, 227, amp=0.30)
        wa = np.clip((hz - 0.5) * 34.0 + 0.5, 0.0, 1.0) * a
        wt, _ = R.sample_patched(mats["accent"].astype(np.float32), xx, yy, px, 83, patch=6.0)
        tint = np.array(cfg.get("water_tint", (0.30, 0.46, 0.66)), np.float32)
        rip = 0.86 + 0.28 * R.fbm(xx * 0.6, yy * 1.4, px * 0.8, 85)
        water = wt * tint[None, None, :] * rip[..., None]
        deep = np.clip((hz - 0.62) / 0.30, 0.0, 1.0)
        water *= (1.0 - 0.38 * deep)[..., None]
        img = img * (1 - wa[..., None]) + np.clip(water, 0, 255) * wa[..., None]
        ec = np.clip(1.0 - np.abs(hz - 0.5) / 0.04, 0.0, 1.0) * a
        img *= (1.0 + 0.30 * ec)[..., None]                       # a pale rime where water meets the bank
        block = np.maximum(block, wa)
        del hz, wa, wt, rip, water, deep, ec
    del rtex

    # ── walkable surfaces that are not the floor material: ice she slides or walks on ─────────
    for chr_, spec in cfg.get("surfaces", {}).items():
        if chr_ not in present:
            continue
        hz = organic(hazard_cells(plan, {chr_}, wrows), cyi, cxi, xx, yy, px, 229, amp=0.30)
        sa = np.clip((hz - 0.5) * 34.0 + 0.5, 0.0, 1.0) * a
        st, _ = R.sample_patched(mats[spec.get("tex", "accent")].astype(np.float32), xx, yy, px, 87, patch=7.0)
        smean = st.reshape(-1, 3).mean(axis=0)[None, None, :]
        st = smean + (st - smean) * float(spec.get("calm", 0.6))
        st = st * (np.array(spec.get("target", smean[0, 0]), np.float32) / np.maximum(smean[0, 0], 1.0))[None, None, :]
        surf = st * np.clip(0.50 + 0.62 * light, 0.72, 1.12)[..., None]
        sheen = np.clip((R.fbm(xx * 0.45 + yy * 0.45, yy * 1.6 - xx * 0.2, px * 1.3, 89) - 0.60) / 0.14, 0.0, 1.0)
        surf += sheen[..., None] * float(spec.get("sheen", 22.0))
        img = img * (1 - sa[..., None]) + np.clip(surf, 0, 255) * sa[..., None]
        ec = np.clip(1.0 - np.abs(hz - 0.5) / 0.035, 0.0, 1.0) * a
        img *= (1.0 - float(spec.get("rim", 0.26)) * ec)[..., None]
        del hz, sa, st, surf, sheen, ec

    paint_plates(img, plan, cfg, a, px)

    # ── rails: part of the floor picture (and of the trestle over a chasm), never of the mask ──
    rl = draw_rails(plan, cfg, px, W, H)
    if rl is not None:
        ra = rl[..., 3] / 255.0
        sh_ = R.blur(R.shift(ra, -max(1, int(px * 0.05))), px * 0.05)
        img *= (1.0 - 0.38 * np.clip(sh_ - ra, 0.0, 1.0))[..., None]
        lit = np.clip(0.50 + 0.60 * light, 0.70, 1.10)
        img = img * (1 - ra[..., None]) + rl[..., :3] * lit[..., None] * ra[..., None]
        del rl, ra, sh_, lit

    # ── mouths: the corridor leaves the picture into daylight ─────────────────────────────────
    for m in assets:
        if m["kind"] != "mouth":
            continue
        cells, run, (dx, dy) = C.mouth_cells(plan, m)
        z = np.zeros((ch, cw), bool)
        for x, y in cells + run:
            z[y, x] = True
        soft = R.blur(z.astype(np.float32)[cyi, cxi], px * 0.55)
        reach = 2.6 * px
        if dy > 0:   t = (yy - (H - reach)) / reach
        elif dy < 0: t = (reach - yy) / reach
        elif dx > 0: t = (xx - (W - reach)) / reach
        else:        t = (reach - xx) / reach
        L = np.clip(t, 0.0, 1.0) ** 1.3 * np.clip(soft * 1.6, 0.0, 1.0) * (0.25 + 0.75 * a)
        img = img * (1.0 + 0.7 * L[..., None]) + (L ** 1.5)[..., None] * np.array([235.0, 226.0, 198.0], np.float32) * 0.80
        del soft, t, L

    # ── pillars: standing columns, painted whole here; the part above the base cell is ALSO cut
    #    into the over layer so the runtime can draw it in front of a hero standing behind it ───
    over_a = None
    pillars = []
    stand = [(x, y, "pillar") for y, r in enumerate(plan["rows"]) for x, c in enumerate(r) if c in kinds.get("pillar", ())] \
        + [(x, y, "boulder") for y, r in enumerate(plan["rows"]) for x, c in enumerate(r) if c in kinds.get("boulder", ())]
    if stand:
        over_a = np.zeros((H, W), np.float32)
        for (cx_, cy_, style) in sorted(stand, key=lambda p: p[1]):
            bx, by = (cx_ + 0.5) * px, (cy_ + 0.60) * px
            if style == "boulder":
                hh = ((cx_ * 31 + cy_ * 17) % 7) / 6.0                       # each rock its own size
                rx, ry, hg = (0.43 + 0.04 * hh) * px, 0.27 * px, (0.58 + 0.16 * hh) * px
                x0, x1 = max(0, int(bx - rx * 1.9)), min(W, int(bx + rx * 1.9) + 1)
                y0, y1 = max(0, int(by - hg - ry - 0.2 * px)), min(H, int(by + ry * 2.2) + 1)
                X, Y = xx[y0:y1, x0:x1], yy[y0:y1, x0:x1]
                reg = img[y0:y1, x0:x1]
                tex = R.sample(wall_m, X + 137.0 + cx_ * 53.0, Y + 59.0 + cy_ * 29.0)
                body = paint_rock(reg, X, Y, bx, by, rx, ry, hg, tex, px, 311 + cx_ * 7 + cy_ * 3,
                                  frost=float(cfg.get("boulder_frost", 0.0)), tint=float(cfg.get("boulder_tint", 1.0)))
                img[y0:y1, x0:x1] = reg
                cut = int(cy_ * px)
                ov = over_a[y0:y1, x0:x1]
                ov[body & (Y < cut)] = 1.0
                if y0 < cut:
                    pillars.append({"x": cx_, "y": cy_, "box": [x0, y0, x1, min(y1, cut)], "by": by, "over": True})
                else:
                    pillars.append({"x": cx_, "y": cy_, "box": None, "by": by, "over": False})
                continue
            rx, ry, hg = 0.46 * px, 0.27 * px, 1.55 * px
            x0, x1 = max(0, int(bx - rx * 1.9)), min(W, int(bx + rx * 1.9) + 1)
            y0, y1 = max(0, int(by - hg - ry - 6)), min(H, int(by + ry * 2.2) + 1)
            X, Y = xx[y0:y1, x0:x1], yy[y0:y1, x0:x1]
            wob = (R.fbm(X, Y, px * 0.45, 301) - 0.5) * 0.20 * px
            u = (X + wob - bx) / rx
            ins = np.abs(u) <= 1.0
            cur = np.sqrt(np.clip(1.0 - u * u, 0.0, 1.0))
            body = ins & (Y >= by - hg - ry * cur) & (Y <= by + ry * cur)
            cap = ((u * u) + ((Y - (by - hg)) / ry) ** 2) <= 1.0
            sh = (((X - (bx + 0.22 * px)) / (rx * 1.35)) ** 2 + ((Y - (by + 0.10 * px)) / (ry * 1.25)) ** 2)
            shade = np.clip(1.15 - sh, 0.0, 1.0) * 0.62 * (~body)
            reg = img[y0:y1, x0:x1]
            reg *= (1.0 - shade)[..., None]
            tex = R.sample(wall_m, X * 1.0 + 137.0, Y * 1.0 + 59.0).astype(np.float32)
            l = np.clip(1.25 - 0.80 * (u * 0.5 + 0.5), 0.30, 1.4) * (0.72 + 0.28 * np.clip((by - Y) / hg, 0, 1))
            l = np.floor(l * 5.0) / 5.0 + 0.08
            l = np.where(cap, 1.75, l) * 1.9
            col = np.clip(tex * l[..., None] + np.where(cap, 16.0, 0.0)[..., None], 0, 255)
            er = ndimage.binary_erosion(body, iterations=max(2, int(px * 0.035)))
            col[body & ~er] *= 0.30
            reg[body] = col[body]
            img[y0:y1, x0:x1] = reg
            cut = int(cy_ * px)                                  # top of the base cell, master px
            ov = over_a[y0:y1, x0:x1]
            ov[body & (Y < cut)] = 1.0
            pillars.append({"x": cx_, "y": cy_, "box": [x0, y0, x1, min(y1, cut)], "by": by, "over": True})

    master = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert("RGBA")
    # contact shadows of the live props
    for it in assets:
        if it["kind"] not in SHADOW:
            continue
        rw, yo = SHADOW[it["kind"]]
        sw, shh = int(px * rw * 2), max(3, int(px * rw * 0.62))
        bl = max(1.0, sw * 0.10); pad = int(np.ceil(bl * 3))
        shd = Image.new("RGBA", (sw + 2 * pad, shh + 2 * pad), (0, 0, 0, 0))
        ImageDraw.Draw(shd).ellipse([pad, pad, pad + sw - 1, pad + shh - 1], fill=(0, 0, 0, 120))
        shd = shd.filter(ImageFilter.GaussianBlur(bl))
        master.alpha_composite(shd, (max(0, int((it["x"] + 0.5) * px - sw / 2 - pad)),
                                     max(0, int((it["y"] + yo) * px - shh / 2 - pad))))
    # stairs are scenery that never changes: Act 1's own sprites, seated and cut by the rock top
    stairs = [s for s in assets if s["kind"] in ("stairsUp", "stairsDown")]
    if stairs:
        R.paste_props(master, stairs, px)
        alpha = np.clip(top, 0.0, 1.0)
        for s_ in stairs:
            xa, xb = int(s_["x"] * px), int((s_["x"] + 1) * px)
            ya, yb = int(s_["y"] * px), int((s_["y"] + 1) * px)
            alpha[max(0, ya):min(H, yb), max(0, xa):min(W, xb)] = 0.0
        occl = np.dstack([np.clip(img, 0, 255).astype(np.uint8), (alpha * 255).astype(np.uint8)])
        master.alpha_composite(Image.fromarray(occl, "RGBA"))
        del occl, alpha
    del img

    out = master.convert("RGB").resize((Ww, Hw), Image.Resampling.LANCZOS)

    # ── the walk mask: the same fields, area-reduced then thresholded (as R.walkable_mask) ─────
    def small(f):
        return np.asarray(Image.fromarray(f, "F").resize((Ww, Hw), Image.Resampling.BOX))
    walk = (small(fw) >= 0.5) & (small(block) < 0.5)
    walk = walk.copy()
    for p in pillars:                                             # the base a hero cannot stand in
        bx, by = (p["x"] + 0.5) * C.CELL, (p["y"] + 0.60) * C.CELL
        ya, yb, xa, xb = max(0, int(by) - C.CELL), min(Hw, int(by) + C.CELL), max(0, int(bx) - C.CELL), min(Ww, int(bx) + C.CELL)
        yw, xw = np.mgrid[ya:yb, xa:xb]
        walk[ya:yb, xa:xb] &= ~((((xw - bx) / (0.44 * C.CELL)) ** 2 + ((yw - by) / (0.27 * C.CELL)) ** 2) <= 1.0)

    # ── sealed second mouths: the picture shows the mouth open; this is the rock fall the engine
    #    draws over it until the boss is beaten (floor.seal + <floor>-seal.webp) ───────────────
    seal_img, seals = None, []
    sm = [m for m in assets if m["kind"] == "mouth" and m.get("sealedUntil")]
    if sm:
        base = np.asarray(out).astype(np.float32)
        K = float(R.LATTICE_SCALE)
        tiles = []
        for m in sm:
            cells, run, (dx, dy) = C.mouth_cells(plan, m)
            allc = cells + run
            x0 = max(0, min(c[0] for c in allc) * C.CELL - 30); x1 = min(Ww, (max(c[0] for c in allc) + 1) * C.CELL + 30)
            y0 = max(0, min(c[1] for c in allc) * C.CELL - 40); y1 = min(Hw, (max(c[1] for c in allc) + 1) * C.CELL + 30)
            Y, X = np.mgrid[y0:y1, x0:x1].astype(np.float32)
            reg = base[y0:y1, x0:x1].copy()
            # the passage beyond the fall goes dark: rock, not daylight
            cm = np.zeros((y1 - y0, x1 - x0), np.float32)
            for (cx_, cy_) in run:
                cm[max(0, cy_ * C.CELL - y0):max(0, (cy_ + 1) * C.CELL - y0), max(0, cx_ * C.CELL - x0):max(0, (cx_ + 1) * C.CELL - x0)] = 1.0
            veil = np.clip(ndimage.gaussian_filter(cm, 9.0) * 1.35, 0.0, 1.0)
            rock = R.sample(wall_m, X * K + 211.0, Y * K + 97.0).astype(np.float32) * 0.42
            reg = reg * (1 - veil[..., None]) + rock * veil[..., None]
            alpha = veil.copy()
            # the fall itself: boulders heaped across the mouth cells and the first cell beyond
            heap = []
            for (cx_, cy_) in cells:
                for step in (0.0, 0.55, 1.0):
                    for j in range(2):
                        h1 = ((cx_ * 37 + cy_ * 91 + int(step * 10) * 13 + j * 57) % 17) / 16.0
                        h2 = ((cx_ * 53 + cy_ * 29 + int(step * 10) * 7 + j * 31) % 13) / 12.0
                        qx = (cx_ + 0.5 + dx * (step - 0.1) + (abs(dy)) * (h1 - 0.5) * 0.9) * C.CELL
                        qy = (cy_ + 0.62 + dy * (step - 0.1) + (abs(dx)) * (h1 - 0.5) * 0.9) * C.CELL
                        heap.append((qy, qx, 0.30 + 0.16 * h2, 0.34 + 0.30 * h1))
            for i, (qy, qx, rr, hh) in enumerate(sorted(heap)):
                tex = R.sample(wall_m, X * K + 37.0 * i, Y * K + 71.0 * i)
                body = paint_rock(reg, X, Y, qx, qy, rr * C.CELL, 0.24 * C.CELL, hh * C.CELL, tex, float(C.CELL), 401 + i)
                alpha = np.maximum(alpha, body.astype(np.float32))
                alpha = np.maximum(alpha, np.clip(1.15 - (((X - (qx + 0.20 * C.CELL)) / (rr * C.CELL * 1.30)) ** 2
                                                          + ((Y - (qy + 0.10 * C.CELL)) / (0.24 * C.CELL * 1.30)) ** 2), 0.0, 1.0) * 0.58)
            tiles.append((x0, y0, np.dstack([np.clip(reg, 0, 255), alpha * 255.0]).astype(np.uint8)))
        tw = sum(t[2].shape[1] for t in tiles) + len(tiles) - 1; th = max(t[2].shape[0] for t in tiles)
        seal_img = Image.new("RGBA", (tw, th), (0, 0, 0, 0)); sx = 0
        for (x0, y0, t) in tiles:
            seal_img.paste(Image.fromarray(t, "RGBA"), (sx, 0))
            seals.append({"x": int(x0), "y": int(y0), "w": int(t.shape[1]), "h": int(t.shape[0]), "sx": sx, "sy": 0})
            sx += t.shape[1] + 1

    over = None
    entries = []
    ovp = [p for p in pillars if p.get("over")]
    if over_a is not None and ovp:
        oa = np.clip(small(over_a), 0, 1)
        rgba = np.dstack([np.asarray(out), (oa * 255).astype(np.uint8)])
        k = Ww / W
        boxes = []
        for p in ovp:
            x0, y0, x1, y1 = p["box"]
            b = [int(np.floor(x0 * k)), int(np.floor(y0 * k)), int(np.ceil(x1 * k)), int(np.ceil(y1 * k))]
            al = rgba[b[1]:b[3], b[0]:b[2], 3] > 0                 # trim to what is really there
            ys, xs = np.nonzero(al)
            if len(ys):
                b = [b[0] + int(xs.min()), b[1] + int(ys.min()), b[0] + int(xs.max()) + 1, b[1] + int(ys.max()) + 1]
            boxes.append(b)
        # shelf-pack into rows no wider than ATLAS_W (a phone's texture limit is 4096)
        sx = sy = rowh = tw = 0; pos = []
        for b in boxes:
            w_, h_ = b[2] - b[0], b[3] - b[1]
            if sx + w_ > ATLAS_W and sx > 0:
                sx = 0; sy += rowh + 1; rowh = 0
            pos.append((sx, sy)); sx += w_ + 1; rowh = max(rowh, h_); tw = max(tw, sx)
        over = Image.new("RGBA", (tw, sy + rowh), (0, 0, 0, 0))
        for p, b, (sx, sy) in zip(ovp, boxes, pos):
            crop = Image.fromarray(rgba[b[1]:b[3], b[0]:b[2]], "RGBA")
            over.paste(crop, (sx, sy))
            entries.append({"x": b[0], "y": b[1], "w": b[2] - b[0], "h": b[3] - b[1], "sx": sx, "sy": sy,
                            "by": int(round((p["y"] + 0.60) * C.CELL)), "cell": [p["x"], p["y"]]})
    info = {"floor": f"{plan['dungeonId']}-f{plan['floor']}", "size": [Ww, Hw], "cells": [cw, ch],
            "over": entries, "seal": seals, "seconds": round(time.time() - t0),
            "peakMB": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)}
    return out, Image.fromarray((walk * 255).astype(np.uint8)).convert("1"), over, info, seal_img


def save_webp(im, path, q, cap_mb=CAP_MB):
    """q~85, stepping down only if a floor would break the per-floor cap."""
    while True:
        im.save(path, "WEBP", quality=q, method=6)
        mb = os.path.getsize(path) / 1e6
        if mb <= cap_mb or q <= 60:
            return q, mb
        q -= 5


def crop_plan(plan, box):
    x0, y0, x1, y1 = box
    p = dict(plan)
    p["rows"] = [r[x0:x1] for r in plan["rows"][y0:y1]]
    p["width"], p["height"] = x1 - x0, y1 - y0
    p["assets"] = [dict(a, x=a["x"] - x0, y=a["y"] - y0) for a in plan["assets"]
                   if x0 <= a["x"] < x1 and y0 <= a["y"] < y1 and a["kind"] != "mouth"]
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("floors", nargs="+")
    ap.add_argument("--crop")
    ap.add_argument("--out", default=C.ART)
    ap.add_argument("--q", type=int, default=85)
    ap.add_argument("--skip-existing", action="store_true")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    for fid in a.floors:
        did = fid.rsplit("-f", 1)[0]
        cfg = C.DUNGEONS[did]
        dst = os.path.join(a.out, f"{fid}-material.webp")
        if a.skip_existing and os.path.exists(dst) and os.path.exists(os.path.join(a.out, f"{fid}.art.json")):
            continue
        plan = C.load_plan(fid)
        if a.crop:
            plan = crop_plan(plan, [int(v) for v in a.crop.split(",")])
        mats = R.load_materials(os.path.join(C.MATROOT, did))
        img, walk, over, info, seal = paint(plan, mats, cfg)
        q, mb = save_webp(img, dst, a.q)
        walk.save(os.path.join(a.out, f"{fid}-walk.png"), optimize=True)
        info.update(quality=q, materialMB=round(mb, 3),
                    walkKB=round(os.path.getsize(os.path.join(a.out, f"{fid}-walk.png")) / 1e3, 1),
                    planSha=__import__("hashlib").sha256(open(C.plan_path(fid), "rb").read()).hexdigest()[:16],
                    crop=a.crop)
        op = os.path.join(a.out, f"{fid}-over.webp")
        if over is not None:
            over.save(op, "WEBP", lossless=True, method=6)
            info["overKB"] = round(os.path.getsize(op) / 1e3, 1)
        elif os.path.exists(op):
            os.remove(op)
        sp = os.path.join(a.out, f"{fid}-seal.webp")
        if seal is not None:
            seal.save(sp, "WEBP", lossless=True, method=6)
            info["sealKB"] = round(os.path.getsize(sp) / 1e3, 1)
        elif os.path.exists(sp):
            os.remove(sp)
        json.dump(info, open(os.path.join(a.out, f"{fid}.art.json"), "w"), indent=1)
        print(f"{fid} {plan['width']}x{plan['height']} -> {img.size} q{q} {mb:.2f} MB "
              f"in {info['seconds']}s, peak {info['peakMB']} MB", flush=True)


if __name__ == "__main__":
    main()
