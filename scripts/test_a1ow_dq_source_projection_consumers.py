from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
import shutil
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / 'design/terrain-current-profile-20261007/generate_forward_profile.py'
PROJECTION_RECORD = ROOT / 'design/terrain-current-profile-20261007/review-evidence/crystal-roof-20261016/a1ow-source-projection.json'
OUTER_REVIEW = ROOT / 'design/terrain-current-profile-20261007/review-evidence/crystal-roof-20261016/a1ow-source-equivalence-integration-v2.json'
CRYSTAL_SOURCE_REVIEW = ROOT / 'design/terrain-current-profile-20261007/review-evidence/crystal-roof-20261016/a1ow-source-equivalence.json'
SCHEMA = 'a1ow-dq-source-projection-v2-cave-local-delta'


def load_generator():
    spec = importlib.util.spec_from_file_location('a1ow_projection_consumer_test', GENERATOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DQProjectionConsumerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.generator = load_generator()
        cls.staged = json.loads(PROJECTION_RECORD.read_text())
        cls.base_outer = json.loads(OUTER_REVIEW.read_text())

    def invoke_generator(self, projection, *, source_projection=None, source_mutator=None):
        outer = copy.deepcopy(self.base_outer)
        outer['inputs']['dqTilesSha256'] = 'a7e267a5c2d2d1061af7f66956d82853b42f00c82c1f63baf043defbeb1b2a43'
        outer['independentDqSourceEquivalence'] = projection
        with tempfile.TemporaryDirectory(prefix='a1ow-dq-projection-test-') as td:
            review_path = Path(td) / 'review.json'
            review_path.write_text(json.dumps(outer, sort_keys=True))
            review_sha = hashlib.sha256(review_path.read_bytes()).hexdigest()
            crystal_review = json.loads(CRYSTAL_SOURCE_REVIEW.read_text())
            crystal_review['independentDqSourceEquivalence'] = projection if source_projection is None else source_projection
            if source_mutator:
                source_mutator(crystal_review)
            crystal_path = Path(td) / 'crystal-source-review.json'
            crystal_path.write_text(json.dumps(crystal_review, sort_keys=True))
            crystal_sha = hashlib.sha256(crystal_path.read_bytes()).hexdigest()
            old_path, old_sha = self.generator.A1OW_REVIEW, self.generator.A1OW_REVIEW_SHA256
            old_crystal_path, old_crystal_sha = self.generator.CRYSTAL_DQ_REVIEW, self.generator.CRYSTAL_DQ_REVIEW_SHA256
            try:
                self.generator.A1OW_REVIEW = review_path
                self.generator.A1OW_REVIEW_SHA256 = review_sha
                self.generator.CRYSTAL_DQ_REVIEW = crystal_path
                self.generator.CRYSTAL_DQ_REVIEW_SHA256 = crystal_sha
                return self.generator.verified_a1ow_v2_source_overlay({
                    'source': {'act1TerrainUnionA1OWSha256': outer['inputs']['frozenV1Sha256']}})
            finally:
                self.generator.A1OW_REVIEW, self.generator.A1OW_REVIEW_SHA256 = old_path, old_sha
                self.generator.CRYSTAL_DQ_REVIEW, self.generator.CRYSTAL_DQ_REVIEW_SHA256 = old_crystal_path, old_crystal_sha

    def test_reviewed_v2_projection_accepts_exact_candidate(self):
        projection = copy.deepcopy(self.staged)
        projection['status'] = 'PASS'  # Simulate a separately reviewed record; production staging remains DRAFT.
        result = self.invoke_generator(projection)
        self.assertEqual(result['act1TerrainUnionA1OWSha256'], '00a520ae09089547ca4af4ef1077b84acdad98d4989de238f3ee30e28ad092c6')

    def test_source_preflight_does_not_read_hydrated_or_missing_dist_dq(self):
        projection = copy.deepcopy(self.staged)
        projection['status'] = 'PASS'
        dist_path = self.generator.PROFILE_ROOT.parents[1] / 'dist/dq-tiles.js'
        original_read_bytes = Path.read_bytes
        for state in ('missing', 'stale'):
            with self.subTest(dist_state=state):
                def controlled_read_bytes(path):
                    if path == dist_path:
                        if state == 'missing':
                            raise FileNotFoundError(path)
                        return b'baseline-hydrated stale build output'
                    return original_read_bytes(path)
                with patch.object(Path, 'read_bytes', controlled_read_bytes):
                    result = self.invoke_generator(projection)
                self.assertEqual(result['act1TerrainUnionA1OWSha256'],
                                 '00a520ae09089547ca4af4ef1077b84acdad98d4989de238f3ee30e28ad092c6')

    def test_generator_rejects_stale_legacy_v1_record_without_rewriting_history(self):
        # The preserved v1 receipt binds old public DQ bytes, so it must fail closed on this newer candidate.
        projection = {
            'schema': 'a1ow-dq-source-equivalence-v1',
            'updatedSha256': 'b12d7eedea5420d18605633d66ee698fda24a538e1b026e9e7a092b3a1ddcb0a',
            'collisionRuntimeTailSha256': 'f542b7570cec71c7e347090d2cdab2a7cf8c844c5d8fd781bac12dbec5ceed44',
            'currentCollisionRuntimeTailSha256': '7974f54097586584fb1d3a7fd2d3a483055ec52d4e2f2699581f46ec15256be9',
            'checks': {'dqHashMatchesFinalSource': True,
                       'decodedHeaderAndSupportMatchCurrentRecomputation': True,
                       'collisionRuntimeExactAfterWaterCleanupProjection': True,
                       'collisionTailExact': False},
            'identicalCollisionRuntimeTail': False,
            'postAnchorDelta': {
                'normalization': 'remove only the two exact water-backing cleanup call strings plus their preceding added spaces from current tail',
                'occurrences': 2,
                'exactAddedBytes': 'a1aDropPlateWaterBacking(terrainState,scene); ',
                'normalizedTailByteIdenticalToBaseline': True,
            },
        }
        with self.assertRaisesRegex(AssertionError, 'full current-DQ'):
            self.invoke_generator(projection)

    def test_v2_projection_rejects_unreviewed_mutations(self):
        mutations = [
            ('draft status', lambda p: p.update(status='DRAFT_PENDING_REVIEW')),
            ('extra top-level field', lambda p: p.update(approved=True)),
            ('helper substitution', lambda p: p['sourceDelta']['helper'].update(sha256='0' * 64)),
            ('missing terrain fixture pin', lambda p: p['immutableInputs'].pop('terrainFixture')),
            ('native claim', lambda p: p['claims'].update(nativeOrRenderedPassClaimed=True)),
            ('mask raster drift', lambda p: p['staticProof']['maskRaster'].update(outsideAlphaPixels=1)),
        ]
        for label, mutate in mutations:
            with self.subTest(label=label):
                projection = copy.deepcopy(self.staged)
                projection['status'] = 'PASS'
                mutate(projection)
                with self.assertRaises((AssertionError, KeyError, TypeError)):
                    self.invoke_generator(projection)

    def test_crystal_source_only_wrapper_fields_and_projection_are_fail_closed(self):
        projection = copy.deepcopy(self.staged)
        projection['status'] = 'PASS'
        for label, mutate in [
            ('wrong schema', lambda r: r.update(schema='independent-a1ow-v2-integration-review-v1')),
            ('wrong status', lambda r: r.update(status='DRAFT_PENDING_REVIEW')),
            ('native claim', lambda r: r.update(nativeOrRenderedPassClaimed=True)),
            ('extra wrapper field', lambda r: r.update(approved=True)),
        ]:
            with self.subTest(label=label), self.assertRaises(AssertionError):
                self.invoke_generator(projection, source_mutator=mutate)
        different = copy.deepcopy(projection)
        different['claims']['nativeOrRenderedPassClaimed'] = True
        with self.assertRaises(AssertionError):
            self.invoke_generator(projection, source_projection=different)

    def test_crystal_source_only_record_cannot_replace_full_a1ow_integration_review(self):
        import tempfile
        source_only = json.loads(CRYSTAL_SOURCE_REVIEW.read_text())
        with tempfile.TemporaryDirectory(prefix='crystal-cannot-promote-a1ow-') as td:
            path = Path(td) / 'source-only.json'
            path.write_text(json.dumps(source_only, sort_keys=True))
            old_path, old_sha = self.generator.A1OW_REVIEW, self.generator.A1OW_REVIEW_SHA256
            try:
                self.generator.A1OW_REVIEW = path
                self.generator.A1OW_REVIEW_SHA256 = hashlib.sha256(path.read_bytes()).hexdigest()
                with self.assertRaisesRegex(AssertionError, 'artifact-level identity record'):
                    self.generator.verified_a1ow_v2_source_overlay({'source': {'act1TerrainUnionA1OWSha256': '0' * 64}})
            finally:
                self.generator.A1OW_REVIEW, self.generator.A1OW_REVIEW_SHA256 = old_path, old_sha

    def test_only_exact_crystal_diagnostics_root_accepts_absolute_evidence_paths(self):
        import sys
        sys.path.insert(0, str(ROOT / 'scripts'))
        import terrain_current_profile as validator
        approved = Path('/private/tmp/edu-rpg-build84-feedback-20261013/native-cave-contact-20261016/crystal-independent/before-after-comparisons.json')
        old_root = Path('/private/tmp/edu-rpg-build84-feedback-20261013/native-remaining-gate-20261016/cave-roof-fix-independent/review.md')
        escape = Path('/etc/hosts')
        self.assertTrue(self.generator._is_approved_crystal_dq_diagnostic(approved))
        self.assertTrue(validator._is_approved_crystal_dq_diagnostic(approved))
        self.assertFalse(self.generator._is_approved_crystal_dq_diagnostic(old_root))
        self.assertFalse(validator._is_approved_crystal_dq_diagnostic(old_root))
        self.assertFalse(self.generator._is_approved_crystal_dq_diagnostic(escape))
        self.assertFalse(validator._is_approved_crystal_dq_diagnostic(escape))

    def test_validator_source_only_crystal_record_cannot_replace_full_a1ow_review(self):
        import sys
        sys.path.insert(0, str(ROOT / 'scripts'))
        import test_terrain_current_profile as existing
        with tempfile.TemporaryDirectory(prefix='crystal-cannot-replace-a1ow-') as td:
            root = Path(td)
            descriptor = existing._valid_descriptor_fixture(root)
            proof = descriptor['proofs']['a1owDecode']
            review_path = root / proof['path']
            review_path.write_bytes(CRYSTAL_SOURCE_REVIEW.read_bytes())
            review_record = {'path': proof['path'], 'bytes': review_path.stat().st_size,
                             'sha256': hashlib.sha256(review_path.read_bytes()).hexdigest()}
            proof.update(review_record)
            for item in descriptor['authoringInputs']:
                if item['path'] == proof['path']:
                    item.update(review_record)

            def manifest_mutation(manifest):
                manifest['source']['act1TerrainUnionA1OWReviewSha256'] = review_record['sha256']

            def receipt_mutation(receipt):
                receipt['a1owReview']['sha256'] = review_record['sha256']

            existing._rebind_manifest_fixture(root, descriptor,
                                               mutate_manifest=manifest_mutation,
                                               mutate_receipt=receipt_mutation)
            independent_path = root / descriptor['independentGateReceipt']['path']
            independent = json.loads(independent_path.read_text())
            independent['authoringInputInventorySha256'] = existing.forward.inventory_digest(descriptor['authoringInputs'])
            independent['checks']['a1owDecode']['proofSha256'] = review_record['sha256']
            independent_bytes = json.dumps(independent, sort_keys=True, separators=(',', ':')).encode()
            independent_path.write_bytes(independent_bytes)
            descriptor['independentGateReceipt'].update(bytes=len(independent_bytes),
                                                       sha256=hashlib.sha256(independent_bytes).hexdigest())
            with self.assertRaisesRegex(existing.forward.ProfileError, 'stale or its artifact identity differs'):
                existing.forward.validate_descriptor(root, descriptor)

    def test_v2_projection_rejects_standalone_record_pin_drift(self):
        projection = copy.deepcopy(self.staged)
        projection['status'] = 'PASS'
        with tempfile.TemporaryDirectory(prefix='crystal-dq-bad-hash-') as td:
            path = Path(td) / 'source-only.json'
            record = json.loads(CRYSTAL_SOURCE_REVIEW.read_text())
            record['independentDqSourceEquivalence'] = projection
            path.write_text(json.dumps(record, sort_keys=True))
            old_path, old_sha = self.generator.CRYSTAL_DQ_REVIEW, self.generator.CRYSTAL_DQ_REVIEW_SHA256
            try:
                self.generator.CRYSTAL_DQ_REVIEW = path
                self.generator.CRYSTAL_DQ_REVIEW_SHA256 = '0' * 64
                outer = copy.deepcopy(self.base_outer)
                outer['inputs']['dqTilesSha256'] = 'a7e267a5c2d2d1061af7f66956d82853b42f00c82c1f63baf043defbeb1b2a43'
                outer['independentDqSourceEquivalence'] = projection
                outer_path = Path(td) / 'integration.json'
                outer_path.write_text(json.dumps(outer, sort_keys=True))
                old_outer, old_outer_sha = self.generator.A1OW_REVIEW, self.generator.A1OW_REVIEW_SHA256
                try:
                    self.generator.A1OW_REVIEW = outer_path
                    self.generator.A1OW_REVIEW_SHA256 = hashlib.sha256(outer_path.read_bytes()).hexdigest()
                    with self.assertRaisesRegex(AssertionError, 'source-only review identity changed'):
                        self.generator.verified_a1ow_v2_source_overlay({'source': {'act1TerrainUnionA1OWSha256': outer['inputs']['frozenV1Sha256']}})
                finally:
                    self.generator.A1OW_REVIEW, self.generator.A1OW_REVIEW_SHA256 = old_outer, old_outer_sha
            finally:
                self.generator.CRYSTAL_DQ_REVIEW, self.generator.CRYSTAL_DQ_REVIEW_SHA256 = old_path, old_sha

    def test_existing_validator_v1_fixture_remains_accepted(self):
        # Retain the fixture-backed legacy descriptor success case after adding
        # the nested v2 source-projection branch.
        import sys
        sys.path.insert(0, str(ROOT / 'scripts'))
        import test_terrain_current_profile as existing
        with tempfile.TemporaryDirectory(prefix='a1ow-validator-projection-test-') as td:
            fixture_root = Path(td)
            descriptor = existing._valid_descriptor_fixture(fixture_root)
            result = existing.forward.validate_descriptor(fixture_root, descriptor)
            self.assertEqual(len(result['geometry']['chunks']), 120)

    def test_validator_v2_projection_rejects_unrelated_candidate_and_schema_mutation(self):
        import sys
        sys.path.insert(0, str(ROOT / 'scripts'))
        import test_terrain_current_profile as existing
        for label, mutate in [
            ('unrelated DQ bytes', lambda p: None),
            ('missing exact field', lambda p: p.pop('normalizedSourceSha256')),
        ]:
            with self.subTest(label=label), tempfile.TemporaryDirectory(prefix='a1ow-validator-v2-test-') as td:
                fixture_root = Path(td)
                descriptor = existing._valid_descriptor_fixture(fixture_root)
                projection = copy.deepcopy(self.staged)
                projection['status'] = 'PASS'
                mutate(projection)
                proof = descriptor['proofs']['a1owDecode']
                review_path = fixture_root / proof['path']
                review = json.loads(review_path.read_text())
                review['inputs']['dqTilesSha256'] = descriptor['currentGuard']['dqTilesSha256']
                review['independentDqSourceEquivalence'] = projection
                raw = json.dumps(review, sort_keys=True, separators=(',', ':')).encode()
                review_path.write_bytes(raw)
                record = {'path': proof['path'], 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
                proof.update(record)
                for item in descriptor['authoringInputs']:
                    if item['path'] == record['path']:
                        item.update(record)
                crystal_review_target = fixture_root / existing.forward.CRYSTAL_DQ_REVIEW_RELATIVE
                crystal_review_target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(CRYSTAL_SOURCE_REVIEW, crystal_review_target)
                (fixture_root / 'dist').mkdir()
                (fixture_root / 'dist/dq-tiles.js').write_bytes(b'dq-tiles')

                def manifest_mutation(manifest):
                    manifest['source']['act1TerrainUnionA1OWReviewSha256'] = record['sha256']

                def receipt_mutation(receipt):
                    receipt['a1owReview']['sha256'] = record['sha256']

                existing._rebind_manifest_fixture(fixture_root, descriptor,
                                                   mutate_manifest=manifest_mutation,
                                                   mutate_receipt=receipt_mutation)
                independent_path = fixture_root / descriptor['independentGateReceipt']['path']
                independent = json.loads(independent_path.read_text())
                independent['authoringInputInventorySha256'] = existing.forward.inventory_digest(descriptor['authoringInputs'])
                independent['checks']['a1owDecode']['proofSha256'] = record['sha256']
                independent_bytes = json.dumps(independent, sort_keys=True, separators=(',', ':')).encode()
                independent_path.write_bytes(independent_bytes)
                descriptor['independentGateReceipt'].update(
                    bytes=len(independent_bytes), sha256=hashlib.sha256(independent_bytes).hexdigest())

                expected = ('public DQ source differs' if label == 'unrelated DQ bytes'
                            else 'differs from the A1OW integration projection')
                with self.assertRaisesRegex(existing.forward.ProfileError, expected):
                    existing.forward.validate_descriptor(fixture_root, descriptor)

    def test_validator_accepts_exact_v2_candidate_then_rejects_bad_contact_receipt(self):
        import sys
        sys.path.insert(0, str(ROOT / 'scripts'))
        import test_terrain_current_profile as existing
        for case in ('valid', 'bad-contact', 'escaped-test-receipt', 'missing-dist', 'stale-dist',
                     'source-hash', 'source-schema', 'source-projection-mismatch', 'bad-dependency'):
            bad_contact = case == 'bad-contact'
            with self.subTest(case=case), tempfile.TemporaryDirectory(prefix='a1ow-validator-v2-positive-') as td:
                root = Path(td)
                descriptor = existing._valid_descriptor_fixture(root)
                projection = copy.deepcopy(self.staged)
                projection['status'] = 'PASS'
                if bad_contact:
                    projection['staticProof']['contactPathCheck']['resultSha256'] = '0' * 64
                if case == 'escaped-test-receipt':
                    external = Path('/etc/hosts')
                    projection['staticProof']['testRuns'].update(
                        path=str(external), sha256=hashlib.sha256(external.read_bytes()).hexdigest())
                if case == 'bad-dependency':
                    projection['immutableInputs']['crystalCaveArt']['sha256'] = '0' * 64

                # Materialize the immutable source inventory in the disposable
                # fixture so the production validator consumes real pinned inputs.
                for rel in (
                    'public/dq-tiles.js', 'dist/dq-tiles.js',
                    'public/act1-overworld-walk.bin', 'scripts/bake_act1_overworld_walk.mjs',
                    'design/terrain-current-profile-20261007/evidence/a1ow-v2-independent-review/baked-final-map.json',
                    'public/act1-hifi/forest-collision.bin', 'public/act1-hifi/landmarks/whispering-woods.png',
                    'public/act1-hifi/landmarks/crystal-cave.png',
                    'public/act1-hifi/landmarks/landmarks.json',
                    'design/terrain-current-profile-20261007/input-manifest.json',
                    'scripts/test_act1_terrain_collision_integration.cjs',
                    'scripts/generate_ww_contact_mask.py', 'scripts/test_dq_tiles_landmark_contact.cjs',
                    'scripts/generate_crystal_contact_mask.py', 'scripts/test_crystal_contact_before_after.cjs',
                    'scripts/test_dq_tiles_scene_reentry.cjs',
                    'design/terrain-current-profile-20261007/review-evidence/cave-reentry-20261015/a1ow-source-equivalence.json',
                ):
                    source = ROOT / rel
                    target = root / rel
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(source, target)

                def materialize_evidence(value):
                    if isinstance(value, dict):
                        for key, child in value.items():
                            if key in {'path','resultPath'} and isinstance(child, str) and not Path(child).is_absolute():
                                source = ROOT / child
                                if source.is_file():
                                    target = root / child
                                    target.parent.mkdir(parents=True, exist_ok=True)
                                    shutil.copyfile(source, target)
                            else:
                                materialize_evidence(child)
                    elif isinstance(value, list):
                        for child in value:
                            materialize_evidence(child)

                materialize_evidence(projection['staticProof'])
                test_run_record = json.loads((ROOT / self.staged['staticProof']['testRuns']['path']).read_text())
                for run in test_run_record:
                    materialize_evidence(run.get('script', {}))

                if case == 'missing-dist':
                    (root / 'dist/dq-tiles.js').unlink()
                elif case == 'stale-dist':
                    (root / 'dist/dq-tiles.js').write_bytes(b'baseline-hydrated stale build output')

                def update_input(rel, *, add=False):
                    target = root / rel
                    rec = {'path': rel, 'bytes': target.stat().st_size,
                           'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}
                    matches = [item for item in descriptor['authoringInputs'] if item['path'] == rel]
                    if matches:
                        matches[0].update(rec)
                    elif add:
                        descriptor['authoringInputs'].append(rec)
                    return rec

                dq_record = update_input('public/dq-tiles.js')
                update_input('scripts/bake_act1_overworld_walk.mjs', add=True)
                update_input('design/terrain-current-profile-20261007/evidence/a1ow-v2-independent-review/baked-final-map.json', add=True)
                update_input('public/act1-hifi/forest-collision.bin', add=True)
                update_input('public/act1-hifi/landmarks/whispering-woods.png', add=True)
                update_input('public/act1-hifi/landmarks/landmarks.json', add=True)
                current_manifest = next(item for item in descriptor['authoringInputs']
                                        if item['path'] == 'design/terrain-current-profile-20261007/current/act1-hifi-manifest.json')
                update_input('design/terrain-current-profile-20261007/input-manifest.json', add=True)
                update_input('scripts/test_act1_terrain_collision_integration.cjs', add=True)
                # The fixture's current manifest is intentionally the compact
                # route fixture. Bind that exact fixture identity in this
                # temporary review copy while all other listed inputs are real.
                projection['immutableInputs']['manifests']['current'].update(
                    bytes=current_manifest['bytes'], sha256=current_manifest['sha256'])
                descriptor['currentGuard']['dqTilesSha256'] = dq_record['sha256']
                descriptor['proofs']['underpaintPhase']['values']['activeDqTilesSha256'] = dq_record['sha256']

                proof = descriptor['proofs']['a1owDecode']
                review_path = root / proof['path']
                review = json.loads(OUTER_REVIEW.read_text())
                review['inputs']['dqTilesSha256'] = dq_record['sha256']
                review['independentDqSourceEquivalence'] = projection
                review_bytes = json.dumps(review, sort_keys=True, separators=(',', ':')).encode()
                review_path.write_bytes(review_bytes)
                review_record = {'path': proof['path'], 'bytes': len(review_bytes), 'sha256': hashlib.sha256(review_bytes).hexdigest()}
                proof.update(review_record)
                for item in descriptor['authoringInputs']:
                    if item['path'] == proof['path']:
                        item.update(review_record)

                crystal_review = json.loads(CRYSTAL_SOURCE_REVIEW.read_text())
                crystal_review['independentDqSourceEquivalence'] = copy.deepcopy(projection)
                if case == 'source-schema':
                    crystal_review['schema'] = 'independent-a1ow-v2-integration-review-v1'
                elif case == 'source-projection-mismatch':
                    crystal_review['independentDqSourceEquivalence']['claims']['nativeOrRenderedPassClaimed'] = True
                crystal_rel = existing.forward.CRYSTAL_DQ_REVIEW_RELATIVE
                crystal_path = root / crystal_rel
                crystal_path.parent.mkdir(parents=True, exist_ok=True)
                crystal_path.write_text(json.dumps(crystal_review, sort_keys=True, separators=(',', ':')))
                if case == 'source-hash':
                    with crystal_path.open('ab') as handle:
                        handle.write(b' ')
                crystal_review_record = update_input(crystal_rel, add=True)
                crystal_review_sha = hashlib.sha256(crystal_path.read_bytes()).hexdigest()

                def manifest_mutation(manifest):
                    manifest['source']['act1TerrainUnionA1OWReviewSha256'] = review_record['sha256']

                def receipt_mutation(receipt):
                    receipt['a1owReview']['sha256'] = review_record['sha256']

                existing._rebind_manifest_fixture(root, descriptor,
                                                   mutate_manifest=manifest_mutation,
                                                   mutate_receipt=receipt_mutation)
                independent_path = root / descriptor['independentGateReceipt']['path']
                independent = json.loads(independent_path.read_text())
                independent['authoringInputInventorySha256'] = existing.forward.inventory_digest(descriptor['authoringInputs'])
                independent['checks']['a1owDecode']['proofSha256'] = review_record['sha256']
                independent_bytes = json.dumps(independent, sort_keys=True, separators=(',', ':')).encode()
                independent_path.write_bytes(independent_bytes)
                descriptor['independentGateReceipt'].update(bytes=len(independent_bytes), sha256=hashlib.sha256(independent_bytes).hexdigest())

                old_crystal_pin = existing.forward.CRYSTAL_DQ_REVIEW_SHA256
                # Positive and semantic-mutation cases use a fixture-specific record hash so
                # validation reaches the intended downstream predicate. The pin-drift case
                # deliberately retains the production pin.
                if case != 'source-hash':
                    existing.forward.CRYSTAL_DQ_REVIEW_SHA256 = crystal_review_sha
                try:
                    if bad_contact:
                        with self.assertRaisesRegex(existing.forward.ProfileError, 'contact-path result hash mismatch'):
                            existing.forward.validate_descriptor(root, descriptor)
                    elif case == 'escaped-test-receipt':
                        with self.assertRaisesRegex(existing.forward.ProfileError, 'outside approved Crystal diagnostic root'):
                            existing.forward.validate_descriptor(root, descriptor)
                    elif case == 'source-hash':
                        with self.assertRaisesRegex(existing.forward.ProfileError, 'source-only record is stale'):
                            existing.forward.validate_descriptor(root, descriptor)
                    elif case == 'source-schema':
                        with self.assertRaisesRegex(existing.forward.ProfileError, 'source-only record is stale'):
                            existing.forward.validate_descriptor(root, descriptor)
                    elif case == 'source-projection-mismatch':
                        with self.assertRaisesRegex(existing.forward.ProfileError, 'differs from the A1OW integration projection'):
                            existing.forward.validate_descriptor(root, descriptor)
                    elif case == 'bad-dependency':
                        with self.assertRaisesRegex(existing.forward.ProfileError, 'DQ cave projection input hash/length mismatch'):
                            existing.forward.validate_descriptor(root, descriptor)
                    else:
                        validated = existing.forward.validate_descriptor(root, descriptor)
                        self.assertEqual(len(validated['geometry']['chunks']), 120)
                finally:
                    existing.forward.CRYSTAL_DQ_REVIEW_SHA256 = old_crystal_pin


if __name__ == '__main__':
    unittest.main()
