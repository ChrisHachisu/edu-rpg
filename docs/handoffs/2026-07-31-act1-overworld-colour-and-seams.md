---
date: 2026-07-31
type: handoff
tags: [edu-rpg, overworld, act1, art-pipeline, codex-tokens]
status: superseded
superseded_by: "[[2026-08-01-act1-overworld-material-renderer-ios]]"
---

# Act 1 overworld — seams solved, colour theme picked, tone machinery must be torn out

## Read this first: the token situation

**~9.2M Codex tokens spent, over half the owner's max plan, and there is no shippable act-1
map yet.** The owner has said explicitly that budget is constrained and to alert them on drift.
**Do not launch a full-act generation run.** The remaining work is ~5 tile regenerations plus
local, zero-token image processing.

Every previous overrun came from the same root cause: local per-tile corrections stacked on top
of each other. Do not add another one.

## THE TARGET — this is now settled, with numbers

The owner picked a specific image as the colour theme they want:
**`design/continent-terrain-class-method/owner-terrain/art-tiles/TARGET-COLOUR-THEME.png`**
(preserved deliberately; it is a 1220x1500 downscale of the FIRST stitch, before any retoning).

Measured palette of that image — this is the goal, not an adjective:

| class | RGB | luminance | HSV |
|---|---|---|---|
| grass | (101, 114, 33) | **105** | (70°, 0.71, 0.45) |
| forest | (13, 30, 40) | **27** | (202°, 0.67, 0.16) |
| water | (10, 34, 55) | **31** | (208°, 0.81, 0.22) |
| rock | (69, 67, 56) | **66** | (51°, 0.19, 0.27) |
| whole map | | **61** | |

Note grass at **105** — much brighter than the current tiles, and water at **31** — much darker.
The current state has grass ~80 and water ~50, i.e. wrong in both directions.

## Current state of the tiles

`design/continent-terrain-class-method/owner-terrain/art-tiles/`

- **56 act-1 tiles exist**, 1248x1248, from two generations. 41 came from the good "primed" run.
- **Seams are SOLVED.** `scripts/prime_tile_base.py` pastes a neighbour's finished art into the
  3-cell (144px) overlap before generating, and `--lock` re-imposes it after. Shared strips end
  up byte-identical. This works; keep it.
- **Tone is a mess.** Tiles span mean luminance **25.8 to 78.1**. Causes, in order:
  1. The generation prompt lost its tone anchor (only the dark `tile-4-8-ART` was attached, not
     the bright `tile-7-6-ART`), so everything generated too dark.
  2. `scripts/retone_tiles.py --apply` was then run over all 56 tiles **destructively, with no
     backup**, pushing each tile toward per-class targets — brightening some, darkening others.
  3. `scripts/stitch_art_tiles.py` applies its OWN per-class normalisation on top.
  Three corrections against three different references. That is why the sea shows tile blocks.

- **`act1-tile-108-241-ART.png` is genuinely bad** — 29.5% near-black pixels. Regenerate it.
  Check the other darkest tiles too: 39-287, 85-310, 85-333, 85-287.

## Recommended plan

1. **Rip out the per-tile tone machinery.** Delete the `normalise_tone` call from
   `stitch_art_tiles.py`'s main loop and stop using `retone_tiles.py` per tile. Keep the
   min-error cut compositing — that part is sound.
2. **Regenerate only the ~5 bad tiles**, primed and locked as the existing pipeline does, with
   BOTH style anchors attached (`tile-4-8-ART.png` AND `tile-7-6-ART.png`) and the explicit
   target palette above in the prompt. ~47k tokens each.
3. **Stitch once, then apply ONE global colour grade to the single 7104x8736 image** to hit the
   target palette. One transform on one image cannot produce patchwork; dozens of per-tile
   transforms always will. This is the owner's own suggestion and it is correct.
4. Composite the 9 landmark sprites (already approved) and show the owner.

## What is DONE and must not be redone

- **Owner's terrain** `owner-terrain.json` — hand-painted, authoritative. Never rewrite. It has
  an `_edits` log of three owner-authorised changes (door nudges, Cinderwatch naming, the
  2026-07-30 Coastal Reef move + Darkfang split).
- **9 act-1 landmark sprites**, keyed, owner-approved:
  greenhollow, millbrook, port-sapphire (harbour, gates N/E/W only), crystal-cave,
  whispering-woods, darkfang, sunken-cellar, misty-grotto, coastal-reef.
  Contract: `design/LANDMARK-SPRITE-CONTRACT.md`. Towns 192px/4 cells, dungeons 144px/3 cells.
  Anchors are MEASURED from the sprite's widest opaque band, never a fixed percentage.
- **Seam mechanism** (prime + lock) — proven, byte-identical joins.
- **Landmark facings** — `scripts/landmark_orientation.py`. Dungeon mouths face only S/SE/SW/E/W;
  a north-facing mouth is hidden behind its own outcrop in 3/4 view and Codex will refuse it.

## Hard-won lessons — please do not relearn these

1. **Do not chunk generation across multiple `codex exec` calls.** Measured: cross-call overlap
   disagreement 28.5 vs 19.4 same-call. Each call is a fresh session with no memory of the last.
2. **Do not make Codex verify its own output.** A brief demanding 676-point cell sampling and
   retries cost 11 min and ~152k tokens per tile. A simple generate-only prompt: ~2 min, ~20k.
3. **Colour-classifying finished artwork DOES NOT WORK.** Seven different metrics were built and
   every one contradicted what was visibly on screen — one called the owner-approved tile "43.8%
   wrong" and the locked Crystal Cave reference "56.7% wrong". Do not build an eighth. Verify
   geometry from the BASE (which is correct by construction, 0 wrong cell centres) and verify
   appearance with the owner's eyes.
4. **Per-class means taken THROUGH THE SEMANTIC MASK are reliable** — the mask says which pixels
   are which class, so no classification is involved. That is the one measurement that never
   failed. Use it for tone, nothing else.
5. **Never `--apply` a destructive image transform without a backup.** That is how the original
   tile tones were lost.
6. Codex returns **1254x1254** natively regardless of the requested size; resize to 1248 locally.

## Invariants

- Preserve the dirty tree. **NO commits. NO builds. Never `npm run build`** (both `npm run dev`
  and `build` are wired to a blocked-build script deliberately).
- `dist/assets/index-BhoGQRaA.js` byte-identical: 4,987,581 bytes, md5
  `60d90b63607b6e6980eb170aeeed445e`. Verify before finishing.
- `owner-terrain.json`, `owner-terrain.raw-export.json`, `owner-layout*.json` are owner INPUT.
- Image generation goes through Codex: `codex exec -m gpt-5.6-sol --skip-git-repo-check "..."`
  (`-m gpt-5-codex` is rejected on this account).

## Also open

- Act 2 overworld — not started. 56 tiles. Do not begin until act 1 is signed off.
- A separate session is designing act-1 dungeon/town interior maps (owner wants a hand-drawn
  click-to-place planner, like `terrain-planner.html`). Do not touch that workstream.
- `src/data/maps.ts` overworld connection coords are stale — `mistyGrotto` points at (120,261)
  while its landmark is at (91,378); same for `voidRift` and the four portals.
- `src/map-engine/act1Overworld.ts` migration still open.
