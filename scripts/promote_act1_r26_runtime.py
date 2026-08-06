#!/usr/bin/env python3
"""Promote the owner-approved R26 Act 1 art/geometry into runtime-v2.

SUPERSEDED 2026-08-03 -- DO NOT RUN.

This regenerates the 16 px/tile chunks from `candidate-art.png`, the dark painterly plate the
owner rejected on 29 Jul. The chunk art is now baked by `scripts/bake_act1_chunks.py` at 48 px/tile
from the MATERIAL renderer, i.e. from the owner's painted terrain, and the `occlusion` layer this
script derives no longer exists -- it was replaced by an alpha-only `canopy` mask. Running this
would overwrite the promoted bake with the scrapped art and reintroduce a layer the runtime and
the gate have both moved off.

Kept for provenance: `fx_layers` below is the only written record of how the retired water and
occlusion layers were derived. If the R26 geometry ever needs regenerating, take the geometry
path and leave the chunk art to the bake script.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2"
PACK = RUNTIME / "act1-final-art-geometry-r26"
OUTPUT = PACK / "runtime"
ART = PACK / "candidate-art.png"
AUTHORITY = PACK / "polygon-authority.json"
EXPECTED_ART_SHA256 = "d5998e758b8e1090a0f2bb18cde0197b4cf756161b2c8db84ebe2a6d7aca23cd"
EXPECTED_AUTHORITY_SHA256 = "4010715a99926260a9d4e842cc97e0e6e04df93bffbc69b4ccf4ef4baf086834"
CHUNK = 512


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fx_layers(crop: Image.Image, offset_x: int, offset_y: int) -> tuple[Image.Image, Image.Image]:
    source = crop.convert("RGB")
    water = Image.new("RGBA", source.size, (0, 0, 0, 0))
    occlusion = Image.new("RGBA", source.size, (0, 0, 0, 0))
    src, wat, occ = source.load(), water.load(), occlusion.load()
    for y in range(source.height):
        gy = offset_y + y
        for x in range(source.width):
            gx = offset_x + x
            r, g, b = src[x, y]
            luminance = (r * 299 + g * 587 + b * 114) // 1000
            is_water = b > 48 and b > r * 1.32 and b > g * 1.04
            if is_water and any(
                (((gx - back) * 73856093) ^ (gy * 19349663)) & 4095 < 2
                for back in range(6)
            ):
                wat[x, y] = (118, 207, 255, 82 if luminance < 90 else 118)
            if g > r * 1.06 and g > b * 0.78 and luminance < 94:
                occ[x, y] = (r, g, b, 242)
    return water, occlusion


OVERRIDE_ENV = "ALLOW_SUPERSEDED_PROMOTE"
OVERRIDE_VALUE = "i-understand-this-overwrites-owner-approved-art"


def main() -> None:
    # The DO-NOT-RUN in the docstring above was advisory for three days and was very nearly run
    # twice on 2026-08-06 -- once against a worktree missing its input, which is the only reason
    # nothing was lost. Making it enforceable rather than advisory.
    if os.environ.get(OVERRIDE_ENV) != OVERRIDE_VALUE:
        raise SystemExit(
            "REFUSED: promote_act1_r26_runtime.py is SUPERSEDED (2026-08-03). Running it would:\n"
            "  - overwrite the owner-approved 48 px bake with 16 px art rejected on 29 Jul\n"
            "  - resurrect the retired `occlusion` layer (replaced by an alpha-only `canopy`)\n"
            "  - overwrite the tracked, hash-pinned r26 manifest.json\n"
            "  - overwrite walkable-regions-r26.json, the COLLISION AUTHORITY\n"
            "Chunk art is baked by scripts/bake_act1_chunks.py from the material renderer.\n"
            f"If you truly need the geometry path, set {OVERRIDE_ENV}={OVERRIDE_VALUE}"
        )

    if sha256(ART) != EXPECTED_ART_SHA256:
        raise RuntimeError("owner-approved R26 art identity changed")
    if sha256(AUTHORITY) != EXPECTED_AUTHORITY_SHA256:
        raise RuntimeError("owner-approved R26 polygon authority identity changed")

    image = Image.open(ART).convert("RGB")
    if image.size != (2368, 2912):
        raise RuntimeError(f"R26 world dimensions changed: {image.size}")
    geometry = json.loads(AUTHORITY.read_text(encoding="utf-8"))
    if geometry.get("actorFootRadius") != 4 or geometry.get("maxSubstep") != 2:
        raise RuntimeError("R26 actor-foot or substep contract changed")

    chunks_root = OUTPUT / "chunks"
    if chunks_root.exists():
        shutil.rmtree(chunks_root)
    for layer in ("base", "water", "occlusion"):
        (chunks_root / layer).mkdir(parents=True, exist_ok=True)

    chunks: list[dict[str, object]] = []
    for top in range(0, image.height, CHUNK):
        for left in range(0, image.width, CHUNK):
            right, bottom = min(left + CHUNK, image.width), min(top + CHUNK, image.height)
            crop = image.crop((left, top, right, bottom))
            chunk_id = f"c{left // CHUNK}-r{top // CHUNK}"
            paths = {
                "base": f"chunks/base/{chunk_id}.png",
                "water": f"chunks/water/{chunk_id}.png",
                "occlusion": f"chunks/occlusion/{chunk_id}.png",
            }
            crop.save(OUTPUT / paths["base"], optimize=True)
            water, occlusion = fx_layers(crop, left, top)
            water.save(OUTPUT / paths["water"], optimize=True)
            occlusion.save(OUTPUT / paths["occlusion"], optimize=True)
            chunks.append({
                "id": chunk_id,
                "x": left,
                "y": top,
                "width": right - left,
                "height": bottom - top,
                **paths,
                "baseSha256": sha256(OUTPUT / paths["base"]),
                "waterSha256": sha256(OUTPUT / paths["water"]),
                "occlusionSha256": sha256(OUTPUT / paths["occlusion"]),
            })

    manifest = json.loads((RUNTIME / "manifest.json").read_text(encoding="utf-8"))
    manifest.update({
        "revision": 11,
        "status": "act1-r26-runtime-integrated",
        "source": {
            "path": "../candidate-art.png",
            "sha256": EXPECTED_ART_SHA256,
            "width": image.width,
            "height": image.height,
        },
        "detailRegions": [],
        "chunks": chunks,
    })
    manifest["designLocks"].update({
        "approvedOn": "2026-07-19",
        "worldSourcePixelsPerWorldPixel": 1,
        "collisionOwner": "r26-polygon-authority",
        "collisionAuthoritySha256": EXPECTED_AUTHORITY_SHA256,
    })
    manifest["streaming"]["maxLoadedDetailRegions"] = 0
    manifest["pathConstraints"]["actorFootRadius"] = geometry["actorFootRadius"]
    manifest["pathConstraints"]["maxSubstep"] = geometry["maxSubstep"]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUTPUT / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, separators=(",", ": ")) + "\n")
    shutil.copyfile(AUTHORITY, OUTPUT / "walkable-regions-r26.json")

    print(json.dumps({
        "manifestRevision": 11,
        "chunks": len(chunks),
        "detailRegions": 0,
        "artSha256": EXPECTED_ART_SHA256,
        "geometrySha256": sha256(OUTPUT / "walkable-regions-r26.json"),
        "manifestSha256": sha256(manifest_path),
    }, indent=2))


if __name__ == "__main__":
    main()
