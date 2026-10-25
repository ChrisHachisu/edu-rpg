from __future__ import annotations

import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import runtime_baseline as baseline
import terrain_current_profile as forward


def _write_bytes(root: Path, relative: str, content: bytes) -> dict:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return {"path": relative, "bytes": len(content),
            "sha256": hashlib.sha256(content).hexdigest()}


def _write_json(root: Path, relative: str, value) -> dict:
    return _write_bytes(root, relative, json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


def _valid_descriptor_fixture(root: Path, *, collision_format="qok-forest-bitset-v1"):
    """Build the smallest full descriptor that reaches the successful return path."""
    profile = forward.PROFILE_ID
    exits = [{"id": name, "x": x, "y": y} for name, x, y in [
        ("greenhollow",69,256),("millbrook",39,345),("portSapphire",133,348),
        ("sunkenCellar",30,275),("whisperingWoodsCave",101,232),
        ("coastalReef",145,372),("mistyGrotto",96,360),("crystalCave",149,279)]]
    approaches = [{"landmarkId": name, "x": x, "y": y} for name, x, y in [
        ("whisperingWoodsCave",101,232),("greenhollow",69,256),("sunkenCellar",30,275),
        ("crystalCave",149,277),("crystalCave",148,278),("crystalCave",150,278),
        ("crystalCave",149,279),("millbrook",39,345),("portSapphire",133,348),
        ("mistyGrotto",96,360),("coastalReef",145,372)]]
    navigation = {"startCell":{"x":69,"y":256}, "legacyFallback":{"x":130,"y":290},
                  "liveLandmarkExits":exits, "liveValidApproaches":approaches}
    input_records=[]
    root_authority=_write_bytes(root,"review/root-authority.txt",b"independent review record")
    geometry_chunks=[]
    water_sha=hashlib.sha256(b"chunk-water").hexdigest()
    for index in range(120):
        geometry_chunks.append({"id":f"c{index}","x":index,"y":0,"width":1,"height":1,
                                "water":"chunks/water/water.png","waterSha256":water_sha})
    design_locks={"approvedOn":"2026-07-19","worldSourcePixelsPerWorldPixel":1,
        "heroSourcePixelsPerWorldPixel":1.7777777777777777,"cameraWorldWidth":208,"heroNativeFrame":64,
        "heroWorldHeight":36,"heroDirections":8,"heroRuntimeDirections":4,"walkPoseMs":125,
        "movementInput":"continuous-normalized-analog","collisionOwner":"r26-polygon-authority",
        "collisionAuthoritySha256":"4010715a99926260a9d4e842cc97e0e6e04df93bffbc69b4ccf4ef4baf086834"}
    geometry={"revision":12,"chunks":geometry_chunks,"designLocks":design_locks,"semanticBounds":[16,218,163,399],
              "semanticRows":[],"chunkSize":32,"streaming":{},"detailRegions":[],"pathConstraints":[]}
    geometry_record=_write_json(root,"design/test-r26.json",geometry)
    input_records.append(geometry_record)
    generator_record=_write_bytes(root,forward.FORWARD_GENERATOR_SOURCE,b"forward generator source")
    baker_path=Path(__file__).resolve().parents[1]/forward.A1OW_V2_BAKER_PATH
    baker_record=_write_bytes(root,forward.A1OW_V2_BAKER_PATH,baker_path.read_bytes())
    layout_record=_write_json(root,forward.FORWARD_LAYOUT_RECIPE,{"recipe":"accepted whole layout"})
    north_record=_write_json(root,forward.FORWARD_NORTH_RECIPE,{"recipe":"approved north contact"})
    input_records.extend([generator_record,baker_record,layout_record,north_record])
    for rel, data in [("public/act1-world-map.js",b"world-map"),
                      ("public/dq-tiles.js",b"dq-tiles"),
                      ("public/assets/hero/hero-male-walk.png",b"male"),
                      ("public/assets/hero/hero-g3-walk.png",b"female"),
                      ("scripts/checker.py",b"pinned checker")]:
        input_records.append(_write_bytes(root,rel,data))
    validator_source = (
        b'PINNED_DESCRIPTOR_SHA256: str | None = "' + b"a" * 64 + b'"\n'
        b"def validate_semantics():\n    return True\n"
    )
    _write_bytes(root, "scripts/terrain_current_profile.py", validator_source)
    normalized_source = forward.normalize_validator_descriptor_pin(validator_source)
    input_records.append(_write_bytes(root, forward.NORMALIZED_VALIDATOR_SOURCE, normalized_source))
    semantic_record=_write_json(root,"design/terrain-current-profile-20261007/current/act1-hifi-manifest.json",navigation)
    input_records.append(semantic_record)

    output_root=root/forward.GENERATED_OUTPUT_ROOT
    output_root.mkdir()
    output_entries=[]
    def output(rel, data):
        record=_write_bytes(output_root,rel,data); output_entries.append(record); return record
    runtime_chunk_records=[]
    layer_paths={"base":"chunks/base/base.webp","forest":"chunks/forest/forest.webp",
                 "canopy":"chunks/canopy/canopy.webp","water":"chunks/water/water.png"}
    for layer, rel in layer_paths.items():
        runtime_chunk_records.append(output("act1-hifi/"+rel,("chunk-"+layer).encode()))
    alpha_bytes=b"visible-alpha-fixture"
    alpha_record=output("evidence/final-visible-raised-alpha.png",alpha_bytes)
    source_sha=alpha_record["sha256"]
    collision_header=bytearray(64); collision_header[:8]=b"QOKF8COL"
    struct.pack_into("<HHIII",collision_header,8,1,64,4736,5824,32)
    collision_header[24:56]=bytes.fromhex(source_sha)
    collision_bytes=bytes(collision_header)+bytes(3_447_872-64)
    collision_record=output("act1-hifi/forest-collision.bin",collision_bytes)
    a1ow_path=Path(__file__).resolve().parents[1]/"public/act1-overworld-walk.bin"
    a1ow_record=_write_bytes(root,"public/act1-overworld-walk.bin",a1ow_path.read_bytes())
    input_records.append(a1ow_record)
    dq_sha=next(item["sha256"] for item in input_records if item["path"]=="public/dq-tiles.js")
    review_path="proofs/independent-a1ow-review.json"
    review=_write_json(root,review_path,{"schema":"independent-a1ow-v2-integration-review-v1",
        "status":"PASS_A1OW_V2_IDENTITY_AND_BODY",
        "inputs":{"dqTilesSha256":dq_sha,"v2Sha256":a1ow_record["sha256"]},
        "independentDqSourceEquivalence":{"updatedSha256":dq_sha,
            "identicalCollisionRuntimeTail":False,
            "checks":{"collisionRuntimeExactAfterWaterCleanupProjection":True},
            "postAnchorDelta":{"occurrences":2,"normalizedTailByteIdenticalToBaseline":True,
                "normalization":"remove only the two exact water-backing cleanup call strings plus their preceding added spaces from current tail"}}})
    input_records.append(review)
    underpaint=output("act1-hifi/underpaint/ground.png",b"ground")
    forest_underpaint=output("act1-hifi/underpaint/forest.png",b"forest")
    consumed=_write_bytes(root,"public/act1-hifi/overrides/nonterrain.json",b"consumed override")
    input_records.append(consumed)
    runtime_chunks=[]
    for index, old in enumerate(geometry_chunks):
        chunk={key:old[key] for key in ("id","x","y","width","height")}
        chunk["basePixelsPerCell"]=32
        for layer, rel in layer_paths.items():
            chunk[layer]=rel
            chunk[layer+"Sha256"]=next(item["sha256"] for item in runtime_chunk_records if item["path"]=="act1-hifi/"+rel)
        runtime_chunks.append(chunk)
    collision_contract={"path":"act1-hifi/forest-collision.bin","sha256":collision_record["sha256"],
        "sourceArtifact":"evidence/final-visible-raised-alpha.png","sourceSha256":source_sha,
        "sourceAuthority":"final-visible-whole-object-union","runtimeFormat":"qok-forest-bitset-v1",
        "version":1,"dimensionsPx32":[4736,5824],"bounds":[16,218,163,399],"pixelsPerCell":32,
        "alphaThreshold":16,"headerBytes":64,"bitOrder":"little-within-byte","bytes":3_447_872}
    manifest={"revision":12,"status":"act1-painted-overworld-r5-native-layered-cliff-wrapsafe-reviewed",
        "source":{"act1TerrainUnionA1OWReviewPath":review_path,
            "act1TerrainUnionA1OWReviewSha256":review["sha256"],
            "act1TerrainUnionA1OWReviewSchema":"independent-a1ow-v2-integration-review-v1"},
        "forwardTerrainProfile":{"profileId":profile,"status":"generated-static-profile-not-runtime-approved",
            "generatorSha256":generator_record["sha256"],"acceptedLayoutRecipeSha256":layout_record["sha256"],
            "northRecipeSha256":north_record["sha256"],"fullWorldComplete":True,"gateReady":False,
            "nativeVerified":False,
            "collisionAuthority":"final visible forest+cliff object alpha; QOKF8COL forest-collision.bin derived at runtime threshold16",
            "sourceAlphaFringeIgnored":True,"northObjectCount":9,"pilotSeedCount":11,"boundaryPlacementCount":40},
        "collision":{"artifact":"forest-collision.bin","dimensionsPx32":[4736,5824],
            "sha256":collision_record["sha256"],"sourceSha256":source_sha,"format":collision_format,
            "version":1,"bounds":[16,218,163,399],"pixelsPerCell":32,"alphaThreshold":16,"bytes":3_447_872},
        "underpaint":{"src":"underpaint/ground.png","pixelWidth":888,"pixelHeight":1092,"pixelsPerCell":6},
        "forestUnderpaint":{"src":"underpaint/forest.png","width":888,"height":1092,"pixelsPerCell":6},
        **{key:geometry[key] for key in forward.LOCKED_GEOMETRY_FIELDS},"chunks":runtime_chunks,
        "safeCells":[{"x":16+(i%148),"y":218+(i//148)} for i in range(149)],**navigation}
    manifest_record=_write_json(output_root,"act1-hifi/manifest.json",manifest)
    output_entries.append(manifest_record)
    output_sections={"root":forward.GENERATED_OUTPUT_ROOT,"inventory":sorted(output_entries,key=lambda x:x["path"]),
        "runtimeChunks":runtime_chunk_records,"underpaints":[underpaint,forest_underpaint],
        "collision":[collision_record],"visibleAlpha":[alpha_record],"a1ow":[a1ow_record],
        "runtimeManifest":[manifest_record],"consumedNonterrainOverrides":[consumed]}
    output_receipt_data={"profileId":profile,"fullWorldComplete":True,"gateReady":False,
        "a1owReview":{"path":review_path,"sha256":review["sha256"],
            "schema":"independent-a1ow-v2-integration-review-v1"},
        "nativeVerified":False,"generatorSha256":generator_record["sha256"],
        "acceptedLayoutRecipeSha256":layout_record["sha256"],"northRecipeSha256":north_record["sha256"],
        "sourceAlpha":{"path":"evidence/final-visible-raised-alpha.png","sha256":source_sha,
            "thresholdBeforeCollision":128,"collisionThreshold":16,"collisionEqualsAlphaNonzero":True,"collisionXorPixels":0},
        "collisionPack":{"bytes":len(collision_bytes),"sha256":collision_record["sha256"],
            "dimensions":[4736,5824],"pixelsPerCell":32,"bitOrder":"little-within-byte","sourceSha256":source_sha},
        "outputInventory":{item["path"]:{"bytes":item["bytes"],"sha256":item["sha256"]}
            for item in output_entries}}
    output_receipt=_write_json(root,"receipts/output.json",output_receipt_data)
    output_sections["outputReceipt"]={**output_receipt,"selfHash":None}

    nav_bytes=json.dumps(navigation,sort_keys=True,separators=(",",":")).encode()
    input_by_path={item["path"]:item for item in input_records}
    guards={"worldMapSha256":input_by_path["public/act1-world-map.js"]["sha256"],
        "dqTilesSha256":input_by_path["public/dq-tiles.js"]["sha256"],
        "semanticNavigationSha256":hashlib.sha256(nav_bytes).hexdigest(),
        "semanticNavigationFileSha256":semantic_record["sha256"],
        "maleHeroSha256":input_by_path["public/assets/hero/hero-male-walk.png"]["sha256"],
        "femaleHeroSha256":input_by_path["public/assets/hero/hero-g3-walk.png"]["sha256"],
        "extractorVersion":"fixture-v1","finalManifestSha256":manifest_record["sha256"],
        "staleGuardAccepted":False,
        "semanticNavigationScope":"reviewed-runtime-navigation-fields-v1",
        "inputPaths":{"worldMap":"public/act1-world-map.js","dqTiles":"public/dq-tiles.js",
            "semanticNavigation":"design/terrain-current-profile-20261007/current/act1-hifi-manifest.json","maleHero":"public/assets/hero/hero-male-walk.png",
            "femaleHero":"public/assets/hero/hero-g3-walk.png","finalManifest":"act1-hifi/manifest.json"}}
    proofs={}
    hero_sources={"g3":guards["femaleHeroSha256"],"male":guards["maleHeroSha256"]}
    values={"runtimeInvariants":{"viewport":[320,400],"saveVersion":4,"existingSaveResume":True},
        "underpaintPhase":{"scope":"declared-origin-and-scale-phase-v1","manifestSha256":manifest_record["sha256"],
            "activeDqTilesSha256":guards["dqTilesSha256"],"originCell":[16,218],"dimensionsPx6":[888,1092],
            "pixelsPerCell":6,"basePixelsPerCell":32,"semanticBounds":[16,218,163,399],
            "chunksIntersectingSemanticBounds":120,"phaseMismatches":0,
            "semanticCellsCoveredExactlyOnce":True,"sameOwTileWorldGrid":True},
        "collisionDecode":{"independentDecode":True,"heroFramesChecked":"all-selectable-frames-at-safe-cells",
            "heroStencilScope":"safe-cell-QOK-stencil-v1","safeCellCount":149,
            "runtimeFormat":"qok-forest-bitset-v1","collisionSha256":collision_record["sha256"],
            "boundsChecked":True,"bitOrderAndLengthChecked":True},
        "a1owDecode":{"format":"A1OW-v2","artifactSha256":a1ow_record["sha256"],"runtimeParser":"dq-tiles.js::owmBakeParse",
            "version":2,"headerBytes":96,"profileId":forward.A1OW_V2_PROFILE_ID,
            "supportSchema":forward.A1OW_V2_SUPPORT_SCHEMA,"supportFNV32":forward.A1OW_V2_SUPPORT_FNV32,
            "semanticsSha256":forward.A1OW_V2_SEMANTICS_SHA256,
            "supportSha256":forward.A1OW_V2_SUPPORT_SHA256,
            "payloadSha256":forward.A1OW_V2_PAYLOAD_SHA256,"blockCount":forward.A1OW_V2_BLOCKS,
            "waterOnlyInsideAct1":True,"analyticMountainsOutsideAndPadding":True,
            "mountainCollisionReconciled":True,"heroFootClearanceRecomputed":True},
        "visibleAlpha":{"sourceAuthority":"final-visible-whole-object-union","sourceArtifactSha256":source_sha,
            "collisionSha256":collision_record["sha256"],"noHiddenSelectableHeroFrame":True},
        "heroFrameClearance":{"allSelectableHeroes":True,"allFramesAtRuntimeScale":True,
            "scope":"safe-cell-QOK-stencil-v1","heroCount":2,"framesPerHero":12,"runtimeScale":0.7,
            "heroFrameSources":hero_sources,"clearanceRecomputed":True},
        "safeCells":{"recomputedFromCollisionSha256":collision_record["sha256"],"count":149,"recomputed":True,
            "scope":"safe-cell-QOK-stencil-v1","offsets":[[0,0],[-1,0],[1,0],[0,-1],[0,1]],
            "framesPerHero":12,"heroFrameSources":hero_sources,"qokHits":{"g3":0,"male":0}},
        "routes":{"startAndLegacyFallbackVerified":True,"savedPositionRecoveryVerified":True,
            "crystalCaveRoundTrip":True,"allExitsReachable":True,"noTraversableTerrainSeam":True,
            "leftPlainsOpeningRetained":True,"staleGuardAccepted":False}}
    for name in forward.REQUIRED_PROOFS:
        proof_record=review if name=="a1owDecode" else _write_bytes(root,f"proofs/{name}.txt",name.encode())
        proofs[name]={**proof_record,"passed":True,"values":values.get(name,{})}
    descriptor={"schema":"qok-forward-terrain-profile-v1","profileId":profile,
        "proofFieldSplitVersion":forward.PROOF_FIELD_SPLIT_VERSION,
        "rootAuthority":{"independentReview":True,"reviewRecordPath":root_authority["path"],
            "reviewRecordBytes":root_authority["bytes"],"reviewRecordSha256":root_authority["sha256"]},
        "fullWorldComplete":True,"gateReady":True,"authoringInputs":input_records,
        "generatedOutputs":output_sections,
        "regeneration":{"cleanRoots":2,"sourceLimited":True,"pathSetsEqual":True,
            "byteHashesEqual":True,"decodedPixelsEqual":True},
        "geometryContract":{"manifestPath":geometry_record["path"],"manifestSha256":geometry_record["sha256"],
            "revision":12,"chunkCount":120,"basePixelsPerCell":32},
        "collisionContract":collision_contract,
        "a1owContract":{"path":"act1-overworld-walk.bin","format":"A1OW-v2","sha256":a1ow_record["sha256"],
            "bakerPath":forward.A1OW_V2_BAKER_PATH,"bakerSha256":forward.A1OW_V2_BAKER_SHA256,
            "version":2,"headerBytes":96,"profileId":forward.A1OW_V2_PROFILE_ID,
            "supportSchema":forward.A1OW_V2_SUPPORT_SCHEMA,"pixelsPerCell":48,
            "mapCells":[320,400],"far":255,"blockCount":forward.A1OW_V2_BLOCKS,
            "supportFNV32":forward.A1OW_V2_SUPPORT_FNV32,
            "semanticsSha256":forward.A1OW_V2_SEMANTICS_SHA256,
            "supportSha256":forward.A1OW_V2_SUPPORT_SHA256,
            "payloadSha256":forward.A1OW_V2_PAYLOAD_SHA256,
            "scope":"water-only-inside-act1; analytic-mountains-outside-and-padding"},
        "currentGuard":guards,"proofs":proofs}
    checks={name:{"result":"PASS","proofSha256":proofs[name]["sha256"]} for name in forward.REQUIRED_PROOFS}
    receipt={"schema":"qok-forward-gate-receipt-v1","profileId":profile,"result":"PASS",
        "reviewerRole":"independent","authoringInputInventorySha256":forward.inventory_digest(input_records),
        "generatedOutputInventorySha256":forward.inventory_digest(output_sections["inventory"]),
        "checks":checks,"runner":{"version":"fixture-v1","path":"scripts/checker.py",
            "sha256":next(item["sha256"] for item in input_records if item["path"]=="scripts/checker.py")}}
    receipt_record=_write_json(root,"receipts/independent.json",receipt)
    descriptor["independentGateReceipt"]={"path":receipt_record["path"],"bytes":receipt_record["bytes"],"sha256":receipt_record["sha256"]}
    return descriptor


def _preparation_descriptor_fixture(root: Path):
    descriptor = _valid_descriptor_fixture(root)
    descriptor.update({"stage": "qa-preparation", "releaseEligible": False,
                       "pendingDynamicChecks": list(forward.PENDING_DYNAMIC_CHECKS),
                       "pendingProofAssertions": list(forward.PENDING_PROOF_ASSERTIONS),
                       "gateReady": False})
    descriptor["proofs"].pop("routes")
    descriptor["proofs"]["runtimeInvariants"]["values"].pop("existingSaveResume")
    descriptor["proofs"]["a1owDecode"]["values"].pop("mountainCollisionReconciled")
    descriptor["proofs"]["a1owDecode"]["values"].pop("heroFootClearanceRecomputed")
    descriptor["proofs"]["visibleAlpha"]["values"].pop("noHiddenSelectableHeroFrame")
    descriptor["proofs"]["heroFrameClearance"]["values"].pop("clearanceRecomputed")
    receipt_path = root / descriptor["independentGateReceipt"]["path"]
    receipt = json.loads(receipt_path.read_text())
    receipt["schema"] = forward.PREPARATION_RECEIPT_SCHEMA
    receipt["result"] = "QA_PREPARATION_PASS"
    receipt["checks"].pop("routes")
    receipt_path.write_text(json.dumps(receipt, sort_keys=True, separators=(",", ":")))
    record = {"path": descriptor["independentGateReceipt"]["path"],
              "bytes": receipt_path.stat().st_size, "sha256": forward.sha256(receipt_path)}
    descriptor["independentGateReceipt"].update(record)
    return descriptor


def _rebind_manifest_fixture(root: Path, descriptor: dict, *, mutate_manifest=None, mutate_receipt=None):
    """Keep all hashes/receipts current while testing one manifest-contract mutation."""
    generated = descriptor["generatedOutputs"]
    output_root = root / generated["root"]
    manifest_record = generated["runtimeManifest"][0]
    manifest_path = output_root / manifest_record["path"]
    manifest = json.loads(manifest_path.read_text())
    if mutate_manifest:
        mutate_manifest(manifest)
    manifest_bytes = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    manifest_path.write_bytes(manifest_bytes)
    new_manifest_record = {"path": manifest_record["path"], "bytes": len(manifest_bytes),
                           "sha256": hashlib.sha256(manifest_bytes).hexdigest()}
    for item in generated["inventory"]:
        if item["path"] == manifest_record["path"]:
            item.update(new_manifest_record)
    generated["runtimeManifest"][0].update(new_manifest_record)
    descriptor["currentGuard"]["finalManifestSha256"] = new_manifest_record["sha256"]
    descriptor["proofs"]["underpaintPhase"]["values"]["manifestSha256"] = new_manifest_record["sha256"]

    output_receipt_info = generated["outputReceipt"]
    output_receipt_path = root / output_receipt_info["path"]
    output_receipt = json.loads(output_receipt_path.read_text())
    if mutate_receipt:
        mutate_receipt(output_receipt)
    output_receipt["outputInventory"] = {
        item["path"]: {"bytes": item["bytes"], "sha256": item["sha256"]}
        for item in generated["inventory"]
    }
    receipt_bytes = json.dumps(output_receipt, sort_keys=True, separators=(",", ":")).encode()
    output_receipt_path.write_bytes(receipt_bytes)
    output_receipt_info.update({"bytes": len(receipt_bytes),
                                "sha256": hashlib.sha256(receipt_bytes).hexdigest()})

    independent_info = descriptor["independentGateReceipt"]
    independent_path = root / independent_info["path"]
    independent = json.loads(independent_path.read_text())
    independent["generatedOutputInventorySha256"] = forward.inventory_digest(generated["inventory"])
    independent_bytes = json.dumps(independent, sort_keys=True, separators=(",", ":")).encode()
    independent_path.write_bytes(independent_bytes)
    independent_info.update({"bytes": len(independent_bytes),
                             "sha256": hashlib.sha256(independent_bytes).hexdigest()})


class ForwardTerrainProfileTests(unittest.TestCase):
    def test_validator_pin_normalization_is_single_literal_and_semantics_sensitive(self):
        source = (b'PINNED_DESCRIPTOR_SHA256: str | None = "' + b"1" * 64 + b'"\n'
                  b"def check():\n    return 1\n")
        normalized = forward.normalize_validator_descriptor_pin(source)
        pin_only = source.replace(b"1" * 64, b"2" * 64)
        self.assertEqual(forward.normalize_validator_descriptor_pin(pin_only), normalized)
        semantic_edit = source.replace(b"return 1", b"return 2")
        self.assertNotEqual(forward.normalize_validator_descriptor_pin(semantic_edit), normalized)
        for invalid in (
            source.replace(b"1" * 64, b"x" * 64),
            source + source.splitlines(keepends=True)[0],
            source.replace(b'"' + b"1" * 64 + b'"', b"None"),
        ):
            with self.subTest(invalid=invalid):
                with self.assertRaisesRegex(forward.ProfileError, "exactly one well-formed descriptor SHA pin"):
                    forward.normalize_validator_descriptor_pin(invalid)

    def test_generator_water_recipe_uses_pinned_repo_relative_asset_and_rejects_identity_drift(self):
        profile_root = Path(forward.__file__).resolve().parents[1] / "design/terrain-current-profile-20261007"
        generator_path = profile_root / "generate_forward_profile.py"
        spec = importlib.util.spec_from_file_location("water_recipe_generator_test", generator_path)
        generator = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(generator)
        recipe_path = profile_root / "materials/act1-water-r2.json"
        recipe = json.loads(recipe_path.read_text())

        self.assertEqual(
            generator.verify_water_r2_recipe(recipe),
            "design/terrain-current-profile-20261007/materials/act1-water-r2.png",
        )
        for field, value in (("assetPath", "materials/act1-water-r2.png"),
                             ("sha256", "0" * 64)):
            bad = copy.deepcopy(recipe)
            bad[field] = value
            with self.subTest(field=field), self.assertRaisesRegex(
                AssertionError, "asset/recipe identity or density changed"
            ):
                generator.verify_water_r2_recipe(bad)

    def test_north_frontage_allows_only_direct_one_hop_from_original_roots(self):
        profile_root = Path(forward.__file__).resolve().parents[1] / "design/terrain-current-profile-20261007"
        generator_path = profile_root / "generate_forward_profile.py"
        spec = importlib.util.spec_from_file_location("north_frontage_generator_test", generator_path)
        generator = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(generator)

        def art(width):
            image = Image.new("RGBA", (width, 1), (0, 0, 0, 255))
            return image

        root = {"id": "cliff:root|71,218", "kind": "cliff", "record": {"originWorldCell": [0, 0]},
            "image": art(11), "x": 10, "y": 10}
        child = {"id": "cliff:child|71,220", "kind": "cliff", "record": {"originWorldCell": [0, 2]},
            "image": art(6), "x": 20, "y": 10}
        grandchild = {"id": "cliff:grandchild|71,222", "kind": "cliff", "record": {"originWorldCell": [0, 4]},
            "image": art(6), "x": 25, "y": 10}
        visible = np.zeros((64, 64), dtype=np.uint8)
        visible[10, 10:31] = 255
        _first, points, inventory = generator.north_frontage_skyline_pixels(
            visible, [root, child, grandchild], {}, [0, 0, 1, 1])
        self.assertEqual(set(inventory), {root["id"], child["id"]})
        child_record = inventory[child["id"]]
        self.assertEqual(child_record["sourceKind"], "one-hop-north-alpha-overlap")
        self.assertEqual(child_record["rootSourceIds"], [root["id"]])
        self.assertEqual(child_record["directOverlapPixels"], 1)
        self.assertEqual(child_record["skylinePointCount"], 6)
        self.assertNotIn(grandchild["id"], {point["sourceId"] for point in points},
            "a child cannot promote its own overlap into transitive root provenance")

    def test_authored_north_sea_mask_requires_real_mountain_skyline_and_exterior_water(self):
        profile_root = Path(forward.__file__).resolve().parents[1] / "design/terrain-current-profile-20261007"
        generator_path = profile_root / "generate_forward_profile.py"
        spec = importlib.util.spec_from_file_location("north_sea_generator_test", generator_path)
        generator = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(generator)

        shape = (64, 64)
        visible = np.zeros(shape, dtype=np.uint8)
        visible[30, 10:20] = 255
        mountain = np.zeros(shape, dtype=bool)
        mountain[10:30, 10:20] = True
        water = np.zeros(shape, dtype=bool)
        water[:10, 10:20] = True
        base = np.ones(shape, dtype=bool)
        collision = np.zeros(shape, dtype=bool)
        guard = np.zeros(shape, dtype=bool)
        corridors = np.zeros(shape, dtype=bool)
        frontage = [{"sourceId": "cliff:main|north-mass|10,30",
            "rootSourceIds": ["cliff:main|north-mass|10,30"], "x": 15, "y": 30}]
        cut, proof = generator.north_authored_sea_backing_cut(
            visible, mountain, water, base, collision, guard, corridors, frontage, [0, 0, 1, 1])
        self.assertEqual(int(cut.sum()), 200)
        self.assertEqual(proof["acceptedComponents"], 1)
        self.assertEqual(proof["components"][0]["sourceIds"], ["cliff:main|north-mass|10,30"])
        self.assertEqual(proof["missingSkylineColumns"], 0)
        self.assertEqual(proof["routeCorridorOverlapPixels"], 0)

        protected = collision.copy()
        protected[20, 10:20] = True
        safe_cut, safe_proof = generator.north_authored_sea_backing_cut(
            visible, mountain, water, base, protected, guard, corridors, frontage, [0, 0, 1, 1])
        self.assertEqual(int(safe_cut.sum()), 0)
        self.assertEqual(safe_proof["collisionOverlapPixels"], 0)

    def test_north_sea_contact_extension_is_single_pass_source_qualified_and_fail_closed(self):
        from PIL import Image
        profile_root = Path(forward.__file__).resolve().parents[1] / "design/terrain-current-profile-20261007"
        spec = importlib.util.spec_from_file_location("north_contact_generator_test", profile_root / "generate_forward_profile.py")
        generator = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(generator)

        def event(source_id, x, alpha=255):
            sprite = Image.new("RGBA", (1, 1), (90, 120, 70, alpha))
            return {"id": source_id, "kind": "cliff", "x": x, "y": 2, "image": sprite}

        shape = (5, 10)
        seed = np.zeros(shape, dtype=np.uint8); seed[2, 4] = 1
        semantic_m = np.zeros(shape, dtype=bool); semantic_m[2, 1:6] = True
        visible = np.zeros(shape, dtype=np.uint8); visible[2, 1] = 255
        clear = np.zeros(shape, dtype=bool)
        inventory = {"north-root": {"sourceKind": "authored-north-root", "rootSourceIds": ["north-root"]}}
        extended, proof, added = generator.extend_north_sea_to_authored_contacts(
            seed, semantic_m, visible, clear, clear, clear, [event("north-root", 1)], inventory)
        self.assertEqual(np.flatnonzero(added[2]).tolist(), [2, 3])
        self.assertEqual(proof["addedPixels"], 2)
        self.assertEqual(proof["acceptedSourceIds"], ["north-root"])
        self.assertEqual(proof["outsideOriginalSeedRows"], 0)
        self.assertEqual(int(seed.sum()), 1, "the original seed plane must remain unchanged")
        component_proof = {"acceptedComponents": 1, "acceptedPixels": 1,
            "components": [{"sourceIds": [], "frontageRootIds": ["north-root"], "pixels": 1,
                "bboxPixelsXYXY": [4, 2, 5, 3], "bboxWorldXYXY": [0, 0, 0, 0],
                "seaSeedPixels": 1, "realSkylineColumns": 1}]}
        merged = generator.merge_north_sea_contact_proof(seed, extended, component_proof,
            [0, 0, 9, 4], proof, inventory)
        self.assertEqual(merged["acceptedPixels"], 3)
        self.assertEqual(merged["components"][0]["pixels"], 3)
        self.assertEqual(merged["components"][0]["sourceIds"], ["north-root"])

        unqualified, unqualified_proof, unqualified_delta = generator.extend_north_sea_to_authored_contacts(
            seed, semantic_m, visible, clear, clear, clear, [event("unreviewed", 1)], {})
        self.assertTrue(np.array_equal(unqualified, seed))
        self.assertEqual(int(unqualified_delta.sum()), 0, "an unqualified contact cannot authorize backing removal")

        open_row, open_proof, open_delta = generator.extend_north_sea_to_authored_contacts(
            seed, semantic_m, np.zeros(shape, dtype=np.uint8), clear, clear, clear, [], inventory)
        self.assertTrue(np.array_equal(open_row, seed), "an open row without a real contact must stay unchanged")
        self.assertEqual(int(open_delta.sum()), 0)

        protected = clear.copy(); protected[2, 2] = True
        barrier_semantic = semantic_m.copy(); barrier_semantic[2, 0] = True
        barrier_visible = visible.copy(); barrier_visible[2, 0] = 255
        barrier, barrier_proof, barrier_delta = generator.extend_north_sea_to_authored_contacts(
            seed, barrier_semantic, barrier_visible, protected, clear, clear,
            [event("north-root", 0)], inventory)
        self.assertTrue(np.array_equal(barrier, seed), "a protected pixel must stop horizontal contact extension")
        self.assertEqual(int(barrier_delta.sum()), 0)

        # A left-side extension is derived only from the input seed; the unqualified
        # art at the other end cannot be reached by reseeding the newly added pixels.
        no_reseed_semantic = np.zeros(shape, dtype=bool); no_reseed_semantic[2, 1:9] = True
        no_reseed_visible = np.zeros(shape, dtype=np.uint8); no_reseed_visible[2, [0, 9]] = 255
        no_reseed_events = [event("north-root", 0), event("unreviewed", 9)]
        no_reseed, no_reseed_proof, no_reseed_delta = generator.extend_north_sea_to_authored_contacts(
            seed, no_reseed_semantic, no_reseed_visible, clear, clear, clear,
            no_reseed_events, inventory)
        self.assertEqual(np.flatnonzero(no_reseed_delta[2]).tolist(), [1, 2, 3])
        self.assertEqual(no_reseed_proof["acceptedSourceIds"], ["north-root"])

    def test_authored_north_sea_mask_proof_is_strictly_validated(self):
        geometry_path = (Path(forward.__file__).resolve().parents[1]
                         / "design/terrain-current-profile-20261007/r4-source/runtime/manifest.json")
        geometry = json.loads(geometry_path.read_text())
        proof = {
            "schema": "authored-north-sea-backing-v1", "connectivity": 4,
            "semanticMountainToken": [128, 126, 122], "semanticSeaToken": [30, 82, 170],
            "exteriorSea": "exact semantic W connected to north, west, or east map edge",
            "frontageRule": "north-recipe/support contributor or legacy cliff authored at northern semantic bound",
            "skylineRule": "first real in-map visible-or-support alpha per column; candidate pixels are strictly north of it",
            "searchDomain": "complete authored semantic bounds; no band cutoff or missing-alpha sentinel",
            "semanticSourcePath": "portable-root/design/continent-terrain-class-method/owner-terrain/art-tiles/act1-smoothed-semantic.png",
            "semanticSourceSha256": "4" * 64, "semanticSourceDimensionsPx": [2368, 2912],
            "semanticSourcePixelsPerCell": 16,
            "semanticProjection": "exact RGB tokens replicated 2x2 with nearest semantics to 32px/cell",
            "candidatePixels": 24, "candidateComponents": 2, "waterSeededComponents": 1,
            "frontageQualifiedComponents": 1, "acceptedComponents": 1, "acceptedPixels": 12,
            "rejectedForMissingWaterOrFrontage": 1, "missingSkylineColumns": 0,
            "missingSkylineColumnIds": [], "visibleArtOverlapPixels": 0,
            "nonMountainSemanticOverlapPixels": 0, "collisionOverlapPixels": 0,
            "heroRouteGuardOverlapPixels": 0, "routeCorridorOverlapPixels": 0,
            "touchesWestOrEastMapEdge": False, "touchesSouthMapEdge": False,
            "components": [{"sourceIds": ["north-support:ridge-02"], "pixels": 12,
                "frontageRootIds": ["north-support:ridge-02"],
                "bboxPixelsXYXY": [1, 2, 5, 6], "bboxWorldXYXY": [16.03125, 218.0625, 16.15625, 218.1875],
                "seaSeedPixels": 3, "realSkylineColumns": 4}],
            "frontageContributorInventory": [{"sourceId": "north-support:ridge-02",
                "sourceKind": "north-support-root", "rootSourceIds": ["north-support:ridge-02"],
                "directOverlapPixels": 12, "skylinePointCount": 4}],
            "fringeContact": {"schema": "north-sea-authored-contact-v1",
                "rule": "single horizontal pass from original accepted north-sea pixels through clear exact-M to first opaque authored contact; no reseeding or new rows",
                "addedPixels": 0, "components": 0, "acceptedSourceIds": [], "addedPixelsBySource": {}, "contacts": [],
                "nonMountainSemanticOverlapPixels": 0, "visibleArtOverlapPixels": 0,
                "collisionOverlapPixels": 0, "heroRouteGuardOverlapPixels": 0,
                "routeCorridorOverlapPixels": 0, "outsideOriginalSeedRows": 0},
        }
        forward.validate_north_authored_sea_backing_mask(proof, geometry)
        contact_proof = copy.deepcopy(proof)
        child_id = "cliff:child|narrow-contact|20,218"
        contact_proof["frontageContributorInventory"].append({"sourceId": child_id,
            "sourceKind": "one-hop-north-alpha-overlap", "rootSourceIds": ["north-support:ridge-02"],
            "directOverlapPixels": 2, "skylinePointCount": 1})
        contact_proof["components"][0]["sourceIds"].append(child_id)
        contact_proof["components"][0]["sourceIds"].sort()
        contact_proof["components"][0]["pixels"] = 13
        contact_proof["acceptedPixels"] = 13
        contact_proof["fringeContact"] = {"schema": "north-sea-authored-contact-v1",
            "rule": "single horizontal pass from original accepted north-sea pixels through clear exact-M to first opaque authored contact; no reseeding or new rows",
            "addedPixels": 1, "components": 1, "acceptedSourceIds": [child_id],
            "addedPixelsBySource": {child_id: 1},
            "contacts": [{"y": 2, "endpointX": 5, "addedStartX": 6, "addedEndX": 7, "sourceIds": [child_id]}],
            "nonMountainSemanticOverlapPixels": 0, "visibleArtOverlapPixels": 0,
            "collisionOverlapPixels": 0, "heroRouteGuardOverlapPixels": 0,
            "routeCorridorOverlapPixels": 0, "outsideOriginalSeedRows": 0}
        forward.validate_north_authored_sea_backing_mask(contact_proof, geometry)
        changed = copy.deepcopy(contact_proof)
        changed["fringeContact"]["outsideOriginalSeedRows"] = 1
        with self.assertRaisesRegex(forward.ProfileError, "protection"):
            forward.validate_north_authored_sea_backing_mask(changed, geometry)
        changed = copy.deepcopy(proof)
        changed["missingSkylineColumns"] = 1
        with self.assertRaisesRegex(forward.ProfileError, "missing skyline"):
            forward.validate_north_authored_sea_backing_mask(changed, geometry)
        changed = copy.deepcopy(proof)
        changed["components"][0]["pixels"] = 11
        with self.assertRaisesRegex(forward.ProfileError, "do not sum"):
            forward.validate_north_authored_sea_backing_mask(changed, geometry)

    def test_forward_dq_override_uses_only_the_reviewed_current_source_pin(self):
        current = b"reviewed current DQ runtime"
        record = {"path": "public/dq-tiles.js", "bytes": len(current),
                  "sha256": hashlib.sha256(current).hexdigest()}
        descriptor = {"currentGuard": {"inputPaths": {"dqTiles": "public/dq-tiles.js"}},
                      "authoringInputs": [record]}

        class BaselinePins:
            ACT1_OVERLAY_FILES = {
                "dq-tiles.js": (len(b"old frozen DQ"), hashlib.sha256(b"old frozen DQ").hexdigest()),
                "act1-overworld-walk.bin": (9, "0" * 64),
                "other-overlay.js": (3, hashlib.sha256(b"old").hexdigest()),
            }

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "public").mkdir()
            (root / "public/dq-tiles.js").write_bytes(current)

            pins = forward._forward_overlay_pins(root, descriptor, BaselinePins)
            self.assertEqual(pins["dq-tiles.js"], (len(current), record["sha256"]))
            self.assertEqual(pins["other-overlay.js"], BaselinePins.ACT1_OVERLAY_FILES["other-overlay.js"])
            self.assertNotIn("act1-overworld-walk.bin", pins)

            # A stale historical pin is ignored only for the descriptor-bound DQ override.
            self.assertNotEqual(pins["dq-tiles.js"], BaselinePins.ACT1_OVERLAY_FILES["dq-tiles.js"])

            (root / "public/dq-tiles.js").write_bytes(b"tampered DQ")
            with self.assertRaisesRegex(forward.ProfileError, "differs from its reviewed authoring row"):
                forward._forward_overlay_pins(root, descriptor, BaselinePins)

            (root / "public/dq-tiles.js").write_bytes(current)
            missing_row = copy.deepcopy(descriptor)
            missing_row["authoringInputs"] = []
            with self.assertRaisesRegex(forward.ProfileError, "exactly one reviewed"):
                forward._forward_overlay_pins(root, missing_row, BaselinePins)

            altered_guard = copy.deepcopy(descriptor)
            altered_guard["currentGuard"]["inputPaths"]["dqTiles"] = "public/other.js"
            with self.assertRaisesRegex(forward.ProfileError, "exact reviewed public/dq-tiles.js"):
                forward._forward_overlay_pins(root, altered_guard, BaselinePins)

    def test_final_runtime_rejects_missing_or_stale_reviewed_dq_output(self):
        current = b"reviewed public DQ source"
        current_sha = hashlib.sha256(current).hexdigest()
        descriptor = {
            "currentGuard": {"inputPaths": {"dqTiles": "public/dq-tiles.js"}},
            "authoringInputs": [{"path": "public/dq-tiles.js", "bytes": len(current),
                                 "sha256": current_sha}],
            "a1owContract": {"path": "act1-overworld-walk.bin",
                             "sha256": hashlib.sha256(b"reviewed A1OW").hexdigest()},
        }

        class BaselinePins:
            BaselineError = baseline.BaselineError
            sha256 = staticmethod(baseline.sha256)
            ACT1_OVERLAY_FILES = {"dq-tiles.js": (7, hashlib.sha256(b"old DQ pin").hexdigest())}
            ACT1_DUNGEON_FILES = {}
            ACT1_TOWN_FILES = {}
            ACT1_LANDMARK_FILES = {}
            ACT1_MATERIAL_FILES = {}
            UI_ASSET_FILES = {}

        with tempfile.TemporaryDirectory(prefix="forward-runtime-dq-output-") as temp:
            repo = Path(temp) / "repo"
            runtime = Path(temp) / "runtime"
            (repo / "public").mkdir(parents=True)
            runtime.mkdir(parents=True)
            (repo / "public/dq-tiles.js").write_bytes(current)
            (repo / "public/act1-overworld-walk.bin").write_bytes(b"reviewed A1OW")
            (runtime / "act1-world-map.js").write_bytes(b"world map")
            (runtime / "act1-overworld-walk.bin").write_bytes(b"reviewed A1OW")

            def files_under(path):
                if path == runtime:
                    return {item.name: item for item in path.iterdir() if item.is_file()}
                return {}

            for state in ("missing", "stale"):
                with self.subTest(runtime_dq=state):
                    dq = runtime / "dq-tiles.js"
                    if dq.exists():
                        dq.unlink()
                    if state == "stale":
                        dq.write_bytes(b"old DQ pin")
                    with patch.object(forward, "load_reviewed_descriptor", return_value=(descriptor, "d" * 64)), \
                         patch.object(forward, "validate_descriptor", return_value={
                             "outputInventory": [], "preservedRuntimeInventory": []}), \
                         patch.object(forward, "_profile_runtime_paths", return_value=set()), \
                         patch.object(BaselinePins, "load_manifest", return_value={"files": [
                             {"path": "act1-overworld-walk.bin", "bytes": len(b"reviewed A1OW"),
                              "sha256": hashlib.sha256(b"reviewed A1OW").hexdigest()}]}, create=True), \
                         patch.object(BaselinePins, "files_under", side_effect=files_under, create=True), \
                         patch.object(BaselinePins, "semantic_checks", return_value=None, create=True):
                        with self.assertRaisesRegex(baseline.BaselineError, "missing=.*dq-tiles.js|nonterrain override identity mismatch: dq-tiles.js"):
                            forward.validate_runtime(repo, runtime, frozenset(), BaselinePins)

    def test_optional_north_support_is_strictly_inventory_and_geometry_bound(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            geometry = {"semanticBounds": [16, 218, 31, 249], "chunks": [
                {"id": "c0-r0", "x": 0, "y": 0, "width": 16, "height": 16},
                {"id": "c0-r1", "x": 0, "y": 256, "width": 16, "height": 16},
            ]}
            image_path = root / "act1-hifi/chunks/north/c0-r0.png"
            image_path.parent.mkdir(parents=True)
            image_path.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x0dIHDR" +
                                  struct.pack(">II", 32, 300))
            image_sha = hashlib.sha256(image_path.read_bytes()).hexdigest()
            manifest = {"chunks": [
                {**geometry["chunks"][0], "north": "chunks/north/c0-r0.png", "northSha256": image_sha},
                dict(geometry["chunks"][1]),
            ], "northSupport": {
                "schema": "north-cliff-overhang-v1", "pixelsPerCell": 32, "heightPixels": 300,
                "anchor": "north edge of manifest chunk row y=0",
                "depth": "above-plate pixels use the north overhang layer; in-map B110 pixels use the shared contactY foreground compositor",
                "chunks": ["c0-r0"],
                "prefixMask": {"northWorldY": 218, "bandCells": 8,
                    "terrainRow": "owner terrain row 0, only M cells",
                    "contact": "first nonzero cliff alpha from existing cliff chunks or these four connected support pixels",
                    "noContact": "leave base opaque"},
                "sourceSupport": {"sourceAtlasSha256": "1" * 64, "recipeSha256": "2" * 64,
                    "supportIds": ["fill-02-rear-mass-B-98", "fill-04-right-pocket-mass-B-110",
                        "ridge-02-broad-joining-mass-B-94", "ridge-04-broad-joining-mass-B-106"],
                    "processedRecipeObjectCount": 9, "connectedCropBoundaryOpaqueColumns": 375,
                    "upperSourceCropXYXY": [15, 0, 583, 600], "lowerPixelIdentity": "exact",
                    "adjacentProcessedCropBoundaryRows": [299, 300], "cropBoundaryRgbaSha256": "3" * 64},
                "sharedContactYCompositor": {}, "prefixChunkProof": [], "collisionChanged": True,
                "collisionUnion": {},
            }}
            output_map = {"act1-hifi/chunks/north/c0-r0.png": image_sha}
            self.assertEqual(forward.validate_optional_north_support(manifest, geometry, root, output_map),
                             ["c0-r0"])
            self.assertNotIn("groundCacheMaskRebuild", manifest["northSupport"])

            legacy = {"chunks": [dict(chunk) for chunk in geometry["chunks"]]}
            self.assertEqual(forward.validate_optional_north_support(legacy, geometry, root, {}), [])

            mutations = [
                ("schema", lambda m: m["northSupport"].update(schema="north-cliff-v2"), "schema is unsupported"),
                ("unexpected schema key", lambda m: m["northSupport"].update(extra="not v1"), "strict reviewed schema"),
                ("cache audit belongs in receipt", lambda m: m["northSupport"].update(groundCacheMaskRebuild={}), "strict reviewed schema"),
                ("height", lambda m: m["northSupport"].update(heightPixels=299), "height, pixel phase"),
                ("phase", lambda m: m["northSupport"].update(pixelsPerCell=16), "height, pixel phase"),
                ("offset anchor", lambda m: m["northSupport"].update(anchor="chunk center"), "anchor, or draw offset"),
                ("missing list row", lambda m: m["northSupport"].update(chunks=[]), "chunk list is missing"),
                ("duplicate list", lambda m: m["northSupport"].update(chunks=["c0-r0", "c0-r0"]), "duplicated"),
                ("orphan list", lambda m: m["northSupport"].update(chunks=["c0-r1"]), "differs from exact north resource"),
                ("north ref without support", lambda m: m.pop("northSupport"), "require the northSupport schema"),
                ("wrong top row", lambda m: m["chunks"][0].update(y=256), "top chunk row"),
                ("bad offset", lambda m: m["chunks"][0].update(x=1), "offset/extent"),
                ("path escape", lambda m: m["chunks"][0].update(north="chunks/north/../bad.png"), "unsafe descriptor path"),
                ("wrong layer path", lambda m: m["chunks"][0].update(north="chunks/forest/c0.png"), "unsupported layer or format"),
                ("bad png dimensions", lambda m: m["chunks"][0].update(northSha256="0" * 64), "not bound to exact generated output inventory"),
            ]
            for label, mutate, expected in mutations:
                with self.subTest(label=label):
                    changed = copy.deepcopy(manifest)
                    mutate(changed)
                    with self.assertRaisesRegex(forward.ProfileError, expected):
                        forward.validate_optional_north_support(changed, geometry, root, output_map)

            wrong_inventory = dict(output_map, **{"act1-hifi/chunks/north/c0-r0.png": "0" * 64})
            with self.assertRaisesRegex(forward.ProfileError, "not bound to exact generated output inventory"):
                forward.validate_optional_north_support(manifest, geometry, root, wrong_inventory)

            wrong_dims = copy.deepcopy(manifest)
            wrong_dims["chunks"][0]["north"] = "chunks/north/wrong.png"
            wrong_path = root / "act1-hifi/chunks/north/wrong.png"
            wrong_path.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x0dIHDR" + struct.pack(">II", 30, 300))
            wrong_sha = hashlib.sha256(wrong_path.read_bytes()).hexdigest()
            wrong_dims["chunks"][0]["northSha256"] = wrong_sha
            wrong_map = {"act1-hifi/chunks/north/wrong.png": wrong_sha}
            with self.assertRaisesRegex(forward.ProfileError, "dimensions/offset"):
                forward.validate_optional_north_support(wrong_dims, geometry, root, wrong_map)

    def test_north_enclosed_water_gap_extension_is_exact_and_legacy_remains_valid(self):
        repo = Path(__file__).resolve().parents[1]
        descriptor = json.loads((repo / forward.DESCRIPTOR_RELATIVE).read_text())
        generated_root = repo / descriptor["generatedOutputs"]["root"]
        manifest = json.loads((generated_root / "act1-hifi/manifest.json").read_text())
        geometry = json.loads((repo / descriptor["geometryContract"]["manifestPath"]).read_text())
        receipt = json.loads((repo / descriptor["generatedOutputs"]["outputReceipt"]["path"]).read_text())
        output_map = {
            path.removeprefix("public/"): item["sha256"]
            for path, item in receipt["outputInventory"].items()
        }
        current_mask = {
            "schema": "enclosed-north-water-gap-v1",
            "connectivity": 4,
            "seed": "four-neighbor adjacency to preserved north prefix cut",
            "bandCells": 8,
            "ownerTerrainClass": "M at each candidate pixel world row",
            "requiresCliffContactInBand": True,
            "candidatePixels": 3687,
            "candidateComponents": 18,
            "seededCandidateComponents": 12,
            "acceptedComponents": 12,
            "rejectedUnseededComponents": 6,
            "rejectedBandBottomComponents": 0,
            "rejectedPlateSideComponents": 0,
            "cutPixels": 2514,
            "contactColumns": 2916,
            "ownerMPixels": 718848,
            "globalChunkSeamsChecked": True,
        }
        reviewed_manifest = copy.deepcopy(manifest)
        reviewed_manifest["northSupport"]["northEnclosedWaterGapMask"] = current_mask
        self.assertEqual(
            reviewed_manifest["northSupport"]["northEnclosedWaterGapMask"],
            current_mask,
        )
        self.assertEqual(
            forward.validate_optional_north_support(reviewed_manifest, geometry, generated_root, output_map),
            ["c4-r0", "c5-r0", "c6-r0"],
        )

        # The extension is optional for the original northSupport v1 contract.
        legacy = copy.deepcopy(reviewed_manifest)
        legacy["northSupport"].pop("northEnclosedWaterGapMask")
        self.assertEqual(
            forward.validate_optional_north_support(legacy, geometry, generated_root, output_map),
            ["c4-r0", "c5-r0", "c6-r0"],
        )

        mutations = [
            ("unknown extension field", lambda m: m.update(unreviewed=True), "strict reviewed schema"),
            ("unsupported extension schema", lambda m: m.update(schema="gap-v2"), "schema differs from the reviewed contract"),
            ("connectivity", lambda m: m.update(connectivity=8), "connectivity differs"),
            ("band", lambda m: m.update(bandCells=7), "bandCells differs"),
            ("ownership", lambda m: m.update(ownerTerrainClass="M only at top row"), "ownerTerrainClass differs"),
            ("component arithmetic", lambda m: m.update(candidateComponents=24), "candidateComponents differs"),
            ("cut total", lambda m: m.update(cutPixels=4027), "cutPixels differs"),
            ("boolean masquerading as integer", lambda m: m.update(candidatePixels=True), "candidatePixels differs"),
            ("seam proof", lambda m: m.update(globalChunkSeamsChecked=False), "globalChunkSeamsChecked differs"),
        ]
        for label, mutate, expected in mutations:
            with self.subTest(label=label):
                changed = copy.deepcopy(reviewed_manifest)
                mutate(changed["northSupport"]["northEnclosedWaterGapMask"])
                with self.assertRaisesRegex(forward.ProfileError, expected):
                    forward.validate_optional_north_support(changed, geometry, generated_root, output_map)

        wrong_geometry = copy.deepcopy(geometry)
        wrong_geometry["semanticBounds"] = [16, 218, 162, 399]
        with self.assertRaisesRegex(forward.ProfileError, "reviewed full-world R26 geometry"):
            forward.validate_optional_north_support(reviewed_manifest, wrong_geometry, generated_root, output_map)

    def test_north_collision_authority_is_exact_and_legacy_wording_is_preserved(self):
        manifest_path = (Path(__file__).resolve().parents[1]
                         / forward.GENERATED_OUTPUT_ROOT / "act1-hifi/manifest.json")
        manifest = json.loads(manifest_path.read_text())
        self.assertEqual(
            manifest["forwardTerrainProfile"]["collisionAuthority"],
            forward.expected_collision_authority(True),
        )
        self.assertEqual(
            forward.expected_collision_authority(False),
            "final visible forest+cliff object alpha; QOKF8COL forest-collision.bin derived at runtime threshold16",
        )

    def test_generation_receipt_preserves_baseline_alpha_and_binds_north_union(self):
        # The checked-in output receipt intentionally remains stale until fresh
        # final generation. Exercise the strict contract with a synthetic receipt
        # assembled from the independently pinned baseline/union identities.
        alpha = {
            "path": forward.NORTH_BASELINE_ALPHA_PATH,
            "sha256": forward.NORTH_BASELINE_ALPHA_SHA256,
            "thresholdBeforeCollision": 128,
            "collisionThreshold": 16,
            "collisionEqualsBaselineRaisedArtAlpha": True,
            "collisionUnionAddsNorthSupportPixels": forward.NORTH_UNION_NEW_BITS,
            "collisionUnionSourceSha256": forward.NORTH_UNION_ALPHA_SHA256,
        }
        forward.validate_generation_alpha_receipt(
            alpha, forward.NORTH_BASELINE_ALPHA_PATH, forward.NORTH_BASELINE_ALPHA_SHA256, True)
        changed = dict(alpha, collisionUnionSourceSha256="0" * 64)
        with self.assertRaisesRegex(forward.ProfileError, "preserve baseline alpha"):
            forward.validate_generation_alpha_receipt(
                changed, forward.NORTH_BASELINE_ALPHA_PATH,
                forward.NORTH_BASELINE_ALPHA_SHA256, True)

        legacy = {"path": "evidence/legacy-alpha.png", "sha256": "1" * 64,
                  "thresholdBeforeCollision": 128, "collisionThreshold": 16,
                  "collisionEqualsAlphaNonzero": True, "collisionXorPixels": 0}
        forward.validate_generation_alpha_receipt(
            legacy, legacy["path"], legacy["sha256"], False)
        legacy["collisionXorPixels"] = 1
        with self.assertRaisesRegex(forward.ProfileError, "legacy exact source-alpha"):
            forward.validate_generation_alpha_receipt(
                legacy, legacy["path"], legacy["sha256"], False)

    def test_generator_carries_locked_r26_path_constraints_and_design_locks(self):
        profile_root = Path(forward.__file__).resolve().parents[1] / "design/terrain-current-profile-20261007"
        generator_path = profile_root / "generate_forward_profile.py"
        spec = importlib.util.spec_from_file_location("forward_profile_generator_test", generator_path)
        generator = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(generator)
        current = json.loads((profile_root / "current/act1-hifi-manifest.json").read_text())
        r26 = json.loads((profile_root / "r4-source/runtime/manifest.json").read_text())
        emitted = generator.apply_r26_locked_geometry(current, r26)
        self.assertEqual(emitted["pathConstraints"], r26["pathConstraints"])
        self.assertEqual(emitted["designLocks"], r26["designLocks"])
        self.assertNotIn("pathConstraints", current)  # source stays immutable
        changed = json.loads(json.dumps(current))
        changed["designLocks"]["cameraWorldWidth"] -= 1
        with self.assertRaisesRegex(AssertionError, "differs from pinned R26 geometry: designLocks"):
            generator.apply_r26_locked_geometry(changed, r26)
        conflicting = json.loads(json.dumps(current))
        conflicting["pathConstraints"] = {"corridors": []}
        with self.assertRaisesRegex(AssertionError, "conflicting pathConstraints"):
            generator.apply_r26_locked_geometry(conflicting, r26)

    def test_default_dispatch_stays_historical(self):
        called = []

        def historical(root, allowed):
            called.append((root, allowed))
            raise baseline.BaselineError("historical absent closure")

        stderr = io.StringIO()
        with patch.object(sys, "argv", ["runtime_baseline.py", "verify-act1", "--input", "."]), \
             patch.object(baseline, "verify_act1_overlay", historical), \
             contextlib.redirect_stderr(stderr):
            result = baseline.main()
        self.assertEqual(result, 1)
        self.assertEqual(len(called), 1)
        self.assertIn("historical absent closure", stderr.getvalue())

    def test_unknown_profile_is_rejected_by_dispatch(self):
        with patch.object(sys, "argv", ["runtime_baseline.py", "verify-act1", "--terrain-profile", "made-up"]):
            with self.assertRaises(SystemExit) as raised:
                baseline.main()
        self.assertEqual(raised.exception.code, 2)

    def test_forward_dispatch_fails_closed_when_only_preparation_proof_exists(self):
        stderr = io.StringIO()
        descriptor = Path(__file__).resolve().parents[1] / forward.DESCRIPTOR_RELATIVE
        current_pin = hashlib.sha256(descriptor.read_bytes()).hexdigest()
        with patch.object(sys, "argv", ["runtime_baseline.py", "verify-act1", "--input", ".",
                                         "--terrain-profile", forward.PROFILE_ID]), \
             patch.object(forward, "PINNED_DESCRIPTOR_SHA256", current_pin), \
             patch.object(baseline, "verify_act1_overlay", side_effect=AssertionError("legacy fallback called")), \
             contextlib.redirect_stderr(stderr):
            result = baseline.main()
        self.assertEqual(result, 1)
        self.assertIn("QA_PREPARATION_PASS is nonshippable; release evidence is required", stderr.getvalue())

    def test_forward_profile_rejects_missing_descriptor_precisely(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(forward.ProfileError, "missing .*forward-profile-descriptor.json"):
                forward.load_reviewed_descriptor(Path(directory))

    def test_source_inventory_detects_byte_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.dat"
            source.write_bytes(b"before")
            record = [{"path": "source.dat", "bytes": 6,
                       "sha256": hashlib.sha256(b"before").hexdigest()}]
            self.assertIn("source.dat", forward.validate_inventory(root, record, "test input"))
            source.write_bytes(b"after!")
            with self.assertRaisesRegex(forward.ProfileError, "hash changed"):
                forward.validate_inventory(root, record, "test input")

    def test_collision_contract_rejects_wrong_length_and_header(self):
        contract = {"runtimeFormat": "qok-forest-bitset-v1",
                    "pixelsPerCell": 32, "dimensionsPx32": [4736, 5824],
                    "bounds": [16, 218, 163, 399], "alphaThreshold": 16,
                    "headerBytes": 64, "bitOrder": "little-within-byte", "version": 1,
                    "bytes": 3_447_872, "sourceSha256": "0" * 64}
        with tempfile.TemporaryDirectory() as directory:
            pack = Path(directory) / "collision.bin"
            pack.write_bytes(b"too short")
            with self.assertRaisesRegex(forward.ProfileError, "length differs"):
                forward.decode_forward_collision(pack, contract)
            with pack.open("wb") as handle:
                handle.truncate(3_447_872)
            with self.assertRaisesRegex(forward.ProfileError, "magic/header"):
                forward.decode_forward_collision(pack, contract)

    def test_north_collision_union_is_exact_and_monotonic(self):
        union = {
            "schema": "north-support-qok-union-v1",
            "bounds": forward.COLLISION_BOUNDS,
            "pixelsPerCell": 32,
            "sourceAlphaThreshold": 128,
            "outsideMapPixelsExcluded": True,
            "supportAlphaPixelsInsideMap": 11479,
            "newCollisionPixels": forward.NORTH_UNION_NEW_BITS,
            "postUnionPackedBitsSha256": forward.NORTH_UNION_PACKED_BITS_SHA256,
        }
        receipt = {
            "northSupportCollision": copy.deepcopy(union),
            "sourceAlpha": {
                "path": forward.NORTH_BASELINE_ALPHA_PATH,
                "sha256": forward.NORTH_BASELINE_ALPHA_SHA256,
                "collisionEqualsBaselineRaisedArtAlpha": True,
                "collisionUnionAddsNorthSupportPixels": forward.NORTH_UNION_NEW_BITS,
                "collisionUnionSourceSha256": forward.NORTH_UNION_ALPHA_SHA256,
                "pixelsPerCell": 32,
                "dimensions": list(forward.COLLISION_DIMENSIONS),
            },
            "collisionPack": {"sourceSha256": forward.NORTH_UNION_ALPHA_SHA256},
        }
        proof = {"proposal": {
            "monotonicUnionVerified": True,
            "removedQokBits": 0,
            "newQokBits": forward.NORTH_UNION_NEW_BITS,
            "addedDeltaMaskSha256": forward.NORTH_DELTA_PACKED_BITS_SHA256,
            "postUnionMaskSha256": forward.NORTH_UNION_PACKED_BITS_SHA256,
            "candidateUnionPixelsInMap": 11479,
        }}

        def png_header(width, height):
            return (bytes.fromhex("89504e470d0a1a0a0000000d49484452")
                    + struct.pack(">II", width, height))

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output_map = {}
            for relative, digest in (
                (forward.NORTH_BASELINE_ALPHA_PATH, forward.NORTH_BASELINE_ALPHA_SHA256),
                (forward.NORTH_UNION_ALPHA_PATH, forward.NORTH_UNION_ALPHA_SHA256),
                (forward.NORTH_DELTA_ALPHA_PATH, forward.NORTH_DELTA_ALPHA_SHA256),
            ):
                image = root / relative
                image.parent.mkdir(parents=True, exist_ok=True)
                image.write_bytes(png_header(*forward.COLLISION_DIMENSIONS))
                output_map[relative] = digest

            self.assertEqual(forward.validate_north_collision_union(
                {"collisionUnion": copy.deepcopy(union)}, receipt, root, output_map, proof),
                forward.NORTH_UNION_ALPHA_SHA256)

            rejected = [
                ("removed bits", lambda u, r, p, m: p["proposal"].update(removedQokBits=1)),
                ("new bit count", lambda u, r, p, m: u.update(newCollisionPixels=1415)),
                ("post-union digest", lambda u, r, p, m: u.update(postUnionPackedBitsSha256="0" * 64)),
                ("delta digest", lambda u, r, p, m: p["proposal"].update(addedDeltaMaskSha256="0" * 64)),
                ("baseline identity", lambda u, r, p, m: r["sourceAlpha"].update(sha256="0" * 64)),
                ("combined alpha identity", lambda u, r, p, m: r["collisionPack"].update(sourceSha256="0" * 64)),
                ("missing delta inventory", lambda u, r, p, m: m.pop(forward.NORTH_DELTA_ALPHA_PATH)),
            ]
            for label, mutate in rejected:
                with self.subTest(label=label):
                    changed_union = copy.deepcopy(union)
                    changed_receipt = copy.deepcopy(receipt)
                    changed_proof = copy.deepcopy(proof)
                    changed_map = dict(output_map)
                    mutate(changed_union, changed_receipt, changed_proof, changed_map)
                    changed_receipt["northSupportCollision"] = copy.deepcopy(changed_union)
                    if label in {"removed bits", "delta digest"}:
                        expected = "independent north collision delta proof"
                    elif label in {"baseline identity", "combined alpha identity"}:
                        expected = "does not preserve baseline alpha"
                    elif label == "missing delta inventory":
                        expected = "exact output inventory pin"
                    else:
                        expected = "dimensions, policy, delta count"
                    with self.assertRaisesRegex(forward.ProfileError, expected):
                        forward.validate_north_collision_union(
                            {"collisionUnion": changed_union}, changed_receipt,
                            root, changed_map, changed_proof)

            wrong_size = root / forward.NORTH_DELTA_ALPHA_PATH
            wrong_size.write_bytes(png_header(4735, 5824))
            with self.assertRaisesRegex(forward.ProfileError, "dimensions differ"):
                forward.validate_north_collision_union(
                    {"collisionUnion": copy.deepcopy(union)}, receipt, root, output_map, proof)

    def test_collision_decoder_can_bind_union_source_without_changing_contract(self):
        contract = {"runtimeFormat": "qok-forest-bitset-v1", "version": 1,
                    "headerBytes": 64, "dimensionsPx32": list(forward.COLLISION_DIMENSIONS),
                    "bounds": forward.COLLISION_BOUNDS, "pixelsPerCell": 32,
                    "alphaThreshold": 16, "bitOrder": "little-within-byte",
                    "bytes": 3_447_872, "sourceSha256": forward.NORTH_BASELINE_ALPHA_SHA256}
        with tempfile.TemporaryDirectory() as directory:
            pack = Path(directory) / "collision.bin"
            header = bytearray(64)
            header[:8] = b"QOKF8COL"
            struct.pack_into("<HHIII", header, 8, 1, 64, 4736, 5824, 32)
            header[24:56] = bytes.fromhex(forward.NORTH_UNION_ALPHA_SHA256)
            pack.write_bytes(bytes(header) + bytes(3_447_872 - 64))
            decoded = forward.decode_forward_collision(
                pack, contract, expected_source_sha256=forward.NORTH_UNION_ALPHA_SHA256)
            self.assertEqual(decoded["payloadSha256"], hashlib.sha256(bytes(3_447_872 - 64)).hexdigest())
            with self.assertRaisesRegex(forward.ProfileError, "header/source-alpha SHA"):
                forward.decode_forward_collision(
                    pack, contract, expected_source_sha256=forward.NORTH_BASELINE_ALPHA_SHA256)

    def test_a1ow_decoder_requires_reviewed_v2_header_support_and_payload(self):
        contract = {"path":"act1-overworld-walk.bin","format":"A1OW-v2",
                    "sha256":forward.A1OW_V2_ARTIFACT_SHA256,
                    "bakerPath":forward.A1OW_V2_BAKER_PATH,
                    "bakerSha256":forward.A1OW_V2_BAKER_SHA256,
                    "version":2,"headerBytes":forward.A1OW_V2_HEADER_BYTES,
                    "profileId":forward.A1OW_V2_PROFILE_ID,
                    "supportSchema":forward.A1OW_V2_SUPPORT_SCHEMA,
                    "pixelsPerCell":48,"mapCells":[320,400],"far":255,
                    "blockCount":forward.A1OW_V2_BLOCKS,
                    "supportFNV32":forward.A1OW_V2_SUPPORT_FNV32,
                    "semanticsSha256":forward.A1OW_V2_SEMANTICS_SHA256,
                    "supportSha256":forward.A1OW_V2_SUPPORT_SHA256,
                    "payloadSha256":forward.A1OW_V2_PAYLOAD_SHA256,
                    "scope":"water-only-inside-act1; analytic-mountains-outside-and-padding"}
        source = Path(__file__).resolve().parents[1]/"public/act1-overworld-walk.bin"
        with tempfile.TemporaryDirectory() as directory:
            pack = Path(directory) / "act1-overworld-walk.bin"
            pack.write_bytes(source.read_bytes())
            decoded=forward.decode_a1ow(pack,contract)
            self.assertEqual(decoded["version"],2)
            self.assertEqual(decoded["headerBytes"],96)
            self.assertEqual(decoded["blocks"],4094)
            self.assertEqual(decoded["payloadSha256"],forward.A1OW_V2_PAYLOAD_SHA256)
            for key,wrong in (("version",1),("profileId","other-profile"),
                              ("supportSha256","0"*64),("supportFNV32",0),
                              ("semanticsSha256","0"*64),("payloadSha256","0"*64),
                              ("bakerSha256","0"*64)):
                bad=dict(contract);bad[key]=wrong
                with self.subTest(contractField=key), self.assertRaisesRegex(forward.ProfileError,"exact reviewed v2"):
                    forward.decode_a1ow(pack,bad)
            mutated=bytearray(pack.read_bytes());mutated[14:16]=(64).to_bytes(2,"little")
            pack.write_bytes(mutated)
            with self.assertRaisesRegex(forward.ProfileError,"artifact bytes differ"):
                forward.decode_a1ow(pack,contract)

    def test_water_r2_contract_binds_density_texture_and_chunk_geometry(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root
            act1 = output / "act1-hifi"
            (act1 / "materials").mkdir(parents=True)
            (act1 / "chunks/water-r2").mkdir(parents=True)
            from PIL import Image
            texture = act1 / "materials/act1-water-r2.png"
            Image.new("RGB", (6, 6), (10, 20, 30)).save(texture)
            source_asset = root / forward.FORWARD_WATER_R2_ASSET
            source_asset.parent.mkdir(parents=True, exist_ok=True)
            source_asset.write_bytes(texture.read_bytes())
            chunk = act1 / "chunks/water-r2/c0.png"
            Image.new("RGBA", (4, 2), (10, 20, 30, 255)).save(chunk)
            asset_sha = hashlib.sha256(texture.read_bytes()).hexdigest()
            chunk_sha = hashlib.sha256(chunk.read_bytes()).hexdigest()
            recipe_data = {"schema": "act1-water-texture-r2-v1",
                "assetPath": forward.FORWARD_WATER_R2_ASSET, "sha256": asset_sha,
                "dimensionsPx": [6, 6], "mode": "RGB",
                "outputPixelsPerCell": 32, "sourceTexelsPerCell": 96,
                "semanticMask": 'R4 _weights("water") from manifest-referenced smoothed semantic classgrid at 32px/cell',
                "phase": "global world-cell origin; texture coordinate is worldCell*96 + outputPixel*3"}
            recipe_file = root / forward.FORWARD_WATER_R2_RECIPE
            recipe_file.parent.mkdir(parents=True, exist_ok=True)
            recipe_file.write_text(json.dumps(recipe_data))
            recipe_sha = hashlib.sha256(recipe_file.read_bytes()).hexdigest()
            treatment = {"schema": "act1-water-r2-global-phase-v1",
                "assetPath": "materials/act1-water-r2.png", "assetSha256": asset_sha,
                "assetDimensionsPx": [6, 6], "sourceRecipeSha256": recipe_sha,
                "sourceRecipePath": forward.FORWARD_WATER_R2_RECIPE,
                "sourceAssetPath": forward.FORWARD_WATER_R2_ASSET,
                "sourceAssetSha256": asset_sha,
                "pixelsPerCell": 32, "sourceTexelsPerCell": 96,
                "semanticMask": 'R4 _weights("water") floored to 1.0 on exact smoothed semantic W tokens; 32ppc output',
                "phase": "global world-cell origin; 96 texture texels per cell",
                "blend": "normal alpha composite"}
            manifest = {"waterTreatment": treatment, "chunks": [{
                "id": "c0", "water": "chunks/water-r2/c0.png", "waterSha256": chunk_sha,
                "waterPixelsPerCell": 32}]}
            geometry = {"chunks": [{"id": "c0", "width": 2, "height": 1}]}
            output_map = {"act1-hifi/materials/act1-water-r2.png": asset_sha,
                          "act1-hifi/chunks/water-r2/c0.png": chunk_sha}
            input_map = {forward.FORWARD_WATER_R2_ASSET: asset_sha,
                         forward.FORWARD_WATER_R2_RECIPE: recipe_sha}
            self.assertTrue(forward.validate_water_treatment(manifest, geometry, output,
                                                              output_map, input_map, root))
            for label, change, message in [
                ("density", lambda m: m["waterTreatment"].update(pixelsPerCell=16), "density/mask/phase"),
                ("source", lambda m: m["waterTreatment"].update(sourceRecipeSha256="b" * 64), "authoring inputs"),
                ("pixels", lambda m: m["chunks"][0].update(waterPixelsPerCell=16), "chunk schema"),
            ]:
                bad = copy.deepcopy(manifest)
                change(bad)
                with self.subTest(label=label), self.assertRaisesRegex(forward.ProfileError, message):
                    forward.validate_water_treatment(bad, geometry, output, output_map, input_map, root)

    def test_descriptor_path_escape_is_rejected(self):
        for path in ("../outside", "/absolute/file", "a\\b", "a/../b"):
            with self.subTest(path=path), self.assertRaises(forward.ProfileError):
                forward._safe_relative(path)

    def test_profile_requires_complete_new_evidence_and_current_guard(self):
        with self.assertRaisesRegex(forward.ProfileError, "schema/profile identity"):
            forward.validate_descriptor(Path("."), {"schema": "wrong", "profileId": forward.PROFILE_ID})
        pilot = {"schema": "qok-forward-terrain-profile-v1", "profileId": forward.PROFILE_ID,
                 "proofFieldSplitVersion":forward.PROOF_FIELD_SPLIT_VERSION,
                 "rootAuthority": {}, "authoringInputs": [], "generatedOutputs": {},
                 "regeneration": {}, "geometryContract": {}, "currentGuard": {}, "proofs": {},
                 "collisionContract": {}, "a1owContract": {}, "independentGateReceipt": {},
                 "fullWorldComplete": False, "gateReady": False}
        with self.assertRaisesRegex(forward.ProfileError, "pilot-only or incomplete"):
            forward.validate_descriptor(Path("."), pilot)

    def test_minimally_complete_descriptor_validates_through_successful_return(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            descriptor = _valid_descriptor_fixture(root)
            manifest = json.loads((root / forward.GENERATED_OUTPUT_ROOT / "act1-hifi/manifest.json").read_text())
            self.assertEqual(manifest["revision"], 12)
            self.assertEqual(len(manifest["chunks"]), 120)
            self.assertEqual(manifest["forwardTerrainProfile"]["profileId"], forward.PROFILE_ID)
            self.assertNotIn("schema", manifest)
            validated = forward.validate_descriptor(root, descriptor)
            self.assertEqual(len(validated["geometry"]["chunks"]), 120)
            self.assertEqual(validated["outputRoot"], root / forward.GENERATED_OUTPUT_ROOT)
            self.assertEqual(len(validated["outputInventory"]), 9)

            # Keep every receipt and inventory valid while corrupting only the
            # manifest format field; this reaches the comparison that used to
            # read collision locals before assignment.
            bad_root = Path(directory) / "bad-format"
            wrong_manifest_format = _valid_descriptor_fixture(
                bad_root, collision_format="qok-forward-invented-v1")
            with self.assertRaisesRegex(forward.ProfileError, "forward collision manifest differs"):
                forward.validate_descriptor(bad_root, wrong_manifest_format)

            descriptor["a1owContract"]["scope"] = "pilot-only"
            with self.assertRaisesRegex(forward.ProfileError, "exact reviewed v2"):
                forward.validate_descriptor(root, descriptor)

            malformed_root = Path(directory) / "bad-output-root"
            bad_root_descriptor = _valid_descriptor_fixture(malformed_root)
            bad_root_descriptor["generatedOutputs"]["root"] = "public"
            with self.assertRaisesRegex(forward.ProfileError, "dedicated exact subtree"):
                forward.validate_descriptor(malformed_root, bad_root_descriptor)

            malformed_preserved = Path(directory) / "bad-preserved-source"
            bad_preserved_descriptor = _valid_descriptor_fixture(malformed_preserved)
            bad_preserved_descriptor["generatedOutputs"]["consumedNonterrainOverrides"][0]["path"] = "public/unreviewed.js"
            with self.assertRaisesRegex(forward.ProfileError, "authoring input path escapes"):
                forward.validate_descriptor(malformed_preserved, bad_preserved_descriptor)

    def test_actual_r26_manifest_pins_and_generation_receipt_are_exact(self):
        mutations = [
            ("wrong revision", lambda m: m.update(revision=11), None,
             "reviewed R26 forward-profile receipt contract"),
            ("wrong chunk count", lambda m: m["chunks"].pop(), None,
             "reviewed R26 forward-profile receipt contract"),
        ("wrong geometry", lambda m: m.update(semanticBounds=[16,218,163,398]), None,
             "changed locked R26 geometry field"),
            ("wrong design locks", lambda m: m["designLocks"].update(cameraWorldWidth=207), None,
             "changed locked R26 geometry field"),
            ("wrong profile", lambda m: m["forwardTerrainProfile"].update(profileId="other"), None,
             "reviewed R26 forward-profile receipt contract"),
            ("wrong readiness", lambda m: m["forwardTerrainProfile"].update(gateReady=True), None,
             "reviewed R26 forward-profile receipt contract"),
            ("wrong source pin", lambda m: m["forwardTerrainProfile"].update(generatorSha256="0" * 64), None,
             "generatorSha256 is not bound to its exact pinned source"),
            ("receipt source pin mismatch", None, lambda r: r.update(generatorSha256="f" * 64),
             "generated-output receipt generatorSha256 differs"),
            ("receipt collision pin mismatch", None,
             lambda r: r["collisionPack"].update(sha256="f" * 64),
             "receipt alpha/collision pins differ"),
        ]
        for label, mutate_manifest, mutate_receipt, expected in mutations:
            with self.subTest(label=label), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                descriptor = _valid_descriptor_fixture(root)
                _rebind_manifest_fixture(root, descriptor, mutate_manifest=mutate_manifest,
                                         mutate_receipt=mutate_receipt)
                with self.assertRaisesRegex(forward.ProfileError, expected):
                    forward.validate_descriptor(root, descriptor)

    def test_runtime_mapping_has_only_the_explicit_root_a1ow_exception(self):
        inventory = [
            {"path": "act1-hifi/chunks/forest/c0-r0.webp"},
            {"path": "evidence/final-visible-raised-alpha.png"},
            {"path": "evidence/review.png"},
        ]
        preserved = [{"path": "public/act1-hifi/landmarks/landmarks.json"}]
        self.assertEqual(forward._profile_runtime_paths(inventory, preserved, "act1-overworld-walk.bin"), {
            "act1-hifi/chunks/forest/c0-r0.webp", "act1-hifi/landmarks/landmarks.json",
            "act1-overworld-walk.bin"
        })
        for unauthorized in ("public/", "index.html", "act1-world-map.js", "../outside"):
            with self.subTest(path=unauthorized), self.assertRaises(forward.ProfileError):
                forward._profile_runtime_paths(inventory, preserved, unauthorized)
        with self.assertRaisesRegex(forward.ProfileError, "outside the exact Act 1 subtree"):
            forward._profile_runtime_paths(inventory, [{"path": "public/unreviewed.js"}],
                                           "act1-overworld-walk.bin")

    def test_qa_preparation_requires_static_closure_and_exact_pending_dynamic_list(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            descriptor = _preparation_descriptor_fixture(root)
            validated = forward.validate_descriptor(root, descriptor, stage="preparation")
            self.assertEqual(validated["pendingDynamicChecks"], list(forward.PENDING_DYNAMIC_CHECKS))
            self.assertEqual(validated["pendingProofAssertions"], list(forward.PENDING_PROOF_ASSERTIONS))
            self.assertFalse(descriptor["releaseEligible"])
            with self.assertRaisesRegex(forward.ProfileError, "nonshippable"):
                forward.validate_descriptor(root, descriptor)

            bad = dict(descriptor)
            bad["pendingDynamicChecks"] = list(forward.PENDING_DYNAMIC_CHECKS[:-1])
            with self.assertRaisesRegex(forward.ProfileError, "exact pending dynamic checks"):
                forward.validate_descriptor(root, bad, stage="preparation")

            bad = dict(descriptor)
            bad["pendingProofAssertions"] = list(forward.PENDING_PROOF_ASSERTIONS[:-1])
            with self.assertRaisesRegex(forward.ProfileError, "exact pending proof assertions"):
                forward.validate_descriptor(root, bad, stage="preparation")

            bad = dict(descriptor)
            bad["pendingProofAssertions"] = list(forward.PENDING_PROOF_ASSERTIONS) + ["routes.inventedPass"]
            with self.assertRaisesRegex(forward.ProfileError, "exact pending proof assertions"):
                forward.validate_descriptor(root, bad, stage="preparation")

            bad = dict(descriptor)
            bad["proofFieldSplitVersion"] = "unknown-proof-contract"
            with self.assertRaisesRegex(forward.ProfileError, "version is missing or unsupported"):
                forward.validate_descriptor(root, bad, stage="preparation")

    def test_qa_preparation_cannot_omit_static_proofs_or_claim_dynamic_route_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            descriptor = _preparation_descriptor_fixture(root)
            descriptor["proofs"].pop("collisionDecode")
            with self.assertRaisesRegex(forward.ProfileError, "proof sections mismatch"):
                forward.validate_descriptor(root, descriptor, stage="preparation")

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            descriptor = _preparation_descriptor_fixture(root)
            descriptor["proofs"]["runtimeInvariants"]["values"]["existingSaveResume"] = True
            with self.assertRaisesRegex(forward.ProfileError, "runtime proof must assert"):
                forward.validate_descriptor(root, descriptor, stage="preparation")

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            descriptor = _preparation_descriptor_fixture(root)
            descriptor["proofs"]["a1owDecode"]["values"]["mountainCollisionReconciled"] = True
            with self.assertRaisesRegex(forward.ProfileError, "exact preparation-stage proof-field split"):
                forward.validate_descriptor(root, descriptor, stage="preparation")

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            descriptor = _preparation_descriptor_fixture(root)
            descriptor["currentGuard"]["staleGuardAccepted"] = True
            with self.assertRaisesRegex(forward.ProfileError, "explicitly reject stale guard"):
                forward.validate_descriptor(root, descriptor, stage="preparation")

    def test_forward_build_preflights_before_dist_removal(self):
        script = (Path(__file__).resolve().parent / "build-dist.sh").read_text()
        self.assertLess(script.index("verify-forward-terrain-source"), script.index("rm -rf dist"))
        self.assertIn('"--terrain-profile", os.environ.get("QOK_TERRAIN_PROFILE", "historical")', script)
        self.assertIn('verify-act1 --input dist --terrain-profile "$TERRAIN_PROFILE"', script)
        prep = (Path(__file__).resolve().parent / "build-qa-preparation.sh").read_text()
        self.assertIn("--qa-preparation", prep)
        self.assertIn("act1-forward-20261007-v1", prep)

    def test_normal_shipping_entrypoints_do_not_accept_preparation_stage(self):
        root = Path(__file__).resolve().parent.parent
        result = subprocess.run(["sh", "scripts/ship-gate.sh", str(root), "--qa-preparation"],
                                cwd=root, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unknown ship-gate argument", result.stderr)
        upload = subprocess.run([sys.executable, "scripts/ship_ios.py", "--app-dir", str(root),
                                "--terrain-profile", forward.PROFILE_ID, "--dry-run"],
                               cwd=root, capture_output=True, text=True)
        self.assertNotEqual(upload.returncode, 0)
        self.assertIn("requires a sealed candidate identity and externally pinned terrain evidence", upload.stderr)
        release = (root / "scripts/ship_ios.py").read_text()
        self.assertNotIn('add_argument("--qa-preparation"', release)

    def test_qa_candidate_install_verifies_frozen_app_before_install_without_resync(self):
        root = Path(__file__).resolve().parent.parent
        script = (root / "scripts/run-ios.sh").read_text()
        start = script.index('if [ -n "$CANDIDATE_APP" ]; then')
        end = script.index('elif [ "$SKIP_BUILD" -eq 0 ]; then', start)
        candidate_flow = script[start:end]
        self.assertIn('"$TERRAIN_PROFILE" = "act1-forward-20261007-v1"', candidate_flow)
        self.assertIn('"$PRESERVE_SAVE" -eq 1', candidate_flow)
        self.assertIn('qa-simulator-app', candidate_flow)
        self.assertLess(candidate_flow.index('qa-simulator-app'), candidate_flow.index('xcrun simctl install'))
        self.assertNotIn('sync-ios.sh', candidate_flow)

    def test_forward_gate_does_not_fall_back_to_stale_guard(self):
        self.assertIn("semanticNavigationSha256", forward.REQUIRED_GUARD_INPUTS)
        self.assertIn("finalManifestSha256", forward.REQUIRED_GUARD_INPUTS)
        self.assertIn("routes", forward.REQUIRED_PROOFS)
        self.assertIn("collisionDecode", forward.REQUIRED_PROOFS)
        self.assertIn("a1owDecode", forward.REQUIRED_PROOFS)
        self.assertIn("heroFrameClearance", forward.REQUIRED_PROOFS)

    def test_nonterrain_coverage_references_locked_maps(self):
        for name in ("ACT1_DUNGEON_FILES", "ACT1_TOWN_FILES", "ACT1_LANDMARK_FILES",
                     "ACT1_MATERIAL_FILES", "UI_ASSET_FILES", "ACT1_OVERLAY_FILES"):
            self.assertIsInstance(getattr(baseline, name), dict)
        self.assertIn("semantic_checks(root, actual)", Path(forward.__file__).read_text())


if __name__ == "__main__":
    unittest.main()
