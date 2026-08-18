---
date: 2026-08-19
type: spec
project: edu-rpg
milestone: act1 towns
status: active
tags: [spec, act1, towns]
---

# T4B — greenhollow and millbrook, the two remaining Act 1 town interiors

Everything on this page is **measured out of the shipped bundle and the shipped Port Sapphire
files**, not inferred from a handoff. It exists so the remaining work is mechanical.

## What Act 1 actually contains

Authority: `LANDMARKS` in `public/act1-world-map.js`. Act 1 has **eight** landmarks and no others.

| kind | map ids |
|---|---|
| towns (tile 6) | `greenhollow`, `millbrook`, `portSapphire` (SHIPPED) |
| dungeons (tile 7) | `sunkenCellar`, `whisperingWoodsCave`, `coastalReef`, `mistyGrotto` |
| act gate (tile 15) | `crystalCave` — **never modify** |

The `frostfallVillage` / `hauntedVillage` / `stormreachVillage` / `sunkenTempleVillage` /
`twilightVillage` named in the 2026-08-19 handoff **do not exist in this game**. Do not generate art
for them.

## The hi-fi town is an IFRAME, not the in-game renderer

This is the single most load-bearing fact for scoping, and no handoff states it.

- `public/act1-hifi/adapter.js` holds `const TOWN_IDS = new Set(['portSapphire'])`. When the player
  enters a town in that set, the adapter swaps in an **iframe running `act1-hifi/town.html`**, which
  loads the baked plate, the walkable JSON, the hero sheet and the NPC sheets.
- `dq-tiles.js`'s own `reskinTown()` is a **procedural** path that draws from the Phaser tile map
  (`drawTownGround` / `drawTownObjects`). It never reads `portSapphire-screen.png`.

So adding a town is: produce its files, then add its id to `TOWN_IDS`. A town not in that set keeps
rendering procedurally and the plate is dead weight.

## Per-town file manifest — 8 new runtime files each

Modelled on the shipped Port Sapphire set:

| file | note |
|---|---|
| `public/act1-hifi/town/<id>-screen.png` | the plate, **1950x1950** |
| `public/act1-hifi/town/<id>-foreground.png` | overhead props she walks beneath |
| `public/act1-hifi/town/<id>-foreground.json` | their regions |
| `public/act1-hifi/town/<id>-walkable.json` | derived, then authored-exemption corrected |
| `public/act1-hifi/town/<id>-town.json` | the manifest below |
| `public/act1-hifi/town/npc/<id>-<npc>-4x3-64.png` | one per NPC, 192x256, magenta-keyed to RGBA |

**Every one of these is a genuinely NEW runtime asset.** Each therefore needs its pin key added BY
HAND in `scripts/runtime_baseline.py` with placeholder zeros, then `npm run repin`, then a COUNT of
the files in `ios/App/App/public/` (706 today) — otherwise it passes every gate and never ships.

## `<id>-town.json` — the schema, from the shipped Port Sapphire file

```
id, nameKey, screen, foreground, walkable,
cells: 65, artPxPerCell: 30, worldPxPerCell: 16,   # 65 * 30 = 1950, the plate
startCell: [x, y],                                  # where she arrives from the overworld
npcs: [ { id, dialogueKey, nameKey, sheet, cell: [x, y], name, text } ],
savePoint: [x, y]
```
`cell` is in TOWN CELLS (0..64), fractional, and is the NPC's foot position. NPC `text` is inlined in
this file — it is not read from the frozen bundle's locale tables.

## The NPC rosters are already fixed by the base game

Read out of `dist/assets/index-BhoGQRaA.js`. Both towns are 16x16 in the engine, connect to the
overworld from `(8,15)`, and carry `savePoint {x:8, y:10}`. **These ids, dialogue keys and relative
positions must be preserved** — quests turn in against them (`kikisChallenge` turns in at `kiki` in
greenhollow; `sage` in millbrook is a quest turn-in too).

**greenhollow** — `shopId: "greenhollow"`, **six** NPCs (two more than Port Sapphire):

