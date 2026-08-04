---
date: 2026-08-03
type: handoff
project: edu-rpg
milestone: act1-design-lock
status: active
supersedes: "[[2026-08-03-act1-dungeon-mapdata-override-shipped]]"
tags: [handoff, edu-rpg, act1, overworld, towns, dungeons, hero, hud, ios]
---

# Handoff — Act 1 design lock + playability — 2026-08-03

**One session now owns all three Act-1 workstreams.** The towns/dungeons/overworld sessions were
consolidated into this one by the owner and the other two were archived. There is no peer session
to message; `SendMessage` to them fails.

## THE NEXT TASK, in one line

**Bake the agreed hi-fi overworld art into the game.** The owner has seen the current overworld and
rejected it twice: *"artwork is completely wrong. i can tell that from the color hue that it is not
the artwork we agreed on and the special asset (first town) is not the asset we agreed on either.
this needs to be baked in the game now."*

## What shipped (14 commits, `c4f97d5..e748944`)

- `e748944` controls: 4-way d-pad → the town's analog stick (diagonals now possible)
- `dcd4cc8` hero: canonical g3 heroine is the ONLY hero
- `41293fb` fix: Darkfang Grotto no longer black-screens on entry (Act 1 was uncompletable)
- `77c27c4` ship the 9 landmark sprites the hi-fi overworld never drew
- `8f5d769` towns: mast + hanging demijohn no longer block the quay
- `744de1c` move the Darkfang door to the owner's painted position
- `e5e768f` rescue 9 load-bearing inputs an earlier gitignore swept up
- `902369a` tooling: green the Act 1 gate + one-command iOS test loop
- `d4aedc1`, `b862919`, `851ace0`, `d4f7925`, `1c6d1cb`, `8ea7629` — consolidation of the three
  workstreams' 21 GB backlog into commits

## Verification (run this session)

| gate | result |
|---|---|
| `scripts/ship-gate.sh` | **SHIP GATE PASS** (dist + ios) |
| `runtime_baseline.py verify` | PASS |
| `runtime_baseline.py verify-act1` | PASS (dist and `ios/App/App/public`) |
| `smoke_static_runtime.py` | PASS |
| `test_dq_tiles_terrain.cjs` | ALL CHECKS PASSED |
| `shippedOverworldBaselineDqReplay.mjs --check` | PASS (world hash `205dbe88` stable) |
| `extract_act1_runtime_snapshot.mjs --check` | PASS |
| `test_act1_runtime_override.mjs` | PASS (8 doors firing, 9376 walkable cells) |
| `test_act1_r26_runtime_pack.py` | PASS |
| bundle | byte-identical `4,987,581` / md5 `60d90b63607b6e6980eb170aeeed445e` |

**Known-red, low priority:** `npm run test:map-engine` fails at step 1 because `tsc` is not on PATH
(needs `npx tsc` or `node_modules/.bin/tsc`). Every *other* step of that script passes.

## Live state (verified 2026-08-03)

- **HEAD** `e748944` on `codex/map-engine-semantic-data`, working tree CLEAN — `git status`
- **Nothing pushed.** No remote push this session — `git log origin/..`
- **gh-pages last deployed 2026-07-10** and its `index.html` does **not** load `act1-hifi/adapter.js`
  — the web build has NONE of the Act 1 work. `git log -1 origin/gh-pages`
- **iOS**: built + installed on sim `4872FCF0-6444-4A31-8D76-F92CEA09BF8D` (iPhone 17 Pro).
  Sim `24A4D890` is shared with a ChalkMap `expo start` and will steal the foreground — avoid it.

## Locked decisions (owner, this session)

- **Hi-fi is the FINAL Act 1 overworld design** — *"no questions."* Source of truth is
  `act1-material-map.png` → the 30 baked r26 chunks. `act1-map-graded.png` has visible seams and is
  NOT it. `TARGET-COLOUR-THEME.png` is a **failed generation — do not reference it.**
- **Landmarks composite at RUNTIME as sprites** (CODEX-ART-BRIEF-V7). A landmark-free terrain bake is
  correct by design; bases carry only a packed-earth pad.
- `designLocks.cameraWorldWidth = 208` — kept.
- **No 4th exit** at Port Sapphire's east quay. **Signposts stay out** (the compass covers wayfinding
  for younger players).
- **Darkfang = mistyGrotto.** `map.mistyGrotto` DISPLAYS as "Darkfang Grotto" and is the Act 1 boss
  dungeon (Giant Toad → `boss.giantToad.defeated` → unseals Crystal Cave). Its door now sits at the
  owner's painted `(96,359)`.
