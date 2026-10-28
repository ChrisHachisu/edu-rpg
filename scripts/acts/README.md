# Acts 2–5 overworld art (cloud renderer)

Renders Acts 2–5 in the Act 1 (build 91) style: the same kit pixels, the same scale and the same coast method, recoloured per biome.

## Run

```
python3 scripts/acts/biome_kits.py          # kit contact sheets -> acts-preview/overworld/kits-actN.png
python3 scripts/acts/placements.py          # global whole-object placements -> $ACTS_OUT/placements.json
python3 scripts/acts/render_act.py --act 2  # ~5 min, ~4 GB RAM; run acts 2-5 (3 in parallel is fine)
python3 scripts/acts/previews.py            # overviews, close-ups, Act1/2 seams, continent overview
python3 scripts/acts/export_runtime.py 2 3 4 5   # flattened runtime format -> $ACTS_OUT/actN/runtime/
python3 scripts/acts/check_collision.py 3   # which landmark doors share a walkable component
```

## Runtime export (`actN/runtime/`, format `flattened-ground-v0`, not locked)

`export_runtime.py` is separate from rendering, so the format can change cheaply. It writes:

- `chunks/ground/cK-rJ.webp`: one OPAQUE lossless WebP per chunk. Base, water, foam and forest (trees and cliffs) are baked in that order with the game's blend, out = src.rgb + dst·(1−a). RGB under alpha 0 is zeroed first. Acts 2–5 have no north overhang.
- `chunks/front/cK-rJ.png`: walk-behind pixels, written only where some exist.
- `chunks/crest/cK-rJ-{0,1,2}.png`: half-res, premultiplied, masked by (1 − forest alpha), written only where water exists.
- `collision.png`, `walkbehind.png` and `landmarks/`, plus `manifest.json`.

No water, foam, forest or canopy files and no all-transparent layers are written. The layered chunks in `actN/chunks/` are render intermediates only.

## Seams

- Placement is global, so pixels in overlapping act windows are identical (Act 3/4 y 88–128, Act 2/3 and so on). Either act's chunk can draw an overlap strip.
- No Acts 2–5 object reaches into Act 1's shipped raster: rocks stay at x ≥ 161 for y ≥ 218, tree centres at x ≥ 163.3, and Act 5 trees stay above y 218. In the Act 1 overlap (x 161–164), Act 2's whole objects are meant to draw over Act 1's straight-cut cliff edge, so Act 2 chunks draw after Act 1's.
- The first 6 columns of Act 2's divider range keep Act 1's rock colour, so the snowline fades in east of the seam.

`ACTS_OUT` sets the output folder (default: the session scratchpad `acts/overworld`). `ACTS_PREVIEW` sets the preview folder (default `/mnt/project-files/edu-rpg/acts-preview/overworld`). Nothing writes to `public/` or `dist/`.

## Output: `$ACTS_OUT/actN/`

The chunk origin is the act's owner-terrain bounds `[x0,y0]`. Chunks are 16 cells (512 px), named `cK-rJ`, and their x, y, width and height in `manifest.json` are in world px (16 per cell), as in Act 1.

- `chunks/base/*.webp`: lossless, UnsharpMask r0.9 130% t2, base layer only.
- `chunks/water-r2`: antialiased water alpha over the R2 texture, global world phase.
- `chunks/foam`, `chunks/forest` (whole trees and whole cliffs, sorted by contact y), and `chunks/front` (walk-behind tops).
- `chunks/crest/*-{0,1,2}.png`: half-res blue glints from `scripts/b91/crest2.py`, with RGB premultiplied by alpha.
- `collision.png`: 1 bit at 32 px/cell; 1 means blocked, feet-only. It covers raised art alpha ≥128, water ≥128 and landmark masks. It excludes the top 24 px of every raised run longer than 40 px that has open ground to its north.
- `walkbehind.png`: those trimmed pixels.
- `landmarks/*.png`: recoloured sprites at Act 1 native size (towns 192, dungeons 144, Demon Castle 192). They are authored at 48 sprite px per cell, like Act 1.
- In `manifest.json`, `landmarks[]` gives each landmark's cell, anchor, kind and gate, plus `maskB64`. The mask is a packbits little-endian blocking mask at 32 px/cell (`maskSize`, `maskAnchor`). Towns are blocked along their closed outline except a gate channel (south, or north when the sea lies south). Dungeons and castles are open only at a front mouth channel. Gate and mouth channels are 80 px (2.5 cells = feet stencil 1.75 + 0.75) wide and 20 px deep (`GATE_HALF`, `GATE_DEPTH` in render_act.py), and an approach lane 4.6 cells wide and 8 cells deep in front of each gate has no tree, rock or rock floor (`placements.in_approach`). Check with `python3 scripts/acts/check_gates.py 2 3 4 5`.

## Constants (from Act 1)

