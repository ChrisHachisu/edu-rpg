# Edu-RPG — MONSTER-PROMPTS.md (complete roster prompt book · 2026-07-02)

Companion to `ART-DIRECTION.md` (the contract) — this is the working prompt book for regenerating any/all of the 75 monsters.

## HOW TO USE

Every generation = **STYLE BLOCK + TECH SPEC + DESIGN THEMES + the monster's MENACE TIER block + its SUBJECT line**, plus 1-3 anchor images from `design/art-refs/` with the instruction: *"Match the anchors' rendering style exactly; do NOT reuse their composition, silhouette, or subject features."* Generate the 1024px master, archive it, downscale to 128x128 (`sips -z 128 128`). Batch results into one contact sheet for owner review.

## STYLE BLOCK (paste first, verbatim)

```
Pixel-art JRPG monster sprite in the SNES Dragon Quest tradition (DQ3/DQ5/DQ6). MATCH this exact
aesthetic: CHIBI PROPORTIONS (big head, compact rounded body, short limbs, roughly 2-3 heads
tall), character-first JRPG monster design (NOT western-fantasy creature art), kid-friendly but
not babyish or overboard cute. Detailed 16-bit-style pixel art with bold dark outlines on all
major forms, cel-shaded with clear highlight and shadow bands (NOT smooth gradients), rich
saturated palette, chunky readable pixels (NOT smooth vector or photoreal). Menace comes from
expression, ornament, and palette ONLY - proportions stay chibi at every tier; never gory.
```

## TECH SPEC (paste second, verbatim)

```
Output: a single CENTERED monster on a fully TRANSPARENT background (alpha channel, no backdrop,
no ground, no baked shadow, no frame, no text, no UI). Square master image, 1024x1024 px PNG with
transparency. Small even margin on all four edges. Clean silhouette with a solid dark outline so it
reads clearly when scaled down to 128x128 over a battle background.
```

## DESIGN THEMES — apply to ALL monsters (Style Essence)

1. Faux-pixel cel rendering - chunky pixel-textured strokes, crisp edges, no soft gradients; bold near-black outline around the full silhouette.
2. Dark-field luminosity - reads against near-black; ONE dominant hue family + 1-2 accents per monster; high value contrast.
3. Emissive focal point - one glowing "power" element (eyes, orb, aura) as an accent, never covering the body. (Tier 1: none; Tier 2: faint; Tier 3-4: prominent.)
4. Centered imposing stance - front-facing, symmetrical or near-symmetrical, fills ~85-90% of frame.
5. Stepped cel shading - 2-4 tones per hue; surface detail as crisp pixel clusters.
6. Menace dial - the monster's silhouette, expression, palette temperature and aura MUST match its menace tier block exactly.

**Anti-reskin rule (owner-mandated):** a higher-tier variant of an existing monster must escalate the SILHOUETTE (new pose, new anatomy elements, armor/aura growth), never just the palette. Palette-swap reskins caused the frostStalker/frostWolf/stormHarpy failures.

## MENACE TIER 1 — Map 1 (greenhollow-plains, whispering-woods · Lv 1-3)

```
Rounded soft silhouettes, big heads and eyes, stubby limbs. Expression: curious or grumpy, never cruel. Palette: bright warm greens/browns/pastels. NO spikes, NO glowing power auras, minimal ornament. Reads as 'wild critter', zero dread.
```

- **bandit** `[FIX]` — SUBJECT: scruffy human outlaw with bandana and short blade, crouched sneer. Menace tier 1.
- **bat** `[FIX]` — SUBJECT: small round cave bat, wide wings, oversized ears. Menace tier 1.
- **bug** `[FIX]` — SUBJECT: small round beetle, glossy shell, stubby legs. Menace tier 1.
- **mushroom** `[OK]` — SUBJECT: [AUTO — refine at generation] mushroom. Menace tier 1.
- **rabbit** `[OK]` — SUBJECT: [AUTO — refine at generation] rabbit. Menace tier 1.
- **slime** `[OK]` — SUBJECT: [AUTO — refine at generation] slime. Menace tier 1.
- **wolf** `[OK]` — SUBJECT: grey forest wolf, alert stance, bared teeth. Menace tier 1.

## MENACE TIER 2 — Map 2 (crystal-coast, crystal-cave, coral-tunnels · Lv 3-8)

```
Leaner, more angular silhouettes; visible teeth/claws/stingers. Expression: alert, aggressive. Palette: cooler and more saturated (aquas, violets, wet blues). Small natural armor (shells, scales, coral). A faint elemental accent is allowed; still animal, not evil.
```

