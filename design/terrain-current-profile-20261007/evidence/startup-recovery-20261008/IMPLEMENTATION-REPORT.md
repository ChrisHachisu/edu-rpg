# Startup relocation fix checkpoint

Scope: keep an already legal saved overworld position, and only relocate a blocked saved position after the live movement authority proves a nearby candidate legal. Pending or failed authority leaves the current position in place. Retries are bound to the same scene, map array, and unchanged live position, and stop after 40 checks.

## Changed files

The before hashes below were measured from the frozen recovered candidate at `taskwork/20261007-build84-source-recovery/recovered-candidate`; after hashes are from stable `edu-rpg-forward-20261007`.

| File | Before SHA-256 | After SHA-256 | Change |
|---|---|---|---|
| `scripts/export_act1_runtime_override.mjs` | `784170f6af0f2d1b7da705e1c0e8c159913a3f6355edfa1f3234dd4827921d74` | `cc8cca2c2bac589e7d1c53ac20be7feb36d1b46d8792a3fafa5b261e1646e4c0` | Adds public-only generate/check mode and emits live-authority saved-position validation/retry logic. |
| `public/act1-world-map.js` | `f1ea99546b799b50cec7d6fd40b1fae2ad53669fae22afaebe3760f225d12cad` | `fb466fc6dbe7e05ccbb209c70867cacf4f903d55837ea69ca716e81f7196c96f` | Replaces coarse tile-based teleport with exact live legality checks, bounded nearest-SAFE search, and stale-state cancellation. |
| `public/dq-tiles.js` | `80b1fcaf6d593bd704f720239c2f9fd533e7b49ca1af7c8d6401901b9d876090` | `8a9124917e01ba70ca2c17eebc784ecc8fa38411e8da0ed3e5a93905fa317d60` | Exposes a read-only spawn query using the active overworld field, selected-hero forest readiness, and exact `a1mFree` predicate. |
| `scripts/test_act1_runtime_override.mjs` | `82a8ac3b06a981c3fb12262d3313486219dfeb23a192e1e8d89abb307fa160c8` | `4a45ec3d608ce0d4104a9ef537d648c71cedff9eab6a30b30df1f4b1673461be` | Adds relocation, readiness, scene/map/position staleness, scale, and gate regression cases. |
| `scripts/test_act1_terrain_collision_integration.cjs` | `d12f31a0e9036106abbdc1c6615f4db0cb3f46a87e608a95474e80731ab5866d` | `b62906ac51c60353e951674af0e35df060f68be0fa5881c1e8e54e6ae67e184f` | Extracts production spawn-query and startup-consolidation paths; covers coordinate conversion, readiness, stale/outside field, G3/male, the saved `[117,234]` start, and exact authored exit seeding. |

`dist/act1-world-map.js` was not changed; its SHA remains `f1ea99546b799b50cec7d6fd40b1fae2ad53669fae22afaebe3760f225d12cad`.

## Checks

- `node --check scripts/export_act1_runtime_override.mjs`
- `node --check public/dq-tiles.js`
- `node --check public/act1-world-map.js`
- `node scripts/export_act1_runtime_override.mjs --check --public-only` — pass, generated map hash `fb466fc6dbe7e05ccbb209c70867cacf4f903d55837ea69ca716e81f7196c96f`
- `node scripts/test_act1_runtime_override.mjs` — pass; 8 exits and 9,326-cell plate reachability retained
- `node scripts/test_act1_terrain_collision_integration.cjs` — pass; production `owEnsureMapSetup` preserves `[117,234]` as its consolidation start and preserves an exact authored exit through the verified-exit seed path

The sibling `scripts/test_act1_forest_collision.cjs` is not a valid run in this checkout: it exits before its assertions because its pinned historical R9 source fixture `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v9/act1-painted-overworld-r9/source/terrain-r9/collision/forest-alpha-visible.bin` and companion historical artifact roots are absent. No current-profile bytes were substituted for those historical lineage fixtures.

## Profile and release pins affected

The current profile descriptor's `authoringInputs` and `currentGuard` still pin the previous map hash `f1ea9954…` and DQ hash `80b1fcaf…`. `evidence/runtime-invariants-static.json` also records those hashes. Refresh those exact source bindings only after independent review. The profile's generated terrain output inventory is unchanged by this startup-recovery patch. Normal dual-output exporter/build assembly and post-assembly `regenerate_pins.py --check` remain later release steps; neither was run here.

No app build, installation, descriptor/pin edit, terrain regeneration, or native movement claim is included in this checkpoint. Native joystick input delivery remains a separate unresolved issue.
