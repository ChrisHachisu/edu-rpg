# Independent bounded north-gap review — 2026-10-10

## Result

PASS for the reviewed generator/test delta and its bounded composite evidence. This is a static review only; it does not establish a fresh generated package, runtime behavior, native rendering, or release acceptance.

## Reviewed inputs

- Generator: `design/terrain-current-profile-20261007/generate_forward_profile.py` — SHA-256 `95187a9c632e0b6678c04e75614b28f1268dbed9f79f4dfcb4944351767e8af1`.
- Focused test: `scripts/test_north_silhouette_support.py` — SHA-256 `f8266e456965ff54e1c3b111bd5cdbdcb196617801eea8a8bb8f72b4fd0cf1c9`.
- Comparison baseline: preserved generator at `north-perimeter-repair-20261010/pre-renderer-integration-backup-20261010/design/terrain-current-profile-20261007/generate_forward_profile.py` — SHA-256 `40e5c1bc30ca0b1885c4aec39356c16f06ae73985d317414b685b26b8db06cfd`.

The exact `5ab926...` baseline mentioned in earlier handoff was not available in the preserved backup. This review therefore compares to the verified `40e5c1bc...` source and treats the previously reviewed A1OW pin/rebind changes as carried scope; it does not claim a byte-diff against `5ab926...`.

## Findings and checks

The north-gap mask remains globally 4-connected across chunk seams, restricted to transparent raised-layer pixels over opaque base, owner-M at each candidate pixel's world row, and columns with cliff/north contact. A candidate component must neighbor the preserved north prefix and is rejected if it reaches the approved band bottom or plate side. The alpha cut preserves RGB and is mirrored into the coarse underpaint mask. The production persistence gate now writes when either the existing prefix cut or newly cleared connected-gap pixels are nonzero.

The cross-seam test includes a right-hand chunk with zero old-prefix pixels, exercises the production persistence helper, reloads the lossless WebP, and checks both the newly cleared pixel and the no-op write path. The test suite passed **13/13** with `python3 scripts/test_north_silhouette_support.py`; `python3 -m py_compile` passed for the generator and focused test. Existing ResourceWarning/Pillow deprecation warnings were non-failing.

Inspected the complete c3–c9 before/after changed-region sheet and its component inventory. The sampled changed regions showed no evident discontinuity or stray cut. This is prototype/composite evidence, not a production viewport.

- Contact sheet: `bounded-branch-all-components-c3-c9.png` — SHA-256 `d2c51fac908b5e476f37884e67fad0ee51935691666b82013bbf6eeec9e8c2a8`.
- Component inventory: `bounded-branch-all-components-c3-c9.json` — SHA-256 `a5c5d992163bb55635a1ca293d02b4c1e25df8e9cf095d3678b1ecd11bd31e75`.
