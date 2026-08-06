# Quest of Knowledge — Battle Background Art: Codex Generation Prompts

Prompts for generating **battle backgrounds** (the scene behind the enemy + HUD during combat).
Two sets: **(A) environment backgrounds** for the biomes where random enemies spawn, and
**(B) special boss arenas** for the 4 end-game legendary bosses + the final boss.

> The game's monsters are **128×128 pixel-art sprites** with bold outlines and cel shading.
> Backgrounds must match that pixel-art look (see the STYLE BLOCK) and stay **subdued** so the
> bright sprites and the UI read clearly on top.

---

## 0. HOW TO USE
For each image, give Codex the **STYLE BLOCK** + the **TECH SPEC** + the specific **SCENE** line.
Generate one image per environment/boss. File names + the suggested list are at the bottom.

---

## 1. STYLE BLOCK  (paste at the top of EVERY prompt)

```
Pixel-art game battle background in a polished retro-RPG style. MATCH this exact aesthetic:
detailed 16-bit-style pixel art with bold dark outlines on major forms, cel-shaded with clear
highlight and shadow bands, rich saturated jewel-tone palette, chunky readable pixels (pixel
density comparable to a 128px character sprite scaled up — visible square pixels, NOT smooth
vector or photoreal). Hand-crafted SNES/modern-RPG monster-art look.

Composition: an EMPTY battle arena/landscape — NO characters, NO creatures, NO people, NO text,
NO UI, NO health bars, NO logos. A clear flat ground plane in the lower third where a creature
would stand, and a scenic backdrop behind it. Horizon / ground line about 58–62% down.

Mood: slightly DARKENED and lower-contrast overall (especially the center where the enemy
stands) so bright sprites and on-screen text remain legible on top. Soft depth haze toward the
back. Cohesive, kid-friendly, not gory.
```

## 2. TECH SPEC  (paste after the style block)

```
Output: a SQUARE master image, 2048×2048 px, PNG. Compose everything important CENTERED with a
generous ~15% safe margin on all edges that contains no critical detail — the app center-crops
this one image with object-fit:cover to fit smartphone portrait (~9:19.5), tablet, and desktop
web (16:9). It must look correct when cropped to a tall portrait strip AND to a wide landscape
strip, so keep the focal scenery vertically and horizontally centered and let the edges be
"extendable" sky/ground/wall. Seamless, paintable edges preferred. No border, no frame, no
vignette baked in.
```

