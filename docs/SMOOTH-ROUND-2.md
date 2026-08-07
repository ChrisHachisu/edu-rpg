# SMOOTH round 2 — the overworld stops building 128,000 invisible tile images

One atomic change: **the 320x400 overworld no longer builds one Phaser Image per cell.**
128,000 display objects in the tile container become **0**.

Compared against `main` @ `7910642` (the commit that corrected round 1's SMOOTH-4 claim),
re-measured interleaved in one sequence so both sides carry the same machine.

| | |
|---|---|
| Round | 2 |
| Measured | 2026-08-07 |
| Before | `main` @ `7910642` |
| After | this branch |
| Changed | `public/dq-tiles.js` only (plus the four sha pins it forces) |
| Bundle | `dist/assets/index-BhoGQRaA.js` md5 `60d90b63607b6e6980eb170aeeed445e` — unchanged |
| Probe | `scripts/perf_probe.cjs --compare`, **6 runs per side**, interleaved A/B/A/B/A/B |
| Probe sha | `0a429d62f3606dfca41cd7dfd9d2c37a0f88a4fa066bbb3fa51ed4d3e9338eae` — identical to `main`'s copy, verified after all measurement |
| Viewport | 960x720, dpr 1, coarse-pointer touch emulation ON |
| Renderer | `ANGLE (Apple, ANGLE Metal Renderer: Apple M1)` — real GPU, not SwiftShader |
| `uptime` before / after | 1.96 2.02 2.10 / 2.40 2.36 2.24 |
| 1-min load at each run start | base 1.96 / 2.73 / 2.20 / 1.86 / 2.32 / 2.96 · fix 2.92 / 2.38 / 2.17 / 2.41 / 2.84 / 2.71 |
| Runs voided | **none** (ceiling 10; highest reading 2.96) |
| Page errors | **0** across all 12 runs |

The two served trees differ in **exactly one file** (`diff -rq`): `dist/dq-tiles.js`. That is what
makes the comparison attributable.

## What `tileLayer` actually is, per map type

`renderMap()` (`dist/assets/index-BhoGQRaA.js:78571`) builds one `this.add.image(x, y, "<theme>-<tile>")`
per cell into a single Container, and also stores it in `tileGrid[y][x]`. The theme prefix and the
culling flag are chosen from the map's registry `type`:

| Map type | Objects built | `cullingEnabled` | Visible at creation | What covers them | Does `tileLayer` paint anything? |
|---|---|---|---|---|---|
| **overworld** (320x400) | **128,000** | **true** | **no** — every one is `setVisible(false)` at `:78584` | `dqterrain` at depth 1, `dqcanopy` at depth 11 | **No — measured** |
| town (16x16) | 256 | false | yes | `dqtownskin` at depth 1 | No — measured, but left alone |
| dungeon (26–30 cells) | 840 / 1,496 | false | yes | `dqdngbase` depth 1, `dqdngfog` depth 8 | No — measured, but left alone |
| crystalCave (100x100) | 10,000 | false | yes | `dqdngbase` depth 1 | No — measured, but left alone |

The overworld is the only map where the engine *itself* hides the tiles, and the only one where the
count is large. The evidence that they are unseen is a runtime occlusion test on the **unmodified**
build: hide the whole container, screenshot the canvas, restore, with the hero's animation and all
tweens paused so neither could mask nor manufacture a difference.

| Overworld, base build | canvas sha |
|---|---|
| tileLayer shown (normal) | `e70693625e500515` |
| tileLayer hidden | `e70693625e500515` |
| tileLayer restored | `e70693625e500515` |

Of the 128,000, only **588** are ever flagged visible at once (the culling window), and all 588 sit
under `dqterrain`.

## The change

`public/dq-tiles.js` installs a `renderMap` override on the WorldMapScene instance, beside the
existing `a1dInstall` loadMap wrapper and for the same timing reason: `WorldMapScene` runs its first
`loadMap` inside `create()`, before the scene is active and before it has a `tileGrid`, so anything
installed behind `tick()`'s guards would miss the very build SMOOTH-1 and SMOOTH-4 measure.

For the overworld it does everything the original does — destroy the previous container, install a
fresh one, destroy `npcSprites` and `forestMazeFireflies` and reset both arrays, reset `tileGrid`,
set `cullingEnabled`, reset the cull latches — **except build the images**. Everything else calls
straight through to the original.

### How the scope is pinned to the overworld

The predicate is `currentMapId === 'overworld'` **and** `mapData` is 400x320. Deliberately not:

- **not `isOverworld()`**, this file's own helper, which regex-matches `/[Ii]sles|[Pp]eaks|Realm|Temple/`
  and therefore also claims `sunkenTempleDungeon`, `sunkenTempleVillage`, `sunkenTempleIsle`,
  `stormreachIsles`, `frostfallPeaks` and `twilightRealm`. Those are real dungeons and a real town,
  and nothing draws a `dqterrain` over them — skipping their tiles would render them **blank**. That
  misclassification is pre-existing (`docs/SMOOTH-ROUND-1-REFUTATION.md` §2) and this change neither
  fixes nor depends on it.
- **not `scene.cullingEnabled`**, which the engine assigns *inside* `renderMap` and which therefore
  still holds the previous map's value when the wrapper is consulted.
- The 400x320 assertion is the same identity test `act1-world-map.js`'s `usable()` uses. Towns are
  16x16, the Act 1 dungeons 26–30 cells, crystalCave 100x100: none can collide with it.

### Why an empty `tileGrid` is safe

`tileGrid` stays an array of **empty rows**, not `[]`. Three things read it structurally and would
bail on a zero-length grid — `tick()`'s own `!scene.tileGrid.length` guard, `__DQ_TILES__.ready()`,
and the engine's `updateVisibleTiles()` — and if `tick()` bails no terrain is ever drawn at all.

Every *unguarded* `tileGrid` read in the bundle is bounded by a **row's** length
(`C < this.tileGrid[m].length`, `u < (this.tileGrid[0]?.length ?? 0)`), never by `mapData`'s, so an
empty row is read zero times. The guarded reads (`tileGrid[y]?.[x] &&`, `if(!tileGrid[m.y]?.[m.x]) continue`)
short-circuit. `act1-world-map.js:291` reads `tileGrid[0][0].displayWidth` for the tile size and falls
back to `48`, which is exactly `TILE` — its fallback is the same number, not a degraded path.

The three `tileLayer.getAt(index)` sites would throw on an empty container. None is reachable from
the overworld: `tryOpenTreasure` returns false for `type==='overworld'|'portal-overworld'` before it
indexes; the `wake()` boss-warp site needs `pendingBossId`, which only `tryBossInteract` sets and
which returns false unless `type==='dungeon'`; the third is `sunkenTempleDungeon`'s exit unseal.

`renderMinimap` reads `mapData`, not `tileGrid`. `wireSceneTaps` installs a scene-level
`pointerdown` and `__tapItems` operates on menu items; neither touches the container.

## Before / after — all six numbers, 6 runs per side

| ID | What the owner feels | Before | After | Change | Target | |
|---|---|---|---|---|---|---|
| SMOOTH-1 | "It takes forever to start" | 2498.1 ms | 2594.1 ms | +96.0 ms | ≤ 1500 ms | **RED** |
| SMOOTH-2 | "It's choppy when I walk" | 59.9 fps | 59.9 fps | — | ≥ 55 fps | GREEN |
| SMOOTH-3 | "It hitches" | 18.8 ms | 18.8 ms | — | ≤ 33 ms | GREEN\* |
| SMOOTH-4 | "It freezes" | **2061.8 ms** | **1179.0 ms** | **−882.8 ms (−42.8%)** | ≤ 100 ms | **RED** |
| SMOOTH-5 | "Doors are slow" | **2112.8 ms** | **1081.5 ms** | **−1031.3 ms (−48.8%)** | ≤ 500 ms | **RED** |
| SMOOTH-6 | "It ignores my taps" | 50.8 ms | 54.6 ms | +3.8 ms | ≤ 100 ms | GREEN |

Spreads, and whether they overlap:

| ID | Before (6 runs) | After (6 runs) | Overlap? |
|---|---|---|---|
| SMOOTH-1 | 2477.3–2513.5 | 2456.1–2715.8 | **YES — not established** |
| SMOOTH-2 | 59.9–59.9 | 59.9–60.2 | yes (identical medians) |
| SMOOTH-3 | 18.7–18.8 | 18.8–67.6 | **YES — not established** |
| SMOOTH-4 | 1574.8–2190.0 | 1113.0–1297.2 | **NO — base min 1574.8 > fix max 1297.2** |
| SMOOTH-5 | 2093.5–2237.2 | 550.5–1169.7 | **NO — base min 2093.5 > fix max 1169.7** |
| SMOOTH-6 | 48.7–73.4 | 52.4–84.9 | **YES — not established** |

Per-run SMOOTH-4 (the watchdog, which is the larger term and therefore the score on both sides):

```
base: 1574.8  2190.0  2177.2  2065.1  2050.8  2058.4     min 1574.8
fix:  1236.0  1255.7  1122.0  1115.8  1297.2  1113.0     max 1297.2
```

Unlike round 1, this is not a bimodal draw: the fix distribution is **tight** (184 ms wide) and lies
**entirely below** the base minimum. And unlike round 1, the probe's *documented primary* instrument
agrees — **LoAF `blockingDuration` moved too, 1519.0 → 1135.8 ms** (base spread 1515.7–1525.3, fix
1070.7–1254.8). Both independent instruments move in the same direction. That was the specific
weakness that overturned round 1's SMOOTH-4 claim, and it is not present here.

### Sub-measures

| Sub-measure | Before | After |
|---|---|---|
| **S1 — first real terrain** | **3457.8 ms** | **2423.1 ms** (−1034.7) |
| **S1 — gate that held the cover: terrain** | **1127.4 ms** | **110.9 ms** (−1016.5) |
| S1 — cover lifted | 1820.3 ms | 2594.1 ms |
| S2 — mean fps (vs median) | 53.0 | 52.0 |
| S3 — worst single frame | 1107.5 ms | 1192.3 ms |
| S3 — frames > 100 ms in the walk | 2 (2–2) | 2 (2–3) |
| **S4 — LoAF blocking** | **1519.0 ms** | **1135.8 ms** |
| **S4 — watchdog drift** | **2061.8 ms** | **1179.0 ms** |
| S5 — overworld → town | 68.2 ms | 16.1 ms |
| **S5 — town → overworld** | **2112.8 ms** | **1081.5 ms** |
| S6 — menu open | 50.8 ms | 54.6 ms |
| S6 — battle command | 17.6 ms | 16.1 ms |
| **Phaser objects in the overworld tile container** | **128,000** | **0** |
| Full procedural splats before real terrain | 1 (3,953,664 px) | 1 (3,953,664 px) |

\* SMOOTH-3 is green on the metric as defined and still must not be read as "no hitching". Its honest
companions did **not** improve: the worst frame is 1107.5 → 1192.3 ms with overlapping spreads
(1072.7–1244.9 vs 1125.6–1320.3), and the over-100 ms count is unchanged at 2. **This change did not
touch the 1.2 s walk frame.** Round 1 attributed that frame to the hero walking into terrain whose
chunks were never loaded, and this round's result is consistent with that: it is chunk work, not the
tile container.

### SMOOTH-1 did not improve, and the reason is worth carrying forward

The thing SMOOTH-1 was waiting for got **~1.0 s faster** — first real terrain 3457.8 → 2423.1 ms, and
the cover's terrain gate 1127.4 → 110.9 ms — yet SMOOTH-1 itself did not move (spreads overlap).
The boot cover is now the binding gate: it lifted at 1820.3 ms before and 2594.1 ms after, and the
fix's SMOOTH-1 is visibly bimodal (2456.1, 2462.5, 2488.5, 2699.6, 2700.7, 2715.8) in a way the base's
tight 2477.3–2513.5 is not. Terrain is no longer what the player is waiting for at startup; the
cover's own logic is. That is the SMOOTH-1 round, which is explicitly out of scope here.

## Anti-gaming

- **Nothing was deferred.** The removed work is not rescheduled, it is not done at all — there is no
  lazy path and no later materialisation. The walk is measured in the **same run**, after the load:
  frames over 100 ms are unchanged at 2, and the worst frame did not grow beyond overlap.
- **Nothing was made smaller or lower quality.** Steady-state camera is `960x644` with an identical
  world origin `(2856, 11990)` on **both** trees, and the procedural splat is 3,953,664 px on both —
  the same window, the same scene. (The probe's header prints canvas `960x720` for base and `960x644`
  for fix; that is a transient sampled at the SMOOTH-1 instant only, and base itself reported 644 in
  2 of its 6 runs. Not a scene-size difference.)
- **Absolute milliseconds are reported throughout**, alongside every percentage.

## Correctness

### The overworld renders identically

Live `dqterrain` / `dqcanopy` canvas **textures** are hashed (FNV-1a over every byte of
`getImageData`) rather than screenshots, so the hero's animation frame cannot mask or manufacture a
difference. At every one of the eight doors, on the overworld, base and fix agree exactly.

| | base | fix |
|---|---|---|
| Overworld tile container objects | **128,000** | **0** |
| `dqterrain` / `dqcanopy` hashes | identical at all 8 doors | identical |
| `canMove` hash over all 128,000 cells | `317b8b0a` | `317b8b0a` |
| Blocked cells | **78,711** | **78,711** |
| `mapData` hash | identical | identical |
| Minimap present on the overworld | yes | yes |

Collision is hashed by asking `scene.canMove` for **every** cell of the 320x400 map. It is identical
with 128,000 objects and with 0 — direct proof that collision reads map data, not the Image objects.

### Every door, through the real entry path

Driven with the shipped d-pad mechanism (synthesised `KeyboardEvent` with `keyCode` patched in, plus
`window.__DQ_STICK__`), walking onto the door tile. No console `loadMap()`.

| Door | Enterable base / fix | Inside: objects | Inside: `canMove` | Inside: dq texture | Returned to overworld |
|---|---|---|---|---|---|
| Greenhollow (town) | yes / yes | 256 / 256 | `3db83013` both, 100 blocked | identical | yes / yes |
| Millbrook (town) | yes / yes | 256 / 256 | `5f1abbd5` both, 98 blocked | identical | yes / yes |
| Port Sapphire (town) | yes / yes | 256 / 256 | `5f1abbd5` both, 98 blocked | `dqtownskin 5fb48986@768x768` both | yes / yes |
| Sunken Cellar (dungeon) | yes / yes | 840 / 840 | `395eb6f4` both, 633 blocked | identical | not drivable, either build |
| Misty Grotto (dungeon) | yes / yes | 1,496 / 1,496 | `69615865` both, 1,184 blocked | identical | not drivable, either build |
| Whispering Woods Cave | no / no | — | — | — | — |
| Coastal Reef | no / no | — | — | — | — |
| Crystal Cave | no / no | — | — | — | — |

All three Act 1 towns render, are enterable, and are returnable. Two dungeons render and are
enterable. Zero page errors on every run, both builds.

**The three doors marked "no" fail identically on `main`.** They are not reachable by holding one
direction from the exit cell — they need pathfinding, the same limitation round 1's verifier hit on
the dungeon exit. Both builds were driven by the identical harness and produced the identical set.
Crystal Cave was additionally verified by cold load (10,000 objects, `dqdngbase 3fb0b84b@2112x1824`,
identical on both).

Dungeon exits are likewise not drivable with a held direction on **either** build, so the return leg
from a dungeon remains unverified — stated, not waved away.

**One harness artifact, disclosed:** the first pass polled the map id every 250 ms and left the
direction held, which at Port Sapphire — whose entry cell sits one step from its exit — carried the
hero back across the door before the snapshot. Base landed inside, fix landed outside, and it looked
like a difference. Re-run with an in-page release fired the instant the map id flips, both builds
land identically: `portSapphire`, hero `(8,15)`, 256 objects, `canMove 5f1abbd5`, 98 blocked,
`dqtownskin 5fb48986`, 6 NPCs. Not a defect in either build.

### The transient frame — checked, and it is pre-existing

On the town → overworld return there is exactly **one** rendered frame after the overworld goes live
but before `dqterrain` is blitted. This is the only moment the engine tiles could matter, so it was
photographed on both builds with the render loop frozen on that exact frame:

| | base | fix |
|---|---|---|
| Un-terrained overworld frames | 1 | 1 |
| That frame, canvas PNG | 25,705 B, sha `0cd9249d271c2707` | 25,705 B, sha **`0cd9249d271c2707`** |
| Settled overworld frame | sha `550635e214441a5e` | sha **`550635e214441a5e`** |

**Byte-identical.** The tiles do not paint that frame either, because `renderMap` leaves all 128,000
`setVisible(false)` on the overworld and `updateVisibleTiles` has not yet run for the new camera.
The frame shows the HUD, minimap, compass and stick over black terrain — **on `main` too**. It is a
pre-existing gap, not a regression from this round, and it is left alone deliberately.

Timing around it, single sample per side: base holds the stale town for 1565 ms then that frame for
538 ms (2103 ms total to terrain); fix holds the town for 520 ms then that frame for 653 ms (1173 ms
total). Fix reaches terrain ~930 ms sooner. The black portion is ~115 ms longer on fix — one sample
each, so treat that delta as unmeasured.

## Non-regression evidence

```
$ npm run test:map-engine
MAP ENGINE TEST PASS: Act 1 topology, determinism, collision, natural landmark thresholds, progression gates, and minimap derivation
ACT 1 OVERWORLD TEST PASS: 15008 source-land cells; meadow 32.00%; trail 8.00%; forest 46.99%; mountain 13.00%
MAP ENGINE SHELL TEST PASS: movement, retained census/adapter, re-entry planning, chunks, camera, culling, minimap, save relocation, and feature flags
RETAINED LATER GATE TEST PASS: entry, exit, floor, flags, reverse traversal, arrival, and rollback
SHIPPED OVERWORLD DQ REPLAY PASS: state-dependent whole maps and invariant final corridor windows
ACT 1 RUNTIME SNAPSHOT CHECK PASS: 148x182 205dbe88d80f31260044b466c5a4cab59aa828377010d9e834223267e6cec434
ACT 1 OVERWORLD WALK CHECK PASS: 4578 blocks, far=255, provenance 42af2d0884f99d05
ACT 1 RUNTIME OVERRIDE CHECK PASS: e5713be14ece51788798893c09a057d601d486671f97254dfb1825077ffe26b4 (8 owner-placed landmarks, 9376-cell single walkable region)
ACT 1 RUNTIME OVERRIDE TEST PASS: revision 6; 8 owner-placed doors, all firing; 9376 walkable cells in one region; plate abdcab018d5be3bd07576c97b411de373dea7241c88140da71918242552ea560

$ ./scripts/ship-gate.sh .
STATIC SHELL CHECK PASS: dist/index.html matches the tracked shell  23956 B  22d992023a24854d
PINS CHECK PASS: all 74 pins match the files on disk
ACT 1 OVERLAY VERIFY PASS: .../dist
ACT 1 OVERLAY VERIFY PASS: .../ios/App/App/public
SHIP GATE PASS: protected runtime verified; canonical overrides and iOS payload synchronized

$ md5 dist/assets/index-BhoGQRaA.js
MD5 (dist/assets/index-BhoGQRaA.js) = 60d90b63607b6e6980eb170aeeed445e
```

The Act 1 plate sha is `205dbe88d80f31260044b466c5a4cab59aa828377010d9e834223267e6cec434` — unchanged
from round 1, so world generation did not move.

## Where the numbers stand

| ID | Target | Now | |
|---|---|---|---|
| SMOOTH-1 | ≤ 1500 ms | 2594.1 ms | RED (1.7x) — now gated by the boot cover, not terrain |
| SMOOTH-2 | ≥ 55 fps | 59.9 fps | GREEN |
| SMOOTH-3 | ≤ 33 ms | 18.8 ms | GREEN on the metric; worst frame still 1192.3 ms |
| SMOOTH-4 | ≤ 100 ms | 1179.0 ms | **RED (11.8x)** — was 20.6x. Still the binding constraint |
| SMOOTH-5 | ≤ 500 ms | 1081.5 ms | RED (2.2x) — was 4.2x |
| SMOOTH-6 | ≤ 100 ms | 54.6 ms | GREEN |

SMOOTH-4 remains binding. What is left inside the 1179 ms block is no longer the tile container —
it is the terrain composition itself, which is where round 3 should look.

## Doubts, stated

1. **SMOOTH-4's residual is not attributed.** −882.8 ms is established (no overlap, both instruments
   agree). What the remaining 1179 ms *is* was not profiled this round. I am asserting it is not the
   tile container, because the container is now empty; I am not asserting what it is.
