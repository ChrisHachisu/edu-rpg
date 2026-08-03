---
date: 2026-07-30
type: art-contract
tags: [edu-rpg, overworld, landmarks, sprites, art-direction]
status: OWNER-DECIDED
---

# Landmark sprite contract — overworld towns, dungeons, portals

**Owner decision, 2026-07-30: landmarks are runtime sprites, not baked into the terrain
artwork.** This doc is the contract those sprites are generated and composited against. It
sits under `design/ART-DIRECTION.md` and follows the same shape as
`docs/hero-walk-art-contract.md`.

## Why sprites

1. **Landmarks are already semantic data.** `ART-DIRECTION.md` rule 3: the minimap "reads the
   same terrain, route, and landmark semantics… It does not sample the world artwork." The
   landmark list in `owner-terrain.json` is the single source of truth; baking forks it into
   pixels and creates a second copy to keep in sync.
2. **Gates need state.** Act 2's wind canyon opens only with the Storm Breaker Stone, and the
   Haunted Forest doors gate progression (`ACT2-GATES.md`). A sealed entrance and an open one
   cannot be the same frozen pixels.
3. **Landmarks move.** Both Haunted Forest doors were nudged one cell on 2026-07-29. Baked art
   means regenerating a whole 1248x1248 tile per nudge; a sprite just moves.
4. **Cost.** ~12 towns + ~15 dungeon mouths + 4 portals = **~31 sprites, reused forever**,
   against bespoke art inside whichever of ~150 tiles each landmark falls in.

Rule 6's warning against "thousands of independent tree sprites" does not apply: ~31 sprites
in a prebuilt atlas is exactly the "prebuilt atlases and layered, culled chunks" it asks for.

## The site / structure split — this is what makes a sprite blend

A composited sprite reads as a sticker when its ground contact is wrong. So the two halves are
authored separately:

| layer | owns | why |
|---|---|---|
| **terrain artwork** (baked) | the SITE — packed-earth plaza, worn approach paths, trodden grass, the clearing | it *is* terrain, so it blends by definition and needs no seam |
| **landmark sprite** (runtime) | the STRUCTURE — cottages, cave mouth, standing stones | must stay swappable, movable and state-dependent |

`scripts/build_owner_art_base.py` draws the site by default and only bakes structures behind
an explicit `--structures` flag (kept for reference renders, not for shipping tiles).

## Owner review 2026-07-30 — three locks

**1. Dungeons: Crystal Cave is the reference.** Owner: *"i like that crystal cave is naturally
embedded in the terrain. use this as a reference style for dungeons."* So every dungeon mouth
is a dark opening genuinely set INTO its surrounding rock or bank — framed by weathered mossy
stone, with a worn bare-earth approach, reading as part of the terrain rather than a structure
placed on it. Reference image: `art-tiles/act1-tile-136-266-ART.png`. **LOCKED.**

**2. Towns are STYLIZED and ENCLOSED, not realistic and blended.** Owner: *"the towns
probably look bad because they try to be realistic and blend into the environment but they
inherently do not and are not proportional anyways, so we need to make them have clear
boundaries (walls or fences around them, it is very weird having villages with no fencing or
walls when there are monsters outside) and make the towns look a bit more stylized."*

- Every town has a **continuous perimeter** — timber palisade, drystone wall, or hedged fence
  per town identity — with a readable GATE on **every side that has walkable approach**.
  Superseding the original single-gate rule: the owner challenged it, and measurement agreed —
  nine of twelve towns have 100% walkable ground on all four sides, so one gate would lie about
  where the player can enter. Gate sets per town come from `scripts/landmark_orientation.py`
  (Greenhollow/Millbrook/most = 4; Port Sapphire = N,E,W with the sea south; Oasis Haven =
  N,S,W).
- **Stylized, not photoreal.** Reference the newer Dragon Quest remakes (DQ3 HD-2D remake,
  DQ1&2 remastered) overworld-town treatment: slightly diorama-like, cleanly readable at a
  glance, bolder forms and clearer silhouettes than a realistic village, while keeping this
  project's crisp faux-pixel finish and locked palette.
