"""Round-3 finishing of the Codex town plates: pilot-2 method, traced against the PAINTING.

  python3 r3_finish.py [ids]

Plate: picked 1254 px try -> 1950 LANCZOS -> UnsharpMask(1.0, 220, 1) (Act 1 chunk sharpen).
Paint-outs: small tall objects inside the town (palms, spires, posts) are replaced by local ground,
copied from a clean patch beside them (r3_shapes.py "paint": shape + source offset in cells),
with a 4 px feathered edge. Nothing is invented: every replacement pixel exists on the plate.
Collision (feet-only, authored per object in r3_shapes.py, cells):
  walkable = union(ground) - union(block), one component from the gate, polygonised with
  build_town.mask_to_polys and checked with the shipped validateWalkableGeometry. Tall things the
  hero could stand behind have their blocker extended north (no foreground layer).
Actors: every NPC and the save point at a maps.ts 16-grid integer spot (r3_shapes "spots"), which
must lie on stencil-free ground reachable from the gate; town.json "doors" carries the healer's
and shop's landing cells for check_feet.py.
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_town as bt  # noqa: E402
from kitlib import write_json  # noqa: E402
from pilot2 import draw as pdraw, shape_poly_art  # noqa: E402

P, APC = 1950, 30
OLD = "/tmp/claude-0/-home-claude/c446ac0c-2689-576d-8fff-6176ff6d9aad/scratchpad"
SRC = os.path.join(OLD, "acts/codex-towns-r3/out")
RT = os.path.join(OLD, "acts/towns/runtime-codex-r3/town")
PREV = "/mnt/project-files/edu-rpg/acts-preview/towns-codex/r3"
SPOTS = "/mnt/project-files/edu-rpg/codex-gen/towns-r3/npc-spots-r3.json"
PICKS = dict(ironkeep=1, frostwatch=1, hauntedVillage=3, oasisHaven=2, ruinsCamp=3, embersRest=3,
             cinderwatch=2, lastBastion=2, havensEdge=2)
ACTS = {2: ["ironkeep", "frostwatch", "hauntedVillage"], 3: ["oasisHaven", "ruinsCamp"],
        4: ["embersRest", "cinderwatch"], 5: ["lastBastion", "havensEdge"]}


def c16(v):
    return round((v + 0.5) * 65 / 16, 2)


def plate(tid):
    im = Image.open(f"{SRC}/town-{tid}/town-{tid}-try{PICKS[tid]}.png").convert("RGB")
    return im.resize((P, P), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.0, 220, 1))


def paint_out(a, items):
    """Replace each shape with the plate's own pixels from (dx, dy) cells away, feathered edge."""
    a = a.astype(np.float32)
    for _, shape, (dx, dy) in items:
        m = pdraw([shape]).astype(np.float32)
        m = ndi.gaussian_filter(m, 2.0)
        sx, sy = int(round(dx * APC)), int(round(dy * APC))
        src = np.roll(np.roll(a, -sy, 0), -sx, 1)
        a = a * (1 - m[..., None]) + src * m[..., None]
    return np.clip(a, 0, 255).astype(np.uint8)


def font(n):
    return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", n)



NOSNAP = ("x-", "wall-", "edge", "strip", "cliff", "bank", "post-", "fence", "rail")
GROW = ("pond", "reed", "bed", "garden", "graveyard", "graves", "pit", "void", "planter", "shrub", "bush")