- 32 px/cell.
- Meadow tile: 96 texels/cell, world phase taken from the Act 1 origin (16,218), so it continues Act 1's grass exactly.
- Cliff kit: Codex per-act sheets `codex-kits/kit-actN-cliffs/kit-actN-cliffs-try1.png` (2×2 panels on pure magenta, same construction as Act 1's main kit). `biome_kits.codex_panels` keys magenta out (hard alpha, 3 px despill band), slices by connected component, and scales ×0.5 nearest (Act 1 main-kit scale). `cliff_geometry` pads every act's panel bottom-centre onto one canvas per slot, and placements use the union to fit and the intersection to count coverage. Biomes: snow = Act 2, haunt = Act 2 in dusk light, grass (Act 1 seam) = Act 2 panel in Act 1 rock tones, sand = Act 3, ash = Act 4, dark = Act 5. A missing sheet falls back to the recoloured Act 2 panel.
- Crowns: Act 3 palms (`kit-act3-palms-try1`, 4×3 grid) and Act 5 dead trees (`kit-act5-deadtrees-try1`) come from Codex sheets via `biome_kits.codex_crowns`: keyed with full despill and gaps kept, sliced by component per grid cell, longer side scaled to 136 px (the Act 1 crown side 68), hard alpha. Feet collision uses the closed silhouette. The 12 clumps spread over the 7 placement indices. To read at continent scale, dead wood is lifted ×1.18 and the floor under the dead forest is shaded 80 %. Override the folder with `CODEX_KITS`. The owner ruled out small companion spires (2026-10-28).
- Act 2's divider strip (x 161–170) is narrower than a panel, so panels there may reach into Act 1's mountain columns and end at the act seam. Act 1's range top (rows 218–221) widens up to 9 rows into Act 5 ground.
- Rock floor: ground inside a range's closed hull that no panel covers is painted dark rock in the local kit and blocked, so a gap shows rock, not snow, sand or ash.
- Crowns: side 68 (136 px), 7 crowns, density ≈0.35 per F cell (Act 1: 0.37).
- Coast: `scripts/b89/coast.py` with CORRIDOR 160, FRONT 200, JOIN 48 and ROCKFILL off. The rock mask comes from placed objects.
- Sand band: 11+6·noise px.
- Foam alpha: 200/140/110.
- Rock–sea shadow: ×0.62.

## Biomes

| Act | Ground | Mountains | Forest | Shore |
|---|---|---|---|---|
| 2 | Snow | Grey with snow caps on top-lit faces | Snowy evergreens | Icy grey |
| 2 (Ravenhollow / Haunted Forest, within ~8 cells of the band) | Blue-grey | Dark, light frost | Near-black teal | |
| 3 | Sand / dune | Red-orange sandstone | Lush olive (oasis) | Warm sand |
| 4 | Ash | Obsidian with ember cracks | Charred, ember flecks | Dark ash beach |
| 5 | Charcoal-purple | Grey | Dead purple-grey | Dark |

Frozen Lake (Act 2 W cells) is tinted icy and has no crests or foam.

Biome transitions come from per-cell act labels, blurred with σ 3 cells and perturbed by world-phased noise. Ground blends per pixel. Each object takes its biome by a hash draw against the local weights, so the snowline and other borders dither organically.

## Round 2 (borders)

- Ground biome labels are domain-warped by up to ±15 cells within 12 cells of any biome border. Ground then blends over a noise-displaced band (σ 4.5 cells plus two noise octaves). No act rectangle edge survives.
- A cliff object takes the kit of the open ground its face looks onto: the nearest non-mountain land cell to its contact, via a low-frequency noisy kit field. A border range therefore splits along its crest, not into colour columns or stairs.
- Act 5's output runs to y 221 and repaints Act 1's top rows 218–221 over x 80–161. Act 1's own forest and north overhang are composited back on top, and Act 1 pixels are kept exactly outside that stretch. The runtime must draw Act 5's last chunk row after Act 1 there.
- Ridges too thin for a main panel widen by up to 4 cells onto open ground, and that ground is blocked. Panels may also spill 1 cell past the painted range edge or out over water.
- Landmark art scale is 32/33.6, since the runtime draws a landmark `size` world px wide and one overworld cell is 48×0.7 = 33.6 px. A town is therefore 183 art px (5.7 cells), as in Act 1.
- Act 3/4 options: `ACTS_VARIANT=A|B ACTS_OUT=<dir> render_act.py --act 3/4 --no-chunks`, then `previews.py act34` and `check_act34.py`.

## Round 3

- `ow_crowns.py` (procedural palm and dead-tree clumps, towns method) is now only the fallback when a Codex crown sheet is missing.
- Tree collision uses each clump's closed, hole-filled silhouette, so the gaps between fronds and branches are not walkable.
- Dead-forest floor is shaded under the clumps.
- The crest split query point is jittered by ±6 cells, so the x≈160 kit border wanders.
- The main outputs use `ACTS_VARIANT=C`. Set it for every render; placements are cached per `ACTS_OUT`.

## Known gaps

- The Act 3/4 overlap rows (y 88–128) use Act 4's terrain. This puts Act 3's Desert Tomb (270,112) and Magma Tunnels Act 3 side (192,93) north of Act 4's border range, which is unreachable from Act 3 (see the report).
- Collision is art data (PNG), not the QOKF8COL `.bin`. Wiring and conversion are left to the runtime.
- The Act 1/Act 2 seam (x 161–164) relies on the runtime drawing Act 1 last. The previews feather the last 3 overlap cells.
