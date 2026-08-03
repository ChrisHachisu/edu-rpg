#!/usr/bin/env python3
"""Build the seed-42 organic macro terrain pack for the 320x400 continent."""

from __future__ import annotations

import argparse
from collections import deque
import hashlib
import heapq
import json
import math
from pathlib import Path
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from act1_terrain_class_lib import CLASSES as ACT1_CLASSES, load_land as load_act1_land
from build_act1_terrain_class_macro_v4 import build_pack as build_act1_v4


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "design/review/overworld-art-blueprint/continent/continent-macro-g2-organic"
WIDTH, HEIGHT, SEED = 320, 400, 42
ACT1_BOUNDS = (16, 218, 163, 399)

CLASSES = (
    "water", "meadow", "trail", "lightForest", "forest", "cliff", "mountain",
    "structure", "landmarkSolid", "bridge", "snow", "tundra", "snowForest",
    "iceRiver", "sand", "aridFoothill", "duneRock", "oasisWater", "ash",
    "scorched", "obsidian", "lava", "charcoal", "deadGround", "deadForest",
    "darkRiver",
)
CODE = {name: index for index, name in enumerate(CLASSES)}
WALKABLE_NAMES = {
    "meadow", "trail", "lightForest", "bridge", "snow", "tundra", "sand",
    "aridFoothill", "ash", "scorched", "charcoal", "deadGround",
}
WALKABLE = {CODE[name] for name in WALKABLE_NAMES}
BLOCKER_NAMES = set(CLASSES) - WALKABLE_NAMES - {"water"}
BLOCKERS = {CODE[name] for name in BLOCKER_NAMES}
PALETTE = {
    "water": "#173653", "meadow": "#7fae5a", "trail": "#c8a26a",
    "lightForest": "#5f8043", "forest": "#24421f", "cliff": "#6b5d4f",
    "mountain": "#8a8f96", "structure": "#a89078", "landmarkSolid": "#4a4038",
    "bridge": "#b98a4e", "snow": "#dce9ec", "tundra": "#a8c4bd",
    "snowForest": "#355a55", "iceRiver": "#7bc6d8", "sand": "#d7b66f",
    "aridFoothill": "#b78b58", "duneRock": "#875f42", "oasisWater": "#2d8c91",
    "ash": "#837b72", "scorched": "#9a674c", "obsidian": "#342f3b",
    "lava": "#d9572b", "charcoal": "#55504e", "deadGround": "#71645a",
    "deadForest": "#302d2c", "darkRiver": "#352f4d",
}
RGB = {name: tuple(int(PALETTE[name][i:i + 2], 16) for i in (1, 3, 5)) for name in CLASSES}
BIOME_FAMILIES = {
    1: {"meadow", "lightForest", "forest"},
    2: {"snow", "tundra", "snowForest", "iceRiver"},
    3: {"sand", "aridFoothill", "duneRock", "oasisWater"},
    4: {"ash", "scorched", "obsidian", "lava"},
    5: {"charcoal", "deadGround", "deadForest", "darkRiver"},
}
ACT_NAMES = {1: "Act 1 · Verdant", 2: "Act 2 · Snow", 3: "Act 3 · Desert", 4: "Act 4 · Volcanic", 5: "Act 5 · Dark-barren"}

# Spec §4 coordinates. The corrected Scorched Ruins point is authoritative.
# OWNER-PLACED, 2026-07-29. Every coordinate below is the owner's own placement from
# the layout planner, saved verbatim at
# design/continent-terrain-class-method/layout-planner/owner-layout.json.
#
# This table is the INPUT the terrain is grown from, not a derived value. Three review
# rounds were spent re-shaping terrain around stale coordinates while the owner kept
# saying "the landmarks have not been moved" -- the clearings, approaches and blockers
# are all functions of these points, so changing anything else first is changing the
# output and hoping the input follows.
#
# A landmark lives in FOUR places: this table, landmark-roster.json, WorldMapScene.ts's
# ox/oy and maps.ts's entrance fromX/fromY. This table drives the generator; the other
# three must be moved in lockstep or the dungeon stands in unbroken terrain.
LANDMARKS = {
    # ACT 1 RE-CUT to the owner's placement (owner decision, 2026-07-29). Act 1's raster
    # is regenerated from build_act1_terrain_class_macro_v4 against these cells, and the
    # bridge decks that moved with them are mirrored in the game's runtime constants.
    "Greenhollow": (1, (69, 255), "town"), "Millbrook": (1, (39, 344), "town"),
    "Port Sapphire": (1, (133, 347), "town"), "Sunken Cellar": (1, (30, 274), "dungeon"),
    # Three act-1 doors are still projected onto genuine act-1 land, and the projection is
    # UNCHANGED by the re-cut: it comes from the runtime coastline in
    # src/map-engine/generated/act1RuntimeSnapshot.ts, which the re-cut does not touch --
    # only act 1's terrain classes were re-authored, never its land/water mask. Cells the
    # coast-roughening ADDS beyond that mask may never be act 1 (act1-immutability linter),
    # and the owner's cells for these three fall in that added coastal band. Each moved to
    # the NEAREST genuine act-1 cell: Whispering Woods 2, Crystal Cave 9, Coastal Reef 21.
    # Owner cells kept verbatim in layout-planner/owner-layout.json.
    "Whispering Woods": (1, (101, 233), "dungeon"), "Coastal Reef": (1, (142, 352), "dungeon"),
    "Darkfang": (1, (91, 378), "dungeon"), "Crystal Cave": (1, (140, 278), "dungeon"),
    "Ironkeep": (2, (209, 320), "town"), "Frostwatch": (2, (253, 339), "town"),
    "Ravenhollow": (2, (249, 246), "town"), "Iron Mine": (2, (172, 330), "dungeon"),
    "Storm Nest": (2, (199, 383), "dungeon"), "Haunted Forest": (2, (284, 293), "dungeon"),
    "Frozen Lake": (2, (275, 363), "dungeon"), "Shadow Cave": (2, (193, 236), "dungeon"),
    "Oasis Haven": (3, (262, 154), "town"), "Ruins Camp": (3, (196, 189), "town"),
    "Oasis Depths": (3, (287, 154), "dungeon"), "Desert Tomb": (3, (270, 112), "dungeon"),
    "Bandit Hideout": (3, (286, 201), "dungeon"), "Scorched Ruins": (3, (171, 133), "dungeon"),
    "Embers Rest": (4, (200, 98), "town"), "Ember Mines": (4, (284, 33), "dungeon"),
    "Magma Tunnels": (4, (183, 117), "dungeon"), "Obsidian Cavern": (4, (273, 117), "dungeon"),
    "Volcanic Forge": (4, (178, 33), "dungeon"), "Last Bastion": (5, (118, 36), "town"),
    "Haven's Edge": (5, (76, 86), "town"), "Demon Barracks": (5, (140, 134), "dungeon"),
    "Void Rift": (5, (79, 200), "dungeon"), "Demon Castle": (5, (85, 31), "dungeon"),
    "Stormreach Portal": (5, (23, 90), "portal"), "Frostfall Portal": (5, (140, 191), "portal"),
    "Sunken Temple Portal": (5, (25, 167), "portal"), "Twilight Portal": (5, (137, 89), "portal"),

    # The FAR mouth of each act connector. The owner placed all four connectors on BOTH
    # sides -- that is what "acts 2 to 5 are all missing the connector dungeon" was about.
    # These are separate entries so the far side gets its own clearing; a connector whose
    # only clearing is on the near side renders as a dead end on the act you arrive in.
    "Crystal Cave East": (2, (170, 283), "connector"),
    "Shadow Cave North": (3, (198, 213), "connector"),
    "Magma Tunnels South": (3, (192, 93), "connector"),
    "Volcanic Forge West": (5, (150, 37), "connector"),

    # New Act-4 town, owner-requested 2026-07-29 at the scribble they drew: "yes, real
    # playable town with new everything". Name is a placeholder pending the owner's call.
    "Cinderwatch": (4, (257, 42), "town"),
}

# All 41 raw overworld fromX/fromY probes in maps.ts. Scorched Ruins remains a
# compatibility probe only; the spec authority above controls its actual anchor.
CONNECTION_PROBES = (
    (60, 340), (100, 320), (130, 290), (45, 350), (80, 310), (140, 350), (120, 260),
    (148, 295), (172, 305), (200, 320), (222, 262), (252, 242), (185, 335), (280, 295),
    (238, 248), (242, 248), (200, 265), (260, 234), (260, 198), (220, 150), (270, 120),
    (195, 80), (225, 160), (250, 140), (298, 130), (278, 82), (202, 48), (242, 93),
    (242, 81), (185, 48), (172, 110), (148, 110), (100, 150), (70, 100), (80, 60),
    (120, 70), (85, 30), (40, 50), (130, 40), (50, 130), (120, 140),
)

# Mouths follow the owner's 2026-07-29 placement: each pair is the SAME connector as the
# player meets it from either side, so both entries exist in LANDMARKS above and both get
# a clearing. The centre is the midpoint of the pair -- it is where the range is sealed.
SEPARATORS = {
    "Crystal Range": {"acts": (1, 2), "mouths": ((140, 278), (170, 283)), "center": (155, 280), "biomes": "verdant → snow"},
    "Shadow Range": {"acts": (2, 3), "mouths": ((193, 236), (198, 213)), "center": (196, 225), "biomes": "snow → desert"},
    "Magma Ridge": {"acts": (3, 4), "mouths": ((192, 93), (183, 117)), "center": (188, 105), "biomes": "desert → volcanic"},
    "Volcanic Pass": {"acts": (4, 5), "mouths": ((178, 33), (150, 37)), "center": (164, 35), "biomes": "volcanic → dark-barren"},
}

