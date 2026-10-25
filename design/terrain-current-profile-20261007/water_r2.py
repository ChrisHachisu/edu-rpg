"""Deterministic shared sampler for the approved Act 1 water-r2 texture."""
from __future__ import annotations

import numpy as np
from PIL import Image


def load_texture(path):
    image = Image.open(path).convert("RGB")
    return np.asarray(image, dtype=np.uint8)


def sample_world_phase(texture, world_x_px, world_y_px, *, texels_per_cell=96,
                       pixels_per_cell=32):
    """Sample RGB in global world-pixel coordinates with one phase across chunks."""
    tex = np.asarray(texture, dtype=np.uint8)
    if tex.ndim != 3 or tex.shape[2] != 3 or not tex.shape[0] or not tex.shape[1]:
        raise ValueError("water texture must be a nonempty RGB array")
    if texels_per_cell % pixels_per_cell:
        raise ValueError("water texture density must divide output density exactly")
    step = texels_per_cell // pixels_per_cell
    x = np.asarray(world_x_px, dtype=np.int64)
    y = np.asarray(world_y_px, dtype=np.int64)
    return tex[np.mod(y * step, tex.shape[0]), np.mod(x * step, tex.shape[1])]


def promote_exact_semantic_water(coverage, semantic_water):
    """Keep exact smoothed-W pixels fully water-covered; retain every other shore weight."""
    weights = np.asarray(coverage, dtype=np.float32)
    exact_water = np.asarray(semantic_water, dtype=bool)
    if weights.ndim != 2 or exact_water.ndim != 2 or weights.shape != exact_water.shape:
        raise ValueError("semantic water mask must match the two-dimensional water coverage")
    if not np.all(np.isfinite(weights)) or np.any((weights < 0.0) | (weights > 1.0)):
        raise ValueError("water coverage must contain finite values from zero through one")
    return np.maximum(weights, exact_water.astype(np.float32))


def compose_water_layer(texture, water_coverage, world_cell_x, world_cell_y,
                        *, texels_per_cell=96, pixels_per_cell=32):
    """Build one premultiplied-independent RGBA chunk on global texture phase."""
    coverage = np.asarray(water_coverage, dtype=np.float32)
    if coverage.ndim != 2:
        raise ValueError("water coverage must be a 2D array")
    h, w = coverage.shape
    yy, xx = np.indices((h, w), dtype=np.int64)
    rgb = sample_world_phase(
        texture,
        int(world_cell_x) * pixels_per_cell + xx,
        int(world_cell_y) * pixels_per_cell + yy,
        texels_per_cell=texels_per_cell,
        pixels_per_cell=pixels_per_cell,
    )
    alpha = np.clip(np.rint(coverage * 255.0), 0, 255).astype(np.uint8)
    return np.dstack((rgb, alpha))
