#!/usr/bin/env python3
"""Build isolated deterministic review evidence for the Coral Reef v2 candidate."""

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
V1 = RUNTIME / "coastal-reef-912-v1"
REVIEW = RUNTIME / "coastal-reef-entrance-v2-review"
EVIDENCE = RUNTIME / "walkable-regions-v1/evidence"

CHANNEL_MASTER = V1 / "coastal-channel-authored-master-v1.png"
REEF_V1_MASTER = V1 / "coastal-reef-authored-master-v1.png"
REEF_V2_MASTER = REVIEW / "coastal-reef-authored-master-v2-locked.png"
COMPOSITION = V1 / "composition-refs/coastal-reef-composition-512.png"
COLLISION_REFERENCE = EVIDENCE / "collision-reference-affinity-neutral.png"
COLLISION_INVENTORY = EVIDENCE / "collision-reference-inventory.json"
V1_BATCH_INVENTORY = RUNTIME / "coastal-reef-912-r08/evidence/coastal-reef-912-batch-inventory-v1.json"

LATTICE_SCALE = Fraction(57, 32)
WORLD_SIZE = 512
LATTICE_SIZE = 912
PALETTE_COLORS = 192
FEATHER_WORLD = 24
CHANNEL_ORIGIN = (1696, 1888)
REEF_ORIGIN = (1568, 2144)
UNION_ORIGIN = (1568, 1888)
UNION_SIZE = (1140, 1368)
ENTRANCE_CROP = (430, 780, 884, 1234)

