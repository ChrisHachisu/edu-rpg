# Edu-RPG — GAME-FEEL.md

Design source of truth for UI and animation. Locked captures live in
`edu-rpg/design/feel-refs/` or beside a milestone-specific runtime mockup when that
mockup has not yet been integrated into the shipped artifact.

## Timing tokens

| Token | Value | Notes |
|---|---|---|
| `input.feedback` | under 80ms first response | analog joystick, keyboard step, button press, menu cursor |
| `micro.transition` | 200ms ease-out / ease-in | popups, dialog, inventory |
| `screen.transition` | 300ms ease-in-out | map, dungeon, and battle transitions |
| `reward.celebration` | 900ms staged | level-up, quest complete, boss kill |
| `ambient.loop` | 2–3s sine | idle sprites, water, torches, foliage |

## Locked reference ledger

| Element | Class | Duration | Easing | Ref capture | Locked |
|---|---|---|---|---|---|
| Act 1 high-fidelity world traversal G1 | continuous movement + ambient | continuous / 2–3s ambience | fractional camera smoothing / sine | `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/g1-port-to-reef.mp4` | 2026-07-15, owner approved direction with hero-scale calibration noted |
| Act 1 heroine field walk G1 | four-direction walk cycle | 95ms per pose (`0 → A → 0 → B`) | linear frame cadence + subpixel world motion | `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/hero-g1/evidence/hero-four-direction-in-world.mp4` | 2026-07-15, owner approved identity and 36px display scale |
| Act 1 heroine field walk G3 | cardinal-only runtime walk over the retained eight-row G3 sheet + restrained crystal equipment accents | 125ms per pose (`0 → A → 0 → B`) | stable dominant-axis facing with hysteresis + fractional 360-degree world motion and boundary sliding | `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/full-world-traversal-r3/evidence/cardinal-facing-125ms-852x1846.webm` | 2026-07-16, owner locked down/left/up/right runtime rows, 125ms candidate, 64px native / 36-world-pixel display, and analog steering |

The overworld runtime accepts continuous normalized joystick vectors and slides
naturally along art-authored walkable-region boundaries. Broad ground such as
plains, snowfields, desert flats, and settlement clearings remains freely
explorable; narrow trails, bridges, and passes tighten only where the painting
does. The route graph remains semantic rather than a movement rail. Animation
selects only the four cardinal G3 rows using dominant-axis hysteresis, so
diagonal steering stays smooth without diagonal-row flicker. The cross-act
method and acceptance gate are locked in `design/OVERWORLD-MOVEMENT-BOUNDARIES.md`.
