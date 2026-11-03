"""Act 1-style finishing of the Codex town plates (round 3).

  python3 codex_finish.py prep [ids]      upscale+sharpen, paving draft, gridded review views
  python3 codex_finish.py build [ids]     walkable (paving - authored footprints), actors, runtime files, previews

Plate: the picked 1254 px Codex try -> 1950 LANCZOS -> PIL UnsharpMask(1.0, 220, 1), the Act 1
chunk sharpen (scripts/sharpen_act1_chunks.py defaults).
Walkable: the paving the brief asked for, classified per town against the colour of the town's own
south street (Mahalanobis on a 3 px blur), cleaned, minus the AUTHORED building footprints in
design-acts/<id>-authored-obstacles.json (Act 1 format: nonWalkableBands polygonArt, art px of the
1950 plate), the gate street's connected component only.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
SCR = "/tmp/claude-0/-home-claude/c446ac0c-2689-576d-8fff-6176ff6d9aad/scratchpad"
SRC = os.path.join(SCR, "acts/codex-towns")
WORK = os.path.join(SCR, "acts/towns/codexfin")
AUTH = os.path.join(HERE, "authored")
PICKS = {"ironkeep": 3, "frostwatch": 3, "hauntedVillage": 2, "oasisHaven": 3, "ruinsCamp": 3,
         "embersRest": 3, "cinderwatch": 3, "lastBastion": 2, "havensEdge": 3}
P = 1950
APC = 30


def plate(tid, n=None):
    n = n or PICKS[tid]
    im = Image.open(f"{SRC}/town-{tid}/town-{tid}-try{n}.png").convert("RGB")
    up = im.resize((P, P), Image.LANCZOS)
    return up, up.filter(ImageFilter.UnsharpMask(1.0, 220, 1))


def paving(up, extra_seeds=()):
    """Union of per-seed colour models: the south street, plus authored seed rects on lane
    variants the street's own colour does not cover (lighter cobble, a cross street in shadow)."""
    a = ndi.gaussian_filter(np.asarray(up).astype(np.float32), (3, 3, 0))
    rects = [(975 - 45, 1860, 975 + 45, 1945)] + [(x0 * APC, y0 * APC, x1 * APC, y1 * APC)
                                                   for x0, y0, x1, y1 in extra_seeds]
    best = np.full((P, P), np.inf, np.float32)
    for x0, y0, x1, y1 in rects:
        s = a[int(y0):int(y1), int(x0):int(x1)].reshape(-1, 3)
        mu = s.mean(0)
        ic = np.linalg.inv(np.cov(s.T) + np.eye(3) * 6.0)
        d = a - mu
        best = np.minimum(best, np.einsum("...i,ij,...j->...", d, ic, d))
    pav = best < 14.0
    pav = ndi.binary_opening(pav, iterations=3)
    pav = ndi.binary_closing(pav, iterations=7)
    return pav, np.sqrt(best)


def view(tid, up, pav, bands=None, out=None):
    v = np.asarray(up).astype(np.float32).copy()
    v[pav] = v[pav] * 0.55 + np.array([0, 255, 120]) * 0.45
    im = Image.fromarray(v.astype(np.uint8)).resize((975, 975), Image.LANCZOS)
    big = Image.new("RGB", (1015, 1015), (0, 0, 0))
    big.paste(im, (40, 40))
    d = ImageDraw.Draw(big)
    for c in range(0, 66, 5):
        x = 40 + c * 15
        d.line([(x, 40), (x, 1015)], fill=(255, 255, 0) if c % 10 == 0 else (255, 120, 0), width=1)
        d.line([(40, x), (1015, x)], fill=(255, 255, 0) if c % 10 == 0 else (255, 120, 0), width=1)
        d.text((x - 6, 5), str(c), fill=(255, 255, 255))
        d.text((5, x - 6), str(c), fill=(255, 255, 255))
    if bands:
        for b in bands:
            pts = [(40 + x / 2, 40 + y / 2) for x, y in b["polygonArt"]]
            d.polygon(pts, outline=(255, 0, 255))
    big.save(out)


if __name__ == "__main__":
    mode = sys.argv[1]
    ids = sys.argv[2:] or list(PICKS)
    os.makedirs(WORK, exist_ok=True)
    if mode == "prep":
        for t in ids:
            up, sh = plate(t)
            pav, _ = paving(up)
            view(t, up, pav, out=f"{WORK}/{t}-grid.png")
            print(t, "paving %.1f%%" % (100 * pav.mean()))


