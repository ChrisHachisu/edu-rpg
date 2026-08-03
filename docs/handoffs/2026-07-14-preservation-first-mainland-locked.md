---
date: 2026-07-14
type: handoff
status: locked-unimplemented
project: edu-rpg
milestone: preservation-first-mainland
branch: codex/map-engine-semantic-data
supersedes:
  - docs/handoffs/2026-07-14-connected-mainland-topology-owner-review.md
  - docs/handoffs/2026-07-14-capacity-first-mainland-v2-owner-review.md
---

# Preserve the current overworld and connect only its existing land regions

## Owner decision

Stop redesigning the overworld macro-layout. Preserve the current progression
path, landmark placement, general terrain, and world scale. Use the current
320×400 shipped overworld as the geographic baseline and connect its existing
land regions by replacing Act-separating water with land covered by progression-
blocking mountains and/or trees.

The connected-mainland v1 and capacity-first v2 boards are rejected history.
Their lobe shapes, landmark rearrangements, northwest crop, capacity shares, and
new spacing proposals are not implementation requirements. No replacement map
mockup is needed.

## Preserved baseline

- `mapId: 'overworld'`, dimensions 320×400, and fixed seed behavior;
- the preserved shipped ordered connection manifest: 41 physical anchors at
  their shipped coordinates—11 towns, 26 dungeon anchors/mouths, and 4 portal
  anchors;
- the current southwest/southeast/northeast/northwest regional arrangement;
- the current route graph, progression sequence, biome placement, terrain
  character, landmark relationships, and scale;
- all genuine water features and the exterior coast;
- all four separate portal-overworld maps and their transitions;
- existing overworld save coordinates when the saved cell remains valid.

The Act 1 semantic graph remains useful as a route contract, but its compact
fixture coordinates do not authorize moving production landmarks away from the
retained 320×400 positions.

One checked-in source coordinate is stale: `maps.ts` places Scorched Ruins at
`(278,82)`, while the preserved shipped game places it at `(208,120)`. Preserve
the shipped coordinate; do not treat stale source import as a legitimate move.

## Only allowed topology change

Convert the smallest water-gap masks around three existing retained corridor
families:

| Corridor | Current mouths | Conversion |
|---|---|---|
| Crystal, Act 1→2 | `(148,295)` / `(172,305)` | Ground substrate with mountain/tree blockers around the unchanged cave route |
| Shadow, Act 2→3 | `(260,234)` / `(260,198)` | Ground substrate with mountain/tree blockers around the unchanged cave route |
| Volcanic, Act 4→5 | `(172,110)` / `(148,110)` | Ground substrate with mountain/tree blockers around the unchanged forge route |

Act 3 and Act 4 already share the northeast land region. Do not invent a new
water separator or reshape it. Magma Tunnels is the apparent current progression
relationship, but its retained multi-mouth/floor behavior must be verified before
it becomes a locked semantic gate.

## Water preservation

Water outside the three explicit corridor masks remains water. This includes the
outer coast, Millbrook-area lake, Frozen Lake, Oasis water, Demon Castle moat,
the elongated local Act 1 lake, decorative water, and all portal-land water.
Legacy “river” comments are not authoritative: several such generator bands
emit mountain tile `4`, not water tile `2`, and already satisfy the natural-
barrier direction.

## Implementation gates

Before changing terrain:

1. Extract fixed-seed shipped terrain, route, landmark, special-tile, zone, and
   rendered baselines for each corridor.
2. Complete retained behavior manifests for Shadow Cave, Magma Tunnels, and
   Volcanic Forge. Crystal Cave generation remains untouchable.
3. Define explicit minimal tile masks around the three water gaps.

Acceptance requires:

- dimensions and all 41 connection records unchanged;
- route, landmark, special, portal, and zone snapshots unchanged;
- terrain diffs restricted to the three masks;
- every changed cell was water and becomes ground/mountain/blocked forest;
- all water outside the masks unchanged;
- one geographically connected mainland;
- no walkable bypass around any retained progression gate;
- no Act 3/4 macro reshape;
- existing valid overworld saves remain at the same coordinate;
- portal maps and transitions unchanged;
- rendered static-artifact proof plus focused semantic/runtime tests.

## Current verification

- Preserved bundle: 4,987,581 bytes and byte-identical to the recorded baseline.
- Shipped overworld definition: 320×400.
- Shipped connection manifest and gate coordinates reconciled against current
  data definitions: 40 of 41 records match; the Scorched Ruins source mismatch
  is documented above and the shipped coordinate is authoritative.
- Documentation consistency audit: complete.
- No runtime, bundle, map data, save, dungeon, or Crystal Cave change was made.

## Roadmap status and resume point

Seven forward roadmap stages remain: the unfinished/reopened portion of Stage 4
plus Stages 5–10. The next safe slice is baseline extraction and later-Act gate
behavior census—not terrain editing. After those contracts pass, implement and
render one corridor at a time behind the selective-engine boundary, starting
with a non-Crystal proof if possible. Do not Vite/build, wire runtime, modify
dungeon generation, commit, push, or deploy without separate authorization.
