# Independent r6 source and regeneration review

## Reviewed identities

- Generator: `design/terrain-current-profile-20261007/generate_forward_profile.py` SHA-256 `b650102ac3b6646243437a7181fd9e59546e0b4879c35fa9b8c81131d560ab05`.
- North-gap strict validator: `scripts/terrain_current_profile.py` SHA-256 `2931cfd37bfdbcff0ae5648e93aa268efd1c212ce5c9bba073548fa6b2856b07`.
- Tests: `scripts/test_terrain_current_profile.py` SHA-256 `10c79cc4bc67745cc396af2f26220578a5d36129d25f584bf087b42631af4db3`.

## Findings

- The runtime `northSupport` schema no longer includes `groundCacheMaskRebuild`; the complete audit remains in the output receipt. Regression coverage explicitly rejects the audit field if added to runtime manifest. This preserves the strict runtime schema and keeps cache-history metrics out of the deterministic manifest.
- The seven current-input north-gap totals are pinned exactly and all other schema, arithmetic, type, geometry, ownership, seam, and legacy-absence checks remain strict. The full terrain-profile unittest suite passed 27/27; `git diff --check` passed.
- I independently passed both r6 manifests through `validate_optional_north_support`; each returned `c4-r0`, `c5-r0`, `c6-r0`.
- Both outputs verify against their 493-entry inventories (zero missing, mismatched, or unlisted files). Regeneration comparison reports `PASS`, exact path sets and byte hashes, and `gateReady=false` / `nativeVerified=false`. Comparison SHA-256: `f5a919adcc0f4091f5b8f19d4dcf011543c9a8d80d5ed12d7b1fa955a0128b77`.
- A and B have identical inventories. Compared with reviewed r5, A changes exactly one inventory item: `public/act1-hifi/manifest.json`. Structural manifest differences are only the expected generator SHA rebinding and removal of `northSupport.groundCacheMaskRebuild`. Therefore the r5 generated overview/crops, raised art, collision, ground, water, canopy, and other evidence bytes remain exact; the prior static visual review still applies to r6 output bytes.
- Both receipts retain identical cache-mask audit: all ten top-row bases and underpaint rebuilt from current ground; c9-r0 has 829 restored old cut pixels and 6,436 current-mask additions; the other nine top chunks have zero mask delta.

Receipt identities:

- A: `5b318fed7e0365e7ccfb20f3615eb78119809e71176446104d06c50e157e8b55`
- B: `5eee17fc4c4cfd5d7b36b5bae744c340f739e06e011e4b0d3b8e91e442e026b7`

## Acceptance boundary

The output is now a repeatable, statically validated QA-preparation candidate. It remains `gateReady=false` and `nativeVerified=false`; no runtime, app-copy, device, or release acceptance follows from this review.
