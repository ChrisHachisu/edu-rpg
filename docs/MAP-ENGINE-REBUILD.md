---
date: 2026-07-14
type: architecture
status: locked
project: edu-rpg
milestone: selective-map-engine-rebuild
---

# Selective map-engine rebuild

## Decision

Rebuild the overworld, town, and dungeon map subsystem as maintainable source
while retaining the shipped game's battle system, player progression, quests,
inventory, localization, UI, save identity, and native shell.

The shipped 4.99 MB bundle remains the behavioral reference and rollback path.
The stale checked-in TypeScript build is not a reconstruction source and must
never be used to replace the shipped artifact.

## Mandatory stabilization prerequisite

`docs/STABILIZATION-PLAN.md` must pass before selective-engine implementation or
worktree delegation begins. The current `main` branch cannot reproduce the
shipped runtime in a fresh worktree because the healthy bundle, current
overrides, most assets, iOS project, and current documentation are ignored,
untracked, or dirty.

The stabilization milestone preserves the opaque shipped bundle as a vendor
dependency, establishes tracked canonical code/data inputs, adds non-Vite
hydration and manifest verification, proves save/runtime behavior, and produces
an owner-authorized baseline commit. The selective rebuild branches from that
baseline, not from today's stale tracked source.

## Locked outcomes

- Continuous, buffered, cardinal movement with tile-center semantic commits.
- Dark Terrain F world quality with the natural dirt trail locked in
  `design/art-refs/terrain-f-natural-trail-comparison-locked.png`.
- Field heroes and NPCs use the owner-approved 64×64 native-frame scale and
  Terrain F-matched detail density locked in
  `design/art-refs/field-character-scale-64-device-locked.png`; monsters remain
  unchanged.
- Forest/tree terrain is simply impassable; trees are not physics bodies.
- The minimap is a separate renderer of the same semantic world data.
- Towns are rebuilt one by one as distinct, natural settlements.
- Dungeon floors are regenerated holistically from preserved gameplay contracts.
- Existing dungeon floor layouts are not references for the new topology.
- Crystal Cave remains excluded because repository rules prohibit modifying its
  generation.

## Boundary of the selective rebuild

The new map engine owns:

- semantic map generation and loading;
- movement, collision, camera, fog, and minimap presentation;
- world/town/dungeon topology;
- NPC, landmark, transition, encounter-zone, and special-object placement;
- map-specific validation and save-position migration;
- layered, culled rendering of environment atlases and props.

The retained shipped systems own:

- player stats, inventory, equipment, gold, and progression;
- quests, story flags, encounters, battles, rewards, and bosses;
- menus, shops, healers, dialogue, localization, and save persistence;
- item, monster, audio, and native iOS content outside the map subsystem.

An adapter must translate map events into the existing shipped calls. Replacing
the map subsystem does not authorize rewriting retained systems. Overworld
ownership also does not authorize a macro relayout: production geography,
routes, landmark coordinates, general terrain, and scale remain anchored to the
current 320×400 shipped world.

## Conceptual semantic map contract

Names below describe required information, not existing source types or final
API identifiers.

| Information | Purpose |
|---|---|
| Map identity, kind, revision, and deterministic seed | Reproduce the same world/floor and migrate saves safely |
| Terrain cells | Grass, forest, water, mountain, structures, hazards, and other material meaning |
| World-region membership | Assign global mainland cells to irregular Act regions without changing the retained overworld map ID |
| Route cells/graph | Connected roads, trails, clearings, room connections, and intended progression |
| Derived walkability | Forest/water/mountain blocked; routes and valid ground walkable; specials apply explicit rules |
| Landmarks and transitions | Towns, dungeons, stairs, portals, entrances, exits, and boss gates |
| Actors and interactions | NPC roles, shops, healers, save points, signs, and quest interactions |
| Encounter and mechanic regions | Encounter zones, fog, ice, wind, lava, quicksand, mirrors, puzzles, and dungeon-specific behavior |
| Special placements | Keys, locked doors, crystals, treasures, stairs, mechanic props, and bosses |
| Visual tags | Biome, material, prop family, depth anchor, and atlas/chunk selection |

Collision is normally derived from terrain and special rules. A separate
hand-painted tree collision system is not part of the design.

### Semantic data implementation contract v1

The first engine slice uses integer, zero-based, row-major cells. Terrain,
routes, clearings, landmarks, and special placements remain separate semantic
layers; a route is never inferred from artwork and never makes blocked terrain
walkable. Forest, water, mountain, and structure terrain are blocked by default.
Every landmark declares a walkable approach on a route or clearing, and route
segments are cardinally contiguous.

The minimap consumes the same terrain, route, and landmark layers through a
dedicated derived model. It has no dependency on world-render pixels, atlases,
or props. This slice deliberately does not wire the model into the legacy scene,
migrate saves, generate final terrain art, or change any dungeon generator.

