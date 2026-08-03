---
date: 2026-07-19
milestone: act2-one-way-art-geometry-plan
status: ready-after-act1-r26-owner-lock
project: edu-rpg
---

# Act 2 one-way art and geometry plan

## Purpose

Build Act 2 once, with one controlled art/geometry reconciliation, rather than
repeating the Act 1 polygon-to-art-to-polygon loop. Runtime integration remains
a separate task after the combined design pack is approved.

## Verified inputs

- Clean preserved Act 2 plate: `2432x2848`, SHA-256
  `db8027b05e1e0201e8029b951919a1c8ee48f239464a879755f705c809b32f19`.
- Marked connector plate SHA-256
  `a9bb6bd44b063fec1da7c2f2c66747f03666265ba5584ea8745fb562d3151be2`.
- Incoming Crystal mouth: runtime cell `[172,305]`.
- Outgoing Shadow mouth: runtime cell `[260,234]`.
- No Act 2 design authority pack exists yet. Do not inherit Act 1 coordinates.
- Act 1 R26 and its outgoing Crystal overlap must be hash-locked before Act 2
  art begins.

## Topology to lock before artwork

1. Crystal mouth to Ironkeep.
2. Ironkeep to Iron Mine.
3. Ironkeep to Storm Nest.
4. Ironkeep to Frostwatch through the mountain pass.
5. Frostwatch to Frozen Lake.
6. Frostwatch to Haunted Forest west mouth.
7. Haunted Forest east mouth to Ravenhollow.
8. Ravenhollow to Shadow Cave.

The two Haunted Forest mouths remain distinct at runtime cells `[238,248]` and
`[242,248]`. The fully snowy highlands identity, major Frozen Lake geography,
wind-cut passage, and Crystal/Shadow no-bypass barriers are non-negotiable.

## Artifact order

1. **A2-00 authority pack** — input hashes, Act 1 Crystal overlap, exact mouths,
   semantic graph, progression gates, open areas, forbidden shortcuts, and a
   bounded curve-alignment envelope for every corridor.
2. **A2-01 polygon candidate** — smooth low-complexity roads, broad exploration
   polygons, obstacle holes, and separate dynamic blockers.
3. **A2-02 derived proof** — deterministic mask, route/gate reachability,
   radius-4/substep-2 clearance, dense blocked/walkable samples, tangent-slide
   tests, and native/phone overlays. The mask is never hand-classified.
4. **A2-03 art candidate** — author the fully snowy painting against that tested
   geometry while preserving the accepted Crystal overlap.
5. **A2-04 atomic final** — run the single reconciliation gate below and
   hash-lock polygon, obstacles, mask, art, and both connector overlaps together.

## The only reconciliation gate

Generate one mismatch overlay and adjudicate every mismatch once:

- If a painted curve is visibly better and remains wholly inside its previously
  validated alignment envelope, refit only that intermediate polygon curve.
  Endpoints, widths, topology, blockers, and gates do not move.
- Otherwise correct the painting to the polygon.
- Rebuild the mask and rerun every mechanical, native, and phone-scale check.
- If a mismatch remains after that pass, stop for a bounded owner decision. Do
  not start another automatic art-to-polygon cycle.

After the combined GO, geometry is locked. Ordinary visual corrections are
art-only; topology or endpoint changes require a new gameplay decision.

## Review gates

- Intake: exact hashes, dimensions, coordinates, and Act 1 Crystal buffer.
- Polygon: independent static/mechanical review and native curve-quality review.
- Art: fresh snowy-landscape and entrance-legibility review.
- Atomic final: fresh static and visual reviews, then one owner review of the
  combined art/geometry pack.
- Runtime integration: separate later task.

## Stop conditions

Stop if Act 1/Crystal is not locked, a curve must leave its alignment envelope,
an entrance or topology moves, a bypass appears, the Crystal overlap changes,
any radius/gate/slide/traversal test fails, the one reconciliation pass leaves a
visible mismatch, or the same bounded art correction fails twice.

## Non-goals

No runtime/collision adapter, save migration, dungeon interior, quest redesign,
Act 3 painting beyond the Shadow overlap, whole-continent composite,
`public/`/`dist/`/Vite changes, branch, commit, push, deployment, or release.

## One kickoff decision

The retained Shadow-gate manifest is explicitly owner-unreviewed. Recommended
lock: **Shadow Cave remains blocked until Storm Harpy is defeated, while keeping
the existing dragon-defeated save-compatibility bypass.** This is the only
owner decision required before A2-00 begins.
