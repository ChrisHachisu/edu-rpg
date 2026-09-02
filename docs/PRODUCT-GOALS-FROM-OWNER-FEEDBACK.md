---
date: 2026-09-02
type: reference
project: edu-rpg
tags: [product-goals, owner-feedback, act1, acceptance-bar]
---

# Product goals, derived from the owner's own words

This document does not propose new goals. Every row in Section B is either a **verbatim quote**
from the owner, taken from a source in this repo or the brain vault, or is explicitly marked
**INFERRED** where the record implies a requirement but the owner never stated it directly.
Nothing here paraphrases a quote where the quote itself was available — read the "Quote(s)"
column, not the "Goal" column, when precision matters.

Compiled 2026-09-02, current through TestFlight build 70 / commit `95b25bb`.

---

## A. The product, as the owner has described it

Quest of Knowledge is an educational RPG for Japanese grade-schoolers, shipped to TestFlight as a
native iOS app (Capacitor/WKWebView shell over a Phaser web build). AGENTS.md's own instruction —
"review changed Japanese for natural **JRPG phrasing**" (`AGENTS.md:41`) — names the genre family
directly; the closest the owner's own record comes to a named comparison title is a build note
sizing Port Sapphire "roughly 2.6x tighter than **a Dragon Quest town**"
(`docs/handoffs/2026-08-01-act1-port-sapphire-town-screen.md:226`, engineering note, not an owner
quote — see Open Question D5). Progress is measured by the owner personally playing each build on
his own iPhone and reporting back in plain language; he is explicitly "**not a developer**" per
this project's memory profile, and every report back to him is required to be "plain language plus
visual proof. Never a diff." (`~/.claude/skills/smooth/SKILL.md`).

**What "market release quality" means to him, in his own words, from the mandate that opened the
current work (2026-09-02):**

> "autonomously do a heavy playthrough and bug fix/front-end design polish fix for market release
> quality … use all the tools you have at your disposal and work as thoroughly as possible and
> until we achieve a high quality product base for act 1 and push to TF and ping me so i can verify
> on my phone."
> — `docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:142-144`

Two structural facts shape every goal below. First, **his own painted terrain is the design
authority** for the overworld, over any generated or inferred map — "Their paint is now the
authority for terrain, exactly as their landmark placement is the authority for placement"
(`docs/handoffs/2026-07-29-owner-painted-terrain-to-codex-art.md:16`). Second, **locked-in art is
never a lower design tier that a bug can degrade to** — "no. locked in art, full stop"
(`docs/GROUND-TRUTH.md`, OWNER DIRECTIVE 2026-08-11, also quoted at `public/dq-tiles.js:2043-2044`).
Both recur throughout Section B as the reason a given regression counted as a "blocker" rather than
cosmetic polish.

---

## B. Goals by area

Status citations point to the file where the record states the status. "OPEN" with no further
qualifier means the newest source found makes no claim of a fix.

### Movement / feel

