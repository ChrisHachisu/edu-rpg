# Edu-RPG — GAME-FEEL.md

Design source of truth for UI and animation. Locked captures live in
`edu-rpg/design/feel-refs/` or beside a milestone-specific runtime mockup when that
mockup has not yet been integrated into the shipped artifact.

## Timing tokens

| Token | Value | Notes |
|---|---|---|
| `input.feedback` | under 80ms first response | analog joystick, keyboard step, button press, menu cursor |
| `selection.travel` | 120ms `cubic-bezier(.34,1.56,.64,1)` | a selection cursor, plate, caret or highlight MOVING between adjacent items in any menu — battle commands, inventory rows, settings rows, shop lists, title menu. Overshoots and settles; never a dead stop. |
| `micro.transition` | 200ms ease-out / ease-in | popups, dialog, inventory |
| `screen.transition` | 300ms ease-in-out | map, dungeon, and battle transitions |
| `reward.celebration` | 900ms staged | level-up, quest complete, boss kill |
| `ambient.loop` | 2–3s sine | idle sprites, water, torches, foliage |

`selection.travel` was added 2026-08-07 by owner decision. Before it, a moving menu
cursor had no class of its own: the nearest was `micro.transition`, which is written
for popups and dialogs, and 200ms reads sluggish on a cursor the player moves every
turn. The owner chose 120ms explicitly over the existing 200ms. It is a token, not a
battle-screen detail — every menu cursor in the game is meant to use it, and feature
code references the token (`--select-travel` in `public/ui-overhaul.css`), never the
number.

## Locked reference ledger

| Element | Class | Duration | Easing | Ref capture | Locked |
|---|---|---|---|---|---|
| Battle command selector "Gilded Rail" — plate travel | `selection.travel` | 120ms (measured 120ms, overshoot peaks 8.6px / 9.7% at 69ms, settles by ~117ms) | `cubic-bezier(.34,1.56,.64,1)` | `design/feel-refs/battle-command-rail-locked.mp4` (+ `.gif`, `-ja.mp4`) | 2026-08-07, owner approved (Variant A of `design/mockups/battle-command-selector.html`); the one playful easing on the battle screen. **Amended 2026-08-08:** the plate is now a KEYBOARD/GAMEPAD cursor and is hidden on touch — the travel itself is unchanged and still plays between arrow presses |
| Battle command tap response — press wash | `input.feedback` | press-in **not animated** (class on `pointerdown`, painted on the next frame; measured on device as a single-frame change with no intermediate value); release **70ms** | none in; `cubic-bezier(.22,.80,.36,1)` out (`--ease-out`) | `design/feel-refs/battle-commands-locked.gif` | 2026-08-08, owner approved (Variant A of `design/mockups/battle-commands/index.html`) plus one change: the Attack sword renders `--ruby` **red**. Background only: `rgba(201,169,97,.26)` on an unselected cell, `--gold2` on the plate when the selected cell is the one pressed |
| Act 1 high-fidelity world traversal G1 | continuous movement + ambient | continuous / 2–3s ambience | fractional camera smoothing / sine | `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/g1-port-to-reef.mp4` | 2026-07-15, owner approved direction with hero-scale calibration noted |
| Act 1 heroine field walk G1 | four-direction walk cycle | 95ms per pose (`0 → A → 0 → B`) | linear frame cadence + subpixel world motion | `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/hero-g1/evidence/hero-four-direction-in-world.mp4` | 2026-07-15, owner approved identity and 36px display scale |
| Act 1 heroine field walk G3 | cardinal-only runtime walk over the retained eight-row G3 sheet + restrained crystal equipment accents | 125ms per pose (`0 → A → 0 → B`) | stable dominant-axis facing with hysteresis + fractional 360-degree world motion and boundary sliding | `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/full-world-traversal-r3/evidence/cardinal-facing-125ms-852x1846.webm` | 2026-07-16, owner locked down/left/up/right runtime rows, 125ms candidate, 64px native / 36-world-pixel display, and analog steering |
| Overworld minimap, variant B "Relief" | static field HUD chrome — one baked window blit, fixed-size landmark pins, hero reticle | 0.034ms per draw (was 2.27ms); existing 220ms redraw throttle unchanged | n/a — static render; `imageSmoothingQuality: 'high'` on the blit | `design/feel-refs/overworld-minimap-relief-locked.png`, with `design/feel-refs/overworld-minimap-relief-before-after.png` | 2026-08-07, owner picked variant B of `design/mockups/overworld-minimap-semantic.html`: flat land, no road network, "tells you where you are, not where to go" |