- Jetties, stone slipway and fenced gardens stay **excluded**; only the mast and the demijohn were
  exempted as overhead. The 51 sub-foot-radius sliver obstacles are **deliberately kept**.
- **g3 is the only hero.** `openface`/`feminine` removed from `VARIANTS`, not demoted.
- Dungeon scope: `coastalReef`, `sunkenCellar`, `whisperingWoodsCave` IN; `mistyGrotto` and
  `crystalCave` stay procedural. Do not re-litigate without the owner.

## Owner's HUD direction (received at session end — NOT started)

1. **Font** — more sophisticated.
2. **Colour theme** — more chic, matching the game.
3. **Keypad** — joystick type. ✅ DONE (`e748944`).
4. **Bottom icon designs** — have **Codex** redo them. Menu-screen icons too, but **only after the
   general theme is locked**.
5. **Minimap and compass** — need to look more realistic.

## Open work, in the owner's priority order

1. **Overworld art bake** (above) — the blocker.
2. **Sunken Cellar wall crispness** — *"the top and sides of the wall need to be crisp. seeing them
   close up the fuziness bothers me."* Almost certainly `imageSmoothingEnabled` missing on the
   dungeon blit; `town.html` already sets `ctx.imageSmoothingEnabled = false`. Unconfirmed.
3. **Port Sapphire bottom tab** — the town overlay covers the nav bar; bring it back over.
   Top edge is **undecided** — owner may want full-bleed to the top; ask before doing it.
4. **HUD** — the five points above.
5. **Dungeon art** — only `sunkenCellar-f3` has a baked render. 8 of 9 in-scope floors fall back to
   the procedural draw, and Darkfang has no interior art at all (out of generated scope).
   Owner: *"the dungeon needs updating to the latest versions (dark fang is probably not created
   yet, sunken cellar is)."*
6. **Mountain-consolidation race** — CONFIRMED by code audit, unfixed. `consolidateMapData()` has one
   call site gated on `mapId + WxH`, which never changes for the overworld, so it never re-runs after
   a town exit. Symptom: a rock cluster that blocked you before entering a town no longer blocks you
   after. Same class as the fixed door bug; the plate's self-arm does NOT cover it.

## Gotchas

- **NEVER `npm run build` / `npm run dev` / `npx vite`.** The checked-in TypeScript is OLDER than the
  shipped game; rebuilding replaces the 320x400 SAVE_VERSION=4 game with an old 120x160 build.
  `npm run build` is wired to a script that refuses. `src/` is NOT the source of truth.
- **The chunks are 48 px/cell — exactly `TILE`.** A 1:1 blit into the tile runtime is possible, the
  same way `drawDungeon` already blits floor art. The hi-fi iframe runtime, the 7 stale corridors and
  `runtime.html` are **NOT** prerequisites for baking the art in. (Earlier handoffs implied they were.)
- **`simctl install` mints a NEW data container**, destroying any seeded save. Always seed AFTER
  installing — `scripts/run-ios.sh` already orders it correctly.
- **The simulator shuts itself down** mid-session. `xcrun simctl boot <udid>` recovers it.
- **"% near-black" is a useless dungeon check** — a fog-of-war dungeon is legitimately ~90% black, so
  the metric cannot tell "broken" from "unexplored". It made a working fix look failed. Use the
  map-name badge + a visible hero instead.
- **`ACT1_OVERLAY_FILES` can now ADD files, not just override.** It is unioned into
  `expected_paths` and additions get their own identity + twin check.
- **Adding a runtime file is a REGISTRATION act**, not a copy: pin it in `runtime_baseline.py` or the
  gate rejects it as `extra`.
- `adapter.js` wraps `loadMap` on the **instance** and permanently shadows `dq-tiles.js`'s
  **prototype** wrap. dq-tiles' real mechanism is its 80 ms poll. Expect a brief visible flash on
  dungeon entry while the floor art fetch resolves.
- Keep `public/`, `dist/` and `ios/App/App/public/` in sync via `scripts/sync-ios.sh` — it uses
  `--delete` WITH excludes for `cordova.js`/`cordova_plugins.js`. Both halves matter.

## Resume here (load-on-demand — do NOT eager-read)

**Distilled state:** All three Act-1 layers are in the game and function. Port Sapphire and Sunken
Cellar B3F look finished; the overworld does not — it still renders `dq-tiles.js`'s live material
splat and its old prop houses, not the agreed baked art. All gates green, tree clean, nothing pushed.

