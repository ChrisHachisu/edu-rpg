---
date: 2026-07-31
type: design-spec
tags: [edu-rpg, towns, act1, port-sapphire, map-engine-rebuild]
status: OWNER-APPROVED DESIGN — generator not yet built
---

# Port Sapphire — harbour town rebuild

> [!warning] STATUS LINE ABOVE IS STALE — verified 2026-08-11
> The frontmatter still reads *"generator not yet built"*, and the section below says every shipped
> town is a 16x16 procedural room seeded from the first letter of its map id. **Neither describes
> what a player sees today.** A hand-authored hi-fi Port Sapphire SHIPS and is what the game loads:
>
> | | shipped today |
> |---|---|
> | data | `public/act1-hifi/town/portSapphire-town.json` (built 2026-08-06) |
> | grid | **65x65**, not 16x16 |
> | art | `town/portSapphire-screen.png`, a 7 MB authored screen — not generated from the map name |
> | walkable | `town/portSapphire-walkable.json` (31 KB authored) |
> | arrival | `startCell` **[33, 4]** — horizontally centred, 4 cells from the NORTH edge |
> | contents | 4 NPCs (healer, wisewoman, sailor, drake), `savePoint` [31.4, 29], `shopCounter` [24.5, 29.2] |
>
> Verified by reading the shipped runtime, and confirmed on device 2026-08-11 (iPhone 13 sim): the
> town renders authored harbour art, and correctly shows **no minimap and no compass**.
>
> **What is NOT established here:** whether this spec's *generator* approach was formally abandoned
> in favour of the `act1-hifi` hand-authored route, or is still intended for the remaining towns.
> That is an owner call and is deliberately left open rather than guessed at. What is certain is that
> **the "shipped towns are procedural 16x16" premise must not be used as a reason to redo this town.**

First town of the town rebuild programme. It establishes the method that the
remaining towns reuse: an authored plan type plus a site constraint, generated
into semantic data, validated by mechanical gates.

Owner, 2026-07-31, on scope: *"this is a complete redo of all towns. resize,
regenerate, and place npcs from scratch. do not follow what the previous version
did other than which npcs are in the town, what is sold at the shops, and how
much the healer costs"*.

## Why the shipped town is not a layout reference

Every shipped town is 16x16 with no tile array. The interior is generated at map
load from the town's name alone:

```js
else if (T.type === "town") this.mapData = wp(T.width, T.height, x.charCodeAt(0) * 137)
```

The seed is the **first character of the map id**, so towns sharing an initial
letter are byte-identical inside: `hauntedVillage` / `havensEdge`,
`frostwatch` / `frostfallVillage`, and `stormreachVillage` /
`sunkenTempleVillage` are each the same town twice. This is the same defect
class as the shipped dungeon generator seeding from `mapId.charCodeAt(0)`, and
`ART-DIRECTION.md` rule 4 forbids "one repeated rectangular town template"
outright. Shipped town coordinates are therefore forbidden inputs, in the same
way dungeon floor topology is forbidden in `docs/MAP-ENGINE-REBUILD.md`.

The scope decisions that bound this spec, both taken 2026-07-31:

- **No hidden loot and no search mechanic in towns.** Town-wide hidden finds
  convert a 30-second stop into a pot-smashing subloop, and in a learning game
  the town is the pause between loops, not a third loop. At most one authored,
  one-time, signposted find per town, and Port Sapphire has none.
- **No enterable building interiors.** Shop and healer resolve at the door on
  the town map. The shipped town atlas already carries `Door`, `ShopWindow`,
  `Awning` and `Counter`, so door-side interaction was always the intent and
  cutting interiors costs nothing. Revisit only if the game reads thin.

## Preserved contract

Extracted from the shipped bundle (`dist/assets/index-BhoGQRaA.js`), which is
authority; the checked-in TypeScript source is older than the shipped game.

