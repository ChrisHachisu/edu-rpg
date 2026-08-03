---
date: 2026-07-14
type: handoff
status: rejected-history
project: edu-rpg
milestone: capacity-first-connected-mainland-v2
branch: codex/map-engine-semantic-data
supersedes: docs/handoffs/2026-07-14-connected-mainland-topology-owner-review.md
superseded-by: docs/handoffs/2026-07-14-preservation-first-mainland-locked.md
---

# REJECTED — capacity-first connected mainland v2

> **Rejected 2026-07-14.** Do not implement the five-lobe silhouette,
> `20/23/20/20/17` capacity allocation, new boundary layout, or landmark-spacing
> assumptions below. The preservation-first handoff retains the current 320×400
> world and permits terrain changes only in three existing water-gap corridors.

## Rejected outcome (history)

The rejected direction board has been replaced with a roster- and capacity-first
mainland proposal. The required mainland adjacency is exactly:

`Act 1 — Act 2 — Act 3 — Act 4 — Act 5`

No nonconsecutive Acts share a land boundary. In particular, Act 1 cannot lead
directly into or visually touch Act 5. Acts occupy five irregular, comparable
lobes. The v2 review board uses a portrait planning frame so the chain and its
capacity can be inspected without implying a final world aspect ratio. The
storage array may remain rectangular, but water, coastline, mountains, and
forest hide that envelope from the player.

## Rejected capacity proposal (history)

The shipped bundle and current source agree on the retained map roster. Nothing
is deleted or silently reassigned by this proposal:

- 11 mainland towns;
- 21 mainland dungeon IDs using 26 physical mainland anchors/mouths;
- 4 compact portal anchors inside Act 5;
- 41 physical mainland placement slots in total.

The proposed regional slot loads are 8, 10, 7, 6, and 10. Scorched Ruins remains
provisionally counted in Act 3, matching current source comments, until its
regional assignment is explicitly locked. Act 5's total includes
four compact portal pads; only its two towns, three dungeons, and incoming
Volcanic Forge mouth are area-driving mainland landmarks. The four portal-local
worlds retain their own maps and therefore do not justify a larger Act 5 region.

The proposed usable-mainland shares are:

| Region | Usable-land share | Physical anchor slots |
|---|---:|---:|
| Act 1 | 20% | 8 |
| Act 2 | 23% | 10 |
| Act 3 | 20% | 7 |
| Act 4 | 20% | 6 |
| Act 5 | 17% | 10 total / 6 area-driving |

These shares exclude water and blocked separator bands and remain subject to
owner approval. They keep every Act within ±15% of the 20% median while ensuring
that portal pads do not inflate Act 5.

## Rejected boundary proposal (history)

Mountains and blocked tree belts are the only Act separators:

- Act 1→2: Crystal Range and the candidate unchanged Crystal Cave crossing;
- Act 2→3: an irregular blocked-tree belt with one controlled trail or pass;
- Act 3→4: a mountain range with one declared crossing contract;
- Act 4→5: a dense blocked-tree belt with mountain shoulders and one crossing.

The mainland remains one geographic land component, while the open player route
can cross each boundary only at its declared passage. Crystal Cave is still
protected: this proposal does not authorize changing its topology or generation,
and it may serve as a crossing only if its retained two-mouth behavior verifies.

## Rejected review artifacts (history)

- `design/review/connected-mainland-topology/connected-mainland-capacity-v2.png`
  — rendered capacity-first owner-review board.
- `design/review/connected-mainland-topology/connected-mainland-capacity-v2.svg`
  — editable vector source.
- `design/review/connected-mainland-topology/README.md` — topology, capacity,
  pacing, migration, and validation contract.

The older `connected-mainland-direction.*` board is rejected decision history.
It must not guide implementation because it implied an Act 1→5 relationship and
made Act 5 disproportionately large.

## Historical scope and verification

This v2 review changes documentation and review artwork only. It does not alter
semantic coordinates, the map schema, runtime wiring, saves, dungeon topology,
Crystal Cave, production terrain art, or the shipped bundle. The earlier pure
map-engine tests and retained-runtime verification remain green; this review's
new checks are SVG validity, rendered-image inspection, exact roster coverage,
region adjacency, and capacity balance.

Verification completed:

- SVG XML validation: PASS;
- rendered PNG: 1700×1050 sRGB, inspected at original resolution;
- physical-anchor audit: PASS, exactly 41 markers in regional loads
  `8/10/7/6/10`;
- independent topology and final visual re-reviews: PASS, no unresolved P0–P2
  findings;
- `pnpm run test:map-engine`: PASS;
- `pnpm run verify:runtime`: PASS;
- preserved bundle: 4,987,581 bytes; monster PNG count: 75;
- `git diff --check`: PASS.

## Rejected roadmap instruction (history)

The v2 macro shape and capacity allocation are not approval gates.

## Do not resume

This handoff is non-actionable history. Follow
`docs/handoffs/2026-07-14-preservation-first-mainland-locked.md`.
