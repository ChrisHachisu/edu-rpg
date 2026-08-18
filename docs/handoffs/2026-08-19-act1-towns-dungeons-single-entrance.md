---
date: 2026-08-19
type: handoff
project: edu-rpg
milestone: act1 towns + single-entrance dungeon arches
status: active
supersedes: "[[2026-08-18-town-art-first-tiled-rebake]]"
tags: [handoff]
---

# Handoff — Act 1 towns, and the single-entrance rearchitecture — 2026-08-19

## Owner verdict on build 54, verbatim

- **"the wheel issue is finally fixed and working correctly."** DONE. Do not touch `syncGradeWheel`.
- **"port sapphire looks perfect now!"** The rebaked plate is ACCEPTED. Its style is now the
  reference for every other Act 1 town.
- **"the double enter required ... is an issue again"** — REGRESSION, almost certainly mine.
- **"they both just let the player walk on top of it"** — the dungeon arches, in mistyGrotto and
  sunkenCellar. Plus: *"you are obviously not trying what i suggested."* He is right; see below.
- Seams: *"not connected at the correct location and the colors slightly do not match"*, and he
  believes removing the chimney and demijohn made those places look weird.

## What shipped

TestFlight **54**, verified `externalBuildState == IN_BETA_TESTING`, groups
`['Internal Testers','Beta Testers']`.

| commit | what |
|---|---|
| `e376ef3` | the grade wheel — **root cause: `pointerGuard` capture-ate its events** |
| `30b205b` `5d6448f` `6887f59` | the prop pipeline, now DEMOTED to a layout primer |
| `3c5a781` | the pixel grid is already perfect — measured; the fuzz was the ART |
| `32a6547` `407fac8` | a single generated image can never be sharp; four-tile rebake |
| `846cf8a` | the town gate rejected what the owner liked and admitted what he refused |
| `9cde329` | **the rebaked 1950 plate, wired in** |

## Verification

- `npm run gate`: **PASS**, `PINS CHECK PASS: all 84 pins`, on the committed tree 2026-08-18.
- Plate: mean pixel step 11.7 → **22.2**, hard 13.9% → **29.4%**, soft **38.4%** (drawn, not
  filtered — v6 collapsed to 9%). Density exactly **1.875 art px/world px → 3.0000x**.
- Rendered on the real `town.html` at dpr 3: **100% uniform 3x3 device blocks** at load and across
  six walks stopped on different sub-pixel phases (`scripts/probe_town_pixel_grid.cjs`).
- Wheel: pointer drag 1→4 and CDP touch drag 4→1, both surviving 8 forced repaints
  (`scripts/verify_picker_and_name.cjs`).

## Live state (verified 2026-08-18)

- TestFlight **54** distributed — via `python3 /private/tmp/qok/asc.py`, then `submit.py 54`
  printed `GATE PASS: externalBuildState == IN_BETA_TESTING`.
- HEAD `9cde329`, branch `fix/graduated-gpu-heal`, **NOT merged to main**.
- iOS payload carries the 1950 plate (706 files).

## THE FOUR TASKS, in the owner's priority order

### 1. THE ARCH — he asked for a plan and it is owed first

**What he suggested, twice, and what was never done: use the AUTHORED assets.** They exist at
`design/act1-dungeons/arch/archasset-{coastalReef,mistyGrotto,sunkenCellar,whisperingWoodsCave}.png`
— magenta background AND magenta opening so the lit mouth shows through from beneath. They have
never been wired in. `A1D_OVERHEAD_ON` is `false` at `public/dq-tiles.js:5229`, switched off after
three attempts to DERIVE an occlusion shape from the baked floor plate, each of which covered
33–51% of walkable floor and hid the player in the open.

The plan, and it must not be substituted:

1. `A1D_OVERHEAD_ON = true`, drawing the **authored** PNGs. **Never derive a shape from the plate.**
2. Anchor to each floor's measured arch: **opening 36x51 px, masonry 84x76 px**, identical on all
   four floors. Key the magenta (erode 1 px + despill; see `key_magenta` in
   `scripts/render_town_ground_proof.py`).