- **crab** `[OK]` — SUBJECT: [AUTO — refine at generation] crab. Menace tier 2.
- **giantToad** `[FIX]` — SUBJECT: huge warty toad, throat sac inflated, tongue coiled. Menace tier 2.
- **golem** `[FIX]` — SUBJECT: classic rough stone golem, moss in cracks, heavy fists. Menace tier 2.
- **jellyfish** `[FIX]` — SUBJECT: luminous drifting jellyfish, trailing stinger ribbons. Menace tier 2.
- **merfolk** `[FIX]` — SUBJECT: trident-bearing mer-warrior with finned crest and scale mail. Menace tier 2.
- **piranha** `[FIX]` — SUBJECT: snapping piranha mid-lunge, oversized teeth. Menace tier 2.
- **serpent** `[OK]` — SUBJECT: [AUTO — refine at generation] serpent. Menace tier 2.
- **spider** `[OK]` — SUBJECT: [AUTO — refine at generation] spider. Menace tier 2.

## MENACE TIER 3 — Map 3 (iron-mountains, frostpeak-cavern · Lv 8-15)

```
Heavy, armored, predatory silhouettes; spikes, plates, horns appear. Expression: menacing intent, hunter's stare. Palette: iron greys, deep blues, frost whites with strong value contrast. Clear emissive power element (glowing core, frost breath, ember seams). Reads as a serious threat.
```

- **blizzardBear** `[FIX]` — SUBJECT: massive white-blue bear wreathed in snow flurries, ice-crusted claws. Menace tier 3.
- **darkSorcerer** `[OK]` — SUBJECT: [AUTO — refine at generation] dark sorcerer. Menace tier 3.
- **dragon** `[ANCHOR]` — SUBJECT: classic red dragon rearing with spread wings, fire orb at chest. Menace tier 3.
- **harpy** `[OK]` — SUBJECT: wild bird-woman with talons and windblown feathers. Menace tier 3.
- **iceSprite** `[OK]` — SUBJECT: [AUTO — refine at generation] ice sprite. Menace tier 3.
- **iceWyrm** `[OK]` — SUBJECT: [AUTO — refine at generation] ice wyrm. Menace tier 3.
- **kraken** `[FIX]` — SUBJECT: sea kraken with coiling tentacles and huge glaring eye. Menace tier 3.
- **stormHarpy** `[REDO]` — SUBJECT: REWORK — storm-born harpy with lightning-charged wings and thundercloud plumage (must be clearly distinct from base harpy: new pose, new silhouette, storm aura). Menace tier 3.
- **wyvern** `[FIX]` — SUBJECT: lean two-legged wyvern with barbed tail, wings flared. Menace tier 3.

## MENACE TIER 4 — Map 4 (scorched-wastes, sunken-ruins, volcanic-forge, demons-threshold · Lv 15-25)

```
Epic, regal, demonic silhouettes; crowns, wing spreads, ornate dark armor, tall imposing stance. Expression: malevolent intelligence. Palette: blacks, blood reds, royal purples, gold accents; dramatic rim light and strong aura effects. Boss-grade dread while staying kid-appropriate (menacing, never gory).
```

