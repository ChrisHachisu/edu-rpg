# Act 1 — the acceptance bar (what "market release quality" means, line by line)

Written 2026-09-02 at the owner's request ("set the goals of the output based on all of my feedback
for this game … eliminate as much gray area as possible"). Two inputs, both in this folder:
`PRODUCT-GOALS-FROM-OWNER-FEEDBACK.md` (every verbatim owner quote, ~60 of them, with status) and
`RESEARCH-JRPG-EDU-FEEL-CRITERIA.md` (sourced numeric criteria for a JRPG/edu game aimed at Japanese
grade-schoolers). This file is the merge: one measurable line per goal, the owner's own words where
they exist, and the state on build 70 / this session. Lines marked **OWNER-Q** are gray areas only
he can close; they are listed again at the end as questions.

Legend: PASS = measured green this session · OPEN = not yet green · Q = needs the owner.

## 1. Motion and camera (the "laggy and jittery" item)

| # | Line | Source | State |
|---|---|---|---|
| 1.1 | One camera driver on every map; the rendered scroll never steps more than ±1 world px away from the hero's own per-frame step during a straight walk | owner build 70 "extremely laggy and jittery"; research §1 "pick one camera policy, do not mix" | **PASS on the fix** (`a76ca39`): build 70 stepped 7/4/2 px against a 4.33 px hero; fix steps 4/5 only. Device A/B pending a quiet machine |
| 1.2 | Median frame rate ≥ 55 fps over a 10 s walk (SMOOTH-2) | smooth skill | OPEN — re-measure; last device verdict 60 fps (round 5) |
| 1.3 | Worst walk frame ≤ 100 ms and zero frames over 100 ms (SMOOTH-3); research flags > 30 ms | smooth skill; research §1 | OPEN — round 5 left "rarer, not removed" chunk-arrival hitches at (69,257) |
| 1.4 | Longest main-thread block after playable ≤ 100 ms (SMOOTH-4) | smooth skill | OPEN — re-measure |
| 1.5 | Continue → controllable on real terrain ≤ 1500 ms (SMOOTH-1) | smooth skill; owner "It takes forever to start" | OPEN — re-measure |
| 1.6 | Map swap tap → playable ≤ 500 ms both directions (SMOOTH-5) | smooth skill; owner "Doors are slow" | OPEN — re-measure |
| 1.7 | Tap → visible response ≤ 100 ms (SMOOTH-6) | smooth skill; research §1 ≤ 100 ms outer bound | OPEN — re-measure |
| 1.8 | Walk speed stays 260 px/s (5.4 cells/s) on overworld AND dungeons | owner LOCKED "i prefer expanding the dungeons" over changing speed | **LOCKED by the owner 2026-09-02**: "Keep it. The overworld is quite sparse so we need a certain level of speed." |
| 1.9 | Walk pose cadence 125 ms per pose, four-pose cycle, everywhere | owner-locked design token `walkPoseMs` | PASS (unchanged) |

## 2. Image quality and art consistency

| # | Line | Source | State |
|---|---|---|---|
| 2.1 | Render path is exact integer nearest-neighbour: ≥ 90% of aligned 3x3 device-pixel blocks uniform on the field | research §1 "pixel-perfect needs an integer factor"; owner 2026-08-17 crispness | **PASS** — 93.6% measured this session on a 390x844 @3x field |
| 2.2 | Every surface shows ~3 device px per art px (towns 3.1, overworld 3.0, dungeons 3.0) | owner "needs to match the overworld and dungeon crispness" | PASS by measurement — the surfaces already match |
| 2.3 | The overworld terrain does not read "poor" | owner build 70 "image quality poor" | **SHIPPED build 73** per the owner ("Sharper the better"): chunks and landmarks sharpened in place (`scripts/sharpen_act1_chunks.py`, unsharp 1.0 / 220%, lossless). Owner to confirm on the phone |
| 2.4 | Hero g3 is the only hero asset on every surface; 64-px frames at 36 world px in towns, 1.0125x on the field | owner "use the canonical g3 as the default and stop using anything else" | PASS |
| 2.5 | No procedural terrain visible where baked art exists; no blue screen, ever | owner "no. locked in art, full stop"; "there needs to be a definitive checker" | PASS on builds 47+70 (veil); re-verify in the playthrough |
| 2.6 | HUD/dialogue text on the Phaser canvas at device resolution | PROJECT-RUNBOOK bug 4 | OPEN — owner-flagged "dedicated, carefully-verified effort"; not touched this session |

## 3. Towns

