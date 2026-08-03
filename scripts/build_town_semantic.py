#!/usr/bin/env python3
"""Generate Act-1 town semantic maps: one settlement plan type per town.

Owner, 2026-07-31: "this is a complete redo of all towns. resize, regenerate, and place npcs
from scratch. do not follow what the previous version did other than which npcs are in the
town, what is sold at the shops, and how much the healer costs".

Spec: design/act1-towns/PORT-SAPPHIRE-SPEC.md


WHY THE SHIPPED TOWNS ARE NOT A LAYOUT REFERENCE
------------------------------------------------
Every shipped town is 16x16 with no tile array; the interior is produced at load time by
`wp(width, height, mapId.charCodeAt(0) * 137)` -- seeded from the FIRST CHARACTER of the map
id. So towns sharing an initial letter are byte-identical inside: hauntedVillage/havensEdge,
frostwatch/frostfallVillage, stormreachVillage/sunkenTempleVillage. ART-DIRECTION.md rule 4
forbids "one repeated rectangular town template" outright, so none of it is used here.


LAYER 1 -- SPACE: bent streets, and frontage grown off them
-----------------------------------------------------------
Two rules, and the first one is the one that decides whether this reads as a town or as a
lattice with houses in it.

STREETS ARE POLYLINES, NEVER RULED LINES. An earlier version of this generator put the quay
on a fixed row and the lanes on fixed columns. Every validation gate passed and it still read
as graph paper, because a perfect grid is to a town what MapGenerator's axis-aligned rooms
were to a cave -- ART-DIRECTION.md rule 5, in a different costume. Smoothing cannot save it:
the dungeons soften well because their shape is ALREADY organic before the material renderer
touches it, and softening the edges of a grid just yields a grid with soft edges. So here the
coastline wobbles, the quay follows the water rather than a row, and the lanes bend as they
climb. This is the town analogue of joint control in build_dungeon_semantic.py.

BUILDINGS ARE RECTANGLES ANYWAY, AND THAT IS CORRECT. Architecture is rectilinear; caves are
not. The organic quality of a real street row comes from the STREET bending and each house
sitting at its own setback along it, not from bent houses. So each plot stays a clean
rectangle, and the row steps as the street it fronts steps.

Growth itself is frontage-driven: a plot fronts the street and runs back the depth of the
block (the burgage plot). Scattering buildings with jitter produces a campsite; consuming
street frontage produces a town.


LAYER 2 -- PATTERN: one settlement plan per town
------------------------------------------------
The direct analogue of Palmer's cave patterns. Uniqueness comes from plan type plus site,
never from reskinning one procedure:

  harbour     quay street parallel to the water, lanes climbing inland. Port Sapphire.
  linear      one street, buildings both sides. The starter town reads instantly.
  crossroads  two streets, market at the junction, four unequal quadrants.
  market      the street widens into an irregular plaza; buildings ring it.
  radial      lanes radiate from a shrine or keep on a rise, ring lanes between them.
  walled      the wall is the constraint; dense infill, a gate plaza inside each gate.

Port Sapphire is HARBOUR: the sea does the work joint control does in the caves.


LAYER 3 -- LEGIBILITY: no ambiguous cell
----------------------------------------
The hard part that dungeons never had. In a cave, walkable is carved floor and rock is
obviously rock. In a town everything is flat ground, so the player must know at a glance
which flat ground walks. The shipped engine already decides this purely by tile index --
blocking {1,2,4,6,8,9,10,11,12,13,14,15}, leaving exactly Floor, Grass, Path, Exit -- so the
rule is not a new convention to police, it is the existing tile contract. The generator
satisfies it by painting streets only from the walkable set and structure only from the
blocked set, and by converting any grass it cannot reach into hedge rather than leaving a
patch of walkable-looking ground behind a house.
"""
from __future__ import annotations

import argparse
import json
import os
from collections import deque

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "design/act1-towns")

# Shipped town tileset (dist bundle, buildTilesetSection labels).
FLOOR, WALL, ROOF, GRASS, WATER, PATH, SAVE, EXIT, AWNING, HOUSEWALL, DOOR, SHOPWIN, COUNTER = range(13)

