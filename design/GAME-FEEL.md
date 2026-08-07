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
| Battle command selector "Gilded Rail" — plate travel | `selection.travel` | 120ms (measured 120ms, overshoot peaks 8.6px / 9.7% at 69ms, settles by ~117ms) | `cubic-bezier(.34,1.56,.64,1)` | `design/feel-refs/battle-command-rail-locked.mp4` (+ `.gif`, `-ja.mp4`) | 2026-08-07, owner approved (Variant A of `design/mockups/battle-command-selector.html`); the one playful easing on the battle screen |
| Act 1 high-fidelity world traversal G1 | continuous movement + ambient | continuous / 2–3s ambience | fractional camera smoothing / sine | `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/g1-port-to-reef.mp4` | 2026-07-15, owner approved direction with hero-scale calibration noted |
| Act 1 heroine field walk G1 | four-direction walk cycle | 95ms per pose (`0 → A → 0 → B`) | linear frame cadence + subpixel world motion | `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/hero-g1/evidence/hero-four-direction-in-world.mp4` | 2026-07-15, owner approved identity and 36px display scale |
| Act 1 heroine field walk G3 | cardinal-only runtime walk over the retained eight-row G3 sheet + restrained crystal equipment accents | 125ms per pose (`0 → A → 0 → B`) | stable dominant-axis facing with hysteresis + fractional 360-degree world motion and boundary sliding | `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/full-world-traversal-r3/evidence/cardinal-facing-125ms-852x1846.webm` | 2026-07-16, owner locked down/left/up/right runtime rows, 125ms candidate, 64px native / 36-world-pixel display, and analog steering |

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
