#!/usr/bin/env python3
"""OPTION (a) MOCKUPS: authored floor plans for the five dungeons whose generator layout does not fit
their theme (MECHANICS.md ✗ rows): stormNest, stormreachSpire, scorchedRuins, volcanicForge and
demonBarracks. Mockups only. Nothing here touches game code, public/ or dist/.

Floor counts, bosses and mechanics are the SHIPPED BUNDLE's (bundle_layouts.py tables):
  stormNest        5F stormHarpy      wind: from F2, a 2-cell gate of tile 19 (wind barrier, opened by
                                       the windbreakerStone from that floor's key chest; the engine
                                       opens the stepped cell + its 4 same-tile neighbours)
  stormreachSpire  6F stormSentinel   wind-tower: tile 25 along 40-60 % of the main path in bursts
                                       (3-5 on / 1-2 off, the bundle's rule), windCorridorDir = major
                                       axis of (exit - arrival), like Ap()
  scorchedRuins    5F ashenGuardian   hidden doors 17 into closets (hiddenRoomChests), key gate 15 +
                                       key chest on F2/F3/F5, mimic chests on F1 and F3 (bundle floors)
  volcanicForge    7F flameTitan      lava-course: tile 5 bands across the passages (passable only
                                       while lavaPhase is on), key gate 15 F2-F7, hidden 17, mimic F4
  demonBarracks    6F warGeneralMalachar  key gate 15 F2-F6, hidden 17, mimics F2-F4

The towers go UP: each floor is an octagonal ring (outer wall with sky window slits, a central
stair core). The ring narrows as the tower rises, and the top floor is the open roof with the boss
arena. The engine still calls the next floor tile 9 ("stairsDown"). The JSON marks
`"ascending": true` so the art draws those stairs climbing.

Output: <scratch>/authored/<floor>.json in the A1D floor format (dungeonId, floor, totalFloors,
width, height, theme, rows, assets), plus:
  assets kinds beyond A1D_TILE: windBarrier(19) lockedDoor(15) hiddenDoor(17) windLane(25) lava(5).
      Proposed A1D_TILE additions are listed in README. Hidden doors sit on '#' rows, and the asset
      writes 17 over them, as a1dTiles() already does for every asset.
  mechanics: keyChests [{x,y}], mimicChests ["x,y"], hiddenRoomChests ["x,y"], windCorridorDir,
      i.e. the Ap() side channels, which the adapter must hand to the scene (loadMap reads them from
      Ap's return, and an A1D swap does not replace them).
  decorRows: 's' sky outside a tower, 'w' tower outer wall, 'l' lava channel (all '#', visual only).
  decals: skyWindow cells (same rule as bundle_render._windows / fields.add_decals).

  python3 authored_floors.py            # all five dungeons
"""
import json, os, random, sys
from collections import deque
import numpy as np
import common
from common import SCRATCH

OUT = os.path.join(SCRATCH, "authored")
M = 3                                   # rock frame, like Act 1
KIND = {6: None, 9: "stairsDown", 4: "chest", 7: "boss", 14: "save", 18: "sign",
        19: "windBarrier", 15: "lockedDoor", 17: "hiddenDoor", 25: "windLane", 5: "lava"}
DUNGEONS = {
    "stormNest": dict(floors=5, boss="stormHarpy", mechanic="wind", theme="storm-battered stone tower"),
    "stormreachSpire": dict(floors=6, boss="stormSentinel", mechanic="wind-tower", theme="sky tower above the clouds"),
    "scorchedRuins": dict(floors=5, boss="ashenGuardian", mechanic=None, theme="burnt ancient ruin"),
    "volcanicForge": dict(floors=7, boss="flameTitan", mechanic="lava-course", theme="ancient volcanic forge"),
    "demonBarracks": dict(floors=6, boss="warGeneralMalachar", mechanic=None, theme="demon army barracks"),
}
# bundle facts reproduced per floor (bundle-gen tables)
CHESTS = {"stormNest": [3] * 5, "stormreachSpire": [3] * 6, "scorchedRuins": [4, 4, 4, 3, 4],
          "volcanicForge": [4] * 7, "demonBarracks": [4] * 6}
