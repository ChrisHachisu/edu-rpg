#!/usr/bin/env python3
"""Build deterministic shared-lattice overlays for the Relay 04 central-east batch."""

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
BATCH = RUNTIME / "central-east-912-v1"
WORLD_SIZE = 512
LATTICE_SCALE = Fraction(57, 32)
LATTICE_SIZE = 912
PALETTE_COLORS = 192
FEATHER_WORLD = 24
REGIONS = [
    {
        "id": "millbrook-west-912-v1",
        "slug": "millbrook-west",
        "x": 1088,
        "y": 1536,
        "master": BATCH / "millbrook-west-authored-master-v1.png",
        "composition": BATCH / "composition-refs/millbrook-west-composition-512.png",
    },
    {
        "id": "millbrook-port-912-v1",
        "slug": "millbrook-port",
        "x": 1504,
        "y": 1536,
        "master": BATCH / "millbrook-port-authored-master-v1.png",
        "composition": BATCH / "composition-refs/millbrook-port-composition-512.png",
    },
    {
        "id": "north-fork-912-v1",
        "slug": "north-fork",
        "x": 1600,
        "y": 1088,
        "master": BATCH / "north-fork-authored-master-v1.png",
        "composition": BATCH / "composition-refs/north-fork-composition-512.png",
    },
    {
        "id": "darkfang-mid-912-v1",
        "slug": "darkfang-mid",
        "x": 1472,
        "y": 736,
        "master": BATCH / "darkfang-mid-authored-master-v1.png",
        "composition": BATCH / "composition-refs/darkfang-mid-composition-512.png",
    },
    {
        "id": "darkfang-bridge-912-v1",
        "slug": "darkfang-bridge",
        "x": 1344,
        "y": 480,
        "master": BATCH / "darkfang-bridge-authored-master-v1.png",
        "composition": BATCH / "composition-refs/darkfang-bridge-composition-512.png",
    },
    {
        "id": "darkfang-north-912-v1",
        "slug": "darkfang-north",
        "x": 1184,
        "y": 288,
        "master": BATCH / "darkfang-north-authored-master-v2.png",
        "composition": BATCH / "composition-refs/darkfang-north-composition-512.png",
    },
    {
        "id": "crystal-approach-south-912-v1",
        "slug": "crystal-approach-south",
        "x": 1792,
        "y": 1056,
        "master": BATCH / "crystal-approach-south-authored-master-v1.png",
        "composition": BATCH / "composition-refs/crystal-approach-south-composition-512.png",
        "visualExclusions": [{
            "shape": "circle", "cx": 2166, "cy": 1132,
            "innerRadius": 38, "featherWorld": 24,
        }],
    },
    {
        "id": "crystal-approach-north-912-v1",
        "slug": "crystal-approach-north",
        "x": 1792,
        "y": 736,
        "master": BATCH / "crystal-approach-north-authored-master-v1.png",
        "composition": BATCH / "composition-refs/crystal-approach-north-composition-512.png",
        "visualExclusions": [{
            "shape": "circle", "cx": 2166, "cy": 1132,
            "innerRadius": 38, "featherWorld": 24,
        }],
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
METRICS = BATCH / "central-east-lattice-metrics-v1.json"
CONTACT_SHEET = BATCH / "central-east-lattice-contact-sheet-v1.png"
SHARED_COMPOSITE = BATCH / "central-east-shared-composite-912-v1.png"


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
        prior_px = prior.load()
        mask_px = mask.load()
        if axis == "x":
            for y in range(LATTICE_SIZE):
                overlap = [x for x in range(LATTICE_SIZE) if prior_px[x, y] != 0]
                if not overlap:
                    continue
                start, end = overlap[0], overlap[-1]
                for x in overlap:
                    mask_px[x, y] = round(255 * (x - start) / max(1, end - start))
        elif axis == "y":
            for x in range(LATTICE_SIZE):
                overlap = [y for y in range(LATTICE_SIZE) if prior_px[x, y] != 0]
                if not overlap:
                    continue
                start, end = overlap[0], overlap[-1]
                for y in overlap:
                    mask_px[x, y] = round(255 * (end - y) / max(1, end - start))
        else:
            raise AssertionError(axis)
    prior_rgb = canvas.crop((left, top, left + LATTICE_SIZE, top + LATTICE_SIZE))
    canvas.paste(Image.composite(image, prior_rgb, mask), (left, top))
    coverage.paste(Image.new("L", image.size, 255), (left, top), Image.new("L", image.size, 255))


def build_shared_composite() -> tuple[Image.Image, dict[str, Image.Image]]:
    reduced = {region["slug"]: load_master(region) for region in REGIONS}
    canvas = Image.new("RGB", UNION_SIZE, (0, 0, 0))
    coverage = Image.new("L", UNION_SIZE, 0)
    blend_axes = {
        "millbrook-west": None,
        "millbrook-port": "x",
        "north-fork": "y",
        "darkfang-mid": "y",
        "darkfang-bridge": "y",
        "darkfang-north": "y",
        "crystal-approach-south": "x",
        "crystal-approach-north": "y",
    }
    for region in REGIONS:
        left = lattice_offset(region["x"] - UNION_LEFT)
        top = lattice_offset(region["y"] - UNION_TOP)
        paste_crossfade(canvas, coverage, reduced[region["slug"]], left, top, blend_axes[region["slug"]])
    quantized = canvas.quantize(
        colors=PALETTE_COLORS,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    outputs = {}
    for region in REGIONS:
        left = lattice_offset(region["x"] - UNION_LEFT)
        top = lattice_offset(region["y"] - UNION_TOP)
        outputs[region["slug"]] = quantized.crop((left, top, left + LATTICE_SIZE, top + LATTICE_SIZE))
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
            is_canopy = g > r * 1.06 and g > b * 0.78 and luminance < 94
            if is_canopy:
                occ[x, y] = (r, g, b, 242)
    return water, occlusion


def feather_mask(region: dict[str, object]) -> Image.Image:
    mask = Image.new("L", (LATTICE_SIZE, LATTICE_SIZE), 0)
    pixels = mask.load()
    pixel_scale = LATTICE_SIZE / WORLD_SIZE
    for y in range(LATTICE_SIZE):
        for x in range(LATTICE_SIZE):
            distance_world = min(x, y, LATTICE_SIZE - 1 - x, LATTICE_SIZE - 1 - y) / pixel_scale
            t = min(1.0, distance_world / FEATHER_WORLD)
            alpha = t * t * (3.0 - 2.0 * t)
            world_x = region["x"] + x / pixel_scale
            world_y = region["y"] + y / pixel_scale
            for exclusion in region.get("visualExclusions", []):
                if exclusion["shape"] != "circle":
                    raise AssertionError(f"unsupported visual exclusion: {exclusion['shape']}")
                distance = math.hypot(world_x - exclusion["cx"], world_y - exclusion["cy"])
                exclusion_t = max(0.0, min(
                    1.0,
                    (distance - exclusion["innerRadius"]) / exclusion["featherWorld"],
                ))
                exclusion_alpha = exclusion_t * exclusion_t * (3.0 - 2.0 * exclusion_t)
                alpha = min(alpha, exclusion_alpha)
            pixels[x, y] = round(255 * alpha)
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
    return numerator / math.sqrt(left_energy * right_energy)


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
        draw.text((x + 10, 16), f"{region['id']}  world=({region['x']},{region['y']})", fill=(235, 239, 229), font=font)
    return sheet


def render_all() -> tuple[Image.Image, dict[str, dict[str, Image.Image]]]:
    composite, bases = build_shared_composite()
    rendered = {}
    for region in REGIONS:
        slug = region["slug"]
        base = bases[slug]
        water, occlusion = fx_layers(base, region["x"], region["y"])
        mask = feather_mask(region)
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
    composite, rendered = render_all()
    rebuilt_composite, rebuilt = render_all()
    deterministic = png_bytes(composite) == png_bytes(rebuilt_composite)
    if not deterministic:
        raise AssertionError("non-deterministic shared composite")
    SHARED_COMPOSITE.write_bytes(png_bytes(composite))

    metrics: dict[str, object] = {
        "pipeline": {
            "worldSourcePixelsPerWorldPixel": float(LATTICE_SCALE),
            "worldSourcePixelsPerWorldPixelExact": "57/32",
            "masterReduction": "Pillow LANCZOS to 912x912 per 512-world region",
            "sharedComposite": "deterministic overlap crossfade on one global 57/32 lattice",
            "paletteReduction": f"global Pillow MEDIANCUT {PALETTE_COLORS} colors, no dithering",
            "runtimeFeatherWorld": FEATHER_WORLD,
            "collisionOwner": "authored geometry only; pixels are visual inputs only",
        },
        "unionWorldBounds": [UNION_LEFT, UNION_TOP, UNION_RIGHT, UNION_BOTTOM],
        "unionLatticeDimensions": list(UNION_SIZE),
        "sharedCompositeSha256": hashlib.sha256(png_bytes(composite)).hexdigest(),
        "sharedCompositePath": str(SHARED_COMPOSITE.relative_to(RUNTIME)),
        "deterministicRerender": deterministic,
        "regions": [],
    }
    for region in REGIONS:
        slug = region["slug"]
        paths = output_paths(slug)
        for key, path in paths.items():
            first = png_bytes(rendered[slug][key])
            second = png_bytes(rebuilt[slug][key])
            if first != second:
                raise AssertionError(f"non-deterministic output: {path}")
            path.write_bytes(first)
        composition = Image.open(region["composition"]).convert("RGB")
        with Image.open(region["master"]) as source_master:
            master = source_master.convert("RGB")
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
                "dimensions": list(Image.open(region["master"]).size),
            },
            "compositionReference": {
                "path": str(region["composition"].relative_to(RUNTIME)),
                "sha256": sha256_path(region["composition"]),
                "rawMasterCoarse64LuminanceCorrelation": raw_64,
                "rawMasterMacro24LuminanceCorrelation": raw_24,
                "compositedCoarse64LuminanceCorrelation": composited_64,
                "compositedMacro24LuminanceCorrelation": composited_24,
                "macroGateThreshold": 0.45,
                "macroGatePass": composited_24 >= 0.45,
            },
            "visualExclusions": region.get("visualExclusions", []),
            "outputs": {
                key: {"path": str(path.relative_to(RUNTIME)), "sha256": sha256_path(path), "dimensions": list(Image.open(path).size)}
                for key, path in paths.items()
            },
        })
    sheet = contact_sheet({slug: layers["base"] for slug, layers in rendered.items()})
    CONTACT_SHEET.write_bytes(png_bytes(sheet))
    metrics["contactSheet"] = {
        "path": str(CONTACT_SHEET.relative_to(RUNTIME)),
        "sha256": sha256_path(CONTACT_SHEET),
        "dimensions": list(sheet.size),
    }
    METRICS.write_text(json.dumps(metrics, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    assert UNION_SIZE == (2166, 3135)
    assert len({region["id"] for region in REGIONS}) == len(REGIONS)
    assert all(Image.open(path).size == (LATTICE_SIZE, LATTICE_SIZE) for region in REGIONS for path in output_paths(region["slug"]).values())
    assert all(Image.open(output_paths(region["slug"])["baseRuntime"]).getpixel((0, 0))[3] == 0 for region in REGIONS)
    print("ACT 1 CENTRAL-EAST LATTICES BUILT: 8 authored regions on one deterministic 57/32 lattice")


if __name__ == "__main__":
    main()
