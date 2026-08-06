---
date: 2026-08-06
type: handoff
project: edu-rpg
milestone: parallel-tracks
status: active
supersedes: "[[2026-08-06-act1-dungeons-complete-hud-open]]"
tags: [handoff, edu-rpg, act1, process, parallel, hud, art]
---

# Handoff — trunk restored, two tracks running — 2026-08-06

`main` is live at **`e1b9cfd`** and is the trunk again. Working branch
`codex/map-engine-semantic-data` is **identical to it (0/0 divergence)**, tree clean, every gate
green.

## Do not repeat this session's mistake: check the tracks first

Two tracks were kicked off from `main` as background sessions and may be mid-flight:

| track | branch | worktree | owns |
|---|---|---|---|
| **HUD/UI** | `hud/theme-and-chrome` | `../edu-rpg-hud` | `ui-overhaul.js/.css`, `dist/index.html`, `design/ui-overhaul/` |
| **World art** | `art/materials-and-crystalcave` | `../edu-rpg-art` | `scripts/render_*`, `scripts/make_*materials*`, `design/act1-dungeon-interiors/`, `public/act1-dungeon-art/` |

A third, docs-only, is reconciling `docs/AGENT-WORKFLOW.md`.

**Before doing anything, run `git worktree list` and `git branch`.** If you are about to touch a
file another track owns, stop — see `docs/PARALLEL-SESSIONS.md`.

## What shipped this session

**Act 1 dungeon art is complete and owner-accepted.** Every dungeon baked except crystalCave.

| commit | what |
|---|---|
| `fcf9bc0` | hero NORTH row replaced with generated pixels — closed 8 reverted attempts |
| `40b6366` | wall face 0.70 → **0.95** (derived, not judged), Darkfang Grotto baked |
| `77dba4b` | coastalReef + whisperingWoodsCave baked |
| `cfe8239` | coastalReef expanded 1276 → **2099** walkable cells |
| `0807492` | small wall masses **27 → 0** |
| `87db473` | all-shadow wall patches **91 → 4** |
| `cc79004`, `db8fe86` | rescued never-committed docs and HUD mockups from the retired checkout |
| `2646965` | **runtime pins are now GENERATED** |
| `e1b9cfd` | HUD boundary decided |

## The three gates that now protect this

Run them; do not reason about the things they check.

```
python3 scripts/check_hero_fits_wall_face.py     # she fits inside the wall shade
python3 scripts/check_dungeon_playable.py        # every floor traversable at her real clearance
python3 scripts/regenerate_pins.py --check       # pins match disk (also inside ship-gate)
```

`check_dungeon_playable.py` exists because a "fix" shipped 17 disconnected regions with the Sunken
Cellar **boss unreachable** — it had tested whether a zero-radius POINT could get through, not a
body with `A1M_FOOT + A1M_LEAN` = 16 px of clearance.

## Locked — do not re-litigate

- **Wall face 0.95**, derived: crown 55 px (the **NORTH** row, tallest of the eight — not the 52 px
  still quoted in `dq-tiles.js`) − 16 px stand-off = 39 px reach, + 3.4 px band blur = 43 px minimum.
- **Wall mass** ≥6 cells area AND ≥2 cells vertical run, enforced in two passes (lattice, then the
  warped field — the warp makes islands the lattice cannot see).
- **Darkfang is a 3-floor dungeon.** B4F/B5F are orphaned, not procedural.
- **Act 1 area curve:** 599 / 1102 / 1210 / 2126 / 3830.
- **HUD boundary:** presentation in `ui-overhaul.*` + `index.html`; data and stick-consumption in
  `dq-tiles.js`. Two seams: `renderMinimap()`/`updateCompass()`, and `window.__DQ_STICK__`.

## Still open

1. **Engine track, not yet started** — the overworld square-blocker mismatch the dungeons shed, and
   the mountain-consolidation race (`consolidateMapData()` never re-runs after a town exit).
2. **crystalCave** — six authored floors, deliberately unbaked. Gameplay call, owner's.
3. **Authored bossIds are wrong** — layouts carry `treant` / `tidalSerpent` where the bundle
   declares `mosswarden` / `coralTitan`. Stripped from the runtime payload; the layouts still lie.
4. **`main` is 62 commits ahead of `origin/main`** and has never been pushed. Owner's call.
5. **Five other `claude-code` sessions** were alive at cleanup time and deliberately left running.

## Invariants

- **NEVER** `npm run build` / `npm run dev` / `npx vite`. `dist/assets/index-BhoGQRaA.js` stays
  **4,987,581 / `60d90b63607b6e6980eb170aeeed445e`**.
- **Re-pin only via `scripts/regenerate_pins.py`.** Never hand-edit a hash.
- `public/dq-tiles.js` is pinned in four places; `act1RuntimeSnapshot.ts` is REGENERATED.
- Sim `4872FCF0-6444-4A31-8D76-F92CEA09BF8D`, **never `24A4D890`**. `--skip-build` reinstalls a
  stale app.
- **At most two concurrent renders.** Four plus a booted sim took this machine to load 17.8 and
  killed the session. Stale background processes were the real thief — two runaway `du`, two expo
  servers idle 3 days, an abandoned poller; clearing them took load 17.8 → 3.6.
- **Never `git add -A` while another session is live.** Stage explicit paths and re-read
  `git diff --cached --name-only`.

## Archive

`/Users/christopherhachisu/Documents/claudecode/edu-rpg-archive-2026-08-06/` (952 MB) holds raw art
that was never committed anywhere: generated-characters, item-icons, dungeon/overworld-assets,
monster-sprites, backups, milestone reports. **`unmerged-edits/` holds three files that diverged
between branches** — `AGENT-WORKFLOW.md`, `DUNGEON-ASSET-PROMPTS.md`, `GAME-FEEL.md` — each with
its base, so the intended diff is reconstructable. They were deliberately not auto-merged.

## Kickoff prompt (paste verbatim)

```
edu-rpg — continue.

Work in /Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data
(main and codex/map-engine-semantic-data are both at e1b9cfd, tree clean).

FIRST: run `git worktree list` and `git branch`. Two tracks were kicked off from main
(hud/theme-and-chrome, art/materials-and-crystalcave) and may be mid-flight or may have
merged. Do not touch a file another track owns -- docs/PARALLEL-SESSIONS.md has the table.

Pre-flight reads, in this order, and nothing else:
  1. docs/handoffs/2026-08-06-trunk-restored-tracks-running.md   (this handoff)
  2. docs/PARALLEL-SESSIONS.md

Act 1 dungeon art is DONE and owner-accepted. Do not reopen it; three gates protect it
(check_hero_fits_wall_face.py, check_dungeon_playable.py, regenerate_pins.py --check).

Ask the owner which he wants next: the Engine track (overworld square-blocker mismatch,
mountain-consolidation race), pushing main to origin (62 commits unpushed), or Act 2.

INVARIANTS: never npm run build / npm run dev / npx vite; dist/assets/index-BhoGQRaA.js
stays 4,987,581 / 60d90b63607b6e6980eb170aeeed445e; re-pin ONLY via
scripts/regenerate_pins.py; at most two concurrent renders; sim
4872FCF0-6444-4A31-8D76-F92CEA09BF8D, never 24A4D890, and --skip-build reinstalls a
stale app. Finish with ./scripts/sync-ios.sh then ./scripts/ship-gate.sh . passing.
```
