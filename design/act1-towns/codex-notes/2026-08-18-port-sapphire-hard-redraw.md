---
date: 2026-08-18
type: handoff
project: edu-rpg
milestone: port-sapphire-hard-redraw
status: active
---

# Port Sapphire hard redraw

## Immutable contract

- Edit target and geometry authority: `public/act1-hifi/town/portSapphire-screen.png` (1885x1885 RGB).
- Finish reference only: `design/act1-towns/props/props-v2-sheet.png`; never borrow its objects, layout, or magenta background.
- Same town and framing after uniform 1.0345x scaling. Preserve every building, street boundary, lane junction, harbour edge, jetty, boat, fence, garden, tree, and empty space.
- Bright coastal palette: mean luminance 90.1; blue/red 0.674; one upper-left sun.
- Newly drawn hard faux-pixel finish: crisp material boundaries; 2-3 discrete shade values plus real intermediate-value shading; no sharpen, unsharp mask, posterize, palette reduction, blur, bloom, or source-filter shortcut.
- Final: one opaque RGB PNG, exactly 1950x1950.

## Acceptance

`python3 scripts/check_town_finish.py <final> --layout-ref public/act1-hifi/town/portSapphire-screen.png`

Must pass: mean step >=24 (owner asks >=26), hard steps >=34%, steps 4-20 between 22-40%, paving IoU >=0.55, luminance and blue/red bands, exact density.

## Rejected full-scene batch

- Best: `design/act1-towns/portSapphire-screen-hard-redraw-v1.png`.
- Failed at mean step 13.95, hard 19.44%, paving IoU 0.357. Palette and middle band passed.
- Two retries also failed. The built-in editor emitted 1254x1254 and full-scene edits reinterpreted the paving.

## Next batch

Use a fresh task and a spatially controlled component strategy, such as four overlapping source crops redrawn independently and assembled at 1950. Generated art must remain the rendered content; deterministic crop/resize/assembly is allowed, but never harden the shipped painting. Keep only the strongest complete final at the owned final path. No game integration or deployment.
