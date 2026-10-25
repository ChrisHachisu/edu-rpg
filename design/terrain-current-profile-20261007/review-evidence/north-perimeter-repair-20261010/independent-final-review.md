# Independent north-perimeter review

Status: **static source, generation, and optional-layer guard pass; native/runtime release checks remain pending.** This is not a release receipt.

## Reviewed source

| File | SHA-256 |
|---|---|
| `design/terrain-current-profile-20261007/generate_forward_profile.py` | `40e5c1bc30ca0b1885c4aec39356c16f06ae73985d317414b685b26b8db06cfd` |
| `public/dq-tiles.js` | `c3c231cb4634039aa838e70c728b2e6922645ce9a40b86705d6a48d4f5f40c1a` |
| `scripts/test_north_silhouette_support.py` | `d3a564286c1067256f598ec51d046ce728226d4ba6cd79f749e5f2348c9744c2` |
| `scripts/test_north_runtime_lifecycle.cjs` | `4a1a601084b69764a367454803e1a3cd9c720ec8cf4586a177d4ef4f7dc904bb` |
| `scripts/terrain_current_profile.py` | `8e5071bcb72050653080184ff6127626d5a41346d8d46fd0329b83346bd8e76a` |
| `scripts/test_terrain_current_profile.py` | `f0a4f97d4b6935dca6c74669e2c7e4c1a1671871c568d64f3e81c09fa5bd4971` |

The QOK DQ runtime source remained unchanged during the north repair review. I reviewed the generator's north-support selection, bounded base-prefix alpha mask, shared B110 contact-Y insertion, and source/output constraints. The DQ path requests the north layer for north-only windows, creates a north sprite at the configured negative-y offset, hides it when leaving the overworld, and releases its GPU resources with the ordinary layer teardown. The reviewer-owned VM probe at `independent-north-fetch-lifecycle.cjs` exercised primary fetch/`createImageBitmap`, failed fetch and Image fallback, bounded retry, late-bitmap disposal after eviction, re-entry decode, north-only placement, hide, and non-overworld teardown; all nine assertions passed. Its SHA-256 is `85238aee71895b394b35ecf04b5fd57f9193ee2a49b4c1d48f1a6c606e5aa4f7`.

## Generation and visual review

Two clean generator roots now establish reproducibility. The durable comparison at `generation-v3-reproducibility-20261010.json` (SHA-256 `e3a2ce0a51f4187e1f3d3e5e603e82e98028e19974ffe07ccb30893afb00928f`) records equal receipt bytes, 493 equal paths/byte lengths/SHA-256 values, and identical decoded pixels. I independently rehashed every path in both roots: **493/493 match**. Receipt SHA-256 is `57e53c9c96782080f65c2eab1447f91cc06a6c498a3558e9b2ec0d4e25275f78`; runtime manifest SHA-256 is `b35cbab2b18220e53b1fac38966b928bd5cd88a357b5b7055d9db4c13d2194ca`.

The manifest carries `north-cliff-overhang-v1` on `c4-r0`, `c5-r0`, and `c6-r0`. I verified their RGBA PNG dimensions (512×300), manifest hashes, and output-inventory bindings. The generation record reports 1,414 new in-map collision bits, 9,650 shared-contact rendered changes confined to support pixels, six residual visible pixels, and no base alpha additions or visible RGB mutations. The seam validator now requires exact expected alpha and compares RGB only on visible pixels, correctly tolerating WebP canonicalization of hidden RGB. Its failable fixtures cover altered alpha and visible RGB.

I visually inspected `generation-final-v3/evidence/north-full-final-v3.png` and `north-hero-final-v3.png`. The supported north cliff contour reads as connected across the repaired span, and the close crop shows the support meeting the existing grass/cliff face without an obvious gap or layer-order artifact. The pink crosshair in the close image marks a reference coordinate; it is not a hero. These are scratch composites built on synthetic `#052f58` backing, not production screenshots. The straight bright-water boundary in that composite corresponds to the top-row water-chunk extent; the navy area is synthetic backing. Neither image establishes what a production camera viewport displays at that edge. The six residual alpha pixels and the far-right x=162–163 edge must not be reported as fully removed.

## Assembly-guard review

