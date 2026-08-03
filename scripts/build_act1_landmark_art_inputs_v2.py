#!/usr/bin/env python3
"""Promote Relay 17 owner-locked landmark art into design-only v2 batches."""

from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import math
from copy import deepcopy
from fractions import Fraction
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2"
LOCALIZED = RUNTIME / "landmark-boundary-localized-v3-review"
PORT_V1 = RUNTIME / "port-pixel-source"
PORT_V2 = RUNTIME / "port-pixel-source-v2"
WESTERN_V1 = RUNTIME / "western-hub-912-v1"
WESTERN_V2 = RUNTIME / "western-hub-912-v2"
CENTRAL_V1 = RUNTIME / "central-east-912-v1"
CENTRAL_V2 = RUNTIME / "central-east-912-v2"
DEEP_V1 = RUNTIME / "deep-sunken-outer-west-912-v1"
DEEP_V2 = RUNTIME / "deep-sunken-outer-west-912-v2"
CORAL_V2 = RUNTIME / "coastal-reef-912-v2"
REVIEW = RUNTIME / "landmark-art-promotion-r17"
EVIDENCE = REVIEW / "evidence"

WORLD_SIZE = 512
LATTICE_SIZE = 912
LATTICE_SCALE = Fraction(57, 32)
MASTER_SIZE = 1254
MAP_REGION_SIZE = 320
MANIFEST_SHA256 = "67be41f978f3c4da51a4069dab343a9b0ecdf1756ca7a4239098e3ec94ea8724"

TARGETS = {
    "port-sapphire": (
        LOCALIZED / "port-sapphire-authored-master-v3-localized-candidate.png",
        PORT_V2 / "port-sapphire-authored-master-v2.png",
        "458d93125f57d37301ab4124ec06650ad39afa613c91ed41498ceade5ef47430",
        RUNTIME / "port-hires/port-sapphire-locked-crop-512.png",
    ),
    "greenhollow-hub": (
        LOCALIZED / "greenhollow-hub-authored-master-v3-localized-candidate.png",
        WESTERN_V2 / "greenhollow-hub-authored-master-v2.png",
        "bd635ed99b6f8cda204ac513f5c8a45e943cc066bb4b10ec848ca9adb4d288d3",
        WESTERN_V1 / "composition-refs/greenhollow-hub-composition-512.png",
    ),
    "sunken-deep": (
        LOCALIZED / "sunken-deep-authored-master-v3-localized-candidate.png",
        DEEP_V2 / "sunken-deep-authored-master-v2.png",
        "c685d4b8b01ecd0de71256ae05c614217748cc321bc77af16999310027f832f8",
        DEEP_V1 / "composition-refs/sunken-deep-composition-512.png",
    ),
    "millbrook-west": (
        LOCALIZED / "millbrook-west-authored-master-v4-owner-locked.png",
        CENTRAL_V2 / "millbrook-west-authored-master-v2.png",
        "b6338f3e41c3067f5de2ebc2bc4518a9def4d91dbe5c93a6db04499856f98190",
        CENTRAL_V1 / "composition-refs/millbrook-west-composition-512.png",
    ),
    "coastal-reef": (
        RUNTIME / "coastal-reef-entrance-v2-review/coastal-reef-authored-master-v2-locked.png",
        CORAL_V2 / "coastal-reef-authored-master-v2.png",
        "d700133209e0117fbacf644876f33a5bb64c695877c7dd2d47707ab24e1f8dea",
        CORAL_V2 / "composition-refs/coastal-reef-composition-512.png",
    ),
}

