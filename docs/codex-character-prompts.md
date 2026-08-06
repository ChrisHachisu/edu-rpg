# Quest of Knowledge — Character Art (Hero + NPCs): Codex Generation Prompts

Prompts for generating the **player hero** and **every town NPC** as pixel-art sprites that match
the existing **128×128 enemy sprites** (75 of them in `public/assets/monsters/`). Same look, same
spec, transparent background, drop-in next to the monster art.

> The enemy sprites are detailed 16-bit cel-shaded pixel art with bold dark outlines, on a
> transparent background. These character prompts reuse that exact STYLE BLOCK so the hero and
> NPCs sit visually alongside the monsters in battle, menus, and the overworld.

---

## 0. HOW TO USE

For each character, give Codex the **STYLE BLOCK** + the **TECH SPEC** + the **POSE BLOCK** + the
one-line **SUBJECT** for that character. Generate one image per character.

Pipeline (same as the monster sprites):
1. Generate the high-res master (transparent PNG).
2. Downscale to the game size: `sips -z 128 128 <master>.png --out npc-<id>.png` (hero: `hero-<color>.png`).
3. Drop the 128×128 PNG into **both** `public/assets/monsters/` style location and wire the key
   into the sprite loader the same way monsters are loaded (`const Ko = [...]` list in the bundle /
   `BootScene.preload`). Each PNG = one sprite key.

> ⚠️ **Two integration notes, decide before wiring:**
> - **Hero walk-cycle.** The hero is currently a procedurally-drawn **12-frame walk strip**
>   (4 directions × 3 frames) used for overworld movement, with frame 0 (front idle) reused for
>   the battle/menu avatar. A single front-facing PNG drops in cleanly for the **battle bar, menu
>   avatar, and intro preview**, but does NOT animate walking. Either (a) keep the procedural walk
>   strip for overworld and use the new PNG only for the static avatar slots, or (b) commission a
>   full 4-direction walk sheet separately (harder to keep consistent in one image gen). These
>   prompts produce option (a): a single front idle sprite.
> - **NPC reuse.** Today many NPCs share one sprite (e.g. `npc-knight` covers mercenary/veteran/
>   grizzled-knight, `npc-elder` covers several elders, `npc`/`npc-f` are the generic villagers).
>   The roster below gives **a distinct prompt per character** so you CAN make each one unique if
>   you want full per-NPC variety. If you'd rather keep the shared-sprite scheme, just generate the
>   ~13 base keys (hero ×4, elder, healer, shopkeeper, villager-m, villager-f, knight, guard-f,
>   sage, kiki, drake, gordo, luna, archaeologist) and skip the per-town duplicates.

---

## 1. STYLE BLOCK  (paste at the top of EVERY prompt)

```
Pixel-art game character sprite in a polished retro-RPG style. MATCH this exact aesthetic:
detailed 16-bit-style pixel art with bold dark outlines on all major forms, cel-shaded with clear
highlight and shadow bands (NOT smooth gradients), rich saturated jewel-tone palette, chunky
readable pixels (visible square pixels, pixel density of a 128px character sprite scaled up, NOT
smooth vector or photoreal). Hand-crafted SNES / modern-RPG character-art look, the same style as
a polished JRPG monster sprite. Cohesive, friendly, kid-appropriate, not gritty or gory.
```

## 2. TECH SPEC  (paste after the style block)

```
Output: a single CENTERED character on a fully TRANSPARENT background (alpha channel, no
backdrop, no ground, no shadow baked in, no frame, no border, no text, no UI, no health bars).
Square master image, 1024×1024 px, PNG with transparency. The character is the only thing in the
image. Leave a small even margin of empty space on all four edges. Clean silhouette with a solid
dark outline so it reads clearly when scaled down to 128×128 and layered over a battle background.
```

## 3. POSE BLOCK  (paste after the tech spec)

