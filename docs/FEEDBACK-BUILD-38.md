# Owner device feedback — TestFlight build 38 (2026-08-17)

Verbatim, grouped as he sent it. Nothing here is started unless a line says so.
Status values: OPEN / IN PROGRESS / FIXED `<sha>` / NEEDS OWNER.

## Initial screen

| # | Verbatim | Kind | Status |
|---|---|---|---|
| S1 | "after tapping the back button on the character build screen and returning to the initial landing screen all buttons stop working" | **blocker**, code | **FIXED** — root cause was a misspelled method (`ts.drawTitle`, which does not exist; the scene has `drawTitleScreen`) inside an empty `try/catch`, so the title menu was never rebuilt and every item kept a null `action` that both the overlay lookup and the scene's own `confirm()` dispatch on |
| S2 | "when the characters load on the character build screen, a generic pixel player shows up, but i'd rather see a loading spinner than this" | code | **FIXED** — `heroSvg()` retired, `heroSpinner()` in both pending-art paths |
| S3 | "the quiz difficulty selector needs to be a scrolling wheel list rather than a tappable list (show the full text rather than generic numbers and letters and the full text below). this way everything should fit in one screen." | UI redesign | OPEN |
| S4 | "the screen starts out by the name field selected but this is not optimal. i don't want anything preselected" | code | **FIXED** — the focused input was the bundle's own hidden one, not the overlay's; blurred on paint |
| S5 | "darkfang grotto's entrance (inside of the dungeon) is unnatural (the player can walk on top of the arch above the entrance)" | collision | OPEN |

## Dungeon

| # | Verbatim | Kind | Status |
|---|---|---|---|
| D1 | "i want the entrance teleport crystal more embedded in the wall. essentially the interaction point should be flush to the wall surface you normally bump into" | geometry | OPEN |
| D2 | "the boss asset looks like a background and not like an asset, so either a redesign is needed or the resolution needs to be fixed. also the hero gets overlayed on top of the boss, which looks very weird. (i realized after defeating a boss that it actually is partially a background, so we need this to fully be a sprite and have an actual floor underneath it and make the boss disappear after defeating it as well)" | **art + rendering**, large | OPEN |

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
