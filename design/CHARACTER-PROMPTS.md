# Edu-RPG — CHARACTER-PROMPTS.md (hero + all 39 NPCs · owner-driven generation · 2026-07-02)

Built on the owner's proven round-2 prompt structure (negative constraints + FACE/EYES + restrained palettes). Replaces the prompt bodies in `docs/codex-character-prompts.md` (roster/keys/integration notes there still apply). Workflow: **you generate hand-drawn masters with these prompts; Claude runs the uniform pixelation/normalization pass** — so don't worry about slight texture variance between outputs; grain gets unified mechanically.

**How to use:** paste the CHARACTER PREAMBLE + one character block per generation. For the hero, ALSO attach the locked mockup as a reference image (`docs/assets/generated-characters/hero-locked-final-v1/hero-locked-final-v1-master-1024.png`) — reference images go AFTER the prompt text if using codex (`codex exec "<prompt>" -i <image>`). When a batch is done, hand the outputs back for pixelation + the review sheet.

---

## CHARACTER PREAMBLE (paste at the top of EVERY character prompt)

```
Create a single pixel-art JRPG CHARACTER sprite inspired by early-to-mid 1990s Japanese console RPG town and party sprites.

IMPORTANT STYLE CONSTRAINTS:
Avoid modern AI mascot styling. No glossy oversized anime eyes, no smooth gradients, no soft airbrushed lighting, no plush-toy roundness, no sticker-like rendering, no mobile-game icon polish, no Pixar/emoji influence, no painterly blending.

Use authentic 16-bit pixel-art rendering:
* fine, dense pixel clusters (FINER pixel grain than a monster sprite — this is a character/hero-grade sprite with crisp small details)
* hand-placed dithering and banded cel shading
* limited color palette
* hard-edged highlights and shadows
* bold dark outline around all major forms
* slight asymmetry and handmade sprite imperfections
* clean silhouette readable at 128x128 AND still recognizable at 48x48 (characters appear tiny on the overworld)
* no antialiased soft edges, no smooth gradient transitions

CHARACTER (NOT MONSTER) DESIGN:
This is a friendly PERSON, not a creature. Person-first design: readable human face, approachable posture, everyday believable clothing and props for their role. No menace, no aura, no power effects, no battle-ready aggression unless the block says otherwise. Distinctly softer and more human than the game's monster sprites.

PROPORTIONS:
Chibi JRPG character proportions, roughly 2.5-3 heads tall. Big head, compact body, short limbs, but not babyish or plush. Same proportion family as a classic SNES RPG town sprite.

FACE / EYES:
Small-to-medium simple pixel eyes made from a few clear pixel shapes with minimal highlights. No large white eye areas, no shiny reflective pupils. Expression per the character block.

POSE:
Full body, standing, front-facing (slight 3/4 angle fine), feet near the bottom of the frame, neutral idle pose appropriate to the role, looking toward the viewer. One static pose, no motion blur. Consistent top-down light source.

COMPOSITION:
Single centered character on a flat solid #00ff00 green background. Square 1024x1024 image. Small even margin on all edges. No text, no UI, no ground shadow, no effects.

The sprite should look like it was manually drawn for a 1990s game cartridge, then cleanly upscaled — not a modern illustration with a pixel-art filter.
```

---

## HERO — player character (4 palette variants · ATTACH the locked mockup as reference)

Add to every hero prompt: `REFERENCE: match the attached locked hero image exactly for rendering style, pixel grain, proportions, pose, and equipment design. Change ONLY the palette as specified below.`

**Base SUBJECT (all variants):**
```
SUBJECT: the game's young knight hero in full plate armor with a helmet plume, a flowing cape, a sword held point-down at the side, and a shield with a simple star/crest emblem on the other arm. Determined, brave, kid-friendly. Same armor design, same stance, same proportions as the attached reference.
```

| Sprite key | PALETTE line to append |
|---|---|
| `hero-gray` | PALETTE: gray-blue steel armor, dark navy-blue cape, red helmet plume. |
| `hero-blue` | PALETTE: bright royal-blue armor, deep-blue cape, white helmet plume. |
| `hero-pink` | PALETTE: pink/magenta armor, hot-pink cape, light-pink helmet plume. |
| `hero-black` | PALETTE: dark gunmetal near-black armor, very dark cape, red helmet plume. |

---

## NAMED STORY NPCs (5 — the most personality; they have dialogue)

**npc-sage — Professor Sage (M)**
```
SUBJECT: an elderly wise scholar with round spectacles and a long white beard, deep scholarly robe, pointed scholar's hat, holding an open book. Kindly, clever, slightly mischievous.
FACE: small spectacle-framed eyes, gentle smile half-hidden by the beard.
PALETTE: warm parchment cream and deep indigo, small brass accents. Limited distinct colors, no gradients.
```

**npc-kiki — Kiki (F)**
```
SUBJECT: a cheerful young girl adventurer, short tousled hair under a small cap, little travel satchel, energetic tunic-and-shorts outfit, mid-wave or hands-on-hips.
FACE: bright simple pixel eyes, wide friendly grin — lively but NOT saccharine mascot-cute.
PALETTE: warm sunny yellow-orange tunic, chestnut hair, small red cap accent.
```

