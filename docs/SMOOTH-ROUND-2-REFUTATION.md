# Round 2 refutation — independent verification of the 128,000-object removal

Adversarial verification of `worktree-agent-ae3ba8187c2b5d379` @ `4930910` against
`main` @ `7910642`. The verifier did not write the change and was briefed to refute it.

**Verdicts: SMOOTH-4 win CONFIRMED. SMOOTH-5 win CONFIRMED. Correctness/no-blanking
CONFIRMED on every drivable path. No visual degradation CONFIRMED, re-derived rather than
re-read. Recommendation: MERGE WITH FOLLOW-UP.**

Both `dist/` trees built independently with `./scripts/build-dist.sh` in separate worktrees;
`diff -rq` reports exactly one differing file, `dist/dq-tiles.js`. Bundle md5
`60d90b63607b6e6980eb170aeeed445e` both sides. Renderer `ANGLE Metal Renderer: Apple M1`.
Load 1.71-3.53 at every run start, ceiling 10, **zero runs voided, zero page errors in 32
runs**. Probe sha `0a429d62...` verified unchanged after all measurement.

## Two interleaved 8x8 batches, 16 runs per side

| metric | base median (spread) | fix median (spread) | overlap | p (MWU) |
|---|---|---|---|---|
| SMOOTH-1 continue-rel | 2501.3 (2483.6-2537.7) | 2485.4 (2438.7-2714.6) | OVERLAP | 0.318 |
| SMOOTH-2 median fps | 59.9 (59.9-59.9) | 59.9 (59.9-59.9) | OVERLAP | 0.985 |
| S2 mean fps | 52.9 (46.7-53.2) | 52.0 (51.5-53.0) | OVERLAP | 0.105 |
| SMOOTH-3 p99 | 18.7 (18.7-21.0) | 18.8 (18.7-18.9) | OVERLAP | 0.014 |
| S3 worst frame | 1141.7 (1068.4-1294.5) | **1260.0** (1122.9-1327.8) | OVERLAP | **0.010** |
| S3 frames >100 ms | 2 (2-3) | 2 (2-2) | OVERLAP | 0.559 |
| **SMOOTH-4** | **2062.3 (1563.2-2198.0)** | **1249.1 (1112.5-1307.4)** | **NO OVERLAP** | <0.001 |
| S4 LoAF blocking | 1517.0 (1510.7-1527.6) | 1206.0 (1070.1-1265.0) | **NO OVERLAP** | <0.001 |
| **SMOOTH-5** | **2108.1 (2096.7-2240.7)** | **1143.8 (1009.8-1174.7)** | **NO OVERLAP** | <0.001 |
| SMOOTH-6 worst | 51.0 (48.4-77.0) | 60.8 (34.7-88.3) | OVERLAP | 0.356 |
| S1 first real terrain | 3447.1 (3422.4-3489.3) | 2412.3 (2376.3-2427.5) | **NO OVERLAP** | <0.001 |
| S1 terrain gate | 1133.1 (1127.2-1154.2) | 111.3 (108.1-132.0) | **NO OVERLAP** | <0.001 |
| tile container objects | 128,000 | 0 | — | — |

Base's low mode (~1563-1569 ms, 3 of 16 runs) still sits above the fix's maximum (1307.4).

## The flat mean fps, explained

The author flagged this as unexplained. It has two measured parts.

**The metric cannot show it.** Across all 32 runs `meanFps == walk frame count / 10` to
within 0.25 (0 of 32 deviate). The walk window is fixed at 10 s, so mean fps *is* the frame
count, which is set entirely by the two >100 ms stall frames; every other frame is pinned at
the vsync interval (median frame 16.6/16.7 ms on both builds). The probe deliberately does
not pass `--disable-frame-rate-limit`. **Work removed from a frame that already finished
inside its budget cannot appear in any fps number.**