3. **Make the masonry a COLLISION BLOCKER.** This OVERRIDES the previous handoff's "S5 is ART, not
   collision" — the owner has now explicitly asked for blockers. The opening stays passable and
   needs **12–16 px of body clearance**; `patch_dungeon_arch_mask.py`'s verifier tested a
   ZERO-WIDTH POINT and that is how `c0329fe` sealed three dungeons.
4. Verify by walking a seeded save into all four floors and screenshotting from above, below and
   both sides. Source review is not proof.

### 2. THE DOUBLE-ENTER REGRESSION — mine, and the suspects are named

Symptom: the name field re-takes focus after tapping out or pressing enter, so entry needs two
presses. Prime suspects, in order:
- `nameErrorEffects()` in `public/ui-overhaul.js` does `setTimeout(inp.focus, 220)`.
- `nameErrShown` was added to the intro **signature**, so the screen now rebuilds on that
  transition, and the bundle's own `focusNameInput()` fires when `createRow === 'name'`.
- `routeIntro`'s `introStart` sets `ts.createRow = 'start'` before `confirmCreate()`.

### 3. THE SEAMS — position AND colour, plus the missing chimney/demijohn

Worst seam is **2.0x the plate mean** (down from 4.3x) at x=975 and y=975 on
`design/act1-towns/rebake/plate.png`. He reports the joins are misaligned and slightly
mismatched in colour, and suspects the lost chimney and demijohn. Both are true: the four tiles
were graded as one image AFTER stitching, so per-tile exposure drift survives, and each tile
redrew its own edge content.
Cheapest honest fixes, in order: per-tile exposure match BEFORE stitching (`scripts/grade_plate_exposure.py`
takes a target); then a min-error-cut quilt across the join (`min_error_seam` in
`scripts/make_town_materials.py` already implements Efros-Freeman); then regenerate only the two
tiles whose edges are wrong, grafting the neighbour band from RAW output (already implemented in
`scripts/rebake_town_tiles.py`).

### 4. THE OTHER ACT 1 TOWNS, AND THE SINGLE-ENTRANCE REARCHITECTURE

- **New locked direction, owner:** *"only one entrance for towns and dungeons (unless they connect
  acts or in other special circumstances) and the edge need to be blockers so the user cannot walk
  on top of it."*
- Overworld town/dungeon entrance sprites must be **redrawn with a specific facing mouth that
  matches the terrain it sits in**, and **the entrance position must match inside the dungeon**.
- Act 1 map ids present in the bundle: towns `portSapphire` (DONE), and candidates
  `frostfallVillage`, `hauntedVillage`, `stormreachVillage`, `sunkenTempleVillage`,
  `twilightVillage` — **enumerate which are actually Act 1 before generating anything**.
  Dungeons: `coastalReef`, `mistyGrotto`, `sunkenCellar`, `whisperingWoodsCave` (+ `crystalCave`,
  **never modify**).
- Each new town needs: the plate, walkable boundaries, NPCs and a shopkeeper/healer generated and
  PLACED. `scripts/bake_npc_sheets.py`, `scripts/place_town_npcs.py` exist.

## Locked decisions

- **Towns are ART-FIRST**, one baked plate. The prop composer (`scripts/compose_town.py`) survives
  only as a layout primer.
- **The tile rule, which is arithmetic:** the image tool always returns **1254 px**; the plate must
  be **1950**; so one image must be scaled UP 1.55x and **upscaling destroys sharpness** (20.64 →
  13.97 mean step, measured), while downscaling sharpens (→ 25.67). **Four tiles, 2x2** — 3x3 puts
  four seam lines across the plate, 2x2 puts two.
- **v6 reached 1950 by upscaling and posterizing the old painting locally** (`4898e2d` says so).
  The generator genuinely caps at 1254. Tiling is forced, not preferred.
- **Do NOT re-propose device-resolution rendering** (9x fragment cost, pixel-identical overworld).
- Music remains deferred to the next bundle edit.

## Gotchas

- **`serve -s dist` rewrites module requests to index.html and breaks `town.html`.** Use
  `python3 -m http.server` from `dist/` for the standalone act1-hifi pages.
