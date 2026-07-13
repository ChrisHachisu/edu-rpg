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
the map subsystem does not authorize rewriting retained systems.

## Conceptual semantic map contract

Names below describe required information, not existing source types or final
API identifiers.

| Information | Purpose |
|---|---|
| Map identity, kind, revision, and deterministic seed | Reproduce the same world/floor and migrate saves safely |
| Terrain cells | Grass, forest, water, mountain, structures, hazards, and other material meaning |
| Route cells/graph | Connected roads, trails, clearings, room connections, and intended progression |
| Derived walkability | Forest/water/mountain blocked; routes and valid ground walkable; specials apply explicit rules |
| Landmarks and transitions | Towns, dungeons, stairs, portals, entrances, exits, and boss gates |
| Actors and interactions | NPC roles, shops, healers, save points, signs, and quest interactions |
| Encounter and mechanic regions | Encounter zones, fog, ice, wind, lava, quicksand, mirrors, puzzles, and dungeon-specific behavior |
| Special placements | Keys, locked doors, crystals, treasures, stairs, mechanic props, and bosses |
| Visual tags | Biome, material, prop family, depth anchor, and atlas/chunk selection |

Collision is normally derived from terrain and special rules. A separate
hand-painted tree collision system is not part of the design.

## Overworld generation

Generation order is semantic-first:

1. Create the required landmark/progression graph.
2. Route connected paths between required nodes with protected clearance.
3. Assign biomes, water, mountains, barriers, and blocked forest around routes.
4. Create natural clearings and approaches around landmarks and transitions.
5. Place encounter zones, signs, gates, portals, and other interactions.
6. Validate global reachability and progression locks.
7. Emit independent world-render and minimap-render inputs.

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
- Old-save positions resolve to a safe route, clearing, or landmark approach.

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

Because rebuilt layouts intentionally invalidate old coordinates, migration is
map-kind specific:

- overworld: nearest valid route/clearing associated with the same progression area;
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
5. **Full overworld:** generate and validate the complete progression world.
6. **Towns one by one:** lock each semantic plan and visual mock before integration.
7. **Dungeon pilot:** one non-gate, non-Crystal dungeon rebuilt end to end.
8. **Dungeons one by one:** a separate behavior manifest, topology review,
   mechanic proof, art lock, and simulator verification for each dungeon.
9. **Cutover:** only after parity, performance, save migration, and rollback gates pass.

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
