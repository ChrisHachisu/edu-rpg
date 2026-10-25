# Independent startup recovery review

## Verdict

**Static source/test review: PASS, scoped to the frozen startup recovery change.** I found no actionable defect in the reviewed logic. The new deterministic startup-chain fixture closes the earlier integration-test gap for the saved `[117,234]` start. This is not native movement or release acceptance; the new public runtime files still require normal assembly, an exact-candidate build, and native retest.

## Reviewed artifacts

Stable candidate: `/Users/chris/.codex/workspaces/edu-rpg-forward-20261007`

| File | SHA-256 |
|---|---|
| `scripts/export_act1_runtime_override.mjs` | `cc8cca2c2bac589e7d1c53ac20be7feb36d1b46d8792a3fafa5b261e1646e4c0` |
| `public/act1-world-map.js` | `fb466fc6dbe7e05ccbb209c70867cacf4f903d55837ea69ca716e81f7196c96f` |
| `public/dq-tiles.js` | `8a9124917e01ba70ca2c17eebc784ecc8fa38411e8da0ed3e5a93905fa317d60` |
| `scripts/test_act1_runtime_override.mjs` | `4a45ec3d608ce0d4104a9ef537d648c71cedff9eab6a30b30df1f4b1673461be` |
| `scripts/test_act1_terrain_collision_integration.cjs` | `b62906ac51c60353e951674af0e35df060f68be0fa5881c1e8e54e6ae67e184f` |
| `dist/act1-world-map.js` (unchanged) | `f1ea99546b799b50cec7d6fd40b1fae2ad53669fae22afaebe3760f225d12cad` |

Author checkpoint: `startup-relocation-fix-report-20261008.md`, SHA-256 `28cd6aa7dd053101071c30b88120174e426e50eec9d38d51274b8a9061e6db95`.

## Independent checks

- `node scripts/test_act1_runtime_override.mjs` — PASS. Confirms a blocked `[117,234]` position moves to the nearest collision-validated SAFE cell; valid continuous sub-tile positions remain unchanged; selected G3 and male variants are checked; pending/error authority, scene/map/position staleness, bounded retry, scale, and gate cases remain covered.
- `node scripts/test_act1_terrain_collision_integration.cjs` — PASS. The test now invokes the extracted production `owEnsureMapSetup` → `consolidateMapData` path with a 320×400 map. It confirms the actual Act-1 plate marks `[117,234]` as forest while the exact persisted F1 position is retained as the consolidation seed and the hero is not moved. It separately exercises an exact authored cave exit seed.
- `node scripts/export_act1_runtime_override.mjs --check --public-only` — PASS; generated public source matches the frozen runtime hash.
- `git diff --check` on the reviewed files and `node --check` for the exporter and runtime JavaScript — PASS.
- Applied the code-check checklist to the scoped change. The reviewed code shares the production tile/gate and mover authorities, bounds retries and candidate search, fails closed on missing or unevaluable collision state, and cancels stale pending work. No critical or major code-quality finding remained.

The startup seed is deliberately narrow: it accepts an exact authored exit, or a saved position in the same integer overworld/F1 cell that the current plate marks walkable and does not identify as a closed gate tile. Subsequent relocation uses the current physical sprite position and the live movement predicate; it does not replace that check with tile walkability. On a missing/unready authority it leaves the position untouched and retries only while the same scene, map array, and position remain current.

## Limits

- The historical `scripts/test_act1_forest_collision.cjs` could not run because its pinned historical R9 raw collision fixture and companion evidence roots are absent from this checkout. No current-profile files were substituted for that lineage.
- The runtime patch has not yet been assembled into `dist` or tested in a fresh native binary. Prior diagnostic input-delivery evidence did not establish gameplay movement, so this review makes no native, physical-device, release, or TestFlight claim.
