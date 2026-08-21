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
# RE-KEYED 2026-08-21 TO THE ACCEPTED LANDMARK SPRITES. Owner: "the color scheme is a bit off as
# well (port sapphire looks better)."
#
# Sampled off public/act1-hifi/landmarks/{millbrook,greenhollow,port-sapphire}.png -- the overworld
# art already signed off for these same three towns. Their interiors are dominated by WARM PACKED
# EARTH AND TIMBER, (72,48,24) and (96,72,48) and (120,96,72), with saturated green appearing only
# outside the wall. The old palette painted most of the interior in (96,132,70) mid-green with a
# pale (176,168,148) street, which is why the plates read as a lawn with a sand path through it and
# portSapphire reads as a town.
#
# These are still FLAT PLAN COLOURS, not art -- but the plan's hue is what the generator anchors the
# ground material to, which is exactly how the last pass ended up green.
COL = {
    "outside": (44, 72, 40),      # forest beyond the wall: both villages sit in '0' forest, and
                                  # the nearest overworld water is 12 cells (millbrook) / 22
                                  # (greenhollow) away, so nothing here is coast.
    "ground": (104, 112, 68),     # yard grass, olive rather than lawn-green, and WALKABLE
    "paving": (150, 134, 110),    # packed earth and cobble -- warmer and darker than the old tan
    "dirt": (122, 100, 74),       # the approach lane through the gate
    "water": (58, 104, 132),      # kept for portSapphire's harbour; the villages have none
    "building": (120, 96, 72),
    "roofA": (146, 82, 58),
    "roofB": (82, 98, 126),
    "palisade": (96, 76, 50),
    "well": (118, 118, 122),
    "clutter": (214, 140, 40),    # props -- decorative only; the blockers are houses/shops/well
}


# ---------------------------------------------------------------- the two towns


def gate_point(rg: dict):
    """Where the one entrance sits on the ring, for any side.

    The gate used to be hardcoded to `cy + r` in three separate places, which was fine while every
    town was a village approached from the south. Port Sapphire is not: `portSapphire-town.json`
    puts its exit at cell [33, 3] with the note "north trail mouth", and the overworld agrees --
    the trail cells at (128-136, 348) run along its NORTH edge while the whole southern half of its
    surroundings is open water. A south gate there would open onto the sea.
    """
    side, half = rg["gate"]
    cx, cy, r = rg["cx"], rg["cy"], rg["r"]
    pt = {"S": (cx, cy + r), "N": (cx, cy - r), "E": (cx + r, cy), "W": (cx - r, cy)}[side]
    return pt[0], pt[1], half, side


