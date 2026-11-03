"""Round-3 AUTHORED town plans (Act 1 method, scripts/town_layout.py: plan first, art from the plan).

Owner review of the pilot (2026-10-28): characters stood where the player cannot reach them; the
healer's house and the shop must open onto walkable ground; tall things (lamp posts, pillars,
trees beside lanes) cannot be walked behind. Lead review of the first r3 plans: nine copies of one
grid -- each town must keep the character of its picked r2 painting (Ironkeep's terraces, the
walled square and pond, Ravenhollow's crooked lanes and graveyard, the lava channel and bridges,
Cinderwatch's round wall and tower, the pond bazaar, the cliff over the void, the octagon keep).

Per town, in cells (65 across; 1 cell = 30 px of the 1950 plate = 16 world px):
  interior   the town's ground. Walkable = interior - buildings - features - deco - rough.
  paving     where that walkable ground is cobbled (streets, squares); the rest is YARD (snow,
             sand, ash, dead grass) -- both are walkable, the guide shows them in two colours
  buildings  full silhouettes (roof included) with the door on the south face
  features   water, lava, pit, graveyard, retaining walls, void, rock (blocked)
  deco       LOW blocked decoration in yards: wells (round, low rim), flower beds, low fenced
             gardens, carts, woodpiles (never in a street, never tall)
  rough      blocked rough ground inside the town (rock, gardens behind houses)
  stairs / bridges   the only crossings of retaining walls / lava
  spots      maps.ts NPC and save positions (16-grid integers), placed to suit the town;
             every one is recorded against src/data/maps.ts in npc-spots-r3.json
maps.ts integer v maps to cell (v + 0.5) * 65 / 16.

  python3 r3_plans.py <out_dir> [ids]     guides + plan JSON + spots JSON + review sheets + checks
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

P, APC = 1950, 30
ORDER = ["ironkeep", "frostwatch", "hauntedVillage", "oasisHaven", "ruinsCamp", "embersRest",
         "cinderwatch", "lastBastion", "havensEdge"]
GATE = (29.5, 35.5)            # the gate street, 6 cells wide, centred on the frame (32.5)
STREET = GATE                  # (r3_package compatibility)


def c16(v):
    return round((v + 0.5) * 65 / 16, 2)


def R(x0, y0, x1, y1):
    return ("rect", (x0, y0, x1, y1))


def PG(*pts):
    return ("poly", pts)


def E(cx, cy, rx, ry=None):
    return ("ell", (cx, cy, rx, ry if ry is not None else rx))


def B(name, x0, y0, x1, y1, door=None, role="house", note=""):
    return dict(id=name, rect=[x0, y0, x1, y1], door=door if door is not None else round((x0 + x1) / 2, 2),
                role=role, note=note)


def F(name, kind, shape, note=""):
    return dict(id=name, kind=kind, shape=shape, note=note)


GATE_ST = R(GATE[0], 44, GATE[1], 65)

# ------------------------------------------------------------------------------------- the plans
PLANS = {
    # three terraces stepping down the mountain; forge, house and mine on the top terrace
    "ironkeep": dict(
        biome="snow", walled=False, gate_y=50.0,
        interior=PG((6, 3), (60, 3), (60, 48), (6, 48)),
        paving=[R(8, 13.5, 58, 17), R(29.5, 3, 35.5, 50), R(29, 11, 44.5, 13.5), R(8, 28, 58, 31),
                R(50, 31, 54, 33.5), R(7, 42.5, 58, 48)],
        buildings=[
            B("forge", 7, 3, 27, 13.5, door=17, note="the big open-fronted FORGE, glowing hearth and anvil"),
            B("house-n", 36.5, 3, 44.5, 11, door=40.5),
            B("house-w", 8, 19.5, 25, 27.5, door=16.5),
            B("house-e", 38, 19.5, 57, 27.5, door=47.5),
            B("healer", 7, 33.5, 22, 42, door=14.5, role="healer"),
            B("shop", 40, 33.5, 57, 42.5, door=48.5, role="shop", note="Gordo's arms counter, open front"),
        ],
        features=[
            F("mine", "rock", PG((46, 3), (60, 3), (60, 11), (54, 11), (54, 8), (51, 8), (51, 11), (46, 11)),
              "rock shoulder with the timber-propped MINE MOUTH at cells 51-54 opening south onto the mine yard"),
            F("wall-1w", "terrace", R(6, 17, 29.5, 19.5), "dry-stone retaining wall between top and middle terrace"),
            F("wall-1e", "terrace", R(35.5, 17, 60, 19.5), ""),
            F("wall-2w", "terrace", R(6, 31, 29.5, 33.5), "dry-stone retaining wall between middle and lower terrace"),
            F("wall-2e", "terrace", R(35.5, 31, 50, 33.5), ""),
            F("wall-2e2", "terrace", R(54, 31, 60, 33.5), ""),
            F("fence-s-w", "fence", R(6, 48, 29.5, 49), "low rail fence closing the lower terrace, gap only at the gate"),
            F("fence-s-e", "fence", R(35.5, 48, 60, 49), ""),
        ],
        stairs=[R(29.5, 17, 35.5, 19.5), R(29.5, 31, 35.5, 33.5), R(50, 31, 54, 33.5)],
        deco=[F("well", "well", E(32.5, 38.2, 1.6, 1.2), "low round stone well, no roof"),
              F("cart", "cart", R(47, 12, 50, 13.4), "ore cart at the end of a short track from the mine")],
        rough=[],
        spots={"healer": (3, 11), "blacksmith": (4, 3), "gordo": (12, 11), "soldier": (8, 7)}, save=(8, 10),
    ),
    # a walled square: watchtower in the north wall, parade square, frozen pond in snow yard
    "frostwatch": dict(
        biome="snow", walled=True, gate_y=56.0,
        interior=PG((6, 6), (59, 6), (59, 54), (6, 54)),
        paving=[R(29.5, 11, 35.5, 56), R(8, 19, 57, 24), R(26, 27, 39, 37), R(8, 36, 29.5, 39.5),
                R(8, 50, 57, 53.5)],
        buildings=[
            B("watchtower", 29, 0, 36, 11, door=32.5, role="landmark", note="square stone watchtower set in the north wall"),
            B("barracks", 8, 8, 27, 19, door=17.5),
            B("shop", 39, 8, 56, 19, door=47.5, role="shop"),
            B("cottage-a", 9, 27, 17, 36, door=13),
            B("cottage-b", 19, 27.5, 26, 36, door=22.5),
            B("hall", 8, 41.5, 24, 50, door=16.5, note="the long garrison hall"),
            B("healer", 40, 40.5, 57, 50, door=48.5, role="healer"),
        ],
        features=[F("pond", "water", PG((41, 30), (43, 26.5), (47, 25.5), (53, 25.5), (56.5, 27.5), (57, 31),
                                        (54.5, 34), (48, 34.5), (43, 33.5)), "frozen pond with a low stone rim, in a snow yard")],
        stairs=[], deco=[F("basin", "well", E(32.5, 31.5, 1.7, 1.3), "low round stone basin in the parade square, no spire")],
        rough=[], landmark="watchtower",
        spots={"healer": (12, 12), "frostElder": (3, 5), "frostGuard": (7, 12), "mountaineer": (8, 8),
               "frostVillager": (10, 9)}, save=(8, 10),
    ),
    # crooked lanes: chapel north, graveyard east, houses at odd set-backs, healer on the west
    "hauntedVillage": dict(
        biome="haunted", walled=False, gate_y=54.0,
        interior=PG((6, 4), (60, 4), (60, 53), (6, 53)),
        paving=[PG((29.5, 65), (35.5, 65), (35.5, 50), (38.5, 44), (37.5, 38), (31, 35), (26.5, 28), (28, 21),
                   (22, 17), (16.5, 17), (16.5, 21), (21, 22), (22.5, 29), (27.5, 38), (31.5, 43), (29.5, 50)),
                PG((28, 21), (36, 15.5), (47, 15.5), (55, 16.5), (55, 20), (47, 19.5), (37, 20), (29, 25)),
                PG((7, 40), (19, 40.5), (27.5, 38), (31.5, 43), (19, 44.5), (7, 44)),
                PG((37.5, 38), (45, 36), (58, 36.5), (58, 40), (46, 39.5), (38.5, 44))],
        buildings=[
            B("chapel", 16, 4, 29, 17, door=22.5, note="small stone chapel with a bell-cote on its roof"),
            B("house-n", 36, 5, 46, 13.5, door=41),
            B("shop", 49, 4.5, 59, 15, door=54, role="shop"),
            B("house-w", 7, 18.5, 16, 27.5, door=11.5),
            B("house-c", 30.5, 23.5, 40, 31.5, door=35),
            B("healer", 7, 30.5, 19, 40, door=13, role="healer"),
            B("house-sw", 8, 45.5, 22, 50, door=15),
            B("house-se", 41, 43, 57, 50, door=49),
        ],
        features=[F("graveyard", "graveyard", PG((42, 21.5), (58.5, 21), (59, 34.5), (43.5, 34)),
                    "fenced GRAVEYARD of tilted low headstones behind a low picket fence, lych-gate on its south side; "
                    "no trees inside it")],
        stairs=[], deco=[F("well", "well", E(40.5, 34.5, 1.4, 1.1), "low round well, no roof, no crank post")],
        rough=[], spots={"healer": (3, 10), "hauntedElder": (5, 4), "hauntedGuard": (8, 12),
                         "hauntedVillager": (9, 9)}, save=(8, 10),
    ),
    # bazaar round an oasis pond: paved ring road, stalls and houses facing inward, sand yards
    "oasisHaven": dict(
        biome="desert", walled=False, gate_y=54.0,
        interior=PG((5, 3), (60, 3), (60, 52), (5, 52)),
        paving=[PG((21, 12), (46, 12), (49, 16), (49, 37), (46, 40), (21, 40), (18, 37), (18, 16)),
                R(29.5, 40, 35.5, 65), R(7, 34, 18, 38)],
        buildings=[
            B("healer", 6, 4, 18, 13, door=12, role="healer"),
            B("house-n", 24, 3, 39, 10.5, door=31.5),
            B("house-ne", 43, 3, 56, 10.5, door=49.5),
            B("stall-w", 5.5, 21, 17, 32, door=11, note="market stall with a striped awning, counter on its south face"),
            B("shop", 50.5, 18, 60, 33, door=55, role="shop", note="bazaar counter under a striped awning"),
            B("house-sw", 6, 41, 21, 49, door=13.5),
            B("house-se", 39, 41.5, 56, 48.5, door=47.5),
        ],
        features=[F("pond", "water", PG((22, 25), (24, 18.5), (30, 16.5), (38, 16.5), (44, 18.5), (46, 25), (45, 31),
                                        (40, 34.5), (28, 34.5), (23, 31)),
                    "spring-fed oasis POND, reedy edge, a stone landing on its south side; NO palms beside it")],
        stairs=[], deco=[F("bed-sw", "bed", R(23, 44, 27.5, 47), "low flower bed"),
                         F("crates-e", "cart", R(56.5, 36, 59.5, 38), "low stack of crates")],
        rough=[], spots={"healer": (3, 3), "oasisElder": (6, 9), "archaeologist": (11, 3), "luna": (8, 3)},
        save=(8, 10),
    ),
    # excavation in a canyon: dig pit west-centre, dig office north, tents, supply stall east
    "ruinsCamp": dict(
        biome="desert", walled=False, gate_y=54.0,
        interior=PG((6, 3), (59, 3), (59, 52), (6, 52)),
        paving=[R(29.5, 12, 35.5, 65), R(25, 10, 41, 13), R(36, 28, 58, 31.5), R(8, 48.5, 29.5, 52)],
        buildings=[
            B("dig-office", 26, 2, 40, 10, door=33, role="landmark", note="timber dig office hut"),
            B("tent-nw", 9, 4, 18, 10.5, door=13.5),
            B("healer", 44, 4, 56, 12.5, door=50, role="healer", note="camp medic's hut"),
            B("shop", 40, 17, 58, 28, door=49, role="shop", note="supply tent-stall with a long counter"),
            B("store", 9, 40, 24, 48.5, door=16.5, note="finds store"),
            B("tent-se1", 40, 37, 48, 44, door=44),
            B("tent-se2", 50, 40, 58, 47, door=54),
        ],
        features=[F("pit", "pit", R(6, 14, 27.5, 37),
                    "rectangular DIG PIT, stepped earth sides, ladders, string grid; knee-high ruined wall stubs on "
                    "its rim, no standing columns")],
        stairs=[], deco=[F("sieves", "cart", R(37, 33, 40, 35), "low sieves and finds crates")],
        rough=[], landmark="dig-office",
        spots={"healer": (12, 3), "explorer": (7, 6), "mercenary": (9, 3)}, save=(8, 10),
    ),
    # lava channel across the town, two bridges; forge north-west, shop east, healer south-east
    "embersRest": dict(
        biome="ash", walled=False, gate_y=58.0,
        interior=PG((5, 3), (60, 3), (60, 56), (5, 56)),
        paving=[R(29.5, 13, 35.5, 65), R(7, 13, 58, 18), R(13.5, 18, 18.5, 27), R(29.5, 38, 58, 40.5),
                R(24, 40.5, 46, 56)],
        buildings=[
            B("forge", 6, 3, 21, 13, door=14, note="the Forgemaster's forge, glowing hearth"),
            B("house-n", 24, 3, 36, 11.5, door=30),
            B("house-ne", 42, 3, 58, 13, door=50),
            B("house-w", 6, 27, 22, 38, door=14),
            B("shop", 41, 27, 58, 38, door=49.5, role="shop"),
            B("healer", 46, 42, 59, 51, door=52.5, role="healer"),
        ],
        features=[F("lava", "lava", PG((5, 19), (13.5, 18.5), (18.5, 19), (29.5, 19.5), (35.5, 19.5), (60, 19), (60, 26),
                                        (35.5, 25.5), (29.5, 25.5), (18.5, 25.5), (13.5, 26), (5, 25.5)),
                    "LAVA CHANNEL sunk in black basalt, raised cracked rims on both banks")],
        bridges=[R(13.5, 18, 18.5, 27), R(29.5, 18, 35.5, 27)],
        stairs=[], deco=[F("woodpile", "cart", R(8, 47, 12, 49), "low woodpile")],
        rough=[], spots={"healer": (12, 13), "forgemaster": (3, 3), "lavaMiner": (6, 7)}, save=(8, 10),
    ),
    # round wall with the watchtower at its crown, lava moat across the south, healer west, shop east
    "cinderwatch": dict(
        biome="ash", walled=True, gate_y=56.5,
        interior=PG((7, 22), (9, 15), (14, 10), (21, 7), (29, 5.5), (36, 5.5), (44, 7), (51, 10), (56, 15),
                    (58, 22), (58, 49), (7, 49)),
        paving=[R(29.5, 11, 35.5, 65), R(9, 20, 56, 24), R(9, 36.5, 56, 40), R(18, 40, 47, 49)],
        buildings=[
            B("watchtower", 28.5, 0, 36.5, 11, door=32.5, role="landmark", note="stone watchtower in the wall's crown, beacon on top"),
            B("mill", 10, 10, 26, 20, door=18),
            B("healer", 39, 10, 54, 20, door=46.5, role="healer"),
            B("shop", 8, 25, 22, 36.5, door=14.5, role="shop"),
            B("house-e", 40, 25, 57, 36.5, door=48.5),
            B("house-sw", 8, 41.5, 16, 46, door=12),
            B("house-se", 49, 41.5, 57, 46, door=53),
        ],
        features=[F("moat-w", "lava", R(0, 51, 29.5, 55.5), "LAVA MOAT across the south of the town"),
                  F("moat-e", "lava", R(35.5, 51, 65, 55.5), "")],
        bridges=[R(29.5, 50, 35.5, 56.5)],
        stairs=[], deco=[], rough=[R(0, 49, 29.5, 51), R(35.5, 49, 65, 51)], landmark="watchtower",
        spots={"healer": (11, 5), "watchCaptain": (8, 3), "ashScout": (12, 9), "cinderVillager": (5, 10)},
        save=(8, 10),
    ),
    # octagonal fortress: keep in the north wall, muster road, healer and shop facing each other
    "lastBastion": dict(
        biome="barren", walled=True, gate_y=56.0,
        interior=PG((14, 5), (51, 5), (58, 12), (58, 47), (51, 54), (14, 54), (7, 47), (7, 12)),
        paving=[R(29.5, 13, 35.5, 65), R(9, 24.5, 56, 28.5), R(9, 37, 56, 40.5), R(26, 13, 39, 16)],
        buildings=[
            B("keep", 24, 0, 41, 13, door=32.5, role="landmark", note="square stone keep set in the north wall"),
            B("house-nw", 13, 13, 26, 24.5, door=19.5),
            B("house-ne", 39, 13, 52, 24.5, door=45.5),
            B("shop", 9, 28.5, 25, 37, door=17, role="shop"),
            B("healer", 40, 28.5, 56, 37, door=48, role="healer"),
            B("barracks", 10, 42, 26, 51, door=18),
            B("armoury", 39, 42, 55, 51, door=47),
        ],
        features=[], stairs=[], rough=[], landmark="keep",
        deco=[F("bed-w", "bed", R(27, 30, 29.3, 35), "low flower bed along the muster road"),
              F("bed-e", "bed", R(35.7, 30, 38, 35), "low flower bed along the muster road")],
        spots={"healer": (12, 9), "veteran": (8, 3), "priestess": (5, 6)}, save=(8, 10),
    ),
    # hamlet on the cliff over the void: houses south-west, a lookout yard on the cliff top
    "havensEdge": dict(
        biome="barren", walled=False, gate_y=57.0,
        interior=PG((5, 3), (37, 3), (61, 34), (61, 55), (5, 55)),
        paving=[R(29.5, 12, 35.5, 65), R(7, 12.5, 40, 16.5), R(7, 35, 56, 39), R(7, 51, 58, 55)],
        buildings=[
            B("house-nw", 8, 3, 20, 12.5, door=14),
            B("healer", 22, 3, 32, 11, door=27, role="healer"),
            B("house-w", 6, 21, 16, 31, door=11),
            B("house-c", 18, 22, 28, 32, door=23),
            B("shop", 38, 24, 52, 35, door=45, role="shop"),
            B("house-sw", 7, 42, 22, 51, door=14.5),
            B("house-se", 40, 42, 56, 51, door=48),
        ],
        features=[F("void", "void", PG((38, 0), (65, 0), (65, 36), (62, 33), (38, 2)),
                    "the edge of the world: a crumbling rock lip, the cliff face below it, a starry purple void beyond"),
                  F("graves", "graveyard", R(6.5, 17.5, 10.5, 20), "three low headstones")],
        stairs=[], deco=[F("well", "well", E(45, 20, 1.3, 1.0), "low round well on the cliff-top yard")],
        rough=[], spots={"healer": (6, 3), "grizzledKnight": (7, 12), "prophetess": (9, 4), "kiki": (5, 4)},
        save=(8, 10),
    ),
}


# ------------------------------------------------------------------------------------ rasterise
def draw(shapes, scale=APC, size=P):
    im = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(im)
    for k, s in shapes:
        if k == "rect":
            x0, y0, x1, y1 = s
            d.rectangle([x0 * scale, y0 * scale, x1 * scale - 1, y1 * scale - 1], fill=255)
        elif k == "ell":
            cx, cy, rx, ry = s
            d.ellipse([(cx - rx) * scale, (cy - ry) * scale, (cx + rx) * scale, (cy + ry) * scale], fill=255)
        else:
            d.polygon([(x * scale, y * scale) for x, y in s], fill=255)
    return np.asarray(im) > 127


def _m(shapes):
    return draw(shapes) if shapes else np.zeros((P, P), bool)


def masks(plan):
    inter = draw([plan["interior"], GATE_ST])
    bld = _m([R(*b["rect"]) for b in plan["buildings"]])
    feat = _m([f["shape"] for f in plan["features"]])
    cross = _m(plan.get("stairs", []) + plan.get("bridges", []))
    deco = _m([f["shape"] for f in plan.get("deco", [])])
    rough = _m(plan.get("rough", []))
    walk = inter & ~bld & (~feat | cross) & ~deco & ~rough
    # back yards: the ground between a north-row building and the top edge is rough ground
    for b in plan["buildings"]:
        x0, y0, x1, y1 = b["rect"]
        if 0 < y0 < 12 and b["role"] != "landmark":
            walk &= ~draw([R(x0 - 0.01, 0, x1 + 0.01, y0)])
    # no slivers under 3 cells (unusable, reads as half-finished); the gate street runs on past the frame
    sq = np.ones((29, 29), bool)
    w3 = np.pad(walk[::3, ::3], ((0, 40), (0, 0)), mode="edge")
    small = ndi.binary_opening(w3, structure=sq)[:-40]
    # decoration and stairs must not be eaten by the opening: keep walk next to them
    walk = walk & (np.repeat(np.repeat(small, 3, 0), 3, 1)[:P, :P] | ndi.binary_dilation(deco[::3, ::3], iterations=12).repeat(3, 0).repeat(3, 1)[:P, :P])
    lab, n = ndi.label(walk)
    if n > 1:
        sz = ndi.sum(np.ones_like(walk), lab, index=np.arange(1, n + 1))
        walk = lab == 1 + int(sz.argmax())
    pav = _m(plan["paving"]) & walk
    return walk, pav, bld, feat, cross, deco, inter


def spots(tid, plan):
    import build_town as bt
    data = bt.maps_ts().get(tid) or bt.cinderwatch_proposal()
    out = []
    for n in data["npcs"]:
        v = (n["x"], n["y"])
        new = plan["spots"].get(n["id"], v)
        out.append(dict(id=n["id"], mapsTs=list(v), new=list(new), moved=list(new) != list(v),
                        cell=[c16(new[0]), c16(new[1])]))
    sv = data["savePoint"]
    new = plan.get("save", sv)
    out.append(dict(id="savePoint", mapsTs=list(sv), new=list(new), moved=list(new) != list(sv),
                    cell=[c16(new[0]), c16(new[1])]))
    return out


def check(tid, plan, walk):
    """Hero feet stencil (check_feet.py) from the gate: every NPC spot stands on stencil-free ground
    and is reached; every door has a reachable landing below it, the healer's and shop's and the
    save point with one cell to spare; walkable ground touches the frame only at the gate."""
    import check_feet as ck
    pts = ck.stencil()
    w2 = walk[::2, ::2]
    res = {}
    cp = APC / 2
    gate = (32.5, 63.5)
    for name, pad in (("strict", 0), ("comfort", 7)):
        st, _ = ck.footprint(pts, pad)
        free = ndi.binary_erosion(w2, structure=st, border_value=0)
        lab, _ = ndi.label(free)
        g = lab[int(gate[1] * cp), int(gate[0] * cp)]
        res[name] = (lab == g) if g else np.zeros_like(free)
    reach, comfort = res["strict"], res["comfort"]
    yy, xx = np.mgrid[0:reach.shape[0], 0:reach.shape[1]]

    def near(m, c, r):
        return bool((m & ((xx - c[0] * cp) ** 2 + (yy - c[1] * cp) ** 2 <= (r * cp) ** 2)).any())

    def on(m, c):
        return bool(m[int(c[1] * cp), int(c[0] * cp)])
    fails = []
    sp = spots(tid, plan)
    for s in sp:
        if s["id"] == "savePoint":
            if not near(comfort, s["cell"], 0.5):
                fails.append("savePoint lacks a spare cell")
        elif not near(reach, s["cell"], 0.5):
            fails.append(f"{s['id']} {s['new']} not on reachable ground")
    for b in plan["buildings"]:
        if b["role"] == "landmark" and plan.get("walled"):
            continue                   # set into the wall; its door is decoration
        land = [b["door"], b["rect"][3] + 1.0]
        if not near(reach, land, 1.0):
            fails.append(f"{b['id']} door landing {land} unreachable")
        if b["role"] in ("healer", "shop") and not near(comfort, land, 1.2):
            fails.append(f"{b['id']} landing lacks a spare cell")
    if not near(comfort, (32.5, plan["gate_y"]), 1.0):
        fails.append("gate fails comfort")
    edge = walk.copy()
    edge[3:-3, 3:-3] = False
    ys, xs = np.nonzero(edge)
    if len(xs) and (ys.min() < P - 3 or xs.min() < GATE[0] * APC - 1 or xs.max() > GATE[1] * APC):
        fails.append("walkable touches the frame away from the gate")
    if ndi.label(walk)[1] != 1:
        fails.append("walkable is not one piece")
    return fails, sp, reach, comfort


# ---------------------------------------------------------------------------------------- guide
YARD = {"snow": (240, 243, 248), "haunted": (214, 218, 228), "desert": (232, 206, 150),
        "ash": (138, 126, 118), "barren": (152, 140, 128)}
ROUGH = {"snow": (170, 180, 196), "haunted": (150, 150, 166), "desert": (184, 138, 94),
         "ash": (74, 66, 64), "barren": (98, 90, 86)}
BORDER = {"snow": ((40, 80, 50), (190, 196, 206)), "haunted": ((60, 54, 50), (110, 106, 118)),
          "desert": ((150, 104, 70), (184, 138, 94)), "ash": ((50, 44, 44), (90, 80, 76)),
          "barren": ((60, 54, 50), (104, 94, 86))}
LIQUID = {"water": (110, 170, 220), "lava": (236, 96, 30), "void": (24, 12, 44)}
FEAT_COL = {"rock": (104, 94, 86), "terrace": (84, 86, 98), "pit": (160, 112, 64), "graveyard": (120, 136, 108),
            "fence": (120, 84, 50)}
DECO_COL = {"well": (90, 110, 140), "bed": (110, 150, 80), "cart": (150, 110, 70)}
ROOFS = [(70, 90, 140), (120, 70, 60), (90, 110, 90), (110, 100, 130), (140, 110, 70)]
LANE = (176, 174, 170)


def guide(tid, plan, walk, pav, bld, feat, cross, deco, inter):
    b = plan["biome"]
    img = np.zeros((P, P, 3), np.uint8)
    yy, xx = np.mgrid[0:P, 0:P]
    blob = ((xx // 90 + yy // 90) % 2 == 0)
    outer = ~inter
    dist = ndi.distance_transform_edt(outer)
    img[outer & blob] = BORDER[b][0]
    img[outer & ~blob] = BORDER[b][1]
    if plan.get("walled"):
        img[outer & (dist <= APC * 3.0)] = (84, 86, 98)
    img[inter] = ROUGH[b]
    img[walk] = YARD[b]
    img[pav] = LANE
    for f in plan["features"]:
        m = draw([f["shape"]]) & ~cross
        img[m] = LIQUID.get(f["kind"], FEAT_COL.get(f["kind"], (120, 120, 120)))
    img[cross & ~bld] = (200, 196, 188)
    for f in plan.get("deco", []):
        img[draw([f["shape"]])] = DECO_COL.get(f["kind"], (150, 120, 90))
    d = Image.fromarray(img)
    dr = ImageDraw.Draw(d)
    for i, bb in enumerate(plan["buildings"]):
        x0, y0, x1, y1 = [v * APC for v in bb["rect"]]
        cut = y1 - 0.38 * (y1 - y0)
        col = ((214, 52, 52) if bb["role"] == "shop" else (52, 176, 84) if bb["role"] == "healer"
               else (150, 150, 162) if bb["role"] == "landmark" else ROOFS[i % len(ROOFS)])
        dr.rectangle([x0, y0, x1 - 1, cut], fill=col)
        dr.rectangle([x0, cut, x1 - 1, y1 - 1], fill=(112, 74, 46))
        dx = bb["door"] * APC
        dw = 1.4 * APC if bb["role"] != "shop" else 0.35 * (x1 - x0)
        dr.rectangle([dx - dw / 2, y1 - 1.1 * APC, dx + dw / 2, y1 - 1], fill=(48, 30, 18))
    return d


FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def review(tid, g, plan, sp, reach, comfort, fails):
    """Guide + stencil reach + spots, for the lead (NOT given to Codex)."""
    a = np.asarray(g).astype(np.float32)
    r = np.repeat(np.repeat(reach, 2, 0), 2, 1)[:P, :P]
    c = np.repeat(np.repeat(comfort, 2, 0), 2, 1)[:P, :P]
    edge = r ^ ndi.binary_erosion(r, iterations=3)
    a[edge] = (0, 200, 255)
    im = Image.fromarray(a.astype(np.uint8))
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(FONT, 34)
    for s in sp:
        x, y = s["cell"][0] * APC, s["cell"][1] * APC
        col = (255, 255, 255) if s["id"] == "savePoint" else (255, 140, 0) if s["moved"] else (40, 90, 255)
        d.ellipse([x - 15, y - 15, x + 15, y + 15], fill=col, outline=(0, 0, 0), width=4)
        d.text((x + 18, y - 18), s["id"], fill=col, font=f, stroke_width=5, stroke_fill=(0, 0, 0))
    for bb in plan["buildings"]:
        x, y = bb["door"] * APC, (bb["rect"][3] + 1.0) * APC
        d.rectangle([x - 9, y - 9, x + 9, y + 9], outline=(255, 255, 0), width=5)
    d.text((20, 20), f"{tid}: " + ("ALL CHECKS PASS" if not fails else "; ".join(fails))[:80],
           fill=(255, 255, 0), font=f, stroke_width=5, stroke_fill=(0, 0, 0))
    return im.resize((975, 975), Image.LANCZOS)


def build(tid, out):
    plan = PLANS[tid]
    walk, pav, bld, feat, cross, deco, inter = masks(plan)
    fails, sp, reach, comfort = check(tid, plan, walk)
    g = guide(tid, plan, walk, pav, bld, feat, cross, deco, inter)
    A, V, Pd = (os.path.join(out, d) for d in ("anchors", "review", "plans"))
    for p in (A, V, Pd):
        os.makedirs(p, exist_ok=True)
    g.resize((975, 975), Image.NEAREST).save(os.path.join(A, f"{tid}-layout-guide-r3.png"))
    review(tid, g, plan, sp, reach, comfort, fails).save(os.path.join(V, f"{tid}-plan-review.png"))
    doc = {"town": tid, "units": "cells (65 across, 30 px of the 1950 plate each)", "gate": GATE,
           "gateRow": plan["gate_y"], "interior": plan["interior"], "paving": plan["paving"],
           "buildings": [dict(b, doorLanding=[b["door"], b["rect"][3] + 1.0]) for b in plan["buildings"]],
           "features": plan["features"], "deco": plan.get("deco", []), "rough": plan.get("rough", []),
           "stairs": plan.get("stairs", []), "bridges": plan.get("bridges", []), "spots": sp,
           "walkableFraction": round(float(walk.mean()), 3), "pavedFraction": round(float(pav.mean()), 3),
           "checks": fails or "PASS"}
    json.dump(doc, open(os.path.join(Pd, f"{tid}-plan.json"), "w"), indent=1)
    return tid, fails, sp


def sheet(out):
    s = Image.new("RGB", (3 * 650, 3 * 650))
    for i, t in enumerate(ORDER):
        s.paste(Image.open(os.path.join(out, "review", f"{t}-plan-review.png")).resize((650, 650)),
                ((i % 3) * 650, (i // 3) * 650))
    s.save(os.path.join(out, "review", "all-plans-review.png"))


if __name__ == "__main__":
    from multiprocessing import Pool
    out = sys.argv[1]
    ids = sys.argv[2:] or ORDER
    with Pool(5) as p:
        res = p.starmap(build, [(t, out) for t in ids])
    allspots = {}
    for tid, fails, sp in res:
        allspots[tid] = [{k: s[k] for k in ("id", "mapsTs", "new", "moved", "cell")} for s in sp]
        print(f"{tid:15s} {'PASS' if not fails else fails}")
    if len(ids) == len(ORDER):
        json.dump({"_comment": "NPC and save spots for src/data/maps.ts (x, y in the 16-grid) from the "
                               "round-3 town plans. 'mapsTs' is today's value, 'new' is what maps.ts should "
                               "carry, 'cell' the 65-cell town position (v + 0.5) * 65 / 16. cinderwatch has "
                               "no maps.ts entry yet (proposal ids).",
                   "towns": allspots}, open(os.path.join(out, "npc-spots-r3.json"), "w"), indent=1)
        sheet(out)
