#!/usr/bin/env python3

import tempfile
import unittest
from pathlib import Path

import runtime_baseline


class RuntimeBaselineTests(unittest.TestCase):
    def test_baseline_verifies(self) -> None:
        runtime_baseline.verify(runtime_baseline.BASELINE)

    def test_candidate_snapshot_verifies(self) -> None:
        runtime_baseline.verify_candidates()

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
