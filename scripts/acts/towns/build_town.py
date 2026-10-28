#!/usr/bin/env python3
"""Build one or more Acts 2-5 towns end to end: plate, collision, actors, runtime JSON, previews.

    python3 scripts/acts/towns/build_town.py               # all nine
    python3 scripts/acts/towns/build_town.py frostwatch    # one

Outputs (never inside public/ or dist/ -- design must be locked before any runtime wiring):
  $SCRATCH/runtime/town/<id>-screen.png       1950x1950 RGB plate, same contract as Act 1
  $SCRATCH/runtime/town/<id>-walkable.json    act1-art-fit-polygon-authority-v2, world px (1040)
  $SCRATCH/runtime/town/<id>-town.json        Act 1 town config shape (cells, npcs, services, exit)
  $SCRATCH/runtime/town/<id>-collision.png    plate-res blocked mask (evidence)
  $PREVIEW/<id>-plate.png                     full-res plate (palette-reduced only if > 4 MB)
  $PREVIEW/<id>-overlay.png                   walkable/blocked/gate/actor overlay at half res
"""
import json
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
import derive_town_walkable as dtw  # noqa: E402  (trace / simplify / ring_area, read-only reuse)

def _rdp(points, eps):
    """derive_town_walkable.rdp with a 2-D cross product (numpy 2 removed 2-D np.cross)."""
    if len(points) < 3:
        return list(points)
    a, b = np.array(points[0], float), np.array(points[-1], float)
    ab = b - a
    n = np.hypot(*ab)
    pts = np.array(points, float)
    if n < 1e-9:
        d = np.hypot(*(pts - a).T)
    else:
        d = np.abs(ab[0] * (pts[:, 1] - a[1]) - ab[1] * (pts[:, 0] - a[0])) / n
    i = int(d.argmax())
    if d[i] > eps:
        return _rdp(points[:i + 1], eps)[:-1] + _rdp(points[i:], eps)
    return [points[0], points[-1]]


dtw.rdp = _rdp
sys.setrecursionlimit(20000)

from compose import APC, PLATE, compose  # noqa: E402
from grade import grade  # noqa: E402
from kitlib import PREVIEW, ROOT, SCRATCH, WORLD, write_json  # noqa: E402
from layouts import TOWNS, c16  # noqa: E402

RUNTIME = os.path.join(SCRATCH, "runtime", "town")
ART_TO_WORLD = WORLD / PLATE            # 1040 / 1950
FOOT_R_ART = 4 / ART_TO_WORLD           # actorFootRadius 4 world px -> 7.5 art px
SAMPLE = 4                              # art px per mask sample (derive_town_walkable default)


def maps_ts():
    """Parse src/data/maps.ts town entries: npcs, savePoint, shopId, connection."""
    src = open(os.path.join(ROOT, "src/data/maps.ts")).read()
    out = {}
    for m in re.finditer(r"\n  (\w+): \{\n    id: '(\w+)',(.*?)\n  \},", src, re.S):
        body = m.group(3)
        if "type: 'town'" not in body:
            continue
        npcs = [dict(id=a, dialogueKey=b, x=int(c), y=int(d)) for a, b, c, d in
                re.findall(r"\{ id: '(\w+)', dialogueKey: '([\w.]+)', x: (\d+), y: (\d+) \}", body)]
        conn = re.search(r"targetMap: '(\w+)', fromX: (\d+), fromY: (\d+), toX: (\d+), toY: (\d+)", body)
        sp = re.search(r"savePoint: \{ x: (\d+), y: (\d+) \}", body)
        shop = re.search(r"shopId: '(\w+)'", body)
        out[m.group(2)] = {"npcs": npcs,
                           "connection": dict(zip(["targetMap", "fromX", "fromY", "toX", "toY"],
                                                  [conn.group(1)] + [int(v) for v in conn.groups()[1:]])),
                           "savePoint": [int(sp.group(1)), int(sp.group(2))],
                           "shopId": shop.group(1) if shop else None}
    return out


