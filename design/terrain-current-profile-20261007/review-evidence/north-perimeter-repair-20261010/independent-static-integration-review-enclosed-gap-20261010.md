# Independent static integration review — north enclosed-gap closure — 2026-10-10

## Result

PASS for the reviewed static integration and the optional manifest-validator extension. This receipt/report covers QA preparation only. Native dynamic gates remain pending and `releaseEligible` remains false.

## Reviewed code

- Generator: `design/terrain-current-profile-20261007/generate_forward_profile.py`, SHA-256 `95187a9c632e0b6678c04e75614b28f1268dbed9f79f4dfcb4944351767e8af1`.
- Focused generator tests: `scripts/test_north_silhouette_support.py`, SHA-256 `f8266e456965ff54e1c3b111bd5cdbdcb196617801eea8bb8f72b4fd0cf1c9`.
- Profile validator: `scripts/terrain_current_profile.py`, pre-pin SHA-256 `ed5c1f79c91c8a9322904e495cfa9a2780328cf0c332ddfcc29c716f7106c2a3`; pin-normalized logic SHA-256 `15655dcc75bb872438653479826196bfd19aeeeb1b6e16d7ad17619914da8529` (normalization replaces only the `PINNED_DESCRIPTOR_SHA256` literal).
- Profile validator tests: `scripts/test_terrain_current_profile.py`, SHA-256 `eccb5d7a8e8f392702b33d43d45db02115fea93afdadb59f44ea57713168c970`.

The new optional `northEnclosedWaterGapMask` validator accepts the exact reviewed extension values and arithmetic only, binds its acceptance to the reviewed full R26 geometry and ten top-row chunk IDs, and preserves the old extension-free northSupport v1 path. Existing strict unknown-key, unsupported-schema, orphan reference, unsafe path, geometry, and output-inventory checks remain in place. Focused negative cases reject changed schema, connectivity, band, owner policy, totals, boolean-as-integer, seam assertion, and wrong R26 bounds.

## Verification

- `python3 -m unittest scripts.test_terrain_current_profile -v`: **27/27 PASS**.
- `python3 -m py_compile scripts/terrain_current_profile.py scripts/test_terrain_current_profile.py`: **PASS**.
- All 258 authoring-input rows and 493 generated-output rows in the staged descriptor matched their current files by size and SHA during review. The descriptor/output inventory closure is independently rechecked by the typed preparation receipt; the final descriptor pin is deliberately omitted here to avoid a report/descriptor hash cycle.
- Reviewed the two clean generation receipts, full output audit and regeneration comparison. All 493 actual A/B listed files rehashed to their receipt rows; A/B outputs match with only `generationLabel` differing. Against the accepted inventory, the audit identifies exactly seven top-row bases c3–c9, manifest, coarse underpaint and FM overview as changed.
- Decoded c3–c9 output pixels match the 4,026-pixel accepted mask exactly: 4,026 added alpha cuts, zero restores, zero visible RGB mismatches; 4,025 differences are hidden RGB canonicalization beneath newly transparent pixels. c5 target is cleared; c9 y=220–255 remains decoded RGBA-identical. The coarse underpaint changes exactly 132 projected alpha pixels with RGB unchanged, as pinned by the audit.
- Current source identities were confirmed: `public/dq-tiles.js` SHA-256 `2012fbce196d2c1ed2b62a1bb09cb8325292da35ca9d2a4b2f93542a5e5167ac`; frozen JS bundle SHA-256 `ab4fc9ad1204f23b4ea55dbae2d72bdf193a52e643271bcfe8642e2210556456`; A1OW SHA-256 `00a520ae09089547ca4af4ef1077b84acdad98d4989de238f3ee30e28ad092c6`; collision SHA-256 `25205f87df9f3182037bc02080879ce3367be894544a670449b5675bb4c956bc`.

## Bound evidence

- Bounded generator review: `design/terrain-current-profile-20261007/review-evidence/north-perimeter-repair-20261010/independent-bounded-north-gap-review-20261010.md`, SHA-256 `99a4372081e316bbac40c287d239ea53236d1347f8534260aeced50547eb36a2`.
- Full generation output review: `design/terrain-current-profile-20261007/review-evidence/north-perimeter-repair-20261010/independent-full-generation-output-review-20261010.md`, SHA-256 `efdeaf0227fa2d2fc5a701bc1cf3b87b1938212bb43f8f597446165f07dbe701`.
- Full generation audit SHA-256 `80f825c0730771605bef9b3fd61c381d24a56404941c570274dc2e9ca6aefb68`.
- Two-root regeneration comparison SHA-256 `36648d40429a70e9c74eb899c7de46b3b6463b9a1df05dd32b86dde307342a40`.
- c3–c9 changed-region contact sheet SHA-256 `d2c51fac908b5e476f37884e67fad0ee51935691666b82013bbf6eeec9e8c2a8`; component inventory SHA-256 `a5c5d992163bb55635a1ca293d02b4c1e25df8e9cf095d3678b1ecd11bd31e75`.

The generated overview still identifies six retained accepted-natural residual pixels in three disconnected components (2, 1 and 3 pixels), also present in the accepted baseline. This review does not claim every fleck is gone. No native runtime or physical-device claim is made.
