---
date: 2026-07-14
type: design-decision
status: locked-owner-direction
project: edu-rpg
milestone: preservation-first-mainland
supersedes: design/review/connected-mainland-topology/README.md
---

# Preserve the current overworld; replace only Act-separating water gaps

## Locked owner direction

Stop redesigning the overworld macro-layout. The current 320×400 world already
has a working progression path, landmark placement, scale, and general terrain
composition. The selective map-engine rebuild must use that shipped layout as
its geographic reference rather than replacing it with five new lobes, equalized
Act areas, or newly spaced landmark clusters.

The only mainland topology change is to connect the existing land regions at
their current progression corridors. Water cells whose purpose is to separate
Acts become ordinary land substrate covered by blocked mountains and/or blocked
trees. Existing gate dungeons and routes remain the only playable crossings.

The connected-mainland v1 and capacity-first v2 boards are rejected history.
No replacement macro-map is required.

## What remains fixed

- retained overworld map ID `overworld`, width 320, and height 400;
- all 41 physical connection records and their retained shipped coordinates,
  including duplicate dungeon mouths and the four Act 5 portal anchors;
- the current broad southwest/southeast/northeast/northwest geography;
- the current progression route graph and relative landmark relationships;
- established biome placement, terrain character, and world scale;
- the four separate `portal-overworld` maps and their transitions;
- outer coastline and authored gameplay water;
- saved overworld coordinates unless an independently detected invalid cell
  requires the existing safe-position fallback.

The Act 1 Braided Pilgrim Trail remains a semantic expression of the retained
route relationship. Its small fixture coordinates are not authority to move the
production landmarks away from their current 320×400 positions.

## Allowlisted mainland connections

Only three existing water-gap corridor families are candidates for conversion:

| Corridor | Existing retained mouths | Required result |
|---|---|---|
| Crystal, Act 1→2 | `(148,295)` and `(172,305)` | A blocked mountain/tree land neck around the unchanged Crystal Cave mouths |
| Shadow, Act 2→3 | `(260,234)` and `(260,198)` | A blocked mountain/tree land neck around the unchanged Shadow Cave mouths |
| Volcanic, Act 4→5 | `(172,110)` and `(148,110)` | A blocked mountain/tree land neck around the unchanged Volcanic Forge mouths |

Act 3 and Act 4 already share the northeast land region. Do not add a new water
gap, reshape that landmass, or invent a replacement crossing. The current Magma
Tunnels relationship may help structure progression, but its retained multi-mouth
behavior must be verified before being formalized as the Act 3→4 semantic gate.

Crystal Cave generation remains untouchable. Converting mainland terrain near
its two overworld mouths does not authorize changing the dungeon.

## Water that remains water

- the two-cell outer ocean envelope and the exterior coast around the world;
- the Millbrook-area lake;
- Frozen Lake;
- Oasis water/moat;
- Demon Castle moat and island treatment;
- the elongated local Act 1 lake near `x=84…100, y=275…325`;
- small decorative water features;
- all portal-land geography and water.

Classification is based on tile ID and gameplay role, not generator comments.
Several legacy sections named “river” or “swamp” emit mountain tile `4`, not
water tile `2`; those are already land-based blockers and should be preserved.

## Terrain conversion rule

For each allowlisted corridor:

1. Freeze the current landmark, route, special-tile, and zone snapshots.
2. Define the smallest explicit gap mask joining the current land edges around
   the two retained mouths.
3. Change only pre-existing water cells inside that mask.
4. Use ground as the geographic substrate and mountains/blocked trees as the
   visible progression barrier.
5. Preserve the existing route/mouth corridor without creating an ordinary
   walkable bypass.
6. Verify the mainland becomes one geographic land component while downstream
   walkable routes remain gated by retained progression state.

This is a terrain conversion, not a coordinate rewrite, pacing expansion, or
region-capacity rebalance.

## Acceptance gates

- `mapDefs.overworld` remains exactly 320×400.
- The ordered overworld connection manifest remains equivalent to the preserved
  shipped manifest: 41 physical anchors in the same coordinates and with the
  same mouth multiplicities.
- Fixed-seed route cells, landmark tiles, specials, portal anchors, and encounter
  zone classifications remain unchanged.
- Every terrain change is inside one of the three explicit corridor masks and
  was water before conversion.
- Every changed water cell becomes ground, mountain, or blocked forest.
- Water outside the allowlist remains unchanged.
- The geographic mainland is one component after conversion.
- Walkable cross-Act access remains confined to the retained crossing contract;
  no barrier can be bypassed around a mountain/tree edge.
- Act 3/4 receives no invented water boundary or macro reshape.
- Existing overworld saves retain their coordinates; the conversion alone does
  not trigger relocation.
- Portal maps and outbound/return transitions remain unchanged.
- The preserved runtime baseline remains the comparison and rollback artifact;
  its opaque JS bundle remains exactly 4,987,581 bytes.

## Verification boundary

The checked-in generator and map definitions match the preserved bundle on the
320×400 dimensions, named barrier coordinates, and 40 of 41 connection records.
One source record is stale: `maps.ts` places Scorched Ruins at `(278,82)`, while
the preserved shipped game places it at `(208,120)`. The shipped coordinate is
the preservation authority; importing the stale source value would be an
unauthorized relocation. Rendered terrain is still the final authority because
runtime overrides repaint and consolidate some terrain. Before implementing a
corridor, capture the shipped fixed-seed terrain and rendered view for that
corridor, then compare the converted result.

Later-Act retained gate manifests are still incomplete. Shadow Cave, Magma
Tunnels, and Volcanic Forge behavior must be censused before their semantic gate
contracts are declared locked. This decision changes no runtime, bundle, save,
dungeon topology, or Crystal Cave generation by itself.
