# Independent outside-plate support check

## Finding

The restored companion-B upper support does not overlap walkable overworld terrain north of the Act 1 plate. I checked the exact hard-alpha pixels against the frozen **full 320×400 map**, not the Act 1 bounds/default used by the route planner. All 90,442 unique outside-plate support pixel centers resolve to tile `2`; all 132 map cells with positive-area intersection with those 1.5×1.5-world-pixel raster samples are also tile `2`. There are no authored landmarks in the affected region. Frozen `OW_BLOCK` and the base bundle's overworld `canMove` both reject tile `2`. The A1OW field samples are also below the minimum clearance: max distance is 16 thirds versus a minimum of 51.4286.

The hard-alpha support occupies approximately world pixels `[4550.25,10116.75]..[5699.25,10463.25]` (about cells `x=94.797..118.734`, `y=210.766..217.984`). The recipe's complete upper raster begins at cell `y=208.625`, but its first non-transparent support pixels begin lower, at about `y=210.766`. This is blocked water/edge terrain rather than a walkable northern Act.

## Exact evidence binding

- Source support: recipe SHA-256 `e84409c166b6754d59d02cb5fcf8c8b54acf524e61b615dc1c996e783b99b007`; companion atlas SHA-256 `b2701dd847e7d1df26c8488aa95877b57682be732a7bdc10d00fa12363613a04`; upper crop `[15,0,583,600]`, nearest resize to `284×300`, hard-alpha threshold `128`; authored placements `(94,218)`, `(98,218)`, `(106,218)`, `(110,220)`.
- Full map artifact: `current-terrain-generation-20261007/route-audit/plated-map.json`, SHA-256 recorded in the JSON result; it is a 320×400 map artifact with declared base bundle SHA-256 `ab4fc9ad1204f23b4ea55dbae2d72bdf193a52e643271bcfe8642e2210556456`, matching the frozen bundle used by the audit. Its row bytes hash to `175f8f5dc486e4b4d2bed660924999dca72c0c6516f396e195752debfc92a215`. The frozen bundle's `Ep(320,400)` map is followed by the recorded consolidation and Act 1 plate; out-of-plate cells remain from that full-world map.
- Collision semantics: frozen DQ source SHA-256 `c18ce18e2f25ef6779165389d86163cea64136711f8999c4fd843154e6799c7a`; frozen base `canMove` branch is pinned by the route authority. Tile `2` is in `OW_BLOCK` and the branch's default overworld predicate rejects tile `2`. The current DQ SHA was `c3c231cb4634039aa838e70c728b2e6922645ce9a40b86705d6a48d4f5f40c1a` during this check; this result is explicitly bound to the frozen collision DQ, not an assertion about a different runtime binary.
- The A1OW sample histogram, full input hashes, placement counts, and exact tile counts are in [independent-outside-support-result.json](independent-outside-support-result.json). Reproduce with [independent-outside-support-check.py](independent-outside-support-check.py).

## Scope

This is a bounded static terrain/collision classification of the proposed support pixels; it is not a global route search or native traversal proof. It addresses only art outside the Act 1 plate. The separate 1,414-bit in-plate QOK union and its stored route checks remain in `independent-clearance-result.json`. No app source, art, map, collision asset, or runtime was edited.