- Do **not** try to dissolve the town into the terrain. A town is a game affordance; it should
  read as a distinct, deliberate place. The *site* (earth plaza, worn approach) still ties it
  to the ground — the enclosure is what makes it read as a town.
- Proportion: legibility beats literal scale. Prefer a slightly larger, clearly bounded
  compound over a cluster of tiny accurate cottages.

> [!important] Enclosure amendment — owner, 2026-08-01. The perimeter is NO LONGER mandatory.
> Owner, on the finished Port Sapphire town screen: *"the town does not seem to have a fence
> around it, which is fine, i am not committed to it but we need to fix the overworld asset to
> match the town design."*
>
> **The binding rule is now consistency with the town screen, not enclosure.** Where a town has
> an authored town screen, its overworld sprite matches that screen — fence or no fence. The
> 2026-07-30 enclosure lock above stands only for towns that have no town screen yet, and it is
> a default, not a requirement.
>
> **Port Sapphire is explicitly UNFENCED**, on both the town screen and the overworld sprite.
> Its gate set in `scripts/landmark_orientation.py` (N, E, W) still describes where the walkable
> approaches are; it no longer implies a drawn gate in a drawn wall.
>
> Consequence, and it is real: Port Sapphire's sprite now differs in treatment from the other
> eleven Act 1 town sprites, which remain fenced and darker. They come into line as each gets
> its own town screen. Flagged to the owner 2026-08-01; not treated as a defect.

**3. Coast and reef are terrain, and are fixed in code.** Owner: *"the coast line also needs
to look a little more natural since it currently looks very abrupt"*, and on Coastal Reef,
*"it should look like a cave leading under water."*
`scripts/build_owner_art_base.py` now renders a graded shore (wet shingle → foam → shallow
shelf → deep) and, around any landmark whose name contains "Reef", a shallow turquoise shelf
with exposed reef rock and coral heads, centred on the WATER rather than the landmark cell.
Both coastal act-1 landmarks sit 2 cells from open water, so a reef mouth **at the waterline,
opening downward into the water**, is achievable without moving anything.

## Geometry

A world cell is **48 px** (`TILE_SIZE`, `src/utils/constants.ts`).

| kind | canvas | footprint | note |
|---|---|---|---|
| town | **192×192 px** | 4×4 cells | enlarged from 3×3 so a perimeter wall AND a readable gate both fit |
| dungeon entrance (side / connector / story) | **144×144 px** | 3×3 cells | Crystal Cave style. Bumped from 96 on 2026-07-30: against the LOCKED g3 hero (56 px figure, 1.17 cells) a 96 px mouth was only 1.7x hero height and read as insignificant; 144 px is 2.6x. |
| reef / underwater dungeon | **144×144 px** | 3×3 cells | mouth at the waterline, opening down into the water |
| portal | **144×144 px** | 3×3 cells | |

- RGBA PNG, fully transparent background, no matte, no halo.
- **Transparency is produced by chroma key, not by the generator.** The image tool returns
  opaque RGB (it also returns 1254×1254 natively, so sizes are resampled once). So sprites are
  generated on a **pure magenta `255,0,255`** field, with no magenta anywhere in the artwork,
  and `scripts/key_landmark_sprite.py` keys it out deterministically and feathers 1 px. The
  faux-pixel finish has crisp edges, so keying is clean.
- **Anchor**: MEASURED, never assumed. `scripts/key_landmark_sprite.py::footprint()` finds the
  centre of the sprite's widest opaque band -- which on an isometric diorama IS the base
  ellipse where it meets the ground -- and that point is placed on the landmark cell's centre.
  A hardcoded "80% down the canvas" was wrong by **43 px (nearly a full cell)** on Greenhollow,
  which is what made sprites look like they were floating and put the terrain's earth pad in
  the wrong place. The same measurement drives the contact shadow and the pad size, so all
  three agree by construction.