The minimap is not a recoloured tile lattice. `scripts/bake_overworld_minimap.py` bakes
the whole 320x400 world once at 6 px/cell from `generateOverworldMap(320,400)` with the
Act 1 snapshot overrides applied — the map the game actually collides with — and refuses
to write unless all 128,000 cell centres carry the grid's own class, so the picture cannot
disagree with collision. Brightness encodes walkability: every walkable class renders
lighter than every blocker and water is darkest, asserted per pixel after the coastal-shelf
and canopy modulations. Landmarks are fixed-size pins taken from the grid's own landmark
tiles, never from `semantic-maps/landmark-roster.json`, which places them on plain grass.
The hero is a reticle rather than a pin because the flat square it replaced vanished
entirely against a pair of haunted portals.

## The battle command bar has NO resting selection (2026-08-08)

Until 2026-08-08 the gold plate sat on Attack from the moment the menu opened, so every turn
looked half-taken before the player had done anything, and a tap only teleported the plate: the
button the finger actually landed on said nothing back. The owner approved variant A of
`design/mockups/battle-commands/index.html`, which changes three things and is now live:

1. **Nothing carries the plate at rest.** The plate is a keyboard/gamepad cursor, shown on arrow
   or confirm keys and hidden again by the next touch — last input device wins. Keyboard
   navigation is untouched; `paintRailSelection()` applies the flag without rebuilding the strip,
   because rebuilding it would land the plate already at its destination and kill the 120ms travel.
2. **Each command answers its own tap**, on `pointerdown`, with a background-only gold wash.
3. **There is no release animation, and there cannot be one.** `fireTap()` sets `lastSig = null`
   and calls `tick()` synchronously on `pointerup`, which rewrites `stage.innerHTML`, and all four
   commands change the battle phase — the pressed node is always gone before a release could play.
   The 70ms ease-out in the stylesheet is real and correct, but it is reachable only on a gesture
   that ends without committing. It was therefore measured off the shipped `public/ui-overhaul.css`
   in rendered pixels (alpha .26 → .09 at 15ms → .027 at 31ms → .004 at 47ms → 0 by 66ms, matching
   `cubic-bezier(.22,.80,.36,1)`), while the device recording proves the press-in and the absence
   of any second effect.

The **Attack glyph is red**, `--ruby #a8564e`, paired with Defend's `--sky #6f8fa8`. It was already
that value in `BATTLE_ACT`, but nobody had ever seen it: Attack wore the plate in every capture the
repo holds, and a plated glyph inverts to charcoal. Removing the resting selection is what put the
red on screen. Contrast, all measured: red on the opaque bar **3.53:1** (the dimmest of the four
tints — sky 5.30, emerald 5.90, ink-soft 6.77 — but clear of the 3:1 floor for a graphical object);
charcoal on the gold plate **8.02:1**. Red on the gold plate would be **2.27:1**, so the plated
sword stays charcoal — do not "finish the job" by tinting it red. While the wash is held the whole
cell loses contrast (glyphs 2.13 / 3.19 / 3.56 / 4.08:1, labels 4.08:1); that is inherent to a
translucent background wash and was accepted with the variant, not discovered afterwards.

The Gilded Rail bar is OPAQUE `--bg3`, and the mockup's `#ffffff0a` wash is superseded — do not
"restore" it. The wash let the battle art through, so an unselected label sat on the biome:
measured 1.78–2.30:1 on the shipped forest, where the coloured blocks it replaced had accidentally
guaranteed contrast by giving every label a solid backing. Owner chose the solid bar on 2026-08-07
over brightening the text (a bright biome can swallow bright text too) and over a per-label pad
(busier). With the bar opaque the labels measure **6.67–6.69:1 unselected and 8.02:1 selected,
identical on all seven backgrounds tested** — desert, frozen, canyon, coast, grass_plains,
boss_celestial_guardian and forest — background-independent by construction, which is the whole
point of the choice. `--bg3` because the rest of the chrome on that screen is already that exact
colour (`.enemy-card` `#15161ce0`, `.msg` and `.pbar` `#15161ce6`). The motion is unaffected and
was re-measured after the change.

The overworld runtime accepts continuous normalized joystick vectors and slides
naturally along art-authored walkable-region boundaries. Broad ground such as
plains, snowfields, desert flats, and settlement clearings remains freely
explorable; narrow trails, bridges, and passes tighten only where the painting
does. The route graph remains semantic rather than a movement rail. Animation
selects only the four cardinal G3 rows using dominant-axis hysteresis, so
diagonal steering stays smooth without diagonal-row flicker. The cross-act
method and acceptance gate are locked in `design/OVERWORLD-MOVEMENT-BOUNDARIES.md`.