EXPECTED_INPUTS = {
    REEF_V1_MASTER: "fd678b7c63020148d66ba3d93c8fa2e5d50aae5106a2b0a7e43e60661f717980",
    CHANNEL_MASTER: "097c4608982e7aab545f291c0a1cdba6ac033da628d4ab4033a86cada286eebf",
    COMPOSITION: "c4f51d1afc14857364eb33468a42db15c365c7e953ab6c07a3b0ca9ecf15d9db",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_path(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def png_bytes(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=False, compress_level=9)
    return output.getvalue()


def correlation(left: Image.Image, right: Image.Image, size: tuple[int, int]) -> float:
    left_values = list(left.convert("L").resize(size, Image.Resampling.BOX).getdata())
    right_values = list(right.convert("L").resize(size, Image.Resampling.BOX).getdata())
    left_mean = sum(left_values) / len(left_values)
    right_mean = sum(right_values) / len(right_values)
    numerator = sum((a - left_mean) * (b - right_mean) for a, b in zip(left_values, right_values))
    left_energy = sum((a - left_mean) ** 2 for a in left_values)
    right_energy = sum((b - right_mean) ** 2 for b in right_values)
    denominator = math.sqrt(left_energy * right_energy)
    if denominator == 0:
        raise AssertionError("correlation requires non-uniform inputs")
    return numerator / denominator


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


def runtime_layer(image: Image.Image) -> Image.Image:
    layer = image.convert("RGBA")
    layer.putalpha(feather_mask())
    return layer


def build_lattice() -> tuple[Image.Image, Image.Image]:
    channel = Image.open(CHANNEL_MASTER).convert("RGB").resize(
        (LATTICE_SIZE, LATTICE_SIZE), Image.Resampling.LANCZOS
    )
    reef = Image.open(REEF_V2_MASTER).convert("RGB").resize(
        (LATTICE_SIZE, LATTICE_SIZE), Image.Resampling.LANCZOS
    )
    canvas = Image.new("RGB", UNION_SIZE, (0, 0, 0))
    channel_left = int((CHANNEL_ORIGIN[0] - UNION_ORIGIN[0]) * LATTICE_SCALE)
    channel_top = int((CHANNEL_ORIGIN[1] - UNION_ORIGIN[1]) * LATTICE_SCALE)
    reef_left = int((REEF_ORIGIN[0] - UNION_ORIGIN[0]) * LATTICE_SCALE)
    reef_top = int((REEF_ORIGIN[1] - UNION_ORIGIN[1]) * LATTICE_SCALE)
    canvas.paste(channel, (channel_left, channel_top))

    overlap_top = channel_top + int(256 * LATTICE_SCALE)
    overlap_bottom = channel_top + LATTICE_SIZE
    mask = Image.new("L", reef.size, 255)
    mask_pixels = mask.load()
    for x in range(LATTICE_SIZE):
        global_x = reef_left + x
        if not channel_left <= global_x < channel_left + LATTICE_SIZE:
            continue
        for y in range(LATTICE_SIZE):
            global_y = reef_top + y
            if overlap_top <= global_y < overlap_bottom:
                fraction = (global_y - overlap_top) / max(1, overlap_bottom - overlap_top - 1)
                mask_pixels[x, y] = round(255 * fraction)
    prior = canvas.crop((reef_left, reef_top, reef_left + LATTICE_SIZE, reef_top + LATTICE_SIZE))
    canvas.paste(Image.composite(reef, prior, mask), (reef_left, reef_top))
    quantized = canvas.quantize(
        colors=PALETTE_COLORS,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    reef_lattice = quantized.crop(
        (reef_left, reef_top, reef_left + LATTICE_SIZE, reef_top + LATTICE_SIZE)
    )
    return quantized, reef_lattice


def build_full_map(runtime: Image.Image) -> Image.Image:
    full_map = Image.open(COLLISION_REFERENCE).convert("RGBA")
    layer = runtime.resize((WORLD_SIZE, WORLD_SIZE), Image.Resampling.NEAREST)
    full_map.alpha_composite(layer, REEF_ORIGIN)
    return full_map.convert("RGB")


def build_contact_sheet(master: Image.Image, lattice: Image.Image, full_map: Image.Image) -> Image.Image:
    sheet = Image.new("RGB", (1200, 920), (10, 13, 16))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    master_panel = master.resize((540, 540), Image.Resampling.LANCZOS)
    sheet.paste(master_panel, (20, 54))
    draw.text((20, 22), "V2 LOCKED MASTER - 1254 x 1254 RGB", fill=(235, 239, 229), font=font)

    crop = master.crop(ENTRANCE_CROP).resize((360, 360), Image.Resampling.NEAREST)
    sheet.paste(crop, (600, 54))
    draw.text((600, 22), "DRY REEF CAVE APPROACH - NATIVE CROP", fill=(235, 239, 229), font=font)

    lattice_panel = lattice.resize((250, 250), Image.Resampling.NEAREST)
    sheet.paste(lattice_panel, (20, 646))
    draw.text((20, 614), "57/32 LATTICE - 912 CONTEXT", fill=(235, 239, 229), font=font)

    overview = full_map.resize((203, 250), Image.Resampling.LANCZOS)
    sheet.paste(overview, (310, 646))
    draw.text((310, 614), "FULL ACT 1 CONTEXT", fill=(235, 239, 229), font=font)

    map_crop = full_map.crop((1500, 2070, 2140, 2710)).resize((250, 250), Image.Resampling.NEAREST)
    sheet.paste(map_crop, (553, 646))
    draw.text((553, 614), "FULL-MAP REEF CROP", fill=(235, 239, 229), font=font)

    source = Image.open(REEF_V1_MASTER).convert("RGB").crop(ENTRANCE_CROP)
    source = source.resize((250, 250), Image.Resampling.NEAREST)
    sheet.paste(source, (843, 646))
    draw.text((843, 614), "V1 SAME CROP", fill=(235, 239, 229), font=font)
    return sheet


def verify_accepted_inputs() -> dict[str, object]:
    for path, expected in EXPECTED_INPUTS.items():
        actual = sha256_path(path)
        if actual != expected:
            raise AssertionError(f"immutable input changed: {path} {actual} != {expected}")
    inventory = json.loads(COLLISION_INVENTORY.read_text(encoding="utf-8"))
    if len(inventory["inputs"]) != 18:
        raise AssertionError("accepted collision-reference inventory is not 18 inputs")
    for item in inventory["inputs"]:
        path = ROOT / item["path"]
        actual = sha256_path(path)
        if actual != item["sha256"]:
            raise AssertionError(f"accepted input changed: {item['path']}")
    v1_inventory = json.loads(V1_BATCH_INVENTORY.read_text(encoding="utf-8"))
    if len(v1_inventory["entries"]) != 22:
        raise AssertionError("accepted Coastal Reef v1 inventory is not 22 files")
    for relative_path, expected in v1_inventory["entries"]:
        actual = sha256_path(ROOT / relative_path)
        if actual != expected:
            raise AssertionError(f"accepted Coastal Reef v1 file changed: {relative_path}")
    return {
        "collisionReference": {
            "count": len(inventory["inputs"]),
            "pass": True,
            "inventoryPath": str(COLLISION_INVENTORY.relative_to(ROOT)),
            "inventorySha256": sha256_path(COLLISION_INVENTORY),
        },
        "coastalReefV1Batch": {
            "count": len(v1_inventory["entries"]),
            "pass": True,
            "inventoryPath": str(V1_BATCH_INVENTORY.relative_to(ROOT)),
            "inventorySha256": sha256_path(V1_BATCH_INVENTORY),
            "canonicalAggregate": v1_inventory["canonicalAggregate"],
        },
    }


def render() -> dict[str, Image.Image]:
    master = Image.open(REEF_V2_MASTER).convert("RGB")
    if master.size != (1254, 1254) or master.mode != "RGB":
        raise AssertionError(f"candidate must be 1254x1254 RGB: {master.size} {master.mode}")
    shared, lattice = build_lattice()
    runtime = runtime_layer(lattice)
    full_map = build_full_map(runtime)
    contact = build_contact_sheet(master, lattice, full_map)
    return {
        "shared": shared,
        "lattice": lattice,
        "runtime": runtime,
        "fullMap": full_map,
        "contact": contact,
    }


def main() -> None:
    accepted = verify_accepted_inputs()
    first = render()
    second = render()
    for key in first:
        if png_bytes(first[key]) != png_bytes(second[key]):
            raise AssertionError(f"non-deterministic output: {key}")

    outputs = {
        "shared": REVIEW / "coastal-reef-shared-composite-912-v2-candidate.png",
        "lattice": REVIEW / "coastal-reef-lattice-912-v2-candidate.png",
        "runtime": REVIEW / "coastal-reef-lattice-912-runtime-v2-candidate.png",
        "fullMap": REVIEW / "coastal-reef-full-map-context-v2-candidate.png",
        "contact": REVIEW / "coastal-reef-entrance-contact-sheet-v2-candidate.png",
    }
    for key, path in outputs.items():
        path.write_bytes(png_bytes(first[key]))

    v1 = Image.open(REEF_V1_MASTER).convert("RGB")
    candidate = Image.open(REEF_V2_MASTER).convert("RGB")
    composition = Image.open(COMPOSITION).convert("RGB")
    channel = Image.open(CHANNEL_MASTER).convert("RGB").resize((512, 512), Image.Resampling.LANCZOS)
    reef_512 = candidate.resize((512, 512), Image.Resampling.LANCZOS)
    channel_overlap = channel.crop((0, 256, 384, 512))
    reef_overlap = reef_512.crop((128, 0, 512, 256))
    edge_sets = [
        set(candidate.crop((0, 0, candidate.width, 1)).getdata()),
        set(candidate.crop((0, candidate.height - 1, candidate.width, candidate.height)).getdata()),
        set(candidate.crop((0, 0, 1, candidate.height)).getdata()),
        set(candidate.crop((candidate.width - 1, 0, candidate.width, candidate.height)).getdata()),
    ]
    full_map = first["fullMap"]
    accepted_map = Image.open(COLLISION_REFERENCE).convert("RGB")
    outer_boundary_identity = all(
        full_map.getpixel((x, y)) == accepted_map.getpixel((x, y))
        for x, y in (
            *((x, REEF_ORIGIN[1]) for x in range(REEF_ORIGIN[0], REEF_ORIGIN[0] + WORLD_SIZE)),
            *((x, REEF_ORIGIN[1] + WORLD_SIZE - 1) for x in range(REEF_ORIGIN[0], REEF_ORIGIN[0] + WORLD_SIZE)),
            *((REEF_ORIGIN[0], y) for y in range(REEF_ORIGIN[1], REEF_ORIGIN[1] + WORLD_SIZE)),
            *((REEF_ORIGIN[0] + WORLD_SIZE - 1, y) for y in range(REEF_ORIGIN[1], REEF_ORIGIN[1] + WORLD_SIZE)),
        )
    )
    metrics = {
        "schema": "act1-coral-reef-entrance-v2-review-v1",
        "generationMode": "built-in image_gen precise-object-edit",
        "candidate": {
            "path": str(REEF_V2_MASTER.relative_to(ROOT)),
            "sha256": sha256_path(REEF_V2_MASTER),
            "dimensions": list(candidate.size),
            "mode": candidate.mode,
            "fullBleed": all(len(values) > 1 for values in edge_sets),
        },
        "immutableInputs": {
            str(path.relative_to(ROOT)): {"sha256": sha256_path(path), "pass": True}
            for path in EXPECTED_INPUTS
        },
        "acceptedInputs": accepted,
        "gates": {
            "macro24CompositionCorrelation": correlation(candidate, composition, (24, 24)),
            "macroGateThreshold": 0.45,
            "macroGatePass": correlation(candidate, composition, (24, 24)) >= 0.45,
            "v1ToCandidateCoarse64Correlation": correlation(v1, candidate, (64, 64)),
            "channelToCandidateOverlapCorrelation": correlation(channel_overlap, reef_overlap, (48, 32)),
            "fullMapOuterBoundaryPixelIdentity": outer_boundary_identity,
            "deterministicRerender": True,
        },
        "pipeline": {
            "lattice": "exact 57/32 shared coordinate lattice",
            "palette": "one 192-color MEDIANCUT no-dither palette",
            "crossfade": "directed north-to-south y+ overlap with accepted Coastal Channel",
            "runtimeFeatherWorld": FEATHER_WORLD,
            "reviewOnly": True,
        },
        "outputs": {
            key: {
                "path": str(path.relative_to(ROOT)),
                "sha256": sha256_path(path),
                "dimensions": list(first[key].size),
                "mode": first[key].mode,
            }
            for key, path in outputs.items()
        },
    }
    if not metrics["gates"]["macroGatePass"]:
        raise AssertionError("candidate failed the existing 0.45 macro correlation gate")
    if not metrics["candidate"]["fullBleed"]:
        raise AssertionError("candidate has a uniform edge and is not full-bleed")
    if not outer_boundary_identity:
        raise AssertionError("review composite changes the accepted outer seam boundary")
    (REVIEW / "coastal-reef-entrance-metrics-v2-candidate.json").write_text(
        json.dumps(metrics, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print("ACT 1 CORAL-REEF ENTRANCE V2 REVIEW BUILT: isolated deterministic evidence")


if __name__ == "__main__":
    main()
