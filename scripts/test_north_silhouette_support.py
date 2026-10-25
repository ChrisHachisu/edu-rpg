#!/usr/bin/env python3
"""Focused deterministic checks for the north silhouette and support collision union."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import struct
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

S = Path('/Users/chris/.codex/workspaces/edu-rpg-forward-20261007')
GEN_PATH = S / 'design/terrain-current-profile-20261007/generate_forward_profile.py'
RUNTIME = S / 'public/act1-hifi'
DQ = S / 'public/dq-tiles.js'

spec = importlib.util.spec_from_file_location('north_profile_generator', GEN_PATH)
gen = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(gen)


class NorthSilhouetteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.supports, cls.support_proof = gen.north_companion_upper_supports()

    def test_only_four_recipe_bound_connected_companion_tops(self):
        self.assertEqual(set(self.supports), gen.NORTH_SUPPORT_IDS)
        self.assertEqual(self.support_proof['connectedCropBoundaryOpaqueColumns'], 375)
        self.assertEqual(self.support_proof['lowerPixelIdentity'], 'exact')
        self.assertEqual(self.support_proof['adjacentProcessedCropBoundaryRows'], [299, 300])
        atlas = Image.open(gen.BUNDLE / 'atlases/companion-cliff-kit-imagegen-v2.png').convert('RGBA')
        full = atlas.crop((15, 0, 583, 1218)).resize((284, 609), Image.Resampling.NEAREST)
        rgba = np.asarray(full).copy()
        rgba[..., 3] = np.where(rgba[..., 3] >= 128, 255, 0).astype(np.uint8)
        processed = Image.fromarray(rgba)
        self.assertEqual(hashlib.sha256(processed.crop((0, 299, 284, 301)).tobytes()).hexdigest(),
                         self.support_proof['cropBoundaryRgbaSha256'])
        for stable_id, support in self.supports.items():
            self.assertEqual(support['image'].size, (284, 300), stable_id)

    def test_prefix_mask_clears_only_mountain_prefix_to_first_cliff(self):
        bounds = (16, 218, 19, 233)
        chunk = {'id': 'c0-r0', 'x': 0, 'y': 0, 'width': 64, 'height': 16}
        base = Image.new('RGBA', (128, 32), (12, 92, 36, 255))
        cliff = Image.new('RGBA', base.size, (0, 0, 0, 0))
        support = Image.new('RGBA', (128, 300), (0, 0, 0, 0))
        cliff.putpixel((5, 10), (180, 180, 180, 255))
        cliff.putpixel((110, 5), (180, 180, 180, 255))  # must not alter the water-owned cell
        support.putpixel((40, 0), (180, 180, 180, 255))
        masked, cut, stats = gen.apply_north_prefix_mask(base, cliff, support, 'MMMW', bounds, chunk)
        rgba = np.asarray(masked)
        original = np.asarray(base)
        self.assertEqual(int(rgba[0, 5, 3]), 0)
        self.assertEqual(int(cut[0, 5]), 1)
        self.assertEqual(int(rgba[10, 5, 3]), 255)  # first cliff pixel and everything below survive
        self.assertTrue(np.array_equal(rgba[10:, :, :], original[10:, :, :]))
        self.assertEqual(int(rgba[0, 40, 3]), 255)  # support reaches above this column
        self.assertEqual(int(rgba[0, 70, 3]), 255)  # no cliff contact in the bounded band
        self.assertEqual(int(rgba[0, 110, 3]), 255)  # water cell is untouched
        self.assertTrue(np.array_equal(rgba[:, :, :3], original[:, :, :3]))
        self.assertGreater(stats['columnsWithSupportAbovePlate'], 0)
        self.assertGreater(stats['mountainColumnsWithoutCliffInBand'], 0)

    def test_global_water_gap_mask_crosses_chunk_seam_and_preserves_enclosed_pocket(self):
        # Each 16-map-pixel chunk is 32 high-resolution pixels wide. The north-water
        # channel starts in the left chunk and reaches a candidate in the right chunk.
        left = Image.new('RGBA', (32, 32), (90, 80, 60, 255))
        right = Image.new('RGBA', (32, 32), (90, 80, 60, 255))
        la = np.asarray(left).copy(); ra = np.asarray(right).copy()
        # Four-neighbor channel: down at x=30, across x=30..34 through the seam,
        # then down in the right chunk. Keep contact pixels below it in both chunks.
        la[0:11, 30, 3] = 0
        la[10, 30:32, 3] = 0
        ra[10, 0:3, 3] = 0
        ra[10:21, 2, 3] = 0
        # A transparent enclosed pocket in a contacted owner-M column must stay ground.
        la[14:17, 8:11, 3] = 0
        left = Image.fromarray(la); right = Image.fromarray(ra)
        chunks = [
            ({'id': 'left', 'x': 0, 'y': 0, 'width': 16, 'height': 16}, left),
            ({'id': 'right', 'x': 16, 'y': 0, 'width': 16, 'height': 16}, right),
        ]
        alpha = gen.assemble_north_row_alpha(chunks, 64, 32)
        prefix = np.zeros((32, 64), dtype=np.uint8); prefix[0, 30] = 1
        opaque = np.ones((32, 64), dtype=bool)
        contact = np.full((32, 64), 255, dtype=np.uint8)
        cut, proof = gen.north_enclosed_gap_base_cut(
            alpha, contact, ['MM'], (16, 218, 17, 219), prefix, opaque, 1)
        self.assertEqual(cut.shape, (32, 64))
        self.assertEqual(proof['connectivity'], 4)
        self.assertTrue(bool(cut[20, 34]))  # reachable only through the cross-chunk channel
        self.assertFalse(bool(cut[15, 9]))  # enclosed pocket remains opaque base beneath it
        self.assertEqual(int(cut[20, 34]), 1)

        # A connected branch can cross into a chunk that has no old-prefix pixels.
        # Exercise the production persistence predicate and WebP writer for that chunk.
        right_base = Image.new('RGBA', (32, 32), (90, 80, 60, 255))
        no_right_prefix = np.zeros((32, 32), dtype=np.uint8)
        right_masked, _, right_stats = gen.apply_north_enclosed_gap_cut(
            right_base, no_right_prefix, cut[:, 32:])
        self.assertEqual(right_stats['existingPrefixCutPixels'], 0)
        self.assertGreater(right_stats['northConnectedNewlyClearedBasePixels'], 0)
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / 'right-neighbor.webp'
            persist_stats = {'clearedBasePixels': 0, **right_stats}
            self.assertTrue(gen.persist_north_masked_base(target, right_masked, persist_stats))
            saved = Image.open(target).convert('RGBA')
            self.assertEqual(saved.getpixel((2, 20))[3], 0)
            unchanged_target = Path(tmp) / 'unchanged.webp'
            self.assertFalse(gen.persist_north_masked_base(
                unchanged_target, right_base, {'clearedBasePixels': 0,
                                               'northConnectedNewlyClearedBasePixels': 0}))
            self.assertFalse(unchanged_target.exists())

    def test_connected_cut_is_owner_bounded_contact_bounded_and_alpha_only(self):
        alpha = np.full((64, 64), 255, dtype=np.uint8)
        # A contacted channel remains eligible in M at its actual world row.
        alpha[0:12, 4] = 0; alpha[12, 4:8] = 0; alpha[12:18, 7] = 0
        alpha[0:42, 43] = 0
        # This all-transparent column has no cliff contact and keeps the established
        # no-contact/leave-base-opaque behavior.
        alpha[:, 20] = 0
        prefix = np.zeros((64, 64), dtype=np.uint8); prefix[0, 4] = 1; prefix[0, 43] = 1; prefix[0, 20] = 1
        contact = np.full((64, 64), 255, dtype=np.uint8); contact[:, 20] = 0
        alpha_before = alpha.copy(); contact_before = contact.copy(); prefix_before = prefix.copy()
        cut, _ = gen.north_enclosed_gap_base_cut(
            alpha, contact, ['MM', 'MW'], (16, 218, 17, 219), prefix,
            np.ones((64, 64), dtype=bool), 2)
        self.assertTrue(bool(cut[17, 7]))
        self.assertFalse(bool(cut[40, 43]))  # row 1 is water despite row 0 being M
        self.assertFalse(bool(cut[17, 20]))
        self.assertEqual(cut.shape[0], 64)

        base = Image.new('RGBA', (64, 64), (116, 184, 11, 255))
        base_before = np.asarray(base).copy()
        masked, combined, stats = gen.apply_north_enclosed_gap_cut(base, prefix, cut)
        before = np.asarray(base); after = np.asarray(masked)
        self.assertTrue(np.array_equal((combined & prefix) != 0, prefix != 0))
        self.assertEqual(int(after[17, 7, 3]), 0)
        self.assertEqual(int(after[40, 43, 3]), 255)
        self.assertEqual(int(after[17, 20, 3]), 255)
        self.assertTrue(np.array_equal(after[:, :, :3], before[:, :, :3]))
        self.assertTrue(np.array_equal(after[32:], before[32:]))
        self.assertTrue(np.array_equal(np.asarray(base), base_before))
        self.assertTrue(np.array_equal(alpha, alpha_before))  # raised layer is read-only
        self.assertTrue(np.array_equal(contact, contact_before))
        self.assertTrue(np.array_equal(prefix, prefix_before))
        self.assertEqual(stats['existingPrefixCutPixels'], 3)
        self.assertEqual(stats['northConnectedNewlyClearedBasePixels'], int(cut.sum()))

    def test_candidates_touching_band_bottom_or_plate_side_are_rejected(self):
        alpha = np.full((32, 64), 255, dtype=np.uint8)
        alpha[0:32, 8] = 0                 # reaches the approved band bottom
        alpha[12, 0:4] = 0                # reaches the global plate side
        prefix = np.zeros((32, 64), dtype=np.uint8)
        prefix[0, 8] = 1; prefix[12, 4] = 1
        cut, proof = gen.north_enclosed_gap_base_cut(
            alpha, np.full_like(alpha, 255), ['MM'], (16, 218, 17, 219), prefix,
            np.ones((32, 64), dtype=bool), 1)
        self.assertEqual(int(cut.sum()), 0)
        self.assertEqual(proof['rejectedBandBottomComponents'], 1)
        self.assertEqual(proof['rejectedPlateSideComponents'], 1)

    def test_real_c5_enclosed_gap_is_seeded_and_c9_band_edge_stays_unchanged(self):
        # Use the preserved generation-v3 output as the immutable before-image. Public
        # assets may be refreshed later; this regression stays bound to its source input.
        root = S / 'design/terrain-current-profile-20261007/generated-output/act1-hifi'
        manifest = json.loads((root / 'manifest.json').read_text())
        chunks = sorted((c for c in manifest['chunks'] if c['y'] == 0), key=lambda c: c['x'])
        alpha_layers = []
        candidate_base = None
        for c in chunks:
            layer = Image.open(root / c['forest']).convert('RGBA')
            alpha_layers.append((c, layer))
            if c['id'] == 'c5-r0': candidate_base = Image.open(root / c['base']).convert('RGBA')
        self.assertIsNotNone(candidate_base)
        collision_path = RUNTIME / 'forest-collision.bin'
        collision_before = hashlib.sha256(collision_path.read_bytes()).hexdigest()
        alpha = gen.assemble_north_row_alpha(alpha_layers, gen.W, gen.NORTH_PREFIX_BAND_CELLS * 32)
        owner = json.loads((GEN_PATH.parent / 'current/owner-terrain.json').read_text())['acts']['1']
        top_row = owner['terrainRows'][0]
        self.assertEqual(top_row[110 - 16], 'M')
        x0 = 1280 * 2
        target_x = x0 + 473
        target_ys = range(61, 65)
        for y in target_ys:
            base_pixel = candidate_base.getpixel((473, y))
            self.assertEqual(base_pixel[3], 255)
            self.assertGreater(base_pixel[1], base_pixel[0] * 1.2)
            self.assertEqual(int(alpha[y, target_x]), 0)
        prefix = np.zeros((gen.NORTH_PREFIX_BAND_CELLS * 32, gen.W), dtype=np.uint8)
        opaque = np.ones_like(prefix, dtype=bool)
        for c in chunks:
            x0 = int(c['x']) * 2
            base = Image.open(root / c['base']).convert('RGBA')
            b = np.asarray(base)
            h = min(prefix.shape[0], b.shape[0])
            opaque[:h, x0:x0+b.shape[1]] = b[:h, :, 3] > 0
            prefix[:h, x0:x0+b.shape[1]] = (b[:h, :, 3] == 0).astype(np.uint8)
        owner_rows = owner['terrainRows'][:gen.NORTH_PREFIX_BAND_CELLS]
        cut, proof = gen.north_enclosed_gap_base_cut(
            alpha, alpha, owner_rows, tuple(owner['bounds']), prefix, opaque)
        self.assertTrue(all(bool(cut[y, target_x]) for y in target_ys))
        self.assertFalse(np.any(cut[220:256, 4644:4679]))  # c9 lower shoreline stays untouched
        self.assertEqual(int(cut[255].sum()), 0)  # no new branch reaches the band bottom
        self.assertGreater(proof['candidateComponents'], 0)
        self.assertEqual(hashlib.sha256(collision_path.read_bytes()).hexdigest(), collision_before)
        # Independent component labeling confirms the target transparency reaches row zero.
        from scipy.ndimage import generate_binary_structure, label
        labels, _ = label(alpha[:gen.NORTH_PREFIX_BAND_CELLS * 32] == 0,
                          structure=generate_binary_structure(2, 1))
        target_label = labels[61, target_x]
        self.assertNotEqual(int(target_label), 0)
        self.assertTrue(np.any(labels[0] == target_label))

    def test_support_union_adds_only_1414_in_map_bits(self):
        raw = (RUNTIME / 'forest-collision.bin').read_bytes()
        manifest = json.loads((RUNTIME / 'manifest.json').read_text())
        self.assertEqual(hashlib.sha256(raw).hexdigest(), manifest['collision']['sha256'])
        self.assertEqual(raw[:8], b'QOKF8COL')
        self.assertEqual(struct.unpack_from('<HHIII', raw, 8), (1, 64, gen.W, gen.H, 32))
        before = np.unpackbits(np.frombuffer(raw[64:], dtype=np.uint8), bitorder='little')[:gen.W * gen.H]
        before = before.reshape((gen.H, gen.W)).astype(bool)
        support, proof = gen.north_support_collision_mask(
            self.supports, (16, 218, 163, 399), before)
        after = before | (support > 0)
        changed = after & ~before
        composed = manifest.get('northSupport', {}).get('collisionUnion')
        if composed:
            # After sanctioned assembly the source QOK already contains the union.
            self.assertEqual(int(changed.sum()), 0)
            self.assertEqual(composed['newCollisionPixels'], 1414)
            self.assertEqual(composed['postUnionPackedBitsSha256'],
                             '4d1a5b9b505b5a01c2e6910937fdb59e7cd8729a823f853a4c255c25273621d1')
        else:
            self.assertEqual(int(changed.sum()), 1414)
            self.assertEqual(proof['newCollisionPixels'], 1414)
            yy, xx = np.where(changed)
            self.assertEqual([int(xx.min()), int(yy.min()), int(xx.max()), int(yy.max())], [3033, 0, 3287, 63])
        self.assertEqual(proof['supportAlphaPixelsInsideMap'], 11479)
        after_bytes = np.packbits(after.ravel().astype(np.uint8), bitorder='little').tobytes()
        self.assertEqual(hashlib.sha256(after_bytes).hexdigest(),
                         '4d1a5b9b505b5a01c2e6910937fdb59e7cd8729a823f853a4c255c25273621d1')
        self.assertTrue(np.array_equal(after & before, before))
        self.assertTrue(np.array_equal(changed, (support > 0) & ~before))
        for p in proof['placements']:
            if p['id'] != 'fill-04-right-pocket-mass-B-110':
                self.assertEqual(p['newCollisionPixels'], 0, p['id'])
        # The checked-in runtime may already contain the sanctioned union. In that
        # case the support placement contributes zero new bits; the exact post-union
        # plane hash above remains the proof of the 1,414-bit union.
        if not composed:
            self.assertEqual(proof['placements'][1]['newCollisionPixels'], 1414)

    def test_runtime_streams_renders_and_releases_north_layer(self):
        src = DQ.read_text()
        checks = [
            "var A1A_LAYERS=['base','canopy','water','forest','north']",
            "k!=='north'||!!(m.northSupport&&m.northSupport.schema==='north-cliff-overhang-v1')",
            "['base','water','canopy','forest','north'].forEach(function(layer)",
            "a1aNorthHeight(c)",
            "if(rs[n].rec.north) a1aDrawNorthLayer",
            "['north',A1A_CANOPY_DEPTH,northScaleX,northScaleY,1]",
            "if(layer==='north'&&!rec.north) continue",
        ]
        for text in checks:
            self.assertIn(text, src)
        self.assertGreaterEqual(src.count('var northHit='), 2)

    def test_underpaint_prefix_mask_preserves_rgb_and_pixels_below_band(self):
        base = Image.new('RGBA', (888, 1092), (36, 112, 55, 255))
        cut = np.zeros((gen.NORTH_PREFIX_BAND_CELLS * 32, gen.W), dtype=np.uint8)
        cut[0:8, 0:8] = 1
        out = np.asarray(gen.apply_north_prefix_mask_6ppc(base, cut))
        before = np.asarray(base)
        self.assertEqual(int(out[0, 0, 3]), 0)
        self.assertTrue(np.array_equal(out[:, :, :3], before[:, :, :3]))
        self.assertTrue(np.array_equal(out[gen.NORTH_PREFIX_BAND_CELLS * 6:], before[gen.NORTH_PREFIX_BAND_CELLS * 6:]))

    def test_full_height_chunk_cut_merges_only_inside_global_prefix_band(self):
        destination = np.zeros((gen.NORTH_PREFIX_BAND_CELLS * 32, gen.W), dtype=np.uint8)
        local = np.zeros((512, 512), dtype=np.uint8)
        local[255, 7] = 1
        gen.merge_north_prefix_cut(destination, local, 512)
        self.assertEqual(int(destination[255, 519]), 1)
        self.assertEqual(int(destination.sum()), 1)
        too_tall = local.copy()
        too_tall[256, 7] = 1
        with self.assertRaisesRegex(AssertionError, 'below bounded global band'):
            gen.merge_north_prefix_cut(destination, too_tall, 1024)
        with self.assertRaisesRegex(AssertionError, 'overlap'):
            gen.merge_north_prefix_cut(destination, local, 512)

    def test_webp_hidden_rgb_is_ignored_but_alpha_and_visible_rgb_are_exact(self):
        reference = Image.new('RGB', (4, 3), (31, 72, 118))
        prefix_cut = np.zeros((3, 4), dtype=np.uint8)
        prefix_cut[0, 1] = 1
        join = reference.convert('RGBA')
        pixels = np.asarray(join).copy()
        pixels[0, 1, :3] = (199, 5, 211)  # lossless WebP may zero/canonicalize hidden RGB
        pixels[0, 1, 3] = 0
        join = Image.fromarray(pixels, 'RGBA')
        proof = gen.assert_ground_join_matches(join, reference, prefix_cut, 0, 0, 'fixture')
        self.assertEqual(proof['transparentPixels'], 1)
        self.assertEqual(proof['visibleRgbPixels'], 11)

        bad_alpha = np.asarray(join).copy()
        bad_alpha[0, 1, 3] = 255
        with self.assertRaisesRegex(AssertionError, 'alpha differs'):
            gen.assert_ground_join_matches(Image.fromarray(bad_alpha, 'RGBA'), reference,
                                           prefix_cut, 0, 0, 'bad-alpha')

        bad_visible_rgb = np.asarray(join).copy()
        bad_visible_rgb[1, 1, 0] ^= 1
        with self.assertRaisesRegex(AssertionError, 'visible ground RGB differs'):
            gen.assert_ground_join_matches(Image.fromarray(bad_visible_rgb, 'RGBA'), reference,
                                           prefix_cut, 0, 0, 'bad-visible-rgb')

    def test_b110_support_stays_above_plate_and_expands_in_shared_contact_order(self):
        sid = 'fill-04-right-pocket-mass-B-110'
        support = self.supports[sid]['image']
        rendered = gen.render_north_support_chunk(
            {'id': 'c5-r0', 'x': (110 - 16) * 16, 'y': 0, 'width': 256, 'height': 256},
            (16, 218, 163, 399), {sid: self.supports[sid]})
        rendered_alpha = np.asarray(rendered.getchannel('A'))
        support_alpha = np.asarray(support.getchannel('A'))
        self.assertTrue(np.all(rendered_alpha[:64] == 0))
        self.assertTrue(np.array_equal(rendered_alpha[64:, :284], support_alpha[:236]))
        self.assertTrue(np.all(rendered_alpha[:, 284:] == 0))

        lower = Image.new('RGBA', (284, 309), (74, 103, 131, 255))
        original = {'id': 'north:' + sid, 'kind': 'north-fill',
                    'record': {'id': sid, 'originWorldCell': [110, 220]},
                    'image': lower, 'x': (110 - 16) * 32, 'y': 64,
                    'contact': ((110 - 16) * 32 + 232, 318),
                    'sourceOrigin': (110, 220), 'sourceName': 'right-pocket-mass-B'}
        earlier = dict(original, id='ridge-before', record={'id': 'ridge-before'}, contact=(0, 307), sourceOrigin=(112, 218), sourceName='main-A')
        later = dict(original, id='ridge-after', record={'id': 'ridge-after'}, contact=(0, 339), sourceOrigin=(113, 219), sourceName='main-A-113')
        expanded_events, proof = gen.expand_north_contact_event(
            [earlier, original, later], {sid: self.supports[sid]}, sid)
        expanded = expanded_events[1]
        self.assertEqual(expanded['image'].size, (284, 609))
        self.assertEqual(expanded['y'], -236)
        self.assertTrue(np.array_equal(np.asarray(expanded['image'].crop((0, 300, 284, 609))),
                                       np.asarray(lower)))
        self.assertEqual(expanded['contact'], original['contact'])
        self.assertEqual(gen.event_sort_key(expanded), gen.event_sort_key(original))
        self.assertEqual([e['id'] for e in sorted(expanded_events, key=gen.event_sort_key)],
                         ['ridge-before', 'north:' + sid, 'ridge-after'])
        self.assertTrue(proof['lowerPixelsExact'])
        self.assertEqual(proof['originalContact'][1], 318)

    def test_actual_north_recipe_shared_y_overlap_is_failable(self):
        ctx = gen.make_context()
        proof = ctx['northSharedYProof']
        self.assertFalse(ctx.get('preflightFailed', False))
        self.assertEqual(proof['originalContact'], [3240, 318])
        self.assertEqual(proof['expandedSortKey'], proof['originalSortKey'])
        self.assertEqual(proof['inMapSupportPixels'], 11479)
        self.assertEqual(proof['overlapBaselinePixels'], 10065)
        self.assertEqual(proof['newVisibleAndCollisionPixels'], 1414)
        self.assertEqual(proof['inMapRenderedColorChangedPixels'], 9650)
        self.assertEqual(proof['changesOutsideSupportPixels'], 0)
        self.assertEqual([(e['contactY'], e['id']) for e in proof['overlapEventsByContactY']], [
            (254, 'north:ridge-04-broad-joining-mass-B-106'),
            (277, 'cliff:main|interior-rock-panel|113,218'),
            (307, 'north:ridge-05-broad-joining-mass-A-112'),
            (339, 'cliff:main|broad-joining-mass-A|113,219'),
        ])
        self.assertEqual(proof['orderAnchorAfter'], [307])
        self.assertEqual(proof['orderAnchorBefore'], [339])


if __name__ == '__main__':
    unittest.main(verbosity=2)
