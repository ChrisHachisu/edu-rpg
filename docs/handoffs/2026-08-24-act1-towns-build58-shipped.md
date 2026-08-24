---
date: 2026-08-24
type: handoff
project: edu-rpg
milestone: act1-town-plates
status: active
supersedes: "[[2026-08-24-act1-towns-roof-collision-and-npc-colour]]"
tags: [handoff]
---

# Handoff — build 58 shipped, all three build-57 items closed — 2026-08-24

**TestFlight build 58 is up and INSTALLABLE** (`verify-delivery.py`: Beta Testers external,
2/2 testers able to install — not a VALID-only claim). HEAD `a95e3fc` on `fix/graduated-gpu-heal`,
tree clean apart from `ios/build` scratch, gate green, pins 102, payload 723.

All three owner items from build 57 are closed. Nothing below is open.

## What shipped

**1. Roofs are not floors.** 29 building footprints authored across the three towns in
`design/act1-towns/<town>-authored-obstacles.json` as `nonWalkableBands[].polygonArt`, cleared from
the mask before component selection. Standable ground millbrook 30.1 → 22.3%, greenhollow
23.6 → 20.5%, portSapphire 17.8 → 12.3%. `scripts/check_town_roofs.py` gates it at **zero**
standable pixels on any footprint, and is in `ship-gate.sh`.

**2. The exit is the gate.** `exit.cell` is now the gate as painted and `startCell` sits 3.5 cells
inside it. No change to `town.html` — that spacing is exactly what makes the existing arming
(arm >2.5 cells, fire dy<1.0 dx<1.6) fire at the gate instead of out in the grass.

| town | exit.cell | startCell |
|---|---|---|
| millbrook | [32.5, 56.5] | [32.5, 53.0] |
| greenhollow | [32.5, 55.5] | [32.5, 52.0] |
| portSapphire | [33.0, 1.5] | [33.0, 5.0] |

**3. Shopkeeper and healer redrawn bright.** shopkeeper lum 66.6 → 117.9 with **30.5% teal**
(165-200°, every other NPC ≤1.1%); healer lum 97.3 → 136.3 with **23.7% green** (90-180°, every
other NPC ≤0.5%). Both PASS `check_character_finish.py`, 192x256, feet row 58, one md5 each across
three towns.

## Read these before touching this area again

- **Colour cannot separate a roof from the ground in these plates, and the reason is the
  projection.** Three-quarter top-down means a roof's rear edge meets grass directly, with no wall,
  shadow or gap. Every alternative was measured and rejected; the numbers are in
  `derive_town_walkable.py::stamp_roof_bands`'s docstring. Do not re-attempt threshold tuning,
  morphological opening, paving-seeded connectivity, not-ground blob detection or texture coherence.
- **A median hue is the wrong instrument for an NPC palette.** Hair, skin, boots and baskets carry
  the pixel area, so the teal shopkeeper still measures a median hue of 37. Use
  `scripts/measure_npc_palette.py`, which reports hue-family share.
- **`design/act1-towns/npc/final/` is a MIXED-format directory.** Eight already-keyed RGBA sheets
  beside the two RGB-on-magenta ones. `bake_npc_sheets.py --src .../final` used to destroy
  greenhollow-elder and millbrook-miller outright; it now refuses non-RGB input by name. Bake from a
  scratch directory holding only the sheets you authored.
- **`key_landmark_sprite.py` is a SINGLE-sprite tool.** On a 3x4 sheet it smears one contact shadow
  across two pose rows and zeroes background RGB. That is how miller got into the state above.
- **The greenhollow browser harness is NOT a gate and its REACH leg is flaky** — six consecutive
  runs scored between 6/6 and 2/6 on identical geometry. Its BUILDINGS and EXIT legs were identical
  every run and are the two things no offline check can prove. Its own header says all this.

## Open, not blocking, and none of it was raised by the owner

- **Ten of the seventeen NPC sheets fail `check_character_finish.py`**, and did before this work
  (elder, fisherman, kiki, villager1, villager2, herbalist, sage, drake, sailor, wisewoman). Their
  edge steps run +4.3 to -9.0 against the heroine's -27.0 — edges too LIGHT, not keylined. The gate
  is not wired into `ship-gate.sh`. The two sheets touched here both pass.
- **`final/` is still mixed-format for those eight sheets.** The bake now refuses rather than
  corrupts, so it is safe; re-authoring them to RGB-on-magenta is a tidy-up, not a fix.
- **The harness is greenhollow-only.** millbrook and portSapphire have no runtime walk proof, only
  the deterministic gates.

## Where things are

| purpose | path |
|---|---|
| authored building footprints | `design/act1-towns/<town>-authored-obstacles.json` |
| why colour cannot work | `scripts/derive_town_walkable.py::stamp_roof_bands` |
| roof gate | `scripts/check_town_roofs.py` |
| talk-band gate | `scripts/check_town_talkable.py` |
| actor snap (talk-band aware, idempotent) | `scripts/place_town_actors.py` |
| NPC palette instrument | `scripts/measure_npc_palette.py` |
| NPC brief with both amendments | `design/act1-towns/npc/BRIEF-bright-v3.md` |
| runtime walk proof (flaky REACH) | `scripts/greenhollow_verify_town.cjs` |
| ship (assigns group, proves installable) | `./scripts/ship-ios.sh` |

## Resume

```
cd /Users/christopherhachisu/Documents/claudecode/edu-rpg/.claude/worktrees/laughing-mahavira-c9f72b
npm run --silent gate
```

Wait for the owner to play build 58 before opening anything above.