```
Pose: full body, standing, front-facing (slight 3/4 angle is fine), feet near the bottom of the
frame, neutral friendly idle pose, looking toward the viewer. Consistent top-down light source
(highlights on top, soft shadow underneath the forms). One static pose, no motion blur.
```

---

## 4. HERO — player character (4 color variants)

Subject base (shared): `A young, brave kid-friendly fantasy knight hero in full plate armor, with a
flowing cape, a heroic feather plume on the helmet (visor up showing a determined young face), a
medieval sword on the hip or held at the side, and a round medieval shield. Gold belt buckle and
golden sword hilt, brown leather boots.` Then swap the palette per variant:

| Sprite key | Variant SUBJECT (append palette to the base) |
|---|---|
| `hero-gray`  | Gray-blue steel armor, dark navy-blue cape, **red** helmet plume. |
| `hero-blue`  | Bright royal-blue armor, deep-blue cape, **white** helmet plume. |
| `hero-pink`  | Pink / magenta armor, hot-pink cape, **light-pink** helmet plume. |
| `hero-black` | Dark gunmetal near-black armor, very dark cape, **red** helmet plume. |

---

## 5. NAMED STORY NPCs  (give these the most personality — they have dialogue)

| Sprite key | Name | Gender | SUBJECT |
|---|---|---|---|
| `npc-sage` | Professor Sage | M | An elderly wise scholar with round spectacles and a long white beard, in a deep scholarly robe and a pointed scholar's hat, holding an open book or rolled scroll. Warm parchment-and-indigo palette, kindly clever expression. |
| `npc-kiki` | Kiki | F | A cheerful young girl adventurer companion, short tousled hair under a small cap, a little travel satchel, bright energetic tunic-and-shorts outfit, big friendly eyes and a wide grin. Lively warm palette. |
| `npc-drake` | Captain Drake | M | A rugged seafaring adventurer captain, weathered tricorn hat or bandana, long coat with rolled sleeves, confident half-grin, a coil of rope or spyglass. Coastal navy-blue and tan palette. |
| `npc-gordo` | Gordo | M | A big, broad, sturdy forgemaster-warrior with a thick beard, heavy leather apron over muscular arms, holding a large blacksmith hammer. Soot-smudged, fiery forge-orange and iron-gray palette. |
| `npc-luna` | Luna | F | A graceful young scholar-mage woman in flowing star-and-moon patterned robes, holding a glowing tome or slender staff, calm thoughtful eyes. Cool violet and silver palette with subtle sparkle. |

---

## 6. ROLE NPCs  (one distinct sprite per role / town, themed to its act)

*Gender column is authoritative — keep it (drives the existing female/male render split).*

### Act 1 — Plains & Coast (warm, bright, earthy)
| Sprite key | Name | Gender | SUBJECT |
|---|---|---|---|
| `npc-elder` | Elder | M | A kindly silver-bearded village elder in a simple long robe with a walking staff, gentle wise smile. Warm earthy greens and browns. |
| `npc-healer` | Healer | F | A friendly nurse-healer woman in a clean blue-and-white uniform, white cap with a small **red cross**, gentle caring smile, holding a small flask or bandage. |
| `npc-shopkeeper` | Shopkeeper | M | A jovial stocky merchant in a wide-brimmed hat with a gold band, work apron and a coin pouch on the belt, bushy eyebrows and a welcoming grin. |
| `npc-villager-m` | Villager | M | An everyday peasant village man in a simple green tunic, brown hair, plain trousers and boots, easygoing friendly face. |
| `npc-villager-f` | Villager | F | An everyday village woman in a lavender-purple peasant dress with an apron, long auburn hair, rosy cheeks, warm smile. |
| `npc-fisherman` | Fisherman | M | A weathered coastal fisherman in a straw hat and rolled-up sleeves, holding a fishing rod with a net over the shoulder. Sun-tanned, breezy blue-and-tan palette. |
| `npc-miller` | Miller | M | A stout flour-dusted miller in a rustic apron, carrying a small sack of grain, sturdy build, cheerful red cheeks. Warm wheat-brown palette. |
| `npc-herbalist` | Herbalist | F | A gentle herbalist woman in a green hooded shawl with little herb pouches on a belt, holding a basket of fresh plants and flowers. Mossy-green palette. |
| `npc-sailor` | Sailor | M | A young sailor in a blue-and-white striped shirt and a navy cap, a coil of rope in hand, salty confident look. Sea-blue palette. |
| `npc-wisewoman` | Wise Woman | F | A mystic old wise woman in a draped shawl and headscarf with beaded jewelry, knowing half-smile, a small crystal or charm. Deep teal-and-violet palette. |