def _seat(cx, cy, r, deg, w, h, clear=2.0, max_y=None):
    """Place a w x h building box centred on a bearing, guaranteed INSIDE the palisade.

    Owner, 2026-08-21: "some houses don't make sense (sticking out of the fence)". They were right
    and it was not marginal -- FOUR of millbrook's five buildings and greenhollow's store had
    corners outside r, because the boxes were hand-typed as absolute coordinates and nobody was
    checking them against the circle.

    A box is bounded by its far CORNER, not its centre, so the seating radius has to subtract the
    half-diagonal. Doing that here makes "outside the fence" arithmetically impossible rather than
    something the eye has to catch. `check()` re-asserts it anyway.

    deg is a compass bearing in the plate's own coordinates: -90 is up/north, +90 is down/south.
    """
    import math
    half_diag = math.hypot(w / 2.0, h / 2.0)
    d = r - clear - half_diag
    if d < 0:
        raise ValueError(f"a {w}x{h} building cannot fit inside r={r} with {clear} clearance")

    def box_at(dist):
        return (cx + dist * math.cos(math.radians(deg)) - w / 2.0,
                cy + dist * math.sin(math.radians(deg)) - h / 2.0)

    # A SHORELINE IS A SECOND CONSTRAINT AND THE CIRCLE DOES NOT KNOW ABOUT IT. Seated on bearing
    # alone, Port Sapphire's warehouse and tavern came out standing in their own harbour -- inside
    # the ring, which is all this function used to promise, and below the waterline. Walk the box
    # back along its own bearing until it clears the water; for a southern bearing that pulls it
    # north, which is exactly where the quay is.
    if max_y is not None:
        while d > 0 and box_at(d)[1] + h > max_y:
            d -= 0.25
        if d <= 0:
            raise ValueError(f"a {w}x{h} building on bearing {deg} cannot clear y={max_y}")
    bx, by = box_at(d)
    return (round(bx, 2), round(by, 2), w, h)



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
        "plaza": {"cx": cx, "cy": 31.0, "r": 13.5},
        # ONLY THE GATE APPROACH IS HAND-AUTHORED. The four hand-typed spurs that used to live here
        # were aimed at the cottages' OLD coordinates; reseating the buildings left them pointing at
        # empty grass, drawn as rounded stubs ending in mid-yard. Every other path is derived from a
        # building's own frontage in build_masks(), so a path cannot outlive the door it serves.
        "lanes": [
            ((cx, 60.0), (cx, 33.0), 5.0),
        ],
        "well": (cx, 31.0, 2.2),
        # SEATED BY BEARING, not typed as coordinates -- see _seat(). Greenhollow is the bigger
        # village and reads as a ring of cottages facing a wide common, hall due north.
        "buildings": [
            {"id": "elder-hall",  "box": _seat(cx, cy, r, -90, 15.0, 9.0), "roof": "roofA"},
            {"id": "cottage-nw",  "box": _seat(cx, cy, r, -145, 11.0, 8.0), "roof": "roofB"},
            {"id": "cottage-ne",  "box": _seat(cx, cy, r, -35, 11.0, 8.0), "roof": "roofA"},
            {"id": "healer",      "box": _seat(cx, cy, r, 175, 12.0, 9.0), "roof": "roofB"},
            {"id": "cottage-se",  "box": _seat(cx, cy, r, 35, 11.0, 8.0), "roof": "roofA"},
            # Kept well off the gate bearing (+90). It once sat astride the main lane and severed
            # the gate from the yard: 45,929 px of walkable body stranded.
            {"id": "store",       "box": _seat(cx, cy, r, 132, 12.0, 8.0), "roof": "roofB"},
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
        "plaza": {"cx": cx, "cy": 35.0, "r": 12.5},
        # Gate approach only; the rest are frontage lanes derived from the buildings. The old list
        # included a bridge lane for a stream that no longer exists.
        "lanes": [
            ((cx, 60.0), (cx, 39.0), 5.0),
        ],
        "well": (cx, 38.0, 2.2),
        # Fewer and larger than greenhollow, and deliberately NOT the same bearings -- owner,
        # 2026-08-21: "we can have the general shape and container of the town but move the
        # houses/shops around depending on the town."
        "buildings": [
            {"id": "mill",       "box": _seat(cx, cy, r, -68, 16.0, 11.0), "roof": "roofA"},
            {"id": "sage-house", "box": _seat(cx, cy, r, -160, 13.0, 9.0), "roof": "roofB"},
            {"id": "herbalist",  "box": _seat(cx, cy, r, -12, 12.0, 8.0), "roof": "roofB"},
            {"id": "healer",     "box": _seat(cx, cy, r, 152, 12.0, 9.0), "roof": "roofA"},
            {"id": "granary",    "box": _seat(cx, cy, r, 42, 12.0, 9.0), "roof": "roofB"},
        ],
        # NO WATER. The millstream is GONE (owner, 2026-08-21: "the surrounding terrain needs to
        # match the actual surrounding terrain. this means that we need to remove the river").
        # Measured against public/act1-world-map.js, the nearest overworld water to millbrook's site
        # at (39,344) is TWELVE CELLS away, so a stream crossing the town came from nowhere and went
        # nowhere. The mill keeps its identity regardless: the accepted landmark sprite
        # public/act1-hifi/landmarks/millbrook.png draws a water WHEEL and no stream at all.
        "water": [],
        "npcs": {
            "sage": (24.0, 20.0), "healer": (22.5, 44.5),
            "miller": (38.5, 20.5), "herbalist": (42.0, 30.0),
        },
        "start": (32.5, 57.0),
        "save": (37.0, 41.0),
    }



