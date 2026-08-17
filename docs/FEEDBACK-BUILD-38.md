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

## Sequencing note

S1-S4 are contained code fixes in `public/ui-overhaul.js`. S5, D1, O2 are contained too. D2, O1, T1
and T2 are asset commissions with real cost and should each carry a measured brief per
`docs/ART-GENERATION-PREFLIGHT.md`.