### Act 2 — Iron, Frost & Shadow (cooler, icy / muted)
| Sprite key | Name | Gender | SUBJECT |
|---|---|---|---|
| `npc-soldier` | Soldier | M | A disciplined town-guard soldier in light chainmail and a tabard, holding an upright spear, alert steady stance. Steel-gray-and-crimson palette. |
| `npc-blacksmith` | Blacksmith | F | A strong female blacksmith in a heavy leather apron over work clothes, thick gloves, a hammer in one hand and tongs in the other, soot smudges, confident grin. Iron-and-ember palette. |
| `npc-frostElder` | Frost Elder | M | A frost-region elder bundled in a heavy fur-lined cloak with a frosty white beard, leaning on an iced wooden staff. Pale icy-blue and white palette. |
| `npc-frostGuard` | Guard | F | A female mountain guard in fur-trimmed plate armor and a cold-weather cloak, holding a spear, breath misting, watchful. Frosted steel-blue palette. |
| `npc-mountaineer` | Mountaineer | M | A rugged mountaineer in a thick fur coat with climbing gear, a coil of rope and an ice pick, ruddy windburned face. Snowy gray-blue palette. |
| `npc-frostVillager` | Villager | F | A bundled-up frozen-village woman in a thick scarf and quilted parka, rosy cheeks, breath misting, cozy warm-on-cold palette. |
| `npc-hauntedElder` | Elder Thorne | M | A solemn elder of a shadow-woods village in a dark hooded robe, holding a small lantern, gaunt thoughtful face, quietly wise. Muted purple-gray palette with a warm lantern glow. |
| `npc-hauntedGuard` | Guard | F | A wary female guard of the haunted village in darkened armor, holding a torch and a spear, cautious alert eyes. Shadowy indigo palette with torch-flame accents. |
| `npc-hauntedVillager` | Villager | F | A nervous shadow-village woman in a dark hooded cloak holding a small lantern, watchful tired eyes. Muted grey-violet palette. |

### Act 3 — Desert & Ruins (sun-baked golds, khaki)
| Sprite key | Name | Gender | SUBJECT |
|---|---|---|---|
| `npc-oasisElder` | Elder | M | A desert oasis elder in light flowing desert robes and a headwrap, holding a carved staff, serene sun-weathered face. Warm sand-gold and turquoise palette. |
| `npc-archaeologist` | Archaeologist | F | A female archaeologist in a wide explorer hat and a satchel of tools, holding a brush and a rolled map, smudges of dust. Khaki-and-tan desert palette. |
| `npc-explorer` | Explorer | M | An adventurous male explorer in a brimmed hat and a loaded backpack, holding a map, rugged eager grin. Khaki-and-leather palette. |
| `npc-mercenary` | Mercenary | M | A hardened mercenary in worn battle armor and a travel cloak, a sword on the back, a scar and a confident smirk. Dusty steel-and-crimson palette. |
| `npc-refugee` | Refugee | F | A weary refugee woman in a tattered cloak clutching a small bundle of belongings, tired but hopeful eyes. Faded muted earth palette. |

