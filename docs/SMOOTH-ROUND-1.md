# SMOOTH round 1 — the overworld stops rebuilding terrain it already had

One atomic change: **returning to the overworld reuses the baked chunk art it already
loaded, instead of throwing it away and re-deriving the terrain.**

Compared against `docs/SMOOTH-BASELINE.md` (round 0) and re-measured interleaved against
`main` @ `c7143c6` in the same sequence, so both sides carry the same machine.

| | |
|---|---|
| Round | 1 |
| Measured | 2026-08-07 |
| Before | `main` @ `c7143c6` |
| After | this branch |
| Changed | `public/dq-tiles.js` only (plus the sha pins it forces) |
| Bundle | `dist/assets/index-BhoGQRaA.js` md5 `60d90b63607b6e6980eb170aeeed445e` — unchanged |
| Probe | `scripts/perf_probe.cjs --compare`, 3 runs per side, interleaved A/B/A/B/A/B |
| Viewport | 960x720, dpr 1, canvas 960x720, coarse-pointer touch emulation ON |
| Renderer | `ANGLE (Apple, ANGLE Metal Renderer: Apple M1)` — real GPU, not SwiftShader |
| 1-min load | base 2.72 / 3.11 / 2.65 · fix 2.83 / 3.02 / 3.53 (ceiling 10, no run voided) |

## The root cause

Walking off the overworld called `a1aReleaseChunks()`, which dropped the **entire** Act 1
baked-chunk cache — every decoded base, canopy and water image. Those chunks *are* the
overworld's terrain: without them `a1aBlit` cannot report full coverage, so `drawTerrain`
falls through to its analytic per-pixel loop over the whole 1584x1872 window. Walking back
out of a town therefore had to re-fetch and re-decode every visible layer **and** synthesise
3.85 M pixels of procedural terrain to cover the wait — none of which needed doing, because
nothing about walking through a door invalidates a static baked image.

That is why the door was 55x asymmetric: entering Greenhollow cost 68.4 ms and leaving it
cost 3743.4 ms, through the same door. Only one direction rebuilt the overworld.

## The change

`a1aReleaseChunks()` now **trims** the cache to the chunks the departure window intersects
and drops the rest, instead of dropping everything. Supporting edits: `a1aRects` records the
window it just described (`A1A.win`), and the trim is latched (`A1A.released`) so it runs
once per departure rather than on every 80 ms tick.

### What invalidates the retained cache

Nothing, within a session — and that is a property of the data, not a hope:

- **The key is the manifest chunk id.** Its value is the decoded content of a static URL,
  `act1-hifi/chunks/<layer>/<id>.webp`, which is a pure function of the id. The manifest is
  fetched exactly once (`A1A.req` latches), so the id→URL mapping cannot move.
- **It holds no map data.** `mapData` is mutated in place by `consolidateMapData` and by
  `__ACT1_WORLD_MAP__.apply()`. A chunk image is unaffected by both: `a1aChunkAt` maps a cell
  to a chunk purely through `manifest.semanticBounds`, never through a tile value. This is the
  distinction from the `owmBakeFor` memo that previously poisoned itself for a whole session by
  keying on `mapData` array identity while the contents were mutated underneath it.
- **Nothing downstream is cached.** The composition of these images into the window is redone
  from scratch on the reskin that every map swap forces (`updateTerrain(scene,true)`), so a
  retained image can only ever be re-blitted, never re-shown stale.

The page load is what clears it.

### What it costs

Off-overworld residency goes from 0 to the departure window's chunks — measured at 4 (~19 MB
each), so ~79 MB held while the player is in a town or a dungeon. That is strictly below the
`A1A_MAX_CHUNKS=10` (~198 MB) the overworld already holds while being played: the change
raises the off-overworld floor without moving the peak, and the other six slots are still
dropped, which is what the original release was protecting against.

## Before / after — all six numbers

Medians of 3 interleaved runs.

| ID | What the owner feels | Before | After | Change | Target | |
|---|---|---|---|---|---|---|
| SMOOTH-1 | "It takes forever to start" | 2483.6 ms | 2491.8 ms | +8.2 ms | ≤ 1500 ms | **RED** |
| SMOOTH-2 | "It's choppy when I walk" | 59.9 fps | 59.9 fps | — | ≥ 55 fps | GREEN |
| SMOOTH-3 | "It hitches" | 18.7 ms | 18.8 ms | +0.1 ms | ≤ 33 ms | GREEN\* |
| SMOOTH-4 | "It freezes" | 2188.3 ms | **1568.0 ms** | **−620.3 ms (−28.3%)** | ≤ 100 ms | **RED** |
| SMOOTH-5 | "Doors are slow" | 3743.4 ms | **2218.3 ms** | **−1525.1 ms (−40.7%)** | ≤ 500 ms | **RED** |
| SMOOTH-6 | "It ignores my taps" | 74.1 ms | 56.9 ms | −17.2 ms | ≤ 100 ms | GREEN |

Spreads:

| ID | Before (3 runs) | After (3 runs) |
|---|---|---|
| SMOOTH-1 | 2476.3–2502.7 | 2490.7–2520.2 |
| SMOOTH-2 | 59.9–59.9 | 59.9–59.9 |
| SMOOTH-3 | 18.7–18.8 | 18.8–18.8 |
| SMOOTH-4 | 2178.9–2190.5 | 1566.8–2171.9 |
| SMOOTH-5 | 3742.1–3906.0 | 2214.8–2225.1 |
| SMOOTH-6 | 49.2–80.3 | 49.8–72.4 |

\* SMOOTH-3 is green on the metric as defined and still must not be read as "no hitching".
Its honest companions moved as follows, and they did **not** improve:

