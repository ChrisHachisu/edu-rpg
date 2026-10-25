from __future__ import annotations

import hashlib
import importlib.util
import json
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

S = Path(__file__).resolve().parents[1]
PROFILE = S / 'design/terrain-current-profile-20261007'
GENERATOR = PROFILE / 'generate_forward_profile.py'
PLACEMENTS = PROFILE / 'placements/cliff-selected-layout-whole-act1.json'
COMPOSITION = PROFILE / 'placements/cliff-composition-report.json'
ATLAS_MAIN = PROFILE / 'atlases/act1-cliff-kit-imagegen-v1.png'
ATLAS_COMPANION = PROFILE / 'atlases/companion-cliff-kit-imagegen-v2.png'
RECIPE = PROFILE / 'north-contact-y-20261007-recipe-v1.json'

spec = importlib.util.spec_from_file_location('forward_profile_whole_object_test', GENERATOR)
assert spec and spec.loader
forward = importlib.util.module_from_spec(spec)
spec.loader.exec_module(forward)


def real_cliff_events():
    records = json.loads(PLACEMENTS.read_text())['placements']
    components = {c['name']: c for c in json.loads(COMPOSITION.read_text())['coordinateContract']['assetComponents']}
    atlases = {'main': Image.open(ATLAS_MAIN).convert('RGBA'),
               'companion': Image.open(ATLAS_COMPANION).convert('RGBA')}
    out = []
    for rec in records:
        source = atlases[rec['group']].crop(tuple(components[rec['asset']]['sourceCrop']))
        scale = .5 if rec['group'] == 'main' else .125
        image = source.resize((round(source.width * scale), round(source.height * scale)), Image.Resampling.NEAREST)
        rgba = np.asarray(image).copy()
        rgba[..., 3] = np.where(rgba[..., 3] >= 128, 255, 0).astype(np.uint8)
        image = Image.fromarray(rgba)
        x = (int(rec['originWorldCell'][0]) - 16) * 32
        y = (int(rec['originWorldCell'][1]) - 218) * 32
        out.append({'record': rec, 'image': image, 'x': x, 'y': y,
                    'contact': (x, y), 'kind': 'cliff'})
    return out


class WholeObjectPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.recipe = json.loads(RECIPE.read_text())
        cls.events = real_cliff_events()
        cls.placement_sha = hashlib.sha256(PLACEMENTS.read_bytes()).hexdigest()
        nw = cls.recipe['northWindow']
        lx, ly, lw, lh = nw['replacementRectLocalXYWH']
        ox, oy = nw['northRasterOrigin']
        cls.rect = (ox + lx, oy + ly, ox + lx + lw, oy + ly + lh)

    def test_real_inventory_classifies_by_hard_alpha_and_stable_identity(self):
        retained, report = forward.apply_north_whole_object_policy(
            self.events, self.recipe, self.placement_sha, self.rect)
        self.assertEqual(report['classificationCounts'], {'contained': 25, 'crossing': 6, 'disjoint': 163})
        self.assertEqual(report['retainedObjectCount'], 169)
        self.assertEqual(len({e['record']['group'] + '|' + e['record']['asset'] + '|' +
                              ','.join(map(str, e['record']['originWorldCell'])) for e in retained}), 169)
        self.assertFalse(report['perPixelRectangleClippingApplied'])

    def test_crossers_and_disjoint_objects_remain_byte_identical(self):
        before = {forward.cliff_stable_identity(e['record']): hashlib.sha256(e['image'].tobytes()).hexdigest()
                  for e in self.events}
        retained, _ = forward.apply_north_whole_object_policy(
            self.events, self.recipe, self.placement_sha, self.rect)
        after = {forward.cliff_stable_identity(e['record']): hashlib.sha256(e['image'].tobytes()).hexdigest()
                 for e in retained}
        self.assertEqual(set(after), set(before) - set(self.recipe['wholeObjectPolicy']['expectedStableIdentities']['contained']))
        self.assertTrue(all(before[key] == after[key] for key in after))

    def test_source_hash_and_rect_fail_closed(self):
        with self.assertRaisesRegex(AssertionError, 'exact cliff placement inventory'):
            forward.apply_north_whole_object_policy(self.events, self.recipe, '0' * 64, self.rect)
        with self.assertRaisesRegex(AssertionError, 'stable identities'):
            forward.apply_north_whole_object_policy(self.events, self.recipe, self.placement_sha,
                                                     (2344, 0, 3194, 400))

    def test_classification_is_independent_of_record_order(self):
        retained, report = forward.apply_north_whole_object_policy(
            list(reversed(self.events)), self.recipe, self.placement_sha, self.rect)
        self.assertEqual(report['classificationCounts'], {'contained': 25, 'crossing': 6, 'disjoint': 163})
        all_ids = {forward.cliff_stable_identity(e['record']) for e in self.events}
        omitted = set(self.recipe['wholeObjectPolicy']['expectedStableIdentities']['contained'])
        self.assertEqual({forward.cliff_stable_identity(e['record']) for e in retained}, all_ids - omitted)

    def test_a1ow_v2_metadata_is_output_only_and_binary_bound(self):
        frozen_path = PROFILE / 'current/act1-hifi-manifest.json'
        frozen_bytes = frozen_path.read_bytes()
        frozen = json.loads(frozen_bytes)
        overlay = forward.verified_a1ow_v2_source_overlay(frozen)
        self.assertEqual(frozen_path.read_bytes(), frozen_bytes)
        self.assertEqual(frozen['source']['act1TerrainUnionA1OWSha256'],
                         'd87c6572cbf3012180a289196cfe5e7eee7c50dc86beb06a999fa491eeacfdf3')
        self.assertIn('act1TerrainUnionA1OWProvenance', frozen['source'])
        self.assertEqual(len(overlay), 12)
        self.assertEqual(overlay['act1TerrainUnionA1OWSha256'],
                         '00a520ae09089547ca4af4ef1077b84acdad98d4989de238f3ee30e28ad092c6')
        emitted = json.loads(json.dumps(frozen))
        emitted['source'].pop('act1TerrainUnionA1OWProvenance', None)
        emitted['source'].update(overlay)
        self.assertNotIn('act1TerrainUnionA1OWProvenance', emitted['source'])
        self.assertEqual(emitted['source']['act1TerrainUnionA1OWVersion'], 2)
        self.assertEqual(emitted['source']['act1TerrainUnionA1OWBlockCount'], 4094)
        self.assertEqual(emitted['source']['act1TerrainUnionA1OWPayloadSha256'],
                         '05be9638d04a692668c3a1c8b4bd3d809216bcede2e090a74a0712cb5467498c')
        self.assertEqual(emitted['source']['act1TerrainUnionA1OWScope'],
                         frozen['source']['act1TerrainUnionA1OWScope'])
        self.assertEqual(frozen_path.read_bytes(), frozen_bytes)


