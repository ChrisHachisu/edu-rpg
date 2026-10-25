from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
PROFILE = ROOT / "design/terrain-current-profile-20261007"
GENERATOR_PATH = PROFILE / "generate_forward_profile.py"
REVIEW_RELATIVE = "design/terrain-current-profile-20261007/review-evidence/cave-roof-20261016/a1ow-source-equivalence.json"
REVIEW_SHA256 = "48d66cea69463ab2edf4e296db0a5d44b9f02beae6c1715dd32e90ee470e2684"


def load_generator():
    spec = importlib.util.spec_from_file_location("forward_profile_metadata_test", GENERATOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load forward-profile generator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class ForwardProfileMetadataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.generator = load_generator()

    def test_current_a1ow_overlay_requires_reviewed_dq_projection(self):
        manifest = {"source": {"act1TerrainUnionA1OWSha256": "d87c6572cbf3012180a289196cfe5e7eee7c50dc86beb06a999fa491eeacfdf3"}}
        overlay = self.generator.verified_a1ow_v2_source_overlay(manifest)
        self.assertEqual(overlay["act1TerrainUnionA1OWReviewPath"], REVIEW_RELATIVE)
        self.assertEqual(overlay["act1TerrainUnionA1OWReviewSha256"], REVIEW_SHA256)
        self.assertEqual(overlay["act1TerrainUnionA1OWReviewSchema"], "independent-a1ow-v2-integration-review-v1")
        self.assertEqual(overlay["act1TerrainUnionA1OWSha256"], "00a520ae09089547ca4af4ef1077b84acdad98d4989de238f3ee30e28ad092c6")

    def test_a1ow_overlay_rejects_stale_pin_and_unrelated_cave_delta(self):
        gen = self.generator
        frozen = {"source": {"act1TerrainUnionA1OWSha256": "d87c6572cbf3012180a289196cfe5e7eee7c50dc86beb06a999fa491eeacfdf3"}}
        with patch.object(gen, "A1OW_REVIEW_SHA256", "0" * 64):
            with self.assertRaisesRegex(AssertionError, "review identity changed"):
                gen.verified_a1ow_v2_source_overlay(frozen)

        proof = json.loads(gen.A1OW_REVIEW.read_text())
        proof["independentDqSourceEquivalence"]["sourceDelta"]["helper"]["sha256"] = "0" * 64
        with tempfile.TemporaryDirectory(prefix="a1ow-review-negative-") as temp:
            mutated_path = Path(temp) / "mutated-proof.json"
            mutated_path.write_text(json.dumps(proof, indent=2) + "\n")
            with patch.object(gen, "A1OW_REVIEW", mutated_path), patch.object(gen, "A1OW_REVIEW_SHA256", sha256(mutated_path)):
                with self.assertRaisesRegex(AssertionError, "reviewed exact additions"):
                    gen.verified_a1ow_v2_source_overlay(frozen)

    def test_metadata_rebind_updates_only_manifest_and_truthfully_rebinds_receipt(self):
        gen = self.generator
        r26 = json.loads(gen.R26_RUNTIME_MANIFEST.read_text())
        original = json.loads((PROFILE / "generated-output/act1-hifi/manifest.json").read_text())
        manifest = dict(r26)
        manifest["forwardTerrainProfile"] = dict(original["forwardTerrainProfile"])

        with tempfile.TemporaryDirectory(prefix="forward-profile-metadata-") as temp:
            root = Path(temp)
            source = root / "source"
            (source / "act1-hifi").mkdir(parents=True)
            manifest_path = source / "act1-hifi/manifest.json"
            gen.save_json(manifest_path, manifest)
            old_generator_sha = manifest["forwardTerrainProfile"]["generatorSha256"]
            receipt = {
                "profileId": "act1-forward-20261007-v1",
                "generatorSha256": old_generator_sha,
                "fullWorldComplete": True,
                "gateReady": False,
                "nativeVerified": False,
                "outputInventory": {
                    "public/act1-hifi/manifest.json": {
                        "bytes": manifest_path.stat().st_size,
                        "sha256": sha256(manifest_path),
                    }
                },
            }
            receipt_path = root / "source-receipt.json"
            receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
            out_root = root / "out"
            out_root.mkdir()
            result = gen.rebind_metadata_only(
                source,
                receipt_path,
                out_root / "generation-a",
                out_root / "generation-b",
            )

            self.assertEqual(result["status"], "PASS")
            self.assertEqual(result["outputPathCount"], 1)
            self.assertEqual(result["changedOutputPaths"], ["act1-hifi/manifest.json"])
            self.assertEqual(result["unchangedOutputCount"], 0)
            self.assertTrue(result["allOtherOutputBytesUnchanged"])
            self.assertEqual(result["outputAManifestSha256"], result["outputBManifestSha256"])
            self.assertEqual(result["outputAReceiptSha256"], result["outputBReceiptSha256"])

            emitted = json.loads((out_root / "generation-a/act1-hifi/manifest.json").read_text())
            emitted_receipt = json.loads((out_root / "generation-a-output-receipt.json").read_text())
            self.assertEqual(emitted["forwardTerrainProfile"]["generatorSha256"], sha256(GENERATOR_PATH))
            self.assertEqual(emitted["source"]["act1TerrainUnionA1OWReviewPath"], REVIEW_RELATIVE)
            self.assertEqual(emitted["source"]["act1TerrainUnionA1OWReviewSha256"], REVIEW_SHA256)
            self.assertEqual(
                emitted_receipt["a1owReview"],
                {
                    "path": REVIEW_RELATIVE,
                    "sha256": REVIEW_SHA256,
                    "schema": "independent-a1ow-v2-integration-review-v1",
                },
            )
            self.assertEqual(emitted_receipt["generatorSha256"], sha256(GENERATOR_PATH))


if __name__ == "__main__":
    unittest.main()
