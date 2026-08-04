---
date: 2026-08-04
type: handoff
project: edu-rpg
milestone: act1-overworld-baked
status: active
supersedes: "[[2026-08-03-act1-design-lock-and-playability]]"
tags: [handoff, edu-rpg, act1, overworld, dungeons, towns, hud, ios]
---

# Handoff — Act 1: the overworld art is baked in; dungeon art is next — 2026-08-04

One session owns all three Act-1 workstreams. The other two are archived and unreachable.

## THE NEXT TASK, in one line

**Re-bake all nine in-scope Act 1 dungeon floors** — the owner chose the wide scope on 2026-08-04.
This is almost certainly a **deterministic script run, not image generation** (see below); confirm
that before quoting the owner any generation cost.

## What shipped this session (3 commits, `4c8b3fa..fd547c3`)

- `13bf291` **the overworld art bake** — the blocker the owner had rejected twice
- `cbe5ab3` fixes from an adversarial review of `13bf291` (a real P1 in the canopy composite)
- `fd547c3` Port Sapphire's bottom tab bar, restored over a full-bleed town overlay

### The bake, concretely

Inside the Act 1 plate `[16,218,163,399]`, `public/dq-tiles.js` no longer splats terrain at all:

- **Terrain** — the 30 baked chunks blitted **1:1** (48 px/cell == `TILE`, no rescaling), the same
  relationship `a1dBlit` has with the dungeon floors. A window wholly inside the plate skips the
  per-pixel splat entirely; a straddling window keeps it and lets the art overdraw its own half.
- **Canopy** — an alpha-only mask (0 or 242) whose RGB is zero and whose pixels are identical to
  `base`. Reconstructed with `destination-in` **per chunk on a scratch surface**, then lifted to
  depth 11, above the hero at 10, so an overhanging crown occludes the player.
- **Landmarks** — the nine shipped sprites, each drawn so its **measured ground anchor** lands on
  the centre of its cell. Nothing read `landmarks.json` before this; that was the whole gap.
- Procedural pines, peaks and flowers are suppressed inside the plate (the bake contains them).

## Locked decisions (owner, this session)

- **Dungeon art: re-bake ALL in-scope floors**, not just the fuzzy one.
- **Port Sapphire: FULL-BLEED at the top.** The town art runs under the status bar and
  `#qok-field-hud` stays hidden in town. This is now settled — do not re-ask.
- Everything locked in the 2026-08-03 handoff still stands (hi-fi is the FINAL overworld design,
  `cameraWorldWidth = 208`, no 4th Port Sapphire exit, no signposts, Darkfang = `mistyGrotto`,
  g3 is the only hero, `TARGET-COLOUR-THEME.png` is a failed generation — do not reference it).

## Verification (all re-run on the committed tree)

| gate | result |
|---|---|
| `scripts/ship-gate.sh` | **PASS** (dist + ios) |
| `scripts/test_act1_overworld_art.cjs` | **28 checks PASS** (new this session) |
| `test_dq_tiles_terrain.cjs` · `test_act1_runtime_override.mjs` | PASS |
| `runtime_baseline.py verify` / `verify-act1` · `test_act1_r26_runtime_pack.py` | PASS |
| `extract_act1_runtime_snapshot.mjs --check` · `shippedOverworldBaselineDqReplay.mjs --check` | PASS |
| bundle | byte-identical `4,987,581` / `60d90b63607b6e6980eb170aeeed445e` |
| world hash | `205dbe88` unchanged — every change is render-only |

Device-verified on sim `4872FCF0-6444-4A31-8D76-F92CEA09BF8D` (iPhone 17 Pro): the baked
grassland, layered old-growth with visible trunks and real cast shadow, mossy faceted rock, the
Greenhollow palisade and the Sunken Cellar cave mouth on their packed-earth pads, and Port
Sapphire full-bleed with its tab bar back.

## THE NEXT TASK, in detail

The owner: *"the dungeon needs updating to the latest versions"*, and on wall crispness: *"the top
and sides of the wall need to be crisp. seeing them close up the fuziness bothers me."*

**The 2026-08-03 handoff's hypothesis for that — a missing `imageSmoothingEnabled=false` — is
REFUTED, measured, do not re-try it.** `a1dBlit` already draws src-size == dst-size (1:1), so
smoothing is a no-op there; the dungeon canvas sets the same NEAREST filters as the crisp
overworld path; and B1F's procedural walls render crisp through the identical pipeline. The
softness is **in the source PNG**: median **3.0 px** 10–90% edge transition at wall→floor
boundaries in `sunkenCellar-f3-props.png`, with dark haze bleeding onto the floor.

### Nine in-scope floors (locked scope: coastalReef · sunkenCellar · whisperingWoodsCave)