Progression gates are a separate semantic layer. Each gate occupies a route or
clearing cell and names one retained story flag. State-aware reachability starts
from an explicit landmark approach and treats gates with false or absent flags
as closed; structural validation still checks the complete topology and rejects
gates that do not change landmark reachability.

### Connected-mainland topology contract

The main overworld remains the current 320×400 world in one global coordinate
system. Preserve its broad southwest/southeast/northeast/northwest geography,
ordered connection manifest, progression routes, landmark coordinates, biome
placement, general terrain character, and scale. The rejected connected-mainland
boards and `20/23/20/20/17` capacity proposal are not implementation inputs.

Connect the current land regions through the smallest terrain-only change.
Replace only inter-Act water gaps around the existing Crystal Cave, Shadow Cave,
and Volcanic Forge corridor families with ground substrate plus blocked mountain
and/or forest terrain. Existing dungeon mouths and routes remain the only
playable crossings; the new land must not create an ordinary bypass.

Act 3 and Act 4 already share the northeast land region. Do not create a new
water gap or reshape that region. The current Magma Tunnels relationship may be
the semantic progression boundary only after its retained multi-mouth behavior
is verified.

Preserve all other water: the outer ocean/coast, Millbrook-area lake, Frozen
Lake, Oasis water, Demon Castle moat, local/decorative water, and the four
separate portal-world maps. Classify terrain by tile ID and behavior rather than
legacy comments because several sections named river/swamp emit blocked mountain
tile `4`, not water tile `2`.

Exactly four portal lands remain separate `portal-overworld` maps reached through
their current Act 5 anchors. Towns and dungeons remain separate local maps.
Act-region changes do not change retained `mapId: 'overworld'`; region identity
derives from the unchanged global cell.

The preserved shipped ordered mainland connection manifest remains authoritative:
41 physical anchors comprising 11 towns, 26 dungeon anchors/mouths, and 4 portal
anchors. No destination, duplicate mouth, coordinate, or retained Act ownership
may change as part of the terrain conversion. The checked-in `maps.ts` value for
Scorched Ruins is stale: use the shipped `(208,120)`, not source `(278,82)`.

Crystal Cave remains excluded from topology/generation changes. Converting
overworld terrain near its retained mouths does not authorize changing the
dungeon or its retained transition behavior.

Existing overworld coordinates remain meaningful because this work preserves
the map dimensions and anchors. Terrain conversion alone must not relocate an
old save. The existing safe-position fallback remains available only when an
independent validation proves the saved cell itself is invalid.

Because the retained selector currently routes by `mapId: 'overworld'`, selective
cutover and rollback are whole-mainland atomic. Region-level rollout requires a
separate approved region-aware selector and verified cross-engine boundary
handoffs; a region layer alone does not provide that capability.

## Overworld generation

Generation order is semantic-first.

### Owner-approved Act 1 reconstruction slice

Act 1 is the first full-scale reconstruction exception to the earlier
corridor-only preservation contract. It remains on the exact `320 x 400`
global grid and preserves the source water mask outside the owner-approved Port
Sapphire harbor/channel and bridge allowlist. It preserves all eight threshold
coordinates, retained transition payloads, and the exact seven-edge landmark
graph. Its non-water terrain is deliberately reclassified into a measured
renderer-facing surface plan: meadow `32%`, trail/apron `8%`, blocked forest
`47%`, and blocked mountain/coastal rock `13%`.

The owner-locked visual is
`design/review/overworld-art-blueprint/act-by-act/act1/generated/act1-v4-routing-corrections-v3-2368x2912.png`
(SHA-256 `7f4b0b9be8633a1a16946cf90b7794f306d7b268d4ecb54381998a1fc55774fd`).
Its darker, softer global finish is explicitly accepted. Port Sapphire has a
navigable harbor channel to open sea beneath a walkable Port-to-Coastal-Reef
bridge. Millbrook's southeast shortcut is a forced blocked-forest belt, while
Greenhollow-to-Millbrook remains open over its west bridge and
Millbrook-to-Port remains open.

Act 1 landmark entries are walkable terrain thresholds adjacent to their route
approaches. Village streets, harbor access, cellar steps, cave mouths, reef
descent, and the Crystal mountain mouth are renderer-owned environment
assemblies keyed by landmark ID. They are not generic portal props or
`transition` specials.

The production-scale semantic source is `src/map-engine/act1Overworld.ts`; the
older `30 x 24` starter remains a structural test fixture. The additive
`public/act1-world-map.js` / `dist/act1-world-map.js` twins mutate legacy tile
data only and are topology diagnostics/rollback scaffolding. They are not the
production visual renderer and cannot satisfy V3 fidelity. The high-fidelity
browser/runtime work proceeds from
`design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/ACT1-HIFI-RUNTIME-CONTRACT.md`.
This does not authorize Act 2 reconstruction or any Crystal Cave generation
change.

