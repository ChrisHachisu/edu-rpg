#!/usr/bin/env python3
"""Promote the locked Coral Reef v2 art through the accepted 57/32 pipeline."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2"
V1 = RUNTIME / "coastal-reef-912-v1"
REVIEW = RUNTIME / "coastal-reef-entrance-v2-review"
BATCH = RUNTIME / "coastal-reef-912-v2"
EVIDENCE = RUNTIME / "coastal-reef-912-r13/evidence"
V1_INVENTORY = (
    RUNTIME
    / "coastal-reef-912-r08/evidence/coastal-reef-912-batch-inventory-v1.json"
)
LOCKED_MASTER = REVIEW / "coastal-reef-authored-master-v2-locked.png"
LOCKED_MASTER_SHA256 = "d700133209e0117fbacf644876f33a5bb64c695877c7dd2d47707ab24e1f8dea"

INPUTS = {
    V1 / "coastal-channel-authored-master-v1.png": (
        "097c4608982e7aab545f291c0a1cdba6ac033da628d4ab4033a86cada286eebf",
        BATCH / "coastal-channel-authored-master-v2.png",
    ),
    LOCKED_MASTER: (
        LOCKED_MASTER_SHA256,
        BATCH / "coastal-reef-authored-master-v2.png",
    ),
    V1 / "composition-refs/coastal-channel-composition-512.png": (
        "481009206d7067d1d59857f0490a3eb46b64d655c0889d42a45178a7b50e74e5",
        BATCH / "composition-refs/coastal-channel-composition-512.png",
    ),
    V1 / "composition-refs/coastal-reef-composition-512.png": (
        "c4f51d1afc14857364eb33468a42db15c365c7e953ab6c07a3b0ca9ecf15d9db",
        BATCH / "composition-refs/coastal-reef-composition-512.png",
    ),
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_v1() -> dict[str, object]:
    inventory = json.loads(V1_INVENTORY.read_text(encoding="utf-8"))
    if len(inventory["entries"]) != 22:
        raise AssertionError("accepted Coastal Reef v1 inventory must contain 22 files")
    for relative, expected in inventory["entries"]:
        actual = sha256(ROOT / relative)
        if actual != expected:
            raise AssertionError(f"accepted v1 byte changed: {relative}")
    return inventory


def prepare_inputs() -> None:
    for source, (expected, target) in INPUTS.items():
        actual = sha256(source)
        if actual != expected:
            raise AssertionError(f"locked input changed: {source} {actual} != {expected}")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())


def load_pipeline():
    path = ROOT / "scripts/build_act1_coastal_reef_lattices.py"
    spec = importlib.util.spec_from_file_location("coastal_reef_v1_pipeline", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load accepted Coastal Reef pipeline: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def output_paths(slug: str) -> dict[str, Path]:
    return {
        "base": BATCH / f"{slug}-lattice-912-v2.png",
        "water": BATCH / f"{slug}-lattice-912-water-v2.png",
        "occlusion": BATCH / f"{slug}-lattice-912-occlusion-v2.png",
        "baseRuntime": BATCH / f"{slug}-lattice-912-runtime-v2.png",
        "waterRuntime": BATCH / f"{slug}-lattice-912-water-runtime-v2.png",
        "occlusionRuntime": BATCH / f"{slug}-lattice-912-occlusion-runtime-v2.png",
    }


def configure_pipeline(pipeline) -> None:
    pipeline.BATCH = BATCH
    pipeline.REGIONS = [
        {
            "id": "coastal-channel-912-v2",
            "slug": "coastal-channel",
            "x": 1696,
            "y": 1888,
            "master": BATCH / "coastal-channel-authored-master-v2.png",
            "composition": BATCH / "composition-refs/coastal-channel-composition-512.png",
            "blendAxis": None,
        },
        {
            "id": "coastal-reef-912-v2",
            "slug": "coastal-reef",
            "x": 1568,
            "y": 2144,
            "master": BATCH / "coastal-reef-authored-master-v2.png",
            "composition": BATCH / "composition-refs/coastal-reef-composition-512.png",
            "blendAxis": "y+",
        },
    ]
    pipeline.METRICS = BATCH / "coastal-reef-lattice-metrics-v2.json"
    pipeline.CONTACT_SHEET = BATCH / "coastal-reef-lattice-contact-sheet-v2.png"
    pipeline.SHARED_COMPOSITE = BATCH / "coastal-reef-shared-composite-912-v2.png"
    pipeline.output_paths = output_paths


def write_inventory(v1_inventory: dict[str, object]) -> None:
    paths = [target for _, target in INPUTS.values()]
    paths.extend(
        path
        for slug in ("coastal-channel", "coastal-reef")
        for path in output_paths(slug).values()
    )
    paths.extend(
        [
            BATCH / "coastal-reef-lattice-contact-sheet-v2.png",
            BATCH / "coastal-reef-lattice-metrics-v2.json",
            BATCH / "coastal-reef-shared-composite-912-v2.png",
        ]
    )
    entries = sorted(
        [[path.relative_to(ROOT).as_posix(), sha256(path)] for path in paths],
        key=lambda item: item[0],
    )
    canonical = json.dumps(
        entries, ensure_ascii=True, separators=(",", ":")
    ).encode("utf-8")
    inventory = {
        "schemaVersion": 1,
        "purpose": "Accepted Coral Reef 912 v2 artifact inventory after deterministic render.",
        "canonicalAggregateAlgorithm": (
            "SHA-256 of UTF-8 JSON for the entries array only, with ensure_ascii=true "
            "and separators=(comma,colon); entries are [repo-relative POSIX path, "
            "lowercase file SHA-256] pairs sorted by path."
        ),
        "count": len(entries),
        "canonicalAggregate": hashlib.sha256(canonical).hexdigest(),
        "lockedMaster": {
            "path": LOCKED_MASTER.relative_to(ROOT).as_posix(),
            "sha256": LOCKED_MASTER_SHA256,
        },
        "acceptedV1": {
            "inventoryPath": V1_INVENTORY.relative_to(ROOT).as_posix(),
            "inventorySha256": sha256(V1_INVENTORY),
            "count": len(v1_inventory["entries"]),
            "canonicalAggregate": v1_inventory["canonicalAggregate"],
        },
        "entries": entries,
    }
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "coastal-reef-912-batch-inventory-v2.json").write_text(
        json.dumps(inventory, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    v1_inventory = verify_v1()
    prepare_inputs()
    pipeline = load_pipeline()
    configure_pipeline(pipeline)
    pipeline.main()
    write_inventory(v1_inventory)
    verify_v1()
    print(
        "ACT 1 COASTAL-REEF V2 PROMOTION BUILT: 19 accepted artifacts; "
        "v1 22/22 preserved"
    )


if __name__ == "__main__":
    main()
