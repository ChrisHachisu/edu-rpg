from __future__ import annotations

import sys
import unittest
import importlib.util
from pathlib import Path

import numpy as np

PROFILE = Path(__file__).resolve().parents[1] / "design/terrain-current-profile-20261007"
sys.path.insert(0, str(PROFILE))
from water_r2 import compose_water_layer, promote_exact_semantic_water, sample_world_phase

GENERATOR_PATH = PROFILE / "generate_forward_profile.py"
GENERATOR_SPEC = importlib.util.spec_from_file_location("water_r2_generator_test", GENERATOR_PATH)
GENERATOR = importlib.util.module_from_spec(GENERATOR_SPEC)
GENERATOR_SPEC.loader.exec_module(GENERATOR)


class WaterR2SamplerTests(unittest.TestCase):
    def setUp(self):
        y, x = np.indices((11, 13), dtype=np.uint8)
        self.texture = np.dstack((x, y, x ^ y))

    def test_neighboring_chunks_share_exact_global_phase(self):
        full = compose_water_layer(self.texture, np.ones((64, 96)), 32, 218)
        left = compose_water_layer(self.texture, np.ones((64, 64)), 32, 218)
        right = compose_water_layer(self.texture, np.ones((64, 32)), 34, 218)
        self.assertTrue(np.array_equal(full[:, :64], left))
        self.assertTrue(np.array_equal(full[:, 64:], right))

    def test_mask_alpha_is_preserved_and_density_is_exact(self):
        mask = np.array([[0.0, 0.5, 1.0]], dtype=np.float32)
        layer = compose_water_layer(self.texture, mask, 16, 218)
        self.assertEqual(layer.shape, (1, 3, 4))
        self.assertEqual(layer[0, :, 3].tolist(), [0, 128, 255])
        with self.assertRaisesRegex(ValueError, "divide output density"):
            sample_world_phase(self.texture, np.array([0]), np.array([0]),
                               texels_per_cell=96, pixels_per_cell=20)

    def test_sampler_uses_world_origin_and_global_modulo(self):
        sample = sample_world_phase(self.texture, np.array([0, 1, 2]), np.array([0, 0, 0]))
        expected = self.texture[np.array([0, 0, 0]), np.array([0, 3, 6])]
        self.assertTrue(np.array_equal(sample, expected))

    def test_exact_semantic_water_becomes_opaque_without_changing_land_or_shore_weights(self):
        coverage = np.array([[0.2, 0.4, 0.0], [0.75, 0.3, 1.0]], dtype=np.float32)
        exact_water = np.array([[True, False, False], [False, True, False]])
        adjusted = promote_exact_semantic_water(coverage, exact_water)
        self.assertEqual(adjusted[0, 0], 1.0)
        self.assertEqual(adjusted[1, 1], 1.0)
        self.assertTrue(np.array_equal(adjusted[~exact_water], coverage[~exact_water]))
        layer = compose_water_layer(self.texture, adjusted, 64, 218)
        self.assertEqual(int(layer[0, 0, 3]), 255)
        self.assertEqual(int(layer[0, 1, 3]), 102)
        self.assertEqual(int(layer[0, 2, 3]), 0)
        self.assertEqual(int(layer[1, 0, 3]), 191)
        self.assertEqual(int(layer[1, 1, 3]), 255)

    def test_exact_water_floor_preserves_phase_across_chunk_edges(self):
        coverage = np.full((3, 64), 0.25, dtype=np.float32)
        exact_water = np.zeros_like(coverage, dtype=bool)
        exact_water[0, [7, 31, 32, 58]] = True
        exact_water[2, [0, 30, 33, 63]] = True
        adjusted = promote_exact_semantic_water(coverage, exact_water)
        full = compose_water_layer(self.texture, adjusted, 32, 218)
        left = compose_water_layer(self.texture, adjusted[:, :32], 32, 218)
        right = compose_water_layer(self.texture, adjusted[:, 32:], 33, 218)
        self.assertTrue(np.array_equal(full[:, :32], left))
        self.assertTrue(np.array_equal(full[:, 32:], right))
        self.assertTrue(np.array_equal(full[..., 3], np.where(exact_water, 255, 64).astype(np.uint8)))

    def test_profile_renderer_uses_r4_smoothed_weights_at_32ppc(self):
        class Renderer:
            def __init__(self):
                self.call = None

            def _weights(self, x, y, width, height, ppc):
                self.call = (x, y, width, height, ppc)
                return {"water": np.ones((height, width), dtype=np.float32)}

        renderer = Renderer()
        image = GENERATOR.render_water_r2(renderer,
            {"id": "c-test", "x": 32 * 16, "y": 0,
             "width": 16 * 16, "height": 16 * 16}, self.texture, [16, 218],
             np.zeros((512, 512), dtype=bool))
        self.assertEqual(renderer.call, (32, 0, 512, 512, 32))
        self.assertEqual(image.size, (512, 512))
        rgba = np.asarray(image)
        self.assertTrue(np.all(rgba[..., 3] == 255))
        self.assertTrue(np.array_equal(rgba[0, 0, :3], self.texture[(218 * 96) % 11, (48 * 96) % 13]))

    def test_north_backing_mask_adds_coverage_without_changing_global_texture_phase(self):
        class Renderer:
            def _weights(self, x, y, width, height, ppc):
                return {"water": np.zeros((height, width), dtype=np.float32)}

        mask = np.zeros((512, 512), dtype=np.uint8)
        mask[21, 35] = 1
        image = GENERATOR.render_water_r2(Renderer(),
            {"id": "c-test", "x": 16 * 16, "y": 0, "width": 16 * 16, "height": 16 * 16},
            self.texture, [16, 218], np.zeros((512, 512), dtype=bool), mask)
        rgba = np.asarray(image)
        self.assertEqual(int(rgba[21, 35, 3]), 255)
        self.assertEqual(int(np.count_nonzero(rgba[..., 3])), 1)
        self.assertTrue(np.array_equal(
            rgba[21, 35, :3], self.texture[(218 * 96 + 21 * 3) % 11, (32 * 96 + 35 * 3) % 13]))

    def test_profile_renderer_floors_exact_water_only_and_leaves_nonwater_semantics(self):
        class Renderer:
            def _weights(self, x, y, width, height, ppc):
                weights = np.full((height, width), 0.25, dtype=np.float32)
                weights[0, 0] = 0.2
                return {"water": weights}

        exact_water = np.zeros((512, 512), dtype=bool)
        exact_water[0, 0] = True
        image = GENERATOR.render_water_r2(Renderer(),
            {"id": "c-test", "x": 16 * 16, "y": 0, "width": 16 * 16, "height": 16 * 16},
            self.texture, [16, 218], exact_water)
        rgba = np.asarray(image)
        self.assertEqual(int(rgba[0, 0, 3]), 255)
        self.assertEqual(int(rgba[0, 1, 3]), 64)
        self.assertEqual(int(rgba[1, 0, 3]), 64)
        self.assertTrue(np.array_equal(
            rgba[0, 1, :3], self.texture[(218 * 96) % 11, (32 * 96 + 3) % 13]))


if __name__ == "__main__":
    unittest.main()
