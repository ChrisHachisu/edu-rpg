#!/usr/bin/env python3
"""Shared deterministic helpers for the Act 1 Gate-1 terrain-class pack."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from pathlib import Path
import hashlib
import json
import math
import re

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2"
OUTPUT = RUNTIME / "act1-terrain-class-g1"
RUNTIME_SNAPSHOT = ROOT / "src/map-engine/generated/act1RuntimeSnapshot.ts"
WIDTH, HEIGHT = 148, 182
WORLD_ORIGIN = (16, 218)
SEED = 42

CLASSES = (
    "water", "meadow", "trail", "lightForest", "forest", "cliff",
    "mountain", "structure", "landmarkSolid", "bridge",
)
CODE = {name: index for index, name in enumerate(CLASSES)}
WALKABLE = {CODE[name] for name in ("meadow", "trail", "lightForest", "bridge")}
BLOCKERS = {CODE[name] for name in ("forest", "cliff", "mountain")}
PALETTE = {
    "water": "#1b3a5b", "meadow": "#7fae5a", "trail": "#c8a26a",
    "lightForest": "#5f8043", "forest": "#24421f", "cliff": "#6b5d4f",
    "mountain": "#8a8f96", "structure": "#a89078", "landmarkSolid": "#4a4038",
    "bridge": "#b98a4e",
}
RGB = {name: tuple(int(PALETTE[name][i:i + 2], 16) for i in (1, 3, 5)) for name in CLASSES}

# OWNER-PLACED, 2026-07-29. Every `at` below is the owner's own cell from
# design/continent-terrain-class-method/layout-planner/owner-layout.json, converted to
# plate-local coordinates (world minus WORLD_ORIGIN). Three of them -- Whispering Woods
# Cave, Coastal Reef and Crystal Cave -- are projected onto the nearest cell of the
# runtime coastline, which is immutable and is NOT re-cut with the rest of Act 1:
# 2, 21 and 9 cells respectively. Everything else here (routes, gateways, crests, decks)
# is a function of these eight points, so nothing below may be re-derived from generator
# output and written back over them.
#
# `at` and `approach` are deliberately retained as separate validation probes.
LANDMARKS = {
    "Greenhollow": {"at": (53, 37), "approach": (53, 38), "kind": "town"},
    "Sunken Cellar": {"at": (14, 56), "approach": (14, 55), "kind": "dungeon"},
    "Whispering Woods Cave": {"at": (85, 15), "approach": (85, 16), "kind": "dungeon"},
    "Millbrook": {"at": (23, 126), "approach": (23, 125), "kind": "town"},
    "Port Sapphire": {"at": (117, 129), "approach": (117, 128), "kind": "town"},
    "Coastal Reef": {"at": (126, 134), "approach": (126, 133), "kind": "dungeon"},
    "Darkfang Grotto": {"at": (75, 160), "approach": (75, 159), "kind": "dungeon"},
    "Crystal Cave": {"at": (124, 60), "approach": (124, 61), "kind": "dungeon"},
}
CRYSTAL_GATE = (117, 72)
BRIDGE_DECKS = {
    # Mirrored by the runtime constants in src/map-engine/act1Overworld.ts as world
    # coords (these plus WORLD_ORIGIN). The two must move together or the player walks
    # onto water: do not infer, resize, or redraw these decks on one side only.
    "greenhollow-millbrook-bridge": [(23, 94), (23, 95), (23, 96)],
    "port-reef-causeway": [(124, 126)],
}
# The Millbrook River runs east to west from the inland lake's western shore to the west
# coast, so lake plus river together sever the northern Greenhollow basin from the
# southern Millbrook basin. The ford at (23, 94..96) is the only crossing.
RIVER_CREST = [(69, 92), (58, 93), (46, 91), (34, 93), (23, 95), (16, 97), (9, 100)]
# Crystal Range: east-west across the eastern lobe, dipping at the sealed saddle.
CRYSTAL_CREST = [(85, 78), (96, 76), (106, 74), (117, 72), (127, 70), (133, 67)]
# Darkfang highlands: east-west across the southern peninsula, dipping at the canyon mouth.
DARKFANG_CREST = [(56, 154), (67, 152), (78, 150), (85, 149), (94, 146), (104, 142)]
ROUTES = {
    "greenhollow-to-sunken-cellar": [(53, 38), (42, 44), (28, 51), (14, 55)],
    "greenhollow-to-whispering-woods-cave": [(53, 38), (57, 31), (71, 21), (85, 16)],
    "greenhollow-to-millbrook": [(53, 38), (57, 48), (44, 53), (36, 72), (23, 95), (24, 112), (23, 125)],
    "millbrook-to-port-sapphire": [(23, 125), (45, 129), (76, 131), (103, 128), (117, 128)],
    "port-sapphire-to-coastal-reef": [(117, 128), (122, 125), (124, 126), (125, 131), (126, 133)],
    "port-sapphire-to-darkfang": [(117, 128), (108, 136), (97, 143), (85, 150), (75, 159)],
    "port-sapphire-to-crystal-cave": [(117, 128), (122, 113), (113, 97), (120, 80), (117, 72), (124, 61)],
}
GATEWAYS = {
    "greenhollow-millbrook-bridge": {"a": (53, 38), "b": (23, 125), "min": 1, "max": 2, "formation": "bridge over the Millbrook River"},
    "millbrook-port-pass": {"a": (23, 125), "b": (117, 128), "min": 2, "max": 4, "formation": "wooded valley gap"},
    "port-reef-causeway": {"a": (117, 128), "b": (126, 133), "min": 1, "max": 2, "formation": "bridge over harbor channel and dry reef shelf"},
    "port-darkfang-gap": {"a": (117, 128), "b": (75, 159), "min": 2, "max": 3, "formation": "highland saddle / canyon mouth"},
    "port-crystal-seal-gate": {"a": (117, 128), "b": (124, 61), "min": 2, "max": 3, "formation": "sealed mountain saddle"},
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def local_to_world(point: tuple[int, int]) -> tuple[int, int]:
    return point[0] + WORLD_ORIGIN[0], point[1] + WORLD_ORIGIN[1]


def load_land() -> np.ndarray:
    """Load the runtime-authoritative 148×182 coastline, never downsample art."""
    text = RUNTIME_SNAPSHOT.read_text(encoding="utf-8")
    match = re.search(
        r"export const ACT1_RUNTIME_SNAPSHOT_ROWS = \[(.*?)\n\] as const;",
        text,
        flags=re.DOTALL,
    )
    if match is None:
        raise ValueError("ACT1_RUNTIME_SNAPSHOT_ROWS declaration was not found")
    rows = re.findall(r"'([0-9a-z]+)'", match.group(1))
    if len(rows) != HEIGHT or any(len(row) != WIDTH for row in rows):
        raise ValueError(
            f"runtime snapshot must be {HEIGHT} rows of {WIDTH} cells; "
            f"got {len(rows)} rows and widths {sorted({len(row) for row in rows})}"
        )
    codes = set("".join(rows))
    if not codes.issubset(set("0123456789abcdefghijklmnopqrstuvwxyz")):
        raise ValueError(f"unexpected runtime snapshot codes: {sorted(codes)}")
    # Exactly mirrors the runtime water test: char === '2'. Every other code is land.
    return np.asarray([[char != "2" for char in row] for row in rows], dtype=bool)


def xy() -> tuple[np.ndarray, np.ndarray]:
    return np.meshgrid(np.arange(WIDTH), np.arange(HEIGHT))


def value_noise(shape: tuple[int, int], spacing: int, rng: np.random.Generator) -> np.ndarray:
    """Small seeded gradient/value-noise field with smooth interpolation."""
    h, w = shape
    gy = math.ceil((h - 1) / spacing) + 2
    gx = math.ceil((w - 1) / spacing) + 2
    knots = rng.uniform(-1.0, 1.0, size=(gy, gx))
    yy, xx = np.indices(shape)
    ix, iy = xx // spacing, yy // spacing
    fx, fy = (xx % spacing) / spacing, (yy % spacing) / spacing
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    top = knots[iy, ix] * (1 - fx) + knots[iy, ix + 1] * fx
    bottom = knots[iy + 1, ix] * (1 - fx) + knots[iy + 1, ix + 1] * fx
    return top * (1 - fy) + bottom * fy


def fbm(shape: tuple[int, int], rng: np.random.Generator) -> np.ndarray:
    field = 0.58 * value_noise(shape, 17, rng)
    field += 0.29 * value_noise(shape, 8, rng)
    field += 0.13 * value_noise(shape, 3, rng)
    return field


def distance_to_polyline(points: list[tuple[float, float]]) -> np.ndarray:
    yy, xx = np.indices((HEIGHT, WIDTH), dtype=float)
    result = np.full((HEIGHT, WIDTH), np.inf)
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        dx, dy = x2 - x1, y2 - y1
        length2 = dx * dx + dy * dy
        t = np.clip(((xx - x1) * dx + (yy - y1) * dy) / max(length2, 1e-9), 0, 1)
        result = np.minimum(result, np.hypot(xx - (x1 + t * dx), yy - (y1 + t * dy)))
    return result


def distance_to_points(points: list[tuple[float, float]]) -> np.ndarray:
    yy, xx = np.indices((HEIGHT, WIDTH), dtype=float)
    return np.min([np.hypot(xx - x, yy - y) for x, y in points], axis=0)


def project_to_land(land: np.ndarray, point: tuple[int, int]) -> tuple[int, int]:
    """Nearest 4-neighbour land cell, with stable y/x tie breaking."""
    x, y = point
    if 0 <= x < WIDTH and 0 <= y < HEIGHT and land[y, x]:
        return point
    yy, xx = np.indices(land.shape)
    score = (xx - x) ** 2 + (yy - y) ** 2 + np.where(land, 0, 1_000_000)
    py, px = np.unravel_index(np.argmin(score), score.shape)
    return int(px), int(py)


def coast_distance(land: np.ndarray) -> np.ndarray:
    distance = np.full(land.shape, 10_000, dtype=np.int16)
    queue: deque[tuple[int, int]] = deque()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            if not land[y, x]:
                distance[y, x] = 0
                queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        for nx, ny in neighbors(x, y):
            if 0 <= nx < WIDTH and 0 <= ny < HEIGHT and distance[ny, nx] > distance[y, x] + 1:
                distance[ny, nx] = distance[y, x] + 1
                queue.append((nx, ny))
    return distance


def neighbors(x: int, y: int) -> tuple[tuple[int, int], ...]:
    return ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))


def disk(mask: np.ndarray, center: tuple[int, int], radius: int) -> None:
    x, y = center
    yy, xx = np.indices(mask.shape)
    mask |= (xx - x) ** 2 + (yy - y) ** 2 <= radius ** 2


def wobble_line(points: list[tuple[int, int]], rng: np.random.Generator, amount: float = 1.7) -> list[tuple[float, float]]:
    output = [tuple(map(float, points[0]))]
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        dx, dy = x2 - x1, y2 - y1
        length = max(math.hypot(dx, dy), 1)
        nx, ny = -dy / length, dx / length
        steps = max(2, round(length / 7))
        for step in range(1, steps):
            t = step / steps
            offset = rng.uniform(-amount, amount)
            output.append((x1 + dx * t + nx * offset, y1 + dy * t + ny * offset))
        output.append((float(x2), float(y2)))
    return output


def line_corridor(points: list[tuple[int, int]], width: float, rng: np.random.Generator, amount: float = 1.6) -> np.ndarray:
    line = wobble_line(points, rng, amount)
    distance = distance_to_polyline(line)
    edge_noise = fbm((HEIGHT, WIDTH), rng)
    yy, xx = np.indices((HEIGHT, WIDTH))
    width_field = width + 0.75 * edge_noise + 0.35 * np.sin(xx * 0.41 + yy * 0.27)
    return distance <= np.maximum(0.75, width_field)


def connected_components(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    seen = np.zeros(mask.shape, bool)
    components: list[list[tuple[int, int]]] = []
    for y, x in zip(*np.where(mask & ~seen)):
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
        components.append(component)
    return components


def reachable(grid: np.ndarray, start: tuple[int, int], end: tuple[int, int], blocked: np.ndarray | None = None) -> bool:
    sx, sy = start
    ex, ey = end
    if not (0 <= sx < WIDTH and 0 <= sy < HEIGHT and 0 <= ex < WIDTH and 0 <= ey < HEIGHT):
        return False
    if grid[sy, sx] not in WALKABLE or grid[ey, ex] not in WALKABLE:
        return False
    if blocked is not None and (blocked[sy, sx] or blocked[ey, ex]):
        return False
    seen = np.zeros(grid.shape, bool)
    queue = deque([(sx, sy)])
    seen[sy, sx] = True
    while queue:
        x, y = queue.popleft()
        if (x, y) == (ex, ey):
            return True
        for nx, ny in neighbors(x, y):
            if (0 <= nx < WIDTH and 0 <= ny < HEIGHT and not seen[ny, nx]
                    and grid[ny, nx] in WALKABLE and (blocked is None or not blocked[ny, nx])):
                seen[ny, nx] = True
                queue.append((nx, ny))
    return False


def shortest_path(grid: np.ndarray, start: tuple[int, int], end: tuple[int, int],
                  elevation: np.ndarray | None = None, noise: np.ndarray | None = None) -> list[tuple[int, int]]:
    """Deterministic terrain-following Dijkstra; forest is never a road shortcut."""
    import heapq
    sx, sy = start
    ex, ey = end
    costs = {CODE["meadow"]: 1.0, CODE["trail"]: 0.8, CODE["lightForest"]: 1.8, CODE["bridge"]: 0.7}
    heap = [(0.0, sy, sx)]
    previous: dict[tuple[int, int], tuple[int, int] | None] = {(sx, sy): None}
    while heap:
        score, y, x = heapq.heappop(heap)
        if (x, y) == (ex, ey):
            path = []
            at: tuple[int, int] | None = (x, y)
            while at is not None:
                path.append(at)
                at = previous[at]
            return path[::-1]
        if score != min_score.get((x, y), score):
            continue
        for nx, ny in neighbors(x, y):
            if not (0 <= nx < WIDTH and 0 <= ny < HEIGHT) or grid[ny, nx] not in costs:
                continue
            slope = 0.0 if elevation is None else 2.2 * abs(float(elevation[ny, nx]) - float(elevation[y, x]))
            wander = 0.0 if noise is None else 0.18 * (float(noise[ny, nx]) + 1.0)
            candidate = score + costs[int(grid[ny, nx])] + slope + wander
            if candidate < min_score.get((nx, ny), math.inf):
                min_score[(nx, ny)] = candidate
                previous[(nx, ny)] = (x, y)
                heapq.heappush(heap, (candidate, ny, nx))
    raise ValueError(f"no existing walkable route from {start} to {end}")


# Defined after function construction to keep the priority ordering deterministic.
min_score: dict[tuple[int, int], float] = {}


def path_with_cost(grid: np.ndarray, start: tuple[int, int], end: tuple[int, int],
                   elevation: np.ndarray | None = None, noise: np.ndarray | None = None) -> list[tuple[int, int]]:
    global min_score
    min_score = {start: 0.0}
    return shortest_path(grid, start, end, elevation, noise)


def force_walkable(grid: np.ndarray, points: list[tuple[int, int]], cls: str = "meadow") -> None:
    for x, y in points:
        if 0 <= x < WIDTH and 0 <= y < HEIGHT:
            grid[y, x] = CODE[cls]


def write_class_artifacts(grid: np.ndarray, output: Path = OUTPUT) -> dict[str, str]:
    output.mkdir(parents=True, exist_ok=True)
    np.save(output / "terrain-classes.npy", grid)
    payload = {
        "schema": "act1-terrain-class-g1-v1",
        "seed": SEED,
        "world": {"size": [320, 400], "bounds": [16, 218, 163, 399], "plateSize": [WIDTH, HEIGHT]},
        "classes": list(CLASSES),
        "grid": grid.tolist(),
    }
    (output / "terrain-classes.json").write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    image = Image.fromarray(grid, mode="P")
    palette: list[int] = []
    for name in CLASSES:
        palette.extend(RGB[name])
    image.putpalette(palette + [0] * (768 - len(palette)))
    image.save(output / "terrain-classes-indexed.png", optimize=False, compress_level=9)
    return {name: sha256(output / name) for name in ("terrain-classes.npy", "terrain-classes.json", "terrain-classes-indexed.png")}


def grid_from_output(output: Path = OUTPUT) -> np.ndarray:
    grid = np.load(output / "terrain-classes.npy")
    if grid.shape != (HEIGHT, WIDTH):
        raise ValueError(f"unexpected class-grid shape: {grid.shape}")
    return grid.astype(np.uint8)


def distribution(grid: np.ndarray, land: np.ndarray) -> dict[str, object]:
    total = int(land.sum())
    counts = {name: int(((grid == CODE[name]) & land).sum()) for name in CLASSES}
    bucket = {
        "open": counts["meadow"],
        "trail": counts["trail"],
        "denseForest": counts["forest"],
        "cliffMountain": counts["cliff"] + counts["mountain"],
    }
    return {
        "landCells": total,
        "counts": counts,
        "percentages": {key: value * 100 / total for key, value in bucket.items()},
        "targets": {"open": [28, 36], "trail": [6, 10], "denseForest": [42, 52], "cliffMountain": [10, 16]},
    }
