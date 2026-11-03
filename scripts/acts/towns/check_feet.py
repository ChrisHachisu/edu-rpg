"""Sweep the hero's real FEET STENCIL (not a point) through each built town.

The stencil is the Act 1 feet test from public/dq-tiles.js a1fBuildStencil: the union of every
frame of the hero walk sheet, cut to the lowest A1F_FEET_PX (10) rows, anchored on the sole row (58)
of the 64 px frame. Here it is scaled to the town lattice (town.html draws the 64 px frame
HERO_H = 36 world px tall, 16 world px = 30 art px per cell).

For each town it reports, from startCell:
  strict   -- every NPC (talk range), the save point, the shop counter and the exit line are reachable
              with the stencil fully inside the walkable polygons;
  comfort  -- the same with one extra cell of clearance (stencil + 1 cell), the bar for gates and
              main lanes, the save point and the doors listed in town.json "doors" (healer, shop). The southward walk from startCell to the exit line must pass this one.
Writes $SCRATCH/feet/<id>-feet.png (cyan = stencil-free, white = free with one cell to spare).

  python3 check_feet.py [ids]
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kitlib import APC, PLATE, ROOT, SCRATCH  # noqa: E402

RUNTIME = os.environ.get("FEET_RUNTIME", os.path.join(SCRATCH, "runtime", "town"))
OUT = os.path.join(SCRATCH, "feet")
HERO_SHEET = os.path.join(ROOT, "public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png")
FEET_PX = 10            # dq-tiles A1F_FEET_PX (collision px at 32/cell ~ sheet px at 64/1.93 cells)
SOLE_ROW = 58           # town.html: the sheet's foot baseline sits at row 58 of a 64 px cell
HERO_H_WORLD = 36       # locks.heroWorldHeight
TALK = 1.5              # cells: an NPC is reached if the hero can stand this close
S = 2                   # work at half art resolution


def stencil():
    a = np.asarray(Image.open(HERO_SHEET).convert("RGBA"))[..., 3] > 8
    rows, cols = a.shape[0] // 64, a.shape[1] // 64
    u = np.zeros((64, 64), bool)
    for r in range(rows):
        for c in range(cols):
            u |= a[r * 64:(r + 1) * 64, c * 64:(c + 1) * 64]
    ys, xs = np.nonzero(u)
    keep = ys >= ys.max() - FEET_PX
    k = HERO_H_WORLD / 64 * APC / 16 / S          # sheet px -> half-art px
    pts = {(int(round((x + 0.5 - 32) * k)), int(round((y + 0.5 - SOLE_ROW) * k)))
           for x, y in zip(xs[keep], ys[keep])}
    return np.array(sorted(pts))


def footprint(pts, pad=0):
    """Structuring element for erosion: free(p) <=> walk(p + d) for all d in stencil (+pad disk)."""
    if pad:
        r = pad
        dd = [(dx, dy) for dx in range(-r, r + 1) for dy in range(-r, r + 1) if dx * dx + dy * dy <= r * r]
        pts = np.array(sorted({(x + dx, y + dy) for x, y in pts for dx, dy in dd}))
    mx = int(np.abs(pts).max())
    st = np.zeros((2 * mx + 1, 2 * mx + 1), bool)
    st[pts[:, 1] + mx, pts[:, 0] + mx] = True
    return st, pts


def check(tid, pts):
    walk = np.asarray(Image.open(os.path.join(RUNTIME, f"{tid}-collision.png")).convert("L")) < 128
    town = json.load(open(os.path.join(RUNTIME, f"{tid}-town.json")))
    w = walk[::S, ::S]
    res = {}
    cellpx = APC / S
    for name, pad in (("strict", 0), ("comfort", int(round(cellpx / 2)))):
        st, _ = footprint(pts, pad)
        free = ndi.binary_erosion(w, structure=st, border_value=0)
        lab, _ = ndi.label(free)
        sx, sy = town["startCell"]
        s_lab = lab[int(sy * cellpx), int(sx * cellpx)]
        fails = []
        if s_lab == 0:
            fails.append("startCell")
        reach = lab == s_lab if s_lab else np.zeros_like(free)
        yy, xx = np.mgrid[0:w.shape[0], 0:w.shape[1]]

        def near(c, r):
            m = (xx - c[0] * cellpx) ** 2 + (yy - c[1] * cellpx) ** 2 <= (r * cellpx) ** 2
            return bool((reach & m).any())
        # the shopkeeper stands behind the painted counter; the hero is served at shopCounter (checked below)
        targets = [(n["id"], n["cell"], TALK) for n in town["npcs"] if n["id"] != "shopkeeper"]
        targets.append(("savePoint", town["savePoint"], 0.5))
        if town.get("shopCounter"):
            sc = town["shopCounter"]
            targets.append(("shopCounter", sc.get("cell", sc) if isinstance(sc, dict) else sc, TALK))
        # round 3: the healer's door and the shop's door (town.json "doors": [{id, cell}], the paving
        # cell just below each door) must be reached, and with a cell to spare
        for dr in town.get("doors", []):
            targets.append(("door:" + dr["id"], dr["cell"], 1.0))
        for nm, c, r in targets:
            if pad and nm not in ("savePoint",) and not nm.startswith("door:"):      # comfort is the bar for lanes and gate, not
                continue                              # for every doorstep an NPC stands on
            if not near(c, r):
                fails.append(nm)
        ey = town["exit"]["cell"][1]
        if not reach[int(ey * cellpx):].any():
            fails.append("exitLine")
        res[name] = fails
        if name == "strict":
            img = np.zeros(w.shape + (3,), np.uint8)
            img[w] = (60, 60, 60)
            img[free] = (0, 150, 170)
            img[reach] = (0, 220, 255)
        else:
            img[reach] = (255, 255, 255)
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(img).save(os.path.join(OUT, f"{tid}-feet.png"))
    return res


def overworld(dist):
    """Same stencil at overworld scale against the act collision packs in a built dist: can the hero
    get from 3 cells south of each town door to the door's exit cell (the cell the door trigger
    needs), and how wide is the landmark's gate channel?"""
    from PIL import Image as _I
    _I.MAX_IMAGE_PIXELS = None
    m = json.load(open(os.path.join(dist, "acts-hifi/manifest.json")))
    a = np.asarray(_I.open(HERO_SHEET).convert("RGBA"))[..., 3] > 8
    u = np.zeros((64, 64), bool)
    for r in range(a.shape[0] // 64):
        for c in range(a.shape[1] // 64):
            u |= a[r * 64:(r + 1) * 64, c * 64:(c + 1) * 64]
    ys, xs = np.nonzero(u)
    k = 1.0125 / 0.7 * 32 / 48                     # hero-override HERO_SCALE / OW_SCALE, 48 -> 32 px
    pts = {(int(round((x + 0.5 - 32) * k)), int(round((y + 0.5 - 32) * k))) for x, y in zip(xs, ys)}
    pts = np.array(sorted(pts)); pts = pts[pts[:, 1] >= pts[:, 1].max() - FEET_PX]
    pts = np.array(sorted({(x // 2, y // 2) for x, y in pts}))      # half res
    st, _ = footprint(pts)
    print(f"overworld feet stencil {(np.ptp(pts[:, 0]) + 1) * 2 / 32:.2f} cells wide")
    for d in m["landmarks"]:
        if d.get("mapId") not in set(m.get("towns", [])) | {"embersRest", "havensEdge", "lastBastion", "ruinsCamp"}:
            continue
        act = d["act"]
        cj = json.load(open(os.path.join(dist, f"act{act}-hifi/collision.json")))
        ox, oy = cj["origin"]
        col = np.asarray(_I.open(os.path.join(dist, f"act{act}-hifi/collision.png")).convert("L")) > 127
        x, y = d["at"]
        x0, y0 = (x - ox - 6) * 32, (y - oy - 4) * 32
        sub = col[y0:y0 + 12 * 32, x0:x0 + 13 * 32][::2, ::2]
        free = ndi.binary_erosion(~sub, structure=st, border_value=1)
        lab, _ = ndi.label(free)
        src = lab[(7 * 32 + 16) // 2 + 3 * 16, (6 * 32 + 16) // 2]           # 3 cells south of the door
        ex, ey = d["exit"]
        tgt = lab[((ey - y + 4) * 32 + 16) // 2, ((ex - x + 6) * 32 + 16) // 2]
        chan = ~sub[(5 * 32 + 16) // 2]                                           # row just below the door
        cx = (6 * 32 + 16) // 2
        l = r = cx
        while l > 0 and chan[l - 1]: l -= 1
        while r < len(chan) - 1 and chan[r + 1]: r += 1
        w = (r - l + 1) * 2 / 32 if chan[cx] else 0
        print(f"  act{act} {d['mapId']:15s} door {d['at']} exit {d['exit']}: gate channel {w:.2f} cells, "
              f"exit cell reachable from the south: {'yes' if src and src == tgt else 'NO'}")


if __name__ == "__main__":
    pts = stencil()
    st, _ = footprint(pts)
    wid = (pts[:, 0].max() - pts[:, 0].min() + 1) * S / APC
    print(f"feet stencil: {len(pts)} pts, {wid:.2f} cells wide, "
          f"{(pts[:, 1].max() - pts[:, 1].min() + 1) * S / APC:.2f} cells tall")
    ids = sys.argv[1:] or sorted(f[:-10] for f in os.listdir(RUNTIME) if f.endswith("-town.json"))
    bad = 0
    for t in ids:
        r = check(t, pts)
        ok = not r["strict"] and not r["comfort"]
        bad += not ok
        print(f"{t:15s} strict {'OK' if not r['strict'] else 'FAIL ' + ','.join(r['strict']):30s} "
              f"comfort(+1 cell) {'OK' if not r['comfort'] else 'FAIL ' + ','.join(r['comfort'])}")
    if os.environ.get("OW_DIST"):
        overworld(os.environ["OW_DIST"])
    sys.exit(1 if bad else 0)