def snap_block(pl, shapes):
    """Seed polygons -> object masks snapped to the painted pixels (GrabCut per object).
    sure FG = the seed's core; probable FG = the seed; probable BG = a 1.2-cell ring outside it
    (so an object may grow out to its real painted edge, e.g. reeds round a pond); sure BG beyond.
    Lines (walls, fences) and edge strips keep their authored shape so they stay continuous."""
    import cv2
    img = np.ascontiguousarray(pl[..., ::-1])
    out = np.zeros((P, P), bool)
    ring = int(1.2 * APC)
    for name, sh in shapes:
        seed = pdraw([sh])
        if sh[0] == "line" or name.startswith(NOSNAP) or not seed.any():
            out |= seed
            continue
        ys, xs = np.nonzero(seed)
        y0, y1 = max(0, ys.min() - ring - 4), min(P, ys.max() + ring + 5)
        x0, x1 = max(0, xs.min() - ring - 4), min(P, xs.max() + ring + 5)
        sd = seed[y0:y1, x0:x1]
        h, w = ys.max() - ys.min() + 1, xs.max() - xs.min() + 1
        er = int(max(0.25 * APC, 0.3 * min(h, w)))
        core = ndi.binary_erosion(sd, iterations=er)
        if core.sum() < 20:
            out |= seed
            continue
        dil = ndi.binary_dilation(sd, iterations=ring)
        m = np.full(sd.shape, cv2.GC_BGD, np.uint8)
        m[dil] = cv2.GC_PR_BGD
        m[sd] = cv2.GC_PR_FGD
        m[core] = cv2.GC_FGD
        bg, fg = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
        try:
            cv2.grabCut(np.ascontiguousarray(img[y0:y1, x0:x1]), m, None, bg, fg, 5, cv2.GC_INIT_WITH_MASK)
        except cv2.error:
            out[y0:y1, x0:x1] |= sd
            continue
        res = (m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)
        res = ndi.binary_opening(res, iterations=2)
        lb, k = ndi.label(res)
        keep = np.unique(lb[core & (lb > 0)])
        res = np.isin(lb, keep) | core
        res = ndi.binary_fill_holes(res)
        if name.startswith(GROW):          # water, lava, reeds, gardens: never smaller than the seed
            res |= sd
        out[y0:y1, x0:x1] |= res
    # drop blocked specks under 0.2 cell^2 that are not authored lines
    return out