**The work was removed, and it was large.** CDP CPU profile, 100 us sampling, identical 10 s
walk (same start `[69,278]`, same end `[89,277]`):

| | base | fix |
|---|---|---|
| main-thread **busy** | **4406.4 ms** | **1854.8 ms** |
| idle | 5860.6 ms | 8275.0 ms |
| `C @bundle:10619` (Phaser list walk) | 753.6 ms | absent |
| `render @bundle:40477` | 738.6 ms | absent |
| `updateVisibleTiles @78696` | 82.8 ms | absent |

~2.55 s of CPU removed per 10 s of walking, 58% of main-thread busy time, and the frame rate
correctly does not move because there was headroom.

## The SMOOTH-3 outlier is machine noise

16 consecutive fix runs, p99: `[18.8, 18.9, 18.7, 18.8, 18.9, 18.9, 18.9, 18.8, 18.8, 18.7,
18.7, 18.8, 18.9, 18.7, 18.8, 18.8]` — zero outliers. An identically-shaped outlier landed on
**base** in batch 2 (p99 21.0, mean fps 46.7, worst-5 `[1244.9, 883.5, 112.7, 89.5, 21.0]`).
Pooled: 1 event in 22 fix runs, 1 event in 22 base runs.

## Scoping confirmed — no equivalent hole

All **45** registry maps extracted: `overworld` is the **only** 320x400 map. Everything else
is 16x16, 40x40 or 100x100, and `gradeScaledSize` is the identity. `currentMapId` cannot be
stale — `loadMap` assigns it on its first line, before `renderMap()` at :78531. `a1dApply`'s
direct `renderMap()` call (dq-tiles:1944) is dungeon-only.

The author's rejection of `isOverworld()` is correct: it matches `stormreachIsles`,
`frostfallPeaks`, `sunkenTempleIsle`, `twilightRealm`, `sunkenTempleVillage` and
`sunkenTempleDungeon`, and returns true on `cullingEnabled`, which is set for
`portal-overworld` too.

## `tileGrid` / `tileLayer` consumers — full audit

All **67** bundle `tileGrid` sites, all **7** `tileLayer` sites, **8** `tileGrid` sites in
`dq-tiles.js`, 1 in `act1-world-map.js`. Every unguarded bundle read is bounded by a *row's*
length, so empty rows are safe at `updateVisibleTiles` (:78708), `updateFogVisibility`
(:81535), the darkness-pulse (:81673), lava (:81741), ice (:81848/:81852) and mirror-room
(:82144/:82159) loops.

**The author enumerated only the three bundle `getAt` sites and three structural readers, not
`dq-tiles.js`'s own eight consumers.** All eight are safe, but not always for the stated
reasons: `owSpecialObjects` (:1339, the overworld path) short-circuits on `undefined` and is
neutral with 0 sprites; `sceneKind` (:3603) is unreachable on the overworld; `dngThemeKey`
(:3316) is dungeon-only; `tick`'s guard (:3652) and `terrainReady` (:3823) both need
`tileGrid.length`, which is 400 — **this is what keeping empty rows buys, and it is correct.**

## Correctness — driven, not asserted

Live canvas **textures** re-hashed (FNV-1a over every byte of `getImageData`), BFS
pathfinding over `scene.canMove` driving the shipped d-pad via synthesised `KeyboardEvent` +
`__DQ_STICK__`. No console `loadMap()`. Disclosed harness controls, identical on both builds:
`encounterRateMultiplier = 0`, `boss.giantToad.defeated` seeded to open the Crystal Cave gate.

Re-derived independently: overworld `canMove` hash **`317b8b0a`**, **78,711** blocked,
`mapData` hash `45756f2a`, `dqterrain cd80bafa@2112x1824`, `dqcanopy cb7f1dc5@2112x1824`,
minimap graphics + player dot present. **All identical, 128,000 objects vs 0.**