class MetadataRebindManifestDeltaTests(unittest.TestCase):
    NEW_GENERATOR_SHA = 'a' * 64
    R26 = {'pathConstraints': {'schema': 'r26-paths', 'revision': 12}}

    def old_manifest(self):
        return {
            'revision': 12,
            'pathConstraints': json.loads(json.dumps(self.R26['pathConstraints'])),
            'forwardTerrainProfile': {
                'profileId': 'act1-forward-20261007-v1',
                'generatorSha256': 'b' * 64,
                'gateReady': False,
            },
        }

    def emitted_manifest(self, old=None):
        result = json.loads(json.dumps(old if old is not None else self.old_manifest()))
        result['pathConstraints'] = json.loads(json.dumps(self.R26['pathConstraints']))
        result['forwardTerrainProfile']['generatorSha256'] = self.NEW_GENERATOR_SHA
        return result

    def test_accepts_current_exact_r26_constraints(self):
        old = self.old_manifest()
        changed = forward.validate_metadata_rebind_manifest_delta(
            old, self.emitted_manifest(old), self.R26, self.NEW_GENERATOR_SHA)
        self.assertEqual(changed, ['forwardTerrainProfile'])

    def test_accepts_adding_previously_absent_exact_r26_constraints(self):
        old = self.old_manifest()
        old.pop('pathConstraints')
        changed = forward.validate_metadata_rebind_manifest_delta(
            old, self.emitted_manifest(old), self.R26, self.NEW_GENERATOR_SHA)
        self.assertEqual(changed, ['forwardTerrainProfile', 'pathConstraints'])

    def test_rejects_unrelated_top_level_change(self):
        old = self.old_manifest()
        emitted = self.emitted_manifest(old)
        emitted['revision'] = 13
        with self.assertRaisesRegex(AssertionError, 'unexpected manifest fields'):
            forward.validate_metadata_rebind_manifest_delta(
                old, emitted, self.R26, self.NEW_GENERATOR_SHA)

    def test_rejects_nested_forward_profile_change(self):
        old = self.old_manifest()
        emitted = self.emitted_manifest(old)
        emitted['forwardTerrainProfile']['status'] = 'approved'
        with self.assertRaisesRegex(AssertionError, 'only forwardTerrainProfile.generatorSha256'):
            forward.validate_metadata_rebind_manifest_delta(
                old, emitted, self.R26, self.NEW_GENERATOR_SHA)

    def test_rejects_wrong_final_r26_constraints(self):
        old = self.old_manifest()
        emitted = self.emitted_manifest(old)
        emitted['pathConstraints'] = {'schema': 'wrong'}
        with self.assertRaisesRegex(AssertionError, 'exact pinned R26 pathConstraints'):
            forward.validate_metadata_rebind_manifest_delta(
                old, emitted, self.R26, self.NEW_GENERATOR_SHA)


if __name__ == '__main__':
    unittest.main()