| floor | tiles | render px | today |
|---|---|---|---|
| coastalReef-f1 | 48x31 | 2304x1488 | no art |
| coastalReef-f2 | 34x42 | 1632x2016 | no art |
| coastalReef-f3 | 46x46 | 2208x2208 | no art |
| sunkenCellar-f1 | 26x26 | 1248x1248 | no art |
| sunkenCellar-f2 | 32x28 | 1536x1344 | no art |
| sunkenCellar-f3 | 34x29 | 1632x1392 | **has art, and it is the fuzzy one** |
| whisperingWoodsCave-f1 | 33x33 | 1584x1584 | no art |
| whisperingWoodsCave-f2 | 35x36 | 1680x1728 | no art |
| whisperingWoodsCave-f3 | 40x38 | 1920x1824 | no art |

`mistyGrotto` and `crystalCave` stay procedural — do not re-litigate.

### Start HERE — it is probably not an image-generation job at all

A **deterministic dungeon renderer already exists**, the twin of the overworld's:
`scripts/render_dungeon_material_map.py`, with `run_dungeon_art_batch.py`, `tile_dungeon_art.py`
and `verify_dungeon_art.py` beside it, and per-floor inputs already on disk in
`design/act1-dungeon-interiors/` (`<floor>-artbase.png`, `<floor>-placement.png`, `<floor>.json`).
The overworld's material renderer measurably produces a **2x sharper** result than the shipped
dungeon props art, which is exactly the complaint. **Run the renderer before quoting any
generation cost.**

Two things to resolve while doing it:

1. **`-props` vs `-material` layers.** The shipped layer is `-props`, which has chests/stairs/save
   painted IN — that is why `dngSpecialObjects` skips its sprites for that layer, and why a looted
   chest keeps its baked closed art. The `-material` layer is the opt-in
   (`window.__A1_DNG_LAYER__='material'`) and draws assets live, which is strictly better. If the
   re-bake produces material layers, the runtime already supports them.
2. **`sunkenCellar-f3-material.png` is one tile row SHORT** — 1632x1344 against the floor's 34x29
   (1632x**1392**). `a1dBlit` clamps, so the bottom row would silently go missing. It is also the
   one artefact `scripts/freshness.py verify` reports **STALE** (its input `sunkenCellar-f3.json`
   changed). Fix the height and the staleness in the same pass.

## Then, in the owner's order

3. **HUD**, verbatim, not started:
   1. font — a little more sophisticated
   2. colour theme — a little more chic, matching the game
   3. keypad — joystick type ✅ DONE (`e748944`)
   4. bottom icon designs — have **Codex** redo them (menu-screen icons too, but **only after the
      general theme is locked**)
   5. minimap and compass — need to look more realistic
4. **Mountain-consolidation race** — CONFIRMED by code audit, unfixed. `consolidateMapData()`'s one
   call site is gated on `mapId + WxH`, which never changes for the overworld, so it never re-runs
   after a town exit: a rock cluster that blocked you before entering a town no longer blocks you
   after. The plate's self-arm does NOT cover it.

## Tracked tasks opened this session (`claude_brain/05-Tasks/active/`)

- `edu-rpg-dungeon-seeded-entry-renders-procedural-and-wrong-hero.md` — **resuming a save inside a
  dungeon** renders the procedural floor AND the old closed-helm knight instead of the baked art
  and the g3 heroine. Real players hit this. Proven NOT caused by this session's commits.
- `edu-rpg-stale-dq-tiles-hash-pins-in-two-capture-scripts.md` — dq-tiles.js is pinned in **six**
  places; two are stale and ungated (pre-existing drift).

## Gotchas

- **NEVER `npm run build` / `npm run dev` / `npx vite`.** The checked-in TypeScript is OLDER than
  the shipped game; rebuilding replaces the 320x400 `SAVE_VERSION=4` game with an old 120x160
  build. `src/` is NOT the source of truth.