### Act 4 — Volcanic Forge (ember orange, dark iron)
| Sprite key | Name | Gender | SUBJECT |
|---|---|---|---|
| `npc-forgemaster` | Forgemaster | M | A master smith of the volcano forge in heavy heat-resistant gear and a thick apron, holding a glowing-hot hammer, intense focused face. Ember-orange and blackened-iron palette. |
| `npc-lavaMiner` | Lava Miner | F | A female lava miner in a heat suit and protective goggles, a pickaxe over the shoulder and a satchel of glowing ore. Charcoal-and-molten-orange palette. |

### Act 5 — Final Fortresses (noble, weathered, holy)
| Sprite key | Name | Gender | SUBJECT |
|---|---|---|---|
| `npc-veteran` | Veteran | M | A grizzled veteran soldier in battle-worn heavy armor, one hand on a planted greatsword, stern unflinching stare, old scars. Dented steel-and-deep-red palette. |
| `npc-priestess` | Priestess | F | A serene priestess in white-and-gold ceremonial robes and a holy headdress, holding a glowing staff or holy symbol, radiant gentle expression. Ivory-and-gold palette with soft light. |
| `npc-grizzledKnight` | Knight | M | An old grizzled knight in dented full plate, a great two-handed sword planted point-down, weary but noble bearing, gray beard under a raised visor. Tarnished-silver-and-blue palette. |
| `npc-prophetess` | Prophetess | F | A mystic prophetess in flowing star-patterned robes and a sheer veil, faintly glowing eyes, holding a glowing orb. Twilight indigo-and-silver palette with subtle starlight. |

### Act 5 — Portal Lands (each its own elemental theme)
| Sprite key | Name | Gender | SUBJECT |
|---|---|---|---|
| `npc-skyKeeper` | Sky Keeper | F | A sky-realm keeper woman in feathered, winged-motif robes with trailing ribbons, serene floating presence. Cloud-white, sky-blue and gold palette. |
| `npc-frostSage` | Frost Sage | F | An ice-realm sage woman in crystalline pale-blue robes and a small frost crown, holding a glowing ice staff, calm wise gaze. Glacial blue-and-white palette with sparkle. |
| `npc-templeScholar` | Temple Scholar | F | An ancient-temple scholar woman in ceremonial robes trimmed with hieroglyph patterns, holding a stone tablet or scroll, studious calm face. Gold-and-sandstone palette. |
| `npc-shadowWatcher` | Shadow Watcher | F | A twilight-realm mystic woman in a dark hooded robe flecked with starlight, faintly glowing violet eyes, quiet otherworldly air. Deep-shadow violet-and-black palette with starry accents. |

---

## 7. SUGGESTED FILE LIST (sprite keys to generate)

**Hero (4):** `hero-gray`, `hero-blue`, `hero-pink`, `hero-black`
**Named (5):** `npc-sage`, `npc-kiki`, `npc-drake`, `npc-gordo`, `npc-luna`
**Act 1 (10):** `npc-elder`, `npc-healer`, `npc-shopkeeper`, `npc-villager-m`, `npc-villager-f`, `npc-fisherman`, `npc-miller`, `npc-herbalist`, `npc-sailor`, `npc-wisewoman`
**Act 2 (9):** `npc-soldier`, `npc-blacksmith`, `npc-frostElder`, `npc-frostGuard`, `npc-mountaineer`, `npc-frostVillager`, `npc-hauntedElder`, `npc-hauntedGuard`, `npc-hauntedVillager`
**Act 3 (5):** `npc-oasisElder`, `npc-archaeologist`, `npc-explorer`, `npc-mercenary`, `npc-refugee`
**Act 4 (2):** `npc-forgemaster`, `npc-lavaMiner`
**Act 5 (4):** `npc-veteran`, `npc-priestess`, `npc-grizzledKnight`, `npc-prophetess`
**Portal Lands (4):** `npc-skyKeeper`, `npc-frostSage`, `npc-templeScholar`, `npc-shadowWatcher`

Total: **43 sprites** (4 hero + 39 NPC). Drop to the ~13 shared base keys if you want to keep the
current sprite-reuse scheme instead of full per-NPC uniqueness (see the NPC-reuse note in §0).