### Preservation-first later-mainland corridor work

For unapproved later regions, the corridor-only generation order remains:

1. Import and freeze the current 320×400 landmark, route, special-tile, zone,
   and water snapshots.
2. Define explicit minimal masks for the Crystal, Shadow, and Volcanic water-gap
   corridors.
3. Convert only water inside those masks to ground substrate with blocked
   mountain/tree barriers around the retained crossing routes.
4. Preserve all landmark approaches, routes, clearings, encounters, portals,
   and other terrain outside the masks.
5. Validate geographic land connectivity and retained progression locks.
6. Emit independent world-render and minimap-render inputs.

The route may remain grid-based while the world renderer softens it into the
locked irregular dirt trail. The minimap renders a simplified path line from the
same route data. Neither renderer changes collision or connectivity.

### Required overworld gates

- Every required landmark is reachable in its intended progression state.
- Forest cells are blocked and cannot strand the player between route segments.
- Barriers cannot be punctured by route width or landmark clearing.
- Gated regions remain unreachable until their required state is present.
- Every transition has at least one valid approach and arrival tile.
- The generated result is deterministic for a fixed seed and revision.
- Old-save positions retain their exact coordinate when valid; safe relocation
  is available only after independent validation proves the saved cell invalid.
- Main-world land forms exactly one connected geographic component.
- The ordered 320×400 overworld connection manifest remains equivalent to the
  preserved shipped manifest, with all 41 physical anchors at their retained
  shipped coordinates.
- Outside the owner-approved Act 1 reconstruction plate, fixed-seed route
  cells, landmark/special tiles, portal anchors, and encounter-zone
  classifications remain unchanged.
- Outside Act 1, terrain diffs remain confined to explicit allowlisted masks
  around the Crystal, Shadow, and Volcanic corridor families until a later
  region receives its own reconstruction approval.
- Every changed cell was water before conversion and becomes ground, mountain,
  or blocked forest.
- All water outside the allowlists remains unchanged.
- Each converted gap uses mountain/blocked-tree terrain outside its retained
  route or dungeon-mouth corridor; no ordinary cross-Act bypass is reachable.
- Act 3/4 receives no invented water boundary or macro reshape.
- Every retained town and dungeon appears exactly once in its retained Act;
  deletion and silent Act reassignment are rejected.
- Exactly four authoritative portal lands exist on distinct non-main maps, with
  no ordinary land or route adjacency to the mainland; their four transitions
  originate at distinct anchors inside Act 5.
- Existing overworld saves retain their coordinates when those cells remain
  valid; the terrain-only conversion does not trigger blanket relocation.

## Town rebuilds

Towns are rebuilt individually, not by reskinning one repeated procedural plan.
Each town gets a small authored layout recipe describing its identity and
functional content, then generates or assembles its semantic layout.

Preserve per town:

- town identity and world connection;
- required NPC roles and quest interactions;
- shop, healer, save, and transition behavior;
- progression/story conditions and localization keys.

Rework freely:

- town dimensions and internal coordinates;
- roads, alleys, plazas, gardens, shorelines, walls, and building arrangement;
- visual storytelling and district structure;
- prop and vegetation placement.

Every functional building or NPC must have a walkable approach, interaction
position, and readable route from the entrance. Coordinates become outputs of
the new town plan rather than compatibility constraints.

## Holistic dungeon-floor regeneration

### Preserved behavior manifest

Before rebuilding a dungeon, extract only its shipped gameplay contract:

- dungeon identity, floor count, and progression direction;
- entrance, exit, and inter-floor transition behavior;
- save-crystal behavior and intended availability;
- key inventory, locked-door sequence, and consumption rules;
- treasure behavior and reward budget;
- dungeon-specific mechanic and required mechanic spaces;
- boss identity, boss gate, arena needs, and post-defeat exit behavior;
- encounter zone and required story flags.

### Forbidden layout inputs

The new generator must not use the existing dungeon's:

- floor tile arrays or screenshots;
- room locations, sizes, or adjacency graph;
- corridor shapes or lengths;
- special-object coordinates;
- current spawn-to-goal route;
- wall/floor distribution as a visual template.

This is a full topology rework, not a reskin or perturbation of the current map.

### Generation order

1. Build a progression graph for the floor and dungeon-wide state.
2. Assign dungeon-specific spatial motifs and mechanic regions.
3. Generate rooms, caverns, paths, loops, vertical structure, or other topology
   appropriate to that dungeon's identity.