- **`dq-tiles.js` identity lives in SIX places.** Four are gated and must move together:
  `runtime_baseline.py`, `extract_act1_runtime_snapshot.mjs`, its generated
  `src/map-engine/generated/act1RuntimeSnapshot.ts` (regenerate, don't hand-edit), and
  `src/map-engine/shippedOverworldBaselineDqReplay.mjs`. Two more are stale — see the task above.
- **`adapter.js` is gated as a public/dist byte-twin, not by hash** — `sync-ios.sh` is its whole
  registration. Different discipline from `dq-tiles.js`.
- **Adding a runtime file is a REGISTRATION act**: pin it in `runtime_baseline.py` or the gate
  rejects it as `extra`. `ACT1_OVERLAY_FILES` can ADD as well as override.
- **`destination-in` is a WHOLE-CANVAS operator.** It shipped wrong once here. Anything that masks
  more than one region must composite per region on a scratch surface.
- **A call-recording test stub cannot see compositing.** `scripts/test_act1_overworld_art.cjs` now
  MODELS canvas coverage. It takes a source path as `argv[2]`, so **prove every new check failable
  against a deliberately broken copy** before trusting it — two checks in its first revision were
  tautological and certified a real bug green.
- **`simctl install` mints a NEW data container**, destroying any seeded save. Seed AFTER install
  (`run-ios.sh` already orders it correctly).
- **The simulator shuts itself down mid-session** — `xcrun simctl boot <udid>` recovers it. Do NOT
  use sim `24A4D890`; a ChalkMap expo process steals its foreground.
- **"% near-black" is a useless dungeon check** — a fog-of-war dungeon is legitimately ~90% black.
- Keep `public/`, `dist/` and `ios/App/App/public/` in sync via `scripts/sync-ios.sh`.
- Do not touch `owner-terrain.json` or any `*-semantic*.png` — owner input, read-only.

## Kickoff prompt (paste verbatim)

```
edu-rpg, Act 1 — re-bake all nine in-scope dungeon floors.

Work in /Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data
(branch codex/map-engine-semantic-data, HEAD fd547c3, tree clean). You own all three
Act-1 workstreams; the other two sessions are archived and unreachable.

Pre-flight reads, in this order, and nothing else:
  1. docs/handoffs/2026-08-04-act1-overworld-baked-next-dungeon-art.md   (this handoff)
  2. scripts/render_dungeon_material_map.py                             (skim the header)

THE TASK. The owner chose the WIDE scope: re-bake all nine in-scope dungeon floors
(coastalReef f1-f3, sunkenCellar f1-f3, whisperingWoodsCave f1-f3). Eight have no
baked art at all and fall back to the procedural draw; sunkenCellar-f3 has art and
it is the one the owner called fuzzy: "the top and sides of the wall need to be
crisp. seeing them close up the fuziness bothers me."

START BY CHECKING WHETHER THIS IS A SCRIPT RUN, NOT IMAGE GENERATION.
scripts/render_dungeon_material_map.py is the deterministic twin of the overworld's
render_material_map.py, with run_dungeon_art_batch.py / tile_dungeon_art.py /
verify_dungeon_art.py beside it and per-floor inputs already in
design/act1-dungeon-interiors/. Do NOT quote the owner an image-generation cost until
you have established the renderer cannot do it.

The fuzziness diagnosis is already DONE and measured -- do not redo it, and do NOT
try imageSmoothingEnabled: the blit is 1:1, the NEAREST filters match the crisp
overworld path, and B1F's procedural walls are crisp through the same pipeline. The
softness is baked into sunkenCellar-f3-props.png (median 3.0 px 10-90% edge
transition at wall->floor boundaries).

Two known defects to fix in the same pass:
  - sunkenCellar-f3-material.png is ONE TILE ROW SHORT (1632x1344 vs the floor's
    34x29 = 1632x1392). a1dBlit clamps, so the bottom row silently vanishes.
  - it is the one artefact `python3 scripts/freshness.py verify` reports STALE.

Decide -props vs -material with the owner's crispness goal in mind: -props has
chests/stairs painted in (so a looted chest keeps its closed art), -material draws
assets live and the runtime already supports it via window.__A1_DNG_LAYER__.

HARD INVARIANTS:
- NEVER npm run build / npm run dev / npx vite. src/ is NOT the source of truth and
  rebuilding downgrades the shipped 320x400 SAVE_VERSION=4 game.
- dist/assets/index-BhoGQRaA.js stays byte-identical: 4,987,581 bytes / md5
  60d90b63607b6e6980eb170aeeed445e. Check before and after.
- Adding or changing a runtime file is a REGISTRATION act: pin size+sha in
  scripts/runtime_baseline.py or the gate rejects it as `extra`.
- If you touch public/dq-tiles.js, its identity is pinned in SIX places -- see the
  handoff's Gotchas.
- Keep public/, dist/ and ios/App/App/public/ in sync with ./scripts/sync-ios.sh.
- Do not touch owner-terrain.json or any *-semantic*.png -- owner input, read-only.
- TARGET-COLOUR-THEME.png is a FAILED image generation. Do not use it as a reference.

DONE MEANS: ./scripts/ship-gate.sh passes, the bundle md5 is unchanged, and a device
screenshot shows CRISP wall tops and sides in Sunken Cellar B3F. Verify with:
    ./scripts/run-ios.sh --udid 4872FCF0-6444-4A31-8D76-F92CEA09BF8D \
        --map sunkenCellar --floor 3 --gold 2000 --level 12 --hp 120
Note: seeding straight into a dungeon currently renders the PROCEDURAL floor and the
OLD knight hero -- a pre-existing bug, tracked at
claude_brain/05-Tasks/active/edu-rpg-dungeon-seeded-entry-renders-procedural-and-wrong-hero.md
You may need to fix that first to see your own art. Walking in from the overworld
door at (30,275) works.
Do NOT use sim 24A4D890 -- a ChalkMap expo process steals its foreground.

AFTER THAT, in the owner's order: the HUD (font more sophisticated; colour theme more
chic and matching the game; bottom icons redone by Codex, menu icons only after the
theme is locked; minimap and compass more realistic), then the mountain-consolidation
race documented in the handoff.
```
