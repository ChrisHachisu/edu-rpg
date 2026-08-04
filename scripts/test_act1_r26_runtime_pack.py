#!/usr/bin/env python3
"""Mechanical closure checks for the promoted R26 Act 1 runtime pack."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/act1-final-art-geometry-r26"
RUNTIME = PACK / "runtime"
AUTHORITY = PACK / "polygon-authority.json"
# 2026-08-03: the r26 chunk art was re-baked at 48 px/tile from the MATERIAL renderer (the
# owner's painted terrain), replacing the 16 px/tile chunks derived from candidate-art.png (the
# painterly plate the owner rejected 29 Jul). manifest["source"] now names the renderer script
# and its mask input rather than a flat baked art file with a sha256 -- this test verifies THAT
# provenance and no longer reads candidate-art.png. See scripts/runtime_baseline.py's
# ACT1_HIFI_MANIFEST_SHA256 comment block for the full re-bake writeup. Base/canopy layers are
# baked at 3x the streaming-chunk grid resolution ("three times the linear resolution" per that
# same comment); water stays at 1x, matching the retained 16px-bake water layer.
MASK = ROOT / "design/continent-terrain-class-method/owner-terrain/art-tiles/act1-smoothed-semantic.png"
BASE_ART_SCALE = 3


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    manifest = json.loads((RUNTIME / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["revision"] == 11
    assert manifest["status"] == "act1-r26-runtime-integrated"
    assert manifest["source"]["renderer"] == "scripts/render_material_map.py"
    assert manifest["source"]["mask"] == "design/continent-terrain-class-method/owner-terrain/art-tiles/act1-smoothed-semantic.png"
    assert manifest["source"]["pxPerTile"] == 48
    assert MASK.is_file()
    with Image.open(MASK) as mask_image:
        assert mask_image.size == (2368, 2912)
    assert manifest["detailRegions"] == []
    assert manifest["streaming"]["maxLoadedChunks"] == 6
    assert manifest["streaming"]["maxLoadedDetailRegions"] == 0
    assert manifest["designLocks"]["collisionAuthoritySha256"] == sha256(AUTHORITY)
    assert (RUNTIME / "walkable-regions-r26.json").read_bytes() == AUTHORITY.read_bytes()
    assert len(manifest["chunks"]) == 30 and manifest["chunkSize"] == 512

    covered = Image.new("1", (2368, 2912), 0)
    for chunk in manifest["chunks"]:
        for key, hash_key in (
            ("base", "baseSha256"),
            ("water", "waterSha256"),
            ("canopy", "canopySha256"),
        ):
            layer = RUNTIME / chunk[key]
            assert layer.is_file() and sha256(layer) == chunk[hash_key]
        base = Image.open(RUNTIME / chunk["base"]).convert("RGB")
        water = Image.open(RUNTIME / chunk["water"])
        canopy = Image.open(RUNTIME / chunk["canopy"])
        assert base.size == (chunk["width"] * BASE_ART_SCALE, chunk["height"] * BASE_ART_SCALE)
        assert canopy.size == base.size
        assert water.size == (chunk["width"], chunk["height"])
        covered.paste(1, (
            chunk["x"], chunk["y"],
            chunk["x"] + chunk["width"], chunk["y"] + chunk["height"],
        ))
    assert covered.getbbox() == (0, 0, 2368, 2912)
    print("ACT 1 R26 RUNTIME PACK PASS: exact chunk hashes/geometry, 30 chunks, zero stale detail regions")


if __name__ == "__main__":
    main()