| door | entered base/fix | inside | exited | returned identical |
|---|---|---|---|---|
| Greenhollow (town) | yes / yes | 256 obj, `3db83013`, 100 blocked | yes / yes | yes |
| Millbrook (town) | yes / yes | 256 obj, `5f1abbd5`, 98 blocked | yes / yes | yes |
| Misty Grotto (dungeon) | yes / yes | 1,496 obj, `69615865`, 1,184 blocked | not drivable, either build | — |
| Port Sapphire, Sunken Cellar, Whispering Woods Cave, Coastal Reef, Crystal Cave | not reached | — | — | — |

**Known harness limitation, pre-existing and identical on both builds:** the mover refuses
cells `canMove` reports passable, sticking at exactly `(124,358)->(125,357)` and
`(69,330)->(70,330)`. Misty Grotto has one tile-6 exit cell and stepping onto it fired no
transition on either build. **A dungeon exit remains unverified for the third round running.**

## Not deferred — six consecutive cycles

| cycle | base return (ms) | fix return (ms) | base obj | fix obj |
|---|---|---|---|---|
| 1 | 2933 | 1802 | 128,000 | 0 |
| 2 | 3017 | 1808 | 128,000 | 0 |
| 3 | 2914 | 1730 | 128,000 | 0 |
| 4 | 2903 | 1763 | 128,000 | 0 |
| 5 | 2905 | 1757 | 128,000 | 0 |
| 6 | 2966 | 1755 | 128,000 | 0 |

No overlap on any cycle, no decay. Splats 0/0 throughout. `dqterrain`/`dqcanopy`
byte-identical every cycle on both builds. Hero lands at `[69,257]` every time.

## Residual attribution — round 3's target

Return leg profiled alone, 3 legs per build:

| self time | base | fix |
|---|---|---|
| `C @bundle:53022` (`Utils.Array.Add`, from `tileLayer.add`) | **905-930 ms** | **absent** |
| `waterField @dq-tiles.js:554` | 374-415 ms | 375-413 ms |
| `et @dq-tiles.js:262` | 229-235 ms | 325-341 ms |
| `owmBuild @dq-tiles.js:2500/2579` | 75-167 ms | 63-178 ms |
| `vnoise @dq-tiles.js:71` | 83-90 ms | 82-94 ms |
| `Ep @bundle:73277` (overworld map regen) | ~33 ms | ~10 ms |
| **total busy** | **2326-2510 ms** | **1300-1367 ms** |

The removed ~915 ms is `Phaser.Utils.Array.Add`, which does an `indexOf` on every insert:
**the 128,000-image build was quadratic in the container.** The residual ~1.2 s is the
dq-tiles procedural field evaluation. The verifier's own hypothesis that `Ep()`'s 320x400
regeneration was the residual was tested and **wrong** (~10 ms).

## Non-regression, run by the verifier on the committed tree

`npm run test:map-engine` PASS (9 suites). `./scripts/ship-gate.sh .` PASS (74 pins, both
Act 1 overlay verifies, iOS payload). Bundle md5 unchanged. Act 1 plate sha `205dbe88...`
unchanged, so world generation did not move. All four sha pins match `public/dq-tiles.js`
(`cb20a9e5...`, 292,273 B).

## Follow-ups (none blocking)

1. Correct the `wake()` safety note in `docs/SMOOTH-ROUND-2.md`. **Done** — see its banner.
2. Restate the walk claim: worst frame grows 1141.7 -> 1260.0 ms, p = 0.010. **Done.**
3. Round 3 targets `waterField`/`et`/`fieldAt`/`owmBuild`, not `Ep()`.
4. SMOOTH-1's binding gate is now the boot cover (`cover-gone == SMOOTH-1` in 16 of 16 fix runs).
5. A dungeon exit and 5 of 8 doors remain undriven, blocked by a pre-existing
   `canMove`-vs-mover disagreement. Worth fixing the harness or the engine before round 3.
6. Browser numbers only. No simulator booted.