def spec_portSapphire() -> dict:
    """The port. Same container as the villages, turned around and opened onto its harbour.

    Owner, 2026-08-21: "we also will need to match port sapphire and make a harbor for port sapphire
    specifically" -- so this is the SAME round enclosure the two villages use, which is what keeps
    the three towns a family, with two things changed because the overworld says so:

      * THE GATE IS NORTH. `portSapphire-town.json` puts the exit at cell [33, 3], "north trail
        mouth", and the overworld plate has trail cells running along (128-136, 348) on its north
        edge. Both villages are entered from the south; this one is not.
      * THE SOUTHERN ARC IS WATER, NOT PALISADE. At the town's overworld site (133,349) the nearest
        water is ONE cell away and the whole southern half is open bay -- `HARBOR_CELLS` in
        public/act1-world-map.js already declares it. So the wall stops at the shoreline and the sea
        finishes the enclosure. It blocks as well as a palisade does, and it is why this town has a
        harbour and the other two have a millstream-shaped hole where one used to be.

    The piers are walkable on purpose: a harbour the player can only look at is scenery. They are
    3 cells wide so a 4px-radius body survives the erosion check with room to spare.
    """
    cx, cy, r = 32.5, 32.0, 27.0
    shore = 41.0
    return {
        "id": "portSapphire",
        "nameKey": "map.portSapphire",
        "ring": {"cx": cx, "cy": cy, "r": r, "gate": ("N", 3.0)},
        "plaza": {"cx": cx, "cy": 28.0, "r": 11.0},
        "lanes": [
            ((cx, 4.0), (cx, 26.0), 5.0),        # the north trail mouth down to the market
            ((cx, 33.0), (cx, shore - 0.5), 6.0),  # market down to the quay
        ],
        "sea": {"y0": shore},
        # Between the two quayside buildings, not under them.
        "piers": [
            (21.0, shore - 1.0, 3.0, 10.0),
            (31.0, shore - 1.0, 3.0, 13.0),
            (41.0, shore - 1.0, 3.0, 10.0),
        ],
        "well": (cx, 28.0, 2.2),
        # Seated north of the shoreline so nothing stands in the water. Bearings deliberately differ
        # from both villages: a port crowds its buildings around the head of the harbour.
        # FOUR ON THE ARC, TWO ON THE QUAY. Six would not fit around the northern half alone -- at
        # this radius each building subtends roughly 45 degrees and the dry arc is only 180, so the
        # first attempt clamped them north into each other. The two that do not fit on the arc are
        # the two that belong on the waterfront anyway, placed as explicit boxes at the west and
        # east ends of the quay where they flank the piers instead of blocking them.
        "buildings": [
            {"id": "harbourmaster", "box": _seat(cx, cy, r, -165, 12.0, 9.0, max_y=shore - 5.0), "roof": "roofB"},
            {"id": "market-hall",   "box": _seat(cx, cy, r, -115, 15.0, 9.0, max_y=shore - 5.0), "roof": "roofA"},
            {"id": "shop",          "box": _seat(cx, cy, r, -60, 13.0, 9.0, max_y=shore - 5.0), "roof": "roofA"},
            {"id": "healer",        "box": _seat(cx, cy, r, -15, 12.0, 9.0, max_y=shore - 5.0), "roof": "roofB"},
            {"id": "warehouse",     "box": (7.0, 33.0, 11.0, 7.0), "roof": "roofB"},
            {"id": "tavern",        "box": (47.0, 33.0, 11.0, 7.0), "roof": "roofA"},
        ],
        "water": [],
        # ids preserved from the shipped manifest; snap() moves them to legal ground.
        "npcs": {
            "healer": (24.0, 30.0), "wisewoman": (27.0, 24.0),
            "drake": (38.0, 24.0), "sailor": (33.0, 38.0),
        },
        "start": (32.5, 7.0),
        "save": (28.0, 33.0),
    }


SPECS = {"greenhollow": spec_greenhollow, "millbrook": spec_millbrook,
         "portSapphire": spec_portSapphire}


# ---------------------------------------------------------------- rasterising the plan

def _px(v):
    return v * CELL * RASTER


