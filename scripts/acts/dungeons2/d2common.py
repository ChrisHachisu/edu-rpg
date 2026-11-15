"""Shared paths and the per-dungeon art table for the AUTHORED Acts 2-5 dungeons (track E1).

plan JSON (qok-floorplan-v1)  ->  render_plan.py  ->  <work>/art/<floor>-{material.webp,walk.png,over.webp,art.json}
                              ->  export_runtime.py -> public/acts-dungeons/{manifest.json,<dungeon>/...}

Nothing here is hand work: a layout tweak is `render_plan.py <floor>` + `export_runtime.py`.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
SCRIPTS = os.path.join(ROOT, "scripts")
PLANS = os.environ.get("D2_PLANS", "/home/user/work/plans/out")
CODEX = os.environ.get("D2_CODEX", "/home/user/work/codex/out")
WORK = os.environ.get("D2_WORK", "/home/user/work/e1")
MATROOT = os.path.join(WORK, "materials")
ART = os.path.join(WORK, "art")
PUBLIC = os.path.join(ROOT, "public", "acts-dungeons")
CELL = 48

for p in (HERE, SCRIPTS):
    if p not in sys.path:
        sys.path.insert(0, p)

# terrain chars a hero can stand on with no mechanic state (SCHEMA.md)
WALKABLE = set(".=gtzqh")

# One entry per dungeon the art pipeline knows. `hazards` maps a terrain char to how it is PAINTED
# (collision always follows the painted edge). A dungeon missing here cannot be rendered yet.
#   lava   molten pool from the sheet's accent quadrant, crust rim, glow on what stands near it
#   chasm  a drop: cliff face under the north lip, dark below
#   pillar a standing rock column on one cell (base in the floor picture, top in the over layer)
DUNGEONS = {
    "emberMines": dict(
        act=4, sheet="mat-ember-mine", theme="ember mine",
        target={"floor": (122, 88, 70), "wall": (44, 28, 26)},
        # E2: the glowing pebbles read busy. Measured against Obsidian's calm floor the grain was no
        # stronger; the colour spread was 2.6x. So the specks lose their own hue (floor_sat) and the
        # pebble band is turned down (floor_coarse); the lava keeps the sheet's full fire.
        hazards={"l": "lava"}, glow=(255, 120, 36), top_accent=0.0, floor_calm=0.40, floor_soft=0.9, floor_sat=0.10, floor_coarse=0.42),
    "obsidianCavern": dict(
        act=4, sheet="mat-obsidian", theme="obsidian cavern",
        target={"floor": (108, 104, 122), "wall": (34, 28, 50)},
        hazards={"_": "chasm", "p": "pillar"}, void=(10, 6, 20), top_accent=0.30, floor_calm=0.34, floor_soft=1.0),
    # mine-carts. Rails are part of the picture: '=' on the ground (open), '+' on a timber trestle
    # over the chasm (closed; the cart carries her across, so it is a declared link).
    "ironMine": dict(
        act=2, sheet="mat-iron-mine", theme="timbered iron mine",
        target={"floor": (126, 110, 86), "wall": (42, 36, 32)},
        hazards={"_": "chasm", "+": "chasm"}, void=(8, 7, 9), top_accent=0.0, floor_calm=0.50, floor_soft=0.8,
        rails="=+", trestle="+", links="+"),
    # slide-ice. '~' is ice she slides on: open in the mask, painted from the sheet's ice quadrant.
    # 'o' frosted rocks stand on the ice: painted boulders, closed.
    "frozenLake": dict(
        act=2, sheet="mat-ice", theme="frozen lake",
        target={"floor": (172, 190, 216), "wall": (40, 86, 132)},
        hazards={"o": "boulder"}, surfaces={"~": dict(tex="accent", calm=0.50, target=(88, 150, 206), sheen=26.0, rim=0.30)},
        open="~", boulder_frost=0.85, boulder_tint=1.25, top_accent=0.0, floor_calm=0.50, floor_soft=0.8),
    # gust-walkways. A tower: '_' the drop inside it and '^' the sky round it are both open air.
    "stormNest": dict(
        act=2, sheet="mat-tower-sky", theme="sky tower",
        target={"floor": (160, 150, 128), "wall": (86, 94, 112)},
        hazards={"_": "chasm", "^": "chasm"}, void_style="sky", sky=((112, 152, 200), (228, 238, 248)),
        cliff=0.95, cliff_gain=1.9, top_accent=0.0, floor_calm=0.60, floor_soft=0.6),
    "shadowCave": dict(
        act=2, sheet="mat-shadow-cave", theme="shadow cave",
        target={"floor": (98, 84, 120), "wall": (30, 24, 44)},
        top_accent=0.22, floor_calm=0.40, floor_soft=0.8),
    # forest-rooms. The "rock" is trees: root-and-trunk walls with fern and mist on their tops.
    "hauntedForest": dict(
        act=2, sheet="mat-forest-maze", theme="haunted forest",
        target={"floor": (116, 92, 64), "wall": (30, 38, 26)},
        top_accent=0.55, floor_calm=0.45, floor_soft=0.8, floor_sat=0.60, floor_coarse=0.70),
    # glyph-plates. Each plate zone is a blank stone slab let into the floor; glyphs are the module's.
    "desertTomb": dict(
        act=3, sheet="mat-tomb", theme="desert tomb",
        target={"floor": (186, 150, 96), "wall": (84, 58, 30)},
        plate_zones=("glyphPlate",), top_accent=0.0, floor_calm=0.55, floor_soft=0.6),
    "banditHideout": dict(
        act=3, sheet="mat-bandit-hideout", theme="bandit hideout",
        target={"floor": (130, 100, 66), "wall": (46, 33, 24)},
        top_accent=0.0, floor_calm=0.42, floor_soft=1.0),
    # cracked-walls. 'x' is a wall until the module breaks it (closed, painted as wall, a declared
    # link); 'h' is the floor of the room behind it (open).
    "scorchedRuins": dict(
        act=3, sheet="mat-scorched-ruin", theme="scorched ruins",
        target={"floor": (124, 110, 100), "wall": (44, 31, 29)},
        rock="x", links="x", top_accent=0.18, floor_calm=0.50, floor_soft=0.8),
    # crust-bridges. 'c' is painted as the lava it is when the crust is gone (closed); the module
    # draws the crust and opens it, so it is a declared link.
    "magmaTunnels": dict(
        act=4, sheet="mat-lava", theme="magma tunnels",
        target={"floor": (112, 94, 90), "wall": (40, 27, 28)},
        hazards={"l": "lava", "c": "lava"}, links="c", glow=(255, 110, 30), top_accent=0.0, floor_calm=0.45, floor_soft=0.9),
    # lava-channels. 't' troughs are plain floor (the module draws them); 'm' molds are lava until
    # the module fills them with iron (closed, a declared link).
    "volcanicForge": dict(
        act=4, sheet="mat-volcanic-forge", theme="volcanic forge",
        target={"floor": (118, 102, 94), "wall": (52, 31, 23)},
        hazards={"l": "lava", "m": "lava"}, links="m", glow=(255, 130, 40), top_accent=0.0, floor_calm=0.50, floor_soft=0.7),
    "demonBarracks": dict(
        act=4, sheet="mat-demon-barracks", theme="demon barracks",
        target={"floor": (106, 94, 88), "wall": (52, 27, 25)},
        hazards={"p": "pillar"}, top_accent=0.0, floor_calm=0.50, floor_soft=0.7),
    # push-ice. '~' is the puzzle chambers' ice floor (she walks on it; open); 'o' stop crystals are
    # painted frosted rocks (closed); 'w' is water until the module slides a block into it (link).
    "frostfallCavern": dict(
        act=5, sheet="mat-frost-crystal", theme="frostfall cavern",
        target={"floor": (160, 184, 216), "wall": (42, 74, 116)},
        hazards={"o": "boulder", "w": "water"}, surfaces={"~": dict(tex="accent", calm=0.50, target=(104, 164, 212), sheen=24.0, rim=0.30)},
        open="~", links="w", boulder_frost=0.55, boulder_tint=1.35, top_accent=0.0, floor_calm=0.50, floor_soft=0.8),
    # storm-terrace. A tower in a storm: '_' and '^' are dark cloud; 'z' terraces are plain floor.
    "stormreachSpire": dict(
        act=5, sheet="mat-tower-storm", theme="storm spire",
        target={"floor": (122, 116, 108), "wall": (40, 46, 56)},
        hazards={"_": "chasm", "^": "chasm"}, void_style="sky", sky=((30, 36, 54), (104, 112, 134)),
        cliff=0.95, cliff_gain=1.9, top_accent=0.0, floor_calm=0.50, floor_soft=0.7),
    "sunkenTempleDungeon": dict(
        act=5, sheet="mat-sunken-temple", theme="sunken temple",
        target={"floor": (98, 114, 92), "wall": (32, 50, 46)},
        top_accent=0.0, floor_calm=0.42, floor_soft=0.9),
    # matching-portals. Portals are the module's sprites on plain floor; a pair is a declared link.
    "twilightDungeon": dict(
        act=5, sheet="mat-twilight", theme="twilight realm",
        target={"floor": (130, 106, 126), "wall": (36, 38, 64)},
        pair_links={"portal": "pair"}, top_accent=0.25, floor_calm=0.45, floor_soft=0.8),
    # drifting-blocks. '_' and 'v' are the same starry void (closed); a block carries her along 'v'.
    "voidRift": dict(
        act=5, sheet="mat-void", theme="void rift",
        target={"floor": (134, 108, 172), "wall": (26, 21, 42)},
        hazards={"_": "chasm", "v": "chasm"}, void_style="tex", void_gain=0.85, cliff=1.0, links="v",
        top_accent=0.0, floor_calm=0.40, floor_soft=1.0),
    # sluice-wheels (plans recovered from the review artifact; no module yet). Every channel is
    # painted as its dry stone bed and is open; a module draws the water and closes flooded ones.
    "oasisDepths": dict(
        act=3, sheet="mat-oasis-depths", theme="oasis depths",
        target={"floor": (190, 138, 76), "wall": (98, 60, 34)},
        open="wd", plate_zones=("channel",), plate_gain=0.78, plate_tint=(0.90, 1.0, 1.08),
        top_accent=0.0, floor_calm=0.50, floor_soft=0.8),
}


def plan_path(fid):
    return os.path.join(PLANS, f"{fid}.json")


def load_plan(fid):
    p = json.load(open(plan_path(fid)))
    assert p["schema"] == "qok-floorplan-v1", fid
    assert p["cellPx"] == CELL, fid
    return p


def floors_of(did):
    p1 = load_plan(f"{did}-f1")
    return [f"{did}-f{n}" for n in range(1, p1["totalFloors"] + 1)]


SIDE = {"down": (0, 1), "up": (0, -1), "left": (-1, 0), "right": (1, 0),
        "south": (0, 1), "north": (0, -1), "west": (-1, 0), "east": (1, 0)}


def open_chars(did):
    """Plan characters this dungeon's walk mask (and the engine's '.' rows) opens: the schema's
    walkable set plus the dungeon table's `open` (ice she slides on, a crust she may cross)."""
    return WALKABLE | set(DUNGEONS.get(did, {}).get("open", ""))


