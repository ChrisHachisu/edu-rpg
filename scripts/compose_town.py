#!/usr/bin/env python3
"""Compose Port Sapphire: streets first, buildings ONTO street frontages, then dressing.

WHY THIS EXISTS, VERBATIM. Owner on the first pilot: "the town looks pretty bad. everything is
placed way too randomly and the tiles are not placed meaningfully either."

He is describing one fault with two faces. The pilot picked building positions by hand and took the
street shape from the walkable polygon, and the two never met: buildings landed in the middle of
lanes, doors faced nothing, and the grass/paving boundary wandered past frontages it had no
relationship to. Organic is not the same as arbitrary. A town reads as designed when the STREET is
the primary structure and everything else is placed BY it -- which is also how DQ-style towns are
actually laid out.

So nothing here is hand-placed except the four fixtures the game itself pins (shop counter, healer,
save point, town exit). Everything else is derived:

  1. STREETS come from portSapphire-walkable.json, the collision authority. Organic, 211 points,
     never criticised by the owner, and the same thing the runtime uses to decide where the player
     may walk -- so art and collision cannot drift apart.
  2. BUILDINGS ARE PLACED ON FRONTAGES, NOT AT COORDINATES. The props are drawn front-on, doors
     towards the viewer, so a building only makes sense with its street to the SOUTH. The frontage
     finder walks the street's northern boundary and drops buildings along it at a fixed setback,
     rejecting any footprint that touches the street or a building already placed. That single
     constraint is what turns a scatter into rows: every door faces a lane, and every lane has a
     built edge.
  3. THE GROUND IS PLACED BY THE SAME STRUCTURE. Each door gets a paved apron joining it to the
     street, so paving exists for a reason instead of stopping mid-grass. Plots between buildings
     get their garden dressing against the building line.
  4. DRESSING HUGS EDGES. Trees, lamps, carts and crates are offered positions along building lines
     and street edges only -- never the middle of a lane, which the v4 brief already established as
     the rule the owner approved ("ground clutter tucks tight against buildings, never in the
     middle of a lane").
"""
from __future__ import annotations
import argparse, json, os
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, binary_dilation

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G = os.path.join(ROOT, "design/act1-towns/ground")
PROPS = os.path.join(ROOT, "design/act1-towns/props")
TOWNDIR = os.path.join(ROOT, "public/act1-hifi/town")
HERO = os.path.join(ROOT, "public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png")

CELLS = 65
PX = 30.0                    # plate px per cell: 16 world px * 1.875 art px per world px
WORLD = 16.0
PLATE = int(CELLS * PX)      # 1950 -- the density check_town_finish.py gates on
HERO_WORLD = 36.0

# The catalogue, from the sheet the owner approved. Width in CELLS; `kind` drives placement.
# WIDTHS IN CELLS. The shipped painting draws houses ~10 cells wide, but that plate has no street
# network under it -- here the blocks between lanes are 4 to 9 cells of frontage, so a 7-cell house
# fits almost nowhere and the first run placed ONE building in the whole town. At 5 cells a cottage
# stands about 2.4x the heroine's height, which is the JRPG proportion, and a block takes two or
# three of them with room for a garden between.
HOUSES = [(0, 5.0), (1, 4.8), (2, 4.7), (3, 5.1), (4, 4.9),
          (5, 5.3), (6, 5.0), (7, 4.8), (8, 5.2), (9, 5.0)]
SHOP, INN, CLINIC, WELL = (10, 5.6), (11, 5.4), (12, 5.2), (13, 2.3)
STALL = (14, 4.8)
WISEWOMAN = ("v3-wisewoman-a", 5.2)
TREES = [(20, 2.6), (21, 2.8)]
# VERIFIED AGAINST A LABELLED CONTACT SHEET, NOT AGAINST THE SHEET'S VISUAL ORDER. The cutter
# numbered these differently from how they read on props-v2-sheet.png: 22 is the LAMP and 24 is the
# FENCE, not the other way round. Assuming the visual order scattered a hundred stone lamp posts
# across the meadows.
LAMP, BUSH, FENCE, CRATES = (22, 1.0), (23, 1.4), (24, 3.0), (18, 2.0)
JETTY, ROWBOAT, SAILBOAT, BOLLARD = (15, 4.2), (16, 2.6), (17, 4.0), (19, 1.4)