def build_masks(spec: dict):
    """Rasterise the plan. Returns (body, ring, water, buildings, paving, well).

    THE WALKABLE BODY IS THE WHOLE INTERIOR, NOT THE STREET NETWORK (owner, 2026-08-21:
    "Grass needs to be walkable. The main blockers should only be houses, shops, and the well").

    It used to be the lanes and the plaza only, which made every green field between the buildings
    a wall the player could see across and not enter -- a town that is 84% scenery. Two things
    follow from the change, and both are improvements:

      * PAVING AND COLLISION ARE NOW DIFFERENT THINGS. The lane network survives, but only as ART:
        it is where the ground is drawn as street rather than grass. Nothing about it blocks. So
        `paving` is returned separately and the primer keeps drawing streets, while the collision
        answers a much simpler question -- inside the wall, and not standing in a building or the
        well.
      * PROPS STOP BEING A COLLISION PROBLEM. When the body was the street, a barrel could only go
        on grass or it would block a lane. Now nothing but a house, a shop or the well blocks, so
        clutter is free to sit where it looks right.
    """
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
    # NO PER-BUILDING SPOKE LANES. Two attempts at them both looked wrong and the second looked
    # worse: aimed at fixed offsets they ended in mid-grass, and aimed properly at each door they
    # became short spikes radiating out of the plaza disc, because the plaza already covers the
    # first nine cells of every ray. Neither is what the accepted landmark sprites show -- those are
    # a BROAD COMMON with the buildings standing around its edge and plain ground between them.
    #
    # So the paving is the common plus the gate approach, and nothing else. This is only a drawing
    # decision now: since 2026-08-21 the whole interior is walkable either way, so a villager's path
    # to a door is grass the player can already cross rather than a street that has to be drawn.
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
    gx, gy, half, side = gate_point(rg)
    if side in ("N", "S"):
        dr.rectangle([_px(gx - half), _px(gy - 2.0), _px(gx + half), _px(gy + 2.0)], fill=0)
    else:
        dr.rectangle([_px(gx - 2.0), _px(gy - half), _px(gx + 2.0), _px(gy + half)], fill=0)

    water = Image.new("1", (n, n), 0)
    dw = ImageDraw.Draw(water)
    for (ax, ay), (bx, by), w in spec.get("water", []):
        dw.line([_px(ax), _px(ay), _px(bx), _px(by)], fill=1, width=int(_px(w)))
    # THE SEA is a half-plane, not a line: everything south of the shoreline. Drawn before the
    # piers so the piers can be cut back out of it.
    sea = spec.get("sea")
    if sea:
        dw.rectangle([0, _px(sea["y0"]), n, n], fill=1)

    piers = Image.new("1", (n, n), 0)
    dp = ImageDraw.Draw(piers)
    for (px_, py_, pw, ph) in spec.get("piers", []):
        dp.rectangle([_px(px_), _px(py_), _px(px_ + pw), _px(py_ + ph)], fill=1)
    piers_arr = np.asarray(piers, bool)

    bld = Image.new("1", (n, n), 0)
    db = ImageDraw.Draw(bld)
    for b in spec["buildings"]:
        x, y, w, h = b["box"]
        db.rectangle([_px(x), _px(y), _px(x + w), _px(y + h)], fill=1)

    # THE WELL IS THE THIRD BLOCKER and it is the only one that is not a box. It was drawn into the
    # primer but never into the obstacle set, which was harmless while the body was the lane network
    # (no lane ran through it) and is NOT harmless now that the whole interior is walkable -- the
    # player would stand in the well.
    wl = Image.new("1", (n, n), 0)
    wx, wy, wr = spec["well"]
    ImageDraw.Draw(wl).ellipse([_px(wx - wr), _px(wy - wr), _px(wx + wr), _px(wy + wr)], fill=1)
    well_arr = np.asarray(wl, bool)

    w_arr = np.asarray(walk, bool)
    ring_arr = np.asarray(ring, bool)
    if spec.get("sea"):
        # The wall stops where the water starts; the bay finishes the enclosure. Without this the
        # palisade would march out into the harbour and fence off the piers.
        yy0 = np.arange(ring_arr.shape[0])[:, None] / (CELL * RASTER)
        ring_arr = ring_arr & (yy0 < spec["sea"]["y0"])
    water_arr = np.asarray(water, bool).copy()
    # A STREAM MUST NOT READ AS A SECOND ENTRANCE. Drawn edge to edge it crosses the palisade twice,
    # and although the collision body never reaches the border (the checker proves that), the PICTURE
    # would show two more gaps in a wall the owner has asked to be closed. Clip it to the ring.
    n2 = water_arr.shape[0]
    yy, xx = np.mgrid[0:n2, 0:n2]
    rgc = spec["ring"]
    inside_ring = (((xx / (CELL * RASTER) - rgc["cx"]) ** 2
                    + (yy / (CELL * RASTER) - rgc["cy"]) ** 2) <= (rgc["r"] - 0.8) ** 2)
    if not spec.get("sea"):
        water_arr &= inside_ring     # a STREAM must not read as a second gap in the wall
    water_arr &= ~piers_arr          # a pier is decking laid over the water, not water
    bld_arr = np.asarray(bld, bool)

    # THE BODY: everything inside the wall, minus the three blockers. `inside_ring` is already
    # inset by 0.8 of a cell so the body stops short of the palisade rather than growing into it.
    # The gate lane is unioned back in because it is the one piece of walkable ground OUTSIDE the
    # ring -- without it the town has no entrance and the arrival cell is stranded in the woods.
    gate_lane = w_arr & ~inside_ring
    body = (inside_ring | gate_lane | piers_arr) & ~ring_arr & ~bld_arr & ~well_arr
    body &= ~water_arr          # water is a hole in the floor, whatever draws it
    paving_arr = ((w_arr | piers_arr) & ~ring_arr & ~bld_arr & ~well_arr & ~water_arr)
    return body, ring_arr, water_arr, bld_arr, paving_arr, well_arr


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

