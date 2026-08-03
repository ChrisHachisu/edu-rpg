#!/usr/bin/env python3
"""Build route-hidden evidence for the Act 1 Sol ground-mask review."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2"
SOURCE = (
    RUNTIME
    / "walkable-regions-v1/evidence/collision-reference-affinity-neutral.png"
)
OUTPUT = RUNTIME / "ground-mask-sol-r11"
TILE_DIR = OUTPUT / "native-review-tiles"
TILE_SIZE = 1024
X_ORIGINS = (0, 768, 1344)
Y_ORIGINS = (0, 768, 1536, 1888)

LOCKED_SOURCE_SHA256 = (
    "8cdc9b24a3418f4dcd9417df21987e5e84403bc08e965f1f905a70ea8a731b85"
)
LOCKED_SIZE = (2368, 2912)

NON_WALKABLE = 0
UNCERTAIN = 127
WALKABLE = 255

# These shapes follow only ground that is visible in the clean reference. Broad
# fields are polygons; lines are reserved for visibly narrow roads and bridges.
GROUND_POLYGONS = (
    # Northern cave clearing and the broad dark meadow below it.
    ((1320, 410), (1510, 395), (1635, 510), (1710, 745), (1780, 965),
     (1700, 1080), (1530, 920), (1360, 690)),
    # Snow-pass fork and the open rocky/snowy ground around its cave approach.
    ((1640, 900), (1840, 900), (2010, 1030), (2205, 1060), (2260, 1215),
     (2160, 1365), (1980, 1430), (1770, 1350), (1680, 1160)),
    # Western cave clearing: broad meadow, not a centerline ribbon.
    ((510, 1200), (920, 1200), (1025, 1410), (980, 1595), (850, 1750),
     (600, 1770), (490, 1570)),
    # Greenhollow and the connected western open fields.
    ((300, 1640), (820, 1640), (1010, 1790), (1035, 2040), (870, 2190),
     (560, 2240), (320, 2110), (270, 1880)),
    # Sunken approach and ruin apron.
    ((220, 2100), (650, 2090), (760, 2300), (690, 2585), (270, 2610),
     (205, 2430)),
    # Central bridge, settlement approach, and Millbrook/Port-facing apron.
    ((820, 1740), (1120, 1700), (1400, 1590), (1690, 1550), (1810, 1690),
     (1660, 1900), (1430, 2010), (1320, 2130), (1040, 2110), (890, 2020)),
    # Port settlement ground around (not over) the harbor and buildings.
    ((1560, 1510), (2240, 1510), (2325, 1840), (2180, 1990), (1930, 1940),
     (1690, 1840)),
)

GROUND_LINES = (
    # Northern cave to fork and Port approach.
    (112, ((1470, 520), (1510, 600), (1580, 680), (1635, 785),
           (1680, 900), (1750, 1010), (1835, 1135), (1870, 1250),
           (1840, 1390), (1835, 1510), (1780, 1580), (1680, 1630))),
    # Fork to snowy cave throat.
    (120, ((1810, 1130), (1910, 1210), (2020, 1250), (2145, 1190))),
    # Western cave to Greenhollow.
    (104, ((805, 1360), (840, 1460), (800, 1580), (720, 1690),
           (690, 1800), (715, 1920), (785, 2015))),
    # West-east road through Greenhollow and the central bridge.
    (108, ((470, 1920), (650, 1940), (830, 1950), (990, 1940),
           (1090, 1955), (1190, 1950), (1320, 1880), (1480, 1790),
           (1640, 1690), (1810, 1640))),
    # Greenhollow to the Sunken ruin apron.
    (112, ((720, 1900), (670, 2040), (570, 2170), (520, 2320),
           (495, 2460))),
    # Port's eastern coastal descent.
    (104, ((2110, 1710), (2150, 1810), (2100, 1940), (2055, 2080),
           (1985, 2180), (1860, 2230))),
    # Southern bridge and open coastal ledge.
    (104, ((1810, 2220), (1735, 2280), (1660, 2360), (1605, 2470),
           (1620, 2570))),
)

# Solid painted bodies that sit inside otherwise walkable settlement ground.
SOLID_POLYGONS = (
    # Cave and mountain bodies; the explicit approach throats are restored later.
    ((1390, 400), (1515, 400), (1550, 490), (1505, 555), (1415, 535)),
    ((2070, 1060), (2205, 1060), (2225, 1175), (2175, 1245), (2075, 1220)),
    ((735, 1250), (860, 1250), (880, 1365), (825, 1430), (735, 1395)),
    # Greenhollow landmark.
    ((570, 1775), (690, 1740), (745, 1840), (720, 1945), (600, 1980),
     (545, 1870)),
    # Central bridge-side landmark.
    ((1130, 1900), (1290, 1880), (1385, 1970), (1340, 2085),
     (1170, 2095), (1100, 2010)),
    # Sunken ruin body.
    ((360, 2350), (535, 2340), (600, 2450), (560, 2560), (390, 2565),
     (330, 2460)),
    # Port building row and detached structures.
    ((1640, 1510), (2040, 1500), (2100, 1645), (1980, 1720),
     (1660, 1690), (1585, 1600)),
    ((2080, 1580), (2205, 1570), (2250, 1685), (2180, 1760),
     (2070, 1715)),
    ((2150, 1740), (2270, 1720), (2310, 1830), (2240, 1900),
     (2140, 1840)),
    # Port piers and boats are structure bodies, not bridge decks.
    ((1775, 1615), (1840, 1600), (1940, 1785), (1880, 1825)),
    ((1985, 1640), (2050, 1625), (2140, 1815), (2075, 1850)),
    ((2040, 1740), (2110, 1715), (2170, 1850), (2100, 1890)),
    # Harbor basin keeps boats, piers, and water non-walkable as one structure zone.
    ((1740, 1690), (1995, 1645), (2135, 1765), (2050, 1940),
     (1800, 1985), (1665, 1865)),
    # South of the Sunken ruin, the painted ground breaks into a cliff shelf.
    ((210, 2520), (340, 2505), (470, 2520), (610, 2505), (735, 2550),
     (735, 2640), (200, 2640)),
)

WALKABLE_POLYGONS = (
    # Central wooden bridge deck.
    ((1075, 1940), (1140, 1915), (1170, 1945), (1105, 1980)),
    # Southern stone bridge deck.
    ((1690, 2265), (1795, 2180), (1830, 2215), (1720, 2305)),
)

# The black interiors/occluded joins are explicitly uncertain. The painted
# approach outside each band remains walkable.
UNCERTAIN_ELLIPSES = (
    (1455, 500, 1490, 535),  # northern cave interior edge
    (2132, 1165, 2172, 1205),  # snowy cave interior edge
    (788, 1355, 820, 1392),  # western cave interior edge
    (465, 2460, 500, 2498),  # Sunken ruin doorway/foreground shadow
)

UNCERTAIN_POLYGONS = (
    # Central bridge landings are partially occluded by roofs/parapets.
    ((1065, 1932), (1090, 1922), (1105, 1962), (1080, 1975)),
    ((1160, 1915), (1188, 1925), (1202, 1960), (1175, 1972)),
    # Southern stone bridge landings and parapet-shadow transitions.
    ((1790, 2175), (1825, 2190), (1810, 2220), (1780, 2205)),
    ((1680, 2275), (1710, 2255), (1730, 2285), (1700, 2310)),
)

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require_source() -> Image.Image:
    source_hash = sha256(SOURCE)
    if source_hash != LOCKED_SOURCE_SHA256:
        raise SystemExit(
            "clean collision reference byte identity changed: "
            f"expected {LOCKED_SOURCE_SHA256}, got {source_hash}"
        )
    with Image.open(SOURCE) as image:
        source = image.convert("RGBA")
    if source.size != LOCKED_SIZE:
        raise SystemExit(
            f"expected clean reference size {LOCKED_SIZE}, got {source.size}"
        )
    return source


def build_native_tiles(source: Image.Image) -> None:
    TILE_DIR.mkdir(parents=True, exist_ok=True)
    tiles: list[dict[str, object]] = []
    coverage = Image.new("1", source.size, 0)
    coverage_draw = ImageDraw.Draw(coverage)

    for row, y in enumerate(Y_ORIGINS):
        for column, x in enumerate(X_ORIGINS):
            bounds = (x, y, x + TILE_SIZE, y + TILE_SIZE)
            if bounds[2] > source.width or bounds[3] > source.height:
                raise SystemExit(f"review tile exceeds source: {bounds}")
            tile_id = f"r{row + 1:02d}-c{column + 1:02d}"
            tile_path = TILE_DIR / f"{tile_id}-x{x}-y{y}.png"
            source.crop(bounds).save(
                tile_path, format="PNG", compress_level=9, optimize=False
            )
            coverage_draw.rectangle(
                (bounds[0], bounds[1], bounds[2] - 1, bounds[3] - 1), fill=1
            )
            tiles.append(
                {
                    "id": tile_id,
                    "bounds": [x, y, TILE_SIZE, TILE_SIZE],
                    "path": str(tile_path.relative_to(ROOT)),
                    "sha256": sha256(tile_path),
                }
            )

    if coverage.getbbox() != (0, 0, source.width, source.height):
        raise SystemExit(f"review grid has an outer coverage gap: {coverage.getbbox()}")
    if coverage.getextrema() != (1, 1):
        raise SystemExit("review grid has at least one uncovered source pixel")

    inventory = {
        "schema": "act1-sol-native-tile-review-v1",
        "source": {
            "path": str(SOURCE.relative_to(ROOT)),
            "sha256": LOCKED_SOURCE_SHA256,
            "width": source.width,
            "height": source.height,
        },
        "tileSize": TILE_SIZE,
        "overlap": {
            "x": [256, 448],
            "y": [256, 256, 672],
        },
        "coverage": {
            "complete": True,
            "bounds": [0, 0, source.width, source.height],
            "tileCount": len(tiles),
        },
        "tiles": tiles,
    }
    inventory_path = OUTPUT / "native-review-tile-inventory.json"
    inventory_path.write_text(
        json.dumps(inventory, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {len(tiles)} native review tiles")
    print(f"wrote {inventory_path.relative_to(ROOT)}")


def build_coordinate_grid(source: Image.Image) -> None:
    grid = source.copy()
    layer = Image.new("RGBA", source.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for x in range(0, source.width, 128):
        draw.line((x, 0, x, source.height), fill=(255, 255, 255, 72), width=1)
        draw.text((x + 4, 4), str(x), fill=(255, 255, 255, 210))
    for y in range(0, source.height, 128):
        draw.line((0, y, source.width, y), fill=(255, 255, 255, 72), width=1)
        draw.text((4, y + 4), str(y), fill=(255, 255, 255, 210))
    grid.alpha_composite(layer)
    grid_path = OUTPUT / "native-review-coordinate-grid.png"
    grid.save(grid_path, format="PNG", compress_level=9, optimize=False)
    print(f"wrote {grid_path.relative_to(ROOT)}")


def draw_ground_scope(size: tuple[int, int]) -> tuple[Image.Image, Image.Image]:
    scope = Image.new("1", size, 0)
    draw = ImageDraw.Draw(scope)
    for polygon in GROUND_POLYGONS:
        draw.polygon(polygon, fill=1)
    for width, points in GROUND_LINES:
        draw.line(points, fill=1, width=width, joint="curve")

    core = Image.new("1", size, 0)
    core_draw = ImageDraw.Draw(core)
    for width, points in GROUND_LINES:
        core_draw.line(
            points,
            fill=1,
            width=max(24, round(width * 0.38)),
            joint="curve",
        )
    return scope, core


def build_mask(source: Image.Image) -> Image.Image:
    scope_image, core_image = draw_ground_scope(source.size)
    scope = np.asarray(scope_image, dtype=bool)
    core = np.asarray(core_image, dtype=bool)

    smooth_image = source.convert("RGB").filter(ImageFilter.BoxBlur(4))
    smooth = np.asarray(smooth_image, dtype=np.int16)
    red, green, blue = (smooth[:, :, index] for index in range(3))
    luminance = (3 * red + 4 * green + blue) // 8
    warmth = ((red + green) // 2) - blue
    blue_surface = (blue > red + 5) & (blue > green + 2)

    ground_like = (luminance >= 38) & (warmth >= 7) & ~blue_surface
    ground_like_image = Image.fromarray(ground_like.astype(np.uint8) * 255)
    ground_like_image = ground_like_image.filter(ImageFilter.MaxFilter(11))
    ground_like_image = ground_like_image.filter(ImageFilter.MinFilter(11))
    ground_like_image = ground_like_image.filter(ImageFilter.MinFilter(7))
    ground_like_image = ground_like_image.filter(ImageFilter.MaxFilter(7))
    ground_like = np.asarray(ground_like_image, dtype=np.uint8) > 0

    # Preserve visible road centers through shadow, but never admit blue water.
    shadow_ground = (luminance >= 27) & (warmth >= 3) & ~blue_surface
    walkable = scope & (ground_like | (core & shadow_ground))

    mask_array = np.full((source.height, source.width), NON_WALKABLE, np.uint8)
    mask_array[walkable] = WALKABLE
    mask = Image.fromarray(mask_array)
    draw = ImageDraw.Draw(mask)
    for polygon in SOLID_POLYGONS:
        draw.polygon(polygon, fill=NON_WALKABLE)
    for polygon in WALKABLE_POLYGONS:
        draw.polygon(polygon, fill=WALKABLE)

    # Restore explicit approach throats outside the occluded interior bands.
    draw.line(((1470, 550), (1470, 520)), fill=WALKABLE, width=42)
    draw.line(((2148, 1230), (2150, 1190)), fill=WALKABLE, width=44)
    draw.line(((805, 1420), (802, 1380)), fill=WALKABLE, width=42)

    for ellipse in UNCERTAIN_ELLIPSES:
        draw.ellipse(ellipse, fill=UNCERTAIN)
    for polygon in UNCERTAIN_POLYGONS:
        draw.polygon(polygon, fill=UNCERTAIN)
    return mask


def class_edges(mask_array: np.ndarray) -> np.ndarray:
    edges = np.zeros(mask_array.shape, dtype=bool)
    edges[1:, :] |= mask_array[1:, :] != mask_array[:-1, :]
    edges[:, 1:] |= mask_array[:, 1:] != mask_array[:, :-1]
    return edges


def build_overlay(source: Image.Image, mask: Image.Image) -> Image.Image:
    mask_array = np.asarray(mask, dtype=np.uint8)
    overlay = source.copy()
    tint = np.zeros((source.height, source.width, 4), dtype=np.uint8)
    tint[mask_array == NON_WALKABLE] = (220, 45, 55, 32)
    tint[mask_array == WALKABLE] = (40, 225, 100, 94)
    tint[mask_array == UNCERTAIN] = (255, 184, 35, 155)
    tint[class_edges(mask_array)] = (255, 255, 255, 235)
    overlay.alpha_composite(Image.fromarray(tint))
    return overlay


def write_mask_outputs(source: Image.Image) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    mask = build_mask(source)
    mask_path = OUTPUT / "act1-ground-mask-3class.png"
    mask.save(mask_path, format="PNG", compress_level=9, optimize=False)

    overlay = build_overlay(source, mask)
    overlay_path = OUTPUT / "act1-ground-mask-overlay.png"
    overlay.save(overlay_path, format="PNG", compress_level=9, optimize=False)
    overview_path = OUTPUT / "act1-ground-mask-overlay-overview.png"
    overlay.resize((1184, 1456), Image.Resampling.LANCZOS).save(
        overview_path, format="PNG", compress_level=9, optimize=False
    )

    overlay_tile_dir = OUTPUT / "native-overlay-review-tiles"
    overlay_tile_dir.mkdir(parents=True, exist_ok=True)
    overlay_tiles: list[dict[str, object]] = []
    for row, y in enumerate(Y_ORIGINS):
        for column, x in enumerate(X_ORIGINS):
            tile_id = f"r{row + 1:02d}-c{column + 1:02d}"
            tile_path = overlay_tile_dir / f"{tile_id}-x{x}-y{y}.png"
            overlay.crop((x, y, x + TILE_SIZE, y + TILE_SIZE)).save(
                tile_path, format="PNG", compress_level=9, optimize=False
            )
            overlay_tiles.append(
                {
                    "id": tile_id,
                    "bounds": [x, y, TILE_SIZE, TILE_SIZE],
                    "path": str(tile_path.relative_to(ROOT)),
                    "sha256": sha256(tile_path),
                }
            )

    mask_array = np.asarray(mask, dtype=np.uint8)
    classes, counts = np.unique(mask_array, return_counts=True)
    inventory = {
        "schema": "act1-sol-ground-mask-v1",
        "source": {
            "path": str(SOURCE.relative_to(ROOT)),
            "sha256": LOCKED_SOURCE_SHA256,
            "width": source.width,
            "height": source.height,
        },
        "classes": {
            str(NON_WALKABLE): "non-walkable",
            str(UNCERTAIN): "uncertain-or-occluded",
            str(WALKABLE): "walkable",
        },
        "classPixelCounts": {
            str(int(value)): int(count) for value, count in zip(classes, counts)
        },
        "mask": {
            "path": str(mask_path.relative_to(ROOT)),
            "sha256": sha256(mask_path),
        },
        "overlay": {
            "path": str(overlay_path.relative_to(ROOT)),
            "sha256": sha256(overlay_path),
        },
        "overlayOverview": {
            "path": str(overview_path.relative_to(ROOT)),
            "sha256": sha256(overview_path),
            "width": 1184,
            "height": 1456,
        },
        "nativeOverlayReviewTiles": overlay_tiles,
    }
    inventory_path = OUTPUT / "ground-mask-inventory.json"
    inventory_path.write_text(
        json.dumps(inventory, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {mask_path.relative_to(ROOT)}")
    print(f"wrote {overlay_path.relative_to(ROOT)}")
    print(f"wrote {len(overlay_tiles)} native overlay review tiles")
    print(f"wrote {inventory_path.relative_to(ROOT)}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--tiles-only",
        action="store_true",
        help="prepare the route-hidden native review tiles",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source = require_source()
    build_native_tiles(source)
    build_coordinate_grid(source)
    if not args.tiles_only:
        write_mask_outputs(source)


if __name__ == "__main__":
    main()