WALKABLE = {FLOOR, GRASS, PATH, EXIT}
CHARS = {FLOOR: ".", WALL: "#", ROOF: "^", GRASS: ",", WATER: "~", PATH: "=", SAVE: "S",
         EXIT: "E", AWNING: "A", HOUSEWALL: "H", DOOR: "D", SHOPWIN: "W", COUNTER: "C"}

PORT_SAPPHIRE = {
    "id": "portSapphire",
    "nameKey": "map.portSapphire",
    "pattern": "harbour",
    "width": 28,
    "height": 20,
    "seed": 20260731,
    # Preserved from the shipped game, and nothing else (owner, 2026-07-31).
    "shopId": "portSapphire",
    "shopItems": ["herb", "potion", "smokeBomb", "bronzeSword", "ironSword",
                  "bronzeArmor", "leatherArmor", "ironShield", "leatherCap", "ironHelm"],
    "healerPrice": 8,
    "npcs": [
        {"id": "healer", "dialogueKey": "npc.healer", "affinity": "well square"},
        {"id": "sailor", "dialogueKey": "npc.sailor", "affinity": "jetty foot"},
        {"id": "wisewoman", "dialogueKey": "npc.wisewoman", "affinity": "inland lane"},
        {"id": "drake", "dialogueKey": "npc.drake.greeting", "affinity": "cargo stack"},
    ],
}


# --------------------------------------------------------------------------- geometry helpers

def in_bounds(g: np.ndarray, x: int, y: int) -> bool:
    return 0 <= y < g.shape[0] and 0 <= x < g.shape[1]


def walkable_at(g: np.ndarray, x: int, y: int) -> bool:
    return in_bounds(g, x, y) and int(g[y, x]) in WALKABLE


def neighbours4(x: int, y: int):
    yield x, y - 1
    yield x, y + 1
    yield x - 1, y
    yield x + 1, y


def flood(g: np.ndarray, starts: list[tuple[int, int]]) -> set[tuple[int, int]]:
    seen = {s for s in starts if walkable_at(g, *s)}
    q = deque(seen)
    while q:
        x, y = q.popleft()
        for nx, ny in neighbours4(x, y):
            if (nx, ny) not in seen and walkable_at(g, nx, ny):
                seen.add((nx, ny))
                q.append((nx, ny))
    return seen


def steps_between(g: np.ndarray, a: tuple[int, int], b: tuple[int, int]) -> int | None:
    """BFS distance in walkable cells, or None if unreachable."""
    if not walkable_at(g, *a) or not walkable_at(g, *b):
        return None
    dist = {a: 0}
    q = deque([a])
    while q:
        cur = q.popleft()
        if cur == b:
            return dist[cur]
        for nb in neighbours4(*cur):
            if nb not in dist and walkable_at(g, *nb):
                dist[nb] = dist[cur] + 1
                q.append(nb)
    return None


# --------------------------------------------------------------------------- frontage growth

def wobble(n: int, lo: int, hi: int, rng, segments: int = 4) -> np.ndarray:
    """A gently irregular line of n samples in [lo,hi] -- control points, linearly joined.

    Deliberately NOT per-cell noise: per-cell noise gives a ragged fringe, control points give
    a line that bends. A coastline bends.
    """
    xs = np.linspace(0, n - 1, segments + 1).astype(int)
    ys = rng.integers(lo, hi + 1, size=len(xs))
    return np.round(np.interp(np.arange(n), xs, ys)).astype(int)


def lane_track(y_from: int, y_to: int, x0: int, rng, jog_chance: float = 0.3) -> dict[int, int]:
    """A lane climbing from the quay to y_to, jogging sideways now and then.

    The jog is what stops the lane reading as a ruled column. It stays small (one cell) so the
    lane still reads as one street rather than a staircase.
    """
    track, x = {}, x0
    for y in range(y_from, y_to - 1, -1):
        track[y] = x
        if rng.random() < jog_chance:
            x += int(rng.choice([-1, 1]))
    return track


def carve_track(g: np.ndarray, track: dict[int, int], width: int, tile: int) -> None:
    """Paint a lane, bridging each sideways jog so the street never pinches to a diagonal."""
    ys = sorted(track)
    for i, y in enumerate(ys):
        x = track[y]
        for d in range(width):
            if in_bounds(g, x + d, y):
                g[y, x + d] = tile
        if i + 1 < len(ys):
            nxt = track[ys[i + 1]]
            for x2 in range(min(x, nxt), max(x, nxt) + width):
                if in_bounds(g, x2, y):
                    g[y, x2] = tile