4. Place entrance and stairs/transitions from the progression graph.
5. Place keys before their corresponding locked doors and prove the sequence.
6. Place save crystals at the intended progression boundary with a valid approach.
7. Place treasures in optional branches without blocking required progression.
8. Create mechanic-specific spaces and place their semantic triggers/assets.
9. Create the boss approach, arena, gate, and post-defeat transition.
10. Emit visual tags and special-asset placements from the completed semantic map.
11. Run stateful validation; reject and regenerate any failing floor.

Special assets are generator outputs. A chest, key, door, crystal, stair, puzzle
prop, or boss marker is never placed merely because a later renderer found an
empty-looking tile.

### Dungeon validation gates

- Entrance-to-exit reachability is proven for every valid progression state.
- No locked door is required before its key can be obtained.
- Keys cannot be consumed by speculative collision checks.
- Save crystals, stairs, treasures, mechanic triggers, and boss approaches are
  reachable in their intended state.
- Optional branches cannot accidentally become mandatory.
- Mechanic regions have enough space for their full behavior and readable art.
- A floor cannot contain unreachable non-secret regions or isolated required props.
- The final boss and post-defeat exit contract are preserved.
- Fixed seed + map revision produces a deterministic semantic result.
- Floors within a dungeon must pass a structural-diversity comparison; identical
  generic room/corridor graphs are rejected.

Use a new isolated deterministic random stream in the selective engine. Do not
alter the legacy bundle's seeded `h()` call sequence. Crystal Cave generation is
not part of this work unless the owner separately changes the repository safety
rule.

## Save compatibility

The retained external position remains map ID, integer x/y, and floor. Fractional
movement coordinates are never persisted.

Town and dungeon rebuilds may intentionally invalidate old coordinates, so their
migration remains map-kind specific. The preservation-first overworld terrain
conversion does not invalidate coordinates by default:

- overworld: retain the exact saved coordinate when valid; use the nearest valid
  route/clearing fallback only when validation proves that cell invalid;
- town: the town entrance or a mapped functional anchor;
- dungeon: the floor entrance or the most recent valid save-crystal anchor;
- transition arrival: the new transition's declared safe arrival tile.

Before production cutover, preserve a complete pre-migration save snapshot. A
map revision must distinguish legacy and rebuilt coordinates. Rollback restores
the snapshot and the legacy map scene; it does not reinterpret rebuilt dungeon
coordinates against the old floor.

## Migration sequence

1. **Stabilization:** complete `docs/STABILIZATION-PLAN.md` and prove a fresh
   worktree can hydrate and verify the preserved runtime.
2. **Behavior census:** create shipped behavior manifests without copying floor
   topology.
3. **Engine shell:** new semantic map model, adapter, movement controller,
   validators, minimap interface, and feature flags.
4. **Overworld vertical slice:** blocked forest, connected natural route, one
   landmark transition, minimap, save relocation, and Terrain F chunk rendering.
5. **Preservation-first overworld:** capture the shipped fixed-seed baseline,
   convert only the three allowlisted water-gap corridors, and validate unchanged
   coordinates, routes, landmarks, water features, progression, and saves.
6. **Field character production:** after the overworld renderer/camera device
   gate, regenerate the hero and NPC families at the locked 64×64 scale and
   density, then verify them in motion on device.
7. **Towns one by one:** lock each semantic plan and visual mock before integration.
8. **Dungeon pilot:** rebuild Darkfang Grotto near Greenhollow end to end, unless
   its shipped identity proves it is a prohibited gate dungeon; Crystal Cave
   remains excluded.
9. **Dungeons one by one:** a separate behavior manifest, topology review,
   mechanic proof, art lock, and simulator verification for each dungeon.
10. **Cutover:** only after parity, performance, save migration, and rollback gates pass.

Special assets are produced per map only after that map's semantic topology,
mechanic spaces, and placement manifest are locked. Overworld landmarks follow
the full overworld graph; town-specific props follow each approved town plan;
dungeon doors, keys, crystals, stairs, portals, puzzle props, and boss markers
follow each approved dungeon topology. This avoids generating attractive assets
that later have no valid gameplay placement.

## Rollback boundaries

- Keep the legacy WorldMapScene and renderer loadable behind a feature flag.
- Do not replace or rebuild the shipped bundle from stale source.
- Keep each town and dungeon migration independently selectable.
- Do not delete legacy map behavior during the migration.
- A failed map, save, performance, or mechanic gate disables only that migrated
  map and returns it to the legacy scene.

## Proof required before a map is accepted

- deterministic semantic-map snapshot/hash;
- automated reachability and progression-state solver results;
- special-placement inventory with no missing/duplicate required objects;
- save migration and rollback test from representative shipped saves;
- rendered screenshots for map readability and minimap agreement;
- motion video for continuous movement, camera, occlusion, and chunk transitions;
- canonical iPhone simulator FPS, frame-time, load-time, and memory gates;
- real-entry-path playthrough of the map's transitions and mechanics.

No implementation, generated floor, environment batch, or release is accepted
from source inspection alone.
