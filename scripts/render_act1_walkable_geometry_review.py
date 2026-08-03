#!/usr/bin/env python3
"""Render deterministic native-resolution evidence for Act 1 walkable regions."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2"
GEOMETRY = RUNTIME / "walkable-regions-v1.json"
EVIDENCE = RUNTIME / "walkable-regions-v1/evidence"
MASK = EVIDENCE / "walkable-regions-mask.png"
OVERLAY = EVIDENCE / "walkable-regions-overlay.png"
INVENTORY = EVIDENCE / "walkable-regions-review-inventory.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def points(vertices: list[dict[str, float]]) -> list[tuple[float, float]]:
    return [(vertex["x"], vertex["y"]) for vertex in vertices]


def require_hash(path: Path, expected: str, label: str) -> None:
    actual = sha256(path)
    if actual != expected:
        raise SystemExit(f"{label} changed: expected {expected}, got {actual}")


def main() -> None:
    geometry = json.loads(GEOMETRY.read_text(encoding="utf-8"))
    source = geometry["source"]
    width, height = source["width"], source["height"]
    reference_info = geometry["provenance"]["collisionReference"]
    reference = RUNTIME / reference_info["path"]
    require_hash(reference, reference_info["sha256"], "collision reference")
    require_hash(
        RUNTIME / geometry["provenance"]["collisionReferenceInventory"]["path"],
        geometry["provenance"]["collisionReferenceInventory"]["sha256"],
        "collision reference inventory",
    )

    union = Image.new("L", (width, height), 0)
    for region in geometry["regions"]:
        region_mask = Image.new("L", (width, height), 0)
        draw = ImageDraw.Draw(region_mask)
        draw.polygon(points(region["outer"]), fill=255)
        for hole in region.get("holes", []):
            draw.polygon(points(hole), fill=0)
        union = ImageChops.lighter(union, region_mask)

    obstacle_mask = Image.new("L", (width, height), 0)
    obstacle_draw = ImageDraw.Draw(obstacle_mask)
    for obstacle in geometry.get("staticObstacles", []):
        obstacle_draw.polygon(points(obstacle["polygon"]), fill=255)
    union = ImageChops.subtract(union, obstacle_mask)

    with Image.open(reference) as source_image:
        base = source_image.convert("RGBA")
    tint = Image.new("RGBA", base.size, (39, 238, 128, 0))
    tint.putalpha(union.point(lambda value: 74 if value else 0))
    composed = Image.alpha_composite(base, tint)
    draw = ImageDraw.Draw(composed, "RGBA")

    role_colors = {
        "open": (104, 255, 183, 235),
        "open-threshold": (102, 223, 255, 235),
        "open-junction": (102, 223, 255, 235),
        "mixed-open-trail": (229, 235, 111, 235),
        "trail": (255, 199, 92, 235),
        "coastal-trail": (92, 225, 255, 235),
        "mountain-pass": (184, 200, 255, 235),
        "bridge": (255, 115, 230, 255),
        "gated-threshold": (255, 159, 67, 255),
    }
    for region in geometry["regions"]:
        color = role_colors.get(region["role"], (255, 255, 255, 235))
        outer = points(region["outer"])
        draw.line(outer + [outer[0]], fill=color, width=4, joint="curve")
        for hole in region.get("holes", []):
            ring = points(hole)
            draw.line(ring + [ring[0]], fill=(255, 72, 72, 255), width=4, joint="curve")

    for obstacle in geometry.get("staticObstacles", []):
        ring = points(obstacle["polygon"])
        draw.polygon(ring, fill=(255, 50, 62, 62))
        draw.line(ring + [ring[0]], fill=(255, 72, 72, 190), width=3, joint="curve")
    for blocker in geometry.get("dynamicBlockers", []):
        from_point, to_point = blocker["from"], blocker["to"]
        draw.line(
            [(from_point["x"], from_point["y"]), (to_point["x"], to_point["y"])],
            fill=(255, 116, 31, 255),
            width=10,
        )

    def marker(raw: list[float], color: tuple[int, int, int, int], radius: int) -> None:
        x, y = raw
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)

    for probe in geometry["probes"]["walkable"]:
        marker(probe["point"], (75, 255, 165, 255), 5)
    for probe in geometry["probes"]["blocked"]:
        marker(probe["point"], (255, 55, 75, 255), 5)
    for probe in geometry["probes"]["boundary"]:
        marker(probe["inside"], (70, 210, 255, 255), 4)
        marker(probe["outside"], (255, 70, 160, 255), 4)
    for probe in geometry["probes"]["bridges"]:
        for key in ("entryA", "center", "entryB"):
            marker(probe[key], (255, 115, 230, 255), 4)

    EVIDENCE.mkdir(parents=True, exist_ok=True)
    union.save(MASK, format="PNG", compress_level=9, optimize=False)
    composed.save(OVERLAY, format="PNG", compress_level=9, optimize=False)
    inventory = {
        "schema": "act1-walkable-regions-review-inventory-v1",
        "geometry": {
            "path": str(GEOMETRY.relative_to(ROOT)),
            "sha256": sha256(GEOMETRY),
        },
        "collisionReference": {
            "path": str(reference.relative_to(ROOT)),
            "sha256": sha256(reference),
        },
        "outputs": [
            {
                "path": str(MASK.relative_to(ROOT)),
                "sha256": sha256(MASK),
                "width": width,
                "height": height,
                "meaning": "walkable union minus global static obstacles, before actor-foot clearance and dynamic blockers",
            },
            {
                "path": str(OVERLAY.relative_to(ROOT)),
                "sha256": sha256(OVERLAY),
                "width": width,
                "height": height,
                "meaning": "native visual boundary and probe review",
            },
        ],
    }
    INVENTORY.write_text(
        json.dumps(inventory, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {MASK.relative_to(ROOT)} {sha256(MASK)}")
    print(f"wrote {OVERLAY.relative_to(ROOT)} {sha256(OVERLAY)}")
    print(f"wrote {INVENTORY.relative_to(ROOT)} {sha256(INVENTORY)}")


if __name__ == "__main__":
    main()
