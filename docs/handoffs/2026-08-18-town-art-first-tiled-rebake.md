---
date: 2026-08-18
type: handoff
project: edu-rpg
milestone: build-54 UI fixes + the tiled art-first town rebake
status: active
supersedes: "[[2026-08-18-wheel-arch-and-prop-based-town]]"
tags: [handoff]
---

# Handoff — the wheel's real cause, and the town goes art-first — 2026-08-18

## The two decisions that were REVERSED this session

- **The town is ART-FIRST again.** Owner: *"I don't think the new direction for the towns are
  working. I think the process will be different from dungeons and overworld, but visually towns are
  better when they are art first."* Then: *"The previous design was mostly good. We just need to fix
  the fuzziness"*, and *"If the art needs to be redone to fix the fuzziness, that's fine. I just want
  to reliably make the artwork look sharper like the hero."*
  This supersedes the prop-based lock in the previous handoff. **The shipped town's DESIGN is
  approved and must not change** — same buildings, same streets, same harbour. Only the rendering
  finish changes.
- **The prop-based composer is NOT dead, it is DEMOTED.** `scripts/compose_town.py` still produces a
  correct layout at correct scale, and the props, the wisewoman's cottage and the ground/harbour
  materials are all preserved. They are now a layout primer and a style reference, not the shipped
  output.

## What shipped to the tree (nothing to TestFlight — see below)

| commit | what |
|---|---|
| `e376ef3` | the grade wheel's real cause + the empty-name refusal |
| `30b205b` | the ground pilot: four seamless materials |
| `5d6448f` | the layout-driven composer |
| `6887f59` | the buildings were half-size; scale set from the shipped plate |
| `3c5a781` | the pixel grid is already perfect — measured, so the fuzz is the ART |
| `32a6547` | a single generated image can never be sharp; nine-tile rebake |
| *(gate fix)* | the town gate rejected what the owner liked and admitted what he refused |

**Build 54 is committed and gated but deliberately NOT shipped.** Owner chose *"Hold — bundle with
the town"* when asked. `npm run gate` PASS, 84 pins.

## THE GRADE WHEEL — five builds, one line

`pointerGuard` in `public/ui-overhaul.js` attaches to `document` in the **CAPTURE phase** and
`stopPropagation()`s every pointer/touch event inside the overlay. `#qok-gwheel`'s own listeners were
therefore **never called, on any engine**. The measured "zero scroll events while scrollTop changes"
was the bug and was written off as a harness artefact three times. The owner's video showing the
highlight tracking his finger proved only that the browser's scroll physics run *below* the event
layer.

Fixed by exempting the wheel from the guard (as the text field already was) and rebuilding it as a
UIPickerView driven from pointer events — nothing depends on an event the engine may withhold.
Verified on the artifact with real input, asserting the thing that actually failed: the value
SURVIVING. Pointer drag 1→4 and CDP touch drag 4→1, both still correct after 8 forced repaints.

Full write-up: [[learning-20260818-capture-guard-ate-the-wheel]].

## THE FUZZ — the mechanism, which is arithmetic

1. **The geometry is already fixed and I was wrong to suspect it.** Build 53's snap makes the
   art→device ratio whole. I expected the camera's fractional *translation* to break the grid
   anyway. Measured on the real page at dpr 3: **100% uniform 3×3 device blocks** at load and after
   six walks each stopped on a different sub-pixel phase. `scripts/probe_town_pixel_grid.cjs`.
2. **The image tool always returns 1254×1254** whatever the brief asks. The plate must be 1950 to
   land on an exact 3×. So one generated image must be scaled UP 1.55×, and scaling up is what
   destroys sharpness:

   | | mean step | hard |
   |---|---|---|
   | generated, 1254 native | 20.64 | 29.2% |
   | **upscaled to 1950** | **13.97** | 19.2% |
   | downscaled to 975 | 23.91 | 34.0% |
   | downscaled to 650 | 25.67 | 38.0% |

   **Up softens, down sharpens.** A one-image town is permanently soft however well drawn — which is
   why v6 could only reach its numbers by posterizing.
3. **So: nine tiles.** Each covers a ninth, gets all 1254 px, lands at 650. Sequential in reading
   order, each primed with its finished left/top neighbours in a 96 px band — the overworld
   pipeline, the only thing here that has produced a seamless multi-tile image.
   `scripts/rebake_town_tiles.py`.

Centre tile, same region: shipped **12.86 / 16.2%** → rebaked **19.62 / 26.2%**, soft band 40.2%
(drawn, not filtered). 26.1% is what v8 measured when the owner said *"sharpness it looks good"*.

## The gate was wrong in two ways, both found on candidates HE judged

- The finish floor came from the **heroine** (a character: dense, high contrast, no uniform fields).
  It rejected v8 at 26.1% which he ACCEPTED, and admitted v6 at 49.5% which he REJECTED — and it
  *caused* v6, because posterizing is the only way to reach 49.5% from a painting. Floor reset to
  0.22 / 17.0 from his approval point. **The soft band is untouched** and is what makes that safe.
- `--layout-ref` compares two *thresholded* paving masks, so a street redrawn with darker mortar
  loses IoU without moving. New `--walkable` gate against the collision authority:
  shipped 49.7% paved-but-not-walkable, rebake 44.2% (better), v6 66.2% (the failure).

## Gotchas

- **`serve -s dist` rewrites module requests to index.html and breaks `town.html`.** Use a plain
  static server for the standalone act1-hifi pages.
- **`artPxPerCell: 29` in portSapphire-town.json is not read by any code.** `town.html` derives
  `artPxPerWorld` and `artScale` from `screenArt.naturalWidth`, so a 1950 plate needs no code change.
- **The plate is an already-pinned file**, so replacing it needs no new `runtime_baseline.py`
  enumeration entry — the "a new asset can pass every gate and never ship" trap does not apply here.
- **Codex writes its output next to the INPUT** (e.g. `primer-11-redrawn.png`), not only under
  `~/.codex/generated_images/`. Search both.
- **The prop cut order is NOT the sheet's visual order** — 22 is the LAMP, 24 the FENCE. Verify
  against a rendered labelled contact sheet.
- The browser harness routes taps on **pointerup**, not `click`; `dispatchEvent('click')` does not
  drive this UI. Use `page.touchscreen.tap`.

## Resume here

**Distilled state:** Eight of nine rebake tiles were generating when this was written; tile 1,1 and
0,0 are done and in `design/act1-towns/rebake/plate.png`. Next action: when
`ALL TILES DONE` appears in the tiles log, run

```bash
python3 scripts/check_town_finish.py design/act1-towns/rebake/plate.png --walkable public/act1-hifi/town/portSapphire-walkable.json
python3 scripts/check_town_plate_vs_walkable.py design/act1-towns/rebake/plate.png
```

then look at the seams, which are the one thing that can still ruin it. If it holds, copy to
`public/act1-hifi/town/portSapphire-screen.png`, `./scripts/repin.sh`, and count the files in
`ios/App/App/public/`.

**Still open:** the harbour tiles are the hardest (most detail); wisewoman's cottage is generated but
not placed in the art-first plate; music still deferred to the next bundle edit; L1/L2 no-retry
loaders; D2(a) boss cut from the baked dungeon floor; O1 overworld entrance structure; the dungeon
arch overhead layer is still OFF pending the four authored assets.
