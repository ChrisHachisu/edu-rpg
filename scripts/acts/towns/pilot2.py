"""Pilot 2: hand-authored, per-object town collision + foreground cutouts (Act 1 method).

  python3 pilot2.py [ironkeep frostwatch]

Act 1's collision is AUTHORED (docs/T4B-GREENHOLLOW-MILLBROOK-SPEC.md, state as of 2026-08-20), not
derived. Every object on the plate is traced as its own shape in cells (1 cell = 30 art px of the
1950 plate), read off gridded 1.5x crops of the shipped screen:

  ground   polygons/rects of open painted ground the hero may stand on (terraces, streets, stairs)
  block    feet-only bases: building footprints (front wall base line, roof above is not blocked),
           walls/fences as continuous polylines, round wells, trunks, lamps, barrels, crates
  fg       foreground cutouts (lamp heads, tree crowns, eaves) -- the plate's own pixels inside the
           shape, drawn over actors by town.html exactly like greenhollow/portSapphire's
           <id>-foreground.png + <id>-foreground.json crop box

walkable = union(ground) - union(block), one component from the gate, polygonised with
build_town.mask_to_polys and checked with the shipped validateWalkableGeometry, then check_feet.py.
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_town as bt  # noqa: E402
import codex_finish as cf  # noqa: E402
from kitlib import write_json  # noqa: E402

P, APC = 1950, 30
OLD = "/tmp/claude-0/-home-claude/c446ac0c-2689-576d-8fff-6176ff6d9aad/scratchpad"
RT = os.path.join(OLD, "acts/towns/runtime-codex-pilot2/town")
PREV = "/mnt/project-files/edu-rpg/acts-preview/towns-codex/pilot2"


# ------------------------------------------------------------------------------ shape helpers
def draw(shapes, size=P, scale=APC):
    im = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(im)
    for s in shapes:
        k = s[0]
        if k == "rect":
            d.rectangle([s[1] * scale, s[2] * scale, s[3] * scale - 1, s[4] * scale - 1], fill=255)
        elif k == "ell":
            _, cx, cy, rx, ry = s
            d.ellipse([(cx - rx) * scale, (cy - ry) * scale, (cx + rx) * scale, (cy + ry) * scale], fill=255)
        elif k == "poly":
            d.polygon([(x * scale, y * scale) for x, y in s[1]], fill=255)
        elif k == "line":
            w = s[1] * scale
            pts = [(x * scale, y * scale) for x, y in s[2]]
            d.line(pts, fill=255, width=max(1, int(round(w))))
            for x, y in pts:
                d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=255)
    return np.asarray(im) > 127


def shape_poly_art(s):
    """Act 1 authored-obstacle polygon (art px) for one block shape."""
    k = s[0]
    if k == "rect":
        x0, y0, x1, y1 = [v * APC for v in s[1:]]
        return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    if k == "ell":
        _, cx, cy, rx, ry = s
        a = np.linspace(0, 2 * np.pi, 20, endpoint=False)
        return [[round((cx + rx * np.cos(t)) * APC, 1), round((cy + ry * np.sin(t)) * APC, 1)] for t in a]
    if k == "poly":
        return [[x * APC, y * APC] for x, y in s[1]]
    return [[x * APC, y * APC] for x, y in s[2]]          # line: centreline, width in "widthArt"


from pilot2_shapes import TOWNS  # noqa: E402


# ------------------------------------------------------------------------------------- build
def build(tid):
    T = TOWNS[tid]
    up, sh = cf.plate(tid)
    plate = np.asarray(sh)
    ground = draw([s for _, s in T["ground"]])
    block = draw([s for _, s in T["block"]])
    walk = ground & ~block
    lab, _ = ndi.label(walk)
    gx = int(T["gate"][0] * APC)
    g = lab[P - 20, gx - 30:gx + 30]
    walk = lab == np.bincount(g[g > 0]).argmax()
    outer, holes_, _ = bt.mask_to_polys(walk)
    poly_walk = bt.rasterize_world(outer, holes_)

    # actors: feet stencil must fit (check_feet), reachable from the start
    import check_feet as ck
    exit_cell = [T["gate"][0], T["gate"][1]]
    start = bt.snap([exit_cell[0], exit_cell[1] - 2.0], poly_walk)
    pts = ck.stencil()
    w2 = poly_walk[::2, ::2]

    def free_mask(pad):
        st, _ = ck.footprint(pts, pad)
        f = ndi.binary_erosion(w2, structure=st, border_value=0)
        lb, _ = ndi.label(f)
        sl = lb[int(start[1] * 15), int(start[0] * 15)]
        f = (lb == sl) if sl else f
        return np.repeat(np.repeat(f, 2, 0), 2, 1)[:P, :P]
    ok = free_mask(0)
    ok_c = free_mask(7) & ok
    start = bt.snap(start, ok)
    data = bt.maps_ts()[tid]
    npcs, report = [], []
    for nn in data["npcs"]:
        tgt = bt.c16(nn["x"], nn["y"])
        t = T["healer"] if nn["id"] == "healer" else T.get("place", {}).get(nn["id"], tgt)
        c = bt.snap(t, ok, max_r=25)
        in_bldg = block[min(P - 1, int(tgt[1] * APC)), min(P - 1, int(tgt[0] * APC))]
        if nn["id"] != "healer" and np.hypot(c[0] - tgt[0], c[1] - tgt[1]) > 3 and not in_bldg:
            c = bt.snap(tgt, ok, max_r=25)
        report.append((nn["id"], tgt, c, float(np.hypot(c[0] - tgt[0], c[1] - tgt[1])), bool(in_bldg)))
        npcs.append({"id": nn["id"], "dialogueKey": nn["dialogueKey"], "nameKey": f"npc.{nn['id']}.name",
                     "sheet": f"town/npc/{tid}-{nn['id']}-4x3-64.png", "cell": list(c), "mapsTs": [nn["x"], nn["y"]]})
    counter = bt.snap(T["shop"], ok, max_r=25)
    sk = T.get("shopkeeper") or bt.snap([counter[0] + 1.6, counter[1]], ok, max_r=25)
    npcs.append({"id": "shopkeeper", "dialogueKey": "npc.shopkeeper", "nameKey": "npc.shopkeeper.name",
                 "sheet": f"town/npc/{tid}-shopkeeper-4x3-64.png", "cell": list(sk),
                 "_note": "Act 1 pattern (portSapphire): the shopkeeper stands beside the counter spot."})
    save_t = T.get("save") or bt.c16(*data["savePoint"])
    save = bt.snap(save_t, ok_c, max_r=25) or bt.snap(save_t, ok, max_r=25)
    report.append(("savePoint", save_t, save, float(np.hypot(save[0] - save_t[0], save[1] - save_t[1])), False))

    # foreground cutout layer (Act 1 format: cropped RGBA + {x,y,w,h,full})
    fgm = draw([s for _, s in T["fg"]]) if T["fg"] else np.zeros((P, P), bool)
    os.makedirs(RT, exist_ok=True)
    fg_rel = None
    if fgm.any():
        ys, xs = np.nonzero(fgm)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        rgba = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
        rgba[..., :3] = plate[y0:y1, x0:x1]
        rgba[..., 3] = fgm[y0:y1, x0:x1] * 255
        Image.fromarray(rgba, "RGBA").save(os.path.join(RT, f"{tid}-foreground.png"), optimize=True)
        write_json(os.path.join(RT, f"{tid}-foreground.json"),
                   {"x": int(x0), "y": int(y0), "w": int(x1 - x0), "h": int(y1 - y0), "full": P})
        fg_rel = f"town/{tid}-foreground.png"

    Image.fromarray(plate).save(os.path.join(RT, f"{tid}-screen.png"))
    Image.fromarray((~poly_walk * 255).astype(np.uint8)).save(os.path.join(RT, f"{tid}-collision.png"))
    authored = {
        "schema": "act1-authored-obstacles-v1-cells", "town": tid, "cellArtPx": APC,
        "groundArt": [{"id": n, "polygonArt": shape_poly_art(s)} for n, s in T["ground"]],
        "nonWalkableBands": [dict({"id": n, "polygonArt": shape_poly_art(s)},
                                  **({"widthArt": s[1] * APC} if s[0] == "line" else {}))
                             for n, s in T["block"]],
        "foregroundArt": [{"id": n, "polygonArt": shape_poly_art(s)} for n, s in T["fg"]],
    }
    write_json(os.path.join(HERE, "authored", f"{tid}-pilot2-authored-obstacles.json"), authored)
    walkable = {
        "schema": "act1-art-fit-polygon-authority-v2", "revision": 2,
        "status": "acts2-5-pilot2-owner-review-pending",
        "authority": (f"AUTHORED per object against the Codex plate (scripts/acts/towns/pilot2_shapes.py -> "
                      f"authored/{tid}-pilot2-authored-obstacles.json): ground minus feet-only bases. Feet-only."),
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
        "_comment": f"{tid} pilot-2 runtime config: collision and foreground hand-authored per object.",
        "id": tid, "nameKey": f"map.{tid}", "screen": f"town/{tid}-screen.png", "walkable": f"town/{tid}-walkable.json",
        **({"foreground": fg_rel} if fg_rel else {}),
        "cells": 65, "artPxPerCell": 30, "worldPxPerCell": 16, "startCell": list(start), "savePoint": list(save),
        "exit": {"cell": exit_cell, "targetMapId": conn["targetMap"], "toX": conn["toX"], "toY": conn["toY"], "axis": "south"},
        "shopId": data.get("shopId", tid), "shopCounter": list(counter), "npcs": npcs,
        "_placementReport": [{"id": a, "mapsTsCell": b, "placed": list(c), "moved": round(d, 2), "spotInBuilding": e}
                             for a, b, c, d, e in report],
    }
    v = subprocess.run(["node", "--input-type=module", "-e",
                        "import {validateWalkableGeometry} from '%s/public/act1-hifi/walkable-polygons.js';"
                        "import fs from 'fs';const d=JSON.parse(fs.readFileSync(process.argv[1]));"
                        "try{validateWalkableGeometry(d);console.log('VALID')}catch(e){console.log('INVALID',e.message)}" % bt.ROOT,
                        os.path.join(RT, f"{tid}-walkable.json")], capture_output=True, text=True)
    town["_validator"] = (v.stdout + v.stderr).strip()
    write_json(os.path.join(RT, f"{tid}-town.json"), town)
    previews(tid, plate, poly_walk, fgm, town, T)
    print(f"{tid:12s} walk {poly_walk.mean() * 100:4.1f}% {town['_validator']} start {start} "
          f"moves>1: {[(a, round(d, 2), e) for a, _, _, d, e in report if d > 1]}")


def font(n):
    try:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", n)
    except OSError:
        return ImageFont.load_default()


def overlay(plate, walk, fgm, town):
    ov = plate.astype(np.float32).copy()
    ov[walk] = ov[walk] * 0.72 + np.array([40, 230, 90]) * 0.28
    blk = ~walk
    hatch = ((np.add.outer(np.arange(P), np.arange(P)) // 6) % 4 == 0)
    ov[blk & hatch] = ov[blk & hatch] * 0.45 + np.array([230, 40, 40]) * 0.55
    edge = walk ^ ndi.binary_erosion(walk, iterations=2)
    ov[edge] = (255, 255, 255)
    fe = fgm ^ ndi.binary_erosion(fgm, iterations=2)
    ov[fe] = (60, 160, 255)
    o = Image.fromarray(np.clip(ov, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(o)
    f = font(24)
    ex, ey = town["exit"]["cell"]
    d.line([((ex - 3) * APC, ey * APC), ((ex + 3) * APC, ey * APC)], fill=(255, 220, 0), width=7)
    hero = Image.open(bt.HERO).crop((0, 0, 64, 64)).resize((68, 68), Image.NEAREST)
    sx, sy = town["startCell"]
    o.paste(hero, (int(sx * APC - 34), int(sy * APC - 66)), hero)
    marks = [(n["id"], n["cell"], (80, 170, 255)) for n in town["npcs"]]
    marks += [("SAVE", town["savePoint"], (255, 255, 255)), ("SHOP", town["shopCounter"], (255, 170, 40))]
    for name, (cx, cy), col in marks:
        x, y = cx * APC, cy * APC
        d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=col, outline=(0, 0, 0), width=3)
        d.text((x + 12, y - 12), name, fill=col, font=f, stroke_width=3, stroke_fill=(0, 0, 0))
    return o


def previews(tid, plate, walk, fgm, town, T):
    os.makedirs(PREV, exist_ok=True)
    o = overlay(plate, walk, fgm, town)
    o.resize((1300, 1300), Image.LANCZOS).save(os.path.join(PREV, f"{tid}-overlay.jpg"), quality=88)
    # foreground check: what will be drawn over the hero, on a dimmed plate
    fv = plate.astype(np.float32) * 0.3
    fv[fgm] = plate[fgm]
    Image.fromarray(fv.astype(np.uint8)).resize((975, 975), Image.LANCZOS).save(
        os.path.join(PREV, f"{tid}-foreground.jpg"), quality=88)
    for name, (x0, y0, x1, y1) in T["zoom"].items():
        c = o.crop((int(x0 * APC), int(y0 * APC), int(x1 * APC), int(y1 * APC)))
        c = c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
        c.save(os.path.join(PREV, f"{tid}-zoom-{name}.jpg"), quality=88)


if __name__ == "__main__":
    for t in sys.argv[1:] or list(TOWNS):
        build(t)