| # | Line | Source | State |
|---|---|---|---|
| 3.1 | Leaving a town reads as leaving the map: the map visibly ends beyond the mouth line, and the exit is a 300 ms `screen.transition` fade, not a cut | owner ×4, build 70 "the player needs to get the illusion that they are leaving the map"; GAME-FEEL token | IN PROGRESS (town agent) |
| 3.2 | Facing continuity: arrive facing the way you walked in (first entry excepted: facing the elder), leave facing the way you walked out | owner "facing continuity" | IN PROGRESS (town agent) |
| 3.3 | New game opens in front of the elder, facing him, at interacting distance, and replays on every new game | owner 2026-08-25; regression build 62 | PASS build 70 (save-scoped flag); re-verify |
| 3.4 | Shop: confirm popup, quantity for expendables, total, wallet cap; list keeps scroll; New-equipment dot + pill | owner build 67/68 | PASS build 70; re-verify |
| 3.5 | Healer charges a fee with a pay/cancel popup; menu/shop never move the player | owner build 64/67 | PASS build 70; re-verify |
| 3.6 | No "[key]" or English under Japanese anywhere in a town | owner build 48/66 | PASS build 70; re-verify in JA |
| 3.7 | Boundaries match the painting on the 10% he flagged | owner "90% are fine" | OPEN — **OWNER-Q3**: mark the spots on a rendered audit, or accept for this release |

## 4. Dungeons

| # | Line | Source | State |
|---|---|---|---|
| 4.1 | Enter at the mouth facing in; one entrance; arch painted and passable | owner build 65/66 | PASS build 66/70; re-verify |
| 4.2 | Continuous movement; collision from the painted floor, no invisible grid | owner 2026-08-05 | PASS (mask mover); boundaries per 3.7 |
| 4.3 | The boss is a live sprite that fully vanishes, shadow included | owner build 67 | **PASS (build 74)**: the four boss floors re-rendered without the baked mark (`render_dungeon_material_map.py --skip-kind boss`, deterministic), cover patches deleted; `verify_boss_vanish.cjs` 12/12. Found and fixed on the way: Darkfang Grotto's boss cell shipped as a WARP (engine has 5 floors, ours 3), so the Giant Toad could never be fought; `verify_boss_fight_reachable.cjs` now proves the battle starts |
| 4.4 | Save crystals: entrance crystal inert until activated; interact by bump + button | owner build 29/35/36 | PASS; re-verify |

## 5. Battle, menus, text

| # | Line | Source | State |
|---|---|---|---|
| 5.1 | Attack/Defend/Item/Flee all work; quiz right/wrong paths; rewards; no overflow at 390 pt | research §4; owner icon lock (red sword) | re-verify in the playthrough |
| 5.2 | Body text ≥ 17 pt, never < 11 pt; touch targets ≥ 44 pt | research §2/§3 (Apple HIG) | re-verify (audit) |
| 5.3 | Kanji only up to the player's grade band with furigana beyond it; kana mode for lower grades | research §2 (MEXT 1,026 kanji by grade) | **OWNER-Q5**: which grade band(s) does Act 1 target (5-under / 6-8 / 9-11), and is kanjiMode the only switch? |
| 5.4 | Name field commits on ONE tap | owner ×2 ("again") | re-verify on device |
| 5.5 | No "[key]" / English leak in JA; EN/JA/JA-kanji in sync | AGENTS.md rule 8 | re-verify (census, JA pass) |

## 6. Persistence and stability

| # | Line | Source | State |
|---|---|---|---|
| 6.1 | Save → second launch → Continue restores position, HP, gold, inventory | research DoD 15/27 | re-verify (census step 6) |
| 6.2 | New Game after a save replays the opening; no flag leaks | owner build 62 regression | re-verify |
| 6.3 | Full Act 1 loop (field → battle → menu → town → dungeon → save → reload) with zero crashes and zero blue screens | owner ×3 blue screen; research DoD 27 | re-verify on device |

## 7. Store readiness (research §5; not code)

| # | Line | State |
|---|---|---|
| 7.1 | Kids Category band chosen and matched to the content | **OWNER-Q5** (same as 5.3) |
| 7.2 | No external links / purchases outside a parental gate; no third-party analytics/ads | verify in the Capacitor shell before submission |
| 7.3 | Privacy policy present if any data leaves the device | owner/legal item |

## Questions for the owner (the gray areas the record cannot close)

Answered 2026-09-02. Q1 keep 5.4 cells/s (owner). Q2 sharpen, "sharper the better" (owner). Q3-Q6 delegated
to my recommendation: Q3 accept the boundaries for this release and collect the owner's specific spots
from his build-72 play; Q4 fix the baked boss now (art regeneration, bounded); Q5 Kids Category 6-8 with
the in-game grade wheel unchanged and kanjiMode as the only kanji switch; Q6 Dragon Quest is the bar.
