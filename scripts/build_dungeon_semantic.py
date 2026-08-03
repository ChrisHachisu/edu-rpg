#!/usr/bin/env python3
"""Generate Act-1 dungeon semantic maps: joint-controlled caves, one pattern per dungeon.

Owner, 2026-07-30, in three steps:
  1. "i don't want the new dungeons to look like the current ones, and i want completely new
      dungeons generated based on a new system which look natural and organic. please do your
      research for the best way to generate natural looking dungeons."
  2. "we added keys and locked doors because the dungeons were so stale, so we can remove them
      from the game in general unless we necessarily need it for that type of dungeon."
  3. "note that this circular dungeon won't work for all dungeons: some need to have
      deadends, etc."


WHY THE SHIPPED GENERATOR IS NOT A REFERENCE
-------------------------------------------
`src/utils/MapGenerator.ts` carves axis-aligned rooms joined by L-shaped corridors, which
ART-DIRECTION.md rule 5 rejects outright ("generic rectangular rooms"). It declares every
dungeon 100x100 and fills 3.7% of it, and seeds from `mapId.charCodeAt(0)` alone -- so
Coastal Reef and Crystal Cave share a first letter and their floors 1-3 come out
byte-identical. Rule 5 says none of it is a layout reference, so none of it is used here.


LAYER 1 -- SPACE: joint control
-------------------------------
Real caves are ANGULAR, not smoothly winding. Solution conduits exploit the rock's joint and
fracture sets, so passages run along a few dominant bearings and meet at angles; where two
joint sets are equally developed the plan "resembles city blocks" (Maryland Geological Survey,
joint-controlled cave development), and fracture networks from physical models look like maps
of maze caves (Fournillon et al., AGU 2013).

Each dungeon therefore draws a JOINT SET -- two or three bearings, deliberately off-axis so
the result never reads as a grid -- and every passage is a polyline along those bearings.
Chambers dissolve at the nodes, ELONGATED along a joint, because solution chambers are.
Conduit width follows flow: trunk 2-3 cells, crawlway exactly 1.

An earlier attempt used smoothly bowing corridors between round blobs and read as a single
amoeba. Curvature is the wrong organic cue; angularity is the right one.


LAYER 2 -- PATTERN: one per dungeon, not one for all
----------------------------------------------------
A single topology cannot carry six dungeons, and karst geology already supplies the
repertoire. Palmer's cave-pattern classification maps almost one-to-one onto dungeon feels:

  branchwork   a trunk conduit with tributaries, every tributary ending in a dead end.
               The commonest real cave pattern and the easiest to read. Early dungeons.
  ramiform     galleries radiating from a central hub, sub-branching outward. A hub-and-spoke
               dungeon: you keep returning to the middle.
  spongework   many small chambers linked to their near neighbours. Cellular, close, no long
               sightlines.
  network      an angular lattice along two joint sets -- the "city blocks" maze. Genuinely
               disorienting, so it is the hard optional dungeon.
  anastomotic  a braided trunk: loops leave the main passage and rejoin it further on. Flowing,
               with shortcuts.
  loop         one circuit around a solid rock core, boss in the middle. Reserved for the act
               connector's final floor, where a ring reads as an arena approach.

Crystal Cave, the act connector, walks the whole repertoire floor by floor so the descent
escalates in character rather than just in size.


LOCKS AND KEYS -- DELIBERATELY ABSENT
-------------------------------------
Removed on the owner's instruction above: they existed to relieve staleness, and the pattern
repertoire relieves it better. The extension point is preserved rather than the feature -- the
payoff chamber is walled to a single mouth on its approach conduit, so if a dungeon ever needs
a gate, that mouth is exactly where the door goes and it is provably the only way in. Nothing
generates one today, and `validate()` still checks any lock that appears.


SIZES
-----
Owner-locked Act-1 curve (2026-07-30): the canvas grows through the act, and grows +2 cells
per dimension per floor within a dungeon. Grade scaling is dropped for dungeons per the same
decision, so there is one authored size per floor.

Outputs, into design/act1-dungeon-interiors/:
  <dungeon>-f<n>.json   the semantic map (grid rows + typed asset list + pattern trace)
  <dungeon>-review.png  every floor of one dungeon side by side, with a legend
  index.json            per-dungeon totals and validation status

CHEST PLACEMENT IS LOCKED BY ADR-0076 (owner, 2026-08-02): a chest's cell AND ALL EIGHT
NEIGHBOURS must be walkable. `carve_alcove()` opens the 3x3; `validate()` re-derives it. This
REPLACED the old true-terminal rule ("exactly one way in"), which guaranteed rock on three sides
and was the root of the clearance defect. Do not reinstate it.
"""
from __future__ import annotations

import json
import math
import os
import zlib
from collections import deque

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "design/act1-dungeon-interiors")

ROCK, FLOOR = 0, 1

# Owner, 2026-07-31: "hidden rooms should not appear until act 3". The generator keeps the
# capability — the shipped `hidden` branch case is real and Acts 3-5 want it — but Act 1 must
# not spend it. A player who meets a false wall in the first dungeon has no way to learn that
# walls can be false; it lands as a secret they missed rather than one they found.
ACT = 1
HIDDEN_ROOMS_FROM_ACT = 3

# Cells are 48 world px (LANDMARK-SPRITE-CONTRACT.md:87), the same grid the settled overworld
# uses, so the owner-locked size curve below stands as authored. SCALE is kept as a single knob
# because a 16px/cell re-grid was tried on 2026-07-31 against the SUPERSEDED act1-hifi runtime and
# had to be reverted — leaving the knob makes that reversible rather than a rewrite.
SCALE = 1

# Owner-locked Act-1 curve. `base` is floor 1; each later floor is +2 per side.
# `joints`  the dungeon's fracture bearings in degrees -- its geological signature, and a
#           large part of why two dungeons do not look alike.
# `pattern` its cave pattern (see the module docstring); `floorPatterns` overrides per floor.
# `built`   a worked structure rather than a natural cave, so plain doors make sense in it.
# `theme`   drives ART ONLY. The semantic layer is floor-vs-rock and nothing else, per the
#           owner's paint-class decision.
DUNGEONS = [
    {"id": "sunkenCellar", "name": "Sunken Cellar", "floors": 3, "base": (32, 28),
     "joints": (18, 96), "pattern": "branchwork", "built": True,
     "theme": "flooded stone cellar", "boss": "giantCrab"},
    {"id": "whisperingWoodsCave", "name": "Whispering Woods", "floors": 3, "base": (40, 34),
     "joints": (34, 118), "pattern": "ramiform",
     "theme": "root-riddled earth cave", "boss": "treant"},
    # Darkfang Grotto and "Misty Grotto" are ONE dungeon, confirmed 2026-07-31 against source:
    # `map.mistyGrotto` renders as "Darkfang Grotto" (en) / 暗闇の洞窟 (ja), and no `darkfang`
    # map id, encounter zone or boss exists anywhere. The elder sends the player to "the
    # Darkfang Grotto" to "defeat its guardian", the wisewoman names that guardian as the Giant
    # Toad, and `boss.giantToad.defeated` is the story key that unseals the Crystal Cave. So
    # this is a STORY dungeon, not an optional side one, and it keeps the runtime id
    # `mistyGrotto` because that is what src/data/maps.ts and every save file use.
    # `fog` turns on the implemented-but-unwired fog-of-war mechanic. This dungeon is already
    # written for it: `en.ts:721` reads "Darkness reigns here. Seek torches to light your path",
    # its Japanese name is 暗闇の洞窟 ("cave of darkness"), and `WorldMapScene.initMechanics`
    # handles `mechanic === 'fog'` — only the `mechanic: 'fog'` line in maps.ts is missing.
    {"id": "mistyGrotto", "name": "Darkfang Grotto", "floors": 3, "base": (44, 38),
     "joints": (52, 128), "pattern": "network", "fog": True,
     "theme": "jagged black fang rock", "boss": "giantToad"},
    {"id": "coastalReef", "name": "Coastal Reef", "floors": 3, "base": (48, 42),
     "joints": (12, 84, 152), "pattern": "anastomotic",
     "theme": "tidal coral reef", "boss": "tidalSerpent"},
    {"id": "crystalCave", "name": "Crystal Cave", "floors": 6, "base": (56, 48),
     "joints": (26, 106), "pattern": "branchwork",
     "floorPatterns": {2: "anastomotic", 3: "spongework", 4: "network",
                       5: "ramiform", 6: "loop"},
     "theme": "faceted crystal cavern", "boss": "serpent"},
]

GLYPH = {
    "rock": "#", "floor": ".",
    "mouth": "M",       # out to the overworld (floor 1 only)
    "stairsUp": "U",    # back to the floor above (floor 2+)
    "stairsDown": "D",
    "boss": "B",
    "chest": "C",
    "keyChest": "K",    # not generated — see the docstring
    "lockedDoor": "L",  # not generated — see the docstring
    "door": "d",
    "hiddenDoor": "h",  # tile 17 — passable; the only way into a secret room
    "torch": "T",       # tile 24 — passable pickup; each one adds +2 to the fog radius
    "save": "S",
    "sign": "i",
}


# ─────────────────────────────────────────────────────────────────────────────
#  Space primitives — joint-controlled conduits and solution chambers
# ─────────────────────────────────────────────────────────────────────────────

def joint_vectors(joints_deg: tuple[int, ...],
                  rng: np.random.Generator) -> list[tuple[float, float]]:
    """Unit vectors for every joint bearing and its opposite.

    A real joint set is a handful of orientations, each with a little scatter. Both directions
    of each bearing are available, so a conduit can run either way along a fracture.
    """
    vecs = []
    for deg in joints_deg:
        rad = math.radians(deg + float(rng.uniform(-4.0, 4.0)))
        vx, vy = math.cos(rad), math.sin(rad)
        vecs.append((vx, vy))
        vecs.append((-vx, -vy))
    return vecs


def bresenham(x0: int, y0: int, x1: int, y1: int) -> list[tuple[int, int]]:
    """Cardinally contiguous line — no diagonal-only steps, or the player cannot walk it."""
    cells = [(x0, y0)]
    dx, dy = abs(x1 - x0), abs(y1 - y0)
    sx, sy = (1 if x1 > x0 else -1), (1 if y1 > y0 else -1)
    err = dx - dy
    x, y = x0, y0
    for _ in range(4000):
        if (x, y) == (x1, y1):
            break
        e2 = 2 * err
        moved = False
        if e2 > -dy:
            err -= dy
            x += sx
            cells.append((x, y))
            moved = True
        if e2 < dx:
            err += dx
            y += sy
            cells.append((x, y))
            moved = True
        if not moved:
            break
    return cells


def joint_polyline(a: tuple[int, int], b: tuple[int, int], vecs: list[tuple[float, float]],
                   rng: np.random.Generator, bounds: tuple[int, int]) -> list[tuple[int, int]]:
    """Route A to B using ONLY segments that run along joint bearings.

    At each step take the bearing best aligned with the way to the target and follow it a few
    cells -- occasionally the second-best, which is what stops the path reading as a straight
    line with one kink. Angular joints, not smooth curves: that is the whole point.
    """
    ax, ay = a
    bx, by = b
    pts = [(float(ax), float(ay))]
    cx, cy = float(ax), float(ay)
    for _ in range(60):
        if math.hypot(bx - cx, by - cy) <= 2.5:
            break
        tx, ty = bx - cx, by - cy
        span = math.hypot(tx, ty)
        tx, ty = tx / span, ty / span
        ranked = sorted(vecs, key=lambda v: -(v[0] * tx + v[1] * ty))
        pick = ranked[1] if (span > 9 and rng.random() < 0.34) else ranked[0]
        if pick[0] * tx + pick[1] * ty <= 0.05:
            pick = ranked[0]
        seg = min(float(rng.integers(3, 9)), max(2.0, span * 0.85))
        cx += pick[0] * seg
        cy += pick[1] * seg
        pts.append((cx, cy))
    pts.append((float(bx), float(by)))

    cells: list[tuple[int, int]] = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        cells.extend(bresenham(int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))))

    out: list[tuple[int, int]] = []
    bw, bh = bounds
    for c in cells:
        if out and out[-1] == c:
            continue
        # Clipped here, not only inside carve(): these lists are reused downstream to place
        # doors and to protect conduits, and an off-canvas cell indexes the grid out of bounds.
        if 1 <= c[0] < bw - 1 and 1 <= c[1] < bh - 1:
            out.append(c)
    return out