- **ancientSphinx** `[OK]` — SUBJECT: [AUTO — refine at generation] ancient sphinx. Menace tier 4.
- **banditArcher** `[FIX]` — SUBJECT: lean hooded outlaw drawing a shortbow, quiver at hip. Menace tier 4.
- **banditLord** `[FIX]` — SUBJECT: burly bandit chief in spiked leathers and fur cloak, twin sabers. Menace tier 4.
- **celestialGuardian** `[ANCHOR]` — SUBJECT: winged golden colossus with halo and radiant plate armor. Menace tier 4.
- **chimera** `[OK]` — SUBJECT: [AUTO — refine at generation] chimera. Menace tier 4.
- **cloudWraith** `[OK]` — SUBJECT: [AUTO — refine at generation] cloud wraith. Menace tier 4.
- **darkKnight** `[FIX]` — SUBJECT (revised 2026-07-02, owner: differentiate from the final boss): a TRADITIONAL knight in COMPLETE near-black plate — classic unornamented full-plate silhouette, plain closed great helm (no horns, no crown, no regal/demonic ornament), a plain dark longsword held point-down (NOT a jagged fantasy greatsword), simple dark-grey tattered cape; sole accent = ember-orange eye-slit glow, minimal red. Must NOT read as demonKing's kin. Menace tier 4.
- **demon** `[OK]` — SUBJECT: [AUTO — refine at generation] demon. Menace tier 4.
- **demonKing** `[ANCHOR]` — SUBJECT: regal winged demon lord with crown, ornate armor, burning eyes. Menace tier 4.
- **fireElemental** `[OK]` — SUBJECT: [AUTO — refine at generation] fire elemental. Menace tier 4.
- **flameBat** `[FIX]` — SUBJECT: bat wreathed in flame trails, ember eyes. Menace tier 4.
- **flameTitan** `[OK]` — SUBJECT: [AUTO — refine at generation] flame titan. Menace tier 4.
- **frostMonarch** `[OK]` — SUBJECT: [AUTO — refine at generation] frost monarch. Menace tier 4.
- **frostStalker** `[REDO]` — SUBJECT: REDO — predatory frost lynx/feline hunter, ice-shard mane, low stalking pose (must NOT be a wolf palette-swap). Menace tier 4.
- **frostWolf** `[REDO]` — SUBJECT: REDO — armored ice-wolf alpha with frozen spike ruff and glacial plates (silhouette must escalate beyond tier-1 wolf). Menace tier 4.
- **frozenSkeleton** `[ANCHOR]` — SUBJECT: skeleton warrior encased in ice shards, frost sword. Menace tier 4.
- **giantCrab** `[OK]` — SUBJECT: [AUTO — refine at generation] giant crab. Menace tier 4.
- **glacialGolem** `[FIX]` — SUBJECT: golem of jagged glacier ice, deep blue core glow. Menace tier 4.
- **knight** `[ANCHOR]` — SUBJECT: noble plate-armored knight with plumed helm, sword and shield. Menace tier 4.
- **lavaGolem** `[FIX]` — SUBJECT: golem of cooled magma plates over molten seams. Menace tier 4.
- **lavaWyrm** `[OK]` — SUBJECT: [AUTO — refine at generation] lava wyrm. Menace tier 4.
- **lich** `[OK]` — SUBJECT: [AUTO — refine at generation] lich. Menace tier 4.
- **lizard** `[FIX]` — SUBJECT: quick green rock lizard, frilled neck, whip tail. Menace tier 4.
- **magmaSlime** `[OK]` — SUBJECT: [AUTO — refine at generation] magma slime. Menace tier 4.
- **mummy** `[REVERTED-OK]` — SUBJECT: bandaged shambling mummy, trailing wraps, cursed glow. Menace tier 4.
- **sandGolem** `[FIX]` — SUBJECT: golem of packed sand and sandstone slabs, dust trails. Menace tier 4.
- **sandWraith** `[OK]` — SUBJECT: [AUTO — refine at generation] sand wraith. Menace tier 4.
- **seaStar** `[OK]` — SUBJECT: [AUTO — refine at generation] sea star. Menace tier 4.
- **shadow** `[ANCHOR]` — SUBJECT: living shadow wraith with clawed hands and burning violet eyes. Menace tier 4.
- **skeleton** `[REVERTED-OK]` — SUBJECT: classic sword-and-bone skeleton warrior. Menace tier 4.
- **stormRaptor** `[OK]` — SUBJECT: raptor bird of prey crackling with lightning, dive pose. Menace tier 4.
- **stormSentinel** `[ANCHOR]` — SUBJECT: armored storm titan with lightning coils and azure-gold plate. Menace tier 4.
- **swordWraith** `[OK]` — SUBJECT: [AUTO — refine at generation] sword wraith. Menace tier 4.
- **templeGuard** `[OK]` — SUBJECT: [AUTO — refine at generation] temple guard. Menace tier 4.
- **voidShade** `[OK]` — SUBJECT: [AUTO — refine at generation] void shade. Menace tier 4.
- **wraith** `[OK]` — SUBJECT: [AUTO — refine at generation] wraith. Menace tier 4.

## UNMAPPED (not in v1.0.0 zone tables — owner to confirm tier; best-guess shown)

- **ashenGuardian** `[FIX]` — SUBJECT: hulking guardian of charred stone and smoldering embers, cracked grey-black body with inner orange glow. Menace tier: T4 (guess).
- **bruiser** `[FIX]` — SUBJECT: thick-armed thug with knuckle wraps and heavy jaw. Menace tier: T1 (guess).
- **coralTitan** `[OK]` — SUBJECT: towering reef giant built of living coral and barnacled stone. Menace tier: T2 (guess).
- **crystalHydra** `[ANCHOR]` — SUBJECT: multi-headed hydra of dark stone with glowing crystal spines. Menace tier: T3 (guess).
- **knifeSneak** `[FIX]` — SUBJECT: slinking cutpurse with twin daggers, half-masked. Menace tier: T1 (guess).
- **magmaBeetleKing** `[FIX]` — SUBJECT: giant beetle monarch with magma-vent carapace and horn crown. Menace tier: T4 (guess).
- **mimic** `[OK]` — SUBJECT: treasure chest with fanged maw and lolling tongue. Menace tier: T2 (guess).
- **mosswarden** `[OK]` — SUBJECT: ancient moss-covered treefolk warden, glowing green eyes. Menace tier: T1 (guess).
- **nullDevourer** `[OK]` — SUBJECT: void-black amorphous horror with a collapsing star core. Menace tier: T4 (guess).
- **oreColossus** `[OK]` — SUBJECT: mountain colossus studded with raw ore veins and gem clusters. Menace tier: T3 (guess).
- **phantomStag** `[OK]` — SUBJECT: spectral stag with translucent body and antlers of light. Menace tier: T2 (guess).
- **sandSerpentQueen** `[OK]` — SUBJECT: colossal desert serpent queen with regal hood crest. Menace tier: T4 (guess).
- **shadowWisp** `[FIX]` — SUBJECT: small drifting dark wisp with violet ember core. Menace tier: TBD.
- **thornvineLurker** `[OK]` — SUBJECT: [AUTO — refine at generation] thornvine lurker. Menace tier: TBD.
- **warGeneralMalachar** `[OK]` — SUBJECT: [AUTO — refine at generation] war general malachar. Menace tier: TBD.