# Corridor-first route tree. Each guide is authored in world coordinates and
# remains in its act basin; only the four named connector guides cross ranges.
ROUTE_GUIDES = {
    # Re-authored 2026-07-29 against the owner's placement. The Demon Castle route
    # stays: apply_demon_moat draws the moat FROM it, and the moat -- not the absence
    # of a road -- is what shuts the castle until the four portal relics are in hand.
    # Deleting the route deleted the moat and left the castle standing open.
    "a2-crystal-ironkeep": [(170, 283), (177, 296), (186, 306), (197, 314), (209, 320)],
    "a2-ironkeep-iron-mine": [(209, 320), (197, 323), (184, 327), (172, 330)],
    "a2-ironkeep-storm-nest": [(209, 320), (206, 341), (202, 362), (199, 383)],
    "a2-ironkeep-frostwatch": [(209, 320), (224, 326), (238, 333), (253, 339)],
    "a2-frostwatch-frozen-lake": [(253, 339), (264, 351), (275, 363)],
    "a2-frostwatch-ravenhollow": [(253, 339), (252, 308), (250, 277), (249, 246)],
    "a2-ravenhollow-haunted-forest": [(249, 246), (261, 262), (272, 277), (284, 293)],
    "a2-ravenhollow-shadow": [(249, 246), (230, 243), (212, 239), (193, 236)],
    "a3-shadow-oasis": [(198, 213), (219, 193), (241, 174), (262, 154)],
    "a3-oasis-depths": [(262, 154), (270, 154), (279, 154), (287, 154)],
    "a3-oasis-tomb": [(262, 154), (265, 140), (267, 126), (270, 112)],
    "a3-tomb-ruins-camp": [(270, 112), (245, 138), (221, 163), (196, 189)],
    "a3-ruins-bandits": [(196, 189), (226, 193), (256, 197), (286, 201)],
    "a3-oasis-scorched": [(262, 154), (232, 147), (201, 140), (171, 133)],
    "a3-ruins-magma": [(196, 189), (195, 157), (193, 125), (192, 93)],
    "a4-magma-embers": [(183, 117), (192, 108), (200, 98)],
    "a4-embers-cinderwatch": [(200, 98), (219, 79), (238, 61), (257, 42)],
    "a4-embers-ember-mines": [(257, 42), (266, 39), (275, 36), (284, 33)],
    # Approaches Obsidian Cavern from the EAST. Desert Tomb (270,112) is an act-3 door
    # five cells north-west of this act-4 one, so a road coming in from the west runs
    # between them and the two acts' territories cannot both stay in one piece: whichever
    # act won those cells stranded the other act's door on an island no seal-preserving
    # carve can reach. Act 3 now reaches Desert Tomb from the south and act 4 reaches
    # Obsidian down the east coast, so the two tongues run parallel instead of crossing.
    "a4-embers-obsidian": [(200, 98), (228, 92), (255, 87), (276, 94), (284, 104), (279, 112), (273, 117)],
    "a4-embers-volcanic": [(200, 98), (193, 76), (185, 55), (178, 33)],
    "a5-volcanic-last-bastion": [(150, 37), (139, 37), (129, 36), (118, 36)],
    "a5-last-bastion-twilight-portal": [(118, 36), (124, 54), (131, 71), (137, 89)],
    "a5-last-bastion-haven": [(118, 36), (104, 53), (90, 69), (76, 86)],
    "a5-haven-stormreach": [(76, 86), (58, 87), (41, 89), (23, 90)],
    "a5-haven-barracks": [(76, 86), (97, 102), (119, 118), (140, 134)],
    "a5-barracks-castle": [(140, 134), (122, 100), (103, 65), (85, 31)],
    "a5-barracks-frostfall": [(140, 134), (140, 153), (140, 172), (140, 191)],
    "a5-barracks-void": [(140, 134), (120, 156), (99, 178), (79, 200)],
    "a5-void-sunken-portal": [(79, 200), (61, 189), (43, 178), (25, 167)],
    "connector-crystal": [(140, 278), (147, 279), (155, 280), (163, 282), (170, 283)],
    "connector-shadow": [(193, 236), (196, 224), (198, 213)],
    "connector-magma": [(192, 93), (188, 105), (183, 117)],
    "connector-volcanic": [(178, 33), (169, 34), (159, 36), (150, 37)],
}

STORY_CHAIN = (
    (69, 255), (140, 278), (170, 283), (193, 236), (198, 213),
    (192, 93), (183, 117), (178, 33), (150, 37), (85, 31),
)

RANGE_CRESTS = {
    "Central Spine": [(162, 6), (169, 55), (150, 110), (171, 160), (156, 210), (173, 255), (149, 295), (166, 340), (160, 374)],
    "Shadow Range": [(168, 222), (205, 210), (242, 220), (260, 233), (288, 208), (314, 203)],
    "Magma Ridge": [(168, 122), (205, 101), (242, 94), (282, 104), (314, 116)],
}

RIVERS = {
    "act2-frozen-river": (2, [(181, 236), (205, 252), (234, 273), (270, 286), (309, 300)], "iceRiver"),
    # Re-authored 2026-07-25 (owner: acts 3/4 terrain "does not make sense").
    # The wadi ran x174->x308 as a near-straight east-west line right across the
    # act, and the lava ran x175->x309 the same way one band north. Both crossed
    # their act's north-south trails, and `drape_rivers` paints `mask & ~protected`
    # -- so each crossing punched a rectangular hole and the art map showed a
    # severed bar plus speckles instead of one watercourse. Both now descend from
    # a real source to the sea WITHOUT crossing a trail, so the paint is continuous.
    # The wadi now runs the y169-175 band, which is the ONE east-west corridor in
    # Act 3 that the trail staircase (x210,y130 -> x254,y185) crosses at a single
    # column (x242, y171-173) instead of shadowing for 15 columns.
    # Also deliberately NOT collinear -- the first pass at this band put all five
    # controls within 6 rows of each other and the wadi came out as a horizontal
    # blue stripe. It meanders now, while still meeting the trail near-square at
    # its single crossing rather than running alongside it.
    "act3-oasis-wadi": (3, [(181, 168), (205, 177), (233, 170), (268, 178), (309, 173)], "oasisWater"),
    # Deliberately NOT collinear: the first attempt at this route put all five
    # controls on one line and the flow read as a drawn tapering bar. A flow bends
    # around what it cannot climb, so the middle control sits back down-slope.
    "act4-lava-channel": (4, [(214, 58), (237, 48), (256, 53), (281, 41), (306, 39)], "lava"),
    "act5-dark-river": (5, [(148, 166), (123, 170), (94, 176), (60, 174), (22, 166)], "darkRiver"),
}

DETERMINISTIC_FILES = (
    "act-membership.npy", "biome-distribution.json", "class-palette.md",
    "collision-grid.npy", "continent-act-labeled-4x.png", "continent-barrier-only-4x.png",
    "continent-native-16x.png", "continent-phone-208x260.png", "continent-terrain-logic-4x.png",
    "corridor-skeleton.npy", "elevation-field.npy", "generator-report.json", "land-mask.npy",
    "land-mask.png", "linter-report.json", "river-systems.npz", "separator-closeups-4x.png",
    "separator-throats.npz", "organic-boundaries.npz", "separator-crests.npz",
    "terrain-classes-indexed.png", "terrain-classes.json", "terrain-classes.npy",
)


def fail(message: str) -> None:
    raise RuntimeError(f"CONTINENT CHECK FAILED: {message}")


def neighbors(x: int, y: int) -> tuple[tuple[int, int], ...]:
    return ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))


def value_noise(shape: tuple[int, int], spacing: int, rng: np.random.Generator) -> np.ndarray:
    h, w = shape
    gy, gx = math.ceil((h - 1) / spacing) + 2, math.ceil((w - 1) / spacing) + 2
    knots = rng.uniform(-1.0, 1.0, size=(gy, gx))
    yy, xx = np.indices(shape)
    ix, iy = xx // spacing, yy // spacing
    fx, fy = (xx % spacing) / spacing, (yy % spacing) / spacing
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    top = knots[iy, ix] * (1 - fx) + knots[iy, ix + 1] * fx
    bottom = knots[iy + 1, ix] * (1 - fx) + knots[iy + 1, ix + 1] * fx
    return top * (1 - fy) + bottom * fy


def fbm(shape: tuple[int, int], rng: np.random.Generator) -> np.ndarray:
    return (0.54 * value_noise(shape, 31, rng) + 0.28 * value_noise(shape, 13, rng)
            + 0.12 * value_noise(shape, 6, rng) + 0.06 * value_noise(shape, 3, rng))


def simplex_noise(shape: tuple[int, int], scale: float, seed: int) -> np.ndarray:
    """Vectorized 2-D simplex noise with a local deterministic permutation."""
    rng = np.random.default_rng(seed)
    perm = np.arange(256, dtype=np.int16)
    rng.shuffle(perm)
    perm = np.concatenate((perm, perm))
    gradients = np.array(((1, 1), (-1, 1), (1, -1), (-1, -1),
                          (1, 0), (-1, 0), (1, 0), (-1, 0),
                          (0, 1), (0, -1), (0, 1), (0, -1)), dtype=float)
    yy, xx = np.indices(shape, dtype=float)
    x, y = xx / scale, yy / scale
    f2 = (math.sqrt(3.0) - 1.0) / 2.0
    g2 = (3.0 - math.sqrt(3.0)) / 6.0
    skew = (x + y) * f2
    i, j = np.floor(x + skew).astype(int), np.floor(y + skew).astype(int)
    unskew = (i + j) * g2
    x0, y0 = x - (i - unskew), y - (j - unskew)
    i1 = (x0 > y0).astype(int)
    j1 = 1 - i1
    x1, y1 = x0 - i1 + g2, y0 - j1 + g2
    x2, y2 = x0 - 1.0 + 2.0 * g2, y0 - 1.0 + 2.0 * g2
    ii, jj = i & 255, j & 255

    def contribution(dx: np.ndarray, dy: np.ndarray, oi: np.ndarray | int, oj: np.ndarray | int) -> np.ndarray:
        index = perm[ii + oi + perm[jj + oj]] % 12
        attenuation = np.maximum(0.0, 0.5 - dx * dx - dy * dy)
        return attenuation ** 4 * (gradients[index, 0] * dx + gradients[index, 1] * dy)

    return 70.0 * (contribution(x0, y0, 0, 0)
                   + contribution(x1, y1, i1, j1)
                   + contribution(x2, y2, 1, 1))


def simplex_fbm(shape: tuple[int, int], seed: int) -> np.ndarray:
    return (0.55 * simplex_noise(shape, 43.0, seed)
            + 0.28 * simplex_noise(shape, 19.0, seed + 101)
            + 0.12 * simplex_noise(shape, 8.0, seed + 211)
            + 0.05 * simplex_noise(shape, 3.5, seed + 307))


def distance_to_polyline(points: list[tuple[float, float]]) -> np.ndarray:
    yy, xx = np.indices((HEIGHT, WIDTH), dtype=float)
    result = np.full((HEIGHT, WIDTH), np.inf)
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        dx, dy = x2 - x1, y2 - y1
        length2 = dx * dx + dy * dy
        t = np.clip(((xx - x1) * dx + (yy - y1) * dy) / max(length2, 1e-9), 0, 1)
        result = np.minimum(result, np.hypot(xx - (x1 + t * dx), yy - (y1 + t * dy)))
    return result


def distance_and_progress(points: list[tuple[float, float]]) -> tuple[np.ndarray, np.ndarray]:
    yy, xx = np.indices((HEIGHT, WIDTH), dtype=float)
    distance = np.full((HEIGHT, WIDTH), np.inf)
    progress = np.zeros((HEIGHT, WIDTH), dtype=float)
    lengths = [math.hypot(x2 - x1, y2 - y1) for (x1, y1), (x2, y2) in zip(points, points[1:])]
    total = max(sum(lengths), 1e-9)
    walked = 0.0
    for ((x1, y1), (x2, y2)), length in zip(zip(points, points[1:]), lengths):
        dx, dy = x2 - x1, y2 - y1
        t = np.clip(((xx - x1) * dx + (yy - y1) * dy) / max(length * length, 1e-9), 0, 1)
        local = np.hypot(xx - (x1 + t * dx), yy - (y1 + t * dy))
        better = local < distance
        distance[better] = local[better]
        progress[better] = (walked + t[better] * length) / total
        walked += length
    return distance, progress


def organic_crest(points: list[tuple[int, int]], rng: np.random.Generator) -> list[tuple[float, float]]:
    """Densify controls into a meandering crest with no long axial segment."""
    result: list[tuple[float, float]] = []
    phase = rng.uniform(0.0, math.tau)
    sample_index = 0
    for segment, ((x1, y1), (x2, y2)) in enumerate(zip(points, points[1:])):
        dx, dy = x2 - x1, y2 - y1
        length = max(math.hypot(dx, dy), 1.0)
        nx, ny = -dy / length, dx / length
        steps = max(2, math.ceil(length / 2.5))
        for step in range(steps + 1):
            if segment and step == 0:
                continue
            t = step / steps
            if step in {0, steps}:
                offset = 0.0
            else:
                offset = (2.1 * (-1.0 if sample_index % 2 else 1.0)
                          + 0.65 * math.sin(sample_index * 1.37 + phase)
                          + rng.uniform(-0.35, 0.35))
            result.append((x1 + dx * t + nx * offset, y1 + dy * t + ny * offset))
            sample_index += 1
    return result


