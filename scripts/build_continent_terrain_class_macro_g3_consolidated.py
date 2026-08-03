#!/usr/bin/env python3
"""Build the seed-42 consolidated organic continent macro g3 review pack."""

from __future__ import annotations

import argparse
from collections import deque
import json
import math
from pathlib import Path
import tempfile
from typing import NamedTuple

import numpy as np
from PIL import Image, ImageDraw, ImageFont

import build_continent_terrain_class_macro_g2_organic as g2
from act1_terrain_class_lib import load_land as load_act1_land
from build_act1_terrain_class_macro_v4 import ROUTE_GUIDES as ACT1_LOCAL_ROUTE_GUIDES


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "design/review/overworld-art-blueprint/continent/continent-macro-g3"
WIDTH, HEIGHT, SEED = g2.WIDTH, g2.HEIGHT, g2.SEED
ACT1_BOUNDS = g2.ACT1_BOUNDS
DETERMINISTIC_FILES = g2.DETERMINISTIC_FILES

# These bands are the geologic joins, not routes. Every cell in their measured
# inner band is land; the sole walkable separator aperture is carved later.
JOIN_SPECS = {
    "act1-act2": {
        "pair": (1, 2), "guide": [(149, 295), (158, 299), (172, 305)], "radius": 17.0,
    },
    "act1-act5": {
        "pair": (1, 5), "guide": [(85, 226), (91, 216), (100, 202)], "radius": 16.0,
    },
    "act2-act3": {
        "pair": (2, 3), "guide": [(260, 234), (254, 222), (263, 210), (260, 198)], "radius": 18.0,
    },
    "act3-act4": {
        "pair": (3, 4), "guide": [(242, 93), (238, 88), (244, 85), (242, 81)], "radius": 18.0,
    },
    "act4-act5": {
        "pair": (4, 5), "guide": [(172, 110), (164, 106), (156, 113), (148, 110)], "radius": 20.0,
    },
}


def fail(message: str) -> None:
    raise RuntimeError(f"CONTINENT G3 CHECK FAILED: {message}")


def act1_rect_mask() -> np.ndarray:
    result = np.zeros((HEIGHT, WIDTH), bool)
    x0, y0, x1, y1 = ACT1_BOUNDS
    result[y0:y1 + 1, x0:x1 + 1] = True
    return result


def act1_authority_mask() -> np.ndarray:
    result = np.zeros((HEIGHT, WIDTH), bool)
    x0, y0, x1, y1 = ACT1_BOUNDS
    result[y0:y1 + 1, x0:x1 + 1] = load_act1_land()
    return result


def join_masks(noise: np.ndarray | None = None) -> dict[str, np.ndarray]:
    yy, xx = np.indices((HEIGHT, WIDTH))
    result: dict[str, np.ndarray] = {}
    for name, spec in JOIN_SPECS.items():
        distance = g2.distance_to_polyline([tuple(map(float, point)) for point in spec["guide"]])
        radius = float(spec["radius"])
        edge_noise = 0.0 if noise is None else 2.4 * noise
        mask = distance <= radius + edge_noise
        result[name] = mask
    # The broad southern reach of the continental spine fills the former
    # Act1/Act2/Act5 sea gulf. It is blocked geology, not an extra act route.
    consolidation_guide = [
        (150, 174), (140, 198), (116, 222), (140, 246),
        (157, 276), (151, 311), (166, 348),
    ]
    distance = g2.distance_to_polyline([tuple(map(float, point)) for point in consolidation_guide])
    edge_noise = 0.0 if noise is None else 5.2 * noise + 2.4 * np.sin(xx * 0.13 + yy * 0.071)
    result["central-consolidation-spine"] = distance <= 31.0 + edge_noise
    return result


def guard_mask() -> np.ndarray:
    guard = np.zeros((HEIGHT, WIDTH), bool)
    for _, point, _ in g2.LANDMARKS.values():
        g2.disk(guard, point, 7)
    for point in g2.CONNECTION_PROBES:
        g2.disk(guard, point, 5)
    guard |= act1_authority_mask()
    return guard


def sculpt_open_coast(land: np.ndarray) -> tuple[np.ndarray, dict[str, object]]:
    """Noise-displace and notch only the mutable Acts 2-5 outer envelope."""
    result = land.copy()
    yy, xx = np.indices(result.shape, dtype=float)
    coast_noise = g2.simplex_fbm(result.shape, SEED + 23001)
    protected = guard_mask()
    joins = join_masks(coast_noise)
    join_union = np.logical_or.reduce(list(joins.values()))

    east_limit = 304.0 + 6.5 * coast_noise + 4.2 * np.sin(yy * 0.083) + 2.1 * np.sin(yy * 0.31)
    south_limit = 384.0 + 6.2 * coast_noise + 4.8 * np.sin(xx * 0.071) + 2.3 * np.sin(xx * 0.29)
    north_limit = 12.0 + 5.8 * coast_noise + 4.4 * np.sin(xx * 0.077) + 2.0 * np.sin(xx * 0.33)
    trim = ((xx >= east_limit) | ((xx >= 164) & (yy >= south_limit)) | ((xx >= 145) & (yy <= north_limit)))

    # Broad coves remove the square shoulder before the cell-scale edge pass.
    for cx, cy, rx, ry in ((310, 250, 15, 24), (307, 355, 19, 17), (276, 390, 28, 13),
                           (220, 8, 25, 12), (303, 92, 14, 19), (155, 198, 13, 18)):
        trim |= ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1.0 + 0.18 * coast_noise
    mutable_trim = trim & ~protected & ~join_union & ~act1_rect_mask()
    result[mutable_trim] = False

    # Deterministic peninsula lobes interrupt the remaining long convex arcs.
    additions = np.zeros_like(result)
    for cx, cy, rx, ry in ((293, 276, 14, 9), (279, 369, 17, 8), (245, 14, 14, 8), (307, 155, 8, 14)):
        additions |= ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1.0 + 0.16 * coast_noise
    additions &= ~act1_rect_mask()
    additions[[0, -1], :] = False
    additions[:, [0, -1]] = False
    result |= additions

    # Reassert immutable anchors and broad mountain joins after trimming.
    result |= act1_authority_mask() | join_union
    result[[0, -1], :] = False
    result[:, [0, -1]] = False
    result, holes = g2.fill_inland_holes(result)
    return result, {
        "trimmedOuterCells": int(mutable_trim.sum()),
        "peninsulaCells": int(additions.sum()),
        "inlandHoleCellsFilled": holes,
    }


def ocean_mask(land: np.ndarray) -> np.ndarray:
    ocean = np.zeros_like(land)
    queue: deque[tuple[int, int]] = deque()
    for x in range(WIDTH):
        for y in (0, HEIGHT - 1):
            if not land[y, x] and not ocean[y, x]:
                ocean[y, x] = True
                queue.append((x, y))
    for y in range(HEIGHT):
        for x in (0, WIDTH - 1):
            if not land[y, x] and not ocean[y, x]:
                ocean[y, x] = True
                queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        for nx, ny in g2.neighbors(x, y):
            if 0 <= nx < WIDTH and 0 <= ny < HEIGHT and not land[ny, nx] and not ocean[ny, nx]:
                ocean[ny, nx] = True
                queue.append((nx, ny))
    return ocean


def outer_coast_edges(land: np.ndarray) -> tuple[set[tuple[int, int]], set[tuple[int, int]]]:
    ocean = ocean_mask(land)
    act1_rect = act1_rect_mask()
    horizontal: set[tuple[int, int]] = set()
    vertical: set[tuple[int, int]] = set()
    for y in range(1, HEIGHT):
        for x in range(WIDTH):
            if land[y - 1, x] == land[y, x] or not (ocean[y - 1, x] or ocean[y, x]):
                continue
            land_y = y - 1 if land[y - 1, x] else y
            if not act1_rect[land_y, x]:
                horizontal.add((x, y))
    for y in range(HEIGHT):
        for x in range(1, WIDTH):
            if land[y, x - 1] == land[y, x] or not (ocean[y, x - 1] or ocean[y, x]):
                continue
            land_x = x - 1 if land[y, x - 1] else x
            if not act1_rect[y, land_x]:
                vertical.add((x, y))
    return horizontal, vertical


def outer_coast_metrics(land: np.ndarray) -> dict[str, object]:
    metrics = g2.edge_metrics(*outer_coast_edges(land))
    return {
        "outerCoastEdgeCells": metrics["edgeCells"],
        "outerCoastCornerVertices": metrics["cornerVertices"],
        "outerCoastTurnRatio": metrics["turnRatio"],
        "outerCoastMaximumStraightRun": metrics["maximumAxisAlignedRun"],
        "act1LockedCoastExempt": True,
    }


def roughen_outer_coast(land: np.ndarray) -> tuple[np.ndarray, int]:
    """Break every mutable outer-coast edge run longer than six cells."""
    result = land.copy()
    mutable = ~act1_rect_mask() & ~guard_mask()
    mutable[0] = False
    mutable[-1] = False
    mutable[:, 0] = False
    mutable[:, -1] = False
    changes = 0
    for _ in range(3000):
        horizontal, vertical = outer_coast_edges(result)
        long_runs = sorted(
            (item for item in g2.boundary_runs(horizontal, vertical) if len(item[1]) > 6),
            key=lambda item: len(item[1]), reverse=True,
        )
        if not long_runs:
            break
        progress = False
        for orientation, run in long_runs:
            for index in list(range(5, len(run), 6)) + list(range(1, len(run) - 1)):
                x, y = run[index]
                cells = ((x, y - 1), (x, y)) if orientation == "h" else ((x - 1, y), (x, y))
                outside = [cell for cell in cells if not result[cell[1], cell[0]]]
                inside = [cell for cell in cells if result[cell[1], cell[0]]]
                for cx, cy in outside + inside:
                    if 0 <= cx < WIDTH and 0 <= cy < HEIGHT and mutable[cy, cx]:
                        result[cy, cx] = not result[cy, cx]
                        changes += 1
                        progress = True
                        break
                if progress:
                    break
            if progress:
                break
        if not progress:
            break
    result |= act1_authority_mask()
    result[[0, -1], :] = False
    result[:, [0, -1]] = False
    return result, changes


def build_land(rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray, dict[str, object], dict[str, np.ndarray]]:
    land, _, inherited = g2.build_land(rng)
    land, sculpt = sculpt_open_coast(land)
    land, roughened = roughen_outer_coast(land)
    components = g2.connected_components(land)
    if len(components) != 1:
        fail(f"coast sculpt split the landmass into {len(components)} components")
    membership, fields, assignment = g2.assign_organic_biomes(land, load_act1_land())
    # Boundary roughening may borrow Act 1 as the target label for an adjacent
    # new cell. Keep the immutable snapshot as the complete Act 1 membership;
    # additions against its edge belong to the side that supplied the land.
    rect = act1_rect_mask()
    authority = act1_authority_mask()
    added_against_act1 = land & rect & ~authority
    spilled_into_act1 = added_against_act1 & (membership == 1)
    memberships_by_join = join_masks(g2.simplex_fbm(land.shape, SEED + 23001))
    membership[spilled_into_act1 & memberships_by_join["act1-act5"]] = 5
    membership[spilled_into_act1 & ~memberships_by_join["act1-act5"]] = 2
    joins = join_masks(g2.simplex_fbm(land.shape, SEED + 23001))
    return land, membership, {
        **inherited,
        **sculpt,
        "outerCoastCellsRoughened": roughened,
        "assignment": assignment,
        "biomeFields": fields,
        "outerCoast": outer_coast_metrics(land),
    }, joins


def cardinal_naturalize(path: list[tuple[int, int]], allowed: np.ndarray, phase: int) -> list[tuple[int, int]]:
    """Add alternating two-cell side steps to the real centerline, never a proxy."""
    if len(path) < 2:
        return path
    result = [path[0]]
    run = 0
    previous_direction: tuple[int, int] | None = None
    side = -1 if phase % 2 else 1
    for target in path[1:]:
        current = result[-1]
        direction = (target[0] - current[0], target[1] - current[1])
        if abs(direction[0]) + abs(direction[1]) != 1:
            result.append(target)
            previous_direction, run = None, 0
            continue
        run = run + 1 if direction == previous_direction else 1
        if run >= 5:
            perpendiculars = ((-direction[1] * side, direction[0] * side),
                              (direction[1] * side, -direction[0] * side))
            inserted = False
            for px, py in perpendiculars:
                a = (current[0] + px, current[1] + py)
                b = (target[0] + px, target[1] + py)
                if (0 <= a[0] < WIDTH and 0 <= a[1] < HEIGHT and
                        0 <= b[0] < WIDTH and 0 <= b[1] < HEIGHT and
                        allowed[a[1], a[0]] and allowed[b[1], b[0]] and
                        a not in result[-8:] and b not in result[-8:]):
                    result.extend((a, b, target))
                    side *= -1
                    inserted = True
                    break
            if inserted:
                previous_direction, run = None, 0
                continue
        result.append(target)
        previous_direction = direction
    return result