def quay_edge(g: np.ndarray, coast: np.ndarray, depth: int, w: int) -> dict[int, int]:
    """Column -> the quay's landward row there.

    Bounded to the quay's OWN depth. Walking up the path column instead would follow a lane
    all the way inland wherever one joins, and then grow quay frontage off a lane -- which is
    how the shop ended up four cells up a back street instead of facing the water.
    """
    edge = {}
    for x in range(1, w - 1):
        y = int(coast[x]) - depth
        if not in_bounds(g, x, y) or int(g[y, x]) != PATH:
            continue
        if y - 1 >= 0 and int(g[y - 1, x]) == GRASS:      # absent at every lane junction
            edge[x] = y
    return edge


def lane_edge(g: np.ndarray, track: dict[int, int], side: str) -> dict[int, int]:
    """Row -> the lane's boundary column on the given side, absent where nothing can front."""
    edge, d = {}, -1 if side == "west" else 1
    for y, x0 in track.items():
        x = x0
        if not in_bounds(g, x, y) or int(g[y, x]) != PATH:
            continue
        while in_bounds(g, x + d, y) and int(g[y, x + d]) == PATH:
            x += d
        if in_bounds(g, x + d, y) and int(g[y, x + d]) == GRASS:
            edge[y] = x
    return edge


def block_depth(g: np.ndarray, span: range, start: int, step: int, cap: int,
                axis: str = "y") -> int:
    """How far the plot can run back before it hits the next street, plot, or the town edge.

    Measured across the WHOLE plot width, so one early obstruction stops the whole plot rather
    than letting it grow a ragged tail into its neighbour.
    """
    for d in range(cap):
        for s in span:
            x, y = (s, start + step * d) if axis == "y" else (start + step * d, s)
            if not in_bounds(g, x, y) or int(g[y, x]) != GRASS:
                return d
    return cap



def grow_frontage(g: np.ndarray, edge: dict[int, int], x_from: int, x_to: int, rng,
                  plots: list[dict], face: str = "south", max_setback: int = 1) -> None:
    """Consume a street's frontage into plots, following the street wherever it goes.

    `edge` maps column -> the street's boundary row at that column, so a quay that rises and
    falls with the coastline produces a row of houses that steps with it. Each plot is still a
    clean rectangle; the ROW is what bends.
    """
    step = -1 if face == "south" else 1     # direction from street into the plot
    x = x_from
    while x <= x_to:
        if x not in edge:                   # a lane crosses here: step past it
            x += 1
            continue
        # A plot may not span a step in the street it fronts. Spanning one pushes the whole
        # building back to the shallowest column and leaves the rest as a huge yard -- which
        # is how the shop kept ending up four cells inland of the water it is meant to face.
        run = 0
        while (x + run) <= x_to and (x + run) in edge and abs(edge[x + run] - edge[x]) <= 1:
            run += 1
        if run < 3:
            x += run + 1
            continue
        w = min(int(rng.integers(3, 6)), run)
        cols = range(x, x + w)

        setback = int(rng.integers(0, max_setback + 1))
        near = min(edge[px] for px in cols) if face == "south" else max(edge[px] for px in cols)
        wall_y = near + step * (1 + setback)
        # A burgage plot runs the DEPTH of the block, street to back edge. Taking a fixed
        # shallow bite instead leaves the block interior as leftover, which then has to be
        # fenced off -- and a town of hedge slabs is what that looks like.
        depth = block_depth(g, cols, wall_y, step, cap=5) - int(rng.integers(0, 2))
        if depth < 2:
            x += w + 1
            continue
        cells = [(px, wall_y + step * d) for px in cols for d in range(depth)]
        if not all(in_bounds(g, px, py) and int(g[py, px]) == GRASS for px, py in cells):
            x += 1
            continue

        for px, py in cells:
            g[py, px] = ROOF
        for px in cols:
            g[wall_y, px] = HOUSEWALL
        door_x = x + int(rng.integers(0, w))
        g[wall_y, door_x] = DOOR

        # the gap each column leaves between its wall face and its own bit of street
        yard = [(px, yy) for px in cols
                for yy in range(min(wall_y - step, edge[px]), max(wall_y - step, edge[px]) + 1)
                if in_bounds(g, px, yy) and int(g[yy, px]) == GRASS]
        plots.append({"x": x, "w": w, "wallY": int(wall_y), "doorX": int(door_x),
                      "depth": int(depth), "setback": setback, "face": face, "yard": yard})
        x += w + 1