def carve(grid: np.ndarray, cells: list[tuple[int, int]], width: float) -> None:
    """Open a conduit. Width is the flow hierarchy: a trunk runs 2-3 cells, a crawlway 1."""
    h, w = grid.shape
    r = (width - 1) / 2.0
    reach = int(math.ceil(r))
    for x, y in cells:
        if not (1 <= x < w - 1 and 1 <= y < h - 1):
            continue
        grid[y, x] = FLOOR
        for dy in range(-reach, reach + 1):
            for dx in range(-reach, reach + 1):
                if math.hypot(dx, dy) > r + 0.28:
                    continue
                nx, ny = x + dx, y + dy
                if 1 <= nx < w - 1 and 1 <= ny < h - 1:
                    grid[ny, nx] = FLOOR


def dissolve_chamber(grid: np.ndarray, centre: tuple[int, int], radius: float, bearing: float,
                     elongation: float, rng: np.random.Generator) -> set[tuple[int, int]]:
    """A solution chamber: lobed, and stretched along a joint rather than round.

    Returns the cells it opened. The payoff chamber's exact cell set is what its wall is built
    from -- walling a radius band around it instead left gaps wherever rounding and the widened
    conduit disagreed.
    """
    cx, cy = centre
    p1, p2 = rng.uniform(0, math.tau, 2)
    a1, a2 = rng.uniform(0.14, 0.26), rng.uniform(0.07, 0.15)
    k1, k2 = int(rng.integers(2, 4)), int(rng.integers(4, 7))
    ca, sa = math.cos(bearing), math.sin(bearing)
    reach = int(math.ceil(radius * elongation * 1.5)) + 1
    h, w = grid.shape
    opened: set[tuple[int, int]] = set()
    for dy in range(-reach, reach + 1):
        for dx in range(-reach, reach + 1):
            x, y = cx + dx, cy + dy
            if not (1 <= x < w - 1 and 1 <= y < h - 1):
                continue
            u = (dx * ca + dy * sa) / elongation      # into the joint's frame, then squeeze
            v = -dx * sa + dy * ca
            dist = math.hypot(u, v)
            theta = math.atan2(v, u)
            local = radius * (1 + a1 * math.sin(k1 * theta + p1) + a2 * math.sin(k2 * theta + p2))
            if dist <= local:
                grid[y, x] = FLOOR
                opened.add((x, y))
    return opened


def polish(grid: np.ndarray, protect: set[tuple[int, int]]) -> None:
    """Knock the staircase edges off Bresenham lines and drop isolated nubs.

    Conduit cells are protected: a one-cell crawlway must survive, because a constriction is
    a cave feature and the thing that makes a passage read as a passage.
    """
    h, w = grid.shape
    for _ in range(2):
        counts = np.zeros_like(grid, dtype=np.int16)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx or dy:
                    counts += np.roll(np.roll(grid, dy, 0), dx, 1)
        nxt = grid.copy()
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                if (x, y) in protect:
                    continue
                if grid[y, x] == FLOOR and counts[y, x] <= 1:
                    nxt[y, x] = ROCK
                elif grid[y, x] == ROCK and counts[y, x] >= 7:
                    nxt[y, x] = FLOOR
        grid[:] = nxt
    grid[0, :] = grid[-1, :] = ROCK
    grid[:, 0] = grid[:, -1] = ROCK