def place_clutter(spec: dict, inside, ring, bld, well) -> np.ndarray:
    """A FEW pieces of property, placed where a building would actually keep them.

    Owner, 2026-08-21, on the previous version: "the random blockers look really bad ... i would
    rather have a bunch of opened walkable space rather than weird out of place blockers scattered
    across the map", and then "No blockers unless they are meaningful. Some are fine to be scattered
    across the town."

    So the rule is MEANINGFUL, not ABSENT. What made the last pass look wrong was not the count, it
    was the DISTRIBUTION: 108-120 blobs at even spacing hugging the palisade all the way round, a
    confetti band no settlement would produce. This places a handful per BUILDING instead -- stacked
    along one wall of the thing they belong to, the way stores actually accumulate -- and nothing at
    all against the empty stretches of wall.

    These do NOT block. The collision is houses, shops and the well; a barrel is scenery, so it may
    sit on walkable ground without lying to the player about where they can go.
    """
    out = np.zeros_like(inside)
    yy, xx = np.mgrid[0:inside.shape[0], 0:inside.shape[1]]
    rng = np.random.default_rng(abs(hash(spec["id"] + "clutter")) % (2 ** 32))
    free = inside & ~ring & ~bld & ~well
    for b in spec["buildings"]:
        x, y, w, h = b["box"]
        # The long side, offset outward by about a cell: the strip where a wall meets the ground.
        horizontal = w >= h
        for k in range(int(rng.integers(2, 5))):
            if horizontal:
                cx = x + w * float(rng.uniform(0.12, 0.88))
                cy = y + h + float(rng.uniform(0.7, 1.5))
            else:
                cx = x + w + float(rng.uniform(0.7, 1.5))
                cy = y + h * float(rng.uniform(0.12, 0.88))
            r = float(rng.uniform(0.45, 0.8)) * CELL * RASTER
            px, py = cx * CELL * RASTER, cy * CELL * RASTER
            out |= (((yy - py) ** 2 + (xx - px) ** 2) <= r ** 2) & free
    return out


