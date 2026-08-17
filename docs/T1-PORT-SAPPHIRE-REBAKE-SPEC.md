---
date: 2026-08-17
type: spec
tags: [edu-rpg, art, town, portSapphire, T1, T2, rebake]
status: APPROVED — owner, 2026-08-17: "do both, camera snap now and the 1950 rebake"
---

# Port Sapphire re-bake — the measured spec (T1 / T2)

This is the brief input, not the brief. Per `docs/AGENT-WORKFLOW.md` and `CLAUDE.md`, the planning
task never generates assets: a fresh worker task writes the Codex brief from these numbers and runs
the generation. `docs/ART-GENERATION-PREFLIGHT.md` preflight is **complete** below, including its
step 6 — the failable check exists first: `scripts/check_town_finish.py`.

## What the owner asked for, and which half is already done

> T1: *"port sapphire's touch up is not working visually ... the resolution is currently fuzzy on the
> app and i can clearly tell that the texture is different from the hero so this needs to be matched
> in the updated design."*

Two independent defects, measured 2026-08-17 in WebKit on an iPhone 13:

| half | measurement | status |
|---|---|---|
| **resolution** — the plate was upscaled by a NON-integer 3.1034x, so art pixels landed on 3 device px or 4, irregularly (14% of 3x3 device blocks uniform, against the overworld's 100%) | 14% -> **100%** uniform after the camera snap | **FIXED in build 40** (`public/act1-hifi/town.html`), at the cost of 3.4% more town on screen |
| **finish** — the plate is painted soft where the hero is drawn hard, at the same magnification | hero mean pixel step **31.6** / 47.5% hard; plate **11.7** / 13.9% hard — the hero is **2.7x harder per pixel** | **OPEN — this is what the re-bake is for** |

**Read this before pricing the density.** Now that the camera snaps to a whole ratio, 1950x1950 no
longer buys the integer grid — the snap already did, for free. What 1950 buys is the grid *without*
spending 3.4% of the view, and it is the correct density to author AT. **The re-bake is worth
commissioning for the FINISH, not the resolution.** A pure resample of today's 1885 plate to 1950
would add no detail and is not worth doing: no master larger than 1885 exists (checked
`design/act1-towns/portSapphire-screen*.png` — 1248 and 1885 only), so this is a genuine
regeneration.

## Targets — numbers, twice (preflight step 5)

Gate with `python3 scripts/check_town_finish.py <plate.png> --anchor public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png`

| quantity | target | shipped plate today |
|---|---|---|
| plate size | **1950 x 1950** | 1885 x 1885 |
| art px per world px (over 1040 world px) | **1.875** | 1.8125 |
| resulting device upscale on a 390pt dpr-3 phone | **exactly 3.0000x** | 3.1034x |
| mean luminance | **90.1 ± 6** (HOLD) | 90.1 |
| blue/red | **0.674 ± 0.06** (HOLD) | 0.674 |
| mean abs luminance step between neighbouring px | **>= 24** (hero 31.6) | 11.7 |
| fraction of neighbour pairs stepping >= 24 | **>= 34%** (hero 47.5%) | 13.9% |
| pale paving coverage (luminance >= 150) | **>= 5.5%** | 15.0% |

The finish bands stop short of the hero's 47.5% on purpose: the town should read as the same
*material family* as the hero, not become a sprite sheet. Hard edges, legible blocks, higher local
contrast — still a painting.

## Asset family, and which doc rules DO NOT apply (preflight step 3)

Family: **environments / town screen**. Not battle monsters, not field characters.

- `ART-DIRECTION.md` canonical STYLE BLOCK's *"bold near-black outline around the full silhouette"* —
  **battle monsters only.** It does not apply here and it does not apply to the hero either. Applying
  it once already cost all four NPCs a regeneration.
- `ART-DIRECTION.md` environment STYLE BLOCK's *"dark, dense, realistic old-growth, deep forest
  shadows"* — **stale.** The settled town is bright. Hold luminance 90.1; that error cost one full
  regeneration 25 luminance too dark.
- `LANDMARK-SPRITE-CONTRACT.md` enclosure lock — amended 2026-08-01, perimeter no longer mandatory;
  match the town screen instead.
- `design/act1-towns/PORT-SAPPHIRE-SPEC.md` pipeline — **dead**, describes the scrapped semantic-grid
  method.

Codex reads none of these files. Every rule the generator must obey has to be restated verbatim in
the brief, and **naming an anchor image does not transfer its properties** — an explicit written
instruction beats a reference image every time.

## Hard constraints the art must satisfy

1. **THE PAINTING IS THE COLLISION AUTHORITY.** `scripts/derive_town_walkable.py` colour-thresholds
   the pale stone paving out of this plate to build the walkable network — largest connected
   component, morphology, trace, RDP simplify. Darken or desaturate the paving and you silently move
   where the player can walk. The paving must stay a distinct pale band and the street network must
   stay **one connected component**. See
   `claude_brain/04-Learnings/learning-20260817-town-walkable-derived-from-painted-art.md`.
2. **FENCED.** Owner decision, re-affirmed 2026-08-17: Port Sapphire has a perimeter again.
3. **ONE ENTRANCE, shared.** One entrance for the town, and it must line up with the overworld
   landmark sprite's entrance — *"one entrance in the overworld and the town"*.
4. **NPCs: four directions, stationary.** They turn to face the hero. This retires the older
   down-facing-only and approach-from-south rules. Sheets are 3 cols x 4 rows of 64 px
   (`public/act1-hifi/town.html`, `NPC_FRAME`); today only col 0 / row 0 is ever drawn, so the other
   rows must be authored, not left as placeholders.
5. **A shop and a healer must have obvious, walkable frontage** — T1 asks for *"a place for the shop
   and the healer"* and for it to be *clear where players can walk*.
6. **Foreground props stay pixel-exact with the base plate.** `portSapphire-foreground.png` is
   re-extracted from the SAME source pixels and cropped to its alpha bbox (0.53% opaque, 2.1 MB
   instead of 14.2 MB). Regenerate it from the new plate with `scripts/derive_town_foreground.py`;
   do not hand-composite.
7. **Memory.** The plate ships in the payload and decodes on a device with a recorded history of
   WebContent kills. 1950x1950 RGB is ~11 MB decoded, close to today's 1885 (~10.7 MB). Do not
   quietly exceed 1950 — 5850x5850 (true 1:1 device pixels) is ~137 MB and is out of the question.

## Verification, before the owner sees it

1. `scripts/check_town_finish.py` — must PASS (it currently fails today's plate on density + finish).
2. `scripts/derive_town_walkable.py` — must produce ONE connected region; diff the cell count
   against today's 9376-cell overworld region equivalent for the town and review any large change.
3. `scripts/render_town_hero_proof.py` — the hero at true size on the new plate, to confirm scale.
4. Device screenshot on the simulator, town, and re-measure uniform-3x3 at **100%** with the snap
   now a no-op (`rawRatio` should already be a whole 3.0 before rounding).
5. `npm run repin` — the plate is pinned; both gates must stay green.