def alcoves_and_pendants(grid: np.ndarray, protect: set[tuple[int, int]],
                         rng: np.random.Generator, count: int) -> None:
    """Single-cell alcoves bitten out of chamber walls, and rock pendants left standing in wide
    passages. Both are real cave features and both break up clean edges."""
    h, w = grid.shape
    walls = [(x, y) for y in range(2, h - 2) for x in range(2, w - 2)
             if grid[y, x] == ROCK
             and sum(1 for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
                     if grid[ny, nx] == FLOOR) == 1]
    rng.shuffle(walls)
    for x, y in walls[:count]:
        grid[y, x] = FLOOR

    wide = [(x, y) for y in range(2, h - 2) for x in range(2, w - 2)
            if grid[y, x] == FLOOR and (x, y) not in protect
            and all(grid[y + dy, x + dx] == FLOOR for dx in (-1, 0, 1) for dy in (-1, 0, 1))]
    rng.shuffle(wide)
    for x, y in wide[:max(1, count // 3)]:
        grid[y, x] = ROCK


# ─────────────────────────────────────────────────────────────────────────────
#  Pattern helpers
# ─────────────────────────────────────────────────────────────────────────────

def edge_anchor(w: int, h: int, rng: np.random.Generator) -> tuple[int, int]:
    """A cell just inside one map edge — where the way in or out surfaces."""
    side = int(rng.integers(0, 4))
    if side == 0:
        return (int(rng.integers(6, w - 6)), 3)
    if side == 1:
        return (int(rng.integers(6, w - 6)), h - 4)
    if side == 2:
        return (3, int(rng.integers(6, h - 6)))
    return (w - 4, int(rng.integers(6, h - 6)))


def far_inside(w: int, h: int, origin: tuple[int, int],
               rng: np.random.Generator) -> tuple[int, int]:
    """A well-inset cell a long way from `origin` — the payoff wants distance from the door."""
    best = None
    for _ in range(200):
        cand = (int(rng.integers(7, w - 7)), int(rng.integers(7, h - 7)))
        d = math.hypot(cand[0] - origin[0], cand[1] - origin[1])
        if best is None or d > best[0]:
            best = (d, cand)
    return best[1]


def waypoints(a: tuple[int, int], b: tuple[int, int], count: int, spread: float,
              w: int, h: int, rng: np.random.Generator) -> list[tuple[int, int]]:
    """Points strung between A and B, pushed sideways so the trunk wanders."""
    span = math.hypot(b[0] - a[0], b[1] - a[1]) or 1.0
    px, py = -(b[1] - a[1]) / span, (b[0] - a[0]) / span
    out = []
    for i in range(count):
        t = (i + 1) / (count + 1)
        off = float(rng.uniform(-spread, spread)) * math.sin(math.pi * t)
        x = a[0] + (b[0] - a[0]) * t + px * off
        y = a[1] + (b[1] - a[1]) * t + py * off
        out.append((int(np.clip(round(x), 5, w - 6)), int(np.clip(round(y), 5, h - 6))))
    return out


def connect_all(nodes: list[tuple[int, int]],
                edges: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Add the fewest edges needed to make the node graph connected.

    Every pattern that keeps edges probabilistically needs this: an unreachable chamber is a
    chest the player never finds.
    """
    n = len(nodes)
    adj: list[list[int]] = [[] for _ in range(n)]
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
    reached, queue = {0}, deque([0])
    while queue:
        cur = queue.popleft()
        for nb in adj[cur]:
            if nb not in reached:
                reached.add(nb)
                queue.append(nb)
    out = list(edges)
    while len(reached) < n:
        best = None
        for i in reached:
            for j in range(n):
                if j in reached:
                    continue
                d = math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1])
                if best is None or d < best[0]:
                    best = (d, i, j)
        out.append((best[1], best[2]))
        reached.add(best[2])
        queue = deque([best[2]])
        adj[best[1]].append(best[2])
        adj[best[2]].append(best[1])
        while queue:
            cur = queue.popleft()
            for nb in adj[cur]:
                if nb not in reached:
                    reached.add(nb)
                    queue.append(nb)
    return out


def node_distances(n: int, edges: list[tuple[int, int]], start: int) -> list[int]:
    adj: list[list[int]] = [[] for _ in range(n)]
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
    dist = [-1] * n
    dist[start] = 0
    q = deque([start])
    while q:
        cur = q.popleft()
        for nb in adj[cur]:
            if dist[nb] < 0:
                dist[nb] = dist[cur] + 1
                q.append(nb)
    return dist


# ─────────────────────────────────────────────────────────────────────────────
#  Patterns.  Each returns a SKELETON:
#    entry     where the player arrives (near an edge)
#    payoff    the boss / stairs-down chamber centre
#    approach  the single conduit into the payoff — walled to one mouth
#    conduits  [(cells, width)] every passage, approach included
#    chambers  [(centre, radius)] radius is pre-scale; realise() applies the size factor
#    deadEnds  tips worth putting a chest in
# ─────────────────────────────────────────────────────────────────────────────

def skel_branchwork(w, h, vecs, rng) -> dict:
    """A trunk conduit with tributaries, every tributary ending in a dead end.

    The commonest pattern in real karst — tributaries joining a trunk, a river network run
    backwards — and the easiest kind of dungeon to hold in your head.
    """
    entry = edge_anchor(w, h, rng)
    payoff = far_inside(w, h, entry, rng)
    trunk = [entry] + waypoints(entry, payoff, int(rng.integers(3, 6)),
                                min(w, h) * 0.22, w, h, rng) + [payoff]

    conduits, chambers, dead = [], [], []
    for i, (p, q) in enumerate(zip(trunk, trunk[1:])):
        cells = joint_polyline(p, q, vecs, rng, (w, h))
        conduits.append((cells, 3))
        if i == len(trunk) - 2:
            approach = cells
    chambers.append((entry, float(rng.uniform(2.4, 3.0))))
    for node in trunk[1:-1]:
        chambers.append((node, float(rng.uniform(2.4, 3.4))))
    chambers.append((payoff, float(rng.uniform(3.4, 4.2))))

    # Tributaries hang off the trunk's own cells, away from the payoff.
    trunk_cells = [c for cells, _ in conduits[:-1] for c in cells]
    for _ in range(int(rng.integers(4, 8))):
        if not trunk_cells:
            break
        base = trunk_cells[int(rng.integers(0, len(trunk_cells)))]
        if math.hypot(base[0] - payoff[0], base[1] - payoff[1]) < 9:
            continue
        ang = float(rng.uniform(0, math.tau))
        length = float(rng.integers(6, 14))
        tip = (int(np.clip(round(base[0] + math.cos(ang) * length), 4, w - 5)),
               int(np.clip(round(base[1] + math.sin(ang) * length), 4, h - 5)))
        cells = joint_polyline(base, tip, vecs, rng, (w, h))
        if len(cells) < 4:
            continue
        conduits.append((cells, 1))
        chambers.append((cells[-1], float(rng.uniform(1.7, 2.4))))
        dead.append(cells[-1])
        # A second order of branching, so the network is not a comb.
        if rng.random() < 0.4 and len(cells) > 6:
            mid = cells[len(cells) // 2]
            ang2 = ang + float(rng.uniform(1.0, 2.2)) * (1 if rng.random() < 0.5 else -1)
            l2 = float(rng.integers(4, 9))
            tip2 = (int(np.clip(round(mid[0] + math.cos(ang2) * l2), 4, w - 5)),
                    int(np.clip(round(mid[1] + math.sin(ang2) * l2), 4, h - 5)))
            sub = joint_polyline(mid, tip2, vecs, rng, (w, h))
            if len(sub) >= 3:
                conduits.append((sub, 1))
                chambers.append((sub[-1], float(rng.uniform(1.6, 2.2))))
                dead.append(sub[-1])

    return {"entry": entry, "payoff": payoff, "approach": approach,
            "conduits": conduits, "chambers": chambers, "deadEnds": dead}


def skel_ramiform(w, h, vecs, rng) -> dict:
    """Galleries radiating from a central hub, sub-branching outward.

    Hub-and-spoke: the player keeps coming back through the middle, which makes one chamber
    the dungeon's landmark.
    """
    hub = (int(np.clip(round(w / 2 + rng.uniform(-4, 4)), 8, w - 9)),
           int(np.clip(round(h / 2 + rng.uniform(-4, 4)), 8, h - 9)))
    # Spoke count scales with the canvas. A fixed 4-6 spokes left a 64x56 floor at 9% fill —
    # a handful of corridors lost in a large empty grid, which is the shipped generator's
    # failure mode, not something to reproduce.
    spokes = int(np.clip(round(math.sqrt(w * h) / 8.5), 4, 9))
    spin = float(rng.uniform(0, math.tau))
    reach = min(w, h) * 0.42

    conduits, chambers, dead, tips = [], [(hub, float(rng.uniform(3.4, 4.2)))], [], []
    for i in range(spokes):
        ang = spin + math.tau * i / spokes + float(rng.uniform(-0.28, 0.28))
        length = reach * float(rng.uniform(0.72, 1.12))
        tip = (int(np.clip(round(hub[0] + math.cos(ang) * length), 4, w - 5)),
               int(np.clip(round(hub[1] + math.sin(ang) * length), 4, h - 5)))
        cells = joint_polyline(hub, tip, vecs, rng, (w, h))
        if len(cells) < 4:
            continue
        conduits.append((cells, 2))
        chambers.append((cells[-1], float(rng.uniform(2.2, 3.0))))
        tips.append((cells, cells[-1]))
        for frac in (0.45, 0.75):
            if rng.random() > 0.75 or len(cells) <= 6:
                continue
            mid = cells[int(len(cells) * frac)]
            ang2 = ang + float(rng.uniform(0.9, 1.9)) * (1 if rng.random() < 0.5 else -1)
            l2 = float(rng.integers(5, 12))
            tip2 = (int(np.clip(round(mid[0] + math.cos(ang2) * l2), 4, w - 5)),
                    int(np.clip(round(mid[1] + math.sin(ang2) * l2), 4, h - 5)))
            sub = joint_polyline(mid, tip2, vecs, rng, (w, h))
            if len(sub) >= 3:
                conduits.append((sub, 1))
                chambers.append((sub[-1], float(rng.uniform(1.7, 2.3))))
                dead.append(sub[-1])

    # The way in surfaces at the gallery nearest an edge; the payoff sits at the far one.
    entry_tip = min(tips, key=lambda t: min(t[1][0], t[1][1], w - 1 - t[1][0], h - 1 - t[1][1]))
    entry = entry_tip[1]
    rest = [t for t in tips if t is not entry_tip]
    payoff_tip = max(rest, key=lambda t: math.hypot(t[1][0] - entry[0], t[1][1] - entry[1])) \
        if rest else entry_tip
    payoff = payoff_tip[1]
    chambers = [(c, r if c != payoff else float(rng.uniform(3.4, 4.2))) for c, r in chambers]
    for cells, tip in tips:
        if tip not in (entry, payoff):
            dead.append(tip)

    return {"entry": entry, "payoff": payoff, "approach": payoff_tip[0],
            "conduits": conduits, "chambers": chambers, "deadEnds": dead}


def skel_spongework(w, h, vecs, rng) -> dict:
    """Many small chambers linked to their near neighbours — cellular, close, no long views."""
    count = int(np.clip(round(w * h / 78), 8, 22))
    sep = math.sqrt(w * h / count) * 0.72
    pts: list[tuple[int, int]] = []
    for _ in range(count * 400):
        if len(pts) >= count:
            break
        cand = (int(rng.integers(5, w - 5)), int(rng.integers(5, h - 5)))
        if all(math.hypot(cand[0] - p[0], cand[1] - p[1]) >= sep for p in pts):
            pts.append(cand)

    # Nearest neighbour always, second-nearest only sometimes. Linking every node to both
    # left the graph with no degree-1 nodes at all, so the floor had no pockets and therefore
    # nowhere to put a chest — a spongework cave should still have blind cells.
    edges: list[tuple[int, int]] = []
    for i, p in enumerate(pts):
        order = sorted((j for j in range(len(pts)) if j != i),
                       key=lambda j: math.hypot(p[0] - pts[j][0], p[1] - pts[j][1]))
        for rank, j in enumerate(order[:2]):
            if rank == 1 and rng.random() > 0.55:
                continue
            if (min(i, j), max(i, j)) not in edges:
                edges.append((min(i, j), max(i, j)))
    edges = connect_all(pts, edges)

    entry_i = min(range(len(pts)),
                  key=lambda i: min(pts[i][0], pts[i][1], w - 1 - pts[i][0], h - 1 - pts[i][1]))
    dist = node_distances(len(pts), edges, entry_i)
    payoff_i = max(range(len(pts)), key=lambda i: (dist[i], i))
    # Prune the payoff to a single edge so its chamber has one mouth.
    into = [e for e in edges if payoff_i in e]
    keep = into[0]
    edges = [e for e in edges if payoff_i not in e or e == keep]

    conduits, approach = [], None
    for a, b in edges:
        cells = joint_polyline(pts[a], pts[b], vecs, rng, (w, h))
        conduits.append((cells, 1 if rng.random() < 0.65 else 2))
        if (a, b) == keep:
            approach = cells
    chambers = [(p, float(rng.uniform(1.9, 2.8))) for p in pts]
    chambers[payoff_i] = (pts[payoff_i], float(rng.uniform(3.4, 4.2)))
    degree = {i: sum(1 for e in edges if i in e) for i in range(len(pts))}
    dead = [pts[i] for i in range(len(pts))
            if degree.get(i, 0) <= 1 and i not in (entry_i, payoff_i)]

    return {"entry": pts[entry_i], "payoff": pts[payoff_i], "approach": approach,
            "conduits": conduits, "chambers": chambers, "deadEnds": dead}


def skel_network(w, h, vecs, joints, rng) -> dict:
    """An angular lattice along two joint sets — the "city blocks" maze cave.

    This is the pattern real geology produces when two joint sets are equally developed, and
    it is genuinely disorienting, so it is kept for the hard optional dungeon.
    """
    e1 = (math.cos(math.radians(joints[0])), math.sin(math.radians(joints[0])))
    e2 = (math.cos(math.radians(joints[1])), math.sin(math.radians(joints[1])))
    # Two independent spacings and a per-node wobble. A single spacing with exact lattice
    # positions produced identical diamonds across the whole floor — it read as woven fabric,
    # not as rock. Real fracture sets are not evenly spaced, and the irregularity is most of
    # what makes a maze cave look geological.
    step1 = float(rng.uniform(6.0, 9.5))
    step2 = float(rng.uniform(6.0, 9.5))
    cx, cy = w / 2, h / 2
    span = int(max(w, h) / min(step1, step2)) + 2

    index: dict[tuple[int, int], int] = {}
    pts: list[tuple[int, int]] = []
    for i in range(-span, span + 1):
        for j in range(-span, span + 1):
            jitter = rng.uniform(-1.7, 1.7, 2)
            x = cx + step1 * i * e1[0] + step2 * j * e2[0] + jitter[0]
            y = cy + step1 * i * e1[1] + step2 * j * e2[1] + jitter[1]
            if 5 <= x < w - 5 and 5 <= y < h - 5:
                index[(i, j)] = len(pts)
                pts.append((int(round(x)), int(round(y))))
    if len(pts) < 6:                                    # canvas too small for a lattice
        return skel_branchwork(w, h, vecs, rng)

    edges: list[tuple[int, int]] = []
    for (i, j), a in index.items():
        for nb in ((i + 1, j), (i, j + 1)):
            b = index.get(nb)
            if b is not None and rng.random() < float(rng.uniform(0.50, 0.72)):
                edges.append((a, b))
    edges = connect_all(pts, edges)

    entry_i = min(range(len(pts)),
                  key=lambda i: min(pts[i][0], pts[i][1], w - 1 - pts[i][0], h - 1 - pts[i][1]))
    dist = node_distances(len(pts), edges, entry_i)
    payoff_i = max(range(len(pts)), key=lambda i: (dist[i], i))
    into = [e for e in edges if payoff_i in e]
    keep = into[0]
    edges = [e for e in edges if payoff_i not in e or e == keep]

    conduits, approach = [], None
    for a, b in edges:
        cells = joint_polyline(pts[a], pts[b], vecs, rng, (w, h))
        conduits.append((cells, 1))
        if (a, b) == keep:
            approach = cells
    chambers = [(p, float(rng.uniform(1.5, 2.2))) for p in pts]
    chambers[payoff_i] = (pts[payoff_i], float(rng.uniform(3.4, 4.2)))
    degree = {i: sum(1 for e in edges if i in e) for i in range(len(pts))}
    dead = [pts[i] for i in range(len(pts))
            if degree.get(i, 0) <= 1 and i not in (entry_i, payoff_i)]

    return {"entry": pts[entry_i], "payoff": pts[payoff_i], "approach": approach,
            "conduits": conduits, "chambers": chambers, "deadEnds": dead}


def skel_anastomotic(w, h, vecs, rng) -> dict:
    """A braided trunk: loops leave the main passage and rejoin it further on.

    Flowing, with shortcuts — the pattern floodwater leaves along low-angle partings.
    """
    entry = edge_anchor(w, h, rng)
    payoff = far_inside(w, h, entry, rng)
    trunk = [entry] + waypoints(entry, payoff, int(rng.integers(4, 7)),
                                min(w, h) * 0.18, w, h, rng) + [payoff]

    conduits, chambers, dead = [], [], []
    approach = None
    for i, (p, q) in enumerate(zip(trunk, trunk[1:])):
        cells = joint_polyline(p, q, vecs, rng, (w, h))
        conduits.append((cells, 3))
        if i == len(trunk) - 2:
            approach = cells
    chambers.append((entry, float(rng.uniform(2.4, 3.0))))
    for node in trunk[1:-1]:
        chambers.append((node, float(rng.uniform(1.9, 2.6))))
    chambers.append((payoff, float(rng.uniform(3.4, 4.2))))

    # Bypasses: depart one trunk node, bow outward, rejoin a later one. Never the last node,
    # so the payoff keeps its single mouth.
    inner = trunk[:-1]
    for _ in range(int(rng.integers(3, 6))):
        if len(inner) < 4:
            break
        i = int(rng.integers(0, len(inner) - 2))
        j = min(len(inner) - 1, i + int(rng.integers(2, 4)))
        a, b = inner[i], inner[j]
        span = math.hypot(b[0] - a[0], b[1] - a[1]) or 1.0
        px, py = -(b[1] - a[1]) / span, (b[0] - a[0]) / span
        # Swing the bypass well clear of the trunk. At a shallow push the loop hugs the main
        # passage and the two merge into one pale mass instead of reading as two routes around
        # a core of rock — which is the whole point of a braided cave.
        push = span * float(rng.uniform(0.60, 1.05)) * (1 if rng.random() < 0.5 else -1)
        via = (int(np.clip(round((a[0] + b[0]) / 2 + px * push), 4, w - 5)),
               int(np.clip(round((a[1] + b[1]) / 2 + py * push), 4, h - 5)))
        first = joint_polyline(a, via, vecs, rng, (w, h))
        second = joint_polyline(via, b, vecs, rng, (w, h))
        if len(first) < 3 or len(second) < 3:
            continue
        conduits.append((first, 1))
        conduits.append((second, 1))
        chambers.append((via, float(rng.uniform(1.5, 2.1))))

    # A couple of true dead ends, because a purely braided cave gives the player nothing to find.
    trunk_cells = [c for cells, _ in conduits[:len(trunk) - 2] for c in cells]
    for _ in range(int(rng.integers(2, 4))):
        if not trunk_cells:
            break
        base = trunk_cells[int(rng.integers(0, len(trunk_cells)))]
        if math.hypot(base[0] - payoff[0], base[1] - payoff[1]) < 9:
            continue
        ang = float(rng.uniform(0, math.tau))
        length = float(rng.integers(5, 11))
        tip = (int(np.clip(round(base[0] + math.cos(ang) * length), 4, w - 5)),
               int(np.clip(round(base[1] + math.sin(ang) * length), 4, h - 5)))
        cells = joint_polyline(base, tip, vecs, rng, (w, h))
        if len(cells) < 4:
            continue
        conduits.append((cells, 1))
        chambers.append((cells[-1], float(rng.uniform(1.7, 2.3))))
        dead.append(cells[-1])

    return {"entry": entry, "payoff": payoff, "approach": approach,
            "conduits": conduits, "chambers": chambers, "deadEnds": dead}


def skel_loop(w, h, vecs, rng) -> dict:
    """One circuit around a solid rock core, payoff in the middle.

    Kept for the act connector's last floor, where a ring reads as an arena approach. It is
    deliberately NOT the default: a loop everywhere makes every floor look like the same map,
    and it leaves the core as dead space.
    """
    cx, cy = w / 2.0, h / 2.0
    rx, ry = w * 0.40, h * 0.40
    spin = float(rng.uniform(0, 360))

    def at(deg: float, pull: float) -> tuple[int, int]:
        pull *= float(rng.uniform(0.86, 1.06))
        a = math.radians(deg + float(rng.uniform(-9, 9)))
        return (int(np.clip(round(cx + math.cos(a) * rx * pull), 4, w - 5)),
                int(np.clip(round(cy + math.sin(a) * ry * pull), 4, h - 5)))

    ring = [at(spin + 360 * i / 8, 1.0) for i in range(8)]
    entry = at(spin + 180, 1.22)
    payoff = (int(np.clip(round(cx + rng.uniform(-2, 2)), 5, w - 6)),
              int(np.clip(round(cy + rng.uniform(-2, 2)), 5, h - 6)))

    conduits, chambers, dead = [], [], []
    for a, b in zip(ring, ring[1:] + ring[:1]):
        conduits.append((joint_polyline(a, b, vecs, rng, (w, h)), 2))
    conduits.append((joint_polyline(entry, ring[4], vecs, rng, (w, h)), 3))
    approach = joint_polyline(ring[0], payoff, vecs, rng, (w, h))
    conduits.append((approach, 2))

    chambers.append((entry, float(rng.uniform(2.4, 3.0))))
    for node in ring:
        chambers.append((node, float(rng.uniform(2.2, 3.2))))
    chambers.append((payoff, float(rng.uniform(3.6, 4.4))))

    for node in (ring[2], ring[6]):
        ang = math.atan2(node[1] - cy, node[0] - cx) + float(rng.uniform(-0.7, 0.7))
        length = float(rng.integers(5, 10))
        tip = (int(np.clip(round(node[0] + math.cos(ang) * length), 4, w - 5)),
               int(np.clip(round(node[1] + math.sin(ang) * length), 4, h - 5)))
        cells = joint_polyline(node, tip, vecs, rng, (w, h))
        if len(cells) >= 4:
            conduits.append((cells, 1))
            chambers.append((cells[-1], float(rng.uniform(1.7, 2.3))))
            dead.append(cells[-1])

    return {"entry": entry, "payoff": payoff, "approach": approach,
            "conduits": conduits, "chambers": chambers, "deadEnds": dead}


# ─────────────────────────────────────────────────────────────────────────────
#  Realise a skeleton into a grid
# ─────────────────────────────────────────────────────────────────────────────

def reachable(grid: np.ndarray, start: tuple[int, int],
              blocked: set[tuple[int, int]] | None = None) -> set[tuple[int, int]]:
    h, w = grid.shape
    blocked = blocked or set()
    sx, sy = start
    if not (0 <= sx < w and 0 <= sy < h) or grid[sy, sx] != FLOOR:
        return set()
    seen = {start}
    q = deque([start])
    while q:
        x, y = q.popleft()
        for nb in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            nx, ny = nb
            if 0 <= nx < w and 0 <= ny < h and grid[ny, nx] == FLOOR \
                    and nb not in seen and nb not in blocked:
                seen.add(nb)
                q.append(nb)
    return seen


def generate_floor(spec: dict, floor: int, seed: int) -> dict:
    # The owner-locked curve (base, +2 per side per floor) is authored in the ORIGINAL cell
    # units; SCALE carries it onto the Act-1 16px/cell world grid. Scaling the curve rather than
    # rewriting the numbers keeps the locked decision legible and reversible.
    w = (spec["base"][0] + 2 * (floor - 1)) * SCALE
    h = (spec["base"][1] + 2 * (floor - 1)) * SCALE
    rng = np.random.default_rng(seed)
    is_final = floor == spec["floors"]
    pattern = spec.get("floorPatterns", {}).get(floor, spec["pattern"])

    vecs = joint_vectors(spec["joints"], rng)
    scale = math.sqrt(w * h)
    # Every chamber scales with the canvas. Without it a 32x28 floor gets the same chambers as
    # a 66x58 one and drowns at ~47% fill, which is how an earlier attempt became an amoeba.
    k = min(1.0, scale / 46.0)

    if pattern == "branchwork":
        skel = skel_branchwork(w, h, vecs, rng)
    elif pattern == "ramiform":
        skel = skel_ramiform(w, h, vecs, rng)
    elif pattern == "spongework":
        skel = skel_spongework(w, h, vecs, rng)
    elif pattern == "network":
        skel = skel_network(w, h, vecs, spec["joints"], rng)
    elif pattern == "anastomotic":
        skel = skel_anastomotic(w, h, vecs, rng)
    elif pattern == "loop":
        skel = skel_loop(w, h, vecs, rng)
    else:
        raise ValueError(f"unknown pattern {pattern!r}")

    grid = np.zeros((h, w), dtype=np.int8)
    trunk_w = (3 if k > 0.85 else 2) * SCALE
    # A braided pattern lays several conduits over the same ground, so a 3-wide trunk plus its
    # bypasses and their chambers merge into one pale mass — the amoeba failure again, reached
    # by a different route. Anastomotic floors keep a narrower trunk.
    if pattern == "anastomotic":
        trunk_w = 2 * SCALE
    conduit_cells: set[tuple[int, int]] = set()
    for cells, width in skel["conduits"]:
        carve(grid, cells, min(width * SCALE, trunk_w))
        conduit_cells.update(cells)

    joint_rads = [math.radians(d) for d in spec["joints"]]
    vault_cells: set[tuple[int, int]] = set()
    for centre, radius in skel["chambers"]:
        bearing = joint_rads[int(rng.integers(0, len(joint_rads)))]
        elong = float(rng.uniform(1.25, 1.9))
        opened = dissolve_chamber(grid, centre, radius * k / math.sqrt(elong),
                                  bearing, elong, rng)
        if centre == skel["payoff"]:
            vault_cells = opened

    polish(grid, conduit_cells)
    alcoves_and_pendants(grid, conduit_cells, rng,
                         count=max(3, int(scale / (3.2 if pattern == "anastomotic" else 5))))
    for x, y in conduit_cells:                  # polish must never sever a passage
        grid[y, x] = FLOOR

    # A stub out to the map edge, so the way in surfaces rather than starting mid-rock.
    ex, ey = skel["entry"]
    border = min([(ey, (ex, 0)), (h - 1 - ey, (ex, h - 1)),
                  (ex, (0, ey)), (w - 1 - ex, (w - 1, ey))], key=lambda t: t[0])[1]
    # Along the joint bearings, not a ruled line. A dead-straight one-wide corridor to the map
    # edge was the one thing in these caves that could not occur in rock — every other passage
    # follows a fracture, and the way in was arriving as a drilled shaft.
    stub = joint_polyline((ex, ey), border, vecs, rng, (w, h))
    if border not in stub:
        stub = stub + bresenham(*(stub[-1] if stub else (ex, ey)), *border)
    for cell in stub:
        if 0 <= cell[0] < w and 0 <= cell[1] < h:
            grid[cell[1], cell[0]] = FLOOR
            conduit_cells.add(cell)

    entry_anchor = skel["entry"] if grid[ey, ex] == FLOOR else border
    live = reachable(grid, entry_anchor)
    for y in range(h):
        for x in range(w):
            if grid[y, x] == FLOOR and (x, y) not in live:
                grid[y, x] = ROCK

    # Wall the payoff chamber to a single mouth on its approach conduit. With locks removed
    # this is purely for readability — you know when you are entering the boss room — and it
    # is the one place a gate would go if a dungeon ever needs one. Conduits are never walled,
    # so this can pinch the chamber but can never sever a passage.
    approach = set(skel["approach"] or [])
    vault = {c for c in vault_cells if grid[c[1], c[0]] == FLOOR} - approach
    for x, y in list(vault):
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if not (1 <= nx < w - 1 and 1 <= ny < h - 1):
                continue
            if grid[ny, nx] == FLOOR and (nx, ny) not in vault \
                    and (nx, ny) not in conduit_cells:
                grid[ny, nx] = ROCK

    live = reachable(grid, entry_anchor)
    for y in range(h):
        for x in range(w):
            if grid[y, x] == FLOOR and (x, y) not in live:
                grid[y, x] = ROCK

    return place_assets(spec, floor, is_final, pattern, grid, skel, border, entry_anchor,
                        {c for c in vault if grid[c[1], c[0]] == FLOOR}, rng)


# ─────────────────────────────────────────────────────────────────────────────
#  Populate
# ─────────────────────────────────────────────────────────────────────────────

def distance_field(grid: np.ndarray, start: tuple[int, int]) -> np.ndarray:
    """Walking distance in cells from `start`. -1 where unreachable.

    This is the backbone of asset placement. Placing assets near skeleton NODES was the
    original mistake: a node can sit two steps from the way in even when the pattern meant it
    to be the far end, because the skeleton knows Euclidean geometry and the player walks the
    grid. Distance from the arrival cell is the only measure that matches what the player
    experiences.
    """
    h, w = grid.shape
    dist = -np.ones((h, w), dtype=np.int32)
    sx, sy = start
    if not (0 <= sx < w and 0 <= sy < h) or grid[sy, sx] != FLOOR:
        return dist
    dist[sy, sx] = 0
    q = deque([start])
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and grid[ny, nx] == FLOOR and dist[ny, nx] < 0:
                dist[ny, nx] = dist[y, x] + 1
                q.append((nx, ny))
    return dist


def route_to(dist: np.ndarray, target: tuple[int, int]) -> list[tuple[int, int]]:
    """The main route: walk the distance field downhill from `target` back to the arrival."""
    h, w = dist.shape
    if dist[target[1], target[0]] < 0:
        return []
    cells = [target]
    cur = target
    while dist[cur[1], cur[0]] > 0:
        x, y = cur
        options = [(nx, ny) for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
                   if 0 <= nx < w and 0 <= ny < h and dist[ny, nx] >= 0]
        if not options:
            break
        nxt = min(options, key=lambda c: dist[c[1], c[0]])
        if dist[nxt[1], nxt[0]] >= dist[y, x]:
            break
        cur = nxt
        cells.append(cur)
    return cells


def openness(grid: np.ndarray, cell: tuple[int, int]) -> int:
    x, y = cell
    h, w = grid.shape
    return sum(1 for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
               if 0 <= nx < w and 0 <= ny < h and grid[ny, nx] == FLOOR)


def arena(grid: np.ndarray, cell: tuple[int, int], r: int = 3) -> int:
    """Floor cells within `r` — how much room there is to fight here."""
    x, y = cell
    h, w = grid.shape
    n = 0
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and math.hypot(dx, dy) <= r and grid[ny, nx] == FLOOR:
                n += 1
    return n


def open8(grid: np.ndarray, cell: tuple[int, int]) -> int:
    """Floor cells in the 8-neighbourhood — how much ROOM a prop has, as opposed to how many ways
    out it has.

    `openness()` counts 4-neighbours and answers a gameplay question: is this a dead end. This
    answers a drawing one: is there anything to see the prop against. The two come apart exactly
    where the owner's complaint lives — the tip of a one-wide corridor and a dead end inside a
    three-wide pocket BOTH have openness 1, but the first is walled on seven sides and the second
    is not.
    """
    x, y = cell
    h, w = grid.shape
    return sum(1 for dy in (-1, 0, 1) for dx in (-1, 0, 1)
               if (dx or dy) and 0 <= x + dx < w and 0 <= y + dy < h
               and grid[y + dy, x + dx] == FLOOR)


def carve_alcove(grid: np.ndarray, cell: tuple[int, int], vault: set,
                 dist: np.ndarray, on_route: set = frozenset(), dry: bool = False) -> bool:
    """Open the chest's full 3x3 to walkable floor. Refuses only if that would join two passages.

    OWNER RULE, 2026-08-02: "the squares that ... chests are placed needs to be touching walkable
    squares for all the nine squares that it is touching." This supersedes the old TRUE-TERMINAL
    rule (exactly one way out), which is what pinned every chest against rock by construction and
    which no amount of render-side clearance could undo — collision is grid-authoritative, so
    clearance has to be real floor.

    The one test kept is the shortcut test: delete the box from the graph and require the floor
    cells around it to stay connected to one another. If they do, the box hangs off a single
    region and opening it cannot create a second route through the level.
    """
    x, y = cell
    h, w = grid.shape
    box = [(x + dx, y + dy) for dy in (-1, 0, 1) for dx in (-1, 0, 1)
           if 1 <= x + dx < w - 1 and 1 <= y + dy < h - 1]
    if len(box) != 9 or any(c in vault for c in box):
        return False
    # Not into the main route. Widening a corridor tip can pull the shortest path THROUGH the
    # alcove, which turns the reward back into something the player walks over rather than finds.
    if any(c in on_route for c in box):
        return False
    inside = set(box)
    touch = list(dict.fromkeys(
        nb for (bx, by) in box
        for nb in ((bx + 1, by), (bx - 1, by), (bx, by + 1), (bx, by - 1))
        if nb not in inside and 0 <= nb[0] < w and 0 <= nb[1] < h
        and grid[nb[1], nb[0]] == FLOOR))
    if not touch:
        return False
    seen = {touch[0]}
    stack = [touch[0]]
    while stack:
        c = stack.pop()
        for nb in ((c[0] + 1, c[1]), (c[0] - 1, c[1]), (c[0], c[1] + 1), (c[0], c[1] - 1)):
            if nb in inside or nb in seen:
                continue
            if 0 <= nb[0] < w and 0 <= nb[1] < h and grid[nb[1], nb[0]] == FLOOR:
                seen.add(nb)
                stack.append(nb)
    if any(t not in seen for t in touch):
        return False                      # would join two passages — a shortcut
    if dry:
        return True
    for (rx, ry) in box:
        grid[ry, rx] = FLOOR
    return True


def footprint_clear(grid: np.ndarray, cell: tuple[int, int], draw_cells: float,
                    sub: int = 8) -> float:
    """Fraction of a prop's DRAWN FOOTPRINT that will render as floor, at sub-cell resolution.

    `open8()` counts whole neighbouring cells and cannot see what the owner sees. Measured against
    the renderer's own floor-weight field, two chests both scoring 5/8 came out 0.0% and 7.3%
    fouled, and `save` (1.3 cells) and `stairsUp` (1.5 cells) reached 19.8% and 15.8% — because a
    prop is drawn LARGER than its cell and the floor/rock boundary is deliberately warped and
    blurred, so rock bulges under the sprite from cells the count says are fine.

    This mirrors the renderer: upsample the floor mask, blur it with the same 0.34-cell sigma, and
    ask how much of the sprite box clears the 0.5 transfer midpoint. Headroom of 0.12 is left for
    the boundary warp, which this does not model.
    """
    x, y = cell
    h, w = grid.shape
    pad = int(math.ceil(draw_cells)) + 3
    x0, x1 = max(0, x - pad), min(w, x + pad + 1)
    y0, y1 = max(0, y - pad), min(h, y + pad + 1)
    local = (grid[y0:y1, x0:x1] == FLOOR).astype(np.float32)
    up = np.repeat(np.repeat(local, sub, axis=0), sub, axis=1)

    sigma = 0.34 * sub
    r = int(math.ceil(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2).astype(np.float32)
    k /= k.sum()
    for axis in (1, 0):
        ap = np.pad(up, ((0, 0), (r, r)) if axis == 1 else ((r, r), (0, 0)), mode="edge")
        out = np.zeros_like(up)
        for i, wt in enumerate(k):
            out += wt * (ap[:, i:i + up.shape[1]] if axis == 1 else ap[i:i + up.shape[0], :])
        up = out

    side = 0.86 * draw_cells * sub
    cxp = (x - x0 + 0.5) * sub
    cyp = (y - y0 + 0.5 - 0.04) * sub
    a = up[max(0, int(cyp - side / 2)):int(cyp + side / 2),
           max(0, int(cxp - side / 2)):int(cxp + side / 2)]
    return float((a >= 0.62).mean()) if a.size else 0.0


def spread_along(candidates: list, dist: np.ndarray, count: int, gap: int,
                 used: dict, lo: float = 0.25, prefer=None) -> list:
    """Pick `count` cells spread along the DISTANCE FIELD as well as apart in space.

    Taking the highest-distance local maxima put every chest at the far end of the floor,
    because that is where the deepest dead ends are — on Crystal Cave's larger floors they
    clumped into one corner. Splitting the journey into bands and taking one from each spreads
    the reward across the whole descent, which is what a player experiences as "well placed".
    """
    if not candidates or count <= 0:
        return []
    dmax = max(int(dist[c[1], c[0]]) for c in candidates) or 1
    picked: list = []
    for k in range(count):
        t0 = (lo + (1.0 - lo) * k / count) * dmax
        t1 = (lo + (1.0 - lo) * (k + 1) / count) * dmax
        # `prefer` (when given) outranks depth WITHIN a band. The band already constrains how
        # far into the floor the pick is, so ordering inside it by depth alone was spending the
        # remaining freedom on a property nobody asked for. Depth stays the tiebreak.
        band = sorted((c for c in candidates
                       if t0 <= int(dist[c[1], c[0]]) <= t1 and c not in picked),
                      key=lambda c: (-(prefer(c) if prefer else 0), -int(dist[c[1], c[0]])))
        for c in band:
            if all(abs(c[0] - p[0]) + abs(c[1] - p[1]) >= gap for p in picked) \
                    and spaced(c, used, gap):
                picked.append(c)
                break
    # Bands can come up empty on a floor whose dead ends bunch; top up from anywhere that fits.
    for c in sorted(candidates,
                    key=lambda c: (-(prefer(c) if prefer else 0), -int(dist[c[1], c[0]]))):
        if len(picked) >= count:
            break
        if c in picked:
            continue
        if all(abs(c[0] - p[0]) + abs(c[1] - p[1]) >= gap for p in picked) and spaced(c, used, gap):
            picked.append(c)
    return picked


def spaced(cell: tuple[int, int], used: dict[tuple[int, int], str], gap: int) -> bool:
    """Assets crowding each other read as a pile of props, not as placed content."""
    return all(abs(cell[0] - u[0]) + abs(cell[1] - u[1]) >= gap for u in used)


# How many cells of breathing room each prop gets, in CELLS. Only props that are IMPASSABLE or
# draw larger than their cell need it; a torch is a flat pickup and a plaque IS wall.
CLEARANCE = {"chest": 1, "save": 1, "boss": 1, "stairsUp": 1, "stairsDown": 1}


def place_assets(spec: dict, floor: int, is_final: bool, pattern: str, grid: np.ndarray,
                 skel: dict, border: tuple[int, int], entry_anchor: tuple[int, int],
                 vault: set[tuple[int, int]], rng: np.random.Generator) -> dict:
    """Place every asset against the DISTANCE FIELD from the way in, by role.

    Owner, 2026-07-30: "you don't seem to have a concept of where the assets should be placed."
    Correct — they were placed near whichever skeleton node was nearest, which is geometry, not
    gameplay. Each role now has a rule stated in terms of the player's journey, and validate()
    re-checks every one of them:

      arrival     at the map edge, where the stub surfaces
      payoff      in the vault chamber, on the most open cell — a boss needs an arena — and
                  required to sit at >= 70% of the floor's eccentricity from the arrival
      chest       at a LOCAL MAXIMUM of the distance field and OFF the main route, so a chest
                  is always a reward for leaving the path, never something passed on the way
      save        ON the main route at ~75% of the way to the payoff: a breather in sight of
                  the end, not next to it
      sign        within a few cells of the arrival, facing in
      door        at a constriction on the main route, in the first half, built dungeons only

    Everything keeps a minimum separation, so nothing lands in a pile.
    """
    h, w = grid.shape
    assets: list[dict] = []
    used: dict[tuple[int, int], str] = {}

    def put(kind: str, cell: tuple[int, int], **extra) -> None:
        used[cell] = kind
        assets.append({"kind": kind, "x": cell[0], "y": cell[1], **extra})

    entry = border if grid[border[1], border[0]] == FLOOR else entry_anchor
    put("mouth" if floor == 1 else "stairsUp", entry)

    dist = distance_field(grid, entry)
    ecc = int(dist.max())

    # ── Payoff: the most open cell of the vault, which is the chamber the pattern built for it.
    pool = [c for c in vault if grid[c[1], c[0]] == FLOOR and dist[c[1], c[0]] >= 0] \
        or [(x, y) for y in range(h) for x in range(w)
            if grid[y, x] == FLOOR and dist[y, x] >= 0.8 * ecc]
    payoff = max(pool, key=lambda c: (arena(grid, c), int(dist[c[1], c[0]]))) if pool else None
    if payoff:
        put("boss" if is_final else "stairsDown", payoff,
            **({"bossId": spec["boss"]} if is_final and spec["boss"] else {}))

    route = route_to(dist, payoff) if payoff else []
    on_route = set(route)
    payoff_dist = int(dist[payoff[1], payoff[0]]) if payoff else ecc

    # ── Nothing impassable may seal the floor. ────────────────────────────────────────────
    #
    #    In dungeons `WorldMapScene.ts:1194` makes chest (4), boss (7), plaque (18) and crystal
    #    save (14) IMPASSABLE. Placement here had no model of that, and it soft-locked 6 of 18
    #    floors: the plaque landed in the one-wide entry stub and sealed three dungeons at the
    #    front door (2 reachable cells out of ~200), and the save crystal sealed the boss on
    #    three more. Every impassable asset is now tested against the grid before it is kept.
    blockers: set[tuple[int, int]] = set()

    def open_set() -> set[tuple[int, int]]:
        return reachable(grid, entry, blockers)

    def reach_now() -> set:
        return reachable(grid, entry, blockers)

    def may_block(cell: tuple[int, int]) -> bool:
        """True if making `cell` solid costs only that cell, and nothing behind it."""
        before = open_set()
        after = reachable(grid, entry, blockers | {cell})
        return len(after) == len(before) - (1 if cell in before else 0)

    # The boss is impassable too — the player bumps into it. Its chamber must survive that.
    if is_final and payoff and may_block(payoff):
        blockers.add(payoff)

    # ── Save crystal: a CARVED alcove of its own beside the boss chamber mouth.
    #
    #    Owner: "preferably the save crystal is given its dedicated space rather than being
    #    plotted on the path randomly". The shipped generator agrees and shows how — its branch
    #    handler runs `carveRoom(bex-1, bey-1, 3, 3); map[bey][bex] = 14`, i.e. it cuts a room
    #    for the crystal rather than dropping it in a corridor. So this cuts a two-cell pocket
    #    into the rock off the approach and stands the crystal at the end of it: dedicated
    #    space, off the path, and blocking nothing because it is a dead end.
    if is_final and route:
        for i, cell in enumerate(route):              # route runs payoff -> arrival
            if cell in vault or cell in used:
                continue
            # Nearness to the boss mouth outranks alcove depth: a two-cell pocket is nicer,
            # but a crystal 22 steps back from the fight is not "right before the boss".
            done = False
            for depth in (2, 1):
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    cells = [(cell[0] + k * dx, cell[1] + k * dy) for k in range(1, depth + 1)]
                    if not all(1 <= c[0] < w - 1 and 1 <= c[1] < h - 1 for c in cells):
                        continue
                    if any(grid[c[1], c[0]] != ROCK for c in cells):
                        continue
                    tip = cells[-1]
                    # Do not cut into the boss vault, and make sure the pocket is a genuine
                    # dead end — every way on from the tip must be rock. Requiring the whole
                    # 3x3 around the tip to be rock was too strict beside an open chamber and
                    # pushed the crystal 22 steps back from the fight.
                    ring = [(tip[0] + ex, tip[1] + ey) for ex in (-1, 0, 1) for ey in (-1, 0, 1)]
                    if any(c in vault for c in ring + cells):
                        continue
                    onward = [(tip[0] + ox, tip[1] + oy)
                              for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
                    if any(grid[c[1], c[0]] == FLOOR for c in onward
                           if 0 <= c[0] < w and 0 <= c[1] < h and c not in cells + [cell]):
                        continue
                    for c in cells:
                        grid[c[1], c[0]] = FLOOR
                    put("save", tip)
                    done = True
                    break
                if done:
                    break
            if done:
                break

    # ── Hidden room: a sealed chamber behind a false wall, with a secret chest.
    #
    #    This is a REAL Act-1 mechanic that was simply missing. The shipped generator's branch
    #    handler has a `hidden` case: it carves a 3x3 room entirely inside rock, opens the cell
    #    between, and sets tile 17 as the false wall. Tile 17 is passable
    #    (`WorldMapScene.ts`: "Hidden wall is passable"), so the room costs the player nothing
    #    to enter once found — the secret is noticing it, not opening it.
    #
    #    Act 1's five dungeons carry no `mechanic` field, so wind / ice / water / shadow and
    #    the colour-pillar puzzle all belong to Acts 2-5. This and the crystal save are the
    #    whole of Act 1's special vocabulary.
    live_now = open_set() if ACT >= HIDDEN_ROOMS_FROM_ACT else set()
    for base in sorted(live_now, key=lambda c: -int(dist[c[1], c[0]])):
        if any(a["kind"] == "hiddenDoor" for a in assets):
            break
        if base in used or base in on_route or base in vault:
            continue
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            wall = (base[0] + dx, base[1] + dy)             # the false wall
            gap = (base[0] + 2 * dx, base[1] + 2 * dy)      # the step behind it
            room = (base[0] + 4 * dx, base[1] + 4 * dy)     # the room's centre
            if not (2 <= room[0] < w - 2 and 2 <= room[1] < h - 2):
                continue
            block = [(room[0] + ex, room[1] + ey) for ex in (-2, -1, 0, 1, 2)
                     for ey in (-2, -1, 0, 1, 2)]
            # The room and a margin around it must be solid rock, or it is not a secret.
            if any(grid[c[1], c[0]] != ROCK for c in block + [wall, gap]
                   if 0 <= c[0] < w and 0 <= c[1] < h):
                continue
            if any(c in vault for c in block):
                continue
            for ex in (-1, 0, 1):
                for ey in (-1, 0, 1):
                    grid[room[1] + ey, room[0] + ex] = FLOOR
            grid[gap[1], gap[0]] = FLOOR
            grid[wall[1], wall[0]] = FLOOR                   # passable false wall
            put("hiddenDoor", wall)
            put("chest", room, secret=True)
            blockers.add(room)
            break

    # The alcove and the secret room both cut new floor, so the distance field, the route and
    # the dead-end set are all stale now. Recompute before anything is placed against them —
    # choosing chests from a stale field put one in the middle of a passage.
    dist = distance_field(grid, entry)
    ecc = int(dist.max())
    route = route_to(dist, payoff) if payoff else []
    on_route = set(route)
    payoff_dist = int(dist[payoff[1], payoff[0]]) if payoff else ecc

    # A local maximum of the distance field: no neighbour leads further from the way in, which
    # is what "dead end" means without needing the pattern to hand over a list of them.
    peaks: list[tuple[int, tuple[int, int]]] = []
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            d = int(dist[y, x])
            if d < 0 or grid[y, x] != FLOOR:
                continue
            if any(int(dist[y + dy, x + dx]) > d
                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                continue
            peaks.append((d, (x, y)))
    peaks.sort(reverse=True)

    walkable_now = int((grid == FLOOR).sum())
    n_chests = int(np.clip(round(walkable_now / 130), 1, 5))
    # Separation scales with the floor. A flat 5 cells is fine on a 26x26 floor and far too
    # close on Crystal Cave's 62x61, where it let chests bunch into one corner.
    gap = max(6, int(math.sqrt(walkable_now / max(1, n_chests)) * 0.9))
    # A chest must sit at a TRUE terminal — exactly one way in and out.
    #
    #    Owner, 2026-07-31: "you placed a treasure box right in the middle of a path, which is
    #    likely going to be problematic even if the player could walk around it". Right, and the
    #    flaw was in my definition: a LOCAL MAXIMUM of the distance field is not a dead end. On a
    #    looping floor the far point of a loop is a local maximum with two open neighbours — a
    #    corridor cell. `may_block()` passed it because the loop provides a way round, so nothing
    #    was sealed, but the chest still stood in a passage. Openness <= 1 is the honest test.
    # REQUIRE THE SITE TO BE ABLE TO TAKE AN ALCOVE, rather than carving whatever was picked.
    #
    # Carving after selection changed 2 chests out of 57 — almost no terminal chosen for depth and
    # spacing happens to satisfy the carve preconditions. Selecting for it instead costs nothing:
    # every cell here already passes the terminal, route and blocking rules, so this only decides
    # WHICH of the qualifying terminals is used.
    pool = [c for _, c in peaks
            if c not in on_route and c not in used and c not in vault
            and int(dist[c[1], c[0]]) >= 0.3 * ecc and openness(grid, c) <= 1 and may_block(c)
            and carve_alcove(grid, c, vault, dist, on_route, dry=True)]
    if len(pool) < n_chests:
        # Not enough alcove-capable terminals on this floor; fall back to the plain ones so the
        # floor still gets its rewards, and let the tight fit be reported honestly.
        pool += [c for _, c in peaks
                 if c not in on_route and c not in used and c not in vault
                 and int(dist[c[1], c[0]]) >= 0.3 * ecc and openness(grid, c) <= 1
                 and may_block(c) and c not in pool]
    # Owner, 2026-08-01: chests "are placed on top of walls and need a bit more clearance from
    # the walls". Carving clearance AFTER placement is impossible here — a chest is impassable, so
    # any pocket cut beside it is reachable only through it, and `validate()` rightly returned 116
    # errors for sealed cells and broken terminals. But CHOOSING a roomier terminal costs nothing:
    # every candidate below already satisfies openness <= 1, so preferring the ones with more
    # floor around them keeps the gameplay rule exactly and only spends the leftover freedom.
    chosen = spread_along(pool, dist, n_chests, gap, used,
                          prefer=lambda c: footprint_clear(grid, c, 1.0))

    # Not every floor offers enough true terminals, so cut nooks for the rest — the same
    # treatment the save crystal gets, and for the same reason.
    if len(chosen) < n_chests:
        taken = set(chosen)
        for _, base in peaks:
            if len(chosen) < n_chests is False or len(chosen) >= n_chests:
                break
            if base in used or base in taken or base in vault or base in on_route:
                continue
            if int(dist[base[1], base[0]]) < 0.3 * ecc:
                continue
            if not all(abs(base[0] - c[0]) + abs(base[1] - c[1]) >= gap for c in chosen):
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                tip = (base[0] + dx, base[1] + dy)
                if not (1 <= tip[0] < w - 1 and 1 <= tip[1] < h - 1):
                    continue
                if grid[tip[1], tip[0]] != ROCK or tip in vault:
                    continue
                onward = [(tip[0] + ox, tip[1] + oy)
                          for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
                if any(0 <= c[0] < w and 0 <= c[1] < h and grid[c[1], c[0]] == FLOOR
                       for c in onward if c != base):
                    continue                       # would open into another passage
                grid[tip[1], tip[0]] = FLOOR
                chosen.append(tip)
                taken.add(tip)
                break

    for cell in chosen:
        # Owner rule (2026-08-02): all nine squares around a chest must be walkable. Carving is
        # the ONLY way to deliver it — a chest site is chosen for depth and isolation, and such a
        # cell has 2-3 floor cells in its whole 8-ring. Painting the clearance in the renderer was
        # tried three ways and is a lie the collision grid does not honour.
        carve_alcove(grid, cell, vault, dist, on_route)
        dist = distance_field(grid, entry)
        put("chest", cell)
        blockers.add(cell)
    if not any(a["kind"] == "chest" for a in assets):
        for _, cell in peaks:
            if cell not in used and cell not in vault and spaced(cell, used, 4) \
                    and may_block(cell):
                put("chest", cell)
                blockers.add(cell)
                break

    # ── Torches, for a fog dungeon. ────────────────────────────────────────────────────────
    #
    #    Tile 24 is a passable pickup: stepping on it adds +2 to the fog radius
    #    (`WorldMapScene.handleTorchPickup`). Floor 1 starts at radius 0 and only opens to 3
    #    once the FIRST torch is taken, so floor 1 must have one within a few steps of the way
    #    in — otherwise the player arrives blind with no way to learn why.
    if spec.get("fog"):
        near_entry = [c for c in reach_now()
                      if c not in used and 2 <= int(dist[c[1], c[0]]) <= 7]
        if floor == 1 and near_entry:
            first = min(near_entry, key=lambda c: int(dist[c[1], c[0]]))
            put("torch", first)
        rest = [c for c in reach_now()
                if c not in used and int(dist[c[1], c[0]]) > 8 and openness(grid, c) >= 2]
        want = 3 - sum(1 for a in assets if a["kind"] == "torch")
        for cell in spread_along(rest, dist, want, max(8, gap), used, lo=0.15):
            put("torch", cell)

    # ── Plaque: ON THE WALL, not on the floor.
    #
    #    Owner: "it needs to be a plaque and on the wall". The shipped generator already does
    #    exactly this — its forest-maze branch writes tile 18 over a WALL cell — and tile 18 is
    #    impassable, which is why a plaque standing in a one-wide entry corridor bricked up
    #    three dungeons at the door. It keeps its rock cell in `rows`, because a wall plaque IS
    #    wall; only the asset list carries it.
    if floor == 1:
        live = open_set()
        best = None
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                if grid[y, x] != ROCK:
                    continue
                touching = [nb for nb in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
                            if grid[nb[1], nb[0]] == FLOOR and nb in live]
                if not touching:
                    continue
                d = min(int(dist[nb[1], nb[0]]) for nb in touching)
                if not (1 <= d <= 8) or not spaced((x, y), used, 2):
                    continue
                if best is None or d < best[0]:
                    best = (d, (x, y))
        if best:
            used[best[1]] = "sign"
            assets.append({"kind": "sign", "x": best[1][0], "y": best[1][1], "onWall": True})


    # The ordered objective list, and how far the dust may have to reach.
    objectives = []
    if payoff:
        objectives.append({"order": 1,
                           "kind": "boss" if is_final else "stairsDown",
                           "x": payoff[0], "y": payoff[1]})
    max_to_objective = 0
    if payoff:
        to_goal = distance_field(grid, payoff)
        reach_all = [int(to_goal[y, x]) for y in range(h) for x in range(w)
                     if grid[y, x] == FLOOR and to_goal[y, x] >= 0]
        max_to_objective = max(reach_all) if reach_all else 0

    rows = ["".join(GLYPH["floor"] if grid[y, x] == FLOOR else GLYPH["rock"]
                    for x in range(w)) for y in range(h)]
    for a in assets:
        # A wall-mounted plaque keeps its ROCK cell — stamping its glyph here would turn the
        # wall it hangs on into floor, which is exactly how it came to read as walkable.
        if a.get("onWall"):
            continue
        row = rows[a["y"]]
        rows[a["y"]] = row[:a["x"]] + GLYPH[a["kind"]] + row[a["x"] + 1:]

    walkable = int((grid == FLOOR).sum())
    return {
        "id": f"{spec['id']}-f{floor}",
        "dungeonId": spec["id"],
        "kind": "dungeon",
        "floor": floor,
        "totalFloors": spec["floors"],
        "pattern": pattern,
        "theme": spec["theme"],
        "joints": list(spec["joints"]),
        "width": w,
        "height": h,
        "walkableCells": walkable,
        "walkableFraction": round(walkable / (w * h), 3),
        "deadEnds": len(skel["deadEnds"]),
        # ── What the guiding dust follows. ────────────────────────────────────────────────
        #
        #    Owner, 2026-07-31: the trail should "lead to the next floor and or required items
        #    to progress in sequence". So the floor states its objectives in ORDER, and the
        #    runtime draws to the first one not yet met rather than always to the stairs.
        #
        #    Act 1's sequence is one step deep — the way on is the only requirement, since keys
        #    and locked doors are removed. The list is ordered and typed so later acts can put a
        #    key or a quest item ahead of the stairs without the runtime changing.
        #
        #    `maxStepsToObjective` is the worst case from anywhere on the floor, which is what
        #    the item's duration has to cover for the dust to actually rescue a lost player.
        "objectives": objectives,
        "maxStepsToObjective": max_to_objective,
        "placement": {
            "eccentricity": ecc,
            "payoffDistance": payoff_dist,
            "payoffArena": arena(grid, payoff) if payoff else 0,
            "routeLength": len(route),
            "distancePeaks": len(peaks),
        },
        "rows": rows,
        "assets": assets,
    }



def crop_to_content(fl: dict, margin: int = 2) -> dict:
    """Trim the authored canvas down to the cave plus a rock margin.

    A cave does not fill a rectangle, so a floor naturally occupies a band across its canvas
    and leaves the corners solid. Shipping the untrimmed canvas would repeat the shipped
    generator's own waste — 96% of its 100x100 is rock the player never sees, and every one of
    those cells still costs art surface. The authored size stays the BUDGET; this is what the
    floor actually turned out to be.
    """
    rows = fl["rows"]
    h, w = len(rows), len(rows[0])
    solid = GLYPH["rock"]
    xs = [x for y in range(h) for x in range(w) if rows[y][x] != solid]
    ys = [y for y in range(h) for x in range(w) if rows[y][x] != solid]
    if not xs:
        return fl
    x0 = max(0, min(xs) - margin)
    x1 = min(w - 1, max(xs) + margin)
    y0 = max(0, min(ys) - margin)
    y1 = min(h - 1, max(ys) + margin)

    fl["authoredWidth"], fl["authoredHeight"] = fl["width"], fl["height"]
    fl["rows"] = [row[x0:x1 + 1] for row in rows[y0:y1 + 1]]
    fl["width"], fl["height"] = x1 - x0 + 1, y1 - y0 + 1
    for a in fl["assets"]:
        a["x"] -= x0
        a["y"] -= y0
    for o in fl.get("objectives", []):     # objectives carry coordinates too
        o["x"] -= x0
        o["y"] -= y0
    fl["walkableFraction"] = round(fl["walkableCells"] / (fl["width"] * fl["height"]), 3)
    return fl


# ─────────────────────────────────────────────────────────────────────────────
#  Validation — every failure here is something a player would hit
# ─────────────────────────────────────────────────────────────────────────────

def validate(fl: dict) -> list[str]:
    errs: list[str] = []
    rows = fl["rows"]
    h, w = len(rows), len(rows[0])
    walk = {(x, y) for y in range(h) for x in range(w) if rows[y][x] != GLYPH["rock"]}

    kinds: dict[str, list[tuple[int, int]]] = {}
    for a in fl["assets"]:
        cell = (a["x"], a["y"])
        kinds.setdefault(a["kind"], []).append(cell)
        # The plaque is mounted ON the wall, so for it rock is correct and floor is the defect.
        if a["kind"] == "sign":
            if cell in walk:
                errs.append(f"plaque at {cell[0]},{cell[1]} stands on the floor — tile 18 is "
                            f"impassable, so it would block the passage it stands in")
            elif not any(nb in walk for nb in ((cell[0] + 1, cell[1]), (cell[0] - 1, cell[1]),
                                               (cell[0], cell[1] + 1), (cell[0], cell[1] - 1))):
                errs.append(f"plaque at {cell[0]},{cell[1]} has no floor beside it to read from")
        elif cell not in walk:
            errs.append(f"{a['kind']} at {a['x']},{a['y']} is in rock")

    secret = {(a["x"], a["y"]) for a in fl["assets"] if a.get("secret")}
    entry = (kinds.get("mouth") or kinds.get("stairsUp") or [None])[0]
    if entry is None:
        return errs + ["no way in"]

    def flood(blocked: set[tuple[int, int]]) -> set[tuple[int, int]]:
        seen = {entry}
        q = deque([entry])
        while q:
            x, y = q.popleft()
            for nb in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if nb in walk and nb not in seen and nb not in blocked:
                    seen.add(nb)
                    q.append(nb)
        return seen

    open_all = flood(set())
    if len(open_all) != len(walk):
        errs.append(f"{len(walk) - len(open_all)} floor cells unreachable")
    for kind in ("boss", "stairsDown", "chest", "save"):
        for cell in kinds.get(kind, []):
            if cell not in open_all:
                errs.append(f"{kind} at {cell[0]},{cell[1]} unreachable")

    # Locks are not generated, but if one is ever reintroduced it must gate the way on and
    # must not seal its own key.
    for door in kinds.get("lockedDoor", []):
        shut = flood({door})
        for key in kinds.get("keyChest", []):
            if key not in shut:
                errs.append("locked door seals its own key — soft-lock")
        for kind in ("boss", "stairsDown"):
            for cell in kinds.get(kind, []):
                if cell in shut:
                    errs.append(f"locked door does not gate {kind} — it is decor")

    objs = fl.get("objectives", [])
    if not objs:
        errs.append("floor states no objective — the guiding dust would have nothing to lead to")
    for o in objs:
        if (o["x"], o["y"]) not in walk:
            errs.append(f"objective {o['kind']} is not on walkable ground")
    if [o["order"] for o in objs] != sorted(o["order"] for o in objs):
        errs.append("objectives are not in sequence order")

    if fl["floor"] < fl["totalFloors"] and not kinds.get("stairsDown"):
        errs.append("no stairs down on a non-final floor")
    if fl["floor"] == fl["totalFloors"] and not kinds.get("boss"):
        errs.append("no boss on the final floor")
    if not kinds.get("chest"):
        errs.append("no chest on the floor")
    else:
        # Reward density, not just presence. This is the check that would have caught the
        # inherited `1 + floor // 2` chest count straight away.
        # The band is authored in ORIGINAL cell units and is an AREA density, so it scales with
        # SCALE**2. This is not a loosened check: the floor covers the same number of world
        # pixels as before (32 cells x 48 world px == 96 cells x 16 world px), so the physical
        # reward density the band was chosen to express is unchanged. Leaving it unscaled would
        # have measured the grid resolution instead of the pacing.
        lo, hi = 80 * SCALE ** 2, 230 * SCALE ** 2
        per = fl["walkableCells"] / len(kinds["chest"])
        if not (lo <= per <= hi):
            errs.append(f"one chest per {per:.0f} floor cells — outside the {lo:.0f}-{hi:.0f} "
                        f"band, so this floor is {'littered' if per < lo else 'unrewarding'} "
                        f"relative to the rest of the act")

    # ── Placement rules. Each one is a claim about the player's journey, re-derived here from
    #    the finished grid rather than trusted from the placer.
    dist = {}
    q = deque([(entry, 0)])
    dist[entry] = 0
    while q:
        cell, d = q.popleft()
        for nb in ((cell[0] + 1, cell[1]), (cell[0] - 1, cell[1]),
                   (cell[0], cell[1] + 1), (cell[0], cell[1] - 1)):
            if nb in walk and nb not in dist:
                dist[nb] = d + 1
                q.append((nb, d + 1))
    # Eccentricity is measured over the MAIN area — a secret room lies behind a false wall and
    # is a bonus, not a rival to the floor's objective, so counting it would penalise a boss for
    # sitting nearer than an optional room the player may never find.
    doors = set(kinds.get("hiddenDoor", []))
    main = dict(dist)
    if doors:
        seen = {entry}
        q = deque([entry])
        while q:
            c = q.popleft()
            for nb in ((c[0] + 1, c[1]), (c[0] - 1, c[1]), (c[0], c[1] + 1), (c[0], c[1] - 1)):
                if nb in walk and nb not in seen and nb not in doors:
                    seen.add(nb)
                    q.append(nb)
        main = {c: v for c, v in dist.items() if c in seen}
    ecc = max(main.values()) if main else 0

    payoff = (kinds.get("boss") or kinds.get("stairsDown") or [None])[0]
    if payoff and ecc:
        if dist.get(payoff, 0) < 0.7 * ecc:
            errs.append(f"payoff is only {dist.get(payoff, 0)}/{ecc} from the way in "
                        f"— the floor has a longer branch than its own objective")
        near = sum(1 for c in walk
                   if abs(c[0] - payoff[0]) <= 3 and abs(c[1] - payoff[1]) <= 3)
        if near < 10:
            errs.append(f"payoff has only {near} floor cells around it — no room to fight")

    route = set()
    if payoff and payoff in dist:
        cur = payoff
        route.add(cur)
        while dist.get(cur, 0) > 0:
            nxt = min((nb for nb in ((cur[0] + 1, cur[1]), (cur[0] - 1, cur[1]),
                                     (cur[0], cur[1] + 1), (cur[0], cur[1] - 1))
                       if nb in dist), key=lambda c: dist[c], default=None)
            if nxt is None or dist[nxt] >= dist[cur]:
                break
            cur = nxt
            route.add(cur)

    # Chests must be spread, not just present. Taking the highest-distance dead ends put every
    # chest at the far end of the bigger Crystal Cave floors, where they read as one pile.
    chest_cells = kinds.get("chest", [])
    if len(chest_cells) > 1:
        closest = min(abs(a[0] - b[0]) + abs(a[1] - b[1])
                      for i, a in enumerate(chest_cells) for b in chest_cells[i + 1:])
        want = max(6, int((fl["walkableCells"] / len(chest_cells)) ** 0.5 * 0.7))
        if closest < want:
            errs.append(f"closest two chests are {closest} cells apart on a floor this size "
                        f"(wanted {want}+) — they read as a clump, not as spread rewards")

    for cell in kinds.get("chest", []):
        if cell in secret:
            continue          # a secret chest is in a sealed room, not at a dead end
        # OWNER RULE, 2026-08-02: every one of the nine squares a chest touches must be
        # walkable. This REPLACES the old "exactly one way out" / "dead end" pair — those forced
        # the chest hard against rock on three sides, which is the defect this rule exists to end.
        # What still holds is that it must not sit ON the main route (checked below) and must not
        # seal anything (checked globally against the impassable set).
        ring = [(cell[0] + dx, cell[1] + dy) for dy in (-1, 0, 1) for dx in (-1, 0, 1)]
        blocked = [c for c in ring if c not in walk]
        if blocked:
            errs.append(f"chest at {cell[0]},{cell[1]} has {len(blocked)} of its nine squares "
                        f"non-walkable {blocked[:3]} — it will be drawn touching rock")
        if cell in route:
            errs.append(f"chest at {cell[0]},{cell[1]} sits on the main route, "
                        f"so it is not a reward for exploring")

    for cell in kinds.get("save", []):
        # The crystal is impassable, so it must sit BESIDE the route in its own pocket, not on
        # it. "Adjacent to the route" is the correct requirement; "on the route" was the rule
        # that put a wall across the only approach to three bosses.
        # The crystal stands at the end of its own carved alcove, so it is near the route
        # rather than on it. Anything further than a short pocket means the player could walk
        # past without ever seeing it.
        near = min((abs(cell[0] - r[0]) + abs(cell[1] - r[1]) for r in route), default=99)
        if cell in route:
            errs.append("save crystal stands ON the route — it is impassable, so it blocks it")
        elif near > 3:
            errs.append(f"save crystal is {near} cells off the route — the player would walk "
                        f"past without seeing it")
        elif payoff:
            # Measure from the ROUTE CELL the pocket opens off, not from the pocket itself: an
            # alcove can lie deeper than the boss without the player ever going further.
            anchor = min(route, key=lambda r: (abs(cell[0] - r[0]) + abs(cell[1] - r[1]),
                                               dist.get(r, 1 << 30)), default=cell)
            gap = dist.get(payoff, 0) - dist.get(anchor, 0)
            if gap <= 0:
                errs.append("save point is past the boss rather than before it")
            elif gap > 12:
                errs.append(f"save point is {gap} steps back from the boss "
                            f"— it should sit at the chamber mouth")

    # ── Nothing impassable may seal any part of the floor off. ───────────────────────────
    #    `WorldMapScene.ts:1194`: in dungeons chest (4), boss (7), plaque (18) and crystal save
    #    (14) are IMPASSABLE. Placement once had no model of that and soft-locked 6 of 18
    #    floors — three sealed at the front door by the plaque, three sealing the boss with the
    #    save crystal. This is the check that makes that class of defect impossible to ship.
    solid_kinds = {"boss", "chest", "save", "keyChest"}     # the plaque holds a rock cell already
    solid = {c for k in solid_kinds for c in kinds.get(k, [])}
    if solid:
        free = walk - solid
        seen = {entry} if entry in free else set()
        q = deque(list(seen))
        while q:
            c = q.popleft()
            for nb in ((c[0] + 1, c[1]), (c[0] - 1, c[1]), (c[0], c[1] + 1), (c[0], c[1] - 1)):
                if nb in free and nb not in seen:
                    seen.add(nb)
                    q.append(nb)
        sealed = len(free) - len(seen)
        if sealed > 0:
            errs.append(f"{sealed} floor cells are sealed off by impassable assets — the "
                        f"player cannot reach them")
        for kind in ("boss", "stairsDown", "chest", "save"):
            for cell in kinds.get(kind, []):
                if cell in seen:
                    continue
                if not any(nb in seen for nb in ((cell[0] + 1, cell[1]), (cell[0] - 1, cell[1]),
                                                 (cell[0], cell[1] + 1), (cell[0], cell[1] - 1))):
                    errs.append(f"{kind} at {cell[0]},{cell[1]} cannot be reached or faced")

    placed = [(a["x"], a["y"], a["kind"]) for a in fl["assets"]]
    for i, (x1, y1, k1) in enumerate(placed):
        for x2, y2, k2 in placed[i + 1:]:
            gap = abs(x1 - x2) + abs(y1 - y2)
            # Two adjacencies are deliberate: the sign beside the way in, and the save crystal
            # at the boss chamber's mouth. Everything else at this range is a pile.
            pair = {k1, k2}
            # Floor 1 of a fog dungeon opens at radius 0 and only reaches 3 once the first
            # torch is taken, so that torch sitting beside the way in is required, not a pile.
            intentional = (pair <= {"mouth", "stairsUp", "sign", "torch"}
                           or pair == {"save", "boss"} or pair == {"save", "stairsDown"}
                           or (pair == {"hiddenDoor", "chest"}
                               and ((x1, y1) in secret or (x2, y2) in secret)))
            floor_ = 2 if intentional else 4
            if gap < floor_:
                errs.append(f"{k1} and {k2} are {gap} cells apart — they read as one pile")
    if not (0.12 <= fl["walkableFraction"] <= 0.34):
        errs.append(f"fill {fl['walkableFraction']:.0%} outside the 12-34% dungeon band")
    return errs


# ─────────────────────────────────────────────────────────────────────────────
#  Review render
# ─────────────────────────────────────────────────────────────────────────────

PAL = {"rock": (22, 20, 24), "edge": (64, 58, 68), "floor": (152, 140, 120),
       "floor2": (126, 115, 98), "bg": (15, 16, 19), "text": (228, 228, 228),
       "dim": (142, 148, 156), "pattern": (214, 170, 96)}
ASSET_RGB = {"mouth": (236, 200, 96), "stairsUp": (154, 204, 244), "stairsDown": (86, 148, 234),
             "boss": (216, 64, 64), "chest": (234, 170, 58), "keyChest": (244, 228, 112),
             "lockedDoor": (200, 90, 202), "door": (152, 120, 88), "save": (94, 216, 150),
             "sign": (170, 178, 188), "hiddenDoor": (190, 140, 230), "torch": (255, 168, 62)}
ASSET_LABEL = {"mouth": "M overworld mouth", "stairsUp": "U stairs up",
               "stairsDown": "D stairs down", "boss": "B boss", "chest": "C chest",
               "door": "d door", "save": "S save point", "sign": "i sign",
               "hiddenDoor": "h false wall",
               "torch": "T torch"}


def render_floor(fl: dict, cell: int) -> Image.Image:
    rows, solid = fl["rows"], GLYPH["rock"]
    h, w = len(rows), len(rows[0])
    img = Image.new("RGB", (w * cell, h * cell), PAL["rock"])
    d = ImageDraw.Draw(img)

    for y in range(h):
        for x in range(w):
            if rows[y][x] == solid:
                continue
            tone = PAL["floor"] if (x // 3 + y // 3) % 2 == 0 else PAL["floor2"]
            d.rectangle([x * cell, y * cell, x * cell + cell - 1, y * cell + cell - 1], fill=tone)
    for y in range(h):
        for x in range(w):
            if rows[y][x] != solid:
                continue
            if any(0 <= x + dx < w and 0 <= y + dy < h and rows[y + dy][x + dx] != solid
                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                d.rectangle([x * cell, y * cell, x * cell + cell - 1, y * cell + cell - 1],
                            fill=PAL["edge"])
    for a in fl["assets"]:
        x, y, pad = a["x"] * cell, a["y"] * cell, max(1, cell // 6)
        d.rectangle([x + pad, y + pad, x + cell - 1 - pad, y + cell - 1 - pad],
                    fill=ASSET_RGB[a["kind"]], outline=(10, 10, 12))
    return img


def render_dungeon(spec: dict, floors: list[dict], path: str) -> None:
    cell = 11
    pad, gap, header, foot = 18, 20, 58, 48
    tiles = [render_floor(f, cell) for f in floors]
    body_h = max(t.height for t in tiles)
    width = max(pad * 2 + sum(t.width for t in tiles) + gap * (len(tiles) - 1), 820)
    img = Image.new("RGB", (width, header + body_h + foot + 26), PAL["bg"])
    d = ImageDraw.Draw(img)

    d.text((pad, 11), f"{spec['name']}  ·  {spec['floors']} floors  ·  joints "
                      f"{'/'.join(str(j) + chr(176) for j in spec['joints'])}"
                      f"  ·  theme: {spec['theme']}", fill=PAL["text"])
    d.text((pad, 28), "Joint-controlled cave. Unpainted = solid rock. No locks or keys; the "
                      "payoff chamber is walled to a single mouth.", fill=PAL["dim"])

    x = pad
    label_y = header + body_h + 6
    for tile, fl in zip(tiles, floors):
        img.paste(tile, (x, header))
        d.text((x, label_y), f"F{fl['floor']}  {fl['width']}x{fl['height']}"
                             f"  (budget {fl.get('authoredWidth', fl['width'])}"
                             f"x{fl.get('authoredHeight', fl['height'])})  "
                             f"{fl['walkableCells']} floor ({fl['walkableFraction'] * 100:.0f}%)",
               fill=PAL["dim"])
        d.text((x, label_y + 14), fl["pattern"], fill=PAL["pattern"])
        d.text((x, label_y + 28), f"{fl['deadEnds']} dead ends", fill=PAL["dim"])
        x += tile.width + gap

    lx, ly = pad, label_y + 46
    for kind, label in ASSET_LABEL.items():
        if lx > width - 140:
            lx, ly = pad, ly + 14
        d.rectangle([lx, ly + 3, lx + 9, ly + 12], fill=ASSET_RGB[kind])
        d.text((lx + 14, ly + 2), label, fill=PAL["dim"])
        lx += 132
    img.save(path)


# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    index, total_errs = [], 0

    for spec in DUNGEONS:
        floors = []
        for f in range(1, spec["floors"] + 1):
            # crc32 of the FULL id, not its first letter — that collision is what makes
            # coastalReef and crystalCave identical in the shipped generator.
            fl = crop_to_content(
                generate_floor(spec, f, zlib.crc32(spec["id"].encode()) + f * 7919))
            errs = validate(fl)
            fl["validation"] = errs or ["ok"]
            total_errs += len(errs)
            floors.append(fl)
            with open(os.path.join(OUT, f"{spec['id']}-f{f}.json"), "w") as fh:
                json.dump(fl, fh, indent=1)

        render_dungeon(spec, floors, os.path.join(OUT, f"{spec['id']}-review.png"))
        cells = sum(f["width"] * f["height"] for f in floors)
        walk = sum(f["walkableCells"] for f in floors)
        bad = [f"F{f['floor']}: {'; '.join(f['validation'])}" for f in floors
               if f["validation"] != ["ok"]]
        pats = "/".join(sorted({f["pattern"] for f in floors}))
        index.append({"id": spec["id"], "floors": spec["floors"], "patterns": pats,
                      "cells": cells, "walkable": walk, "errors": bad})
        print(f"{spec['name']:22s} {spec['floors']}f {cells:6d} cells {walk:5d} floor "
              f"({100 * walk / cells:4.1f}%)  {pats:34s} {'OK' if not bad else 'FAIL'}")
        for b in bad:
            print(f"    {b}")

    with open(os.path.join(OUT, "index.json"), "w") as fh:
        json.dump({"_source": "scripts/build_dungeon_semantic.py", "dungeons": index}, fh, indent=1)
    print(f"\n{'ALL FLOORS VALID' if total_errs == 0 else f'{total_errs} VALIDATION ERRORS'}")


if __name__ == "__main__":
    main()