EXPECTED = {
    # Target and composition locks.
    TARGETS["port-sapphire"][0]: TARGETS["port-sapphire"][2],
    TARGETS["greenhollow-hub"][0]: TARGETS["greenhollow-hub"][2],
    TARGETS["sunken-deep"][0]: TARGETS["sunken-deep"][2],
    TARGETS["millbrook-west"][0]: TARGETS["millbrook-west"][2],
    TARGETS["coastal-reef"][0]: TARGETS["coastal-reef"][2],
    TARGETS["coastal-reef"][1]: TARGETS["coastal-reef"][2],
    RUNTIME / "port-hires/port-sapphire-locked-crop-512.png": "60215cfdb8d436ed63ef4fde12fcb647cd71c4a5c93944503b896ee43e37e389",
    # Accepted western masters.
    WESTERN_V1 / "whispering-approach-authored-master-v1.png": "79d7e2865cb8b12507f46feb55199da4f379c6c2b36a7d560ec900786b41e5de",
    WESTERN_V1 / "greenhollow-hub-authored-master-v1.png": "e4a3d89b2b682a25d74bef8b972b57a76ea51f68d9ba7f3d7e6213b912cce82c",
    WESTERN_V1 / "sunken-approach-authored-master-v1.png": "85b3a08409a69608e900c10032eaae6041ffb92944ef2e7a7788e7e6a566ab3e",
    WESTERN_V1 / "greenhollow-millbrook-authored-master-v1.png": "de8cc7fc769f67df9c0b55cb6c659206111126d8348fd7faca0abe670169eec0",
    # Accepted central masters.
    CENTRAL_V1 / "millbrook-west-authored-master-v1.png": "448cfacc4f84382ff0d0435c1f1bd1185e4cb52cdab26b6c6df90af734be7536",
    CENTRAL_V1 / "millbrook-port-authored-master-v1.png": "64aab8e050f6179855f99d17dd87fbcda7fb7bc1223c6eef199b6f917068c12a",
    CENTRAL_V1 / "north-fork-authored-master-v1.png": "fdc9fb0f4d15674d1fb3857f3dd9a25a20489486164350a4428e68c31c2147b8",
    CENTRAL_V1 / "darkfang-mid-authored-master-v1.png": "b265e7ed09f1a3eba234fc7de13f8a376df2999b306798b13643565d8f51650b",
    CENTRAL_V1 / "darkfang-bridge-authored-master-v1.png": "0292869492e4259b08e6f7b6c83070ce9755f147a08bd6794511cc0f747f0178",
    CENTRAL_V1 / "darkfang-north-authored-master-v2.png": "66eb0fdcfaf46971f8fc6ddc1f78263a73432492eb120a210f103495161a9ab6",
    CENTRAL_V1 / "crystal-approach-south-authored-master-v1.png": "1eedb92363fed81e18fcd651cc49c0fb75a24547ff980c36ad445d04b84e9d7f",
    CENTRAL_V1 / "crystal-approach-north-authored-master-v1.png": "147b1e9d722ccd25220c17165fa2117d3ca03fd1236c23980bb16bfc11d44b4f",
    # Accepted deep/outer and Coral carry-forwards.
    DEEP_V1 / "sunken-deep-authored-master-v1.png": "9a8366101b2f622177029a0f2525275294026ab900ef2450c957e98a769711a9",
    DEEP_V1 / "millbrook-outer-west-authored-master-v1.png": "28e374b285dda3fdd530df76d3c4181ad76ee6b16691103ccbc7e1fdbf4d6f46",
    CORAL_V2 / "coastal-channel-authored-master-v2.png": "097c4608982e7aab545f291c0a1cdba6ac033da628d4ab4033a86cada286eebf",
    CORAL_V2 / "composition-refs/coastal-channel-composition-512.png": "481009206d7067d1d59857f0490a3eb46b64d655c0889d42a45178a7b50e74e5",
    CORAL_V2 / "composition-refs/coastal-reef-composition-512.png": "c4f51d1afc14857364eb33468a42db15c365c7e953ab6c07a3b0ca9ecf15d9db",
}

REF_HASHES = {
    "central": {
        "crystal-approach-north-composition-512.png": "d1eff18a389e225b9a9fe74b325728a5b5e4c7b4680afd4fc71c4fa7b1eb315b",
        "crystal-approach-south-composition-512.png": "3111202dec628f0d12695b953079f95a67b327bef8dcd21ac541d4573f27d653",
        "darkfang-bridge-composition-512.png": "1df7508922c19d5d9fdb111e6424ca0bec94e14792094664896dc88cab9c01d5",
        "darkfang-mid-composition-512.png": "0f632e7c0e6c0d301fef1a22d968928cedd5e84977ef1eb6e2455cc8fb549439",
        "darkfang-north-composition-512.png": "aa42364cac54a1723e46977279e9ce5f7dfd0f11ae936cc19d79855dba226cf4",
        "millbrook-port-composition-512.png": "7a740f6fe3c3fbe0550e9b5e89de4e367d776a421a3d27c1a15f4559201bbc53",
        "millbrook-west-composition-512.png": "84d3be1b745b38591c696fa83629a0fd512d27af9abf0f9de857178dcafec404",
        "north-fork-composition-512.png": "47e7e81d23611980ab9c8d294e0fe0cb4b1aa5ab2442b5901c96294cb5023300",
    },
    "western": {
        "greenhollow-hub-composition-512.png": "5337f6538506f209b93b4d6f8f1eca25fb3858a2e2f3fbc61dfa06d3b0f19912",
        "greenhollow-millbrook-composition-512.png": "ab967139c32a2d2c9b22f6939ccfcb9b6b4401e59744b511ba8284a55fd8a860",
        "sunken-approach-composition-512.png": "be98b4481d3fff852df9415ce46ffdab9f3bdc3a33d63a8862c648e8374d5822",
        "whispering-approach-composition-512.png": "fe8d4236ea0049c719eb12cb8a461c1ba7eadfefcafcb7628f3462db07290053",
    },
    "deep": {
        "millbrook-outer-west-composition-512.png": "9e1ebaf33338ac43b9447ded60a9654dde9c8b3cf66694f4325648c5f9579d83",
        "sunken-deep-composition-512.png": "7b8c05789fb1224c35e0831bc32a2588ae2a99019b99731415e7088c13cdb411",
    },
}

