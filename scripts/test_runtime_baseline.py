#!/usr/bin/env python3

import tempfile
import unittest
from pathlib import Path

import runtime_baseline


class RuntimeBaselineTests(unittest.TestCase):
    def test_baseline_verifies(self) -> None:
        runtime_baseline.verify(runtime_baseline.BASELINE)

    def test_protected_monster_assets_match_frozen_runtime(self) -> None:
        shipped = runtime_baseline.files_under(
            runtime_baseline.BASELINE / "assets" / "monsters"
        )
        public = runtime_baseline.files_under(
            runtime_baseline.ROOT / "public" / "assets" / "monsters"
        )
        self.assertEqual(len(shipped), 75)
        self.assertEqual(set(public), set(shipped))
        for name, shipped_path in shipped.items():
            public_path = public[name]
            self.assertEqual(
                public_path.stat().st_size,
                shipped_path.stat().st_size,
                f"protected monster size differs from frozen runtime: {name}",
            )
            self.assertEqual(
                runtime_baseline.sha256(public_path),
                runtime_baseline.sha256(shipped_path),
                f"protected monster differs from frozen runtime: {name}",
            )

    def test_hydration_is_fail_closed_and_detects_tampering(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "dist"
            runtime_baseline.hydrate(output)
            with self.assertRaisesRegex(runtime_baseline.BaselineError, "refusing to overwrite"):
                runtime_baseline.hydrate(output)
            (output / "index.html").write_text("tampered\n", encoding="utf-8")
            with self.assertRaisesRegex(runtime_baseline.BaselineError, "size mismatch"):
                runtime_baseline.verify(output)


if __name__ == "__main__":
    unittest.main()