def link_chars(did):
    """Plan characters that are CLOSED in the mask but that the dungeon's mechanic carries her
    across (a trestle the cart rides, a block lane, a mold that fills, a wall that breaks).
    export_runtime.py joins the ground on either side of such cells instead of failing."""
    return set(DUNGEONS.get(did, {}).get("links", ""))


def mouth_cells(plan, m):
    """The cells a mouth owns: its own cell plus the walkable cells beside it across the corridor
    (so the whole corridor width leaves), and the art-only run from there to the map edge."""
    rows, W, H = plan["rows"], plan["width"], plan["height"]
    WALKABLE = open_chars(plan["dungeonId"])
    dx, dy = SIDE.get(m.get("side", "down"), (0, 1))
    px, py = (1, 0) if dx == 0 else (0, 1)                    # across the corridor
    cells = [(m["x"], m["y"])]
    for s in (1, -1):
        x, y = m["x"] + s * px, m["y"] + s * py
        while 0 <= x < W and 0 <= y < H and rows[y][x] in WALKABLE and len(cells) < 7:
            cells.append((x, y)); x += s * px; y += s * py
    run = []
    for (cx, cy) in cells:
        x, y = cx + dx, cy + dy
        while 0 <= x < W and 0 <= y < H:
            run.append((x, y)); x += dx; y += dy
    return cells, run, (dx, dy)