def key_magenta(im):
    """Key the flat magenta, erode one pixel, despill the rim. A soft matte is the one thing this
    art must not have, so the alpha is never blurred."""
    a = np.asarray(im.convert("RGBA")).astype(int)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    al = np.where((r > 150) & (b > 150) & (g < np.minimum(r, b) - 40), 0, a[:, :, 3])
    o = al > 0
    nb = np.ones_like(o)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nb &= np.roll(o, (dy, dx), (0, 1))
    al = np.where(o & ~nb, 0, al)
    a[:, :, 3] = al
    sp = (al > 0) & (r > g + 25) & (b > g + 25)
    a[:, :, 0] = np.where(sp, np.minimum(r, g + 25), r)
    a[:, :, 2] = np.where(sp, np.minimum(b, g + 25), b)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


_cache = {}
def prop(idx, cells_wide):
    k = (idx, round(cells_wide, 2))
    if k in _cache:
        return _cache[k]
    name = idx if isinstance(idx, str) else f"v2-prop-{idx:02d}"
    im = key_magenta(Image.open(os.path.join(PROPS, f"{name}.png")))
    im = im.crop(im.getbbox())
    w = int(round(cells_wide * PX))
    im = im.resize((w, int(round(im.size[1] * w / im.size[0]))), Image.NEAREST)
    _cache[k] = im
    return im


def masks():
    """streets (the walkable authority), sea, land -- all at plate density."""
    reg = json.load(open(os.path.join(TOWNDIR, "portSapphire-walkable.json")))["regions"][0]
    s = PLATE / 1040.0
    im = Image.new("L", (PLATE, PLATE), 0)
    dr = ImageDraw.Draw(im)
    dr.polygon([(p["x"] * s, p["y"] * s) for p in reg["outer"]], fill=255)
    for h in reg.get("holes", []):
        dr.polygon([(p["x"] * s, p["y"] * s) for p in h], fill=0)
    street = np.asarray(im) > 127
    # THE SEA IS ONE BODY OF WATER TOUCHING THE BOTTOM EDGE, NOT "EVERY BLUE PIXEL".
    # Colour-thresholding the painting also selects roof shadows, window glass and boat hulls, and
    # since the shore band is derived from distance-to-sea, those strays became sand blobs sitting
    # in the middle of the town. Cleaning at cell scale and then keeping only the component that
    # reaches the bottom edge leaves the harbour and nothing else.
    from scipy.ndimage import binary_closing, binary_opening, label
    p = np.asarray(Image.open(os.path.join(TOWNDIR, "portSapphire-screen.png"))
                   .convert("RGB").resize((PLATE, PLATE), Image.LANCZOS)).astype(float)
    blue = (p[:, :, 2] > p[:, :, 0] * 1.5 + 20) & (p[:, :, 2] > 60)
    blue = binary_closing(binary_opening(blue, np.ones((21, 21))), np.ones((41, 41)))
    lab, n = label(blue)
    sz = np.bincount(lab.ravel()); sz[0] = 0
    # "touches the bottom edge" looked safe and selected NOTHING -- the plate's last rows are not
    # blue -- which silently deleted the whole harbour. Size is the honest criterion: the sea is
    # 443 cells^2 and the next-largest stray is a boat hull.
    keep = [i for i in range(1, n + 1) if sz[i] >= 100 * PX * PX]
    sea = np.isin(lab, keep) if keep else np.zeros_like(blue)
    sea &= ~street                                   # a lane is never sea
    return street, sea, ~sea


