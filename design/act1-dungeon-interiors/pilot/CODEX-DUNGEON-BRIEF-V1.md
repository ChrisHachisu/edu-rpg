# Codex dungeon-interior brief V1 — pilot tile

Adapted from `owner-terrain/art-tiles/CODEX-ART-BRIEF-V7.md`, which is locked and proven on
the overworld. Same method, same discipline, new subject: the inside of a cave.

IMAGE GENERATION ONLY. Additive. NO git commit, NO build, never `npm run build`.
Do not modify any `*-base.png`, `*-mask.png` or `*.json` in this directory — they are inputs.

## What this pilot is for

This is a single tile, run before 18 floors are committed to. It answers one question: does a
dungeon art base carry enough instruction for the elevation to come back faithful? If it does
not, the base gets more material before anything scales.

## The method

`whisperingWoods-f3-tile-base.png` is a **textured proxy-art base** and it is **composition
truth**.

> Reproduce what the base shows. Add material and light. **Invent nothing.**

This is not a colour map to paint freely from. On the overworld, three passes given flat colour
maps drifted 25–60%; one silently deleted a rock cap, another invented rivers. Elevating a
textured base cut drift to ~1%. Keep it there.

- Do NOT move, resize, add, remove, merge or re-route any chamber or passage, however small.
- Do NOT invent water, chasms, bridges, stairs, doors, rubble piles or structures.
- Do NOT straighten, widen, narrow or redraw any wall. The boundaries are already organic and
  correct — they were smoothed deterministically and every cell centre is pinned.
- A one-cell crawlway is deliberate. Do not open it out because it looks tight.

## The one hard rule

The base has exactly two regions, and the boundary between them is **gameplay, not art
direction**:

| in the base | is | must read as |
|---|---|---|
| the lighter, open region with the soft interior gradient | **cave floor** | **walkable** — the player physically walks exactly here |
| the darker mottled region with the lit lip along its edge | **solid rock** | **impassable** — a wall the player cannot enter |

`whisperingWoods-f3-tile-mask.png` is the same tile as a hard two-colour truth map: sand
`226,210,156` is floor, dark `40,38,44` is rock. It is for checking, not for painting from —
paint from the base.

A floor cell that reads as rock is a passage the player is wrongly blocked from. A rock cell
that reads as floor is a wall the player walks into. Both are defects.

## NO ASSETS — chests, stairs and crystals are sprites

Same decision as the overworld landmarks (owner, 2026-07-30): interactive objects are
composited at runtime, not baked. The base carries only the **place**.

Draw **no** chest, door, stairway, save crystal, sign, ladder, boss, torch bracket, brazier,
skeleton, barrel or any other object. Floor is floor all the way across.

## Materials — this tile

Theme: **root-riddled earth cave** (Whispering Woods, floor 3).

| in the base | elevate into |
|---|---|
| open floor region, brighter toward its middle | **walkable cave floor** — packed earth and fine gravel, scattered grit, damp patches, a few small fallen stones, tree roots breaking through from above. Keep that variety; do not average it into one flat brown. |
| the lit lip running along every wall edge | the **top edge of the wall** where it catches the light — mossy faceted stone and exposed earth, crisp facets |
| dark mottled mass behind the lip | **impassable rock and packed earth** — cliff face with real cast shadow into the floor, roots and rootlets threading the wall, moss in sheltered hollows, deep shadow in the recesses |
| the soft darkening where floor meets wall | **contact shadow** at the foot of the wall — keep it; it is what makes the wall read as having height |

Never corduroy furrows. Never flat flagstones, paving, brickwork or worked masonry — this is a
natural cave, not a built room.

## Style

Locked ENVIRONMENT STYLE BLOCK, verbatim:

> Dark, dense, realistic old-growth JRPG environment art viewed from a 3/4 top-down perspective: richly layered evergreen foliage, weathered stone and timber, moss, roots, leaf litter, natural terrain transitions, deep forest shadows, crisp faux-pixel material detail, controlled highlights from a single upper-left light source, and strong route and character readability. Avoid flat tiled repetition, bright toy-like terrain, empty lawns, rigid building grids, and generic rectangular rooms.

Attach as style references:
1. `design/review/overworld-art-blueprint/act-by-act/act1/dq-art-full-v2/semantic-test/tile-4-8-ART.png`
2. `design/art-refs/terrain-f-natural-trail-comparison-locked.png` — the RIGHT natural
   dirt-trail panel is the positive reference for ground material; the LEFT brick-road panel is
   negative context and is **not** the target.

Crisp faux-pixel finish, stepped shading, single upper-left light. NOT painterly. NOT flat
cartoony cel. A world cell is 48 px; a boulder is 30–70 px, a root 8–25 px wide.

Tone: this is underground, so it is darker than the overworld, but the same lifted treatment
applies — do not crush it to black. The floor must stay clearly readable as the walkable
surface at a glance, because that is how the player navigates.

## Deliverable

- `whisperingWoods-f3-tile-ART.png`, **exactly 1248×1248**, in this directory
- Cell-aligned to the base: cell *(i, j)* of the output is pixels
  `x = i*48 … i*48+47`, `y = j*48 … j*48+47`, the same as in the base
- A short note on anything the geometry forced

## Verification before you call it done

Sample the artwork at all 676 cell centres against `whisperingWoods-f3-tile-mask.png`:
every sand cell must land on ground that reads as walkable cave floor, every dark cell on
something that reads as impassable rock. **Report the mismatch count.** A pass with mismatches
is not done.