The initial validator omitted the optional north resource, so a malformed or unpinned new layer could have reached QA assembly. The reviewed fix adds `validate_optional_north_support`: it rejects north refs without schema, pins the reviewed v1 metadata, checks unique declared refs against actual chunk refs, restricts placement to geometry-matched top-row chunks, validates safe `chunks/north/*.png` paths and SHA bindings against the generated-output inventory, and checks PNG dimensions against the owning chunk. It also adds `validate_north_collision_union`: the original raised-art `sourceAlpha` path/hash remains pinned, the combined-alpha and support-delta PNGs are inventory-bound with exact dimensions, the manifest union must match the generation receipt, the independent no-removal proof must establish zero removals and the expected 1,414 additions/packed-bit hashes, and the QOK pack header/payload are decoded against the combined-alpha/union identity. The `collisionAuthority` field uses the exact historical value only when `northSupport` is absent, and the exact reviewed baseline-plus-North-union wording when present. Legacy manifests without north retain the old source-alpha/header equality semantics. Negative cases cover missing/wrong schema, unknown fields, dimensions/phase/anchor, missing/duplicate/orphan refs, wrong row/offset, path traversal/wrong layer, inventory hash mismatch, changed baseline/combined-alpha identities, removed collision bits, altered delta/union hashes, and bad dimensions.

The hash in the table for `scripts/terrain_current_profile.py` is the reviewed validator logic before root-pin substitution. Its normalized SHA-256 is `e55db18bb18cde804332572fb3c84099fa089975a0be5599ff9c1f43611733a5`, calculated after replacing only the exact `PINNED_DESCRIPTOR_SHA256: str | None = "<64 lowercase hex>"` literal with `"<DESCRIPTOR_SHA256_PIN>"`. That file is excluded from `authoringInputs` to avoid a descriptor-hash cycle. After the new receipt is pinned, integration may change only that literal; verify the normalized hash remains identical and run actual preparation validation against the pinned descriptor before assembly. Any other validator change invalidates this review.

Independent checks:

- `python3 -m unittest scripts.test_terrain_current_profile -v` — **25/25 PASS**.
- `python3 -m py_compile scripts/terrain_current_profile.py scripts/test_terrain_current_profile.py` — **PASS**.
- Direct guard invocation on the generated v3 manifest — returned exactly `c4-r0`, `c5-r0`, `c6-r0`.
- Direct union validator invocation on the generated v3 manifest/receipt, all three alpha files, and pinned independent proof — returned the exact combined-alpha SHA `fcd79dd502f6bfc22eab24088d9c73ec72fa93a215703cfd2873e7dd34f08d15`.
- Existing north silhouette and DQ VM focused suites — author-run **9/9** and **8/8 PASS**; my independent VM probe adds the cases described above.

## Remaining evidence

The generation receipt correctly reports `gateReady=false` and `nativeVerified=false`. No final release claim is made. On the new exact candidate, native review must still inspect the real viewport at the left water/plate edge and far-right x=162/163, confirm the restored cliff tips from an accessible view, and repeat affected streaming/leave-return behavior. Both canonical phone and tablet outcomes remain release-gate evidence; this review does not substitute for them.

## Follow-up independent review: forward DQ runtime identity

A follow-up found that forward runtime verification inherited the historical `ACT1_OVERLAY_FILES` DQ pin even though the forward descriptor authorizes a newer `public/dq-tiles.js`. The fix is scoped to the forward validator: it derives the DQ size/SHA from the unique `public/dq-tiles.js` authoring row selected by `currentGuard.inputPaths.dqTiles`, verifies the current public bytes against that row, and uses that pin for the runtime/public twin checks. Historical baseline pins and default historical dispatch remain unchanged; the other overlay pins remain in force.

Reviewed files and checks:

- `scripts/terrain_current_profile.py`: SHA-256 `5685e6c413f1a562fd86bf52aaa8fa93a3478a2b81ba7517ba28b4175c13519e`; normalized logic hash is the same.
- `scripts/test_terrain_current_profile.py`: SHA-256 `3f0a49c8a7a1500b130be481067e740f5fb534893d90a1b6f4e862677176a124`.
- `scripts/runtime_baseline.py` was unchanged during this delta (SHA-256 `0ae96ad23cb50cd35f0f323180774b127cf3655c6209a11a8b9e531bfbe712c9`).
- `python3 -m unittest scripts.test_terrain_current_profile -v` — **26/26 PASS**.
- `python3 -m py_compile scripts/terrain_current_profile.py scripts/test_terrain_current_profile.py` — **PASS**.

Failable cases cover the current reviewed row, proof that a stale historical DQ pin is not used, tampered public bytes, and missing authoring row or wrong current-guard path. The rest of this report's generated-artifact review and native limitations remain unchanged.