def ordered_polyline_cells(points: list[tuple[float, float]]) -> list[tuple[int, int]]:
    """Rasterize an ordered 8-neighbor crest for honest turn/run metrics."""
    cells: list[tuple[int, int]] = []
    for (fx1, fy1), (fx2, fy2) in zip(points, points[1:]):
        x1, y1, x2, y2 = round(fx1), round(fy1), round(fx2), round(fy2)
        dx, dy = abs(x2 - x1), abs(y2 - y1)
        sx, sy = (1 if x1 < x2 else -1), (1 if y1 < y2 else -1)
        error = dx - dy
        while True:
            if not cells or cells[-1] != (x1, y1):
                cells.append((x1, y1))
            if (x1, y1) == (x2, y2):
                break
            twice = 2 * error
            if twice > -dy:
                error -= dy
                x1 += sx
            if twice < dx:
                error += dx
                y1 += sy
    return cells


def break_axial_crest_runs(cells: list[tuple[int, int]], limit: int = 5) -> list[tuple[int, int]]:
    """Insert small alternating teeth into the real raster crest after `limit` cells."""
    if not cells:
        return cells
    result = [cells[0]]
    previous: tuple[int, int] | None = None
    run = 0
    side = 1
    for cell in cells[1:]:
        current = result[-1]
        direction = (int(np.sign(cell[0] - current[0])), int(np.sign(cell[1] - current[1])))
        axial = direction[0] == 0 or direction[1] == 0
        run = run + 1 if axial and direction == previous else (1 if axial else 0)
        if run > limit:
            perpendicular = (side, 0) if direction[0] == 0 else (0, side)
            tooth_a = (current[0] + perpendicular[0], current[1] + perpendicular[1])
            tooth_b = (cell[0] + perpendicular[0], cell[1] + perpendicular[1])
            if all(0 <= x < WIDTH and 0 <= y < HEIGHT for x, y in (tooth_a, tooth_b)):
                result.extend((tooth_a, tooth_b))
                side *= -1
            result.append(cell)
            previous, run = None, 0
        else:
            result.append(cell)
            previous = direction
    return result


def ordered_line_metrics(cells: list[tuple[int, int]]) -> dict[str, object]:
    directions = [(int(np.sign(bx - ax)), int(np.sign(by - ay)))
                  for (ax, ay), (bx, by) in zip(cells, cells[1:])]
    turns = sum(a != b for a, b in zip(directions, directions[1:]))
    maximum, run, previous = 0, 0, None
    for direction in directions:
        axial = direction[0] == 0 or direction[1] == 0
        run = run + 1 if axial and direction == previous else (1 if axial else 0)
        maximum = max(maximum, run)
        previous = direction
    return {
        "cells": len(cells), "turns": turns,
        "turnRatio": turns / max(1, len(directions) - 1),
        "maximumAxisAlignedRun": maximum,
    }


def distance_to_points(points: list[tuple[float, float]]) -> np.ndarray:
    yy, xx = np.indices((HEIGHT, WIDTH), dtype=float)
    return np.min([np.hypot(xx - x, yy - y) for x, y in points], axis=0)


