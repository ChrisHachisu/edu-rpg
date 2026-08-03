#!/usr/bin/env python3
"""Measure and compose the exact-phone Port source-resolution taste gate."""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/port-pixel-source/phone-evidence"
WORLD_VIEW_WIDTH = 208
PHONE_WIDTH = 852
HERO_DENSITY = 64 / 36
VARIANTS = [
    ("current-2x-control", 2.0),
    ("authored-896", 896 / 512),
    ("authored-912", 912 / 512),
]


def world_pixel_mask(x: int, y: int) -> bool:
    if not 128 <= y < 1650:
        return False
    if x < 370 and y < 310:  # HUD
        return False
    if 350 <= x < 510 and 620 <= y < 860:  # heroine and shadow
        return False
    if x >= 470 and y >= 1220:  # touch pad
        return False
    return True


def transition_metrics(image: Image.Image) -> dict[str, float | int]:
    rgb = image.convert("RGB")
    pixels = rgb.load()
    transitions = 0
    strong = 0
    pairs = 0
    for y in range(rgb.height):
        for x in range(rgb.width):
            if not world_pixel_mask(x, y):
                continue
            here = pixels[x, y]
            for nx, ny in ((x + 1, y), (x, y + 1)):
                if nx >= rgb.width or ny >= rgb.height or not world_pixel_mask(nx, ny):
                    continue
                other = pixels[nx, ny]
                delta = math.sqrt(sum((a - b) ** 2 for a, b in zip(here, other)))
                pairs += 1
                if delta >= 8:
                    transitions += 1
                if delta >= 24:
                    strong += 1
    return {
        "analyzedAdjacentPairs": pairs,
        "transitionDensityDelta8": transitions / pairs,
        "strongTransitionDensityDelta24": strong / pairs,
    }


def main() -> None:
    zoom = PHONE_WIDTH / WORLD_VIEW_WIDTH
    hero_cluster = zoom / HERO_DENSITY
    metrics: dict[str, object] = {
        "phoneFrame": [852, 1846],
        "worldViewWidth": WORLD_VIEW_WIDTH,
        "cameraZoom": zoom,
        "heroSourcePixelsPerWorldPixel": HERO_DENSITY,
        "heroScreenClusterPixels": hero_cluster,
        "variants": {},
    }
    images: list[tuple[str, Image.Image]] = []
    for name, source_density in VARIANTS:
        path = EVIDENCE / f"{name}-852x1846.png"
        image = Image.open(path).convert("RGB")
        assert image.size == (852, 1846), (path, image.size)
        screen_cluster = zoom / source_density
        metrics["variants"][name] = {
            "sourcePixelsPerWorldPixel": source_density,
            "screenClusterPixels": screen_cluster,
            "clusterMismatchVsHero": abs(screen_cluster - hero_cluster) / hero_cluster,
            **transition_metrics(image),
        }
        images.append((name, image))

    assert metrics["variants"]["current-2x-control"]["clusterMismatchVsHero"] > 0.10
    assert metrics["variants"]["authored-896"]["clusterMismatchVsHero"] < 0.02
    assert metrics["variants"]["authored-912"]["clusterMismatchVsHero"] < 0.005

    thumb_width = 426
    thumb_height = 923
    label_height = 44
    sheet = Image.new("RGB", (thumb_width * len(images), thumb_height + label_height), "#050914")
    draw = ImageDraw.Draw(sheet)
    for index, (name, image) in enumerate(images):
        thumb = image.resize((thumb_width, thumb_height), Image.Resampling.LANCZOS)
        left = index * thumb_width
        sheet.paste(thumb, (left, label_height))
        draw.text((left + 12, 14), name, fill="#f5d466")
    sheet.save(EVIDENCE / "pixel-source-phone-comparison.png", optimize=True)
    (EVIDENCE / "pixel-source-phone-metrics.json").write_text(
        json.dumps(metrics, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