**npc-drake — Captain Drake (M)**
```
SUBJECT: a rugged seafaring captain, weathered tricorn hat, long coat with rolled sleeves, spyglass in one hand, confident half-grin.
FACE: narrow confident pixel eyes, stubble, half-grin.
PALETTE: coastal navy-blue coat, tan trim, weathered brown leather.
```

**npc-gordo — Gordo (M)**
```
SUBJECT: a big broad forgemaster-warrior with a thick beard, heavy leather apron over muscular arms, large blacksmith hammer resting on one shoulder, soot smudges.
FACE: small steady eyes under heavy brows, proud faint smile.
PALETTE: iron-gray, leather brown, forge-orange ember accents (accents only, no glow effects).
```

**npc-luna — Luna (F)**
```
SUBJECT: a graceful young scholar-mage in flowing star-and-moon patterned robes, holding a closed tome against her chest, calm and thoughtful.
FACE: calm downturned-soft pixel eyes, serene small smile.
PALETTE: cool violet and silver, tiny star motifs — patterned fabric, NOT sparkle effects.
```

---

## ACT 1 — Plains & Coast NPCs (10 · warm, bright, earthy)

**npc-elder (M):** SUBJECT: kindly silver-bearded village elder in a simple long robe, walking staff, gentle wise smile. FACE: soft small eyes, deep smile lines. PALETTE: warm earthy greens and browns.
**npc-healer (F):** SUBJECT: friendly nurse-healer in a clean blue-and-white uniform, white cap with a small red cross, holding a small flask. FACE: caring gentle eyes. PALETTE: crisp white, sky blue, red-cross accent.
**npc-shopkeeper (M):** SUBJECT: jovial stocky merchant, wide-brimmed hat with a gold band, work apron, coin pouch on belt, welcoming grin. FACE: bushy eyebrows, merchant's twinkle. PALETTE: warm browns, apron green, gold-band accent.
**npc-villager-m (M):** SUBJECT: everyday peasant man in a simple green tunic, plain trousers and boots, easygoing stance. FACE: plain friendly pixel eyes. PALETTE: tunic green, brown hair, earthy neutrals.
**npc-villager-f (F):** SUBJECT: everyday village woman in a lavender peasant dress with an apron, long auburn hair. FACE: rosy cheeks, warm smile. PALETTE: lavender-purple, cream apron, auburn.
**npc-fisherman (M):** SUBJECT: weathered coastal fisherman, straw hat, rolled sleeves, fishing rod in hand, net over shoulder. FACE: squinting sun-creased eyes, easy smile. PALETTE: sun-tan, breezy blue and straw-tan.
**npc-miller (M):** SUBJECT: stout flour-dusted miller in a rustic apron carrying a small grain sack. FACE: cheerful red cheeks. PALETTE: warm wheat-brown, flour-white dusting.
**npc-herbalist (F):** SUBJECT: gentle herbalist in a green hooded shawl, herb pouches on a belt, basket of fresh plants. FACE: calm kind eyes under the hood. PALETTE: mossy greens, cream, small flower-color accents.
**npc-sailor (M):** SUBJECT: young sailor in a blue-and-white striped shirt and navy cap, coil of rope in hand. FACE: salty confident grin. PALETTE: sea-blue, white stripes, rope-tan.
**npc-wisewoman (F):** SUBJECT: mystic old wise woman in a draped shawl and headscarf with beaded jewelry, holding a small charm. FACE: knowing half-smile, hooded eyes. PALETTE: deep teal and violet, bead accents.

## ACT 2 — Iron, Frost & Shadow NPCs (9 · cooler, icy, muted)

**npc-soldier (M):** SUBJECT: disciplined town-guard in light chainmail and a tabard, upright spear, steady stance. FACE: alert simple eyes. PALETTE: steel gray, tabard crimson.
**npc-blacksmith (F):** SUBJECT: strong female blacksmith, heavy leather apron, thick gloves, hammer in one hand and tongs in the other, soot smudges. FACE: confident grin. PALETTE: iron gray, leather brown, ember accents.
**npc-frostElder (M):** SUBJECT: frost-region elder bundled in a fur-lined cloak, frosty white beard, iced wooden staff. FACE: gentle eyes over a wrapped scarf. PALETTE: pale icy blue, white fur, wood brown.
**npc-frostGuard (F):** SUBJECT: female mountain guard in fur-trimmed plate and a cold-weather cloak, spear in hand, watchful. FACE: steady narrowed eyes. PALETTE: frosted steel-blue, white fur trim.
**npc-mountaineer (M):** SUBJECT: rugged mountaineer in a thick fur coat, climbing rope coil and ice pick, ruddy windburned face. FACE: hardy squint, small grin. PALETTE: snowy gray-blue, fur brown.
**npc-frostVillager (F):** SUBJECT: bundled-up village woman in a thick scarf and quilted parka. FACE: rosy cheeks, cozy smile. PALETTE: warm parka colors against cold blue-whites.
**npc-hauntedElder (M) — Elder Thorne:** SUBJECT: solemn elder of a shadow-woods village in a dark hooded robe, holding a small lantern, gaunt thoughtful face. FACE: tired wise eyes lit from below by lantern. PALETTE: muted purple-gray, warm lantern-glow accent (lantern only, no aura).
**npc-hauntedGuard (F):** SUBJECT: wary female guard in darkened armor, torch in one hand, spear in the other. FACE: cautious alert eyes. PALETTE: shadowy indigo, torch-flame accent.
**npc-hauntedVillager (F):** SUBJECT: nervous shadow-village woman in a dark hooded cloak holding a small lantern. FACE: watchful tired eyes. PALETTE: muted grey-violet, lantern accent.

