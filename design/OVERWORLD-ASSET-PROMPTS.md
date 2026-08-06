# Edu-RPG — OVERWORLD-ASSET-PROMPTS.md (overworld special-tile / landmark prop prompt book · 2026-07-03)

Companion to `ART-DIRECTION.md` (the contract) and sibling of `DUNGEON-ASSET-PROMPTS.md`. Working prompt book for the **overworld SPECIAL-TILE landmark props** (village/cave/castle/portal/etc. that sit on overworld special tiles 6–21). Raster PROPS → **Codex image-gen** (only seamless terrain tilesets stay code-drawn).

## SCOPE — the overworld landmark set (engine tile → asset)

| tile | landmark | status |
|---|---|---|
| 6 | village | HAVE (owprop-village) |
| 7 | cave (generic) | HAVE (owprop-cave) |
| 8 | castle | HAVE (owprop-castle) |
| 9 | portal | HAVE (owprop-portal) |
| 11 | signpost | HAVE (owprop-signpost) |
| 12 | storm-nest (spire) | HAVE (owprop-storm-nest) — owner-confirmed |
| 20 | desert-signpost | HAVE (owprop-desert-signpost) |
| **10** | **shadow cave** (dark mouth, glowing eyes) | **GENERATE** |
| **15** | **crystal cave** (blue crystal mouth) | **GENERATE** |
| **16** | **ice cave** (frost/icicles) | **GENERATE** |
| **19** | **desert tomb** (sandstone ruin) | **GENERATE** |

Biome-FILL tiles (13 ice · 14 grass · 17 snow · 18 sand · 21 lava) are terrain, left engine-drawn — NOT props.

The four GENERATE tiles are the game's biome dungeon entrances (shadowCave / crystalCave / frostfallCavern / desertTomb). The earlier-delivered `gate-cave / special-cave / wall-barrier / haunted-portal` were built from generic references and do NOT match these four → superseded by the assets below.

## HOW TO USE (codex invocation — see [[learning-20260630-codex-edu-rpg-imagegen-pipeline]])

`codex exec --dangerously-bypass-approvals-and-sandbox "<PROMPT>" -i design/art-refs/<anchor>.png -i overworld-assets/received/owprop-cave-128.png < /dev/null`
- **Prompt MUST precede the `-i` flags** (variadic `-i` swallows a trailing prompt → rc=1 "No prompt provided").
- Output = opaque PNG in `~/.codex/generated_images/<uuid>/`; diff the dir before/after to pick the right file.
- **Chroma-key = MAGENTA `#ff00ff`** (all four subjects are stone/dark/blue/tan — a green key would eat crystal/grass-base greens). Flood-fill the background-connected pixels to exact `#ff00ff`, alpha-extract, bbox-trim, scale longest opaque dim to ~110/128, bottom-align, place on 1024 transparent master → `sips -z 128 128` → `overworld-assets/received/owprop-<name>-128.png`.

## STYLE BLOCK (paste first, verbatim — identical to the monster/dungeon contract)

```
Pixel-art game asset in a polished retro-RPG style. MATCH this exact aesthetic:
detailed 16-bit-style pixel art with bold dark outlines on all major forms, cel-shaded with clear
highlight and shadow bands (NOT smooth gradients), rich saturated jewel-tone palette, chunky
readable pixels (visible square pixels, pixel density of a 128px sprite scaled up, NOT smooth
vector or photoreal). Hand-crafted SNES / modern-JRPG look (Dragon Quest DQ3/DQ5/DQ6 tradition).
Cohesive, kid-appropriate.
```

## TECH SPEC (paste second — OVERWORLD landmark framing)

```
Output: a single CENTERED overworld landmark on a FLAT MAGENTA (#ff00ff) background (solid magenta
fill only, no other backdrop, no text, no UI, no frame, no border). Square master 1024x1024 px PNG.
3/4 top-down OVERWORLD view (as seen from a JRPG world-map camera), front face tilted slightly toward
the viewer, light from the TOP-LEFT. The landmark rests on a SMALL integrated ground base matching its
biome (a compact patch of grass / rock / sand / snow — NOT a full square tile, NOT a flat floor).
Bold dark outline around the whole silhouette so it reads when scaled DOWN to ~48px on the map. Keep
interior detail bold and chunky; no fine filigree that dies at 48px. NOT final pixel art — no pixel
grid, no mosaic, no nearest-neighbor look; matte flat-cel illustration.
```

## DESIGN THEMES (all overworld props — Style Essence subset)
1. Faux-pixel cel rendering, bold near-black outline around the full silhouette.
2. Warm readable overworld palette (these sit on bright grass/sand/snow, not dark fog) with strong value contrast.
3. Top-left light, 2–4 tone cel shading — consistent across the whole set so they read as one family.
4. Emissive accent only where it belongs (crystal glow, shadow-eyes, portal energy); inert stone/sand props get no glow.
5. Bold silhouette at 48px — instantly recognizable as a tiny map icon. Squint test.
6. Material consistency with the world + the existing overworld props (owprop-cave/castle): grey stone, warm sandstone, crystal-cave blue, ice white-blue.

## ANCHORS (attach per generation)
Primary style-lock: **owprop-cave-128.png** (the delivered generic cave — matches the existing overworld-prop look). Plus ONE monster art-ref for the subject's material, rendering-only (NOT silhouette/composition).

## SUBJECTS (the four to GENERATE)

- **shadow-cave** (tile 10) — a foreboding CAVE MOUTH set in dark jagged rock: a black passage opening with two glowing pale-green ominous EYES peering out from the darkness inside, dark grey stone with a faint cold-purple tint, a thin wisp of shadow curling from the mouth. Ominous, not gory. Small dark grass/rock base. Anchors: `monster-shadow`, `owprop-cave`.
- **crystal-cave** (tile 15) — a CAVE MOUTH in grey rock STUDDED with glowing light-BLUE crystal shards around and above the opening; a dark passage inside lit by a soft cyan glow; a couple of clustered crystals at the base. The sacred crystal cavern. Small grass base. Anchors: `monster-crystalHydra`, `owprop-cave`.
- **ice-cave** (tile 16) — a CAVE MOUTH in pale ICE-crusted, snow-dusted rock: a dark passage inside, sharp ICICLES hanging from the top of the opening, a cold pale blue-white glow, frost rime on the stone. A frozen cavern. Small snow base. Anchors: `monster-frozenSkeleton`, `owprop-cave`.
- **desert-tomb** (tile 19) — an ancient SANDSTONE TOMB entrance half-buried in sand: a weathered stone doorway framed by two carved pillars with faded hieroglyph carvings, a dark passage opening in the middle, warm tan/ochre sandstone, a cracked lintel. An old desert ruin. Small sand base. Anchors: `monster-knight`, `owprop-cave`.

## POST-GEN
- Transparent bg, exact 128×128, bold dark outline present, legible at ~48px, matches owprop-cave rendering + the anchors.
- Contact-sheet the batch → owner approves/rejects per cell → approved → `overworld-assets/received/owprop-<name>-128.png` → wired into `dq-tiles.js` `OW_PROP` (10→shadow-cave, 15→crystal-cave, 16→ice-cave, 19→desert-tomb) → copied to the sandbox `owprops/`.