## SPECIAL DIRECTIVES (owner, 2026-07-02)

- **bandit**: spawn restriction — must appear ONLY in the bandit cave (game-data change, logged for post-overhaul; art fix still applies).
- **frostStalker + frostWolf**: complete redesigns — current sprites are palette-swaps of tier-1 `wolf`; menace must match their tier (see SUBJECT lines). frostStalker removed from the anchor set.
- **stormHarpy**: rework — insufficiently distinct from `harpy`; new pose + silhouette + storm aura required.
- **bug**: revert to previous (staged at `design/audit/revert-staging/monster-bug-previous.png`) — owner will match the original design into the game first; do not apply yet.
- **mummy, skeleton**: reverted to 801411a originals (applied to public/ + dist/ 2026-07-02; reworked versions backed up in revert-staging/).
## Mapping corrections (owner, 2026-07-02)

- Monster LOCATIONS are FINE as-is (owner, 2026-07-02) — no spawn/mapping rework needed. The tier assignments above are used only to pick each monster's menace level when prompting. (Some monsters appear in both field and dungeons; that's expected and unchanged.)
- ONE location change only: **bandit relocates to the bandit cave** (early game) — game-data change, post-overhaul.
- Tier 4's large roster is CORRECT by design: there are 4 teleport portal stages late-game — tier-4 monsters are fine as long as each matches its portal stage's theme.
- Everything else flagged FIX/REDO is an ART redesign only.

## Pilot-batch lessons (2026-07-02 — apply to ALL future batches)

1. **Anti-palette-bleed (MANDATORY):** the pilot showed anchors transfer their palette, not just rendering style — 6/8 outputs converged to the anchors' blue-violet-crystal scheme regardless of subject. Every prompt must state the monster's DOMINANT HUE explicitly in the SUBJECT line and add: "Do NOT adopt the anchor images' color scheme — take only their rendering technique. This monster's palette is <hue family> as specified."
2. **Tier-matched anchors:** all 8 keepers are high-menace late-game monsters, so low-tier subjects inflate (pilot giantToad + golem gained crystals/ornament/emissive elements that violate the Tier 1–2 blocks). For Tier 1–2 monsters, attach LOW-menace anchors (owner to pick 2–3 from the acceptable tier-1/2 roster, e.g. wolf / harpy) instead of the keeper set.
3. **codex `-i` gotcha:** the prompt must PRECEDE the `-i <image>` flags — `-i` is variadic and swallows a trailing positional prompt (codex then exits "No prompt provided"). Verified working: 2–3 anchors per call.


## Canonical prompt structure — ADOPTED (owner round-2 format, 2026-07-02)

The owner's ChatGPT-refined round-2 structure is now canonical for ALL future monster prompts (it clearly outperformed round 1). Every prompt uses these sections in order: STYLE CONSTRAINTS (with the full NEGATIVE list: no glossy oversized anime eyes, no smooth gradients, no airbrushed lighting, no plush-toy roundness, no sticker rendering, no mobile-icon polish, no Pixar/emoji, no painterly blending) → 16-bit rendering rules (chunky clusters, hand-placed dithering, banded cel shading, limited palette, slight asymmetry, "drawn for a 1990s cartridge then upscaled") → PROPORTIONS (chibi 2–3 heads) → MENACE TIER block → SUBJECT → FACE/EYES (small non-glossy pixel eyes — the single biggest anti-AI-style lever) → COLOR PALETTE (few distinct colors, dominant hue explicit) → COMPOSITION (green screen 1024). One restrained power element max.

**Workflow (locked):** the owner generates hand-drawn masters with these prompts and makes all design decisions; Claude runs the uniform pixelation/normalization pass afterwards so pixel grain is consistent across every batch (this resolves the round-2 texture-variance concern — outputs may vary slightly in grain; the pipeline unifies them). Monsters keep a CHUNKIER grain than characters — characters (see CHARACTER-PROMPTS.md) use finer hero-grade grain.
