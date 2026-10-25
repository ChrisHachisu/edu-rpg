# Partial-window R2 runtime review — 2026-10-13

**Result: bounded source checkpoint passes, with rendered/native behavior still unverified.** This review covers only source logic and deterministic checks.

## Reviewed identity

- `public/dq-tiles.js`, `dist/dq-tiles.js`, and `ios/App/App/public/dq-tiles.js` are byte-identical, SHA-256 `ca2447a5e816455e1f2441687d01839e1cce8192df9f116f486de0aff98fc5df`.
- Focused test `scripts/test_partial_water_r2_runtime.cjs`, SHA-256 `331f05e34ee6e923e97d5c3b336d6a76faef67e5267c9d8c70d3e636915cfab7`.

## Review findings

- The ready registered R2 path leaves only true-water samples transparent in `drawTerrain`; biome-fill tiles clear coalesced wet row runs only. Dry terrain stays opaque, then roads and bridge rails draw afterward. The added work uses the existing terrain/shore sampling loops; it adds no new map-wide/per-pixel sweep.
- `updateTerrain` now keys the same snapped window on R2 identity, status, attempts, registered texture key, and effective R2-vs-fallback state. This lets pending→ready, ready→unavailable, and identity transitions reraster without camera movement. R2 texture loader state and stale-callback guards are byte-identical to pre-fix source; they were not changed here.
- The focused test exercises production `drawTerrain`, `paintBiomeFills`, and `updateTerrain` functions. It covers pending→ready, ready→unavailable, identity change, dry pixels, routes, bridge rails, biome fill, and non-plate fallback. It passes 3/3. `node --check public/dq-tiles.js` passes. All shipped twins compare byte-identical.
- The known pending-texture behavior inside the plate is inherited. I compared against the exact pre-fix native DQ, SHA `b98a4ca9a3f2c5bc528db4657ada7b1b7793b0d8469973356c9e2ed06af8135b`: `a1aClearLegacyPlate`, `a1aSea`, the R2 loader callbacks, and the unconditional partial-plate clear are unchanged. In the north-prefix band, pending R2 uses the existing analytic backing at depth 0.6 below the depth-0.7 underpaint; outside that band, the previous partial-plate clear can expose the existing solid `dqsea` fallback through transparent water underpaint. This review does not treat that baseline behavior as a regression from the current patch.
- The focused pending sample is outside the clipped plate area, so it does not pin the inherited in-plate fallback. The new readiness test simulates loader state rather than executing browser image callbacks; loader behavior is unchanged. These are evidence limits, not newly observed runtime failures.

## Verification

- `node --test scripts/test_partial_water_r2_runtime.cjs`: 3/3 pass.
- `node --check public/dq-tiles.js`: pass.
- DQ runtime source twins: byte-identical.