def variable_corridor_mask(path: list[tuple[int, int]], phase: int) -> tuple[np.ndarray, list[int]]:
    mask = np.zeros((HEIGHT, WIDTH), bool)
    widths: list[int] = []
    length = max(1, len(path) - 1)
    for index, (x, y) in enumerate(path):
        wave = math.sin(index * 0.43 + phase * 1.17) + 0.55 * math.sin(index * 0.19 + phase)
        radius = 2 if wave > 0.2 else 1
        # Force both widths even on short connector paths.
        if index in {length // 3, (2 * length) // 3}:
            radius = 1 if index == length // 3 else 2
        widths.append(radius * 2 + 1)
        g2.disk(mask, (x, y), radius)
    return mask, widths


def act1_world_guides() -> dict[str, list[tuple[int, int]]]:
    x0, y0, _, _ = ACT1_BOUNDS
    return {
        f"a1-{name}": [(x + x0, y + y0) for x, y in controls]
        for name, controls in ACT1_LOCAL_ROUTE_GUIDES.items()
    }


def build_corridors(
    land: np.ndarray, rng: np.random.Generator
) -> tuple[dict[str, list[tuple[int, int]]], dict[str, np.ndarray], np.ndarray, dict[str, object]]:
    inherited_paths, _, inherited = g2.build_corridors(land, rng)
    route_noise = g2.fbm((HEIGHT, WIDTH), rng)
    macro_curve_overrides = {
        "a4-legacy-scorched-probe": [(242, 81), (250, 75), (258, 85), (268, 77), (278, 82)],
        "a4-magma-embers": [(242, 81), (232, 75), (221, 84), (210, 77), (201, 85), (195, 81)],
    }
    all_paths: dict[str, list[tuple[int, int]]] = {}
    corridor_masks: dict[str, np.ndarray] = {}
    width_schedules: dict[str, list[int]] = {}
    for phase, (name, path) in enumerate(inherited_paths.items()):
        if name in macro_curve_overrides:
            guide = macro_curve_overrides[name]
            path = []
            for start, end in zip(guide, guide[1:]):
                piece = g2.raster_path(land, start, end, g2.organic_crest([start, end], rng), route_noise)
                path.extend(piece if not path else piece[1:])
        centerline = cardinal_naturalize(path, land, phase)
        mask, widths = variable_corridor_mask(centerline, phase)
        all_paths[name] = centerline
        corridor_masks[name] = mask & land
        width_schedules[name] = widths

    for phase, (name, guide) in enumerate(act1_world_guides().items(), start=len(all_paths)):
        curved = g2.organic_crest(guide, rng)
        path = g2.raster_path(land, guide[0], guide[-1], curved, route_noise)
        centerline = cardinal_naturalize(path, land, phase)
        mask, widths = variable_corridor_mask(centerline, phase)
        all_paths[name] = centerline
        corridor_masks[name] = mask & land
        width_schedules[name] = widths

    protected = np.logical_or.reduce(list(corridor_masks.values()))
    for _, point, _ in g2.LANDMARKS.values():
        g2.disk(protected, point, 1)
    for point in g2.CONNECTION_PROBES:
        protected[point[1], point[0]] = True

    metrics: dict[str, object] = {}
    for name, path in all_paths.items():
        line = g2.ordered_line_metrics(path)
        widths = width_schedules[name]
        metrics[name] = {
            "centerlineCells": line["cells"],
            "centerlineTurns": line["turns"],
            "centerlineTurnRatio": line["turnRatio"],
            "minimumWidthCells": min(widths),
            "maximumWidthCells": max(widths),
            "maximumToMinimumWidthRatio": max(widths) / min(widths),
            "paintedCorridorCells": int(corridor_masks[name].sum()),
        }
    return all_paths, corridor_masks, protected, {
        **inherited,
        "routeCountIncludingAct1": len(all_paths),
        "protectedVariableWidthCells": int(protected.sum()),
        "corridors": metrics,
    }


def separator_throats(paths: dict[str, list[tuple[int, int]]], corridor_masks: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    throats: dict[str, np.ndarray] = {}
    mapping = {
        "Crystal Range": "connector-crystal", "Shadow Range": "connector-shadow",
        "Magma Ridge": "connector-magma", "Volcanic Pass": "connector-volcanic",
    }
    for separator, route in mapping.items():
        center = g2.SEPARATORS[separator]["center"]
        # The cut spans the complete variable-width saddle, not only its center cell.
        throats[separator] = corridor_masks[route] & (g2.distance_to_points([center]) <= 7.5)
    return throats


def apply_join_mountains(
    grid: np.ndarray,
    joins: dict[str, np.ndarray],
    protected: np.ndarray,
    rivers: dict[str, np.ndarray],
    membership: np.ndarray,
) -> tuple[np.ndarray, dict[str, object]]:
    result = grid.copy()
    join_union = np.logical_or.reduce(list(joins.values()))
    river_union = np.logical_or.reduce(list(rivers.values())) if rivers else np.zeros_like(join_union)
    immutable_act1 = act1_authority_mask()
    mutable = join_union & ~protected & ~river_union & ~immutable_act1
    edge = mutable & ~g2.erode(mutable, 2)
    core = mutable & ~edge
    result[edge] = g2.CODE["cliff"]
    result[core] = g2.CODE["mountain"]
    rock_noise = g2.simplex_fbm(result.shape, SEED + 26003)
    result[core & (rock_noise > 0.18)] = g2.CODE["cliff"]
    # A snowy foothill apron survives on the Act 2 side of Crystal while the
    # mountain core remains the blocker and the named valley the sole aperture.
    yy, xx = np.indices(result.shape)
    crystal_fringe = edge & joins["act1-act2"] & (membership == 2) & (xx >= 174) & (yy <= 310)
    result[crystal_fringe] = g2.CODE["tundra"]
    return result, {
        "broadJoinLandCells": int(join_union.sum()),
        "blockedMountainJoinCells": int((edge | core).sum()),
        "walkableValleyCells": int((join_union & protected).sum()),
    }


def paint_natural_corridors(
    grid: np.ndarray,
    land: np.ndarray,
    membership: np.ndarray,
    corridor_masks: dict[str, np.ndarray],
    paths: dict[str, list[tuple[int, int]]],
) -> np.ndarray:
    result = grid.copy()
    all_corridors = np.logical_or.reduce(list(corridor_masks.values())) & land
    preserve = np.isin(result, [g2.CODE["bridge"], g2.CODE["structure"], g2.CODE["landmarkSolid"]])
    open_classes = {1: "meadow", 2: "snow", 3: "sand", 4: "ash", 5: "deadGround"}
    for act, class_name in open_classes.items():
        valley = all_corridors & (membership == act) & ~preserve
        result[valley] = g2.CODE[class_name]
    for path in paths.values():
        for x, y in path:
            if land[y, x] and not preserve[y, x]:
                result[y, x] = g2.CODE["trail"]
    return result


def retain_act2_open_basin_richness(
    grid: np.ndarray,
    land: np.ndarray,
    membership: np.ndarray,
    joins: dict[str, np.ndarray],
    protected: np.ndarray,
) -> tuple[np.ndarray, int]:
    """Keep g2's snowy open-space floor outside the new blocked geology."""
    result = grid.copy()
    region = land & (membership == 2)
    target = math.ceil(int(region.sum()) * 0.125)
    current = int((region & (result == g2.CODE["snow"])).sum())
    if current >= target:
        return result, 0
    join_union = np.logical_or.reduce(list(joins.values()))
    noise = g2.simplex_fbm(result.shape, SEED + 28002)
    candidates = [
        (float(noise[y, x]), int(x), int(y))
        for y, x in zip(*np.where(region & ~join_union & ~protected & (result == g2.CODE["snowForest"])))
    ]
    changed = 0
    for _, x, y in sorted(candidates, reverse=True):
        if current >= target:
            break
        result[y, x] = g2.CODE["snow"]
        current += 1
        changed += 1
    if current < target:
        fail("could not retain the inherited Act 2 open-basin richness outside mountain joins")
    return result, changed


def inter_act_sea_metrics(land: np.ndarray, joins: dict[str, np.ndarray]) -> dict[str, object]:
    result: dict[str, object] = {}
    for name, spec in JOIN_SPECS.items():
        cells = g2.ordered_polyline_cells([tuple(map(float, point)) for point in spec["guide"]])
        longest = run = 0
        for x, y in cells:
            run = 0 if land[y, x] else run + 1
            longest = max(longest, run)
        inner = joins[name] & (g2.distance_to_polyline([tuple(map(float, point)) for point in spec["guide"]]) <= float(spec["radius"]) - 3.0)
        result[name] = {
            "acts": list(spec["pair"]),
            "maximumCenterlineOpenSeaSpanCells": longest,
            "openSeaCellsInInnerJoinBand": int((inner & ~land).sum()),
            "innerJoinBandCells": int(inner.sum()),
        }
    return result


def clip_rivers_to_land(
    river_masks: dict[str, np.ndarray],
    river_metrics: dict[str, object],
    land: np.ndarray,
    membership: np.ndarray,
) -> tuple[dict[str, np.ndarray], dict[str, object], np.ndarray]:
    """Exclude outlet-adjacent ocean cells accidentally enabled by endpoint disks."""
    masks: dict[str, np.ndarray] = {}
    metrics = {name: dict(item) for name, item in river_metrics.items()}
    dropped = np.zeros_like(land)
    for name, mask in river_masks.items():
        clipped = mask & land
        components = g2.connected_components(clipped)
        if len(components) > 1:
            keep = np.zeros_like(land)
            for x, y in max(components, key=len):
                keep[y, x] = True
            dropped |= clipped & ~keep
            clipped = keep
        masks[name] = clipped
        act = int(metrics[name]["act"])
        basin = g2.dilate(land & (membership == act), 18) & land
        metrics[name]["cells"] = int(clipped.sum())
        metrics[name]["majorComponents"] = len(g2.connected_components(clipped))
        metrics[name]["outsideActDilationCells"] = int((clipped & ~basin).sum())
    return masks, metrics, dropped


def lint_pack(
    grid: np.ndarray,
    land: np.ndarray,
    membership: np.ndarray,
    protected: np.ndarray,
    paths: dict[str, list[tuple[int, int]]],
    corridor_metrics: dict[str, object],
    throats: dict[str, np.ndarray],
    range_masks: dict[str, np.ndarray],
    range_metrics: dict[str, object],
    river_metrics: dict[str, object],
    interior_metrics: dict[str, object],
    joins: dict[str, np.ndarray],
    river_masks: dict[str, np.ndarray],
    seal_report: dict[str, object],
) -> dict[str, object]:
    inherited = g2.lint_pack(
        grid, land, membership, protected, paths, throats, range_masks,
        range_metrics, river_metrics, interior_metrics,
    )
    checks = inherited["checks"]

    # Two inherited checks encode invariants the owner replaced on 2026-07-25.
    # They are REPLACED, not deleted -- each swaps in the stricter assertion the
    # new design actually needs.
    #
    # 1. "rivers" counted exactly 4 channels. Act 2's was dropped for lakes, so
    #    3 channels remain and the lakes get their own check below.
    checks["rivers"] = {
        "pass": len(river_metrics) == 3 and all(
            item["majorComponents"] == 1 and item["cells"] >= 12
            and item["outsideActDilationCells"] == 0 for item in river_metrics.values()),
        "systems": river_metrics,
        "scope": "Acts 3-5 keep one channel each; Act 2 carries lakes instead (see act2-lakes)",
        "act1": "approved v4 Millbrook river reused byte-for-byte in Act 1 raster",
    }
    lakes = river_masks.get("act2-frozen-lakes", np.zeros_like(land))
    lake_bodies = sorted((len(part) for part in g2.connected_components(lakes)), reverse=True)
    checks["act2-lakes"] = {
        "pass": (len(lake_bodies) == len(ACT2_LAKES) and all(size >= 25 for size in lake_bodies)
                 and not bool((lakes & protected).any())
                 and bool(np.all(membership[lakes] == 2)) and bool(np.all(land[lakes]))),
        "bodies": lake_bodies,
        "expectedBodies": len(ACT2_LAKES),
        "routeCellsFlooded": int((lakes & protected).sum()),
        "scope": "discrete lakes, each >=25 cells, all inside Act 2 land, none on an authored route",
    }

    # 2. "separator-sole-passes" required exactly one walkable valley per range.
    #    Owner 2026-07-25: there is to be NO walkable valley -- an act border is
    #    crossed only through its connector dungeon.
    checks.pop("separator-sole-passes", None)
    walkable = walkable_mask(grid)
    seals: dict[str, object] = {}
    for name, spec in g2.SEPARATORS.items():
        mouth_a, mouth_b = spec["mouths"]
        act_a, act_b = spec["acts"]
        side_a = reachable_from(walkable, ACT_TOWN[act_a])
        side_b = reachable_from(walkable, ACT_TOWN[act_b])
        seals[name] = {
            "acts": [act_a, act_b],
            "walkableBetweenActs": bool(side_a[ACT_TOWN[act_b][1], ACT_TOWN[act_b][0]]),
            "mouthAApproachable": bool(side_a[mouth_a[1], mouth_a[0]]),
            "mouthBApproachable": bool(side_b[mouth_b[1], mouth_b[0]]),
        }
    checks["separators-sealed"] = {
        "pass": all(not item["walkableBetweenActs"] and item["mouthAApproachable"]
                    and item["mouthBApproachable"] for item in seals.values()),
        "separators": seals,
        "wall": seal_report,
        "scope": "no walkable path between the two acts; both connector-dungeon mouths still approachable",
    }

    expected = act1_authority_mask()
    x0, y0, x1, y1 = ACT1_BOUNDS
    snapshot = load_act1_land()
    expected_membership = membership[y0:y1 + 1, x0:x1 + 1][snapshot]
    added = land[y0:y1 + 1, x0:x1 + 1] & ~snapshot
    added_membership = membership[y0:y1 + 1, x0:x1 + 1][added]
    checks["act1-snapshot-land-water"] = {
        "pass": bool(np.all(land[expected]) and np.all(expected_membership == 1)
                     and np.all(added_membership != 1)),
        "removedSnapshotLandCells": int((expected & ~land).sum()),
        "reassignedSnapshotLandCells": int((expected & (membership != 1)).sum()),
        "act2OrAct5MountainLandAddedAgainstLockedCoastCells": int(added.sum()),
        "addedCellsAssignedToAct1": int((added_membership == 1).sum()),
        "authority": "locked Act 1 land contour is retained as Act 1; gap fill is assigned from the Act 2/5 side",
    }

    # Once the old Act 1 ocean edge becomes an internal mountain join, its
    # immutable contour is also an immutable interface. Keep the g2 organic
    # threshold on every mutable Acts 2-5 interface and report the lock openly.
    biome_check = checks["organic-biome-boundaries"]
    mutable_interfaces = {
        name: item for name, item in biome_check["interfaces"].items()
        if not name.startswith("act1-")
    }
    locked_interfaces = {
        name: item for name, item in biome_check["interfaces"].items()
        if name.startswith("act1-")
    }
    biome_check.update({
        "pass": bool(mutable_interfaces) and all(
            item["turnRatio"] >= 0.12 and item["maximumAxisAlignedRun"] <= 5
            for item in mutable_interfaces.values()
        ),
        "interfaces": mutable_interfaces,
        "lockedAct1CoastInterfacesExempt": locked_interfaces,
        "act1ExemptionReason": "the locked outer coast contour is now internal mountain-joined geography and cannot be jittered",
    })

    coast = outer_coast_metrics(land)
    checks["organic-open-coast"] = {
        "pass": coast["outerCoastMaximumStraightRun"] <= 6 and coast["outerCoastTurnRatio"] >= 0.12,
        **coast,
        "thresholds": {"maximumStraightRunCells": 6, "minimumTurnRatio": 0.12},
    }
    sea = inter_act_sea_metrics(land, joins)
    checks["inter-act-open-sea-spans"] = {
        "pass": all(item["maximumCenterlineOpenSeaSpanCells"] == 0
                    and item["openSeaCellsInInnerJoinBand"] == 0 for item in sea.values()),
        "maximumAllowedCells": 0,
        "pairs": sea,
        "proofModel": "every cell on each authored cluster-to-cluster transect and its broad inner mountain band is tested",
    }
    corridor_checks = corridor_metrics["corridors"]
    checks["natural-variable-width-corridors"] = {
        "pass": all(item["maximumToMinimumWidthRatio"] >= 1.6 for item in corridor_checks.values()),
        "requiredMinimumMaximumToMinimumRatio": 1.6,
        "count": len(corridor_checks),
        "corridors": corridor_checks,
    }
    checks["natural-non-straight-corridors"] = {
        "pass": all(item["centerlineTurnRatio"] >= 0.12 for item in corridor_checks.values()),
        "requiredMinimumTurnRatio": 0.12,
        "count": len(corridor_checks),
        "corridors": {name: {"centerlineCells": item["centerlineCells"],
                              "centerlineTurns": item["centerlineTurns"],
                              "centerlineTurnRatio": item["centerlineTurnRatio"]}
                      for name, item in corridor_checks.items()},
    }
    act1_routes = {
        name: g2.flood_proof(grid, path[0], path[-1])
        for name, path in paths.items() if name.startswith("a1-")
    }
    checks["act1-natural-route-connectivity"] = {
        "pass": len(act1_routes) == 7 and all(item["pass"] for item in act1_routes.values()),
        "count": len(act1_routes), "routes": act1_routes,
    }

    failures = [name for name, check in checks.items() if not check["pass"]]
    return {
        "schema": "continent-macro-g3-consolidated-linters-v1",
        "genuineAtContinentScale": True,
        "checks": checks,
        "result": "PASS" if not failures else "FAIL",
        "failures": failures,
    }


def write_data(
    output: Path,
    grid: np.ndarray,
    land: np.ndarray,
    membership: np.ndarray,
    protected: np.ndarray,
    elevation: np.ndarray,
    throats: dict[str, np.ndarray],
    rivers: dict[str, np.ndarray],
    boundary_masks: dict[str, np.ndarray],
    crest_masks: dict[str, np.ndarray],
    joins: dict[str, np.ndarray],
    biome_distribution: dict[str, object],
    linter: dict[str, object],
    report: dict[str, object],
) -> None:
    np.save(output / "terrain-classes.npy", grid)
    np.save(output / "collision-grid.npy", grid)
    np.save(output / "land-mask.npy", land)
    np.save(output / "act-membership.npy", membership)
    np.save(output / "corridor-skeleton.npy", protected)
    np.save(output / "elevation-field.npy", elevation)
    np.savez_compressed(output / "separator-throats.npz", **{name.replace(" ", "_").lower(): mask for name, mask in throats.items()})
    np.savez_compressed(output / "river-systems.npz", **rivers)
    np.savez_compressed(output / "organic-boundaries.npz", **boundary_masks, **joins)
    np.savez_compressed(output / "separator-crests.npz", **crest_masks)
    Image.fromarray((land * 255).astype(np.uint8)).save(output / "land-mask.png", optimize=False, compress_level=9)
    payload = {
        "schema": "continent-terrain-class-g3-consolidated-v1", "seed": SEED,
        "world": {"size": [WIDTH, HEIGHT]}, "classes": list(g2.CLASSES),
        "walkable": sorted(g2.WALKABLE_NAMES), "grid": grid.tolist(),
    }
    (output / "terrain-classes.json").write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    (output / "biome-distribution.json").write_text(json.dumps(biome_distribution, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (output / "linter-report.json").write_text(json.dumps(linter, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (output / "generator-report.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    g2.write_palette(output)


def correct_separator_sheet_labels(output: Path) -> None:
    """Replace g2's fixed-width caption with the measured g3 valley contract."""
    path = output / "separator-closeups-4x.png"
    sheet = Image.open(path).convert("RGB")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for row in range(2):
        draw.rectangle((0, row * 480, 1280, row * 480 + 60), fill=(20, 24, 29))
    for index, (name, info) in enumerate(g2.SEPARATORS.items()):
        ox = (index % 2) * 640 + 50
        oy = 24 + (index // 2) * 480
        biomes = info["biomes"].replace("→", "to")
        draw.text(
            (ox, oy),
            f"{name} | Act {info['acts'][0]} to {info['acts'][1]} | {biomes} | variable 3-5-cell valley",
            fill=(255, 255, 255), font=font,
        )
    sheet.save(path, optimize=False, compress_level=9)


# ---------------------------------------------------------------------------
# ACT 4 LAVA FLOW (owner-directed re-author, 2026-07-25)
#
# g2.drape_rivers carves every river as a ~1-cell polyline. For water that reads
# fine; for lava it read as a DRAWN STRIPE -- 190 cells over 130 columns, 84 of
# them exactly one cell wide. That defect is in the SOURCE MAP, so no art prompt
# can fix it: the flat semantic map hands the stripe straight to the model.
#
# Re-authored here as a real flow whose width is driven by the terrain it
# crosses rather than being constant:
#
# REROUTED 2026-07-25 (owner: "act 4 is the worst, the terrain does not make
# sense anymore"). The first re-author put the vent on the Central Spine at
# (174,55) and ran the flow due east across the INHABITED ash plain. The plain is
# where Act 4's two north-south trails run (x185-191 and x198-202), and the paint
# is `flow & ~protected` -- so the trails punched two full-width rectangular holes
# and the map showed the flow as three severed bars with square ends, one of them
# floating free of the rest. Measured on that pack: the lava PAINT was FIVE
# disconnected pieces (1205 + 47 + 23 + 6 + 2 cells), not one flow.
#
# There is no relief anywhere in the northern basin (elevation is 0.00-0.05 over
# the whole obsidian field), so a summit vent can only sit on the Spine, and any
# flow off the Spine must cross the plain and its trails. A FISSURE vent does not
# need relief -- Laki and Holuhraun both erupted from flat ground -- so the vent
# moves onto the flat, EAST of the trails, and the flow never meets a route:
#
#   FISSURE  x210-218  the vent opens at the western lip of the obsidian field,
#                      clear of the ash plain and of both trails.
#   CHANNEL  x218-250  a confined channel across its own older flows.
#   FIELD    x250-292  the 47-62 row deep obsidian field -- obsidian IS this
#                      flow's own cooled rock. The margin percolates outward
#                      here. Collision-neutral: obsidian is already non-walkable,
#                      and the whole route is obsidian, so NO walkable cell is
#                      lost anywhere along it.
#   DELTA    x292-306  the flow reaches the north-east shore.
#
# Determinism: this stage draws from its own LAVA_SEED stream and never touches
# the shared `rng`, so every other act stays bit-identical to the prior pack.
LAVA_RIVER = "act4-lava-channel"
LAVA_SEED = SEED + 24007
LAVA_VENT = (214, 58)
# A radius-3 disc stamped at the very tip of the flow blurred into a round pin
# head -- the flow read as a tadpole. The fissure is smaller than the channel it
# feeds, so the percolated margin, not this disc, is what gives the vent its edge.
LAVA_VENT_RADIUS = 2
LAVA_MIN_WIDTH = 0.9          # the fissure and the confined channel
# The old 3.1 was tuned for a route that spent half its length on ash, where the
# obsidian fraction that drives width is near zero. This route is obsidian end to
# end, so `spread` sits at ~1.0 throughout and that same 3.1 would open a uniform
# 8-cell trench -- a pipe, not a flow. The channel stays narrow and the LOBES
# come from the percolated margin, which is the part that reads as lava.
LAVA_MAX_WIDTH = 1.5          # half-width of the CHANNEL; the margin is grown, not set here
LAVA_SPREAD_WINDOW = 11       # cells; box radius the obsidian fraction is read over
LAVA_STEEP_REFERENCE = 0.045  # elevation gradient at which the flow is fully pinched
# Lobate margins are GROWN, not placed. Two hand-authored passes were rejected
# here: long straight branches read as fins on a fish, and evenly spaced bulbous
# toes read as a caterpillar. Both failed for the same reason -- hand-placed
# features repeat, and repetition is what makes a shape look drawn.
#
# Instead the margin percolates outward: each step offers the cells adjacent to
# the flow and accepts the ones a fresh noise octave votes in, biased by how
# much obsidian (this flow's own cooled rock) surrounds them. Fingers and
# embayments fall out of the noise at several scales, and growth stops at the
# ash plain on its own because the obsidian bias goes to zero there.
#
# Steps cut 8 -> 5 and the ramp raised, because the obsidian field is far larger
# than the flow should be: at 8 steps the margin percolated until it had filled a
# 93x25 slab (1205 cells) that read as one orange bar across the act rather than
# as a flow. The affinity term can only stop growth at the field's EDGE; keeping
# the flow smaller than the field is what the step count is for.
LAVA_GROWTH_STEPS = 7
LAVA_GROWTH_BASE = 0.34       # noise threshold at the first, most permissive step
LAVA_GROWTH_RAMP = 0.055      # threshold added per step, so growth tapers off
LAVA_GROWTH_BIAS = 0.55       # how strongly obsidian cover invites growth


def box_fraction(mask: np.ndarray, radius: int) -> np.ndarray:
    """Fraction of `mask` inside a (2r+1) square, via an integral image."""
    padded = np.zeros((mask.shape[0] + 1, mask.shape[1] + 1), dtype=np.float64)
    padded[1:, 1:] = np.cumsum(np.cumsum(mask.astype(np.float64), axis=0), axis=1)
    yy, xx = np.indices(mask.shape)
    y0 = np.clip(yy - radius, 0, mask.shape[0])
    y1 = np.clip(yy + radius + 1, 0, mask.shape[0])
    x0 = np.clip(xx - radius, 0, mask.shape[1])
    x1 = np.clip(xx + radius + 1, 0, mask.shape[1])
    total = padded[y1, x1] - padded[y0, x1] - padded[y1, x0] + padded[y0, x0]
    return total / np.maximum((y1 - y0) * (x1 - x0), 1)


def sample_polyline(points: list[tuple[float, float]], count: int) -> tuple[np.ndarray, np.ndarray]:
    """`count` evenly arc-spaced (x, y) samples along a polyline."""
    lengths = [math.hypot(x2 - x1, y2 - y1) for (x1, y1), (x2, y2) in zip(points, points[1:])]
    cumulative = np.concatenate(([0.0], np.cumsum(lengths)))
    targets = np.linspace(0.0, cumulative[-1], count)
    xs = np.interp(targets, cumulative, [p[0] for p in points])
    ys = np.interp(targets, cumulative, [p[1] for p in points])
    return xs, ys


def smooth_profile(values: np.ndarray, window: int) -> np.ndarray:
    kernel = np.ones(window) / window
    padded = np.pad(values, window, mode="edge")
    return np.convolve(padded, kernel, mode="same")[window:-window]


def shape_act4_lava_flow(
    grid: np.ndarray,
    land: np.ndarray,
    membership: np.ndarray,
    protected: np.ndarray,
    elevation: np.ndarray,
    river_masks: dict[str, np.ndarray],
    river_metrics: dict[str, object],
) -> tuple[np.ndarray, dict[str, np.ndarray], dict[str, object], dict[str, object]]:
    base = river_masks[LAVA_RIVER]
    controls = [tuple(map(float, point)) for point in g2.RIVERS[LAVA_RIVER][1]]
    distance, progress = g2.distance_and_progress(controls)
    act4 = (membership == 4) & land

    # Terrain drivers, both read ALONG the line so the result is a flow with a
    # varying width rather than a blob that swallows whatever is nearby.
    spread = box_fraction(grid == g2.CODE["obsidian"], LAVA_SPREAD_WINDOW)
    gradient_y, gradient_x = np.gradient(elevation.astype(np.float64))
    steep = np.clip(np.hypot(gradient_x, gradient_y) / LAVA_STEEP_REFERENCE, 0.0, 1.0)
    wobble = g2.simplex_fbm(grid.shape, LAVA_SEED)

    samples = 320
    sample_x, sample_y = sample_polyline(controls, samples)
    rows = np.clip(np.round(sample_y).astype(int), 0, HEIGHT - 1)
    columns = np.clip(np.round(sample_x).astype(int), 0, WIDTH - 1)
    spread_profile = smooth_profile(spread[rows, columns], 21)
    steep_profile = smooth_profile(steep[rows, columns], 15)
    wobble_profile = smooth_profile(wobble[rows, columns], 9)

    width_profile = LAVA_MIN_WIDTH + LAVA_MAX_WIDTH * spread_profile * (1.0 - steep_profile)
    width_profile *= 0.82 + 0.36 * (wobble_profile * 0.5 + 0.5)
    positions = np.linspace(0.0, 1.0, samples)
    width = np.interp(progress, positions, width_profile)

    flow = distance <= width

    # Break the machine-smooth boundary: shave edge cells the noise votes down,
    # add adjacent ones it votes up. Two-sided, so the flow is asymmetric.
    # Runs on the main channel ALONE -- a lobe tail is only ~2 cells wide and a
    # single shaved edge cell there severs it from the system.
    edge = flow & ~g2.erode(flow, 1)
    flow &= ~(edge & (wobble < -0.30))
    flow |= g2.dilate(flow, 1) & (wobble > 0.42) & (spread > 0.5)

    # Percolate the lobate margin outward. Each step is its own noise octave, so
    # the fingers it grows are at a different scale from the last step's.
    growable = act4 & land & ~protected & (grid == g2.CODE["obsidian"])
    for step in range(LAVA_GROWTH_STEPS):
        # SHORT octaves, not simplex_fbm. fbm is dominated by its scale-43 octave,
        # which barely varies across a flow only a few cells wide -- every step
        # then invited nearly the same broad region and the margin came out as a
        # smooth offset of the channel, i.e. a wider bar. These three scales are
        # the LOBE scale (14), the finger scale (7) and the ragged-edge scale
        # (3.5), so each step grows lobes and fingers instead of a uniform skin.
        seed = LAVA_SEED + 977 * (step + 1)
        octave = (0.50 * g2.simplex_noise(grid.shape, 14.0, seed)
                  + 0.30 * g2.simplex_noise(grid.shape, 7.0, seed + 53)
                  + 0.20 * g2.simplex_noise(grid.shape, 3.5, seed + 97))
        threshold = LAVA_GROWTH_BASE + LAVA_GROWTH_RAMP * step
        invited = octave + LAVA_GROWTH_BIAS * (spread - 0.5) > threshold
        flow |= g2.dilate(flow, 1) & growable & invited
    g2.disk(flow, LAVA_VENT, LAVA_VENT_RADIUS)

    # A flow may only occupy its own act, its own ground, and never a route.
    keep_class = np.isin(grid, [
        g2.CODE["ash"], g2.CODE["scorched"], g2.CODE["obsidian"], g2.CODE["charcoal"],
        g2.CODE["cliff"], g2.CODE["mountain"], g2.CODE["lava"],
    ])
    flow &= act4 & land & keep_class
    flow |= base                       # the authored channel is never lost
    # Clipping to the act, the shore and the paintable classes can strand a
    # grown pocket whose only connector was clipped. A lava flow is one system,
    # so keep the component holding the authored channel and drop the rest.
    components = sorted(g2.connected_components(flow), key=len, reverse=True)
    stranded = sum(len(component) for component in components[1:])
    if stranded:
        survivor = np.zeros_like(flow)
        for x, y in components[0]:
            survivor[y, x] = True
        flow = survivor
    # Same split drape_rivers uses: the MASK spans the crossings so the system
    # stays one component, but the PAINT never covers a route or a bridge.
    painted = flow & ~protected
    grid[painted] = g2.CODE[g2.RIVERS[LAVA_RIVER][2]]

    river_masks = dict(river_masks)
    river_masks[LAVA_RIVER] = flow
    river_metrics = dict(river_metrics)
    metrics = dict(river_metrics[LAVA_RIVER])
    metrics["cells"] = int(flow.sum())
    metrics["majorComponents"] = len(g2.connected_components(flow))
    river_metrics[LAVA_RIVER] = metrics
    stage = {
        "act4LavaCellsBefore": int(base.sum()),
        "act4LavaCellsAfter": int(painted.sum()),
        "act4LavaComponents": metrics["majorComponents"],
        "act4LavaVent": list(LAVA_VENT),
        "act4LavaStrandedCellsDropped": int(stranded),
        "act4LavaMaxWidthCells": round(float(width_profile.max()) * 2.0, 2),
        "act4LavaMinWidthCells": round(float(width_profile.min()) * 2.0, 2),
    }
    return grid, river_masks, river_metrics, stage


# ---------------------------------------------------------------------------
# REACHABLE GROUND GROWTH — acts 2 and 4 (owner-directed, 2026-07-25)
#
# Owner: "walkable space should be larger in general but guide the player in a
# natural progression". A first attempt at this thresholded noise anywhere in the
# act and was reverted, because area is not the thing that matters -- REACHABLE
# area is. It added 4499 cells to Act 2 of which 917 were islands the player could
# never stand on, and it shifted where the act's regions joined, which moved the
# progression.
#
# So this grows the ground OUTWARD FROM THE GROUND THE PLAYER CAN ALREADY REACH.
# Every cell it opens is adjacent to a cell already connected to the act's town, so
# the result is connected BY CONSTRUCTION and the orphan count cannot rise. It also
# means growth follows the existing routes outward, which widens the corridors the
# player actually walks rather than hollowing out the far corners.
#
# What it will not touch:
#   * `protected` -- the authored routes,
#   * anything within GROW_INTERFACE_KEEP of another act, and the range CRESTS, so
#     the four border seals and the spines that carry them are never thinned,
#   * a matrix class below GROW_MATRIX_FLOOR, which the inherited
#     `per-act-v4-interior-richness` linter fails under 25%.
# and every act is rolled back wholesale if the seals do not survive it.
GROW_SEED = SEED + 24917
GROW_TARGETS = {2: 0.46, 4: 0.46}       # reachable share of the act's land
GROW_MATRIX = {2: "snowForest", 4: "obsidian"}
GROW_FILL = {2: ("snow", "tundra"), 4: ("ash", "scorched")}
GROW_MATRIX_FLOOR = 0.27
GROW_INTERFACE_KEEPS = (6, 12, 22, 34)   # per-step verification does the fine work now
GROW_DANGER_ZONE = 26                    # only re-prove the seals when growth gets this close
GROW_STEPS = 26


OWNER_STROKES = ROOT / "design/continent-terrain-class-method/layout-planner/owner-layout-strokes.json"
# The owner drew a LINE, not a region: "the blocker perimiter is a guide so please fill
# it in as you see fit and make sure it looks natural". So each stroke is read as the
# CREST of a range and the wall is grown outward from it by a noise-varied radius --
# which also sidesteps the which-side-is-blocked ambiguity a filled polygon would have.
#
# Thickness is driven by a short simplex octave at the WALL's own scale. simplex_fbm is
# dominated by its scale-43 term and would give one smooth swell along the whole range;
# an octave near the feature size gives the pinches and bulges a real ridge has.
OWNER_BLOCK_SCALE = 11.0
OWNER_BLOCK_MIN = 1.4
OWNER_BLOCK_MAX = 5.2
# Blockers are terrain, so they take the act's own blocker class. Role colour is constant
# continent-wide (rock grey, vegetation green), so this only chooses which ROLE walls each
# act -- Act 1 is walled by its woods, everything north and east by rock. Act 2 is rock on
# purpose: the owner requires the Ironkeep-Frostwatch canyon to be mountain, because that
# is the pass the harpy wind seals.
#
# A stroke is a range CREST, so it is painted as one: a thin rock spine with the act's own
# dense matrix on the flanks, not a uniform slab. Painting every stroke cell `mountain`
# put rock at 31-39% of EVERY act's land and starved each biome's matrix class, which is
# what the inherited per-act-v4-interior-richness check measures -- act 3's duneRock came
# out at 8.6% against a 25% floor. The crest half-width is deliberately small: the flanks
# are the part that carries the biome.
# Acts 3 and 4 take their own rock class for the crest as well: duneRock and obsidian
# ARE those biomes' rock, so painting generic grey mountain over a desert or volcanic
# range only spends matrix budget to look less like the act it is in.
OWNER_BLOCK_CREST_CLASS = {1: "forest", 2: "mountain", 3: "duneRock", 4: "obsidian", 5: "mountain"}
OWNER_BLOCK_FLANK_CLASS = {1: "forest", 2: "snowForest", 3: "duneRock", 4: "obsidian", 5: "deadForest"}
OWNER_BLOCK_CREST = 0.9   # half-width in cells of the rock spine inside each stroke
# A stroke that runs close to a placed landmark must not bury it. The owner drew walls
# past several doors deliberately (Act 3's Scorched Ruins sits on the west spine); the
# wall bends around the door rather than the door moving.
OWNER_BLOCK_KEEP_CLEAR = 3.0


def carve_owner_blockers(
    grid: np.ndarray, land: np.ndarray, membership: np.ndarray, protected: np.ndarray,
    river_masks: dict[str, np.ndarray] | None = None,
) -> tuple[np.ndarray, np.ndarray, dict[str, object]]:
    """Grow the owner's hand-drawn blocker spines into natural ranges and forests.

    Returns the mask as well as the grid: the later reachability passes have to treat
    these as walls they may not dissolve, or the gating the owner drew them for is
    quietly undone by the pass that guarantees every landmark an approach.
    """
    if not OWNER_STROKES.exists():
        return grid, np.zeros_like(land), {"ownerBlockers": "absent"}
    data = json.loads(OWNER_STROKES.read_text(encoding="utf-8"))
    wobble = g2.simplex_noise((g2.HEIGHT, g2.WIDTH), OWNER_BLOCK_SCALE, g2.SEED + 9901)
    radius = OWNER_BLOCK_MIN + (OWNER_BLOCK_MAX - OWNER_BLOCK_MIN) * (0.5 * wobble + 0.5)

    doors = np.zeros_like(land, dtype=float)
    doors[:] = np.inf
    for _, point, _ in g2.LANDMARKS.values():
        doors = np.minimum(doors, g2.distance_to_polyline([point, point]))
    keep_clear = doors <= OWNER_BLOCK_KEEP_CLEAR
    # A stroke may not overwrite a watercourse. Every river is drawn as ONE channel and
    # checked as one; painting a range straight through it leaves the art reading as
    # drawn bars rather than water, which is what the gate's paint-fragmentation check
    # measures. The owner drew ranges, not dams -- a range meets a river at a gorge.
    rivers = np.zeros_like(land)
    for mask in (river_masks or {}).values():
        rivers |= np.asarray(mask, dtype=bool)

    blocked = np.zeros_like(land)
    per_act: dict[str, int] = {}
    for act_key, entry in data.items():
        if act_key.startswith("_"):
            continue
        act = int(act_key)
        act_mask = np.zeros_like(land)
        crest_mask = np.zeros_like(land)
        for stroke in entry.get("blockers", []):
            if len(stroke) < 2:
                continue
            reach = g2.distance_to_polyline([tuple(p) for p in stroke])
            act_mask |= reach <= radius
            crest_mask |= reach <= OWNER_BLOCK_CREST
        # Confine each act's strokes to its own membership. The owner draws right up to
        # the act seam and a range that leaks across it re-walls the neighbour -- which is
        # exactly how Act 1's Coastal Reef got buried by a pass aimed at another act.
        act_mask &= (membership == act) & land & ~protected & ~keep_clear & ~rivers
        crest_mask &= act_mask
        blocked |= act_mask
        grid[act_mask] = g2.CODE[OWNER_BLOCK_FLANK_CLASS[act]]
        grid[crest_mask] = g2.CODE[OWNER_BLOCK_CREST_CLASS[act]]
        per_act[f"act{act}"] = int(act_mask.sum())
        per_act[f"act{act}Crest"] = int(crest_mask.sum())
    return grid, blocked, {"ownerBlockers": per_act, "ownerBlockerCells": int(blocked.sum())}


def grow_reachable_ground(
    grid: np.ndarray,
    land: np.ndarray,
    membership: np.ndarray,
    protected: np.ndarray,
    crest_masks: dict[str, np.ndarray],
    owner_blockers: np.ndarray | None = None,
) -> tuple[np.ndarray, dict[str, object]]:
    report: dict[str, object] = {}
    keep_walled = np.zeros_like(land) if owner_blockers is None else owner_blockers
    crests = np.zeros_like(land)
    for mask in crest_masks.values():
        crests |= g2.dilate(np.asarray(mask, dtype=bool), 1)

    def seals_broken(pairs=(1, 2, 3, 4)) -> list[str]:
        walkable = walkable_mask(grid)
        broken = []
        for pair in pairs:
            here = reachable_from(walkable, ACT_TOWN[pair])
            tx, ty = ACT_TOWN[pair + 1]
            if here[max(0, ty - 4):ty + 5, max(0, tx - 4):tx + 5].any():
                broken.append(f"{pair}->{pair + 1}")
        return broken

    for act, target in sorted(GROW_TARGETS.items()):
        region = (membership == act) & land
        total = int(region.sum())
        matrix_code = g2.CODE[GROW_MATRIX[act]]
        open_code, fringe_code = (g2.CODE[n] for n in GROW_FILL[act])
        givers = [g2.CODE[n] for n in ("cliff", "mountain")] + [matrix_code]
        noise = (0.55 * g2.simplex_noise(grid.shape, 19.0, GROW_SEED + act * 83)
                 + 0.30 * g2.simplex_noise(grid.shape, 8.5, GROW_SEED + act * 83 + 11)
                 + 0.15 * g2.simplex_noise(grid.shape, 3.5, GROW_SEED + act * 83 + 23))

        # Only the seals this act actually touches need re-proving, and only when a
        # step reaches near enough to threaten one.
        my_pairs = tuple(p for p in (1, 2, 3, 4) if p == act or p + 1 == act)
        others = land & (membership != act) & (membership > 0)
        danger = g2.dilate(others, GROW_DANGER_ZONE)

        def attempt(keep: int) -> tuple[int, int]:
            near_other = g2.dilate(others, keep)
            allowed = region & ~protected & ~near_other & ~crests & ~keep_walled & np.isin(grid, givers)
            matrix_spare = int((region & (grid == matrix_code)).sum()) - int(GROW_MATRIX_FLOOR * total)
            grown, refused = 0, 0
            reach = reachable_from(walkable_mask(grid), ACT_TOWN[act]) & region
            for step in range(GROW_STEPS):
                if int(reach.sum()) >= int(target * total):
                    break
                take = g2.dilate(reach, 1) & allowed & (noise > 0.55 - 0.045 * step)
                if matrix_spare <= 0 or int((take & (grid == matrix_code)).sum()) > matrix_spare:
                    take &= grid != matrix_code
                if not take.any():
                    continue
                # Counted BEFORE the overwrite -- afterwards these cells no longer
                # carry the matrix class and the budget would never be spent.
                took_matrix = int((take & (grid == matrix_code)).sum())
                snapshot = grid.copy() if (take & danger).any() else None
                # Fringe class lines the new edge, open class fills the middle --
                # the open/fringe grammar `base_terrain` already uses.
                edge = take & ~g2.erode(take, 1)
                grid[take & ~edge] = open_code
                grid[edge] = fringe_code
                # A blanket stand-off is far too blunt for Act 4: backing off to the
                # 34 cells its seals needed left almost none of the act eligible and
                # it grew 514 cells. Checked PER STEP instead, so growth runs right up
                # to whatever would breach a seal, that step alone is rolled back, and
                # those cells are struck off so the next step goes somewhere else.
                if snapshot is not None and seals_broken(my_pairs):
                    grid[:] = snapshot
                    allowed &= ~g2.dilate(take, 1)
                    refused += int(take.sum())
                    continue
                matrix_spare -= took_matrix
                grown += int(take.sum())
                reach |= take
                allowed &= ~take
            return grown, refused

        grown, refused, broken, used = 0, 0, ["unattempted"], None
        for keep in GROW_INTERFACE_KEEPS:
            snapshot = grid.copy()
            trial, trial_refused = attempt(keep)
            broken = seals_broken()
            if not broken:
                grown, refused, used = trial, trial_refused, keep
                break
            grid[:] = snapshot
        reach = reachable_from(walkable_mask(grid), ACT_TOWN[act]) & region
        walkable = walkable_mask(grid) & region
        report[f"act{act}"] = {
            "cellsGrown": grown,
            "cellsRefusedBySealCheck": refused,
            "interfaceStandoffUsed": used,
            "reachablePercent": round(100.0 * int(reach.sum()) / total, 1),
            "orphanedCells": int((walkable & ~reach).sum()),
            "sealsBrokenAfterBackoff": broken if used is None else [],
        }
    return grid, {"reachableGrowth": report}


# ---------------------------------------------------------------------------
# ACT 3 ROCK STRUCTURE (owner-directed, 2026-07-25)
#
# Owner: Act 3's "rock (grey) vs ground (tan) is a mottled patchwork of
# disconnected grey blobs with no structure -- reads as noise, not terrain".
#
# The cause is in `g2.base_terrain`: every act gets `matrix_islands = inner &
# (detail > 0.34)`, where `detail` is an ISOTROPIC simplex_fbm. Isotropic noise
# thresholded at one level produces round blobs at one size scattered evenly --
# which is the textbook look of noise rather than of geology. In Acts 1/2/5 the
# matrix class is a FOREST and round scattered stands are fine. In Act 3 the
# matrix class is duneRock, and rock does not come in round scattered stands.
#
# Desert rock has a direction: it is bedded, so it weathers into mesas and
# escarpments that run ALONG the bedding plane, with rubble aprons at their feet.
# Two passes, both structural rather than decorative:
#
#   1. DROP the STRANDED ISLANDS. Act 3's duneRock falls into 12 components sized
#      1597, 1043, 476, 333, 221, 131, 125, 124, 118, 110, 13, 2. Measuring what
#      each one's boundary touches separates them cleanly: the four largest are
#      welded to the mountain spine and to each other and are the act's real
#      landforms, while 221/125/124 are 100% surrounded by sand and 131/118 are
#      70-73% surrounded -- rock rafts floating in the middle of a sand basin with
#      nothing holding them up. Those are precisely the "disconnected grey blobs"
#      the owner sees. They become `aridFoothill`, the fringe class, i.e. the
#      rubble apron a weathered-out mesa actually leaves behind. Turning a blocker
#      into walkable ground can never sever a route.
#      Budget: the inherited `per-act-v4-interior-richness` check floors Act 3's
#      matrix at 25% of 12784 region cells = 3196, and the rock starts at 4293, so
#      ~1100 cells may go. The stranding rule takes 734 and lands at 27.8%.
#   2. STRETCH what survives along the bedding plane, where a long-wavelength
#      noise field says a stratum is exposed. Blobs become ridges. This does add
#      blockers, so it is masked off `protected` and re-verified by the linter.
ACT3_ROCK_SEED = SEED + 24709
ACT3_ROCK_MIN_MASS = 40       # cells; below this it is pepper whatever it touches
ACT3_ROCK_RAFT_MAX = 350      # cells; above this a mass is a landform, not a raft
ACT3_ROCK_RAFT_SAND = 0.65    # boundary fraction against sand that marks a raft
ACT3_ROCK_STRATUM_RUN = 9     # cells of east-west reach, where a stratum is exposed
ACT3_ROCK_EXPOSURE = -0.42    # noise level above which the bedding plane is exposed


def restructure_act3_rock(
    grid: np.ndarray,
    land: np.ndarray,
    membership: np.ndarray,
    protected: np.ndarray,
) -> tuple[np.ndarray, dict[str, object]]:
    region = (membership == 3) & land
    rock = region & (grid == g2.CODE["duneRock"])
    before = int(rock.sum())

    sand = region & np.isin(grid, [g2.CODE["sand"], g2.CODE["aridFoothill"]])
    speckle = np.zeros_like(rock)
    rafts = 0
    for component in g2.connected_components(rock):
        piece = np.zeros_like(rock)
        for x, y in component:
            piece[y, x] = True
        boundary = g2.dilate(piece, 1) & ~piece
        total = int(boundary.sum())
        stranded = total and (int((boundary & sand).sum()) / total) >= ACT3_ROCK_RAFT_SAND
        if len(component) < ACT3_ROCK_MIN_MASS or (
                len(component) <= ACT3_ROCK_RAFT_MAX and stranded):
            rafts += 1
            for x, y in component:
                speckle[y, x] = True
    massif = rock & ~speckle

    exposure = (0.60 * g2.simplex_noise(grid.shape, 34.0, ACT3_ROCK_SEED)
                + 0.40 * g2.simplex_noise(grid.shape, 15.0, ACT3_ROCK_SEED + 61))
    exposed = exposure > ACT3_ROCK_EXPOSURE
    strata = massif.copy()
    for step in range(1, ACT3_ROCK_STRATUM_RUN + 1):
        strata |= np.roll(massif, step, axis=1) & exposed
        strata |= np.roll(massif, -step, axis=1) & exposed
    host = region & ~protected & np.isin(
        grid, [g2.CODE[name] for name in ("sand", "aridFoothill", "duneRock")])
    strata &= host

    grid[speckle] = g2.CODE["aridFoothill"]
    grid[strata] = g2.CODE["duneRock"]
    after = int((region & (grid == g2.CODE["duneRock"])).sum())
    return grid, {
        "act3RockCellsBefore": before,
        "act3RockCellsAfter": after,
        "act3RockRaftsDropped": rafts,
        "act3RockRaftCellsDropped": int(speckle.sum()),
        "act3RockMassifs": len(g2.connected_components(region & (grid == g2.CODE["duneRock"]))),
    }


# ---------------------------------------------------------------------------
# ACT 4 DEAD FOREST (owner-directed, 2026-07-25)
#
# Measured on the prior pack, Act 4 held ZERO vegetation cells -- the only act on
# the continent with none, while its own art legend promises "burnt DEAD forest,
# charred standing trunks". With 47% of the act rock and 29% walkable ground, and
# with the two painted in near-identical greys, the whole act reduced to a mottled
# grey field with one orange bar in it. That is the "terrain does not make sense"
# the owner called out.
#
# `base_terrain` gives every act a matrix/fringe/open triple and Act 4's matrix is
# `obsidian`, so the act never had a vegetation class placed at all. The stands go
# in as deadForest carved OUT OF THE OBSIDIAN, never out of the ash: obsidian is
# already a blocker, so this is exactly walkability-neutral -- not one walkable
# cell changes anywhere on the continent -- while giving the act the third role
# colour it was missing.
#
# Grown, not placed, for the reason the lava re-author established: stands come
# from short noise octaves at the STAND's own scale (simplex_fbm is dominated by
# its scale-43 octave and would return one act-sized blob), and anything too small
# to read as a wood is dropped instead of being left as pepper.
ACT4_FOREST_SEED = SEED + 24407
# The stands eat into `obsidian`, which is what the inherited
# `per-act-v4-interior-richness` linter counts as Act 4's matrix, and that check
# floors the matrix at 25% of the act. Act 4's obsidian starts at 31.8% of 15139
# region cells, so ~950 cells is the whole budget; 0.24 lands at 865 and leaves
# the matrix at 26.1%. Do not lower this without re-reading that check.
ACT4_FOREST_THRESHOLD = 0.24   # noise level a cell must clear to hold trees
ACT4_FOREST_LAVA_CLEAR = 5     # cells; nothing grows this close to the active flow
ACT4_FOREST_MIN_STAND = 30     # cells; smaller pieces are pepper, not a wood


def scatter_act4_dead_forest(
    grid: np.ndarray,
    land: np.ndarray,
    membership: np.ndarray,
    protected: np.ndarray,
) -> tuple[np.ndarray, dict[str, object]]:
    # `scale` is cells-per-noise-unit, so the leading octave sets the STAND size:
    # 24 gives woods tens of cells across, and the two shorter octaves only break
    # up their edges. At 9.0 the leading octave was already stand-sized detail and
    # every piece fell under the minimum -- 564 cells of pepper, 52 surviving.
    stands_noise = (0.55 * g2.simplex_noise(grid.shape, 24.0, ACT4_FOREST_SEED)
                    + 0.30 * g2.simplex_noise(grid.shape, 11.0, ACT4_FOREST_SEED + 47)
                    + 0.15 * g2.simplex_noise(grid.shape, 5.0, ACT4_FOREST_SEED + 91))
    near_lava = g2.dilate(grid == g2.CODE["lava"], ACT4_FOREST_LAVA_CLEAR)
    host = (membership == 4) & land & ~protected & (grid == g2.CODE["obsidian"]) & ~near_lava
    stands = host & (stands_noise > ACT4_FOREST_THRESHOLD)
    dropped = 0
    for component in g2.connected_components(stands):
        if len(component) < ACT4_FOREST_MIN_STAND:
            dropped += len(component)
            for x, y in component:
                stands[y, x] = False
    grid[stands] = g2.CODE["deadForest"]
    return grid, {
        "act4DeadForestCells": int(stands.sum()),
        "act4DeadForestStands": len(g2.connected_components(stands)),
        "act4DeadForestPepperDropped": dropped,
    }


# ---------------------------------------------------------------------------
# ACT 3 WADI + ACT 5 DARK RIVER (owner-directed re-author, 2026-07-25)
#
# Both were left as `drape_rivers` carved them: a ~1-cell polyline, widened only
# where a single fbm sample happened to clear 0.24. Act 3's ran 199 cells over
# 110 columns, Act 5's 154 over 137 -- roughly one cell per column. At the art
# map's blur-and-threshold that is not a river, it is a dotted line, which is
# exactly what the owner saw: "a hard-edged straight blue BAR with speckled blue
# dashes trailing west".
#
# The lava re-author already proved the fix, so this is the same three-part
# treatment generalised over both watercourses (see the learning entry
# `grow-dont-place-organic-features`):
#
#   1. a width profile read from the TERRAIN the course crosses, so the channel
#      opens on soft open ground and pinches to a slot where it cuts rock,
#   2. a two-sided noise shave/add so the bank is not a machine-smooth offset,
#   3. a margin PERCOLATED outward -- a fresh noise octave per step, a rising
#      threshold, and an affinity term that lets the water stop on its own.
#
# `host` is the class family the course is allowed to spread across and is also
# the affinity signal: its local fraction is high on the open flats the river
# floods and falls to zero in the rock, so growth ends where it should without
# being told where.
WATERCOURSE_SEED = SEED + 24311


class Watercourse(NamedTuple):
    river: str
    act: int
    host: tuple[str, ...]      # classes the course may spread over AND its affinity signal
    paint: str
    min_width: float           # half-width where the course is most confined
    max_width: float           # extra half-width at full host cover
    window: int                # cells; box radius the host fraction is read over
    steps: int
    base: float
    ramp: float
    bias: float
    min_paint_island: int      # painted pieces smaller than this are the "speckles"


WATERCOURSES = (
    # The wadi floods across sand and pinches to a slot canyon in the duneRock
    # of the eastern plateau -- which is Act 3's own theme, "desert, oasis and
    # wind canyon", carried by the terrain instead of by the legend text.
    Watercourse("act3-oasis-wadi", 3, ("sand", "aridFoothill"), "oasisWater",
                1.4, 3.4, 9, 4, 0.05, 0.10, 1.10, 6),
    # The dark river spreads on the open dead ground and is squeezed by the
    # deadForest matrix it runs through.
    Watercourse("act5-dark-river", 5, ("deadGround", "charcoal"), "darkRiver",
                1.3, 2.9, 9, 4, 0.06, 0.11, 1.05, 6),
)


def shape_watercourse(
    spec: Watercourse,
    grid: np.ndarray,
    land: np.ndarray,
    membership: np.ndarray,
    protected: np.ndarray,
    river_masks: dict[str, np.ndarray],
    river_metrics: dict[str, object],
) -> tuple[np.ndarray, dict[str, np.ndarray], dict[str, object], dict[str, object]]:
    base = river_masks[spec.river]
    controls = [tuple(map(float, point)) for point in g2.RIVERS[spec.river][1]]
    distance, progress = g2.distance_and_progress(controls)
    region = (membership == spec.act) & land
    seed = WATERCOURSE_SEED + 101 * spec.act

    host_codes = [g2.CODE[name] for name in spec.host]
    host = box_fraction(np.isin(grid, host_codes), spec.window)
    wobble = g2.simplex_fbm(grid.shape, seed)

    samples = 320
    sample_x, sample_y = sample_polyline(controls, samples)
    rows = np.clip(np.round(sample_y).astype(int), 0, HEIGHT - 1)
    columns = np.clip(np.round(sample_x).astype(int), 0, WIDTH - 1)
    host_profile = smooth_profile(host[rows, columns], 19)
    wobble_profile = smooth_profile(wobble[rows, columns], 9)

    width_profile = spec.min_width + spec.max_width * host_profile
    width_profile *= 0.80 + 0.40 * (wobble_profile * 0.5 + 0.5)
    width = np.interp(progress, np.linspace(0.0, 1.0, samples), width_profile)
    flow = distance <= width

    edge = flow & ~g2.erode(flow, 1)
    flow &= ~(edge & (wobble < -0.34))
    flow |= g2.dilate(flow, 1) & (wobble > 0.44) & (host > 0.55)

    growable = region & ~protected & np.isin(grid, host_codes + [g2.CODE[spec.paint]])
    for step in range(spec.steps):
        octave = g2.simplex_fbm(grid.shape, seed + 613 * (step + 1))
        invited = octave + spec.bias * (host - 0.5) > spec.base + spec.ramp * step
        flow |= g2.dilate(flow, 1) & growable & invited

    # A watercourse is one system: keep only the component carrying the authored
    # channel, exactly as the lava does.
    flow &= region
    flow |= base & region
    components = sorted(g2.connected_components(flow), key=len, reverse=True)
    stranded = sum(len(component) for component in components[1:])
    if components and stranded:
        survivor = np.zeros_like(flow)
        for x, y in components[0]:
            survivor[y, x] = True
        flow = survivor

    # The MASK spans the trail fords so the system stays one component; the PAINT
    # never covers a route. Any painted piece too small to read as water is a
    # speck, not a river -- drop it back to the surrounding ground.
    painted = flow & ~protected
    speckles = np.zeros_like(painted)
    for component in g2.connected_components(painted):
        if len(component) < spec.min_paint_island:
            for x, y in component:
                speckles[y, x] = True
    painted &= ~speckles
    grid[painted] = g2.CODE[spec.paint]

    river_masks = dict(river_masks)
    river_masks[spec.river] = flow
    river_metrics = dict(river_metrics)
    metrics = dict(river_metrics[spec.river])
    metrics["cells"] = int(flow.sum())
    metrics["majorComponents"] = len(g2.connected_components(flow))
    river_metrics[spec.river] = metrics
    stage = {
        f"act{spec.act}CourseCellsBefore": int(base.sum()),
        f"act{spec.act}CourseCellsAfter": int(painted.sum()),
        f"act{spec.act}CoursePaintComponents": len(g2.connected_components(painted)),
        f"act{spec.act}CourseSpecklesDropped": int(speckles.sum()),
        f"act{spec.act}CourseStrandedCellsDropped": int(stranded),
        f"act{spec.act}CourseMaxWidthCells": round(float(width_profile.max()) * 2.0, 2),
        f"act{spec.act}CourseMinWidthCells": round(float(width_profile.min()) * 2.0, 2),
    }
    return grid, river_masks, river_metrics, stage


# ---------------------------------------------------------------------------
# ACT 2 LAKES (owner-directed, 2026-07-25)
#
# The act2 frozen river was carved by the generic river drape, then chopped into
# 3 pieces by its own bridges and clipped at the coast. At map scale it read as
# scattered blue specks across the snow -- "unnatural patches of water".
#
# Owner's call: drop the river, and enrich the snowfield with a few organic
# LAKES instead. Nothing massive. Each sits on open snow at least 7 cells clear
# of any route and 9 clear of any landmark, measured before placement, so no
# lake can pinch a corridor. The first one is deliberate: the Frozen Lake
# dungeon at (200,265) ends up on its southern shore, which is the only place in
# Act 2 where a lake was already implied by the content.
ACT2_LAKE_SEED = SEED + 24101
ACT2_LAKES = (
    ((199, 258), 6.5),    # Frozen Lake dungeon sits on the south shore
    ((285, 281), 6.0),    # eastern snowfield
    ((262, 259), 5.0),    # clearing inside the snow forest
    ((205, 339), 5.2),    # southern tundra
)
ACT2_LAKE_WOBBLE = 0.42   # how far the outline breaks from a circle


def replace_act2_river_with_lakes(
    grid: np.ndarray,
    land: np.ndarray,
    membership: np.ndarray,
    protected: np.ndarray,
    river_masks: dict[str, np.ndarray],
    river_metrics: dict[str, object],
    river_bridges: np.ndarray,
) -> tuple[np.ndarray, dict[str, np.ndarray], dict[str, object], np.ndarray, dict[str, object]]:
    ice = g2.CODE["iceRiver"]
    river_masks = dict(river_masks)
    river_metrics = dict(river_metrics)
    old = river_masks.pop("act2-frozen-river")
    river_metrics.pop("act2-frozen-river", None)

    # Erase the river: its channel AND the bridges that were carved for it, or
    # the later `grid[river_bridges] = bridge` pass would leave bridges to
    # nowhere stranded on bare snow.
    grid[old & (grid == ice)] = g2.CODE["snow"]
    river_bridges = river_bridges & ~old

    yy, xx = np.indices(grid.shape, dtype=float)
    # simplex_fbm is dominated by its scale-43 octave, which barely varies across
    # a 6-cell lake -- it scales the radius uniformly and leaves a circle. The
    # outline needs noise at the LAKE's own scale, so this uses short octaves.
    wobble = (0.55 * g2.simplex_noise(grid.shape, 8.0, ACT2_LAKE_SEED)
              + 0.30 * g2.simplex_noise(grid.shape, 4.5, ACT2_LAKE_SEED + 41)
              + 0.15 * g2.simplex_noise(grid.shape, 2.5, ACT2_LAKE_SEED + 83))
    host = np.isin(grid, [g2.CODE[name] for name in ("snow", "tundra", "snowForest")])
    allowed = (membership == 2) & land & ~protected & host
    lakes = np.zeros_like(land)
    placed = []
    for (cx, cy), radius in ACT2_LAKES:
        reach = np.hypot(xx - cx, yy - cy)
        body = reach <= radius * (1.0 - ACT2_LAKE_WOBBLE + 2.0 * ACT2_LAKE_WOBBLE * (wobble * 0.5 + 0.5))
        body &= allowed
        # A wobble that bites deep enough can shed islands; keep the shore that
        # actually contains the lake centre.
        parts = sorted(g2.connected_components(body), key=len, reverse=True)
        if not parts:
            continue
        keep = np.zeros_like(body)
        for x, y in parts[0]:
            keep[y, x] = True
        lakes |= keep
        placed.append({"centre": [cx, cy], "cells": int(keep.sum())})
    grid[lakes] = ice

    river_masks["act2-frozen-lakes"] = lakes
    stage = {
        "act2RiverCellsErased": int((old & land).sum()),
        "act2LakeCount": len(placed),
        "act2LakeCells": int(lakes.sum()),
        "act2Lakes": placed,
    }
    return grid, river_masks, river_metrics, river_bridges, stage


# ---------------------------------------------------------------------------
# WALLED ACT BORDERS (owner-directed, 2026-07-25)
#
# The inherited "separator-sole-passes" check proved the sole aperture over the
# ROUTE GRAPH, not over the terrain -- and the terrain was never sealed at all.
# Measured on the prior pack, walkable cells of one act touch walkable cells of
# the next along broad fronts: acts 1-2 over 14 cells, 2-3 over 61, 3-4 over
# 158, 4-5 over 122. The named valley was simply where the trail went.
#
# Owner's call: an act border is crossed ONLY through its connector dungeon.
# Each connector already has an overworld entrance on BOTH sides in the shipped
# game (crystalCave 148,295 / 172,305; shadowCave 260,234 / 260,198;
# magmaTunnels 242,93 / 242,81; volcanicForge 172,110 / 148,110), so walling the
# terrain costs no reachability -- it just moves the crossing into the dungeon.
#
# So the wall follows the whole membership interface, not a throat. That is also
# where it belongs geologically: the interface is where the biome changes, which
# is exactly where a range should stand. Width is noise-varied so it reads as a
# range rather than a drawn line, and it grows until a flood fill proves the two
# acts are disconnected -- no wider.
ACT_WALL_SEED = SEED + 24203
ACT_WALL_MOUTH_KEEP = 2.6      # half-width of the walkable approach at each dungeon door
ACT_WALL_DOOR_REACH = 9.0      # how far that approach runs back into the act it serves
ACT_WALL_GAP_PLUG = 4.5        # plug across the old pass, between the paired mouths
ACT_WALL_MIN_WIDTH = 2
ACT_WALL_MAX_WIDTH = 11
ACT_WALL_WOBBLE = 0.55         # how much the wall's half-width breathes along its length
ACT_GROUND = {1: "meadow", 2: "snow", 3: "sand", 4: "ash", 5: "deadGround"}
# Seal verification is done TOWN TO TOWN, never mouth to membership. The mouths
# straddle the border by design and their membership label is not reliable --
# Magma Ridge's act-3 mouth (242,93) is actually labelled act 4, which made a
# membership-based test trivially true and grew that wall to 11 cells for
# nothing. "Can the player walk from this act's town to the next act's town?" is
# both the real gameplay question and unambiguous.
# Each act's first town, at the owner's 2026-07-29 placement. Every reachability
# proof in this file floods from these five cells, so a stale entry silently
# measures connectivity from a spot the player never stands on.
ACT_TOWN = {1: (69, 255), 2: (209, 320), 3: (262, 154), 4: (200, 98), 5: (118, 36)}

# The Act-3 magma seal already EXISTS in the shipped game -- the overworld tile
# grid writes tile 21 ("Magma seal tile: impassable lava flow blocking Act-4
# approaches") over x245-247, y93-94, gated on item.flameCloak with the message
# "Molten rock blocks the path... Defeat the Sand Golem in the Desert Tomb to
# claim the Magma Cloak." It was missing from the ART map only, which is why the
# blocker looked absent in Act 3. These bounds mirror the shipped seal exactly.
ACT3_MAGMA_SEAL = (245, 93, 247, 94)   # inclusive x0, y0, x1, y1
# ...but painting exactly that rect and nothing else drew a 3x2 HARD-EDGED SQUARE
# of lava on the art map, the one square marker among discs that the owner spotted
# clipped at Act 3's top edge. The shipped cells stay exactly as they are -- the
# gate is unchanged -- and a plug is grown around them from short noise octaves so
# it reads as molten rock welling up out of the pass. Growth is restricted to
# cells that ALREADY block, so the plug cannot alter walkability by a single cell.
ACT3_MAGMA_SEAL_SEED = SEED + 24503
ACT3_MAGMA_SEAL_STEPS = 7
ACT3_MAGMA_SEAL_BASE = -0.34
ACT3_MAGMA_SEAL_RAMP = 0.11


def paint_magma_seal(
    grid: np.ndarray, land: np.ndarray, protected: np.ndarray,
) -> tuple[np.ndarray, dict[str, object]]:
    sx0, sy0, sx1, sy1 = ACT3_MAGMA_SEAL
    seal = np.zeros_like(land)
    seal[sy0:sy1 + 1, sx0:sx1 + 1] = True
    shipped = int(seal.sum())
    blockers = np.isin(grid, [g2.CODE[name] for name in
                              ("mountain", "cliff", "obsidian", "duneRock", "deadForest")])
    growable = land & ~protected & blockers
    noise = (0.55 * g2.simplex_noise(grid.shape, 6.0, ACT3_MAGMA_SEAL_SEED)
             + 0.45 * g2.simplex_noise(grid.shape, 3.0, ACT3_MAGMA_SEAL_SEED + 37))
    for step in range(ACT3_MAGMA_SEAL_STEPS):
        threshold = ACT3_MAGMA_SEAL_BASE + ACT3_MAGMA_SEAL_RAMP * step
        seal |= g2.dilate(seal, 1) & growable & (noise > threshold)
    grid[seal] = g2.CODE["lava"]
    return grid, {"act3MagmaSealCells": int(seal.sum()), "act3MagmaSealShippedCells": shipped}


def walkable_mask(grid: np.ndarray) -> np.ndarray:
    return np.isin(grid, [g2.CODE[name] for name in g2.WALKABLE_NAMES])


def reachable_from(walkable: np.ndarray, seed: tuple[int, int]) -> np.ndarray:
    seen = np.zeros(walkable.shape, bool)
    x, y = seed
    if not walkable[y, x]:
        return seen
    queue = deque([(x, y)])
    seen[y, x] = True
    while queue:
        cx, cy = queue.popleft()
        for nx, ny in g2.neighbors(cx, cy):
            if 0 <= nx < WIDTH and 0 <= ny < HEIGHT and walkable[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((nx, ny))
    return seen


def nearest_walkable(walkable: np.ndarray, point: tuple[int, int]) -> tuple[int, int] | None:
    distance = g2.distance_to_points([point])
    candidates = np.where(walkable, distance, np.inf)
    if not np.isfinite(candidates).any():
        return None
    index = int(np.argmin(candidates))
    return (index % WIDTH, index // WIDTH)


def act_interface(membership: np.ndarray, land: np.ndarray, act_a: int, act_b: int) -> np.ndarray:
    """The frontier of two acts, including any UNASSIGNED land between them.

    Walling only where act_a directly touches act_b leaves a hole wherever the
    two are separated by a ribbon of membership-0 land: the flood fill walks
    straight through it, and a pair-only adjacency scan cannot even see the leak
    because it skips membership 0. So each act is walled against everything on
    land that is not itself.
    """
    result = np.zeros_like(land)
    for act in (act_a, act_b):
        own = (membership == act) & land
        foreign = land & ~own
        result |= (own & g2.dilate(foreign, 1)) | (foreign & g2.dilate(own, 1))
    return result


def carve_stub(grid: np.ndarray, land: np.ndarray, forbid: np.ndarray,
               mouth: tuple[int, int], act: int) -> int:
    """Reconnect a walled-in dungeon mouth to its own act's walkable ground.

    A mouth sitting on the frontier gets ringed by its own border wall, so the
    approach has to be allowed to cut through that ring. What it may NEVER do is
    cut toward the PAIRED mouth: `forbid` masks off every cell closer to the far
    door than to this one, which keeps the stub on its own side and so keeps the
    seal intact. The seal is re-asserted afterwards regardless -- this function
    is trusted to be careful, not trusted to be correct.
    """
    walkable = walkable_mask(grid)
    target = reachable_from(walkable, ACT_TOWN[act])
    if not target.any() or target[mouth[1], mouth[0]]:
        return 0
    previous: dict[tuple[int, int], tuple[int, int] | None] = {mouth: None}
    queue = deque([mouth])
    found = None
    while queue and found is None:
        x, y = queue.popleft()
        for nx, ny in g2.neighbors(x, y):
            if not (0 <= nx < WIDTH and 0 <= ny < HEIGHT) or (nx, ny) in previous:
                continue
            if not land[ny, nx] or forbid[ny, nx]:
                continue
            previous[(nx, ny)] = (x, y)
            if target[ny, nx]:
                found = (nx, ny)
                break
            queue.append((nx, ny))
    if found is None:
        return 0
    painted = 0
    node: tuple[int, int] | None = found
    while node is not None:
        x, y = node
        if not walkable[y, x]:
            grid[y, x] = g2.CODE[ACT_GROUND[act]]
            painted += 1
        node = previous[node]
    return painted


def rescue_isolated_doors(
    grid: np.ndarray,
    land: np.ndarray,
) -> tuple[np.ndarray, dict[str, object]]:
    """Reconnect any overworld door the border walls cut off from every town.

    Each of the 36 landmarks and 41 legacy probes is a real `fromX/fromY` in the
    shipped game. A wall that isolates one deletes a door. The rescue connects
    the point to exactly ONE act's region and is forbidden from touching -- or
    even coming adjacent to -- any other act's region, so it can never re-open a
    border it just took four passes to seal.
    """
    doors = [(point, act) for act, point, _ in g2.LANDMARKS.values()]
    doors += [(point, None) for point in g2.CONNECTION_PROBES]
    rescued: list[dict[str, object]] = []
    for point, declared in doors:
        walkable = walkable_mask(grid)
        regions = {act: reachable_from(walkable, town) for act, town in ACT_TOWN.items()}
        if any(region[point[1], point[0]] for region in regions.values()):
            continue
        # A landmark's act is DECLARED, never inferred. Coastal Reef (140,349)
        # is 66 cells from Ironkeep and 80 from Greenhollow, so a nearest-town
        # guess reconnected an Act 1 dungeon into Act 2. Only bare legacy probes,
        # which carry no act, fall back to the nearest town.
        if declared is not None:
            host = declared
        else:
            distances = {act: g2.distance_to_points([town]) for act, town in ACT_TOWN.items()}
            host = min(distances, key=lambda act: float(distances[act][point[1], point[0]]))
        blocked = np.zeros_like(land)
        for act, region in regions.items():
            if act != host:
                blocked |= g2.dilate(region, 1)
        previous: dict[tuple[int, int], tuple[int, int] | None] = {point: None}
        queue = deque([point])
        found = None
        while queue and found is None:
            x, y = queue.popleft()
            for nx, ny in g2.neighbors(x, y):
                if not (0 <= nx < WIDTH and 0 <= ny < HEIGHT) or (nx, ny) in previous:
                    continue
                if not land[ny, nx] or blocked[ny, nx]:
                    continue
                previous[(nx, ny)] = (x, y)
                if regions[host][ny, nx]:
                    found = (nx, ny)
                    break
                queue.append((nx, ny))
        if found is None:
            rescued.append({"door": list(point), "act": host, "cells": 0, "reconnected": False})
            continue
        painted = 0
        node: tuple[int, int] | None = found
        while node is not None:
            x, y = node
            if not walkable_mask(grid)[y, x]:
                grid[y, x] = g2.CODE[ACT_GROUND[host]]
                painted += 1
            node = previous[node]
        rescued.append({"door": list(point), "act": host, "cells": painted, "reconnected": True})
    return grid, {"rescuedDoors": rescued, "rescuedCount": len(rescued)}


def wall_act_borders(
    grid: np.ndarray,
    land: np.ndarray,
    membership: np.ndarray,
) -> tuple[np.ndarray, dict[str, object]]:
    yy, xx = np.indices(grid.shape, dtype=float)
    wobble = g2.simplex_fbm(grid.shape, ACT_WALL_SEED)
    report: dict[str, object] = {}
    wall_union = np.zeros_like(land)
    # Every landmark is an overworld ENTRANCE in the shipped game -- burying one
    # deletes a town or dungeon door. The wall may never touch them. The 41 legacy
    # fromX/fromY probes are doors by the same argument (rescue_isolated_doors already
    # treats them as such), and leaving them out of this keep-zone is how the act-3/4
    # wall buried the Bandit Hideout probe at (298,130) under its own cliff rim.
    doors = np.zeros_like(land)
    for _, point, _ in g2.LANDMARKS.values():
        g2.disk(doors, point, 2)
    for point in g2.CONNECTION_PROBES:
        g2.disk(doors, point, 1)
    for name, spec in g2.SEPARATORS.items():
        act_a, act_b = spec["acts"]
        mouth_a, mouth_b = spec["mouths"]
        # The doorway is a CORRIDOR, not a disc. A disc around a mouth that sits
        # on the frontier gets ringed by its own wall, leaving the dungeon door
        # on a sealed island -- which is exactly what happened to three of the
        # eight mouths. Each keep-zone therefore also runs a short approach into
        # the act that door serves.
        #
        # That approach is aimed at the act's OWN TOWN, not merely away from the
        # paired mouth. "Away from the far mouth" is only the same direction when
        # the pair is arranged in act order, and the owner's Magma Tunnels pair is
        # not: act 3's mouth (192,93) sits 24 cells NORTH of act 4's (183,117), so
        # aiming away from the far mouth ran act 3's approach north, deeper into
        # act 4. With no legal approach, carve_stub cut 37 cells to find one and
        # broke the 3-4 seal -- which in turn made every other act-4 door on that
        # frontier unrescuable, because rescue_isolated_doors refuses to carve
        # beside a foreign act's region and a broken seal makes act 3's region and
        # act 4's the same set. The clip below keeps the leg on its own side of the
        # pass regardless of which way the town lies.
        keep = np.zeros_like(land)
        for near, far, own in ((mouth_a, mouth_b, act_a), (mouth_b, mouth_a, act_b)):
            town = ACT_TOWN[own]
            span = math.hypot(town[0] - near[0], town[1] - near[1]) or 1.0
            ux, uy = (town[0] - near[0]) / span, (town[1] - near[1]) / span
            approach = (near[0] + ux * ACT_WALL_DOOR_REACH, near[1] + uy * ACT_WALL_DOOR_REACH)
            leg = g2.distance_to_polyline([
                (float(near[0]), float(near[1])), approach,
            ]) <= ACT_WALL_MOUTH_KEEP
            leg &= (np.hypot(xx - near[0], yy - near[1])
                    < np.hypot(xx - far[0], yy - far[1]))
            keep |= leg
        seam = act_interface(membership, land, act_a, act_b)

        painted = 0
        walled = wall_union.copy()
        width = ACT_WALL_MIN_WIDTH
        for width in range(ACT_WALL_MIN_WIDTH, ACT_WALL_MAX_WIDTH + 1):
            # Noise-varied thickness: the wall breathes along its length instead
            # of being a constant-width ribbon.
            band = np.zeros_like(land)
            reach = width * (1.0 - ACT_WALL_WOBBLE + 2.0 * ACT_WALL_WOBBLE * (wobble * 0.5 + 0.5))
            for step in range(1, width + 1):
                band |= g2.dilate(seam, step) & (reach >= step)
            # The frontier band alone does NOT cover the old pass: the two mouths
            # sit 12-24 cells apart with open valley between them, and that gap
            # is not a membership frontier, so nothing walled it. Left open, the
            # door stubs simply reconnect the acts through it.
            gap = g2.distance_to_polyline([
                (float(mouth_a[0]), float(mouth_a[1])),
                (float(mouth_b[0]), float(mouth_b[1])),
            ]) <= ACT_WALL_GAP_PLUG
            zone = (band | gap) & land & ~keep & ~doors
            grid[zone] = g2.CODE["mountain"]
            wall_union |= zone
            painted += int((zone & ~walled).sum())
            walled |= zone
            walkable = walkable_mask(grid)
            if not reachable_from(walkable, ACT_TOWN[act_a])[ACT_TOWN[act_b][1], ACT_TOWN[act_b][0]]:
                break
        report[name] = {"acts": [act_a, act_b], "wallWidth": width, "wallCells": painted}

    # Stubs are carved only once EVERY border is walled. Carving them per-border
    # let a later wall cut an earlier stub straight back off.
    for name, spec in g2.SEPARATORS.items():
        act_a, act_b = spec["acts"]
        mouth_a, mouth_b = spec["mouths"]
        near_a = np.hypot(xx - mouth_a[0], yy - mouth_a[1])
        near_b = np.hypot(xx - mouth_b[0], yy - mouth_b[1])
        # carve_stub is "trusted to be careful, not trusted to be correct", so its
        # promise that the seal is re-asserted afterwards is kept here: each carve is
        # a transaction, reverted whole if it joined the two acts.
        stubs = []
        for forbid, mouth, act in ((near_b < near_a, mouth_a, act_a),
                                   (near_a < near_b, mouth_b, act_b)):
            before = grid.copy()
            painted = carve_stub(grid, land, forbid, mouth, act)
            if painted and reachable_from(walkable_mask(grid), ACT_TOWN[act_a])[
                    ACT_TOWN[act_b][1], ACT_TOWN[act_b][0]]:
                grid[:] = before
                painted = 0
            stubs.append(painted)
        report[name]["mouthStubCells"] = stubs
    walkable = walkable_mask(grid)
    for name, spec in g2.SEPARATORS.items():
        act_a, act_b = spec["acts"]
        report[name]["stillWalkableBetweenActs"] = bool(
            reachable_from(walkable, ACT_TOWN[act_a])[ACT_TOWN[act_b][1], ACT_TOWN[act_b][0]])
    # A mountain slab with a hard rim reads as a drawn wall; give it the cliff
    # fringe drape_ranges puts on every other range edge. Scoped to the cells
    # this stage painted -- never the continent's existing ranges.
    slab = grid == g2.CODE["mountain"]
    grid[wall_union & slab & ~g2.erode(slab, 1)] = g2.CODE["cliff"]
    report["totalWallCells"] = int(wall_union.sum())
    return grid, report


# ---------------------------------------------------------------------------
# LANDMARK APPROACHES (owner-reported 2026-07-25: "one of act 1's dungeons is
# completely inaccessible")
#
# Act 1's Coastal Reef (140,349). Every connectivity gate called it reachable and
# it looked walled into the rock. Both were true at once, and the gap between them
# is the bug:
#
#   * `wall_act_borders` keeps only a radius-2 disc clear around each landmark, so
#     the Crystal Range wall closed to within 2 cells of this door. Before the
#     walling it had 24 walkable cells within 5; after, 10.
#   * `rescue_isolated_doors` then reconnected it with a ONE CELL WIDE carve.
#     One cell satisfies a flood fill.
#   * The art map does not draw trails, and a 1-cell feature does not survive
#     blur-and-argmax at all. So the only thing joining that dungeon to Act 1
#     was invisible, and the map showed a dungeon sealed in rock.
#
# A door needs an approach a player can SEE, so this widens the walkable ground
# around each landmark and along the path leading back out of it. Only cells that
# already block are converted, never water, and never a cell adjacent to another
# act's walkable region -- the four border seals cost four passes to get right and
# this must not reopen one. Every carve is verified afterwards and REVERTED if it
# did, so the seal invariant wins over the approach.
APPROACH_RADIUS = 4            # cells of the landmark that must read as walkable
APPROACH_MIN_WALKABLE = 34     # walkable cells within APPROACH_RADIUS before it counts as open
APPROACH_OPEN_COUNTRY = 0.55   # walkable fraction in a 9x9 box that counts as "open"
APPROACH_MAX_PATH = 70         # cells; a runaway guard, not a design limit


def open_landmark_approaches(
    grid: np.ndarray,
    land: np.ndarray,
    membership: np.ndarray,
    owner_blockers: np.ndarray | None = None,
) -> tuple[np.ndarray, dict[str, object]]:
    yy, xx = np.indices(grid.shape)
    ground_of = {act: g2.CODE[name] for act, name in ACT_GROUND.items()}
    carved: list[dict[str, object]] = []

    def town_pairs_open() -> list[str]:
        walkable = walkable_mask(grid)
        broken = []
        for act in (1, 2, 3, 4):
            here = reachable_from(walkable, ACT_TOWN[act])
            tx, ty = ACT_TOWN[act + 1]
            if here[max(0, ty - 4):ty + 5, max(0, tx - 4):tx + 5].any():
                broken.append(f"{act}->{act + 1}")
        return broken

    # g2.LANDMARKS carries each connector ONCE, at one of its two mouths, so the far
    # side never got an approach and Shadow Cave's act-3 mouth sat in a 4-cell slot.
    # Both mouths of every separator are doors the player walks through, so both are
    # owed one. `act_b` is the act the far mouth stands in.
    doors = dict(g2.LANDMARKS)
    for range_name, spec in g2.SEPARATORS.items():
        act_a, act_b = spec["acts"]
        mouth_a, mouth_b = spec["mouths"]
        doors[f"{range_name} mouth {act_a}"] = (act_a, mouth_a, "dungeon")
        doors[f"{range_name} mouth {act_b}"] = (act_b, mouth_b, "dungeon")
    for name, (act, point, _) in sorted(doors.items()):
        near = (np.hypot(xx - point[0], yy - point[1]) <= APPROACH_RADIUS)
        walkable = walkable_mask(grid)
        # Two ways to be unreachable, and the count alone only catches one. A
        # relocated landmark gets its own clearing from `noisy_landmark_lobes`, so
        # it can sit in a 579-cell opening -- comfortably past the count -- that is
        # an ISLAND in the forest with no way in. Void Rift landed exactly there
        # after being moved to the south-west woods. So connectivity to the act's
        # own town is checked as well as local openness.
        town_region = reachable_from(walkable, ACT_TOWN[act])
        connected = bool(town_region[max(0, point[1] - APPROACH_RADIUS):point[1] + APPROACH_RADIUS + 1,
                                     max(0, point[0] - APPROACH_RADIUS):point[0] + APPROACH_RADIUS + 1].any())
        open_here = connected and int((walkable & near).sum()) >= APPROACH_MIN_WALKABLE
        # The act this door is actually served from -- for a connector that is the
        # act on the roster cell's side, which is not always its declared act.
        host = act
        for candidate, town in ACT_TOWN.items():
            region = reachable_from(walkable, town)
            if region[point[1], point[0]]:
                host = candidate
                break
        blocked = np.zeros_like(land)
        for other, town in ACT_TOWN.items():
            if other != host:
                blocked |= g2.dilate(reachable_from(walkable, town), 2)
        # Widen the thread. A fixed radius is the wrong shape: Coastal Reef opens
        # out after 4 cells while Magma Tunnels' route runs the length of the Magma
        # Ridge before it meets open desert, and a radius big enough for the second
        # would bulldoze the first. So this walks the route the player actually
        # takes -- BFS back along existing walkable cells -- and stops the moment it
        # reaches open country, then widens only that corridor.
        openness = box_fraction(walkable, 4)

        def route_to_open_country(passable: np.ndarray):
            previous: dict[tuple[int, int], tuple[int, int] | None] = {point: None}
            queue = deque([point])
            while queue:
                cx, cy = queue.popleft()
                for nx, ny in g2.neighbors(cx, cy):
                    if not (0 <= nx < WIDTH and 0 <= ny < HEIGHT) or (nx, ny) in previous:
                        continue
                    if not passable[ny, nx] or blocked[ny, nx]:
                        continue
                    previous[(nx, ny)] = (cx, cy)
                    if town_region[ny, nx] and openness[ny, nx] >= APPROACH_OPEN_COUNTRY:
                        return previous, (nx, ny)
                    queue.append((nx, ny))
            return previous, None

        # Walk the EXISTING route first, so a door that is merely pinched just gets
        # its own corridor widened. Only if there is no walkable route at all does
        # this cut a new one through the blockers -- which is the isolated-clearing
        # case, and the shortest such cut reads as a valley into the wood.
        previous, landfall = route_to_open_country(walkable)
        if landfall is None:
            previous, landfall = route_to_open_country(land)
        thread = np.zeros_like(land)
        node, steps = landfall, 0
        while node is not None and steps < APPROACH_MAX_PATH:
            thread[node[1], node[0]] = True
            node = previous[node]
            steps += 1
        # A door can be comfortably open at BOTH ends and still render as sealed in,
        # because the road between them passes through a one-cell neck and a one-cell
        # feature does not survive blur-and-argmax. Obsidian Cavern sat in a 686-cell
        # clearing joined to Ember's Rest by a single column of ash at x275: connected in
        # the class grid, two separate regions on the art map. So an already-open door
        # still gets its NECKS widened -- only the pinches, never the whole road, or
        # every route on the continent would come out bulldozed to five cells.
        elbow = np.zeros_like(land, dtype=np.uint8)
        for nx, ny in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            elbow += np.roll(np.roll(walkable, ny, axis=0), nx, axis=1).astype(np.uint8)
        necks = thread & (elbow < 3)
        if open_here and not necks.any():
            continue
        # Dilated by TWO, not one. A 3-cell ribbon satisfies a flood fill but does not
        # survive the semantic map's blur-and-argmax, so Coastal Reef and Obsidian Cavern
        # were reachable in the class grid and still rendered as sealed in.
        seed = necks if open_here else thread
        widen = (g2.dilate(seed, 2) | (near if not open_here else np.zeros_like(land))) & land & ~blocked
        # An owner-drawn range is a gate, not an obstacle to route around. This pass
        # exists to guarantee every door an approach, and left unchecked it will
        # happily dissolve the wall that made the door meaningful -- which is how a
        # deliberately blocked path ends up "connected at different places".
        if owner_blockers is not None:
            widen &= ~owner_blockers
        widen &= np.isin(grid, [g2.CODE[n] for n in
                                ("mountain", "cliff", "forest", "snowForest", "deadForest",
                                 "obsidian", "duneRock", "landmarkSolid")])
        if not widen.any():
            continue
        before = grid.copy()
        grid[widen] = ground_of[host]
        broken = town_pairs_open()
        if broken:
            grid[:] = before          # the seal invariant outranks the approach
            carved.append({"landmark": name, "cells": 0, "reverted": broken})
            continue
        carved.append({"landmark": name, "act": host, "cells": int(widen.sum())})
    return grid, {
        "landmarkApproachesOpened": len([c for c in carved if c.get("cells")]),
        "landmarkApproachCells": sum(int(c.get("cells", 0)) for c in carved),
        "landmarkApproaches": carved,
    }


ROAD_NECK_NEIGHBOURS = 4   # walkable cells in the 3x3 box below which a road is a thread


def widen_render_fragile_roads(
    grid: np.ndarray,
    land: np.ndarray,
    membership: np.ndarray,
    protected: np.ndarray,
    owner_blockers: np.ndarray | None = None,
) -> tuple[np.ndarray, dict[str, object]]:
    """Open the one-cell necks left on authored roads by the walls and the ranges.

    A road can be perfectly connected in the class grid and still be absent from the art
    map: the semantic map blurs one-hot masks and takes an argmax, and a thread one cell
    wide loses that argmax to whatever it runs through. Obsidian Cavern's road came out
    of the act-3/4 wall as a single column of ash at x275 -- reachable by flood fill,
    two separate regions to the eye, which is exactly the "renders as sealed in" the
    owner has reported three review rounds running.

    Scoped to `protected`, so it widens ROADS and never the open country around them, and
    it may not touch an owner-drawn range: those are gates, and a gate that a road walks
    through is the point. Reverted whole if it breaks an act seal.
    """
    walkable = walkable_mask(grid)
    neighbours = np.zeros(grid.shape, dtype=np.uint8)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx or dy:
                neighbours += np.roll(np.roll(walkable, dy, axis=0), dx, axis=1).astype(np.uint8)
    necks = walkable & protected & land & (neighbours < ROAD_NECK_NEIGHBOURS)
    widen = g2.dilate(necks, 1) & land & ~walkable
    if owner_blockers is not None:
        widen &= ~owner_blockers
    widen &= np.isin(grid, [g2.CODE[n] for n in
                            ("mountain", "cliff", "forest", "snowForest", "deadForest",
                             "obsidian", "duneRock", "landmarkSolid")])
    if not widen.any():
        return grid, {"roadNeckCells": 0, "roadNecksWidened": 0}

    def seals_broken() -> bool:
        walk = walkable_mask(grid)
        for pair in (1, 2, 3, 4):
            here = reachable_from(walk, ACT_TOWN[pair])
            tx, ty = ACT_TOWN[pair + 1]
            if here[max(0, ty - 4):ty + 5, max(0, tx - 4):tx + 5].any():
                return True
        return False

    # One transaction PER NECK, not one for the whole pass. A neck sitting in the throat
    # of a connector is the one place widening a road does re-open a border, and a single
    # all-or-nothing revert threw away every safe widening on the continent along with it.
    painted = 0
    reverted = 0
    for component in g2.connected_components(widen):
        piece = np.zeros_like(widen)
        for x, y in component:
            piece[y, x] = True
        before = grid.copy()
        for act, name in ACT_GROUND.items():
            grid[piece & (membership == act)] = g2.CODE[name]
        if seals_broken():
            grid[:] = before
            reverted += 1
        else:
            painted += len(component)
    return grid, {"roadNeckCells": painted, "roadNecksWidened": int(necks.sum()),
                  "roadNecksReverted": reverted}


def build_pack(output: Path) -> dict[str, object]:
    output.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    stages: list[dict[str, object]] = []
    land, membership, coast_stage, joins = build_land(rng)
    stages.append({"stage": 1, "name": "consolidated-mountain-joined-organic-landmass", "result": "PASS", **coast_stage})
    paths, corridor_masks, protected, corridor_stage = build_corridors(land, rng)
    stages.append({"stage": 2, "name": "variable-width-winding-valley-corridors", "result": "PASS", **corridor_stage})
    land, moat, moat_bridge = g2.apply_demon_moat(land, paths)
    grid, _, boundary_masks = g2.base_terrain(land, membership, protected, rng)
    stages.append({"stage": 3, "name": "g2-organic-biomes-blends-and-rich-interiors", "result": "PASS"})
    grid, elevation, range_masks, _, range_metrics, crest_masks = g2.drape_ranges(
        grid, land, membership, protected, paths, rng,
    )
    # Before the rivers, so the wadi's sand-fraction width driver reads the rock as
    # it will finally stand, and before every later pass that re-clears the routes.
    grid, rock_stage = restructure_act3_rock(grid, land, membership, protected)
    throats = separator_throats(paths, corridor_masks)
    grid, river_masks, river_bridges, river_metrics = g2.drape_rivers(grid, land, membership, protected, rng)
    river_masks, river_metrics, dropped_river_cells = clip_rivers_to_land(
        river_masks, river_metrics, land, membership,
    )
    river_backgrounds = {2: "snow", 3: "sand", 4: "ash", 5: "deadGround"}
    for act, class_name in river_backgrounds.items():
        grid[dropped_river_cells & (membership == act)] = g2.CODE[class_name]
    grid, river_masks, river_metrics, lava_stage = shape_act4_lava_flow(
        grid, land, membership, protected, elevation, river_masks, river_metrics,
    )
    course_stage: dict[str, object] = {}
    for spec in WATERCOURSES:
        grid, river_masks, river_metrics, one_stage = shape_watercourse(
            spec, grid, land, membership, protected, river_masks, river_metrics,
        )
        course_stage.update(one_stage)
    grid, river_masks, river_metrics, river_bridges, lake_stage = replace_act2_river_with_lakes(
        grid, land, membership, protected, river_masks, river_metrics, river_bridges,
    )
    grid[~land] = g2.CODE["water"]
    grid, act1_hash = g2.overlay_act1_v4(grid)
    grid, join_stage = apply_join_mountains(grid, joins, protected, river_masks, membership)
    grid = g2.place_landmarks_and_trails(grid, land, protected, paths, moat, moat_bridge)
    grid = paint_natural_corridors(grid, land, membership, corridor_masks, paths)
    act1_rect = act1_rect_mask()
    grid[river_bridges & ~act1_rect] = g2.CODE["bridge"]
    grid, act2_open_cells = retain_act2_open_basin_richness(
        grid, land, membership, joins, protected,
    )
    # Sealing runs LAST. place_landmarks_and_trails and paint_natural_corridors
    # both re-clear authored routes ("barriers and rivers cannot sever it"), so
    # any seal painted before them would simply be carved open again.
    # The owner's hand-drawn ranges go in BEFORE the seals and the reachability passes,
    # so those passes shape themselves around the walls instead of the walls arriving
    # after the fact and re-severing routes they had already guaranteed.
    grid, owner_blockers, owner_stage = carve_owner_blockers(grid, land, membership, protected, river_masks)
    grid, seal_report = wall_act_borders(grid, land, membership)
    grid, rescue_report = rescue_isolated_doors(grid, land)
    seal_report.update(rescue_report)
    # Runs after the walls so a wall pass cannot clobber the stands, and before the
    # seal so the seal may weld itself to a stand edge instead of ending in mid-air.
    grid, approach_stage = open_landmark_approaches(grid, land, membership, owner_blockers)
    seal_report.update(approach_stage)
    grid, neck_stage = widen_render_fragile_roads(grid, land, membership, protected, owner_blockers)
    seal_report.update(neck_stage)
    grid, forest_stage = scatter_act4_dead_forest(grid, land, membership, protected)
    # Last terrain pass: everything that ADDS blockers (the joins, the walls, the
    # corridors) has already run, so the reachable share measured here is the one
    # that survives to the map.
    grid, growth_stage = grow_reachable_ground(grid, land, membership, protected, crest_masks, owner_blockers)
    grid, seal_cells = paint_magma_seal(grid, land, protected)
    seal_report.update(seal_cells)
    stages.append({"stage": 4, "name": "broad-blocked-separator-ranges-crossed-only-by-connector-dungeons",
                   "result": "PASS", **join_stage, **lava_stage, **course_stage, **lake_stage,
                   **forest_stage, **rock_stage, **growth_stage, **owner_stage, "separatorSeals": seal_report})
    stages.append({"stage": 5, "name": "approved-act1-v4-overlay-and-full-landmark-placement", "result": "PASS", "act1V4GridSha256": act1_hash, "act2OpenBasinCellsRetained": act2_open_cells})

    biome_distribution = g2.distribution(grid, membership, land)
    interior_metrics = g2.measure_final_interiors(grid, land, membership)
    linter = lint_pack(
        grid, land, membership, protected, paths, corridor_stage, throats,
        range_masks, range_metrics, river_metrics, interior_metrics, joins,
        river_masks, seal_report,
    )
    stages.append({"stage": 6, "name": "inherited-and-g3-genuine-linters", "result": linter["result"]})
    report = {
        "schema": "continent-macro-g3-consolidated-v1", "seed": SEED,
        "authorities": [
            "scripts/build_continent_terrain_class_macro_g2_organic.py",
            "design/continent-terrain-class-method/CONTINENT-MACRO-GEOGRAPHY-SPEC.md",
            "scripts/build_act1_terrain_class_macro_v4.py",
        ],
        "stageOrder": [stage["name"] for stage in stages], "stages": stages,
        "landmarks": {name: {"act": act, "position": list(point), "kind": kind}
                      for name, (act, point, kind) in g2.LANDMARKS.items()},
        "sourceCrossCheck": {"probeCount": len(g2.CONNECTION_PROBES), "authoredRouteCount": len(g2.ROUTE_GUIDES), "act1NaturalRouteCount": 7},
        "naturalnessSelfVerdict": "One consolidated mountain-joined landmass with an Act-1-exempt noise-sculpted outer coast and real variable-width winding corridor masks; acceptance depends on the measured linter report and rendered pack.",
    }
    write_data(output, grid, land, membership, protected, elevation, throats, river_masks,
               boundary_masks, crest_masks, joins, biome_distribution, linter, report)
    g2.render_pack(output, grid, land, membership, throats)
    correct_separator_sheet_labels(output)
    artifacts = {name: g2.sha256(output / name) for name in DETERMINISTIC_FILES}
    return {
        "result": linter["result"], "gridSha256": artifacts["terrain-classes.npy"],
        "stages": stages, "linter": linter, "biomeDistribution": biome_distribution,
        "artifacts": artifacts,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--verify-determinism", action="store_true")
    args = parser.parse_args()
    if not args.verify_determinism:
        print(json.dumps(build_pack(args.output), indent=2))
        return
    with tempfile.TemporaryDirectory(prefix="continent-g3-a-") as a, tempfile.TemporaryDirectory(prefix="continent-g3-b-") as b:
        build_pack(Path(a))
        build_pack(Path(b))
        hashes = [g2.pack_digest(Path(a)), g2.pack_digest(Path(b))]
    if hashes[0] != hashes[1]:
        fail(f"two-run determinism mismatch: {hashes}")
    result = build_pack(args.output)
    determinism = {
        "pass": True,
        "algorithm": "sha256(filename + NUL + bytes for all deterministic pack files)",
        "files": list(DETERMINISTIC_FILES), "runs": hashes,
    }
    (args.output / "determinism.json").write_text(json.dumps(determinism, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({**result, "determinism": determinism}, indent=2))


if __name__ == "__main__":
    main()
