# Owner device feedback — TestFlight build 38 (2026-08-17)

Verbatim, grouped as he sent it. Nothing here is started unless a line says so.
Status values: OPEN / IN PROGRESS / FIXED `<sha>` / NEEDS OWNER.

## Initial screen

| # | Verbatim | Kind | Status |
|---|---|---|---|
| S1 | "after tapping the back button on the character build screen and returning to the initial landing screen all buttons stop working" | **blocker**, code | **FIXED** — root cause was a misspelled method (`ts.drawTitle`, which does not exist; the scene has `drawTitleScreen`) inside an empty `try/catch`, so the title menu was never rebuilt and every item kept a null `action` that both the overlay lookup and the scene's own `confirm()` dispatch on |
| S2 | "when the characters load on the character build screen, a generic pixel player shows up, but i'd rather see a loading spinner than this" | code | **FIXED** — `heroSvg()` retired, `heroSpinner()` in both pending-art paths |
| S3 | "the quiz difficulty selector needs to be a scrolling wheel list rather than a tappable list (show the full text rather than generic numbers and letters and the full text below). this way everything should fit in one screen." | UI redesign | **FIXED** build 41 — scroll-snapped wheel, full grade name per row, caption dropped. The third clause needed a layout pass: measured 828 px against the app's ~763, now **758 = FITS** (portrait 120→88, thumbs 56→48, paddings and gaps tightened). Two simulator-only bugs fixed: `di` had to leave the render signature (a rebuild reset scrollTop under the finger) and the selection band had to leave the scroll container (an absolute child scrolls with the content) |
| S4 | "the screen starts out by the name field selected but this is not optimal. i don't want anything preselected" | code | **FIXED** — the focused input was the bundle's own hidden one, not the overlay's; blurred on paint |
| S5 | "darkfang grotto's entrance (inside of the dungeon) is unnatural (the player can walk on top of the arch above the entrance)" | collision | **OPEN — needs ART, not collision.** Measured: `mistyGrotto-f1-props.png` bakes the arch onto cell (40,26), and that cell is the ONLY approach to the mouth at (40,27) — rock sits at (39,27), (41,27), (40,28) and (40,25). Blocking the arch in `-walk.png` makes the exit unreachable. The clean fix is re-baking the mouth one cell up so its arch lands in the rock above.<br>**`e07947a` claimed to overturn this and was WRONG — reverted in `c0329fe`, see A1 below.** This original reading was right all along; the "correction" rested on a point-connectivity test that ignores the hero's body. Status returns to OPEN/needs-art |

## Dungeon

| # | Verbatim | Kind | Status |
|---|---|---|---|
| D1 | "i want the entrance teleport crystal more embedded in the wall. essentially the interaction point should be flush to the wall surface you normally bump into" | geometry | OPEN |
| D2 | "the boss asset looks like a background and not like an asset, so either a redesign is needed or the resolution needs to be fixed. also the hero gets overlayed on top of the boss, which looks very weird. (i realized after defeating a boss that it actually is partially a background, so we need this to fully be a sprite and have an actual floor underneath it and make the boss disappear after defeating it as well)" | **art + rendering**, large | OPEN |

D2 status: (b) **FIXED** build 42 — `a1dBossSort` hides the baked mark and depth-sorts a live copy around the hero's soles (10.5 above / 9.5 below). (c) was **already done** (`a1dBossVanish`). (a) still needs the boss cut out of the baked plate — art.

D2 is three requirements, not one: (a) the boss is a real sprite over real floor, not part of the
baked background; (b) depth-sort it against the hero so she never draws on top of it; (c) it
disappears on defeat.

## Overworld

| # | Verbatim | Kind | Status |
|---|---|---|---|
| O1 | "lets have one entrance for each town and dungeon each and show an unpassable structure around it. please get an asset redesign from codex if necessary" | art + collision | OPEN |
| O2 | "the darkfang grotto asset is sometimes rendered on top of the forrest and sometimes partially below it. it should always be rendered on top" | render order | **FIXED** — landmark depth 6 → 9.6, above the canopy's 9.5 and below the hero's 10. The "sometimes on top" was the frames before that chunk's canopy texture had landed: a load race, not a sorting bug |

