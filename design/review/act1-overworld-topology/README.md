---
date: 2026-07-14
type: design-gate
status: superseded-by-connected-mainland-review
project: edu-rpg
milestone: act1-overworld-design-gate
---

# Act 1 overworld topology options

> Superseded on 2026-07-14 by
> `design/review/connected-mainland-topology/README.md`. The owner retained the
> Braided Pilgrim Trail progression graph but reopened its rectangular geometry,
> northwest footprint, global-world context, and production spacing.

Review the single option board:

- `act1-overworld-options.png` — rendered review image
- `act1-overworld-options.svg` — editable source

## Recommendation

**Owner approved Option A — Braided Pilgrim Trail on 2026-07-14.** It preserves the shipped compass
order while keeping Darkfang as the first mandatory dungeon, gives all three
optional Act 1 locations distinct spurs, avoids forced hub backtracking, and has
the cleanest balance between world character and minimap readability.

## Locked facts represented on every option

- Guided order: Greenhollow start, then Millbrook, Port Sapphire, Darkfang
  Grotto, and Crystal Cave. The shipped compass defines the four post-start
  waypoints in that order (`dist/assets/index-BhoGQRaA.js:78046-78069`).
- Hard progression: Crystal Cave entry remains closed until
  `boss.giantToad.defeated` is true
  (`dist/assets/index-BhoGQRaA.js:79574-79577`).
- Darkfang is the displayed identity of internal map ID `mistyGrotto`
  (`dist/assets/index-BhoGQRaA.js:56341-56343`).
- Sunken Cellar, Whispering Woods Cave, and Coastal Reef remain optional/lateral
  Act 1 landmarks. Whispering and Coastal retain their quest-gated identities;
  the board does not invent new flag names.
- Forest is blocked, routes are natural dirt trails, clearings and routes are
  separate semantic layers, and the minimap derives from the same route and
  landmark semantics rather than world pixels (`docs/MAP-ENGINE-REBUILD.md`).
- Shapes and spacing are topology review units, not legacy coordinates or final
  semantic cells.

## Option tradeoffs

| Option | Strength | Cost |
|---|---|---|
| A — Braided Pilgrim Trail | Strong forward rhythm, readable optionals, clean minimap | Less freeform than a loop |
| B — Twin-Hub Crossing | Simplest validation and strongest hub memory | Mandatory Port backtrack after Darkfang |
| C — Old-Growth Frontier Loop | Strongest exploration and sense of place | Busiest minimap and weakest novice route hierarchy |

## Gate

The approval authorizes only the Option A semantic graph and focused tests.
Renderer wiring, production art, runtime changes, commits, pushes, and deploys
remain out of scope.