def cinderwatch_proposal():
    """Cinderwatch has NO maps.ts entry (owner named it 2026-07-29; never implemented). This is a
    PROPOSAL in the same shape so the town can be designed and reviewed; ids are new."""
    return {"npcs": [dict(id="healer", dialogueKey="npc.healer", x=3, y=12),
                     dict(id="watchCaptain", dialogueKey="npc.watchCaptain", x=3, y=5),
                     dict(id="ashScout", dialogueKey="npc.ashScout", x=12, y=5),
                     dict(id="cinderVillager", dialogueKey="npc.cinderVillager", x=8, y=8)],
            "connection": {"targetMap": "overworld", "fromX": 8, "fromY": 15, "toX": None, "toY": None},
            "savePoint": [8, 10], "shopId": "cinderwatch", "proposal": True}


def mask_to_polys(walk):
    """Plate-res walkable -> (outer ring, holes) in world px via derive_town_walkable's tracer."""
    h = PLATE // SAMPLE
    m = walk[:h * SAMPLE, :h * SAMPLE].reshape(h, SAMPLE, h, SAMPLE).mean((1, 3)) > 0.5
    # drop one-sample necks and diagonal-only touches: the tracer turns those into rings that
    # touch themselves, which the runtime validator rejects (too thin for a 4-px foot anyway)
    m = ndi.binary_opening(m, structure=ndi.generate_binary_structure(2, 1))
    lab, n = ndi.label(m)
    if n == 0:
        raise SystemExit("no walkable ground")
    sizes = ndi.sum(np.ones_like(m), lab, index=np.arange(1, n + 1))
    body = lab == (1 + int(sizes.argmax()))
    body = ndi.binary_fill_holes(body) & body | (ndi.binary_fill_holes(body) & ~body & False)
    ys, xs = np.nonzero(body)
    start = (int(ys.min()), int(xs[ys == ys.min()].min()))
    outer, _ = dtw.simplify([(x, y) for y, x in dtw.trace(body, start)], 1.5)
    holes = []
    filled = ndi.binary_fill_holes(body)
    hl, hn = ndi.label(filled & ~body)
    for i in range(1, hn + 1):
        hm = hl == i
        if hm.sum() < 6:
            continue
        hy, hx = np.nonzero(hm)
        ring, _ = dtw.simplify([(x, y) for y, x in dtw.trace(hm, (int(hy.min()), int(hx[hy == hy.min()].min())))], 1.5)
        if len(ring) >= 3 and abs(dtw.ring_area(ring)) > 1.0:
            holes.append(ring)
    if dtw.ring_area(outer) < 0:
        outer = outer[::-1]
    holes = [hh if dtw.ring_area(hh) > 0 else hh[::-1] for hh in holes]
    k = SAMPLE * ART_TO_WORLD

    def w(ring):
        return [{"x": round(x * k, 1), "y": round(y * k, 1)} for x, y in ring]
    return w(outer), [w(hh) for hh in holes], body


def rasterize_world(outer, holes):
    im = Image.new("L", (PLATE, PLATE), 0)
    d = ImageDraw.Draw(im)
    s = 1 / ART_TO_WORLD
    d.polygon([(p["x"] * s, p["y"] * s) for p in outer], fill=255)
    for hh in holes:
        d.polygon([(p["x"] * s, p["y"] * s) for p in hh], fill=0)
    return np.asarray(im) > 127


def snap(cell, ok, max_r=6.0, prefer=None):
    """Nearest cell (in 1/8 cell steps) whose foot point is inside the eroded walkable area."""
    cx, cy = cell
    best = None
    for r in np.arange(0, max_r + 1e-6, 0.125):
        for a in np.linspace(0, 2 * np.pi, max(1, int(8 * r * 4)), endpoint=False):
            x, y = round((cx + r * np.cos(a)) * 8) / 8, round((cy + r * np.sin(a)) * 8) / 8
            xi, yi = int(x * APC), int(y * APC)
            if 0 <= xi < PLATE and 0 <= yi < PLATE and ok[yi, xi]:
                if prefer is None or prefer[yi, xi]:
                    best = (round(x * 8) / 8, round(y * 8) / 8)
                    break
        if best:
            break
    return best