PRESERVED_ROOTS = [
    PORT_V1,
    WESTERN_V1,
    CENTRAL_V1,
    DEEP_V1,
    CORAL_V2,
    RUNTIME / "manifest.json",
    ROOT / "public/act1-hifi",
    ROOT / "dist/act1-hifi",
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=False, compress_level=9)
    return buffer.getvalue()


def load_rgb(path: Path, size: tuple[int, int] | None = None) -> Image.Image:
    with Image.open(path) as source:
        image = source.copy()
    if image.mode != "RGB":
        raise AssertionError(f"{path}: expected RGB, got {image.mode}")
    if size is not None and image.size != size:
        raise AssertionError(f"{path}: expected {size}, got {image.size}")
    return image


def snapshot(paths: list[Path]) -> dict[str, str]:
    entries: dict[str, str] = {}
    for root in paths:
        files = [root] if root.is_file() else sorted(path for path in root.rglob("*") if path.is_file())
        for path in files:
            entries[path.relative_to(ROOT).as_posix()] = sha256(path)
    return entries


def verify_locked_sources() -> None:
    manifest = RUNTIME / "manifest.json"
    if sha256(manifest) != MANIFEST_SHA256:
        raise AssertionError("runtime-v2 manifest is not the locked revision-9 file")
    for path, expected in EXPECTED.items():
        actual = sha256(path)
        if actual != expected:
            raise AssertionError(f"locked source changed: {path} {actual} != {expected}")
    for group, hashes in REF_HASHES.items():
        source = {"central": CENTRAL_V1, "western": WESTERN_V1, "deep": DEEP_V1}[group]
        for name, expected in hashes.items():
            path = source / "composition-refs" / name
            if sha256(path) != expected:
                raise AssertionError(f"composition reference changed: {path}")
    for source, _, _, _ in TARGETS.values():
        load_rgb(source, (MASTER_SIZE, MASTER_SIZE))


