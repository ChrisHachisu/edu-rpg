---
date: 2026-08-20
type: handoff
project: edu-rpg
milestone: act1 arch, single entrance, plate seams
status: active
supersedes: "[[2026-08-19-act1-towns-dungeons-single-entrance]]"
tags: [handoff]
---

# Handoff — the authored arch, single entrances, and the seams — 2026-08-20

## What shipped

TestFlight **55**, verified `GATE PASS: externalBuildState == IN_BETA_TESTING`, groups
`['Internal Testers','Beta Testers']`. HEAD `a6c49ac` on `fix/graduated-gpu-heal`, NOT merged to main.
Gate green: **94 pins**, **716** files in `ios/App/App/public`.

| commit | what |
|---|---|
| `1a4d17d` | the arch, from the AUTHORED assets — crown occludes, jambs block |
| `13405f9` | Return in the name field was a dead key — the double enter |
| `72d5731` | the plate seams: exposure matched BEFORE stitching, min-error cut |
| `14080a6` | landmark footprints are blockers; one entrance each |
| `18343b4` | the ten field NPCs for greenhollow and millbrook |
| `115ceaa` | the dq-tiles pins `1a4d17d` left unstaged — HEAD was broken while looking green |
| `af93a43` | the blocker verifier called a working dungeon unenterable, three ways |

## The four things the owner asked for

### 1. THE ARCH — DONE, and the plan had to change

The authored PNGs are wired in and `A1D_OVERHEAD_ON` is true. **The plan as agreed — block all the
masonry — seals all four dungeons.** Measured: the hero's legal corridor runs straight through the
arch's CROWN on every floor, because top-down, "the crown of the arch" and "the tile you walk through
to reach the mouth" are the same pixels.