def build(tid):
    lay = dict(TOWNS[tid])
    mt = maps_ts()
    data = mt.get(tid) or (cinderwatch_proposal() if tid == "cinderwatch" else None)
    # actor targets straight from maps.ts (16x16 -> 65 cells)
    targets = {n["id"]: c16(n["x"], n["y"]) for n in data["npcs"]}
    save_t = c16(*data["savePoint"])
    exit_x = c16(data["connection"]["fromX"], 0)[0]
    lay["exit"] = [exit_x, 65]
    lay["_avoid"] = list(targets.values()) + [save_t, [exit_x, 60]] + \
        [[b["at"][0], b["at"][1] + 1.5] for b in lay["buildings"] if b.get("role") in ("shop", "healer")]

    comp = compose(lay)
    plate = grade(comp, lay).astype(np.uint8)

    # ---------------- collision: feet-only. Walkable = ground inside the ring, minus every
    # authored footprint (building silhouettes, tree/rock bases, water, border), plus the trail
    # out of the mouth to the bottom edge.
    yy = np.arange(PLATE)[:, None] * np.ones((1, PLATE))
    mouth_trail = comp["lanes"] & (yy > PLATE * 0.6)
    walk = (comp["inside"] | mouth_trail) & ~comp["block"] & ~comp["border"]
    walk[:, :6] = walk[:, -6:] = False
    walk[:6] = False
    outer, holes, body = mask_to_polys(walk)
    poly_walk = rasterize_world(outer, holes)
    ok = ndi.binary_erosion(poly_walk, iterations=int(FOOT_R_ART) + 2)
    lane_ok = ok & comp["lanes"]

    # ---------------- exit = the mouth: first row (from the bottom up) where reachable ground
    # widens out of the single trail, as Act 1 measured it
    trail_rows = []
    for yc in np.arange(64.5, 40, -0.5):
        row = poly_walk[int(yc * APC)]
        xs = np.nonzero(row)[0]
        trail_rows.append((yc, (xs.max() - xs.min()) / APC if len(xs) else 0))
    mouth_y = next((yc for yc, wd in trail_rows if wd > 9), 60.0) + 0.5
    exit_cell = [exit_x, round(mouth_y, 2)]
    start_cell = snap([exit_x, mouth_y - 2.0], ok)
    # Act 1 rule (place_town_actors.py): every actor must be reachable from startCell, so snap
    # only onto the start's connected component of foot-clear ground
    _lab, _ = ndi.label(ok)
    ok = _lab == _lab[int(start_cell[1] * APC), int(start_cell[0] * APC)]

    npcs, report = [], []
    shop_b = next(b for b in lay["buildings"] if b.get("role") == "shop")
    heal_b = next(b for b in lay["buildings"] if b.get("role") == "healer")
    for n in data["npcs"]:
        t = targets[n["id"]]
        c = snap(t, ok, prefer=None) or t
        report.append((n["id"], targets[n["id"]], c, float(np.hypot(c[0] - targets[n["id"]][0], c[1] - targets[n["id"]][1]))))
        npcs.append({"id": n["id"], "dialogueKey": n["dialogueKey"], "nameKey": f"npc.{n['id']}.name",
                     "sheet": f"town/npc/{tid}-{n['id']}-4x3-64.png", "cell": list(c),
                     "mapsTs": [n["x"], n["y"]]})
    sk = snap([shop_b["at"][0], shop_b["at"][1] + 1.0], ok)
    npcs.append({"id": "shopkeeper", "dialogueKey": "npc.shopkeeper", "nameKey": "npc.shopkeeper.name",
                 "sheet": f"town/npc/{tid}-shopkeeper-4x3-64.png", "cell": list(sk),
                 "_note": "Act 1 pattern: the shopkeeper stands on the lane in front of his stall."})
    counter = snap([shop_b["at"][0] - 1.8, shop_b["at"][1] + 1.0], ok)
    save = snap(save_t, ok)
    report.append(("savePoint", save_t, save, float(np.hypot(save[0] - save_t[0], save[1] - save_t[1]))))

    # reachability from start
    lab, _ = ndi.label(ok)
    sl = lab[int(start_cell[1] * APC), int(start_cell[0] * APC)]
    unreach = [nm for nm, _, c, _ in report if lab[int(c[1] * APC), int(c[0] * APC)] != sl]
    if lab[int(counter[1] * APC), int(counter[0] * APC)] != sl:
        unreach.append("shopCounter")

    os.makedirs(RUNTIME, exist_ok=True)
    Image.fromarray(plate).save(os.path.join(RUNTIME, f"{tid}-screen.png"))
    Image.fromarray((~poly_walk * 255).astype(np.uint8)).save(os.path.join(RUNTIME, f"{tid}-collision.png"))
    walkable = {
        "schema": "act1-art-fit-polygon-authority-v2", "revision": 1,
        "status": "acts2-5-design-preview-owner-review-pending",
        "authority": (f"Composed by scripts/acts/towns/build_town.py from the Act 1 kit. Collision is "
                      f"the composition's own footprints (building silhouettes, tree/rock bases, water, "
                      f"border cliffs), so art and collision agree by construction. Feet-only."),
        "coordinateSpace": {"id": f"{tid}-town-art", "width": WORLD, "height": WORLD, "units": "world-pixels",
                            "origin": "top-left", "xPositive": "right", "yPositive": "down"},
        "width": WORLD, "height": WORLD, "actorFootRadius": 4, "maxSubstep": 2,
        "movement": {"movementSpeed": 139,
                     "movementSpeedNote": "Copied from the Act 1 towns (owner 2026-08-14: 260 was way too fast).",
                     "collisionRule": "actor center must remain inside at least one walkable polygon with actor-foot clearance"},
        "designDecisions": {"geometrySource": "composition footprints (scripts/acts/towns/compose.py)",
                            "curveRule": "Ramer-Douglas-Peucker at 1.5 mask samples (4 art px)"},
        "regions": [{"id": f"{tid}-streets", "component": tid, "role": "town-ground", "outer": outer,
                     "holes": holes, "joins": []}],
        "staticObstacles": [], "dynamicBlockers": [], "landmarkAnchors": [],
        "semanticRoutes": [], "streamingAffinity": [],
    }
    write_json(os.path.join(RUNTIME, f"{tid}-walkable.json"), walkable)
    conn = data["connection"]
    town = {
        "_comment": (f"{lay['title']} runtime config, DESIGN PREVIEW (not wired). Same shape as "
                     "public/act1-hifi/town/<act1 town>-town.json. Cells are the 65x65 grid; an NPC cell "
                     "is the character's FEET. ids/dialogueKeys are maps.ts's, positions are maps.ts's "
                     "16x16 coords mapped by (v+0.5)*65/16 then snapped onto walkable ground (see "
                     "_placementReport)."),
        "id": tid, "nameKey": f"map.{tid}", "screen": f"town/{tid}-screen.png",
        "walkable": f"town/{tid}-walkable.json", "cells": 65, "artPxPerCell": 30, "worldPxPerCell": 16,
        "startCell": list(start_cell), "savePoint": list(save),
        "exit": {"cell": exit_cell, "targetMapId": conn["targetMap"], "toX": conn["toX"], "toY": conn["toY"],
                 "axis": "south",
                 "note": ("toX/toY are maps.ts's connection. For the Act 1 hi-fi towns the authority is the "
                          "overworld LANDMARKS exit cell in public/act1-world-map.js, not maps.ts -- the "
                          "Acts 2-5 equivalent must come from the overworld work before wiring.")},
        "shopId": data["shopId"], "shopCounter": list(counter),
        "npcs": npcs,
        "_placementReport": [{"id": a, "mapsTsCell": b, "placed": list(c), "moved": round(d, 2)} for a, b, c, d in report],
        "_unreachable": unreach,
        "_design": {"act": lay["act"], "biome": lay["biome"], "title": lay["title"],
                    "buildings": [{"kit": p["kit"], "at": p["at"], "role": p["role"]} for p in comp["placed"]],
                    "proposal": bool(data.get("proposal"))},
    }
    write_json(os.path.join(RUNTIME, f"{tid}-town.json"), town)
    # validate against the runtime's own validator
    v = subprocess.run(["node", "--input-type=module", "-e",
                        "import {validateWalkableGeometry} from '%s/public/act1-hifi/walkable-polygons.js';"
                        "import fs from 'fs';const d=JSON.parse(fs.readFileSync(process.argv[1]));"
                        "try{validateWalkableGeometry(d);console.log('VALID')}catch(e){console.log('INVALID',e.message)}" % ROOT,
                        os.path.join(RUNTIME, f"{tid}-walkable.json")], capture_output=True, text=True)
    valid = (v.stdout + v.stderr).strip()
    town["_validator"] = valid
    write_json(os.path.join(RUNTIME, f"{tid}-town.json"), town)
    previews(tid, lay, plate, poly_walk, town)
    walk_pct = poly_walk.mean() * 100
    print(f"{tid:15s} walkable {walk_pct:4.1f}%  holes {len(holes)}  validator: {valid}  "
          f"max move {max(r[3] for r in report):.2f} cells  unreachable {unreach}")
    return town