- **Codex writes output next to the INPUT** (e.g. `primer-11-redrawn.png`) as well as under
  `~/.codex/generated_images/`, **and it wrote two files into `docs/handoffs/`** this session,
  which would break latest-handoff-first. They were moved to `design/act1-towns/codex-notes/`.
  Check `docs/handoffs/` is clean before trusting `ls | sort -r | head -1`.
- **Codex's `-i` is variadic**, so a positional prompt after it is swallowed as another image —
  put the brief on **stdin**.
- **The prop cut order is NOT the sheet's visual order**: 22 = LAMP, 23 = BUSH, 24 = FENCE. Verify
  against a rendered labelled contact sheet.
- **The harness routes taps on pointerup, not `click`** — `dispatchEvent('click')` does not drive
  this UI. Use `page.touchscreen.tap`.
- **`artPxPerCell` in portSapphire-town.json is read by nothing**; `town.html` derives everything
  from `screenArt.naturalWidth`, so a new plate size needs no code change.
- **The plate is an already-pinned file**, so replacing it needs no new `runtime_baseline.py`
  entry. A genuinely NEW asset still does — add the key by hand with zeros, `npm run repin`, then
  COUNT files in `ios/App/App/public/`.
- The gate's finish floor was recalibrated from the owner's own approval point (hard 22%, mean 17)
  because the hero-derived floor rejected what he liked and **caused** v6's posterize. The SOFT
  band (22–40%) is the filter detector — never loosen that one.

## Resume here (load on demand — do NOT eager-read the corpus)

**Distilled state:** Build 54 is on the owner's device and he has accepted the wheel and Port
Sapphire. Four things are open, in his priority order: the arch (plan above, already agreed), the
double-enter regression, the plate seams, and then every other Act 1 town plus the single-entrance
rearchitecture. **Start with the arch** — it is the one he says nothing has worked on.

| purpose | path | read when |
|---|---|---|
| authored arch assets | `design/act1-dungeons/arch/` | the arch, first task |
| the overhead layer, currently OFF | `public/dq-tiles.js:5229` | the arch |
| what failed before, and why | `scripts/bake_dungeon_overhead.py` | only as a record |
| the accepted town plate + tiles | `design/act1-towns/rebake/` | seams, or a new town |
| the tile pipeline | `scripts/rebake_town_tiles.py` | generating any town plate |
| the art gate | `scripts/check_town_finish.py --walkable` | judging any plate |
| exposure match | `scripts/grade_plate_exposure.py` | seam colour mismatch |
| wheel + name verification | `scripts/verify_picker_and_name.cjs` | the double-enter fix |
| pixel-grid probe | `scripts/probe_town_pixel_grid.cjs` | any fuzz claim |

## Kickoff prompt (paste verbatim into next session)

