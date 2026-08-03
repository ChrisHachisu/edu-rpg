#!/usr/bin/env python3
"""Render semantic overworld classes as deterministic continuous-field DQ art.

The terrain base is sampled in world-pixel coordinates from smooth value-noise
and Bayer-dithered tone ramps.  It never pastes tiles, atlas cells, or textures.
Object silhouettes are deterministic overlays derived from the same class grid.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

# Reuse the validated cell-graph -> Catmull-Rom centerline pipeline built for
# the Act 1 finalize pass (detect_plazas/trace_linear_segments/stroke_segments)
# instead of reimplementing it -- the same "fix it in the base, not a
# post-process overlay" pattern already used here for mountains/trees. Not an
# installable package, so loaded by path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent /
                        "design/review/overworld-art-blueprint/act-by-act/act1/dq-art-full-v2"))
from finalize_full_map import (  # noqa: E402
    ROAD_STROKE_WIDTH_FRACTION, TRAIL_WIDTH_CLAMP_FRACTION,
    binary_dilate, components, detect_plazas, gaussian_like_blur,
    stroke_segments, trace_linear_segments,
)


TILE = 48
DEFAULT_BOUNDS = (16, 218, 163, 399)
DEFAULT_CROP = (118, 338)
DEFAULT_MAP = Path(
    "design/review/overworld-art-blueprint/continent/continent-macro-g3/terrain-classes.json"
)
DEFAULT_OUTPUT = Path(
    "design/review/overworld-art-blueprint/act-by-act/act1/dq-art-pilot"
)
B4 = np.array(((0, 8, 2, 10), (12, 4, 14, 6), (3, 11, 1, 9), (15, 7, 13, 5)))

# Dark, muted material ramps: shadow -> body -> upper-left highlight.
RAMPS_HEX = {
    "meadow": ("#142018", "#263522", "#3d5030", "#5f7044"),
    "forestFloor": ("#0a100d", "#121b14", "#202b1d", "#34402a"),
    "forest": ("#07110c", "#102218", "#1e3825", "#3d5634"),
    "rock": ("#171817", "#302f2b", "#504d43", "#77705d"),
    "cliff": ("#111416", "#292d2e", "#494b47", "#716e64"),
    "water": ("#091725", "#102d40", "#20506a", "#467482"),
    "trail": ("#30231a", "#4c3826", "#705738", "#927c56"),
    "snow": ("#4a5863", "#78858c", "#abb0aa", "#d3cec0"),
    "snowForest": ("#17232a", "#2e4146", "#54676a", "#9ba5a1"),
    "sand": ("#493c2b", "#6c5940", "#927a55", "#b29b70"),
    "duneRock": ("#302b27", "#52483c", "#776752", "#9b886a"),
    "ash": ("#171719", "#2a292b", "#444144", "#625e5c"),
    "obsidian": ("#08090d", "#141620", "#252936", "#4a5262"),
    "charcoal": ("#111213", "#222425", "#373938", "#54534e"),
    "deadGround": ("#24241f", "#3b3930", "#555144", "#746c59"),
    "deadForest": ("#151717", "#292c2a", "#434640", "#68685e"),
    "iceRiver": ("#253944", "#49616b", "#78909a", "#b0bdbe"),
    "oasisWater": ("#0a2530", "#12404a", "#26646b", "#57908b"),
    "lava": ("#351713", "#68261a", "#9a4322", "#c87536"),
    "darkRiver": ("#080f18", "#111f2b", "#203443", "#3a5260"),
}
RAMPS = {name: np.array([tuple(bytes.fromhex(c[1:])) for c in ramp], dtype=np.uint8) for name, ramp in RAMPS_HEX.items()}
FOAM = np.array((126, 151, 153), dtype=np.uint8)
OUTLINE = (18, 19, 18)
TRUNK = (46, 35, 25)
TRUNK_DARK = (25, 22, 18)

WATER_VARIANTS = {"water", "iceRiver", "oasisWater", "lava", "darkRiver"}
ROCK_VARIANTS = {"mountain", "cliff", "duneRock", "obsidian"}
# Peak silhouettes belong to true mountain masses only. `cliff` stays a ROCK_VARIANT for
# the continuous rock FILL, but isolated cliff cells scattered through meadow were each
# receiving a peak glyph -- that is why cones appeared in open green fields far from any
# range. Fill and peak-eligibility are now separate concerns.
PEAK_VARIANTS = ROCK_VARIANTS - {"cliff"}
FOREST_VARIANTS = {"forest", "lightForest", "snowForest", "deadForest"}


def parse_bounds(text: str) -> tuple[int, int, int, int]:
    parts = tuple(int(value) for value in text.split(","))
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("bounds must be x0,y0,x1,y1")
    return parts


def parse_point(text: str) -> tuple[int, int]:
    parts = tuple(int(value) for value in text.split(","))
    if len(parts) != 2:
        raise argparse.ArgumentTypeError("point must be x,y")
    return parts


def _hex_ramp(name: str) -> np.ndarray:
    return RAMPS[name]


def _hash_noise(ix: np.ndarray, iy: np.ndarray, seed: int) -> np.ndarray:
    """The dq-tiles.js integer hash, vectorized with explicit uint32 overflow."""
    x = np.asarray(ix, dtype=np.int64).astype(np.uint32)
    y = np.asarray(iy, dtype=np.int64).astype(np.uint32)
    with np.errstate(over="ignore"):
        h = x * np.uint32(374761393) + y * np.uint32(668265263) + np.uint32(seed) * np.uint32(2147483647)
        h = (h ^ (h >> np.uint32(13))) * np.uint32(1274126177)
        h = h ^ (h >> np.uint32(16))
    return (h & np.uint32(0xFFFF)).astype(np.float32) / np.float32(65535.0)


def vnoise(x: np.ndarray, y: np.ndarray, scale: float, seed: int) -> np.ndarray:
    fx, fy = x / scale, y / scale
    ix, iy = np.floor(fx).astype(np.int64), np.floor(fy).astype(np.int64)
    tx, ty = fx - ix, fy - iy
    sx, sy = tx * tx * (3.0 - 2.0 * tx), ty * ty * (3.0 - 2.0 * ty)
    a, b = _hash_noise(ix, iy, seed), _hash_noise(ix + 1, iy, seed)
    c, d = _hash_noise(ix, iy + 1, seed), _hash_noise(ix + 1, iy + 1, seed)
    return (a * (1.0 - sx) + b * sx) * (1.0 - sy) + (c * (1.0 - sx) + d * sx) * sy


def _sample_mask(mask: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    return mask[np.clip(y, 0, mask.shape[0] - 1), np.clip(x, 0, mask.shape[1] - 1)]


def field_at(mask: np.ndarray, wx: np.ndarray, wy: np.ndarray, amp: float, scale: float, seed: int) -> np.ndarray:
    fx, fy = wx / TILE - 0.5, wy / TILE - 0.5
    x0, y0 = np.floor(fx).astype(np.int32), np.floor(fy).astype(np.int32)
    rx, ry = fx - x0, fy - y0
    a = _sample_mask(mask, x0, y0)
    b = _sample_mask(mask, x0 + 1, y0)
    c = _sample_mask(mask, x0, y0 + 1)
    d = _sample_mask(mask, x0 + 1, y0 + 1)
    smooth = (a * (1.0 - rx) + b * rx) * (1.0 - ry) + (c * (1.0 - rx) + d * rx) * ry
    return smooth + (vnoise(wx, wy, scale, seed) - 0.5) * amp


def ramp_dither(wx: np.ndarray, wy: np.ndarray, value: np.ndarray, ramp: np.ndarray) -> np.ndarray:
    scaled = np.clip(value, 0.0, 1.0) * (len(ramp) - 1)
    low = np.floor(scaled).astype(np.int16)
    high = np.minimum(low + 1, len(ramp) - 1)
    threshold = (B4[np.mod(wy.astype(np.int64), 4), np.mod(wx.astype(np.int64), 4)] + 0.5) / 16.0
    index = np.where((scaled - low) > threshold, high, low)
    return ramp[index]


def palette_name(class_name: str) -> str:
    return {
        "tundra": "snow", "aridFoothill": "sand", "scorched": "ash",
        "structure": "deadGround", "landmarkSolid": "rock",
    }.get(class_name, class_name if class_name in RAMPS else "meadow")


def read_map(path: Path) -> tuple[dict, np.ndarray, list[str]]:
    data = json.loads(path.read_text())
    classes = data["classes"]
    grid = np.asarray(data["grid"], dtype=np.uint8)
    expected = tuple(data["world"]["size"])
    if grid.shape != (expected[1], expected[0]):
        raise ValueError(f"grid {grid.shape} does not match declared world {expected}")
    return data, grid, classes


def _class_mask(grid: np.ndarray, classes: list[str], names: set[str]) -> np.ndarray:
    ids = np.array([i for i, name in enumerate(classes) if name in names], dtype=np.uint8)
    return np.isin(grid, ids).astype(np.float32)


def _road_network(grid: np.ndarray, classes: list[str], region: tuple[int, int, int, int]
                  ) -> tuple[np.ndarray, list[list[tuple[int, int]]], tuple[int, int, int, int]]:
    """Trace trail+bridge cells within `region` (INCLUSIVE x0,y0,x1,y1, same
    convention as `bounds` elsewhere in this file) into plaza blobs + road
    centerline segments, via the imported finalize_full_map.py pipeline.

    Bridges are folded into the road graph here (unlike finalize_full_map's
    own post-process, which PROTECTS bridges from its fill because by that
    point they already carry real AI-painted bridge art). At the BASE stage
    a bridge is still just flat dirt continuing the road across water --
    draw_bridge_rails() layers the rail overlay on top afterward, unchanged
    -- so it belongs in the same centerline as its approach roads.
    """
    x0, y0, x1, y1 = region
    region_bounds = (x0, y0, x1 + 1, y1 + 1)  # half-open: what stroke_segments/cells_to_pixel_mask expect
    trail_id, bridge_id = classes.index("trail"), classes.index("bridge")
    road_cells = np.isin(grid[y0:y1 + 1, x0:x1 + 1], (trail_id, bridge_id))
    plaza = detect_plazas(road_cells)
    segments = trace_linear_segments(road_cells & ~plaza)
    return plaza, segments, region_bounds


def _road_masks(grid: np.ndarray, classes: list[str], region: tuple[int, int, int, int],
                bounds: tuple[int, int, int, int], sample: int, canvas_shape: tuple[int, int]) -> np.ndarray:
    """Rasterize the road network at render_base's own OUTPUT resolution for
    THIS `bounds`/`sample` (canvas_shape == render_base's (height, width)) --
    ponytail: no caching. `_road_network` always retraces the network over
    the FIXED `region` (Act 1, never the caller's own `bounds`), and that
    retrace is cheap (~800 cells, single-digit ms) -- so every render_base()
    call (one tile, a crop, the full map, a fresh `python3 ...` process for
    each of the campaign's 120 tiles) recomputes byte-identical segments and
    strokes the SAME curve, just clipped to a different window. That's what
    keeps the road seamless at tile/strip boundaries: no fragment ever gets
    its own independent curve fit.

    Plazas are rounded PER COMPONENT, cropped to that component's own fixed
    cell bounding box (+ margin) -- never to `bounds`. gaussian_like_blur/
    binary_dilate edge-pad at whatever array boundary they're given, so
    rounding directly on a `bounds`-sized canvas (as a first pass did) made
    two independently rendered adjacent tiles disagree pixel-for-pixel right
    where a plaza sits near their shared seam -- caught by rendering
    tile-4-6/tile-4-7 separately and diffing their overlap (227px differed).
    A component-fixed crop is call-invariant, so every caller looks up the
    same rounded pixels regardless of which window is being rendered.
    """
    plaza, segments, region_bounds = _road_network(grid, classes, region)
    px_per_cell = TILE // sample  # TILE % sample == 0 already guaranteed by render()
    origin = (bounds[0], bounds[1])
    road = stroke_segments(segments, canvas_shape, region_bounds, origin, px_per_cell,
                           ROAD_STROKE_WIDTH_FRACTION * px_per_cell)
    if plaza.any():
        rx0, ry0 = region_bounds[0], region_bounds[1]
        margin = 2  # cells of true-data headroom for the sub-cell blur sigma/dilate radius below
        for group in components(plaza):  # group: list of (col, row) cells, region-local
            gxs, gys = tuple(c[0] for c in group), tuple(c[1] for c in group)
            cx0, cx1 = max(0, min(gxs) - margin), min(plaza.shape[1], max(gxs) + margin + 1)
            cy0, cy1 = max(0, min(gys) - margin), min(plaza.shape[0], max(gys) + margin + 1)
            crop_px = np.repeat(np.repeat(plaza[cy0:cy1, cx0:cx1], px_per_cell, 0), px_per_cell, 1)
            rounded = gaussian_like_blur(crop_px, 0.35 * px_per_cell) >= 0.5
            rounded &= binary_dilate(crop_px, round(TRAIL_WIDTH_CLAMP_FRACTION * px_per_cell))
            dst_x, dst_y = round((cx0 + rx0 - origin[0]) * px_per_cell), round((cy0 + ry0 - origin[1]) * px_per_cell)
            sx0, sy0 = max(0, -dst_x), max(0, -dst_y)
            h = min(rounded.shape[0] - sy0, canvas_shape[0] - max(0, dst_y))
            w = min(rounded.shape[1] - sx0, canvas_shape[1] - max(0, dst_x))
            if h > 0 and w > 0:
                dy0, dx0 = max(0, dst_y), max(0, dst_x)
                road[dy0:dy0 + h, dx0:dx0 + w] |= rounded[sy0:sy0 + h, sx0:sx0 + w]
    return road


def render_base(grid: np.ndarray, classes: list[str], bounds: tuple[int, int, int, int], sample: int) -> Image.Image:
    """Render in bounded horizontal strips; only the downscaled result is resident."""
    x0, y0, x1, y1 = bounds
    width, height = (x1 - x0 + 1) * TILE // sample, (y1 - y0 + 1) * TILE // sample
    result = Image.new("RGB", (width, height))
    water_mask = _class_mask(grid, classes, WATER_VARIANTS | {"bridge"})
    rock_mask = _class_mask(grid, classes, ROCK_VARIANTS)
    forest_mask = _class_mask(grid, classes, FOREST_VARIANTS)
    # Smooth centerline road/plaza mask, already at THIS call's output
    # resolution -- see _road_masks. Computed once here (not per-strip), so
    # every strip below just slices rows out of one consistent array.
    road_mask = _road_masks(grid, classes, DEFAULT_BOUNDS, bounds, sample, (height, width))

    world_x = x0 * TILE + np.arange(width, dtype=np.float32)[None, :] * sample
    for oy in range(0, height, 192):
        strip_h = min(192, height - oy)
        world_y = y0 * TILE + (oy + np.arange(strip_h, dtype=np.float32)[:, None]) * sample
        wx = np.broadcast_to(world_x, (strip_h, width))
        wy = np.broadcast_to(world_y, (strip_h, width))
        # Domain-warped class lookup. Sampling the class grid at straight world
        # coordinates makes EVERY class boundary a hard cell edge -- the 90-degree
        # "square corners" the owner rejected. water/forest/rock each dodged this with
        # their own field_at() smoothing; every other transition (meadow<->lightForest,
        # <->sand, <->snow, <->tundra) had none. Warping the SAMPLE POINT instead makes
        # all of them organic at once, at a fraction of a cell, with one noise pair.
        # Collision is computed from `grid` directly, never from this render, so a
        # sub-cell art wobble does not move a walkable boundary -- exactly the tolerance
        # the existing water/forest/rock smoothing already runs at.
        # Two octaves: the coarse one bends the boundary, the fine one breaks up the
        # residual straight runs left between bends.
        warp = TILE * 0.85
        nx = (vnoise(wx, wy, 23, 8110) - 0.5) * 0.72 + (vnoise(wx, wy, 8, 8112) - 0.5) * 0.28
        ny = (vnoise(wx, wy, 23, 8111) - 0.5) * 0.72 + (vnoise(wx, wy, 8, 8113) - 0.5) * 0.28
        wx_w = wx + nx * warp
        wy_w = wy + ny * warp
        tx = np.clip((wx_w // TILE).astype(np.int32), 0, grid.shape[1] - 1)
        ty = np.clip((wy_w // TILE).astype(np.int32), 0, grid.shape[0] - 1)
        class_ids = grid[ty, tx]
        class_names = np.asarray(classes, dtype=object)[class_ids]

        broad = vnoise(wx, wy, 76, 11) * 0.70 + vnoise(wx, wy, 31, 12) * 0.30
        fine = vnoise(wx, wy, 9, 121)
        shade = np.clip((broad - 0.5) * 1.28 + 0.5 + (fine - 0.5) * 0.10, 0.0, 1.0)
        rgb = ramp_dither(wx, wy, shade, _hex_ramp("meadow"))

        # Every semantic class receives a continuous world-coordinate tone field.
        for class_name in classes:
            where = class_names == class_name
            if not np.any(where) or class_name in WATER_VARIANTS | ROCK_VARIANTS or class_name in {"trail", "bridge"}:
                continue
            ramp_name = "forestFloor" if class_name in FOREST_VARIANTS else palette_name(class_name)
            material = ramp_dither(wx, wy, shade, _hex_ramp(ramp_name))
            rgb[where] = material[where]

        # Organic forest-floor edge from the same centre-interpolated scalar-field technique.
        forest_field = field_at(forest_mask, wx, wy, 0.16, 22, 151)
        forest_where = forest_field >= 0.50
        forest_floor = ramp_dither(wx, wy, np.clip(shade * 0.78, 0, 1), _hex_ramp("forestFloor"))
        rgb[forest_where] = forest_floor[forest_where]

        # Open walkable ground carries real grass/fern detail. A flat green field gives
        # img2img nothing to preserve, so the model fills the vacuum with canopy -- that is
        # the "trees on walkable ground" failure. Runs after the forest-floor edge so dense
        # forest keeps its own material; water/rock/trail below still override as before.
        # Each class keeps its own ramp -- this adds high-frequency detail, not new colour.
        open_where = np.isin(class_names, ("meadow", "lightForest")) & ~forest_where
        if np.any(open_where):
            tuft = vnoise(wx, wy, 5, 613) * 0.60 + vnoise(wx, wy, 2, 907) * 0.40
            grass_shade = np.clip(shade + (tuft - 0.5) * 0.30, 0.0, 1.0)
            for class_name in ("meadow", "lightForest"):
                where = open_where & (class_names == class_name)
                if not np.any(where):
                    continue
                ramp_name = "forestFloor" if class_name in FOREST_VARIANTS else palette_name(class_name)
                grass = ramp_dither(wx, wy, grass_shade, _hex_ramp(ramp_name))
                rgb[where] = grass[where]

        water_field = field_at(water_mask, wx, wy, 0.24, 20, 33)
        water_where = water_field >= 0.50
        for variant in WATER_VARIANTS:
            where = water_where & (class_names == variant)
            if not np.any(where):
                continue
            depth = np.clip((water_field - 0.5) * 1.05 + (0.5 - vnoise(wx, wy, 56, 5)) * 0.38 + 0.12, 0, 1)
            water_rgb = ramp_dither(wx, wy, 1.0 - depth, _hex_ramp(variant))
            glint = vnoise(wx, wy * 2.3, 11, 17) > 0.95
            water_rgb[glint] = _hex_ramp(variant)[-1]
            rgb[where] = water_rgb[where]
        # Field expansion into coast cells inherits the normal-water ramp in this pilot.
        expanded_water = water_where & ~np.isin(class_names, tuple(WATER_VARIANTS))
        if np.any(expanded_water):
            depth = np.clip((water_field - 0.5) * 1.05 + (0.5 - vnoise(wx, wy, 56, 5)) * 0.38 + 0.12, 0, 1)
            water_rgb = ramp_dither(wx, wy, 1.0 - depth, _hex_ramp("water"))
            rgb[expanded_water] = water_rgb[expanded_water]
        foam_where = (water_field >= 0.50) & (water_field < 0.565)
        rgb[foam_where] = FOAM

        rock_field = field_at(rock_mask, wx, wy, 0.20, 18, 91)
        rock_where = (rock_field >= 0.50) & ~water_where
        elev = (vnoise(wx, wy, 44, 71) * 0.50 + vnoise(wx, wy, 20, 73) * 0.35 + vnoise(wx, wy, 9, 75) * 0.15)
        e_l = vnoise(wx - sample, wy, 44, 71) * 0.50 + vnoise(wx - sample, wy, 20, 73) * 0.35 + vnoise(wx - sample, wy, 9, 75) * 0.15
        e_u = vnoise(wx, wy - sample, 44, 71) * 0.50 + vnoise(wx, wy - sample, 20, 73) * 0.35 + vnoise(wx, wy - sample, 9, 75) * 0.15
        light = np.clip(0.46 + (e_l - elev + e_u - elev) * (4.2 / sample) + (elev - 0.5) * 0.15, 0, 1)
        for variant in ROCK_VARIANTS:
            where = rock_where & (class_names == variant)
            if not np.any(where):
                continue
            ramp_name = "cliff" if variant == "cliff" else variant if variant in RAMPS else "rock"
            rock_rgb = ramp_dither(wx, wy, light, _hex_ramp(ramp_name))
            rgb[where] = rock_rgb[where]
        expanded_rock = rock_where & ~np.isin(class_names, tuple(ROCK_VARIANTS))
        if np.any(expanded_rock):
            rock_rgb = ramp_dither(wx, wy, light, _hex_ramp("rock"))
            rgb[expanded_rock] = rock_rgb[expanded_rock]

        # Smooth curved dirt trail: precomputed centerline stroke (+ plazas
        # filled as rounded blobs), sliced from the whole-call road_mask --
        # see _road_masks. No per-cell auto-tiling here anymore.
        road_shape = road_mask[oy:oy + strip_h]
        if np.any(road_shape):
            dirt = ramp_dither(wx, wy, vnoise(wx, wy, 14, 421) * 0.75 + vnoise(wx, wy, 5, 423) * 0.25, _hex_ramp("trail"))
            rgb[road_shape] = dirt[road_shape]

        result.paste(Image.fromarray(rgb.astype(np.uint8)), (0, oy))
    return result


def _scale_point(x: float, y: float, origin: tuple[int, int], sample: int) -> tuple[int, int]:
    return (round((x - origin[0]) / sample), round((y - origin[1]) / sample))


def _tree_ramp(class_name: str) -> tuple[tuple[int, int, int], ...]:
    key = "snowForest" if class_name == "snowForest" else "deadForest" if class_name == "deadForest" else "forest"
    return tuple(tuple(int(v) for v in tone) for tone in RAMPS[key])


def draw_pine(draw: ImageDraw.ImageDraw, cx: float, base_y: float, seed: int, class_name: str,
              origin: tuple[int, int], sample: int) -> None:
    rng = random.Random(seed)
    ramp = _tree_ramp(class_name)
    tiers, base_w, trunk_h, tier_h = rng.randint(4, 6), rng.randint(13, 19), rng.randint(8, 12), rng.randint(7, 10)
    trunk_box = (*_scale_point(cx - 2, base_y - trunk_h, origin, sample), *_scale_point(cx + 2, base_y, origin, sample))
    draw.rectangle(trunk_box, fill=TRUNK)
    cy = base_y - trunk_h
    for tier in range(tiers):
        t = tier / max(1, tiers - 1)
        width = max(3, round(base_w * (1 - t * 0.70)))
        apex_y = cy - tier_h
        shadow = [(cx - width - 2, cy + 3), (cx, apex_y + 2), (cx + width + 2, cy + 3)]
        body = [(cx - width, cy), (cx, apex_y), (cx + width, cy)]
        lit = [(cx - width + 1, cy - 1), (cx, apex_y), (cx - 1, cy - tier_h * 0.38)]
        draw.polygon([_scale_point(x, y, origin, sample) for x, y in shadow], fill=ramp[0])
        draw.polygon([_scale_point(x, y, origin, sample) for x, y in body], fill=ramp[1])
        draw.polygon([_scale_point(x, y, origin, sample) for x, y in lit], fill=ramp[2])
        if class_name == "snowForest" and tier % 2 == 0:
            a = _scale_point(cx - width * 0.55, cy - tier_h * 0.42, origin, sample)
            b = _scale_point(cx - 1, apex_y + 2, origin, sample)
            draw.line((a, b), fill=tuple(RAMPS["snow"][-2]), width=max(1, 2 // sample))
        cy = apex_y + 2


def draw_mountain(draw: ImageDraw.ImageDraw, cx: float, base_y: float, seed: int, class_name: str,
                  origin: tuple[int, int], sample: int, small: bool) -> None:
    rng = random.Random(seed)
    width = rng.randint(17, 23) if small else rng.randint(27, 35)
    height = rng.randint(22, 30) if small else rng.randint(37, 49)
    lean = rng.randint(-4, 4)
    apex = (cx + lean, base_y - height)
    left = [(cx - width, base_y)]
    right = [apex]
    for i in range(1, 4):
        t = i / 4
        left.append((cx - width + (apex[0] - (cx - width)) * t + rng.uniform(-width * .18, width * .18), base_y - height * t + rng.uniform(-3, 3)))
        right.append((apex[0] + (cx + width - apex[0]) * t + rng.uniform(-width * .18, width * .18), apex[1] + height * t + rng.uniform(-3, 3)))
    silhouette = left + [apex] + right[1:] + [(cx + width, base_y)]
    ramp_name = "cliff" if class_name == "cliff" else class_name if class_name in {"duneRock", "obsidian"} else "rock"
    ramp = [tuple(int(v) for v in tone) for tone in RAMPS[ramp_name]]
    points = [_scale_point(x, y, origin, sample) for x, y in silhouette]
    draw.polygon(points, fill=ramp[1])
    draw.polygon([_scale_point(x, y, origin, sample) for x, y in left + [apex, (apex[0], base_y)]], fill=ramp[3])
    draw.polygon([_scale_point(x, y, origin, sample) for x, y in [apex] + right[1:] + [(cx + width, base_y), (apex[0], base_y)]], fill=ramp[0])
    # Stepped facets down the lit plane. A peak drawn as flat tonal planes reads as an
    # ICON, and img2img faithfully reproduces icons -- that is what produced the
    # owner-rejected "cone" field. Faceting gives the model rock geometry to elevate.
    for band in (0.34, 0.62):
        by = base_y - height * band
        span = width * (1.0 - band) * 0.85
        facet = [(apex[0] - span, by), (apex[0] + span * 0.45, by - height * 0.08),
                 (apex[0] + span * 0.22, by + height * 0.07), (apex[0] - span * 0.78, by + height * 0.05)]
        draw.polygon([_scale_point(x, y, origin, sample) for x, y in facet], fill=ramp[2])
    # No near-black outline: the hard border was the strongest "sticker sitting on the
    # ground" cue and is exactly what the model copied. The peak now blends into the
    # rock mass render_base already fills beneath it.
    draw.line((_scale_point(apex[0], apex[1], origin, sample), _scale_point(apex[0] + width * .48, base_y - 2, origin, sample)), fill=ramp[2], width=1)


def draw_structure(draw: ImageDraw.ImageDraw, cx: float, base_y: float, seed: int, class_name: str,
                   origin: tuple[int, int], sample: int) -> None:
    rng = random.Random(seed)
    width, height = rng.randint(22, 30), rng.randint(18, 25)
    x0, y0 = _scale_point(cx - width / 2, base_y - height, origin, sample)
    x1, y1 = _scale_point(cx + width / 2, base_y, origin, sample)
    wall = (72, 69, 59) if class_name == "landmarkSolid" else (76, 59, 39)
    draw.rectangle((x0, y0, x1, y1), fill=wall, outline=OUTLINE, width=max(1, 2 // sample))
    roof = [_scale_point(cx - width * .65, base_y - height, origin, sample), _scale_point(cx, base_y - height - 12, origin, sample), _scale_point(cx + width * .65, base_y - height, origin, sample)]
    draw.polygon(roof, fill=(45, 39, 31), outline=OUTLINE)
    door = (*_scale_point(cx - 3, base_y - 10, origin, sample), *_scale_point(cx + 3, base_y, origin, sample))
    draw.rectangle(door, fill=(27, 23, 19))


def draw_bridge_rails(draw: ImageDraw.ImageDraw, grid: np.ndarray, classes: list[str], bounds: tuple[int, int, int, int],
                      sample: int, origin: tuple[int, int]) -> None:
    bridge_id = classes.index("bridge")
    water_ids = {classes.index(name) for name in WATER_VARIANTS}
    x0, y0, x1, y1 = bounds
    for ty in range(y0, y1 + 1):
        for tx in range(x0, x1 + 1):
            if grid[ty, tx] != bridge_id:
                continue
            vertical = int(grid[ty, max(0, tx - 1)]) in water_ids or int(grid[ty, min(grid.shape[1] - 1, tx + 1)]) in water_ids
            cx, cy = tx * TILE + TILE / 2, ty * TILE + TILE / 2
            rail, glint = (51, 38, 27), (115, 91, 58)
            if vertical:
                for dx in (-8, 8):
                    a, b = _scale_point(cx + dx, ty * TILE, origin, sample), _scale_point(cx + dx, (ty + 1) * TILE, origin, sample)
                    draw.line((a, b), fill=rail, width=max(1, 2 // sample)); draw.point(a, fill=glint)
            else:
                for dy in (-8, 8):
                    a, b = _scale_point(tx * TILE, cy + dy, origin, sample), _scale_point((tx + 1) * TILE, cy + dy, origin, sample)
                    draw.line((a, b), fill=rail, width=max(1, 2 // sample)); draw.point(a, fill=glint)


def add_objects(image: Image.Image, grid: np.ndarray, classes: list[str], bounds: tuple[int, int, int, int], sample: int, seed: int) -> None:
    draw = ImageDraw.Draw(image)
    x0, y0, x1, y1 = bounds
    origin = (x0 * TILE, y0 * TILE)
    objects: list[tuple[float, str, float, int, str, bool]] = []
    for ty in range(max(0, y0 - 1), min(grid.shape[0], y1 + 2)):
        for tx in range(max(0, x0 - 1), min(grid.shape[1], x1 + 2)):
            name = classes[int(grid[ty, tx])]
            cell_seed = (tx * 73856093 ^ ty * 19349663 ^ seed) & 0xFFFFFFFF
            rng = random.Random(cell_seed)
            cx, base_y = tx * TILE + TILE / 2, ty * TILE + TILE - 3
            if name in {"forest", "snowForest", "deadForest"}:
                count = 3 if rng.random() < 0.62 else 2
                for index in range(count):
                    objects.append((base_y + rng.randint(-9, 11), "pine", cx + rng.randint(-11, 11), cell_seed + index * 733, name, False))
            elif name in PEAK_VARIANTS:
                # Mountains render as a continuous mass: render_base already fills the
                # interior with a bilinear-interpolated rock field + elevation shading.
                # Peak silhouettes are reserved for cells on the mass's fringe (touching
                # non-rock, incl. the map edge) so the range reads as one body rising from
                # the land with a ridgeline on its border, never a field of per-cell cones.
                fringe = any(
                    not (0 <= ty + dy < grid.shape[0] and 0 <= tx + dx < grid.shape[1])
                    or classes[int(grid[ty + dy, tx + dx])] not in ROCK_VARIANTS
                    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1))
                )
                if fringe:
                    local_max = True
                    value = int(_hash_noise(np.array(tx), np.array(ty), 7771) * 65535)
                    for dy in range(-2, 3):
                        for dx in range(-2, 3):
                            if dx == dy == 0 or not (0 <= tx + dx < grid.shape[1] and 0 <= ty + dy < grid.shape[0]):
                                continue
                            neighbor = classes[int(grid[ty + dy, tx + dx])]
                            if neighbor in ROCK_VARIANTS and int(_hash_noise(np.array(tx + dx), np.array(ty + dy), 7771) * 65535) > value:
                                local_max = False
                    # Local maxima ONLY. The old `or rng.random() < 0.16` sprinkled extra
                    # non-maximum peaks along every fringe, which read as a cone field
                    # rather than a ridgeline. Fewer, larger, real peaks is the contract.
                    if local_max:
                        objects.append((base_y + rng.randint(-2, 4), "mountain", cx + rng.randint(-6, 6), cell_seed, name, False))
            elif name in {"structure", "landmarkSolid"}:
                objects.append((base_y, "structure", cx, cell_seed, name, False))

    for base_y, kind, cx, object_seed, name, small in sorted(objects):
        if kind == "pine":
            draw_pine(draw, cx, base_y, object_seed, name, origin, sample)
        elif kind == "mountain":
            draw_mountain(draw, cx, base_y, object_seed, name, origin, sample, small)
        else:
            draw_structure(draw, cx, base_y, object_seed, name, origin, sample)
    draw_bridge_rails(draw, grid, classes, bounds, sample, origin)


def render(grid: np.ndarray, classes: list[str], bounds: tuple[int, int, int, int], sample: int, seed: int) -> Image.Image:
    if TILE % sample:
        raise ValueError(f"sample must divide {TILE}")
    image = render_base(grid, classes, bounds, sample)
    add_objects(image, grid, classes, bounds, sample, seed)
    return image


def validate_bounds(bounds: tuple[int, int, int, int], grid: np.ndarray) -> None:
    x0, y0, x1, y1 = bounds
    if not (0 <= x0 <= x1 < grid.shape[1] and 0 <= y0 <= y1 < grid.shape[0]):
        raise ValueError(f"bounds {bounds} outside {grid.shape[1]}x{grid.shape[0]} grid")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def self_check() -> None:
    assert TILE == 48 and 48 % 3 == 0
    assert tuple(RAMPS["meadow"].shape) == (4, 3)
    probe = float(_hash_noise(np.array(7), np.array(11), 42))
    assert 0.0 <= probe <= 1.0
    assert np.array_equal(ramp_dither(np.array([[0.0]]), np.array([[0.0]]), np.array([[0.0]]), RAMPS["water"])[0, 0], RAMPS["water"][0])
    # Smooth-trail plumbing regression: a straight 3-cell trail on a tiny
    # synthetic grid must trace as one 3-point segment (no plaza) and
    # rasterize to a non-empty mask at the requested canvas resolution.
    tiny_classes = ["meadow", "trail", "bridge"]
    tiny_grid = np.zeros((5, 5), dtype=np.uint8)
    tiny_grid[2, 1:4] = tiny_classes.index("trail")
    plaza, segments, region_bounds = _road_network(tiny_grid, tiny_classes, (0, 0, 4, 4))
    assert not plaza.any() and len(segments) == 1 and len(segments[0]) == 3 and region_bounds == (0, 0, 5, 5)
    mask = _road_masks(tiny_grid, tiny_classes, (0, 0, 4, 4), (0, 0, 4, 4), 1, (5 * TILE, 5 * TILE))
    assert mask.shape == (5 * TILE, 5 * TILE) and mask.any()
    # Plaza cross-call consistency regression (the actual bug this guards):
    # gaussian_like_blur/binary_dilate edge-pad at whatever canvas they're
    # given, so rounding a plaza directly on a `bounds`-sized canvas made two
    # overlapping-but-independent render_base() calls disagree in their
    # shared overlap wherever a plaza sat near the canvas edge (found via
    # tile-4-6/tile-4-7, 227px differed). _road_masks fixed this by rounding
    # each plaza component against its OWN fixed bbox, never `bounds`. Two
    # windows split down the middle of a plaza must still agree exactly.
    plaza_grid = np.zeros((10, 14), dtype=np.uint8)
    plaza_grid[2:7, 4:9] = tiny_classes.index("trail")  # 5x5 filled block -> one plaza
    plaza_region = (0, 0, 13, 9)
    mask_a = _road_masks(plaza_grid, tiny_classes, plaza_region, (0, 0, 6, 9), 1, (10 * TILE, 7 * TILE))
    mask_b = _road_masks(plaza_grid, tiny_classes, plaza_region, (5, 0, 13, 9), 1, (10 * TILE, 9 * TILE))
    a_overlap = mask_a[:, 5 * TILE:7 * TILE]  # world cols 5-6, local to each call's own origin
    b_overlap = mask_b[:, 0:2 * TILE]
    assert a_overlap.any() and np.array_equal(a_overlap, b_overlap)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--map", type=Path, default=DEFAULT_MAP)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--bounds", type=parse_bounds, default=DEFAULT_BOUNDS)
    parser.add_argument("--full-sample", type=int, default=3, help="native-pixel sampling step; 3 yields 2368px Act 1 review")
    parser.add_argument("--crop-origin", type=parse_point, default=DEFAULT_CROP)
    parser.add_argument("--crop-cells", type=int, default=25)
    parser.add_argument("--seed", type=int)
    parser.add_argument("--prefix", default="act1-dq-art-pilot")
    args = parser.parse_args()

    self_check()
    data, grid, classes = read_map(args.map)
    validate_bounds(args.bounds, grid)
    crop_bounds = (*args.crop_origin, args.crop_origin[0] + args.crop_cells - 1, args.crop_origin[1] + args.crop_cells - 1)
    validate_bounds(crop_bounds, grid)
    seed = data["seed"] if args.seed is None else args.seed
    args.output_dir.mkdir(parents=True, exist_ok=True)

    full_size = ((args.bounds[2] - args.bounds[0] + 1) * TILE // args.full_sample,
                 (args.bounds[3] - args.bounds[1] + 1) * TILE // args.full_sample)
    crop_size = (args.crop_cells * TILE, args.crop_cells * TILE)
    full_path = args.output_dir / f"{args.prefix}-full-{full_size[0]}x{full_size[1]}.png"
    crop_path = args.output_dir / f"{args.prefix}-native-crop-x{args.crop_origin[0]}-y{args.crop_origin[1]}-{crop_size[0]}x{crop_size[1]}.png"
    render(grid, classes, args.bounds, args.full_sample, seed).save(full_path, optimize=True)
    render(grid, classes, crop_bounds, 1, seed).save(crop_path, optimize=True)
    print(f"full={full_path.resolve()} size={full_size} sha256={sha256(full_path)}")
    print(f"crop={crop_path.resolve()} size={crop_size} sha256={sha256(crop_path)}")


if __name__ == "__main__":
    main()
