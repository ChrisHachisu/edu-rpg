# Collision-aware route audit classification

This addendum interprets the completed bounded static search. It does not alter the original solver outputs or establish runtime/native movement.

## Result

The audit is **inconclusive for route acceptance**. It emitted 40 named target records: 20 references for each selectable hero across 11 unique target cells. Per hero, 11 records passed, 5 exact center anchors were blocked, and 4 searches reached the 200,000-node expansion cap. The saved raw records retain every path, status, coordinate, and `firstRejectedEdge`.

The `firstRejectedEdge` attached to a capped search is the first encountered rejected edge during exploration. It is not evidence of the route's causal bottleneck. No additional path search was run.

| Static result | Targets / meaning |
|---|---|
| Pass (11 per hero) | New-game start; Greenhollow, Millbrook, Misty Grotto, Sunken Cellar, and Whispering Woods exit and approach anchors. |
| Blocked tested anchor (5 per hero) | Coastal Reef exit and approach; Port Sapphire exit and approach; Crystal Cave north approach. See exact failures below. |
| Expansion cap (4 per hero) | Crystal Cave exit and approaches `[148,278]`, `[149,279]`, `[150,278]`. These are inconclusive, not route failures. |

### Exact blocked-anchor observations

- **Coastal Reef**, cell `[145,372]`: the center anchor's live foot point `[6984,17924.116]` lands in current world-map tile 21 at `[145,373]`. This checks the new-game empty-inventory state and this exact anchor only.
- **Port Sapphire**, cell `[133,348]`: A1OW distance is 51 thirds where the current movement predicate requires 53.9391 thirds at foot point `[6408,16772.116]`. This checks the exact anchor only; no nearby subcell stand was searched.
- **Crystal Cave north approach**, cell `[149,277]`: the sprite-center anchor has sole foot point `[7176,13364.116]`, which overlaps the closed-side map cell `[149,278]` (tile 15). This is a failed tested center anchor, not proof that a transition is locked or flag-gated.

The map records `boss.giantToad.defeated` on the Crystal Cave gate, but `wrapCheckTransition` returns the cave ENTRY unconditionally, and `a1mDoor` calls `checkTransition` directly after a blocked movement attempt. Whether actual cave entry honors the flag is unresolved. Do not label the cave progression-locked from the static closed-side result. A native front-entrance interaction remains required.

## Frozen source and outputs

- Portable audit source: [audit_forward_profile_routes.py](/Users/chris/Documents/Codex/2026-09-15/edu-rpg-act1-feedback/taskwork/20261007-build84-source-recovery/recovered-candidate/design/terrain-current-profile-20261007/audit_forward_profile_routes.py), SHA-256 `9ba7c856c948b4c86f78d3087b5937aea749f32c88c7d8deba4349ba86e4731b`.
- Original solver summary: [ROUTE-AUDIT.json](/private/tmp/edu-rpg-build83-paint-audit-20261005/current-terrain-generation-20261007/route-audit/ROUTE-AUDIT.json), SHA-256 `92f5f341ec102edede2ef2795c354f89cb381304c6dbff7b9a48fd87662411b5`.
- Original per-target/path data: [route-paths.json](/private/tmp/edu-rpg-build83-paint-audit-20261005/current-terrain-generation-20261007/route-audit/route-paths.json), SHA-256 `b508422dee9fcb132ecf5e0001978e02378db75cec1adb2eb6cc86c2480cf83d`.
- Final progress checkpoint: [route-progress.json](/private/tmp/edu-rpg-build83-paint-audit-20261005/current-terrain-generation-20261007/route-audit/route-progress.json), terminal status `completed-acceptance-inconclusive`.
- Emitted output receipt: `/private/tmp/edu-rpg-build83-paint-audit-20261005/current-terrain-generation-20261007/full-world/north-contact-y-20261007/generation-portable-source/output-receipt.json`, SHA-256 `f1347de0b33db4b8428abed9f722045d44f94ed3a08d50133ddfb509b30a456e`; it remains `gateReady=false` and `nativeVerified=false`.

Input authorities recorded by the original report include QOK `cfb22774fac5315d3cef2c4b4cdde29ebb5324a054fe0bc3c07e56886cbaab16`, unchanged A1OW `d87c6572cbf3012180a289196cfe5e7eee7c50dc86beb06a999fa491eeacfdf3`, current DQ `80b1fcaf6d593bd704f720239c2f9fd533e7b49ca1af7c8d6401901b9d876090`, current map `f1ea99546b799b50cec7d6fd40b1fae2ad53669fae22afaebe3760f225d12cad`, and preserved base bundle `ab4fc9ad1204f23b4ea55dbae2d72bdf193a52e643271bcfe8642e2210556456`.

The original solver report and path-data files were restored byte-for-byte after classification work; their hashes above match the pre-edit frozen values. The final reviewed source hash is listed above. The solver did not persist an in-memory source hash; after the run, only report-status semantics and explanatory limitations were changed in source, not route-search or collision logic. No native build, installation, upload, or release acceptance is claimed.