def draw_primer(spec: dict, body, ring, water, bld, paving, well) -> Image.Image:
    n = body.shape[0]
    img = np.zeros((n, n, 3), np.uint8)
    img[:] = COL["outside"]
    rg = spec["ring"]
    yy, xx = np.mgrid[0:n, 0:n]
    inside = ((xx / (CELL * RASTER) - rg["cx"]) ** 2 + (yy / (CELL * RASTER) - rg["cy"]) ** 2) <= rg["r"] ** 2
    img[inside] = COL["ground"]
    img[water] = COL["water"]
    # PAVING IS NOW ART ONLY -- it is where the ground is drawn as street rather than grass, and it
    # no longer has anything to do with where the player may stand. Both are walkable.
    img[paving] = COL["paving"]
    img[ring] = COL["palisade"]
    img[place_clutter(spec, inside, ring, bld, well)] = COL["clutter"]

    out = Image.fromarray(img)
    d = ImageDraw.Draw(out)
    for b in spec["buildings"]:
        x, y, w, h = b["box"]
        d.rectangle([_px(x), _px(y), _px(x + w), _px(y + h)], fill=COL["building"])
        d.rectangle([_px(x), _px(y), _px(x + w), _px(y + h * 0.62)], fill=COL[b["roof"]])
    wx, wy, wr = spec["well"]
    d.ellipse([_px(wx - wr), _px(wy - wr), _px(wx + wr), _px(wy + wr)], fill=COL["well"])
    # the gate, drawn so the generator cannot miss where the one entrance is
    gx, gy, half, side = gate_point(rg)
    if side in ("N", "S"):
        out_ = 1.6 if side == "S" else -1.6
        d.rectangle([_px(gx - half), _px(min(gy, gy + out_)), _px(gx + half),
                     _px(max(gy, gy + out_))], fill=COL["dirt"])
    else:
        out_ = 1.6 if side == "E" else -1.6
        d.rectangle([_px(min(gx, gx + out_)), _px(gy - half), _px(max(gx, gx + out_)),
                     _px(gy + half)], fill=COL["dirt"])
    return out.resize((GEN, GEN), Image.BILINEAR)


# ---------------------------------------------------------------- checks

def check(spec: dict, body: np.ndarray, walk: dict) -> list[str]:
    problems = []
    # NO BUILDING MAY CROSS THE PALISADE. _seat() makes this arithmetically impossible, but the
    # boxes can still be hand-edited back to absolute coordinates, which is exactly how four of
    # millbrook's five ended up sticking out of the fence and shipping to the owner.
    import math as _m
    rgc = spec["ring"]
    for b in spec["buildings"]:
        bx, by, bw, bh = b["box"]
        far = max(_m.hypot(px - rgc["cx"], py - rgc["cy"])
                  for px in (bx, bx + bw) for py in (by, by + bh))
        if far > rgc["r"]:
            problems.append(f"building {b['id']} reaches {far:.2f} cells from the centre, "
                            f"outside the palisade at r={rgc['r']}")
    # NO TWO BUILDINGS MAY OVERLAP. Seating by bearing makes crossing the wall impossible but says
    # nothing about neighbours, and the shoreline clamp actively pushes buildings INTO each other:
    # Port Sapphire's first six-on-the-arc layout drew four overlapping pairs.
    bs = spec["buildings"]
    for i in range(len(bs)):
        for j in range(i + 1, len(bs)):
            ax, ay, aw, ah = bs[i]["box"]
            bx2, by2, bw2, bh2 = bs[j]["box"]
            if ax < bx2 + bw2 and bx2 < ax + aw and ay < by2 + bh2 and by2 < ay + ah:
                problems.append(f"buildings {bs[i]['id']} and {bs[j]['id']} overlap")
    sea_ = spec.get("sea")
    if sea_:
        for b in spec["buildings"]:
            bx, by, bw, bh = b["box"]
            if by + bh > sea_["y0"]:
                problems.append(f"building {b['id']} extends to y={by + bh:.1f}, past the "
                                f"shoreline at y={sea_['y0']} -- it is standing in the harbour")
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
    gpx, gpy, _half, gside = gate_point(rg)
    inward = {"S": (0, -1.5), "N": (0, 1.5), "E": (-1.5, 0), "W": (1.5, 0)}[gside]
    gx = int((gpx + inward[0]) * CELL * RASTER)
    gy = int((gpy + inward[1]) * CELL * RASTER)
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
    body, ring, water, bld, paving, well = build_masks(spec)
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
    draw_primer(spec, body, ring, water, bld, paving, well).save(pp)
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