def copy_exact(source: Path, target: Path, expected: str | None = None) -> None:
    if expected is not None and sha256(source) != expected:
        raise AssertionError(f"copy source hash mismatch: {source}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(source.read_bytes())
    if sha256(target) != sha256(source):
        raise AssertionError(f"copy is not byte-identical: {source} -> {target}")


def prepare_inputs() -> None:
    for key in ("port-sapphire", "greenhollow-hub", "sunken-deep", "millbrook-west"):
        source, target, expected, _ = TARGETS[key]
        copy_exact(source, target, expected)

    western_carries = ["whispering-approach", "sunken-approach", "greenhollow-millbrook"]
    for slug in western_carries:
        source = WESTERN_V1 / f"{slug}-authored-master-v1.png"
        copy_exact(source, WESTERN_V2 / f"{slug}-authored-master-v2.png", EXPECTED[source])
    for name, expected in REF_HASHES["western"].items():
        copy_exact(WESTERN_V1 / "composition-refs" / name, WESTERN_V2 / "composition-refs" / name, expected)

    central_sources = {
        "millbrook-port": "millbrook-port-authored-master-v1.png",
        "north-fork": "north-fork-authored-master-v1.png",
        "darkfang-mid": "darkfang-mid-authored-master-v1.png",
        "darkfang-bridge": "darkfang-bridge-authored-master-v1.png",
        "darkfang-north": "darkfang-north-authored-master-v2.png",
        "crystal-approach-south": "crystal-approach-south-authored-master-v1.png",
        "crystal-approach-north": "crystal-approach-north-authored-master-v1.png",
    }
    for slug, filename in central_sources.items():
        source = CENTRAL_V1 / filename
        copy_exact(source, CENTRAL_V2 / f"{slug}-authored-master-v2.png", EXPECTED[source])
    for name, expected in REF_HASHES["central"].items():
        copy_exact(CENTRAL_V1 / "composition-refs" / name, CENTRAL_V2 / "composition-refs" / name, expected)

    for name, expected in REF_HASHES["deep"].items():
        copy_exact(DEEP_V1 / "composition-refs" / name, DEEP_V2 / "composition-refs" / name, expected)

    copy_exact(
        RUNTIME / "port-hires/port-sapphire-locked-crop-512.png",
        PORT_V2 / "composition-refs/port-sapphire-composition-512.png",
        EXPECTED[RUNTIME / "port-hires/port-sapphire-locked-crop-512.png"],
    )


def smoothstep(value: np.ndarray) -> np.ndarray:
    clipped = np.clip(value, 0.0, 1.0)
    return clipped * clipped * (3.0 - 2.0 * clipped)


def source_rect(intersection: tuple[int, int, int, int], origin: tuple[int, int]) -> tuple[int, int, int, int]:
    scale = MASTER_SIZE / WORLD_SIZE
    x0, y0, x1, y1 = intersection
    return tuple(round(value * scale) for value in (x0 - origin[0], y0 - origin[1], x1 - origin[0], y1 - origin[1]))


def derive_outer_west_companion() -> dict[str, object]:
    """Carry exact Millbrook-v4 overlap into outer-west without v5/v6 art."""
    target = load_rgb(TARGETS["millbrook-west"][1], (MASTER_SIZE, MASTER_SIZE))
    base_path = DEEP_V1 / "millbrook-outer-west-authored-master-v1.png"
    base = load_rgb(base_path, (MASTER_SIZE, MASTER_SIZE))
    intersection = (1152, 1952, 1600, 2048)
    donor_rect = source_rect(intersection, (1088, 1536))
    edit_rect = source_rect(intersection, (1152, 1952))
    donor = target.crop(donor_rect)
    edit_size = (edit_rect[2] - edit_rect[0], edit_rect[3] - edit_rect[1])
    if donor.size != edit_size:
        donor = donor.resize(edit_size, Image.Resampling.LANCZOS)

    output = base.copy()

    # The accepted v1 outer master contains the obsolete roof below the shared
    # overlap. Cover only that residual with a same-image forest strip before
    # making the exact owner lock the final overlap authority.
    cleanup_rect = (0, 206, 578, 358)
    forest_rect = (676, 206, 1254, 358)
    forest = base.crop(forest_rect)
    height, width = forest.height, forest.width
    yy, xx = np.mgrid[0:height, 0:width]
    cleanup_feather = round(43 * MASTER_SIZE / LATTICE_SIZE)
    left = smoothstep(xx / cleanup_feather)
    right = smoothstep(((width - 1) - xx) / cleanup_feather)
    bottom = smoothstep(((height - 1) - yy) / cleanup_feather)
    cleanup_alpha = np.minimum.reduce((left, right, bottom))
    cleanup_mask = Image.fromarray(np.rint(cleanup_alpha * 255).astype(np.uint8))
    output.paste(forest, (cleanup_rect[0], cleanup_rect[1]), cleanup_mask)

    # Establish b633 as the true 448x96-world intersection authority before
    # adding the foreground canopy that hides its unavoidable off-canvas cut.
    output.paste(donor, (edit_rect[0], edit_rect[1]))

    # The owner lock ends mid-building at its south frame edge. Hide that
    # unavoidable off-canvas cut behind accepted outer-west foreground forest,
    # using only same-image v1 pixels. This is an explicit derived companion,
    # never an extension or redesign of the locked building.
    occlusion_rect = (0, 180, 1097, 360)
    occlusion_donor_rect = (157, 358, 1254, 538)
    occlusion = base.crop(occlusion_donor_rect)
    height, width = occlusion.height, occlusion.width
    yy, xx = np.mgrid[0:height, 0:width]
    feather = 60
    top = smoothstep(yy / feather)
    right = smoothstep(((width - 1) - xx) / feather)
    bottom = smoothstep(((height - 1) - yy) / feather)
    occlusion_alpha = np.minimum.reduce((top, right, bottom))
    occlusion_mask = Image.fromarray(np.rint(occlusion_alpha * 255).astype(np.uint8))
    output.paste(occlusion, (occlusion_rect[0], occlusion_rect[1]), occlusion_mask)
    destination = DEEP_V2 / "millbrook-outer-west-authored-master-v2.png"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(png_bytes(output))

    changed = np.any(np.asarray(base) != np.asarray(output), axis=2)
    allowed = np.zeros(changed.shape, dtype=bool)
    allowed[edit_rect[1]:edit_rect[3], edit_rect[0]:edit_rect[2]] = True
    allowed[cleanup_rect[1]:cleanup_rect[3], cleanup_rect[0]:cleanup_rect[2]] = True
    allowed[occlusion_rect[1]:occlusion_rect[3], occlusion_rect[0]:occlusion_rect[2]] = True
    if np.count_nonzero(changed & ~allowed):
        raise AssertionError("outer-west companion changed outside the geometric overlap")
    return {
        "sourceMillbrookLock": TARGETS["millbrook-west"][2],
        "baseOuterWest": sha256(base_path),
        "derivedSha256": sha256(destination),
        "worldIntersection": list(intersection),
        "millbrookSourceRect": list(donor_rect),
        "outerWestEditRect": list(edit_rect),
        "obsoleteRoofCleanupRect": list(cleanup_rect),
        "acceptedForestDonorRect": list(forest_rect),
        "foregroundOcclusionRect": list(occlusion_rect),
        "foregroundOcclusionDonorRect": list(occlusion_donor_rect),
        "changedPixels": int(changed.sum()),
        "changedPixelsOutsideDeclaredWindows": 0,
        "cleanupFeatherLatticePixels": 43,
        "method": "same-image accepted-v1 cleanup, exact b633 overlap transplant, then accepted-v1 foreground forest occlusion over the off-canvas south cut",
    }


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load builder: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def v2_output_paths(batch: Path, slug: str) -> dict[str, Path]:
    return {
        "base": batch / f"{slug}-lattice-912-v2.png",
        "water": batch / f"{slug}-lattice-912-water-v2.png",
        "occlusion": batch / f"{slug}-lattice-912-occlusion-v2.png",
        "baseRuntime": batch / f"{slug}-lattice-912-runtime-v2.png",
        "waterRuntime": batch / f"{slug}-lattice-912-water-runtime-v2.png",
        "occlusionRuntime": batch / f"{slug}-lattice-912-occlusion-runtime-v2.png",
    }


def configure_group(module, batch: Path, metrics_name: str, contact_name: str, composite_name: str) -> None:
    regions = []
    for source in module.REGIONS:
        region = deepcopy(source)
        slug = region["slug"]
        region["id"] = f"{slug}-912-v2"
        region["master"] = batch / f"{slug}-authored-master-v2.png"
        region["composition"] = batch / "composition-refs" / f"{slug}-composition-512.png"
        regions.append(region)
    module.BATCH = batch
    module.REGIONS = regions
    module.METRICS = batch / metrics_name
    module.CONTACT_SHEET = batch / contact_name
    module.SHARED_COMPOSITE = batch / composite_name
    module.output_paths = lambda slug: v2_output_paths(batch, slug)


def build_group_batches() -> None:
    western = load_module("act1_western_v1", ROOT / "scripts/build_act1_western_hub_lattices.py")
    configure_group(
        western,
        WESTERN_V2,
        "western-hub-lattice-metrics-v2.json",
        "western-hub-lattice-contact-sheet-v2.png",
        "western-hub-shared-composite-912-v2.png",
    )
    western.main()

    central = load_module("act1_central_v1", ROOT / "scripts/build_act1_central_east_lattices.py")
    configure_group(
        central,
        CENTRAL_V2,
        "central-east-lattice-metrics-v2.json",
        "central-east-lattice-contact-sheet-v2.png",
        "central-east-shared-composite-912-v2.png",
    )
    central.main()

    deep = load_module("act1_deep_v1", ROOT / "scripts/build_act1_deep_sunken_outer_west_lattices.py")
    configure_group(
        deep,
        DEEP_V2,
        "deep-sunken-outer-west-lattice-metrics-v2.json",
        "deep-sunken-outer-west-lattice-contact-sheet-v2.png",
        "deep-sunken-outer-west-shared-composite-912-v2.png",
    )
    deep.main()


def build_port_batch() -> None:
    module = load_module(
        "act1_port_v1",
        PORT_V1 / "build_port_sapphire_lattices.py",
    )
    master = load_rgb(PORT_V2 / "port-sapphire-authored-master-v2.png", (MASTER_SIZE, MASTER_SIZE))

    def render() -> dict[str, Image.Image]:
        base = module.build_candidate(master, LATTICE_SIZE)
        water, occlusion = module.fx_layers(base, module.REGION_X, module.REGION_Y)
        mask = module.feather_mask(LATTICE_SIZE)
        return {
            "base": base,
            "water": water,
            "occlusion": occlusion,
            "baseRuntime": module.runtime_overlay(base, mask),
            "waterRuntime": module.runtime_overlay(water, mask),
            "occlusionRuntime": module.runtime_overlay(occlusion, mask),
        }

    first = render()
    second = render()
    paths = v2_output_paths(PORT_V2, "port-sapphire")
    deterministic = {}
    for key, path in paths.items():
        a, b = png_bytes(first[key]), png_bytes(second[key])
        if a != b:
            raise AssertionError(f"non-deterministic Port v2 layer: {key}")
        path.write_bytes(a)
        deterministic[key] = hashlib.sha256(a).hexdigest()
    metrics = {
        "schemaVersion": 1,
        "status": "design-only-v2-art-input; not manifest-promoted",
        "worldBounds": [1856, 1584, 512, 512],
        "latticeScale": "57/32",
        "palette": "Pillow MEDIANCUT 192 colors, no dithering",
        "master": {
            "path": "port-sapphire-authored-master-v2.png",
            "sha256": sha256(PORT_V2 / "port-sapphire-authored-master-v2.png"),
            "dimensions": [MASTER_SIZE, MASTER_SIZE],
            "mode": "RGB",
        },
        "compositionReference": {
            "path": "composition-refs/port-sapphire-composition-512.png",
            "sha256": sha256(PORT_V2 / "composition-refs/port-sapphire-composition-512.png"),
        },
        "deterministicOutputs": deterministic,
    }
    (PORT_V2 / "port-sapphire-lattice-metrics-v2.json").write_text(
        json.dumps(metrics, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


def pearson(left: Image.Image, right: Image.Image, size: int) -> float:
    a = np.asarray(left.convert("L").resize((size, size), Image.Resampling.BOX), dtype=np.float64).ravel()
    b = np.asarray(right.convert("L").resize((size, size), Image.Resampling.BOX), dtype=np.float64).ravel()
    a -= a.mean()
    b -= b.mean()
    denominator = math.sqrt(float(np.dot(a, a) * np.dot(b, b)))
    return float(np.dot(a, b) / denominator) if denominator else 0.0


def lattice_offset(world_value: int) -> int:
    value = world_value * LATTICE_SCALE
    # Independent palette groups can meet on a half lattice pixel (for example
    # Port versus North Fork). Runtime placement resolves that deterministically;
    # review evidence uses the same nearest-pixel convention.
    return round(float(value))


def context_image(regions: list[dict[str, object]]) -> Image.Image:
    left = min(int(region["x"]) for region in regions)
    top = min(int(region["y"]) for region in regions)
    right = max(int(region["x"]) + WORLD_SIZE for region in regions)
    bottom = max(int(region["y"]) + WORLD_SIZE for region in regions)
    width = lattice_offset(right - left)
    height = lattice_offset(bottom - top)
    accum = np.zeros((height, width, 3), dtype=np.float64)
    weights = np.zeros((height, width), dtype=np.float64)
    yy, xx = np.mgrid[0:LATTICE_SIZE, 0:LATTICE_SIZE]
    distance = np.minimum.reduce((xx, yy, LATTICE_SIZE - 1 - xx, LATTICE_SIZE - 1 - yy)).astype(np.float64)
    weight = np.maximum(smoothstep(distance / 171.0), 1e-4)
    for region in regions:
        image = load_rgb(Path(region["path"]), (MASTER_SIZE, MASTER_SIZE)).resize(
            (LATTICE_SIZE, LATTICE_SIZE), Image.Resampling.LANCZOS
        )
        ox = lattice_offset(int(region["x"]) - left)
        oy = lattice_offset(int(region["y"]) - top)
        accum[oy:oy + LATTICE_SIZE, ox:ox + LATTICE_SIZE] += np.asarray(image, dtype=np.float64) * weight[..., None]
        weights[oy:oy + LATTICE_SIZE, ox:ox + LATTICE_SIZE] += weight
    output = np.zeros((height, width, 3), dtype=np.uint8)
    output[:] = (7, 10, 9)
    covered = weights > 0
    output[covered] = np.rint(accum[covered] / weights[covered, None]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(output)


def overlap_stats(a: dict[str, object], b: dict[str, object]) -> dict[str, object]:
    intersection = (
        max(int(a["x"]), int(b["x"])),
        max(int(a["y"]), int(b["y"])),
        min(int(a["x"]) + WORLD_SIZE, int(b["x"]) + WORLD_SIZE),
        min(int(a["y"]) + WORLD_SIZE, int(b["y"]) + WORLD_SIZE),
    )
    if intersection[0] >= intersection[2] or intersection[1] >= intersection[3]:
        raise AssertionError(f"regions do not overlap: {a['name']} {b['name']}")
    ia = load_rgb(Path(a["path"]), (MASTER_SIZE, MASTER_SIZE)).resize((LATTICE_SIZE, LATTICE_SIZE), Image.Resampling.LANCZOS)
    ib = load_rgb(Path(b["path"]), (MASTER_SIZE, MASTER_SIZE)).resize((LATTICE_SIZE, LATTICE_SIZE), Image.Resampling.LANCZOS)
    ax0 = lattice_offset(intersection[0] - int(a["x"])); ay0 = lattice_offset(intersection[1] - int(a["y"]))
    bx0 = lattice_offset(intersection[0] - int(b["x"])); by0 = lattice_offset(intersection[1] - int(b["y"]))
    width = lattice_offset(intersection[2] - intersection[0]); height = lattice_offset(intersection[3] - intersection[1])
    aa = np.asarray(ia.crop((ax0, ay0, ax0 + width, ay0 + height)), dtype=np.int16)
    bb = np.asarray(ib.crop((bx0, by0, bx0 + width, by0 + height)), dtype=np.int16)
    diff = np.abs(aa - bb).astype(np.float64)
    return {
        "pair": [a["name"], b["name"]],
        "worldIntersection": list(intersection),
        "latticeDimensions": [width, height],
        "meanAbsRgb": float(diff.mean()),
        "p95AbsRgb": float(np.percentile(diff, 95)),
    }


def build_evidence(outer_metrics: dict[str, object]) -> dict[str, object]:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    target_order = ["port-sapphire", "greenhollow-hub", "sunken-deep", "millbrook-west", "coastal-reef"]
    native = Image.new("RGB", (MASTER_SIZE * len(target_order), MASTER_SIZE), (7, 10, 9))
    map_sheet = Image.new("RGB", (MAP_REGION_SIZE * len(target_order), MAP_REGION_SIZE), (7, 10, 9))
    for index, key in enumerate(target_order):
        image = load_rgb(TARGETS[key][1], (MASTER_SIZE, MASTER_SIZE))
        native.paste(image, (index * MASTER_SIZE, 0))
        map_sheet.paste(image.resize((MAP_REGION_SIZE, MAP_REGION_SIZE), Image.Resampling.LANCZOS), (index * MAP_REGION_SIZE, 0))
    native_path = EVIDENCE / "landmark-art-v2-route-hidden-native-five-up.png"
    map_path = EVIDENCE / "landmark-art-v2-route-hidden-map-scale-five-up.png"
    native_path.write_bytes(png_bytes(native))
    map_path.write_bytes(png_bytes(map_sheet))

    region = lambda name, path, x, y: {"name": name, "path": path, "x": x, "y": y}
    port = region("port-sapphire-v2", TARGETS["port-sapphire"][1], 1856, 1584)
    green = region("greenhollow-hub-v2", TARGETS["greenhollow-hub"][1], 320, 1664)
    sunken = region("sunken-deep-v2", TARGETS["sunken-deep"][1], 224, 2240)
    mill = region("millbrook-west-v2", TARGETS["millbrook-west"][1], 1088, 1536)
    coral = region("coastal-reef-v2", TARGETS["coastal-reef"][1], 1568, 2144)
    whisper = region("whispering-approach-v2", WESTERN_V2 / "whispering-approach-authored-master-v2.png", 512, 1216)
    approach = region("sunken-approach-v2", WESTERN_V2 / "sunken-approach-authored-master-v2.png", 224, 2112)
    green_mill = region("greenhollow-millbrook-v2", WESTERN_V2 / "greenhollow-millbrook-authored-master-v2.png", 704, 1728)
    mill_port = region("millbrook-port-v2", CENTRAL_V2 / "millbrook-port-authored-master-v2.png", 1504, 1536)
    outer = region("millbrook-outer-west-v2", DEEP_V2 / "millbrook-outer-west-authored-master-v2.png", 1152, 1952)
    channel = region("coastal-channel-v2", CORAL_V2 / "coastal-channel-authored-master-v2.png", 1696, 1888)
    north_fork = region("north-fork-v2", CENTRAL_V2 / "north-fork-authored-master-v2.png", 1600, 1088)

    contexts = {
        "port-sapphire": [mill_port, north_fork, port, channel, coral],
        "greenhollow": [whisper, green, approach, green_mill],
        "sunken-ruin": [approach, sunken],
        "millbrook": [green_mill, mill, mill_port, outer],
        "coral-reef": [outer, channel, coral],
    }
    context_entries = {}
    context_images = {}
    for name, regions in contexts.items():
        first = context_image(regions)
        second = context_image(regions)
        if png_bytes(first) != png_bytes(second):
            raise AssertionError(f"non-deterministic context: {name}")
        native_context = EVIDENCE / f"{name}-route-hidden-native-context.png"
        map_context = EVIDENCE / f"{name}-route-hidden-map-scale-context.png"
        native_context.write_bytes(png_bytes(first))
        map_width = max(1, round(first.width * MAP_REGION_SIZE / LATTICE_SIZE))
        map_height = max(1, round(first.height * MAP_REGION_SIZE / LATTICE_SIZE))
        mapped = first.resize((map_width, map_height), Image.Resampling.LANCZOS)
        map_context.write_bytes(png_bytes(mapped))
        context_images[name] = mapped
        context_entries[name] = {
            "native": {"path": native_context.relative_to(ROOT).as_posix(), "sha256": sha256(native_context), "dimensions": list(first.size)},
            "mapScale": {"path": map_context.relative_to(ROOT).as_posix(), "sha256": sha256(map_context), "dimensions": list(mapped.size)},
        }

    panel_width = 640
    header = 34
    rows = []
    font = ImageFont.load_default()
    for name, image in context_images.items():
        height = round(image.height * panel_width / image.width)
        panel = Image.new("RGB", (panel_width, height + header), (7, 10, 9))
        panel.paste(image.resize((panel_width, height), Image.Resampling.LANCZOS), (0, header))
        ImageDraw.Draw(panel).text((10, 12), name, fill=(235, 239, 229), font=font)
        rows.append(panel)
    review_sheet = Image.new("RGB", (panel_width, sum(row.height for row in rows)), (7, 10, 9))
    y = 0
    for row in rows:
        review_sheet.paste(row, (0, y)); y += row.height
    review_path = EVIDENCE / "landmark-art-v2-owner-review-contact-sheet.png"
    review_path.write_bytes(png_bytes(review_sheet))

    pairs = [
        (port, mill_port), (port, north_fork), (port, channel),
        (green, whisper), (green, approach), (green, green_mill),
        (sunken, approach),
        (mill, mill_port), (mill, green_mill), (mill, outer),
        (outer, coral), (coral, channel),
    ]
    overlaps = [overlap_stats(a, b) for a, b in pairs]

    old_outer = region("millbrook-outer-west-v1", DEEP_V1 / "millbrook-outer-west-authored-master-v1.png", 1152, 1952)
    before = overlap_stats(mill, old_outer)
    after = next(item for item in overlaps if item["pair"] == ["millbrook-west-v2", "millbrook-outer-west-v2"])
    if after["meanAbsRgb"] >= before["meanAbsRgb"]:
        raise AssertionError("derived outer-west companion did not improve the exact Millbrook overlap")

    macro = {}
    for key in target_order:
        source, target, _, composition_path = TARGETS[key]
        image = load_rgb(target, (MASTER_SIZE, MASTER_SIZE))
        composition = load_rgb(composition_path)
        macro[key] = {
            "compositionMacro24Correlation": pearson(image, composition, 24),
            "sourceCopySha256": sha256(source),
            "promotedSha256": sha256(target),
            "exactBytes": source.read_bytes() == target.read_bytes(),
        }
        if macro[key]["compositionMacro24Correlation"] < 0.45:
            raise AssertionError(f"macro correlation below 0.45: {key}")
        if not macro[key]["exactBytes"]:
            raise AssertionError(f"promoted master is not exact: {key}")

    return {
        "schemaVersion": 1,
        "status": "owner-review; design-only art inputs; runtime behavior unchanged",
        "outerWestCompanion": outer_metrics,
        "targetMacroAndIdentity": macro,
        "contexts": context_entries,
        "reviewContactSheet": {
            "path": review_path.relative_to(ROOT).as_posix(),
            "sha256": sha256(review_path),
            "dimensions": list(review_sheet.size),
        },
        "fiveUp": {
            "native": {"path": native_path.relative_to(ROOT).as_posix(), "sha256": sha256(native_path), "dimensions": list(native.size)},
            "mapScale": {"path": map_path.relative_to(ROOT).as_posix(), "sha256": sha256(map_path), "dimensions": list(map_sheet.size)},
        },
        "overlaps": overlaps,
        "millbrookSouthBefore": before,
        "millbrookSouthAfter": after,
    }


def write_inventory(evidence: dict[str, object], preserved: dict[str, str]) -> None:
    new_roots = [PORT_V2, WESTERN_V2, CENTRAL_V2, DEEP_V2, REVIEW]
    paths = sorted(
        path
        for root in new_roots
        for path in root.rglob("*")
        if path.is_file() and path.name != "landmark-art-v2-inventory.json"
    )
    entries = [[path.relative_to(ROOT).as_posix(), sha256(path)] for path in paths]
    canonical = json.dumps(entries, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    payload = {
        "schemaVersion": 1,
        "purpose": "Relay 17 design-only versioned landmark art input and evidence inventory.",
        "count": len(entries),
        "canonicalAggregate": hashlib.sha256(canonical).hexdigest(),
        "entries": entries,
        "preservedInputCount": len(preserved),
        "preservedInputAggregate": hashlib.sha256(
            json.dumps(sorted(preserved.items()), ensure_ascii=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest(),
        "manifest": {"path": RUNTIME.joinpath("manifest.json").relative_to(ROOT).as_posix(), "sha256": MANIFEST_SHA256},
        "evidenceSummary": evidence,
    }
    inventory = REVIEW / "landmark-art-v2-inventory.json"
    inventory.parent.mkdir(parents=True, exist_ok=True)
    inventory.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    verify_locked_sources()
    before = snapshot(PRESERVED_ROOTS)
    prepare_inputs()
    outer_metrics = derive_outer_west_companion()
    build_group_batches()
    build_port_batch()
    evidence = build_evidence(outer_metrics)
    after = snapshot(PRESERVED_ROOTS)
    if before != after:
        changed = sorted(set(before) | set(after))
        changed = [path for path in changed if before.get(path) != after.get(path)]
        raise AssertionError(f"accepted/non-target art changed: {changed}")
    write_inventory(evidence, before)
    print(
        "ACT 1 LANDMARK ART INPUTS V2 BUILT: Port, western, central, deep batches; "
        "Coral v2 and runtime behavior preserved"
    )


if __name__ == "__main__":
    main()
