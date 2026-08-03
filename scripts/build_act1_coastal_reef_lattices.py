#!/usr/bin/env python3
"""Build deterministic shared-lattice overlays for the Relay 08 coastal reef."""

from __future__ import annotations

import hashlib
import io
import json
import math
from fractions import Fraction
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2"
BATCH = RUNTIME / "coastal-reef-912-v1"
WORLD_SIZE = 512
LATTICE_SCALE = Fraction(57, 32)
LATTICE_SIZE = 912
PALETTE_COLORS = 192
FEATHER_WORLD = 24
REGIONS = [
    {
        "id": "coastal-channel-912-v1",
        "slug": "coastal-channel",
        "x": 1696,
        "y": 1888,
        "master": BATCH / "coastal-channel-authored-master-v1.png",
        "composition": BATCH / "composition-refs/coastal-channel-composition-512.png",
        "blendAxis": None,
    },
    {
        "id": "coastal-reef-912-v1",
        "slug": "coastal-reef",
        "x": 1568,
        "y": 2144,
        "master": BATCH / "coastal-reef-authored-master-v1.png",
        "composition": BATCH / "composition-refs/coastal-reef-composition-512.png",
        "blendAxis": "y+",
    },
]
UNION_LEFT = min(region["x"] for region in REGIONS)
UNION_TOP = min(region["y"] for region in REGIONS)
UNION_RIGHT = max(region["x"] + WORLD_SIZE for region in REGIONS)
UNION_BOTTOM = max(region["y"] + WORLD_SIZE for region in REGIONS)
UNION_SIZE = (
    int((UNION_RIGHT - UNION_LEFT) * LATTICE_SCALE),
    int((UNION_BOTTOM - UNION_TOP) * LATTICE_SCALE),
)
METRICS = BATCH / "coastal-reef-lattice-metrics-v1.json"
CONTACT_SHEET = BATCH / "coastal-reef-lattice-contact-sheet-v1.png"
SHARED_COMPOSITE = BATCH / "coastal-reef-shared-composite-912-v1.png"


def sha256_path(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=False, compress_level=9)
    return buffer.getvalue()


def lattice_offset(world_value: int) -> int:
    value = world_value * LATTICE_SCALE
    if value.denominator != 1:
        raise AssertionError(f"region origin is off the 57/32 lattice: {world_value}")
    return value.numerator


def load_master(region: dict[str, object]) -> Image.Image:
    path = region["master"]
    with Image.open(path) as source:
        master = source.convert("RGB")
    if master.width != master.height or master.width <= LATTICE_SIZE:
        raise RuntimeError(f"master must be square and larger than 912px: {path} {master.size}")
    return master.resize((LATTICE_SIZE, LATTICE_SIZE), Image.Resampling.LANCZOS)


def paste_crossfade(
    canvas: Image.Image,
    coverage: Image.Image,
    image: Image.Image,
    left: int,
    top: int,
    axis: str | None,
) -> None:
    prior = coverage.crop((left, top, left + LATTICE_SIZE, top + LATTICE_SIZE))
    mask = Image.new("L", image.size, 255)
    if axis is not None:
        direction = axis[-1]
        coordinate_axis = axis[0]
        if coordinate_axis not in {"x", "y"} or direction not in {"+", "-"}:
            raise AssertionError(f"unsupported blend axis: {axis}")
        prior_px = prior.load()
        mask_px = mask.load()
        if coordinate_axis == "x":
            for y in range(LATTICE_SIZE):
                overlap = [x for x in range(LATTICE_SIZE) if prior_px[x, y] != 0]
                if not overlap:
                    continue
                start, end = overlap[0], overlap[-1]
                for x in overlap:
                    fraction = (x - start) / max(1, end - start)
                    mask_px[x, y] = round(
                        255 * (fraction if direction == "+" else 1.0 - fraction)
                    )
        else:
            for x in range(LATTICE_SIZE):
                overlap = [y for y in range(LATTICE_SIZE) if prior_px[x, y] != 0]
                if not overlap:
                    continue
                start, end = overlap[0], overlap[-1]
                for y in overlap:
                    fraction = (y - start) / max(1, end - start)
                    mask_px[x, y] = round(
                        255 * (fraction if direction == "+" else 1.0 - fraction)
                    )
    prior_rgb = canvas.crop((left, top, left + LATTICE_SIZE, top + LATTICE_SIZE))
    canvas.paste(Image.composite(image, prior_rgb, mask), (left, top))
    coverage.paste(Image.new("L", image.size, 255), (left, top))


