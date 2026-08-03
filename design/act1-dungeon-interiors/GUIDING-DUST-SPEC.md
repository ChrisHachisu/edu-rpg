---
date: 2026-07-31
type: design-spec
tags: [edu-rpg, dungeons, accessibility, items, act1]
status: OWNER-DESIGNED — runtime not yet built
---

# Guiding dust — the rescue for a lost player

Owner, 2026-07-31: *"what about making this a glowing dust or line on the floor that activates
when a user uses an item? this is the rescue for when players get lost and it can be available
in stores and maybe treasure chests"*, leading to *"the next floor and or required items to
progress in sequence"*.

## Why this shape beats the alternatives

It was going to be grade-gated footprints. A consumable is better on three counts, and the
reasoning is worth keeping because it applies to the next accessibility feature too:

1. **It is available to everyone, not just young players.** An adult who puts the game down for
   a week and comes back lost on Crystal Cave F4 needs the same rescue a six-year-old does.
   Grade-gating help assumes only children get lost.
2. **It fires only when the player says they are lost.** An always-on trail answers a question
   nobody asked and quietly removes the exploration the cave patterns exist to create.
3. **It costs something.** Buying it is a decision; following a permanent trail is not. That
   also gives the shops a sink beyond healing items.

## The item

Slots into the existing shape — `escapeCrystal` already carries
`effect: { type: 'dungeonEscape', value: 1 }`, so a field effect on a consumable is established.

```ts
guidingDust: {
  id: 'guidingDust',
  nameKey: 'item.guidingDust',
  descriptionKey: 'item.guidingDust.desc',
  type: 'consumable',
  effect: { type: 'guide', value: 1 },   // one use per floor; lasts until the dungeon is left
  buyPrice: 40,                          // grade-scaled — see the availability table
  sellPrice: 5,                          // deliberately low, so the free ten are not sold off
},
```

**Availability.** All three Act-1 shops (`greenhollow`, `millbrook`, `portSapphire`) and later
towns. **Not seeded into Act-1 chests** — the first encounter is meant to be a shop discovery.

## What it points at — the objective sequence

Every generated floor now carries an ordered `objectives` list, so the trail leads to *the next
thing that is actually required*, not always the stairs:

```json
"objectives": [ { "order": 1, "kind": "stairsDown", "x": 41, "y": 12 } ],
"maxStepsToObjective": 73
```

On use, the runtime draws to **the first objective not yet met**. Act 1's sequence is one step
deep — the way on is the only requirement, since keys and locked doors are removed — but the
list is ordered and typed so Acts 3–5 can put a key, a quest item or a lit torch *ahead of* the
stairs without the runtime changing at all.

## Locked behaviour (owner, 2026-07-31)

- **One use per floor.**
- **The trail lingers until the player leaves the dungeon**, and **survives inter-floor
  transitions** — descending does not extinguish it. So one use lights the way on for the rest
  of the visit, and the player is never re-lost by taking the stairs they were just shown.
- **First encounter is a deliberate shop discovery** — not seeded into Act-1 chests, so the
  player meets it as a thing they chose to buy.

## Availability scales with age, not the feature

The rescue itself is identical for everyone; only the cost of reaching it moves. This is the
better place to put the grade difference — the mechanic never changes, so nobody is playing a
different game, and an older player who genuinely gets lost can still buy their way out.

| player | how they get it |
|---|---|
| up to grade 3 | **10 in the starting inventory, free**, and cheap to restock |
| grade 4+ | **expensive, or deliberately scarce** — a real decision to spend on |

`Player.ts:18` currently hardcodes `inventory: [{ itemId: 'herb', quantity: 3 }]`, so the
starting inventory needs to become grade-aware — the same `quizDifficulty` that
`getEncounterMultiplier` already reads.

## Sizing the effect — measured, not guessed

`maxStepsToObjective` is the worst case from anywhere on the floor to its objective. Across the
18 Act-1 floors:

| | steps |
|---|---|
| shortest floor | 34 |
| median | 73 |
| **longest (Crystal Cave F6)** | **228** |

**Resolved by the locked behaviour above:** the trail persists until the player leaves the
dungeon, so there is no step budget to size and no way to waste a use. The 228-step figure now
serves a different purpose — it is the longest path the renderer may have to draw at once, which
matters for how the motes are batched rather than for how long they last.

Later acts should re-measure that number rather than inherit it.

## Rendering

Glowing dust along the path, brightest near the player and fading with distance, so it reads as
a direction rather than a solved maze. Animate motes drifting *along* the path toward the
objective — the movement is what makes it read as a guide instead of a drawn line, and it also
shows which way to go at a junction where a static line is ambiguous.

Draw it above the floor and below the hero. Respect `prefers-reduced-motion` by holding the
motes still and keeping the fade.

## Open decisions

- Exact prices per grade band, and whether grade 4+ scarcity is done through price alone or by
  stocking it in fewer shops.
- Whether the 10 free copies are granted at character creation or on first entering a dungeon
  (the latter avoids them being sold for early gold).

## Build note

`GameState.getEncounterMultiplier(grade)` — the other half of the difficulty answer — is an
already-wired stub returning `1.0` for every grade. **But the checked-in TypeScript is older
than the shipped bundle** (`edu-rpg/AGENTS.md` line 19, which is why `npm run build` is
blocked), so editing `src/` alone will not change the shipped game. Both this item and the
encounter multiplier need the bundle path settled before they land.