def grow_lane_frontage(g: np.ndarray, edge: dict[int, int], y_from: int, y_to: int, rng,
                       plots: list[dict], face: str = "west") -> None:
    """Same growth, rotated: plots fronting a lane that bends as it climbs."""
    step = -1 if face == "west" else 1
    y = y_from
    while y <= y_to:
        if y not in edge:
            y += 1
            continue
        run = 0
        while (y + run) <= y_to and (y + run) in edge and abs(edge[y + run] - edge[y]) <= 1:
            run += 1
        if run < 3:
            y += run + 1
            continue
        hh = min(int(rng.integers(3, 5)), run)
        rows = range(y, y + hh)

        setback = int(rng.integers(0, 2))
        near = min(edge[py] for py in rows) if face == "west" else max(edge[py] for py in rows)
        wall_x = near + step * (1 + setback)
        depth = block_depth(g, rows, wall_x, step, cap=6, axis="x") - int(rng.integers(0, 2))
        if depth < 2:
            y += hh + 1
            continue
        cells = [(wall_x + step * d, py) for py in rows for d in range(depth)]
        if not all(in_bounds(g, px, py) and int(g[py, px]) == GRASS for px, py in cells):
            y += 1
            continue

        for px, py in cells:
            g[py, px] = ROOF
        for py in rows:
            g[py, wall_x] = HOUSEWALL
        door_y = y + int(rng.integers(0, hh))
        g[door_y, wall_x] = DOOR

        yard = [(xx, py) for py in rows
                for xx in range(min(wall_x - step, edge[py]), max(wall_x - step, edge[py]) + 1)
                if in_bounds(g, xx, py) and int(g[py, xx]) == GRASS]
        plots.append({"y": y, "h": hh, "wallX": int(wall_x), "doorY": int(door_y),
                      "depth": int(depth), "setback": setback, "face": face, "yard": yard})
        y += hh + 1


# --------------------------------------------------------------------------- the harbour plan

