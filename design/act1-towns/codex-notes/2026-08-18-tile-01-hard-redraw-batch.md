---
date: 2026-08-18
type: handoff
project: edu-rpg
milestone: port-sapphire-tile-01-hard-redraw
status: exhausted
---

# Tile (0,1) hard-redraw batch

## Immutable style and geometry

- Edit target and sole geometry authority: `design/act1-towns/rebake/primer-01.png`, 1254x1254 RGB.
- Preserve every object, footprint, lane, and ground patch exactly. No additions, removals, moves, or resizes.
- Leftmost 161 pixels are a locked seam and will be restored exactly from the target after generation.
- Hard hand-drawn pixel art: native one-pixel-scale marks, definite material boundaries, 2-3 flat shade values plus real 4-20 luminance-step shading; no filter, sharpen, posterize, blur, bloom, gradient, or soft focus.
- Bright upper-left daylight; mean luminance about 90. Final is one opaque RGB PNG, 1254x1254.

## Batch 1 result

- Diagnostic only: `design/act1-towns/rebake/primer-01-redrawn-candidate.png`.
- Rejected: visually crisp and layout-faithful, but marks are too block-scaled; mean step 15.874, >=24 steps 19.575%, 4-20 steps 41.640%.

## Exact next batch

- Full-scene native-detail retry also rejected: best harder call reached mean step 16.32 / hard 20.59% / middle 43.33% and darkened to luminance 63.4.
- Fresh spatially controlled redraw: split the original into four overlapping geometry-locked crops, redraw each independently at high detail, and assemble only generated content at original coordinates.
- Acceptance: mean step >=26, >=24 steps 34-52%, 4-20 steps 22-40%, mean luminance about 90, exact 161-pixel seam, RGB 1254x1254.
- No integration, build, deployment, or edits outside the new candidate/final image.

## Batch 3 and selected artifact

- Four-crop redraw rejected: mean step 16.99 / hard 20.76% / middle 42.78%; visible quadrant seams.
- Strongest artifact retained: `design/act1-towns/rebake/primer-01-redrawn.png`.
- It is 1254x1254 RGB; columns 0-160 are pixel-exact to the primer; geometry/paving passed visual review and IoU 0.677; luminance 93.0.
- Still unaccepted: visible x=161 style seam; mean step 15.95, hard 19.97%, middle 42.44%. Do not claim the strict finish gate passed.
