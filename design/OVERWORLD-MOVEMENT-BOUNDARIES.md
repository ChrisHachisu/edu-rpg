---
date: 2026-07-16
revised: 2026-07-20
type: owner-locked-gameplay-contract
status: active-terrain-class-method
project: edu-rpg
---

# Overworld movement and boundary contract

## Region-and-gateway authority — OWNER LOCK 2026-07-20

Checkpoint 2 is reopened. The route-ribbon polygon method is rejected as the
cross-act gameplay model. Every Act 1 and later overworld instead uses a small
set of large, freely explorable walkable regions connected by deliberate,
readable gateways.

- A region is broad enough for meaningful off-road movement. Its walkable edge
  follows an unmistakable physical barrier: coast, mountain wall, dense forest,
  cliff, structure, or an equally legible solid feature.
- A gateway is a short aperture through those barriers: a pass, bridge, forest
  gap, stair, threshold, gate, or equivalent chokepoint. Use the fewest gateways
  that express the progression graph and make each one readable at native and
  locked-phone scale.
- Roads and trails are semantic guidance inside regions. They may lead toward a
  gateway or landmark, but they do not define the walkable boundary, clamp the
  actor to a centerline, or form an invisible rail network.
- Static barrier geometry and dynamic story seals remain separate from the
  walkable-region union. Opening a story seal changes only that gateway blocker.
- The reusable schema and validation method cross acts; region placement,
  physical barrier plan, gateways, and topology are authored independently for
  each act. No later act inherits Act 1 coordinates.

For Act 1, checkpoint 1 remains immutable. The Crystal/Act 2 connector remains
fixed at `(2166, 1132)`. Checkpoint 2 may redesign every other internal landmark
placement and polygon while preserving the eight identities, seven-route story
graph and guards, both coastal relationships, forbidden-shortcut intent, and
Crystal's dynamic-seal semantics.

## Polygon-first authority — OWNER LOCK 2026-07-19

The earlier art-first authoring order is superseded. Repeated attempts to infer
clean gameplay geometry from already-painted terrain produced noisy masks and
kept geometry, collision, routes, and artwork in conflict.

For every overworld, the clean region-and-gateway gameplay geometry is now the
physical source of truth. The map painting is authored or regenerated afterward
so its visible regions, barriers, gateways, roads, clearings, settlement aprons,
bridges, passes, shorelines, cliffs, forests, structures, and entrances conform
to that locked geometry.

The rejected Relay 25 full-map mask and earlier route-first geometry remain
failure evidence only. They must not be cleaned up, promoted, or used as the
polygon baseline.

## Superseded Act 1 route-ribbon reconciliation — HISTORICAL 2026-07-19

The 2026-07-20 region-and-gateway decision above reopens checkpoint 2 and
supersedes every exact internal geometry lock in this section. The coordinates
below remain failure history for the rejected route-ribbon/checkpoint-3 loop;
they are not inputs to the replacement pack.

Act 1 used its one explicit step-7 geometry revision after the final landscape
painting exposed two problems: the clean R25b ribbons were visibly too rigid,
and the Coastal Reef endpoint stopped before the painted dungeon mouth. The
final design pair is the R26 pack at
`design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/act1-final-art-geometry-r26/`.

- Intermediate road, clearing, bridge, and junction outlines are smooth,
  deliberately simplified curves fitted to visible ground. They are not
  pixel-edge traces and the derived binary mask remains evidence only.
- Coastal Reef keeps its route ID, runtime ID, `drakeCargo` guard, and southeast
  Port topology. Its native art-space entrance moves from `[1690,2410]` to the
  visible cave-foot point `[1877,2596]`, with one continuous painted and
  walkable approach.
- Port Sapphire remains three pairwise-disconnected overworld entrances at
  west `[1840,1665]`, north `[1835,1635]`, and southeast `[2114,1840]`.
- Sunken remains the exact straight `[[411,2548],[370,2495]]` throat at width
  `11`. Crystal keeps its existing dynamic seal and all forbidden shortcuts
  remain blocked.

After the R26 pair passes final review, Act 1 geometry and art hashes are locked
together. Ordinary visual corrections are art-only. A later topology, endpoint,
width, blocker, or connectivity change requires a new explicit gameplay
decision; it must not start another automatic art-to-polygon loop.

## Act 1 visual status — REJECTED 2026-07-17

The route-first `walkable-regions-v1` overlay and every cutover derived from it
are visually rejected by the owner. Mechanical route, collision, streaming, and
save tests do not supersede that rejection. The existing data may be retained
only as failure evidence; it is not an accepted geometry baseline and must not
be patched region by region.

## Owner decision — LOCKED 2026-07-16

Every act overworld uses continuous free movement inside art-authored walkable
regions. Routes do not act as invisible rails.

- Open ground such as plains, snowfields, desert flats, settlement aprons, and
  large clearings is represented by broad walkable polygons.
- Narrow trails, mountain passes, bridges, cave thresholds, and coastal ledges
  use tighter road- or deck-shaped polygons that follow the final painting.
