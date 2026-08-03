#!/usr/bin/env python3
"""Build the corridor-first Act 1 Gate-1 macro terrain pack (seed 42)."""

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

from act1_terrain_class_lib import (
    BLOCKERS,
    BRIDGE_DECKS,
    CODE,
    CRYSTAL_CREST,
    CRYSTAL_GATE,
    DARKFANG_CREST,
    GATEWAYS,
    HEIGHT,
    LANDMARKS,
    RIVER_CREST,
    ROUTES,
    SEED,
    WALKABLE,
    WIDTH,
    coast_distance,
    connected_components,
    distance_to_points,
    distance_to_polyline,
    distribution,
    fbm,
    force_walkable,
    load_land,
    local_to_world,
    neighbors,
    project_to_land,
    reachable,
    sha256,
    wobble_line,
    write_class_artifacts,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = (
    ROOT
    / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2"
    / "act1-terrain-class-g1-v4-corridor-first"
)
DETERMINISTIC_FILES = (
    "basin-membership.npy",
    "bridge-overlay.npy",
    "collision-grid.npy",
    "corridor-skeleton.npy",
    "distribution.json",
    "elevation-field.npy",
    "gateway-throats.npz",
    "generator-report.json",
    "terrain-classes-indexed.png",
    "terrain-classes.json",
    "terrain-classes.npy",
)

# Route controls stay plate-local. Sampled every three cells off an A* run over the
# Act 1 land mask with an inland-preferring cost, because straight interpolation between
# the owner's landmark cells swims across the inland lake and two southern bays, and
# sparse controls let the cardinal fill below hug a coastline instead of a valley.
ROUTE_GUIDES = {
    "greenhollow-to-sunken-cellar": [
        (53, 38), (53, 40), (53, 43), (51, 44), (48, 44), (45, 44), (42, 44),
        (39, 44), (38, 46), (38, 49), (37, 51), (34, 51), (31, 51), (28, 51),
        (25, 51), (22, 51), (19, 51), (16, 51), (14, 52), (14, 55),
    ],
    "greenhollow-to-whispering-woods-cave": [
        (53, 38), (55, 38), (57, 37), (57, 34), (57, 31), (57, 28), (59, 27),
        (61, 26), (63, 25), (64, 23), (67, 23), (69, 22), (71, 21), (73, 20),
        (76, 20), (79, 20), (82, 20), (85, 20), (85, 17), (85, 16),
    ],
    # The three ford cells are explicit controls: the authored river reserve is the
    # only hole in `allowed` on this corridor, so the fill must enter it at the deck.
    "greenhollow-to-millbrook": [
        (53, 38), (54, 39), (55, 41), (57, 42), (57, 45), (57, 48), (57, 51),
        (55, 52), (52, 52), (49, 52), (46, 52), (44, 53), (44, 56), (41, 56),
        (38, 56), (36, 57), (34, 58), (33, 60), (31, 61), (30, 63), (32, 64),
        (35, 64), (36, 66), (36, 69), (36, 72), (36, 75), (36, 78), (36, 81),
        (36, 84), (33, 84), (30, 84), (29, 86), (28, 88), (26, 89), (24, 90),
        (23, 92), (23, 94), (23, 95), (23, 96), (23, 98), (23, 101), (23, 104),
        (24, 106), (24, 109), (24, 112), (24, 115), (24, 118), (26, 119),
        (24, 120), (23, 122), (23, 125),
    ],
    "millbrook-to-port-sapphire": [
        (23, 125), (25, 125), (27, 126), (27, 129), (30, 129), (33, 129),
        (36, 129), (39, 129), (42, 129), (45, 129), (48, 129), (51, 129),
        (54, 129), (57, 129), (58, 131), (61, 131), (64, 131), (67, 131),
        (70, 131), (73, 131), (76, 131), (79, 131), (81, 130), (84, 130),
        (87, 130), (89, 129), (91, 128), (94, 128), (97, 128), (100, 128),
        (103, 128), (104, 130), (107, 130), (110, 130), (111, 128), (114, 128),
        (117, 128),
    ],
    # (124,126) and (125,126) are the reef spit's only two mainland contacts. The
    # corridor takes the first so the harbor channel can cut the second.
    "port-sapphire-to-coastal-reef": [
        (117, 128), (119, 128), (120, 126), (122, 125), (124, 126), (124, 127),
        (124, 129), (125, 131), (126, 133),
    ],
    "port-sapphire-to-darkfang": [
        (117, 128), (116, 129), (115, 131), (113, 132), (111, 133), (109, 134),
        (108, 136), (105, 136), (103, 137), (101, 138), (99, 139), (98, 141),
        (97, 143), (96, 145), (96, 148), (95, 150), (92, 150), (89, 150),
        (86, 150), (83, 150), (80, 150), (77, 150), (75, 151), (75, 154),
        (75, 157), (75, 159),
    ],
    "port-sapphire-to-crystal-cave": [
        (117, 128), (117, 126), (118, 124), (121, 124), (122, 122), (122, 119),
        (122, 116), (122, 113), (122, 110), (122, 107), (121, 105), (118, 105),
        (115, 105), (112, 105), (113, 103), (113, 100), (113, 97), (113, 94),
        (113, 91), (116, 91), (119, 91), (120, 89), (120, 86), (120, 83),
        (120, 80), (120, 77), (120, 74), (119, 72), (117, 72), (117, 71),
        (117, 68), (117, 65), (118, 63), (119, 61), (122, 61), (124, 61),
    ],
}


def fail(message: str) -> None:
    raise RuntimeError(f"STAGE CHECK FAILED: {message}")


def pack_digest(output: Path) -> str:
    digest = hashlib.sha256()
    for name in DETERMINISTIC_FILES:
        digest.update(name.encode("utf-8") + b"\0")
        digest.update((output / name).read_bytes())
    return digest.hexdigest()


def raster_path(
    allowed: np.ndarray,
    start: tuple[int, int],
    end: tuple[int, int],
    guide: list[tuple[int, int]],
    noise: np.ndarray,
) -> list[tuple[int, int]]:
    """Cardinal least-cost path biased to a curved authored guide."""
    guide_distance = distance_to_polyline([(float(x), float(y)) for x, y in guide])
    sx, sy = start
    ex, ey = end
    queue: list[tuple[float, int, int]] = [(0.0, sy, sx)]
    best = {(sx, sy): 0.0}
    previous: dict[tuple[int, int], tuple[int, int] | None] = {(sx, sy): None}
    while queue:
        score, y, x = heapq.heappop(queue)
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
            candidate = score + 1.0 + 0.11 * float(guide_distance[ny, nx]) + 0.17 * (float(noise[ny, nx]) + 1.0)
            if candidate < best.get((nx, ny), math.inf):
                best[(nx, ny)] = candidate
                previous[(nx, ny)] = (x, y)
                heapq.heappush(queue, (candidate, ny, nx))
    fail(f"no land path from {start} to {end}")


def stage_connected_skeleton(
    land: np.ndarray, rng: np.random.Generator
) -> tuple[dict[str, list[tuple[int, int]]], np.ndarray, dict[str, object]]:
    """Build all seven explicit walkable routes before any blocker exists."""
    # Reserve the authored river valley before routing so no story corridor
    # crosses it accidentally. The only cross-river controls restored below are
    # the fixed bridge deck and Millbrook's dry threshold on the east bank.
    river_reserve = distance_to_polyline([(float(x), float(y)) for x, y in RIVER_CREST]) <= 1.45
    allowed = land & ~river_reserve
    for cells in BRIDGE_DECKS.values():
        for x, y in cells:
            allowed[y, x] = True
    for controls in ROUTE_GUIDES.values():
        for x, y in controls:
            if land[y, x] or (x, y) in BRIDGE_DECKS["port-reef-causeway"]:
                allowed[y, x] = True
        guide_cells = distance_to_polyline([(float(x), float(y)) for x, y in controls]) <= 0.55
        allowed |= guide_cells & land
    noise = fbm(land.shape, rng)
    paths: dict[str, list[tuple[int, int]]] = {}
    protected = np.zeros_like(land)
    for name, controls in ROUTE_GUIDES.items():
        whole: list[tuple[int, int]] = []
        for a, b in zip(controls, controls[1:]):
            piece = raster_path(allowed, a, b, [a, b], noise)
            whole.extend(piece if not whole else piece[1:])
        paths[name] = whole
        for x, y in whole:
            protected[y, x] = True
    for info in LANDMARKS.values():
        for x, y in (info["at"], info["approach"]):
            protected[y, x] = True
    for x, y in [CRYSTAL_GATE, *BRIDGE_DECKS["greenhollow-millbrook-bridge"],
                 *BRIDGE_DECKS["port-reef-causeway"]]:
        protected[y, x] = True
    proof_grid = np.full(land.shape, CODE["forest"], dtype=np.uint8)
    proof_grid[~land] = CODE["water"]
    proof_grid[protected] = CODE["meadow"]
    for cells in BRIDGE_DECKS.values():
        for x, y in cells:
            proof_grid[y, x] = CODE["bridge"]
    route_proof = {
        name: {
            "reachable": reachable(proof_grid, points[0], points[-1]),
            "explicitCorridorCells": len(paths[name]),
        }
        for name, points in ROUTES.items()
    }
    if not all(item["reachable"] for item in route_proof.values()):
        fail("the pre-barrier corridor skeleton is not connected")
    return paths, protected, {
        "check": "all seven explicit corridors connect before barriers",
        "routes": route_proof,
        "protectedCells": int(protected.sum()),
        "result": "PASS",
    }


def nearest_coast(land: np.ndarray, hint: tuple[int, int]) -> tuple[int, int]:
    coast = coast_distance(land)
    yy, xx = np.indices(land.shape)
    score = (xx - hint[0]) ** 2 + (yy - hint[1]) ** 2 + np.where(coast == 1, 0, 1_000_000)
    y, x = np.unravel_index(np.argmin(score), score.shape)
    return int(x), int(y)


def stage_barriers(
    land: np.ndarray, protected: np.ndarray, rng: np.random.Generator
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, dict[str, object]]:
    """Drape elongated ranges, gradient cliffs, and one river around corridors."""
    crystal = wobble_line(CRYSTAL_CREST, rng, 1.25)
    darkfang = wobble_line(DARKFANG_CREST, rng, 1.35)
    dc = distance_to_polyline(crystal)
    dn = distance_to_polyline(darkfang)
    coast = coast_distance(land).astype(float)
    noise = fbm(land.shape, rng)
    elevation = 0.08 + 0.10 * noise
    elevation += 0.94 * np.exp(-(dc / 9.4) ** 2)
    elevation += 0.86 * np.exp(-(dn / 8.5) ** 2)
    elevation -= 0.16 * np.exp(-(coast / 4.0) ** 2)
    for point, radius, depth in [
        (LANDMARKS["Darkfang Grotto"]["at"], 5.5, 0.75),
        ((85, 150), 3.6, 0.88),
        (CRYSTAL_GATE, 3.6, 1.04),
    ]:
        elevation -= depth * np.exp(-(distance_to_points([point]) / radius) ** 2)
    elevation[~land] = -1.0
    values = elevation[land]
    mountain_cut = float(np.quantile(values, 0.915))
    cliff_floor = float(np.quantile(values, 0.79))
    mountain = land & (elevation >= mountain_cut)
    gy, gx = np.gradient(elevation)
    slope = np.hypot(gx, gy)
    cliff = land & ~mountain & (elevation >= cliff_floor)
    cliff &= slope >= np.quantile(slope[land], 0.61)
    cliff &= fbm(land.shape, rng) > -0.38
    yy, xx = np.indices(land.shape)
    cliff &= np.sin(xx * 0.91 + yy * 1.13) > -0.93

    # Intermittent south-coast cliffs occur only where land rises sharply from sea.
    coastal = land & (coast <= 2) & (yy >= 126) & (fbm(land.shape, rng) > 0.08)
    coastal &= ((xx + 2 * yy) % 7 != 0)
    cliff |= coastal & ~mountain

    deck = np.zeros_like(land)
    for x, y in BRIDGE_DECKS["greenhollow-millbrook-bridge"]:
        deck[y, x] = True
    projected = [project_to_land(land, point) for point in RIVER_CREST]
    projected[-1] = nearest_coast(land, RIVER_CREST[-1])
    # The ford is a mandatory run of river controls between the x=34 and x=16 crest
    # controls, so the channel dips south through all three deck cells instead of
    # clipping one of them. River routing excludes every other protected route cell.
    river_controls = projected[:4] + list(BRIDGE_DECKS["greenhollow-millbrook-bridge"]) + projected[5:]
    # Existing snapshot water is a valid continuation of the same channel.
    # Allowing the centerline across it keeps the river on the authored meander
    # instead of forcing a long land detour around an immutable inlet.
    river_allowed = np.ones_like(land) & ~protected
    river_allowed |= deck
    river_noise = fbm(land.shape, rng)
    river_path: list[tuple[int, int]] = []
    for a, b in zip(river_controls, river_controls[1:]):
        piece = raster_path(river_allowed, a, b, [a, b], river_noise)
        river_path.extend(piece if not river_path else piece[1:])
    raw_river = np.zeros_like(land)
    for x, y in river_path:
        raw_river[y, x] = True
        # Occasional single-bank widening produces a 1-2 cell channel without
        # a parallel second line.
        candidates = [(nx, ny) for nx, ny in neighbors(x, y)
                      if 0 <= nx < WIDTH and 0 <= ny < HEIGHT and land[ny, nx]
                      and not protected[ny, nx]]
        if candidates and river_noise[y, x] > 0.28:
            nx, ny = max(candidates, key=lambda point: river_noise[point[1], point[0]])
            raw_river[ny, nx] = True
    extra_crossings = raw_river & protected & ~deck
    # The route skeleton has priority. Removing a rare raster overlap is safe only
    # when the remaining river still forms one source-to-mouth component.
    river = raw_river & ~protected
    river |= deck
    mountain &= ~protected
    cliff &= ~protected
    cliff &= ~mountain
    overlap = protected & (river | mountain | cliff) & ~deck
    if overlap.any():
        fail("a barrier overwrote protected corridor cells")
    if not all(river[y, x] for x, y in BRIDGE_DECKS["greenhollow-millbrook-bridge"]):
        fail("river missed the fixed Greenhollow-Millbrook bridge deck")
    river_components = [c for c in connected_components(river) if len(c) >= 8]
    if len(river_components) != 1:
        fail(f"river is not one continuous channel ({len(river_components)} major components)")
    return elevation, mountain, cliff, river, {
        "check": "ranges/gradient cliffs/one meander avoid the protected skeleton",
        "mountainThreshold": mountain_cut,
        "cliffThreshold": cliff_floor,
        "riverOutlet": list(projected[-1]),
        "rawRiverCorridorOverlapsRerouted": int(extra_crossings.sum()),
        "barrierCorridorOverlaps": int(overlap.sum()),
        "riverMajorComponents": len(river_components),
        "result": "PASS",
    }


def noisy_lobe(
    anchors: list[tuple[int, int, float]], noise: np.ndarray, strength: float
) -> np.ndarray:
    fields = [radius - np.hypot(*np.ogrid[-y:HEIGHT-y, -x:WIDTH-x]) for x, y, radius in anchors]
    return np.maximum.reduce(fields) + strength * noise


def stage_basins(
    land: np.ndarray,
    protected: np.ndarray,
    mountain: np.ndarray,
    cliff: np.ndarray,
    river: np.ndarray,
    rng: np.random.Generator,
) -> tuple[np.ndarray, np.ndarray, dict[str, object]]:
    """Carve three lobed roaming basins from the old-growth matrix."""
    base = np.full(land.shape, CODE["water"], dtype=np.uint8)
    base[land] = CODE["forest"]
    base[mountain] = CODE["mountain"]
    base[cliff] = CODE["cliff"]
    base[river] = CODE["water"]
    noise = fbm(land.shape, rng)
    # 1 = Greenhollow (north of the river), 2 = Millbrook (south-west),
    # 3 = Port Sapphire (south-east). Anchors stay clear of the three named throats at
    # (70,124), (85,148) and CRYSTAL_GATE, so each throat sits in old growth and stays a
    # real cut-set rather than a label inside a basin.
    specs = {
        1: [(53, 37, 26.0), (20, 52, 15.0), (60, 22, 13.0), (33, 62, 15.0), (40, 80, 12.0)],
        2: [(23, 126, 20.0), (32, 110, 13.0), (40, 130, 14.0), (18, 138, 10.0)],
        3: [(117, 129, 17.0), (105, 127, 13.0), (118, 110, 12.0), (110, 136, 12.0)],
    }
    scores = {index: noisy_lobe(anchors, fbm(land.shape, rng), 3.0) for index, anchors in specs.items()}
    membership = np.zeros(land.shape, dtype=np.uint8)
    available = land & ~mountain & ~cliff & ~river
    for index, score in scores.items():
        region = available & (score >= -2.3)
        take = region & ((membership == 0) | (score > np.choose(membership, [np.full_like(score, -999), scores[1], scores[2], scores[3]])))
        membership[take] = index
    # River is the complete north/south separator on the western lobe; basin cells
    # cannot leak across it. The river runs east-west, so the split is per column.
    for x in range(0, 72):
        ys = np.where(river[:, x])[0]
        if ys.size:
            split = int(np.median(ys))
            above = membership[: max(0, split - 1), x]
            above[above == 2] = 0
            below = membership[min(HEIGHT, split + 2):, x]
            below[below == 1] = 0
    inner = np.zeros_like(land)
    fringe = np.zeros_like(land)
    for index, score in scores.items():
        inner |= (membership == index) & (score >= 1.2)
        fringe |= (membership == index) & ~inner
    base[fringe] = CODE["lightForest"]
    base[inner] = CODE["meadow"]
    # The Millbrook floodplain follows the river's south bank but never turns it into
    # a ford.
    river_distance = distance_to_polyline([(float(x), float(y)) for x, y in RIVER_CREST])
    floodplain = (
        available & (river_distance <= 4.8 + 0.8 * noise)
        & (np.indices(land.shape)[1] <= 56) & (np.indices(land.shape)[0] >= 93)
    )
    base[floodplain] = CODE["meadow"]
    membership[floodplain] = 2
    # A broad, noise-displaced old-growth watershed separates the Millbrook
    # floodplain from the Port basin. The pre-authored route is the only valley
    # floor through it, so the named pass is a real aperture rather than a label.
    # It runs from the inland lake's southern shore to the south-west coast, which
    # keeps the Darkfang corridor entirely on the Port side of it.
    divide = distance_to_polyline([
        (74, 118), (72, 126), (70, 132), (64, 144), (58, 152), (54, 158),
    ])
    wooded_watershed = available & (divide <= 3.4 + 1.1 * fbm(land.shape, rng)) & ~protected
    base[wooded_watershed] = CODE["forest"]
    membership[wooded_watershed] = 0
    # A tapered old-growth inlet creates Greenhollow's characteristic western
    # lobe/notch without blocking any of its three protected story routes.
    vale_inlet_distance = distance_to_polyline([
        (11, 44), (19, 48), (26, 44), (32, 50), (28, 58), (34, 64),
    ])
    vale_inlet_width = 3.4 + 1.5 * fbm(land.shape, rng) + 0.8 * np.sin(
        np.indices(land.shape)[1] * 0.31 + np.indices(land.shape)[0] * 0.17
    )
    vale_inlet = (
        available & (membership == 1) & ~protected
        & (vale_inlet_distance <= vale_inlet_width)
    )
    base[vale_inlet] = CODE["forest"]
    membership[vale_inlet] = 0
    # Corridors were authored first and stay explicit open ground after draping.
    base[protected & land] = CODE["lightForest"]
    for info in LANDMARKS.values():
        force_walkable(base, [info["at"], info["approach"]], "meadow")
    return base, membership, {
        "check": "three noise-lobed basins carved from the forest matrix around protected corridors",
        "basinCells": {str(i): int((membership == i).sum()) for i in specs},
        "result": "PASS",
    }


def nearest_path_slice(path: list[tuple[int, int]], center: tuple[int, int], count: int) -> list[tuple[int, int]]:
    index = min(range(len(path)), key=lambda i: (path[i][0] - center[0]) ** 2 + (path[i][1] - center[1]) ** 2)
    start = max(0, min(len(path) - count, index - count // 2))
    return path[start:start + count]


def stage_formations(
    grid: np.ndarray,
    land: np.ndarray,
    paths: dict[str, list[tuple[int, int]]],
    protected: np.ndarray,
) -> tuple[np.ndarray, dict[str, np.ndarray], np.ndarray, dict[str, object]]:
    """Materialize narrow pass/deck formations on the already-connected tree."""
    masks: dict[str, np.ndarray] = {}
    definitions = {
        "millbrook-port-pass": ("millbrook-to-port-sapphire", (70, 131), 3),
        "port-darkfang-gap": ("port-sapphire-to-darkfang", (85, 150), 3),
        "port-crystal-seal-gate": ("port-sapphire-to-crystal-cave", CRYSTAL_GATE, 3),
    }
    for gateway, (route, center, count) in definitions.items():
        cells = nearest_path_slice(paths[route], center, count)
        mask = np.zeros_like(land)
        for x, y in cells:
            mask[y, x] = True
            grid[y, x] = CODE["meadow"]
        masks[gateway] = mask
    bridge = np.zeros_like(land)
    bridge[95, 23] = True
    masks["greenhollow-millbrook-bridge"] = bridge
    reef_deck = np.zeros_like(land)
    reef_deck[126, 124] = True
    masks["port-reef-causeway"] = reef_deck

    overlay = np.zeros_like(land)
    for cells in BRIDGE_DECKS.values():
        for x, y in cells:
            grid[y, x] = CODE["bridge"]
            overlay[y, x] = True

    # A narrow harbor channel makes the fixed Reef deck a real bridge. The reef spit
    # touches the mainland only at (124,126) and (125,126); the route takes the first,
    # so cutting the second leaves the deck as the single crossing. It may overwrite
    # only the Port-Reef route at that deck.
    yy, xx = np.indices(land.shape)
    channel_line = distance_to_polyline([(118, 132), (120, 130), (122, 128), (124, 127), (125, 126), (127, 125)])
    channel = land & (channel_line <= 0.72 + 0.18 * np.sin(xx * 0.7 + yy * 0.4))
    channel &= ~protected
    channel[126, 124] = True
    grid[channel] = CODE["water"]
    grid[126, 124] = CODE["bridge"]
    overlay[126, 124] = True

    # Reef dry shelf and cave approach remain a one-ended natural spur.
    shelf = distance_to_points([(125, 130), (126, 133)]) <= 2.2
    grid[shelf & land & ~channel] = CODE["meadow"]
    for x, y in paths["port-sapphire-to-coastal-reef"]:
        if land[y, x] and not channel[y, x]:
            grid[y, x] = CODE["lightForest"]
    grid[126, 124] = CODE["bridge"]
    return grid, masks, overlay, {
        "check": "five narrow named formations placed on corridor cut-sets",
        "throatCells": {name: int(mask.sum()) for name, mask in masks.items()},
        "result": "PASS",
    }


def stage_landmarks(
    grid: np.ndarray, land: np.ndarray, protected: np.ndarray
) -> tuple[np.ndarray, dict[str, object]]:
    for info in LANDMARKS.values():
        x, y = info["at"]
        approach = info["approach"]
        if info["kind"] == "town":
            offsets = [(-2, -1), (-1, -2), (0, -2), (1, -1), (2, 0), (1, 1), (-1, 1)]
            code = CODE["structure"]
        else:
            offsets = [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)]
            code = CODE["landmarkSolid"]
        opening = (int(np.sign(approach[0] - x)), int(np.sign(approach[1] - y)))
        for dx, dy in offsets:
            px, py = x + dx, y + dy
            if (dx, dy) == opening or (px, py) in {info["at"], approach}:
                continue
            if (0 <= px < WIDTH and 0 <= py < HEIGHT and land[py, px]
                    and not protected[py, px]):
                grid[py, px] = code
        force_walkable(grid, [info["at"], approach], "meadow")
    return grid, {"check": "all eight at/approach probes stay walkable after solids", "result": "PASS"}


def path_proof(grid: np.ndarray, start: tuple[int, int], end: tuple[int, int]) -> dict[str, object]:
    queue = deque([start])
    previous: dict[tuple[int, int], tuple[int, int] | None] = {start: None}
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
                    and int(grid[ny, nx]) in WALKABLE):
                previous[(nx, ny)] = (x, y)
                queue.append((nx, ny))
    return {"pass": False, "shortestPathCells": None, "visitedWalkableCells": len(previous)}


def stage_assert_connectivity(
    grid: np.ndarray, masks: dict[str, np.ndarray]
) -> tuple[dict[str, object], dict[str, object]]:
    routes = {
        name: path_proof(grid, points[0], points[-1])
        for name, points in ROUTES.items()
    }
    gateways = {}
    for name, info in GATEWAYS.items():
        cut = grid.copy()
        cut[masks[name]] = CODE["forest"]
        gateways[name] = {
            "cells": int(masks[name].sum()),
            "soleAperture": not reachable(cut, info["a"], info["b"]),
        }
    if not all(item["pass"] for item in routes.values()):
        failed = [name for name, item in routes.items() if not item["pass"]]
        fail(f"final walkable union disconnected routes: {failed}")
    if not all(item["soleAperture"] for item in gateways.values()):
        failed = [name for name, item in gateways.items() if not item["soleAperture"]]
        fail(f"gateway is not a sole aperture: {failed}")
    return routes, gateways


def paint_trails(
    class_grid: np.ndarray,
    collision_grid: np.ndarray,
    paths: dict[str, list[tuple[int, int]]],
    rng: np.random.Generator,
) -> tuple[np.ndarray, dict[str, object]]:
    painted = class_grid.copy()
    for path in paths.values():
        for x, y in path:
            if painted[y, x] in WALKABLE and painted[y, x] != CODE["bridge"]:
                painted[y, x] = CODE["trail"]
    # Settlement/dungeon aprons meet the trail bucket without widening the
    # seven one-cell story roads or changing collision.
    target = math.ceil(int(load_land().sum()) * 0.06)
    noise = fbm(painted.shape, rng)
    walkable = np.isin(collision_grid, list(WALKABLE))
    yy, xx = np.indices(painted.shape)
    apron_score = np.full(painted.shape, -999.0)
    for info in LANDMARKS.values():
        x, y = info["approach"]
        radius = 10.0 if info["kind"] == "town" else 5.0
        apron_score = np.maximum(apron_score, radius - np.hypot(xx - x, yy - y) + 2.4 * noise)
    candidates = [
        (float(apron_score[y, x]), x, y)
        for y in range(HEIGHT)
        for x in range(WIDTH)
        if walkable[y, x] and painted[y, x] in {CODE["meadow"], CODE["lightForest"]}
        and apron_score[y, x] > 0
    ]
    for _, x, y in sorted(candidates, reverse=True):
        if int((painted == CODE["trail"]).sum()) >= target:
            break
        painted[y, x] = CODE["trail"]
    if int((painted == CODE["trail"]).sum()) < target:
        fail("organic landmark aprons could not meet the trail distribution floor")
    return painted, {
        "check": "one-cell terrain-following roads plus noise-lobed landmark aprons",
        "trailCells": int((painted == CODE["trail"]).sum()),
        "collisionChanged": bool(np.any(np.isin(painted, list(WALKABLE)) != np.isin(collision_grid, list(WALKABLE)))),
        "result": "PASS",
    }


def balance_distribution(
    grid: np.ndarray,
    land: np.ndarray,
    protected: np.ndarray,
    rng: np.random.Generator,
) -> np.ndarray:
    """Move only remote interior cells; never touch a route, gate, or coastline."""
    result = grid.copy()
    noise = fbm(grid.shape, rng)
    target_forest = math.ceil(int(land.sum()) * 0.42)
    target_open = math.ceil(int(land.sum()) * 0.28) + 40
    remote = []
    for y in range(1, HEIGHT - 1):
        for x in range(1, WIDTH - 1):
            if protected[y, x]:
                continue
            if result[y, x] in {CODE["meadow"], CODE["lightForest"]}:
                remote.append((float(noise[y, x]), x, y))
    for _, x, y in sorted(remote):
        if int((result == CODE["forest"]).sum()) >= target_forest:
            break
        result[y, x] = CODE["forest"]
    interiors = []
    for y in range(1, HEIGHT - 1):
        for x in range(1, WIDTH - 1):
            if result[y, x] == CODE["forest"] and not protected[y, x]:
                same = sum(result[ny, nx] == CODE["forest"] for nx, ny in neighbors(x, y))
                if same == 4:
                    interiors.append((float(noise[y, x]), x, y))
    for _, x, y in sorted(interiors, reverse=True):
        if int((result == CODE["meadow"]).sum()) >= target_open:
            break
        result[y, x] = CODE["meadow"]
    return result


def roughen_blocker_components(
    grid: np.ndarray, protected: np.ndarray, rng: np.random.Generator
) -> tuple[np.ndarray, int]:
    """Erode rectangular blocker copses without touching protected routes."""
    result = grid.copy()
    noise = fbm(grid.shape, rng)
    changed = 0
    for _ in range(12):
        bad = []
        for component in connected_components(np.isin(result, list(BLOCKERS))):
            if len(component) < 12:
                continue
            xs, ys = zip(*component)
            area = (max(xs) - min(xs) + 1) * (max(ys) - min(ys) + 1)
            if len(component) / area >= 0.7:
                bad.append((component, area))
        if not bad:
            break
        progress = False
        for component, area in bad:
            candidates = []
            component_set = set(component)
            for x, y in component:
                if protected[y, x]:
                    continue
                boundary = sum((nx, ny) not in component_set for nx, ny in neighbors(x, y))
                if boundary:
                    candidates.append((boundary + float(noise[y, x]), x, y))
            remaining = len(component)
            for _, x, y in sorted(candidates, reverse=True):
                if remaining / area < 0.62:
                    break
                result[y, x] = CODE["lightForest"]
                remaining -= 1
                changed += 1
                progress = True
        if not progress:
            break
    return result, changed


def jitter_long_boundaries(
    grid: np.ndarray, land: np.ndarray, protected: np.ndarray
) -> tuple[np.ndarray, int, int]:
    """Break >3-cell straight class edges while preserving walkability."""
    result = grid.copy()
    object_codes = {CODE["structure"], CODE["landmarkSolid"]}
    blocker_alternates = {
        CODE["forest"]: CODE["cliff"],
        CODE["cliff"]: CODE["mountain"],
        CODE["mountain"]: CODE["cliff"],
    }
    walk_alternates = {
        CODE["meadow"]: CODE["lightForest"],
        CODE["lightForest"]: CODE["meadow"],
        CODE["trail"]: CODE["lightForest"],
        CODE["bridge"]: CODE["meadow"],
    }
    changes = 0
    maximum = 0
    for _ in range(24):
        runs: list[list[tuple[tuple[int, int], tuple[int, int]]]] = []
        maximum = 0
        for horizontal in (True, False):
            outer = HEIGHT if horizontal else WIDTH
            inner = WIDTH - 1 if horizontal else HEIGHT - 1
            for outer_i in range(outer):
                current: list[tuple[tuple[int, int], tuple[int, int]]] = []
                prior = None
                for inner_i in range(inner):
                    y, x = (outer_i, inner_i) if horizontal else (inner_i, outer_i)
                    ny, nx = (y, x + 1) if horizontal else (y + 1, x)
                    pair = tuple(sorted((int(result[y, x]), int(result[ny, nx]))))
                    active = (
                        land[y, x] and land[ny, nx] and pair[0] != pair[1]
                        and not ({int(result[y, x]), int(result[ny, nx])} & object_codes)
                    )
                    if active and pair == prior:
                        current.append(((x, y), (nx, ny)))
                    else:
                        if len(current) > 3:
                            runs.append(current)
                        maximum = max(maximum, len(current))
                        current = [((x, y), (nx, ny))] if active else []
                        prior = pair if active else None
                if len(current) > 3:
                    runs.append(current)
                maximum = max(maximum, len(current))
        if not runs:
            return result, changes, maximum
        progress = False
        for run in runs:
            a, b = run[len(run) // 2]
            candidates = [a, b]
            candidates.sort(key=lambda point: (
                protected[point[1], point[0]],
                int(result[point[1], point[0]]) == CODE["water"],
                int(result[point[1], point[0]]) == CODE["trail"],
            ))
            for x, y in candidates:
                if protected[y, x]:
                    continue
                code = int(result[y, x])
                replacement = blocker_alternates.get(code, walk_alternates.get(code))
                if replacement is None:
                    continue
                result[y, x] = replacement
                changes += 1
                progress = True
                break
        if not progress:
            break
    return result, changes, maximum


def build_pack(output: Path) -> dict[str, object]:
    output.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    land = load_land()
    stages: list[dict[str, object]] = [{
        "stage": 1,
        "name": "runtime-land-mask",
        "landCells": int(land.sum()),
        "check": "water iff ACT1_RUNTIME_SNAPSHOT_ROWS cell is 2",
        "result": "PASS",
    }]
    paths, protected, check = stage_connected_skeleton(land, rng)
    stages.append({"stage": 2, "name": "connected-basin-corridor-skeleton", **check})
    elevation, mountain, cliff, river, check = stage_barriers(land, protected, rng)
    stages.append({"stage": 3, "name": "barriers-draped-around-skeleton", **check})
    grid, memberships, check = stage_basins(land, protected, mountain, cliff, river, rng)
    stages.append({"stage": 4, "name": "forest-matrix-and-lobed-basins", **check})
    grid, gateway_masks, overlay, check = stage_formations(grid, land, paths, protected)
    stages.append({"stage": 5, "name": "narrow-natural-formations", **check})
    grid, check = stage_landmarks(grid, land, protected)
    stages.append({"stage": 6, "name": "landmark-solids", **check})
    collision_grid = grid.copy()
    collision_grid[overlay] = CODE["bridge"]
    route_proofs, gateway_proofs = stage_assert_connectivity(collision_grid, gateway_masks)
    stages.append({
        "stage": 7,
        "name": "pre-render-connectivity-assertion",
        "check": "seven flood-fill route proofs and five cut-set proofs",
        "routes": route_proofs,
        "gateways": gateway_proofs,
        "result": "PASS",
    })
    grid, check = paint_trails(grid, collision_grid, paths, rng)
    stages.append({"stage": 8, "name": "terrain-following-trails", **check})
    grid = balance_distribution(grid, land, protected, rng)
    grid, roughened = roughen_blocker_components(grid, protected, rng)
    grid, jittered, remaining_axis_run = jitter_long_boundaries(grid, land, protected)
    stages.append({
        "stage": 9,
        "name": "organic-boundary-finish",
        "check": "rectangular blocker copses eroded and straight class edges noise-broken",
        "blockerCellsAdjusted": roughened,
        "boundaryCellsAdjusted": jittered,
        "remainingMaximumAxisRun": remaining_axis_run,
        "result": "PASS" if remaining_axis_run <= 3 else "FAIL",
    })
    if remaining_axis_run > 3:
        fail(f"axis-aligned boundary run remains {remaining_axis_run} cells")
    # Distribution balancing is collision-sensitive, so prove routes again.
    final_nav = grid.copy()
    final_nav[overlay] = CODE["bridge"]
    final_route_proofs, final_gateway_proofs = stage_assert_connectivity(final_nav, gateway_masks)
    stages.append({
        "stage": 10,
        "name": "final-connectivity-reassertion",
        "check": "all seven routes remain connected after balancing",
        "routes": final_route_proofs,
        "gateways": final_gateway_proofs,
        "result": "PASS",
    })
    np.save(output / "basin-membership.npy", memberships)
    np.savez_compressed(output / "gateway-throats.npz", **gateway_masks)
    np.save(output / "bridge-overlay.npy", overlay)
    np.save(output / "collision-grid.npy", final_nav)
    np.save(output / "corridor-skeleton.npy", protected)
    np.save(output / "elevation-field.npy", elevation)
    hashes = write_class_artifacts(grid, output)
    for name in ("basin-membership.npy", "gateway-throats.npz", "bridge-overlay.npy", "collision-grid.npy", "corridor-skeleton.npy", "elevation-field.npy"):
        hashes[name] = sha256(output / name)
    dist = distribution(grid, land)
    (output / "distribution.json").write_text(json.dumps(dist, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    report = {
        "schema": "act1-terrain-class-g1-corridor-first-v4",
        "seed": SEED,
        "landWaterAuthority": {
            "path": "src/map-engine/generated/act1RuntimeSnapshot.ts",
            "rule": "ocean water iff ACT1_RUNTIME_SNAPSHOT_ROWS[y][x] === '2'; authored river/channel are named overrides",
        },
        "stageOrder": [stage["name"] for stage in stages],
        "stages": stages,
        "landmarks": {
            name: {key: list(local_to_world(value)) for key, value in info.items() if key in {"at", "approach"}}
            for name, info in LANDMARKS.items()
        },
        "artifacts": hashes,
    }
    (output / "generator-report.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return {"gridSha256": hashes["terrain-classes.npy"], "stages": stages, "distribution": dist}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--verify-determinism", action="store_true")
    args = parser.parse_args()
    if not args.verify_determinism:
        print(json.dumps(build_pack(args.output), indent=2))
        return
    with tempfile.TemporaryDirectory(prefix="act1-g1-v4-a-") as a, tempfile.TemporaryDirectory(prefix="act1-g1-v4-b-") as b:
        build_pack(Path(a))
        build_pack(Path(b))
        hashes = [pack_digest(Path(a)), pack_digest(Path(b))]
    if hashes[0] != hashes[1]:
        fail(f"two-run determinism mismatch: {hashes}")
    result = build_pack(args.output)
    determinism = {
        "pass": True,
        "algorithm": "sha256(filename + NUL + bytes for all generator-owned deterministic artifacts)",
        "files": list(DETERMINISTIC_FILES),
        "runs": hashes,
    }
    (args.output / "determinism.json").write_text(json.dumps(determinism, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({**result, "determinism": determinism}, indent=2))


if __name__ == "__main__":
    main()
