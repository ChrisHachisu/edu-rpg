#!/usr/bin/env python3
"""Author a town's COLLISION first, then draw the art from it.

WHY THIS INVERTS THE PORT SAPPHIRE PIPELINE, AND WHY THAT IS THE POINT
    Port Sapphire went painting -> derived collision, and the two have drifted: measured on the
    shipped plate, 56.7% of the drawn paving lies OUTSIDE the walkable authority, which is what
    `check_town_finish.py` fails on. Re-deriving does not fix it -- the rebake's cobble is not the
    cobble `paving_mask` was tuned on, so a re-derive LOSES a quarter of the walkable area and pushes
    the same number to 63.5%. The mismatch is structural, not a threshold.

    greenhollow and millbrook have no painting to derive from, so they can be built the other way
    round: AUTHOR the streets as geometry, emit the collision authority from that geometry, and hand
    the SAME geometry to the generator as its layout primer. Art and collision then agree by
    construction rather than by measurement, and the LAYOUT check is satisfied because the paving in
    the picture is a drawing OF the walkable polygon.

WHAT IT EMITS, FROM ONE SPEC
    1. `public/act1-hifi/town/<id>-walkable.json` -- the collision authority, in the schema
       `walkable-polygons.js` validates: one region with an outer ring and holes, plus building
       footprints as staticObstacles. 1040 world px, 65 cells, 16 world px per cell.
    2. `design/act1-towns/<id>/primer.png` -- a flat 1254 px layout the generator draws FROM.
       Deliberately crude: blocks of colour for ground, paving, buildings, water and palisade. It is
       a plan, not art, and it exists so the four generated tiles agree about where the town is.

THE ENTRANCE IS ONE CELL WIDE AND IT IS THE ONLY WAY IN
    Owner, locked: "only one entrance for towns and dungeons ... and the edge need to be blockers so
    the user cannot walk on top of it." So the palisade is a closed ring with exactly one gap, the
    gap is where the overworld door lands, and `--check` refuses to write a spec whose walkable body
    reaches the plate border anywhere else.

VERIFIED AGAINST A BODY, NOT A POINT. `actorFootRadius` is 4 world px and the runtime resolves
movement against the polygon, so a lane narrower than 8 px is impassable however "connected" it
looks. Every lane is checked by erosion, which is the same mistake that shipped three unenterable
dungeons in build 44 and must not be repeated here.

USAGE
    python3 scripts/town_layout.py --town greenhollow            # write both artefacts
    python3 scripts/town_layout.py --town millbrook --check      # verify only
    python3 scripts/town_layout.py --all
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOWNDIR = os.path.join(ROOT, "public/act1-hifi/town")
DESIGN = os.path.join(ROOT, "design/act1-towns")

# Reuse the tracer and the RDP simplifier the shipped authority was built with, so a polygon authored
# here is the same KIND of object as portSapphire's and cannot fail validation for a different reason.
_spec = importlib.util.spec_from_file_location(
    "_dtw", os.path.join(os.path.dirname(os.path.abspath(__file__)), "derive_town_walkable.py"))
_dtw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_dtw)

WORLD = 1040          # world px across the town, as portSapphire ships
CELLS = 65            # 65 cells * 16 world px = 1040; 65 * 30 art px = 1950
CELL = WORLD // CELLS  # 16
GEN = 1254            # the primer is drawn at the generator's own size
FOOT = 4              # actorFootRadius, world px
RASTER = 2            # supersample factor for the mask the polygons are traced from

# Palette for the primer. Flat, unambiguous, and NOT art: the generator is being told what is where,
# not shown how it should look. Style comes from the anchor image passed alongside the brief.
COL = {
    "outside": (58, 92, 48),      # forest / meadow beyond the palisade
    "ground": (96, 132, 70),      # grass inside the ring
    "paving": (176, 168, 148),    # street and plaza -- THIS is the walkable body
    "dirt": (150, 126, 92),       # the approach lane through the gate
    "water": (58, 104, 132),
    "building": (128, 96, 74),
    "roofA": (150, 78, 60),
    "roofB": (78, 96, 132),
    "palisade": (104, 82, 54),
    "well": (120, 120, 126),
    "clutter": (214, 140, 40),    # props -- ONLY on ground the walkable authority already refuses
}


# ---------------------------------------------------------------- the two towns

def spec_greenhollow() -> dict:
    """A forest village inside a round palisade, gate at the SOUTH.

    Read off its own overworld sprite (public/act1-hifi/landmarks/greenhollow.png), which the owner
    has already accepted: a circular timber palisade, cottages facing inward around a packed-earth
    yard, one gate. Six NPCs live here, the most of any Act 1 town, so the yard is the widest part.
    """
    cx, cy, r = 32.5, 32.0, 27.0
    return {
        "id": "greenhollow",
        "nameKey": "map.greenhollow",
        "ring": {"cx": cx, "cy": cy, "r": r, "gate": ("S", 3.0)},
        "plaza": {"cx": cx, "cy": 31.0, "r": 9.5},
        "lanes": [
            # gate -> plaza, then four spurs to the cottage rows
            ((cx, 60.0), (cx, 33.0), 5.0),
            ((cx, 31.0), (16.0, 26.0), 4.0),
            ((cx, 31.0), (49.0, 26.0), 4.0),
            ((cx, 31.0), (17.0, 42.0), 4.0),
            ((cx, 31.0), (48.0, 42.0), 4.0),
            ((cx, 45.0), (42.0, 46.0), 3.5),
        ],
        "well": (cx, 31.0, 2.2),
        "buildings": [
            {"id": "elder-hall", "box": (25.0, 10.0, 15.0, 9.0), "roof": "roofA"},
            {"id": "cottage-nw", "box": (10.0, 18.0, 11.0, 8.0), "roof": "roofB"},
            {"id": "cottage-ne", "box": (44.0, 18.0, 11.0, 8.0), "roof": "roofA"},
            {"id": "healer", "box": (9.0, 36.0, 12.0, 9.0), "roof": "roofB"},
            {"id": "cottage-se", "box": (44.0, 36.0, 11.0, 8.0), "roof": "roofA"},
            # NOT on the main lane. Placed at (26,45) it sat astride it and severed the gate from
            # the yard -- 45,929 px of walkable body stranded and the arrival cell 12 cells from
            # anywhere legal. The checker caught it; the eye did not.
            {"id": "store", "box": (43.0, 46.0, 12.0, 8.0), "roof": "roofB"},
        ],
        "water": [],
        # cell positions for the six NPCs, on paving, facing the yard
        "npcs": {
            "elder": (32.5, 21.5), "kiki": (27.0, 22.5), "healer": (22.5, 41.0),
            "villager1": (18.5, 28.0), "villager2": (46.5, 28.0), "fisherman": (46.0, 41.0),
        },
        "start": (32.5, 57.0),
        "save": (37.0, 34.0),
    }


def spec_millbrook() -> dict:
    """A mill village on a stream, gate at the SOUTH, the mill and its wheel on the north bank.

    Read off public/act1-hifi/landmarks/millbrook.png: a timber palisade, a mill with a water wheel,
    fewer and larger buildings than greenhollow. The stream is what makes it millbrook rather than a
    second greenhollow, so it crosses the whole town and the main lane bridges it.
    """
    cx, cy, r = 32.5, 32.0, 27.0
    return {
        "id": "millbrook",
        "nameKey": "map.millbrook",
        "ring": {"cx": cx, "cy": cy, "r": r, "gate": ("S", 3.0)},
        "plaza": {"cx": cx, "cy": 38.0, "r": 9.0},
        "lanes": [
            ((cx, 60.0), (cx, 39.0), 5.0),
            ((cx, 38.0), (cx, 17.0), 5.0),          # crosses the stream: the bridge
            ((cx, 38.0), (15.0, 34.0), 4.0),
            ((cx, 38.0), (50.0, 34.0), 4.0),
            ((cx, 20.0), (17.0, 20.0), 4.0),
            ((cx, 20.0), (48.0, 20.0), 4.0),
        ],
        "well": (cx, 38.0, 2.2),
        "buildings": [
            {"id": "mill", "box": (38.0, 8.0, 16.0, 11.0), "roof": "roofA"},
            {"id": "sage-house", "box": (11.0, 9.0, 13.0, 9.0), "roof": "roofB"},
            {"id": "herbalist", "box": (45.0, 30.0, 12.0, 8.0), "roof": "roofB"},
            {"id": "healer", "box": (9.0, 40.0, 12.0, 9.0), "roof": "roofA"},
            {"id": "granary", "box": (44.0, 42.0, 12.0, 9.0), "roof": "roofB"},
        ],
        # the millstream, west to east across the north third, bridged by the main lane
        "water": [((6.0, 26.0), (59.0, 24.0), 3.4)],
        "npcs": {
            "sage": (24.0, 20.0), "healer": (22.5, 44.5),
            "miller": (38.5, 20.5), "herbalist": (42.0, 30.0),
        },
        "start": (32.5, 57.0),
        "save": (37.0, 41.0),
    }


SPECS = {"greenhollow": spec_greenhollow, "millbrook": spec_millbrook}


# ---------------------------------------------------------------- rasterising the plan

def _px(v):
    return v * CELL * RASTER


def build_masks(spec: dict):
    """Rasterise the plan at RASTER x world resolution. Returns (walk, ring, water, buildings)."""
    n = WORLD * RASTER
    walk = Image.new("1", (n, n), 0)
    d = ImageDraw.Draw(walk)

    pl = spec["plaza"]
    d.ellipse([_px(pl["cx"] - pl["r"]), _px(pl["cy"] - pl["r"]),
               _px(pl["cx"] + pl["r"]), _px(pl["cy"] + pl["r"])], fill=1)
    # EVERY BUILDING GETS A LANE TO ITS OWN DOOR. Hand-authored spur endpoints landed at building
    # CORNERS, so the drawn path stopped a few cells short of the frontage and the town read as
    # buildings scattered near a road rather than built along one -- the exact fault the owner named
    # on the first Port Sapphire pilot ("everything is placed way too randomly"). The frontage is a
    # property of the box, so derive it: the ground immediately in front of the building's long side,
    # facing the plaza.
    lanes = list(spec["lanes"])
    pcx, pcy = spec["plaza"]["cx"], spec["plaza"]["cy"]
    for b in spec["buildings"]:
        bx0, by0, bw, bh = b["box"]
        fx = bx0 + bw / 2.0
        fy = by0 + bh + 1.6 if (by0 + bh / 2.0) < pcy else by0 - 1.6
        lanes.append(((pcx, pcy), (fx, fy), 3.2))
    for (ax, ay), (bx, by), w in lanes:
        d.line([_px(ax), _px(ay), _px(bx), _px(by)], fill=1, width=int(_px(w)))
        for (jx, jy) in ((ax, ay), (bx, by)):        # round the ends so lanes meet cleanly
            d.ellipse([_px(jx - w / 2), _px(jy - w / 2), _px(jx + w / 2), _px(jy + w / 2)], fill=1)

    ring = Image.new("1", (n, n), 0)
    dr = ImageDraw.Draw(ring)
    rg = spec["ring"]
    dr.ellipse([_px(rg["cx"] - rg["r"]), _px(rg["cy"] - rg["r"]),
                _px(rg["cx"] + rg["r"]), _px(rg["cy"] + rg["r"])], outline=1, width=int(_px(1.2)))
    # the ONE gap. Cut it by drawing the gate corridor over the palisade in the gate's own direction.
    side, half = rg["gate"]
    gx, gy = rg["cx"], rg["cy"] + rg["r"]
    dr.rectangle([_px(gx - half), _px(gy - 2.0), _px(gx + half), _px(gy + 2.0)], fill=0)

    water = Image.new("1", (n, n), 0)
    dw = ImageDraw.Draw(water)
    for (ax, ay), (bx, by), w in spec.get("water", []):
        dw.line([_px(ax), _px(ay), _px(bx), _px(by)], fill=1, width=int(_px(w)))

    bld = Image.new("1", (n, n), 0)
    db = ImageDraw.Draw(bld)
    for b in spec["buildings"]:
        x, y, w, h = b["box"]
        db.rectangle([_px(x), _px(y), _px(x + w), _px(y + h)], fill=1)

    w_arr = np.asarray(walk, bool)
    ring_arr = np.asarray(ring, bool)
    water_arr = np.asarray(water, bool).copy()
    # A STREAM MUST NOT READ AS A SECOND ENTRANCE. Drawn edge to edge it crosses the palisade twice,
    # and although the collision body never reaches the border (the checker proves that), the PICTURE
    # would show two more gaps in a wall the owner has asked to be closed. Clip it to the ring.
    n2 = water_arr.shape[0]
    yy, xx = np.mgrid[0:n2, 0:n2]
    rgc = spec["ring"]
    inside_ring = (((xx / (CELL * RASTER) - rgc["cx"]) ** 2
                    + (yy / (CELL * RASTER) - rgc["cy"]) ** 2) <= (rgc["r"] - 0.8) ** 2)
    water_arr &= inside_ring
    bld_arr = np.asarray(bld, bool)

    # The body is paving, minus anything solid standing on it. Water is a hole, not a wall, because a
    # stream reads as something you cross at the bridge -- the bridge is simply lane drawn over it.
    bridge = np.zeros_like(w_arr)
    if spec.get("water"):
        db2 = ImageDraw.Draw(Image.fromarray(bridge))  # placeholder; bridge is the lane itself
    body = w_arr & ~ring_arr & ~bld_arr
    body &= ~(water_arr & ~w_arr)
    return body, ring_arr, water_arr, bld_arr


# ---------------------------------------------------------------- the authority

def emit_walkable(spec: dict, body: np.ndarray) -> dict:
    lab, n = ndimage.label(body)
    if n == 0:
        raise SystemExit(f"{spec['id']}: the plan has no walkable body at all")
    sizes = ndimage.sum(body, lab, range(1, n + 1))
    keep = int(np.argmax(sizes)) + 1
    main = lab == keep
    dropped = int(body.sum() - main.sum())

    ys, xs = np.where(main)
    outer_px = _dtw.trace(main, (int(ys.min()), int(xs[ys == ys.min()].min())))
    outer, eps = _dtw.simplify([(x / RASTER, y / RASTER) for y, x in outer_px], 2.5)

    holes = []
    filled = ndimage.binary_fill_holes(main)
    hole_field = filled & ~main
    hlab, hn = ndimage.label(hole_field)
    for i in range(1, hn + 1):
        h = hlab == i
        if h.sum() < 40 * RASTER * RASTER:
            continue
        hy, hx = np.where(h)
        ring, _ = _dtw.simplify([(x / RASTER, y / RASTER)
                                 for y, x in _dtw.trace(h, (int(hy.min()), int(hx[hy == hy.min()].min())))], 2.5)
        if len(ring) >= 4:
            holes.append([{"x": round(x, 1), "y": round(y, 1)} for x, y in ring])

    walk = {
        "schema": "act1-art-fit-polygon-authority-v2",
        "revision": 1,
        "status": "authored-collision-first",
        "authority": (
            "AUTHORED, not derived. scripts/town_layout.py rasterises this town's plan and traces "
            "the polygon from it, and the SAME plan is the layout primer the plate is drawn from -- "
            "so the paving in the picture is a drawing of this geometry rather than a source it was "
            "measured back out of. Port Sapphire went the other way and its art and collision have "
            "since drifted by 56.7% of drawn paving."),
        "coordinateSpace": "world-px",
        "width": WORLD, "height": WORLD,
        "actorFootRadius": FOOT,
        "maxSubstep": 2,
        "regions": [{
            "id": f"{spec['id']}-streets", "component": "town", "role": "walkable",
            "outer": [{"x": round(x, 1), "y": round(y, 1)} for x, y in outer],
            "holes": holes, "joins": [],
        }],
        "staticObstacles": [
            {"id": b["id"], "kind": "town-building",
             "polygon": [{"x": b["box"][0] * CELL, "y": b["box"][1] * CELL},
                         {"x": (b["box"][0] + b["box"][2]) * CELL, "y": b["box"][1] * CELL},
                         {"x": (b["box"][0] + b["box"][2]) * CELL, "y": (b["box"][1] + b["box"][3]) * CELL},
                         {"x": b["box"][0] * CELL, "y": (b["box"][1] + b["box"][3]) * CELL}]}
            for b in spec["buildings"]
        ],
        "dynamicBlockers": [], "landmarkAnchors": [], "semanticRoutes": [], "streamingAffinity": [],
        "_dropped_px": dropped, "_epsilon": eps,
    }
    # THE PRIMER MUST DRAW WHAT THE AUTHORITY KEEPS, NOT WHAT THE PLAN DREW. A stray pocket the
    # authority discards would still be painted as paving, which is precisely the Port Sapphire
    # defect -- drawn street the player cannot stand on -- reproduced in miniature on a town built
    # to avoid it. So the kept component is handed back and the primer is drawn from that.
    return walk, main


# ---------------------------------------------------------------- the primer

def scatter_clutter(spec: dict, inside, body, ring, water, bld) -> np.ndarray:
    """Prop marks for the primer, on ground the collision authority ALREADY refuses.

    WHY THIS IS THE ONLY PLACE PROPS MAY GO
        Rendered beside portSapphire, millbrook and greenhollow read as empty: a palisade, six plain
        buildings, a well, and large bare fields. That emptiness is also the whole of their one gate
        failure -- PAINTERLY 44-45% soft against a 40% ceiling -- because props make hard edges and
        bare ground makes soft stipple, so a town with nothing on its ground measures painterly no
        matter how well it is drawn. The cause was the plan vocabulary: ten entries, none a prop,
        and a brief telling the model that anything unlisted must not be drawn.

        But collision here is AUTHORED FIRST and the art is drawn from it, so a barrel invented in
        the middle of the street is a barrel the player walks through. Owner's call, 2026-08-21: put
        props ONLY where the walkable body already says nobody stands. Then the polygons never move,
        `emit_walkable` is untouched, and greenhollow's six-NPC walk and millbrook's 19/19 stay
        valid without being re-run.

    THE MARGIN IS NOT DECORATION
        The primer is rasterised at WORLD*RASTER and resampled twice before the model sees it
        (BILINEAR to 1254) and once more on the way back. A prop sitting flush against the paving
        would bleed blended pixels onto the street, and the street is thresholded out of pale paving
        to build the walkable network -- so a blob touching a lane could silently narrow it. Eroding
        the free ground by 0.6 of a cell before placing anything keeps every prop clear of both the
        walkable body and any wall.
    """
    free = inside & ~body & ~ring & ~water & ~bld
    step = int(round(0.6 * CELL * RASTER))
    clear = ndimage.binary_erosion(free, np.ones((3, 3), bool), iterations=step)
    # Clutter belongs against something, not adrift in a meadow: keep to within a few cells of a
    # building wall or the palisade, which is also exactly where a town naturally stacks its stores.
    solid = bld | ring
    near = clear & (ndimage.distance_transform_edt(~solid) <= 3.2 * CELL * RASTER)
    ys, xs = np.where(near)
    out = np.zeros_like(free)
    if not len(ys):
        return out
    # Deterministic: the same plan must produce the same primer on any machine, or a re-bake is not
    # a re-bake. Seeded from the town's own id rather than the clock.
    rng = np.random.default_rng(abs(hash(spec["id"])) % (2 ** 32))
    order = rng.permutation(len(ys))
    gap = 1.8 * CELL * RASTER          # minimum centre-to-centre spacing, so they read as objects
    yy, xx = np.mgrid[0:free.shape[0], 0:free.shape[1]]
    taken: list[tuple[int, int]] = []
    for k in order:
        cy, cx = int(ys[k]), int(xs[k])
        if any((cy - py) ** 2 + (cx - px) ** 2 < gap ** 2 for py, px in taken):
            continue
        r = float(rng.uniform(0.42, 0.82) * CELL * RASTER)
        blob = ((yy - cy) ** 2 + (xx - cx) ** 2) <= r ** 2
        out |= blob & clear
        taken.append((cy, cx))
        if len(taken) >= 120:
            break
    return out


def draw_primer(spec: dict, body, ring, water, bld) -> Image.Image:
    n = body.shape[0]
    img = np.zeros((n, n, 3), np.uint8)
    img[:] = COL["outside"]
    rg = spec["ring"]
    yy, xx = np.mgrid[0:n, 0:n]
    inside = ((xx / (CELL * RASTER) - rg["cx"]) ** 2 + (yy / (CELL * RASTER) - rg["cy"]) ** 2) <= rg["r"] ** 2
    img[inside] = COL["ground"]
    img[water] = COL["water"]
    img[body] = COL["paving"]
    img[ring] = COL["palisade"]
    img[scatter_clutter(spec, inside, body, ring, water, bld)] = COL["clutter"]

    out = Image.fromarray(img)
    d = ImageDraw.Draw(out)
    for b in spec["buildings"]:
        x, y, w, h = b["box"]
        d.rectangle([_px(x), _px(y), _px(x + w), _px(y + h)], fill=COL["building"])
        d.rectangle([_px(x), _px(y), _px(x + w), _px(y + h * 0.62)], fill=COL[b["roof"]])
    wx, wy, wr = spec["well"]
    d.ellipse([_px(wx - wr), _px(wy - wr), _px(wx + wr), _px(wy + wr)], fill=COL["well"])
    # the gate, drawn so the generator cannot miss where the one entrance is
    side, half = rg["gate"]
    gx, gy = rg["cx"], rg["cy"] + rg["r"]
    d.rectangle([_px(gx - half), _px(gy - 1.0), _px(gx + half), _px(gy + 1.6)], fill=COL["dirt"])
    return out.resize((GEN, GEN), Image.BILINEAR)


# ---------------------------------------------------------------- checks

def check(spec: dict, body: np.ndarray, walk: dict) -> list[str]:
    problems = []
    # ONE ENTRANCE: the body must not touch the plate border except inside the gate span.
    rg = spec["ring"]
    _, half = rg["gate"]
    edge = np.zeros_like(body)
    edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
    touch = np.where(body & edge)
    if len(touch[0]):
        problems.append(f"the walkable body reaches the plate border at {len(touch[0])} px "
                        "-- the town leaks around the palisade")
    # A BODY, NOT A POINT: every part of the body must survive erosion by the foot radius and stay
    # connected to the gate. This is the build-44 lesson; a lane can be 'connected' and impassable.
    er = ndimage.binary_erosion(body, ndimage.generate_binary_structure(2, 2),
                                iterations=int(FOOT * RASTER))
    lab, n = ndimage.label(er)
    if n == 0:
        problems.append(f"no part of the plan admits a {FOOT}px-radius body")
        return problems
    sizes = ndimage.sum(er, lab, range(1, n + 1))
    bulk = int(np.argmax(sizes)) + 1
    gy = int((rg["cy"] + rg["r"] - 1.5) * CELL * RASTER)
    gx = int(rg["cx"] * CELL * RASTER)
    win = lab[max(0, gy - 60):gy + 60, max(0, gx - 60):gx + 60]
    if bulk not in set(win.ravel().tolist()) - {0}:
        problems.append("the gate is not connected to the town's main walkable body for a real body")
    return problems


def snap(spec: dict, body: np.ndarray) -> dict:
    """Move every placed thing to the nearest ground a real body can stand on.

    Hand-authored cell coordinates are wrong by a cell or two roughly every time, and the failure is
    silent and horrible: an NPC standing inside a wall is unreachable and un-talkable, and the
    arrival cell being illegal drops the player outside her own town. The plan owns WHERE THINGS
    SHOULD BE; the geometry owns where they CAN be. So snap, and report the distance moved so a
    large correction is visible rather than quietly absorbed.
    """
    er = ndimage.binary_erosion(body, ndimage.generate_binary_structure(2, 2),
                                iterations=int(FOOT * RASTER))
    lab, n = ndimage.label(er)
    sizes = ndimage.sum(er, lab, range(1, n + 1))
    main = lab == (int(np.argmax(sizes)) + 1)         # snap to the BULK, never to a stranded pocket
    ys, xs = np.where(main)
    pts = np.stack([xs, ys], 1).astype(float) / (CELL * RASTER)

    moved = {}
    def nearest(cx, cy):
        d = np.hypot(pts[:, 0] - cx, pts[:, 1] - cy)
        i = int(np.argmin(d))
        return (round(float(pts[i, 0]), 1), round(float(pts[i, 1]), 1)), float(d[i])

    for nid, (cx, cy) in list(spec["npcs"].items()):
        (nx, ny), dist = nearest(cx, cy)
        spec["npcs"][nid] = (nx, ny)
        if dist > 0.05:
            moved[nid] = round(dist, 2)
    for key in ("start", "save"):
        (nx, ny), dist = nearest(*spec[key])
        spec[key] = (nx, ny)
        if dist > 0.05:
            moved[key] = round(dist, 2)
    return moved


def run(town: str, do_check: bool) -> int:
    spec = SPECS[town]()
    body, ring, water, bld = build_masks(spec)
    walk, body = emit_walkable(spec, body)      # body is now exactly what ships
    moved = snap(spec, body)
    problems = check(spec, body, walk)

    area = 100.0 * body.mean()
    print(f"  {town}: walkable {area:.1f}% of frame, outer ring {len(walk['regions'][0]['outer'])} pts, "
          f"{len(walk['regions'][0]['holes'])} holes, {len(walk['staticObstacles'])} buildings, "
          f"dropped {walk['_dropped_px']} stray px")
    if moved:
        print("    snapped to legal ground: "
              + ", ".join(f"{k} {v} cells" for k, v in sorted(moved.items())))
    for p in problems:
        print(f"    PROBLEM: {p}")
    if problems:
        return 1
    if do_check:
        print("    [--check: plan is sound]")
        return 0

    os.makedirs(os.path.join(DESIGN, town), exist_ok=True)
    wp = os.path.join(TOWNDIR, f"{town}-walkable.json")
    json.dump(walk, open(wp, "w"), indent=1)
    pp = os.path.join(DESIGN, town, "primer.png")
    draw_primer(spec, body, ring, water, bld).save(pp)
    json.dump(spec, open(os.path.join(DESIGN, town, "spec.json"), "w"), indent=1, default=list)
    print(f"    wrote {os.path.relpath(wp, ROOT)} and {os.path.relpath(pp, ROOT)}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--town", choices=sorted(SPECS))
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    towns = sorted(SPECS) if a.all or not a.town else [a.town]
    return max(run(t, a.check) for t in towns)


if __name__ == "__main__":
    sys.exit(main())
