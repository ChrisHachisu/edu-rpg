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
        hazards={"l": "lava"}, glow=(255, 120, 36), top_accent=0.0, floor_calm=0.38, floor_soft=1.15, floor_sat=0.45),
    "obsidianCavern": dict(
        act=4, sheet="mat-obsidian", theme="obsidian cavern",
        target={"floor": (108, 104, 122), "wall": (34, 28, 50)},
        hazards={"_": "chasm", "p": "pillar"}, void=(10, 6, 20), top_accent=0.30, floor_calm=0.34, floor_soft=1.0),
    "ironMine": dict(
        act=2, sheet="mat-iron-mine", theme="timbered iron mine",
        target={"floor": (126, 110, 86), "wall": (42, 36, 32)},
        # layout smoke only (track E1): rails are plain floor until the mine-cart track paints them
        hazards={"_": "chasm", "+": "chasm"}, void=(8, 7, 9), top_accent=0.0, floor_calm=0.70, floor_soft=0.0),
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