KEY_FLOORS = {"stormNest": {2, 3, 4, 5}, "scorchedRuins": {2, 3, 5}, "volcanicForge": {2, 3, 4, 5, 6, 7},
              "demonBarracks": {2, 3, 4, 5, 6}}
MIMIC_FLOORS = {"scorchedRuins": {1, 3}, "volcanicForge": {4}, "demonBarracks": {2, 3, 4}}
SAVE_FLOORS = {"stormNest": {1, 3}, "stormreachSpire": {1, 3}, "scorchedRuins": {1, 3},
               "volcanicForge": {1, 4}, "demonBarracks": {1, 3}}


class Floor:
    def __init__(self, w, h):
        self.g = np.ones((h, w), np.int16)
        self.decor = np.full((h, w), ".", "<U1")
        self.mech = {"keyChests": [], "mimicChests": [], "hiddenRoomChests": []}

    def rect(self, x0, y0, x1, y1, v=0):           # inclusive
        self.g[y0:y1 + 1, x0:x1 + 1] = v

    def set(self, x, y, v):
        self.g[y, x] = v


# ── towers ──────────────────────────────────────────────────────────────────────────────────────
def octagon(R, cut=None):
    cut = cut if cut is not None else int(round(R * 1.42))
    n = 2 * R + 1
    yy, xx = np.mgrid[-R:R + 1, -R:R + 1]
    return (np.abs(xx) <= R) & (np.abs(yy) <= R) & (np.abs(xx) + np.abs(yy) <= cut)