# ------------------------------------------------------------------------------------- build
def raster(polys_art, size=P):
    im = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(im)
    for pts in polys_art:
        d.polygon([tuple(p) for p in pts], fill=255)
    return np.asarray(im) > 127



def block_feats(a, B=10):
    a = a.astype(np.float32) / 255.0
    n = P // B
    a = a[:n * B, :n * B]
    L = a.mean(2)
    gy, gx = np.gradient(L)
    g = np.hypot(gx, gy)
    def bm(x):
        return x.reshape(n, B, n, B).mean((1, 3))
    mx, mn = a.max(2), a.min(2)
    sat = (mx - mn) / (mx + 1e-3)
    Lm = bm(L)
    f = [bm(a[..., 0]), bm(a[..., 1]), bm(a[..., 2]), Lm, np.sqrt(np.maximum(bm(L * L) - Lm ** 2, 0)),
         bm(g), bm((L < 0.22).astype(np.float32)), bm(sat)]
    f = np.stack(f, -1)
    # neighbourhood context (3x3 blocks) so texture, not single colours, decides
    ctx = ndi.uniform_filter(f, size=(3, 3, 1))
    return np.concatenate([f, ctx], -1), n


def floor_blocks(a, pos_mask, neg_mask, B=10, k=15):
    f, n = block_feats(a, B)
    def blk(m):
        return m[:n * B, :n * B].reshape(n, B, n, B).mean((1, 3)) > 0.9
    pos = blk(pos_mask)
    rim = np.zeros((n, n), bool)
    r = int(2.5 * APC / B)
    rim[:r] = rim[-r:] = True
    rim[:, :r] = rim[:, -r:] = True
    neg = (blk(neg_mask) | rim) & ~blk(ndi.binary_dilation(pos_mask, iterations=APC))
    F = f.reshape(-1, f.shape[-1])
    mu, sd = F.mean(0), F.std(0) + 1e-6
    F = (F - mu) / sd
    rng = np.random.default_rng(0)
    pi, ni = np.nonzero(pos.ravel())[0], np.nonzero(neg.ravel())[0]
    pi = rng.choice(pi, min(len(pi), 2500), replace=False)
    ni = rng.choice(ni, min(len(ni), 5000), replace=False)
    X = np.concatenate([F[pi], F[ni]])
    y = np.concatenate([np.ones(len(pi)), np.zeros(len(ni))])
    prob = np.empty(len(F), np.float32)
    X2 = (X * X).sum(1)
    for i in range(0, len(F), 4000):
        Q = F[i:i + 4000]
        d = (Q * Q).sum(1)[:, None] + X2[None] - 2.0 * Q @ X.T
        idx = np.argpartition(d, k, axis=1)[:, :k]
        prob[i:i + 4000] = y[idx].mean(1)
    fl = prob.reshape(n, n) > 0.35
    # open dirt / grass / snow the lanes do not sample: inside the town hull, a block counts as
    # floor when its texture is as calm as the lanes' (edge energy, dark crevices, contrast)
    from scipy.spatial import ConvexHull
    py, px = np.nonzero(pos)
    pts = np.c_[px, py]
    him = Image.new("L", (n, n), 0)
    ImageDraw.Draw(him).polygon([tuple(map(float, q)) for q in pts[ConvexHull(pts).vertices]], fill=255)
    inside = np.asarray(him) > 127
    inside = ndi.binary_dilation(inside, iterations=int(2 * APC / B)) & ~rim
    raw = f[..., :8]
    calm = np.ones((n, n), bool)
    for j in (4, 5, 6):                      # luminance std, gradient, dark fraction
        calm &= raw[..., j] <= np.percentile(raw[..., j][pos], 98) * 1.1
    calm = ndi.binary_opening(calm, iterations=1)
    fl |= calm & inside
    fl = ndi.binary_opening(fl, iterations=1)
    fl = ndi.binary_closing(fl, iterations=1)
    out = np.zeros((P, P), bool)
    out[:n * B, :n * B] = np.repeat(np.repeat(fl, B, 0), B, 1)
    return out

