# Edu-RPG — ART-DIRECTION.md (locked visual theme · single source of truth for ALL asset generation)

Governed by the `game-design` skill (§Art direction). Anchor assets live in `design/art-refs/`.
**Never freehand an asset prompt** — every generation embeds the STYLE BLOCK + TECH SPEC below, plus 1–3 anchor images.

## World, town, and dungeon environments — LOCKED 2026-07-14

The owner approved the dark, realistic old-growth direction in
`design/review/visual-quality/terrain-round2/terrain-F-realistic-old-growth-mock.png`
and the **natural dirt trail** shown in the right panel of
`design/art-refs/terrain-f-natural-trail-comparison-locked.png`. The left brick-road
panel is comparison context only and is not the target.

This decision supersedes the older "bright, warm, understated environments"
language below for overworld, town, and dungeon environment production. Existing
monster curation, silhouette, menace, and battle-sprite rules remain in force until
a dedicated character/monster relock. Field characters should ultimately become
detailed chibi art with material, lighting, finish, and silhouette readability that
belong beside the approved world reference.

### Canonical ENVIRONMENT STYLE BLOCK

> Dark, dense, realistic old-growth JRPG environment art viewed from a 3/4 top-down perspective: richly layered evergreen foliage, weathered stone and timber, moss, roots, leaf litter, natural terrain transitions, deep forest shadows, crisp faux-pixel material detail, controlled highlights from a single upper-left light source, and strong route and character readability. Avoid flat tiled repetition, bright toy-like terrain, empty lawns, rigid building grids, and generic rectangular rooms.

### Locked environment rules

1. **Natural routes, semantic roads.** Traversable roads remain semantic map data,
   but the world renderer depicts them as irregular packed-earth trails with roots,
   moss, stones, leaf litter, and naturally varied edges. Do not expose a continuous
   brick strip in old-growth terrain.
2. **Blocked forest.** Forest/tree terrain is impassable. Map generation must create
   connected roads, clearings, and landmark approaches before environment artwork is
   produced; tree sprites are not individual physics bodies.
3. **Independent minimap rendering.** The minimap reads the same terrain, route, and
   landmark semantics but renders a simplified legible map. It does not sample the
   world artwork.
4. **Natural settlements.** Towns are redesigned one by one with terrain-following
   paths, clustered buildings, distinct civic/market/residential spaces, vegetation,
   and local identity. Avoid one repeated rectangular town template.
5. **Dungeon-specific spaces.** Each dungeon receives a new topology generated from
   its preserved gameplay contract. Existing floor tile arrays, room graphs, corridor
   shapes, and special-object coordinates are not visual or layout references.
6. **Runtime translation.** Use prebuilt atlases and layered, culled chunks. Do not
   ship a giant scrolling world bitmap or thousands of independent tree sprites.
   Environment production begins only after the semantic map and placement outputs
   for the target slice are stable.

## Era / reference target

**SNES-era Dragon Quest (DQ3 remake, DQ5, DQ6) — Toriyama-tradition JRPG pixel art.** Bright, readable, warm; bold character silhouettes; understated environments that let sprites read clearly (matches the feel targets in GAME-FEEL.md).

**CORE DESIGN FEATURES — LOCKED (owner, 2026-07-02; violated by the first pilot batch, now mandatory in every prompt):**
1. **JRPG-style characters** — character-first monster design in the DQ tradition, not western-fantasy creature art.
2. **Chibi proportions** — big head, compact rounded body, short limbs (~2–3 heads tall). ALL tiers keep chibi proportions; menace escalates through expression, ornament, and palette — NEVER through realistic proportions.
3. **Kid-friendly but not overboard cute** — approachable, never gory; equally never babyish/saccharine.

## Canonical STYLE BLOCK (verbatim in every prompt)

> Detailed 16-bit cel-shaded pixel art in the SNES Dragon Quest tradition (DQ3/DQ5/DQ6): bold dark outlines, warm saturated colors, clean 2-tone cel shading with a single top-left light source, readable silhouette, no anti-aliasing halos, transparent background.

(Extends the STYLE BLOCK from `docs/codex-character-prompts.md`. **Correction 2026-07-02, per owner:** the 75-monster set at `public/assets/monsters/` is NOT a uniform baseline — taste and pixel density vary across it. It is the *candidate pool*: a curation pass (audit + contact sheet → owner marks keepers / fix-list / rejects) selects the keepers that become anchors and define the style. Until keepers are locked, do not treat any arbitrary monster as a style reference.)

## Look decision — LOCKED (owner, 2026-07-02)

**Original smooth faux-pixel look wins** — the keepers' slightly-pixelated illustration style, NOT grid-true pixel art. Do NOT run grid quantization on existing or new sprites. Consistency is enforced via Style Essence + anchors + the fix-list reprompts, not via a logical grid. (Audit fact: all 75 sprites are 128×128 with no true pixel grid — design/audit/sprite-audit.json.)