| Sub-measure | Before | After |
|---|---|---|
| S1 — first real terrain | 3433.5 ms | 3444.9 ms |
| S1 — gate that held the cover | terrain, 1129.2 ms | terrain, 1130.2 ms |
| S2 — mean fps (vs median) | 52.4 | 52.1 |
| **S3 — worst single frame** | **1204.6 ms** | **1247.4 ms** |
| **S3 — frames > 100 ms in the walk** | **2** | **2** |
| S4 — LoAF blocking | 1521.1 ms | 1516.2 ms |
| S4 — watchdog drift | 2188.3 ms | 1568.0 ms |
| S5 — overworld → town | 68.4 ms | 69.7 ms |
| **S5 — town → overworld** | **3743.4 ms** | **2218.3 ms** |
| S6 — menu open | 74.1 ms | 56.9 ms |
| S6 — battle command | 18.6 ms | 18.7 ms |

## Where the time went, mechanically

A scratch profile of one town round trip (not the probe; the probe is read-only) over the
`greenhollow → overworld` return:

| | Before | After |
|---|---|---|
| Chunk layer images re-requested on the return | **12** | **0** |
| Full procedural terrain splats on the return | **1** (3,852,288 px) | **0** |
| `vnoise` self time in the return's CPU profile | 1156 ms | not in the top 25 |
| Total images loaded across the session | 31 | 19 |
| That return, wall clock | 4581.9 ms | 2316.8 ms |

The probe's own per-run block list shows the same thing structurally. Before, each run had
**two** ~1500 ms blocks inside the SMOOTH-5 phase (run 3: 1521.1 ms at 11352 ms and 1497.9 ms
at 13560 ms). After, there is **one** (1519.2 ms at 11411 ms). An entire main-thread block was
removed, not moved.

## What is still red, and why

The residual 2218 ms return and the residual 1568 ms block are both **the same remaining
item**: `renderMap()` building 128,000 Phaser Images for the 320x400 overworld, which the CPU
profile attributes as `index-BhoGQRaA.js:53023` (~898 ms self). That is known cost source #1 in
the `smooth` skill, it is explicitly out of scope for this round, and it owns its own round and
its own proof.

Two honest corrections to the round-0 read, which assumed SMOOTH-1/4/5 were one defect:

- **SMOOTH-1 is not the terrain rebuild.** It did not move (2483.6 → 2491.8 ms), and it could
  not have: on a cold start there is nothing cached to reuse. Its gate is unchanged at ~1130 ms
  of terrain wait. SMOOTH-1 and SMOOTH-5 turned out to be different defects that shared a
  symptom.
- **SMOOTH-4 is only partly the terrain rebuild.** Removing the rebuild took 620 ms off it; the
  rest is the 128,000-object build. SMOOTH-4 remains the binding constraint at 15.7x target.
- **The 1.2 s frame in the 10 s walk is untouched** (1204.6 → 1247.4 ms, still 2 frames over
  100 ms). That is the hero walking into genuinely new terrain whose chunks were never loaded —
  a different problem from returning to terrain that *was* loaded, and not something retention
  can address.

## Non-regression evidence

`npm run test:map-engine` and `./scripts/ship-gate.sh .` both green on the committed tree; the
frozen bundle's md5 is unchanged; the extracted Act 1 plate sha is unchanged
(`205dbe88d80f31260044b466c5a4cab59aa828377010d9e834223267e6cec434`), so world generation did
not move.

Behavioural round trips, driven through the real d-pad and the real doors (no console
`loadMap()`), run identically against **both** builds:

| Place | Enterable | Returned to overworld | `dqterrain` hash before vs after | `dqcanopy` hash | Collision hash | Blocked cells |
|---|---|---|---|---|---|---|
| Greenhollow (town) | yes | yes | identical | identical | identical | 17560 |
| Millbrook (town) | yes | yes | identical | identical | identical | 17560 |
| Port Sapphire (town) | yes | yes | identical | identical | identical | 17560 |
| Sunken Cellar (dungeon) | yes | yes | identical | identical | identical | 17560 |

The terrain comparison is on the live `dqterrain` / `dqcanopy` canvas textures rather than a
screenshot, so the hero's animation frame and the HUD can neither mask nor manufacture a
difference. Collision is hashed by asking `scene.canMove` for all 26,936 cells of the Act 1
plate — the same field the forest, the gates and the town entries are made of.

Cross-build, the same terrain hashes appear on both sides (Greenhollow `cd80bafa` /
`cb7f1dc5`, Millbrook `f73a5f2a` / `717f097c`, Port Sapphire `f40be8af` / `8c347972`, Sunken
Cellar `21db5531` / `cf6dcdc6`), and the full-page "after" screenshots for all three towns are
**byte-identical** between base and fix. Zero page errors on all eight round trips.

Screenshots: `<scratch>/shots/{base,fix}-<place>-{1-before,2-inside,3-after}.png`.

## Observed in passing, NOT fixed here

Returning to the overworld from a dungeon leaves the dungeon's fog vignette drawn over the
overworld. It is present **identically on `main` @ `c7143c6`** — see
`base-sunkenCellar-3-after.png` against `fix-sunkenCellar-3-after.png`, which differ only in
the hero's animation frame — so it is pre-existing and not a regression from this round. It is
left alone deliberately: a round that changes two things cannot attribute its own result.

## Reproducing

```sh
python3 scripts/serve_dist.py --port 5174 &          # this branch's dist/
python3 scripts/serve_dist.py --port 5175 --dir <base dist> &
node scripts/perf_probe.cjs --compare "base=http://127.0.0.1:5175/,fix=http://127.0.0.1:5174/" --runs 3
```

The two `dist/` trees differ in exactly one file, `dq-tiles.js`, which is what makes the
comparison attributable.