So the silhouette splits at the **springing line** (the top of the plate's own lit opening):
- **crown** = occlusion only, never collision. She walks under it.
- **jambs** = the collision. This is what "walk on top of it" always meant.

Legal standing positions on the masonry, before → after:

| floor | before | after |
|---|---|---|
| mistyGrotto | 1136 | **1** |
| sunkenCellar | 224 | **0** |
| whisperingWoodsCave | 1132 | **9** |
| coastalReef | 936 | **538** |

`scripts/bake_dungeon_arch.py` replaces `bake_dungeon_overhead.py` and `patch_dungeon_arch_mask.py`
(both deleted). It refuses to write unless **(a)** every DERIVED overlay pixel sits on blocked ground
and only AUTHORED pixels cover open floor, and **(b)** the deepest cover of open floor is under one
hero clearance — measured 11.4..12.2 px against 16, so at most a 24 px patch of a 64 px sprite is ever
hidden. She passes *behind* stone; she cannot stand still and vanish, which is the failure that
switched the layer off before.

It patches a **pristine snapshot** (`design/act1-dungeons/arch/walk-base/`), never its own output —
the first version ate the throat again on a second run (coastalReef 1134 → 1517 blocked px).

### 2. THE DOUBLE ENTER — DONE, and it was not the router

Build 43's finger-travel fix still holds; the new `rebuild` sequence rebuilds the whole intro panel
BETWEEN touchstart and touchend and the single press still commits.

**Return in the name field was a dead key.** Measured: it left focus on the field, fired no focus
event, did not commit, and silently advanced the frozen TitleScene's row cursor from `name` to
`color`. On a phone: type, press return, nothing happens, keyboard still up, press again.
`nameKeyGuard` now commits, stops the event before the frozen handler sees it, and blurs — which drops
the keyboard and removes the reflow from the next press. It deliberately does NOT start the game.

### 3. THE SEAMS — DONE, and the second cause was arithmetic

| join | before | after |
|---|---|---|
| x=975 | 1.52x plate mean | **1.18x** |
| y=975 | **2.02x** | **1.27x** (1.06x vs local context) |

Two real causes. Exposure drift was provable because the tiles overlap 130 px — band `00|01` was
**18.0 luminance apart**, which no whole-plate grade can touch; tiles are now matched to each other
BEFORE stitching (`scripts/stitch_plate.py`), then joined with the Efros-Freeman cut.
And in `primer()`, `k = GEN/W` was computed from a tile's **width** and applied to the **top** graft —
a tile carrying a band on one side is not square (tile 1,0 is 975x1105), so the neighbour band arrived
**stretched 13% vertically** and the generator reproduced the stretch. Top-band correlation 0.48 → **0.93**.

Chimney and demijohn restored as art via `scripts/graft_town_prop.py` (lifting just the prop, not
swapping tiles — a replacement tile measured 21.32 → 17.35 mean step and would have sunk the plate).
**The chimney went on a roof deliberately**: that disk is 0.0% walkable, its old courtyard spot 89.7%,
so putting it back there would recreate the 08-13 walk-confusion.

### 4. SINGLE ENTRANCE — DONE on the overworld; the two town interiors are NOT

**44 blocker cells; 9376 → 9332 walkable, still ONE region; all eight landmarks reachable.**
Verified in the running game: `ACT 1 LANDMARK BLOCKER VERIFY PASS`, seven landmarks x four sides, one
entrance each, door fires, no resting place on the art. `crystalCave` untouched (act gate) and still
standable on three sides — the control.

No sprite was redrawn. Six already faced their approach. Only coastalReef mismatched, and a
north-facing mouth is **undrawable** in this 3/4 diorama (it would sit behind the hill's own mass), so
the approach preference was reordered S,E,W,N — north is not a drawable facing — moving it to the
**east**, where its arch and tidal spill already point. The door cell did not move.

Blocker tile is **21**: in `OW_BLOCK`, out of `OW_PROP`, out of `OWM_FIELD_OWNED`, invisible inside the
plate. Of `act1-overworld-walk.bin`'s 10,803,776 bytes, exactly **32** changed — all provenance header.

## Act 1, enumerated from the authority — the last handoff was wrong

`LANDMARKS` in `public/act1-world-map.js` is the authority. **Eight** landmarks, total:
towns `greenhollow`, `millbrook`, `portSapphire`; dungeons `sunkenCellar`, `whisperingWoodsCave`,
`coastalReef`, `mistyGrotto`; act gate `crystalCave`.
**`frostfallVillage` / `hauntedVillage` / `stormreachVillage` / `sunkenTempleVillage` /
`twilightVillage` do not exist in this game.** Do not generate art for them.

## OPEN — say these to the owner, do not bury them

1. **The two town interiors (greenhollow, millbrook) are NOT built.** Their ten NPC sheets are done,
   gated, baked, pinned and shipping in build 55 (unused). Everything else is specified in
   `docs/T4B-GREENHOLLOW-MILLBROOK-SPEC.md`. **The hi-fi town is an IFRAME**: `adapter.js` keeps
   `TOWN_IDS = {'portSapphire'}` and swaps in `town.html`; `dq-tiles.js`'s `reskinTown` is procedural
   and never reads the plate. So each town is 8 new runtime files plus one line in `TOWN_IDS`, added
   LAST so a half-built town cannot ship live.
2. **`check_town_finish.py` still FAILS on LAYOUT** — 56.7% of drawn paving lies outside the walkable
   authority (max 55%). **This is pre-existing**: the plate the owner accepted in build 54 was already
   at 55.7% and also failing. The real cause is that the walkable authority is still derived from the
   OLD 1885 painting. Re-deriving now makes it WORSE (walkable 14.07% → 10.89%, IoU 0.729, LAYOUT →
   63.5%) because `paving_mask` is tuned on the old cobble. **The classifier needs retuning first.**
3. **coastalReef's interior still allows 538 px of standing on its jamb.** Cause is level geometry: the
   interior mouth (62,12) is approached from the WEST while the arch asset's opening faces north.
   A proposed two-cell fix (open (62,11), close (61,12)) was **rejected after looking at the art**:
   (62,11) is the arch's painted CROWN, and `rows` drives the render, so opening it would delete the
   crown from the painting. The visible half of the complaint — her sprite drawn ON TOP — is fixed by
   the overhead layer on all four floors.
4. **The demijohn has no foreground-layer entry**, so the hero draws over it rather than passing
   behind. Needs `derive_town_foreground.py`, which still reads the 1885 painting.

## Gotchas earned this session

- **`repin` rewrites dq-tiles' SHA in THREE places** — `scripts/extract_act1_runtime_snapshot.mjs`,
  `src/map-engine/generated/act1RuntimeSnapshot.ts`, `src/map-engine/shippedOverworldBaselineDqReplay.mjs`.
  Leaving them unstaged makes **HEAD broken while every local gate run passes**, because the gate reads
  the working tree. Stash them and the gate fails `dq-tiles hash mismatch`. Always stage all three.
- **`window.__DQ_STICK__` is not an input path the player has.** It moved the hero on seven landmarks
  and, measured, not one pixel on coastalReef's east approach. Verifiers must drive real keys.
- **Two Act 1 dungeons refuse entry on a QUEST, not on geometry** — the bundle's table is
  `{ whisperingWoodsCave: 'owlsLesson', coastalReef: 'drakeCargo' }`, checked in `performTransition`
  AFTER the door fires. A harness that does not seed them reports an enterable dungeon as sealed.
- **`heroTileX/Y` is the sprite CENTRE**, not her feet; and `transitionCooldown` drains one unit per
  300 ms `a1mDoor` ask, so a 2.6 s walk can miss a door with 30 on the clock.
- **Subagent worktrees were created from `main`, 106 commits behind**, on all three dispatches. Each had
  to reset onto `fix/graduated-gpu-heal` first. Check the base before briefing.
- **The NPC generator draws the near-black contour the art direction WITHDREW for this family** — outer
  rings 63/49/63 against a body mean of 108. Five of ten sheets failed the finish gate before it was
  stripped by `scripts/fit_npc_sheet.py`. `check_character_finish.py` measures against the heroine.
- Codex `exec` can hang in a `collab: Wait` loop if the brief reads like a project task; prefix
  "DO THIS YOURSELF, one generation call, do not dispatch a sub-agent".

## Resume here

**Distilled state:** build 55 is on the owner's device with the arch, the double-enter, the seams and
the single-entrance blockers all fixed and verified in the running game. The one incomplete item is the
greenhollow and millbrook town INTERIORS; their NPC art is already done and shipping. Start there,
against `docs/T4B-GREENHOLLOW-MILLBROOK-SPEC.md`, and land T3's stitch pipeline improvements into any
new plate rather than the old one.

| purpose | path | read when |
|---|---|---|
| the two remaining towns, fully specified | `docs/T4B-GREENHOLLOW-MILLBROOK-SPEC.md` | first |
| the arch pipeline + its two invariants | `scripts/bake_dungeon_arch.py` | any arch or dungeon-mouth work |
| arch proof in the running game | `scripts/verify_dungeon_arch.cjs` | after any arch change |
| blockers proof in the running game | `scripts/verify_act1_landmark_blockers.cjs` | after any landmark change |
| the fixed stitch | `scripts/stitch_plate.py` | generating any town plate |
| prop grafting without swapping a tile | `scripts/graft_town_prop.py` | restoring or adding a town prop |
| the NPC keyline strip | `scripts/fit_npc_sheet.py` | any new NPC sheet |

## Kickoff prompt (paste verbatim)

```
edu-rpg, worktree /Users/christopherhachisu/Documents/claudecode/edu-rpg/.claude/worktrees/laughing-mahavira-c9f72b,
branch fix/graduated-gpu-heal, HEAD a6c49ac, gate green (94 pins, 716 payload files), NOT merged to main.
TestFlight 55 is on the owner's device.

READ FIRST: docs/handoffs/2026-08-20-arch-authored-blockers-and-seams.md
THEN: docs/T4B-GREENHOLLOW-MILLBROOK-SPEC.md

Build 55 fixed and verified in the RUNNING GAME: the dungeon arch (authored assets; crown occludes,
jambs block; standing-on-masonry 1136->1, 224->0, 1132->9, 936->538), the double-enter (Return in the
name field was a dead key that silently moved the frozen TitleScene's row cursor), the plate seams
(y=975 2.02x->1.27x; the second cause was a width-derived scale applied to the TOP graft, stretching
the band 13%), and the single-entrance blockers (44 cells, 9332-cell single region, seven landmarks x
four sides all PASS, crystalCave untouched).

THE ONE INCOMPLETE TASK: the greenhollow and millbrook town INTERIORS. Their ten NPC sheets are done,
gated, baked, pinned and already shipping in build 55 -- unused, because the towns do not exist yet.
The hi-fi town is an IFRAME: adapter.js keeps TOWN_IDS = {'portSapphire'} and swaps in town.html;
dq-tiles.js's reskinTown is procedural and never reads the plate. Each town needs 8 new runtime files
(plate 1950, foreground png+json, walkable, town json) plus its id in TOWN_IDS -- added LAST so a
half-built town cannot ship live. Every new runtime asset needs its pin key added BY HAND in
scripts/runtime_baseline.py with zeros, then `npm run repin`, then COUNT ios/App/App/public (716 now).

Act 1 has EXACTLY eight landmarks, from LANDMARKS in public/act1-world-map.js: towns greenhollow,
millbrook, portSapphire; dungeons sunkenCellar, whisperingWoodsCave, coastalReef, mistyGrotto; act gate
crystalCave (NEVER modify). The five villages named in the 2026-08-19 handoff do not exist.

THREE OPEN ITEMS, all documented in the handoff, none of them regressions:
  - check_town_finish.py FAILS on LAYOUT at 56.7% (max 55%). PRE-EXISTING: the plate the owner accepted
    was already 55.7%. The walkable authority is still derived from the OLD 1885 painting; re-deriving
    now makes it worse (LAYOUT 63.5%) because paving_mask is tuned on the old cobble. Retune first.
  - coastalReef's interior keeps 538 px of standing on its jamb: its mouth is approached from the WEST
    while the arch art faces north. The obvious two-cell fix was rejected after looking at the art --
    (62,11) is the painted CROWN and `rows` drives the render, so opening it deletes the crown.
  - the demijohn has no foreground-layer entry, so the hero draws over it instead of behind.

THE TILE RULE, arithmetic and not negotiable: the image tool ALWAYS returns 1254 px and a plate must be
1950 for an exact 3x device upscale, so one image must be scaled UP 1.55x and upscaling destroys
sharpness (20.64 -> 13.97 mean step; downscaling gives 25.67). Generate every plate as 2x2 tiles,
grafting each neighbour band from RAW generator output. Judge with
scripts/check_town_finish.py <plate> --walkable <town>-walkable.json. NEVER loosen the SOFT band.

HARD-WON RULES: `repin` rewrites dq-tiles' SHA in THREE files (extract_act1_runtime_snapshot.mjs,
act1RuntimeSnapshot.ts, shippedOverworldBaselineDqReplay.mjs) -- leaving them unstaged makes HEAD broken
while every local gate run passes. window.__DQ_STICK__ is NOT an input path the player has; drive real
keys. whisperingWoodsCave and coastalReef refuse entry on a QUEST (owlsLesson, drakeCargo) checked
AFTER the door fires -- seed them or a working dungeon reads as sealed. Subagent worktrees came off
main, 106 commits behind, on all three dispatches -- check the base before briefing. Serve dist with
`python3 -m http.server` from dist/, NOT `serve -s`. Codex's -i is variadic -- brief on stdin -- and it
writes next to the INPUT; keep it out of docs/handoffs/. Ship order: ./scripts/ship-ios.sh ->
python3 /private/tmp/qok/asc.py -> assign.py <n> -> submit.py <n>; gate is externalBuildState ==
IN_BETA_TESTING.
```