def build(tid):
    from r3_shapes import TOWNS
    T = TOWNS[tid]
    pl = np.asarray(plate(tid))
    if T.get("paint"):
        pl = paint_out(pl, T["paint"])
    ground = pdraw([s for _, s in T["ground"]])
    block = snap_block(pl, T["block"])
    walk = ground & ~block
    # light clean: walkable specks / slivers under 0.2 cell^2 go (the feet stencil closes thin gaps)
    lab, k = ndi.label(~walk & ground)
    if k:
        sz = ndi.sum(np.ones_like(walk), lab, index=np.arange(1, k + 1))
        walk |= np.isin(lab, 1 + np.nonzero(sz < 0.2 * APC * APC)[0])
    lab, _ = ndi.label(walk)
    gx = int(32.5 * APC)
    g = lab[P - 20, gx - 60:gx + 60]
    walk = lab == np.bincount(g[g > 0]).argmax()
    outer, holes_, _ = bt.mask_to_polys(walk)
    poly_walk = bt.rasterize_world(outer, holes_)

    import check_feet as ck
    pts = ck.stencil()
    w2 = poly_walk[::2, ::2]
    gate_y = T["gate_y"]
    start = [32.5, gate_y - 2.0]

    def free_mask(pad):
        st, _ = ck.footprint(pts, pad)
        f = ndi.binary_erosion(w2, structure=st, border_value=0)
        lb, _ = ndi.label(f)
        sl = lb[int(63.5 * 15), int(32.5 * 15)]
        return np.repeat(np.repeat(lb == sl, 2, 0), 2, 1)[:P, :P] if sl else np.zeros((P, P), bool)
    ok = free_mask(0)
    ok_c = free_mask(7)
    start = list(bt.snap(start, ok_c, max_r=4) or bt.snap(start, ok, max_r=6))
    data = bt.maps_ts().get(tid) or bt.cinderwatch_proposal()
    npcs, report = [], []

    def on(m, c):
        return bool(m[int(c[1] * APC), int(c[0] * APC)])
    for nn in data["npcs"]:
        v = T["spots"][nn["id"]]
        c = [c16(v[0]), c16(v[1])]
        report.append(dict(id=nn["id"], mapsTs=[nn["x"], nn["y"]], new=list(v), moved=list(v) != [nn["x"], nn["y"]],
                           cell=c, onGround=on(ok, c)))
        npcs.append({"id": nn["id"], "dialogueKey": nn["dialogueKey"], "nameKey": f"npc.{nn['id']}.name",
                     "sheet": f"town/npc/{tid}-{nn['id']}-4x3-64.png", "cell": c, "mapsTs": list(v)})
    sv = T["save"]
    save = [c16(sv[0]), c16(sv[1])]
    report.append(dict(id="savePoint", mapsTs=list(data["savePoint"]), new=list(sv),
                       moved=list(sv) != list(data["savePoint"]), cell=save, onGround=on(ok_c, save)))
    counter = list(T["doors"]["shop"])
    sk = T.get("shopkeeper") or [counter[0], counter[1] - 1.7]
    npcs.append({"id": "shopkeeper", "dialogueKey": "npc.shopkeeper", "nameKey": "npc.shopkeeper.name",
                 "sheet": f"town/npc/{tid}-shopkeeper-4x3-64.png", "cell": list(sk),
                 "_note": "behind the painted counter; the hero talks across it from shopCounter"})

    os.makedirs(RT, exist_ok=True)
    Image.fromarray(pl).save(os.path.join(RT, f"{tid}-screen.png"))
    Image.fromarray((~poly_walk * 255).astype(np.uint8)).save(os.path.join(RT, f"{tid}-collision.png"))
    write_json(os.path.join(HERE, "authored", f"{tid}-r3-authored-obstacles.json"), {
        "schema": "act1-authored-obstacles-v1-cells", "town": tid, "cellArtPx": APC, "codexTry": PICKS[tid],
        "groundArt": [{"id": n, "polygonArt": shape_poly_art(s)} for n, s in T["ground"]],
        "nonWalkableBands": [dict({"id": n, "polygonArt": shape_poly_art(s)},
                                  **({"widthArt": s[1] * APC} if s[0] == "line" else {})) for n, s in T["block"]],
        "paintedOut": [{"id": n, "polygonArt": shape_poly_art(s), "sourceOffsetCells": list(o)}
                       for n, s, o in T.get("paint", [])],
    })
    walkable = {
        "schema": "act1-art-fit-polygon-authority-v2", "revision": 3, "status": "acts2-5-r3-owner-review-pending",
        "authority": (f"AUTHORED per object against the round-3 Codex plate (try {PICKS[tid]}): "
                      f"scripts/acts/towns/r3_shapes.py -> authored/{tid}-r3-authored-obstacles.json. Feet-only; "
                      "tall objects blocked far enough north that the hero cannot stand behind them."),
        "coordinateSpace": {"id": f"{tid}-town-art", "width": 1040, "height": 1040, "units": "world-pixels",
                            "origin": "top-left", "xPositive": "right", "yPositive": "down"},
        "width": 1040, "height": 1040, "actorFootRadius": 4, "maxSubstep": 2,
        "movement": {"movementSpeed": 139, "collisionRule": "actor center must remain inside at least one walkable polygon with actor-foot clearance"},
        "designDecisions": {"geometrySource": "hand-authored ground minus hand-authored object bases",
                            "curveRule": "Ramer-Douglas-Peucker at 1.5 mask samples (4 art px)"},
        "regions": [{"id": f"{tid}-ground", "component": tid, "role": "town-ground", "outer": outer,
                     "holes": holes_, "joins": []}],
        "staticObstacles": [], "dynamicBlockers": [], "landmarkAnchors": [], "semanticRoutes": [], "streamingAffinity": [],
    }
    write_json(os.path.join(RT, f"{tid}-walkable.json"), walkable)
    conn = data["connection"]
    town = {
        "_comment": f"{tid} round-3 runtime config (Codex try {PICKS[tid]}); collision hand-traced per object, "
                    "no foreground layer.",
        "id": tid, "nameKey": f"map.{tid}", "screen": f"town/{tid}-screen.png", "walkable": f"town/{tid}-walkable.json",
        "cells": 65, "artPxPerCell": 30, "worldPxPerCell": 16, "startCell": start, "savePoint": save,
        "exit": {"cell": [32.5, gate_y], "targetMapId": conn["targetMap"], "toX": conn["toX"], "toY": conn["toY"],
                 "axis": "south"},
        "shopId": data.get("shopId", tid), "shopCounter": counter, "npcs": npcs,
        "doors": [{"id": k, "cell": list(v)} for k, v in T["doors"].items()],
        "_spots": report,
        "_paintedOut": [n for n, _, _ in T.get("paint", [])],
    }
    v = subprocess.run(["node", "--input-type=module", "-e",
                        "import {validateWalkableGeometry} from '%s/public/act1-hifi/walkable-polygons.js';"
                        "import fs from 'fs';const d=JSON.parse(fs.readFileSync(process.argv[1]));"
                        "try{validateWalkableGeometry(d);console.log('VALID')}catch(e){console.log('INVALID',e.message)}" % bt.ROOT,
                        os.path.join(RT, f"{tid}-walkable.json")], capture_output=True, text=True)
    town["_validator"] = (v.stdout + v.stderr).strip()
    # gate is the only exit: walkable may reach the frame only along the bottom edge near the gate
    e = poly_walk.copy()
    e[4:-4, 4:-4] = False
    ys, xs = np.nonzero(e)
    away = [(y, x) for y, x in zip(ys, xs) if not (y >= P - 4 and 26 * APC < x < 39 * APC)]
    below = poly_walk[int((gate_y + 1) * APC):]
    bx = np.nonzero(below.any(0))[0]
    town["_onlyExit"] = bool(not away and len(bx) and bx.min() > 26 * APC and bx.max() < 39 * APC)
    write_json(os.path.join(RT, f"{tid}-town.json"), town)
    previews(tid, pl, poly_walk, town, T)
    inside = pdraw([s for _, s in T["ground"]])
    town["_qa"] = dict(zip(("blockedLooksGroundPx", "walkableLooksObjectPx"), qa(tid, pl, poly_walk, inside)))
    write_json(os.path.join(RT, f"{tid}-town.json"), town)
    bad = [r["id"] for r in report if not r["onGround"]]
    print(f"{tid:15s} walk {poly_walk.mean() * 100:4.1f}% {town['_validator']} onlyExit={town['_onlyExit']} QA={town['_qa']} "
          f"spots-off-ground={bad} moved={[(r['id'], r['mapsTs'], r['new']) for r in report if r['moved']]}")
    return tid, report