def build_harbour(spec: dict) -> dict:
    w, h = spec["width"], spec["height"]
    rng = np.random.default_rng(spec["seed"])
    g = np.full((h, w), GRASS, dtype=np.int16)

    # --- site: the sea is the southern wall, the reason this town exists, and the only thing
    # here that was never a design choice. It is drawn first and everything defers to it.
    coast = wobble(w, 16, 18, rng, segments=3)
    for x in range(w):
        g[coast[x]:, x] = WATER

    # --- spine: the quay follows the water, three cells deep. Not a row -- the water's line.
    quay_depth = 3
    for x in range(1, w - 1):
        g[coast[x] - quay_depth:coast[x], x] = PATH

    # --- lanes climb inland off the quay, bending as they go, at irregular spacing.
    lane_x0 = [4 + int(rng.integers(0, 2)), 12 + int(rng.integers(0, 2)),
               20 + int(rng.integers(0, 2))]
    tracks = {}
    for name, x0, top in (("west", lane_x0[0], 4), ("north", lane_x0[1], 1),
                          ("east", lane_x0[2], 4)):
        t = lane_track(coast[x0] - quay_depth, top, x0, rng)
        carve_track(g, t, 2, PATH)
        tracks[name] = t

    # --- each inland lane tops out in an open space, placed where the lane actually ARRIVES
    # rather than at an authored coordinate, so a bend carries the square with it.
    squares = {}
    for name, span in (("west", 6), ("east", 6)):
        t = tracks[name]
        top = min(t)
        cx = int(np.clip(t[top], 2, w - span - 2))
        y0 = max(1, top - 2)
        g[y0:top + 1, cx - 1:cx - 1 + span] = FLOOR
        squares[name] = (cx + span // 2 - 1, (y0 + top) // 2)

    # --- jetty: the deck steps south into the water and is walkable to its end.
    jetty_x = (23, 24)
    for x in jetty_x:
        g[coast[x]:h, x] = FLOOR

    # --- perimeter: blocked except at the three gates. The sea needs no wall.
    g[0, :] = WALL
    for y in range(1, h):
        for x in (0, w - 1):
            if int(g[y, x]) != WATER:
                g[y, x] = WALL
    nx0 = tracks["north"][min(tracks["north"])]
    west_y, east_y = coast[1] - 2, coast[w - 2] - 2
    gates = [{"id": "north", "x": nx0, "y": 0}, {"id": "north", "x": nx0 + 1, "y": 0},
             {"id": "west", "x": 0, "y": int(west_y)},
             {"id": "east", "x": w - 1, "y": int(east_y)}]
    for gt in gates:
        g[gt["y"], gt["x"]] = EXIT

    # --- frontage, read back off the painted streets rather than from the tracks, so what
    # grows is what is actually there.
    plots: list[dict] = []
    grow_frontage(g, quay_edge(g, coast, quay_depth, w), 1, w - 2, rng, plots, face="south")
    for name in ("west", "north", "east"):
        t = tracks[name]
        y0, y1 = min(t), max(t) - 1
        grow_lane_frontage(g, lane_edge(g, t, "west"), y0, y1, rng, plots, face="west")
        grow_lane_frontage(g, lane_edge(g, t, "east"), y0, y1, rng, plots, face="east")

    quay_plots = [p for p in plots if p.get("face") == "south"]

    # --- the shop fronts the water, because a port's commerce faces the port.
    # The shop must actually FRONT the water, so a tight setback outranks a central position.
    shop = min(quay_plots, key=lambda p: (p["setback"], abs((p["x"] + p["w"] / 2) - w * 0.42)))
    shop_wall_y = shop["wallY"]
    counter_x = shop["doorX"] - 1 if shop["doorX"] > shop["x"] else shop["doorX"] + 1
    g[shop_wall_y, counter_x] = COUNTER
    for px in range(shop["x"], shop["x"] + shop["w"]):
        if int(g[shop_wall_y, px]) == HOUSEWALL:
            g[shop_wall_y, px] = SHOPWIN
        if in_bounds(g, px, shop_wall_y - 1):
            g[shop_wall_y - 1, px] = AWNING

    # the player stands on the street directly south of the counter and faces it
    counter_stand = (counter_x, shop_wall_y + 1 + shop["setback"])
    for yy in range(shop_wall_y + 1, int(coast[counter_x])):
        if walkable_at(g, counter_x, yy):
            counter_stand = (counter_x, yy)
            break

    # --- props: everything that stands up. Placed after streets so they never sever a route.
    props = []

    def put_prop(kind: str, x: int, y: int) -> None:
        if walkable_at(g, x, y) or int(g[y, x]) == WATER:
            props.append({"kind": kind, "x": int(x), "y": int(y)})

    put_prop("well", *squares["west"])
    put_prop("crate", jetty_x[1], h - 1)            # the far end of the deck, not its throat
    for px in (jetty_x[0] - 1, jetty_x[1] + 1):
        put_prop("mooringPost", px, int(coast[px]))
    for px in (17, 20, 26):
        put_prop("boat", px, min(h - 1, int(coast[px]) + 2))
    # The working seaward edge sits on the quay's MIDDLE row, not its last one. Where the
    # coast steps, the last row narrows to a one-cell tongue, and a prop beside a tongue
    # strands the cell past it -- gate 6 caught exactly that, twice.
    for px in (19, 20):
        put_prop("cargoCrate", px, int(coast[px]) - 2)
    for px in (9, 12):
        put_prop("dryingNet", px, int(coast[px]) - 2)

    prop_cells = {(p["x"], p["y"]) for p in props}

    # --- actors, by affinity to plot type rather than by authored coordinate.
    def free_near(cx: int, cy: int, radius: int = 4) -> tuple[int, int]:
        best, best_d = None, 10 ** 9
        for yy in range(max(0, cy - radius), min(h, cy + radius + 1)):
            for xx in range(max(0, cx - radius), min(w, cx + radius + 1)):
                if not walkable_at(g, xx, yy) or (xx, yy) in prop_cells:
                    continue
                if any(a["x"] == xx and a["y"] == yy for a in actors):
                    continue
                d = abs(xx - cx) + abs(yy - cy)
                if d < best_d:
                    best, best_d = (xx, yy), d
        return best

    actors: list[dict] = []
    ne = tracks["east"]
    affinity = {
        "healer": squares["west"],                          # the well square, off the quay
        "sailor": (jetty_x[0], int(coast[jetty_x[0]])),     # the jetty foot
        "wisewoman": (ne[sorted(ne)[len(ne) // 2]], sorted(ne)[len(ne) // 2]),
        "drake": (20, int(coast[20]) - 2),                  # beside the cargo he guards
    }
    for npc in spec["npcs"]:
        cx, cy = affinity[npc["id"]]
        pos = free_near(cx, cy)
        actors.append({"id": npc["id"], "dialogueKey": npc["dialogueKey"],
                       "affinity": npc["affinity"], "x": pos[0], "y": pos[1]})

    # --- save point where the north lane meets the quay, on the line everyone already walks.
    tn = tracks["north"]
    save = (tn[max(tn)], int(coast[tn[max(tn)]]) - quay_depth)
    g[save[1], save[0]] = SAVE

    # --- Grass walks ONLY where it touches a street; the rest is hedged backland. Without this
    # the block interiors stay one continuous walkable field and the streets stop reading as
    # streets, which is exactly the ambiguity the legibility rule exists to kill.
    street = {FLOOR, PATH, EXIT}
    yards = {c for p in plots for c in p["yard"]}   # a plot's own forecourt always walks
    hedged = 0
    for y in range(h):
        for x in range(w):
            if int(g[y, x]) != GRASS or (x, y) in yards:
                continue
            if not any(in_bounds(g, nx, ny) and int(g[ny, nx]) in street
                       for nx, ny in neighbours4(x, y)):
                g[y, x] = WALL
                hedged += 1
    # anything still walkable but cut off from every gate is hedged too
    reachable = flood(g, [(gt["x"], gt["y"]) for gt in gates])
    for y in range(h):
        for x in range(w):
            if int(g[y, x]) == GRASS and (x, y) not in reachable:
                g[y, x] = WALL
                hedged += 1

    return {
        "id": spec["id"],
        "nameKey": spec["nameKey"],
        "kind": "town",
        "pattern": spec["pattern"],
        "seed": spec["seed"],
        "width": w,
        "height": h,
        "coast": [int(v) for v in coast],
        "quayDepth": quay_depth,
        "lanes": {k: {int(y): int(x) for y, x in t.items()} for k, t in tracks.items()},
        "squares": {k: [int(v) for v in c] for k, c in squares.items()},
        "jettyX": list(jetty_x),
        "gates": gates,
        "connections": [{"gate": gt["id"], "targetMap": "overworld",
                         "fromX": int(gt["x"]), "fromY": int(gt["y"])} for gt in gates],
        "shopId": spec["shopId"],
        "shopItems": spec["shopItems"],
        "shopCounter": {"x": int(counter_x), "y": int(shop_wall_y),
                        "standX": int(counter_stand[0]), "standY": int(counter_stand[1]),
                        "dir": "up"},
        "healerPrice": spec["healerPrice"],
        "savePoint": {"x": save[0], "y": save[1]},
        "npcs": actors,
        "props": props,
        "plots": plots,
        "hedgedCells": hedged,
        "rows": ["".join(CHARS[int(v)] for v in row) for row in g],
    }


# --------------------------------------------------------------------------- validation gates

def validate(town: dict) -> list[str]:
    """Spec §Validation gates. Towns need MORE gates than dungeons, not fewer: nobody has
    priors about caves, so odd reads as organic, but everyone has priors about towns, so an
    unreachable door reads as broken."""
    rows = town["rows"]
    h, w = len(rows), len(rows[0])
    inv = {v: k for k, v in CHARS.items()}
    g = np.array([[inv[c] for c in row] for row in rows], dtype=np.int16)
    prop_cells = {(p["x"], p["y"]) for p in town["props"]}
    fails: list[str] = []

    # 1. no ambiguous cell -- every cell classifies as walkable material or standing blocker
    for y in range(h):
        for x in range(w):
            v = int(g[y, x])
            if v not in WALKABLE and v not in {WALL, ROOF, WATER, SAVE, AWNING, HOUSEWALL,
                                               DOOR, SHOPWIN, COUNTER}:
                fails.append(f"gate1: unclassified tile {v} at ({x},{y})")

    gate_cells = [(gt["x"], gt["y"]) for gt in town["gates"]]

    # props must not sever the town
    open_g = g.copy()
    for (px, py) in prop_cells:
        if int(open_g[py, px]) in WALKABLE:
            open_g[py, px] = WALL

    targets = {f"npc:{n['id']}": (n["x"], n["y"]) for n in town["npcs"]}
    targets["savePoint"] = (town["savePoint"]["x"], town["savePoint"]["y"])
    targets["shopCounter"] = (town["shopCounter"]["standX"], town["shopCounter"]["standY"])

    # 2. approach tiles
    for name, (tx, ty) in targets.items():
        if name == "savePoint":
            ok = any(walkable_at(open_g, nx, ny) for nx, ny in neighbours4(tx, ty))
        else:
            ok = walkable_at(open_g, tx, ty) and (tx, ty) not in prop_cells
        if not ok:
            fails.append(f"gate2: {name} at ({tx},{ty}) has no walkable approach")

    # 3. every gate reaches every actor, the counter and the save point
    for gt in town["gates"]:
        reach = flood(open_g, [(gt["x"], gt["y"])])
        for name, (tx, ty) in targets.items():
            hit = (tx, ty) in reach or (name == "savePoint"
                                        and any(n in reach for n in neighbours4(tx, ty)))
            if not hit:
                fails.append(f"gate3: {gt['id']} gate ({gt['x']},{gt['y']}) cannot reach {name}")

    # 4. gate to gate -- Port Sapphire is the connector between three disconnected approaches
    base = flood(open_g, [gate_cells[0]])
    for gc in gate_cells[1:]:
        if gc not in base:
            fails.append(f"gate4: gate {gc} not reachable from {gate_cells[0]}")

    # 5. sea containment -- no water cell reachable, the jetty deck is Floor and is the exception
    for (x, y) in base:
        if int(g[y, x]) == WATER:
            fails.append(f"gate5: water cell ({x},{y}) is reachable")

    # 6. no dead-end pockets that read as street but lead nowhere
    approach_cells = set()
    for name, (tx, ty) in targets.items():
        approach_cells.add((tx, ty))
        approach_cells.update(neighbours4(tx, ty))
    for y in range(h):
        for x in range(w):
            if int(g[y, x]) != PATH or (x, y) in prop_cells:
                continue
            deg = sum(1 for nx, ny in neighbours4(x, y)
                      if walkable_at(open_g, nx, ny))
            if deg <= 1 and (x, y) not in approach_cells:
                fails.append(f"gate6: dead-end path cell at ({x},{y})")

    # 7. frontage integrity -- every door opens onto a walkable cell
    for y in range(h):
        for x in range(w):
            if int(g[y, x]) not in {DOOR, COUNTER}:
                continue
            if not any(walkable_at(open_g, nx, ny) for nx, ny in neighbours4(x, y)):
                fails.append(f"gate7: door/counter at ({x},{y}) has no walkable front")

    return fails or ["ok"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    town = build_harbour(PORT_SAPPHIRE)
    town["validation"] = validate(town)

    # determinism gate 8 -- identical output for a fixed seed
    again = build_harbour(PORT_SAPPHIRE)
    if again["rows"] != town["rows"]:
        town["validation"].append("gate8: generation is not deterministic")

    path = os.path.join(args.out, f"{town['id']}.json")
    with open(path, "w") as fh:
        json.dump(town, fh, indent=1)

    print(f"{town['id']}  {town['width']}x{town['height']}  pattern={town['pattern']}")
    print(f"  plots={len(town['plots'])} props={len(town['props'])} hedged={town['hedgedCells']}")
    print(f"  shopCounter={town['shopCounter']}")
    for n in town["npcs"]:
        print(f"  npc {n['id']:<10} ({n['x']:>2},{n['y']:>2})  {n['affinity']}")
    print(f"  validation: {town['validation']}")
    print(f"  -> {path}")
    for row in town["rows"]:
        print("   " + row)


if __name__ == "__main__":
    main()
