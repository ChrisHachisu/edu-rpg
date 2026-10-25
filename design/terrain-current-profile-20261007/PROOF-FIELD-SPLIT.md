# Forward profile proof field split

The `forward-proof-field-split-v1` contract separates static evidence available before QA packaging from runtime assertions that need the exact sealed phone and tablet candidate. The descriptor remains `gateReady=false` and `releaseEligible=false` during QA preparation. This contract changes proof bookkeeping only; it does not change terrain assets, generator behavior, or runtime code.

## QA preparation facts

The descriptor pins the exact authoring inputs, 488 generated output rows, current guards, complete geometry, clean regeneration, decoded alpha/collision outputs, and independent static/rendered review. Its `proofs` values use exact stage-specific keys; a deferred assertion cannot appear as `true`, `false`, `null`, or an alternate field.

The A1OW proof establishes its unchanged binary identity/header/provenance, production parser, and water-only scope in the reviewed semantic bounds with analytic mountains outside and in padding. It does not claim movement reconciliation or hero-foot clearance. The visible-alpha proof binds the final whole-object union and QOK source hash, but does not claim global frame visibility. Hero-frame evidence is a static census of two selectable 12-frame sheets at the checked runtime scale. Safe-cell evidence is limited to all 149 manifest cells, sampled at center and four one-pixel offsets for each frame against QOK; the report records zero QOK hits. Underpaint evidence proves declared origin/scale phase, extents, and all 120 chunk-boundary alignments; it does not prove pixel or silhouette parity after low-resolution resampling.

Fresh current-source guards require `staleGuardAccepted=false`. The existing six dynamic QA groups remain unchanged, and the descriptor also lists the exact deferred assertion paths below. A blocked anchor or capped route search is inconclusive and cannot be counted as a passing assertion.

## Deferred assertions and required QA groups

| Deferred assertion | Required groups |
| --- | --- |
| `a1owDecode.mountainCollisionReconciled` | `terrainContactBothHeroes`, `cliffGrassRoutes` |
| `a1owDecode.heroFootClearanceRecomputed` | `terrainContactBothHeroes`, `caveDoorBridgeRoutes` |
| `visibleAlpha.noHiddenSelectableHeroFrame` | `terrainContactBothHeroes`, `chunkStreamingAndResume` |
| `heroFrameClearance.clearanceRecomputed` | `terrainContactBothHeroes`, `cliffGrassRoutes`, `caveDoorBridgeRoutes` |
| `runtimeInvariants.existingSaveResume` | `savePreservationAndInterruption`, `chunkStreamingAndResume` |
| `routes.startAndLegacyFallbackVerified` | `savePreservationAndInterruption`, `caveDoorBridgeRoutes` |
| `routes.savedPositionRecoveryVerified` | `savePreservationAndInterruption`, `caveDoorBridgeRoutes` |
| `routes.crystalCaveRoundTrip` | `caveDoorBridgeRoutes`, `battleFleeBossReturn` |
| `routes.allExitsReachable` | `caveDoorBridgeRoutes`, `cliffGrassRoutes` |
| `routes.noTraversableTerrainSeam` | `terrainContactBothHeroes`, `cliffGrassRoutes` |
| `routes.leftPlainsOpeningRetained` | `cliffGrassRoutes` |

The release evidence envelope uses schema `qok-forward-release-evidence/v2` and must bind the exact preparation descriptor, output and input inventories, candidate core, source/native inputs, runtime payload, build number, sealed phone and tablet receipts, and the existing six groups. It includes every deferred assertion with `value=true` and exactly the fixed group mapping above. The independent review record must separately list `PASS` for each same assertion and group set. The validator rejects missing/extra fields, group substitutions, false values, stale candidate identity, missing device evidence, or an unsupported split version.

The prepared profile is not release eligible. Runtime contact, cliff/grass routes, cave and bridge behavior, chunk fallback/loading/resume, save preservation/interruption, and battle/flee/boss-return remain required before release. Native QA is still necessary to determine those outcomes.
