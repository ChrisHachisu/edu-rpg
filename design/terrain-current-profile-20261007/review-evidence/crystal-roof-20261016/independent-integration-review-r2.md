# Independent Crystal Cave metadata integration review r2

**Result: PASS for static QA preparation and the metadata-only integration. Native acceptance remains pending.** This report is separate from the static source/contact review and does not claim a current app, simulator, or device pass.

## Reviewed identity and preserved evidence

- Current `public/dq-tiles.js` and `dist/dq-tiles.js` are byte-identical, SHA-256 `a7e267a5c2d2d1061af7f66956d82853b42f00c82c1f63baf043defbeb1b2a43` (602,923 bytes).
- The versioned full A1OW integration wrapper is `a1ow-source-equivalence-integration-v2.json`, SHA-256 `d64a58fe6f5adff50d14fb457a4ce156a4be1e8aa3ce113fbbca74a78564a28b`. Its nested Crystal DQ projection is exactly equal to the separately pinned source-only review (`a1ow-source-equivalence.json`, SHA-256 `28ca32f73147f9d2e9868b4cd1f847537c9d9fbf2351f10dbb26471066ac5df7`). The previous complete A1OW wrapper remains unchanged at `48d66cea69463ab2edf4e296db0a5d44b9f02beae6c1715dd32e90ee470e2684`; its protected A1OW assertions and historical pre-rebind fields remain intact.
- The current wrapper distinguishes the a7 source from preserved installed App300d provenance (prior b12) and the not-yet-assembled iOS public copy (6a baseline). Those older payloads do not prove a binary contains current a7.
- Protected A1OW, QOK, and frozen engine hashes remain `00a520ae09089547ca4af4ef1077b84acdad98d4989de238f3ee30e28ad092c6`, `a0d08d9d1bae329355f9c44b60d6b3484f5e00717386d7d99cd4a8f309d6307e`, and `ab4fc9ad1204f23b4ea55dbae2d72bdf193a52e643271bcfe8642e2210556456`.

## Metadata-only output rebind

- Independent v3 comparison: `source-output-separation/metadata-only-rebind-comparison-r3.json`, SHA-256 `704a3663d27d4bdf60474b21c5c2a1826f5019dd8eb57ae138cb88ced422ff95`.
- Both deterministic generation receipts agree at SHA-256 `a5fb2b0b08fc6be8a23bf77bcc01835e1fbfdfb82f597a97bbe44ad10cc37a3f`. Their 494 path/hash/byte rows match the generated tree and current receipt; only `public/act1-hifi/manifest.json` changed from the pre-rebind source. The other 493 outputs are byte-identical. The generated output tree contains exactly 494 files.
- Current generated, public, and dist manifests are byte-identical at SHA-256 `1cd1271b118b6de1b278856e3e747087973f2ac1a1b37ced61b7bf50796ee006`.
- I independently checked all 319 authoring-input rows and all 494 output rows against actual paths, byte counts, and SHA-256 values. Digests are `57094b6cb73fa2e82d953c873fba4eccb24820f2670c2956ccbe980589ce88b1` and `7a82a814348dd71cdc158d5db2dbc884f38b1bc0eff89ef190e791a2d9ce6755`.
- Live validator source SHA-256 is `c37cb1734fa9f182a5b6e3dc17db3a2e2a010e4d464c13b6728972114c247ed1`. Replacing only its descriptor-pin literal yields bytes exactly equal to the Crystal normalized validator snapshot, SHA-256 `5a2a4862b2a9700e6460e4a2365da5801ab07166b1b707653378ce6b84e338fa`.

## Checks and limits

- `python3 -m unittest scripts.test_a1ow_dq_source_projection_consumers` — **PASS**, 12 tests, including separate source-only pinning and rejection of wrapper/hash/schema/status/native/dependency/projection tampering or source-only promotion into the full A1OW integration role.
- `python3 scripts/runtime_baseline.py verify-forward-terrain-preparation` — **PASS**: `QA_PREPARATION_PASS releaseEligible=false descriptor=9557461cde005883f70806b98dd15617b43c0c7731ba0c9677670ce99d6a5a4c outputs=7a82a814348dd71cdc158d5db2dbc884f38b1bc0eff89ef190e791a2d9ce6755`. All listed dynamic groups and pending proof assertions remain open.
- No `code-check` executable is available in this environment.
- Preparation receipt: `independent-static-preparation-receipt-crystal-roof-20261016-r2.json`, SHA-256 `a73bdc2bffcdf7bfb9499cce25b0cbd8c7e85bb60ca21388d6877dddd26853d3`. It binds the exact authoring/output inventory digests and all 14 preparation-stage proofs; `gateReady` and `releaseEligible` are false.
- This static preparation does not satisfy native assertions. A current-candidate native check still needs to show the x≈68 dark-mouth approach, the exact `(149,279)→(149,278)` transition/interception, roof and side refusal, and no opaque off-art traversal. No current-candidate native build or simulator interaction was performed in this review.