- Water, cliffs, dense forest, buildings, large rocks, and other solid features
  are excluded by the polygon boundary, authored holes, or global static
  obstacle polygons. Global obstacles are applied after the complete walkable
  union so overlapping ground regions cannot accidentally re-admit a roof,
  pier, cliff, or body of water.
- Story gates use separate dynamic blockers. Opening a gate changes only that
  blocker; it does not replace or deform the surrounding walkable ground.
- The seven-route Act 1 semantic graph continues to own progression,
  transitions, encounter sampling, saves, and retained tile-center commits.
  It never clamps the rendered character to a centerline.

This contract is comparable in feel—not in camera, combat, or level scope—to
the free analog traversal used by modern isometric action games: the player can
steer naturally anywhere the visible ground plausibly permits and slides along
solid boundaries when pressing into them.

## Authoring authority — TERRAIN-CLASS METHOD, OWNER LOCK 2026-07-20

The polygon-authored region-and-gateway order below this section is superseded
as an authoring method (its product goals and runtime locks stand). Nobody
authors walkable polygons, blocker polygons, or gateway rectangles again. The
single design authority per act is a terrain-class raster: an indexed-color
map in which every pixel carries one terrain class, and each class is
intrinsically walkable or blocking. Full method, class palette, smell linters,
and evidence requirements: `docs/plans/2026-07-20-act1-terrain-class-method-decision-brief.md`
(owner-approved Gate 0, 2026-07-20).

For each act:

1. Gate 0 — lock the semantic graph, landmark identities and entrances,
   progression gates, coastal relationships, and forbidden shortcuts as
   validation data.
2. Gate 1 — paint the macro terrain-class map at contract-cell scale
   (Act 1: `148x182`, 16 native px per cell) plus a barrier-continuity ledger
   naming every continuous physical system and every gateway's formation.
   Blockers must belong to named continuous systems; gateways are geographic
   features (saddle, bridge, forest gap, beach shelf, city gate, cave mouth),
   never rectangular cuts. Automated schematic-smell linters (straight-run,
   uniform-width, rectangularity, basin-convexity) must pass before owner
   review. Owner approves naturalness and readability at macro and phone
   scale before anything native-resolution exists.
3. Gate 2 — derive regions by flood-filling walkable classes and validate the
   story graph, guards, coastal contacts, terrain-distribution contract,
   shortcut rejection, and gateway throat widths against the approved macro
   geography. Failures are fixed by editing geography, never by adding
   compensating blockers. Owner approves the derived topology.
4. Gate 3 — upscale to the native class raster with seeded noise-displaced
   boundary refinement; the checked-in native raster becomes authority.
   Derive the walkable mask and collision contours mechanically (marching
   squares, actor-radius `4` erosion, curvature-preserving simplification) and
   run the full deterministic suite: clearance, substep `2`, connectivity,
   coast contact, shortcuts, Crystal closed/open states, two-build equality.
5. Gate 4 — author or generate artwork per class region with the native class
   raster as layout authority. Conformance is mechanical: art may add detail
   inside a class but may never move a class boundary. Walkable light-forest
   must depict forest-floor ground between blocking trunks; the player must
   never appear to walk on top of trees. Roads and trails remain a guidance
   layer with zero mask contribution. Fix art, never geometry.
6. Approve the act only after native and phone-scale visual review plus dense
   map-wide walkable/blocked sampling, edge-slide, bridge, gate, open-area, and
   full-route traversal tests. A mechanical `PASS` is never a design approval;
   every gate ends with explicit owner judgment.

No act may reuse Act 1 coordinates. The geometry schema and validation method
are shared; each act receives its own owner-locked topology and painting.

## Runtime locks

- Movement input: continuous normalized analog vector, with keyboard parity.
- World speed: `52` world pixels per second.
- Collision footprint: `4`-world-pixel foot radius.
- Maximum collision substep: `2` world pixels.
- Boundary response: deterministic tangent sliding; no axis snap, tunneling,
  sticky corners, or diagonal speed boost.
- Animation: cardinal-only G3 rows with stable dominant-axis hysteresis.
- Walk cadence: `125 ms` per `0 -> A -> 0 -> B` pose.
- Camera: fractional follow at the locked `208`-world-pixel width.

## Acceptance boundary

“Polygons placed” means all of the following are true for that act:

- every intended open area can be explored away from the road;
- the majority of the walkable union is region area rather than narrow gateway
  or route-shaped area, and every intended region retains a substantial
  radius-4 core away from its semantic road;
- every painted road, pass, bridge, and threshold can be traversed naturally;
- water, cliffs, forest walls, structures, and preserved blockers cannot be
  crossed or entered;
- pressure against boundaries produces smooth forward sliding without jitter;
- the entire semantic route graph remains reachable with gates in their valid
  states and no decorative shortcut becomes a progression shortcut;
- native-resolution and locked-phone overlays show no visible boundary error;
- deterministic tests and a fresh read-only review pass.

The phrase does not mean all acts are complete when only one act has final art.
Each act crosses this gate independently against its own locked painting.