def tower(did, f, n):
    top = f == n
    R = {"stormNest": [13, 12, 12, 11, 11], "stormreachSpire": [15, 14, 14, 13, 13, 12]}[did][f - 1]
    W = 2 * R + 1 + 2 * M
    fl = Floor(W, W)
    c = R + M
    inside = np.zeros((W, W), bool)
    inside[M:M + 2 * R + 1, M:M + 2 * R + 1] = octagon(R)
    walk = np.zeros_like(inside)
    walk[M + 2:M + 2 * R - 1, M + 2:M + 2 * R - 1] = octagon(R - 2)
    fl.decor[~inside] = "s"                                       # open sky around the tower
    fl.decor[inside & ~walk] = "w"                                # the outer wall (window slits go here)
    fl.g[walk] = 0
    up = (f % 2 == 1)                                             # arrival south / exit north, alternating
    rc = 3 if R < 13 else 4
    if not top:
        core = np.zeros_like(walk)
        core[c - rc:c + rc + 1, c - rc:c + rc + 1] = octagon(rc)
        fl.g[core] = 1                                            # the stair core
        ay, ey = (c + rc + 1, c - rc - 1) if up else (c - rc - 1, c + rc + 1)
        fl.set(c, ey, 9)                                          # stairs to the next floor, on the core face
        if f == 1:
            fl.set(c, M + 2 * R - 1, 0); fl.set(c, M + 2 * R, 6)  # tower door in the outer wall
            fl.set(c - 1, M + 2 * R - 1, 0); fl.set(c + 1, M + 2 * R - 1, 0)
            arrival = (c, M + 2 * R)
        else:
            fl.set(c, ay, 6)                                      # arrived from below, on the core face
            arrival = (c, ay)
        # radial partitions on the E and W axes: one solid (forces the long way round), one doorway
        side = 1 if (f // 2) % 2 == 0 else -1                     # which side carries the route
        for x in range(c + rc + 1, M + 2 * R - 1) if side == -1 else range(M + 2, c - rc):
            fl.set(x, c, 1)                                       # solid partition on the other side
        dx0, dx1 = (c + rc + 1, M + 2 * R - 2) if side == 1 else (M + 2, c - rc - 1)
        for x in range(dx0, dx1 + 1):
            fl.set(x, c, 1)
        mid = (dx0 + dx1) // 2
        door = [(mid, c), (mid + 1, c)]
        for x, y in door:
            fl.set(x, y, 0)
        if did == "stormNest" and f >= 2:
            for x, y in door:
                fl.set(x, y, 19)                                  # the wind barrier gate (2 cells)
        # bays: short stubs off the outer wall in each half, chests sit in the bays
        bays = []
        for sy in (-1, 1):
            y = c + sy * (rc + 3)
            for sx in (-1, 1):
                x0 = c + sx * (rc + 2)
                xs = range(x0, M + 2 * R - 1) if sx == 1 else range(M + 2, x0 + 1)
                stub = [x for x in xs if walk[y, x]][:3] if sx == 1 else [x for x in xs if walk[y, x]][-3:]
                # stub is a short wall jutting from the outer wall along y
                xe = (max(stub) if sx == 1 else min(stub)) if stub else None
                if xe is None:
                    continue
                wall_x = [x for x in range(M + 2, M + 2 * R - 1) if walk[y, x]]
                edge = max(wall_x) if sx == 1 else min(wall_x)
                for k in range(3):
                    xx = edge - k * sx
                    if walk[y, xx] and fl.g[y, xx] == 0:
                        fl.set(xx, y, 1)
                bays.append((edge - sx, y + sy, sy))
        start_half = 1 if up else -1                              # arrival is in this vertical half
        key_bay = [b for b in bays if b[2] == start_half and np.sign(b[0] - c) != side]
        far_bays = [b for b in bays if b[2] != start_half]
        chests = []
        if did == "stormNest" and f >= 2 and key_bay:
            kx, ky, _ = key_bay[0]; chests.append((kx, ky)); fl.mech["keyChests"].append({"x": kx, "y": ky})
        for b in (key_bay[1:] + [b for b in bays if b[2] == start_half and b not in key_bay] + far_bays):
            if len(chests) >= CHESTS[did][f - 1]:
                break
            chests.append((b[0], b[1]))
        for x, y in chests:
            fl.set(x, y, 4)
        exitc = (c, ey)
        if f in SAVE_FLOORS[did]:
            sx_ = c + (2 if f == 1 else 2); sy_ = (M + 2 * R - 3) if f == 1 else ay + (1 if up else -1)
            if fl.g[sy_, sx_] == 0:
                fl.set(sx_, sy_, 14)
        if f == 1:
            fl.set(c - 2, M + 2 * R - 3, 18)
    else:
        # roof: parapet walkway inside the outer wall, boss arena in the middle behind its own wall
        ra = R - 5
        arena_wall = np.zeros_like(walk); arena_in = np.zeros_like(walk)
        arena_wall[c - ra:c + ra + 1, c - ra:c + ra + 1] = octagon(ra)
        arena_in[c - ra + 1:c + ra, c - ra + 1:c + ra] = octagon(ra - 1)
        fl.g[arena_wall & ~arena_in] = 1
        ay = c + ra + 2 if up else c - ra - 2
        fl.set(c, ay, 6)
        arrival = (c, ay)
        gy = c - ra if up else c + ra                             # arena gate on the far side
        door = [(c, gy), (c + 1, gy)]
        for x, y in door:
            fl.set(x, y, 19 if did == "stormNest" else 0)
        fl.set(c, c - 1 if up else c + 1, 7)                      # the boss on its dais
        exitc = (c, c)
        # block one side of the parapet so the walk to the gate is the long way round
        for x in range(M + 2, c - ra):
            fl.set(x, c, 1)
        chests = []
        cand = [(c + ra + 1, c + 2), (c + ra + 1, c - 2), (c - ra - 1, c + (3 if up else -3)), (c, c + (ra + 2) * (-1 if up else 1))]
        cand = [(x, y) for x, y in cand if fl.g[y, x] == 0 and abs(x - arrival[0]) + abs(y - arrival[1]) > 2]
        if did == "stormNest":
            kx, ky = cand.pop(0); chests.append((kx, ky)); fl.mech["keyChests"].append({"x": kx, "y": ky})
        for x, y in cand:
            if len(chests) >= CHESTS[did][f - 1]:
                break
            if fl.g[y, x] == 0 and (x, y) != arrival:
                chests.append((x, y))
        for x, y in chests:
            fl.set(x, y, 4)
    if did == "stormreachSpire":
        wind_lane(fl, arrival, exitc, f)
    return fl, arrival


def wind_lane(fl, arrival, goal, f):
    """The bundle's wind-tower rule on OUR main path: walk the shortest path, lay tile 25 in bursts
    (3-5 on, 1-2 off) until 40-60 % of the path is covered, widen each burst cell by one
    perpendicular cell. windCorridorDir = major axis of (goal - arrival), as Ap() derives it."""
    rng = random.Random(f * 7919 + 25)
    path = shortest_path(fl.g, arrival, goal)
    dx, dy = goal[0] - arrival[0], goal[1] - arrival[1]
    fl.mech["windCorridorDir"] = ({"dx": 1 if dx > 0 else -1, "dy": 0} if abs(dx) >= abs(dy)
                                  else {"dx": 0, "dy": 1 if dy > 0 else -1})
    want = int(len(path) * (0.4 + rng.random() * 0.2))
    placed_cells = []
    on, run, burst, gap, placed = True, 0, 3 + rng.randrange(3), 1 + rng.randrange(2), 0
    for i, (x, y) in enumerate(path):
        if placed >= want:
            break
        if on:
            if fl.g[y, x] == 0:
                fl.g[y, x] = 25; placed += 1
                px, py = path[i - 1] if i else (x, y)
                ox, oy = (0, 1) if py == y else (1, 0)              # 'h' step -> cell below, 'v' -> right
                pair = [(x, y)]
                if fl.g[y + oy, x + ox] == 0:
                    fl.g[y + oy, x + ox] = 25; pair.append((x + ox, y + oy))
                placed_cells.append(pair)
            run += 1
            if run >= burst:
                on, run, gap = False, 0, 1 + rng.randrange(2)
        else:
            run += 1
            if run >= gap:
                on, run, burst = True, 0, 3 + rng.randrange(3)
    # the widening cell can land on the path too: trim from the end until coverage is <= 60 %
    pset = set(path)
    while placed_cells and sum(1 for c in pset if fl.g[c[1], c[0]] == 25) > 0.6 * len(path):
        for x, y in placed_cells.pop():
            fl.g[y, x] = 0


# ── room-and-door buildings: ruin, barracks, forge ────────────────────────────────────────────────
def shortest_path(g, a, b, passable=None):
    passable = passable or (lambda v: v in (0, 6, 9, 17, 25, 5, 15, 19))
    H, W = g.shape
    prev = {a: None}; q = deque([a])
    while q:
        x, y = q.popleft()
        if (x, y) == b:
            break
        for ddx, ddy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + ddx, y + ddy
            if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in prev and (passable(g[ny, nx]) or (nx, ny) == b):
                prev[(nx, ny)] = (x, y); q.append((nx, ny))
    if b not in prev:
        return []
    p, cur = [], b
    while cur is not None:
        p.append(cur); cur = prev[cur]
    return p[::-1][1:-1]


def rooms_building(did, f, n):
    """Buildings with 2-cell-thick walls (so the masonry face reads), 2-wide doorways.
    Returns fl, arrival, rooms (rects the route passes), hall (the goal room), gate (2 cells, one
    row of the last doorway), route_doors (doorway rects in route order)."""
    rng = random.Random(f * 104729 + len(did) * 13)
    if did == "volcanicForge":
        HW, HH, NH = 30 + 2 * (f > 4), 9, 3                      # three stacked halls, switchback route
        W = M + 2 + HW + 2 + M
        H = M + 2 + NH * HH + (NH - 1) * 2 + 2 + 5 + M
        fl = Floor(W, H)
        rooms = []
        for j in range(NH):
            x0, y0 = M + 2, M + 2 + j * (HH + 2)
            fl.rect(x0, y0, x0 + HW - 1, y0 + HH - 1)
            rooms.append(dict(x0=x0, y0=y0, x1=x0 + HW - 1, y1=y0 + HH - 1))
        doors = []
        for j in range(NH - 1):
            right = (j % 2 == 0)
            x = rooms[j]["x1"] - 3 if right else rooms[j]["x0"] + 2
            y = rooms[j]["y1"] + 1
            fl.rect(x, y, x + 1, y + 1)
            doors.append([(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)])
        hall = rooms[-1]
        arrival = (rooms[0]["x0"] + 2, rooms[0]["y0"] + 1)
        gate = doors[-1][:2]
        fl.set(*arrival, 6)
        goal = (hall["x1"] - 3, hall["y0"] + (HH - 2) if NH % 2 else hall["y0"] + 1)
        goal = (hall["x1"] - 3, hall["y1"] - 1)
        return fl, arrival, rooms[:-1], hall, gate, goal
    if did == "demonBarracks":
        RW, RH, NR = 7, 5, 4 + (f > 3)
        CW = NR * (RW + 2)                                        # corridor length
        HW = 11
        W = M + 2 + CW + 2 + HW + 2 + M
        H = M + 2 + RH + 2 + 3 + 2 + RH + 2 + 5 + M
        fl = Floor(W, H)
        cy0 = M + 2 + RH + 2
        cx0 = M + 2
        fl.rect(cx0, cy0, cx0 + CW - 1, cy0 + 2)                  # the 3-wide corridor
        rooms = []
        for i in range(NR):
            x0 = cx0 + 1 + i * (RW + 2)
            for top in (True, False):
                y0 = M + 2 if top else cy0 + 5
                fl.rect(x0, y0, x0 + RW - 1, y0 + RH - 1)
                dx = x0 + 2 + (i % 3)
                dy = cy0 - 2 if top else cy0 + 3
                fl.rect(dx, dy, dx + 1, dy + 1)
                rooms.append(dict(x0=x0, y0=y0, x1=x0 + RW - 1, y1=y0 + RH - 1))
        # gatehouse: the corridor narrows to 2 rows through a 2-thick wall, then the end hall
        gx = cx0 + CW
        fl.rect(gx, cy0, gx + 1, cy0 + 1)
        hall = dict(x0=gx + 2, y0=M + 2, x1=gx + 2 + HW - 1, y1=cy0 + 5 + RH - 1)
        fl.rect(hall["x0"], hall["y0"], hall["x1"], hall["y1"])
        gate = [(gx + 1, cy0), (gx + 1, cy0 + 1)]
        arrival = (cx0, cy0 + 1)
        fl.set(*arrival, 6)
        goal = ((hall["x0"] + hall["x1"]) // 2 + 2, (hall["y0"] + hall["y1"]) // 2)
        return fl, arrival, rooms, hall, gate, goal
    # scorchedRuins: 3x3 rooms of varying size, 2-thick walls, snake route + one loop, some walls collapsed
    cw = [9 + rng.randrange(3) for _ in range(3)]
    rh = [7 + rng.randrange(2) for _ in range(3)]
    W = M + 2 + sum(cw) + 4 + 2 + M
    H = M + 2 + sum(rh) + 4 + 2 + 5 + M
    fl = Floor(W, H)
    xs = [M + 2 + sum(cw[:i]) + 2 * i for i in range(3)]
    ys = [M + 2 + sum(rh[:j]) + 2 * j for j in range(3)]
    grid = {}
    for j in range(3):
        for i in range(3):
            grid[(i, j)] = dict(x0=xs[i], y0=ys[j], x1=xs[i] + cw[i] - 1, y1=ys[j] + rh[j] - 1)
            fl.rect(**{k: v for k, v in zip(("x0", "y0", "x1", "y1"), (xs[i], ys[j], xs[i] + cw[i] - 1, ys[j] + rh[j] - 1))})
    order = [(0, 2), (1, 2), (2, 2), (2, 1), (1, 1), (0, 1), (0, 0), (1, 0), (2, 0)]
    if f % 2 == 0:
        order = [(2, 2), (1, 2), (0, 2), (0, 1), (1, 1), (2, 1), (2, 0), (1, 0), (0, 0)]
    links = list(zip(order, order[1:]))
    extra = [(order[1], order[4])]                              # one loop, never into the last room
    doors = {}
    for a, b in links + extra:
        ra_, rb = grid[a], grid[b]
        wide = 4 if (rng.random() < 0.35 and b != order[-1]) else 2   # collapsed walls are wider
        if a[1] == b[1]:
            x = min(ra_["x1"], rb["x1"]) + 1
            lo = max(ra_["y0"], rb["y0"]) + 1; hi = min(ra_["y1"], rb["y1"]) - wide
            yc = lo + rng.randrange(max(1, hi - lo + 1))
            cells = [(x + d, yc + k) for k in range(wide) for d in (0, 1)]
        else:
            y = min(ra_["y1"], rb["y1"]) + 1
            lo = max(ra_["x0"], rb["x0"]) + 1; hi = min(ra_["x1"], rb["x1"]) - wide
            xc = lo + rng.randrange(max(1, hi - lo + 1))
            cells = [(xc + k, y + d) for k in range(wide) for d in (0, 1)]
        for x, y in cells:
            fl.set(x, y, 0)
        doors[(a, b)] = cells
    last = order[-1]
    hall = grid[last]
    dc = doors[(order[-2], last)]
    # gate: the row/column of the last doorway nearest the goal room (2 cells)
    if order[-2][1] == last[1]:
        gx = max(x for x, _ in dc) if last[0] > order[-2][0] else min(x for x, _ in dc)
        gate = sorted([(x, y) for x, y in dc if x == gx])[:2]
    else:
        gy = max(y for _, y in dc) if last[1] > order[-2][1] else min(y for _, y in dc)
        gate = sorted([(x, y) for x, y in dc if y == gy])[:2]
    s = grid[order[0]]
    arrival = ((s["x0"] + s["x1"]) // 2, s["y1"])
    fl.set(*arrival, 6)
    goal = ((hall["x0"] + hall["x1"]) // 2, (hall["y0"] + hall["y1"]) // 2)
    rooms = [grid[k] for k in order[:-1]]
    # rubble: a few 1-cell broken pillars inside rooms (ruin read), away from doors/edges
    for r in rooms:
        if rng.random() < 0.6:
            px, py = r["x0"] + 2 + rng.randrange(max(1, r["x1"] - r["x0"] - 4)), r["y0"] + 2 + rng.randrange(max(1, r["y1"] - r["y0"] - 4))
            if (px, py) != arrival:
                fl.set(px, py, 1)
    return fl, arrival, rooms, hall, gate, goal


def building(did, f, n):
    top = f == n
    fl, arrival, rooms, hall, gate, goal = rooms_building(did, f, n)
    rng = random.Random(f * 31 + 7)
    keyf = f in KEY_FLOORS.get(did, set())
    for x, y in gate:
        fl.set(x, y, 15 if keyf else 0)
    fl.set(*goal, 7 if top else 9)
    if did == "volcanicForge":
        forge_lava(fl, rooms + [hall], f)
    # hidden closets: a 3x3 room below the bottom row of rooms, entered through a 2-deep 17 passage
    nh = 1 if f == 1 else 2
    if did == "demonBarracks" and f == 3:
        nh = 1
    hidden = []
    bottoms = sorted([r for r in rooms + [hall]], key=lambda r: (-r["y1"], r["x0"]))
    for r in bottoms:
        for off in (-3, 3, 0):
            if len(hidden) >= nh:
                break
            x = (r["x0"] + r["x1"]) // 2 + off
            y = r["y1"] + 1
            if y + 5 > fl.g.shape[0] - M or not (r["x0"] + 1 <= x <= r["x1"] - 1):
                continue
            if fl.g[y:y + 5, x - 2:x + 3].min() != 1 or fl.g[y - 1, x] != 0:
                continue
            fl.set(x, y, 17); fl.set(x, y + 1, 17)
            fl.rect(x - 1, y + 2, x + 1, y + 4)
            fl.set(x, y + 4, 4)
            hidden.append((x, y + 4))
            fl.mech["hiddenRoomChests"].append(f"{x},{y + 4}")
        if len(hidden) >= nh:
            break
    # chests in room corners (not next to doors), farthest from the arrival first
    corners = []
    for r in rooms + ([hall] if not top else []):
        for x, y in ((r["x0"], r["y0"]), (r["x1"], r["y0"]), (r["x0"], r["y1"]), (r["x1"], r["y1"])):
            if fl.g[y, x] == 0 and sum(fl.g[y + b, x + a] == 0 for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))) == 2 \
                    and all(fl.g[y + b, x + a] in (0, 1) for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                corners.append((x, y, r is hall))
    rng.shuffle(corners)
    corners.sort(key=lambda p: -abs(p[0] - arrival[0]) - abs(p[1] - arrival[1]))
    want = CHESTS[did][f - 1]
    chests = list(hidden)
    pre = [c for c in corners if not c[2]]
    if keyf:
        k = pre[0][:2]                                            # key chest: before the gate
        chests.append(k); fl.mech["keyChests"].append({"x": k[0], "y": k[1]})
    for c in corners:
        if len(chests) >= want:
            break
        if c[:2] not in chests:
            chests.append(c[:2])
    for x, y in chests:
        fl.set(x, y, 4)
    plain = [p for p in chests if p not in hidden and {"x": p[0], "y": p[1]} not in fl.mech["keyChests"]]
    if f in MIMIC_FLOORS.get(did, set()) and plain:
        m = plain[-1]
        fl.mech["mimicChests"].append(f"{m[0]},{m[1]}")
    if f in SAVE_FLOORS[did]:
        r = rooms[min(1, len(rooms) - 1)]
        for x, y in (((r["x0"] + r["x1"]) // 2, r["y0"] + 1), ((r["x0"] + r["x1"]) // 2 + 1, r["y0"] + 1)):
            if fl.g[y, x] == 0 and fl.decor[y, x] == ".":
                fl.set(x, y, 14); break
    if f == 1:
        ax, ay = arrival
        for x, y in ((ax + 2, ay), (ax - 2, ay), (ax + 2, ay - 1), (ax - 2, ay - 1)):
            if fl.g[y, x] == 0:
                fl.set(x, y, 18); break
    return fl, arrival


def forge_lava(fl, halls, f):
    """Each hall gets a 2-row lava channel ('#', decor 'l': always solid) from wall to wall, crossed
    only by 2-3 lava-course BRIDGES of tile 5 (passable only while lavaPhase is on). Doors enter a
    hall above the channel and leave it below, so every hall forces a timed crossing."""
    g = fl.g
    rng = random.Random(f * 977)
    for r in halls:
        if r["y1"] - r["y0"] < 6:
            continue
        y = (r["y0"] + r["y1"]) // 2
        for x in range(r["x0"], r["x1"] + 1):
            for yy in (y, y + 1):
                if g[yy, x] == 0:
                    g[yy, x] = 1; fl.decor[yy, x] = "l"
        span = r["x1"] - r["x0"]
        nb = 2 + (span > 28)
        for k in range(nb):
            bx = r["x0"] + 3 + (k * (span - 6)) // max(1, nb - 1) + rng.randrange(-1, 2)
            for yy in (y, y + 1):
                g[yy, bx] = 5; fl.decor[yy, bx] = "."


# ── export ───────────────────────────────────────────────────────────────────────────────────────
def export(did, f, fl, arrival):
    spec = DUNGEONS[did]
    g = fl.g
    H, W = g.shape
    rows = ["".join("#" if v in (1, 17) else "." for v in r) for r in g]
    assets = []
    for y in range(H):
        for x in range(W):
            v = int(g[y, x])
            if v == 6:
                assets.append({"kind": "mouth" if f == 1 else "stairsUp", "x": x, "y": y})
            elif v in KIND and KIND[v]:
                a = {"kind": KIND[v], "x": x, "y": y}
                if v == 7:
                    a["bossId"] = spec["boss"]
                assets.append(a)
    tower_ = did in ("stormNest", "stormreachSpire")
    win, nwin = [], 0
    if tower_:
        for y in range(1, H):
            for x in range(W):
                if rows[y - 1][x] == "#" and rows[y][x] != "#" and fl.decor[y - 1, x] == "w":
                    nwin += 1
                    if nwin % 3 == 0:
                        win.append([x, y - 1])
    mech = {k: v for k, v in fl.mech.items() if v}
    out = {"dungeonId": did, "floor": f, "totalFloors": spec["floors"], "width": W, "height": H,
           "theme": spec["theme"], "rows": rows, "assets": assets,
           "mechanic": spec["mechanic"], "mechanics": mech, "ascending": tower_,
           "decorRows": ["".join(r) for r in fl.decor], "decals": {"skyWindow": win} if win else {},
           "tiles": g.astype(int).tolist(),
           "source": "authored_floors.py (option (a) mockup; NOT the bundle generator)"}
    os.makedirs(OUT, exist_ok=True)
    json.dump(out, open(os.path.join(OUT, f"{did}-f{f}.json"), "w"))
    return out


def build(did):
    n = DUNGEONS[did]["floors"]
    res = []
    for f in range(1, n + 1):
        if did in ("stormNest", "stormreachSpire"):
            fl, arr = tower(did, f, n)
        else:
            fl, arr = building(did, f, n)
        res.append(export(did, f, fl, arr))
    return res


if __name__ == "__main__":
    ids = sys.argv[1].split(",") if len(sys.argv) > 1 else list(DUNGEONS)
    for d in ids:
        for o in build(d):
            print(f"{d}-f{o['floor']}: {o['width']}x{o['height']}, {len(o['assets'])} assets, mech {list(o['mechanics'])}")