2. **Mean fps did not improve, and I expected it to.** `updateVisibleTiles` used to call `setVisible`
   on up to 128,000 objects whenever the camera crossed half a tile; it is now a 400-iteration no-op.
   Mean fps still went 53.0 → 52.0 with overlapping spreads. Either that loop was never the cost, or
   something else absorbed the win. Unexplained.
3. **One fix run had SMOOTH-3 p99 at 67.6 ms and mean fps 47.2** where the other five sat at ~18.8.
   Nothing in the run voided and the load was 2.17 — the lowest of that side. I cannot explain it and
   it is the one datum that would most repay a re-run.
4. **The black transient's duration was sampled once per side.** Byte-identity of the frame is solid;
   the ~115 ms difference in how long it is held is not measured.
5. **Everything here is a browser number.** No simulator was booted (the brief excluded it). Per the
   skill, every figure is a hypothesis about the phone. The memory question round 1's verifier left
   open is also still unconfirmed on device.
6. **Three doors and every dungeon exit were not driven** on either build, for want of pathfinding.
   Their overworld-side state is verified; their entry is not.

## Reproducing

```sh
python3 scripts/serve_dist.py --port 5174 &                  # this branch's dist/
python3 scripts/serve_dist.py --port 5175 --dir <base dist> &
node scripts/perf_probe.cjs --compare "base=http://127.0.0.1:5175/,fix=http://127.0.0.1:5174/" --runs 6
```

`dist/` is gitignored; rebuild it in a fresh worktree with `./scripts/build-dist.sh`. The base tree
is that same build with `git show 7910642:public/dq-tiles.js` written over `dist/dq-tiles.js`, which
`diff -rq` confirms is the only differing file.
