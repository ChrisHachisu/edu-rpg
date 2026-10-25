# Forward Act 1 terrain generation checkpoint

Status: complete static output checkpoint for independent review. This is not release acceptance. The candidate/runtime tree was read-only; generated layers and evidence remain in this W-only directory. The frozen input bundle’s original 37 files and manifest were preserved.

## Portable source and inputs

Canonical generator: `Cnew/design/terrain-current-profile-20261007/generate_forward_profile.py`  
SHA-256: `ae4b0b40f36eaa1b8d077c3e703856acdd4945679a4c934e6e76bfcff45f6fc7`

Additive portable source note: `Cnew/design/terrain-current-profile-20261007/GENERATOR-REPRODUCTION.md`  
Accepted whole-layout recipe SHA-256: `4405f222f027d61f1e96e4d4f6a7d8a15e4b1826bec3622ad6f3f3e5d6e4b93f`  
North recipe SHA-256: `c3875927a7370045cbbdc19e2bc84464dad838135cb6ec5ca3fee15284100cad`  
Frozen 37-file bundle manifest SHA-256: `091df7c664cfbe73b3b75f1359639c1f646bf3fd80eb7f698678e695b65430ea`  
Bundled pilot receipt / alpha SHA-256: `cf23c18db3871ad9e59818f4c4be82bc1e09a08371de8e4880ac7f5dfea48110` / `533ff0e84258405640f9d453c3558e2e7677886e671a4cd1832fe1303d590594`

The one portable invocation used an absolute, hash-verified A ground cache. It verified bundle identity, all 120 chunk geometry/inventory entries, water and canopy copies against the current read-only runtime, and the fallback plate before reusing 120 base, 120 water, and 120 canopy chunks. The generator retains uncached rendering as the default path. Two earlier command attempts failed before rendering (relative cache path; then refusal to overwrite the resulting partial directory). The successful run used a fresh output directory.

## Output and deterministic comparison

Portable output: `generation-portable-source/` (488 inventoried files)  
Receipt SHA-256: `f1347de0b33db4b8428abed9f722045d44f94ed3a08d50133ddfb509b30a456e`  
Two-run A/B comparison from the corrected W generator: `regeneration-comparison.json`, SHA-256 `bbd8dcbaab6cda45235cd269a551002f547cf4e34ed37ad288f540c51ebacc1c` (PASS; 488-file inventories equal).

Portable output inventory has the same 488 paths as corrected A. Only two entries differ: `evidence/fm-residual-closeup.png` (the clarified six-pixel label) and `public/act1-hifi/manifest.json` (the expected canonical generator and accepted recipe provenance pins). All terrain chunk/layer data, final raised alpha, and collision-pack assets match corrected A by file hash. The manifest differs only in `forwardTerrainProfile.acceptedLayoutRecipeSha256` and the added `forwardTerrainProfile.generatorSha256`.

## Static checks

- 120 chunks at 32ppc from 16ppc inputs; geometry validated; forest alpha reconstructs exactly.
- Chunk seam/corner checks: object 218 edges / 99 corners; base ground 218 / 99.
- Retained 194 cliff placements and 194 anchors; added approved north recipe’s nine objects; selected 40 boundary crowns (including exact 11 immutable pilot seeds). 78 F/M contacts measured.
- Target gap reduced from 36,421 to six pixels. Remaining six are three disconnected one-row components (2, 1, 3 pixels) at `[4016,1809,4018,1810]`, `[4049,1809,4050,1810]`, and `[4060,1809,4063,1810]`; retained unfilled. They are not claimed as zero-gap or runtime-safe.
- Zero new P pixels and zero current route-guard intersections. Current map revision 7; 8 exits and 11 approaches checked; Crystal Cave at `[149,279]` remains walkable and reachable by the static world-map graph. This does not prove actual game spawn/save-resume or native movement.
- Raised-art source is hard-cut at alpha 128. QOKF8COL collision pack uses final visible alpha at runtime threshold 16; decoded pack XOR is zero against that alpha. A1OW was copied exactly and left unchanged.
- Lowres 6ppc support outside projected highres collision: alpha `>0`: 12,566 px (max 4 px; p95 3 px); `>=16`: 5,834 px (max 2.236 px; p95 1.414); `>=128`: 1,781 px (max 1.414 px; p95 1 px). This flags resampling support and possible small silhouette displacement; fallback rendered parity is not certified.

Contact sheet: `generation-portable-source/evidence/fm-contacts-overview.png`. Six-pixel closeup: `generation-portable-source/evidence/fm-residual-closeup.png`. Exact raised alpha and lowres difference mask are in the same `evidence/` directory.

## Gate status and limitations

The output receipt has `fullWorldComplete=true`, `gateReady=false`, and `nativeVerified=false`. The output is a static candidate only. Native identity, runtime streaming/collision, fallback rendering, phone/tablet behavior, and final profile installation/pinning remain for later gates. No public/runtime assets were installed or modified, and no build, upload, or release action was run.