def qa(tid, pl, walk, inside):
    """QA ONLY (never sets a boundary): a per-town 'looks like open ground' map from texture and
    colour (kNN on 6 px blocks, trained on the CORES of the authored walkable and blocked areas),
    then flags, inside the town edge: blocked pixels that look like ground, and walkable pixels that
    look like an object (water, reeds, plants, rock, props). Specks under 0.15 cell^2 are texture
    noise. Returns (looks-ground-but-blocked px, looks-object-but-walkable px)."""
    B = 6
    n = P // B
    a = pl[:n * B, :n * B].astype(np.float32) / 255.0
    Lm = a.mean(2)
    gy, gx = np.gradient(Lm)
    g = np.hypot(gx, gy)

    def bm(x):
        return x.reshape(n, B, n, B).mean((1, 3))
    mx, mn = a.max(2), a.min(2)
    Lb = bm(Lm)
    f = np.stack([bm(a[..., 0]), bm(a[..., 1]), bm(a[..., 2]), Lb, np.sqrt(np.maximum(bm(Lm * Lm) - Lb ** 2, 0)),
                  bm(g), bm((mx - mn) / (mx + 1e-3)), bm(a[..., 1] - a[..., 0]), bm(a[..., 2] - a[..., 0])], -1)
    f = np.concatenate([f, ndi.uniform_filter(f, size=(3, 3, 1)), ndi.uniform_filter(f, size=(7, 7, 1))], -1)
    F = f.reshape(-1, f.shape[-1])
    F = (F - F.mean(0)) / (F.std(0) + 1e-6)

    def blk(m):
        return m[:n * B, :n * B].reshape(n, B, n, B).mean((1, 3))
    ins = blk(inside) > 0.99
    wk = blk(walk)
    core_w = ndi.binary_erosion(wk > 0.99, iterations=3)
    core_b = ndi.binary_erosion((wk < 0.01) & ins, iterations=3)
    # the training sample is frozen per town (first run, or QA_RETRAIN=1) so counts compare across edits
    tp = os.path.join(RT, f"{tid}-qatrain.npz")
    if os.path.exists(tp) and not os.environ.get("QA_RETRAIN"):
        z = np.load(tp)
        pi, ni = z["pi"], z["ni"]
    else:
        rng = np.random.default_rng(0)
        pi = np.nonzero(core_w.ravel())[0]
        ni = np.nonzero(core_b.ravel())[0]
        pi = rng.choice(pi, min(len(pi), 6000), replace=False)
        ni = rng.choice(ni, min(len(ni), 6000), replace=False)
        np.savez(tp, pi=pi, ni=ni)
    X = np.concatenate([F[pi], F[ni]])
    y = np.concatenate([np.ones(len(pi)), np.zeros(len(ni))])
    X2 = (X * X).sum(1)
    prob = np.empty(len(F), np.float32)
    for i in range(0, len(F), 4000):
        Q = F[i:i + 4000]
        d = (Q * Q).sum(1)[:, None] + X2[None] - 2.0 * Q @ X.T
        idx = np.argpartition(d, 15, axis=1)[:, :15]
        prob[i:i + 4000] = y[idx].mean(1)
    pg = prob.reshape(n, n)
    ground_blocked = ins & (wk < 0.5) & (pg > 0.85)
    object_walk = ins & (wk > 0.5) & (pg < 0.15)
    out = []
    # a blocked ground-look patch only counts when it touches the walkable area (an over-wide blocker);
    # snow lying on a roof, enclosed by the roof, is not open ground
    lb, k = ndi.label(ground_blocked)
    if k:
        touch = np.unique(lb[ndi.binary_dilation(wk > 0.5, iterations=1) & (lb > 0)])
        ground_blocked = np.isin(lb, touch)
    for m in (ground_blocked, object_walk):
        lb, k = ndi.label(m)
        if k:
            sz = ndi.sum(np.ones_like(m), lb, index=np.arange(1, k + 1))
            m = np.isin(lb, 1 + np.nonzero(sz * B * B >= 0.15 * APC * APC)[0])
        full = np.zeros((P, P), bool)
        full[:n * B, :n * B] = np.repeat(np.repeat(m, B, 0), B, 1)
        out.append(full)
    gb, ow = out
    Image.fromarray((np.dstack([gb, np.zeros_like(gb), ow]) * 255).astype(np.uint8)).save(os.path.join(RT, f"{tid}-qaflags.png"))  # R = blocked-looks-ground, B = walkable-looks-object
    v = pl.astype(np.float32) * 0.55
    v[walk] = v[walk] * 0.8 + np.array([40, 200, 90]) * 0.2 / 0.55 * 0.55
    v[gb] = (255, 0, 255)
    v[ow] = (255, 0, 255)
    e = walk ^ ndi.binary_erosion(walk, iterations=2)
    v[e] = (255, 255, 255)
    im = Image.fromarray(np.clip(v, 0, 255).astype(np.uint8)).resize((1300, 1300), Image.LANCZOS)
    dr = ImageDraw.Draw(im)
    dr.text((14, 10), f"{tid} QA: magenta = blocked-but-looks-ground {int(gb.sum())} px, "
                      f"walkable-but-looks-object {int(ow.sum())} px", font=font(24), fill=(255, 255, 0),
            stroke_width=3, stroke_fill=(0, 0, 0))
    os.makedirs(PREV, exist_ok=True)
    im.save(os.path.join(PREV, f"{tid}-qa.jpg"), quality=88)
    return int(gb.sum()), int(ow.sum())