## Towns

| # | Verbatim | Kind | Status |
|---|---|---|---|
| T1 | "port sapphire's touch up is not working visually. i think we need to redo the town from scratch with clear instructions on making it clear where players can walk and a place for the shop and the healer. the resolution is currently fuzzy on the app and i can clearly tell that the texture is different from the hero so this needs to be matched in the updated design." | **art commission**, large | OPEN |
| T2 | "please regenerate the first town with these rules and the boundary rules we decided previously and also generate all characters and place them all in the town as well" | **art commission**, large | OPEN |

> [!danger] T1's stated cause DID NOT SURVIVE A UNIT CHECK — read before pricing this
> The re-bake was justified by "the town is 1.66x lower resolution than the overworld". That ratio
> compares art px per TOWN cell (16 world px) against art px per OVERWORLD tile (48 world px). In one
> unit — source px per world px — the town is **1.812**, the hero **1.778**, the overworld **1.000**.
> The town already matches the hero to within 2% and is 1.8x DENSER than the overworld. A
> higher-density re-bake is therefore **not established** as the fix for the softness he reports.
> His observation stands and is not in doubt; its CAUSE is now unidentified. The style half ("the
> texture is different from the hero" — painterly vs faux-pixel) is real and a redesign does fix it.
> **Measure the softness on device against the overworld before committing to a re-bake.**
> Corrected at source in `docs/GROUND-TRUTH.md`, 2026-08-17.

~~T1 confirms a measurement already on record and previously flagged to him as wanting a re-bake:~~
`portSapphire-screen-v5-graded.png` is 1885x1885 over a 65-cell town = **29 art px per cell**
against the overworld's **48**, i.e. **1.66x lower resolution**. Two runtime-side fixes were tried
and neither could close it (`image-rendering: pixelated`, raising the town dpr cap 2 -> 3). "the
texture is different from the hero" is that same gap seen directly. **This is now commissioned.**
T2's boundary rules WERE located — see `claude_brain/04-Learnings/learning-20260817-town-walkable-derived-from-painted-art.md`.
Owner decisions since: Port Sapphire is **FENCED** again, **ONE entrance** shared by the overworld
sprite and the town screen, and NPCs get **4 directions** so they turn to face the hero (retiring the
down-facing-only and approach-from-south rules).

## Later feedback (same device, after build 38)

| # | Verbatim | Kind | Status |
|---|---|---|---|
| H1 | "the collapsed map icon needs to be a map icon on the overworld. currently it is not" | UI | **FIXED** — it was the glyph `▧` (U+25A7, a hatched square). Now a folded-map SVG in the compass's hairline gold, drawn rather than typed so it cannot depend on the device's font substitution. Verified in WebKit at the 40px collapsed size; owner confirmed "map icon is good" |

## Build 43/44 feedback (same device, 2026-08-17 evening)

| # | Verbatim | Kind | Status |
|---|---|---|---|
| A1 | "the arch in the dungeon entrance now blocks the player from entering. why dont we just remove the arch blocking the entrance?" | **blocker**, regression | **FIXED `c0329fe`** — a regression I introduced in `e07947a`. Its verification asked `ndimage.label` whether the mouth stayed CONNECTED, which is a question about a **zero-width point**; the runtime's `a1mFree` rejects any sole position with under `A1M_FOOT..+LEAN` = **12–16 world px** of chamfer clearance, so a 10 px throat between the arch's shoulders is "connected" and impassable. Replicating `a1mFree` against the real masks: `coastalReef-f1`, `mistyGrotto-f1`, `sunkenCellar-f1` all went **reachable=True → False**. All three shipped unenterable in 43/44. The floor the patcher REFUSED (`whisperingWoodsCave-f1`) is the only one that stayed reachable — it refused the safe floor and broke the three it accepted. Masks reverted; `patch_dungeon_arch_mask.py` now erodes by FOOT+LEAN and tests connectivity to the floor's bulk component, and **with that test it refuses all four** — no arch-blocking keeps a mouth passable, so S5 is art |
| A2 | "the age selector wheel does not naturally allow the user to select the wanted age. when scrolling, the age does not land on the age that is currently in the center but it snapps back to the previously selected one. the behavior is incorrect and still very snappy" | UI | **FIX SHIPPED IN 45, UNVERIFIED ON DEVICE.** There is no separate age control: the grade wheel (`#qok-gwheel`, rows "K / 1st Grade / …") IS the difficulty wheel, and it is the only scroll-snap wheel in the repo. `4a60b06` (`mandatory`→`proximity` snap + settle-on-scrollTop-idle instead of on last scroll EVENT) targets exactly the snap-back he describes, and it **was not in any build he had tested** — 43 predates it. Needs his verdict on 45 before any further change |
| A3 | "on the hero build screen, the text field acts funny and the player needs to tap check twice to commit the name" | UI | **FIXED `c0329fe`** — `pointerGuard` required the same element under the finger at pointerdown AND pointerup. Tapping Start while the name input holds focus reflows the page between those events (blur → iOS keyboard collapses → visual viewport grows → panel re-laid out), so the button is no longer under the finger at pointerup, the identity test fails and `fireTap` never runs; the first tap only dismissed the keyboard. A fresh-rect re-test does not help because the element genuinely MOVES. A tap is now measured by **finger travel** (`TAP_SLOP` 12 css px), which no reflow can perturb. Drag-off-to-cancel preserved |
| A4 | "the blue screen bug still surfaces time after time. especially when walking between overworld tiles (probably)" + **the decisive follow-up: "not a regression but an edge case that has been in the game... when the game gets overloaded the map stops loading and stays blue (movement and game play is fine). we just need to maybe harden the loading check?"** | **blocker**, loading | **FIXED `8421ef4`, build 46 — and the owner's reading was right where mine was wrong.** *"movement and game play is fine"* is the whole diagnosis: a lost GL context takes the hero, props and UI with it, so a live renderer with missing terrain is a **LOADING failure, not a context loss** — which is why years of GPU-memory fixes never closed it. The loader had **no retry at all**: `a1aLoadLayerImg`'s `im.onerror` was an empty function commented *"a missing layer degrades, never wedges"*, and it degrades **permanently** (`rec[k]` unset → `a1aArtAt` false → `a1aRects` filters that chunk out of every later window → flat blue for the session); and `a1aChunkRec` issued loads **only on the frame it created the record**, so a missing layer was never re-requested however often the window rebuilt. One transient failure under memory pressure — exactly "when the game gets overloaded", where `createImageBitmap` *and* an `Image` decode can both fail — wedged that chunk for good. The GPU watchdog structurally could not save it: the cheap pass re-uploads from decoded images and there is none, the deep pass is capped at `A1AW_MAX=8` per session, and the progress veto reads *other* chunks succeeding as proof of health. Hence the documented cure being a reload, per `A1AW`'s own comment. Fixed at the loader: failures recorded with linear back-off, in-flight marked so the sweep cannot double-issue, re-asked both per window rebuild **and on the watchdog's tick** (`a1aRetryWindow` — the terrain path is gated on the window *changing*, so otherwise recovery would require him to walk), bounded at 6 tries per residency so a real 404 goes quiet as before, and `dq.cost().reloads` proves it fired. Logic verified by test: back-off honoured, no re-ask of landed or manifest-absent layers, no double-issue, stops at the cap, success clears state.<br>*Superseded reading, kept as the record:*&nbsp;**BLOCKED ON TELEMETRY.** The memory work already in the tree is sound and none of it regressed: `A1A_MAX_CHUNKS=12` is enforced every window rebuild (`a1aRects`), `a1aDropChunkGpu` really does `textures.remove()`, and the `owImgs`/`specImgs` per-tile leak `d747f8c` fixed is still fixed. Both `d0e7db0` guards are intact (progress veto on `COST.tex`, and a real `gl.isContextLost()` check rather than an inferred one). **The reason this cannot be diagnosed from build 43 is P1: the diagnostic panel was DEAD 08-15→08-17, i.e. across builds 40–43 — the exact builds he is reporting on.** So there is no `spr live/want` or `GLLOST` evidence, and it is not even established that these are genuine context losses. Build 45 carries the panel fix (`1b65c5b`). The ring buffer records into `localStorage['edu-rpg-lf2']` regardless of panel visibility, so the next incident on 45 leaves evidence either way. Next step is READ THAT, not another memory guess — `f699e4a` already shows what guessing costs ("the self-heal was curing the blue screen by starving the device") |
| A5 | v8 town plate: "we need something in between. the artwork does not match everything else in the game and the game is not build on squares so it needs to look more natural. in terms of, sharpness it looks good though" | art | **OPEN — direction now pinned, see T1.** Sharpness ACCEPTED; the square grid layout rejected. Target = v8's hard-edged finish on the shipping plate's ORGANIC layout |

Found while verifying H1 and the render chain, not reported by anyone:

| # | Defect | Status |
|---|---|---|
| P1 | **The live diagnostic panel had been dead since 2026-08-15** — not off, DEAD. `var DEBUG_UI` sat inside the recovery IIFE while the panel reads it from a SIBLING IIFE, so `paint()` threw a ReferenceError on every 500 ms tick from the moment the map became playable. `localStorage.setItem('edu-rpg-debug','1')` could not have brought it back. Silent because the throw leaves the rAF loop intact (the next frame is requested first) and nothing else depends on `paint()` | **FIXED** — flag hoisted to script scope |

## Sequencing note

S1-S4 are contained code fixes in `public/ui-overhaul.js`. S5, D1, O2 are contained too. D2, O1, T1
and T2 are asset commissions with real cost and should each carry a measured brief per
`docs/ART-GENERATION-PREFLIGHT.md`.

## T1 follow-up — the fuzziness is very likely GLOBAL, not the town's art

Owner, 2026-08-17: *"the town crispness definitely needs close examination because it definitely
looks too off. i suspect the overworld and dungeons are the same fuzziness as well but i think they
are just harder to notice."*

That hypothesis is consistent with the density correction above (the town's source art already
matches the hero to within 2%), and a first measurement supports it.

### SETTLED 2026-08-17 — the town is a NON-INTEGER upscale; the canvas theory below was refuted

**READ THIS FIRST; the section under it is kept only because its reasoning is the trap.**

| surface | art px/world px | device px/world px | upscale | 3x3 device blocks uniform |
|---|---|---|---|---|
| overworld / dungeon (Phaser canvas) | ~1.0 | 3.0 | exactly **3x** | **100%** |
| Port Sapphire (its own iframe canvas) | 1.8125 | 5.625 | **3.1034x** | **14%** |

The town's canvas is already at the device's full ratio and point-samples the plate, so nothing is
blurring it. Its upscale is simply not a whole number: at 3.1034x some art pixels land on 3 device
pixels and others on 4, irregularly, and that irregularity is the fuzz. The overworld lands on an
exact 3x and reads as a clean coarse grid. Same magnification, different KIND — which is why he
could tell the town from the hero.

**The 1/dpr canvas theory below was tested and REFUTED.** Rendering the Phaser canvas at 1170x2031
with the camera zoomed to match produced a **pixel-identical** overworld (laplacian variance 647.1
vs 645.5; 100% uniform 3x3 blocks in both) because the terrain art is only ~1 px per world px. It
would have cost 9x the fragment work for no visible change, and the owner caught it from the
screenshots before it shipped: *"i am seeing the screen shots but i do not see any visible
difference."* He was right.

**Both fixes approved by the owner, 2026-08-17 — "do both, camera snap now and the 1950 rebake":**
1. **Camera snap (shipped):** round the art-to-device pixel ratio to a whole number, derive the zoom
   from it. 14% -> **100%** uniform blocks, detail unchanged (335.8 -> 329.3). Costs 3.4% more town
   on screen and 3.4% slower on-screen movement. `public/act1-hifi/town.html`.
2. **Re-bake the plate at 1950x1950** = 1.875 art px per world px, only **3.4% more pixels than
   today's 1885**, which lands on an exact 3x with no camera change and makes the snap a no-op.
   Authored hard-edged for a 3x grid, this closes the STYLE gap too. 1:1 device pixels would need
   5850x5850 (~137 MB decoded) and is not viable here.

**T1 IS THEREFORE COMMISSIONABLE, and my earlier "a re-bake fixes nothing" was wrong.** What is true
is the narrower claim: a denser re-bake alone, or a bigger canvas alone, changes nothing — the town
needed its ratio made whole, and the plate density is what makes it whole permanently.

---

### SUPERSEDED — the 1/dpr canvas theory (kept as the trap)

**MEASURED IN REAL WEBKIT** — the shipped payload running in Mobile Safari on the iPhone 13
simulator (4B05EF44), the same engine and the same device profile as his WKWebView build, read off
the live diagnostic panel in the overworld:

| quantity | value |
|---|---|
| device pixel ratio | **3** |
| viewport | 390 x 699 CSS px |
| canvas backing store (`canvas.width/height`) | **390 x 677** |
| canvas CSS box (`getBoundingClientRect`) | 390 x 677 |
| device px per rendered px | **3.00 across, 3.00 down** |
| Phaser scale mode / game zoom / camera zoom | 5 = `RESIZE` / 1 / 1 |
| sampled chunk texture `scaleMode` | 1 = NEAREST (`a1a_base_*`), `pixelArt` on, `roundPixels` on |
| canvas computed `image-rendering` | `pixelated` |

**The backing store equals the viewport in CSS PIXELS, so the game renders one pixel for every 3x3
device pixels — one ninth of the screen's resolution.** `Scale.RESIZE` keeps the canvas in CSS px by
design (`public/ui-overhaul.js` says so at the field-HUD comment: it is why the HUD was moved to
DOM), and nothing multiplies it back up by dpr. This is uniform, both axes, and it applies to the
town, the overworld and the dungeon identically — exactly the owner's read: *"i suspect the
overworld and dungeons are the same fuzziness as well but i think they are just harder to notice."*
It is easier to see on the town's fine architecture than on organic grass, but it is one defect.

**The earlier "1.5x short / backing store 768" figure is RETIRED.** The full-viewport layout is
behind `@media (pointer: coarse), (hover: none)`; a mouse-driven browser pane matches neither, so it
measured `#game-container { width: 768px }` — the DESKTOP frame — overflowing a 390 px viewport.
That is the 768-inside-390 mismatch the last write-up could not reconcile. The pane was reading a
layout the phone never takes.

**BLOCKY vs FUZZY — closed, and the obvious suspect was wrong.** The stylesheet says
`image-rendering: pixelated; image-rendering: crisp-edges;` and the last declaration wins wherever
it parses. Blink drops `crisp-edges`; **WebKit accepts it** (`CSS.supports` = true on the device), so
the cascade genuinely differs by engine. But a side-by-side upscale of a 17x3 checkerboard on the
simulator shows `crisp-edges` and `pixelated` rendering **identically hard-edged** — only `auto` is
blurry — and in the app itself the computed value is `pixelated` anyway (a later, more specific rule
wins). So the upscale IS nearest-neighbour. The softness is not a smoothing filter; it is that a
1/3-resolution image has one ninth of the detail, which on painterly art reads as fuzz rather than
as visible blocks.

**WHAT THIS MEANS FOR THE MONEY.** The shortfall is global, so a higher-density re-bake of the town
buys nothing on its own — the new art is downsampled by the same factor before it reaches the
screen. **T1/T2 must not be commissioned on RESOLUTION grounds.** The STYLE half of T1 (painterly
town vs the hero's crisp faux-pixel finish) is a separate, real problem that a redesign does fix,
and it is unaffected by any of this.

**THE FIX IS NOT FREE, AND IS NOT TAKEN HERE.** Rendering at device resolution means ~9x the
fragment work and ~9x the render-target memory on a device whose whole recorded history in this repo
is GPU context loss, WebContent kills and ~190-228 MB of chunk residency. That is a deliberate,
measured piece of work with its own A/B, not a one-line scale change.

Probes: the live panel's `rc` lines (`index.html`); the engine comparison was a standalone page
served to the simulator, not a repo harness.