def field(tile, h, w, vary=True, salt=0):
    t = tile.shape[0]
    out = np.empty((h, w, 3), np.uint8)
    for ty in range(0, h, t):
        for tx in range(0, w, t):
            v = tile
            if vary:
                k = (hash((tx // t, ty // t, salt)) >> 3) & 3
                if k:
                    v = np.rot90(tile, k)
                if k & 1:
                    v = v[:, ::-1]
            out[ty:ty + min(t, h - ty), tx:tx + min(t, w - tx)] = v[:h - ty, :w - tx]
    return out


# ---------------------------------------------------------------------------------------------
#  FRONTAGES -- the whole layout hinges on this
# ---------------------------------------------------------------------------------------------
def frontages(street, land, min_run=3.0, min_depth=2.6):
    """Every south-facing frontage in the town: a horizontal run of ground with a lane below it.

    Two earlier versions of this failed the same way, from opposite directions. Scanning for "the
    topmost street pixel with land above" finds only the outer boundary of the whole network.
    Labelling blocks and taking each block's lower edge fails because the surrounding countryside is
    ONE component wrapping the whole town, so its "bottom" is the bottom of the map.

    Working in COLUMN SPANS avoids both. Down each column, every maximal span of non-street land
    whose next pixel is street is a frontage point -- that is true of an enclosed block's south edge
    and of the outer ring's south edge alike, which is right: both face a lane. A span shallower
    than `min_depth` cells is skipped because no building would fit in it.

    Runs break wherever the edge steps by more than a cell, so the result follows the organic
    boundary instead of flattening it into a terrace.
    """
    h, w = street.shape
    pts = [[] for _ in range(w)]
    for x in range(w):
        col_s, col_l = street[:, x], land[:, x]
        y = 0
        while y < h:
            if col_s[y] or not col_l[y]:
                y += 1
                continue
            y0 = y
            while y < h and col_l[y] and not col_s[y]:
                y += 1
            if y < h and col_s[y] and (y - y0) >= min_depth * PX:
                pts[x].append(y - 1)
    # GROUP BY TRACING THE EDGE, NOT BY SCANNING COLUMNS IN ORDER. A column typically carries
    # several frontage points at very different heights (one per block the column crosses), so a
    # left-to-right scan that starts each new run from "the first point in this column" jumps
    # between unrelated edges and breaks constantly -- 623 valid points collapsed to 4 runs.
    # Labelling the frontage pixels instead gives one component per continuous edge; each component
    # is then cut wherever its own height steps by more than a cell.
    from scipy.ndimage import label
    front = np.zeros_like(street)
    for x in range(w):
        for y in pts[x]:
            front[y, x] = True
    lab, n = label(front, structure=np.ones((3, 3)))
    runs = []
    for i in range(1, n + 1):
        ys, xs = np.where(lab == i)
        if xs.max() - xs.min() < min_run * PX:
            continue
        by = {}
        for x, y in zip(xs, ys):
            by[x] = max(by.get(x, 0), y)          # the lowest point of this edge in this column
        cur = None
        for x in range(int(xs.min()), int(xs.max()) + 2):
            y = by.get(x)
            if y is None or (cur and abs(y - cur[2]) > PX * 1.7):
                if cur and cur[1] - cur[0] >= min_run * PX:
                    runs.append(cur)
                cur = (x, x, float(y)) if y is not None else None
            elif cur:
                cur = (cur[0], x, (cur[2] * (x - cur[0]) + y) / (x - cur[0] + 1))
            else:
                cur = (x, x, float(y))
        if cur and cur[1] - cur[0] >= min_run * PX:
            runs.append(cur)
    return runs


class Site:
    """Keeps placements from overlapping each other or the street."""
    def __init__(self, street):
        self.blocked = binary_dilation(street, np.ones((3, 3)))
        self.taken = np.zeros_like(street)
        # Roof masses, kept separately from footprints. The v4 brief the owner approved is explicit:
        # "every building reads as ONE structure ... never two roofs colliding into an ambiguous
        # stacked shape." A footprint test alone permits exactly that, because the roof overhangs
        # the footprint by more than half the sprite.
        self.roofs = np.zeros_like(street)

    def fits(self, box, allow_street=False):
        x0, y0, x1, y1 = box
        if x0 < 0 or y0 < 0 or x1 > PLATE or y1 > PLATE:
            return False
        if self.taken[y0:y1, x0:x1].any():
            return False
        if not allow_street and self.blocked[y0:y1, x0:x1].any():
            return False
        return True

    def claim(self, box, pad=0, roof=None):
        x0, y0, x1, y1 = box
        self.taken[max(0, y0 - pad):y1 + pad, max(0, x0 - pad):x1 + pad] = True
        if roof is not None:
            rx0, ry0, rx1, ry1 = roof
            self.roofs[max(0, ry0):ry1, max(0, rx0):rx1] = True

    def roof_clear(self, roof, tol=0.06):
        """A LITTLE overlap is how a town looks; a lot is the ambiguous stacked shape the owner
        rejected. Forbidding all of it cut the second rank from 14 buildings to 5 and left the map
        reading as a hamlet, so the test is a fraction, not a boolean."""
        rx0, ry0, rx1, ry1 = roof
        r = self.roofs[max(0, ry0):ry1, max(0, rx0):rx1]
        return r.size == 0 or r.mean() <= tol


def footprint(sp, cx, feet_y):
    """A prop's box on the plate, from its bottom-centre. Only the lower part of a building is its
    FOOTPRINT -- the roof overhangs and must be allowed to sit over ground behind it, or nothing
    ever fits on a real street."""
    w, h = sp.size
    x0 = int(round(cx - w / 2))
    return (x0, int(round(feet_y - h)), x0 + w, int(round(feet_y)))


def foot_box(sp, cx, feet_y, frac=0.42):
    x0, y0, x1, y1 = footprint(sp, cx, feet_y)
    return (x0, int(y1 - (y1 - y0) * frac), x1, y1)


def load_ground():
    return {n: np.asarray(Image.open(os.path.join(G, f"ground-{n}.png")).convert("RGB"))
            for n in ("grass", "paving", "shore", "water", "quay", "deck")}


def build_ground(street, sea, land, aprons, seed=0xA17):
    """Grass on land, paving on the street network AND on the door aprons, shore at the waterline.

    The aprons are the answer to "the tiles are not placed meaningfully": every door gets paving
    joining it to the lane, so a patch of stone always has a reason to be where it is. Without them
    the paving stops in open grass and reads as a spill.
    """
    g = load_ground()
    grass = field(g["grass"], PLATE, PLATE, salt=1)
    water = field(g["water"], PLATE, PLATE, salt=4)
    quay = field(g["quay"], PLATE, PLATE, salt=5)
    pav = field(g["paving"], PLATE, PLATE, salt=2)
    shore = field(g["shore"], PLATE, PLATE, salt=3)

    paved = street | aprons
    rng = np.random.default_rng(seed)
    d = distance_transform_edt(paved) - distance_transform_edt(~paved)
    n = rng.random((PLATE // 12 + 2, PLATE // 12 + 2))
    n = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((PLATE, PLATE), Image.BICUBIC)).astype(float)
    n = (n / 255.0 - 0.5) * 2.0
    m = (d + n * 11.0) > 0                                   # the join, displaced at cobble scale

    out = np.where(m[..., None], pav, grass)
    out = np.where((m & (d < 9) & (n > 0.15))[..., None], grass, out)     # grass through the stones
    out = np.where(((~m) & (d > -16) & (n < -0.45))[..., None], pav, out) # loose stones in the grass

    # The waterline: a band of shore between the land and the sea, so the two never butt.
    ds = distance_transform_edt(~sea)
    beach = land & (ds < PX * 1.6) & ~m
    out = np.where(beach[..., None], shore, out)
    # The harbour: dressed quay stone where a lane meets the water (a port has an engineered edge,
    # not a beach), plain shore elsewhere along the coast.
    quayband = land & (ds < PX * 1.9) & (distance_transform_edt(~paved) < PX * 3.0)
    out = np.where(quayband[..., None], quay, out)
    out = np.where(sea[..., None], water, out)
    return Image.fromarray(out).convert("RGBA")


def place(street, sea, land):
    """(placements, aprons, runs). A placement is (sprite, cx, feet_y, tag).

    Fixtures are SNAPPED TO THE NEAREST FRONTAGE rather than dropped at their literal cell. The
    game pins where the healer stands and where the shop counter is; it does not pin where the
    building behind them sits, and forcing a building to a coordinate the street plan does not
    support is how the first attempt put doors in the middle of lanes.
    """
    town = json.load(open(os.path.join(TOWNDIR, "portSapphire-town.json")))
    site = Site(street)
    out, aprons = [], np.zeros_like(street)
    SETBACK = PX * 0.45
    runs = frontages(street, land)

    def apron_for(cx, feet):
        col = street[int(feet):int(min(PLATE, feet + PX * 7)), int(np.clip(cx, 0, PLATE - 1))]
        ys = np.flatnonzero(col)
        if not len(ys):
            return
        s_top = int(feet + ys[0])
        aprons[int(feet - PX * 0.4):s_top + int(PX * 0.4),
               max(0, int(cx - PX * 1.15)):int(cx + PX * 1.15)] = True

    def clear_feet(sp, cx, y_hint):
        """Lift the building until it clears the lane across its WHOLE width.

        A run carries a mean height, but the edge under it steps by up to a cell, so seating a
        building on the mean buries part of its base in the street -- measured at 3% of the
        footprint, which `fits` correctly rejects and which silently emptied the whole town. Taking
        the highest street top across the span is what makes an organic edge buildable.
        """
        x0 = int(np.clip(cx - sp.size[0] / 2, 0, PLATE - 1))
        x1 = int(np.clip(cx + sp.size[0] / 2, 1, PLATE))
        y_from = int(max(0, y_hint - PX * 2.5))
        band = street[y_from:int(min(PLATE, y_hint + PX * 3)), x0:x1]
        tops = []
        for c in range(band.shape[1]):
            ys = np.flatnonzero(band[:, c])
            if len(ys):
                tops.append(y_from + ys[0])
        if not tops:
            return None
        return min(tops) - SETBACK

    def try_at(sp, cx, y_hint, pad=0.35, roof_test=True, exact=False):
        feet = y_hint if exact else clear_feet(sp, cx, y_hint)
        if feet is None:
            return None
        box = foot_box(sp, cx, feet)
        if not site.fits(box):
            return None
        roof = footprint(sp, cx, feet)
        if roof_test and not site.roof_clear(roof):
            return None
        site.claim(box, pad=int(PX * pad), roof=roof if roof_test else None)
        return (cx, feet)

    def put_on_frontage(spec, cell, tag):
        """Nearest frontage to `cell` that will take this building."""
        sp = prop(*spec)
        tx, ty = cell[0] * PX, cell[1] * PX
        cands = []
        for x0, x1, y in runs:
            cx = float(np.clip(tx, x0 + sp.size[0] / 2, x1 - sp.size[0] / 2))
            if x1 - x0 < sp.size[0]:
                continue
            cands.append(((cx - tx) ** 2 + (y - ty) ** 2, cx, y))
        for _, cx, feet in sorted(cands)[:14]:
            r = try_at(sp, cx, feet)
            if r:
                out.append((sp, r[0], r[1], tag))
                apron_for(r[0], r[1])
                return True
        return False

    ok = {}
    ok["shop"] = put_on_frontage(SHOP, town["shopCounter"], "shop")
    ok["clinic"] = put_on_frontage(CLINIC, [n for n in town["npcs"] if n["id"] == "healer"][0]["cell"], "clinic")
    ok["wisewoman"] = put_on_frontage(WISEWOMAN, [n for n in town["npcs"] if n["id"] == "wisewoman"][0]["cell"], "wisewoman")
    ok["inn"] = put_on_frontage(INN, [31.0, 24.0], "inn")

    # The well is the save point and stands IN the square, so it is the one thing allowed on paving.
    sp = prop(*WELL)
    sv = town["savePoint"]
    site.claim(foot_box(sp, sv[0] * PX, sv[1] * PX), pad=int(PX * 0.25))
    out.append((sp, sv[0] * PX, sv[1] * PX, "well"))

    # ---- fill the remaining frontage ---------------------------------------------------------
    hi = 0
    for x0, x1, ytop in sorted(runs, key=lambda r: -(r[1] - r[0])):
        x = x0 + PX * 0.4
        while x < x1 - PX * 2.5:
            spec = HOUSES[hi % len(HOUSES)]
            s2 = prop(*spec)
            cx = x + s2.size[0] / 2
            if cx + s2.size[0] / 2 > x1:
                break
            r = try_at(s2, cx, ytop)
            if r:
                out.append((s2, r[0], r[1], "house"))
                apron_for(r[0], r[1])
                hi += 1
                x += s2.size[0] + PX * (0.9 + 0.7 * ((hi * 7) % 3))   # varied gaps, not a comb
            else:
                x += PX * 1.2

    # ---- a second rank, set back behind the front row ----------------------------------------
    # A single row per lane leaves the deep blocks empty and the town reads as a village strung
    # along a road. Real towns put a second rank behind the first; the props face south either way,
    # so the back row looks over the roofs in front of it, which is how DQ towns are drawn.
    front = [p for p in out if p[3] in ("house", "inn", "shop", "clinic", "wisewoman")]
    for k, (sp0, cx0, feet0, _) in enumerate(list(front)):
        spec = HOUSES[(hi + k) % len(HOUSES)]
        s3 = prop(*spec)
        back_feet = feet0 - sp0.size[1] * 0.62
        for dx in (0.0, -2.2, 2.2):
            cx = cx0 + dx * PX
            if back_feet - s3.size[1] < PX * 2:
                continue
            if not land[int(back_feet) - 4, int(np.clip(cx, 0, PLATE - 1))]:
                continue
            r = try_at(s3, cx, back_feet, pad=0.3, exact=True)
            if r:
                out.append((s3, r[0], r[1], "house"))
                break

    # ---- fill the open ground -----------------------------------------------------------------
    # A town is not buildings on a lawn. The empty grass between lanes gets orchard trees, hedging
    # and scrub on a jittered grid, skipping anything within a cell of a lane so the lanes stay the
    # clear 3-4 cells the owner approved in v4 ("lanes read as lanes at a glance").
    rng = np.random.default_rng(0x5EED)
    lane_d = distance_transform_edt(~street)
    # CLUSTERED, NOT A UNIFORM GRID. A jittered lattice at even density produced 108 objects spread
    # evenly over every meadow, which reads as woodland the town happens to sit in. Copses of two to
    # five, with large gaps between them, read as orchards and hedgerow.
    for _ in range(26):
        gx, gy = rng.uniform(PX * 2, PLATE - PX * 3), rng.uniform(PX * 2, PLATE - PX * 3)
        for _ in range(int(rng.integers(2, 6))):
            jx = gx + rng.normal(0, PX * 2.2)
            jy = gy + rng.normal(0, PX * 1.6)
            ix, iy = int(np.clip(jx, 0, PLATE - 1)), int(np.clip(jy, 0, PLATE - 1))
            if not (land[iy, ix] and not sea[iy, ix] and lane_d[iy, ix] > PX * 1.4):
                continue
            d = prop(*(TREES[rng.integers(0, 2)] if rng.random() < 0.62 else BUSH))
            r = try_at(d, jx, jy, pad=0.05, roof_test=False, exact=True)
            if r:
                out.append((d, r[0], r[1], "scatter"))

    # ---- dressing, against the building line only --------------------------------------------
    houses = [p for p in out if p[3] in ("house", "inn", "shop", "clinic", "wisewoman")]
    for k, (sp, cx, feet, tag) in enumerate(houses):
        for side, spec in ((-1, TREES[k % 2]), (1, BUSH if k % 2 else LAMP)):
            d = prop(*spec)
            dx = cx + side * (sp.size[0] / 2 + d.size[0] / 2 + PX * 0.35)
            r = try_at(d, dx, feet + PX * 0.6, pad=0.1, roof_test=False)
            if r:
                out.append((d, r[0], r[1], "dressing"))
    return out, aprons, runs


def hero_sprite(row=0, col=1):
    f = Image.open(HERO).convert("RGBA").crop((col * 64, row * 64, col * 64 + 64, row * 64 + 64))
    s = int(round(HERO_WORLD * PX / WORLD))
    return f.resize((s, s), Image.NEAREST)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(G, "town-v1.png"))
    ap.add_argument("--view-at", default="31.4,30.0")
    ap.add_argument("--debug-layout", action="store_true")
    a = ap.parse_args()

    street, sea, land = masks()
    placements, aprons, runs = place(street, sea, land)
    base = build_ground(street, sea, land, aprons)

    # Painter's order by FEET: a prop lower on the screen is nearer the camera and draws later.
    for sp, cx, feet, tag in sorted(placements, key=lambda p: p[2]):
        base.alpha_composite(sp, (int(round(cx - sp.size[0] / 2)), int(round(feet - sp.size[1]))))

    h = hero_sprite()
    hx, hy = 31.4 * PX, 31.2 * PX
    base.alpha_composite(h, (int(hx - h.size[0] / 2), int(hy - h.size[1])))

    plate = base.convert("RGB")
    plate.save(a.out)
    counts = {}
    for _, _, _, t in placements:
        counts[t] = counts.get(t, 0) + 1
    print(f"  plate {plate.size[0]}x{plate.size[1]}  frontage runs {len(runs)}  placed {counts}")

    vx, vy = (float(v) for v in a.view_at.split(","))
    V = 390
    l = int(np.clip(vx * PX - V / 2, 0, PLATE - V)); t = int(np.clip(vy * PX - V / 2, 0, PLATE - V))
    dev = plate.crop((l, t, l + V, t + V)).resize((V * 3, V * 3), Image.NEAREST)
    dp = a.out.replace(".png", "-device.png")
    dev.save(dp)
    print(f"  device view -> {os.path.relpath(dp, ROOT)}")

    if a.debug_layout:
        dbg = Image.fromarray(np.dstack([
            np.where(street, 255, 40), np.where(aprons, 255, 40), np.where(sea, 255, 40)]).astype(np.uint8))
        d2 = ImageDraw.Draw(dbg)
        for x0, x1, y in runs:
            d2.line([(x0, y), (x1, y)], fill=(255, 255, 0), width=5)
        for sp, cx, feet, tag in placements:
            x0, y0, x1, y1 = foot_box(sp, cx, feet)
            d2.rectangle([x0, y0, x1, y1], outline=(255, 160, 0), width=4)
        dbg.resize((900, 900)).save(a.out.replace(".png", "-layout.png"))
        print("  layout debug ->", os.path.relpath(a.out.replace('.png', '-layout.png'), ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