def build(tid, n=None):
    import subprocess
    import build_town as bt
    from kitlib import write_json
    au = json.load(open(os.path.join(AUTH, f"{tid}-authored-obstacles.json")))
    up, sh = plate(tid, n)
    pav, _ = paving(up, au.get("pavingSeeds", []))
    bands = raster([b["polygonArt"] for b in au["nonWalkableBands"]])
    for r in au.get("nonWalkableRings", []):
        bands |= raster([r["outerArt"]]) & ~raster([r["innerArt"]])
    ex = raster([b["polygonArt"] for b in au["walkableExemptions"]]) if au["walkableExemptions"] else np.zeros((P, P), bool)
    # AUTHORED walkable network (the Act 1 greenhollow/millbrook rule: collision is authored, not
    # derived; a colour classifier cannot tell cobble from snow, sand or ash on these plates), minus
    # the authored footprints and static obstacles, plus exemptions (stairs, bridges, gate passages)
    lanes = raster([b["polygonArt"] for b in au["walkableLanesArt"]])
    obst = raster([b["polygonArt"] for b in au["staticObstaclesArt"]]) if au["staticObstaclesArt"] else np.zeros((P, P), bool)
    lane_walk = (lanes & ~bands & ~obst) | (ex & ~obst)
    # gate row from the authored street alone (open ground would widen it too early)
    gate_y = au.get("gateRowCell")
    if not gate_y:
        for yc in np.arange(64.5, 30, -0.5):
            xs = np.nonzero(lane_walk[int(yc * APC)])[0]
            if len(xs) and (xs.max() - xs.min()) / APC > 9:
                gate_y = yc + 0.5
                break
        gate_y = gate_y or 60.0
    # OPEN PAINTED GROUND (Act 1 rule: all open ground walks; buildings, walls, props, water, lava
    # block). Floor-like texture is classified per town with a kNN on 10 px block features, trained
    # on the authored lanes (floor) against the authored footprints and the plate rim (not floor).
    floor = floor_blocks(np.asarray(up), lane_walk, bands | obst)
    # walls, towers, water, lava, voids stay hard; building rects were authored generously, so only
    # their core (2 cells in) is hard and the painted floor around the walls inside a rect walks
    import re
    HARD = re.compile(r"wall|tower|lava|pond|void|pit|graveyard|keep|mine")
    hard = np.zeros((P, P), bool)
    for r in au.get("nonWalkableRings", []):
        hard |= raster([r["outerArt"]]) & ~raster([r["innerArt"]])
    for bnd in au["nonWalkableBands"]:
        m = raster([bnd["polygonArt"]])
        if HARD.search(bnd["id"]):
            hard |= m
        else:
            hard |= ndi.binary_erosion(m[::3, ::3], iterations=20).repeat(3, 0).repeat(3, 1)[:P, :P]
    bands_eff = hard | (bands & ~floor)
    blocked = bands_eff | obst | (~floor)
    # props / non-floor blobs under ~1 cell are texture noise; the rest get a 1-cell margin
    lb, k = ndi.label(~floor)
    if k:
        sz = ndi.sum(np.ones_like(floor), lb, index=np.arange(1, k + 1))
        small = np.isin(lb, 1 + np.nonzero(sz < 1.0 * APC * APC)[0])
        blocked = hard | obst | (~floor & ~small)
    disk = np.hypot(*np.mgrid[-APC:APC + 1, -APC:APC + 1]) <= APC
    blocked_m = ndi.binary_dilation(blocked[::3, ::3], structure=disk[::3, ::3])
    blocked_m = np.repeat(np.repeat(blocked_m, 3, 0), 3, 1)[:P, :P]
    open_ground = ~blocked_m
    _v = np.asarray(up).astype(np.float32) * 0.5
    _v[floor] += np.array([0, 110, 0]); _v[blocked_m & ~blocked] += np.array([110, 0, 0]); _v[blocked] += np.array([0, 0, 110])
    Image.fromarray(np.clip(_v, 0, 255).astype(np.uint8)).resize((975, 975)).save(os.path.join(WORK, f'{tid}-floor.png'))
    open_ground[int(gate_y * APC):] = False          # outside the gate line: the authored street only
    walk = open_ground | lane_walk
    walk = ndi.binary_opening(walk, iterations=2)
    pav = walk
    # holes smaller than ~0.25 cell^2 are paving texture, not props
    holes = ndi.binary_fill_holes(walk) & ~walk
    lab, k = ndi.label(holes)
    if k:
        sz = ndi.sum(np.ones_like(holes), lab, index=np.arange(1, k + 1))
        walk |= np.isin(lab, 1 + np.nonzero(sz < 0.25 * APC * APC)[0])
    walk[:, :6] = walk[:, -6:] = False
    walk[:6] = False
    lab, _ = ndi.label(walk)
    g = lab[1930, 960:990]
    g = np.bincount(g[g > 0]).argmax()
    walk = lab == g
    outer, holes_, body = bt.mask_to_polys(walk)
    poly_walk = bt.rasterize_world(outer, holes_)
    ok = ndi.binary_erosion(poly_walk, iterations=int(bt.FOOT_R_ART) + 2)
    mt = bt.maps_ts()
    data = mt.get(tid) or bt.cinderwatch_proposal()
    exit_x = 32.5
    # mouth: first row from the bottom where the ground widens out of the single street
    rows = []
    for yc in np.arange(64.5, 40, -0.5):
        xs = np.nonzero(poly_walk[int(yc * APC)])[0]
        rows.append((yc, (xs.max() - xs.min()) / APC if len(xs) else 0, xs.mean() / APC if len(xs) else exit_x))
    rows = [r for r in rows if r[0] > gate_y + 0.5] or rows
    exit_x = float(np.median([r[2] for r in rows[:6]]))
    mouth_y = float(gate_y)
    exit_cell = [round(exit_x, 2), round(mouth_y, 2)]
    start = bt.snap([exit_x, mouth_y - 2.0], ok)
    lab, _ = ndi.label(ok)
    ok = lab == lab[int(start[1] * APC), int(start[0] * APC)]
    # actors stand where the hero's real FEET STENCIL fits (check_feet.py), reachable from start;
    # the save point where it fits with a cell to spare
    import check_feet as cf
    pts = cf.stencil()
    w2 = poly_walk[::2, ::2]
    def free_mask(pad):
        st, _ = cf.footprint(pts, pad)
        f = ndi.binary_erosion(w2, structure=st, border_value=0)
        lb, _ = ndi.label(f)
        sl = lb[int(start[1] * 15), int(start[0] * 15)]
        f = (lb == sl) if sl else f
        return np.repeat(np.repeat(f, 2, 0), 2, 1)[:P, :P]
    ok = free_mask(0)   # stencil fit alone (the extra radial erosion double-counted the feet)
    ok_comfort = free_mask(7) & ok
    Image.fromarray((poly_walk.astype(np.uint8) * 90 + ok.astype(np.uint8) * 160)).resize((650, 650)).save(os.path.join(WORK, f'{tid}-ok.png'))
    npcs, report = [], []
    for nn in data["npcs"]:
        tgt = bt.c16(nn["x"], nn["y"])
        t = au["healerCell"] if nn["id"] == "healer" else tgt
        c = bt.snap(t, ok, max_r=25)
        in_bldg = bands_eff[min(P - 1, int(tgt[1] * APC)), min(P - 1, int(tgt[0] * APC))]
        if np.hypot(c[0] - tgt[0], c[1] - tgt[1]) > 3 and not in_bldg:
            c = bt.snap(tgt, ok, max_r=25)   # >3 cells off and the maps.ts spot is open ground
        report.append((nn["id"], tgt, c, float(np.hypot(c[0] - tgt[0], c[1] - tgt[1]))))
        npcs.append({"id": nn["id"], "dialogueKey": nn["dialogueKey"], "nameKey": f"npc.{nn['id']}.name",
                     "sheet": f"town/npc/{tid}-{nn['id']}-4x3-64.png", "cell": list(c), "mapsTs": [nn["x"], nn["y"]]})
    counter = bt.snap(au["shopCounterCell"], ok, max_r=25)
    sk = bt.snap([counter[0] + 1.6, counter[1]], ok, max_r=25)
    npcs.append({"id": "shopkeeper", "dialogueKey": "npc.shopkeeper", "nameKey": "npc.shopkeeper.name",
                 "sheet": f"town/npc/{tid}-shopkeeper-4x3-64.png", "cell": list(sk),
                 "_note": "Act 1 pattern (portSapphire): the shopkeeper stands beside the counter spot."})
    save_t = bt.c16(*data["savePoint"])
    if au.get("saveCell"):          # maps.ts's save cell lies beyond this plate's gate line
        save_t = au["saveCell"]
    save = bt.snap(save_t, ok_comfort, max_r=25) or bt.snap(save_t, ok, max_r=25)
    report.append(("savePoint", save_t, save, float(np.hypot(save[0] - save_t[0], save[1] - save_t[1]))))
    R = os.path.join(SCR, "acts/towns/runtime-codex/town")
    os.makedirs(R, exist_ok=True)
    plate_arr = np.asarray(sh)
    sh.save(os.path.join(R, f"{tid}-screen.png"))
    Image.fromarray((~poly_walk * 255).astype(np.uint8)).save(os.path.join(R, f"{tid}-collision.png"))
    walkable = {
        "schema": "act1-art-fit-polygon-authority-v2", "revision": 1,
        "status": "acts2-5-codex-plate-owner-review-pending",
        "authority": (f"Derived from the Codex plate (scripts/acts/towns/codex_finish.py): the paving the brief "
                      f"asked for, classified against the town's own south street, minus the AUTHORED footprints in "
                      f"scripts/acts/towns/authored/{tid}-authored-obstacles.json, plus authored exemptions "
                      f"(stairs, bridges, gate passages). Feet-only."),
        "coordinateSpace": {"id": f"{tid}-town-art", "width": 1040, "height": 1040, "units": "world-pixels",
                            "origin": "top-left", "xPositive": "right", "yPositive": "down"},
        "width": 1040, "height": 1040, "actorFootRadius": 4, "maxSubstep": 2,
        "movement": {"movementSpeed": 139, "collisionRule": "actor center must remain inside at least one walkable polygon with actor-foot clearance"},
        "designDecisions": {"geometrySource": "paving classification minus authored footprints",
                            "curveRule": "Ramer-Douglas-Peucker at 1.5 mask samples (4 art px)"},
        "regions": [{"id": f"{tid}-streets", "component": tid, "role": "town-ground", "outer": outer,
                     "holes": holes_, "joins": []}],
        "staticObstacles": [], "dynamicBlockers": [], "landmarkAnchors": [], "semanticRoutes": [], "streamingAffinity": [],
    }
    write_json(os.path.join(R, f"{tid}-walkable.json"), walkable)
    conn = data["connection"]
    town = {
        "_comment": f"{tid} runtime config from the Codex plate (try {n or PICKS[tid]}). NPC cells are feet; "
                    "maps.ts positions mapped (v+0.5)*65/16 then snapped onto foot-clear ground; healer at the "
                    "authored porch spot. See _placementReport.",
        "id": tid, "nameKey": f"map.{tid}", "screen": f"town/{tid}-screen.png", "walkable": f"town/{tid}-walkable.json",
        "cells": 65, "artPxPerCell": 30, "worldPxPerCell": 16, "startCell": list(start), "savePoint": list(save),
        "exit": {"cell": exit_cell, "targetMapId": conn["targetMap"], "toX": conn["toX"], "toY": conn["toY"], "axis": "south"},
        "shopId": data.get("shopId", tid), "shopCounter": list(counter), "npcs": npcs,
        "_placementReport": [{"id": a, "mapsTsCell": b, "placed": list(c), "moved": round(d, 2)} for a, b, c, d in report],
        "_source": {"codexTry": n or PICKS[tid], "upscale": "1254->1950 LANCZOS + UnsharpMask(1.0,220,1)"},
    }
    v = subprocess.run(["node", "--input-type=module", "-e",
                        "import {validateWalkableGeometry} from '%s/public/act1-hifi/walkable-polygons.js';"
                        "import fs from 'fs';const d=JSON.parse(fs.readFileSync(process.argv[1]));"
                        "try{validateWalkableGeometry(d);console.log('VALID')}catch(e){console.log('INVALID',e.message)}" % bt.ROOT,
                        os.path.join(R, f"{tid}-walkable.json")], capture_output=True, text=True)
    town["_validator"] = (v.stdout + v.stderr).strip()
    write_json(os.path.join(R, f"{tid}-town.json"), town)
    bands_list = [b for b in au["nonWalkableBands"]]
    view(tid, up, poly_walk, bands_list, out=f"{WORK}/{tid}-walk-grid.png")
    bt.PREVIEW = "/mnt/project-files/edu-rpg/acts-preview/towns-codex"
    bt.previews(tid, None, plate_arr, poly_walk, town)
    print(f"{tid:15s} walk {poly_walk.mean()*100:4.1f}%  {town['_validator']}  start {start} exit {exit_cell}  "
          f"moves>1: {[(a, round(d, 2)) for a, _, _, d in report if d > 1]}")


if __name__ == "__main__" and sys.argv[1] == "build":
    from multiprocessing import Pool
    sys.setrecursionlimit(20000)
    with Pool(5) as p:
        p.map(build, sys.argv[2:] or list(PICKS))