def font(sz):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


HERO = os.path.join(ROOT, "public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png")


def previews(tid, lay, plate, walk, town):
    os.makedirs(PREVIEW, exist_ok=True)
    p = os.path.join(PREVIEW, f"{tid}-plate.png")
    im = Image.fromarray(plate)
    im.save(p, optimize=True)
    if os.path.getsize(p) > 4_000_000:
        im.quantize(colors=256, method=Image.MEDIANCUT, dither=Image.NONE).save(p, optimize=True)
    # overlay: half res, walkable tinted, blocked hatched, gate, actors, hero for scale
    base = plate.astype(np.float32)
    ov = base.copy()
    ov[walk] = ov[walk] * 0.75 + np.array([40, 230, 90]) * 0.25
    blk = ~walk
    hatch = ((np.add.outer(np.arange(PLATE), np.arange(PLATE)) // 8) % 4 == 0)
    ov[blk] = ov[blk] * 0.85 + np.array([200, 30, 30]) * 0.15
    ov[blk & hatch] = ov[blk & hatch] * 0.5 + np.array([230, 40, 40]) * 0.5
    edge = walk ^ ndi.binary_erosion(walk, iterations=3)
    ov[edge] = (255, 255, 255)
    o = Image.fromarray(np.clip(ov, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(o)
    f = font(26)
    ex, ey = town["exit"]["cell"]
    d.line([((ex - 2.4) * APC, ey * APC), ((ex + 2.4) * APC, ey * APC)], fill=(255, 220, 0), width=9)
    d.text(((ex + 2.8) * APC, ey * APC - 16), "GATE / EXIT", fill=(255, 230, 0), font=f, stroke_width=3,
           stroke_fill=(0, 0, 0))
    hero = Image.open(HERO).crop((0, 0, 64, 64)).resize((68, 68), Image.NEAREST)
    sx, sy = town["startCell"]
    o.paste(hero, (int(sx * APC - 34), int(sy * APC - 66)), hero)
    marks = [(n["id"], n["cell"], (80, 170, 255)) for n in town["npcs"]]
    marks += [("SAVE", town["savePoint"], (255, 255, 255)), ("SHOP", town["shopCounter"], (255, 170, 40))]
    for i, (name, (cx, cy), col) in enumerate(marks):
        x, y = cx * APC, cy * APC
        d.ellipse([x - 13, y - 13, x + 13, y + 13], fill=col, outline=(0, 0, 0), width=3)
        dy = 18 if name in ("SHOP",) else -14
        d.text((x + 16, y + dy), name, fill=col, font=f, stroke_width=3, stroke_fill=(0, 0, 0))
    o = o.resize((975, 975), Image.LANCZOS)
    o.save(os.path.join(PREVIEW, f"{tid}-overlay.png"), optimize=True)


if __name__ == "__main__":
    ids = sys.argv[1:] or list(TOWNS)
    for t in ids:
        build(t)