def build_shared_composite() -> tuple[Image.Image, dict[str, Image.Image]]:
    reduced = {region["slug"]: load_master(region) for region in REGIONS}
    canvas = Image.new("RGB", UNION_SIZE, (0, 0, 0))
    coverage = Image.new("L", UNION_SIZE, 0)
    for region in REGIONS:
        left = lattice_offset(region["x"] - UNION_LEFT)
        top = lattice_offset(region["y"] - UNION_TOP)
        paste_crossfade(
            canvas,
            coverage,
            reduced[region["slug"]],
            left,
            top,
            region["blendAxis"],
        )
    quantized = canvas.quantize(
        colors=PALETTE_COLORS,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    outputs = {}
    for region in REGIONS:
        left = lattice_offset(region["x"] - UNION_LEFT)
        top = lattice_offset(region["y"] - UNION_TOP)
        outputs[region["slug"]] = quantized.crop(
            (left, top, left + LATTICE_SIZE, top + LATTICE_SIZE)
        )
    return quantized, outputs


def fx_layers(source: Image.Image, offset_x: int, offset_y: int) -> tuple[Image.Image, Image.Image]:
    source = source.convert("RGB")
    water = Image.new("RGBA", source.size, (0, 0, 0, 0))
    occlusion = Image.new("RGBA", source.size, (0, 0, 0, 0))
    src = source.load()
    wat = water.load()
    occ = occlusion.load()
    pixel_scale = source.width / WORLD_SIZE
    for y in range(source.height):
        world_y = offset_y + y / pixel_scale
        gy = math.floor(world_y)
        for x in range(source.width):
            world_x = offset_x + x / pixel_scale
            gx = math.floor(world_x)
            r, g, b = src[x, y]
            luminance = (r * 299 + g * 587 + b * 114) // 1000
            is_water = b > 48 and b > r * 1.32 and b > g * 1.04
            ripple = False
            if is_water:
                for back in range(6):
                    anchor_x = gx - back
                    hashed = ((anchor_x * 73856093) ^ (gy * 19349663)) & 4095
                    if hashed < 2:
                        ripple = True
                        break
            if ripple:
                wat[x, y] = (118, 207, 255, 82 if luminance < 90 else 118)
            if g > r * 1.06 and g > b * 0.78 and luminance < 94:
                occ[x, y] = (r, g, b, 242)
    return water, occlusion


def feather_mask() -> Image.Image:
    mask = Image.new("L", (LATTICE_SIZE, LATTICE_SIZE), 0)
    pixels = mask.load()
    pixel_scale = LATTICE_SIZE / WORLD_SIZE
    for y in range(LATTICE_SIZE):
        for x in range(LATTICE_SIZE):
            distance_world = min(x, y, LATTICE_SIZE - 1 - x, LATTICE_SIZE - 1 - y) / pixel_scale
            t = min(1.0, distance_world / FEATHER_WORLD)
            pixels[x, y] = round(255 * t * t * (3.0 - 2.0 * t))
    return mask


def runtime_overlay(image: Image.Image, mask: Image.Image) -> Image.Image:
    source = image.convert("RGBA")
    alpha = source.getchannel("A")
    feathered = Image.new("L", source.size)
    feathered.putdata([
        round(original * feather / 255)
        for original, feather in zip(alpha.getdata(), mask.getdata())
    ])
    source.putalpha(feathered)
    return source


def output_paths(slug: str) -> dict[str, Path]:
    return {
        "base": BATCH / f"{slug}-lattice-912-v1.png",
        "water": BATCH / f"{slug}-lattice-912-water-v1.png",
        "occlusion": BATCH / f"{slug}-lattice-912-occlusion-v1.png",
        "baseRuntime": BATCH / f"{slug}-lattice-912-runtime-v1.png",
        "waterRuntime": BATCH / f"{slug}-lattice-912-water-runtime-v1.png",
        "occlusionRuntime": BATCH / f"{slug}-lattice-912-occlusion-runtime-v1.png",
    }


def luminance_correlation(left: Image.Image, right: Image.Image, size: int) -> float:
    left_values = list(left.convert("L").resize((size, size), Image.Resampling.BOX).getdata())
    right_values = list(right.convert("L").resize((size, size), Image.Resampling.BOX).getdata())
    left_mean = sum(left_values) / len(left_values)
    right_mean = sum(right_values) / len(right_values)
    numerator = sum((a - left_mean) * (b - right_mean) for a, b in zip(left_values, right_values))
    left_energy = sum((a - left_mean) ** 2 for a in left_values)
    right_energy = sum((b - right_mean) ** 2 for b in right_values)
    denominator = math.sqrt(left_energy * right_energy)
    if denominator == 0:
        raise AssertionError("composition correlation requires non-uniform images")
    return numerator / denominator


def contact_sheet(outputs: dict[str, Image.Image]) -> Image.Image:
    panel = 456
    header = 42
    sheet = Image.new("RGB", (panel * len(REGIONS), panel + header), (10, 13, 16))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, region in enumerate(REGIONS):
        image = outputs[region["slug"]].resize((panel, panel), Image.Resampling.NEAREST)
        x = index * panel
        sheet.paste(image, (x, header))
        draw.text(
            (x + 10, 16),
            f"{region['id']}  world=({region['x']},{region['y']})",
            fill=(235, 239, 229),
            font=font,
        )
    return sheet


def render_all() -> tuple[Image.Image, dict[str, dict[str, Image.Image]]]:
    composite, bases = build_shared_composite()
    mask = feather_mask()
    rendered = {}
    for region in REGIONS:
        slug = region["slug"]
        base = bases[slug].convert("RGBA")
        water, occlusion = fx_layers(base, region["x"], region["y"])
        rendered[slug] = {
            "base": base,
            "water": water,
            "occlusion": occlusion,
            "baseRuntime": runtime_overlay(base, mask),
            "waterRuntime": runtime_overlay(water, mask),
            "occlusionRuntime": runtime_overlay(occlusion, mask),
        }
    return composite, rendered


def main() -> None:
    assert (UNION_LEFT, UNION_TOP, UNION_RIGHT, UNION_BOTTOM) == (1568, 1888, 2208, 2656)
    assert UNION_SIZE == (1140, 1368)
    assert len({region["id"] for region in REGIONS}) == len(REGIONS)
    assert len({region["slug"] for region in REGIONS}) == len(REGIONS)
    for region in REGIONS:
        assert region["x"] % 32 == 0 and region["y"] % 32 == 0
        lattice_offset(region["x"])
        lattice_offset(region["y"])
        lattice_offset(region["x"] - UNION_LEFT)
        lattice_offset(region["y"] - UNION_TOP)
        for path in (region["master"], region["composition"]):
            if not path.is_file():
                raise FileNotFoundError(f"required authored input is absent: {path}")

    composite, rendered = render_all()
    rebuilt_composite, rebuilt = render_all()
    if png_bytes(composite) != png_bytes(rebuilt_composite):
        raise AssertionError("non-deterministic shared composite")

    image_bytes: dict[str, dict[str, bytes]] = {}
    for region in REGIONS:
        slug = region["slug"]
        image_bytes[slug] = {}
        for key, path in output_paths(slug).items():
            first = png_bytes(rendered[slug][key])
            second = png_bytes(rebuilt[slug][key])
            if first != second:
                raise AssertionError(f"non-deterministic output: {path}")
            image_bytes[slug][key] = first

    first_sheet = contact_sheet({slug: layers["base"] for slug, layers in rendered.items()})
    second_sheet = contact_sheet({slug: layers["base"] for slug, layers in rebuilt.items()})
    if png_bytes(first_sheet) != png_bytes(second_sheet):
        raise AssertionError("non-deterministic contact sheet")

    metrics: dict[str, object] = {
        "pipeline": {
            "worldSourcePixelsPerWorldPixel": float(LATTICE_SCALE),
            "worldSourcePixelsPerWorldPixelExact": "57/32",
            "masterReduction": "Pillow LANCZOS to 912x912 per 512-world region",
            "crossfadeOrder": [region["id"] for region in REGIONS],
            "crossfadeAxes": {region["id"]: region["blendAxis"] for region in REGIONS},
            "sharedComposite": "deterministic directed overlap crossfade on one global 57/32 lattice",
            "paletteReduction": f"coastal-reef batch global Pillow MEDIANCUT {PALETTE_COLORS} colors, no dithering",
            "runtimeFeatherWorld": FEATHER_WORLD,
            "collisionOwner": "authored geometry only; pixels are visual inputs only",
        },
        "unionWorldBounds": [UNION_LEFT, UNION_TOP, UNION_RIGHT, UNION_BOTTOM],
        "unionLatticeDimensions": list(UNION_SIZE),
        "sharedCompositeSha256": hashlib.sha256(png_bytes(composite)).hexdigest(),
        "sharedCompositePath": str(SHARED_COMPOSITE.relative_to(RUNTIME)),
        "deterministicRerender": True,
        "regions": [],
    }
    for region in REGIONS:
        slug = region["slug"]
        paths = output_paths(slug)
        with Image.open(region["master"]) as source_master:
            master = source_master.convert("RGB")
            master_dimensions = list(source_master.size)
        with Image.open(region["composition"]) as source_composition:
            composition = source_composition.convert("RGB")
            composition_dimensions = list(source_composition.size)
        if master.width != master.height or master.width <= LATTICE_SIZE:
            raise AssertionError(f"master must be square and larger than 912px: {region['master']}")
        raw_64 = luminance_correlation(master, composition, 64)
        raw_24 = luminance_correlation(master, composition, 24)
        composited_64 = luminance_correlation(rendered[slug]["base"], composition, 64)
        composited_24 = luminance_correlation(rendered[slug]["base"], composition, 24)
        if composited_24 < 0.45:
            raise AssertionError(
                f"macro composition correlation too low for {slug}: {composited_24:.3f}"
            )
        metrics["regions"].append({
            "id": region["id"],
            "worldBounds": [region["x"], region["y"], WORLD_SIZE, WORLD_SIZE],
            "master": {
                "path": str(region["master"].relative_to(RUNTIME)),
                "sha256": sha256_path(region["master"]),
                "dimensions": master_dimensions,
            },
            "compositionReference": {
                "path": str(region["composition"].relative_to(RUNTIME)),
                "sha256": sha256_path(region["composition"]),
                "dimensions": composition_dimensions,
                "rawMasterCoarse64LuminanceCorrelation": raw_64,
                "rawMasterMacro24LuminanceCorrelation": raw_24,
                "compositedCoarse64LuminanceCorrelation": composited_64,
                "compositedMacro24LuminanceCorrelation": composited_24,
                "macroGateThreshold": 0.45,
                "macroGatePass": composited_24 >= 0.45,
            },
            "outputs": {
                key: {
                    "path": str(path.relative_to(RUNTIME)),
                    "sha256": hashlib.sha256(image_bytes[slug][key]).hexdigest(),
                    "dimensions": list(rendered[slug][key].size),
                    "mode": rendered[slug][key].mode,
                }
                for key, path in paths.items()
            },
        })

    metrics["contactSheet"] = {
        "path": str(CONTACT_SHEET.relative_to(RUNTIME)),
        "sha256": hashlib.sha256(png_bytes(first_sheet)).hexdigest(),
        "dimensions": list(first_sheet.size),
    }

    for slug, layers in rendered.items():
        for key, image in layers.items():
            assert image.size == (LATTICE_SIZE, LATTICE_SIZE), (slug, key, image.size)
            assert image.mode == "RGBA", (slug, key, image.mode)
        for key in ("baseRuntime", "waterRuntime", "occlusionRuntime"):
            assert all(
                layers[key].getpixel(corner)[3] == 0
                for corner in ((0, 0), (LATTICE_SIZE - 1, 0), (0, LATTICE_SIZE - 1), (LATTICE_SIZE - 1, LATTICE_SIZE - 1))
            ), (slug, key)

    SHARED_COMPOSITE.write_bytes(png_bytes(composite))
    for region in REGIONS:
        for key, path in output_paths(region["slug"]).items():
            path.write_bytes(image_bytes[region["slug"]][key])
    CONTACT_SHEET.write_bytes(png_bytes(first_sheet))
    METRICS.write_text(json.dumps(metrics, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("ACT 1 COASTAL-REEF LATTICES BUILT: 2 authored regions on one deterministic 57/32 lattice")


if __name__ == "__main__":
    main()

