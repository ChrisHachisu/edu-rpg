# Shipped overworld blocking rules — extracted from the game, 2026-07-25

Owner, 2026-07-25: *"terrain and landmark placements need to all make sense and have
the same blocking rules that were in the original version"*.

Nobody had ever written those rules down. They live only in
`src/utils/MapGenerator.ts :: generateOverworldMap`, as inline conditions inside a
per-pixel loop, and the art map was built without reference to them — which is why
the semantic maps show gating that does not exist and miss gating that does.

This file is the extraction, verbatim in intent, in world cells. `tile 4` is
`mountain` and `tile 14` is `wallBarrier`; both block. `tile 3` is `tree`, which also
blocks. **Every rule below is a rule the player actually experiences.**

The runtime grid is reproducible without the game:

```bash
node node_modules/typescript/bin/tsc src/utils/MapGenerator.ts --outDir /tmp/rt --target ES2020 --module commonjs --skipLibCheck
node -e "console.log(require('/tmp/rt/MapGenerator.js').generateOverworldMap(320,400).length)"
```

---

## Act 2 (south-east landmass, region centre 235,305)

Act 2 is gated into **three** sections, not one open field.

| # | Rule | Cells | The gap |
|---|---|---|---|
| B1 | **River barrier**, north/south | mountain, `y275-298`, `x170-300`, centre `y≈286`, half-width 3.5-6 | **`x221-222` only** |
| B2 | **Wall barrier**, east/west across the northern section | `wallBarrier`, `x238-242`, `y230-280` | **`y247-249` only** |
| B3 | **Dense forest flanking B2** | trees, `x234-237` and `x243-246`, `y230-280`, ~60% density | none — it thickens B2 |
| B4 | Frozen Lake water body | water, centred `(200,265)`, r≈8 | shore |
| B5 | Mountain/water patches | `x185-215`, `y258-275`, noise-gated | scattered |

**This is the "forest blocking the way to the final town and the Act-3 connector"
the owner described.** B2+B3 together are a 13-cell-wide north-south barrier, and
what sits EAST of it is exactly Ravenhollow (252,243, the act's last town) and
Shadow Cave (260,234, the connector into Act 3).

So Act 2's intended progression is:

```
Ironkeep (200,321) · Iron Mine (185,336)          [SOUTH section]
        |  cross B1 at x221-222 only
Frostwatch (222,263) · Frozen Lake (200,266) · Haunted Forest (238,249) · Storm Nest (280,296)
        |  through B2/B3 at y247-249 only
Ravenhollow (252,243) · Shadow Cave (260,234) -> Act 3          [EAST pocket]
```

**None of B1–B3 exists on the art map.** That is the single biggest divergence in
the act, and it is why "expansion" of Act 2's walkable area was pointless: the act
is not supposed to be open, it is supposed to be three rooms and two doors.

---

## Act 3 / Act 4 (north-east landmass, region centre 235,110)

One landmass in the game, split into acts 3 and 4 only by the art map's rects. It is
gated by a lattice of mountain ridges, all `tile 4`:

| # | Rule | Cells |
|---|---|---|
| N1 | Western volcanic rock | `x<210`, noise > 0.5 |
| N2 | **Oasis moat** | ring r 5-8 around `(220,150)`, water; trees r 8-12 |
| N3 | **Northern horizontal ridge** | `y75-130`, `x165-290`; centre `87 + (x<230 ? (230-x)*0.35 : 0)`, half-width 5-7 |
| N4 | **Eastern vertical ridge** | `x248-292`, `y112-194`; centre `x≈268`, half-width 11-15 |
| N5 | Swamp ridge between rivers | `y85-117`, `x165-245`, noise-gated, dense |
| N6 | **Second horizontal ridge** | `y107-128`, `x165-290`; centre `y≈117`, half-width 6-8 |
| N7 | **Third horizontal ridge**, tapered | `y124-152`, `x193-268`; centre `y≈137`, half-width 6-9, tapering out west of `x225` |

N3 is the barrier the player crosses between the Act-4 landmarks in the north
(Ember Mines 202,48 · Obsidian Cavern 185,48 · Ember's Rest 195,80) and the Act-3
ones in the south (Oasis Haven 220,150 · Ruins Camp 270,120 · Desert Tomb 250,140).

Note the ridge centre SLOPES: at `x=242` it sits at `y=87`, at `x=195` at `y≈99`.
Any art-map reconstruction has to slope with it, not run flat.

---

## Act 1 and Act 5

Not extracted here — the owner has signed off on both. Act 1's rules are the
`inSW` branch, Act 5's the `inNW` branch of the same function.

---

## How to use this

1. **The art map must reproduce B1–B3 and N2–N7 as terrain**, in the same cells.
   They are the act's structure; everything else is texture.
2. **Landmarks must sit in the section the progression puts them in.** A landmark
   moved across a barrier changes the act's route even if both cells are walkable.
3. **Then, and only then, open the remaining space.** Walkable area that is not
   reachable from the act's town is wasted; measure reachability, not area.
4. A landmark lives in **three** files and all three must move together:
   `scripts/build_continent_terrain_class_macro_g2_organic.py :: LANDMARKS`,
   `design/continent-terrain-class-method/semantic-maps/landmark-roster.json`, and
   `src/scenes/WorldMapScene.ts`. Only the first drives the generator's clearings.
5. Verify with `scripts/check_semantic_map_gates.py`.

## Known mismatch, unresolved

`Scorched Ruins` is at `(208,120)` in the art map and generator but `(278,95)` in
the shipped game — 76 cells apart. Owner's call, 2026-07-25: *"move it accordingly
based on the rearrangement of the terrain"*, so it is deliberately left open until
the Act 3/4 restructure decides where it belongs.