## ACT 3 — Desert & Ruins NPCs (5 · sun-baked golds, khaki)

**npc-oasisElder (M):** SUBJECT: desert oasis elder in light flowing robes and a headwrap, carved staff, serene sun-weathered face. FACE: calm creased eyes. PALETTE: sand-gold, white linen, turquoise accents.
**npc-archaeologist (F):** SUBJECT: female archaeologist in a wide explorer hat, satchel of tools, holding a brush and a rolled map, dust smudges. FACE: bright curious eyes. PALETTE: khaki and tan, leather satchel brown.
**npc-explorer (M):** SUBJECT: adventurous explorer in a brimmed hat with a loaded backpack, holding a map. FACE: rugged eager grin. PALETTE: khaki, leather, map-parchment cream.
**npc-mercenary (M):** SUBJECT: hardened mercenary in worn battle armor and a travel cloak, sword on the back, a small scar. FACE: confident smirk. PALETTE: dusty steel, faded crimson.
**npc-refugee (F):** SUBJECT: weary refugee woman in a tattered cloak clutching a small bundle. FACE: tired but hopeful eyes. PALETTE: faded muted earth tones.

## ACT 4 — Volcanic Forge NPCs (2 · ember orange, dark iron)

**npc-forgemaster (M):** SUBJECT: master smith of the volcano forge in heavy heat-resistant gear and a thick apron, holding a hammer with a faintly glowing-hot head, intense focused face. FACE: concentrated brows, steady eyes. PALETTE: blackened iron, ember-orange accents.
**npc-lavaMiner (F):** SUBJECT: female lava miner in a heat suit with protective goggles pushed up, pickaxe over the shoulder, satchel of glowing ore. FACE: bright eyes, soot smudges. PALETTE: charcoal, molten-orange ore accents.

## ACT 5 — Final Fortresses NPCs (4 · noble, weathered, holy)

**npc-veteran (M):** SUBJECT: grizzled veteran soldier in battle-worn heavy armor, one hand resting on a planted greatsword, old scars. FACE: stern unflinching stare. PALETTE: dented steel, deep red.
**npc-priestess (F):** SUBJECT: serene priestess in white-and-gold ceremonial robes and a holy headdress, holding a staff with a simple holy symbol. FACE: radiant gentle expression, closed-calm eyes. PALETTE: ivory and gold — fabric and metal only, no light effects.
**npc-grizzledKnight (M):** SUBJECT: old grizzled knight in dented full plate, two-handed sword planted point-down, gray beard under a raised visor, weary noble bearing. FACE: tired dignified eyes. PALETTE: tarnished silver, worn blue.
**npc-prophetess (F):** SUBJECT: mystic prophetess in flowing star-patterned robes and a sheer veil, holding a small orb. FACE: faintly glowing eyes (few bright pixels only). PALETTE: twilight indigo and silver, tiny star motifs.

## PORTAL LANDS NPCs (4 · one elemental theme each)

**npc-skyKeeper (F):** SUBJECT: sky-realm keeper in feathered winged-motif robes with trailing ribbons, serene upright presence. FACE: calm bright eyes. PALETTE: cloud-white, sky-blue, gold trim.
**npc-frostSage (F):** SUBJECT: ice-realm sage in crystalline pale-blue robes with a small frost crown, holding an ice staff. FACE: calm wise gaze. PALETTE: glacial blue and white — crystalline fabric shapes, no sparkle effects.
**npc-templeScholar (F):** SUBJECT: ancient-temple scholar in ceremonial robes trimmed with hieroglyph patterns, holding a stone tablet. FACE: studious calm. PALETTE: gold and sandstone.
**npc-shadowWatcher (F):** SUBJECT: twilight-realm mystic in a dark hooded robe flecked with tiny star pixels, quiet otherworldly air. FACE: faintly glowing violet eyes (few pixels). PALETTE: deep shadow violet and black, starlight pinpricks.

---

**Roster totals:** 4 hero + 5 named + 34 role/portal NPCs = 43 sprites. Gender assignments above are authoritative (they drive the game's female/male render split). Shared-sprite fallback (~13 base keys) per `docs/codex-character-prompts.md` §0 still available if full uniqueness is too many generations.