*(If you'd rather have pixel-perfect per-device assets instead of one cropped square, ask Codex
for three exports of each scene: `1080×1920` portrait, `2048×1536` tablet, `1920×1080` web — same
composition, re-framed. The single square is simpler and what I'll wire up by default.)*

---

## 3. ENVIRONMENT BACKGROUNDS  (random-encounter biomes)

Append each SCENE line to the STYLE BLOCK + TECH SPEC.

### Act 1 — Greenlands & Coast
- **grass_plains** — `Sunny grassy plains with rolling green hills, a few distant round trees and soft clouds; warm earth path; bright but gentle greens.`
- **forest** — `Dense deep-green forest interior, thick tree trunks and a leafy canopy with dappled light, mossy ferns on the ground; cool shaded greens.`
- **coast** — `Rocky sandy coastline at the water's edge, tan beach, teal ocean and gentle waves, a few rounded boulders; cyan-and-sand palette.`
- **cave_misty** — `Misty cave mouth blending into forest, gray stone walls, drifting fog, faint moss; muted gray-green, soft and damp.`

### Act 2 — Mountains, Ice & Haunted
- **mountains** — `Rugged gray mountain pass with rocky cliffs and exposed ore veins, overcast sky; cool stone grays with iron-black accents.`
- **frozen** — `Frozen lake / snow cavern, pale blue ice walls, snow drifts and hanging frost crystals; icy blue-and-white palette, cold.`
- **storm_peak** — `High windy cliff ledge under a stormy sky, dark clouds and faint lightning, swirling wind; slate gray with electric-purple highlights.`
- **haunted_wood** — `Spooky dead forest at dusk, bare twisted purple-black trees, low ground mist, eerie glow; desaturated purples and grays.`

### Act 3 — Desert & Ruins
- **desert** — `Hot desert dunes under a bright sky, golden sand ripples, heat shimmer, a couple of dry rocks; warm tan-and-gold palette.`
- **tomb_ruins** — `Ancient sandstone tomb interior, carved hieroglyph walls, broken pillars and a stone floor, shafts of dusty light; sandstone tan with gold accents.`
- **canyon** — `Rocky red-brown desert canyon with steep walls and a sandy floor, a couple of wooden torches; warm canyon reds.`

### Act 4 — Volcanic
- **magma** — `Volcanic lava cavern, glowing orange magma cracks and a lava river, dark obsidian rock, embers in the air; fiery red-orange over near-black.`
- **obsidian** — `Glossy black obsidian cavern with dark purple crystal clusters and faint inner glow; deep blacks and purples.`

### Act 5 — Demon Realm
- **demon_castle** — `Gothic demon-castle interior, dark purple stone walls, crimson banners and lit torches, an ominous stone floor; dark purple with crimson accents.`
- **void** — `Otherworldly void rift, near-black space with floating broken rock shards and purple reality-fractures, distant stars; pure black with void-purple.`

*(Generic dungeon fallback — optional)*
- **dungeon_stone** — `Plain stone dungeon chamber, gray brick walls, flagstone floor, a couple of wall torches; neutral cool grays.`

---

## 4. SPECIAL BOSS ARENAS

> **Assumption:** I took the **"final 4 bosses" = the 4 portal-land legendary bosses**
> (Storm Sentinel, Frost Monarch, Sword Wraith, Celestial Guardian — the end-game gate bosses),
> and **"the final boss" = the Demon King**. If you actually meant the 4 act-gate bosses
> (Serpent / Dragon / Sand Golem / Flame Titan), tell me and I'll swap these.

Make these grander and more dramatic than the regular biomes (still subdued in the center).

- **boss_storm_sentinel** — `Epic sky-island arena high in the clouds: floating stone platforms, swirling storm clouds and arcs of lightning around a vast open sky, wind-blown banners; dramatic blue-and-electric-purple, awe-inspiring.`
- **boss_frost_monarch** — `Grand frozen throne hall of ice: towering pale-blue ice pillars, a frozen cathedral of frost, falling snow and aurora light; regal icy blues and whites, majestic and cold.`
- **boss_sword_wraith** — `Sunken ancient temple sanctum: massive golden-sandstone pillars half-submerged in still turquoise water, holy shafts of light, carved relief walls; ancient gold-and-teal, sacred and grand.`
- **boss_celestial_guardian** — `Twilight void cathedral: a starfield abyss with a vast ring of pale celestial light, broken floating holy architecture, deep purple shadows; divine purples and gold light, ominous and grand.`
- **boss_demon_king** — `The Demon King's throne chamber, FINAL BOSS arena: a colossal gothic hall of black-and-crimson stone, towering pillars, rivers of lava and brimstone glow, a massive ominous throne silhouette at the back, hellish red light; epic, intense, the climax of the game (still keep the center stand area readable).`

---

## 5. FILE NAMES & DELIVERY
Save each as `bg-<key>.png` (e.g. `bg-grass_plains.png`, `bg-boss_demon_king.png`) at 2048×2048.
Drop them in `edu-rpg/dist/assets/backgrounds/`. Once they exist I'll wire each biome's
encounter zone + each boss fight to load the matching background behind the battle overlay
(with the same black-bg-safe loading the monster sprites use), responsive across phone/tablet/web.

**Count:** 16 environment backgrounds + 5 boss arenas = **21 images** (trim the environment list
if you want fewer — e.g. one shared "cave" or one shared "dungeon" look).