- **Scale reference is the LOCKED g3 hero**, `public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png`
  -- 56 px figure in a 64 px frame = **1.17 cells**. Not the legacy
  `public/assets/hero/hero-feminine-walk.png` (42 px), which belongs to the old runtime.
  Against the locked hero: a town is 3.4x hero height, a dungeon mouth 2.6x.
- Depth: y-sorted against the player by anchor row, so a cottage occludes a player behind it.

## Lighting, palette, finish

Identical to the terrain, or the composite will not sit:

- Locked ENVIRONMENT STYLE BLOCK from `ART-DIRECTION.md`, verbatim, in every prompt.
- Single **upper-left** light source. Crisp faux-pixel finish, stepped shading, strong material
  definition. NOT painterly, NOT flat cartoony cel.
- Tone matched to the terrain it stands on — the approved rock-heavy tiles sit near **mean
  luminance 60**; do not apply an extra brightness lift.
- **Baked contact shadow** cast down-and-right, plus a **soft alpha skirt** at the base where
  the structure meets the ground. The skirt is the single most important anti-sticker measure.

## Walkability — the invariant

Every landmark stands on **open ground** in `owner-terrain.json`, and terrain collision is
unchanged by a sprite. So:

1. **The anchor cell stays visually open** — it is the entrance the player steps onto.
2. Collision for the footprint is **derived from the sprite's own opaque mask**, so art and
   collision can never disagree. A cottage that looks solid *is* solid.
3. The derivation must leave the anchor cell open **and** at least one 4-connected walkable
   path from outside the footprint to the anchor cell. Verify per landmark; a landmark whose
   door cannot be reached is a bug, exactly like the Haunted Forest doors were.
4. Re-run the act reachability check after adding landmark blockers — the connectivity results
   in `ACT2-GATES.md` were computed on terrain alone.

## Port Sapphire — harbour town, owner note 2026-07-30

> *"sapphire should be touching the sea and the port side, the south side, should look like a
> harbor. So essentially, entrances are from north, east, and west, but not south."*

This matches the terrain measurement exactly — Port Sapphire scores N 100%, E 100%, W 100%
walkable and **S 0%**, because the sea is directly south. So:

- **Gates: N, E, W only. No south gate** — the sea is the wall on that side.
- **The south face is a HARBOUR**, not a plain wall: a stone quay or timber jetty along the
  waterline, moored fishing boats, crates, barrels, drying nets, mooring posts. It should read
  as the working seaward side of a port.

**It already touches the sea and needs no move.** The landmark sits at (133,347); water begins
at (133,349), two cells south. A 4x4-cell town sprite anchored on that cell spans y345–y349, so
its **south edge lands exactly on the waterline**. The quay is therefore drawn at the bottom of
the sprite and overlaps water by design — a jetty over water is correct, and it stays
decoration, since the player enters through the three landward gates.

## Identity

`ART-DIRECTION.md` rule 4: "Avoid one repeated rectangular town template." So **one bespoke
sprite per named landmark** — Greenhollow is not Millbrook recoloured. Local identity comes
from the roster: Port Sapphire is a harbour village, Ironkeep is a fortress town, Ravenhollow
is the last town of act 2.

Forbidden in every sprite: people, animals, banners, signage, text, labels, UI, health bars.

## Output layout

```
public/assets/landmarks/<slug>.png          # RGBA sprite
public/assets/landmarks/landmarks.json      # manifest
```

Manifest per entry: `slug`, `name`, `kind`, `canvas`, `anchor` [x, y], `footprintCells`,
`blockedMask` (derived from alpha), `act`, `worldCell`.

## Reference

The V6 reference render bakes villages and cave mouths straight into the terrain
(`--structures`). It is **not** a shipping asset — it exists to show what Greenhollow and
Crystal Cave should look like in this style, correctly lit and in context, and is the visual
target the sprites are generated against.