| Goal | Quote(s) | Status |
|---|---|---|
| Dungeon movement must be continuous and collision must be derived from the actual painted art, not a square/tile grid underneath it | "the player does not walk smoothly and the user blockers are not synced with the visual design and there is underlying block structures ... if the dungeon is fundamentally build on square design and engine, this is a major problem" — 2026-08-05, Sunken Cellar B3F (`public/dq-tiles.js:3215-3218`); restated on the overworld the same day: "the player does not walk smoothly and the user blockers are not synced with the visual design" (`public/dq-tiles.js:3634-3635`) | **SHIPPED** — continuous movement + art-derived collision landed per `docs/handoffs/2026-08-06-act1-dungeon-playable-hero-north-open.md:34`, owner verdict "movement in dungeons look pretty good" |
| Dungeon size, not player speed, is the lever for cramped-feeling dungeons | "rather than changing the player movement only in dungeons i prefer expanding the dungeons" (`docs/handoffs/2026-08-06-act1-dungeon-playable-hero-north-open.md:42`) | **LOCKED decision** — movement speed stays 260 px/s in both overworld and dungeon; same source |
| Overworld walking must not be laggy/jittery | "extremely laggy and jittery" (paraphrased in the current handoff's priority list, `docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:108`) | **OPEN — MAJOR, unstarted** as of build 70 (same source, item 1 of 5 open items, top priority) |
| Wall/boundary collision must match exactly where the painted art shows floor vs. rock | "the boundaries in the town are slightly off in some locations (top side of houses, edges of the town, fenses, etc.) ... i'd say 90% are fine" / "the top side of the walls look like they have an invisible barrier but the north side need to be touchable" (`docs/handoffs/2026-08-30-build67-remaining-items.md:14-17`) | **ATTEMPTED, BACKED OUT** — a mask-growing fix moved no metric and tripped a region-count guard; owner asked to be given specific spots instead (same source, "Where to go instead") |

### Camera

| Goal | Quote(s) | Status |
|---|---|---|
| Camera width (world px shown on screen) is a locked design number, not free to change unilaterally | "Owner locked 912 (1.78125 source/world), camera 208, and manifest r4" (`docs/handoffs/2026-07-16-act1-912-hero-g3-traversal-relay.md:21`) | **LOCKED** — `designLocks.cameraWorldWidth = 208` in `public/act1-hifi/manifest.json`, per `reference_edu_rpg_canonical_hero.md` |
| The Port Sapphire camera framing (1.9 houses visible, "2.6x tighter than a Dragon Quest town") was flagged as possibly too tight but never ruled on | INFERRED framing question; the record states plainly: "Still open and NOT decided by the owner ... Raise it if the owner asks; do not change it unilaterally" (`docs/handoffs/2026-08-01-act1-port-sapphire-town-screen.md:225-227`) | **OPEN QUESTION**, not a stated owner goal — see D5 |
| Camera must snap to a whole-number art-to-device pixel ratio so town rendering is not fuzzy | Owner approved: "do both, camera snap now and the 1950 rebake" (2026-08-17, `docs/FEEDBACK-BUILD-38.md:133`, also `docs/T1-PORT-SAPPHIRE-REBAKE-SPEC.md:5`) | **SHIPPED** — camera snap in `public/act1-hifi/town.html`, 14% → 100% uniform 3x3 blocks (`docs/FEEDBACK-BUILD-38.md`) |
| Menu/dungeon transitions should return the camera to the correct position, not the entrance | "menu→dungeon camera snap" fixed in build 70 (`docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:19`, commit `750a7eb`) | **SHIPPED build 70** |

### Visual quality / crispness

| Goal | Quote(s) | Status |
|---|---|---|
| Dungeon wall art must be crisp up close, not fuzzy | "the top and sides of the wall need to be crisp. seeing them close up the fuziness bothers me" (`docs/handoffs/2026-08-04-act1-overworld-baked-next-dungeon-art.md:69-70`, also `docs/handoffs/2026-08-04-act1-overworld-baked-next-dungeon-art.md:182-183`) | **SHIPPED** — "crisp wall rims — the wall-base band was smearing 8 px of floor; owner: 'i love the clear rims'" (`docs/handoffs/2026-08-06-act1-dungeon-playable-hero-north-open.md:25`); style LOCKED per `docs/DUNGEON-EDGE-STYLE-LOCK.md:2-3` |
| Town art must match overworld/hero crispness, not read as fuzzy or painterly | "port sapphire's touch up is not working visually ... the resolution is currently fuzzy on the app and i can clearly tell that the texture is different from the hero so this needs to be matched" (`docs/FEEDBACK-BUILD-38.md`, T1); "the town crispness definitely needs close examination ... i suspect the overworld and dungeons are the same fuzziness as well but i think they are just harder to notice" (2026-08-17, `docs/FEEDBACK-BUILD-38.md`, T1 follow-up); "way too fuzzy ... needs to match the overworld and dungeon crispness" (owner 2026-08-14, `public/act1-hifi/town.html:250`); "i do agree the fuzziness is better" (v8 candidate, `docs/handoffs/2026-08-17-build38-feedback-and-town-art.md:49`); "keep the grass" (same source, v6 rejection) | **SHIPPED** — non-integer nearest-upscale fixed (`docs/handoffs/2026-08-17-build38-feedback-and-town-art.md:20-21`); v8 hard-edged finish approved with the "sharpness it looks good" quote referenced at `docs/handoffs/2026-08-18-town-art-first-tiled-rebake.md:85` |
| The Phaser overworld HUD/dialogue text renders at ~⅓ device resolution (soft) — this is a real, un-fixed defect | INFERRED priority framing; the record: "Owner wants this as a dedicated, carefully-verified effort — do NOT hand-patch it into the bundle rashly" (`docs/PROJECT-RUNBOOK.md:240-241`) | **OPEN** (bug 4 in PROJECT-RUNBOOK's list), explicitly deferred by the owner's own instruction rather than backlogged silently |
| Procedural/analytic terrain must never be what a player sees where baked art exists | "no. locked in art, full stop" (`docs/GROUND-TRUTH.md`, 2026-08-11; also `public/dq-tiles.js:2043-2044`) | **LOCKED / SHIPPED** — the procedural splat covers 9,375 of 9,376 walkable tiles with baked art (`docs/handoffs/2026-08-11-procedural-surface-over-locked-art.md:170-171`) |
| A dungeon floor must never be cut off at the canvas edge, mid-room | "the screen shot area in the sunken cellar is cutoff, which is a huge issue ... i thought this was an image display issue but apparently the map was just created prematurally" (owner, 2026-08-07, `docs/DUNGEON-EDGE-STYLE-LOCK.md:11-14`) | **LOCKED, SHIPPED** — CROP_MARGIN = 3-cell rock frame enforced on every floor (`docs/DUNGEON-EDGE-STYLE-LOCK.md:8-9`) |
| Overworld image quality must not read as "poor" | "image quality poor" (current handoff's item-1 summary, `docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:108`) | **OPEN — MAJOR, unstarted**, bundled with the jitter/lag item above |

### Art consistency

| Goal | Quote(s) | Status |
|---|---|---|
| Only ONE canonical hero asset (`hero-g3`) is used across every runtime; the old 48px tile-map hero must never resurface | "the hero is the old asset. you keep defaulting to this hero in new sessions so we need to fix this for good" (owner, 2026-07-31, `reference_edu_rpg_canonical_hero.md`); "use the canonical g3 as the default and stop using anything else" (owner, 2026-08-03, `public/hero-override.js:18`) | **LOCKED** — g3 is canonical, old sheets excluded from the table (`public/hero-override.js:17-21`) |
| The hero's world scale/zoom must match the overworld exactly | "the resolution and zoom needs to match the overworld completely" (owner, 2026-07-31, `reference_edu_rpg_canonical_hero.md`) | **LOCKED** — `heroSourcePixelsPerWorldPixel = 64/36`, matched within 0.195% of the production lattice (`reference_edu_rpg_canonical_hero.md`) |
| The old hero asset must not flash on screen even momentarily, e.g. before the overworld finishes loading | "i also saw ... the old hero asset before the current overworld loaded" (owner, 2026-08-07, `public/hero-override.js:104`) | **SHIPPED** — swap moved to the same frame the procedural knight is rebuilt (`public/hero-override.js:103-107`) |
| The hero's north-facing (back) walk animation must match the other directions, across every town | "the hero's back shot (north facing shot) is still incorrect ... you never got around to match it with the overworld and dungeons" — owner, "repeatedly and across all three towns" (`public/act1-hifi/town.html:545-546`); also "isn't it as simple as providing codex the other facing assets as references and telling it to generate a north facing walking animation?" (`docs/handoffs/2026-08-06-act1-dungeon-playable-hero-north-open.md:70-71`) | **SHIPPED** — "north facing animation is not bad. I'll take" (owner verdict, `docs/handoffs/2026-08-06-act1-dungeons-complete-hud-open.md:28`); redrawn row wired into the correct read path (`public/act1-hifi/town.html:547`) |
| Battle command icons must use their real, locked colors (e.g. the Attack sword is red) | "make sure the sword icon is red" (owner, 2026-08-08, `public/ui-overhaul.js:1181-1182`) | **SHIPPED** — value was already correct in code; the resting-selection removal is what finally exposed it on screen (same source) |
| Foreground props (tall/overhead) must draw over the hero/NPCs and remain passable underneath | "draw over the hero AND be passable" (owner, 2026-08-13/14, `public/act1-hifi/town.html:209-210`) | **SHIPPED** — foreground layer sorts after hero/NPC (same source) |

### Towns

| Goal | Quote(s) | Status |
|---|---|---|
| Towns are built art-first, not from a generated square/tile grid | "this square tile style is what did not work before" (owner rejection of a first-pass semantic grid, `docs/handoffs/2026-08-01-act1-port-sapphire-town-screen.md:71-72`); "I don't think the new direction for the towns are working ... visually towns are better when they are art first" (`docs/handoffs/2026-08-18-town-art-first-tiled-rebake.md:16-18`) | **LOCKED / SHIPPED** — walkable geometry derived from polygon painting, not a grid (`docs/handoffs/2026-08-01-act1-port-sapphire-town-screen.md:69-71`) |
| Port Sapphire needed a full redo: clear walkability, a defined shop and healer spot, art matched to the hero | "port sapphire's touch up is not working visually. i think we need to redo the town from scratch with clear instructions on making it clear where players can walk and a place for the shop and the healer. the resolution is currently fuzzy on the app..." (`docs/FEEDBACK-BUILD-38.md`, T1) | **SHIPPED, accepted** — "much better ... just fix that and make an actual port and we should be good" (`docs/handoffs/2026-08-01-act1-port-sapphire-town-screen.md:138-139`); later "looks perfect now" (`docs/handoffs/2026-08-19-act1-towns-dungeons-single-entrance.md:181`) |
| The whole game's opening must place the hero in front of the story NPC (Elder Rowan), facing him, at interacting distance | "the hero needs to start the game in front of the elder, facing him, at interacting distance" (owner, 2026-08-25, `public/act1-hifi/town.html:372-373`) | **SHIPPED then REGRESSED then RE-FIXED** — regressed by a localStorage flag surviving a new game ("the game starts at the entrance area of the town and not facing and infront of the elder. this is a regression so this needs fixing", build 62 item 2, `docs/handoffs/2026-08-26-build62-feedback.md:22`); re-fixed via a save-scoped story flag in build 70 (`docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:16`, commit `a6d8372`) |
| A town's water features (wells) must be naturally covered/matched to surroundings where they intrude on the opening view | "can you naturally cover the well that the player is facing on the sim with grass?" (build-62 item 1, `docs/handoffs/2026-08-26-build62-feedback.md:16`) | **SHIPPED build 70** — "third half-drawn well covered" (`docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:18`, commit `e01e464`) |
| NPCs (healer) must be positioned clear of scenery they visually collide with | "the NPCs look good. just move the healer slightly a little more out of the shop (just slightly) so she does not touch the dangling herbs?" / "just slightly" (`docs/handoffs/2026-08-26-build62-feedback.md:20,103`) | **SHIPPED build 70** — "healer out of the herbs" (`docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:16`, commit `a6d8372`) |
| Plate seams between rebaked town regions must be seamless in both position and color | "not connected at the correct location and the colors slightly do not match" (`docs/handoffs/2026-08-19-act1-towns-dungeons-single-entrance.md:204`) | Referenced as a task in that handoff; **status not confirmed by a later source read** — mark UNKNOWN |
| **Town exit must feel like leaving the map, not an arbitrary interior line** (see Recurring theme C1) | "the exit of the town is set at a weird place" (build 62, `public/act1-hifi/town.html:600-601`); "the player needs to exit the town the moment they touch the edge of the town. currently they need to walk off of the map to exit it" (build 63, `public/act1-hifi/town.html:603-604`); "the exit of the town is set at a weird place too. i want the exit to be set to the edge of the town map (all towns)" (build 62 item 3, `docs/handoffs/2026-08-26-build62-feedback.md:18`); "still not the edge of the map. the player needs to get the illusion that they are leaving the map" (build 70, `docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:160-161`) | **OPEN — 4th iteration, unresolved as of build 70** ("This is the FOURTH iteration (build 57 beyond the gate, 62 on the gate, 63 canvas edge, 66 crossing line at the mouth)", same source) |

### Dungeons

| Goal | Quote(s) | Status |
|---|---|---|
| The dungeon entrance arch must never block the player from entering | "the arch in the dungeon entrance now blocks the player from entering. why dont we just remove the arch blocking the entrance?" (build 43/44, `docs/FEEDBACK-BUILD-38.md`, A1) | **FIXED** commit `c0329fe` — a regression from a prior "fix"; masks reverted and the patcher now erodes by foot+lean clearance (same source) |
| Entering a dungeon must place the hero at the entrance, facing in, or hard-block unauthorized entry points | "entering into dungeons should always position the players in the entrance direction or hard block the player from entering the dungeon from an unauthorized location" (build 65, `public/dq-tiles.js:3187-3188`) | **SHIPPED** — position was already correct; `heroDir` now set on arrival (same source); build 70 also lands "dungeon entry lands on the mouth facing in; the arch is actually PAINTED now" (`docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:20`, commit `5022abc`) |
| The entrance teleport crystal should sit flush to the wall it is mounted on | "i want the entrance teleport crystal more embedded in the wall. essentially the interaction point should be flush to the wall surface you normally bump into" (`docs/FEEDBACK-BUILD-38.md`, D1) | **OPEN** as of the build-38 feedback doc; no later source confirms a fix — mark UNKNOWN/OPEN |
| The boss must render as a real sprite over real floor, not baked into the background, sort correctly against the hero, and fully vanish (including its shadow) after defeat | "the boss asset looks like a background and not like an asset ... also the hero gets overlayed on top of the boss, which looks very weird. (i realized after defeating a boss that it actually is partially a background, so we need this to fully be a sprite and have an actual floor underneath it and make the boss disappear after defeating it as well)" (`docs/FEEDBACK-BUILD-38.md`, D2); "you did not replace the boss sprite with something that can be removed completely when the boss is defeated ... the shadow does not remain even after defeating it" (`docs/handoffs/2026-08-30-build67-remaining-items.md`) | **PARTIAL** — sort-against-hero and vanish-on-defeat SHIPPED build 42 (`public/dq-tiles.js:5207-5210`); "real sprite over real floor" **ATTEMPTED AND BACKED OUT**, needs art regeneration of the four boss-room plates (`docs/handoffs/2026-08-30-build67-remaining-items.md`) |
| A door/entrance landmark (e.g. Darkfang Grotto) must always render above the treeline, never partly behind it | "the darkfang grotto asset is sometimes rendered on top of the forrest and sometimes partially below it. it should always be rendered on top" (build 38, `public/dq-tiles.js:2273-2274`) | **FIXED** — landmark depth raised above canopy (`public/dq-tiles.js:2276` ff) |
| A single overworld door/entrance must have one clearly-marked, unpassable-boundary approach; regenerate art if needed | "lets have one entrance for each town and dungeon each and show an unpassable structure around it. please get an asset redesign from codex if necessary" (`docs/FEEDBACK-BUILD-38.md`, O1); reiterated as a **NEW LOCKED DIRECTION**: "only one entrance for towns and dungeons (unless they connect acts or in other special circumstances) and the edge need to be blockers so the user cannot walk on top of it" (`docs/handoffs/2026-08-19-act1-towns-dungeons-single-entrance.md:103-105, 213-215`) | **OPEN as of build-38 doc**; single-entrance rearchitecture explicitly scoped as Task 4 in the 08-19 handoff — later completion not confirmed in sources read; mark UNKNOWN |
| The player must not stand on top of a plaque/prop that is meant to occlude something they walk under | "the player walks under the floor and the arch so the problem is that the arch and the floor is on the same layer. something that the player walks under needs to be on a completely separate layer" (build 48, `public/dq-tiles.js:5284-5286`) | **SHIPPED** — separate alpha layer added (same source, `a1dFloorArch` context) |
| Dungeon and Sunken Cellar art must be updated to the latest generation ("dark fang is probably not created yet") | "the dungeon needs updating to the latest versions (dark fang is probably not created yet, sunken cellar is)" (`docs/handoffs/2026-08-03-act1-design-lock-and-playability.md:103-104`) | **SHIPPED** — "Every Act 1 dungeon now ships baked art except crystalCave, which stays deliberately untouched" (`docs/handoffs/2026-08-06-act1-dungeons-complete-hud-open.md:27-28`) |

### Overworld

| Goal | Quote(s) | Status |
|---|---|---|
| The game must never get stuck on a stalled/blue loading screen — this is a long-standing edge case that needs hardening, not a new regression (see Recurring theme C2) | "After exiting a battle, the overworld got stuck on a blue screen and stays that way. Getting in and out of battles or towns did not change it" (build 17, `public/dq-tiles.js:1653-1654`); "blue screen bug still happens. there needs to be a definitive checker that does not allow this, even if the loading spinner is shown for longer" (build 67, `public/dq-tiles.js:1750-1751`); "when the game gets overloaded the map stops loading and stays blue (movement and game play is fine)", "we just need to maybe harden the loading check?" (build 43, `public/dq-tiles.js:1246-1248`, also `docs/FEEDBACK-BUILD-38.md` A4) | **FIXED** commit `8421ef4`+`bc5408c` build 47 — two independent no-retry loaders identified and given bounded retry with back-off; owner's diagnosis was correct where the prior fix attempt was wrong (`docs/FEEDBACK-BUILD-38.md`, A4 detail); build 70 adds "blue-screen readiness veil" as an additional cover layer (`docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:22`) |
| The hero must never be hidden underneath forest canopy she should stand in front of | "the player hides under the forrest (they should be on top of the forrest) some times so this needs to be fixed" (build 32, `public/dq-tiles.js:1992-1994`) | **FIXED** — canopy depth lowered below the hero (`public/dq-tiles.js:1991`) |
| The player must be told the specific error when the app crashes/throws back to the title, not left guessing | "why don't you build in an error message that displays depending on the error type on my phone? i can tell you the exact error message so you can pinpoint the issue" (owner, 2026-08-09, `index.html:354-356`) | **SHIPPED** — the black-box diagnostic panel exists for exactly this reason (same source, "He is right, and it is the best idea anyone has had about this bug") |
| The diagnostic/debug panel must stay off by default unless the owner explicitly asks for it | "the diagnostic panel was intentionally turned off" (owner, 2026-08-17, `index.html:672-673`) | **LOCKED** — off by default; measurement taken another way instead (same source) |

### Battle

| Goal | Quote(s) | Status |
|---|---|---|
| The hero sprite must never visually overlay/clip on top of the boss sprite | "the hero gets overlayed on top of the boss, which looks very weird" (build 38, `public/dq-tiles.js:5208-5209`, also part of D2 above) | **SHIPPED** build 42 — `a1dBossSort` depth-sorts a live copy against the hero (same source) |

### Shop / menus / UI

| Goal | Quote(s) | Status |
|---|---|---|
| Buying must ask for confirmation, show quantity for expendables, show total cost, and block purchases exceeding the wallet | "buying an item also needs to make a confirmation button popup (option to buy or cancel and the price). the quantity needs to be selected for expendable items (not equipment) and total cost also need to be displayed (needs a blocker for exceeding current wallet amount)" (build 68, `public/ui-overhaul.js:790-793`) | **SHIPPED build 70** — commit `750a7eb`, "shop confirm + quantity + wallet cap" (`docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:23`) |
| The shop list must not snap back to the top on every gold/selection change while scrolling | "the shop screen snaps back top when scrolling down but it shouldnt" (build 68, `public/ui-overhaul.js:376-377`) | **SHIPPED build 70** — scroll position carried across same-screen repaints (`public/ui-overhaul.js:377-379`); "sticky Buy/Sell/Leave, scroll kept" (`docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:23`) |
| Stronger new equipment must surface a visible indicator (tab dot + item badge) until seen | "when the player obtains a weapon or gear that is stronger than what they have, the relevant bottom tab needs to get a green dot ... and the equipment menu screen needs to show 'New' on a new eqiupment that they have not seen yet (seeing it clears it)" (build 67, `public/ui-overhaul.js:399-401`) | **SHIPPED build 70** — "New-equipment dot + pill" (`docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:23`) |
| Stale/redundant art (old shopkeeper icon) should be removed rather than kept around | "The shop keeper icon is not needed on the shop menu. This is the old shopkeeper artwork" (build 64, `public/ui-overhaul.js:727-728`) | **SHIPPED** — icon dropped, no second copy of art to keep in sync (same source) |
| A generic placeholder hero must not appear while character art is loading; use a spinner | "when the characters load on the character build screen, a generic pixel player shows up, but i'd rather see a loading spinner than this" (build 38, `public/ui-overhaul.js:113-114`) | **SHIPPED** — `heroSpinner()` replaces `heroSvg()` in both pending-art paths (same source) |
| The difficulty/grade selector must be a scrolling wheel showing full text, sized to fit one screen | "the quiz difficulty selector needs to be a scrolling wheel list rather than a tappable list (show the full text rather than generic numbers and letters and the full text below). this way everything should fit in one screen" (build 38, `public/ui-overhaul.js:1097-1099`) | **SHIPPED build 41**, later fully confirmed: "finally fixed and working correctly" (build 54, `docs/handoffs/2026-08-19-act1-towns-dungeons-single-entrance.md:180`) |
| Nothing should be pre-selected/focused when the name-entry screen first opens | "the screen starts out by the name field selected but this is not optimal. i don't want anything preselected" (build 38, `public/ui-overhaul.js:1156-1157`) | **SHIPPED** — overlay never auto-focuses; the bundle's own hidden input was blurred on paint (same source) |
| The Start/confirm button on the hero-build name field must register on the first tap, not require a double tap (see Recurring theme C4) | "on the hero build screen, the text field acts funny and the player needs to tap check twice to commit the name" (build 43, `public/ui-overhaul.js:1563-1565`); "the double enter required ... is an issue again" (build 54, `public/ui-overhaul.js:1879`) | **FIXED twice** — commit `c0329fe` build 43/44 (tap measured by finger travel, not element identity); recurrence at build 54 fixed the same way (`public/ui-overhaul.js:1878-1882`) |
| Every landing-screen button must keep working after a round-trip through character create and back | "after tapping the back button on the character build screen and returning to the initial landing screen all buttons stop working" (build 38, `public/ui-overhaul.js:1715-1716`) | **FIXED** — root cause a misspelled method inside a silently-swallowing try/catch (`docs/FEEDBACK-BUILD-38.md`, S1) |
| The collapsed map icon on the overworld must actually look like a folded map | "the collapsed map icon needs to be a map icon on the overworld. currently it is not" (2026-08-17, `public/ui-overhaul.js:2020-2021`) | **SHIPPED, owner confirmed** — "map icon is good" (`docs/handoffs/2026-08-17-build38-feedback-and-town-art.md:20`) |
| A dialogue box must never attribute its message to a previous, now-destroyed speaker | "the message is implying the healer is speaking (previous npc that the player talked to?)" (build 68, `public/ui-overhaul.js:2301-2302`) | **SHIPPED build 70** — liveness check on `.scene`; "destroyed speaker no longer narrates the next message" (`docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:21`, commit `eee3990`) |

### Text / i18n / Japanese

| Goal | Quote(s) | Status |
|---|---|---|
| Interact prompts must speak the player's set language (not fall back to English under Japanese) | "the buttons that appear when getting close to an asset for interaction do not have the i18n yet and are showing english even in japanese setting" (build 48, `public/dq-tiles.js:4124-4126`) | **SHIPPED, owner confirmed in Japanese** — "ja all good." (`docs/handoffs/2026-08-18-wheel-arch-and-prop-based-town.md:25`) |
| Raw translation keys/system text must never leak into a villager's dialogue box | "Villager names show system text" (build 66, `public/ui-overhaul.js:2301`, and `public/act1-hifi/adapter.js:464-465`) | **SHIPPED build 70** — town.html rejects a bracketed answer and falls back to the authored name; the English fallback then needed a Japanese equivalent too (`public/act1-hifi/adapter.js:465-467`) |
| English, Japanese, and Japanese-kanji text must stay in sync and read as natural JRPG phrasing | INFERRED from project-wide rule, not a single owner quote: "Keep English, Japanese, and Japanese-kanji text in sync, then review changed Japanese for natural JRPG phrasing" (`AGENTS.md:39-41`) | **Standing rule / ongoing** |

### Save / continue / new game

| Goal | Quote(s) | Status |
|---|---|---|
| The entrance (dormant) save crystal must not be interactable, and must have no independent heal/save ability, until the boss crystal activates it | "it can be interacted with even when it is not activated, so this is a bug. the entrance crystal has no saving ability and only sends the player to the crystal near the boss (no healing ability as well). the entrance crystal cannot be interactable until it is activated (interacting with the crystal near the boss)" (build 36, `public/dq-tiles.js:4159-4162`) | **SHIPPED** — dormant-crystal guard added; entrance crystal offers exactly one option, the warp, once lit (`public/dq-tiles.js:4631-4635`) |
| The entrance portal crystal, as a game object, needs to actually be designed/exist (activated + inactivated states) | "the entrance portal crystal is still not in the game ... my idea is to have codex design a crystal of an activated and inactivated state that lives next to the plaque on the wall" (build 35, `public/dq-tiles.js:5353-5355`) | **SHIPPED** — art commissioned and wired via `A1D_MAPS`/`kind:"save"` (same source) |
| A "first entry" state (opening in front of the elder) must be tied to the SAVE, not to a flag that survives starting a new game | "the game starts at the entrance area of the town and not facing and infront of the elder. this is a regression so this needs fixing" (build 62, `docs/handoffs/2026-08-26-build62-feedback.md:17`) | **FIXED build 70** — moved to a save-scoped story flag (`docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:32`, `[[learning-20260829-arriving-is-not-recovering]]`-adjacent decision) |
| Chests, plaques, the boss, and the save crystal must all be reliably interactable via an explicit interact button, not ambiguous bump-detection | Owner, verbatim, after build 29: chests/plaques/the boss/the save crystal "cannot be interacted with reliably", fix specified as "make an interaction button (open, read, battle, etc.) popup when the player touches the asset so players can clearly choose when to interact with the thing" (`public/dq-tiles.js:4087-4090`) | **SHIPPED** — the interact-prompt button system (same source) |
| A plaque/crystal must only become readable/interactable once the player actually touches it, not merely approaches it (see Recurring theme, contact not proximity) | "the plaque is readable before touching it. i want it to be readable only when the player touches it (bumps into it)" and "same with the entrance crystal, which is worse because it is interactable way before bumping into it" (build 36, `public/dq-tiles.js:4267-4269`) | **SHIPPED / LOCKED** — `[[learning-20260829-crossing-not-proximity]]`; plaque range logic fixed at `public/dq-tiles.js:4350-4353` |
| The healer must charge a fee, and the player must be able to choose to pay-and-heal or cancel via a menu popup | "healer needs to ask for a fee when the player needs healing and the player needs to be able to choose whether to pay and heal or cancel (menu popup). the fact that this is gone is a regression" (build 67, `public/act1-hifi/adapter.js:174-176`) | **SHIPPED build 70** — Greenhollow heal fee set to 3 G, reusing the shipped confirm flow (`docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:21`, commit `c8279b2`; also "healers at their shops" in millbrook/Port Sapphire, commit `750a7eb`) |
| Reopening a menu or shop screen must return the player to exactly where they were in the town, not near the entrance | "after opening a menu screen or shop screen the user snaps to near the entrance of the town but they need to be in the same position as they were and in the same location" (build 64, `public/act1-hifi/adapter.js:120-121`) | **SHIPPED build 70** — a paused WorldMapScene is preserved, not torn down and re-entered from scratch; "shop/menu no longer destroy the town runtime (paused ≠ gone)" (`docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:20`, commit `82825f7`) |

### Audio

| Goal | Quote(s) | Status |
|---|---|---|
| Background music tracks are acceptable as chosen; no further curation demanded | "i don't know much about music but all sound good enough!" (owner, on nine approved tracks, `docs/MUSIC-INTEGRATION-READY.md:52-53`) | **APPROVED, integration-ready** (same source) |
| Music integration should not ship on its own; bundle it with the next content edit | "Wait and bundle it with the next edit" (owner, `docs/handoffs/2026-08-18-wheel-arch-and-prop-based-town.md:62`) | **DEFERRED by owner's own instruction** — licence cleared, integration parked (same source). Not confirmed shipped as of build 70 — see Open Question D6 |

### Performance / load

| Goal | Quote(s) | Status |
|---|---|---|
| The game must have "virtually no lag" when playing | "virtually no lag when playing the game" (owner, 2026-08-07, `~/.claude/skills/smooth/SKILL.md` §1) | **OPEN** — converted into six numeric targets (SMOOTH-1..6); baseline round 0 (2026-08-07) had 3 of 6 metrics RED, up to 21.8x their target (`docs/SMOOTH-BASELINE.md`). Later rounds not re-read this pass; current handoff still lists overworld jitter as the #1 open, unstarted item as of build 70 |
| Startup/load must not "take forever" | "It takes forever to start" (owner-feel framing for SMOOTH-1, `docs/SMOOTH-BASELINE.md`) target ≤1500ms | **RED at baseline** (2513ms, 1.7x target); not re-verified in sources read for build 70 |
| The game must not freeze mid-play | "It freezes" (SMOOTH-4), target ≤100ms | **RED at baseline** (2175.7ms, 21.8x target) — described as "the binding constraint" of round 0 (`docs/SMOOTH-BASELINE.md`) |
| Door/map transitions (overworld↔town/dungeon) must not be slow | "Doors are slow" (SMOOTH-5), target ≤500ms | **RED at baseline**, asymmetric: entering a town 67.5ms vs. leaving it 3737.1ms, a 55x difference across the same door (`docs/SMOOTH-BASELINE.md`) |

### Controls / touch

| Goal | Quote(s) | Status |
|---|---|---|
| The d-pad and interact button must hide whenever any text box (including parent-level dialogue) is on screen | "the joy stick and the interaction button needs to be hidden whenever a text box shows up (this does not happen with key npcs)" (build 67, `public/act1-hifi/town.html:165-166`) | **SHIPPED build 70** — "controls hide for the PARENT's text box" (`docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:21`, commit `c8279b2`) |
| Tapping outside an open panel/box must close it ("tap out") | "the tap out does not work" (build 66, `public/act1-hifi/town.html:322`) | **FIXED** — capture + stopPropagation added; tested tap-on vs. tap-outside explicitly (`public/act1-hifi/town.html:321-325`) |
| A plaque must be tappable on every approach side, not just the front | "the plaque just needed to be tappable on all surfaces but the left side was not tappable" (build 35, `public/dq-tiles.js:4350-4351`) | **FIXED** — line-of-sight guard corrected (same source) |
| Grade/difficulty wheel scrolling must land exactly on the value under the player's finger, not snap back to the prior selection | "the age selector wheel does not naturally allow the user to select the wanted age. when scrolling, the age does not land on the age that is currently in the center but it snapps back to the previously selected one. the behavior is incorrect and still very snappy" (build 43/44, `docs/FEEDBACK-BUILD-38.md`, A2) | **FIX SHIPPED build 45**, confirmed later — "finally fixed and working correctly" (build 54, `docs/handoffs/2026-08-19-act1-towns-dungeons-single-entrance.md:180`) |

### Onboarding / opening

| Goal | Quote(s) | Status |
|---|---|---|
| New game must open with the hero positioned in front of the elder NPC, facing him, ready to interact (see Save/continue above) | "the hero needs to start the game in front of the elder, facing him, at interacting distance" (2026-08-25, `public/act1-hifi/town.html:372-373`) | **SHIPPED, regressed, re-fixed** — see Save/continue/new game section above |

### Edge cases

| Goal | Quote(s) | Status |
|---|---|---|
| An overloaded/interrupted load must never leave the map permanently stuck blue — treat as a long-standing edge case to harden, not dismiss as rare | "we just need to maybe harden the loading check?" (build 43, `public/dq-tiles.js:1248`) | **FIXED build 47**, additional veil layer added build 70 — see Overworld section above |
| The system must distinguish "no message on screen" states from a genuine recovery, so silent freezes aren't misattributed | Asked directly whether a message appears during the freezes: "no message on screen during the freezes" (owner, `index.html:635`) | Used diagnostically to rule out a false explanation for the freezes (`index.html:634-637`) — not a standalone feature request |
| Design authority itself must be tracked so old/superseded claims are retired, not silently believed by a fresh session | "we are not successfully recording what the source truth is for the game and not retiring old aspects whenever there is an update" (owner, `docs/GROUND-TRUTH.md`) | **ADDRESSED** — `docs/GROUND-TRUTH.md` created as the authority table, with the rule "when a claim is refuted, strike it AT ITS SOURCE" |
| Claude/the orchestrator must ask when the locked design record is unclear, not infer and drift | "you are getting confused about the locked design version again and it is alarming. ask me if the records are unclear" (owner, 2026-08-11, `docs/GROUND-TRUTH.md`) | **Standing rule**, quoted as a directive in GROUND-TRUTH.md's OWNER DIRECTIVES table |

---

## C. Recurring themes (raised 2+ times) — the trust-critical items

Ranked by how many separate, dated instances the record shows.

1. **The town exit must feel like leaving the map ("the illusion that they are leaving") — 4 distinct iterations, still open at build 70.**
   Build 57 (beyond the gate) → build 62 (on the gate: "the exit of the town is set at a weird place") → build 63 (canvas edge: "the player needs to exit the town the moment they touch the edge of the town. currently they need to walk off of the map to exit it") → build 66 (crossing line at the mouth) → build 70, still rejected: "still not the edge of the map. the player needs to get the illusion that they are leaving the map." (`docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:160-162`). This is the single most-repeated unresolved item in the whole record.

2. **Blue-screen / stuck-loading — reported on at least 3 separate builds (17, 43, 67), spanning over 8 months.**
   Build 17: "After exiting a battle, the overworld got stuck on a blue screen and stays that way" (`public/dq-tiles.js:1653`). Build 43: "when the game gets overloaded the map stops loading and stays blue" (`public/dq-tiles.js:1246`). Build 67: "blue screen bug still happens. there needs to be a definitive checker that does not allow this" (`public/dq-tiles.js:1750`). Fixed at the loader level build 47, but the owner asked for a structural "definitive checker" rather than another patch, and build 70 added yet another cover layer (the readiness veil) on top.

3. **Art crispness must match across every surface — town, dungeon, and (per the owner's own hypothesis) overworld too — raised independently at least 3 times.**
   Dungeon: "the top and sides of the wall need to be crisp ... the fuziness bothers me" (build, 2026-08-04). Town: "the resolution is currently fuzzy on the app ... the texture is different from the hero" (build 38, T1) and again "way too fuzzy ... needs to match the overworld and dungeon crispness" (2026-08-14). Overworld, as a stated hypothesis rather than a direct complaint: "i suspect the overworld and dungeons are the same fuzziness as well but i think they are just harder to notice" (2026-08-17) — and the current handoff's #1 open item restates "image quality poor" for the overworld specifically, at build 70, suggesting his 2026-08-17 hypothesis may still be live.

4. **Collision/walkability must match the painted visual art, not an underlying grid — raised on both the dungeon and overworld, same day, in near-identical language.**
   Dungeon (Sunken Cellar B3F, 2026-08-05): "the player does not walk smoothly and the user blockers are not synced with the visual design ... if the dungeon is fundamentally build on square design and engine, this is a major problem" (`public/dq-tiles.js:3215-3218`). Overworld, same day: "the player does not walk smoothly and the user blockers are not synced with the visual design" (`public/dq-tiles.js:3634-3635`). Recurs a third time at build 67/68 as the boundary complaint ("the top side of the walls look like they have an invisible barrier but the north side need to be touchable") — attempted and backed out.

5. **The Start/confirm button on the name field must register on a single tap — reported twice, months apart, described by the owner as a repeat.**
   Build 43: "the player needs to tap check twice to commit the name" (`public/ui-overhaul.js:1564-1565`). Build 54: "the double enter required ... is an issue again" (`public/ui-overhaul.js:1879`) — the owner's own word "again" marks this as a recurrence, not a new report.

Honorable mention (2 instances each, not in the top 5): hero north-facing/back-shot animation, described by the owner as raised "repeatedly and across all three towns" (`public/act1-hifi/town.html:545-546`); and the single-entrance/unpassable-boundary directive for towns and dungeons, first raised at build 38 (O1) and reiterated as a "NEW LOCKED DIRECTION" at build 66 (`docs/handoffs/2026-08-19-act1-towns-dungeons-single-entrance.md:103-105`).

---

## D. Open questions for the owner

1. **Town exit fix, 5th attempt: literal map-edge relocation, or a visual "leaving" cue at the current mouth trigger?** The current handoff proposes keeping the trigger at the mouth and adding a fade-out so leaving *reads* as leaving, rather than moving the line again on a guess (`docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:160-163`). Is the goal literally reaching the map's pixel edge before the transition fires, or is the sensory illusion of departure (fade, camera pull-back, etc.) sufficient even if the trigger cell stays where it is?

2. **Are the two backed-out items (boundary/collision polish, boss-as-real-sprite) blocking for "market release quality," or can build 70+ ship without them?** Boundaries need the owner to mark specific spots on a rendered audit ("90% are fine" — which 10%?); the boss needs new art generation for four boss-room plates. Should this playthrough pass wait on either, or treat both as post-launch follow-ups?

3. **Does "market release quality" mean Act 1 alone, or does it set the bar every future Act must clear before its own release?** The mandate names "a high quality product base for act 1" specifically (`docs/handoffs/2026-09-02-act1-market-quality-playthrough.md:143-144`); it is not stated whether this is a one-time gate for Act 1's launch or the standing quality bar for Acts 2-5.

4. **Is the SMOOTH performance goal ("virtually no lag") still the binding target, and is the current build's "extremely laggy and jittery" report a fresh regression or the same unresolved SMOOTH-1/4/5 numbers from the 2026-08-07 baseline?** No later perf-probe re-run was found in the sources read for this document — worth confirming whether the six SMOOTH numbers have been re-measured since baseline round 0.

5. **Was the Port Sapphire camera framing (1.9 houses visible on screen, "roughly 2.6x tighter than a Dragon Quest town") ever actually raised with the owner, and does he want it widened?** The record explicitly flags this as undecided and instructs future sessions not to change it unilaterally (`docs/handoffs/2026-08-01-act1-port-sapphire-town-screen.md:225-227`).

6. **Has the "next edit" music should bundle with actually arrived, and if so, was music shipped in it?** The owner's instruction was "Wait and bundle it with the next edit" (`docs/handoffs/2026-08-18-wheel-arch-and-prop-based-town.md:62`); none of the build 63-70 changelog entries reviewed for this document mention music shipping.

7. **What comparison title(s), if any, define his bar for "market release quality"?** No source read names a specific comparable game directly from the owner — the closest is engineering shorthand ("2.6x tighter than a Dragon Quest town") and the project's own instruction to write "natural JRPG phrasing." Confirming an actual reference title (or titles) would sharpen every visual/feel goal in this document.

---

## E. Source index

**Code comments (verbatim owner quotes with dates/builds):**
`public/dq-tiles.js`, `public/ui-overhaul.js`, `public/hero-override.js`, `public/act1-hifi/town.html`, `public/act1-hifi/adapter.js`, `index.html`, `public/act1-world-map.js`

**Docs:**
`docs/FEEDBACK-BUILD-38.md`, `docs/GROUND-TRUTH.md`, `docs/SMOOTH-BASELINE.md`, `docs/DUNGEON-EDGE-STYLE-LOCK.md`, `docs/hero-walk-art-contract.md`, `docs/PROJECT-RUNBOOK.md`, `docs/MUSIC-INTEGRATION-READY.md`, `docs/T1-PORT-SAPPHIRE-REBAKE-SPEC.md`, `docs/version-history.md`, `AGENTS.md`

**Handoffs read in full or grepped for owner quotes** (dated, chronological; `docs/handoffs/`):
`2026-07-16-act1-912-hero-g3-traversal-relay.md`, `2026-07-16-act1-phone-g2-208-zoom-resolution-handoff.md`, `2026-07-16-act1-port-hires-streaming-owner-review.md`, `2026-07-17-act1-landmark-art-v2-owner-review.md`, `2026-07-18-act1-terrain-legibility-semantic-mask-pilot-relay.md`, `2026-07-18-act1-port-lock-sunken-clockwise-entrance-owner-review.md`, `2026-07-29-owner-painted-terrain-to-codex-art.md`, `2026-07-29-owner-placement-carve-in-progress.md`, `2026-07-31-act1-overworld-colour-and-seams.md`, `2026-08-01-act1-overworld-shipped-renderer.md`, `2026-08-01-act1-port-sapphire-town-screen.md`, `2026-08-02-act1-collision-must-follow-owner-paint.md`, `2026-08-03-act1-design-lock-and-playability.md`, `2026-08-04-act1-overworld-baked-next-dungeon-art.md`, `2026-08-06-act1-dungeons-complete-hud-open.md`, `2026-08-06-act1-dungeon-playable-hero-north-open.md`, `2026-08-09-smoothness-and-overworld-freeze.md`, `2026-08-11-procedural-surface-over-locked-art.md`, `2026-08-17-build38-feedback-and-town-art.md`, `2026-08-18-town-art-first-tiled-rebake.md`, `2026-08-18-wheel-arch-and-prop-based-town.md`, `2026-08-19-act1-towns-dungeons-single-entrance.md`, `2026-08-24-act1-towns-roof-collision-and-npc-colour.md`, `2026-08-26-build62-feedback.md` (read in full), `2026-08-30-build67-remaining-items.md` (read in full), `2026-09-02-act1-market-quality-playthrough.md` (read in full, current live state)

**Brain vault** (`/Users/chris/Documents/claudecode/claude_brain`):
`09-Topics/edu-rpg.md` (read in full — flagged stale/needing rewrite since 2026-07-14, used for audience/monetization background only, not for current quotes); learnings/decisions/tasks lists enumerated via `grep -rl "edu-rpg\|Quest of Knowledge"` across `01-Sessions`, `02-Decisions`, `04-Learnings`, `05-Tasks`, `09-Topics` — not individually opened, since every distinct owner quote found in the code comments and handoffs already originates from these same events and is better-dated at the source.

**Skills:**
`~/.claude/skills/edu-rpg/SKILL.md` (read in full — no owner quotes, operational only), `~/.claude/skills/game-design/SKILL.md` (header + locked sections grepped), `~/.claude/skills/smooth/SKILL.md` §1 (read — source of the "virtually no lag" quote)

**Memory:**
`/Users/chris/.claude/projects/_shared/memory/reference_edu_rpg_canonical_hero.md` (read in full — source of the canonical-hero quotes), `feedback_relaunch_game_after_changes.md` (checked, not applicable — describes a different, Godot-based project)