| purpose | path | read when |
|---|---|---|
| terrain draw path to replace | `public/dq-tiles.js:653` `drawTerrain` | baking the overworld art |
| landmark prop draw to replace | `public/dq-tiles.js:1017` `owSpecialObjects` | baking the overworld art |
| dungeon blit, the pattern to copy | `public/dq-tiles.js` `a1dArtFor` / `drawDungeon` | baking the overworld art |
| shipped chunks (30 base/canopy/water) | `public/act1-hifi/chunks/`, `public/act1-hifi/manifest.json` | baking the overworld art |
| landmark sprites + measured anchors | `public/act1-hifi/landmarks/landmarks.json` | baking the overworld art |
| art rules, materials, style block | `.../owner-terrain/art-tiles/CODEX-ART-BRIEF-V7.md` | any art generation |
| gate + all hash pins | `scripts/runtime_baseline.py` | adding/changing any runtime file |
| one-command device loop | `scripts/run-ios.sh`, `scripts/seed_ios_save.py` | any in-app verification |
| canonical asset scales | `docs/CANONICAL-ASSETS.md` | any hero/scale question |

## Kickoff prompt (paste verbatim)

```
edu-rpg, Act 1 — bake the agreed hi-fi overworld art into the game.

Work in /Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data
(branch codex/map-engine-semantic-data, HEAD e748944, tree clean). You own all three
Act-1 workstreams; the other two sessions are archived and unreachable.

Pre-flight reads, in this order, and nothing else:
  1. docs/handoffs/2026-08-03-act1-design-lock-and-playability.md   (this handoff)
  2. design/continent-terrain-class-method/owner-terrain/art-tiles/CODEX-ART-BRIEF-V7.md

THE TASK. The owner has rejected the current overworld twice: "artwork is completely
wrong. i can tell that from the color hue that it is not the artwork we agreed on and
the special asset (first town) is not the asset we agreed on either. this needs to be
baked in the game now."

Two halves, both in public/dq-tiles.js:
  a) TERRAIN — drawTerrain() (line ~653) is a per-pixel software splat of the live
     materials. Replace it, inside the Act 1 plate BOUNDS [16,218,163,399], with a 1:1
     blit of the 30 baked chunks in public/act1-hifi/chunks/ (base + canopy + water,
     mapped via public/act1-hifi/manifest.json). The chunks are 48 px/cell and TILE is
     48, so there is NO rescaling -- copy the pattern drawDungeon already uses for
     dungeon floor art. Outside BOUNDS, keep the existing draw.
  b) LANDMARKS — owSpecialObjects() (line ~1017) draws the OLD flat prop houses from its
     own OW_PROP table. Draw the shipped sprites instead: public/act1-hifi/landmarks/
     holds 9 PNGs plus landmarks.json, which carries each sprite's cell, render size and
     MEASURED ground anchor. Draw so the anchor pixel lands on the centre of the cell --
     never the sprite's own centre or its bottom edge, or the art floats off its pad.

Nothing in the game currently reads landmarks.json (verified by grep) -- that is the gap.

HARD INVARIANTS:
- NEVER npm run build / npm run dev / npx vite. The checked-in TypeScript is OLDER than
  the shipped game and rebuilding downgrades it. src/ is not the source of truth.
- dist/assets/index-BhoGQRaA.js stays byte-identical: 4,987,581 / md5
  60d90b63607b6e6980eb170aeeed445e. Check before and after.
- Adding or changing a runtime file is a REGISTRATION act: pin size+sha in
  scripts/runtime_baseline.py or the gate rejects it. ACT1_OVERLAY_FILES can now carry
  additions as well as overrides.
- Keep public/, dist/ and ios/App/App/public/ in sync with ./scripts/sync-ios.sh.
- Do not touch owner-terrain.json or any *-semantic*.png -- owner input, read-only.

DONE MEANS: ./scripts/ship-gate.sh passes, the bundle md5 is unchanged, and a device
screenshot shows the agreed terrain hue AND the real Greenhollow landmark sprite in
place of the old flat house. Verify with:
    ./scripts/run-ios.sh --udid 4872FCF0-6444-4A31-8D76-F92CEA09BF8D --map overworld \
        --x 69 --y 257 --gold 2000 --level 12 --hp 120
Do NOT use sim 24A4D890 -- a ChalkMap expo process steals its foreground.

AFTER THAT, in the owner's order: Sunken Cellar wall crispness (likely a missing
imageSmoothingEnabled=false on the dungeon blit -- confirm, don't assume); Port Sapphire's
bottom tab bar (the overlay covers it; the TOP edge is undecided, ask first); then the HUD.

HUD direction from the owner, verbatim, not yet started:
  1) font: a little more sophisticated
  2) color theme a little more chique, matching to the game
  3) keypad: joystick type  [DONE in e748944]
  4) bottom icon designs: have Codex redo them (menu screen icons too, but after we lock
     in the general theme)
  5) the minimap and compass need to look more realistic
```