| Preserved | Value |
|---|---|
| Map id | `portSapphire` |
| Name key | `map.portSapphire` (EN "Port Sapphire", JA サファイア港 / サファイアみなと) |
| NPC roster | `healer`, `sailor`, `wisewoman`, `drake` |
| NPC dialogue keys | `npc.healer`, `npc.sailor`, `npc.wisewoman`, `npc.drake.greeting` |
| Shop id | `portSapphire` |
| Shop inventory | herb, potion, smokeBomb, bronzeSword, ironSword, bronzeArmor, leatherArmor, ironShield, leatherCap, ironHelm |
| Healer price | 8 G (`HEALER_PRICES.portSapphire`) |
| Quest hook | `drake` guards `drakeCargo` |

Everything else is a generator output: dimensions, every coordinate, the street
network, building arrangement, prop placement, the save point, and the
transitions.

## Locked identity

From `design/LANDMARK-SPRITE-CONTRACT.md:142`, owner note 2026-07-30:
*"sapphire should be touching the sea and the port side, the south side, should
look like a harbor. So essentially, entrances are from north, east, and west,
but not south."* Terrain measurement agrees: N 100%, E 100%, W 100% walkable,
S 0%.

- The sea is the southern wall. There is no south transition.
- The south face is a working harbour: quay, jetty, moored boats, crates,
  barrels, drying nets, mooring posts.
- Forbidden in the landmark sprite and in town props: people, animals, banners,
  signage, text, labels, UI.

## Dimensions and transitions

**28 wide x 20 tall.** Wide rather than tall because the waterfront needs
length. 16x16 cannot hold a quay plus lanes plus frontage without the buildings
crowding the walk lines.

Three transitions, one per approach face, replacing the shipped single south
exit:

| Gate | Town edge | Overworld approach |
|---|---|---|
| North | top edge | north approach point |
| East | right edge | southeast approach point |
| West | left edge | west approach point |

`design/OVERWORLD-MOVEMENT-BOUNDARIES.md:76` already records three pairwise
disconnected overworld approach points for Port Sapphire (west, north,
southeast), so the three gates map onto approach geometry that exists rather
than inventing new topology. Because those approaches are pairwise disconnected
on the overworld, **the town is the connector between them**, which makes
gate-to-gate reachability a correctness requirement, not a nicety.

Per `design/OVERWORLD-MOVEMENT-BOUNDARIES.md`, changing overworld connectivity
requires an explicit gameplay decision. That decision was taken 2026-07-31.
Act-1 overworld reachability must be revalidated after the new connections land.

## Plan type: harbour

The town rebuild programme assigns one settlement plan type per town, the direct
analogue of one karst cave pattern per dungeon in
`scripts/build_dungeon_semantic.py`. Uniqueness comes from plan type plus site,
never from noise or reskinning. Port Sapphire is the **harbour** type; the sea
does the work that joint control does in the caves.

### Skeleton

1. **Sea band** across the south edge. Water cells, impassable.
2. **Quay street**, the spine: runs east to west a short distance inland of the
   waterline, three cells wide, terminating in the west gate and the east gate.
3. **North lane**: drops from the north gate to meet the quay near the middle,
   two cells wide.

All three transitions therefore land on one continuous route. The through route
is the waterfront, so every player walks the most characterful part of the town
without being directed to.

### Frontage

Buildings front the quay on its landward side, gable ends to the water, with
setbacks jittered by zero to two cells so the frontage line waves instead of
ruling straight. This is the mechanism that makes the result read organic: plots
grow off road frontage, they are not scattered.

Two narrower lanes (two cells) climb north off the quay, one either side of the
north lane, each carrying its own frontage. Where the western lane tops out it
opens into a small well square.

### Harbour face

A timber jetty steps south into the water near the east end of the quay. **The
deck is walkable to its end**, because players will try it and a pier that
refuses entry reads as broken rather than as scenery. Boats, crates, barrels,
drying nets and mooring posts sit on and beside it as standing blockers.