| id | dialogueKey | engine cell |
|---|---|---|
| `elder` | `npc.elder.greeting` | (8,3) |
| `kiki` | `npc.kiki.greeting` | (6,3) |
| `healer` | `npc.healer` | (3,12) |
| `villager1` | `npc.villager1` | (3,5) |
| `villager2` | `npc.villager2` | (12,5) |
| `fisherman` | `npc.fisherman` | (13,10) |

**millbrook** — `shopId: "millbrook"`, **four** NPCs, structurally identical to Port Sapphire:

| id | dialogueKey | engine cell |
|---|---|---|
| `sage` | `npc.sage.greeting` | (8,3) |
| `healer` | `npc.healer` | (3,12) |
| `miller` | `npc.miller` | (3,5) |
| `herbalist` | `npc.herbalist` | (12,5) |

Port Sapphire, for comparison: `drake` (8,3), `healer` (3,12), `sailor` (3,5), `wisewoman` (12,5).
So the healer and the shopkeeper sit at the same two cells in all three towns — the 16x16 engine map
is a shared template, and the hi-fi plate only has to keep the same READING of the town, not the same
pixels.

Engine cell -> town cell: the engine map is 16x16 and the plate is 65 cells, so multiply by 65/16 and
place the NPC on paving the derived walkable mask actually calls open. Do not paste Port Sapphire's
fractional cells; they were placed against its own art.

## THE TILE RULE — arithmetic, not preference

The image tool ALWAYS returns **1254 px**. A plate must be **1950** for an exact 3x device upscale.
So a single generation must be scaled UP 1.55x, and upscaling destroys sharpness — measured mean
pixel step **20.64 -> 13.97**, while downscaling to 650 gives **25.67**. Therefore every plate is
generated as **2x2 tiles at 1254 each** via `scripts/rebake_town_tiles.py`, each tile grafting its
neighbour band from **RAW generator output**. A band that reaches the model already upscaled arrives
as mush and the model redraws the join (measured 88.7 mean step across such a seam). 2x2 rather than
3x3: two seam lines instead of four.

**Never upscale-and-posterize to reach 1950.** That is what produced the rejected v6.

## The gate

```
python3 scripts/check_town_finish.py <plate> --walkable public/act1-hifi/town/<id>-walkable.json
```
Port Sapphire, ACCEPTED by the owner, scores mean pixel step **22.2**, hard **29.4%**, soft **38.4%**,
density exactly 1.875 art px/world px -> 3.0000x. A new town must reach those numbers. The SOFT band
(22–40%) is the filter detector and must never be loosened.

The finish floor was recalibrated from the owner's own approval point (hard 22%, mean 17) because the
hero-derived floor rejected what he liked and CAUSED v6's posterize. Do not re-derive it.

## Order of work

1. Land T3's seam fixes first — per-tile exposure match BEFORE stitching, then the min-error-cut
   quilt. A new plate generated on the old pipeline inherits the seam the owner just complained about.
2. millbrook before greenhollow: four NPCs and a Port-Sapphire-shaped roster, so it is the cheaper
   proof that the pipeline reproduces on a second town.
3. NPC sheets: author on magenta (the generator cannot emit alpha), 3x4 of 64 px = 192x256, then
   `scripts/bake_npc_sheets.py` (which keys via `place_town_npcs.py`'s `key_cell`, the same function
   `check_character_finish.py` gates against, so the shipped sprite is the measured one).
4. `scripts/place_town_npcs.py` for placement; correct the walkable mask with authored exemptions
   (`derive_town_walkable.py`'s `stamp_exemptions`) rather than by hand-painting.
5. Add both ids to `TOWN_IDS` in `adapter.js` — **last**, so a half-built town can never ship live.
6. Pin keys by hand, `npm run repin`, COUNT `ios/App/App/public/`.

## Codex mechanics

- `codex exec` with an explicit `-m` (`gpt-5.6-sol` is what the town pipeline uses).
- **`-i` is VARIADIC** — a positional prompt after it is swallowed as another image. Brief on **stdin**.
- Codex writes output **next to the INPUT** as well as under `~/.codex/generated_images/`, and it has
  written into `docs/handoffs/` before, which breaks latest-handoff-first. Check that directory is
  clean before trusting `ls | sort -r | head -1`.
- `design/act1-towns/rebake/brief-*.md` holds the brief format that actually worked.
