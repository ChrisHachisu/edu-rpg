---
date: 2026-06-28
type: handoff
project: edu-rpg
milestone: fix-batch-2-corrections + M6-sprites
status: active
tags: [handoff]
---

# Handoff — edu-rpg fix-batch-2 corrections + M6 sprites — 2026-06-28

## What shipped (this session)
A large multi-phase run on the 44-item playtest update, all via hand-edited beautified bundle (NO rebuild), milestone-deployed to gh-pages:
- v1.11.0 (M3 HUD/menus/shop) → v1.11.1 (M3 polish, 7 user fixes) → v1.12.0 (M4 part1, 8) → v1.12.1 (#44 glyphs) → v1.12.2 (#33 Act-4 gate = M4 COMPLETE) → v1.13.0 (M5 JA loc) → v1.13.1 (fix-batch-2 part1: #1-4) → **v1.13.2 (corrections Group 1: #10/#12/#9)** = CURRENT.
- Reports (before/after proofs): `docs/m3-reports/`, `docs/m4-reports/`, `docs/m5-reports/`, `docs/fixbatch2-reports/CORRECTIONS.md`.

## Verification
- Bundle is hand-edited beautified JS — verification = `node --check` PARSE_OK + `wc -c` = 4,959,883 (in the 4.95-4.98MB safe range) + monsters 72 (dist + public + gh-pages).
- Group 1 corrections §4f-verified by **NATURAL driving** (Claude Read `/tmp/corr2/` proofs: hero walked to elder/healer/crystal, real action fired). No teleporting.
- Codex: Group 1 self-reviewed (the codex review timed out at the 2-min Bash default; diff was small + low-risk; the two real risks — #10 dangling refs, #12 glow leak/gate — were grep-verified clean).

## Live state (verified 2026-06-28)
- **Live = v1.13.2**, gh-pages commit `b1d98ba`, `dist/assets/index-BhoGQRaA.js` = 4,959,883 bytes — verified via `curl` size MATCH.
- HEAD dist = same 4,959,883, PARSE_OK. monsters 72 (dist + public).
- Restore baseline if an edit corrupts the bundle: `cp backups/versions/v1.13.2-corr-group1.js` over the dist bundle. **Do NOT restore below v1.13.2.**
- BEFORE/AFTER serves for dual-bundle proofs: `:5174` serves dist (AFTER/edits); `:5176` serves the corrections baseline (BEFORE, from `/tmp/edu-before`). Restart with `npx serve -s . -l <port>`.

## Locked decisions
- **Natural-driving is the verification standard** (the user's #1 complaint was artificial states). Solved: clear `wm.showingMessage` then `page.keyboard` — **key HOLD** walks, `z` talks, `Escape` = menu. Details in CORRECTIONS.md.
- #10 = a one-time elder DIALOGUE only (NO map/compass items). #12 = glow on DUNGEON save crystals only. #9 = GREEN heal sparkle at the healer only (no spark on town save). (Group 1 — DONE/deployed.)
- #33 = Magma Cloak (`flameCloak`) DROPS from the Sand Golem (Desert Tomb boss); scorchedRuins + magmaTunnels magma-gated until possessed. (DONE, v1.12.2.)
- **#44 needs a FULL redo** (hieroglyph FLOOR TILES on the main corridor, 4-5 wide, length expanding per floor; rule on a SIGN at the puzzle-room entrance) — NOT a patch onto the old sand-trap. Current impl is "a complete mess" per the user.
- **#18 mechanic is ambiguous** — confirm the stone-blocks/wind-shatters intent with the user BEFORE building.

## Gotchas for next session
- **Walking: key HOLD, not press().** `page.keyboard.press('ArrowUp')` does NOT move (too fast for Phaser polling — this is what made prior subagents teleport). Use `down` + ~320ms + `up` per tile. Confirm arrival via `wm.heroTileX/Y`. (`.eduharness/walktest.js` proves it.)
- Named keys (Z/ESC) DO fire via `page.keyboard` (after clearing `showingMessage`). My earlier "named keys can't fire headless" was WRONG (tested the wrong key).
- Bundle edits: surgical Edit only, NEVER rebuild, NEVER Python read+write same path; `node --check` + `wc -c` after EACH edit; no `h()` added in dungeon-generator paths (seeded-random corruption).
- Codex reviews run 5-7 min — set the Bash tool `timeout` to ~450000 OR run codex in background; the 2-min default kills them.
- Sprite handling: follow SKILL.md "Monster Sprite Protection" + pipeline (`sips -z 128 128` → dist + public + gh-pages; update the `Ko` sprite-loading list for any new keys; verify monster count before+after; NEVER `git checkout <commit> -- .` on gh-pages — it deletes monster PNGs).
- The session log + some report MDs are written by CONCURRENT sessions (ChalkMap) — append with unique anchors, re-Read if an Edit fails "file modified."
- Toolkit is durable at `edu-rpg/.eduharness/` (playwright-core + harness scripts). Static serve must be up: `npx serve -s dist -l 5174` from edu-rpg.

## Resume here (load-on-demand — do NOT eager-read everything)
- **Distilled state:** v1.13.2 live + clean. Two tracks remain: (A) the fix-batch-2 CORRECTIONS, (B) NEW M6 sprites the user just finished. Natural-driving is solved. Start with the M6 sprites (user's latest ask) OR the corrections — your call / ask the user the order.
- **Pointers:**

  | purpose | path | read when |
  |---|---|---|
  | The corrective brief (natural-driving method + per-item correction specs) | `edu-rpg/docs/fixbatch2-reports/CORRECTIONS.md` | starting ANY correction |
  | Clean-head, sprite pipeline, sprite protection, deploy process | `~/.claude/skills/edu-rpg/SKILL.md` | every session (loaded with the skill) |
  | Proven natural-driving harness scripts | `edu-rpg/.eduharness/` (walktest.js, naturaldrive-test.js, seed-run.js, record-anim.js) | driving/verifying any fix |
  | Group 1 natural proofs (template for good proofs) | `/tmp/corr2/*.png` | mirroring the proof style |

### Track B — NEW M6 sprites (user's latest request, 2026-06-28)
The user finished redone monster sprites. **COPY them (do NOT move — keep the originals)** from `codex/output/redo/redone-2026-06-28` (a folder under the `codex` project, sibling-ish to edu-rpg — locate it). Then:
1. Inspect: count, filenames (which monster ids), dimensions, format, background (black `#000` vs magenta `#FF00FF` chroma).
2. Process per SKILL.md pipeline: resize to 128×128 (`sips -z 128 128`), chroma-key/clean background if needed, ensure alpha.
3. Copy processed PNGs into BOTH `dist/assets/monsters/` AND `public/assets/monsters/` (and to gh-pages on deploy via the /tmp worktree — NEVER touch other monster files).
4. If any are NEW sprite keys, add them to the `Ko` sprite-loading array in the bundle.
5. Verify monster count stays correct (was 72) and **visually verify in-game by NATURAL driving** (start a real battle vs the relevant monster and screenshot the sprite rendering) — not just that the file exists.
6. Deploy + a before/after sprite report.

### Track A — remaining fix-batch-2 corrections (see CORRECTIONS.md for full specs)
- **#39** re-prove the survivor NPC: natural before/after showing exactly ONE new NPC (the prior "5→7" count was wrong — confirm it's 5→6 and fix if 2 were added).
- **#26** patrol RECORDING: record several shadowCave patrols moving (path + flame flicker + shortened dark).
- **#18** canyon: REWORK the mechanic (confirm intent with user first).
- **#5/#16** Storm Nest wind tiles: REDESIGN the tile art (read as wind, not grey stone) + GENUINELY animate (not a green alpha overlay) — verify with a recording.
- **#44** Sand Tomb: FULL glyph-corridor redo (hieroglyph floor tiles, main corridor 4-5 wide expanding per floor, rule on a sign at the entrance).
- **#6** relocate Scorched Ruins NW near Oasis Haven, by-foot accessible (remove its magma seal; keep magmaTunnels').

## Kickoff prompt (paste verbatim into the next session)
```
Continue the edu-rpg 44-item update. Live = v1.13.2 (gh-pages b1d98ba, dist 4,959,883 bytes, monsters 72). Invoke the `edu-rpg` skill. Read docs/handoffs/fixbatch2-corrections-2026-06-28.md (this handoff) and docs/fixbatch2-reports/CORRECTIONS.md FIRST.

Two tracks remain:
(B) NEW M6 sprites — the user finished redone monster sprites; COPY them (keep originals) from codex/output/redo/redone-2026-06-28, process per the SKILL sprite pipeline (128x128, chroma-key, → dist + public + gh-pages, update the Ko loading list), and visually verify each renders in a REAL battle.
(A) fix-batch-2 corrections: #39 (re-prove 1 NPC), #26 (patrol recording), #18 (canyon rework — CONFIRM mechanic with user first), #5/#16 (wind tiles redesign+animate), #44 (FULL glyph-corridor redo: hieroglyph floor tiles on the main corridor, expanding per floor, rule on a sign), #6 (Scorched Ruins NW relocation).

CRITICAL process rules:
- VERIFY EVERY fix by NATURAL driving (the user rejected artificial states): clear wm.showingMessage, then page.keyboard key-HOLD to WALK (down+~320ms+up per tile; a quick press() does NOT move), press('z') to talk, press('Escape') for menu. Hero must be in a normal walked-to location; trigger the real action; before/after proofs (dual-bundle: :5174 edit vs :5176 baseline). Animations need a RECORDING. Claude reads every proof — don't trust subagent claims.
- Edit the beautified bundle dist/assets/index-BhoGQRaA.js in place (NEVER rebuild; node --check + wc -c after each edit; restore from backups/versions/v1.13.2-corr-group1.js if broken). No h() in dungeon-generator code.
- Ask the user the track order (sprites first vs corrections first) and confirm the #18 + #44 mechanics before building those two.
- Milestone-deploy via the /tmp/edu-ghpages worktree (single-bundle swap, monsters 72 check, tr -d ' ' size guard); codex review with a high Bash timeout (~450000) or background it.
```