## Walkability legibility

Towns are the hard case that dungeons never were. In a cave, walkable is carved
floor and rock is obviously rock. In a town everything is flat ground, so the
rule is mechanical rather than left to art judgment:

**No ambiguous cell.** Every cell is either walkable path material, or carries
something that visibly stands up.

- Quay, lanes and the well square render in path material and are walkable.
- Buildings present a visible wall face beneath the roof. A flat top-down
  building is the classic legibility failure and is banned.
- Grass is walkable only where it touches a street; otherwise it is enclosed by
  a fence or hedge.
- Every prop occupies its full cell and has a vertical element. There is no such
  thing as a decorative flat cell that happens to block.
- Water is water.

Collision is derived from terrain and special rules per the semantic map
contract. There is no hand-painted collision layer.

**The engine already enforces this rule.** Town walkability is decided purely by
tile index, blocking `{1, 2, 4, 6, 8, 9, 10, 11, 12, 13, 14, 15}`, which leaves
exactly four walkable tiles:

| Walkable | Blocked |
|---|---|
| 0 Floor, 3 Grass, 5 Path, 7 Exit | 1 Wall, 2 Roof, 4 Water, 6 Save, 8 Awning, 9 HouseWall, 10 Door, 11 ShopWindow, 12 Counter, and 13-15 |

So "walkable path material, or something that visibly stands up" is not a new
convention to police; it is the existing tile contract. The generator satisfies
the legibility rule by painting only from the walkable set for streets and only
from the blocked set for structure and props. Note that Save (6) and Door (10)
are blocked, so both are approached from an adjacent cell rather than stood on.

## NPC and asset placement

Placement is a generator output driven by role affinity to plot type, not a list
of authored coordinates.

| Actor | Affinity |
|---|---|
| Shop | quay frontage, awning and shop window facing the water, counter at the door |
| Healer | well square at the top of the western lane, off the noise of the quay |
| Sailor | jetty foot |
| Drake | beside the cargo stack near the warehouse frontage |
| Wisewoman | eastern inland lane |
| Save point | where the north lane meets the quay, on the line everyone walks |

NPCs are static with idle animation. Bounded wandering is permitted for at most
one flavour NPC and must stay within its own street segment; chasing a moving
NPC is friction a young player does not need, and free wandering can break the
approach-tile guarantee below.

## Hardcoded town positions become data driven

Three positions are pinned in runtime code rather than read from map data. All
three block a freely generated layout, and all three must move to data. Owner
decision 2026-07-31.

**1. Shop counter.** Trigger and shopkeeper sprite:

```js
if (x.shopId) { const u = x.width - 4;
  if (this.heroTileX === u && this.heroTileY === 13 && this.heroDir === 3) { /* ShopScene */ } }
```

**2. Healer.** Sprite and trigger are *also* hardcoded, at `(width - 13, 12)`:

```js
if (x.type === "town") { const T = x.width - 13; /* npc-healer sprite at (T, 12) */ }
if (S.type === "town") { const l = S.width - 13; if (o === l && u === 12) this.handleHealer() }
```

The `npcs[]` entry `healer` at `(3, 12)` merely happens to agree with
`width - 13` on a 16x16 town. The code never reads it. On a 28x20 town the
hardcode lands at `(15, 12)` and the data entry would be ignored.

**3. Town edge exit.** Walking off *any* town edge always takes
`connections[0]`:

```js
if (i.type === "town" && (x < 0 || x >= u || T < 0 || T >= o)) { const C = i.connections[0]; ... }
```

With three gates this would dump the player at the north arrival point no matter
which gate they used. Three gates are impossible without this change.

### Required changes

- Town map data gains `shopCounter: { x, y, dir }` and a real `healer` position
  read from the existing `npcs[]` entry.
- The edge-exit handler selects the connection whose `fromX`/`fromY` matches the
  edge cell the player left, instead of `connections[0]`.