def overlay(pl, walk, town):
    ov = pl.astype(np.float32).copy()
    ov[walk] = ov[walk] * 0.72 + np.array([40, 230, 90]) * 0.28
    hatch = ((np.add.outer(np.arange(P), np.arange(P)) // 6) % 4 == 0)
    blk = ~walk & hatch
    ov[blk] = ov[blk] * 0.45 + np.array([230, 40, 40]) * 0.55
    ov[walk ^ ndi.binary_erosion(walk, iterations=2)] = (255, 255, 255)
    o = Image.fromarray(np.clip(ov, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(o)
    f = font(24)
    ex, ey = town["exit"]["cell"]
    d.line([((ex - 3) * APC, ey * APC), ((ex + 3) * APC, ey * APC)], fill=(255, 220, 0), width=7)
    hero = Image.open(bt.HERO).crop((0, 0, 64, 64)).resize((68, 68), Image.NEAREST)
    sx, sy = town["startCell"]
    o.paste(hero, (int(sx * APC - 34), int(sy * APC - 66)), hero)
    marks = [(n["id"], n["cell"], (80, 170, 255)) for n in town["npcs"]]
    marks += [("SAVE", town["savePoint"], (255, 255, 255))]
    marks += [("DOOR:" + dd["id"], dd["cell"], (255, 170, 40)) for dd in town["doors"]]
    for name, (cx, cy), col in marks:
        x, y = cx * APC, cy * APC
        d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=col, outline=(0, 0, 0), width=3)
        d.text((x + 12, y - 12), name, fill=col, font=f, stroke_width=3, stroke_fill=(0, 0, 0))
    return o


def previews(tid, pl, walk, town, T):
    os.makedirs(PREV, exist_ok=True)
    Image.fromarray(pl).save(os.path.join(PREV, f"{tid}-plate.jpg"), quality=92)
    o = overlay(pl, walk, town)
    o.resize((1300, 1300), Image.LANCZOS).save(os.path.join(PREV, f"{tid}-overlay.jpg"), quality=88)
    for name, (x0, y0, x1, y1) in T["zoom"].items():
        c = o.crop((int(x0 * APC), int(y0 * APC), int(x1 * APC), int(y1 * APC)))
        c.resize((c.width * 2, c.height * 2), Image.LANCZOS).save(
            os.path.join(PREV, f"{tid}-zoom-{name}.jpg"), quality=86)


def act_sheets():
    for a, ids in ACTS.items():
        W = 1000
        s = Image.new("RGB", (len(ids) * (W + 10) + 10, W + 70), (16, 16, 18))
        d = ImageDraw.Draw(s)
        for i, t in enumerate(ids):
            p = os.path.join(PREV, f"{t}-overlay.jpg")
            if not os.path.exists(p):
                continue
            x = 10 + i * (W + 10)
            s.paste(Image.open(p).resize((W, W), Image.LANCZOS), (x, 60))
            tj = json.load(open(os.path.join(RT, f"{t}-town.json")))
            d.text((x, 14), f"Act {a} - {t} (r3 try{PICKS[t]})  {tj['_validator']}", font=font(26), fill=(255, 220, 90))
        s.save(os.path.join(PREV, f"act{a}-towns-r3.jpg"), quality=88)


def update_spots(results):
    doc = json.load(open(SPOTS))
    doc.setdefault("_history", "plan (r3_plans.py) -> traced against the painting (r3_finish.py)")
    for tid, rep in results:
        pj = os.path.join(os.path.dirname(SPOTS), "plans", f"{tid}-plan.json")
        plan = {s["id"]: s for s in json.load(open(pj))["spots"]}
        doc["towns"][tid] = [dict(id=r["id"], mapsTs=r["mapsTs"], new=r["new"], moved=r["moved"], cell=r["cell"],
                                  planSpot=plan.get(r["id"], {}).get("new"),
                                  movedFromPlan=plan.get(r["id"], {}).get("new") not in (None, r["new"]))
                             for r in rep]
    json.dump(doc, open(SPOTS, "w"), indent=1)


if __name__ == "__main__":
    from multiprocessing import Pool
    ids = sys.argv[1:] or list(PICKS)
    with Pool(min(5, len(ids))) as p:
        res = p.map(build, ids)
    update_spots(res)
    act_sheets()