def connected_components(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    seen = np.zeros(mask.shape, bool)
    result: list[list[tuple[int, int]]] = []
    for y, x in zip(*np.where(mask)):
        if seen[y, x]:
            continue
        component: list[tuple[int, int]] = []
        queue = deque([(int(x), int(y))])
        seen[y, x] = True
        while queue:
            px, py = queue.popleft()
            component.append((px, py))
            for nx, ny in neighbors(px, py):
                if 0 <= nx < WIDTH and 0 <= ny < HEIGHT and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    queue.append((nx, ny))
        result.append(component)
    return result


def fill_inland_holes(land: np.ndarray) -> tuple[np.ndarray, int]:
    """Keep ocean-connected water; fill accidental metaball voids before rivers/moat."""
    result = land.copy()
    filled = 0
    x0, y0, x1, y1 = ACT1_BOUNDS
    for component in connected_components(~land):
        if any(x in {0, WIDTH - 1} or y in {0, HEIGHT - 1} for x, y in component):
            continue
        if any(x0 <= x <= x1 and y0 <= y <= y1 for x, y in component):
            continue
        for x, y in component:
            result[y, x] = True
        filled += len(component)
    return result, filled


def dilate(mask: np.ndarray, radius: int = 1) -> np.ndarray:
    result = mask.copy()
    for _ in range(radius):
        expanded = result.copy()
        expanded[1:] |= result[:-1]
        expanded[:-1] |= result[1:]
        expanded[:, 1:] |= result[:, :-1]
        expanded[:, :-1] |= result[:, 1:]
        result = expanded
    return result


def erode(mask: np.ndarray, radius: int = 1) -> np.ndarray:
    return ~dilate(~mask, radius)


def wobble_line(points: list[tuple[int, int]], rng: np.random.Generator, amount: float) -> list[tuple[float, float]]:
    output = [tuple(map(float, points[0]))]
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        dx, dy = x2 - x1, y2 - y1
        length = max(math.hypot(dx, dy), 1.0)
        nx, ny = -dy / length, dx / length
        steps = max(2, round(length / 8))
        for step in range(1, steps):
            t = step / steps
            offset = rng.uniform(-amount, amount)
            output.append((x1 + dx * t + nx * offset, y1 + dy * t + ny * offset))
        output.append((float(x2), float(y2)))
    return output


def disk(mask: np.ndarray, center: tuple[int, int], radius: int) -> None:
    x, y = center
    yy, xx = np.indices(mask.shape)
    mask |= (xx - x) ** 2 + (yy - y) ** 2 <= radius * radius


def path_mask(path: list[tuple[int, int]], radius: int = 0) -> np.ndarray:
    mask = np.zeros((HEIGHT, WIDTH), bool)
    for x, y in path:
        mask[y, x] = True
    return dilate(mask, radius) if radius else mask


def build_land(rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray, dict[str, object]]:
    yy, xx = np.indices((HEIGHT, WIDTH), dtype=float)
    noise = fbm((HEIGHT, WIDTH), rng)
    lobes = (
        (218, 323, 70, 82), (277, 304, 47, 92), (229, 246, 73, 48),
        (239, 174, 80, 62), (282, 143, 43, 58),
        (231, 67, 77, 63), (282, 48, 42, 49),
        (83, 160, 73, 53), (75, 96, 69, 87), (102, 37, 65, 35),
    )
    fields = [1.0 - ((xx - cx) / rx) ** 2 - ((yy - cy) / ry) ** 2 for cx, cy, rx, ry in lobes]
    field = (np.maximum.reduce(fields) + 0.24 * noise
             + 0.045 * np.sin(xx * 0.17 + yy * 0.11)
             + 0.018 * np.sin(xx * 1.17 + yy * 0.73))
    land = field >= 0.0
    spine = distance_to_polyline([(160, 12), (158, 70), (164, 125), (159, 190), (165, 255), (162, 325), (166, 390)])
    land |= spine <= 19.0 + 3.0 * noise
    # The west-side sea channel makes geographically-near Acts 1 and 5 story-distant.
    # Both banks are noise-displaced so it does not read as a horizontal cut.
    channel_bank = 205 + 5 * noise + 2 * np.sin(xx * 0.19)
    land[(xx < 151 + 4 * noise) & (yy >= channel_bank) & (yy < 218)] = False
    # Noise-displaced world-edge shores keep sea on every side without a clamp line.
    east_edge = 314.0 + 2.2 * noise + 1.4 * np.sin(yy * 0.31)
    south_edge = 394.0 + 2.4 * noise + 1.3 * np.sin(xx * 0.27)
    north_edge = 4.0 + 2.5 * noise + 1.6 * np.sin(xx * 0.29)
    land[(xx >= east_edge) | (yy >= south_edge) | (yy <= north_edge)] = False
    land[0] = False
    land[-1] = False
    land[:, 0] = False
    land[:, -1] = False
    # Preserve the runtime-authoritative Act 1 rectangle exactly.
    act1_land = load_act1_land()
    x0, y0, x1, y1 = ACT1_BOUNDS
    land[y0:y1 + 1, x0:x1 + 1] = act1_land
    # Pull the redesigned Act 2 west coast away from the rectangular plate edge.
    east_coast_edge = 169 + 5 * noise + 3 * np.sin(yy * 0.37) + 1.5 * np.sin(yy * 0.83)
    land[(yy >= y0) & (xx > x1) & (xx < east_coast_edge)] = False
    # Authorized coast redraw must retain a three-cell land margin for Acts 2-5.
    for act, point, _ in LANDMARKS.values():
        if act != 1:
            disk(land, point, 5)
    for point in CONNECTION_PROBES:
        if not (x0 <= point[0] <= x1 and y0 <= point[1] <= y1):
            disk(land, point, 4)
    for info in SEPARATORS.values():
        corridor = distance_to_polyline([tuple(map(float, p)) for p in info["mouths"]]) <= 4.0
        land |= corridor
    # Reapply the lock after all additive control geometry, then materialize the
    # §5 Crystal land-neck as the sole named structural override over the old gap.
    land[y0:y1 + 1, x0:x1 + 1] = act1_land
    crystal_neck = distance_to_polyline([tuple(map(float, p)) for p in ROUTE_GUIDES["connector-crystal"]]) <= 4.0 + 0.7 * noise
    land |= crystal_neck
    land, inland_hole_cells = fill_inland_holes(land)
    act_membership, biome_fields, assignment_metrics = assign_organic_biomes(land, act1_land)
    return land, act_membership, {
        "act1SnapshotLandCells": int(act1_land.sum()),
        "openCoastLandCells": int(land.sum() - act1_land.sum()),
        "accidentalInlandHoleCellsFilled": inland_hole_cells,
        "assignment": assignment_metrics,
        "biomeFields": biome_fields,
    }


def interface_edges(
    membership: np.ndarray,
    land: np.ndarray,
    pair: tuple[int, int] | None = None,
) -> tuple[set[tuple[int, int]], set[tuple[int, int]]]:
    horizontal: set[tuple[int, int]] = set()
    vertical: set[tuple[int, int]] = set()
    wanted = set(pair) if pair else None
    for y in range(HEIGHT):
        for x in range(1, WIDTH):
            acts = {int(membership[y, x - 1]), int(membership[y, x])}
            if land[y, x - 1] and land[y, x] and len(acts) == 2 and (wanted is None or acts == wanted):
                vertical.add((x, y))
    for y in range(1, HEIGHT):
        for x in range(WIDTH):
            acts = {int(membership[y - 1, x]), int(membership[y, x])}
            if land[y - 1, x] and land[y, x] and len(acts) == 2 and (wanted is None or acts == wanted):
                horizontal.add((x, y))
    return horizontal, vertical


def binary_interface_edges(mask: np.ndarray, land: np.ndarray) -> tuple[set[tuple[int, int]], set[tuple[int, int]]]:
    vertical_mask = land[:, :-1] & land[:, 1:] & (mask[:, :-1] != mask[:, 1:])
    vy, vx = np.where(vertical_mask)
    vertical = {(int(x + 1), int(y)) for y, x in zip(vy, vx)}
    horizontal_mask = land[:-1] & land[1:] & (mask[:-1] != mask[1:])
    hy, hx = np.where(horizontal_mask)
    horizontal = {(int(x), int(y + 1)) for y, x in zip(hy, hx)}
    return horizontal, vertical


def edge_metrics(horizontal: set[tuple[int, int]], vertical: set[tuple[int, int]]) -> dict[str, object]:
    groups: dict[tuple[str, int], list[int]] = {}
    for x, y in horizontal:
        groups.setdefault(("h", y), []).append(x)
    for x, y in vertical:
        groups.setdefault(("v", x), []).append(y)
    maximum = 0
    for values in groups.values():
        run = 0
        prior = -2
        for value in sorted(values):
            run = run + 1 if value == prior + 1 else 1
            maximum = max(maximum, run)
            prior = value
    vertices: dict[tuple[int, int], set[str]] = {}
    for x, y in horizontal:
        vertices.setdefault((x, y), set()).add("h")
        vertices.setdefault((x + 1, y), set()).add("h")
    for x, y in vertical:
        vertices.setdefault((x, y), set()).add("v")
        vertices.setdefault((x, y + 1), set()).add("v")
    corners = sum(len(orientations) == 2 for orientations in vertices.values())
    edges = len(horizontal) + len(vertical)
    return {
        "edgeCells": edges, "cornerVertices": corners,
        "turnRatio": corners / max(1, edges), "maximumAxisAlignedRun": maximum,
    }


def boundary_runs(horizontal: set[tuple[int, int]], vertical: set[tuple[int, int]]) -> list[tuple[str, list[tuple[int, int]]]]:
    runs: list[tuple[str, list[tuple[int, int]]]] = []
    for orientation, edges in (("h", horizontal), ("v", vertical)):
        groups: dict[int, list[int]] = {}
        for x, y in edges:
            groups.setdefault(y if orientation == "h" else x, []).append(x if orientation == "h" else y)
        for fixed, values in groups.items():
            current: list[int] = []
            prior = -2
            for value in sorted(values):
                if value != prior + 1:
                    if current:
                        runs.append((orientation, [(v, fixed) if orientation == "h" else (fixed, v) for v in current]))
                    current = []
                current.append(value)
                prior = value
            if current:
                runs.append((orientation, [(v, fixed) if orientation == "h" else (fixed, v) for v in current]))
    return runs


def roughen_range_boundary(mask: np.ndarray, land: np.ndarray, mutable: np.ndarray) -> tuple[np.ndarray, int]:
    """Break >5-cell outer-range runs by changing the rendered flank mask."""
    result = mask.copy()
    changes = 0
    for _ in range(2000):
        horizontal, vertical = binary_interface_edges(result, land)
        long_runs = sorted(
            (item for item in boundary_runs(horizontal, vertical) if len(item[1]) > 5),
            key=lambda item: len(item[1]),
            reverse=True,
        )
        if not long_runs:
            break
        progress = False
        for orientation, run in long_runs:
            indices = list(range(4, len(run), 5)) + [i for i in range(1, len(run) - 1) if i % 5 != 4]
            for index in indices:
                x, y = run[index]
                cells = ((x, y - 1), (x, y)) if orientation == "h" else ((x - 1, y), (x, y))
                inside = [cell for cell in cells if result[cell[1], cell[0]]]
                outside = [cell for cell in cells if not result[cell[1], cell[0]]]
                candidates = outside + inside
                changed = False
                for cx, cy in candidates:
                    if 0 <= cx < WIDTH and 0 <= cy < HEIGHT and mutable[cy, cx]:
                        result[cy, cx] = not result[cy, cx]
                        changes += 1
                        progress = changed = True
                        break
                if changed:
                    break
            if progress:
                break
        if not progress:
            break
    return result, changes


# Act 1's interior is still pinned to its external v4 authority mask, but it competes in
# the membership solve so its own doors are claimed by this bias; a landmark the owner
# placed outside that pinned mask (Coastal Reef, Crystal Cave) is claimed here too.
LANDMARK_CLAIM_STRENGTH = 26.0
LANDMARK_CLAIM_RADIUS = 22.0
# An act owns the ground under its OWN roads, not just under its doors. Without this the
# 2026-07-29 placement left Obsidian Cavern on a 795-cell act-4 ISLAND, walled off from
# act 4's main body by act-3 land, because Desert Tomb (act 3) sits five cells away and
# won the cells between them. Nothing downstream can repair that: `rescue_isolated_doors`
# and `open_landmark_approaches` are both forbidden from carving adjacent to another act's
# walkable region -- correctly, since that is what re-opens a border seal -- so an act-4
# door marooned inside act 3 has no legal route home. Weaker and tighter than the door
# claim, so it steers the seam along the road instead of redrawing the map around it.
ROUTE_CLAIM_STRENGTH = 26.0
ROUTE_CLAIM_RADIUS = 9.0


def act_route_guides(act: int) -> list[list[tuple[int, int]]]:
    """This act's own intra-act authored routes. Connectors span two acts; they are
    deliberately excluded so neither side claims the pass."""
    prefix = f"a{act}-"
    return [guide for name, guide in ROUTE_GUIDES.items() if name.startswith(prefix)]


def assign_organic_biomes(
    land: np.ndarray, act1_land: np.ndarray
) -> tuple[np.ndarray, dict[str, object], dict[str, object]]:
    """Assign land by simplex-perturbed landmark proximity, then break axial seams."""
    yy, xx = np.indices(land.shape, dtype=float)
    candidates = (1, 2, 3, 4, 5)
    fields: dict[int, np.ndarray] = {}
    for act in candidates:
        points = [point for item_act, point, _ in LANDMARKS.values() if item_act == act]
        nearest = distance_to_points(points)
        cx, cy = np.mean(points, axis=0)
        cluster_distance = np.hypot(xx - cx, yy - cy)
        # An act's own doors define its territory. Without this term membership is pure
        # nearest-landmark-plus-noise, so the 2026-07-29 placement handed Whispering
        # Woods to act 5 (Void Rift simply sat 2 cells nearer) and Crystal Cave to act 2
        # -- which collapses the Crystal Range connector into two mouths on the SAME
        # side and leaves act-1 map cells painted in act-2 snow.
        #
        # The claim is a bias on the field, not a stamp on the result. Pinning the cells
        # directly would leave a disc of act-1 territory marooned inside act 2; biasing
        # bends the border outward to enclose the landmark and keeps each act one piece.
        # Strength exceeds the 11.0 noise term's worst-case spread between two acts, so
        # a landmark's own cell is guaranteed to its act; the linear falloff means the
        # effect is gone 22 cells out and interior geography is untouched.
        claim = LANDMARK_CLAIM_STRENGTH * np.clip(1.0 - nearest / LANDMARK_CLAIM_RADIUS, 0.0, 1.0)
        guides = act_route_guides(act)
        if guides:
            road = np.min([distance_to_polyline(guide) for guide in guides], axis=0)
            claim = np.maximum(
                claim,
                ROUTE_CLAIM_STRENGTH * np.clip(1.0 - road / ROUTE_CLAIM_RADIUS, 0.0, 1.0),
            )
        fields[act] = (nearest + 0.18 * cluster_distance
                       + 11.0 * simplex_fbm(land.shape, SEED + act * 1000) - claim)
    stack = np.stack([fields[act] for act in candidates])
    membership = np.zeros_like(land, dtype=np.uint8)
    membership[land] = np.take(np.array(candidates, dtype=np.uint8), np.argmin(stack, axis=0))[land]
    x0, y0, x1, y1 = ACT1_BOUNDS
    pinned = np.zeros_like(land)
    pinned[y0:y1 + 1, x0:x1 + 1] = act1_land
    membership[pinned] = 1

    landmark_guard = np.zeros_like(land)
    for _, point, _ in LANDMARKS.values():
        disk(landmark_guard, point, 3)
    # Long lattice runs are geometric artifacts, not geography. Move the
    # lowest-confidence boundary cell one step across the interface to form a
    # shallow noise-led inlet. Pinned Act 1 and landmark margins never move.
    changes = 0
    for _ in range(20):
        horizontal, vertical = interface_edges(membership, land)
        long_runs = [item for item in boundary_runs(horizontal, vertical) if len(item[1]) > 5]
        if not long_runs:
            break
        progress = False
        for orientation, run in long_runs:
            for index in range(4, len(run), 5):
                x, y = run[index]
                cells = ((x, y - 1), (x, y)) if orientation == "h" else ((x - 1, y), (x, y))
                options = []
                for (ax, ay), (bx, by) in (cells, cells[::-1]):
                    if not (0 <= ax < WIDTH and 0 <= ay < HEIGHT and 0 <= bx < WIDTH and 0 <= by < HEIGHT):
                        continue
                    source, target = int(membership[ay, ax]), int(membership[by, bx])
                    if (source == 1 or target == 0 or pinned[ay, ax]
                            or (landmark_guard[ay, ax] and target != 1)):
                        continue
                    confidence = (0.0 if target == 1
                                  else fields[source][ay, ax] - fields[target][ay, ax])
                    options.append((float(confidence), ax, ay, target))
                if options:
                    _, ax, ay, target = max(options)
                    membership[ay, ax] = target
                    changes += 1
                    progress = True
        if not progress:
            break
    metrics = edge_metrics(*interface_edges(membership, land))
    field_report = {
        str(act): {
            "landmarkCount": len([1 for item_act, _, _ in LANDMARKS.values() if item_act == act]),
            "simplexSeed": SEED + act * 1000,
        }
        for act in candidates
    }
    return membership, field_report, {**metrics, "axialRunCellsReassigned": changes}


def raster_path(allowed: np.ndarray, start: tuple[int, int], end: tuple[int, int], guide: list[tuple[float, float]], noise: np.ndarray) -> list[tuple[int, int]]:
    guide_distance = distance_to_polyline([tuple(map(float, point)) for point in guide])
    sx, sy = start
    ex, ey = end
    heap: list[tuple[float, int, int]] = [(0.0, sy, sx)]
    best = {(sx, sy): 0.0}
    previous: dict[tuple[int, int], tuple[int, int] | None] = {(sx, sy): None}
    while heap:
        score, y, x = heapq.heappop(heap)
        if score != best.get((x, y)):
            continue
        if (x, y) == (ex, ey):
            result: list[tuple[int, int]] = []
            at: tuple[int, int] | None = (x, y)
            while at is not None:
                result.append(at)
                at = previous[at]
            return result[::-1]
        for nx, ny in neighbors(x, y):
            if not (0 <= nx < WIDTH and 0 <= ny < HEIGHT and allowed[ny, nx]):
                continue
            candidate = score + 1.0 + 0.12 * float(guide_distance[ny, nx]) + 0.15 * (float(noise[ny, nx]) + 1.0)
            if candidate < best.get((nx, ny), math.inf):
                best[(nx, ny)] = candidate
                previous[(nx, ny)] = (x, y)
                heapq.heappush(heap, (candidate, ny, nx))
    fail(f"no authored land route from {start} to {end}")


def build_corridors(land: np.ndarray, rng: np.random.Generator) -> tuple[dict[str, list[tuple[int, int]]], np.ndarray, dict[str, object]]:
    noise = fbm((HEIGHT, WIDTH), rng)
    paths: dict[str, list[tuple[int, int]]] = {}
    protected = np.zeros_like(land)
    for name, guide in ROUTE_GUIDES.items():
        allowed = land
        if name == "connector-crystal":
            # Crystal is a real dungeon transition over snapshot-locked Act 1
            # water. Retain a semantic guide for the labeled pass without
            # converting immutable water cells to land.
            allowed = land | (distance_to_polyline([tuple(map(float, point)) for point in guide]) <= 1.5)
        curved_guide = organic_crest(guide, rng)
        path = raster_path(allowed, guide[0], guide[-1], curved_guide, noise)
        paths[name] = path
        protected |= path_mask(path)
    for _, point, _ in LANDMARKS.values():
        disk(protected, point, 1)
    for point in CONNECTION_PROBES:
        protected[point[1], point[0]] = True
    return paths, protected, {
        "routeCount": len(paths),
        "protectedCells": int(protected.sum()),
        "explicitRouteCells": {name: len(path) for name, path in paths.items()},
    }


def apply_demon_moat(land: np.ndarray, paths: dict[str, list[tuple[int, int]]]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    yy, xx = np.indices(land.shape)
    distance = np.hypot(xx - 85, yy - 31)
    # A constant-radius band drew a mathematically perfect ANNULUS -- the owner read
    # it as "a drawn ring" round the Demon Castle, which is exactly what it was.
    # Both radii now breathe on short simplex octaves at the moat's OWN scale (the
    # ring is ~7 cells across, so simplex_fbm's scale-43 octave would not vary over
    # it at all). Outer is built as inner PLUS a positive width, so the band cannot
    # pinch shut anywhere and the castle stays moated all the way round.
    wobble_in = (0.6 * simplex_noise(land.shape, 5.0, SEED + 24601)
                 + 0.4 * simplex_noise(land.shape, 2.5, SEED + 24631))
    wobble_out = (0.6 * simplex_noise(land.shape, 6.0, SEED + 24659)
                  + 0.4 * simplex_noise(land.shape, 3.0, SEED + 24683))
    # The first pass here varied the radii by only ~1 cell on a ~12-cell ring,
    # which the art map's blur smoothed straight back into a compass circle. A
    # moat IS meant to encircle the castle, so the shape stays a ring -- what has
    # to go is the machined edge, so both radii swing by 2.4-2.8 cells and the
    # band ranges from 1.5 to 4.3 cells wide as it goes round.
    inner = 3.8 + 2.4 * (wobble_in * 0.5 + 0.5)
    outer = inner + 1.5 + 2.8 * (wobble_out * 0.5 + 0.5)
    moat = (distance >= inner) & (distance <= outer)
    island = distance < inner
    route = path_mask(paths["a5-barracks-castle"], 1)
    bridge = moat & route
    result = land.copy()
    result[moat] = False
    result[island | bridge] = True
    return result, moat, bridge


def noisy_landmark_lobes(act: int, noise: np.ndarray) -> np.ndarray:
    points = [point for item_act, point, _ in LANDMARKS.values() if item_act == act]
    fields = []
    for index, (x, y) in enumerate(points):
        radius = 18.0 + (index % 3) * 3.5
        fields.append(radius - np.hypot(*np.ogrid[-y:HEIGHT-y, -x:WIDTH-x]))
    # Joined landmark clearings remain lobed and non-convex instead of becoming
    # one convex act-sized hole in the dense terrain matrix.
    return np.maximum.reduce(fields) + 5.0 * noise


def biome_interface_cells(membership: np.ndarray, land: np.ndarray, pair: tuple[int, int]) -> np.ndarray:
    mask = np.zeros_like(land)
    a, b = pair
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        shifted = np.roll(membership, (dy, dx), axis=(0, 1))
        shifted_land = np.roll(land, (dy, dx), axis=(0, 1))
        mask |= land & shifted_land & (((membership == a) & (shifted == b)) | ((membership == b) & (shifted == a)))
    mask[[0, -1], :] = False
    mask[:, [0, -1]] = False
    return mask


def base_terrain(
    land: np.ndarray,
    membership: np.ndarray,
    protected: np.ndarray,
    rng: np.random.Generator,
) -> tuple[np.ndarray, dict[str, object], dict[str, np.ndarray]]:
    """Carve v4-style lobed interiors from each biome's dense matrix."""
    grid = np.full((HEIGHT, WIDTH), CODE["water"], dtype=np.uint8)
    styles = {
        1: ("forest", "lightForest", "meadow"),
        2: ("snowForest", "tundra", "snow"),
        3: ("duneRock", "aridFoothill", "sand"),
        4: ("obsidian", "scorched", "ash"),
        5: ("deadForest", "charcoal", "deadGround"),
    }
    interior_metrics: dict[str, object] = {}
    for act, (matrix_name, fringe_name, open_name) in styles.items():
        region = land & (membership == act)
        grid[region] = CODE[matrix_name]
        if act == 1:
            continue
        broad = simplex_fbm(land.shape, SEED + 7000 + act * 37)
        detail = simplex_fbm(land.shape, SEED + 8000 + act * 41)
        score = noisy_landmark_lobes(act, broad)
        inner = region & (score >= 1.0)
        fringe = region & (score >= -4.0) & ~inner
        # Coherent matrix islands inside the openings give each basin old-growth
        # density and readable lobes without pepper noise.
        matrix_islands = inner & (detail > 0.34) & ~protected
        inner &= ~matrix_islands
        grid[fringe] = CODE[fringe_name]
        grid[inner] = CODE[open_name]
        grid[protected & region] = CODE[fringe_name]
        total = max(1, int(region.sum()))
        interior_metrics[str(act)] = {
            "matrixClass": matrix_name, "fringeClass": fringe_name, "openClass": open_name,
            "matrixPercent": 100.0 * int((region & (grid == CODE[matrix_name])).sum()) / total,
            "fringePercent": 100.0 * int((region & (grid == CODE[fringe_name])).sum()) / total,
            "openPercent": 100.0 * int((region & (grid == CODE[open_name])).sum()) / total,
            "basinComponents": len(connected_components(inner | fringe)),
        }

    boundary_masks: dict[str, np.ndarray] = {}
    blends = {
        (1, 2): {1: ("lightForest", "forest"), 2: ("tundra", "snowForest")},
        (2, 3): {2: ("tundra", "snowForest"), 3: ("aridFoothill", "duneRock")},
        (3, 4): {3: ("scorched", "aridFoothill"), 4: ("scorched", "obsidian")},
        (4, 5): {4: ("ash", "scorched"), 5: ("charcoal", "deadGround")},
        # The middle of the central spine places Act 5 opposite Act 3; a narrow
        # scorched/charcoal geological buffer carries the ladder through it.
        (3, 5): {3: ("scorched", "aridFoothill"), 5: ("charcoal", "deadGround")},
        (2, 5): {2: ("tundra", "snowForest"), 5: ("charcoal", "deadGround")},
    }
    mix_noise = simplex_fbm(land.shape, SEED + 9191)
    for pair, side_styles in blends.items():
        interface = biome_interface_cells(membership, land, pair)
        if not interface.any():
            continue
        band = dilate(interface, 5) & land & np.isin(membership, pair) & ~protected
        boundary_masks[f"act{pair[0]}_act{pair[1]}"] = interface
        for act, names in side_styles.items():
            side = band & (membership == act)
            grid[side & (mix_noise <= 0.08)] = CODE[names[0]]
            grid[side & (mix_noise > 0.08)] = CODE[names[1]]
    return grid, interior_metrics, boundary_masks


def measure_final_interiors(
    grid: np.ndarray, land: np.ndarray, membership: np.ndarray
) -> dict[str, object]:
    styles = {
        2: ("snowForest", "tundra", "snow"),
        3: ("duneRock", "aridFoothill", "sand"),
        4: ("obsidian", "scorched", "ash"),
        5: ("deadForest", "charcoal", "deadGround"),
    }
    result: dict[str, object] = {}
    for act, (matrix_name, fringe_name, open_name) in styles.items():
        region = land & (membership == act)
        total = max(1, int(region.sum()))
        basin = region & np.isin(grid, [CODE[fringe_name], CODE[open_name]])
        result[str(act)] = {
            "matrixClass": matrix_name, "fringeClass": fringe_name, "openClass": open_name,
            "matrixPercent": 100.0 * int((region & (grid == CODE[matrix_name])).sum()) / total,
            "fringePercent": 100.0 * int((region & (grid == CODE[fringe_name])).sum()) / total,
            "openPercent": 100.0 * int((region & (grid == CODE[open_name])).sum()) / total,
            "basinComponents": len(connected_components(basin)),
        }
    return result


def drape_ranges(
    grid: np.ndarray,
    land: np.ndarray,
    membership: np.ndarray,
    protected: np.ndarray,
    paths: dict[str, list[tuple[int, int]]],
    rng: np.random.Generator,
) -> tuple[np.ndarray, np.ndarray, dict[str, np.ndarray], dict[str, np.ndarray], dict[str, object], dict[str, np.ndarray]]:
    """Drape three curved 4-14-cell ranges with four narrow saddles."""
    elevation = np.zeros((HEIGHT, WIDTH), dtype=np.float32)
    crest_metrics: dict[str, object] = {}
    crest_masks: dict[str, np.ndarray] = {}
    authored_masks: dict[str, np.ndarray] = {}
    noise = simplex_fbm((HEIGHT, WIDTH), SEED + 12000)
    act1_rect = np.zeros_like(land)
    x0, y0, x1, y1 = ACT1_BOUNDS
    act1_rect[y0:y1 + 1, x0:x1 + 1] = True
    connector_by_range = {
        "Central Spine": ("connector-crystal", "connector-volcanic"),
        "Shadow Range": ("connector-shadow",),
        "Magma Ridge": ("connector-magma",),
    }
    range_passes = {name: np.zeros_like(land) for name in RANGE_CRESTS}
    throats: dict[str, np.ndarray] = {}
    for separator, connector in {
        "Crystal Range": "connector-crystal", "Shadow Range": "connector-shadow",
        "Magma Ridge": "connector-magma", "Volcanic Pass": "connector-volcanic",
    }.items():
        range_name = "Central Spine" if separator in {"Crystal Range", "Volcanic Pass"} else separator
        corridor = path_mask(paths[connector], 1)
        range_passes[range_name] |= corridor
        center = SEPARATORS[separator]["center"]
        throats[separator] = corridor & (distance_to_points([center]) <= 3.2)

    for range_index, (name, controls) in enumerate(RANGE_CRESTS.items()):
        crest = organic_crest(controls, rng)
        ordered = break_axial_crest_runs(ordered_polyline_cells(crest))
        # The corrected raster is the elevation centerline itself, not a
        # reporting-only proxy, so its measured meander is the rendered ridge.
        crest = [(float(x), float(y)) for x, y in ordered]
        crest_metrics[name] = ordered_line_metrics(ordered)
        crest_mask = np.zeros_like(land)
        for x, y in ordered:
            if 0 <= x < WIDTH and 0 <= y < HEIGHT:
                crest_mask[y, x] = True
        crest_masks[name.replace(" ", "_").lower()] = crest_mask
        distance, progress = distance_and_progress(crest)
        width = np.clip(
            9.0 + 4.2 * np.sin(progress * math.tau * 2.35 + range_index * 1.2)
            + 1.2 * noise,
            4.0,
            14.0,
        )
        radius = width / 2.0
        local_elevation = np.exp(-(distance / np.maximum(radius, 1.0)) ** 2) + 0.10 * noise
        elevation = np.maximum(elevation, local_elevation.astype(np.float32))
        gy, gx = np.gradient(local_elevation)
        slope = np.hypot(gx, gy)
        outer = land & (distance <= radius)
        pass_corridor = range_passes[name] & (distance <= 10.0)
        if name == "Central Spine":
            # The pinned rectangle keeps the approved v4 Crystal geography.
            outer &= ~act1_rect
            pass_corridor &= ~act1_rect
        mutable = land.copy()
        if name == "Central Spine":
            mutable &= ~act1_rect
        outer, flank_changes = roughen_range_boundary(outer, land, mutable)
        mountain = outer & (distance <= np.maximum(1.25, radius * 0.58))
        steep = outer & ~mountain & (slope >= np.quantile(slope[outer], 0.46))
        foothill = outer & ~mountain & ~steep & ~protected & ~pass_corridor
        foothill_classes = {
            1: "lightForest", 2: "tundra", 3: "aridFoothill",
            4: "scorched", 5: "charcoal",
        }
        for act, class_name in foothill_classes.items():
            grid[foothill & (membership == act)] = CODE[class_name]
        grid[steep & ~protected & ~pass_corridor] = CODE["cliff"]
        grid[mountain & ~protected & ~pass_corridor] = CODE["mountain"]
        for connector in connector_by_range[name]:
            lowered = path_mask(paths[connector], 1) & outer & land
            class_name = "tundra" if connector in {"connector-crystal", "connector-shadow"} else "scorched"
            grid[lowered] = CODE[class_name]
        authored_masks[name] = outer
        flank_metric = edge_metrics(*binary_interface_edges(outer, land))
        sampled = [int(round(value)) for value in width[crest_mask] if 4.0 <= value <= 14.0]
        # Evenly sample the actual local width field along the raster crest.
        sampled = sampled[::max(1, len(sampled) // 28)]
        crest_metrics[name].update({
            "sampledWidths": sampled,
            "minimumWidthCells": min(sampled), "maximumWidthCells": max(sampled),
            "widthVariationRatio": max(sampled) / min(sampled),
            "flankBoundaryTurnRatio": flank_metric["turnRatio"],
            "flankBoundaryMaximumAxisAlignedRun": flank_metric["maximumAxisAlignedRun"],
            "flankBoundaryCellsChanged": flank_changes,
        })

    range_masks = {
        "Crystal Range": authored_masks["Central Spine"] & (np.indices(land.shape)[0] >= 210),
        "Volcanic Pass": authored_masks["Central Spine"] & (np.indices(land.shape)[0] <= 225),
        "Shadow Range": authored_masks["Shadow Range"],
        "Magma Ridge": authored_masks["Magma Ridge"],
    }
    mapped_metrics = {
        "Crystal Range": {**crest_metrics["Central Spine"], "throatCells": int(throats["Crystal Range"].sum()), "declaredThroatWidth": 3},
        "Volcanic Pass": {**crest_metrics["Central Spine"], "throatCells": int(throats["Volcanic Pass"].sum()), "declaredThroatWidth": 3},
        "Shadow Range": {**crest_metrics["Shadow Range"], "throatCells": int(throats["Shadow Range"].sum()), "declaredThroatWidth": 3},
        "Magma Ridge": {**crest_metrics["Magma Ridge"], "throatCells": int(throats["Magma Ridge"].sum()), "declaredThroatWidth": 3},
    }
    return grid, elevation, range_masks, throats, mapped_metrics, crest_masks


def nearest_coast_cell(land: np.ndarray, hint: tuple[int, int]) -> tuple[int, int]:
    coast = land & ~erode(land)
    yy, xx = np.indices(land.shape)
    score = (xx - hint[0]) ** 2 + (yy - hint[1]) ** 2 + np.where(coast, 0, 1_000_000)
    y, x = np.unravel_index(np.argmin(score), score.shape)
    return int(x), int(y)


def drape_rivers(
    grid: np.ndarray,
    land: np.ndarray,
    membership: np.ndarray,
    protected: np.ndarray,
    rng: np.random.Generator,
) -> tuple[np.ndarray, dict[str, np.ndarray], np.ndarray, dict[str, object]]:
    masks: dict[str, np.ndarray] = {}
    metrics: dict[str, object] = {}
    all_bridges = np.zeros_like(land)
    noise = fbm((HEIGHT, WIDTH), rng)
    for name, (act, controls, cls) in RIVERS.items():
        projected = list(controls)
        projected[-1] = nearest_coast_cell(land, controls[-1])
        river_basin = dilate(land & (membership == act), 18) & land
        allowed = river_basin & ~protected
        for point in projected:
            disk(allowed, point, 1)
        path: list[tuple[int, int]] = []
        for start, end in zip(projected, projected[1:]):
            curved_guide = organic_crest([start, end], rng)
            bridge_candidates = protected & (distance_to_polyline(curved_guide) <= 3.2)
            piece = raster_path(allowed | bridge_candidates, start, end, curved_guide, noise)
            path.extend(piece if not path else piece[1:])
        mask = path_mask(path)
        widened = mask.copy()
        bank = dilate(mask) & land & ~protected
        widened |= bank & (noise > 0.24)
        grid[widened] = CODE[cls]
        bridges = mask & protected
        all_bridges |= bridges
        grid[bridges] = CODE["bridge"]
        masks[name] = widened
        metrics[name] = {
            "act": act, "class": cls, "source": list(projected[0]), "outlet": list(projected[-1]),
            "cells": int(widened.sum()), "majorComponents": len(connected_components(widened)),
            "outsideActDilationCells": int((widened & ~river_basin).sum()),
            "bridgeCells": int(bridges.sum()),
        }
    return grid, masks, all_bridges, metrics


def overlay_act1_v4(grid: np.ndarray) -> tuple[np.ndarray, str]:
    with tempfile.TemporaryDirectory(prefix="continent-act1-v4-") as directory:
        output = Path(directory)
        result = build_act1_v4(output)
        act1_grid = np.load(output / "terrain-classes.npy")
    mapped = np.zeros_like(act1_grid, dtype=np.uint8)
    for old_code, name in enumerate(ACT1_CLASSES):
        mapped[act1_grid == old_code] = CODE[name]
    x0, y0, x1, y1 = ACT1_BOUNDS
    grid[y0:y1 + 1, x0:x1 + 1] = mapped
    return grid, str(result["gridSha256"])


def place_landmarks_and_trails(grid: np.ndarray, land: np.ndarray, protected: np.ndarray, paths: dict[str, list[tuple[int, int]]], moat: np.ndarray, moat_bridge: np.ndarray) -> np.ndarray:
    act1_rect = np.zeros_like(land)
    x0, y0, x1, y1 = ACT1_BOUNDS
    act1_rect[y0:y1 + 1, x0:x1 + 1] = True
    act1_authority = np.zeros_like(land)
    act1_authority[y0:y1 + 1, x0:x1 + 1] = load_act1_land()
    crystal_override = land & act1_rect & ~act1_authority
    crystal_pass = path_mask(paths["connector-crystal"], 1) & crystal_override
    grid[crystal_override] = CODE["mountain"]
    grid[crystal_pass] = CODE["tundra"]
    # Clear every authored non-Act1 route last: barriers and rivers cannot sever it.
    for path in paths.values():
        for x, y in path:
            if not act1_rect[y, x] and land[y, x]:
                grid[y, x] = CODE["trail"]
    grid[moat & ~moat_bridge] = CODE["water"]
    grid[moat_bridge] = CODE["bridge"]
    for name, (act, (x, y), kind) in LANDMARKS.items():
        if act == 1:
            continue
        code = CODE["structure" if kind == "town" else "landmarkSolid"]
        ring = [(x - 1, y - 1), (x, y - 1), (x + 1, y - 1), (x - 1, y), (x + 1, y), (x - 1, y + 1), (x + 1, y + 1)]
        for px, py in ring:
            if 0 <= px < WIDTH and 0 <= py < HEIGHT and land[py, px] and not protected[py, px]:
                grid[py, px] = code
        grid[y, x] = CODE["trail"]
    for x, y in CONNECTION_PROBES:
        if land[y, x] and not act1_rect[y, x]:
            grid[y, x] = CODE["trail"]
    return grid


def flood_proof(grid: np.ndarray, start: tuple[int, int], end: tuple[int, int], extra_blocked: np.ndarray | None = None, portal_edges: tuple[tuple[tuple[int, int], tuple[int, int]], ...] = ()) -> dict[str, object]:
    if int(grid[start[1], start[0]]) not in WALKABLE or int(grid[end[1], end[0]]) not in WALKABLE:
        return {"pass": False, "shortestPathCells": None, "visitedWalkableCells": 0}
    queue = deque([start])
    previous: dict[tuple[int, int], tuple[int, int] | None] = {start: None}
    portals: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for a, b in portal_edges:
        portals.setdefault(a, []).append(b)
        portals.setdefault(b, []).append(a)
    while queue:
        x, y = queue.popleft()
        if (x, y) == end:
            length = 0
            at: tuple[int, int] | None = end
            while at is not None:
                length += 1
                at = previous[at]
            return {"pass": True, "shortestPathCells": length, "visitedWalkableCells": len(previous)}
        for nx, ny in neighbors(x, y):
            if (0 <= nx < WIDTH and 0 <= ny < HEIGHT and (nx, ny) not in previous
                    and int(grid[ny, nx]) in WALKABLE and (extra_blocked is None or not extra_blocked[ny, nx])):
                previous[(nx, ny)] = (x, y)
                queue.append((nx, ny))
        for nx, ny in portals.get((x, y), []):
            if ((nx, ny) not in previous and int(grid[ny, nx]) in WALKABLE
                    and (extra_blocked is None or not extra_blocked[ny, nx])):
                previous[(nx, ny)] = (x, y)
                queue.append((nx, ny))
    return {"pass": False, "shortestPathCells": None, "visitedWalkableCells": len(previous)}


def longest_axis_run(mask: np.ndarray, exclude: np.ndarray | None = None) -> int:
    active = mask & (~exclude if exclude is not None else True)
    maximum = 0
    for row in active:
        run = 0
        for value in row:
            run = run + 1 if value else 0
            maximum = max(maximum, run)
    for column in active.T:
        run = 0
        for value in column:
            run = run + 1 if value else 0
            maximum = max(maximum, run)
    return maximum


def coast_metrics(land: np.ndarray) -> dict[str, object]:
    coast = land & ~erode(land)
    act1_rect = np.zeros_like(land)
    x0, y0, x1, y1 = ACT1_BOUNDS
    act1_rect[y0:y1 + 1, x0:x1 + 1] = True
    open_coast = coast & ~act1_rect
    exposed_edges = np.zeros_like(land, dtype=np.uint8)
    exposed_edges[1:] += (~land[:-1]).astype(np.uint8)
    exposed_edges[:-1] += (~land[1:]).astype(np.uint8)
    exposed_edges[:, 1:] += (~land[:, :-1]).astype(np.uint8)
    exposed_edges[:, :-1] += (~land[:, 1:]).astype(np.uint8)
    corner_cells = open_coast & (exposed_edges >= 2)
    return {
        "openCoastCells": int(open_coast.sum()),
        "openCoastMaximumAxisRun": longest_axis_run(open_coast),
        "openCoastTurnRatio": float(corner_cells.sum() / max(1, open_coast.sum())),
        "worldBorderLandCells": int(land[0].sum() + land[-1].sum() + land[:, 0].sum() + land[:, -1].sum()),
    }


def margin_to_water(land: np.ndarray, point: tuple[int, int], limit: int = 12) -> int:
    x, y = point
    if not land[y, x]:
        return -1
    queue = deque([(x, y, 0)])
    seen = {(x, y)}
    while queue:
        px, py, distance = queue.popleft()
        if not land[py, px]:
            return distance - 1
        if distance >= limit:
            continue
        for nx, ny in neighbors(px, py):
            if not (0 <= nx < WIDTH and 0 <= ny < HEIGHT):
                return distance
            if (nx, ny) not in seen:
                seen.add((nx, ny))
                queue.append((nx, ny, distance + 1))
    return limit


def distribution(grid: np.ndarray, membership: np.ndarray, land: np.ndarray) -> dict[str, object]:
    result: dict[str, object] = {}
    for act in range(1, 6):
        mask = land & (membership == act)
        total = int(mask.sum())
        counts = {name: int(((grid == CODE[name]) & mask).sum()) for name in CLASSES}
        family = int(sum(counts[name] for name in BIOME_FAMILIES[act]))
        result[str(act)] = {
            "name": ACT_NAMES[act], "landCells": total,
            "dominantBiomeFamilyPercent": 100.0 * family / max(1, total),
            "classes": {name: {"cells": count, "percent": 100.0 * count / max(1, total)} for name, count in counts.items() if count},
        }
    return result


def lint_pack(
    grid: np.ndarray,
    land: np.ndarray,
    membership: np.ndarray,
    protected: np.ndarray,
    paths: dict[str, list[tuple[int, int]]],
    throats: dict[str, np.ndarray],
    range_masks: dict[str, np.ndarray],
    range_metrics: dict[str, object],
    river_metrics: dict[str, object],
    interior_metrics: dict[str, object],
) -> dict[str, object]:
    x0, y0, x1, y1 = ACT1_BOUNDS
    act1_expected = load_act1_land()
    act1_actual = land[y0:y1 + 1, x0:x1 + 1]
    crystal_allowed = distance_to_polyline([tuple(map(float, p)) for p in ROUTE_GUIDES["connector-crystal"]])[y0:y1 + 1, x0:x1 + 1] <= 4.8
    act1_added = act1_actual & ~act1_expected
    act1_removed = act1_expected & ~act1_actual
    land_components = connected_components(land)
    portal_edges = tuple(info["mouths"] for info in SEPARATORS.values())
    route_proofs = {
        name: flood_proof(grid, guide[0], guide[-1], portal_edges=portal_edges if name.startswith("connector-") else ())
        for name, guide in ROUTE_GUIDES.items()
    }
    story_segments = {
        f"{index + 1}:{start}->{end}": flood_proof(grid, start, end, portal_edges=portal_edges)
        for index, (start, end) in enumerate(zip(STORY_CHAIN, STORY_CHAIN[1:]))
    }
    story_whole = flood_proof(grid, STORY_CHAIN[0], STORY_CHAIN[-1], portal_edges=portal_edges)
    separator_proofs: dict[str, object] = {}
    for name, info in SEPARATORS.items():
        cut = throats[name]
        other_portals = tuple(other["mouths"] for other_name, other in SEPARATORS.items() if other_name != name)
        open_proof = flood_proof(grid, info["mouths"][0], info["mouths"][1], portal_edges=portal_edges)
        cut_proof = flood_proof(grid, info["mouths"][0], info["mouths"][1], cut, other_portals)
        filled_range = range_masks[name] | cut
        blocker_components = connected_components(filled_range)
        separator_proofs[name] = {
            "declaredThroatWidth": 3,
            "throatCells": int(cut.sum()),
            "openReachable": bool(open_proof["pass"]),
            "closedReachable": bool(cut_proof["pass"]),
            "soleAperture": bool(open_proof["pass"] and not cut_proof["pass"]),
            "filledRangeLargestComponentCells": max((len(c) for c in blocker_components), default=0),
            **range_metrics[name],
        }
    margins = {name: margin_to_water(land, point) for name, (act, point, _) in LANDMARKS.items() if act != 1}
    probe_proofs = {f"{x},{y}": {"land": bool(land[y, x]), "walkable": int(grid[y, x]) in WALKABLE} for x, y in CONNECTION_PROBES}
    coast = coast_metrics(land)
    actual_pairs = sorted({
        tuple(sorted((int(membership[y, x - 1]), int(membership[y, x]))))
        for y in range(HEIGHT) for x in range(1, WIDTH)
        if land[y, x - 1] and land[y, x] and membership[y, x - 1] != membership[y, x]
    } | {
        tuple(sorted((int(membership[y - 1, x]), int(membership[y, x]))))
        for y in range(1, HEIGHT) for x in range(WIDTH)
        if land[y - 1, x] and land[y, x] and membership[y - 1, x] != membership[y, x]
    })
    interface_metrics = {
        f"act{a}-act{b}": edge_metrics(*interface_edges(membership, land, (a, b)))
        for a, b in actual_pairs
    }
    unique_crests = {
        "Central Spine": range_metrics["Crystal Range"],
        "Shadow Range": range_metrics["Shadow Range"],
        "Magma Ridge": range_metrics["Magma Ridge"],
    }
    blend_checks = {}
    for name, info in SEPARATORS.items():
        (ax, ay), (bx, by) = info["mouths"]
        cx, cy = (ax + bx) // 2, (ay + by) // 2
        radius = 22
        crop = grid[max(0, cy - radius):min(HEIGHT, cy + radius + 1), max(0, cx - radius):min(WIDTH, cx + radius + 1)]
        counts = {cls: int((crop == CODE[cls]).sum()) for cls in CLASSES}
        a, b = info["acts"]
        blend_checks[name] = {
            "actABiomeCells": sum(counts[cls] for cls in BIOME_FAMILIES[a]),
            "actBBiomeCells": sum(counts[cls] for cls in BIOME_FAMILIES[b]),
            "transitionCells": sum(counts[cls] for cls in {"tundra", "aridFoothill", "scorched", "ash", "charcoal"}),
        }
    checks = {
        "world-size": {"pass": grid.shape == (400, 320), "measured": list(grid.shape[::-1])},
        "act1-snapshot-land-water": {"pass": not act1_removed.any() and bool(np.all(~act1_added | crystal_allowed)), "removedSnapshotLandCells": int(act1_removed.sum()), "namedCrystalNeckOverrideCells": int(act1_added.sum()), "unexpectedOverrideCells": int((act1_added & ~crystal_allowed).sum()), "authority": "snapshot exact except the explicitly required §5 Crystal water-gap→land-neck formation"},
        "one-connected-landmass": {"pass": len(land_components) == 1, "components": len(land_components), "largestCells": max((len(c) for c in land_components), default=0)},
        "sea-surrounds": {"pass": coast["worldBorderLandCells"] == 0, **coast},
        "organic-open-coast": {"pass": coast["openCoastMaximumAxisRun"] <= 16 and coast["openCoastTurnRatio"] >= 0.12, **coast, "thresholds": {"maxAxisRun": 16, "minTurnRatio": 0.12}},
        "open-coast-landmark-margin": {"pass": min(margins.values()) >= 3, "minimumCells": min(margins.values()), "margins": margins, "scope": "Acts 2-5; Act 1 coast is immutable and Coastal Reef intentionally contacts sea"},
        "all-41-source-probes": {"pass": all(v["land"] and v["walkable"] for v in probe_proofs.values()), "probes": probe_proofs, "staleButPreserved": "278,82; the owner's Scorched Ruins cell is 171,133"},
        "all-authored-routes": {"pass": all(v["pass"] for v in route_proofs.values()), "count": len(route_proofs), "routes": route_proofs},
        "story-path": {"pass": bool(story_whole["pass"] and all(v["pass"] for v in story_segments.values())), "whole": story_whole, "segments": story_segments, "proofModel": "walkable flood fill plus the four authoritative dungeon connector edges"},
        "separator-sole-passes": {"pass": all(v["soleAperture"] and 2 <= v["declaredThroatWidth"] <= 4 for v in separator_proofs.values()), "separators": separator_proofs, "proofModel": "remove named connector edge and its 3-cell terrain throat; retain all other connector edges"},
        "range-width-variation": {"pass": all(v["widthVariationRatio"] >= 1.5 for v in range_metrics.values()), "minimumRatio": min(v["widthVariationRatio"] for v in range_metrics.values()), "requiredMinimum": 1.5, "ranges": range_metrics},
        "separator-width-bounds": {"pass": all(4 <= v["minimumWidthCells"] <= v["maximumWidthCells"] <= 14 for v in unique_crests.values()), "requiredCells": [4, 14], "ranges": {name: {"minimumWidthCells": v["minimumWidthCells"], "maximumWidthCells": v["maximumWidthCells"]} for name, v in unique_crests.items()}},
        "separator-crest-non-straight": {"pass": all(v["turnRatio"] >= 0.12 for v in unique_crests.values()), "requiredMinimumTurnRatio": 0.12, "ranges": {name: {"turnRatio": v["turnRatio"], "turns": v["turns"], "cells": v["cells"]} for name, v in unique_crests.items()}},
        "separator-axis-runs": {"pass": all(v["maximumAxisAlignedRun"] <= 5 and v["flankBoundaryMaximumAxisAlignedRun"] <= 5 for v in unique_crests.values()), "requiredMaximumCells": 5, "ranges": {name: {"crest": v["maximumAxisAlignedRun"], "flankBoundary": v["flankBoundaryMaximumAxisAlignedRun"]} for name, v in unique_crests.items()}, "coastExempt": True},
        "separator-flank-non-straight": {"pass": all(v["flankBoundaryTurnRatio"] >= 0.12 for v in unique_crests.values()), "requiredMinimumTurnRatio": 0.12, "ranges": {name: {"turnRatio": v["flankBoundaryTurnRatio"], "cellsChanged": v["flankBoundaryCellsChanged"]} for name, v in unique_crests.items()}},
        "organic-biome-boundaries": {"pass": bool(interface_metrics) and all(v["turnRatio"] >= 0.12 and v["maximumAxisAlignedRun"] <= 5 for v in interface_metrics.values()), "thresholds": {"minimumTurnRatio": 0.12, "maximumAxisAlignedRun": 5}, "interfaces": interface_metrics, "coastExempt": True},
        "biome-blends": {"pass": all(v["actABiomeCells"] > 0 and v["actBBiomeCells"] > 0 and v["transitionCells"] > 0 for v in blend_checks.values()), "windows": blend_checks},
        "rivers": {"pass": len(river_metrics) == 4 and all(v["majorComponents"] == 1 and v["cells"] >= 12 and v["outsideActDilationCells"] == 0 for v in river_metrics.values()), "systems": river_metrics, "act1": "approved v4 Millbrook river reused byte-for-byte in Act 1 raster", "scope": "each Act 2-5 channel stays inside an eighteen-cell dilation of its organic biome"},
        "per-act-v4-interior-richness": {"pass": all(25.0 <= v["matrixPercent"] <= 75.0 and v["fringePercent"] >= 5.0 and v["openPercent"] >= 12.0 and v["basinComponents"] >= 1 for v in interior_metrics.values()), "thresholds": {"matrixPercent": [25.0, 75.0], "minimumFringePercent": 5.0, "minimumOpenPercent": 12.0, "minimumBasinComponents": 1}, "acts2to5": interior_metrics, "act1Authority": "approved v4 raster reused byte-for-byte before the named Crystal neck override"},
    }
    failures = [name for name, check in checks.items() if not check["pass"]]
    report = {"schema": "continent-macro-g2-organic-linters-v1", "genuineAtContinentScale": True, "checks": checks, "result": "PASS" if not failures else "FAIL", "failures": failures}
    return report


def image_from_grid(grid: np.ndarray) -> Image.Image:
    rgb = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    for name in CLASSES:
        rgb[grid == CODE[name]] = RGB[name]
    return Image.fromarray(rgb)


def resize_nearest(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    return image.resize(size, Image.Resampling.NEAREST)


def render_pack(output: Path, grid: np.ndarray, land: np.ndarray, membership: np.ndarray, throats: dict[str, np.ndarray]) -> None:
    logic = image_from_grid(grid)
    logic4 = resize_nearest(logic, (WIDTH * 4, HEIGHT * 4))
    logic4.save(output / "continent-terrain-logic-4x.png", optimize=False, compress_level=9)
    logic.save(output / "terrain-classes-indexed.png", optimize=False, compress_level=9)
    barrier_rgb = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    barrier_rgb[:] = (23, 54, 83)
    barrier_rgb[land & np.isin(grid, list(WALKABLE))] = (196, 190, 156)
    barrier_rgb[land & np.isin(grid, list(BLOCKERS))] = (66, 64, 61)
    barrier_rgb[land & np.isin(grid, [CODE["iceRiver"], CODE["oasisWater"], CODE["lava"], CODE["darkRiver"]])] = (37, 48, 57)
    resize_nearest(Image.fromarray(barrier_rgb), (WIDTH * 4, HEIGHT * 4)).save(output / "continent-barrier-only-4x.png", optimize=False, compress_level=9)
    labeled = logic4.convert("RGBA")
    draw = ImageDraw.Draw(labeled, "RGBA")
    font = ImageFont.load_default()
    act_centers = {1: (68, 375), 2: (238, 360), 3: (272, 190), 4: (263, 24), 5: (28, 18)}
    tint = {1: (75, 160, 70, 38), 2: (180, 225, 240, 44), 3: (230, 185, 75, 40), 4: (190, 70, 45, 40), 5: (65, 45, 78, 46)}
    for act, color in tint.items():
        mask = resize_nearest(Image.fromarray(((membership == act) * 255).astype(np.uint8)), labeled.size)
        wash = Image.new("RGBA", labeled.size, color)
        labeled.alpha_composite(Image.composite(wash, Image.new("RGBA", labeled.size), mask))
        x, y = act_centers[act]
        draw.rectangle((x * 4 - 2, y * 4 - 2, x * 4 + 105, y * 4 + 12), fill=(15, 20, 25, 205))
        draw.text((x * 4, y * 4), ACT_NAMES[act], font=font, fill=(255, 255, 255, 255))
    label_offsets = {
        "Obsidian Cavern": (-96, -14), "Ember Mines": (6, -14),
        "Magma Tunnels": (7, 8), "Volcanic Forge": (7, 7),
        "Crystal Cave": (-82, -14), "Frozen Lake": (-86, -4),
    }
    for name, (_, (x, y), _) in LANDMARKS.items():
        px, py = x * 4, y * 4
        draw.ellipse((px - 3, py - 3, px + 3, py + 3), fill=(255, 235, 110, 255), outline=(20, 20, 20, 255))
        dx, dy = label_offsets.get(name, (5, -5))
        draw.text((px + dx, py + dy), name, font=font, fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(15, 20, 25, 255))
    for name, info in SEPARATORS.items():
        x, y = info["center"]
        px, py = x * 4, y * 4
        draw.rectangle((px - 4, py - 4, px + 4, py + 4), outline=(255, 90, 200, 255), width=2)
        separator_dy = -15 if name in {"Magma Ridge", "Volcanic Pass", "Crystal Range"} else 5
        draw.text((px + 6, py + separator_dy), name, font=font, fill=(255, 130, 220, 255), stroke_width=2, stroke_fill=(15, 20, 25, 255))
    labeled.convert("RGB").save(output / "continent-act-labeled-4x.png", optimize=False, compress_level=9)
    resize_nearest(logic, (WIDTH * 16, HEIGHT * 16)).save(output / "continent-native-16x.png", optimize=False, compress_level=9)
    resize_nearest(logic, (208, 260)).save(output / "continent-phone-208x260.png", optimize=False, compress_level=9)

    sheet = Image.new("RGB", (1280, 960), (20, 24, 29))
    sheet_draw = ImageDraw.Draw(sheet)
    crop_w, crop_h = 135, 90
    for index, (name, info) in enumerate(SEPARATORS.items()):
        cx, cy = info["center"]
        left, top = max(0, cx - crop_w // 2), max(0, cy - crop_h // 2)
        right, bottom = min(WIDTH, left + crop_w), min(HEIGHT, top + crop_h)
        crop = logic.crop((left, top, right, bottom))
        crop = resize_nearest(crop, ((right - left) * 4, (bottom - top) * 4))
        ox, oy = (index % 2) * 640 + 50, (index // 2) * 480 + 68
        sheet.paste(crop, (ox, oy))
        biomes = info["biomes"].replace("→", "to")
        sheet_draw.text((ox, 24 + (index // 2) * 480), f"{name} | Act {info['acts'][0]} to {info['acts'][1]} | {biomes} | 3-cell throat", fill=(255, 255, 255), font=font)
        throat = throats[name]
        ty, tx = np.where(throat)
        if len(tx):
            px = ox + (int(round(tx.mean())) - left) * 4
            py = oy + (int(round(ty.mean())) - top) * 4
            sheet_draw.rectangle((px - 8, py - 8, px + 8, py + 8), outline=(255, 80, 200), width=3)
    sheet.save(output / "separator-closeups-4x.png", optimize=False, compress_level=9)


def write_palette(output: Path) -> None:
    lines = ["# Continent macro terrain-class palette", "", "Seed: 42. `trail`, `bridge`, and all classes marked walkable participate in navigation; every other terrain class blocks movement.", "", "| class | biome/use | walkable | color |", "|---|---|---:|---|" ]
    uses = {
        "water": "ocean/authored channel", "meadow": "Act 1 open ground", "trail": "cross-biome route guidance",
        "lightForest": "Act 1 sparse forest floor", "forest": "Act 1 old growth", "cliff": "ridge flank",
        "mountain": "ridge crest", "structure": "town footprint", "landmarkSolid": "dungeon/portal solid",
        "bridge": "walkable deck", "snow": "Act 2 snowfield", "tundra": "snowline blend",
        "snowForest": "Act 2 dark evergreen", "iceRiver": "Act 2 frozen river", "sand": "Act 3 open desert",
        "aridFoothill": "snow/desert or desert/ridge blend", "duneRock": "Act 3 rock barrier", "oasisWater": "Act 3 wadi/oasis water",
        "ash": "Act 4 ashland", "scorched": "desert/volcanic blend", "obsidian": "Act 4 barrier",
        "lava": "Act 4 lava channel", "charcoal": "Act 5 charcoal earth", "deadGround": "Act 5 open dead ground",
        "deadForest": "Act 5 dead forest", "darkRiver": "Act 5 dark river/moat",
    }
    for name in CLASSES:
        lines.append(f"| `{name}` | {uses[name]} | {'yes' if name in WALKABLE_NAMES else 'no'} | `{PALETTE[name]}` |")
    (output / "class-palette.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def pack_digest(output: Path) -> str:
    digest = hashlib.sha256()
    for name in DETERMINISTIC_FILES:
        digest.update(name.encode("utf-8") + b"\0")
        digest.update((output / name).read_bytes())
    return digest.hexdigest()


def write_data(output: Path, grid: np.ndarray, land: np.ndarray, membership: np.ndarray, protected: np.ndarray, elevation: np.ndarray, throats: dict[str, np.ndarray], rivers: dict[str, np.ndarray], boundary_masks: dict[str, np.ndarray], crest_masks: dict[str, np.ndarray], biome_distribution: dict[str, object], linter: dict[str, object], report: dict[str, object]) -> None:
    np.save(output / "terrain-classes.npy", grid)
    np.save(output / "collision-grid.npy", grid)
    np.save(output / "land-mask.npy", land)
    np.save(output / "act-membership.npy", membership)
    np.save(output / "corridor-skeleton.npy", protected)
    np.save(output / "elevation-field.npy", elevation)
    np.savez_compressed(output / "separator-throats.npz", **{name.replace(" ", "_").lower(): mask for name, mask in throats.items()})
    np.savez_compressed(output / "river-systems.npz", **rivers)
    np.savez_compressed(output / "organic-boundaries.npz", **boundary_masks)
    np.savez_compressed(output / "separator-crests.npz", **crest_masks)
    Image.fromarray((land * 255).astype(np.uint8)).save(output / "land-mask.png", optimize=False, compress_level=9)
    payload = {"schema": "continent-terrain-class-g2-organic-v1", "seed": SEED, "world": {"size": [WIDTH, HEIGHT]}, "classes": list(CLASSES), "walkable": sorted(WALKABLE_NAMES), "grid": grid.tolist()}
    (output / "terrain-classes.json").write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    (output / "biome-distribution.json").write_text(json.dumps(biome_distribution, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (output / "linter-report.json").write_text(json.dumps(linter, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (output / "generator-report.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    write_palette(output)


def build_pack(output: Path) -> dict[str, object]:
    output.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    stages: list[dict[str, object]] = []
    land, membership, coast_stage = build_land(rng)
    stages.append({"stage": 1, "name": "pinned-coast-and-simplex-landmark-biome-fields", "result": "PASS", **coast_stage})
    paths, protected, corridor_stage = build_corridors(land, rng)
    stages.append({"stage": 2, "name": "corridor-first-story-and-intra-act-skeleton", "result": "PASS", **corridor_stage})
    land, moat, moat_bridge = apply_demon_moat(land, paths)
    grid, interior_metrics, boundary_masks = base_terrain(land, membership, protected, rng)
    stages.append({"stage": 3, "name": "five-dense-matrices-lobed-basins-and-mixed-blends", "result": "PASS", "acts2to5": interior_metrics})
    grid, elevation, range_masks, throats, range_metrics, crest_masks = drape_ranges(grid, land, membership, protected, paths, rng)
    stages.append({"stage": 4, "name": "curved-central-spine-shadow-range-and-magma-scarp", "result": "PASS", "ranges": range_metrics})
    grid, river_masks, river_bridges, river_metrics = drape_rivers(grid, land, membership, protected, rng)
    stages.append({"stage": 5, "name": "biome-rivers-draped-around-corridors", "result": "PASS", "rivers": river_metrics})
    grid, act1_hash = overlay_act1_v4(grid)
    grid = place_landmarks_and_trails(grid, land, protected, paths, moat, moat_bridge)
    act1_rect = np.zeros_like(land)
    x0, y0, x1, y1 = ACT1_BOUNDS
    act1_rect[y0:y1 + 1, x0:x1 + 1] = True
    grid[river_bridges & ~act1_rect] = CODE["bridge"]
    stages.append({"stage": 6, "name": "approved-act1-v4-and-landmark-solids", "result": "PASS", "act1V4GridSha256": act1_hash})
    biome_distribution = distribution(grid, membership, land)
    final_interior_metrics = measure_final_interiors(grid, land, membership)
    linter = lint_pack(grid, land, membership, protected, paths, throats, range_masks, range_metrics, river_metrics, final_interior_metrics)
    stages.append({"stage": 7, "name": "genuine-continent-linters-and-connectivity", "result": linter["result"]})
    report = {
        "schema": "continent-macro-g2-organic-v1", "seed": SEED,
        "authorities": ["design/continent-terrain-class-method/CONTINENT-MACRO-GEOGRAPHY-SPEC.md §8", "scripts/build_act1_terrain_class_macro_v4.py", "design/act1-terrain-class-method/G1-geography-spec.md", "edu-rpg/src/data/maps.ts"],
        "stageOrder": [stage["name"] for stage in stages], "stages": stages,
        "landmarks": {name: {"act": act, "position": list(point), "kind": kind} for name, (act, point, kind) in LANDMARKS.items()},
        "sourceCrossCheck": {"probeCount": len(CONNECTION_PROBES), "scorchedRuins": {"ownerPlacement": [171, 133], "staleMapsTsProbePreserved": [278, 82]}},
        "naturalnessSelfVerdict": "Organic landmark-proximity biomes, mixed transition belts, curved variable-width ranges, and v4-style lobed interiors replace the g1 rectangular fields; final acceptance is the rendered and measured linter evidence in this pack.",
    }
    write_data(output, grid, land, membership, protected, elevation, throats, river_masks, boundary_masks, crest_masks, biome_distribution, linter, report)
    render_pack(output, grid, land, membership, throats)
    artifacts = {name: sha256(output / name) for name in DETERMINISTIC_FILES}
    return {"result": linter["result"], "gridSha256": artifacts["terrain-classes.npy"], "stages": stages, "linter": linter, "biomeDistribution": biome_distribution, "artifacts": artifacts}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--verify-determinism", action="store_true")
    args = parser.parse_args()
    if not args.verify_determinism:
        print(json.dumps(build_pack(args.output), indent=2))
        return
    with tempfile.TemporaryDirectory(prefix="continent-g2-a-") as a, tempfile.TemporaryDirectory(prefix="continent-g2-b-") as b:
        build_pack(Path(a))
        build_pack(Path(b))
        hashes = [pack_digest(Path(a)), pack_digest(Path(b))]
    if hashes[0] != hashes[1]:
        fail(f"two-run determinism mismatch: {hashes}")
    result = build_pack(args.output)
    determinism = {"pass": True, "algorithm": "sha256(filename + NUL + bytes for all deterministic pack files)", "files": list(DETERMINISTIC_FILES), "runs": hashes}
    (args.output / "determinism.json").write_text(json.dumps(determinism, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({**result, "determinism": determinism}, indent=2))


if __name__ == "__main__":
    main()