- **Fallbacks keep every un-rebuilt town working unchanged:** absent
  `shopCounter`, fall back to `(width - 4, 13, dir 3)`; with a single
  connection, fall back to `connections[0]`; healer falls back to
  `(width - 13, 12)` when no `healer` npc entry exists.
- The change ships through the bundle patch procedure in `AGENTS.md`: write to a
  new temporary file, assert 4.5-5.5 MB, inspect, then copy. Never read and
  write the same bundle path.

## Validation gates

The generator emits nothing that has not passed all of these. A visual return
without inspected evidence is UNVERIFIED, not done.

1. **No ambiguous cell.** Every cell classifies as walkable path material or as
   carrying a standing blocker. Zero flat-but-blocked cells.
2. **Approach tiles.** Every NPC, the shop counter and the save point have at
   least one walkable adjacent cell with a legal facing.
3. **Gate to actor reachability.** Each of the three gates reaches every NPC,
   the shop counter and the save point.
4. **Gate to gate reachability.** All three gates are mutually reachable inside
   the town. Port Sapphire is a connector; failure here severs the overworld.
5. **Sea containment.** No water cell is reachable except the jetty deck.
6. **No dead-end pockets.** The street network contains no single-cell stub that
   reads as a path and leads nowhere.
7. **Frontage integrity.** Every building with a door has that door on a street,
   with a walkable cell in front of it.
8. **Determinism.** Identical output for a fixed seed and revision.
9. **Save migration.** Old-save positions inside `portSapphire` resolve to a
   safe street, square, or gate approach cell, per the save compatibility
   section of `docs/MAP-ENGINE-REBUILD.md`.

## Art

Materials, not maps, per `docs/MATERIAL-RENDERER-METHOD.md`. Port Sapphire
renders from a small set of tiling materials (path, grass, water, timber deck,
wall, roof) composited against the semantic grid. No tile-by-tile whole-map
generation; that approach was rejected 2026-07-31 for visible seams.

### The pixel lattice is a hard constraint, not a preference

The engine draws the world at **24 logical pixels per tile, upscaled 2x to
`TILE_SIZE = 48`** (`src/utils/constants.ts:1-4`,
`src/utils/AssetGenerator.ts:126-127`). `docs/hero-walk-art-contract.md:56-57`
states the consequence plainly: **every world pixel is a 2x2 block.**

Town material art is therefore authored or reduced at **24 px per cell and
upscaled 2x NEAREST**, never rendered at 48 px per cell directly. The existing
mechanical check applies unchanged — hero contract rule 167,
`game == logical upscaled 2x NEAREST, exactly` — and it is a gate, not a
guideline.

This is not hypothetical. The shipped dungeon material renders violate it:
`sunkenCellar-f1-material.png` is 1248x1248 for a 26x26 floor, i.e. 48 px per
cell at 1:1 detail, so it carries twice the hero's pixel density and reads as a
different game beside her. Owner flagged it 2026-07-31. Tracked separately at
`claude_brain/05-Tasks/active/edu-rpg-material-render-lattice-mismatch.md`; the
town pipeline must not inherit the same defect.

Do not confuse this with the Act 1 overworld's `912 / 512 = 1.78125`
source-pixels-per-world-pixel lattice (`design/ART-DIRECTION.md:86-90`), which
governs authored high-resolution overworld regions against a heroine drawn at 36
world pixels. Towns are tile maps and take the 24 -> 48 rule.

## Out of scope

- Building interiors.
- Hidden or searchable loot.
- Any change to battles, quests, progression, saves, UI, localization or shell
  beyond the three data-driven position fixes above.
- Other towns. Their plan types (linear street, crossroads, market square,
  radial, walled) are assigned when each is rebuilt.

## Open items

- Assign the plan types for the remaining Act-1 towns once Port Sapphire proves
  the method.
- Confirm the exact overworld arrival cells for the three gates against act-1
  geometry before the connections are written.