## Style Essence (locked verbal DNA — extracted from the 9 keepers, 2026-07-02)

Embed this list in every sprite prompt. Anchors constrain STYLE only; every prompt adds a per-subject IDENTITY spec and must NOT reuse anchor composition/silhouette.

1. **Faux-pixel cel rendering** — chunky pixel-textured strokes with crisp edges; no soft gradients or airbrushing; bold near-black outline around the full silhouette.
2. **Dark-field luminosity** — reads against near-black; jewel-tone saturated palette with high value contrast; ONE dominant hue family + 1–2 accents per monster.
3. **Emissive focal point** — a glowing "power" element (eyes, orb, halo, lightning, wisps) as an accent, never covering the body.
4. **Centered imposing stance** — front-facing, symmetrical or near-symmetrical, fills ~85–90% of the 128px frame.
5. **Stepped cel shading** — 2–4 tones per hue; ornate surface detail (armor plates, scales, fur) rendered as crisp pixel clusters.
6. **Chibi JRPG proportions (CORE, all tiers)** — big head, compact body, short limbs; ornament and detail scale with tier, proportions never do. (Added 2026-07-02 after the pilot batch drifted to non-chibi western-fantasy creatures — the keeper-derived essence had over-weighted late-game ornateness.)
7. **Menace dial (IDENTITY axis, owner-mandated)** — silhouette + expression scale deliberately from round/cute (early game) to spiky/regal/menacing (late game). This is a PROGRESSION variable, not a style constant: every monster's menace level must match its position in the game's progression. Recent rework may have disturbed this curve — re-check the act-ordered lineup after any monster batch.

## Curation results (owner review of the 75-sprite contact sheet, 2026-07-02)

- **KEEPERS / anchors (8)**: celestialGuardian, crystalHydra, demonKing, dragon, frozenSkeleton, knight, shadow, stormSentinel — copies in `design/art-refs/`. (frostStalker demoted 2026-07-02: it's a wolf palette-swap that violates the menace dial.)
- **FIX (reprompt, 24)**: ashenGuardian, bandit, banditArcher, banditLord, bat, blizzardBear, bruiser, bug, darkKnight, flameBat, giantToad, glacialGolem, golem, jellyfish, knifeSneak, kraken, lavaGolem, lizard, magmaBeetleKing, merfolk, piranha, sandGolem, shadowWisp, wyvern.
- **REDO (complete redesign, 3)**: frostStalker, frostWolf (both palette-swaps of tier-1 wolf; menace mismatch), stormHarpy (not distinct enough from harpy).
- **REVERTED (applied 2026-07-02)**: mummy, skeleton — 801411a originals restored to public/ + dist/; reworked versions backed up in `design/audit/revert-staging/`. **bug**: previous version staged, NOT applied — owner matches the original design to the game first.
- **Spawn note**: bandit appears ONLY in the bandit cave (game-data change, post-overhaul).
- Working prompt book for regeneration: `design/MONSTER-PROMPTS.md` (STYLE BLOCK + themes + 4 menace-tier blocks + per-monster subjects).

## TECH SPEC

| Property | Value |
|---|---|
| Sprite master | high-res transparent PNG → downscale `sips -z 128 128` |
| Game size | 128×128 (characters/monsters); backgrounds per `docs/codex-background-prompts.md` |
| Outline | bold dark (near-black, not pure #000) on every sprite |
| Shading | 2-tone cel, light from top-left |
| Background assets | subdued palette so sprites + UI read on top |
| Perspective | 3/4 top-down (overworld), side-on (battle) |

## Palette

Locked swatches TBD — extract the master palette from 6–8 representative existing monster sprites (PIL histogram) and freeze the hex list here before the next asset batch. Until then: match anchors exactly.

## Anchor set (`design/art-refs/`)

_To lock: pick 3–5 existing monster sprites + 1 background as anchors; user approves; attach 1–3 to every generation request._

## Generation routing + enforcement

- Working prompt books: monsters → `MONSTER-PROMPTS.md`; **dungeon special-tile props → `DUNGEON-ASSET-PROMPTS.md`** (chest/door/boss/save/portal/wind-barrier/stairs/plaque + key & windbreaker icons; spike-trap + lava-pool stay code-drawn/procedural). Drop approved PNGs in `dungeon-assets/received/`.
- World, town, and dungeon environment masters follow the locked environment reference above, then use deterministic atlas/chunk assembly. Semantic map generation, collision, culling, seams, and special placement remain code-owned.
- Route: **codex** (never nano-banana). Contact-sheet review per batch.
- Post-gen enforcement: exact dimensions, transparent bg, outline present, palette compliance vs locked swatches; drifted assets are regenerated, not hand-fixed.

## Note on "No external assets" principle

Key Design Principle 7 ("everything procedurally generated") predates the 75-PNG monster set + codex prompt docs — current practice is generated PNG assets for characters/monsters/backgrounds, procedural for tiles/terrain. Treat that as the working rule; flag to the owner if it needs formal re-lock.
