---
date: 2026-08-06
type: handoff
project: edu-rpg
milestone: act1-dungeon-art-complete
status: active
supersedes: "[[2026-08-06-act1-dungeon-playable-hero-north-open]]"
tags: [handoff, edu-rpg, act1, dungeons, hero, hud, ios]
---

# Handoff — Act 1 dungeon art is complete; the HUD is next — 2026-08-06

HEAD `1845235` on `codex/map-engine-semantic-data`, tree clean, ship gate PASS, bundle
byte-identical throughout, `freshness.py` **FRESH=54 STALE=0**.

## What shipped

| commit | what |
|---|---|
| `fcf9bc0` | hero NORTH row replaced with generated pixels — **closes 8 reverted attempts** |
| `40b6366` | wall face 0.70 → **0.95**, 2-cell minimum wall mass, **Darkfang Grotto baked** |
| `77dba4b` | coastalReef + whisperingWoodsCave baked |
| `cfe8239` | coastalReef expanded 1276 → **2099** walkable cells |
| `1845235` | two dead design artefacts removed |

**Every Act 1 dungeon now ships baked art except crystalCave**, which stays deliberately
untouched. Owner verdicts: *"north facing animation is not bad. I'll take"*, *"the shadow space is
probably good like this"*.

## Locked decisions — do not re-litigate

- **Wall face 0.95, and it is DERIVED, not judged.** crown 55 px (the **NORTH** row, the tallest of
  the eight — not the 52 px still quoted in `dq-tiles.js`) − 16 px stand-off (`A1M_FOOT` 12 +
  `A1M_LEAN` 4) = 39 px reach, + 3.4 px band blur = 43 px minimum. 0.95 gives 45.
  **`scripts/check_hero_fits_wall_face.py` gates it** — it reads the sheet and `dq-tiles.js`, so
  redrawing the hero or retuning clearance fails the build. Run it after ANY hero or clearance change.
- **Minimum wall mass = 2 cells of VERTICAL run** (`prune_thin_walls`, inside `floor_field` so art
  and collision cannot disagree). Vertical run, not area: the band eats northward from a mass's
  south edge.
- **Darkfang Grotto is a 3-floor dungeon.** The bundle declares `floors: 5` but only 3 were ever
  authored and f3 carries the boss + save. B4F/B5F are **orphaned, not procedural** — there is no
  down-stairs from B3F. Owner accepted this on measured area grounds.
- **Act 1 area curve, owner-approved:** 593 / 1083 / 1205 / 2099 / 3830. Worst step 1.8×.
- **`A1D_MAPS` now includes mistyGrotto.** crystalCave stays out.

## Open, in the owner's order

1. **HUD — the next milestone.** Font, chic colour theme, Codex-drawn bottom icons (menu icons only
   after the theme locks), realistic minimap/compass. Keypad is done.
2. **Port Sapphire UI defects, found on device this session and NOT yet fixed:**
   - the movement stick is anchored **bottom-left and clipped by the nav bar**; the dungeon and
     overworld put it bottom-right, unclipped
   - the town shows **no HP bar, no minimap, no compass**
   Both confirmed stable across frames. **Owner was asked whether to fold these into the HUD work
   or treat them separately and has not answered — ask before starting.**
3. **The overworld still has the square-blocker mismatch** the dungeons shed.
4. **Mountain-consolidation race** — `consolidateMapData()` never re-runs after a town exit.
5. **coastalReef materials**: `rubble` and `accent` quilted with a residual wrap seam (23.09 against
   a 19.78 tolerance; 18.43 against 18.21). Not visible at floor scale, unchecked at 1:1. Fixing it
   needs a `REGEN` entry for the theme in `make_dungeon_materials.py`.
6. **Authored bossIds are WRONG** — layouts carry `treant` / `tidalSerpent` where the bundle
   declares `mosswarden` / `coralTitan`. Stripped from the runtime payload; the layouts still lie.

## Gotchas that cost time

- **A `spawn_task` chip runs in the SAME worktree, not an isolated one.** Its staged deletions were
  pulled into this session's index by a path-scoped `git add`. Never `git add -A` while another
  session is live; stage explicit paths and re-read `git diff --cached --name-only` before commit.
- **A derived runtime file with no generator is already stale.** `act1-dungeon-floors.json` named
  `build_dungeon_semantic.py` as its source but was hand-assembled, so it silently kept the old
  coastalReef layout. Now cut by `scripts/export_act1_dungeon_floors.py --check`.
- **Editing a generator mid-render corrupts provenance** — `prov.stamp` reads the script at write
  time, so an edit lands the NEW hash on art rendered by the OLD code. Wait for renders to finish.
- **`seed_ios_save.py` on a floor with no generated data** falls back to an overworld coordinate and
  produces a black screen. That is the seeder, not the game.
- **NEVER** `npm run build` / `npm run dev` / `npx vite`. `dist/assets/index-BhoGQRaA.js` must stay
  **4,987,581 / `60d90b63607b6e6980eb170aeeed445e`**.
- `public/dq-tiles.js` is pinned in **four** places; `act1RuntimeSnapshot.ts` is REGENERATED via
  `node scripts/extract_act1_runtime_snapshot.mjs`, never hand-edited.
- `run-ios.sh --skip-build` reinstalls a STALE app. Sim `4872FCF0-6444-4A31-8D76-F92CEA09BF8D`,
  **never `24A4D890`**. Shut down idle sims before a native build — one was costing ~30% CPU.

## Kickoff prompt (paste verbatim)

```
edu-rpg, Act 1 — the HUD.

Work in /Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data
(branch codex/map-engine-semantic-data, HEAD 1845235, tree clean).

Pre-flight reads, in this order, and nothing else:
  1. docs/handoffs/2026-08-06-act1-dungeons-complete-hud-open.md   (this handoff)
  2. docs/DUNGEON-EDGE-STYLE-LOCK.md

Act 1 dungeon art is DONE and owner-accepted -- every dungeon baked except crystalCave,
wall face locked at 0.95, hero north row replaced with generated pixels. Do not reopen
any of it; scripts/check_hero_fits_wall_face.py gates the wall/hero geometry.

THE TASK is the HUD, in the owner's order: font, a chic colour theme, Codex-drawn bottom
icons (menu icons ONLY after the theme locks), and a realistic minimap/compass. The
keypad is already done.

FIRST, ask the owner one question: two Port Sapphire defects were found on device and
not fixed -- the movement stick is anchored bottom-left and CLIPPED by the nav bar (the
dungeon and overworld put it bottom-right, unclipped), and the town shows no HP bar,
minimap or compass. He was asked whether to fold these into the HUD work or treat them
separately and has not answered. Ask before starting.

INVARIANTS: never npm run build / npm run dev / npx vite; dist/assets/index-BhoGQRaA.js
stays 4,987,581 / 60d90b63607b6e6980eb170aeeed445e; dq-tiles.js is pinned in FOUR places
and act1RuntimeSnapshot.ts is REGENERATED, never hand-edited; any new runtime file is a
REGISTRATION act. Finish with ./scripts/sync-ios.sh then ./scripts/ship-gate.sh . passing.
Device: sim 4872FCF0-6444-4A31-8D76-F92CEA09BF8D, NEVER 24A4D890, and --skip-build
reinstalls a STALE app so always full-rebuild to verify a public/ change.
```