```
edu-rpg, worktree /Users/christopherhachisu/Documents/claudecode/edu-rpg/.claude/worktrees/laughing-mahavira-c9f72b,
branch fix/graduated-gpu-heal, HEAD 9cde329, gate green (84 pins), NOT merged to main.
TestFlight 54 is on the owner's device.

READ FIRST: docs/handoffs/2026-08-19-act1-towns-dungeons-single-entrance.md

Owner on build 54: the grade wheel is FIXED ("finally fixed and working correctly" -- do not touch
syncGradeWheel) and Port Sapphire is ACCEPTED ("looks perfect now"). Four things are open.

TASK 1 -- THE DUNGEON ARCH. He walks ON TOP of it in mistyGrotto and sunkenCellar, and said "you
are obviously not trying what i suggested." He is right. His suggestion, given twice, was AUTHORED
assets: design/act1-dungeons/arch/archasset-{coastalReef,mistyGrotto,sunkenCellar,whisperingWoodsCave}.png
exist and have NEVER been wired in. A1D_OVERHEAD_ON is false at public/dq-tiles.js:5229.
  1. Turn it on with the AUTHORED PNGs. NEVER derive an occlusion shape from the baked plate --
     three attempts each covered 33-51% of WALKABLE floor and hid the player in the open.
  2. Anchor to the measured arch: opening 36x51 px, masonry 84x76 px, identical on all four floors.
     Magenta background AND magenta opening; key it with erode+despill.
  3. Make the MASONRY A COLLISION BLOCKER. This overrides the old "S5 is art, not collision" note --
     the owner has now explicitly asked for blockers. The opening stays passable and needs 12-16 px
     of body clearance; patch_dungeon_arch_mask.py's verifier tested a ZERO-WIDTH POINT and that is
     how commit c0329fe sealed three dungeons.
  4. Verify by walking a seeded save into all four floors, screenshotting from above, below and both
     sides. Source review is not proof.

TASK 2 -- THE DOUBLE-ENTER REGRESSION, which is ours. The name field re-takes focus after tapping
out or pressing enter. Suspects in order: nameErrorEffects()'s setTimeout(inp.focus, 220) in
public/ui-overhaul.js; nameErrShown being part of the intro SIGNATURE so the screen rebuilds and the
bundle's own focusNameInput() fires on createRow === 'name'; and introStart setting createRow first.
Verify with scripts/verify_picker_and_name.cjs plus a real tap-out/enter sequence.

TASK 3 -- THE PLATE SEAMS. Owner: "not connected at the correct location and the colors slightly do
not match", and he thinks removing the chimney and demijohn made those spots look weird. Worst seam
is 2.0x the plate mean at x=975 and y=975 of design/act1-towns/rebake/plate.png. Both causes are
real: the four tiles were exposure-graded as one image AFTER stitching, and each tile redrew its own
edge. Fix in this order -- per-tile exposure match BEFORE stitching (scripts/grade_plate_exposure.py),
then a min-error-cut quilt across the join (min_error_seam in scripts/make_town_materials.py), then
regenerate only the offending tiles. Restore the chimney and the demijohn.

TASK 4 -- EVERY OTHER ACT 1 TOWN, AND THE SINGLE-ENTRANCE REARCHITECTURE. Use the accepted Port
Sapphire style. NEW LOCKED DIRECTION, owner: "only one entrance for towns and dungeons (unless they
connect acts or in other special circumstances) and the edge need to be blockers so the user cannot
walk on top of it." Have codex redo ALL overworld dungeon and town entrance assets with a specific
facing mouth matching the terrain they sit in, and the entrance position must MATCH inside the
dungeon. Each new town needs its plate, walkable boundaries, and NPCs + shopkeeper/healer generated
AND placed (scripts/bake_npc_sheets.py, scripts/place_town_npcs.py). Enumerate which map ids are
actually Act 1 before generating anything; crystalCave must never be modified.

THE TILE RULE, which is arithmetic and not negotiable: the image tool ALWAYS returns 1254 px and a
plate must be 1950 for an exact 3x device upscale, so a single image must be scaled UP 1.55x and
upscaling destroys sharpness (measured 20.64 -> 13.97 mean step; downscaling gives 25.67). Generate
every plate as 2x2 tiles via scripts/rebake_town_tiles.py, grafting each neighbour band from RAW
generator output -- a band that reaches the model upscaled arrives as mush and it redraws the join
(measured 88.7 mean step across the seam). Judge with
scripts/check_town_finish.py <plate> --walkable public/act1-hifi/town/portSapphire-walkable.json.

OTHER HARD-WON RULES: serve dist with `python3 -m http.server` from dist/, NOT `serve -s`, which
rewrites module requests and breaks town.html. Codex's -i is variadic -- put the brief on stdin --
and it writes output next to the INPUT as well as under ~/.codex/generated_images/; it also dropped
two files into docs/handoffs/ this session, so check that directory is clean before trusting
latest-handoff-first. A new runtime asset needs its pin key added BY HAND in scripts/runtime_baseline.py
with placeholder zeros, then `npm run repin`, then COUNT the files in ios/App/App/public/ -- otherwise
it passes every gate and never ships. Ship order: ./scripts/ship-ios.sh -> python3 /private/tmp/qok/asc.py
-> assign.py <n> -> submit.py <n>; the gate is externalBuildState == IN_BETA_TESTING.

The owner expects all four tasks fixed, implemented and playable in the NEXT build. If something
cannot be done, say so explicitly rather than shipping it silently incomplete.
```
