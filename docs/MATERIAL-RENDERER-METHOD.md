---
date: 2026-07-31
type: method
tags: [edu-rpg, art-pipeline, materials, texture-splatting, dungeons, overworld]
status: PROVEN on act-1 overworld
---

# Generate the MATERIALS, not the map

Proven on the act-1 overworld on 2026-07-31, after per-tile AI generation was abandoned.
**Applies unchanged to dungeon and town interiors.**

## Read this first if you are generating art tile by tile

Stop. The overworld spent **~9.2M Codex tokens** on 56 AI-generated tiles and never produced a
shippable map. Three failures never went away:

1. **Style drifts** between tiles.
2. **Seams** stay visible even when the shared overlap bands are byte-identical.
3. The generator **sometimes ignores the semantic mask** — one tile whose mask was 100% forest
   came back with a rocky slope, a dirt road and a building.

Root cause, and why every workaround only half-worked: **the image tool exposes no seed, no
style lock and no spatial conditioning.** Priming, locking, retoning and global grading were all
post-processing trying to recover control that was never available upstream. There is no prompt
that fixes this.

The replacement renders the act-1 overworld (7104x8736, 62 Mpx) seam-free in ~3.5 minutes for
**~83k tokens total** — two image generations, and no per-region generation at all.

## The method

The semantic mask is a **splatmap**. Generate a small set of tiling **materials**, then render
the image from the data:

1. **One generation** produces a 2x2 sheet of four materials. One call means they cannot
   disagree with each other — this is what kills style drift, permanently and by construction.
2. **Make each tileable locally** (`scripts/make_materials.py`) with Efros-Freeman wrap
   quilting: take the trailing 96px, composite onto the leading 96px along a minimum-error cut,
   discard the overlap. Safe to do to a material in a way it never was to layout, because a
   material is a uniform field — any patch of it is as valid as any other.
3. **Render by splatting** (`scripts/render_material_map.py`): every pixel is a pure function of
   its world coordinate and the mask.

Why each failure becomes impossible rather than reduced:

| failure | why it cannot occur |
|---|---|
| style drift | N textures from ONE call; nothing is generated per region, however large the map |
| seams | no tile is ever generated. Pixel = f(world coordinate, mask), so a full-pass render and a strip render are **byte-identical** |
| mask ignored | the renderer reads the mask; the generator never sees layout at all |

## The five things that make it look good rather than flat

Learned the hard way; skipping any of them produces obviously synthetic output.

1. **A macro layer is mandatory.** Micro texture alone reads flat over thousands of pixels. The
   material supplies *grain*; a continuous field supplies *form* — relief lit from a height
   field, depth, interior shadow, broad tonal sweeps. Same split `public/dq-tiles.js` already
   makes with `elevAt()` / `waterColor()`.
2. **Warp class boundaries, and GATE the warp by `4f(1-f)`.** A blurred mask gives an airbrushed
   edge sitting exactly on the mask's contour. Displacing each class weight by multi-octave
   noise makes boundaries interlock. The amplitude needed (~1 cell of wander) will also raise a
   class's weight far from any boundary — ungated it threw sand blotches into open sea and open
   meadow. The gate is 1 at the boundary, 0 where the field is saturated.
3. **Edge softness belongs to the BOUNDARY, not the class.** Setting it per class is not enough:
   a boundary's softness comes from *both* classes' transfer curves, so a crisp water class
   still gave a mushy shore against a soft forest class. Detect the boundary you care about and
   drive *every* class to the crisp curve there.
4. **A hard junction needs its OWN band, not a sharper blend.** Even a crisp blend is still one
   material handing over to another, so a treeline still dissolved into the lake. Real terrain
   does not do that — a forest stops at a bank, and the bank is a thing in itself. Draw it as an
   opaque band painted over whatever is behind it. **For dungeons this is the wall/floor
   junction**: a wall base, skirting or rubble line, drawn as its own band, not blended.
5. **Grade the material, not the map** — a few numbers for the whole world. Because the macro
   layer darkens *after*, pre-compensate it (`MACRO_COMP`) or the result lands under target:
   water measured 19 against a target of 31 before compensation.

Also: **flatten a material's local contrast if its pattern is regular.** The generated sea swell
was regular enough that at gameplay zoom the 531px repeat read as a net over the water. Dropping
its contrast to 50% fixed it; large-scale interest comes from the depth gradient, which never
repeats.

## Applying this to the act-1 dungeons

The data is already in the right shape. Each floor JSON in `design/act1-dungeon-interiors/`
carries `rows` — an ASCII grid, `#` wall (25,693 cells) and `.` floor (7,568) across 20 floors,
plus asset glyphs `M C D U S B T`. That grid **is** the splatmap; no mask needs generating.

Five themes, so five material sheets, one generation each:

| dungeon | theme |
|---|---|
| coastalReef | tidal coral reef |
| crystalCave | faceted crystal cavern |
| mistyGrotto | jagged black fang rock |
| sunkenCellar | flooded stone cellar |
| whisperingWoodsCave | root-riddled earth cave |

Suggested sheet per theme: **floor / wall / a wet-or-accent variant / rubble-and-debris**.
That is **5 calls, ~230k tokens for all 20 floors**, against per-tile generation which would be
several million and would still drift and seam.

Two dungeon-specific notes:

- **The wall/floor junction is rule 4's case, and it matters more here than anywhere.** Interior
  walls read as walls because of a defined base — a skirting, a shadow, a rubble line. Blending
  wall texture into floor texture will look exactly as wrong as a forest dissolving into a lake
  did. Give it its own opaque band with a crisp inner edge.
- Interiors are enclosed, so the macro layer wants *lighting* rather than relief: pools of light
  and falloff into darkness, plus per-theme touches (crystal glow, standing water, root shadow).
  The `deep[]` blurred-mask trick gives "distance from the nearest wall" for free, which is a
  good driver for both ambient occlusion at the wall foot and light pooling in open rooms.

## Files

- `scripts/make_materials.py` — split a sheet, make each quadrant tileable, report wrap error
- `scripts/render_material_map.py` — the splat renderer (materials, macro layer, edges, bank)
- `scripts/composite_landmarks.py` — measured-anchor sprite compositing
- `design/continent-terrain-class-method/owner-terrain/materials/` — the four overworld materials
- Rendered result: `.../art-tiles/act1-material-map{,-landmarks,-overview}.png`

Both scripts take the mask and materials as inputs, so pointing them at dungeon data is mostly
a matter of swapping the legend and the material set.
