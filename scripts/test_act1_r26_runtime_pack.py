#!/usr/bin/env python3
"""Mechanical closure checks for the promoted R26 Act 1 runtime pack."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/act1-final-art-geometry-r26"
RUNTIME = PACK / "runtime"
ART = PACK / "candidate-art.png"
AUTHORITY = PACK / "polygon-authority.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    manifest = json.loads((RUNTIME / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["revision"] == 11
    assert manifest["status"] == "act1-r26-runtime-integrated"
    assert manifest["source"]["sha256"] == sha256(ART)
    assert manifest["source"]["width"] == 2368 and manifest["source"]["height"] == 2912
    assert manifest["detailRegions"] == []
    assert manifest["streaming"]["maxLoadedChunks"] == 6
    assert manifest["streaming"]["maxLoadedDetailRegions"] == 0
    assert manifest["designLocks"]["collisionAuthoritySha256"] == sha256(AUTHORITY)
    assert (RUNTIME / "walkable-regions-r26.json").read_bytes() == AUTHORITY.read_bytes()
    assert len(manifest["chunks"]) == 30 and manifest["chunkSize"] == 512

    reconstructed = Image.new("RGB", (2368, 2912))
    covered = Image.new("1", reconstructed.size, 0)
    for chunk in manifest["chunks"]:
        for key, hash_key in (
            ("base", "baseSha256"),
            ("water", "waterSha256"),
            ("occlusion", "occlusionSha256"),
        ):
            layer = RUNTIME / chunk[key]
            assert layer.is_file() and sha256(layer) == chunk[hash_key]
        base = Image.open(RUNTIME / chunk["base"]).convert("RGB")
        assert base.size == (chunk["width"], chunk["height"])
        reconstructed.paste(base, (chunk["x"], chunk["y"]))
        covered.paste(1, (
            chunk["x"], chunk["y"],
            chunk["x"] + chunk["width"], chunk["y"] + chunk["height"],
        ))
    assert covered.getbbox() == (0, 0, 2368, 2912)
    assert ImageChops.difference(reconstructed, Image.open(ART).convert("RGB")).getbbox() is None
    print("ACT 1 R26 RUNTIME PACK PASS: exact art/geometry, 30 chunks, zero stale detail regions")


if __name__ == "__main__":
    main()
