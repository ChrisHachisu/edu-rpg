#!/usr/bin/env python3
"""Build the immutable visual reference used to author Act 1 walkable geometry.

This deliberately composes every accepted detail-region base without route
affinity. Collision is authored from the complete painted ground, while route
affinity remains a streaming concern.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = (
    ROOT
    / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2"
)
MANIFEST = RUNTIME / "manifest.json"
OUTPUT_DIR = RUNTIME / "walkable-regions-v1/evidence"
OUTPUT_IMAGE = OUTPUT_DIR / "collision-reference-affinity-neutral.png"
OUTPUT_INVENTORY = OUTPUT_DIR / "collision-reference-inventory.json"

LOCKED_MANIFEST_REVISION = 10
LOCKED_MANIFEST_SHA256 = (
    "a36eebf18c651ee7749f2bcff7006e0ce5173b34dc2d3010767f0adbde0cef16"
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require_hash(path: Path, expected: str, label: str) -> str:
    actual = sha256(path)
    if actual != expected:
        raise SystemExit(
            f"{label} byte identity changed: expected {expected}, got {actual}"
        )
    return actual


def main() -> None:
    require_hash(MANIFEST, LOCKED_MANIFEST_SHA256, "manifest revision 10")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("revision") != LOCKED_MANIFEST_REVISION:
        raise SystemExit(
            f"expected manifest revision {LOCKED_MANIFEST_REVISION}, "
            f"got {manifest.get('revision')}"
        )

    source_info = manifest["source"]
    source_path = (RUNTIME / source_info["path"]).resolve()
    source_hash = require_hash(source_path, source_info["sha256"], "world source")
    with Image.open(source_path) as source_image:
        source = source_image.convert("RGBA")
    expected_size = (source_info["width"], source_info["height"])
    if source.size != expected_size:
        raise SystemExit(
            f"world source dimensions changed: expected {expected_size}, got {source.size}"
        )

    composite = source.copy()
    inputs: list[dict[str, object]] = [
        {
            "kind": "world-source",
            "path": str(source_path.relative_to(ROOT)),
            "sha256": source_hash,
            "width": source.width,
            "height": source.height,
        }
    ]

    detail_regions = manifest.get("detailRegions", [])
    if len(detail_regions) != 17:
        raise SystemExit(f"expected 17 detail regions, got {len(detail_regions)}")

    for order, region in enumerate(detail_regions):
        asset_path = (RUNTIME / region["base"]).resolve()
        asset_hash = require_hash(
            asset_path,
            region["baseSha256"],
            f"detail base {region['id']}",
        )
        with Image.open(asset_path) as asset_image:
            asset = asset_image.convert("RGBA")
        expected_source_size = (
            round(region["width"] * region["pixelScale"]),
            round(region["height"] * region["pixelScale"]),
        )
        if asset.size != expected_source_size:
            raise SystemExit(
                f"{region['id']} dimensions changed: expected "
                f"{expected_source_size}, got {asset.size}"
            )

        runtime_size = (region["width"], region["height"])
        runtime_asset = asset.resize(runtime_size, Image.Resampling.NEAREST)
        x, y = region["x"], region["y"]
        composite.alpha_composite(runtime_asset, (x, y))
        inputs.append(
            {
                "kind": "detail-base",
                "order": order,
                "id": region["id"],
                "path": str(asset_path.relative_to(ROOT)),
                "sha256": asset_hash,
                "sourceWidth": asset.width,
                "sourceHeight": asset.height,
                "runtimeBounds": [x, y, region["width"], region["height"]],
                "resampling": "nearest",
            }
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    composite.save(OUTPUT_IMAGE, format="PNG", compress_level=9, optimize=False)
    output_hash = sha256(OUTPUT_IMAGE)
    inventory = {
        "schema": "act1-walkable-collision-reference-inventory-v1",
        "purpose": "affinity-neutral ground reference for manual collision tracing",
        "manifestRevision": manifest["revision"],
        "manifestSha256": LOCKED_MANIFEST_SHA256,
        "composition": {
            "detailOrder": "manifest-order",
            "detailVariant": "base-only",
            "routeAffinity": "ignored-for-collision-authoring",
            "waterAndOcclusionLayers": "excluded-non-ground-layers",
        },
        "inputs": inputs,
        "output": {
            "path": str(OUTPUT_IMAGE.relative_to(ROOT)),
            "sha256": output_hash,
            "width": composite.width,
            "height": composite.height,
        },
    }
    OUTPUT_INVENTORY.write_text(
        json.dumps(inventory, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {OUTPUT_IMAGE.relative_to(ROOT)}")
    print(f"sha256 {output_hash}")
    print(f"verified {len(inputs) - 1} accepted detail bases")


if __name__ == "__main__":
    main()
